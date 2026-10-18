import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { CATEGORY_ORDER, CATEGORY_SLUGS, categoryFromSlug } from '@/utils/categorize';
import { fetchCategoryCounts, fetchFilterCounts, fetchJobs, SITE_URL } from '@/lib/serverApi';
import { findCityBySlug } from '@/data/cities';
import SeoJobCard from '@/components/seo/SeoJobCard';
import CompanyLogo from '@/components/CompanyLogo';
import FieldsDrawer from '@/components/seo/FieldsDrawer';
import JsonLd, { itemListJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { brandTitle } from '@/lib/seoTitle';
import { alternatesFor } from '@/lib/seoAlternates';
import '@/components/seo/listing.css';

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

// Cities counted in the sidebar — each has a /city page to link to.
const SIDEBAR_CITIES = ['berlin', 'munich', 'hamburg', 'frankfurt', 'cologne', 'stuttgart', 'dusseldorf', 'leipzig'];
const VISIBLE_JOBS = 30;
const FIRST_JOBS = 12; // shown open; the rest of VISIBLE_JOBS fold under "Show more"

type Params = { params: Promise<{ category: string }> };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "A, B and C" */
const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

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

  const [{ jobs, totalJobs }, facets, categoryCounts, cityTotals] = await Promise.all([
    fetchJobs({ category, limit: 100, revalidate: 3600 }),
    fetchFilterCounts({ category, revalidate: 3600 }),
    fetchCategoryCounts(3600),
    // Same "search by city" query the /city pages use, so the numbers agree.
    Promise.all(SIDEBAR_CITIES.map(async (citySlug) => ({
      slug: citySlug,
      label: findCityBySlug(citySlug)?.label ?? citySlug,
      total: (await fetchJobs({ category, search: citySlug, limit: 1, revalidate: 3600 })).totalJobs,
    }))),
  ]);

  const cities = cityTotals.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const maxCity = Math.max(1, ...cities.map((c) => c.total));

  // Employers ranked by how many of the listed roles they have.
  const companyCounts = new Map<string, { count: number; domain?: string }>();
  for (const job of jobs) {
    const entry = companyCounts.get(job.Company) ?? { count: 0, domain: job.companyDomain ?? undefined };
    entry.count += 1;
    companyCounts.set(job.Company, entry);
  }
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const companyNames = topCompanies.map(([name]) => name);

  const exp = facets?.experience ?? {};
  const work = facets?.workplace ?? {};
  const visa = facets?.visa.available ?? 0;
  const relocation = facets?.relocation.available ?? 0;
  const seniorPlus = (exp.senior ?? 0) + (exp.lead ?? 0) + (exp.executive ?? 0);
  const listHref = `/jobs?category=${encodeURIComponent(category)}`;

  // Quick filters — each lands on the jobs page with the filter applied.
  const chips = [
    { href: listHref, label: 'All jobs', count: totalJobs, primary: true },
    { href: `${listHref}&experience=entry`, label: 'Entry level', count: exp.entry ?? 0 },
    { href: `${listHref}&experience=senior,lead,executive`, label: 'Senior & lead', count: seniorPlus },
    { href: `${listHref}&workplace=hybrid`, label: 'Hybrid', count: work.hybrid ?? 0 },
    { href: `${listHref}&workplace=remote`, label: 'Remote', count: work.remote ?? 0 },
    { href: `${listHref}&visa=1`, label: 'Visa sponsorship', count: visa },
    { href: `${listHref}&relocation=1`, label: 'Relocation support', count: relocation },
  ].filter((chip) => chip.primary || chip.count > 0);

  // FAQ answers are built from the live counts above, so each category page
  // answers with its own facts (and AI answer engines get citable numbers).
  const faqs: { q: string; a: string }[] = [
    {
      q: `How many ${label} jobs in Germany don’t require German?`,
      a: `There are ${plural(totalJobs, `English-speaking ${label} job`, `English-speaking ${label} jobs`)} in Germany on English Jobs Germany right now${companyNames.length ? `, at employers including ${listJoin(companyNames.slice(0, 3))}` : ''}. The list is updated every day.`,
    },
    ...(cities.length > 0 ? [{
      q: `Which cities have the most English-speaking ${label} jobs?`,
      a: `${listJoin(cities.slice(0, 3).map((c) => `${c.label} (${c.total.toLocaleString('en-US')})`))} have the most open ${label} roles that don’t require German.`,
    }] : []),
    ...(facets ? [{
      q: `What experience levels are ${label} jobs open to?`,
      a: `Currently ${exp.entry ?? 0} entry-level, ${exp.mid ?? 0} mid-level and ${seniorPlus} senior, lead or executive ${label} roles are listed.`,
    }] : []),
    ...(facets && ((work.hybrid ?? 0) + (work.remote ?? 0)) > 0 ? [{
      q: `Can I work in ${label} remotely or hybrid in Germany?`,
      a: `Yes: ${work.hybrid ?? 0} of the listed ${label} roles are hybrid and ${work.remote ?? 0} are fully remote. The rest are on-site.`,
    }] : []),
    ...(facets ? [{
      q: `Do ${label} employers in Germany offer visa sponsorship?`,
      a: visa + relocation > 0
        ? `${plural(visa, 'listing mentions', 'listings mention')} visa sponsorship and ${plural(relocation, 'offers', 'offer')} relocation support. Check each job for the details.`
        : `None of the current ${label} listings mention visa sponsorship. Many roles are still open to EU citizens and people who already hold a German work permit.`,
    }] : []),
  ];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  // Every field for the drawer (catch-alls last), with live counts.
  const allFields = CATEGORY_ORDER
    .map((c) => ({ name: c, count: categoryCounts[c] ?? 0 }))
    .sort((a, b) => (Number(a.name.startsWith('Other /')) - Number(b.name.startsWith('Other /'))) || b.count - a.count);

  const title = `English ${label} Jobs in Germany`;
  // The API returns a daily-shuffled sample; show the newest of it first.
  const sorted = [...jobs]
    .sort((a, b) => (b.PostedDate ? Date.parse(b.PostedDate) : 0) - (a.PostedDate ? Date.parse(a.PostedDate) : 0))
    .slice(0, VISIBLE_JOBS);
  const shown = sorted.slice(0, FIRST_JOBS);
  const folded = sorted.slice(FIRST_JOBS);
  const drawerId = 'fields-drawer';

  return (
    <div className="page-wash" data-wash="category">
    <div className="ls">
      <JsonLd data={itemListJsonLd(title, jobs, SITE_URL)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Jobs', url: `${SITE_URL}/jobs` },
          { name: label, url: `${SITE_URL}/category/${slug}` },
        ])}
      />
      {faqs.length > 0 && <JsonLd data={faqJsonLd} />}

      <nav aria-label="Breadcrumb" className="ls-crumbs">
        <Link href="/">Home</Link>{' › '}<Link href="/jobs">Jobs</Link>{' › '}
        <span style={{ color: 'var(--text-primary)' }}>{label}</span>
      </nav>

      <header className="ls-head">
        <div className="ls-head-top">
          <div>
            <h1 className="ls-title">
              {label} Jobs in Germany — <em>No German Required</em>
            </h1>
            {/* Server-rendered intro — the page's indexable summary. */}
            <p className="ls-intro">
              <strong>{totalJobs.toLocaleString('en-US')}</strong> English-speaking {label} roles
              {companyNames.length >= 2 ? <> from {companyNames[0]}, {companyNames[1]} and more</> : null}
              {cities[0] ? <>, most of them in <Link href={`/city/${cities[0].slug}`}>{cities[0].label}</Link></> : null}.
              {' '}Every listing is checked so German is never a hard requirement.
            </p>
          </div>
          <button type="button" popoverTarget={drawerId} className="ls-drawer-btn">
            <LayoutGrid size={16} /> Browse fields
          </button>
        </div>
        <nav aria-label={`Filter ${label} jobs`} className="ls-chips">
          {chips.map((chip) => (
            <Link key={chip.label} href={chip.href} className="ls-chip" data-primary={chip.primary ? 'true' : undefined}>
              {chip.label} <span>{chip.count.toLocaleString('en-US')}</span>
            </Link>
          ))}
        </nav>
      </header>

      <FieldsDrawer
        id={drawerId}
        title="Browse jobs by field"
        fields={allFields}
        cities={cities}
        current={category}
      />

      <div className="ls-grid">
        <section aria-labelledby="ls-latest">
          <div className="ls-list-head">
            <h2 id="ls-latest">Open {label} jobs</h2>
            <p>Newest first</p>
          </div>
          {jobs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              No open {label} roles right now. Browse <Link href="/jobs" style={{ color: 'var(--primary)' }}>all jobs</Link>.
            </p>
          ) : (
            <>
              <div className="ls-list">
                {shown.map((job) => <SeoJobCard key={job._id} job={job} />)}
              </div>
              {/* The rest stay in the HTML (crawlable) but folded away. */}
              {folded.length > 0 && (
                <details className="ls-fold">
                  <summary>
                    <span className="ls-fold-more">Show {folded.length} more jobs</span>
                    <span className="ls-fold-less">Show fewer</span>
                  </summary>
                  <div className="ls-list">
                    {folded.map((job) => <SeoJobCard key={job._id} job={job} />)}
                  </div>
                </details>
              )}
              {totalJobs > sorted.length && (
                <Link href={listHref} className="ls-more">
                  View all {totalJobs.toLocaleString('en-US')} jobs with filters <ArrowRight size={17} />
                </Link>
              )}
            </>
          )}
        </section>

        {/* One sidebar card, three CSS-only tabs (radio inputs): every panel is
            in the HTML, only one is shown at a time. */}
        <aside className="ls-aside">
          <div className="ls-card ls-tabs">
            <input type="radio" name="ls-tab" id="ls-tab-cities" className="ls-tab-input" defaultChecked />
            <input type="radio" name="ls-tab" id="ls-tab-companies" className="ls-tab-input" />
            <input type="radio" name="ls-tab" id="ls-tab-faq" className="ls-tab-input" />
            <div className="ls-tab-labels" role="presentation">
              <label htmlFor="ls-tab-cities">Cities</label>
              <label htmlFor="ls-tab-companies">Companies</label>
              <label htmlFor="ls-tab-faq">FAQ</label>
            </div>

            <section className="ls-tab-panel" data-tab="cities" aria-label={`${label} jobs by city`}>
              <ul className="ls-rows">
                {cities.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/city/${c.slug}`}>
                      <span>{c.label}</span>
                      <span className="ls-bar" aria-hidden="true"><span style={{ width: `${Math.max(6, Math.round((c.total / maxCity) * 100))}%` }} /></span>
                      <span className="ls-count">{c.total.toLocaleString('en-US')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="ls-tab-panel" data-tab="companies" aria-label="Companies hiring">
              <ul className="ls-rows">
                {topCompanies.map(([name, info]) => (
                  <li key={name}>
                    <Link href={`/jobs?company=${encodeURIComponent(name)}`} data-nobar="true">
                      <span className="ls-company">
                        <CompanyLogo companyName={name} domain={info.domain} size={24} />
                        <span>{name}</span>
                      </span>
                      <span className="ls-count">{info.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="ls-tab-panel" data-tab="faq" aria-labelledby="ls-faq">
              <h2 id="ls-faq" className="ls-sr">{label} jobs in Germany: common questions</h2>
              <div className="ls-mini-faq">
                {faqs.map((f, i) => (
                  <details key={f.q} open={i === 0} name="ls-faq">
                    <summary>{f.q}</summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
    </div>
  );
}
