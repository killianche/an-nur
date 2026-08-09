/**
 * QcfMushafPage — renders a single QCF V4 mushaf page.
 *
 * Each word on the page is a PUA glyph (U+F100…) that must be rendered with
 * the specific QCF font it was composed for.  We inject the required
 * @font-face rules synchronously (before the component paints) via
 * useQcfFont, so the browser starts loading the font in the same frame.
 *
 * Line layout:
 *   - direction: rtl, display: flex, justify-content: space-between
 *   - Words are spread across the full line width (classic Mushaf justification)
 *   - Surah header lines are centered
 *
 * Word highlighting (karaoke):
 *   activeVerseKey + activeWordPos — the word matching both gets [data-active-word]
 *   which can be targeted in CSS for highlighting.
 */

import { useQcfFont } from '../hooks/useQcfFont';
import type { QcfPageData, QcfWord } from '../lib/qcf4';

type Props = {
  pageData: QcfPageData;
  /** "surah:ayah" of the currently playing/active ayah, e.g. "1:7" */
  activeVerseKey?: string | null;
  /** 1-based word position within the active ayah */
  activeWordPos?: number | null;
  /** Overall scale factor applied to the mushaf font size (default 1.0) */
  scale?: number;
};

/** px size at scale=1.0 — comfortable for mobile reading */
const BASE_FONT_PX = 22;

export function QcfMushafPage({
  pageData,
  activeVerseKey = null,
  activeWordPos = null,
  scale = 1.0,
}: Props) {
  // Collect every distinct font needed for this page (usually just two:
  // the main Hafs font + QCF4_QBSML for surah headers)
  const fontNames = Array.from(
    new Set(pageData.lines.flatMap(l => l.words.map(w => w.font))),
  );
  // Inject @font-face for all needed fonts synchronously (render-phase, not
  // useEffect) so the browser requests fonts in the same frame as the text.
  useQcfFont(fontNames);

  const fontSize = BASE_FONT_PX * scale;

  return (
    <div
      className="mushaf-page"
      style={{
        direction: 'rtl',
        padding: '16px 12px',
        // Paper-like background, dark-mode aware via CSS vars
        background: 'var(--mushaf-bg, var(--surface))',
        borderRadius: '6px',
        border: '1px solid var(--hairline)',
        // Subtle elevation
        boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.08)',
        userSelect: 'none',
      }}
    >
      {pageData.lines.map((line) => {
        const isSurahHeader = line.words.some(w => w.type === 'surah_header');
        const isBasmala     = line.words.some(w => w.type === 'basmala');
        const isCentered    = isSurahHeader || isBasmala || line.words.length <= 2;

        return (
          <div
            key={line.line}
            style={{
              display: 'flex',
              flexDirection: 'row',
              direction: 'rtl',
              alignItems: 'center',
              justifyContent: isCentered ? 'center' : 'space-between',
              // Line spacing — generous to give glyphs room for diacritics
              minHeight: `${fontSize * 2.0}px`,
              marginBottom: '2px',
            }}
          >
            {line.words.map((word, wordIdx) => (
              <QcfWordSpan
                key={wordIdx}
                word={word}
                fontSize={fontSize}
                isActive={
                  word.verse_key === activeVerseKey &&
                  word.position === activeWordPos
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Per-word span ─────────────────────────────────────────────────────────────

type WordSpanProps = {
  word: QcfWord;
  fontSize: number;
  isActive: boolean;
};

function QcfWordSpan({ word, fontSize, isActive }: WordSpanProps) {
  const isSurahHeader = word.type === 'surah_header';

  return (
    <span
      {...(isActive ? { 'data-active-word': '' } : {})}
      {...(word.verse_key ? { 'data-verse-key': word.verse_key } : {})}
      {...(word.position  ? { 'data-position': word.position }   : {})}
      style={{
        fontFamily: `'${word.font}', serif`,
        fontSize: isSurahHeader ? `${fontSize * 0.8}px` : `${fontSize}px`,
        // Colour: active word gets accent, header gets muted tone
        color: isActive
          ? 'var(--qcf-active, var(--accent, #1a6b3c))'
          : isSurahHeader
            ? 'var(--text-secondary)'
            : 'var(--qcf-text, var(--text-primary))',
        // Transition for smooth karaoke highlight swap
        transition: 'color 0.15s ease',
        // PUA glyphs don't wrap — keep them on one line
        whiteSpace: 'nowrap',
        // Remove any letter-spacing that could misalign PUA glyphs
        letterSpacing: '0',
        // No word-spacing on the span itself; line flex handles the spread
        wordSpacing: '0',
        lineHeight: '1',
        display: 'inline-block',
        // Padding gives a slight tap target without affecting layout
        padding: word.verse_key ? '4px 0' : '0',
        cursor: word.verse_key ? 'default' : 'default',
      }}
      // aria-label for screen readers — use the Unicode text equivalent
      aria-label={word.text || undefined}
    >
      {word.char}
    </span>
  );
}
