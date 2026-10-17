// Shared by the career guide list and editor pages.

// Mirrors CAREER_GUIDE_CATEGORY_LABELS in backend src/db/careerGuide.js.
export const CAREER_GUIDE_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['finding-jobs', 'Finding Jobs'],
  ['companies', 'Companies'],
  ['visas-immigration', 'Visas & Immigration'],
  ['salaries-careers', 'Salaries & Careers'],
  ['students-graduates', 'Students & Graduates'],
  ['living-in-germany', 'Living in Germany'],
];

export const CAREER_GUIDE_CATEGORY_LABELS = Object.fromEntries(CAREER_GUIDE_CATEGORIES) as Record<string, string>;

/** Meta descriptions longer than this are truncated by the backend on save. */
export const META_DESCRIPTION_MAX = 160;

export interface Article {
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
  createdAt?: string;
  updatedAt: string;
}

/** Mirrors slugify() in backend src/db/careerGuide.js. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Rough reading time, as shown on the public article page. */
export function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
