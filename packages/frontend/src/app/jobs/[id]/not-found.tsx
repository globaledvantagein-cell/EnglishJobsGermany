import Link from 'next/link';
import { CATEGORY_ORDER, categorySlug } from '@/utils/categorize';

// Rendered with a real HTTP 404 when a job URL points to a removed/inactive
// listing. Instead of a dead end, offer a path forward (browse, search, related
// categories) so traffic from stale search results / bookmarks is retained.
export default function JobNotFound() {
  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '70vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(48px,8vw,88px) 24px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.6rem,4vw,2.2rem)', color: 'var(--text-primary)', margin: '0 0 12px' }}>
          This job is no longer available
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, margin: '0 0 28px' }}>
          The listing may have been filled or removed. There are plenty more
          English-speaking roles in Germany — no German required.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
          <Link
            href="/jobs"
            style={{ background: 'var(--acid)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '0.92rem', padding: '12px 22px', borderRadius: 10 }}
          >
            Browse all jobs
          </Link>
          <Link
            href="/directory"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.92rem', padding: '12px 22px', borderRadius: 10, border: '1px solid var(--border)' }}
          >
            Companies hiring
          </Link>
        </div>

        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>
          Explore by category
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {CATEGORY_ORDER.slice(0, 12).map((cat) => (
            <Link
              key={cat}
              href={`/category/${categorySlug(cat)}`}
              style={{
                fontSize: '0.85rem', padding: '6px 12px', borderRadius: 999,
                border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none',
              }}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
