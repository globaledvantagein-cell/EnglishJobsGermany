import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchArticlesByCategory, SITE_URL } from '@/lib/serverApi';
import { CAREER_GUIDE_CATEGORIES, careerCategoryLabel } from '@/data/careerGuide';
import { estimateReadingMinutes } from '@/lib/markdown';
import JsonLd, { breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { brandTitle } from '@/lib/seoTitle';
import { alternatesFor } from '@/lib/seoAlternates';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ category: string }> };

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
  const articles = await fetchArticlesByCategory(category);

  return (
    <div className="guide-hub">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Career Guide', url: `${SITE_URL}/career-guide` },
          { name: label, url: `${SITE_URL}/career-guide/${category}` },
        ])}
      />

      <nav aria-label="Breadcrumb" className="article-crumbs">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/career-guide">Career Guide</Link>
        <span aria-hidden="true">/</span>
        <span style={{ color: 'var(--text-primary)' }}>{label}</span>
      </nav>

      <header className="guide-hero">
        <span className="guide-hero__eyebrow">Career Guide</span>
        <h1 className="guide-hero__title">{label}</h1>
      </header>

      {articles.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          No guides in this category yet. Back to the{' '}
          <Link href="/career-guide" style={{ color: 'var(--acid)' }}>career guide</Link>.
        </p>
      ) : (
        <div className="guide-article-grid">
          {articles.map((a) => (
            <Link key={a._id} href={`/career-guide/${category}/${a.slug}`} className="article-card">
              <span className="article-card__badge">{label}</span>
              <span className="article-card__title">{a.title}</span>
              {a.description && <span className="article-card__desc">{a.description}</span>}
              <span className="guide-article-card__meta">
                {a.publishedAt && <>{formatDate(a.publishedAt)}<span aria-hidden="true"> · </span></>}
                {estimateReadingMinutes(a.content)} min read
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
