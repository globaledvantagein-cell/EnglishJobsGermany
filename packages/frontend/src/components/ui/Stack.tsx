'use client';

import type { ReactNode } from 'react';

export function Stack({ children, gap = 16, dir = 'col', align, justify, wrap, className = '' }: {
  children: ReactNode; gap?: number; dir?: 'row' | 'col'; align?: string; justify?: string; wrap?: boolean; className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: dir === 'col' ? 'column' : 'row', gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined }}
    >
      {children}
    </div>
  );
}