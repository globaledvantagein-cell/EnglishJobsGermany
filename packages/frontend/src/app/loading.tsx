// Root fallback for every route without its own loading.tsx: a quiet page
// skeleton so navigations never show a blank or frozen screen.
export default function Loading() {
  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '70vh' }} role="status" aria-label="Loading page">
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 24px)' }}>
        <div className="skeleton" style={{ height: 12, width: 90, marginBottom: 18 }} />
        <div className="skeleton" style={{ height: 34, width: '46%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '62%', marginBottom: 32 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ borderRadius: 14, padding: 20, flexDirection: 'column', gap: 10 }}>
              <div className="skeleton" style={{ height: 14, width: '55%' }} />
              <div className="skeleton" style={{ height: 11, width: '85%' }} />
              <div className="skeleton" style={{ height: 11, width: '70%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
