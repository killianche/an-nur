import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { type Theme } from '../hooks/useTheme';
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
import {
  PRESETS, getActivePreset, applyPreset, type ThemePresetId,
  PRESET_HIGHLIGHT_OPTIONS, type HighlightChoice,
} from '../lib/themePresets';
// Раньше тут sync-импортился весь 10-МБ QURAN_SEGMENTS только ради
// проверки `!!QURAN_SEGMENTS[reciter]`.  Заменено на сет-константу
// в reciters.ts — тот же sync-чек, ноль bundle-overhead.
import { RECITERS_WITH_SEGMENTS } from '../lib/reciters';
import { Microphone } from './icons';

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
// Holds Theme picker (Light / Dark / Cosmic + variants) + the mode-specific
// follow-up panels (Paper textures for light, Atmosphere for cosmic). All
// look-and-feel lives here.

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
  // Лифтнул activePresetId сюда из PresetGrid — теперь HighlightCard
  // тоже видит выбранный пресет и адаптирует UI (некоторые пресеты
  // ограничены парой-тройкой подсветок, см. PRESET_HIGHLIGHT_OPTIONS).
  const [activePresetId, setActivePresetId] = useState<ThemePresetId | null>(getActivePreset);
  return (
    <SettingsSheet onClose={p.onClose} placement="top-popover" anchorEl={p.anchorEl}>
      <div style={{ display: 'grid', gap: '10px' }}>
        <PresetGrid
          setTheme={p.setTheme}
          onClose={p.onClose}
          activeId={activePresetId}
          setActiveId={setActivePresetId}
        />
        {p.reciter && <HighlightCard reciter={p.reciter} activePresetId={activePresetId} />}
      </div>
    </SettingsSheet>
  );
}

/** Perceived luminance — picks light text for dark backgrounds and v.v. */
function isDarkHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

/** Per-preset background — each card paints a tiny diorama of the
 *  theme it applies, so the user sees what they're picking instead of
 *  reading a label.  Plain swatches are flat; gridded uses a CSS
 *  hairline pattern; cosmic uses fake star dots; aurora uses a
 *  vertical gradient. */
function presetCardBg(id: ThemePresetId, top: string, bottom: string): CSSProperties {
  switch (id) {
    case 'white-plain':
      return { background: top };
    case 'cream-paper':
      return { background: top };
    case 'emerald':
      // «Изумруд» — изумрудная канва + spotlight сверху + тёплый
      // янтарный pool в правом-нижнем углу (мини-копия body-правила,
      // с изюминкой контрастного warm-света).
      return {
        background: top,
        backgroundImage:
          // Spotlight сверху-центра
          'radial-gradient(120% 60% at 50% 0%,' +
          ' rgba(255,255,255,0.20) 0%,' +
          ' rgba(255,255,255,0.06) 35%,' +
          ' transparent 70%),' +
          // Янтарный warm-pool в правом-нижнем углу
          ' radial-gradient(80% 80% at 100% 100%,' +
          ' rgba(255,200,120,0.18) 0%,' +
          ' transparent 55%)',
      };
    case 'reverie':
      // «Грёза» — миднайт-нэйви канва + 3 размытых синих cloud-blob'а
      // в разных позициях, мини-копия full-screen body-правила.
      return {
        background: top,
        backgroundImage:
          'radial-gradient(circle at 25% 70%, rgba(80,130,200,0.42)  0%, transparent 40%),' +
          ' radial-gradient(circle at 75% 25%, rgba(110,150,220,0.32) 0%, transparent 35%),' +
          ' radial-gradient(circle at 50% 105%, rgba(70,110,190,0.25) 0%, transparent 45%)',
      };
    case 'velvet':
      // «Бархат» — wine-канва + вертикальная пинстрайп-текстура
      // («велюровый занавес»), мини-копия body-правила.  Stripes
      // плотнее (4 px шаг) чтобы текстура читалась в 58-px
      // карточке.
      return {
        background: top,
        backgroundImage:
          'repeating-linear-gradient(90deg,' +
          ' rgba(232,201,160,0.08) 0px,' +
          ' rgba(232,201,160,0.08) 1px,' +
          ' transparent 1px,' +
          ' transparent 4px)',
      };
    case 'dark-plain':
      return { background: top };
    case 'dark-graphite':
      return { background: top };
    case 'gray-grid':
      return {
        background: top,
        backgroundImage:
          'linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px),' +
          ' linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)',
        backgroundSize: '8px 8px',
      };
    case 'cosmic-warp':
      return {
        background: '#0a0a14',
        backgroundImage:
          'radial-gradient(1px 1px at 22% 28%, rgba(255,255,255,0.85), transparent 60%),' +
          ' radial-gradient(1px 1px at 68% 62%, rgba(221,224,255,0.75), transparent 60%),' +
          ' radial-gradient(1px 1px at 48% 84%, rgba(255,255,255,0.6),  transparent 60%),' +
          ' radial-gradient(1px 1px at 86% 24%, rgba(221,224,255,0.65), transparent 60%),' +
          ' radial-gradient(1px 1px at 12% 70%, rgba(255,255,255,0.5),  transparent 60%)',
      };
    case 'aurora-ice':
      return {
        background: `linear-gradient(180deg, ${top} 0%, #1a4f80 55%, ${bottom} 100%)`,
      };
    case 'aurora-mint-frame':
      // Превью frame-эффекта самой авроры (Aurora.tsx, ветка
      // direction='frame'): 4 узких градиента-ободка по краям из мяты,
      // быстро тающие к центру, поверх — звёзды и тёмно-зелёная канва.
      // Карточка читается как «фон будущей темы прямо сейчас».
      return {
        background: top,
        backgroundImage:
          // 4 «mist»-ободка от каждого края.  Сильное у кромки (alpha
          // 0.55), быстрый спад к ~30% — оставляет центр прозрачным
          // под звёздами, как и настоящий frame в Aurora.tsx.
          'linear-gradient(to bottom, rgba(72,190,170,0.55) 0%, rgba(72,190,170,0.20) 18%, transparent 32%),' +
          ' linear-gradient(to top,    rgba(72,190,170,0.55) 0%, rgba(72,190,170,0.20) 18%, transparent 32%),' +
          ' linear-gradient(to right,  rgba(72,190,170,0.40) 0%, rgba(72,190,170,0.14) 14%, transparent 26%),' +
          ' linear-gradient(to left,   rgba(72,190,170,0.40) 0%, rgba(72,190,170,0.14) 14%, transparent 26%),' +
          // Звёзды в центре — даёт сигнал «космос», а не «светлая тема».
          ' radial-gradient(1px 1px at 22% 28%, rgba(255,255,255,0.85), transparent 60%),' +
          ' radial-gradient(1px 1px at 68% 62%, rgba(180,255,220,0.75), transparent 60%),' +
          ' radial-gradient(1px 1px at 48% 84%, rgba(255,255,255,0.6),  transparent 60%),' +
          ' radial-gradient(1px 1px at 86% 24%, rgba(180,255,220,0.65), transparent 60%),' +
          ' radial-gradient(1px 1px at 12% 70%, rgba(255,255,255,0.5),  transparent 60%)',
        // Дополнительный мягкий inset-halo для глубины (3 слоя),
        // чтобы кромка ощущалась как свечение, а не как обведённая
        // линия.  Чуть-чуть «дышит» внутрь.
        boxShadow:
          'inset 0 0 10px 2px rgba(72,190,170,0.45),' +
          ' inset 0 0 24px 8px rgba(72,190,170,0.22),' +
          ' inset 0 0 44px 16px rgba(72,190,170,0.10)',
      };
  }
}

function PresetGrid({ setTheme, onClose, activeId, setActiveId }: {
  setTheme: (t: Theme) => void;
  onClose: () => void;
  activeId: ThemePresetId | null;
  setActiveId: (id: ThemePresetId | null) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      // 3 колонки (по запросу пользователя): ширина шита не меняется,
      // сами карточки становятся уже.  На 380-px sheet'е это даёт
      // ~108 px на карточку — этого хватает для самых длинных лейблов
      // («Аврора II»).  Min-height у карточек оставлен 58 px, чтобы
      // сигнатура свотча оставалась читаемой.
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '6px',
    }}>
      {PRESETS.map(preset => {
        const active = activeId === preset.id;
        const dark = isDarkHex(preset.swatchTop);
        return (
          <button
            key={preset.id}
            onClick={() => {
              applyPreset(preset, setTheme);
              setActiveId(preset.id);
              // Brief delay so the user sees the card flash into the
              // "active" state (heavier border + ring) before the sheet
              // dismisses — without it the close animation eats the
              // confirmation feedback and the click feels uncertain.
              setTimeout(onClose, 140);
            }}
            aria-label={preset.label}
            style={{
              ...presetCardBg(preset.id, preset.swatchTop, preset.swatchBottom),
              minHeight: '58px',
              // Label sits in the bottom-left corner of the card so the
              // colour preview gets the full top region — mirrors how
              // macOS / iOS theme pickers position the title.
              padding: '6px 8px',
              borderRadius: '10px',
              // Subtle hairline so a pure-white card still has an edge
              // against the menu's translucent panel; thicker accent
              // ring when active.
              border: `1px solid ${active ? 'var(--text-primary)' : 'rgba(0,0,0,0.18)'}`,
              boxShadow: active
                ? 'inset 0 0 0 2px var(--text-primary)'
                : 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-start',
            }}
          >
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: dark ? 'rgba(255,255,255,0.94)' : 'rgba(0,0,0,0.82)',
              textShadow: dark
                ? '0 1px 2px rgba(0,0,0,0.45)'
                : '0 1px 1px rgba(255,255,255,0.5)',
              letterSpacing: '0.005em',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              {preset.label}
            </span>
          </button>
        );
      })}
    </div>
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

// Outer (section) tab — splits the dense settings sheet into two
// focused panes so the user doesn't have to scroll past everything on
// small phones. Reciter / Text. (The third "Подсветка" pane moved to
// the Theme popover — it's a visual-look knob.)
// Persisted so reopening the menu lands on the same pane the user was
// last tweaking, mirroring how the inner language tab is persisted.
type OuterTab = 'reciter' | 'text';
const KEY_OUTER_TAB = 'typography.outerTab';
function readOuterTab(): OuterTab {
  const v = localStorage.getItem(KEY_OUTER_TAB);
  // Legacy 'playback' values from before the Подсветка-move fall back
  // to 'text' (the new default) via the predicate.
  return v === 'reciter' || v === 'text' ? v : 'text';
}
function writeOuterTab(v: OuterTab) {
  localStorage.setItem(KEY_OUTER_TAB, v);
}

export function TypographySettings(p: TypographyProps) {
  // Inner language tab — Arabic / Russian inside the "Text" pane.
  // See readLangTab() for persistence rationale.
  const [tab, setTabS] = useState<LangTab>(readLangTab);
  const setTab = (v: LangTab) => { setTabS(v); writeLangTab(v); };

  // Outer pane tab — picks which of the three section groups is shown.
  // Default 'text' because it's the most-edited surface (the user
  // changes font / size more often than reciter or playback prefs).
  const [outerTab, setOuterTabS] = useState<OuterTab>(readOuterTab);
  const setOuterTab = (v: OuterTab) => { setOuterTabS(v); writeOuterTab(v); };

  return (
    // Same top-popover treatment as ThemeSettings — anchored under the
    // [A] button in the header. Keeps the menu visually paired with its
    // trigger and leaves the lower portion of the surah uncovered for
    // live preview of font / size changes.
    <SettingsSheet onClose={p.onClose} placement="top-popover" anchorEl={p.anchorEl}>
      {/* ── Outer tabs ──────────────────────────────────────────────────
          One pane visible at a time keeps the sheet short enough to
          read on a 4.7" phone without scrolling. Visual pattern matches
          the inner language-tab segmented control below so the two
          levels read as the same component family. */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px',
        background: 'var(--bg)', border: '1px solid var(--hairline)',
        borderRadius: '10px', padding: '3px',
        marginBottom: '10px',
      }}>
        {/* Tab order: Text first, Reciter second — text/font settings
            are touched far more often than reciter, so the user lands
            on them by default and reaches Reciter with one tap.  The
            mic glyph on Reciter doubles as a visual cue that this tab
            is for voice/audio rather than another typography knob. */}
        {([
          { id: 'text',    label: 'Текст', icon: null  },
          { id: 'reciter', label: 'Чтец',  icon: 'mic' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setOuterTab(t.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '36px',
              padding: '9px 0', borderRadius: '7px',
              border: 'none',
              background: outerTab === t.id
                ? 'color-mix(in srgb, var(--ink) 8%, var(--surface))'
                : 'transparent',
              color: outerTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: outerTab === t.id ? 600 : 500,
              boxShadow: outerTab === t.id
                ? 'inset 0 0 0 1.5px var(--text-primary), 0 0 0 3px color-mix(in srgb, var(--ink) 10%, transparent)'
                : 'none',
              transition: 'box-shadow 140ms ease, background 140ms ease',
            }}
          >
            {t.icon === 'mic' && (
              <Microphone size={14} />
            )}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pane: Reciter ──────────────────────────────────────────────
          2-column compact grid. Latin transliteration only — Arabic
          calligraphy added per-card visual richness but doubled the
          height of every chip; the user is picking by familiar Latin
          name anyway, so the bilingual block was decoration tax. */}
      {outerTab === 'reciter' && (
        <section style={settingCard}>
          <p style={cardTitle}>Чтец</p>
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    minHeight: '36px',
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
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Pane: Text & fonts ────────────────────────────────────────── */}
      {outerTab === 'text' && (
        <section style={settingCard}>
          <p style={cardTitle}>Текст и шрифты</p>

          {/* Inner language tabs */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px',
            background: 'var(--bg)', border: '1px solid var(--hairline)',
            borderRadius: '10px', padding: '3px',
            marginBottom: '14px',
          }}>
            {([
              { id: 'arabic',  label: 'Арабский'   },
              { id: 'russian', label: 'Русский'    },
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

          {/* Active language body */}
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
      )}

      {/* Auto-scroll toggle — meaningful for BOTH panes.  The setting
          itself is global (controls how the reading view follows
          playback through the ayah feed), and conceptually belongs
          alongside the reciter (it's "what happens during playback")
          as much as alongside the text/fonts.  Shown as a sibling row
          beneath whichever pane is open so the user always has access
          to it from settings, not buried in just one tab. */}
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

function HighlightCard({ reciter, activePresetId }: { reciter: ReciterId; activePresetId: ThemePresetId | null }) {
  const [on, setOnS]       = useState<boolean>(getHighlightEnabled);
  const [style, setStyleS] = useState<HighlightStyle>(getHighlightStyle);
  const [color, setColorS] = useState<HighlightColor>(getHighlightColor);
  const [glow,  setGlowS]  = useState<GlowPalette>(getGlowPalette);
  // Live theme — when it flips between light/dark/cosmic we re-render
  // and either show or hide the style tabs. On light themes glow is
  // force-resolved to color by audioPrefs anyway, so showing a
  // "Свечение" tab there would be a dead choice.
  const themeAttr = useRootDataTheme();
  const isLight = themeAttr.startsWith('light');

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
  // Constrained-preset handler: один клик задаёт style и color/palette.
  const onPickChoice = (c: HighlightChoice) => {
    if (c.kind === 'color') {
      setStyleS('color'); setHighlightStylePref('color');
      setColorS(c.color); setHighlightColorPref(c.color);
    } else {
      setStyleS('glow');     setHighlightStylePref('glow');
      setGlowS(c.palette);   setGlowPalettePref(c.palette);
    }
  };

  // Узкий набор для текущего пресета (если он есть в карте).
  const constrainedOptions = activePresetId != null ? PRESET_HIGHLIGHT_OPTIONS[activePresetId] : undefined;
  const isChoiceActive = (c: HighlightChoice) =>
    c.kind === 'color' ? (style === 'color' && color === c.color)
                       : (style === 'glow'  && glow  === c.palette);

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

      {on && constrainedOptions && (
        // Чипы ещё мельче — 24-px высота, свотч-точка 12-px, текст 11-px.
        // Auto-fit grid, min-width 78-px.
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))',
          gap: '4px',
        }}>
          {constrainedOptions.map((c, i) => {
            const active = isChoiceActive(c);
            const label = c.kind === 'color'
              ? HIGHLIGHT_COLORS.find(x => x.id === c.color)!.label
              : AURORA_PALETTES[c.palette].label;
            const swatchBg = c.kind === 'color'
              ? HIGHLIGHT_COLORS.find(x => x.id === c.color)!.swatch
              : `${AURORA_PALETTES[c.palette].ayahGlow}, #14141c`;
            return (
              <button
                key={i}
                onClick={() => onPickChoice(c)}
                aria-label={label}
                title={label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 7px 0 5px',
                  height: '24px',
                  border: 'none',
                  background: active
                    ? 'color-mix(in srgb, var(--ink) 7%, transparent)'
                    : 'transparent',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'background 140ms ease, color 140ms ease',
                  textAlign: 'left',
                }}
              >
                <span aria-hidden style={{
                  flexShrink: 0,
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: swatchBg,
                  boxShadow: active
                    ? '0 0 0 1.5px var(--text-primary)'
                    : 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent)',
                  transition: 'box-shadow 140ms ease',
                }} />
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {on && !constrainedOptions && (
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
