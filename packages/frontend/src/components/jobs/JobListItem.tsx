'use client';

/**
 * Single card in the Dashboard's job list.
 *
 * Cards navigate to the standalone /jobs/[id] page in a NEW TAB — there is no
 * inline detail panel and no selection state any more, so nothing here fetches
 * a job description.
 *
 * Rendered as an <a>, not a <button> + window.open: an anchor gives
 * middle-click, cmd/ctrl-click and "Open link in new tab" for free, is
 * keyboard-navigable, and leaves a crawlable href in the markup. window.open
 * would break all four.
 *
 * Used by BOTH verticals. Remote-only affordances (country badge, the
 * "Remote · <country>" location line) are conditional on the job actually
 * carrying a Country, so no variant flag is needed — RemoteJobListItem.tsx was
 * an otherwise identical copy and has been deleted.
 *
 * Memoized — re-renders only when the job or its applied flag change.
 */
import { forwardRef, memo } from 'react';
import type { IJob } from '../../types';
import { Badge } from '../ui';
import CompanyLogo from '../CompanyLogo';
import SaveJobButton from '../SaveJobButton';
import { compactSalary, getDisplayLocation, normalizeWorkplace } from '../../utils/job';
import { getRemoteDisplayLocation } from '../../utils/remoteJob';
import { relativeDate } from '../../utils/date';

/**
 * Remote rows carry a Country and want "Remote"; German rows
 * want the city. Branching on the DATA rather than on a `variant` prop keeps
 * one component correct for both verticals with no caller coordination.
 */
function displayLocation(job: IJob): string {
  return job.Country ? getRemoteDisplayLocation(job) : getDisplayLocation(job);
}

interface DesktopProps {
  job: IJob;
  applied?: boolean;
  /** Full path for the card link, e.g. '/jobs/abc' or '/remote-jobs/abc'. */
  href: string;
  /** Position within its loaded batch — drives the staggered entrance delay. */
  index?: number;
}

/** CSS custom property for the .card-enter stagger. */
const enterStyle = (index?: number) =>
  ({ position: 'relative', '--i': index ?? 0 }) as React.CSSProperties;

export const DesktopJobCard = memo(
  forwardRef<HTMLAnchorElement, DesktopProps>(function DesktopJobCard({ job, applied, href, index }, ref) {
    const salary = compactSalary(job);
    // Canonical filter field first (backend-reconciled), legacy field fallback.
    const wp = job.filterWorkplace
      ? job.filterWorkplace.charAt(0).toUpperCase() + job.filterWorkplace.slice(1)
      : normalizeWorkplace(job.WorkplaceType);
    const showWp = wp === 'Remote' || wp === 'Hybrid';
    const hasVisa = job.filterVisa === 'available';
    const hasRelocation = job.filterRelocation === 'available';

    // The bookmark sits OUTSIDE the card link — an interactive control nested
    // inside an anchor is invalid HTML and swallows the inner click.
    return (
      <div className="card-enter" style={enterStyle(index)}>
        <a
          ref={ref}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="job-card"
          style={{
            // Border-only separation: no fill, so the list reads as one surface
            // with the page behind it.
            border: '1px solid var(--border)',
            background: 'transparent',
            borderRadius: 8, padding: '12px 14px',
            textAlign: 'left', cursor: 'pointer', width: '100%',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            textDecoration: 'none', color: 'inherit',
          }}
        >
          <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
          <p className="job-card__title" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'normal', wordBreak: 'break-word', paddingRight: 22 }}>
            {job.JobTitle}
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.Company} · {displayLocation(job)} · {relativeDate(job.PostedDate || job.scrapedAt)}
          </p>
          {(showWp || salary || applied || hasVisa || hasRelocation) && (
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
              {applied && <Badge variant="green" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>✓ Applied</Badge>}
              {showWp && <Badge variant="blue"  style={{ fontSize: '0.72rem', padding: '2px 8px' }}>{wp}</Badge>}
              {hasVisa && <Badge variant="green" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>Visa</Badge>}
              {hasRelocation && <Badge variant="neutral" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>Relocation</Badge>}
              {salary && (
                <Badge variant="neutral" style={{ fontSize: '0.72rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {job.filterSalaryTier && (
                    <span
                      title={job.filterSalaryTier === 'ats' ? 'Salary provided by employer' : 'Salary found in job description'}
                      style={{
                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0, cursor: 'help',
                        background: job.filterSalaryTier === 'ats' ? '#16a34a' : '#3b82f6',
                      }}
                    />
                  )}
                  {salary}
                </Badge>
              )}
            </div>
          )}
          </div>
        </a>
        <SaveJobButton jobId={job._id} size={14} style={{ position: 'absolute', top: 6, right: 6 }} />
      </div>
    );
  })
);

interface MobileProps {
  job: IJob;
  applied?: boolean;
  /** Full path for the card link, e.g. '/jobs/abc' or '/remote-jobs/abc'. */
  href: string;
  index?: number;
}

export const MobileJobCard = memo(function MobileJobCard({ job, applied, href, index }: MobileProps) {
  return (
    <div className="card-enter" style={enterStyle(index)}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="job-card"
        style={{
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'transparent', padding: '14px 12px',
          textAlign: 'left', width: '100%',
          display: 'flex', alignItems: 'flex-start', gap: 10,
          textDecoration: 'none', color: 'inherit',
        }}
      >
        <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
        <p className="job-card__title" style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.3, paddingRight: 26 }}>{job.JobTitle}</p>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 4 }}>{job.Company} · {displayLocation(job)}</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>{relativeDate(job.PostedDate || job.scrapedAt)}</p>
        {(applied || job.filterVisa === 'available' || job.filterRelocation === 'available') && (
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
            {applied && <Badge variant="green" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>✓ Applied</Badge>}
            {job.filterVisa === 'available' && <Badge variant="green" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>Visa</Badge>}
            {job.filterRelocation === 'available' && <Badge variant="neutral" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>Relocation</Badge>}
          </div>
        )}
        </div>
      </a>
      <SaveJobButton jobId={job._id} style={{ position: 'absolute', top: 10, right: 8 }} />
    </div>
  );
});