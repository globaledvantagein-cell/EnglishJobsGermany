/**
 * Placeholder that mirrors DesktopJobCard's structure (logo, title, meta,
 * badge row) so the swap to real content does not shift the list.
 *
 * Server-safe (no hooks) — used by app/**\/loading.tsx as well as the
 * client-side loading state in JobBrowsePage.
 */
export function JobCardSkeleton({ badges = 2 }: { badges?: number }) {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 6 }} />
      <div className="skeleton-card__lines">
        <div className="skeleton" style={{ height: 14, width: '58%', borderRadius: 5 }} />
        <div className="skeleton" style={{ height: 11, width: '38%', borderRadius: 5 }} />
        {badges > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            {Array.from({ length: badges }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 20, width: 56 + i * 14, borderRadius: 6 }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A column of card skeletons with varied badge rows so it doesn't look stamped. */
export function JobListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="status" aria-label="Loading jobs">
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} badges={i % 3 === 1 ? 0 : i % 3 === 2 ? 3 : 2} />
      ))}
    </div>
  );
}

/**
 * Whole-page skeleton for the browse routes: mirrors JobBrowsePage's shell
 * (sticky rail + card column) so the route transition lands on the same
 * layout the real page will occupy.
 */
export function BrowsePageSkeleton() {
  const line = (w: string | number, h = 12) => (
    <div className="skeleton" style={{ height: h, width: w, borderRadius: 5 }} />
  );
  return (
    <div style={{ background: 'var(--bg-base)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="dashboard-shell" style={{ paddingTop: 10 }}>
        <div className="browse-layout">
          <aside className="browse-sidebar" aria-hidden="true">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
              {line(60, 10)}
              <div className="skeleton" style={{ height: 34, borderRadius: 999 }} />
              {line(90, 11)}
              {[80, 48, 120, 100, 110, 130, 90, 105].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="skeleton" style={{ width: 13, height: 13, borderRadius: 3 }} />
                  {line(w, 11)}
                  <div style={{ marginLeft: 'auto' }}>{line(22, 10)}</div>
                </div>
              ))}
              {['Date posted', 'Workplace', 'Experience', 'Employment', 'Company'].map(l => (
                <div key={l} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>{line(l.length * 7, 11)}</div>
              ))}
            </div>
          </aside>
          <main className="browse-jobs-grid">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, minHeight: 20 }}>
              {line(44, 14)}{line(30, 11)}
            </div>
            <div className="desktop-cards-only"><JobListSkeleton count={8} /></div>
            <div className="mobile-list-only"><JobListSkeleton count={4} /></div>
          </main>
        </div>
      </div>
    </div>
  );
}
