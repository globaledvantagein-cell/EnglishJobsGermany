// ─── Skill Matcher ─────────────────────────────────────────────────────────────
//
// Pure programmatic skill matching — no AI, no API calls.
// Reads from the RAM jobs cache, compares user profile skills against
// parsedRequirements on each job, returns top N matches scored by overlap.
//
// Scoring (per job):
//   1. Skill overlap      — required match = 3pts, preferred = 1pt, tool = 1pt
//                           scored as (requiredCoverage * 0.8) + (bonusCoverage * 0.2)
//   2. Experience level   — penalise big seniority gaps (Entry↔Director)
//   3. Domain alignment   — boost same-domain jobs
//   Final score = skillScore * levelMultiplier * domainMultiplier
//
// Additional safeguards:
//   - Synonym map for ~100 common tech skill aliases
//   - Compound skill names (>4 words) excluded from denominator
//   - Thin profiles (<3 skills) return a dedicated reason
//   - Date-seeded tiebreaker for daily rotation
//   - Max 2 results per company so one employer can't fill the whole list

import { getAllJobs } from '../cache/jobsCache.js';

// Most results any single company may occupy in one match set.
const MAX_JOBS_PER_COMPANY = 2;

// ── Skill Synonym Map ────────────────────────────────────────────────────────
// Canonical → list of aliases (all lowercase, no dots/dashes/spaces).
// buildUserSkillSet and scoreJob both resolve through this map.
const SYNONYM_GROUPS = [
    ['javascript',     'js'],
    ['typescript',     'ts'],
    ['nodejs',         'node'],
    ['reactjs',        'react'],
    ['vuejs',          'vue'],
    ['angularjs',      'angular'],
    ['nextjs',         'next'],
    ['expressjs',      'express'],
    ['nestjs',         'nest'],
    ['postgresql',     'postgres', 'psql'],
    ['mongodb',        'mongo'],
    ['mysql',          'mariadb'],
    ['kubernetes',     'k8s'],
    ['docker',         'containers', 'containerization'],
    ['amazonwebservices', 'aws'],
    ['googlecloudplatform', 'gcp', 'googlecloud'],
    ['microsoftazure', 'azure'],
    ['machinelearning','ml'],
    ['artificialintelligence', 'ai'],
    ['naturallanguageprocessing', 'nlp'],
    ['deeplearning',   'dl'],
    ['largelanguagemodel', 'llm', 'llms'],
    ['continuousintegrationcontinuousdelivery', 'cicd', 'ci', 'cd'],
    ['csharp',         'c#', 'dotnet', 'net'],
    ['cplusplus',      'cpp', 'c++'],
    ['golang',         'go'],
    ['python3',        'python', 'py'],
    ['java',           'jvm'],
    ['rubyonrails',    'rails', 'ror'],
    ['springboot',     'spring'],
    ['graphql',        'gql'],
    ['restapi',        'rest', 'restful', 'restapis'],
    ['terraform',      'tf'],
    ['figma',          'sketch', 'adobexd'],
    ['tailwindcss',    'tailwind'],
    ['sass',           'scss'],
    ['elasticsearch',  'elastic', 'es'],
    ['apachekafka',    'kafka'],
    ['rabbitmq',       'amqp'],
    ['redis',          'rediscache'],
    ['github',         'git'],
    ['gitlab',         'git'],
    ['bitbucket',      'git'],
    ['jira',           'atlassian'],
    ['dataanalysis',   'dataanalytics', 'analytics'],
    ['businessintelligence', 'bi'],
    ['powerbi',        'microsoftbi'],
    ['tableau',        'tableaudesktop'],
    ['sapfiori',       'sap'],

    // ── Platforms, practices and role-level terms ────────────────────────────
    // Job descriptions lean on these far more than the tool names above, so
    // without them a strong profile silently misses required-skill points.
    ['linux',          'unix', 'ubuntu', 'debian', 'centos'],
    ['agile',          'scrum', 'kanban'],
    ['projectmanagement', 'pm', 'projectmanager'],
    ['productmanagement', 'productmanager'],
    ['userexperience', 'ux', 'uxdesign'],
    ['userinterface',  'ui', 'uidesign'],
    // 'siterelibilityengineering' is the misspelling seen in real postings;
    // the correct spelling is listed alongside it so both resolve.
    ['devops',         'sre', 'siterelibilityengineering', 'sitereliabilityengineering'],
    ['dataengineering', 'dataengineer', 'etl'],
    ['datascience',    'datascientist', 'ds'],
    ['microservices',  'microservice'],
    ['objectrelationalmapping', 'orm'],
    ['contentmanagementsystem', 'cms'],
    ['searchengineoptimization', 'seo'],
    // Distinct from the 'cicd' group above: those are the practice, these are
    // the concrete CI products a posting names.
    ['continuousintegration', 'jenkins', 'circleci', 'githubactions'],
    ['monitoring',     'observability', 'datadog', 'grafana', 'prometheus'],
    ['messagequeue',   'mq', 'pubsub'],
    ['api',            'apis', 'webservices'],
    ['html',           'html5'],
    ['css',            'css3'],
    ['swift',          'swiftui'],
    ['kotlin',         'kotlinmultiplatform'],
    ['flutter',        'dart'],
    ['reactnative',    'rn'],
];

// Build a fast lookup: normalised name → canonical name
const synonymLookup = new Map();
for (const group of SYNONYM_GROUPS) {
    const canonical = group[0];
    for (const alias of group) {
        synonymLookup.set(alias, canonical);
    }
}

// ── Experience Level Hierarchy ───────────────────────────────────────────────
const LEVEL_RANK = {
    'entry':       0,
    'junior':      0,
    'intern':      0,
    'mid':         1,
    'midlevel':    1,
    'mid-level':   1,
    'senior':      2,
    'staff':       3,
    'principal':   3,
    'lead':        3,
    'manager':     3,
    'director':    4,
    'vp':          5,
    'head':        4,
    'c-level':     5,
    'executive':   5,
};

function getLevelRank(level) {
    if (!level) return -1;
    const key = String(level).toLowerCase().trim();
    return LEVEL_RANK[key] ?? -1;
}

// ── Normalisation ────────────────────────────────────────────────────────────
function normalizeSkillName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[.\-\/\s\(\)]+/g, '')
        .trim();
}

// Resolve a normalised skill name to its canonical form via synonyms
function toCanonical(normalised) {
    return synonymLookup.get(normalised) || normalised;
}

// Extract skill name from either string or { name } object
function extractName(item) {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && typeof item.name === 'string') return item.name;
    return null;
}

// Check if a skill name is a vague compound phrase (>4 words) that will
// never match a user's specific skills and just inflates the denominator.
function isCompoundSkill(name) {
    if (!name) return false;
    return name.split(/\s+/).length > 4;
}

// ── Build user skill set ─────────────────────────────────────────────────────
function buildUserSkillSet(profileSkills) {
    const set = new Set();
    if (!Array.isArray(profileSkills)) return set;
    for (const skill of profileSkills) {
        const name = extractName(skill);
        if (name) {
            set.add(toCanonical(normalizeSkillName(name)));
        }
    }
    return set;
}

// ── Score a single job ───────────────────────────────────────────────────────
function scoreJob(job, userSkills) {
    const req = job.parsedRequirements;
    if (!req) return null;

    const required  = Array.isArray(req.required_skills)  ? req.required_skills  : [];
    const preferred = Array.isArray(req.preferred_skills)  ? req.preferred_skills  : [];
    const tools     = Array.isArray(req.tools_and_platforms) ? req.tools_and_platforms : [];

    let requiredRawPoints = 0;
    let requiredMaxPoints = 0;
    let optionalRawPoints = 0;
    let optionalMaxPoints = 0;
    let totalSkillCount = 0;
    const matchedSkills = [];
    const seen = new Set();

    // isRequired routes the points into the required or the optional bucket.
    // A single flat denominator let a long preferred/tools list drown out the
    // required skills that actually decide whether someone can do the job.
    function checkSkill(skill, weight, isRequired) {
        const name = extractName(skill);
        if (!name) return;

        // Skip vague compound skills — they inflate the denominator
        if (isCompoundSkill(name)) return;

        totalSkillCount++;
        const canonical = toCanonical(normalizeSkillName(name));
        if (isRequired) requiredMaxPoints += weight;
        else            optionalMaxPoints += weight;

        if (userSkills.has(canonical) && !seen.has(canonical)) {
            if (isRequired) requiredRawPoints += weight;
            else            optionalRawPoints += weight;
            matchedSkills.push(name);
            seen.add(canonical);
        }
    }

    for (const s of required)  checkSkill(s, 3, true);
    for (const s of preferred) checkSkill(s, 1, false);
    for (const s of tools)     checkSkill(s, 1, false);

    const rawPoints = requiredRawPoints + optionalRawPoints;
    const maxPoints = requiredMaxPoints + optionalMaxPoints;
    if (totalSkillCount === 0 || rawPoints === 0) return null;

    // Required coverage carries 80% of the score, preferred + tools the
    // remaining 20% — so missing optional skills can never drag a fully
    // qualified candidate below 0.8, and matching them is a genuine bonus.
    const requiredScore = requiredMaxPoints > 0 ? requiredRawPoints / requiredMaxPoints : 0;
    const bonusScore    = optionalMaxPoints  > 0 ? optionalRawPoints / optionalMaxPoints  : 0;

    // A posting that lists no required skills at all would otherwise be capped
    // at 0.2 no matter how well it matched — fall back to the bonus side alone.
    const skillScore = requiredMaxPoints > 0
        ? (requiredScore * 0.8) + (bonusScore * 0.2)
        : bonusScore;

    return {
        skillScore,
        rawPoints,
        maxPoints,
        requiredRawPoints,
        requiredMaxPoints,
        optionalRawPoints,
        optionalMaxPoints,
        matchedSkills,
        matchedCount: matchedSkills.length,
        totalSkillCount,
    };
}

// ── Experience Level Penalty ─────────────────────────────────────────────────
// Returns a multiplier 0.0–1.0 that penalises large seniority gaps.
// Same level = 1.0, 1 level apart = 0.85, 2 = 0.6, 3+ = 0.3
function levelMultiplier(profileLevel, jobLevel) {
    const pRank = getLevelRank(profileLevel);
    const jRank = getLevelRank(jobLevel);

    // If either is unknown, don't penalise — give benefit of the doubt
    if (pRank < 0 || jRank < 0) return 1.0;

    const gap = Math.abs(pRank - jRank);
    if (gap === 0) return 1.0;
    if (gap === 1) return 0.85;
    if (gap === 2) return 0.6;
    return 0.3; // 3+ levels apart (e.g. Entry ↔ Director)
}

// ── Domain Alignment Boost ───────────────────────────────────────────────────
// Returns 1.0 for same domain, 0.85 for cross-domain.
// Not a hard filter — a software engineer CAN get data roles — just ranked lower.
function domainMultiplier(profileDomain, jobDomain) {
    if (!profileDomain || !jobDomain) return 1.0;
    const p = profileDomain.toLowerCase();
    const j = jobDomain.toLowerCase();
    if (p === j) return 1.0;
    // Technical ↔ Non-Technical is a bigger gap
    if ((p === 'technical' && j === 'non-technical') ||
        (p === 'non-technical' && j === 'technical')) return 0.75;
    return 0.85;
}

// ── Date-seeded tiebreaker ───────────────────────────────────────────────────
function dateSeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Seeding `h` with the date and then folding characters in left the seed as a
// constant offset (h ends up seed*31^length + hash(str)), so every ID of the
// same length shifted by the same amount and the sort order was identical every
// day — the rotation silently did nothing. Mixing the seed in *after* the
// string hash makes the order genuinely seed-dependent, and still deterministic
// for a given day.
function hashForShuffle(str, seed) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    h = Math.imul(h ^ seed, 2654435761);
    // Extra avalanche rounds (murmur3 finaliser) so similar JobIDs don't get
    // correlated values — the daily draw relies on this looking random.
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h | 0;
}

// ── Main entry point ─────────────────────────────────────────────────────────
/**
 * Match a user's profile skills against all active jobs in the RAM cache.
 *
 * @param {object} parsedProfile - User's parsedProfile from the DB
 * @param {number} limit - Number of results to return (default 10)
 * @returns {{ matches: object[], meta: object }}
 */
// Candidate pool size for the daily draw: the random pick is made from the
// best POOL_MULTIPLIER × limit matches, so results vary a lot day to day but
// stay relevant.
const POOL_MULTIPLIER = 6;

/**
 * @param {object} parsedProfile
 * @param {number} [limit=10]
 * @param {object} [opts]
 * @param {string[]} [opts.excludeIds] JobIDs shown recently — pushed to the back.
 * @param {number}   [opts.seed]       Override the daily seed (e.g. Refresh).
 */
export function getSkillMatches(parsedProfile, limit = 10, opts = {}) {
    if (!parsedProfile) {
        return { matches: [], meta: { reason: 'no_profile' } };
    }

    const profileSkills = parsedProfile.skills;
    if (!Array.isArray(profileSkills) || profileSkills.length === 0) {
        return { matches: [], meta: { reason: 'no_skills' } };
    }

    // Thin profile guard — fewer than 3 skills produces noisy results
    if (profileSkills.length < 3) {
        return { matches: [], meta: { reason: 'too_few_skills', userSkillCount: profileSkills.length } };
    }

    const userSkills = buildUserSkillSet(profileSkills);
    if (userSkills.size === 0) {
        return { matches: [], meta: { reason: 'no_skills' } };
    }

    // Guard: if the cache hasn't loaded yet, return empty gracefully
    let allJobs;
    try {
        allJobs = getAllJobs();
    } catch {
        return { matches: [], meta: { reason: 'cache_not_ready' } };
    }

    const profileLevel  = parsedProfile.seniority_level || parsedProfile.experience_level || null;
    const profileDomain = parsedProfile.domain || null;
    const seed = opts.seed ?? dateSeed();
    const recent = new Set((opts.excludeIds || []).map(String));
    const scored = [];
    let jobsWithRequirements = 0;

    for (const job of allJobs) {
        if (!job.parsedRequirements) continue;
        jobsWithRequirements++;

        const result = scoreJob(job, userSkills);
        if (!result) continue;

        // Apply experience level and domain multipliers
        const lvlMult = levelMultiplier(profileLevel, job.ExperienceLevel);
        const domMult = domainMultiplier(profileDomain, job.Domain);
        const finalScore = result.skillScore * lvlMult * domMult;

        scored.push({
            _id:             job._id,
            JobID:           job.JobID,
            JobTitle:        job.JobTitle,
            Company:         job.Company,
            Location:        job.Location,
            WorkplaceType:   job.WorkplaceType,
            ExperienceLevel: job.ExperienceLevel,
            Category:        job.Category,
            PostedDate:      job.PostedDate,
            scrapedAt:       job.scrapedAt,
            isEntryLevel:    job.isEntryLevel,
            applyClicks:     job.applyClicks || 0,
            // Match info
            score:           finalScore,
            rawPoints:       result.rawPoints,
            matchedSkills:   result.matchedSkills,
            matchedCount:    result.matchedCount,
            totalSkillCount: result.totalSkillCount,
            // Tiebreaker
            _tiebreaker:     hashForShuffle(String(job.JobID), seed),
        });
    }

    // Randomised daily pick. A strict score sort showed the same top jobs
    // every day, so instead:
    //   1. keep the best POOL_MULTIPLIER × limit matches as the candidate pool
    //   2. draw from it with score-weighted random sampling (Efraimidis–Spirakis:
    //      key = u^(1/weight)), seeded by the date so a day is stable but each
    //      day differs; better matches are still more likely to be picked
    //   3. jobs shown in the previous list get a heavy penalty so they rarely repeat
    scored.sort((a, b) => b.score - a.score);
    const pool = scored.slice(0, Math.max(limit * POOL_MULTIPLIER, 40));
    for (const job of pool) {
        // _tiebreaker is a 32-bit hash → uniform u in (0, 1)
        const u = ((job._tiebreaker >>> 0) + 1) / 4294967297;
        let weight = Math.max(job.score, 0.01);
        if (recent.has(String(job.JobID))) weight *= 0.05;
        job._key = Math.pow(u, 1 / weight);
    }
    pool.sort((a, b) => b._key - a._key);
    scored.length = 0;
    scored.push(...pool);

    // Company cap: walk the sorted list and skip any job whose company already
    // has MAX_JOBS_PER_COMPANY entries. Without it a single employer with many
    // near-identical postings could fill every slot.
    const matches = [];
    const companyCounts = new Map();
    for (const job of scored) {
        if (matches.length >= limit) break;
        const companyKey = normalizeSkillName(job.Company) || 'unknown';
        const seenCount = companyCounts.get(companyKey) || 0;
        if (seenCount >= MAX_JOBS_PER_COMPANY) continue;
        companyCounts.set(companyKey, seenCount + 1);
        const { _tiebreaker, _key, ...rest } = job;
        matches.push(rest);
    }

    // Show the picked jobs best-match first.
    matches.sort((a, b) => b.score - a.score);

    return {
        matches,
        meta: {
            reason: matches.length === 0 ? 'no_matches' : 'ok',
            totalJobsScanned: allJobs.length,
            jobsWithRequirements,
            userSkillCount: userSkills.size,
        },
    };
}