'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { IAdminJob } from '../types';
import MobileDetailOverlay from '../components/MobileDetailOverlay';
import { Badge, Button, Container, EmptyState, PageHeader } from '../components/ui';
import { getDisplayLocation } from '../utils/job';
import { useSplitView } from '../hooks/useSplitView';
import { apiGet, apiPatch, apiPost } from '../utils/jobApi';
import ReviewDetail, {
  normalizeConfidence, confidenceLabel, confidenceVariant,
} from '../components/review/ReviewDetail';

function compactDomain(value?: string) {
  if (value === 'Technical' || value === 'Non-Technical') return value;
  return 'Unclear';
}

interface ReanalyzeSummary {
  total: number;
  reanalyzed: number;
  changedToRejected: number;
  changedToPending: number;
  skippedManualReview: number;
}

export default function ReviewQueue() {
  const [jobs, setJobs] = useState<IAdminJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [reanalyzeSummary, setReanalyzeSummary] = useState<ReanalyzeSummary | null>(null);

  const heroRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const {
    selectedItem: selectedJob,
    selectedId: selectedJobId,
    setSelectedId: setSelectedJobId,
    mobileDetailOpen, openMobileDetail, closeMobileDetail,
    splitViewRef, itemRefs: desktopJobRefs, desktopSplitHeight,
  } = useSplitView(jobs, {
    observeRefs: [heroRef, summaryRef],
    recalcDeps: [loading, reanalyzingAll],
  });

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const payload = await apiGet<{ jobs?: IAdminJob[]; totalJobs?: number }>('/api/jobs/admin/review');
      const nextJobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
      setJobs(nextJobs);
      setTotalJobs(payload?.totalJobs || nextJobs.length);
    } catch (error) {
      console.error('Failed to load queue', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueue(); }, []);

  const handleDecision = async (id: string, decision: 'accept' | 'reject') => {
    setJobs(prev => prev.filter(j => j._id !== id));
    setTotalJobs(prev => Math.max(0, prev - 1));
    if (selectedJobId === id) setSelectedJobId('');
    try {
      await apiPatch(`/api/jobs/admin/decision/${id}`, { decision });
    } catch (err) {
      console.error('[ReviewQueue] decision failed', err);
    }
  };

  const handleUpdateJob = (updated: IAdminJob) => {
    setJobs(prev => prev.map(j => j._id === updated._id ? updated : j));
  };

  const handleReanalyzeAll = async () => {
    if (!window.confirm('Re-analyze all non-manually-reviewed jobs now? This may take several minutes.')) return;

    setReanalyzeSummary(null);
    setReanalyzingAll(true);
    try {
      const payload = await apiPost<ReanalyzeSummary>('/api/jobs/admin/reanalyze-all');
      setReanalyzeSummary(payload);
      await fetchQueue();
    } catch (error) {
      console.error('[ReviewQueue] reanalyze failed', error);
    } finally {
      setReanalyzingAll(false);
    }
  };

  const renderJobListItem = (job: IAdminJob, onClick: () => void) => {
    const selected = job._id === selectedJobId;
    const confidence = normalizeConfidence(job.ConfidenceScore);

    return (
      <button
        key={job._id}
        ref={node => { desktopJobRefs.current[job._id] = node; }}
        onClick={onClick}
        style={{
          borderTop: selected ? '1px solid var(--acid)' : '1px solid var(--border)',
          borderRight: selected ? '1px solid var(--acid)' : '1px solid var(--border)',
          borderBottom: selected ? '1px solid var(--acid)' : '1px solid var(--border)',
          borderLeft: selected ? '4px solid var(--acid)' : '1px solid var(--border)',
          background: selected ? 'var(--acid-soft)' : 'var(--bg-surface-2)',
          borderRadius: 10, padding: 12, textAlign: 'left', cursor: 'pointer', width: '100%',
        }}
      >
        <p style={{
          fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {job.JobTitle}
        </p>
        <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.Company} | {getDisplayLocation(job)}
        </p>
        <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
          <Badge variant={confidenceVariant(confidence)} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>{confidenceLabel(confidence)}</Badge>
          <Badge variant={compactDomain(job.Domain) === 'Technical' ? 'green' : 'neutral'} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>{compactDomain(job.Domain)}</Badge>
        </div>
      </button>
    );
  };

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div ref={heroRef} style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '24px 0', flexShrink: 0 }}>
        <Container size="lg">
          <PageHeader
            label="Admin"
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ShieldCheck size={22} color="var(--primary)" />Review Queue</span>}
            subtitle={reanalyzingAll ? 'Re-analyzing all eligible jobs... this can take a while.' : `${totalJobs} jobs pending review (showing ${jobs.length})`}
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={fetchQueue} loading={loading || reanalyzingAll}><RefreshCw size={13} />Refresh</Button>
                <Button size="sm" onClick={handleReanalyzeAll} loading={reanalyzingAll}>Re-analyze All</Button>
              </div>
            }
          />
        </Container>
      </div>

      <Container size="lg" style={{ padding: '20px 24px 16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div ref={summaryRef} style={{ flexShrink: 0 }}>
          {reanalyzeSummary && (
            <div style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Re-analysis complete | Total: {reanalyzeSummary.total} | Re-analyzed: {reanalyzeSummary.reanalyzed} | Changed to rejected: {reanalyzeSummary.changedToRejected} | Changed to pending: {reanalyzeSummary.changedToPending} | Skipped (manual): {reanalyzeSummary.skippedManualReview}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 132 }} />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState title="Queue is empty" body="No pending jobs for review." />
        ) : (
          <>
            <div
              ref={splitViewRef}
              className="split-grid"
              style={{ gap: 14, flex: 1, minHeight: 0, height: desktopSplitHeight }}
            >
              <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface)', minHeight: 0, height: desktopSplitHeight, overflowY: 'auto' }}>
                <div className="flex flex-col" style={{ gap: 8, padding: 12 }}>
                  {jobs.map(job => renderJobListItem(job, () => setSelectedJobId(job._id)))}
                </div>
              </section>

              <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface)', minHeight: 0, height: desktopSplitHeight, overflowY: 'auto', padding: 16 }}>
                {!selectedJob
                  ? <EmptyState title="Select a job to review" body="Pick a pending role from the left panel." />
                  : <ReviewDetail job={selectedJob} onDecision={handleDecision} onUpdateJob={handleUpdateJob} />}
              </section>
            </div>

            <div className="mobile-list-only flex flex-col gap-2">
              {jobs.map(job => renderJobListItem(job, () => openMobileDetail(job._id)))}
            </div>

            {mobileDetailOpen && selectedJob && (
              <MobileDetailOverlay onBack={closeMobileDetail} backLabel="Back to queue">
                <ReviewDetail job={selectedJob} onDecision={handleDecision} onUpdateJob={handleUpdateJob} />
              </MobileDetailOverlay>
            )}
          </>
        )}
      </Container>
    </div>
  );
}