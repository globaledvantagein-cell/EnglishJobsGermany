// Topic tiles linking to each career-guide topic page (Relocate.me-style
// topic grid, studied with REA). Only topics with published guides are shown,
// so no tile leads to an empty page.
import Link from 'next/link';
import { careerCategoryLabel } from '@/data/careerGuide';
import { guideTopicMeta } from './guideMeta';
import './guide.css';

export default function GuideTopics({ counts, current }: { counts: Map<string, number>; current?: string }) {
  const topics = [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (topics.length === 0) return null;
  return (
    <nav aria-label="Guide topics" className="gd-topics">
      {topics.map(([slug, n]) => {
        const { Icon, tint, blurb } = guideTopicMeta(slug);
        return (
          <Link key={slug} href={`/career-guide/${slug}`} className="gd-topic" aria-current={slug === current ? 'page' : undefined}
            style={{ '--gd-tint': tint } as React.CSSProperties}>
            <span className="gd-topic-icon" aria-hidden="true"><Icon size={20} /></span>
            <span className="gd-topic-body">
              <span className="gd-topic-name">{careerCategoryLabel(slug)}</span>
              <span className="gd-topic-blurb">{blurb}</span>
            </span>
            <span className="gd-topic-count">{n}</span>
          </Link>
        );
      })}
    </nav>
  );
}
