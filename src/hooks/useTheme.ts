import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'cosmic';
export type LightVariant = 'white' | 'warm-gray' | 'cream' | 'ivory';
export type DarkVariant  = 'pure' | 'slate' | 'soft' | 'graphite' | 'emerald' | 'reverie' | 'velvet';
export type CosmicVariant = 'night';

export type Theme =
  | 'light-white' | 'light-warm-gray' | 'light-cream' | 'light-ivory'
  | 'dark-pure'   | 'dark-slate'      | 'dark-soft'   | 'dark-graphite'
  | 'dark-emerald' | 'dark-reverie' | 'dark-velvet'
  | 'cosmic-night';

export const ALL_THEMES: Theme[] = [
  'light-white', 'light-warm-gray', 'light-cream', 'light-ivory',
  'dark-pure',   'dark-slate',      'dark-soft',   'dark-graphite',
  'dark-emerald', 'dark-reverie', 'dark-velvet',
  'cosmic-night',
];

// Defaults for each mode. 'soft' (neutral grey) is the gentlest dark
// variant — easier on the eye than pitch-black or warm-tinted —
// so it's the dark default. 'white' is the cleanest light. 'cosmic-night'
// is the only cosmic variant.
export const DEFAULT_LIGHT:  Theme = 'light-white';
export const DEFAULT_DARK:   Theme = 'dark-soft';
export const DEFAULT_COSMIC: Theme = 'cosmic-night';

// First-run default — opens to cosmic so new visitors see the signature
// star backdrop right away. Returning users land on whatever they
// last picked (read from localStorage in `readStoredTheme`).
export const FIRST_RUN_DEFAULT: Theme = DEFAULT_COSMIC;

const STORAGE_KEY = 'theme';

// Legacy IDs that have been renamed/replaced. We map them to the new
// equivalents at boot so saved prefs survive.
//   light-pure   → light-white
//   light-paper  → light-warm-gray
//   light-sepia  → light-cream
//   dark-warm    → dark-slate (replacement variant — see index.css)
const LEGACY_THEME_MAP: Record<string, Theme> = {
  'light-pure':  'light-white',
  'light-paper': 'light-warm-gray',
  'light-sepia': 'light-cream',
  'dark-warm':   'dark-slate',
};

export function themeMode(t: Theme): ThemeMode {
  if (t.startsWith('cosmic')) return 'cosmic';
  if (t.startsWith('light'))  return 'light';
  return 'dark';
}

export function themeVariant(t: Theme): LightVariant | DarkVariant | CosmicVariant {
  // Variant is everything after the mode prefix (handles multi-segment
  // names like 'warm-gray').
  const dash = t.indexOf('-');
  return t.slice(dash + 1) as LightVariant | DarkVariant | CosmicVariant;
}

/**
 * Mirrors the 'aurora-ice' preset (themePresets.ts) into localStorage on
 * first run, so a brand-new visitor opens straight into «Аврора»:
 * cosmic-night base + warp stars + a translucent ice-blue aurora wash.
 * Uses string literals to avoid circular imports with
 * themePresets.ts / cosmic.ts (which both import from places that would
 * loop back here).  Keep these keys in sync with the aurora-ice `apply`.
 */
function applyFirstRunAurora() {
  localStorage.setItem('theme.preset',             'aurora-ice');
  localStorage.setItem('cosmic.stars.enabled',     '1');
  localStorage.setItem('cosmic.stars.mode',        'warp');
  localStorage.setItem('cosmic.stars.speed',       '1.5');
  localStorage.setItem('cosmic.aurora.enabled',    '1');
  localStorage.setItem('cosmic.aurora.palette',    'ice');
  localStorage.setItem('cosmic.aurora.direction',  'top');
  localStorage.setItem('cosmic.aurora.brightness', '0.30');
  localStorage.setItem('wallpaper',                'none');
}

function readStoredTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v && (ALL_THEMES as string[]).includes(v)) return v as Theme;

  // Legacy migrations
  if (v && LEGACY_THEME_MAP[v]) return LEGACY_THEME_MAP[v];
  if (v === 'dark') return DEFAULT_DARK;
  if (v === 'light' || v === 'parchment' || v === 'sepia') return DEFAULT_LIGHT;

  // First run — open to the Aurora preset ("Аврора").
  applyFirstRunAurora();
  return 'cosmic-night';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  return { theme, setTheme };
}
