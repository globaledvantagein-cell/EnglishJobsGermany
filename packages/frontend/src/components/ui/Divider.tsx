'use client';

import type { CSSProperties } from 'react';

export function Divider({ style }: { style?: CSSProperties }) {
  return <hr style={{ border: 'none', borderTop: '1.25px solid var(--ink-border, var(--border))', ...style }} />;
}