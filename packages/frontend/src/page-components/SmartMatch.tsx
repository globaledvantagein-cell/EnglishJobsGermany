'use client';

/**
 * /smart-match (and /admin/smart-match) — AI-ranked job recommendations.
 *
 * Loads the stored profile and the last cached Smart Match run in parallel.
 * Results render through the shared MatchWorkspace; this page only decides
 * which state to show and maps the API response to MatchItem[].
 *
 * Resume upload lives on the Profile page only — this page links there.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { Link } from '@/compat/router';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/jobApi';
import { PremiumPitch } from '../components/UpgradeModal';
import MatchProgress from '../components/MatchProgress';
import MatchWorkspace from '../components/matches/MatchWorkspace';
import { StatePanel, fmtRelative } from '../components/matches/MatchParts';
import { usePremiumGate } from '../components/matches/usePremiumGate';
import { fromSmartMatch } from '../components/matches/matchItem';
import { matchResumeText, ResumeMatchError, type MatchResponse, type ResumeProfile } from '../utils/resumeMatchApi';
import { BRAND } from '../theme/brand';
import { withFeature, FeaturePaused } from '../components/FeatureGate';

type RunState = 'idle' | 'running' | 'error';

interface MeResponse { parsedProfile?: ResumeProfile | null; profileUpdatedAt?: string; profileParsedAt?: string }
interface CachedResponse extends Partial<MatchResponse> { cachedAt?: string; cached?: boolean }

function errorMessage(err: unknown): string {
  if (err instanceof ResumeMatchError) {
    if (err.code === 'RATE_LIMITED' || err.status === 429) return 'The matching service is busy. Try again in a minute.';
    if (err.code === 'TIMEOUT' || err.status === 504) return 'Scoring took too long. Please try again.';
    if (err.status === 403) return 'A Premium subscription is required to run Smart Match.';
    if (err.status === 401) return 'Your session expired. Please sign in again.';
    return err.message || 'Something went wrong.';
  }
  return 'Network error: could not reach the server.';
}

function SmartMatch({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuth();
  const gate = usePremiumGate('smart_match');

  const [profile, setProfile] = useState<ResumeProfile | null | undefined>(undefined);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [resultAt, setResultAt] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (!embedded) document.title = `Smart Match · ${BRAND.appName}`; }, [embedded]);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    // Premium-gated: non-premium users never call the (403-ing) endpoints.
    if (gate !== 'allowed' || !token) return;
    apiGet<MeResponse>('/api/auth/me')
      .then(me => {
        setProfile(me?.parsedProfile ?? null);
        setProfileUpdatedAt(me?.profileUpdatedAt ?? me?.profileParsedAt ?? null);
      })
      .catch(() => setProfile(null));
    apiGet<CachedResponse>('/api/jobs/admin/resume-match')
      .then(data => {
        if (data?.success && Array.isArray(data.results)) {
          setResult(data as MatchResponse);
          setResultAt(data.cachedAt ?? data.meta?.timestamp ?? null);
        }
      })
      .catch(() => { /* no cached run yet */ });
  }, [gate, token]);

  const runMatch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRun('running');
    setError(null);
    try {
      const data = await matchResumeText('USE_STORED_PROFILE', controller.signal);
      if (controller.signal.aborted) return;
      setResult(data);
      setResultAt(new Date().toISOString());
      setRun('idle');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorMessage(err));
      setRun('error');
    }
  }, []);

  const cancelRun = () => { abortRef.current?.abort(); setRun('idle'); };

  const items = useMemo(() => (result?.results ?? []).map(fromSmartMatch), [result]);

  if (gate === 'blocked') {
    return (
      <PremiumPitch
        icon={<Sparkles size={26} />}
        title="Smart Match — Premium"
        description="AI-ranks every English-speaking role in Germany against your resume, so the best-fit jobs rise to the top."
      />
    );
  }

  const loadingProfile = gate === 'loading' || profile === undefined;

  // Results computed before the profile last changed (or for a different
  // resume entirely) are misleading — say so instead of showing them silently.
  const cachedName = result?.profile?.name?.trim().toLowerCase();
  const currentName = profile?.name?.trim().toLowerCase();
  const isStale = Boolean(result && resultAt && (
    (profileUpdatedAt && new Date(profileUpdatedAt) > new Date(resultAt))
    || (cachedName && currentName && cachedName !== currentName)
  ));

  const runButton = (
    <button type="button" className="mx-btn" data-variant={result ? undefined : 'primary'} onClick={runMatch} disabled={run === 'running' || !profile}>
      {run === 'running' ? <Loader2 size={14} className="mx-spin" /> : result ? <RotateCcw size={14} /> : <Sparkles size={14} />}
      {result ? 'Run again' : 'Find my matches'}
    </button>
  );

  let state: ReactNode = null;
  if (loadingProfile) {
    state = null; // the workspace shows skeleton rows
  } else if (!profile) {
    state = (
      <StatePanel
        icon={<Upload size={22} />}
        title="Complete your profile first"
        body="Smart Match scores jobs against your resume. Upload it on your Profile page and we'll build your skills profile automatically."
        action={<Link to="/profile" className="mx-btn" data-variant="primary" data-size="lg"><Upload size={15} />Go to Profile</Link>}
      />
    );
  } else if (run === 'running') {
    state = <div style={{ maxWidth: 640, margin: embedded ? 16 : '8px auto 0' }}><MatchProgress onCancel={cancelRun} /></div>;
  } else if (run === 'error') {
    state = (
      <StatePanel
        icon={<AlertTriangle size={22} />}
        title="Matching failed"
        body={error}
        action={<button type="button" className="mx-btn" data-variant="primary" data-size="lg" onClick={runMatch}><RotateCcw size={15} />Try again</button>}
      />
    );
  } else if (!result) {
    state = (
      <StatePanel
        icon={<Sparkles size={22} />}
        title="Your profile is ready"
        body="We'll score every active English-speaking role in Germany against your skills, experience and preferences. It takes about 15 seconds."
        action={<button type="button" className="mx-btn" data-variant="primary" data-size="lg" onClick={runMatch}><Sparkles size={15} />Find my matches</button>}
      />
    );
  } else if (items.length === 0) {
    state = (
      <StatePanel
        icon={<Sparkles size={22} />}
        title="No strong matches right now"
        body={result.meta?.afterHardFilter === 0
          ? 'No active jobs passed the first filter for this profile. This happens with very niche or senior profiles.'
          : 'We scored the available jobs but none were a meaningful fit. New jobs arrive daily, so try again tomorrow.'}
        action={runButton}
      />
    );
  }

  const topScore = items.reduce((max, i) => Math.max(max, i.score), 0);
  const banner = (isStale || (items.length > 0 && topScore < 50)) && run === 'idle' ? (
    <div className="mx-banner" role="status">
      <AlertTriangle size={16} />
      <span style={{ fontSize: '0.85rem', flex: 1 }}>
        {isStale
          ? <>These results are from <strong>{fmtRelative(resultAt)}</strong>, before your profile last changed. Run again to match your current profile.</>
          : <>Match quality is low for this profile: the best score is {topScore}. A more detailed resume usually helps.</>}
      </span>
      {isStale && runButton}
    </div>
  ) : null;

  const meta = result?.meta && run === 'idle'
    ? `Run ${fmtRelative(resultAt) ?? ''} · ${result.meta.totalJobsSearched.toLocaleString()} jobs searched · ${result.meta.afterHardFilter} shortlisted`
    : undefined;

  return (
    <MatchWorkspace
      embedded={embedded}
      title="Smart Match"
      subtitle="AI-ranked jobs matched to your skills, experience and preferences."
      profile={profile ?? null}
      items={items}
      loading={loadingProfile}
      state={state}
      banner={banner}
      meta={meta}
      actions={result && run !== 'running' ? runButton : undefined}
      source="smart"
      listId={resultAt ? `smart:${resultAt}` : undefined}
    />
  );
}

export default withFeature('smartMatch', SmartMatch, <FeaturePaused title="Smart Match" />);
