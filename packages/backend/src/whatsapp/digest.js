/**
 * WhatsApp Channel post.
 *
 * Runs every 2nd day at 08:00 UTC and posts exactly 2 jobs to the WhatsApp
 * channel via wacli, as the logo image with the job list as its caption.
 * Jobs are picked at random from the active German jobs
 * (remote jobs excluded), preferring two different categories and weighting
 * jobs posted in the last 30 days 3x. Sent jobs are tracked in the
 * `whatsappSentJobs` collection so nothing repeats until the pool is cycled.
 *
 * Gated entirely on WHATSAPP_CHANNEL_JID. Unset, this is a no-op.
 *
 * CLI flags (for testing):
 *   --dry-run     Pick and print the post, do not send or record it.
 *
 * Usage:
 *   node src/whatsapp/digest.js --dry-run
 *   node src/whatsapp/digest.js
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WHATSAPP_CHANNEL_JID } from '../env.js';
import { isWacliConnected, sendImageToChannel, sendTextToChannel } from './client.js';
import { formatWhatsAppPost } from './formatter.js';

const LOG = '[WhatsApp]';
// Copy of frontend/public/apple-touch-icon.png, bundled so the backend can be
// deployed without the frontend package.
const LOGO_PATH = fileURLToPath(new URL('./assets/logo.png', import.meta.url));
const SENT_COLLECTION = 'whatsappSentJobs';
// Reset before every job has been sent: some sent IDs belong to jobs that
// have since been removed, so 100% of the active pool may never be reached.
const RESET_THRESHOLD = 0.8;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Sent-job tracking ────────────────────────────────────────────────────
// Schema: { jobId: String (unique), sentAt: Date, postId: String }

async function ensureSentIndex(db) {
    await db.collection(SENT_COLLECTION).createIndex({ jobId: 1 }, { unique: true }).catch(() => {});
}

/** @returns {Promise<Set<string>>} every jobId already posted this cycle. */
export async function getAlreadySentJobIds(db) {
    const docs = await db.collection(SENT_COLLECTION)
        .find({}, { projection: { _id: 0, jobId: 1 } })
        .toArray();
    return new Set(docs.map(d => d.jobId));
}

/** Record the jobs of one post, sharing a random postId. */
export async function markJobsAsSent(db, jobIds) {
    if (!jobIds.length) return;
    await ensureSentIndex(db);
    const sentAt = new Date();
    const postId = randomBytes(8).toString('hex');
    // Upsert rather than insert so a stray duplicate cannot fail the write.
    await db.collection(SENT_COLLECTION).bulkWrite(jobIds.map(id => ({
        updateOne: {
            filter: { jobId: String(id) },
            update: { $set: { jobId: String(id), sentAt, postId } },
            upsert: true,
        },
    })), { ordered: false });
}

/** Clear the tracking so the next post starts a fresh cycle. */
export async function resetSentTracking(db) {
    await db.collection(SENT_COLLECTION).deleteMany({});
}

// ─── Selection ────────────────────────────────────────────────────────────

function weightedRandomPick(jobs) {
    const now = Date.now();
    const weighted = jobs.map(j => ({
        job: j,
        weight: (now - new Date(j.PostedDate).getTime()) < THIRTY_DAYS_MS ? 3 : 1,
    }));
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;
    for (const w of weighted) {
        random -= w.weight;
        if (random <= 0) return w.job;
    }
    return weighted[weighted.length - 1].job;
}

function shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * Pick 2 jobs: one each from 2 random categories when the pool spans at
 * least 2, otherwise 2 distinct jobs from the single remaining category.
 * @param {object[]} pool at least 2 jobs
 * @returns {[object, object]}
 */
function pickTwoJobs(pool) {
    const byCategory = new Map();
    for (const job of pool) {
        const cat = job.Category || 'Other';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(job);
    }

    if (byCategory.size >= 2) {
        const [catA, catB] = shuffle([...byCategory.keys()]);
        return [weightedRandomPick(byCategory.get(catA)), weightedRandomPick(byCategory.get(catB))];
    }

    const first = weightedRandomPick(pool);
    const second = weightedRandomPick(pool.filter(j => j !== first));
    return [first, second];
}

// ─── Job loading ──────────────────────────────────────────────────────────

/**
 * Active German jobs (no remote jobs). Falls back to Mongo when the cache is
 * not initialised, e.g. a CLI run.
 */
async function loadActiveJobs(db) {
    try {
        const { getAllJobs } = await import('../cache/index.js');
        return getAllJobs();
    } catch (err) {
        console.warn(`${LOG} jobs cache unavailable (${err.message}), reading Mongo directly`);
        return db.collection('jobs')
            .find({ Status: 'active' }, { projection: { Description: 0, DescriptionHtml: 0 } })
            .toArray();
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────

/**
 * @param {{ dryRun?: boolean }} opts
 * @returns {Promise<{ sent: boolean, jobIds?: string[], skipped?: string, error?: string, dryRun?: boolean }>}
 */
export async function runWhatsAppDigest(opts = {}) {
    const { dryRun = false } = opts;

    if (!dryRun && !(await isWacliConnected())) {
        console.log(`${LOG} wacli not connected, skipping post`);
        return { sent: false, skipped: 'not-connected' };
    }

    if (!WHATSAPP_CHANNEL_JID) {
        console.log(`${LOG} No channel JID configured, skipping`);
        return { sent: false, skipped: 'no-jid' };
    }

    const { connectToDb } = await import('../db/connection.js');
    const db = await connectToDb();

    const jobs = (await loadActiveJobs(db)).filter(j => j && j._id);
    if (jobs.length < 2) {
        console.log(`${LOG} Fewer than 2 active jobs, skipping`);
        return { sent: false, skipped: 'no-jobs' };
    }

    const sentIds = await getAlreadySentJobIds(db);
    let unsent = jobs.filter(j => !sentIds.has(String(j._id)));

    if (unsent.length < 2 || sentIds.size >= jobs.length * RESET_THRESHOLD) {
        console.log(`${LOG} ${sentIds.size}/${jobs.length} jobs already sent, resetting cycle`);
        if (!dryRun) await resetSentTracking(db);
        unsent = jobs;
    }

    const [job1, job2] = pickTwoJobs(unsent);
    const message = formatWhatsAppPost(job1, job2);
    const jobIds = [String(job1._id), String(job2._id)];

    if (dryRun) {
        console.log(`${LOG} DRY RUN: post WOULD be sent (${unsent.length} unsent jobs in pool):\n`);
        console.log(message);
        return { sent: false, jobIds, dryRun: true };
    }

    // Post as the logo image with the text as its caption; fall back to plain
    // text if the logo file is missing so a bad deploy never skips a post.
    const result = existsSync(LOGO_PATH)
        ? await sendImageToChannel(LOGO_PATH, message)
        : await sendTextToChannel(message);
    if (!result.success) {
        // Not recorded as sent, so these jobs stay eligible for the next run.
        console.error(`${LOG} Post failed: ${result.error}`);
        return { sent: false, jobIds, error: result.error };
    }

    await markJobsAsSent(db, jobIds);
    console.log(`${LOG} Post sent: ${job1.JobTitle} + ${job2.JobTitle}`);
    return { sent: true, jobIds };
}

// ─── CLI entry: `node src/whatsapp/digest.js [--dry-run]` ─────────────────
const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
const entryFile = process.argv[1]?.replace(/\\/g, '/');
const isCli = thisFile === entryFile || thisFile === '/' + entryFile;

if (isCli) {
    const { client: mongoClient } = await import('../db/connection.js');
    runWhatsAppDigest({ dryRun: process.argv.includes('--dry-run') })
        .then(() => mongoClient.close())
        .then(() => process.exit(0))
        .catch(err => {
            console.error(`${LOG} Fatal error:`, err);
            mongoClient.close().finally(() => process.exit(1));
        });
}
