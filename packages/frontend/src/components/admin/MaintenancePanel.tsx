'use client';

/**
 * "Data maintenance" panel for /admin/health — click-only data repairs.
 *
 *   ● Fill missing AI data   last run 2h ago · 2,301 read, 12 failed     [Run]
 *   ● Recompute filters      last run 5m ago · 6,499 jobs                [Run]
 *
 * Nothing here is scheduled: a task starts only when its button is pressed
 * (POST /api/admin/maintenance/:key/run), one task at a time. The panel polls
 * progress while one runs. Same pattern as LinkValidatorPanel.
 *
 * Kill switch: `adminMaintenance`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/jobApi';
import { withFeature } from '../FeatureGate';
import { Btn, Dot, Panel, errorText, fmtAge, fmtNumber } from './primitives';

interface Task { key: string; label: string; description: string }
interface Status { running: boolean; task: string | null; startedAt: string | null; stage: string | null; done: number; total: number }
interface Counted { processed?: number; succeeded?: number; failed?: number }
interface RunResult { reason?: string; requirements?: Counted; categories?: Counted; jobs?: Counted; remoteJobs?: Counted }
interface Run { task: string; label: string; startedAt: string; finishedAt: string; ok: boolean; result: RunResult | null }
interface MaintenanceState { tasks: Task[]; status: Status; runs: Run[] }

const POLL_MS = 3000;

/** One-line outcome of a finished run, in plain words. */
function describeRun(run: Run): string {
  const r: RunResult = run.result || {};
  if (!run.ok) return r.reason || 'Failed. Check the server log.';
  if (run.task === 'fill-ai-data') {
    const q = r.requirements || {};
    const c = r.categories || {};
    return `${fmtNumber(q.succeeded)} job ads read${q.failed ? `, ${fmtNumber(q.failed)} failed` : ''} · ${fmtNumber(c.processed)} re-categorized`;
  }
  if (run.task === 'recompute-filters') {
    return `${fmtNumber((r.jobs?.processed || 0) + (r.remoteJobs?.processed || 0))} jobs recomputed`;
  }
  return 'Done';
}

function MaintenancePanel() {
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
    // The AI task spends Gemma quota on up to a few thousand jobs.
    if (task.key === 'fill-ai-data' && !window.confirm(`${task.label}?\n\n${task.description}`)) return;
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

  const s = data?.status;
  const pct = s && s.total ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <Panel
      title={<span className="adm-row" style={{ gap: 6 }}><Wrench size={13} />Data maintenance</span>}
      meta="runs only when you click"
    >
      {error && <div className="adm-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Could not load maintenance tasks: {error}</div>}
      <div className="adm-stack" style={{ gap: 8 }}>
        {(data?.tasks || []).map(task => {
          const last = data?.runs.find(r => r.task === task.key);
          const isThis = running && s?.task === task.key;
          const tone = isThis ? 'accent' : !last ? 'neutral' : last.ok ? 'ok' : 'bad';
          return (
            <div key={task.key} className="adm-maint-row">
              <div className="adm-maint-text">
                <span className="adm-row" style={{ gap: 6 }}>
                  <Dot tone={tone} />
                  <span className="adm-cell-strong">{task.label}</span>
                </span>
                <span className="adm-muted" style={{ fontSize: 12 }}>
                  {isThis
                    ? `${s?.stage} ${fmtNumber(s?.done)}/${fmtNumber(s?.total)}`
                    : last ? `last run ${fmtAge(last.finishedAt)} ago · ${describeRun(last)}` : task.description}
                </span>
                {isThis && (
                  <div className="adm-linkcheck-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <Btn size="sm" variant={task.key === 'recompute-filters' ? 'primary' : 'default'}
                onClick={() => start(task)} loading={starting === task.key || isThis}
                disabled={running && !isThis} title={running && !isThis ? 'Another task is running' : task.description}>
                {isThis ? `${pct}%` : 'Run'}
              </Btn>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default withFeature('adminMaintenance', MaintenancePanel);
