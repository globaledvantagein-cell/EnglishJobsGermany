// ─── Domain Classification (derived from Department + Title, no AI needed) ──

// Re-export categorizeJob + label maps so callers can import from one place.
export { categorizeJob, CATEGORY_LABELS, CATEGORY_ORDER, ALL_CATEGORIES } from './categorize.js';
import { seniorityFromTitle } from '../utils/filterNormalizer.js';

export const TECHNICAL_KEYWORDS = [
    'engineering', 'software', 'data', 'ai', 'machine learning', 'devops',
    'infrastructure', 'platform', 'backend', 'frontend', 'fullstack',
    'full-stack', 'full stack', 'mobile', 'ios', 'android', 'web',
    'cloud', 'security', 'cybersecurity', 'infosec', 'it', 'sre',
    'reliability', 'qa', 'quality assurance', 'test', 'automation',
    'architect', 'systems', 'network', 'database', 'analytics',
    'bi', 'intelligence', 'research', 'science', 'ml', 'deep learning',
    'computer vision', 'nlp', 'robotics', 'firmware', 'embedded',
    'hardware', 'electronic', 'technical', 'technology', 'development',
    'developer', 'programmer', 'implementation', 'integration',
    'solutions engineer', 'technical account', 'support engineer',
    'professional services', 'devrel', 'developer relations',
    'site reliability', 'devsecops', 'secops', 'mlops', 'dataops',
    'release', 'build', 'ci/cd', 'pipeline',
];

export function deriveDomain(department, jobTitle) {
    const combined = `${department || ''} ${jobTitle || ''}`.toLowerCase();
    return TECHNICAL_KEYWORDS.some(kw => combined.includes(kw)) ? 'Technical' : 'Non-Technical';
}

// Title seniority has one definition: seniorityFromTitle() in the filter
// normalizer, so the stored ExperienceLevel and the filter can never disagree.
const LEVEL_LABEL = { entry: 'Entry', senior: 'Senior', lead: 'Lead', executive: 'Executive' };

export function deriveExperienceLevelFromTitle(title) {
    return LEVEL_LABEL[seniorityFromTitle(title)] || 'Mid';
}

export function deriveIsEntryLevelFromTitle(title) {
    return seniorityFromTitle(title) === 'entry';
}

export function inferAtsPlatform(siteConfig) {
    const name = String(siteConfig?.siteName || '').toLowerCase();
    if (name.includes('greenhouse')) return 'greenhouse';
    if (name.includes('ashby')) return 'ashby';
    if (name.includes('lever')) return 'lever';
    return 'unknown';
}

export function normalizeSalaryValues(mappedJob) {
    let { SalaryMin, SalaryMax, SalaryInterval } = mappedJob;

    if (SalaryMin == null && SalaryMax == null) return;

    const normalizedInterval = String(SalaryInterval || '').toLowerCase();
    const isAnnual = !normalizedInterval || normalizedInterval === 'per-year-salary' || normalizedInterval === 'yearly' || normalizedInterval === 'year';

    if (isAnnual) {
        if (SalaryMin != null && SalaryMin > 0 && SalaryMin < 1000) {
            mappedJob.SalaryMin = SalaryMin * 1000;
        }
        if (SalaryMax != null && SalaryMax > 0 && SalaryMax < 1000) {
            mappedJob.SalaryMax = SalaryMax * 1000;
        }
    }

    const isMonthly = normalizedInterval === 'per-month-salary' || normalizedInterval === 'monthly';
    if (isMonthly) {
        if (SalaryMin != null && SalaryMin > 0 && SalaryMin < 100) {
            mappedJob.SalaryMin = SalaryMin * 1000;
        }
        if (SalaryMax != null && SalaryMax > 0 && SalaryMax < 100) {
            mappedJob.SalaryMax = SalaryMax * 1000;
        }
    }

    if ((mappedJob.SalaryMin === 0 || mappedJob.SalaryMin == null)
        && (mappedJob.SalaryMax === 0 || mappedJob.SalaryMax == null)) {
        mappedJob.SalaryMin = null;
        mappedJob.SalaryMax = null;
        mappedJob.SalaryCurrency = null;
        mappedJob.SalaryInterval = null;
    }
}

export function normalizeArray(values) {
    return Array.isArray(values)
        ? [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]
        : [];
}

export function isSpamOrIrrelevant(title, BANNED_ROLES) {
    const lowerTitle = title.toLowerCase();
    return BANNED_ROLES.some(role => lowerTitle.includes(role));
}