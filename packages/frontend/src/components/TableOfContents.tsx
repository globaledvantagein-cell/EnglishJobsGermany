'use client';

import { useEffect, useState } from 'react';
import type { ArticleHeading } from '@/lib/markdown';

/**
 * Auto-generated table of contents for an article.
 *  - Desktop: a sticky rail (positioned by the parent grid).
 *  - Mobile: a collapsible panel that sits above the article.
 * Highlights the heading currently in view via IntersectionObserver, and
 * smooth-scrolls (respecting reduced-motion) on click.
 */
export default function TableOfContents({ headings }: { headings: ArticleHeading[] }) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (headings.length === 0) return;
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Pick the first heading (in document order) that is currently visible.
        const firstVisible = headings.find((h) => visible.has(h.id));
        if (firstVisible) setActiveId(firstVisible.id);
      },
      // Trip the highlight when a heading reaches the upper third of the viewport.
      { rootMargin: '-80px 0px -66% 0px', threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', `#${id}`);
    setActiveId(id);
    setOpen(false);
  };

  return (
    <nav className="toc" aria-label="On this page">
      <button
        type="button"
        className="toc__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>On this page</span>
        <span className={`toc__chevron${open ? ' toc__chevron--open' : ''}`} aria-hidden="true">›</span>
      </button>

      <p className="toc__label">On this page</p>

      <ul className={`toc__list${open ? ' toc__list--open' : ''}`}>
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? 'toc__item toc__item--sub' : 'toc__item'}>
            <a
              href={`#${h.id}`}
              onClick={(e) => handleClick(e, h.id)}
              className={activeId === h.id ? 'toc__link toc__link--active' : 'toc__link'}
              aria-current={activeId === h.id ? 'location' : undefined}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
