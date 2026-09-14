'use client';

import { Briefcase, MapPin, GraduationCap, Languages, Wrench, FolderOpen } from 'lucide-react';
import { Card, Badge } from './ui';
import type { ResumeProfile } from '../utils/resumeMatchApi';

interface Props {
  profile: ResumeProfile;
}

function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: 'var(--muted-ink)' }}>
      <span style={{ color: 'var(--subtle-ink)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  );
}

function formatEducation(edu: ResumeProfile['education']): string | null {
  if (!edu || edu.length === 0) return null;
  return edu.map(e => {
    const parts = [e.degree, e.field].filter(Boolean).join(' in ');
    return e.institution ? `${parts} — ${e.institution}` : parts;
  }).join(' · ');
}

function currentRole(profile: ResumeProfile): string | null {
  const current = profile.experience?.find(e => e.isCurrent);
  return current?.title || profile.experience?.[0]?.title || null;
}

export default function ParsedProfileCard({ profile }: Props) {
  const skills = profile.skills ?? [];
  const languages = profile.languages ?? [];

  const years = profile.total_experience_years;
  const expLabel = years != null
    ? `${years} yr${years === 1 ? '' : 's'} experience`
    : 'Experience not specified';

  const role = currentRole(profile);
  const eduStr = formatEducation(profile.education);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' }}>
            {profile.name || 'Candidate'}
          </h2>
          {role && (
            <p style={{ margin: '3px 0 0', fontSize: '0.9rem', color: 'var(--muted-ink)' }}>{role}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {profile.seniority_level && <Badge variant="primary">{profile.seniority_level}</Badge>}
          {profile.domain && <Badge variant="blue">{profile.domain}</Badge>}
          {profile.sub_domain && <Badge variant="neutral">{profile.sub_domain}</Badge>}
        </div>
      </div>

      {profile.summary && (
        <p style={{ margin: '14px 0 0', fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-secondary, var(--muted-ink))' }}>
          {profile.summary}
        </p>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <MetaRow icon={<Briefcase size={15} />}>{expLabel}</MetaRow>
        {profile.location && <MetaRow icon={<MapPin size={15} />}>{profile.location}</MetaRow>}
        {eduStr && <MetaRow icon={<GraduationCap size={15} />}>{eduStr}</MetaRow>}
        {languages.length > 0 && (
          <MetaRow icon={<Languages size={15} />}>
            {languages.map(l => `${l.language} (${l.proficiency})`).join(' · ')}
          </MetaRow>
        )}
      </div>

      {skills.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Wrench size={14} style={{ color: 'var(--subtle-ink)' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted-ink)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Skills
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skills.map((skill, i) => (
              <Badge key={`${skill.name}-${i}`} variant="neutral">
                {skill.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {profile.projects && profile.projects.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <FolderOpen size={14} style={{ color: 'var(--subtle-ink)' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted-ink)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Projects
            </span>
          </div>
          {profile.projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 8, fontSize: '0.84rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
              {p.description && <span style={{ color: 'var(--muted-ink)' }}> — {p.description}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}