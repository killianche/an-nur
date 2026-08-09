/**
 * useArabicPageFont — lazily injects @font-face rules for the per-page
 * KFGQPC mushaf fonts that QCF V1 ("Madani 1405") and QCF V2 use.
 *
 * Each version has 604 page fonts plus a single BSML (bismillah) font.
 * Files are large (V1 ~80KB, V2 ~190KB each); we only load the ones
 * needed for the ayahs currently rendered.  Calls are idempotent —
 * the same family is never injected twice.
 *
 * The font-family name is also the lookup key.  We pick a stable
 * pattern to keep CSS predictable:
 *     V1 page  N  → `QCF1_P{NNN}`         → /qcf1/fonts-woff2/QCF_P{NNN}.woff2
 *     V1 BSML     → `QCF1_BSML`           → /qcf1/fonts-woff2/QCF_BSML.woff2
 *     V2 page  N  → `QCF2_{NNN}`          → /qcf2/fonts-woff2/QCF2{NNN}.woff2
 *     V2 BSML     → `QCF2_BSML`           → /qcf2/fonts-woff2/QCF2BSML.woff2
 *
 * The QCF1_/QCF2_ prefix keeps these families distinct from the V4
 * `QCF4_Hafs_NN` families managed by useQcfFont — same PUA codepoint
 * ranges, different glyphs.
 */

function buildInitialSet(): Set<string> {
  const set = new Set<string>();
  if (typeof document !== 'undefined') {
    document.head
      .querySelectorAll<HTMLStyleElement>('style[data-arabic-page-font]')
      .forEach(el => {
        const name = el.dataset.arabicPageFont;
        if (name) set.add(name);
      });
  }
  return set;
}
const injected: Set<string> = buildInitialSet();

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Family + URL for V1 page N (1..604) or BSML. */
function v1Info(page: number | 'bsml'): { family: string; url: string } {
  if (page === 'bsml') {
    return { family: 'QCF1_BSML', url: '/qcf1/fonts-woff2/QCF_BSML.woff2' };
  }
  return {
    family: `QCF1_P${pad3(page)}`,
    url: `/qcf1/fonts-woff2/QCF_P${pad3(page)}.woff2`,
  };
}

/** Family + URL for V2 page N (1..604) or BSML. */
function v2Info(page: number | 'bsml'): { family: string; url: string } {
  if (page === 'bsml') {
    return { family: 'QCF2_BSML', url: '/qcf2/fonts-woff2/QCF2BSML.woff2' };
  }
  return {
    family: `QCF2_${pad3(page)}`,
    url: `/qcf2/fonts-woff2/QCF2${pad3(page)}.woff2`,
  };
}

function inject(family: string, url: string): void {
  if (!family || injected.has(family)) return;
  injected.add(family);
  const style = document.createElement('style');
  style.dataset.arabicPageFont = family;
  // font-display: block — same reasoning as useQcfFont: PUA codepoints
  // have no usable fallback glyph, so a brief invisible window is
  // better than tofu while the woff2 streams in.
  style.textContent = [
    `@font-face {`,
    `  font-family: '${family}';`,
    `  src: url('${url}') format('woff2');`,
    `  font-display: block;`,
    `  font-weight: normal;`,
    `  font-style: normal;`,
    `}`,
  ].join('\n');
  document.head.appendChild(style);
}

/** Resolve the family name for a (version, page) pair without injecting. */
export function arabicPageFamily(version: 'v1' | 'v2', page: number | 'bsml'): string {
  return version === 'v1' ? v1Info(page).family : v2Info(page).family;
}

/** Inject the @font-face for V1 page N, return its family name. */
export function injectV1PageFont(page: number | 'bsml'): string {
  const { family, url } = v1Info(page);
  inject(family, url);
  return family;
}

/** Inject the @font-face for V2 page N, return its family name. */
export function injectV2PageFont(page: number | 'bsml'): string {
  const { family, url } = v2Info(page);
  inject(family, url);
  return family;
}

/** Hook variant for components that render a single page. */
export function useArabicPageFont(version: 'v1' | 'v2', page: number | 'bsml' | null): string | null {
  if (page === null) return null;
  return version === 'v1' ? injectV1PageFont(page) : injectV2PageFont(page);
}
