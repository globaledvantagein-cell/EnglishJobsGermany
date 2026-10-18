'use client';

/**
 * Admin application shell: sidebar + top bar around a full-height main area.
 *
 * The shell owns the viewport (100dvh, overflow hidden) so the page itself
 * never scrolls — each page decides which panel scrolls. That is what keeps
 * toolbars, table headers and action bars on screen at all times.
 *
 * Live counters (review backlog, trash, unread feedback) are fetched here and
 * shared through useAdminCounts() so pages can refresh them after a mutation.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronRight, ExternalLink, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Rows3, Rows4, Sun } from 'lucide-react';
import { Link } from '@/compat/router';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { apiGet } from '../../utils/jobApi';
import { AdminUiProvider } from './AdminUiContext';
import { ADMIN_HOME, ADMIN_NAV, findNavItem, type NavCounter } from './adminNav';
import './admin.css';
import BrandLogo from '../BrandLogo';

interface Counts { review: number | null; pendingDecision: number | null; trash: number | null; feedback: number | null }

interface CountsValue { counts: Counts; refreshCounts: () => void }

const CountsContext = createContext<CountsValue>({
  counts: { review: null, pendingDecision: null, trash: null, feedback: null },
  refreshCounts: () => {},
});

export const useAdminCounts = () => useContext(CountsContext);

const COUNTS_POLL_MS = 60_000;
const DENSITY_KEY = 'ejg_admin_density';
const COLLAPSED_KEY = 'ejg_admin_sidebar_collapsed';

type Density = 'compact' | 'comfortable';

function readPref(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ADMIN_HOME;
  const { user, logout } = useAuth();
  const { toggle: toggleTheme, isDark } = useTheme();

  // The shell only renders client-side (AuthGuard shows a loader until auth
  // resolves), so reading saved preferences in the initializer is safe.
  const [density, setDensity] = useState<Density>(() => (readPref(DENSITY_KEY) === 'comfortable' ? 'comfortable' : 'compact'));
  const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSED_KEY) === 'true');
  const [counts, setCounts] = useState<Counts>({ review: null, pendingDecision: null, trash: null, feedback: null });

  const refreshCounts = useCallback(() => {
    apiGet<{ pendingReview: number; pendingDecision: number; rejectedJobs: number }>('/api/analytics/counts', { noAuth: true })
      .then(data => setCounts(prev => ({ ...prev, review: data.pendingReview, pendingDecision: data.pendingDecision, trash: data.rejectedJobs })))
      .catch(() => {});
    apiGet<{ unread: number }>('/api/feedback/stats')
      .then(data => setCounts(prev => ({ ...prev, feedback: data.unread })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCounts();
    const id = window.setInterval(() => { if (!document.hidden) refreshCounts(); }, COUNTS_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshCounts]);

  const toggleDensity = () => {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    setDensity(next);
    writePref(DENSITY_KEY, next);
  };

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      writePref(COLLAPSED_KEY, String(!prev));
      return !prev;
    });
  };

  const current = findNavItem(pathname);
  const countsValue = useMemo(() => ({ counts, refreshCounts }), [counts, refreshCounts]);

  // The review badge shows only the blocking backlog (not live yet); the
  // auto-published "awaiting confirmation" jobs are already on the site.
  const counterValue = (counter?: NavCounter): number | null => {
    if (!counter) return null;
    return counter === 'review' ? counts.pendingDecision : counts[counter];
  };

  return (
    <CountsContext.Provider value={countsValue}>
      <AdminUiProvider>
        <div className="adm adm-shell" data-density={density} data-collapsed={collapsed ? 'true' : 'false'}>
          <aside className="adm-sidebar" aria-label="Admin navigation">
            <Link to={ADMIN_HOME} className="adm-brand" style={{ color: 'inherit', textDecoration: 'none' }}>
              {/* Same lockup as the public site (components/BrandLogo). */}
              <BrandLogo size="sm" href={null} wordmark={false} />
              <span className="adm-brand-text"><BrandLogo size="sm" href={null} mark={false} tagline={false} badge="Admin" /></span>
            </Link>

            <nav className="adm-nav">
              {ADMIN_NAV.map(group => (
                <div key={group.label} className="adm-nav-group">
                  <div className="adm-nav-label">{group.label}</div>
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const active = current?.href === item.href;
                    const count = counterValue(item.counter);
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="adm-nav-link"
                        aria-current={active ? 'page' : undefined}
                        title={item.label}
                      >
                        <Icon size={15} />
                        <span className="adm-nav-text">{item.label}</span>
                        {count != null && count > 0 && (
                          <span className="adm-nav-count" data-tone={item.counter === 'feedback' || item.counter === 'review' ? 'accent' : undefined}>
                            {count > 999 ? `${Math.floor(count / 1000)}k` : count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="adm-sidebar-foot">
              <Link to="/" className="adm-nav-link" title="Open public site">
                <ExternalLink size={15} />
                <span className="adm-nav-text">Public site</span>
              </Link>
              <button type="button" className="adm-nav-link" onClick={logout} title="Log out" style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }}>
                <LogOut size={15} />
                <span className="adm-nav-text">Log out{user?.name ? ` · ${user.name}` : ''}</span>
              </button>
            </div>
          </aside>

          <header className="adm-topbar">
            <button
              type="button"
              className="adm-btn adm-hide-sm"
              data-variant="ghost"
              data-icon="true"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
            <nav className="adm-crumb" aria-label="Breadcrumb">
              <span>Admin</span>
              <ChevronRight size={12} />
              <strong>{current?.label ?? 'Overview'}</strong>
            </nav>
            <span className="adm-topbar-spacer" />
            <button
              type="button"
              className="adm-btn"
              data-variant="ghost"
              data-icon="true"
              onClick={toggleDensity}
              aria-label={`Switch to ${density === 'compact' ? 'comfortable' : 'compact'} rows`}
              title={`Rows: ${density} (click to switch)`}
            >
              {density === 'compact' ? <Rows4 size={15} /> : <Rows3 size={15} />}
            </button>
            <button
              type="button"
              className="adm-btn"
              data-variant="ghost"
              data-icon="true"
              onClick={toggleTheme}
              aria-label="Toggle colour theme"
              title="Toggle colour theme"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </header>

          <main className="adm-main">{children}</main>
        </div>
      </AdminUiProvider>
    </CountsContext.Provider>
  );
}
