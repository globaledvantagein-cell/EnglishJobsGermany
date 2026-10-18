import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { fetchJobs, fetchPublishedArticles, SITE_URL } from '@/lib/serverApi';
import { estimateReadingMinutes } from '@/lib/markdown';
import JsonLd, { breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { alternatesFor } from '@/lib/seoAlternates';
import ArticleCard, { type GuideArticleSummary } from '@/components/guide/ArticleCard';
import GuideTopics from '@/components/guide/GuideTopics';
import '@/components/seo/listing.css';

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

export default async function CareerGuideHub() {
  const [articles, jobStats] = await Promise.all([
    fetchPublishedArticles(3600),
    fetchJobs({ limit: 1, revalidate: 3600 }),
  ]);
  const counts = new Map<string, number>();
  for (const a of articles) counts.set(a.category, (counts.get(a.category) || 0) + 1);

  // Every published guide, newest first — the whole library is browsable
  // from this one page. Topic pages remain as crawlable SEO hubs.
  const summaries: GuideArticleSummary[] = [...articles]
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .map((a) => ({
      slug: a.slug, category: a.category, title: a.title, description: a.description,
      publishedAt: a.publishedAt, readingMinutes: estimateReadingMinutes(a.content),
    }));
  const [featured, ...rest] = summaries;
  const updated = featured?.publishedAt
    ? new Date(featured.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const jobCount = jobStats.totalJobs > 0 ? `${(Math.floor(jobStats.totalJobs / 100) * 100).toLocaleString('en-US')}+` : null;

  // CollectionPage + ItemList: tells crawlers and AI answer engines this page
  // is the index of the guide library, with every article listed.
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Germany Career Guide',
    url: `${SITE_URL}/career-guide`,
    description: 'Practical guides on finding English-speaking jobs in Germany: visas, salaries, companies, and settling in.',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: summaries.map((a, i) => ({
        '@type': 'ListItem', position: i + 1, name: a.title,
        url: `${SITE_URL}/career-guide/${a.category}/${a.slug}`,
      })),
    },
  };

  return (
    <div className="page-wash" data-wash="guide">
      <div className="gd">
        <JsonLd
          data={breadcrumbJsonLd([
            { name: 'Home', url: `${SITE_URL}/` },
            { name: 'Career Guide', url: `${SITE_URL}/career-guide` },
          ])}
        />
        <JsonLd data={collectionJsonLd} />

        <nav aria-label="Breadcrumb" className="ls-crumbs">
          <Link href="/">Home</Link>{' › '}<span style={{ color: 'var(--text-primary)' }}>Career guide</span>
        </nav>

        <header className="gd-head">
          <span className="gd-eyebrow">Career guide</span>
          <h1 className="gd-title">Germany Career Guide</h1>
          <p className="gd-lede">
            Practical guides to working in Germany as an English speaker — finding jobs, visas,
            salary negotiation, companies and settling in. Written for internationals.
          </p>
          <ul className="gd-stats">
            <li><strong>{articles.length}</strong> guides</li>
            <li><strong>{[...counts.values()].filter((n) => n > 0).length}</strong> topics</li>
            {updated && <li>Updated {updated}</li>}
          </ul>
        </header>

        {/* Topic tiles — real links to the topic pages (SEO hubs). */}
        <GuideTopics counts={counts} />

        {featured && (
          <section className="gd-section" aria-labelledby="featured-heading">
            <h2 id="featured-heading" className="ls-sr">Latest guide</h2>
            <ArticleCard article={featured} featured />
          </section>
        )}

        {rest.length > 0 && (
          <section className="gd-section" aria-labelledby="all-heading">
            <div className="gd-section-head">
              <h2 id="all-heading">All guides</h2>
              <p>Newest first</p>
            </div>
            <div className="gd-grid">
              {rest.map((a) => <ArticleCard key={a.slug} article={a} />)}
            </div>
          </section>
        )}

        <aside className="gd-cta" aria-label="Find a job">
          <div>
            <p className="gd-cta-title">Ready to put this into practice?</p>
            <p className="gd-cta-sub">
              {jobCount ? `${jobCount} English-speaking jobs in Germany, checked so German isn’t required.` : 'English-speaking jobs in Germany, checked so German isn’t required.'}
            </p>
          </div>
          <div className="gd-cta-actions">
            <Link href="/jobs" data-variant="primary">Browse jobs <ArrowRight size={16} /></Link>
            <Link href="/alerts">Get job alerts</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
