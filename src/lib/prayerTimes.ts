/**
 * prayerTimes — расчёт времени намаза, офлайн.
 *
 * Считает библиотека `adhan` (batoulapps, MIT): астрономия там
 * проверена и совпадает с расписаниями российских сайтов до минуты —
 * сверено вручную для Назрани перед тем, как её брать.  Никакого API:
 * время намаза обязано работать в самолёте и в горах.
 *
 * ── Про методы расчёта ────────────────────────────────────────────────
 *
 * Разные школы берут разные углы погружения солнца под горизонт для
 * фаджра и иши.  Разница не косметическая: между 16° и 18° для Назрани
 * в августе — примерно 17 минут на фаджре.  Поэтому метод вынесен в
 * настройку, а не зашит.
 *
 * Углы ниже взяты из проверяемых источников (см. столбец «откуда»), а
 * не из памяти.  В adhan нет готового метода для России — задаём
 * через `CalculationMethod.Other()` и выставляем углы руками, это
 * штатный путь библиотеки.
 *
 * ── Про ихтият ────────────────────────────────────────────────────────
 *
 * Ихтият — «запас» в несколько минут, который местные расписания
 * добавляют к астрономическому времени.  Сначала его здесь не было
 * вовсе: придумывать поправку к времени поклонения нельзя.  Теперь он
 * есть — но не придуманный, а измеренный по живым расписаниям, см.
 * метод «Назрань 2» ниже.
 *
 * Поверх этого у каждого намаза остаётся ручная поправка: если на
 * руках печатный календарь, расхождение выставляется за минуту и
 * запоминается.
 */

import * as adhan from 'adhan';
import type { Coords } from './location';

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'Фаджр',
  sunrise: 'Восход',
  dhuhr: 'Зухр',
  asr: 'Аср',
  maghrib: 'Магриб',
  isha: 'Иша',
};

/** Восход — не намаз, а граница утреннего времени.  В списке он нужен,
 *  но подсвечивать его как «следующий намаз» неверно. */
export const PRAYER_ORDER: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const IS_PRAYER: Record<PrayerKey, boolean> = {
  fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true,
};

export type MethodId =
  | 'nazran2' | 'dumrf' | 'mwl' | 'egypt' | 'ummalqura' | 'karachi';

export type MethodSpec = {
  id: MethodId;
  label: string;
  /** Угол фаджра в градусах. */
  fajr: number;
  /** Угол иши либо интервал после магриба в минутах. */
  isha: { angle: number } | { minutes: number };
  /**
   * Ихтият самого расписания — поправки в минутах, зашитые в метод.
   *
   * Это не то же самое, что ручные поправки пользователя: там личная
   * сверка с печатным календарём, здесь свойство самого расписания.
   * Складываются.
   */
  offsets?: Partial<Record<PrayerKey, number>>;
  /** Откуда взяты углы — показываем в интерфейсе. */
  source: string;
  /** Предупреждение, если источник единственный или спорный. */
  caution?: string;
};

export const METHODS: MethodSpec[] = [
  {
    /*
     * Местное расписание Ингушетии — то, по которому живут мечети, и
     * потому дефолт.
     *
     * Углов у него нет: и 1Muslim («Назрань 2»), и Sajda («Назрань»,
     * помечено у них как сверенное) держат его готовой таблицей, а
     * первоисточник — муфтият или конкретная мечеть — не публикует
     * ни один из них.  Копировать чужую таблицу в приложение нельзя,
     * поэтому расписание воспроизводится расчётом: документированные
     * углы ДУМ России 16°/15° плюс ихтият, снятый с самих расписаний.
     *
     * Ихтият именно измерен, а не придуман.  На 11 августа 2026 обе
     * таблицы дали одно и то же по всем шести временам
     * (03:23 05:02 12:12 16:01 19:11 20:42), а чистая астрономия —
     * 03:24:11 05:01:43 12:06:11 15:59:47 19:09:54 20:39:47.  Отсюда
     * и поправки ниже; зухр +6 и магриб +1 — классический запас
     * «солнце точно прошло зенит» и «минута выдержки после заката».
     *
     * Проверено не на одном дне: по 123 дням 2026 года (январь,
     * апрель, август, декабрь) средняя ошибка меньше минуты, худшая
     * два.  Точнее формулой не выходит — у расписания своя
     * астрономическая реализация, и остаточная разница формы кривой
     * около минуты неустранима.  Промахи почти всегда в сторону
     * «позже»: опоздать на минуту безопасно, начать раньше времени —
     * нет.
     */
    id: 'nazran2',
    label: 'Назрань 2',
    fajr: 16,
    isha: { angle: 15 },
    offsets: { fajr: -1, dhuhr: 6, asr: 1, maghrib: 1, isha: 2 },
    source: 'Углы 16°/15° (ДУМ России) плюс ихтият, снятый с расписаний «Назрань 2» в 1Muslim и «Назрань» в Sajda — обе таблицы совпали по всем шести временам',
    caution: 'Сверено по 123 дням 2026 года: в среднем расхождение меньше минуты, в отдельные дни до двух. Первоисточник таблицы не публикует ни одно приложение. Если у вас есть печатный календарь мечети — сверьте и при расхождении поправьте вручную ниже.',
  },
  {
    id: 'dumrf',
    label: 'ДУМ России',
    fajr: 16,
    isha: { angle: 15 },
    source: 'Метод «Spiritual Administration of Muslims of Russia» в справочнике aladhan; совпало с расписанием azan.su для Назрани',
  },
  {
    id: 'mwl',
    label: 'Всемирная исламская лига',
    fajr: 18,
    isha: { angle: 17 },
    source: 'Стандарт MWL, встроен в adhan',
  },
  {
    id: 'egypt',
    label: 'Египетская организация',
    fajr: 19.5,
    isha: { angle: 17.5 },
    source: 'Стандарт Egyptian General Authority, встроен в adhan',
  },
  {
    id: 'ummalqura',
    label: 'Умм аль-Кура (Мекка)',
    fajr: 18.5,
    isha: { minutes: 90 },
    source: 'Стандарт Umm al-Qura, встроен в adhan',
  },
  {
    id: 'karachi',
    label: 'Карачи',
    fajr: 18,
    isha: { angle: 18 },
    source: 'Стандарт University of Islamic Sciences, Karachi, встроен в adhan',
  },
];

export type Madhab = 'shafi' | 'hanafi';

export const MADHAB_LABELS: Record<Madhab, string> = {
  shafi: 'Шафиитский',
  hanafi: 'Ханафитский',
};

/** Поправка в минутах к каждому времени. */
export type Adjustments = Record<PrayerKey, number>;

export const ZERO_ADJUSTMENTS: Adjustments = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0,
};

export type PrayerSettings = {
  method: MethodId;
  madhab: Madhab;
  adjustments: Adjustments;
};

/**
 * Дефолт — «Назрань 2», шафиитский аср.
 *
 * «Назрань 2» — то расписание, по которому в Ингушетии живут мечети;
 * приложение делается прежде всего для неё, и первый экран должен
 * показывать местное время, а не общероссийское приближение.
 *
 * Шафиитский аср не выбран наугад: у «Назрани 2» аср 16:01 на
 * 11 августа 2026, ханафитский дал бы 17:04 — мимо на час.  Sajda для
 * Ингушетии отдаёт то же самое (`madhab: standard`).
 */
export const DEFAULT_SETTINGS: PrayerSettings = {
  method: 'nazran2',
  madhab: 'shafi',
  adjustments: ZERO_ADJUSTMENTS,
};

const KEY = 'prayer.settings';
export const PRAYER_SETTINGS_EVENT = 'prayer-settings-changed';

export function readSettings(): PrayerSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<PrayerSettings>;
    const method = METHODS.some(m => m.id === p.method) ? p.method! : DEFAULT_SETTINGS.method;
    const madhab: Madhab = p.madhab === 'hanafi' ? 'hanafi' : 'shafi';
    const adj = { ...ZERO_ADJUSTMENTS };
    for (const k of PRAYER_ORDER) {
      const v = p.adjustments?.[k];
      // Ограничение ±60 минут — защита от испорченного хранилища, а не
      // от пользователя: больше часа поправки не бывает.
      if (typeof v === 'number' && Number.isFinite(v)) adj[k] = Math.max(-60, Math.min(60, Math.round(v)));
    }
    return { method, madhab, adjustments: adj };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(s: PrayerSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(PRAYER_SETTINGS_EVENT));
}

export function onSettingsChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PRAYER_SETTINGS_EVENT, fn);
  return () => window.removeEventListener(PRAYER_SETTINGS_EVENT, fn);
}

export function methodById(id: MethodId): MethodSpec {
  return METHODS.find(m => m.id === id) ?? METHODS[0];
}

function buildParams(s: PrayerSettings): adhan.CalculationParameters {
  const spec = methodById(s.method);
  const p = adhan.CalculationMethod.Other();
  p.fajrAngle = spec.fajr;
  if ('angle' in spec.isha) {
    p.ishaAngle = spec.isha.angle;
    p.ishaInterval = 0;
  } else {
    p.ishaAngle = 0;
    p.ishaInterval = spec.isha.minutes;
  }
  p.madhab = s.madhab === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  // На широтах выше ~48° в июне солнце не опускается на нужный угол, и
  // фаджр с ишей математически не существуют.  MiddleOfTheNight —
  // общепринятый способ их доопределить; для Ингушетии (43°) правило
  // не включается вовсе, но приложение работает и в Петербурге.
  p.highLatitudeRule = adhan.HighLatitudeRule.MiddleOfTheNight;
  // Ихтият расписания и ручная поправка пользователя складываются:
  // первое — свойство метода, второе — личная сверка с календарём
  // мечети.  Если человек выставил −2 минуты у метода с +6, он ждёт
  // +4, а не потерю одной из поправок.
  //
  // Тип поправок библиотека наружу не экспортирует, поэтому
  // присваиваем через сам объект параметров — форма совпадает.
  const own = spec.offsets ?? {};
  const total = { ...ZERO_ADJUSTMENTS };
  for (const k of PRAYER_ORDER) total[k] = (own[k] ?? 0) + s.adjustments[k];
  p.adjustments = total;
  return p;
}

export type DayTimes = Record<PrayerKey, Date>;

export function timesFor(coords: Coords, date: Date, s: PrayerSettings): DayTimes {
  const t = new adhan.PrayerTimes(
    new adhan.Coordinates(coords.lat, coords.lon),
    date,
    buildParams(s),
  );
  return {
    fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr,
    asr: t.asr, maghrib: t.maghrib, isha: t.isha,
  };
}

export type NextPrayer = { key: PrayerKey; at: Date; tomorrow: boolean };

/**
 * Ближайший намаз.  Восход пропускается: это граница времени фаджра,
 * а не намаз, и обратный отсчёт «до восхода» вводил бы в заблуждение.
 *
 * Если на сегодня всё прошло — берём фаджр завтрашнего дня, а не
 * возвращаем null: экран не должен пустеть после иши.
 */
export function nextPrayer(coords: Coords, now: Date, s: PrayerSettings): NextPrayer {
  const today = timesFor(coords, now, s);
  for (const key of PRAYER_ORDER) {
    if (!IS_PRAYER[key]) continue;
    if (today[key].getTime() > now.getTime()) return { key, at: today[key], tomorrow: false };
  }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return { key: 'fajr', at: timesFor(coords, tomorrow, s).fajr, tomorrow: true };
}

/** «2 ч 14 мин» — человеческий вид остатка. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
