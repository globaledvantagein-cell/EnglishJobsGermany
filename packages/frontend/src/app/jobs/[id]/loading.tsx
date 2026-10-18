import { JobDetailSkeleton } from '@/components/job-detail';

// Streamed instantly while page.tsx awaits fetchJobPage on an uncached render — without this a new
// tab shows a blank page (no shell at all) until the backend responds.
// Same breadcrumb row + .jd frame as page.tsx/JobSharePage so nothing shifts on swap.
export default function Loading() {
  return (
    <div className="page-wash" data-wash="jobs">
      <div className="jd-crumbs"><div className="skeleton" style={{ height: 14, width: 260, borderRadius: 6 }} /></div>
      <div className="jd">
        <JobDetailSkeleton />
      </div>
    </div>
  );
}
