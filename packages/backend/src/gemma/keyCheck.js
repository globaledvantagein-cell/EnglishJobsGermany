// ─── Gemma key check ───────────────────────────────────────────────────────────
//
// Asks Google about every configured key with a models.get call — free, uses no
// generation quota — and reports each key by its slot number and last four
// characters (enough to find it in AI Studio, never the full key). Duplicates
// are flagged too: two slots holding the same key share one quota.
//
// Rejected keys are disabled in the key manager so rotation skips them, which
// keeps the remaining keys working instead of failing every Nth call.
//
// Used by the "Fill missing AI data" preflight and the ai_enrichment health check.

import { getKeyCount, getKeyForCheck, setKeyRejected } from './keyManager.js';

const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const CHECK_MODEL = 'gemma-4-26b-a4b-it';
const CACHE_MS = 10 * 60_000;

let cached = null; // { at, result }

/** Plain-words reason for one failed key; never the raw API body. */
function describeProblem(status, reason) {
    if (reason === 'API_KEY_INVALID') return 'not valid (deleted or mistyped)';
    if (reason === 'API_KEY_SERVICE_BLOCKED' || reason === 'SERVICE_DISABLED') return 'Generative Language API is disabled for its project';
    if (status === 403) return 'access denied (key restricted, or reported as leaked)';
    if (status === 404) return `model ${CHECK_MODEL} not available to this key`;
    if (status === 429) return 'rate limited right now (key itself is valid)';
    return `unexpected response ${status || 'network error'}`;
}

/**
 * @param {{ force?: boolean }} [options] force bypasses the 10-minute cache
 * @returns {Promise<{ total: number, valid: number, keys: Array<{ slot: number, tail: string, ok: boolean,
 *   problem?: string, duplicateOf?: number }>, summary: string }>}
 */
export async function checkGemmaKeys({ force = false } = {}) {
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.result;

    const total = getKeyCount();
    const seen = new Map(); // key value -> first slot
    const keys = [];
    for (let i = 0; i < total; i++) {
        const apiKey = getKeyForCheck(i);
        const entry = { slot: i + 1, tail: apiKey.slice(-4), ok: false };
        if (seen.has(apiKey)) entry.duplicateOf = seen.get(apiKey);
        else seen.set(apiKey, i + 1);

        try {
            const res = await fetch(`${MODELS_URL}/${CHECK_MODEL}?key=${apiKey}`, { signal: AbortSignal.timeout(15_000) });
            const body = await res.json().catch(() => ({}));
            const reason = body?.error?.details?.find?.(d => d.reason)?.reason || body?.error?.status;
            // 429 means the key authenticated fine; only quota is busy.
            entry.ok = res.ok || res.status === 429;
            if (!res.ok) entry.problem = describeProblem(res.status, reason);
        } catch {
            entry.problem = describeProblem(0);
        }
        setKeyRejected(i, !entry.ok && !/network error/.test(entry.problem || ''));
        keys.push(entry);
    }

    const valid = keys.filter(k => k.ok).length;
    const result = { total, valid, keys, summary: summarize(keys, valid, total) };
    cached = { at: Date.now(), result };
    return result;
}

/** "2 of 6 keys work. Key 1 (…ymHA): not valid. Key 3 is the same key as key 1." */
function summarize(keys, valid, total) {
    const parts = [`${valid} of ${total} Gemma keys work.`];
    const bad = keys.filter(k => !k.ok && !k.duplicateOf);
    if (bad.length) parts.push(bad.map(k => `Key ${k.slot} (…${k.tail}): ${k.problem}.`).join(' '));
    const dupes = keys.filter(k => k.duplicateOf);
    if (dupes.length) parts.push(dupes.map(k => `Key ${k.slot} is the same key as key ${k.duplicateOf}.`).join(' '));
    if (valid === 0) parts.push('Create new keys in Google AI Studio (one per project), put them in GEMMA_API_KEYS on the server and restart the backend.');
    return parts.join(' ');
}
