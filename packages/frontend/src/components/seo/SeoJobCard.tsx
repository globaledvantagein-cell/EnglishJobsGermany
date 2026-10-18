// Server-rendered job row for SEO listing pages (city/category). A real
// crawlable <a href="/jobs/:id"> — layout after Jobright/Wellfound result
// cards (studied with REA): logo, title, company · location, readable facts.

import Link from 'next/link';
import type { IJob } from '@/types';
import CompanyLogo from '@/components/CompanyLogo';
import { getDisplayLocation } from '@/utils/job';
import './listing.css';

const WORKPLACE: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const EXPERIENCE: Record<string, string> = { entry: 'Entry level', mid: 'Mid level', senior: 'Senior', lead: 'Lead', executive: 'Executive' };
const EMPLOYMENT: Record<string, string> = { fulltime: 'Full-time', parttime: 'Part-time', contract: 'Contract', internship: 'Internship' };

function postedLabel(value: string | null): string | null {
  if (!value) return null;
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function SeoJobCard({ job }: { job: IJob }) {
  const facts = [
    job.filterWorkplace ? WORKPLACE[job.filterWorkplace] : null,
    job.filterEmployment ? EMPLOYMENT[job.filterEmployment] : null,
    job.filterExperience ? EXPERIENCE[job.filterExperience] : null,
  ].filter(Boolean) as string[];
  const highlights = [
    job.filterVisa === 'available' ? 'Visa sponsorship' : null,
    job.filterRelocation === 'available' ? 'Relocation' : null,
  ].filter(Boolean) as string[];
  const posted = postedLabel(job.PostedDate);

  return (
    <Link href={`/jobs/${job._id}`} className="ls-job">
      <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={44} />
      <div className="ls-job-main">
        <h3 className="ls-job-title">{job.JobTitle}</h3>
        <p className="ls-job-meta">
          <span className="ls-job-company">{job.Company}</span>
          <span aria-hidden="true">·</span>
          <span>{getDisplayLocation(job)}</span>
        </p>
        {(facts.length > 0 || highlights.length > 0) && (
          <div className="ls-job-tags">
            {highlights.map(h => <span key={h} className="ls-tag" data-tone="ok">{h}</span>)}
            {facts.map(f => <span key={f} className="ls-tag">{f}</span>)}
          </div>
        )}
      </div>
      {posted && <span className="ls-job-posted">{posted}</span>}
    </Link>
  );
}
