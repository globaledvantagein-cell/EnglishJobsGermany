// ─── Admin maintenance tasks ─────────────────────────────────────────────────
//
// Jobs an admin starts with a button in the Maintenance panel on /admin.
// Click-only by design: nothing here is scheduled, and nothing starts on boot.
// (The scraper also has its own 06:00 cron; the buttons just run it now.)
//
// Two kinds of task:
//   scraper — one button per source group. They may run side by side; a run
//             skips any source another run (or the cron) already has.
//   db      — heavy database passes. One at a time, and never next to anything.
//
// Progress is kept in memory for the panel to poll, and every finished run is
// recorded in maintenanceRuns (TTL 30 days) so the last result survives a page
// reload.
//
// Kill switch: `adminMaintenance` (featureRegistry routes cover the API).

import { connectToDb } from '../db/connection.js';
import { refreshJobsCache, refreshRemoteJobsCache } from '../cache/index.js';
import { recomputeFilters } from './recomputeFilters.js';
import { fillAiData } from './fillAiData.js';
import { runScraper, isAnySourceRunning, SCRAPER_GROUPS } from '../cron/runScraper.js';

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

/** A button that scrapes one source group now. */
function scraperTask(label, description, sources) {
    return {
        kind: 'scraper',
        label,
        description: `${description} New jobs go through the usual AI check and go live as they pass. Takes a while.`,
        // Only blocked when there is nothing left for this button to do.
        blockedReason: () => (sources.every(name => isAnySourceRunning([name])) ? 'These sources are already being scraped.' : null),
        async run(setProgress) {
            return runScraper({ sources, trigger: 'manual', onProgress: setProgress });
        },
    };
}

export const MAINTENANCE_TASKS = {
    'run-scraper': scraperTask('Run all sources', 'Scrapes every source now instead of waiting for the 06:00 run.', SCRAPER_GROUPS.all),
    'run-scraper-ats': scraperTask('Run ATS boards', 'Greenhouse, Ashby, Lever, Workday, Workable, Recruitee, Personio, SmartRecruiters and Teamtailor.', SCRAPER_GROUPS.ats),
    'run-scraper-arbeitsagentur': scraperTask('Run Arbeitsagentur', 'The Bundesagentur für Arbeit feed. Works through its backlog a day\'s AI budget at a time.', SCRAPER_GROUPS.arbeitsagentur),
    'run-scraper-feeds': scraperTask('Run softgarden + JOIN', 'The softgarden and JOIN feeds.', SCRAPER_GROUPS.feeds),
    'fill-ai-data': {
        kind: 'db',
        label: 'Fill missing AI data',
        description: 'Runs the AI on jobs it never read (workplace, visa, relocation, salary) and re-categorizes jobs stuck in "Other / General Business".',
        async run(setProgress) {
            return fillAiData({ onProgress: (stage, done, total) => setProgress(stage === 'requirements' ? 'Reading job ads' : 'Categorizing', done, total) });
        },
    },
    'recompute-filters': {
        kind: 'db',
        label: 'Recompute filters',
        description: 'Re-derives every filter value (experience, workplace, employment, visa, relocation, salary) for all active jobs, German and remote. No AI calls.',
        async run(setProgress) {
            const jobs = await recomputeFilters({ collectionName: 'jobs', onProgress: (d, t) => setProgress('Germany', d, t) });
            const remoteJobs = await recomputeFilters({ collectionName: 'remoteJobs', onProgress: (d, t) => setProgress('Remote', d, t) });
            return { ok: true, jobs, remoteJobs };
        },
    },
};

// key → { startedAt, stage, done, total } for every task running right now.
const active = new Map();

/** Snapshot for the admin panel. */
export function getMaintenanceStatus() {
    return { running: active.size > 0, active: Object.fromEntries(active) };
}

/** Newest first, compact (no facet tables). */
export async function getRecentMaintenanceRuns(limit = 10) {
    const collection = await runsCollection();
    return collection.find({}, { projection: { _id: 0 } }).sort({ startedAt: -1 }).limit(limit).toArray();
}

function conflict(message) {
    return Object.assign(new Error(message), { status: 409 });
}

/**
 * Starts a task in the background. Resolves immediately; the outcome lands in
 * maintenanceRuns. Throws if the task can't run next to what is running, or
 * the key is unknown.
 */
export function startMaintenanceTask(key, { startedBy = null } = {}) {
    const task = MAINTENANCE_TASKS[key];
    if (!task) throw Object.assign(new Error('Unknown maintenance task'), { status: 404 });
    if (active.has(key)) throw conflict('That task is already running');
    const runningKinds = [...active.keys()].map(k => MAINTENANCE_TASKS[k].kind);
    if (runningKinds.includes('db')) throw conflict('A database task is running');
    if (task.kind === 'db' && active.size > 0) throw conflict('Another maintenance task is running');
    const blocked = task.blockedReason?.();
    if (blocked) throw conflict(blocked);

    const state = { startedAt: new Date(), stage: 'Starting', done: 0, total: 0 };
    active.set(key, state);
    const setProgress = (stage, done, total) => Object.assign(state, { stage, done, total });

    (async () => {
        let result = null;
        let ok = false;
        try {
            result = await task.run(setProgress);
            ok = result?.ok !== false;
            // Database tasks change jobs or their filter values; reload so the
            // public lists and facet counts show them right away. The scraper
            // refreshes the caches itself at the end of its run.
            if (task.kind === 'db') {
                await refreshJobsCache().catch(err => console.warn('[maintenance] jobs cache refresh failed:', err.message));
                await refreshRemoteJobsCache().catch(err => console.warn('[maintenance] remote cache refresh failed:', err.message));
            }
        } catch (error) {
            console.error(`[maintenance] ${key} crashed:`, error);
            result = { ok: false, reason: 'The task stopped with an error. Check the server log, then try again.' };
        } finally {
            const finishedAt = new Date();
            await (await runsCollection()).insertOne({
                task: key, label: task.label, startedBy, startedAt: state.startedAt, finishedAt, ok, result,
            }).catch(err => console.warn('[maintenance] could not record run:', err.message));
            active.delete(key);
        }
    })();

    return getMaintenanceStatus();
}
