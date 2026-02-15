/**
 * Theme definitions for Supercharged PWA.
 * Each theme defines accent colors, backgrounds, and text colors.
 */

export const THEMES = {
  fidelity: {
    id: 'fidelity',
    name: 'Fidelity Green',
    preview: '#00843D',
    colors: {
      accent: '#00843D',
      accentRgb: '0, 132, 61',
      bgPrimary: '#0f0f0f',
      bgSecondary: '#1a1a1a',
      bgTertiary: '#262626',
      textPrimary: '#ffffff',
      textSecondary: '#a3a3a3',
      glucose: '#3b82f6',
      danger: '#ef4444',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Blue',
    preview: '#3b82f6',
    colors: {
      accent: '#3b82f6',
      accentRgb: '59, 130, 246',
      bgPrimary: '#0a0e1a',
      bgSecondary: '#111827',
      bgTertiary: '#1e2740',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      glucose: '#38bdf8',
      danger: '#f87171',
    },
  },
  ember: {
    id: 'ember',
    name: 'Ember Orange',
    preview: '#f97316',
    colors: {
      accent: '#f97316',
      accentRgb: '249, 115, 22',
      bgPrimary: '#120d08',
      bgSecondary: '#1c1510',
      bgTertiary: '#2a2018',
      textPrimary: '#fef3c7',
      textSecondary: '#d4a574',
      glucose: '#60a5fa',
      danger: '#ef4444',
    },
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Red',
    preview: '#dc2626',
    colors: {
      accent: '#dc2626',
      accentRgb: '220, 38, 38',
      bgPrimary: '#0f0808',
      bgSecondary: '#1a1010',
      bgTertiary: '#2a1a1a',
      textPrimary: '#fef2f2',
      textSecondary: '#b09090',
      glucose: '#60a5fa',
      danger: '#fbbf24',
    },
  },
  violet: {
    id: 'violet',
    name: 'Electric Purple',
    preview: '#8b5cf6',
    colors: {
      accent: '#8b5cf6',
      accentRgb: '139, 92, 246',
      bgPrimary: '#0c0a14',
      bgSecondary: '#15112a',
      bgTertiary: '#1f1a3a',
      textPrimary: '#f5f3ff',
      textSecondary: '#a09abc',
      glucose: '#38bdf8',
      danger: '#f87171',
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Teal',
    preview: '#14b8a6',
    colors: {
      accent: '#14b8a6',
      accentRgb: '20, 184, 166',
      bgPrimary: '#0a1210',
      bgSecondary: '#0f1f1c',
      bgTertiary: '#1a2e2a',
      textPrimary: '#f0fdfa',
      textSecondary: '#86b5ad',
      glucose: '#60a5fa',
      danger: '#f87171',
    },
  },
  light: {
    id: 'light',
    name: 'Light',
    preview: '#ffffff',
    light: true,
    colors: {
      accent: '#0d7c3d',
      accentRgb: '13, 124, 61',
      bgPrimary: '#f5f5f5',
      bgSecondary: '#ffffff',
      bgTertiary: '#e5e5e5',
      textPrimary: '#171717',
      textSecondary: '#6b7280',
      glucose: '#2563eb',
      danger: '#dc2626',
    },
  },
  nightlight: {
    id: 'nightlight',
    name: 'Night Light',
    preview: '#3d2b1a',
    light: false,
    colors: {
      accent: '#d4915c',
      accentRgb: '212, 145, 92',
      bgPrimary: '#1a1008',
      bgSecondary: '#241a0e',
      bgTertiary: '#332616',
      textPrimary: '#f5e6d3',
      textSecondary: '#b89a7a',
      glucose: '#d4915c',
      danger: '#e57373',
    },
  },
};

export const DEFAULT_THEME = 'fidelity';

/**
 * Apply a theme to the document by setting CSS custom properties.
 */
export function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  const c = theme.colors;

  root.style.setProperty('--color-bg-primary', c.bgPrimary);
  root.style.setProperty('--color-bg-secondary', c.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', c.bgTertiary);
  root.style.setProperty('--color-text-primary', c.textPrimary);
  root.style.setProperty('--color-text-secondary', c.textSecondary);
  root.style.setProperty('--color-glucose', c.glucose);
  root.style.setProperty('--color-insulin', c.accent);
  root.style.setProperty('--color-target', c.accent);
  root.style.setProperty('--color-accent', c.accent);
  root.style.setProperty('--color-danger', c.danger);

  // Also update body background for theme consistency
  document.body.style.backgroundColor = c.bgPrimary;
  document.body.style.color = c.textPrimary;

  // Update meta theme-color for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', c.bgPrimary);
}

/**
 * Get the active theme's colors object (for canvas/Chart.js usage).
 */
export function getThemeColors(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  return theme.colors;
}
