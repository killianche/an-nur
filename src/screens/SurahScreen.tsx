/**
 * SurahScreen — ayah-feed reading view (QCF V4 glyphs).
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │ [header pill: back / title / settings]   │  (fixed, floating)
 *   ├──────────────────────────────────────────┤
 *   │                                          │
 *   │   Surah header  (QCF surah_header)       │
 *   │   Bismillah     (QCF basmala)            │
 *   │   ─────────────────────────────          │
 *   │                                          │
 *   │   ﴿ 1 ﴾  بِسْمِ ٱللَّهِ … ﴾١﴿              │  ← QcfAyahLine
 *   │   Цlераца Аллахlа Къахетамеволча…       │  ← Ingush
 *   │   Во имя Аллаха, Милостивого…           │  ← Russian
 *   │   [1:1] [bookmark] [play]                │  ← action row
 *   │   ─────────────────────────────          │
 *   │                                          │
 *   │   ﴿ 2 ﴾  ٱلْحَمْدُ لِلَّهِ … ﴾٢﴿              │
 *   │   …                                      │
 *   └──────────────────────────────────────────┘
 *   [BottomDock — audio controls]                (fixed, when playing)
 *
 * Fonts are injected per-ayah by QcfAyahLine (deduped globally).  The whole
 * surah's QCF data is loaded eagerly on entry (parallel page fetches) so
 * scrolling through the feed is instant.
 */

import { useState, useEffect, useRef, useCallback, memo, type ReactNode } from 'react';
import { QURAN_SOURCES } from '../content/quran-sources';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { useAyahAudio } from '../hooks/useAyahAudio';
import { useQcfAyahFeed } from '../hooks/useQcfAyahFeed';
import { useQcfFont } from '../hooks/useQcfFont';
import { useChunkedRender } from '../hooks/useChunkedRender';
import { ArabicAyahRouter } from '../components/ArabicAyahRouter';
import { loadArabicEditions } from '../lib/arabicEditions';
import { ThemeSettings, TypographySettings } from '../components/ReadingSettings';
import { BottomDock } from '../components/BottomDock';
import {
  ChevronLeft, SquareBracketsLetterA, Palette,
  ArrowChevronRight, Bookmark as BookmarkIcon, Play, Pause,
} from '../components/icons';
import { type Theme } from '../hooks/useTheme';
import { getAutoScroll, subscribeAudioPrefs } from '../lib/audioPrefs';
import { pushRecent, updateRecentAyah, readRecents } from '../lib/recents';
import { isBookmarked, toggleBookmark } from '../lib/bookmarks';
import {
  readPref, readNumber,
  latinStack, latinWeight, latinIsSerif, ARABIC_FONT_IDS,
  type LatinFontId, type ArabicFontId,
} from '../lib/typography';
import { DEFAULT_RECITER, type ReciterId } from '../lib/reciters';

type Props = {
  surahNumber: number;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onBack: () => void;
  /**
   * Explicit ayah to scroll to on mount.  Set when the surah was opened
   * from the bookmarks list (the user clicked a specific saved verse) —
   * it overrides the "last read" position normally restored from recents.
   * Honoured once per surah change.
   */
  initialAyah?: number;
};

const LATIN_IDS:   LatinFontId[]  = ['inter-semibold', 'inter-regular', 'garamond', 'alice'];
const ARABIC_IDS:  ArabicFontId[] = ARABIC_FONT_IDS;
const RECITER_IDS: ReciterId[]    = ['alafasy', 'shaatree', 'husary', 'abdulbasit', 'hanirifai', 'shuraim', 'yasser', 'tunaiji'];

function migrateLegacyScale() {
  const legacy = localStorage.getItem('fontScale');
  if (!legacy) return;
  if (!localStorage.getItem('arabicScale')) localStorage.setItem('arabicScale', legacy);
  if (!localStorage.getItem('ruScale'))     localStorage.setItem('ruScale',     legacy);
  localStorage.removeItem('fontScale');
}

export function SurahScreen({ surahNumber, theme, setTheme, onBack, initialAyah }: Props) {
  migrateLegacyScale();

  // ── Audio ──────────────────────────────────────────────────────────────────
  const [reciter, setReciterS] = useState<ReciterId>(() => readPref('reciter', DEFAULT_RECITER, RECITER_IDS));
  const audio = useAyahAudio(reciter);

  // ── Typography prefs ───────────────────────────────────────────────────────
  const [arabicScale, setArabicScaleS] = useState<number>(() => readNumber('arabicScale', 1.0));
  const [ruScale,     setRuScaleS]     = useState<number>(() => readNumber('ruScale',     1.0));
  const [ruFont,      setRuFontS]      = useState<LatinFontId>(()  => readPref('ruFont',     'inter-regular', LATIN_IDS));
  const [arabicFont,  setArabicFontS]  = useState<ArabicFontId>(() => readPref('arabicFont', 'uthmani', ARABIC_IDS));
  const [showArabic,  setShowArabicS]  = useState<boolean>(() => localStorage.getItem('showArabic') !== '0');
  const [showRu,      setShowRuS]      = useState<boolean>(() => localStorage.getItem('showRu')     !== '0');

  const persist = <T extends string | number | boolean>(key: string) => (v: T) => {
    localStorage.setItem(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  };
  const setReciter     = (v: ReciterId)    => { setReciterS(v);     persist<string>('reciter')(v); };
  const setArabicScale = (v: number)       => { setArabicScaleS(v); persist<number>('arabicScale')(v); };
  const setRuScale     = (v: number)       => { setRuScaleS(v);     persist<number>('ruScale')(v); };
  const setRuFont      = (v: LatinFontId)  => { setRuFontS(v);      persist<string>('ruFont')(v); };
  const setArabicFont  = (v: ArabicFontId) => { setArabicFontS(v);  persist<string>('arabicFont')(v); };
  const setShowArabic  = (v: boolean)      => { setShowArabicS(v);  persist<boolean>('showArabic')(v); };
  const setShowRu      = (v: boolean)      => { setShowRuS(v);      persist<boolean>('showRu')(v); };

  // ── Header popovers ────────────────────────────────────────────────────────
  const [jumpOpen,       setJumpOpen]       = useState(false);
  const [themeOpen,      setThemeOpen]      = useState(false);
  const [typographyOpen, setTypographyOpen] = useState(false);
  const themeBtnRef      = useRef<HTMLButtonElement>(null);
  const typographyBtnRef = useRef<HTMLButtonElement>(null);
  const closeAll = () => { setJumpOpen(false); setThemeOpen(false); setTypographyOpen(false); };

  // ── Desktop responsive ─────────────────────────────────────────────────────
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(min-width: 1024px)').matches
      : false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Warm the multi-edition Arabic dataset on entry so the first font
  // switch is instant.  Idempotent: subsequent calls return the same
  // cached promise without re-fetching.
  useEffect(() => { loadArabicEditions(); }, []);

  // ── Surah metadata + QCF feed ──────────────────────────────────────────────
  const meta = SURAH_BY_NUMBER[surahNumber];
  const { feed, loading: feedLoading, error: feedError } = useQcfAyahFeed(surahNumber);

  // Inject fonts for surah header / basmala (the ayah lines inject their own)
  useQcfFont(feed?.decor.fonts ?? []);

  // ── On-enter: push recent + remember where to restore scroll ──────────────
  // priorAyahToRestoreRef holds the ayah we should scroll to *once* after the
  // QCF feed has loaded its DOM anchors.  Captured here (before pushRecent
  // overwrites the timestamp) and consumed by the restore-effect below.
  //
  // Priority for the restore target:
  //   1. `initialAyah` prop (set when opened from the bookmarks list)
  //   2. last-read ayah for this surah from recents
  //   3. nothing (start at the surah header)
  const priorAyahToRestoreRef = useRef<number | null>(null);
  useEffect(() => {
    const prior = readRecents().find(r => r.surah === surahNumber);
    const target = initialAyah ?? prior?.ayah ?? null;
    priorAyahToRestoreRef.current = target;
    pushRecent(surahNumber, target ?? 1);
    closeAll();
  }, [surahNumber, initialAyah]);

  // ── Restore scroll to the last-read ayah once the feed is in the DOM ──────
  // App.tsx fires `window.scrollTo(0, 0)` on screen change.  Effects run
  // child-first, so a synchronous scroll here would be wiped by App's
  // effect that runs afterwards.  Double-rAF defers our restore past
  // App's reset *and* gives the browser one frame to lay out anchors.
  // Use the ayah-count as a stable primitive signal — `feed` itself is a
  // fresh object on every render of the parent hook, which would re-run
  // this effect every time and let its cleanup `cancelAnimationFrame`
  // the raf we just scheduled, so the inner callback never fires.
  //
  // SurahScreen owns the page scroll position on mount: it either scrolls
  // to the last-read / bookmarked ayah, or — when there is nothing to
  // restore — explicitly resets to the top.  App.tsx deliberately does
  // NOT call window.scrollTo(0,0) on navigation into a surah for this
  // reason, so any leftover scroll from the previous screen would persist
  // unless we handle it here.
  const feedReady = !feedLoading && (feed?.ayahs.length ?? 0) > 0;
  useEffect(() => {
    if (!feedReady) return;
    const target = priorAyahToRestoreRef.current;
    priorAyahToRestoreRef.current = null;
    if (!target || target <= 1) {
      window.scrollTo(0, 0);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-ayah-anchor="${target}"]`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
        else window.scrollTo(0, 0);
      });
    });
  }, [feedReady]);

  // ── Track the ayah currently at the top of the viewport on user scroll ───
  // Without this, recent-ayah only ever updated on play / jump / auto-scroll,
  // so reading silently by scrolling never saved progress — the recents
  // strip on the picker always re-opened the surah at ayah 1.
  const lastTrackedAyahRef = useRef<number | null>(null);
  useEffect(() => {
    lastTrackedAyahRef.current = null;
  }, [surahNumber]);
  useEffect(() => {
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        // Skip while audio auto-scroll is mid-flight: it already calls
        // updateRecentAyah explicitly, and its scrollIntoView fires
        // scroll events that would otherwise race this listener.
        if (isAutoScrollingRef.current) return;
        const anchors = document.querySelectorAll<HTMLElement>('[data-ayah-anchor]');
        if (anchors.length === 0) return;
        // Threshold sits just below the floating header (88px) so the
        // "active" ayah is whichever one's top edge has crossed it most
        // recently — i.e. the one the reader is looking at.
        const threshold = 110;
        let bestAyah: number | null = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (let i = 0; i < anchors.length; i++) {
          const el = anchors[i];
          const top = el.getBoundingClientRect().top;
          if (top > threshold) continue;
          const delta = threshold - top;
          if (delta < bestDelta) {
            bestDelta = delta;
            bestAyah = Number(el.dataset.ayahAnchor);
          }
        }
        // Edge case: page is above the first anchor (top of surah header).
        // Fall back to ayah 1 so re-entry from the picker still lands at
        // the start instead of leaving whatever previous value sat in
        // localStorage.
        if (bestAyah == null) bestAyah = 1;
        if (bestAyah !== lastTrackedAyahRef.current) {
          lastTrackedAyahRef.current = bestAyah;
          updateRecentAyah(surahNumber, bestAyah);
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [surahNumber]);

  // ── Auto-scroll to currently-playing ayah ──────────────────────────────────
  const autoScrollRef = useRef<boolean>(getAutoScroll());
  useEffect(() => subscribeAudioPrefs(() => {
    autoScrollRef.current = getAutoScroll();
  }), []);

  const lastAutoAyahRef = useRef<{ surah: number; ayah: number } | null>(null);
  // Set just before a programmatic scroll so the chrome-visibility
  // listener (further down) can ignore the resulting scroll events —
  // otherwise auto-scrolling triggers the "scrolled down → hide
  // header" branch and the floating pill flickers in/out on every
  // ayah change.  Cleared after the smooth scroll has had time to
  // settle (~700 ms covers most auto-scrolls; the listener is back
  // in time for the next user interaction).
  const isAutoScrollingRef = useRef(false);
  useEffect(() => {
    if (!autoScrollRef.current) return;
    const ayah  = audio.currentAyah;
    const surah = audio.currentSurah;
    if (!ayah || !surah || surah !== surahNumber) return;

    const last = lastAutoAyahRef.current;
    if (last && last.surah === surah && last.ayah === ayah) return;
    lastAutoAyahRef.current = { surah, ayah };

    const el = document.querySelector(`[data-ayah-anchor="${ayah}"]`) as HTMLElement | null;
    if (!el) return;

    // Pick smooth vs. instant based on how far the target is from where
    // the user's eye already is.  Instant feels less seasick on rapid-
    // fire short ayahs (e.g. surah 56:1-4); smooth feels natural for
    // longer ayahs where the camera has to travel a noticeable distance.
    //
    // Header compensation lives on the article itself via
    // `scrollMarginTop: 88px` (see the JSX further down).  Earlier
    // versions chained a `window.scrollBy({ top: -88, behavior: 'auto' })`
    // after the smooth scrollIntoView — that instant nudge ran in
    // parallel with the ongoing smooth animation, so the page jumped
    // ~88px up, then smoothly drifted past the target, then snapped
    // back.  scroll-margin-top makes the browser do the right thing in
    // a single coherent animation.
    const rect = el.getBoundingClientRect();
    const distance = Math.abs(rect.top - 120);
    const behavior: ScrollBehavior = distance > 200 ? 'smooth' : 'auto';
    isAutoScrollingRef.current = true;
    el.scrollIntoView({ behavior, block: 'start' });
    // Smooth scrolls take ~300-600 ms in browsers; give a generous
    // window before re-enabling the user-scroll handler.  Instant
    // scrolls finish in one frame but we still wait so any settling
    // events don't trip the listener either.
    const settle = behavior === 'smooth' ? 700 : 120;
    window.setTimeout(() => { isAutoScrollingRef.current = false; }, settle);
    updateRecentAyah(surah, ayah);
  }, [audio.currentAyah, audio.currentSurah, surahNumber]);

  useEffect(() => {
    lastAutoAyahRef.current = null;
  }, [surahNumber]);

  // ── Auto-stop playback when leaving the screen / switching surah ──────────
  // The audio cache lives on the module level so the <audio> elements
  // outlive SurahScreen — without this cleanup, tapping Back to the
  // surah picker (or jumping to another surah) leaves the previous
  // surah's recitation playing in the background, with no UI to pause
  // it from.  Stash stopAll in a ref so the effect doesn't re-fire on
  // every render (audio is a fresh object each time).
  const stopAllRef = useRef(audio.stopAll);
  stopAllRef.current = audio.stopAll;
  useEffect(() => {
    return () => stopAllRef.current();
  }, [surahNumber]);

  // ── Jump to a specific ayah by number ──────────────────────────────────────
  // Instant scroll, not smooth: animating across hundreds of ayahs (e.g.
  // 286 → 1 in Al-Baqarah) takes several seconds and reads as "the jump
  // popover is frozen".  Jumping is an explicit "take me there now"
  // intent — instant lands the eye on the target ayah immediately.
  // Header overlap is handled by `scrollMarginTop: 88px` on every
  // article (see the JSX further down), so no follow-up scrollBy
  // compensation is needed.
  // useCallback + closeJump below keep the props passed to JumpPopover
  // referentially stable, so the memoised popover doesn't get re-rendered
  // by every audio-progress tick of SurahScreen (rAF-driven, 60×/s while
  // audio plays) — which is what made the slider feel sluggish.
  const jumpToAyahNumber = useCallback((ayahNum: number) => {
    setJumpOpen(false);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-ayah-anchor="${ayahNum}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        updateRecentAyah(surahNumber, ayahNum);
      }
    });
  }, [surahNumber]);
  const closeJump = useCallback(() => setJumpOpen(false), []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const audioActive = !!(audio.currentSurah && audio.currentAyah);

      if (e.code === 'Space') {
        e.preventDefault();
        if (audio.audioState === 'playing') {
          audio.pause();
        } else if (audioActive) {
          audio.playFrom(audio.currentSurah!, audio.currentAyah!, meta?.ayahs ?? 9999);
        } else {
          audio.playFrom(surahNumber, 1, meta?.ayahs ?? 9999);
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (audioActive) { e.preventDefault(); audio.next(); }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (audioActive) { e.preventDefault(); audio.prev(); }
      } else if (e.key === 'Escape') {
        if (audioActive) audio.stopAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, meta, surahNumber]);

  // ── Header chrome visibility (hide on scroll-down) ─────────────────────────
  const [chromeVisible, setChromeVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // While auto-scroll is moving the page to the next ayah we keep
      // the chrome stable — otherwise the floating pill flickers in/out
      // on every ayah change because the auto-scroll itself looks like
      // a "scroll down" gesture to this listener.
      if (isAutoScrollingRef.current) {
        lastScrollY.current = y;
        return;
      }
      const delta = y - lastScrollY.current;
      if (y < 80)         setChromeVisible(true);
      else if (delta > 6) setChromeVisible(false);
      else if (delta < -6) setChromeVisible(true);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Derived: which ayah is "active" right now (playing) ────────────────────
  const activeVerseKey = (audio.currentSurah && audio.currentAyah)
    ? `${audio.currentSurah}:${audio.currentAyah}`
    : null;

  // ── Play/pause helper for the dock ─────────────────────────────────────────
  const handlePlayPause = () => {
    if (audio.audioState === 'playing') {
      audio.pause();
    } else if (audio.currentSurah && audio.currentAyah) {
      audio.playFrom(audio.currentSurah, audio.currentAyah, meta?.ayahs ?? 9999);
    } else {
      audio.playFrom(surahNumber, 1, meta?.ayahs ?? 9999);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'transparent', minHeight: '100dvh', position: 'relative' }}>
      {/* ── Floating header pill ─────────────────────────────────────────── */}
      <header
        role="banner"
        style={{
          position: 'fixed',
          top: 'max(12px, env(safe-area-inset-top))',
          left: '50%',
          transform: chromeVisible ? 'translateX(-50%)' : 'translate(-50%, -160%)',
          transition: 'transform 0.25s ease',
          zIndex: 30,
          height: '52px',
          maxWidth: 'min(96vw, 460px)',
          width: 'fit-content',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0 6px',
          background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
          border: '1px solid var(--hairline)',
          borderRadius: '9999px',
          boxShadow: 'rgba(0,0,0,0.04) 0 1px 2px, rgba(0,0,0,0.12) 0 14px 36px',
          backdropFilter: 'saturate(160%) blur(20px)',
          WebkitBackdropFilter: 'saturate(160%) blur(20px)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="icon-btn"
          style={{ width: '40px', height: '40px', color: 'var(--text-tertiary)', flexShrink: 0 }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ minWidth: 0, flex: '0 1 auto', padding: '0 6px' }}>
          <div
            className="display-serif"
            style={{
              fontSize: '16px', fontWeight: 500,
              color: 'var(--text-primary)', letterSpacing: '-0.012em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1, maxWidth: '180px',
            }}
          >
            {meta?.transliteration ?? `Surah ${surahNumber}`}
          </div>
        </div>

        {meta && meta.ayahs > 10 && (
          <button
            onClick={() => { setJumpOpen(v => !v); setThemeOpen(false); setTypographyOpen(false); }}
            aria-label="Jump to ayah"
            className="icon-btn"
            data-active={jumpOpen}
            style={{ width: '40px', height: '40px', flexShrink: 0, color: jumpOpen ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            <ArrowChevronRight size={20} />
          </button>
        )}

        <button
          ref={typographyBtnRef}
          onClick={() => { setTypographyOpen(v => !v); setJumpOpen(false); setThemeOpen(false); }}
          aria-label="Typography settings"
          className="icon-btn"
          data-active={typographyOpen}
          style={{ width: '40px', height: '40px', flexShrink: 0, color: typographyOpen ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        >
          <SquareBracketsLetterA size={20} />
        </button>

        <button
          ref={themeBtnRef}
          onClick={() => { setThemeOpen(v => !v); setJumpOpen(false); setTypographyOpen(false); }}
          aria-label="Theme settings"
          className="icon-btn"
          data-active={themeOpen}
          style={{ width: '40px', height: '40px', flexShrink: 0, color: themeOpen ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        >
          <Palette size={20} />
        </button>
      </header>

      {/* ── Popovers ──────────────────────────────────────────────────────── */}
      {jumpOpen && meta && (
        <JumpPopover
          maxAyah={meta.ayahs}
          onClose={closeJump}
          onJump={jumpToAyahNumber}
        />
      )}
      {themeOpen && (
        <ThemeSettings
          theme={theme} setTheme={setTheme}
          reciter={reciter}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}
      {typographyOpen && (
        <TypographySettings
          reciter={reciter} setReciter={setReciter}
          showArabic={showArabic} setShowArabic={setShowArabic}
          showRu={showRu}         setShowRu={setShowRu}
          arabicScale={arabicScale} setArabicScale={setArabicScale}
          ruScale={ruScale}         setRuScale={setRuScale}
          ruFont={ruFont}         setRuFont={setRuFont}
          arabicFont={arabicFont} setArabicFont={setArabicFont}
          onClose={() => setTypographyOpen(false)}
          anchorEl={typographyBtnRef.current}
        />
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: isDesktop ? '1200px' : '700px',
          margin: '0 auto',
          // Mobile top padding bumped 88 → 112 px: на iPhone 12 пилюля
          // header'а сидит у top: max(12, safe-area), занимает 52 px,
          // итого ≈64 px от верха.  С 88 px оставалось только ~24 px
          // breathing room до названия суры — сплющено.  112 px даёт
          // ~48 px — комфортный отступ.
          padding: isDesktop ? '88px 48px 160px' : '112px 18px 140px',
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Surah header — Arabic surah_header glyph from QCF (real mushaf header) */}
        {meta && (
          <SurahTitleBlock
            meta={meta}
            decor={feed?.decor ?? null}
          />
        )}

        {/* Loading state */}
        {feedLoading && <AyahFeedSkeleton />}

        {feedError && (
          <div style={{
            textAlign: 'center', padding: '60px 16px',
            fontSize: '14px', color: 'var(--text-tertiary)',
          }}>
            Ошибка загрузки суры<br />
            <span style={{ fontSize: '12px', opacity: 0.7 }}>{feedError}</span>
          </div>
        )}

        {/* Feed of ayahs — progressive disclosure через AyahFeedList.
            Первые 30 ayah'ей mount'ятся сразу, остальные подъезжают
            батчами по 30 через requestIdleCallback.  Бакара first
            paint: 1.5-2 сек → ~200 мс на iPhone 12.
            forceUpTo учитывает initialAyah + активный аят озвучки —
            гарантия, что scroll-to-anchor + word-highlight найдут
            DOM-ноду. */}
        {!feedLoading && feed && feed.ayahs.length > 0 && (() => {
          const targetAyah = initialAyah ?? null;
          const activeAyahNum = activeVerseKey
            ? parseInt(activeVerseKey.split(':')[1] ?? '0', 10) || null
            : null;
          const forceTarget = Math.max(targetAyah ?? 0, activeAyahNum ?? 0);
          return (
          <AyahFeedList totalAyahs={feed.ayahs.length} forceUpTo={forceTarget}>
          {(visibleCount) => (
          <div>
            {feed.ayahs.slice(0, visibleCount).map(entry => {
              const source = QURAN_SOURCES[entry.verseKey];
              const isActiveAyah = activeVerseKey === entry.verseKey;

              // Per-scale bump for serif faces (EB Garamond + Alice):
              //   scales 0.85 / 1.0 / 1.2 → +5px   (gentle lift over Inter)
              //   scale  1.4              → +10px  (one extra at the
              //                                     largest reading step
              //                                     so the increase reads
              //                                     as deliberate)
              // Inter faces stay at the pure scale-based calc.
              const serifBump = (s: number): number =>
                s >= 1.4 ? 10 : 5;
              const ruFontSize  = latinIsSerif(ruFont)
                ? `calc(16px * ${ruScale} + ${serifBump(ruScale)}px)`
                : `calc(16px * ${ruScale})`;
              const ruLineHeight  = 1.48;

              return (
                <article
                  key={entry.verseKey}
                  data-ayah-anchor={entry.ayah}
                  className={`ayah-row${isActiveAyah ? ' active' : ''}`}
                  style={{ scrollMarginTop: '88px' }}
                >
                  {/* Arabic — QCF V4 default; ArabicAyahRouter switches
                      to V1 or Уthmani rendering based on the reader's
                      font preference. */}
                  {showArabic && (
                    <ArabicAyahRouter
                      verseKey={entry.verseKey}
                      ayahNumber={entry.ayah}
                      words={entry.words}
                      fonts={entry.fonts}
                      arabicFont={arabicFont}
                      activeWordPos={isActiveAyah ? audio.currentWordPos : null}
                      isActive={isActiveAyah}
                      scale={arabicScale}
                    />
                  )}

                  {/* Russian */}
                  {showRu && source && (
                    <p style={{
                      margin: showArabic ? '14px 0 0' : 0,
                      fontFamily: latinStack(ruFont),
                      fontSize: ruFontSize,
                      fontWeight: latinWeight(ruFont),
                      lineHeight: ruLineHeight,
                      color: 'var(--text-secondary)',
                      letterSpacing: '-0.005em',
                    }}>
                      {source.translations.ru}
                    </p>
                  )}

                  {/* Action row */}
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    gap: '8px', marginTop: '12px',
                  }}>
                    <span style={{
                      fontSize: '12px', fontWeight: 500,
                      color: 'var(--text-tertiary)', letterSpacing: '0.04em',
                      fontVariantNumeric: 'tabular-nums',
                      padding: '5px 12px',
                      border: '1px solid var(--hairline)',
                      borderRadius: '9999px', lineHeight: 1,
                    }}>
                      {entry.surah}:{entry.ayah}
                    </span>

                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.04em',
                      opacity: 0.7,
                      lineHeight: 1,
                    }}>
                      стр.&nbsp;{entry.pageNum}
                    </span>

                    <BookmarkBtn surah={entry.surah} ayah={entry.ayah} />

                    <PlayBtn
                      isActive={isActiveAyah}
                      audioState={audio.audioState}
                      onPlay={() => {
                        updateRecentAyah(entry.surah, entry.ayah);
                        audio.handlePlay(entry.surah, entry.ayah, meta?.ayahs ?? 9999);
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          )}
          </AyahFeedList>
          );
        })()}
      </div>

      {/* ── BottomDock ────────────────────────────────────────────────────── */}
      {audio.currentSurah && audio.currentAyah && (
        <BottomDock
          audioState={audio.audioState}
          currentAyah={audio.currentAyah}
          progress={audio.progress}
          playbackRate={audio.playbackRate}
          onPlayPause={handlePlayPause}
          onPrev={audio.prev}
          onNext={audio.next}
          onCyclePlaybackRate={audio.cyclePlaybackRate}
          onClose={audio.stopAll}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Title block — transliteration, meaning, Bismillah (QCF basmala glyph row).
 *  The Bismillah here is intentionally NOT scaled by the user's arabicScale
 *  pref: the glyph is one wide ligature, and at scale=1.4 on a 320-360 px
 *  phone it overflows the screen edge (the user reported it cropping out
 *  of the left margin on Al-Anfal).  Fixed 40 px keeps it stable across
 *  all themes / pickers / screen sizes; the body ayahs continue to scale
 *  freely in QcfAyahLine. */
/**
 * AyahFeedList — thin wrapper, который держит хук useChunkedRender
 * (хук должен быть в стабильном render-path; внутри conditional IIFE
 * родителя — нарушит rules-of-hooks).  Children — render-prop, получает
 * текущий visibleCount.
 */
function AyahFeedList({
  totalAyahs,
  forceUpTo,
  children,
}: {
  totalAyahs: number;
  forceUpTo: number;
  children: (visibleCount: number) => ReactNode;
}) {
  const visibleCount = useChunkedRender(totalAyahs, {
    initial: 30,
    batch: 30,
    forceUpTo,
  });
  return <>{children(visibleCount)}</>;
}

function SurahTitleBlock({
  meta, decor,
}: {
  meta: { number: number; transliteration: string; russian: string; ayahs: number; arabic: string };
  decor: { header: import('../lib/qcf4').QcfWord[]; basmala: import('../lib/qcf4').QcfWord[]; fonts: string[] } | null;
}) {
  // Surah 1 (Al-Fatiha) has the basmala AS ayah 1 — don't show a separate basmala.
  // Surah 9 (At-Tawba) has no basmala at all — QCF data reflects this (decor.basmala empty).
  const showBasmala = meta.number !== 1 && decor && decor.basmala.length > 0;

  return (
    <div style={{ textAlign: 'center', padding: '4px 0 24px' }}>
      <div
        className="display-serif"
        style={{
          fontSize: '28px', fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {meta.transliteration}
      </div>
      <div style={{
        marginTop: '4px',
        fontSize: '13px',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.02em',
      }}>
        {meta.russian} · {meta.ayahs} аят{meta.ayahs === 1 ? '' : (meta.ayahs < 5 ? 'а' : 'ов')}
      </div>

      {/* Bismillah row — rendered with QCF glyphs (real mushaf basmala).
          FIXED 40 px regardless of the user's arabicScale.  The glyph is
          one continuous ligature, and at higher scales (1.2 / 1.4) it
          ran off the left edge on narrow phones — the user reported
          cropping on Al-Anfal at scale 1.4.  Plus a `max-width: 100%` +
          horizontal padding cushion guards against any future mushaf
          rendering with an even wider basmala glyph. */}
      {showBasmala && decor && (
        <div
          dir="rtl"
          style={{
            direction: 'rtl',
            textAlign: 'center',
            marginTop: '28px',
            paddingLeft: '12px',
            paddingRight: '12px',
            fontSize: '40px',
            lineHeight: 1.8,
            color: 'var(--text-primary)',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          {decor.basmala.map((w, i) => (
            <span
              key={i}
              dir="rtl"
              style={{
                fontFamily: `'${w.font}', serif`,
                whiteSpace: 'nowrap',
                letterSpacing: '0',
                wordSpacing: '0',
                // QCF PUA codepoints are strong-LTR; without per-word bidi
                // isolation the spans collapse into one LTR run and render in
                // DOM order (left-to-right) instead of the parent's RTL order.
                // See web/src/components/QcfAyahLine.tsx header for full notes.
                unicodeBidi: 'isolate',
              }}
            >
              {w.char}
            </span>
          ))}
        </div>
      )}

      {/* Decorative divider */}
      <div style={{
        height: '1px',
        margin: '28px auto 4px',
        width: '64px',
        background: 'var(--hairline-strong)',
        opacity: 0.6,
      }} />
    </div>
  );
}

/** Skeleton placeholder while QCF feed loads. */
function AyahFeedSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div className="skeleton" style={{
            height: '34px', borderRadius: '4px',
            width: i % 2 === 0 ? '92%' : '78%',
            marginBottom: '14px',
          }} />
          <div className="skeleton" style={{
            height: '16px', borderRadius: '4px',
            width: '88%', marginBottom: '8px',
          }} />
          <div className="skeleton" style={{
            height: '16px', borderRadius: '4px',
            width: '70%',
          }} />
        </div>
      ))}
    </div>
  );
}

/** Bookmark button — manages its own local state */
function BookmarkBtn({ surah, ayah }: { surah: number; ayah: number }) {
  const [marked, setMarked] = useState(() => isBookmarked(surah, ayah));
  return (
    <button
      aria-label={marked ? 'Убрать из закладок' : 'В закладки'}
      onClick={e => { e.stopPropagation(); setMarked(toggleBookmark(surah, ayah)); }}
      className="icon-btn"
      data-active={marked}
      style={{
        width: '40px', height: '40px', marginInlineStart: 'auto',
        color: marked ? 'var(--text-primary)' : 'var(--text-tertiary)',
      }}
    >
      <BookmarkIcon isFilled={marked} />
    </button>
  );
}

/** Play/pause button for a single ayah */
function PlayBtn({
  isActive, audioState, onPlay,
}: {
  isActive: boolean;
  audioState: 'idle' | 'loading' | 'playing' | 'paused';
  onPlay: () => void;
}) {
  const playing = isActive && audioState === 'playing';
  return (
    <button
      aria-label={playing ? 'Пауза' : 'Слушать аят'}
      onClick={e => { e.stopPropagation(); onPlay(); }}
      className="icon-btn"
      data-active={isActive}
      style={{
        width: '40px', height: '40px',
        color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
      }}
    >
      {playing ? <Pause size={18} /> : <Play size={18} />}
    </button>
  );
}

/**
 * Jump-to-ayah popover — scrolls the feed to the chosen ayah's anchor.
 */
const JumpPopover = memo(function JumpPopover({
  maxAyah, onJump, onClose,
}: {
  maxAyah: number;
  onJump: (n: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(1);
  // Direct-edit mode: clicking the big number turns it into a text
  // input so the user can type the target ayah number instead of
  // dragging the slider or hunting through chips.  Confirmed on
  // Enter / blur; Esc cancels.  Clamped to [1, maxAyah] on commit.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('1');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(String(val));
    setEditing(true);
  };
  const commitEdit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 1) {
      setVal(Math.min(maxAyah, Math.max(1, n)));
    }
    setEditing(false);
  };
  const cancelEdit = () => {
    setEditing(false);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '60px', right: '12px', zIndex: 40,
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          border: '1px solid var(--hairline)', borderRadius: '16px',
          padding: '20px', width: 'min(300px, calc(100vw - 24px))',
          boxShadow: 'rgba(0,0,0,0.04) 0 1px 2px, rgba(0,0,0,0.10) 0 16px 40px',
        }}
      >
        <p style={{
          margin: '0 0 4px', fontSize: '11px', fontWeight: 600,
          color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.10em',
        }}>
          Перейти к аяту
        </p>

        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={e => {
              // Allow only digits while typing
              const cleaned = e.target.value.replace(/[^\d]/g, '');
              setDraft(cleaned);
            }}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="display-serif"
            aria-label="Номер аята"
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box',
              fontSize: '64px', fontWeight: 400, lineHeight: 1,
              color: 'var(--text-primary)', textAlign: 'center',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              margin: '12px 0',
              background: 'transparent', border: 'none', outline: 'none',
              padding: 0,
              fontFamily: 'inherit',
              // Hide the native number-spinner ticks in WebKit
              MozAppearance: 'textfield',
            }}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={startEdit}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startEdit();
              }
            }}
            aria-label={`Текущий номер ${val}. Кликни, чтобы ввести вручную`}
            className="display-serif"
            style={{
              fontSize: '64px', fontWeight: 400, lineHeight: 1,
              color: 'var(--text-primary)', textAlign: 'center',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              margin: '12px 0',
              cursor: 'text',
              userSelect: 'none',
              outline: 'none',
            }}
          >
            {val}
          </div>
        )}

        <input
          className="range-slider"
          type="range"
          min={1} max={maxAyah} value={val}
          onChange={e => setVal(parseInt(e.target.value, 10))}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>1</span><span>{maxAyah}</span>
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px',
          marginTop: '14px', justifyContent: 'center',
        }}>
          {quickChips(maxAyah).map(n => (
            <button
              key={n}
              onClick={() => setVal(n)}
              style={{
                minWidth: '40px', padding: '7px 12px', borderRadius: '9999px',
                border: `1px solid ${val === n ? 'var(--text-primary)' : 'var(--hairline-strong)'}`,
                background: val === n ? 'var(--accent-dim)' : 'transparent',
                color: 'var(--text-primary)', fontFamily: 'inherit',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={() => onJump(val)}
          style={{
            marginTop: '16px', width: '100%', minHeight: '44px',
            padding: '11px 0', borderRadius: '9999px', border: 'none',
            background: 'var(--ink, #0c0a09)', color: 'var(--surface)',
            fontFamily: 'inherit', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', letterSpacing: '0.005em',
          }}
        >
          К аяту {val}
        </button>
      </div>
    </>
  );
});

function quickChips(max: number): number[] {
  if (max <= 12) return [1, Math.ceil(max / 2), max];
  const step = max <= 50 ? 10 : max <= 120 ? 25 : 50;
  const chips: number[] = [1];
  for (let n = step; n < max; n += step) chips.push(n);
  chips.push(max);
  return chips;
}
