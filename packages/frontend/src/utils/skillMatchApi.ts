import { apiGet } from './jobApi';

/** Per-dimension fit, 0–1; null when the job lacks the data to judge it. */
export interface FitDimensions {
  skills: number | null;
  experience: number | null;
  seniority: number | null;
  role: number | null;
  preferences: number | null;
}

export interface SkillMatchJob {
  _id: string;
  JobID: string;
  JobTitle: string;
  Company: string;
  Location: string;
  WorkplaceType?: string;
  ExperienceLevel?: string;
  Category?: string;
  PostedDate?: string;
  isEntryLevel?: boolean;
  applyClicks?: number;
  score: number;
  confidence?: number;
  dimensions?: FitDimensions;
  matchedSkills: string[];
  missingSkills?: string[];
  matchedCount: number;
  totalSkillCount: number;
  requiredCount?: number | null;
  matchedRequired?: number | null;
  badges?: string[];
}

export interface SkillMatchResponse {
  matches: SkillMatchJob[];
  meta: {
    reason: 'ok' | 'no_profile' | 'no_skills' | 'too_few_skills' | 'no_matches' | 'cache_not_ready';
    totalJobsScanned?: number;
    userSkillCount?: number;
    /** When today's list was computed, and when tomorrow's will be. */
    computedAt?: string;
    nextUpdateAt?: string;
  };
}

/** Today's list — computed once per day server-side; there is no refresh. */
export async function fetchSkillMatches(): Promise<SkillMatchResponse> {
  return apiGet<SkillMatchResponse>('/api/jobs/skill-matches');
}