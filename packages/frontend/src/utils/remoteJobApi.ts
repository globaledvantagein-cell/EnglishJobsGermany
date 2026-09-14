// API wrappers for the REMOTE jobs vertical (/api/remote-jobs/*).
//
// Deliberately simpler than jobApi.ts: remote jobs are free to view, so there
// is no auth-gated caching, no premium branching, and no gate handling. Every
// response is the full thing.
//
// Requests still go through apiGet/apiGetCached from jobApi.ts so they carry
// the visitor fingerprint headers the backend uses for analytics — the backend
// reads them but never gates on them here.

import type { IJob } from '../types';
import { apiGet, apiGetCached } from './jobApi';

export interface RemoteJobsListResponse {
  jobs: IJob[];
  totalJobs: number;
}

/** Shape of GET /api/remote-jobs/filter-counts. */
export interface IRemoteFacetCounts {
  workplace: Record<string, number>;
  experience: Record<string, number>;
  employment: Record<string, number>;
  hasSalary: { count: number };
  category: Record<string, number>;
  /** Per-country result counts, keyed by 2-letter code ("US", "GB", …). */
  country: Record<string, number>;
  totalJobs: number;
}

// Dropdown bootstraps are stable, low-churn data — cached 10 min in both
// memory and localStorage, same policy the German dashboard uses.
const DROPDOWN_TTL_MS = 10 * 60 * 1000;

/** GET /api/remote-jobs — paginated, filtered list. Never cached (filters vary). */
export async function fetchRemoteJobs(
  params: URLSearchParams,
  opts: { signal?: AbortSignal } = {},
): Promise<RemoteJobsListResponse> {
  const data = await apiGet<{ jobs?: IJob[]; totalJobs?: number }>(
    `/api/remote-jobs?${params.toString()}`,
    { signal: opts.signal },
  );
  return {
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
    totalJobs: Number(data?.totalJobs) || 0,
  };
}

/** GET /api/remote-jobs/company-names — alphabetical distinct companies. */
export async function fetchRemoteCompanyNames(opts: { signal?: AbortSignal } = {}): Promise<string[]> {
  const names = await apiGetCached<string[]>('/api/remote-jobs/company-names', {
    signal: opts.signal, noAuth: true,
    memoryTtlMs: DROPDOWN_TTL_MS, localTtlMs: DROPDOWN_TTL_MS,
  });
  return Array.isArray(names) ? names : [];
}

/** GET /api/remote-jobs/category-counts — { software: 412, data: 88, … }. */
export async function fetchRemoteCategoryCounts(
  opts: { signal?: AbortSignal } = {},
): Promise<Record<string, number>> {
  const counts = await apiGetCached<Record<string, number>>('/api/remote-jobs/category-counts', {
    signal: opts.signal, noAuth: true,
    memoryTtlMs: DROPDOWN_TTL_MS, localTtlMs: DROPDOWN_TTL_MS,
  });
  return counts && typeof counts === 'object' ? counts : {};
}

/** GET /api/remote-jobs/filter-counts — unfiltered facet totals for the badges. */
export async function fetchRemoteFilterCounts(
  opts: { signal?: AbortSignal } = {},
): Promise<IRemoteFacetCounts | null> {
  const counts = await apiGetCached<IRemoteFacetCounts>('/api/remote-jobs/filter-counts', {
    signal: opts.signal, noAuth: true,
    memoryTtlMs: DROPDOWN_TTL_MS, localTtlMs: DROPDOWN_TTL_MS,
  });
  // totalJobs === 0 almost always means the response was captured while the
  // backend cache was still booting — showing "(0)" everywhere is worse than
  // no badges at all.
  if (counts && typeof counts === 'object' && counts.workplace && counts.totalJobs > 0) {
    return counts;
  }
  return null;
}

/**
 * GET /api/remote-jobs/:id/full — always ungated, so the response is simply
 * the job. The backend keeps the `{ gated: false, job }` envelope for shape
 * parity with the German endpoint; we unwrap it here.
 */
export async function fetchRemoteJobDetail(
  jobId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<IJob | null> {
  const res = await apiGet<{ gated: boolean; job?: IJob }>(
    `/api/remote-jobs/${encodeURIComponent(jobId)}/full`,
    { signal: opts.signal },
  );
  return res?.job ?? null;
}
