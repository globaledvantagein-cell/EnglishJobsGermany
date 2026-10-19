// ─── Backfill canonical filter* fields (CLI) ───────────────────────────────
//
// Thin CLI around maintenance/recomputeFilters.js — the same code the admin
// "Recompute filters" button runs. Re-derives every filter field from what is
// already on each document; no Gemma calls.
//
// Usage:
//   node src/migrations/backfill-filter-fields.js --dry-run --all
//   node src/migrations/backfill-filter-fields.js --all
//   node src/migrations/backfill-filter-fields.js --all --collection=remoteJobs
//
// Flags:
//   --dry-run   report what would change; writes nothing
//   --limit=N   process at most N jobs
//   --all       recompute every active job, not only un-backfilled ones
//   --collection=remoteJobs   run against the remote vertical instead of jobs
import 'dotenv/config';
import { client } from '../db/connection.js';
import { recomputeFilters } from '../maintenance/recomputeFilters.js';
import { refreshJobsCache } from '../cache/jobsCache.js';
import { refreshRemoteJobsCache } from '../cache/remoteJobsCache.js';

function parseArgs(argv) {
    const limitArg = argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
    const collectionArg = argv.find(a => a.startsWith('--collection='));
    return {
        dryRun: argv.includes('--dry-run'),
        limit: Number.isFinite(limit) && limit > 0 ? limit : null,
        all: argv.includes('--all'),
        collectionName: collectionArg ? collectionArg.split('=')[1] : 'jobs',
    };
}

async function run() {
    const options = parseArgs(process.argv.slice(2));
    console.log(`Backfill filter fields — ${options.dryRun ? 'DRY RUN' : 'LIVE'}, ${options.collectionName}, ${options.all ? 'every active job' : 'un-backfilled only'}${options.limit ? `, limit ${options.limit}` : ''}`);

    const result = await recomputeFilters({
        ...options,
        onProgress: (done, total) => console.log(`  processed ${done}/${total}`),
    });

    console.log(`\nMatching jobs: ${result.matched}`);
    console.log(`Processed : ${result.processed}`);
    console.log(`${options.dryRun ? 'Would update' : 'Updated'}   : ${result.updated}`);
    console.log('\n─── Filter facet health check ─────────────────');
    for (const [facet, buckets] of Object.entries(result.counts)) {
        console.log(`  ${facet.padEnd(11)} ${Object.entries(buckets).map(([k, n]) => `${k}: ${n}`).join(', ')}`);
    }
    console.log('\nExperience changes (before → after):');
    for (const [move, n] of Object.entries(result.experienceMoves).sort((a, b) => b[1] - a[1])) console.log(`  ${move.padEnd(20)} ${n}`);
    console.log(`Senior/Lead-titled jobs in entry: ${result.seniorInEntryBefore} before → ${result.seniorInEntryAfter} after`);

    // A CLI run only reaches this process's caches; the server reloads its own
    // on the next refresh (or use the admin button, which runs in-server).
    if (!options.dryRun && result.updated > 0) {
        await (options.collectionName === 'remoteJobs' ? refreshRemoteJobsCache() : refreshJobsCache());
    }
}

run()
    .catch(error => {
        console.error('[backfill-filter-fields] Fatal:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await client.close();
        // The cache modules imported above keep timers alive; without an
        // explicit exit the script finishes its work and then never returns.
        process.exit(process.exitCode ?? 0);
    });
