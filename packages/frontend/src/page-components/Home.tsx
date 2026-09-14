'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@/compat/router';
import type { IJob, ICompany } from '../types';
import { HOME_CATEGORIES, categorySlug } from '../utils/categorize';
import CohortWaitlistModal from '../components/CohortWaitlistModal';
import CompanyLogo from '../components/CompanyLogo';

// ─────────────────────────────────────────────────────────────────────────────
// Landing page — 1:1 port of the "Job Portal Landing" Claude Design file.
// All wording is verbatim from the design. Colors map to theme variables so
// dark mode stays readable:
//   #fbfaf7 → --bg-base · #ffffff → --bg-surface · #f4f2ec → --bg-surface-2
//   #12141a → --text-primary · #5b616a/#666c76/#4a4f57 → --text-secondary
//   #868b91/#9a9e9f/#6b7076 → --text-muted · #e3e3dc → --border
//   #d4d5cd → --border-strong · #246cf0 → --primary · #1758ca → --primary-hover
//   #edf4ff → --primary-soft
// The dark "Why us" / CTA bands use the inverted --ink/--paper pair.
// The app's global nav and Footer render around this page (Layout.tsx), so the
// design's header/footer are not duplicated here.
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_X = 'clamp(20px, 4vw, 32px)';

const eyebrowStyle: CSSProperties = {
  fontSize: 12, fontWeight: 850, textTransform: 'uppercase',
  letterSpacing: '0.12em', color: 'var(--primary)',
};

// Design copy — verbatim, do not edit.
const STATS = [
  { n: '25,000+', label: 'Jobs reviewed' },
  { n: '2,500+', label: 'Curated jobs' },
  { n: '200+', label: 'Hiring companies' },
  { n: 'Daily', label: 'New job updates' },
] as const;

const STEPS = [
  { n: '1', title: 'Search & filter', copy: 'Browse roles pre-screened for English-only requirements, by city, remote or field.' },
  { n: '2', title: 'Apply direct', copy: 'Apply straight to the employer or recruiter — no extra accounts required.' },
  { n: '3', title: 'Get hired', copy: 'Use our visa and relocation guides while you interview and negotiate your offer.' },
] as const;

const WHY_US = [
  { title: 'Human-screened, not scraped', copy: 'Every listing is checked to confirm German fluency isn’t a hard requirement — not just keyword-filtered.' },
  { title: 'Direct to the employer', copy: 'Apply straight to the company or recruiter behind each role, no forwarding through third parties.' },
  { title: 'Updated daily', copy: 'New roles are added every day, so listings stay current instead of going stale.' },
  { title: 'Built for relocation', copy: 'Visa and relocation guidance sits alongside the jobs, not in a separate resource you have to hunt for.' },
] as const;

const COACHING_FEATURES = [
  'Weekly live cohort sessions with a dedicated coach',
  'CV and LinkedIn rework tailored to the German market',
  'Mock interviews with feedback from hiring managers',
  'Private community of job seekers going through the same search',
] as const;

const COHORT_DETAILS = [
  { label: 'Starts', value: 'Sept 15, 2026' },
  { label: 'Duration', value: '6 weeks' },
  { label: 'Format', value: 'Live online + community' },
  { label: 'Seats', value: '20 per cohort' },
] as const;

// The 12 highest-volume categories, linked to their /category/<slug> pages.
// All 28 would swamp the grid; the full set is on the jobs page filter.
// Copy is per-category — the cards used to be hand-written groupings that no
// longer map onto the backend's categories.
const CATEGORY_COPY: Record<string, string> = {
  'Software Engineering':       'Development, cloud, platform and infrastructure roles.',
  'Sales':                      'Account executive, business development and revenue roles.',
  'Operations & Strategy':      'Business operations, programme management and strategy.',
  'Marketing & Growth':         'Brand, growth, content and demand generation.',
  'Finance & Accounting':       'Controlling, FP&A, accounting and treasury.',
  'Customer Success & Support': 'Onboarding, account management and customer support.',
  'Data & Analytics':           'Analytics, data engineering, BI and data science.',
  'Product Management':         'Product strategy, discovery and delivery.',
  'HR & People':                'Recruiting, people operations and talent development.',
  'Consulting':                 'Advisory, implementation and client-facing consulting.',
  'IT & Enterprise Systems':    'Internal IT, systems administration and tooling.',
  'Design':                     'Product design, UX research and brand design.',
};

const CATEGORIES = HOME_CATEGORIES.map(category => ({
  href: `/category/${categorySlug(category)}`,
  title: category,
  copy: CATEGORY_COPY[category] ?? 'Open roles in this field, no German required.',
}));

const HERO_LOCATIONS = [
  { value: '', label: 'All Germany' },
  { value: 'berlin', label: 'Berlin' },
  { value: 'munich', label: 'Munich' },
  { value: 'hamburg', label: 'Hamburg' },
  { value: 'frankfurt', label: 'Frankfurt' },
  { value: 'remote', label: 'Remote' },
] as const;

function primaryLocation(job: IJob): string {
  if (Array.isArray(job.AllLocations) && job.AllLocations.length > 0) return job.AllLocations[0];
  return job.Location || 'Germany';
}

// "€70k–€90k · Posted 2 days ago" meta line, from real fields only.
function jobMetaLine(job: IJob): string {
  const parts: string[] = [];
  if (job.SalaryMin && job.SalaryMax) {
    const sym = job.SalaryCurrency === 'USD' ? '$' : '€';
    const k = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
    parts.push(`${sym}${k(job.SalaryMin)}–${sym}${k(job.SalaryMax)}`);
  }
  if (job.PostedDate) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(job.PostedDate).getTime()) / 86400000));
    parts.push(days === 0 ? 'Posted today' : days === 1 ? 'Posted yesterday' : `Posted ${days} days ago`);
  }
  return parts.join(' · ');
}

function jobTags(job: IJob): string[] {
  return [
    job.WorkplaceType && job.WorkplaceType !== 'Unspecified' ? job.WorkplaceType : null,
    job.ExperienceLevel && job.ExperienceLevel !== 'N/A' ? job.ExperienceLevel : null,
    job.EmploymentType || null,
  ].filter(Boolean).slice(0, 2) as string[];
}

interface HomeArticle { title: string; slug: string; category: string; readingMinutes: number; }

interface HomeProps {
  initialJobs?: IJob[];
  /**
   * The page's <h1>, rendered inside the hero. Passed in from the server page
   * (app/page.tsx) for the same reason as `intro` — it is the page's single
   * strongest ranking signal and must be plain server-rendered HTML rather
   * than something this client component produces.
   */
  heading?: ReactNode;
  /**
   * Static intro copy rendered straight below the hero. Passed in from the
   * server page (app/page.tsx) rather than written here so the prose is a
   * plain server component — no hydration, and it is present in the HTML for
   * crawlers regardless of what this client component does.
   */
  intro?: ReactNode;
  initialCompanies?: ICompany[];
  companyCount?: number;
  articles?: HomeArticle[];
  totalJobCount?: number;
}

/**
 * Scroll-driven motion for the landing page (GSAP + ScrollTrigger, loaded
 * lazily so it never blocks first paint).
 *
 *  - `[data-reveal]`          → fades/rises the element when it scrolls in.
 *  - `[data-reveal="stagger"]` → same, but its children enter one after another.
 *  - `[data-count="25,000+"]` → the number counts up from 0 on load.
 *
 * Elements already inside the viewport at mount are left alone: hiding them
 * after the server HTML has painted would flash. The hero keeps its own CSS
 * rise-in for the same reason — it is visible before hydration.
 */
function useHomeMotion(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const fold = window.innerHeight * 0.92;

        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
          if (el.getBoundingClientRect().top < fold) return; // already on screen
          const targets = el.dataset.reveal === 'stagger' ? Array.from(el.children) : [el];
          gsap.set(targets, { opacity: 0, y: 22 });
          gsap.to(targets, {
            opacity: 1, y: 0,
            duration: 0.75, ease: 'power3.out',
            stagger: el.dataset.reveal === 'stagger' ? 0.07 : 0,
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
            onComplete: () => gsap.set(targets, { clearProps: 'transform' }),
          });
        });

        root.querySelectorAll<HTMLElement>('[data-count]').forEach(el => {
          const m = /^([\d,]+)(.*)$/.exec(el.dataset.count || '');
          if (!m) return;
          const target = Number(m[1].replace(/,/g, ''));
          const suffix = m[2];
          const state = { v: 0 };
          gsap.to(state, {
            v: target, duration: 1.5, ease: 'power2.out', delay: 0.3,
            onUpdate: () => { el.textContent = Math.round(state.v).toLocaleString('en-US') + suffix; },
          });
        });
      }, root);
    })();

    return () => { cancelled = true; ctx?.revert(); };
  }, [rootRef]);
}

export default function Home({ initialJobs = [], initialCompanies = [], heading, intro }: HomeProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [heroLocation, setHeroLocation] = useState('');
  // Cohort demand test: the CTA never leads to a real cohort — the modal
  // always says "full" and collects waitlist signups.
  const [cohortModalOpen, setCohortModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useHomeMotion(rootRef);

  const jobs = initialJobs.slice(0, 9);
  const trustCompanies = initialCompanies.slice(0, 12);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/jobs?search=${encodeURIComponent(q)}`);
    else if (heroLocation === 'remote') navigate('/jobs?workplace=remote');
    else if (heroLocation) navigate(`/city/${heroLocation}`);
    else navigate('/jobs');
  };

  return (
    <div ref={rootRef} style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', lineHeight: 1.5, overflowX: 'hidden' }}>
      {/* Responsive grids + hover states — inline styles can't express these. */}
      <style>{`
        @keyframes lpRiseIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .lp-hero { animation: lpRiseIn 0.6s ease both; }
        /* The hero's children cascade in after the section itself. */
        .lp-hero > div > * { animation: lpRiseIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .lp-hero > div > *:nth-child(1) { animation-delay: 0.05s; }
        .lp-hero > div > *:nth-child(2) { animation-delay: 0.12s; }
        .lp-hero > div > *:nth-child(3) { animation-delay: 0.2s; }
        .lp-hero > div > *:nth-child(4) { animation-delay: 0.28s; }
        .lp-hero > div > *:nth-child(5) { animation-delay: 0.36s; }
        /* Headlines never leave a one-word orphan on the last line. */
        .lp-balance { text-wrap: balance; }
        /* Job cards are flex columns so the meta line sits on the same
           baseline in every card of a row, regardless of tag count. */
        .lp-job-card { display: flex; flex-direction: column; }
        .lp-job-card > .lp-job-meta { margin-top: auto; padding-top: 14px; }
        .lp-search-form input:focus { box-shadow: none !important; }
        .lp-search-form:focus-within { border-color: var(--primary) !important; box-shadow: 0 0 0 4px var(--primary-soft) !important; }
        .lp-search-form { transition: border-color 0.18s ease, box-shadow 0.18s ease; }
        .lp-primary-btn { transition: background 0.15s ease, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease !important; }
        .lp-primary-btn:active { transform: scale(0.97); }
        .lp-stat-cell strong { font-variant-numeric: tabular-nums; }
        .lp-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
        .lp-jobs-grid  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .lp-steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .lp-why-grid   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
        .lp-cats-grid  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .lp-coach-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 40px; align-items: center; }
        .lp-search-form { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(170px,0.7fr) auto; }
        /* Grid items default to min-width:auto, so a nowrap job title would
           force its column wider than 1fr and overflow the viewport. */
        .lp-jobs-grid > *, .lp-steps-grid > *, .lp-cats-grid > *,
        .lp-why-grid > *, .lp-stats-grid > *, .lp-coach-grid > * { min-width: 0; }
        @media (max-width: 1023px) {
          .lp-jobs-grid, .lp-cats-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-why-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-coach-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 639px) {
          .lp-jobs-grid, .lp-steps-grid, .lp-cats-grid, .lp-why-grid { grid-template-columns: 1fr; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-stat-cell:nth-child(2n) { border-right: none !important; }
          .lp-search-form { grid-template-columns: 1fr; }
          .lp-search-form input, .lp-search-form select { height: 54px !important; border-left: none !important; border-bottom: 1px solid var(--border); }
          .lp-search-form button { margin: 8px !important; height: 48px !important; }
        }
        .lp-card { transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.18s ease, box-shadow 0.18s ease; }
        .lp-card h3 { transition: color 0.15s ease; }
        @media (hover: hover) and (pointer: fine) {
          .lp-card:hover { transform: translateY(-3px); border-color: var(--primary) !important; box-shadow: 0 10px 28px rgba(0,0,0,0.08); }
          [data-theme='dark'] .lp-card:hover { box-shadow: 0 10px 28px rgba(0,0,0,0.4); }
          .lp-card:hover h3 { color: var(--primary); }
          .lp-primary-btn:hover { background: var(--primary-hover) !important; transform: translateY(-1px); box-shadow: 0 6px 18px color-mix(in srgb, var(--primary) 35%, transparent); }
          .lp-outline-btn:hover { border-color: var(--border-strong) !important; }
          .lp-cta-btn:hover { opacity: 0.88; }
          .lp-popular-link:hover { text-decoration: underline; }
        }
      `}</style>

      <main>
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="lp-hero" style={{ padding: `clamp(56px, 8vw, 88px) ${SECTION_X} 56px`, textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '8px 14px',
              borderRadius: 999, background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: 13, fontWeight: 800,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)' }} />
              For job seekers who don&rsquo;t speak German
            </div>

            {/* Server-rendered <h1> (see the `heading` prop). Stays the second
                child of the hero so the entry animation still targets it. */}
            {heading}

            <p style={{ maxWidth: 640, margin: '22px auto 0', color: 'var(--text-secondary)', fontSize: 18 }}>
              We screen every listing so you only see roles that don&rsquo;t demand fluent German —{' '}
              <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>apply with confidence, skip the guesswork.</strong>
            </p>

            <div style={{ maxWidth: 900, margin: '36px auto 0' }}>
              <form
                onSubmit={onSearch}
                className="lp-search-form"
                style={{
                  minHeight: 68, alignItems: 'center', background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(18,20,26,0.04)',
                }}
              >
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Job title, skill or company"
                  aria-label="Search jobs"
                  style={{
                    height: 66, border: 0, background: 'transparent', outline: 'none', padding: '0 22px',
                    fontSize: 15, color: 'var(--text-primary)', fontFamily: 'inherit', minWidth: 0,
                  }}
                />
                <select
                  value={heroLocation}
                  onChange={e => setHeroLocation(e.target.value)}
                  aria-label="Location"
                  style={{
                    height: 66, border: 0, borderLeft: '1px solid var(--border)', background: 'transparent',
                    outline: 'none', padding: '0 18px', color: 'var(--text-secondary)', fontSize: 15,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {HERO_LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <button
                  type="submit"
                  className="lp-primary-btn"
                  style={{
                    height: 52, marginRight: 8, padding: '0 26px', border: 0, borderRadius: 11,
                    background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: 15,
                    cursor: 'pointer', transition: 'background 0.15s ease', fontFamily: 'inherit',
                  }}
                >
                  Search jobs
                </button>
              </form>
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                Popular:{' '}
                <Link to="/jobs?search=Software+Engineer" className="lp-popular-link" style={{ color: 'inherit' }}>Software Engineer</Link>
                {' · '}
                <Link to="/jobs?search=Product+Manager" className="lp-popular-link" style={{ color: 'inherit' }}>Product Manager</Link>
                {' · '}
                <Link to="/jobs?search=Data+Analyst" className="lp-popular-link" style={{ color: 'inherit' }}>Data Analyst</Link>
              </p>
            </div>

            <div className="lp-stats-grid" style={{ marginTop: 48, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              {STATS.map((s, i) => (
                <div key={s.label} className="lp-stat-cell" style={{
                  padding: '26px 16px', textAlign: 'center',
                  borderRight: i === STATS.length - 1 ? 'none' : '1px solid var(--border)',
                }}>
                  <strong data-count={s.n} style={{ display: 'block', fontSize: 25, letterSpacing: '-0.03em', fontWeight: 800 }}>{s.n}</strong>
                  <span style={{ marginTop: 5, display: 'block', color: 'var(--text-secondary)', fontSize: 13 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Server-rendered intro prose (see the `intro` prop). */}
        {intro}

        {/* ── TRUST LOGOS (real companies from the directory) ───────────────── */}
        {trustCompanies.length > 0 && (
          <section style={{ padding: `40px ${SECTION_X}` }}>
            <div data-reveal style={{ maxWidth: 1120, margin: '0 auto' }}>
              <p style={{
                textAlign: 'center', fontSize: 12, fontWeight: 750, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 22,
              }}>
                Companies hiring in English
              </p>
              {/* Infinite marquee. The track holds the list TWICE and animates
                  to -50%: at the end of the cycle the second copy sits exactly
                  where the first started, so the reset is invisible. Rendering
                  one copy would snap back to an empty right edge. */}
              <div className="marquee-mask" style={{ overflow: 'hidden', width: '100%' }}>
                <div className="marquee-track" aria-label="Companies hiring in English">
                  {[...trustCompanies, ...trustCompanies].map((c, i) => (
                    <Link
                      key={`${c.companyName}-${i}`}
                      to="/directory"
                      // The duplicate half is decorative — hide it from AT so the
                      // company list isn't announced twice.
                      aria-hidden={i >= trustCompanies.length}
                      tabIndex={i >= trustCompanies.length ? -1 : undefined}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 10,
                        fontSize: '0.9rem', fontWeight: 500, letterSpacing: '-0.01em',
                        color: 'var(--text-secondary)', textDecoration: 'none',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      <CompanyLogo companyName={c.companyName} domain={c.domain} size={34} />
                      {c.companyName}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── TRENDING ROLES (real jobs, crawlable links) ───────────────────── */}
        <section style={{ padding: `68px ${SECTION_X}`, background: 'var(--bg-surface-2)' }}>
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div data-reveal style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 30, flexWrap: 'wrap' }}>
              <div>
                <span style={eyebrowStyle}>Fresh today</span>
                <h2 className="lp-balance" style={{ marginTop: 8, fontSize: 'clamp(28px, 3.4vw, 38px)', letterSpacing: '-0.04em', fontWeight: 800 }}>
                  Trending roles right now
                </h2>
              </div>
              <Link to="/jobs" className="lp-outline-btn" style={{
                minHeight: 44, padding: '0 18px', display: 'inline-flex', alignItems: 'center',
                borderRadius: 10, border: '1px solid var(--border-strong)', fontWeight: 700, fontSize: 14,
                background: 'var(--bg-surface)', color: 'var(--text-primary)', textDecoration: 'none',
              }}>
                View all jobs
              </Link>
            </div>

            <div className="lp-jobs-grid" data-reveal="stagger">
              {jobs.map(job => {
                const tags = jobTags(job);
                const meta = jobMetaLine(job);
                return (
                  <Link
                    key={job._id}
                    to={`/jobs/${job._id}`}
                    className="lp-card lp-job-card"
                    style={{
                      padding: 22, background: 'var(--bg-surface)',
                      border: '1px solid var(--border)', borderRadius: 15, textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <CompanyLogo
                        companyName={job.Company}
                        domain={job.companyDomain ?? undefined}
                        size={36}
                      />
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{
                          fontSize: 15, fontWeight: 750, letterSpacing: '-0.01em', margin: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {job.JobTitle}
                        </h3>
                        <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                          {job.Company} · {primaryLocation(job)}
                        </p>
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                        {tags.map(tag => (
                          <span key={tag} style={{
                            padding: '5px 10px', borderRadius: 999, background: 'var(--bg-surface-2)',
                            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 650,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {meta && <p className="lp-job-meta" style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{meta}</p>}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
        <section style={{ padding: `68px ${SECTION_X}` }}>
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div data-reveal style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 44px' }}>
              <span style={eyebrowStyle}>How it works</span>
              <h2 className="lp-balance" style={{ marginTop: 8, fontSize: 'clamp(30px, 3.6vw, 42px)', letterSpacing: '-0.04em', lineHeight: 1.1, fontWeight: 800 }}>
                Three steps to your next role
              </h2>
            </div>
            <div className="lp-steps-grid" data-reveal="stagger">
              {STEPS.map(st => (
                <div key={st.n} style={{ padding: '30px 26px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)',
                    display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, marginBottom: 18,
                  }}>
                    {st.n}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 750, letterSpacing: '-0.02em', margin: 0 }}>{st.title}</h3>
                  <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>{st.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WHY US (inverted ink band) ────────────────────────────────────── */}
        <section style={{ padding: `60px ${SECTION_X}`, background: 'var(--ink)', color: 'var(--paper)' }}>
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div data-reveal style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 40px' }}>
              <span style={eyebrowStyle}>Why us</span>
              <h2 className="lp-balance" style={{ marginTop: 8, fontSize: 'clamp(28px, 3.4vw, 38px)', letterSpacing: '-0.04em', lineHeight: 1.1, fontWeight: 800 }}>
                Built differently from a general job board
              </h2>
            </div>
            <div className="lp-why-grid" data-reveal="stagger" style={{ borderTop: '1px solid color-mix(in srgb, var(--paper) 16%, transparent)' }}>
              {WHY_US.map((w, i) => (
                <div key={w.title} style={{
                  padding: '26px 20px 0',
                  borderRight: i === WHY_US.length - 1 ? 'none' : '1px solid color-mix(in srgb, var(--paper) 16%, transparent)',
                }}>
                  <h3 style={{ fontSize: 16, fontWeight: 750, letterSpacing: '-0.01em', margin: 0 }}>{w.title}</h3>
                  <p style={{ marginTop: 8, color: 'color-mix(in srgb, var(--paper) 64%, transparent)', fontSize: 13, lineHeight: 1.55 }}>{w.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CAREER COACHING ───────────────────────────────────────────────── */}
        <section style={{ padding: `68px ${SECTION_X}`, background: 'var(--primary-soft)' }}>
          <div className="lp-coach-grid" data-reveal="stagger" style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18, padding: '7px 13px',
                borderRadius: 999, background: 'var(--bg-surface)', color: 'var(--primary)', fontSize: 12, fontWeight: 800,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)' }} />
                New · Career coaching
              </div>
              <h2 className="lp-balance" style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', letterSpacing: '-0.04em', lineHeight: 1.08, fontWeight: 800, margin: 0 }}>
                Get hired faster with cohort-based coaching
              </h2>
              <p style={{ marginTop: 14, color: 'var(--text-secondary)', fontSize: 16, maxWidth: 480 }}>
                Join a small group of international job seekers and work through your CV, interviews and job search
                strategy for the German market — live, week by week.
              </p>

              <div style={{ display: 'grid', gap: 14, marginTop: 26 }}>
                {COACHING_FEATURES.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ marginTop: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 15, color: 'var(--text-primary)' }}>{f}</span>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => setCohortModalOpen(true)} className="lp-primary-btn" style={{
                marginTop: 28, minHeight: 48, padding: '0 24px', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 11, background: 'var(--primary)', color: '#fff',
                fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s ease',
              }}>
                Apply for the next cohort
              </button>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 30 }}>
              <p style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>
                Next cohort
              </p>
              {COHORT_DETAILS.map(d => (
                <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{d.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{d.value}</span>
                </div>
              ))}
              <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                Limited to 20 seats per cohort to keep coaching hands-on.
              </p>
            </div>
          </div>
        </section>

        {/* ── BROWSE BY CATEGORY ────────────────────────────────────────────── */}
        <section style={{ padding: `68px ${SECTION_X}` }}>
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div data-reveal style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 30px' }}>
              <span style={eyebrowStyle}>Browse by category</span>
              <h2 className="lp-balance" style={{ marginTop: 8, fontSize: 'clamp(30px, 3.6vw, 42px)', letterSpacing: '-0.04em', lineHeight: 1.1, fontWeight: 800 }}>
                Explore opportunities by field
              </h2>
              <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
                Every role listed here does not require German fluency.
              </p>
            </div>

            <div className="lp-cats-grid" data-reveal="stagger">
              {CATEGORIES.map(c => (
                <Link
                  key={c.title}
                  to={c.href}
                  className="lp-card"
                  style={{
                    minHeight: 122, padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 15, display: 'block', textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <h3 style={{ fontSize: 16, fontWeight: 750, letterSpacing: '-0.02em', margin: 0 }}>{c.title}</h3>
                  <p style={{ marginTop: 7, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{c.copy}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA BAND (inverted ink card) ──────────────────────────────────── */}
        <section style={{ padding: `24px ${SECTION_X} 80px` }}>
          <div data-reveal style={{
            maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 28, flexWrap: 'wrap', padding: 'clamp(26px, 4vw, 38px) clamp(24px, 4vw, 40px)', borderRadius: 22,
            background: 'var(--ink)', color: 'var(--paper)',
          }}>
            <div>
              <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 38px)', letterSpacing: '-0.04em', lineHeight: 1.1, fontWeight: 800, margin: 0 }}>
                Get relevant jobs in your inbox.
              </h2>
              <p style={{ marginTop: 8, color: 'color-mix(in srgb, var(--paper) 74%, transparent)', maxWidth: 460 }}>
                Curated openings and practical Germany relocation tips, once a week.
              </p>
            </div>
            <Link to="/signup" className="lp-cta-btn" style={{
              minWidth: 190, minHeight: 48, padding: '0 22px', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', borderRadius: 11, background: 'var(--paper)', color: 'var(--ink)',
              fontWeight: 800, fontSize: 15, textDecoration: 'none',
            }}>
              Get weekly alerts
            </Link>
          </div>
        </section>
      </main>

      {cohortModalOpen && <CohortWaitlistModal onClose={() => setCohortModalOpen(false)} />}
    </div>
  );
}
