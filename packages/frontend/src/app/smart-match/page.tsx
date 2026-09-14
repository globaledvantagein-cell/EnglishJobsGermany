import AuthGuard from '@/components/AuthGuard';
import SmartMatch from '@/page-components/SmartMatch';

export const metadata = { title: 'Smart Match', robots: { index: false } };

export default function SmartMatchPage() {
  // Auth-only guard: the SmartMatch component itself gates non-premium users
  // (Premium pitch) so free/premium users reach the page; admins are premium.
  return (
    <AuthGuard>
      <SmartMatch />
    </AuthGuard>
  );
}
