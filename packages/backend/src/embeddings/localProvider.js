// ─── Local Embedding Provider (default) ────────────────────────────────────────
//
// Runs a small open embedding model inside this Node process with
// Transformers.js (ONNX Runtime on the CPU). Free, no API key, no rate limits.
//
// Default model: BAAI bge-small-en-v1.5 (384 dims, 8-bit quantised, ~34 MB),
// a strong small English retrieval model. ~50 ms per job text on 2 CPU
// threads; the warmer backfills all active jobs once, then only new ones.
//
// The model is downloaded once from the Hugging Face hub on first use and kept
// in EMBEDDING_CACHE_DIR. Loading takes a few seconds; until it is ready the
// first call waits, and Smart Match fails open to its non-semantic ranking.
//
// Env (all optional):
//   EMBEDDING_MODEL      Hugging Face model id (default Xenova/bge-small-en-v1.5)
//   EMBEDDING_CACHE_DIR  where model files are stored (default <backend>/.cache/models)
//   EMBEDDING_THREADS    CPU threads for inference (default 2 — leaves the API responsive)

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5';
export const DIMS = 384;

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_DIR = process.env.EMBEDDING_CACHE_DIR || path.join(BACKEND_ROOT, '.cache', 'models');
const THREADS = Math.max(1, Number(process.env.EMBEDDING_THREADS) || 2);
// Small batches + no ONNX memory arena keep RSS flat (~+200 MB). With the
// arena on, a 512-job backfill held ~900 MB — too much for a 1 GB server.
const BATCH = 16;

// bge models are trained with this instruction on the QUERY side of retrieval
// (the candidate profile); documents (jobs) are embedded as-is.
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

let extractorPromise = null;

function extractor() {
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const { pipeline, env } = await import('@huggingface/transformers');
            env.cacheDir = CACHE_DIR;
            const started = Date.now();
            const pipe = await pipeline('feature-extraction', MODEL_ID, {
                dtype: 'q8',
                session_options: {
                    intraOpNumThreads: THREADS, interOpNumThreads: 1,
                    enableCpuMemArena: false, enableMemPattern: false,
                },
            });
            console.log(`[Embeddings] local model ${MODEL_ID} ready in ${Date.now() - started}ms`);
            return pipe;
        })().catch(err => {
            extractorPromise = null; // allow a retry on the next call
            throw err;
        });
    }
    return extractorPromise;
}

/** Local inference has no quota, so never cooling down. */
export function isEmbeddingCoolingDown() {
    return false;
}

/**
 * @param {string[]} texts
 * @param {'SEMANTIC_SIMILARITY'|'RETRIEVAL_QUERY'|'RETRIEVAL_DOCUMENT'} [taskType]
 * @returns {Promise<number[][]>} unit vectors, same order as `texts`
 */
export async function embedTexts(texts, taskType = 'SEMANTIC_SIMILARITY') {
    const pipe = await extractor();
    const prepared = taskType === 'RETRIEVAL_QUERY' ? texts.map(t => QUERY_PREFIX + t) : texts;
    const out = [];
    for (let i = 0; i < prepared.length; i += BATCH) {
        const tensor = await pipe(prepared.slice(i, i + BATCH), { pooling: 'cls', normalize: true });
        out.push(...tensor.tolist());
        // Yield between batches so a large backfill never starves API requests.
        await new Promise(resolve => setImmediate(resolve));
    }
    return out;
}

/** Start loading the model now (e.g. at boot) so the first user request is fast. */
export function preloadEmbeddingModel() {
    extractor().catch(err => console.warn('[Embeddings] local model failed to load:', err.message));
}
