/**
 * V1AyahLine — renders a single ayah using QCF V1 (Madani 1405) PUA
 * glyphs from `mushaf-woff2`.  This is the classic Saudi mushaf —
 * what quran.com defaults to.
 *
 * Architecture:
 *   • The V1 source data joins all PUA codes for an ayah into one
 *     string (no word boundaries), unlike V2/V4 which keep words
 *     space-separated.  Because of that, V1 cannot drive word-level
 *     karaoke highlight — we wrap the whole ayah string in a single
 *     span and let the audio module fall back to ayah-level cues.
 *   • The font (`QCF1_P{NNN}` from /qcf1/fonts-woff2/QCF_P{NNN}.woff2)
 *     is injected on demand by useArabicPageFont().
 *   • Bidi: PUA codepoints are strong-LTR; we wrap the ayah in `dir="rtl"`
 *     with `unicode-bidi: isolate` so it lands at the right edge as in
 *     the printed mushaf.
 *
 * End-of-ayah marker: the V1 font already ends each ayah's PUA stream
 * with the ornate "﴿N﴾" glyph baked in, so we add nothing extra.
 */

import { injectV1PageFont } from '../hooks/useArabicPageFont';

const BASE_FONT_PX = 47;

type Props = {
  /** Joined PUA chars for the whole ayah (no spaces) */
  codes: string;
  /** V1 font page (1..604) */
  page: number;
  /** Whether this ayah is the currently active one (audio-driven) */
  isActive?: boolean;
  /** px size at scale=1.0 */
  scale?: number;
  /** Extra px added on top of BASE_FONT_PX (after scale).  V1 metrics
   *  read smaller than V4 at the same nominal size, so we bump +7 from
   *  ARABIC_FONTS to keep the visual rhythm consistent across modes. */
  fontPxOffset?: number;
  onTap?: () => void;
};

export function V1AyahLine({
  codes, page, isActive = false, scale = 1.0, fontPxOffset = 0, onTap,
}: Props) {
  const family = injectV1PageFont(page);
  const fontSize = BASE_FONT_PX * scale + fontPxOffset;
  return (
    <div
      onClick={onTap}
      dir="rtl"
      data-active-ayah={isActive ? 'true' : undefined}
      style={{
        direction: 'rtl',
        textAlign: 'right',
        lineHeight: 1.85,
        fontSize: `${fontSize}px`,
        userSelect: 'none',
        cursor: onTap ? 'pointer' : 'default',
        padding: '4px 2px',
        // PUA codepoints in V1 are joined without separators — browser
        // treats the whole ayah as one unbreakable "word", so we have to
        // let it break at any code point.  Each PUA char in V1 is itself
        // a pre-shaped word glyph, so breaking between codes is safe and
        // mimics natural word-wrap at the mushaf level.
        overflowWrap: 'anywhere',
        wordBreak: 'break-all',
      }}
    >
      {/* The very last PUA code in the V1 stream is the ornate end-of-
          ayah rosette baked by the font.  In QCF V1 that glyph is drawn
          ~1.7× the height of a typical word glyph, which dwarfs the
          surrounding calligraphy on screen.  We split it off and render
          it ~65% to bring it back into line with the body text — same
          visual weight you see in the printed Madani mushaf where the
          marker reads as decoration, not as another word. */}
      <span
        dir="rtl"
        style={{
          fontFamily: `'${family}', serif`,
          color: 'var(--qcf-text, var(--text-primary))',
          unicodeBidi: 'isolate',
          transition: 'color 0.15s',
        }}
      >
        {codes.slice(0, -1)}
        <span style={{ fontSize: '0.65em' }}>{codes.slice(-1)}</span>
      </span>
    </div>
  );
}
