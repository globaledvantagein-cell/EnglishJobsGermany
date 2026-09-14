'use client';

import { forwardRef } from 'react';
import type { CSSProperties, SelectHTMLAttributes } from 'react';

const INPUT_STYLE: CSSProperties = {
  width: '100%', padding: '12px 14px',
  fontFamily: 'inherit', fontSize: '0.925rem',
  background: 'var(--surface-solid)',
  color: 'var(--ink)',
  border: '1.25px solid var(--ink-border, var(--border))',
  borderRadius: '10px', outline: 'none',
  transition: 'border-color 0.22s, box-shadow 0.22s',
};

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ error, style, onFocus, onBlur, children, className = '', ...rest }, ref) => (
    <div style={{ width: '100%', position: 'relative' }}>
      <select
        ref={ref}
        className={`sketch-ink ${className}`}
        style={{
          ...INPUT_STYLE,
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236F6F6F' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: 36,
          cursor: 'pointer',
          ...style
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--focus-ring)'; onFocus?.(e); }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--ink-border, var(--border))'; e.currentTarget.style.boxShadow = 'none'; onBlur?.(e); }}
        {...rest}
      >
        {children}
      </select>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 5, fontWeight: 500 }}>{error}</p>}
    </div>
  )
);