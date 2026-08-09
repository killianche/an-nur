/**
 * Sentry setup — crash-reporting для production.
 *
 * Без активного DSN initSentry() ничего не делает (no-op) — для dev
 * никакого шума.  На прод DSN передаётся через Vite env-переменную
 * VITE_SENTRY_DSN (создать .env.production.local с одной строкой
 * VITE_SENTRY_DSN=https://...@sentry.io/...).
 *
 * Что собираем:
 *  • Все необработанные ошибки + unhandled promise rejections.
 *  • Custom events через captureMessage / captureException (вызываем
 *    из критичных мест: audio fail, surah load fail, sacred-text
 *    integrity).
 *  • ZERO PII: настройки send_default_pii=false, БЕЗ user identifier.
 *    Сэмплируем 100% ошибок, 0% traces (трейсинг не нужен — это
 *    reading-app, не SaaS dashboard).
 *
 * Privacy implications:
 *  • Sentry получает URL текущей страницы, user-agent, viewport,
 *    component stack ошибки.  НЕ получает: prefs пользователя,
 *    прочитанные аяты, закладки.
 *  • Это нужно отразить в Privacy Policy + iOS Privacy Manifest +
 *    Android Data Safety form (см. ROADMAP.md Неделя 5).
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (!DSN) {
    // dev / прод без DSN: no-op, чтобы не плодить console-spam.
    return;
  }
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,            // 'production' / 'development'
    release: import.meta.env.VITE_RELEASE_VERSION as string | undefined,
    sendDefaultPii: false,                        // никаких PII
    tracesSampleRate: 0,                          // не нужен performance trace
    replaysSessionSampleRate: 0,                  // не нужны session replays
    replaysOnErrorSampleRate: 0,
    integrations: [],                             // только базовый error capture
    beforeSend(event) {
      // Лишний guard — выкинуть события с PII-подобными строками если
      // вдруг что-то проникло.  Сейчас тривиальный pass-through, можно
      // расширить если найдём проблемы.
      return event;
    },
  });
  initialized = true;
}

/** Вызывать из критичных catch-блоков (audio fail, surah load fail). */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureException(err, { extra: context });
}

/** Вызывать для не-Error custom events (например, «sacred-text checksum
 *  mismatch» — это не throw, но мы хотим знать). */
export function captureMessage(msg: string, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureMessage(msg, { extra: context });
}
