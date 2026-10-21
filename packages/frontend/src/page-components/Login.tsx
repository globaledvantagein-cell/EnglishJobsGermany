'use client';

import { useState } from 'react';
import { Link, useNavigate } from '@/compat/router';
import { Briefcase, CheckCircle, Mail, Globe } from 'lucide-react';
import GoogleAuthButton, { type GoogleAuthMode } from '../components/GoogleAuthButton';
import DigestOptIn from '../components/login/DigestOptIn';
import { BRAND } from '../theme/brand';

/**
 * Auth page, Google only, in two modes (separate pages, like Vercel's
 * /login and /signup):
 *   /login  → mode 'login': never creates an account; an unknown Google
 *             account is told "no account found" with a link to sign up.
 *   /signup → mode 'signup': creates the account (terms notice + optional
 *             weekly-digest opt-in live here only).
 */
export default function Login({ mode = 'login' }: { mode?: GoogleAuthMode }) {
  const isSignup = mode === 'signup';
  const nav = useNavigate();
  const [wantsDigest, setWantsDigest] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toggleCategory = (value: string) => {
    setSelectedCategories(prev =>
      prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
    );
  };

  const TRUST = [
    { icon: <CheckCircle size={14} />, text: 'No German required — verified listings' },
    { icon: <Mail size={14} />,        text: 'Optional weekly job alerts to your inbox' },
    { icon: <Globe size={14} />,       text: 'Full access to every English-speaking role' },
  ];

  const extraAuthBody = wantsDigest && selectedCategories.length > 0
    ? { subscribeToDigest: true, desiredCategories: selectedCategories }
    : {};

  return (
    // One continuous logo-palette wash across the whole page (the site's shared
    // .page-wash system, data-wash="home"), instead of a flat split panel.
    // Pattern from Wellfound's login (REA): soft brand glows in the corners,
    // calm centre, one floating card.
    <div className="page-wash auth-page" data-wash="home">
      {/* Brand pitch (desktop) */}
      <div
        className="hidden md:flex"
        style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '48px' }}
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <div
            style={{
              width: 56, height: 56,
              background: 'var(--primary-soft)',
              border: '1.25px solid var(--primary)',
              borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--primary)', margin: '0 auto 24px',
            }}
          >
            <Briefcase size={24} />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 12 }}>
            {isSignup ? <>Welcome <span className="auth-accent">aboard</span></> : <>Welcome <span className="auth-accent">back</span></>}
          </h2>
          <p style={{ color: 'var(--muted-ink)', marginBottom: 36, lineHeight: 1.65, fontSize: '0.95rem' }}>
            {BRAND.description}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
            {TRUST.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-ink)', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--primary)', flexShrink: 0 }}>{t.icon}</span>
                {t.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auth panel */}
      {/* minWidth:0 — a flex item defaults to min-width:auto and would grow to
          fit its widest child (the Google button) instead of shrinking to the phone. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div className="anim-scale" style={{ width: '100%', minWidth: 0, maxWidth: 400 }}>
          <div className="md:hidden" style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 46, height: 46,
                background: 'var(--primary-soft)',
                border: '1.25px solid var(--primary)',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--primary)', margin: '0 auto 14px',
              }}
            >
              <Briefcase size={20} />
            </div>
          </div>

          <div className="auth-card">
            <div style={{ marginBottom: 22, textAlign: 'center' }}>
              <h2
                style={{
                  fontSize: '1.5rem', fontWeight: 700,
                  color: 'var(--ink)', letterSpacing: '-0.02em',
                  marginBottom: 5, lineHeight: 1.2,
                }}
              >
                {isSignup ? <>Create your <span className="auth-accent">free</span> account</> : `Log in to ${BRAND.appName}`}
              </h2>
              <p style={{ color: 'var(--subtle-ink)', fontSize: '0.875rem', margin: 0 }}>
                {isSignup ? 'One click with Google. No password to remember.' : 'Use the Google account you signed up with.'}
              </p>
            </div>

            <GoogleAuthButton
              mode={mode}
              onSuccess={() => nav('/jobs')}
              extraBody={isSignup ? extraAuthBody : {}}
            />

            <p style={{ textAlign: 'center', margin: '18px 0 0', fontSize: '0.875rem', color: 'var(--subtle-ink)' }}>
              {isSignup ? 'Already have an account? ' : "Don't have an account? "}
              <Link to={isSignup ? '/login' : '/signup'} style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
                {isSignup ? 'Log in' : 'Sign up'}
              </Link>
            </p>

            {isSignup && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span
                style={{
                  fontSize: '0.7rem', fontWeight: 600,
                  color: 'var(--subtle-ink)', textTransform: 'uppercase', letterSpacing: '0.1em',
                }}
              >
                Optional
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <DigestOptIn
              wantsDigest={wantsDigest}
              onToggleDigest={setWantsDigest}
              selectedCategories={selectedCategories}
              onToggleCategory={toggleCategory}
            />
            </>}

            <p
              style={{
                textAlign: 'center', marginTop: 22, marginBottom: 0,
                fontSize: '0.8rem', color: 'var(--subtle-ink)',
              }}
            >
              Just want emails without an account?{' '}
              <a
                onClick={() => nav('/alerts')}
                style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
              >
                Get email updates
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}