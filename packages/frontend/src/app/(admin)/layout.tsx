import type { ReactNode } from 'react';
import AuthGuard from '@/components/AuthGuard';

export const metadata = { robots: { index: false } };

// Every route in the (admin) group is admin-only. The group parentheses mean
// this does NOT add a URL segment — paths stay /dashboard, /review, etc.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AuthGuard requireAdmin>{children}</AuthGuard>;
}
