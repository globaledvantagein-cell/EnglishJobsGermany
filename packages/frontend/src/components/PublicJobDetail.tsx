'use client';

import { useEffect } from 'react';
import { ExternalLink, Check } from 'lucide-react';
import type { IJob } from '../types';
import { track } from '../utils/analytics';
import SaveJobButton from './SaveJobButton';
import { parseAllLocations, detailedSalary, getDisplayLocation } from '../utils/job';
import { useAuth } from '../context/AuthContext';
import { useHydrated } from '../hooks/useHydrated';
import { useAppliedJobs } from '../context/AppliedJobsContext';
import { apiPost, ApiError } from '../utils/jobApi';
import { JobDetailView } from './job-detail';
import type { GateUsage } from '../types';
import { isFeatureOn } from '../hooks/useFeature';

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
  // Signed-out until hydrated so the first render matches the server HTML.
  const hydrated = useHydrated();
  const { isAuthenticated: authed } = useAuth();
  const isAuthenticated = hydrated && authed;
  const { isApplied, addPending } = useAppliedJobs();
  const applied = hydrated && isApplied(job._id);

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

  const primaryLocation = getDisplayLocation(job);
  const locations = [primaryLocation, ...parseAllLocations(job).slice(1)];

  // Apply requires auth — even if the user is under the view limit,
  // applying is the highest-value action and is always gated.
  const applyTarget = job.DirectApplyURL || job.ApplicationURL;

  const handleApplyClick = () => {
    // Kill switch: the apply link itself always works; only tracking stops.
    if (!isFeatureOn('applyTracking')) return;

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

  // Applied state uses success green as a confirmation cue.
  const applyButton = isAuthenticated ? (
    <a className="jd-apply" data-applied={applied} href={applyTarget} target="_blank" rel="noopener noreferrer" onClick={handleApplyClick}>
      {applied ? <>Applied <Check size={16} /></> : <>Apply now <ExternalLink size={16} /></>}
    </a>
  ) : (
    <button type="button" className="jd-apply" onClick={() => onAuthRequired?.()}>
      Sign in to apply <ExternalLink size={16} />
    </button>
  );

  // An apply CLICK opened the company's ATS — it is NOT a confirmed application,
  // so the copy stays "apply clicks". Only shown when there's at least one.
  const meta = job.applyClicks > 0 ? `${job.applyClicks} apply ${job.applyClicks === 1 ? 'click' : 'clicks'}` : null;

  return (
    <JobDetailView
      job={job}
      location={primaryLocation}
      locations={locations}
      salary={detailedSalary(job)}
      apply={applyButton}
      extraActions={<SaveJobButton jobId={job._id} size={18} style={{ width: 44, height: 44, border: '1px solid var(--border)', borderRadius: 10 }} />}
      ctaNote={isAuthenticated ? 'Opens the employer’s application page' : 'A free account is required to apply'}
      meta={meta}
      sharePath={`/jobs/${job._id}`}
      companyJobsPath={`/jobs?company=${encodeURIComponent(job.Company)}`}
    />
  );
}
