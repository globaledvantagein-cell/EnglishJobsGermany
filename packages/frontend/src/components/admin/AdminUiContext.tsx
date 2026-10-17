'use client';

/**
 * Toasts + confirm dialog for the admin shell.
 *
 *   const { toast, confirm } = useAdminUi();
 *   toast('Saved');
 *   toast('Rejected “Engineer”', { action: { label: 'Undo', onClick: undo } });
 *   if (await confirm({ title: 'Delete?', body: '…', danger: true })) …
 *
 * Replaces window.confirm (blocks the page, unstyled) and the old inline result
 * banners that pushed page content down.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ToastAction { label: string; onClick: () => void }
interface ToastOptions { tone?: 'default' | 'bad'; action?: ToastAction; durationMs?: number }
interface ToastItem extends ToastOptions { id: number; message: ReactNode }

interface ConfirmOptions { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }

interface AdminUiValue {
  toast: (message: ReactNode, options?: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AdminUiContext = createContext<AdminUiValue | null>(null);

const DEFAULT_TOAST_MS = 4000;
const MAX_TOASTS = 4;

export function AdminUiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: ReactNode, options: ToastOptions = {}) => {
    const id = nextId.current++;
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, ...options }]);
    window.setTimeout(() => dismiss(id), options.durationMs ?? DEFAULT_TOAST_MS);
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions) => (
    new Promise<boolean>(resolve => setDialog({ ...options, resolve }))
  ), []);

  const closeDialog = useCallback((ok: boolean) => {
    setDialog(current => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(false); }
      if (e.key === 'Enter') { e.preventDefault(); closeDialog(true); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, closeDialog]);

  return (
    <AdminUiContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="adm-toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="adm-toast" data-tone={t.tone}>
            <span className="adm-toast-msg">{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} style={{ width: 24, padding: 0 }}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="adm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeDialog(false); }}>
          <div className="adm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="adm-dialog-title">
            <div className="adm-dialog-body">
              <h2 id="adm-dialog-title">{dialog.title}</h2>
              {dialog.body && <p>{dialog.body}</p>}
            </div>
            <div className="adm-dialog-foot">
              <button type="button" className="adm-btn" onClick={() => closeDialog(false)}>Cancel</button>
              <button
                type="button"
                className="adm-btn"
                data-variant={dialog.danger ? 'danger' : 'primary'}
                autoFocus
                onClick={() => closeDialog(true)}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminUiContext.Provider>
  );
}

export function useAdminUi(): AdminUiValue {
  const value = useContext(AdminUiContext);
  if (!value) throw new Error('useAdminUi must be used inside <AdminUiProvider>');
  return value;
}
