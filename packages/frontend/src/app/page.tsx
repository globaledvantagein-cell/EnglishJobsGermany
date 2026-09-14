import type { Metadata } from 'next';
import Home from '@/page-components/Home';
import { fetchBaitJobs, fetchDirectory, fetchPublishedArticles, fetchJobs } from '@/lib/serverApi';
import { estimateReadingMinutes } from '@/lib/markdown';
import { CATEGORIES } from '@/utils/categorize';
import { alternatesFor } from '@/lib/seoAlternates';

// Counts are rounded DOWN to a "…+" figure so the copy stays honest as the
// numbers drift between revalidations and never overstates what we have.
const roundDown = (n: number, step: number) => Math.max(step, Math.floor(n / step) * step);

// The whole homepage — hero, latest-jobs grid, company logos, career-guide
// preview, and city/category link grid — is server-rendered and cached/
// revalidated every 30 min (ISR), so all of it appears in the initial HTML as
// crawlable links (Googlebot doesn't run useEffect).
export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  // Both requests are the same ones the page body makes on the same ISR
  // window, so they are cache hits rather than extra API calls.
  const [jobStats, companies] = await Promise.all([
    fetchJobs({ limit: 1, revalidate: 1800 }),
    fetchDirectory(1800),
  ]);
  // With the API unreachable both counts are 0; fall back to countless copy
  // rather than asserting a floor figure we can't stand behind.
  const haveCounts = jobStats.totalJobs > 0 && companies.length > 0;
  const jobCount = roundDown(jobStats.totalJobs, 1000).toLocaleString('en-US');
  const companyCount = roundDown(companies.length, 100).toLocaleString('en-US');

  return {
    // Absolute: this already reads as the brand, so the layout's
    // "— English Jobs Germany" template would only push it past Google's
    // ~60-char SERP cutoff and repeat the words.
    title: { absolute: 'English Jobs in Germany — No German Required' },
    description: haveCounts
      ? `Find English-speaking jobs in Germany. ${jobCount}+ verified positions at ${companyCount}+ companies in Berlin, Munich, Hamburg, Frankfurt. Every listing checked — no German required.`
      : 'Find English-speaking jobs in Germany. Verified positions in Berlin, Munich, Hamburg and Frankfurt. Every listing checked — no German required.',
    alternates: alternatesFor('/'),
  };
}

export default async function HomePage() {
  // Parallel server fetches, all on the same 30-min ISR window as the page.
  const [initialJobs, allCompanies, allArticles, jobStats] = await Promise.all([
    fetchBaitJobs(1800),
    fetchDirectory(1800),
    fetchPublishedArticles(1800),
    fetchJobs({ limit: 1, revalidate: 1800 }), // cheap total-count query
  ]);

  // 3 most-recent articles, reduced to a small serializable shape (reading time
  // computed on the server so the markdown util stays out of the client bundle).
  const articles = [...allArticles]
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 3)
    .map(a => ({
      title: a.title,
      slug: a.slug,
      category: a.category,
      readingMinutes: estimateReadingMinutes(a.content),
    }));

  const haveCounts = jobStats.totalJobs > 0 && allCompanies.length > 0;
  const jobCount = roundDown(jobStats.totalJobs, 1000).toLocaleString('en-US');
  const companyCount = roundDown(allCompanies.length, 100).toLocaleString('en-US');
  // "…and N more categories" after the four named below.
  const otherCategoryCount = Math.max(0, CATEGORIES.length - 4);

  // The page's single <h1>, rendered by this server component and handed to
  // <Home> as a slot. It leads with the exact phrase the site competes for
  // ("English Jobs in Germany") while keeping the hero's two-line shape.
  const heading = (
    <h1
      className="lp-balance"
      style={{
        maxWidth: 880,
        margin: '0 auto',
        fontSize: 'clamp(42px, 6.4vw, 76px)',
        lineHeight: 1.0,
        letterSpacing: '-0.04em',
        fontWeight: 800,
      }}
    >
      English Jobs in Germany<br />
      <span
        style={{
          color: 'var(--primary)',
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: 'italic',
          fontWeight: 500,
          letterSpacing: '-0.02em',
        }}
      >
        German not required.
      </span>
    </h1>
  );

  // Static prose, rendered by this server component and handed to <Home> as a
  // slot. It sits below the hero in the initial HTML, so the page carries real
  // indexable text even though the landing page itself is a client component.
  const intro = (
    <section
      aria-label="About English Jobs Germany"
      style={{ padding: '0 clamp(20px, 4vw, 32px)' }}
    >
      <p
        style={{
          maxWidth: 760,
          margin: '0 auto',
          color: 'var(--text-secondary)',
          fontSize: 16,
          lineHeight: 1.75,
        }}
      >
        English Jobs Germany is the largest curated board for English-speaking jobs in
        Germany. Whether you&rsquo;re looking for jobs in Germany for English speakers or
        want to work in Germany without speaking German, every listing here has been
        AI-verified — no German required. Browse{' '}
        {haveCounts ? `${jobCount}+ positions at ${companyCount}+ companies` : 'verified positions'}{' '}
        across software engineering, sales, marketing, data, and {otherCategoryCount} more
        categories.
      </p>
      <p
        style={{
          maxWidth: 760,
          margin: '14px auto 0',
          color: 'var(--text-secondary)',
          fontSize: 16,
          lineHeight: 1.75,
        }}
      >
        Most roles are in Berlin, Munich, Hamburg and Frankfurt, where international teams
        work in English as standard, but you&rsquo;ll also find English-speaking jobs in
        Cologne, Stuttgart, Dresden and across the rest of Germany — plus remote positions
        open to candidates already living in the country.
      </p>
    </section>
  );

  return (
    <Home
      initialJobs={initialJobs}
      initialCompanies={allCompanies.slice(0, 12)}
      companyCount={allCompanies.length}
      articles={articles}
      totalJobCount={jobStats.totalJobs}
      heading={heading}
      intro={intro}
    />
  );
}
