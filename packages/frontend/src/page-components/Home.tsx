'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@/compat/router';
import type { IJob, ICompany } from '../types';
import {
  ArrowRight, LayoutGrid, BarChart3, Boxes, Briefcase, Calculator, ClipboardList, Code2, Cpu, Factory, FlaskConical,
  Gamepad2, GraduationCap, Handshake, Headset, Languages, Layers, Megaphone, PenTool, Presentation,
  Scale, Server, ShieldAlert, ShieldCheck, Sparkles, Store, Target, Users, Workflow, type LucideIcon,
} from 'lucide-react';
import { CATEGORY_ORDER, HOME_CATEGORIES, categorySlug } from '../utils/categorize';
import { isBodyScroller } from '../utils/scroller';
import { CAREER_GUIDE_CATEGORY_LABELS } from '../data/careerGuide';
import CompanyLogo from '../components/CompanyLogo';
import FieldsDrawer from '../components/seo/FieldsDrawer';

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

// Counts are rounded DOWN to a "…+" figure (same rule as app/page.tsx) so the
// stats, intro and meta description always agree and never overstate.
const roundDown = (n: number, step: number) => Math.max(step, Math.floor(n / step) * step);
const plus = (n: number, step: number) => `${roundDown(n, step).toLocaleString('en-US')}+`;

const STEPS = [
  { n: '1', title: 'Search & filter', copy: 'Browse roles pre-screened for English-only requirements, by city, remote or field.' },
  { n: '2', title: 'Apply direct', copy: 'Create a free account, then apply on the employer’s own site — no middlemen.' },
  { n: '3', title: 'Get hired', copy: 'Use our visa and relocation guides while you interview and negotiate your offer.' },
] as const;

// Category browser: the 12 largest fields (by live count) as cards, every
// other field as a count chip underneath, so all 28 /category pages are
// linked from the homepage. Counts-with-labels follows Berlinstartupjobs and
// Wellfound's "jobs by role" block (studied with REA).
const CATEGORY_META: Record<string, { Icon: LucideIcon; copy: string }> = {
  'Software Engineering':         { Icon: Code2,         copy: 'Backend, frontend, cloud and platform roles.' },
  'Sales':                        { Icon: Handshake,     copy: 'Account executives, business development, revenue.' },
  'Operations & Strategy':        { Icon: Workflow,      copy: 'Business operations, programmes and strategy.' },
  'Marketing & Growth':           { Icon: Megaphone,     copy: 'Brand, growth, content and demand generation.' },
  'Finance & Accounting':         { Icon: Calculator,    copy: 'Controlling, FP&A, accounting and treasury.' },
  'Customer Success & Support':   { Icon: Headset,       copy: 'Onboarding, account management and support.' },
  'Data & Analytics':             { Icon: BarChart3,     copy: 'Analytics, data engineering, BI and data science.' },
  'Product Management':           { Icon: Boxes,         copy: 'Product strategy, discovery and delivery.' },
  'HR & People':                  { Icon: Users,         copy: 'Recruiting, people operations and talent.' },
  'Consulting':                   { Icon: Briefcase,     copy: 'Advisory, implementation and client work.' },
  'IT & Enterprise Systems':      { Icon: Server,        copy: 'Internal IT, systems administration and tooling.' },
  'Design':                       { Icon: PenTool,       copy: 'Product design, UX research and brand design.' },
  'Solutions & Pre-Sales':        { Icon: Presentation,  copy: 'Solutions engineering and technical pre-sales.' },
  'AI / ML':                      { Icon: Sparkles,      copy: 'Machine learning, LLMs and applied AI.' },
  'Hardware & Systems':           { Icon: Cpu,           copy: 'Electronics, embedded, robotics and systems.' },
  'Supply Chain & Manufacturing': { Icon: Factory,       copy: 'Logistics, procurement and production.' },
  'Cybersecurity':                { Icon: ShieldCheck,   copy: 'Security engineering, operations and GRC.' },
  'Legal & Compliance':           { Icon: Scale,         copy: 'Legal counsel, compliance and privacy.' },
  'Research & Clinical':          { Icon: FlaskConical,  copy: 'Research, lab and clinical roles.' },
  'Education & Training':         { Icon: GraduationCap, copy: 'Teaching, lecturing and learning design.' },
  'Retail & Facilities':          { Icon: Store,         copy: 'Store, hospitality and facilities roles.' },
  'Domain Specialist':            { Icon: Target,        copy: 'Specialist roles in a particular industry.' },
  'Trust & Safety':               { Icon: ShieldAlert,   copy: 'Content policy, moderation and risk.' },
  'Localization':                 { Icon: Languages,     copy: 'Translation and localisation.' },
  'Administration':               { Icon: ClipboardList, copy: 'Office, executive and team assistance.' },
  'Gaming & Entertainment':       { Icon: Gamepad2,      copy: 'Games, media and entertainment.' },
};
const FALLBACK_META = { Icon: Layers, copy: 'Open roles in this field, no German required.' };
const FEATURED_FIELD_COUNT = 8; // two rows; the rest open in the fields drawer
const isCatchAll = (category: string) => category.startsWith('Other /');
// "Other / General Business" reads as a database bucket; show a plain name.
const fieldLabel = (category: string) =>
  category === 'Other / General Business' ? 'General business'
  : category === 'Other / Open Application' ? 'Open applications'
  : category;

// Quick links under the hero search (pattern from Arbeitnow/Wellfound): every
// one lands on a real, crawlable page or a working filter URL.
const QUICK_LINKS = [
  { href: '/city/berlin', label: 'Berlin' },
  { href: '/city/munich', label: 'Munich' },
  { href: '/city/hamburg', label: 'Hamburg' },
  { href: '/city/frankfurt', label: 'Frankfurt' },
  { href: '/remote-jobs', label: 'Remote' },
  { href: '/jobs?visa=1', label: 'Visa sponsorship' },
  { href: '/jobs?experience=entry', label: 'Entry level' },
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
  /** Server-rendered FAQ (with FAQPage JSON-LD), shown above the alerts CTA. */
  faq?: ReactNode;
  /** Active jobs per category, for the category cards. */
  categoryCounts?: Record<string, number>;
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
    let cleanupObservers: () => void = () => {};

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      // iPhone Safari scrolls the page inside <body> (utils/scroller.ts).
      // ScrollTrigger treats <body> as the window and would never fire, so
      // there the same reveal is started by an IntersectionObserver, which
      // does follow a scrolling <body>. Everywhere else ScrollTrigger is used.
      const bodyScrolls = isBodyScroller();
      const observers: IntersectionObserver[] = [];

      ctx = gsap.context(() => {
        const fold = window.innerHeight * 0.92;

        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
          if (el.getBoundingClientRect().top < fold) return; // already on screen
          const targets = el.dataset.reveal === 'stagger' ? Array.from(el.children) : [el];
          gsap.set(targets, { opacity: 0, y: 22 });
          const tween = {
            opacity: 1, y: 0,
            duration: 0.75, ease: 'power3.out',
            stagger: el.dataset.reveal === 'stagger' ? 0.07 : 0,
            onComplete: () => gsap.set(targets, { clearProps: 'transform' }),
          };
          if (bodyScrolls) {
            // 'top 86%' of the viewport == the bottom 14% is excluded.
            const io = new IntersectionObserver((entries) => {
              if (!entries.some(e => e.isIntersecting)) return;
              io.disconnect();
              gsap.to(targets, tween);
            }, { rootMargin: '0px 0px -14% 0px', threshold: 0 });
            io.observe(el);
            observers.push(io);
          } else {
            gsap.to(targets, { ...tween, scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
          }
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
      cleanupObservers = () => observers.forEach(o => o.disconnect());
    })();

    return () => { cancelled = true; cleanupObservers(); ctx?.revert(); };
  }, [rootRef]);
}

export default function Home({
  initialJobs = [], initialCompanies = [], heading, intro, faq,
  companyCount = 0, totalJobCount = 0, categoryCounts = {},
}: HomeProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  useHomeMotion(rootRef);

  const jobs = initialJobs.slice(0, 6);
  const trustCompanies = initialCompanies.slice(0, 12);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/jobs?search=${encodeURIComponent(q)}` : '/jobs');
  };

  // Fields: the largest 12 (live counts) as cards, the rest as chips. Without
  // counts (API down) the fixed homepage order is used.
  const haveFieldCounts = Object.keys(categoryCounts).length > 0;
  const allFields = (haveFieldCounts ? [...CATEGORY_ORDER] : [...HOME_CATEGORIES])
    .map(name => ({ name, href: `/category/${categorySlug(name)}`, count: categoryCounts[name] ?? 0 }));
  const ranked = haveFieldCounts
    ? allFields.filter(f => !isCatchAll(f.name)).sort((a, b) => b.count - a.count)
    : allFields;
  const featuredFields = ranked.slice(0, FEATURED_FIELD_COUNT);
  const moreFields = haveFieldCounts
    ? [...ranked.slice(FEATURED_FIELD_COUNT), ...allFields.filter(f => isCatchAll(f.name))]
    : [];

  // Live figures only; with the API down the cells fall back to words.
  const stats = [
    { n: totalJobCount > 0 ? plus(totalJobCount, 100) : 'Thousands', label: 'English-speaking jobs' },
    { n: companyCount > 0 ? plus(companyCount, 100) : 'Hundreds', label: 'Hiring companies' },
    { n: String(Object.keys(categoryCounts).length || 28), label: 'Job categories' },
    { n: 'Daily', label: 'New jobs added' },
  ];

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
        .lp-coach-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 40px; align-items: center; }
        .lp-search-form { display: grid; grid-template-columns: minmax(0,1fr) auto; }
        /* Grid items default to min-width:auto, so a nowrap job title would
           force its column wider than 1fr and overflow the viewport. */
        .lp-jobs-grid > *, .lp-steps-grid > *,
        .lp-stats-grid > *, .lp-coach-grid > * { min-width: 0; }
        @media (max-width: 1023px) {
          .lp-jobs-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-coach-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 639px) {
          .lp-jobs-grid, .lp-steps-grid { grid-template-columns: 1fr; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-stat-cell:nth-child(2n) { border-right: none !important; }
          .lp-search-form { grid-template-columns: minmax(0,1fr) auto; min-height: 58px !important; }
          .lp-search-form input { height: 56px !important; padding: 0 16px !important; font-size: 16px !important; }
          .lp-search-form button { height: 44px !important; padding: 0 16px !important; margin-right: 6px !important; }
        }
        /* "Browse all fields" row under the field cards (opens FieldsDrawer). */
        .lp-more-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 18px; }
        .lp-more-btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px; border-radius: 11px; border: 1px solid var(--border-strong); background: var(--bg-surface); color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 750; cursor: pointer; }
        .lp-more-btn:hover { border-color: var(--primary); color: var(--primary); }
        .lp-more-hint { font-size: 13.5px; color: var(--text-secondary); }
        /* Field browser (Explore opportunities by field). */
        .lp-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .lp-field {
          display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto 1fr auto; gap: 4px 12px;
          padding: 18px; min-height: 148px; background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 15px; text-decoration: none; color: inherit;
        }
        .lp-field-icon { grid-row: 1 / span 2; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: var(--primary-soft); color: var(--primary); }
        .lp-field-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .lp-field h3 { margin: 0; font-size: 15.5px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.3; }
        .lp-field-copy { font-size: 13px; line-height: 1.45; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .lp-field-count { grid-column: 1 / -1; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-secondary); }
        .lp-field-count strong { font-size: 18px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; margin-right: 4px; }
        @media (max-width: 1023px) { .lp-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 639px) {
          /* Phones: compact two-up tiles (icon, name, count) — 12 full cards
             stacked were a very long scroll. */
          .lp-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .lp-field { min-height: 0; padding: 14px; grid-template-columns: 1fr; grid-template-rows: auto; align-content: start; gap: 8px; }
          .lp-field-icon { grid-row: auto; width: 34px; height: 34px; border-radius: 10px; }
          .lp-field h3 { font-size: 14px; }
          .lp-field-copy { display: none; }
          .lp-field-count { grid-column: auto; margin-top: 0; padding-top: 0; border-top: none; }
          .lp-field-count strong { font-size: 16px; }
        }

        /* Quick links under the hero search. */
        .lp-quick { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 16px; }
        .lp-chip { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-secondary); font-size: 13.5px; font-weight: 650; text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease; }
        .lp-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 26px; }
        .lp-section-link { display: inline-flex; align-items: center; gap: 6px; height: 42px; padding: 0 18px; border-radius: 11px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font-weight: 750; font-size: 14px; text-decoration: none; white-space: nowrap; }
        .lp-article { display: flex; flex-direction: column; gap: 10px; padding: 22px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 15px; text-decoration: none; color: inherit; }
        .lp-article h3 { margin: 0; font-size: 17px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.35; }
        .lp-article-meta { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
        /* Why-us section (server-rendered intro, see app/page.tsx). Layout
           after Wellfound's "Find work that matters": copy | live card, then
           numbered points. */
        .lp-about { padding: 72px clamp(20px, 4vw, 32px); background: var(--bg-surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .lp-about-inner { max-width: 1120px; margin: 0 auto; }
        .lp-about-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center; }
        .lp-about-eyebrow { font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.12em; color: var(--primary); }
        .lp-about-title { margin: 10px 0 0; font-size: clamp(34px, 4.4vw, 54px); line-height: 1.04; letter-spacing: -0.045em; font-weight: 800; color: var(--text-primary); }
        .lp-about-title em { display: block; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 500; letter-spacing: -0.02em; color: var(--primary); }
        .lp-about-lead { margin: 18px 0 0; max-width: 46ch; font-size: 17px; line-height: 1.65; color: var(--text-secondary); }
        .lp-about-lead strong { color: var(--text-primary); }
        .lp-about-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
        .lp-about-btn { display: inline-flex; align-items: center; white-space: nowrap; height: 46px; padding: 0 20px; border-radius: 12px; border: 1px solid var(--border-strong); color: var(--text-primary); font-weight: 750; font-size: 15px; text-decoration: none; background: var(--bg-surface); }
        .lp-about-btn[data-variant='primary'] { background: var(--primary); border-color: var(--primary); color: #fff; }
        .lp-about-card { padding: 22px 24px; border: 1px solid var(--border); border-radius: 20px; background: var(--bg-base); box-shadow: var(--shadow-md); }
        .lp-about-card-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-primary); }
        .lp-about-live { display: inline-flex; align-items: center; gap: 6px; color: var(--success); letter-spacing: 0.06em; }
        .lp-about-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
        .lp-about-card ul { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .lp-about-card li a { display: grid; grid-template-columns: 92px minmax(0, 1fr) 56px; align-items: center; gap: 14px; padding: 10px 8px; margin: 0 -8px; border-radius: 10px; color: var(--text-primary); text-decoration: none; }
        .lp-about-city { font-weight: 700; font-size: 15px; }
        .lp-about-bar { height: 8px; border-radius: 999px; background: var(--bg-surface-2); overflow: hidden; }
        .lp-about-bar span { display: block; height: 100%; border-radius: inherit; background: var(--primary); }
        .lp-about-count { text-align: right; font-size: 14px; font-weight: 750; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
        .lp-about-card-foot { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-secondary); }
        .lp-about-points { list-style: none; margin: 56px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 56px; }
        .lp-about-points li { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 4px; padding: 22px 0; border-top: 1px solid var(--border); }
        .lp-about-num { padding-top: 3px; font-size: 13px; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums; }
        .lp-about-points h3 { margin: 0; font-size: 18px; font-weight: 750; letter-spacing: -0.02em; color: var(--text-primary); }
        .lp-about-points h3 a { color: inherit; text-decoration: none; }
        .lp-about-points p { margin: 6px 0 0; font-size: 15px; line-height: 1.6; color: var(--text-secondary); }
        @media (hover: hover) and (pointer: fine) {
          .lp-about-card li a:hover { background: var(--bg-surface); }
          .lp-about-card li a:hover .lp-about-city, .lp-about-points h3 a:hover { color: var(--primary); }
          .lp-about-btn:hover { border-color: var(--text-primary); }
          .lp-about-btn[data-variant='primary']:hover { background: var(--primary-hover); }
        }
        @media (max-width: 900px) {
          .lp-about { padding: 52px 20px; }
          .lp-about-top { grid-template-columns: 1fr; gap: 32px; }
          .lp-about-points { grid-template-columns: 1fr; margin-top: 36px; }
        }
        @media (max-width: 480px) {
          .lp-about-card { padding: 18px; }
          .lp-about-card li a { grid-template-columns: 84px minmax(0, 1fr) 48px; gap: 10px; }
          .lp-about-actions .lp-about-btn { flex: 1; justify-content: center; }
        }
        @media (max-width: 639px) {
          .lp-section-head { flex-direction: column; align-items: flex-start; }
          .lp-faq summary { font-size: 15.5px; }
        }
        .lp-card { transition: transform var(--dur-2) var(--ease-out-soft), border-color var(--dur-1) ease, box-shadow var(--dur-2) var(--ease-out-soft); }
        .lp-card h3 { transition: color var(--dur-1) ease; }
        @media (hover: hover) and (pointer: fine) {
          .lp-card:hover { transform: translateY(-2px); border-color: var(--primary) !important; box-shadow: 0 10px 28px rgba(0,0,0,0.08); }
          [data-theme='dark'] .lp-card:hover { box-shadow: 0 10px 28px rgba(0,0,0,0.4); }
          .lp-card:hover h3 { color: var(--primary); }
          .lp-primary-btn:hover { background: var(--primary-hover) !important; transform: translateY(-1px); box-shadow: 0 6px 18px color-mix(in srgb, var(--primary) 35%, transparent); }
          .lp-outline-btn:hover { border-color: var(--border-strong) !important; }
          .lp-cta-btn:hover { opacity: 0.88; }
          .lp-popular-link:hover { text-decoration: underline; }
          .lp-chip:hover { border-color: var(--primary); color: var(--primary); }
        }
      `}</style>

      <main>
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="lp-hero hero-wash" data-wash="home" style={{ padding: `clamp(56px, 8vw, 88px) ${SECTION_X} 56px`, textAlign: 'center' }}>
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
                  aria-label="Search English-speaking jobs"
                  style={{
                    height: 66, border: 0, background: 'transparent', outline: 'none', padding: '0 22px',
                    fontSize: 15, color: 'var(--text-primary)', fontFamily: 'inherit', minWidth: 0,
                  }}
                />
                <button
                  type="submit"
                  className="lp-primary-btn"
                  style={{
                    height: 52, marginRight: 8, padding: '0 26px', border: 0, borderRadius: 11,
                    background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: 15,
                    cursor: 'pointer', transition: 'background 0.15s ease', fontFamily: 'inherit',
                  }}
                >
                  Search
                </button>
              </form>
              <nav aria-label="Popular searches" className="lp-quick">
                {QUICK_LINKS.map(l => (
                  <Link key={l.href} to={l.href} className="lp-chip">{l.label}</Link>
                ))}
              </nav>
            </div>

            <div className="lp-stats-grid" style={{ marginTop: 48, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              {stats.map((s, i) => (
                <div key={s.label} className="lp-stat-cell" style={{
                  padding: '26px 16px', textAlign: 'center',
                  borderRight: i === stats.length - 1 ? 'none' : '1px solid var(--border)',
                }}>
                  <strong data-count={s.n} style={{ display: 'block', fontSize: 25, letterSpacing: '-0.03em', fontWeight: 800 }}>{s.n}</strong>
                  <span style={{ marginTop: 5, display: 'block', color: 'var(--text-secondary)', fontSize: 13 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>


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

        {/* Server-rendered "why us" section (see the `intro` prop): heading,
            lead, live city card and four points. Replaces the old ink band,
            which repeated the same four claims. */}
        {intro}

        {/* ── BROWSE BY CATEGORY ────────────────────────────────────────────── */}
        <section style={{ padding: `68px ${SECTION_X}` }}>
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div data-reveal className="lp-section-head">
              <div>
                <span style={eyebrowStyle}>Browse by category</span>
                <h2 className="lp-balance" style={{ marginTop: 8, fontSize: 'clamp(30px, 3.6vw, 42px)', letterSpacing: '-0.04em', lineHeight: 1.1, fontWeight: 800 }}>
                  Explore opportunities by field
                </h2>
                <p style={{ marginTop: 10, color: 'var(--text-secondary)' }}>
                  Every role listed here does not require German fluency.
                </p>
              </div>
              <Link to="/jobs" className="lp-section-link">All jobs <ArrowRight size={16} /></Link>
            </div>

            <div className="lp-fields" data-reveal="stagger">
              {featuredFields.map(field => {
                const { Icon, copy } = CATEGORY_META[field.name] ?? FALLBACK_META;
                return (
                  <Link key={field.name} to={field.href} className="lp-card lp-field">
                    <span className="lp-field-icon"><Icon size={20} /></span>
                    <span className="lp-field-body">
                      <h3>{field.name}</h3>
                      <span className="lp-field-copy">{copy}</span>
                    </span>
                    {field.count > 0 && (
                      <span className="lp-field-count"><strong>{field.count.toLocaleString('en-US')}</strong> jobs</span>
                    )}
                  </Link>
                );
              })}
            </div>

            {moreFields.length > 0 && (
              <div className="lp-more-row">
                <button type="button" popoverTarget="home-fields" className="lp-more-btn">
                  <LayoutGrid size={16} /> Browse all {CATEGORY_ORDER.length} fields
                </button>
                <span className="lp-more-hint">
                  Including {moreFields.slice(0, 3).map(f => fieldLabel(f.name)).join(', ')} and {moreFields.length - 3} more
                </span>
                <FieldsDrawer
                  id="home-fields"
                  title="Browse jobs by field"
                  fields={[...featuredFields, ...moreFields].map(f => ({ name: f.name, count: f.count }))}
                />
              </div>
            )}
          </div>
        </section>

        {/* Server-rendered FAQ with FAQPage JSON-LD (see the `faq` prop). */}
        {faq}

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

    </div>
  );
}
