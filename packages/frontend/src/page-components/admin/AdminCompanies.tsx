'use client';

/**
 * /admin/companies — every company with live jobs, plus its editable profile.
 *
 *   GET   /api/jobs/directory                    companies + open-role counts
 *   GET   /api/admin/company-profiles            description / website / logo
 *   PATCH /api/admin/company-profiles/:name      upsert a profile
 *   DELETE /api/jobs/company?name=…              remove ALL of a company's jobs
 *
 * Profiles are keyed server-side on a normalized name; the UI matches them back
 * to directory rows by displayName, which is set from the row it was edited on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { useAdminCounts } from '../../components/admin/AdminShell';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useHotkeys, stepSelection } from '../../components/admin/useHotkeys';
import {
  Btn, DefinitionGrid, Empty, Field, Page, Pill, Seg, SearchInput, SkeletonRows, errorText, fmtDate, fmtNumber,
} from '../../components/admin/primitives';

interface Company { _id: string; companyName: string; openRoles: number; cities: string[]; source: string }
interface Profile { _id: string; displayName: string; description?: string; website?: string | null; logo?: string | null; updatedAt?: string }

type ProfileFilter = 'all' | 'with' | 'without';

const DESCRIPTION_MAX = 600;

export default function AdminCompanies() {
  const { toast, confirm } = useAdminUi();
  const { refreshCounts } = useAdminCounts();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProfileFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [directory, profileRes] = await Promise.all([
        apiGet<Company[]>('/api/jobs/directory', { noAuth: true }),
        apiGet<{ profiles: Profile[] }>('/api/admin/company-profiles'),
      ]);
      setCompanies(Array.isArray(directory) ? directory : []);
      setProfiles(new Map((profileRes.profiles ?? []).map(p => [p.displayName.toLowerCase(), p])));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const profileOf = useCallback((c: Company) => profiles.get(c.companyName.toLowerCase()), [profiles]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter(c => {
      const has = Boolean(profileOf(c)?.description);
      if (filter === 'with' && !has) return false;
      if (filter === 'without' && has) return false;
      return !q || c.companyName.toLowerCase().includes(q) || c.cities.some(city => city.toLowerCase().includes(q));
    });
  }, [companies, query, filter, profileOf]);
  const visibleIds = useMemo(() => visible.map(c => c._id), [visible]);
  // Falls back to the first visible row when a filter hides the selection.
  const effectiveId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0] ?? null;
  const selected = companies.find(c => c._id === effectiveId) ?? null;
  const withProfile = useMemo(() => companies.filter(c => profileOf(c)?.description).length, [companies, profileOf]);
  const totalRoles = useMemo(() => companies.reduce((s, c) => s + (c.openRoles || 0), 0), [companies]);


  const move = (delta: number) => setSelectedId(stepSelection(visibleIds, effectiveId, delta));
  useHotkeys({
    j: () => move(1), ArrowDown: () => move(1),
    k: () => move(-1), ArrowUp: () => move(-1),
    '/': () => searchRef.current?.focus(),
  });

  const handleSaved = (profile: Profile) => {
    setProfiles(prev => new Map(prev).set(profile.displayName.toLowerCase(), profile));
  };

  const deleteJobs = async (company: Company) => {
    const ok = await confirm({
      title: `Delete all ${company.openRoles} jobs from ${company.companyName}?`,
      body: 'Every job for this company is removed from the database and the live site. This cannot be undone; the next scrape may add them back.',
      confirmLabel: 'Delete jobs',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await apiDelete<{ message: string }>(`/api/jobs/company?name=${encodeURIComponent(company.companyName)}`);
      toast(res.message || 'Deleted');
      setCompanies(prev => prev.filter(c => c._id !== company._id));
      refreshCounts();
    } catch (err) {
      toast(`Delete failed: ${errorText(err)}`, { tone: 'bad' });
    }
  };

  const columns: Column<Company>[] = [
    { key: 'name', header: 'Company', render: c => <span className="adm-cell-strong">{c.companyName}</span>, title: c => c.companyName, sortValue: c => c.companyName.toLowerCase() },
    { key: 'roles', header: 'Live jobs', width: 80, align: 'right', render: c => fmtNumber(c.openRoles), sortValue: c => -c.openRoles },
    { key: 'cities', header: 'Cities', width: '32%', hideOnSmall: true, render: c => <span className="adm-muted">{c.cities.join(', ') || '—'}</span>, title: c => c.cities.join(', ') },
    {
      key: 'profile', header: 'Profile', width: 88,
      render: c => (profileOf(c)?.description ? <Pill tone="ok">Done</Pill> : <Pill tone="outline">Missing</Pill>),
      sortValue: c => (profileOf(c)?.description ? 1 : 0),
    },
  ];

  return (
    <Page
      title="Companies"
      sub={`${fmtNumber(companies.length)} companies · ${fmtNumber(totalRoles)} live jobs · ${fmtNumber(withProfile)} with a profile`}
      actions={<Btn onClick={load} loading={loading && companies.length > 0}><RefreshCw size={13} />Refresh</Btn>}
      flush
    >
      <div className="adm-split" data-detail-open={mobileDetail ? 'true' : 'false'} style={{ ['--adm-split-list' as string]: '58%' }}>
        <div className="adm-split-list">
          <div className="adm-toolbar">
            <Seg<ProfileFilter>
              label="Profile"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: companies.length },
                { value: 'without', label: 'Missing profile', count: companies.length - withProfile },
                { value: 'with', label: 'Has profile', count: withProfile },
              ]}
            />
            <span className="adm-grow" />
            <SearchInput value={query} onChange={setQuery} placeholder="Company or city" width={190} inputRef={searchRef} />
          </div>
          {loading && companies.length === 0 ? <SkeletonRows rows={18} cols={4} /> : error ? (
            <Empty title="Could not load companies" body={error} action={<Btn onClick={load}>Retry</Btn>} />
          ) : (
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={c => c._id}
              selectedKey={effectiveId}
              onRowClick={c => { setSelectedId(c._id); setMobileDetail(true); }}
              initialSort={{ key: 'roles', dir: 'asc' }}
              empty={<Empty title="No companies match" />}
              footer={<span>{fmtNumber(visible.length)} shown</span>}
            />
          )}
        </div>
        <div className="adm-split-detail">
          {selected ? (
            <ProfileEditor
              key={selected._id}
              company={selected}
              profile={profileOf(selected)}
              onSaved={handleSaved}
              onDeleteJobs={() => deleteJobs(selected)}
              onBack={() => setMobileDetail(false)}
            />
          ) : <Empty title={loading ? 'Loading…' : 'Select a company'} />}
        </div>
      </div>
    </Page>
  );
}

function ProfileEditor({ company, profile, onSaved, onDeleteJobs, onBack }: {
  company: Company; profile?: Profile; onSaved: (p: Profile) => void; onDeleteJobs: () => void; onBack: () => void;
}) {
  const { toast } = useAdminUi();
  const [description, setDescription] = useState(profile?.description ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [logo, setLogo] = useState(profile?.logo ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = description !== (profile?.description ?? '') || website !== (profile?.website ?? '') || logo !== (profile?.logo ?? '');

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiPatch<{ profile: Profile }>(
        `/api/admin/company-profiles/${encodeURIComponent(company.companyName)}`,
        { description, website, logo },
      );
      onSaved(res.profile);
      toast(`Saved profile: ${company.companyName}`);
    } catch (err) {
      toast(`Save failed: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="adm-detail-head">
        <Btn size="sm" variant="ghost" onClick={onBack} className="adm-show-sm" style={{ marginBottom: 6 }}>← Back to list</Btn>
        <div className="adm-row" style={{ gap: 10 }}>
          {logo
            ? <img src={logo} alt="" width={32} height={32} style={{ borderRadius: 6, objectFit: 'contain', background: 'var(--adm-sunken)' }} />
            : <span className="adm-brand-mark" style={{ width: 32, height: 32, background: 'var(--adm-sunken)', color: 'var(--adm-ink-2)' }}>{company.companyName.slice(0, 2).toUpperCase()}</span>}
          <div className="adm-grow">
            <h2 className="adm-detail-title" style={{ margin: 0 }}>{company.companyName}</h2>
            <span className="adm-muted">{fmtNumber(company.openRoles)} live jobs · {company.cities.join(', ') || 'no city'}</span>
          </div>
        </div>
      </header>
      <div className="adm-detail-scroll">
        <div className="adm-stack" style={{ gap: 12 }}>
          <DefinitionGrid items={[
            ['Live jobs', fmtNumber(company.openRoles)],
            ['Source', company.source],
            ['Profile updated', fmtDate(profile?.updatedAt)],
          ]} />
          <Field label="Description" hint={`${description.length}/${DESCRIPTION_MAX} · shown on the company page and job pages`}>
            <textarea
              className="adm-textarea"
              rows={9}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={`What does ${company.companyName} do? Who is it a good fit for?`}
            />
          </Field>
          <div className="adm-grid adm-cols-2">
            <Field label="Website">
              <input className="adm-input" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Logo URL">
              <input className="adm-input" type="url" value={logo} onChange={e => setLogo(e.target.value)} placeholder="https://…/logo.png" />
            </Field>
          </div>
          <div className="adm-row adm-wrap">
            <a className="adm-btn" data-variant="ghost" href={`/jobs?company=${encodeURIComponent(company.companyName)}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} />Jobs on site
            </a>
            {website && (
              <a className="adm-btn" data-variant="ghost" href={website} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />Website</a>
            )}
          </div>
        </div>
      </div>
      <footer className="adm-actionbar">
        <Btn variant="danger" onClick={onDeleteJobs}><Trash2 size={13} />Delete all jobs</Btn>
        <span className="adm-grow" />
        {dirty && <span className="adm-muted" style={{ fontSize: 12 }}>Unsaved changes</span>}
        <Btn variant="primary" onClick={save} loading={saving} disabled={!dirty}><Save size={13} />Save profile</Btn>
      </footer>
    </>
  );
}
