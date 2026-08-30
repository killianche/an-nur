#!/usr/bin/env node
/**
 * Split Muhammad Al-Luhaidan's official MP3Quran full-surah recordings into
 * short ayah files using the checked-in timing table.
 *
 * The script deliberately processes one surah at a time and removes its source
 * after a successful split. The complete 1.35 GB source archive therefore is
 * never duplicated on disk next to the generated ayah set.
 *
 * Requirements: curl, ffmpeg, ffprobe, Node.js with type stripping.
 *
 * Run:
 *   node --experimental-strip-types --no-warnings \
 *     scripts/gen/split-luhaidan-ayahs.mjs --output /absolute/output/path
 *
 * Optional:
 *   --from 1 --to 114
 *
 * Output:
 *   {output}/{SSS}/{AAA}.mp3, for example 002/255.mp3.
 */

import { chmodSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { LUHAIDAN_AYAH_RANGES_MS } from '../../src/content/luhaidan-ayah-ranges.ts';

const SOURCE_BASE = 'https://server8.mp3quran.net/lhdan';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 114) {
    throw new Error(`${label} must be an integer from 1 to 114`);
  }
  return parsed;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr?.trim() ?? ''}` : '';
    throw new Error(`${command} exited with ${result.status}${detail}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

const outputArgument = argument('--output');
if (!outputArgument) throw new Error('Required argument: --output /absolute/path');

const outputRoot = resolve(outputArgument);
const fromSurah = positiveInteger(argument('--from', '1'), '--from');
const toSurah = positiveInteger(argument('--to', '114'), '--to');
if (fromSurah > toSurah) throw new Error('--from cannot be greater than --to');

mkdirSync(outputRoot, { recursive: true });
chmodSync(outputRoot, 0o755);

for (let surah = fromSurah; surah <= toSurah; surah++) {
  const ranges = LUHAIDAN_AYAH_RANGES_MS[surah];
  if (!ranges?.length) throw new Error(`No ranges for surah ${surah}`);

  const surahCode = pad3(surah);
  const surahDir = resolve(outputRoot, surahCode);
  const sourcePath = resolve(outputRoot, `.source-${surahCode}.mp3`);
  mkdirSync(surahDir, { recursive: true });
  chmodSync(surahDir, 0o755);

  const complete = ranges.every((_, index) => {
    try {
      return statSync(resolve(surahDir, `${pad3(index + 1)}.mp3`)).size > 512;
    } catch {
      return false;
    }
  });
  if (complete) {
    console.log(`Luhaidan ${surahCode}: already complete (${ranges.length} ayahs)`);
    continue;
  }

  console.log(`Luhaidan ${surahCode}: downloading full surah`);
  run('curl', [
    '--fail', '--location', '--retry', '4', '--retry-all-errors',
    '--connect-timeout', '20', '--output', sourcePath,
    `${SOURCE_BASE}/${surahCode}.mp3`,
  ]);

  const durationSeconds = Number.parseFloat(run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', sourcePath,
  ], { capture: true }));
  const finalEndSeconds = ranges[ranges.length - 1][1] / 1000;
  if (!Number.isFinite(durationSeconds) || durationSeconds + 1 < finalEndSeconds) {
    throw new Error(
      `Surah ${surah}: source duration ${durationSeconds}s is shorter than timing ${finalEndSeconds}s`,
    );
  }

  for (let index = 0; index < ranges.length; index++) {
    const ayah = index + 1;
    const outputPath = resolve(surahDir, `${pad3(ayah)}.mp3`);
    try {
      if (statSync(outputPath).size > 512) continue;
    } catch {
      // Missing output is the normal path.
    }

    const [startMs, endMs] = ranges[index];
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-ss', (startMs / 1000).toFixed(3),
      '-i', sourcePath,
      '-t', ((endMs - startMs) / 1000).toFixed(3),
      '-map', '0:a:0', '-c:a', 'copy', '-map_metadata', '-1',
      '-id3v2_version', '3', '-write_xing', '1', '-y', outputPath,
    ]);
    if (statSync(outputPath).size <= 512) {
      throw new Error(`Surah ${surah}, ayah ${ayah}: generated file is empty`);
    }
    chmodSync(outputPath, 0o644);
    if (ayah % 25 === 0 || ayah === ranges.length) {
      console.log(`Luhaidan ${surahCode}: ${ayah}/${ranges.length}`);
    }
  }

  rmSync(sourcePath, { force: true });
  console.log(`Luhaidan ${surahCode}: complete`);
}

console.log(`Luhaidan ayah audio written to ${outputRoot}`);
