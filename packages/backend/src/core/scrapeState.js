// ─── Scrape state (main German pipeline) ───────────────────────────────────
//
// Change detection for the ATS configs' _fetchCompany methods, so a board that
// hasn't changed since the last run is skipped BEFORE its jobs enter
// _allJobsQueue — they never consume RAM and never reach the AI pipeline.
//
// Two layers, both inside _fetchCompany:
//   1. HTTP ETag — If-None-Match on the request; a 304 means nothing was even
//      downloaded. Additive: platforms that don't emit ETags just never 304.
//   2. Content hash — SHA-256 over sorted "id|title|location"-style
//      fingerprints of the RAW (pre-filter) job list. Descriptions are
//      deliberately excluded: copy edits shouldn't force a reprocess.
//
// The scrapeState collection is SHARED with ejg-remote-scraper (same document
// shape: { ats, slug, contentHash, ... } with a unique { slug, ats } index).
// Main-pipeline entries prefix the ats field with "de_" so the two pipelines
// never collide: remote writes ats:"greenhouse", we write ats:"de_greenhouse".

import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { connectToDb } from '../db/connection.js';

const STATE_COLLECTION = 'scrapeState';
const MAIN_PIPELINE_PREFIX = 'de_';

function prefixedAts(ats) {
    return `${MAIN_PIPELINE_PREFIX}${ats}`;
}

/** Map key for a company — matches the loaded Map's keys. */
export function stateKey(ats, slug) {
    return `${prefixedAts(ats)}|${slug}`;
}

/**
 * Loads this platform's states into a Map keyed by stateKey(ats, slug).
 * One query per platform at initialize() time; the per-company loop then
 * performs zero database round-trips.
 */
export async function loadScrapeStates(ats) {
    const db = await connectToDb();
    // Safe to call every run; matches the remote scraper's index.
    await db.collection(STATE_COLLECTION).createIndex(
        { slug: 1, ats: 1 },
        { unique: true, name: 'slug_ats_unique' },
    );
    const docs = await db.collection(STATE_COLLECTION).find({ ats: prefixedAts(ats) }).toArray();
    const stateMap = new Map();
    for (const doc of docs) stateMap.set(`${doc.ats}|${doc.slug}`, doc);
    console.log(`[ScrapeState] ${ats}: loaded ${stateMap.size} company states`);
    return stateMap;
}

/**
 * SHA-256 over deterministically sorted fingerprint strings (one per job,
 * e.g. "id|title|location"). Sorting uses code-unit comparison — never
 * localeCompare, whose ordering is locale-dependent and would make the same
 * board hash differently on different machines.
 */
export function computeContentHash(fingerprints) {
    const sorted = [...(fingerprints || [])].sort((a, b) => {
        if (a === b) return 0;
        return a < b ? -1 : 1;
    });
    return createHash('sha256').update(sorted.join('\n'), 'utf8').digest('hex');
}

/**
 * Bulk-saves a platform's states in one round-trip.
 * Each entry: { slug, etag, contentHash, jobCount, changed }.
 * `changed: true` also stamps lastChangedAt; unchanged entries only refresh
 * lastCheckedAt (and the etag, which can rotate without content changing).
 */
export async function saveScrapeStatesBulk(ats, states) {
    if (!states || states.length === 0) return 0;

    // Inside a scrapeSite() run the write waits until the site has finished;
    // see withDeferredScrapeStates() below.
    const deferred = deferredStore.getStore();
    if (deferred) {
        deferred.push([ats, states]);
        return 0;
    }

    const db = await connectToDb();
    const now = new Date();
    const operations = states.map(({ slug, etag, contentHash, jobCount, changed }) => ({
        updateOne: {
            filter: { slug, ats: prefixedAts(ats) },
            update: {
                $set: {
                    etag: etag ?? null,
                    contentHash: contentHash ?? null,
                    jobCount: jobCount ?? 0,
                    lastCheckedAt: now,
                    ...(changed ? { lastChangedAt: now } : {}),
                },
                $setOnInsert: { slug, ats: prefixedAts(ats), createdAt: now },
            },
            upsert: true,
        },
    }));

    const result = await db.collection(STATE_COLLECTION).bulkWrite(operations, { ordered: false });
    console.log(`[ScrapeState] ${ats}: saved ${states.length} states (${result.upsertedCount || 0} new, ${result.modifiedCount || 0} updated)`);
    return (result.upsertedCount || 0) + (result.modifiedCount || 0);
}

// ─── Deferred commit ───────────────────────────────────────────────────────
//
// Configs hash their boards in initialize(), before a single job is processed.
// Writing those hashes immediately meant a run cut short (Gemini budget spent,
// a crash) marked every fetched board as "seen": the next run found them
// unchanged and skipped them, so their unprocessed jobs never arrived until
// the company happened to edit its board. scrapeSite() now defers the writes
// and commits them only when the site was drained completely.
//
// The buffer lives in AsyncLocalStorage, one per scrapeSite() call: sources
// scrape side by side, and a shared buffer would let one site commit (or
// discard) another site's boards.

const deferredStore = new AsyncLocalStorage();

/** Runs `fn` with saveScrapeStatesBulk() calls buffered for this call only. */
export function withDeferredScrapeStates(fn) {
    return deferredStore.run([], fn);
}

/** Write everything buffered in the current withDeferredScrapeStates() call. */
export async function commitScrapeStates() {
    const pending = (deferredStore.getStore() || []).splice(0);
    // Outside the store, or saveScrapeStatesBulk() would just buffer them again.
    await deferredStore.exit(async () => {
        for (const [ats, states] of pending) await saveScrapeStatesBulk(ats, states);
    });
}

/** Drop the buffer, so the next run re-checks these boards. */
export function discardScrapeStates() {
    const pending = (deferredStore.getStore() || []).splice(0);
    return pending.reduce((n, [, states]) => n + states.length, 0);
}

// ─── Seen postings (aggregated feeds) ──────────────────────────────────────
//
// Aggregated sources such as the Bundesagentur feed list thousands of
// postings whose description costs one extra request each. A posting the AI
// rejected is never saved, so without a record of it every run would fetch its
// description again just to hit the fingerprint cache. scrapeSeen remembers
// which postings were already fetched; a TTL lets them expire once they are
// old enough to have dropped off the feed anyway.

const SEEN_COLLECTION = 'scrapeSeen';
const SEEN_TTL_DAYS = 60;
let seenIndexReady = false;

async function seenCollection() {
    const db = await connectToDb();
    const collection = db.collection(SEEN_COLLECTION);
    if (!seenIndexReady) {
        seenIndexReady = true;
        await collection.createIndex({ seenAt: 1 }, { expireAfterSeconds: SEEN_TTL_DAYS * 86_400 }).catch(() => {});
        await collection.createIndex({ source: 1 }).catch(() => {});
    }
    return collection;
}

/** Every posting key already fetched for `source`. */
export async function loadSeenPostings(source) {
    const collection = await seenCollection();
    const docs = await collection.find({ source }, { projection: { key: 1 } }).toArray();
    return new Set(docs.map(d => d.key));
}

/** Forgets a posting so the next run fetches it again (e.g. its AI call failed). */
export async function unmarkPostingSeen(source, key) {
    const collection = await seenCollection();
    await collection.deleteOne({ _id: `${source}|${key}` });
}

/** Records one fetched posting. Idempotent. */
export async function markPostingSeen(source, key) {
    const collection = await seenCollection();
    await collection.updateOne(
        { _id: `${source}|${key}` },
        { $set: { source, key, seenAt: new Date() } },
        { upsert: true },
    );
}
