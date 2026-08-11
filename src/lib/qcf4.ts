/**
 * QCF V4 (King Fahd Complex, Madinah Mushaf 1441 AH) type definitions and
 * data-loading utilities.
 *
 * Assets live in /public/qcf4/:
 *   pages/NNN.json  — per-page glyph data (604 files)
 *   fonts-page/NNN/ — постраничные подмножества шрифтов (797 файлов,
 *                     ~71 КБ на страницу).  Нарезаются из 48 исходных
 *                     шрифтов скриптом scripts/build-page-fonts.py;
 *                     исходники лежат в vendor/qcf4-fonts-woff2/, вне
 *                     public — в рантайме они не нужны, а в пакете это
 *                     были лишние 36 МБ.
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
  /**
   * Страница мусхафа, с которой пришло слово.  В JSON этого поля нет —
   * его проставляет `hydratePage` при загрузке.
   *
   * Нужно потому, что шрифты нарезаны по страницам, и семейство слова
   * зависит от страницы, а не только от `font`.  У аята на стыке страниц
   * слова приходят с двух страниц сразу, поэтому одного номера на аят
   * недостаточно — нужен номер на каждое слово.
   */
  page?: number;
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
 * Семейство для CSS: шрифт плюс страница.
 *
 * Подмножества одного шрифта для разных страниц обязаны жить в разных
 * семействах.  Если назвать их одинаково, браузер сложит все `@font-face`
 * с этим именем в одно семейство и на пересекающихся PUA-кодах отдаст
 * глиф не той страницы — то есть чужое слово внутри аята.
 */
export function qcfPageFamily(fontName: string, page: number): string {
  return `${fontName}_p${page}`;
}

/** Постраничное подмножество: /qcf4/fonts-page/077/QCF4_Hafs_06.woff2 */
export function qcfPageFontUrl(fontName: string, page: number): string {
  return `/qcf4/fonts-page/${String(page).padStart(3, '0')}/${fontName}.woff2`;
}

/** Пара «шрифт + страница» — минимум, которым однозначно задаётся семейство. */
export interface QcfFontRef {
  font: string;
  page: number;
}

/**
 * Какие подмножества нужны набору слов, без повторов.
 *
 * Слова аята могут лежать на двух страницах, а на одной странице
 * встречаться слова из трёх разных шрифтов — поэтому считаем по парам.
 */
export function distinctFontRefs(words: QcfWord[]): QcfFontRef[] {
  const seen = new Set<string>();
  const refs: QcfFontRef[] = [];
  for (const w of words) {
    if (!w.font || w.page == null) continue;
    const key = `${w.font}|${w.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ font: w.font, page: w.page });
  }
  return refs;
}

/**
 * Проставить слову номер страницы.
 *
 * Данные страниц отдаются как есть, без номера внутри слова, а шрифт
 * теперь выбирается по паре (шрифт, страница) — значит номер нужен на
 * каждом слове.  Делается один раз при загрузке: слова живут в кэше и
 * расходятся по компонентам уже готовыми.
 */
export function hydratePage(data: QcfPageData): QcfPageData {
  for (const line of data.lines) {
    for (const word of line.words) {
      word.page = data.page;
    }
  }
  return data;
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
