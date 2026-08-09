/**
 * Tajweed palette controller.
 *
 * Injects (and keeps in sync) a `<style id="tajweed-palette">` block in
 * <head> that defines `@font-palette-values --asr-tajweed` for every
 * one of the 604 QPC v4 page-scoped font families.
 *
 * Base palette is chosen from the theme on the documentElement:
 *   - light themes → `base-palette: 2` — KFC's original light palette,
 *     baked into the font alongside several variants.  Base calligraphy
 *     (idx 0) is `#000000`, the rule colours are dialled down so they
 *     read as accents on a paper-tone background.
 *   - dark / cosmic themes → `base-palette: 0` — our dark-tuned palette
 *     (originally palette[1] in the source files; promoted to slot 0 by
 *     scripts/patch-tajweed-default-palette.py so even browsers that
 *     don't honour @font-palette-values still get readable colours).
 *
 * Override-colors (project + user rule disables) are emitted on top of
 * the base palette.  The neutral fill used for a disabled rule depends
 * on the active mode — white on dark, black on light — so a hidden
 * stroke merges into the base calligraphy in either case.
 *
 * iOS Safari note: on iOS Safari the SVG-in-OpenType table is
 * preferred and its colours are BAKED into palette[0].  @font-palette-values
 * (base-palette switch + override-colors) only takes effect on the COLR
 * render path (Chrome / Firefox desktop).  On iOS Safari the light theme
 * therefore still renders palette[0] — readable, but not adapted; a
 * follow-up `scripts/` pass would be needed to re-bake the SVG with
 * palette[2] colours for full iOS coverage.
 */

// Sync-импорт только meta (~5 строк констант) — большой словарь
// TAJWEED_GLYPHS lazy-import'ится из ArabicAyahRouter/TajweedAyah.
import { ALL_TAJWEED_FONT_FAMILIES } from '../content/quran-tajweed-meta';
import { isLightTheme, type Theme } from '../hooks/useTheme';

export const PALETTE_NAME = '--asr-tajweed';
const STYLE_ID = 'tajweed-palette';

/** Per-rule on/off state.  Keys are palette indices 0..15. */
export type RuleOverrides = Record<number, boolean>;

const STORE_KEY = 'tajweedRuleOverrides';

/** Project-level defaults — first-run users get these rules disabled.
 *  7 (#5d6cff dark-blue mudd) and 8 (#5fc3ff light-blue mudd) are too
 *  loud on a dark background and visually dominate the calligraphy;
 *  hiding them by default keeps the page restful while leaving the
 *  rest of the rule set intact (red gunna, green nasalization,
 *  orange natural mudd, etc.).  Users can re-enable individually
 *  through setRuleEnabled() once a settings UI lands. */
const DEFAULT_DISABLED_RULES: ReadonlyArray<number> = [7, 8];

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
 *  not-light — тёмная и «Аврора» обе берут тёмную палитру глифов.
 *  Список светлых тем не дублируем: единственный его владелец —
 *  isLightTheme() в hooks/useTheme.ts. */
function detectMode(): Mode {
  if (typeof document === 'undefined') return 'dark';
  const theme = document.documentElement.getAttribute('data-theme') ?? '';
  return isLightTheme(theme as Theme) ? 'light' : 'dark';
}

// ── CSS generation ───────────────────────────────────────────────────────────
/** Slot numbers in the QPC v4 Tajweed CPAL table:
 *    0 — our dark-tuned palette (promoted from palette[1] by the patch
 *        script; original light palette is preserved in slot 2).
 *    2 — KFC's original light palette, untouched.                       */
const BASE_PALETTE_BY_MODE: Record<Mode, number> = { dark: 0, light: 2 };

/** Colour we use to override a disabled rule — must merge into the base
 *  calligraphy on the active mode.  Chrome rejects `currentColor` in
 *  `override-colors` (the whole @font-palette-values block is dropped
 *  silently if any entry is invalid, which made the font render as a
 *  plain outline in testing).  Hard-coded matches palette[base][0] for
 *  each mode so the override is visually equivalent to "off". */
const NEUTRAL_COLOR_BY_MODE: Record<Mode, string> = { dark: '#ffffff', light: '#000000' };

/** Mode-specific structural overrides — applied alongside user rule
 *  toggles.  On light themes palette[2][12] is `#ffffff`, which the
 *  font uses as the inner disc of the ayah end-marker rosette.  That
 *  reads as an awkward white blob against warm-grey / cream / aurora
 *  page backgrounds (only `light-white`'s pure-white canvas would hide
 *  it).  Forcing it to `transparent` lets the page background show
 *  through, so the rosette becomes a clean outline+digit cartouche on
 *  every light palette.  On dark themes palette[0][12] was patched to
 *  white too, but white-on-dark reads as a deliberate cartouche
 *  highlight (matches the printed mushaf), so we leave it alone. */
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
  // One `@font-palette-values` block per font family — `font-palette`
  // is matched to the active `font-family` at use site, so we need
  // one block for each of the 604 page-scoped families.
  return ALL_TAJWEED_FONT_FAMILIES.map(fam => (
    `@font-palette-values ${PALETTE_NAME} { font-family: '${fam}'; base-palette: ${basePalette};${overrideLine ? ' ' + overrideLine : ''} }`
  )).join('\n');
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
