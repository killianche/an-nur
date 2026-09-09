/**
 * audioStore — реестр аятов, скачанных в память устройства.
 *
 * ── Что должен уметь ──────────────────────────────────────────────────
 *
 *  1. Отвечать СИНХРОННО на вопрос «есть ли этот аят локально».
 *     Синхронность обязательна: useAyahAudio присваивает `src` внутри
 *     пользовательского жеста, и если ждать промис, iOS сочтёт
 *     воспроизведение автоматическим и заблокирует play().
 *
 *  2. Не навязывать порядок.  Аяты скачиваются как угодно: сура целиком,
 *     джуз, весь Коран, один аят по тапу — любая дырявая комбинация
 *     должна выражаться точно.
 *
 * ── Как устроено ──────────────────────────────────────────────────────
 *
 * Индекс — БИТОВАЯ КАРТА на чтеца: 6236 бит = 780 байт.  Проверка это
 * сдвиг и маска, O(1); любой аят независим от соседей.  Вся карта в
 * base64 занимает ~1 КБ в Preferences.
 *
 * Первая версия модуля хранила вместо карты одно число «скачано до
 * аята N» и требовала качать строго по возрастанию.  Это дёшево, но не
 * выражает «скачана середина Бакары» — то есть ломает главный сценарий
 * приложения.  Карта решает ту же задачу за 780 байт.
 *
 * Источник истины — ФАЙЛОВАЯ СИСТЕМА, карта лишь быстрый индекс над
 * ней.  Если карта потерялась, `rebuildFromFilesystem()` пересобирает
 * её обходом папок.  Так же устроено в quran_android: состояние
 * загрузок там тоже выводится сканированием диска в кэш в памяти.
 *
 * ── Где лежат файлы ───────────────────────────────────────────────────
 *
 *   {LibraryNoCloud}/audio/{чтец}/{сура}/{аят}.mp3
 *
 * LibraryNoCloud, а не Data: на iOS Data это Documents, который уходит
 * в iCloud-бэкап, и Apple отклоняет сборки с формулировкой «your app
 * stores X MB on the user's iCloud, which does not comply with the iOS
 * Data Storage Guidelines».  Докачиваемый контент, нужный офлайн,
 * полагается класть в Library с атрибутом «не бэкапить» — это ровно
 * LibraryNoCloud.  Cache не подходит: система вправе вычистить его под
 * нехватку места, и «офлайн» перестанет быть офлайном.
 *
 * Аяты разложены по подпапкам сур (как в quran_android): вопрос
 * «скачана ли сура целиком» — это один readdir на ≤286 записей, а не
 * обход всех 6236 файлов.
 *
 * Capacitor импортируется лениво: в вебе эти пакеты не нужны и не
 * должны попадать в главный чанк.
 */

import type { ReciterId } from './reciters';
import {
  globalAyahNumber, ayahsInSurah, firstGlobalOfSurah,
  TOTAL_AYAHS, TOTAL_SURAHS,
} from './ayahNumbering';

export { TOTAL_AYAHS, TOTAL_SURAHS };

/** Размер битовой карты в байтах: 6236 бит → 780 байт. */
const BITMAP_BYTES = Math.ceil(TOTAL_AYAHS / 8);

/** Ключ в @capacitor/preferences.  v2 — прошлая версия хранила
 *  «скачано до N» и несовместима; старое значение игнорируется, а
 *  реальное состояние восстановится сканом файловой системы. */
const PREFS_KEY = 'audio.downloads.v2';

/** Корневая папка внутри LibraryNoCloud. */
const AUDIO_DIR = 'audio';

/**
 * Ключ для СПЛОШНЫХ записей сур — отдельный от карты аятов.
 *
 * Зачем вообще второе хранилище. Поаятные файлы дают гибкость (любой кусок,
 * докачка), но играть суру подряд из них можно только подменяя аудиоэлемент
 * на каждой границе, а это шов. Сплошная запись суры — тот же файл, что
 * играет из сети, поэтому офлайн идёт ровно тем же путём: одна дорожка, одни
 * и те же тайминги аятов, переключать нечего.
 */
const SURAH_PREFS_KEY = 'audio.surahFiles.v1';

type Bitmaps = Partial<Record<ReciterId, Uint8Array>>;

const maps: Bitmaps = {};
/** Скачанные целиком записи сур: чтец → набор номеров сур. */
const surahFiles: Partial<Record<ReciterId, Set<number>>> = {};
/** `file:///.../Library/audio` — корень аудио на устройстве. */
let baseUri: string | null = null;
let native = false;
let started = false;

const listeners = new Set<() => void>();

export function subscribeAudioStore(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() {
  listeners.forEach(fn => fn());
}

/**
 * Оповещение с коалесцированием в один кадр.
 *
 * Загрузчик отмечает аяты десятками в секунду, и каждый emit тянет за
 * собой перерисовку карточки загрузок.  Через rAF все отметки, попавшие
 * в один кадр, сливаются в одно оповещение — интерфейс обновляется не
 * реже, чем его вообще способен увидеть глаз, и не чаще.
 */
let emitScheduled = false;
function emitCoalesced() {
  if (emitScheduled) return;
  emitScheduled = true;
  const run = () => { emitScheduled = false; emit(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

/** Работает ли офлайн-хранилище на текущей платформе. */
export function isOfflineSupported(): boolean {
  return native;
}

// ─── Битовая карта ──────────────────────────────────────────────────────

function mapFor(reciter: ReciterId): Uint8Array {
  let m = maps[reciter];
  if (!m) {
    m = new Uint8Array(BITMAP_BYTES);
    maps[reciter] = m;
  }
  return m;
}

/** Есть ли аят локально.  Синхронно — см. шапку модуля. */
export function hasAyah(reciter: ReciterId, globalN: number): boolean {
  if (globalN < 1 || globalN > TOTAL_AYAHS) return false;
  const m = maps[reciter];
  if (!m) return false;
  const i = globalN - 1;
  return (m[i >> 3] & (1 << (i & 7))) !== 0;
}

function setBit(reciter: ReciterId, globalN: number, on: boolean) {
  if (globalN < 1 || globalN > TOTAL_AYAHS) return;
  const m = mapFor(reciter);
  const i = globalN - 1;
  if (on) m[i >> 3] |= (1 << (i & 7));
  else    m[i >> 3] &= ~(1 << (i & 7));
}

/** Сколько аятов чтеца лежит на устройстве. */
export function downloadedCount(reciter: ReciterId): number {
  const m = maps[reciter];
  if (!m) return 0;
  let n = 0;
  for (let b = 0; b < m.length; b++) {
    // Приём Кернигана: v &= v-1 гасит младший установленный бит, так
    // что цикл идёт по числу единиц, а не по восьми битам байта.
    let v = m[b];
    while (v) { v &= v - 1; n++; }
  }
  return n;
}

/** Сколько аятов суры уже скачано. */
export function downloadedInSurah(reciter: ReciterId, surah: number): number {
  if (!maps[reciter]) return 0;
  const first = firstGlobalOfSurah(surah);
  const count = ayahsInSurah(surah);
  let n = 0;
  for (let k = 0; k < count; k++) if (hasAyah(reciter, first + k)) n++;
  return n;
}

/** Скачана ли сура целиком. */
export function isSurahComplete(reciter: ReciterId, surah: number): boolean {
  const total = ayahsInSurah(surah);
  return total > 0 && downloadedInSurah(reciter, surah) >= total;
}

/** Сколько сур скачано целиком. */
export function completeSurahCount(reciter: ReciterId): number {
  let n = 0;
  for (let s = 1; s <= TOTAL_SURAHS; s++) if (isSurahComplete(reciter, s)) n++;
  return n;
}

// ─── Пути ───────────────────────────────────────────────────────────────

/** Путь файла относительно корня LibraryNoCloud. */
export function ayahFilePath(reciter: ReciterId, surah: number, ayah: number): string {
  return `${AUDIO_DIR}/${reciter}/${surah}/${ayah}.mp3`;
}

/**
 * Локальный src для аята — или null, если его нет либо платформа не
 * нативная.  Синхронно.
 */
/** Путь к сплошной записи суры внутри LibraryNoCloud. */
export function surahFilePath(reciter: ReciterId, surah: number): string {
  return `${AUDIO_DIR}/${reciter}/surah-${surah}.mp3`;
}

/** Лежит ли на устройстве сплошная запись этой суры. */
export function hasSurahFile(reciter: ReciterId, surah: number): boolean {
  return surahFiles[reciter]?.has(surah) ?? false;
}

/** Сколько сур скачано сплошными записями — для подписи в интерфейсе. */
export function surahFileCount(reciter: ReciterId): number {
  return surahFiles[reciter]?.size ?? 0;
}

/** Отметить, что сплошная запись суры легла на диск. */
export function markSurahFile(reciter: ReciterId, surah: number): void {
  (surahFiles[reciter] ??= new Set()).add(surah);
  schedulePersist();
  emit();
}

/** Снять отметку — файл удалён или загрузка не довелась до конца. */
export function unmarkSurahFile(reciter: ReciterId, surah: number): void {
  surahFiles[reciter]?.delete(surah);
  schedulePersist();
  emit();
}

/**
 * Локальный адрес сплошной записи суры.
 *
 * Синхронный, как и `localAyahSrc`: воспроизведение спрашивает его в момент
 * создания элемента и ждать промиса не может.
 */
export function localSurahSrc(surah: number, reciter: ReciterId): string | null {
  if (!native || !baseUri) return null;
  if (!hasSurahFile(reciter, surah)) return null;
  return convertFileSrc(`${baseUri}/${reciter}/surah-${surah}.mp3`);
}

export function localAyahSrc(
  surah: number,
  ayah: number,
  reciter: ReciterId,
): string | null {
  if (!native || !baseUri) return null;
  if (!hasAyah(reciter, globalAyahNumber(surah, ayah))) return null;
  return convertFileSrc(`${baseUri}/${reciter}/${surah}/${ayah}.mp3`);
}

/**
 * `Capacitor.convertFileSrc` синхронный, но сам пакет импортируется
 * лениво — поэтому берём функцию с глобального объекта, который
 * нативный мост ставит на window до загрузки бандла.
 *
 * Зачем вообще: WKWebView и Android WebView не проигрывают `file://`
 * напрямую из-за политики происхождения, им нужен проксирующий scheme
 * (`capacitor://localhost/_capacitor_file_/…`), который и подставляет
 * convertFileSrc.
 */
function convertFileSrc(fileUri: string): string {
  const cap = (window as unknown as {
    Capacitor?: { convertFileSrc?: (p: string) => string };
  }).Capacitor;
  return cap?.convertFileSrc ? cap.convertFileSrc(fileUri) : fileUri;
}

// ─── Инициализация ──────────────────────────────────────────────────────

/**
 * Поднять реестр при старте.  Идемпотентно.
 *
 * Ошибки глушатся намеренно: если плагин недоступен или запись
 * повреждена, приложение обязано продолжить работать в стрим-режиме,
 * а не встать на экране загрузки.
 */
export async function initAudioStore(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    native = Capacitor.isNativePlatform();
    if (!native) return;

    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { uri } = await Filesystem.getUri({
      directory: Directory.LibraryNoCloud,
      path: AUDIO_DIR,
    });
    baseUri = uri;

    // Список сплошных записей читаем ОТДЕЛЬНО: он не зависит от поаятной
    // карты, а прежде читался только при её успешном разборе — и при потере
    // ключа поаятной карты отметки терялись, заставляя качать сотню мегабайт
    // заново.
    await loadSurahFiles();
    const restored = await loadBitmaps();
    emit();
    // Карты нет — первый запуск после смены модели либо потеря
    // Preferences.  Досканируем диск: если файлы уже лежат,
    // пользователь не должен качать их заново.
    if (!restored) void rebuildAllFromFilesystem();
  } catch {
    native = false;
  }
}

/** Набор сплошных записей — простой список номеров на чтеца. */
async function loadSurahFiles(): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: SURAH_PREFS_KEY });
    if (!value) return;
    const parsed = JSON.parse(value) as Record<string, number[]>;
    for (const [k, list] of Object.entries(parsed)) {
      if (Array.isArray(list)) surahFiles[k as ReciterId] = new Set(list);
    }
  } catch {
    // Потеря списка не страшна: файлы на диске останутся, а признак
    // восстановится при следующей загрузке суры.
  }
}

async function loadBitmaps(): Promise<boolean> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREFS_KEY });
    if (!value) return false;
    const parsed = JSON.parse(value) as Record<string, string>;
    let any = false;
    for (const [k, b64] of Object.entries(parsed)) {
      const bytes = fromBase64(b64);
      if (bytes.length === BITMAP_BYTES) {
        maps[k as ReciterId] = bytes;
        any = true;
      }
    }
    return any;
  } catch {
    return false;
  }
}

let persistTimer: number | null = null;

/**
 * Запись карт с дебаунсом.
 *
 * Загрузчик отмечает аяты десятками в секунду; писать Preferences на
 * каждый — держать мост Capacitor занятым и тормозить UI.  Полсекунды
 * тишины достаточно, а при обрыве теряется максимум несколько отметок,
 * которые всё равно восстановятся сканом.
 */
function schedulePersist() {
  if (!native) return;
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 500);
}

export async function persistNow(): Promise<void> {
  if (!native) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const out: Record<string, string> = {};
    for (const [k, m] of Object.entries(maps)) {
      if (m) out[k] = toBase64(m);
    }
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(out) });

    const сплошные: Record<string, number[]> = {};
    for (const [k, set] of Object.entries(surahFiles)) {
      if (set && set.size) сплошные[k] = [...set];
    }
    await Preferences.set({ key: SURAH_PREFS_KEY, value: JSON.stringify(сплошные) });
  } catch {
    // Потеря индекса не критична — пересоберётся сканом.
  }
}

// ─── Изменение состояния ────────────────────────────────────────────────

/** Отметить аят как лежащий на устройстве. */
export function markDownloaded(reciter: ReciterId, surah: number, ayah: number): void {
  setBit(reciter, globalAyahNumber(surah, ayah), true);
  emitCoalesced();
  schedulePersist();
}

/** Удалить с устройства всё аудио чтеца. */
export async function clearReciter(reciter: ReciterId): Promise<void> {
  maps[reciter] = new Uint8Array(BITMAP_BYTES);
  emit();
  await persistNow();
  if (!native) return;
  // Отметку снимаем ДО обращения к диску: если `rmdir` бросит, приложение не
  // должно считать записи существующими — иначе воспроизведение полезет к
  // файлу, которого уже нет, и оборвётся вместо ухода в сеть.
  surahFiles[reciter]?.clear();
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.rmdir({
      directory: Directory.LibraryNoCloud,
      path: `${AUDIO_DIR}/${reciter}`,
      recursive: true,
    });
  } catch {
    // Папки могло не быть — не ошибка.
  }
}

/**
 * Удалить ТОЛЬКО поаятные файлы чтеца, сохранив сплошные записи сур.
 *
 * 🔴 Зачем отдельная функция, а не `clearReciter`.
 *
 * Фонотека переехала на сплошные записи 06.09.2026, и у тех, кто качал
 * раньше, на диске остались 6236 поаятных файлов — до 1.4 ГБ, которые больше
 * ничего не дают: играет сплошная запись. Владелец 09.09.2026 разрешил
 * предложить им замену.
 *
 * `clearReciter` здесь не годится: он сносит каталог чтеца целиком вместе со
 * сплошными записями — человек нажал бы «освободить место» и остался бы без
 * скачанного Корана. Поэтому удаляем только числовые подпапки сур, где лежат
 * аяты; файлы `surah-N.mp3` лежат рядом и не трогаются.
 */
export async function clearAyahFiles(reciter: ReciterId): Promise<void> {
  maps[reciter] = new Uint8Array(BITMAP_BYTES);
  emit();
  await persistNow();
  if (!native) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
      await Filesystem.rmdir({
        directory: Directory.LibraryNoCloud,
        path: `${AUDIO_DIR}/${reciter}/${surah}`,
        recursive: true,
      }).catch(() => { /* такой папки могло не быть — не ошибка */ });
    }
  } catch {
    // Плагина нет — отметки всё равно сняты, приложение продолжит работать.
  }
}

/** Удалить одну суру. */
export async function clearSurah(reciter: ReciterId, surah: number): Promise<void> {
  const first = firstGlobalOfSurah(surah);
  for (let k = 0; k < ayahsInSurah(surah); k++) setBit(reciter, first + k, false);
  surahFiles[reciter]?.delete(surah);
  emit();
  await persistNow();
  if (!native) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.rmdir({
      directory: Directory.LibraryNoCloud,
      path: `${AUDIO_DIR}/${reciter}/${surah}`,
      recursive: true,
    });
    // И сплошную запись этой суры — она лежит рядом, а не в папке суры.
    await Filesystem.deleteFile({
      directory: Directory.LibraryNoCloud,
      path: surahFilePath(reciter, surah),
    }).catch(() => { /* файла могло не быть */ });
  } catch {
    /* нет папки — нечего удалять */
  }
}

// ─── Пересборка индекса с диска ─────────────────────────────────────────

/**
 * Пересобрать карту чтеца, обойдя его папки.
 *
 * 114 readdir'ов вместо одного на 6236 записей — за это и разложены
 * аяты по подпапкам сур.  Вызывается, когда индекс потерян; в обычной
 * жизни не нужен.
 */
export async function rebuildFromFilesystem(reciter: ReciterId): Promise<void> {
  if (!native) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const fresh = new Uint8Array(BITMAP_BYTES);
    for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
      let names: string[];
      try {
        const res = await Filesystem.readdir({
          directory: Directory.LibraryNoCloud,
          path: `${AUDIO_DIR}/${reciter}/${surah}`,
        });
        names = res.files.map(f => f.name);
      } catch {
        continue; // суру не качали
      }
      const first = firstGlobalOfSurah(surah);
      const total = ayahsInSurah(surah);
      for (const name of names) {
        const ayah = parseInt(name.replace(/\.mp3$/i, ''), 10);
        if (!Number.isInteger(ayah) || ayah < 1 || ayah > total) continue;
        const i = first + ayah - 2;   // globalN = first + ayah - 1, бит = globalN - 1
        fresh[i >> 3] |= (1 << (i & 7));
      }
    }
    maps[reciter] = fresh;
    emit();
    await persistNow();
  } catch {
    /* скан не удался — остаёмся с тем, что есть */
  }
}

async function rebuildAllFromFilesystem(): Promise<void> {
  const { RECITERS } = await import('./reciters');
  for (const r of RECITERS) await rebuildFromFilesystem(r.id);
}

// ─── base64 ─────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
