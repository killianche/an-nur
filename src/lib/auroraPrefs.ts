/**
 * auroraPrefs — скорость «жизни» свечения в теме «Аврора».
 *
 * Две независимые величины, потому что это два разных ощущения:
 *
 *  • **Дыхание** — свечение по краям то набирает силу, то отступает.
 *    Медленное изменение яркости всей рамки.
 *  • **Течение** — светлое пятно обходит экран по кругу: сверху вниз
 *    по одной стороне, снизу вверх по другой. Это перемещение, а не
 *    яркость.
 *
 * Обе выражены в СЕКУНДАХ ПОЛНОГО ЦИКЛА, а не в абстрактных «1..5»:
 * число сразу говорит, сколько ждать повтора, и его видно в CSS-
 * переменной при отладке.
 *
 * Значения подбирались из простого правила: движение на периферии
 * зрения не должно попадать в фокус внимания, пока человек читает.
 * Цикл короче ~40 с для течения глаз уже ловит как «что-то ползёт»;
 * дыхание короче ~10 с читается как мигание. Отсюда нижние границы.
 *
 * Хранится в localStorage, синхронизируется событием — как и остальные
 * префы (см. audioPrefs).
 */

export type AuroraSpeed = 'off' | 'slow' | 'normal' | 'fast';

export const AURORA_SPEED_LABELS: Record<AuroraSpeed, string> = {
  off: 'Выкл',
  slow: 'Медленно',
  normal: 'Обычно',
  fast: 'Быстрее',
};

/** Порядок для сегментированного переключателя. */
export const AURORA_SPEEDS: AuroraSpeed[] = ['off', 'slow', 'normal', 'fast'];

/** Полный цикл дыхания, секунды.  0 — выключено. */
export const PULSE_SECONDS: Record<AuroraSpeed, number> = {
  off: 0,
  slow: 34,
  normal: 22,
  fast: 13,
};

/** Полный оборот течения вокруг экрана, секунды.  0 — выключено. */
export const FLOW_SECONDS: Record<AuroraSpeed, number> = {
  off: 0,
  slow: 220,
  normal: 140,
  fast: 80,
};

const KEY_PULSE = 'aurora.pulse';
const KEY_FLOW = 'aurora.flow';
const EVENT = 'aurora-prefs-changed';

/** Дефолт — «Медленно» у обоих: тема для чтения, а не для показа. */
const DEFAULT_PULSE: AuroraSpeed = 'slow';
const DEFAULT_FLOW: AuroraSpeed = 'slow';

function read(key: string, fallback: AuroraSpeed): AuroraSpeed {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return v === 'off' || v === 'slow' || v === 'normal' || v === 'fast'
    ? v
    : fallback;
}

function write(key: string, v: AuroraSpeed) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, v);
  window.dispatchEvent(new Event(EVENT));
}

export function getAuroraPulse(): AuroraSpeed { return read(KEY_PULSE, DEFAULT_PULSE); }
export function setAuroraPulse(v: AuroraSpeed) { write(KEY_PULSE, v); }

export function getAuroraFlow(): AuroraSpeed { return read(KEY_FLOW, DEFAULT_FLOW); }
export function setAuroraFlow(v: AuroraSpeed) { write(KEY_FLOW, v); }

export const AURORA_PREFS_EVENT = EVENT;

/** Подписка на изменения.  Возвращает функцию отписки. */
export function onAuroraPrefsChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  // 'storage' — правка из другой вкладки; в нативной обёртке не
  // случается, но в браузере при отладке в двух окнах помогает.
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}
