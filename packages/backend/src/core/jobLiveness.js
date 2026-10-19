// ─── Job liveness ──────────────────────────────────────────────────────────
//
// Answers one question per job: does the posting still exist at its source?
//
// The old validator sent a HEAD to ApplicationURL and only trusted 404/410.
// That is blind on most of our sources, verified 2026-10-19:
//   - Ashby and Workday career pages are SPAs: a deleted (or made-up) job ID
//     still answers 200.
//   - Greenhouse custom-domain URLs (helsing.ai/jobs?gh_jid=…) always answer
//     200 — the page is the company's own site.
// So each ATS is asked through its own JSON API instead, which does return a
// clean "gone" signal:
//
//   greenhouse       GET boards-api/v1/boards/{slug}/jobs/{id}    404 = gone
//   lever            GET api.lever.co/v0/postings/{slug}/{id}     404 = gone
//   smartrecruiters  GET api/v1/companies/{co}/postings/{id}      404 = gone
//   workday          GET wday/cxs/{tenant}/{site}{path}           404, or 403 S22 = gone
//   ashby            GET posting-api/job-board/{slug}             id missing = gone
//   everything else  GET ApplicationURL                           404/410 = gone
//
// Anything ambiguous — timeouts, 5xx, 429, bot walls — is UNKNOWN, never DEAD.
// A live job wrongly hidden costs a user; a dead job shown costs a click. Both
// matter, but only one of them is unrecoverable, so the bar for DEAD is an
// explicit answer from the source.

import fetch from 'node-fetch';

export const Liveness = Object.freeze({
    LIVE: 'live',
    DEAD: 'dead',
    UNKNOWN: 'unknown',
});

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const result = (verdict, reason) => ({ verdict, reason });

/** GET with a timeout. Resolves to the Response, or null on any network failure. */
async function getWithTimeout(url, headers = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': USER_AGENT, ...headers },
        });
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Maps a plain status code onto a verdict. Only 404/410 count as gone. */
function verdictFromStatus(status, source) {
    if (status >= 200 && status < 300) return result(Liveness.LIVE, `${source} ${status}`);
    if (status === 404 || status === 410) return result(Liveness.DEAD, `${source} ${status}`);
    return result(Liveness.UNKNOWN, `${source} ${status}`);
}

// ─── Identification ─────────────────────────────────────────────────────────

/** Middle segment of `${prefix}${slug}_${id}` JobIDs, or null. */
function slugFromJobId(jobId, prefix) {
    if (typeof jobId !== 'string' || !jobId.startsWith(prefix)) return null;
    const rest = jobId.slice(prefix.length);
    const lastUnderscore = rest.lastIndexOf('_');
    return lastUnderscore > 0 ? rest.slice(0, lastUnderscore) : null;
}

/**
 * Works out which ATS a job lives on and the identifiers its API needs.
 * The URL is the primary signal (it is what the user clicks); JobID fills in
 * the Greenhouse slug that custom-domain URLs do not carry.
 *
 * @returns {{ats:string, slug?:string, id?:string, [k:string]:string}|null}
 */
export function identifyJob(job) {
    let url;
    try {
        url = new URL(job?.ApplicationURL);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    const jobId = job.JobID || '';

    if (jobId.startsWith('greenhouse_') || host.endsWith('greenhouse.io') || url.searchParams.has('gh_jid')) {
        const slug = slugFromJobId(jobId, 'greenhouse_') || (host.endsWith('greenhouse.io') ? parts[0] : null);
        const id = url.searchParams.get('gh_jid') || (parts[1] === 'jobs' ? parts[2] : null) || jobId.split('_').pop();
        if (slug && /^\d+$/.test(id || '')) return { ats: 'greenhouse', slug, id };
    }

    if (host === 'jobs.ashbyhq.com' && parts.length >= 2) {
        return { ats: 'ashby', slug: parts[0], id: parts[1] };
    }

    if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && parts.length >= 2) {
        return { ats: 'lever', slug: parts[0], id: parts[1], region: host === 'jobs.eu.lever.co' ? 'eu' : 'us' };
    }

    if (host === 'jobs.smartrecruiters.com' && parts.length >= 2) {
        const id = parts[1].split('-')[0];
        if (/^\d+$/.test(id)) return { ats: 'smartrecruiters', slug: parts[0], id };
    }

    if (host.endsWith('.myworkdayjobs.com')) {
        // /{locale?}/{site}/job/{location}/{title_req}
        const jobIdx = parts.indexOf('job');
        if (jobIdx >= 1) {
            return {
                ats: 'workday',
                origin: url.origin,
                tenant: host.split('.')[0],
                site: parts[jobIdx - 1],
                path: `/${parts.slice(jobIdx).join('/')}`,
            };
        }
    }

    return { ats: 'generic' };
}

// ─── Per-ATS checks ─────────────────────────────────────────────────────────

async function checkGreenhouse({ slug, id }) {
    const res = await getWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${id}`);
    if (!res) return result(Liveness.UNKNOWN, 'greenhouse network');
    return verdictFromStatus(res.status, 'greenhouse');
}

async function checkLever({ slug, id, region }) {
    const apiHost = region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const res = await getWithTimeout(`https://${apiHost}/v0/postings/${encodeURIComponent(slug)}/${id}`);
    if (!res) return result(Liveness.UNKNOWN, 'lever network');
    return verdictFromStatus(res.status, 'lever');
}

async function checkSmartRecruiters({ slug, id }) {
    const res = await getWithTimeout(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings/${id}`);
    if (!res) return result(Liveness.UNKNOWN, 'smartrecruiters network');
    return verdictFromStatus(res.status, 'smartrecruiters');
}

async function checkWorkday({ origin, tenant, site, path }) {
    const res = await getWithTimeout(`${origin}/wday/cxs/${tenant}/${site}${path}`, { Accept: 'application/json' });
    if (!res) return result(Liveness.UNKNOWN, 'workday network');

    // An unposted requisition answers 403 with Workday's own JSON error body
    // {"errorCode":"S22","message":"permission denied"}. A bot wall answers 403
    // too, but with HTML — so the body, not the status, decides.
    if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.errorCode === 'S22') return result(Liveness.DEAD, 'workday 403 S22');
        return result(Liveness.UNKNOWN, 'workday 403');
    }
    return verdictFromStatus(res.status, 'workday');
}

/**
 * Ashby has no public per-job endpoint, so the whole board is fetched once and
 * shared by every job on it. The cache holds the in-flight promise, so jobs
 * checked concurrently still cause a single request per board.
 */
async function checkAshby({ slug, id }, boardCache) {
    const key = `ashby|${slug.toLowerCase()}`;
    if (!boardCache.has(key)) {
        boardCache.set(key, (async () => {
            const res = await getWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
            if (!res) return { state: 'unknown', reason: 'ashby network' };
            if (res.status === 404) return { state: 'gone' };
            if (!res.ok) return { state: 'unknown', reason: `ashby board ${res.status}` };
            const data = await res.json().catch(() => null);
            if (!Array.isArray(data?.jobs)) return { state: 'unknown', reason: 'ashby unparseable board' };
            return { state: 'ok', ids: new Set(data.jobs.map(j => j.id)) };
        })());
    }

    const board = await boardCache.get(key);
    if (board.state === 'gone') return result(Liveness.DEAD, 'ashby board 404');
    if (board.state === 'unknown') return result(Liveness.UNKNOWN, board.reason);
    return board.ids.has(id)
        ? result(Liveness.LIVE, 'ashby on board')
        : result(Liveness.DEAD, 'ashby not on board');
}

async function checkGeneric(job) {
    const res = await getWithTimeout(job.ApplicationURL);
    if (!res) return result(Liveness.UNKNOWN, 'generic network');

    // Greenhouse-hosted boards redirect a closed job back to the board root
    // with ?error=true rather than returning 404.
    if (res.url && /[?&]error=true\b/.test(res.url)) return result(Liveness.DEAD, 'redirected to error page');
    return verdictFromStatus(res.status, 'generic');
}

/**
 * Checks one job against its source.
 *
 * @param {object} job - needs ApplicationURL; JobID improves Greenhouse coverage
 * @param {{boardCache?: Map}} [options] - pass one Map per sweep to share board fetches
 * @returns {Promise<{verdict:'live'|'dead'|'unknown', reason:string, ats:string}>}
 */
export async function checkJobLiveness(job, { boardCache = new Map() } = {}) {
    const target = identifyJob(job);
    if (!target) return { ...result(Liveness.UNKNOWN, 'no usable URL'), ats: 'none' };

    let outcome;
    switch (target.ats) {
        case 'greenhouse': outcome = await checkGreenhouse(target); break;
        case 'lever': outcome = await checkLever(target); break;
        case 'smartrecruiters': outcome = await checkSmartRecruiters(target); break;
        case 'workday': outcome = await checkWorkday(target); break;
        case 'ashby': outcome = await checkAshby(target, boardCache); break;
        default: outcome = await checkGeneric(job);
    }
    return { ...outcome, ats: target.ats };
}
