'use client';

/**
 * Background maintenance tasks — rendered as rows inside the "Maintenance"
 * panel on /admin (AdminOverview), next to the older one-shot batch jobs.
 *
 *   ● Run scraper now        last run 3h ago · 41 sources · 212 new jobs [Run]
 *   ● Fill missing AI data   last run 2h ago · 2,301 read, 12 failed     [Run]
 *   ● Recompute filters      last run 5m ago · 6,499 jobs                [Run]
 *
 * Nothing here is scheduled: a task starts only when its button is pressed
 * (POST /api/admin/maintenance/:key/run), one task at a time. The rows poll
 * progress while one runs. Same pattern as LinkValidatorPanel.
 *
 * Kill switch: `adminMaintenance`.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../utils/jobApi';
import { withFeature } from '../FeatureGate';
import { useAdminUi } from './AdminUiContext';
import { Btn, Dot, errorText, fmtAge, fmtNumber } from './primitives';

interface Task { key: string; kind: 'scraper' | 'db'; label: string; description: string }
interface Progress { startedAt: string; stage: string | null; done: number; total: number }
interface Status { running: boolean; active: Record<string, Progress> }
interface Counted { processed?: number; succeeded?: number; failed?: number }
interface RunResult { reason?: string; keyWarning?: string; requirements?: Counted; categories?: Counted; jobs?: Counted; remoteJobs?: Counted; sources?: number; newJobs?: number }
interface Run { task: string; label: string; startedAt: string; finishedAt: string; ok: boolean; result: RunResult | null }
interface MaintenanceState { tasks: Task[]; status: Status; runs: Run[] }

const POLL_MS = 3000;
const ROW_STYLE = { padding: '8px 10px', borderBottom: '1px solid var(--adm-line)', alignItems: 'flex-start' } as const;

/** One-line outcome of a finished run, in plain words. */
function describeRun(run: Run): string {
  const r: RunResult = run.result || {};
  if (!run.ok) return r.reason || 'Failed. Check the server log.';
  if (run.task.startsWith('run-scraper')) return `${fmtNumber(r.sources)} sources · ${fmtNumber(r.newJobs)} new jobs`;
  if (run.task === 'fill-ai-data') {
    const q = r.requirements || {};
    const c = r.categories || {};
    const done = `${fmtNumber(q.succeeded)} job ads read${q.failed ? `, ${fmtNumber(q.failed)} failed` : ''} · ${fmtNumber(c.processed)} re-categorized`;
    return r.keyWarning ? `${done} · ${r.keyWarning}` : done;
  }
  if (run.task === 'recompute-filters') {
    return `${fmtNumber((r.jobs?.processed || 0) + (r.remoteJobs?.processed || 0))} jobs recomputed`;
  }
  return 'Done';
}

function MaintenanceTasks() {
  const { confirm } = useAdminUi();
  const [data, setData] = useState<MaintenanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<MaintenanceState>('/api/admin/maintenance'));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = Boolean(data?.status.running);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [running, load]);

  const start = async (task: Task) => {
    if (!(await confirm({ title: task.label, body: task.description, confirmLabel: 'Run' }))) return;
    setStarting(task.key);
    try {
      await apiPost(`/api/admin/maintenance/${task.key}/run`);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(null);
    }
  };

  const active = data?.status.active || {};
  const activeKinds = (data?.tasks || []).filter(t => active[t.key]).map(t => t.kind);

  /** Why this task's button is disabled right now, or null. Mirrors taskRunner.js. */
  const blockedBy = (task: Task): string | null => {
    if (active[task.key]) return null;
    if (activeKinds.includes('db')) return 'A database task is running';
    if (task.kind === 'db' && activeKinds.length > 0) return 'Another task is running';
    return null;
  };

  return (
    <>
      {error && <div className="adm-muted" style={{ ...ROW_STYLE, fontSize: 12 }}>Could not load background tasks: {error}</div>}
      {(data?.tasks || []).map(task => {
        const last = data?.runs.find(r => r.task === task.key);
        const s = active[task.key];
        const isThis = Boolean(s);
        const pct = s && s.total ? Math.round((s.done / s.total) * 100) : 0;
        const blocked = blockedBy(task);
        const tone = isThis ? 'accent' : !last ? 'neutral' : last.ok ? 'ok' : 'bad';
        return (
          <div key={task.key} className="adm-row" style={ROW_STYLE}>
            <div className="adm-grow" style={{ minWidth: 0 }}>
              <div className="adm-row" style={{ gap: 6, fontWeight: 600 }}>
                <Dot tone={tone} />{task.label}
              </div>
              <div className="adm-muted" style={{ fontSize: 12 }}>
                {isThis
                  ? `${s?.stage} ${fmtNumber(s?.done)}/${fmtNumber(s?.total)}`
                  : last ? `Last run ${fmtAge(last.finishedAt)} ago · ${describeRun(last)}` : task.description}
              </div>
              {isThis && (
                <div className="adm-linkcheck-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <Btn size="sm" onClick={() => start(task)} loading={starting === task.key || isThis}
              disabled={Boolean(blocked)} title={blocked || task.description}>
              {isThis ? `${pct}%` : 'Run'}
            </Btn>
          </div>
        );
      })}
    </>
  );
}

export default withFeature('adminMaintenance', MaintenanceTasks);
