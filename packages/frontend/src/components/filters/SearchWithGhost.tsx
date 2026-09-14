'use client';

/**
 * Search input with inline ghost-text autocomplete.
 *
 * The completion is rendered by an absolutely-positioned overlay sitting behind
 * the (transparent-background) input: the portion the user already typed is
 * painted transparent so it lines up under the real text, and only the tail
 * shows as muted grey. That keeps the caret, selection and IME behaviour of a
 * plain <input> — a contentEditable or a second visible field would break all
 * three.
 *
 * Accepting: Tab or ArrowRight (only when the caret is at the end, so
 * ArrowRight still moves the caret mid-string). Escape dismisses.
 *
 * Shared by the main and remote filter bars — they differ only in endpoint.
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { apiGet } from '../../utils/jobApi';

const DEBOUNCE_MS = 150;

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** '/api/jobs/autocomplete' or '/api/remote-jobs/autocomplete' */
  endpoint: string;
  placeholder?: string;
  /** Merged onto the input; must include the same font/padding the ghost uses. */
  style?: React.CSSProperties;
  paddingLeft: number;
}

export default function SearchWithGhost({
  value, onChange, endpoint, placeholder = 'Search jobs...', style, paddingLeft,
}: Props) {
  const [ghost, setGhost] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch the completion, debounced ──────────────────────────────────────
  useEffect(() => {
    const typed = value.trim();

    // Nothing to complete, or the user is mid-phrase — only the final word is
    // completable, and a 1-char query matches almost everything.
    if (typed.length < 2) {
      setGhost('');
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      apiGet<{ suggestions?: string[] }>(
        `${endpoint}?q=${encodeURIComponent(typed)}`,
        { signal: ctrl.signal, noAuth: true },
      )
        .then(data => {
          if (ctrl.signal.aborted) return;
          const first = Array.isArray(data?.suggestions) ? data.suggestions[0] : undefined;
          // Only usable when it genuinely extends what was typed — otherwise
          // the overlay would not line up under the real text.
          if (first && first.toLowerCase().startsWith(typed.toLowerCase())) {
            setGhost(first.slice(typed.length));
          } else {
            setGhost('');
          }
        })
        .catch(() => setGhost('')); // autocomplete is decoration; never surface errors
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, endpoint]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function accept() {
    if (!ghost) return;
    onChange(value + ghost);
    setGhost('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!ghost) return;

    if (e.key === 'Tab') {
      e.preventDefault();          // don't move focus out of the field
      accept();
      return;
    }
    if (e.key === 'ArrowRight') {
      const el = e.currentTarget;
      // Only hijack ArrowRight at the very end of the value, so it keeps
      // working as caret movement everywhere else.
      const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
      if (atEnd) { e.preventDefault(); accept(); }
      return;
    }
    if (e.key === 'Escape') {
      setGhost('');
    }
  }

  // The ghost must render in exactly the input's box: same padding, same font.
  const sharedText: React.CSSProperties = {
    paddingLeft,
    paddingRight: 10,
    fontSize: style?.fontSize ?? '0.76rem',
    fontFamily: 'inherit',
    letterSpacing: 'inherit',
  };

  return (
    <div className="relative" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <Search
        size={14}
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 2 }}
      />

      {/* Ghost layer — ABOVE the input so the tail paints over its background,
          with the typed portion transparent so the real text shows through.
          Never interactive. */}
      {/* Always mounted; opacity fades (150ms) instead of the layer mounting
          and unmounting, which flashed on every keystroke. */}
      <div
        aria-hidden
        className="ghost-text"
        style={{
          ...sharedText,
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'pre',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 3,
          opacity: ghost ? 1 : 0,
        }}
      >
        <span style={{ color: 'transparent' }}>{value}</span>
        <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>{ghost}</span>
      </div>

      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-autocomplete="inline"
        className="search-input"
        style={{
          ...style,
          ...sharedText,
          width: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      />
    </div>
  );
}
