'use client';

/**
 * Overview → "Users & growth" tab. One screen, no scroll on a laptop:
 *
 *   Row 1  KPI strip: users, new 7d/30d (Δ), DAU/WAU/MAU, stickiness, churn
 *   Row 2  Daily trends (sparkline table) · Signup funnel · Sources & health
 *   Row 3  Weekly signup cohorts (heat table) · People going quiet
 *   Row 4  Subscribers: search + unsubscribe/resubscribe (SubscribersPanel)
 *
 * Detail is one click away in a side drawer (a metric's daily values, a
 * user's activity) instead of more panels. Metrics follow the standard SaaS
 * set: active users, DAU/MAU stickiness (≈20% is healthy), churn, cohort
 * retention, activation funnel.
 *
 * Data: GET /api/analytics/users (backend/src/db/userActivityQueries.js).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../utils/jobApi';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { Drawer } from '../../components/admin/Drawer';
import SubscribersPanel from '../../components/admin/SubscribersPanel';
import { Delta, HeatCell, MeterBar, SparkBars } from '../../components/admin/charts';
import {
  Btn, DefinitionGrid, Empty, Kpis, Panel, Pill, Seg, SkeletonRows, errorText, fmtAge, fmtDate, fmtNumber,
} from '../../components/admin/primitives';

type SeriesKey = 'signups' | 'activeUsers' | 'newVisitors' | 'jobViews' | 'remoteViews' | 'applyClicks' | 'smartMatchRuns' | 'deletions';
interface QuietUser {
  id: string; name: string; email: string; createdAt: string; lastActive: string;
  isPremium: boolean; source: string; hasProfile: boolean; hasApplied: boolean;
}
interface UserAnalytics {
  generatedAt: string; days: number;
  totals: {
    users: number; premium: number; new7: number; newPrev7: number; new30: number; newPrev30: number;
    dau: number; wau: number; mau: number; stickiness: number | null;
    churned: number; matureUsers: number; churnRate: number | null; atRisk: number; deletions30: number;
    trackingSince: string | null;
  };
  sources: { google: number; email: number; waitlist: number };
  funnel: Array<{ key: string; label: string; value: number }>;
  series: Record<SeriesKey, number[]> & { dates: string[] };
  cohorts: Array<{ weekStart: string; size: number; returned: number | null; week1: number | null; activeNow: number | null; profile: number | null }>;
  goneQuiet: QuietUser[];
}

const SERIES: Array<{ key: SeriesKey; label: string; goodWhenUp?: boolean }> = [
  { key: 'signups', label: 'Signups' },
  { key: 'activeUsers', label: 'Active users' },
  { key: 'newVisitors', label: 'New visitors' },
  { key: 'jobViews', label: 'Job views' },
  { key: 'applyClicks', label: 'Apply clicks' },
  { key: 'smartMatchRuns', label: 'Smart Match runs' },
  { key: 'remoteViews', label: 'Remote views' },
  { key: 'deletions', label: 'Account deletions', goodWhenUp: false },
];

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const pct = (value: number | null, digits = 0) => (value == null ? '—' : `${(value * 100).toFixed(digits)}%`);
const DAY_MS = 86_400_000;

export default function AdminUsersGrowth() {
  const [days, setDays] = useState<'30' | '60' | '90'>('30');
  const [data, setData] = useState<UserAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<SeriesKey | null>(null);
  const [person, setPerson] = useState<QuietUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiGet<UserAnalytics>(`/api/analytics/users?days=${days}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  // Activity history is only exact from the day tracking shipped; older
  // churn/retention figures are estimated from logins.
  const trackedDays = t?.trackingSince ? Math.floor((Date.now() - Date.parse(`${t.trackingSince}T00:00:00Z`)) / DAY_MS) + 1 : 0;
  const estimated = trackedDays < 30;
  const estBadge = estimated ? <Pill tone="warn" title={`Exact activity tracking started ${t?.trackingSince ?? 'today'}; earlier activity is estimated from logins, so churn reads high.`}>est.</Pill> : null;

  const trends = useMemo(() => {
    if (!data) return [];
    return SERIES.map(s => {
      const values = data.series[s.key];
      return { ...s, values, last7: sum(values.slice(-7)), prev7: sum(values.slice(-14, -7)), total: sum(values) };
    });
  }, [data]);

  const funnelMax = Math.max(1, ...(data?.funnel ?? []).map(f => f.value));

  const quietColumns: Column<QuietUser>[] = [
    { key: 'name', header: 'User', render: u => <span className="adm-cell-strong adm-truncate">{u.name}</span>, title: u => `${u.name} · ${u.email}`, sortValue: u => u.name.toLowerCase() },
    { key: 'email', header: 'Email', width: '34%', hideOnSmall: true, render: u => <span className="adm-muted adm-truncate">{u.email}</span>, title: u => u.email },
    { key: 'joined', header: 'Joined', width: 64, align: 'right', render: u => <span className="adm-muted adm-num">{fmtAge(u.createdAt)}</span>, sortValue: u => Date.parse(u.createdAt) },
    { key: 'quiet', header: 'Quiet', width: 58, align: 'right', render: u => <span className="adm-num">{fmtAge(u.lastActive)}</span>, sortValue: u => -Date.parse(u.lastActive) },
    {
      key: 'flags', header: '', width: 86,
      render: u => (
        <span className="adm-row" style={{ gap: 3 }}>
          {u.isPremium && <Pill tone="accent">pro</Pill>}
          {u.hasApplied && <Pill tone="outline" title="Clicked apply at least once">apl</Pill>}
        </span>
      ),
    },
  ];

  if (loading && !data) return <SkeletonRows rows={16} cols={4} />;
  if (error && !data) return <Empty title="Could not load user analytics" body={error} action={<Btn onClick={load}>Retry</Btn>} />;
  if (!data || !t) return null;

  const active = metric ? trends.find(tr => tr.key === metric) : null;

  return (
    <div className="adm-stack">
      <Kpis
        items={[
          { label: 'Users', value: fmtNumber(t.users), note: `${fmtNumber(t.premium)} premium` },
          { label: 'New · 7d', value: <span className="adm-row" style={{ gap: 6 }}>{fmtNumber(t.new7)}<Delta now={t.new7} prev={t.newPrev7} /></span>, note: `prev 7d: ${fmtNumber(t.newPrev7)}` },
          { label: 'New · 30d', value: <span className="adm-row" style={{ gap: 6 }}>{fmtNumber(t.new30)}<Delta now={t.new30} prev={t.newPrev30} /></span>, note: `prev 30d: ${fmtNumber(t.newPrev30)}` },
          { label: 'Active today (DAU)', value: fmtNumber(t.dau), note: 'signed-in users' },
          { label: 'Active 7d (WAU)', value: fmtNumber(t.wau), note: pct(t.users ? t.wau / t.users : null) + ' of users' },
          { label: 'Active 30d (MAU)', value: fmtNumber(t.mau), note: pct(t.users ? t.mau / t.users : null) + ' of users' },
          { label: 'Stickiness DAU/MAU', value: pct(t.stickiness, 1), note: 'healthy ≈ 20%+', tone: t.stickiness != null && t.stickiness < 0.1 ? 'warn' : undefined },
          {
            label: 'Lost (quiet 30d+)',
            value: <span className="adm-row" style={{ gap: 6 }}>{fmtNumber(t.churned)}{estBadge}</span>,
            note: `${pct(t.churnRate)} of ${fmtNumber(t.matureUsers)} · ${fmtNumber(t.atRisk)} at risk`,
            tone: 'bad',
          },
        ]}
      />

      <div className="adm-grid adm-ug-row2">
        <Panel
          title="Daily trends"
          meta={`${data.days}d · click a row for daily values`}
          actions={
            <Seg<'30' | '60' | '90'> label="Range" value={days} onChange={setDays}
              options={[{ value: '30', label: '30d' }, { value: '60', label: '60d' }, { value: '90', label: '90d' }]} />
          }
          flush
        >
          <table className="adm-trend">
            <thead><tr><th>Metric</th><th>Trend</th><th>7d</th><th>vs prev</th></tr></thead>
            <tbody>
              {trends.map(tr => (
                <tr key={tr.key} onClick={() => setMetric(tr.key)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setMetric(tr.key); }}>
                  <td className="adm-truncate" title={tr.key === 'activeUsers' && t.trackingSince ? `Tracked since ${t.trackingSince}` : undefined}>
                    {tr.label}{tr.key === 'activeUsers' && trackedDays < data.days ? <span className="adm-muted">*</span> : null}
                  </td>
                  <td><SparkBars values={tr.values} dates={data.series.dates} /></td>
                  <td className="adm-num">{fmtNumber(tr.last7)}</td>
                  <td><Delta now={tr.last7} prev={tr.prev7} goodWhenUp={tr.goodWhenUp ?? true} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Signup funnel" meta={`last ${data.days}d`} flush>
          <div className="adm-funnel">
            {data.funnel.map((step, i) => {
              // Visitors → signups is a true step; CV / apply / premium are
              // independent actions, so they're shown as a share of signups.
              const base = i === 0 ? null : i === 1 ? data.funnel[0].value : data.funnel[1].value;
              const baseLabel = i === 1 ? 'of visitors' : 'of signups';
              return (
                <div key={step.key} className="adm-funnel-row">
                  <span className="adm-truncate">{step.label}</span>
                  <span className="adm-num" style={{ fontWeight: 600 }}>{fmtNumber(step.value)}</span>
                  <MeterBar value={step.value} max={funnelMax} />
                  <span className="adm-num adm-muted" title={base != null ? baseLabel : undefined}>
                    {base != null ? pct(base ? step.value / base : null, 1) : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="adm-panel-body adm-muted" style={{ fontSize: 11.5, borderTop: '1px solid var(--adm-line)' }}>
            <span className="adm-muted">% = of visitors (signups) or of signups (later steps).</span><br />
            Visitor → signup: <b>{pct(data.funnel[0]?.value ? data.funnel[1].value / data.funnel[0].value : null, 1)}</b> · signup → apply: <b>{pct(data.funnel[1]?.value ? data.funnel[3].value / data.funnel[1].value : null, 0)}</b>
          </div>
        </Panel>

        <Panel title="Sources & health">
          <DefinitionGrid items={[
            ['Google sign-in', fmtNumber(data.sources.google)],
            ['Email', fmtNumber(data.sources.email)],
            ['Waitlist', fmtNumber(data.sources.waitlist)],
            ['Premium', `${fmtNumber(t.premium)} · ${pct(t.users ? t.premium / t.users : null, 1)}`],
            ['At risk 14–30d', fmtNumber(t.atRisk)],
            [`Deleted · ${data.days}d`, fmtNumber(t.deletions30)],
          ]} />
        </Panel>
      </div>

      <div className="adm-grid adm-ug-row3">
        <Panel title={<span className="adm-row" style={{ gap: 6 }}>Weekly signup cohorts {estBadge}</span>} meta="share of each week's signups" flush>
          <div className="adm-hscroll">
          <table className="adm-cohort">
            <thead>
              <tr>
                <th>Week of</th><th>Signups</th>
                <th title="Came back at least a day after signing up">Came back</th>
                <th title="Still active 7+ days after signup">Week 1+</th>
                <th title="Active in the last 7 days">Active now</th>
                <th title="Added a CV / profile">Profile</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map(c => (
                <tr key={c.weekStart}>
                  <td className="adm-num">{fmtDate(c.weekStart).replace(/ \d{4}$/, '')}</td>
                  <td className="adm-num">{fmtNumber(c.size)}</td>
                  <td><HeatCell value={c.size ? c.returned : null} /></td>
                  <td><HeatCell value={c.size ? c.week1 : null} /></td>
                  <td><HeatCell value={c.size ? c.activeNow : null} /></td>
                  <td><HeatCell value={c.size ? c.profile : null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>

        <Panel title="Going quiet" meta={`active before, silent 14d+ · ${data.goneQuiet.length} most recent`} flush>
          <div className="adm-rows-box">
            <DataTable
              rows={data.goneQuiet}
              columns={quietColumns}
              rowKey={u => u.id}
              onRowClick={setPerson}
              empty={<Empty title="Nobody has gone quiet" body="Every user who came back is still around." />}
            />
          </div>
        </Panel>
      </div>

      <SubscribersPanel />

      <Drawer open={Boolean(active)} onClose={() => setMetric(null)} title={active?.label ?? ''}
        sub={active ? `${fmtNumber(active.total)} in ${data.days}d · ${fmtNumber(Math.round(active.total / data.days))}/day avg` : undefined}>
        {active && (
          <div className="adm-stack" style={{ gap: 12 }}>
            <SparkBars values={active.values} dates={data.series.dates} height={90} />
            <DefinitionGrid items={[
              ['Last 7d', fmtNumber(active.last7)],
              ['Previous 7d', fmtNumber(active.prev7)],
              ['Peak day', fmtNumber(Math.max(...active.values))],
              ['Change', <Delta key="d" now={active.last7} prev={active.prev7} goodWhenUp={active.goodWhenUp ?? true} />],
            ]} />
            <table className="adm-cohort">
              <thead><tr><th>Day</th><th style={{ textAlign: 'right' }}>{active.label}</th></tr></thead>
              <tbody>
                {[...data.series.dates].reverse().map((date, i) => {
                  const value = active.values[active.values.length - 1 - i];
                  return (
                    <tr key={date}>
                      <td className="adm-num" style={{ textAlign: 'left' }}>{new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</td>
                      <td className="adm-num" style={{ textAlign: 'right' }}>{fmtNumber(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>

      <Drawer open={Boolean(person)} onClose={() => setPerson(null)} title={person?.name ?? ''} sub={person?.email}>
        {person && (
          <div className="adm-stack" style={{ gap: 12 }}>
            <DefinitionGrid items={[
              ['Joined', fmtDate(person.createdAt)],
              ['Last active', fmtDate(person.lastActive)],
              ['Quiet for', `${fmtAge(person.lastActive)}`],
              ['Was active for', `${Math.max(1, Math.round((Date.parse(person.lastActive) - Date.parse(person.createdAt)) / DAY_MS))}d`],
              ['Signed up via', person.source],
              ['Plan', person.isPremium ? 'Premium' : 'Free'],
              ['CV / profile', person.hasProfile ? 'Yes' : 'No'],
              ['Clicked apply', person.hasApplied ? 'Yes' : 'No'],
            ]} />
            <div className="adm-callout">
              <div className="adm-callout-label">Why they may have left</div>
              {!person.hasProfile && !person.hasApplied ? 'Never added a CV or applied, so they likely never saw value. Onboarding gap.'
                : !person.hasProfile ? 'Applied but never added a CV, so matching never personalised for them.'
                  : 'Had a profile, so check whether their matches were relevant.'}
            </div>
            <a className="adm-btn" href={`mailto:${person.email}`}>Email {person.name.split(' ')[0]}</a>
          </div>
        )}
      </Drawer>
    </div>
  );
}
