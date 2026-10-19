// ─── Company facet key ───────────────────────────────────────────────────────
//
// One company can reach us under several legal-entity spellings — measured
// 2026-10-20: "Databricks GmbH" (21) | "Databricks B.V." (1) | "Databricks, Inc."
// (1); "Westwing Group SE" | "Westwing GmbH"; "KNIME AG" | "KNIME GmbH". Keyed by
// the raw string, the company filter listed each as a separate company and a
// pick of one silently dropped the others' jobs. LinkedIn's company filter shows
// one entry per company, so the facet is keyed by this normalized form and
// displayed under the spelling with the most jobs.
//
// Deliberately NOT stripped: "Deutschland", "International", "Europe" — those
// can genuinely distinguish separate entities.

const LEGAL_SUFFIX = /\b(gmbh|ag|se|kgaa|kg|ohg|gbr|ug|mbh|e\.?\s?v|inc|ltd|limited|llc|plc|corp|corporation|sarl|sas|b\.?\s?v|n\.?\s?v|s\.?\s?a|s\.?\s?l|s\.?\s?r\.?\s?l|a\.?\s?s|oy|ab|group|holding)\b\.?/g;

/**
 * Normalized facet key for a company name; '_null' when empty.
 * "Databricks, Inc." and "Databricks GmbH" both → "databricks".
 */
export function companyKey(name) {
    const raw = String(name ?? '').trim();
    if (!raw) return '_null';
    const key = raw.toLowerCase()
        .replace(/&\s*co\.?\s*(kgaa|kg|ohg)\b/g, ' ')
        .replace(/&/g, ' and ')
        .replace(LEGAL_SUFFIX, ' ')
        .replace(/[^a-z0-9äöüß]+/g, '');
    // A name made only of suffixes ("AG") keeps its own lowercase form.
    return key || raw.toLowerCase();
}

/**
 * Tracks how often each spelling appears per key, so the dropdown shows the
 * most common one. Counts move with add/remove, so the label stays right as
 * jobs come and go.
 */
export function createSpellingTracker() {
    const spellings = new Map(); // key → Map(spelling → count)
    return {
        add(key, spelling) {
            if (!spellings.has(key)) spellings.set(key, new Map());
            const counts = spellings.get(key);
            counts.set(spelling, (counts.get(spelling) || 0) + 1);
        },
        remove(key, spelling) {
            const counts = spellings.get(key);
            if (!counts) return;
            const next = (counts.get(spelling) || 0) - 1;
            if (next > 0) counts.set(spelling, next); else counts.delete(spelling);
            if (counts.size === 0) spellings.delete(key);
        },
        /** Most frequent spelling for `key`, ties broken alphabetically. */
        displayName(key) {
            const counts = spellings.get(key);
            if (!counts) return null;
            return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
        },
        clear() { spellings.clear(); },
    };
}
