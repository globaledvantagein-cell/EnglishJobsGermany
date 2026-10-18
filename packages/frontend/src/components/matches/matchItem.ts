/**
 * One shape for every kind of job match, so Smart Match (AI scoring) and
 * Today's Matches (programmatic skill overlap) render through the same
 * components. Each source has an adapter below; components never see the raw
 * API types.
 */
import type { MatchResult, SkillEntry } from '../../utils/resumeMatchApi';
import type { FitDimensions, SkillMatchJob } from '../../utils/skillMatchApi';

export type MatchTier = 'strong' | 'good' | 'partial';
export type MatchSource = 'smart' | 'skills';

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

/**
 * Today's Matches: deterministic fit 0–1 (no AI). Fit scores run lower than
 * AI scores for the same quality of match, so the tier bands are lower: on
 * real profiles the shown matches span ~48–79 (median 59), and Strong ≥ 65
 * keeps the label for roughly the top 15%.
 */
export function fromSkillMatch(job: SkillMatchJob): MatchItem {
  const score = Math.round(job.score * 100);
  return {
    id: job._id,
    source: 'skills',
    title: job.JobTitle,
    company: job.Company,
    location: job.Location,
    workplace: job.WorkplaceType && job.WorkplaceType !== 'Unspecified' ? job.WorkplaceType : null,
    experience: job.ExperienceLevel && job.ExperienceLevel !== 'N/A' ? job.ExperienceLevel : null,
    category: job.Category ?? null,
    postedAt: job.PostedDate ?? null,
    score,
    tier: tierFromScore(score, 65, 52),
    matched: job.matchedSkills ?? [],
    missing: job.missingSkills ?? [],
    bonus: [],
    requiredCount: job.totalSkillCount ?? null,
    reasoning: null,
    fits: [],
    applyUrl: null,
    dimensions: toDimensions(job.dimensions),
    badges: job.badges ?? [],
  };
}
