'use client';

import { CheckCircle, AlertCircle } from 'lucide-react';
import { Badge, Button } from './ui';
import FormattedDescription from './FormattedDescription';
import { CONTENT } from '../theme/content';
import { formatPostedDate } from '../utils/date';

interface Evidence {
  german_reason: string;
}

export interface JobLog {
  _id: string;
  JobID: string;
  JobTitle: string;
  Company: string;
  GermanRequired: boolean;
  ConfidenceScore: number;
  Status: string;
  FinalDecision: string;
  scrapedAt: string;
  PostedDate: string | null;
  Description: string;
  Evidence?: Evidence;
}

interface Props {
  log: JobLog;
  onReanalyze: () => void;
  isReanalyzing: boolean;
  reanalyzeMsg?: string;
}

export default function AdminLogDetail({ log, onReanalyze, isReanalyzing, reanalyzeMsg }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface-2)', padding: 16, position: 'relative' }}>
        <span style={{ position: 'absolute', right: 14, top: 14, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {(log.PostedDate || log.scrapedAt)
            ? `${CONTENT.admin.jobTestLogs.labels.postedPrefix} ${formatPostedDate(log.PostedDate || log.scrapedAt)}`
            : `${CONTENT.admin.jobTestLogs.labels.postedPrefix} ${CONTENT.admin.jobTestLogs.labels.postedFallback}`}
        </span>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 'clamp(1.2rem,2.6vw,1.55rem)', color: 'var(--text-primary)', marginBottom: 10, paddingRight: 80 }}>
          {log.JobTitle}
        </h2>

        <div className="flex items-center flex-wrap gap-2" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{log.Company}</span>
          <span style={{ color: 'var(--text-muted)' }}>•</span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            ID: <code style={{ background: 'var(--border)', padding: '2px 4px', borderRadius: 4 }}>{log.JobID}</code>
          </span>
        </div>

        <div className="flex flex-wrap gap-2 items-center" style={{ marginBottom: 10 }}>
          <Badge variant={log.FinalDecision === 'accepted' ? 'green' : 'red'}>
            {log.FinalDecision === 'accepted' ? CONTENT.admin.jobTestLogs.labels.accepted : CONTENT.admin.jobTestLogs.labels.rejected}
          </Badge>
          <Badge variant={log.ConfidenceScore >= 0.9 ? 'green' : log.ConfidenceScore >= 0.7 ? 'neutral' : 'red'}>
            Confidence: {Math.round(log.ConfidenceScore * 100)}%
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 16 }}>
          <Button size="sm" onClick={onReanalyze} variant="outline" loading={isReanalyzing}>
             Re-analyze
          </Button>
          {reanalyzeMsg && (
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {reanalyzeMsg}
            </span>
          )}
        </div>
      </div>

       <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
          gap: 12, 
          padding: 'clamp(10px, 2vw, 14px)', 
          background: 'var(--bg-surface-2)', 
          border: '1px solid var(--border)',
          borderRadius: 10 
        }}>
          <div>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
              {CONTENT.admin.jobTestLogs.labels.germanRequired}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {log.GermanRequired ? <AlertCircle size={16} color="var(--danger)" /> : <CheckCircle size={16} color="var(--success)" />}
              <span style={{ fontSize: 'clamp(0.8rem, 2vw, 0.88rem)', fontWeight: 600, color: log.GermanRequired ? 'var(--danger)' : 'var(--success)' }}>
                {log.GermanRequired ? CONTENT.admin.jobTestLogs.labels.yes : CONTENT.admin.jobTestLogs.labels.no}
              </span>
            </div>
          </div>
        </div>

      {log.Evidence && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface-2)', padding: 14 }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
            {CONTENT.admin.jobTestLogs.labels.aiEvidence}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ 
                padding: 'clamp(8px, 2vw, 10px) clamp(10px, 2.5vw, 14px)', 
                background: 'var(--bg-base)', 
                borderLeft: '3px solid var(--acid)', 
                borderRadius: '0 8px 8px 0' 
            }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {CONTENT.admin.jobTestLogs.labels.germanEvidence}
                </p>
                <p style={{ fontSize: 'clamp(0.75rem, 2vw, 0.82rem)', color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic', wordBreak: 'break-word' }}>
                {log.Evidence.german_reason || CONTENT.admin.jobTestLogs.labels.noEvidence}
                </p>
            </div>
            </div>
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-surface)', padding: 14 }}>
        <FormattedDescription description={log.Description || ''} />
      </div>
    </div>
  );
}