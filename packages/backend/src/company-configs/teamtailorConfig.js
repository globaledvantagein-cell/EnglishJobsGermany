import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { isGermanyString, normalizeWorkplaceType, normalizeCountry, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';

// ─── Teamtailor ────────────────────────────────────────────────────────────────
//
// Teamtailor has no central board API like Greenhouse. Every customer runs its
// own career site — either {slug}.teamtailor.com or a custom domain — and each
// one serves its full published board as a JSON Feed at /jobs.json. No auth, no
// key, and no pagination: one request returns the entire board.
//
// VERIFIED response shape (career.teamtailor.com/jobs.json, JSON Feed v1.1):
//   { version, title, home_page_url, feed_url, items: [ {
//       id:             "36d9bbe6-…"        // uuid, NOT the numeric job id
//       title:          "Senior Partnership Manager - APAC"
//       url:            "https://career.teamtailor.com/jobs/8144170-senior-…"
//       date_published: "2026-07-29T15:03:12+02:00"
//       content_html:   "<h3>…"             // full description
//       _jobposting: {                       // schema.org JobPosting
//         identifier:        { value: 8144170 },   // numeric, stable
//         hiringOrganization:{ name, sameAs },
//         jobLocation: [ { address: { streetAddress, addressLocality,
//                                     postalCode, addressCountry, addressRegion } } ],
//         baseSalary:  { currency, value: { unitText, minValue, maxValue } },
//         datePosted, description,
//       } } ] }
//
// FIELDS TEAMTAILOR DOES NOT PUBLISH in this feed (checked across every item on
// a live board): department, employmentType, jobLocationType/remote flag,
// validThrough, occupationalCategory. The extractors below return 'N/A'/null for
// those rather than inventing values — workplace type is inferred from the title
// and location text, which is the only signal the feed actually carries.
// baseSalary is present on a minority of postings (1 of 17 on the reference board).

// Map schema.org QuantitativeValue.unitText → the interval vocabulary the rest
// of the pipeline uses (mirrors ashbyConfig.extractSalaryInterval).
const SALARY_UNIT_TO_INTERVAL = {
    YEAR: 'per-year-salary',
    MONTH: 'per-month-salary',
    HOUR: 'per-hour-wage',
};

/** First jobLocation address block, or null. */
function getPrimaryAddress(job) {
    const locations = job?._jobposting?.jobLocation;
    if (!Array.isArray(locations) || locations.length === 0) return null;
    return locations[0]?.address || null;
}

/** Every jobLocation address block as an array (feeds may list several). */
function getAllAddresses(job) {
    const locations = job?._jobposting?.jobLocation;
    return Array.isArray(locations) ? locations.map(loc => loc?.address).filter(Boolean) : [];
}

/** "Berlin, DE" from an address block; falls back to whichever part exists. */
function formatAddress(address) {
    if (!address) return null;
    const parts = [address.addressLocality, address.addressCountry].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
}

/** schema.org baseSalary.value, or null when the posting has no salary. */
function getSalaryValue(job) {
    return job?._jobposting?.baseSalary?.value || null;
}

/** Coerce a schema.org numeric-or-string amount to a finite number, else null. */
function toAmount(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export const teamtailorConfig = {
    siteName: "Teamtailor",

    // Career sites live at {slug}.teamtailor.com. Kept as the host pattern
    // rather than a full URL because each company is its own origin.
    baseUrl: "https://{slug}.teamtailor.com",

    // Slugs verified to return HTTP 200 with a parseable feed AND at least one
    // German-addressed posting at the time of writing. Blind slug guessing has a
    // very low hit rate (a wrong slug 404s), so add new entries only after
    // confirming {slug}.teamtailor.com/jobs.json returns items.
    // Each entry was probed individually: the feed must return HTTP 200, parse
    // as JSON, and contain at least one posting with addressCountry "DE".
    // German-job counts at the time of verification are in the comments.
    companyBoardNames: [
        'teamviewer',               // TeamViewer Germany GmbH — 29 DE jobs
        'grouponede',               // group.one DE (dogado, checkdomain) — 10
        'roccofortehotelsgermany',  // Rocco Forte Hotels Germany — 9
        'leaseweb',                 // Leaseweb — 8 (Frankfurt)
        'cacustomeralliancegmbh',   // CA Customer Alliance GmbH, Berlin — 4
        'teamlewis',                // TEAM LEWIS — 4
        'mintos',                   // Mintos — 3 (Berlin office)
        'tibber',                   // Tibber — 3
        'polestar',                 // Polestar — 3
        'securitas',                // Securitas — 3
        'bryter',                   // BRYTER, Berlin legal tech — 2
        'oatly',                    // Oatly AB — 2
        'esker',                    // Esker — 1
        'raidboxes',                // Raidboxes, Münster — 1
        // --- GERMAN EXPANSION 2026-08-04 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'replika',  // 4 DE / 91 total
        'podimo',  // 2 DE / 5 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'fresha',  // 3 DE / 101 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'sigmaai',  // 12 DE / 431 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'dfdsgermany',  // Added via discovery — 9 DE / 9 total
        'pinchonationgermany',  // Added via discovery — 7 DE / 7 total
        'chapter2',  // Added via discovery — 6 DE / 43 total
        'career',  // Added via discovery — 1 DE / 12 total
        'quinyx',  // Added via discovery — 1 DE / 4 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'unicornhospitalitygroup',  // Added via discovery — 4 DE / 4 total
        'nextlottogmbh',  // Added via discovery — 3 DE / 5 total
        'resourcify',  // Added via discovery — 1 DE / 5 total
        'iloq',  // Added via discovery — 1 DE / 9 total
        'grailtalent-1730296269',  // Added via discovery — 1 DE / 18 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'eyesandmoregmbh-1681220218',  // Added via discovery — 100 DE / 100 total
        'huaweiresearchcentergermanyaustria',  // Added via discovery — 94 DE / 100 total
        'nachhilfeunterricht',  // Added via discovery — 73 DE / 100 total
        'orderyoyo',  // Added via discovery — 47 DE / 100 total
        'edelmanngroup',  // Added via discovery — 34 DE / 34 total
        'partseurope-1661956441',  // Added via discovery — 30 DE / 31 total
        'leytonglobal-germany',  // Added via discovery — 29 DE / 29 total
        'stillfrontgroup',  // Added via discovery — 23 DE / 37 total
        'cerdiainternationalgmbh',  // Added via discovery — 22 DE / 22 total
        'pilotcentralservicesgmbh-1732700099',  // Added via discovery — 21 DE / 22 total
        'vi2vi-1743597718',  // Added via discovery — 21 DE / 22 total
        'imaschellinggroupgmbh',  // Added via discovery — 20 DE / 29 total
        'eathappygroup',  // Added via discovery — 20 DE / 20 total
        'dunigroup',  // Added via discovery — 19 DE / 30 total
        'sdworxgroup',  // Added via discovery — 17 DE / 100 total
        'huaweidusseldorf-1719303222',  // Added via discovery — 16 DE / 100 total
        'frontrowgroup',  // Added via discovery — 16 DE / 42 total
        'epicompany',  // Added via discovery — 15 DE / 20 total
        'dcubed',  // Added via discovery — 15 DE / 19 total
        'eitrawmaterialsgmbh',  // Added via discovery — 14 DE / 16 total
        'skylotec',  // Added via discovery — 14 DE / 23 total
        'siemersspezialistengmbh-1738597040',  // Added via discovery — 13 DE / 13 total
        'hanseranking',  // Added via discovery — 13 DE / 15 total
        'plantedfoodsag',  // Added via discovery — 13 DE / 17 total
        'bessystemhausgmbh',  // Added via discovery — 12 DE / 12 total
        'heydata',  // Added via discovery — 12 DE / 12 total
        'coinpoker',  // Added via discovery — 12 DE / 19 total
        'medline',  // Added via discovery — 12 DE / 31 total
        'aleidogroup',  // Added via discovery — 11 DE / 22 total
        'iqm',  // Added via discovery — 11 DE / 22 total
        'sandboxinteractive',  // Added via discovery — 9 DE / 9 total
        'gacmotoreuropebv-1747132357',  // Added via discovery — 9 DE / 48 total
        'manual-1734607080-formel-skin',  // Added via discovery — 8 DE / 8 total
        'twinharbour',  // Added via discovery — 8 DE / 11 total
        'joinbuena',  // Added via discovery — 8 DE / 8 total
        'maritimeandhealthcaregroup',  // Added via discovery — 8 DE / 20 total
        'orbia-orbia-building-infrastructure-wavin',  // Added via discovery — 8 DE / 55 total
        'ascom',  // Added via discovery — 8 DE / 43 total
        'eworgmbh',  // Added via discovery — 8 DE / 100 total
        'birnpartners',  // Added via discovery — 8 DE / 76 total
        'whereversimgmbh-1747224713',  // Added via discovery — 7 DE / 7 total
        'montessorivereinigungnuernbergerlandev',  // Added via discovery — 7 DE / 7 total
        'shd',  // Added via discovery — 7 DE / 7 total
        'enfuceoy',  // Added via discovery — 7 DE / 8 total
        'bsm',  // Added via discovery — 7 DE / 49 total
        'habiagermany',  // Added via discovery — 6 DE / 6 total
        'kellydelipartnerships-1692187640',  // Added via discovery — 6 DE / 43 total
        'twlglobalservicessrl',  // Added via discovery — 6 DE / 29 total
        'zanders',  // Added via discovery — 6 DE / 22 total
        'tfscro',  // Added via discovery — 6 DE / 36 total
        'parkster',  // Added via discovery — 5 DE / 5 total
        'awaze-die-ferienhaus-agentur',  // Added via discovery — 5 DE / 5 total
        'tunstallgermany',  // Added via discovery — 5 DE / 5 total
        'coacgmbh-1728891424',  // Added via discovery — 5 DE / 5 total
        'proxima',  // Added via discovery — 5 DE / 37 total
        'vialytics',  // Added via discovery — 5 DE / 7 total
        'whyhirewrong',  // Added via discovery — 5 DE / 22 total
        'tfbank',  // Added via discovery — 5 DE / 35 total
        'winid',  // Added via discovery — 5 DE / 94 total
        'goodgamestudios',  // Added via discovery — 4 DE / 4 total
        'vistaverbundfurintegrativesozialeun',  // Added via discovery — 4 DE / 6 total
        'doodle',  // Added via discovery — 4 DE / 7 total
        'minnov',  // Added via discovery — 4 DE / 10 total
        'hrneuefische',  // Added via discovery — 4 DE / 4 total
        'infrontsportsmediaag',  // Added via discovery — 4 DE / 10 total
        'volue',  // Added via discovery — 4 DE / 12 total
        'owen',  // Added via discovery — 4 DE / 100 total
        'davidkennedyrecruitment',  // Added via discovery — 4 DE / 100 total
        'francework',  // Added via discovery — 4 DE / 100 total
        'agiledayoy',  // Added via discovery — 3 DE / 4 total
        'montessori-erlangen',  // Added via discovery — 3 DE / 3 total
        'eossaunatechnikgmbh',  // Added via discovery — 3 DE / 3 total
        'webworks',  // Added via discovery — 3 DE / 3 total
        'pfx',  // Added via discovery — 3 DE / 8 total
        'truvio',  // Added via discovery — 3 DE / 10 total
        'bloqit',  // Added via discovery — 3 DE / 28 total
        'eerpoland',  // Added via discovery — 3 DE / 63 total
        'orbia',  // Added via discovery — 3 DE / 100 total
        'wspcentraleurope',  // Added via discovery — 3 DE / 100 total
        'again',  // Added via discovery — 2 DE / 5 total
        'damaemedical',  // Added via discovery — 2 DE / 4 total
        'bihr',  // Added via discovery — 2 DE / 10 total
        'pinkinternetgmbh',  // Added via discovery — 2 DE / 2 total
        'paretosecurities',  // Added via discovery — 2 DE / 9 total
        'playagames',  // Added via discovery — 2 DE / 2 total
        'aignostics',  // Added via discovery — 2 DE / 2 total
        'reelenergy-1727862339',  // Added via discovery — 2 DE / 6 total
        'globalswitch-',  // Added via discovery — 2 DE / 14 total
        'missmoneypennytechnologies',  // Added via discovery — 2 DE / 2 total
        'aafdinair',  // Added via discovery — 2 DE / 7 total
        'seedtag',  // Added via discovery — 2 DE / 19 total
        'supersub',  // Added via discovery — 2 DE / 23 total
        'cainiao',  // Added via discovery — 2 DE / 51 total
        'agileretail',  // Added via discovery — 2 DE / 47 total
        'trainingorchestra',  // Added via discovery — 2 DE / 10 total
        'sinclair',  // Added via discovery — 2 DE / 39 total
        'aebr',  // Added via discovery — 1 DE / 7 total
        'acumetis',  // Added via discovery — 1 DE / 10 total
        'autouncle',  // Added via discovery — 1 DE / 5 total
        'ciliatech',  // Added via discovery — 1 DE / 1 total
        'ilpvfx',  // Added via discovery — 1 DE / 2 total
        'dnpphotoimagingeurope-1732191906',  // Added via discovery — 1 DE / 10 total
        'eficode',  // Added via discovery — 1 DE / 5 total
        'linical',  // Added via discovery — 1 DE / 2 total
        'liveringoy-1700040088',  // Added via discovery — 1 DE / 6 total
        'dedge-1743088149',  // Added via discovery — 1 DE / 26 total
        'imsm',  // Added via discovery — 1 DE / 7 total
        'multiversecomputing',  // Added via discovery — 1 DE / 9 total
        'nudiejeans-1624353382',  // Added via discovery — 1 DE / 5 total
        'mangopay',  // Added via discovery — 1 DE / 8 total
        'gmlhr',  // Added via discovery — 1 DE / 53 total
        'montel',  // Added via discovery — 1 DE / 6 total
        'northstarnetwork-1711439398',  // Added via discovery — 1 DE / 13 total
        'synmatchai',  // Added via discovery — 1 DE / 1 total
        'starship',  // Added via discovery — 1 DE / 4 total
        'synthesized',  // Added via discovery — 1 DE / 3 total
        'biotage-1708019070',  // Added via discovery — 1 DE / 34 total
        'vicarius',  // Added via discovery — 1 DE / 1 total
        'xci',  // Added via discovery — 1 DE / 4 total
        'allinpeoplecultureaipcug-1736947759',  // Added via discovery — 1 DE / 2 total
        'vitechuvudsida',  // Added via discovery — 1 DE / 17 total
        'passivelogic',  // Added via discovery — 1 DE / 18 total
        'fonrochelighting-1741108097',  // Added via discovery — 1 DE / 21 total
        'tecnicagroup',  // Added via discovery — 1 DE / 16 total
        'cmdscale',  // Added via discovery — 1 DE / 1 total
        'worldia',  // Added via discovery — 1 DE / 2 total
        'hadronlabs',  // Added via discovery — 1 DE / 2 total
        'talentin',  // Added via discovery — 1 DE / 21 total
        'hyperionrobotics',  // Added via discovery — 1 DE / 2 total
        'maersk',  // Added via discovery — 1 DE / 10 total
        'parcellab',  // Added via discovery — 1 DE / 3 total
        'carcutter',  // Added via discovery — 1 DE / 15 total
        'vitrolife',  // Added via discovery — 1 DE / 32 total
        'templafy',  // Added via discovery — 1 DE / 7 total
        'lhigroup',  // Added via discovery — 1 DE / 19 total
        'knaufaquapanel',  // Added via discovery — 1 DE / 6 total
        'visiativ',  // Added via discovery — 1 DE / 32 total
        'clunetech',  // Added via discovery — 1 DE / 28 total
        'influencer',  // Added via discovery — 1 DE / 14 total
        'worksterjobs',  // Added via discovery — 1 DE / 100 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'prismatgmbh-1738940659',  // Added via discovery — 41 DE / 43 total
        'knaufgroup',  // Added via discovery — 26 DE / 100 total
        'doktorde',  // Added via discovery — 25 DE / 25 total
        'comberagmbh',  // Added via discovery — 18 DE / 18 total
        'sdworxnv',  // Added via discovery — 18 DE / 100 total
        'schauenburghosetechnologygmbh',  // Added via discovery — 16 DE / 16 total
        'brunnerco',  // Added via discovery — 13 DE / 15 total
        'maison123',  // Added via discovery — 13 DE / 59 total
        'winaparbeitsvermittlung',  // Added via discovery — 12 DE / 12 total
        'elunic',  // Added via discovery — 9 DE / 14 total
        'kapres',  // Added via discovery — 9 DE / 79 total
        'wsa1',  // Added via discovery — 9 DE / 51 total
        'dexiongmbh',  // Added via discovery — 8 DE / 8 total
        'patronusgrouprrtechnologiesgmbh',  // Added via discovery — 8 DE / 8 total
        'belstaff',  // Added via discovery — 7 DE / 44 total
        'genii',  // Added via discovery — 7 DE / 9 total
        'zeekreu',  // Added via discovery — 7 DE / 25 total
        'fiveguysde',  // Added via discovery — 6 DE / 6 total
        'teamblue',  // Added via discovery — 6 DE / 95 total
        'ecomeurope',  // Added via discovery — 5 DE / 11 total
        'fredperry',  // Added via discovery — 5 DE / 19 total
        'mrmarvis',  // Added via discovery — 5 DE / 32 total
        'noisolation',  // Added via discovery — 5 DE / 12 total
        'rurhotelbetriebsgmbh',  // Added via discovery — 5 DE / 5 total
        'keepit',  // Added via discovery — 4 DE / 30 total
        'paper-design-jobs',  // Added via discovery — 4 DE / 4 total
        'southpole',  // Added via discovery — 4 DE / 16 total
        'butter',  // Added via discovery — 3 DE / 16 total
        'coverflex',  // Added via discovery — 3 DE / 10 total
        'eathappygmbh-1734343618',  // Added via discovery — 3 DE / 8 total
        'kiekert',  // Added via discovery — 3 DE / 3 total
        'printfulinc',  // Added via discovery — 3 DE / 36 total
        'trakkenwebservicesgmbh',  // Added via discovery — 3 DE / 5 total
        'vitamin',  // Added via discovery — 3 DE / 22 total
        'avencore',  // Added via discovery — 2 DE / 12 total
        'bsm-bsm-cruise',  // Added via discovery — 2 DE / 4 total
        'buyin-1720596909',  // Added via discovery — 2 DE / 8 total
        'compart',  // Added via discovery — 2 DE / 2 total
        'cvlcosmetics',  // Added via discovery — 2 DE / 5 total
        'firstvet',  // Added via discovery — 2 DE / 6 total
        'johnhenric',  // Added via discovery — 2 DE / 14 total
        'mediaplanet',  // Added via discovery — 2 DE / 10 total
        'printcombv',  // Added via discovery — 2 DE / 17 total
        'scrive-1581940106',  // Added via discovery — 2 DE / 6 total
        'thornsds-1744735181',  // Added via discovery — 2 DE / 5 total
        'awgermany',  // Added via discovery — 1 DE / 1 total
        'axcel',  // Added via discovery — 1 DE / 3 total
        'axelarigato',  // Added via discovery — 1 DE / 4 total
        'bdo',  // Added via discovery — 1 DE / 12 total
        'clunetech-transfermate',  // Added via discovery — 1 DE / 15 total
        'cotrallab',  // Added via discovery — 1 DE / 14 total
        'dcycle',  // Added via discovery — 1 DE / 7 total
        'deepki',  // Added via discovery — 1 DE / 13 total
        'filippak',  // Added via discovery — 1 DE / 5 total
        'firefly',  // Added via discovery — 1 DE / 13 total
        'garantibankinternationalnvnew',  // Added via discovery — 1 DE / 7 total
        'huberholdingag',  // Added via discovery — 1 DE / 21 total
        'iprally',  // Added via discovery — 1 DE / 1 total
        'jlindeberg',  // Added via discovery — 1 DE / 11 total
        'kempoweroy',  // Added via discovery — 1 DE / 5 total
        'lotuscars',  // Added via discovery — 1 DE / 20 total
        'megablockgaming',  // Added via discovery — 1 DE / 1 total
        'nobiaab',  // Added via discovery — 1 DE / 78 total
        'qargo-1711385673',  // Added via discovery — 1 DE / 34 total
        'sport1',  // Added via discovery — 1 DE / 11 total
        'swiftgames',  // Added via discovery — 1 DE / 1 total
        'teambluemaxcluster',  // Added via discovery — 1 DE / 1 total
        'vitecnetherlands',  // Added via discovery — 1 DE / 9 total
        'vivobarefoot',  // Added via discovery — 1 DE / 14 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'auctuscapitalpartnersag-1743583356',  // Added via discovery — 20 DE / 21 total
        'hectorrailgermany',  // Added via discovery — 13 DE / 13 total
        'bakkenbaeck',  // Added via discovery — 4 DE / 9 total
        'aukera',  // Added via discovery — 2 DE / 4 total
        'jochenschweizermydaysholdinggmbh-1734018413',  // Added via discovery — 2 DE / 2 total
        'baronphilippederothschild',  // Added via discovery — 1 DE / 9 total
        'bernhardschulte',  // Added via discovery — 1 DE / 5 total
        'bullfinch',  // Added via discovery — 1 DE / 1 total
        'ingridcapacity',  // Added via discovery — 1 DE / 10 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'anicurade',  // Added via discovery — 99 DE / 100 total
        'bearingpointgmbh-1716386772',  // Added via discovery — 60 DE / 60 total
        'goldjungegmbh',  // Added via discovery — 32 DE / 32 total
        'wellnest',  // Added via discovery — 29 DE / 29 total
        'bminehotels',  // Added via discovery — 23 DE / 23 total
        'autolivgermany',  // Added via discovery — 10 DE / 10 total
        'wspberuf',  // Added via discovery — 10 DE / 10 total
        'astrumitgmbh',  // Added via discovery — 8 DE / 9 total
        'cafeyn',  // Added via discovery — 5 DE / 20 total
        'candisgmbh-1732193829',  // Added via discovery — 3 DE / 3 total
        'axpogroup',  // Added via discovery — 2 DE / 100 total
        'bookbeat',  // Added via discovery — 2 DE / 4 total
        'canatuoy',  // Added via discovery — 2 DE / 3 total
        'pasqal',  // Added via discovery — 2 DE / 31 total
        'ancotrans-1606164612',  // Added via discovery — 1 DE / 7 total
        'auctionet',  // Added via discovery — 1 DE / 6 total
        'mkspampgroup',  // Added via discovery — 1 DE / 23 total
],

    // Internal state
    _allJobsQueue: [],
    _initialized: false,

    // Fetch one career site's feed → Germany-filtered jobs only. Extracted so
    // the full JSON Feed payload is GC-eligible per site instead of living
    // until the whole initialize() loop finishes. Returns null on failure.
    async _fetchCompany(boardName, stateMap) {
        const prev = stateMap.get(stateKey('teamtailor', boardName));
        try {
            const url = `${this.buildFeedUrl(boardName)}`;
            const headers = prev?.etag ? { 'If-None-Match': prev.etag } : {};
            const response = await fetch(url, { headers });

            if (response.status === 304) {
                await new Promise(resolve => setTimeout(resolve, 300));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: boardName, etag: prev.etag, contentHash: prev.contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            if (!response.ok) {
                return null;
            }

            // A missing/renamed career site can answer 200 with an HTML error
            // page, so guard the parse rather than trusting the status alone.
            let data;
            try {
                data = await response.json();
            } catch {
                console.warn(`[Teamtailor] ${boardName}: response was not valid JSON`);
                return null;
            }

            const etag = response.headers.get('etag') || null;
            const items = this.getJobs(data);
            if (items.length === 0) {
                return {
                    unchanged: false, jobs: [],
                    state: { slug: boardName, etag, contentHash: computeContentHash([]), jobCount: 0, changed: !prev },
                };
            }

            // id|title fingerprint — descriptions excluded on purpose.
            const contentHash = computeContentHash(
                items.map(item => `${item?._jobposting?.identifier?.value ?? item?.id}|${item?.title || ''}`),
            );
            if (prev && prev.contentHash === contentHash) {
                await new Promise(resolve => setTimeout(resolve, 300));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: boardName, etag, contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            const germanyJobs = items
                .filter(job => this.hasGermanyLocation(job))
                .map(job => ({
                    ...job,
                    _boardName: boardName,
                    _feedTitle: data?.title || null,
                }));

            if (germanyJobs.length > 0) {
                console.log(`[Teamtailor] ${boardName}: ${germanyJobs.length} jobs in Germany (${items.length} total)`);
            }

            // Rate limit: 300ms between career sites (matches ashbyConfig)
            await new Promise(resolve => setTimeout(resolve, 300));
            return {
                unchanged: false, jobs: germanyJobs,
                state: { slug: boardName, etag, contentHash, jobCount: germanyJobs.length, changed: true },
            };
        } catch (error) {
            console.error(`[Teamtailor] ${boardName}: ${error.message}`);
            return null;
        }
    },

    async initialize() {
        if (this._initialized) return;

        console.log(`[Teamtailor] Fetching jobs from ${this.companyBoardNames.length} career sites...`);

        const stateMap = await loadScrapeStates('teamtailor');
        const pendingStates = [];
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const boardName of this.companyBoardNames) {
            const result = await this._fetchCompany(boardName, stateMap);
            if (result === null) { failCount++; continue; }
            pendingStates.push(result.state);
            if (result.unchanged) { skippedCount++; continue; }
            if (result.jobs.length > 0) {
                this._allJobsQueue.push(...result.jobs);
                successCount++;
            }
        }

        await saveScrapeStatesBulk('teamtailor', pendingStates);
        console.log(`[Teamtailor] Summary: ${successCount} sites with Germany jobs, ${skippedCount} unchanged (skipped), ${failCount} failed/empty`);
        console.log(`[Teamtailor] Total jobs found: ${this._allJobsQueue.length}`);
        this._initialized = true;
    },

    /** Full feed URL for a slug. Accepts a bare custom domain too. */
    buildFeedUrl(boardName) {
        const host = boardName.includes('.') ? boardName : `${boardName}.teamtailor.com`;
        return `https://${host}/jobs.json`;
    },

    // Germany check — the feed's only location signal is the schema.org address
    // block, so match on ISO country first and fall back to the free-text parts.
    hasGermanyLocation(job) {
        for (const address of getAllAddresses(job)) {
            const country = String(address.addressCountry || '').toLowerCase();
            if (country === 'de' || country === 'deu') return true;
            if (isGermanyString(address.addressCountry)) return true;
            if (isGermanyString(address.addressLocality)) return true;
        }

        // Some boards omit the address entirely and put the city in the title.
        if (isGermanyString(job?.title)) return true;

        return false;
    },

    async fetchPage(offset, limit) {
        if (!this._initialized) {
            await this.initialize();
        }

        const jobs = this._allJobsQueue.slice(offset, offset + limit);
        return { jobs, total: this._allJobsQueue.length };
    },

    // Called with TWO different shapes, which is why both are handled here:
    //   1. initialize() passes the raw JSON Feed → { items: [...] }
    //   2. scraperEngine passes the output of fetchPage() → { jobs, total },
    //      because network.fetchJobsPage() returns fetchPage()'s value verbatim.
    // Reading only `items` made the engine see zero jobs, break out of the paging
    // loop on the first page, and report "No new jobs found" — processJob was
    // never reached. Ashby avoids this by naming both keys `jobs`.
    getJobs(data) {
        if (Array.isArray(data?.jobs)) return data.jobs;
        if (Array.isArray(data?.items)) return data.items;
        return [];
    },

    getTotal(data) {
        return data?.total ?? this._allJobsQueue.length;
    },

    extractJobID(job) {
        // identifier.value is the stable numeric posting id; item.id is a uuid
        // that also identifies the posting, so it is a safe fallback.
        const rawId = job?._jobposting?.identifier?.value ?? job?.id;
        return `teamtailor_${job._boardName}_${rawId}`;
    },

    extractJobTitle(job) {
        return job?.title || job?._jobposting?.title || '';
    },

    extractCompany(job) {
        // hiringOrganization.name is the company's own branding — far better
        // than the slug. Fall back to the feed title, then a prettified slug.
        const fromPosting = job?._jobposting?.hiringOrganization?.name;
        if (fromPosting) return fromPosting;
        if (job?._feedTitle) return job._feedTitle;

        return String(job._boardName || '')
            .replace(/[-_]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    },

    extractLocation(job) {
        const formatted = getAllAddresses(job).map(formatAddress).filter(Boolean);
        if (formatted.length > 0) return [...new Set(formatted)].join(', ');
        return 'Germany';
    },

    extractDescription(job) {
        return StripHtml(job?.content_html || job?._jobposting?.description || '');
    },

    extractDescriptionHtml(job) {
        return SanitizeHtml(job?.content_html || job?._jobposting?.description || '');
    },

    extractURL(job) {
        return job?.url || job?._jobposting?.hiringOrganization?.sameAs || '';
    },

    extractPostedDate(job) {
        return job?.date_published || job?._jobposting?.datePosted || null;
    },

    // Not published in the JSON feed — see the header note.
    extractDepartment() {
        return 'N/A';
    },

    extractTeam() {
        return null;
    },

    extractOffice(job) {
        const address = getPrimaryAddress(job);
        return address?.streetAddress || address?.addressLocality || null;
    },

    extractAllLocations(job) {
        return normalizeArray(getAllAddresses(job).map(formatAddress));
    },

    extractCountry(job) {
        return normalizeCountry(getPrimaryAddress(job)?.addressCountry);
    },

    // The feed carries no employmentType, so this is null unless a future feed
    // version adds it. Routed through the shared normalizer for consistency.
    extractEmploymentType(job) {
        return normalizeEmploymentType(job?._jobposting?.employmentType);
    },

    // No jobLocationType either — infer from the only text we have.
    extractWorkplaceType(job) {
        const haystack = `${job?.title || ''} ${this.extractLocation(job)}`;
        return normalizeWorkplaceType(haystack);
    },

    extractIsRemote(job) {
        return this.extractWorkplaceType(job) === 'Remote';
    },

    extractTags(job) {
        const address = getPrimaryAddress(job);
        return normalizeArray([address?.addressLocality, address?.addressRegion]);
    },

    extractDirectApplyURL(job) {
        return job?.url || null;
    },

    extractSalaryCurrency(job) {
        return job?._jobposting?.baseSalary?.currency || null;
    },

    extractSalaryMin(job) {
        // Amounts arrive as strings ("127000") in the live feed.
        return toAmount(getSalaryValue(job)?.minValue);
    },

    extractSalaryMax(job) {
        return toAmount(getSalaryValue(job)?.maxValue);
    },

    extractSalaryInterval(job) {
        const unit = getSalaryValue(job)?.unitText;
        if (!unit) return null;
        return SALARY_UNIT_TO_INTERVAL[String(unit).toUpperCase()] || null;
    },

    extractATSPlatform() {
        return 'teamtailor';
    }
};
