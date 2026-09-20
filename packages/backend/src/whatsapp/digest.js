/**
 * WhatsApp Channel post.
 *
 * Runs twice daily (9am + 5pm CET) and posts exactly 1 job to the WhatsApp
 * channel via wacli, as the logo image with the job info as its caption.
 * Jobs are picked at random from the active German jobs (remote jobs excluded),
 * weighting jobs posted in the last 30 days 3x. Sent jobs are tracked in the
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
const LOGO_PATH = fileURLToPath(new URL('./assets/logo.png', import.meta.url));
const SENT_COLLECTION = 'whatsappSentJobs';
const RESET_THRESHOLD = 0.8;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Sent-job tracking ────────────────────────────────────────────────────

async function ensureSentIndex(db) {
    await db.collection(SENT_COLLECTION).createIndex({ jobId: 1 }, { unique: true }).catch(() => {});
}

export async function getAlreadySentJobIds(db) {
    const docs = await db.collection(SENT_COLLECTION)
        .find({}, { projection: { _id: 0, jobId: 1 } })
        .toArray();
    return new Set(docs.map(d => d.jobId));
}

export async function markJobsAsSent(db, jobIds) {
    if (!jobIds.length) return;
    await ensureSentIndex(db);
    const sentAt = new Date();
    const postId = randomBytes(8).toString('hex');
    await db.collection(SENT_COLLECTION).bulkWrite(jobIds.map(id => ({
        updateOne: {
            filter: { jobId: String(id) },
            update: { $set: { jobId: String(id), sentAt, postId } },
            upsert: true,
        },
    })), { ordered: false });
}

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

// ─── Job loading ──────────────────────────────────────────────────────────

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
    if (jobs.length < 1) {
        console.log(`${LOG} No active jobs, skipping`);
        return { sent: false, skipped: 'no-jobs' };
    }

    const sentIds = await getAlreadySentJobIds(db);
    let unsent = jobs.filter(j => !sentIds.has(String(j._id)));

    if (unsent.length < 1 || sentIds.size >= jobs.length * RESET_THRESHOLD) {
        console.log(`${LOG} ${sentIds.size}/${jobs.length} jobs already sent, resetting cycle`);
        if (!dryRun) await resetSentTracking(db);
        unsent = jobs;
    }

    const job = weightedRandomPick(unsent);
    const message = formatWhatsAppPost(job);
    const jobIds = [String(job._id)];

    if (dryRun) {
        console.log(`${LOG} DRY RUN: post WOULD be sent (${unsent.length} unsent jobs in pool):\n`);
        console.log(message);
        return { sent: false, jobIds, dryRun: true };
    }

    const result = existsSync(LOGO_PATH)
        ? await sendImageToChannel(LOGO_PATH, message)
        : await sendTextToChannel(message);

    if (!result.success) {
        console.error(`${LOG} Post failed: ${result.error}`);
        return { sent: false, jobIds, error: result.error };
    }

    await markJobsAsSent(db, jobIds);
    console.log(`${LOG} Post sent: ${job.JobTitle}`);
    return { sent: true, jobIds };
}

// ─── CLI entry ────────────────────────────────────────────────────────────
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