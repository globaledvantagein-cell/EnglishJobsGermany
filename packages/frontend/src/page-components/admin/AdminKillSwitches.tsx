'use client';

/**
 * /admin/kill-switches — one click turns a feature off for every user, on
 * both the API (503 FEATURE_DISABLED) and the UI (hidden / "paused" notice).
 *
 * Layout follows the review queue: dense table on the left (one 30px row per
 * switch, toggle inline so a flip is one click), detail pane on the right
 * (what OFF does on each side, reason, audit trail). Fits ~25 switches on a
 * laptop screen without scrolling.
 *
 * Switches come from backend/src/features/featureRegistry.js; a new feature
 * shows up here on its own. See KILL_SWITCHES.md for the pattern.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, Clock, Monitor, Power, RefreshCw, Server } from 'lucide-react';
import { apiGet, apiPatch } from '../../utils/jobApi';
import { refreshFeatures } from '../../hooks/useFeature';
import { DataTable, type Column } from '../../components/admin/DataTable';
import {
  Btn, DefinitionGrid, Dot, Empty, Input, Page, Pill, SearchInput, Seg, SkeletonRows, errorText, fmtAge,
} from '../../components/admin/primitives';

interface HistoryEntry { enabled: boolean; by: string | null; reason: string | null; at: string }
interface Feature {
  key: string; group: string; label: string; description: string;
  ui: string | null; routes: string[];
  enabled: boolean; reason: string | null; updatedBy: string | null; updatedAt: string | null;
  history: HistoryEntry[];
}
interface Response { groups: string[]; features: Feature[] }
type StateFilter = 'all' | 'on' | 'off';

/** Tolerate an older/partial API response (e.g. mid-deploy) instead of crashing. */
const normalize = (res: Response): Response => ({
  groups: res.groups ?? [],
  features: (res.features ?? []).map(f => ({ ...f, routes: f.routes ?? [], history: f.history ?? [], ui: f.ui ?? null })),
});

const isCron = (f: Feature) => f.group === 'Background jobs';
const fmtWhen = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** One-click toggle. Stops propagation so it doesn't also select the row. */
function Switch({ feature, busy, onToggle }: { feature: Feature; busy: boolean; onToggle: (f: Feature) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={feature.enabled}
      aria-label={`${feature.label}: ${feature.enabled ? 'on' : 'off'}`}
      title={feature.enabled ? 'Click to switch OFF' : 'Click to switch ON'}
      className="adm-switch"
      disabled={busy}
      onClick={(e: MouseEvent) => { e.stopPropagation(); onToggle(feature); }}
    />
  );
}

/** API / UI / cron icons: where the switch acts, readable at a glance. */
function Scope({ feature }: { feature: Feature }) {
  const on = (active: boolean) => ({ opacity: active ? 0.85 : 0.18 });
  const hasUi = Boolean(feature.ui) && !isCron(feature) && !feature.ui!.startsWith('none');
  return (
    <span className="adm-row" style={{ gap: 5 }}>
      <span title={feature.routes.length ? `API: ${feature.routes.length} route rule(s)` : 'No API routes'} style={on(feature.routes.length > 0)}><Server size={13} /></span>
      <span title={hasUi ? `UI: ${feature.ui}` : 'No UI change'} style={on(hasUi)}><Monitor size={13} /></span>
      <span title={isCron(feature) ? 'Scheduled / background task' : 'Not scheduled'} style={on(isCron(feature))}><Clock size={13} /></span>
    </span>
  );
}

function Detail({ feature, busy, onToggle, reason, setReason, onBack }: {
  feature: Feature; busy: boolean; onToggle: (f: Feature) => void; reason: string; setReason: (v: string) => void; onBack: () => void;
}) {
  return (
    <>
      <header className="adm-detail-head">
        <Btn size="sm" variant="ghost" onClick={onBack} className="adm-show-sm" style={{ marginBottom: 6 }}>
          <ArrowLeft size={13} />All switches
        </Btn>
        <div className="adm-row" style={{ gap: 10 }}>
          <Dot tone={feature.enabled ? 'ok' : 'bad'} />
          <h2 className="adm-detail-title adm-grow" style={{ margin: 0 }}>{feature.label}</h2>
          <Switch feature={feature} busy={busy} onToggle={onToggle} />
        </div>
        <div className="adm-row adm-wrap" style={{ gap: 6, marginTop: 6 }}>
          <Pill tone={feature.enabled ? 'ok' : 'bad'}>{feature.enabled ? 'ON' : 'OFF'}</Pill>
          <Pill tone="outline">{feature.group}</Pill>
          <code className="adm-mono adm-muted" style={{ fontSize: 11.5 }}>{feature.key}</code>
        </div>
      </header>

      <div className="adm-detail-scroll">
        <div className="adm-stack" style={{ gap: 12 }}>
          {!feature.enabled && (
            <div className="adm-callout" data-tone="bad">
              <div className="adm-callout-label">Switched off{feature.updatedAt ? ` ${fmtAge(feature.updatedAt)} ago` : ''}</div>
              {feature.reason ?? 'No reason given.'}
            </div>
          )}

          <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>{feature.description}</p>

          <DefinitionGrid items={[
            ['Status', feature.enabled ? 'On' : 'Off'],
            ['Last change', feature.updatedAt ? fmtWhen(feature.updatedAt) : 'Never (default on)'],
            ['By', feature.updatedBy ?? '—'],
            ['Changes', String(feature.history.length)],
          ]} />

          <div className="adm-callout">
            <div className="adm-callout-label">When OFF</div>
            <div className="adm-stack" style={{ gap: 6, marginTop: 4 }}>
              <div className="adm-row" style={{ alignItems: 'flex-start', gap: 8 }}>
                <Server size={13} style={{ marginTop: 2, flex: 'none' }} />
                <div style={{ minWidth: 0 }}>
                  {feature.routes.length
                    ? feature.routes.map(r => <div key={r} className="adm-mono adm-truncate" style={{ fontSize: 11.5 }} title={r}>{r} → 503</div>)
                    : <span className="adm-muted">{isCron(feature) ? 'Scheduled run is skipped' : 'Server-side code path skipped'}</span>}
                </div>
              </div>
              <div className="adm-row" style={{ gap: 8 }}>
                <Monitor size={13} style={{ flex: 'none' }} />
                <span>{feature.ui ?? '—'}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="adm-callout-label" style={{ marginBottom: 4 }}>History</div>
            {feature.history.length === 0 ? <span className="adm-muted" style={{ fontSize: 12.5 }}>Never flipped.</span> : (
              <ol className="adm-timeline">
                {feature.history.map(h => (
                  <li key={h.at} data-tone={h.enabled ? 'ok' : 'bad'}>
                    <span className="adm-num adm-muted">{fmtWhen(h.at)}</span>
                    <span><b>{h.enabled ? 'On' : 'Off'}</b> · {h.by ?? '—'}</span>
                    {h.reason && <span className="adm-muted adm-truncate" title={h.reason}>“{h.reason}”</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <footer className="adm-actionbar">
        <Input
          placeholder={feature.enabled ? 'Why are you switching it off? (optional)' : 'Note (optional)'}
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={300}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Btn variant={feature.enabled ? 'danger' : 'ok'} loading={busy} onClick={() => onToggle(feature)}>
          <Power size={13} />{feature.enabled ? 'Switch off' : 'Switch on'}
        </Btn>
      </footer>
    </>
  );
}

export default function AdminKillSwitches() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(normalize(await apiGet<Response>('/api/admin/features')));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (feature: Feature) => {
    setBusyKey(feature.key);
    try {
      const res = await apiPatch<{ features: Feature[] }>(`/api/admin/features/${feature.key}`, {
        enabled: !feature.enabled,
        // The reason box belongs to the open feature; a row toggle elsewhere doesn't steal it.
        reason: feature.key === selectedKey ? reason.trim() || undefined : undefined,
      });
      setData(prev => prev && normalize({ ...prev, features: res.features }));
      if (feature.key === selectedKey) setReason('');
      setError(null);
      void refreshFeatures();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyKey(null);
    }
  }, [reason, selectedKey]);

  const features = useMemo(() => data?.features ?? [], [data]);
  const offCount = features.filter(f => !f.enabled).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features.filter(f =>
      (stateFilter === 'all' || (stateFilter === 'off') !== f.enabled)
      && (group === 'all' || f.group === group)
      && (!q || `${f.label} ${f.key} ${f.description}`.toLowerCase().includes(q)));
  }, [features, stateFilter, group, query]);

  // Default selection: the first switched-off feature, else the first row.
  const effectiveKey = selectedKey && features.some(f => f.key === selectedKey)
    ? selectedKey
    : (features.find(f => !f.enabled) ?? visible[0])?.key ?? null;
  const selected = features.find(f => f.key === effectiveKey) ?? null;

  const columns: Column<Feature>[] = [
    { key: 'dot', header: '', width: 34, render: f => <Dot tone={f.enabled ? 'ok' : 'bad'} />, sortValue: f => Number(f.enabled) },
    {
      key: 'label', header: 'Feature',
      render: f => (
        <span className="adm-row" style={{ gap: 6 }}>
          <span className="adm-cell-strong adm-truncate">{f.label}</span>
          {!f.enabled && <Pill tone="bad">OFF</Pill>}
        </span>
      ),
      title: f => `${f.label} — ${f.description}`,
      sortValue: f => f.label.toLowerCase(),
    },
    { key: 'group', header: 'Group', width: 132, hideOnSmall: true, render: f => <span className="adm-muted">{f.group}</span>, sortValue: f => f.group },
    { key: 'scope', header: 'Acts on', width: 74, hideOnSmall: true, render: f => <Scope feature={f} /> },
    {
      key: 'changed', header: 'Changed', width: 70, align: 'right',
      render: f => <span className="adm-muted adm-num" title={f.updatedAt ? `${fmtWhen(f.updatedAt)} by ${f.updatedBy ?? '—'}` : 'Never flipped'}>{f.updatedAt ? fmtAge(f.updatedAt) : '—'}</span>,
      sortValue: f => (f.updatedAt ? new Date(f.updatedAt).getTime() : 0),
    },
    { key: 'switch', header: '', width: 52, className: 'adm-cell-actions', render: f => <Switch feature={f} busy={busyKey === f.key} onToggle={toggle} /> },
  ];

  return (
    <Page
      title={
        <span className="adm-row" style={{ gap: 8 }}>
          <Dot tone={!data ? 'neutral' : offCount ? 'bad' : 'ok'} />Kill switches
        </span>
      }
      sub={data ? `${features.length} switches · ${features.length - offCount} on · ${offCount} off — a flip hits the API instantly, open tabs within a minute` : undefined}
      actions={<Btn onClick={load} loading={loading && !!data}><RefreshCw size={13} />Refresh</Btn>}
      flush
    >
      {loading && !data ? <SkeletonRows rows={14} cols={4} /> : error && !data ? (
        <Empty title="Could not load switches" body={error} action={<Btn onClick={load}>Retry</Btn>} />
      ) : (
        <div className="adm-split" data-detail-open={mobileDetail ? 'true' : 'false'} style={{ ['--adm-split-list' as string]: '58%' }}>
          <div className="adm-split-list">
            <div className="adm-toolbar">
              <Seg<StateFilter>
                label="State"
                value={stateFilter}
                onChange={setStateFilter}
                options={[
                  { value: 'all', label: 'All', count: features.length },
                  { value: 'on', label: 'On', count: features.length - offCount },
                  { value: 'off', label: 'Off', count: offCount },
                ]}
              />
              <select className="adm-select" value={group} onChange={e => setGroup(e.target.value)} aria-label="Group" style={{ width: 140 }}>
                <option value="all">All groups</option>
                {(data?.groups ?? []).map(g => <option key={g} value={g}>{g} ({features.filter(f => f.group === g).length})</option>)}
              </select>
              <span className="adm-grow" />
              <SearchInput value={query} onChange={setQuery} placeholder="Filter switches" width={160} inputRef={searchRef} />
            </div>
            {error && <div className="adm-callout" data-tone="bad" style={{ margin: 8 }}>{error}</div>}
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={f => f.key}
              selectedKey={effectiveKey}
              onRowClick={f => { setSelectedKey(f.key); setReason(''); setMobileDetail(true); }}
              initialSort={{ key: 'dot', dir: 'asc' }}
              empty={<Empty title="No switches match" body="Try another filter." />}
              footer={<><span>{visible.length} shown</span><span className="adm-grow" /><span>Fail-open: if the switch store is down, everything stays on</span></>}
            />
          </div>
          <div className="adm-split-detail">
            {selected ? (
              <Detail feature={selected} busy={busyKey === selected.key} onToggle={toggle} reason={reason} setReason={setReason} onBack={() => setMobileDetail(false)} />
            ) : <Empty title="Nothing selected" body="Pick a switch from the list." />}
          </div>
        </div>
      )}
    </Page>
  );
}
