/**
 * audioDownloads — менеджер офлайн-загрузки чтеца.
 *
 * Качает аяты строго по возрастанию сквозного номера (1..6236) и после
 * каждой пачки двигает «планку» в audioStore.  Такой порядок — не
 * стилистика, а условие синхронной проверки в audioStore: там
 * «скачан ли аят» это сравнение `n <= upTo`, и оно верно только если
 * дырок в последовательности нет.  Отсюда же бесплатная докачка после
 * обрыва: продолжаем с `upTo + 1`.
 *
 * Почему fetch + writeFile, а не Filesystem.downloadFile:
 * `downloadFile` помечен deprecated начиная с @capacitor/filesystem
 * 7.1.0 (рекомендуют отдельный плагин @capacitor/file-transfer).
 * Тянуть ещё одну зависимость ради того же результата смысла нет —
 * файлы маленькие (в среднем ~95 КБ), base64-конвертация одного такого
 * стоит доли миллисекунды и не держит память, потому что мы не копим
 * их в массиве.
 *
 * Параллельность = 4.  Больше не даёт выигрыша: упираемся не в
 * задержку сети, а в запись на диск через мост Capacitor, и на
 * бюджетных Android-устройствах восемь одновременных записей начинают
 * тормозить UI-поток.
 *
 * Загрузка живёт в модуле, а не в компоненте: пользователь должен
 * иметь возможность закрыть попап настроек и уйти читать, пока
 * качается.
 */

import type { ReciterId } from './reciters';
import { reciterById } from './reciters';
import {
  TOTAL_AYAHS, ayahFilePath, downloadedUpTo, setDownloadedUpTo,
  clearDownloaded, isOfflineSupported,
} from './audioStore';

/** Сколько аятов качаем одновременно. */
const CONCURRENCY = 4;
/** Через сколько скачанных аятов фиксировать планку в Preferences. */
const CHECKPOINT_EVERY = 25;

export type DownloadStatus = 'idle' | 'running' | 'paused' | 'error';

export type DownloadState = {
  status: DownloadStatus;
  /** Сколько аятов уже лежит на устройстве. */
  done: number;
  total: number;
  /** Реально записано байт за текущую сессию загрузки. */
  bytes: number;
  error: string | null;
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
  return state.get(reciter) ?? {
    status: 'idle',
    done: downloadedUpTo(reciter),
    total: TOTAL_AYAHS,
    bytes: 0,
    error: null,
  };
}

function patch(reciter: ReciterId, next: Partial<DownloadState>) {
  state.set(reciter, { ...getDownloadState(reciter), ...next });
  emit();
}

/**
 * Оценка полного размера одного чтеца.
 *
 * Выведена из реально лежащих в пакете 594 mp3 Аляфаси (суры 67–114):
 * 54.2 МБ / 594 ≈ 93.5 КБ на аят при 64 kbps.  Это НИЖНЯЯ граница:
 * в джузе Амма аяты короткие, а в длинных сурах — заметно длиннее,
 * поэтому фактический размер выходит больше.  Показываем как «≈» и
 * рядом всегда даём реально скачанные байты.
 * CHECK: уточнить после первой полной загрузки на устройстве.
 */
export const AVG_AYAH_BYTES = 93.5 * 1024;

export function estimatedTotalBytes(): number {
  return AVG_AYAH_BYTES * TOTAL_AYAHS;
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} ГБ`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} МБ`;
  return `${Math.round(n / 1024)} КБ`;
}

/** URL аята у CDN — тот же, что использует стриминг. */
function cdnUrl(reciter: ReciterId, globalN: number): string {
  const r = reciterById(reciter);
  if (r.slug) {
    return `https://cdn.islamic.network/quran/audio/64/${r.slug}/${globalN}.mp3`;
  }
  // everyayah требует номер относительно суры, а мы идём по сквозному —
  // такие чтецы в офлайн-загрузку пока не берём (в текущем каталоге их нет).
  throw new Error(`нет CDN-источника по сквозному номеру для чтеца ${reciter}`);
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Чанками, а не String.fromCharCode(...bytes): на файле в ~95 КБ
  // спред развернулся бы в 95 000 аргументов и уронил стек.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Запустить (или продолжить) загрузку чтеца.
 *
 * Возвращает промис, который резолвится по завершении, отмене или
 * ошибке — состояние читается через getDownloadState().
 */
export async function startDownload(reciter: ReciterId): Promise<void> {
  if (!isOfflineSupported()) {
    patch(reciter, {
      status: 'error',
      error: 'Офлайн-загрузка доступна только в приложении для iOS и Android.',
    });
    return;
  }
  if (getDownloadState(reciter).status === 'running') return;

  cancelFlags.delete(reciter);
  const from = downloadedUpTo(reciter) + 1;
  patch(reciter, { status: 'running', done: from - 1, error: null, bytes: 0 });

  if (from > TOTAL_AYAHS) {
    patch(reciter, { status: 'idle', done: TOTAL_AYAHS });
    return;
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem');

  // Планка двигается только по непрерывному префиксу.  При
  // параллельности 4 аяты могут дописаться не по порядку, поэтому
  // держим множество готовых и продвигаем планку, пока следующий
  // номер в нём есть.
  let frontier = from - 1;
  const ready = new Set<number>();
  let bytes = 0;
  let sinceCheckpoint = 0;
  let failed: string | null = null;

  const advance = async () => {
    let moved = false;
    while (ready.has(frontier + 1)) {
      ready.delete(frontier + 1);
      frontier++;
      moved = true;
      sinceCheckpoint++;
    }
    if (!moved) return;
    patch(reciter, { done: frontier, bytes });
    if (sinceCheckpoint >= CHECKPOINT_EVERY || frontier >= TOTAL_AYAHS) {
      sinceCheckpoint = 0;
      await setDownloadedUpTo(reciter, frontier);
    }
  };

  const fetchOne = async (n: number) => {
    const res = await fetch(cdnUrl(reciter, n));
    if (!res.ok) throw new Error(`аят ${n}: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    await Filesystem.writeFile({
      directory: Directory.Data,
      path: ayahFilePath(reciter, n),
      data: toBase64(buf),
      recursive: true,
    });
    bytes += buf.byteLength;
    ready.add(n);
    await advance();
  };

  // Пул из CONCURRENCY воркеров, разбирающих общий курсор.
  let cursor = from;
  const worker = async () => {
    for (;;) {
      if (cancelFlags.has(reciter) || failed) return;
      const n = cursor++;
      if (n > TOTAL_AYAHS) return;
      try {
        await fetchOne(n);
      } catch (e) {
        failed = e instanceof Error ? e.message : 'ошибка загрузки';
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Планку фиксируем в любом исходе — даже при обрыве прогресс не теряется.
  await setDownloadedUpTo(reciter, frontier);

  if (cancelFlags.has(reciter)) {
    cancelFlags.delete(reciter);
    patch(reciter, { status: 'paused', done: frontier, bytes });
  } else if (failed) {
    patch(reciter, { status: 'error', done: frontier, bytes, error: failed });
  } else {
    patch(reciter, { status: 'idle', done: frontier, bytes });
  }
}

/** Остановить загрузку.  Уже скачанное остаётся, докачка продолжит с планки. */
export function pauseDownload(reciter: ReciterId): void {
  if (getDownloadState(reciter).status !== 'running') return;
  cancelFlags.add(reciter);
}

/** Удалить скачанное целиком. */
export async function removeDownload(reciter: ReciterId): Promise<void> {
  pauseDownload(reciter);
  await clearDownloaded(reciter);
  patch(reciter, { status: 'idle', done: 0, bytes: 0, error: null });
}
