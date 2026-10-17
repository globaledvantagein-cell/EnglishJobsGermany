import AdminArticleEditor from '@/page-components/admin/AdminArticleEditor';

// [id] is an article _id, or "new" for a fresh draft.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminArticleEditor articleId={id === 'new' ? null : id} />;
}
