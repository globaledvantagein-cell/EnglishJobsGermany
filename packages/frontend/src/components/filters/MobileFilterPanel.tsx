'use client';

/**
 * Phone filter panel: slides in from the right, full height, over a dimmed
 * page. Shared by the German and remote job pages (DashboardFilterBar /
 * RemoteFilterBar), which pass their filter controls as children.
 *
 *   ┌──────────────────────────┐
 *   │ Filters        Clear   ✕ │  ← header: title + actions
 *   │ [   Show 2,710 jobs    ] │  ← the apply button lives at the TOP
 *   │ ──────────────────────── │
 *   │ Company / Category / …   │  ← scrolls
 *   │ …                        │
 *   └──────────────────────────┘  runs to the screen edge, behind Safari
 *
 * Why the button is at the top: on iOS 26 Safari's translucent floating
 * toolbar covers the bottom of the screen, so a bottom-pinned button needs an
 * empty strip under it to stay tappable. With the action in the header (the
 * iOS sheet pattern — "Done" at the top) the panel's bottom is just scrolling
 * content and can run behind the toolbar like iOS's own sheets.
 *
 * Portaled to <body>: inside a page-wash, iOS Safari clips position:fixed
 * children (WebKit bug 160953).
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  matchCount: number;
  hasActiveFilters: boolean;
  onClear: () => void;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileFilterPanel({ matchCount, hasActiveFilters, onClear, onClose, children }: Props) {
  // Lock page scroll behind the panel and close on Escape (hardware keyboards).
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="m-sheet" role="dialog" aria-modal="true" aria-label="Filters">
      <div className="m-sheet-backdrop" onClick={onClose} />
      <aside className="m-panel">
        <header className="m-panel-head">
          <div className="m-panel-titlebar">
            <span className="m-panel-title">Filters</span>
            {hasActiveFilters && (
              <button type="button" className="m-panel-clear" onClick={() => { onClear(); onClose(); }}>Clear all</button>
            )}
            <button type="button" className="m-panel-close" onClick={onClose} aria-label="Close filters">
              <X size={18} />
            </button>
          </div>
          <button type="button" className="m-panel-apply" onClick={onClose}>
            Show {matchCount.toLocaleString()} {matchCount === 1 ? 'job' : 'jobs'}
          </button>
        </header>
        <div className="m-panel-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
