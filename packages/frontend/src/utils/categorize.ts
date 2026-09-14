/**
 * Frontend Category constants — labels, display order, URL slugs.
 *
 * Classification itself runs ON THE BACKEND (job-Data/src/core/categorizer/),
 * where Gemma assigns one of 28 categories at scrape time and stores it in the
 * Category field. The frontend just sends `?category=X` to the API and reads
 * the field off results.
 *
 * MUST stay in step with job-Data/src/core/categorizer/index.js CATEGORIES and
 * job-Data/src/core/categorize/index.js CATEGORY_ORDER.
 *
 * Counts come from GET /api/jobs/category-counts.
 */

export const CATEGORIES = [
  'Software Engineering',
  'Sales',
  'Operations & Strategy',
  'Marketing & Growth',
  'Finance & Accounting',
  'Hardware & Systems',
  'Customer Success & Support',
  'Data & Analytics',
  'Supply Chain & Manufacturing',
  'Retail & Facilities',
  'Product Management',
  'AI / ML',
  'Solutions & Pre-Sales',
  'HR & People',
  'IT & Enterprise Systems',
  'Legal & Compliance',
  'Cybersecurity',
  'Education & Training',
  'Design',
  'Research & Clinical',
  'Consulting',
  'Domain Specialist',
  'Localization',
  'Administration',
  'Gaming & Entertainment',
  'Trust & Safety',
  'Other / General Business',
  'Other / Open Application',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * The AI writes human-readable names, so a category IS its own label. Kept as a
 * map because callers look labels up by key; see getCategoryLabel() for the
 * lookup that also survives legacy values.
 */
export const CATEGORY_LABELS: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c, c]),
) as Record<Category, string>;

/**
 * Display order — roughly highest-volume first, catch-alls last. Mirrors
 * CATEGORY_ORDER on the backend so the dropdown, footer and sitemap agree.
 */
export const CATEGORY_ORDER: Category[] = [
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

/** The 12 shown on the homepage grid — all 28 would swamp it. */
export const HOME_CATEGORIES: Category[] = CATEGORY_ORDER.slice(0, 12);

// ─── URL slugs ──────────────────────────────────────────────────────────────
//
// Category VALUES contain spaces, "&" and "/" ("Customer Success & Support"),
// so they cannot be URL path segments. Routes use a slug instead:
//
//   'Software Engineering'       → 'software-engineering'
//   'AI / ML'                    → 'ai-ml'
//   'Customer Success & Support' → 'customer-success-support'
//
// The API still expects the FULL NAME in ?category= — the backend validates
// against its own 28 values. Use categorySlug() for hrefs and
// categoryFromSlug() when reading a route param.

export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[&/]/g, ' ')      // drop separators before collapsing
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** slug → canonical category name. Built once; O(1) lookups. */
const SLUG_TO_CATEGORY: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [categorySlug(c), c]),
) as Record<string, Category>;

export const CATEGORY_SLUGS: string[] = CATEGORY_ORDER.map(categorySlug);

/** Resolve a URL slug back to its category name, or null if unknown. */
export function categoryFromSlug(slug: string): Category | null {
  return SLUG_TO_CATEGORY[slug] ?? null;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

// ─── Legacy values ──────────────────────────────────────────────────────────
//
// Jobs the AI categorizer has not reached yet still carry one of the old 6
// slugs, and saved user preferences may too. Mirrors LEGACY_CATEGORY_MAP in
// job-Data/src/core/categorize/index.js.
const LEGACY_CATEGORY_MAP: Record<string, Category> = {
  software: 'Software Engineering',
  data: 'Data & Analytics',
  product_tech: 'Product Management',
  other_tech: 'IT & Enterprise Systems',
  product_nontech: 'Product Management',
  other_nontech: 'Other / General Business',
  'Data / AI': 'Data & Analytics',
  'Product (Tech)': 'Product Management',
  'Other Technical': 'IT & Enterprise Systems',
  'Product (Non-Tech)': 'Product Management',
  'Other Non-Technical': 'Other / General Business',
};

/**
 * Display label for any Category value found on a job, including legacy ones.
 *
 * A plain CATEGORY_LABELS[value] lookup returns undefined for a job still
 * holding 'software', which renders as a blank chip. This maps such values
 * forward and falls back to the raw string rather than showing nothing.
 */
export function getCategoryLabel(value?: string | null): string | null {
  if (!value) return null;
  if (isCategory(value)) return value;
  return LEGACY_CATEGORY_MAP[value] ?? value;
}
