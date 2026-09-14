import { connectToDb } from '../connection.js';
import { SITES_CONFIG } from '../../config.js';
import { createJobModel } from '../../models/jobModel.js';
import { categorizeJobFallback, mapLegacyCategory } from '../../core/categorize.js';
import { resolveWorkplace } from '../../utils/filterNormalizer.js';

export async function loadAllExistingIDs() {
    const db = await connectToDb();
    const jobsCollection = db.collection('jobs');
    const existingIDsMap = new Map();
    for (const siteConfig of SITES_CONFIG) {
        const siteName = siteConfig.siteName;
        const idSet = new Set();
        const jobs = await jobsCollection.find({ sourceSite: siteName }, { projection: { JobID: 1 } }).toArray();
        jobs.forEach(job => idSet.add(job.JobID));
        existingIDsMap.set(siteName, idSet);
        console.log(`[${siteName}] Found ${idSet.size} existing jobs in the database.`);
    }
    return existingIDsMap;
}

/**
 * Which collection a job belongs in.
 *
 * Fully-remote roles live in `remoteJobs` and surface on /remote-jobs; /jobs is
 * the Germany on-site/hybrid board. Saving a remote role into `jobs` put it on
 * a page that now filters it straight back out, so it was invisible everywhere.
 *
 * filterWorkplace is usually NOT set yet at save time — createJobModel() does
 * not produce it, and the Gemma enrichment that does runs after the job has an
 * _id. So resolveWorkplace() derives it here from the same inputs
 * (parsedRequirements → WorkplaceType → Location), which is exactly what the
 * enrichment will later persist. A job already carrying the field keeps it.
 */
function targetCollectionFor(job) {
    const workplace = job.filterWorkplace ?? resolveWorkplace(job);
    return workplace === 'remote' ? 'remoteJobs' : 'jobs';
}

/** The upsert op for one job — identical shape for both collections. */
function buildUpsertOp(job) {
    // `Category` must never appear in $set — see below. Strip it off the
    // incoming model so a stale value on the object can't sneak back in.
    const { createdAt, updatedAt, Category: _incomingCategory, ...pureJobData } = job;

    // Category is written ON INSERT ONLY.
    //
    // It used to be recomputed and $set on every upsert, which meant each
    // re-scrape of an existing job overwrote the AI-assigned category
    // (core/categorizer/) with the coarse keyword slug — the AI value
    // survived only until the job was next seen.
    //
    // $setOnInsert gives a brand-new job an immediate keyword category so
    // it is never uncategorized, and the fire-and-forget AI enrichment
    // refines it moments later. On update Mongo ignores this entirely, so
    // whatever the categorizer wrote stays put.
    // The keyword classifier still returns an old slug, which is not one of
    // the 28 filterable values — mapped forward so a job is filterable from
    // the instant it is inserted, not only once the AI enrichment lands.
    const fallbackCategory =
        mapLegacyCategory(categorizeJobFallback(pureJobData)) || 'Other / General Business';

    return {
        updateOne: {
            filter: { JobID: job.JobID, sourceSite: job.sourceSite },
            update: {
                $set: {
                    ...pureJobData,
                    updatedAt: new Date(),
                    scrapedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    Category: fallbackCategory,
                }
            },
            upsert: true,
        },
    };
}

/**
 * Persist scraped jobs, routing each to its vertical's collection.
 *
 * @returns {Promise<{ jobs: number, remoteJobs: number }>} how many went where
 */
export async function saveJobs(jobs) {
    if (jobs.length === 0) return { jobs: 0, remoteJobs: 0 };
    const db = await connectToDb();

    const byCollection = { jobs: [], remoteJobs: [] };
    for (const job of jobs) byCollection[targetCollectionFor(job)].push(job);

    for (const [collectionName, group] of Object.entries(byCollection)) {
        if (group.length === 0) continue;
        await db.collection(collectionName).bulkWrite(group.map(buildUpsertOp));
    }

    if (byCollection.remoteJobs.length > 0) {
        console.log(`   -> [Save] ${byCollection.jobs.length} to jobs, ${byCollection.remoteJobs.length} to remoteJobs (fully remote)`);
    }

    return { jobs: byCollection.jobs.length, remoteJobs: byCollection.remoteJobs.length };
}


/**
 * Re-read jobs that saveJobs() just upserted, so callers get the persisted
 * documents *with* their Mongo-assigned `_id`.
 *
 * The scraper needs this because the models returned by processJob() have no
 * `_id` yet — and extractAndStoreRequirements() bails out immediately on a job
 * without one. Scoped to a single sourceSite to keep the query on the same
 * index saveJobs() upserts against.
 *
 * @param {string[]} jobIDs
 * @param {string} sourceSite
 * @returns {Promise<object[]>}
 */
export async function findSavedJobsByJobIDs(jobIDs, sourceSite, collectionName = 'jobs') {
    if (!Array.isArray(jobIDs) || jobIDs.length === 0) return [];
    const db = await connectToDb();
    return await db.collection(collectionName)
        .find({ JobID: { $in: jobIDs }, sourceSite })
        .toArray();
}

export async function addCuratedJob(jobData) {
    if (!jobData.JobTitle || !jobData.ApplicationURL || !jobData.Company) {
        throw new Error('Job Title, URL, and Company are required.');
    }
    const db = await connectToDb();
    const jobsCollection = db.collection('jobs');
    const existingJob = await jobsCollection.findOne({ ApplicationURL: jobData.ApplicationURL });
    if (existingJob) {
        throw new Error('This Application URL already exists in the database.');
    }
    const jobID = `curated-${new Date().getTime()}`;

    const jobToSave = createJobModel({
        JobID: jobID,
        JobTitle: jobData.JobTitle,
        ApplicationURL: jobData.ApplicationURL,
        Company: jobData.Company,
        Location: jobData.Location,
        Department: jobData.Department,
        GermanRequired: jobData.GermanRequired ?? false,
        Description: jobData.Description || `Manually curated: ${jobData.JobTitle}`,
        PostedDate: jobData.PostedDate || new Date().toISOString(),
        ContractType: jobData.ContractType,
        ExperienceLevel: jobData.ExperienceLevel,
        isManual: true,
        Status: 'active'
    }, "Curated");

    await saveJobs([jobToSave]);
    return jobToSave;
}
