'use client';

/**
 * /today-matches (and /admin/today-matches) — daily skill-matched jobs.
 *
 * Pure programmatic matching (no AI): the user's profile skills against the
 * parsedRequirements of active jobs. Renders through the shared
 * MatchWorkspace; this page maps the response and picks the empty state.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw, SearchX, Sparkles, Upload, Wrench } from 'lucide-react';
import { Link } from '@/compat/router';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/jobApi';
import { fetchSkillMatches, type SkillMatchResponse } from '../utils/skillMatchApi';
import { PremiumPitch } from '../components/UpgradeModal';
import MatchWorkspace from '../components/matches/MatchWorkspace';
import { StatePanel } from '../components/matches/MatchParts';
import { usePremiumGate } from '../components/matches/usePremiumGate';
import { fromSkillMatch } from '../components/matches/matchItem';
import type { ResumeProfile } from '../utils/resumeMatchApi';
import { BRAND } from '../theme/brand';

type LoadState = 'loading' | 'ready' | 'error';
type SkillMeta = SkillMatchResponse['meta'] & { jobsWithRequirements?: number };

export default function TodayMatches({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuth();
  const gate = usePremiumGate('today_matches');

  const [load, setLoad] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SkillMatchResponse | null>(null);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);

  useEffect(() => { if (!embedded) document.title = `Today's Matches · ${BRAND.appName}`; }, [embedded]);

  const fetchMatches = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    try {
      setData(await fetchSkillMatches(refresh));
      setLoad('ready');
    } catch {
      setLoad('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Premium-only: non-premium users never call /skill-matches (it 403s).
    if (gate !== 'allowed' || !token) return;
    fetchMatches(false);
    apiGet<{ parsedProfile?: ResumeProfile | null }>('/api/auth/me')
      .then(me => setProfile(me?.parsedProfile ?? null))
      .catch(() => setProfile(null));
  }, [gate, token, fetchMatches]);

  const items = useMemo(() => (data?.matches ?? []).map(fromSkillMatch), [data]);

  if (gate === 'blocked') {
    return (
      <PremiumPitch
        icon={<Sparkles size={26} />}
        title="Today's Matches — Premium"
        description="A fresh daily shortlist of jobs matched to your profile skills."
      />
    );
  }

  const meta = data?.meta as SkillMeta | undefined;
  const reason = meta?.reason;
  const editProfile = (label: string, icon: ReactNode) => (
    <Link to="/profile" className="mx-btn" data-variant="primary" data-size="lg">{icon}{label}</Link>
  );

  let state: ReactNode = null;
  if (load === 'error' || reason === 'cache_not_ready') {
    state = (
      <StatePanel
        icon={<AlertTriangle size={22} />}
        title={reason === 'cache_not_ready' ? 'Jobs are still loading' : 'Could not load your matches'}
        body={reason === 'cache_not_ready' ? 'The server just restarted and is loading jobs. Try again in a minute.' : 'Something went wrong on our side. Please try again.'}
        action={<button type="button" className="mx-btn" data-variant="primary" data-size="lg" onClick={() => fetchMatches(true)}><RefreshCw size={15} />Try again</button>}
      />
    );
  } else if (reason === 'no_profile') {
    state = <StatePanel icon={<Upload size={22} />} title="Upload your resume first" body="We match jobs against the skills in your profile. Upload your resume on the Profile page to build it." action={editProfile('Go to Profile', <Upload size={15} />)} />;
  } else if (reason === 'no_skills' || reason === 'too_few_skills') {
    state = <StatePanel icon={<Wrench size={22} />} title="Add a few more skills" body="Your profile needs at least 3 skills for meaningful matches. Add them on your Profile page." action={editProfile('Edit skills', <Wrench size={15} />)} />;
  } else if (load === 'ready' && items.length === 0) {
    state = <StatePanel icon={<SearchX size={22} />} title="No matches today" body="None of today's active jobs list your skills. New jobs arrive daily, and adding more skills to your profile widens the net." action={editProfile('Add skills', <Wrench size={15} />)} />;
  }

  return (
    <MatchWorkspace
      embedded={embedded}
      title="Today's Matches"
      subtitle="Jobs that list the skills on your profile. Refreshed daily, no AI involved."
      profile={profile}
      items={items}
      loading={load === 'loading'}
      state={state}
      meta={meta?.totalJobsScanned ? `${meta.totalJobsScanned.toLocaleString()} jobs scanned · ${meta.userSkillCount ?? 0} skills on your profile` : undefined}
      actions={
        <button type="button" className="mx-btn" onClick={() => fetchMatches(true)} disabled={refreshing || load === 'loading'}>
          {refreshing ? <Loader2 size={14} className="mx-spin" /> : <RefreshCw size={14} />}Refresh
        </button>
      }
    />
  );
}
