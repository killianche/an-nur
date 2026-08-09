import { useState, useMemo, useEffect, useRef } from 'react';
import { SURAHS, SURAH_BY_NUMBER, type SurahMeta } from '../content/surahs';
import { readRecents } from '../lib/recents';
import { Palette, Search, Bookmark as BookmarkIcon } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';

// ── Juz mapping ──────────────────────────────────────────────────────────────
// Each surah is assigned the Juz it STARTS in (standard 30-part division).
// Juz 2 (2:142–2:252) and Juz 5 (4:24–4:147) have no surah starts and
// therefore won't appear as section headers.
const SURAH_JUZ: Record<number, number> = {
  1: 1,  2: 1,
  3: 3,  4: 4,
  5: 6,  6: 7,  7: 8,  8: 9,  9: 10,
  10: 11, 11: 11, 12: 12, 13: 13, 14: 13,
  15: 14, 16: 14, 17: 15, 18: 15,
  19: 16, 20: 16, 21: 17, 22: 17,
  23: 18, 24: 18, 25: 18,
  26: 19, 27: 19, 28: 20, 29: 20,
  30: 21, 31: 21, 32: 21, 33: 21,
  34: 22, 35: 22, 36: 22,
  37: 23, 38: 23, 39: 23,
  40: 24, 41: 24,
  42: 25, 43: 25, 44: 25, 45: 25,
  46: 26, 47: 26, 48: 26, 49: 26, 50: 26, 51: 26,
  52: 27, 53: 27, 54: 27, 55: 27, 56: 27, 57: 27,
  58: 28, 59: 28, 60: 28, 61: 28, 62: 28, 63: 28, 64: 28, 65: 28, 66: 28,
  67: 29, 68: 29, 69: 29, 70: 29, 71: 29, 72: 29, 73: 29, 74: 29, 75: 29, 76: 29, 77: 29,
  78: 30, 79: 30, 80: 30, 81: 30, 82: 30, 83: 30, 84: 30, 85: 30, 86: 30, 87: 30,
  88: 30, 89: 30, 90: 30, 91: 30, 92: 30, 93: 30, 94: 30, 95: 30, 96: 30, 97: 30,
  98: 30, 99: 30, 100: 30, 101: 30, 102: 30, 103: 30, 104: 30, 105: 30, 106: 30,
  107: 30, 108: 30, 109: 30, 110: 30, 111: 30, 112: 30, 113: 30, 114: 30,
};

type Props = {
  onSelectSurah: (number: number) => void;
  // onAzkar убран: раздел азкаров теперь отдельная вкладка в нижней
  // панели, дублировать переход ссылкой в шапке незачем.
  onBookmarks?: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
};

/** Reactive matchMedia helper. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}


export function SurahPicker({ onSelectSurah, onBookmarks, theme, setTheme }: Props) {
  const [query, setQuery] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const cols = isDesktop ? 3 : 2;

  const recents = useMemo(() => {
    return readRecents()
      .map(r => ({ ...r, meta: SURAH_BY_NUMBER[r.surah] }))
      .filter(r => r.meta);
  }, []);

  // ── Search filter ──────────────────────────────────────────────────────────
  const list = useMemo(() => {
    if (!query.trim()) return SURAHS;
    const raw = query.trim();
    const q = raw.toLowerCase();
    return SURAHS.filter(s =>
      String(s.number).includes(q) ||
      s.transliteration.toLowerCase().includes(q) ||
      s.russian.toLowerCase().includes(q) ||
      s.arabic.includes(raw)
    );
  }, [query]);

  // ── Juz groups (stable — derived from full SURAHS list, computed once) ─────
  const groupedSurahs = useMemo(() => {
    const groups: Array<{ juz: number; surahs: SurahMeta[] }> = [];
    let currentJuz = -1;
    for (const s of SURAHS) {
      const juz = SURAH_JUZ[s.number] ?? 1;
      if (juz !== currentJuz) {
        groups.push({ juz, surahs: [] });
        currentJuz = juz;
      }
      groups[groups.length - 1].surahs.push(s);
    }
    return groups;
  }, []);

  // ── Display items: consecutive single-surah Juz are batched into a
  //    side-by-side row sized by `cols` (2 on mobile, 3 on desktop) ──
  type GroupItem = { type: 'group'; members: Array<{ juz: number; surah: SurahMeta }> };
  type SingleItem = { type: 'single'; juz: number; surahs: SurahMeta[] };
  type DisplayItem = SingleItem | GroupItem;

  const displayItems = useMemo((): DisplayItem[] => {
    const items: DisplayItem[] = [];
    let i = 0;
    while (i < groupedSurahs.length) {
      // Greedily consume up to `cols` consecutive single-surah juz and
      // pack them into one row.  Multi-surah juz always render as their
      // own full-width section.
      const run: Array<{ juz: number; surah: SurahMeta }> = [];
      while (
        i < groupedSurahs.length &&
        groupedSurahs[i].surahs.length === 1 &&
        run.length < cols
      ) {
        run.push({ juz: groupedSurahs[i].juz, surah: groupedSurahs[i].surahs[0] });
        i++;
      }
      if (run.length > 0) {
        items.push({ type: 'group', members: run });
        continue;
      }
      // Current juz has multiple surahs → render standalone block.
      const curr = groupedSurahs[i];
      items.push({ type: 'single', juz: curr.juz, surahs: curr.surahs });
      i++;
    }
    return items;
  }, [groupedSurahs, cols]);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: '8px',
  };

  return (
    // Transparent root — body owns the page fill.
    <div style={{
      minHeight: '100dvh',
      background: 'transparent',
      maxWidth: isDesktop ? '1200px' : '760px',
      margin: '0 auto',
      // Нижний отступ учитывает панель вкладок: без него последняя
      // сура уезжает под неё и её нельзя дотапать.
      padding: isDesktop
        ? `0 40px calc(${TAB_BAR_HEIGHT}px + 60px + env(safe-area-inset-bottom))`
        : `0 16px calc(${TAB_BAR_HEIGHT}px + 36px + env(safe-area-inset-bottom))`,
      position: 'relative',
      overflowX: 'hidden',
    }}>
      {themeOpen && (
        <ThemeSettings
          theme={theme}
          setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {/* ── Title row ──────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '16px',
        paddingTop: '64px',
        paddingBottom: '32px',
        position: 'relative',
        zIndex: 1,
      }}>
        <h1
          className="display-serif"
          style={{
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: 'clamp(44px, 12vw, 88px)',
            fontWeight: 300,
            letterSpacing: '-0.04em',
            color: 'var(--text-primary)',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          Quran
        </h1>

      </header>

      {/* ── Recents strip ──────────────────────────────────────────────────── */}
      {recents.length > 0 && (
        <section style={{ marginBottom: '32px', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex', gap: '8px',
            overflowX: 'auto', scrollbarWidth: 'none',
            margin: '0 -16px', padding: '0 16px',
          }}>
            {recents.map(r => (
              <button
                key={r.surah}
                onClick={() => onSelectSurah(r.surah)}
                style={{
                  flexShrink: 0,
                  minWidth: '160px',
                  maxWidth: '70vw',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-start', gap: '6px',
                  padding: '14px 16px',
                  // Frosted glass — translucent tint over wallpaper /
                  // cosmic stars instead of the previous opaque surface
                  // tile, matched to SurahCard so the picker reads as
                  // one coherent material.
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Surah {r.surah}
                </span>
                <span
                  className="display-serif"
                  style={{ fontSize: '20px', color: 'var(--text-primary)', fontWeight: 400, letterSpacing: '-0.01em' }}
                >
                  {r.meta!.transliteration}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Ayah {r.ayah} of {r.meta!.ayahs}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Search + Theme button ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '10px',
        marginBottom: '24px',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
          border: '1px solid var(--hairline)',
          borderRadius: '14px',
          padding: '12px 16px',
        }}>
          <span aria-hidden style={{ color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 }}>
            <Search size={18} />
          </span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Surah, ayah, or word"
            style={{
              flex: 1, minWidth: 0,
              border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'inherit', fontSize: '15px', fontWeight: 400,
              color: 'var(--text-primary)', padding: 0, letterSpacing: '0.005em',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                flexShrink: 0,
                border: 'none',
                background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'inherit',
                fontSize: '18px',
                fontWeight: 400,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>

        {onBookmarks && (
          <button
            onClick={onBookmarks}
            aria-label="Закладки"
            className="icon-btn"
            style={{
              flexShrink: 0,
              width: '48px',
              borderRadius: '14px',
              border: '1px solid var(--hairline)',
              background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookmarkIcon size={20} />
          </button>
        )}

        <button
          ref={themeBtnRef}
          onClick={() => setThemeOpen(true)}
          aria-label="Theme settings"
          className="icon-btn"
          style={{
            flexShrink: 0,
            width: '48px',
            borderRadius: '14px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Palette size={20} />
        </button>
      </div>

      {/* ── Surah list ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {query.trim() ? (
          // ── Search results: flat grid, no Juz headers ──────────────────
          list.length === 0 ? (
            <p style={{
              textAlign: 'center', padding: '64px 0',
              color: 'var(--text-tertiary)', fontSize: '14px',
            }}>
              Nothing found.
            </p>
          ) : (
            <div style={gridStyle}>
              {list.map(s => (
                <SurahCard key={s.number} surah={s} onSelect={() => onSelectSurah(s.number)} />
              ))}
            </div>
          )
        ) : (
          // ── Full list grouped by Juz ───────────────────────────────────
          // Consecutive single-surah Juz are rendered as a side-by-side
          // pair (2 columns: Juz header + card per column). Multi-surah
          // Juz use the standard full-width header + grid layout.
          displayItems.map((item, idx) => {
            const mt: React.CSSProperties = { marginTop: idx === 0 ? 0 : '28px' };
            if (item.type === 'group') {
              return (
                <div key={`group-${item.members.map(m => m.juz).join('-')}`} style={mt}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${item.members.length}, 1fr)`,
                    gap: '8px',
                  }}>
                    {item.members.map(m => (
                      <div key={m.juz}>
                        <JuzHeaderInline juz={m.juz} />
                        <SurahCard surah={m.surah} onSelect={() => onSelectSurah(m.surah.number)} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={item.juz} style={mt}>
                <JuzHeader juz={item.juz} />
                <div style={gridStyle}>
                  {item.surahs.map(s => (
                    <SurahCard key={s.number} surah={s} onSelect={() => onSelectSurah(s.number)} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Juz section headers ───────────────────────────────────────────────────────

/** Full-width header with extending hairline — used for multi-surah Juz. */
function JuzHeader({ juz }: { juz: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      paddingBottom: '10px',
    }}>
      <span style={{
        fontSize: '10px',
        fontWeight: 700,
        color: 'var(--text-tertiary)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        Джуз {juz}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'var(--hairline)' }} />
    </div>
  );
}

/** Compact header without the extending line — used inside pair columns. */
function JuzHeaderInline({ juz }: { juz: number }) {
  return (
    <div style={{ paddingBottom: '8px' }}>
      <span style={{
        fontSize: '10px',
        fontWeight: 700,
        color: 'var(--text-tertiary)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontVariantNumeric: 'tabular-nums',
      }}>
        Джуз {juz}
      </span>
    </div>
  );
}

// ── Surah card ────────────────────────────────────────────────────────────────

/**
 * Mushaf-forward layout — Arabic calligraphy is the hero, transliteration
 * underneath as a secondary read, footer meta (number · ayah count)
 * minimal at the bottom.
 *
 * "Liquid Glass" surface — Apple's iOS 18+ vocabulary:
 *
 *   1. Heavy backdrop blur + boosted saturation gives the strong
 *      refractive feel of frosted acrylic over the wallpaper.
 *   2. A diagonal white→clear→white gradient overlays the translucent
 *      surface tint to mimic specular sheen across the tile.
 *   3. Inset top-edge highlight (1px bright line) reads as light
 *      reflecting off the glass's upper bevel.
 *   4. Inset bottom-edge shadow gives the glass perceptible
 *      thickness — the lower rim looks recessed.
 *   5. Hairline rim border in white-mix carries the highlight all
 *      the way around.
 *   6. Outer drop shadow lifts the tile off the page slightly so it
 *      reads as a hovering plate rather than a flat sticker.
 */
function SurahCard({ surah, onSelect }: { surah: SurahMeta; onSelect: () => void }) {
  // Desktop card bumps every text tier up by ~40% so the trio of
  // arabic / transliteration / meta reads comfortably on a 1024+ canvas
  // where each cell is much wider than on phones.  Mobile sizes stay
  // intact (the previous defaults).
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isDesktop ? '22px 20px 18px' : '16px 14px 12px',
        background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
        border: '1px solid var(--hairline)',
        borderRadius: isDesktop ? '16px' : '14px',
        cursor: 'pointer',
        textAlign: 'center',
        fontFamily: 'inherit',
        color: 'inherit',
        width: '100%',
        minWidth: 0,
        minHeight: isDesktop ? '148px' : '108px',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      {/* Arabic calligraphy — hero element.  Sits at the top of the
          card, larger than transliteration, in display-serif fallback
          via the Unicode-text Arabic stack so the OS picks the best
          available Arabic font (KFGQPC Uthmanic Hafs v22 on installs
          that have it, system Naskh otherwise). */}
      <span
        lang="ar"
        dir="rtl"
        style={{
          fontFamily: "'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif",
          fontSize: isDesktop ? '32px' : '22px',
          color: 'var(--text-primary)',
          lineHeight: 1.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {surah.arabic}
      </span>

      {/* Transliteration — secondary read, display-serif so it shares
          the typographic vocabulary of the surah-header in the reader. */}
      <span
        className="display-serif"
        style={{
          display: 'block',
          marginTop: isDesktop ? '8px' : '4px',
          fontSize: isDesktop ? '20px' : '14px',
          fontWeight: 400,
          color: 'var(--text-secondary)',
          letterSpacing: '-0.005em',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {surah.transliteration}
      </span>

      {/* Footer meta: "001 · 7 аятов" — single line, lowest tier of
          text so it visually steps behind the Arabic header. */}
      <span
        style={{
          marginTop: isDesktop ? '12px' : '8px',
          fontSize: isDesktop ? '13px' : '10px',
          fontWeight: 500,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.06em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {String(surah.number).padStart(3, '0')} · {surah.ayahs} аятов
      </span>
    </button>
  );
}
