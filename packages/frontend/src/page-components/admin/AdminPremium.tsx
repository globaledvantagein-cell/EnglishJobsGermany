'use client';

/**
 * /admin/premium — waitlist → code → premium funnel.
 *
 * Top: totals + four 30-day bar strips in one band. Bottom: redemptions and
 * waitlist codes side by side, each scrolling inside its own panel so both
 * tables stay visible without scrolling the page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../../utils/jobApi';
import { DataTable, type Column } from '../../components/admin/DataTable';
import {
  Btn, Dot, Empty, Kpis, Page, SearchInput, Seg, SkeletonRows, errorText, fmtNumber, fmtShortDate, type Tone,
} from '../../components/admin/primitives';

interface DailyPoint { date: string; waitlistJoins: number; redemptions: number; failedAttempts: number; signups: number }
interface Redemption { _id: string; promoCode: string | null; plan: string; status: string; startedAt: string; expiresAt: string; email?: string; name?: string }
interface WaitlistRow { _id: string; code: string; generatedForEmail?: string; createdAt: string; usedCount: number; expiresAt: string; status: 'pending' | 'redeemed' | 'expired' }
interface PremiumData {
  totals: {
    waitlistCodesGenerated: number; waitlistPending: number; waitlistRedeemed: number;
    waitlistExpiredUnused: number; betaCodeRedemptions: number; activePremiumUsers: number; totalUsers: number;
  };
  daily: DailyPoint[];
  redemptions: Redemption[];
  waitlist: WaitlistRow[];
}

const WAITLIST_TONE: Record<WaitlistRow['status'], Tone> = { pending: 'warn', redeemed: 'ok', expired: 'neutral' };

function BarStrip({ title, points, valueOf }: { title: string; points: DailyPoint[]; valueOf: (p: DailyPoint) => number }) {
  const max = Math.max(1, ...points.map(valueOf));
  const total = points.reduce((sum, p) => sum + valueOf(p), 0);
  return (
    <div className="adm-panel" style={{ padding: '8px 10px' }}>
      <div className="adm-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{title}</span>
        <span className="adm-muted" style={{ fontSize: 11.5 }}>{fmtNumber(total)} / 30d</span>
      </div>
      <div className="adm-bars">
        {points.map(p => {
          const value = valueOf(p);
          return <span key={p.date} data-zero={value === 0 ? 'true' : undefined} title={`${p.date}: ${value}`} style={{ height: value === 0 ? 2 : `${Math.max(8, (value / max) * 100)}%` }} />;
        })}
      </div>
    </div>
  );
}

export default function AdminPremium() {
  const [data, setData] = useState<PremiumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waitFilter, setWaitFilter] = useState<'all' | WaitlistRow['status']>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<PremiumData>('/api/analytics/premium'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const conversion = t && t.waitlistCodesGenerated > 0 ? Math.round((t.waitlistRedeemed / t.waitlistCodesGenerated) * 100) : 0;
  const signups30 = data?.daily.reduce((s, p) => s + p.signups, 0) ?? 0;

  const q = query.trim().toLowerCase();
  const redemptions = useMemo(() => (data?.redemptions ?? []).filter(r =>
    !q || r.email?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q) || r.promoCode?.toLowerCase().includes(q)), [data, q]);
  const waitlist = useMemo(() => (data?.waitlist ?? []).filter(w =>
    (waitFilter === 'all' || w.status === waitFilter)
    && (!q || w.generatedForEmail?.toLowerCase().includes(q) || w.code.toLowerCase().includes(q))), [data, waitFilter, q]);

  const redemptionColumns: Column<Redemption>[] = [
    {
      key: 'user', header: 'User',
      render: r => <><span className="adm-cell-strong">{r.name || '—'}</span> <span className="adm-muted">{r.email || 'unknown'}</span></>,
      title: r => r.email, sortValue: r => (r.email || '').toLowerCase(),
    },
    { key: 'code', header: 'Code', width: 130, render: r => <span className="adm-mono">{r.promoCode || '—'}</span>, sortValue: r => r.promoCode ?? '' },
    { key: 'plan', header: 'Plan', width: 84, render: r => r.plan, sortValue: r => r.plan },
    { key: 'start', header: 'Activated', width: 88, render: r => fmtShortDate(r.startedAt), sortValue: r => -new Date(r.startedAt).getTime() },
    { key: 'exp', header: 'Expires', width: 88, hideOnSmall: true, render: r => fmtShortDate(r.expiresAt), sortValue: r => new Date(r.expiresAt).getTime() },
    { key: 'status', header: 'Status', width: 92, render: r => <span className="adm-row"><Dot tone={r.status === 'active' ? 'ok' : 'neutral'} />{r.status}</span>, sortValue: r => r.status },
  ];

  const waitlistColumns: Column<WaitlistRow>[] = [
    { key: 'email', header: 'Email', render: w => <span className="adm-cell-strong">{w.generatedForEmail || 'unknown'}</span>, title: w => w.generatedForEmail, sortValue: w => (w.generatedForEmail || '').toLowerCase() },
    { key: 'code', header: 'Code', width: 130, render: w => <span className="adm-mono">{w.code}</span> },
    { key: 'joined', header: 'Joined', width: 88, render: w => fmtShortDate(w.createdAt), sortValue: w => -new Date(w.createdAt).getTime() },
    { key: 'exp', header: 'Expires', width: 88, hideOnSmall: true, render: w => fmtShortDate(w.expiresAt), sortValue: w => new Date(w.expiresAt).getTime() },
    { key: 'status', header: 'Status', width: 100, render: w => <span className="adm-row"><Dot tone={WAITLIST_TONE[w.status]} />{w.status}</span>, sortValue: w => w.status },
  ];

  return (
    <Page
      title="Premium"
      sub="Waitlist, code redemptions and active subscriptions"
      actions={
        <>
          <SearchInput value={query} onChange={setQuery} placeholder="Email or code" width={190} />
          <Btn onClick={load} loading={loading && !!data}><RefreshCw size={13} />Refresh</Btn>
        </>
      }
      flush
    >
      {error && !data ? <Empty title="Could not load premium analytics" body={error} action={<Btn onClick={load}>Retry</Btn>} /> : (
        <>
          <div style={{ padding: 'var(--adm-pad)', borderBottom: '1px solid var(--adm-line)', display: 'flex', flexDirection: 'column', gap: 'var(--adm-gap)' }}>
            <Kpis
              loading={loading && !data}
              items={[
                { label: 'Active premium', value: fmtNumber(t?.activePremiumUsers), note: t ? `of ${fmtNumber(t.totalUsers)} users` : undefined, tone: 'accent' },
                { label: 'Waitlist joins', value: fmtNumber(t?.waitlistCodesGenerated), note: 'codes sent' },
                { label: 'Codes pending', value: fmtNumber(t?.waitlistPending), note: 'unused, valid', tone: t?.waitlistPending ? 'warn' : undefined },
                { label: 'Personal redeemed', value: fmtNumber(t?.waitlistRedeemed) },
                { label: 'Waitlist → redeem', value: `${conversion}%` },
                { label: 'Expired unused', value: fmtNumber(t?.waitlistExpiredUnused) },
                { label: 'Shared code uses', value: fmtNumber(t?.betaCodeRedemptions) },
                { label: 'Signups / 30d', value: fmtNumber(signups30) },
              ]}
            />
            {data && data.daily.length > 0 && (
              <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <BarStrip title="Signups / day" points={data.daily} valueOf={p => p.signups} />
                <BarStrip title="Waitlist joins / day" points={data.daily} valueOf={p => p.waitlistJoins} />
                <BarStrip title="Redemptions / day" points={data.daily} valueOf={p => p.redemptions} />
                <BarStrip title="Failed code attempts / day" points={data.daily} valueOf={p => p.failedAttempts} />
              </div>
            )}
          </div>

          <div className="adm-split" style={{ ['--adm-split-list' as string]: '55%' }}>
            <div className="adm-split-list">
              <div className="adm-toolbar">
                <strong style={{ fontSize: 12 }}>Redemptions</strong>
                <span className="adm-muted">who activated premium · {fmtNumber(redemptions.length)}</span>
              </div>
              {loading && !data ? <SkeletonRows rows={10} cols={4} /> : (
                <DataTable rows={redemptions} columns={redemptionColumns} rowKey={r => r._id} initialSort={{ key: 'start', dir: 'asc' }}
                  empty={<Empty title="No redemptions yet" />} />
              )}
            </div>
            <div className="adm-split-detail" style={{ background: 'var(--adm-panel)' }}>
              <div className="adm-toolbar">
                <strong style={{ fontSize: 12 }}>Waitlist codes</strong>
                <span className="adm-grow" />
                <Seg
                  label="Code status"
                  value={waitFilter}
                  onChange={setWaitFilter}
                  options={[
                    { value: 'all', label: 'All', count: data?.waitlist.length },
                    { value: 'pending', label: 'Pending', count: data?.waitlist.filter(w => w.status === 'pending').length },
                    { value: 'redeemed', label: 'Redeemed', count: data?.waitlist.filter(w => w.status === 'redeemed').length },
                    { value: 'expired', label: 'Expired', count: data?.waitlist.filter(w => w.status === 'expired').length },
                  ]}
                />
              </div>
              {loading && !data ? <SkeletonRows rows={10} cols={4} /> : (
                <DataTable rows={waitlist} columns={waitlistColumns} rowKey={w => w._id} initialSort={{ key: 'joined', dir: 'asc' }}
                  empty={<Empty title="Nobody here" />} />
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
