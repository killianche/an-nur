/**
 * TextAyahLine — renders an ayah using verbatim Unicode arabic text
 * with a regular web-font (KFGQPC Uthmanic Hafs v22 — the only
 * Unicode-text mode the picker exposes after the IndoPak / Me Quran
 * removals).  Used when the reader picks the Уthmani alternative in
 * Typography settings instead of the page-glyph mushaf families.
 *
 * Why a single dedicated component (rather than inlining in QcfAyahLine):
 *   • Renders Unicode text right-to-left with the Uthmani-spelling
 *     KFGQPC Hafs face — fundamentally different from PUA-page glyph
 *     pipelines (V1 / V4) and warrants its own measurement / layout.
 *   • The end-of-ayah ornament is the canonical U+06DD ARABIC END OF
 *     AYAH.  KFGQPC Hafs draws it as the bare rosette ornament that
 *     matches the Saudi mushaf typography.
 *   • Karaoke highlight is best-effort: we split text by whitespace
 *     and tag each word with data-position.  The split aligns with
 *     the audio segments for the vast majority of ayahs; small drift
 *     is acceptable in an alternative display mode.
 */

import { Fragment, useRef } from 'react';
import { useAyahGlow } from '../hooks/useAyahGlow';
import { AyahGlowLayer } from './AyahGlowLayer';

const BASE_FONT_PX = 38;

/** End-of-ayah marker — bare rosette only, no digit.
 *
 *  Both rendering modes emit just U+06DD ARABIC END OF AYAH and rely
 *  on the line font's default glyph (the empty rosette).  The 'native'
 *  vs 'overlay' distinction used to matter when we also painted the
 *  ayah number inside the rosette; with the digit removed, both
 *  modes collapse to "draw the bare ornament".  The signature is kept
 *  so fonts with quirky U+06DD ligatures can still be forced to render
 *  only the rosette via the overlay mode.
 *
 *  `scale` shrinks the rosette for fonts with an oversized U+06DD. */
// The EndOfAyahGlyph component (U+06DD ۝ ornament) was removed at
// user request — the action-row pill below each ayah already shows
// "{surah}:{ayah}", so the inline rosette was redundant and read as
// visual noise at large reading sizes.  endMarkerVariant /
// endMarkerScale on the Props below are kept for API stability
// (ArabicAyahRouter still passes them) but currently have no effect.
//
// To re-enable, re-introduce a glyph element where the trailing
// `if (isLast)` branch builds its span — the rosette only ever sat
// inside the last-word chunk.

type Props = {
  /** Verbatim Arabic text in Uthmani spelling */
  arabic: string;
  /** Ayah number for the end-of-ayah ornament */
  ayahNumber: number;
  /** Font-family stack (e.g. "'KFGQPC Uthmanic Hafs', serif") */
  fontStack: string;
  /** Optional letter-spacing tweak per face (e.g. for Naskh) */
  letterSpacing?: string;
  /** 1-based word position currently being recited, or null */
  activeWordPos?: number | null;
  /** Whether this ayah is the active one */
  isActive?: boolean;
  /** px size at scale=1.0 */
  scale?: number;
  /** Extra px added on top of BASE_FONT_PX (after scale).  Unicode
   *  Naskh faces (Uthmani Hafs / PDMS Saleem) read smaller than QCF V4
   *  at the same nominal size, so we bump +7 from ARABIC_FONTS so
   *  switching font doesn't suddenly shrink the page. */
  fontPxOffset?: number;
  /** How the end-of-ayah marker is composed (see EndOfAyahGlyph). */
  endMarkerVariant?: 'native' | 'overlay';
  /** Optional shrink for the rosette glyph (1 = font default). */
  endMarkerScale?: number;
  onTap?: () => void;
};

export function TextAyahLine({
  arabic,
  // ayahNumber, endMarkerVariant, endMarkerScale — retained on Props
  // for API stability with ArabicAyahRouter / typography.ts configs,
  // but currently unused because the end-of-ayah ۝ ornament was
  // removed from the renderer (the action-row pill below each ayah
  // already shows "{surah}:{ayah}").
  fontStack,
  letterSpacing,
  activeWordPos = null,
  isActive = false,
  scale = 1.0,
  fontPxOffset = 0,
  onTap,
}: Props) {
  const fontSize = BASE_FONT_PX * scale + fontPxOffset;
  const tokens = arabic.split(/\s+/).filter(Boolean);
  const lastIdx = tokens.length - 1;

  // Layer-2 glow plumbing — same pattern as QcfAyahLine / V2AyahLine.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  if (wordRefs.current.length !== tokens.length) {
    wordRefs.current = new Array(tokens.length).fill(null);
  }
  const activeBox = useAyahGlow({
    containerRef,
    wordRefs,
    activeWordPos,
    isActive,
    wordCount: tokens.length,
    fontSize,
  });

  return (
    <div
      ref={containerRef}
      onClick={onTap}
      dir="rtl"
      data-active-ayah={isActive ? 'true' : undefined}
      style={{
        // Layer-2 dome lives inside this element as position:absolute.
        position: 'relative',
        direction: 'rtl',
        textAlign: 'right',
        fontFamily: fontStack,
        fontSize: `${fontSize}px`,
        lineHeight: 1.95,
        // `body` sets `letter-spacing: 0.005em` for Latin readability;
        // inheriting it here breaks Arabic mark-positioning — even a
        // ~0.3px nudge at reading sizes detaches dagger-alif (U+0670),
        // shadda and similar combining marks from their base glyphs,
        // producing the "small alif sitting on a circle to the side"
        // bug the user reported.  Explicit `normal` opts back into
        // GPOS-driven positioning.  If a font config sets its own
        // textLetterSpacing we honour it; otherwise we force normal.
        letterSpacing: letterSpacing ?? 'normal',
        userSelect: 'none',
        cursor: onTap ? 'pointer' : 'default',
        padding: '4px 2px',
        color: 'var(--qcf-text, var(--text-primary))',
      }}
    >
      <AyahGlowLayer box={activeBox} />

      {tokens.map((tok, i) => {
        const pos = i + 1;
        const active = isActive && pos === activeWordPos;
        const isLast = i === lastIdx;
        // Inline color-fallback removed: the unused --ayah-word-color
        // var never resolved, so the active branch silently fell back
        // to 'inherit'. Color recolour now lives entirely in the CSS
        // rule gated on data-highlight-style="color"; removing the
        // inline override stops it fighting glow-mode.
        const span = (
          <span
            ref={el => { wordRefs.current[i] = el; }}
            data-position={pos}
            data-active-word={active ? 'true' : undefined}
            style={{
              // position:relative + z-index lifts text above Layer 2.
              position: 'relative',
              zIndex: 1,
              color: 'inherit',
              transition: 'color 0.15s',
            }}
          >
            {tok}
          </span>
        );
        if (isLast) {
          // End-of-ayah ornament (U+06DD ۝) intentionally omitted.
          // The action row below each ayah already shows "{surah}:{ayah}"
          // as a pill, so the inline rosette was redundant and visually
          // heavy at large reading sizes.  endMarkerVariant /
          // endMarkerScale props are retained for API stability but
          // currently have no effect on the text renderer.
          return (
            <Fragment key={i}>
              {span}
            </Fragment>
          );
        }
        return (
          <Fragment key={i}>
            {span}
            {' '}
          </Fragment>
        );
      })}
    </div>
  );
}
