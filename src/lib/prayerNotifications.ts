/**
 * Локальные напоминания о намазе.
 *
 * Пять намазов включаются независимо; восход намеренно исключён, потому что
 * это граница времени фаджра, а не отдельный намаз. На iOS нельзя держать
 * больше 64 ожидающих локальных уведомлений, поэтому планируем ближайшие
 * 12 дней (максимум 60) и обновляем очередь при запуске/возврате приложения.
 * Android держит 30 дней и получает точные alarm-события даже в Doze.
 */
import { Capacitor } from '@capacitor/core';
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications';
import type { PrayerCity } from './prayerCities';
import {
  IS_PRAYER,
  PRAYER_LABELS,
  PRAYER_ORDER,
  timesFor,
  type PrayerKey,
} from './prayerTimes';
import { readPrimaryPrayerSource } from './prayerPreferences';

export type PrayerAlarmKey = Exclude<PrayerKey, 'sunrise'>;
export type PrayerAlarmPreferences = Record<PrayerAlarmKey, boolean>;

export const PRAYER_ALARM_KEYS = PRAYER_ORDER.filter(
  (key): key is PrayerAlarmKey => IS_PRAYER[key],
);

export const DEFAULT_PRAYER_ALARMS: PrayerAlarmPreferences = {
  fajr: false,
  dhuhr: false,
  asr: false,
  maghrib: false,
  isha: false,
};

const ALARMS_KEY = 'prayer.alarms.v1';
const ALARMS_EVENT = 'prayer-alarms-changed';
const CHANNEL_ID = 'prayer-times-v1';
const SOUND_FILE = 'prayer_reminder.wav';
const NOTIFICATION_KIND = 'prayer-alarm';

export type PrayerAlarmOccurrence = {
  id: number;
  key: PrayerAlarmKey;
  at: Date;
};

export type PrayerAlarmSyncStatus =
  | 'disabled'
  | 'scheduled'
  | 'permission-denied'
  | 'exact-alarm-denied'
  | 'unsupported'
  | 'error';

export type PrayerAlarmSyncResult = {
  status: PrayerAlarmSyncStatus;
  count: number;
};

export function normalisePrayerAlarms(value: unknown): PrayerAlarmPreferences {
  const raw = value && typeof value === 'object'
    ? value as Partial<Record<PrayerAlarmKey, unknown>>
    : {};
  return Object.fromEntries(
    PRAYER_ALARM_KEYS.map(key => [key, raw[key] === true]),
  ) as PrayerAlarmPreferences;
}

export function readPrayerAlarms(): PrayerAlarmPreferences {
  if (typeof window === 'undefined') return DEFAULT_PRAYER_ALARMS;
  try {
    const raw = localStorage.getItem(ALARMS_KEY);
    return raw ? normalisePrayerAlarms(JSON.parse(raw)) : DEFAULT_PRAYER_ALARMS;
  } catch {
    return DEFAULT_PRAYER_ALARMS;
  }
}

export function writePrayerAlarms(value: PrayerAlarmPreferences): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ALARMS_KEY, JSON.stringify(normalisePrayerAlarms(value)));
  window.dispatchEvent(new Event(ALARMS_EVENT));
}

export function onPrayerAlarmsChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(ALARMS_EVENT, fn);
  return () => window.removeEventListener(ALARMS_EVENT, fn);
}

/** Детерминированный id: дата и намаз дают одно значение после каждого sync. */
export function prayerAlarmId(date: Date, key: PrayerAlarmKey): number {
  const dateCode = date.getFullYear() * 10_000
    + (date.getMonth() + 1) * 100
    + date.getDate();
  return 700_000_000 + dateCode * 10 + PRAYER_ALARM_KEYS.indexOf(key) + 1;
}

export function buildPrayerAlarmOccurrences(
  city: PrayerCity,
  enabled: PrayerAlarmPreferences,
  from: Date,
  days: number,
): PrayerAlarmOccurrence[] {
  const result: PrayerAlarmOccurrence[] = [];
  const threshold = from.getTime() + 30_000;
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(from);
    day.setDate(from.getDate() + offset);
    day.setHours(12, 0, 0, 0);
    const times = timesFor(city, day, city.settings);
    for (const key of PRAYER_ALARM_KEYS) {
      if (!enabled[key] || times[key].getTime() <= threshold) continue;
      result.push({ id: prayerAlarmId(day, key), key, at: times[key] });
    }
  }
  return result;
}

export function cityWithPrimaryPrayerSource(city: PrayerCity): PrayerCity {
  return {
    ...city,
    settings: { ...city.settings, source: readPrimaryPrayerSource() },
  };
}

export async function requestPrayerAlarmPermission(): Promise<PrayerAlarmSyncStatus> {
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions();
    }
    return permission.display === 'granted' ? 'scheduled' : 'permission-denied';
  } catch {
    return 'unsupported';
  }
}

/** Открывает системную настройку точных будильников Android 12+. */
export async function requestExactPrayerAlarms(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return true;
  try {
    let setting = await LocalNotifications.checkExactNotificationSetting();
    if (setting.exact_alarm !== 'granted') {
      setting = await LocalNotifications.changeExactNotificationSetting();
    }
    return setting.exact_alarm === 'granted';
  } catch {
    return false;
  }
}

export async function syncPrayerAlarms(
  city: PrayerCity,
  enabled = readPrayerAlarms(),
  now = new Date(),
): Promise<PrayerAlarmSyncResult> {
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications
      .filter(notification => notification.extra?.kind === NOTIFICATION_KIND)
      .map(notification => ({ id: notification.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });

    if (!PRAYER_ALARM_KEYS.some(key => enabled[key])) {
      return { status: 'disabled', count: 0 };
    }

    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      return { status: 'permission-denied', count: 0 };
    }

    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Время намаза',
        description: 'Звуковые напоминания в установленное время намаза',
        sound: SOUND_FILE,
        importance: 4,
        visibility: 1,
        vibration: true,
      });
    }

    const days = platform === 'ios' ? 12 : platform === 'android' ? 30 : 12;
    const primaryCity = cityWithPrimaryPrayerSource(city);
    const occurrences = buildPrayerAlarmOccurrences(primaryCity, enabled, now, days);
    const notifications: LocalNotificationSchema[] = occurrences.map(item => ({
      id: item.id,
      title: `Время намаза — ${PRAYER_LABELS[item.key]}`,
      body: `${PRAYER_LABELS[item.key]} наступил в ${formatAlarmTime(item.at)}.`,
      schedule: { at: item.at, allowWhileIdle: true },
      sound: SOUND_FILE,
      channelId: CHANNEL_ID,
      threadIdentifier: CHANNEL_ID,
      interruptionLevel: 'active',
      extra: {
        kind: NOTIFICATION_KIND,
        prayerKey: item.key,
        source: primaryCity.settings.source,
      },
    }));
    if (notifications.length) await LocalNotifications.schedule({ notifications });

    if (platform === 'android') {
      try {
        const exact = await LocalNotifications.checkExactNotificationSetting();
        if (exact.exact_alarm !== 'granted') {
          return { status: 'exact-alarm-denied', count: notifications.length };
        }
      } catch {
        return { status: 'exact-alarm-denied', count: notifications.length };
      }
    }
    return { status: 'scheduled', count: notifications.length };
  } catch (error) {
    if (isUnsupportedNotificationError(error)) {
      return { status: 'unsupported', count: 0 };
    }
    return { status: 'error', count: 0 };
  }
}

/** Обновление очереди при запуске и после возврата из системных настроек. */
export async function startPrayerAlarmScheduler(
  getCity: () => PrayerCity | null,
): Promise<() => void> {
  const refresh = () => {
    const city = getCity();
    if (city) void syncPrayerAlarms(city);
  };
  refresh();
  if (!Capacitor.isNativePlatform()) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const handle = await App.addListener('appStateChange', state => {
      if (state.isActive) refresh();
    });
    return () => { void handle.remove(); };
  } catch {
    return () => {};
  }
}

function formatAlarmTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function isUnsupportedNotificationError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /not supported|unavailable|not implemented/i.test(text);
}
