'use client';

/**
 * Detail pane for one admin job (review queue + trash).
 *
 * Layout: fixed header (title, company, editable location, status pills) →
 * scrolling body (field grid, AI evidence, description) → fixed action bar
 * supplied by the caller. Only the body scrolls, so the decision buttons are
 * always in the same place.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink, MapPin, Pencil } from 'lucide-react';
import type { IAdminJob } from '../../types';
import FormattedDescription from '../FormattedDescription';
import { apiPatch } from '../../utils/jobApi';
import { detailedSalary, isMeaningful } from '../../utils/job';
import { useAdminUi } from './AdminUiContext';
import { Btn, DefinitionGrid, Meter, Pill, errorText, fmtAge, fmtDate } from './primitives';

type AdminJob = IAdminJob & {
  approvalMethod?: string | null;
  autoPublishedAt?: string | null;
  createdAt?: string;
  Evidence?: { german_reason?: string } | null;
};

function meaningful(value?: string | null): string | null {
  return isMeaningful(value) && value !== 'N/A' && value !== 'Unspecified' ? String(value) : null;
}

interface Props {
  job: AdminJob;
  actions: ReactNode;
  onJobUpdated?: (job: IAdminJob) => void;
  /** Shown on narrow screens where the detail replaces the list. */
  onBack?: () => void;
  /** Bumped by the parent to open the location editor from a hotkey. */
  editLocationSignal?: number;
  banner?: ReactNode;
}

export function AdminJobDetail({ job, actions, onJobUpdated, onBack, editLocationSignal, banner }: Props) {
  const salary = detailedSalary(job);
  const evidence = job.Evidence?.german_reason;
  const isLive = job.Status === 'active';
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // New job → start reading from the top.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [job._id]);

  return (
    <>
      <header className="adm-detail-head">
        {onBack && (
          <Btn size="sm" variant="ghost" onClick={onBack} className="adm-show-sm" style={{ marginBottom: 6 }}>
            <ArrowLeft size={13} />Back to list
          </Btn>
        )}
        <h2 className="adm-detail-title">{job.JobTitle}</h2>
        <div className="adm-row adm-wrap" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{job.Company}</span>
          <span className="adm-muted">·</span>
          <EditableLocation key={`${job._id}:${job.Location}`} job={job} onSaved={onJobUpdated} openSignal={editLocationSignal} />
          <span className="adm-muted">·</span>
          <span className="adm-muted" title={job.scrapedAt}>scraped {fmtAge(job.scrapedAt)} ago</span>
        </div>
        <div className="adm-row adm-wrap" style={{ marginTop: 8 }}>
          {job.Status === 'pending_review' && <Pill tone="warn">Needs decision</Pill>}
          {isLive && <Pill tone="accent">Live · auto-published</Pill>}
          {job.Status === 'rejected' && <Pill tone="bad">Rejected</Pill>}
          <Pill tone={job.GermanRequired ? 'bad' : 'ok'}>German {job.GermanRequired ? 'required' : 'not required'}</Pill>
          <Pill tone="outline"><Meter value={job.ConfidenceScore} /></Pill>
          {meaningful(job.Domain) && <Pill>{job.Domain}</Pill>}
          {meaningful(job.WorkplaceType) && <Pill>{job.WorkplaceType}</Pill>}
          {salary && <Pill tone="ok">{salary}</Pill>}
        </div>
      </header>

      <div className="adm-detail-scroll" ref={scrollRef}>
        <div className="adm-stack" style={{ gap: 12 }}>
          {banner}
          {job.RejectionReason && (
            <div className="adm-callout" data-tone="bad">
              <div className="adm-callout-label">Rejection reason</div>
              {job.RejectionReason}
            </div>
          )}
          {evidence && (
            <div className="adm-callout">
              <div className="adm-callout-label">AI evidence</div>
              <em>{evidence}</em>
            </div>
          )}

          <DefinitionGrid items={[
            ['Category', meaningful(job.Category) ?? '—'],
            ['Department', meaningful(job.Department) ?? '—'],
            ['Sub-domain', meaningful(job.SubDomain) ?? '—'],
            ['Experience', meaningful(job.ExperienceLevel) ?? '—'],
            ['Employment', meaningful(job.EmploymentType) ?? meaningful(job.ContractType) ?? '—'],
            ['Country', job.Country || '—'],
            ['Posted', fmtDate(job.PostedDate)],
            ['ATS', job.ATSPlatform || '—'],
            ['Source', job.sourceSite || '—'],
            ['Approval', job.approvalMethod === 'ai_auto' ? `AI auto · ${fmtDate(job.autoPublishedAt)}` : job.approvalMethod || '—'],
            ['All locations', job.AllLocations?.length ? job.AllLocations.join(' · ') : '—'],
            ['Job ID', <span key="id" className="adm-mono">{job.JobID}</span>],
          ]} />

          <div className="adm-row adm-wrap">
            <a className="adm-btn" href={job.ApplicationURL} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} />Open source posting
            </a>
            {isLive && (
              <a className="adm-btn" data-variant="ghost" href={`/jobs/${job._id}`} target="_blank" rel="noopener noreferrer">
                View on site
              </a>
            )}
          </div>

          <div className="adm-panel" style={{ padding: '10px 14px' }}>
            <div className="adm-prose">
              {job.Description
                ? <FormattedDescription description={job.Description} />
                : <span className="adm-muted">No description stored.</span>}
            </div>
          </div>
        </div>
      </div>

      <footer className="adm-actionbar">{actions}</footer>
    </>
  );
}

/**
 * Inline location editor. Enter saves, Escape cancels. The parent keys it on
 * job id + location, so switching jobs or saving resets it without an effect.
 */
function EditableLocation({ job, onSaved, openSignal }: { job: IAdminJob; onSaved?: (job: IAdminJob) => void; openSignal?: number }) {
  const { toast } = useAdminUi();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(job.Location || '');
  const [saving, setSaving] = useState(false);

  // The "e" hotkey bumps openSignal; adopt each new value by opening the editor.
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    setEditing(true);
  }

  const save = async () => {
    const next = value.trim();
    if (!next || next === job.Location) { setEditing(false); return; }
    setSaving(true);
    try {
      const updated = await apiPatch<IAdminJob>(`/api/jobs/admin/update/${job._id}`, { Location: next });
      onSaved?.(updated);
      setEditing(false);
      toast('Location updated');
    } catch (err) {
      toast(`Could not update location: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit location (e)"
        className="adm-row"
        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--adm-ink-2)', gap: 4 }}
      >
        <MapPin size={12} />
        <span style={{ borderBottom: '1px dashed var(--adm-line-strong)' }}>{job.Location || 'No location'}</span>
        <Pencil size={11} className="adm-muted" />
      </button>
    );
  }

  return (
    <span className="adm-row">
      <input
        className="adm-input"
        style={{ width: 220, height: 24 }}
        value={value}
        autoFocus
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setValue(job.Location || ''); setEditing(false); }
        }}
      />
      <Btn size="sm" variant="primary" onClick={save} loading={saving}>Save</Btn>
      <Btn size="sm" variant="ghost" onClick={() => { setValue(job.Location || ''); setEditing(false); }}>Cancel</Btn>
    </span>
  );
}
