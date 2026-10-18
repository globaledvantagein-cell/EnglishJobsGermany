// ─── Resume Matcher — Scoring (Pass A + Pass B) ────────────────────────────────
//
// Step 3 of the pipeline. Two passes, both SEQUENTIAL (Gemini RPM limits):
//   Pass A — coarse: batches of 20, returns top 20 by score.
//   Pass B — deep:   batches of 10 over those 20, full descriptions, top 15.
//
// A single bad batch (Gemini error / unparseable JSON) is logged and SKIPPED.
// Only when EVERY batch in a pass fails do we throw.
//
// Candidates arrive ranked by the deterministic fit engine (filterJobs.js).
// Two guards against LLM ranking noise:
//   - Pass A input is shuffled, so batches are not ordered best-first: LLM
//     list rankers are measurably position-biased (see e.g. arXiv 2608.03091),
//     and a best-first order would just echo the engine's ranking back.
//   - The final score blends the AI score with the engine's fit score, which
//     steadies run-to-run variance and keeps tiers consistent with the
//     breakdown the UI shows.

import { connectToDb } from '../db/connection.js';
import { callGemini } from '../gemini/geminiClient.js';
import { jobBadges } from '../matching/index.js';
import {
    getPassASystemPrompt,
    getPassBSystemPrompt,
} from './prompts.js';
import {
    buildPassAUserMessage,
    buildPassBUserMessage,
} from './promptBuilders.js';

// Scoring shares the process-wide Gemini key pool (src/gemini/keyManager.js)
// with the scraper, so a key the scraper just rate-limited is skipped here too.
const MODEL = process.env.RESUME_MATCHER_MODEL || 'gemini-2.5-flash-lite';

/** One scoring call through the shared Gemini client. */
function scoreWithGemini(systemPrompt, userMessage, label) {
    return callGemini({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: systemPrompt,
        label,
    });
}

const PASS_A_BATCH_SIZE = 25;
const PASS_B_BATCH_SIZE = 15;
const PASS_A_TOP_N = 15;
const PASS_B_TOP_N = 15;
const DELAY_BETWEEN_BATCHES_MS = 250;

// Share of the final score taken from the AI; the rest is the engine's fit.
const AI_WEIGHT = 0.7;

function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/** AI score (0–100) blended with the engine's fit (0–1). */
function blendedScore(aiScore, fit) {
    if (!fit) return Math.round(aiScore);
    return Math.round(AI_WEIGHT * aiScore + (1 - AI_WEIGHT) * fit.score * 100);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robustly parses a model response into a JSON array.
 *   strip fences → JSON.parse → regex-extract [...] → JSON.parse
 * Throws if nothing parses into an array.
 */
function parseJsonArray(raw) {
    if (!raw || typeof raw !== 'string') {
        throw new Error('[ResumeMatch] Empty scoring response');
    }

    let cleaned = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // fall through
    }

    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
    }

    throw new Error('[ResumeMatch] Scoring response was not a JSON array');
}

/**
 * Splits an array into fixed-size chunks.
 */
function chunk(items, size) {
    const batches = [];
    for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
    }
    return batches;
}

/**
 * Maps a tier label from a numeric score.
 */
function tierFromScore(score) {
    if (score >= 85) return 'strong';
    if (score >= 65) return 'good';
    return 'partial';
}

/**
 * Hydrates the scoring-only fields (Description, parsedRequirements) that the
 * RAM cache deliberately excludes since the cache-projection change — both
 * prompt builders need them, so without this every job reaches Gemini with an
 * empty description and the shortlist is garbage.
 *
 * Returns SHALLOW COPIES: the cached job objects are shared and must stay
 * lean, so the heavy fields are attached to per-request copies that are GC'd
 * when scoring finishes. One $in query for the whole set.
 */
async function hydrateScoringFields(jobs) {
    if (jobs.length === 0) return jobs;

    const copies = jobs.map(job => ({ ...job }));
    // Any job without a Description needs the fetch — Pass B always wants the
    // full text, even when parsedRequirements (cached) already covers Pass A.
    const missing = copies.filter(job => !job.Description);
    if (missing.length === 0) return copies;

    const db = await connectToDb();
    const docs = await db.collection('jobs')
        .find(
            { _id: { $in: missing.map(job => job._id) } },
            { projection: { Description: 1, parsedRequirements: 1 } },
        )
        .toArray();
    const byId = new Map(docs.map(doc => [String(doc._id), doc]));

    for (const job of missing) {
        const full = byId.get(String(job._id));
        if (!full) continue;
        if (full.Description) job.Description = full.Description;
        if (full.parsedRequirements) job.parsedRequirements = full.parsedRequirements;
    }

    return copies;
}

/**
 * Pass A — coarse scoring. Returns the top PASS_A_TOP_N jobs (job + score + reason),
 * sorted by score descending.
 */
async function runPassA(profile, jobs) {
    const batches = chunk(jobs, PASS_A_BATCH_SIZE);
    const scored = [];
    let failedBatches = 0;

    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        try {
            const raw = await scoreWithGemini(
                getPassASystemPrompt(),
                buildPassAUserMessage(profile, batch),
                `Pass A batch ${b + 1}/${batches.length}`,
            );
            const rows = parseJsonArray(raw);

            for (const row of rows) {
                let job = null;
                if (typeof row.index === 'number') {
                    job = batch[row.index] || batch[row.index - 1]; // handle 0-based or 1-based
                }
                if (!job && row.jobId) {
                    job = batch.find(j => String(j._id) === String(row.jobId) || String(j.JobID) === String(row.jobId));
                }
                if (!job) continue;                // ignore hallucinated indexes
                const score = Number(row.score);
                if (Number.isNaN(score)) continue;
                scored.push({ job, score, reason: row.reason || '' });
            }

            // Lightweight models sometimes return fewer rows than jobs. A
            // skipped job keeps competing on its engine fit instead of vanishing.
            const answered = new Set(scored.map(entry => entry.job));
            for (const job of batch) {
                if (!answered.has(job) && job._fit) scored.push({ job, score: Math.round(job._fit.score * 100), reason: '', aiSkipped: true });
            }
        } catch (error) {
            failedBatches++;
            console.warn(`[ResumeMatch] Pass A batch ${b + 1}/${batches.length} failed: ${error.message}`);
        }

        if (b < batches.length - 1) await sleep(DELAY_BETWEEN_BATCHES_MS);
    }

    if (failedBatches === batches.length) {
        throw new Error('[ResumeMatch] Pass A failed — all batches errored');
    }

    return scored
        .sort((a, b) => blendedScore(b.score, b.job._fit) - blendedScore(a.score, a.job._fit))
        .slice(0, PASS_A_TOP_N);
}

/**
 * Pass B — deep scoring over the shortlist. Returns up to PASS_B_TOP_N enriched
 * results sorted by score descending.
 */
async function runPassB(profile, shortlist) {
    const shortlistedJobs = shortlist.map(entry => entry.job);
    const batches = chunk(shortlistedJobs, PASS_B_BATCH_SIZE);
    const results = [];
    let failedBatches = 0;

    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        try {
            const raw = await scoreWithGemini(
                getPassBSystemPrompt(),
                buildPassBUserMessage(profile, batch),
                `Pass B batch ${b + 1}/${batches.length}`,
            );
            const rows = parseJsonArray(raw);

            for (const row of rows) {
                let job = null;
                if (typeof row.index === 'number') {
                    job = batch[row.index] || batch[row.index - 1];
                }
                if (!job && row.jobId) {
                    job = batch.find(j => String(j._id) === String(row.jobId) || String(j.JobID) === String(row.jobId));
                }
                if (!job) continue;
                const aiScore = Number(row.score);
                if (Number.isNaN(aiScore)) continue;
                const fit = job._fit || null;
                const score = blendedScore(aiScore, fit);
                const aiMissing = Array.isArray(row.missing_skills) ? row.missing_skills : [];

                results.push({
                    jobId: String(job._id),
                    score,
                    ai_score: aiScore,
                    tier: tierFromScore(score),
                    // Engine breakdown (skills, experience, seniority, role, preferences).
                    fit: fit ? {
                        score: Math.round(fit.score * 100),
                        confidence: Math.round(fit.confidence * 100),
                        dimensions: fit.dimensions,
                        requiredCount: fit.requiredCount,
                        matchedRequired: fit.matchedRequired,
                        semantic: job._semantic != null ? Math.round(job._semantic * 100) / 100 : null,
                    } : null,
                    badges: jobBadges(job),
                    matched_skills: Array.isArray(row.matched_skills) ? row.matched_skills : [],
                    // The AI sometimes omits gaps; fall back to the engine's.
                    missing_skills: aiMissing.length > 0 ? aiMissing : (fit?.missingSkills ?? []),
                    bonus_skills: Array.isArray(row.bonus_skills) ? row.bonus_skills : [],
                    experience_fit: row.experience_fit || null,
                    location_fit: row.location_fit || null,
                    german_fit: row.german_fit || null,
                    visa_fit: row.visa_fit || null,
                    reasoning: row.reasoning || '',
                    job: {
                        JobTitle: job.JobTitle,
                        Company: job.Company,
                        Location: job.Location,
                        IsRemote: job.IsRemote,
                        ApplicationURL: job.ApplicationURL,
                        WorkplaceType: job.WorkplaceType,
                        PostedDate: job.PostedDate,
                        Category: job.Category,
                    },
                });
            }
        } catch (error) {
            failedBatches++;
            console.warn(`[ResumeMatch] Pass B batch ${b + 1}/${batches.length} failed: ${error.message}`);
        }

        if (b < batches.length - 1) await sleep(DELAY_BETWEEN_BATCHES_MS);
    }

    if (failedBatches === batches.length) {
        throw new Error('[ResumeMatch] Pass B failed — all batches errored');
    }

    // Shortlisted jobs the deep pass skipped (or whose batch failed) keep
    // their Pass A score and the engine's skill breakdown, without reasoning.
    const covered = new Set(results.map(r => r.jobId));
    for (const entry of shortlist) {
        const job = entry.job;
        if (covered.has(String(job._id))) continue;
        const fit = job._fit || null;
        const score = blendedScore(entry.score, fit);
        results.push({
            jobId: String(job._id),
            score,
            ai_score: entry.aiSkipped ? null : entry.score,
            tier: tierFromScore(score),
            fit: fit ? {
                score: Math.round(fit.score * 100),
                confidence: Math.round(fit.confidence * 100),
                dimensions: fit.dimensions,
                requiredCount: fit.requiredCount,
                matchedRequired: fit.matchedRequired,
            } : null,
            badges: jobBadges(job),
            matched_skills: fit?.matchedSkills ?? [],
            missing_skills: fit?.missingSkills ?? [],
            bonus_skills: [],
            experience_fit: null,
            location_fit: null,
            german_fit: null,
            visa_fit: null,
            reasoning: entry.reason || '',
            job: {
                JobTitle: job.JobTitle,
                Company: job.Company,
                Location: job.Location,
                IsRemote: job.IsRemote,
                ApplicationURL: job.ApplicationURL,
                WorkplaceType: job.WorkplaceType,
                PostedDate: job.PostedDate,
                Category: job.Category,
            },
        });
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, PASS_B_TOP_N);
}

/**
 * Scores filtered jobs against the candidate profile (Pass A → Pass B).
 *
 * @param {object} profile
 * @param {Array<object>} jobs - the hard-filtered job set
 * @returns {Promise<Array<object>>} ranked, enriched results (top 15)
 */
export async function scoreJobs(profile, jobs) {
    // Hydrate BEFORE Pass A — both passes' prompts need Description /
    // parsedRequirements, which the RAM cache no longer carries.
    const hydratedJobs = await hydrateScoringFields(jobs);

    const shortlist = await runPassA(profile, shuffled(hydratedJobs));
    if (shortlist.length === 0) return [];

    return runPassB(profile, shortlist);
}