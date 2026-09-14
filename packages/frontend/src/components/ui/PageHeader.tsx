'use client';

import type { ReactNode } from 'react';

export function PageHeader({ label, title, subtitle, actions }: {
  label?: string; title: ReactNode; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      {label && <p className="font-sketch" style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)', marginBottom: 6 }}>{label}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{title}</h1>
          {subtitle && <p style={{ color: 'var(--muted-ink)', marginTop: 6, fontSize: '0.9rem', lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}