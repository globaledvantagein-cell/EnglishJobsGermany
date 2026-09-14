'use client';

// Route-level error boundary. Catches render/data errors inside any page so
// the user gets a retry instead of Next's blank error screen.
import { useEffect } from 'react';
import Link from 'next/link';
import { ErrorState, classifyError } from '@/components/ui/ErrorState';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[route error]', error); }, [error]);
  const { kind, hint } = classifyError(error);
  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '70vh', display: 'flex', alignItems: 'center' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px', width: '100%' }}>
        <ErrorState
          kind={kind}
          title={kind === 'unreachable' ? 'Can’t reach the job server' : 'This page hit an error'}
          hint={error.digest ? `${hint} · ${error.digest}` : hint}
          onRetry={reset}
          action={
            <Link href="/" style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>
              Go to the homepage
            </Link>
          }
        />
      </div>
    </div>
  );
}
