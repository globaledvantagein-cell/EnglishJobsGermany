'use client';

/**
 * /admin/jobs/new — manually publish a job. POST /api/jobs creates it with
 * Status 'active' and pushes it straight into the live cache.
 *
 * Layout follows how the best ATS job pages are structured (Ashby, captured
 * with REA): structured facts in a narrow left column, the description in a
 * wide right column with Write / Preview tabs. Below the description, a live
 * preview of the card as it will appear in the feed, and a readiness
 * checklist so nothing half-filled gets published.
 *
 * The draft autosaves to localStorage (this browser only) so a reload never
 * loses a half-typed job. Ctrl/⌘ + Enter publishes.
 */
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Building2, Check, Circle, ExternalLink, MapPin, PlusSquare, RotateCcw } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../../utils/jobApi';
import { CATEGORY_ORDER } from '../../utils/categorize';
import { GERMAN_CITY_NAMES } from '../../utils/germanCities';
import FormattedDescription from '../../components/FormattedDescription';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { Btn, Field, Kbd, Page, Panel, Pill, Seg, errorText } from '../../components/admin/primitives';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  JobTitle: '', Company: '', ApplicationURL: '', Location: 'Berlin', WorkplaceType: 'Onsite',
  ContractType: 'Full-time', ExperienceLevel: '', Category: '', Department: '',
  SalaryMin: '', SalaryMax: '', PostedDate: today(), Description: '',
};
type FormState = typeof EMPTY;
type DescTab = 'write' | 'preview';

const DRAFT_KEY = 'ejg_admin_job_draft';
const CONTRACT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];
const WORKPLACES = ['Onsite', 'Hybrid', 'Remote'] as const;
const EXPERIENCE = ['', 'Entry', 'Mid', 'Senior', 'Lead'] as const;
const MIN_WORDS = 80;

function loadDraft(): FormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch { return EMPTY; }
}

const fmtSalary = (min: string, max: string) => {
  const k = (v: string) => `€${Math.round(Number(v) / 1000)}k`;
  if (Number(min) > 0 && Number(max) > 0) return `${k(min)}–${k(max)}`;
  if (Number(min) > 0) return `from ${k(min)}`;
  if (Number(max) > 0) return `up to ${k(max)}`;
  return null;
};

function hostOf(url: string): string | null {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
}

export default function AdminAddJob() {
  const { toast } = useAdminUi();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<DescTab>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Array<{ _id: string; JobTitle: string; Company: string }>>([]);
  const [companies, setCompanies] = useState<string[]>([]);

  // Restore the draft after mount (localStorage isn't available during SSR).
  useEffect(() => { setForm(loadDraft()); setHydrated(true); }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* private mode */ }
  }, [form, hydrated]);

  useEffect(() => {
    apiGet<string[]>('/api/jobs/company-names').then(list => setCompanies(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);

  const set = (name: keyof FormState, value: string) => setForm(prev => ({ ...prev, [name]: value }));
  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    set(e.target.name as keyof FormState, e.target.value);

  const words = useMemo(() => form.Description.trim().split(/\s+/).filter(Boolean).length, [form.Description]);
  const host = hostOf(form.ApplicationURL);
  const knownCompany = companies.some(c => c.toLowerCase() === form.Company.trim().toLowerCase());
  const salary = fmtSalary(form.SalaryMin, form.SalaryMax);
  const salaryInvalid = Number(form.SalaryMin) > 0 && Number(form.SalaryMax) > 0 && Number(form.SalaryMin) > Number(form.SalaryMax);

  const checks = [
    { label: 'Title, company & URL', ok: Boolean(form.JobTitle.trim() && form.Company.trim() && host), required: true },
    { label: `Description ≥ ${MIN_WORDS} words`, ok: words >= MIN_WORDS, required: false },
    { label: 'Category set', ok: Boolean(form.Category), required: false },
    { label: 'Experience level', ok: Boolean(form.ExperienceLevel), required: false },
    { label: 'Salary range valid', ok: !salaryInvalid, required: true },
  ];
  const canPublish = checks.every(c => !c.required || c.ok);

  const reset = () => { setForm({ ...EMPTY, PostedDate: today() }); setError(null); setTab('write'); };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canPublish || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiPost<{ _id: string; JobTitle: string; Company: string }>('/api/jobs', { ...form, GermanRequired: false });
      setAdded(prev => [created, ...prev].slice(0, 5));
      reset();
      toast(`Published: ${created.JobTitle}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'A job with this application URL already exists.' : errorText(err));
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/⌘ + Enter publishes from anywhere in the form (including the textarea).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
  };

  return (
    <Page
      title="Add job"
      sub="Publishes immediately to the German feed (no AI review). Draft autosaves in this browser."
      actions={
        <>
          <Btn variant="ghost" onClick={reset} disabled={saving}><RotateCcw size={13} />Clear</Btn>
          <Btn variant="primary" onClick={() => submit()} loading={saving} disabled={!canPublish} kbd="⌘↵">
            <PlusSquare size={13} />Publish job
          </Btn>
        </>
      }
    >
      <form onSubmit={submit} onKeyDown={onKeyDown} className="adm-addjob">
        {/* ── Left: structured facts ─────────────────────────────── */}
        <div className="adm-stack">
          <Panel title="Role">
            <div className="adm-stack" style={{ gap: 8 }}>
              <Field label="Job title *">
                <input className="adm-input" name="JobTitle" required value={form.JobTitle} onChange={change} placeholder="Senior Backend Engineer" autoFocus maxLength={160} />
              </Field>
              <Field
                label="Company *"
                hint={form.Company.trim() ? (knownCompany ? <span style={{ color: 'var(--adm-ok)' }}>Existing company — logo &amp; page will link up</span> : 'New company') : undefined}
              >
                <input className="adm-input" name="Company" required value={form.Company} onChange={change} placeholder="ACME GmbH" list="adm-companies" />
                <datalist id="adm-companies">{companies.map(c => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Application URL *" hint={form.ApplicationURL ? (host ? `Applies on ${host}` : <span style={{ color: 'var(--adm-bad)' }}>Not a valid URL</span>) : undefined}>
                <input className="adm-input" name="ApplicationURL" type="url" required value={form.ApplicationURL} onChange={change} placeholder="https://company.com/careers/…" />
              </Field>
              <div className="adm-grid adm-cols-2">
                <Field label="Category">
                  <select className="adm-select" name="Category" value={form.Category} onChange={change}>
                    <option value="">Auto (AI categorizer)</option>
                    {CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Department">
                  <input className="adm-input" name="Department" value={form.Department} onChange={change} placeholder="Engineering" />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Where & how">
            <div className="adm-stack" style={{ gap: 8 }}>
              <Field label="Location">
                <input className="adm-input" name="Location" value={form.Location} onChange={change} list="adm-cities" placeholder="Berlin" />
                <datalist id="adm-cities">{GERMAN_CITY_NAMES.map(c => <option key={c} value={c} />)}</datalist>
              </Field>
              <div className="adm-field">
                <span>Workplace</span>
                <Seg label="Workplace" value={form.WorkplaceType} onChange={v => set('WorkplaceType', v)}
                  options={WORKPLACES.map(w => ({ value: w, label: w }))} />
              </div>
              <div className="adm-field">
                <span>Experience</span>
                <Seg label="Experience" value={form.ExperienceLevel} onChange={v => set('ExperienceLevel', v)}
                  options={EXPERIENCE.map(x => ({ value: x, label: x || 'Any' }))} />
              </div>
              <div className="adm-grid adm-cols-2">
                <Field label="Contract">
                  <select className="adm-select" name="ContractType" value={form.ContractType} onChange={change}>
                    {CONTRACT_TYPES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Posted">
                  <input className="adm-input" name="PostedDate" type="date" value={form.PostedDate} onChange={change} max={today()} />
                </Field>
              </div>
              <div className="adm-grid adm-cols-2">
                <Field label="Salary min (€/yr)">
                  <input className="adm-input" name="SalaryMin" inputMode="numeric" value={form.SalaryMin} onChange={change} placeholder="60000" />
                </Field>
                <Field label="Salary max (€/yr)" hint={salaryInvalid ? <span style={{ color: 'var(--adm-bad)' }}>Max is below min</span> : undefined}>
                  <input className="adm-input" name="SalaryMax" inputMode="numeric" value={form.SalaryMax} onChange={change} placeholder="80000" />
                </Field>
              </div>
            </div>
          </Panel>
        </div>

        {/* ── Right: description, preview, readiness ─────────────── */}
        <div className="adm-stack" style={{ minWidth: 0 }}>
          <Panel
            title="Description"
            meta={`${words} words`}
            actions={<Seg<DescTab> label="Description view" value={tab} onChange={setTab} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />}
            flush
          >
            {tab === 'write' ? (
              <textarea
                className="adm-textarea adm-addjob-desc"
                name="Description"
                value={form.Description}
                onChange={change}
                placeholder={'About the role…\n\nWhat you\'ll do\n- …\n\nWhat we\'re looking for\n- …\n\nEnglish is the working language.'}
              />
            ) : (
              <div className="adm-addjob-desc adm-prose" style={{ overflowY: 'auto', padding: '10px 14px' }}>
                {form.Description.trim() ? <FormattedDescription description={form.Description} /> : <span className="adm-muted">Nothing to preview yet.</span>}
              </div>
            )}
          </Panel>

          <div className="adm-grid adm-addjob-bottom">
            <Panel title="Feed preview">
              <div className="adm-addjob-card">
                <div className="adm-addjob-logo"><Building2 size={16} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="adm-cell-strong adm-truncate" style={{ fontSize: 14 }}>{form.JobTitle || 'Job title'}</div>
                  <div className="adm-muted adm-truncate">{form.Company || 'Company'}</div>
                  <div className="adm-row adm-wrap" style={{ gap: 4, marginTop: 6 }}>
                    <Pill tone="outline"><MapPin size={10} />{form.Location || 'Germany'}</Pill>
                    <Pill tone="outline">{form.WorkplaceType}</Pill>
                    <Pill tone="outline">{form.ContractType}</Pill>
                    {form.ExperienceLevel && <Pill tone="outline">{form.ExperienceLevel}</Pill>}
                    {salary && <Pill tone="ok">{salary}</Pill>}
                    {form.Category && <Pill tone="accent">{form.Category}</Pill>}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Ready to publish" meta={`${checks.filter(c => c.ok).length}/${checks.length}`}>
              <ul className="adm-checklist">
                {checks.map(c => (
                  <li key={c.label} data-ok={c.ok}>
                    {c.ok ? <Check size={13} /> : <Circle size={13} />}
                    <span>{c.label}</span>
                    {!c.ok && <span className="adm-muted">{c.required ? 'required' : 'recommended'}</span>}
                  </li>
                ))}
              </ul>
              {error && <div className="adm-callout" data-tone="bad" style={{ marginTop: 8 }}>{error}</div>}
              <div className="adm-muted" style={{ fontSize: 11.5, marginTop: 8 }}><Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> publishes</div>
            </Panel>
          </div>

          {added.length > 0 && (
            <Panel title="Added this session" meta={`${added.length}`} flush>
              {added.map(job => (
                <div key={job._id} className="adm-row" style={{ padding: '0 10px', minHeight: 'var(--adm-row)', borderBottom: '1px solid var(--adm-line)' }}>
                  <Check size={13} style={{ color: 'var(--adm-ok)' }} />
                  <span className="adm-cell-strong adm-truncate">{job.JobTitle}</span>
                  <span className="adm-muted adm-truncate adm-grow">{job.Company}</span>
                  <a className="adm-btn" data-size="sm" data-variant="ghost" href={`/jobs/${job._id}`} target="_blank" rel="noopener noreferrer">
                    View <ExternalLink size={12} />
                  </a>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </form>
    </Page>
  );
}
