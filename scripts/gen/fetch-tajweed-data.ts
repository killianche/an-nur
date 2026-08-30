/**
 * Fetch QPC v4 Tajweed fonts + glyph data and regenerate the
 * auto-generated CSS / TS sources.
 *
 * Output paths (relative to repo root):
 *   public/fonts/qpc-v4-tajweed-p{001..604}.woff2  (604 official COLR v0/CPAL files)
 *   src/styles/tajweed-fonts.css                    (604 @font-face declarations)
 *   src/content/quran-tajweed-glyphs.ts             (TAJWEED_GLYPHS map for 6236 ayahs)
 *   public/tajweed/pages/{001..604}.json             (fixed page lines for Mushaf mode)
 *
 * Sources:
 *   Fonts — https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/p{N}.woff2
 *   API   — https://api.qurancdn.com/api/qdc/verses/by_page/{N}
 *
 * Idempotent: re-running skips files that already exist (use --force
 * to re-download).  Concurrency tuned for a typical broadband link.
 *
 * Run with: npx tsx scripts/gen/fetch-tajweed-data.ts
 *
 * Keep the downloaded font binaries intact. Do not run the historical
 * palette patch, COLR conversion or SVG generator: WKWebView renders the
 * official COLR v0 layers and selects their CPAL palettes correctly.
 */

import { mkdir, writeFile, access, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT  = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FONTS_DIR  = join(REPO_ROOT, 'public/fonts');
const CSS_PATH   = join(REPO_ROOT, 'src/styles/tajweed-fonts.css');
const GLYPHS_TS  = join(REPO_ROOT, 'src/content/quran-tajweed-glyphs.ts');
const PAGES_DIR  = join(REPO_ROOT, 'public/tajweed/pages');

const TOTAL_PAGES      = 604;
const FONT_BASE        = 'https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/p';
const API_BASE         = 'https://api.qurancdn.com/api/qdc/verses/by_page/';
const FONT_CONCURRENCY = 16;
const API_CONCURRENCY  = 10;

const args = new Set(process.argv.slice(2));
const FORCE_FONTS  = args.has('--force-fonts')  || args.has('--force');
const FORCE_GLYPHS = args.has('--force-glyphs') || args.has('--force');
const SKIP_FONTS   = args.has('--skip-fonts');
const SKIP_GLYPHS  = args.has('--skip-glyphs');

// ── tiny semaphore ───────────────────────────────────────────────────────────
async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function fontFileName(page: number): string {
  return `qpc-v4-tajweed-p${pad3(page)}.woff2`;
}

// ── 1. fetch 604 woff2 ────────────────────────────────────────────────────────
async function fetchFonts() {
  await mkdir(FONTS_DIR, { recursive: true });
  const pages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
  let downloaded = 0, skipped = 0, failed = 0;
  await pMap(pages, FONT_CONCURRENCY, async (page) => {
    const dest = join(FONTS_DIR, fontFileName(page));
    if (!FORCE_FONTS && existsSync(dest)) { skipped++; return; }
    const url = `${FONT_BASE}${page}.woff2`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      downloaded++;
      if (downloaded % 50 === 0) console.log(`  fonts: ${downloaded + skipped}/${TOTAL_PAGES}`);
    } catch (err) {
      failed++;
      console.warn(`  ! page ${page}: ${(err as Error).message}`);
    }
  });
  console.log(`fonts: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} font downloads failed`);
}

// ── 2. fetch 604 page glyph payloads ─────────────────────────────────────────
type APIWord = {
  position: number;
  code_v2: string;
  text_qpc_hafs: string;
  verse_key: string;
  char_type_name: 'word' | 'end';
  page_number: number;
  line_number: number;
};
type APIVerse = {
  verse_key: string;
  verse_number: number;
  page_number: number;
  words: APIWord[];
};
type APIResp = { verses: APIVerse[] };

type TajweedWord = { code: string; text: string };
type TajweedAyahData = {
  surah: number;
  ayah: number;
  page: number;
  words: TajweedWord[];
  endMarker: string;
};

type TajweedPageWord = {
  code: string;
  text: string;
  verseKey: string;
  position: number;
  type: 'word' | 'end';
};
type TajweedPageData = {
  page: number;
  lines: Array<{ line: number; words: TajweedPageWord[] }>;
};

async function fetchGlyphs(): Promise<{
  ayahs: Record<string, TajweedAyahData>;
  pages: Record<number, TajweedPageData>;
}> {
  const pages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
  const wordFields = 'code_v2,text_qpc_hafs,position,page_number,line_number,verse_key,char_type_name';
  const all: Record<string, TajweedAyahData> = {};
  const pageLayouts: Record<number, TajweedPageData> = {};
  let done = 0;
  await pMap(pages, API_CONCURRENCY, async (page) => {
    // mushaf=19 — QPC V4 Tajweed. Без него API отдаёт line_number
    // стандартного QCF V2: коды глифов совпадают, но часть переносов строк
    // отличается, и полноэкранная страница перестаёт быть мусхафом.
    const url = `${API_BASE}${page}?words=true&word_fields=${wordFields}&per_page=50&mushaf=19`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`page ${page} HTTP ${res.status}`);
    const data = (await res.json()) as APIResp;
    const lines = new Map<number, TajweedPageWord[]>();
    for (const v of data.verses) {
      const [surahStr, ayahStr] = v.verse_key.split(':');
      const surah = parseInt(surahStr, 10);
      const ayah  = parseInt(ayahStr,  10);
      const words: TajweedWord[] = [];
      let endMarker = '';

      // Полноэкранный мусхаф строится по фиксированным строкам источника.
      // Нельзя восстанавливать их по количеству слов: один цветной глиф
      // иногда содержит два аудиослова (37:130), а аят может пересекать
      // границу страницы. Берём line_number/page_number буквально.
      for (const w of v.words) {
        if (w.page_number !== page || !Number.isFinite(w.line_number)) continue;
        // В API Аль-Фатиха и начало Аль-Бакары расположены на строках
        // 9..15/10..15 физического листа. Наши QCF JSON хранят только
        // видимые строки страницы (1..8), поэтому у первых двух страниц
        // одинаково снимаем семь пустых верхних строк.
        const displayLine = page <= 2 ? w.line_number - 7 : w.line_number;
        const lineWords = lines.get(displayLine) ?? [];
        lineWords.push({
          code: w.code_v2,
          text: w.text_qpc_hafs,
          verseKey: w.verse_key,
          position: w.position,
          type: w.char_type_name,
        });
        lines.set(displayLine, lineWords);
      }
      // API sometimes splits a single verse across two pages (notably
      // in Al-Baqarah).  We only see the slice that lives on `page`,
      // so merge into any existing record under the same verse_key.
      const existing = all[v.verse_key];
      if (existing) {
        existing.words.push(...v.words.filter(w => w.char_type_name === 'word').map(w => ({ code: w.code_v2, text: w.text_qpc_hafs })));
        const endW = v.words.find(w => w.char_type_name === 'end');
        if (endW) existing.endMarker = endW.code_v2;
        continue;
      }
      for (const w of v.words) {
        if (w.char_type_name === 'word') {
          words.push({ code: w.code_v2, text: w.text_qpc_hafs });
        } else if (w.char_type_name === 'end') {
          endMarker = w.code_v2;
        }
      }
      all[v.verse_key] = { surah, ayah, page, words, endMarker };
    }
    pageLayouts[page] = {
      page,
      lines: Array.from(lines.entries())
        .sort(([a], [b]) => a - b)
        .map(([line, words]) => ({ line, words })),
    };
    done++;
    if (done % 50 === 0) console.log(`  glyphs: ${done}/${TOTAL_PAGES} pages`);
  });
  const verseCount = Object.keys(all).length;
  console.log(`glyphs: ${verseCount} verse entries across ${TOTAL_PAGES} pages`);
  return { ayahs: all, pages: pageLayouts };
}

async function emitPageJson(pages: Record<number, TajweedPageData>) {
  await mkdir(PAGES_DIR, { recursive: true });
  const pageNumbers = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
  await pMap(pageNumbers, 32, async page => {
    const data = pages[page];
    if (!data) throw new Error(`missing Tajweed page layout ${page}`);
    await writeFile(
      join(PAGES_DIR, `${pad3(page)}.json`),
      `${JSON.stringify(data)}\n`,
    );
  });
  console.log(`wrote ${PAGES_DIR} (${pageNumbers.length} pages)`);
}

// ── 3. emit auto-gen CSS ─────────────────────────────────────────────────────
async function emitCss() {
  await mkdir(dirname(CSS_PATH), { recursive: true });
  const lines: string[] = [
    '/* AUTO-GENERATED by scripts/gen/fetch-tajweed-data.ts — do not edit by hand. */',
    '/* 604 page-scoped @font-face declarations for the QPC v4 Tajweed mushaf. */',
    '/* unicode-range narrows them to the PUA block U+FC00..U+FFFF so they cannot */',
    '/* accidentally apply to normal Arabic text in the rest of the app. */',
    '',
  ];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    lines.push(`@font-face { font-family: 'QPC4Tajweed-${pad3(p)}'; src: url('/fonts/${fontFileName(p)}') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; unicode-range: U+FC00-FFFF; }`);
  }
  await writeFile(CSS_PATH, lines.join('\n') + '\n');
  console.log(`wrote ${CSS_PATH}`);
}

// ── 4. emit auto-gen TS ──────────────────────────────────────────────────────
async function emitGlyphsTs(glyphs: Record<string, TajweedAyahData>) {
  await mkdir(dirname(GLYPHS_TS), { recursive: true });
  const verseKeys = Object.keys(glyphs).sort((a, b) => {
    const [a1, a2] = a.split(':').map(Number);
    const [b1, b2] = b.split(':').map(Number);
    return a1 - b1 || a2 - b2;
  });
  const lines: string[] = [
    '// AUTO-GENERATED by scripts/gen/fetch-tajweed-data.ts — do not edit by hand.',
    '// Sources: verses.quran.foundation/fonts + api.qurancdn.com/api/qdc',
    '',
    'export type TajweedWord = { code: string; text: string };',
    'export type TajweedAyahData = {',
    '  surah: number;',
    '  ayah: number;',
    '  page: number;',
    '  words: TajweedWord[];',
    '  endMarker: string;',
    '};',
    '',
    'export const TAJWEED_GLYPHS: Record<string, TajweedAyahData> = {',
  ];
  for (const key of verseKeys) {
    const d = glyphs[key];
    const wordsJson = JSON.stringify(d.words);
    lines.push(`  ${JSON.stringify(key)}: { surah: ${d.surah}, ayah: ${d.ayah}, page: ${d.page}, words: ${wordsJson}, endMarker: ${JSON.stringify(d.endMarker)} },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('export function getTajweedAyah(verseKey: string): TajweedAyahData | null {');
  lines.push('  return TAJWEED_GLYPHS[verseKey] ?? null;');
  lines.push('}');
  lines.push('');
  lines.push('export function fontFamilyForPage(page: number): string | null {');
  lines.push(`  if (page < 1 || page > ${TOTAL_PAGES}) return null;`);
  lines.push("  return `QPC4Tajweed-${String(page).padStart(3, '0')}`;");
  lines.push('}');
  lines.push('');
  lines.push(`export const ALL_TAJWEED_FONT_FAMILIES: string[] = Array.from({ length: ${TOTAL_PAGES} }, (_, i) => \`QPC4Tajweed-\${String(i + 1).padStart(3, '0')}\`);`);
  lines.push('');
  await writeFile(GLYPHS_TS, lines.join('\n'));
  console.log(`wrote ${GLYPHS_TS} (${verseKeys.length} verses)`);
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  if (!SKIP_FONTS) {
    console.log('— step 1/3: fonts (604 woff2)');
    await fetchFonts();
  }
  if (!SKIP_GLYPHS) {
    console.log('— step 2/3: glyph data (604 pages, ~6236 verses)');
    const { ayahs, pages } = await fetchGlyphs();
    console.log('— step 3/3: regenerate CSS + TS + page JSON');
    await emitCss();
    await emitGlyphsTs(ayahs);
    await emitPageJson(pages);
  } else {
    console.log('— skipping CSS / TS (--skip-glyphs)');
  }
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
