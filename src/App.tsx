import { useState, useEffect } from 'react';
import { useTheme, themeMode } from './hooks/useTheme';
import { SurahPicker } from './screens/SurahPicker';
import { SurahScreen } from './screens/SurahScreen';
import { AzkarScreen } from './screens/AzkarScreen';
import { AzkarCategoryScreen } from './screens/AzkarCategoryScreen';
import { BookmarksScreen } from './screens/BookmarksScreen';
import { CosmicLayer } from './components/CosmicLayer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyHighlightVars } from './lib/audioPrefs';
import { applyPaletteToDocument } from './lib/tajweedPalette';
import { syncStatusBarToTheme } from './lib/nativeStatusBar';
import type { AzkarCategoryId } from './lib/azkar';

type Screen =
  | { name: 'picker' }
  | { name: 'azkar' }
  | { name: 'azkar-category'; category: AzkarCategoryId }
  | { name: 'bookmarks' }
  | { name: 'surah'; number: number; initialAyah?: number };

export default function App() {
  const { theme, setTheme } = useTheme();
  const [screen, setScreen] = useState<Screen>({ name: 'picker' });
  const isCosmic = themeMode(theme) === 'cosmic';

  // ── History-API routing ──────────────────────────────────────────────────
  // Every forward navigation pushes a `history` entry carrying the next
  // Screen as its state.  That lets the browser's back gesture (iOS
  // edge-swipe, Android hardware back, desktop browser-back button) feed
  // popstate which we translate back into setScreen — no extra UI plumbing
  // needed, and "swipe back from a surah" naturally returns to the picker
  // (or to whatever screen the user came from, for deeper stacks like
  // picker → bookmarks → surah).
  //
  // Programmatic `Back` buttons inside each screen now call `goBack()`
  // (= `history.back()`) so they share the same exit path as the gesture;
  // there's no second code path that could drift out of sync.
  const navigate = (next: Screen) => {
    setScreen(next);
    history.pushState({ screen: next }, '');
  };
  const goBack = () => history.back();

  useEffect(() => {
    // Anchor the current history entry to `picker` so that subsequent
    // `history.back()` calls (from Azkar / surah / bookmarks) can never
    // rewind into stale state left over from a prior reload or hot-
    // reload.  Without this, the user can click "Azkar" then "← Quran"
    // and land back on whatever screen they happened to be on before
    // the last reload (most visibly: an open azkar-category feed).
    history.replaceState({ screen: { name: 'picker' } }, '');
    const onPop = (e: PopStateEvent) => {
      // `state` is null on the very first history entry (the one created
      // when the page initially loaded) — that entry corresponds to the
      // picker, which is also our initial useState value.
      const next = (e.state?.screen ?? { name: 'picker' }) as Screen;
      setScreen(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Inject <style id="tajweed-palette"> with one @font-palette-values
  // block per page-scoped tajweed font family.  Re-runs on every theme
  // change so the base-palette flips between dark (palette[0]) and
  // light (palette[2]) — without this the tajweed mushaf would render
  // with white base calligraphy on a light page (= invisible).
  useEffect(() => { applyPaletteToDocument(); }, [theme]);

  // Paint highlight CSS variables on first paint AND on every theme
  // change. Light themes force-resolve the highlight style to 'color'
  // regardless of the saved pref (glow on a near-white page reads as
  // smudge, not aurora) — so the resolved style depends on `theme` and
  // must re-run whenever it changes. applyHighlightVars(theme) writes
  // the data-highlight-style attribute and fires audio-prefs-changed
  // when the effective style flips, which lets useAyahGlow react.
  useEffect(() => { applyHighlightVars(theme); }, [theme]);

  // Sync native status bar (iOS + Android) к теме.  В вебе no-op.
  useEffect(() => { syncStatusBarToTheme(theme); }, [theme]);

  // Reset window scroll on every screen change. Without this the picker
  // (or azkar / bookmarks) opens at whatever scrollY the previous screen
  // was parked at — exactly the "I scrolled deep into a surah, hit back,
  // and the menu is also scrolled down" bug the user reported.
  // We deliberately skip this when navigating *into* a surah:
  // SurahScreen owns its own scroll position (it restores the last-read
  // ayah or the explicit `initialAyah` from bookmarks once the QCF feed
  // has rendered).  Letting this effect fire would race that restore.
  useEffect(() => {
    if (screen.name === 'surah') return;
    window.scrollTo(0, 0);
  }, [screen.name]);

  // Lock body scroll while the Azkar half of the picker pair is showing.
  // SurahPicker (the other half) renders 114 surahs and is tall enough
  // to stretch the shared 200%-wide slider container — without this
  // lock, the user can keep scrolling DOWN past AzkarScreen's short
  // content into the invisible bottom slice of the picker.  Restoring
  // overflow on cleanup keeps every other screen scrollable normally.
  useEffect(() => {
    if (screen.name !== 'azkar') return;
    const html = document.documentElement;
    const prev = html.style.overflowY;
    html.style.overflowY = 'hidden';
    return () => { html.style.overflowY = prev; };
  }, [screen.name]);

  // Surah reading screen opens "on top" — full-screen, no slide animation.
  if (screen.name === 'surah') {
    return (
      <>
        {isCosmic && <CosmicLayer />}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ErrorBoundary name="SurahScreen" onReset={goBack}>
            <SurahScreen
              surahNumber={screen.number}
              initialAyah={screen.initialAyah}
              theme={theme}
              setTheme={setTheme}
              onBack={goBack}
            />
          </ErrorBoundary>
        </div>
      </>
    );
  }

  // Bookmarks list opens "on top" the same way the surah feed does.
  if (screen.name === 'bookmarks') {
    return (
      <>
        {isCosmic && <CosmicLayer />}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ErrorBoundary name="BookmarksScreen" onReset={goBack}>
            <BookmarksScreen
              theme={theme}
              setTheme={setTheme}
              onBack={goBack}
              onOpen={(number, ayah) => navigate({ name: 'surah', number, initialAyah: ayah })}
            />
          </ErrorBoundary>
        </div>
      </>
    );
  }

  // Azkar category feed (Утренние / Вечерние) opens "on top" the same way
  // surah / bookmarks do. Back from here returns to the Azkar index, NOT
  // to the surah picker — the user is conceptually still in the Azkar tab.
  if (screen.name === 'azkar-category') {
    return (
      <>
        {isCosmic && <CosmicLayer />}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ErrorBoundary name="AzkarCategoryScreen" onReset={goBack}>
            <AzkarCategoryScreen
              category={screen.category}
              theme={theme}
              setTheme={setTheme}
              onBack={goBack}
            />
          </ErrorBoundary>
        </div>
      </>
    );
  }

  // Picker ↔ Azkar live as a horizontal pair with a slide transition.
  // The Azkar half stays mounted (and visible via translateX) even when
  // the user has navigated INTO a category — that's a separate full-screen
  // route above. So `isAzkar` here just means "currently showing Azkar
  // INDEX in the slide pair", which is true for both 'azkar' itself and
  // (when we briefly transition back) for 'picker' rendered on the left.
  const isAzkar = screen.name === 'azkar';

  return (
    <>
      {isCosmic && <CosmicLayer />}
      <div style={{
        overflowX: 'hidden',
        minHeight: '100dvh',
        position: 'relative',
        zIndex: 1,
      }}>
        <div
          style={{
            display: 'flex',
            width: '200%',
            transform: isAzkar ? 'translateX(-50%)' : 'translateX(0)',
            transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
          }}
        >
          <div style={{ width: '50%', flexShrink: 0 }}>
            <ErrorBoundary name="SurahPicker">
              <SurahPicker
                onSelectSurah={n => navigate({ name: 'surah', number: n })}
                onAzkar={() => navigate({ name: 'azkar' })}
                onBookmarks={() => navigate({ name: 'bookmarks' })}
                theme={theme}
                setTheme={setTheme}
              />
            </ErrorBoundary>
          </div>
          <div style={{ width: '50%', flexShrink: 0 }}>
            <ErrorBoundary name="AzkarScreen">
              <AzkarScreen
                theme={theme}
                setTheme={setTheme}
                onBack={goBack}
                onOpenCategory={(c) => navigate({ name: 'azkar-category', category: c })}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </>
  );
}
