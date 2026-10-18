// ─── Job Fit ───────────────────────────────────────────────────────────────────
//
// Deterministic (no AI, no API calls) fit between one candidate profile and one
// job. Shared by Today's Matches, which ranks with it directly, and Smart
// Match, which uses it to choose the candidates the AI scores.
//
// The dimensions mirror the ones job-match products publicly describe
// (skills, experience, seniority, industry/role, preferences + gaps):
//
//   skills       rarity-weighted coverage of required (80%) and optional (20%) skills
//   experience   candidate years vs the posting's min/max years
//   seniority    level gap, asymmetric: one level of stretch is fine
//   role         title + domain alignment with the candidate's own roles
//   preferences  work style and salary vs the candidate's stated preferences
//
// A dimension with no data is null and simply leaves the weighted average —
// unknown is never scored as bad. Hard requirements (German level, visa) are
// exclusions, not low scores.

import { expandSkill, isLanguageSkill, skillName, skillsInTitle, skillWeight } from './skillVocabulary.js';

export const FIT_VERSION = 'fit-v4';

const WEIGHTS = { skills: 0.4, role: 0.25, seniority: 0.17, experience: 0.1, preferences: 0.08 };

// Value used when a dimension cannot be measured for a job. Unknown must not
// count as a perfect fit (the first version renormalised unknowns away, so a
// title-only match outranked jobs with real skill evidence), nor as a miss.
const PRIORS = { skills: 0.35, role: 0.5, seniority: 0.7, experience: 0.75, preferences: 0.7 };

// Skill coverage is shrunk towards the prior by this many pseudo-skills, so a
// posting that lists two skills cannot reach 80% on a single generic match.
const SKILL_SMOOTHING = 2;

const LEVEL_RANK = {
    intern: 0, entry: 0, junior: 0, graduate: 0,
    mid: 1, midlevel: 1, intermediate: 1, regular: 1,
    senior: 2,
    lead: 3, staff: 3, principal: 3, manager: 3,
    head: 4, director: 4,
    executive: 5, vp: 5, clevel: 5,
};

const GERMAN_SUFFICIENT = new Set(['fluent', 'native', 'professional', 'c1', 'c2', 'b2', 'business', 'upperintermediate']);

const TITLE_STOPWORDS = new Set([
    'senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal', 'head', 'of', 'and', 'the', 'for',
    'm', 'f', 'd', 'w', 'x', 'mfd', 'mwd', 'fmd', 'all', 'genders', 'gn', 'remote', 'germany',
    'berlin', 'munich', 'hamburg', 'i', 'ii', 'iii', 'iv', 'team', 'in', 'at', 'with', 'a', 'an',
    'working', 'student', 'intern', 'internship', 'mid', 'level', 'entry',
]);

function levelRank(level) {
    if (!level) return null;
    const key = String(level).toLowerCase().replace(/[^a-z]/g, '');
    return LEVEL_RANK[key] ?? null;
}

/** Seniority words in a title outrank a stored level (often a default "Mid"). */
function levelFromTitle(title) {
    const text = String(title || '').toLowerCase();
    if (/\b(vp|vice president|chief|cto|ceo)\b/.test(text)) return 5;
    if (/\b(head of|director)\b/.test(text)) return 4;
    if (/\b(principal|staff|lead|manager)\b/.test(text)) return 3;
    if (/\b(senior|sr\.?)\b/.test(text)) return 2;
    if (/\b(junior|jr\.?|graduate|entry|intern|working student|werkstudent|trainee)\b/.test(text)) return 0;
    return null;
}

function titleTokens(title) {
    return new Set(String(title || '').toLowerCase().split(/[^a-z0-9+#]+/).filter(t => t.length > 1 && !TITLE_STOPWORDS.has(t)));
}

// ── Candidate side (computed once per request) ──────────────────────────────

/**
 * @param {object} parsedProfile  users.parsedProfile
 * @param {object} [jobPreferences] users.jobPreferences
 */
export function buildCandidate(parsedProfile, jobPreferences = null) {
    const skillKeys = new Set();
    for (const entry of parsedProfile?.skills ?? []) {
        const name = skillName(entry);
        if (!name || isLanguageSkill(name)) continue;
        for (const key of expandSkill(name)) skillKeys.add(key);
    }
    // Technologies listed under experience are skills the candidate has used.
    for (const role of parsedProfile?.experience ?? []) {
        for (const tech of role?.technologies ?? []) {
            if (tech && !isLanguageSkill(tech)) for (const key of expandSkill(tech)) skillKeys.add(key);
        }
    }

    const recentRoles = (parsedProfile?.experience ?? []).slice(0, 3).map(r => r?.title).filter(Boolean);
    const roleTokens = new Set();
    for (const title of recentRoles) for (const token of titleTokens(title)) roleTokens.add(token);
    for (const token of titleTokens(parsedProfile?.sub_domain)) roleTokens.add(token);

    const german = (parsedProfile?.languages ?? []).find(l => /german|deutsch/i.test(l?.language || ''));
    const germanLevel = String(german?.proficiency || 'none').toLowerCase();

    return {
        skillKeys,
        skillCount: skillKeys.size,
        years: typeof parsedProfile?.total_experience_years === 'number' ? parsedProfile.total_experience_years : null,
        level: levelRank(parsedProfile?.seniority_level),
        domain: String(parsedProfile?.domain || '').toLowerCase(),
        roleTokens,
        hasGerman: GERMAN_SUFFICIENT.has(germanLevel.replace(/[^a-z0-9]/g, '')) || /b2|c1|c2|fluent|native|professional|business/.test(germanLevel),
        needsVisa: parsedProfile?.visa_required === true || ['needs_sponsorship', 'requires_sponsorship'].includes(jobPreferences?.visa_status),
        workStyle: jobPreferences?.preferred_work_style || (parsedProfile?.open_to_remote ? 'remote' : null),
        salaryMin: Number(jobPreferences?.salary_min) || null,
        salaryMax: Number(jobPreferences?.salary_max) || null,
    };
}

// ── Hard requirements ─────────────────────────────────────────────────────

/** Returns a reason string when the job must be excluded, else null. */
export function exclusionReason(candidate, job) {
    const req = job.parsedRequirements;
    if (!candidate.hasGerman) {
        const detail = String(req?.german_level_detail || '').toLowerCase();
        const optional = /nice to have|preferred|plus|von vorteil|not mentioned|not required/.test(detail);
        const required = /required|mandatory|erforderlich|fluent|c1|c2|b2/.test(detail);
        if (required && !optional) return 'german_required';
        const germanSkillRequired = (req?.required_skills ?? []).some(s => /^(german|deutsch)/i.test(skillName(s) || ''));
        if (germanSkillRequired && !optional) return 'german_required';
    }
    if (candidate.needsVisa && req?.visa_sponsorship === 'not_available') return 'no_visa_sponsorship';
    return null;
}

// ── Dimensions ───────────────────────────────────────────────────────────────

function skillsDimension(candidate, job) {
    const req = job.parsedRequirements;
    const groups = [
        { items: req?.required_skills, base: 3, required: true },
        { items: req?.preferred_skills, base: 1, required: false },
        { items: req?.tools_and_platforms, base: 1, required: false },
    ];

    let reqMax = 0, reqHit = 0, optMax = 0, optHit = 0;
    const matched = [], missing = [];
    const seen = new Set();
    let requiredCount = 0, matchedRequired = 0;

    for (const group of groups) {
        for (const entry of Array.isArray(group.items) ? group.items : []) {
            const name = skillName(entry);
            if (!name || isLanguageSkill(name) || name.split(/\s+/).length > 6) continue;
            const keys = expandSkill(name);
            if (keys.length === 0 || keys.some(k => seen.has(k))) continue;
            keys.forEach(k => seen.add(k));

            const weight = group.base * Math.max(...keys.map(skillWeight));
            const hit = keys.some(k => candidate.skillKeys.has(k));
            if (group.required) { reqMax += weight; requiredCount++; } else { optMax += weight; }
            if (hit) {
                if (group.required) { reqHit += weight; matchedRequired++; } else { optHit += weight; }
                matched.push(name);
            } else {
                missing.push({ name, weight, required: group.required });
            }
        }
    }

    // No structured requirements: fall back to skills named in the title,
    // e.g. "Senior Python Engineer". Weaker evidence, so the result is capped.
    if (reqMax + optMax === 0) {
        const titleSkills = skillsInTitle(job.JobTitle);
        if (titleSkills.length === 0) return null;
        const hits = titleSkills.filter(s => candidate.skillKeys.has(s.key));
        const coverage = hits.length / titleSkills.length;
        return {
            // Weak evidence: blend heavily towards the prior.
            score: (coverage * titleSkills.length + PRIORS.skills * (SKILL_SMOOTHING + 1)) / (titleSkills.length + SKILL_SMOOTHING + 1),
            matched: hits.map(s => s.label),
            missing: titleSkills.filter(s => !candidate.skillKeys.has(s.key)).map(s => s.label),
            requiredCount: null,
            matchedRequired: null,
            totalCount: titleSkills.length,
            fromTitle: true,
        };
    }

    const reqScore = reqMax > 0 ? reqHit / reqMax : null;
    const optScore = optMax > 0 ? optHit / optMax : null;
    const coverage = reqScore != null && optScore != null ? reqScore * 0.8 + optScore * 0.2 : (reqScore ?? optScore);
    const evidence = seen.size;
    const score = (coverage * evidence + PRIORS.skills * SKILL_SMOOTHING) / (evidence + SKILL_SMOOTHING);

    missing.sort((a, b) => Number(b.required) - Number(a.required) || b.weight - a.weight);
    return {
        score,
        matched,
        missing: missing.map(m => m.name),
        requiredCount,
        matchedRequired,
        totalCount: seen.size === 0 ? 0 : matched.length + missing.length,
        fromTitle: false,
    };
}

function experienceDimension(candidate, job) {
    const min = job.parsedRequirements?.min_experience_years;
    const max = job.parsedRequirements?.max_experience_years;
    if (candidate.years == null || (min == null && max == null)) return null;
    if (min != null && candidate.years < min) return Math.max(0, 1 - 0.22 * (min - candidate.years));
    if (max != null && candidate.years > max + 3) return 0.75; // clearly overqualified
    return 1;
}

function seniorityDimension(candidate, job) {
    const jobLevel = levelFromTitle(job.JobTitle) ?? levelRank(job.parsedRequirements?.experience_level) ?? levelRank(job.ExperienceLevel);
    if (candidate.level == null || jobLevel == null) return null;
    const gap = jobLevel - candidate.level; // positive = job is more senior
    if (gap === 0) return 1;
    if (gap === 1) return 0.75;   // a stretch role: plausible
    if (gap === -1) return 0.8;   // a step down: plausible
    if (Math.abs(gap) === 2) return 0.25;
    return 0.05;
}

function roleDimension(candidate, job) {
    const jobTokens = titleTokens(job.JobTitle);
    let titleScore = null;
    if (candidate.roleTokens.size > 0 && jobTokens.size > 0) {
        let overlap = 0;
        for (const token of jobTokens) if (candidate.roleTokens.has(token)) overlap++;
        titleScore = Math.min(1, overlap / Math.min(jobTokens.size, 3));
    }

    let domainScore = null;
    if (candidate.domain) {
        const category = String(job.Category || '').toLowerCase();
        const domain = String(job.Domain || '').toLowerCase();
        const techCandidate = /software|engineering|data|product|it|security|ai/.test(candidate.domain);
        // Category (28 curated buckets) beats Domain, a coarse AI label that marks
        // e.g. a sales role at an AI company as "technical".
        const techJob = category
            ? /software|data|ai \/ ml|cyber|it & enterprise|hardware|engineering/.test(category)
            : domain === 'technical';
        if (category && (category.includes(candidate.domain) || candidate.domain.includes(category.split(' ')[0]))) domainScore = 1;
        else if (techCandidate === techJob) domainScore = 0.65;
        else domainScore = 0.25;
    }

    if (titleScore == null && domainScore == null) return null;
    const value = titleScore == null ? domainScore : domainScore == null ? titleScore : titleScore * 0.6 + domainScore * 0.4;
    return { value, crossDomain: domainScore != null && domainScore < 0.5 && (titleScore ?? 0) < 0.5 };
}

function preferencesDimension(candidate, job) {
    const parts = [];
    if (candidate.workStyle) {
        const jobStyle = job.filterWorkplace || ({ fully_remote: 'remote', hybrid: 'hybrid', on_site: 'onsite' })[job.parsedRequirements?.remote_policy_detail] || null;
        const want = String(candidate.workStyle).replace('on_site', 'onsite').replace('fully_remote', 'remote');
        if (jobStyle) parts.push(jobStyle === want ? 1 : (want === 'hybrid' || jobStyle === 'hybrid') ? 0.6 : 0.2);
    }
    if (candidate.salaryMin) {
        const jobMax = job.filterSalaryMax ?? job.SalaryMax ?? job.parsedRequirements?.salary_max;
        const interval = job.filterSalaryInterval ?? job.parsedRequirements?.salary_interval;
        if (jobMax && (!interval || /year/.test(interval))) parts.push(jobMax >= candidate.salaryMin ? 1 : Math.max(0, jobMax / candidate.salaryMin - 0.2));
    }
    if (parts.length === 0) return null;
    return parts.reduce((s, p) => s + p, 0) / parts.length;
}

// ── Combined ─────────────────────────────────────────────────────────────────

/**
 * Score one job for a candidate. Returns null when the job is excluded by a
 * hard requirement or shares nothing with the profile.
 */
export function scoreJobFit(candidate, job) {
    if (exclusionReason(candidate, job)) return null;

    const skills = skillsDimension(candidate, job);
    const role = roleDimension(candidate, job);
    const dimensions = {
        skills: skills?.score ?? null,
        experience: experienceDimension(candidate, job),
        seniority: seniorityDimension(candidate, job),
        role: role?.value ?? null,
        preferences: preferencesDimension(candidate, job),
    };

    // Relevance gate: something concrete must connect profile and job.
    const relevant = (skills && skills.matched.length > 0) || (dimensions.role != null && dimensions.role >= 0.6);
    if (!relevant) return null;

    let score = 0, knownWeight = 0;
    for (const [key, value] of Object.entries(dimensions)) {
        score += WEIGHTS[key] * (value ?? PRIORS[key]);
        if (value != null) knownWeight += WEIGHTS[key];
    }
    // Engineer ↔ sales-style mismatches with no title overlap.
    if (role?.crossDomain) score *= 0.75;
    // Two or more levels above the candidate (Entry → Senior) is rarely a
    // realistic application, however good the skill overlap.
    const jobLevel = levelFromTitle(job.JobTitle) ?? levelRank(job.parsedRequirements?.experience_level) ?? levelRank(job.ExperienceLevel);
    if (candidate.level != null && jobLevel != null && jobLevel - candidate.level >= 2) score *= 0.85;

    // Share of the total weight backed by real data (shown, and used by callers).
    const confidence = knownWeight / Object.values(WEIGHTS).reduce((s, w) => s + w, 0);

    return {
        score,
        confidence,
        dimensions,
        matchedSkills: skills?.matched ?? [],
        missingSkills: (skills?.missing ?? []).slice(0, 8),
        requiredCount: skills?.requiredCount ?? null,
        matchedRequired: skills?.matchedRequired ?? null,
        totalSkillCount: skills?.totalCount ?? 0,
        skillsFromTitle: Boolean(skills?.fromTitle),
    };
}
