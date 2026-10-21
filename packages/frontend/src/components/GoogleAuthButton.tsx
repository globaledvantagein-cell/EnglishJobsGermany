'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Link } from '@/compat/router';
import { Alert } from './ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../utils/jobApi';
import { withFeature } from './FeatureGate';

/**
 * 'login' never creates an account: an unknown Google account gets a
 * "no account found" message with a link to sign up. 'signup' creates one
 * (or signs in an existing account). See POST /api/auth/google.
 */
export type GoogleAuthMode = 'login' | 'signup';

interface Props {
  mode: GoogleAuthMode;
  /** `existing` is true when a sign-up click found an account and just signed in. */
  onSuccess?: (result: { existing?: boolean }) => void;
  /** Called instead of linking to /signup when the login finds no account (e.g. in-place modals). */
  onNoAccount?: () => void;
  onError?: (message: string) => void;
  size?: 'medium' | 'large';
  text?: 'signin_with' | 'continue_with' | 'signup_with';
  /** Extra fields spread into POST /api/auth/google body (e.g. subscribeToDigest) */
  extraBody?: Record<string, unknown>;
}

// Google Identity Services button accepts a width between 200 and 400 px.
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/**
 * Shared Google sign-in widget.
 * Measures its container with ResizeObserver and feeds the width to
 * <GoogleLogin/> so the button always fills its slot — fixes the "oddly
 * narrow" Google button issue across both desktop and mobile.
 */
function GoogleAuthButton({
  mode,
  onSuccess,
  onNoAccount,
  onError,
  size = 'large',
  text,
  extraBody = {},
}: Props) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [noAccountEmail, setNoAccountEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // null until the container has been measured: the Google button is a fixed-
  // width iframe, so rendering it at MAX_WIDTH first made a ~290px phone card
  // grow to 400px (flex min-width:auto) — and then we measured that grown
  // container and kept the 400px button, so the page overflowed to the right.
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (w: number) => {
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor(w)));
      setButtonWidth(prev => (prev === clamped ? prev : clamped));
    };

    update(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) update(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSuccess = async (credentialResponse: any) => {
    setError('');
    setNoAccountEmail(null);
    setLoading(true);
    try {
      // On sign-up, clicking the Google button IS the user's agreement to the
      // Terms; the notice below is the visible disclosure (browsewrap-with-notice).
      const result = await loginWithGoogle(credentialResponse.credential, mode === 'signup', { ...extraBody, mode });
      onSuccess?.(result);
    } catch (err: any) {
      if (err instanceof ApiError && err.body?.code === 'NO_ACCOUNT') {
        setNoAccountEmail(err.body.email ?? '');
        if (onNoAccount) onNoAccount();
        return;
      }
      const message = err.message || 'Google sign-in failed';
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {error && <Alert type="error">{error}</Alert>}
      {noAccountEmail != null && !onNoAccount && (
        <Alert type="info">
          No account found{noAccountEmail ? <> for <b>{noAccountEmail}</b></> : null}. If you deleted your account, it&apos;s gone.{' '}
          <Link to="/signup" style={{ fontWeight: 700, color: 'var(--primary)' }}>Create a new account</Link>
        </Alert>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          minWidth: 0,
          minHeight: 44, // reserve the button's height until it is measured
          display: 'flex',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: loading ? 0.6 : 1,
          pointerEvents: loading ? 'none' : 'auto',
          transition: 'opacity 0.18s',
        }}
      >
        {buttonWidth != null && (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError('Google sign-in failed')}
            theme="outline"
            size={size}
            text={text ?? (mode === 'signup' ? 'signup_with' : 'signin_with')}
            shape="rectangular"
            width={String(buttonWidth)}
            useOneTap={false}
          />
        )}
      </div>

      {mode === 'signup' && <p
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted, var(--subtle-ink))',
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        By continuing, you agree to our{' '}
        <Link
          to="/legal"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--primary, var(--acid))',
            fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          Terms &amp; Privacy Policy
        </Link>
      </p>}
    </div>
  );
}
export default withFeature('googleLogin', GoogleAuthButton);
