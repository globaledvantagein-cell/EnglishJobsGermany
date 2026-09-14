import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchPublishedArticles, SITE_URL } from '@/lib/serverApi';
import { CAREER_GUIDE_CATEGORIES, careerCategoryLabel } from '@/data/careerGuide';
import { estimateReadingMinutes } from '@/lib/markdown';
import JsonLd, { breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { alternatesFor } from '@/lib/seoAlternates';

// ISR: articles change rarely, so cache the page and revalidate hourly. The
// article fetch passes the same `revalidate` (a `no-store` fetch would force
// this route dynamic and defeat the cache).
export const revalidate = 3600;

export const metadata: Metadata = {
  // 43 chars with the layout's brand suffix — safely inside Google's cutoff.
  title: 'Germany Career Guide',
  description:
    'Practical guides on finding English-speaking jobs in Germany: visas, salaries, companies, and settling in. Written for internationals.',
  alternates: alternatesFor('/career-guide'),
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function CareerGuideHub() {
  const articles = await fetchPublishedArticles(3600);
  const counts = new Map<string, number>();
  for (const a of articles) counts.set(a.category, (counts.get(a.category) || 0) + 1);

  // Every published guide, newest first — the whole library is browsable
  // from this one page. Category pages remain as crawlable SEO hubs,
  // reachable via the topic chips.
  const sorted = [...articles].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const [featured, ...rest] = sorted;

  return (
    <div className="guide-hub">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Career Guide', url: `${SITE_URL}/career-guide` },
        ])}
      />

      <header className="guide-hero">
        <span className="guide-hero__eyebrow">Career Guide</span>
        <h1 className="guide-hero__title">Germany Career Guide</h1>
        <p className="guide-hero__lede">
          Your complete guide to working in Germany as an English speaker. From finding jobs
          to navigating visas, salary negotiation to settling in — everything you need to know.
        </p>
        <p className="guide-hero__lede">
          Practical, no-nonsense guides on landing an English-speaking job in Germany — visas,
          salaries, companies, and everything about settling in. Written for internationals.
        </p>
      </header>

      {/* Topic chips — real links to the category pages (SEO hubs). */}
      <nav aria-label="Guide topics" className="guide-chips">
        {CAREER_GUIDE_CATEGORIES.map((slug) => {
          const n = counts.get(slug) || 0;
          if (n === 0) return null;
          return (
            <Link key={slug} href={`/career-guide/${slug}`} className="guide-chip">
              {careerCategoryLabel(slug)}
              <span className="guide-chip__count">{n}</span>
            </Link>
          );
        })}
      </nav>

      {featured && (
        <section aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="sr-only">Featured guide</h2>
          <Link href={`/career-guide/${featured.category}/${featured.slug}`} className="guide-feature">
            <span className="guide-feature__eyebrow">
              Latest · {careerCategoryLabel(featured.category)}
            </span>
            <span className="guide-feature__title">{featured.title}</span>
            {featured.description && (
              <span className="guide-feature__desc">{featured.description}</span>
            )}
            <span className="guide-feature__meta">
              {featured.publishedAt && <>{formatDate(featured.publishedAt)}<span aria-hidden="true"> · </span></>}
              {estimateReadingMinutes(featured.content)} min read
              <span className="guide-feature__cta">Read the guide →</span>
            </span>
          </Link>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="all-heading" className="guide-index">
          <h2 id="all-heading" className="guide-section-title">All guides</h2>
          <ul className="guide-rows">
            {rest.map((a) => (
              <li key={a._id}>
                <Link href={`/career-guide/${a.category}/${a.slug}`} className="guide-row">
                  <span className="guide-row__main">
                    <span className="guide-row__cat">{careerCategoryLabel(a.category)}</span>
                    <span className="guide-row__title">{a.title}</span>
                    {a.description && <span className="guide-row__desc">{a.description}</span>}
                  </span>
                  <span className="guide-row__meta">
                    {a.publishedAt && <span>{formatDate(a.publishedAt)}</span>}
                    <span>{estimateReadingMinutes(a.content)} min read</span>
                    <span className="guide-row__arrow" aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
