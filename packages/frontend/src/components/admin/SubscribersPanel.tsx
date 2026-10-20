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
import { Btn, Dot, Empty, Panel, Seg, SkeletonRows, errorText, fmtAge, fmtNumber } from './primitives';

interface Subscriber {
  _id: string; email: string; name?: string; isSubscribed?: boolean; createdAt?: string;
  lastEmailSent?: string; unsubscribedAt?: string; unsubscribeSource?: string;
}
interface SubscribersResponse { users: Subscriber[]; totals: { subscribed: number; notSubscribed: number; optedOut: number; total: number } }
type StatusFilter = 'subscribed' | 'not' | 'all';

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
  const [status, setStatus] = useState<StatusFilter>('subscribed');

  const load = useCallback(async (q: string, max: number, which: StatusFilter) => {
    try {
      setData(await apiGet<SubscribersResponse>(`/api/admin/subscribers?q=${encodeURIComponent(q)}&limit=${max}&status=${which}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => load(query, limit, status), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, limit, status, load]);

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
      await load(query, limit, status);
    } catch (err) {
      toast(`Could not update ${user.email}: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setSaving(null);
    }
  };

  /** "mailed 2d ago" / "email link · 3d ago" — the detail after a status. */
  const statusDetail = (u: Subscriber) => u.isSubscribed
    ? (u.lastEmailSent ? `mailed ${fmtAge(u.lastEmailSent)} ago` : 'not mailed yet')
    : (u.unsubscribedAt ? `${SOURCE_LABEL[u.unsubscribeSource || ''] || 'earlier'} · ${fmtAge(u.unsubscribedAt)} ago` : '');
  const statusLabel = (u: Subscriber) => u.isSubscribed ? 'Subscribed' : u.unsubscribedAt ? 'Unsubscribed' : 'Not subscribed';

  const t = data?.totals;
  const rows = data?.users ?? [];
  return (
    <Panel
      title="Subscribers"
      meta={t ? `${fmtNumber(t.subscribed)} subscribed · ${fmtNumber(t.optedOut)} opted out` : undefined}
      flush
    >
      <div className="adm-toolbar">
        <label className="adm-search adm-grow">
          <Search size={13} />
          <input className="adm-input" type="search" placeholder="Search email or name" value={query} style={{ width: '100%' }}
            onChange={e => { setQuery(e.target.value); setLimit(PAGE_SIZE); }} aria-label="Search subscribers" />
        </label>
        <Seg<StatusFilter>
          label="Status"
          value={status}
          onChange={next => { setStatus(next); setLimit(PAGE_SIZE); }}
          options={[
            { value: 'subscribed', label: 'Subscribed', count: t?.subscribed },
            { value: 'not', label: 'Not', count: t?.notSubscribed },
            { value: 'all', label: 'All', count: t?.total },
          ]}
        />
      </div>
      {error && <div className="adm-muted" style={{ padding: '8px 10px', fontSize: 12 }}>Could not load subscribers: {error}</div>}
      <div className="adm-rows-box adm-sub-list" style={{ overflowY: 'auto' }}>
        {!data && !error ? <SkeletonRows rows={6} cols={2} /> : rows.length === 0 ? (
          <Empty title={query ? 'No match' : 'Nobody here'} body={query ? `Nobody matches “${query}”.` : undefined} />
        ) : (
          <ul>
            {rows.map(u => (
              <li key={u._id}>
                <div className="adm-sub-who">
                  <span className="adm-cell-strong" title={u.email}>{u.email}</span>
                  <span className="adm-muted">
                    <Dot tone={u.isSubscribed ? 'ok' : 'neutral'} /> {statusLabel(u)}{statusDetail(u) && ` · ${statusDetail(u)}`}{u.name && ` · ${u.name}`}
                  </span>
                </div>
                <Btn size="sm" loading={saving === u.email} onClick={() => toggle(u)}>
                  {u.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                </Btn>
              </li>
            ))}
            {rows.length >= limit && (
              <li className="adm-sub-more">
                <Btn size="sm" variant="ghost" onClick={() => setLimit(n => n + PAGE_SIZE)}>Show {PAGE_SIZE} more</Btn>
              </li>
            )}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export default withFeature('adminSubscribers', SubscribersPanel);
