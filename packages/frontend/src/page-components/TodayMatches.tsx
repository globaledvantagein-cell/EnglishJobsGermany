'use client';

/**
 * /today-matches (and /admin/today-matches) — daily skill-matched jobs.
 *
 * Pure programmatic matching (no AI), computed ONCE per day by the server —
 * there is deliberately no refresh button. "Not interested" and other
 * feedback shape tomorrow's list. Renders through the shared MatchWorkspace.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Clock, RefreshCw, SearchX, Sparkles, Upload, Wrench } from 'lucide-react';
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
import { withFeature, FeaturePaused } from '../components/FeatureGate';

type LoadState = 'loading' | 'ready' | 'error';
type SkillMeta = SkillMatchResponse['meta'] & { jobsWithRequirements?: number };

function TodayMatches({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuth();
  const gate = usePremiumGate('today_matches');

  const [load, setLoad] = useState<LoadState>('loading');
  const [data, setData] = useState<SkillMatchResponse | null>(null);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);

  useEffect(() => { if (!embedded) document.title = `Today's Matches · ${BRAND.appName}`; }, [embedded]);

  const fetchMatches = useCallback(async () => {
    setLoad('loading');
    try {
      setData(await fetchSkillMatches());
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    // Premium-only: non-premium users never call /skill-matches (it 403s).
    if (gate !== 'allowed' || !token) return;
    fetchMatches();
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
        action={<button type="button" className="mx-btn" data-variant="primary" data-size="lg" onClick={fetchMatches}><RefreshCw size={15} />Try again</button>}
      />
    );
  } else if (reason === 'no_profile') {
    state = <StatePanel icon={<Upload size={22} />} title="Upload your resume first" body="We match jobs against the skills in your profile. Upload your resume on the Profile page to build it." action={editProfile('Go to Profile', <Upload size={15} />)} />;
  } else if (reason === 'no_skills' || reason === 'too_few_skills') {
    state = <StatePanel icon={<Wrench size={22} />} title="Add a few more skills" body="Your profile needs at least 3 skills for meaningful matches. Add them on your Profile page." action={editProfile('Edit skills', <Wrench size={15} />)} />;
  } else if (load === 'ready' && items.length === 0) {
    state = <StatePanel icon={<SearchX size={22} />} title="No matches today" body="None of today's active jobs list your skills. New jobs arrive daily, and adding more skills to your profile widens the net." action={editProfile('Add skills', <Wrench size={15} />)} />;
  }

  const nextUpdate = meta?.nextUpdateAt ? hoursUntil(meta.nextUpdateAt) : null;

  return (
    <MatchWorkspace
      embedded={embedded}
      title="Today's Matches"
      subtitle="A fresh shortlist every day, picked from the skills on your profile. Tell us what's not for you and tomorrow's list adapts."
      profile={profile}
      items={items}
      loading={load === 'loading'}
      state={state}
      source="today"
      listId={meta?.computedAt ? `today:${meta.computedAt}` : undefined}
      meta={meta?.totalJobsScanned ? `${meta.totalJobsScanned.toLocaleString()} jobs scanned · ${meta.userSkillCount ?? 0} skills on your profile` : undefined}
      actions={nextUpdate != null ? (
        <span className="mx-btn" data-variant="ghost" style={{ cursor: 'default' }} title="Today's Matches is computed once a day">
          <Clock size={14} />New list in {nextUpdate}h
        </span>
      ) : undefined}
    />
  );
}

/** Whole hours until an ISO time, at least 1. */
function hoursUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
}

export default withFeature('todayMatches', TodayMatches, <FeaturePaused title="Today's Matches" />);
