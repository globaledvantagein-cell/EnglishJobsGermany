/**
 * The shape the match components render, so they never see the raw Smart
 * Match API types. fromSmartMatch() below is the adapter.
 */
import type { FitDimensions, MatchResult, SkillEntry } from '../../utils/resumeMatchApi';

export type MatchTier = 'strong' | 'good' | 'partial';
export type MatchSource = 'smart';

export interface MatchFit { label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }

/** One bar in the "Why this job is a match" breakdown. */
export interface MatchDimension { key: string; label: string; value: number | null }

export interface MatchItem {
  /** Mongo _id — used for /jobs/:id links and saved jobs. */
  id: string;
  source: MatchSource;
  title: string;
  company: string;
  location: string;
  workplace: string | null;
  experience: string | null;
  category: string | null;
  postedAt: string | null;
  /** 0–100. */
  score: number;
  tier: MatchTier;
  matched: string[];
  missing: string[];
  bonus: string[];
  /** Total skills the job asks for, when the source knows it. */
  requiredCount: number | null;
  reasoning: string | null;
  fits: MatchFit[];
  applyUrl: string | null;
  /** Breakdown bars; empty when the source has no fit data (older cached runs). */
  dimensions: MatchDimension[];
  badges: string[];
}

/**
 * Headline bars, grouped like the leading job-match products: experience
 * level (seniority + years), skills, role & industry, and — only when the user
 * set any — preferences. Unknown dimensions stay visible as "not stated".
 */
export function toDimensions(d?: FitDimensions | null): MatchDimension[] {
  if (!d) return [];
  const experienceParts = [d.seniority, d.experience].filter((v): v is number => v != null);
  const experience = experienceParts.length ? experienceParts.reduce((s, v) => s + v, 0) / experienceParts.length : null;
  const rows: MatchDimension[] = [
    { key: 'experience', label: 'Experience level', value: experience },
    { key: 'skills', label: 'Skills', value: d.skills },
    { key: 'role', label: 'Role & industry', value: d.role },
  ];
  if (d.preferences != null) rows.push({ key: 'preferences', label: 'Your preferences', value: d.preferences });
  return rows;
}

export const TIER_LABEL: Record<MatchTier, string> = {
  strong: 'Strong match',
  good: 'Good match',
  partial: 'Partial match',
};

const skillName = (s: string | SkillEntry) => (typeof s === 'string' ? s : s.name);

function tierFromScore(score: number, strongAt: number, goodAt: number): MatchTier {
  if (score >= strongAt) return 'strong';
  if (score >= goodAt) return 'good';
  return 'partial';
}

const EXPERIENCE_FIT: Record<string, MatchFit> = {
  strong: { label: 'Experience', value: 'Strong fit', tone: 'ok' },
  good: { label: 'Experience', value: 'Good fit', tone: 'ok' },
  weak: { label: 'Experience', value: 'Weak fit', tone: 'warn' },
  overqualified: { label: 'Experience', value: 'Overqualified', tone: 'warn' },
};

const LOCATION_FIT: Record<string, MatchFit> = {
  exact: { label: 'Location', value: 'Same city', tone: 'ok' },
  same_country: { label: 'Location', value: 'Same country', tone: 'ok' },
  remote_compatible: { label: 'Location', value: 'Remote-friendly', tone: 'ok' },
  relocation_needed: { label: 'Location', value: 'Relocation needed', tone: 'warn' },
};

// Value sets mirror the scoring prompt (backend resume-matcher/prompts.js).
const GERMAN_FIT: Record<string, MatchFit> = {
  not_required: { label: 'German', value: 'Not required', tone: 'ok' },
  meets_requirement: { label: 'German', value: 'You meet it', tone: 'ok' },
  partial: { label: 'German', value: 'Partly meets', tone: 'warn' },
  not_met: { label: 'German', value: 'Not met', tone: 'bad' },
};

const VISA_FIT: Record<string, MatchFit> = {
  sponsorship_available: { label: 'Visa', value: 'Sponsorship offered', tone: 'ok' },
  not_needed: { label: 'Visa', value: 'Not needed', tone: 'ok' },
  sponsorship_unavailable: { label: 'Visa', value: 'No sponsorship', tone: 'bad' },
  unknown: { label: 'Visa', value: 'Not stated', tone: 'neutral' },
};

/** Smart Match: AI score 0–100 with a backend-assigned tier. */
export function fromSmartMatch(result: MatchResult): MatchItem {
  const fits: MatchFit[] = [];
  if (result.experience_fit && EXPERIENCE_FIT[result.experience_fit]) fits.push(EXPERIENCE_FIT[result.experience_fit]);
  if (result.location_fit && LOCATION_FIT[result.location_fit]) fits.push(LOCATION_FIT[result.location_fit]);
  if (result.german_fit && GERMAN_FIT[result.german_fit]) fits.push(GERMAN_FIT[result.german_fit]);
  if (result.visa_fit && VISA_FIT[result.visa_fit]) fits.push(VISA_FIT[result.visa_fit]);

  const tier = result.tier === 'strong' || result.tier === 'good' || result.tier === 'partial'
    ? result.tier
    : tierFromScore(result.score, 85, 65);

  const workplace = result.job?.WorkplaceType && result.job.WorkplaceType !== 'Unspecified'
    ? result.job.WorkplaceType
    : result.job?.IsRemote ? 'Remote' : null;

  return {
    id: String(result.jobId),
    source: 'smart',
    title: result.job?.JobTitle || 'Untitled role',
    company: result.job?.Company || '',
    location: result.job?.Location || '',
    workplace,
    experience: null,
    category: result.job?.Category ?? null,
    postedAt: result.job?.PostedDate ?? null,
    score: Math.round(result.score),
    tier,
    matched: (result.matched_skills ?? []).map(skillName),
    missing: (result.missing_skills ?? []).map(skillName),
    bonus: (result.bonus_skills ?? []).map(skillName),
    requiredCount: result.fit?.requiredCount ?? null,
    reasoning: result.reasoning || null,
    fits,
    applyUrl: result.job?.ApplicationURL || null,
    dimensions: toDimensions(result.fit?.dimensions),
    badges: result.badges ?? [],
  };
}
