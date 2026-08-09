/**
 * audioStore — реестр аятов, скачанных в память устройства.
 *
 * Задача модуля — уметь ответить СИНХРОННО на вопрос «есть ли этот аят
 * локально и по какому пути его играть».  Синхронность принципиальна:
 * `useAyahAudio.getOrCreateAudio()` создаёт `<audio>` и сразу
 * присваивает `src` внутри пользовательского жеста.  Если бы путь
 * приходилось ждать через промис, iOS Safari успел бы «потерять» жест
 * и заблокировал бы `play()` как автовоспроизведение.
 *
 * Как это возможно без обращения к файловой системе на каждый аят:
 * загрузчик качает аяты строго по возрастанию сквозного номера
 * (1..6236), поэтому состояние чтеца исчерпывается одним числом —
 * до какого номера всё скачано.  Проверка превращается в сравнение
 * `n <= upTo`, а не в `stat()` по файлу.  Побочная выгода — докачка
 * после обрыва тривиальна: продолжаем с `upTo + 1`.
 *
 * Платформы:
 *   • iOS / Android (Capacitor) — файлы лежат в Directory.Data под
 *     `audio/{reciterId}/{globalAyah}.mp3`, играются через
 *     `Capacitor.convertFileSrc()`.
 *   • Браузер — офлайн-хранилище не используется вообще.  Чтобы
 *     `<audio src>` читал закэшированное, нужен service worker с
 *     перехватом запросов; в вебе это не цель проекта, поэтому здесь
 *     честный no-op, а UI показывает пояснение вместо кнопки.
 *
 * Модуль намеренно НЕ импортирует Capacitor статически: в вебе эти
 * пакеты подтянулись бы в главный чанк ради кода, который там никогда
 * не выполнится.
 */

import type { ReciterId } from './reciters';
import { globalAyahNumber, TOTAL_AYAHS } from './ayahNumbering';

export { TOTAL_AYAHS };

/** Ключ в @capacitor/preferences, где лежит прогресс по чтецам. */
const PREFS_KEY = 'audio.downloads.v1';

/** `{ alafasy: 1234 }` — до какого сквозного номера аяты скачаны. */
type Progress = Partial<Record<ReciterId, number>>;

let progress: Progress = {};
/** `file:///.../Library/…/audio` — корень папки с аудио на устройстве. */
let baseUri: string | null = null;
let native = false;
/** Стартовал ли init — защита от повторного вызова. */
let started = false;

/** Слушатели — UI перерисовывается, когда прогресс изменился. */
const listeners = new Set<() => void>();

export function subscribeAudioStore(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() {
  listeners.forEach(fn => fn());
}

/** Работает ли офлайн-хранилище на текущей платформе. */
export function isOfflineSupported(): boolean {
  return native;
}

/**
 * Поднять реестр при старте приложения.  Идемпотентно.
 *
 * Ошибки глушатся намеренно: если плагин недоступен или
 * Preferences повреждены, приложение должно продолжить работать в
 * стрим-режиме, а не падать на экране загрузки.
 */
export async function initAudioStore(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    native = Capacitor.isNativePlatform();
    if (!native) return;

    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREFS_KEY });
    if (value) {
      const parsed = JSON.parse(value) as Progress;
      // Санитизация: только известные ключи и разумные числа — иначе
      // битая запись заставила бы плеер строить пути к несуществующим
      // файлам и каждый аят падал бы в onerror.
      progress = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v > 0) {
          progress[k as ReciterId] = Math.min(TOTAL_AYAHS, Math.floor(v));
        }
      }
    }

    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    // Папка может ещё не существовать — getUri всё равно вернёт путь,
    // куда она будет создана, поэтому mkdir тут не нужен.
    const { uri } = await Filesystem.getUri({
      directory: Directory.Data,
      path: AUDIO_DIR,
    });
    baseUri = uri;
    emit();
  } catch {
    // Не нативная платформа / плагин не установлен — остаёмся в
    // стрим-режиме.
    native = false;
  }
}

/** Имя корневой папки внутри Directory.Data. */
export const AUDIO_DIR = 'audio';

/** Путь файла относительно Directory.Data. */
export function ayahFilePath(reciter: ReciterId, globalN: number): string {
  return `${AUDIO_DIR}/${reciter}/${globalN}.mp3`;
}

/** До какого сквозного номера аяты этого чтеца скачаны (0 — ничего). */
export function downloadedUpTo(reciter: ReciterId): number {
  return progress[reciter] ?? 0;
}

/**
 * Локальный src для аята — или null, если он ещё не скачан либо
 * платформа не нативная.  Синхронно: см. шапку модуля.
 */
export function localAyahSrc(
  surah: number,
  ayah: number,
  reciter: ReciterId,
): string | null {
  if (!native || !baseUri) return null;
  const n = globalAyahNumber(surah, ayah);
  if (n > downloadedUpTo(reciter)) return null;
  return convertFileSrc(`${baseUri}/${reciter}/${n}.mp3`);
}

/**
 * `Capacitor.convertFileSrc` синхронный, но сам пакет мы импортируем
 * лениво — поэтому берём функцию с глобального объекта, который
 * нативный мост ставит на window до загрузки бандла.  Обращение
 * дешёвое (чтение двух свойств), кэшировать нечего.
 *
 * Зачем вообще: WKWebView и Android WebView не умеют играть
 * `file://` напрямую из-за политики происхождения, им нужен
 * проксирующий scheme (`capacitor://localhost/_capacitor_file_/…`),
 * который и подставляет convertFileSrc.
 */
function convertFileSrc(fileUri: string): string {
  const cap = (window as unknown as {
    Capacitor?: { convertFileSrc?: (p: string) => string };
  }).Capacitor;
  return cap?.convertFileSrc ? cap.convertFileSrc(fileUri) : fileUri;
}

/** Записать прогресс чтеца и уведомить подписчиков. */
export async function setDownloadedUpTo(reciter: ReciterId, n: number): Promise<void> {
  progress[reciter] = Math.max(0, Math.min(TOTAL_AYAHS, Math.floor(n)));
  emit();
  await persist();
}

/** Удалить скачанное для чтеца целиком. */
export async function clearDownloaded(reciter: ReciterId): Promise<void> {
  delete progress[reciter];
  emit();
  await persist();
  if (!native) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.rmdir({
      directory: Directory.Data,
      path: `${AUDIO_DIR}/${reciter}`,
      recursive: true,
    });
  } catch {
    // Папки могло не быть — не ошибка.
  }
}

async function persist(): Promise<void> {
  if (!native) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(progress) });
  } catch {
    // Потеря прогресса не критична: докачка просто начнётся заново.
  }
}
