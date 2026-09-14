// IndexNow — tell search engines a URL changed, the moment it changes.
//
// One POST notifies Bing, Yandex, Seznam and Naver simultaneously (they share
// the protocol and forward submissions to each other). Google does NOT
// participate; it discovers new jobs through the sitemap instead, so this is
// purely additive coverage.
//
// Ownership is proved by hosting a text file at <SITE_URL>/<key>.txt whose
// entire body is the key. That file lives in the FRONTEND repo at
// frontend-next/public/<key>.txt — if it is missing or its contents don't match
// INDEXNOW_KEY, every submission is silently rejected.
//
// Contract: this never throws and is never awaited on a request or scrape path.
// A search-engine ping is not worth failing a save over.

import { SITE_URL, INDEXNOW_KEY } from '../env.js';

const ENDPOINT = 'https://api.indexnow.org/indexnow';

// IndexNow caps a submission at 10,000 URLs.
const MAX_URLS = 10000;

// A ping that hangs must not pin an open socket for the life of the process.
const TIMEOUT_MS = 10000;

/** The bare host IndexNow expects — no scheme, no trailing slash. */
function hostFromSiteUrl() {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return 'englishjobsgermany.com';
  }
}

/**
 * Submit URLs to IndexNow. Resolves (never rejects) regardless of outcome.
 *
 * @param {string[]} urls Absolute URLs on SITE_URL's host.
 */
export async function pingIndexNow(urls) {
  if (!INDEXNOW_KEY) return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  const urlList = urls.slice(0, MAX_URLS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: hostFromSiteUrl(),
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 200 accepted, 202 accepted-pending-key-validation. Anything else is a
    // real rejection worth seeing in the logs (422 = key/host mismatch,
    // 403 = key file not found, 429 = too many submissions).
    if (res.ok || res.status === 202) {
      console.log(`[IndexNow] Pinged ${urlList.length} URL(s) — ${res.status}`);
    } else {
      console.warn(`[IndexNow] Rejected with ${res.status} for ${urlList.length} URL(s)`);
    }
  } catch (err) {
    console.warn('[IndexNow] Failed:', err.message);
  }
}

/**
 * Fire-and-forget wrapper. Schedules the ping and returns immediately, so
 * callers on a request or scrape path never wait on the network.
 */
export function pingIndexNowAsync(urls) {
  if (!INDEXNOW_KEY || !Array.isArray(urls) || urls.length === 0) return;
  setImmediate(() => {
    // pingIndexNow already swallows everything; the catch is belt-and-braces
    // so a future refactor can't turn this into an unhandled rejection.
    pingIndexNow(urls).catch(() => {});
  });
}

/**
 * Build the public URL for a job document. Fully-remote roles live on the
 * /remote-jobs vertical and must not be announced under /jobs.
 */
export function jobUrl(doc, collectionName = 'jobs') {
  const prefix = collectionName === 'remoteJobs' ? 'remote-jobs' : 'jobs';
  return `${SITE_URL}/${prefix}/${doc._id}`;
}
