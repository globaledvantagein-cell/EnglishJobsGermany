'use client';

/**
 * Dead-link validator strip for /admin/health — one compact panel row:
 *
 *   Dead links · last run 3h ago (cron) │ jobs 412 expired · remote 88 │ [Check links now]
 *
 * The button starts a full sweep on the server (POST /api/admin/validator/run)
 * and the panel polls progress until it finishes, so it works from a phone
 * with nothing else open. When the last run's circuit breaker held a platform
 * back, a second "Expire anyway" button re-runs with the breaker skipped.
 *
 * Kill switch: `cronValidator` (also stops the 6-hourly cron and the API).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link2Off } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/jobApi';
import { withFeature } from '../FeatureGate';
import { Btn, Dot, Panel, errorText, fmtAge, fmtNumber } from './primitives';

interface CollectionSummary { checked: number; live: number; dead: number; unknown: number; expired: number; tripped: string[] }
interface Run {
  startedAt: string; finishedAt: string; source: 'cron' | 'manual' | 'cli'; dryRun: boolean; force?: boolean; ok: boolean;
  summary: Record<string, CollectionSummary> | null;
}
interface Status { running: boolean; startedAt: string | null; source: string | null; collection: string | null; checked: number; total: number }
interface ValidatorState { status: Status; runs: Run[] }

const POLL_MS = 3000;
const LABEL: Record<string, string> = { jobs: 'Germany', remoteJobs: 'Remote' };

function LinkValidatorPanel({ onFinished }: { onFinished?: () => void }) {
  const [data, setData] = useState<ValidatorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<ValidatorState>('/api/admin/validator'));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = Boolean(data?.status.running);

  // Poll only while a sweep is running; tell the page when it ends so the
  // health table re-runs and picks up the new result.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(load, POLL_MS);
    return () => { window.clearInterval(id); onFinished?.(); };
  }, [running, load, onFinished]);

  const start = async (force = false) => {
    setStarting(true);
    try {
      await apiPost('/api/admin/validator/run', { force });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  };

  const last = data?.runs.find(r => !r.dryRun) ?? null;
  const tripped = last?.summary
    ? Object.entries(last.summary).flatMap(([name, s]) => s.tripped.map(ats => `${LABEL[name] ?? name}/${ats}`))
    : [];
  const s = data?.status;
  const pct = s && s.total ? Math.round((s.checked / s.total) * 100) : 0;

  const tone = error || (last && !last.ok) ? 'bad' : running ? 'accent' : tripped.length || !last ? 'warn' : 'ok';

  return (
    <Panel
      title={<span className="adm-row" style={{ gap: 6 }}><Dot tone={tone} /><Link2Off size={13} />Dead links</span>}
      meta={running
        ? `checking ${LABEL[s?.collection ?? ''] ?? '…'} ${fmtNumber(s?.checked)}/${fmtNumber(s?.total)}`
        : last ? `last run ${fmtAge(last.finishedAt)} ago · ${last.source}` : 'never run'}
      actions={
        <>
          {tripped.length > 0 && !running && (
            <Btn size="sm" variant="danger" onClick={() => start(true)} loading={starting}
              title={`The safety breaker held back ${tripped.join(', ')}. Expire them anyway.`}>
              Expire anyway
            </Btn>
          )}
          <Btn size="sm" variant="primary" onClick={() => start(false)} loading={starting || running}>
            {running ? `${pct}%` : 'Check links now'}
          </Btn>
        </>
      }
    >
      {error ? (
        <span className="adm-muted" style={{ fontSize: 12.5 }}>Could not load the link checker: {error}</span>
      ) : running ? (
        <div className="adm-linkcheck-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : last?.summary ? (
        <div className="adm-row" style={{ gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
          {Object.entries(last.summary).map(([name, c]) => (
            <span key={name} className="adm-num">
              <b>{LABEL[name] ?? name}</b> {fmtNumber(c.expired)} expired · {fmtNumber(c.live)} live · <span className="adm-muted">{fmtNumber(c.unknown)} unknown</span>
            </span>
          ))}
          {tripped.length > 0 && <span style={{ color: 'var(--adm-warn)' }}>Breaker held back {tripped.join(', ')}</span>}
        </div>
      ) : (
        <span className="adm-muted" style={{ fontSize: 12.5 }}>
          {last && !last.ok ? 'The last run crashed. Check the server log, then run it again.' : 'No completed run yet.'}
        </span>
      )}
    </Panel>
  );
}

export default withFeature('cronValidator', LinkValidatorPanel);
