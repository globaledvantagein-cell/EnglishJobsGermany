import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '70vh', display: 'flex', alignItems: 'center' }}>
      <div className="page-enter" style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary)' }}>404</p>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.03em', fontWeight: 800, margin: '8px 0 10px', color: 'var(--text-primary)' }}>
          That page isn’t here
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 auto 22px', maxWidth: 380 }}>
          The link may be old or mistyped. The jobs are still where they always are.
        </p>
        <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/jobs" className="btn btn-primary" style={{
            display: 'inline-flex', alignItems: 'center', padding: '10px 20px', borderRadius: 10,
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none',
          }}>Browse jobs</Link>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none' }}>
            Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
