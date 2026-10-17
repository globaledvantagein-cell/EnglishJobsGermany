'use client';

/**
 * Admin UI primitives. Deliberately small and unopinionated: each one maps to
 * an .adm-* class in admin.css, so pages compose them rather than inlining
 * styles. Nothing here is used by the public site.
 */
import type { ButtonHTMLAttributes, ReactNode, InputHTMLAttributes } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Link } from '@/compat/router';

export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'outline' | 'neutral';

// ── Buttons ──────────────────────────────────────────────────────────────────

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ok' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  icon?: boolean;
  loading?: boolean;
  kbd?: string;
}

export function Btn({ variant = 'default', size = 'md', icon, loading, kbd, children, disabled, type = 'button', className, ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={className ? `adm-btn ${className}` : 'adm-btn'}
      data-variant={variant}
      data-size={size}
      data-icon={icon ? 'true' : undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={13} className="adm-spin" /> : null}
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

export function LinkBtn({ to, children, variant = 'default', external }: { to: string; children: ReactNode; variant?: BtnProps['variant']; external?: boolean }) {
  if (external) {
    return <a className="adm-btn" data-variant={variant} href={to} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <Link to={to} className="adm-btn" data-variant={variant}>{children}</Link>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="adm-kbd">{children}</kbd>;
}

// ── Status ───────────────────────────────────────────────────────────────────

export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className="adm-pill" data-tone={tone} title={title}>{children}</span>;
}

export function Dot({ tone = 'neutral', title }: { tone?: Tone; title?: string }) {
  return <span className="adm-dot" data-tone={tone} title={title} />;
}

/** Confidence scores arrive as 0–1 (current) or 0–100 (legacy rows). */
export function normalizeConfidence(score?: number | null): number {
  if (score == null || Number.isNaN(score)) return 0;
  return score > 1 ? score / 100 : score;
}

export function confidenceTone(score?: number | null): Tone {
  const value = normalizeConfidence(score);
  if (value >= 0.85) return 'ok';
  if (value >= 0.6) return 'warn';
  return 'bad';
}

export function Meter({ value }: { value?: number | null }) {
  const normalized = normalizeConfidence(value);
  const tone = confidenceTone(value);
  return (
    <span className="adm-meter" data-tone={tone} title={`Confidence ${Math.round(normalized * 100)}%`}>
      <span style={{ minWidth: 28, textAlign: 'right' }}>{Math.round(normalized * 100)}%</span>
      <span className="adm-meter-track"><span className="adm-meter-fill" style={{ width: `${normalized * 100}%` }} /></span>
    </span>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export function SearchInput({ value, onChange, placeholder = 'Search…', width = 220, inputRef }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="adm-search" style={{ width }}>
      <Search size={13} />
      <input
        ref={inputRef}
        className="adm-input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { onChange(''); (e.target as HTMLInputElement).blur(); } }}
      />
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="adm-input" {...props} />;
}

export function Field({ label, hint, children, span }: { label: string; hint?: ReactNode; children: ReactNode; span?: number }) {
  return (
    <label className="adm-field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <span>{label}</span>
      {children}
      {hint && <span className="adm-field-hint">{hint}</span>}
    </label>
  );
}

export interface SegOption<T extends string> { value: T; label: ReactNode; count?: number }

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: ReadonlyArray<SegOption<T>>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="adm-seg" role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count != null && <span className="adm-seg-count">{option.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function Page({ title, sub, actions, children, flush }: {
  title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean;
}) {
  return (
    <section className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-page-title">{title}</h1>
        {sub != null && <span className="adm-page-sub">{sub}</span>}
        {actions && <div className="adm-page-actions">{actions}</div>}
      </header>
      <div className="adm-page-body" data-flush={flush ? 'true' : undefined}>{children}</div>
    </section>
  );
}

export function Panel({ title, meta, actions, children, bodyStyle, flush }: {
  title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode;
  bodyStyle?: React.CSSProperties; flush?: boolean;
}) {
  return (
    <section className="adm-panel">
      {title && (
        <header className="adm-panel-head">
          <span>{title}</span>
          {meta && <span className="adm-muted">{meta}</span>}
          {actions && <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>{actions}</span>}
        </header>
      )}
      <div className={flush ? undefined : 'adm-panel-body'} style={bodyStyle}>{children}</div>
    </section>
  );
}

export interface KpiItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'accent' | 'warn' | 'bad';
  href?: string;
}

export function Kpis({ items, loading }: { items: KpiItem[]; loading?: boolean }) {
  return (
    <div className="adm-kpis">
      {items.map(item => {
        const content = (
          <>
            <div className="adm-kpi-label">{item.label}</div>
            <div className="adm-kpi-value">{loading ? <span className="adm-skel" style={{ display: 'inline-block', width: 48, height: 18 }} /> : item.value}</div>
            {item.note != null && <div className="adm-kpi-note">{item.note}</div>}
          </>
        );
        return item.href
          ? <Link key={item.label} to={item.href} className="adm-kpi" data-tone={item.tone}>{content}</Link>
          : <div key={item.label} className="adm-kpi" data-tone={item.tone}>{content}</div>;
      })}
    </div>
  );
}

export function DefinitionGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="adm-dl">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd title={typeof value === 'string' ? value : undefined}>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="adm-empty">
      <strong>{title}</strong>
      {body && <span>{body}</span>}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 12, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: '6px 10px' }}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={{ display: 'flex', gap: 12, height: 'var(--adm-row)', alignItems: 'center' }}>
          {Array.from({ length: cols }, (_, col) => (
            <span key={col} className="adm-skel" style={{ height: 10, flex: col === 0 ? 3 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtNumber(value?: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : value.toLocaleString('en-GB');
}

export function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "24 Sep 26" — fits a narrow table column. */
export function fmtShortDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3);
  return `${date.getDate()} ${month} ${String(date.getFullYear()).slice(2)}`;
}

/** "3m", "5h", "2d", "4w" — compact enough for a table cell. */
export function fmtAge(value?: string | null): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return '—';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

/** Cell-sized description of an error from apiGet/apiPost. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}
