/**
 * location — координаты пользователя для киблы и времени намаза.
 *
 * Один слой на две задачи: обе считаются офлайн по широте и долготе,
 * и обе должны работать, когда геолокация недоступна или запрещена.
 *
 * ── Почему браузерный API, а не плагин Capacitor ──────────────────────
 *
 * `navigator.geolocation` работает и в вебе, и внутри WKWebView, и
 * внутри Android WebView — при условии, что в нативных проектах
 * объявлены разрешения (сделано: NSLocationWhenInUseUsageDescription
 * в Info.plist, ACCESS_*_LOCATION в манифесте).  Плагин добавил бы
 * зависимость ради того же результата.  Если однажды понадобится
 * фоновое отслеживание — тогда и появится причина его взять.
 *
 * ── Ручной выбор ──────────────────────────────────────────────────────
 *
 * Геолокацию можно запретить, её может не быть в помещении, и человек
 * может смотреть время намаза для другого города.  Поэтому координаты
 * всегда можно задать выбором города из списка, и этот выбор
 * запоминается.  Список городов — `CITIES` ниже.
 */

export type Coords = { lat: number; lon: number };

export type PlaceSource = 'manual' | 'gps';

export type Place = Coords & {
  /** Название для показа: город из списка либо «Моё местоположение». */
  name: string;
  source: PlaceSource;
};

/**
 * Города для ручного выбора.
 *
 * Координаты — из OpenStreetMap/Википедии, проверены на дату
 * 2026-08-10.  Список намеренно короткий: это не географический
 * справочник, а быстрый выбор для тех, у кого не работает геолокация.
 * Ингушетия идёт первой, потому что приложение делается прежде всего
 * для неё.
 *
 * Добавлять сюда города только со сверенными координатами: ошибка в
 * долготе на градус сдвигает время намаза примерно на четыре минуты.
 */
export const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'Назрань',      lat: 43.2256, lon: 44.7642 },
  { name: 'Магас',        lat: 43.1687, lon: 44.8133 },
  { name: 'Малгобек',     lat: 43.5111, lon: 44.5906 },
  { name: 'Карабулак',    lat: 43.3050, lon: 44.9042 },
  { name: 'Сунжа',        lat: 43.3197, lon: 45.0447 },
  { name: 'Грозный',      lat: 43.3169, lon: 45.6981 },
  { name: 'Владикавказ',  lat: 43.0367, lon: 44.6678 },
  { name: 'Нальчик',      lat: 43.4981, lon: 43.6189 },
  { name: 'Махачкала',    lat: 42.9764, lon: 47.5024 },
  { name: 'Москва',       lat: 55.7558, lon: 37.6173 },
  { name: 'Санкт-Петербург', lat: 59.9386, lon: 30.3141 },
  { name: 'Казань',       lat: 55.7963, lon: 49.1088 },
  { name: 'Уфа',          lat: 54.7351, lon: 55.9587 },
  { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057 },
  { name: 'Новосибирск',  lat: 55.0084, lon: 82.9357 },
  { name: 'Мекка',        lat: 21.4225, lon: 39.8262 },
  { name: 'Медина',       lat: 24.4686, lon: 39.6142 },
  { name: 'Стамбул',      lat: 41.0082, lon: 28.9784 },
  { name: 'Дубай',        lat: 25.2048, lon: 55.2708 },
];

/** Назрань по умолчанию — решение владельца: приложение прежде всего
 *  для Ингушетии, и первый экран должен показывать осмысленное время
 *  ещё до того, как человек что-то выберет. */
export const DEFAULT_PLACE: Place = {
  name: 'Назрань', lat: 43.2256, lon: 44.7642, source: 'manual',
};

const KEY = 'place';

export function readPlace(): Place {
  if (typeof window === 'undefined') return DEFAULT_PLACE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PLACE;
    const p = JSON.parse(raw) as Partial<Place>;
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return DEFAULT_PLACE;
    return {
      lat: p.lat,
      lon: p.lon,
      name: p.name || 'Моё местоположение',
      source: p.source === 'gps' ? 'gps' : 'manual',
    };
  } catch {
    return DEFAULT_PLACE;
  }
}

export function writePlace(p: Place) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(PLACE_EVENT));
}

export const PLACE_EVENT = 'place-changed';

export function onPlaceChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PLACE_EVENT, fn);
  return () => window.removeEventListener(PLACE_EVENT, fn);
}

export type LocateError = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

/**
 * Спросить координаты у устройства.
 *
 * Вызывать только из обработчика нажатия: и iOS, и Android показывают
 * системный запрос разрешения, и делать это без явного действия
 * человека — верный способ получить отказ навсегда.
 */
export function locate(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject('unsupported' as LocateError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        name: 'Моё местоположение',
        source: 'gps',
      }),
      err => {
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        reject((err.code === 1 ? 'denied'
              : err.code === 3 ? 'timeout'
              : 'unavailable') as LocateError);
      },
      // Высокая точность тут не нужна: и кибла, и время намаза не
      // меняются в пределах города.  Зато без неё ответ приходит
      // быстрее и не будит GPS-приёмник.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

export const LOCATE_ERROR_TEXT: Record<LocateError, string> = {
  unsupported: 'Устройство не умеет определять местоположение.',
  denied: 'Доступ к геолокации запрещён. Разрешите его в настройках или выберите город вручную.',
  unavailable: 'Не удалось определить местоположение. Выберите город вручную.',
  timeout: 'Определение затянулось. Попробуйте ещё раз или выберите город вручную.',
};

/** Расстояние по большому кругу, километры.  Нужно, чтобы показать
 *  «до Мекки столько-то» — это делает экран киблы осмысленным даже
 *  когда компас недоступен. */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** Кааба — конечная точка для расстояния и подписи. */
export const KAABA: Coords = { lat: 21.4225, lon: 39.8262 };
