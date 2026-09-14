'use client';

import type { CSSProperties } from 'react';

/**
 * Tiny gold "PRO" pill — the always-visible premium status signal.
 * Used next to the username in the nav and beside the posted date on the job
 * detail. Gold on dark navy reads as premium in both light and dark themes.
 */
export function ProBadge({ style }: { style?: CSSProperties }) {
  return (
    <span style={{
      background: '#FFD700', color: '#1a1a2e',
      fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.05em',
      padding: '1px 5px', borderRadius: 3,
      display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle',
      lineHeight: 1.5, flexShrink: 0,
      ...style,
    }}>
      PRO
    </span>
  );
}
