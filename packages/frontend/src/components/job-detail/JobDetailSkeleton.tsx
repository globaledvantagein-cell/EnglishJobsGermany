/**
 * Loading state for JobDetailView. Uses the same .jd-* classes so the header
 * card, description and aside sit exactly where the loaded page puts them —
 * the swap must not move anything. Server-safe (no hooks), so loading.tsx can
 * render it directly.
 */
import './jobDetail.css';

const bar = (width: number | string, height = 12, extra: React.CSSProperties = {}) => (
  <div className="skeleton" style={{ width, height, borderRadius: 6, ...extra }} />
);
const lines = (widths: string[]) => widths.map((w, i) => <div key={i}>{bar(w, 12, { marginBottom: 12 })}</div>);

export default function JobDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading job">
      <div className="jd-head">
        <div className="jd-logo">{bar(56, 56, { borderRadius: 12 })}</div>
        {bar(220, 14)}
        {bar('64%', 32, { margin: '4px 0' })}
        <div className="jd-where">{bar(150, 14)}</div>
        <div className="jd-actions">
          {bar(170, 46, { borderRadius: 10 })}
          {bar(46, 46, { borderRadius: 10 })}
          {bar(46, 46, { borderRadius: 10 })}
        </div>
      </div>

      <div className="jd-grid">
        <div className="jd-body">
          <div className="jd-main">
            {bar(140, 20, { marginBottom: 18 })}
            {lines(['96%', '91%', '94%', '58%'])}
            {bar(120, 15, { margin: '24px 0 14px' })}
            {lines(['88%', '93%', '84%', '90%', '66%'])}
            {bar(130, 15, { margin: '24px 0 14px' })}
            {lines(['92%', '86%', '72%'])}
          </div>
        </div>
        <div className="jd-aside">
          <div className="jd-card">
            {bar(90, 12, { marginBottom: 14 })}
            <div className="jd-facts">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="jd-fact">
                  {bar(16, 16)}
                  <div style={{ display: 'grid', gap: 6 }}>{bar(60, 10)}{bar('70%', 13)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
