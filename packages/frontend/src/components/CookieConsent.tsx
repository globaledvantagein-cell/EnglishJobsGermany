'use client';

/**
 * CookieConsent — bottom consent banner, shown exactly once per device until
 * a choice is made (or until CONSENT_VERSION is bumped, which re-asks once).
 *
 * Rules implemented:
 *   - Gates session recordings only. Anonymous, cookieless analytics run
 *     regardless (legitimate interest) — see utils/consent.ts.
 *   - Applies to everyone: anonymous, signed-in, new — consent is per device.
 *   - Non-blocking banner (not a modal): the page stays usable, as GDPR
 *     recommends and most large sites do.
 *   - "Accept all" and "Only necessary" carry equal visual weight (required
 *     by GDPR — no dark patterns), plus a link to the privacy policy.
 *   - The footer "Cookie settings" link reopens it any time to change the
 *     choice (openCookieSettings() dispatches a window event).
 *   - Renders nothing during SSR and until mounted — no hydration mismatch.
 */
import { useEffect, useState } from 'react';
import { Link } from '@/compat/router';
import { Cookie } from 'lucide-react';
import {
  getConsent,
  setConsent,
  OPEN_COOKIE_SETTINGS_EVENT,
  type ConsentChoice,
} from '../utils/consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show only if there's no valid stored choice for the current version.
    if (!getConsent()) setVisible(true);

    const reopen = () => setVisible(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const decide = (choice: ConsentChoice) => {
    setConsent(choice);
    setVisible(false);
  };

  const buttonBase: React.CSSProperties = {
    height: 38, padding: '0 18px', borderRadius: 9,
    fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 400,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%', maxWidth: 720,
          background: 'var(--surface-solid)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}
      >
        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>
          <Cookie size={18} />
        </span>
        <p style={{ flex: '1 1 260px', margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          We measure anonymous usage (page views, clicks) to improve the site — no
          cookies, no profile. Accept to also allow session recordings, which help us
          see where people get stuck.{' '}
          <Link to="/legal?tab=privacy" style={{ color: 'var(--acid)', textDecoration: 'none', fontWeight: 600 }}>
            Privacy policy
          </Link>
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => decide('rejected')}
            style={{
              ...buttonBase,
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Only necessary
          </button>
          <button
            type="button"
            onClick={() => decide('accepted')}
            style={{
              ...buttonBase,
              background: 'var(--acid)', color: '#fff', border: 'none',
            }}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
