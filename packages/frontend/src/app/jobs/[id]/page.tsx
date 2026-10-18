import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchJobPage, fetchJobs, fetchRelatedJobs, SITE_URL } from '@/lib/serverApi';
import { categorySlug } from '@/utils/categorize';
import { findCityByLocation } from '@/data/cities';
import JobSharePage from '@/page-components/JobSharePage';
import JsonLd, { jobPostingJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import SeoJobCard from '@/components/seo/SeoJobCard';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import '@/components/seo/listing.css';
import { brandTitle } from '@/lib/seoTitle';
import { alternatesFor } from '@/lib/seoAlternates';

// ISR: the server HTML is the same for every visitor (the full job; gating is
// applied per visitor in the browser), so it's cached and rebuilt in the
// background at most every 10 minutes instead of on every request.
// generateStaticParams returning [] is what enables on-demand ISR for ids that
// weren't built at deploy time.
export const revalidate = 600;
const JOB_PAGE_REVALIDATE = 600;

export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ id: string }> };




export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const res = await fetchJobPage(id, JOB_PAGE_REVALIDATE);
  const job = res?.job;
  if (!job) {
    // Expired/removed job. The page below also calls notFound(); this keeps the
    // response out of the index either way.
    //
    // NOTE: this cannot produce a real HTTP 404. app/loading.tsx starts the
    // response stream before this resolves, and Next cannot change the status
    // once headers are sent (docs: file-conventions/loading#status-codes), so
    // the response is 200 + noindex. Per those same docs that does NOT lead to
    // indexation — Next also auto-injects <meta name="robots" content="noindex">
    // for the 404 fallback. Removing the loading.tsx skeletons would be the
    // only way to get a true 404 here, at the cost of the loading UX.
    return { title: 'Job not found', robots: { index: false, follow: false } };
  }
  // The layout template appends the brand; spelling it out here produced
  // "… — English Jobs Germany — English Jobs Germany". Long titles fall back to
  // the role alone rather than being cut mid-company-name.
  const title = brandTitle(`${job.JobTitle} at ${job.Company}`, job.JobTitle);
  const rawDesc = (job.Description || '').replace(/\s+/g, ' ').trim();
  const description = rawDesc
    ? rawDesc.slice(0, 155)
    : `${job.JobTitle} at ${job.Company} — an English-speaking role in Germany. No German required.`;
  return {
    title,
    description,
    alternates: alternatesFor(`/jobs/${job._id}`),
    openGraph: {
      title: `${job.JobTitle} at ${job.Company}`,
      description,
      url: `${SITE_URL}/jobs/${job._id}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${job.JobTitle} at ${job.Company}`,
      description,
    },
  };
}

// The interactive detail (apply / share / save / gating) is fully client-side.
// The server component supplies crawlable metadata, OG tags, and JobPosting
// JSON-LD (Google for Jobs / AI answer-engine eligibility).
export default async function JobDetailRoute({ params }: Params) {
  const { id } = await params;
  const res = await fetchJobPage(id, JOB_PAGE_REVALIDATE);
  // Missing or inactive job → a real 404 (renders not-found.tsx) instead of a
  // soft-404 that wastes crawl budget. Backend errors throw inside fetchJobPage,
  // so a blip is never cached as "not found".
  if (!res) notFound();
  const job = res.job;

  // Internal link mesh. Job pages are by far the biggest indexed surface on the
  // site (~4.3k URLs), so these links are what pass equity down to the 28
  // category pages and the city hubs — without them every job page is a dead
  // end that absorbs authority and passes none on.
  //
  // Both requests are RAM reads on the backend (category index / search index),
  // no DB, and they run in parallel with each other.
  const city = findCityByLocation(job?.Location);
  const [related, cityStats] = await Promise.all([
    fetchRelatedJobs(id, 6, JOB_PAGE_REVALIDATE),
    city ? fetchJobs({ search: city.slug, limit: 1, revalidate: JOB_PAGE_REVALIDATE }) : Promise.resolve(null),
  ]);
  const category = related.category || job?.Category || null;
  const cityCount = cityStats?.totalJobs ?? 0;

  return (
    <div className="page-wash" data-wash="jobs">
      {job && <JsonLd data={jobPostingJsonLd(job, SITE_URL)} />}

      {/* Breadcrumbs. Rendered as microdata rather than a second JSON-LD
          BreadcrumbList — one page should describe one breadcrumb trail, and
          two competing entities is worse than either alone. The middle crumb
          points at the job's category hub, which is also the internal link
          that passes equity from the ~4.3k job pages down to the 28 category
          pages. `href` is used over <Link> so the trail is a plain crawlable
          anchor in the server HTML. */}
      {/* Top nav, after Jobright/Wellfound/Arbeitnow job pages (REA): none of
          them repeat the job title in a visible trail — it sits right below.
          So the visible bar is a short one-line trail (just the parent on
          phones); the full three-level trail stays as BreadcrumbList JSON-LD. */}
      {job && (
        <>
          <JsonLd
            data={breadcrumbJsonLd([
              { name: 'Home', url: `${SITE_URL}/` },
              category
                ? { name: category, url: `${SITE_URL}/category/${categorySlug(category)}` }
                : { name: 'Jobs', url: `${SITE_URL}/jobs` },
              { name: job.JobTitle, url: `${SITE_URL}/jobs/${job._id}` },
            ])}
          />
          <nav aria-label="Breadcrumb" className="jd-crumbs">
            <a href="/jobs" className="jd-crumb-root">Jobs</a>
            {category && (
              <>
                <span aria-hidden="true" className="jd-crumb-sep">›</span>
                <a href={`/category/${categorySlug(category)}`} className="jd-crumb-parent">
                  <ChevronLeft size={15} aria-hidden="true" className="jd-crumb-back" />
                  {category}
                </a>
              </>
            )}
            {city && (
              <>
                <span aria-hidden="true" className="jd-crumb-sep">·</span>
                <a href={`/city/${city.slug}`} className="jd-crumb-city">{city.label}</a>
              </>
            )}
          </nav>
        </>
      )}
      {/* Seed the client page with the full job so it paints instantly (no
          skeleton) and crawlers see the description. JobSharePage then checks
          this visitor's allowance in the browser and swaps in the gate if
          needed. A teaser (no SSR_API_TOKEN) has no description, so no seed. */}
      <JobSharePage initialJob={res.full ? job : null} />

      {/* Below the job: similar roles as real job cards, plus the category and
          city hubs as compact link cards — the job-to-job and job-to-hub
          internal links, in the same visual language as the listing pages. */}
      {job && (category || city || related.jobs.length > 0) && (
        <section className="jd-explore" aria-labelledby="jd-explore-title">
          <div className="jd-explore-grid">
            <div>
              <div className="ls-list-head">
                <h2 id="jd-explore-title">Similar jobs</h2>
                {category && <a href={`/category/${categorySlug(category)}`} className="jd-explore-all">See all <ArrowRight size={15} /></a>}
              </div>
              {related.jobs.length > 0 ? (
                <div className="ls-list">
                  {related.jobs.map((j) => <SeoJobCard key={j._id} job={j} />)}
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>No similar roles open right now.</p>
              )}
            </div>

            <aside className="jd-explore-aside">
              {category && (
                <a href={`/category/${categorySlug(category)}`} className="jd-hub">
                  <span className="jd-hub-label">More in this field</span>
                  <span className="jd-hub-title">{category} jobs in Germany</span>
                  <span className="jd-hub-meta">
                    {related.categoryTotal > 0 ? `${related.categoryTotal.toLocaleString('en-US')} open roles, no German required` : 'No German required'}
                    <ArrowRight size={16} />
                  </span>
                </a>
              )}
              {city && (
                <a href={`/city/${city.slug}`} className="jd-hub">
                  <span className="jd-hub-label">More in this city</span>
                  <span className="jd-hub-title">English-speaking jobs in {city.label}</span>
                  <span className="jd-hub-meta">
                    {cityCount > 0 ? `${cityCount.toLocaleString('en-US')} open roles` : 'Browse open roles'}
                    <ArrowRight size={16} />
                  </span>
                </a>
              )}
              <a href="/alerts" className="jd-hub" data-tone="accent">
                <span className="jd-hub-label">Don’t miss the next one</span>
                <span className="jd-hub-title">Get new {category ?? 'English-speaking'} jobs by email</span>
                <span className="jd-hub-meta">Free weekly job alerts <ArrowRight size={16} /></span>
              </a>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
