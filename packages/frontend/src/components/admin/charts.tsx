'use client';

/**
 * Tiny, dependency-free admin charts. Single series only, so there's no
 * legend; the row label names the metric. Every bar carries a native <title>
 * tooltip ("18 Oct · 42"), and the hit area is the full column height so thin
 * bars are still easy to hover.
 *
 * Colour rules (dataviz skill): one hue (accent) for magnitude; status colours
 * only for deltas, and always with an arrow + text, never colour alone.
 */
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Bar sparkline. `height` px; bars fill the width, 1px gap between them. */
export function SparkBars({ values, dates, labels, height = 22, format = (v: number) => v.toLocaleString() }: {
  values: number[]; dates: string[];
  /** Per-bar tooltip label; overrides the day formatting (e.g. exact run times). */
  labels?: string[];
  height?: number; format?: (v: number) => string;
}) {
  const max = Math.max(1, ...values);
  const n = values.length;
  return (
    <svg className="adm-spark" viewBox={`0 0 ${n * 4} ${height}`} preserveAspectRatio="none" height={height} role="img"
      aria-label={`${n}-day trend, max ${format(max)}`}>
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(1.5, (v / max) * (height - 1)) : 0;
        return (
          // Index keys: bars are positional and dates may repeat (several runs a day).
          <g key={i}>
            <rect x={i * 4} y={0} width={4} height={height} fill="transparent" />
            {v > 0 ? <rect x={i * 4 + 0.5} y={height - h} width={3} height={h} rx={0.8} className="adm-spark-bar" />
              : <rect x={i * 4 + 0.5} y={height - 1} width={3} height={1} className="adm-spark-zero" />}
            <title>{`${labels?.[i] ?? (dates[i] ? fmtDay(dates[i]) : '')} · ${format(v)}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Change vs a previous period. `goodWhenUp=false` for churn, deletions… */
export function Delta({ now, prev, goodWhenUp = true }: { now: number; prev: number; goodWhenUp?: boolean }) {
  if (!prev && !now) return <span className="adm-delta" data-tone="flat"><Minus size={11} />0%</span>;
  if (!prev) return <span className="adm-delta" data-tone={goodWhenUp ? 'good' : 'bad'}><ArrowUpRight size={11} />new</span>;
  const change = (now - prev) / prev;
  const flat = Math.abs(change) < 0.005;
  const up = change > 0;
  const tone = flat ? 'flat' : up === goodWhenUp ? 'good' : 'bad';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="adm-delta" data-tone={tone} title={`${now.toLocaleString()} vs ${prev.toLocaleString()} in the previous period`}>
      <Icon size={11} />{`${up && !flat ? '+' : ''}${Math.round(change * 100)}%`}
    </span>
  );
}

/** Sequential heat cell: one hue, opacity by value (0–1). Text stays in ink. */
export function HeatCell({ value, children }: { value: number | null; children?: ReactNode }) {
  if (value == null) return <span className="adm-heat adm-muted">—</span>;
  return (
    <span className="adm-heat" style={{ ['--heat' as string]: String(Math.min(1, Math.max(0, value))) }}>
      {children ?? `${Math.round(value * 100)}%`}
    </span>
  );
}

/** Horizontal bar for funnels: width ∝ value / max. */
export function MeterBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0;
  return <span className="adm-hbar"><span style={{ width: `${pct}%` }} /></span>;
}
