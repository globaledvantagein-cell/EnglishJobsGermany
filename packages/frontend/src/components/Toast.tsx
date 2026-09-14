'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onDismiss: () => void;
}

/**
 * Lightweight toast notification — slides in from top, auto-dismisses.
 * Used for one-off messages like "You have been unsubscribed."
 */
export function Toast({ message, type = 'success', duration = 6000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const dismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  const colors = {
    success: { bg: 'var(--success-soft, #0d2818)', border: 'var(--success, #22c55e)', text: 'var(--success, #22c55e)' },
    error: { bg: 'var(--danger-soft, #2a0a0a)', border: 'var(--danger, #ef4444)', text: 'var(--danger, #ef4444)' },
    info: { bg: 'var(--primary-soft, #0a1628)', border: 'var(--primary, #6C9CFF)', text: 'var(--primary, #6C9CFF)' },
  };
  const c = colors[type];

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: `translateX(-50%) translateY(${visible && !exiting ? '0' : '-20px'})`,
        opacity: visible && !exiting ? 1 : 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        zIndex: 9999,
        maxWidth: 'min(480px, calc(100vw - 32px))',
        width: '100%',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <p style={{ flex: 1, margin: 0, fontSize: '0.88rem', color: c.text, fontWeight: 500, lineHeight: 1.4 }}>
          {message}
        </p>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: c.text, opacity: 0.6, flexShrink: 0, padding: 2,
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}