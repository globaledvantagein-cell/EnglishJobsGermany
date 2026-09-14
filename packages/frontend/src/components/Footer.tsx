'use client';

/**
 * Footer — compact editorial band.
 *
 * Three tight rows instead of tall link columns:
 *   1. Brand wordmark + primary product links
 *   2. Inline SEO link lines (cities, categories) — same internal links as
 *      before, a fraction of the height
 *   3. Hairline, then © · legal · socials
 */
import { Link } from '@/compat/router';
import { Linkedin, Twitter, MessageCircle } from 'lucide-react';
import { CATEGORY_ORDER, categorySlug } from '../utils/categorize';

const SOCIALS: ReadonlyArray<{ label: string; href: string; Icon: typeof Linkedin }> = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/english-jobs-in-germany', Icon: Linkedin },
  { label: 'X',        href: 'https://x.com/EngJobsgermany',                              Icon: Twitter },
  { label: 'WhatsApp', href: 'https://whatsapp.com/channel/0029VbCqyMl8vd1RyrdNQw11',    Icon: MessageCircle },
];

const PRIMARY_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/jobs', 'Browse Jobs'],
  ['/directory', 'Companies'],
  ['/career-guide', 'Career Guide'],
  ['/premium', 'Premium'],
];

const POPULAR_CITIES: ReadonlyArray<readonly [string, string]> = [
  ['berlin', 'Berlin'],
  ['munich', 'Munich'],
  ['hamburg', 'Hamburg'],
  ['frankfurt', 'Frankfurt'],
  ['stuttgart', 'Stuttgart'],
  ['cologne', 'Cologne'],
];

const inlineLink: React.CSSProperties = {
  fontSize: '0.76rem', color: 'var(--text-muted)', textDecoration: 'none',
  transition: 'color 0.16s',
};
const rowLabel: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-muted)', flexShrink: 0, opacity: 0.8,
};

function hoverable(e: React.MouseEvent<HTMLElement>, color: string) {
  e.currentTarget.style.color = color;
}

function InlineLinkRow({ label, links }: { label: string; links: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px 14px', flexWrap: 'wrap' }}>
      <span style={rowLabel}>{label}</span>
      {links.map(([href, text]) => (
        <Link
          key={href}
          to={href}
          style={inlineLink}
          onMouseEnter={e => hoverable(e, 'var(--text-primary)')}
          onMouseLeave={e => hoverable(e, 'var(--text-muted)')}
        >
          {text}
        </Link>
      ))}
    </div>
  );
}

export default function Footer() {
  // 28 categories would overwhelm the footer — link the top 8 by volume.
  const categoryLinks: ReadonlyArray<readonly [string, string]> = CATEGORY_ORDER.slice(0, 8).map(
    (cat) => [`/category/${categorySlug(cat)}`, cat] as const,
  );

  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 'auto', padding: '22px 24px 14px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Row 1 — wordmark + primary links */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 20px' }}>
          <Link
            to="/"
            style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}
          >
            <img
              src="/logo.jpeg"
              alt=""
              style={{ height: 28, width: 'auto', display: 'block', flexShrink: 0 }}
              loading="lazy"
              decoding="async"
            />
            <div style={{ lineHeight: 1 }}>
              <span style={{
                fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.05rem', fontWeight: 700,
                color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'block',
              }}>
                English <em style={{ fontStyle: 'italic', color: '#6C9CFF' }}>Jobs</em>
              </span>
              <span style={{
                fontSize: '0.55rem', fontWeight: 600, color: 'var(--text-muted)',
                letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2, display: 'block',
              }}>
                in Germany
              </span>
            </div>
          </Link>
          <nav aria-label="Footer" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {PRIMARY_LINKS.map(([href, label]) => (
              <Link
                key={href}
                to={href}
                style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.16s' }}
                onMouseEnter={e => hoverable(e, 'var(--text-primary)')}
                onMouseLeave={e => hoverable(e, 'var(--text-secondary)')}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Row 2 — compact SEO link lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <InlineLinkRow label="Cities" links={POPULAR_CITIES.map(([slug, label]) => [`/city/${slug}`, label] as const)} />
          <InlineLinkRow label="Categories" links={categoryLinks} />
        </div>

        {/* Row 3 — legal + socials */}
        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '6px 16px',
        }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.7 }}>
            © 2026 English Jobs in Germany
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/legal?tab=privacy" style={inlineLink}
              onMouseEnter={e => hoverable(e, 'var(--text-primary)')}
              onMouseLeave={e => hoverable(e, 'var(--text-muted)')}
            >Privacy</Link>
            <Link to="/legal?tab=terms" style={inlineLink}
              onMouseEnter={e => hoverable(e, 'var(--text-primary)')}
              onMouseLeave={e => hoverable(e, 'var(--text-muted)')}
            >Terms</Link>
            <a href="mailto:support@englishjobsgermany.com" style={inlineLink}
              onMouseEnter={e => hoverable(e, 'var(--text-primary)')}
              onMouseLeave={e => hoverable(e, 'var(--text-muted)')}
            >Contact</a>
            {/* "Cookie settings" removed while the consent banner is
                disabled — it would open nothing. Restore alongside
                <CookieConsent /> (see utils/consent.ts). */}
            <span aria-hidden="true" style={{ width: 1, height: 12, background: 'var(--border-strong)' }} />
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                style={{ color: 'var(--text-muted)', display: 'inline-flex', transition: 'color 0.16s' }}
                onMouseEnter={e => hoverable(e, 'var(--text-primary)')}
                onMouseLeave={e => hoverable(e, 'var(--text-muted)')}
              >
                <Icon size={14} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
