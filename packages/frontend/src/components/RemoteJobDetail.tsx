'use client';

/**
 * Detail page body for a REMOTE job. Sibling of PublicJobDetail.tsx.
 *
 * The German panel gates Apply behind sign-in and meters apply-clicks against
 * the weekly limit. Remote jobs are free: Apply is a plain outbound link for
 * everyone, signed in or not, with no metering call and no gate callbacks.
 */
import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import type { IJob } from '../types';
import { track } from '../utils/analytics';
import { parseAllLocations, detailedSalary } from '../utils/job';
import { getRemoteDisplayLocation } from '../utils/remoteJob';
import { JobDetailView } from './job-detail';
import { useJobReadTime } from '../hooks/useJobReadTime';

export default function RemoteJobDetail({ job }: { job: IJob }) {
  const primaryLocation = getRemoteDisplayLocation(job);
  const locations = [primaryLocation, ...parseAllLocations(job).slice(1)];
  const applyTarget = job.DirectApplyURL || job.ApplicationURL;

  // Same events as the German page (PublicJobDetail), told apart by `vertical`.
  useEffect(() => {
    track('job_viewed', { vertical: 'remote', job_id: job._id, job_title: job.JobTitle, company: job.Company, category: job.Category, country: job.Country });
  }, [job._id, job.JobTitle, job.Company, job.Category, job.Country]);
  useJobReadTime(job._id, 'remote');

  // No auth check and no metering POST — remote applies are ungated.
  const applyButton = (
    <a
      className="jd-apply" href={applyTarget} target="_blank" rel="noopener noreferrer"
      onClick={() => track('job_applied', { vertical: 'remote', job_id: job._id, company: job.Company, country: job.Country })}
    >
      Apply on company site <ExternalLink size={16} />
    </a>
  );

  return (
    <JobDetailView
      job={job}
      location={primaryLocation}
      locations={locations}
      salary={detailedSalary(job)}
      workplace="Remote"
      apply={applyButton}
      ctaNote="Opens the employer’s application page"
      sharePath={`/remote-jobs/${job._id}`}
      companyJobsPath={`/remote-jobs?company=${encodeURIComponent(job.Company)}`}
    />
  );
}
