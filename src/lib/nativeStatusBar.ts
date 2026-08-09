/**
 * StatusBar theme sync — соответствие цвета iOS/Android status bar'а
 * текущей теме приложения.  Только нативный платформо-specific
 * (в браузере no-op).
 *
 * Light themes → DARK иконки (чёрные на светлом фоне).
 * Dark / cosmic themes → LIGHT иконки (белые на тёмном).
 *
 * Без вызова system показывает status bar дефолтного цвета:
 * на iOS чёрный текст всегда (даже на cosmic-теме — выглядит грязно),
 * на Android — random из манифеста.
 *
 * Capacitor.StatusBar — единственное API: web-fallback пустой.
 */
import { themeMode, type Theme } from '../hooks/useTheme';

let initialized = false;
let StatusBarMod: typeof import('@capacitor/status-bar') | null = null;

async function loadStatusBar() {
  if (StatusBarMod) return StatusBarMod;
  try {
    StatusBarMod = await import('@capacitor/status-bar');
    return StatusBarMod;
  } catch {
    // В браузере Capacitor.StatusBar бросает — возвращаем null.
    return null;
  }
}

export async function syncStatusBarToTheme(theme: Theme) {
  const mod = await loadStatusBar();
  if (!mod) return;
  const { StatusBar, Style } = mod;
  const mode = themeMode(theme);
  try {
    if (mode === 'light') {
      // Тёмный текст на светлом фоне.
      await StatusBar.setStyle({ style: Style.Light });
    } else {
      // Светлый текст на тёмном фоне (dark + cosmic).
      await StatusBar.setStyle({ style: Style.Dark });
    }
    initialized = true;
  } catch {
    // Не нативная платформа — silent fail.
  }
}

export function isStatusBarInitialized(): boolean {
  return initialized;
}
