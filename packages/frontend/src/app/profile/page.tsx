import AuthGuard from '@/components/AuthGuard';
import Profile from '@/page-components/Profile';

export const metadata = { title: 'Your Profile', robots: { index: false } };

export default function ProfilePage() {
  return (
    <AuthGuard>
      <Profile />
    </AuthGuard>
  );
}
