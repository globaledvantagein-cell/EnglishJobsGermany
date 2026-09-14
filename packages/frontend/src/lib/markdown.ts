// Server-side markdown → sanitized HTML, matching the backend's allowlist
// (job-Data/src/seo — marked + sanitize-html).

import { Marked, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'ul', 'ol', 'li', 'br', 'hr',
    'strong', 'em', 'b', 'i', 'del',
    'blockquote', 'a', 'img', 'code', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading'],
    // Heading anchors power the table of contents + deep links.
    h2: ['id'], h3: ['id'], h4: ['id'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
  },
};

export function renderMarkdown(md: string): string {
  const rawHtml = new Marked().parse(md || '', { async: false }) as string;
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

export interface ArticleHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface RenderedArticle {
  html: string;
  headings: ArticleHeading[];
  /** Estimated reading time in minutes (>= 1), at 200 words/min. */
  readingMinutes: number;
}

/**
 * Gives every <img> in rendered HTML a non-empty alt. Article markdown is
 * hand-written and routinely ships images with no alt at all, which crawlers
 * and screen readers both flag; the image's `title`, else the article topic,
 * is a far better description than nothing.
 */
function fillMissingAlt(html: string, topic: string): string {
  return html.replace(/<img[^>]*>/g, (tag) => {
    const alt = /\salt\s*=\s*"([^"]*)"/.exec(tag);
    if (alt && alt[1].trim()) return tag;
    const title = /\stitle\s*=\s*"([^"]*)"/.exec(tag);
    const text = (title?.[1].trim() || `${topic} illustration`)
      .replace(/"/g, '&quot;');
    const stripped = alt ? tag.replace(/\salt\s*=\s*"[^"]*"/, '') : tag;
    return stripped.replace(/^<img/, `<img alt="${text}"`);
  });
}

/** Estimated reading time in minutes (>= 1) for raw markdown, at 200 wpm. */
export function estimateReadingMinutes(md: string): number {
  const words = ((md || '').replace(/[#>*_`~\-\[\]()!]/g, ' ').match(/\S+/g) || []).length;
  return Math.max(1, Math.round(words / 200));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'section';
}

/**
 * Renders article markdown to sanitized HTML, assigns stable ids to h2/h3
 * headings, and returns the heading outline + reading time. The ids let the
 * table-of-contents deep-link and scroll-spy into the rendered article.
 *
 * An `# H1` in the body is demoted to h2: the page already renders the article
 * title as its single <h1>, and a second one splits the page's topic signal.
 * `title` is used as the fallback alt text for images that ship without one.
 */
export function renderArticle(md: string, title = 'Working in Germany'): RenderedArticle {
  const source = md || '';
  const headings: ArticleHeading[] = [];
  const usedIds = new Map<string, number>();

  const marked = new Marked();
  marked.use({
    renderer: {
      heading(token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const plain = inner.replace(/<[^>]+>/g, '').trim();
        // Body H1 → H2 (the article title owns the page's only <h1>).
        const depth = token.depth === 1 ? 2 : token.depth;

        if (depth !== 2 && depth !== 3) {
          return `<h${depth}>${inner}</h${depth}>\n`;
        }

        let id = slugify(plain);
        const seen = usedIds.get(id) ?? 0;
        usedIds.set(id, seen + 1);
        if (seen > 0) id = `${id}-${seen}`;

        headings.push({ id, text: plain, level: depth });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
    },
  });

  const rawHtml = marked.parse(source, { async: false }) as string;
  const html = fillMissingAlt(sanitizeHtml(rawHtml, SANITIZE_OPTIONS), title);

  return { html, headings, readingMinutes: estimateReadingMinutes(source) };
}
