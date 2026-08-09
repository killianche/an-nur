#!/usr/bin/env node
/**
 * check-sacred-text.mjs — guard, что сакральный арабский в проверенных
 * местах не сломан случайной правкой build_json.py / редактором /
 * normalize-pass'ом.
 *
 * Что проверяет: указанные в `sacred-snapshots.json` строки сравниваются
 * посимвольно с тем, что реально лежит в JSON-источниках.  Любое
 * расхождение — exit 1.
 *
 * Использование:
 *   node web/scripts/check-sacred-text.mjs
 *   (или npm run check:sacred)
 *
 * Когда снапшоты ОБНОВЛЯТЬ: только после ручной сверки с
 * mcp.quran.ai / quran.com / у источника-аналога.  НЕ автоматически.
 * Если build_json.py изменил normalize-pass — сначала вручную
 * убедиться, что новый текст идентичен mushaf-эталону, потом
 * обновить snapshot вручную.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Скрипт лежит в <корень проекта>/scripts/, поэтому корень — на уровень выше.
// (В исходном QuranIng приложение жило в подпапке web/ и здесь было '../..'.)
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const snapshotsPath = resolve(__dirname, 'sacred-snapshots.json');
const snapshots = JSON.parse(readFileSync(snapshotsPath, 'utf8'));

const failures = [];

for (const snap of snapshots) {
  const sourcePath = resolve(ROOT, snap.source);
  let data;
  try {
    data = JSON.parse(readFileSync(sourcePath, 'utf8'));
  } catch (e) {
    failures.push(`  ✗ ${snap.id}: не смог прочитать ${snap.source}: ${e.message}`);
    continue;
  }

  // Navigate to the entry: data.entries[?].id === snap.id, потом snap.field
  const entries = data.entries || data; // azkar.json has .entries, verses.json — array
  const entry = Array.isArray(entries)
    ? entries.find(e => e.id === snap.id || `${e.surah}:${e.ayah}` === snap.id || e.verse_key === snap.id)
    : null;

  if (!entry) {
    failures.push(`  ✗ ${snap.id}: запись не найдена в ${snap.source}`);
    continue;
  }

  const actual = entry[snap.field];
  if (actual !== snap.expected) {
    failures.push(`  ✗ ${snap.id}.${snap.field}: расхождение!\n` +
      `      expected: ${JSON.stringify(snap.expected).slice(0, 120)}\n` +
      `      actual:   ${JSON.stringify(actual ?? null).slice(0, 120)}`);
    continue;
  }
}

if (failures.length > 0) {
  console.error(`\n❌ Sacred-text snapshot failed (${failures.length}/${snapshots.length}):\n`);
  for (const f of failures) console.error(f);
  console.error(
    `\nЧТО ДЕЛАТЬ:\n` +
    `  1. ВЕРНИ оригинальный текст из mcp.quran.ai / quran.com.\n` +
    `  2. Если новый текст реально верный (а snapshot устарел) — ОБНОВИ\n` +
    `     web/scripts/sacred-snapshots.json вручную, после сверки с источником.\n`
  );
  process.exit(1);
}

console.log(`✓ Sacred text snapshot OK (${snapshots.length} verses).`);
