'use client';

import { Building2, MapPin, ExternalLink, Check, X, Plus } from 'lucide-react';
import { Card, Badge } from './ui';
import type { MatchResult, MatchTier } from '../utils/resumeMatchApi';

const TIER_ACCENT: Record<MatchTier, string> = {
  strong: 'var(--success)',
  good: 'var(--info)',
  partial: 'var(--warning)',
};

function scoreColor(tier: MatchTier): string {
  return TIER_ACCENT[tier];
}

function SkillRow({ icon, color, label, skills }: { icon: React.ReactNode; color: string; label: string; skills: (string | { name: string; category?: string })[] }) {
  if (!skills || skills.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ color, display: 'flex', marginTop: 2, flexShrink: 0 }} title={label}>{icon}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {skills.map((s, i) => {
          const name = typeof s === 'string' ? s : s.name;
          return (
          <span
            key={`${name}-${i}`}
            style={{
              fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink)',
              background: 'var(--paper2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '2px 8px',
            }}
          >
            {name}
          </span>
          );
        })}
      </div>
    </div>
  );
}

const FIT_LABELS: Record<string, string> = {
  exact: 'Location: exact',
  same_country: 'Location: same country',
  remote_compatible: 'Location: remote-compatible',
  relocation_needed: 'Location: relocation needed',
  strong: 'Experience: strong fit',
  good: 'Experience: good fit',
  weak: 'Experience: weak fit',
  overqualified: 'Overqualified',
};

export default function MatchResultCard({ result }: { result: MatchResult }) {
  const { job, tier, score } = result;
  const accent = scoreColor(tier);
  const hasUrl = !!job?.ApplicationURL;

  return (
    <Card style={{ borderLeft: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Score badge */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div
            className="font-sketch-num"
            style={{ fontSize: '1.9rem', fontWeight: 700, color: accent, lineHeight: 1 }}
          >
            {score}
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--subtle-ink)', fontWeight: 700, letterSpacing: '0.05em' }}>
            / 100
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
            {job?.JobTitle || 'Untitled role'}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '5px 0 0', fontSize: '0.82rem', color: 'var(--muted-ink)' }}>
            {job?.Company && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Building2 size={13} /> {job.Company}
              </span>
            )}
            {job?.Location && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={13} /> {job.Location}
              </span>
            )}
            {job?.IsRemote && <Badge variant="green">Remote</Badge>}
          </div>

          {/* Fit chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {result.experience_fit && (
              <Badge variant={result.experience_fit === 'overqualified' ? 'yellow' : 'neutral'}>
                {FIT_LABELS[result.experience_fit] || result.experience_fit}
              </Badge>
            )}
            {result.location_fit && (
              <Badge variant="neutral">{FIT_LABELS[result.location_fit] || result.location_fit}</Badge>
            )}
          </div>

          {/* Skills breakdown */}
          <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
            <SkillRow icon={<Check size={14} strokeWidth={3} />} color="var(--success)" label="Matched skills" skills={result.matched_skills} />
            <SkillRow icon={<X size={14} strokeWidth={3} />} color="var(--danger)" label="Missing skills" skills={result.missing_skills} />
            <SkillRow icon={<Plus size={14} strokeWidth={3} />} color="var(--info)" label="Bonus skills" skills={result.bonus_skills} />
          </div>

          {result.reasoning && (
            <p style={{ margin: '12px 0 0', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary, var(--muted-ink))', fontStyle: 'italic' }}>
              “{result.reasoning}”
            </p>
          )}

          {hasUrl && (
            <div style={{ marginTop: 14 }}>
              <a
                href={job.ApplicationURL}
                target="_blank"
                rel="noopener noreferrer"
                className="sketch-ink"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                  padding: '8px 16px', borderRadius: 10, textDecoration: 'none',
                  color: 'var(--ink)', background: 'transparent',
                  border: '1.25px solid var(--ink-border-strong, var(--border-strong))',
                  transition: 'background-color 0.16s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                View Job <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}