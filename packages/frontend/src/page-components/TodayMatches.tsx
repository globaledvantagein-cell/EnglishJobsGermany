'use client';

/**
 * /today-matches — Daily skill-matched job recommendations.
 *
 * Pure programmatic matching — no AI, no API costs.
 * Compares the user's profile skills against parsedRequirements
 * on active jobs. Shows top 5 with matched/missing skill breakdown.
 *
 * Edge cases:
 *  - No parsedProfile → prompt to upload resume
 *  - Profile but no skills → prompt to add skills
 *  - No matching jobs → empty state
 *  - < 5 matches → show however many exist
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from '@/compat/router';
import { Sparkles, Upload, Wrench, RefreshCw } from 'lucide-react';
import { Container, PageHeader, Button, EmptyState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { fetchSkillMatches, type SkillMatchJob } from '../utils/skillMatchApi';
import { PremiumPitch } from '../components/UpgradeModal';
import { track } from '../utils/analytics';
import { BRAND } from '../theme/brand';

type Status = 'loading' | 'done' | 'no_profile' | 'no_skills' | 'no_matches' | 'error';

// auto-fill + minmax(340) reliably yields 3 columns at the 1400 max, 2 on
// tablet, 1 on mobile — a recommendation feed, not a data table.
const MATCH_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: 14,
};

export default function TodayMatches() {
  const { token, isLoading: authLoading, isPremium, isAdmin, usage } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [matches, setMatches] = useState<SkillMatchJob[]>([]);
  const [meta, setMeta] = useState<{ userSkillCount?: number; totalJobsScanned?: number }>({});

  useEffect(() => { document.title = `Today's Matches · ${BRAND.appName}`; }, []);

  // Funnel: a non-premium user hit the Today's Matches premium wall.
  useEffect(() => {
    if (!authLoading && (isAdmin || usage !== null) && !isPremium) {
      track('premium_feature_blocked', { feature: 'today_matches' });
    }
  }, [authLoading, isAdmin, usage, isPremium]);

  const load = (refresh = false) => {
    setStatus('loading');
    fetchSkillMatches(refresh)
      .then(data => {
        setMatches(data.matches);
        setMeta(data.meta);
        setStatus(
          data.meta.reason === 'no_profile'     ? 'no_profile' :
          data.meta.reason === 'no_skills'      ? 'no_skills'  :
          data.meta.reason === 'too_few_skills' ? 'no_skills'  :
          data.meta.reason === 'cache_not_ready' ? 'error'     :
          data.matches.length === 0             ? 'no_matches' :
          'done'
        );
      })
      .catch(() => setStatus('error'));
  };

  useEffect(() => {
    // Premium-only — don't call /skill-matches (it 403s) for non-premium users.
    if (authLoading || !token || !isPremium) return;
    load();
  }, [token, authLoading, isPremium]);

  if (authLoading) {
    return (
      <Container style={{ padding: '40px 24px' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </Container>
    );
  }

  // Premium gate — show the pitch before hitting the (403-ing) API. Wait for
  // premium status to resolve first (admins are always premium).
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
            title="Today's Matches — Premium"
            description="A fresh, daily shortlist of jobs matched to your profile skills — no AI cost, updated every day. Available with Premium."
          />
        </Container>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '80vh' }}>
      <Container style={{ maxWidth: 1400, padding: '24px 24px 48px' }}>
        <PageHeader
          label="ENGLISH JOBS IN GERMANY"
          title="Today's Matches"
          subtitle="Jobs matching your profile skills — updated daily, no AI needed."
        />

        {status === 'loading' && (
          <div style={MATCH_GRID}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="skeleton" style={{ height: 170, borderRadius: 12 }} />
            ))}
          </div>
        )}

        {status === 'no_profile' && (
          <PromptCard
            icon={<Upload size={32} style={{ color: 'var(--text-muted)' }} />}
            title="Upload your resume first"
            body="Upload your resume on your Profile page to build your profile and enable job matching."
            linkTo="/profile"
            linkLabel="Go to Profile"
          />
        )}

        {status === 'no_skills' && (
          <PromptCard
            icon={<Wrench size={32} style={{ color: 'var(--text-muted)' }} />}
            title="Add skills to your profile"
            body="Your profile doesn't have enough skills yet. Add at least 3 skills so we can find meaningful matches."
            linkTo="/profile"
            linkLabel="Edit Skills"
          />
        )}

        {status === 'no_matches' && (
          <EmptyState
            icon={<Sparkles size={40} />}
            title="No matching jobs today"
            body="None of the active jobs match your current skills. Check back tomorrow or add more skills to your profile."
          />
        )}

        {status === 'error' && (
          <EmptyState
            icon={<Sparkles size={40} />}
            title="Something went wrong"
            body="Could not load matches. Please try again."
          />
        )}

        {status === 'done' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {matches.length} match{matches.length !== 1 ? 'es' : ''} from{' '}
                {meta.totalJobsScanned?.toLocaleString()} jobs · {meta.userSkillCount} skills in your profile
              </span>
              <Button variant="ghost" size="sm" onClick={() => load(true)}>
                <RefreshCw size={12} /> Refresh
              </Button>
            </div>

            <div className="stagger" style={MATCH_GRID}>
              {matches.map(job => (
                <SkillMatchCard key={job._id} job={job} onClick={() => navigate(`/jobs/${job._id}`)} />
              ))}
            </div>
          </>
        )}
      </Container>
    </div>
  );
}

// ── Match Card ─────────────────────────────────────────────────────────────────
// Compact, self-contained feed card. Score is a small colour-coded badge in the
// corner (not a giant number); matched skills are green chips at the bottom.
const MAX_CHIPS = 6;

function scoreBadgeColors(pct: number): { bg: string; fg: string } {
  if (pct > 50) return { bg: 'var(--success-soft)', fg: 'var(--success)' }; // green
  if (pct >= 30) return { bg: 'var(--warning-soft)', fg: 'var(--warning)' }; // yellow
  return { bg: 'var(--bg-surface-2)', fg: 'var(--text-muted)' };             // gray
}

function SkillMatchCard({ job, onClick }: { job: SkillMatchJob; onClick: () => void }) {
  const pct = Math.round(job.score * 100);
  const badge = scoreBadgeColors(pct);
  const locationLine = [job.Company, job.Location].filter(Boolean).join(' · ');
  const chips = job.matchedSkills.slice(0, MAX_CHIPS);
  const extra = job.matchedSkills.length - chips.length;

  const open = () => onClick();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${job.JobTitle} at ${job.Company} — ${pct}% match`}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      // Press feedback (scale 0.97) comes from the global [role=button]:active
      // rule. Hover changes border + shadow only — no jump.
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 8,
        height: '100%',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 14,
        cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.16s ease, box-shadow 0.16s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Score badge — top-right corner */}
      <span style={{
        position: 'absolute', top: 12, right: 12,
        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.01em',
        padding: '2px 8px', borderRadius: 999,
        background: badge.bg, color: badge.fg,
      }}>
        {pct}%
      </span>

      {/* Title */}
      <h3 style={{
        margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)',
        lineHeight: 1.3, paddingRight: 48,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {job.JobTitle}
      </h3>

      {/* Company · Location — one muted line */}
      {locationLine && (
        <p style={{
          margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {locationLine}
        </p>
      )}

      {/* Spacer pushes the skills/footer to the bottom so cards align */}
      <div style={{ flex: 1 }} />

      {/* Matched skills — green chips */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {chips.map(skill => (
            <span key={skill} style={{
              fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px', borderRadius: 6,
              background: 'var(--success-soft)', color: 'var(--success)',
            }}>
              {skill}
            </span>
          ))}
          {extra > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px', color: 'var(--text-muted)' }}>
              +{extra}
            </span>
          )}
        </div>
      )}

      {/* X of Y matched — subtle footer */}
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        {job.matchedCount} of {job.totalSkillCount} skills matched
      </p>
    </div>
  );
}

// ── Prompt Card ────────────────────────────────────────────────────────────────
function PromptCard({ icon, title, body, linkTo, linkLabel }: {
  icon: React.ReactNode; title: string; body: string; linkTo: string; linkLabel: string;
}) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--bg-surface)', padding: '32px 24px', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        {title}
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
        {body}
      </p>
      <Link to={linkTo}><Button>{linkLabel}</Button></Link>
    </div>
  );
}