import type { MetadataRoute } from 'next';
import type { IJob } from '@/types';
import { CANONICAL_CITIES } from '@/data/cities';
import { CATEGORY_SLUGS } from '@/utils/categorize';
import { CAREER_GUIDE_CATEGORIES } from '@/data/careerGuide';
import { fetchPublishedArticles, fetchJobs, SITE_URL } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0, lastModified: now },
    { url: `${SITE_URL}/jobs`, changeFrequency: 'daily', priority: 0.9, lastModified: now },
    // The remote vertical is a single filterable page — there are no
    // /remote-jobs/[id] detail routes (jobs are deep-linked as ?id=), so
    // nothing further to enumerate here.
    { url: `${SITE_URL}/remote-jobs`, changeFrequency: 'daily', priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/directory`, changeFrequency: 'weekly', priority: 0.8, lastModified: now },
    { url: `${SITE_URL}/alerts`, changeFrequency: 'monthly', priority: 0.7, lastModified: now },
    { url: `${SITE_URL}/legal`, changeFrequency: 'yearly', priority: 0.3, lastModified: now },
    { url: `${SITE_URL}/career-guide`, changeFrequency: 'weekly', priority: 0.8, lastModified: now },
  ];

  for (const c of CATEGORY_SLUGS) {
    entries.push({ url: `${SITE_URL}/category/${c}`, changeFrequency: 'daily', priority: 0.8, lastModified: now });
  }
  for (const city of CANONICAL_CITIES) {
    entries.push({ url: `${SITE_URL}/city/${city.slug}`, changeFrequency: 'daily', priority: 0.7, lastModified: now });
  }

  const articles = await fetchPublishedArticles();
  const nonEmptyCats = new Set(articles.map((a) => a.category));
  for (const cat of CAREER_GUIDE_CATEGORIES) {
    if (nonEmptyCats.has(cat)) {
      entries.push({ url: `${SITE_URL}/career-guide/${cat}`, changeFrequency: 'weekly', priority: 0.7, lastModified: now });
    }
  }
  for (const a of articles) {
    entries.push({
      url: `${SITE_URL}/career-guide/${a.category}/${a.slug}`,
      changeFrequency: 'monthly',
      priority: 0.6,
      lastModified: a.updatedAt || a.publishedAt ? new Date(a.updatedAt || a.publishedAt!) : now,
    });
  }

  // Individual job pages — the highest-value SEO URLs. The API caps `limit`
  // at 100 per page, so page through ALL live jobs, not a fixed slice: the
  // count grows daily and a hardcoded 10 pages silently dropped every job
  // past the newest 1000 (4,477 live at the time of writing → ~3,477 real,
  // indexable pages were never advertised to Google).
  //
  // Bounded by the sitemap protocol's 50,000-URL limit, and fetched in small
  // batches so we never fan out hundreds of simultaneous requests at the
  // backend. Failures degrade to fewer entries rather than breaking the file.
  const PAGE_SIZE = 100;
  const BATCH = 10;
  const MAX_JOB_URLS = 45000; // leaves headroom under 50k for the static URLs

  const first = await fetchJobs({ limit: PAGE_SIZE, page: 1, revalidate: 3600 });
  const totalJobs = first.totalJobs || first.jobs.length;
  const totalPages = Math.min(
    Math.ceil(totalJobs / PAGE_SIZE),
    Math.ceil(MAX_JOB_URLS / PAGE_SIZE),
  );

  const jobPages: Array<{ jobs: IJob[] }> = [first];
  for (let start = 2; start <= totalPages; start += BATCH) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(BATCH, totalPages - start + 1) }, (_, i) =>
        fetchJobs({ limit: PAGE_SIZE, page: start + i, revalidate: 3600 }).catch(() => ({
          jobs: [] as IJob[],
          totalJobs: 0,
        })),
      ),
    );
    jobPages.push(...batch);
  }

  // The same job can appear on two pages if the underlying list shifts between
  // requests; de-dupe so the sitemap never advertises a URL twice.
  const seen = new Set<string>();
  for (const p of jobPages) {
    for (const job of p.jobs || []) {
      const id = String(job._id);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        url: `${SITE_URL}/jobs/${id}`,
        changeFrequency: 'weekly',
        priority: 0.6,
        lastModified: job.PostedDate ? new Date(job.PostedDate) : now,
      });
    }
  }

  return entries;
}
