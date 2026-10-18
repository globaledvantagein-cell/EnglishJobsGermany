// ─── Skill Vocabulary ──────────────────────────────────────────────────────────
//
// Turns free-text skill names from job requirements and resumes into canonical
// keys that can be compared, and learns from the live job set how informative
// each skill is.
//
//   canonicalize("Node.js")                    → "nodejs"
//   expandSkill("Amazon Web Services (AWS)")   → ["amazonwebservices"]
//   expandSkill("AWS EC2")                     → ["awsec2", "amazonwebservices"]
//   skillWeight("python")  → ~1.0   (in 15% of jobs: common, weakly informative)
//   skillWeight("sepa")    → ~2.0   (rare: matching it says a lot)
//
// Rarity weighting is inverse document frequency over the active jobs'
// parsedRequirements, the classic content-based signal (TF-IDF matching is what
// production skill matchers such as the ESCO-based ones use). It is rebuilt
// whenever the jobs cache version changes.

import { getAllJobs, getCacheStats } from '../cache/index.js';

// Canonical → aliases (normalised: lowercase, no dots/dashes/slashes/spaces).
// Moved from skill-matcher/matchSkills.js; both matchers now share it.
const SYNONYM_GROUPS = [
    ['javascript', 'js', 'ecmascript'],
    ['typescript', 'ts'],
    ['nodejs', 'node'],
    ['reactjs', 'react'],
    ['vuejs', 'vue'],
    ['angularjs', 'angular'],
    ['nextjs', 'next'],
    ['expressjs', 'express'],
    ['nestjs', 'nest'],
    ['postgresql', 'postgres', 'psql'],
    ['mongodb', 'mongo'],
    ['mysql', 'mariadb'],
    ['kubernetes', 'k8s'],
    ['docker', 'containers', 'containerization'],
    ['amazonwebservices', 'aws'],
    ['googlecloudplatform', 'gcp', 'googlecloud'],
    ['microsoftazure', 'azure'],
    ['machinelearning', 'ml'],
    ['artificialintelligence', 'ai'],
    ['naturallanguageprocessing', 'nlp'],
    ['deeplearning', 'dl'],
    ['largelanguagemodels', 'llm', 'llms', 'largelanguagemodel'],
    ['cicd', 'ci', 'cd', 'continuousintegrationcontinuousdelivery', 'continuousintegrationcontinuousdeployment'],
    ['csharp', 'c#', 'dotnet', 'net', 'aspnet'],
    ['cplusplus', 'cpp', 'c++'],
    ['golang', 'go'],
    ['python', 'python3', 'py'],
    ['rubyonrails', 'rails', 'ror'],
    ['springboot', 'spring'],
    ['graphql', 'gql'],
    ['restapi', 'rest', 'restful', 'restapis', 'restfulapis'],
    ['terraform', 'tf'],
    ['tailwindcss', 'tailwind'],
    ['sass', 'scss'],
    ['elasticsearch', 'elastic'],
    ['apachekafka', 'kafka'],
    ['rabbitmq', 'amqp'],
    ['git', 'github', 'gitlab', 'bitbucket'],
    ['jira', 'atlassianjira'],
    ['dataanalysis', 'dataanalytics'],
    ['businessintelligence', 'bi'],
    ['powerbi', 'microsoftpowerbi'],
    ['tableau', 'tableaudesktop'],
    ['excel', 'microsoftexcel', 'msexcel'],
    ['linux', 'unix', 'ubuntu', 'debian', 'centos', 'rhel'],
    ['agile', 'scrum', 'kanban'],
    ['projectmanagement', 'projectmanager'],
    ['productmanagement', 'productmanager'],
    ['userexperience', 'ux', 'uxdesign'],
    ['userinterface', 'ui', 'uidesign'],
    ['devops', 'sre', 'sitereliabilityengineering', 'siterelibilityengineering'],
    ['dataengineering', 'dataengineer', 'etl'],
    ['datascience', 'datascientist'],
    ['microservices', 'microservice', 'microservicearchitecture'],
    ['objectrelationalmapping', 'orm'],
    ['contentmanagementsystem', 'cms'],
    ['searchengineoptimization', 'seo'],
    ['continuousintegration', 'jenkins', 'circleci', 'githubactions'],
    ['monitoring', 'observability', 'datadog', 'grafana', 'prometheus'],
    ['api', 'apis', 'webservices', 'apidesign'],
    ['html', 'html5'],
    ['css', 'css3'],
    ['swift', 'swiftui'],
    ['kotlin', 'kotlinmultiplatform'],
    ['flutter', 'dart'],
    ['reactnative', 'rn'],
    ['salesforce', 'salesforcecrm', 'sfdc'],
    ['customerrelationshipmanagement', 'crm'],
];

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) {
    for (const alias of group) SYNONYMS.set(alias, group[0]);
}

// Spoken languages are requirements, not skills. Counting "English" as a
// matched skill inflated every score (it is in 14% of jobs); "German" in
// required_skills is a German requirement and is handled by the hard filter.
export const LANGUAGE_SKILLS = new Set([
    'english', 'german', 'deutsch', 'french', 'spanish', 'italian', 'dutch', 'polish',
    'portuguese', 'russian', 'turkish', 'arabic', 'mandarin', 'chinese', 'japanese', 'korean',
    'swedish', 'danish', 'norwegian', 'finnish', 'czech', 'hungarian', 'romanian', 'greek',
]);

// Words that carry no skill meaning on their own inside multi-word skills.
const FILLER_WORDS = new Set([
    'and', 'or', 'of', 'the', 'with', 'in', 'for', 'to', 'a', 'an', 'on', 'experience',
    'knowledge', 'skills', 'skill', 'strong', 'good', 'solid', 'proficiency', 'basic',
    'advanced', 'understanding', 'familiarity', 'tools', 'tool', 'using', 'development',
    'programming', 'language', 'languages', 'framework', 'frameworks', 'platform', 'platforms',
]);

/** "Node.js" → "nodejs", "C++" → "c++", "CI/CD" → "cicd". */
export function normalizeSkill(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[.\-/\s()_,:'"]+/g, '')
        .trim();
}

export function canonicalize(name) {
    const normalized = normalizeSkill(name);
    return SYNONYMS.get(normalized) || normalized;
}

export function skillName(item) {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && typeof item.name === 'string') return item.name;
    return null;
}

// ── Vocabulary + rarity, rebuilt per jobs-cache version ──────────────────────

/** Skills must appear as a whole entry in this many jobs to be "known". */
const MIN_KNOWN_DOC_FREQUENCY = 3;

let built = { version: null, known: new Set(), idf: new Map(), medianIdf: 1, jobCount: 0 };

function rawSkillEntries(req) {
    if (!req) return [];
    return [
        ...(Array.isArray(req.required_skills) ? req.required_skills : []),
        ...(Array.isArray(req.preferred_skills) ? req.preferred_skills : []),
        ...(Array.isArray(req.tools_and_platforms) ? req.tools_and_platforms : []),
    ];
}

function rebuild() {
    const jobs = getAllJobs();
    const documentFrequency = new Map();
    let jobCount = 0;

    for (const job of jobs) {
        const entries = rawSkillEntries(job.parsedRequirements);
        if (entries.length === 0) continue;
        jobCount++;
        const seen = new Set();
        for (const entry of entries) {
            const name = skillName(entry);
            if (!name) continue;
            for (const key of expandWith(name, null)) seen.add(key);
        }
        for (const key of seen) documentFrequency.set(key, (documentFrequency.get(key) || 0) + 1);
    }

    const known = new Set(SYNONYMS.values());
    const idf = new Map();
    for (const [key, df] of documentFrequency) {
        if (df >= MIN_KNOWN_DOC_FREQUENCY) known.add(key);
        idf.set(key, Math.log((jobCount + 1) / (df + 1)) + 1);
    }
    const sorted = [...idf.values()].sort((a, b) => a - b);
    const medianIdf = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;

    built = { version: getCacheStats().cacheVersion, known, idf, medianIdf, jobCount };
}

function vocabulary() {
    // Before the jobs cache has loaded (right after a restart) there is no
    // vocabulary yet: fall back to whole-name/alias matching instead of throwing.
    try {
        if (built.version !== getCacheStats().cacheVersion || built.jobCount === 0) rebuild();
    } catch {
        return built;
    }
    return built;
}

/**
 * All canonical keys a skill string stands for.
 *
 * Beyond the whole string: "Name (ALIAS)" yields both halves, "React/Redux"
 * yields both parts, and a multi-word skill ("AWS EC2", "Python programming")
 * yields any known single skill inside it. `known` is null while the
 * vocabulary itself is being built (only whole/alias forms then).
 */
function expandWith(name, known) {
    const keys = new Set();
    const whole = canonicalize(name);
    if (whole) keys.add(whole);

    const paren = name.match(/^(.*?)\(([^)]*)\)\s*$/);
    if (paren) {
        const outside = canonicalize(paren[1]);
        if (outside) keys.add(outside);
        for (const part of paren[2].split(/[,;]/)) {
            const inside = canonicalize(part);
            if (inside && inside.length > 1) keys.add(inside);
        }
    }
    if (/[/,]/.test(name) && !SYNONYMS.has(normalizeSkill(name))) {
        for (const part of name.split(/[/,]/)) {
            const piece = canonicalize(part);
            if (piece && piece.length > 1) keys.add(piece);
        }
    }

    if (known) {
        const words = name.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[\s/,]+/).filter(Boolean);
        if (words.length > 1 && words.length <= 6) {
            for (let i = 0; i < words.length; i++) {
                if (FILLER_WORDS.has(words[i])) continue;
                const single = canonicalize(words[i]);
                if (single.length > 1 && known.has(single)) keys.add(single);
                if (i + 1 < words.length) {
                    const pair = canonicalize(`${words[i]} ${words[i + 1]}`);
                    if (known.has(pair)) keys.add(pair);
                }
            }
        }
    }
    return [...keys];
}

export function expandSkill(name) {
    return expandWith(name, vocabulary().known);
}

/** Is this a spoken-language "skill"? */
export function isLanguageSkill(name) {
    return LANGUAGE_SKILLS.has(normalizeSkill(name));
}

/**
 * Relative informativeness of a skill, centred on 1.0 for a median skill and
 * clamped to [0.6, 2] so one rare buzzword cannot dominate a job's score.
 */
export function skillWeight(key) {
    const { idf, medianIdf } = vocabulary();
    const value = idf.get(key);
    if (value == null) return 1.2; // unseen elsewhere: specific to this job
    return Math.min(2, Math.max(0.6, value / medianIdf));
}

// Title words that are also skill aliases but usually mean something else in a
// job title ("Go-to-market", "Next-gen", "REST of…", ".NET" survives as "net").
const AMBIGUOUS_TITLE_WORDS = new Set([
    'go', 'net', 'rest', 'spring', 'next', 'express', 'nest', 'elastic', 'ci', 'cd',
    'tf', 'dl', 'rn', 'py', 'ts', 'node', 'containers', 'monitoring', 'api',
    // Generic role words: real skills elsewhere, but in a title they name the job.
    'data', 'engineer', 'engineering', 'developer', 'manager', 'management', 'analyst',
    'software', 'product', 'project', 'design', 'designer', 'marketing', 'sales',
    'operations', 'support', 'consultant', 'specialist', 'architect', 'scientist', 'research',
]);

/**
 * Known skills named in a job title ("Senior Python Developer"), as
 * { key, label } pairs so the UI can show the title's own wording.
 */
export function skillsInTitle(title) {
    const { known } = vocabulary();
    // Drop punctuation-only tokens ("-", "&") so "Engineer - AI" yields "AI", not "- AI".
    const words = String(title || '').toLowerCase().replace(/[()[\]|–—]/g, ' ').split(/[\s/,]+/).filter(w => /[a-z0-9]/.test(w));
    const found = new Map();
    for (let i = 0; i < words.length; i++) {
        if (FILLER_WORDS.has(words[i]) || AMBIGUOUS_TITLE_WORDS.has(words[i])) continue;
        const single = canonicalize(words[i]);
        if (single.length > 1 && known.has(single) && !LANGUAGE_SKILLS.has(single) && !found.has(single)) found.set(single, words[i]);
        if (i + 1 < words.length) {
            const pair = canonicalize(`${words[i]} ${words[i + 1]}`);
            if (known.has(pair) && !found.has(pair)) found.set(pair, `${words[i]} ${words[i + 1]}`);
        }
    }
    const originalWords = String(title || '').split(/[\s/,()[\]|–—]+/);
    const display = word => originalWords.find(w => w.toLowerCase() === word) ?? word;
    return [...found].map(([key, label]) => ({ key, label: label.split(' ').map(display).join(' ') }));
}
