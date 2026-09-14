'use client';

/**
 * Detail panel for a REMOTE job. Sibling of PublicJobDetail.tsx.
 *
 * The German panel gates Apply behind sign-in and meters apply-clicks against
 * the weekly limit. Remote jobs are free: Apply is a plain outbound link for
 * everyone, signed in or not, with no metering call and no gate callbacks.
 */
import { useState } from 'react';
import { ExternalLink, MapPin, Share2, Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { IJob } from '../types';
import { track } from '../utils/analytics';
import CompanyLogo from './CompanyLogo';
import FormattedDescription from './FormattedDescription';
import { formatPostedDate } from '../utils/date';
import { parseAllLocations, isMeaningful, detailedSalary } from '../utils/job';
import { getRemoteDisplayLocation } from '../utils/remoteJob';
import { Badge } from './ui';

export default function RemoteJobDetail({ job }: { job: IJob }) {
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [copied, setCopied] = useState(false);

  const allLocations = parseAllLocations(job);
  const primaryLocation = getRemoteDisplayLocation(job);
  const extraLocations = allLocations.slice(1);
  const salary = detailedSalary(job);
  const applyTarget = job.DirectApplyURL || job.ApplicationURL;

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/remote-jobs?id=${job._id}`;
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

  const applyStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    whiteSpace: 'nowrap',
    background: 'var(--primary)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '11px 22px',
    fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none',
    transition: 'filter 0.16s ease',
  };
  const dim = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.filter = 'brightness(0.93)'; };
  const undim = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.filter = 'none'; };

  // No auth check and no metering POST — remote applies are ungated.
  const applyButton = (
    <a
      href={applyTarget} target="_blank" rel="noopener noreferrer"
      onClick={() => track('remote_job_applied', { job_id: job._id, company: job.Company, country: job.Country })}
      style={applyStyle} onMouseEnter={dim} onMouseLeave={undim}
    >
      Apply Now <ExternalLink size={16} />
    </a>
  );

  const shareButton = (
    <button
      type="button" onClick={handleShare}
      aria-label="Share this job" title={copied ? 'Copied!' : 'Share'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40, flexShrink: 0, borderRadius: 10,
        border: '1px solid var(--border)', background: 'transparent',
        color: copied ? 'var(--acid)' : 'var(--text-muted)', cursor: 'pointer',
        transition: 'color 0.16s ease, background 0.16s ease',
      }}
    >
      {copied ? <Check size={18} /> : <Share2 size={18} />}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <span style={{ position: 'absolute', right: 0, top: 2, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Posted: {formatPostedDate(job.PostedDate)}
        </span>
        <h2 style={{ fontSize: 'clamp(1.2rem,2.4vw,1.5rem)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, paddingRight: 120, lineHeight: 1.3 }}>
          {job.JobTitle}
        </h2>

        <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: 10 }}>
          <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={36} />
          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{job.Company}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} /> {primaryLocation}
          </span>
          <Badge variant="blue" style={{ fontSize: '0.72rem' }}>Remote</Badge>
        </div>

        <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
          {isMeaningful(job.ExperienceLevel) && job.ExperienceLevel !== 'N/A' && <Badge variant="neutral">{job.ExperienceLevel}</Badge>}
          {isMeaningful(job.EmploymentType) && <Badge variant="neutral">{job.EmploymentType}</Badge>}
        </div>

        {salary && (
          <p style={{ marginBottom: 8, fontSize: '0.96rem', fontWeight: 700, color: 'var(--success)' }}>
            {salary}
          </p>
        )}

        {extraLocations.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() => setShowAllLocations(previous => !previous)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              {showAllLocations ? 'Hide locations' : `${extraLocations.length + 1} locations`}
            </button>
            {showAllLocations && (
              <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                {allLocations.map(location => (
                  <Badge key={location} variant="neutral" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>{location}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          {applyButton}
          {shareButton}
        </div>
      </div>

      <div style={{ padding: '6px 2px', maxWidth: 720 }}>
        {job.DescriptionHtml ? (
          <div className="job-description-html" dangerouslySetInnerHTML={{ __html: job.DescriptionHtml }} />
        ) : (
          <FormattedDescription description={job.Description || ''} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        {applyButton}
        {shareButton}
      </div>
    </div>
  );
}
