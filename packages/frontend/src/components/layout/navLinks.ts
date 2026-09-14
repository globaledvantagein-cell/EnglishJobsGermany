// Kept short on purpose — the full tool list lives as quick links on the
// Dashboard (see ADMIN_QUICK_LINKS). Nav shows only the daily-driver pages.
export const ADMIN_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard', 'Dashboard'],
  ['/review',    'Review'],
  ['/analytics', 'Analytics'],
  ['/feedback',  'Feedback'],
  ['/health',    'Health'],
];

// Everything else, surfaced as a quick-links grid on /dashboard.
export const ADMIN_QUICK_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/test-logs',          'Test Logs'],
  ['/admin/companies',    'Directory'],
  ['/admin/career-guide', 'Career Guide'],
  ['/add',                'Add Job'],
  ['/rejected',           'Trash'],
  ['/smart-match',        'Smart Match'],
  ['/today-matches',      "Today's Matches"],
];

// Smart Match is admin-only while in testing — it lives in ADMIN_LINKS only,
// and its route in App.tsx is behind the admin ProtectedRoute.
export const PUBLIC_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/jobs',          'Browse Jobs'],
  ['/remote-jobs',   'Remote Jobs'],
  ['/directory',     'Companies'],
  ['/career-guide',  'Career Guide'],
  ['/today-matches', "Today's Matches"],
  ['/smart-match',   'Smart Match'],
];

// Premium-only destinations. The nav keeps them visible (awareness, not
// blocking) but marks them with a crown for non-premium users.
export const PREMIUM_NAV_PATHS: ReadonlySet<string> = new Set([
  '/today-matches',
  '/smart-match',
]);

// Links shown only inside the signed-in user menu (not the main nav).
export const USER_MENU_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/profile', 'Profile'],
  ['/applied', 'Applied'],
];

// Note: /career-guide, /city/* and /category/* used to be Express-rendered
// pages reached via a full-page <a>. They are Next.js App Router pages now, so
// every nav target uses <Link> for instant client navigation — no isSsrPath.
