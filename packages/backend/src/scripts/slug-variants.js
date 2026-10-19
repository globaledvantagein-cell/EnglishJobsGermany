// Shared by discover-german-companies.js and harvest-company-candidates.js so
// both turn a company name into exactly the same slug candidates.

/**
 * Slug variants for a company NAME. Measured on a prior corpus: the joined and
 * hyphenated forms account for ~90% of all hits, which is why they're the
 * default. --full adds the long tail for a mop-up pass.
 */
export function slugVariants(name, full = false) {
    const cleaned = String(name).trim().toLowerCase()
        // "GmbH & Co. KG" first: otherwise "&" becomes "and" and survives.
        .replace(/&\s*co\.?\s*(kgaa|kg|ohg)\b/g, ' ')
        .replace(/[.,''`®™]/g, '')
        .replace(/&/g, ' and ')
        .replace(/\b(gmbh|ag|se|kgaa|co kg|kg|mbh|inc|ltd|llc|plc|bv|nv|sa|as|oy|ab)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];

    const joined = cleaned.replace(/[^a-z0-9]/g, '');
    const hyphen = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const out = new Set([joined, hyphen]);

    if (full) {
        out.add(cleaned.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
        out.add(joined + 'jobs');
        out.add(`${hyphen}-jobs`);
        out.add(joined + 'careers');
        out.add(`${hyphen}-careers`);
        const words = cleaned.split(' ');
        if (words.length > 1) out.add(words.slice(0, -1).join('').replace(/[^a-z0-9]/g, ''));
    }
    return [...out].filter(s => s.length >= 2 && s.length <= 60);
}
