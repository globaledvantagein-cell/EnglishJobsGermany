'use client';

/**
 * /admin/trash — rejected jobs, restorable to the review queue.
 * Same split layout as the queue; reason-grouped filter, CSV export.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';
import type { IAdminJob } from '../../types';
import { apiGet, apiPatch } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { useAdminCounts } from '../../components/admin/AdminShell';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { AdminJobDetail } from '../../components/admin/AdminJobDetail';
import { useHotkeys, stepSelection } from '../../components/admin/useHotkeys';
import { Btn, Empty, Page, Pill, SearchInput, SkeletonRows, errorText, fmtAge, fmtNumber } from '../../components/admin/primitives';

type TrashJob = IAdminJob & { updatedAt?: string };

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCsv(jobs: TrashJob[]) {
  const header = ['JobID', 'JobTitle', 'Company', 'Location', 'RejectionReason', 'ApplicationURL', 'Description'];
  const rows = jobs.map(j => [j.JobID || j._id, j.JobTitle, j.Company, j.Location, j.RejectionReason, j.ApplicationURL, j.Description].map(csvCell).join(','));
  const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rejected_jobs_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminTrash() {
  const { toast } = useAdminUi();
  const { refreshCounts } = useAdminCounts();

  const [jobs, setJobs] = useState<TrashJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<TrashJob[]>('/api/jobs/rejected');
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reasons = useMemo(() => {
    const tally = new Map<string, number>();
    jobs.forEach(j => { const r = j.RejectionReason || 'No reason'; tally.set(r, (tally.get(r) ?? 0) + 1); });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(j => {
      if (reasonFilter && (j.RejectionReason || 'No reason') !== reasonFilter) return false;
      return !q || j.JobTitle?.toLowerCase().includes(q) || j.Company?.toLowerCase().includes(q);
    });
  }, [jobs, query, reasonFilter]);
  const visibleIds = useMemo(() => visible.map(j => j._id), [visible]);
  // Falls back to the first visible row when a filter hides the selection.
  const effectiveId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0] ?? null;
  const selected = jobs.find(j => j._id === effectiveId) ?? null;


  const restore = useCallback(async (job: TrashJob) => {
    setRestoring(job._id);
    try {
      await apiPatch(`/api/jobs/admin/restore/${job._id}`);
      const position = visibleIds.indexOf(job._id);
      setSelectedId(visibleIds[position + 1] ?? visibleIds[position - 1] ?? null);
      setJobs(prev => prev.filter(j => j._id !== job._id));
      refreshCounts();
      toast(`Restored to queue: ${job.JobTitle}`);
    } catch (err) {
      toast(`Restore failed: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setRestoring(null);
    }
  }, [visibleIds, refreshCounts, toast]);

  const move = (delta: number) => setSelectedId(stepSelection(visibleIds, effectiveId, delta));
  useHotkeys({
    j: () => move(1), ArrowDown: () => move(1),
    k: () => move(-1), ArrowUp: () => move(-1),
    u: () => { if (selected) restore(selected); },
    o: () => { if (selected) window.open(selected.ApplicationURL, '_blank', 'noopener'); },
    '/': () => searchRef.current?.focus(),
  });

  const columns: Column<TrashJob>[] = [
    { key: 'title', header: 'Job', render: j => <span className="adm-cell-strong">{j.JobTitle}</span>, title: j => j.JobTitle, sortValue: j => j.JobTitle?.toLowerCase() },
    { key: 'company', header: 'Company', width: '24%', render: j => j.Company, title: j => j.Company, sortValue: j => j.Company?.toLowerCase() },
    { key: 'reason', header: 'Reason', width: '28%', render: j => <span className="adm-muted">{j.RejectionReason || '—'}</span>, title: j => j.RejectionReason, sortValue: j => j.RejectionReason ?? '' },
    {
      key: 'age', header: 'When', width: 52, align: 'right', hideOnSmall: true,
      render: j => <span className="adm-muted">{fmtAge(j.updatedAt || j.scrapedAt)}</span>,
      sortValue: j => -new Date(j.updatedAt || j.scrapedAt || 0).getTime(),
    },
  ];

  return (
    <Page
      title="Trash"
      sub={`${fmtNumber(jobs.length)} rejected jobs`}
      actions={
        <>
          <Btn onClick={() => downloadCsv(visible)} disabled={visible.length === 0}><Download size={13} />Export CSV</Btn>
          <Btn onClick={load} loading={loading && jobs.length > 0}><RefreshCw size={13} />Refresh</Btn>
        </>
      }
      flush
    >
      <div className="adm-split" data-detail-open={mobileDetail ? 'true' : 'false'}>
        <div className="adm-split-list">
          <div className="adm-toolbar">
            <select className="adm-select" style={{ width: 210 }} value={reasonFilter} onChange={e => setReasonFilter(e.target.value)} aria-label="Filter by reason">
              <option value="">All reasons ({fmtNumber(jobs.length)})</option>
              {reasons.map(([r, n]) => <option key={r} value={r}>{r} ({n})</option>)}
            </select>
            <span className="adm-grow" />
            <SearchInput value={query} onChange={setQuery} placeholder="Filter" width={170} inputRef={searchRef} />
          </div>
          {loading && jobs.length === 0 ? <SkeletonRows rows={14} cols={3} /> : error ? (
            <Empty title="Could not load trash" body={error} action={<Btn onClick={load}>Retry</Btn>} />
          ) : (
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={j => j._id}
              selectedKey={effectiveId}
              onRowClick={j => { setSelectedId(j._id); setMobileDetail(true); }}
              initialSort={{ key: 'age', dir: 'asc' }}
              empty={<Empty title={jobs.length === 0 ? 'Trash is empty' : 'No matches'} />}
              footer={<span>{fmtNumber(visible.length)} shown</span>}
            />
          )}
        </div>
        <div className="adm-split-detail">
          {selected ? (
            <AdminJobDetail
              job={selected}
              onBack={() => setMobileDetail(false)}
              actions={
                <>
                  <Btn variant="primary" onClick={() => restore(selected)} loading={restoring === selected._id} kbd="U">
                    <RotateCcw size={13} />Restore to queue
                  </Btn>
                  <span className="adm-grow" />
                  <Pill tone="outline">j / k to move</Pill>
                </>
              }
            />
          ) : <Empty title={loading ? 'Loading…' : 'Nothing selected'} />}
        </div>
      </div>
    </Page>
  );
}
