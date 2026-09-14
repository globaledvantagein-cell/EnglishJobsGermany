import type { Metadata } from 'next';

/**
 * The brand suffix the root layout's title template appends to any *string*
 * title a page returns (`%s — English Jobs Germany`).
 */
export const BRAND_SUFFIX = ' — English Jobs Germany';

/**
 * Builds a page <title> that survives Google's ~60-character SERP truncation.
 *
 * Pages return the bare page name and the layout template adds the brand
 * suffix, so the budget is 60 − suffix. `fallbacks` are progressively shorter
 * phrasings, tried in order; if none fit, the shortest is returned as an
 * absolute title so the brand suffix is dropped instead of the headline (a
 * truncated brand is noise; a truncated headline loses the keyword).
 *
 * Never pass a string that already contains the brand — the template would
 * append it a second time.
 */
export function brandTitle(preferred: string, ...fallbacks: string[]): Metadata['title'] {
  const budget = 60 - BRAND_SUFFIX.length;
  for (const candidate of [preferred, ...fallbacks]) {
    if (candidate.length <= budget) return candidate;
  }
  const shortest = [preferred, ...fallbacks].reduce((a, b) => (b.length < a.length ? b : a));
  return { absolute: shortest };
}
