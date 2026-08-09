/**
 * themePresets — opinionated reading-mode bundles.
 *
 * Each preset writes a coordinated set of values across useTheme,
 * lightBg, and cosmic. The user picks one card; we don't expose the
 * underlying knobs in the UI any more (per "просто 6 кнопок и всё").
 */

import { type Theme } from '../hooks/useTheme';
import {
  setLightBgPattern, setLightBgOpacity,
} from './lightBg';
import {
  setStarsEnabled, setStarsMode, setStarsSpeed,
  setAuroraEnabled, setAuroraPalette, setAuroraDirection, setAuroraBrightness,
} from './cosmic';
import {
  setHighlightStylePref, setHighlightColorPref, setGlowPalettePref,
  type HighlightColor, type GlowPalette,
} from './audioPrefs';
import { setWallpaper } from './wallpaper';
import { dispatchCosmicChanged } from '../components/CosmicLayer';

export type ThemePresetId =
  | 'white-plain'
  | 'gray-grid'
  | 'dark-plain'
  | 'dark-graphite'
  | 'cosmic-warp'
  | 'aurora-ice'
  | 'aurora-mint-frame'
  | 'cream-paper'
  | 'emerald'
  | 'reverie'
  | 'velvet';

export type ThemePreset = {
  id: ThemePresetId;
  label: string;
  /** Two colours used to paint the preset card's swatch (top half / bottom half). */
  swatchTop: string;
  swatchBottom: string;
  /** What we set on click. */
  apply: (setTheme: (t: Theme) => void) => void;
};

const KEY_PRESET = 'theme.preset';

export function getActivePreset(): ThemePresetId | null {
  const v = localStorage.getItem(KEY_PRESET);
  return v && PRESETS.some(p => p.id === v) ? (v as ThemePresetId) : null;
}

/**
 * Per-preset highlight constraints — некоторые пресеты тем подгоняют
 * палитру так, что часть color/glow-вариантов выглядит абсурдно
 * (зелёный glow на wine-канве, синий цвет на cream-бумаге и т.д.).
 * Для таких пресетов в UI раскрывается узкий flat-ряд кнопок (см.
 * HighlightCard в ReadingSettings).
 *
 * ВАЖНО: порядок имеет значение.  Glow-варианты идут первыми; при
 * выборе пресета applyPreset() авто-применяет первую опцию из списка,
 * так что тёмные/космические темы по умолчанию открываются в
 * glow-режиме (на тёмной канве свечение читается намного лучше плоского
 * цвета).  Светлые темы glow не имеют — для них всегда color.
 */
export type HighlightChoice =
  | { kind: 'color'; color: HighlightColor }
  | { kind: 'glow';  palette: GlowPalette };

export const PRESET_HIGHLIGHT_OPTIONS: Partial<Record<ThemePresetId, HighlightChoice[]>> = {
  // Светлые — только color (glow на белой бумаге читается как грязь).
  'white-plain':       [{ kind: 'color', color: 'rose' }, { kind: 'color', color: 'teal' }],
  'gray-grid':         [{ kind: 'color', color: 'rose' }, { kind: 'color', color: 'teal' }],
  'cream-paper':       [{ kind: 'color', color: 'amber' }],
  // Тёмные / космические — glow первым (более выразительно на тёмной канве).
  'dark-graphite':     [
    { kind: 'glow',  palette: 'ice' },
    { kind: 'color', color: 'teal' },
    { kind: 'color', color: 'green' },
  ],
  'velvet':            [{ kind: 'glow',  palette: 'rose' }],
  'cosmic-warp':       [
    { kind: 'glow',  palette: 'ice' },
    { kind: 'glow',  palette: 'violet' },
    { kind: 'color', color: 'green' },
    { kind: 'color', color: 'blue' },
  ],
  'aurora-ice':        [
    { kind: 'glow',  palette: 'ice' },
    { kind: 'glow',  palette: 'violet' },
    { kind: 'color', color: 'green' },
    { kind: 'color', color: 'blue' },
  ],
  'aurora-mint-frame': [
    { kind: 'glow',  palette: 'mint' },
    { kind: 'color', color: 'green' },
  ],
};

export function applyPreset(p: ThemePreset, setTheme: (t: Theme) => void) {
  localStorage.setItem(KEY_PRESET, p.id);
  p.apply(setTheme);
  // Авто-применение first highlight choice для constrained-пресетов.
  // Темы без записи в карте (Чёрная, Изумруд, Грёза) сохраняют
  // текущую пользовательскую подсветку — там полный UI с тaбами.
  const opts = PRESET_HIGHLIGHT_OPTIONS[p.id];
  if (opts && opts.length > 0) {
    const first = opts[0];
    if (first.kind === 'color') {
      setHighlightStylePref('color');
      setHighlightColorPref(first.color);
    } else {
      setHighlightStylePref('glow');
      setGlowPalettePref(first.palette);
    }
  }
}

// Порядок пресетов = порядок отображения в PresetGrid (3 колонки → 4 ряда).
// Сгруппировано по визуальным семьям, по запросу пользователя:
//   Ряд 1 (светлые):       Белая    | Клетка   | Бежевый
//   Ряд 2 (тёмные базовые): Чёрная   | Графит   | Бархат   (warm wine — на месте бывшего «Какао»)
//   Ряд 3 (космические):   Космос   | Аврора   | Аврора II
//   Ряд 4 (модный дом):    Сафьян   | Изумруд  | Грёза
export const PRESETS: ThemePreset[] = [
  // ── Ряд 1: светлые ──────────────────────────────────────────
  {
    id: 'white-plain',
    label: 'Белая',
    swatchTop:    '#ffffff',
    swatchBottom: '#000000',
    apply: setTheme => {
      setTheme('light-white');
      setLightBgPattern('plain');
      setLightBgOpacity(2);
      setWallpaper('none');
    },
  },
  {
    id: 'gray-grid',
    label: 'Клетка',
    swatchTop:    '#f5f5f4',
    swatchBottom: '#1c1917',
    apply: setTheme => {
      setTheme('light-warm-gray');
      setLightBgPattern('grid');
      setLightBgOpacity(3);
      setWallpaper('none');
    },
  },
  {
    id: 'cream-paper',
    label: 'Бежевый',
    swatchTop:    '#faf6ee',
    swatchBottom: '#2a1d11',
    apply: setTheme => {
      setTheme('light-cream');
      setLightBgPattern('plain');
      setLightBgOpacity(2);
      setWallpaper('none');
    },
  },

  // ── Ряд 2: тёмные базовые ───────────────────────────────────
  {
    id: 'dark-plain',
    label: 'Чёрная',
    swatchTop:    '#0f0f0f',
    swatchBottom: '#ffffff',
    apply: setTheme => {
      setTheme('dark-pure');
      setWallpaper('none');
    },
  },
  {
    id: 'dark-graphite',
    label: 'Графит',
    swatchTop:    '#202126',
    swatchBottom: '#e8e9ea',
    apply: setTheme => {
      setTheme('dark-graphite');
      setWallpaper('none');
    },
  },
  {
    // «Бархат» — по фото-референсу «VIP / Welcome».  Wine-бургунди +
    // champagne-gold + вертикальная пинстрайп-текстура (велюровый
    // занавес).  Cartier red + gold / театральная VIP-ложа.  Поставлен
    // в слот бывшего «Какао» как самый «warm dark» из новых — заполняет
    // тот же тёплый-тёмный нишу.
    id: 'velvet',
    label: 'Бархат',
    swatchTop:    '#3a1620',
    swatchBottom: '#e8c9a0',
    apply: setTheme => {
      setTheme('dark-velvet');
      setWallpaper('none');
    },
  },

  // ── Ряд 3: космические ──────────────────────────────────────
  {
    id: 'cosmic-warp',
    label: 'Космос',
    swatchTop:    '#0a0a14',
    swatchBottom: '#dde0ff',
    apply: setTheme => {
      setTheme('cosmic-night');
      setStarsEnabled(true);
      setStarsMode('warp');
      setStarsSpeed(1.5);
      setAuroraEnabled(false);
      setWallpaper('none');
      dispatchCosmicChanged();
    },
  },
  {
    id: 'aurora-ice',
    label: 'Аврора',
    swatchTop:    '#0a1428',
    swatchBottom: '#88d2ff',
    apply: setTheme => {
      setTheme('cosmic-night');
      setStarsEnabled(true);
      // 'warp' = 3D-flight stars from CosmicWarp (same as Космос).
      // Earlier this preset used 'twinkle' (StarsTwinkle, opacity-pulse
      // dots), but on a midnight-blue aurora background the pulses read
      // as a flicker rather than calm depth. The warp stars give the
      // same depth-of-field motion the Космос preset does, just layered
      // under a translucent aurora wash instead of pure black.
      setStarsMode('warp');
      setStarsSpeed(1.5);
      setAuroraEnabled(true);
      setAuroraPalette('ice');
      setAuroraDirection('top');
      setAuroraBrightness(0.30);
      setWallpaper('none');
      dispatchCosmicChanged();
    },
  },
  {
    // «Аврора II» — статичный вариант авроры: космос без движения
    // (звёзды twinkle = opacity-pulse, плывущего warp'а нет), свечение
    // не сверху-эллипсами а узкой рамкой по краям (direction 'frame' =
    // запотевшее стекло), цвет — мятно-зелёный.  Подходит для долгого
    // спокойного чтения: ничего не «летит» в кадре, только тихое
    // подмигивание звёзд + зелёный ободок.  Римская «II» в названии —
    // явный знак, что это вариант первого пресета «Аврора», а не
    // ещё одна тема.
    id: 'aurora-mint-frame',
    label: 'Аврора II',
    swatchTop:    '#0a2818',
    swatchBottom: '#48beaa',
    apply: setTheme => {
      setTheme('cosmic-night');
      setStarsEnabled(true);
      // 'twinkle' — статичные звёзды-точки с opacity-pulse'ом на месте.
      // Никакого 3D-полёта (это пресет 1 «Аврора» с warp).  Космос
      // здесь должен ощущаться неподвижным.
      setStarsMode('twinkle');
      setStarsSpeed(1.0);
      setAuroraEnabled(true);
      // Зелёная палитра (mint).  Если позже захочется насыщеннее — можно
      // ввести 'forest' или ’emerald' в AURORA_PALETTES.
      setAuroraPalette('mint');
      // Frame = конденсат по 4 краям, без drift-анимации; центр прозрачен,
      // свечение концентрируется у кромки и тает к центру.  Полная
      // реализация — Aurora.tsx, ветка direction === 'frame'.
      setAuroraDirection('frame');
      // Brightness чуть выше дефолтного — frame-режим сам по себе узкий,
      // если поставить 0.25 как у aurora-ice, ободок почти невиден.
      setAuroraBrightness(0.38);
      setWallpaper('none');
      dispatchCosmicChanged();
    },
  },

  // ── Ряд 4: фото-референсы (Изумруд + Грёза) ─────────────────
  {
    // «Изумруд» — по фото-референсу «Break» (presentation deck).
    // Чистый глубокий изумруд + холодный белый-зелёный ink.
    // Signature — white spotlight сверху-центра (body-правило).
    id: 'emerald',
    label: 'Изумруд',
    swatchTop:    '#0a3320',
    swatchBottom: '#e8f0e8',
    apply: setTheme => {
      setTheme('dark-emerald');
      setWallpaper('none');
    },
  },
  {
    // «Грёза» — по фото-референсу «Serendipity» (mymind.com).
    // Миднайт-нэйви + размытые синие облака.  Signature — 4 cloud-
    // blob'а на body (body-правило в index.css).
    id: 'reverie',
    label: 'Грёза',
    swatchTop:    '#0a1428',
    swatchBottom: '#e0e8f0',
    apply: setTheme => {
      setTheme('dark-reverie');
      setWallpaper('none');
    },
  },
];
