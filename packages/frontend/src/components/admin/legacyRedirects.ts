// Old admin URLs → their /admin/* replacements. Kept dependency-free because
// next.config.ts imports it at build time.
export const LEGACY_ADMIN_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard', '/admin'],
  ['/review', '/admin/review'],
  ['/rejected', '/admin/trash'],
  ['/test-logs', '/admin/ai-verdicts'],
  ['/add', '/admin/jobs/new'],
  ['/feedback', '/admin/feedback'],
  ['/analytics', '/admin/premium'],
  ['/health', '/admin/health'],
];
