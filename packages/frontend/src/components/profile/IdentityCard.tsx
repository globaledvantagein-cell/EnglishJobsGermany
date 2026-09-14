'use client';

/**
 * Account identity: avatar, name, plan, and a small row of facts (member
 * since, saved roles, digest status). The facts are links where a destination
 * exists, so the card doubles as wayfinding rather than a static label.
 */
import { Mail, User as UserIcon, Calendar, Bookmark, BellRing, BellOff, Crown } from 'lucide-react';
import { Link } from '@/compat/router';
import { Badge } from '../ui';
import { useAuth } from '../../context/AuthContext';
import type { ProfileData } from './profileTypes';

interface Props {
  data: ProfileData;
  isAdmin: boolean;
  savedCount?: number;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

const statStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 12px', borderRadius: 10,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
  textDecoration: 'none', color: 'inherit', minWidth: 0,
};

export default function IdentityCard({ data, isAdmin, savedCount }: Props) {
  const { isPremium } = useAuth();

  const stat = (icon: React.ReactNode, label: string, value: string, to?: string) => {
    const inner = (
      <>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
          <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        </span>
      </>
    );
    return to
      ? <Link key={label} to={to} className="id-stat" style={statStyle}>{inner}</Link>
      : <div key={label} className="id-stat" style={statStyle}>{inner}</div>;
  };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {data.avatarUrl ? (
            <img
              src={data.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block', boxShadow: `0 0 0 2px var(--bg-surface), 0 0 0 4px ${isPremium ? '#d4a94a' : 'var(--border)'}` }}
            />
          ) : (
            <div
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--primary-soft)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', fontWeight: 800,
                boxShadow: `0 0 0 2px var(--bg-surface), 0 0 0 4px ${isPremium ? '#d4a94a' : 'var(--border)'}`,
              }}
              aria-hidden
            >
              {data.name?.trim() ? data.name.trim().charAt(0).toUpperCase() : <UserIcon size={26} />}
            </div>
          )}
          {isPremium && (
            <span
              title="Premium member"
              style={{
                position: 'absolute', right: -4, bottom: -4,
                width: 22, height: 22, borderRadius: '50%',
                background: 'linear-gradient(135deg, #d4a94a, #e6c069)', color: '#0f1620',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 0 2px var(--bg-surface)',
              }}
            >
              <Crown size={12} strokeWidth={2.5} />
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: 0 }}>
              {data.name}
            </h2>
            <Badge variant={isPremium ? 'yellow' : 'neutral'} style={{ fontSize: '0.62rem', padding: '2px 8px' }}>
              {isPremium ? 'PREMIUM' : 'FREE PLAN'}
            </Badge>
            {isAdmin && <Badge variant="red" style={{ fontSize: '0.6rem' }}>ADMIN</Badge>}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, margin: 0, minWidth: 0 }}>
            <Mail size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.email}</span>
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {stat(<Calendar size={14} />, 'Member since', formatDate(data.createdAt))}
        {stat(<Bookmark size={14} />, 'Saved roles', String(savedCount ?? 0), '/profile#saved')}
        {stat(
          data.isSubscribed ? <BellRing size={14} /> : <BellOff size={14} />,
          'Weekly digest',
          data.isSubscribed ? 'On' : 'Off',
          '/profile#preferences',
        )}
      </div>
    </div>
  );
}
