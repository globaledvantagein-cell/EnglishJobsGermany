// ─── Admin maintenance tasks ─────────────────────────────────────────────────
//
// Jobs an admin starts with a button in the Maintenance panel on /admin.
// Click-only by design: nothing here is scheduled, and nothing starts on boot.
// (The scraper also has its own 06:00 cron; the button just runs it now.)
//
// One task at a time (all are heavy on the database), progress kept in memory
// for the panel to poll, and every finished run recorded in maintenanceRuns
// (TTL 30 days) so the last result survives a page reload.
//
// Kill switch: `adminMaintenance` (featureRegistry routes cover the API).

import { connectToDb } from '../db/connection.js';
import { refreshJobsCache, refreshRemoteJobsCache } from '../cache/index.js';
import { recomputeFilters } from './recomputeFilters.js';
import { fillAiData } from './fillAiData.js';
import { runScraper, isScraperRunning } from '../cron/runScraper.js';

const HISTORY_DAYS = 30;
let indexReady = false;

async function runsCollection() {
    const db = await connectToDb();
    const collection = db.collection('maintenanceRuns');
    if (!indexReady) {
        indexReady = true;
        await collection.createIndex({ startedAt: 1 }, { expireAfterSeconds: HISTORY_DAYS * 86_400 }).catch(() => {});
    }
    return collection;
}

export const MAINTENANCE_TASKS = {
    'run-scraper': {
        label: 'Run scraper now',
        description: 'Scrapes every connected ATS, company board and feed now instead of waiting for the 06:00 run. New jobs go through the usual AI check. Takes a while.',
        // The 06:00 cron may already be scraping; a second run would only no-op.
        blockedReason: () => (isScraperRunning() ? 'The scraper is already running (daily 06:00 run).' : null),
        async run(setProgress) {
            return runScraper({ onProgress: (site, done, total) => setProgress(site, done, total) });
        },
    },
    'fill-ai-data': {
        label: 'Fill missing AI data',
        description: 'Runs the AI on jobs it never read (workplace, visa, relocation, salary) and re-categorizes jobs stuck in "Other / General Business".',
        async run(setProgress) {
            return fillAiData({ onProgress: (stage, done, total) => setProgress(stage === 'requirements' ? 'Reading job ads' : 'Categorizing', done, total) });
        },
    },
    'recompute-filters': {
        label: 'Recompute filters',
        description: 'Re-derives every filter value (experience, workplace, employment, visa, relocation, salary) for all active jobs, German and remote. No AI calls.',
        async run(setProgress) {
            const jobs = await recomputeFilters({ collectionName: 'jobs', onProgress: (d, t) => setProgress('Germany', d, t) });
            const remoteJobs = await recomputeFilters({ collectionName: 'remoteJobs', onProgress: (d, t) => setProgress('Remote', d, t) });
            return { ok: true, jobs, remoteJobs };
        },
    },
};

const status = { running: false, task: null, startedAt: null, stage: null, done: 0, total: 0 };

/** Snapshot for the admin panel. */
export function getMaintenanceStatus() {
    return { ...status };
}

/** Newest first, compact (no facet tables). */
export async function getRecentMaintenanceRuns(limit = 10) {
    const collection = await runsCollection();
    return collection.find({}, { projection: { _id: 0 } }).sort({ startedAt: -1 }).limit(limit).toArray();
}

/**
 * Starts a task in the background. Resolves immediately; the outcome lands in
 * maintenanceRuns. Throws if another task is running or the key is unknown.
 */
export function startMaintenanceTask(key, { startedBy = null } = {}) {
    const task = MAINTENANCE_TASKS[key];
    if (!task) throw Object.assign(new Error('Unknown maintenance task'), { status: 404 });
    if (status.running) throw Object.assign(new Error('Another maintenance task is running'), { status: 409 });
    const blocked = task.blockedReason?.();
    if (blocked) throw Object.assign(new Error(blocked), { status: 409 });

    Object.assign(status, { running: true, task: key, startedAt: new Date(), stage: 'Starting', done: 0, total: 0 });
    const setProgress = (stage, done, total) => Object.assign(status, { stage, done, total });

    (async () => {
        let result = null;
        let ok = false;
        try {
            result = await task.run(setProgress);
            ok = result?.ok !== false;
            // Every task changes jobs or their filter values; reload so the
            // public lists and facet counts show them right away.
            await refreshJobsCache().catch(err => console.warn('[maintenance] jobs cache refresh failed:', err.message));
            await refreshRemoteJobsCache().catch(err => console.warn('[maintenance] remote cache refresh failed:', err.message));
        } catch (error) {
            console.error(`[maintenance] ${key} crashed:`, error);
            result = { ok: false, reason: 'The task stopped with an error. Check the server log, then try again.' };
        } finally {
            const finishedAt = new Date();
            await (await runsCollection()).insertOne({
                task: key, label: task.label, startedBy, startedAt: status.startedAt, finishedAt, ok, result,
            }).catch(err => console.warn('[maintenance] could not record run:', err.message));
            Object.assign(status, { running: false, task: null, stage: null, done: 0, total: 0 });
        }
    })();

    return getMaintenanceStatus();
}
