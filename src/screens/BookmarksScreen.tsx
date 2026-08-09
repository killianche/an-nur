import { useState, useMemo } from 'react';
import { readBookmarks, toggleBookmark } from '../lib/bookmarks';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { QURAN_SOURCES } from '../content/quran-sources';
import { ChevronLeft, Bookmark as BookmarkIcon } from '../components/icons';
import type { Theme } from '../hooks/useTheme';

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  onBack: () => void;
  onOpen: (surah: number, ayah: number) => void;
};

type Entry = { surah: number; ayah: number; key: string };

/**
 * Bookmarks list — every saved ayah, grouped by surah in natural mushaf
 * order.  Each row is a button that opens the corresponding surah in
 * SurahScreen via the initialAyah prop (lib/recents drives the scroll
 * restore once the QCF feed has rendered).
 */
export function BookmarksScreen({ onBack, onOpen }: Props) {
  // Re-read on every toggle so removal updates the list without a route
  // change.  Bookmarks are a Set on disk; we materialise it once per
  // render here.
  const [tick, setTick] = useState(0);

  const entries: Entry[] = useMemo(() => {
    const set = readBookmarks();
    const list: Entry[] = [];
    for (const key of set) {
      const [s, a] = key.split(':').map(Number);
      if (Number.isFinite(s) && Number.isFinite(a)) {
        list.push({ surah: s, ayah: a, key });
      }
    }
    list.sort((x, y) => x.surah - y.surah || x.ayah - y.ayah);
    return list;
  }, [tick]);

  // Group consecutive entries by surah for the section headers.
  const groups = useMemo(() => {
    const out: Array<{ surah: number; items: Entry[] }> = [];
    for (const e of entries) {
      const last = out[out.length - 1];
      if (last && last.surah === e.surah) last.items.push(e);
      else out.push({ surah: e.surah, items: [e] });
    }
    return out;
  }, [entries]);

  const handleRemove = (surah: number, ayah: number) => {
    toggleBookmark(surah, ayah);
    setTick(t => t + 1);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'transparent',
      maxWidth: 'min(100%, 760px)',
      margin: '0 auto',
      padding: '0 16px 120px',
      position: 'relative',
    }}>
      {/* Header: back arrow + title */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        paddingTop: '32px',
        paddingBottom: '24px',
      }}>
        <button
          onClick={onBack}
          aria-label="Back"
          className="icon-btn"
          style={{
            width: '44px',
            height: '44px',
            border: '1px solid var(--hairline)',
            borderRadius: '14px',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={20} />
        </button>
        <h1
          className="display-serif"
          style={{
            margin: 0,
            fontSize: 'clamp(28px, 7vw, 44px)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.05,
          }}
        >
          Закладки
        </h1>
      </header>

      {entries.length === 0 ? (
        <section style={{
          marginTop: '32px',
          textAlign: 'center',
          padding: '64px 16px',
          border: '1px dashed var(--hairline-strong)',
          borderRadius: '20px',
        }}>
          <div style={{
            width: 48, height: 48,
            margin: '0 auto 18px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tertiary)',
          }}>
            <BookmarkIcon size={28} />
          </div>
          <p style={{
            margin: 0,
            fontSize: '15px',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            maxWidth: '360px',
            marginInline: 'auto',
          }}>
            Сохранённые аяты появятся здесь. Откройте любую суру и нажмите на иконку закладки рядом с аятом.
          </p>
        </section>
      ) : (
        <div>
          {groups.map((g, idx) => {
            const meta = SURAH_BY_NUMBER[g.surah];
            return (
              <section key={g.surah} style={{ marginTop: idx === 0 ? 0 : '28px' }}>
                {/* Surah header — same visual rhythm as the picker's
                    Juz dividers: tight tabular cap-label + hairline. */}
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '12px',
                  paddingBottom: '10px',
                }}>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}>
                    Сура {String(g.surah).padStart(3, '0')}
                  </span>
                  <span
                    className="display-serif"
                    style={{
                      fontSize: '15px',
                      color: 'var(--text-secondary)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {meta?.transliteration ?? `Surah ${g.surah}`}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--hairline)' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {g.items.map(e => (
                    <BookmarkRow
                      key={e.key}
                      entry={e}
                      onOpen={() => onOpen(e.surah, e.ayah)}
                      onRemove={() => handleRemove(e.surah, e.ayah)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BookmarkRow({
  entry, onOpen, onRemove,
}: { entry: Entry; onOpen: () => void; onRemove: () => void }) {
  const source = QURAN_SOURCES[`${entry.surah}:${entry.ayah}`];
  // Russian gets the readable preview (it's the user's primary working
  // language for the project).  Arabic is shown right-aligned in a
  // smaller, dimmer hint row so the saved verse is still recognisable
  // as a citation, not just a number.
  const preview = source?.translations.ru ?? '';

  return (
    <div style={{
      position: 'relative',
      border: '1px solid var(--hairline)',
      borderRadius: '14px',
      background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onOpen}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '14px 56px 14px 16px',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '10px',
          marginBottom: source ? '6px' : 0,
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontVariantNumeric: 'tabular-nums',
          }}>
            Аят {entry.surah}:{entry.ayah}
          </span>
          {source?.arabic && (
            <span lang="ar" dir="rtl" style={{
              flex: 1,
              fontSize: '14px',
              color: 'var(--text-tertiary)',
              opacity: 0.7,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
              lineHeight: 1.2,
            }}>
              {source.arabic}
            </span>
          )}
        </div>
        {preview && (
          <p style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: 1.45,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.005em',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {preview}
          </p>
        )}
      </button>
      <button
        onClick={onRemove}
        aria-label="Убрать из закладок"
        className="icon-btn"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '36px',
          height: '36px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BookmarkIcon size={18} isFilled />
      </button>
    </div>
  );
}
