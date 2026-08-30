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
 * Sources, in priority order:
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
 *   2. Собственный сервер — reciters with an `ayahAudioBase` (Luhaidan).
 *      Files are pre-split from the official full-surah recording using
 *      the checked-in exact ayah boundaries: 2:255 → 002/255.mp3.
 *
 *   3. islamic.network — reciters with a `slug` (Alafasy / Shaatree).
 *      Uses the global ayah number 1..6236.
 *      64 kbps mp3, well-cached, fast.
 *
 *   4. everyayah.com — reciters with an `everyayahDir` (сейчас
 *      Yasser Ad-Dussary и Ahmad Al-Ajmi). Uses
 *      surah-relative padded numbering: 1:1 → 001001.mp3, 2:255 →
 *      002255.mp3.  Covers reciters that islamic.network doesn't
 *      carry, and matches the dataset our word-segment timings come
 *      from (quran.com / everyayah.com share recitations).
 *
 *   5. Полная сура — резерв для будущего чтеца без отдельных файлов.
 */
function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

export function ayahAudioUrl(surah: number, ayah: number, reciter: ReciterId = DEFAULT_RECITER): string {
  const offline = localAyahSrc(surah, ayah, reciter);
  if (offline) return offline;
  return remoteAyahAudioUrl(surah, ayah, reciter);
}

/** Сетевой URL без проверки локального кэша — используется загрузчиком. */
export function remoteAyahAudioUrl(surah: number, ayah: number, reciter: ReciterId = DEFAULT_RECITER): string {
  const r = reciterById(reciter);
  if (r.ayahAudioBase) {
    return `${r.ayahAudioBase}/${pad3(surah)}/${pad3(ayah)}.mp3`;
  }
  if (r.slug) {
    return `https://cdn.islamic.network/quran/audio/64/${r.slug}/${globalAyahNumber(surah, ayah)}.mp3`;
  }
  if (r.everyayahDir) {
    return `https://everyayah.com/data/${r.everyayahDir}/${pad3(surah)}${pad3(ayah)}.mp3`;
  }
  if (r.surahAudioBase) {
    return `${r.surahAudioBase}/${pad3(surah)}.mp3`;
  }
  // Fallback — never reached for whitelisted ReciterId, but keeps the
  // signature total in case a config drifts.  Default to Alafasy on
  // islamic.network.
  return `https://cdn.islamic.network/quran/audio/64/ar.alafasy/${globalAyahNumber(surah, ayah)}.mp3`;
}
