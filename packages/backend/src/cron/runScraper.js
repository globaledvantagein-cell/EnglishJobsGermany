import { SITES_CONFIG } from '../config.js';
import { connectToDb, loadAllExistingIDs, deleteOldJobs } from '../db/index.js';
import { scrapeSite } from '../core/scraperEngine.js';
import { refreshJobsCache, refreshRemoteJobsCache, initAiResultCache, isAiResultCacheReady } from '../cache/index.js';
import { Analytics } from '../models/analyticsModel.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

// Sources scraped side by side within one run. They share the Gemini key pool,
// which paces the AI calls, so more lanes mainly overlap the network-bound
// board fetching. Kept low because every running config holds its fetched
// boards in RAM (see the heap note in ecosystem.config.cjs).
const SOURCE_CONCURRENCY = Number(process.env.SCRAPER_SOURCE_CONCURRENCY) || 3;

// An unfinished run younger than this is resumed when the server boots.
const RESUME_WINDOW_MS = 20 * 60 * 60 * 1000;

const ALL_SITE_NAMES = SITES_CONFIG.filter(s => s && s.siteName).map(s => s.siteName);
const FEED_SITE_NAMES = ['Arbeitsagentur Jobs', 'Softgarden Jobs', 'JOIN Jobs'];

/** Source groups the admin can run on their own (maintenance/taskRunner.js). */
export const SCRAPER_GROUPS = {
    all: ALL_SITE_NAMES,
    ats: ALL_SITE_NAMES.filter(name => !FEED_SITE_NAMES.includes(name)),
    arbeitsagentur: ['Arbeitsagentur Jobs'],
    feeds: ['Softgarden Jobs', 'JOIN Jobs'],
};

// Sources currently being scraped, by siteName. Per source rather than one
// flag, so "Run Arbeitsagentur" and the 06:00 run can overlap: a run simply
// skips any source another run already has.
const runningSources = new Set();

/** True while any scrape (cron, button or resume) is in progress. */
export function isScraperRunning() {
    return runningSources.size > 0;
}

/** True if any of these sources is being scraped right now. */
export function isAnySourceRunning(siteNames) {
    return siteNames.some(name => runningSources.has(name));
}

async function runsCollection() {
    const db = await connectToDb();
    return db.collection('scraperRuns');
}

/**
 * Scrapes the given sources once (all of them by default). Started by the
 * 06:00 cron, the admin "Run …" buttons (maintenance/taskRunner.js) and, after
 * a restart, resumeInterruptedScrape().
 *
 * Every run is recorded in scraperRuns with the sources it finished, so a run
 * killed by a deploy can pick up where it stopped.
 *
 * @param {Object} [opts]
 * @param {string[]} [opts.sources] - siteNames to scrape; defaults to every source
 * @param {string} [opts.trigger] - 'cron' | 'manual' | 'resume', for the run record
 * @param {(stage: string, done: number, total: number) => void} [opts.onProgress]
 * @returns {Promise<{ ok: boolean, reason?: string, sources?: number, newJobs?: number, skipped?: string[] }>}
 */
export const runScraper = async function ({ sources = ALL_SITE_NAMES, trigger = 'cron', onProgress } = {}) {
    const wanted = SITES_CONFIG.filter(s => s && s.siteName && sources.includes(s.siteName));
    const skipped = wanted.filter(s => runningSources.has(s.siteName)).map(s => s.siteName);
    const configs = wanted.filter(s => !runningSources.has(s.siteName));

    if (configs.length === 0) {
        console.log('Scraper: every requested source is already being scraped. Skipping this run.');
        return { ok: false, reason: 'Those sources are already being scraped.', skipped };
    }
    if (skipped.length) console.log(`Scraper: skipping ${skipped.join(', ')} — already running in another run.`);
    for (const s of configs) runningSources.add(s.siteName);

    console.log(`🚀 Starting scrape task (${trigger}): ${configs.map(s => s.siteName).join(', ')} — ${SOURCE_CONCURRENCY} sources at a time`);
    const runs = await runsCollection();
    const { insertedId: runId } = await runs.insertOne({
        trigger, sources: configs.map(s => s.siteName), doneSources: [], startedAt: new Date(), finishedAt: null,
    });

    const active = new Set();
    let sourcesDone = 0;
    let newJobsTotal = 0;
    let ok = true;
    const report = () => onProgress?.(active.size ? [...active].join(', ') : 'Refreshing caches', sourcesDone, configs.length);

    try {
        // Safety net for a scrape started outside the server boot path: an
        // empty fingerprint cache looks like "nothing analyzed yet" and would
        // re-send every job to the AI. Idempotent — a no-op when already loaded.
        if (!isAiResultCacheReady()) await initAiResultCache();

        // Track "Connected Sources" metric
        await Analytics.setValue('connectedSources', ALL_SITE_NAMES.length);

        const existingIDsMap = await loadAllExistingIDs();

        // Shared across ALL sites — detects same job posted by different legal entities
        // e.g., "Databricks GmbH" on Greenhouse and "Databricks Inc." on Ashby
        const crossEntityKeys = new Map();

        await mapWithConcurrency(configs, SOURCE_CONCURRENCY, async (siteConfig) => {
            const siteName = siteConfig.siteName;
            active.add(siteName);
            report();
            try {
                // Configs cache their fetched boards in _allJobsQueue behind an
                // _initialized flag. The server is long-lived, so without this
                // reset every run after the first replays the boot-day queue and
                // finds no new jobs until the next restart.
                if ('_initialized' in siteConfig) siteConfig._initialized = false;
                if (Array.isArray(siteConfig._allJobsQueue)) siteConfig._allJobsQueue = [];

                const scrapeStartTime = new Date();
                const newJobs = await scrapeSite(siteConfig, existingIDsMap, crossEntityKeys);

                // Free the queue now rather than holding every board in RAM until
                // the next run (see the heap note in ecosystem.config.cjs).
                if (Array.isArray(siteConfig._allJobsQueue)) siteConfig._allJobsQueue = [];

                console.log(`[${siteName}] Found ${newJobs.length} new jobs.`);
                await deleteOldJobs(siteName, scrapeStartTime);
                newJobsTotal += newJobs.length;
                await runs.updateOne({ _id: runId }, { $push: { doneSources: siteName } }).catch(() => {});
            } catch (siteError) {
                // One broken source must not stop the others.
                ok = false;
                console.error(`[${siteName}] scrape failed:`, siteError);
            } finally {
                runningSources.delete(siteName);
                active.delete(siteName);
                sourcesDone += 1;
                report();
            }
        });

        console.log("\n✅ All scraping complete.");

        // ── Refresh the RAM cache so newly approved jobs appear ──────
        // (Auto-published jobs are already upserted as they are saved; this
        // also drops the expired actives deleteOldJobs removed. ~150ms.)
        try {
            await refreshJobsCache();
        } catch (cacheErr) {
            console.warn('[Cache] refresh failed after scrape:', cacheErr.message);
        }

        // The remote vertical has its own cache over the "remoteJobs"
        // collection. Refreshed independently — a failure on either side
        // must not affect the other.
        try {
            await refreshRemoteJobsCache();
        } catch (remoteCacheErr) {
            console.warn('[RemoteCache] refresh failed after scrape:', remoteCacheErr.message);
        }
    } catch (error) {
        ok = false;
        console.error("An error occurred during the scrape:", error);
    } finally {
        for (const s of configs) runningSources.delete(s.siteName);
        await runs.updateOne({ _id: runId }, { $set: { finishedAt: new Date(), ok, newJobs: newJobsTotal } }).catch(() => {});
        console.log("Scrape task finished.");
    }
    return ok
        ? { ok: true, sources: sourcesDone, newJobs: newJobsTotal, skipped }
        : { ok: false, reason: `Finished with errors after ${sourcesDone} sources (${newJobsTotal} new jobs). Check the server log.`, sources: sourcesDone, newJobs: newJobsTotal, skipped };
}

/**
 * Called once on boot: a run that was cut off by a restart (deploy, crash)
 * left a scraperRuns record without finishedAt. Restart the sources it had
 * not finished. Jobs it already saved are skipped as existing, and analyzed
 * postings hit the AI result cache, so the resumed run moves quickly through
 * the part that was already done.
 */
export async function resumeInterruptedScrape() {
    const runs = await runsCollection();
    const interrupted = await runs.find({ finishedAt: null }).toArray();
    if (interrupted.length === 0) return;

    await runs.updateMany(
        { _id: { $in: interrupted.map(r => r._id) } },
        { $set: { finishedAt: new Date(), ok: false, interrupted: true } },
    );

    const cutoff = Date.now() - RESUME_WINDOW_MS;
    const remaining = new Set();
    for (const run of interrupted) {
        if (new Date(run.startedAt).getTime() < cutoff) continue;
        for (const name of run.sources || []) {
            if (!(run.doneSources || []).includes(name)) remaining.add(name);
        }
    }
    if (remaining.size === 0) return;

    console.log(`[Scraper] Resuming interrupted scrape: ${[...remaining].join(', ')}`);
    return runScraper({ sources: [...remaining], trigger: 'resume' });
}
