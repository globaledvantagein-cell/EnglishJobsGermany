'use client';

/**
 * /admin — one-screen operational overview.
 *
 *   Row 1  KPI strip: backlog, live, trash, AI cache, feedback, premium, health
 *   Row 2  Today's pipeline · Auto-publish quality · System checks needing attention
 *   Row 3  Next jobs in the review queue · Maintenance tools
 *
 * Every panel loads independently, so one slow endpoint never blanks the page.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { useNavigate } from '@/compat/router';
import { apiGet, apiPost } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { useAdminCounts } from '../../components/admin/AdminShell';
import { DataTable, type Column } from '../../components/admin/DataTable';
import {
  Btn, DefinitionGrid, Dot, Empty, Kpis, LinkBtn, Meter, Page, Panel, Pill, SkeletonRows,
  errorText, fmtAge, fmtNumber, type Tone,
} from '../../components/admin/primitives';
import type { IAdminJob } from '../../types';

interface Counts {
  testLogs: number; pendingReview: number; pendingDecision: number;
  awaitingConfirmation: number; activeJobs: number; rejectedJobs: number;
}
interface AutoPublish {
  autoPublishedToday: number; awaitingConfirmation: number; rejectedAfterAutoPublish: number;
  avgConfidence: { autoPublished: number; manuallyReviewed: number };
  counts: { autoPublished: number; manuallyReviewed: number };
  thresholds: { autoPublish: number; manualReview: number };
}
type Daily = Record<string, number | string>;
interface HealthCheck { key: string; label: string; group: string; critical: boolean; status: 'ok' | 'warn' | 'fail'; detail: string }
interface Health { overall: string; checks: HealthCheck[] }
interface PremiumTotals { totals: { activePremiumUsers: number; totalUsers: number } }

const HEALTH_TONE: Record<string, Tone> = { operational: 'ok', degraded: 'warn', down: 'bad', ok: 'ok', warn: 'warn', fail: 'bad' };

/** Maintenance endpoints. Each is a one-off batch job over the whole jobs collection. */
const MAINTENANCE: Array<{
  key: string; label: string; detail: string; endpoint: string; confirm: string;
  summarize: (r: Record<string, number | string>) => string;
}> = [
  {
    key: 'reanalyze',
    label: 'Re-analyze queue',
    detail: 'Re-run AI on every job not yet reviewed by a human.',
    endpoint: '/api/jobs/admin/reanalyze-all',
    confirm: 'Re-analyze all non-manually-reviewed jobs? This calls the AI for each job and can take several minutes.',
    summarize: r => `Re-analyzed ${r.reanalyzed}/${r.total} · ${r.changedToRejected} → rejected · ${r.changedToPending} → pending · ${r.skippedManualReview} skipped`,
  },
  {
    key: 'clean',
    label: 'Clean descriptions',
    detail: 'Strip leftover HTML from every job description.',
    endpoint: '/api/jobs/admin/clean-descriptions',
    confirm: 'Strip any remaining HTML from all job descriptions?',
    summarize: r => `Cleaned ${r.cleaned} of ${r.total} · ${r.alreadyClean} already clean`,
  },
  {
    key: 'experience',
    label: 'Backfill experience',
    detail: 'Fill experience level + workplace type on older jobs.',
    endpoint: '/api/jobs/admin/backfill-experience',
    confirm: 'Backfill experience levels and workplace type for existing jobs?',
    summarize: r => `Jobs ${r.updated}/${r.total} · logs ${r.logsUpdated}/${r.logsTotal}`,
  },
  {
    key: 'salaries',
    label: 'Fix salaries',
    detail: 'Normalize suspiciously low values (125 → 125,000).',
    endpoint: '/api/jobs/admin/fix-salaries',
    confirm: 'Normalize suspiciously low salary values on all jobs?',
    summarize: r => `Fixed ${r.fixed} of ${r.total} checked`,
  },
];

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    load()
      .then(result => { setData(result); setError(null); })
      .catch(err => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run };
}

const loadCounts = () => apiGet<Counts>('/api/analytics/counts', { noAuth: true });
const loadAuto = () => apiGet<AutoPublish>('/api/analytics/auto-publish');
const loadDaily = () => apiGet<Daily>('/api/analytics/daily');
const loadHealth = () => apiGet<Health>('/api/admin/health');
const loadPremium = () => apiGet<PremiumTotals>('/api/analytics/premium');
const loadQueue = () => apiGet<{ jobs: IAdminJob[] }>('/api/jobs/admin/review?limit=12');

export default function AdminOverview() {
  const navigate = useNavigate();
  const { toast, confirm } = useAdminUi();
  const { counts: navCounts, refreshCounts } = useAdminCounts();

  const counts = useLoad(loadCounts);
  const auto = useLoad(loadAuto);
  const daily = useLoad(loadDaily);
  const health = useLoad(loadHealth);
  const premium = useLoad(loadPremium);
  const queue = useLoad(loadQueue);

  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const reloadAll = () => {
    counts.reload(); auto.reload(); daily.reload(); health.reload(); premium.reload(); queue.reload();
    refreshCounts();
  };

  const runMaintenance = async (task: typeof MAINTENANCE[number]) => {
    if (!(await confirm({ title: task.label, body: task.confirm, confirmLabel: 'Run' }))) return;
    setRunning(task.key);
    try {
      const result = await apiPost<Record<string, number | string>>(task.endpoint);
      const summary = task.summarize(result);
      setResults(prev => ({ ...prev, [task.key]: summary }));
      toast(`${task.label}: ${summary}`, { durationMs: 8000 });
      if (task.key === 'reanalyze') { queue.reload(); counts.reload(); refreshCounts(); }
    } catch (err) {
      toast(`${task.label} failed: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setRunning(null);
    }
  };

  const c = counts.data;
  const failingChecks = (health.data?.checks ?? [])
    .filter(check => check.status !== 'ok')
    .sort((a, b) => (a.status === 'fail' ? -1 : 1) - (b.status === 'fail' ? -1 : 1));
  const healthTone = HEALTH_TONE[health.data?.overall ?? ''] ?? 'neutral';

  const d = daily.data;
  const dailyNumber = (key: string) => (d && typeof d[key] === 'number' ? fmtNumber(d[key] as number) : '—');

  const a = auto.data;
  const pct = (value?: number) => (value == null ? '—' : `${Math.round((value > 1 ? value / 100 : value) * 100)}%`);

  const queueColumns: Column<IAdminJob>[] = [
    { key: 'title', header: 'Job', render: j => <span className="adm-cell-strong">{j.JobTitle}</span>, title: j => j.JobTitle },
    { key: 'company', header: 'Company', width: '26%', render: j => j.Company, title: j => j.Company },
    {
      key: 'state', header: 'State', width: 92,
      render: j => j.Status === 'pending_review' ? <Pill tone="warn">Decide</Pill> : <Pill tone="accent">Live</Pill>,
    },
    { key: 'conf', header: 'Conf.', width: 100, align: 'right', render: j => <Meter value={j.ConfidenceScore} /> },
    { key: 'age', header: 'Age', width: 52, align: 'right', render: j => <span className="adm-muted">{fmtAge(j.scrapedAt)}</span> },
  ];

  return (
    <Page
      title="Overview"
      sub={new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      actions={<Btn onClick={reloadAll} loading={counts.loading && !!counts.data}><RefreshCw size={13} />Refresh</Btn>}
    >
      <div className="adm-stack">
        <Kpis
          loading={counts.loading && !c}
          items={[
            { label: 'Needs decision', value: fmtNumber(c?.pendingDecision), note: 'not live, blocking', tone: c && c.pendingDecision > 0 ? 'accent' : undefined, href: '/admin/review' },
            { label: 'Live, unconfirmed', value: fmtNumber(c?.awaitingConfirmation), note: 'auto-published', href: '/admin/review' },
            { label: 'Live jobs', value: fmtNumber(c?.activeJobs), note: 'in the German feed' },
            { label: 'Trash', value: fmtNumber(c?.rejectedJobs), note: 'restorable', href: '/admin/trash' },
            { label: 'AI verdicts cached', value: fmtNumber(c?.testLogs), note: 'skip repeat AI calls', href: '/admin/ai-verdicts' },
            { label: 'Unread feedback', value: fmtNumber(navCounts.feedback), tone: navCounts.feedback ? 'accent' : undefined, href: '/admin/feedback' },
            { label: 'Premium users', value: fmtNumber(premium.data?.totals.activePremiumUsers), note: premium.data ? `of ${fmtNumber(premium.data.totals.totalUsers)} users` : undefined, href: '/admin/premium' },
            {
              label: 'System',
              value: <span className="adm-row" style={{ fontSize: 15 }}><Dot tone={healthTone} />{health.data?.overall ?? (health.error ? 'unreachable' : '…')}</span>,
              note: health.data ? `${failingChecks.length} check${failingChecks.length === 1 ? '' : 's'} need attention` : undefined,
              tone: healthTone === 'bad' ? 'bad' : healthTone === 'warn' ? 'warn' : undefined,
              href: '/admin/health',
            },
          ]}
        />

        <div className="adm-grid adm-cols-3">
          <Panel title="Today's pipeline" meta={d?.lastUpdated ? `updated ${fmtAge(String(d.lastUpdated))} ago` : 'UTC day'}>
            {daily.error ? <span className="adm-muted">{daily.error}</span> : (
              <DefinitionGrid items={[
                ['Scraped', dailyNumber('jobsScraped')],
                ['Sent to AI', dailyNumber('jobsSentToAI')],
                ['Auto-published', dailyNumber('jobsAutoPublished')],
                ['Queued for review', dailyNumber('jobsPendingReview')],
                ['Low-conf. rejected', dailyNumber('jobsAutoRejectedLowConfidence')],
                ['Published', dailyNumber('jobsPublished')],
                ['Signups', dailyNumber('signups')],
                ['Apply clicks', dailyNumber('applyClicks_total')],
              ]} />
            )}
          </Panel>

          <Panel title="Auto-publish quality" meta={a ? `bands ≥${pct(a.thresholds.autoPublish)} live · ≥${pct(a.thresholds.manualReview)} review` : undefined}>
            {auto.error ? <span className="adm-muted">{auto.error}</span> : (
              <DefinitionGrid items={[
                ['Auto-published today', fmtNumber(a?.autoPublishedToday)],
                ['Awaiting confirmation', fmtNumber(a?.awaitingConfirmation)],
                ['Rejected after auto', fmtNumber(a?.rejectedAfterAutoPublish)],
                ['Total auto / manual', a ? `${fmtNumber(a.counts.autoPublished)} / ${fmtNumber(a.counts.manuallyReviewed)}` : '—'],
                ['Avg conf. auto', pct(a?.avgConfidence.autoPublished)],
                ['Avg conf. manual', pct(a?.avgConfidence.manuallyReviewed)],
              ]} />
            )}
          </Panel>

          <Panel
            title="System checks"
            meta={health.data ? `${health.data.checks.length - failingChecks.length}/${health.data.checks.length} ok` : undefined}
            actions={<LinkBtn to="/admin/health" variant="ghost">All <ArrowRight size={12} /></LinkBtn>}
            flush
          >
            {health.loading && !health.data ? <SkeletonRows rows={5} cols={2} /> : health.error ? (
              <div className="adm-panel-body adm-muted">Health endpoint unreachable: {health.error}</div>
            ) : failingChecks.length === 0 ? (
              <div className="adm-panel-body adm-row"><Dot tone="ok" />All {health.data?.checks.length} checks passing</div>
            ) : (
              <div style={{ maxHeight: 196, overflowY: 'auto' }}>
                {failingChecks.map(check => (
                  <div key={check.key} className="adm-row" style={{ padding: '6px 10px', borderBottom: '1px solid var(--adm-line)' }} title={check.detail}>
                    <Dot tone={HEALTH_TONE[check.status]} />
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{check.label}</span>
                    <span className="adm-muted adm-truncate">{check.detail}</span>
                    {check.critical && <Pill tone="outline">critical</Pill>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="adm-grid" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 1fr)' }}>
          <Panel
            title="Next in review queue"
            meta={c ? `${fmtNumber(c.pendingReview)} total` : undefined}
            actions={<LinkBtn to="/admin/review" variant="primary">Open queue <ArrowRight size={12} /></LinkBtn>}
            flush
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(var(--adm-row) * 12 + 31px)' }}>
              {queue.loading && !queue.data ? <SkeletonRows rows={8} cols={4} /> : (
                <DataTable
                  rows={queue.data?.jobs ?? []}
                  columns={queueColumns}
                  rowKey={j => j._id}
                  onRowClick={j => navigate(`/admin/review?job=${j._id}`)}
                  empty={<Empty title="Queue is empty" body="Nothing is waiting for a decision." />}
                />
              )}
            </div>
          </Panel>

          <Panel title="Maintenance" meta="batch jobs over the whole collection" flush>
            {MAINTENANCE.map(task => (
              <div key={task.key} className="adm-row" style={{ padding: '8px 10px', borderBottom: '1px solid var(--adm-line)', alignItems: 'flex-start' }}>
                <div className="adm-grow">
                  <div style={{ fontWeight: 600 }}>{task.label}</div>
                  <div className="adm-muted" style={{ fontSize: 12 }}>{results[task.key] ?? task.detail}</div>
                </div>
                <Btn size="sm" onClick={() => runMaintenance(task)} loading={running === task.key} disabled={running !== null && running !== task.key}>
                  Run
                </Btn>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
