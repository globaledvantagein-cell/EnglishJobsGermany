'use client';

/**
 * Phone filters: a full-screen view (the Airbnb / LinkedIn mobile filter
 * pattern). Shared by the German and remote job pages (DashboardFilterBar /
 * RemoteFilterBar), which pass their filter controls as children.
 *
 *   ┌──────────────────────────┐
 *   │ Filters                ✕ │  header (solid)
 *   ├──────────────────────────┤
 *   │ Company / Category / …   │  scrolls
 *   │ …                        │
 *   ├──────────────────────────┤
 *   │ Clear all  [Show 2,710]  │  footer: its OWN position:fixed element
 *   └──────────────────────────┘
 *
 * Why it is built this way (iOS 26 Safari, learned from the user's iPhone):
 *  - Safari 26.0 never draws position:fixed content below its floating
 *    toolbar (developer.apple.com/forums/thread/800798), so no layer can be
 *    stretched behind it.
 *  - Instead Safari tints the strip under the toolbar with the
 *    background-color of a position:fixed element at the bottom edge — the
 *    element's OWN background; absolute children are ignored. Our earlier
 *    sheet/panel was an absolute child of a transparent fixed root, so Safari
 *    showed the page through that strip. Here the footer is a fixed element
 *    with a solid background, so the strip continues it (like Airbnb's
 *    bottom bar).
 *  - Full screen: no half-dimmed page left or right of a panel for the strip
 *    to disagree with.
 *
 * Portaled to <body>: inside a page-wash, iOS Safari clips position:fixed
 * children (WebKit bug 160953).
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePageCover } from '../../hooks/usePageCover';

interface Props {
  matchCount: number;
  hasActiveFilters: boolean;
  onClear: () => void;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileFilterPanel({ matchCount, hasActiveFilters, onClear, onClose, children }: Props) {
  // Lock page scroll. Hiding the page under iOS Safari's glass toolbar is CSS
  // ("Page cover for overlays on iOS Safari" in app/globals.css).
  usePageCover(true);
  // Close on Escape (hardware keyboards).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="m-filters" role="dialog" aria-modal="true" aria-label="Filters">
      <header className="m-filters-head">
        <span className="m-filters-title">Filters</span>
        <button type="button" className="m-filters-close" onClick={onClose} aria-label="Close filters">
          <X size={20} />
        </button>
      </header>
      <div className="m-filters-body">{children}</div>
      <footer className="m-filters-foot">
        <button
          type="button"
          className="m-filters-clear"
          onClick={() => { onClear(); onClose(); }}
          disabled={!hasActiveFilters}
        >
          Clear all
        </button>
        <button type="button" className="m-filters-apply" onClick={onClose}>
          Show {matchCount.toLocaleString()} {matchCount === 1 ? 'job' : 'jobs'}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
