import { initializeSession, fetchJobsPage } from './network.js';
import { shouldContinuePaging } from './pagination.js';
import { processJob } from './processJob.js';
import { saveJobs, findSavedJobsByJobIDs } from '../db/index.js';
import { extractAndStoreRequirements } from '../gemma/index.js';
import { categorizeJobs } from './categorizer/index.js';
import { isGeminiBudgetExhausted } from '../gemini/geminiClient.js';
import { upsertRemoteJob } from '../cache/remoteJobsCache.js';
import { resolveWorkplace } from '../utils/filterNormalizer.js';
import { sleep } from '../utils.js';
import { pingIndexNowAsync, jobUrl } from '../utils/indexNow.js';

/**
 * Kick off Gemma requirement extraction for the auto-published jobs in a batch.
 *
 * Fire-and-forget by design: extraction is a slow AI call and must never hold up
 * the scraper loop, so each job is scheduled via setImmediate and its failure is
 * swallowed with a warning. A job that misses out simply stays live without
 * parsedRequirements, exactly like one whose admin-approval extraction failed —
 * the backfill migration picks those up later.
 *
 * Only the one DB read is awaited, so a save failure can't silently skip jobs.
 *
 * @param {object[]} savedBatch - job models just passed to saveJobs()
 * @param {string} siteName - sourceSite the batch belongs to
 */
async function scheduleAutoPublishEnrichment(savedBatch, siteName, collectionName = 'jobs') {
    const autoPublishedIDs = savedBatch
        .filter(job => job.Status === 'active' && job.approvalMethod === 'ai_auto')
        .map(job => job.JobID);
    if (autoPublishedIDs.length === 0) return;

    try {
        const savedDocs = await findSavedJobsByJobIDs(autoPublishedIDs, siteName, collectionName);
        for (const doc of savedDocs) {
            setImmediate(() => {
                extractAndStoreRequirements(doc).catch(err =>
                    console.warn(`[Gemma] Auto-publish extraction error for ${doc.JobID}: ${err.message}`)
                );
            });
        }

        // Categorization rides the same fire-and-forget contract, but as ONE
        // batched call for the whole group rather than one per job — the
        // classifier takes 25 titles per Gemma request, so per-job calls would
        // cost 25x the budget for the same work. A failure here leaves Category
        // as-is and categorizeUncategorized() sweeps it up later.
        setImmediate(() => {
            categorizeJobs(savedDocs, collectionName).catch(err =>
                console.warn(`[Categorizer] Auto-publish categorization error: ${err.message}`)
            );
        });

        // A direct bulkWrite does not go through the remote watcher when it is
        // in polling mode, so push remote rows into the remote cache explicitly.
        // upsertRemoteJob is idempotent — a duplicate from the change stream is
        // a no-op replace, not a second entry.
        if (collectionName === 'remoteJobs') {
            for (const doc of savedDocs) upsertRemoteJob(doc);
        }

        // Announce the new live URLs to IndexNow (Bing/Yandex/Seznam/Naver).
        // Fire-and-forget: pingIndexNowAsync schedules the POST and returns, so
        // the scrape loop never waits on it and a failure can't abort the batch.
        // savedDocs is the right source — these are the read-back documents, so
        // they carry the Mongo _id the public URL is built from.
        pingIndexNowAsync(savedDocs.map(doc => jobUrl(doc, collectionName)));

        console.log(`   -> [Auto-Publish] Scheduled Gemma extraction + categorization for ${savedDocs.length} ${collectionName} job(s)`);
    } catch (err) {
        console.warn(`[Auto-Publish] Could not schedule extraction: ${err.message}`);
    }
}

export async function scrapeSite(siteConfig, existingIDsMap, crossEntityKeys) {
    const siteName = siteConfig.siteName;
    const existingIDs = existingIDsMap.get(siteName) || new Set();
    const allNewJobs = [];
    
    const limit = siteConfig.limit || 20;
    let offset = 0;
    let hasMore = true;
    let totalJobs = 0;
    // Set when the Gemini daily budget runs out mid-scrape. Everything already
    // processed is kept and saved; we simply stop asking for more analysis.
    let budgetExhausted = false;
    let processedCount = 0;

    console.log(`\n--- Starting scrape for [${siteName}] ---`);

    try {
        const sessionHeaders = await initializeSession(siteConfig);

        while (hasMore) {
            const scrapeStartTime = new Date();
            console.log(`[${siteName}] Fetching page with offset: ${offset}...`);
            const data = await fetchJobsPage(siteConfig, offset, limit, sessionHeaders);
            const jobs = siteConfig.getJobs(data);

            if (!jobs || jobs.length === 0) {
                break;
            }

            if (offset === 0 && siteConfig.getTotal) {
                totalJobs = siteConfig.getTotal(data);
            }

            // Batch size 1 = Sequential processing
            const batchSize = 1; 
            
            for (let i = 0; i < jobs.length; i += batchSize) {
                // Checked BEFORE any AI call: once every cascade model is spent
                // on every key, further jobs can only fail. Stop cleanly and let
                // tomorrow's run pick them up.
                if (isGeminiBudgetExhausted()) {
                    const jobNumber = offset + i + 1;
                    const remaining = jobs.length - i;
                    console.warn(
                        `[Scraper] AI budget exhausted. Stopping scrape at job #${jobNumber}. ` +
                        `Processed ${processedCount} jobs, ${remaining} remaining will be retried tomorrow.`
                    );
                    budgetExhausted = true;
                    break;
                }

                const batch = jobs.slice(i, i + batchSize);

                batch.forEach((rawJob, index) => {
                    const jobTitle = rawJob._source ? rawJob._source.title : (rawJob.titel || rawJob.title || rawJob.PositionTitle || rawJob.job_title || rawJob.name || rawJob.jobFields?.jobTitle);
                    const jobNumber = offset + i + index + 1;
                    console.log(`\n  #${jobNumber}: Analyzing: ${jobTitle}`);
                });

                const jobPromises = batch.map(rawJob => 
                    processJob(rawJob, siteConfig, existingIDs, sessionHeaders, null, crossEntityKeys)
                );
                
                const processedJobs = await Promise.all(jobPromises);
                processedCount += batch.length;
                const newJobsInBatch = processedJobs.filter(job => job !== null);

                if (newJobsInBatch.length > 0) {
                    console.log(`   -> Saving ${newJobsInBatch.length} valid job(s)...`);
                    const jobsToSave = newJobsInBatch.map(job => ({ ...job, scrapedAt: scrapeStartTime }));
                    await saveJobs(jobsToSave);

                    // Auto-published jobs are live the moment they're saved, so they
                    // need the same enrichment an admin approval would have triggered:
                    // Gemma requirements + the filter* fields resolveAll() derives from
                    // them. This has to happen HERE rather than in processJob() — the
                    // models it returns have no _id until saveJobs() upserts them, and
                    // extractAndStoreRequirements() no-ops without one.
                    //
                    // saveJobs() routes fully-remote roles to `remoteJobs`, so the
                    // enrichment must look them up in the collection they landed in —
                    // otherwise findSavedJobsByJobIDs finds nothing and they silently
                    // miss requirements + categorization.
                    const remoteSaved = jobsToSave.filter(job => (job.filterWorkplace ?? resolveWorkplace(job)) === 'remote');
                    const mainSaved   = jobsToSave.filter(job => (job.filterWorkplace ?? resolveWorkplace(job)) !== 'remote');

                    await scheduleAutoPublishEnrichment(mainSaved, siteName, 'jobs');
                    await scheduleAutoPublishEnrichment(remoteSaved, siteName, 'remoteJobs');

                    allNewJobs.push(...newJobsInBatch);
                    newJobsInBatch.forEach(job => existingIDs.add(job.JobID));
                }

                // 2s between jobs is safe: 3 keys × 15 RPM = 45 RPM capacity.
                // The AI layer's KeyState handles any burst automatically.
                if (i + batchSize < jobs.length) {
                    await sleep(2000); 
                }
            }
            
            if (budgetExhausted) break;

            hasMore = shouldContinuePaging(siteConfig, jobs, offset, limit, totalJobs);
            offset += limit;
        }
    } catch (error) {
        console.error(`[${siteName}] ERROR during scrape: ${error.message}.`);
    }

    if (allNewJobs.length > 0) {
        console.log(`\n[${siteName}] Finished. Found ${allNewJobs.length} total new jobs.`);
    } else {
        console.log(`\n[${siteName}] No new jobs found.`);
    }
    return allNewJobs;
}