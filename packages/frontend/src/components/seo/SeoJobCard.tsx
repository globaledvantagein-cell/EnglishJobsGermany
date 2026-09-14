// Server-rendered job card for SEO listing pages (city/category). Unlike
// HomeJobCard this is a real crawlable <a href="/jobs/:id"> with no client JS.

import Link from 'next/link';
import type { IJob } from '@/types';

function primaryLocation(job: IJob): string {
  if (Array.isArray(job.AllLocations) && job.AllLocations.length > 0) return job.AllLocations[0];
  return job.Location || 'Germany';
}

export default function SeoJobCard({ job }: { job: IJob }) {
  const badges = [
    job.WorkplaceType && job.WorkplaceType !== 'Unspecified' ? job.WorkplaceType : null,
    job.ExperienceLevel && job.ExperienceLevel !== 'N/A' ? job.ExperienceLevel : null,
    job.EmploymentType || null,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/jobs/${job._id}`}
      style={{
        display: 'block',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 18px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <h3
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: 0,
          lineHeight: 1.35,
        }}
      >
        {job.JobTitle}
      </h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
        {job.Company} • {primaryLocation(job)}
      </p>
      {badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {badges.map((b) => (
            <span
              key={b}
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--bg-subtle, rgba(0,0,0,0.05))',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
