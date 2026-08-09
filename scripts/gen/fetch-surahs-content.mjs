#!/usr/bin/env node
/**
 * fetch-surahs-content.mjs
 *
 * Fetches Arabic (quran-uthmani) and Russian (ru.kuliev) from alquran.cloud,
 * reads Ingush from local /Ayats/ files, and appends QuranSource entries for
 * surahs 78–114 (Juz Amma) to web/src/content/quran-sources.ts.
 *
 * Existing entries (67, 110) are NOT touched — the script only appends.
 * Already-present keys are skipped so the script is safe to re-run.
 *
 * Run: node scripts/fetch-surahs-content.mjs
 * Requires: Node 18+ (global fetch available)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '..');
const AYATS_DIR  = resolve(ROOT, 'Ayats');
const SOURCES_TS = resolve(ROOT, 'web/src/content/quran-sources.ts');

const TODAY          = new Date().toISOString().slice(0, 10);
const SURAHS_TO_ADD  = Array.from({ length: 37 }, (_, i) => 78 + i); // 78–114
const API_BASE       = 'https://api.alquran.cloud/v1/surah';
const RATE_DELAY_MS  = 300; // pause between surah fetches (ms)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithRetry(url, retries = 4) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries - 1) throw new Error(`Failed ${url}: ${err.message}`);
      const wait = 1000 * (attempt + 1);
      process.stdout.write(` [retry ${attempt + 1}, wait ${wait}ms]`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Basmala stripping ─────────────────────────────────────────────────────────
// The quran-uthmani edition prepends the Basmala to ayah 1 of every surah
// (except 1 which IS the Fatiha and 9 which has no Basmala).
//
// The text uses ٱ (alif-wasla U+0671) not ا (plain alif U+0627).
// Harakat (U+064B–U+065F, U+0670) may appear in any order between consonants.
// We strip by codepoint-level detection rather than a literal regex to avoid
// Unicode normalization mismatches.
//
// Algorithm: normalize Arabic text to consonants-only (strip harakat, map
// alif-wasla→alif) for comparison; if prefix matches the Basmala,
// find the cut point in the original text by walking consonants.

function isHarakat(cp) {
  // U+064B–U+065F  (fathatan, dammatan, kasratan, fatha, damma, kasra,
  //                 shadda, sukun, maddah-above, hamza-above, hamza-below, ...)
  // U+0670         (superscript alef / alef khanjariya)
  return (cp >= 0x064B && cp <= 0x065F) || cp === 0x0670;
}

function normConsonants(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (isHarakat(cp)) continue;
    out += (cp === 0x0671) ? 'ا' : ch; // ٱ → ا
  }
  return out;
}

// Basmala consonants (no harakat), plain alif form:
// بسم الله الرحمن الرحيم (19 chars including spaces)
const BASMALA_NORM = 'بسم الله الرحمن الرحيم';

function stripBasmala(text, surah, ayah) {
  if (ayah !== 1) return text;
  if (surah === 1 || surah === 9) return text;
  if (!normConsonants(text).startsWith(BASMALA_NORM)) return text;

  // Find the cut point in the original text by consuming BASMALA_NORM.length
  // non-harakat characters (harakat are counted as 0 consonants).
  let pos = 0;
  let consonantsSeen = 0;
  const target = BASMALA_NORM.length;
  while (consonantsSeen < target && pos < text.length) {
    const cp = text.codePointAt(pos);
    if (!isHarakat(cp)) consonantsSeen++;
    pos++;
  }
  // Skip any remaining harakat and spaces after the Basmala
  while (pos < text.length) {
    const cp = text.codePointAt(pos);
    if (isHarakat(cp) || text[pos] === ' ') pos++;
    else break;
  }
  return text.slice(pos);
}

function escStr(s) {
  // Escape for a single-quote TS string literal
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

// ── Load Ingush translations ─────────────────────────────────────────────────
// Returns { [surahNum]: { [ayahNum]: text } }

function loadIngushMap() {
  const map = {};
  let loaded = 0;
  const files = readdirSync(AYATS_DIR);

  for (const file of files) {
    if (!file.endsWith('_ingush.json')) continue;

    // Match numeric surah number from filename, e.g. "_сурат-78-хоам_ingush.json"
    // Also handles old-style names like "_сура-67-аль-мульк-власть_ingush.json"
    const m = file.match(/[_](?:сурат|сура)-(\d+)-/);
    if (!m) continue;

    const surahNum = parseInt(m[1], 10);
    if (surahNum < 78 || surahNum > 112) continue; // only Juz Amma range (no inh for 113-114)

    try {
      const raw  = readFileSync(resolve(AYATS_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      map[surahNum] = {};
      for (const a of (data.ayahs || [])) {
        if (a.ayah != null && a.text) {
          map[surahNum][a.ayah] = a.text.trim();
        }
      }
      loaded++;
    } catch (e) {
      console.warn(`  ⚠ Could not parse ${file}: ${e.message}`);
    }
  }

  console.log(`Loaded Ingush files for ${loaded} surahs`);
  return map;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Read existing keys so we don't duplicate
  const existingSrc = readFileSync(SOURCES_TS, 'utf-8');
  const existingKeys = new Set(
    [...existingSrc.matchAll(/'(\d+:\d+)':/g)].map(m => m[1])
  );
  console.log(`Existing entries: ${existingKeys.size}`);

  const ingushMap = loadIngushMap();
  const lines = [];
  let added = 0;
  let skipped = 0;

  for (const surahNum of SURAHS_TO_ADD) {
    process.stdout.write(`Surah ${surahNum}...`);

    const [arabicJson, russianJson] = await Promise.all([
      fetchWithRetry(`${API_BASE}/${surahNum}/quran-uthmani`),
      fetchWithRetry(`${API_BASE}/${surahNum}/ru.kuliev`),
    ]);

    const arabicAyahs  = arabicJson.data.ayahs;
    const russianAyahs = russianJson.data.ayahs;
    const ingushSurah  = ingushMap[surahNum] || {};
    const surahLines   = [];

    for (let i = 0; i < arabicAyahs.length; i++) {
      const ayahNum = arabicAyahs[i].numberInSurah;
      const key     = `${surahNum}:${ayahNum}`;

      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      const arabic = escStr(stripBasmala(arabicAyahs[i].text.trim(), surahNum, ayahNum));
      const ru     = escStr(russianAyahs[i].text.trim());
      const inh    = ingushSurah[ayahNum];
      const inhPart = inh ? `, inh: '${escStr(inh)}'` : '';

      surahLines.push(
        `  '${key}': { surah: ${surahNum}, ayah: ${ayahNum}, arabic: '${arabic}', translations: { ru: '${ru}'${inhPart} }, editions: { arabic: 'ar-quran-uthmani', ru: 'ru-kuliev' }, fetchedAt: '${TODAY}' },`
      );
      added++;
    }

    process.stdout.write(` ${surahLines.length} ayahs\n`);

    if (surahLines.length > 0) {
      const surahMeta = arabicJson.data;
      lines.push(
        `\n  // ── Сура ${surahNum} (${surahMeta.englishName}) ─────────────────────────────────────────────────`
      );
      lines.push(...surahLines);
    }

    await sleep(RATE_DELAY_MS);
  }

  if (added === 0) {
    console.log(`\nNothing new to add (${skipped} entries already present).`);
    return;
  }

  // Find the closing `};` of QURAN_SOURCES and insert before it
  const closingIdx = existingSrc.lastIndexOf('};');
  if (closingIdx === -1) throw new Error('Cannot find closing `};` in quran-sources.ts');

  const header = `\n  // ── Джуз Амма — суры 78–114 ────────────────────────────────────────────────\n  // Arabic:  alquran.cloud/v1/surah/{N}/quran-uthmani,  ${TODAY}\n  // Russian: alquran.cloud/v1/surah/{N}/ru.kuliev (Эльмир Кулиев), ${TODAY}\n  // Ingush:  /Ayats/ (пользователь); нет для сур 113–114`;

  const insertion = header + '\n' + lines.join('\n') + '\n';
  const newSrc    = existingSrc.slice(0, closingIdx) + insertion + existingSrc.slice(closingIdx);

  writeFileSync(SOURCES_TS, newSrc, 'utf-8');
  console.log(`\n✅ Done! Added ${added} entries (${skipped} skipped). Updated quran-sources.ts`);
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
