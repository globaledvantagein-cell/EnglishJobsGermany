'use client';

/**
 * /smart-match — AI-ranked job recommendations. Admin-only while in testing.
 *
 * If the user has a stored parsedProfile, shows a one-click "Find my matches"
 * button. Otherwise it links to the Profile page to complete the profile —
 * resume upload lives ONLY on the Profile page, never here.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/compat/router';
import { Sparkles, Upload, RotateCcw } from 'lucide-react';
import { Container, PageHeader, Badge, Button, Alert } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/jobApi';
import { track } from '../utils/analytics';
import { PremiumPitch } from '../components/UpgradeModal';
import MatchProgress from '../components/MatchProgress';
import ParsedProfileCard from '../components/ParsedProfileCard';
import MatchResults from '../components/MatchResults';
import {
  matchResumeText,
  ResumeMatchError,
  type MatchResponse,
} from '../utils/resumeMatchApi';
import { BRAND } from '../theme/brand';

type Status = 'idle' | 'loading' | 'done' | 'error';

function toUiError(err: unknown): { message: string } {
  if (err instanceof ResumeMatchError) {
    if (err.code === 'RATE_LIMITED' || err.status === 429) return { message: 'Service is busy. Try again in a minute.' };
    if (err.status === 401 || err.status === 403) return { message: 'Session expired. Please sign in again.' };
    return { message: err.message || 'Something went wrong.' };
  }
  return { message: 'Network error — could not reach the server.' };
}

export default function SmartMatch() {
  const { token, isLoading: authLoading, isPremium, isAdmin, usage } = useAuth();
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<{ message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { document.title = `Smart Match · ${BRAND.appName}`; }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Funnel: a non-premium user hit the Smart Match premium wall.
  useEffect(() => {
    if (!authLoading && (isAdmin || usage !== null) && !isPremium) {
      track('premium_feature_blocked', { feature: 'smart_match' });
    }
  }, [authLoading, isAdmin, usage, isPremium]);

  // Check if user has a stored profile + load cached results.
  // Premium-gated: non-premium users see the pitch and never hit the
  // (403-ing) resume-match endpoint. Mirrors the render gate below —
  // admins are always premium; others need usage loaded first.
  const premiumKnown = isAdmin || (usage !== null && isPremium);
  useEffect(() => {
    if (authLoading || !token || !premiumKnown) return;
    apiGet<{ parsedProfile?: unknown }>('/api/auth/me')
      .then(data => setHasProfile(!!data?.parsedProfile))
      .catch(() => setHasProfile(false));

    // Try loading cached Smart Match results
    apiGet<{ success: boolean; results?: MatchResponse['results']; meta?: MatchResponse['meta']; profile?: MatchResponse['profile']; cached?: boolean }>('/api/jobs/admin/resume-match')
      .then(data => {
        if (data?.success && data.results && data.results.length > 0 && data.profile) {
          setResult({ results: data.results, meta: data.meta, profile: data.profile } as MatchResponse);
          setStatus('done');
        }
      })
      .catch(() => { /* no cache, that's fine */ });
  }, [token, authLoading, premiumKnown]);

  const runMatch = async (payload?: { text: string }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      let data: MatchResponse;
      if (payload?.text) {
        data = await matchResumeText(payload.text);
      } else {
        // Use stored profile — send empty request, backend reads from user doc
        data = await matchResumeText('USE_STORED_PROFILE');
      }
      if (!controller.signal.aborted) {
        setResult(data);
        setStatus('done');
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(toUiError(err));
        setStatus('error');
      }
    }
  };

  const handleRunMatch = () => runMatch();
  const handleReset = () => { setStatus('idle'); setResult(null); setError(null); };

  if (authLoading) {
    return (
      <Container style={{ padding: '40px 24px' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </Container>
    );
  }

  // Premium gate — Smart Match is Premium-only. Wait until premium status is
  // known (admins are always premium; others need the usage fetch), then either
  // show the pitch (non-premium) or fall through to the real UI.
  if (!isAdmin && usage === null) {
    return (
      <Container style={{ padding: '40px 24px' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </Container>
    );
  }
  if (!isPremium) {
    return (
      <div style={{ background: 'var(--bg-base)', minHeight: '80vh' }}>
        <Container style={{ maxWidth: 800, padding: '40px 24px 48px' }}>
          <PremiumPitch
            icon={<Sparkles size={26} />}
            title="Smart Match — Premium"
            description="AI-ranks every English-speaking role in Germany against your resume — skills, experience, and preferences — so the best-fit jobs rise to the top. Available with Premium."
          />
        </Container>
      </div>
    );
  }

  if (hasProfile === null) {
    return (
      <Container style={{ padding: '40px 24px' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </Container>
    );
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '80vh' }}>
      <Container style={{ maxWidth: 800, padding: '24px 24px 48px' }}>
        <PageHeader
          label="ENGLISH JOBS IN GERMANY"
          title="Smart Match"
          subtitle="AI-ranked jobs matched to your skills, experience, and preferences."
          actions={<Badge variant="primary">Premium</Badge>}
        />

        {status === 'loading' && <MatchProgress />}

        {status === 'error' && (
          <div style={{ marginBottom: 16 }}>
            <Alert type="error">{error?.message}</Alert>
            <Button variant="ghost" size="sm" onClick={handleReset} style={{ marginTop: 8 }}>
              <RotateCcw size={14} /> Try again
            </Button>
          </div>
        )}

        {status === 'done' && result && (
          <>
            {result.profile && <ParsedProfileCard profile={result.profile} />}
            <div style={{ marginTop: 16 }}>
              <MatchResults data={result} />
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <RotateCcw size={14} /> Run again
              </Button>
            </div>
          </>
        )}

        {status === 'idle' && (
          <>
            {hasProfile ? (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 12,
                background: 'var(--bg-surface)', padding: '32px 24px', textAlign: 'center',
              }}>
                <Sparkles size={32} style={{ color: 'var(--primary)', marginBottom: 12 }} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Your profile is ready
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                  We'll match your skills and experience against {'>'}2,000 English-speaking roles in Germany.
                </p>
                <Button onClick={handleRunMatch}>
                  <Sparkles size={16} /> Find my matches
                </Button>
                <p style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Resume changed?{' '}
                  <Link to="/profile" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                    Update on Profile
                  </Link>
                </p>
              </div>
            ) : (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 12,
                background: 'var(--bg-surface)', padding: '32px 24px', textAlign: 'center',
              }}>
                <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Complete your profile first
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                  Upload your resume on your Profile page to build your profile and enable matching.
                </p>
                <Link to="/profile"><Button><Upload size={16} /> Go to Profile</Button></Link>
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  );
}