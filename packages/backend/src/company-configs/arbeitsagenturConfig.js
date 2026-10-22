import fetch from 'node-fetch';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadSeenPostings, markPostingSeen, unmarkPostingSeen } from '../core/scrapeState.js';
import { isFeatureEnabled } from '../features/featureSwitches.js';

// --- Bundesagentur für Arbeit (Federal Employment Agency) ----------------------
// Germany's official job exchange: the largest single pool of German postings.
// Public, keyless REST API — the "X-API-Key: jobboerse-jobsuche" header is the
// agency's own public client ID, not a secret (github.com/bundesAPI/jobsuche-api).
//
//   List:   GET /pc/v6/jobs?was={keyword}&size=100&page=N&veroeffentlichtseit={days}
//   Detail: GET /pc/v4/jobdetails/{base64(referenznummer)}   (v2/v6 answer 403)
//   Page:   https://www.arbeitsagentur.de/jobsuche/jobdetail/{referenznummer}
//           — 410 once the posting is withdrawn, which the liveness validator
//           already treats as dead.
//
// The feed has no "all jobs" mode and holds ~1M postings, almost all of them
// for German-speaking roles, so it is queried by English role titles. Every
// posting then goes through the normal pipeline — the AI decides whether
// German is required, exactly as for any ATS.
//
// Descriptions cost one request each, and an AI-rejected posting is never
// saved, so fetched postings are recorded in scrapeSeen and skipped on later
// runs instead of being re-downloaded daily.
//
// Kill switch: `sourceArbeitsagentur` (empty queue while OFF).
// --------------------------------------------------------------------------------

const API_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const API_HEADERS = {
    'X-API-Key': 'jobboerse-jobsuche',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json',
};
const SEEN_SOURCE = 'arbeitsagentur';
// Measured against the live API (2026-10-21): size up to 500 is accepted (1000
// is a 400), paging stops at page 100, and no throttling showed on 20
// back-to-back calls. The 50 queries below match ~16k unique postings over 28
// days; at 500 per page that is ~75 list calls instead of ~250.
const PAGE_SIZE = 500;
const MAX_PAGES_PER_QUERY = 20;     // 10k per query; the largest ("Consultant") has ~2.5k
const PUBLISHED_WITHIN_DAYS = 28;   // older postings are mostly filled already
// Per run. The backlog is bigger than one day's AI budget, so each run takes
// the next slice: postings not reached are never marked seen and come back
// tomorrow. Bounds detail requests and leaves budget for the ATS boards.
const MAX_QUEUE = Number(process.env.ARBEITSAGENTUR_MAX_PER_RUN) || 5000;
const REQUEST_DELAY_MS = 400;       // polite pacing for a public government API
const REQUEST_TIMEOUT_MS = 30000;

// English role titles. A German posting usually carries a German title, so an
// English title is the cheapest signal that a posting may be English-friendly —
// it only decides what is QUEUED; the AI still makes the call.
export const ARBEITSAGENTUR_QUERIES = [
    'English', 'Software Engineer', 'Developer', 'Data Engineer', 'Data Scientist', 'Data Analyst',
    'Product Manager', 'Product Owner', 'Project Manager', 'Engineering Manager', 'DevOps', 'Cloud Engineer',
    'Backend', 'Frontend', 'Full Stack', 'Machine Learning', 'AI Engineer', 'Security Engineer',
    'QA Engineer', 'Test Engineer', 'Solution Architect', 'Consultant', 'Business Analyst',
    'Account Manager', 'Account Executive', 'Sales Manager', 'Customer Success', 'Marketing Manager',
    'Growth', 'UX Designer', 'UI Designer', 'Product Designer', 'Controller', 'Finance Manager',
    'Accountant', 'HR Manager', 'Recruiter', 'Talent Acquisition', 'Operations Manager', 'Supply Chain',
    'Researcher', 'Scientist', 'Mechanical Engineer', 'Electrical Engineer', 'Embedded', 'Hardware Engineer',
    'Team Lead', 'Head of', 'Working Student', 'Internship',
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** GET → parsed JSON, or null on any failure. Never throws. */
async function getJson(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: API_HEADERS, signal: controller.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/** "Essen, Ruhr" etc. for every listed location. */
function locationNames(job) {
    return (job.stellenlokationen || [])
        .map(l => l?.adresse?.ort)
        .filter(Boolean);
}

export const arbeitsagenturConfig = {
    siteName: 'Arbeitsagentur Jobs',
    limit: 20,
    _allJobsQueue: [],
    _initialized: false,
    needsDescriptionScraping: true, // the list has no description; getDetails fetches it

    // -- Pre-fetch phase: one pass over every query ------------------------------
    async initialize() {
        if (this._initialized) return;
        this._allJobsQueue = [];

        if (!isFeatureEnabled('sourceArbeitsagentur')) {
            console.log('[Arbeitsagentur] Kill switch OFF — skipping');
            this._initialized = true;
            return;
        }

        const seen = await loadSeenPostings(SEEN_SOURCE);
        const queued = new Set();
        let listed = 0;
        console.log(`[Arbeitsagentur] Querying ${ARBEITSAGENTUR_QUERIES.length} role titles (${seen.size} postings already fetched)...`);

        for (const query of ARBEITSAGENTUR_QUERIES) {
            if (this._allJobsQueue.length >= MAX_QUEUE) break;
            for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
                const url = new URL(`${API_BASE}/pc/v6/jobs`);
                url.searchParams.set('was', query);
                url.searchParams.set('size', String(PAGE_SIZE));
                url.searchParams.set('page', String(page));
                url.searchParams.set('veroeffentlichtseit', String(PUBLISHED_WITHIN_DAYS));

                const data = await getJson(url);
                const jobs = data?.ergebnisliste || [];
                listed += jobs.length;

                for (const job of jobs) {
                    const ref = job.referenznummer;
                    if (!ref || seen.has(ref) || queued.has(ref)) continue;
                    queued.add(ref);
                    this._allJobsQueue.push(job);
                }

                await sleep(REQUEST_DELAY_MS);
                if (jobs.length < PAGE_SIZE || this._allJobsQueue.length >= MAX_QUEUE) break;
            }
        }

        this._allJobsQueue = this._allJobsQueue.slice(0, MAX_QUEUE);
        console.log(`[Arbeitsagentur] ✅ ${listed} listings read, ${this._allJobsQueue.length} new postings queued`);
        this._initialized = true;
    },

    // -- Called by network.js ---------------------------------------------------
    async fetchPage(offset, limit) {
        if (!this._initialized) await this.initialize();
        const jobs = this._allJobsQueue.slice(offset, offset + limit);
        return { jobs, total: this._allJobsQueue.length };
    },

    getJobs(data) { return data.jobs || []; },
    getTotal(data) { return data.total || 0; },

    // -- Description (one request per posting) -----------------------------------
    async getDetails(job) {
        const ref = job.referenznummer;
        const encoded = Buffer.from(ref, 'utf8').toString('base64');
        const detail = await getJson(`${API_BASE}/pc/v4/jobdetails/${encoded}`);

        // Recorded even when the fetch failed: a posting whose detail is gone
        // is not coming back, and retrying it daily only costs requests.
        await markPostingSeen(SEEN_SOURCE, ref).catch(() => {});

        if (!detail?.stellenangebotsBeschreibung) return { skip: true };
        return {
            Description: detail.stellenangebotsBeschreibung,
            DirectApplyURL: detail.externeURL || null,
        };
    },

    // The AI call failed (quota, outage): the posting was never judged, so it
    // must come back next run instead of staying marked as seen.
    async onAnalysisFailed(job) {
        await unmarkPostingSeen(SEEN_SOURCE, job.referenznummer).catch(() => {});
    },

    // -- Field extractors -------------------------------------------------------
    // List shape: { referenznummer, stellenangebotsTitel, firma, stellenlokationen
    //   [{ adresse: { ort, plz, region, land } }], homeofficemoeglich,
    //   homeofficetyp, arbeitszeitVollzeit, arbeitszeitTeilzeit*,
    //   datumErsteVeroeffentlichung, externeURL, hauptberuf }

    extractJobID(job) {
        return `arbeitsagentur_${job.referenznummer}`;
    },

    extractJobTitle(job) {
        return job.stellenangebotsTitel || '';
    },

    extractCompany(job) {
        return job.firma || '';
    },

    extractLocation(job) {
        const [first] = locationNames(job);
        return first ? `${first}, Germany` : 'Germany';
    },

    extractAllLocations(job) {
        return normalizeArray(locationNames(job).map(name => `${name}, Germany`));
    },

    extractDepartment(job) {
        return job.hauptberuf || null;
    },

    extractDescription() {
        return ''; // filled by getDetails
    },

    extractDescriptionHtml() {
        return null;
    },

    extractURL(job) {
        return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(job.referenznummer)}`;
    },

    extractDirectApplyURL(job) {
        return job.externeURL || null;
    },

    extractPostedDate(job) {
        return job.datumErsteVeroeffentlichung ? new Date(job.datumErsteVeroeffentlichung) : null;
    },

    extractCountry() {
        return 'DE';
    },

    extractWorkplaceType(job) {
        // homeofficetyp is only ever "by arrangement" or a percentage — never
        // fully remote — so the most it supports is Hybrid.
        return job.homeofficemoeglich ? 'Hybrid' : 'Unspecified';
    },

    extractIsRemote() {
        return false;
    },

    extractEmploymentType(job) {
        if (job.arbeitszeitVollzeit) return 'FullTime';
        const partTime = ['arbeitszeitTeilzeitVormittag', 'arbeitszeitTeilzeitNachmittag', 'arbeitszeitTeilzeitAbend', 'arbeitszeitTeilzeitFlexibel'];
        if (partTime.some(key => job[key])) return 'PartTime';
        return null;
    },

    extractExperienceLevel() {
        return null; // derived from the title by the processor
    },

    extractIsEntryLevel() {
        return null;
    },

    extractOffice(job) {
        return locationNames(job)[0] || null;
    },

    extractATSPlatform() {
        return 'arbeitsagentur';
    },

    extractTags(job) {
        return normalizeArray([
            job.hauptberuf,
            job.homeofficemoeglich ? 'Home office possible' : null,
        ]);
    },

    // verguetungsangabe is almost always KEINE_ANGABEN (no salary given)
    extractSalaryCurrency() { return null; },
    extractSalaryMin() { return null; },
    extractSalaryMax() { return null; },
    extractSalaryInterval() { return null; },

    extractTeam() { return null; },
};
