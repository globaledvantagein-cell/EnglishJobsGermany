import AuthGuard from '@/components/AuthGuard';
import TodayMatches from '@/page-components/TodayMatches';

export const metadata = { title: "Today's Matches", robots: { index: false } };

export default function TodayMatchesPage() {
  return (
    <AuthGuard>
      <TodayMatches />
    </AuthGuard>
  );
}
