import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findCityBySlug, CANONICAL_CITIES } from '@/data/cities';
import { cityIntro } from '@/data/cityIntros';
import { fetchJobs, SITE_URL } from '@/lib/serverApi';
import SeoJobCard from '@/components/seo/SeoJobCard';
import JsonLd, { itemListJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { alternatesFor } from '@/lib/seoAlternates';

// ISR: cache the rendered page and revalidate hourly. Job listings change
// slowly, so serving cached HTML is a big win; the fetches below opt into the
// same window via `revalidate` (a `no-store` fetch would force this route
// dynamic and defeat the cache).
export const revalidate = 3600;

// Prerender every known city at build so each page is static + ISR (served
// instantly), not dynamically rendered on the first request.
export function generateStaticParams() {
  return CANONICAL_CITIES.map((c) => ({ city: c.slug }));
}

type Params = { params: Promise<{ city: string }> };

/**
 * The employers with the most open roles in a result set. Named in both the
 * meta description and the on-page copy so each city page cites real,
 * currently-hiring companies rather than a hard-coded list that goes stale.
 */
function topEmployers(jobs: { Company: string }[], n: number): string[] {
  const byCompany = new Map<string, number>();
  for (const j of jobs) byCompany.set(j.Company, (byCompany.get(j.Company) || 0) + 1);
  return [...byCompany.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => name);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: slug } = await params;
  const city = findCityBySlug(slug);
  if (!city) return { title: 'City not found' };
  // Same request the page body makes, so this is a cache hit rather than a
  // second API call — and the description can name real employers.
  const { jobs, totalJobs } = await fetchJobs({ search: city.slug, limit: 100, revalidate: 3600 });
  const companies = topEmployers(jobs, 3);

  // Exact-match title for the "english jobs in <city>" queries, set absolute so
  // the layout's brand template doesn't push it past Google's ~60-char cutoff.
  // Only the handful of very long city names fall back to the brand pattern.
  const headline = `English Jobs in ${city.label} — No German Required`;
  const title: Metadata['title'] =
    headline.length <= 60 ? { absolute: headline } : `English Jobs in ${city.label}`;

  const positions = totalJobs > 0
    ? `Browse ${totalJobs}+ verified ${totalJobs === 1 ? 'position' : 'positions'}`
    : 'Browse verified positions';
  const description = `Find English-speaking jobs in ${city.label}, Germany. ${positions}${
    companies.length ? ` at companies like ${companies.join(', ')}` : ''
  }. No German required.`;
  return {
    title,
    description,
    alternates: alternatesFor(`/city/${city.slug}`),
    openGraph: {
      title: headline,
      description,
      url: `${SITE_URL}/city/${city.slug}`,
      type: 'website',
    },
  };
}

export default async function CityPage({ params }: Params) {
  const { city: slug } = await params;
  const city = findCityBySlug(slug);
  if (!city) notFound();

  const { jobs, totalJobs } = await fetchJobs({ search: city.slug, limit: 100, revalidate: 3600 });
  const otherCities = CANONICAL_CITIES.filter((c) => c.slug !== city.slug).slice(0, 24);

  const topCompanies = topEmployers(jobs, 3);
  const introParagraphs = cityIntro(city.slug, city.label, totalJobs, topCompanies);

  const title = `English Jobs in ${city.label} — No German Required`;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(20px,4vw,40px) clamp(16px,3vw,24px)' }}>
      <JsonLd data={itemListJsonLd(title, jobs, SITE_URL)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Jobs', url: `${SITE_URL}/jobs` },
          { name: city.label, url: `${SITE_URL}/city/${city.slug}` },
        ])}
      />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
        <Link href="/" style={{ color: 'inherit' }}>Home</Link>
        {' › '}
        <Link href="/jobs" style={{ color: 'inherit' }}>Jobs</Link>
        {' › '}
        <span style={{ color: 'var(--text-primary)' }}>{city.label}</span>
      </nav>

      <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
        English-Speaking Jobs in {city.label}, Germany
      </h1>
      {/* Unique, server-rendered prose per city — the page's indexable text. */}
      {introParagraphs.map((paragraph, i) => (
        <p
          key={i}
          style={{
            color: 'var(--text-secondary)',
            marginTop: i === 0 ? 14 : 12,
            fontSize: '1rem',
            lineHeight: 1.7,
            maxWidth: 720,
          }}
        >
          {paragraph}
        </p>
      ))}

      <div style={{ margin: '24px 0' }}>
        <Link
          href={`/jobs?search=${encodeURIComponent(city.slug)}`}
          style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}
        >
          Browse all {city.label} jobs →
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          No open roles in {city.label} right now. Check back soon or browse{' '}
          <Link href="/jobs" style={{ color: 'var(--primary)' }}>all jobs</Link>.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {jobs.map((job) => (
            <SeoJobCard key={job._id} job={job} />
          ))}
        </div>
      )}

      {/* Cross-links to other cities */}
      <section style={{ marginTop: 48, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
          English jobs in other German cities
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {otherCities.map((c) => (
            <Link
              key={c.slug}
              href={`/city/${c.slug}`}
              style={{
                fontSize: '0.85rem',
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
