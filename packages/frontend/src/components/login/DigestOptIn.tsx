'use client';

import { Check } from 'lucide-react';
import { CONTENT } from '../../theme/content';

const CATEGORY_OPTIONS = [
  ...CONTENT.signup.form.categoryOptions.Tech,
  ...CONTENT.signup.form.categoryOptions['Non-Tech'],
];

interface Props {
  wantsDigest: boolean;
  onToggleDigest: (next: boolean) => void;
  selectedCategories: string[];
  onToggleCategory: (value: string) => void;
}

export default function DigestOptIn({
  wantsDigest, onToggleDigest, selectedCategories, onToggleCategory,
}: Props) {
  return (
    <>
      <label
        htmlFor="digest-toggle"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: wantsDigest ? 'var(--acid-soft, rgba(5,150,105,0.08))' : 'transparent',
          border: `1.25px solid ${wantsDigest ? 'var(--acid, #059669)' : 'var(--border)'}`,
          borderRadius: 10, cursor: 'pointer',
          transition: 'background 0.18s, border-color 0.18s', userSelect: 'none',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 18, height: 18, borderRadius: 5,
            border: `1.5px solid ${wantsDigest ? 'var(--acid, #059669)' : 'var(--border-strong, var(--subtle-ink))'}`,
            background: wantsDigest ? 'var(--acid, #059669)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.18s',
          }}
        >
          {wantsDigest && <Check size={12} color="#fff" strokeWidth={3.5} />}
        </span>
        <input
          id="digest-toggle"
          type="checkbox"
          checked={wantsDigest}
          onChange={e => onToggleDigest(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--ink)', fontWeight: 500, lineHeight: 1.35 }}>
          Send me weekly job alerts
          <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted-ink)', fontWeight: 400, marginTop: 2 }}>
            Curated digest every Monday
          </span>
        </span>
      </label>

      {wantsDigest && (
        <div
          className="anim-fade-in"
          style={{
            marginTop: 10, padding: '12px 14px',
            background: 'var(--paper2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
        >
          <p style={{
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-ink)',
            margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Choose your interests
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORY_OPTIONS.map(opt => {
              const isOn = selectedCategories.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggleCategory(opt.value)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px',
                    fontSize: '0.74rem', fontWeight: 600, fontFamily: 'inherit',
                    borderRadius: 7, cursor: 'pointer',
                    transition: 'background 0.18s, color 0.18s, border-color 0.18s',
                    border: isOn ? '1.25px solid var(--acid, #059669)' : '1.25px solid var(--border)',
                    background: isOn ? 'var(--acid-soft, rgba(5,150,105,0.12))' : 'var(--surface-solid, #fff)',
                    color: isOn ? 'var(--acid, #059669)' : 'var(--muted-ink)',
                  }}
                >
                  {isOn && <Check size={10} strokeWidth={3} />}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {selectedCategories.length === 0 && (
            <p style={{ fontSize: '0.7rem', color: 'var(--subtle-ink)', marginTop: 8, margin: '8px 0 0', fontStyle: 'italic' }}>
              Pick at least one to activate the digest
            </p>
          )}
        </div>
      )}
    </>
  );
}