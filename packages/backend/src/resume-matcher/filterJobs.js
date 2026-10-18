// ─── Resume Matcher — Candidate Selection ──────────────────────────────────────
//
// Step 2: chooses which jobs the AI scores. ~70ms of deterministic scoring,
// plus at most 2 embedding calls (1 once job vectors are cached).
//
// The shared fit engine (src/matching) scores every cached job against the
// profile — rarity-weighted skills, experience, seniority, role, preferences —
// and drops jobs whose German or visa requirement the candidate cannot meet.
// The best MAX_RESULTS by fit go on to Gemini.
//
// This replaced "filter, then keep the 50 NEWEST": with ~180 jobs passing the
// filters, a strong match only a few weeks old was never scored at all.

import { getAllJobs } from '../cache/index.js';
import { buildCandidate, feedbackMultiplier, isHidden, scoreJobFit } from '../matching/index.js';
import { applySemanticSelection } from './semanticSelection.js';

// Same AI budget as before: two Pass A batches of 25.
const MAX_RESULTS = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_COMPANY = 3;

/** "Software Engineer, Platform - Berlin, Germany (m/f/d)" → "software engineer, platform". */
function baseTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/\((?:[mwfdx]\s*\/\s*)+[mwfdx]\)|\(all genders?\)/g, '')
        .replace(/\s+[-–—|@]\s+[^-–—|@]*(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|düsseldorf|stuttgart|remote)[^-–—|@]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Selection-only nudge towards fresh postings: an old posting that is still
 * "active" (the feed holds some from years ago) rarely has a live hiring
 * process behind it. Does not change the score the user sees.
 */
function freshness(job) {
    const posted = new Date(job.PostedDate || job.scrapedAt || 0).getTime();
    if (!posted) return 0.95;
    const ageDays = (Date.now() - posted) / DAY_MS;
    if (ageDays <= 30) return 1;
    if (ageDays <= 90) return 0.95;
    if (ageDays <= 365) return 0.85;
    return 0.7;
}

/**
 * @param {object} profile  parsed profile; `_jobPreferences` is merged in by the orchestrator
 * @returns {{ jobs: object[], eligibleCount: number }}
 *   jobs: shallow copies carrying `_fit` (score, dimensions, missing skills),
 *   best fit first; eligibleCount: how many jobs passed the hard requirements
 *   and shared anything with the profile.
 */
export async function filterJobs(profile) {
    const candidate = buildCandidate(profile, profile._jobPreferences);
    const scored = [];

    const feedback = profile._feedback || null;
    for (const job of getAllJobs()) {
        if (isHidden(feedback, job)) continue;
        const fit = scoreJobFit(candidate, job);
        if (fit) scored.push({ ...job, _fit: fit, _selection: fit.score * freshness(job) * feedbackMultiplier(feedback, job) });
    }

    scored.sort((a, b) => b._selection - a._selection);

    // Meaning-based re-rank of the best candidates (fails open to the above).
    const ranked = await applySemanticSelection(profile, scored);

    // Diversity: the same role posted once per city ("Software Engineer,
    // Platform - Berlin / Hamburg / …") would otherwise fill the AI budget and
    // the results list with one opening. Keep the best-fitting copy of each
    // company + title, and at most MAX_PER_COMPANY jobs per company.
    const picked = [];
    const seenRoles = new Set();
    const perCompany = new Map();
    for (const job of ranked) {
        if (picked.length >= MAX_RESULTS) break;
        const company = String(job.Company || '').toLowerCase().trim();
        const role = `${company}|${baseTitle(job.JobTitle)}`;
        if (seenRoles.has(role)) continue;
        if ((perCompany.get(company) || 0) >= MAX_PER_COMPANY) continue;
        seenRoles.add(role);
        perCompany.set(company, (perCompany.get(company) || 0) + 1);
        picked.push(job);
    }
    return { jobs: picked, eligibleCount: scored.length };
}
