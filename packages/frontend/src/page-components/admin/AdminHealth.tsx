'use client';

/**
 * /admin/health — every backend health check, one dense row each.
 *
 * Pattern: status-page uptime bars (GitHub Status, captured with REA;
 * Atlassian Statuspage, openstatus) compressed to one 28px table row per check:
 *
 *   ● Check [critical] │ ▮▮▮▮▮▮▮▮ last 48 runs │ uptime 14d │ p50 │ now │ detail
 *
 * Problems sort first; group headers are thin divider rows. Clicking a row
 * opens a side drawer with the full detail, latency trend and recent status
 * changes. History comes from the 10-minute background monitor
 * (healthRuns, 14 days; kill switch `healthMonitor`).
 *
 * Auto-refreshes every 5 minutes while the tab is visible.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../../utils/jobApi';
import { Drawer } from '../../components/admin/Drawer';
import { SparkBars } from '../../components/admin/charts';
import {
  Btn, DefinitionGrid, Dot, Empty, Kpis, Page, Pill, SearchInput, Seg, SkeletonRows, errorText, type Tone,
} from '../../components/admin/primitives';

type Status = 'ok' | 'warn' | 'fail';
interface Check { key: string; label: string; group: string; critical: boolean; status: Status; latencyMs: number; detail: string }
interface Point { at: string; status: Status; latencyMs: number }
interface CheckHistory { recent: Point[]; uptime: number | null; warnRate: number | null; p50: number | null; runs: number }
interface Health {
  overall: 'operational' | 'degraded' | 'down'; timestamp: string; checks: Check[];
  history: { windowDays: number; runCount: number; firstRunAt: string | null; overallRecent: Array<{ at: string; overall: string }>; checks: Record<string, CheckHistory> } | null;
}
type Filter = 'all' | 'issues' | 'critical';

const REFRESH_MS = 5 * 60_000;
const BARS = 48;
const TONE: Record<string, Tone> = { ok: 'ok', warn: 'warn', fail: 'bad', operational: 'ok', degraded: 'warn', down: 'bad' };
const OVERALL_LABEL: Record<string, string> = { operational: 'All systems operational', degraded: 'Partially degraded', down: 'Down' };
const RANK: Record<Status, number> = { fail: 0, warn: 1, ok: 2 };

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtUptime = (v: number | null | undefined) => (v == null ? '—' : v >= 0.9995 ? '100%' : `${(v * 100).toFixed(2)}%`);

/** Fixed-width strip of the last BARS runs; empty slots on the left until history fills. */
function HistoryBars({ points }: { points: Point[] }) {
  const pad = Math.max(0, BARS - points.length);
  return (
    <span className="adm-hbars" role="img" aria-label={`${points.filter(p => p.status === 'ok').length} of ${points.length} recent runs ok`}>
      {Array.from({ length: pad }, (_, i) => <span key={`pad-${i}`} data-s="none" />)}
      {points.map(p => <span key={p.at} data-s={p.status} title={`${fmtTime(p.at)} · ${p.status} · ${p.latencyMs}ms`} />)}
    </span>
  );
}

export default function AdminHealth() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
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

  const checks = useMemo(() => data?.checks ?? [], [data]);
  const hist = (key: string) => data?.history?.checks[key];
  const problems = checks.filter(c => c.status !== 'ok');

  // Groups, problems first inside each group; groups with problems first.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = checks.filter(c =>
      (filter === 'all' || (filter === 'issues' ? c.status !== 'ok' : c.critical))
      && (!q || `${c.label} ${c.group} ${c.detail}`.toLowerCase().includes(q)));
    const byGroup = new Map<string, Check[]>();
    visible.forEach(c => byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]));
    return [...byGroup.entries()]
      .map(([group, list]) => [group, list.sort((a, b) => RANK[a.status] - RANK[b.status] || Number(b.critical) - Number(a.critical))] as const)
      .sort(([ga, a], [gb, b]) => RANK[a[0].status] - RANK[b[0].status] || ga.localeCompare(gb));
  }, [checks, filter, query]);

  const kpis = useMemo(() => {
    const h = data?.history;
    const uptimes = checks.map(c => h?.checks[c.key]?.uptime).filter((v): v is number => v != null);
    const latencies = checks.map(c => c.latencyMs).sort((a, b) => a - b);
    const slowest = [...checks].sort((a, b) => b.latencyMs - a.latencyMs)[0];
    const flaky = checks.filter(c => (h?.checks[c.key]?.warnRate ?? 0) + (1 - (h?.checks[c.key]?.uptime ?? 1)) > 0.05).length;
    return {
      avgUptime: uptimes.length ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : null,
      median: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
      slowest, flaky,
    };
  }, [checks, data]);

  const secondsLeft = Math.max(0, Math.round((nextAt - now) / 1000));
  const overall = error ? 'down' : data?.overall;
  const active = checks.find(c => c.key === selected) ?? null;
  const activeHist = active ? hist(active.key) : undefined;

  // Status changes in the drawer's history (newest first).
  const changes = useMemo(() => {
    const list = activeHist?.recent ?? [];
    return list.filter((p, i) => i === 0 || p.status !== list[i - 1].status).reverse().slice(0, 12);
  }, [activeHist]);

  return (
    <Page
      title={
        <span className="adm-row" style={{ gap: 8 }}>
          <Dot tone={overall ? TONE[overall] : 'neutral'} />
          {error ? 'Health endpoint unreachable' : data ? OVERALL_LABEL[data.overall] ?? data.overall : 'Checking…'}
        </span>
      }
      sub={data ? `${checks.length - problems.length}/${checks.length} ok · last run ${new Date(data.timestamp).toLocaleTimeString()} · next in ${secondsLeft > 60 ? `${Math.ceil(secondsLeft / 60)}m` : `${secondsLeft}s`}` : undefined}
      actions={<Btn onClick={load} loading={loading}><RefreshCw size={13} />Run checks</Btn>}
    >
      {loading && !data ? <SkeletonRows rows={14} cols={5} /> : error && !data ? (
        <Empty title="Could not reach /api/admin/health" body={error} action={<Btn onClick={load}>Retry</Btn>} />
      ) : (
        <div className="adm-stack">
          <Kpis items={[
            { label: 'Checks passing', value: `${checks.length - problems.length}/${checks.length}`, note: `${checks.filter(c => c.critical).length} critical` },
            { label: 'Warnings', value: String(problems.filter(c => c.status === 'warn').length), tone: problems.some(c => c.status === 'warn') ? 'warn' : undefined, note: 'degraded, still serving' },
            { label: 'Failures', value: String(problems.filter(c => c.status === 'fail').length), tone: problems.some(c => c.status === 'fail') ? 'bad' : undefined, note: `${problems.filter(c => c.status === 'fail' && c.critical).length} critical` },
            { label: `Uptime · ${data?.history?.windowDays ?? 14}d`, value: fmtUptime(kpis.avgUptime), note: `avg over ${data?.history?.runCount ?? 0} runs` },
            { label: 'Flaky checks', value: String(kpis.flaky), note: '>5% non-ok runs', tone: kpis.flaky ? 'warn' : undefined },
            { label: 'Median latency', value: kpis.median != null ? `${kpis.median}ms` : '—', note: 'this run' },
            { label: 'Slowest', value: kpis.slowest ? `${kpis.slowest.latencyMs}ms` : '—', note: kpis.slowest?.label },
          ]} />

          {/* Fills the rest of the screen; only the table scrolls (sticky header). */}
          <div className="adm-panel adm-health-panel">
            <div className="adm-toolbar">
              <Seg<Filter> label="Filter" value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All', count: checks.length },
                { value: 'issues', label: 'Issues', count: problems.length },
                { value: 'critical', label: 'Critical', count: checks.filter(c => c.critical).length },
              ]} />
              <span className="adm-grow" />
              <span className="adm-muted adm-hide-sm" style={{ fontSize: 11.5 }}>
                Bars = last {BARS} runs (≈ every 10 min){data?.history?.firstRunAt ? ` · history since ${fmtTime(data.history.firstRunAt)}` : ''}
              </span>
              <SearchInput value={query} onChange={setQuery} placeholder="Filter checks" width={170} />
            </div>
            <div style={{ overflow: 'auto' }}>
              <table className="adm-health">
                <thead>
                  <tr>
                    <th style={{ width: 22 }} />
                    <th>Check</th>
                    <th className="adm-hide-sm">Last {BARS} runs</th>
                    <th style={{ width: 70, textAlign: 'right' }}>Uptime</th>
                    <th className="adm-hide-sm" style={{ width: 56, textAlign: 'right' }} title="Median latency over the history window">p50</th>
                    <th style={{ width: 56, textAlign: 'right' }}>Now</th>
                    <th className="adm-hide-sm" style={{ width: '30%' }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.length === 0 && (
                    <tr><td colSpan={7}><Empty title="No checks match" body="Try another filter." /></td></tr>
                  )}
                  {grouped.map(([group, list]) => {
                    const bad = list.filter(c => c.status !== 'ok').length;
                    return (
                      <Fragment key={group}>
                        <tr className="adm-health-group">
                          <td colSpan={7}>
                            <span className="adm-row" style={{ gap: 6 }}>
                              <Dot tone={list.some(c => c.status === 'fail') ? 'bad' : bad ? 'warn' : 'ok'} />
                              {group}<span className="adm-muted">{list.length - bad}/{list.length}</span>
                            </span>
                          </td>
                        </tr>
                        {list.map(c => {
                          const h = hist(c.key);
                          return (
                            <tr key={c.key} onClick={() => setSelected(c.key)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelected(c.key); }} data-status={c.status}>
                              <td><Dot tone={TONE[c.status]} /></td>
                              <td>
                                <span className="adm-row" style={{ gap: 6 }}>
                                  <span className="adm-cell-strong adm-truncate">{c.label}</span>
                                  {c.critical && <Pill tone="outline">critical</Pill>}
                                </span>
                              </td>
                              <td className="adm-hide-sm"><HistoryBars points={h?.recent ?? []} /></td>
                              <td className="adm-num" style={{ textAlign: 'right' }} title={h ? `${h.runs} runs` : undefined}>{fmtUptime(h?.uptime)}</td>
                              <td className="adm-num adm-muted adm-hide-sm" style={{ textAlign: 'right' }}>{h?.p50 != null ? `${h.p50}ms` : '—'}</td>
                              <td className="adm-num" style={{ textAlign: 'right', color: c.latencyMs > 1000 ? 'var(--adm-warn)' : undefined }}>{c.latencyMs}ms</td>
                              <td className="adm-hide-sm"><span className="adm-muted adm-truncate" style={{ display: 'block' }} title={c.detail}>{c.detail || '—'}</span></td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Drawer open={Boolean(active)} onClose={() => setSelected(null)}
        title={active ? <span className="adm-row" style={{ gap: 8 }}><Dot tone={TONE[active.status]} />{active.label}</span> : ''}
        sub={active ? `${active.group}${active.critical ? ' · critical: a failure marks the site down' : ''}` : undefined}>
        {active && (
          <div className="adm-stack" style={{ gap: 12 }}>
            <div className="adm-callout" data-tone={active.status === 'ok' ? undefined : active.status === 'warn' ? 'warn' : 'bad'}>
              <div className="adm-callout-label">Latest result · {active.status}</div>
              <span style={{ wordBreak: 'break-word' }}>{active.detail || 'No detail.'}</span>
            </div>
            <DefinitionGrid items={[
              ['Now', `${active.latencyMs}ms`],
              ['Median (p50)', activeHist?.p50 != null ? `${activeHist.p50}ms` : '—'],
              [`Uptime · ${data?.history?.windowDays ?? 14}d`, fmtUptime(activeHist?.uptime)],
              ['Warn rate', activeHist?.warnRate != null ? `${(activeHist.warnRate * 100).toFixed(1)}%` : '—'],
              ['Runs recorded', String(activeHist?.runs ?? 0)],
              ['Key', active.key],
            ]} />
            {activeHist && activeHist.recent.length > 1 && (
              <div>
                <div className="adm-callout-label" style={{ marginBottom: 4 }}>Latency · last {activeHist.recent.length} runs</div>
                <SparkBars values={activeHist.recent.map(p => p.latencyMs)} dates={activeHist.recent.map(p => p.at.slice(0, 10))} labels={activeHist.recent.map(p => fmtTime(p.at))} height={70} format={v => `${v}ms`} />
              </div>
            )}
            <div>
              <div className="adm-callout-label" style={{ marginBottom: 4 }}>Status changes</div>
              {changes.length === 0 ? <span className="adm-muted" style={{ fontSize: 12.5 }}>No history yet.</span> : (
                <ol className="adm-timeline">
                  {changes.map(p => (
                    <li key={p.at} data-tone={p.status === 'ok' ? 'ok' : 'bad'}>
                      <span className="adm-num adm-muted">{fmtTime(p.at)}</span>
                      <span><b>{p.status}</b></span>
                      <span className="adm-muted">{p.latencyMs}ms</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
