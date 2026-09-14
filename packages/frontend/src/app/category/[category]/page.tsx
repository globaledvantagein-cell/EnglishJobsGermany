import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORY_ORDER, CATEGORY_SLUGS, categoryFromSlug, categorySlug } from '@/utils/categorize';
import { fetchJobs, SITE_URL } from '@/lib/serverApi';
import SeoJobCard from '@/components/seo/SeoJobCard';
import JsonLd, { itemListJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { brandTitle } from '@/lib/seoTitle';
import { alternatesFor } from '@/lib/seoAlternates';

// ISR: cache the rendered page and revalidate hourly (see city page). The
// fetches below pass the same `revalidate` so `no-store` doesn't force the
// route dynamic.
export const revalidate = 3600;

// Prerender every category at build so each page is static + ISR (served
// instantly), not dynamically rendered on the first request.
export function generateStaticParams() {
  // Route params are SLUGS ('software-engineering'), not category names —
  // a name contains spaces and "&" and cannot be a path segment.
  return CATEGORY_SLUGS.map((category) => ({ category }));
}

type Params = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return { title: 'Category not found' };
  const label = category;
  // The API validates against the full category NAME, not the slug.
  const { totalJobs } = await fetchJobs({ category, limit: 1, revalidate: 3600 });
  // Category names run long ("Customer Success & Support"), so fall back to
  // progressively shorter phrasings rather than letting Google truncate.
  const title = brandTitle(`${label} Jobs in Germany`, `${label} Jobs`);
  const description = `${totalJobs} ${label} ${
    totalJobs === 1 ? 'job' : 'jobs'
  } in Germany for English speakers, expats and internationals. Work in ${label} without German — every role is checked before it is listed.`;
  return {
    title,
    description,
    alternates: alternatesFor(`/category/${slug}`),
    openGraph: {
      title: `English ${label} Jobs in Germany — No German Required`,
      description,
      url: `${SITE_URL}/category/${slug}`,
      type: 'website',
    },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const label = category;

  const { jobs, totalJobs } = await fetchJobs({ category, limit: 100, revalidate: 3600 });
  const otherCategories = CATEGORY_ORDER.filter((c) => c !== category);

  // Two real employers from this category, named in the intro so each category
  // page has its own prose instead of the same sentence 28 times over.
  const sampleCompanies = [...new Set(jobs.map((j) => j.Company))].slice(0, 2);

  const title = `English ${label} Jobs in Germany`;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(20px,4vw,40px) clamp(16px,3vw,24px)' }}>
      <JsonLd data={itemListJsonLd(title, jobs, SITE_URL)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Jobs', url: `${SITE_URL}/jobs` },
          { name: label, url: `${SITE_URL}/category/${slug}` },
        ])}
      />

      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
        <Link href="/" style={{ color: 'inherit' }}>Home</Link>
        {' › '}
        <Link href="/jobs" style={{ color: 'inherit' }}>Jobs</Link>
        {' › '}
        <span style={{ color: 'var(--text-primary)' }}>{label}</span>
      </nav>

      <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
        {label} Jobs in Germany — No German Required
      </h1>
      {/* Server-rendered intro prose — the page's indexable text. */}
      <p style={{ color: 'var(--text-secondary)', marginTop: 14, fontSize: '1rem', lineHeight: 1.7, maxWidth: 720 }}>
        Browse {totalJobs} {label} {totalJobs === 1 ? 'job' : 'jobs'} in Germany that don&rsquo;t
        require German.
        {sampleCompanies.length === 2 && ` From ${sampleCompanies[0]} to ${sampleCompanies[1]},`}
        {sampleCompanies.length === 1 && ` At employers like ${sampleCompanies[0]},`}
        {sampleCompanies.length > 0 ? ' find' : ' Find'} English-speaking {label} roles across
        Berlin, Munich, Hamburg, and more.
      </p>
      <p style={{ color: 'var(--text-secondary)', marginTop: 10, fontSize: '1rem', maxWidth: 720 }}>
        Every listing is checked before it is published, so German fluency is never a
        hard requirement.
      </p>

      <div style={{ margin: '24px 0' }}>
        <Link
          href={`/jobs?category=${encodeURIComponent(category)}`}
          style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}
        >
          Browse all {label} jobs →
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          No open {label} roles right now. Browse{' '}
          <Link href="/jobs" style={{ color: 'var(--primary)' }}>all jobs</Link>.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {jobs.map((job) => (
            <SeoJobCard key={job._id} job={job} />
          ))}
        </div>
      )}

      <section style={{ marginTop: 48, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
          Other job categories
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {otherCategories.map((c) => (
            <Link
              key={c}
              href={`/category/${categorySlug(c)}`}
              style={{
                fontSize: '0.85rem',
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}
            >
              {c}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
