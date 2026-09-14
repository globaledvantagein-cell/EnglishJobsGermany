'use client';

import { useEffect, useState } from 'react';
import { Container, PageHeader, Button, Badge, Input, EmptyState } from '../components/ui';
import { relativeTime } from '../utils/date';
import { apiGet, apiPatch, apiDelete } from '../utils/jobApi';

type FeedbackStatus = 'unread' | 'read' | 'resolved' | 'archived';

interface FeedbackItem {
  _id: string;
  name?: string | null;
  email?: string | null;
  message: string;
  wordCount?: number;
  source?: string | null;
  status: FeedbackStatus;
  adminNote?: string | null;
  createdAt?: string;
}

interface FeedbackStats {
  total: number;
  unread: number;
  read: number;
  resolved: number;
}

const STATUS_TABS: Array<{ key: 'all' | FeedbackStatus; label: string }> = [
  { key: 'all',       label: 'All' },
  { key: 'unread',    label: 'Unread' },
  { key: 'read',      label: 'Read' },
  { key: 'resolved',  label: 'Resolved' },
  { key: 'archived',  label: 'Archived' },
];

function statusDotColor(status: FeedbackStatus) {
  if (status === 'unread') return 'var(--primary)';
  if (status === 'read') return 'var(--success)';
  if (status === 'resolved') return 'var(--text-muted)';
  return 'var(--subtle-ink)';
}

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stats, setStats] = useState<FeedbackStats>({ total: 0, unread: 0, read: 0, resolved: 0 });
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});

  const fetchStats = async () => {
    try {
      const payload = await apiGet<FeedbackStats>('/api/feedback/stats');
      setStats({
        total: payload?.total || 0,
        unread: payload?.unread || 0,
        read: payload?.read || 0,
        resolved: payload?.resolved || 0,
      });
    } catch {
      // no-op
    }
  };

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('page', '1');
      query.set('limit', '100');
      query.set('status', statusFilter);

      const payload = await apiGet<{ feedback?: FeedbackItem[] }>(`/api/feedback?${query}`);
      const list = Array.isArray(payload?.feedback) ? payload.feedback : [];
      setItems(list);

      const initial: Record<string, string> = {};
      list.forEach(item => { initial[item._id] = item.adminNote || ''; });
      setAdminNotes(initial);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
    fetchStats();
  }, [statusFilter]);

  const patchStatus = async (id: string, status: FeedbackStatus, adminNote: string | null = null) => {
    setSavingId(id);
    try {
      await apiPatch(`/api/feedback/${id}`, { status, adminNote });
      await fetchFeedback();
      await fetchStats();
    } catch (err) {
      console.error('[AdminFeedback] patch failed', err);
    } finally {
      setSavingId(null);
    }
  };

  const removeFeedback = async (id: string) => {
    if (!window.confirm('Delete this feedback permanently?')) return;
    setDeletingId(id);
    try {
      await apiDelete(`/api/feedback/${id}`);
      await fetchFeedback();
      await fetchStats();
    } catch (err) {
      console.error('[AdminFeedback] delete failed', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '28px 0' }}>
        <Container size="lg">
          <PageHeader
            label="Admin"
            title="Feedback"
            subtitle="Review and manage feedback sent from the footer form"
            actions={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge variant="blue">{stats.unread} unread</Badge>
                <Badge variant="neutral">{stats.total} total</Badge>
              </div>
            }
          />
        </Container>
      </div>

      <Container size="lg" style={{ padding: '20px 24px 40px' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
          {STATUS_TABS.map(tab => {
            const active = tab.key === statusFilter;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: 999,
                  background: active ? 'var(--primary-soft)' : 'var(--bg-surface)',
                  color: active ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: '0.78rem', fontWeight: 700,
                  padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 160 }} />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No feedback found" body="New footer submissions will appear here." />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map(item => {
              const isUnread = item.status === 'unread';
              const currentNote = adminNotes[item._id] ?? '';
              return (
                <div
                  key={item._id}
                  style={{
                    border: '1px solid var(--border)',
                    borderLeft: isUnread ? '3px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: 12,
                    background: isUnread ? 'var(--primary-soft)' : 'var(--bg-surface)',
                    padding: '14px 14px 12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDotColor(item.status), flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', fontStyle: (item.name || 'Anonymous') === 'Anonymous' ? 'italic' : 'normal' }}>
                        {item.name || 'Anonymous'}
                      </p>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{relativeTime(item.createdAt)}</p>
                  </div>

                  <p style={{ margin: '6px 0 10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {item.email
                      ? <a href={`mailto:${item.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{item.email}</a>
                      : 'No email'}
                  </p>

                  <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {item.message}
                  </p>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Badge variant="neutral" style={{ fontSize: '0.68rem' }}>Source: {item.source || 'footer'}</Badge>
                    <Badge variant="neutral" style={{ fontSize: '0.68rem' }}>{item.wordCount || 0} words</Badge>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {item.status === 'unread' && (
                      <Button variant="outline" size="sm" loading={savingId === item._id} onClick={() => patchStatus(item._id, 'read')}>
                        Mark Read
                      </Button>
                    )}
                    <Button variant="outline" size="sm" loading={savingId === item._id} onClick={() => patchStatus(item._id, 'resolved')}>
                      Resolve
                    </Button>
                    <Button variant="outline" size="sm" loading={savingId === item._id} onClick={() => patchStatus(item._id, 'archived')}>
                      Archive
                    </Button>
                    <Button variant="danger" size="sm" loading={deletingId === item._id} onClick={() => removeFeedback(item._id)}>
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNoteOpen(prev => ({ ...prev, [item._id]: !prev[item._id] }))}
                    >
                      {noteOpen[item._id] ? 'Hide Note' : 'Admin Note'}
                    </Button>
                  </div>

                  {noteOpen[item._id] && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 280px' }}>
                        <Input
                          value={currentNote}
                          onChange={e => setAdminNotes(prev => ({ ...prev, [item._id]: e.target.value }))}
                          placeholder="Add an admin note"
                          maxLength={500}
                          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}
                        />
                      </div>
                      <Button
                        size="sm"
                        loading={savingId === item._id}
                        onClick={() => patchStatus(item._id, item.status, currentNote || null)}
                      >
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}