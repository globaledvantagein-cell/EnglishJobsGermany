'use client';

import type { ReactNode } from 'react';

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{
      display: 'block', marginBottom: 7,
      fontSize: '0.8rem', fontWeight: 600,
      color: 'var(--muted-ink)',
    }}>
      {children}
    </label>
  );
}