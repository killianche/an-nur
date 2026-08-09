/**
 * useChunkedRender — progressive disclosure для длинных списков.
 *
 * Вместо полной виртуализации (которая ломает scroll-restore +
 * audio-sync + anchor-jump в SurahScreen) — рендерим первые N
 * элементов сразу, а остальные добавляем батчами через
 * requestIdleCallback.  Первый paint Бакары становится мгновенным
 * (30 ayah'ей вместо 286), но через 1-2 секунды весь список
 * mount'ится — все эффекты, основанные на полном DOM, работают как
 * раньше.
 *
 * Когда `forceUpTo` задано — visibleCount подскакивает до этого
 * значения сразу (используется для initialAyah-jump: если просили
 * прыгнуть на ayah 250, нужно гарантировать что он mount'нут).
 *
 * Если браузер не поддерживает requestIdleCallback (Safari < 16.4) —
 * fallback на setTimeout(16) — теряем prioritization но не функцию.
 */
import { useEffect, useState } from 'react';

type Options = {
  /** Сколько mount'нуть на первый paint.  Default 30. */
  initial?: number;
  /** Размер батча на каждый idle-tick.  Default 30. */
  batch?: number;
  /** Минимальный visibleCount — поднимется до этого значения сразу.
   *  Полезно когда нужно гарантировать, что определённый элемент
   *  уже в DOM (jump to ayah-anchor). */
  forceUpTo?: number;
};

const ric: (cb: () => void) => number =
  (typeof window !== 'undefined' && 'requestIdleCallback' in window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 200 })
    : (cb) => window.setTimeout(cb, 16);

const cic: (id: number) => void =
  (typeof window !== 'undefined' && 'cancelIdleCallback' in window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (id) => (window as any).cancelIdleCallback(id)
    : (id) => window.clearTimeout(id);

export function useChunkedRender(total: number, opts: Options = {}): number {
  const { initial = 30, batch = 30, forceUpTo } = opts;
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(total, Math.max(initial, forceUpTo ?? 0))
  );

  // Reset on total change (новая сура).
  useEffect(() => {
    setVisibleCount(Math.min(total, Math.max(initial, forceUpTo ?? 0)));
  }, [total, initial, forceUpTo]);

  // Schedule idle-render до тех пор, пока не покрыт весь total.
  useEffect(() => {
    if (visibleCount >= total) return;
    let cancelled = false;
    const id = ric(() => {
      if (cancelled) return;
      setVisibleCount(v => Math.min(total, v + batch));
    });
    return () => { cancelled = true; cic(id); };
  }, [visibleCount, total, batch]);

  return visibleCount;
}
