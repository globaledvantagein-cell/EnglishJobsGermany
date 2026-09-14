/**
 * Daily WhatsApp Channel digest.
 *
 * Runs 08:00 UTC (one hour after the 06:00 scrape) and posts every job that
 * entered the caches in the look-back window to the WhatsApp channel via
 * WuzAPI.
 *
 * Gated entirely on WHATSAPP_CHANNEL_JID. Unset, this is a no-op.
 *
 * CLI flags (for testing):
 *   --dry-run     Format and print the messages, do not send.
 *   --days=<n>    Look-back window in days (default 1).
 *
 * Usage:
 *   node src/whatsapp/digest.js --dry-run
 *   node src/whatsapp/digest.js --days=3
 */
import { WHATSAPP_CHANNEL_JID } from '../env.js';
import { isWuzAPIConnected, sendTextToChannel } from './client.js';
import { formatJobDigest } from './formatter.js';

const LOG = '[WhatsApp]';

/** Best-effort "when did this job appear": createdAt first, PostedDate as fallback. */
function jobTimestamp(job) {
    for (const v of [job.createdAt, job.PostedDate]) {
        if (!v) continue;
        const t = new Date(v).getTime();
        if (!Number.isNaN(t)) return t;
    }
    return null;
}

function sortNewestFirst(jobs) {
    return [...jobs].sort((a, b) => (jobTimestamp(b) ?? 0) - (jobTimestamp(a) ?? 0));
}

/**
 * Collect jobs from both caches newer than `since`. Each cache is read
 * defensively: if the German cache is not initialised (e.g. a CLI run) we
 * fall back to Mongo for that source rather than failing the whole digest.
 */
async function collectNewJobs(since) {
    const cache = await import('../cache/index.js');
    const seen = new Set();
    const out = [];

    const take = (jobs) => {
        for (const job of jobs) {
            const key = String(job._id ?? job.JobID);
            if (seen.has(key)) continue;
            const t = jobTimestamp(job);
            if (t === null || t < since) continue;
            seen.add(key);
            out.push(job);
        }
    };

    // German jobs
    try {
        take(cache.getAllJobs());
    } catch (err) {
        console.warn(`${LOG} jobs cache unavailable (${err.message}), reading Mongo directly`);
        const { connectToDb } = await import('../db/connection.js');
        const db = await connectToDb();
        take(await db.collection('jobs')
            .find({ Status: 'active' }, { projection: { Description: 0, DescriptionHtml: 0 } })
            .toArray());
    }

    // Remote jobs
    try {
        take(cache.getAllRemoteJobs());
    } catch (err) {
        console.warn(`${LOG} remote cache unavailable (${err.message}), skipping remote jobs`);
    }

    return sortNewestFirst(out);
}

/**
 * @param {{ dryRun?: boolean, days?: number }} opts
 * @returns {Promise<{ jobs: number, messages: number, sent: number, failed: number, skipped?: string }>}
 */
export async function runWhatsAppDigest(opts = {}) {
    const { dryRun = false, days = 1 } = opts;

    if (!WHATSAPP_CHANNEL_JID) {
        console.log(`${LOG} No channel JID configured, skipping`);
        return { jobs: 0, messages: 0, sent: 0, failed: 0, skipped: 'no-jid' };
    }

    if (!dryRun && !(await isWuzAPIConnected())) {
        console.log(`${LOG} WuzAPI not connected, skipping digest`);
        return { jobs: 0, messages: 0, sent: 0, failed: 0, skipped: 'not-connected' };
    }

    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const newJobs = await collectNewJobs(since);

    if (newJobs.length === 0) {
        console.log(`${LOG} No new jobs in last ${days === 1 ? '24h' : `${days} days`}, skipping`);
        return { jobs: 0, messages: 0, sent: 0, failed: 0, skipped: 'no-jobs' };
    }

    const messages = formatJobDigest(newJobs);

    if (dryRun) {
        console.log(`${LOG} DRY RUN: ${newJobs.length} job(s) in ${messages.length} message(s) WOULD be sent:\n`);
        messages.forEach((m, i) => {
            console.log(`── message ${i + 1}/${messages.length} ──────────────────────`);
            console.log(m);
            console.log('');
        });
        return { jobs: newJobs.length, messages: messages.length, sent: 0, failed: 0, dryRun: true };
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < messages.length; i++) {
        try {
            const result = await sendTextToChannel(messages[i]);
            if (result.success) {
                sent++;
            } else {
                failed++;
                console.error(`${LOG} message ${i + 1}/${messages.length} failed: ${result.error}`);
            }
        } catch (err) {
            // sendTextToChannel never throws, but stay defensive: one bad
            // chunk must not abort the rest.
            failed++;
            console.error(`${LOG} message ${i + 1}/${messages.length} threw: ${err?.message || err}`);
        }
    }

    console.log(`${LOG} Digest sent: ${newJobs.length} jobs in ${sent} messages` +
        (failed ? ` (${failed} failed)` : ''));

    return { jobs: newJobs.length, messages: messages.length, sent, failed };
}

// ─── CLI entry: `node src/whatsapp/digest.js [--dry-run] [--days=N]` ──────
function parseArgs() {
    const flags = { dryRun: false, days: 1 };
    for (const a of process.argv.slice(2)) {
        if (a === '--dry-run') flags.dryRun = true;
        else if (a.startsWith('--days=')) flags.days = Number(a.slice('--days='.length)) || 1;
    }
    return flags;
}

const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
const entryFile = process.argv[1]?.replace(/\\/g, '/');
const isCli = thisFile === entryFile || thisFile === '/' + entryFile;

if (isCli) {
    const { client: mongoClient } = await import('../db/connection.js');
    runWhatsAppDigest(parseArgs())
        .then(() => mongoClient.close())
        .then(() => process.exit(0))
        .catch(err => {
            console.error(`${LOG} Fatal error:`, err);
            mongoClient.close().finally(() => process.exit(1));
        });
}
