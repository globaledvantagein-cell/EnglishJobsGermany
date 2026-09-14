'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { Link } from '@/compat/router';
import { ExternalLink, MapPin, Share2, Check } from 'lucide-react';
import type { IJob } from '../types';
import { track } from '../utils/analytics';
import CompanyLogo from './CompanyLogo';
import FormattedDescription from './FormattedDescription';
import SaveJobButton from './SaveJobButton';
import { formatPostedDate } from '../utils/date';
import { parseAllLocations, isMeaningful, normalizeWorkplace, detailedSalary, getDisplayLocation } from '../utils/job';
import { Badge, ProBadge } from './ui';
import { useAuth } from '../context/AuthContext';
import { useAppliedJobs } from '../context/AppliedJobsContext';
import { apiPost, ApiError } from '../utils/jobApi';
import type { GateUsage } from '../types';

interface Props {
  job: IJob;
  /** Patches the in-memory list when applyClicks changes */
  onApplyTracked?: (jobId: string, applyClicks: number) => void;
  /** Called when an unauthenticated user clicks Apply — show the SignupGate */
  onAuthRequired?: () => void;
  /** Called when a free user hits the weekly apply-click limit (403 apply_limit) */
  onApplyLimit?: (usage?: GateUsage | null) => void;
}

export default function PublicJobDetail({ job, onApplyTracked, onAuthRequired, onApplyLimit }: Props) {
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [copied, setCopied] = useState(false);
  const { isAuthenticated, isPremium } = useAuth();
  const { isApplied, addPending } = useAppliedJobs();
  const applied = isApplied(job._id);

  // Per-job engagement funnel: viewed → applied. Fires on each full (non-gated)
  // job the user opens.
  useEffect(() => {
    track('job_viewed', {
      job_id: job._id,
      job_title: job.JobTitle,
      company: job.Company,
      category: job.Category,
      workplace: job.filterWorkplace,
      experience: job.filterExperience,
    });
  }, [job._id, job.JobTitle, job.Company, job.Category, job.filterWorkplace, job.filterExperience]);

  const shareUrl = `${window.location.origin}/jobs/${job._id}`;

  const handleShare = async () => {
    const shareData = { title: `${job.JobTitle} at ${job.Company}`, url: shareUrl };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch { /* user cancelled or unsupported — fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* rare clipboard failure — silent */ }
  };

  const allLocations = parseAllLocations(job);
  const primaryLocation = getDisplayLocation(job);
  const extraLocations = allLocations.slice(1);
  const salary = detailedSalary(job);
  const normalizedWorkplace = normalizeWorkplace(job.WorkplaceType);
  const showWorkplaceBadge = normalizedWorkplace === 'Remote' || normalizedWorkplace === 'Hybrid';

  // Apply requires auth — even if the user is under the view limit,
  // applying is the highest-value action and is always gated.
  const applyTarget = job.DirectApplyURL || job.ApplicationURL;

  const handleApplyClick = () => {
    // Queue for "Did you apply?" confirmation toast on tab refocus
    addPending(job._id, job.JobTitle, job.Company);

    // Track the click in the background — don't block navigation. A free user
    // over their weekly limit gets a 403 { gated, gateReason: 'apply_limit' };
    // surface the upgrade modal instead of silently swallowing it.
    apiPost<{ applyClicks: number }>(`/api/jobs/${job._id}/apply-click`, {})
      .then(result => {
        track('job_applied', { job_id: job._id, company: job.Company, category: job.Category });
        onApplyTracked?.(job._id, result.applyClicks ?? 0);
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 403 && err.body?.gateReason === 'apply_limit') {
          track('apply_click_gated', { views_used: err.body.usage?.used });
          onApplyLimit?.(err.body.usage ?? null);
          return;
        }
        console.error(err);
      });
  };

  // ── Shared action elements ───────────────────────────────────────────────
  // Apply is the primary action — a normal-sized brand-BLUE (--primary) button
  // sitting on one row beside the Share/Save icon buttons (slightly larger than
  // them, but not a full-width bar). Built as a plain anchor (not the Button
  // component) so its fill + hover aren't overridden by the .btn-primary:hover
  // rule. Applied state uses success green as a confirmation cue.
  const applyStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    whiteSpace: 'nowrap',
    background: applied ? 'var(--success)' : 'var(--primary)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '11px 22px',
    fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none',
    transition: 'filter 0.16s ease',
  };
  const dim = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.filter = 'brightness(0.93)'; };
  const undim = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.filter = 'none'; };

  const applyButton = isAuthenticated ? (
    <a href={applyTarget} target="_blank" rel="noopener noreferrer" onClick={handleApplyClick}
      style={applyStyle} onMouseEnter={dim} onMouseLeave={undim}>
      {applied ? <>Applied <Check size={16} /></> : <>Apply Now <ExternalLink size={16} /></>}
    </a>
  ) : (
    <button type="button" onClick={() => onAuthRequired?.()} style={applyStyle} onMouseEnter={dim} onMouseLeave={undim}>
      Sign in to apply <ExternalLink size={16} />
    </button>
  );

  // Share is now icon-only (secondary action) — a square ghost button.
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
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = copied ? 'var(--acid)' : 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
    >
      {copied ? <Check size={18} /> : <Share2 size={18} />}
    </button>
  );

  // An apply CLICK opened the company's ATS — it is NOT a confirmed application,
  // so the copy stays "apply clicks". Only shown when there's at least one.
  const appliedCount = job.applyClicks && job.applyClicks > 0 ? (
    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
      {job.applyClicks} apply clicks
    </p>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header — borderless; a bottom divider separates it from the description. */}
      <div style={{ position: 'relative', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <span style={{ position: 'absolute', right: 0, top: 2, fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {/* Subtle constant reminder of membership status for paying users. */}
          {isPremium && <ProBadge />}
          Posted: {formatPostedDate(job.PostedDate)}
        </span>
        <Link
          to={`/jobs/${job._id}`}
          style={{
            fontSize: 'clamp(1.2rem,2.4vw,1.5rem)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            textDecoration: 'none',
            display: 'block',
            marginBottom: 8,
            paddingRight: 80,
            lineHeight: 1.3,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        >
          {job.JobTitle}
        </Link>

        <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: 10 }}>
          <CompanyLogo companyName={job.Company} domain={job.companyDomain ?? undefined} size={36} />
          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{job.Company}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} /> {primaryLocation}
          </span>
          {showWorkplaceBadge && <Badge variant="blue" style={{ fontSize: '0.72rem' }}>{normalizedWorkplace}</Badge>}
        </div>

        <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
          {isMeaningful(job.ExperienceLevel) && job.ExperienceLevel !== 'N/A' && <Badge variant="neutral">{job.ExperienceLevel}</Badge>}
          {isMeaningful(job.EmploymentType) && <Badge variant="neutral">{job.EmploymentType}</Badge>}
          {job.GermanRequired === false && <Badge variant="acid">🇬🇧 English Only</Badge>}
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

        {/* Primary action row — Apply dominates; Share + Save are secondary icons. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          {applyButton}
          {shareButton}
          <SaveJobButton jobId={job._id} size={18} style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 10 }} />
        </div>
        {appliedCount && <div style={{ marginTop: 8 }}>{appliedCount}</div>}
      </div>

      {/* The description flows directly; capped to a comfortable reading measure. */}
      <div style={{ padding: '6px 2px', maxWidth: 720 }}>
        {job.DescriptionHtml ? (
          <div className="job-description-html" dangerouslySetInnerHTML={{ __html: job.DescriptionHtml }} />
        ) : (
          <FormattedDescription description={job.Description || ''} />
        )}
      </div>

      {/* Bottom action row — an identical compact Apply/Share/Save row after the
          JD so users don't have to scroll back up to apply. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        {applyButton}
        {shareButton}
        <SaveJobButton jobId={job._id} size={18} style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 10 }} />
      </div>
    </div>
  );
}