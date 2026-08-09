/**
 * useQcfSurah — returns all mushaf page numbers for a given surah, sorted.
 *
 * Internally loads /qcf4/verses.json once (1.4 MB, cached globally), then
 * scans the verse→page map to find which pages the surah spans.
 *
 * Also exports:
 *   findAyahPage(surahNum, ayahNum) → page number or null (async, uses cache)
 */

import { useState, useEffect } from 'react';
import { loadVersesJson } from '../lib/qcf4';

export function useQcfSurah(surahNumber: number): {
  pages: number[];
  loading: boolean;
} {
  const [pages, setPages] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPages([]);

    loadVersesJson().then(verses => {
      if (cancelled) return;

      const prefix = `${surahNumber}:`;
      const pageSet = new Set<number>();
      for (const [key, val] of Object.entries(verses)) {
        if (key.startsWith(prefix)) {
          pageSet.add(val.page);
        }
      }
      setPages(Array.from(pageSet).sort((a, b) => a - b));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [surahNumber]);

  return { pages, loading };
}

/**
 * Async helper: find the mushaf page number for a given ayah.
 * Returns null if not found (shouldn't happen for valid surah:ayah).
 */
export async function findAyahPage(
  surahNumber: number,
  ayahNumber: number,
): Promise<number | null> {
  const verses = await loadVersesJson();
  return verses[`${surahNumber}:${ayahNumber}`]?.page ?? null;
}
