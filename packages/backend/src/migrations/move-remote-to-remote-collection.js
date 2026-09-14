// ─── Move remote jobs: jobs → remoteJobs ───────────────────────────────────────
//
// Fully-remote roles were being saved into the German `jobs` collection, so they
// appeared on /jobs (a Germany on-site/hybrid board) instead of /remote-jobs.
// This relocates them.
//
// These are LEGITIMATE Germany remote jobs and keep every field exactly as it
// is — including their German city Location ("Berlin", "Remote, Munich"). No
// location cleaning happens here; clean-remote-jobs.js is a different rule that
// applies only to remote-SCRAPER rows. The cache tells the two apart by
// sourceSite (see isMainPipelineJob in remoteJobsCache.js).
//
// DRY RUN BY DEFAULT — moving requires --execute.
//
//   node src/migrations/move-remote-to-remote-collection.js            (report)
//   node src/migrations/move-remote-to-remote-collection.js --execute  (move)

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = 'job-scraper';
const SOURCE = 'jobs';
const TARGET = 'remoteJobs';
const BATCH = 500;
const SAMPLE_SIZE = 10;

const EXECUTE = process.argv.includes('--execute');
const MONGO_URI = process.env.MONGO_URI;

function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

async function run() {
    console.log('📦 Moving remote jobs from the main collection to remoteJobs');
    console.log(EXECUTE ? '   MODE: --execute (documents WILL be moved)\n' : '   MODE: dry run (no writes; pass --execute to move)\n');

    if (!MONGO_URI) throw new Error('MONGO_URI is not defined in environment variables');

    // Both collections must live on the same connection for this to be a "move"
    // rather than a cross-cluster copy.
    if (process.env.REMOTE_MONGO_URI && process.env.REMOTE_MONGO_URI !== MONGO_URI) {
        throw new Error(
            'REMOTE_MONGO_URI differs from MONGO_URI — jobs and remoteJobs are on different ' +
            'clusters, so this script cannot move between them. Run it where the URIs match.'
        );
    }

    const client = new MongoClient(MONGO_URI);
    await client.connect();

    try {
        const db = client.db(DB_NAME);
        const query = { filterWorkplace: 'remote' };

        const jobs = await db.collection(SOURCE).find(query).toArray();
        console.log(`[Migration] Found ${jobs.length} remote jobs in the main jobs collection`);

        if (jobs.length === 0) {
            console.log('[Migration] Nothing to move.');
            return;
        }

        console.log('');
        for (const job of jobs.slice(0, SAMPLE_SIZE)) {
            console.log(`[Migration] Moving: ${job.JobTitle || '(untitled)'} at ${job.Company || '(unknown)'} (${job.Location || 'no location'})`);
        }
        if (jobs.length > SAMPLE_SIZE) console.log(`[Migration] … and ${jobs.length - SAMPLE_SIZE} more`);

        // Sanity check for the reader: these should be German sourceSites, which
        // is what earns them the location exemption in the remote cache.
        const bySite = new Map();
        for (const job of jobs) {
            const key = job.sourceSite ?? '(none)';
            bySite.set(key, (bySite.get(key) || 0) + 1);
        }
        console.log('\n[Migration] By sourceSite:');
        for (const [site, n] of [...bySite.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`[Migration]   ${String(n).padStart(5)}  ${site}`);
        }

        if (!EXECUTE) {
            console.log(`\n[Migration] Dry run — nothing moved. Re-run with --execute to move ${jobs.length} job(s).`);
            return;
        }

        // Insert first, delete only what actually landed. The reverse order would
        // risk deleting a job whose insert then failed.
        let inserted = 0;
        let skippedDuplicate = 0;
        const movedIds = [];

        for (const group of chunk(jobs, BATCH)) {
            try {
                const res = await db.collection(TARGET).insertMany(group, { ordered: false });
                inserted += res.insertedCount || 0;
                movedIds.push(...group.map(j => j._id));
            } catch (error) {
                // ordered:false keeps going past duplicates; the error carries
                // both the successes and the per-document failures.
                const writeErrors = error?.writeErrors || [];
                const dupes = writeErrors.filter(e => e?.err?.code === 11000 || e?.code === 11000).length;
                skippedDuplicate += dupes;
                inserted += error?.result?.nInserted ?? error?.insertedCount ?? 0;

                // A duplicate already exists in the target, so the source row is
                // still safe to remove; anything else is left alone.
                const failedIndexes = new Set(writeErrors.map(e => e.index));
                group.forEach((job, i) => {
                    const failed = failedIndexes.has(i);
                    const isDupe = writeErrors.find(e => e.index === i && (e?.err?.code === 11000 || e?.code === 11000));
                    if (!failed || isDupe) movedIds.push(job._id);
                });
            }
        }

        let deleted = 0;
        for (const group of chunk(movedIds, BATCH)) {
            const res = await db.collection(SOURCE).bulkWrite(
                group.map(_id => ({ deleteOne: { filter: { _id } } })),
                { ordered: false },
            );
            deleted += res.deletedCount || 0;
        }

        const remaining = await db.collection(SOURCE).countDocuments();
        console.log(
            `\n[Migration] Moved ${deleted} remote jobs from ${SOURCE} → ${TARGET}. ` +
            `Jobs collection now has ${remaining} jobs.`
        );
        if (skippedDuplicate > 0) {
            console.log(`[Migration] ${skippedDuplicate} already existed in ${TARGET} (duplicate JobID) — source rows still removed.`);
        }
        console.log(`[Migration] ${TARGET} now holds ${await db.collection(TARGET).countDocuments()} documents`);
    } finally {
        await client.close();
    }
}

run()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    });
