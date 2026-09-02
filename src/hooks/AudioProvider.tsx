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
 * ── 🔴 Два контекста, а не один ───────────────────────────────────────
 *
 * Это не любовь к слоям. Состояние воспроизведения меняется постоянно:
 * позиция слова, прогресс, номер аята. Если раздавать его тем же контекстом,
 * что и действия, каждый тик перерисовывал бы КАЖДОГО потребителя — включая
 * список из 114 сур на главном экране.
 *
 * Поэтому:
 *   • `AudioActionsContext` — объект действий, созданный один раз и больше
 *     никогда не меняющийся. Действия ходят через ref к свежему хуку, так
 *     что замыкание не устаревает, а ссылка остаётся прежней.
 *   • `AudioStateContext` — то, что меняется. Его берут только те, кому
 *     правда нужно: плеер, подсветка читаемого аята.
 *
 * Компонент, которому нужна только кнопка «включить», подписывается на
 * действия и не перерисовывается ни разу за всю суру.
 */

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useAyahAudio, type PlaybackMode, type PlaybackRate } from './useAyahAudio';
import { DEFAULT_RECITER, RECITERS, type ReciterId } from '../lib/reciters';
import { readPref } from '../lib/typography';

const RECITER_IDS = RECITERS.map(r => r.id);

/** Меняющаяся часть: перерисовывает подписчиков на каждом обновлении. */
export type AudioState = {
  activeKey: string | null;
  audioState: 'idle' | 'loading' | 'playing' | 'paused';
  progress: number;
  playbackRate: PlaybackRate;
  currentSurah: number | null;
  currentAyah: number | null;
  currentWordPos: number | null;
  reciter: ReciterId;
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
  getRemainingSeconds: () => number | null;
  setReciter: (id: ReciterId) => void;
};

const AudioStateContext = createContext<AudioState | null>(null);
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

  const state = useMemo<AudioState>(() => ({
    activeKey: audio.activeKey,
    audioState: audio.audioState,
    progress: audio.progress,
    playbackRate: audio.playbackRate,
    currentSurah: audio.currentSurah,
    currentAyah: audio.currentAyah,
    currentWordPos: audio.currentWordPos,
    reciter,
  }), [
    audio.activeKey, audio.audioState, audio.progress, audio.playbackRate,
    audio.currentSurah, audio.currentAyah, audio.currentWordPos, reciter,
  ]);

  return (
    <AudioActionsContext.Provider value={actions}>
      <AudioStateContext.Provider value={state}>
        {children}
      </AudioStateContext.Provider>
    </AudioActionsContext.Provider>
  );
}

/** Действия. Подписка на них НЕ вызывает перерисовок. */
export function useAudioActions(): AudioActions {
  const v = useContext(AudioActionsContext);
  if (!v) throw new Error('useAudioActions вызван вне AudioProvider');
  return v;
}

/** Состояние воспроизведения. Перерисовывает на каждом обновлении. */
export function useAudioState(): AudioState {
  const v = useContext(AudioStateContext);
  if (!v) throw new Error('useAudioState вызван вне AudioProvider');
  return v;
}
