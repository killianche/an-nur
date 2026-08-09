/**
 * Reciter catalog.
 *
 * Оба чтеца имеют пословные тайминги на quran.com, поэтому
 * караоке-подсветка работает для каждого из них на всех 6236 аятах
 * (см. content/quran-segments.ts).
 *
 * Аудио приходит с одного из двух CDN:
 *
 *   - islamic.network — cdn.islamic.network/quran/audio/64/{slug}/{globalAyah}.mp3
 *     короткие mp3 по одному аяту, 64 kbps, сквозная нумерация 1..6236.
 *
 *   - everyayah.com — everyayah.com/data/{everyayahDir}/{SSSAAA}.mp3
 *     то же самое, но нумерация относительно суры (001001.mp3 для 1:1).
 *     Резерв для чтецов, которых islamic.network не раздаёт.
 *
 * Должен быть задан `slug` либо `everyayahDir`; при обоих выигрывает
 * `slug`.  Реальный URL для воспроизведения собирает не этот модуль, а
 * lib/audioSource.ts — он сначала смотрит, не скачан ли аят в память
 * устройства, и только потом падает на CDN.
 *
 * В QuranIng чтецов было восемь (+ Al-Sudais и Maher Al-Muaiqly, снятые
 * ранее).  В QuranRu оставлены двa по решению пользователя: словарь
 * таймингов на восемь чтецов весил 10.5 МБ и был самым тяжёлым чанком
 * приложения.  Чтобы вернуть чтеца, нужно добавить запись сюда и
 * прогнать scripts/gen/fetch-quran-segments.mjs — он дописывает бакет
 * таймингов в content/quran-segments.ts.
 */

export type ReciterId =
  | 'alafasy'
  | 'shaatree';

export type Reciter = {
  id: ReciterId;
  label: string;
  arabic: string;
  /** islamic.network slug — быстрый путь по сквозному номеру аята. */
  slug?: string;
  /** everyayah.com directory name.  Используется, когда нет `slug`.
   *  Путь: https://everyayah.com/data/{everyayahDir}/{SSSAAA}.mp3 */
  everyayahDir?: string;
};

export const RECITERS: Reciter[] = [
  { id: 'alafasy',  label: 'Мишари Аляфаси',    arabic: 'مشاري العفاسي',   slug: 'ar.alafasy'  },
  { id: 'shaatree', label: 'Абу Бакр Аш-Шатри', arabic: 'أبو بكر الشاطري', slug: 'ar.shaatree' },
];

export const DEFAULT_RECITER: ReciterId = 'alafasy';

/** Чтецы, у которых есть пословные тайминги.  Sync-источник истины для
 *  UI-чека (иначе ради одной проверки пришлось бы импортировать весь
 *  словарь QURAN_SEGMENTS в главный чанк).
 *
 *  Сейчас это все чтецы каталога.  Если добавляешь нового — сперва
 *  прогони scripts/gen/fetch-quran-segments.mjs, потом впиши id сюда. */
export const RECITERS_WITH_SEGMENTS: ReadonlySet<ReciterId> = new Set([
  'alafasy', 'shaatree',
]);

export function reciterById(id: ReciterId): Reciter {
  return RECITERS.find(r => r.id === id) ?? RECITERS[0];
}
