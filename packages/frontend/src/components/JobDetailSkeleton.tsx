'use client';

/**
 * Loading skeleton mirroring the layout of PublicJobDetail — a header card
 * (title, company/location, badges, buttons) above a description card.
 * Uses the shared `.skeleton` shimmer class from index.css; all dimensions
 * are inline so no extra CSS is needed.
 */
export default function JobDetailSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Section 1 — Header card */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface-2)', padding: 16 }}>
        {/* Posted date */}
        <div className="skeleton" style={{ float: 'right', height: 12, width: 90 }} />

        {/* Job title — two lines */}
        <div className="skeleton" style={{ height: 22, width: '78%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 22, width: '52%', marginBottom: 14 }} />

        {/* Company / location row */}
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <div className="skeleton" style={{ height: 14, width: 110 }} />
          <div className="skeleton" style={{ height: 14, width: 6 }} />
          <div className="skeleton" style={{ height: 14, width: 80 }} />
        </div>

        {/* Badge row */}
        <div className="flex gap-2" style={{ marginBottom: 10 }}>
          <div className="skeleton" style={{ height: 22, width: 88, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 22, width: 68, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 22, width: 76, borderRadius: 6 }} />
        </div>

        {/* Button row */}
        <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
          <div className="skeleton" style={{ height: 34, width: 130, borderRadius: 10 }} />
          <div className="skeleton" style={{ height: 34, width: 84, borderRadius: 10 }} />
          <div className="skeleton" style={{ height: 22, width: 110, borderRadius: 10 }} />
        </div>
      </div>

      {/* Section 2 — Description card */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface)', padding: 14 }}>
        {/* Section heading */}
        <div className="skeleton" style={{ height: 14, width: 120, marginBottom: 12 }} />

        {/* Paragraph lines */}
        <div className="skeleton" style={{ height: 12, width: '96%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '88%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '92%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 16 }} />

        {/* Blockquote block */}
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 14, marginBottom: 16 }}>
          <div className="skeleton" style={{ height: 12, width: '82%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: '74%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: '78%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: '65%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: '80%' }} />
        </div>

        {/* Second heading */}
        <div className="skeleton" style={{ height: 14, width: 90, marginBottom: 12 }} />

        {/* Second paragraph */}
        <div className="skeleton" style={{ height: 12, width: '94%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '85%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '70%' }} />
      </div>
    </div>
  );
}