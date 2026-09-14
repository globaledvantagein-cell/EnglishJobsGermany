'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from './ui';

// The backend runs the whole pipeline in one request with no streaming, so we
// can't show real per-batch progress. This is an honest, time-based stepper:
// it advances through the known stages and parks on the last one until the
// network response arrives, at which point the parent unmounts it.
const STAGES = [
  'Parsing your resume',
  'Filtering active jobs',
  'Scoring matches (fast pass)',
  'Deep analysis of top matches',
  'Compiling your results',
];

// Rough dwell time per stage (ms) — purely cosmetic pacing toward ~12-15s.
const STAGE_MS = [2600, 1200, 7000, 4200, 100000];

interface Props {
  onCancel?: () => void;
}

export default function MatchProgress({ onCancel }: Props) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage >= STAGES.length - 1) return; // park on the final stage
    const t = setTimeout(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), STAGE_MS[stage]);
    return () => clearTimeout(t);
  }, [stage]);

  const pct = Math.round(((stage + 0.5) / STAGES.length) * 100);

  return (
    <div
      className="sketch-ink sketch-surface"
      style={{
        background: 'var(--surface-solid)',
        border: '1.25px solid var(--ink-border, var(--border))',
        borderRadius: 14,
        padding: '26px 24px',
      }}
    >
      <div style={{ display: 'grid', gap: 12, marginBottom: 22 }}>
        {STAGES.map((label, i) => {
          const isDone = i < stage;
          const isActive = i === stage;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDone ? 'var(--success-soft)' : isActive ? 'var(--primary-soft)' : 'var(--paper2)',
                  color: isDone ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--subtle-ink)',
                  border: `1.25px solid ${isDone ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {isDone ? (
                  <Check size={13} strokeWidth={3} />
                ) : isActive ? (
                  <Loader2 size={13} strokeWidth={3} style={{ animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                )}
              </span>
              <span
                style={{
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isDone || isActive ? 'var(--ink)' : 'var(--muted-ink)',
                }}
              >
                {label}
                {isActive && '…'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Indeterminate-ish progress bar */}
      <div style={{ height: 8, borderRadius: 999, background: 'var(--paper2)', overflow: 'hidden', marginBottom: 6 }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--primary)',
            borderRadius: 999,
            transition: 'width 0.8s cubic-bezier(0.2,0.8,0.2,1)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted-ink)' }}>
          This usually takes 12–15 seconds.
        </p>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X size={14} />
            Cancel
          </Button>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}