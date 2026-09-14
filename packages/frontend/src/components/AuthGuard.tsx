'use client';

import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from '@/compat/router';

interface Props {
  children: ReactNode;
  /** Require an admin user. Non-admins are bounced home. */
  requireAdmin?: boolean;
  /**
   * Where to send unauthenticated users. Defaults to /login.
   * Some pages (Applied, Profile) prefer a soft in-page prompt instead — those
   * simply don't wrap in AuthGuard and handle !isAuthenticated themselves.
   */
  redirectTo?: string;
}

/**
 * Client-side route guard — the Next.js replacement for react-router's
 * <ProtectedRoute><Outlet/></ProtectedRoute>. Wrap a page's content:
 *   <AuthGuard requireAdmin><Dashboard /></AuthGuard>
 */
export default function AuthGuard({ children, requireAdmin, redirectTo = '/login' }: Props) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to={redirectTo} replace />;

  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
