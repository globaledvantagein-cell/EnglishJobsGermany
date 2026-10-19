// ─── Recompute filter* fields ────────────────────────────────────────────────
//
// Re-derives every canonical filter field (workplace, experience, employment,
// visa, relocation, salary) from what is already on each document. No AI calls:
// pure resolveAll() over a streamed cursor, written back in bulk batches.
//
// Needed whenever the filter rules change (e.g. the 2026-10-20 experience /
// visa / relocation rewrite), because stored filter values only change when a
// job is saved or enriched.
//
// Used by the admin "Recompute filters" button (maintenance/taskRunner.js) and
// by the CLI wrapper src/migrations/backfill-filter-fields.js.

import { connectToDb } from '../db/connection.js';
import { resolveAll } from '../utils/filterNormalizer.js';

const BATCH_SIZE = 500;

// Only the fields resolveAll() reads. Description is needed since visa and
// relocation also read the ad text; DescriptionHtml is left out.
const PROJECTION = {
    Description: 1,
    JobTitle: 1, Company: 1, Location: 1, filterExperience: 1,
    WorkplaceType: 1, ExperienceLevel: 1, EmploymentType: 1,
    IsRemote: 1, isEntryLevel: 1, filterVisa: 1, filterRelocation: 1,
    SalaryMin: 1, SalaryMax: 1, SalaryCurrency: 1, SalaryInterval: 1,
    parsedRequirements: 1,
};

// The bug the 2026-10-20 experience rewrite targets: senior-titled jobs in entry.
const SENIOR_TITLE = /\b(senior|sr\.?|lead|staff|principal|head of|director|vp|chief)\b/i;

function createFacetCounts() {
    return {
        workplace: { remote: 0, hybrid: 0, onsite: 0, null: 0 },
        experience: { entry: 0, mid: 0, senior: 0, lead: 0, executive: 0, null: 0 },
        employment: { fulltime: 0, parttime: 0, contract: 0, internship: 0, null: 0 },
        visa: { available: 0, null: 0 },
        relocation: { available: 0, null: 0 },
        salary: { ats: 0, jd: 0, null: 0 },
    };
}

function tallyFacets(counts, filterFields) {
    counts.workplace[filterFields.filterWorkplace ?? 'null'] += 1;
    counts.experience[filterFields.filterExperience ?? 'null'] += 1;
    counts.employment[filterFields.filterEmployment ?? 'null'] += 1;
    counts.visa[filterFields.filterVisa ?? 'null'] += 1;
    counts.relocation[filterFields.filterRelocation ?? 'null'] += 1;
    counts.salary[filterFields.filterSalaryTier ?? 'null'] += 1;
}

/**
 * Recompute filter fields for one collection.
 *
 * @param {object} [options]
 * @param {'jobs'|'remoteJobs'} [options.collectionName='jobs']
 * @param {boolean} [options.all=true]   every active job, or only ones never backfilled
 * @param {boolean} [options.dryRun=false]
 * @param {number|null} [options.limit=null]
 * @param {(done:number, total:number) => void} [options.onProgress]
 * @returns {Promise<{collection:string, matched:number, processed:number, updated:number,
 *   counts:object, experienceMoves:object, seniorInEntryBefore:number, seniorInEntryAfter:number}>}
 */
export async function recomputeFilters({ collectionName = 'jobs', all = true, dryRun = false, limit = null, onProgress } = {}) {
    const db = await connectToDb();
    const collection = db.collection(collectionName);
    const query = all
        ? { Status: 'active' }
        : { Status: 'active', filterWorkplace: { $exists: false } };

    const matched = await collection.countDocuments(query);
    const total = limit ? Math.min(limit, matched) : matched;
    let cursor = collection.find(query, { projection: PROJECTION }).batchSize(BATCH_SIZE);
    if (limit) cursor = cursor.limit(limit);

    const counts = createFacetCounts();
    const experienceMoves = {};
    let processed = 0;
    let updated = 0;
    let seniorInEntryBefore = 0;
    let seniorInEntryAfter = 0;
    let operations = [];

    const flush = async () => {
        if (operations.length === 0) return;
        if (dryRun) {
            updated += operations.length;
        } else {
            const result = await collection.bulkWrite(operations, { ordered: false });
            updated += result.modifiedCount || 0;
        }
        operations = [];
        onProgress?.(processed, total);
    };

    // Streamed: holding every description at once is ~25 MB on a server whose
    // heap is capped at 768 MB (ecosystem.config.cjs).
    for await (const job of cursor) {
        processed += 1;
        const filterFields = resolveAll(job);
        tallyFacets(counts, filterFields);

        const before = job.filterExperience ?? 'null';
        const after = filterFields.filterExperience ?? 'null';
        if (before !== after) experienceMoves[`${before} → ${after}`] = (experienceMoves[`${before} → ${after}`] || 0) + 1;
        if (SENIOR_TITLE.test(job.JobTitle || '')) {
            if (before === 'entry') seniorInEntryBefore += 1;
            if (after === 'entry') seniorInEntryAfter += 1;
        }

        operations.push({
            updateOne: {
                filter: { _id: job._id },
                update: { $set: { ...filterFields, filterBackfilledAt: new Date() } },
            },
        });
        if (operations.length >= BATCH_SIZE) await flush();
    }
    await flush();

    return { collection: collectionName, matched, processed, updated, counts, experienceMoves, seniorInEntryBefore, seniorInEntryAfter };
}
