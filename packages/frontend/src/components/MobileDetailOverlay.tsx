'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface MobileDetailOverlayProps {
  onBack: () => void;
  backLabel?: string;
  children: ReactNode;
}

/**
 * Shared mobile detail overlay used across split-view admin pages.
 * Provides a full-screen overlay with a back button and scrollable content area.
 */
export default function MobileDetailOverlay({ onBack, backLabel = 'Back to list', children }: MobileDetailOverlayProps) {
  return (
    <div className="mobile-detail-overlay">
      <div className="mobile-detail-header">
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', padding: '4px 0' }}
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>
      </div>
      <div className="mobile-detail-body">
        {children}
      </div>
    </div>
  );
}