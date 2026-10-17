'use client';

/**
 * /admin/review — triage the review queue.
 *
 * The queue mixes two groups the backend already sorts apart:
 *   Needs decision     Status pending_review — not live until accepted.
 *   Live, unconfirmed  Status active + ai_auto — already published, a human
 *                      confirm (accept) or take-down (reject) is still owed.
 *
 * Decisions are optimistic with a 5-second undo: the row leaves the list and the
 * next one is selected immediately, but the PATCH is only sent when the undo
 * window closes (or the page unmounts). Pages are fetched 50 at a time as the
 * list scrolls, so the whole backlog is reachable — the old page stopped at 50.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react';
import type { IAdminJob } from '../../types';
import { apiGet, apiPatch } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { useAdminCounts } from '../../components/admin/AdminShell';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { AdminJobDetail } from '../../components/admin/AdminJobDetail';
import { useHotkeys, stepSelection } from '../../components/admin/useHotkeys';
import {
  Btn, Empty, Kbd, Meter, Page, Pill, SearchInput, Seg, SkeletonRows, errorText, fmtAge, fmtNumber,
} from '../../components/admin/primitives';

const PAGE_SIZE = 50;
const UNDO_MS = 5000;

type Group = 'all' | 'decide' | 'live';
type Decision = 'accept' | 'reject';

const REJECT_REASONS = [
  'German language required',
  'Location not Germany',
  'Not English-speaking',
  'Not a real job / spam',
  'Duplicate',
  'Expired',
] as const;

interface PendingDecision { job: IAdminJob; index: number; decision: Decision; reason: string | null; timer: number }

const isLive = (job: IAdminJob) => job.Status === 'active';

export default function AdminReview() {
  const { toast } = useAdminUi();
  const { counts, refreshCounts } = useAdminCounts();

  const [jobs, setJobs] = useState<IAdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [group, setGroup] = useState<Group>('all');
  const [query, setQuery] = useState('');
  // Deep link from the overview: /admin/review?job=<id>
  const [selectedId, setSelectedId] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('job')
  ));
  const [mobileDetail, setMobileDetail] = useState(false);
  // The rejection reason belongs to one job; moving on resets it to "none".
  const [reasonFor, setReasonFor] = useState<{ id: string | null; value: string }>({ id: null, value: '' });
  const [editSignal, setEditSignal] = useState(0);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<Map<string, PendingDecision>>(new Map());

  // ── Loading ────────────────────────────────────────────────────────────
  const loadPage = useCallback(async (nextPage: number) => {
    const payload = await apiGet<{ jobs: IAdminJob[]; totalJobs: number; totalPages: number }>(
      `/api/jobs/admin/review?page=${nextPage}&limit=${PAGE_SIZE}`,
    );
    return payload;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await loadPage(1);
      setJobs(payload.jobs ?? []);
      setTotal(payload.totalJobs ?? 0);
      setTotalPages(payload.totalPages ?? 1);
      setPage(1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const payload = await loadPage(page + 1);
      // Decisions shift server pagination, so the next page can overlap rows we
      // already hold. De-dupe by id rather than trusting offsets.
      setJobs(prev => {
        const seen = new Set(prev.map(j => j._id));
        return [...prev, ...(payload.jobs ?? []).filter(j => !seen.has(j._id) && !pendingRef.current.has(j._id))];
      });
      setTotalPages(payload.totalPages ?? totalPages);
      setPage(page + 1);
    } catch (err) {
      toast(`Could not load more: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, page, totalPages, loadPage, toast]);

  useEffect(() => { reload(); }, [reload]);

  // ── Filtering ──────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(job => {
      if (group === 'decide' && isLive(job)) return false;
      if (group === 'live' && !isLive(job)) return false;
      if (!q) return true;
      return job.JobTitle?.toLowerCase().includes(q)
        || job.Company?.toLowerCase().includes(q)
        || job.Location?.toLowerCase().includes(q);
    });
  }, [jobs, group, query]);

  const visibleIds = useMemo(() => visible.map(j => j._id), [visible]);
  // Falls back to the first visible row when a filter or decision removes it.
  const effectiveId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0] ?? null;
  const selected = useMemo(() => jobs.find(j => j._id === effectiveId) ?? null, [jobs, effectiveId]);
  const reason = reasonFor.id === effectiveId ? reasonFor.value : '';
  const setReason = (value: string) => setReasonFor({ id: effectiveId, value });

  // ── Decisions with undo ────────────────────────────────────────────────
  const commit = useCallback(async (pending: PendingDecision) => {
    pendingRef.current.delete(pending.job._id);
    try {
      await apiPatch(`/api/jobs/admin/decision/${pending.job._id}`, {
        decision: pending.decision,
        rejectionReason: pending.reason,
      });
      refreshCounts();
    } catch (err) {
      // Put it back so the decision is not silently lost.
      setJobs(prev => (prev.some(j => j._id === pending.job._id) ? prev : insertAt(prev, pending.job, pending.index)));
      setTotal(prev => prev + 1);
      toast(`Failed to ${pending.decision} “${pending.job.JobTitle}”: ${errorText(err)}`, { tone: 'bad' });
    }
  }, [refreshCounts, toast]);

  // Closing the tab inside an undo window would drop the decision; ask first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingRef.current.size > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Flush anything still inside its undo window when navigating within the app.
  useEffect(() => () => {
    pendingRef.current.forEach(pending => {
      window.clearTimeout(pending.timer);
      apiPatch(`/api/jobs/admin/decision/${pending.job._id}`, { decision: pending.decision, rejectionReason: pending.reason })
        .catch(() => {});
    });
    pendingRef.current.clear();
  }, []);

  const decide = useCallback((decision: Decision) => {
    if (!selected) return;
    const job = selected;
    const index = jobs.findIndex(j => j._id === job._id);
    const position = visibleIds.indexOf(job._id);
    const nextId = visibleIds[position + 1] ?? visibleIds[position - 1] ?? null;

    setJobs(prev => prev.filter(j => j._id !== job._id));
    setTotal(prev => Math.max(0, prev - 1));
    setSelectedId(nextId);

    const rejectReason = decision === 'reject' ? (reason || null) : null;
    const pending: PendingDecision = {
      job, index, decision, reason: rejectReason,
      timer: window.setTimeout(() => commit(pendingRef.current.get(job._id) ?? pending), UNDO_MS),
    };
    pendingRef.current.set(job._id, pending);

    const verb = decision === 'accept' ? (isLive(job) ? 'Confirmed' : 'Approved') : (isLive(job) ? 'Taken down' : 'Rejected');
    toast(`${verb}: ${job.JobTitle}${rejectReason ? ` (${rejectReason})` : ''}`, {
      durationMs: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const current = pendingRef.current.get(job._id);
          if (!current) return;
          window.clearTimeout(current.timer);
          pendingRef.current.delete(job._id);
          setJobs(prev => insertAt(prev, job, index));
          setTotal(prev => prev + 1);
          setSelectedId(job._id);
        },
      },
    });
  }, [selected, jobs, visibleIds, reason, commit, toast]);

  const handleJobUpdated = (updated: IAdminJob) => {
    setJobs(prev => prev.map(j => (j._id === updated._id ? { ...j, ...updated } : j)));
  };

  // ── Keyboard ───────────────────────────────────────────────────────────
  const move = (delta: number) => {
    const next = stepSelection(visibleIds, effectiveId, delta);
    setSelectedId(next);
    // Keyboard triage near the end of what's loaded pulls in the next page.
    if (next && visibleIds.length - visibleIds.indexOf(next) < 10) loadMore();
  };
  useHotkeys({
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    a: () => decide('accept'),
    r: () => decide('reject'),
    e: () => setEditSignal(n => n + 1),
    o: () => { if (selected) window.open(selected.ApplicationURL, '_blank', 'noopener'); },
    '/': () => searchRef.current?.focus(),
  });

  // ── Table ──────────────────────────────────────────────────────────────
  const columns: Column<IAdminJob>[] = [
    {
      key: 'state', header: '', width: 28,
      render: j => <span className={`adm-dot`} data-tone={isLive(j) ? 'accent' : 'warn'} title={isLive(j) ? 'Live, unconfirmed' : 'Needs decision'} />,
    },
    { key: 'title', header: 'Job', render: j => <span className="adm-cell-strong">{j.JobTitle}</span>, title: j => j.JobTitle, sortValue: j => j.JobTitle?.toLowerCase() },
    { key: 'company', header: 'Company', width: '24%', render: j => j.Company, title: j => j.Company, sortValue: j => j.Company?.toLowerCase() },
    {
      key: 'conf', header: 'Conf.', width: 100, align: 'right',
      render: j => <Meter value={j.ConfidenceScore} />, sortValue: j => j.ConfidenceScore,
    },
    {
      key: 'age', header: 'Age', width: 48, align: 'right', hideOnSmall: true,
      render: j => <span className="adm-muted">{fmtAge(j.scrapedAt)}</span>,
      sortValue: j => (j.scrapedAt ? -new Date(j.scrapedAt).getTime() : null),
    },
  ];

  const decideCount = counts.pendingDecision;
  const liveCount = counts.review != null && counts.pendingDecision != null ? counts.review - counts.pendingDecision : null;

  const actionBar = selected && (
    <>
      <Btn variant="danger" onClick={() => decide('reject')} kbd="R">
        <X size={13} />{isLive(selected) ? 'Take down' : 'Reject'}
      </Btn>
      <select
        className="adm-select"
        style={{ width: 190 }}
        value={reason}
        onChange={e => setReason(e.target.value)}
        aria-label="Rejection reason"
        title="Optional reason, saved with a rejection"
      >
        <option value="">No reason</option>
        {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <span className="adm-grow" />
      <span className="adm-muted adm-hide-sm" style={{ fontSize: 12 }}>
        {visibleIds.indexOf(selected._id) + 1} / {fmtNumber(visible.length)}
      </span>
      <Btn icon variant="ghost" onClick={() => move(-1)} title="Previous (k)"><ChevronUp size={15} /></Btn>
      <Btn icon variant="ghost" onClick={() => move(1)} title="Next (j)"><ChevronDown size={15} /></Btn>
      <Btn variant="ok" onClick={() => decide('accept')} kbd="A">
        <Check size={13} />{isLive(selected) ? 'Confirm' : 'Approve'}
      </Btn>
    </>
  );

  return (
    <Page
      title="Review queue"
      sub={`${fmtNumber(total)} jobs · ${fmtNumber(jobs.length)} loaded`}
      actions={
        <>
          <span className="adm-muted adm-hide-sm adm-row" style={{ fontSize: 11.5, gap: 4 }}>
            <Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>R</Kbd> reject · <Kbd>E</Kbd> edit location · <Kbd>O</Kbd> open · <Kbd>/</Kbd> search
          </span>
          <Btn onClick={() => { reload(); refreshCounts(); }} loading={loading && jobs.length > 0}><RefreshCw size={13} />Refresh</Btn>
        </>
      }
      flush
    >
      <div className="adm-split" data-detail-open={mobileDetail ? 'true' : 'false'}>
        <div className="adm-split-list">
          <div className="adm-toolbar">
            <Seg<Group>
              label="Queue group"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'all', label: 'All', count: counts.review ?? undefined },
                { value: 'decide', label: 'Needs decision', count: decideCount ?? undefined },
                { value: 'live', label: 'Live', count: liveCount ?? undefined },
              ]}
            />
            <span className="adm-grow" />
            <SearchInput value={query} onChange={setQuery} placeholder="Filter loaded jobs" width={180} inputRef={searchRef} />
          </div>
          {loading && jobs.length === 0 ? <SkeletonRows rows={18} cols={4} /> : error ? (
            <Empty title="Could not load the queue" body={error} action={<Btn onClick={reload}>Retry</Btn>} />
          ) : (
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={j => j._id}
              selectedKey={effectiveId}
              onRowClick={j => { setSelectedId(j._id); setMobileDetail(true); }}
              onEndReached={loadMore}
              empty={<Empty title={jobs.length === 0 ? 'Queue is empty' : 'No matches'} body={jobs.length === 0 ? 'Nothing is waiting for review.' : 'Try another filter.'} />}
              footer={
                <>
                  <span>{fmtNumber(visible.length)} shown</span>
                  <span className="adm-grow" />
                  {page < totalPages
                    ? <Btn size="sm" variant="ghost" onClick={loadMore} loading={loadingMore}>Load more ({fmtNumber(Math.max(0, total - jobs.length))} left)</Btn>
                    : <span>All loaded</span>}
                </>
              }
            />
          )}
        </div>

        <div className="adm-split-detail">
          {selected ? (
            <AdminJobDetail
              job={selected}
              actions={actionBar}
              onJobUpdated={handleJobUpdated}
              onBack={() => setMobileDetail(false)}
              editLocationSignal={editSignal}
              banner={isLive(selected) ? (
                <div className="adm-callout" data-tone="warn">
                  <div className="adm-callout-label">Already live</div>
                  Auto-published at {Math.round((selected.ConfidenceScore > 1 ? selected.ConfidenceScore / 100 : selected.ConfidenceScore) * 100)}% confidence.
                  Approve confirms it; reject takes it off the site.
                </div>
              ) : undefined}
            />
          ) : (
            <Empty title={loading ? 'Loading…' : 'Nothing selected'} body={!loading && jobs.length === 0 ? <Pill tone="ok">Inbox zero</Pill> : 'Pick a job from the list.'} />
          )}
        </div>
      </div>
    </Page>
  );
}

function insertAt<T>(list: T[], item: T, index: number): T[] {
  const copy = [...list];
  copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
  return copy;
}
