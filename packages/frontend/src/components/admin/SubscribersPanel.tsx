'use client';

/**
 * "Subscribers" panel on /admin → Users & growth. Handles "please unsubscribe
 * me" emails without touching the database by hand:
 *
 *   Subscribers  72 subscribed · 14 unsubscribed          [search email/name]
 *   jane@x.com   Subscribed    last email 1d ago          [Unsubscribe]
 *   bob@y.com    Unsubscribed  via link · 3d ago          [Resubscribe]
 *
 * Data: GET /api/admin/subscribers, POST /api/admin/subscribers/set.
 * Kill switch: `adminSubscribers` (the public unsubscribe link is never gated).
 */
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/jobApi';
import { withFeature } from '../FeatureGate';
import { useAdminUi } from './AdminUiContext';
import { DataTable, type Column } from './DataTable';
import { Btn, Empty, Panel, Pill, SkeletonRows, errorText, fmtAge, fmtNumber } from './primitives';

interface Subscriber {
  _id: string; email: string; name?: string; isSubscribed?: boolean; createdAt?: string;
  lastEmailSent?: string; unsubscribedAt?: string; unsubscribeSource?: string;
}
interface SubscribersResponse { users: Subscriber[]; totals: { subscribed: number; unsubscribed: number; total: number } }

const SEARCH_DEBOUNCE_MS = 300;
const SOURCE_LABEL: Record<string, string> = { link: 'email link', 'one-click': 'Gmail button', admin: 'admin' };

function SubscribersPanel() {
  const { toast, confirm } = useAdminUi();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SubscribersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      setData(await apiGet<SubscribersResponse>(`/api/admin/subscribers?q=${encodeURIComponent(q)}&limit=100`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => load(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, load]);

  const toggle = async (user: Subscriber) => {
    const next = !user.isSubscribed;
    const ok = await confirm({
      title: next ? 'Resubscribe?' : 'Unsubscribe?',
      body: next
        ? `${user.email} will get the weekly digest again. Only do this if they asked.`
        : `${user.email} will stop getting the weekly digest and other emails.`,
      confirmLabel: next ? 'Resubscribe' : 'Unsubscribe',
      danger: !next,
    });
    if (!ok) return;
    setSaving(user.email);
    try {
      await apiPost('/api/admin/subscribers/set', { email: user.email, isSubscribed: next });
      toast(`${user.email} ${next ? 'resubscribed' : 'unsubscribed'}`);
      await load(query);
    } catch (err) {
      toast(`Could not update ${user.email}: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setSaving(null);
    }
  };

  const columns: Column<Subscriber>[] = [
    {
      key: 'email', header: 'Email',
      render: u => (
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="adm-cell-strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
          {u.name && <span className="adm-muted" style={{ fontSize: 11.5 }}>{u.name}</span>}
        </span>
      ),
      sortValue: u => u.email,
    },
    {
      key: 'status', header: 'Status', width: 190,
      render: u => u.isSubscribed
        ? <span className="adm-row" style={{ gap: 6 }}><Pill tone="ok">Subscribed</Pill>{u.lastEmailSent && <span className="adm-muted" style={{ fontSize: 11.5 }}>mailed {fmtAge(u.lastEmailSent)} ago</span>}</span>
        : <span className="adm-row" style={{ gap: 6 }}><Pill>Unsubscribed</Pill>{u.unsubscribedAt && <span className="adm-muted" style={{ fontSize: 11.5 }}>{SOURCE_LABEL[u.unsubscribeSource || ''] || 'earlier'} · {fmtAge(u.unsubscribedAt)} ago</span>}</span>,
      sortValue: u => (u.isSubscribed ? 1 : 0),
    },
    {
      key: 'action', header: '', width: 112, align: 'right',
      render: u => (
        <Btn size="sm" variant={u.isSubscribed ? 'default' : 'primary'} loading={saving === u.email}
          onClick={() => toggle(u)}>
          {u.isSubscribed ? 'Unsubscribe' : 'Resubscribe'}
        </Btn>
      ),
    },
  ];

  const t = data?.totals;
  return (
    <Panel
      title="Subscribers"
      meta={t ? `${fmtNumber(t.subscribed)} subscribed · ${fmtNumber(t.unsubscribed)} unsubscribed` : undefined}
      actions={
        <label className="adm-search">
          <Search size={13} />
          <input className="adm-input" type="search" placeholder="Search email or name" value={query}
            onChange={e => setQuery(e.target.value)} aria-label="Search subscribers" />
        </label>
      }
      flush
    >
      {error && <div className="adm-muted" style={{ padding: '8px 10px', fontSize: 12 }}>Could not load subscribers: {error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(var(--adm-row) * 8 + 31px)' }}>
        {!data && !error ? <SkeletonRows rows={6} cols={3} /> : (
          <DataTable
            rows={data?.users ?? []}
            columns={columns}
            rowKey={u => u._id}
            empty={<Empty title={query ? 'No match' : 'No users yet'} body={query ? `Nobody matches “${query}”.` : undefined} />}
          />
        )}
      </div>
    </Panel>
  );
}

export default withFeature('adminSubscribers', SubscribersPanel);
