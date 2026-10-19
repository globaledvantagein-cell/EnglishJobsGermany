import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { isGermanyString, normalizeWorkplaceType, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';


const LEVER_BASE_URL = 'https://api.lever.co/v0/postings';
// EU-hosted accounts (jobs.eu.lever.co) live on a separate API and answer 404
// on the US one — common for European companies, so both are tried.
const LEVER_EU_BASE_URL = 'https://api.eu.lever.co/v0/postings';
const FETCH_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 20000;

/** API base matching a posting's hostedUrl region. */
function apiBaseFor(hostedUrl) {
  return String(hostedUrl || '').includes('jobs.eu.lever.co') ? LEVER_EU_BASE_URL : LEVER_BASE_URL;
}

/** GET a Lever board → array of postings, or null when the board is not on that API. */
async function fetchBoard(baseUrl, slug) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(slug)}?mode=json`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

const companySiteNames = [
  // Tech companies with frequent job postings
  'welocalize',
  // --- BEGIN APPENDED ENTRIES ---
  'veeva',
  'crytek',
  'sonarsource',
  'agicap',
  'coupa', 'qonto', 'pipedrive', 'brevo', 'spotify', 'contentsquare', 'bazaarvoice', 'didomi', 'sophos',
  // --- END APPENDED ENTRIES ---
  // --- GERMAN EXPANSION 2026-08-04 ---
  // Verified: board reachable AND >=1 job located in Germany.
  'finn',  // 34 DE / 36 total
  'justwatch',  // 8 DE / 11 total
  'ppro',  // 8 DE / 29 total
  'sila',  // 7 DE / 199 total
  'aircall',  // 6 DE / 77 total
  'lyrahealth',  // 5 DE / 515 total
  'researchgate',  // 4 DE / 5 total
  'kolibrigames',  // 4 DE / 4 total
  'emburse',  // 1 DE / 36 total
  'gopuff',  // 1 DE / 809 total
  'deliverect',  // 1 DE / 26 total
  'loftorbital',  // 1 DE / 56 total
  // --- GERMAN EXPANSION 2026-08-05 ---
  // Verified: board reachable AND >=1 job located in Germany.
  'malt',  // 5 DE / 36 total
  'pigment',  // 5 DE / 99 total
  'ajax',  // 3 DE / 210 total
  'fresha',  // 2 DE / 153 total
  'kepler',  // 1 DE / 36 total
  'azul',  // 1 DE / 14 total
  'mindy',  // 1 DE / 4 total
  // --- GERMAN EXPANSION 2026-08-05 ---
  // Verified: board reachable AND >=1 job located in Germany.
  'jobgether',  // 114 DE / 2991 total
  'extremenetworks',  // 3 DE / 92 total
  'storiogroup',  // 2 DE / 7 total
  // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
  'novaspace',  // Added via discovery — 6 DE / 28 total
  'valiantys',  // Added via discovery — 3 DE / 10 total
  'quantco-',  // Added via discovery — 2 DE / 16 total
  'spreetail',  // Added via discovery — 2 DE / 28 total
  'rover',  // Added via discovery — 2 DE / 27 total
  'appzen',  // Added via discovery — 1 DE / 21 total
  // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
  'alimentiv-2',  // Added via discovery — 6 DE / 39 total
  'innocraft',  // Added via discovery — 1 DE / 1 total
  // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
  'hypersonica-prod',  // Added via discovery — 26 DE / 39 total
  'netlight',  // Added via discovery — 18 DE / 36 total
  'vivenu',  // Added via discovery — 15 DE / 30 total
  'emma-sleep',  // Added via discovery — 13 DE / 66 total
  'Packmatic',  // Added via discovery — 12 DE / 13 total
  'yuno',  // Added via discovery — 11 DE / 34 total
  'impossiblecloud',  // Added via discovery — 10 DE / 11 total
  'ircagroup',  // Added via discovery — 10 DE / 57 total
  'doonails',  // Added via discovery — 8 DE / 10 total
  'apex-ai',  // Added via discovery — 7 DE / 7 total
  'qwello.eu',  // Added via discovery — 6 DE / 12 total
  'freiheit-2',  // Added via discovery — 6 DE / 8 total
  '360learning',  // Added via discovery — 6 DE / 31 total
  'valpeo.com',  // Added via discovery — 4 DE / 19 total
  'walkme',  // Added via discovery — 4 DE / 27 total
  'dilitrust',  // Added via discovery — 4 DE / 25 total
  'zurichinstruments',  // Added via discovery — 3 DE / 14 total
  'hophr',  // Added via discovery — 3 DE / 29 total
  'sonatype',  // Added via discovery — 3 DE / 31 total
  'unisoninfra',  // Added via discovery — 3 DE / 12 total
  'doctrine',  // Added via discovery — 3 DE / 33 total
  'trustyou',  // Added via discovery — 2 DE / 7 total
  'brafton',  // Added via discovery — 2 DE / 21 total
  'everbridge',  // Added via discovery — 2 DE / 19 total
  'valdera',  // Added via discovery — 2 DE / 14 total
  'global-cxm',  // Added via discovery — 2 DE / 42 total
  'veepee',  // Added via discovery — 2 DE / 72 total
  'GurobiOptimization',  // Added via discovery — 2 DE / 11 total
  'Civitta',  // Added via discovery — 2 DE / 76 total
  'actian',  // Added via discovery — 1 DE / 12 total
  'adlook',  // Added via discovery — 1 DE / 28 total
  'ampeco-global',  // Added via discovery — 1 DE / 10 total
  'caliza-financial-technologies',  // Added via discovery — 1 DE / 2 total
  'BTSE',  // Added via discovery — 1 DE / 36 total
  'bluecatnetworks',  // Added via discovery — 1 DE / 22 total
  'companial',  // Added via discovery — 1 DE / 10 total
  'controlup',  // Added via discovery — 1 DE / 11 total
  'Sprinto',  // Added via discovery — 1 DE / 34 total
  'duetti',  // Added via discovery — 1 DE / 9 total
  'bigblue',  // Added via discovery — 1 DE / 36 total
  'fuellabs',  // Added via discovery — 1 DE / 1 total
  'ghsmartjobs',  // Added via discovery — 1 DE / 6 total
  'deltasands',  // Added via discovery — 1 DE / 29 total
  'firemon',  // Added via discovery — 1 DE / 8 total
  'economicmodeling',  // Added via discovery — 1 DE / 28 total
  'capital',  // Added via discovery — 1 DE / 41 total
  'burga',  // Added via discovery — 1 DE / 38 total
  'gmo',  // Added via discovery — 1 DE / 14 total
  'foxitsoftware',  // Added via discovery — 1 DE / 7 total
  'prilenia',  // Added via discovery — 1 DE / 3 total
  'diamondfoundry',  // Added via discovery — 1 DE / 45 total
  'eleks',  // Added via discovery — 1 DE / 22 total
  'radformation',  // Added via discovery — 1 DE / 5 total
  'canarytechnologies',  // Added via discovery — 1 DE / 30 total
  'q-ctrl',  // Added via discovery — 1 DE / 8 total
  'propellerhead',  // Added via discovery — 1 DE / 10 total
  'mythic-ai.com',  // Added via discovery — 1 DE / 30 total
  'theinformationlab',  // Added via discovery — 1 DE / 3 total
  'apryse',  // Added via discovery — 1 DE / 20 total
  'Clearer',  // Added via discovery — 1 DE / 2 total
  'vestiairecollective',  // Added via discovery — 1 DE / 9 total
  'trendyol',  // Added via discovery — 1 DE / 24 total
  'equativ',  // Added via discovery — 1 DE / 20 total
  'Nomagic',  // Added via discovery — 1 DE / 15 total
  'veo',  // Added via discovery — 1 DE / 16 total
  'zencore',  // Added via discovery — 1 DE / 22 total
  'ogury',  // Added via discovery — 1 DE / 22 total
  'idt',  // Added via discovery — 1 DE / 98 total
  'unlimit',  // Added via discovery — 1 DE / 52 total
  'kpler',  // Added via discovery — 1 DE / 67 total
  'zimperium',  // Added via discovery — 1 DE / 16 total
  'Fliff',  // Added via discovery — 1 DE / 29 total
  'wmg',  // Added via discovery — 1 DE / 27 total
  'sambatv',  // Added via discovery — 1 DE / 57 total
  'redhorsecorp',  // Added via discovery — 1 DE / 64 total
  // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
  // --- GERMAN EXPANSION 2026-10-19 ---
  // Verified: board reachable AND >=1 job located in Germany.
  'lovehoneygroup',  // 19 DE / 43 total
  'insiderone',  // 8 DE / 113 total
  'unzer',  // 6 DE / 14 total
  'efficioconsulting',  // 5 DE / 38 total
  'infinit',  // 4 DE / 8 total
  'mendix',  // 4 DE / 38 total
  'karllagerfeld',  // 3 DE / 50 total
  'xentral',  // 1 DE / 1 total
  'espace',  // 1 DE / 112 total
  'keyloop',  // 1 DE / 68 total
  'oni',  // 1 DE / 19 total
  'olx',  // 1 DE / 56 total
  // --- GERMAN EXPANSION 2026-10-19 ---
  // Verified: board reachable AND >=1 job located in Germany.
  'saviynt',  // 2 DE / 69 total
  'appen',  // 1 DE / 59 total
  'shieldai',  // 1 DE / 643 total
];

/**
 * Check if job has Germany location � uses shared GERMAN_CITIES + isGermanyString()
 */
function hasGermanyLocation(job) {
  try {
    // 1. CHECK COUNTRY CODE FIRST (most reliable)
    if (job.country) {
      const cc = job.country.toLowerCase().trim();
      if (cc === 'de' || cc === 'deu') return true;
      if (cc !== 'de' && cc !== 'deu') return false;
    }

    // 2. Check primary location
    if (job.categories?.location) {
      if (isGermanyString(job.categories.location)) return true;
    }

    // 3. Check all locations array
    if (Array.isArray(job.categories?.allLocations)) {
      for (const location of job.categories.allLocations) {
        if (isGermanyString(location)) return true;
      }
    }

    // 4. Remote � only if explicitly mentions Germany
    if (job.workplaceType === 'remote') {
      const desc = (job.descriptionPlain || '').toLowerCase();
      if (desc.includes('remote in germany') || desc.includes('remote - germany') || desc.includes('germany remote')) return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking Germany location:', error);
    return false;
  }
}

/**
 * Lever Configuration - Compatible with existing architecture
 */
const leverConfig = {
  siteName: 'Lever Jobs',

  // No session needed (public API)
  needsSession: false,

  // Every company is fetched up front into _allJobsQueue, like the other
  // configs. The old one-company-per-page flow ended the whole Lever run at the
  // first board that 404'd or had no Germany jobs — on 2026-10-19 that was
  // company #1 (welocalize), so none of the 119 boards was ever scraped.
  limit: 20,
  _allJobsQueue: [],
  _initialized: false,

  // ? FIX: Lever's company listing API returns only a short intro snippet.
  // Setting this to true triggers processor.js to call getDetails() for the full description.
  needsDescriptionScraping: true,

  /**
   * Fetches the full job details from the Lever per-job API.
   * URL format: https://api.lever.co/v0/postings/{company}/{jobId}
   * This returns the complete description including all sections (lists, additional info, etc.)
   */
  async getDetails(rawJob, _sessionHeaders) {
    try {
      // Extract company slug and job ID from the hosted URL
      // e.g. https://jobs.lever.co/spotify/abc-def-ghi
      let companySlug = null;
      let jobId = rawJob.id;

      if (rawJob.hostedUrl) {
        try {
          const urlParts = new URL(rawJob.hostedUrl).pathname.split('/').filter(Boolean);
          // pathname = ['spotify', 'abc-def-ghi']
          if (urlParts.length >= 2) {
            companySlug = urlParts[0];
          }
        } catch (_) {
          // ignore parse errors
        }
      }

      if (!companySlug || !jobId) {
        console.warn(`[Lever] Could not determine company slug or jobId for job: ${rawJob.text}`);
        return null;
      }

      const detailUrl = `${apiBaseFor(rawJob.hostedUrl)}/${companySlug}/${jobId}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      let data;
      try {
        const res = await fetch(detailUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[Lever] Detail API returned ${res.status} for ${detailUrl}`);
          return null;
        }
        data = await res.json();
      } finally {
        clearTimeout(timeoutId);
      }

      // Lever detail API returns a single job object.
      // description = intro HTML, lists = array of {text, content} sections, additional = closing HTML
      const parts = [];
      const htmlParts = [];

      if (data.description) {
        parts.push(StripHtml(data.description));
        htmlParts.push(SanitizeHtml(data.description));
      }

      if (Array.isArray(data.lists)) {
        for (const section of data.lists) {
          if (section.text) parts.push(`\n${section.text}:`);
          if (section.content) parts.push(StripHtml(section.content));
          if (section.text) htmlParts.push(`<h4>${section.text}</h4>`);
          if (section.content) htmlParts.push(SanitizeHtml(section.content));
        }
      }

      if (data.additional) {
        parts.push(StripHtml(data.additional));
        htmlParts.push(SanitizeHtml(data.additional));
      }

      const fullDescription = parts.join('\n').replace(/\s{3,}/g, '\n\n').trim();
      const fullDescriptionHtml = htmlParts.join('\n').trim();

      if (!fullDescription || fullDescription.length < 50) {
        console.warn(`[Lever] Detail API returned empty/short description for: ${rawJob.text}`);
        return null;
      }

      console.log(`[Lever] ? Got full description (${fullDescription.length} chars) for: ${String(rawJob.text || '').substring(0, 50)}`);
      return { Description: fullDescription, DescriptionHtml: fullDescriptionHtml || null };

    } catch (error) {
      console.error(`[Lever] getDetails error for "${rawJob.text}": ${error.message}`);
      return null;
    }
  },

  baseUrl: LEVER_BASE_URL,

  async initialize() {
    if (this._initialized) return;
    this._allJobsQueue = [];

    console.log(`[Lever] Fetching ${companySiteNames.length} companies (US API, EU fallback)...`);
    let withJobs = 0;
    let eu = 0;
    let dead = 0;
    let cursor = 0;

    const lane = async () => {
      while (cursor < companySiteNames.length) {
        const slug = companySiteNames[cursor++];
        let jobs = await fetchBoard(LEVER_BASE_URL, slug);
        if (jobs === null) {
          jobs = await fetchBoard(LEVER_EU_BASE_URL, slug);
          if (jobs !== null) eu++;
        }
        if (jobs === null) { dead++; continue; }

        const germanyJobs = jobs.filter(hasGermanyLocation);
        if (germanyJobs.length > 0) {
          withJobs++;
          this._allJobsQueue.push(...germanyJobs);
        }
      }
    };
    await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, lane));

    console.log(`[Lever] ✅ ${withJobs} companies with Germany jobs (${eu} on the EU API), ${dead} unreachable, ${this._allJobsQueue.length} jobs queued`);
    this._initialized = true;
  },

  async fetchPage(offset, limit) {
    if (!this._initialized) await this.initialize();
    return { jobs: this._allJobsQueue.slice(offset, offset + limit), total: this._allJobsQueue.length };
  },

  getJobs(data) { return data.jobs || []; },
  getTotal(data) { return data.total || 0; },

  /**
   * Extract unique job ID
   */
  extractJobID: (job) => {
    return `lever_${job.id}`;
  },

  /**
   * Extract job title
   */
  extractJobTitle: (job) => {
    return job.text || 'Untitled Position';
  },

  /**
   * Extract company name
   */
  extractCompany: (job) => {
    if (job.hostedUrl) {
      try {
        const url = new URL(job.hostedUrl);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }
      } catch (e) {
        // Fall through
      }
    }

    return 'Company via Lever';
  },

  /**
   * Extract location(s)
   */
  extractLocation: (job) => {
    const locations = [];

    if (job.categories && job.categories.location) {
      locations.push(job.categories.location);
    }

    if (job.categories && job.categories.allLocations && Array.isArray(job.categories.allLocations)) {
      for (const loc of job.categories.allLocations) {
        if (!locations.includes(loc)) {
          locations.push(loc);
        }
      }
    }

    if (job.workplaceType && job.workplaceType !== 'unspecified' && job.workplaceType !== 'on-site') {
      const workplaceLabel = job.workplaceType.charAt(0).toUpperCase() + job.workplaceType.slice(1);
      locations.push(workplaceLabel);
    }

    return locations.length > 0 ? locations.join(', ') : 'Location not specified';
  },

  /**
   * Extract description from the list API response.
   * Note: This will typically be a short intro only � getDetails() fetches the full version.
   */
  extractDescription: (job) => {
    // descriptionPlain is sometimes available on the list endpoint
    if (job.descriptionPlain && job.descriptionPlain.length > 100) {
      return StripHtml(job.descriptionPlain);
    }
    if (job.description && job.description.length > 100) {
      return StripHtml(job.description);
    }
    // Return empty string so needsDescriptionScraping triggers getDetails()
    return '';
  },

  /**
   * Extract URL
   */
  extractURL: (job) => {
    if (job.hostedUrl) {
      return job.hostedUrl;
    }

    if (job.applyUrl) {
      return job.applyUrl;
    }

    return null;
  },

  /**
   * Extract posting date
   */
  extractPostedDate: (job) => {
    return job.createdAt || null;
  },

  extractDepartment: (job) => {
    return job.categories?.department || 'N/A';
  },

  extractTeam: (job) => {
    return job.categories?.team || null;
  },

  extractOffice: (job) => {
    return job.categories?.location || null;
  },

  extractAllLocations: (job) => {
    return normalizeArray(job.categories?.allLocations || []);
  },

  extractEmploymentType: (job) => {
    return normalizeEmploymentType(job.categories?.commitment);
  },

  extractWorkplaceType: (job) => {
    return normalizeWorkplaceType(job.workplaceType);
  },

  extractIsRemote: (job) => {
    const workplace = normalizeWorkplaceType(job.workplaceType);
    return workplace === 'Remote' || workplace === 'Hybrid';
  },

  extractCountry: (job) => {
    if (!job.country) return null;
    const country = String(job.country).trim();
    if (country.length === 2) return country.toUpperCase();
    if (country.toLowerCase() === 'germany' || country.toLowerCase() === 'deutschland') return 'DE';
    return country;
  },

  extractTags: (job) => {
    return Array.isArray(job.tags) ? job.tags : [];
  },

  extractDirectApplyURL: (job) => {
    return job.applyUrl || null;
  },

  extractSalaryMin: (job) => {
    return Number.isFinite(job.salaryRange?.min) ? job.salaryRange.min : null;
  },

  extractSalaryMax: (job) => {
    return Number.isFinite(job.salaryRange?.max) ? job.salaryRange.max : null;
  },

  extractSalaryCurrency: (job) => {
    return job.salaryRange?.currency || null;
  },

  extractSalaryInterval: (job) => {
    return job.salaryRange?.interval || null;
  },

  extractATSPlatform: () => {
    return 'lever';
  },
};

export { leverConfig };
