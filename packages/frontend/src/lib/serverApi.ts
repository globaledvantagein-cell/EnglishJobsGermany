// Server-side data fetching for RSC/SSR pages. Talks directly to the Express
// backend (server-to-server) using API_ORIGIN. NEVER import this into a client
// component — it has no auth token and is meant for public SEO data only.

import type { IJob, ICompany } from '@/types';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://englishjobsgermany.com';

interface JobsListResponse {
  jobs: IJob[];
  totalJobs: number;
}

// `revalidate` (seconds) opts a fetch into Next's ISR data cache via
// `next: { revalidate }`. Omit it to stay uncached (`no-store`) — the correct
// default for per-visitor/dynamic pages (e.g. the gated job detail). In Next
// 16 a `no-store` fetch forces the whole route dynamic, so cacheable SEO pages
// MUST pass a revalidate here, not just set the segment export.
async function getJson<T>(path: string, revalidate?: number): Promise<T | null> {
  try {
    const init: RequestInit =
      revalidate != null ? { next: { revalidate } } : { cache: 'no-store' };
    const res = await fetch(`${API_ORIGIN}${path}`, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET /api/jobs — returns { jobs, totalJobs }. Pass `revalidate` to cache (ISR). */
export async function fetchJobs(params: {
  search?: string;
  category?: string;
  limit?: number;
  page?: number;
  revalidate?: number;
}): Promise<JobsListResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.category) qs.set('category', params.category);
  qs.set('limit', String(params.limit ?? 100));
  if (params.page) qs.set('page', String(params.page));
  const data = await getJson<JobsListResponse>(`/api/jobs?${qs.toString()}`, params.revalidate);
  return data ?? { jobs: [], totalJobs: 0 };
}

/** GET /api/jobs/public-bait — array of 9 newest teaser jobs. Pass `revalidate` to cache (ISR). */
export async function fetchBaitJobs(revalidate?: number): Promise<IJob[]> {
  const data = await getJson<IJob[]>('/api/jobs/public-bait', revalidate);
  return Array.isArray(data) ? data : [];
}

/** GET /api/jobs/directory — company directory stats. Pass `revalidate` to cache (ISR). */
export async function fetchDirectory(revalidate?: number): Promise<ICompany[]> {
  const data = await getJson<ICompany[]>('/api/jobs/directory', revalidate);
  return Array.isArray(data) ? data : [];
}

export interface RelatedJobs {
  /** The viewed job's category, or null when it has none / is unknown. */
  category: string | null;
  /** Honest public count for that category, for the "N+ positions" copy. */
  categoryTotal: number;
  jobs: IJob[];
}

/**
 * GET /api/jobs/:id/related — up to `limit` newest jobs in the same category,
 * excluding the viewed one. Served from the backend's RAM cache (no DB), and
 * the endpoint returns an empty set rather than an error for an unknown id, so
 * the job page's related block simply doesn't render.
 */
export async function fetchRelatedJobs(id: string, limit = 5): Promise<RelatedJobs> {
  const data = await getJson<RelatedJobs>(
    `/api/jobs/${encodeURIComponent(id)}/related?limit=${limit}`,
  );
  return data ?? { category: null, categoryTotal: 0, jobs: [] };
}

/** GET /api/jobs/:id/full — full job (or gated teaser). Anonymous server request. */
export async function fetchJobFull(
  id: string,
): Promise<{ gated: boolean; job?: IJob; teaser?: IJob } | null> {
  return getJson(`/api/jobs/${encodeURIComponent(id)}/full`);
}

// ── Career guide ───────────────────────────────────────────────────────────
// The only JSON source for articles is the admin endpoint (auth-gated). If a
// service token is available we send it; otherwise these degrade to empty and
// the pages render their empty state. Content still exists server-rendered by
// Express at /career-guide; this replica powers the App Router equivalents.

export interface CareerArticle {
  _id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  description: string;
  author?: string;
  tags?: string[];
  status: 'draft' | 'published';
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// All career-guide reads go through the PUBLIC, unauthenticated endpoints
// (/api/career-guide/public*). No service token required — the old
// /api/admin/career-guide route needed a CAREER_GUIDE_SERVICE_TOKEN (a 7-day
// JWT) that expired and silently emptied these pages. The public endpoints
// return published articles only.

async function fetchCareerGuide<T>(path: string, revalidate?: number): Promise<T | null> {
  try {
    const cacheInit: RequestInit =
      revalidate != null ? { next: { revalidate } } : { cache: 'no-store' };
    const res = await fetch(`${API_ORIGIN}/api/career-guide/public${path}`, cacheInit);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchPublishedArticles(revalidate?: number): Promise<CareerArticle[]> {
  const data = await fetchCareerGuide<{ articles?: CareerArticle[] }>('', revalidate);
  const articles = Array.isArray(data?.articles) ? data!.articles! : [];
  // Defensive: the endpoint already filters to published, but never leak a draft.
  return articles.filter((a) => a.status === 'published');
}

export async function fetchArticlesByCategory(
  category: string,
  revalidate?: number,
): Promise<CareerArticle[]> {
  const data = await fetchCareerGuide<{ articles?: CareerArticle[] }>(
    `/${encodeURIComponent(category)}`,
    revalidate,
  );
  const articles = Array.isArray(data?.articles) ? data!.articles! : [];
  return articles.filter((a) => a.status === 'published');
}

export async function fetchArticleBySlug(
  slug: string,
  revalidate?: number,
): Promise<CareerArticle | null> {
  const data = await fetchCareerGuide<{ article?: CareerArticle }>(
    `/article/${encodeURIComponent(slug)}`,
    revalidate,
  );
  const article = data?.article ?? null;
  return article && article.status === 'published' ? article : null;
}
