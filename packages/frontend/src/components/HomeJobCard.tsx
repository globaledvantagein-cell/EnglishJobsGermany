'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from '@/compat/router';
import { ArrowUpRight } from 'lucide-react';
import type { IJob } from '../types';
import { Badge } from './ui';
import CompanyLogo from '../components/CompanyLogo';
import { relativeDate } from '../utils/date';
import { compactSalary, parseAllLocations, getPrimaryLocation } from '../utils/job';
import { getCategoryLabel } from '../utils/categorize';

interface HomeJobCardProps {
  job: IJob;
}

export default function HomeJobCard({ job }: HomeJobCardProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const destination = `/jobs/${job._id}`;
  const salary = compactSalary(job);
  const allLocations = parseAllLocations(job);
  const location = getPrimaryLocation(job, allLocations) || 'Germany';

  // getCategoryLabel, not a raw map lookup: jobs the AI categorizer has not
  // reached yet still hold a legacy slug, which would render as a blank chip.
  const categoryLabel = getCategoryLabel(job.Category);

  const badges = [
    categoryLabel
      ? { label: categoryLabel, variant: 'blue' as const }
      : null,
    job.Domain && (job.Domain === 'Technical' || job.Domain === 'Non-Technical')
      ? { label: job.Domain, variant: job.Domain === 'Technical' ? 'blue' as const : 'neutral' as const }
      : null,
    job.ExperienceLevel && job.ExperienceLevel !== 'N/A'
      ? { label: job.ExperienceLevel, variant: 'neutral' as const }
      : null,
    job.WorkplaceType && job.WorkplaceType !== 'Unspecified'
      ? { label: job.WorkplaceType, variant: 'blue' as const }
      : null,
    salary
      ? { label: salary, variant: 'green' as const }
      : null,
  ].filter(Boolean).slice(0, 4) as Array<{ label: string; variant: 'blue' | 'neutral' | 'green' }>;

  const openJob = () => navigate(destination);

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openJob();
    }
  };

  const stopCardNavigation = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${job.JobTitle} at ${job.Company}`}
      onClick={openJob}
      onKeyDown={onCardKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid',
        borderColor: hovered ? 'var(--primary)' : 'var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
        transition: 'border-color 0.22s, box-shadow 0.22s',
        boxShadow: hovered ? '0 8px 24px rgba(0, 0, 0, 0.08)' : 'none',
      }}
    >
      <CompanyLogo companyName={job.Company || 'J'} domain={job.companyDomain ?? undefined} size={32} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, margin: 0, wordBreak: 'break-word' }}>
              {job.JobTitle}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
              {job.Company} • {location} • {relativeDate(job.PostedDate || job.scrapedAt)}
            </p>
          </div>

          {job.ApplicationURL && (
            <a
              href={job.ApplicationURL}
              target="_blank"
              rel="noreferrer"
              onClick={stopCardNavigation}
              onMouseDown={stopCardNavigation}
              style={{
                color: 'var(--primary)',
                textDecoration: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                marginLeft: 'auto',
              }}
              aria-label={`Apply for ${job.JobTitle} at ${job.Company}`}
            >
              Apply <ArrowUpRight size={13} />
            </a>
          )}
        </div>

        {badges.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {badges.map(badge => (
              <Badge key={badge.label} variant={badge.variant} style={{ fontSize: '0.68rem', padding: '2px 8px', fontFamily: 'inherit', fontWeight: 600 }}>
                {badge.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}