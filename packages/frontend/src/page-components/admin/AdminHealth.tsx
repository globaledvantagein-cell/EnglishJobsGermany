'use client';

/**
 * /admin/health — every backend health check, grouped.
 *
 * Problems are listed first in their own band; the grouped grid below shows
 * the full picture. Refreshes every 5 minutes while the tab is visible (each
 * run exercises real API routes and the AI key pools, so faster polling would
 * cost more than it tells you).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../../utils/jobApi';
import { Btn, Dot, Empty, Page, Panel, Pill, SkeletonRows, errorText, type Tone } from '../../components/admin/primitives';

interface Check { key: string; label: string; group: string; critical: boolean; status: 'ok' | 'warn' | 'fail'; latencyMs: number; detail: string }
interface Health { overall: 'operational' | 'degraded' | 'down'; timestamp: string; checks: Check[] }

const REFRESH_MS = 5 * 60_000;
const TONE: Record<string, Tone> = { ok: 'ok', warn: 'warn', fail: 'bad', operational: 'ok', degraded: 'warn', down: 'bad' };
const OVERALL_LABEL: Record<string, string> = { operational: 'All systems operational', degraded: 'Partially degraded', down: 'Down' };

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="adm-row" style={{ padding: '0 10px', minHeight: 'var(--adm-row)', borderBottom: '1px solid var(--adm-line)' }} title={check.detail}>
      <Dot tone={TONE[check.status]} />
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{check.label}</span>
      {check.critical && <Pill tone="outline">critical</Pill>}
      <span className="adm-muted adm-truncate adm-grow">{check.detail || '—'}</span>
      <span className="adm-muted adm-num" style={{ minWidth: 48, fontSize: 11.5 }}>{check.latencyMs}ms</span>
    </div>
  );
}

export default function AdminHealth() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Wall-clock time lives in state (ticked once a second) so render stays pure.
  const [now, setNow] = useState(() => Date.now());
  const [nextAt, setNextAt] = useState(() => Date.now() + REFRESH_MS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiGet<Health>('/api/admin/health'));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
      setNextAt(Date.now() + REFRESH_MS);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // One timer drives both the countdown label and the auto-refresh.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const current = Date.now();
      setNow(current);
      if (current >= nextAt && !loading) load();
    }, 1000);
    return () => window.clearInterval(id);
  }, [nextAt, loading, load]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, Check[]>();
    (data?.checks ?? []).forEach(c => byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]));
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const problems = (data?.checks ?? []).filter(c => c.status !== 'ok')
    .sort((a, b) => Number(b.status === 'fail') - Number(a.status === 'fail') || Number(b.critical) - Number(a.critical));

  const secondsLeft = Math.max(0, Math.round((nextAt - now) / 1000));
  const overall = error ? 'down' : data?.overall;

  return (
    <Page
      title={
        <span className="adm-row" style={{ gap: 8 }}>
          <Dot tone={overall ? TONE[overall] : 'neutral'} />
          {error ? 'Health endpoint unreachable' : data ? OVERALL_LABEL[data.overall] ?? data.overall : 'Checking…'}
        </span>
      }
      sub={data ? `${data.checks.length - problems.length}/${data.checks.length} checks ok · last run ${new Date(data.timestamp).toLocaleTimeString()} · next in ${secondsLeft > 60 ? `${Math.ceil(secondsLeft / 60)}m` : `${secondsLeft}s`}` : undefined}
      actions={<Btn onClick={load} loading={loading}><RefreshCw size={13} />Run checks</Btn>}
    >
      {loading && !data ? <SkeletonRows rows={12} cols={3} /> : error && !data ? (
        <Empty title="Could not reach /api/admin/health" body={error} action={<Btn onClick={load}>Retry</Btn>} />
      ) : (
        <div className="adm-stack">
          {problems.length > 0 && (
            <Panel title="Needs attention" meta={`${problems.length}`} flush>
              {problems.map(c => <CheckRow key={c.key} check={c} />)}
            </Panel>
          )}
          {/* CSS columns pack groups of different heights without the gaps a grid leaves. */}
          <div style={{ columnWidth: 380, columnGap: 'var(--adm-gap)' }}>
            {groups.map(([group, checks]) => {
              const bad = checks.filter(c => c.status !== 'ok').length;
              return (
                <div key={group} style={{ breakInside: 'avoid', marginBottom: 'var(--adm-gap)' }}>
                <Panel
                  title={<span className="adm-row"><Dot tone={bad ? (checks.some(c => c.status === 'fail') ? 'bad' : 'warn') : 'ok'} />{group}</span>}
                  meta={`${checks.length - bad}/${checks.length}`}
                  flush
                >
                  {checks.map(c => <CheckRow key={c.key} check={c} />)}
                </Panel>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Page>
  );
}
