// Career-guide categories (distinct from job categories). Mirrors
// job-Data/src/db/careerGuide.js CAREER_GUIDE_CATEGORY_LABELS.

export const CAREER_GUIDE_CATEGORY_LABELS: Record<string, string> = {
  'finding-jobs': 'Finding Jobs',
  companies: 'Companies',
  'visas-immigration': 'Visas & Immigration',
  'salaries-careers': 'Salaries & Careers',
  'students-graduates': 'Students & Graduates',
  'living-in-germany': 'Living in Germany',
};

export const CAREER_GUIDE_CATEGORIES = Object.keys(CAREER_GUIDE_CATEGORY_LABELS);

export function careerCategoryLabel(slug: string): string {
  return CAREER_GUIDE_CATEGORY_LABELS[slug] || slug;
}
