import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { isGermanyString, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';
import { isFeatureEnabled } from '../features/featureSwitches.js';

// --- softgarden ----------------------------------------------------------------
// German-native ATS (2,000+ customers in Europe). There is no public JSON API;
// the board is server-rendered HTML, verified by capturing it with REA:
//
//   List:   https://{company}.softgarden.io/de/vacancies
//           one .matchElement row per job: date, "../job/{id}/{slug}" link and
//           .location-view-item city spans. A missing company answers 404.
//   Detail: https://{company}.softgarden.io/job/{id}/{slug}?l=de
//           carries a complete schema.org JobPosting (title, hiringOrganization,
//           jobLocation, description HTML, datePosted, employmentType). A
//           withdrawn job answers 404, which the liveness validator handles.
//
// Kill switch: `sourceSoftgarden` (empty queue while OFF).
// --------------------------------------------------------------------------------

const FETCH_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function getHtml(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
        return { status: res.status, html: res.ok ? await res.text() : null };
    } catch {
        return { status: 0, html: null };
    } finally {
        clearTimeout(timeoutId);
    }
}

const decodeEntities = (text) => String(text || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Listing rows → [{ id, path, title, locations[] }]. */
function parseListing(html) {
    const rows = [];
    for (const match of html.matchAll(/class="matchElement" id="job_id_(\d+)"([\s\S]*?)(?=class="matchElement"|<\/div>\s*<\/div>\s*<\/div>\s*<div class="pagination|$)/g)) {
        const [, id, body] = match;
        const link = body.match(/href="\.\.\/job\/(\d+\/[^"?]*)[^"]*"[^>]*>([^<]*)</);
        if (!link) continue;
        const locations = [...body.matchAll(/location-view-item">([^<]*)</g)]
            .map(m => decodeEntities(m[1]).replace(/,\s*$/, '').trim())
            .filter(Boolean);
        rows.push({ id, path: link[1], title: decodeEntities(link[2]).trim(), locations });
    }
    return rows;
}

/** First schema.org JobPosting block on a job page, or null. */
function parseJobPosting(html) {
    for (const match of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
        try {
            const data = JSON.parse(match[1]);
            const posting = (Array.isArray(data) ? data : [data]).find(d => d?.['@type'] === 'JobPosting');
            if (posting) return posting;
        } catch { /* not JSON-LD we can read */ }
    }
    return null;
}

export const softgardenConfig = {
    siteName: 'Softgarden Jobs',
    limit: 20,
    _allJobsQueue: [],
    _initialized: false,
    needsDescriptionScraping: true, // the listing has no description; getDetails reads the job page

    companySubdomains: [
        'softgarden',
        // --- discovered boards are appended below by add-german-companies.js ---
        // --- GERMAN EXPANSION 2026-10-19 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'kind',  // 126 DE / 561 total
        'datagroup',  // 105 DE / 165 total
        'klierhairgroup',  // 85 DE / 325 total
        'sinc',  // 40 DE / 41 total
        'winkler',  // 36 DE / 85 total
        'newtec',  // 32 DE / 34 total
        'heristo',  // 30 DE / 89 total
        'merkurgroup',  // 27 DE / 173 total
        'fairparken',  // 26 DE / 43 total
        'scheer-group',  // 20 DE / 43 total
        'invitegroup',  // 18 DE / 24 total
        'btelligent',  // 15 DE / 20 total
        'mait',  // 15 DE / 31 total
        'nect',  // 15 DE / 17 total
        'vinci-energies',  // 13 DE / 13 total
        'beepartment',  // 12 DE / 28 total
        'scopevisio',  // 12 DE / 14 total
        'linamar',  // 11 DE / 45 total
        'qards',  // 11 DE / 14 total
        'wiit',  // 11 DE / 34 total
        'rosebikes',  // 9 DE / 40 total
        'swisslifeselect',  // 9 DE / 9 total
        'thyssengas',  // 8 DE / 9 total
        'pohlcon',  // 7 DE / 12 total
        'amexus',  // 6 DE / 9 total
        'meyerwerft',  // 6 DE / 199 total
        'convidius',  // 5 DE / 5 total
        'eurodata',  // 5 DE / 12 total
        'flaschenpost',  // 5 DE / 5 total
        'ledvance',  // 5 DE / 5 total
        'proway',  // 5 DE / 9 total
        'technidata-it',  // 5 DE / 10 total
        'gempex',  // 4 DE / 4 total
        'vettertec',  // 4 DE / 8 total
        'exxeta',  // 3 DE / 4 total
        'ims-robotics',  // 3 DE / 27 total
        'infinitcx',  // 3 DE / 3 total
        'kongress-dortmund',  // 3 DE / 3 total
        'netgo',  // 3 DE / 3 total
        'powernovo',  // 3 DE / 7 total
        'sanimed',  // 3 DE / 13 total
        'astrum-it',  // 2 DE / 2 total
        'bluhmsysteme',  // 2 DE / 17 total
        'brlo',  // 2 DE / 2 total
        'cipsoft',  // 2 DE / 2 total
        'igefa',  // 2 DE / 4 total
        'loxxess',  // 2 DE / 21 total
        'objective-partner',  // 2 DE / 2 total
        'quartett-mobile',  // 2 DE / 2 total
        'stiftung-warentest',  // 2 DE / 2 total
        'teccle-group',  // 2 DE / 2 total
        'tagueri',  // 1 DE / 1 total
        'alba',  // 1 DE / 2 total
        'angeheuert',  // 1 DE / 1 total
        'argusdatainsights',  // 1 DE / 1 total
        'bartec',  // 1 DE / 22 total
        'becon',  // 1 DE / 1 total
        'genua',  // 1 DE / 1 total
        'hrworks',  // 1 DE / 1 total
        'itaricon',  // 1 DE / 1 total
        'itconfigall',  // 1 DE / 1 total
        'komsa',  // 1 DE / 17 total
        'kult-olymp-hades',  // 1 DE / 2 total
        'lawo',  // 1 DE / 5 total
        'mt-industrietechnik',  // 1 DE / 1 total
        'nextsteppersonal',  // 1 DE / 1 total
        'pfmmedical',  // 1 DE / 2 total
        'reviderm',  // 1 DE / 1 total
        'ubica-robotics',  // 1 DE / 1 total
        'venios',  // 1 DE / 1 total
        'wenglorsensoric',  // 1 DE / 38 total
        'xing',  // 1 DE / 1 total
        // --- GERMAN EXPANSION 2026-10-19 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'rs-group',  // 37 DE / 126 total
        'intertek',  // 21 DE / 34 total
        'teleperformance',  // 4 DE / 8 total
        'provectus',  // 3 DE / 3 total
],

    async _fetchCompany(subdomain, stateMap) {
        const prev = stateMap.get(stateKey('softgarden', subdomain));
        const { status, html } = await getHtml(`https://${subdomain}.softgarden.io/de/vacancies`);
        if (!html) {
            if (status !== 404) console.log(`[Softgarden] ? ${subdomain}: HTTP ${status}`);
            return null;
        }

        const rows = parseListing(html);
        const contentHash = computeContentHash(rows.map(r => `${r.id}|${r.title}|${r.locations.join('/')}`));
        if (prev && prev.contentHash === contentHash) {
            return { unchanged: true, jobs: [], state: { slug: subdomain, etag: null, contentHash, jobCount: prev.jobCount ?? 0, changed: false } };
        }

        const germanyJobs = rows
            .filter(r => r.locations.some(isGermanyString))
            .map(r => ({ ...r, _subdomain: subdomain }));
        if (germanyJobs.length > 0) {
            console.log(`[Softgarden] ✅ ${subdomain}: ${germanyJobs.length} jobs in Germany (${rows.length} total)`);
        }
        return { unchanged: false, jobs: germanyJobs, state: { slug: subdomain, etag: null, contentHash, jobCount: germanyJobs.length, changed: true } };
    },

    async initialize() {
        if (this._initialized) return;
        this._allJobsQueue = [];

        if (!isFeatureEnabled('sourceSoftgarden')) {
            console.log('[Softgarden] Kill switch OFF — skipping');
            this._initialized = true;
            return;
        }

        console.log(`[Softgarden] Fetching jobs from ${this.companySubdomains.length} companies...`);
        const stateMap = await loadScrapeStates('softgarden');
        const pendingStates = [];
        let skipped = 0;
        let failed = 0;
        let cursor = 0;

        const lane = async () => {
            while (cursor < this.companySubdomains.length) {
                const result = await this._fetchCompany(this.companySubdomains[cursor++], stateMap);
                if (result === null) { failed++; continue; }
                pendingStates.push(result.state);
                if (result.unchanged) { skipped++; continue; }
                this._allJobsQueue.push(...result.jobs);
            }
        };
        await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, lane));

        await saveScrapeStatesBulk('softgarden', pendingStates);
        console.log(`[Softgarden] ✅ ${this._allJobsQueue.length} Germany jobs queued, ${skipped} boards unchanged, ${failed} failed`);
        this._initialized = true;
    },

    async fetchPage(offset, limit) {
        if (!this._initialized) await this.initialize();
        return { jobs: this._allJobsQueue.slice(offset, offset + limit), total: this._allJobsQueue.length };
    },

    getJobs(data) { return data.jobs || []; },
    getTotal(data) { return data.total || 0; },

    // -- Full posting from the job page's JobPosting JSON-LD ---------------------
    async getDetails(job) {
        const { html } = await getHtml(this.extractURL(job));
        const posting = html ? parseJobPosting(html) : null;
        if (!posting?.description) return { skip: true };

        // Locations stay from the listing: its rows list every city, while the
        // JobPosting often carries only the first one.
        return {
            Company: posting.hiringOrganization?.name || job._subdomain,
            Description: StripHtml(posting.description),
            DescriptionHtml: SanitizeHtml(posting.description),
            PostedDate: posting.datePosted ? new Date(posting.datePosted) : null,
            EmploymentType: normalizeEmploymentType(Array.isArray(posting.employmentType) ? posting.employmentType[0] : posting.employmentType),
        };
    },

    // -- Field extractors (listing row; getDetails fills the rest) ---------------

    extractJobID(job) {
        return `softgarden_${job._subdomain}_${job.id}`;
    },

    extractJobTitle(job) {
        return job.title || '';
    },

    extractCompany(job) {
        return job._subdomain; // replaced by hiringOrganization.name in getDetails
    },

    extractLocation(job) {
        return job.locations.length > 0 ? `${job.locations.join(', ')}, Germany` : 'Germany';
    },

    extractAllLocations(job) {
        return normalizeArray(job.locations.map(city => `${city}, Germany`));
    },

    extractDepartment() {
        return null;
    },

    extractDescription() {
        return ''; // filled by getDetails
    },

    extractDescriptionHtml() {
        return null;
    },

    extractURL(job) {
        return `https://${job._subdomain}.softgarden.io/job/${job.path}?l=de`;
    },

    extractDirectApplyURL(job) {
        return `https://${job._subdomain}.softgarden.io/job/${job.path}?l=de`;
    },

    extractPostedDate() {
        return null; // filled by getDetails
    },

    extractCountry() {
        return 'DE';
    },

    extractWorkplaceType() {
        return 'Unspecified';
    },

    extractIsRemote() {
        return false;
    },

    extractEmploymentType() {
        return null; // filled by getDetails
    },

    extractExperienceLevel() {
        return null;
    },

    extractIsEntryLevel() {
        return null;
    },

    extractOffice(job) {
        return job.locations[0] || null;
    },

    extractATSPlatform() {
        return 'softgarden';
    },

    extractTags() {
        return [];
    },

    extractSalaryCurrency() { return null; },
    extractSalaryMin() { return null; },
    extractSalaryMax() { return null; },
    extractSalaryInterval() { return null; },

    extractTeam() { return null; },
};
