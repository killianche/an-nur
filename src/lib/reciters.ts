/**
 * Reciter catalog — every entry has word-by-word segment data on
 * quran.com (so karaoke highlight works during playback).  Audio
 * comes from one of two CDNs depending on availability:
 *
 *   - islamic.network — cdn.islamic.network/quran/audio/64/{slug}/{globalAyah}.mp3
 *     short per-ayah mp3 clips, 64 kbps, global-ayah numbering 1..6236.
 *
 *   - everyayah.com — everyayah.com/data/{everyayahDir}/{SSSAAA}.mp3
 *     short per-ayah mp3 clips, surah-relative padded (e.g. 001001.mp3
 *     for 1:1, 002255.mp3 for 2:255).  Hosts a much wider catalog —
 *     used for reciters that islamic.network doesn't carry.
 *
 * Either `slug` or `everyayahDir` (or both) must be set; `slug` wins
 * when both are present (matches our historic islamic.network default).
 *
 * Removed: 'sudais' (Abdul Rahman Al-Sudais — user pref) and
 * 'mahermuaiqly' (Maher Al-Muaiqly — user pref AND quran.com has no
 * segment data for him, so the karaoke marker stayed put anyway).
 * Both also dropped from RECITER_MAP in scripts/fetch-quran-segments.mjs.
 */

export type ReciterId =
  | 'alafasy'
  | 'shaatree'
  | 'husary'
  | 'abdulbasit'
  | 'hanirifai'
  | 'shuraim'
  | 'yasser'
  | 'tunaiji';

export type Reciter = {
  id: ReciterId;
  label: string;
  arabic: string;
  /** islamic.network slug. Present for the historical 4 reciters that
   *  ship on islamic.network too — the global-ayah URL scheme is faster
   *  to look up. */
  slug?: string;
  /** everyayah.com directory name.  Used when `slug` is absent.  Path:
   *  https://everyayah.com/data/{everyayahDir}/{SSSAAA}.mp3 */
  everyayahDir?: string;
};

export const RECITERS: Reciter[] = [
  { id: 'alafasy',    label: 'Mishary Alafasy',         arabic: 'مشاري العفاسي',        slug: 'ar.alafasy' },
  { id: 'shaatree',   label: 'Abu Bakr Al-Shatri',      arabic: 'أبو بكر الشاطري',      slug: 'ar.shaatree' },
  { id: 'husary',     label: 'Mahmoud Al-Husary',       arabic: 'محمود خليل الحصري',    slug: 'ar.husary' },
  { id: 'abdulbasit', label: 'Abdul Basit Abdul Samad', arabic: 'عبد الباسط عبد الصمد', slug: 'ar.abdulbasitmurattal' },
  // ── everyayah.com-sourced reciters with quran.com segment coverage ──
  { id: 'hanirifai',  label: 'Hani Ar-Rifai',           arabic: 'هاني الرفاعي',          everyayahDir: 'Hani_Rifai_64kbps' },
  { id: 'shuraim',    label: 'Saud Al-Shuraim',         arabic: 'سعود الشريم',           everyayahDir: 'Saood_ash-Shuraym_64kbps' },
  { id: 'yasser',     label: 'Yasser Al-Dosari',        arabic: 'ياسر الدوسري',           everyayahDir: 'Yasser_Ad-Dussary_128kbps' },
  { id: 'tunaiji',    label: 'Khalifah Al-Tunaiji',     arabic: 'خليفة الطنيجي',          everyayahDir: 'khalefa_al_tunaiji_64kbps' },
];

export const DEFAULT_RECITER: ReciterId = 'alafasy';

/** Reciter'ы, у которых quran.com даёт word-level segment-тайминги.
 *  Sync-источник истины для UI-чека (раньше HighlightCard импортил
 *  весь 10-МБ QURAN_SEGMENTS только чтобы проверить ключ).
 *
 *  Сейчас все 8 чтецов в RECITERS имеют segments — Maher Al-Muaiqly
 *  и Al-Sudais были удалены из каталога ровно потому, что у них их нет.
 *  Если добавляешь нового — сначала прогони scripts/fetch-quran-segments.mjs,
 *  потом добавь id сюда. */
export const RECITERS_WITH_SEGMENTS: ReadonlySet<ReciterId> = new Set([
  'alafasy', 'shaatree', 'husary', 'abdulbasit',
  'hanirifai', 'shuraim', 'yasser', 'tunaiji',
]);

export function reciterById(id: ReciterId): Reciter {
  return RECITERS.find(r => r.id === id) ?? RECITERS[0];
}

/** Legacy helper — kept for callers that only need the islamic.network
 *  slug.  Returns the first reciter's slug as a fallback when the
 *  requested reciter is everyayah-only; that path is no longer used by
 *  ayahAudioUrl (which inspects the full Reciter object). */
export function reciterSlug(id: ReciterId): string {
  return reciterById(id).slug ?? RECITERS[0].slug ?? 'ar.alafasy';
}
