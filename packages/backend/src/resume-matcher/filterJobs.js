// ─── Resume Matcher — Hard Filter ──────────────────────────────────────────────
//
// Step 2: 0 AI calls, <50ms. Reads from RAM cache and applies hard filters.
// Uses german_level_detail and visa_sponsorship from parsedRequirements for
// smarter filtering when available.

import { getAllJobs } from '../cache/index.js';

const DOMAIN_TO_CATEGORIES = {
    'Software Engineering': ['software engineering', 'hardware & systems', 'cybersecurity', 'ai / ml', 'it & enterprise systems'],
    'Engineering':          ['software engineering', 'hardware & systems', 'cybersecurity', 'ai / ml', 'it & enterprise systems'],
    'Marketing':            ['marketing & growth', 'localization', 'solutions & pre-sales'],
    'Sales':                ['sales', 'solutions & pre-sales', 'customer success & support'],
    'Finance':              ['finance & accounting'],
    'HR':                   ['hr & people'],
    'Design':               ['design', 'gaming & entertainment'],
    'Data':                 ['data & analytics', 'ai / ml', 'research & clinical'],
    'Product':              ['product management'],
    'Operations':           ['operations & strategy', 'supply chain & manufacturing', 'retail & facilities', 'administration'],
    'Legal':                ['legal & compliance', 'trust & safety'],
    'Other':                [],
};

const GERMAN_SUFFICIENT = ['fluent', 'native', 'professional'];
const MIN_RESULTS_BEFORE_BROADENING = 20;
const MAX_RESULTS = 50; // Cap to 50 jobs (2 batches of 25) so Pass A runs in < 15s

/**
 * Checks if a job's German requirement is compatible with the candidate.
 * Uses parsedRequirements.german_level_detail when available for nuance,
 * falls back to the binary GermanRequired field.
 */
function isGermanCompatible(job, candidateGermanLevel) {
    const isGermanSufficient = GERMAN_SUFFICIENT.includes(candidateGermanLevel);

    // If candidate has fluent+ German, everything passes
    if (isGermanSufficient) return true;

    // Check parsedRequirements for nuance
    const detail = job.parsedRequirements?.german_level_detail?.toLowerCase() || '';

    // "nice to have" / "preferred" / "von Vorteil" = not a hard requirement
    if (detail.includes('nice to have') || detail.includes('preferred') ||
        detail.includes('von vorteil') || detail.includes('not mentioned')) {
        return true;
    }

    // If parsedRequirements says it's required (C1/B2/etc required/mandatory)
    if (detail.includes('required') || detail.includes('mandatory') ||
        detail.includes('erforderlich') || detail.includes('c1') || detail.includes('c2')) {
        return false;
    }

    // Fall back to binary GermanRequired field
    return !job.GermanRequired;
}

export function filterJobs(profile) {
    const allJobs = getAllJobs();

    const candidateGermanLevel = profile.languages
        ?.find(l => l.language?.toLowerCase() === 'german')?.proficiency || 'none';

    // 1. German + visa filter
    let filtered = allJobs.filter(job => {
        // German compatibility check
        if (!isGermanCompatible(job, candidateGermanLevel)) return false;

        // Visa filter: if candidate needs visa and job explicitly doesn't sponsor
        if (profile.visa_required === true && job.parsedRequirements?.visa_sponsorship === 'not_available') {
            return false;
        }

        return true;
    });

    // 2. Domain/category narrowing
    const matchingCategories = DOMAIN_TO_CATEGORIES[profile.domain] || [];
    if (matchingCategories.length > 0) {
        const categoryFiltered = filtered.filter(job => {
            const jobCat = (job.Category || '').toLowerCase().trim();
            return matchingCategories.some(cat => jobCat === cat || jobCat.startsWith(cat) || cat.startsWith(jobCat));
        });
        // Only apply if it doesn't reduce too much
        if (categoryFiltered.length >= MIN_RESULTS_BEFORE_BROADENING) {
            filtered = categoryFiltered;
        }
    }

    // 3. Cap at MAX_RESULTS, newest first
    if (filtered.length > MAX_RESULTS) {
        filtered.sort((a, b) => {
            const da = a.PostedDate ? new Date(a.PostedDate).getTime() : 0;
            const db = b.PostedDate ? new Date(b.PostedDate).getTime() : 0;
            return db - da;
        });
        filtered = filtered.slice(0, MAX_RESULTS);
    }

    return filtered;
}