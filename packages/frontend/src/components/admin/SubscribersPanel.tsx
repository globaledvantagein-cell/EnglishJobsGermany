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
import { Btn, Dot, Empty, Panel, Pill, SkeletonRows, errorText, fmtAge, fmtNumber } from './primitives';

interface Subscriber {
  _id: string; email: string; name?: string; isSubscribed?: boolean; createdAt?: string;
  lastEmailSent?: string; unsubscribedAt?: string; unsubscribeSource?: string;
}
interface SubscribersResponse { users: Subscriber[]; totals: { subscribed: number; unsubscribed: number; total: number } }

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 30;
const SOURCE_LABEL: Record<string, string> = { link: 'email link', 'one-click': 'Gmail button', admin: 'admin' };

function SubscribersPanel() {
  const { toast, confirm } = useAdminUi();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SubscribersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const load = useCallback(async (q: string, max: number) => {
    try {
      setData(await apiGet<SubscribersResponse>(`/api/admin/subscribers?q=${encodeURIComponent(q)}&limit=${max}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => load(query, limit), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, limit, load]);

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
      await load(query, limit);
    } catch (err) {
      toast(`Could not update ${user.email}: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setSaving(null);
    }
  };

  /** "mailed 2d ago" / "via email link · 3d ago" — the detail next to a status. */
  const statusDetail = (u: Subscriber) => u.isSubscribed
    ? (u.lastEmailSent ? `mailed ${fmtAge(u.lastEmailSent)} ago` : 'not mailed yet')
    : (u.unsubscribedAt ? `${SOURCE_LABEL[u.unsubscribeSource || ''] || 'earlier'} · ${fmtAge(u.unsubscribedAt)} ago` : '');

  const columns: Column<Subscriber>[] = [
    {
      key: 'email', header: 'Email',
      render: u => (
        <span className="adm-sub-who">
          <span className="adm-cell-strong">{u.email}</span>
          {/* Phones hide the Status column; its essentials ride under the email. */}
          <span className="adm-muted adm-show-sm">
            <Dot tone={u.isSubscribed ? 'ok' : 'neutral'} /> {u.isSubscribed ? 'Subscribed' : 'Unsubscribed'}{statusDetail(u) && ` · ${statusDetail(u)}`}
          </span>
          {u.name && <span className="adm-muted adm-hide-sm">{u.name}</span>}
        </span>
      ),
      title: u => u.email,
      sortValue: u => u.email,
    },
    {
      key: 'status', header: 'Status', width: 210, hideOnSmall: true,
      render: u => (
        <span className="adm-row" style={{ gap: 6 }}>
          {u.isSubscribed ? <Pill tone="ok">Subscribed</Pill> : <Pill>Unsubscribed</Pill>}
          <span className="adm-muted" style={{ fontSize: 11.5 }}>{statusDetail(u)}</span>
        </span>
      ),
      sortValue: u => (u.isSubscribed ? 1 : 0),
    },
    {
      key: 'action', header: '', width: 104, align: 'right',
      render: u => (
        <Btn size="sm" loading={saving === u.email} onClick={() => toggle(u)}>
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
            onChange={e => { setQuery(e.target.value); setLimit(PAGE_SIZE); }} aria-label="Search subscribers" />
        </label>
      }
      flush
    >
      {error && <div className="adm-muted" style={{ padding: '8px 10px', fontSize: 12 }}>Could not load subscribers: {error}</div>}
      <div className="adm-rows-box">
        {!data && !error ? <SkeletonRows rows={6} cols={3} /> : (
          <DataTable
            rows={data?.users ?? []}
            columns={columns}
            rowKey={u => u._id}
            empty={<Empty title={query ? 'No match' : 'No users yet'} body={query ? `Nobody matches “${query}”.` : undefined} />}
            footer={data && data.users.length >= limit
              ? <Btn size="sm" variant="ghost" onClick={() => setLimit(n => n + PAGE_SIZE)}>Show {PAGE_SIZE} more</Btn>
              : undefined}
          />
        )}
      </div>
    </Panel>
  );
}

export default withFeature('adminSubscribers', SubscribersPanel);
