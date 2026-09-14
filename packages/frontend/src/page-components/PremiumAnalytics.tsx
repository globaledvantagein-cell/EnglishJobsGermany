'use client';

/**
 * /analytics (admin) — Premium funnel analytics.
 *
 * Answers: how many joined the waitlist, how many codes were redeemed,
 * WHO redeemed what and when, and who is still waiting. Headline stat
 * tiles, three single-series 30-day bar strips (title carries identity,
 * value on hover), and two detail tables.
 */
import { useCallback, useEffect, useState } from 'react';
import { Crown, RefreshCw, Ticket, Users, MailPlus, CheckCircle2, Percent } from 'lucide-react';
import { Container, PageHeader, Button, StatCard } from '../components/ui';
import { apiGet } from '../utils/jobApi';

interface DailyPoint { date: string; waitlistJoins: number; redemptions: number; failedAttempts: number; signups: number; }
interface Redemption { _id: string; promoCode: string | null; plan: string; status: string; startedAt: string; expiresAt: string; email?: string; name?: string; }
interface WaitlistRow { _id: string; code: string; generatedForEmail?: string; createdAt: string; usedCount: number; expiresAt: string; status: 'pending' | 'redeemed' | 'expired'; }
interface PremiumAnalyticsResponse {
  totals: {
    waitlistCodesGenerated: number; waitlistPending: number; waitlistRedeemed: number;
    waitlistExpiredUnused: number; betaCodeRedemptions: number; activePremiumUsers: number; totalUsers: number;
  };
  daily: DailyPoint[];
  redemptions: Redemption[];
  waitlist: WaitlistRow[];
}

function fmtDate(v?: string | null): string {
  if (!v) return '–';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '–' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const WAITLIST_STATUS_STYLE: Record<WaitlistRow['status'], { color: string; label: string }> = {
  pending: { color: 'var(--warning, #f59e0b)', label: 'Pending' },
  redeemed: { color: 'var(--success, #22c55e)', label: 'Redeemed' },
  expired: { color: 'var(--text-muted)', label: 'Expired' },
};

/** Single-series 30-day bar strip. Title names the series; bars share one hue. */
function BarStrip({ title, points, valueOf }: { title: string; points: DailyPoint[]; valueOf: (p: DailyPoint) => number }) {
  const max = Math.max(1, ...points.map(valueOf));
  const total = points.reduce((s, p) => s + valueOf(p), 0);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-solid)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{total} in 30 days</span>
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 48 }}>
        {points.map(p => {
          const v = valueOf(p);
          return (
            <div
              key={p.date}
              title={`${p.date}: ${v}`}
              style={{
                flex: 1, minWidth: 3,
                height: v === 0 ? 2 : Math.max(4, Math.round((v / max) * 48)),
                background: v === 0 ? 'var(--bg-surface-2)' : 'var(--acid)',
                borderRadius: '3px 3px 0 0',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: '0.7rem', fontWeight: 800,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '9px 12px', fontSize: '0.84rem', color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};

export default function PremiumAnalytics() {
  const [data, setData] = useState<PremiumAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<PremiumAnalyticsResponse>('/api/analytics/premium'));
    } catch {
      setError('Could not load premium analytics. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const conversion = t && t.waitlistCodesGenerated > 0
    ? Math.round((t.waitlistRedeemed / t.waitlistCodesGenerated) * 100)
    : 0;

  const TILES = t ? [
    { icon: <MailPlus size={18} />, value: t.waitlistCodesGenerated, label: 'Waitlist joins (codes sent)' },
    { icon: <Ticket size={18} />, value: t.waitlistPending, label: 'Codes pending (unused)' },
    { icon: <CheckCircle2 size={18} />, value: t.waitlistRedeemed, label: 'Personal codes redeemed' },
    { icon: <Percent size={18} />, value: `${conversion}%`, label: 'Waitlist → redeem rate' },
    { icon: <Crown size={18} />, value: t.activePremiumUsers, label: 'Active premium users' },
    { icon: <Users size={18} />, value: t.betaCodeRedemptions, label: 'Shared code redemptions' },
  ] : [];

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-solid)', borderBottom: '1.25px solid var(--border)', padding: '32px 0' }}>
        <Container>
          <PageHeader
            label="Admin"
            title="Premium Analytics"
            subtitle="Waitlist funnel, code redemptions, and who activated what."
            actions={<Button variant="ghost" size="sm" onClick={load} loading={loading}><RefreshCw size={13} />Refresh</Button>}
          />
        </Container>
      </div>

      <Container style={{ padding: '28px 24px 48px' }}>
        {error && (
          <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.9rem', marginBottom: 18 }}>{error}</p>
        )}

        {/* Headline tiles */}
        {loading && !data
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>{[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>
          : <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
              {TILES.map(s => <StatCard key={s.label} icon={s.icon} value={s.value} label={s.label} />)}
            </div>}

        {/* 30-day funnel strips */}
        {data && data.daily.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginTop: 22 }}>
            <BarStrip title="Waitlist joins / day" points={data.daily} valueOf={p => p.waitlistJoins} />
            <BarStrip title="Code redemptions / day" points={data.daily} valueOf={p => p.redemptions} />
            <BarStrip title="Failed code attempts / day" points={data.daily} valueOf={p => p.failedAttempts} />
          </div>
        )}

        {/* Who redeemed */}
        {data && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>
              Redemptions · who activated Premium
            </h2>
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-solid)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead><tr>
                  <th style={thStyle}>User</th><th style={thStyle}>Code</th><th style={thStyle}>Plan</th>
                  <th style={thStyle}>Activated</th><th style={thStyle}>Expires</th><th style={thStyle}>Status</th>
                </tr></thead>
                <tbody>
                  {data.redemptions.length === 0 && (
                    <tr><td style={{ ...tdStyle, borderBottom: 'none' }} colSpan={6}>No redemptions yet. They appear here the moment someone activates a code.</td></tr>
                  )}
                  {data.redemptions.map(r => (
                    <tr key={r._id}>
                      <td style={tdStyle}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.name || '–'}</span>
                        <span style={{ color: 'var(--text-muted)' }}> · {r.email || 'unknown'}</span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{r.promoCode || '–'}</td>
                      <td style={tdStyle}>{r.plan}</td>
                      <td style={tdStyle}>{fmtDate(r.startedAt)}</td>
                      <td style={tdStyle}>{fmtDate(r.expiresAt)}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.status === 'active' ? 'var(--success, #22c55e)' : 'var(--text-muted)' }} />
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Who is waiting */}
        {data && (
          <section style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>
              Waitlist codes · who joined and where their code stands
            </h2>
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-solid)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr>
                  <th style={thStyle}>Email</th><th style={thStyle}>Code</th><th style={thStyle}>Joined</th>
                  <th style={thStyle}>Code expires</th><th style={thStyle}>Status</th>
                </tr></thead>
                <tbody>
                  {data.waitlist.length === 0 && (
                    <tr><td style={{ ...tdStyle, borderBottom: 'none' }} colSpan={5}>Nobody on the waitlist yet.</td></tr>
                  )}
                  {data.waitlist.map(w => {
                    const s = WAITLIST_STATUS_STYLE[w.status];
                    return (
                      <tr key={w._id}>
                        <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 600 }}>{w.generatedForEmail || 'unknown'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{w.code}</td>
                        <td style={tdStyle}>{fmtDate(w.createdAt)}</td>
                        <td style={tdStyle}>{fmtDate(w.expiresAt)}</td>
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Container>
    </div>
  );
}
