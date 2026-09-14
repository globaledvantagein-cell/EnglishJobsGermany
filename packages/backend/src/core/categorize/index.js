/**
 * Job category classifier — 6 buckets total.
 *
 * Top-level:    Technical | Non-Technical
 * Sub-buckets:
 *   Technical:     software | data | product_tech | other_tech
 *   Non-Technical: product_nontech | other_nontech
 *
 * Cascade order (first match wins):
 *   1. OVERRIDES — manual patches for known leaks
 *   2. TITLE keywords — strongest signal (Non-Tech/Marketing first, then Data,
 *      then Software, then Product)
 *   3. SUBDOMAIN keywords — backup when title is vague
 *   4. DOMAIN field — coarse fallback
 *   5. PRODUCT split — if a job lands in Product, split into product_tech vs
 *      product_nontech using Domain + SubDomain + Tags
 *
 * Pure function. Run once at scrape time, store result in MongoDB Category field.
 */
import {
    NONTECH_TITLE_KW,
    DATA_TITLE_KW,
    SOFTWARE_TITLE_KW,
    PRODUCT_TITLE_KW,
    DATA_SUBDOMAIN_KW,
    SOFTWARE_SUBDOMAIN_KW,
    PRODUCT_SUBDOMAIN_KW,
    OVERRIDES,
} from './keywords.js';

import { CATEGORIES } from '../categorizer/index.js';

// ─── Canonical category set ────────────────────────────────────────────────
//
// These are now the 28 values the AI categorizer writes, not the old 6 slugs.
// Everything that validates or displays a Category reads from here, so this
// must stay exactly in step with core/categorizer/CATEGORIES.

export const ALL_CATEGORIES = CATEGORIES;

// The AI writes human-readable names, so a category IS its own label. The map
// is kept because callers (digest emails, subscription confirmation) look
// labels up by key and would otherwise all need rewriting.
export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c, c]));

// Display order for the frontend dropdown and the digest's category blocks —
// roughly highest-volume first, with the two catch-alls last.
export const CATEGORY_ORDER = [
    'Software Engineering',
    'Sales',
    'Operations & Strategy',
    'Marketing & Growth',
    'Finance & Accounting',
    'Customer Success & Support',
    'Data & Analytics',
    'Product Management',
    'HR & People',
    'Consulting',
    'IT & Enterprise Systems',
    'Design',
    'Solutions & Pre-Sales',
    'AI / ML',
    'Hardware & Systems',
    'Supply Chain & Manufacturing',
    'Cybersecurity',
    'Legal & Compliance',
    'Research & Clinical',
    'Education & Training',
    'Retail & Facilities',
    'Domain Specialist',
    'Trust & Safety',
    'Localization',
    'Administration',
    'Gaming & Entertainment',
    'Other / General Business',
    'Other / Open Application',
];

// ─── Legacy migration ──────────────────────────────────────────────────────
//
// Existing data still carries the old 6 slugs: users' saved desiredCategories,
// and any job document not yet touched by the AI categorizer. Mapping them
// forward means an existing subscriber keeps receiving a digest instead of
// silently matching nothing.
export const LEGACY_CATEGORY_MAP = {
    // slugs (what categorizeJobFallback returns)
    software:        'Software Engineering',
    data:            'Data & Analytics',
    product_tech:    'Product Management',
    other_tech:      'IT & Enterprise Systems',
    product_nontech: 'Product Management',
    other_nontech:   'Other / General Business',
    // old display labels, in case a document stored the label
    'Data / AI':           'Data & Analytics',
    'Product (Tech)':      'Product Management',
    'Other Technical':     'IT & Enterprise Systems',
    'Product (Non-Tech)':  'Product Management',
    'Other Non-Technical': 'Other / General Business',
    // 'Software Engineering' exists in both sets and needs no mapping
};

/**
 * Normalize any stored category value to one of the current 28.
 * Already-current values pass through; unknown values return null so callers
 * can drop them rather than filter on something that matches nothing.
 */
export function mapLegacyCategory(value) {
    if (typeof value !== 'string') return null;
    if (ALL_CATEGORIES.includes(value)) return value;
    return LEGACY_CATEGORY_MAP[value] || null;
}

/** Map an array of possibly-legacy values, dropping unknowns and duplicates. */
export function mapLegacyCategories(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(mapLegacyCategory).filter(Boolean))];
}

// ─── Helpers ───────────────────────────────────────────────────────────

function lower(s) {
    return (s ?? '').toString().toLowerCase();
}

function pad(s) {
    return ` ${s} `;
}

function anyMatch(haystack, keywords) {
    for (const kw of keywords) {
        if (haystack.includes(kw)) return true;
    }
    return false;
}

/**
 * Classify one job into one of the 6 Category buckets — KEYWORD FALLBACK.
 *
 * Superseded by the Gemma classifier in core/categorizer/, which resolves 28
 * categories instead of 6. Kept as the fallback for when Gemma is unreachable
 * (every key dead, or the daily budget spent): a coarse category beats none.
 *
 * NOTE: returns a SLUG ('software'), not a display label.
 *
 * Expected fields (all optional except domain hint):
 *   JobTitle, Department, SubDomain, Domain ('Technical'|'Non-Technical'), Tags
 *
 * Returns one of CATEGORY_ORDER values, never null/undefined.
 */
export function categorizeJobFallback(job) {
    if (!job) return 'other_nontech';

    const title = pad(lower(job.JobTitle));
    const subdomain = pad(lower(job.SubDomain));
    const department = pad(lower(job.Department));

    // LAYER 1: Manual overrides
    for (const ov of OVERRIDES) {
        if (title.includes(ov.pattern.toLowerCase())) {
            return ov.category;
        }
    }

    // LAYER 2: Title keywords
    if (anyMatch(title, NONTECH_TITLE_KW)) return 'other_nontech';
    if (anyMatch(title, DATA_TITLE_KW))    return 'data';
    if (anyMatch(title, SOFTWARE_TITLE_KW)) return 'software';
    if (anyMatch(title, PRODUCT_TITLE_KW)) return splitProduct(job);

    // LAYER 3: SubDomain keywords
    if (anyMatch(subdomain, DATA_SUBDOMAIN_KW))     return 'data';
    if (anyMatch(subdomain, SOFTWARE_SUBDOMAIN_KW)) return 'software';
    if (anyMatch(subdomain, PRODUCT_SUBDOMAIN_KW))  return splitProduct(job);

    // Also try Department field as a last keyword check
    if (anyMatch(department, SOFTWARE_SUBDOMAIN_KW)) return 'software';
    if (anyMatch(department, DATA_SUBDOMAIN_KW))     return 'data';

    // LAYER 4: Domain fallback
    return job.Domain === 'Technical' ? 'other_tech' : 'other_nontech';
}

/**
 * Decide if a Product role is Tech-PM or Non-Tech-PM.
 */
function splitProduct(job) {
    if (job.Domain === 'Technical')     return 'product_tech';
    if (job.Domain === 'Non-Technical') return 'product_nontech';

    // Domain missing — check SubDomain for tech hints
    const subdomain = lower(job.SubDomain);
    if (anyMatch(subdomain, SOFTWARE_SUBDOMAIN_KW.concat(DATA_SUBDOMAIN_KW))) {
        return 'product_tech';
    }

    // Last resort — check tags
    const tagsStr = (Array.isArray(job.Tags) ? job.Tags : []).join(' ').toLowerCase();
    if (anyMatch(tagsStr, ['engineering', 'software', 'cloud', 'platform', 'data', 'ai'])) {
        return 'product_tech';
    }

    return 'product_nontech';
}

// Back-compat alias. Existing importers (saveQueries, adminReanalysis,
// backfill-categories) still call categorizeJob and keep the old behaviour
// until they are migrated to the AI categorizer.
export { categorizeJobFallback as categorizeJob };
