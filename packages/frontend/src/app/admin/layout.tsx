import type { ReactNode } from 'react';
import AuthGuard from '@/components/AuthGuard';
import AdminShell from '@/components/admin/AdminShell';

export const metadata = { title: 'Admin · English Jobs Germany', robots: { index: false, follow: false } };

// Every /admin/* route is admin-only and rendered inside the admin shell. The
// public Layout steps aside for these paths (see components/Layout.tsx).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requireAdmin>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
