'use client';

/**
 * /admin/ai-verdicts — the AI result cache (formerly "Test logs").
 *
 * GET /api/jobs/test-logs now returns aiResultCache rows: one verdict per job
 * fingerprint, reused on re-scrapes so unchanged postings skip the AI call. The
 * rows carry no title/company (the lean cache dropped them), so this page is a
 * quality view of the verdicts themselves: distribution, filters, raw table.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../../utils/jobApi';
import { DataTable, type Column } from '../../components/admin/DataTable';
import {
  Btn, Empty, Kpis, Meter, Page, Panel, Pill, Seg, SkeletonRows, errorText, fmtAge, fmtNumber, normalizeConfidence,
} from '../../components/admin/primitives';

interface Verdict {
  _id: string;
  fingerprint: string;
  confidence: number;
  germanRequired: boolean;
  domain?: string;
  subDomain?: string;
  createdAt: string;
}

type VerdictFilter = 'all' | 'english' | 'german';
const BUCKETS = 10;

export default function AdminAiVerdicts() {
  const [rows, setRows] = useState<Verdict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VerdictFilter>('all');
  const [domain, setDomain] = useState('');
  const [minConf, setMinConf] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Verdict[]>('/api/jobs/test-logs');
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const domains = useMemo(() => [...new Set(rows.map(r => r.domain).filter(Boolean) as string[])].sort(), [rows]);

  const visible = useMemo(() => rows.filter(r => {
    if (verdict === 'english' && r.germanRequired) return false;
    if (verdict === 'german' && !r.germanRequired) return false;
    if (domain && r.domain !== domain) return false;
    return normalizeConfidence(r.confidence) >= minConf;
  }), [rows, verdict, domain, minConf]);

  const stats = useMemo(() => {
    const german = rows.filter(r => r.germanRequired).length;
    const avg = rows.length ? rows.reduce((s, r) => s + normalizeConfidence(r.confidence), 0) / rows.length : 0;
    const low = rows.filter(r => normalizeConfidence(r.confidence) < 0.6).length;
    const histogram = Array.from({ length: BUCKETS }, () => 0);
    rows.forEach(r => { histogram[Math.min(BUCKETS - 1, Math.floor(normalizeConfidence(r.confidence) * BUCKETS))]++; });
    return { german, avg, low, histogram };
  }, [rows]);

  const maxBucket = Math.max(1, ...stats.histogram);

  const columns: Column<Verdict>[] = [
    {
      key: 'verdict', header: 'Verdict', width: 148,
      render: r => r.germanRequired ? <Pill tone="bad">German required</Pill> : <Pill tone="ok">English OK</Pill>,
      sortValue: r => (r.germanRequired ? 1 : 0),
    },
    { key: 'conf', header: 'Confidence', width: 104, align: 'right', render: r => <Meter value={r.confidence} />, sortValue: r => normalizeConfidence(r.confidence) },
    { key: 'domain', header: 'Domain', width: 120, render: r => r.domain || '—', sortValue: r => r.domain ?? '' },
    { key: 'sub', header: 'Sub-domain', render: r => r.subDomain || '—', title: r => r.subDomain, sortValue: r => r.subDomain ?? '' },
    { key: 'fp', header: 'Fingerprint', width: '30%', hideOnSmall: true, render: r => <span className="adm-mono adm-muted">{r.fingerprint}</span>, title: r => r.fingerprint },
    {
      key: 'age', header: 'Cached', width: 64, align: 'right',
      render: r => <span className="adm-muted" title={r.createdAt}>{fmtAge(r.createdAt)}</span>,
      sortValue: r => -new Date(r.createdAt).getTime(),
    },
  ];

  return (
    <Page
      title="AI verdicts"
      sub={`latest ${fmtNumber(rows.length)} cached results · a re-scrape of the same posting reuses these instead of calling the AI`}
      actions={<Btn onClick={load} loading={loading && rows.length > 0}><RefreshCw size={13} />Refresh</Btn>}
      flush
    >
      <div style={{ padding: 'var(--adm-pad)', borderBottom: '1px solid var(--adm-line)', display: 'grid', gap: 'var(--adm-gap)', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 1fr)' }}>
        <Kpis
          loading={loading && rows.length === 0}
          items={[
            { label: 'Verdicts loaded', value: fmtNumber(rows.length) },
            { label: 'German required', value: fmtNumber(stats.german), note: rows.length ? `${Math.round((stats.german / rows.length) * 100)}% of loaded` : undefined, tone: 'bad' },
            { label: 'Average confidence', value: `${Math.round(stats.avg * 100)}%` },
            { label: 'Below 60%', value: fmtNumber(stats.low), note: 'auto-rejected band', tone: stats.low ? 'warn' : undefined },
          ]}
        />
        <Panel title="Confidence distribution" meta="click a bar to filter ≥" bodyStyle={{ padding: '8px 10px' }}>
          <div className="adm-bars" style={{ height: 44 }}>
            {stats.histogram.map((count, i) => (
              <span
                key={i}
                data-zero={count === 0 ? 'true' : undefined}
                title={`${i * 10}–${i * 10 + 10}%: ${count}`}
                onClick={() => setMinConf(minConf === i / BUCKETS ? 0 : i / BUCKETS)}
                style={{
                  height: `${Math.max(4, (count / maxBucket) * 100)}%`,
                  cursor: 'pointer',
                  opacity: minConf && i / BUCKETS < minConf ? 0.3 : 1,
                }}
              />
            ))}
          </div>
          <div className="adm-row adm-muted" style={{ justifyContent: 'space-between', fontSize: 10.5, marginTop: 2 }}>
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </Panel>
      </div>

      <div className="adm-toolbar">
        <Seg<VerdictFilter>
          label="Verdict"
          value={verdict}
          onChange={setVerdict}
          options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'english', label: 'English OK', count: rows.length - stats.german },
            { value: 'german', label: 'German required', count: stats.german },
          ]}
        />
        <select className="adm-select" style={{ width: 170 }} value={domain} onChange={e => setDomain(e.target.value)} aria-label="Domain">
          <option value="">All domains</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {minConf > 0 && <Btn size="sm" variant="ghost" onClick={() => setMinConf(0)}>Confidence ≥ {Math.round(minConf * 100)}% ✕</Btn>}
        <span className="adm-grow" />
        <span className="adm-muted">{fmtNumber(visible.length)} shown</span>
      </div>

      {loading && rows.length === 0 ? <SkeletonRows rows={18} cols={5} /> : error ? (
        <Empty title="Could not load verdicts" body={error} action={<Btn onClick={load}>Retry</Btn>} />
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={r => r._id}
          initialSort={{ key: 'age', dir: 'asc' }}
          empty={<Empty title="No verdicts match" />}
        />
      )}
    </Page>
  );
}
