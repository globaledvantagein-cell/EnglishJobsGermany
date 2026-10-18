'use client';

/**
 * Presentational job detail page body shared by /jobs/[id] and /remote-jobs/[id].
 *
 * Layout (see jobDetail.css), modelled on the job pages of Jobright and
 * Wellfound:
 *   - header card: logo, company, title, location + posted date, actions
 *   - body: the description, then an "About <company>" card
 *   - aside: "Job details" — every fact in one place (language, visa,
 *     workplace, employment, experience, salary, team, category), sticky on
 *     desktop, above the description on mobile
 *   - a second Apply (aside on desktop, bottom bar on mobile) that appears
 *     only once the header's Apply has scrolled away
 *
 * Gating, metering and tracking stay in the callers: they pass the apply
 * element in already wired up, so this file only decides where it goes.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/compat/router';
import {
  ArrowRight, Banknote, Briefcase, Building2, CalendarDays, Check, Globe2, Languages,
  Layers, MapPin, Plane, Share2, Truck, TrendingUp,
} from 'lucide-react';
import type { IJob } from '../../types';
import CompanyLogo from '../CompanyLogo';
import FormattedDescription from '../FormattedDescription';
import { formatPostedDate } from '../../utils/date';
import { isMeaningful, normalizeWorkplace } from '../../utils/job';
import { tidyDescriptionHtml } from './tidyDescriptionHtml';
import './jobDetail.css';

const EXPERIENCE_LABELS: Record<string, string> = {
  entry: 'Entry level', mid: 'Mid level', senior: 'Senior', lead: 'Lead', executive: 'Executive',
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  fulltime: 'Full-time', parttime: 'Part-time', contract: 'Contract', internship: 'Internship',
};

/** "FULL_TIME" / "full-time" / "mid-senior level" → "Full time" / "Mid-senior level". */
function humanize(value?: string | null): string | null {
  if (!isMeaningful(value) || value === 'N/A') return null;
  const text = value!.replace(/_/g, ' ').trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Case-insensitive de-duplication, first spelling wins. */
function uniqueLocations(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface Fact { icon: ReactNode; label: string; value: ReactNode; tone?: 'ok' }

interface Props {
  job: IJob;
  /** Primary location line, already resolved for the vertical. */
  location: string;
  /** Every location, primary first. */
  locations: string[];
  salary: string | null;
  /** Workplace label — "Remote" for the remote vertical, else normalized. */
  workplace?: string | null;
  /** The wired-up apply control; must carry className="jd-apply". Rendered up to three times. */
  apply: ReactNode;
  /** Extra icon buttons beside Share (e.g. Save). */
  extraActions?: ReactNode;
  /** Small line under the aside CTA. */
  ctaNote?: ReactNode;
  /** Small line beside the header actions (e.g. apply-click count). */
  meta?: ReactNode;
  /** Absolute path shared by the Share button. */
  sharePath: string;
  /** Listing filtered to this company, for "More jobs at …". */
  companyJobsPath?: string;
}

export default function JobDetailView({
  job, location, locations: rawLocations, salary, workplace, apply, extraActions, ctaNote, meta, sharePath, companyJobsPath,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showAllLocations, setShowAllLocations] = useState(false);
  // The public <main> carries a transform, which traps position:fixed — the
  // mobile bar is portaled to <body> once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The aside / mobile-bar Apply repeats the header's, so it only shows once
  // the header actions have scrolled out of view — one Apply on screen at a time.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [headerApplyVisible, setHeaderApplyVisible] = useState(true);
  useEffect(() => {
    const node = actionsRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setHeaderApplyVisible(entry.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // While the mobile apply bar is up, lift other bottom-corner UI (the
  // feedback button) above it. The bar is display:none above 900px, so its
  // measured height is 0 there.
  const mobileBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const bar = mobileBarRef.current;
    const height = !headerApplyVisible && bar ? bar.offsetHeight : 0;
    if (height > 0) root.style.setProperty('--bottom-bar-inset', `${height}px`);
    else root.style.removeProperty('--bottom-bar-inset');
    return () => { root.style.removeProperty('--bottom-bar-inset'); };
  }, [headerApplyVisible, mounted]);

  const handleShare = async () => {
    // Built on click, not during render — the page is server-rendered.
    const shareUrl = `${window.location.origin}${sharePath}`;
    const shareData = { title: `${job.JobTitle} at ${job.Company}`, url: shareUrl };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch { /* cancelled or unsupported — fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* rare clipboard failure — silent */ }
  };

  const descriptionHtml = useMemo(
    () => (job.DescriptionHtml ? tidyDescriptionHtml(job.DescriptionHtml) : null),
    [job.DescriptionHtml],
  );

  const locations = uniqueLocations(rawLocations);
  const workplaceLabel = workplace ?? (() => {
    const normalized = normalizeWorkplace(job.WorkplaceType);
    return normalized === 'Remote' || normalized === 'Hybrid' || normalized === 'On-site' ? normalized : null;
  })();
  const experience = (job.filterExperience && EXPERIENCE_LABELS[job.filterExperience]) || humanize(job.ExperienceLevel);
  const employment = (job.filterEmployment && EMPLOYMENT_LABELS[job.filterEmployment]) || humanize(job.EmploymentType);
  const team = [job.Department, job.Team].find(value => isMeaningful(value) && value !== 'N/A') || null;
  const posted = formatPostedDate(job.PostedDate);

  const facts: Fact[] = [
    ...(job.GermanRequired === false ? [{ icon: <Languages size={16} />, label: 'Language', value: 'English only — no German needed', tone: 'ok' as const }] : []),
    ...(job.filterVisa === 'available' ? [{ icon: <Plane size={16} />, label: 'Visa sponsorship', value: 'Available', tone: 'ok' as const }] : []),
    ...(job.filterRelocation === 'available' ? [{ icon: <Truck size={16} />, label: 'Relocation', value: 'Support offered', tone: 'ok' as const }] : []),
    {
      icon: <MapPin size={16} />,
      label: locations.length > 1 ? `Locations (${locations.length})` : 'Location',
      value: (
        <>
          {showAllLocations || locations.length <= 3 ? locations.join(' · ') || location : locations.slice(0, 3).join(' · ')}
          {locations.length > 3 && (
            <button type="button" className="jd-more" onClick={() => setShowAllLocations(previous => !previous)}>
              {showAllLocations ? 'Show less' : `+${locations.length - 3} more`}
            </button>
          )}
        </>
      ),
    },
    ...(workplaceLabel ? [{ icon: <Globe2 size={16} />, label: 'Workplace', value: workplaceLabel }] : []),
    ...(employment ? [{ icon: <Briefcase size={16} />, label: 'Employment', value: employment }] : []),
    ...(experience ? [{ icon: <TrendingUp size={16} />, label: 'Experience', value: experience }] : []),
    ...(salary ? [{ icon: <Banknote size={16} />, label: 'Salary', value: salary }] : []),
    ...(team ? [{ icon: <Building2 size={16} />, label: 'Team', value: team }] : []),
    ...(isMeaningful(job.Category) ? [{ icon: <Layers size={16} />, label: 'Category', value: job.Category }] : []),
  ];

  const shareButton = (
    <button type="button" className="jd-icon-btn" onClick={handleShare}
      aria-label="Share this job" title={copied ? 'Link copied' : 'Share'}>
      {copied ? <Check size={18} /> : <Share2 size={18} />}
    </button>
  );

  return (
    <>
      <header className="jd-head">
        <div className="jd-logo">
          <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={56} />
        </div>
        <div className="jd-company">
          <strong>{job.Company}</strong>
          <span aria-hidden="true">·</span>
          <span className="jd-inline"><CalendarDays size={14} /> Posted {posted}</span>
        </div>
        <h1 className="jd-title">{job.JobTitle}</h1>
        <div className="jd-company jd-where">
          <span className="jd-inline"><MapPin size={14} /> {location}</span>
          {workplaceLabel && workplaceLabel !== location && <><span aria-hidden="true">·</span><span>{workplaceLabel}</span></>}
        </div>
        <div className="jd-actions" ref={actionsRef}>
          {apply}
          {extraActions}
          {shareButton}
          {meta && <span className="jd-meta">{meta}</span>}
        </div>
      </header>

      <div className="jd-grid">
        <div className="jd-body">
          <article className="jd-main">
            <h2 className="jd-main-title">About the role</h2>
            <div className="jd-description">
              {descriptionHtml ? (
                <div className="job-description-html" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
              ) : (
                <FormattedDescription description={job.Description || ''} />
              )}
            </div>
          </article>

          <section className="jd-company-card">
            <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={44} />
            <div>
              <h2 className="jd-company-card-title">About {job.Company}</h2>
              {job.companyDomain && <p className="jd-company-card-sub">{job.companyDomain}</p>}
            </div>
            {companyJobsPath && (
              <Link to={companyJobsPath} className="jd-company-card-link">
                More jobs at {job.Company} <ArrowRight size={15} />
              </Link>
            )}
          </section>
        </div>

        <aside className="jd-aside">
          <section className="jd-card">
            <h2 className="jd-card-title">Job details</h2>
            <dl className="jd-facts">
              {facts.map(fact => (
                <div className="jd-fact" key={fact.label} data-tone={fact.tone}>
                  {fact.icon}
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="jd-card jd-cta" data-show={!headerApplyVisible} inert={headerApplyVisible}>
            {apply}
            {ctaNote && <p className="jd-cta-note">{ctaNote}</p>}
          </section>
        </aside>
      </div>

      {mounted && createPortal(
        <div className="jd-mobile-bar" ref={mobileBarRef} data-show={!headerApplyVisible} inert={headerApplyVisible}>
          {apply}
          {extraActions}
          {shareButton}
        </div>,
        document.body,
      )}
    </>
  );
}
