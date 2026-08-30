/**
 * audioDownloads — загрузка аудио на устройство.
 *
 * ── Модель ────────────────────────────────────────────────────────────
 *
 * Единица работы — ЗАДАНИЕ: произвольный список аятов, которых ещё нет
 * на устройстве.  Задание собирается из чего угодно — одной суры,
 * джуза, всего Корана или одного аята — и выполняется пулом воркеров в
 * любом порядке.  Никакой «планки, до которой скачано»: состояние
 * живёт в битовой карте audioStore, где каждый аят независим.
 *
 * Порядок внутри задания всё же осмысленный — по возрастанию номера,
 * чтобы человек, скачивающий суру и одновременно её читающий, получал
 * аяты примерно в том порядке, в каком дойдёт до них глазами.  Но это
 * удобство, а не требование модели: прерви и продолжи с любого места.
 *
 * ── Кэш по воспроизведению ────────────────────────────────────────────
 *
 * `cacheAyah()` тихо кладёт на диск аят, который только что играл со
 * стрима.  Так библиотека растёт сама собой от обычного чтения, без
 * единого нажатия «скачать».  Вызывается из useAyahAudio.
 *
 * ── Почему CapacitorHttp, а не fetch ──────────────────────────────────
 *
 * Первая версия качала обычным `fetch()`, и на устройстве это НЕ
 * РАБОТАЛО ВООБЩЕ: каждая загрузка падала с «Load failed».
 * Причина — CORS.  Страница в WebView живёт на origin
 * `capacitor://localhost`, а `cdn.islamic.network` не отдаёт заголовок
 * `Access-Control-Allow-Origin` (проверено curl'ом), поэтому браузер
 * режет кросс-доменный fetch.  При этом стриминг работал и сбивал с
 * толку: медиа-элементу `<audio src>` CORS не нужен, ему хватает
 * простого GET.
 *
 * `CapacitorHttp` входит в @capacitor/core, выполняет запрос НАТИВНО —
 * то есть мимо браузерной политики происхождения — и для
 * `responseType: 'blob'` возвращает уже готовый base64.  Это заодно
 * убирает нашу собственную конвертацию: `Filesystem.writeFile` хочет
 * ровно base64.
 *
 * Альтернативы, которые отвергнуты: `Filesystem.downloadFile`
 * (deprecated с 7.1.0), отдельный плагин @capacitor/file-transfer
 * (лишняя зависимость ради того же), включение глобального патча
 * fetch через `plugins.CapacitorHttp.enabled` (подменяет window.fetch
 * во всём приложении — слишком широкий побочный эффект ради одной
 * функции).
 *
 * Параллельность 4: упираемся не в сеть, а в запись через мост
 * Capacitor, и на бюджетных Android-устройствах восемь одновременных
 * записей начинают подъедать UI-поток.
 *
 * Загрузка живёт в модуле, а не в компоненте: попап настроек можно
 * закрыть и уйти читать, задание продолжится.
 */

import type { ReciterId } from './reciters';
import { reciterById, supportsAyahOffline } from './reciters';
import {
  globalAyahNumber, ayahsInSurah, firstGlobalOfSurah, juzRange,
  TOTAL_AYAHS, TOTAL_SURAHS,
} from './ayahNumbering';
import {
  hasAyah, markDownloaded, ayahFilePath, isOfflineSupported, persistNow,
  downloadedCount, downloadedInSurah,
} from './audioStore';
import { remoteAyahAudioUrl } from './quranUtils';

/** Сколько аятов качаем одновременно. */
const CONCURRENCY = 4;

/** Что именно качаем — для подписи в интерфейсе. */
export type DownloadScope =
  | { kind: 'surah'; surah: number }
  | { kind: 'juz'; juz: number }
  | { kind: 'all' };

export type DownloadStatus = 'idle' | 'running' | 'paused' | 'error';

export type DownloadState = {
  status: DownloadStatus;
  scope: DownloadScope | null;
  /** Сколько аятов задания уже на устройстве. */
  done: number;
  /** Сколько всего в задании (только недостающие на момент старта). */
  total: number;
  /** Байт записано за текущее задание. */
  bytes: number;
  error: string | null;
};

const IDLE: DownloadState = {
  status: 'idle', scope: null, done: 0, total: 0, bytes: 0, error: null,
};

const state = new Map<ReciterId, DownloadState>();
const cancelFlags = new Set<ReciterId>();
const listeners = new Set<() => void>();

export function subscribeDownloads(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() {
  listeners.forEach(fn => fn());
}

export function getDownloadState(reciter: ReciterId): DownloadState {
  return state.get(reciter) ?? IDLE;
}

function patch(reciter: ReciterId, next: Partial<DownloadState>) {
  state.set(reciter, { ...getDownloadState(reciter), ...next });
  emit();
}

// ─── Оценка размера ─────────────────────────────────────────────────────

/**
 * Средний вес аята при 64 kbps.
 *
 * Замерено по 594 mp3 Аляфаси, лежащим в пакете (суры 67–114):
 * 54.2 МБ / 594 ≈ 93.5 КБ.  Это НИЖНЯЯ оценка: в джузе Амма аяты
 * короткие, в длинных сурах заметно длиннее.  По полной длительности
 * чтения (29.5 ч при 64 kbps ≈ 850 МБ / 6236) выходит ~139 КБ —
 * берём это как более честное среднее.
 * CHECK: уточнить после первой полной загрузки на устройстве.
 */
export const AVG_AYAH_BYTES_64KBPS = 139 * 1024;

export function estimateBytes(reciter: ReciterId, ayahCount: number): number {
  const bitrateRatio = reciterById(reciter).bitrateKbps / 64;
  return AVG_AYAH_BYTES_64KBPS * bitrateRatio * ayahCount;
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} ГБ`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} МБ`;
  return `${Math.round(n / 1024)} КБ`;
}

// ─── Разворачивание scope в список аятов ────────────────────────────────

/** Все пары (сура, аят) диапазона сквозных номеров. */
function ayahsInGlobalRange(from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
    const first = firstGlobalOfSurah(surah);
    const count = ayahsInSurah(surah);
    const last = first + count - 1;
    if (last < from || first > to) continue;
    for (let a = 1; a <= count; a++) {
      const g = first + a - 1;
      if (g >= from && g <= to) out.push([surah, a]);
    }
  }
  return out;
}

/**
 * Развёрнутый список всех аятов в приоритетном порядке.
 *
 * Список статичен, а строился он заново на каждый вызов expandScope —
 * включая вызовы из рендера карточки загрузок.  Сортировка 6236
 * элементов компаратором со сквозной нумерацией стоила ~9 мс на
 * ноутбуке и в разы больше на телефоне; при активной загрузке это
 * складывалось в постоянный фриз интерфейса.  Считаем один раз.
 */
let cachedAll: [number, number][] | null = null;
function allAyahsPrioritised(): [number, number][] {
  if (!cachedAll) {
    cachedAll = prioritiseForFullDownload(ayahsInGlobalRange(1, TOTAL_AYAHS));
  }
  return cachedAll;
}

function expandScope(scope: DownloadScope): [number, number][] {
  if (scope.kind === 'surah') {
    const count = ayahsInSurah(scope.surah);
    return Array.from({ length: count }, (_, i) => [scope.surah, i + 1] as [number, number]);
  }
  if (scope.kind === 'juz') {
    const [from, to] = juzRange(scope.juz);
    return ayahsInGlobalRange(from, to);
  }
  return allAyahsPrioritised();
}

/**
 * Порядок для загрузки всего Корана.
 *
 * Полный чтец при 64 kbps весит ~850 МБ и качается десятки минут.
 * Качать его подряд с Аль-Фатихи и Бакары значит, что первые полчаса
 * офлайн не работает ровно то, что читают чаще всего: короткие суры
 * джуза Амма и Аль-Фатиха в намазе.
 *
 * Поэтому впереди Аль-Фатиха и весь 30-й джуз — это ~10 % объёма,
 * приезжает за пару минут и закрывает большинство повседневных
 * сценариев.  Остальное подтягивается следом обычным порядком.
 *
 * На саму модель это не влияет: очередь — просто список, порядок в
 * ней вопрос удобства, а не корректности.
 */
function prioritiseForFullDownload(all: [number, number][]): [number, number][] {
  const [juz30From] = juzRange(30);
  const rank = ([surah, ayah]: [number, number]): number => {
    if (surah === 1) return 0;                                   // Аль-Фатиха
    if (globalAyahNumber(surah, ayah) >= juz30From) return 1;    // джуз Амма
    return 2;                                                    // всё прочее
  };
  return [...all].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return globalAyahNumber(a[0], a[1]) - globalAyahNumber(b[0], b[1]);
  });
}

/**
 * Сколько аятов области ещё нет на устройстве.
 *
 * Для всего Корана и для суры считаем по счётчикам битовой карты, не
 * разворачивая список: функция зовётся из рендера, а разворачивание
 * 6236 пар там обходилось дороже самой отрисовки.
 */
export function missingCount(reciter: ReciterId, scope: DownloadScope): number {
  if (scope.kind === 'all') {
    return TOTAL_AYAHS - downloadedCount(reciter);
  }
  if (scope.kind === 'surah') {
    return ayahsInSurah(scope.surah) - downloadedInSurah(reciter, scope.surah);
  }
  let n = 0;
  for (const [s, a] of expandScope(scope)) {
    if (!hasAyah(reciter, globalAyahNumber(s, a))) n++;
  }
  return n;
}

// ─── Скачивание одного аята ─────────────────────────────────────────────

/** URL аята у CDN — тот же, что использует стриминг. */
function cdnUrl(reciter: ReciterId, surah: number, ayah: number): string {
  return remoteAyahAudioUrl(surah, ayah, reciter);
}

/** Длина исходных данных по длине base64 — чтобы не декодировать
 *  строку обратно только ради счётчика байт. */
function base64ByteLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, (b64.length * 3) / 4 - padding);
}

/** Скачать и записать один аят.  Возвращает размер в байтах. */
async function fetchAndStore(reciter: ReciterId, surah: number, ayah: number): Promise<number> {
  const [{ CapacitorHttp }, { Filesystem, Directory }] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/filesystem'),
  ]);

  const res = await CapacitorHttp.request({
    url: cdnUrl(reciter, surah, ayah),
    method: 'GET',
    // 'blob' на нативной платформе возвращает base64-строку — именно
    // то, что принимает Filesystem.writeFile.
    responseType: 'blob',
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${surah}:${ayah} — HTTP ${res.status}`);
  }
  const data = res.data;
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error(`${surah}:${ayah} — пустой ответ`);
  }

  await Filesystem.writeFile({
    directory: Directory.LibraryNoCloud,
    path: ayahFilePath(reciter, surah, ayah),
    data,
    recursive: true,
  });
  markDownloaded(reciter, surah, ayah);
  return base64ByteLength(data);
}

/**
 * Тихо положить аят на диск, если его там ещё нет.
 *
 * Вызывается после успешного воспроизведения со стрима: библиотека
 * растёт от обычного чтения.  Ошибки проглатываются — это фоновая
 * любезность, а не операция, о провале которой стоит сообщать.
 */
export function cacheAyah(reciter: ReciterId, surah: number, ayah: number): void {
  if (!isOfflineSupported()) return;
  if (!supportsAyahOffline(reciter)) return;
  if (hasAyah(reciter, globalAyahNumber(surah, ayah))) return;
  void fetchAndStore(reciter, surah, ayah).catch(() => { /* не мешаем чтению */ });
}

// ─── Задания ────────────────────────────────────────────────────────────

/**
 * Запустить (или продолжить) загрузку области.
 *
 * Повторный вызов после паузы просто пересобирает список недостающих —
 * поэтому докачка не требует ни курсора, ни отдельного кода
 * возобновления.
 */
export async function startDownload(reciter: ReciterId, scope: DownloadScope): Promise<void> {
  if (!isOfflineSupported()) {
    patch(reciter, {
      status: 'error',
      error: 'Скачивание доступно только в приложении для iOS и Android.',
    });
    return;
  }
  if (!supportsAyahOffline(reciter)) {
    patch(reciter, {
      status: 'error',
      error: 'Для этого чтеца пока доступно только потоковое воспроизведение.',
    });
    return;
  }
  if (getDownloadState(reciter).status === 'running') return;

  cancelFlags.delete(reciter);

  const targets = expandScope(scope)
    .filter(([s, a]) => !hasAyah(reciter, globalAyahNumber(s, a)));

  if (targets.length === 0) {
    patch(reciter, { ...IDLE, scope });
    return;
  }

  patch(reciter, {
    status: 'running', scope, done: 0, total: targets.length, bytes: 0, error: null,
  });

  let done = 0;
  let bytes = 0;
  let failed: string | null = null;
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      if (cancelFlags.has(reciter) || failed) return;
      const i = cursor++;
      if (i >= targets.length) return;
      const [surah, ayah] = targets[i];
      try {
        bytes += await fetchAndStore(reciter, surah, ayah);
        done++;
        patch(reciter, { done, bytes });
      } catch (e) {
        failed = e instanceof Error ? e.message : 'ошибка загрузки';
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await persistNow();

  if (cancelFlags.has(reciter)) {
    cancelFlags.delete(reciter);
    patch(reciter, { status: 'paused', done, bytes });
  } else if (failed) {
    patch(reciter, { status: 'error', done, bytes, error: failed });
  } else {
    patch(reciter, { ...IDLE, scope });
  }
}

/** Остановить.  Скачанное остаётся, повторный запуск доберёт остальное. */
export function pauseDownload(reciter: ReciterId): void {
  if (getDownloadState(reciter).status !== 'running') return;
  cancelFlags.add(reciter);
}

/** Сбросить состояние задания в интерфейсе (после удаления, например). */
export function resetDownloadState(reciter: ReciterId): void {
  cancelFlags.delete(reciter);
  state.set(reciter, IDLE);
  emit();
}
