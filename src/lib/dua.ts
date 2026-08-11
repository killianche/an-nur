/**
 * dua — загрузка сборника дуа.
 *
 * Устроено как азкары (`lib/azkar.ts`): один статический json, который
 * браузер кэширует, и общий промис на все экраны, чтобы при быстром
 * переходе «раздел → список» не улетело два запроса.
 *
 * ── Почему схема своя, а не как у азкаров ─────────────────────────────
 *
 * Формат азкаров достался от извлечения из APK: там `header_label` с
 * ингушской транскрипцией, `page: "Page1"`, `audio_book1`, `n_audio` —
 * поля, которые ничего не значат вне того источника.  Тексты дуа
 * приходят от владельца, и формат под них можно сделать честный:
 * только то, что реально показывается на экране.
 *
 * ── Про содержимое ────────────────────────────────────────────────────
 *
 * Файл `public/dua/dua.json` сейчас пустой намеренно.  Дуа — сакральный
 * текст: придумывать его или брать «из памяти модели» нельзя (см.
 * CLAUDE.md).  Раздел, формат и экраны готовы; тексты владелец
 * присылает отдельно, и они переносятся посимвольно.
 *
 * Как их присылать — описано в `public/dua/README.md`.
 */

export type DuaCategoryId = string;

export type DuaCategory = {
  id: DuaCategoryId;
  title_ru: string;
  /** Одна строка, зачем эта подборка.  Необязательно. */
  subtitle_ru?: string;
};

export type DuaEntry = {
  id: string;
  category: DuaCategoryId;
  /** Когда читают: «Перед сном», «При выходе из дома». */
  title_ru: string;
  /** Арабский, дословно из источника. */
  arabic: string;
  /** Русская транскрипция, дословно.  Необязательно. */
  translit_ru?: string;
  /** Перевод, дословно. */
  russian: string;
  /** Откуда: «аль-Бухари 6306», «Коран 2:201». */
  refs?: string[];
  /** Сколько раз читают, если это оговорено в источнике. */
  repeat?: number;
};

export type DuaData = {
  version: number;
  categories: DuaCategory[];
  entries: DuaEntry[];
  /** Сколько записей в каждой подборке — считается при загрузке. */
  by_category: Record<DuaCategoryId, number>;
};

const EMPTY: DuaData = { version: 0, categories: [], entries: [], by_category: {} };

let promise: Promise<DuaData> | null = null;
let cache: DuaData | null = null;

function normalise(raw: unknown): DuaData {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const d = raw as Partial<DuaData>;
  const categories = Array.isArray(d.categories)
    ? d.categories.filter((c): c is DuaCategory =>
        !!c && typeof c.id === 'string' && typeof c.title_ru === 'string')
    : [];
  const entries = Array.isArray(d.entries)
    ? d.entries.filter((e): e is DuaEntry =>
        !!e && typeof e.id === 'string'
        && typeof e.arabic === 'string' && e.arabic.length > 0
        && typeof e.russian === 'string')
    : [];
  const by_category: Record<string, number> = {};
  for (const e of entries) by_category[e.category] = (by_category[e.category] ?? 0) + 1;
  return {
    version: typeof d.version === 'number' ? d.version : 1,
    categories,
    entries,
    by_category,
  };
}

export function loadDuaData(): Promise<DuaData> {
  if (cache) return Promise.resolve(cache);
  if (promise) return promise;
  promise = fetch('/dua/dua.json')
    .then(r => {
      // Файла может не быть вовсе — это не ошибка, а «тексты ещё не
      // добавили».  Экран покажет честное пустое состояние.
      if (r.status === 404) return EMPTY;
      if (!r.ok) throw new Error(`dua.json HTTP ${r.status}`);
      return r.json();
    })
    .then(raw => {
      cache = normalise(raw);
      return cache;
    })
    .catch(() => {
      cache = EMPTY;
      return cache;
    });
  return promise;
}

export function duaById(data: DuaData, id: string): DuaEntry | null {
  return data.entries.find(e => e.id === id) ?? null;
}
