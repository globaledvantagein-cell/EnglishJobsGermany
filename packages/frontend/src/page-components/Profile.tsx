'use client';

import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from '@/compat/router';
import { Bookmark, Check, Clock, SlidersHorizontal, User as UserIcon, LogOut, Crown, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSavedJobs } from '../context/SavedJobsContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Button, Container, Badge, Alert, EmptyState } from '../components/ui';
import { ErrorState, classifyError } from '../components/ui/ErrorState';
import { JobCardSkeleton } from '../components/jobs/JobCardSkeleton';
import { UsageBar, PromoCodeForm } from '../components/UpgradeModal';
import { BRAND } from '../theme/brand';
import { apiGet, fetchSubscriptionHistory } from '../utils/jobApi';
import type { SubscriptionResponse } from '../types';
import { getCategoryLabel } from '../utils/categorize';
import IdentityCard from '../components/profile/IdentityCard';
import EmailPreferences from '../components/profile/EmailPreferences';
import JobPreferencesForm from '../components/profile/JobPreferencesForm';
import ParsedResumeProfile from '../components/profile/ParsedResumeProfile';
import DangerZone from '../components/profile/DangerZone';
import type { ProfileData } from '../components/profile/profileTypes';

// 8px spacing rhythm. The active section's content stacks here; the child
// components bring their own compact cards.
const CONTENT_STACK: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 };

type TabId = 'profile' | 'preferences' | 'subscription' | 'saved' | 'history';
interface TabDef { id: TabId; label: string; icon: ReactNode; title: string; blurb: string }
const TABS: TabDef[] = [
  { id: 'profile',      label: 'Profile',      icon: <UserIcon size={15} />,          title: 'Your profile',        blurb: 'Who you are to employers: your account and the resume that powers matching.' },
  { id: 'preferences',  label: 'Preferences',  icon: <SlidersHorizontal size={15} />, title: 'Preferences',         blurb: 'What lands in your inbox and how roles are scored for you.' },
  { id: 'subscription', label: 'Subscription', icon: <Crown size={15} />,             title: 'Subscription',        blurb: 'Your plan, weekly usage, and purchase history.' },
  { id: 'saved',        label: 'Saved jobs',   icon: <Bookmark size={15} />,          title: 'Saved jobs',          blurb: 'Roles you bookmarked to come back to.' },
  { id: 'history',      label: 'Applications', icon: <Clock size={15} />,             title: 'Application history', blurb: 'Every role you clicked Apply on, in one place.' },
];
const TAB_IDS = new Set<string>(TABS.map(t => t.id));

/**
 * The active tab lives in the URL hash so refresh, back, and shared links land
 * on the same section. Read through useSyncExternalStore: the server (no hash)
 * and the first client render both yield 'profile', so there is no hydration
 * mismatch, and the real hash takes over in the same commit.
 */
function readTabFromHash(): TabId {
  const h = window.location.hash.replace('#', '');
  return TAB_IDS.has(h) ? (h as TabId) : 'profile';
}
function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('ejg-tabchange', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('ejg-tabchange', cb);
  };
}
function useHashTab(): [TabId, (next: TabId) => void] {
  const tab = useSyncExternalStore(subscribeHash, readTabFromHash, () => 'profile' as TabId);
  const setTab = useCallback((next: TabId) => {
    if (window.location.hash !== `#${next}`) window.history.replaceState(null, '', `#${next}`);
    window.dispatchEvent(new Event('ejg-tabchange'));
  }, []);
  return [tab, setTab];
}

/**
 * Sidebar / tab-bar navigation item. Styling lives in .profile-tab (globals.css):
 * a marker bar grows in for the active item, icons nudge on hover, and the
 * optional count pill shows list sizes without opening the tab.
 */
function TabButton({
  tab, active, mobile, count, onClick,
}: { tab: TabDef; active: boolean; mobile: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`profile-tab ${active ? 'is-active' : ''}`}
      style={mobile ? { width: 'auto' } : undefined}
    >
      {tab.icon}
      {tab.label}
      {count != null && count > 0 && <span className="profile-tab__count">{count}</span>}
    </button>
  );
}

/** Title + one-line description above each section, so a tab never opens onto a bare card. */
function SectionHeader({ tab }: { tab: TabDef }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>{tab.title}</h1>
      <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{tab.blurb}</p>
    </div>
  );
}

/** Structured placeholder that mirrors the desktop shell (rail + content) so the swap doesn't reflow. */
function ProfileSkeleton({ mobile }: { mobile: boolean }) {
  const line = (w: string | number, h = 12) => <div className="skeleton" style={{ height: h, width: w, borderRadius: 5 }} />;
  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
      {line('38%', 24)}{line('60%', 12)}
      <div className="skeleton-card" style={{ borderRadius: 12, padding: 16, gap: 16, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div className="skeleton-card__lines">{line('40%', 16)}{line('55%', 11)}{line('30%', 11)}</div>
      </div>
      <div className="skeleton-card" style={{ borderRadius: 12, padding: 16, flexDirection: 'column', gap: 10 }}>
        {line('30%', 14)}{line('90%', 11)}{line('75%', 11)}{line('60%', 11)}
      </div>
    </div>
  );
  if (mobile) return <div style={{ padding: '16px clamp(14px, 4vw, 20px) 40px' }}>{content}</div>;
  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '20px clamp(16px, 3vw, 32px) 48px', display: 'flex', gap: 24 }} role="status" aria-label="Loading profile">
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>{line('70%', 12)}{line('90%', 10)}</div>
        </div>
        {[90, 110, 120, 100, 130].map((w, i) => <div key={i} style={{ padding: '9px 12px' }}>{line(w, 12)}</div>)}
      </div>
      {content}
    </div>
  );
}

/**
 * Profile page — visible only when VITE_ENABLE_PROFILE=true.
 * Identity card + email preferences + a couple of "soon" placeholders.
 */
export default function Profile() {
  const { user, logout, isAdmin, token, isLoading: authLoading } = useAuth();
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [tab, setTab] = useHashTab();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meError, setMeError] = useState<unknown>(null);
  const [retryTick, setRetryTick] = useState(0);
  const { savedIds } = useSavedJobs();

  useEffect(() => { document.title = `Profile · ${BRAND.appName}`; }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setLoading(false);
      return;
    }
    apiGet<ProfileData>('/api/auth/me')
      .then(setProfile)
      .catch(err => {
        console.error('[Profile] /me fetch failed:', err);
        setMeError(err);
        setLoadError('Could not load your latest preferences.');
      })
      .finally(() => setLoading(false));
  }, [token, authLoading, retryTick]);

  if (authLoading || loading) return <ProfileSkeleton mobile={isMobile} />;

  if (!user) {
    return (
      <Container style={{ padding: '40px 24px' }}>
        <Alert type="error">You are not signed in. Please log in to view your profile.</Alert>
      </Container>
    );
  }

  // Merge auth user (always available) with /me profile (richer fields).
  const display: ProfileData = {
    email: profile?.email || user.email,
    name: profile?.name || user.name,
    role: (profile?.role || user.role) as 'user' | 'admin',
    avatarUrl: profile?.avatarUrl ?? user.avatarUrl ?? null,
    createdAt: profile?.createdAt,
    acceptedTermsAt: profile?.acceptedTermsAt,
    isSubscribed: profile?.isSubscribed,
    desiredCategories: profile?.desiredCategories,
    lastEmailSent: profile?.lastEmailSent,
  };

  // Only the active section is mounted — progressive disclosure keeps the
  // cognitive load (and the DOM) to one section at a time. Keyed so a tab
  // switch re-triggers the opacity fade (fadeIn keyframe = opacity only, GPU),
  // preventing the content from teleporting.
  const activeTab = TABS.find(t => t.id === tab) ?? TABS[0];
  // /me failed and we have nothing richer than the auth user: offer a retry
  // on the sections that depend on it instead of silently showing stale data.
  const meFailure = meError && !profile ? (() => {
    const { kind, hint } = classifyError(meError);
    return <ErrorState kind={kind} title={kind === 'unreachable' ? 'Can\u2019t reach your account data' : 'Your profile didn\u2019t load'} hint={hint} onRetry={() => { setLoading(true); setMeError(null); setRetryTick(t => t + 1); }} />;
  })() : null;

  const activeContent = (
    <div key={tab} className="profile-section" style={CONTENT_STACK}>
      <SectionHeader tab={activeTab} />
      {tab === 'profile' && (
        <div style={CONTENT_STACK}>
          <IdentityCard data={display} isAdmin={isAdmin} savedCount={savedIds.size} />
          {meFailure}
          <ParsedResumeProfile />
          <DangerZone />
        </div>
      )}
      {tab === 'preferences' && (
        <div style={CONTENT_STACK}>
          {meFailure}
          {profile && <EmailPreferences profile={profile} loadError={loadError} onProfileUpdated={setProfile} />}
          <JobPreferencesForm />
        </div>
      )}
      {tab === 'subscription' && <SubscriptionSection />}
      {tab === 'saved' && <SavedJobsList />}
      {tab === 'history' && (
        <EmptyState
          icon={<Clock size={28} />}
          title="Application tracking is coming soon"
          body="Roles you click Apply on will be listed here with the date, so you can follow up at the right time. Until then, the Applied badge on job cards marks them for you."
          action={<Link to="/applied" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>See jobs you have applied to \u2192</Link>}
        />
      )}
    </div>
  );

  // Identity mini — always visible for wayfinding (avatar + name + role).
  const identityMini = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {display.avatarUrl ? (
        <img src={display.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
          <UserIcon size={17} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display.name}</span>
          {isAdmin && <Badge variant="red" style={{ fontSize: '0.55rem', padding: '1px 5px' }}>ADMIN</Badge>}
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display.email}</p>
      </div>
    </div>
  );

  const signOutLink = (
    <button
      onClick={logout}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600,
        fontFamily: 'inherit', padding: '8px 10px', textAlign: 'left',
        transition: 'color 0.16s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      <LogOut size={14} /> Sign out
    </button>
  );

  // ── Mobile: identity + sign-out header, horizontal tab bar, content below ──
  if (isMobile) {
    return (
      <div style={{ padding: '16px clamp(14px, 4vw, 20px) 40px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          {identityMini}
          {signOutLink}
        </div>
        <div
          className="thin-scroll profile-tabs--mobile"
          style={{ display: 'flex', gap: 2, overflowX: 'auto', marginBottom: 16, borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}
        >
          {TABS.map(t => <TabButton key={t.id} tab={t} active={tab === t.id} mobile count={t.id === 'saved' ? savedIds.size : undefined} onClick={() => setTab(t.id)} />)}
        </div>
        {activeContent}
      </div>
    );
  }

  // ── Desktop: fixed left sidebar + full-width content panel ──
  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '20px clamp(16px, 3vw, 32px) 48px', width: '100%', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <aside
        style={{
          width: 240, flexShrink: 0,
          position: 'sticky', top: 76,
          display: 'flex', flexDirection: 'column', gap: 6,
          maxHeight: 'calc(100vh - 92px)',
        }}
      >
        <div style={{ padding: '0 2px 12px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
          {identityMini}
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TABS.map(t => <TabButton key={t.id} tab={t} active={tab === t.id} mobile={false} count={t.id === 'saved' ? savedIds.size : undefined} onClick={() => setTab(t.id)} />)}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          {signOutLink}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        {activeContent}
      </main>
    </div>
  );
}

// ── Saved jobs ───────────────────────────────────────────────────────────────
interface SavedEntry {
  jobId: string;
  savedAt: string | null;
  isActive: boolean;
  job: {
    JobTitle: string;
    Company: string;
    Location: string;
    Category?: string;
  };
}

function SavedJobsList() {
  const { savedVersion, toggleSave } = useSavedJobs();
  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());

  // Refetch whenever a bookmark is toggled anywhere in the app.
  useEffect(() => {
    apiGet<{ jobs: SavedEntry[] }>('/api/jobs/saved')
      .then(data => setEntries(data?.jobs || []))
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [savedVersion, retryTick]);

  // Slide the row out before the refetch removes it, so the list never jumps.
  const remove = (jobId: string) => {
    setLeaving(prev => new Set(prev).add(jobId));
    setTimeout(() => { void toggleSave(jobId); }, 200);
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 8 }} role="status" aria-label="Loading saved jobs">
        {[0, 1, 2].map(i => <JobCardSkeleton key={i} badges={i === 1 ? 1 : 2} />)}
      </div>
    );
  }

  if (error) {
    const { kind, hint } = classifyError(error);
    return <ErrorState kind={kind} title={kind === 'unreachable' ? 'Can\u2019t reach your saved jobs' : 'Saved jobs didn\u2019t load'} hint={hint} onRetry={() => { setLoading(true); setError(null); setRetryTick(t => t + 1); }} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark size={28} />}
        title="Nothing saved yet"
        body="Tap the bookmark on any role to keep it here for later."
        action={<Button as="a" href="/jobs" size="sm"><Search size={14} /> Browse jobs</Button>}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {entries.map((entry, i) => (
        <div
          key={entry.jobId}
          className={`saved-row card-enter ${leaving.has(entry.jobId) ? 'is-leaving' : ''}`}
          style={{
            ['--i' as string]: i,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '12px 14px',
            opacity: entry.isActive ? 1 : 0.7,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <a
              href={`/jobs/${entry.jobId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="saved-row__title"
              style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none', wordBreak: 'break-word' }}
            >
              {entry.job.JobTitle}
            </a>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {entry.job.Company} \u00b7 {entry.job.Location}
              {entry.savedAt && <> \u00b7 saved {formatDate(entry.savedAt)}</>}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {entry.job.Category && getCategoryLabel(entry.job.Category) && (
                <Badge variant="blue" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                  {getCategoryLabel(entry.job.Category)}
                </Badge>
              )}
              {!entry.isActive && (
                <Badge variant="neutral" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>No longer listed</Badge>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => remove(entry.jobId)}
            aria-label={`Remove ${entry.job.JobTitle} from saved jobs`}
            title="Remove from saved"
            className="save-btn is-saved"
            style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--primary)', borderRadius: 8, lineHeight: 0, flexShrink: 0 }}
          >
            <Bookmark size={16} fill="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Subscription ─────────────────────────────────────────────────────────────
function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Shown when there is no subscription record to load (the normal state for a
// free user) — an invitation, not an error. Premium users with a real fetch
// failure still get the error alert below.
//
// Visual language mirrors the /premium membership card (PremiumCheckout):
// navy gradient + gold hairline, fixed colors on purpose so it reads
// identically in both themes and profile → /premium feels like one moment.
function PremiumInviteCard() {
  const navigate = useNavigate();
  const gold = '#d4a94a';
  const cardMuted = '#8a94a6';
  const perks = [
    'Unlimited job description views',
    'Unlimited apply clicks',
    'Smart Match — AI resume scoring',
    "Today's Matches — daily personalized picks",
    'Advanced filters — salary, visa, relocation, experience, workplace',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginTop: 24 }}>
      <div style={{
        background: 'linear-gradient(165deg, #131c29 0%, #0f1620 55%, #0c1219 100%)',
        border: '1px solid rgba(212, 169, 74, 0.28)',
        borderRadius: 14, padding: '14px 16px 12px', boxShadow: 'var(--shadow-md)',
        position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 520,
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${gold}, transparent)` }} />

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: gold,
        }}>
          <Crown size={13} /> Premium · Not active yet
        </span>

        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.2rem', fontWeight: 700,
          color: '#fff', margin: '8px 0 0', letterSpacing: '-0.01em', lineHeight: 1.2,
        }}>
          Your next role won&rsquo;t wait.
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: cardMuted, lineHeight: 1.45 }}>
          Unlock everything the free plan holds back — from your first search to your signed offer.
        </p>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0 8px' }} />

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {perks.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem', color: '#c7d0dd', lineHeight: 1.4 }}>
              <span style={{ color: gold, flexShrink: 0, marginTop: 1 }}><Check size={13} /></span>
              {f}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => navigate('/premium')}
          style={{
            marginTop: 12, width: '100%', height: 38,
            background: `linear-gradient(90deg, ${gold}, #e6c069)`, color: '#0f1620',
            border: 'none', borderRadius: 9, fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 800,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          <Crown size={15} /> Unlock Premium
        </button>
        <p style={{ margin: '7px 0 0', fontSize: '0.7rem', color: cardMuted, textAlign: 'center', letterSpacing: '0.02em' }}>
          No auto-renewal · No credit card required
        </p>
      </div>

      <div style={{
        background: 'linear-gradient(165deg, #131c29 0%, #0f1620 55%, #0c1219 100%)',
        border: '1px solid rgba(212, 169, 74, 0.28)',
        borderRadius: 12, padding: '12px 14px', width: '100%', maxWidth: 520,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${gold}, transparent)` }} />
        <p style={{
          fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: gold, margin: '0 0 8px',
        }}>
          Have an invite code?
        </p>
        <PromoCodeForm variant="premium" />
      </div>
    </div>
  );
}

function SubscriptionSection() {
  const navigate = useNavigate();
  const { isPremium: authIsPremium } = useAuth();
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchSubscriptionHistory()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} role="status" aria-label="Loading subscription">
        <div className="skeleton-card" style={{ borderRadius: 12, padding: 18, flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 10 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 14, width: '30%' }} /><div className="skeleton" style={{ height: 11, width: '55%' }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 8, width: '100%', borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 8, width: '100%', borderRadius: 4 }} />
        </div>
        <div className="skeleton-card" style={{ borderRadius: 12, padding: 18, flexDirection: 'column', gap: 10 }}>
          <div className="skeleton" style={{ height: 14, width: '35%' }} /><div className="skeleton" style={{ height: 11, width: '25%' }} />
        </div>
      </div>
    );
  }
  if (error || !data) {
    // A missing subscription record is the normal state for a free user —
    // sell the upgrade instead of showing an error. Only premium users
    // (who must have a record) see a real failure message.
    if (!authIsPremium) return <PremiumInviteCard />;
    return <Alert type="error">Could not load your subscription details. Please refresh.</Alert>;
  }

  const { isPremium, usage, history } = data;
  const expiresAt = usage.premiumExpiresAt;
  const expiringSoon = isPremium && expiresAt
    ? (new Date(expiresAt).getTime() - Date.now()) < 7 * DAY_MS
    : false;

  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
  };

  const statusColors: Record<string, { bg: string; fg: string }> = {
    active:    { bg: 'var(--success-soft)', fg: 'var(--success)' },
    expired:   { bg: 'var(--bg-surface-2)', fg: 'var(--text-muted)' },
    cancelled: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isPremium ? (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'var(--acid-soft)', color: 'var(--acid)' }}>
              <Crown size={18} />
            </span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Premium</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                Active until {formatDate(expiresAt)}
              </p>
            </div>
            {expiringSoon && (
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-soft)', padding: '3px 8px', borderRadius: 6 }}>
                Expiring soon
              </span>
            )}
          </div>
        </div>
      ) : (
        <div style={cardStyle}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Free plan</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Upgrade to Premium for unlimited views, applies, Smart Match, and advanced filters.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <UsageBar used={usage.jdViewsUsed} limit={usage.jdViewsLimit ?? 20} label="JD views this week" />
            <UsageBar used={usage.applyClicksUsed} limit={usage.applyClicksLimit ?? 15} label="Apply clicks this week" />
          </div>
          <button
            type="button"
            onClick={() => navigate('/premium')}
            style={{ height: 44, background: 'var(--acid)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Crown size={16} /> Upgrade to Premium
          </button>
          <PromoCodeForm />
        </div>
      )}

      {/* Purchase history */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Purchase history</h3>
        {history.length === 0 ? (
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>No purchases yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Plan</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Promo</th>
                </tr>
              </thead>
              <tbody>
                {history.map((sub, i) => {
                  const sc = statusColors[sub.status] || statusColors.expired;
                  return (
                    <tr key={sub._id || i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <td style={{ padding: '8px' }}>{formatDate(sub.createdAt)}</td>
                      <td style={{ padding: '8px' }}>{sub.plan}</td>
                      <td style={{ padding: '8px' }}>
                        {sub.currency === 'EUR' ? '€' : ''}{(sub.amount ?? 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, background: sc.bg, color: sc.fg, padding: '2px 8px', borderRadius: 6 }}>
                          {sub.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>{sub.promoCode || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}