'use client';

import type { ReactNode, CSSProperties } from 'react';

export function Card({ children, style, onClick, hoverable, className = '' }: { children: ReactNode; style?: CSSProperties; onClick?: () => void; hoverable?: boolean; className?: string }) {
  return (
    <div
      onClick={onClick}
      className={`sketch-ink sketch-surface ${className}`}
      style={{
        background: 'var(--surface-solid)',
        border: '1.25px solid var(--ink-border, var(--border))',
        borderRadius: 14, padding: '20px 24px',
        transition: 'border-color 0.22s, box-shadow 0.22s',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={hoverable ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--ink-border-strong, var(--border-strong))'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; } : undefined}
      onMouseLeave={hoverable ? e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--ink-border, var(--border))'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--highlight-edge, none)'; } : undefined}
    >
      {children}
    </div>
  );
}