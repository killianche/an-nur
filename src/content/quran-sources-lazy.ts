/**
 * Lazy-loader для quran-sources.ts (~3.7 МБ: арабский + перевод Кулиева,
 * 6236 аятов).
 *
 * Зачем. Модуль был sync-импортом и через lib/search.ts попадал в главный
 * чанк: собранный index.js весил 4.58 МБ, и WKWebView обязан был разобрать
 * и ВЫПОЛНИТЬ гигантский объектный литерал до первого рендера. Всё это время
 * человек смотрел на заставку — ровно то, что ощущалось как «приложение
 * тупит на входе». Ни список сур, ни намаз, ни азкары текста Корана для
 * первого кадра не требуют.
 *
 * Pattern тот же, что у quran-tajweed-lazy.ts: один промис на всё время
 * жизни приложения, первый вызов инициирует динамический import.
 *
 * Отличие от таджвида: здесь данные нужны почти всем (чтение, поиск,
 * закладки), поэтому App.tsx прогревает их в простое сразу после первого
 * кадра. К моменту, когда человек откроет суру, словарь обычно уже готов, и
 * скелет не мелькает.
 *
 * Сам quran-sources.ts НЕ изменялся — это сакральный текст, он переносится
 * посимвольно. Меняется только способ загрузки.
 */
import { useEffect, useState } from 'react';
import type { QuranSource } from './quran-sources';

export type QuranSources = Record<string, QuranSource>;

let modulePromise: Promise<QuranSources> | null = null;
let cached: QuranSources | null = null;

export function loadQuranSources(): Promise<QuranSources> {
  if (!modulePromise) {
    modulePromise = import('./quran-sources').then(m => {
      cached = m.QURAN_SOURCES;
      return m.QURAN_SOURCES;
    });
  }
  return modulePromise;
}

/** Синхронный доступ для не-React кода. null — ещё не загружено. */
export function getQuranSources(): QuranSources | null {
  return cached;
}

/**
 * Прогрев в простое. Вызывается один раз после первого отрисованного кадра:
 * загрузка не конкурирует ни с первым рендером, ни с первым касанием.
 */
export function warmQuranSources(): void {
  if (modulePromise) return;
  const start = () => { void loadQuranSources(); };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(start, { timeout: 3000 });
  } else {
    // Safari до 17.4 не знает requestIdleCallback. setTimeout, а не rAF:
    // rAF не тикает в скрытой вкладке (см. CLAUDE.md, § «Грабли»).
    setTimeout(start, 1200);
  }
}

/**
 * Хук возвращает словарь источников или null, пока он грузится.
 *
 * `enabled` нужен там, где данные требуются не всегда (поиск открывается
 * не у каждого): пока флаг false, загрузку не инициируем.
 */
export function useQuranSources(enabled = true): QuranSources | null {
  const [sources, setSources] = useState<QuranSources | null>(cached);
  useEffect(() => {
    if (!enabled) return;
    if (cached) {
      setSources(cached);
      return;
    }
    let alive = true;
    void loadQuranSources().then(loaded => {
      if (alive) setSources(loaded);
    });
    return () => { alive = false; };
  }, [enabled]);
  return sources;
}
