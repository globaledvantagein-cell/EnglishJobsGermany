// ─── Unified Gemini Client ─────────────────────────────────────────────────────
//
// The ONE way to reach the Gemini API in this process. Both the scraper's job
// analyzer (src/gemini/analyzeJob.js) and Smart Match's scoring
// (src/resume-matcher/scoreJobs.js) go through here, so they share the key pool
// in ./keyManager.js and coordinate their rate-limit state.
//
// Native fetch, no SDK — the API key rides as a ?key= query parameter.
// Modelled after src/gemma/gemmaClient.js.

import {
    getNextKey,
    markKeyDead,
    markKeyRpmLimited,
    markModelExhaustedOnKey,
    canServeNow,
    shortestCooldownMs,
    getTotalKeyCount,
    recordModelUsage,
    isModelExhaustedEverywhere,
    msUntilMinuteWindowReset,
} from './keyManager.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── Cascade order ─────────────────────────────────────────────────────────────
//
// Newest/best first. The job analyzer walks this list and takes the first model
// that still has daily budget on some key; once a tier is spent for the day it
// drops to the next. Smart Match deliberately does NOT use this — it pins one
// model via RESUME_MATCHER_MODEL so its scores stay comparable across runs.
const GEMINI_CASCADE = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
];

/** Error code marking a permanent (not transient) "no budget left" failure. */
const MODEL_EXHAUSTED = 'MODEL_EXHAUSTED';

function modelExhaustedError(model) {
    const err = new Error(`[Gemini] Model ${model} exhausted on all keys for today`);
    err.code = MODEL_EXHAUSTED;
    return err;
}

const DEFAULT_TEMPERATURE = 0.1;
const MAX_RETRY_CYCLES = 3;          // total attempts before giving up
const SERVER_ERROR_RETRY_MS = 2_000; // wait before the single 500/503 retry
// Hard per-call ceiling. Without it a hung Gemini connection hangs the whole
// HTTP request forever (fetch has no default timeout) — a Smart Match POST
// that never returns, which the proxy eventually kills as a 5xx.
const REQUEST_TIMEOUT_MS = 90_000;
// A 429 asking for a longer wait than this is a daily quota, not a per-minute
// one (Google sends ~86,000s once a model's RPD is spent). Waiting it out
// stalled every scraper worker for a day while other models still had budget.
const MAX_RPM_COOLDOWN_S = 120;
// Upper bound on one "all keys busy" wait. Per-minute windows clear within it.
const MAX_WAIT_MS = 65_000;
// Waiting for a free key is queueing, not a failed attempt, so it does not use
// up MAX_RETRY_CYCLES. Bounded separately (~10 min) so a caller still gives up.
const MAX_WAITS = 10;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pulls the retry delay (seconds) out of a 429 body. Gemini reports it either
 * as a RetryInfo `retryDelay: "37s"` field or inline in the message text.
 */
function parseRetryAfterSeconds(errorBody) {
    if (!errorBody) return 0;
    const retryDelay = errorBody.match(/"retryDelay"\s*:\s*"?([\d.]+)s/i);
    if (retryDelay) return Math.ceil(parseFloat(retryDelay[1])) + 1;
    const inline = errorBody.match(/retry\s*(?:in|after)\s*([\d.]+)\s*s/i);
    if (inline) return Math.ceil(parseFloat(inline[1])) + 1;
    return 0;
}

/**
 * Performs one HTTP call and returns the candidate text.
 * Throws an Error tagged with `.status` and `.body` so the retry loop can branch.
 */
async function requestOnce(apiKey, model, body) {
    const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (netErr) {
        // Timeout / DNS / socket failure — tag as retryable-server-ish so the
        // loop rotates the key and tries again instead of hanging.
        const err = new Error(
            `[Gemini] Request failed: ${netErr.name === 'TimeoutError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : netErr.message}`
        );
        err.status = 503;
        throw err;
    }

    if (!res.ok) {
        let errorBody = '';
        try { errorBody = await res.text(); } catch { /* ignore */ }
        const err = new Error(
            `[Gemini] API responded ${res.status} ${res.statusText}${errorBody ? ': ' + errorBody.slice(0, 300) : ''}`
        );
        err.status = res.status;
        err.body = errorBody;
        throw err;
    }

    const data = await res.json();
    // Some models include thinking/reasoning parts before the actual content.
    // Always grab the last non-thought part to get the real output.
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const nonThoughtParts = parts.filter(p => !p.thought);
    const textPart = nonThoughtParts.length > 0
        ? nonThoughtParts[nonThoughtParts.length - 1]
        : parts[parts.length - 1];
    const text = textPart?.text;

    if (typeof text !== 'string') {
        const err = new Error('[Gemini] Response missing candidates[0].content.parts[0].text');
        err.status = 0;
        throw err;
    }

    return text;
}

/**
 * Calls Gemini using the shared key pool.
 *
 * @param {object}   params
 * @param {string}   params.model             - e.g. 'gemini-3.1-flash-lite'
 * @param {Array}    params.contents          - generateContent `contents` array
 * @param {string}   [params.systemInstruction] - optional system prompt text
 * @param {string}   [params.label]           - short tag for logging (job title, pass name…)
 * @param {object}   [params.generationConfig] - overrides merged into generationConfig
 * @returns {Promise<{ content: string, model: string, keyIndex: number }>}
 *
 * Error policy:
 *   403 → mark key dead, immediately try the next key
 *   429 → mark key RPM-limited for the reported cooldown, immediately try next
 *   500/503 → retry once after 2s
 *   no key available → wait for the shortest cooldown, then retry
 *   daily budget gone on every key → throw with code MODEL_EXHAUSTED
 *   at most MAX_RETRY_CYCLES cycles, then throw
 */
export async function callGeminiDetailed({ model, contents, systemInstruction, label, generationConfig } = {}) {
    if (!model) throw new Error('[Gemini] callGemini requires a model');
    if (!Array.isArray(contents)) throw new Error('[Gemini] callGemini requires a contents array');

    const body = {
        contents,
        generationConfig: {
            temperature: DEFAULT_TEMPERATURE,
            responseMimeType: 'application/json',
            ...(generationConfig || {}),
        },
    };
    if (systemInstruction) {
        body.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const tag = label ? String(label).substring(0, 40) : model;
    const totalKeys = getTotalKeyCount();
    let hasRetriedServerError = false;
    let waits = 0;

    for (let cycle = 1; cycle <= MAX_RETRY_CYCLES; cycle++) {
        // Daily budget gone everywhere is permanent — surface it as such so the
        // cascade can drop a tier instead of burning retry cycles.
        if (isModelExhaustedEverywhere(model)) throw modelExhaustedError(model);

        const slot = getNextKey(model);

        // No key can serve this model right now. Cooldowns and per-minute
        // ceilings both clear on their own, so wait for whichever comes first.
        if (!slot) {
            const soonest = shortestCooldownMs(model) ?? msUntilMinuteWindowReset(model);
            if (soonest === null || soonest === undefined) {
                throw new Error('[Gemini] All API keys are dead (403). Replace keys in .env and restart.');
            }
            const waitMs = Math.min(soonest, MAX_WAIT_MS);
            if (++waits > MAX_WAITS) break;
            console.warn(`[Gemini] All keys busy — waiting ${Math.round(waitMs / 1000)}s for the next available key`);
            await sleep(waitMs + 500);
            cycle--;
            continue;
        }

        const { apiKey, index, requestsThisMinute } = slot;
        console.log(`[Gemini] Using key #${index + 1}/${totalKeys} (${requestsThisMinute} req/min) — ${tag}`);

        const startedAt = Date.now();
        try {
            const text = await requestOnce(apiKey, model, body);
            recordModelUsage(index, model);
            const durationMs = Date.now() - startedAt;
            console.log(`[Gemini] OK — model=${model} keyIndex=${index} duration=${durationMs}ms`);
            return { content: text, model, keyIndex: index };
        } catch (error) {
            const durationMs = Date.now() - startedAt;
            const status = error.status;
            console.warn(
                `[Gemini] FAIL — model=${model} keyIndex=${index} duration=${durationMs}ms ` +
                `status=${status ?? 'n/a'} msg=${error.message}`
            );

            // The key is unusable for this process — next key, same cycle
            // budget. Google reports a revoked/mistyped key as 400
            // API_KEY_INVALID (not 403) and depleted prepaid credits as 402;
            // neither recovers mid-run, and without retiring the key every
            // request routed to it fails.
            const invalidKey = status === 400 && /API_KEY_INVALID|API key not valid/i.test(`${error.body || ''} ${error.message}`);
            if (status === 403 || status === 401 || status === 402 || invalidKey) {
                markKeyDead(index);
                const why = invalidKey ? 'API key not valid' : status === 402 ? '402 prepaid credits depleted' : String(status);
                console.error(`[Gemini] Key #${index + 1} disabled until restart — ${why}`);
                continue;
            }

            // Rate limited — park this model on this key and move straight to
            // another key. Limits are per model, so the key keeps serving the
            // other cascade tiers.
            if (status === 429) {
                const cooldownSeconds = parseRetryAfterSeconds(error.body) || 62;
                if (cooldownSeconds > MAX_RPM_COOLDOWN_S || /PerDay/i.test(error.body || '')) {
                    markModelExhaustedOnKey(index, model);
                    console.warn(`[Gemini] Key #${index + 1} out of daily quota for ${model} — using other keys/models`);
                } else {
                    markKeyRpmLimited(index, cooldownSeconds, model);
                    console.warn(`[Gemini] Key #${index + 1} RPM limited on ${model} — cooldown ${cooldownSeconds}s`);
                }
                continue;
            }

            // Transient server error — retry once after 2s.
            if (status === 500 || status === 503) {
                if (hasRetriedServerError) {
                    throw new Error(`[Gemini] Server error ${status} persisted after retry`);
                }
                hasRetriedServerError = true;
                console.warn(`[Gemini] ${status} — retrying once after ${SERVER_ERROR_RETRY_MS}ms`);
                await sleep(SERVER_ERROR_RETRY_MS);
                continue;
            }

            // Anything else — fail fast.
            throw error;
        }
    }

    throw new Error(`[Gemini] Exhausted ${MAX_RETRY_CYCLES} retry cycles — ${tag}`);
}

/**
 * Calls Gemini with an explicit model and returns just the response text.
 * The stable entry point for callers that pin their own model (Smart Match).
 *
 * @returns {Promise<string>} raw response text
 */
export async function callGemini(params) {
    const { content } = await callGeminiDetailed(params);
    return content;
}

/**
 * Calls Gemini without naming a model: walks GEMINI_CASCADE and uses the first
 * tier that still has daily budget on some key, dropping down as tiers are
 * spent. Transient failures still throw — only a genuinely exhausted model
 * moves the cascade along.
 *
 * @param {object} params - same as callGemini, minus `model`
 * @returns {Promise<{ content: string, model: string, keyIndex: number }>}
 * @throws when every model in the cascade is exhausted on every key
 */
export async function callGeminiWithCascade({ contents, systemInstruction, label, generationConfig } = {}) {
    // Start at the best model a key can serve right now. Waiting on a tier's
    // per-minute cap while a lower tier sits idle wastes the pool; only when no
    // tier is free does the call queue on the best one with budget left.
    const free = GEMINI_CASCADE.findIndex(model => canServeNow(model));
    const start = free === -1 ? 0 : free;

    for (let i = start; i < GEMINI_CASCADE.length; i++) {
        const model = GEMINI_CASCADE[i];

        if (isModelExhaustedEverywhere(model)) {
            const next = GEMINI_CASCADE[i + 1];
            if (next) console.warn(`[Gemini] Model ${model} exhausted on all keys, cascading to ${next}`);
            continue;
        }

        console.log(`[Gemini] Cascade selected model: ${model}`);
        try {
            return await callGeminiDetailed({ model, contents, systemInstruction, label, generationConfig });
        } catch (error) {
            // Budget ran out mid-flight (another caller spent the last slots) —
            // drop a tier. Anything else is transient and belongs to the caller.
            if (error?.code === MODEL_EXHAUSTED) {
                const next = GEMINI_CASCADE[i + 1];
                if (next) console.warn(`[Gemini] Model ${model} exhausted on all keys, cascading to ${next}`);
                continue;
            }
            throw error;
        }
    }

    throw new Error('[Gemini] All models exhausted for the day');
}

/**
 * True when every model in the cascade has spent its daily budget on every key.
 * The scraper engine polls this so it can stop cleanly instead of grinding
 * through jobs that can no longer be analyzed.
 */
export function isGeminiBudgetExhausted() {
    return GEMINI_CASCADE.every(model => isModelExhaustedEverywhere(model));
}
