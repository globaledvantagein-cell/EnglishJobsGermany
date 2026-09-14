// ─── Move location-restricted jobs out of remoteJobs ───────────────────────────
//
// The remote vertical is meant to be location-FREE: roles anyone can take from
// anywhere. The scraper let through a lot that only look remote —
// "Remote · United States", "Remote - US", "Remote (Hybrid)", or a bare country
// name — which are geographically restricted and belong on neither vertical.
//
// Deleting them was not enough. remoteJobs is also the scraper's memory of what
// it has already seen, so a deleted job is a forgotten job: the next run finds
// it on the ATS board, recognises nothing, and saves it again. That is why the
// same "Remote · United States" rows kept coming back after every cleanup.
//
// So this migration MOVES rather than deletes. Each doomed job's JobID and
// dedupKey are upserted into remoteRejectCache — three tiny fields the scraper
// folds into its dedup Sets at startup — and only then is the row removed from
// remoteJobs. The rejection outlives the document, and the cleanup sticks.
//
// The rule is strict: Location, trimmed and lowercased, must be exactly
// "remote". Anything else is a qualifier, and a qualifier means somebody
// somewhere cannot take the job. Scoped to sourceSite: null — those are the
// remote-scraped rows; jobs from the main pipeline are not this migration's to
// judge.
//
// DRY RUN BY DEFAULT — writes require --execute.
//
//   node src/migrations/clean-remote-jobs.js            (report only)
//   node src/migrations/clean-remote-jobs.js --execute  (move + delete)

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const COLLECTION = 'remoteJobs';
const REJECT_COLLECTION = 'remoteRejectCache';
const DB_NAME = 'job-scraper';
const BATCH = 500;
const SAMPLE_SIZE = 10;

const EXECUTE = process.argv.includes('--execute');

// The remote vertical can live on its own cluster; work where the data is.
const MONGO_URI = process.env.REMOTE_MONGO_URI || process.env.MONGO_URI;

function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** The scraper's own predicate, kept in one line so the two cannot drift far. */
function isGlobalRemoteLocation(rawLocation) {
    return String(rawLocation ?? '').trim().toLowerCase() === 'remote';
}

async function run() {
    console.log('🧹 Moving location-restricted jobs from remoteJobs → remoteRejectCache');
    console.log(EXECUTE ? '   MODE: --execute (documents WILL be moved and deleted)\n' : '   MODE: dry run (no writes; pass --execute to apply)\n');

    if (!MONGO_URI) throw new Error('Neither REMOTE_MONGO_URI nor MONGO_URI is set');

    const client = new MongoClient(MONGO_URI);
    await client.connect();

    try {
        const db = client.db(DB_NAME);

        const collections = (await db.listCollections().toArray()).map(c => c.name);
        if (!collections.includes(COLLECTION)) {
            console.log(`[Migration] ${COLLECTION} does not exist — nothing to do.`);
            return;
        }

        // sourceSite: null matches both an explicit null and an absent field —
        // remote-scraped rows are written without it at all.
        const jobs = await db.collection(COLLECTION)
            .find(
                { sourceSite: null },
                { projection: { _id: 1, JobID: 1, dedupKey: 1, Location: 1, JobTitle: 1, Company: 1 } },
            )
            .toArray();

        const doomed = jobs.filter(job => !isGlobalRemoteLocation(job.Location));
        const keep = jobs.length - doomed.length;

        console.log(
            `[Migration] Found ${jobs.length} remote-scraped jobs. ${keep} are location-free. ` +
            `${doomed.length} carry a location qualifier and will be moved to ${REJECT_COLLECTION}.`
        );

        if (doomed.length === 0) {
            console.log('[Migration] Nothing to move.');
            return;
        }

        console.log('');
        for (const job of doomed.slice(0, SAMPLE_SIZE)) {
            const loc = job.Location == null ? '(no Location)' : String(job.Location);
            console.log(`[Migration] Rejecting: '${loc}' — ${job.JobTitle || '(untitled)'} at ${job.Company || '(unknown)'}`);
        }
        if (doomed.length > SAMPLE_SIZE) {
            console.log(`[Migration] … and ${doomed.length - SAMPLE_SIZE} more`);
        }

        // A breakdown makes a mis-specified rule obvious before it touches
        // thousands of rows — one glance shows whether the buckets look right.
        const byLocation = new Map();
        for (const job of doomed) {
            const key = job.Location == null || String(job.Location).trim() === ''
                ? '(no Location)'
                : String(job.Location).trim();
            byLocation.set(key, (byLocation.get(key) || 0) + 1);
        }
        const top = [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        console.log('\n[Migration] Most common rejected Location values:');
        for (const [loc, n] of top) console.log(`[Migration]   ${String(n).padStart(5)}  ${loc}`);

        // A job with no JobID cannot be remembered, only deleted — and deleting
        // it without a memory is the exact loop this migration exists to break.
        // Report it rather than silently doing half the job.
        const withoutJobId = doomed.filter(job => !job.JobID).length;
        if (withoutJobId > 0) {
            console.log(`\n[Migration] ⚠ ${withoutJobId} of them have no JobID — they can be deleted but not remembered.`);
        }

        if (!EXECUTE) {
            console.log(`\n[Migration] Dry run — nothing written. Re-run with --execute to move ${doomed.length} job(s).`);
            return;
        }

        // ── 1. Remember, then delete. Order matters: a crash between the two
        //       leaves a redundant reject-cache entry, which is harmless; the
        //       reverse order would lose the rejection and reopen the loop.
        const rejectCache = db.collection(REJECT_COLLECTION);
        const now = new Date();

        let remembered = 0;
        for (const group of chunk(doomed.filter(job => job.JobID), BATCH)) {
            const res = await rejectCache.bulkWrite(
                group.map(job => ({
                    updateOne: {
                        filter: { JobID: job.JobID },
                        update: {
                            $set: { JobID: job.JobID, dedupKey: job.dedupKey ?? null },
                            $setOnInsert: { createdAt: now },
                        },
                        upsert: true,
                    },
                })),
                { ordered: false },
            );
            remembered += (res.upsertedCount || 0) + (res.matchedCount || 0);
        }

        // ── 2. Now the rows can go.
        let deleted = 0;
        for (const group of chunk(doomed, BATCH)) {
            const res = await db.collection(COLLECTION).bulkWrite(
                group.map(job => ({ deleteOne: { filter: { _id: job._id } } })),
                { ordered: false },
            );
            deleted += res.deletedCount || 0;
        }

        console.log(`\n[Migration] Moved ${remembered} rejected jobs to ${REJECT_COLLECTION}, deleted ${deleted} from ${COLLECTION}`);
        console.log(`[Migration] ${COLLECTION} now holds ${await db.collection(COLLECTION).countDocuments()} documents`);
        console.log(`[Migration] ${REJECT_COLLECTION} now holds ${await rejectCache.countDocuments()} remembered rejections`);
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
