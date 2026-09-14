'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from '@/compat/router';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppliedJobs } from '../context/AppliedJobsContext';
import { useTheme } from '../theme/ThemeProvider';
import Footer from './Footer';
import FeedbackWidget from './FeedbackWidget';
import { Toast } from './Toast';
import ApplyConfirmToast from './ApplyConfirmToast';
import { Button } from './ui';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { apiGet } from '../utils/jobApi';
import DesktopNav from './layout/DesktopNav';
import MobileDrawer from './layout/MobileDrawer';
import UserMenu from './layout/UserMenu';
import RouteProgress from './RouteProgress';
import ConnectionBanner from './ConnectionBanner';
import { ADMIN_LINKS, PUBLIC_LINKS } from './layout/navLinks';

export default function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, isAuthenticated, isAdmin, isPremium } = useAuth();
  const { toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [unreadFeedback, setUnreadFeedback] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const isMobileNav = useMediaQuery('(max-width: 767px)');

  // Auth/admin state is unknown during SSR and must be unknown on the FIRST
  // client render too (this component hydrates late, after AuthProvider's effect
  // has already populated the user). Gate every auth-dependent branch on
  // `hydrated` so the first client render matches the logged-out server HTML,
  // then reveal the real state after Layout mounts.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const effIsAuthenticated = hydrated && isAuthenticated;
  const effIsAdmin = hydrated && isAdmin;
  const effUser = hydrated ? user : null;
  // Pre-hydration render must match logged-out server HTML → assume premium
  // (no crown) until hydrated, then reveal the real state.
  const effIsPremium = hydrated ? isPremium : true;

  const hideFeedbackWidget = effIsAdmin || loc.pathname.startsWith('/admin');

  // ── "Did you apply?" toast on tab refocus ───────────────────────────────
  const { pendingItems, resolvePending } = useAppliedJobs();
  const [applyToast, setApplyToast] = useState<{ jobId: string; jobTitle: string; company: string } | null>(null);

  useEffect(() => {
    const showNextPending = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingItems.length > 0 && !applyToast) {
        const latest = pendingItems[pendingItems.length - 1];
        setApplyToast({ jobId: latest.jobId, jobTitle: latest.jobTitle, company: latest.company });
      }
    };

    document.addEventListener('visibilitychange', showNextPending);
    window.addEventListener('focus', showNextPending);

    // Also check on mount (handles browser-killed-and-reopened scenario)
    if (pendingItems.length > 0 && !applyToast) {
      setTimeout(showNextPending, 1000);
    }

    return () => {
      document.removeEventListener('visibilitychange', showNextPending);
      window.removeEventListener('focus', showNextPending);
    };
  }, [pendingItems, applyToast]);

  // ── Toast triggers from URL params ──────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('unsubscribed') === 'true') {
      setToast({ message: 'You have been unsubscribed from the weekly digest.', type: 'success' });
      searchParams.delete('unsubscribed');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const closeDrawer = useCallback(() => {
    setDrawerClosing(prev => {
      if (prev) return prev;
      setTimeout(() => {
        setDrawerOpen(false);
        setDrawerClosing(false);
      }, 200);
      return true;
    });
  }, []);

  // Close drawer on route change or breakpoint flip
  useEffect(() => { if (drawerOpen) closeDrawer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loc.pathname, isMobileNav]);

  // Lock body scroll while drawer open
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Poll feedback count for admins
  useEffect(() => {
    if (!isAdmin) return;
    apiGet<{ unread?: number }>('/api/feedback/stats')
      .then(data => setUnreadFeedback(data?.unread || 0))
      .catch(() => {});
  }, [isAdmin, loc.pathname]);

  const isActive = useCallback((path: string) => loc.pathname === path, [loc.pathname]);
  const links = useMemo(() => effIsAdmin ? ADMIN_LINKS : PUBLIC_LINKS, [effIsAdmin]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <RouteProgress />
      <nav
        className="nav-blur"
        style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--border)' }}
        aria-label="Main navigation"
      >
        <div
          style={{
            maxWidth: 1600,
            margin: '0 auto',
            padding: '0 clamp(16px, 3vw, 24px)',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <Link
            to={effIsAdmin ? '/dashboard' : '/'}
            style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}
            aria-label="English Jobs in Germany home"
          >
            <img
              src="/logo.jpeg"
              alt=""
              style={{ height: isMobileNav ? 28 : 32, width: 'auto', display: 'block', flexShrink: 0 }}
              loading="eager"
              decoding="async"
            />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: isMobileNav ? '0.95rem' : '1.1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                English <span style={{ color: 'var(--primary)' }}>Jobs</span>
              </span>
              {!isMobileNav && (
                <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 2 }}>in Germany</span>
              )}
              {effIsAdmin && (
                <span style={{ fontSize: '0.58rem', fontWeight: 700, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em', alignSelf: 'flex-start', marginTop: 2 }}>ADMIN</span>
              )}
            </div>
          </Link>

          {!isMobileNav && (
            <DesktopNav links={links} isActive={isActive} unreadFeedback={unreadFeedback} isPremium={effIsPremium} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={toggle}
              aria-label="Toggle color theme"
              className="no-touch-expand theme-toggle"
              style={{
                width: 34, height: 34, borderRadius: 8,
                border: '1px solid var(--border-mid, var(--border))', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              {/* Both icons render identically on server + client; CSS shows one
                  based on <html data-theme>. Avoids a theme hydration mismatch. */}
              <span className="theme-icon theme-icon--light" aria-hidden="true"><Moon size={15} /></span>
              <span className="theme-icon theme-icon--dark" aria-hidden="true"><Sun size={15} /></span>
            </button>

            {!isMobileNav && effIsAuthenticated && (
              <UserMenu userName={effUser?.name} isAdmin={effIsAdmin} onLogout={logout} />
            )}
            {!isMobileNav && !effIsAuthenticated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
                <Link to="/signup"><Button size="sm">Get alerts</Button></Link>
              </div>
            )}

            {isMobileNav && (
              <button
                onClick={() => (drawerOpen ? closeDrawer() : setDrawerOpen(true))}
                aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={drawerOpen}
                aria-controls="mobile-nav-drawer"
                className="no-touch-expand"
                style={{
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                  cursor: 'pointer', color: 'var(--text-primary)',
                }}
              >
                {drawerOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
          </div>
        </div>
      </nav>

      <MobileDrawer
        open={drawerOpen}
        closing={drawerClosing}
        links={links}
        isActive={isActive}
        isAuthenticated={effIsAuthenticated}
        isAdmin={effIsAdmin}
        user={effUser}
        onClose={closeDrawer}
        onLogout={logout}
      />

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {applyToast && (
        <ApplyConfirmToast
          jobTitle={applyToast.jobTitle}
          company={applyToast.company}
          onConfirm={() => {
            resolvePending(applyToast.jobId, true);
            setApplyToast(null);
          }}
          onDismiss={() => {
            resolvePending(applyToast.jobId, false);
            setApplyToast(null);
          }}
        />
      )}

      {/* Keyed on the path so each route's content runs the enter animation
          once on arrival; the previous page never lingers half-swapped. */}
      <main
        key={loc.pathname}
        className="page-enter"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        role="main"
      >
        {children}
      </main>
      <Footer />
      <ConnectionBanner />
      {!hideFeedbackWidget && <FeedbackWidget />}
    </div>
  );
}