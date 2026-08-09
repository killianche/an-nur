/**
 * Arabic font catalog for the Azkar screens.
 *
 * The Azkar source text is plain Unicode (NOT QCF PUA glyphs), so the
 * font needs full mark-attachment coverage for harakat (fatha/kasra/
 * damma/sukun + shadda combinations) and the small set of punctuation
 * the source data ships with (Arabic comma, end-of-ayah glyph, …).
 *
 * KFGQPC Uthmanic Hafs v22 looked right but lacked some ligatures, so
 * the user saw U+25CC dotted-circle placeholders around the comma and
 * a few shadda+harakat pairs.  All four faces below shape the same
 * data cleanly; the user picks the best one via the cycle button in
 * the Azkar floating header.
 *
 * All four faces are OFL-licensed (Open Font License) or KFGQPC public
 * release, safe to redistribute.
 *
 * Чтобы добавить ещё один вариант:
 *   1. положить woff2/ttf в public/ и объявить @font-face в
 *      src/index.css.  Внешние @import с Google Fonts запрещены —
 *      приложение должно работать без сети, см. шапку index.css;
 *   2. дописать запись ниже;
 *   3. пикер в настройках подхватит её сам.
 */

export type AzkarFontId =
  | 'kfgqpc-v22'
  | 'noto-naskh-semibold';

export type AzkarFont = {
  id: AzkarFontId;
  /** Short label shown over the Arabic text when the user cycles. */
  label: string;
  /** CSS font-family stack. */
  stack: string;
  /** Multiplier on the body font-size for visual parity — different
   *  faces have different em-square conventions and rendering at the
   *  same nominal px gives wildly different optical sizes otherwise. */
  sizeMul: number;
  /** Line-height for this face; some faces (Scheherazade) need extra
   *  vertical room for stacked harakat without lines clipping. */
  lineHeight: number;
};

export const AZKAR_FONTS: AzkarFont[] = [
  {
    id: 'kfgqpc-v22',
    label: 'KFGQPC Uthmanic',
    // "Azkar KFGQPC" is a composite font-family defined in index.css
    // via two @font-face declarations + unicode-range: KFGQPC covers
    // every codepoint EXCEPT U+060C (Arabic comma), and Noto Naskh
    // covers just U+060C.  The browser stitches them together so the
    // user gets pure-KFGQPC look with a correctly-drawn comma.
    stack: "'Azkar KFGQPC', 'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif",
    sizeMul: 1.0,
    // Was 2.2 → 1.85 → 1.6 (too tight at 1.6 — adjacent lines almost
    // kissed); settled at 1.75 after a small "увеличь немного" bump.
    lineHeight: 1.75,
  },
  {
    // Google Noto Naskh Arabic SemiBold — slightly heavier than the
    // regular cut, gives translation-paragraph weight on small-screen
    // dark backgrounds.  Bundled at web/public/azkar/fonts/
    // NotoNaskhArabic-SemiBold.ttf.
    id: 'noto-naskh-semibold',
    label: 'Noto Naskh SemiBold',
    // 'Noto Naskh Arabic' (обычный вес) раньше приезжал из Google Fonts
    // как запасной; внешних @import больше нет, поэтому в стеке только
    // локальное семейство и системный serif.
    stack: "'Noto Naskh Arabic SemiBold', serif",
    sizeMul: 0.95,
    lineHeight: 1.75,
  },
];

export const AZKAR_FONT_IDS: AzkarFontId[] = AZKAR_FONTS.map(f => f.id);

export function azkarFontConfig(id: AzkarFontId): AzkarFont {
  return AZKAR_FONTS.find(f => f.id === id) ?? AZKAR_FONTS[0];
}
