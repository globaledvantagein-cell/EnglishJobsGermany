import type { Metadata } from 'next';
import { Suspense } from 'react';
import Legal from '@/page-components/Legal';
import { alternatesFor } from '@/lib/seoAlternates';

export const metadata: Metadata = {
  title: 'Privacy & Terms',
  description: 'Privacy policy and terms of service for English Jobs in Germany.',
  alternates: alternatesFor('/legal'),
};

export default function LegalPage() {
  // Legal reads ?tab= via useSearchParams → needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <Legal />
    </Suspense>
  );
}
