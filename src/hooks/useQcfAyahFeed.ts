/**
 * useQcfAyahFeed — loads QCF V4 data for an entire surah, grouped by ayah.
 *
 * Why a separate hook from useQcfPage / useQcfSurah:
 *   QcfMushafPage rendered ONE page at a time. The ayah-feed UX needs ALL
 *   ayahs of a surah in order. We load every page the surah spans, then
 *   walk the lines and bucket each word into its verse_key.
 *
 * What is preserved per ayah:
 *   - `words`: every QcfWord with this verse_key, in encounter order across pages
 *   - `fonts`: distinct font family names used by the ayah's words (for useQcfFont)
 *   - `pageNum`: first page the ayah appears on (used for "Page N" chip)
 *
 * Decorative items (surah_header, basmala) live in `headers` / `basmala`
 * because they don't have a verse_key.  Basmala for surah 1 (Al-Fatiha) is
 * part of ayah 1:1 and ends up inside the ayah's words instead.
 *
 * Loading strategy: kicks off fetches for every page of the surah in
 * parallel.  Result is set once all pages finish (or fails on any).
 * Re-uses the page cache from useQcfPage so already-loaded pages don't
 * round-trip.
 */

import { useState, useEffect } from 'react';
import type { QcfWord, QcfPageData } from '../lib/qcf4';
import { loadVersesJson, pageJsonPath } from '../lib/qcf4';
import { getPageSync, preloadPage } from './useQcfPage';

/** One ayah's worth of QCF data, ready to render. */
export interface QcfAyahEntry {
  verseKey: string;
  surah: number;
  ayah: number;
  /** First page this ayah appears on */
  pageNum: number;
  /** All words in this ayah, in mushaf reading order */
  words: QcfWord[];
  /** Distinct fonts the words use — pass to useQcfFont */
  fonts: string[];
}

/** Decorative items that don't belong to any single ayah. */
export interface QcfSurahDecor {
  /** Words of type 'surah_header' (each line gets concatenated) */
  header: QcfWord[];
  /** Words of type 'basmala' — empty when the surah has no separate basmala
   *  (Al-Fatiha, At-Tawba), shown as a centered line when present */
  basmala: QcfWord[];
  /** Distinct fonts used by header + basmala — pass to useQcfFont */
  fonts: string[];
}

export interface QcfAyahFeed {
  decor: QcfSurahDecor;
  /** Ayahs sorted by ayah number ascending */
  ayahs: QcfAyahEntry[];
}

// Module-level LRU cache: surah → loaded feed (макс 10 сур одновременно).
// Map сохраняет insertion order; touchFeedCache переставляет accessed
// surah в end чтобы не выселить, и эвиктует самые старые при превышении.
// 10 — достаточно для типичного reading-flow (текущая сура + 2-3 в
// истории + Аль-Фатиха + 3-5 любимых), но не даёт расти бесконечно
// (Бакара feed ~3 МБ JSON parsed, 50+ сур = 150+ МБ RAM на iPhone — easy OOM).
const FEED_CACHE_MAX = 10;
const feedCache = new Map<number, QcfAyahFeed>();

function touchFeedCache(surahNumber: number, feed: QcfAyahFeed) {
  if (feedCache.has(surahNumber)) feedCache.delete(surahNumber);
  feedCache.set(surahNumber, feed);
  while (feedCache.size > FEED_CACHE_MAX) {
    const oldest = feedCache.keys().next().value;
    if (oldest == null) break;
    feedCache.delete(oldest);
  }
}

async function fetchPageData(pageNum: number): Promise<QcfPageData> {
  const cached = getPageSync(pageNum);
  if (cached) return cached;
  // Re-fetch directly — useQcfPage's internal Promise map is not exported,
  // but the GET will hit the browser's HTTP cache after the first request.
  const res = await fetch(pageJsonPath(pageNum));
  if (!res.ok) throw new Error(`page ${pageNum} HTTP ${res.status}`);
  return res.json() as Promise<QcfPageData>;
}

/**
 * Build the feed for one surah by walking every page it spans.
 * Decorative items (surah_header, basmala) are collected separately from
 * verse-keyed words so the renderer can place them above the ayah list.
 */
async function buildFeed(surahNumber: number): Promise<QcfAyahFeed> {
  const cached = feedCache.get(surahNumber);
  if (cached) return cached;

  const verses = await loadVersesJson();
  const prefix = `${surahNumber}:`;

  // Collect distinct pages the surah spans, sorted ascending.
  const pageSet = new Set<number>();
  for (const [key, val] of Object.entries(verses)) {
    if (key.startsWith(prefix)) pageSet.add(val.page);
  }
  const pageNums = Array.from(pageSet).sort((a, b) => a - b);

  // Fetch all pages in parallel.  Page cache from useQcfPage is re-used,
  // so a surah already partially loaded (e.g. user navigated to page 2 of
  // Al-Baqarah via the picker) gets that page instantly.
  const pages = await Promise.all(pageNums.map(p => fetchPageData(p)));

  // Buckets
  const ayahMap = new Map<string, QcfAyahEntry>();
  const headerWords: QcfWord[] = [];
  const basmalaWords: QcfWord[] = [];

  for (const page of pages) {
    for (const line of page.lines) {
      for (const word of line.words) {
        // Decorative — only for the current surah, skip if the page contains
        // another surah's header too (e.g. mid-page transitions)
        if (word.type === 'surah_header' && word.sura === surahNumber) {
          headerWords.push(word);
          continue;
        }
        // QCF V4 data uses the literal string `bismillah` for the Basmala
        // glyph row that precedes every surah except At-Tawba.  Earlier
        // versions of this code matched `basmala`, which never appears in
        // the source JSON — so the Basmala title row silently never rendered
        // for surahs 2..114.  Match the actual data string.
        if (word.type === 'bismillah' && word.sura === surahNumber) {
          basmalaWords.push(word);
          continue;
        }

        // Verse-keyed word
        if (!word.verse_key || !word.verse_key.startsWith(prefix)) continue;

        const existing = ayahMap.get(word.verse_key);
        if (existing) {
          existing.words.push(word);
        } else {
          const [, ayahStr] = word.verse_key.split(':');
          ayahMap.set(word.verse_key, {
            verseKey: word.verse_key,
            surah: surahNumber,
            ayah: parseInt(ayahStr, 10),
            pageNum: page.page,
            words: [word],
            fonts: [],
          });
        }
      }
    }
  }

  // Compute distinct fonts per ayah
  for (const entry of ayahMap.values()) {
    entry.fonts = Array.from(new Set(entry.words.map(w => w.font)));
  }

  const ayahs = Array.from(ayahMap.values()).sort((a, b) => a.ayah - b.ayah);

  const decorFonts = Array.from(
    new Set([
      ...headerWords.map(w => w.font),
      ...basmalaWords.map(w => w.font),
    ]),
  );

  const feed: QcfAyahFeed = {
    decor: {
      header: headerWords,
      basmala: basmalaWords,
      fonts: decorFonts,
    },
    ayahs,
  };

  touchFeedCache(surahNumber, feed);
  return feed;
}

/** Public hook — subscribes to the feed for a given surah. */
export function useQcfAyahFeed(surahNumber: number): {
  feed: QcfAyahFeed | null;
  loading: boolean;
  error: string | null;
} {
  const [feed, setFeed] = useState<QcfAyahFeed | null>(
    () => feedCache.get(surahNumber) ?? null,
  );
  const [loading, setLoading] = useState<boolean>(
    () => !feedCache.has(surahNumber),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = feedCache.get(surahNumber);
    if (cached) {
      setFeed(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setFeed(null);
    setLoading(true);
    setError(null);

    buildFeed(surahNumber)
      .then(result => {
        if (cancelled) return;
        setFeed(result);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Ошибка загрузки суры');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [surahNumber]);

  return { feed, loading, error };
}

/** Fire-and-forget preload of a surah's first page (warms cache for picker). */
export function preloadSurahFirstPage(surahNumber: number): void {
  loadVersesJson().then(verses => {
    const prefix = `${surahNumber}:`;
    for (const [key, val] of Object.entries(verses)) {
      if (key.startsWith(prefix)) {
        preloadPage(val.page);
        break;
      }
    }
  }).catch(() => { /* ignore */ });
}
