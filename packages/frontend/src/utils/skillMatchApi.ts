import { apiGet } from './jobApi';

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
  matchedSkills: string[];
  matchedCount: number;
  totalSkillCount: number;
}

export interface SkillMatchResponse {
  matches: SkillMatchJob[];
  meta: {
    reason: 'ok' | 'no_profile' | 'no_skills' | 'too_few_skills' | 'no_matches' | 'cache_not_ready';
    totalJobsScanned?: number;
    userSkillCount?: number;
  };
}

export async function fetchSkillMatches(refresh = false): Promise<SkillMatchResponse> {
  const qs = refresh ? '?refresh=1' : '';
  return apiGet<SkillMatchResponse>(`/api/jobs/skill-matches${qs}`);
}