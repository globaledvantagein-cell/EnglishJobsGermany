/**
 * Link-validator run history, for /admin/health (the "Dead links" check and
 * the manual "Check links now" button).
 *
 * Collection: validatorRuns. One doc per run; a TTL index drops runs after
 * HISTORY_DAYS so it stays tiny.
 *
 * Doc: { startedAt, finishedAt, source: 'cron' | 'manual' | 'cli', dryRun,
 *        ok, summary: { jobs: {...}, remoteJobs: {...} } | null }
 */
import { connectToDb } from './connection.js';

const HISTORY_DAYS = 30;
let indexReady = false;

async function validatorRuns() {
    const db = await connectToDb();
    const collection = db.collection('validatorRuns');
    if (!indexReady) {
        indexReady = true;
        await collection.createIndex({ startedAt: 1 }, { expireAfterSeconds: HISTORY_DAYS * 86_400 }).catch(() => {});
    }
    return collection;
}

export async function saveValidatorRun(run) {
    const collection = await validatorRuns();
    await collection.insertOne(run);
}

/** Newest first. */
export async function getRecentValidatorRuns(limit = 10) {
    const collection = await validatorRuns();
    return collection.find({}, { projection: { _id: 0 } }).sort({ startedAt: -1 }).limit(limit).toArray();
}

/** Newest real (non-dry) run, or null. */
export async function getLatestValidatorRun() {
    const collection = await validatorRuns();
    return collection.findOne({ dryRun: false }, { projection: { _id: 0 }, sort: { startedAt: -1 } });
}
