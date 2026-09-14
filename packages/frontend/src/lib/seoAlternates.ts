import type { Metadata } from 'next';
import { SITE_URL } from './serverApi';

/**
 * Builds the `alternates` block for a page: an absolute canonical plus a
 * self-referential hreflang set.
 *
 * The site is English-only, so every URL declares itself as the `en` version
 * and as `x-default` (the fallback for users whose language Google can't match).
 * That is what stops Google preferring German-language results for English
 * queries made from inside Germany.
 *
 * hreflang MUST be self-referential — each URL's tag points at that same URL.
 * This is why the set is built per page rather than declared once in the root
 * layout: a layout-level `languages` value is inherited by every page that
 * doesn't set its own `alternates`, which would tell Google that the English
 * version of, say, /career-guide is the homepage. Google discards
 * non-reciprocal hreflang, so the sitewide shortcut buys nothing and risks the
 * canonical being second-guessed.
 *
 * @param path Root-relative path, e.g. '/' or `/city/${slug}`.
 */
export function alternatesFor(path: string): Metadata['alternates'] {
  // Normalise so '/' maps to the bare origin and every other path has exactly
  // one leading slash and no trailing one.
  const clean = path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  const url = `${SITE_URL}${clean}`;
  return {
    canonical: url,
    languages: {
      en: url,
      'x-default': url,
    },
  };
}
