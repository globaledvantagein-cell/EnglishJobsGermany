// Browser fingerprint for the anti-bypass signup gate.
//
// Backed by @fingerprintjs/fingerprintjs (MIT, open source). It collects 30+
// signals and weights STABLE ones (canvas, WebGL, audio, fonts) over volatile
// ones (UA string), so a returning visitor stays recognisable after a UA
// auto-update, an external monitor, or a language change — cases the old
// 32-bit FNV-1a hash of raw signals would mis-hash into a "new" visitor.
//
// Async transition (Option A): the agent is kicked off on module import and its
// visitorId cached. authHeaders() reads the cache SYNCHRONOUSLY via
// getFingerprint(); by the time the first user-triggered request fires the id is
// ready. Until then it returns '' — the backend treats a short/empty fingerprint
// as null and handles it gracefully (composite identity falls back to vid + IP).

import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cached: string | null = null;
let loadPromise: Promise<string> | null = null;

function init(): Promise<string> {
  if (loadPromise) return loadPromise;
  loadPromise = FingerprintJS.load()
    .then(agent => agent.get())
    .then(result => {
      cached = result.visitorId;
      return cached;
    })
    .catch(() => {
      // Fingerprinting failed (rare) — leave the cache empty; the gate degrades
      // to vid + IP. Never throw from here.
      cached = cached ?? '';
      return cached;
    });
  return loadPromise;
}

// Kick off computation on import, browser only (this module is evaluated during
// SSR too, where the FingerprintJS agent's browser APIs are unavailable).
if (typeof window !== 'undefined') {
  init();
}

/**
 * Synchronous accessor used by authHeaders(). Returns the cached visitorId, or
 * '' if the async agent hasn't resolved yet (extremely rare — only on the very
 * first request of a fresh page load). The backend maps '' → null fingerprint.
 *
 * Note: this returns '' (not null) for the not-ready case on purpose —
 * authHeaders() types its header map as Record<string, string> and jobApi.ts is
 * off-limits to change, so a null here would break its type / send the literal
 * "null" (8 chars) as a fingerprint. '' is falsy like null and the backend's
 * extractFingerprint() rejects anything shorter than 8 chars → treated as null.
 */
export function getFingerprint(): string {
  return cached ?? '';
}

/**
 * Async accessor for callers that can await the stable id (e.g. an explicit
 * pre-warm). Resolves immediately if already cached.
 */
export async function getFingerPrintAsync(): Promise<string> {
  if (cached) return cached;
  return init();
}
