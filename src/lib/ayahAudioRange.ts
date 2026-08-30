import { LUHAIDAN_AYAH_RANGES_MS } from '../content/luhaidan-ayah-ranges';
import { QURANCOM_AYAH_RANGES_MS } from '../content/qurancom-ayah-ranges';
import type { ReciterId } from './reciters';

export type AyahAudioRange = {
  startSeconds: number;
  endSeconds: number;
};

/**
 * Physical range of an ayah inside a full-surah recording.
 *
 * Границы Люхайдана получены из MP3Quran и используются генератором для
 * воспроизводимой нарезки официальных посурных записей на короткие файлы.
 * В рантайме короткий файл играет от начала до своей фактической длины;
 * таблица остаётся источником истины для генерации и проверки набора.
 * Для остальных чтецов границы получены из Quran.com.
 */
export function ayahAudioRange(
  reciter: ReciterId,
  surah: number,
  ayah: number,
): AyahAudioRange | null {
  const range = reciter === 'luhaidan'
    ? LUHAIDAN_AYAH_RANGES_MS[surah]?.[ayah - 1]
    : QURANCOM_AYAH_RANGES_MS[reciter]?.[surah]?.[ayah - 1];
  if (!range) return null;
  const [startMs, endMs] = range;
  if (startMs < 0 || endMs <= startMs) return null;
  return { startSeconds: startMs / 1000, endSeconds: endMs / 1000 };
}
