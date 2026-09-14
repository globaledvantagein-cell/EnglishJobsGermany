'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Link } from '@/compat/router';
import { Alert } from './ui';
import { useAuth } from '../context/AuthContext';

interface Props {
  onSuccess?: () => void;
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
export default function GoogleAuthButton({
  onSuccess,
  onError,
  size = 'large',
  text = 'continue_with',
  extraBody = {},
}: Props) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [buttonWidth, setButtonWidth] = useState<number>(MAX_WIDTH);

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
    setLoading(true);
    try {
      // Clicking the Google button IS the user's agreement to the Terms —
      // notice below acts as visible legal disclosure (browsewrap-with-notice).
      await loginWithGoogle(credentialResponse.credential, true, extraBody);
      onSuccess?.();
    } catch (err: any) {
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

      <div
        ref={containerRef}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          opacity: loading ? 0.6 : 1,
          pointerEvents: loading ? 'none' : 'auto',
          transition: 'opacity 0.18s',
        }}
      >
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => setError('Google sign-in failed')}
          theme="outline"
          size={size}
          text={text}
          shape="rectangular"
          width={String(buttonWidth)}
          useOneTap={false}
        />
      </div>

      <p
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
      </p>
    </div>
  );
}