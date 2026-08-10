/**
 * Lazy-loader для quran-tajweed-glyphs.ts (~3 MB словарь 6240 аятов).
 *
 * Раньше getTajweedAyah был sync-импортом — модуль попадал в main
 * bundle, увеличивая его на 3 MB и удлиняя TTI.  Tajweed-mode — это
 * opt-in (пользователь явно выбирает Tajweed-шрифт в настройках),
 * поэтому грузить словарь сразу не нужно.
 *
 * Pattern: модуль кэшируется в одном промисе на всё время жизни
 * приложения.  Первый вызов loadTajweedModule() инициирует динамический
 * import, последующие — мгновенно возвращают тот же промис.  Hook
 * useTajweedAyah оборачивает это в React state — компонент
 * перерисовывается, как только данные приехали.
 */
import { useEffect, useState } from 'react';
import type { TajweedAyahData } from './quran-tajweed-meta';

type GlyphsModule = typeof import('./quran-tajweed-glyphs');

let modulePromise: Promise<GlyphsModule> | null = null;
let cached: GlyphsModule | null = null;

export function loadTajweedModule(): Promise<GlyphsModule> {
  if (!modulePromise) {
    modulePromise = import('./quran-tajweed-glyphs').then(m => {
      cached = m;
      return m;
    });
  }
  return modulePromise;
}

/**
 * Хук возвращает TajweedAyahData для аята или null (нет данных / ещё
 * грузится).  Первый вызов триггерит загрузку модуля; пока промис
 * не resolved — возвращает null (вызывающий компонент должен показать
 * fallback, обычно обычный QcfAyahLine).
 */
export function useTajweedAyah(
  verseKey: string,
  /**
   * Включён ли режим таджвида прямо сейчас.
   *
   * Без этого флага было тихо плохо: хук вызывается из
   * ArabicAyahRouter безусловно (React запрещает условные хуки), а его
   * эффект дёргал loadTajweedModule() при первом же аяте — то есть
   * словарь на 3 МБ приезжал КАЖДОМУ, включая тех, кто таджвид ни разу
   * не открывал.  Ленивое разбиение существовало, но не работало.
   */
  enabled: boolean,
): TajweedAyahData | null {
  const [data, setData] = useState<TajweedAyahData | null>(() => {
    return enabled && cached ? cached.getTajweedAyah(verseKey) : null;
  });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    if (cached) {
      setData(cached.getTajweedAyah(verseKey));
    } else {
      loadTajweedModule().then(m => {
        if (alive) setData(m.getTajweedAyah(verseKey));
      });
    }
    return () => { alive = false; };
  }, [verseKey, enabled]);
  return data;
}
