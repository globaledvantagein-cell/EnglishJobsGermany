'use client';

/**
 * Floating feedback button + form.
 *
 *   - Signed-in users are never asked who they are: the API identifies them
 *     from their token and takes name/email from the account.
 *   - Guests get one optional email field, only for when they want a reply.
 *   - A Bug / Idea / Other choice tailors the prompt and lets the admin inbox
 *     triage; the current page path is attached automatically.
 *   - Desktop: popover above the button. Phone: bottom sheet with a backdrop.
 *
 * Styles live in globals.css (.fb-*). The button hides while the cookie
 * banner is open and rises above fixed bottom bars via --bottom-bar-inset.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bug, Check, Lightbulb, MessageSquare, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../utils/jobApi';

type Category = 'bug' | 'idea' | 'other';

const CATEGORIES: ReadonlyArray<{ value: Category; label: string; Icon: typeof Bug; placeholder: string }> = [
  { value: 'bug', label: 'Bug', Icon: Bug, placeholder: 'What went wrong, and what did you expect to happen?' },
  { value: 'idea', label: 'Idea', Icon: Lightbulb, placeholder: 'What would make English Jobs Germany better for you?' },
  { value: 'other', label: 'Other', Icon: MessageSquare, placeholder: 'Tell us anything — we read every message.' },
];

const MAX_WORDS = 200;

export default function FeedbackWidget() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  // The form is only rendered once the panel has been opened. Its contents
  // depend on sign-in state, which the server can't know, so rendering it
  // during SSR caused a hydration mismatch (guest email field on the server,
  // "Sending as …" in the browser).
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => { if (open) setHasOpened(true); }, [open]);
  const [category, setCategory] = useState<Category>('idea');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const words = useMemo(() => message.trim().split(/\s+/).filter(Boolean).length, [message]);
  const overWordLimit = words > MAX_WORDS;
  const active = CATEGORIES.find(c => c.value === category)!;

  // Close on outside click + Esc; focus the message when opening.
  useEffect(() => {
    if (!open) return;
    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 60);
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Auto-dismiss on success, then reset for the next message.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => { setSuccess(false); setOpen(false); }, 2500);
    return () => clearTimeout(t);
  }, [success]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    if (!message.trim()) { setError('Please write a message first.'); return; }
    if (overWordLimit) { setError(`Please keep it under ${MAX_WORDS} words.`); return; }
    const guestEmail = email.trim();
    if (!isAuthenticated && guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      setError('That email doesn’t look right — fix it or leave it empty.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Signed in: the token identifies the sender, so no name/email is sent.
      await apiPost('/api/feedback', {
        message: message.trim(),
        category,
        page: pathname,
        source: 'floating-widget',
        ...(!isAuthenticated && guestEmail && { email: guestEmail }),
      });
      setMessage('');
      setEmail('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
  };

  return (
    <>
      {isMobile && open && <div className="fb-backdrop" onClick={() => setOpen(false)} />}

      <div ref={containerRef} className="feedback-fab" data-mobile={isMobile}>
        <div
          className="fb-panel"
          data-open={open}
          role="dialog"
          aria-modal={isMobile ? true : undefined}
          aria-labelledby="fb-title"
          inert={!open}
        >
          {!hasOpened && !open ? null : success ? (
            <div className="fb-success">
              <span className="fb-success-icon"><Check size={20} /></span>
              <p className="fb-success-title">Thanks — message received.</p>
              <p className="fb-success-sub">We read every one{isAuthenticated ? ' and may reply by email.' : '.'}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="fb-form" noValidate>
              <div className="fb-head">
                <p id="fb-title" className="fb-title">Send feedback</p>
                <button type="button" className="fb-close" aria-label="Close feedback" onClick={() => setOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="fb-types" role="radiogroup" aria-label="Feedback type">
                {CATEGORIES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={category === value}
                    className="fb-type"
                    onClick={() => setCategory(value)}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              <label className="fb-sr" htmlFor="fb-message">Your message</label>
              <textarea
                id="fb-message"
                ref={textareaRef}
                className="fb-input fb-textarea"
                value={message}
                onChange={e => { setMessage(e.target.value); if (error) setError(''); }}
                onKeyDown={onKeyDown}
                placeholder={active.placeholder}
                maxLength={5000}
              />
              {words > MAX_WORDS - 50 && (
                <p className="fb-count" data-over={overWordLimit}>{words} / {MAX_WORDS} words</p>
              )}

              {isAuthenticated ? (
                <p className="fb-identity">
                  <span className="fb-avatar" aria-hidden="true">{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</span>
                  Sending as <strong>{user?.email || user?.name}</strong>
                </p>
              ) : (
                <>
                  <label className="fb-label" htmlFor="fb-email">Email <span>(optional — only if you’d like a reply)</span></label>
                  <input
                    id="fb-email"
                    type="email"
                    className="fb-input"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    maxLength={200}
                  />
                </>
              )}

              {error && <p className="fb-error" role="alert">{error}</p>}

              <div className="fb-foot">
                <span className="fb-hint">{isMobile ? 'Includes this page’s address' : 'Ctrl/⌘ + Enter to send'}</span>
                <button type="submit" className="fb-send" disabled={loading || !message.trim() || overWordLimit}>
                  {loading ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>

        <button
          type="button"
          className="fb-trigger"
          onClick={() => setOpen(previous => !previous)}
          aria-label={open ? 'Close feedback' : 'Send feedback'}
          aria-expanded={open}
        >
          {open ? <X size={isMobile ? 18 : 15} /> : <MessageSquare size={isMobile ? 18 : 15} />}
          {!isMobile && <span>{open ? 'Close' : 'Feedback'}</span>}
        </button>
      </div>
    </>
  );
}
