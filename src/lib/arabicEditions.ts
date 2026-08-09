/**
 * arabicEditions — lazy loader for the bundled multi-edition Arabic data
 * (V1 codes, V2 codes, Uthmani Hafs Unicode), keyed by verseKey "S:A".
 * The dataset lives at /arabic-editions.json (~3.9 MB gzipped to ~1.5 MB)
 * and is fetched once on first use; subsequent lookups are synchronous
 * through the cached promise.
 *
 * The JSON still carries an `indopak` column from when IndoPak rendering
 * was a picker option; the field stays in the on-wire payload (no point
 * regenerating the dataset for a few KB) but is no longer surfaced in
 * the TypeScript type so accidental reads error at compile time.
 *
 * Why bundle as one JSON instead of inlining into quran-sources.ts:
 *   - quran-sources.ts already weighs in at hundreds of KB compressed;
 *     adding 4 more text columns × 6236 rows would balloon the JS chunk
 *     that ships on every page load even for users who never switch
 *     Arabic font away from the default QCF V4.
 *   - The extra editions are only needed when the reader picks an
 *     alternative font.  Lazy-fetch keeps the cold start unchanged.
 */

export type AyahEditionData = {
  /** V1 (Madani 1405) font page index — pick QCF_P{page:03d}.woff2 */
  v1Page: number;
  /** Concatenated PUA codepoints for the whole ayah in V1 (no spaces) */
  v1Codes: string;
  /** V2 font page index — pick QCF2{page:03d}.woff2 */
  v2Page: number;
  /** Per-word PUA codepoints in V2 (already split by space) */
  v2Words: string[];
  /** KFGQPC Uthmanic Hafs orthography text (matches UthmanicHafs1/v22 fonts) */
  uthmani: string;
};

type Manifest = Record<string, AyahEditionData>;

let promise: Promise<Manifest> | null = null;
let cache: Manifest | null = null;

/** Kick off the fetch (returns a promise; safe to call repeatedly). */
export function loadArabicEditions(): Promise<Manifest> {
  if (cache) return Promise.resolve(cache);
  if (promise) return promise;
  promise = fetch('/arabic-editions.json')
    .then(r => {
      if (!r.ok) throw new Error(`arabic-editions HTTP ${r.status}`);
      return r.json() as Promise<Manifest>;
    })
    .then(m => {
      cache = m;
      return m;
    });
  return promise;
}

/** Synchronous lookup — returns null until loadArabicEditions resolves. */
export function getEdition(verseKey: string): AyahEditionData | null {
  return cache?.[verseKey] ?? null;
}
