/**
 * useQcfPage — loads and caches a single QCF V4 page JSON.
 *
 * Data lives at /qcf4/pages/NNN.json (3-digit zero-padded page number).
 * Results are kept in a module-level Map so navigating back to a page
 * already fetched is instant.
 *
 * Pass pageNum=null to disable the hook (used for adjacent-page preloading
 * when the adjacent page doesn't exist yet).
 */

import { useState, useEffect } from 'react';
import { type QcfPageData, pageJsonPath, hydratePage } from '../lib/qcf4';

// Module-level cache: page number → loaded data
const pageCache = new Map<number, QcfPageData>();
// Deduplication: one in-flight fetch per page
const pagePromises = new Map<number, Promise<QcfPageData>>();

function fetchPage(pageNum: number): Promise<QcfPageData> {
  const existing = pagePromises.get(pageNum);
  if (existing) return existing;

  const promise = fetch(pageJsonPath(pageNum))
    .then(r => {
      if (!r.ok) throw new Error(`page ${pageNum} HTTP ${r.status}`);
      return r.json() as Promise<QcfPageData>;
    })
    .then(raw => {
      // Номер страницы нужен каждому слову: шрифты нарезаны по страницам,
      // и семейство выбирается по паре (шрифт, страница).
      const data = hydratePage(raw);
      pageCache.set(pageNum, data);
      pagePromises.delete(pageNum);
      return data;
    })
    .catch(err => {
      pagePromises.delete(pageNum);
      throw err;
    });

  pagePromises.set(pageNum, promise);
  return promise;
}

/** Get cached page data synchronously, or null if not loaded yet. */
export function getPageSync(pageNum: number): QcfPageData | null {
  return pageCache.get(pageNum) ?? null;
}

/** Preload a page without subscribing to its state — fire-and-forget. */
export function preloadPage(pageNum: number | null): void {
  if (pageNum === null || pageCache.has(pageNum)) return;
  fetchPage(pageNum).catch(() => { /* ignore preload errors */ });
}

/**
 * Дождаться одной страницы.
 *
 * Нужно, чтобы заказать шрифты ПЕРВОЙ страницы суры, не дожидаясь
 * остальных: у Бакары их сорок пять, и пока едут все, шрифт первого
 * экрана даже не начинал качаться.  Какие подмножества нужны странице,
 * известно только из её json — отсюда обещание, а не fire-and-forget.
 */
export function ensurePage(pageNum: number): Promise<QcfPageData> {
  const cached = pageCache.get(pageNum);
  if (cached) return Promise.resolve(cached);
  return fetchPage(pageNum);
}

export function useQcfPage(pageNum: number | null): {
  data: QcfPageData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<QcfPageData | null>(
    () => (pageNum !== null ? pageCache.get(pageNum) ?? null : null),
  );
  const [loading, setLoading] = useState<boolean>(
    () => pageNum !== null && !pageCache.has(pageNum),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pageNum === null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Already in cache — instant
    const cached = pageCache.get(pageNum);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetchPage(pageNum)
      .then(page => {
        if (cancelled) return;
        setData(page);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Ошибка загрузки страницы');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pageNum]);

  return { data, loading, error };
}
