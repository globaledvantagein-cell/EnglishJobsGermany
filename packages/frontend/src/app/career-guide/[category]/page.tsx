import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { fetchArticlesByCategory, fetchJobs, fetchPublishedArticles, SITE_URL } from '@/lib/serverApi';
import { CAREER_GUIDE_CATEGORIES, careerCategoryLabel } from '@/data/careerGuide';
import { estimateReadingMinutes } from '@/lib/markdown';
import JsonLd, { breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { brandTitle } from '@/lib/seoTitle';
import { alternatesFor } from '@/lib/seoAlternates';
import ArticleCard, { type GuideArticleSummary } from '@/components/guide/ArticleCard';
import GuideTopics from '@/components/guide/GuideTopics';
import { guideTopicMeta } from '@/components/guide/guideMeta';
import '@/components/seo/listing.css';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  if (!CAREER_GUIDE_CATEGORIES.includes(category)) return { title: 'Not found' };
  const label = careerCategoryLabel(category);
  const articles = await fetchArticlesByCategory(category);
  const title = brandTitle(`${label} — Career Guide`, label);
  const description = `${articles.length} ${
    articles.length === 1 ? 'guide' : 'guides'
  } on ${label.toLowerCase()} for English speakers in Germany.`;
  return { title, description, alternates: alternatesFor(`/career-guide/${category}`) };
}

export default async function CareerGuideCategory({ params }: Params) {
  const { category } = await params;
  if (!CAREER_GUIDE_CATEGORIES.includes(category)) notFound();
  const label = careerCategoryLabel(category);
  const [articles, allArticles, jobStats] = await Promise.all([
    fetchArticlesByCategory(category),
    fetchPublishedArticles(3600),
    fetchJobs({ limit: 1, revalidate: 3600 }),
  ]);
  const counts = new Map<string, number>();
  for (const a of allArticles) counts.set(a.category, (counts.get(a.category) || 0) + 1);
  const { blurb } = guideTopicMeta(category);

  const summaries: GuideArticleSummary[] = [...articles]
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .map((a) => ({
      slug: a.slug, category: a.category, title: a.title, description: a.description,
      publishedAt: a.publishedAt, readingMinutes: estimateReadingMinutes(a.content),
    }));
  const jobCount = jobStats.totalJobs > 0 ? `${(Math.floor(jobStats.totalJobs / 100) * 100).toLocaleString('en-US')}+` : null;

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${label} — Germany Career Guide`,
    url: `${SITE_URL}/career-guide/${category}`,
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
            { name: label, url: `${SITE_URL}/career-guide/${category}` },
          ])}
        />
        <JsonLd data={collectionJsonLd} />

        <nav aria-label="Breadcrumb" className="ls-crumbs">
          <Link href="/">Home</Link>{' › '}<Link href="/career-guide">Career guide</Link>{' › '}
          <span style={{ color: 'var(--text-primary)' }}>{label}</span>
        </nav>

        <header className="gd-head">
          <span className="gd-eyebrow">Career guide</span>
          <h1 className="gd-title">{label}</h1>
          {blurb && <p className="gd-lede">{blurb}</p>}
          <ul className="gd-stats">
            <li><strong>{articles.length}</strong> {articles.length === 1 ? 'guide' : 'guides'}</li>
          </ul>
        </header>

        <GuideTopics counts={counts} current={category} />

        <section className="gd-section" aria-labelledby="topic-heading">
          <div className="gd-section-head">
            <h2 id="topic-heading">{label} guides</h2>
            <p>Newest first</p>
          </div>
          {summaries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              No guides in this topic yet. Back to the <Link href="/career-guide" style={{ color: 'var(--primary)' }}>career guide</Link>.
            </p>
          ) : (
            <div className="gd-grid">
              {summaries.map((a) => <ArticleCard key={a.slug} article={a} />)}
            </div>
          )}
        </section>

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
