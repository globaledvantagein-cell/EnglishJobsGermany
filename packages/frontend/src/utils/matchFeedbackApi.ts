// What users do with match recommendations → personalised ranking
// (backend src/matching/feedbackModel.js). Fire-and-forget: feedback must
// never block or break the page.
import { apiDelete, apiPost } from './jobApi';

export type MatchSource = 'today' | 'smart';
export type MatchAction = 'dismiss' | 'open' | 'view_job' | 'company_site' | 'save' | 'apply';
export type DismissReason =
  | 'company' | 'role' | 'skills' | 'location' | 'seniority' | 'work_auth'
  | 'already_applied' | 'not_real' | 'other';

// Single choice, one reason per dismissal. Each reason tunes a specific part of
// ranking (see backend src/matching/feedbackModel.js).
export const DISMISS_REASONS: ReadonlyArray<{ value: DismissReason; label: string; hint: string }> = [
  { value: 'company', label: 'Not interested in this company', hint: 'Hide all its jobs' },
  { value: 'role', label: 'Not my kind of role or industry', hint: 'Fewer jobs like this' },
  { value: 'skills', label: "I don't have the required skills", hint: 'Fewer jobs needing these skills' },
  { value: 'location', label: 'Not at my target location', hint: 'Fewer in this place / setup' },
  { value: 'seniority', label: "Doesn't match my experience level", hint: 'Fewer at this level' },
  { value: 'work_auth', label: "I don't meet the work authorization", hint: 'Prefer jobs offering sponsorship' },
  { value: 'already_applied', label: 'Already applied', hint: 'Hide this job' },
  { value: 'not_real', label: 'Looks fake or expired', hint: 'Hide and report' },
  { value: 'other', label: 'Other', hint: 'Hide this job' },
];

export interface EventContext { position?: number; listId?: string }

export function sendMatchEvent(jobId: string, source: MatchSource, action: MatchAction, reason?: DismissReason, context: EventContext = {}): void {
  apiPost('/api/jobs/match-feedback', { jobId, source, action, reason, ...context }).catch(() => { /* best effort */ });
}

/** Log a shown list once (jobs in ranked order) — exposure data for learning to rank. */
export function sendImpressions(source: MatchSource, listId: string, jobIds: string[]): void {
  if (jobIds.length === 0) return;
  apiPost('/api/jobs/match-feedback/impressions', { source, listId, jobIds: jobIds.slice(0, 50) }).catch(() => { /* best effort */ });
}

export async function undoDismiss(jobId: string): Promise<void> {
  await apiDelete(`/api/jobs/match-feedback/${encodeURIComponent(jobId)}`);
}
