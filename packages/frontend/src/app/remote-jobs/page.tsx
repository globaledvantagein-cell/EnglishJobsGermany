import type { Metadata } from 'next';
import { Suspense } from 'react';
import RemoteDashboard from '@/page-components/RemoteDashboard';
import { BrowsePageSkeleton } from '@/components/jobs/JobCardSkeleton';
import { alternatesFor } from '@/lib/seoAlternates';

export const metadata: Metadata = {
  title: 'Remote Jobs — Work From Anywhere | English Jobs Germany',
  description:
    'Browse 5,000+ fully remote jobs from top companies in the US, UK, Canada, and Australia. Work from Germany or anywhere in the world.',
  alternates: alternatesFor('/remote-jobs'),
};

export default function RemoteJobsPage() {
  // RemoteDashboard reads ?company= / ?search= / ?id= via useSearchParams → needs Suspense.
  return (
    <Suspense fallback={<BrowsePageSkeleton />}>
      <RemoteDashboard />
    </Suspense>
  );
}
