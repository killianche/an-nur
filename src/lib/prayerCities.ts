/**
 * prayerCities — список городов на экране намаза, у каждого свои настройки.
 *
 * Устроено как погода в iOS: человек держит несколько городов и
 * переключается между ними смахом, а не перевыбирает место каждый раз.
 * Сценарий владельца: он в Назрани, родня в Малгобеке, учится во
 * Владикавказе, ездит в Москву — и хочет видеть время во всех четырёх.
 *
 * ── Почему настройки у каждого города свои ────────────────────────────
 *
 * Потому что расписание — свойство места, а не человека.  Мечеть в
 * Назрани и мечеть в Москве считают по‑разному, и один общий метод
 * означал бы, что хотя бы в одном городе цифры расходятся с мечетью.
 * Мазхаб и ручные поправки — по той же причине рядом с методом: они
 * тоже про конкретное расписание.
 *
 * ── Совместимость ─────────────────────────────────────────────────────
 *
 * До этого место было одно (`place`) и настройки одни
 * (`prayer.settings`).  Обе записи читаются при первом запуске новой
 * версии и превращаются в первый город списка, поэтому у того, кто уже
 * настроил Назрань и поправки, ничего не пропадает.  Старые ключи не
 * удаляются: если человек откатит версию, он вернётся к своему выбору.
 */

import {
  CITIES, DEFAULT_PLACE, readPlace,
  type Coords, type Place, type PlaceSource,
} from './location';
import { DEFAULT_SETTINGS, readSettings, type PrayerSettings } from './prayerTimes';

export type PrayerCity = Coords & {
  /** Стабильный ключ.  Имя для него не годится: города переименовывают,
   *  а «Моё местоположение» вообще одно на все координаты. */
  id: string;
  name: string;
  source: PlaceSource;
  settings: PrayerSettings;
};

const CITIES_KEY = 'prayer.cities';
const ACTIVE_KEY = 'prayer.activeCity';

export const CITIES_EVENT = 'prayer-cities-changed';
/** Больше десятка городов — это уже не «мои места», а справочник. */
export const MAX_CITIES = 12;

/**
 * Города, которые появляются при первом запуске.
 *
 * Названы владельцем: Назрань, Малгобек, Владикавказ, Москва.  Список
 * не «на всякий случай»: пустой экран с одной кнопкой «добавить город»
 * — худшее первое впечатление, а эти четыре покрывают его обычную
 * географию.  Лишние удаляются в два касания.
 */
const SEED_NAMES = ['Назрань', 'Малгобек', 'Владикавказ', 'Москва'];

function makeId(): string {
  // Не Math.random: id должен быть стабильным и читаемым в отладке.
  // Счётчик от времени последней записи даёт монотонность в пределах
  // сессии, а коллизии между сессиями исключает проверка ниже.
  return `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}
let idCounter = 0;

function sameSpot(a: Coords, b: Coords): boolean {
  // Полкилометра: два ввода одного города руками и по геолокации
  // должны считаться одним местом.
  return Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005;
}

function isNazranSpot(place: Coords): boolean {
  return Math.abs(place.lat - DEFAULT_PLACE.lat) < 0.005
    && Math.abs(place.lon - DEFAULT_PLACE.lon) < 0.005;
}

/** Fresh installs open the first exact timetable. Existing stored settings
 * are preserved because only the shared untouched default is promoted. */
export function settingsForNewPrayerPlace(place: Coords): PrayerSettings {
  return isNazranSpot(place)
    ? { ...DEFAULT_SETTINGS, source: 'nazran-1' }
    : DEFAULT_SETTINGS;
}

function cityFromPlace(place: Place, settings: PrayerSettings): PrayerCity {
  const initialSettings = settings === DEFAULT_SETTINGS
    ? settingsForNewPrayerPlace(place)
    : settings;
  return {
    id: makeId(),
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    source: place.source,
    settings: initialSettings,
  };
}

function sanitise(raw: unknown): PrayerCity | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<PrayerCity>;
  if (typeof c.lat !== 'number' || typeof c.lon !== 'number') return null;
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return null;
  return {
    id: typeof c.id === 'string' && c.id ? c.id : makeId(),
    name: typeof c.name === 'string' && c.name ? c.name : 'Без названия',
    lat: c.lat,
    lon: c.lon,
    source: c.source === 'gps' ? 'gps' : 'manual',
    // Настройки прогоняем через тот же разбор, что и одиночные: он
    // чинит испорченное хранилище и незнакомые методы.
    settings: normaliseSettings(c.settings),
  };
}

function normaliseSettings(s: unknown): PrayerSettings {
  if (!s || typeof s !== 'object') return DEFAULT_SETTINGS;
  const p = s as Partial<PrayerSettings>;
  const base = { ...DEFAULT_SETTINGS, ...p };
  // Полная проверка живёт в prayerTimes.readSettings, но она читает
  // localStorage.  Здесь дублируем только то, что нужно: остальное
  // (диапазон поправок, существование метода) проверит buildParams.
  return {
    source: base.source === 'nazran-1' || base.source === 'nazran-2'
      ? base.source : 'calculated',
    method: base.method ?? DEFAULT_SETTINGS.method,
    madhab: base.madhab === 'hanafi' ? 'hanafi' : 'shafi',
    adjustments: { ...DEFAULT_SETTINGS.adjustments, ...(p.adjustments ?? {}) },
  };
}

/** Первый запуск: переносим прежнее одиночное место и досыпаем пресеты. */
function seed(): PrayerCity[] {
  const previous = readPlace();
  const previousSettings = readSettings();
  const out: PrayerCity[] = [cityFromPlace(previous, previousSettings)];

  for (const name of SEED_NAMES) {
    const meta = CITIES.find(c => c.name === name);
    if (!meta) continue;
    if (out.some(c => sameSpot(c, meta))) continue;
    out.push({
      id: makeId(),
      name: meta.name,
      lat: meta.lat,
      lon: meta.lon,
      source: 'manual',
      // Пресетам достаются дефолтные настройки, а не настройки первого
      // города: поправки, выставленные под мечеть в Назрани, к Москве
      // отношения не имеют.
      settings: DEFAULT_SETTINGS,
    });
  }
  return out.slice(0, MAX_CITIES);
}

export function readCities(): PrayerCity[] {
  if (typeof window === 'undefined') {
    return [cityFromPlace(DEFAULT_PLACE, DEFAULT_SETTINGS)];
  }
  try {
    const raw = localStorage.getItem(CITIES_KEY);
    if (!raw) {
      const fresh = seed();
      writeCities(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('не массив');
    const list = parsed.map(sanitise).filter((c): c is PrayerCity => c !== null);
    if (list.length === 0) {
      const fresh = seed();
      writeCities(fresh);
      return fresh;
    }
    return list.slice(0, MAX_CITIES);
  } catch {
    const fresh = seed();
    writeCities(fresh);
    return fresh;
  }
}

export function writeCities(list: PrayerCity[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CITIES_KEY, JSON.stringify(list.slice(0, MAX_CITIES)));
  window.dispatchEvent(new Event(CITIES_EVENT));
}

/** Id активного города.  Всегда указывает на существующий город. */
export function readActiveId(list = readCities()): string {
  if (typeof window === 'undefined') return list[0]?.id ?? '';
  const saved = localStorage.getItem(ACTIVE_KEY);
  if (saved && list.some(c => c.id === saved)) return saved;
  return list[0]?.id ?? '';
}

export function setActiveId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event(CITIES_EVENT));
}

export function onCitiesChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CITIES_EVENT, fn);
  return () => window.removeEventListener(CITIES_EVENT, fn);
}

/**
 * Добавить город.  Если такое место уже есть — не плодим дубль, а
 * делаем существующий активным: человек всё равно хотел попасть именно
 * туда.  Возвращает id города, на котором в итоге оказались.
 */
export function addCity(place: Place): string {
  const list = readCities();
  const existing = list.find(c => sameSpot(c, place));
  if (existing) {
    setActiveId(existing.id);
    return existing.id;
  }
  if (list.length >= MAX_CITIES) return readActiveId(list);
  const city = cityFromPlace(place, settingsForNewPrayerPlace(place));
  writeCities([...list, city]);
  setActiveId(city.id);
  return city.id;
}

/** Удалить город.  Последний удалить нельзя: экрану нужно что-то показывать. */
export function removeCity(id: string) {
  const list = readCities();
  if (list.length <= 1) return;
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) return;
  const next = list.filter(c => c.id !== id);
  writeCities(next);
  if (readActiveId(next) !== id) return;
  // Активным становится сосед — тот, что занял место удалённого.
  setActiveId(next[Math.min(idx, next.length - 1)].id);
}

export function updateCitySettings(id: string, settings: PrayerSettings) {
  const list = readCities();
  writeCities(list.map(c => (c.id === id ? { ...c, settings } : c)));
}

export function renameCity(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = readCities();
  writeCities(list.map(c => (c.id === id ? { ...c, name: trimmed } : c)));
}

/** Переставить город: порядок в списке — это порядок смахивания. */
export function moveCity(id: string, delta: number) {
  const list = readCities();
  const from = list.findIndex(c => c.id === id);
  if (from === -1) return;
  const to = from + delta;
  if (to < 0 || to >= list.length) return;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  writeCities(next);
}
