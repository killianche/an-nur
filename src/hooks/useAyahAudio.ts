import { useState, useRef, useCallback, useEffect } from 'react';
import { ayahAudioUrl } from '../lib/quranUtils';
import { ayahAudioRange } from '../lib/ayahAudioRange';
import { cacheAyah, missingCount } from '../lib/audioDownloads';
import {
  DEFAULT_RECITER, RECITERS_WITH_SEGMENTS, hasSurahAudio, requiresSurahAudioStream,
  surahAudioUrl, type ReciterId,
} from '../lib/reciters';
import {
  setMediaSessionMetadata, setMediaSessionPlaybackState,
  setMediaSessionPosition, clearMediaSessionMetadata,
} from '../lib/mediaSession';
import { SURAH_BY_NUMBER } from '../content/surahs';

// Lazy-import: quran-segments.ts ~4 МБ.  Раньше sync-импорт тащил
// в main bundle всю карту word-timings 8 чтецов × 6236 аятов.  Теперь
// модуль грузится только при ПЕРВОМ воспроизведении аята — пока промис
// не разрешён, word-маркер просто не двигается (приемлемая деградация
// на 100-300 мс).  Один промис на всё время жизни приложения.
type SegmentsModule = typeof import('../content/quran-segments');
let segmentsModulePromise: Promise<SegmentsModule> | null = null;
let segmentsModuleCached: SegmentsModule | null = null;
function loadSegmentsModule(): Promise<SegmentsModule> {
  if (!segmentsModulePromise) {
    segmentsModulePromise = import('../content/quran-segments').then(m => {
      segmentsModuleCached = m;
      return m;
    });
  }
  return segmentsModulePromise;
}

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

/** Allowed playback rates — cycled by the BottomDock pill.  Default
 *  is 1.0; the slower 0.75 sits first so a tap from default goes
 *  faster (more common need) rather than slower. */
export const PLAYBACK_RATES = [0.75, 1.0, 1.25] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];

const KEY_PLAYBACK_RATE = 'audio.playbackRate';

function readStoredRate(): PlaybackRate {
  const v = parseFloat(localStorage.getItem(KEY_PLAYBACK_RATE) ?? '1.0');
  return (PLAYBACK_RATES as readonly number[]).includes(v) ? (v as PlaybackRate) : 1.0;
}

/** Cache keyed by `${reciter}:${surah}:${ayah}` so reciter changes
 *  don't collide.  Реализован как LRU (Map сохраняет порядок вставки),
 *  максимум AUDIO_CACHE_MAX элементов.  Без верхней границы iOS Safari
 *  WebView начинает терять аудио-декодеры после ~40-50 элементов
 *  (HTMLAudioElement держит ссылку на raw audio buffer; iOS WebView
 *  имеет жёсткий лимит ~75 одновременных audio decoders).
 *  6 = текущий аят + prefetch вперёд + небольшой запас.
 *
 *  🔴 Для непрерывных записей суры предел свой и меньше. Шесть коротких
 *  файлов аята — это единицы мегабайт; шесть полных сур — это шесть
 *  многоминутных потоков, которые WKWebView держит целиком. Больше двух
 *  (текущая сура и соседняя) там не нужно ни для чего. */
const AUDIO_CACHE_MAX = 6;
const CONTINUOUS_CACHE_MAX = 2;
/**
 * За сколько до конца файла аята начинать переход к следующему.
 *
 * Меньше — разрыв заметнее; больше — дольше звучат оба файла разом. 50 мс
 * подобраны по замеру: типичный разрыв был 15–56 мс, и этого хватает, чтобы
 * его закрыть, оставаясь в пределах затухающего хвоста записи.
 */
const EARLY_ADVANCE_SECONDS = 0.05;

const audioCache = new Map<string, HTMLAudioElement>();
const logicalKeyForAudio = new WeakMap<HTMLAudioElement, string>();
const completedRange = new WeakSet<HTMLAudioElement>();

function touchCache(key: string, audio: HTMLAudioElement) {
  // LRU touch: удалить старую запись чтобы переместить в end (Map
  // сохраняет insertion order), потом вставить заново.
  if (audioCache.has(key)) audioCache.delete(key);
  audioCache.set(key, audio);
  // Эвикция самых старых записей если перебор по размеру.
  // Непрерывные записи вытесняем отдельно и раньше: ключ у них кончается
  // на `:surah` (см. mediaCacheKey).
  const continuous = [...audioCache.keys()].filter(k => k.endsWith(':surah'));
  while (continuous.length > CONTINUOUS_CACHE_MAX) {
    const oldestContinuous = continuous.shift();
    if (!oldestContinuous || oldestContinuous === key) break;
    const el = audioCache.get(oldestContinuous);
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    audioCache.delete(oldestContinuous);
  }
  while (audioCache.size > AUDIO_CACHE_MAX) {
    const oldestKey = audioCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = audioCache.get(oldestKey);
    if (oldest) {
      try { oldest.pause(); oldest.src = ''; oldest.load(); }
      catch { /* устаревший element может уже быть detached — игнор */ }
    }
    audioCache.delete(oldestKey);
  }
}

function cacheKey(reciter: ReciterId, surah: number, ayah: number) {
  return `${reciter}:${surah}:${ayah}`;
}

/**
 * Режим текущей сессии воспроизведения.
 *
 * `surah` — читаем непрерывную запись суры. Склейка из поаятных файлов даёт
 * слышимую паузу на каждой границе: она не в записи, а в запуске нового
 * аудиоэлемента. Сейчас этот режим берётся и когда человек ткнул в отдельный
 * аят, потому что у тапа есть продолжение — очередь идёт до конца суры.
 *
 * `ayah` — короткие файлы отдельных аятов. Остался для одного случая:
 * полностью скачанная сура, где локальные файлы дают звук без сети.
 *
 * ── Почему «большой файл» оказался не дороже ──────────────────────────
 *
 * Прежняя редакция этого комментария утверждала, что тап в середине
 * Аль-Бакары «открывал бы 100+ МБ ради одного seek», и ради этого держала
 * поаятный режим. Замерили: файл действительно 110 МБ, но хосты отвечают на
 * частичные запросы (206), и браузеру для старта нужен только нужный кусок.
 * Тап по 127-му аяту (перемотка на 45-ю минуту): новая схема 431/468/633 мс,
 * старая на тех же прогонах 534/571/491 мс. То есть размер файла на скорость
 * старта не влияет вовсе. Опасение было верным по смыслу и неверным по факту
 * — проверяйте замером, прежде чем возвращать поаятный режим ради скорости.
 *
 * Флаг модульный, а не в состоянии хука: звучащая сессия в приложении одна,
 * а решение о режиме нужно шести местам ниже по коду, включая ключ кэша
 * элементов. Протаскивать его параметром через все шесть значило бы
 * менять сигнатуры ради того, что и так глобально по смыслу.
 */
export type PlaybackMode = 'ayah' | 'surah';
let playbackMode: PlaybackMode = 'ayah';

/**
 * Включили суру ЦЕЛИКОМ (кнопкой «слушать суру»), а не ткнули в первый аят.
 *
 * Отдельно от `playbackMode`, потому что после перевода ленты на сплошную
 * запись режим стал одинаковым в обоих случаях, а поведение — разное.
 * Запуск суры начинается с нуля записи, чтобы не срезать истиазу и басмалу;
 * тап по первому аяту обязан дать именно первый аят, без вступления.
 */
let startedWholeSurah = false;

function usesContinuousAudio(reciter: ReciterId) {
  if (playbackMode === 'surah' && hasSurahAudio(reciter)) return true;
  return requiresSurahAudioStream(reciter);
}

function rangeForMedia(reciter: ReciterId, surah: number, ayah: number) {
  return usesContinuousAudio(reciter) ? ayahAudioRange(reciter, surah, ayah) : null;
}

/** Continuous-only sources reuse one decoder per surah. Reciters with an
 * ayah CDN keep one short element per ayah both online and offline. */
function mediaCacheKey(reciter: ReciterId, surah: number, ayah: number) {
  return usesContinuousAudio(reciter)
    ? `${reciter}:${surah}:surah`
    : cacheKey(reciter, surah, ayah);
}

function seekAudio(audio: HTMLAudioElement, seconds: number) {
  const apply = () => {
    try { audio.currentTime = seconds; } catch { /* metadata is still unavailable */ }
  };
  apply();
  if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
    audio.addEventListener('loadedmetadata', apply, { once: true });
  }
}

/** Build (or reuse) the <audio> for a given ayah.
 *
 * `eager` controls preload aggression:
 *   - 'eager' (default for the about-to-play element) — `preload='auto'`
 *     so the browser starts downloading bytes the moment the element
 *     is created.  Without this, .play() has to wait for the entire
 *     network round-trip before the first byte arrives, adding a
 *     noticeable "tap → silence → audio" gap on every fresh ayah.
 *   - 'lazy' (used by prefetchAyah for the NEXT ayah while the current
 *     one is playing) — `preload='auto'` too, so bytes and decoder are
 *     ready before the logical boundary. Only one neighbour is warmed,
 *     therefore this does not start downloading the rest of the surah.
 */
function getOrCreateAudio(
  key: string,
  surah: number,
  ayah: number,
  reciter: ReciterId,
  eager: 'eager' | 'lazy' = 'eager',
) {
  // Recreate if absent OR if the cached element is stuck in an error state from
  // a previous failed load (network blip, brief CDN hiccup). Reusing an errored
  // <audio> never recovers — its `error` property sticks, and `.play()` resolves
  // immediately without playing any sound, leaving the queue dead on that ayah.
  const cached = audioCache.get(key);
  if (cached && !cached.error) {
    // Bump preload up if the cached element was created lazily and we
    // now need it ready to play.  Going the other way (eager → lazy)
    // is pointless: the bytes are already in flight or in cache.
    if (eager === 'eager' && !usesContinuousAudio(reciter)
      && cached.preload !== 'auto') {
      cached.preload = 'auto';
      // Touching `load()` after a preload bump kicks the browser into
      // actually fetching — without it Safari leaves preload='auto'
      // unobserved on already-attached <audio>.
      cached.load();
    }
    // LRU touch — accessed → moved to end чтобы не выселить.
    touchCache(key, cached);
    return cached;
  }
  const a = new Audio();
  const continuous = usesContinuousAudio(reciter);
  // Полная сура может быть большой. `metadata` разрешает браузеру начать
  // поток с нужного byte-range, а последовательное чтение затем идёт тем же
  // декодером. Поаятные офлайн-файлы по-прежнему прогружаем целиком заранее.
  // `metadata` только на создание: так первый seek в середину суры не ждёт
  // лишних байт. Дальше, когда звук уже пошёл, оценка меняется на
  // противоположную — см. `подтянутьВперёд` ниже.
  a.preload = continuous ? 'metadata' : 'auto';
  a.src = continuous
    ? (surahAudioUrl(reciter, surah) ?? ayahAudioUrl(surah, ayah, reciter))
    : ayahAudioUrl(surah, ayah, reciter);
  // Safari/WebView не всегда начинает preload сразу после присваивания src.
  a.load();
  touchCache(key, a);  // вставить + эвикция самых старых при превышении.
  return a;
}

/** Fire-and-forget: warm the cache for the NEXT ayah while the current
 *  one is playing.  When auto-advance fires, the bytes are already in
 *  the HTTP cache so the transition is gap-free. */
function prefetchAyah(surah: number, ayah: number, reciter: ReciterId) {
  const key = mediaCacheKey(reciter, surah, ayah);
  if (audioCache.has(key)) return;                         // already cached
  // 'lazy' so we don't compete with the currently-playing element for
  // bandwidth on slow connections; the browser will still pre-fetch.
  getOrCreateAudio(key, surah, ayah, reciter, 'lazy');
}

/** Stop every Quran audio element without touching React state.
 *
 * Нужен отдельно от stopAll(): cleanup размонтированного экрана не должен
 * вызывать setState, но обязан погасить общий module-level cache. Иначе при
 * переходе «лента ↔ мусхаф» старый экран исчезает, а его HTMLAudioElement
 * продолжает читать невидимо уже под новым экраном. */
function stopCachedAyahAudio() {
  audioCache.forEach(audio => {
    audio.pause();
    try { audio.currentTime = 0; } catch { /* metadata may be unavailable */ }
  });
  clearMediaSessionMetadata();
}

export function useAyahAudio(reciter: ReciterId = DEFAULT_RECITER) {
  const [activeKey, setActiveKey]   = useState<string | null>(null);
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [progress, setProgress]     = useState(0);          // 0..1 within current ayah
  const [playbackRate, setPlaybackRateS] = useState<PlaybackRate>(readStoredRate);
  // 1-based word position inside the active ayah, or null if no segment data
  // exists for it / nothing is playing. Driven by the same rAF that powers
  // the progress bar, so we don't pay for two loops.
  const [currentWordPos, setCurrentWordPos] = useState<number | null>(null);

  // Active queue: surah + bounds + current pointer
  const queueRef = useRef<{ surah: number; first: number; last: number; current: number } | null>(null);
  const reciterRef = useRef<ReciterId>(reciter);
  reciterRef.current = reciter;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Каждый режим Корана владеет своим экземпляром useAyahAudio, тогда как
  // сами <audio> лежат в общем кэше модуля. При размонтировании экрана явно
  // останавливаем этот кэш. Выбранная политика перехода — «полный stop», а
  // не попытка незаметно передать живой декодер другому React-дереву: так
  // кнопки, очередь и Media Session никогда не расходятся со слышимым звуком.
  useEffect(() => () => {
    stopCachedAyahAudio();
    queueRef.current = null;
    activeAudioRef.current = null;
  }, []);

  /** Cycle 1.0 → 1.25 → 0.75 → 1.0 (order from PLAYBACK_RATES starting
   *  at the current rate). Persists to localStorage and applies
   *  immediately to every cached audio so the change is audible without
   *  waiting for the next ayah. */
  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRateS(prev => {
      const idx = PLAYBACK_RATES.indexOf(prev);
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
      localStorage.setItem(KEY_PLAYBACK_RATE, String(next));
      audioCache.forEach(a => { a.playbackRate = next; });
      return next;
    });
  }, []);

  const pauseCurrent = useCallback(() => {
    if (activeKey) {
      activeAudioRef.current?.pause();
      setAudioState('paused');
      setMediaSessionPlaybackState('paused');
    }
  }, [activeKey]);

  const stopAll = useCallback(() => {
    stopCachedAyahAudio();
    setActiveKey(null);
    setAudioState('idle');
    setProgress(0);
    setCurrentWordPos(null);
    queueRef.current = null;
    activeAudioRef.current = null;
  }, []);

  const playOne = useCallback(async (
    surah: number,
    ayah: number,
    transition: 'manual' | 'automatic' = 'manual',
  ) => {
    const r = reciterRef.current;
    const k = cacheKey(r, surah, ayah);
    const mediaK = mediaCacheKey(r, surah, ayah);
    const range = rangeForMedia(r, surah, ayah);
    const cachedMedia = audioCache.get(mediaK);
    const seamlessSameMedia = transition === 'automatic'
      && range !== null
      && cachedMedia === activeAudioRef.current
      && cachedMedia !== undefined
      && !cachedMedia.paused;

    // Switching ayahs is explicit user intent ("I'm done with that one,
    // play this instead"), so every OTHER cached ayah snaps back to 0.
    // Without this, "tap ayah 1, listen to 10 s, tap ayah 2, then tap
    // ayah 1 again" would resume ayah 1 at the 10-second mark — exactly
    // the bug the user reported.  Resetting the just-paused element and
    // any prefetched neighbours together keeps a single invariant:
    // anywhere you re-enter a previously-played ayah, it starts fresh.
    if (activeKey && activeKey !== k) {
      audioCache.forEach((a, otherKey) => {
        // При автоматическом переходе внутри одной непрерывной записи
        // нельзя даже на мгновение вызвать pause(): звук продолжает идти,
        // меняются только логический аят, прогресс и подсветка.
        if (seamlessSameMedia && otherKey === mediaK) return;
        a.pause();
        if (otherKey !== mediaK) a.currentTime = 0;
      });
    }

    const audio = getOrCreateAudio(mediaK, surah, ayah, r);
    activeAudioRef.current = audio;
    logicalKeyForAudio.set(audio, k);
    completedRange.delete(audio);

    // Switching to a different ayah → restart from 0. We also need this
    // when `activeKey` is null but the cached <audio> for `k` was left
    // mid-track from a previous SurahScreen mount (audioCache lives at
    // module scope and survives unmount / remount of the screen, so the
    // forEach above doesn't run on the first play after re-entering the
    // surah).  Resume-after-pause on the SAME ayah (activeKey === k)
    // deliberately skips this branch — that's the natural play / pause
    // behaviour and stays as is.
    if (activeKey !== k && !seamlessSameMedia) {
      // 🔴 Запуск суры с начала стартует с НУЛЯ, а не с границы первого аята.
      //
      // У Ясира Ад-Даусари и Ахмада Аль-Аджми запись суры начинается с
      // истиазы и басмалы: в таблице границ первый аят у них начинается не в
      // нуле (сура 18 — 7.21 с, сура 9 — 3.54 с; всего таких сур 77 и 91).
      // Прыжок на границу первого аята срезал бы вступление, и человек,
      // включивший суру целиком, не услышал бы её начала. У Аляфаси и
      // Аш-Шатри граница равна нулю, поэтому там ничего не меняется.
      const atSurahStart = startedWholeSurah && playbackMode === 'surah' && ayah === 1;
      seekAudio(audio, atSurahStart ? 0 : (range?.startSeconds ?? 0));
    }

    setActiveKey(k);
    // На автоматической границе непрерывного потока плеер уже звучит.
    // Не показываем промежуточный loading и не заставляем док мигать.
    setAudioState(prev => transition === 'automatic' && prev === 'playing' ? 'playing' : 'loading');
    setProgress(0);                                          // reset for the new ayah
    setCurrentWordPos(null);                                 // clear stale word from previous ayah

    // Lock Screen / Control Center Now Playing card.
    //
    // 🔴 НЕ переписываем её на каждом аяте. `MediaMetadata` заменяется
    // целиком, вместе с картинкой, и на границе аята это заставляло систему
    // заново разбирать карточку «сейчас играет» — несколько раз в минуту,
    // прямо в момент перехода. Владелец слышал на этом месте заминку.
    // На бесшовной границе одного и того же потока карточка и так верна:
    // сура, чтец и обложка не изменились.
    if (!seamlessSameMedia) {
      const surahMeta = SURAH_BY_NUMBER[surah];
      setMediaSessionMetadata({
        title:      surahMeta?.transliteration ?? `Surah ${surah}`,
        album:      `Аят ${ayah}`,
        artist:     reciterRef.current,
        // PNG надёжнее SVG на Android — некоторые WebView версии
        // не рендерят SVG в Lock Screen artwork.
        artworkUrl: '/icons/icon-512.png',
      });
    }
    setMediaSessionPlaybackState('playing');

    // 🔴 Читаем ЗАПАС ВПЕРЁД, а не впритык.
    //
    // Сплошная запись суры создаётся с `preload='metadata'`: так первый
    // переход в середину Аль-Бакары не ждёт лишних байт. Но дальше эта же
    // бережливость выходила боком — браузер держал крошечный буфер и
    // дочитывал файл по ходу чтения. Владелец слышал заминку на границах
    // аятов и видел подгрузку, хотя сура вообще не была скачана.
    //
    // Как только звук пошёл, оценка меняется на противоположную: пусть
    // читает далеко вперёд. Файл раздаётся по частям (сервер отвечает 206),
    // поэтому это не «скачать 110 МБ разом», а обычный поток с запасом.
    // Повышаем один раз за элемент: повторное присваивание того же значения
    // Safari игнорирует, а лишний `load()` сбросил бы позицию.
    if (audio.preload !== 'auto') audio.preload = 'auto';

    // Only a REAL end of the recording may advance the queue.  Treating a
    // network/media error as `ended` is dangerous: while offline every MP3
    // fails immediately, so the old implementation ran through the whole
    // surah and SurahScreen's audio auto-scroll followed it to the bottom.
    const advanceOrStop = () => {
      const q = queueRef.current;
      if (q && ayah < q.last) {
        q.current = ayah + 1;
        playOne(q.surah, q.current, 'automatic');
      } else {
        setAudioState('idle');
        setActiveKey(null);
        queueRef.current = null;
        setProgress(0);
        activeAudioRef.current = null;
      }
    };

    // WebKit can report the same failed load twice: first via `error`, then by
    // rejecting play().  Keep one terminal path and make sure a late failure
    // from an obsolete element cannot stop a newer ayah selected by the user.
    let failed = false;
    const failAndStop = (reason: unknown) => {
      if (failed) return;
      failed = true;

      console.warn('[ayah-audio] playback failed on', `${surah}:${ayah}`, {
        reason,
        code: audio.error?.code,
        message: audio.error?.message,
        src: audio.src,
      });

      if (activeAudioRef.current !== audio || logicalKeyForAudio.get(audio) !== k) {
        return;
      }

      // Stop the queue on the SAME ayah.  A downloaded local file still plays
      // normally offline because ayahAudioUrl() chooses it before the network
      // URL; this branch is reached only when the selected source truly fails.
      stopAll();
      if (audioCache.get(mediaK) === audio) audioCache.delete(mediaK);
      audio.onended = null;
      audio.onerror = null;
    };

    audio.onended = () => {
      if (failed) return;
      setProgress(1);
      advanceOrStop();
    };
    audio.onerror = () => {
      failAndStop('media-error');
    };

    // Apply the user-selected playback rate before kicking off play() —
    // setting rate AFTER play() has known iOS Safari quirks (silent until
    // next .play(), or reverts to 1.0 on metadata load).
    audio.playbackRate = playbackRateRef.current;

    try {
      // Тот же audio уже играет через границу аята — повторный play() не
      // нужен и в некоторых WebView сам создаёт короткий щелчок/задержку.
      if (!seamlessSameMedia) await audio.play();
      // `error` may have fired while WebKit was settling the play() promise.
      // Do not resurrect a queue that failAndStop() has already cleared.
      if (failed || activeAudioRef.current !== audio || logicalKeyForAudio.get(audio) !== k) {
        return;
      }
      setAudioState('playing');
      // Кэш по воспроизведению: аят, который только что зазвучал со
      // стрима, тихо оседает на устройстве.  Так офлайн-библиотека
      // растёт от обычного чтения, без единого нажатия «скачать» —
      // включая случай «ткнул в середину Бакары».  No-op, если аят уже
      // лежит или платформа не нативная.
      //
      // 🔴 Но НЕ в режиме непрерывного чтения суры. Там уже качается один
      // сплошной файл, и докачка поаятных поверх него означала бы, что
      // Аль-Бакара по сотовой сети тянет поток И ещё 286 отдельных mp3.
      // Офлайн-библиотека наполняется обычным чтением по аятам и кнопкой
      // «скачать» — этого достаточно.
      if (playbackMode !== 'surah') cacheAyah(r, surah, ayah);
      // Pre-warm the next ayah so auto-advance is gap-free.  We only
      // prefetch ONE ahead — going further wastes mobile data on ayahs
      // the user might never reach (e.g. they tap a different ayah,
      // pause, or close the screen).  One-ahead matches the perceived
      // "queue depth" needed: by the time current ayah ends, next is
      // ready in the HTTP cache.
      const q = queueRef.current;
      const nextAyah = ayah + 1;
      if (q && q.surah === surah && nextAyah <= q.last) {
        prefetchAyah(surah, nextAyah, r);
      }
    } catch (err) {
      failAndStop(err);
    }
  }, [activeKey, stopAll]);

  /** Tap on an ayah — play / pause that ayah, joining the queue. */
  const handlePlay = useCallback((surah: number, ayah: number, lastAyah?: number) => {
    const k = cacheKey(reciterRef.current, surah, ayah);

    if (queueRef.current?.surah !== surah) {
      queueRef.current = { surah, first: ayah, last: lastAyah ?? 9999, current: ayah };
    } else {
      queueRef.current.current = ayah;
      if (lastAyah && queueRef.current.last < lastAyah) queueRef.current.last = lastAyah;
    }

    // 🔴 Режим меняем только когда РЕАЛЬНО начинаем играть.
    //
    // Раньше `playbackMode = 'ayah'` стояло в начале, безусловно. Тап по уже
    // звучащему аяту ставит паузу и ничего не запускает — но режим при этом
    // всё равно переключался, а элемент оставался непрерывным. Дальше
    // возобновление с экрана блокировки играло сплошную запись, а границы
    // аятов пропадали: подсветка и номер аята замирали, пока запись читала
    // дальше. Показано было не то, что звучит.
    // 🔴 Тап по аяту тоже читает СПЛОШНУЮ запись, а не короткий файл аята.
    //
    // Раньше здесь всегда стоял поаятный режим: тап должен звучать сразу, а
    // не ждать большой файл. Но у тапа есть продолжение — очередь идёт до
    // конца суры, и на каждой границе приходилось подменять аудиоэлемент.
    // Именно это владелец слышит как микропаузу между аятами. Подгонкой
    // таймингов её не убрать: пауза не в записи, а в запуске нового
    // элемента. Известная проблема — схема «дождаться `ended` и вызвать
    // `play()`» негодна в принципе, потому что и событие приходит поздно, и
    // воспроизведение стартует не мгновенно.
    //
    // В сплошной записи подмены нет вовсе: на границе аята меняется только
    // логический номер, а поток читается дальше тем же декодером — шва нет
    // по построению. Сплошная запись есть у всех пяти чтецов, тайминги
    // аятов — тоже, а хосты отвечают на частичные запросы (206), поэтому
    // старт с середины суры не тянет файл целиком.
    //
    // Исключение — полностью скачанная сура: там играем локальные файлы,
    // иначе офлайн вообще останется без звука. Шов в этом случае
    // сохраняется, и это честная плата за работу без сети.
    const startPlayback = () => {
      const r = reciterRef.current;
      const offlineComplete = missingCount(r, { kind: 'surah', surah }) === 0;
      playbackMode = (!offlineComplete && hasSurahAudio(r)) ? 'surah' : 'ayah';
      startedWholeSurah = false;
      playOne(surah, ayah);
    };

    if (activeKey === k) {
      if (audioState === 'playing') pauseCurrent();
      else startPlayback();
    } else {
      startPlayback();
    }
  }, [activeKey, audioState, pauseCurrent, playOne]);

  /** Start sequential playback from `fromAyah` through `lastAyah`. */
  /**
   * Включить суру подряд.
   *
   * `mode: 'surah'` переводит источник на непрерывную запись — только так
   * между аятами не остаётся паузы. Умолчание оставлено прежним, чтобы
   * никакой существующий вызов не сменил поведение молча.
   */
  const playFrom = useCallback((
    surah: number, fromAyah: number, lastAyah: number, mode: PlaybackMode = 'ayah',
  ) => {
    // 🔴 Скачанная сура играет С УСТРОЙСТВА, а не потоком.
    //
    // Непрерывный файл берётся из сети всегда, и в самолётном режиме запуск
    // полностью скачанной суры падал бы: загрузка не удаётся, воспроизведение
    // тихо останавливается. Человек при этом видел бы, что сура скачана.
    //
    // Поэтому при полном офлайн-покрытии переходим на поаятный режим: он
    // читает локальные файлы. Плата — швы между аятами возвращаются, но
    // «играет со швами» несравнимо лучше, чем «не играет вовсе».
    const offlineComplete = mode === 'surah'
      && missingCount(reciterRef.current, { kind: 'surah', surah }) === 0;
    playbackMode = offlineComplete ? 'ayah' : mode;
    startedWholeSurah = mode === 'surah';
    queueRef.current = { surah, first: fromAyah, last: lastAyah, current: fromAyah };
    playOne(surah, fromAyah);
  }, [playOne]);

  // 60fps progress driver — rAF loop bound to active audio. The native
  // `timeupdate` event fires only 4–10×/s; rAF gives us per-frame smoothness
  // for the progress hairline AND drives the word-position cursor for the
  // karaoke highlight (single source of truth, no second rAF per ayah).
  //
  // 🔴 Та же работа подписана и на `timeupdate`, и это не дубль ради надёжности.
  // Кадры не приходят при заблокированном экране и в свёрнутом приложении
  // (`CLAUDE.md`, грабли §5) — а именно там и живёт фоновое прослушивание суры.
  // Без `timeupdate` звук шёл бы дальше, а граница аята не наступала никогда:
  // очередь и Now Playing застревали бы на первом аяте, и по возвращении
  // приложение догоняло бы их по одному за кадр. `timeupdate` — событие
  // медиаэлемента, оно приходит и в фоне.
  //
  // Поэтому работа отделена от планирования: `step` считает, `tick` только
  // просит следующий кадр. Иначе вызов из `timeupdate` плодил бы параллельные
  // циклы rAF.
  useEffect(() => {
    if (audioState !== 'playing' || !activeKey) return;
    const audio = activeAudioRef.current;
    if (!audio) return;

    // activeKey is "reciter:surah:ayah" — split it. Segments are now
    // keyed by reciter so the marker tracks the actual cadence of
    // whoever is reciting (Husary is slower than Alafasy by ~2× —
    // re-using Alafasy timings on a Husary track threw the highlight
    // visibly out of sync, which is what the user reported). When the
    // reciter has no quran.com segment data (e.g. Maher Al-Muaiqly,
    // not in their catalog), getQuranSegments returns null and the
    // marker stays put — no false sync.
    const [reciterId, ...rest] = activeKey.split(':');
    const verseKey = rest.join(':');
    const [surahPart, ayahPart] = rest;
    const range = rangeForMedia(
      reciterId as ReciterId,
      Number(surahPart),
      Number(ayahPart),
    );
    const rangeStart = range?.startSeconds ?? 0;

    // Lazy-loaded segments: при первом воспроизведении модуль ещё может
    // быть в загрузке (промис не resolved).  Используем cached если уже
    // есть, иначе fire-and-forget загрузку и подхватим segments сразу
    // после resolve.  rAF-tick между этим работает без segments, marker
    // не двигается — даёт ~100-300 мс «холодного старта», после чего
    // подсветка включается естественно.
    let segs: ReadonlyArray<readonly [number, number, number]> | null =
      segmentsModuleCached
        ? (segmentsModuleCached.getQuranSegments(reciterId as ReciterId, verseKey)?.segments ?? null)
        : null;
    if (!segmentsModuleCached && RECITERS_WITH_SEGMENTS.has(reciterId as ReciterId)) {
      loadSegmentsModule().then(m => {
        segs = m.getQuranSegments(reciterId as ReciterId, verseKey)?.segments ?? null;
      });
    }

    let raf = 0;
    let positionUpdateTick = 0;
    let lastProgressWrite = -Infinity;
    const step = () => {
      // The same HTMLAudioElement is reused between Luhaidan ayahs in one
      // surah. An old rAF must stop immediately when the logical ayah changes,
      // otherwise it can finish the newly selected ayah using the old range.
      if (logicalKeyForAudio.get(audio) !== activeKey) return;

      // 🔴 Поаятный режим: переходим на следующий аят чуть РАНЬШЕ конца.
      //
      // В этом режиме каждый аят — отдельный файл, и переход ждал события
      // `ended`. Оно приходит с задержкой, и запуск следующего элемента тоже
      // не мгновенный: замерили разрыв между `ended` одного файла и `playing`
      // следующего — 21, 27, 15, 56, 35 мс, в среднем 31.
      //
      // Приём известный: не ждать события, а начать переход, когда до конца
      // осталась малость. Здесь важно, ЧТО ИМЕННО мы делаем: следующий аят
      // запускается, пока текущий ещё доигрывает свой хвост, и текущий никто
      // не останавливает досрочно. Чтение не обрезается — оно доходит до
      // конца само. Пятьдесят миллисекунд наложения на затухающем хвосте
      // неразличимы на слух, а разрыв на их величину уменьшается.
      //
      // Непрерывной записи это не касается: там ветка `range` выше и швов
      // нет вовсе.
      if (!range && !completedRange.has(audio)
        && Number.isFinite(audio.duration) && audio.duration > 0
        && audio.duration - audio.currentTime <= EARLY_ADVANCE_SECONDS) {
        completedRange.add(audio);
        setProgress(1);
        audio.onended?.(new Event('ended'));
        return;
      }

      if (range && audio.currentTime >= range.endSeconds) {
        if (!completedRange.has(audio)) {
          completedRange.add(audio);
          setProgress(1);
          const q = queueRef.current;
          const hasNextInSameSurah = q?.surah === Number(surahPart)
            && q.current === Number(ayahPart)
            && Number(ayahPart) < q.last;
          // В непрерывном файле суры не останавливаем звук на границе.
          // onended здесь означает конец ЛОГИЧЕСКОГО аята; физический
          // HTMLAudioElement продолжает читать следующий байт потока.
          if (!hasNextInSameSurah) {
            audio.pause();
            seekAudio(audio, range.endSeconds);
          }
          audio.onended?.(new Event('ended'));
        }
        return;
      }

      const d = range
        ? range.endSeconds - range.startSeconds
        : audio.duration;
      const elapsed = Math.max(0, audio.currentTime - rangeStart);
      if (d && isFinite(d) && d > 0) {
        // Progress нужен только тонкой полосе плеера. Обновление React-state
        // 60 раз/с заставляло заново рендерить всю тяжёлую суру и страницу
        // мусхафа. 12–13 раз/с визуально плавны для полосы, но освобождают
        // главный поток для прокрутки и арабского шейпинга.
        const now = performance.now();
        if (now - lastProgressWrite >= 80) {
          lastProgressWrite = now;
          setProgress(Math.min(1, Math.max(0, elapsed / d)));
        }
        // MediaSession position info — но не на каждый кадр (60 раз/с
        // расходует battery впустую); раз в ~10 кадров (~6 раз/с).
        positionUpdateTick = (positionUpdateTick + 1) % 10;
        if (positionUpdateTick === 0) {
          setMediaSessionPosition(Math.min(elapsed, d), d, audio.playbackRate);
        }
      }
      // Word-position lookup. Linear scan is fine — 30 words max per ayah.
      if (segs) {
        const ms = elapsed * 1000;
        let found: number | null = null;
        for (let i = 0; i < segs.length; i++) {
          const [w, s, e] = segs[i];
          if (ms >= s && ms <= e) { found = w; break; }
        }
        setCurrentWordPos(prev => prev === found ? prev : found);
      }
    };
    const tick = () => { step(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    audio.addEventListener('timeupdate', step);
    return () => {
      cancelAnimationFrame(raf);
      audio.removeEventListener('timeupdate', step);
    };
  }, [audioState, activeKey]);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    const ayah = Math.min(q.current + 1, q.last);
    if (ayah !== q.current) { q.current = ayah; playOne(q.surah, ayah); }
  }, [playOne]);

  const prev = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    const ayah = Math.max(q.current - 1, q.first);
    if (ayah !== q.current) { q.current = ayah; playOne(q.surah, ayah); }
  }, [playOne]);

  /**
   * Wall-clock seconds left in the active ayah, divided by playback rate
   * so 1.25× playback shrinks the value proportionally. Used by
   * SurahScreen's auto-scroll to decide between smooth and instant —
   * if the next ayah change is closer than the smooth animation can
   * reasonably finish, we snap. `Infinity` when there's no active audio.
   */
  // MediaSession action handlers — bind один раз при первом mount'е.
  // Lock Screen / Control Center кнопки play/pause/prev/next должны
  // дёргать наши же setter'ы.  Без этого кнопки серые и неактивные
  // (system считает что у нас нет capability'ев).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => {
      // Resume — если paused, продолжить.  Без queue'а pause-pусто.
      if (activeKey) {
        // Состояние ставим ТОЛЬКО после успешного старта. Раньше `playing`
        // объявлялось сразу, а отказ проглатывался: на экране блокировки
        // висело «играет», хотя звука не было (сеть отвалилась, декодер
        // занят). Показанное состояние обязано отражать настоящее.
        void activeAudioRef.current?.play()
          .then(() => {
            setAudioState('playing');
            setMediaSessionPlaybackState('playing');
          })
          .catch(() => {
            setAudioState('paused');
            setMediaSessionPlaybackState('paused');
          });
        setMediaSessionPlaybackState('playing');
      }
    });
    ms.setActionHandler('pause', () => pauseCurrent());
    ms.setActionHandler('nexttrack', () => {
      const q = queueRef.current;
      if (q && q.current < q.last) {
        q.current = q.current + 1;
        playOne(q.surah, q.current);
      }
    });
    ms.setActionHandler('previoustrack', () => {
      const q = queueRef.current;
      if (q && q.current > 1) {
        q.current = q.current - 1;
        playOne(q.surah, q.current);
      }
    });
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('nexttrack', null);
      ms.setActionHandler('previoustrack', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, pauseCurrent]);

  const getRemainingSeconds = useCallback(() => {
    if (!activeKey) return Infinity;
    const audio = activeAudioRef.current;
    if (!audio) return Infinity;
    const [reciterId, surahPart, ayahPart] = activeKey.split(':');
    const range = rangeForMedia(
      reciterId as ReciterId,
      Number(surahPart),
      Number(ayahPart),
    );
    const end = range?.endSeconds ?? audio.duration;
    if (!isFinite(end) || end <= 0) return Infinity;
    const remaining = (end - audio.currentTime) / Math.max(0.1, audio.playbackRate);
    return remaining > 0 ? remaining : 0;
  }, [activeKey]);

  return {
    activeKey,
    audioState,
    progress,
    playbackRate,
    cyclePlaybackRate,
    currentSurah: queueRef.current?.surah ?? null,
    currentAyah:  queueRef.current?.current ?? null,
    currentWordPos,                                          // 1-based word in active ayah
    getRemainingSeconds,
    handlePlay,
    playFrom,
    /** Режим текущей сессии — нужен возобновлению после паузы, чтобы оно
     *  не сбрасывало непрерывное чтение суры обратно на поаятное. */
    currentMode: () => playbackMode,
    next,
    prev,
    pause: pauseCurrent,
    stopAll,
  };
}
