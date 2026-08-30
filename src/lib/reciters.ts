/**
 * Reciter catalog.
 *
 * Чтецы из RECITERS_WITH_SEGMENTS имеют пословные тайминги на quran.com,
 * поэтому караоке-подсветка работает для них на всех доступных аятах
 * (см. content/quran-segments.ts).
 *
 * Аудио приходит с одного из четырёх источников:
 *
 *   - islamic.network — cdn.islamic.network/quran/audio/64/{slug}/{globalAyah}.mp3
 *     короткие mp3 по одному аяту, 64 kbps, сквозная нумерация 1..6236.
 *
 *   - everyayah.com — everyayah.com/data/{everyayahDir}/{SSSAAA}.mp3
 *     то же самое, но нумерация относительно суры (001001.mp3 для 1:1).
 *     Резерв для чтецов, которых islamic.network не раздаёт.
 *
 *   - собственный сервер — {ayahAudioBase}/{SSS}/{AAA}.mp3
 *     заранее подготовленные короткие файлы отдельных аятов. Такой путь
 *     используется для Люхайдана: приложение сразу открывает выбранный
 *     аят, а не загружает и не перематывает большой файл всей суры.
 *
 *   - mp3quran.net — serverN.mp3quran.net/{dir}/{SSS}.mp3
 *     запись целой суры. Для такого источника приложение вырезает нужный
 *     аят по локальной таблице границ и не делает вид, будто это отдельный
 *     поаятный файл.
 *
 * Должен быть задан `ayahAudioBase`, `slug` либо `everyayahDir`; при
 * нескольких вариантах выигрывает `ayahAudioBase`, затем `slug`.
 * Реальный URL для воспроизведения сначала ищет скачанный аят в памяти
 * устройства и только затем обращается к удалённому источнику.
 *
 * В QuranIng чтецов было восемь (+ Al-Sudais и Maher Al-Muaiqly, снятые
 * ранее).  В QuranRu список держим намеренно коротким: словарь таймингов
 * на восемь чтецов весил 10.5 МБ и был самым тяжёлым чанком приложения.
 * Чтобы вернуть чтеца, нужно добавить запись сюда и
 * прогнать scripts/gen/fetch-quran-segments.mjs — он дописывает бакет
 * таймингов в content/quran-segments.ts.
 */

export type ReciterId =
  | 'alafasy'
  | 'shaatree'
  | 'yasser'
  | 'luhaidan'
  | 'ajmi';

export type Reciter = {
  id: ReciterId;
  label: string;
  arabic: string;
  /** Битрейт источника — нужен для честной оценки офлайн-загрузки. */
  bitrateKbps: 64 | 128;
  /** islamic.network slug — быстрый путь по сквозному номеру аята. */
  slug?: string;
  /** everyayah.com directory name.  Используется, когда нет `slug`.
   *  Путь: https://everyayah.com/data/{everyayahDir}/{SSSAAA}.mp3 */
  everyayahDir?: string;
  /** Base URL отдельных файлов аятов.
   *  Путь: {ayahAudioBase}/{SSS}/{AAA}.mp3 */
  ayahAudioBase?: string;
  /** Base URL непрерывной записи по одной полной суре. Используется как
   *  основной поток только у чтецов без отдельных файлов каждого аята. */
  surahAudioBase?: string;
  /** Имя файла суры: 001.mp3 вместо 1.mp3. */
  surahAudioPadded?: boolean;
};

export const RECITERS: Reciter[] = [
  {
    id: 'alafasy', label: 'Мишари Аляфаси', arabic: 'مشاري العفاسي',
    bitrateKbps: 64, slug: 'ar.alafasy',
    surahAudioBase: 'https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal',
  },
  {
    id: 'shaatree', label: 'Абу Бакр Аш-Шатри', arabic: 'أبو بكر الشاطري',
    bitrateKbps: 64, slug: 'ar.shaatree',
    surahAudioBase: 'https://download.quranicaudio.com/qdc/abu_bakr_shatri/murattal',
  },
  {
    id: 'yasser',
    label: 'Ясир Ад-Даусари',
    arabic: 'ياسر الدوسري',
    bitrateKbps: 128,
    everyayahDir: 'Yasser_Ad-Dussary_128kbps',
    surahAudioBase: 'https://download.quranicaudio.com/quran/yasser_ad-dussary',
    surahAudioPadded: true,
  },
  {
    id: 'luhaidan',
    label: 'Мухаммад Аль-Люхайдан',
    arabic: 'محمد اللحيدان',
    bitrateKbps: 128,
    ayahAudioBase: 'https://l.asrbook.ru/audio/luhaidan',
    surahAudioBase: 'https://server8.mp3quran.net/lhdan',
    surahAudioPadded: true,
  },
  {
    id: 'ajmi',
    label: 'Ахмад Аль-Аджми',
    arabic: 'أحمد بن علي العجمي',
    bitrateKbps: 128,
    everyayahDir: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
    surahAudioBase: 'https://download.quranicaudio.com/quran/ahmed_ibn_3ali_al-3ajamy',
    surahAudioPadded: true,
  },
];

export const DEFAULT_RECITER: ReciterId = 'alafasy';

/** Чтецы, у которых есть пословные тайминги.  Sync-источник истины для
 *  UI-чека (иначе ради одной проверки пришлось бы импортировать весь
 *  словарь QURAN_SEGMENTS в главный чанк).
 *
 *  Сейчас это чтецы каталога с проверенными пословными сегментами. Если
 *  добавляешь нового — сперва
 *  прогони scripts/gen/fetch-quran-segments.mjs, потом впиши id сюда. */
export const RECITERS_WITH_SEGMENTS: ReadonlySet<ReciterId> = new Set([
  'alafasy', 'shaatree', 'yasser',
]);

/** У Люхайдана и Аль-Аджми есть точные границы каждого аята, но нет
 * честных пословных сегментов. Вместо ложного караоке интерфейс отмечает
 * весь звучащий аят одной мягкой подложкой. */
export function usesWholeAyahHighlight(id: ReciterId): boolean {
  return id === 'luhaidan' || id === 'ajmi';
}

/** Поаятное офлайн-хранилище принимает только отдельные mp3 каждого аята. */
export function supportsAyahOffline(id: ReciterId): boolean {
  const reciter = reciterById(id);
  return Boolean(reciter.ayahAudioBase || reciter.slug || reciter.everyayahDir);
}

/** Нужен ли для запуска выбранного аята большой файл всей суры.
 *
 * Если у чтеца есть отдельные MP3 аятов, холодный старт всегда идёт из
 * короткого файла выбранного аята. Это особенно важно в середине длинной
 * Аль-Бакары: браузеру не приходится открывать и перематывать 100+ МБ.
 * Посурный поток остаётся только fallback для будущего чтеца без
 * поаятного источника. */
export function requiresSurahAudioStream(id: ReciterId): boolean {
  const reciter = reciterById(id);
  const hasPerAyahSource = Boolean(
    reciter.ayahAudioBase || reciter.slug || reciter.everyayahDir,
  );
  return Boolean(reciter.surahAudioBase) && !hasPerAyahSource;
}

export function surahAudioUrl(id: ReciterId, surah: number): string | null {
  const reciter = reciterById(id);
  if (!reciter.surahAudioBase) return null;
  const filename = reciter.surahAudioPadded
    ? String(surah).padStart(3, '0')
    : String(surah);
  return `${reciter.surahAudioBase}/${filename}.mp3`;
}

export function reciterById(id: ReciterId): Reciter {
  return RECITERS.find(r => r.id === id) ?? RECITERS[0];
}
