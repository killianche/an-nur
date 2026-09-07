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
  order:         'azkar.order',          // см. AZKAR_ORDERS ниже
} as const;

/**
 * Порядок азкаров в разделе.
 *
 * 🔴 В данных лежат ДВА порядка, и это не догадка, а свойство файла.
 *
 *  • `book` — по полю `n_in_category`: 1, 2, 3 … Так экран показывает азкары
 *    сейчас. Три суры (Ихлас, Фаляк, Нас) стоят в конце, под номерами 14–16.
 *  • `source` — порядок, в котором записи ЛЕЖАТ в `azkar.json`. Он другой:
 *    у утренних это 14, 15, 16, 1, 5, 6, 7, 3, 4, 8, 9, 10, 12, 2, 11, 13 —
 *    то есть сперва три суры, потом остальное своим чередом. Этот порядок
 *    пришёл из исходных данных (снимок QuranIng, коммит af7e7b8) и с тех пор
 *    не менялся — сортировка по номеру появилась уже в приложении.
 *
 * Владелец 07.09.2026 вспомнил, что «изначально последовательность была
 * другая», и попросил дать выбор. Ничего не пересобирается и не
 * переписывается: обе последовательности — это два способа обойти один и тот
 * же массив. Сами тексты азкаров не трогаются вовсе.
 */
export const AZKAR_ORDERS = ['book', 'source'] as const;
export type AzkarOrder = typeof AZKAR_ORDERS[number];
const DEFAULT_ORDER: AzkarOrder = 'book';

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

/** Как сейчас упорядочены азкары. */
export function readAzkarOrder(): AzkarOrder {
  if (typeof window === 'undefined') return DEFAULT_ORDER;
  const v = window.localStorage.getItem(KEYS.order);
  return (AZKAR_ORDERS as readonly string[]).includes(v ?? '')
    ? (v as AzkarOrder)
    : DEFAULT_ORDER;
}

// Настройка живёт в одном экране (аккаунт), а действует в другом (азкары).
// Подписка нужна, чтобы список не ждал перемонтирования: человек меняет
// порядок и тут же уходит смотреть — увидеть он должен новый.
const слушатели = new Set<() => void>();

export function subscribeAzkarOrder(fn: () => void): () => void {
  слушатели.add(fn);
  return () => { слушатели.delete(fn); };
}

export function writeAzkarOrder(order: AzkarOrder) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEYS.order, order);
  слушатели.forEach(fn => fn());
}

/**
 * Разложить записи категории в выбранном порядке.
 *
 * Отдельной чистой функцией, а не сортировкой по месту: правило легко
 * сломать незаметно — список останется полным, просто пойдёт не в том
 * порядке, и заметить это может только человек, знающий книгу наизусть.
 *
 * `source` — это порядок ИСХОДНОГО МАССИВА, поэтому здесь ничего не
 * сортируется: массив уже пришёл в нужной последовательности, и любая
 * сортировка её бы и разрушила.
 */
export function orderAzkar<T extends { n_in_category?: number }>(
  список: readonly T[],
  order: AzkarOrder,
): T[] {
  if (order === 'source') return [...список];
  return [...список].sort((a, b) => (a.n_in_category ?? 0) - (b.n_in_category ?? 0));
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
