/**
 * cosmic — atmosphere config for the cosmic theme (third top-level mode
 * alongside light and dark).
 *
 * Two layers compose into the cosmic backdrop:
 *   - Stars (CosmicWarp = 3D-flight canvas, OR StarsTwinkle = static
 *     twinkling field). User picks one mode.
 *   - Aurora (single DOM-element with a slow horizontal drift over a
 *     painted palette). Optional glow pass on top of stars.
 *
 * AURORA_PALETTES is ported verbatim from Bismillah's `lib/unlocks.ts`
 * including the rationale for pre-baked rgba strings (iOS Safari < 16.4
 * doesn't understand color-mix() and silently drops the gradient stop).
 *
 * localStorage namespace is `cosmic.*` — matches the rest of QuranIng's
 * pref keys. (Bismillah used `asr.*`.)
 */

// ─── Stars ─────────────────────────────────────────────────────────────────

export type StarsMode = 'warp' | 'twinkle';
export type StarsTwinkleDensity = 'low' | 'medium' | 'high' | 'ultra';

export const STARS_MODE_LABELS: Record<StarsMode, string> = {
  warp:    'Полёт',
  twinkle: 'Мерцание',
};

export const STARS_TWINKLE_COUNTS: Record<StarsTwinkleDensity, number> = {
  low: 20, medium: 38, high: 240, ultra: 380,
};

export const STARS_TWINKLE_DENSITY_LABELS: Record<StarsTwinkleDensity, string> = {
  low:    'Редко',
  medium: 'Средне',
  high:   'Часто',
  ultra:  'Густо',
};

const KEY_STARS_ON       = 'cosmic.stars.enabled';
const KEY_STARS_MODE     = 'cosmic.stars.mode';
const KEY_STARS_SPEED    = 'cosmic.stars.speed';
const KEY_STARS_DENSITY  = 'cosmic.stars.twinkle.density';

export function isStarsEnabled(): boolean {
  return localStorage.getItem(KEY_STARS_ON) !== '0';
}
export function setStarsEnabled(on: boolean) {
  localStorage.setItem(KEY_STARS_ON, on ? '1' : '0');
}

export function getStarsMode(): StarsMode {
  const v = localStorage.getItem(KEY_STARS_MODE);
  // Default 'twinkle' — calmer first impression than warp; reads as a
  // night sky rather than a sci-fi sequence. User changed the reference.
  return v === 'warp' || v === 'twinkle' ? v : 'twinkle';
}
export function setStarsMode(m: StarsMode) {
  localStorage.setItem(KEY_STARS_MODE, m);
}

export function getStarsSpeed(): number {
  // Default 1.5× — gentle motion that suits the twinkle default.
  const n = parseFloat(localStorage.getItem(KEY_STARS_SPEED) ?? '1.5');
  return isFinite(n) ? Math.max(0.3, Math.min(3.0, n)) : 1.5;
}
export function setStarsSpeed(v: number) {
  localStorage.setItem(KEY_STARS_SPEED, String(Math.max(0.3, Math.min(3.0, v))));
}

export function getStarsTwinkleDensity(): StarsTwinkleDensity {
  const v = localStorage.getItem(KEY_STARS_DENSITY) as StarsTwinkleDensity | null;
  return v && v in STARS_TWINKLE_COUNTS ? v : 'medium';
}
export function setStarsTwinkleDensity(d: StarsTwinkleDensity) {
  localStorage.setItem(KEY_STARS_DENSITY, d);
}

// ─── Aurora ────────────────────────────────────────────────────────────────

export type AuroraPalette = 'ice' | 'mint' | 'violet' | 'gold' | 'rose' | 'ember';
export type AuroraDirection = 'top' | 'bottom' | 'frame';

const KEY_AURORA_ON         = 'cosmic.aurora.enabled';
const KEY_AURORA_BRIGHTNESS = 'cosmic.aurora.brightness';
const KEY_AURORA_PALETTE    = 'cosmic.aurora.palette';
const KEY_AURORA_DIRECTION  = 'cosmic.aurora.direction';

export function isAuroraEnabled(): boolean {
  return localStorage.getItem(KEY_AURORA_ON) !== '0';
}
export function setAuroraEnabled(on: boolean) {
  localStorage.setItem(KEY_AURORA_ON, on ? '1' : '0');
}

export function getAuroraBrightness(): number {
  // Default 25 % — quiet glow that doesn't compete with the verses.
  const n = parseFloat(localStorage.getItem(KEY_AURORA_BRIGHTNESS) ?? '0.25');
  return isFinite(n) ? Math.max(0.10, Math.min(1.0, n)) : 0.25;
}
export function setAuroraBrightness(v: number) {
  localStorage.setItem(KEY_AURORA_BRIGHTNESS, String(Math.max(0.10, Math.min(1.0, v))));
}

export function getAuroraPalette(): AuroraPalette {
  // Default 'mint' — green reads as the most "cosmic-natural" of the
  // palettes and the user picked it as the reference.
  const v = localStorage.getItem(KEY_AURORA_PALETTE) as AuroraPalette | null;
  return v && v in AURORA_PALETTES ? v : 'mint';
}
export function setAuroraPalette(p: AuroraPalette) {
  localStorage.setItem(KEY_AURORA_PALETTE, p);
}

export function getAuroraDirection(): AuroraDirection {
  // Default 'bottom' — softer reading frame; the warm horizon glow under
  // the verses is what the user picked in the reference.
  const v = localStorage.getItem(KEY_AURORA_DIRECTION);
  return v === 'top' || v === 'bottom' || v === 'frame' ? v : 'bottom';
}
export function setAuroraDirection(d: AuroraDirection) {
  localStorage.setItem(KEY_AURORA_DIRECTION, d);
}

// ─── Aurora palettes (verbatim from Bismillah unlocks.ts) ────────────────
//
// Pre-baked rgba strings on purpose — iOS Safari < 16.4 doesn't support
// color-mix(), so any gradient that uses it silently loses its colour stop.
// The 5-stop wordShadow imitates vertical aurora "columns" (glow above
// and below the text); ayahGlow is a soft radial halo that goes behind
// the active word as a positioned ::after layer in the future highlight
// design. Layer1/2 feed the Aurora component itself.

export const AURORA_PALETTES: Record<AuroraPalette, {
  label: string;
  layer1: string;
  layer2: string;
  ayahGlow: string;
  wordShadow: string;
}> = {
  ice: {
    label: 'Лёд',
    layer1: 'rgba(120,200,240,0.44)',
    layer2: 'rgba(180,220,240,0.36)',
    ayahGlow:
      'radial-gradient(ellipse at 50% 50%, rgba(120,200,240,0.48) 0%, ' +
      'rgba(120,200,240,0.20) 30%, rgba(120,200,240,0.06) 55%, transparent 80%)',
    wordShadow:
      '0 -16px 36px rgba(150,215,245,0.84), 0 16px 36px rgba(150,215,245,0.84), ' +
      '0 0 30px rgba(150,215,245,0.84), 0 -40px 110px rgba(100,180,225,0.76), ' +
      '0 40px 110px rgba(100,180,225,0.76)',
  },
  mint: {
    label: 'Мята',
    layer1: 'rgba(72,190,170,0.44)',
    layer2: 'rgba(100,180,200,0.36)',
    ayahGlow:
      'radial-gradient(ellipse at 50% 50%, rgba(72,190,170,0.48) 0%, ' +
      'rgba(72,190,170,0.20) 30%, rgba(72,190,170,0.06) 55%, transparent 80%)',
    wordShadow:
      '0 -16px 36px rgba(80,200,140,0.84), 0 16px 36px rgba(80,200,140,0.84), ' +
      '0 0 30px rgba(80,200,140,0.84), 0 -40px 110px rgba(50,170,110,0.76), ' +
      '0 40px 110px rgba(50,170,110,0.76)',
  },
  violet: {
    label: 'Фиолет',
    layer1: 'rgba(140,100,220,0.44)',
    layer2: 'rgba(100,130,230,0.36)',
    ayahGlow:
      'radial-gradient(ellipse at 50% 50%, rgba(140,100,220,0.48) 0%, ' +
      'rgba(140,100,220,0.20) 30%, rgba(140,100,220,0.06) 55%, transparent 80%)',
    wordShadow:
      '0 -16px 36px rgba(170,120,230,0.84), 0 16px 36px rgba(170,120,230,0.84), ' +
      '0 0 30px rgba(170,120,230,0.84), 0 -40px 110px rgba(125,85,200,0.76), ' +
      '0 40px 110px rgba(125,85,200,0.76)',
  },
  gold: {
    label: 'Золото',
    layer1: 'rgba(220,180,80,0.44)',
    layer2: 'rgba(200,150,100,0.36)',
    ayahGlow:
      'radial-gradient(ellipse at 50% 50%, rgba(220,180,80,0.56) 0%, ' +
      'rgba(220,180,80,0.24) 30%, rgba(220,180,80,0.08) 55%, transparent 80%)',
    wordShadow:
      '0 -16px 36px rgba(240,200,90,0.84), 0 16px 36px rgba(240,200,90,0.84), ' +
      '0 0 30px rgba(240,200,90,0.84), 0 -40px 110px rgba(210,160,60,0.76), ' +
      '0 40px 110px rgba(210,160,60,0.76)',
  },
  rose: {
    label: 'Роза',
    layer1: 'rgba(200,100,130,0.44)',
    layer2: 'rgba(180,120,160,0.36)',
    ayahGlow:
      'radial-gradient(ellipse at 50% 50%, rgba(200,100,130,0.48) 0%, ' +
      'rgba(200,100,130,0.20) 30%, rgba(200,100,130,0.06) 55%, transparent 80%)',
    wordShadow:
      '0 -16px 36px rgba(220,120,150,0.84), 0 16px 36px rgba(220,120,150,0.84), ' +
      '0 0 30px rgba(220,120,150,0.84), 0 -40px 110px rgba(190,90,125,0.76), ' +
      '0 40px 110px rgba(190,90,125,0.76)',
  },
  ember: {
    label: 'Уголёк',
    layer1: 'rgba(210,210,218,0.44)',
    layer2: 'rgba(160,160,170,0.36)',
    ayahGlow:
      'radial-gradient(ellipse at 50% 50%, rgba(210,210,218,0.44) 0%, ' +
      'rgba(190,190,200,0.18) 30%, rgba(180,180,190,0.06) 55%, transparent 80%)',
    wordShadow:
      '0 -16px 36px rgba(210,210,220,0.76), 0 16px 36px rgba(210,210,220,0.76), ' +
      '0 0 30px rgba(210,210,220,0.76), 0 -40px 110px rgba(170,170,180,0.64), ' +
      '0 40px 110px rgba(170,170,180,0.64)',
  },
};
