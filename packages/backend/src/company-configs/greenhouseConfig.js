import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { GERMAN_CITIES, isGermanyString, normalizeWorkplaceType, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';


function metadataToObject(metadata) {
    if (!metadata) return {};
    if (Array.isArray(metadata)) {
        const result = {};
        for (const item of metadata) {
            if (!item?.name) continue;
            result[item.name] = item.value;
        }
        return result;
    }
    if (typeof metadata === 'object') return metadata;
    return {};
}

function findMetadataValue(metadataObj, keywords = []) {
    const entries = Object.entries(metadataObj || {});
    for (const [key, value] of entries) {
        const lowered = key.toLowerCase();
        if (keywords.some(keyword => lowered.includes(keyword))) {
            return value;
        }
    }
    return null;
}

function parseSalaryFromText(text) {
    if (!text) return {};
    const cleaned = StripHtml(text).replace(/\./g, '').replace(/,/g, '.');

    const currencyMatch = cleaned.match(/(USD|EUR|GBP|CHF|CAD|AUD|JPY|SEK|NOK|DKK|PLN)/i);
    const symbolMatch = cleaned.match(/[�$�]/);
    const rangeMatch = cleaned.match(/(\d{2,7}(?:\.\d+)?)\s*(?:-|�|�|to)\s*(\d{2,7}(?:\.\d+)?)/i);

    let salaryCurrency = null;
    if (currencyMatch) {
        salaryCurrency = currencyMatch[1].toUpperCase();
    } else if (symbolMatch) {
        if (symbolMatch[0] === '�') salaryCurrency = 'EUR';
        if (symbolMatch[0] === '$') salaryCurrency = 'USD';
        if (symbolMatch[0] === '�') salaryCurrency = 'GBP';
    }

    let salaryInterval = null;
    const lower = cleaned.toLowerCase();
    if (lower.includes('per hour') || lower.includes('/hour') || lower.includes('hourly')) salaryInterval = 'per-hour-wage';
    if (lower.includes('per month') || lower.includes('/month') || lower.includes('monthly')) salaryInterval = 'per-month-salary';
    if (lower.includes('per year') || lower.includes('/year') || lower.includes('annual') || lower.includes('yearly')) salaryInterval = 'per-year-salary';

    return {
        SalaryMin: rangeMatch ? Number(rangeMatch[1]) : null,
        SalaryMax: rangeMatch ? Number(rangeMatch[2]) : null,
        SalaryCurrency: salaryCurrency,
        SalaryInterval: salaryInterval
    };
}

export const greenhouseConfig = {
    siteName: "Greenhouse Jobs",
    baseUrl: "https://boards-api.greenhouse.io/v1/boards",

    companyBoardTokens: [
        // ? WORKING TOKENS (verified)
        'airbnb',
        'stripe',
        'figma',
        'airtable',
        'gitlab',
        'reddit',
        'pinterest',
        'twitch',
        'deliveryhero',
        'getaround',
        'wolt',
        'personio',
        'contentful',
        'celonis',
        'adjust',
        'signavio',
        'sennder',
        'n26',
        'gorillas',
        'flink',
        'trade-republic',
        'taxfix',
        'raisin',
        'heyjobs',
        'omio',
        'scalablecapital',
        'eyeo',
        'jimdo',
        'shopify',          // Try alternative
        'datadog',
        'notion',           // Try alternative  
        'miro',
        'zapier',
        'asana',
        'dropbox',
        'docusign',
        'confluent',
        'databricks',
        'snowflake',
        'hashicorp',
        'cloudflare',
        'mongodb',
        'elastic',
        'okta',
        'zendesk',
        'hubspot',
        'intercom',
        'segment',
        'amplitude',
        'mixpanel',
        'launchdarkly',
        'pagerduty',
        'sumo-logic',
        'new-relic',
        'splunk',
        'dynatrace',
        // --- BEGIN APPENDED ENTRIES ---
        'doctolib', 'sumup', 'flix', 'jetbrains', 'ionos', 'helsing', 'isaraerospace', 'staffbase', 'moia', 'freenow', 'scout24', 'parloa', 'autoscout24', 'trustpilot', 'finanzcheck', 'nice', 'grafanalabs', 'catawiki', 'navvis', 'clickhouse', 'flaconi', 'moonfare', 'trivago', 'adyen', 'zscaler', 'anaplan', 'think-cell', 'commercetools', 'grover', 'pleo', 'apaleo', 'idnow', 'typeform', 'dataiku', 'workato', 'mirakl', 'bitpanda', 'tanium', 'smartsheet', 'anydesk', 'spryker', 'strato', 'fivetran', 'tripadvisor', 'fireblocks', 'bitgo', 'beyondtrust', 'tekla', 'adahealth', 'qualtrics', 'sofi', 'riotgames', 'udemy', 'klaviyo', 'cultureamp', 'planradar', 'five9', 'wooga', 'braze', 'bloomreach', 'konux', 'jfrog', 'cockroachlabs', 'scaleai', 'algolia', 'veracode', 'wrike', 'zuora', 'propstack', 'pendo',
        // --- END APPENDED ENTRIES ---
        // --- GERMAN EXPANSION 2026-08-04 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'hellofresh',  // 59 DE / 333 total
        'getyourguide',  // 39 DE / 55 total
        'solarisbank',  // 34 DE / 34 total
        'dept',  // 23 DE / 229 total
        'remotecom',  // 23 DE / 193 total
        'formlabs',  // 17 DE / 191 total
        'caronsale',  // 16 DE / 16 total
        'hubspotjobs',  // 15 DE / 163 total
        'talonone',  // 13 DE / 19 total
        'superchat',  // 12 DE / 12 total
        'mozilla',  // 11 DE / 85 total
        'hive',  // 10 DE / 18 total
        'linkedinjobs',  // 10 DE / 16 total
        'ebury',  // 10 DE / 164 total
        'valtech',  // 10 DE / 135 total
        'marvelfusion',  // 10 DE / 12 total
        'toogoodtogo',  // 10 DE / 77 total
        'tide',  // 8 DE / 102 total
        'gigs',  // 7 DE / 39 total
        'spire',  // 7 DE / 48 total
        'flatironhealth',  // 6 DE / 36 total
        'ivalua',  // 5 DE / 40 total
        'cognite',  // 5 DE / 48 total
        'pandadoc',  // 5 DE / 55 total
        'ledgy',  // 4 DE / 22 total
        'samsara',  // 4 DE / 298 total
        'flexport',  // 4 DE / 153 total
        'forter',  // 4 DE / 40 total
        'rubrik',  // 4 DE / 106 total
        'vay',  // 4 DE / 11 total
        'relex',  // 3 DE / 36 total
        'gostudent',  // 3 DE / 24 total
        'chainguard',  // 3 DE / 71 total
        'wunderflats',  // 3 DE / 3 total
        'prophet',  // 3 DE / 27 total
        'agency',  // 2 DE / 821 total
        'newrelic',  // 2 DE / 51 total
        'temporaltechnologies',  // 2 DE / 56 total
        'sumologic',  // 2 DE / 21 total
        'anthropic',  // 2 DE / 393 total
        'urbansportsclub',  // 2 DE / 4 total
        'blacklane',  // 2 DE / 8 total
        'ecoworks',  // 2 DE / 2 total
        'oliver',  // 2 DE / 53 total
        'coalition',  // 2 DE / 30 total
        'singlestore',  // 1 DE / 37 total
        'shifttechnology',  // 1 DE / 29 total
        'mentimeter',  // 1 DE / 22 total
        'scandit',  // 1 DE / 15 total
        'mattermost',  // 1 DE / 12 total
        'traderepublic',  // 1 DE / 1 total
        'project44',  // 1 DE / 34 total
        'descope',  // 1 DE / 6 total
        'storyblok',  // 1 DE / 12 total
        'jamf',  // 1 DE / 39 total
        'postman',  // 1 DE / 106 total
        'solarwinds',  // 1 DE / 94 total
        'kayak',  // 1 DE / 1 total
        'playlist',  // 1 DE / 33 total
        'ireland',  // 1 DE / 12 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'artefact',  // 7 DE / 126 total
        'gallup',  // 6 DE / 54 total
        'goodman',  // 6 DE / 35 total
        'onemedical',  // 6 DE / 333 total
        'quince',  // 5 DE / 148 total
        'mullins',  // 5 DE / 82 total
        'tulip',  // 5 DE / 68 total
        'braineffectjobs',  // 5 DE / 5 total
        'eucalyptus',  // 4 DE / 109 total
        'asm',  // 3 DE / 425 total
        'octagon',  // 2 DE / 12 total
        'berlinbrands',  // 2 DE / 12 total
        'equipmentsharecom',  // 2 DE / 993 total
        'monks',  // 1 DE / 349 total
        'fetch',  // 1 DE / 53 total
        'fender',  // 1 DE / 37 total
        'airship',  // 1 DE / 18 total
        'staged',  // 1 DE / 5 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'spektrum',  // 3 DE / 173 total
        'flipp',  // 2 DE / 11 total
        'janes',  // 1 DE / 10 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'teampicnic',  // 154 DE / 313 total
        'wppmedia',  // 132 DE / 1202 total
        'speechify',  // 30 DE / 1302 total
        'alixpartners',  // 25 DE / 112 total
        'cfoinsights',  // 20 DE / 303 total
        'ionos2',  // 20 DE / 33 total
        'veeamsoftware',  // 15 DE / 232 total
        'blackforestlabs',  // 12 DE / 13 total
        'emnify',  // 11 DE / 14 total
        'auterion',  // 9 DE / 20 total
        'atolls',  // 9 DE / 21 total
        'dkbcodefactory',  // 7 DE / 22 total
        'headborneai',  // 4 DE / 5 total
        'verifone',  // 3 DE / 44 total
        'airup',  // 3 DE / 3 total
        'stackadapt',  // 3 DE / 92 total
        'boxinc',  // 1 DE / 128 total
        'unframe',  // 1 DE / 34 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'forvismazars',  // 334 DE / 336 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'andurilindustries',  // 1 DE / 2171 total
        // --- GERMAN EXPANSION 2026-08-05 ---
        // Verified: board reachable AND >=1 job located in Germany.
        'intersystems',  // 4 DE / 143 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'thequalitygroupgmbh2',  // Added via discovery — 59 DE / 87 total
        'suitsupply',  // Added via discovery — 12 DE / 169 total
        'ogilvygermany',  // Added via discovery — 10 DE / 10 total
        'via',  // Added via discovery — 9 DE / 162 total
        'brunswickgroup',  // Added via discovery — 7 DE / 51 total
        'cresta',  // Added via discovery — 5 DE / 94 total
        'wizinc',  // Added via discovery — 5 DE / 132 total
        'de-coalition',  // Added via discovery — 4 DE / 4 total
        'akqa',  // Added via discovery — 4 DE / 41 total
        'realtimeboardglobal',  // Added via discovery — 3 DE / 39 total
        'purestorage',  // Added via discovery — 3 DE / 327 total
        'internationalcopyrightenterpriseservices',  // Added via discovery — 1 DE / 1 total
        'thoughtworks',  // Added via discovery — 1 DE / 39 total
        'thefork',  // Added via discovery — 1 DE / 26 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'thequalitygroupgmbh1',  // Added via discovery — 66 DE / 103 total
        'rocketfactoryaugsburgag',  // Added via discovery — 41 DE / 47 total
        'kayzen',  // Added via discovery — 3 DE / 13 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'onlinebirdsgmbhen',  // Added via discovery — 9 DE / 9 total
        'appinio',  // Added via discovery — 1 DE / 3 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'capgeminideutschlandgmbh',  // Added via discovery — 109 DE / 109 total
        'projectaservicesgmbhcokg',  // Added via discovery — 70 DE / 71 total
        'arxroboticsgmbh',  // Added via discovery — 42 DE / 50 total
        'feverup',  // Added via discovery — 36 DE / 607 total
        'capco',  // Added via discovery — 34 DE / 699 total
        'avimedical',  // Added via discovery — 32 DE / 34 total
        'nebius',  // Added via discovery — 28 DE / 378 total
        'aloyoga',  // Added via discovery — 23 DE / 1077 total
        'unitedmedia',  // Added via discovery — 20 DE / 361 total
        'tripactions',  // Added via discovery — 19 DE / 210 total
        'planetlabs',  // Added via discovery — 18 DE / 115 total
        'smavagmbh',  // Added via discovery — 17 DE / 29 total
        'gympass',  // Added via discovery — 17 DE / 94 total
        'alpineeagle',  // Added via discovery — 16 DE / 18 total
        'wayve',  // Added via discovery — 15 DE / 172 total
        'axon',  // Added via discovery — 14 DE / 539 total
        'mediabrands',  // Added via discovery — 13 DE / 213 total
        'betterhelp',  // Added via discovery — 12 DE / 160 total
        'lanesplanes',  // Added via discovery — 11 DE / 11 total
        'awin',  // Added via discovery — 10 DE / 50 total
        'firstglobalmanagementservicesinc',  // Added via discovery — 10 DE / 61 total
        'audibenehearcom',  // Added via discovery — 9 DE / 11 total
        'lucanetgroup',  // Added via discovery — 9 DE / 18 total
        'gotion',  // Added via discovery — 8 DE / 143 total
        'intrinsicrobotics',  // Added via discovery — 8 DE / 25 total
        'tripledotstudios',  // Added via discovery — 8 DE / 75 total
        'lucidmotors',  // Added via discovery — 8 DE / 374 total
        'wpp',  // Added via discovery — 7 DE / 211 total
        'corcepttherapeutics',  // Added via discovery — 7 DE / 83 total
        'traderepublicbank',  // Added via discovery — 7 DE / 46 total
        'engineeringatgigs',  // Added via discovery — 6 DE / 14 total
        'butternutbox',  // Added via discovery — 6 DE / 42 total
        'classpass',  // Added via discovery — 6 DE / 37 total
        'netskope',  // Added via discovery — 6 DE / 142 total
        'referralsuseonly',  // Added via discovery — 6 DE / 113 total
        'quixquantumbv',  // Added via discovery — 6 DE / 7 total
        'esri',  // Added via discovery — 6 DE / 457 total
        'applovin',  // Added via discovery — 5 DE / 37 total
        'diligentcorporation',  // Added via discovery — 5 DE / 115 total
        'geotab',  // Added via discovery — 5 DE / 85 total
        'zetaglobal',  // Added via discovery — 5 DE / 146 total
        'tenstorrent',  // Added via discovery — 5 DE / 126 total
        'sentinellabs',  // Added via discovery — 5 DE / 197 total
        'asteralabs',  // Added via discovery — 5 DE / 168 total
        'enchargeai36',  // Added via discovery — 5 DE / 26 total
        'vercel',  // Added via discovery — 4 DE / 87 total
        'knowbe4',  // Added via discovery — 4 DE / 65 total
        'landor',  // Added via discovery — 4 DE / 50 total
        'fgsglobal',  // Added via discovery — 4 DE / 16 total
        'opentable',  // Added via discovery — 4 DE / 113 total
        'payhawkio',  // Added via discovery — 4 DE / 45 total
        'pfm',  // Added via discovery — 4 DE / 114 total
        'platformsh',  // Added via discovery — 4 DE / 8 total
        'precisionmedicinegroup',  // Added via discovery — 4 DE / 154 total
        'soundcloud71',  // Added via discovery — 4 DE / 15 total
        'venturatravel',  // Added via discovery — 4 DE / 32 total
        'onrunning',  // Added via discovery — 4 DE / 301 total
        'appian',  // Added via discovery — 3 DE / 176 total
        'axs',  // Added via discovery — 3 DE / 37 total
        'catonetworks',  // Added via discovery — 3 DE / 106 total
        'charlesriverassociates',  // Added via discovery — 3 DE / 79 total
        'bluefishai',  // Added via discovery — 3 DE / 21 total
        'cvx',  // Added via discovery — 3 DE / 43 total
        'liveperson',  // Added via discovery — 3 DE / 15 total
        'rti',  // Added via discovery — 3 DE / 15 total
        'theorchard',  // Added via discovery — 3 DE / 22 total
        'schrdinger',  // Added via discovery — 3 DE / 22 total
        'unybrands',  // Added via discovery — 3 DE / 25 total
        'whalarinc',  // Added via discovery — 3 DE / 19 total
        'redwoodsoftware',  // Added via discovery — 3 DE / 30 total
        'sonyinteractiveentertainmentglobal',  // Added via discovery — 3 DE / 196 total
        'simscale',  // Added via discovery — 3 DE / 4 total
        'acadiapharmaceuticals',  // Added via discovery — 2 DE / 44 total
        'bdainc',  // Added via discovery — 2 DE / 49 total
        'cannondale',  // Added via discovery — 2 DE / 4 total
        'castaigroupinc',  // Added via discovery — 2 DE / 28 total
        'coveoen',  // Added via discovery — 2 DE / 58 total
        'eositsolutions',  // Added via discovery — 2 DE / 152 total
        'feedzai',  // Added via discovery — 2 DE / 31 total
        'lenusehealth',  // Added via discovery — 2 DE / 8 total
        'nielenschuman',  // Added via discovery — 2 DE / 6 total
        'neo4j',  // Added via discovery — 2 DE / 56 total
        'mintel',  // Added via discovery — 2 DE / 20 total
        'gongio',  // Added via discovery — 2 DE / 83 total
        'okx',  // Added via discovery — 2 DE / 342 total
        'opswat',  // Added via discovery — 2 DE / 94 total
        'realchemistry',  // Added via discovery — 2 DE / 72 total
        'sonicwall',  // Added via discovery — 2 DE / 43 total
        'phiture',  // Added via discovery — 2 DE / 5 total
        'remotereferralboardinternaluseonly',  // Added via discovery — 2 DE / 65 total
        'sparetech',  // Added via discovery — 2 DE / 3 total
        'talkdesk2',  // Added via discovery — 2 DE / 44 total
        'onetrust',  // Added via discovery — 2 DE / 92 total
        'tenableinc',  // Added via discovery — 2 DE / 39 total
        'veracyte',  // Added via discovery — 2 DE / 35 total
        'xometryeurope',  // Added via discovery — 2 DE / 20 total
        'lastpass',  // Added via discovery — 2 DE / 14 total
        'telnyx54',  // Added via discovery — 2 DE / 55 total
        'airspace',  // Added via discovery — 1 DE / 17 total
        'accenturefederalservices',  // Added via discovery — 1 DE / 668 total
        'alamarbiosciences',  // Added via discovery — 1 DE / 22 total
        'agecareers',  // Added via discovery — 1 DE / 61 total
        'altamiratechnologies',  // Added via discovery — 1 DE / 3 total
        'aperaaiinc',  // Added via discovery — 1 DE / 7 total
        'appdirect',  // Added via discovery — 1 DE / 76 total
        'archer56',  // Added via discovery — 1 DE / 154 total
        'bitmovin',  // Added via discovery — 1 DE / 11 total
        'blackduck',  // Added via discovery — 1 DE / 57 total
        'beelinemedicines',  // Added via discovery — 1 DE / 43 total
        'brandwatch',  // Added via discovery — 1 DE / 13 total
        'broadsign',  // Added via discovery — 1 DE / 12 total
        'buynomics',  // Added via discovery — 1 DE / 8 total
        'c3iot',  // Added via discovery — 1 DE / 70 total
        'cision',  // Added via discovery — 1 DE / 48 total
        'catapultsports',  // Added via discovery — 1 DE / 29 total
        'cloudbeds',  // Added via discovery — 1 DE / 49 total
        'cyluscybersecurity',  // Added via discovery — 1 DE / 7 total
        'duettoresearch',  // Added via discovery — 1 DE / 16 total
        'elementbiosciences',  // Added via discovery — 1 DE / 16 total
        'harnessinc',  // Added via discovery — 1 DE / 69 total
        'fastly',  // Added via discovery — 1 DE / 46 total
        'guardsquare',  // Added via discovery — 1 DE / 16 total
        'headoutcareers',  // Added via discovery — 1 DE / 21 total
        'humansignal',  // Added via discovery — 1 DE / 52 total
        'headoutlinkedin',  // Added via discovery — 1 DE / 16 total
        'inmobi',  // Added via discovery — 1 DE / 54 total
        'iterativehealth',  // Added via discovery — 1 DE / 53 total
        'cognism',  // Added via discovery — 1 DE / 18 total
        'kaseya',  // Added via discovery — 1 DE / 91 total
        'mitratech',  // Added via discovery — 1 DE / 18 total
        'miqdigital',  // Added via discovery — 1 DE / 46 total
        'movableink',  // Added via discovery — 1 DE / 37 total
        'nintex',  // Added via discovery — 1 DE / 16 total
        'pacvue',  // Added via discovery — 1 DE / 18 total
        'ipfabric',  // Added via discovery — 1 DE / 7 total
        'nlcventures',  // Added via discovery — 1 DE / 6 total
        'pqshield',  // Added via discovery — 1 DE / 8 total
        'recycleye',  // Added via discovery — 1 DE / 4 total
        'refeyn',  // Added via discovery — 1 DE / 10 total
        'retailnext',  // Added via discovery — 1 DE / 5 total
        'preciselyinternationaljobs',  // Added via discovery — 1 DE / 23 total
        'sezzle',  // Added via discovery — 1 DE / 203 total
        'skillsoft',  // Added via discovery — 1 DE / 3 total
        'soldejaneiro',  // Added via discovery — 1 DE / 26 total
        'showpad',  // Added via discovery — 1 DE / 38 total
        'taboola',  // Added via discovery — 1 DE / 86 total
        'wekatest',  // Added via discovery — 1 DE / 45 total
        'yext',  // Added via discovery — 1 DE / 20 total
        'yousician',  // Added via discovery — 1 DE / 1 total
        'oneacrefund',  // Added via discovery — 1 DE / 49 total
        'verkada',  // Added via discovery — 1 DE / 293 total
        'wundermanthompson',  // Added via discovery — 1 DE / 549 total
        'minitab',  // Added via discovery — 1 DE / 11 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'evernest',  // Added via discovery — 85 DE / 105 total
        'gropyus',  // Added via discovery — 77 DE / 93 total
        'rubyhotels',  // Added via discovery — 69 DE / 126 total
        'indiecampers',  // Added via discovery — 58 DE / 694 total
        'kinexon',  // Added via discovery — 35 DE / 37 total
        'simtrabps',  // Added via discovery — 35 DE / 108 total
        'proalphagroup',  // Added via discovery — 28 DE / 35 total
        'privateequityinsights',  // Added via discovery — 20 DE / 1151 total
        'mindsquareag',  // Added via discovery — 16 DE / 53 total
        'wongdoody',  // Added via discovery — 15 DE / 25 total
        'crfamilyofcompanies',  // Added via discovery — 13 DE / 127 total
        'revolutionmedicines',  // Added via discovery — 12 DE / 244 total
        'alaika',  // Added via discovery — 12 DE / 12 total
        'grey',  // Added via discovery — 12 DE / 23 total
        'thirdbridge',  // Added via discovery — 12 DE / 130 total
        'sharkninjaoperatingllc',  // Added via discovery — 11 DE / 208 total
        'michelscorporation',  // Added via discovery — 11 DE / 656 total
        'orcristtechnologies',  // Added via discovery — 10 DE / 11 total
        'ogilvy',  // Added via discovery — 10 DE / 140 total
        'clariness',  // Added via discovery — 9 DE / 34 total
        'constructortech',  // Added via discovery — 9 DE / 50 total
        'cmbluenergyag',  // Added via discovery — 9 DE / 9 total
        'sohohouseco',  // Added via discovery — 9 DE / 429 total
        'numagroupgmbh',  // Added via discovery — 8 DE / 12 total
        'aircallioinc',  // Added via discovery — 8 DE / 67 total
        'amoriabond',  // Added via discovery — 8 DE / 42 total
        'sonymusicentertainment',  // Added via discovery — 8 DE / 156 total
        'florafoodgroup',  // Added via discovery — 7 DE / 30 total
        'verve',  // Added via discovery — 7 DE / 58 total
        'swissitsecuritygroup',  // Added via discovery — 7 DE / 16 total
        '4lu44n1n37w012k',  // Added via discovery — 6 DE / 13 total
        'enmacc',  // Added via discovery — 6 DE / 7 total
        'artefactlinkedin',  // Added via discovery — 6 DE / 105 total
        'baringa',  // Added via discovery — 6 DE / 109 total
        'mewssystems',  // Added via discovery — 6 DE / 32 total
        'mirumpharmaceuticals',  // Added via discovery — 6 DE / 82 total
        'zattoo',  // Added via discovery — 6 DE / 6 total
        'avepoint',  // Added via discovery — 5 DE / 294 total
        'shopfully',  // Added via discovery — 5 DE / 17 total
        'secretariatadvisorsllc',  // Added via discovery — 5 DE / 66 total
        'crewmeister',  // Added via discovery — 5 DE / 6 total
        'sonymusicde',  // Added via discovery — 5 DE / 5 total
        'bursonglobalcareers',  // Added via discovery — 5 DE / 190 total
        'affinidi',  // Added via discovery — 4 DE / 10 total
        'alphasights',  // Added via discovery — 4 DE / 73 total
        'banyansoftware',  // Added via discovery — 4 DE / 51 total
        'alphafmcroles',  // Added via discovery — 4 DE / 80 total
        'efihr',  // Added via discovery — 4 DE / 39 total
        'engelhart',  // Added via discovery — 4 DE / 9 total
        'kao',  // Added via discovery — 4 DE / 37 total
        'smartlyio',  // Added via discovery — 4 DE / 79 total
        'reolink',  // Added via discovery — 4 DE / 64 total
        'sprengnetter',  // Added via discovery — 4 DE / 4 total
        'examplecorpsandbox',  // Added via discovery — 4 DE / 219 total
        'smxtech',  // Added via discovery — 3 DE / 113 total
        'svetness',  // Added via discovery — 3 DE / 4980 total
        'charles',  // Added via discovery — 3 DE / 3 total
        'inceptive',  // Added via discovery — 3 DE / 10 total
        'phenogyeuropegmbh',  // Added via discovery — 3 DE / 3 total
        'interbrand',  // Added via discovery — 3 DE / 17 total
        'remotewoman',  // Added via discovery — 3 DE / 7 total
        'readdle70',  // Added via discovery — 3 DE / 10 total
        'rtbhouse',  // Added via discovery — 3 DE / 66 total
        'seyond',  // Added via discovery — 3 DE / 10 total
        'zam',  // Added via discovery — 3 DE / 9 total
        'scbitdefendersrl',  // Added via discovery — 3 DE / 48 total
        'warburgpincusllc',  // Added via discovery — 3 DE / 4 total
        'logicmonitor',  // Added via discovery — 3 DE / 47 total
        'atariinc',  // Added via discovery — 2 DE / 12 total
        'adjustjobs',  // Added via discovery — 2 DE / 24 total
        'atricure',  // Added via discovery — 2 DE / 64 total
        'barbaricum',  // Added via discovery — 2 DE / 139 total
        'bybit',  // Added via discovery — 2 DE / 160 total
        'cloudbedsthirdpartyboard',  // Added via discovery — 2 DE / 107 total
        'jackmortonworldwide',  // Added via discovery — 2 DE / 71 total
        'ecosio',  // Added via discovery — 2 DE / 3 total
        'leasingmarkt',  // Added via discovery — 2 DE / 2 total
        'kadmos3',  // Added via discovery — 2 DE / 2 total
        'kaizengaming',  // Added via discovery — 2 DE / 82 total
        'swissitgermany',  // Added via discovery — 2 DE / 2 total
        'yondrgroup',  // Added via discovery — 2 DE / 20 total
        'velocityelectronics',  // Added via discovery — 2 DE / 21 total
        'viralnation',  // Added via discovery — 2 DE / 63 total
        'prisma6',  // Added via discovery — 2 DE / 2 total
        'portwest',  // Added via discovery — 2 DE / 30 total
        'appviewx',  // Added via discovery — 1 DE / 13 total
        'autoproff',  // Added via discovery — 1 DE / 12 total
        'axicom',  // Added via discovery — 1 DE / 12 total
        'cargoo',  // Added via discovery — 1 DE / 5 total
        'butterflynetwork',  // Added via discovery — 1 DE / 21 total
        'clevr',  // Added via discovery — 1 DE / 14 total
        'constructorknowledg',  // Added via discovery — 1 DE / 13 total
        'connectwise',  // Added via discovery — 1 DE / 54 total
        'blueprintmedicines',  // Added via discovery — 1 DE / 3 total
        'dna',  // Added via discovery — 1 DE / 1 total
        'digitalocean98',  // Added via discovery — 1 DE / 132 total
        'dominodatalab',  // Added via discovery — 1 DE / 22 total
        'druva',  // Added via discovery — 1 DE / 41 total
        'emplifi',  // Added via discovery — 1 DE / 4 total
        'eqtpartners',  // Added via discovery — 1 DE / 23 total
        'fschumacherco',  // Added via discovery — 1 DE / 31 total
        'hunterdouglas',  // Added via discovery — 1 DE / 68 total
        'interworks',  // Added via discovery — 1 DE / 21 total
        'jointqg',  // Added via discovery — 1 DE / 4 total
        'koddi',  // Added via discovery — 1 DE / 9 total
        'maxcessinternational',  // Added via discovery — 1 DE / 31 total
        'mbarecruitingcra',  // Added via discovery — 1 DE / 2 total
        'hasbro',  // Added via discovery — 1 DE / 144 total
        'netcracker',  // Added via discovery — 1 DE / 22 total
        'moltonbrown',  // Added via discovery — 1 DE / 11 total
        'ntconcepts',  // Added via discovery — 1 DE / 10 total
        'nscaleoperationsukltd',  // Added via discovery — 1 DE / 256 total
        'ompexternaljobboards',  // Added via discovery — 1 DE / 35 total
        'phenogyag',  // Added via discovery — 1 DE / 2 total
        'putnamassociatesllc',  // Added via discovery — 1 DE / 13 total
        'saasgroup',  // Added via discovery — 1 DE / 9 total
        'sedo',  // Added via discovery — 1 DE / 1 total
        'pokaeu',  // Added via discovery — 1 DE / 2 total
        'sonatus',  // Added via discovery — 1 DE / 23 total
        'teneolinkedin',  // Added via discovery — 1 DE / 45 total
        'thehutgroup',  // Added via discovery — 1 DE / 104 total
        'theriversidecompany',  // Added via discovery — 1 DE / 3 total
        'teneo',  // Added via discovery — 1 DE / 47 total
        'ubiquiti',  // Added via discovery — 1 DE / 174 total
        'thevitacococompany',  // Added via discovery — 1 DE / 14 total
        'ultragenyxpharmaceutical',  // Added via discovery — 1 DE / 3 total
        'yubico',  // Added via discovery — 1 DE / 18 total
        'zyngacareers',  // Added via discovery — 1 DE / 40 total
        'openenergytransition',  // Added via discovery — 1 DE / 5 total
        'locusrobotics',  // Added via discovery — 1 DE / 7 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'coreview',  // Added via discovery — 1 DE / 19 total
        'designbridge',  // Added via discovery — 1 DE / 32 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'thinkcellsoftware',  // Added via discovery — 15 DE / 31 total
        'webershandwick',  // Added via discovery — 14 DE / 26 total
        'rocketfactoryaugsburgag_de',  // Added via discovery — 13 DE / 13 total
        'beat81',  // Added via discovery — 10 DE / 10 total
        'onlinebirdsgmbh',  // Added via discovery — 9 DE / 9 total
        'digitalservice',  // Added via discovery — 7 DE / 7 total
        'nlighten',  // Added via discovery — 7 DE / 15 total
        'sitsgroup',  // Added via discovery — 7 DE / 17 total
        'berylls',  // Added via discovery — 6 DE / 6 total
        'constructorknowledgelabs',  // Added via discovery — 6 DE / 10 total
        'thesocialhub',  // Added via discovery — 6 DE / 115 total
        'sfweb',  // Added via discovery — 5 DE / 24 total
        'terraquantum',  // Added via discovery — 5 DE / 6 total
        'ultratendency',  // Added via discovery — 4 DE / 23 total
        'eterniteamgmbh',  // Added via discovery — 3 DE / 17 total
        'soficonv',  // Added via discovery — 3 DE / 31 total
        'hourglasscosmetics',  // Added via discovery — 2 DE / 43 total
        'openup',  // Added via discovery — 2 DE / 13 total
        'attotude',  // Added via discovery — 1 DE / 12 total
        'bakerhicks',  // Added via discovery — 1 DE / 125 total
        'eggai',  // Added via discovery — 1 DE / 6 total
        'eunetworks',  // Added via discovery — 1 DE / 6 total
        'highradius',  // Added via discovery — 1 DE / 84 total
        'phagenesisltd',  // Added via discovery — 1 DE / 5 total
        'secondfoundation',  // Added via discovery — 1 DE / 20 total
        'swordhealth',  // Added via discovery — 1 DE / 32 total
        'xntltd',  // Added via discovery — 1 DE / 25 total
        // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
        'bioptimus-careers',  // Added via discovery — 4 DE / 9 total
        'globaldimensionsllc',  // Added via discovery — 1 DE / 48 total
],

    // Internal state
    _currentBoardIndex: 0,
    _allJobsQueue: [],
    _initialized: false,

    // Fetch one board's jobs and return ONLY the Germany-filtered ones.
    // Extracted from the initialize() loop so the full API response (often
    // 1,000+ jobs with descriptions) goes out of scope — and becomes eligible
    // for garbage collection — as soon as each company finishes.
    //
    // Change detection (both layers live HERE, before jobs can enter the
    // queue): an If-None-Match/304 skips the download entirely; otherwise a
    // content hash over id|title|location fingerprints (descriptions excluded)
    // skips boards whose postings haven't materially changed.
    //
    // Returns null on failure, else { unchanged, jobs, state }.
    async _fetchCompany(boardToken, stateMap) {
        const prev = stateMap.get(stateKey('greenhouse', boardToken));
        try {
            const url = `${this.baseUrl}/${boardToken}/jobs?content=true`;
            const headers = prev?.etag ? { 'If-None-Match': prev.etag } : {};
            const response = await fetch(url, { headers });

            // 304 — board unchanged at the HTTP layer; nothing was downloaded.
            if (response.status === 304) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: boardToken, etag: prev.etag, contentHash: prev.contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            if (!response.ok) {
                // Only log if you want to see failures (comment out to reduce noise)
                // console.log(`[Greenhouse] ? ${boardToken}: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const etag = response.headers.get('etag') || null;

            if (!data.jobs || data.jobs.length === 0) {
                return {
                    unchanged: false, jobs: [],
                    state: { slug: boardToken, etag, contentHash: computeContentHash([]), jobCount: 0, changed: !prev },
                };
            }

            // Content hash over the RAW list (pre-filter) so any add/remove/edit
            // that could flip a filter decision invalidates it.
            const contentHash = computeContentHash(
                data.jobs.map(j => `${j.id}|${j.title || ''}|${j.location?.name || ''}`),
            );
            if (prev && prev.contentHash === contentHash) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    unchanged: true, jobs: [],
                    state: { slug: boardToken, etag, contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            // Filter for Germany and add board token
            const germanyJobs = data.jobs
                .filter(job => {
                    const location = job.location?.name || '';
                    return this.isGermanyLocation(location);
                })
                .map(job => ({
                    ...job,
                    _boardToken: boardToken
                }));

            if (germanyJobs.length > 0) {
                console.log(`[Greenhouse] ✅ ${boardToken}: ${germanyJobs.length} jobs in Germany (${data.jobs.length} total)`);
            }

            // Rate limit: wait 500ms between companies
            await new Promise(resolve => setTimeout(resolve, 500));
            return {
                unchanged: false, jobs: germanyJobs,
                state: { slug: boardToken, etag, contentHash, jobCount: germanyJobs.length, changed: true },
            };
        } catch (error) {
            console.error(`[Greenhouse] ? ${boardToken}: ${error.message}`);
            return null;
        }
    },

    // Fetch all jobs from all boards upfront (streamed one company at a time)
    async initialize() {
        if (this._initialized) return;

        console.log(`[Greenhouse] Fetching jobs from ${this.companyBoardTokens.length} companies...`);

        const stateMap = await loadScrapeStates('greenhouse');
        const pendingStates = [];
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        for (const boardToken of this.companyBoardTokens) {
            const result = await this._fetchCompany(boardToken, stateMap);
            if (result === null) { failCount++; continue; }
            pendingStates.push(result.state);
            if (result.unchanged) { skippedCount++; continue; }
            if (result.jobs.length > 0) {
                this._allJobsQueue.push(...result.jobs);
                successCount++;
            }
        }

        await saveScrapeStatesBulk('greenhouse', pendingStates);
        console.log(`[Greenhouse] ? Summary: ${successCount} companies with Germany jobs, ${skippedCount} unchanged (skipped), ${failCount} failed/empty`);
        console.log(`[Greenhouse] ?? Total jobs found: ${this._allJobsQueue.length}`);
        this._initialized = true;
    },

    // Fetch jobs page (required by scraperEngine)
    async fetchPage(offset, limit) {
        // Initialize on first call
        if (!this._initialized) {
            await this.initialize();
        }

        // Return paginated chunk
        const jobs = this._allJobsQueue.slice(offset, offset + limit);
        return { jobs, total: this._allJobsQueue.length };
    },

    // Required by scraperEngine
    getJobs(data) {
        return data.jobs || [];
    },

    // Get total (for pagination)
    getTotal(data) {
        return data.total || 0;
    },

    // Extract job ID
    extractJobID(job) {
        return `greenhouse_${job._boardToken}_${job.id}`;
    },

    // Extract job title
    extractJobTitle(job) {
        return job.title;
    },

    // Extract company name
    extractCompany(job) {
        const boardToken = job._boardToken;

        // Try to get from metadata
        if (job.metadata && job.metadata.length > 0) {
            const companyField = job.metadata.find(m => m.name.toLowerCase().includes('company'));
            if (companyField) return companyField.value;
        }

        // Format board token to readable name
        return boardToken
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    },

    // Extract location
    extractLocation(job) {
        return job.location?.name || 'Germany';
    },

    // Extract description
    extractDescription(job) {
        return StripHtml(job.content || '');
    },

    extractDescriptionHtml(job) {
        return SanitizeHtml(job.content || '');
    },

    // Extract URL
    extractURL(job) {
        return job.absolute_url;
    },

    // Extract posted date
    extractPostedDate(job) {
        return job.updated_at;
    },

    extractDepartment(job) {
        const fromDepartments = Array.isArray(job.departments) && job.departments.length > 0 ? job.departments[0]?.name : null;
        if (fromDepartments) return fromDepartments;
        const metadata = metadataToObject(job.metadata);
        return findMetadataValue(metadata, ['department', 'team']) || 'N/A';
    },

    extractTeam(job) {
        const metadata = metadataToObject(job.metadata);
        return findMetadataValue(metadata, ['team']) || null;
    },

    extractOffice(job) {
        return Array.isArray(job.offices) && job.offices.length > 0 ? job.offices[0]?.name || null : null;
    },

    extractAllLocations(job) {
        const officeLocations = (job.offices || []).map(office => office?.location).filter(Boolean);
        return normalizeArray([job.location?.name, ...officeLocations]);
    },

    extractCountry(job) {
        const allLocations = this.extractAllLocations(job).join(' ').toLowerCase();
        if (allLocations.includes('germany') || allLocations.includes('deutschland')) return 'DE';
        return null;
    },

    extractEmploymentType(job) {
        const metadata = metadataToObject(job.metadata);
        const value = findMetadataValue(metadata, ['employment', 'contract', 'time']);
        return normalizeEmploymentType(value);
    },

    extractWorkplaceType(job) {
        return 'Unspecified';
    },

    extractIsRemote(job) {
        return false;
    },

    extractTags(job) {
        const metadata = metadataToObject(job.metadata);
        const tags = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (!value) continue;
            if (Array.isArray(value)) {
                tags.push(...value.map(v => `${key}:${v}`));
            } else {
                tags.push(`${key}:${value}`);
            }
        }
        return normalizeArray(tags);
    },

    extractDirectApplyURL() {
        return null;
    },

    extractSalaryCurrency(job) {
        const fromContent = parseSalaryFromText(job.content || '');
        if (fromContent.SalaryCurrency) return fromContent.SalaryCurrency;
        const metadata = metadataToObject(job.metadata);
        return findMetadataValue(metadata, ['currency']) || null;
    },

    extractSalaryMin(job) {
        const fromContent = parseSalaryFromText(job.content || '');
        if (Number.isFinite(fromContent.SalaryMin)) return fromContent.SalaryMin;
        const metadata = metadataToObject(job.metadata);
        const val = Number(findMetadataValue(metadata, ['salary min', 'min salary', 'minimum salary', 'comp min']));
        return Number.isFinite(val) ? val : null;
    },

    extractSalaryMax(job) {
        const fromContent = parseSalaryFromText(job.content || '');
        if (Number.isFinite(fromContent.SalaryMax)) return fromContent.SalaryMax;
        const metadata = metadataToObject(job.metadata);
        const val = Number(findMetadataValue(metadata, ['salary max', 'max salary', 'maximum salary', 'comp max']));
        return Number.isFinite(val) ? val : null;
    },

    extractSalaryInterval(job) {
        const fromContent = parseSalaryFromText(job.content || '');
        if (fromContent.SalaryInterval) return fromContent.SalaryInterval;
        const metadata = metadataToObject(job.metadata);
        const raw = findMetadataValue(metadata, ['salary interval', 'interval']);
        if (!raw) return null;
        const lower = String(raw).toLowerCase();
        if (lower.includes('hour')) return 'per-hour-wage';
        if (lower.includes('month')) return 'per-month-salary';
        if (lower.includes('year')) return 'per-year-salary';
        return null;
    },

    extractATSPlatform() {
        return 'greenhouse';
    },

    // Check if location is in Germany � delegates to shared isGermanyString() helper
    isGermanyLocation(location) {
        return isGermanyString(location);
    }
};
