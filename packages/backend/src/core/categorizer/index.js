// ─── AI Categorizer ────────────────────────────────────────────────────────────
//
// Assigns the Category field using Gemma instead of keyword matching. The old
// keyword classifier could only resolve 6 coarse buckets and mis-filed anything
// its keyword lists had never seen; this asks a model to pick one of 28.
//
// Classification is TITLE-ONLY by design. A job title is ~10 tokens, so a batch
// of 25 costs about as much as one description would — which is what makes it
// affordable to run over every job. Descriptions, companies and other fields are
// deliberately never sent.
//
// Every call goes through callGemmaWithCascade, so this shares the key pool and
// daily usage accounting with requirement extraction and resume parsing.

import { connectToDb } from '../../db/connection.js';
import { callGemmaWithCascade } from '../../gemma/gemmaClient.js';
import { getJobById, upsertJob } from '../../cache/jobsCache.js';

/**
 * The 28 categories. Exported so the frontend can render the filter list from
 * the same source the classifier is constrained to.
 */
export const CATEGORIES = [
    'Software Engineering', 'Sales', 'Operations & Strategy', 'Marketing & Growth',
    'Finance & Accounting', 'Hardware & Systems', 'Customer Success & Support',
    'Data & Analytics', 'Supply Chain & Manufacturing', 'Retail & Facilities',
    'Product Management', 'AI / ML', 'Solutions & Pre-Sales', 'HR & People',
    'IT & Enterprise Systems', 'Legal & Compliance', 'Cybersecurity',
    'Education & Training', 'Design', 'Research & Clinical', 'Consulting',
    'Domain Specialist', 'Localization', 'Administration', 'Gaming & Entertainment',
    'Trust & Safety', 'Other / General Business', 'Other / Open Application',
];

const CATEGORY_SET = new Set(CATEGORIES);

/** Where an unrecognised or missing model answer lands. */
const FALLBACK_CATEGORY = 'Other / General Business';

// Measured ceiling, NOT an arbitrary choice. gemma-4-26b-a4b-it is a reasoning
// model, and its thinking trace does not scale smoothly with batch size — past
// ~15 titles it drops into a long deliberation loop and never returns:
//
//   n=10  200 OK in 35.1s, returned 10/10
//   n=15  200 OK in 32.5s, returned 15/15
//   n=20  timed out at 240s
//   n=25  timed out at 300s (undici's default body timeout), 3/3 runs
//
// 25 — the size this was first written with — categorizes nothing at all.
const BATCH_SIZE = 15;

// Retry size for a batch that failed. The stall is driven by title AMBIGUITY,
// not batch size alone: over three runs on the same 30 jobs, the batch of clear
// titles succeeded 3/3 while the batch containing hybrids ("Manager, Customer
// Success Engineer", "Group PM / Principal Product Manager") failed 3/3 on first
// attempt. Splitting isolates the one or two titles the model deliberates over
// instead of losing all 15. At this size Gemma returns in 8-20s.
const SUB_BATCH_SIZE = 5;

// Values written by the old keyword classifier. These are slugs, not labels —
// `categorizeJob()` in core/categorize/ returns 'software', not 'Software
// Engineering'. Anything carrying one of these needs reclassifying.
const LEGACY_SLUGS = [
    'software', 'data', 'product_tech', 'other_tech', 'product_nontech', 'other_nontech',
];

// The old CATEGORY_LABELS values, in case any document stored the label rather
// than the slug. 'Software Engineering' is deliberately absent: it exists in
// both the old and new sets and is already correct.
const LEGACY_LABELS = [
    'Data / AI', 'Product (Tech)', 'Other Technical', 'Product (Non-Tech)', 'Other Non-Technical',
];

const SYSTEM_PROMPT = `You are a job title classifier. Classify each job title into EXACTLY ONE of these 28 categories:

${CATEGORIES.map(c => `- ${c}`).join('\n')}

RULES:
- Use ONLY the category names listed above, copied character-for-character.
- Judge from the title alone. Do not invent categories.
- "Domain Specialist" is for roles requiring deep industry expertise that fits no other bucket (e.g. actuary, geologist, flight instructor).
- "Other / Open Application" is for speculative/unsolicited postings ("Open Application", "Initiativbewerbung", "Can't find your role?").
- "Other / General Business" is the last resort when nothing else fits.

Return ONLY a JSON array, no markdown fences, no preamble:
[{"id": 1, "category": "Software Engineering"}, {"id": 2, "category": "Sales"}]

Return one object per input title, using the id number given.`;

/** Split an array into fixed-size chunks. */
function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * Parse the model's reply into an array. Mirrors the tolerant parsing used by
 * extractRequirements(): strip fences, try JSON, then regex out the array.
 */
function parseJsonArray(raw) {
    if (!raw || typeof raw !== 'string') {
        throw new Error('[Categorizer] Empty response');
    }
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }

    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
    }

    throw new Error('[Categorizer] Response was not a JSON array');
}

/**
 * Constrain a model answer to the allowed set. Case/whitespace differences are
 * tolerated; anything genuinely off-list becomes the fallback rather than
 * poisoning the categoryIndex with a one-off value.
 */
function normalizeCategory(value) {
    if (typeof value !== 'string') return FALLBACK_CATEGORY;
    const trimmed = value.trim();
    if (CATEGORY_SET.has(trimmed)) return trimmed;

    const lower = trimmed.toLowerCase();
    const match = CATEGORIES.find(c => c.toLowerCase() === lower);
    return match || FALLBACK_CATEGORY;
}

/**
 * Classify one batch and persist the results.
 * @returns {Promise<number>} how many jobs were successfully categorized
 */
async function categorizeBatch(batch, collectionName, db) {
    // The model is asked to echo back a 1-based list index rather than an
    // ObjectId — ids are long, cost tokens, and models routinely corrupt them.
    const userMessage = batch
        .map((job, i) => `${i + 1}. ${String(job.JobTitle || '').slice(0, 200)}`)
        .join('\n');

    const raw = await callGemmaWithCascade(SYSTEM_PROMPT, userMessage);
    const rows = parseJsonArray(raw);

    const operations = [];
    const applied = [];

    for (const row of rows) {
        const index = Number(row?.id) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= batch.length) continue; // hallucinated id
        const job = batch[index];
        if (!job?._id) continue;

        const category = normalizeCategory(row.category);
        operations.push({
            updateOne: { filter: { _id: job._id }, update: { $set: { Category: category } } },
        });
        applied.push({ job, category });
    }

    if (operations.length === 0) return 0;

    await db.collection(collectionName).bulkWrite(operations, { ordered: false });

    // Keep the RAM cache in step so categoryIndex reflects the new value without
    // waiting for a refresh. Only the main cache is touched here — remoteJobs
    // changes reach their cache through the change-stream watcher, and Category
    // is already in its SIGNIFICANT_FIELDS list.
    if (collectionName === 'jobs') {
        for (const { job, category } of applied) {
            try {
                const cached = job.JobID ? getJobById(job.JobID) : null;
                if (cached) upsertJob({ ...cached, Category: category });
            } catch { /* cache not ready — the next refresh picks it up */ }
        }
    }

    return applied.length;
}

/**
 * Classify an array of jobs and write the Category field.
 *
 * Each job needs `_id` and `JobTitle`. A failing batch is retried in
 * sub-batches of SUB_BATCH_SIZE rather than abandoned, so one runaway response
 * costs a handful of jobs instead of fifteen. Anything still uncategorized
 * after that is picked up by categorizeUncategorized() later.
 *
 * @param {object[]} jobs
 * @param {string} [collectionName='jobs'] - 'jobs' or 'remoteJobs'
 * @returns {Promise<{ total: number, success: number }>}
 */
export async function categorizeJobs(jobs, collectionName = 'jobs') {
    const candidates = (Array.isArray(jobs) ? jobs : []).filter(j => j?._id && j?.JobTitle);
    if (candidates.length === 0) return { total: 0, success: 0 };

    const db = await connectToDb();
    const batches = chunk(candidates, BATCH_SIZE);
    let success = 0;

    for (let b = 0; b < batches.length; b++) {
        try {
            const count = await categorizeBatch(batches[b], collectionName, db);
            success += count;
            console.log(`[Categorizer] Batch ${b + 1}/${batches.length}: categorized ${count} jobs`);
        } catch (error) {
            // Don't abandon 15 jobs over one runaway response. Retry the same
            // work in smaller pieces so only the genuinely problematic titles
            // are lost. categorizeBatch() is reused verbatim — same prompt,
            // same client call, same write path, just fewer titles.
            console.warn(
                `[Categorizer] Batch ${b + 1}/${batches.length} failed (${error.message}), ` +
                `splitting into sub-batches of ${SUB_BATCH_SIZE}`
            );

            const subBatches = chunk(batches[b], SUB_BATCH_SIZE);
            for (let s = 0; s < subBatches.length; s++) {
                const subBatch = subBatches[s];
                try {
                    const count = await categorizeBatch(subBatch, collectionName, db);
                    success += count;
                    console.log(`[Categorizer] Sub-batch ${s + 1}/${subBatches.length}: categorized ${count} jobs`);
                } catch (subError) {
                    // A sub-batch that fails too holds the title the model
                    // cannot settle on. Give up on these five — they stay
                    // uncategorized for categorizeUncategorized() to sweep.
                    console.warn(
                        `[Categorizer] Sub-batch ${s + 1}/${subBatches.length} failed: ` +
                        `${subError.message}. ${subBatch.length} jobs skipped.`
                    );
                }
            }
        }
    }

    console.log(`[Categorizer] Complete: ${success}/${candidates.length} jobs categorized`);
    return { total: candidates.length, success };
}

/**
 * Single-job convenience wrapper, for categorizing right after one job is
 * accepted. Batches of one are wasteful, so prefer categorizeJobs() when you
 * already have a group.
 */
export async function categorizeJob(job, collectionName = 'jobs') {
    return categorizeJobs([job], collectionName);
}

/**
 * Find and classify everything that has no usable category: never categorized,
 * or still carrying a value from the old 6-bucket keyword classifier.
 *
 * @param {string} [collectionName='jobs']
 * @param {number} [limit=1000] - ceiling per run, so a first pass over a large
 *        backlog cannot spend the whole daily Gemma budget in one go.
 */
export async function categorizeUncategorized(collectionName = 'jobs', limit = 1000) {
    const db = await connectToDb();

    const query = {
        $or: [
            { Category: null },
            { Category: { $exists: false } },
            { Category: { $in: [...LEGACY_SLUGS, ...LEGACY_LABELS] } },
        ],
        JobTitle: { $exists: true, $ne: null },
    };

    const pending = await db.collection(collectionName)
        .find(query, { projection: { _id: 1, JobID: 1, JobTitle: 1 } })
        .limit(limit)
        .toArray();

    if (pending.length === 0) {
        console.log(`[Categorizer] ${collectionName}: nothing uncategorized`);
        return { total: 0, success: 0 };
    }

    const remaining = await db.collection(collectionName).countDocuments(query);
    console.log(`[Categorizer] ${collectionName}: ${pending.length} of ${remaining} uncategorized jobs this run`);

    return categorizeJobs(pending, collectionName);
}
