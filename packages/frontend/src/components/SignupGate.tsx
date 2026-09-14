'use client';

import { Lock } from 'lucide-react';
import GoogleAuthButton from './GoogleAuthButton';

interface Props {
  /** Optional teaser data — title/company/location only */
  teaser?: {
    JobTitle?: string;
    Company?: string;
    Location?: string;
  };
  /** Called after successful auth so the parent can refetch the job */
  onAuthSuccess: () => void;
}

/**
 * Shown when /api/jobs/:id/full returns { gated: true }.
 *
 * Deliberately does NOT show:
 *   - View counter ("17/20 left")
 *   - Remaining count
 *   - The limit number
 * The gate triggers silently. Users see the value prop, not the rule.
 */
export default function SignupGate({ teaser, onAuthSuccess }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '32px 20px',
        maxWidth: 440,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'var(--primary-soft, var(--bg-surface-2))',
          border: '1.25px solid var(--primary, var(--border))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary, var(--text-primary))',
          marginBottom: 18,
        }}
      >
        <Lock size={22} />
      </div>

      <h2
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(1.3rem, 3vw, 1.6rem)',
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        Sign in to keep browsing
      </h2>

      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.95rem',
          lineHeight: 1.55,
          marginBottom: 22,
        }}
      >
        Continue with Google to unlock every English-speaking role in Germany —
        full descriptions, salary details, and direct apply links.
      </p>

      {teaser?.JobTitle && (
        <div
          style={{
            width: '100%',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 22,
            background: 'var(--bg-surface-2)',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            You were viewing
          </p>
          <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            {teaser.JobTitle}
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {teaser.Company}
            {teaser.Location ? ` · ${teaser.Location}` : ''}
          </p>
        </div>
      )}

      <GoogleAuthButton onSuccess={onAuthSuccess} text="continue_with" />
    </div>
  );
}