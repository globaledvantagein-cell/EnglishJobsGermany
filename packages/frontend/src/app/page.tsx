import type { Metadata } from 'next';
import Home from '@/page-components/Home';
import { fetchBaitJobs, fetchDirectory, fetchPublishedArticles, fetchJobs, fetchCategoryCounts } from '@/lib/serverApi';
import { estimateReadingMinutes } from '@/lib/markdown';
import { CATEGORIES } from '@/utils/categorize';
import { findCityBySlug } from '@/data/cities';
import { alternatesFor } from '@/lib/seoAlternates';

// Counts are rounded DOWN to a "…+" figure so the copy stays honest as the
// numbers drift between revalidations and never overstates what we have.
const roundDown = (n: number, step: number) => Math.max(step, Math.floor(n / step) * step);

// Cities in the "where the jobs are" card, largest first.
const ABOUT_CITIES = ['berlin', 'munich', 'hamburg', 'frankfurt', 'cologne', 'stuttgart'];

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
  const jobCount = roundDown(jobStats.totalJobs, 100).toLocaleString('en-US');
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
  const [initialJobs, allCompanies, allArticles, jobStats, categoryCounts] = await Promise.all([
    fetchBaitJobs(1800),
    fetchDirectory(1800),
    fetchPublishedArticles(1800),
    fetchJobs({ limit: 1, revalidate: 1800 }), // cheap total-count query
    fetchCategoryCounts(1800),
  ]);
  const cityCounts = await Promise.all(
    ABOUT_CITIES.map(async slug => ({
      slug,
      label: findCityBySlug(slug)?.label ?? slug,
      total: (await fetchJobs({ search: slug, limit: 1, revalidate: 1800 })).totalJobs,
    })),
  );
  const maxCityCount = Math.max(1, ...cityCounts.map(c => c.total));

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
  const jobCount = roundDown(jobStats.totalJobs, 100).toLocaleString('en-US');
  const companyCount = roundDown(allCompanies.length, 100).toLocaleString('en-US');
  // "…and N more categories" after the four named below.
  const otherCategoryCount = Math.max(0, CATEGORIES.length - 4);

  // The page's single <h1>, rendered by this server component and handed to
  // <Home> as a slot. It leads with the exact phrase the site competes for
  // ("English Jobs in Germany") while keeping the hero's two-line shape.
  // Slots get a stable key: React 19's dev check otherwise flags a
  // server-created element rendered among a client component's children.
  const heading = (
    <h1
      key="home-heading"
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
      English Jobs in Germany<br key="break" />
      <span
        key="accent"
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
  // "Why us" section, modelled on Wellfound's "Find work that matters" block
  // (studied with REA): heading + one short line + actions on the left, a live
  // data card on the right, four numbered points underneath. Server-rendered
  // so every word and link is in the crawlable HTML.
  const points = [
    { title: 'Screened for language', copy: 'We check the full job ad, so a German requirement can’t hide in the small print.' },
    { title: 'Straight from employers', copy: 'Jobs come from company career pages, and you apply on the company’s own site.' },
    { title: 'Updated every day', copy: haveCounts ? `New roles land daily from ${companyCount}+ companies across Germany.` : 'New roles land daily from companies across Germany.' },
    { title: 'Help with the move', copy: 'Our career guide covers visas, salaries and settling in once you get the offer.', href: '/career-guide' },
  ];
  const intro = (
    <section key="home-intro" aria-labelledby="home-about" className="lp-about">
      <div key="inner" className="lp-about-inner">
        <div className="lp-about-top">
          <div className="lp-about-copy">
            <span className="lp-about-eyebrow">Why English Jobs Germany</span>
            <h2 id="home-about" className="lp-about-title">
              Work in Germany, <em>no German needed.</em>
            </h2>
            <p className="lp-about-lead">
              We collect English-speaking jobs in Germany from company career pages and check every
              ad for language requirements. You only see roles you can apply for in English
              {haveCounts ? <>: <strong>{jobCount}+ of them</strong>, in software, sales, marketing, data and {otherCategoryCount} more fields.</> : '.'}
            </p>
            <div className="lp-about-actions">
              <a href="/jobs" className="lp-about-btn" data-variant="primary">Browse all jobs</a>
              <a href="/remote-jobs" className="lp-about-btn">Remote jobs</a>
            </div>
          </div>

          <div className="lp-about-card" aria-label="English-speaking jobs by city">
            <div className="lp-about-card-head">
              <span>Where the jobs are</span>
              <span className="lp-about-live"><i aria-hidden="true" /> Live counts</span>
            </div>
            <ul>
              {cityCounts.map(c => (
                <li key={c.slug}>
                  <a href={`/city/${c.slug}`}>
                    <span className="lp-about-city">{c.label}</span>
                    <span className="lp-about-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(4, Math.round((c.total / maxCityCount) * 100))}%` }} />
                    </span>
                    <span className="lp-about-count">{c.total > 0 ? c.total.toLocaleString('en-US') : '—'}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="lp-about-card-foot">Plus Düsseldorf, Leipzig, Dresden and other cities.</p>
          </div>
        </div>

        <ol className="lp-about-points">
          {points.map((point, i) => (
            <li key={point.title}>
              <span className="lp-about-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{point.href ? <a href={point.href}>{point.title}</a> : point.title}</h3>
                <p>{point.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );

  // Visible FAQ + matching FAQPage JSON-LD. Plain server HTML (<details> keeps
  // the answers in the DOM while collapsed) so crawlers and AI answer engines
  // can quote it. Answers only state what the product actually does.
  const faqs: { q: string; a: string; links?: { href: string; label: string }[] }[] = [
    {
      q: 'Can I get a job in Germany without speaking German?',
      a: `Yes. Many international companies in Germany — especially in tech, startups and multinationals — use English as their working language. ${haveCounts ? `English Jobs Germany currently lists ${jobCount}+ such roles at ${companyCount}+ companies.` : 'English Jobs Germany lists only roles of this kind.'}`,
    },
    {
      q: 'How do you know a job doesn’t require German?',
      a: 'Every listing’s full description is screened for language requirements. Roles that ask for fluent or business-level German are filtered out, so the board only shows jobs where English is the working language.',
    },
    {
      q: 'Is English Jobs Germany free?',
      a: 'Yes. Searching, job alerts and applying are free. You need a free account to apply, which also unlocks daily job matches based on your CV.',
    },
    {
      q: 'Which German cities have the most English-speaking jobs?',
      a: 'Berlin has the most, followed by Munich, Hamburg and Frankfurt. You will also find English-speaking roles in Cologne, Stuttgart, Düsseldorf and other cities.',
      links: [
        { href: '/city/berlin', label: 'Berlin' }, { href: '/city/munich', label: 'Munich' },
        { href: '/city/hamburg', label: 'Hamburg' }, { href: '/city/frankfurt', label: 'Frankfurt' },
      ],
    },
    {
      q: 'Do companies offer visa sponsorship?',
      a: 'Some do. Use the “Visa sponsorship” filter on the jobs page to see roles that mention sponsorship or relocation support, and check each listing for details. Non-EU candidates usually need a work permit such as the EU Blue Card.',
      links: [{ href: '/jobs?visa=1', label: 'Jobs with visa sponsorship' }],
    },
    {
      q: 'How often are new jobs added?',
      a: 'Every day. Listings are collected directly from company career pages and applicant tracking systems, so you apply on the employer’s own site.',
    },
  ];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  // FAQ layout after Vercel's pricing FAQ (studied with REA): heading + help
  // card in a sticky left column, numbered questions on the right, the first
  // answer open. Every answer stays in the server HTML for crawlers and AI
  // answer engines, alongside the FAQPage JSON-LD.
  const faq = (
    <section key="home-faq" aria-labelledby="home-faq" className="lp-faq">
      <script key="ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div key="inner" className="lp-faq-inner">
        <div className="lp-faq-side">
          <span className="lp-faq-eyebrow">FAQ</span>
          <h2 id="home-faq">Frequently asked questions</h2>
          <p className="lp-faq-sub">
            What people ask most about finding an English-speaking job in Germany.
          </p>
          <div className="lp-faq-help">
            <p className="lp-faq-help-title">Still have a question?</p>
            <p className="lp-faq-help-copy">Our career guide covers visas, salaries and moving. Or write to us and a person will reply.</p>
            {articles.length > 0 && (
              <ul className="lp-faq-guides">
                {articles.map(a => (
                  <li key={a.slug}>
                    <a href={`/career-guide/${a.category}/${a.slug}`}>
                      <span>{a.title}</span>
                      <small>{a.readingMinutes} min read</small>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="lp-faq-help-actions">
              <a href="/career-guide" className="lp-faq-btn" data-variant="primary">Read the career guide</a>
              <a href="mailto:support@englishjobsgermany.com" className="lp-faq-btn">Email us</a>
            </div>
          </div>
        </div>

        <ol className="lp-faq-list">
          {faqs.map((f, i) => (
            <li key={f.q}>
              <details open={i === 0} name="home-faq">
                <summary>
                  <span className="lp-faq-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="lp-faq-q">{f.q}</span>
                </summary>
                <div className="lp-faq-a">
                  <p>{f.a}</p>
                  {f.links && (
                    <p className="lp-faq-links">
                      {f.links.map(l => <a key={l.href} href={l.href}>{l.label} →</a>)}
                    </p>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>
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
      faq={faq}
      categoryCounts={categoryCounts}
    />
  );
}
