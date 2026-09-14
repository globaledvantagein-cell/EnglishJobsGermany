'use client';

import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import type { IAdminJob } from '../../types';
import FormattedDescription from '../FormattedDescription';
import { Badge, Button } from '../ui';
import { formatPostedDate } from '../../utils/date';
import { isMeaningful, detailedSalary } from '../../utils/job';
import EditableLocation from './EditableLocation';

export function isCleanDepartment(value?: string | null) {
  if (!isMeaningful(value)) return false;
  const normalized = String(value).trim();
  if (normalized.length > 30) return false;
  if (/\d/.test(normalized)) return false;
  return true;
}

export function normalizeConfidence(score?: number) {
  if (score == null) return 0;
  if (score > 1) return score / 100;
  return score;
}

export function confidenceVariant(score?: number) {
  const normalized = normalizeConfidence(score);
  if (normalized >= 0.9) return 'green' as const;
  if (normalized >= 0.7) return 'yellow' as const;
  return 'red' as const;
}

export function confidenceLabel(score?: number) {
  return `${Math.round(normalizeConfidence(score) * 100)}%`;
}

interface Props {
  job: IAdminJob;
  onDecision: (id: string, decision: 'accept' | 'reject') => void;
  onUpdateJob: (updated: IAdminJob) => void;
}

export default function ReviewDetail({ job, onDecision, onUpdateJob }: Props) {
  const evidence = (job as any)?.Evidence?.german_reason as string | undefined;
  const salary = detailedSalary(job);
  const confidence = normalizeConfidence(job.ConfidenceScore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface-2)', padding: 16 }}>
        <span style={{ position: 'absolute', right: 14, top: 14, fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
          {job.ATSPlatform || 'unknown'}
        </span>

        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 'clamp(1.2rem,2.6vw,1.55rem)', color: 'var(--text-primary)', marginBottom: 10, paddingRight: 80 }}>
          {job.JobTitle}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 10 }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{job.Company}</span>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <EditableLocation job={job} onSave={updated => onUpdateJob(updated as IAdminJob)} />
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Posted: {formatPostedDate(job.PostedDate || job.scrapedAt)}</span>
        </div>

        <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
          {isCleanDepartment(job.Department) && <Badge variant="neutral">{job.Department}</Badge>}
          {(job.Domain === 'Technical' || job.Domain === 'Non-Technical') && <Badge variant={job.Domain === 'Technical' ? 'green' : 'neutral'}>{job.Domain}</Badge>}
          {isMeaningful(job.ExperienceLevel) && job.ExperienceLevel !== 'N/A' && <Badge variant="neutral">{job.ExperienceLevel}</Badge>}
          {isMeaningful(job.WorkplaceType) && job.WorkplaceType !== 'Unspecified' && <Badge variant="blue">{job.WorkplaceType}</Badge>}
          {isMeaningful(job.EmploymentType) && <Badge variant="neutral">{job.EmploymentType}</Badge>}
        </div>

        {salary && (
          <p style={{ marginBottom: 8, fontSize: '0.96rem', fontWeight: 700, color: 'var(--success)' }}>{salary}</p>
        )}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface)', padding: 14 }}>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <Badge variant={job.GermanRequired ? 'red' : 'green'}>
            {job.GermanRequired
              ? <><AlertCircle size={12} /> German Required: Yes {'\u274C'}</>
              : <><CheckCircle2 size={12} /> German Required: No {'\u2705'}</>}
          </Badge>
          <Badge variant={confidenceVariant(confidence)}>
            Confidence: {confidenceLabel(confidence)}
          </Badge>
        </div>

        {evidence && (
          <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid var(--acid)', borderRadius: 10, background: 'var(--bg-surface-2)', padding: '12px 14px' }}>
            <p style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>AI Evidence</p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.7, fontStyle: 'italic' }}>{evidence}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" onClick={() => onDecision(job._id, 'reject')}>Reject</Button>
        <Button variant="success" onClick={() => onDecision(job._id, 'accept')}>Approve</Button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface)', padding: 14 }}>
        <FormattedDescription description={job.Description || ''} />
      </div>

      <div className="flex justify-start">
        <a href={job.ApplicationURL} target="_blank" rel="noopener noreferrer">
          <Button>Apply Now <ExternalLink size={13} /></Button>
        </a>
      </div>
    </div>
  );
}