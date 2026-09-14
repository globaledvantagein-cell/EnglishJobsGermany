'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { apiPost } from '../utils/jobApi';

export default function FeedbackWidget() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const words = useMemo(() => message.trim().split(/\s+/).filter(Boolean).length, [message]);
  const overWordLimit = words > 200;
  const showWordCounter = message.trim().length > 0;

  // Close on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Auto-dismiss on success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => { setSuccess(false); setOpen(false); }, 2000);
    return () => clearTimeout(t);
  }, [success]);

  const validate = () => {
    if (!name.trim())  { setError('Please enter your name'); return false; }
    if (!email.trim()) { setError('Please enter your email'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email'); return false; }
    if (!message.trim()) { setError('Please enter a message'); return false; }
    if (words < 1 || words > 200) { setError('Message must be between 1 and 200 words'); return false; }
    setError('');
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError('');
    try {
      await apiPost('/api/feedback', { name, email, message, source: 'floating-widget' }, { noAuth: true });
      setName(''); setEmail(''); setMessage('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isMobile && open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.24)', zIndex: 9989 }} />
      )}

      <div ref={containerRef} style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9991 }}>
        <div
          style={{
            position: 'fixed', right: 20, bottom: 68,
            width: isMobile ? 'calc(100vw - 32px)' : 320,
            maxWidth: 360,
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            padding: 18, zIndex: 9991,
            opacity: open ? 1 : 0,
            transform: open ? 'translateY(0)' : 'translateY(8px)',
            pointerEvents: open ? 'auto' : 'none',
            transition: 'opacity 0.2s, transform 0.2s',
          }}
        >
          {success ? (
            <div style={{ minHeight: 144, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ margin: 0, color: 'var(--success)', fontSize: '0.86rem', fontWeight: 600 }}>✓ Thanks for your feedback!</p>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>Send us feedback</p>
                <button
                  type="button"
                  aria-label="Close feedback"
                  onClick={() => setOpen(false)}
                  style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ margin: '0 0 2px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Bug, idea, or just say hi</p>

              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={100}
                style={inputStyle} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" maxLength={200}
                style={inputStyle} />
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Your message..." maxLength={5000}
                style={{ ...inputStyle, minHeight: 80, padding: '8px 10px', resize: 'vertical', lineHeight: 1.45, height: 'auto' }} />

              {showWordCounter && (
                <p style={{ margin: 0, fontSize: '0.65rem', color: overWordLimit ? 'var(--danger)' : 'var(--text-muted)', textAlign: 'right' }}>
                  {words} / 200 words
                </p>
              )}

              <button
                type="submit"
                disabled={loading || overWordLimit}
                style={{
                  height: 36, width: '100%', border: 'none', borderRadius: 8,
                  background: loading || overWordLimit ? 'var(--text-muted)' : 'var(--primary)',
                  color: '#fff', fontSize: '0.82rem', fontWeight: 600,
                  cursor: loading || overWordLimit ? 'not-allowed' : 'pointer',
                  marginTop: 4, fontFamily: 'inherit',
                }}
              >
                {loading ? 'Sending...' : 'Send feedback'}
              </button>

              {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.74rem' }}>{error}</p>}
            </form>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen(p => !p)}
          aria-label={open ? 'Close feedback' : 'Open feedback'}
          style={{
            height: isMobile ? 36 : 38,
            width: isMobile ? 36 : 'auto',
            padding: isMobile ? 0 : '0 14px',
            borderRadius: isMobile ? '50%' : 20,
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: '0.78rem', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            cursor: 'pointer', transition: 'border-color 0.2s, color 0.2s',
            zIndex: 9990, fontFamily: 'inherit',
          }}
        >
          {open ? <X size={14} /> : <MessageSquare size={14} />}
          {!isMobile && <span>{open ? '✕ Close' : 'Feedback'}</span>}
        </button>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 34,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: '0.8rem',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
};