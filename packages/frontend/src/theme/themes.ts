// ─── CSS Variable Definitions for Light + Dark Themes ────────────────────────
// Applied to :root via ThemeProvider. Uses Paper + Ink palette.

export const lightVars: Record<string, string> = {
  // Paper surfaces
  '--paper': '#FAF7F1',
    // ── Semantic aliases (used by components via var(--bg-*), var(--text-*), var(--acid)) ──
    '--bg-base':        '#FAF7F1',
    '--bg-surface':     '#FFFFFF',
    '--bg-surface-2':   '#F4EFE5',
    '--text-primary':   '#141414',
    '--text-secondary': '#525252',
    // Accent aligned to the brand blue (--primary) — the old green read as a
    // different site next to the blue landing page.
    '--acid':           '#1F6FEB',
    '--acid-soft':      'rgba(31,111,235,0.12)',
    '--acid-dim':       'rgba(31,111,235,0.07)',
    '--acid-mid':       'rgba(31,111,235,0.22)',
    '--danger-dim':     'rgba(220,38,38,0.08)',
  '--paper2': '#F4EFE5',
  '--ink': '#141414',
  '--ink2': '#2B2B2B',
  '--muted-ink': '#525252',
  '--subtle-ink': '#6F6F6F',

  // Borders
  '--border': 'rgba(20,20,20,0.16)',
  '--border-strong': 'rgba(20,20,20,0.26)',

  // Surfaces
  '--surface': 'rgba(255,255,255,0.72)',
  '--surface-solid': '#FFFFFF',
  '--surface-alt': 'rgba(250,247,241,0.75)',

  // Brand
  '--primary': '#1F6FEB',
  '--primary-hover': '#1B5FD0',
  '--primary-soft': 'rgba(31,111,235,0.12)',

  // Semantic
  '--success': '#1F9D55',
  '--success-soft': 'rgba(31,157,85,0.10)',
  '--warning': '#D97706',
  '--warning-soft': 'rgba(217,119,6,0.10)',
  '--danger': '#DC2626',
  '--danger-soft': 'rgba(220,38,38,0.10)',
  '--info': '#1F6FEB',
  '--info-soft': 'rgba(31,111,235,0.10)',

  // Focus
  '--focus-ring': '0 0 0 3px rgba(31,111,235,0.30)',
  '--link': '#1F6FEB',

  // Shadows (stacked-paper feel: soft shadow + highlight edge)
  '--shadow-sm': '0 1px 0 rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.06)',
  '--shadow-md': '0 1px 0 rgba(0,0,0,0.08), 0 10px 24px rgba(0,0,0,0.08)',
  '--shadow-lg': '0 1px 0 rgba(0,0,0,0.10), 0 18px 40px rgba(0,0,0,0.10)',
  '--highlight-edge': 'inset 0 1px 0 rgba(255,255,255,0.70)',

  // Sketch effects
  '--sketch-outline-opacity': '0.22',
  '--paper-grain-opacity': '0.11',
  '--paper-fiber-opacity': '0.06',
  '--paper-contrast': '1.0',
  '--paper-noise-scale': '200',
  '--paper-drift-distance': '12px',
  '--paper-drift-duration': '14s',

  // Ink borders
  '--ink-border': 'rgba(20,20,20,0.22)',
  '--ink-border-strong': 'rgba(20,20,20,0.38)',
  '--sketch-wobble': '0.6px',
  '--sketch-rotate': '-0.15deg',

  // Marker highlight
  '--marker-color': 'rgba(31,111,235,0.12)',
  '--marker-blend': 'multiply',
  '--marker-opacity': '0.55',
};

export const darkVars: Record<string, string> = {
  '--paper': '#0E0F12',
    // ── Semantic aliases ──────────────────────────────────────────────────────────
    '--bg-base':        '#0E0F12',
    '--bg-surface':     '#12141A',
    '--bg-surface-2':   'rgba(18,20,26,0.92)',
    '--text-primary':   '#F5F5F5',
    '--text-secondary': '#BDBDBD',
    // Accent aligned to the brand blue (--primary), matching the light theme.
    '--acid':           '#6EA8FF',
    '--acid-soft':      'rgba(110,168,255,0.14)',
    '--acid-dim':       'rgba(110,168,255,0.06)',
    '--acid-mid':       'rgba(110,168,255,0.22)',
    '--danger-dim':     'rgba(248,113,113,0.08)',
  '--paper2': '#12141A',
  '--ink': '#F5F5F5',
  '--ink2': '#E9E9E9',
  '--muted-ink': '#BDBDBD',
  '--subtle-ink': '#9B9B9B',

  '--border': 'rgba(245,245,245,0.20)',
  '--border-strong': 'rgba(245,245,245,0.22)',

  '--surface': 'rgba(18,20,26,0.72)',
  '--surface-solid': '#12141A',
  '--surface-alt': 'rgba(14,15,18,0.75)',

  '--primary': '#6EA8FF',
  '--primary-hover': '#8AB8FF',
  '--primary-soft': 'rgba(110,168,255,0.14)',

  '--success': '#34D399',
  '--success-soft': 'rgba(52,211,153,0.10)',
  '--warning': '#FBBF24',
  '--warning-soft': 'rgba(251,191,36,0.10)',
  '--danger': '#F87171',
  '--danger-soft': 'rgba(248,113,113,0.10)',
  '--info': '#6EA8FF',
  '--info-soft': 'rgba(110,168,255,0.14)',

  '--focus-ring': '0 0 0 3px rgba(110,168,255,0.30)',
  '--link': '#8AB8FF',

  '--shadow-sm': '0 1px 0 rgba(0,0,0,0.20), 0 6px 16px rgba(0,0,0,0.25)',
  '--shadow-md': '0 1px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.30)',
  '--shadow-lg': '0 1px 0 rgba(0,0,0,0.30), 0 18px 40px rgba(0,0,0,0.40)',
  '--highlight-edge': 'inset 0 1px 0 rgba(255,255,255,0.06)',

  '--sketch-outline-opacity': '0.18',
  '--paper-grain-opacity': '0.16',
  '--paper-fiber-opacity': '0.08',
  '--paper-contrast': '1.15',
  '--paper-noise-scale': '180',
  '--paper-drift-distance': '10px',
  '--paper-drift-duration': '16s',

  '--ink-border': 'rgba(245,245,245,0.16)',
  '--ink-border-strong': 'rgba(245,245,245,0.28)',
  '--sketch-wobble': '0.5px',
  '--sketch-rotate': '0.12deg',

  // Marker highlight
  '--marker-color': 'rgba(110,168,255,0.14)',
  '--marker-blend': 'soft-light',
  '--marker-opacity': '0.50',
};
