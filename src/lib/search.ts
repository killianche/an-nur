/**
 * Поиск по Корану: по названиям сур и по тексту русского перевода.
 *
 * ── Почему без индекса ────────────────────────────────────────────────
 *
 * Соблазн — построить инвертированный индекс слов при старте.  Но это
 * ~6236 аятов, около 900 тысяч символов: линейный проход с
 * `indexOf` укладывается в единицы миллисекунд даже на телефоне, а
 * индекс стоил бы времени на старте, памяти и кода, который надо
 * поддерживать.  Меряем, а не угадываем: если поиск начнёт тормозить
 * на реальном устройстве — тогда и появится причина для индекса.
 *
 * Что важнее скорости — качество совпадений:
 *
 *  • Регистр не важен.
 *  • «Ё» и «е» считаются одной буквой.  Кулиев пишет «Её», человек
 *    ищет «ее» — без этого половина запросов молча ничего не находит.
 *  • Знаки препинания в запросе игнорируются, несколько пробелов
 *    схлопываются: «Господу миров» найдётся и как «господу,  миров».
 *
 * ── Ранжирование ──────────────────────────────────────────────────────
 *
 * Совпадение с начала слова ценнее совпадения внутри слова: по запросу
 * «раб» человек ищет «рабов», а не «арабов».  Дальше — по порядку
 * следования в Коране, чтобы выдача была предсказуемой и не прыгала.
 */

import { getQuranSources, loadQuranSources } from '../content/quran-sources-lazy';
import { SURAHS, SURAH_BY_NUMBER, type SurahMeta } from '../content/surahs';
import { globalAyahNumber } from './ayahNumbering';

/** Максимум результатов по аятам.  Больше человек всё равно не
 *  просмотрит, а рендер длинного списка стоит заметно. */
const MAX_AYAH_HITS = 60;

/** Минимальная длина запроса для поиска по переводу.  На одной-двух
 *  буквах совпадёт половина Корана — это не результат, а шум. */
const MIN_QUERY_FOR_TEXT = 3;

export type AyahHit = {
  surah: number;
  ayah: number;
  /** Название суры для подписи результата. */
  surahTitle: string;
  /** Полный текст перевода — фрагмент вырезает уже компонент. */
  text: string;
  /** Позиция совпадения в исходном тексте. */
  matchStart: number;
  matchEnd: number;
};

export type SearchResult = {
  surahs: SurahMeta[];
  ayahs: AyahHit[];
  /** Совпадений по переводу больше, чем показано. */
  truncated: boolean;
  /** Запрос слишком короткий — по переводу не искали. */
  tooShortForText: boolean;
  /**
   * Словарь переводов ещё не догружен, по тексту не искали.
   *
   * quran-sources весит 3.7 МБ и грузится отдельным чанком, чтобы не
   * задерживать старт приложения. Экран поиска обязан показать это
   * состояние явно, а не пустую выдачу: «ничего не нашлось» и «ещё не
   * готово» — разные ответы.
   */
  notReady: boolean;
};

/** Приведение к сравнимому виду: нижний регистр, ё→е, пунктуация в
 *  пробелы, схлопывание пробелов. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Нормализованная копия перевода каждого аята + карта позиций обратно
 * в исходную строку.
 *
 * Зачем карта: искать надо по нормализованному тексту (без запятых,
 * с «е» вместо «ё»), а подсвечивать — в оригинале, иначе пользователь
 * увидит покалеченную цитату вместо перевода.  Длины строк не
 * совпадают, поэтому храним для каждой позиции нормализованного текста
 * соответствующий индекс в исходном.
 *
 * Строится лениво при первом поиске: на старте приложения он не нужен.
 */
type Prepared = {
  key: string;
  surah: number;
  ayah: number;
  original: string;
  norm: string;
  /** norm[i] пришёл из original[map[i]] */
  map: Int32Array;
};

let prepared: Prepared[] | null = null;

/** Прогреть словарь переводов. Вызывать до первого search() по тексту. */
export function ensureSearchReady(): Promise<unknown> {
  return loadQuranSources();
}

function prepare(sources: Record<string, { surah: number; ayah: number; translations: { ru?: string } }>): Prepared[] {
  if (prepared) return prepared;
  const out: Prepared[] = [];
  for (const [key, src] of Object.entries(sources)) {
    const original = src.translations.ru;
    if (!original) continue;
    const lower = original.toLowerCase().replace(/ё/g, 'е');
    // Ручной проход вместо replace: нужна карта позиций.
    let norm = '';
    const map = new Int32Array(lower.length);
    let lastWasSpace = true;   // ведущие пробелы съедаем
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      const isWord = /[\p{L}\p{N}]/u.test(ch);
      if (isWord) {
        map[norm.length] = i;
        norm += ch;
        lastWasSpace = false;
      } else if (!lastWasSpace) {
        map[norm.length] = i;
        norm += ' ';
        lastWasSpace = true;
      }
    }
    norm = norm.trimEnd();
    out.push({ key, surah: src.surah, ayah: src.ayah, original, norm, map });
  }
  // Порядок мусхафа — выдача должна идти сверху вниз по Корану.
  out.sort((a, b) =>
    globalAyahNumber(a.surah, a.ayah) - globalAyahNumber(b.surah, b.ayah));
  prepared = out;
  return out;
}

/** Поиск сур по номеру, транслитерации, переводу названия и арабскому. */
function searchSurahs(raw: string, norm: string): SurahMeta[] {
  if (!norm) return [];
  const asNumber = parseInt(raw, 10);
  return SURAHS.filter(s => {
    if (Number.isInteger(asNumber) && String(s.number) === raw.trim()) return true;
    return normalise(s.transliteration).includes(norm)
      || normalise(s.russian).includes(norm)
      || s.arabic.includes(raw.trim());
  });
}

export type SearchOptions = {
  /**
   * Искать только внутри одной суры.  Нужен для поиска из экрана
   * чтения: человек уже читает конкретную суру, и «найти у себя»
   * — самый частый запрос.  В этом режиме поиск по названиям сур
   * не выполняется: искать сам себя бессмысленно.
   */
  surah?: number;
};

/**
 * Основной поиск.  Возвращает и суры, и аяты — экран решает, что
 * показать.
 */
export function search(raw: string, opts: SearchOptions = {}): SearchResult {
  const norm = normalise(raw);
  const empty: SearchResult = {
    surahs: [], ayahs: [], truncated: false, tooShortForText: false, notReady: false,
  };
  if (!norm) return empty;

  const scoped = opts.surah != null;
  const surahs = scoped ? [] : searchSurahs(raw, norm);

  if (norm.replace(/\s/g, '').length < MIN_QUERY_FOR_TEXT) {
    return { surahs, ayahs: [], truncated: false, tooShortForText: true, notReady: false };
  }

  // Поиск по названиям сур работает всегда: SURAHS лежит в главном чанке.
  // По переводу ищем только когда словарь доехал.
  const sources = getQuranSources();
  if (!sources) {
    return { surahs, ayahs: [], truncated: false, tooShortForText: false, notReady: true };
  }

  /*
   * Один список, а не два.
   *
   * Раньше совпадения делились на «с начала слова» и «внутри слова» и
   * склеивались как `[...strong, ...weak]`.  Внутри каждого списка
   * порядок мусхафа соблюдался, но склейка его рвала: аят из 2-й суры,
   * где слово нашлось внутри другого, оказывался ниже аята из 27-й.
   * Человек читает выдачу как оглавление — она обязана идти сверху
   * вниз по Корану.
   *
   * Отдельная сортировка не нужна: `prepare()` уже отдаёт аяты в
   * порядке мусхафа, и мы идём по ним подряд.
   */
  const hits: AyahHit[] = [];
  let total = 0;
  // Вышли ли из цикла досрочно.  Без этого флага «обрезано» считалось
  // как total > показанных, а при досрочном выходе total равен числу
  // показанных — и признак молча терялся ровно в том случае, ради
  // которого он и нужен.  Поймано тестом.
  let stoppedEarly = false;

  for (const p of prepare(sources)) {
    if (scoped && p.surah !== opts.surah) continue;
    const at = p.norm.indexOf(norm);
    if (at === -1) continue;
    total++;
    // Конец совпадения в оригинале: берём позицию последнего символа
    // и добавляем единицу.  map хранит начало каждого символа, поэтому
    // для конца смотрим следующий индекс, а на границе — длину строки.
    const startOrig = p.map[at];
    const lastIdx = at + norm.length - 1;
    const endOrig = lastIdx + 1 < p.norm.length
      ? p.map[lastIdx + 1]
      : p.original.length;

    const hit: AyahHit = {
      surah: p.surah,
      ayah: p.ayah,
      surahTitle: SURAH_BY_NUMBER[p.surah]?.transliteration ?? `Сура ${p.surah}`,
      text: p.original,
      matchStart: startOrig,
      matchEnd: endOrig,
    };
    hits.push(hit);
    // Лимит теперь на общее число найденного, а не на одну из двух
    // корзин — иначе при обрыве терялись бы уже собранные совпадения.
    if (hits.length >= MAX_AYAH_HITS) { stoppedEarly = true; break; }
  }

  const ayahs = hits;
  return {
    surahs,
    ayahs,
    truncated: stoppedEarly || total > ayahs.length,
    tooShortForText: false,
    notReady: false,
  };
}

/**
 * Фрагмент вокруг совпадения — чтобы длинный аят не занимал пол-экрана.
 * Возвращает три части: до, само совпадение, после.
 */
export function snippet(hit: AyahHit, radius = 60): {
  before: string; match: string; after: string;
} {
  const { text, matchStart, matchEnd } = hit;
  let from = Math.max(0, matchStart - radius);
  let to = Math.min(text.length, matchEnd + radius);
  // Не режем посреди слова — отходим до ближайшего пробела.
  if (from > 0) {
    const sp = text.indexOf(' ', from);
    if (sp !== -1 && sp < matchStart) from = sp + 1;
  }
  if (to < text.length) {
    const sp = text.lastIndexOf(' ', to);
    if (sp !== -1 && sp > matchEnd) to = sp;
  }
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, matchStart),
    match: text.slice(matchStart, matchEnd),
    after: text.slice(matchEnd, to) + (to < text.length ? '…' : ''),
  };
}
