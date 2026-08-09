/**
 * Azkar visibility preferences.
 *
 * Stored in localStorage under an `azkar.*` namespace so they don't collide
 * with the Quran-side prefs (`showArabic` / `showIng` / `showRu`).  All
 * four blocks (Arabic + Ingush translation + Russian + Ingush-cyrillic
 * transliteration of the Arabic) are shown by default — Azkar readers
 * generally want every available aid on screen, and a future settings
 * popover will let advanced users hide whichever blocks they don't need.
 */

import { AZKAR_FONT_IDS, type AzkarFontId } from './azkarFonts';
import {
  SCALE_OPTIONS, LATIN_FONTS, type LatinFontId,
} from './typography';

const KEYS = {
  showArabic:   'azkar.showArabic',
  showIngush:   'azkar.showIngush',     // Ingush translation
  showTranslit: 'azkar.showTranslit',   // Ingush cyrillic transliteration of the Arabic
  showRussian:  'azkar.showRussian',
  arabicFont:   'azkar.arabicFont',     // see lib/azkarFonts.ts
  arabicScale:   'azkar.arabicScale',
  ingushScale:   'azkar.ingushScale',
  russianScale:  'azkar.russianScale',
  translitScale: 'azkar.translitScale',
  ingushFont:    'azkar.ingushFont',    // see LATIN_FONTS in lib/typography.ts
  russianFont:   'azkar.russianFont',
  translitFont:  'azkar.translitFont',
} as const;

const VISIBILITY_DEFAULTS = {
  showArabic:   true,
  showIngush:   true,
  showTranslit: true,
  showRussian:  true,
} as const;

// Per-language defaults frozen from the user's preferred reading
// configuration (Nov 2026).  Each one is the actual choice the user
// dialed in via the typography popover; setting them as the defaults
// here means a fresh install lands on exactly the same look.
//
//  Arabic   — KFGQPC Uthmanic, large (1.4 / SCALE_OPTIONS[3])
//  Ingush   — Alice serif, medium (1.0 / SCALE_OPTIONS[1])
//  Russian  — Inter Regular, small (0.85 / SCALE_OPTIONS[0])
//  Translit — Inter Regular, small (0.85 / SCALE_OPTIONS[0])
//
// The Arabic-comma issue (U+060C dotted-circle in raw KFGQPC) is
// already solved by the "Azkar KFGQPC" composite font-family in
// index.css (unicode-range splice from Noto Naskh).
const DEFAULT_ARABIC_FONT: AzkarFontId = 'kfgqpc-v22';
const DEFAULT_INGUSH_FONT: LatinFontId   = 'alice';
const DEFAULT_RUSSIAN_FONT: LatinFontId  = 'inter-regular';
const DEFAULT_TRANSLIT_FONT: LatinFontId = 'inter-regular';

const DEFAULT_ARABIC_SCALE   = 1.4;
const DEFAULT_INGUSH_SCALE   = 1.0;
const DEFAULT_RUSSIAN_SCALE  = 0.85;
const DEFAULT_TRANSLIT_SCALE = 0.85;

const LATIN_FONT_IDS = LATIN_FONTS.map(f => f.id);
const ALLOWED_SCALES = SCALE_OPTIONS.map(o => o.value);

export type AzkarVisibilityKey = keyof typeof VISIBILITY_DEFAULTS;
export type AzkarScaleKey = 'arabicScale' | 'ingushScale' | 'russianScale' | 'translitScale';
export type AzkarLatinFontKey = 'ingushFont' | 'russianFont' | 'translitFont';

function readBool(key: string, def: boolean): boolean {
  if (typeof window === 'undefined') return def;
  const v = window.localStorage.getItem(key);
  if (v === '1') return true;
  if (v === '0') return false;
  return def;
}

function writeBool(key: string, v: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, v ? '1' : '0');
}

function readScale(key: string, def: number): number {
  if (typeof window === 'undefined') return def;
  const raw = window.localStorage.getItem(key);
  if (!raw) return def;
  const n = parseFloat(raw);
  // Snap to the nearest allowed step so a stale value (say a leftover
  // 1.35 from an older build) doesn't desync the UI's pill highlight.
  if (!Number.isFinite(n)) return def;
  return ALLOWED_SCALES.reduce(
    (best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best,
    def,
  );
}

function writeScale(key: string, v: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(v));
}

function readArabicFont(): AzkarFontId {
  if (typeof window === 'undefined') return DEFAULT_ARABIC_FONT;
  const v = window.localStorage.getItem(KEYS.arabicFont);
  return (AZKAR_FONT_IDS as readonly string[]).includes(v ?? '')
    ? (v as AzkarFontId)
    : DEFAULT_ARABIC_FONT;
}

function readLatinFont(key: string, def: LatinFontId): LatinFontId {
  if (typeof window === 'undefined') return def;
  const v = window.localStorage.getItem(key);
  return (LATIN_FONT_IDS as readonly string[]).includes(v ?? '')
    ? (v as LatinFontId)
    : def;
}

export function readAzkarPrefs() {
  return {
    showArabic:   readBool(KEYS.showArabic,   VISIBILITY_DEFAULTS.showArabic),
    showIngush:   readBool(KEYS.showIngush,   VISIBILITY_DEFAULTS.showIngush),
    showTranslit: readBool(KEYS.showTranslit, VISIBILITY_DEFAULTS.showTranslit),
    showRussian:  readBool(KEYS.showRussian,  VISIBILITY_DEFAULTS.showRussian),
    arabicFont:   readArabicFont(),
    arabicScale:   readScale(KEYS.arabicScale,   DEFAULT_ARABIC_SCALE),
    ingushScale:   readScale(KEYS.ingushScale,   DEFAULT_INGUSH_SCALE),
    russianScale:  readScale(KEYS.russianScale,  DEFAULT_RUSSIAN_SCALE),
    translitScale: readScale(KEYS.translitScale, DEFAULT_TRANSLIT_SCALE),
    ingushFont:    readLatinFont(KEYS.ingushFont,   DEFAULT_INGUSH_FONT),
    russianFont:   readLatinFont(KEYS.russianFont,  DEFAULT_RUSSIAN_FONT),
    translitFont:  readLatinFont(KEYS.translitFont, DEFAULT_TRANSLIT_FONT),
  };
}

export type AzkarPrefs = ReturnType<typeof readAzkarPrefs>;

export function writeAzkarPref(key: AzkarVisibilityKey, value: boolean) {
  writeBool(KEYS[key], value);
}

export function writeAzkarScale(key: AzkarScaleKey, value: number) {
  writeScale(KEYS[key], value);
}

export function writeAzkarFont(font: AzkarFontId) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEYS.arabicFont, font);
}

export function writeAzkarLatinFont(key: AzkarLatinFontKey, font: LatinFontId) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEYS[key], font);
}
