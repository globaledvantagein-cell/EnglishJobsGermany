'use client';

/**
 * Standalone remote job detail (/remote-jobs/[id]).
 *
 * The remote vertical has no gating — /api/remote-jobs/:id/full is always
 * ungated — so this is a straight fetch-and-render with none of the
 * signup/upgrade machinery the German /jobs/[id] page needs.
 *
 * Exists because the browse page now opens jobs in a new tab instead of an
 * inline panel; without this route every remote card would 404.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import RemoteJobDetail from '../components/RemoteJobDetail';
import JobDetailSkeleton from '../components/JobDetailSkeleton';
import { EmptyState } from '../components/ui';
import { fetchRemoteJobDetail } from '../utils/remoteJobApi';
import type { IJob } from '../types';

export default function RemoteJobSharePage({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<IJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);

    fetchRemoteJobDetail(jobId, { signal: ctrl.signal })
      .then(detail => {
        if (ctrl.signal.aborted) return;
        if (detail) setJob(detail);
        else setFailed(true);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [jobId]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px,3vw,28px)' }}>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
        <Link href="/" style={{ color: 'inherit' }}>Home</Link>
        {' › '}
        <Link href="/remote-jobs" style={{ color: 'inherit' }}>Remote jobs</Link>
      </nav>

      {loading && <JobDetailSkeleton />}

      {!loading && failed && (
        <div className="page-fade-in">
          <EmptyState
            title="This role is no longer available"
            body="It may have been filled or removed. Browse the current remote openings instead."
          />
        </div>
      )}

      {!loading && !failed && job && (
        <div className="page-fade-in">
          <RemoteJobDetail job={job} />
        </div>
      )}
    </div>
  );
}
