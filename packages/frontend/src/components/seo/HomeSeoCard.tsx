// Server-rendered, crawlable job card for the homepage grid. A real
// <a href="/jobs/:id"> (no client JS / onClick) so the 9 latest jobs appear in
// the initial HTML for SEO. Borderless + elevated; the lift + title-tint hover
// come from the .home-job-card CSS class (theme-aware), keeping this a pure
// anchor. No badges on the homepage — those live on the /jobs detail view.

import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { IJob } from '@/types';
import { relativeDate } from '@/utils/date';
import { getDisplayLocation } from '@/utils/job';

export default function HomeSeoCard({ job }: { job: IJob }) {
  const location = getDisplayLocation(job) || 'Germany';

  return (
    <Link
      href={`/jobs/${job._id}`}
      className="home-job-card"
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-surface-2)',
        borderRadius: 12,
        padding: 20,
        textDecoration: 'none',
        color: 'inherit',
        height: '100%',
      }}
    >
      <h3 className="home-job-card__title" style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.35 }}>
        {job.JobTitle}
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
        {job.Company} · {location}
      </p>
      <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: 0, marginTop: 'auto', paddingTop: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Clock size={11} /> {relativeDate(job.PostedDate || job.scrapedAt)}
      </p>
    </Link>
  );
}
