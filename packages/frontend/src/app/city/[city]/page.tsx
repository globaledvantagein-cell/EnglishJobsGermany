import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findCityBySlug, CANONICAL_CITIES } from '@/data/cities';
import { cityIntro } from '@/data/cityIntros';
import { fetchCategoryCounts, fetchFilterCounts, fetchJobs, SITE_URL } from '@/lib/serverApi';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import SeoJobCard from '@/components/seo/SeoJobCard';
import CompanyLogo from '@/components/CompanyLogo';
import FieldsDrawer from '@/components/seo/FieldsDrawer';
import '@/components/seo/listing.css';
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

const VISIBLE_JOBS = 30;
const FIRST_JOBS = 12; // shown open; the rest of VISIBLE_JOBS fold under "Show more"

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const fieldLabel = (name: string) =>
  name === 'Other / General Business' ? 'General business'
  : name === 'Other / Open Application' ? 'Open applications'
  : name;

export default async function CityPage({ params }: Params) {
  const { city: slug } = await params;
  const city = findCityBySlug(slug);
  if (!city) notFound();

  const [{ jobs, totalJobs }, facets, nationalCounts] = await Promise.all([
    fetchJobs({ search: city.slug, limit: 100, revalidate: 3600 }),
    fetchFilterCounts({ search: city.slug, revalidate: 3600 }),
    fetchCategoryCounts(3600),
  ]);

  const topCompanyNames = topEmployers(jobs, 3);
  const introParagraphs = cityIntro(city.slug, city.label, totalJobs, topCompanyNames);

  // Employers ranked by how many of the listed roles they have.
  const companyCounts = new Map<string, { count: number; domain?: string }>();
  for (const job of jobs) {
    const entry = companyCounts.get(job.Company) ?? { count: 0, domain: job.companyDomain ?? undefined };
    entry.count += 1;
    companyCounts.set(job.Company, entry);
  }
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);

  // Fields hiring in this city (live facet counts), catch-alls last.
  const cityFields = Object.entries(facets?.category ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => (Number(a.startsWith('Other /')) - Number(b.startsWith('Other /'))) || y - x);
  const maxField = Math.max(1, ...cityFields.map(([, n]) => n));
  const topFields = cityFields.filter(([name]) => !name.startsWith('Other /')).slice(0, 3);

  const exp = facets?.experience ?? {};
  const work = facets?.workplace ?? {};
  const visa = facets?.visa.available ?? 0;
  const relocation = facets?.relocation.available ?? 0;
  const seniorPlus = (exp.senior ?? 0) + (exp.lead ?? 0) + (exp.executive ?? 0);
  const listHref = `/jobs?search=${encodeURIComponent(city.slug)}`;

  const chips = [
    { href: listHref, label: 'All jobs', count: totalJobs, primary: true },
    { href: `${listHref}&experience=entry`, label: 'Entry level', count: exp.entry ?? 0 },
    { href: `${listHref}&experience=senior,lead,executive`, label: 'Senior & lead', count: seniorPlus },
    { href: `${listHref}&workplace=hybrid`, label: 'Hybrid', count: work.hybrid ?? 0 },
    { href: `${listHref}&workplace=remote`, label: 'Remote', count: work.remote ?? 0 },
    { href: `${listHref}&visa=1`, label: 'Visa sponsorship', count: visa },
    { href: `${listHref}&relocation=1`, label: 'Relocation support', count: relocation },
  ].filter((chip) => chip.primary || chip.count > 0);

  // FAQ answers come from the live counts, so every city answers with its own facts.
  const faqs: { q: string; a: string }[] = [
    {
      q: `How many English-speaking jobs are there in ${city.label}?`,
      a: `There are ${plural(totalJobs, 'English-speaking job', 'English-speaking jobs')} in ${city.label} on English Jobs Germany right now${topCompanyNames.length ? `, at employers including ${listJoin(topCompanyNames)}` : ''}. None of them require German.`,
    },
    ...(topFields.length ? [{
      q: `Which fields hire the most English speakers in ${city.label}?`,
      a: `${listJoin(topFields.map(([name, n]) => `${name} (${n.toLocaleString('en-US')})`))} have the most open roles in ${city.label}.`,
    }] : []),
    ...(facets ? [{
      q: `What experience levels are ${city.label} jobs open to?`,
      a: `Currently ${exp.entry ?? 0} entry-level, ${exp.mid ?? 0} mid-level and ${seniorPlus} senior, lead or executive roles are listed in ${city.label}.`,
    }] : []),
    ...(facets && (work.hybrid ?? 0) + (work.remote ?? 0) > 0 ? [{
      q: `Can I work hybrid or remotely in ${city.label}?`,
      a: `Yes: ${work.hybrid ?? 0} of the listed roles in ${city.label} are hybrid and ${work.remote ?? 0} are fully remote. The rest are on-site.`,
    }] : []),
    ...(facets ? [{
      q: `Do employers in ${city.label} offer visa sponsorship?`,
      a: visa + relocation > 0
        ? `${plural(visa, 'listing mentions', 'listings mention')} visa sponsorship and ${plural(relocation, 'offers', 'offer')} relocation support. Check each job for the details.`
        : `None of the current listings in ${city.label} mention visa sponsorship. Many roles are still open to EU citizens and people who already hold a German work permit.`,
    }] : []),
  ];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  const allFields = Object.entries(nationalCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (Number(a.name.startsWith('Other /')) - Number(b.name.startsWith('Other /'))) || b.count - a.count);
  const drawerCities = CANONICAL_CITIES.map((c) => ({ slug: c.slug, label: c.label }));

  const title = `English Jobs in ${city.label} — No German Required`;
  // The API returns a daily-shuffled sample; show the newest of it first.
  const sorted = [...jobs]
    .sort((a, b) => (b.PostedDate ? Date.parse(b.PostedDate) : 0) - (a.PostedDate ? Date.parse(a.PostedDate) : 0))
    .slice(0, VISIBLE_JOBS);
  const shown = sorted.slice(0, FIRST_JOBS);
  const folded = sorted.slice(FIRST_JOBS);
  const drawerId = 'city-drawer';

  return (
    <div className="page-wash" data-wash="city">
    <div className="ls">
      <JsonLd data={itemListJsonLd(title, jobs, SITE_URL)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Jobs', url: `${SITE_URL}/jobs` },
          { name: city.label, url: `${SITE_URL}/city/${city.slug}` },
        ])}
      />
      {faqs.length > 0 && <JsonLd data={faqJsonLd} />}

      <nav aria-label="Breadcrumb" className="ls-crumbs">
        <Link href="/">Home</Link>{' › '}<Link href="/jobs">Jobs</Link>{' › '}
        <span style={{ color: 'var(--text-primary)' }}>{city.label}</span>
      </nav>

      <header className="ls-head">
        <div className="ls-head-top">
          <div>
            <h1 className="ls-title">
              English-Speaking Jobs in {city.label}, <em>Germany</em>
            </h1>
            <p className="ls-intro">
              <strong>{totalJobs.toLocaleString('en-US')}</strong> roles in {city.label} where German isn’t required
              {topFields.length ? <>, mostly in {listJoin(topFields.map(([name]) => name))}</> : null}
              {topCompanyNames.length ? <>. Hiring now: {listJoin(topCompanyNames)}</> : null}.
            </p>
          </div>
          <button type="button" popoverTarget={drawerId} className="ls-drawer-btn">
            <LayoutGrid size={16} /> Browse cities & fields
          </button>
        </div>
        <nav aria-label={`Filter jobs in ${city.label}`} className="ls-chips">
          {chips.map((chip) => (
            <Link key={chip.label} href={chip.href} className="ls-chip" data-primary={chip.primary ? 'true' : undefined}>
              {chip.label} <span>{chip.count.toLocaleString('en-US')}</span>
            </Link>
          ))}
        </nav>
      </header>

      <FieldsDrawer
        id={drawerId}
        title="Browse by city or field"
        fields={allFields}
        cities={drawerCities}
        currentCity={city.slug}
        citiesFirst
      />

      <div className="ls-grid">
        <section aria-labelledby="ls-latest">
          <div className="ls-list-head">
            <h2 id="ls-latest">Open jobs in {city.label}</h2>
            <p>Newest first</p>
          </div>
          {jobs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              No open roles in {city.label} right now. Check back soon or browse{' '}
              <Link href="/jobs" style={{ color: 'var(--primary)' }}>all jobs</Link>.
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

        {/* One sidebar card, four CSS-only tabs: every panel is in the HTML. */}
        <aside className="ls-aside">
          <div className="ls-card ls-tabs">
            <input type="radio" name="ls-tab" id="ls-tab-fields" className="ls-tab-input" defaultChecked />
            <input type="radio" name="ls-tab" id="ls-tab-companies" className="ls-tab-input" />
            <input type="radio" name="ls-tab" id="ls-tab-about" className="ls-tab-input" />
            <input type="radio" name="ls-tab" id="ls-tab-faq" className="ls-tab-input" />
            <div className="ls-tab-labels" role="presentation">
              <label htmlFor="ls-tab-fields">Fields</label>
              <label htmlFor="ls-tab-companies">Companies</label>
              <label htmlFor="ls-tab-about">About</label>
              <label htmlFor="ls-tab-faq">FAQ</label>
            </div>

            <section className="ls-tab-panel" aria-label={`Fields hiring in ${city.label}`}>
              <ul className="ls-rows">
                {cityFields.slice(0, 10).map(([name, n]) => (
                  <li key={name}>
                    <Link href={`${listHref}&category=${encodeURIComponent(name)}`}>
                      <span>{fieldLabel(name)}</span>
                      <span className="ls-bar" aria-hidden="true"><span style={{ width: `${Math.max(6, Math.round((n / maxField) * 100))}%` }} /></span>
                      <span className="ls-count">{n.toLocaleString('en-US')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="ls-tab-panel" aria-label={`Companies hiring in ${city.label}`}>
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

            {/* Unique, server-rendered prose per city — the page's long-form text. */}
            <section className="ls-tab-panel ls-prose" aria-labelledby="ls-about">
              <h2 id="ls-about" className="ls-sr">Working in {city.label} without German</h2>
              {introParagraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            </section>

            <section className="ls-tab-panel" aria-labelledby="ls-faq">
              <h2 id="ls-faq" className="ls-sr">Jobs in {city.label}: common questions</h2>
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
