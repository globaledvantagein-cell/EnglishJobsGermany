'use client';

import type { ReactNode } from 'react';
import { Card } from './Card';

export function StatCard({ icon, value, label, accent }: { icon: ReactNode; value: ReactNode; label: string; accent?: boolean }) {
  return (
    <Card style={{ textAlign: 'center', ...(accent ? { border: '1.25px solid var(--primary)' } : {}) }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: accent ? 'var(--primary-soft)' : 'var(--paper2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent ? 'var(--primary)' : 'var(--muted-ink)',
        margin: '0 auto 14px',
        border: accent ? '1.25px solid var(--primary)' : '1.25px solid var(--ink-border, var(--border))',
      }}>
        {icon}
      </div>
      <div className="font-sketch-num" style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
        {value}
      </div>
      <p className="font-sketch" style={{ fontSize: '0.95rem', color: 'var(--muted-ink)', marginTop: 8 }}>
        {label}
      </p>
    </Card>
  );
}