'use client';

import type { ReactNode } from 'react';

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="sketch-ink" style={{
      textAlign: 'center', padding: '64px 24px',
      background: 'var(--surface-solid)', border: '1.25px dashed var(--ink-border-strong, var(--border-strong))',
      borderRadius: 14,
    }}>
      {icon && <div style={{ color: 'var(--subtle-ink)', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{title}</h3>
      {body && <p style={{ color: 'var(--muted-ink)', fontSize: '0.88rem', maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.5 }}>{body}</p>}
      {action}
    </div>
  );
}