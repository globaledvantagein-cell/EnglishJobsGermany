'use client';

/**
 * Non-blocking toast that asks "Did you apply to X?" when the user returns
 * from an external ATS tab. Auto-dismisses after 15 seconds.
 */
import { useState, useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';

interface Props {
  jobTitle: string;
  company: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 15_000;

export default function ApplyConfirmToast({ jobTitle, company, onConfirm, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleConfirm = () => {
    setExiting(true);
    setTimeout(onConfirm, 200);
  };

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 200);
  };

  const displayTitle = jobTitle.length > 40 ? jobTitle.slice(0, 37) + '…' : jobTitle;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%',
      transform: `translateX(-50%) translateY(${visible && !exiting ? '0' : '20px'})`,
      opacity: visible && !exiting ? 1 : 0,
      transition: 'transform 0.3s ease, opacity 0.3s ease', zIndex: 9998,
      maxWidth: 'min(440px, calc(100vw - 32px))', width: '100%',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '14px 16px', background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <CheckCircle size={18} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              Did you apply?
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              {displayTitle} at {company}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', opacity: 0.5, padding: 2,
              display: 'flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginLeft: 28 }}>
          <button
            onClick={handleConfirm}
            style={{
              padding: '6px 16px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: '#fff',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Yes, I applied
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '6px 16px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}