/**
 * ArabicAyahRouter — picks the right Arabic renderer for a single ayah
 * based on the user's arabicFont preference.
 *
 * Three modes:
 *   - qcf-v4 (default)  → QcfAyahLine, the existing PUA-page renderer
 *   - qcf-v1 (Madani)   → V1AyahLine, classic Saudi mushaf 1405
 *   - uthmani           → TextAyahLine with KFGQPC Uthmanic Hafs v22
 *
 * Earlier QCF V2, V4-Tajweed, QPC Hafs and IndoPak modes were dropped
 * — they duplicated the visual look of V1 / V4 / Uthmani Unicode for
 * the average reader and the picker felt crowded.  Files for those
 * modes (V2AyahLine.tsx, public/qcf2/, public/qcf-text-fonts/UthmanicHafs1)
 * are kept in the repo so they can be re-enabled without re-downloads.
 *
 * Default behaviour: until arabic-editions.json finishes streaming in,
 * non-QCF-V4 modes silently fall back to the V4 mushaf glyphs we
 * already have in `entry.words` — keeps the page coherent rather than
 * showing a blank Arabic row.
 *
 * Font size offset: each non-V4 mode declares a fontPxOffset in
 * ARABIC_FONTS (+7 currently) so it visually matches the default
 * mushaf scale despite the alternative faces' smaller intrinsic
 * metrics.
 */

import { QcfAyahLine } from './QcfAyahLine';
import { V1AyahLine } from './V1AyahLine';
import { TextAyahLine } from './TextAyahLine';
import { TajweedAyah } from './TajweedAyah';
import { useEdition } from '../hooks/useArabicEditions';
import { arabicFontConfig, type ArabicFontId } from '../lib/typography';
// Lazy: tajweed glyphs (~3 MB) грузятся динамически только когда
// пользователь реально выбрал Tajweed-шрифт.  useTajweedAyah вернёт
// null пока модуль грузится — рендерим V4-fallback это время.
import { useTajweedAyah } from '../content/quran-tajweed-lazy';
import type { QcfWord, QcfFontRef } from '../lib/qcf4';

type Props = {
  verseKey: string;
  ayahNumber: number;
  /** QCF V4 word data (default rendering path) */
  words: QcfWord[];
  /** Подмножества шрифтов для слов аята — пары «шрифт + страница» */
  fonts: QcfFontRef[];
  arabicFont: ArabicFontId;
  activeWordPos: number | null;
  isActive: boolean;
  scale: number;
  /** Просить шрифт сразу — для аятов, которые точно на первом экране. */
  eager?: boolean;
};

export function ArabicAyahRouter({
  verseKey,
  ayahNumber,
  words,
  fonts,
  arabicFont,
  activeWordPos,
  isActive,
  scale,
  eager,
}: Props) {
  const cfg = arabicFontConfig(arabicFont);
  // QCF V4 (по умолчанию) и таджвид рисуются своими данными — датасет
  // альтернативных начертаний им не нужен, а весит он 3.9 МБ.
  const needsEditions = cfg.kind !== 'qcf-v4' && cfg.kind !== 'tajweed';
  const ed = useEdition(verseKey, needsEditions);
  const pxOffset = cfg.fontPxOffset ?? 0;
  // Tajweed data — lazy-loaded async; null пока грузится / нет данных.
  const tajweedData = useTajweedAyah(verseKey, cfg.kind === 'tajweed');

  // V4 mushaf default — already in `words` from the QCF feed.
  if (cfg.kind === 'qcf-v4') {
    return (
      <QcfAyahLine
        words={words}
        fonts={fonts}
        activeWordPos={activeWordPos}
        isActive={isActive}
        scale={scale}
        eager={eager}
      />
    );
  }

  // QPC v4 Tajweed — coloured-glyph mushaf.  Data lives in the
  // auto-generated TAJWEED_GLYPHS table (one entry per verse_key,
  // 6236 total).  Lazy-load: useTajweedAyah вернёт null пока модуль
  // ещё грузится (одноразовая загрузка на первый рендер tajweed-режима)
  // — в это время рендерим обычный V4-fallback (визуально неотличим
  // для первых ~100 мс).  Та же fallback-логика для случая, когда
  // данных нет вообще (fresh repo перед запуском
  // scripts/fetch-tajweed-data.ts).
  if (cfg.kind === 'tajweed') {
    if (tajweedData) {
      return (
        <TajweedAyah
          data={tajweedData}
          isActive={isActive}
          activeWordPos={activeWordPos}
          scale={scale}
        />
      );
    }
    return (
      <QcfAyahLine
        words={words}
        fonts={fonts}
        activeWordPos={activeWordPos}
        isActive={isActive}
        scale={scale}
        eager={eager}
      />
    );
  }

  // Alternative modes need the lazy-loaded editions dataset.  Until it
  // resolves, render with default V4 so the surah doesn't look empty.
  if (!ed) {
    return (
      <QcfAyahLine
        words={words}
        fonts={fonts}
        activeWordPos={activeWordPos}
        isActive={isActive}
        scale={scale}
        eager={eager}
      />
    );
  }

  if (cfg.kind === 'qcf-v1') {
    return (
      <V1AyahLine
        codes={ed.v1Codes}
        page={ed.v1Page}
        isActive={isActive}
        scale={scale}
        fontPxOffset={pxOffset}
      />
    );
  }

  // kind === 'text' — Unicode rendering with Uthmani orthography.
  //
  // Per-step adjustment: at the smallest two size steps (scale 0.85
  // and 1.0) the Uthmani text face reads visibly oversized compared
  // to the mushaf renderers, so we shave 7 px off the per-mode
  // fontPxOffset on those steps only.  At larger steps (1.2, 1.4)
  // the +7 bump that brings Uthmani up to the mushaf optical scale
  // stays unchanged.
  const arabicText = ed.uthmani;
  const uthmaniSmallStepBump = scale <= 1.0 ? -7 : 0;
  return (
    <TextAyahLine
      arabic={arabicText}
      ayahNumber={ayahNumber}
      fontStack={cfg.textStack ?? cfg.stack}
      letterSpacing={cfg.textLetterSpacing}
      activeWordPos={activeWordPos}
      isActive={isActive}
      scale={scale}
      fontPxOffset={pxOffset + uthmaniSmallStepBump}
      endMarkerVariant={cfg.endMarkerVariant}
      endMarkerScale={cfg.endMarkerScale}
    />
  );
}
