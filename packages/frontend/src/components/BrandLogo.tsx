'use client';

/**
 * The one brand lockup used everywhere (header, mobile drawer, footer, admin):
 * the logo mark (transparent PNG; on a white tile in dark mode so the navy
 * lettering stays legible) + the "English Jobs / in Germany" wordmark.
 * Change it here and every surface follows.
 */
import { Link } from '@/compat/router';

const SIZES = { sm: 28, md: 34, lg: 40 } as const;

export default function BrandLogo({
  size = 'md',
  href = '/',
  mark = true,
  wordmark = true,
  tagline = true,
  badge,
  ariaLabel = 'English Jobs in Germany — home',
}: {
  size?: keyof typeof SIZES;
  href?: string | null;
  /** Show the logo mark (off when a layout renders it separately). */
  mark?: boolean;
  wordmark?: boolean;
  tagline?: boolean;
  /** Small label after the wordmark (e.g. "Admin"). */
  badge?: string;
  ariaLabel?: string;
}) {
  const px = SIZES[size];
  const content = (
    <>
      {mark && (
        <span className="brand-mark" style={{ width: px, height: px }}>
          <img src="/brand/logo-mark-128.png" alt="" width={px} height={px} decoding="async" />
        </span>
      )}
      {wordmark && (
        <span className="brand-words" data-size={size}>
          <span className="brand-name">English <span>Jobs</span></span>
          {tagline && <span className="brand-tagline">in Germany</span>}
        </span>
      )}
      {badge && <span className="brand-badge">{badge}</span>}
    </>
  );
  return href
    ? <Link to={href} className="brand" aria-label={ariaLabel}>{content}</Link>
    : <span className="brand">{content}</span>;
}
