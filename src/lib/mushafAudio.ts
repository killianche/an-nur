export type AyahAudioState = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Visible Quran data is keyed as `surah:ayah`; the audio cache key also
 * contains the reciter. Mushaf UI must derive its key from queue coordinates
 * instead of comparing Quran data with the private cache key.
 */
export function mushafActiveVerseKey(
  currentSurah: number | null,
  currentAyah: number | null,
): string | null {
  return currentSurah && currentAyah ? `${currentSurah}:${currentAyah}` : null;
}

export function audioStateForVerse(
  verseKey: string | null,
  activeVerseKey: string | null,
  audioState: AyahAudioState,
): AyahAudioState {
  return verseKey && verseKey === activeVerseKey ? audioState : 'idle';
}
