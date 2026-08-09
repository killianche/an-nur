import { reciterById, DEFAULT_RECITER, type ReciterId } from './reciters';
import { SURAHS_WITH_LOCAL_AUDIO } from '../content/surahs';

// Количество аятов в каждой суре (1–114)
const AYAHS_PER_SURAH = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
  59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
  52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
  21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
];

export function globalAyahNumber(surah: number, ayah: number): number {
  let g = ayah;
  for (let i = 1; i < surah; i++) g += AYAHS_PER_SURAH[i - 1];
  return g;
}

/**
 * Build the playback URL for one ayah.
 *
 * Three sources, in priority order:
 *
 *   1. Local origin — only for the default reciter (Alafasy) on surahs
 *      whose mp3s we ship in the bundle (SURAHS_WITH_LOCAL_AUDIO).
 *      Removes iOS Safari Range / CORS / UA-throttling issues, gives
 *      instant playback once the asset is in the SW cache, and avoids
 *      a TLS handshake against the CDN.
 *      Earlier this gate was keyed off SURAHS_WITH_CONTENT — but we
 *      expanded that set to all 114 surahs (so word-level segments
 *      cover everything), while the local mp3 inventory still only
 *      covers surahs 67-114.  The mismatch turned every play() in
 *      surahs 1-66 into an instant 404 on `/audio/N.mp3` followed by
 *      a panicked queue-cascade.  Splitting the gates fixes that —
 *      local audio is a strict subset of shipped content, and the
 *      two lists evolve independently.
 *
 *   2. islamic.network — reciters with a `slug` (Alafasy / Shaatree /
 *      Husary / AbdulBasit).  Uses the global ayah number 1..6236.
 *      64 kbps mp3, well-cached, fast.
 *
 *   3. everyayah.com — reciters with an `everyayahDir` (Hani Ar-Rifai,
 *      Saud Al-Shuraim, Yasser Al-Dosari, Khalifah Al-Tunaiji).  Uses
 *      surah-relative padded numbering: 1:1 → 001001.mp3, 2:255 →
 *      002255.mp3.  Covers reciters that islamic.network doesn't
 *      carry, and matches the dataset our word-segment timings come
 *      from (quran.com / everyayah.com share recitations).
 */
function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

export function ayahAudioUrl(surah: number, ayah: number, reciter: ReciterId = DEFAULT_RECITER): string {
  if (reciter === 'alafasy' && SURAHS_WITH_LOCAL_AUDIO.has(surah)) {
    return `/audio/${globalAyahNumber(surah, ayah)}.mp3`;
  }
  const r = reciterById(reciter);
  if (r.slug) {
    return `https://cdn.islamic.network/quran/audio/64/${r.slug}/${globalAyahNumber(surah, ayah)}.mp3`;
  }
  if (r.everyayahDir) {
    return `https://everyayah.com/data/${r.everyayahDir}/${pad3(surah)}${pad3(ayah)}.mp3`;
  }
  // Fallback — never reached for whitelisted ReciterId, but keeps the
  // signature total in case a config drifts.  Default to Alafasy on
  // islamic.network.
  return `https://cdn.islamic.network/quran/audio/64/ar.alafasy/${globalAyahNumber(surah, ayah)}.mp3`;
}
