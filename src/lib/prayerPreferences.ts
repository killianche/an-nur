/**
 * Пользовательские предпочтения экрана намаза.
 *
 * Основное расписание отделено от временно открытого источника: человек
 * может сравнить «Назрань 1», «Назрань 2» и расчёт, не меняя стартовый
 * вариант. При следующем открытии вкладки всегда восстанавливается именно
 * выбранное здесь основное расписание.
 */
import type { PrayerTimeSource } from './prayerTimes';

const PRIMARY_SOURCE_KEY = 'prayer.primary-source.v1';

export const DEFAULT_PRIMARY_PRAYER_SOURCE: PrayerTimeSource = 'nazran-1';

export function normalisePrimaryPrayerSource(value: unknown): PrayerTimeSource {
  return value === 'nazran-1' || value === 'nazran-2' || value === 'calculated'
    ? value
    : DEFAULT_PRIMARY_PRAYER_SOURCE;
}

export function readPrimaryPrayerSource(): PrayerTimeSource {
  if (typeof window === 'undefined') return DEFAULT_PRIMARY_PRAYER_SOURCE;
  return normalisePrimaryPrayerSource(localStorage.getItem(PRIMARY_SOURCE_KEY));
}

export function writePrimaryPrayerSource(source: PrayerTimeSource): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRIMARY_SOURCE_KEY, source);
}
