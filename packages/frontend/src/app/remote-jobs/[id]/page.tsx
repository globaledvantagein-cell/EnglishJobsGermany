import type { Metadata } from 'next';
import RemoteJobSharePage from '@/page-components/RemoteJobSharePage';
import { alternatesFor } from '@/lib/seoAlternates';

// The remote detail endpoint is ungated and the vertical is not enumerated in
// the sitemap, so there is nothing to prerender — render on demand.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Remote job — English Jobs Germany',
    alternates: alternatesFor(`/remote-jobs/${id}`),
  };
}

export default async function RemoteJobDetailRoute({ params }: Params) {
  const { id } = await params;
  return <RemoteJobSharePage jobId={id} />;
}
