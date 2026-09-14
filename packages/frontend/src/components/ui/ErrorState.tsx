'use client';

/**
 * Failure state for any data-backed surface.
 *
 * Distinguishes "the API is unreachable" (backend down, proxy 502/503/504,
 * fetch TypeError) from every other error, because the fix is different:
 * unreachable → wait and retry; anything else → the request itself is wrong.
 * The retry button re-runs the caller's fetch in place, so the user never has
 * to reload the tab and lose filter state.
 */
import type { ReactNode } from 'react';
import { WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export type ErrorKind = 'unreachable' | 'generic';

/** Map a thrown error to a kind + short technical hint. */
export function classifyError(err: unknown): { kind: ErrorKind; hint: string } {
  const anyErr = err as { name?: string; status?: number; message?: string } | null;
  const status = anyErr?.status;
  const msg = anyErr?.message || '';
  const isNetwork =
    anyErr?.name === 'TypeError' ||                 // fetch() could not connect
    /failed to fetch|networkerror|load failed/i.test(msg) ||
    status === 502 || status === 503 || status === 504;
  return {
    kind: isNetwork ? 'unreachable' : 'generic',
    hint: status ? `HTTP ${status}` : (msg || 'Unknown error'),
  };
}

export function ErrorState({
  kind = 'generic',
  title,
  body,
  hint,
  onRetry,
  retrying,
  action,
}: {
  kind?: ErrorKind;
  title?: string;
  body?: string;
  /** Small technical detail (status code / message) shown under the button. */
  hint?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Extra action rendered beside retry (e.g. a link home). */
  action?: ReactNode;
}) {
  const unreachable = kind === 'unreachable';
  const finalTitle = title ?? (unreachable ? 'Can’t reach the job server' : 'Something went wrong');
  const finalBody = body ?? (unreachable
    ? 'The listings service isn’t responding right now. Your filters are kept — try again in a moment.'
    : 'The request failed. Try again, and if it keeps happening, reload the page.');

  return (
    <div className="error-state" role="alert" aria-live="polite">
      <div className="error-state__icon">
        {unreachable ? <WifiOff size={22} /> : <AlertTriangle size={22} />}
      </div>
      <h3 className="error-state__title">{finalTitle}</h3>
      <p className="error-state__body">{finalBody}</p>
      <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <Button size="sm" onClick={onRetry} loading={retrying}>
            <RefreshCw size={14} /> Try again
          </Button>
        )}
        {action}
      </div>
      {hint && <p className="error-state__hint">{hint}</p>}
    </div>
  );
}
