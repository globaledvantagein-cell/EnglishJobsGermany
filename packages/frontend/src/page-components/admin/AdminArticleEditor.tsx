'use client';

/**
 * /admin/career-guide/[id] — markdown editor with a live preview.
 *
 * Metadata sits in one compact band; below it the editor and preview split the
 * remaining height and scroll independently. Ctrl/Cmd+S saves (keeps the
 * current status). Leaving with unsaved changes asks first.
 *
 * The preview renders the admin's own markdown with marked and no client-side
 * sanitising: it is the admin's draft in the admin's browser. Public pages are
 * sanitised server-side, which is the boundary that matters.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { ArrowLeft, Eye, Save, Send } from 'lucide-react';
import { useNavigate } from '@/compat/router';
import { apiGet, apiPatch, apiPost } from '../../utils/jobApi';
import { useAdminUi } from '../../components/admin/AdminUiContext';
import { Btn, Empty, Field, Pill, SkeletonRows, errorText, fmtAge } from '../../components/admin/primitives';
import {
  CAREER_GUIDE_CATEGORIES, META_DESCRIPTION_MAX, readingMinutes, slugify, type Article,
} from '../../components/admin/careerGuideShared';

interface Draft { title: string; slug: string; category: string; description: string; tags: string; content: string }

const EMPTY_DRAFT: Draft = { title: '', slug: '', category: CAREER_GUIDE_CATEGORIES[0][0], description: '', tags: '', content: '' };

function toDraft(article: Article): Draft {
  return {
    title: article.title, slug: article.slug, category: article.category,
    description: article.description, tags: article.tags.join(', '), content: article.content,
  };
}

export default function AdminArticleEditor({ articleId }: { articleId: string | null }) {
  const navigate = useNavigate();
  const { toast, confirm } = useAdminUi();

  const [article, setArticle] = useState<Article | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(Boolean(articleId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'split' | 'write' | 'preview'>('split');

  useEffect(() => {
    if (!articleId) return;
    apiGet<{ article: Article }>(`/api/admin/career-guide/${articleId}`)
      .then(res => { setArticle(res.article); setDraft(toDraft(res.article)); setSlugTouched(true); })
      .catch(err => setLoadError(errorText(err)))
      .finally(() => setLoading(false));
  }, [articleId]);

  const baseline = useMemo(() => (article ? toDraft(article) : EMPTY_DRAFT), [article]);
  const dirty = (Object.keys(draft) as Array<keyof Draft>).some(key => draft[key] !== baseline[key]);

  // Warn on tab close / reload with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(prev => {
      const next = { ...prev, [key]: value };
      // Slug follows the title until it is edited by hand.
      if (key === 'title' && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
  };

  const previewHtml = useMemo(() => marked.parse(draft.content || '', { async: false }) as string, [draft.content]);

  const save = useCallback(async (status: Article['status']) => {
    if (!draft.title.trim()) { toast('Title is required', { tone: 'bad' }); return; }
    if (!draft.content.trim()) { toast('Content is required', { tone: 'bad' }); return; }
    setSaving(true);
    const body = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || slugify(draft.title),
      category: draft.category,
      description: draft.description.trim(),
      tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean),
      content: draft.content,
    };
    try {
      let saved: Article;
      if (article) {
        saved = (await apiPatch<{ article: Article }>(`/api/admin/career-guide/${article._id}`, body)).article;
        // Status is owned by the publish/unpublish endpoints.
        if (status !== article.status) {
          saved = (await apiPatch<{ article: Article }>(`/api/admin/career-guide/${article._id}/${status === 'published' ? 'publish' : 'unpublish'}`, {})).article;
        }
      } else {
        saved = (await apiPost<{ article: Article }>('/api/admin/career-guide', { ...body, status: 'draft' })).article;
        if (status === 'published') {
          saved = (await apiPatch<{ article: Article }>(`/api/admin/career-guide/${saved._id}/publish`, {})).article;
        }
        navigate(`/admin/career-guide/${saved._id}`, { replace: true });
      }
      setArticle(saved);
      setDraft(toDraft(saved));
      setSlugTouched(true);
      toast(status === 'published' ? 'Saved and published' : 'Draft saved');
    } catch (err) {
      toast(`Save failed: ${errorText(err)}`, { tone: 'bad' });
    } finally {
      setSaving(false);
    }
  }, [draft, article, navigate, toast]);

  // Ctrl/Cmd+S keeps the current status.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) save(article?.status ?? 'draft');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, saving, article]);

  const goBack = async () => {
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', confirmLabel: 'Discard', danger: true }))) return;
    navigate('/admin/career-guide');
  };

  if (loading) return <SkeletonRows rows={16} cols={2} />;
  if (loadError) return <Empty title="Could not load article" body={loadError} action={<Btn onClick={() => navigate('/admin/career-guide')}>Back to articles</Btn>} />;

  const descriptionOver = draft.description.length > META_DESCRIPTION_MAX;
  const isPublished = article?.status === 'published';

  return (
    <section className="adm-page">
      <header className="adm-page-head">
        <Btn variant="ghost" size="sm" onClick={goBack}><ArrowLeft size={13} />Articles</Btn>
        <h1 className="adm-page-title adm-truncate" style={{ maxWidth: 420 }}>{draft.title || 'Untitled article'}</h1>
        {article ? <Pill tone={isPublished ? 'ok' : 'outline'}>{isPublished ? 'Published' : 'Draft'}</Pill> : <Pill tone="outline">New</Pill>}
        <span className="adm-page-sub">
          {readingMinutes(draft.content)} min read{article ? ` · saved ${fmtAge(article.updatedAt)} ago` : ''}{dirty ? ' · unsaved changes' : ''}
        </span>
        <div className="adm-page-actions">
          {isPublished && (
            <a className="adm-btn" data-variant="ghost" href={`/career-guide/${article!.category}/${article!.slug}`} target="_blank" rel="noopener noreferrer"><Eye size={13} />View live</a>
          )}
          {isPublished && <Btn onClick={() => save('draft')} disabled={saving}>Unpublish</Btn>}
          <Btn onClick={() => save(isPublished ? 'published' : 'draft')} loading={saving} disabled={!dirty} kbd="Ctrl S"><Save size={13} />Save</Btn>
          {!isPublished && <Btn variant="primary" onClick={() => save('published')} disabled={saving}><Send size={13} />Publish</Btn>}
        </div>
      </header>

      <div style={{ padding: 'var(--adm-pad)', borderBottom: '1px solid var(--adm-line)', background: 'var(--adm-panel)' }}>
        <div className="adm-grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.4fr)' }}>
          <Field label="Title">
            <input className="adm-input" value={draft.title} onChange={e => set('title', e.target.value)} placeholder="How to get a Blue Card in 2026" />
          </Field>
          <Field label="Slug">
            <input className="adm-input adm-mono" value={draft.slug} onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} />
          </Field>
          <Field label="Category">
            <select className="adm-select" value={draft.category} onChange={e => set('category', e.target.value)}>
              {CAREER_GUIDE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Tags" >
            <input className="adm-input" value={draft.tags} onChange={e => set('tags', e.target.value)} placeholder="visa, blue card" />
          </Field>
          <Field
            label="Meta description"
            span={4}
            hint={<span style={{ color: descriptionOver ? 'var(--adm-bad)' : undefined }}>{draft.description.length}/{META_DESCRIPTION_MAX}{descriptionOver ? ' — will be truncated on save' : ' · shown in Google results'}</span>}
          >
            <input className="adm-input" value={draft.description} onChange={e => set('description', e.target.value)} placeholder="One sentence that makes someone click." />
          </Field>
        </div>
      </div>

      <div className="adm-toolbar">
        <strong style={{ fontSize: 12 }}>Content</strong>
        <span className="adm-muted">Markdown · {draft.content.trim().split(/\s+/).filter(Boolean).length} words</span>
        <span className="adm-grow" />
        <div className="adm-seg" role="group" aria-label="Editor view">
          {(['write', 'split', 'preview'] as const).map(mode => (
            <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} style={{ textTransform: 'capitalize' }}>{mode}</button>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, display: 'grid',
          gridTemplateColumns: view === 'split' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
        }}
      >
        {view !== 'preview' && (
          <textarea
            className="adm-mono"
            value={draft.content}
            onChange={e => set('content', e.target.value)}
            placeholder={'## Introduction\n\nWrite in markdown…'}
            spellCheck
            style={{
              resize: 'none', border: 'none', outline: 'none', padding: '12px 14px', lineHeight: 1.65, fontSize: 13,
              background: 'var(--adm-panel)', color: 'var(--adm-ink)', minHeight: 0, height: '100%',
              borderRight: view === 'split' ? '1px solid var(--adm-line)' : undefined,
            }}
          />
        )}
        {view !== 'write' && (
          <div style={{ overflowY: 'auto', padding: '12px 18px 32px', minHeight: 0 }}>
            {draft.content.trim()
              ? <article className="adm-prose" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              : <span className="adm-muted">The preview appears here as you type.</span>}
          </div>
        )}
      </div>
    </section>
  );
}
