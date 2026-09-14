// ─── Brand Constants ─────────────────────────────────────────────────────────
// Change these to rebrand the entire app instantly

export const BRAND = {
  appName: 'English Jobs in Germany',
  shortName: 'English Jobs',
  tagline: 'No German Required',
  fullName: 'English Jobs in Germany',
  description: 'Curated English-speaking jobs at top German companies. No German required.',
  twitter: '',
  contact: '/legal',
} as const;

// Sketch-accent font for tiny labels & badges
export const SKETCH_FONT = "'Caveat', 'Patrick Hand', 'Comic Neue', ui-sans-serif";

// Semantic colour roles — used only for inline JS references,
// all runtime styling goes through CSS variables set by ThemeProvider.
export const PALETTE = {
  primary: '#1F6FEB',
  primarySoft: 'rgba(31,111,235,0.12)',
  success: '#1F9D55',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#1F6FEB',
} as const;
