import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { isGermanyString, normalizeWorkplaceType, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';

// ─── Seniority mapping (Personio → your ExperienceLevel taxonomy) ─────────
const SENIORITY_MAP = {
    'student':       'Entry',
    'entry-level':   'Entry',
    'experienced':   'Mid',
    'lead':          'Senior',
    'senior':        'Senior',
    'manager':       'Senior',
    'director':      'Director',
    'executive':     'Executive',
};

// ─── Schedule mapping ─────────────────────────────────────────────────────
const SCHEDULE_MAP = {
    'full-time': 'FullTime',
    'part-time': 'PartTime',
};

// ─── XML parser config ────────────────────────────────────────────────────
// Personio quirk: a feed with 1 job returns <position> as object, multi-job
// returns an array. Same for jobDescription. Force these to always be arrays.
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,    // keep numbers as strings, we coerce later
    trimValues: true,
    isArray: (name) => ['position', 'jobDescription'].includes(name),
});

// ─── Description assembly ────────────────────────────────────────────────
// Personio splits descriptions into named sections (Intro / Your tasks /
// Your profile / Benefits). We concatenate them with section headers
// preserved so the AI analyzer + frontend get the full context.
function assembleDescription(jobDescriptionsBlock, asHtml) {
    const sections = jobDescriptionsBlock?.jobDescription || [];
    if (!Array.isArray(sections) || sections.length === 0) return '';

    if (asHtml) {
        return sections
            .map(s => `<h3>${s.name || ''}</h3>${s.value || ''}`)
            .join('\n');
    }
    return sections
        .map(s => `${s.name || ''}\n${StripHtml(s.value || '')}`)
        .join('\n\n');
}

export const personioConfig = {
    siteName: "Personio Jobs",
    baseUrl: null, // not used — each company has its own subdomain

    // Each entry: { subdomain, tld } — tld is 'de' or 'com' depending on
    // the customer. Verify the live URL before adding here.
    // Format: https://{subdomain}.jobs.personio.{tld}/xml?language=en

companyTargets: [
    { subdomain: 'workidentity',         tld: 'de' },
    { subdomain: 'agile-robots-se',      tld: 'de' },
    { subdomain: 'miles-mobility',       tld: 'de' },
    { subdomain: 'peter-park',           tld: 'de' },
    { subdomain: 'trg',                  tld: 'de' },
    { subdomain: 'unternehmertum',       tld: 'de' },
    { subdomain: 'impower',              tld: 'de' },
    { subdomain: 'carbmee',              tld: 'com' },
    { subdomain: 'yoummday-gmbh',        tld: 'de' },
    { subdomain: 'aiya-europe',          tld: 'de' },
    { subdomain: 'data4life',            tld: 'de' },
    { subdomain: 'zdf-digital',          tld: 'de' },
    { subdomain: 'pitch',                tld: 'de' },
    { subdomain: 'altagramgroup',        tld: 'de' },
    { subdomain: 'bliq',                 tld: 'de' },
    { subdomain: 'anton',                tld: 'com' },
    { subdomain: 'kemmler-kemmler-gmbh', tld: 'de' },
    { subdomain: 'zipmend',              tld: 'de' },
    { subdomain: 'certivity',            tld: 'de' },
    { subdomain: 'everience',            tld: 'de' },
    { subdomain: 'studysmarter',         tld: 'de' },
    { subdomain: 'tech11',               tld: 'de' },
    { subdomain: 'pm-team',              tld: 'de' },
    { subdomain: 'ht-ventures-gmbh',     tld: 'de' },
    { subdomain: 'epages-gmbh',          tld: 'de' },
    { subdomain: 'hafencity-hamburg',    tld: 'de' },
    { subdomain: 'azeti',                tld: 'de' },
    { subdomain: 'berlin-bytes',         tld: 'de' },
    { subdomain: 'socialhub',            tld: 'de' },
    { subdomain: 'aignostics',           tld: 'de' },
    { subdomain: 'robco',                tld: 'de' },
    // --- GERMAN EXPANSION 2026-08-04 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'stark', tld: 'de' },  // 135 DE / 185 total
    { subdomain: 'thermondo', tld: 'de' },  // 84 DE / 231 total
    { subdomain: 'westwing', tld: 'de' },  // 64 DE / 75 total
    { subdomain: 'mbition', tld: 'de' },  // 43 DE / 50 total
    { subdomain: 'egym', tld: 'com' },  // 37 DE / 44 total
    { subdomain: 'holidu', tld: 'de' },  // 36 DE / 67 total
    { subdomain: 'jedox', tld: 'de' },  // 34 DE / 40 total
    { subdomain: 'chrono24', tld: 'de' },  // 30 DE / 36 total
    { subdomain: 'urbansportsclub', tld: 'com' },  // 25 DE / 33 total
    { subdomain: 'merantix', tld: 'de' },  // 23 DE / 38 total
    { subdomain: 'kertos', tld: 'de' },  // 21 DE / 23 total
    { subdomain: 'holy', tld: 'de' },  // 19 DE / 40 total
    { subdomain: 'cloover', tld: 'de' },  // 16 DE / 16 total
    { subdomain: 'atmosfair', tld: 'de' },  // 15 DE / 16 total
    { subdomain: 'varm', tld: 'de' },  // 15 DE / 19 total
    { subdomain: 'mercanis', tld: 'de' },  // 14 DE / 20 total
    { subdomain: 'shyftplan', tld: 'de' },  // 12 DE / 12 total
    { subdomain: 'alasco', tld: 'de' },  // 11 DE / 11 total
    { subdomain: 'gematik', tld: 'de' },  // 11 DE / 11 total
    { subdomain: 'gocomo', tld: 'de' },  // 11 DE / 19 total
    { subdomain: 'voiio', tld: 'de' },  // 11 DE / 12 total
    { subdomain: 'lanch', tld: 'de' },  // 10 DE / 20 total
    { subdomain: 'entrix', tld: 'de' },  // 9 DE / 16 total
    { subdomain: 'wunderflats', tld: 'de' },  // 9 DE / 9 total
    { subdomain: 'tanso', tld: 'de' },  // 8 DE / 8 total
    { subdomain: 'knime', tld: 'de' },  // 7 DE / 24 total
    { subdomain: 'ottonova', tld: 'de' },  // 6 DE / 6 total
    { subdomain: 'humanoo', tld: 'de' },  // 5 DE / 7 total
    { subdomain: 'vivira', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'exec', tld: 'com' },  // 5 DE / 6 total
    { subdomain: 'everphone', tld: 'de' },  // 4 DE / 5 total
    { subdomain: 'wandelbots', tld: 'de' },  // 4 DE / 7 total
    { subdomain: 'proglove', tld: 'de' },  // 4 DE / 11 total
    { subdomain: 'bounti', tld: 'de' },  // 4 DE / 5 total
    { subdomain: 'silvernova', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'resolve', tld: 'com' },  // 4 DE / 4 total
    { subdomain: 'clark', tld: 'de' },  // 3 DE / 4 total
    { subdomain: 'finoa', tld: 'de' },  // 3 DE / 7 total
    { subdomain: 'traviangames', tld: 'de' },  // 3 DE / 3 total
    { subdomain: '7learnings', tld: 'de' },  // 3 DE / 7 total
    { subdomain: 'buildingminds', tld: 'de' },  // 3 DE / 5 total
    { subdomain: 'deeploi', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'elearnio', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'goodcarbon', tld: 'de' },  // 3 DE / 6 total
    { subdomain: 'juna-ai', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'ratepay', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'tandem', tld: 'de' },  // 3 DE / 4 total
    { subdomain: 'personio', tld: 'com' },  // 2 DE / 2 total
    { subdomain: 'blickfeld', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'webasto', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'edgeless-systems', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'forward-earth', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'freshflow', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'friendsurance', tld: 'de' },  // 2 DE / 6 total
    { subdomain: 'latana', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'lumoview', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'xolife', tld: 'de' },  // 2 DE / 7 total
    { subdomain: 'buena', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'ygo', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'homeday', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'scalablecapital', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'bigpoint', tld: 'de' },  // 1 DE / 2 total
    { subdomain: 'userlane', tld: 'de' },  // 1 DE / 6 total
    { subdomain: 'retresco', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'workpath', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'assistme', tld: 'de' },  // 1 DE / 2 total
    { subdomain: 'banxware', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'foodforecast', tld: 'de' },  // 1 DE / 4 total
    { subdomain: 'peeriot', tld: 'de' },  // 1 DE / 3 total
    { subdomain: 'quantica', tld: 'de' },  // 1 DE / 4 total
    { subdomain: 'vara', tld: 'de' },  // 1 DE / 2 total
    { subdomain: 'doinstruct', tld: 'com' },  // 1 DE / 3 total
    { subdomain: 'voize', tld: 'com' },  // 1 DE / 2 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'yoshi', tld: 'de' },  // 6 DE / 7 total
    { subdomain: 'wos', tld: 'de' },  // 6 DE / 40 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'sam', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'yuma', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'ten', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'verso', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'beglaubigt', tld: 'de' },  // 2 DE / 3 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'gus-germany', tld: 'de' },  // 115 DE / 144 total
    { subdomain: 'deltavision', tld: 'de' },  // 25 DE / 25 total
    { subdomain: 'homeserve', tld: 'de' },  // 19 DE / 184 total
    { subdomain: 'tonies', tld: 'de' },  // 17 DE / 19 total
    { subdomain: 'q-energy', tld: 'de' },  // 15 DE / 16 total
    { subdomain: 'klickpiloten', tld: 'de' },  // 12 DE / 13 total
    { subdomain: 'hygh', tld: 'de' },  // 12 DE / 13 total
    { subdomain: 'kalo-vor-ort', tld: 'de' },  // 8 DE / 11 total
    { subdomain: 'maltego', tld: 'de' },  // 7 DE / 9 total
    { subdomain: 'cipsoft', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'lrz', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'aleno', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'deepslate', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'pergolux', tld: 'de' },  // 1 DE / 5 total
    { subdomain: 'limehome', tld: 'de' },  // 1 DE / 1 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'xitaso', tld: 'de' },  // 103 DE / 118 total
    { subdomain: 'nexia', tld: 'de' },  // 86 DE / 105 total
    { subdomain: 'dornier-group', tld: 'de' },  // 36 DE / 57 total
    { subdomain: 'krankenhaus-waldfriede', tld: 'de' },  // 35 DE / 39 total
    { subdomain: 'lush', tld: 'de' },  // 35 DE / 49 total
    { subdomain: 'policum-berlin', tld: 'de' },  // 15 DE / 15 total
    { subdomain: 'orderbird', tld: 'de' },  // 14 DE / 19 total
    { subdomain: 'smartbroker', tld: 'de' },  // 9 DE / 14 total
    { subdomain: 'dampsoft', tld: 'de' },  // 8 DE / 11 total
    { subdomain: 'bettercallpaul', tld: 'de' },  // 6 DE / 12 total
    { subdomain: 'ijgd', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'rebike-mobility', tld: 'de' },  // 4 DE / 20 total
    { subdomain: 'remind-me', tld: 'de' },  // 4 DE / 5 total
    { subdomain: 'eon-home', tld: 'de' },  // 4 DE / 6 total
    { subdomain: 'anextour', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'aok-connect', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'forum-berufsbildung', tld: 'de' },  // 2 DE / 25 total
    { subdomain: 'eam-trusted-advisor', tld: 'de' },  // 1 DE / 4 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'codecentric', tld: 'de' },  // 205 DE / 267 total
    { subdomain: 'zollsoft', tld: 'de' },  // 174 DE / 903 total
    { subdomain: 'scalian-germany', tld: 'de' },  // 131 DE / 163 total
    { subdomain: 'apoprojekt', tld: 'de' },  // 107 DE / 115 total
    { subdomain: 'ommax', tld: 'de' },  // 102 DE / 178 total
    { subdomain: '1sp-agency', tld: 'de' },  // 80 DE / 190 total
    { subdomain: 'acture-germany', tld: 'de' },  // 80 DE / 80 total
    { subdomain: 'novotergum', tld: 'de' },  // 52 DE / 173 total
    { subdomain: 'dataciders', tld: 'de' },  // 50 DE / 83 total
    { subdomain: 'communardo', tld: 'de' },  // 44 DE / 107 total
    { subdomain: 'logsol', tld: 'de' },  // 37 DE / 44 total
    { subdomain: 'vantis', tld: 'de' },  // 35 DE / 37 total
    { subdomain: 'meierhofer', tld: 'de' },  // 30 DE / 44 total
    { subdomain: 'meindentist', tld: 'de' },  // 28 DE / 28 total
    { subdomain: 'encoviva', tld: 'de' },  // 26 DE / 32 total
    { subdomain: 'solactive', tld: 'de' },  // 24 DE / 31 total
    { subdomain: 'hedikitas', tld: 'de' },  // 23 DE / 26 total
    { subdomain: 'carbyte', tld: 'de' },  // 22 DE / 52 total
    { subdomain: 'konfetti', tld: 'de' },  // 21 DE / 21 total
    { subdomain: 'secida', tld: 'de' },  // 21 DE / 31 total
    { subdomain: 'dpa', tld: 'de' },  // 20 DE / 22 total
    { subdomain: 'dymatrix', tld: 'de' },  // 20 DE / 21 total
    { subdomain: 'attempto', tld: 'de' },  // 18 DE / 19 total
    { subdomain: '42watt', tld: 'de' },  // 18 DE / 22 total
    { subdomain: 'entroservice', tld: 'de' },  // 17 DE / 28 total
    { subdomain: 'doctarigroup', tld: 'de' },  // 16 DE / 18 total
    { subdomain: 'legalhero', tld: 'de' },  // 15 DE / 28 total
    { subdomain: 'allane', tld: 'de' },  // 15 DE / 24 total
    { subdomain: 'grandir', tld: 'de' },  // 15 DE / 19 total
    { subdomain: 'lautsprecherteufel', tld: 'de' },  // 14 DE / 15 total
    { subdomain: 'odonnell-moonshine', tld: 'de' },  // 13 DE / 15 total
    { subdomain: 'driving-sales-group', tld: 'de' },  // 13 DE / 23 total
    { subdomain: 'nscon', tld: 'de' },  // 12 DE / 19 total
    { subdomain: 'proliance', tld: 'de' },  // 12 DE / 16 total
    { subdomain: 'contabo', tld: 'de' },  // 12 DE / 14 total
    { subdomain: 'dnsnet', tld: 'de' },  // 11 DE / 17 total
    { subdomain: 'aer-group', tld: 'de' },  // 11 DE / 11 total
    { subdomain: 'peak-one', tld: 'de' },  // 11 DE / 11 total
    { subdomain: 'airmo', tld: 'de' },  // 10 DE / 14 total
    { subdomain: 'seniovo', tld: 'de' },  // 10 DE / 14 total
    { subdomain: 'valuenet-group', tld: 'de' },  // 10 DE / 34 total
    { subdomain: 'funkeworks', tld: 'de' },  // 9 DE / 9 total
    { subdomain: 'dgf', tld: 'de' },  // 9 DE / 11 total
    { subdomain: 'green-flexibility', tld: 'de' },  // 9 DE / 32 total
    { subdomain: 'ckm-group', tld: 'de' },  // 8 DE / 11 total
    { subdomain: 'syseleven', tld: 'de' },  // 8 DE / 8 total
    { subdomain: 'saeki', tld: 'de' },  // 8 DE / 12 total
    { subdomain: 'jobrad-loop', tld: 'de' },  // 8 DE / 43 total
    { subdomain: 'kompetenz-jugendhilfe', tld: 'de' },  // 7 DE / 9 total
    { subdomain: 'promodata', tld: 'de' },  // 7 DE / 25 total
    { subdomain: 'vdwbayern', tld: 'de' },  // 6 DE / 9 total
    { subdomain: 'gustavogusto', tld: 'de' },  // 6 DE / 17 total
    { subdomain: 'kinderwelt-hamburg', tld: 'de' },  // 6 DE / 22 total
    { subdomain: 'demecan', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'nordsee', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'tauw', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'invia', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'ftapi', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'ambrock', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'hiq', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'noventive', tld: 'de' },  // 5 DE / 9 total
    { subdomain: 'navax-software', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'dmcgroup', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'assenagon', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'enernovix', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'kaiserwetter', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'autorola', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'aroundhome', tld: 'de' },  // 4 DE / 5 total
    { subdomain: 'timify', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'univativ-group', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'darkside', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'mavig', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'qaware', tld: 'de' },  // 4 DE / 5 total
    { subdomain: 'ubilabs', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'novomind', tld: 'de' },  // 4 DE / 11 total
    { subdomain: 'bring-labs', tld: 'de' },  // 3 DE / 6 total
    { subdomain: 'publiccloudgroup', tld: 'de' },  // 3 DE / 6 total
    { subdomain: 'dedicom', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'btelligent', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'ryd', tld: 'de' },  // 3 DE / 5 total
    { subdomain: 'frommer-legal', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'conet', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'stiftung-spi', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'cybercurriculum', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'gustavepple', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'pta', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'euro-trainings-centre-etc-ggmbh', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'fellowpro', tld: 'de' },  // 2 DE / 3 total
    { subdomain: '59engineers', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'pdv', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'urari', tld: 'de' },  // 1 DE / 6 total
    { subdomain: 'mindeight', tld: 'de' },  // 1 DE / 2 total
    { subdomain: 'wbg-friedrichshain', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'greenit', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'bidt', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'pramlgroup', tld: 'de' },  // 1 DE / 26 total
    { subdomain: 'ebp-consulting', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'yer-deutschland', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'optikhallmann', tld: 'de' },  // 1 DE / 14 total
    { subdomain: 'welearn', tld: 'de' },  // 1 DE / 2 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: '1komma5grad', tld: 'de' },  // 527 DE / 1796 total
    { subdomain: 'ambior-gmbh', tld: 'de' },  // 72 DE / 96 total
    { subdomain: 'academia-holding-gmbh', tld: 'de' },  // 42 DE / 80 total
    { subdomain: 'armira-beteiligungen-gmbh-co-kg', tld: 'de' },  // 10 DE / 10 total
    { subdomain: 'adsquare', tld: 'de' },  // 9 DE / 16 total
    { subdomain: 'atgde', tld: 'de' },  // 8 DE / 8 total
    { subdomain: 'amplio', tld: 'de' },  // 6 DE / 10 total
    { subdomain: 'adragos-leipzig', tld: 'de' },  // 5 DE / 5 total
    { subdomain: 'amnesty-international-deutschland', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'aktivbank', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'antenne-deutschland', tld: 'de' },  // 2 DE / 2 total
    { subdomain: '55birchstreet', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'abcfinlab', tld: 'de' },  // 1 DE / 2 total
    { subdomain: 'ams-technologies-ag', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'anybill', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'aserto', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'audi-business-innovation-gmbh', tld: 'de' },  // 1 DE / 1 total
    // --- GERMAN EXPANSION 2026-08-05 ---
    // Verified: board reachable AND >=1 job located in Germany.
    { subdomain: 'bauer-elektroanlagen', tld: 'de' },  // 89 DE / 209 total
    { subdomain: 'project-a', tld: 'de' },  // 48 DE / 48 total
    { subdomain: 'hornetsecurity', tld: 'de' },  // 39 DE / 116 total
    { subdomain: 'bergmanclinics', tld: 'de' },  // 33 DE / 64 total
    { subdomain: 'autohaus-royal', tld: 'de' },  // 33 DE / 33 total
    { subdomain: 'autohaus-bleker-gmbh', tld: 'de' },  // 29 DE / 104 total
    { subdomain: 'meteocontrol', tld: 'de' },  // 28 DE / 47 total
    { subdomain: 'artnight-gmbh', tld: 'de' },  // 25 DE / 45 total
    { subdomain: 'undkrauss', tld: 'de' },  // 23 DE / 25 total
    { subdomain: 'moore-tk', tld: 'de' },  // 20 DE / 68 total
    { subdomain: 'carpus', tld: 'de' },  // 17 DE / 19 total
    { subdomain: 'okapiorbits', tld: 'de' },  // 16 DE / 18 total
    { subdomain: 'autarcenergy', tld: 'de' },  // 15 DE / 15 total
    { subdomain: 'finetech', tld: 'de' },  // 15 DE / 15 total
    { subdomain: 'auxmoney-gmbh', tld: 'de' },  // 14 DE / 16 total
    { subdomain: 'asg', tld: 'de' },  // 14 DE / 15 total
    { subdomain: 'p3-security', tld: 'de' },  // 14 DE / 27 total
    { subdomain: 'homaris', tld: 'de' },  // 13 DE / 14 total
    { subdomain: 'ba-tax-gmbh', tld: 'de' },  // 12 DE / 12 total
    { subdomain: 'raible', tld: 'de' },  // 12 DE / 22 total
    { subdomain: 'maxsolar', tld: 'de' },  // 12 DE / 20 total
    { subdomain: 'berlinhaus-verwaltung-gmbh', tld: 'de' },  // 11 DE / 23 total
    { subdomain: 'steadforce', tld: 'de' },  // 11 DE / 11 total
    { subdomain: 'bell-flavors-fragrances-gmbh', tld: 'de' },  // 10 DE / 11 total
    { subdomain: 'greenwind-group', tld: 'de' },  // 10 DE / 35 total
    { subdomain: 'timpla', tld: 'de' },  // 9 DE / 29 total
    { subdomain: 'asellerate-gmbh', tld: 'de' },  // 8 DE / 9 total
    { subdomain: 'albaberlin', tld: 'de' },  // 8 DE / 8 total
    { subdomain: 'dornier-medtech', tld: 'de' },  // 8 DE / 8 total
    { subdomain: 'crozdach', tld: 'de' },  // 8 DE / 17 total
    { subdomain: 'bralebau', tld: 'de' },  // 7 DE / 15 total
    { subdomain: 'norsan', tld: 'de' },  // 7 DE / 8 total
    { subdomain: 'mehr-ampere', tld: 'de' },  // 7 DE / 9 total
    { subdomain: 'gel-express-logistik', tld: 'de' },  // 6 DE / 22 total
    { subdomain: 'ifg', tld: 'de' },  // 6 DE / 9 total
    { subdomain: 'softdoor', tld: 'de' },  // 6 DE / 18 total
    { subdomain: 'solareins', tld: 'de' },  // 5 DE / 16 total
    { subdomain: 'klebl', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'tng', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'tum', tld: 'de' },  // 5 DE / 6 total
    { subdomain: 'ass', tld: 'de' },  // 4 DE / 4 total
    { subdomain: 'aw-algorithmwatch-ggmbh', tld: 'de' },  // 4 DE / 5 total
    { subdomain: 'bauer-kirch', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'scrapbees', tld: 'de' },  // 3 DE / 11 total
    { subdomain: 'honest-catch', tld: 'de' },  // 3 DE / 3 total
    { subdomain: 'aventus', tld: 'de' },  // 2 DE / 4 total
    { subdomain: 'bfgroup', tld: 'de' },  // 2 DE / 10 total
    { subdomain: 'ampere', tld: 'de' },  // 2 DE / 5 total
    { subdomain: 'aparts', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'landenberg-medical-institute', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'yepp', tld: 'de' },  // 2 DE / 2 total
    { subdomain: 'personal-partner', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'gti-elektroanlagen', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'fair-parken', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'flowprime', tld: 'de' },  // 2 DE / 5 total
    { subdomain: 'ghcsolutions', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'gutachterix', tld: 'de' },  // 2 DE / 3 total
    { subdomain: 'baeuerle', tld: 'de' },  // 1 DE / 3 total
    { subdomain: 'com-in', tld: 'de' },  // 1 DE / 1 total
    { subdomain: 'swiss-sense', tld: 'de' },  // 1 DE / 1 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { subdomain: 'twentyfour-industries', tld: 'de' },  // Added via discovery — 18 DE / 18 total
    { subdomain: 'bewunder', tld: 'de' },  // Added via discovery — 11 DE / 25 total
    { subdomain: 'circus', tld: 'de' },  // Added via discovery — 9 DE / 11 total
    { subdomain: 'dida', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'ethinking-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'imfusion', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'twaice', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'peakace', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'floy', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { subdomain: 'autonomous-teaming', tld: 'de' },  // Added via discovery — 20 DE / 20 total
    { subdomain: 'aesir', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'checkmk-gmbh', tld: 'de' },  // Added via discovery — 10 DE / 12 total
    { subdomain: 'nordic-hamburg', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'ariadne', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'youhamburg', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { subdomain: 'instaff-jobs', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'redalpine', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { subdomain: 'real-digital', tld: 'de' },  // Added via discovery — 21 DE / 22 total
    { subdomain: 'nextbike', tld: 'de' },  // Added via discovery — 14 DE / 22 total
    { subdomain: 'envelio', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'umh-systems-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'elastique-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { subdomain: 'skalbach-gmbh', tld: 'de' },  // Added via discovery — 146 DE / 172 total
    { subdomain: 'dental21', tld: 'de' },  // Added via discovery — 137 DE / 169 total
    { subdomain: 'leitwerk-ag', tld: 'de' },  // Added via discovery — 84 DE / 109 total
    { subdomain: 'kb1', tld: 'de' },  // Added via discovery — 70 DE / 104 total
    { subdomain: 'voessing', tld: 'de' },  // Added via discovery — 67 DE / 71 total
    { subdomain: 'apelos', tld: 'de' },  // Added via discovery — 64 DE / 152 total
    { subdomain: 'ecovis-kso', tld: 'de' },  // Added via discovery — 59 DE / 60 total
    { subdomain: 'zahneinsgmbh', tld: 'de' },  // Added via discovery — 59 DE / 131 total
    { subdomain: 'kitarino-service-gmbh', tld: 'de' },  // Added via discovery — 58 DE / 64 total
    { subdomain: 'dieseo-gmbh', tld: 'de' },  // Added via discovery — 58 DE / 63 total
    { subdomain: 'maibornwolff', tld: 'de' },  // Added via discovery — 55 DE / 55 total
    { subdomain: 'becker-buettner-held-partgmbb-1', tld: 'de' },  // Added via discovery — 54 DE / 61 total
    { subdomain: 'palabra-praxisgruppe-gmbh', tld: 'de' },  // Added via discovery — 52 DE / 54 total
    { subdomain: 'rex', tld: 'de' },  // Added via discovery — 50 DE / 50 total
    { subdomain: 'hirschen-group', tld: 'de' },  // Added via discovery — 44 DE / 44 total
    { subdomain: 'zfb', tld: 'de' },  // Added via discovery — 43 DE / 43 total
    { subdomain: 'tiemeyer', tld: 'de' },  // Added via discovery — 42 DE / 112 total
    { subdomain: 'hwp', tld: 'de' },  // Added via discovery — 42 DE / 121 total
    { subdomain: 'brl', tld: 'de' },  // Added via discovery — 41 DE / 41 total
    { subdomain: 'mtr-rechtsanwaltsgesellschaft-mbh', tld: 'de' },  // Added via discovery — 41 DE / 50 total
    { subdomain: 'zurheide-feine-kost-kg', tld: 'de' },  // Added via discovery — 39 DE / 39 total
    { subdomain: 'weber-ingenieure-gmbh', tld: 'de' },  // Added via discovery — 38 DE / 65 total
    { subdomain: 'sungrow-emea', tld: 'de' },  // Added via discovery — 37 DE / 144 total
    { subdomain: 'fieldfisher', tld: 'de' },  // Added via discovery — 35 DE / 35 total
    { subdomain: 'jungvonmatt', tld: 'de' },  // Added via discovery — 35 DE / 36 total
    { subdomain: 'businessangels', tld: 'de' },  // Added via discovery — 32 DE / 32 total
    { subdomain: 'goerg-partnerschaft-von-rechtsanwaelten', tld: 'de' },  // Added via discovery — 32 DE / 40 total
    { subdomain: 'creso-ggmbh-gbb-mbh', tld: 'de' },  // Added via discovery — 30 DE / 32 total
    { subdomain: 'sirius', tld: 'de' },  // Added via discovery — 30 DE / 34 total
    { subdomain: 'medermis-clinics-gmbh', tld: 'de' },  // Added via discovery — 30 DE / 54 total
    { subdomain: 'valeara', tld: 'de' },  // Added via discovery — 30 DE / 60 total
    { subdomain: 'getec-holding', tld: 'de' },  // Added via discovery — 29 DE / 37 total
    { subdomain: 'hitzler', tld: 'de' },  // Added via discovery — 28 DE / 38 total
    { subdomain: 'pepco', tld: 'de' },  // Added via discovery — 28 DE / 59 total
    { subdomain: 'karrieretutor-de', tld: 'de' },  // Added via discovery — 27 DE / 28 total
    { subdomain: 'lifelink-medical-gmbh', tld: 'de' },  // Added via discovery — 26 DE / 56 total
    { subdomain: 'es-group', tld: 'de' },  // Added via discovery — 26 DE / 26 total
    { subdomain: 'ramp106-gmbh', tld: 'de' },  // Added via discovery — 25 DE / 25 total
    { subdomain: 'authilde', tld: 'de' },  // Added via discovery — 25 DE / 38 total
    { subdomain: 'enlite', tld: 'de' },  // Added via discovery — 25 DE / 31 total
    { subdomain: 'falkensteg-gmbh', tld: 'de' },  // Added via discovery — 25 DE / 25 total
    { subdomain: 'dci', tld: 'de' },  // Added via discovery — 24 DE / 24 total
    { subdomain: 'afc-gruppe', tld: 'de' },  // Added via discovery — 24 DE / 35 total
    { subdomain: 'prime-time-fitness', tld: 'de' },  // Added via discovery — 24 DE / 30 total
    { subdomain: 'viu-ventures', tld: 'de' },  // Added via discovery — 24 DE / 30 total
    { subdomain: 'ypog-law', tld: 'de' },  // Added via discovery — 23 DE / 23 total
    { subdomain: 'rumble', tld: 'de' },  // Added via discovery — 23 DE / 48 total
    { subdomain: 'arqis', tld: 'de' },  // Added via discovery — 22 DE / 22 total
    { subdomain: 'intense-ag', tld: 'de' },  // Added via discovery — 22 DE / 23 total
    { subdomain: 'eckert-schulen', tld: 'de' },  // Added via discovery — 22 DE / 53 total
    { subdomain: '360volt-gmbh', tld: 'de' },  // Added via discovery — 22 DE / 23 total
    { subdomain: 'huz', tld: 'de' },  // Added via discovery — 22 DE / 28 total
    { subdomain: 'swissbit', tld: 'de' },  // Added via discovery — 22 DE / 28 total
    { subdomain: '1000satellites-coworking', tld: 'de' },  // Added via discovery — 21 DE / 21 total
    { subdomain: 'poellath-rechtsanwaelte', tld: 'de' },  // Added via discovery — 21 DE / 21 total
    { subdomain: 'rosengarten-gmbh', tld: 'de' },  // Added via discovery — 21 DE / 58 total
    { subdomain: 'triple-a', tld: 'de' },  // Added via discovery — 21 DE / 35 total
    { subdomain: 'comma-soft', tld: 'de' },  // Added via discovery — 20 DE / 20 total
    { subdomain: 'digit4u-bs', tld: 'de' },  // Added via discovery — 20 DE / 20 total
    { subdomain: 'knick-elektronische-messgeraete-gmbh-co', tld: 'de' },  // Added via discovery — 20 DE / 20 total
    { subdomain: 'hws', tld: 'de' },  // Added via discovery — 20 DE / 88 total
    { subdomain: 'studyflix-gmbh', tld: 'de' },  // Added via discovery — 20 DE / 20 total
    { subdomain: 'tpg', tld: 'de' },  // Added via discovery — 20 DE / 26 total
    { subdomain: 'dr-born-dr-ermel-gmbh', tld: 'de' },  // Added via discovery — 20 DE / 27 total
    { subdomain: 'planqc-gmbh', tld: 'de' },  // Added via discovery — 20 DE / 20 total
    { subdomain: 'augprien', tld: 'de' },  // Added via discovery — 19 DE / 19 total
    { subdomain: 'aktiv-schuh-handelsgesellschaft-mbh', tld: 'de' },  // Added via discovery — 19 DE / 20 total
    { subdomain: 'erste-hausverwaltung-gmbh', tld: 'de' },  // Added via discovery — 19 DE / 36 total
    { subdomain: 'e-shelter-security', tld: 'de' },  // Added via discovery — 19 DE / 23 total
    { subdomain: 'go-express-logistics-gmbh', tld: 'de' },  // Added via discovery — 19 DE / 42 total
    { subdomain: 'thomassabo', tld: 'de' },  // Added via discovery — 19 DE / 44 total
    { subdomain: 'midea-europe-gmbh', tld: 'de' },  // Added via discovery — 19 DE / 22 total
    { subdomain: 'theod-mahr-soehne-gmbh', tld: 'de' },  // Added via discovery — 19 DE / 22 total
    { subdomain: 'q-ant-gmbh', tld: 'de' },  // Added via discovery — 19 DE / 19 total
    { subdomain: '360t', tld: 'de' },  // Added via discovery — 19 DE / 26 total
    { subdomain: 'christoph-dornier-klinik', tld: 'de' },  // Added via discovery — 18 DE / 18 total
    { subdomain: 'epi-use', tld: 'de' },  // Added via discovery — 18 DE / 24 total
    { subdomain: 'it-haus-gmbh', tld: 'de' },  // Added via discovery — 18 DE / 44 total
    { subdomain: 'marta', tld: 'de' },  // Added via discovery — 18 DE / 25 total
    { subdomain: 'schuermann', tld: 'de' },  // Added via discovery — 18 DE / 18 total
    { subdomain: 'velptec', tld: 'de' },  // Added via discovery — 18 DE / 18 total
    { subdomain: 'reflex-aerospace-gmbh', tld: 'de' },  // Added via discovery — 18 DE / 19 total
    { subdomain: 'exmox-gmbh', tld: 'de' },  // Added via discovery — 18 DE / 23 total
    { subdomain: 'rottler', tld: 'de' },  // Added via discovery — 18 DE / 185 total
    { subdomain: 'alexander-thamm-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 20 total
    { subdomain: 'center', tld: 'de' },  // Added via discovery — 17 DE / 24 total
    { subdomain: 'falk', tld: 'de' },  // Added via discovery — 17 DE / 18 total
    { subdomain: 'gross-und-partner', tld: 'de' },  // Added via discovery — 17 DE / 18 total
    { subdomain: 'gbc-gruppe', tld: 'de' },  // Added via discovery — 17 DE / 23 total
    { subdomain: 'europ-assistance-services-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 21 total
    { subdomain: 'infratec-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 17 total
    { subdomain: 'primestar-hospitality', tld: 'de' },  // Added via discovery — 17 DE / 21 total
    { subdomain: 'prinzing-elektrotechnik-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 44 total
    { subdomain: 'teamzukunft-ggmbh', tld: 'de' },  // Added via discovery — 17 DE / 38 total
    { subdomain: 'wentzel-dr-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 19 total
    { subdomain: 'tmsgmbh', tld: 'de' },  // Added via discovery — 17 DE / 90 total
    { subdomain: 'prematch-sports-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 17 total
    { subdomain: 'trusteq-gmbh', tld: 'de' },  // Added via discovery — 17 DE / 18 total
    { subdomain: 'globalct', tld: 'de' },  // Added via discovery — 16 DE / 16 total
    { subdomain: 'arverio', tld: 'de' },  // Added via discovery — 16 DE / 51 total
    { subdomain: 'kita-kinderzimmer', tld: 'de' },  // Added via discovery — 16 DE / 16 total
    { subdomain: 'pbvi', tld: 'de' },  // Added via discovery — 16 DE / 16 total
    { subdomain: 'bikeleasing', tld: 'de' },  // Added via discovery — 16 DE / 16 total
    { subdomain: 'byteclub', tld: 'de' },  // Added via discovery — 15 DE / 18 total
    { subdomain: 'clarius', tld: 'de' },  // Added via discovery — 15 DE / 16 total
    { subdomain: 'einhundert-energie-gmbh', tld: 'de' },  // Added via discovery — 15 DE / 15 total
    { subdomain: 'cafedelsol', tld: 'de' },  // Added via discovery — 15 DE / 125 total
    { subdomain: 'empira', tld: 'de' },  // Added via discovery — 15 DE / 18 total
    { subdomain: 'haevg-ag', tld: 'de' },  // Added via discovery — 15 DE / 17 total
    { subdomain: 'joblinge', tld: 'de' },  // Added via discovery — 15 DE / 20 total
    { subdomain: 'myra', tld: 'de' },  // Added via discovery — 15 DE / 15 total
    { subdomain: 'maybach-medical-group', tld: 'de' },  // Added via discovery — 15 DE / 51 total
    { subdomain: 'spotmyenergy', tld: 'de' },  // Added via discovery — 15 DE / 16 total
    { subdomain: 'hoffmann-eitle', tld: 'de' },  // Added via discovery — 15 DE / 15 total
    { subdomain: 'outdooractive', tld: 'de' },  // Added via discovery — 15 DE / 22 total
    { subdomain: 'penning-sanitaer-handel-gmbh-co-kg-1', tld: 'de' },  // Added via discovery — 15 DE / 15 total
    { subdomain: 'gomedicus-group-gmbh', tld: 'de' },  // Added via discovery — 15 DE / 19 total
    { subdomain: 'cycap', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'crc-clean-room-consulting-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 17 total
    { subdomain: 'dierck-gruppe', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'landmarken-ag', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'greenflash', tld: 'de' },  // Added via discovery — 14 DE / 16 total
    { subdomain: 'nimax-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'mway', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'paperandtea', tld: 'de' },  // Added via discovery — 14 DE / 15 total
    { subdomain: 'pjm', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'plusyou-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'sassyclassy', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'raith-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 18 total
    { subdomain: 'synaforce-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 22 total
    { subdomain: 'the-nu-company-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: 'saxoventwindpunx', tld: 'de' },  // Added via discovery — 14 DE / 17 total
    { subdomain: 'construktiv-gmbh', tld: 'de' },  // Added via discovery — 14 DE / 14 total
    { subdomain: '900grad-steuerberatung', tld: 'de' },  // Added via discovery — 13 DE / 19 total
    { subdomain: 'amiconsult', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'govtech', tld: 'de' },  // Added via discovery — 13 DE / 14 total
    { subdomain: 'effzeh', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'adorsys', tld: 'de' },  // Added via discovery — 13 DE / 17 total
    { subdomain: 'its-gruppe', tld: 'de' },  // Added via discovery — 13 DE / 43 total
    { subdomain: 'heinz-lackmann-gmbh-co-kg', tld: 'de' },  // Added via discovery — 13 DE / 18 total
    { subdomain: 'lebenshilfe-wolfsburg', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'munich-security-conference-1', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'bb-hotels-gmbh', tld: 'de' },  // Added via discovery — 13 DE / 27 total
    { subdomain: 'oxg', tld: 'de' },  // Added via discovery — 13 DE / 14 total
    { subdomain: 'conlab-solutions', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'profi-engineering-systems-ag', tld: 'de' },  // Added via discovery — 13 DE / 17 total
    { subdomain: 'towa', tld: 'de' },  // Added via discovery — 13 DE / 27 total
    { subdomain: 'zasta-gmbh', tld: 'de' },  // Added via discovery — 13 DE / 15 total
    { subdomain: 'reverion', tld: 'de' },  // Added via discovery — 13 DE / 24 total
    { subdomain: 'adbaker-gmbh', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'msg-industry-advisors-ag', tld: 'de' },  // Added via discovery — 13 DE / 13 total
    { subdomain: 'proteros-biostructures-gmbh', tld: 'de' },  // Added via discovery — 13 DE / 14 total
    { subdomain: 'armedangels', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'acconsis-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 13 total
    { subdomain: 'dr-kleeberg-partner-gmbh-wpg-stbg', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'baupal-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'aampere', tld: 'de' },  // Added via discovery — 12 DE / 13 total
    { subdomain: 'flex-capital-management-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 14 total
    { subdomain: 'haeger-consulting', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'hum-systems-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'heim-watt', tld: 'de' },  // Added via discovery — 12 DE / 17 total
    { subdomain: 'linkbroker', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'lemonaid-beverages-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 15 total
    { subdomain: 'drive-consulting', tld: 'de' },  // Added via discovery — 12 DE / 14 total
    { subdomain: 'ineratec-gmbh-1', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'karl-berrang-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 25 total
    { subdomain: 'maisenbacher-hort-partner-1', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'myty', tld: 'de' },  // Added via discovery — 12 DE / 20 total
    { subdomain: 'mynaric', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'semdor-pharma-group-gmbh', tld: 'de' },  // Added via discovery — 12 DE / 18 total
    { subdomain: 'tablemedia', tld: 'de' },  // Added via discovery — 12 DE / 13 total
    { subdomain: 'wayes-gmbh-co-kg', tld: 'de' },  // Added via discovery — 12 DE / 12 total
    { subdomain: 'vollcorner', tld: 'de' },  // Added via discovery — 12 DE / 15 total
    { subdomain: 'vielfaltmenue', tld: 'de' },  // Added via discovery — 12 DE / 58 total
    { subdomain: 'quantum-diamond', tld: 'de' },  // Added via discovery — 12 DE / 13 total
    { subdomain: '3pc', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'aktion-mensch', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'brandung', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'dbs', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'doctorflix', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'dr-schmidt-und-partner', tld: 'de' },  // Added via discovery — 11 DE / 13 total
    { subdomain: 'derichebourg', tld: 'de' },  // Added via discovery — 11 DE / 13 total
    { subdomain: 'hafen-und-hof', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'high-office-it-gmbh', tld: 'de' },  // Added via discovery — 11 DE / 19 total
    { subdomain: 'hbm', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'kalorimeta', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'fastlta', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'mediengruppe-bayern-gmbh', tld: 'de' },  // Added via discovery — 11 DE / 30 total
    { subdomain: 'indasys', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'nextwind', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'neoshare', tld: 'de' },  // Added via discovery — 11 DE / 15 total
    { subdomain: 'smartvillage', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'verivox', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'pair', tld: 'de' },  // Added via discovery — 11 DE / 12 total
    { subdomain: 'legartis', tld: 'de' },  // Added via discovery — 11 DE / 12 total
    { subdomain: 'teamvet-verbund', tld: 'de' },  // Added via discovery — 11 DE / 59 total
    { subdomain: 'weltenbauer-software-entwicklung-gmbh', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'wulf-objektbetreuung', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'peakpeak', tld: 'de' },  // Added via discovery — 11 DE / 23 total
    { subdomain: 'csz', tld: 'de' },  // Added via discovery — 11 DE / 11 total
    { subdomain: 'viehoff-gruppe', tld: 'de' },  // Added via discovery — 11 DE / 27 total
    { subdomain: 'nicos-ag', tld: 'de' },  // Added via discovery — 10 DE / 17 total
    { subdomain: 'aeyde', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'bbdo', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'autohaus-timmermanns', tld: 'de' },  // Added via discovery — 10 DE / 25 total
    { subdomain: 'closed', tld: 'de' },  // Added via discovery — 10 DE / 16 total
    { subdomain: 'cps-group', tld: 'de' },  // Added via discovery — 10 DE / 17 total
    { subdomain: 'dehogabw', tld: 'de' },  // Added via discovery — 10 DE / 14 total
    { subdomain: 'deinzer-weyland-gmbh', tld: 'de' },  // Added via discovery — 10 DE / 27 total
    { subdomain: 'ecotel', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'gesis', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'goodbytz', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'lavera', tld: 'de' },  // Added via discovery — 10 DE / 22 total
    { subdomain: 'm4c', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'metropol-immobiliengruppe', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'segmenta', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'snocks', tld: 'de' },  // Added via discovery — 10 DE / 12 total
    { subdomain: 'voltfang', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'mueller-merkle', tld: 'de' },  // Added via discovery — 10 DE / 10 total
    { subdomain: 'vollack', tld: 'de' },  // Added via discovery — 10 DE / 15 total
    { subdomain: 'liveeo-gmbh', tld: 'de' },  // Added via discovery — 10 DE / 17 total
    { subdomain: 'valuedesk', tld: 'de' },  // Added via discovery — 10 DE / 11 total
    { subdomain: 'wibau', tld: 'de' },  // Added via discovery — 10 DE / 18 total
    { subdomain: 'nunatak', tld: 'de' },  // Added via discovery — 10 DE / 13 total
    { subdomain: 'academediaeducation-gmbh', tld: 'de' },  // Added via discovery — 9 DE / 20 total
    { subdomain: 'adn', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'argo', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'asseco-solutions', tld: 'de' },  // Added via discovery — 9 DE / 11 total
    { subdomain: 'dfb', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'drachenreiter-ggmbh', tld: 'de' },  // Added via discovery — 9 DE / 12 total
    { subdomain: 'event-inc', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'german-airways', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'hasenkamp', tld: 'de' },  // Added via discovery — 9 DE / 13 total
    { subdomain: 'gpnz', tld: 'de' },  // Added via discovery — 9 DE / 41 total
    { subdomain: 'interaktiv-ggmbh', tld: 'de' },  // Added via discovery — 9 DE / 37 total
    { subdomain: 'kindersprachbruecke-jena-ev', tld: 'de' },  // Added via discovery — 9 DE / 11 total
    { subdomain: 'kvlgroup', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'charlesundcharlottegmbh', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'leonine', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'loxam-gmbh', tld: 'de' },  // Added via discovery — 9 DE / 23 total
    { subdomain: 'idealworks', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'ounda-gmbh', tld: 'de' },  // Added via discovery — 9 DE / 38 total
    { subdomain: 'mutabor', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'papkeconsulting', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'prenode', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'tertianum', tld: 'de' },  // Added via discovery — 9 DE / 12 total
    { subdomain: 'tecvia', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'scalefree', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'theaterbremen', tld: 'de' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'wefralife', tld: 'de' },  // Added via discovery — 9 DE / 16 total
    { subdomain: 'wks-technik', tld: 'de' },  // Added via discovery — 9 DE / 11 total
    { subdomain: 'dmrz', tld: 'com' },  // Added via discovery — 9 DE / 10 total
    { subdomain: 'skad', tld: 'com' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'ahead-gmbh', tld: 'com' },  // Added via discovery — 9 DE / 17 total
    { subdomain: 'ailylabs', tld: 'com' },  // Added via discovery — 9 DE / 32 total
    { subdomain: 'ucm', tld: 'com' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'veternicum-gmbh', tld: 'com' },  // Added via discovery — 9 DE / 25 total
    { subdomain: 'vmc-gmbh', tld: 'com' },  // Added via discovery — 9 DE / 9 total
    { subdomain: 'westbridge-group', tld: 'com' },  // Added via discovery — 9 DE / 11 total
    { subdomain: 'assentio', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'bik', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'appliedai', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'blueforte', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'blue-ocean-entertainment-ag', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'carvia-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'crowe-bpg', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'building-radar', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'dbwv', tld: 'de' },  // Added via discovery — 8 DE / 9 total
    { subdomain: 'dc-datacenter-group-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 18 total
    { subdomain: 'dgi', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'etribes-connect', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'flossbach-von-storch-ag', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'emil-group-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'enviria', tld: 'de' },  // Added via discovery — 8 DE / 9 total
    { subdomain: 'freicon', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'frtg', tld: 'de' },  // Added via discovery — 8 DE / 9 total
    { subdomain: 'exolaunch', tld: 'de' },  // Added via discovery — 8 DE / 9 total
    { subdomain: 'fuchs-eule', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'gpe', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'hhpberlin', tld: 'de' },  // Added via discovery — 8 DE / 11 total
    { subdomain: 'house-of-yas', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'imaxxam', tld: 'de' },  // Added via discovery — 8 DE / 15 total
    { subdomain: 'holidaycheck', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'insglueck', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'menio', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'metergrid', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'onventis', tld: 'de' },  // Added via discovery — 8 DE / 10 total
    { subdomain: 'nc-group', tld: 'de' },  // Added via discovery — 8 DE / 9 total
    { subdomain: 'reev', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'remazing-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'safetonet-family-store', tld: 'de' },  // Added via discovery — 8 DE / 17 total
    { subdomain: 'one-productivity', tld: 'de' },  // Added via discovery — 8 DE / 10 total
    { subdomain: 'pcs-systemtechnik-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'schickler', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'seitenbau-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 11 total
    { subdomain: 'sl-rasch-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'summitas', tld: 'de' },  // Added via discovery — 8 DE / 16 total
    { subdomain: 'spread-gmbh', tld: 'de' },  // Added via discovery — 8 DE / 8 total
    { subdomain: 'vitafy', tld: 'de' },  // Added via discovery — 8 DE / 10 total
    { subdomain: 'telluride', tld: 'de' },  // Added via discovery — 8 DE / 14 total
    { subdomain: 'stp-one', tld: 'de' },  // Added via discovery — 8 DE / 9 total
    { subdomain: 'chp-gruppe', tld: 'de' },  // Added via discovery — 8 DE / 23 total
    { subdomain: 'achtung', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'antoni', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'asz', tld: 'de' },  // Added via discovery — 7 DE / 13 total
    { subdomain: 'beratungscontor', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'bold-epic-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'buendnis-90die-gruenen', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'baramundi-software-ag', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'caigos-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 24 total
    { subdomain: 'chp', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'capmo', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'contentbird', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'cresco', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'dela-lebensversicherungen', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'dekom-ag', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'delta-sport-handelskontor-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'elona-health', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'docmedico', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'dlubal', tld: 'de' },  // Added via discovery — 7 DE / 11 total
    { subdomain: 'erhardt-unternehmensgruppe', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'flh', tld: 'de' },  // Added via discovery — 7 DE / 9 total
    { subdomain: 'eshop-guide', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'getquin', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'govradar', tld: 'de' },  // Added via discovery — 7 DE / 9 total
    { subdomain: 'fraser-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'healy-world-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'hemro', tld: 'de' },  // Added via discovery — 7 DE / 15 total
    { subdomain: 'icb-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'honeysales-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'imap-gmbh-1', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'kabs-service-logistik-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 19 total
    { subdomain: 'kmpro-muenchen-gmbh-co-kg-stbg', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'gridx', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'kopfsachen', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'leinemann-partner', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'lumenaza', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'meinauto-de', tld: 'de' },  // Added via discovery — 7 DE / 9 total
    { subdomain: 'oberender', tld: 'de' },  // Added via discovery — 7 DE / 12 total
    { subdomain: 'memodo-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 14 total
    { subdomain: 'ocumeda-ag', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'primedus', tld: 'de' },  // Added via discovery — 7 DE / 18 total
    { subdomain: 'prokuras', tld: 'de' },  // Added via discovery — 7 DE / 15 total
    { subdomain: 'puschwahlig-workplace-law', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'prologa-1', tld: 'de' },  // Added via discovery — 7 DE / 10 total
    { subdomain: 'quadriga', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'tesvolt-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 10 total
    { subdomain: 'platoon-aviation', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'tte-strategy', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'urano', tld: 'de' },  // Added via discovery — 7 DE / 25 total
    { subdomain: 'vgda', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'visable', tld: 'de' },  // Added via discovery — 7 DE / 10 total
    { subdomain: 'yes-investmedia-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'vicegolf', tld: 'de' },  // Added via discovery — 7 DE / 8 total
    { subdomain: 'claimini-gmbh', tld: 'de' },  // Added via discovery — 7 DE / 7 total
    { subdomain: 'collana', tld: 'de' },  // Added via discovery — 7 DE / 13 total
    { subdomain: 'aristo', tld: 'de' },  // Added via discovery — 6 DE / 10 total
    { subdomain: 'brokeberlin', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'cellumation', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'christundcompany', tld: 'de' },  // Added via discovery — 6 DE / 7 total
    { subdomain: 'damedic-gmbh', tld: 'de' },  // Added via discovery — 6 DE / 7 total
    { subdomain: 'entityx', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'ecoplanet-green-operations-gmbh', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'blaudirekt', tld: 'de' },  // Added via discovery — 6 DE / 20 total
    { subdomain: 'everbrent', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'esa-grimma', tld: 'de' },  // Added via discovery — 6 DE / 17 total
    { subdomain: 'hello-1', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'knk-gruppe', tld: 'de' },  // Added via discovery — 6 DE / 7 total
    { subdomain: 'lesora', tld: 'de' },  // Added via discovery — 6 DE / 7 total
    { subdomain: 'm3connect', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'magazino', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'mtg-ag', tld: 'de' },  // Added via discovery — 6 DE / 7 total
    { subdomain: 'neptune', tld: 'de' },  // Added via discovery — 6 DE / 12 total
    { subdomain: 'evidentiq', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'omikron', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'nobilis', tld: 'de' },  // Added via discovery — 6 DE / 8 total
    { subdomain: 'parasol', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'pahnke', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'planorg', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'procom-automation', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'saeger-cie-zinshaus-investments-gmbh', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'storymachine', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'tgm-kanzlei', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'rothenberger-gruppe', tld: 'de' },  // Added via discovery — 6 DE / 29 total
    { subdomain: 'usd-ag', tld: 'de' },  // Added via discovery — 6 DE / 7 total
    { subdomain: 'workist-gmbh', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'tradedoubler-en', tld: 'de' },  // Added via discovery — 6 DE / 10 total
    { subdomain: 'zarinfar-gmbh', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'aam2core-holding-ag', tld: 'de' },  // Added via discovery — 6 DE / 6 total
    { subdomain: 'vivid', tld: 'de' },  // Added via discovery — 6 DE / 24 total
    { subdomain: 'climate', tld: 'de' },  // Added via discovery — 6 DE / 8 total
    { subdomain: '21future', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'anqa-itsecurity-de', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'asgoodasnew-electronics-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'asb-berlin', tld: 'de' },  // Added via discovery — 5 DE / 15 total
    { subdomain: 'beb-immobilien-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'beilmann-marketing-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'biogeen', tld: 'de' },  // Added via discovery — 5 DE / 13 total
    { subdomain: 'bulex-rechtsanwaltsgesellschaft', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'cloudbridge-consulting-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'codeblick', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'condo-group', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'cureosity-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'cyber-wear', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'cyclize', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'deneff', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'dishdigital', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'echte-mamas-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'edb', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'emp-1', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'essentry', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'euprax', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'eqs-group', tld: 'de' },  // Added via discovery — 5 DE / 7 total
    { subdomain: 'efeso-management-consultants-dach', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'exccon', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'fairfood-freiburg', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'fcf-fox-corporate-finance-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'fincite-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'freiburger-stadtbau-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'getpress-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'fischbach-gruppe', tld: 'de' },  // Added via discovery — 5 DE / 95 total
    { subdomain: 'innolizer-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'framos', tld: 'de' },  // Added via discovery — 5 DE / 10 total
    { subdomain: 'holoplot', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'johner-institut-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'ionity-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 14 total
    { subdomain: 'kumi-health-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'lime-tech', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'memox-deutschland-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'lionment-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'mev', tld: 'de' },  // Added via discovery — 5 DE / 11 total
    { subdomain: 'michl-gruppe', tld: 'de' },  // Added via discovery — 5 DE / 18 total
    { subdomain: 'kuhn-und-partner-ingenieure', tld: 'de' },  // Added via discovery — 5 DE / 35 total
    { subdomain: 'muellerschupfner', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'netzlink', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'nfon', tld: 'de' },  // Added via discovery — 5 DE / 8 total
    { subdomain: 'noyes-robotics-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'omos-media-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'pixum', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'rausgegangen', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'ryl', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'schluetersche-mediengruppe', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'skytanking', tld: 'de' },  // Added via discovery — 5 DE / 7 total
    { subdomain: 'semron', tld: 'de' },  // Added via discovery — 5 DE / 10 total
    { subdomain: 'security-research-labs', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'smf-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'social-dna', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'spiegel-institut', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'stan-studios-gmbh-co-kg', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'synsero', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'talentrocket', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'tegosgroup', tld: 'de' },  // Added via discovery — 5 DE / 6 total
    { subdomain: 'tempelhof-projekt-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'theion-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'tli-stbg-dobner-gmbh-co-kg', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'undconsorten', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'vision-reality', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'wibatax', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'wecreate-germany-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'worksimple', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'y1-digital-ag', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'viastore-group', tld: 'de' },  // Added via discovery — 5 DE / 12 total
    { subdomain: 'yfoodlabs', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'zenveo', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'aimconsulting', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'allgeier-inovar-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 5 total
    { subdomain: 'cylib-gmbh', tld: 'de' },  // Added via discovery — 5 DE / 7 total
    { subdomain: 'afilio', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'adragos-pharma', tld: 'de' },  // Added via discovery — 4 DE / 12 total
    { subdomain: 'ambihome-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'albrings-mueller-ag', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'amaranth-advisory-1', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'anhalt', tld: 'de' },  // Added via discovery — 4 DE / 9 total
    { subdomain: 'basecamp', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'brbappel-partner', tld: 'de' },  // Added via discovery — 4 DE / 12 total
    { subdomain: 'bridgemaker-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'caelo', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'calm-tageskliniken-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'buchner-partner-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'cansativa', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'carfax-europe-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'ccf', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'checktur-io-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'civey-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'continum', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'dachs-it', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'consileon', tld: 'de' },  // Added via discovery — 4 DE / 42 total
    { subdomain: 'denkwerk-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'digital-manufaktur-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'digetiers-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 7 total
    { subdomain: 'earnesto', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'ea-holding', tld: 'de' },  // Added via discovery — 4 DE / 50 total
    { subdomain: 'e-lyte', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'eeden', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'emeram-capital-partners-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'emma-noah-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'energy-software-holding-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 8 total
    { subdomain: 'falling-walls', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'gauly-advisors', tld: 'de' },  // Added via discovery — 4 DE / 6 total
    { subdomain: 'faqhealth', tld: 'de' },  // Added via discovery — 4 DE / 5 total
    { subdomain: 'exeltis', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'gokarla-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'habona-invest-gmbh-1', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'giga-green', tld: 'de' },  // Added via discovery — 4 DE / 9 total
    { subdomain: 'hagos-eg', tld: 'de' },  // Added via discovery — 4 DE / 10 total
    { subdomain: 'hanseatickids', tld: 'de' },  // Added via discovery — 4 DE / 6 total
    { subdomain: 'good-hood-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'hck', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'heinekingmedia', tld: 'de' },  // Added via discovery — 4 DE / 6 total
    { subdomain: 'iot-venture-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'hubject-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'intumind', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'jochen-schweizer-gruppe', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'krammer', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'koppla', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'liquida-inkasso-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 7 total
    { subdomain: 'martin-et-karczinski-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'lytra', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'mehrsalz', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'jcb-deutschland-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 13 total
    { subdomain: 'light-art-space-ggmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'mum', tld: 'de' },  // Added via discovery — 4 DE / 11 total
    { subdomain: 'natsana', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'node-energy', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'mlgruppe', tld: 'de' },  // Added via discovery — 4 DE / 15 total
    { subdomain: 'nova-smile', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'passion4business', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'oceanoutdoorde', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'penzilla-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'pawlik', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'predium', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'quintas', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'planetafoods', tld: 'de' },  // Added via discovery — 4 DE / 6 total
    { subdomain: 'rooflineai-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'roman-klis-design-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 6 total
    { subdomain: 'schiffmann', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'pick-pack-24-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'schmittgall', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'sll-automotive-group', tld: 'de' },  // Added via discovery — 4 DE / 8 total
    { subdomain: 'smight-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'siegwerk-ventures', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'soley-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'suedwestmetall', tld: 'de' },  // Added via discovery — 4 DE / 7 total
    { subdomain: 'sontowski-partner-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'stilfaser-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'sustentio', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'svg-sued', tld: 'de' },  // Added via discovery — 4 DE / 6 total
    { subdomain: 'terra-infrastructure', tld: 'de' },  // Added via discovery — 4 DE / 12 total
    { subdomain: 'travelcircus', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'timeless-investments', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'truckoo-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'vindelici', tld: 'de' },  // Added via discovery — 4 DE / 16 total
    { subdomain: 'vsquadrat', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'vivimari', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'zausinger', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'zbf', tld: 'de' },  // Added via discovery — 4 DE / 17 total
    { subdomain: 'vmray-gmbh', tld: 'de' },  // Added via discovery — 4 DE / 8 total
    { subdomain: 'codex-partners', tld: 'de' },  // Added via discovery — 4 DE / 4 total
    { subdomain: 'dibberggmbh', tld: 'de' },  // Added via discovery — 4 DE / 25 total
    { subdomain: '21dx-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 19 total
    { subdomain: '3st-kommunikation', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'albert-schweitzer-stiftung', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'aliceandbob', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'amplimind', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'asset-one', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'amberra', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'ausbildung-de', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'auretas', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'auvaria', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'bbc-studios-germany-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'avenit-ag', tld: 'de' },  // Added via discovery — 3 DE / 10 total
    { subdomain: 'becken-holding-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'bfv', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'bookit', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'cfl-cargo-deutschland-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 8 total
    { subdomain: 'climedo', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'consolinno', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'codecampn', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'correctiv', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'coppen', tld: 'de' },  // Added via discovery — 3 DE / 14 total
    { subdomain: 'damm-bierbaum-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'dh-mechatronic-ag', tld: 'de' },  // Added via discovery — 3 DE / 10 total
    { subdomain: 'd-o-b-landtechnik-ag', tld: 'de' },  // Added via discovery — 3 DE / 46 total
    { subdomain: 'deepdrive-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 7 total
    { subdomain: 'cycle', tld: 'de' },  // Added via discovery — 3 DE / 13 total
    { subdomain: 'credium', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'dreicad-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'edurino', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'e-ca', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'emondo-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'evolutiq-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'europcell', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'faaren', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'foxinsights', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'franzrosa', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'fides-technology-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'fit-reisen', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'getec-energie-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'glassdollar', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'goreha', tld: 'de' },  // Added via discovery — 3 DE / 6 total
    { subdomain: 'grub-brugger', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'gridfuse', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'friedrich-zufall-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 100 total
    { subdomain: 'gruenerpunkt', tld: 'de' },  // Added via discovery — 3 DE / 13 total
    { subdomain: 'haendlerbund-management-ag', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'goodlife', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'hep-global-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'h2fly-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'htgf', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'hako-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 34 total
    { subdomain: 'huk-autowelt', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'huemmer', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'holidaypirates', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'ihk-suedlicher-oberrhein', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'iamip', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'iits', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'immojects', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'invest4kids', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'ip-cs', tld: 'de' },  // Added via discovery — 3 DE / 7 total
    { subdomain: 'it-p', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'jamestown', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'june', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'jom-group', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'kai-otto-architekten-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'kern-microtechnik', tld: 'de' },  // Added via discovery — 3 DE / 24 total
    { subdomain: 'kinderwunsch', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'kms-team-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'k-juergensen', tld: 'de' },  // Added via discovery — 3 DE / 11 total
    { subdomain: 'kraftling', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'leibniz-hki', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'kugu', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'meltingelements', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'meteoviva-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'michael-wessel', tld: 'de' },  // Added via discovery — 3 DE / 6 total
    { subdomain: 'mobiko', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'ml-ag', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'moebel-de', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'niboline-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'mrge-group-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'neonex', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'nihon-kohden-europe-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'nvbw-mbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'nitrado', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'olando-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'onpier', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'nuvotex', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'papair-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'optimax-energy-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'pava-partners', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'pharma4u', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'peoplex', tld: 'de' },  // Added via discovery — 3 DE / 6 total
    { subdomain: 'pmone', tld: 'de' },  // Added via discovery — 3 DE / 7 total
    { subdomain: 'plantura', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'pomelo-co', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'polarstern-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'portagon', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'positec-germany-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 11 total
    { subdomain: 'ppi-media-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'processand', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'recup', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'protekto-gruppe-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'realeyes', tld: 'de' },  // Added via discovery — 3 DE / 15 total
    { subdomain: 'rocksmedia', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'rapid-data', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'saltrock', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'schmidhuber', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'schletter-solar-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 7 total
    { subdomain: 'schoeffel', tld: 'de' },  // Added via discovery — 3 DE / 11 total
    { subdomain: 'schoene-neue-kinder', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'schryver', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'sda-software-defined-automation-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'sensorberg', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'selfbits', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'sigo', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'simplifa', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'slash-digital', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'stelp', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'stapelstein', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'strategis-ag', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'strenger-gruppe', tld: 'de' },  // Added via discovery — 3 DE / 12 total
    { subdomain: 'sunovis-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 5 total
    { subdomain: 'sportec-solutions', tld: 'de' },  // Added via discovery — 3 DE / 14 total
    { subdomain: 'systema-datentechnik', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'tantive', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'supercode-gmbh-co-kg', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'tandler', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'taskom', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'telecomputer-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'tbinternational', tld: 'de' },  // Added via discovery — 3 DE / 8 total
    { subdomain: 'techquartier', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'thjnkag', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'thomas-henry-gmbh-co-kg', tld: 'de' },  // Added via discovery — 3 DE / 7 total
    { subdomain: 'tngtech', tld: 'de' },  // Added via discovery — 3 DE / 15 total
    { subdomain: 'temedica', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'tri-train-rental-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'verbaneum', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'voraus', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'vsti', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'webgo-gmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'agora-thinktanks', tld: 'de' },  // Added via discovery — 3 DE / 4 total
    { subdomain: 'ymesg', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'algol-consulting', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'claneo', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'cloud-astro', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'alqemgmbh', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'contentpass', tld: 'de' },  // Added via discovery — 3 DE / 3 total
    { subdomain: 'dhme', tld: 'de' },  // Added via discovery — 3 DE / 34 total
    { subdomain: 'ab-ct-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'acker', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'accscale', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'agnosconet', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'agora-transport-transformation-ggmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'ambrosys', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'akademisches-bildungs-center', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'anna-schmidt-schule', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'apc-ag', tld: 'de' },  // Added via discovery — 2 DE / 5 total
    { subdomain: 'antares-consulting-1', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'apploft', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'art-tempi', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'atd-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'arx', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'baden-wuerttemberg-international', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'avega', tld: 'de' },  // Added via discovery — 2 DE / 16 total
    { subdomain: 'be-shaping-the-future', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'betterdoc', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'becker-kries', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'bioweg', tld: 'de' },  // Added via discovery — 2 DE / 7 total
    { subdomain: 'boards-more-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 6 total
    { subdomain: 'breuer-nachrichtentechnik-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'bornholdt-lee-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'brumaire', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'bauhauserde', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'battleroyalstudios', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'brighter-ai', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'business-by-nature-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 9 total
    { subdomain: 'caphenia', tld: 'de' },  // Added via discovery — 2 DE / 8 total
    { subdomain: 'chargecloud-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'christburg-campus-ggmbh', tld: 'de' },  // Added via discovery — 2 DE / 10 total
    { subdomain: 'complero-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'connox', tld: 'de' },  // Added via discovery — 2 DE / 10 total
    { subdomain: 'convini-deutschland-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'crolla-lowis', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'credion-ag', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'crowdfox-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'cs-gp', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'cybus-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'ctrl-qs', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'cyqueo-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 5 total
    { subdomain: 'deutsche-giganetz', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'dembach-goo-informatik-gmbh-co-kg', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'dieproduktmacher', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'ecovery-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'digital-cuisine', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'db-rechtsanwaelte-mbb', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'dammannworks', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'duh-group-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'ecpmf-sce-mbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'elbkapitaene', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'eleganz', tld: 'de' },  // Added via discovery — 2 DE / 11 total
    { subdomain: 'ehret-klein-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 12 total
    { subdomain: 'eurocres-consulting-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'euv-wohnen-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 16 total
    { subdomain: 'evanium-healthcare', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'factory42', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'europa-center-ag', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'filics', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'findiq-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'ew-nutrition', tld: 'de' },  // Added via discovery — 2 DE / 13 total
    { subdomain: 'flow', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'fleishmanhillard', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'framen-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'fulfin', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'geodata-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 24 total
    { subdomain: 'financialcom', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'gestalten', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'gmk-markenberatung', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'gwp', tld: 'de' },  // Added via discovery — 2 DE / 5 total
    { subdomain: 'giata', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'haefft', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'hateaid', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'hoffnungstraeger-stiftung', tld: 'de' },  // Added via discovery — 2 DE / 15 total
    { subdomain: 'her1', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'horl-1993', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'fritz-wahr-energie-gmbh-co-kg-1', tld: 'de' },  // Added via discovery — 2 DE / 10 total
    { subdomain: 'ianus-simulation-gmbh-1', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'hsm', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'ic-berlin-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'internations', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'intuity', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'island-collective', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'kirberg', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'itonics-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'kiwi', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'knsk', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'koehler-group-stuttgart-fahrrad-de', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'kvrn', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'kochan', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'kloeckner-i-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'lightguard-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'lindemann', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'lawpilots', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'living-concept-werbeagentur-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'luis-technology', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'lumaserv', tld: 'de' },  // Added via discovery — 2 DE / 7 total
    { subdomain: 'manitz-finsterwald', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'markgraph', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'makeitfix', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'mbgglobal', tld: 'de' },  // Added via discovery — 2 DE / 21 total
    { subdomain: 'meinunterricht', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'metoda-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'merz-b-schwanen', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'markus-engel-holding-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 4 total
    { subdomain: 'mlc-direct', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'metro-markets-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'muli-cycles-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'metzen', tld: 'de' },  // Added via discovery — 2 DE / 36 total
    { subdomain: 'mybacs-vertriebs-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'neuhaus-consulting-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'muuuh-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 12 total
    { subdomain: 'nordantech', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'nibe-systemtechnik-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 14 total
    { subdomain: 'oneconcepts', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'paedquis-stiftung', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'partscloud', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'pixel-photonics-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'now-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'praxis-dr-beer', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'pixolith', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'primecapital-ag', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'proveg', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'reos', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'pacemaker', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'radiohoreb', tld: 'de' },  // Added via discovery — 2 DE / 11 total
    { subdomain: 'restlos', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'roast-market-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'rtc-rath-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 5 total
    { subdomain: 'rft-kabel-brandenburg-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 17 total
    { subdomain: 'saxess', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'rwth-international-academy', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'scale-energy-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'script-communications', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sawoo-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 20 total
    { subdomain: 'shirtracer', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sfgroup', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sidekickhealth', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'silpion', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'simplesystem', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'somengo-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sinus-bfk', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'spirit21-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 28 total
    { subdomain: 'sportlaedchen', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sportspass', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'stimulus-consulting', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sts-evistra', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sykell-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'sterzenbach-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'synaos-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'tanktank-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'tamara-comolli-fine-jewelry', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'thebase-fol-group-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 3 total
    { subdomain: 'teveo-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 11 total
    { subdomain: 'the-marmalade', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'threedy-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'titan-wind-energy-germany', tld: 'de' },  // Added via discovery — 2 DE / 7 total
    { subdomain: 'troi', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'truemotion', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'tuev-ai-lab', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'vitagroup', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'ueberseeinsel-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'u2d', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'vyoma-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'vysion-consulting-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 9 total
    { subdomain: 'vytal', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'wavesix', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'zg-zentrum-gesundheit-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 24 total
    { subdomain: 'acto', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'urbanheroes', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'aevoloop', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'allea-consult', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: '1nce', tld: 'de' },  // Added via discovery — 2 DE / 11 total
    { subdomain: 'allocnow', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'anvajo', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'comx', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'crate-io', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'daphos', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'deepspin-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'cuculus-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 7 total
    { subdomain: 'deromein-gmbh', tld: 'de' },  // Added via discovery — 2 DE / 15 total
    { subdomain: 'deskbird', tld: 'de' },  // Added via discovery — 2 DE / 5 total
    { subdomain: 'devanthro', tld: 'de' },  // Added via discovery — 2 DE / 2 total
    { subdomain: 'desotec', tld: 'de' },  // Added via discovery — 2 DE / 29 total
    { subdomain: 'accantec-group', tld: 'de' },  // Added via discovery — 1 DE / 5 total
    { subdomain: 'about-source-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'accure', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'actori-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'admi', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'admkrs-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'ambratec-group', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'bam-interactive', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'beyondfossilfuels', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'bilden-tagen-bistum-mainz-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'bitfactory', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'biz2byte-service-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'apheris', tld: 'de' },  // Added via discovery — 1 DE / 10 total
    { subdomain: 'auvesy-mdt-holding-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 14 total
    { subdomain: 'bluu-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'bib', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'brawoge', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'blue-tree-group-investment-banking', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'bsakademie', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'brera', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'btc-echo-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'care-deutschland-e-v', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cactus', tld: 'de' },  // Added via discovery — 1 DE / 20 total
    { subdomain: 'bullfinch', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'captiq-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'buhl-data-service-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 10 total
    { subdomain: 'carlnann', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'carl', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cdq-ag', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'cevotec', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'codered', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'channel-pilot-solutions-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cofinity-x-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'c-beuthel-gmbh-co-kg', tld: 'de' },  // Added via discovery — 1 DE / 13 total
    { subdomain: 'combridge-it-consulting-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'consist', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'competition-company-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'contracthero-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cormes-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'daa', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'dayone', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'democracy-reporting', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'deepup', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'dje-kapital-ag', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'dubag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'eagle-lsp', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'eddyson', tld: 'de' },  // Added via discovery — 1 DE / 10 total
    { subdomain: 'ediundsepp', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'education-partners', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'dtcf', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'eigenherd-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'e-mobil-bw-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'energiequelle-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'en-software', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'enyring', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'europeanexchange', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'exactag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'excelsea-gmbh-co-kg', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'examion-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 6 total
    { subdomain: 'fiantec', tld: 'de' },  // Added via discovery — 1 DE / 5 total
    { subdomain: 'f-h-bertling', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'finexity-ag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'finlex', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'formitas', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'formmed-1', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'franka-robotics', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'fuersattel', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'geno-kom', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'genericde', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'germania-steuerberatungsgesellschaft', tld: 'de' },  // Added via discovery — 1 DE / 12 total
    { subdomain: 'greven-twt-gruppe', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'groundies', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'hahnair', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'haspa-next', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'hawar-help', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'hausgold', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'hdt', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'hoft-berlin', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'hn-gruppe', tld: 'de' },  // Added via discovery — 1 DE / 8 total
    { subdomain: 'highq', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'i22', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'humanizing', tld: 'de' },  // Added via discovery — 1 DE / 5 total
    { subdomain: 'hypatos-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'hseq', tld: 'de' },  // Added via discovery — 1 DE / 6 total
    { subdomain: 'icongroup-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'ifixit', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'igaming', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'ihk-essen', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'ihk-akademie-suedlicher-oberrhein', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'imusician-digital', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'impericon', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'interrogare-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'intrexx', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'intrafind-software-ag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'itemis', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'iterra-energy-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'k16-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'jodel', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'kms-mobility-solutions-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'kfzinnungschwaben', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'kniff', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'kunst-werke-berlin', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'komm-passion', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'laemmerzahl-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'ld7', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'lazars', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'lumibit', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'magrathea', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'medelde', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'mannl-hauck', tld: 'de' },  // Added via discovery — 1 DE / 14 total
    { subdomain: 'medigo', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'mediserv-bank-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 10 total
    { subdomain: 'mec-group', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'mediaire', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'liz-smart-office-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'mellowmessage', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'mice-portal-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'millerundmeier', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'mobimeo', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'msr-family-office', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'ncs-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'neofonie-gmbh-1', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'micronova', tld: 'de' },  // Added via discovery — 1 DE / 7 total
    { subdomain: 'n4-4pace', tld: 'de' },  // Added via discovery — 1 DE / 7 total
    { subdomain: 'obremba-partner', tld: 'de' },  // Added via discovery — 1 DE / 7 total
    { subdomain: 'opisto-gruppe', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'nordic', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'orfo', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'palettecad', tld: 'de' },  // Added via discovery — 1 DE / 8 total
    { subdomain: 'orthopaedie-technik-kaechele-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'mailo-ag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'pec-project-engineers-consultants-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'pflege-de', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'periti-digital-ltd', tld: 'de' },  // Added via discovery — 1 DE / 4 total
    { subdomain: 'personalfactory', tld: 'de' },  // Added via discovery — 1 DE / 8 total
    { subdomain: 'lavita-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 10 total
    { subdomain: 'plooniversum', tld: 'de' },  // Added via discovery — 1 DE / 6 total
    { subdomain: 'phineo', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'procedo-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'projecttogether-ggmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'prinzsportlich', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'lhr', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'quinoa-bildung-ggmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'proteindistillery', tld: 'de' },  // Added via discovery — 1 DE / 8 total
    { subdomain: 'quantilope-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'publicplan', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'regis24-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'remira', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'ptg', tld: 'de' },  // Added via discovery — 1 DE / 12 total
    { subdomain: 'repareo', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'reverse-retail', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'ryze-digital', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'savi', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'schoepflin-stiftung', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'seek-development', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'sgh', tld: 'de' },  // Added via discovery — 1 DE / 3 total
    { subdomain: 'sizekick', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'service4evu', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'salestechgroup', tld: 'de' },  // Added via discovery — 1 DE / 5 total
    { subdomain: 'socialnatives', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'social-bee-ggmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'soveo-steuerberatungsgesellschaft-mbb', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'sogedes', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'schwer-fittings-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 38 total
    { subdomain: 'stenon-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'stock3-ag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'stratosphere-games', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'sug-group', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'taw', tld: 'de' },  // Added via discovery — 1 DE / 13 total
    { subdomain: 'suitepad', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'tam', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'tenics', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'tuerantuer', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'tideways', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'tiki', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'univention', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'tegtmeier', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'uptodate-ventures-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'value-for-good', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'vanham', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'vanovate-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 5 total
    { subdomain: 'vdw-rheinland-westfalen-ev', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'vereinigung-cockpit', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'virtual-solution-ag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'vivaequality', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'wapp', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'waveit-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'vertwo-advisory', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'wertemuseum', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'visiconsult-x-ray-systems-solutions-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 44 total
    { subdomain: 'wps-workplace-solutions', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'wund', tld: 'de' },  // Added via discovery — 1 DE / 31 total
    { subdomain: 'wew', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'zeichen-wunder', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'zal', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'aeceurope', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'zoologisch', tld: 'de' },  // Added via discovery — 1 DE / 8 total
    { subdomain: '3c-deutschland', tld: 'de' },  // Added via discovery — 1 DE / 2 total
    { subdomain: 'agentur-medienlabor', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'clyso-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cosphatec', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cyber-valley-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'cusp-capital-partners-gmbh', tld: 'de' },  // Added via discovery — 1 DE / 1 total
    { subdomain: 'digitalerhubregionbonnag', tld: 'de' },  // Added via discovery — 1 DE / 1 total
],

    // Internal state
    _allJobsQueue: [],
    _initialized: false,

    // ─── Fetch one company's XML feed → Germany-filtered jobs only ────────
    // Extracted from the initialize() loop so the raw XML text + full parse
    // (all positions, with descriptions) go out of scope per company and can
    // be garbage-collected instead of accumulating for the whole loop.
    // Returns null on failure so the caller can count failures.
    async _fetchCompany(target, stateMap) {
        const { subdomain, tld } = target;
        const url = `https://${subdomain}.jobs.personio.${tld}/xml?language=en`;
        const prev = stateMap.get(stateKey('personio', subdomain));

        try {
            const headers = { 'Accept': 'application/xml,text/xml' };
            if (prev?.etag) headers['If-None-Match'] = prev.etag;
            const response = await fetch(url, { headers });

            if (response.status === 304) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: subdomain, etag: prev.etag, contentHash: prev.contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            if (!response.ok) {
                console.log(`[Personio] ❌ ${subdomain}: HTTP ${response.status}`);
                return null;
            }

            const xmlText = await response.text();
            const etag = response.headers.get('etag') || null;
            const parsed = xmlParser.parse(xmlText);
            const positions = parsed?.['workzag-jobs']?.position || [];

            if (positions.length === 0) {
                return {
                    unchanged: false, jobs: [],
                    state: { slug: subdomain, etag, contentHash: computeContentHash([]), jobCount: 0, changed: !prev },
                };
            }

            // id|name|offices fingerprint — descriptions excluded on purpose.
            const contentHash = computeContentHash(
                positions.map(job => `${job.id}|${job.name || ''}|${this.collectAllOffices(job).join(',')}`),
            );
            if (prev && prev.contentHash === contentHash) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: subdomain, etag, contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            // Filter to Germany jobs only — checks office + additionalOffices
            const germanyJobs = positions
                .filter(job => this.isGermanyJob(job))
                .map(job => ({
                    ...job,
                    _subdomain: subdomain,
                    _tld: tld,
                }));

            if (germanyJobs.length > 0) {
                console.log(`[Personio] ✅ ${subdomain}: ${germanyJobs.length} jobs in Germany (${positions.length} total)`);
            }

            // Be polite — 500ms between companies
            await new Promise(resolve => setTimeout(resolve, 500));
            return {
                unchanged: false, jobs: germanyJobs,
                state: { slug: subdomain, etag, contentHash, jobCount: germanyJobs.length, changed: true },
            };
        } catch (error) {
            console.error(`[Personio] ❌ ${subdomain}: ${error.message}`);
            return null;
        }
    },

    // ─── Initialize: fetch all XML feeds upfront (streamed per company) ───
    async initialize() {
        if (this._initialized) return;

        console.log(`[Personio] Fetching jobs from ${this.companyTargets.length} companies...`);

        const stateMap = await loadScrapeStates('personio');
        const pendingStates = [];
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const target of this.companyTargets) {
            const result = await this._fetchCompany(target, stateMap);
            if (result === null) { failCount++; continue; }
            pendingStates.push(result.state);
            if (result.unchanged) { skippedCount++; continue; }
            if (result.jobs.length > 0) {
                this._allJobsQueue.push(...result.jobs);
                successCount++;
            }
        }

        await saveScrapeStatesBulk('personio', pendingStates);
        console.log(`[Personio] 📊 Summary: ${successCount} companies with Germany jobs, ${skippedCount} unchanged (skipped), ${failCount} failed`);
        console.log(`[Personio] 💼 Total jobs found: ${this._allJobsQueue.length}`);
        this._initialized = true;
    },

    // ─── Required by scraperEngine ────────────────────────────────────────
    async fetchPage(offset, limit) {
        if (!this._initialized) await this.initialize();
        const jobs = this._allJobsQueue.slice(offset, offset + limit);
        return { jobs, total: this._allJobsQueue.length };
    },

    getJobs(data) { return data.jobs || []; },
    getTotal(data) { return data.total || 0; },

    // ─── Germany detection ────────────────────────────────────────────────
    // Checks primary office + every additionalOffices entry.
    isGermanyJob(job) {
        const offices = this.collectAllOffices(job);
        return offices.some(loc => isGermanyString(loc));
    },

    isGermanyLocation(location) {
        return isGermanyString(location);
    },

    // ─── Helpers ──────────────────────────────────────────────────────────
    collectAllOffices(job) {
        const offices = [];
        if (job.office) offices.push(job.office);
        const extras = job.additionalOffices?.office;
        if (Array.isArray(extras)) {
            offices.push(...extras);
        } else if (typeof extras === 'string' && extras) {
            offices.push(extras);
        }
        return offices;
    },

    // ─── Field extractors ─────────────────────────────────────────────────
    extractJobID(job) {
        return `personio_${job._subdomain}_${job.id}`;
    },

    extractJobTitle(job) {
        return job.name || '';
    },

    extractCompany(job) {
        // Prefer subcompany if present (the legal entity Personio shows)
        if (job.subcompany) return job.subcompany;
        // Fallback: format the subdomain into a readable name
        return String(job._subdomain || '')
            .split(/[-_]/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    },

    extractLocation(job) {
        return job.office || 'Germany';
    },

    extractAllLocations(job) {
        return normalizeArray(this.collectAllOffices(job));
    },

    extractCountry(job) {
        // Personio offices are city-only ("Berlin", not "Berlin, Germany").
        // Use isGermanyString helper which knows German city names.
        const offices = this.collectAllOffices(job);
        if (offices.some(loc => isGermanyString(loc))) return 'DE';
        return null;
    },

    extractDescription(job) {
        return assembleDescription(job.jobDescriptions, false);
    },

    extractDescriptionHtml(job) {
        return SanitizeHtml(assembleDescription(job.jobDescriptions, true));
    },

    extractURL(job) {
        // Personio doesn't ship a direct URL in the feed. Construct it from
        // {subdomain}.jobs.personio.{tld}/job/{id}?language=en.
        return `https://${job._subdomain}.jobs.personio.${job._tld}/job/${job.id}?language=en`;
    },

    extractDirectApplyURL(job) {
        // Same URL — Personio's job page IS the apply page (in-page form).
        return `https://${job._subdomain}.jobs.personio.${job._tld}/job/${job.id}?language=en`;
    },

    extractPostedDate(job) {
        return job.createdAt || null;
    },

    extractDepartment(job) {
        return job.department || job.recruitingCategory || 'N/A';
    },

    extractTeam(job) {
        return job.department || null;
    },

    extractOffice(job) {
        return job.office || null;
    },

    extractEmploymentType(job) {
        return normalizeEmploymentType(job.employmentType);
    },

    extractContractType(job) {
        const sched = String(job.schedule || '').toLowerCase();
        return SCHEDULE_MAP[sched] || job.schedule || null;
    },

    extractWorkplaceType(job) {
        // Office string sometimes contains "Remote Berlin" — infer from there.
        const offices = this.collectAllOffices(job).join(' ').toLowerCase();
        if (offices.includes('remote')) return 'Remote';
        if (offices.includes('hybrid')) return 'Hybrid';
        return normalizeWorkplaceType('Unspecified');
    },

    extractIsRemote(job) {
        const offices = this.collectAllOffices(job).join(' ').toLowerCase();
        return offices.includes('remote');
    },

    extractExperienceLevel(job) {
        const sen = String(job.seniority || '').toLowerCase();
        return SENIORITY_MAP[sen] || 'N/A';
    },

    extractTags(job) {
        if (!job.keywords) return [];
        return normalizeArray(
            String(job.keywords).split(',').map(t => t.trim()).filter(Boolean)
        );
    },

    // ─── Salary (Personio gives this directly, no text parsing needed!) ──
    extractSalaryMin(job) {
        const raw = job.salaryInformation?.min;
        const num = Number(raw);
        return Number.isFinite(num) && num > 0 ? num : null;
    },

    extractSalaryMax(job) {
        const raw = job.salaryInformation?.max;
        const num = Number(raw);
        return Number.isFinite(num) && num > 0 ? num : null;
    },

    extractSalaryCurrency(job) {
        return job.salaryInformation?.currencyCode || null;
    },

    extractSalaryInterval(job) {
        const type = String(job.salaryInformation?.type || '').toLowerCase();
        if (type === 'yearly')  return 'per-year-salary';
        if (type === 'monthly') return 'per-month-salary';
        if (type === 'hourly')  return 'per-hour-wage';
        return null;
    },

    // ─── Personio-specific extras (NEW fields on the job document) ────────
    extractYearsOfExperience(job) {
        return job.yearsOfExperience || null;
    },

    extractOccupation(job) {
        return job.occupation || null;
    },

    extractOccupationCategory(job) {
        return job.occupationCategory || null;
    },

    extractRecruitingCategory(job) {
        return job.recruitingCategory || null;
    },

    extractATSPlatform() {
        return 'personio';
    },
};
