'use client';

/**
 * CohortWaitlistModal — demand-test surface for the (not yet real) career
 * coaching cohort. The homepage CTA opens this; it always says the cohort is
 * full and offers the waitlist. Joining stores the email via
 * POST /api/auth/cohort-waitlist (works anonymous or logged in).
 *
 * States: full (pitch + email form) → success / already-joined.
 * Overlay pattern matches UpgradeModal: dark backdrop + blur, centered card,
 * Escape and click-outside dismiss.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../utils/jobApi';
import { track } from '../utils/analytics';

type ModalState = 'full' | 'submitting' | 'success' | 'alreadyJoined';

export default function CohortWaitlistModal({ onClose }: { onClose: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<ModalState>('full');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const targetEmail = (isAuthenticated && user?.email ? user.email : email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    setError(null);
    setState('submitting');
    try {
      const res = await apiPost<{ success?: boolean; alreadyJoined?: boolean }>(
        '/api/auth/cohort-waitlist',
        { email: targetEmail, name: name.trim() || undefined },
      );
      setState(res.alreadyJoined ? 'alreadyJoined' : 'success');
      track('cohort_waitlist_joined', { alreadyJoined: !!res.alreadyJoined, authenticated: isAuthenticated });
    } catch {
      setState('full');
      setError('Something went wrong. Please try again.');
    }
  };

  const inputStyle: CSSProperties = {
    width: '100%', height: 44, padding: '0 14px',
    fontFamily: 'inherit', fontSize: '0.9rem',
    background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 10, outline: 'none',
  };
  const ctaStyle: CSSProperties = {
    width: '100%', height: 46, background: 'var(--primary)', color: '#fff',
    border: 'none', borderRadius: 10, fontFamily: 'inherit',
    fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
  };

  const isDone = state === 'success' || state === 'alreadyJoined';

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cohort waitlist"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(20px, 5vw, 28px)',
          boxShadow: 'var(--shadow-lg)', position: 'relative',
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="no-touch-expand"
          style={{
            position: 'absolute', top: 12, right: 12, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          }}
        >
          <X size={18} />
        </button>

        {!isDone && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
              This cohort is full
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '10px 0 0' }}>
              The September cohort filled up quickly. Join the waitlist for the next one — we&rsquo;ll email
              you as soon as spots open.
            </p>

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {isAuthenticated && user?.email ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, background: 'var(--bg-surface-2)', borderRadius: 10, padding: '11px 14px' }}>
                  We&rsquo;ll notify you at <strong>{user.email}</strong>
                </p>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(null); }}
                    placeholder="Your email address"
                    aria-label="Email address"
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name (optional)"
                    aria-label="Name (optional)"
                    style={inputStyle}
                  />
                </>
              )}

              {error && <p style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: 0 }}>{error}</p>}

              <button type="submit" disabled={state === 'submitting'} style={{ ...ctaStyle, opacity: state === 'submitting' ? 0.7 : 1 }}>
                {state === 'submitting' ? 'Joining…' : 'Join the waitlist'}
              </button>
            </form>

            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '12px 0 0', textAlign: 'center' }}>
              No commitment. We&rsquo;ll only email you when the next cohort opens.
            </p>
          </>
        )}

        {isDone && (
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <CheckCircle size={40} style={{ color: 'var(--acid)', marginBottom: 12 }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              {state === 'success' ? 'You’re on the waitlist!' : 'You’re already on the waitlist!'}
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '10px 0 18px' }}>
              {state === 'success'
                ? 'We’ll email you as soon as the next cohort opens. Keep an eye on your inbox.'
                : 'We’ll email you when the next cohort opens.'}
            </p>
            <button type="button" onClick={onClose} style={ctaStyle}>
              {state === 'success' ? 'Back to browsing' : 'Got it'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
