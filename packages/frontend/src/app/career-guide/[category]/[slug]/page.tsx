import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchArticleBySlug, fetchArticlesByCategory, SITE_URL } from '@/lib/serverApi';
import { careerCategoryLabel } from '@/data/careerGuide';
import { renderArticle } from '@/lib/markdown';
import { brandTitle } from '@/lib/seoTitle';
import JsonLd, { breadcrumbJsonLd } from '@/components/seo/JsonLd';
import ReadingProgress from '@/components/ReadingProgress';
import ArticleShare from '@/components/ArticleShare';
import ArticleCta from '@/components/ArticleCta';
import { alternatesFor } from '@/lib/seoAlternates';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ category: string; slug: string }> };

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// A jobs-search keyword per guide category, so the sidebar can deep-link into
// /jobs with the search filter pre-filled (Dashboard reads ?search=).
const JOB_SEARCH_BY_CATEGORY: Record<string, string> = {
  'finding-jobs': 'english speaking',
  companies: 'english speaking',
  'visas-immigration': 'visa sponsorship',
  'salaries-careers': 'senior',
  'students-graduates': 'internship',
  'living-in-germany': 'english speaking',
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchArticleBySlug(slug);
  if (!article) return { title: 'Article not found' };
  // Just the article title — the layout template appends the brand. The old
  // "— Germany Career Guide" suffix pushed every title past Google's ~60-char
  // SERP cutoff and duplicated the brand.
  const title = brandTitle(article.title);
  const description =
    article.description ||
    `${article.title} — a practical guide for English speakers working in Germany.`;
  return {
    title,
    description,
    alternates: alternatesFor(`/career-guide/${article.category}/${slug}`),
    openGraph: { title: article.title, description, type: 'article' },
  };
}

export default async function CareerGuideArticle({ params }: Params) {
  const { category, slug } = await params;
  const article = await fetchArticleBySlug(slug);
  if (!article) notFound();
  // Canonicalise category, matching the backend's 301 behaviour.
  if (article.category !== category) redirect(`/career-guide/${article.category}/${slug}`);

  const label = careerCategoryLabel(article.category);
  const { html, readingMinutes } = renderArticle(article.content, article.title);
  const pageUrl = `${SITE_URL}/career-guide/${article.category}/${slug}`;

  const related = (await fetchArticlesByCategory(article.category))
    .filter((a) => a.slug !== article.slug)
    .slice(0, 3);

  const jobSearch = JOB_SEARCH_BY_CATEGORY[article.category] || 'english speaking';
  const jobsHref = `/jobs?search=${encodeURIComponent(jobSearch)}`;

  const relatedGrid = (
    <div className="article-related__grid">
      {related.map((a) => (
        <Link key={a._id} href={`/career-guide/${a.category}/${a.slug}`} className="article-card">
          <span className="article-card__badge">{label}</span>
          <span className="article-card__title">{a.title}</span>
          {a.description && <span className="article-card__desc">{a.description}</span>}
          <span className="article-card__more">Read guide →</span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <ReadingProgress />

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Career Guide', url: `${SITE_URL}/career-guide` },
          { name: label, url: `${SITE_URL}/career-guide/${article.category}` },
          { name: article.title, url: pageUrl },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: article.description || undefined,
          author: { '@type': 'Organization', name: article.author || 'English Jobs Germany' },
          publisher: {
            '@type': 'Organization',
            name: 'English Jobs Germany',
            logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.jpeg` },
          },
          datePublished: article.publishedAt || undefined,
          dateModified: article.updatedAt || article.publishedAt || undefined,
          mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
        }}
      />

      <div className="article-shell">
        <article className="article-main">
          <nav aria-label="Breadcrumb" className="article-crumbs">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/career-guide">Career Guide</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/career-guide/${article.category}`}>{label}</Link>
          </nav>

          <header className="article-head">
            <Link href={`/career-guide/${article.category}`} className="article-eyebrow">{label}</Link>
            <h1 className="article-title">{article.title}</h1>
            <p className="article-meta">
              {article.publishedAt && <><time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time><span aria-hidden="true"> · </span></>}
              <span>{readingMinutes} min read</span>
              <span aria-hidden="true"> · </span>
              <span>By {article.author || 'English Jobs Germany'}</span>
            </p>
          </header>

          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <ArticleCta />

          {/* Below 1024px the right sidebar is hidden, so share + related guides
              fold into this footer block (hidden on desktop). */}
          <div className="article-foot">
            <ArticleShare url={pageUrl} title={article.title} />
            {related.length > 0 && (
              <section className="article-related" aria-labelledby="related-heading">
                <h2 id="related-heading" className="article-related__title">More from {label}</h2>
                {relatedGrid}
              </section>
            )}
          </div>
        </article>

        <aside className="article-aside" aria-label="Article extras">
          <div className="side-sticky">
            <Link href={`/career-guide/${article.category}`} className="side-badge">{label}</Link>

            <div className="side-card">
              <p className="side-card__title">Related jobs</p>
              <p className="side-card__body">
                See English-speaking roles matching {label.toLowerCase()} — no German required.
              </p>
              <Link href={jobsHref} className="side-card__link">See matching jobs →</Link>
            </div>

            <div className="side-card">
              <p className="side-card__title">Share</p>
              <ArticleShare url={pageUrl} title={article.title} />
            </div>

            {related.length > 0 && (
              <div className="side-card">
                <p className="side-card__title">More guides</p>
                <ul className="side-guides">
                  {related.map((a) => (
                    <li key={a._id}>
                      <Link href={`/career-guide/${a.category}/${a.slug}`}>{a.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
