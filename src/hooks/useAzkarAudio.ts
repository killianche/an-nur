import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Audio playback hook for the Azkar screens.
 *
 * Why a separate hook from useAyahAudio:
 *  - Azkar tracks are single-file OGG, not per-ayah HTTP slices, so the
 *    elaborate prefetching / caching dance for Quran recitation is
 *    unnecessary here.
 *  - There's no word-level karaoke data — no segments, no rAF cursor.
 *  - Queue is a simple ordered list of entry IDs handed in by the
 *    category screen, with prev/next moving through them.
 *
 * Playback rate is the only knob shared with the Quran player and lives
 * in the same localStorage key so changing speed in one place takes
 * effect everywhere.
 */
type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

export const PLAYBACK_RATES = [0.75, 1.0, 1.25, 1.5] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];

const KEY_PLAYBACK_RATE = 'audio.playbackRate';

function readStoredRate(): PlaybackRate {
  const v = parseFloat(localStorage.getItem(KEY_PLAYBACK_RATE) ?? '1.0');
  return (PLAYBACK_RATES as readonly number[]).includes(v) ? (v as PlaybackRate) : 1.0;
}

/** Queue entry — id is whatever the caller uses to identify a card (e.g.
 *  `azkar-005`), url is the absolute OGG path under /azkar/audio/. */
export type AzkarTrack = { id: string; url: string };

/** Module-level cache: one <audio> per URL.  Survives unmount so going
 *  back to a category and tapping the same azkar plays from cache. */
const audioCache = new Map<string, HTMLAudioElement>();

function getOrCreate(url: string): HTMLAudioElement {
  const cached = audioCache.get(url);
  if (cached && !cached.error) return cached;
  const a = new Audio();
  a.preload = 'auto';
  a.src = url;
  audioCache.set(url, a);
  return a;
}

export function useAzkarAudio() {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRateS] = useState<PlaybackRate>(readStoredRate);

  // Current queue — populated by the latest handlePlay call.  Prev/next
  // walk this list. Stored as ref so changing the queue mid-playback
  // doesn't re-render every consumer.
  const queueRef = useRef<{ tracks: AzkarTrack[]; index: number } | null>(null);
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

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
    if (activeUrl) {
      audioCache.get(activeUrl)?.pause();
      setAudioState('paused');
    }
  }, [activeUrl]);

  const stopAll = useCallback(() => {
    audioCache.forEach(a => { a.pause(); a.currentTime = 0; });
    setActiveUrl(null);
    setActiveId(null);
    setAudioState('idle');
    setProgress(0);
    queueRef.current = null;
  }, []);

  const playOne = useCallback(async (track: AzkarTrack) => {
    const audio = getOrCreate(track.url);

    // Switching to a different track resets position; same-track resume
    // keeps currentTime (natural pause → play behaviour).
    if (activeUrl !== track.url) {
      // Stop the currently-playing audio so two don't overlap.
      if (activeUrl) audioCache.get(activeUrl)?.pause();
      audio.currentTime = 0;
    }

    setActiveUrl(track.url);
    setActiveId(track.id);
    setAudioState('loading');
    setProgress(0);

    const advanceOrStop = () => {
      const q = queueRef.current;
      if (q && q.index < q.tracks.length - 1) {
        q.index += 1;
        playOne(q.tracks[q.index]);
      } else {
        setAudioState('idle');
        setActiveUrl(null);
        setActiveId(null);
        setProgress(0);
        queueRef.current = null;
      }
    };

    audio.onended = () => {
      setProgress(1);
      advanceOrStop();
    };
    audio.onerror = () => {
      // Broken file (CDN hiccup, missing audio): drop the cached element
      // so the next attempt starts fresh, then keep the queue moving.
      audioCache.delete(track.url);
      console.warn('[azkar-audio] error', track.url, audio.error);
      advanceOrStop();
    };

    audio.playbackRate = playbackRateRef.current;
    try {
      await audio.play();
      setAudioState('playing');
    } catch (err) {
      console.warn('[azkar-audio] play() rejected', track.url, err);
      audioCache.delete(track.url);
      advanceOrStop();
    }
  }, [activeUrl]);

  /** Tap on a card → set queue context and play. Pass the full ordered
   *  queue (e.g. all morning azkars) and the index of the tapped one. */
  const handlePlay = useCallback((tracks: AzkarTrack[], index: number) => {
    const target = tracks[index];
    if (!target) return;
    queueRef.current = { tracks, index };
    // Same id tapped while already playing → toggle pause.
    if (activeUrl === target.url) {
      if (audioState === 'playing') {
        pauseCurrent();
        return;
      }
      // Same track, was paused → resume.
      playOne(target);
      return;
    }
    playOne(target);
  }, [activeUrl, audioState, pauseCurrent, playOne]);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    if (q.index < q.tracks.length - 1) {
      q.index += 1;
      playOne(q.tracks[q.index]);
    }
  }, [playOne]);

  const prev = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    if (q.index > 0) {
      q.index -= 1;
      playOne(q.tracks[q.index]);
    }
  }, [playOne]);

  // rAF-driven progress update — 60 fps so the dock hairline doesn't
  // judder.  Mirrors the same pattern useAyahAudio uses for the Quran
  // player; minus the word-position lookup.
  useEffect(() => {
    if (audioState !== 'playing' || !activeUrl) return;
    const audio = audioCache.get(activeUrl);
    if (!audio) return;

    let raf = 0;
    const tick = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) {
        setProgress(Math.min(1, Math.max(0, audio.currentTime / d)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioState, activeUrl]);

  return {
    activeId,
    audioState,
    progress,
    playbackRate,
    cyclePlaybackRate,
    handlePlay,
    next,
    prev,
    pause: pauseCurrent,
    stopAll,
  };
}
