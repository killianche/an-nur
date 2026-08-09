/**
 * QCF V4 (King Fahd Complex, Madinah Mushaf 1441 AH) type definitions and
 * data-loading utilities.
 *
 * Assets live in /public/qcf4/:
 *   pages/NNN.json  — per-page glyph data (604 files)
 *   fonts-woff2/    — 47 Hafs fonts + 1 QBSML font (48 total)
 *   verses.json     — verse_key → {page, lines}
 *   font-map.json   — page number → font name
 *
 * Each word has a single PUA character (U+F100…) that maps to a pre-composed
 * glyph in the corresponding QCF font.  Lines are explicit in the data — no
 * text-wrapping logic needed.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type QcfWordType = 'word' | 'end' | 'surah_header' | 'bismillah' | 'sajda' | 'quarter' | string;

export interface QcfWord {
  code: number;
  /** Single PUA character — must be rendered with the matching QCF font */
  char: string;
  /** Font family name: e.g. "QCF4_Hafs_01" or "QCF4_QBSML" */
  font: string;
  /** Unicode text equivalent — for search / accessibility, NOT for display */
  text: string;
  type: QcfWordType;
  /** "surah:ayah" — absent on headers */
  verse_key?: string;
  /** 1-based position within the ayah */
  position?: number;
  /** Surah number — present on headers */
  sura?: number;
}

export interface QcfLine {
  line: number;
  words: QcfWord[];
}

export interface QcfSurahMeta {
  id: number;
  name: string;
  name_arabic: string;
  verse_start: number;
  verse_end: number;
}

export interface QcfPageData {
  page: number;
  /** Primary font for this page (most words use it) */
  font: string;
  surahs: QcfSurahMeta[];
  lines: QcfLine[];
}

export interface VerseLocation {
  page: number;
  lines: Array<{ line: number; word_start: number; word_end: number }>;
}

export type VersesJson = Record<string, VerseLocation>;

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Maps a QCF font name to its woff2 filename.
 * QCF4_Hafs_NN  → QCF4_Hafs_NN_W.woff2
 * QCF4_QBSML    → QCF4_QBSML.woff2
 */
export function qcfFontFileName(fontName: string): string {
  if (fontName === 'QCF4_QBSML') return 'QCF4_QBSML.woff2';
  return `${fontName}_W.woff2`;
}

/**
 * Zero-pads a page number to 3 digits for the filename.
 * e.g. 1 → "001", 42 → "042", 604 → "604"
 */
export function pageJsonPath(pageNum: number): string {
  return `/qcf4/pages/${String(pageNum).padStart(3, '0')}.json`;
}

// ─── Singleton verse-map loader ───────────────────────────────────────────────

let versesCache: VersesJson | null = null;
let versesPromise: Promise<VersesJson> | null = null;

/**
 * Load (and permanently cache) /qcf4/verses.json.
 * Safe to call concurrently — only one network request is ever made.
 */
export function loadVersesJson(): Promise<VersesJson> {
  if (versesCache) return Promise.resolve(versesCache);
  if (versesPromise) return versesPromise;
  versesPromise = fetch('/qcf4/verses.json')
    .then(r => {
      if (!r.ok) throw new Error(`verses.json HTTP ${r.status}`);
      return r.json() as Promise<VersesJson>;
    })
    .then(data => {
      versesCache = data;
      return data;
    });
  return versesPromise;
}

/**
 * Return the cached verse map synchronously, or null if not loaded yet.
 * Callers that already triggered loadVersesJson() can use this as a fast-path.
 */
export function getVersesJsonSync(): VersesJson | null {
  return versesCache;
}
