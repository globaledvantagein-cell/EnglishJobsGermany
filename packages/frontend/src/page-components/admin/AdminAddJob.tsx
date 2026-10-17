'use client';

/**
 * /admin/jobs/new — manually publish a job. POST /api/jobs creates it with
 * Status 'active' and pushes it straight into the live cache.
 */
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ExternalLink, PlusSquare } from 'lucide-react';
import { apiPost, ApiError } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { Btn, Field, Page, Panel, errorText } from '../../components/admin/primitives';

const EMPTY = {
  JobTitle: '', ApplicationURL: '', Company: '', Location: 'Germany', Department: '',
  ContractType: 'Full-time', ExperienceLevel: '', PostedDate: '', Description: '',
};
type FormState = typeof EMPTY;

const CONTRACT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];
const EXPERIENCE_LEVELS = ['', 'Entry', 'Mid', 'Senior', 'Lead', 'Staff'];

export default function AdminAddJob() {
  const { toast } = useAdminUi();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ _id: string; JobTitle: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await apiPost<{ _id: string; JobTitle: string }>('/api/jobs', { ...form, GermanRequired: false });
      setLastAdded(created);
      setForm(EMPTY);
      toast(`Published: ${created.JobTitle}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'A job with this application URL already exists.' : errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Add job" sub="Publishes immediately to the German feed — no AI review">
      <form onSubmit={submit} style={{ maxWidth: 980 }}>
        <div className="adm-stack">
          {lastAdded && (
            <div className="adm-callout">
              <div className="adm-callout-label">Last added</div>
              <span className="adm-row">
                {lastAdded.JobTitle}
                <a className="adm-btn" data-size="sm" data-variant="ghost" href={`/jobs/${lastAdded._id}`} target="_blank" rel="noopener noreferrer">
                  View on site <ExternalLink size={12} />
                </a>
              </span>
            </div>
          )}
          <Panel title="Job details">
            <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <Field label="Job title *" span={2}>
                <input className="adm-input" name="JobTitle" required value={form.JobTitle} onChange={change} placeholder="Senior Backend Engineer" />
              </Field>
              <Field label="Company *" span={2}>
                <input className="adm-input" name="Company" required value={form.Company} onChange={change} placeholder="ACME GmbH" />
              </Field>
              <Field label="Application URL *" span={4}>
                <input className="adm-input" name="ApplicationURL" type="url" required value={form.ApplicationURL} onChange={change} placeholder="https://…" />
              </Field>
              <Field label="Location">
                <input className="adm-input" name="Location" value={form.Location} onChange={change} />
              </Field>
              <Field label="Department">
                <input className="adm-input" name="Department" value={form.Department} onChange={change} placeholder="Engineering" />
              </Field>
              <Field label="Contract type">
                <select className="adm-select" name="ContractType" value={form.ContractType} onChange={change}>
                  {CONTRACT_TYPES.map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Experience">
                <select className="adm-select" name="ExperienceLevel" value={form.ExperienceLevel} onChange={change}>
                  {EXPERIENCE_LEVELS.map(v => <option key={v} value={v}>{v || 'Not set'}</option>)}
                </select>
              </Field>
              <Field label="Posted date">
                <input className="adm-input" name="PostedDate" type="date" value={form.PostedDate} onChange={change} />
              </Field>
              <Field label="Description" span={4} hint="Plain text or markdown-style bullets; shown on the job page.">
                <textarea className="adm-textarea" name="Description" rows={12} value={form.Description} onChange={change} placeholder="Role overview, responsibilities, requirements…" />
              </Field>
            </div>
          </Panel>
          <div className="adm-row">
            {error && <span style={{ color: 'var(--adm-bad)' }}>{error}</span>}
            <span className="adm-grow" />
            <Btn variant="ghost" onClick={() => { setForm(EMPTY); setError(null); }} disabled={saving}>Clear</Btn>
            <Btn type="submit" variant="primary" loading={saving}><PlusSquare size={13} />Publish job</Btn>
          </div>
        </div>
      </form>
    </Page>
  );
}
