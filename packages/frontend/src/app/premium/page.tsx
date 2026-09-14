import { Suspense } from 'react';
import PremiumCheckout from '@/page-components/PremiumCheckout';

// Transactional page — keep it out of the index (noindex, nofollow).
export const metadata = {
  title: { absolute: 'Premium — English Jobs Germany' },
  description:
    'Upgrade to Premium for unlimited job descriptions, unlimited apply clicks, Smart Match, Today’s Matches, and advanced filters.',
  robots: { index: false, follow: false },
};

export default function PremiumPage() {
  return (
    <Suspense fallback={null}>
      <PremiumCheckout />
    </Suspense>
  );
}
