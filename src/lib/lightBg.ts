/**
 * lightBg — paper textures for the light themes.
 *
 * Stores a (pattern × opacity) tuple in localStorage and applies it via
 * two CSS custom properties on `:root`:
 *   --light-bg-image  — the texture (or 'none' for plain)
 *   --light-bg-size   — tile size
 * The body rule in `index.css` consumes them only inside
 * `[data-theme^="light"]`. The paper colour is driven by the theme
 * variant (`light-white` / `light-warm-gray` / `light-cream`).
 */

export type LightBgPattern = 'plain' | 'grid' | 'dots';

const KEY_PATTERN = 'lightBg.pattern';
const KEY_OPACITY = 'lightBg.opacity';

export const LIGHT_BG_PATTERNS: { id: LightBgPattern; label: string }[] = [
  { id: 'plain', label: 'Без' },
  { id: 'grid',  label: 'Клетка' },
  { id: 'dots',  label: 'Точки' },
];

// Discrete opacity steps 1..5 → array index 0..4
const GRID_ALPHA = [0.015, 0.03, 0.05, 0.07, 0.10];
// Doubled the dot strength per user feedback — 0.10 at level 3 felt too
// faint, especially on warm-gray paper. Same curve, ×2 alpha.
const DOTS_ALPHA = [0.08,  0.14, 0.20, 0.28, 0.36];

// Defaults match the user's reference: dots pattern at 4/5 brightness on
// a Белый paper (light-white). Stays subtle but gives the page a clear
// "paper texture" feel out of the box.
export const DEFAULT_PATTERN: LightBgPattern = 'dots';
export const DEFAULT_OPACITY = 4;

export function getLightBgPattern(): LightBgPattern {
  const v = localStorage.getItem(KEY_PATTERN);
  if (v === 'grid' || v === 'dots' || v === 'plain') return v;
  return DEFAULT_PATTERN;
}
export function getLightBgOpacity(): number {
  const n = parseInt(localStorage.getItem(KEY_OPACITY) ?? String(DEFAULT_OPACITY), 10);
  return isNaN(n) ? DEFAULT_OPACITY : Math.max(1, Math.min(5, n));
}

/** Rewrite the pattern CSS variables on `:root`. Idempotent. */
export function applyLightBg(
  pattern: LightBgPattern = getLightBgPattern(),
  opacity: number        = getLightBgOpacity(),
): void {
  const root = document.documentElement;
  const idx = Math.max(0, Math.min(4, opacity - 1));

  if (pattern === 'plain') {
    root.style.setProperty('--light-bg-image', 'none');
    root.style.setProperty('--light-bg-size',  'auto');
    return;
  }
  if (pattern === 'grid') {
    const a = GRID_ALPHA[idx];
    root.style.setProperty('--light-bg-image',
      `linear-gradient(rgba(0,0,0,${a}) 1px, transparent 1px), ` +
      `linear-gradient(90deg, rgba(0,0,0,${a}) 1px, transparent 1px)`);
    root.style.setProperty('--light-bg-size', '40px 40px');
    return;
  }
  // dots
  const a = DOTS_ALPHA[idx];
  root.style.setProperty('--light-bg-image',
    `radial-gradient(rgba(0,0,0,${a}) 1px, transparent 1px)`);
  root.style.setProperty('--light-bg-size', '20px 20px');
}

export function setLightBgPattern(p: LightBgPattern): void {
  localStorage.setItem(KEY_PATTERN, p);
  applyLightBg(p);
}
export function setLightBgOpacity(n: number): void {
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  localStorage.setItem(KEY_OPACITY, String(clamped));
  applyLightBg(undefined, clamped);
}
