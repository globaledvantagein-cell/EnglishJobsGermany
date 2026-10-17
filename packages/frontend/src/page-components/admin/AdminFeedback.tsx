'use client';

/**
 * /admin/feedback — footer feedback as an inbox.
 *
 * Loads the latest 200 items once and filters client-side, so every status tab
 * shows an exact count. Opening an unread message marks it read (like any mail
 * client); "u" puts it back. Status changes send no adminNote, which the
 * backend treats as "leave the note alone".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckCheck, Mail, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { useAdminCounts } from '../../components/admin/AdminShell';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useHotkeys, stepSelection } from '../../components/admin/useHotkeys';
import {
  Btn, DefinitionGrid, Dot, Empty, Field, Page, Pill, Seg, SearchInput, SkeletonRows, errorText, fmtAge, fmtDate, fmtNumber, type Tone,
} from '../../components/admin/primitives';

type Status = 'unread' | 'read' | 'resolved' | 'archived';
type Tab = 'all' | Status;

interface Feedback {
  _id: string;
  name?: string | null;
  email?: string | null;
  message: string;
  wordCount?: number;
  source?: string | null;
  userAgent?: string | null;
  status: Status;
  adminNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const LOAD_LIMIT = 200;
const STATUS_TONE: Record<Status, Tone> = { unread: 'accent', read: 'neutral', resolved: 'ok', archived: 'outline' };

export default function AdminFeedback() {
  const { toast, confirm } = useAdminUi();
  const { refreshCounts } = useAdminCounts();

  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('unread');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Messages read during this visit stay in the Unread tab until refresh.
  // Without this, reading one drops it from the list, the selection jumps to the
  // next unread message, and the admin loses their place.
  const [readThisVisit, setReadThisVisit] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ feedback: Feedback[] }>(`/api/feedback?page=1&limit=${LOAD_LIMIT}&status=all`);
      const list = res.feedback ?? [];
      setItems(list);
      setReadThisVisit(new Set());
      // Land on "All" when there is nothing unread, rather than an empty tab.
      setTab(current => (current === 'unread' && !list.some(f => f.status === 'unread') ? 'all' : current));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tally = useMemo(() => {
    const counts: Record<Tab, number> = { all: items.length, unread: 0, read: 0, resolved: 0, archived: 0 };
    items.forEach(f => { counts[f.status]++; });
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(f => {
      if (tab === 'unread' && f.status !== 'unread' && !readThisVisit.has(f._id)) return false;
      if (tab !== 'all' && tab !== 'unread' && f.status !== tab) return false;
      return !q || f.message.toLowerCase().includes(q) || f.name?.toLowerCase().includes(q) || f.email?.toLowerCase().includes(q);
    });
  }, [items, tab, query, readThisVisit]);
  const visibleIds = useMemo(() => visible.map(f => f._id), [visible]);
  // The selection falls back to the first visible row (e.g. after a filter
  // change hides the selected one).
  const effectiveId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0] ?? null;
  const selected = items.find(f => f._id === effectiveId) ?? null;

  const setStatus = useCallback(async (item: Feedback, status: Status, quiet = false) => {
    if (item.status === status) return;
    const previous = item.status;
    setItems(prev => prev.map(f => (f._id === item._id ? { ...f, status } : f)));
    try {
      await apiPatch(`/api/feedback/${item._id}`, { status });
      refreshCounts();
      if (!quiet) toast(`Marked ${status}`);
    } catch (err) {
      setItems(prev => prev.map(f => (f._id === item._id ? { ...f, status: previous } : f)));
      toast(`Update failed: ${errorText(err)}`, { tone: 'bad' });
    }
  }, [refreshCounts, toast]);

  // Opening an unread message (click or j/k) marks it read, like a mail
  // client. The row auto-selected on page load is not "opened", and pressing
  // "u" on an open message keeps it unread.
  const pick = (id: string | null) => {
    setSelectedId(id);
    const item = items.find(f => f._id === id);
    if (item?.status === 'unread') {
      setReadThisVisit(prev => new Set(prev).add(item._id));
      setStatus(item, 'read', true);
    }
  };

  const remove = async (item: Feedback) => {
    if (!(await confirm({ title: 'Delete this feedback?', body: 'It is removed permanently.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await apiDelete(`/api/feedback/${item._id}`);
      const position = visibleIds.indexOf(item._id);
      setSelectedId(visibleIds[position + 1] ?? visibleIds[position - 1] ?? null);
      setItems(prev => prev.filter(f => f._id !== item._id));
      refreshCounts();
      toast('Feedback deleted');
    } catch (err) {
      toast(`Delete failed: ${errorText(err)}`, { tone: 'bad' });
    }
  };

  const saveNote = async (item: Feedback, note: string) => {
    try {
      await apiPatch(`/api/feedback/${item._id}`, { status: item.status, adminNote: note });
      setItems(prev => prev.map(f => (f._id === item._id ? { ...f, adminNote: note } : f)));
      toast('Note saved');
    } catch (err) {
      toast(`Could not save note: ${errorText(err)}`, { tone: 'bad' });
    }
  };

  const move = (delta: number) => pick(stepSelection(visibleIds, effectiveId, delta));
  useHotkeys({
    j: () => move(1), ArrowDown: () => move(1),
    k: () => move(-1), ArrowUp: () => move(-1),
    x: () => { if (selected) setStatus(selected, 'resolved'); },
    y: () => { if (selected) setStatus(selected, 'archived'); },
    u: () => { if (selected) setStatus(selected, 'unread'); },
    '/': () => searchRef.current?.focus(),
  });

  const columns: Column<Feedback>[] = [
    { key: 'status', header: '', width: 30, render: f => <Dot tone={STATUS_TONE[f.status]} title={f.status} /> },
    {
      key: 'from', header: 'From', width: '24%',
      render: f => <span className={f.status === 'unread' ? 'adm-cell-strong' : undefined}>{f.name || <em className="adm-muted">Anonymous</em>}</span>,
      title: f => f.email ?? undefined, sortValue: f => (f.name || '').toLowerCase(),
    },
    { key: 'msg', header: 'Message', render: f => <span className="adm-muted">{f.message}</span>, title: f => f.message },
    {
      key: 'age', header: 'Age', width: 52, align: 'right',
      render: f => <span className="adm-muted" title={f.createdAt}>{fmtAge(f.createdAt)}</span>,
      sortValue: f => -new Date(f.createdAt || 0).getTime(),
    },
  ];

  return (
    <Page
      title="Feedback"
      sub={`${fmtNumber(tally.unread)} unread · ${fmtNumber(items.length)} total`}
      actions={
        <>
          <SearchInput value={query} onChange={setQuery} placeholder="Search feedback" width={200} inputRef={searchRef} />
          <Btn onClick={load} loading={loading && items.length > 0}><RefreshCw size={13} />Refresh</Btn>
        </>
      }
      flush
    >
      <div className="adm-split" data-detail-open={mobileDetail ? 'true' : 'false'}>
        <div className="adm-split-list">
          <div className="adm-toolbar">
            <Seg<Tab>
              label="Status"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'unread', label: 'Unread', count: tally.unread },
                { value: 'read', label: 'Read', count: tally.read },
                { value: 'resolved', label: 'Resolved', count: tally.resolved },
                { value: 'archived', label: 'Archived', count: tally.archived },
                { value: 'all', label: 'All', count: tally.all },
              ]}
            />
          </div>
          {loading && items.length === 0 ? <SkeletonRows rows={14} cols={3} /> : error ? (
            <Empty title="Could not load feedback" body={error} action={<Btn onClick={load}>Retry</Btn>} />
          ) : (
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={f => f._id}
              selectedKey={effectiveId}
              onRowClick={f => { pick(f._id); setMobileDetail(true); }}
              empty={<Empty title={tab === 'unread' ? 'No unread feedback' : 'Nothing here'} />}
              footer={<span>{fmtNumber(visible.length)} shown{items.length >= LOAD_LIMIT ? ` · latest ${LOAD_LIMIT} loaded` : ''}</span>}
            />
          )}
        </div>
        <div className="adm-split-detail">
          {selected ? (
            <FeedbackDetail
              key={selected._id}
              item={selected}
              onStatus={status => setStatus(selected, status)}
              onDelete={() => remove(selected)}
              onSaveNote={note => saveNote(selected, note)}
              onBack={() => setMobileDetail(false)}
            />
          ) : <Empty title={loading ? 'Loading…' : 'Nothing selected'} />}
        </div>
      </div>
    </Page>
  );
}

function FeedbackDetail({ item, onStatus, onDelete, onSaveNote, onBack }: {
  item: Feedback;
  onStatus: (s: Status) => void;
  onDelete: () => void;
  onSaveNote: (note: string) => Promise<void>;
  onBack: () => void;
}) {
  const [note, setNote] = useState(item.adminNote ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = note !== (item.adminNote ?? '');

  const save = async () => {
    setSaving(true);
    await onSaveNote(note);
    setSaving(false);
  };

  return (
    <>
      <header className="adm-detail-head">
        <Btn size="sm" variant="ghost" onClick={onBack} className="adm-show-sm" style={{ marginBottom: 6 }}>← Back to list</Btn>
        <div className="adm-row">
          <h2 className="adm-detail-title adm-grow" style={{ margin: 0 }}>{item.name || 'Anonymous'}</h2>
          <Pill tone={STATUS_TONE[item.status]}>{item.status}</Pill>
        </div>
        <div className="adm-row adm-muted" style={{ marginTop: 2 }}>
          {item.email ? <a href={`mailto:${item.email}`} style={{ color: 'var(--adm-accent)' }}>{item.email}</a> : 'No email'}
          <span>·</span>
          <span>{fmtDate(item.createdAt)} ({fmtAge(item.createdAt)} ago)</span>
        </div>
      </header>
      <div className="adm-detail-scroll">
        <div className="adm-stack" style={{ gap: 12 }}>
          <div className="adm-panel" style={{ padding: '12px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13.5 }}>
            {item.message}
          </div>
          <DefinitionGrid items={[
            ['Source', item.source || 'footer'],
            ['Words', fmtNumber(item.wordCount ?? 0)],
            ['Updated', fmtDate(item.updatedAt)],
            ['Browser', item.userAgent || '—'],
          ]} />
          <Field label="Admin note" hint="Private. Ctrl+Enter to save.">
            <textarea
              className="adm-textarea"
              rows={4}
              maxLength={500}
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && dirty) save(); }}
              placeholder="Follow-up, context, decision…"
            />
          </Field>
          {dirty && (
            <div className="adm-row">
              <Btn size="sm" variant="primary" onClick={save} loading={saving}><Save size={12} />Save note</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setNote(item.adminNote ?? '')}>Discard</Btn>
            </div>
          )}
        </div>
      </div>
      <footer className="adm-actionbar">
        <Btn variant="danger" onClick={onDelete}><Trash2 size={13} />Delete</Btn>
        <span className="adm-grow" />
        {item.email && <a className="adm-btn" href={`mailto:${item.email}?subject=${encodeURIComponent('Re: your feedback on English Jobs Germany')}`}><Mail size={13} />Reply</a>}
        <Btn onClick={() => onStatus('unread')} disabled={item.status === 'unread'} kbd="U">Unread</Btn>
        <Btn onClick={() => onStatus('archived')} disabled={item.status === 'archived'} kbd="Y"><Archive size={13} />Archive</Btn>
        <Btn variant="ok" onClick={() => onStatus('resolved')} disabled={item.status === 'resolved'} kbd="X"><CheckCheck size={13} />Resolve</Btn>
      </footer>
    </>
  );
}
