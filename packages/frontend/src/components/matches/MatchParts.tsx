'use client';

/** Small presentational pieces shared by every match view. */
import type { ReactNode } from 'react';
import { Briefcase, GraduationCap, Languages, MapPin } from 'lucide-react';
import { Link } from '@/compat/router';
import type { ResumeProfile } from '../../utils/resumeMatchApi';
import { TIER_LABEL, type MatchTier } from './matchItem';

const TIER_COLOR: Record<MatchTier, string> = {
  strong: 'var(--success)',
  good: 'var(--info)',
  partial: 'var(--warning)',
};

export function ScoreBadge({ score, tier }: { score: number; tier: MatchTier }) {
  return <span className="mx-score" data-tier={tier} title={`${TIER_LABEL[tier]} · ${score}/100`}>{score}</span>;
}

/** Large circular score for the detail pane. */
export function ScoreRing({ score, tier, caption }: { score: number; tier: MatchTier; caption: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, score)) / 100 * circumference;
  return (
    <div className="mx-ring" role="img" aria-label={`${score} out of 100, ${TIER_LABEL[tier]}`}>
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--bg-surface-2)" strokeWidth="7" />
        <circle
          cx="38" cy="38" r={radius} fill="none" stroke={TIER_COLOR[tier]} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="mx-ring-value"><div><strong style={{ color: TIER_COLOR[tier] }}>{score}</strong><small>{caption}</small></div></div>
    </div>
  );
}

export type ChipKind = 'matched' | 'missing' | 'bonus' | 'outline' | 'neutral';

export function SkillChips({ skills, kind = 'neutral', max }: { skills: string[]; kind?: ChipKind; max?: number }) {
  if (skills.length === 0) return null;
  const shown = max ? skills.slice(0, max) : skills;
  const hidden = skills.length - shown.length;
  return (
    <div className="mx-chips">
      {shown.map((skill, i) => <span key={`${skill}-${i}`} className="mx-chip" data-kind={kind}>{skill}</span>)}
      {hidden > 0 && <span className="mx-chip" data-kind="outline" title={skills.slice(shown.length).join(', ')}>+{hidden}</span>}
    </div>
  );
}

function initials(name?: string | null): string {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function currentRole(profile: ResumeProfile): string | null {
  return profile.experience?.find(e => e.isCurrent)?.title || profile.experience?.[0]?.title || null;
}

/**
 * One-line summary of the profile matches are computed from. Replaces the old
 * full-height profile card, which pushed every result below the fold.
 */
export function ProfileStrip({ profile, editHref = '/profile', maxSkills = 10 }: {
  profile: ResumeProfile; editHref?: string; maxSkills?: number;
}) {
  const role = currentRole(profile);
  const years = profile.total_experience_years;
  const languages = (profile.languages ?? []).map(l => `${l.language} (${l.proficiency})`).join(', ');
  const degree = profile.education?.[0] ? [profile.education[0].degree, profile.education[0].field].filter(Boolean).join(' in ') : null;
  const skills = (profile.skills ?? []).map(s => s.name);

  return (
    <section className="mx-profile" aria-label="Your matching profile">
      <span className="mx-avatar" aria-hidden="true">{initials(profile.name)}</span>
      <div style={{ minWidth: 0 }}>
        <div className="mx-profile-name">{profile.name || 'Your profile'}</div>
        <div className="mx-profile-role">{[role, profile.seniority_level].filter(Boolean).join(' · ') || 'Role not detected'}</div>
      </div>
      <div className="mx-facts">
        {years != null && <span><Briefcase size={13} />{years} yr{years === 1 ? '' : 's'}</span>}
        {profile.location && <span><MapPin size={13} />{profile.location}</span>}
        {degree && <span title={degree}><GraduationCap size={13} />{degree.length > 34 ? `${degree.slice(0, 33)}…` : degree}</span>}
        {languages && <span title={languages}><Languages size={13} />{languages.length > 34 ? `${languages.slice(0, 33)}…` : languages}</span>}
      </div>
      <div className="mx-profile-skills">
        <SkillChips skills={skills} max={maxSkills} />
      </div>
      <Link to={editHref} className="mx-profile-link">Edit profile →</Link>
    </section>
  );
}

export function StatePanel({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-state">
      <span className="mx-state-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function fmtRelative(value?: string | null): string | null {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}
