import JobDetailSkeleton from '@/components/JobDetailSkeleton';
import { Container } from '@/components/ui';

// Streamed instantly while page.tsx awaits fetchJobFull — without this a new
// tab shows a blank page (no shell at all) until the backend responds.
// Mirrors JobSharePage's outer container so nothing shifts on swap.
export default function Loading() {
  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '80vh' }}>
      <Container style={{ maxWidth: 1000, padding: '24px 24px 48px' }}>
        <div className="skeleton" style={{ height: 16, width: 120, marginBottom: 20 }} />
        <JobDetailSkeleton />
      </Container>
    </div>
  );
}
