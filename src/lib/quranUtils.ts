import { reciterById, DEFAULT_RECITER, type ReciterId } from './reciters';
import { localAyahSrc } from './audioStore';
import { globalAyahNumber } from './ayahNumbering';

// Таблица длин сур и globalAyahNumber переехали в lib/ayahNumbering.ts —
// листовой модуль без импортов.  Иначе получался цикл
// quranUtils → audioStore → quranUtils: разрешение URL спрашивает
// реестр скачанного, а реестру нужен сквозной номер аята.
export { globalAyahNumber, ayahsInSurah, TOTAL_AYAHS } from './ayahNumbering';

/**
 * Build the playback URL for one ayah.
 *
 * Four sources, in priority order:
 *
 *   0. Скачано в память устройства (audioStore) — пользователь нажал
 *      «Скачать» в настройках.  Работает только в нативной обёртке и
 *      только для аятов ниже «планки» скачанного; проверка
 *      синхронная, см. шапку lib/audioStore.ts.
 *
 *   1. Раньше вторым источником был локальный origin — 594 mp3 сур
 *      67–114, лежавшие прямо в пакете.  Снято: тот же материал
 *      приезжает докачкой, а в пакете он весил 53 МБ и дублировал
 *      то, что автозагрузка кладёт в Library/NoCloud.
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
  const offline = localAyahSrc(surah, ayah, reciter);
  if (offline) return offline;
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
