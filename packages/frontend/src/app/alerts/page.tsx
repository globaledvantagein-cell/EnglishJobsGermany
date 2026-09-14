import { Suspense } from 'react';
import Alerts from '@/page-components/Alerts';
import { alternatesFor } from '@/lib/seoAlternates';

export const metadata = {
  title: 'Weekly Job Alerts',
  description: 'Get a weekly digest of new English-speaking jobs in Germany.',
  alternates: alternatesFor('/alerts'),
};

export default function AlertsPage() {
  return (
    <Suspense fallback={null}>
      <Alerts />
    </Suspense>
  );
}
