/**
 * Tajweed palette controller.
 *
 * Injects (and keeps in sync) a `<style id="tajweed-palette">` block in
 * <head> that defines `@font-palette-values --asr-tajweed` only for the
 * page-scoped families actually requested in this session.  Generating all
 * 604 blocks on every theme change used to make WKWebView parse a large CSS
 * sheet even when the reader had opened only one page.
 *
 * Base palette is chosen from the theme on the documentElement:
 *   - light themes → `base-palette: 0` — the official light palette;
 *   - dark themes → `base-palette: 1` — the official dark palette.
 *
 * Override-colors (project + user rule disables) are emitted on top of
 * the base palette.  The neutral fill used for a disabled rule depends
 * on the active mode — white on dark, black on light — so a hidden
 * stroke merges into the base calligraphy in either case.
 *
 * iOS Safari note: keep the Quran Foundation binaries intact. Although the
 * CDN path contains `colrv1`, the current files use COLR v0 + CPAL. WebKit
 * renders their colour layers correctly. Converting them to COLR v1 made the
 * same glyphs fall back to monochrome on the tested WKWebView; adding SVG made
 * the colours visible but its base ink could not follow the app theme.
 */

// Sync-импорт только meta (~5 строк констант) — большой словарь
// TAJWEED_GLYPHS lazy-import'ится из ArabicAyahRouter/TajweedAyah.
import { isLightTheme, type Theme } from '../hooks/useTheme';

export const PALETTE_NAME = '--asr-tajweed';
const STYLE_ID = 'tajweed-palette';
const registeredFamilies = new Set<string>();

/** Per-rule on/off state.  Keys are palette indices 0..15. */
export type RuleOverrides = Record<number, boolean>;

const STORE_KEY = 'tajweedRuleOverridesV2';

/** Project-level defaults — first-run users get these rules disabled.
 *  7 (#5d6cff dark-blue mudd) and 8 (#5fc3ff light-blue mudd) are too
 *  loud on a dark background and visually dominate the calligraphy;
 *  hiding them by default keeps the page restful while leaving the
 *  rest of the rule set intact (red gunna, green nasalization,
 *  orange natural mudd, etc.).  Users can re-enable individually
 *  through setRuleEnabled() once a settings UI lands. */
const DEFAULT_DISABLED_RULES: ReadonlyArray<number> = [];

function readOverrides(): RuleOverrides {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) {
      // First-run — seed from project defaults.  Once the user toggles
      // any rule, writeOverrides() persists their explicit state and
      // we never fall back to defaults again (so a user who deliberately
      // re-enabled idx 8 doesn't get it disabled on the next session).
      const out: RuleOverrides = {};
      for (const i of DEFAULT_DISABLED_RULES) out[i] = false;
      return out;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: RuleOverrides = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 0 && n <= 15 && typeof v === 'boolean') {
        out[n] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeOverrides(o: RuleOverrides) {
  localStorage.setItem(STORE_KEY, JSON.stringify(o));
}

// ── pub/sub for rerendering subscribers (TajweedAyah) ───────────────────────
const listeners = new Set<() => void>();
export function subscribeTajweedPalette(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function notify() {
  listeners.forEach(cb => { try { cb(); } catch { /* ignore subscriber errors */ } });
}

// ── public API ───────────────────────────────────────────────────────────────
export function getRuleEnabled(index: number): boolean {
  const o = readOverrides();
  return o[index] !== false;  // default ON
}

export function setRuleEnabled(index: number, enabled: boolean) {
  const o = readOverrides();
  if (enabled) delete o[index]; else o[index] = false;
  writeOverrides(o);
  applyPaletteToDocument();
  notify();
}

// ── theme detection ──────────────────────────────────────────────────────────
type Mode = 'light' | 'dark';

/** Read the active theme off documentElement and reduce it to light vs.
 *  not-light — тёмная и «Аврора 2» берут тёмную палитру глифов.
 *  Список светлых тем не дублируем: единственный его владелец —
 *  isLightTheme() в hooks/useTheme.ts. */
function detectMode(): Mode {
  if (typeof document === 'undefined') return 'dark';
  const theme = document.documentElement?.getAttribute('data-theme') ?? '';
  return isLightTheme(theme as Theme) ? 'light' : 'dark';
}

// ── CSS generation ───────────────────────────────────────────────────────────
/** Official slot numbers in the QPC v4 Tajweed CPAL table. */
const BASE_PALETTE_BY_MODE: Record<Mode, number> = { dark: 1, light: 0 };

/** Colour we use to override a disabled rule — must merge into the base
 *  calligraphy on the active mode. Chrome rejects `currentColor` in
 *  `override-colors` (the whole @font-palette-values block is dropped
 *  silently if any entry is invalid, which made the font render as a
 *  plain outline in testing).  Hard-coded matches palette[base][0] for
 *  each mode so the override is visually equivalent to "off". */
const NEUTRAL_COLOR_BY_MODE: Record<Mode, string> = { dark: '#ffffff', light: '#000000' };

/** Mode-specific structural overrides — applied alongside user rule
 *  toggles. On light themes palette[0][12] is a pale marker fill, which
 *  the font uses as the inner disc of the ayah end-marker rosette. That
 *  can read as an awkward blob against warm-grey / cream / beige
 *  page backgrounds (only `light-white`'s pure-white canvas would hide
 *  it). Forcing it to `transparent` lets the page background show
 *  through, so the rosette becomes a clean outline+digit cartouche on
 *  every light palette. On dark themes the official palette 1 keeps its
 *  deliberate light cartouche highlight, so we leave it alone. */
const STRUCTURAL_OVERRIDES_BY_MODE: Record<Mode, ReadonlyArray<[number, string]>> = {
  dark:  [],
  light: [[12, 'transparent']],
};

function buildOverrideColors(overrides: RuleOverrides, mode: Mode): string {
  const neutral = NEUTRAL_COLOR_BY_MODE[mode];
  const entries: Array<[number, string]> = [];
  // User-toggleable rule disables → neutral colour
  for (const [k, on] of Object.entries(overrides)) {
    const idx = Number(k);
    if (on === false && Number.isInteger(idx) && idx > 0 && idx <= 15) {
      entries.push([idx, neutral]);
    }
  }
  // Structural mode-specific overrides (transparent marker disc on light)
  for (const [idx, color] of STRUCTURAL_OVERRIDES_BY_MODE[mode]) {
    // If the same idx already has a user override, keep the user's
    // intent rather than overwriting (extremely unlikely — structural
    // indices like 12 aren't surfaced as rule toggles).
    if (!entries.some(([i]) => i === idx)) entries.push([idx, color]);
  }
  if (entries.length === 0) return '';
  return `override-colors: ${entries.map(([idx, c]) => `${idx} ${c}`).join(', ')};`;
}

function buildPaletteCss(overrides: RuleOverrides, mode: Mode): string {
  const overrideLine = buildOverrideColors(overrides, mode);
  const basePalette = BASE_PALETTE_BY_MODE[mode];
  // `font-palette` is matched to the active family.  Only loaded page fonts
  // need a block; keeping the set small avoids reparsing 604 rules on iOS.
  return Array.from(registeredFamilies).sort().map(fam => (
    `@font-palette-values ${PALETTE_NAME} { font-family: '${fam}'; base-palette: ${basePalette};${overrideLine ? ' ' + overrideLine : ''} }`
  )).join('\n');
}

/** Register a page family before its @font-face starts loading. */
export function registerTajweedPaletteFamily(family: string): void {
  if (registeredFamilies.has(family)) return;
  registeredFamilies.add(family);
  applyPaletteToDocument();
}

export function applyPaletteToDocument() {
  if (typeof document === 'undefined') return;
  const overrides = readOverrides();
  const mode = detectMode();
  const css = buildPaletteCss(overrides, mode);
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  if (tag.textContent !== css) tag.textContent = css;
}
