/**
 * useQcfFont — lazily injects @font-face rules for QCF V4 fonts.
 *
 * Fonts are large (~700KB per file, 36MB total), so we only load the font
 * for the page currently being displayed.  Calling this hook (or injectQcfFont
 * directly) is idempotent — the same font is never injected twice.
 *
 * Font injection happens in the render phase (hook body), not useEffect.
 * This ensures the browser starts loading the font BEFORE the first paint of
 * the page, avoiding the "invisible text" FOIT that would happen if we waited
 * for a subsequent frame.  font-display: optional means no layout shift if the
 * font hasn't loaded in time.
 */

import { qcfFontFileName } from '../lib/qcf4';

/**
 * Tracks which fonts have already been injected into the document head.
 * Initialised by scanning existing <style data-qcf-font> elements so that
 * HMR module reloads don't re-inject fonts that are already in the DOM.
 */
function buildInitialSet(): Set<string> {
  const set = new Set<string>();
  if (typeof document !== 'undefined') {
    document.head
      .querySelectorAll<HTMLStyleElement>('style[data-qcf-font]')
      .forEach(el => {
        const name = el.dataset.qcfFont;
        if (name) set.add(name);
      });
  }
  return set;
}
const injectedFonts: Set<string> = buildInitialSet();

/**
 * Inject a single @font-face rule for a QCF V4 font.
 * Safe to call multiple times for the same font — deduplicated via Set.
 */
export function injectQcfFont(fontName: string): void {
  if (!fontName || injectedFonts.has(fontName)) return;
  injectedFonts.add(fontName);

  const style = document.createElement('style');
  style.dataset.qcfFont = fontName;
  // font-display: block — shows invisible text (~3 s window) then swaps
  // to the QCF glyph once loaded. For PUA chars there is no valid fallback
  // glyph, so "block" (blank then correct) is better than "swap" (tofu then
  // correct) or "optional" (tofu forever on first load).
  style.textContent = [
    `@font-face {`,
    `  font-family: '${fontName}';`,
    `  src: url('/qcf4/fonts-woff2/${qcfFontFileName(fontName)}') format('woff2');`,
    `  font-display: block;`,
    `  font-weight: normal;`,
    `  font-style: normal;`,
    `}`,
  ].join('\n');
  document.head.appendChild(style);
}

/**
 * React hook that injects @font-face rules for the given font names.
 * Call with the list of fonts needed for the current page.
 * Runs synchronously in the render phase.
 */
export function useQcfFont(fontNames: string[]): void {
  for (const name of fontNames) {
    injectQcfFont(name);
  }
}
