import JobDetailSkeleton from '@/components/JobDetailSkeleton';

// Mirrors RemoteJobSharePage's outer container so the skeleton → page swap
// does not shift layout.
export default function Loading() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px,3vw,28px)' }}>
      <div className="skeleton" style={{ height: 14, width: 140, marginBottom: 14 }} />
      <JobDetailSkeleton />
    </div>
  );
}
