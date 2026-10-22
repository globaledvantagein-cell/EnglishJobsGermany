// ─── Embeddings ────────────────────────────────────────────────────────────────
//
// Text → unit vector for meaning-based similarity. Used by Smart Match.
//
//   EMBEDDING_PROVIDER=local   (default) Transformers.js on this server — free,
//                              unlimited, no API key. See EMBEDDINGS_SETUP.md.
//   EMBEDDING_PROVIDER=gemini  Google gemini-embedding-001 via the Gemini key pool.
//   EMBEDDING_PROVIDER=off     no embeddings; Smart Match uses the engine ranking.
//
// Vectors from different models live in different spaces and must never be
// compared. EMBEDDING_ID names the active provider+model+dims; cached vectors
// are keyed by it, so switching provider re-embeds instead of mixing spaces.

import * as local from './localProvider.js';
import * as gemini from './geminiProvider.js';

const off = {
    MODEL_ID: 'none',
    DIMS: 0,
    embedTexts: async () => { throw new Error('embeddings disabled (EMBEDDING_PROVIDER=off)'); },
    isEmbeddingCoolingDown: () => true, // callers skip semantic work while "cooling down"
};
const PROVIDERS = { local, gemini, off };

const requested = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase();
const PROVIDER_NAME = requested in PROVIDERS ? requested : 'local';
const provider = PROVIDERS[PROVIDER_NAME];

export const EMBEDDING_PROVIDER = PROVIDER_NAME;
export const EMBEDDING_ID = `${PROVIDER_NAME}:${provider.MODEL_ID}:${provider.DIMS}`;

/**
 * Pacing for the background warmer and per-run caps. Local inference is
 * unmetered but uses this server's CPU; Gemini's free tier counts every text against a per-minute cap.
 */
export const EMBEDDING_LIMITS = PROVIDER_NAME === 'gemini'
    ? { maxNewPerRun: 30, warmBatch: 40, warmIntervalMs: 70_000 }
    : { maxNewPerRun: 150, warmBatch: 64, warmIntervalMs: 15_000 }; // ~3 s CPU per 15 s while backfilling

export const embedTexts = (texts, taskType) => provider.embedTexts(texts, taskType);
export const isEmbeddingCoolingDown = () => provider.isEmbeddingCoolingDown();

/** Warm the local model at boot; no-op for hosted providers. */
export function preloadEmbeddings() {
    if (PROVIDER_NAME === 'local') local.preloadEmbeddingModel();
}

/** Cosine similarity of two unit vectors (a plain dot product). */
export function cosine(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
    return dot;
}
