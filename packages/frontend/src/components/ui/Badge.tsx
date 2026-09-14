'use client';

import type { ReactNode, CSSProperties } from 'react';

type BadgeVariant = 'primary' | 'green' | 'red' | 'yellow' | 'blue' | 'neutral' | 'acid';

const BADGE_STYLE: Record<BadgeVariant, CSSProperties> = {
  primary: { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1.25px solid var(--primary)' },
  green: { background: 'var(--success-soft)', color: 'var(--success)', border: '1.25px solid var(--success)' },
  red: { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1.25px solid var(--danger)' },
  yellow: { background: 'var(--warning-soft)', color: 'var(--warning)', border: '1.25px solid var(--warning)' },
  blue: { background: 'var(--info-soft)', color: 'var(--info)', border: '1.25px solid var(--info)' },
  neutral: { background: 'var(--paper2)', color: 'var(--muted-ink)', border: '1.25px solid var(--border)' },
  acid: { background: 'var(--acid-soft)', color: 'var(--acid)', border: '1.25px solid var(--acid)' },
};

export function Badge({ children, variant = 'neutral', style }: { children: ReactNode; variant?: BadgeVariant; style?: CSSProperties }) {
  return (
    <span className="sketch-ink" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 6,
      fontSize: '0.82rem', fontWeight: 600,
      whiteSpace: 'nowrap',
      ...BADGE_STYLE[variant], ...style,
    }}>
      {children}
    </span>
  );
}