// ─── Design Tokens ───────────────────────────────────────────────────────────
// Single source of truth for spacing, radii, shadows, type scale, z-index, stroke, motion

export const RADIUS = {
  xs: '6px',
  sm: '10px',
  md: '14px',
  lg: '18px',
  xl: '22px',
  '2xl': '28px',
  pill: '999px',
} as const;

export const SHADOW = {
  none: 'none',
  sm: '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.06)',
  md: '0 1px 0 rgba(0,0,0,0.08), 0 10px 24px rgba(0,0,0,0.08)',
  lg: '0 1px 0 rgba(0,0,0,0.10), 0 18px 40px rgba(0,0,0,0.10)',
} as const;

export const SPACING = {
  px: '1px',
  0: '0',
  1: '4px', 2: '8px', 3: '12px', 4: '16px',
  5: '20px', 6: '24px', 7: '28px', 8: '32px',
  10: '40px', 12: '48px', 14: '56px', 16: '64px',
  20: '80px', 24: '96px', 28: '112px', 32: '128px',
} as const;

export const TYPE = {
  // families
  ui: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
  sketch: "'Caveat', 'Patrick Hand', 'Comic Neue', ui-sans-serif",
  // sizes
  xs: '0.75rem',   // 12px
  sm: '0.875rem',  // 14px
  base: '1rem',      // 16px
  lg: '1.125rem',  // 18px
  xl: '1.25rem',   // 20px
  '2xl': '1.5rem',    // 24px
  '3xl': '1.875rem',  // 30px
  '4xl': '2.25rem',   // 36px
  '5xl': '2.75rem',   // 44px
  // weights
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  // line-height
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.65,
  // letter-spacing
  lsTight: '-0.02em',
  lsNormal: '0',
  lsWide: '0.02em',
} as const;

export const STROKE = {
  inkThickness: '1.25px',
  inkWobble: 0.6,
  borderStyle: 'solid',
} as const;

export const MOTION = {
  fast: '140ms',
  normal: '220ms',
  slow: '320ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

export const Z = {
  base: 0,
  card: 10,
  sticky: 40,
  nav: 50,
  overlay: 60,
  modal: 70,
  toast: 80,
} as const;
