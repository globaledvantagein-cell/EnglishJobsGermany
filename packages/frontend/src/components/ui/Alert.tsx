'use client';

import type { ReactNode } from 'react';

export function Alert({ type = 'info', children }: { type?: 'success' | 'error' | 'warning' | 'info'; children: ReactNode }) {
  const colorMap = {
    success: { bg: 'var(--success-soft)', fg: 'var(--success)', border: 'var(--success)' },
    error: { bg: 'var(--danger-soft)', fg: 'var(--danger)', border: 'var(--danger)' },
    warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)', border: 'var(--warning)' },
    info: { bg: 'var(--info-soft)', fg: 'var(--info)', border: 'var(--info)' },
  };
  const c = colorMap[type];
  return (
    <div className="sketch-ink" style={{
      padding: '12px 16px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 500,
      background: c.bg, color: c.fg, border: `1.25px solid ${c.border}`,
    }}>
      {children}
    </div>
  );
}