/** Загружает один небольшой JSON с фиксированными строками цветного мусхафа. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  tajweedAyahFromPage,
  tajweedPageJsonPath,
  type TajweedPageData,
} from '../lib/tajweedPage';
import type { TajweedAyahData } from '../content/quran-tajweed-meta';

const cache = new Map<number, TajweedPageData>();
const inFlight = new Map<number, Promise<TajweedPageData>>();

export function ensureTajweedPage(page: number): Promise<TajweedPageData> {
  const cached = cache.get(page);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(page);
  if (existing) return existing;

  const promise = fetch(tajweedPageJsonPath(page))
    .then(response => {
      if (!response.ok) throw new Error(`tajweed page ${page} HTTP ${response.status}`);
      return response.json() as Promise<TajweedPageData>;
    })
    .then(data => {
      cache.set(page, data);
      inFlight.delete(page);
      return data;
    })
    .catch(error => {
      inFlight.delete(page);
      throw error;
    });

  inFlight.set(page, promise);
  return promise;
}

export function preloadTajweedPage(page: number | null): void {
  if (page == null || cache.has(page)) return;
  void ensureTajweedPage(page).catch(() => { /* основной экран покажет fallback */ });
}

export function useTajweedPage(
  page: number,
  enabled: boolean,
): {
  data: TajweedPageData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [data, setData] = useState<TajweedPageData | null>(
    () => (enabled ? cache.get(page) ?? null : null),
  );
  const [loading, setLoading] = useState(enabled && !cache.has(page));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(!cache.has(page));
    setError(null);
    setData(cache.get(page) ?? null);
    ensureTajweedPage(page)
      .then(value => {
        if (cancelled) return;
        setData(value);
        setLoading(false);
      })
      .catch(reason => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'Ошибка цветной страницы');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, enabled, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { data, loading, error, retry };
}

/** Один аят из постраничного кэша — без загрузки общего 3.3-МБ словаря. */
export function useTajweedAyahPage(
  page: number,
  verseKey: string,
  enabled: boolean,
): {
  data: TajweedAyahData | null;
  loading: boolean;
  error: string | null;
} {
  const result = useTajweedPage(page, enabled);
  const data = useMemo(
    () => tajweedAyahFromPage(result.data, verseKey),
    [result.data, verseKey],
  );
  return { data, loading: result.loading, error: result.error };
}
