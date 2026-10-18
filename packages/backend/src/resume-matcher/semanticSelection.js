// ─── Semantic Selection (Smart Match only) ─────────────────────────────────────
//
// Adds meaning-based similarity to the engine's keyword-level fit: a profile
// built around "React, TypeScript" should surface a "Frontend Engineer" whose
// posting says "modern JavaScript frameworks". Leading products match roles by
// embedding similarity for exactly this reason.
//
// Cost control: only the engine's best SEMANTIC_POOL candidates are embedded,
// and each job's vector is cached in Mongo (`jobEmbeddings`, keyed by JobID +
// text hash), so a job is embedded once, not once per run. Fails open: on any
// embedding error the engine ranking is used unchanged.

import crypto from 'node:crypto';
import { connectToDb } from '../db/connection.js';
import { EMBEDDING_ID, EMBEDDING_LIMITS, cosine, embedTexts, isEmbeddingCoolingDown, preloadEmbeddings } from '../embeddings/index.js';
import { getAllJobs } from '../cache/index.js';

export const SEMANTIC_POOL = 150;
const SEMANTIC_WEIGHT = 0.25;
// Per-run cap and warmer pacing depend on the provider (local: fast and
// unmetered; Gemini: per-minute quota). See embeddings/index.js.
const { maxNewPerRun: MAX_NEW_PER_RUN, warmBatch: WARM_BATCH, warmIntervalMs: WARM_INTERVAL_MS } = EMBEDDING_LIMITS;

const memory = new Map(); // JobID → { hash, vector }

const skillNames = list => (Array.isArray(list) ? list : []).map(s => (typeof s === 'string' ? s : s?.name)).filter(Boolean);

export function jobText(job) {
    const req = job.parsedRequirements || {};
    return [
        job.JobTitle,
        job.Category,
        skillNames(req.required_skills).slice(0, 12).join(', '),
        (req.key_responsibilities || []).slice(0, 4).join('; '),
    ].filter(Boolean).join('\n').slice(0, 1200);
}

export function profileText(profile) {
    const roles = (profile.experience || []).slice(0, 3).map(r => [r?.title, ...(r?.technologies || []).slice(0, 6)].filter(Boolean).join(' — '));
    return [
        [profile.seniority_level, profile.sub_domain || profile.domain].filter(Boolean).join(' '),
        roles.join('\n'),
        `Skills: ${skillNames(profile.skills).slice(0, 25).join(', ')}`,
        profile.summary,
    ].filter(Boolean).join('\n').slice(0, 2000);
}

// Keyed by provider+model+dims: a model switch re-embeds rather than mixing vector spaces.
const hashOf = text => crypto.createHash('md5').update(`${EMBEDDING_ID}:${text}`).digest('hex');

async function jobVectors(jobs, maxNew = MAX_NEW_PER_RUN) {
    const wanted = jobs.map(job => ({ id: String(job.JobID), text: jobText(job) })).map(w => ({ ...w, hash: hashOf(w.text) }));
    const result = new Map();
    const missing = wanted.filter(w => {
        const hit = memory.get(w.id);
        if (hit?.hash === w.hash) { result.set(w.id, hit.vector); return false; }
        return true;
    });

    if (missing.length > 0) {
        const db = await connectToDb();
        const col = db.collection('jobEmbeddings');
        const stored = await col.find({ _id: { $in: missing.map(m => m.id) } }).toArray();
        const byId = new Map(stored.map(doc => [doc._id, doc]));
        const toEmbed = [];
        for (const m of missing) {
            const doc = byId.get(m.id);
            if (doc?.hash === m.hash) {
                memory.set(m.id, { hash: m.hash, vector: doc.vector });
                result.set(m.id, doc.vector);
            } else {
                toEmbed.push(m);
            }
        }
        toEmbed.splice(maxNew);
        if (toEmbed.length > 0) {
            const vectors = await embedTexts(toEmbed.map(m => m.text), 'RETRIEVAL_DOCUMENT');
            const ops = toEmbed.map((m, i) => {
                memory.set(m.id, { hash: m.hash, vector: vectors[i] });
                result.set(m.id, vectors[i]);
                return { updateOne: { filter: { _id: m.id }, update: { $set: { hash: m.hash, vector: vectors[i], model: EMBEDDING_ID, updatedAt: new Date() } }, upsert: true } };
            });
            await col.bulkWrite(ops, { ordered: false }).catch(err => console.warn('[Semantic] cache write failed:', err.message));
        }
    }
    return result;
}

/**
 * Re-rank the engine's best candidates with semantic similarity.
 *
 * @param {object} profile
 * @param {Array<object>} ranked  jobs sorted by `_selection`, each carrying `_fit`
 * @returns {Promise<Array<object>>} the pool re-sorted (rest of the list unchanged after it);
 *          each pooled job gains `_semantic` (0–1).
 */
export async function applySemanticSelection(profile, ranked) {
    const pool = ranked.slice(0, SEMANTIC_POOL);
    if (pool.length === 0 || isEmbeddingCoolingDown()) return ranked;
    try {
        const [profileVector] = await embedTexts([profileText(profile)], 'RETRIEVAL_QUERY');
        const vectors = await jobVectors(pool);
        const sims = pool.map(job => {
            const v = vectors.get(String(job.JobID));
            return v ? cosine(profileVector, v) : null;
        });
        const known = sims.filter(s => s != null);
        if (known.length === 0) return ranked;
        const lo = Math.min(...known), hi = Math.max(...known);
        pool.forEach((job, i) => {
            const relative = sims[i] == null ? 0.5 : (hi > lo ? (sims[i] - lo) / (hi - lo) : 0.5);
            job._semantic = sims[i];
            job._selection = job._selection * (1 - SEMANTIC_WEIGHT) + relative * SEMANTIC_WEIGHT * Math.max(...pool.map(p => p._fit.score));
        });
        pool.sort((a, b) => b._selection - a._selection);
        return [...pool, ...ranked.slice(SEMANTIC_POOL)];
    } catch (err) {
        console.warn('[Semantic] embedding unavailable, using engine ranking:', err.message);
        return ranked;
    }
}

// ── Background warmer ────────────────────────────────────────────────────────
// Embeds active jobs a batch at a time until every job has a cached vector,
// then only newly scraped ones. Paced well under the embedding quota and
// paused while a rate limit cools down. Never throws.

let warmerTimer = null;

async function warmOnce() {
    if (isEmbeddingCoolingDown()) return;
    let jobs;
    try { jobs = getAllJobs(); } catch { return; } // cache still loading
    const pending = jobs.filter(job => {
        const hit = memory.get(String(job.JobID));
        return !hit || hit.hash !== hashOf(jobText(job));
    });
    if (pending.length === 0) return;
    try {
        const started = Date.now();
        const batch = pending.slice(0, WARM_BATCH * 2);
        await jobVectors(batch, WARM_BATCH);
        const left = jobs.filter(job => memory.get(String(job.JobID))?.hash !== hashOf(jobText(job))).length;
        console.log(`[Semantic] warmer: ${jobs.length - left}/${jobs.length} jobs embedded (${Date.now() - started}ms)`);
    } catch (err) {
        console.warn('[Semantic] warmer paused:', err.message);
    }
}

export function startEmbeddingWarmer() {
    if (warmerTimer) return;
    preloadEmbeddings();
    warmerTimer = setInterval(warmOnce, WARM_INTERVAL_MS);
    warmerTimer.unref?.();
    setTimeout(warmOnce, 15_000).unref?.();
}
