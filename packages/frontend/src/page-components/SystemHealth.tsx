'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

const PING_INTERVAL_S = 600;
const STATUS_COLORS: Record<string, string> = { ok: '#22C55E', warn: '#F59E0B', fail: '#EF4444' };
const OVERALL_META: Record<string, { dot: string; label: string }> = {
  operational: { dot: '#22C55E', label: 'Operational' },
  degraded: { dot: '#F59E0B', label: 'Partially degraded' },
  down: { dot: '#EF4444', label: 'Down' },
  unreachable: { dot: '#94A3B8', label: 'Unreachable' },
};

interface Check {
  key: string; label: string; group: string; critical: boolean;
  status: 'ok' | 'warn' | 'fail'; latencyMs: number; detail: string;
}
interface Health { overall: string; timestamp: string; checks: Check[] }

export default function SystemHealth() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [countdown, setCountdown] = useState(PING_INTERVAL_S);
  const countdownRef = useRef(PING_INTERVAL_S);

  const ping = useCallback(async () => {
    try {
      // verifyToken reads `Authorization: Bearer` ONLY — it never looks at
      // cookies, so credentials:'include' alone returns 401 on every ping.
      const token = localStorage.getItem('ejg_token');
      const res = await fetch('/api/admin/health', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    } finally {
      setLoading(false);
      countdownRef.current = PING_INTERVAL_S;
      setCountdown(PING_INTERVAL_S);
    }
  }, []);

  useEffect(() => {
    ping();
    const id = setInterval(() => {
      if (document.hidden) return;
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      // Reset before the await too: ping() is async, and a ref left at <=0
      // would fire a fresh request on every tick until it resolved.
      if (countdownRef.current <= 0) { countdownRef.current = PING_INTERVAL_S; ping(); }
    }, 1000);
    return () => clearInterval(id);
  }, [ping]);

  const meta = OVERALL_META[unreachable ? 'unreachable' : (data?.overall ?? 'operational')];
  const checks = [...(data?.checks ?? [])].sort((a, b) =>
    a.critical !== b.critical ? (a.critical ? -1 : 1) : a.group.localeCompare(b.group));

  return (
    <div style={{ padding: '12px 24px', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: meta.dot, verticalAlign: 'middle' }} />
          <span style={{ fontWeight: 700, fontSize: '1rem', marginLeft: 8, verticalAlign: 'middle' }}>
            {loading ? 'Checking…' : meta.label}
          </span>
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span>
            {data && !unreachable && `Last check ${new Date(data.timestamp).toLocaleTimeString()} · `}
            Next in {countdown > 60 ? `${Math.ceil(countdown / 60)}m` : `${Math.max(countdown, 0)}s`}
          </span>
          <button
            type="button"
            onClick={() => { setLoading(true); ping(); }}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'inherit' }}
          >
            Refresh
          </button>
        </span>
      </div>

      <div className="health-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {checks.map(c => (
          <div key={c.key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${STATUS_COLORS[c.status]}`, borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[c.status], marginRight: 6 }} />
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>{c.label}</span>
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{c.latencyMs}ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span title={c.detail} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                {c.detail || '—'}
              </span>
              {c.critical && (
                <span style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  Critical
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 1100px) { .health-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 768px)  { .health-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px)  { .health-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
