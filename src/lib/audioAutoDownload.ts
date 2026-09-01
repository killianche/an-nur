/**
 * Автозагрузка чтеца по умолчанию.
 *
 * Требование: один чтец должен оказаться на устройстве сам, без
 * похода в настройки — приложение для чтения Корана обязано работать
 * в самолёте и в метро.
 *
 * Правила, которые из этого следуют:
 *
 *  • Только по Wi-Fi.  ~850 МБ по сотовой сети без спроса — это счёт
 *    за трафик, за такое сносят приложение, а не хвалят.  Если сети
 *    нет или она сотовая, ждём: подписываемся на смену состояния и
 *    стартуем, когда появится Wi-Fi.
 *
 *  • Один раз.  Если пользователь нажал «Пауза», значит он не хочет —
 *    больше не начинаем сами, пусть управляет вручную.  Флаг живёт в
 *    Preferences, чтобы решение пережило перезапуск.  Проверяется он при
 *    КАЖДОЙ попытке старта, а не только при взводе: см. `tryStart`.
 *
 *  • Не мешаем старту.  Запуск отложен, чтобы первые секунды после
 *    открытия приложение занималось экраном, а не сетью.
 *
 * Никакого модального онбординга «скачать 850 МБ?» здесь нет
 * намеренно: загрузка идёт фоном и видна в настройках, где её можно
 * остановить. Экран-вопрос на первом запуске — отдельное решение,
 * которое стоит принимать вместе с дизайном онбординга.
 */

import { DEFAULT_RECITER } from './reciters';
import { isOfflineSupported, downloadedCount, TOTAL_AYAHS } from './audioStore';
import { startDownload, getDownloadState, type DownloadStatus } from './audioDownloads';

const PREFS_KEY = 'audio.autoDownload.optedOut';

/** Пауза перед стартом — даём приложению отрисоваться. */
const START_DELAY_MS = 4000;

let armed = false;
let unsubscribe: (() => void) | null = null;

/** Пользователь остановил автозагрузку — больше не лезем. */
export async function optOutOfAutoDownload(): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREFS_KEY, value: '1' });
  } catch { /* не нативная платформа */ }
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

async function hasOptedOut(): Promise<boolean> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREFS_KEY });
    return value === '1';
  } catch {
    return false;
  }
}

async function isOnWifi(): Promise<boolean> {
  try {
    const { Network } = await import('@capacitor/network');
    const s = await Network.getStatus();
    return s.connected && s.connectionType === 'wifi';
  } catch {
    // Плагина нет — не рискуем чужим трафиком и не качаем.
    return false;
  }
}

/**
 * Можно ли начинать автозагрузку прямо сейчас.
 *
 * Вынесено отдельной чистой функцией, потому что здесь легко ошибиться, а
 * ошибка не видна: приложение просто начинает качать 850 МБ после того, как
 * человек это остановил.
 *
 * `paused` — это не «пока не качается», а «человек нажал Паузу». Отличать
 * его от `idle` обязательно.
 */
export function shouldAutoStart(status: DownloadStatus, optedOut: boolean): boolean {
  if (optedOut) return false;
  return status === 'idle';
}

/**
 * 🔴 Проверять отказ КАЖДЫЙ раз, а не один раз при взводе.
 *
 * Здесь была ошибка, которую владелец поймал на своём телефоне. Прежняя
 * версия смотрела только «не идёт ли уже загрузка», а отказ пользователя
 * читала единожды, в `armAutoDownload`. Дальше на каждое событие
 * `networkStatusChange` — а телефон переключает сеть постоянно — она
 * запускала загрузку заново, поверх нажатой «Паузы».
 *
 * Со стороны это выглядело так: человек жмёт «Пауза», состояние на миг
 * становится `paused`, следующее сетевое событие возвращает `running`, и
 * кнопка кажется неработающей. Причём именно у чтеца по умолчанию — у
 * остальных автозагрузки нет, и там всё «работало».
 */
async function tryStart() {
  if (!shouldAutoStart(getDownloadState(DEFAULT_RECITER).status, await hasOptedOut())) {
    return;
  }
  void startDownload(DEFAULT_RECITER, { kind: 'all' });
}

/**
 * Поставить автозагрузку на взвод.  Вызывается один раз при старте,
 * после initAudioStore (ему нужен уже поднятый реестр, чтобы не
 * качать то, что лежит).
 */
export async function armAutoDownload(): Promise<void> {
  if (armed) return;
  armed = true;

  if (!isOfflineSupported()) return;
  if (await hasOptedOut()) return;
  // Уже всё скачано — нечего делать.
  if (downloadedCount(DEFAULT_RECITER) >= TOTAL_AYAHS) return;

  window.setTimeout(async () => {
    if (await isOnWifi()) { tryStart(); return; }
    // Wi-Fi нет — ждём его появления.
    try {
      const { Network } = await import('@capacitor/network');
      const handle = await Network.addListener('networkStatusChange', s => {
        if (s.connected && s.connectionType === 'wifi') void tryStart();
      });
      unsubscribe = () => { void handle.remove(); };
    } catch { /* нет плагина — просто не качаем сами */ }
  }, START_DELAY_MS);
}
