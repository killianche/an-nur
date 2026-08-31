/**
 * arabicEditions — lazy loader for the bundled multi-edition Arabic data
 * (V1 codes, Uthmani Hafs Unicode), keyed by verseKey "S:A".
 * The dataset lives at /arabic-editions.json (1.8 MB) and is fetched once
 * on first use; subsequent lookups are synchronous through the cached
 * promise.
 *
 * ── Что из набора выкинуто 31.08.2026 и почему ────────────────────────
 *
 * Прежде файл вёз ещё три столбца: `indopak` (1,4 МБ) от удалённого режима
 * IndoPak и `v2Page` / `v2Words` (0,8 МБ) под шрифты QCF V2, которых в
 * проекте нет и никогда не было — каталога `public/qcf2` не существует.
 * Ни один из трёх не читался ни строчкой кода.
 *
 * Комментарий на их месте раньше оправдывал это так: «нет смысла
 * перегенерировать набор ради нескольких килобайт». Оценка была неверной —
 * не килобайты, а **2 МБ**, и втрое: в `public` и в двух нативных пакетах.
 * Файл статический, генератора у него нет, поэтому «перегенерировать» и не
 * требовалось: столбцы удалены на месте, а значения оставшихся полей
 * сверены посимвольно (хеш всего текста Усмани до и после совпал).
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
