import { connectToDb, saveValidatorRun } from '../db/index.js';
import { refreshJobsCache, refreshRemoteJobsCache } from '../cache/index.js';
import { checkJobLiveness, Liveness } from '../core/jobLiveness.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { pruneExpiredJobs } from './pruneExpiredJobs.js';

// ─── Validator ─────────────────────────────────────────────────────────────
//
// Re-checks every active job — German (`jobs`) and remote (`remoteJobs`) —
// against its source ATS and expires the ones that are gone. See
// core/jobLiveness.js for how "gone" is decided per platform.
//
// Dead jobs are marked Status:'expired' rather than deleted, matching the
// remote scraper: applied-job history still resolves, and a wrong verdict can
// be undone by flipping Status back. The German scraper builds its "already
// seen" set from every document regardless of Status, so an expired job is
// never re-imported.
//
// Circuit breaker: if more than DEAD_RATIO_BREAKER of one platform's checked
// jobs come back dead in a single run, that platform is not expired at all.
// That pattern means our URL parsing broke or the ATS changed its API — not
// that half a platform's jobs closed overnight. `force` skips the breaker for a
// one-off backlog cleanup once the dead verdicts have been spot-checked by hand.

const COLLECTIONS = ['jobs', 'remoteJobs'];
const CONCURRENCY = 8;
const DEAD_RATIO_BREAKER = 0.6;
const BREAKER_MIN_SAMPLE = 20;

let isValidating = false;

// Live progress for the admin panel. Module state, so it only reflects runs
// in this process — a CLI run shows up through validatorRuns history instead.
const progress = { startedAt: null, source: null, collection: null, checked: 0, total: 0 };

/** Snapshot for GET /api/admin/validator. */
export function getValidatorStatus() {
    return { running: isValidating, ...progress };
}

/**
 * Checks one collection's active jobs.
 * @returns {Promise<{checked:number, live:number, dead:number, unknown:number, expired:number, tripped:string[]}>}
 */
async function validateCollection(db, collectionName, { dryRun, limit, force }) {
    const collection = db.collection(collectionName);
    let cursor = collection.find(
        { Status: 'active' },
        { projection: { _id: 1, JobID: 1, ApplicationURL: 1, JobTitle: 1, Company: 1 } },
    );
    if (limit) cursor = cursor.limit(limit);
    const activeJobs = await cursor.toArray();

    console.log(`[Validator] ${collectionName}: checking ${activeJobs.length} active jobs...`);
    progress.collection = collectionName;
    progress.checked = 0;
    progress.total = activeJobs.length;

    const boardCache = new Map();
    const outcomes = await mapWithConcurrency(activeJobs, CONCURRENCY, async (job) => {
        const outcome = { job, ...(await checkJobLiveness(job, { boardCache })) };
        progress.checked++;
        if (progress.checked % 500 === 0) console.log(`[Validator] ${collectionName}: ${progress.checked}/${progress.total}`);
        return outcome;
    });

    // Per-platform tallies feed both the log and the circuit breaker.
    const byAts = new Map();
    for (const o of outcomes) {
        if (!byAts.has(o.ats)) byAts.set(o.ats, { live: 0, dead: 0, unknown: 0 });
        byAts.get(o.ats)[o.verdict]++;
    }

    const tripped = [];
    for (const [ats, t] of byAts) {
        const decided = t.live + t.dead;
        const deadRatio = decided ? t.dead / decided : 0;
        console.log(`[Validator] ${collectionName}/${ats}: ${t.live} live, ${t.dead} dead, ${t.unknown} unknown`);
        if (decided >= BREAKER_MIN_SAMPLE && deadRatio > DEAD_RATIO_BREAKER) {
            if (force) {
                console.warn(`[Validator] ⚠️ ${collectionName}/${ats}: ${(deadRatio * 100).toFixed(0)}% dead — breaker overridden (force)`);
            } else {
                console.warn(`[Validator] ⚠️ ${collectionName}/${ats}: ${(deadRatio * 100).toFixed(0)}% dead — breaker tripped, expiring none`);
                tripped.push(ats);
            }
        }
    }

    const dead = outcomes.filter(o => o.verdict === Liveness.DEAD && !tripped.includes(o.ats));
    const live = outcomes.filter(o => o.verdict === Liveness.LIVE);
    const now = new Date();

    for (const o of dead) {
        console.log(`[Validator] ❌ ${o.reason}: "${o.job.JobTitle}" at ${o.job.Company} — ${o.job.ApplicationURL}`);
    }

    let expired = 0;
    if (!dryRun && dead.length > 0) {
        const res = await collection.bulkWrite(dead.map(o => ({
            updateOne: {
                // Re-assert active so a job an admin touched mid-run is not clobbered.
                filter: { _id: o.job._id, Status: 'active' },
                update: { $set: { Status: 'expired', expiredAt: now, expiredReason: o.reason, livenessCheckedAt: now } },
            },
        })), { ordered: false });
        expired = res.modifiedCount || 0;
    }

    if (!dryRun && live.length > 0) {
        await collection.updateMany(
            { _id: { $in: live.map(o => o.job._id) } },
            { $set: { livenessCheckedAt: now } },
        );
    }

    const count = (v) => outcomes.filter(o => o.verdict === v).length;
    return {
        checked: outcomes.length,
        live: count(Liveness.LIVE),
        dead: count(Liveness.DEAD),
        unknown: count(Liveness.UNKNOWN),
        expired,
        tripped,
    };
}

/**
 * Validates every active job and expires the dead ones.
 *
 * @param {{dryRun?: boolean, limit?: number, force?: boolean, source?: 'cron'|'manual'|'cli'}} [options]
 *   dryRun — check and log, write nothing. limit — cap jobs per collection.
 *   force — skip the circuit breaker (see top of file).
 *   source — recorded in validatorRuns so /admin/health can tell runs apart.
 */
export async function runValidator({ dryRun = false, limit = 0, force = false, source = 'cron' } = {}) {
    if (isValidating) {
        console.log('Validator is already running. Skipping this scheduled run.');
        return null;
    }
    isValidating = true;
    const startedAt = Date.now();
    Object.assign(progress, { startedAt: new Date(startedAt), source, collection: null, checked: 0, total: 0 });
    console.log(`🏃‍♂️ Starting the Job Validator task${dryRun ? ' (dry run)' : ''}...`);

    const summary = {};
    let ok = false;
    try {
        const db = await connectToDb();
        for (const name of COLLECTIONS) {
            summary[name] = await validateCollection(db, name, { dryRun, limit, force });
        }

        // Expired jobs are only kept as small stubs; see pruneExpiredJobs.js.
        if (!dryRun) await pruneExpiredJobs().catch(err => console.warn('[Validator] expired-job cleanup failed:', err.message));

        // Mass Status change → full refresh, same as the other bulk admin jobs.
        // The German cache has no change-stream watcher, so without this the
        // expired jobs would stay listed until the next scrape. Only reaches
        // the caches of the process running the sweep (a CLI run leaves the
        // server's caches to their next refresh).
        if (Object.values(summary).some(s => s.expired > 0)) {
            await refreshJobsCache().catch(err => console.warn('[Validator] jobs cache refresh failed:', err.message));
            await refreshRemoteJobsCache().catch(err => console.warn('[Validator] remote cache refresh failed:', err.message));
        }

        console.log(`\n[Validator] ✅ Complete in ${Math.round((Date.now() - startedAt) / 1000)}s:`);
        for (const [name, s] of Object.entries(summary)) {
            console.log(`  ${name}: ${s.checked} checked, ${s.live} live, ${s.dead} dead, ${s.unknown} unknown, ${s.expired} expired`
                + (s.tripped.length ? `, breaker tripped for ${s.tripped.join(', ')}` : ''));
        }
        ok = true;
        return summary;
    } catch (error) {
        console.error('An error occurred during the validation task:', error);
        return null;
    } finally {
        // Limited runs are spot checks, not a full sweep — keep them out of the
        // history the health check reads.
        if (!limit) {
            await saveValidatorRun({
                startedAt: new Date(startedAt), finishedAt: new Date(), source, dryRun, force, ok,
                summary: ok ? summary : null,
            }).catch(err => console.warn('[Validator] could not record run:', err.message));
        }
        isValidating = false;
        console.log('Validation task finished.');
    }
}

export async function findJobByUrl(applicationUrl) {
    const db = await connectToDb();
    const jobsCollection = db.collection('jobs');
    return await jobsCollection.findOne({ ApplicationURL: applicationUrl });
}
