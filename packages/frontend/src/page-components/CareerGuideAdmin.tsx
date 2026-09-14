'use client';

/**
 * /admin/career-guide — write and manage Career Guide articles.
 *
 * Two views in one page: a list of every article (published + drafts), and an
 * editor. Content is markdown, rendered live in a preview pane.
 *
 * The preview uses marked WITHOUT client-side sanitisation: it renders the
 * admin's own draft in the admin's own browser. Public pages are sanitised
 * server-side (api/careerGuide.routes.js) — that is the boundary that matters.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { marked } from 'marked';
import { Plus, Pencil, Trash2, ArrowLeft, Eye } from 'lucide-react';
import { Container, PageHeader, Button, Badge, Alert, Input, Textarea, Select, Label } from '../components/ui';
import { apiGet, apiPost, apiPatch, apiDelete } from '../utils/jobApi';
import { BRAND } from '../theme/brand';

// Mirrors CAREER_GUIDE_CATEGORY_LABELS in backend src/db/careerGuide.js.
const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['finding-jobs', 'Finding Jobs'],
  ['companies', 'Companies'],
  ['visas-immigration', 'Visas & Immigration'],
  ['salaries-careers', 'Salaries & Careers'],
  ['students-graduates', 'Students & Graduates'],
  ['living-in-germany', 'Living in Germany'],
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES) as Record<string, string>;

const DESCRIPTION_MAX = 160;

interface Article {
  _id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  description: string;
  author: string;
  tags: string[];
  status: 'draft' | 'published';
  publishedAt: string | null;
  updatedAt: string;
}

/** Mirrors slugify() in backend src/db/careerGuide.js. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CareerGuideAdmin() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = `Career Guide · ${BRAND.appName}`; }, []);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ articles: Article[] }>('/api/admin/career-guide')
      .then(data => setArticles(data?.articles || []))
      .catch(() => setError('Could not load articles.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (article: Article) => {
    // No custom modal here — confirm() is fine for a destructive admin action.
    if (!window.confirm(`Delete “${article.title}”? This cannot be undone.`)) return;
    try {
      await apiDelete(`/api/admin/career-guide/${article._id}`);
      setArticles(prev => prev.filter(a => a._id !== article._id));
    } catch {
      setError('Failed to delete article.');
    }
  };

  const handleTogglePublish = async (article: Article) => {
    const action = article.status === 'published' ? 'unpublish' : 'publish';
    try {
      const res = await apiPatch<{ article: Article }>(`/api/admin/career-guide/${article._id}/${action}`, {});
      setArticles(prev => prev.map(a => (a._id === article._id ? res.article : a)));
    } catch {
      setError(`Failed to ${action} article.`);
    }
  };

  if (editing) {
    return (
      <ArticleEditor
        article={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <Container style={{ padding: '24px 24px 64px', maxWidth: 1100 }}>
      <PageHeader
        label="ADMIN"
        title="Career Guide"
        subtitle="Write and publish guides. Published articles are server-rendered at /career-guide for SEO."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus size={15} /> New Article
          </Button>
        }
      />

      {error && <div style={{ marginBottom: 14 }}><Alert type="error">{error}</Alert></div>}

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />)}
        </div>
      ) : articles.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 14 }}>
            No articles yet. Write the first guide.
          </p>
          <Button onClick={() => setEditing('new')}><Plus size={15} /> New Article</Button>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)' }}>
                  {['Title', 'Category', 'Status', 'Published', ''].map((h, i) => (
                    <th key={h || i} style={{
                      textAlign: 'left', padding: '10px 12px', fontWeight: 700,
                      fontSize: '0.74rem', letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articles.map(article => (
                  <tr key={article._id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {article.title}
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                        /{article.slug}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {CATEGORY_LABELS[article.category] || article.category}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge variant={article.status === 'published' ? 'green' : 'neutral'}>
                        {article.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(article.publishedAt)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {article.status === 'published' && (
                          <a
                            href={`/career-guide/${article.category}/${article.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            title="View live page"
                          >
                            <Button variant="ghost" size="sm"><Eye size={13} /></Button>
                          </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleTogglePublish(article)}>
                          {article.status === 'published' ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(article)}>
                          <Pencil size={13} /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(article)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Container>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

const PREVIEW_STYLE: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg-surface)',
  padding: '14px 16px',
  minHeight: 200,
  fontSize: '0.88rem',
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
  overflowX: 'auto',
};

function ArticleEditor({
  article, onCancel, onSaved,
}: { article: Article | null; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(article?.title || '');
  const [slug, setSlug] = useState(article?.slug || '');
  const [slugTouched, setSlugTouched] = useState(Boolean(article));
  const [category, setCategory] = useState(article?.category || CATEGORIES[0][0]);
  const [description, setDescription] = useState(article?.description || '');
  const [tags, setTags] = useState((article?.tags || []).join(', '));
  const [content, setContent] = useState(article?.content || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slug follows the title until the author edits it by hand.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  const previewHtml = useMemo(() => marked.parse(content || '', { async: false }) as string, [content]);

  const save = async (status: 'draft' | 'published') => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!content.trim()) { setError('Content is required.'); return; }

    setSaving(true);
    setError(null);

    const body = {
      title: title.trim(),
      slug: slug.trim() || slugify(title),
      category,
      description: description.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      content,
    };

    try {
      if (article) {
        await apiPatch(`/api/admin/career-guide/${article._id}`, body);
        // Status is owned by the publish/unpublish endpoints, so only call
        // them when the requested status differs from what's stored.
        if (status !== article.status) {
          await apiPatch(`/api/admin/career-guide/${article._id}/${status === 'published' ? 'publish' : 'unpublish'}`, {});
        }
      } else {
        const res = await apiPost<{ article: Article }>('/api/admin/career-guide', { ...body, status: 'draft' });
        if (status === 'published') {
          await apiPatch(`/api/admin/career-guide/${res.article._id}/publish`, {});
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      setSaving(false);
    }
  };

  const descriptionOver = description.length > DESCRIPTION_MAX;

  return (
    <Container style={{ padding: '24px 24px 64px', maxWidth: 1100 }}>
      <button
        onClick={onCancel}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: '0.84rem', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 14,
          fontWeight: 600,
        }}
      >
        <ArrowLeft size={14} /> Back to articles
      </button>

      <PageHeader
        label={article ? 'EDIT ARTICLE' : 'NEW ARTICLE'}
        title={article ? article.title || 'Untitled' : 'New Article'}
        subtitle={
          article
            ? `${article.status === 'published' ? 'Published' : 'Draft'} · last updated ${formatDate(article.updatedAt)}`
            : 'Write in markdown. The preview below updates as you type.'
        }
        actions={article ? <Badge variant={article.status === 'published' ? 'green' : 'neutral'}>{article.status === 'published' ? 'Published' : 'Draft'}</Badge> : undefined}
      />

      {error && <div style={{ marginBottom: 14 }}><Alert type="error">{error}</Alert></div>}

      <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
        <div>
          <Label htmlFor="cg-title">Title</Label>
          <Input
            id="cg-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="How to get a Blue Card in Germany"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <Label htmlFor="cg-slug">Slug</Label>
            <Input
              id="cg-slug"
              value={slug}
              onChange={e => { setSlugTouched(true); setSlug(e.target.value); }}
              placeholder="how-to-get-a-blue-card"
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              /career-guide/{category}/{slug || '…'}
            </p>
          </div>

          <div>
            <Label htmlFor="cg-category">Category</Label>
            <Select id="cg-category" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="cg-description">Meta description</Label>
          <Textarea
            id="cg-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="One sentence shown in Google results."
          />
          <p style={{ fontSize: '0.72rem', marginTop: 4, color: descriptionOver ? 'var(--error)' : 'var(--text-muted)' }}>
            {description.length}/{DESCRIPTION_MAX}{descriptionOver ? ' — will be truncated on save' : ''}
          </p>
        </div>

        <div>
          <Label htmlFor="cg-tags">Tags</Label>
          <Input
            id="cg-tags"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="visa, blue card, relocation"
          />
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Comma separated.</p>
        </div>

        <div>
          <Label htmlFor="cg-content">Content (markdown)</Label>
          <Textarea
            id="cg-content"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={18}
            placeholder={'## Heading\n\nWrite your guide here.\n\n- Point one\n- Point two\n\n[Link](https://example.com)'}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.84rem', lineHeight: 1.6 }}
          />
        </div>

        <div>
          <Label>Preview</Label>
          <div
            className="job-description-html"
            style={PREVIEW_STYLE}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={() => save('published')} disabled={saving}>
          {saving ? 'Saving…' : 'Publish'}
        </Button>
        <Button variant="ghost" onClick={() => save('draft')} disabled={saving}>
          {saving ? 'Saving…' : 'Save as Draft'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Container>
  );
}