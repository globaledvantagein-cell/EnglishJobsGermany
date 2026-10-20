// ─── Fill missing AI data ────────────────────────────────────────────────────
//
// Two Gemma jobs that live enrichment should have done but did not — e.g. from
// 2026-10-13 every Gemma key was invalid, so ~770 new jobs got no requirements
// and fell back to the keyword category "Other / General Business":
//
//   1. Requirements: every active job without parsedRequirements goes through
//      extractAndStoreRequirements(), the same path live enrichment uses, so the
//      salary fill-in and the filter* fields are written with it.
//   2. Categories: every active job still in the keyword fallback
//      "Other / General Business" is re-sent to the AI categorizer. Those are
//      the jobs whose AI categorization failed; jobs the AI genuinely placed in
//      "Other" just come back unchanged.
//
// A preflight checks every Gemma key (checkGemmaKeys) and aborts with a reason
// naming each rejected key when none works, instead of grinding through
// thousands of failures. With some keys working it runs on those and reports
// the rest; rejected keys are dropped from the rotation.
//
// Used by the admin "Fill missing AI data" button (maintenance/taskRunner.js).

import { connectToDb } from '../db/connection.js';
import { extractAndStoreRequirements } from '../gemma/backgroundExtractor.js';
import { callGemmaWithCascade } from '../gemma/gemmaClient.js';
import { checkGemmaKeys } from '../gemma/keyCheck.js';
import { categorizeJobs } from '../core/categorizer/index.js';

const CONCURRENCY = 6;          // one in-flight call per Gemma key
const CATEGORY_BATCH = 200;     // categorizeJobs batches 25 titles per AI call internally
const FALLBACK_CATEGORY = 'Other / General Business';

/** Friendly reason for a failed preflight; never the raw API error. */
function preflightReason(error) {
    const message = String(error?.message || '');
    if (/API_KEY_INVALID|API key not valid/i.test(message)) return 'The Gemma API keys are invalid. Update GEMMA_API_KEYS on the server and restart it.';
    if (/exhausted|quota|429/i.test(message)) return 'The daily Gemma quota is used up. Try again after midnight UTC.';
    return 'Gemma did not respond. Check the server log, then try again.';
}

/**
 * @param {object} [options]
 * @param {(stage:string, done:number, total:number) => void} [options.onProgress]
 * @returns {Promise<{ok:boolean, reason?:string, requirements:{matched:number, succeeded:number, failed:number},
 *   categories:{matched:number, processed:number}}>}
 */
export async function fillAiData({ onProgress } = {}) {
    const summary = { ok: false, requirements: { matched: 0, succeeded: 0, failed: 0 }, categories: { matched: 0, processed: 0 } };

    const keyCheck = await checkGemmaKeys({ force: true });
    if (keyCheck.valid === 0) return { ...summary, reason: keyCheck.summary };
    if (keyCheck.valid < keyCheck.total) summary.keyWarning = keyCheck.summary;

    try {
        await callGemmaWithCascade('Reply with the single word: ok', 'ok');
    } catch (error) {
        console.warn('[fillAiData] preflight failed:', error.message);
        return { ...summary, reason: preflightReason(error) };
    }

    const db = await connectToDb();
    const jobs = db.collection('jobs');

    // 1. Requirements (also writes salary + filter fields).
    const missing = await jobs.find(
        { Status: 'active', parsedRequirements: { $exists: false } },
        { projection: { DescriptionHtml: 0 } },
    ).toArray();
    summary.requirements.matched = missing.length;

    let cursor = 0;
    let done = 0;
    const lane = async () => {
        while (cursor < missing.length) {
            const job = missing[cursor++];
            const ok = await extractAndStoreRequirements(job).catch(() => false);
            if (ok) summary.requirements.succeeded++; else summary.requirements.failed++;
            onProgress?.('requirements', ++done, missing.length);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, lane));

    // 2. Categories still on the keyword fallback.
    const fallback = await jobs.find(
        { Status: 'active', Category: FALLBACK_CATEGORY, JobTitle: { $exists: true, $ne: null } },
        { projection: { _id: 1, JobID: 1, JobTitle: 1 } },
    ).toArray();
    summary.categories.matched = fallback.length;
    for (let i = 0; i < fallback.length; i += CATEGORY_BATCH) {
        await categorizeJobs(fallback.slice(i, i + CATEGORY_BATCH), 'jobs').catch(err => console.warn('[fillAiData] categorize batch failed:', err.message));
        summary.categories.processed = Math.min(i + CATEGORY_BATCH, fallback.length);
        onProgress?.('categories', summary.categories.processed, fallback.length);
    }

    summary.ok = true;
    return summary;
}
