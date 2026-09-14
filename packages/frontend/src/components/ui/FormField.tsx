'use client';

import type { ReactNode } from 'react';
import { Label } from './Label';

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p style={{ color: 'var(--subtle-ink)', fontSize: '0.75rem', marginTop: 5 }}>{hint}</p>}
    </div>
  );
}