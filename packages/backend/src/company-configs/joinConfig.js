import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { normalizeWorkplaceType, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';
import { isFeatureEnabled } from '../features/featureSwitches.js';

// --- JOIN (join.com) -------------------------------------------------------------
// ATS used by a large number of German SMEs (Arbeitnow's apply flow runs on it).
// No public job API and no public job search (join.com/jobs is the employer
// login — both verified with REA), but:
//
//   Companies: https://join.com/companies/sitemap.xml — every company page,
//              published for crawlers (robots.txt allows it). 14,876 on 2026-10-19.
//   List:      https://join.com/companies/{slug}?page=N — Next.js page whose
//              __NEXT_DATA__ holds initialState.jobs { items, pagination{total,
//              pageCount} }, 5 jobs per page. Items carry country.iso3166.
//   Detail:    https://join.com/companies/{slug}/{idParam} — schema.org
//              JobPosting with the full description. 404 once removed, which the
//              liveness validator already handles.
//
// A 100-company sample (2026-10-19): 98 hiring, 79 with German jobs, 3 jobs per
// company on average, ~79% of them in Germany.
//
// Fetching all companies daily would be ~15k page loads, so each run takes
// MAX_COMPANIES_PER_RUN: boards that had German jobs last time first (they are
// where new postings appear), then never-checked, then least recently checked.
//
// Kill switch: `sourceJoin` (empty queue while OFF).
// --------------------------------------------------------------------------------

const SITEMAP_URL = 'https://join.com/companies/sitemap.xml';
const MAX_COMPANIES_PER_RUN = 3000;
const MAX_PAGES_PER_COMPANY = 20;   // 5 jobs per page → up to 100 jobs per company
const FETCH_CONCURRENCY = 3;
const REQUEST_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

/** initialState.jobs from a company page, or null. */
function parseJobsState(html) {
    const match = html?.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;
    try {
        return JSON.parse(match[1])?.props?.pageProps?.initialState?.jobs || null;
    } catch {
        return null;
    }
}

/** First schema.org JobPosting on a job page, or null. */
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

export const joinConfig = {
    siteName: 'JOIN Jobs',
    limit: 20,
    _allJobsQueue: [],
    _initialized: false,
    needsDescriptionScraping: true, // list items have no description; getDetails reads the job page

    async _loadCompanySlugs() {
        const { html } = await getHtml(SITEMAP_URL);
        const slugs = [...(html || '').matchAll(/<loc>https:\/\/join\.com\/companies\/([^<\/]+)<\/loc>/g)].map(m => m[1]);
        return [...new Set(slugs)];
    },

    /** Picks this run's companies: previous German hits, then unseen, then oldest checked. */
    _pickCompanies(slugs, stateMap) {
        const state = slug => stateMap.get(stateKey('join', slug));
        const hiring = slugs.filter(s => (state(s)?.jobCount ?? 0) > 0);
        const unseen = slugs.filter(s => !state(s));
        const rest = slugs
            .filter(s => state(s) && !((state(s).jobCount ?? 0) > 0))
            .sort((a, b) => new Date(state(a).lastCheckedAt || 0) - new Date(state(b).lastCheckedAt || 0));
        return [...hiring, ...unseen, ...rest].slice(0, MAX_COMPANIES_PER_RUN);
    },

    async _fetchCompany(slug, stateMap) {
        const prev = stateMap.get(stateKey('join', slug));
        const first = await getHtml(`https://join.com/companies/${encodeURIComponent(slug)}`);
        const firstState = parseJobsState(first.html);
        if (!firstState) return null;

        const items = [...(firstState.items || [])];
        const pageCount = Math.min(firstState.pagination?.pageCount || 1, MAX_PAGES_PER_COMPANY);
        for (let page = 2; page <= pageCount; page++) {
            await sleep(REQUEST_DELAY_MS);
            const next = parseJobsState((await getHtml(`https://join.com/companies/${encodeURIComponent(slug)}?page=${page}`)).html);
            items.push(...(next?.items || []));
        }

        const contentHash = computeContentHash(items.map(j => `${j.id}|${j.title || ''}|${j.city?.cityName || ''}|${j.country?.iso3166 || ''}`));
        if (prev && prev.contentHash === contentHash) {
            return { unchanged: true, jobs: [], state: { slug, etag: null, contentHash, jobCount: prev.jobCount ?? 0, changed: false } };
        }

        const germanyJobs = items
            .filter(j => String(j.country?.iso3166 || '').toUpperCase() === 'DE')
            .map(j => ({ ...j, _slug: slug }));
        return { unchanged: false, jobs: germanyJobs, state: { slug, etag: null, contentHash, jobCount: germanyJobs.length, changed: true } };
    },

    async initialize() {
        if (this._initialized) return;
        this._allJobsQueue = [];

        if (!isFeatureEnabled('sourceJoin')) {
            console.log('[JOIN] Kill switch OFF — skipping');
            this._initialized = true;
            return;
        }

        const slugs = await this._loadCompanySlugs();
        const stateMap = await loadScrapeStates('join');
        const batch = this._pickCompanies(slugs, stateMap);
        console.log(`[JOIN] ${slugs.length} companies in sitemap, checking ${batch.length} this run...`);

        const pendingStates = [];
        let withJobs = 0;
        let skipped = 0;
        let failed = 0;
        let cursor = 0;

        const lane = async () => {
            while (cursor < batch.length) {
                const result = await this._fetchCompany(batch[cursor++], stateMap);
                await sleep(REQUEST_DELAY_MS);
                if (result === null) { failed++; continue; }
                pendingStates.push(result.state);
                if (result.unchanged) { skipped++; continue; }
                if (result.jobs.length > 0) withJobs++;
                this._allJobsQueue.push(...result.jobs);
            }
        };
        await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, lane));

        await saveScrapeStatesBulk('join', pendingStates);
        console.log(`[JOIN] ✅ ${withJobs} changed boards with Germany jobs, ${skipped} unchanged, ${failed} failed, ${this._allJobsQueue.length} jobs queued`);
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

        return {
            Company: posting.hiringOrganization?.name || job._slug,
            Description: StripHtml(posting.description),
            DescriptionHtml: SanitizeHtml(posting.description),
            ...(posting.datePosted ? { PostedDate: new Date(posting.datePosted) } : {}),
        };
    },

    // -- Field extractors -------------------------------------------------------
    // Item shape: { idParam, id, title, createdAt, workplaceType, remoteType,
    //   city { cityName, countryName }, employmentType { name },
    //   category { name }, country { iso3166 } }

    extractJobID(job) {
        // `id` is JOIN's job id; the number in idParam (the URL) can differ —
        // it identifies the published ad, which the URL needs. Both resolve.
        return `join_${job.id}`;
    },

    extractJobTitle(job) {
        return job.title || '';
    },

    extractCompany(job) {
        return job._slug; // replaced by hiringOrganization.name in getDetails
    },

    extractLocation(job) {
        return job.city?.cityName ? `${job.city.cityName}, Germany` : 'Germany';
    },

    extractAllLocations(job) {
        return normalizeArray([this.extractLocation(job)]);
    },

    extractDepartment(job) {
        return job.category?.name || null;
    },

    extractDescription() {
        return ''; // filled by getDetails
    },

    extractDescriptionHtml() {
        return null;
    },

    extractURL(job) {
        return `https://join.com/companies/${job._slug}/${job.idParam}`;
    },

    extractDirectApplyURL(job) {
        return `https://join.com/companies/${job._slug}/${job.idParam}`;
    },

    extractPostedDate(job) {
        return job.createdAt ? new Date(job.createdAt) : null;
    },

    extractCountry() {
        return 'DE';
    },

    extractWorkplaceType(job) {
        return normalizeWorkplaceType(job.workplaceType);
    },

    extractIsRemote(job) {
        return String(job.workplaceType || '').toUpperCase() === 'REMOTE';
    },

    extractEmploymentType(job) {
        // JOIN names: "Employee", "Part-time", "Intern", "Freelancer", ...
        const name = String(job.employmentType?.name || '');
        if (/employee/i.test(name)) return 'FullTime';
        return normalizeEmploymentType(name);
    },

    extractExperienceLevel() {
        return null;
    },

    extractIsEntryLevel() {
        return null;
    },

    extractOffice(job) {
        return job.city?.cityName || null;
    },

    extractATSPlatform() {
        return 'join';
    },

    extractTags(job) {
        return normalizeArray([job.category?.name]);
    },

    extractSalaryCurrency() { return null; },
    extractSalaryMin() { return null; },
    extractSalaryMax() { return null; },
    extractSalaryInterval() { return null; },

    extractTeam() { return null; },
};
