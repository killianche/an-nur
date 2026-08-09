#!/usr/bin/env node
/**
 * download-juz-amma-audio.mjs
 *
 * Downloads Mishary Alafasy mp3 files for surahs 78–114 (Juz Amma) from
 * cdn.islamic.network and writes them to web/public/audio/{globalN}.mp3.
 *
 * Skips files that already exist (safe to re-run after interruption).
 * Uses the same globalAyahNumber logic as web/src/lib/quranUtils.ts.
 *
 * Run: node scripts/download-juz-amma-audio.mjs
 * Requires: Node 18+
 */

import { existsSync, createWriteStream, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const AUDIO_DIR = resolve(ROOT, 'web/public/audio');

mkdirSync(AUDIO_DIR, { recursive: true });

// Must match AYAHS_PER_SURAH in web/src/lib/quranUtils.ts exactly
const AYAHS_PER_SURAH = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
  59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
  52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
  21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
];

function globalAyahNumber(surah, ayah) {
  let g = ayah;
  for (let i = 1; i < surah; i++) g += AYAHS_PER_SURAH[i - 1];
  return g;
}

const CDN = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy';
// Note: using 128kbps for better quality (self-hosted, worth the extra size)

const SURAHS = Array.from({ length: 37 }, (_, i) => 78 + i); // 78–114
const CONCURRENCY = 4; // parallel downloads
const MAX_RETRIES  = 3;

// Build full list of (globalN, surah, ayah) to download
const tasks = [];
for (const s of SURAHS) {
  const count = AYAHS_PER_SURAH[s - 1];
  for (let a = 1; a <= count; a++) {
    tasks.push({ surah: s, ayah: a, n: globalAyahNumber(s, a) });
  }
}

console.log(`Total ayahs to download: ${tasks.length}`);

async function downloadOne(task, attempt = 0) {
  const { n, surah, ayah } = task;
  const dest = resolve(AUDIO_DIR, `${n}.mp3`);
  if (existsSync(dest)) return 'skip';

  const url = `${CDN}/${n}.mp3`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ws = createWriteStream(dest);
    await pipeline(res.body, ws);
    return 'ok';
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      return downloadOne(task, attempt + 1);
    }
    console.error(`  ✗ Failed ${n}.mp3 (${surah}:${ayah}): ${err.message}`);
    return 'fail';
  }
}

async function runWithConcurrency(tasks, concurrency) {
  let idx = 0;
  let done = 0, skipped = 0, failed = 0;
  const start = Date.now();

  async function worker() {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      const result = await downloadOne(task);
      if (result === 'skip') skipped++;
      else if (result === 'ok') done++;
      else failed++;

      const total = done + skipped + failed;
      if (total % 20 === 0 || total === tasks.length) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        process.stdout.write(
          `\r  ${total}/${tasks.length} | ✓ ${done} downloaded | ⊘ ${skipped} skipped | ✗ ${failed} failed | ${elapsed}s`
        );
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log(''); // newline after progress
  return { done, skipped, failed };
}

async function main() {
  console.log(`Downloading to: ${AUDIO_DIR}`);
  console.log(`CDN: ${CDN}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const { done, skipped, failed } = await runWithConcurrency(tasks, CONCURRENCY);

  console.log(`\n✅ Complete! ${done} downloaded, ${skipped} already existed, ${failed} failed`);
  if (failed > 0) {
    console.log('Re-run the script to retry failed files.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
