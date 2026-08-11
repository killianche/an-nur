/**
 * Azkar visibility preferences.
 *
 * Stored in localStorage under an `azkar.*` namespace so they don't collide
 * with the Quran-side prefs (`showArabic` / `showRu`).  All three blocks
 * (Arabic + Russian translation + cyrillic transliteration of the Arabic)
 * are shown by default — Azkar readers generally want every available aid
 * on screen, and the settings popover lets them hide what they don't need.
 *
 * Ингушский блок убран при переносе в QuranRu (2026-08-09).  Старые ключи
 * `azkar.showIngush` / `azkar.ingushScale` / `azkar.ingushFont` в
 * localStorage просто перестают читаться — чистить их не нужно, они
 * безвредны и исчезнут при переустановке.
 */

import { AZKAR_FONT_IDS, type AzkarFontId } from './azkarFonts';
import {
  SCALE_OPTIONS, LATIN_FONTS, type LatinFontId,
} from './typography';

const KEYS = {
  showArabic:   'azkar.showArabic',
  showTranslit: 'azkar.showTranslit',   // cyrillic transliteration of the Arabic
  showRussian:  'azkar.showRussian',
  arabicFont:   'azkar.arabicFont',     // see lib/azkarFonts.ts
  arabicScale:   'azkar.arabicScale',
  russianScale:  'azkar.russianScale',
  translitScale: 'azkar.translitScale',
  russianFont:   'azkar.russianFont',   // see LATIN_FONTS in lib/typography.ts
  translitFont:  'azkar.translitFont',
} as const;

const VISIBILITY_DEFAULTS = {
  showArabic:   true,
  showTranslit: true,
  showRussian:  true,
} as const;

// Per-language defaults.
//
//  Arabic   — KFGQPC Uthmanic, large (1.4 / SCALE_OPTIONS[3])
//  Russian  — Inter Regular, medium (1.0 / SCALE_OPTIONS[1]).  В QuranIng
//             русский шёл третьим языком и стоял на 0.85; здесь он
//             основной перевод, поэтому поднят на шаг.
//  Translit — Inter Regular, small (0.85 / SCALE_OPTIONS[0])
//
// The Arabic-comma issue (U+060C dotted-circle in raw KFGQPC) is
// already solved by the "Azkar KFGQPC" composite font-family in
// index.css (unicode-range splice from Noto Naskh).
const DEFAULT_ARABIC_FONT: AzkarFontId = 'kfgqpc-v22';
const DEFAULT_RUSSIAN_FONT: LatinFontId  = 'inter-regular';
const DEFAULT_TRANSLIT_FONT: LatinFontId = 'inter-regular';

// Второй размер из четырёх (SCALE_OPTIONS: 0.85 / 1.0 / 1.2 / 1.4).
// Был четвёртый, самый крупный — арабский занимал почти весь экран
// карточки, и перевод с транскрипцией уезжали под сгиб. Решение
// владельца: по умолчанию второй.
const DEFAULT_ARABIC_SCALE   = 1.0;
const DEFAULT_RUSSIAN_SCALE  = 1.0;
const DEFAULT_TRANSLIT_SCALE = 0.85;

const LATIN_FONT_IDS = LATIN_FONTS.map(f => f.id);
const ALLOWED_SCALES = SCALE_OPTIONS.map(o => o.value);

export type AzkarVisibilityKey = keyof typeof VISIBILITY_DEFAULTS;
export type AzkarScaleKey = 'arabicScale' | 'russianScale' | 'translitScale';
export type AzkarLatinFontKey = 'russianFont' | 'translitFont';

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
    showTranslit: readBool(KEYS.showTranslit, VISIBILITY_DEFAULTS.showTranslit),
    showRussian:  readBool(KEYS.showRussian,  VISIBILITY_DEFAULTS.showRussian),
    arabicFont:   readArabicFont(),
    arabicScale:   readScale(KEYS.arabicScale,   DEFAULT_ARABIC_SCALE),
    russianScale:  readScale(KEYS.russianScale,  DEFAULT_RUSSIAN_SCALE),
    translitScale: readScale(KEYS.translitScale, DEFAULT_TRANSLIT_SCALE),
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
