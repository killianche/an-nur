/**
 * AudioProvider — одно звучание на всё приложение.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Раньше `useAyahAudio` вызывали ЛЕНТА и МУСХАФ по отдельности, каждый со
 * своим состоянием и своим чтецом. Пока звук был принадлежностью экрана
 * чтения, это работало. Но плеер обязан пережить уход с экрана: включил
 * суру, свернул, пошёл в намаз или азкары — чтение продолжается. С аудио
 * внутри экрана это невозможно: экран размонтируется, звук обрывается, а с
 * главного экрана суру и вовсе нельзя было включить — там просто не было
 * никакого аудиосостояния.
 *
 * Побочно чинится расхождение: чтец жил двумя независимыми `useState` в
 * ленте и в мусхафе. Оба читали один ключ хранилища, но смена в одном месте
 * не доходила до другого до перемонтирования.
 *
 * ── 🔴 Три контекста, а не один ───────────────────────────────────────
 *
 * Это не любовь к слоям, а цена ошибки. Сначала контекстов было два:
 * действия и «состояние». В состояние попали и прогресс, и позиция слова —
 * а они меняются несколько раз в секунду. Из-за этого список из 114 сур на
 * главном экране перерисовывался на каждом тике воспроизведения, хотя
 * комментарий здесь утверждал обратное. Список не виртуализован, в каждой
 * строке арабское имя суры — цена заметная.
 *
 * Поэтому частое отделено от редкого:
 *   • `AudioActionsContext` — объект действий, созданный один раз и больше
 *     никогда не меняющийся. Действия ходят через ref к свежему хуку, так
 *     что замыкание не устаревает, а ссылка остаётся прежней.
 *   • `AudioSessionContext` — что звучит: сура, аят, состояние, скорость,
 *     чтец. Меняется на границе аята, то есть раз в десятки секунд.
 *   • `AudioTickContext` — прогресс и позиция слова. Меняется постоянно, и
 *     подписываются на него только двое: полоса плеера и караоке-подсветка.
 *
 * Компоненту, которому нужны кнопка «включить» и название суры, тик не
 * приходит вовсе.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useAyahAudio, type PlaybackMode, type PlaybackRate } from './useAyahAudio';
import { DEFAULT_RECITER, RECITERS, type ReciterId } from '../lib/reciters';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { bindMediaSessionHandlers } from '../lib/mediaSession';
import { readPref } from '../lib/typography';

const RECITER_IDS = RECITERS.map(r => r.id);

/** Что звучит. Меняется на границе аята — редко. */
export type AudioSession = {
  activeKey: string | null;
  audioState: 'idle' | 'loading' | 'playing' | 'paused';
  playbackRate: PlaybackRate;
  currentSurah: number | null;
  currentAyah: number | null;
  reciter: ReciterId;
};

/** Как идёт текущий аят. Меняется несколько раз в секунду. */
export type AudioTick = {
  progress: number;
  currentWordPos: number | null;
};

/** Неизменная часть: ссылка на этот объект живёт всё время работы. */
export type AudioActions = {
  handlePlay: (surah: number, ayah: number, lastAyah?: number) => void;
  playFrom: (surah: number, fromAyah: number, lastAyah: number, mode?: PlaybackMode) => void;
  /** Включить суру целиком с начала — непрерывной записью, без швов. */
  playSurah: (surah: number, ayahCount: number) => void;
  next: () => void;
  prev: () => void;
  pause: () => void;
  stopAll: () => void;
  cyclePlaybackRate: () => void;
  currentMode: () => PlaybackMode;
  getRemainingSeconds: () => number;
  setReciter: (id: ReciterId) => void;
};

const AudioSessionContext = createContext<AudioSession | null>(null);
const AudioTickContext = createContext<AudioTick | null>(null);
const AudioActionsContext = createContext<AudioActions | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [reciter, setReciterState] = useState<ReciterId>(
    () => readPref<ReciterId>('reciter', DEFAULT_RECITER, RECITER_IDS),
  );
  const audio = useAyahAudio(reciter);

  // Свежий хук под стабильными действиями: сами функции `useAyahAudio`
  // меняют ссылку при каждом обновлении состояния, и без этого объект
  // действий перестал бы быть неизменным.
  const live = useRef(audio);
  live.current = audio;

  /**
   * Смена чтеца на ходу перезапускает текущий аят новым голосом.
   *
   * 🔴 Без этого подпись и голос расходились: в полоске и на экране плеера
   * сразу появлялось новое имя, а звучал прежний чтец до конца аята. Человек
   * видел одно, слышал другое — и это тот же класс ошибки, что «показано не
   * то, что звучит».
   *
   * Перезапуск делается эффектом, а не прямо в `setReciter`: там состояние
   * ещё не применилось, и хук взял бы прежнего чтеца.
   */
  const prevReciter = useRef(reciter);
  useEffect(() => {
    if (prevReciter.current === reciter) return;
    prevReciter.current = reciter;
    const a = live.current;
    if (a.audioState !== 'playing' && a.audioState !== 'loading') return;
    if (!a.currentSurah || !a.currentAyah) return;
    const meta = SURAH_BY_NUMBER[a.currentSurah];
    a.playFrom(a.currentSurah, a.currentAyah, meta?.ayahs ?? 9999, a.currentMode());
  }, [reciter]);

  /**
   * Кнопки на заблокированном экране и в пункте управления.
   *
   * 🔴 Их НЕ БЫЛО ВООБЩЕ. Модуль `mediaSession.ts` умеет их привязывать с
   * самого начала, но `bindMediaSessionHandlers` не вызывался ни из одного
   * места — я проверил поиском по всему `src`. Поэтому карточка «сейчас
   * играет» на замке появлялась (её рисует система, раз звучит аудио), а
   * кнопки были мертвы: нажать паузу или перейти к следующему аяту с
   * заблокированного телефона было невозможно. Владелец 09.09.2026 описал
   * это дословно: «им невозможно управлять».
   *
   * Привязка живёт здесь, а не в экране: экраны монтируются и исчезают, а
   * звук продолжается — обработчики обязаны пережить любой переход.
   * Обращаемся через `live.current`, поэтому привязка одноразовая и не
   * пересоздаётся на каждом обновлении состояния.
   */
  useEffect(() => {
    bindMediaSessionHandlers({
      onPlay: () => {
        const a = live.current;
        if (!a.currentSurah) return;
        const meta = SURAH_BY_NUMBER[a.currentSurah];
        a.playFrom(a.currentSurah, a.currentAyah ?? 1, meta?.ayahs ?? 9999, a.currentMode());
      },
      onPause: () => live.current.pause(),
      onPrev: () => live.current.prev(),
      onNext: () => live.current.next(),
    });
  }, []);

  const setReciter = useCallback((id: ReciterId) => {
    setReciterState(id);
    localStorage.setItem('reciter', id);
  }, []);

  const actions = useMemo<AudioActions>(() => ({
    handlePlay: (surah, ayah, lastAyah) => live.current.handlePlay(surah, ayah, lastAyah),
    playFrom: (surah, from, last, mode) => live.current.playFrom(surah, from, last, mode),
    playSurah: (surah, ayahCount) => live.current.playFrom(surah, 1, ayahCount, 'surah'),
    next: () => live.current.next(),
    prev: () => live.current.prev(),
    pause: () => live.current.pause(),
    stopAll: () => live.current.stopAll(),
    cyclePlaybackRate: () => live.current.cyclePlaybackRate(),
    currentMode: () => live.current.currentMode(),
    getRemainingSeconds: () => live.current.getRemainingSeconds(),
    setReciter,
  }), [setReciter]);

  const session = useMemo<AudioSession>(() => ({
    activeKey: audio.activeKey,
    audioState: audio.audioState,
    playbackRate: audio.playbackRate,
    currentSurah: audio.currentSurah,
    currentAyah: audio.currentAyah,
    reciter,
  }), [
    audio.activeKey, audio.audioState, audio.playbackRate,
    audio.currentSurah, audio.currentAyah, reciter,
  ]);

  const tick = useMemo<AudioTick>(() => ({
    progress: audio.progress,
    currentWordPos: audio.currentWordPos,
  }), [audio.progress, audio.currentWordPos]);

  return (
    <AudioActionsContext.Provider value={actions}>
      <AudioSessionContext.Provider value={session}>
        <AudioTickContext.Provider value={tick}>
          {children}
        </AudioTickContext.Provider>
      </AudioSessionContext.Provider>
    </AudioActionsContext.Provider>
  );
}

/** Действия. Подписка на них НЕ вызывает перерисовок. */
export function useAudioActions(): AudioActions {
  const v = useContext(AudioActionsContext);
  if (!v) throw new Error('useAudioActions вызван вне AudioProvider');
  return v;
}

/**
 * Что звучит: сура, аят, состояние, скорость, чтец.
 *
 * Перерисовывает подписчика на границе аята, а не на каждом тике. Это то,
 * что нужно почти всем — спискам, полоске, экрану плеера.
 */
export function useAudioState(): AudioSession {
  const v = useContext(AudioSessionContext);
  if (!v) throw new Error('useAudioState вызван вне AudioProvider');
  return v;
}

/**
 * Прогресс и позиция слова.
 *
 * 🔴 Подписываться только там, где это правда нужно: полоса плеера и
 * караоке-подсветка. Значения меняются несколько раз в секунду, и лишний
 * подписчик означает перерисовку своего поддерева с той же частотой.
 */
export function useAudioTick(): AudioTick {
  const v = useContext(AudioTickContext);
  if (!v) throw new Error('useAudioTick вызван вне AudioProvider');
  return v;
}
