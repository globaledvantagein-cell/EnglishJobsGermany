'use client';

/**
 * DangerZone — self-service GDPR account deletion, at the foot of the Profile
 * tab. Deliberately two-step: an explicit modal, then typing DELETE, so the
 * button can never be hit by accident or by a stray tap on mobile.
 *
 * On success everything local is wiped (token, user, the ejg_cache_ entries,
 * applied/pending job state) before logout, so no trace of the deleted account
 * survives a reload. On failure the session is left intact — a user whose
 * deletion half-failed and who has been logged out has no way back in to retry.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from '@/compat/router';
import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiDelete } from '../../utils/jobApi';
import { localClearAll } from '../../utils/cache';
import { Toast } from '../Toast';

const CONFIRM_WORD = 'DELETE';

/** Everything this app writes for a signed-in person, outside the ejg_cache_ prefix. */
const LOCAL_KEYS = ['ejg_token', 'ejg_user', 'ejg_applied_jobs', 'ejg_pending_apply'];

function clearLocalAccountData() {
  try {
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
    localClearAll(); // all ejg_cache_* entries
  } catch { /* storage unavailable — nothing to clear */ }
}

function ConfirmDialog({ onClose, onConfirm, deleting, error }: {
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  error: string | null;
}) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, deleting]);

  return (
    <div
      onClick={() => { if (!deleting) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm account deletion"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(20px, 5vw, 28px)',
          boxShadow: 'var(--shadow-lg)', position: 'relative',
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={deleting}
          aria-label="Close"
          className="no-touch-expand"
          style={{
            position: 'absolute', top: 12, right: 12, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: deleting ? 'default' : 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <X size={18} />
        </button>

        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 11,
          background: 'var(--danger-soft)', color: 'var(--danger)',
        }}>
          <AlertTriangle size={19} />
        </span>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: '12px 0 0', letterSpacing: '-0.02em' }}>
          Delete your account?
        </h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 0' }}>
          Are you sure you want to delete your account? This will permanently remove all your data
          including saved jobs, applied jobs, and premium access. This cannot be undone.
        </p>

        <label htmlFor="confirm-delete-input" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '18px 0 6px' }}>
          Type <strong style={{ color: 'var(--danger)', letterSpacing: '0.06em' }}>{CONFIRM_WORD}</strong> to confirm
        </label>
        <input
          id="confirm-delete-input"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          disabled={deleting}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={CONFIRM_WORD}
          style={{
            width: '100%', height: 44, padding: '0 14px',
            fontFamily: 'inherit', fontSize: '0.9rem', letterSpacing: '0.06em',
            background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
            border: `1px solid ${armed ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 10, outline: 'none',
          }}
        />

        {error && (
          <p role="alert" style={{ fontSize: '0.82rem', color: 'var(--danger)', margin: '10px 0 0', lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            style={{
              flex: 1, height: 44, background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'inherit',
              fontSize: '0.9rem', fontWeight: 600, cursor: deleting ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!armed || deleting}
            style={{
              flex: 1, height: 44, background: 'var(--danger)', color: '#fff',
              border: 'none', borderRadius: 10, fontFamily: 'inherit',
              fontSize: '0.9rem', fontWeight: 700,
              cursor: !armed || deleting ? 'default' : 'pointer',
              opacity: !armed || deleting ? 0.5 : 1,
              transition: 'opacity 0.16s ease',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DangerZone() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiDelete('/api/auth/account');
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : 'Could not delete your account. Please try again.');
      return; // stay signed in so the user can retry
    }
    clearLocalAccountData();
    logout();
    setOpen(false);
    setDeleting(false);
    setToast('Your account has been deleted');
    navigate('/');
  };

  const sectionStyle: CSSProperties = {
    borderTop: '1px solid var(--danger)',
    paddingTop: 16,
    marginTop: 8,
  };

  return (
    <>
      <section style={sectionStyle} aria-labelledby="danger-zone-heading">
        <h2 id="danger-zone-heading" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--danger)', margin: 0, letterSpacing: '-0.01em' }}>
          Danger Zone
        </h2>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '6px 0 0', maxWidth: 560 }}>
          Permanently delete your account and all associated data. This action cannot be undone.
          You will lose your saved jobs, applied jobs, preferences, and premium subscription.
        </p>
        <button
          type="button"
          onClick={() => { setError(null); setOpen(true); }}
          style={{
            marginTop: 12, height: 40, padding: '0 16px',
            background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 10,
            fontFamily: 'inherit', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <AlertTriangle size={15} /> Delete My Account
        </button>
      </section>

      {open && (
        <ConfirmDialog
          onClose={() => { if (!deleting) { setOpen(false); setError(null); } }}
          onConfirm={confirmDelete}
          deleting={deleting}
          error={error}
        />
      )}

      {toast && <Toast message={toast} type="success" onDismiss={() => setToast(null)} />}
    </>
  );
}
