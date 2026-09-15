'use client';

import { Eye } from 'lucide-react';
import { Link } from '@/compat/router';
import type { GateUsage } from '../types';

interface Props {
  usage: GateUsage;
  /** Signed-in free user (weekly allowance) vs anonymous visitor (free views) */
  signedIn: boolean;
  /** Anonymous only — opens the sign-in gate */
  onSignIn: () => void;
}

/**
 * "2 of 5 free job views left" — shown on the job page once the allowance is
 * running low, so the signup gate is expected rather than a surprise lock.
 * Hidden while plenty is left (more than max(3, a quarter of the limit)).
 */
export default function ViewAllowanceNotice({ usage, signedIn, onSignIn }: Props) {
  const { used, limit } = usage;
  if (!limit || limit <= 0) return null;

  const remaining = Math.max(0, limit - used);
  if (remaining > Math.max(3, Math.ceil(limit / 4))) return null;

  const message = remaining === 0
    ? (signedIn ? 'That was your last job view this week.' : 'That was your last free job view.')
    : `${remaining} of ${limit} ${signedIn ? 'job views left this week' : 'free job views left'}`;

  const actionStyle = {
    background: 'none', border: 'none', padding: 0,
    fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600,
    color: 'var(--primary)', cursor: 'pointer', textDecoration: 'none',
    whiteSpace: 'nowrap',
  } as const;

  return (
    <div
      role="status"
      className="page-fade-in"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px',
        padding: '10px 14px', marginBottom: 16, borderRadius: 10,
        background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
        fontSize: '0.84rem', color: 'var(--text-secondary)',
      }}
    >
      <Eye size={15} style={{ color: remaining === 0 ? 'var(--warning)' : 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ flex: '1 1 auto' }}>{message}</span>
      {signedIn ? (
        <Link to="/premium" style={actionStyle}>Go unlimited</Link>
      ) : (
        <button type="button" onClick={onSignIn} style={actionStyle}>
          Sign in free to keep browsing
        </button>
      )}
    </div>
  );
}
