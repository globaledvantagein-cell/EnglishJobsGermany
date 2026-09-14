import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchJobFull, fetchJobs, fetchRelatedJobs, SITE_URL } from '@/lib/serverApi';
import { categorySlug } from '@/utils/categorize';
import { findCityByLocation } from '@/data/cities';
import JobSharePage from '@/page-components/JobSharePage';
import JsonLd, { jobPostingJsonLd } from '@/components/seo/JsonLd';
import { brandTitle } from '@/lib/seoTitle';
import { alternatesFor } from '@/lib/seoAlternates';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const sectionHeadingStyle = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: '0 0 8px',
} as const;

const sectionBodyStyle = {
  fontSize: '0.95rem',
  lineHeight: 1.7,
  color: 'var(--text-secondary)',
  margin: 0,
} as const;

const linkStyle = { color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' } as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const res = await fetchJobFull(id);
  const job = res?.job || res?.teaser;
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
  const res = await fetchJobFull(id);
  // Missing or inactive job → the backend returns null (non-2xx). Return a real
  // HTTP 404 (renders not-found.tsx) instead of a soft-404 that wastes crawl
  // budget. A gated-but-valid job (res.teaser only) is NOT a 404.
  if (!res || (!res.job && !res.teaser)) notFound();
  const job = res.job || res.teaser;

  // Internal link mesh. Job pages are by far the biggest indexed surface on the
  // site (~4.3k URLs), so these links are what pass equity down to the 28
  // category pages and the city hubs — without them every job page is a dead
  // end that absorbs authority and passes none on.
  //
  // Both requests are RAM reads on the backend (category index / search index),
  // no DB, and they run in parallel with each other.
  const city = findCityByLocation(job?.Location);
  const [related, cityStats] = await Promise.all([
    fetchRelatedJobs(id, 5),
    city ? fetchJobs({ search: city.slug, limit: 1 }) : Promise.resolve(null),
  ]);
  const category = related.category || job?.Category || null;
  const cityCount = cityStats?.totalJobs ?? 0;

  return (
    <>
      {job && <JsonLd data={jobPostingJsonLd(job, SITE_URL)} />}

      {/* Breadcrumbs. Rendered as microdata rather than a second JSON-LD
          BreadcrumbList — one page should describe one breadcrumb trail, and
          two competing entities is worse than either alone. The middle crumb
          points at the job's category hub, which is also the internal link
          that passes equity from the ~4.3k job pages down to the 28 category
          pages. `href` is used over <Link> so the trail is a plain crawlable
          anchor in the server HTML. */}
      {job && (
        <nav
          aria-label="Breadcrumb"
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: 'clamp(12px,2vw,20px) clamp(16px,3vw,24px) 0',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}
        >
          <ol
            itemScope
            itemType="https://schema.org/BreadcrumbList"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}
          >
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <Link itemProp="item" href="/" style={{ color: 'inherit' }}>
                <span itemProp="name">Home</span>
              </Link>
              <meta itemProp="position" content="1" />
            </li>
            <li aria-hidden="true">›</li>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              {category ? (
                <Link itemProp="item" href={`/category/${categorySlug(category)}`} style={{ color: 'inherit' }}>
                  <span itemProp="name">{category}</span>
                </Link>
              ) : (
                <Link itemProp="item" href="/jobs" style={{ color: 'inherit' }}>
                  <span itemProp="name">Jobs</span>
                </Link>
              )}
              <meta itemProp="position" content="2" />
            </li>
            <li aria-hidden="true">›</li>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <span itemProp="name" style={{ color: 'var(--text-primary)' }}>{job.JobTitle}</span>
              <meta itemProp="position" content="3" />
            </li>
          </ol>
        </nav>
      )}
      {/* Seed the client page with the full server-fetched job (crawlable HTML +
          instant first paint); the client re-fetches to apply auth-aware gating. */}
      <JobSharePage initialJob={res.job ?? null} />

      {job && (category || city || related.jobs.length > 0) && (
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '8px clamp(16px,3vw,24px) 48px',
            display: 'grid',
            gap: 28,
          }}
        >
          {/* a) Category hub link. */}
          {category && (
            <section>
              <h2 style={sectionHeadingStyle}>More {category} Jobs</h2>
              <p style={sectionBodyStyle}>
                Browse all{' '}
                <Link href={`/category/${categorySlug(category)}`} style={linkStyle}>
                  {category} jobs in Germany
                </Link>
                {related.categoryTotal > 0 && ` — ${related.categoryTotal}+ positions`}, no German
                required.
              </p>
            </section>
          )}

          {/* b) City hub link — only when the job's Location resolves to a city
              we actually have a page for. */}
          {city && (
            <section>
              <h2 style={sectionHeadingStyle}>More Jobs in {city.label}</h2>
              <p style={sectionBodyStyle}>
                Find{' '}
                <Link href={`/city/${city.slug}`} style={linkStyle}>
                  English-speaking jobs in {city.label}
                </Link>
                {cityCount > 0 && ` — ${cityCount}+ verified positions`}.
              </p>
            </section>
          )}

          {/* c) Sibling job links — the job-to-job edges that let a crawler
              walk the whole category from any one page. */}
          {related.jobs.length > 0 && (
            <section>
              <h2 style={sectionHeadingStyle}>Similar Jobs You Might Like</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {related.jobs.map((j) => (
                  <li key={j._id}>
                    <Link href={`/jobs/${j._id}`} style={{ ...sectionBodyStyle, ...linkStyle, display: 'block' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{j.JobTitle}</strong> at{' '}
                      {j.Company} · {j.Location}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
