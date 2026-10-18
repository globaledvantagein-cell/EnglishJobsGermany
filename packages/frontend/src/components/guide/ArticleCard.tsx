// One card for every career-guide listing (hub, topic pages, "more from"
// on articles). Server-safe: a plain crawlable <a>, no client JS.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { careerCategoryLabel } from '@/data/careerGuide';
import { guideTopicMeta } from './guideMeta';
import './guide.css';

export interface GuideArticleSummary {
  slug: string;
  category: string;
  title: string;
  description?: string;
  publishedAt?: string | null;
  readingMinutes: number;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ArticleCard({ article, featured = false }: { article: GuideArticleSummary; featured?: boolean }) {
  const { Icon, tint } = guideTopicMeta(article.category);
  const href = `/career-guide/${article.category}/${article.slug}`;
  return (
    <Link href={href} className="gd-card" data-featured={featured || undefined} style={{ '--gd-tint': tint } as React.CSSProperties}>
      <span className="gd-card-visual" aria-hidden="true">
        <Icon size={featured ? 44 : 26} strokeWidth={1.6} />
      </span>
      <span className="gd-card-body">
        <span className="gd-card-topic">{featured ? 'Latest · ' : ''}{careerCategoryLabel(article.category)}</span>
        <span className="gd-card-title">{article.title}</span>
        {article.description && <span className="gd-card-desc">{article.description}</span>}
        <span className="gd-card-meta">
          <span>
            {article.publishedAt && <>{formatDate(article.publishedAt)} · </>}
            {article.readingMinutes} min read
          </span>
          <span className="gd-card-cta">Read <ArrowRight size={15} /></span>
        </span>
      </span>
    </Link>
  );
}
