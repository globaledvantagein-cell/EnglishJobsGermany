'use client';

/**
 * Right-hand side drawer for on-demand detail (progressive disclosure: the
 * dashboard shows the summary, the drawer the full breakdown). Esc, the
 * backdrop and the close button all dismiss it; focus moves into it on open.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Btn } from './primitives';

export function Drawer({ open, title, sub, onClose, children, width = 440 }: {
  open: boolean; title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; width?: number;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="adm-drawer-root">
      <div className="adm-drawer-backdrop" onClick={onClose} />
      <aside className="adm-drawer" role="dialog" aria-modal="true" tabIndex={-1} ref={panelRef} style={{ width }}>
        <header className="adm-detail-head adm-row" style={{ alignItems: 'flex-start' }}>
          <div className="adm-grow" style={{ minWidth: 0 }}>
            <h2 className="adm-detail-title adm-truncate">{title}</h2>
            {sub && <div className="adm-muted" style={{ fontSize: 12 }}>{sub}</div>}
          </div>
          <Btn icon variant="ghost" onClick={onClose} title="Close (Esc)"><X size={15} /></Btn>
        </header>
        <div className="adm-detail-scroll">{children}</div>
      </aside>
    </div>
  );
}
