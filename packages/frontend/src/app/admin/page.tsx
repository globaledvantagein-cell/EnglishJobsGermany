import { Suspense } from 'react';
import AdminOverview from '@/page-components/admin/AdminOverview';

// Suspense: AdminOverview reads ?tab= via useSearchParams, which Next requires
// to sit under a boundary for the production build.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminOverview />
    </Suspense>
  );
}
