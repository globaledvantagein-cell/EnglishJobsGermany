// ─── Gemini Embedding Provider (optional) ──────────────────────────────────────
//
// Hosted alternative to the default local model (localProvider.js). Select with
// EMBEDDING_PROVIDER=gemini. Free-tier quota is tight (each text in a batch
// counts as one request per minute), so the warmer paces it slowly.
//
// Shares the key pool (keyManager.js) with generation for dead-key retirement:
// invalid keys (400), depleted credits (402) and 401/403 are retired for all.
// Rate limits are NOT shared: embeddings have their own quota (each text in a
// batch counts as one request), so a 429 here starts an embeddings-only
// cooldown and fails fast — it must never stall Smart Match's generation calls.

import { getNextKey, markKeyDead } from '../gemini/keyManager.js';

export const MODEL_ID = 'gemini-embedding-001';
export const DIMS = 256;

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_BATCH = 100;
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 20_000;
const DEFAULT_COOLDOWN_MS = 60_000;

let cooldownUntil = 0;

/** True while an embeddings rate limit is cooling down. */
export function isEmbeddingCoolingDown() {
    return Date.now() < cooldownUntil;
}

function retryDelayMs(body) {
    const match = String(body).match(/"retryDelay"\s*:\s*"?([\d.]+)s/i);
    return match ? Math.ceil(parseFloat(match[1]) * 1000) + 1000 : DEFAULT_COOLDOWN_MS;
}

async function embedBatch(texts, taskType) {
    if (isEmbeddingCoolingDown()) throw new Error('[Embeddings] rate-limited, cooling down');
    let lastError = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const key = getNextKey();
        if (!key) throw lastError || new Error('[Embeddings] No usable API key');

        const res = await fetch(`${API_BASE}/${MODEL_ID}:batchEmbedContents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.apiKey },
            body: JSON.stringify({
                requests: texts.map(text => ({
                    model: `models/${MODEL_ID}`,
                    content: { parts: [{ text }] },
                    taskType,
                    outputDimensionality: DIMS,
                })),
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        }).catch(err => ({ ok: false, status: 503, text: async () => err.message }));

        if (res.ok) {
            const data = await res.json();
            return (data.embeddings || []).map(e => normalize(e.values || []));
        }

        const body = await res.text().catch(() => '');
        lastError = new Error(`[Embeddings] ${res.status}: ${body.slice(0, 200)}`);
        const invalidKey = res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(body);
        if ([401, 402, 403].includes(res.status) || invalidKey) { markKeyDead(key.index); continue; }
        if (res.status === 429) { cooldownUntil = Date.now() + retryDelayMs(body); throw lastError; }
        if (res.status >= 500) continue;
        throw lastError;
    }
    throw lastError;
}

/** Unit-length vector, so cosine similarity is a plain dot product. */
function normalize(vector) {
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
    return vector.map(v => v / norm);
}

/**
 * @param {string[]} texts
 * @param {'SEMANTIC_SIMILARITY'|'RETRIEVAL_QUERY'|'RETRIEVAL_DOCUMENT'} [taskType]
 * @returns {Promise<number[][]>} unit vectors, same order as `texts`
 */
export async function embedTexts(texts, taskType = 'SEMANTIC_SIMILARITY') {
    const out = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
        out.push(...await embedBatch(texts.slice(i, i + MAX_BATCH), taskType));
    }
    return out;
}
