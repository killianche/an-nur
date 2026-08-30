/**
 * TajweedAyah — renders a single ayah using the QPC v4 Tajweed
 * coloured-glyph mushaf.  Each word is a single PUA codepoint
 * (U+FC00..FFFF) painted by a page-scoped font (one of 604
 * `QPC4Tajweed-{NNN}` families). Colours come from the font's COLR/CPAL
 * tables; CSS only selects the palette appropriate to the active theme.
 *
 * Structure mirrors QcfAyahLine — same bidi-isolation strategy,
 * same chunking rule (last word + end-marker share a nowrap chunk),
 * same layer-2 glow overlay for the active ayah.  Two differences:
 *   1. `data-active-word` is NOT set on word spans.  The existing
 *      `[data-active-word]` CSS uses `text-shadow` for highlight,
 *      which on coloured COLR/SVG glyphs renders one shadow per
 *      colour layer ("ghost outline" effect).  Word-level highlight
 *      is handled through the layer-2 dome only.
 *   2. font-palette: --asr-tajweed routes through the rule overrides
 *      built by lib/tajweedPalette.ts. Safari/WKWebView uses this same
 *      native colour-font path; no SVG renderer is involved.
 *
 * Falls back silently to QcfAyahLine when the verseKey is missing
 * from TAJWEED_GLYPHS (e.g. before the auto-generated data file is
 * regenerated) — caller must handle the null return.
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import { useAyahGlow } from '../hooks/useAyahGlow';
import { AyahGlowLayer } from './AyahGlowLayer';
// Sync-импорты только тонкой meta — fontFamilyForPage + TajweedWord
// type (~5 строк констант).  Сами 6240-аятные глифы получаем prop'ом
// `data` сверху из ArabicAyahRouter, который lazy-загружает модуль
// через useTajweedAyah hook.
import {
  fontFamilyForPage,
  type TajweedAyahData,
  type TajweedWord,
} from '../content/quran-tajweed-meta';
import { PALETTE_NAME, subscribeTajweedPalette } from '../lib/tajweedPalette';
import { tajweedVisualWordPosition } from '../lib/tajweedAudioPosition';

type Props = {
  /** Готовые данные аята (lazy-загружены родителем из
   *  quran-tajweed-glyphs).  null = модуль ещё грузится / нет данных
   *  для этого verseKey — компонент рендерит null (родитель показывает
   *  fallback). */
  data: TajweedAyahData | null;
  /** Whether the WHOLE ayah is the active one (controls glow dome) */
  isActive?: boolean;
  /** 1-based word position currently being recited, or null */
  activeWordPos?: number | null;
  /** Scale multiplier from typography settings (default 1.0) */
  scale?: number;
  /** Optional tap handler for the ayah (play / focus) */
  onTap?: () => void;
};

/** px size at scale=1.0.  Matches QcfAyahLine — V4 Tajweed glyphs
 *  share the same metric body height as QCF V4 because they are
 *  drawn on the same Madinah Mushaf grid. */
const BASE_FONT_PX = 47;

/** Group the ayah's words into chunks for line-wrap control: the
 *  LAST WORD + end-marker live in a shared `nowrap` chunk so the
 *  ornate "﴿N﴾" glyph cannot orphan onto its own line. */
function chunkWordsWithEnd(words: TajweedWord[], endMarker: string): Array<{
  words: TajweedWord[];
  endMarker?: string;
}> {
  if (words.length === 0) {
    return endMarker ? [{ words: [], endMarker }] : [];
  }
  const chunks: Array<{ words: TajweedWord[]; endMarker?: string }> = [];
  for (let i = 0; i < words.length - 1; i++) {
    chunks.push({ words: [words[i]] });
  }
  chunks.push({ words: [words[words.length - 1]], endMarker: endMarker || undefined });
  return chunks;
}

export function TajweedAyah({
  data,
  isActive = false,
  activeWordPos = null,
  scale = 1.0,
  onTap,
}: Props) {
  // Re-render on palette change so override-colors take effect
  // immediately (no surah-reload required when a user toggles a rule).
  const [, force] = useState(0);
  useEffect(() => subscribeTajweedPalette(() => force(n => n + 1)), []);

  if (!data) return null;
  const fontFamily = fontFamilyForPage(data.page);
  if (!fontFamily) return null;

  const fontSize = BASE_FONT_PX * scale;
  const chunks = chunkWordsWithEnd(data.words, data.endMarker);
  const verseKey = `${data.surah}:${data.ayah}`;
  const visualWordPos = tajweedVisualWordPosition(verseKey, activeWordPos);

  // Refs for the layer-2 glow dome.  We register ONE ref per logical
  // word position so useAyahGlow can map activeWordPos → bbox.  The
  // end-marker has no `position` in the timeline and shares the
  // previous word's slot from a measurement standpoint.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  if (wordRefs.current.length !== data.words.length) {
    wordRefs.current = new Array(data.words.length).fill(null);
  }
  const activeBox = useAyahGlow({
    containerRef,
    wordRefs,
    activeWordPos: visualWordPos,
    isActive,
    wordCount: data.words.length,
    fontSize,
  });

  return (
    <div
      ref={containerRef}
      className="tajweed-theme-ink"
      onClick={onTap}
      dir="rtl"
      style={{
        position: 'relative',
        direction: 'rtl',
        textAlign: 'right',
        lineHeight: 1.85,
        fontSize: `${fontSize}px`,
        fontFamily: `'${fontFamily}', serif`,
        // CSS `font-palette` picks the @font-palette-values block built
        // by lib/tajweedPalette.ts. Browsers without support fall back to
        // palette[0], which is patched to the readable dark palette.
        fontPalette: PALETTE_NAME,
        color: 'var(--text-primary)',
        userSelect: 'none',
        cursor: onTap ? 'pointer' : 'default',
        padding: '4px 2px',
      }}
    >
      <AyahGlowLayer box={activeBox} />

      {chunks.map((chunk, idx) => (
        <Fragment key={idx}>
          <span
            style={{
              unicodeBidi: 'isolate',
              whiteSpace: 'nowrap',
              position: 'relative',
              zIndex: 1,
            }}
            dir="rtl"
          >
            {chunk.words.map((w, wi) => {
              // Index in the parent wordRefs array (1-based positions
              // map to 0-based array indices).
              const globalIdx = idx + wi;
              return (
                <span
                  key={wi}
                  ref={el => { wordRefs.current[globalIdx] = el; }}
                  data-verse-key={verseKey}
                  data-position={globalIdx + 1}
                  dir="rtl"
                  // Deliberately no data-active-word — see header comment.
                  style={{
                    unicodeBidi: 'isolate',
                    color: 'var(--text-primary)',
                  }}
                >
                  {w.code}
                </span>
              );
            })}
            {chunk.endMarker && (
              <span
                dir="rtl"
                style={{
                  unicodeBidi: 'isolate',
                  color: 'var(--text-primary)',
                }}
              >
                {chunk.endMarker}
              </span>
            )}
          </span>
          {idx < chunks.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </div>
  );
}
