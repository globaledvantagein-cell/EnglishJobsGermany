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

// Admins browsing the public site see the normal nav plus a way back into the
// admin panel, which has its own sidebar listing every admin tool.
export const ADMIN_LINKS: ReadonlyArray<readonly [string, string]> = [
  ...PUBLIC_LINKS,
  ['/admin', 'Admin'],
];
