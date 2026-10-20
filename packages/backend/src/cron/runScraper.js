import { SITES_CONFIG } from '../config.js';
import { loadAllExistingIDs, deleteOldJobs } from '../db/index.js';
import { scrapeSite } from '../core/scraperEngine.js';
import { refreshJobsCache, refreshRemoteJobsCache, initAiResultCache, isAiResultCacheReady } from '../cache/index.js';
import { Analytics } from '../models/analyticsModel.js';

let isScraping = false;

/** True while a scrape (daily cron or the admin "Run scraper now" button) is in progress. */
export function isScraperRunning() {
    return isScraping;
}

/**
 * Scrapes every source in SITES_CONFIG once. Started by the 06:00 cron and by
 * the admin "Run scraper now" button (maintenance/taskRunner.js).
 *
 * @param {Object} [opts]
 * @param {(site: string, done: number, total: number) => void} [opts.onProgress] - called before each source
 * @returns {Promise<{ ok: boolean, reason?: string, sources?: number, newJobs?: number }>}
 */
export const runScraper = async function ({ onProgress } = {}) {
    if (isScraping) {
        console.log('Scraper is already running. Skipping this run.');
        return { ok: false, reason: 'The scraper was already running.' };
    }
    isScraping = true;
    console.log("🚀 Starting scrape task...");
    let sources = 0;
    let newJobsTotal = 0;
    let ok = true;

    try {
        // Safety net for a scrape started outside the server boot path: an
        // empty fingerprint cache looks like "nothing analyzed yet" and would
        // re-send every job to the AI. Idempotent — a no-op when already loaded.
        if (!isAiResultCacheReady()) await initAiResultCache();

        // Track "Connected Sources" metric
        const totalSources = SITES_CONFIG.filter(s => s && s.siteName).length;
        await Analytics.setValue('connectedSources', totalSources);
        console.log(`📊 Analytics updated: ${totalSources} connected sources.`);

        const existingIDsMap = await loadAllExistingIDs();

        // Shared across ALL sites — detects same job posted by different legal entities
        // e.g., "Databricks GmbH" on Greenhouse and "Databricks Inc." on Ashby
        const crossEntityKeys = new Map();

        for (const siteConfig of SITES_CONFIG) {
            if (!siteConfig || !siteConfig.siteName) continue;
            onProgress?.(siteConfig.siteName, sources, totalSources);

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

            console.log(`[${siteConfig.siteName}] Found ${newJobs.length} new jobs.`);
            await deleteOldJobs(siteConfig.siteName, scrapeStartTime);
            sources += 1;
            newJobsTotal += newJobs.length;
        }
        onProgress?.('Refreshing caches', sources, totalSources);

        console.log("\n✅ All scraping complete.");

        // ── Refresh the RAM cache so newly approved jobs appear ──────
        // (Most new jobs come in as 'pending_review' and won't enter the
        // cache until an admin approves them — but deleteOldJobs may have
        // removed expired actives. Refresh is cheap, ~150ms.)
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
        isScraping = false;
        console.log("Scrape task finished.");
    }
    return ok
        ? { ok: true, sources, newJobs: newJobsTotal }
        : { ok: false, reason: `Stopped with an error after ${sources} sources (${newJobsTotal} new jobs). Check the server log.`, sources, newJobs: newJobsTotal };
}
