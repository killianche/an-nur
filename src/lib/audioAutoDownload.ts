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

import { DEFAULT_RECITER, RECITERS, hasSurahAudio } from './reciters';
import { isOfflineSupported, downloadedCount, surahFileCount, TOTAL_AYAHS, TOTAL_SURAHS } from './audioStore';
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
  // 🔴 Не начинаем вторую фонотеку поверх первой.
  //
  // Чтец по умолчанию сменился на Ясира (05.09.2026), и у тех, кто не выбирал
  // чтеца руками, на диске уже лежал автоскачанный Аляфаси — около 0.7 ГБ.
  // Без этой проверки поверх него молча начиналась бы закачка Ясира ещё на
  // 1.4 ГБ: до двух с лишним гигабайт на телефоне, о которых человек не
  // просил. Разрешение владельца «пусть качают» относилось к одной фонотеке,
  // а не к сумме.
  //
  // Поэтому автозагрузка стартует только на чистом устройстве. Если что-то уже
  // скачано — решение о второй фонотеке принимает человек кнопкой.
  for (const r of RECITERS) {
    if (r.id === DEFAULT_RECITER) continue;
    if (downloadedCount(r.id) > 0 || surahFileCount(r.id) > 0) return;
  }

  // 🔴 И не заводимся поверх УЖЕ СОБРАННОЙ поаятной фонотеки того же чтеца.
  //
  // 06.09.2026 фонотека переехала на сплошные записи сур. У того, кто раньше
  // скачал Ясира поаятно (около 1.4 ГБ), автозагрузка иначе молча положила бы
  // рядом второй такой же комплект — до 2.8 ГБ звука одного чтеца. Ничего не
  // удаляем сами: старые файлы остаются рабочим офлайном (со швами), а
  // решение перекачать библиотеку принимает человек кнопкой «Скачать».
  //
  // Само правило — в `shouldBuildSurahLibrary`, оно покрыто тестами.
  if (!shouldBuildSurahLibrary(
    surahFileCount(DEFAULT_RECITER), downloadedCount(DEFAULT_RECITER))) return;

  void startDownload(DEFAULT_RECITER, { kind: 'all' });
}

/**
 * Начинать ли собирать фонотеку сплошными записями.
 *
 * 06.09.2026 фонотека переехала с 6236 поаятных файлов на 114 сплошных
 * записей сур. У того, кто раньше скачал чтеца поаятно (около 1.4 ГБ),
 * автозагрузка иначе молча положила бы рядом второй такой же комплект — до
 * 2.8 ГБ звука одного чтеца. Ничего не удаляем сами: старые файлы остаются
 * рабочим офлайном, а решение перекачать библиотеку принимает человек.
 *
 * Порог, а не «больше нуля»: поаятные файлы могли осесть от чтения в старых
 * версиях (там прозвучавший аят тихо сохранялся) и от аварийного режима.
 * Отказывать из-за пары десятков таких файлов нельзя — это не фонотека.
 */
export function shouldBuildSurahLibrary(сплошных: number, поаятных: number): boolean {
  if (сплошных >= TOTAL_SURAHS) return false;
  if (сплошных > 0) return true;
  return поаятных < TOTAL_AYAHS / 4;
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
  //
  // Считаем в тех единицах, в которых теперь и качаем: фонотека собирается
  // сплошными записями сур (114 файлов). Проверка по 6236 аятам после
  // перехода означала бы, что автозагрузка каждый раз считает библиотеку
  // пустой и заводится поверх готовой.
  const собрано = hasSurahAudio(DEFAULT_RECITER)
    ? !shouldBuildSurahLibrary(surahFileCount(DEFAULT_RECITER), downloadedCount(DEFAULT_RECITER))
    : downloadedCount(DEFAULT_RECITER) >= TOTAL_AYAHS;
  if (собрано) return;

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
