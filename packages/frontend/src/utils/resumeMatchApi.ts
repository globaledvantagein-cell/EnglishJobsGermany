// Resume Matcher API client + shared types.
//
// The backend route is attached to the jobs router, so the real path is
// /api/jobs/admin/resume-match (NOT /api/admin/resume-match). It is admin-only:
// verifyToken + verifyAdmin, so we must send the Authorization bearer token.
//
// We can't reuse apiPost() from jobApi.ts because file upload needs
// multipart/form-data (FormData) — the browser must set the multipart boundary
// itself, so we never set Content-Type for the file path. This module mirrors
// jobApi's header convention without modifying it.

import { getFingerprint } from './fingerprint';
import { getVisitorId } from './visitorId';
import { STORAGE_KEY_TOKEN } from './jobApi';

export const RESUME_MATCH_ENDPOINT = '/api/jobs/admin/resume-match';

// Hard limits — mirror the backend (multer fileSize 10MB, resumeText >= 50 chars).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MIN_TEXT_LENGTH = 50;

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];
// For the <input accept=...> attribute.
export const FILE_ACCEPT_ATTR = [...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIME_TYPES].join(',');

// ─── Shared types (mirror the backend response shape) ───────────────────────

export interface LanguageProficiency {
  language: string;
  proficiency: string;
}

export interface SkillEntry {
  name: string;
  category: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  responsibilities: string[];
  technologies: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  endDate: string | null;
}

export interface ProjectEntry {
  name: string;
  description: string;
  technologies: string[];
}

export interface ResumeProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
  projects: ProjectEntry[];
  total_experience_years: number | null;
  seniority_level: 'Entry' | 'Mid' | 'Senior' | 'Lead' | 'Executive' | null;
  domain: string;
  sub_domain: string | null;
  languages: LanguageProficiency[];
  location: string | null;
  open_to_remote: boolean | null;
  open_to_relocate: boolean | null;
  visa_required: boolean | null;
  certifications: string[];
}

export type MatchTier = 'strong' | 'good' | 'partial';
export type ExperienceFit = 'strong' | 'good' | 'weak' | 'overqualified' | null;
export type LocationFit =
  | 'exact'
  | 'same_country'
  | 'remote_compatible'
  | 'relocation_needed'
  | null;

export interface MatchResultJob {
  JobTitle: string;
  Company: string;
  Location: string;
  IsRemote: boolean;
  ApplicationURL: string;
}

export interface MatchResult {
  jobId: string;
  score: number;
  tier: MatchTier;
  matched_skills: (string | SkillEntry)[];
  missing_skills: (string | SkillEntry)[];
  bonus_skills: (string | SkillEntry)[];
  experience_fit: ExperienceFit;
  location_fit: LocationFit;
  german_fit: string | null;
  visa_fit: string | null;
  reasoning: string;
  job: MatchResultJob;
}

export interface MatchMeta {
  totalJobsSearched: number;
  afterHardFilter: number;
  processingTimeMs: number;
  geminiCallsUsed: number;
  timestamp: string;
}

export interface MatchResponse {
  success: true;
  profile: ResumeProfile;
  results: MatchResult[];
  meta: MatchMeta;
}

/** Error carrying the backend `code` (PDF_PARSE_FAILED, RATE_LIMITED, …) + HTTP status. */
export class ResumeMatchError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ResumeMatchError';
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'x-fingerprint': getFingerprint(),
    'x-vid': getVisitorId(),
  };
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function readResponse(res: Response): Promise<MatchResponse> {
  // The backend always replies JSON; guard anyway (proxies/timeouts can send HTML).
  const data = await res.json().catch(() => null) as
    | (Partial<Omit<MatchResponse, 'success'>> & { success?: boolean; error?: string; code?: string })
    | null;

  if (!res.ok || !data || data.success === false) {
    const message =
      (data && data.error) ||
      (res.status === 429 ? 'Service is busy. Please try again in a minute.' : '') ||
      `Request failed (${res.status})`;
    throw new ResumeMatchError(message, res.status, data?.code);
  }
  return data as MatchResponse;
}

/** Submit a resume file (PDF/DOCX) for matching. */
export async function matchResumeFile(file: File, signal?: AbortSignal): Promise<MatchResponse> {
  const form = new FormData();
  form.append('resume', file);

  const res = await fetch(RESUME_MATCH_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders(), // NOTE: no Content-Type — browser sets multipart boundary
    body: form,
    signal,
  });
  return readResponse(res);
}

/** Submit pasted resume text for matching. */
export async function matchResumeText(text: string, signal?: AbortSignal): Promise<MatchResponse> {
  const res = await fetch(RESUME_MATCH_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText: text }),
    signal,
  });
  return readResponse(res);
}

// ─── Client-side validation helpers ─────────────────────────────────────────

/** Returns an error message if the file is invalid, or null if it's acceptable. */
export function validateResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const extOk = ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext));
  // Some browsers report an empty/garbage MIME for .docx — accept on extension too.
  const mimeOk = !file.type || ACCEPTED_MIME_TYPES.includes(file.type);

  if (!extOk && !mimeOk) {
    return 'Unsupported file type. Please upload a PDF or DOCX.';
  }
  if (file.size === 0) {
    return 'This file appears to be empty.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'File is too large. Maximum size is 10 MB.';
  }
  return null;
}