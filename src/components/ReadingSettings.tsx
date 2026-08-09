import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ALL_THEMES, THEME_LABELS, type Theme } from '../hooks/useTheme';
import {
  LATIN_FONTS, ARABIC_FONTS, SCALE_OPTIONS, SCALE_FONT_PX,
  type LatinFontId, type ArabicFontId,
} from '../lib/typography';
import { RECITERS, type ReciterId } from '../lib/reciters';
import {
  getAutoScroll, setAutoScrollPref,
  getHighlightEnabled, setHighlightEnabled,
  getHighlightStyle, setHighlightStylePref, type HighlightStyle,
  getHighlightColor, setHighlightColorPref,
  HIGHLIGHT_COLORS, type HighlightColor,
  getGlowPalette, setGlowPalettePref, type GlowPalette,
  AURORA_PALETTES, GLOW_PALETTES_ORDER,
} from '../lib/audioPrefs';
// Раньше тут sync-импортился весь 10-МБ QURAN_SEGMENTS только ради
// проверки `!!QURAN_SEGMENTS[reciter]`.  Заменено на сет-константу
// в reciters.ts — тот же sync-чек, ноль bundle-overhead.
import { RECITERS_WITH_SEGMENTS } from '../lib/reciters';
import { Microphone } from './icons';
import { OfflineAudioCard } from './OfflineAudioCard';

const sectionTitle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.10em',
};

// ─── Shared bottom-sheet shell ────────────────────────────────────────────
//
// Both ThemeSettings and TypographySettings render inside the same
// bottom-anchored translucent sheet. Extracted here so the two
// menus stay visually identical and we only adjust the chrome in one
// place (border-radius, blur, drag-handle, close button, slide-in
// animation, edge-to-edge width on mobile).

type SheetPlacement = 'bottom-sheet' | 'top-popover';

export function SettingsSheet({
  onClose,
  children,
  placement = 'bottom-sheet',
  anchorEl,
}: {
  onClose: () => void;
  children: ReactNode;
  /** 'bottom-sheet' (default) — full-width pull-up on the bottom edge.
   *  'top-popover' — anchored top-right under the chrome, narrow card.
   *   Use top-popover when the trigger lives in the header (palette icon)
   *   so the menu reads as belonging to that button rather than as a
   *   modal overlay. */
  placement?: SheetPlacement;
  /** When provided (top-popover only), the sheet anchors directly under
   *  this element instead of the default top:60px right:12px slot.
   *  Required for the picker screen, where the trigger lives mid-page in
   *  the search row, not in a sticky header. Captured once on mount;
   *  scroll/resize updates re-read the rect so the popover stays glued. */
  anchorEl?: HTMLElement | null;
}) {
  // Both placements share the same React-state-driven entrance animation;
  // bottom-sheet additionally supports swipe-down dismissal. Top-popover
  // closes via backdrop tap only — drag-to-dismiss makes no sense for an
  // anchored card.
  const [open, setOpen]         = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY]       = useState(0);
  const dragStartY              = useRef<number | null>(null);
  const isBottom = placement === 'bottom-sheet';

  useEffect(() => {
    // rAF so the first paint commits the offscreen position before we
    // flip to `open`, otherwise React batches and the slide animation
    // never plays.
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isBottom) return;
    if (e.currentTarget.scrollTop > 0) return;
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isBottom || dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, dy));
  };

  const onTouchEnd = () => {
    if (!isBottom || dragStartY.current == null) return;
    if (dragY > 100) {
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
    setDragging(false);
  };

  // Track the anchor's viewport rect so the popover follows when the
  // user scrolls or rotates the device. We refresh on scroll/resize
  // rather than reading once on mount because mid-scroll close is fine
  // but a popover frozen 200px above its origin button is not.
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(() =>
    anchorEl ? anchorEl.getBoundingClientRect() : null,
  );
  useEffect(() => {
    if (!anchorEl) return;
    const update = () => setAnchorRect(anchorEl.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', update);
    };
  }, [anchorEl]);

  // Per-placement positioning. Bottom-sheet centres horizontally and
  // slides up from below. Top-popover sits under its anchor (or under
  // the sticky-header right slot when no anchor was passed) and slides
  // down from above.
  const positionStyles: React.CSSProperties = isBottom
    ? {
        left: '50%',
        bottom: '0',
        transform: `translate(-50%, ${!open ? '100%' : `${dragY}px`})`,
        width: 'min(480px, 100vw)',
        maxHeight: '70vh',
        borderTop: '1px solid var(--hairline)',
        borderRadius: '20px 20px 0 0',
        padding: '16px 16px max(12px, env(safe-area-inset-bottom)) 16px',
        boxShadow: 'rgba(0,0,0,0.08) 0 -2px 12px, rgba(0,0,0,0.18) 0 -16px 48px',
      }
    : anchorRect
    ? (() => {
        // Anchored directly under the trigger element. 8 px gap.
        //
        // Strategy: centre the panel horizontally on the screen,
        // opening just below the trigger button. Screen-centred is
        // more predictable than button-centred (buttons sit at various
        // x-positions in the header pill depending on content).
        const panelWidth = Math.min(380, window.innerWidth - 24);
        const left       = Math.round((window.innerWidth - panelWidth) / 2);
        return {
          top: `${anchorRect.bottom + 8}px`,
          left: `${left}px`,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-8px)',
          width: `${panelWidth}px`,
          maxHeight: `calc(100dvh - ${anchorRect.bottom + 24}px)`,
          border: '1px solid var(--hairline)',
          borderRadius: '16px',
          padding: '14px',
          boxShadow: 'rgba(0,0,0,0.06) 0 2px 8px, rgba(0,0,0,0.16) 0 16px 40px',
        };
      })()
    : {
        // Fallback: top-right slot under a presumed sticky header.
        top: '60px',
        right: '12px',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-8px)',
        width: 'min(380px, calc(100vw - 24px))',
        maxHeight: 'calc(100dvh - 80px)',
        border: '1px solid var(--hairline)',
        borderRadius: '16px',
        padding: '14px',
        boxShadow: 'rgba(0,0,0,0.06) 0 2px 8px, rgba(0,0,0,0.16) 0 16px 40px',
      };

  // Render through a portal mounted on document.body. Critical because
  // the parent of <SurahPicker> in App.tsx wraps the picker/azkar pair
  // in a `transform: translateX(...)` slide container — and CSS spec
  // says any ancestor with a non-`none` transform becomes the
  // containing block for `position: fixed` descendants. Without the
  // portal the sheet's `top:60px right:12px` anchors to the 200%-wide
  // slide container instead of the viewport, landing entirely off-
  // screen to the right. The portal escapes that ancestry so fixed
  // positioning resolves against the viewport as expected.
  return createPortal(
    <>
      {/* Click-catcher — fully transparent so the user can preview every
          setting change against the actual surah behind. */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />

      <div
        data-reading-sheet=""
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          position: 'fixed',
          zIndex: 40,
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          overflowY: 'auto',
          touchAction: 'pan-y',
          transition: dragging
            ? 'none'
            : 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease',
          ...positionStyles,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// ─── ThemeSettings — palette button (⊙) ───────────────────────────────────
//
// Выбор одной из трёх тем + настройка подсветки читаемого слова.
// В QuranIng здесь дополнительно жили панели «бумажные паттерны» для
// светлых тем и «атмосфера» для космических; вместе с самими темами
// они сняты — тема теперь не конструктор, а готовый вид.

type ThemeProps = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  onClose: () => void;
  /** Trigger button element — popover anchors directly under it.
   *  Required on screens where the trigger isn't in a sticky-header
   *  top-right slot (e.g. SurahPicker has the palette button mid-page
   *  in the search row). */
  anchorEl?: HTMLElement | null;
  /** Current reciter — needed by HighlightCard to gate the highlight
   *  controls behind reciters that ship word-level timing segments.
   *  Optional so callers that don't have an audio context (e.g. the
   *  picker's palette button) can omit it; HighlightCard is hidden in
   *  that case. */
  reciter?: ReciterId;
};

export function ThemeSettings(p: ThemeProps) {
  return (
    <SettingsSheet onClose={p.onClose} placement="top-popover" anchorEl={p.anchorEl}>
      <div style={{ display: 'grid', gap: '10px' }}>
        <ThemePicker theme={p.theme} setTheme={p.setTheme} />
        {p.reciter && <HighlightCard reciter={p.reciter} />}
      </div>
    </SettingsSheet>
  );
}

/**
 * Превью темы на карточке.
 *
 * Карточка не подписана цветом, а показывает уменьшённую сцену: канва
 * темы, строка «текста» её цветом чернил и — для «Авроры» — намёк на
 * сияние сверху плюс несколько звёзд.  Пользователь выбирает глазами,
 * а не читает ярлык.
 *
 * В QuranIng тут был грид из одиннадцати пресетов на четыре ряда с
 * отдельной функцией-диорамой на каждый; теперь тем три, и превью
 * описывается одной таблицей.
 */
const THEME_PREVIEW: Record<Theme, { canvas: string; ink: string; glow?: string }> = {
  light:  { canvas: '#ffffff', ink: '#111111' },
  dark:   { canvas: '#1a1a1c', ink: '#ececec' },
  aurora: {
    canvas: '#000000',
    ink: '#f4f4f5',
    // Тот же ледяной тон, что у AURORA_ICE.layer1, только приглушённый —
    // на карточке 96×64 полноценная яркость смотрелась бы кричаще.
    glow: 'radial-gradient(120% 80% at 50% 0%, rgba(120,200,240,0.55) 0%, rgba(120,200,240,0.16) 45%, transparent 75%)',
  },
};

function ThemePicker({ theme, setTheme }: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  return (
    <section>
      <p style={sectionTitle}>Оформление</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
      }}>
        {ALL_THEMES.map(id => {
          const preview = THEME_PREVIEW[id];
          const active = theme === id;
          return (
            <button
              key={id}
              onClick={() => setTheme(id)}
              aria-pressed={active}
              aria-label={THEME_LABELS[id]}
              style={{
                display: 'grid',
                gap: '6px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {/* Сцена-превью */}
              <span
                aria-hidden
                style={{
                  position: 'relative',
                  display: 'block',
                  height: '64px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: preview.canvas,
                  // Активная карточка обводится чернилами темы попапа, а
                  // не темы превью — иначе на белой карточке в тёмном
                  // интерфейсе обводка исчезает.
                  boxShadow: active
                    ? 'inset 0 0 0 2px var(--text-primary), 0 0 0 3px color-mix(in srgb, var(--ink) 12%, transparent)'
                    : 'inset 0 0 0 1px var(--hairline-strong)',
                  transition: 'box-shadow 140ms ease',
                }}
              >
                {preview.glow && (
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: preview.glow,
                  }} />
                )}
                {id === 'aurora' && (
                  <span style={{
                    position: 'absolute', inset: 0,
                    backgroundImage:
                      'radial-gradient(1.2px 1.2px at 22% 62%, rgba(255,255,255,0.9), transparent 100%),' +
                      'radial-gradient(1px 1px at 64% 48%, rgba(255,255,255,0.75), transparent 100%),' +
                      'radial-gradient(1.2px 1.2px at 82% 72%, rgba(255,255,255,0.85), transparent 100%),' +
                      'radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.7), transparent 100%)',
                  }} />
                )}
                {/* Три «строки текста» — дают почувствовать контраст
                    чернил на канве ещё до применения темы. */}
                <span style={{
                  position: 'absolute',
                  left: '10px', right: '10px', bottom: '12px',
                  display: 'grid', gap: '4px',
                }}>
                  {[100, 84, 62].map(w => (
                    <span key={w} style={{
                      display: 'block',
                      height: '3px',
                      width: `${w}%`,
                      borderRadius: '2px',
                      background: preview.ink,
                      opacity: w === 100 ? 0.85 : 0.45,
                    }} />
                  ))}
                </span>
              </span>

              <span style={{
                fontSize: '11.5px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                letterSpacing: '0.005em',
                lineHeight: 1,
              }}>
                {THEME_LABELS[id]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}


// ─── TypographySettings — `[A]` button ────────────────────────────────────
//
// Reciter picker + per-language tabs (Arabic / Russian) with
// visibility toggle, scale and font.

type TypographyProps = {
  reciter: ReciterId;
  setReciter: (v: ReciterId) => void;

  showArabic: boolean;
  setShowArabic: (v: boolean) => void;
  showRu: boolean;
  setShowRu: (v: boolean) => void;

  arabicScale: number;
  setArabicScale: (v: number) => void;
  ruScale: number;
  setRuScale: (v: number) => void;

  ruFont: LatinFontId;
  setRuFont: (v: LatinFontId) => void;
  arabicFont: ArabicFontId;
  setArabicFont: (v: ArabicFontId) => void;

  onClose: () => void;
  /** Trigger button element — popover anchors directly under it. */
  anchorEl?: HTMLElement | null;
};

type LangTab = 'arabic' | 'russian';

const KEY_LANG_TAB = 'typography.langTab';
function readLangTab(): LangTab {
  const v = localStorage.getItem(KEY_LANG_TAB);
  // Легаси-значение 'ingush' (из QuranIng) больше не существует — предикат
  // ниже отправит такого пользователя на вкладку арабского.
  return v === 'arabic' || v === 'russian' ? v : 'arabic';
}
function writeLangTab(v: LangTab) {
  localStorage.setItem(KEY_LANG_TAB, v);
}

export function TypographySettings(p: TypographyProps) {
  // Вкладка языка внутри блока «Текст и шрифты».
  // См. readLangTab() — почему выбор запоминается.
  const [tab, setTabS] = useState<LangTab>(readLangTab);
  const setTab = (v: LangTab) => { setTabS(v); writeLangTab(v); };

  return (
    // Same top-popover treatment as ThemeSettings — anchored under the
    // [A] button in the header. Keeps the menu visually paired with its
    // trigger and leaves the lower portion of the surah uncovered for
    // live preview of font / size changes.
    //
    // В QuranIng попап был разбит на две внешние вкладки «Текст / Чтец»,
    // потому что восемь чтецов в сетке 2×4 не помещались рядом с
    // типографикой на 4.7" экране.  Чтецов теперь два — они занимают
    // одну строку, и весь попап снова читается одним куском без
    // переключения вкладок.
    <SettingsSheet onClose={p.onClose} placement="top-popover" anchorEl={p.anchorEl}>
      {/* ── Чтец ───────────────────────────────────────────────────── */}
      <section style={settingCard}>
        <p style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Microphone size={13} />
          Чтец
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
        }}>
          {RECITERS.map(r => {
            const active = p.reciter === r.id;
            return (
              <button
                key={r.id}
                onClick={() => p.setReciter(r.id)}
                aria-pressed={active}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  minHeight: '38px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: `1px solid ${active ? 'var(--text-primary)' : 'var(--hairline)'}`,
                  background: active
                    ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                    : 'color-mix(in srgb, var(--ink) 3%, transparent)',
                  boxShadow: active ? 'inset 0 0 0 1px var(--text-primary)' : 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  overflow: 'hidden',
                  fontSize: '12px',
                  fontWeight: 500,
                  letterSpacing: '0.005em',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  transition: 'box-shadow 140ms ease, background 140ms ease',
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Офлайн-загрузка ────────────────────────────────────────── */}
      <OfflineAudioCard />

      {/* ── Текст и шрифты ─────────────────────────────────────────── */}
      <section style={{ ...settingCard, marginTop: '10px' }}>
        <p style={cardTitle}>Текст и шрифты</p>

        {/* Вкладки языка */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px',
          background: 'var(--bg)', border: '1px solid var(--hairline)',
          borderRadius: '10px', padding: '3px',
          marginBottom: '14px',
        }}>
          {([
            { id: 'arabic',  label: 'Арабский' },
            { id: 'russian', label: 'Русский'  },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                minHeight: '36px',
                padding: '9px 0', borderRadius: '7px',
                border: 'none',
                background: tab === t.id
                  ? 'color-mix(in srgb, var(--ink) 8%, var(--surface))'
                  : 'transparent',
                color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: tab === t.id ? 600 : 500,
                boxShadow: tab === t.id
                  ? 'inset 0 0 0 1.5px var(--text-primary), 0 0 0 3px color-mix(in srgb, var(--ink) 10%, transparent)'
                  : 'none',
                transition: 'box-shadow 140ms ease, background 140ms ease',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Тело активного языка */}
        {tab === 'arabic' && (
          <LangBody
            visible={p.showArabic}
            onToggleVisible={() => p.setShowArabic(!p.showArabic)}
            scale={p.arabicScale}
            onScale={p.setArabicScale}
            font={p.arabicFont}
            onFont={p.setArabicFont}
            options={ARABIC_FONTS}
            preview="بسم الله"
            dir="rtl"
          />
        )}
        {tab === 'russian' && (
          <LangBody
            visible={p.showRu}
            onToggleVisible={() => p.setShowRu(!p.showRu)}
            scale={p.ruScale}
            onScale={p.setRuScale}
            font={p.ruFont}
            onFont={p.setRuFont}
            options={LATIN_FONTS}
            preview="Благословен"
          />
        )}
      </section>

      {/* Автопрокрутка — глобальная настройка воспроизведения: лента
          сама доезжает до звучащего аята.  Стоит последней строкой,
          отдельно от карточек. */}
      <div style={{ marginTop: '10px' }}>
        <AutoScrollToggleRow />
      </div>

    </SettingsSheet>
  );
}

/** Mirror the live data-theme attribute on :root into React state so
 *  components inside the settings sheet can react to theme changes
 *  without prop-drilling. Updates synchronously on each attribute
 *  mutation via MutationObserver. */
function useRootDataTheme(): string {
  const [t, setT] = useState<string>(() =>
    document.documentElement.getAttribute('data-theme') ?? '',
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const next = document.documentElement.getAttribute('data-theme') ?? '';
      setT(prev => (prev === next ? prev : next));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, []);
  return t;
}

function HighlightCard({ reciter }: { reciter: ReciterId }) {
  const [on, setOnS]       = useState<boolean>(getHighlightEnabled);
  const [style, setStyleS] = useState<HighlightStyle>(getHighlightStyle);
  const [color, setColorS] = useState<HighlightColor>(getHighlightColor);
  const [glow,  setGlowS]  = useState<GlowPalette>(getGlowPalette);
  // Live theme — when it flips between light/dark/aurora we re-render
  // and either show or hide the style tabs. On the light theme glow is
  // force-resolved to color by audioPrefs anyway, so showing a
  // "Свечение" tab there would be a dead choice.
  const themeAttr = useRootDataTheme();
  const isLight = themeAttr === 'light';

  // Some reciters (Maher Al-Muaiqly) aren't on quran.com so we have no
  // word-level segments for them — show a notice instead of dead
  // controls. Detection is just "is the reciter bucket present in the
  // generated segments map?"
  const hasSegments = RECITERS_WITH_SEGMENTS.has(reciter);
  if (!hasSegments) {
    return (
      <section style={settingCard}>
        <p style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          У этого чтеца подсветка слов недоступна — quran.com не отдаёт
          тайминги для него. Выбери другого чтеца, чтобы включить подсветку.
        </p>
      </section>
    );
  }

  const onToggle = () => {
    const next = !on;
    setOnS(next);
    setHighlightEnabled(next);
  };
  const onPickColor = (c: HighlightColor) => {
    setColorS(c);
    setHighlightColorPref(c);
  };
  const onPickGlow = (p: GlowPalette) => {
    setGlowS(p);
    setGlowPalettePref(p);
  };
  const onPickStyle = (s: HighlightStyle) => {
    setStyleS(s);
    setHighlightStylePref(s);
  };
  return (
    // Секция-«футер»: никакого card-chrome (border / fill / большой
    // padding) — темы остаются основной площадью, подсветка
    // второстепенный регулятор.  Только hairline-разделитель сверху
    // для визуальной отбивки от грида пресетов.
    <section style={{
      paddingTop: '10px',
      borderTop: '1px solid var(--hairline)',
    }}>
      <div
        onClick={onToggle}
        role="button"
        aria-label="Подсветка читаемого слова"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          cursor: 'pointer',
          userSelect: 'none',
          marginBottom: on ? '8px' : 0,
        }}
      >
        {/* Uppercase eyebrow-label — даёт понять что это вспомогательная
            секция, не пункт первого уровня. */}
        <span style={{
          fontSize: '10.5px',
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          Подсветка слова
        </span>
        <Switch on={on} />
      </div>

      {on && (
        <>
          {/* Style tabs — only shown on dark/cosmic themes where both
              modes make visual sense. On light themes the glow effect
              is force-resolved to color (see audioPrefs.applyHighlightVars),
              so we hide the picker entirely and just show the colour
              swatches — same surface area as before the glow feature
              landed. */}
          {!isLight && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px',
              background: 'var(--bg)', border: '1px solid var(--hairline)',
              borderRadius: '10px', padding: '3px',
              marginBottom: '12px',
            }}>
              {([
                { id: 'color', label: 'Цвет'     },
                { id: 'glow',  label: 'Свечение' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => onPickStyle(t.id)}
                  style={{
                    minHeight: '32px',
                    padding: '7px 0', borderRadius: '7px',
                    border: 'none',
                    background: style === t.id
                      ? 'color-mix(in srgb, var(--ink) 8%, var(--surface))'
                      : 'transparent',
                    color: style === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    fontWeight: style === t.id ? 600 : 500,
                    boxShadow: style === t.id
                      ? 'inset 0 0 0 1.5px var(--text-primary), 0 0 0 3px color-mix(in srgb, var(--ink) 10%, transparent)'
                      : 'none',
                    transition: 'box-shadow 140ms ease, background 140ms ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {(isLight || style === 'color') && (
            // 6 colour swatches — same compact row as before.
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '6px',
            }}>
              {HIGHLIGHT_COLORS.map(c => {
                const active = color === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onPickColor(c.id)}
                    aria-label={c.label}
                    title={c.label}
                    style={{
                      minHeight: '24px',
                      height: '24px',
                      border: `1px solid ${active ? 'var(--text-primary)' : 'rgba(0,0,0,0.18)'}`,
                      background: c.swatch,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      padding: 0,
                      boxShadow: active
                        ? 'inset 0 0 0 2px var(--text-primary)'
                        : 'none',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  />
                );
              })}
            </div>
          )}

          {!isLight && style === 'glow' && (
            // 6 glow-palette swatches. Each chip is taller (32px) than
            // the colour swatches so the radial-gradient inside can
            // breathe — a 24px flat-paint square is enough for a hue,
            // but a glow halo needs a bit more canvas to read as one.
            // The chip preview is the palette's own ayahGlow gradient
            // on a dark backdrop so the user sees the actual visual,
            // not just the swatch hex. Hidden on light themes where
            // glow is force-resolved away — see the !isLight tab gate.
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '6px',
            }}>
              {GLOW_PALETTES_ORDER.map(id => {
                const pal = AURORA_PALETTES[id];
                const active = glow === id;
                return (
                  <button
                    key={id}
                    onClick={() => onPickGlow(id)}
                    aria-label={pal.label}
                    title={pal.label}
                    style={{
                      minHeight: '32px',
                      height: '32px',
                      border: `1px solid ${active ? 'var(--text-primary)' : 'rgba(0,0,0,0.18)'}`,
                      // Dark backdrop with the palette's own
                      // radial-gradient layered on top — closest
                      // miniature of how the glow reads at runtime.
                      background: `${pal.ayahGlow}, #14141c`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      padding: 0,
                      boxShadow: active
                        ? 'inset 0 0 0 2px var(--text-primary)'
                        : 'none',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AutoScrollToggleRow() {
  const [on, setOn] = useState<boolean>(getAutoScroll);
  const onToggle = () => {
    const next = !on;
    setOn(next);
    setAutoScrollPref(next);
  };
  return (
    <div
      onClick={onToggle}
      role="button"
      aria-label="Автопрокрутка при чтении"
      style={{
        ...settingCard,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        letterSpacing: '0.005em',
      }}>
        Автопрокрутка при чтении
      </span>
      <Switch on={on} />
    </div>
  );
}

// Card chrome shared by all settings sections — frame each visually
// distinct group so the dense menu reads as a stack of related panels
// rather than one wall of controls.
export const settingCard: CSSProperties = {
  border: '1px solid var(--hairline)',
  borderRadius: '14px',
  background: 'color-mix(in srgb, var(--ink) 3%, transparent)',
  padding: '14px',
};

export const cardTitle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.10em',
};

// ─── Internal helper components ───────────────────────────────────────────

export function Switch({ on }: { on: boolean }) {
  return (
    <span style={{
      position: 'relative', display: 'inline-block',
      width: '30px', height: '17px', borderRadius: '999px',
      background: on ? 'var(--text-primary)' : 'var(--hairline-strong)',
      transition: 'background 0.18s ease',
      flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: '2px',
        left: on ? '15px' : '2px',
        width: '13px', height: '13px', borderRadius: '50%',
        background: 'var(--surface)', transition: 'left 0.18s ease',
      }} />
    </span>
  );
}

export function ScalePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
      {SCALE_OPTIONS.map((s, i) => {
        const active = Math.abs(value - s.value) < 0.01;
        return (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            style={{
              minHeight: '48px',
              padding: '10px 0',
              borderRadius: '12px',
              border: `1px solid ${active ? 'var(--text-primary)' : 'var(--hairline)'}`,
              background: active
                ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                : 'color-mix(in srgb, var(--ink) 3%, transparent)',
              boxShadow: active ? 'inset 0 0 0 1px var(--text-primary)' : 'none',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: `${SCALE_FONT_PX[i]}px`,
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function FontChips<T extends string>({
  value, options, onChange, preview, dir = 'ltr',
}: {
  value: T;
  options: { id: T; label: string; stack: string; weight?: number }[];
  onChange: (v: T) => void;
  preview: string;
  dir?: 'ltr' | 'rtl';
}) {
  // Equal-width grid so every font gets the same airtime — horizontal
  // scroll hid Plex behind the edge fade and made it feel like a
  // second-class option. 2 cols for Arabic (qpc + nastaleeq), 3 cols
  // for Latin (inter-semibold + inter-regular + plex). The preview
  // glyphs are now the dominant visual; the label sits below as a
  // muted caption, mirroring how the theme-preset cards put the
  // colour first and the label second.
  const cols = options.length >= 3 ? 3 : 2;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '6px',
    }}>
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              minHeight: '64px',
              padding: '10px 8px',
              borderRadius: '12px',
              border: `1px solid ${active ? 'var(--text-primary)' : 'var(--hairline)'}`,
              background: active
                ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                : 'color-mix(in srgb, var(--ink) 3%, transparent)',
              boxShadow: active ? 'inset 0 0 0 1px var(--text-primary)' : 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              overflow: 'hidden',
            }}
          >
            <span
              dir={dir}
              style={{
                fontFamily: opt.stack,
                fontSize: '17px',
                fontWeight: opt.weight ?? 400,
                color: 'var(--text-primary)',
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {preview}
            </span>
            <span style={{
              fontSize: '9px',
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: 500,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              textTransform: 'uppercase',
            }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}


/** Per-language settings body.  `font/onFont/options` are optional so
 *  the Arabic tab can omit the font-picker (Arabic is rendered through
 *  QCF V4 PUA glyphs and has no user-pickable family any more — the
 *  three legacy web-fonts were removed). */
export function LangBody<T extends string>({
  visible, onToggleVisible, scale, onScale, font, onFont, options, preview, dir = 'ltr',
}: {
  visible: boolean;
  onToggleVisible: () => void;
  scale: number;
  onScale: (v: number) => void;
  font?: T;
  onFont?: (v: T) => void;
  options?: { id: T; label: string; stack: string; weight?: number }[];
  preview?: string;
  dir?: 'ltr' | 'rtl';
}) {
  const hasFontPicker = !!font && !!onFont && !!options && !!preview;
  return (
    <div>
      <div
        onClick={onToggleVisible}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}>
          {visible ? 'Видно' : 'Скрыто'}
        </span>
        <Switch on={visible} />
      </div>

      {/* Font picker above Size — the choice of font reshapes the
          page more dramatically than the size step, so it reads as
          the primary control and Size sits beneath it as a quick
          adjustment of the chosen face. */}
      {hasFontPicker && (
        <>
          <p style={sectionTitle}>Шрифт</p>
          <FontChips value={font!} options={options!} onChange={onFont!} preview={preview!} dir={dir} />
        </>
      )}

      <div style={{ marginTop: hasFontPicker ? '12px' : 0 }}>
        <p style={sectionTitle}>Размер</p>
        <ScalePicker value={scale} onChange={onScale} />
      </div>
    </div>
  );
}
