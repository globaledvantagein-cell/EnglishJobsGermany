'use client';

import { Link } from '@/compat/router';
import { Crown } from 'lucide-react';
import { PREMIUM_NAV_PATHS } from './navLinks';

interface Props {
  links: ReadonlyArray<readonly [string, string]>;
  isActive: (path: string) => boolean;
  unreadFeedback: number;
  /** When false, premium destinations get a crown indicator (awareness only). */
  isPremium?: boolean;
}

const linkStyle = (active: boolean): React.CSSProperties => ({
  fontSize: '0.88rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  textDecoration: 'none',
  padding: '5px 0',
  position: 'relative',
  transition: 'color 0.18s',
});

function NavLink({
  path, label, active, badge, premiumLocked,
}: { path: string; label: string; active: boolean; badge?: number; premiumLocked?: boolean }) {
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
  };

  const inner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label}
      {premiumLocked && <Crown size={12} style={{ color: 'var(--acid)' }} aria-label="Premium" />}
    </span>
  );

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-start' }}>
      {/* Every route is a Next.js page now — instant client navigation.
          The active/hover underline is .nav-link::after (globals.css) so it
          slides in instead of appearing. */}
      <Link to={path} className={`nav-link ${active ? 'is-active' : ''}`} style={linkStyle(active)} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {inner}
      </Link>
      {badge != null && badge > 0 && (
        <span style={{
          background: 'var(--danger)', color: '#fff',
          fontSize: '0.6rem', fontWeight: 700,
          padding: '1px 5px', borderRadius: 8,
          marginLeft: -4, position: 'relative', top: -8,
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

export default function DesktopNav({ links, isActive, unreadFeedback, isPremium = true }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      {links.map(([path, label]) => (
        <NavLink
          key={path}
          path={path}
          label={label}
          active={isActive(path)}
          badge={path === '/feedback' ? unreadFeedback : undefined}
          premiumLocked={!isPremium && PREMIUM_NAV_PATHS.has(path)}
        />
      ))}
    </div>
  );
}