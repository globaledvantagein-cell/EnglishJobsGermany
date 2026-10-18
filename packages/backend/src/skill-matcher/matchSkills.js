// ─── Skill Matcher (Today's Matches) ───────────────────────────────────────────
//
// Pure programmatic matching — no AI, no API calls. Every active job in the RAM
// cache is scored by the shared fit engine (src/matching), which rates skills
// (rarity-weighted, required vs optional), experience, seniority, role and
// preferences, and excludes jobs whose German or visa requirement the
// candidate cannot meet.
//
// On top of the fit score, this file decides WHICH good matches to show today:
//   - a candidate pool of the best POOL_MULTIPLIER × limit matches
//   - a date-seeded, score-weighted random draw from that pool, so the list
//     changes daily but stays relevant
//   - fresh postings are favoured; jobs shown in the previous list rarely repeat
//   - at most MAX_JOBS_PER_COMPANY results per company

import { getAllJobs } from '../cache/jobsCache.js';
import { FIT_VERSION, buildCandidate, feedbackMultiplier, isHidden, jobBadges, normalizeSkill, scoreJobFit } from '../matching/index.js';

const MAX_JOBS_PER_COMPANY = 2;
const POOL_MULTIPLIER = 6;
const MIN_PROFILE_SKILLS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Date-seeded tiebreaker ───────────────────────────────────────────────────
function dateSeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// The seed is mixed in AFTER the string hash (mixing it in first only shifts
// every hash by a constant and the daily order never changes), followed by a
// murmur3 finaliser so similar JobIDs don't get correlated values.
function hashForShuffle(str, seed) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    h = Math.imul(h ^ seed, 2654435761);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h | 0;
}

/** "Today's" matches should lean towards what is new. Ranking only, not the shown score. */
function freshnessBoost(job) {
    const posted = new Date(job.PostedDate || job.scrapedAt || 0).getTime();
    if (!posted) return 1;
    const ageDays = (Date.now() - posted) / DAY_MS;
    if (ageDays <= 7) return 1.12;
    if (ageDays <= 30) return 1;
    if (ageDays <= 90) return 0.93;
    return 0.85;
}

/**
 * @param {object} parsedProfile
 * @param {number} [limit=10]
 * @param {object} [opts]
 * @param {string[]} [opts.excludeIds]     JobIDs shown recently — pushed to the back.
 * @param {number}   [opts.seed]           Override the daily seed (e.g. Refresh).
 * @param {object}   [opts.jobPreferences] users.jobPreferences (work style, salary, visa).
 * @param {object}   [opts.feedback]       buildFeedbackProfile() of the user's match events.
 * @returns {{ matches: object[], meta: object }}
 */
export function getSkillMatches(parsedProfile, limit = 10, opts = {}) {
    if (!parsedProfile) {
        return { matches: [], meta: { reason: 'no_profile' } };
    }
    const profileSkills = parsedProfile.skills;
    if (!Array.isArray(profileSkills) || profileSkills.length === 0) {
        return { matches: [], meta: { reason: 'no_skills' } };
    }
    if (profileSkills.length < MIN_PROFILE_SKILLS) {
        return { matches: [], meta: { reason: 'too_few_skills', userSkillCount: profileSkills.length } };
    }

    let allJobs;
    try {
        allJobs = getAllJobs();
    } catch {
        return { matches: [], meta: { reason: 'cache_not_ready' } };
    }

    const candidate = buildCandidate(parsedProfile, opts.jobPreferences);
    if (candidate.skillCount === 0) {
        return { matches: [], meta: { reason: 'no_skills' } };
    }

    const seed = opts.seed ?? dateSeed();
    const recent = new Set((opts.excludeIds || []).map(String));
    const scored = [];
    let jobsWithRequirements = 0;
    let excluded = 0;

    for (const job of allJobs) {
        if (job.parsedRequirements) jobsWithRequirements++;
        if (isHidden(opts.feedback, job)) { excluded++; continue; }
        const fit = scoreJobFit(candidate, job);
        if (!fit) { excluded++; continue; }

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
            score:           fit.score,
            confidence:      fit.confidence,
            dimensions:      fit.dimensions,
            matchedSkills:   fit.matchedSkills,
            missingSkills:   fit.missingSkills,
            matchedCount:    fit.matchedSkills.length,
            totalSkillCount: fit.totalSkillCount,
            requiredCount:   fit.requiredCount,
            matchedRequired: fit.matchedRequired,
            skillsFromTitle: fit.skillsFromTitle,
            badges:          jobBadges(job),
            _rank:           fit.score * freshnessBoost(job) * feedbackMultiplier(opts.feedback, job),
            _tiebreaker:     hashForShuffle(String(job.JobID), seed),
        });
    }

    // Score-weighted random draw from the best matches (Efraimidis–Spirakis:
    // key = u^(1/weight)), seeded by the day — stable within a day, different
    // across days, and better matches stay more likely to be picked.
    scored.sort((a, b) => b._rank - a._rank);
    const pool = scored.slice(0, Math.max(limit * POOL_MULTIPLIER, 40));
    for (const job of pool) {
        const u = ((job._tiebreaker >>> 0) + 1) / 4294967297;
        let weight = Math.max(job._rank, 0.01);
        if (recent.has(String(job.JobID))) weight *= 0.05;
        job._key = Math.pow(u, 1 / weight);
    }
    pool.sort((a, b) => b._key - a._key);

    const matches = [];
    const companyCounts = new Map();
    for (const job of pool) {
        if (matches.length >= limit) break;
        const companyKey = normalizeSkill(job.Company) || 'unknown';
        const seenCount = companyCounts.get(companyKey) || 0;
        if (seenCount >= MAX_JOBS_PER_COMPANY) continue;
        companyCounts.set(companyKey, seenCount + 1);
        const { _tiebreaker, _key, _rank, ...rest } = job;
        matches.push(rest);
    }
    matches.sort((a, b) => b.score - a.score);

    return {
        matches,
        meta: {
            reason: matches.length === 0 ? 'no_matches' : 'ok',
            totalJobsScanned: allJobs.length,
            jobsWithRequirements,
            candidatesScored: scored.length,
            excludedOrUnrelated: excluded,
            userSkillCount: profileSkills.length,
            engine: FIT_VERSION,
        },
    };
}
