'use client';

/**
 * /admin/career-guide — all articles (drafts + published) in one table.
 * Editing happens on /admin/career-guide/[id] (or /new).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useNavigate } from '@/compat/router';
import { apiDelete, apiGet, apiPatch } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { Btn, Empty, LinkBtn, Page, Pill, SearchInput, Seg, SkeletonRows, errorText, fmtAge, fmtDate, fmtNumber } from '../../components/admin/primitives';
import { CAREER_GUIDE_CATEGORIES, CAREER_GUIDE_CATEGORY_LABELS, readingMinutes, type Article } from '../../components/admin/careerGuideShared';

type StatusFilter = 'all' | 'published' | 'draft';

export default function AdminCareerGuide() {
  const navigate = useNavigate();
  const { toast, confirm } = useAdminUi();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ articles: Article[] }>('/api/admin/career-guide');
      setArticles(res.articles ?? []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter(a =>
      (status === 'all' || a.status === status)
      && (!category || a.category === category)
      && (!q || a.title.toLowerCase().includes(q) || a.slug.includes(q) || a.tags.some(t => t.toLowerCase().includes(q))));
  }, [articles, status, category, query]);

  const published = articles.filter(a => a.status === 'published').length;

  const togglePublish = async (article: Article) => {
    const action = article.status === 'published' ? 'unpublish' : 'publish';
    setBusyId(article._id);
    try {
      const res = await apiPatch<{ article: Article }>(`/api/admin/career-guide/${article._id}/${action}`, {});
      setArticles(prev => prev.map(a => (a._id === article._id ? res.article : a)));
      toast(`${action === 'publish' ? 'Published' : 'Unpublished'}: ${article.title}`);
    } catch (err) {
      toast(`Failed to ${action}: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (article: Article) => {
    const ok = await confirm({ title: `Delete “${article.title}”?`, body: 'The article and its URL are removed permanently.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/career-guide/${article._id}`);
      setArticles(prev => prev.filter(a => a._id !== article._id));
      toast('Article deleted');
    } catch (err) {
      toast(`Delete failed: ${errorText(err)}`, { tone: 'bad' });
    }
  };

  const columns: Column<Article>[] = [
    {
      key: 'title', header: 'Title',
      render: a => <span className="adm-cell-strong">{a.title}</span>,
      title: a => a.description, sortValue: a => a.title.toLowerCase(),
    },
    { key: 'cat', header: 'Category', width: 160, render: a => CAREER_GUIDE_CATEGORY_LABELS[a.category] ?? a.category, sortValue: a => a.category },
    {
      key: 'status', header: 'Status', width: 104,
      render: a => a.status === 'published' ? <Pill tone="ok">Published</Pill> : <Pill tone="outline">Draft</Pill>,
      sortValue: a => a.status,
    },
    { key: 'read', header: 'Read', width: 56, align: 'right', hideOnSmall: true, render: a => <span className="adm-muted">{readingMinutes(a.content)}m</span>, sortValue: a => readingMinutes(a.content) },
    { key: 'pub', header: 'Published', width: 104, hideOnSmall: true, render: a => <span className="adm-muted">{fmtDate(a.publishedAt)}</span>, sortValue: a => -new Date(a.publishedAt || 0).getTime() },
    { key: 'upd', header: 'Updated', width: 72, align: 'right', render: a => <span className="adm-muted">{fmtAge(a.updatedAt)}</span>, sortValue: a => -new Date(a.updatedAt).getTime() },
    {
      key: 'actions', header: '', width: 196, className: 'adm-cell-actions',
      render: a => (
        <span className="adm-row" style={{ justifyContent: 'flex-end', gap: 2 }} onClick={e => e.stopPropagation()}>
          <Btn size="sm" variant="ghost" onClick={() => togglePublish(a)} loading={busyId === a._id}>
            {a.status === 'published' ? 'Unpublish' : 'Publish'}
          </Btn>
          {a.status === 'published' && (
            <a className="adm-btn" data-size="sm" data-variant="ghost" data-icon="true" href={`/career-guide/${a.category}/${a.slug}`} target="_blank" rel="noopener noreferrer" title="View live">
              <Eye size={13} />
            </a>
          )}
          <Btn size="sm" variant="ghost" icon onClick={() => navigate(`/admin/career-guide/${a._id}`)} title="Edit"><Pencil size={13} /></Btn>
          <Btn size="sm" variant="ghost" icon onClick={() => remove(a)} title="Delete"><Trash2 size={13} /></Btn>
        </span>
      ),
    },
  ];

  return (
    <Page
      title="Career guide"
      sub={`${fmtNumber(articles.length)} articles · ${fmtNumber(published)} published`}
      actions={
        <>
          <Btn onClick={load} loading={loading && articles.length > 0}><RefreshCw size={13} />Refresh</Btn>
          <LinkBtn to="/admin/career-guide/new" variant="primary"><Plus size={13} />New article</LinkBtn>
        </>
      }
      flush
    >
      <div className="adm-toolbar">
        <Seg<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: articles.length },
            { value: 'published', label: 'Published', count: published },
            { value: 'draft', label: 'Drafts', count: articles.length - published },
          ]}
        />
        <select className="adm-select" style={{ width: 190 }} value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CAREER_GUIDE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className="adm-grow" />
        <SearchInput value={query} onChange={setQuery} placeholder="Title, slug or tag" width={200} />
      </div>
      {loading && articles.length === 0 ? <SkeletonRows rows={10} cols={5} /> : error ? (
        <Empty title="Could not load articles" body={error} action={<Btn onClick={load}>Retry</Btn>} />
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={a => a._id}
          onRowClick={a => navigate(`/admin/career-guide/${a._id}`)}
          initialSort={{ key: 'upd', dir: 'asc' }}
          empty={<Empty title={articles.length ? 'No articles match' : 'No articles yet'} action={<LinkBtn to="/admin/career-guide/new" variant="primary">Write the first guide</LinkBtn>} />}
        />
      )}
    </Page>
  );
}
