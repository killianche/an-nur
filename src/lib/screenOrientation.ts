import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export type ReaderOrientation = 'portrait' | 'landscape';

/**
 * Ориентацией управляет приложение, а не датчик телефона. На вебе оставляем
 * обычное поведение браузера; текущий релизный этап — нативный iOS.
 */
export async function lockReaderOrientation(orientation: ReaderOrientation): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await ScreenOrientation.lock({ orientation });
}

