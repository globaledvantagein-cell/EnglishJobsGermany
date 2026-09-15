import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { GERMAN_CITIES } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';


// --- Helpers ------------------------------------------------------------------

// NOTE: normalizeWorkplaceType here takes a JOB OBJECT (not a string) � Recruitee
// uses boolean flags (job.remote, job.hybrid, job.on_site), not a string field.
// This is intentionally different from the shared string-based normalizeWorkplaceType.

function normalizeWorkplaceType(job) {
    // Recruitee gives three explicit boolean flags
    const isRemote = Boolean(job.remote);
    const isHybrid = Boolean(job.hybrid);
    const isOnSite = Boolean(job.on_site);

    // Priority: Remote > Hybrid > Onsite > Unspecified
    if (isRemote && !isOnSite && !isHybrid) return 'Remote';
    if (isHybrid) return 'Hybrid';
    if (isRemote) return 'Remote'; // remote + on_site = still prefer Remote tag
    if (isOnSite) return 'Onsite';
    return 'Unspecified';
}

function mapEmploymentType(code) {
    if (!code) return null;
    const lower = String(code).toLowerCase();
    if (lower === 'fulltime' || lower === 'full_time' || lower.includes('full')) return 'FullTime';
    if (lower === 'parttime' || lower === 'part_time' || lower.includes('part')) return 'PartTime';
    if (lower === 'contract' || lower.includes('contract')) return 'Contract';
    if (lower === 'internship' || lower.includes('intern')) return 'Intern';
    if (lower === 'temporary' || lower.includes('temp')) return 'Temporary';
    if (lower === 'freelance') return 'Contract';
    if (lower === 'volunteer') return null;
    return null;
}

function mapExperienceLevel(code) {
    if (!code) return null;
    const lower = String(code).toLowerCase();
    if (lower.includes('entry') || lower.includes('junior') || lower.includes('intern') || lower.includes('associate')) return 'Entry';
    if (lower.includes('mid') || lower.includes('intermediate') || lower.includes('regular')) return 'Mid';
    if (lower.includes('senior') || lower.includes('experienced') || lower.includes('expert')) return 'Senior';
    if (lower.includes('executive') || lower.includes('director') || lower.includes('lead') || lower.includes('principal') || lower.includes('vp')) return 'Lead';
    if (lower.includes('staff') || lower.includes('distinguished')) return 'Staff';
    if (lower.includes('not_applicable') || lower.includes('not applicable')) return null;
    return null;
}

function mapContractType(employmentTypeCode, minHours, maxHours) {
    if (!employmentTypeCode) return 'N/A';
    const lower = String(employmentTypeCode).toLowerCase();
    if (lower === 'fulltime' || lower === 'full_time') return 'Full-time';
    if (lower === 'parttime' || lower === 'part_time') {
        if (minHours && maxHours) return `Part-time (${minHours}-${maxHours}h/week)`;
        return 'Part-time';
    }
    if (lower === 'contract') return 'Contract';
    if (lower === 'internship') return 'Internship';
    if (lower === 'temporary') return 'Temporary';
    if (lower === 'freelance') return 'Freelance';
    return 'N/A';
}




/**
 * Checks if a job has at least one Germany location.
 *
 * Uses both:
 *   - The `locations` array (from the list endpoint) which has structured city/country/country_code
 *   - The flat `city`, `country`, `country_code` fields (from the detail endpoint)
 *   - The `location` string field
 */
function hasGermanyLocation(job) {
    // 1. Check structured locations array (list endpoint)
    if (Array.isArray(job.locations) && job.locations.length > 0) {
        for (const loc of job.locations) {
            // Most reliable: country_code
            if (loc.country_code && String(loc.country_code).toUpperCase() === 'DE') return true;

            // Fallback: country name
            const country = String(loc.country || '').toLowerCase();
            if (country === 'germany' || country === 'deutschland') return true;

            // Fallback: city name
            const city = String(loc.city || '').toLowerCase();
            if (GERMAN_CITIES.some(gc => city.includes(gc))) return true;
        }
    }

    // 2. Check flat country_code field (detail endpoint / some list responses)
    if (job.country_code && String(job.country_code).toUpperCase() === 'DE') return true;

    // 3. Check flat country field
    const country = String(job.country || '').toLowerCase();
    if (country === 'germany' || country === 'deutschland') return true;

    // 4. Check flat city field against German cities
    const city = String(job.city || '').toLowerCase();
    if (city && GERMAN_CITIES.some(gc => city.includes(gc))) return true;

    // 5. Check location string field
    const locationStr = String(job.location || '').toLowerCase();
    if (locationStr.includes('germany') || locationStr.includes('deutschland')) return true;
    if (GERMAN_CITIES.some(gc => locationStr.includes(gc))) return true;

    return false;
}

// --- Company subdomain list ---------------------------------------------------
//
// Recruitee Careers Site API:  GET https://{subdomain}.recruitee.com/api/offers/
// No auth key needed � completely free public API.
//
// To find a company's subdomain:
//   1. Visit their careers page
//   2. If it redirects to {something}.recruitee.com, the subdomain is {something}
//   3. Or check job listing URLs � they contain the subdomain
//
// Add new companies here as you discover them.

const companySubdomains = [
    // -- Auto-discovered 2026-04-02 --
    'limehome',                    // limehome � 11 DE / 14 total
    // 'sharpist',                    // Sharpist GmbH � 6 DE / 6 total
    // 'masterplan',                  // Masterplan � 4 DE / 4 total
    // 'ginmon',                      // Ginmon GmbH � 3 DE / 3 total
    // 'rebuy',                       // rebuy � 3 DE / 3 total
    // 'channable',                   // Channable � 3 DE / 15 total
    // 'companisto',                  // Companisto GmbH � 2 DE / 2 total
    // 'effectory',                   // Effectory � 2 DE / 8 total
    // 'personio',                    // FD Sandbox � 1 DE / 1 total
    // 'jobs',                        // Tellent � 1 DE / 7 total
    // --- GERMAN EXPANSION 2026-08-04 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'eleqtron',  // 17 DE / 17 total
    'forwardearth',  // 3 DE / 3 total
    'formo',  // 2 DE / 2 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'bego',  // 17 DE / 18 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'represent',  // 8 DE / 8 total
    'gateway',  // 6 DE / 11 total
    'impact',  // 2 DE / 2 total
    'share',  // 1 DE / 1 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'testimonials',  // 5 DE / 5 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'steamulationjobs',  // 13 DE / 13 total
    'valuezon',  // 5 DE / 5 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'sicherheitnord',  // 137 DE / 138 total
    'bettybarclaygroup',  // 20 DE / 20 total
    'haaszeitarbeit',  // 2 DE / 2 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'bernardgruppe',  // 15 DE / 30 total
    'spiegltec',  // 5 DE / 17 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    '60secondstonapoli',  // 106 DE / 118 total
    'cigusgmbh',  // 49 DE / 54 total
    'connectpeople',  // 26 DE / 26 total
    'accso',  // 18 DE / 22 total
    '8advisory',  // 17 DE / 77 total
    'ahcgmbh',  // 9 DE / 9 total
    'bonial',  // 7 DE / 7 total
    'constellr',  // 5 DE / 9 total
    'cmcom',  // 1 DE / 22 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    'simpex',  // 6 DE / 7 total
    'hrworks',  // 1 DE / 1 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'epilot',  // Added via discovery — 12 DE / 12 total
    'tecosim',  // Added via discovery — 10 DE / 11 total
    'uneedgmbh',  // Added via discovery — 9 DE / 9 total
    'ibexa',  // Added via discovery — 3 DE / 8 total
    'wusthof',  // Added via discovery — 2 DE / 4 total
    'cyclomediatechnology',  // Added via discovery — 2 DE / 11 total
    'fixico',  // Added via discovery — 1 DE / 10 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'nucsai',  // Added via discovery — 7 DE / 11 total
    'berlinmetropolitanschool',  // Added via discovery — 4 DE / 4 total
    'up42gmbh',  // Added via discovery — 3 DE / 3 total
    'routesin1',  // Added via discovery — 2 DE / 14 total
    'hygraph',  // Added via discovery — 2 DE / 2 total
    'apolloventures',  // Added via discovery — 1 DE / 1 total
    'foodlabs1',  // Added via discovery — 1 DE / 5 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'xiaorestaurant',  // Added via discovery — 144 DE / 144 total
    'cordesconsulting',  // Added via discovery — 90 DE / 90 total
    'pmpg',  // Added via discovery — 75 DE / 78 total
    'planethomegroupgmbh',  // Added via discovery — 56 DE / 61 total
    'bedachungenschmidtgmbh',  // Added via discovery — 42 DE / 42 total
    'skkarriere',  // Added via discovery — 38 DE / 38 total
    'kiesertrainingag',  // Added via discovery — 29 DE / 37 total
    'karatefachsportschule',  // Added via discovery — 27 DE / 27 total
    'mittwaldcmservicegmbhcokg',  // Added via discovery — 25 DE / 25 total
    'willibrord',  // Added via discovery — 24 DE / 24 total
    'karriereboeckelsbestede',  // Added via discovery — 21 DE / 21 total
    'abriogmbh',  // Added via discovery — 21 DE / 21 total
    'karriereresonads',  // Added via discovery — 20 DE / 20 total
    'hamelin',  // Added via discovery — 19 DE / 25 total
    'karrierehall',  // Added via discovery — 19 DE / 19 total
    '123fahrschule',  // Added via discovery — 18 DE / 18 total
    'kfzteile24',  // Added via discovery — 18 DE / 18 total
    'evolvedigital',  // Added via discovery — 15 DE / 15 total
    'trustedshops',  // Added via discovery — 14 DE / 19 total
    'beautyholicgmbh',  // Added via discovery — 13 DE / 13 total
    'karrierepapiersprick',  // Added via discovery — 13 DE / 13 total
    'beautyholic',  // Added via discovery — 13 DE / 13 total
    'halbersbacherhospitalitygroup',  // Added via discovery — 12 DE / 12 total
    'karriererheinzeitung',  // Added via discovery — 12 DE / 12 total
    'everdrop',  // Added via discovery — 12 DE / 12 total
    'bbht',  // Added via discovery — 10 DE / 10 total
    'michelscom',  // Added via discovery — 10 DE / 10 total
    'miebachconsulting',  // Added via discovery — 10 DE / 11 total
    'timeoutstiftungggmbh',  // Added via discovery — 10 DE / 10 total
    'etlheimfarthgruppe',  // Added via discovery — 9 DE / 9 total
    'hauptstadtfloss',  // Added via discovery — 8 DE / 8 total
    'shopmanufaktur',  // Added via discovery — 8 DE / 8 total
    'signode',  // Added via discovery — 8 DE / 41 total
    'bbkampfsport',  // Added via discovery — 8 DE / 8 total
    'ewald',  // Added via discovery — 7 DE / 7 total
    'metzgereischafergmbh',  // Added via discovery — 7 DE / 7 total
    'shopwareag',  // Added via discovery — 7 DE / 10 total
    'accilium',  // Added via discovery — 7 DE / 12 total
    'transperfect',  // Added via discovery — 7 DE / 613 total
    'evia',  // Added via discovery — 6 DE / 6 total
    'hausmeisterkrause',  // Added via discovery — 6 DE / 6 total
    'karriereteachingsocials',  // Added via discovery — 6 DE / 6 total
    'kesslerhirsch',  // Added via discovery — 5 DE / 5 total
    'eskandary',  // Added via discovery — 5 DE / 5 total
    'kallebaecker',  // Added via discovery — 5 DE / 5 total
    'miladeus',  // Added via discovery — 5 DE / 5 total
    'skfberlin',  // Added via discovery — 5 DE / 5 total
    'missionmitglieder',  // Added via discovery — 5 DE / 5 total
    '24loggmbh',  // Added via discovery — 4 DE / 4 total
    'copasystemegmbhcokg',  // Added via discovery — 4 DE / 4 total
    'hausfursicherheit',  // Added via discovery — 4 DE / 4 total
    'physioteamfulda',  // Added via discovery — 4 DE / 4 total
    'triffterer',  // Added via discovery — 4 DE / 4 total
    'trustfactory',  // Added via discovery — 4 DE / 4 total
    'wohlbehagen',  // Added via discovery — 4 DE / 4 total
    'planeground',  // Added via discovery — 4 DE / 5 total
    'hermosautomation',  // Added via discovery — 4 DE / 4 total
    'westerhorstmann',  // Added via discovery — 4 DE / 4 total
    'wolthersbrotkate',  // Added via discovery — 4 DE / 4 total
    'winterhoffedelstahl',  // Added via discovery — 4 DE / 4 total
    'wjgruppe',  // Added via discovery — 4 DE / 4 total
    'bauersohnegmbhcokg',  // Added via discovery — 3 DE / 3 total
    'bergerspartner',  // Added via discovery — 3 DE / 3 total
    'hausderbaecker',  // Added via discovery — 3 DE / 3 total
    'consulteer1',  // Added via discovery — 3 DE / 11 total
    'karrierebeimunsch',  // Added via discovery — 3 DE / 3 total
    'singularitysales',  // Added via discovery — 3 DE / 7 total
    'kbonnabfallwirtschaftsgmbhcokg',  // Added via discovery — 3 DE / 3 total
    'wurttembergerwohnkonzeptegmbh',  // Added via discovery — 3 DE / 3 total
    'treuge',  // Added via discovery — 3 DE / 3 total
    'tisgmbh',  // Added via discovery — 3 DE / 3 total
    'milcafeagmbh',  // Added via discovery — 3 DE / 3 total
    'abacusmaschinenbaugmbh',  // Added via discovery — 2 DE / 2 total
    'cremilkgmbh',  // Added via discovery — 2 DE / 2 total
    'cronimetenvirotec',  // Added via discovery — 2 DE / 2 total
    'etterundpartner',  // Added via discovery — 2 DE / 2 total
    'evangelischesozialstationeppingenev',  // Added via discovery — 2 DE / 2 total
    'crossing',  // Added via discovery — 2 DE / 21 total
    '12build',  // Added via discovery — 2 DE / 16 total
    'eversmann',  // Added via discovery — 2 DE / 2 total
    'kampfsportakademiechemnitz',  // Added via discovery — 2 DE / 2 total
    'kayflygmbh',  // Added via discovery — 2 DE / 2 total
    'physiotherapievelvichiagmbh',  // Added via discovery — 2 DE / 2 total
    'mkh',  // Added via discovery — 2 DE / 2 total
    'skgroup',  // Added via discovery — 2 DE / 2 total
    'miaplaza',  // Added via discovery — 2 DE / 3 total
    'skovik',  // Added via discovery — 2 DE / 3 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'rebootmonkey',  // Added via discovery — 153 DE / 4377 total
    'wwd',  // Added via discovery — 93 DE / 93 total
    'wortmannkg',  // Added via discovery — 27 DE / 32 total
    'lbb',  // Added via discovery — 25 DE / 40 total
    'solarvoltgmbh',  // Added via discovery — 25 DE / 25 total
    'feinbaeckereithiele',  // Added via discovery — 22 DE / 22 total
    'inovex',  // Added via discovery — 21 DE / 21 total
    'solutions30deutschland',  // Added via discovery — 18 DE / 18 total
    'delkeskampverpackungswerke',  // Added via discovery — 11 DE / 11 total
    'medasportakademiegmbh',  // Added via discovery — 11 DE / 11 total
    'bright',  // Added via discovery — 9 DE / 9 total
    'eetechnik',  // Added via discovery — 9 DE / 9 total
    'adamhallgroup',  // Added via discovery — 7 DE / 7 total
    'josefschnellunternehmensgruppe',  // Added via discovery — 6 DE / 6 total
    'sozialgruppekasselev',  // Added via discovery — 6 DE / 6 total
    'techpartnerships',  // Added via discovery — 6 DE / 59 total
    'yaya',  // Added via discovery — 6 DE / 22 total
    'grossgartenconsulting',  // Added via discovery — 5 DE / 5 total
    'schweinertperters',  // Added via discovery — 5 DE / 5 total
    'ecomtrading',  // Added via discovery — 4 DE / 4 total
    'edmundgoebgenssvsgmbh',  // Added via discovery — 4 DE / 4 total
    'eifelmoselmakler',  // Added via discovery — 4 DE / 4 total
    'finestmarketing',  // Added via discovery — 4 DE / 4 total
    'hamburgcare',  // Added via discovery — 4 DE / 4 total
    'temicongmbh',  // Added via discovery — 4 DE / 4 total
    'btgbadischetreuhandgesellschaftmbh',  // Added via discovery — 3 DE / 3 total
    'insidem2m',  // Added via discovery — 3 DE / 3 total
    'kandinsky',  // Added via discovery — 3 DE / 3 total
    'newyorkpizza2',  // Added via discovery — 3 DE / 3 total
    'rckt',  // Added via discovery — 3 DE / 3 total
    'scholarshipowl',  // Added via discovery — 3 DE / 4 total
    'sossoftware',  // Added via discovery — 3 DE / 3 total
    'aviapartner',  // Added via discovery — 2 DE / 75 total
    'ehrenkindgmbh',  // Added via discovery — 2 DE / 2 total
    'griesergutackerpartnerschaftmbb',  // Added via discovery — 2 DE / 2 total
    'hanabgermany',  // Added via discovery — 2 DE / 2 total
    'marktlink',  // Added via discovery — 2 DE / 28 total
    'max',  // Added via discovery — 2 DE / 2 total
    'paragonpartners',  // Added via discovery — 2 DE / 2 total
    'wuesthof',  // Added via discovery — 2 DE / 4 total
    'han',  // Added via discovery — 1 DE / 1 total
    'passaderbackhaus',  // Added via discovery — 1 DE / 1 total
    'socialfind',  // Added via discovery — 1 DE / 38 total
    'soundcareers',  // Added via discovery — 1 DE / 17 total
    'tesaeurope',  // Added via discovery — 1 DE / 9 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'digitalreload',  // Added via discovery — 1 DE / 1 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'ros',  // Added via discovery — 50 DE / 50 total
    'hsonlinemarketing',  // Added via discovery — 5 DE / 5 total
    'encome',  // Added via discovery — 3 DE / 3 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    'agenturfuerhaushaltshilfe',  // Added via discovery — 1309 DE / 1309 total
    'allingroup',  // Added via discovery — 68 DE / 68 total
    'mpkarriere',  // Added via discovery — 18 DE / 18 total
    'mattesehlert',  // Added via discovery — 6 DE / 6 total
    'meinmakler24',  // Added via discovery — 3 DE / 3 total
    'archimed',  // Added via discovery — 2 DE / 2 total
    'becongmbh',  // Added via discovery — 1 DE / 1 total
];

// --- Config export -------------------------------------------------------------

export const recruiteeConfig = {
    siteName: 'Recruitee Jobs',
    limit: 20,
    _allJobsQueue: [],
    _initialized: false,
    needsDescriptionScraping: false, // List endpoint returns full description + requirements

    // -- Fetch one subdomain's offers → published + Germany only ----------------
    // Extracted from the initialize() loop so the full offers payload is
    // GC-eligible per company rather than living until the loop ends.
    // Returns null on failure so the caller can count failures.
    async _fetchCompany(subdomain, stateMap) {
        const prev = stateMap.get(stateKey('recruitee', subdomain));
        try {
            const url = `https://${subdomain}.recruitee.com/api/offers/`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);

            const headers = {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            };
            if (prev?.etag) headers['If-None-Match'] = prev.etag;

            const res = await fetch(url, {
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (res.status === 304) {
                await new Promise(resolve => setTimeout(resolve, 300));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: subdomain, etag: prev.etag, contentHash: prev.contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            if (!res.ok) {
                return null;
            }

            const data = await res.json();
            const etag = res.headers.get('etag') || null;
            const allOffers = data.offers || [];

            if (allOffers.length === 0) {
                return {
                    unchanged: false, jobs: [],
                    state: { slug: subdomain, etag, contentHash: computeContentHash([]), jobCount: 0, changed: !prev },
                };
            }

            // id|title|location|status fingerprint — descriptions excluded.
            const contentHash = computeContentHash(
                allOffers.map(o => `${o.id}|${o.title || ''}|${o.location || o.city || ''}|${o.status || ''}`),
            );
            if (prev && prev.contentHash === contentHash) {
                await new Promise(resolve => setTimeout(resolve, 300));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: subdomain, etag, contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            // Filter for published + Germany
            const germanyJobs = allOffers
                .filter(offer => {
                    // Only published offers
                    if (offer.status && offer.status !== 'published') return false;
                    return hasGermanyLocation(offer);
                })
                .map(offer => ({
                    ...offer,
                    _subdomain: subdomain,
                }));

            if (germanyJobs.length > 0) {
                console.log(`[Recruitee] ? ${subdomain}: ${germanyJobs.length} Germany jobs (${allOffers.length} total)`);
            }

            // Polite delay between companies (300ms)
            await new Promise(resolve => setTimeout(resolve, 300));
            return {
                unchanged: false, jobs: germanyJobs,
                state: { slug: subdomain, etag, contentHash, jobCount: germanyJobs.length, changed: true },
            };
        } catch (error) {
            // Only log non-abort errors
            if (error.name !== 'AbortError') {
                console.error(`[Recruitee] ? ${subdomain}: ${error.message}`);
            }
            return null;
        }
    },

    // -- Pre-fetch: hit every company subdomain, filter to Germany --------------
    async initialize() {
        if (this._initialized) return;

        this._allJobsQueue = [];

        console.log(`[Recruitee] Fetching jobs from ${companySubdomains.length} companies...`);

        const stateMap = await loadScrapeStates('recruitee');
        const pendingStates = [];
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;
        let germanyJobsTotal = 0;

        for (const subdomain of companySubdomains) {
            const result = await this._fetchCompany(subdomain, stateMap);
            if (result === null) { failCount++; continue; }
            pendingStates.push(result.state);
            if (result.unchanged) { skippedCount++; continue; }
            if (result.jobs.length > 0) {
                this._allJobsQueue.push(...result.jobs);
                germanyJobsTotal += result.jobs.length;
                successCount++;
            }
        }

        await saveScrapeStatesBulk('recruitee', pendingStates);
        console.log(`[Recruitee] ? Summary: ${successCount} companies with Germany jobs, ${skippedCount} unchanged (skipped), ${failCount} failed/empty`);
        console.log(`[Recruitee] ?? Total Germany jobs queued: ${germanyJobsTotal}`);
        this._initialized = true;
    },

    // -- Called by network.js (fetchJobsPage detects this method) ---------------
    async fetchPage(offset, limit) {
        if (!this._initialized) await this.initialize();
        const jobs = this._allJobsQueue.slice(offset, offset + limit);
        return { jobs, total: this._allJobsQueue.length };
    },

    getJobs(data) {
        return data.jobs || [];
    },

    getTotal(data) {
        return data.total || 0;
    },

    // --- Field extractors (used by processor.js) ------------------------------

    extractJobID(job) {
        // slug is human-readable and unique per company; id is numeric and globally unique
        return `recruitee_${job._subdomain}_${job.id}`;
    },

    extractJobTitle(job) {
        return job.title || '';
    },

    extractCompany(job) {
        // Prefer the company_name field from the API
        if (job.company_name) return job.company_name;

        // Fallback: format subdomain as readable name
        return job._subdomain
            .replace(/[-_]/g, ' ')
            .replace(/\d+$/, '')                   // strip trailing numbers like "billie1"
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
            .trim();
    },

    extractLocation(job) {
        // Build from structured locations array (Germany ones only)
        if (Array.isArray(job.locations) && job.locations.length > 0) {
            const germanyLocs = job.locations.filter(loc => {
                if (loc.country_code && String(loc.country_code).toUpperCase() === 'DE') return true;
                const c = String(loc.country || '').toLowerCase();
                return c === 'germany' || c === 'deutschland';
            });

            const locsToUse = germanyLocs.length > 0 ? germanyLocs : job.locations;
            const parts = locsToUse.map(loc => {
                const city = loc.city || loc.name || '';
                const country = loc.country || '';
                return [city, country].filter(Boolean).join(', ');
            }).filter(Boolean);

            if (parts.length > 0) return parts.join('; ');
        }

        // Fallback: flat city + country fields
        const parts = [job.city, job.country].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');

        // Fallback: location string
        if (job.location) return job.location;

        return 'Germany';
    },

    extractAllLocations(job) {
        const locations = [];

        // From structured locations array
        if (Array.isArray(job.locations)) {
            for (const loc of job.locations) {
                const parts = [loc.city, loc.country].filter(Boolean);
                if (parts.length > 0) locations.push(parts.join(', '));
                if (loc.name && !locations.includes(loc.name)) locations.push(loc.name);
            }
        }

        // From flat fields
        if (job.city) locations.push(job.city);
        if (job.location) locations.push(job.location);

        return normalizeArray(locations);
    },

    extractDescription(job) {
        // Combine description + requirements (both are HTML from the API)
        const parts = [
            job.description || '',
            job.requirements || '',
        ].filter(Boolean);

        return StripHtml(parts.join('\n'));
    },

    extractDescriptionHtml(job) {
        const parts = [
            job.description || '',
            job.requirements || '',
        ].filter(Boolean);
        return SanitizeHtml(parts.join(''));
    },

    extractURL(job) {
        // careers_url is the public listing page
        return job.careers_url || null;
    },

    extractDirectApplyURL(job) {
        // careers_apply_url goes straight to the application form
        return job.careers_apply_url || null;
    },

    extractPostedDate(job) {
        return job.published_at || job.created_at || null;
    },

    extractDepartment(job) {
        return job.department || 'N/A';
    },

    extractTeam(job) {
        // Recruitee doesn't have a separate team field � department covers it
        return null;
    },

    extractOffice(job) {
        // First Germany location city
        if (Array.isArray(job.locations)) {
            for (const loc of job.locations) {
                if (loc.country_code && String(loc.country_code).toUpperCase() === 'DE') {
                    return loc.city || loc.name || null;
                }
            }
        }
        return job.city || null;
    },

    extractCountry(job) {
        // Check structured locations for Germany
        if (Array.isArray(job.locations)) {
            for (const loc of job.locations) {
                if (loc.country_code && String(loc.country_code).toUpperCase() === 'DE') return 'DE';
            }
        }
        if (job.country_code && String(job.country_code).toUpperCase() === 'DE') return 'DE';
        const country = String(job.country || '').toLowerCase();
        if (country === 'germany' || country === 'deutschland') return 'DE';
        return null;
    },

    extractWorkplaceType(job) {
        return normalizeWorkplaceType(job);
    },

    extractIsRemote(job) {
        return Boolean(job.remote);
    },

    extractEmploymentType(job) {
        return mapEmploymentType(job.employment_type_code);
    },

    extractExperienceLevel(job) {
        return mapExperienceLevel(job.experience_code);
    },

    extractIsEntryLevel(job) {
        const level = mapExperienceLevel(job.experience_code);
        return level === 'Entry';
    },

    extractTags(job) {
        const tags = [];

        // Recruitee tags array
        if (Array.isArray(job.tags)) {
            tags.push(...job.tags);
        }

        // Category code as a tag (e.g. "information_technology", "marketing")
        if (job.category_code) {
            tags.push(`Category: ${job.category_code.replace(/_/g, ' ')}`);
        }

        // Education code as a tag
        if (job.education_code && job.education_code !== 'not_applicable') {
            tags.push(`Education: ${job.education_code.replace(/_/g, ' ')}`);
        }

        // Hours info as a tag
        if (job.min_hours && job.max_hours) {
            tags.push(`${job.min_hours}-${job.max_hours}h/week`);
        }

        return normalizeArray(tags);
    },

    extractSalaryCurrency(job) {
        // The salary object structure from Recruitee (if present)
        if (job.salary && typeof job.salary === 'object') {
            return job.salary.currency || null;
        }
        return null;
    },

    extractSalaryMin(job) {
        if (job.salary && typeof job.salary === 'object') {
            const val = Number(job.salary.min);
            return Number.isFinite(val) && val > 0 ? val : null;
        }
        return null;
    },

    extractSalaryMax(job) {
        if (job.salary && typeof job.salary === 'object') {
            const val = Number(job.salary.max);
            return Number.isFinite(val) && val > 0 ? val : null;
        }
        return null;
    },

    extractSalaryInterval(job) {
        if (job.salary && typeof job.salary === 'object') {
            const period = String(job.salary.period || '').toLowerCase();
            if (period.includes('year') || period.includes('annual')) return 'per-year-salary';
            if (period.includes('month')) return 'per-month-salary';
            if (period.includes('hour')) return 'per-hour-wage';
            if (period) return 'per-year-salary'; // default assumption
        }
        return null;
    },

    extractATSPlatform() {
        return 'recruitee';
    },
};
