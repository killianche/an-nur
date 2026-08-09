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
 * ── Почему fetch + writeFile ──────────────────────────────────────────
 *
 * `Filesystem.downloadFile` помечен deprecated с @capacitor/filesystem
 * 7.1.0 и предлагает тянуть отдельный плагин @capacitor/file-transfer.
 * Ради того же результата новая зависимость не нужна: файлы мелкие
 * (~60 КБ при 64 kbps), base64-конвертация одного стоит доли
 * миллисекунды и не копится в памяти.
 *
 * Параллельность 4: упираемся не в сеть, а в запись через мост
 * Capacitor, и на бюджетных Android-устройствах восемь одновременных
 * записей начинают подъедать UI-поток.
 *
 * Загрузка живёт в модуле, а не в компоненте: попап настроек можно
 * закрыть и уйти читать, задание продолжится.
 */

import type { ReciterId } from './reciters';
import { reciterById } from './reciters';
import {
  globalAyahNumber, ayahsInSurah, firstGlobalOfSurah, juzRange,
  TOTAL_AYAHS, TOTAL_SURAHS,
} from './ayahNumbering';
import {
  hasAyah, markDownloaded, ayahFilePath, isOfflineSupported, persistNow,
} from './audioStore';

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
export const AVG_AYAH_BYTES = 139 * 1024;

export function estimateBytes(ayahCount: number): number {
  return AVG_AYAH_BYTES * ayahCount;
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

function expandScope(scope: DownloadScope): [number, number][] {
  if (scope.kind === 'surah') {
    const count = ayahsInSurah(scope.surah);
    return Array.from({ length: count }, (_, i) => [scope.surah, i + 1] as [number, number]);
  }
  if (scope.kind === 'juz') {
    const [from, to] = juzRange(scope.juz);
    return ayahsInGlobalRange(from, to);
  }
  return prioritiseForFullDownload(ayahsInGlobalRange(1, TOTAL_AYAHS));
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

/** Сколько аятов в области ещё нет на устройстве. */
export function missingCount(reciter: ReciterId, scope: DownloadScope): number {
  let n = 0;
  for (const [s, a] of expandScope(scope)) {
    if (!hasAyah(reciter, globalAyahNumber(s, a))) n++;
  }
  return n;
}

// ─── Скачивание одного аята ─────────────────────────────────────────────

/** URL аята у CDN — тот же, что использует стриминг. */
function cdnUrl(reciter: ReciterId, surah: number, ayah: number): string {
  const r = reciterById(reciter);
  if (r.slug) {
    return `https://cdn.islamic.network/quran/audio/64/${r.slug}/${globalAyahNumber(surah, ayah)}.mp3`;
  }
  if (r.everyayahDir) {
    const p3 = (n: number) => String(n).padStart(3, '0');
    return `https://everyayah.com/data/${r.everyayahDir}/${p3(surah)}${p3(ayah)}.mp3`;
  }
  throw new Error(`нет источника аудио для чтеца ${reciter}`);
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Чанками, а не String.fromCharCode(...bytes): на файле в ~140 КБ
  // спред развернулся бы в 140 000 аргументов и уронил стек.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Скачать и записать один аят.  Возвращает размер в байтах. */
async function fetchAndStore(reciter: ReciterId, surah: number, ayah: number): Promise<number> {
  const res = await fetch(cdnUrl(reciter, surah, ayah));
  if (!res.ok) throw new Error(`${surah}:${ayah} — HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({
    directory: Directory.LibraryNoCloud,
    path: ayahFilePath(reciter, surah, ayah),
    data: toBase64(buf),
    recursive: true,
  });
  markDownloaded(reciter, surah, ayah);
  return buf.byteLength;
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
