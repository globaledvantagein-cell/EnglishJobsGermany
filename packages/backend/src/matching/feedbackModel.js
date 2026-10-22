// ─── Feedback Model ────────────────────────────────────────────────────────────
//
// Turns a user's match events into per-user ranking adjustments. Pure
// arithmetic — no AI.
//
// Signals and weights (positive = "more like this"):
//   apply +1.5 · save +1 · company_site +0.8 · view_job +0.5 · open +0.15
//   dismiss −1, aimed at the feature its reason names (the reason set mirrors
//   the "Tell us why it's not a fit" dialog of leading match products):
//     role          → category and title words ("not this industry / kind of role")
//     skills        → jobs requiring the skills this job asked for ("I don't have them")
//     seniority     → jobs at that seniority level
//     location      → city and workplace type
//     work_auth     → user needs sponsorship: hide "no sponsorship" jobs, demote unstated
//     company       → the whole company (hidden)
//     already_applied / not_real / other → that job only (hidden)
//   impression (shown at a list position) has weight 0: it is logged as
//   exposure data for a future learned ranker, not used here.
// Older events count less (30-day half-life).
//
// This is per-user online learning. The same events are the training data a
// learned ranker needs once there is enough of it (see db/matchFeedbackQueries).

import { expandSkill, skillName } from './skillVocabulary.js';

const ACTION_WEIGHT = { apply: 1.5, save: 1, company_site: 0.8, view_job: 0.5, open: 0.15, dismiss: -1 };
const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_MULTIPLIER = 0.55;
const MAX_MULTIPLIER = 1.25;

const TITLE_NOISE = new Set([
    'senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal', 'head', 'of', 'and', 'the', 'for',
    'm', 'f', 'd', 'w', 'x', 'mfd', 'mwd', 'all', 'genders', 'gn', 'in', 'at', 'with', 'a', 'an',
    'germany', 'berlin', 'munich', 'hamburg', 'remote', 'engineer', 'manager', 'specialist',
]);

export function titleWords(title) {
    return [...new Set(String(title || '').toLowerCase().split(/[^a-z0-9+#]+/).filter(t => t.length > 2 && !TITLE_NOISE.has(t)))];
}

export function levelOf(title, fallback) {
    const text = String(title || '').toLowerCase();
    if (/\b(head of|director|vp|chief)\b/.test(text)) return 'director';
    if (/\b(principal|staff|lead)\b/.test(text)) return 'lead';
    if (/\b(senior|sr\.?)\b/.test(text)) return 'senior';
    if (/\b(junior|jr\.?|graduate|entry|intern|praktikum|working student|werkstudent|trainee)\b/.test(text)) return 'entry';
    return String(fallback || 'mid').toLowerCase();
}

function requiredSkillKeys(job) {
    const keys = new Set();
    for (const entry of job.parsedRequirements?.required_skills ?? []) {
        const name = skillName(entry);
        if (name) for (const key of expandSkill(name)) keys.add(key);
    }
    return [...keys].slice(0, 30);
}

/** Feature snapshot stored with each event (and computed for live jobs). */
export function jobFeatures(job) {
    return {
        skills: requiredSkillKeys(job),
        visa: job.parsedRequirements?.visa_sponsorship || null,
        company: String(job.Company || '').toLowerCase().trim(),
        category: job.Category || null,
        titleWords: titleWords(job.JobTitle),
        workplace: String(job.filterWorkplace || job.WorkplaceType || '').toLowerCase() || null,
        city: String(job.Location || '').split(',')[0].trim().toLowerCase() || null,
        level: levelOf(job.JobTitle, job.ExperienceLevel),
    };
}

function bump(map, key, value) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + value);
}

/**
 * @param {Array<{ jobId: string, action: string, reason?: string, snapshot?: object, createdAt: Date }>} events
 * @param {Set<string>} [globallyFlagged] job ids hidden for everyone
 */
export function buildFeedbackProfile(events = [], globallyFlagged = new Set()) {
    const profile = {
        hiddenJobIds: new Set(globallyFlagged),
        hiddenCompanies: new Set(),
        category: new Map(),
        words: new Map(),
        workplace: new Map(),
        city: new Map(),
        level: new Map(),
        skillGaps: new Map(),
        needsSponsorship: false,
        eventCount: events.length,
    };

    const now = Date.now();
    for (const event of events) {
        const weight = ACTION_WEIGHT[event.action];
        if (weight == null) continue;
        const age = (now - new Date(event.createdAt).getTime()) / DAY_MS;
        const w = weight * Math.pow(0.5, Math.max(0, age) / HALF_LIFE_DAYS);
        const f = event.snapshot || {};

        if (event.action === 'dismiss') {
            profile.hiddenJobIds.add(String(event.jobId));
            switch (event.reason) {
                case 'company':
                    if (f.company) profile.hiddenCompanies.add(f.company);
                    break;
                case 'role':
                    bump(profile.category, f.category, w);
                    for (const word of f.titleWords || []) bump(profile.words, word, w / 2);
                    break;
                case 'seniority':
                    bump(profile.level, f.level, w);
                    break;
                case 'skills':
                    for (const key of f.skills || []) bump(profile.skillGaps, key, w);
                    break;
                case 'work_auth':
                    profile.needsSponsorship = true;
                    break;
                case 'location':
                    bump(profile.workplace, f.workplace, w);
                    bump(profile.city, f.city, w);
                    break;
                default:
                    break; // already_applied / not_real / other: the job alone
            }
            continue;
        }

        // Positive signals go to what makes the job specific: its category and
        // title words. Workplace type and level are shared by most jobs, so
        // boosting them made one save lift unrelated jobs (e.g. a Sales role).
        bump(profile.category, f.category, w);
        for (const word of f.titleWords || []) bump(profile.words, word, w / 3);
    }
    return profile;
}

/** Is this job hidden for the user (dismissed, blocked company, globally flagged)? */
export function isHidden(profile, job) {
    if (!profile) return false;
    if (profile.hiddenJobIds.has(String(job._id))) return true;
    if (profile.needsSponsorship && job.parsedRequirements?.visa_sponsorship === 'not_available') return true;
    return profile.hiddenCompanies.has(String(job.Company || '').toLowerCase().trim());
}

/** Squash an accumulated affinity into −1…1 so many events cannot run away. */
const squash = value => Math.tanh(value / 2);

/**
 * Ranking multiplier for one job, in [MIN_MULTIPLIER, MAX_MULTIPLIER].
 * 1 when the user has no relevant history.
 */
export function feedbackMultiplier(profile, job) {
    if (!profile || profile.eventCount === 0) return 1;
    const f = jobFeatures(job);
    const wordScores = f.titleWords.map(w => profile.words.get(w)).filter(v => v != null);
    const wordAffinity = wordScores.length ? wordScores.reduce((s, v) => s + v, 0) / wordScores.length : 0;

    // Skills the user said they lack: penalise jobs that require them.
    const gaps = f.skills.map(k => profile.skillGaps.get(k)).filter(v => v != null);
    const gapAffinity = gaps.length ? Math.min(...gaps) : 0;

    // Needs sponsorship: postings that do not mention it are a gamble.
    const visaPenalty = profile.needsSponsorship && f.visa !== 'available' ? -0.08 : 0;

    const adjustment =
        visaPenalty
        + 0.10 * squash(gapAffinity)
        + 0.12 * squash(profile.category.get(f.category) || 0)
        + 0.10 * squash(wordAffinity)
        + 0.08 * squash(profile.level.get(f.level) || 0)
        + 0.06 * squash(profile.workplace.get(f.workplace) || 0)
        + 0.06 * squash(profile.city.get(f.city) || 0);

    return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, 1 + adjustment * 2));
}
