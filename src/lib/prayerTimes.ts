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
 * ── Расчёт против календаря ───────────────────────────────────────────
 *
 * Для Ингушетии расчёта мало.  Местные расписания добавляют к
 * астрономическому времени свой запас (ихтият), неодинаковый по
 * намазам и по сезонам, и формулой он не берётся: лучший возможный
 * подбор углов даёт 64 % попаданий.  Поэтому там времена приходят из
 * печатного календаря — `lib/nazranTimetable.ts`, а `timesFor`
 * подменяет им расчёт.
 *
 * Для всех остальных городов и методов работает расчёт, как и раньше.
 *
 * Поверх любого из двух путей у каждого намаза есть ручная поправка:
 * если расписание вашей мечети отличается, разница выставляется за
 * минуту и запоминается.
 */

import * as adhan from 'adhan';
import { distanceKm, type Coords } from './location';
import {
  timetableDay, TIMETABLE_ORIGIN, TIMETABLE_RADIUS_KM, TIMETABLE_UTC_OFFSET_MIN,
} from './nazranTimetable';

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
  /** Короткая подпись в списке вместо углов, если углы не главное. */
  short?: string;
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
     * В самой Ингушетии времена берутся НЕ отсюда, а из печатного
     * календаря: `timesFor` подменяет расчёт таблицей, см.
     * `lib/nazranTimetable.ts`.  Углы и поправки ниже — запасной путь
     * для тех, кто выбрал это расписание вдалеке от Назрани, и для
     * ханафитского асра, которого в печатном календаре нет.
     *
     * Поправки не выдуманы, а измерены: на 11 августа 2026 календарь
     * даёт 03:23 05:02 12:12 16:01 19:11 20:42, чистая астрономия —
     * 03:24:11 05:01:43 12:06:11 15:59:47 19:09:54 20:39:47.  Зухр +6
     * и магриб +1 — классический запас «солнце точно прошло зенит» и
     * «минута выдержки после заката».
     *
     * Почему запасной путь именно запасной: перебор углов шагом 0.05°
     * с тремя режимами округления даёт в лучшем случае 64 % точных
     * попаданий по 738 значениям, и аср с магрибом уезжают раньше
     * календаря в половине дней.  Формулой это расписание не берётся.
     */
    id: 'nazran2',
    label: 'Назрань 2',
    fajr: 16,
    isha: { angle: 15 },
    offsets: { fajr: -1, dhuhr: 6, asr: 1, maghrib: 1, isha: 2 },
    short: 'календарь',
    source: 'Печатный календарь Назрани (alansar.ru), сверен с фотографией августа 2026 — совпали все 186 значений месяца; те же цифры у «Назрань» в Sajda и «Назрань 2» в 1Muslim',
    caution: 'Вне Ингушетии календарь неприменим — там это расписание считается по углам 16°/15° с поправками и совпадает с календарём примерно до минуты. Ханафитский аср в печатном календаре отсутствует и тоже считается.',
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

/**
 * Применим ли к этому месту и методу печатный календарь Ингушетии.
 *
 * Экспортируется, потому что интерфейс обязан говорить, откуда цифры:
 * «по календарю мечети» и «расчёт по углам» — это разный уровень
 * доверия, и подменять одно другим молча нельзя.
 */
export function usesTimetable(coords: Coords, s: PrayerSettings): boolean {
  return s.method === 'nazran2'
    && distanceKm(coords, TIMETABLE_ORIGIN) <= TIMETABLE_RADIUS_KM;
}

export function timesFor(coords: Coords, date: Date, s: PrayerSettings): DayTimes {
  const t = new adhan.PrayerTimes(
    new adhan.Coordinates(coords.lat, coords.lon),
    date,
    buildParams(s),
  );
  const computed: DayTimes = {
    fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr,
    asr: t.asr, maghrib: t.maghrib, isha: t.isha,
  };

  if (!usesTimetable(coords, s)) return computed;
  const row = timetableDay(date.getMonth() + 1, date.getDate());
  if (!row) return computed;

  /*
   * Мгновение строится через UTC, а не через локальную полночь: в
   * календаре время назрановское (UTC+3), и оно не должно зависеть от
   * того, в каком поясе стоит телефон.  Человек, открывший расписание
   * Назрани из Стамбула, увидит тот же момент, пересчитанный в своё
   * время, — это верно, а не «03:23 по Стамбулу».
   */
  const at = (minute: number, shift: number) => new Date(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    0, minute - TIMETABLE_UTC_OFFSET_MIN + shift,
  ));

  const adj = s.adjustments;
  return {
    fajr:    at(row.fajr,    adj.fajr),
    sunrise: at(row.sunrise, adj.sunrise),
    dhuhr:   at(row.dhuhr,   adj.dhuhr),
    /*
     * Аср в печатном календаре один и он шафиитский (проверено:
     * 16:01 на 11 августа, ханафитский в тот день 17:05).
     * Ханафитского столбца в календаре нет, выдумывать его нельзя —
     * для этого мазхаба аср остаётся расчётным, а остальные пять
     * времён всё равно берутся из календаря: они от мазхаба не
     * зависят, и терять на них точность не за что.
     */
    asr:     s.madhab === 'shafi' ? at(row.asr, adj.asr) : computed.asr,
    maghrib: at(row.maghrib, adj.maghrib),
    isha:    at(row.isha,    adj.isha),
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
