'use client';

import { useMemo } from 'react';
import { AlertTriangle, SearchX } from 'lucide-react';
import { EmptyState, Alert, Badge } from './ui';
import MatchResultCard from './MatchResultCard';
import type { MatchResult, MatchTier, MatchResponse } from '../utils/resumeMatchApi';

interface Props {
  data: MatchResponse;
}

const TIER_ORDER: MatchTier[] = ['strong', 'good', 'partial'];
const TIER_META: Record<MatchTier, { label: string; dot: string }> = {
  strong: { label: 'Strong Match', dot: 'var(--success)' },
  good: { label: 'Good Match', dot: 'var(--info)' },
  partial: { label: 'Partial Match', dot: 'var(--warning)' },
};

// Defensive: derive a tier from score if the backend ever omits/garbles it.
function resolveTier(r: MatchResult): MatchTier {
  if (r.tier === 'strong' || r.tier === 'good' || r.tier === 'partial') return r.tier;
  if (r.score >= 85) return 'strong';
  if (r.score >= 65) return 'good';
  return 'partial';
}

export default function MatchResults({ data }: Props) {
  const { results, meta } = data;

  const grouped = useMemo(() => {
    const buckets: Record<MatchTier, MatchResult[]> = { strong: [], good: [], partial: [] };
    for (const r of results || []) buckets[resolveTier(r)].push(r);
    // Highest score first within each tier.
    (Object.keys(buckets) as MatchTier[]).forEach(t => buckets[t].sort((a, b) => b.score - a.score));
    return buckets;
  }, [results]);

  const topScore = results?.[0]?.score ?? 0;
  const lowQuality = (results?.length ?? 0) > 0 && topScore < 50;

  if (!results || results.length === 0) {
    return (
      <EmptyState
        icon={<SearchX size={40} />}
        title="No matching jobs found"
        body={
          meta.afterHardFilter === 0
            ? 'No active jobs passed the initial filter for this profile. This can happen for very niche or senior domains.'
            : 'We scored the available jobs but none were a meaningful match for this resume right now.'
        }
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {lowQuality && (
        <Alert type="warning">
          <strong>Match quality is low for this profile.</strong> The best score is {topScore}. These may
          not be strong fits — consider a more detailed resume or a broader job set.
        </Alert>
      )}

      {TIER_ORDER.map(tier => {
        const items = grouped[tier];
        if (items.length === 0) return null;
        const m = TIER_META[tier];
        return (
          <section key={tier} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)' }}>
                {m.label}
              </h2>
              <Badge variant="neutral">{items.length}</Badge>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map(r => <MatchResultCard key={r.jobId} result={r} />)}
            </div>
          </section>
        );
      })}

      {/* Meta footer */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingTop: 6, fontSize: '0.76rem', color: 'var(--subtle-ink)' }}>
        <AlertTriangle size={12} />
        <span>
          {meta.totalJobsSearched.toLocaleString()} jobs searched · {meta.afterHardFilter} after filter ·{' '}
          {meta.geminiCallsUsed} AI calls · {(meta.processingTimeMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}