import { JobDetailSkeleton } from '@/components/job-detail';

// Same .jd frame as RemoteJobSharePage so the skeleton → page swap does not shift layout.
export default function Loading() {
  return (
    <div className="page-wash" data-wash="remote">
    <div className="jd">
      <div className="jd-top"><div className="skeleton" style={{ height: 14, width: 110, borderRadius: 6 }} /></div>
      <JobDetailSkeleton />
    </div>
    </div>
  );
}
