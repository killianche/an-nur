/**
 * Typography catalogs — Latin font + size scale picks for the
 * translation layer (Russian), plus the Arabic font catalog
 * that the reader can pick from in Typography settings.
 *
 * Arabic side has FOUR modes (in picker order):
 *   - 'uthmani'        Unicode Uthmani text in KFGQPC Uthmanic Hafs v22
 *                      (default — clean Unicode-text rendering that
 *                      reads well on both light and dark backgrounds
 *                      and matches the rest of the typography on the
 *                      page)
 *   - 'qpc-v4-tajweed' QPC v4 Tajweed coloured mushaf (signature
 *                      experience; 604 page-scoped coloured fonts,
 *                      see TajweedAyah.tsx)
 *   - 'qcf-v4'         QCF V4 PUA glyphs (monochrome Madinah mushaf)
 *   - 'qcf-v1'         QCF V1 PUA glyphs — Madani Mushaf 1405 (quran.com's
 *                      default; ayah-level karaoke only because V1 data
 *                      doesn't carry word boundaries)
 */

export type LatinFontId =
  | 'inter-semibold'
  | 'inter-regular'
  | 'garamond'
  | 'alice';

export type LatinFont = {
  id: LatinFontId;
  label: string;
  stack: string;
  weight: number;
};

/** Locally-bundled serif faces (see web/public/latin-fonts/* and the
 *  @font-face blocks in index.css) — Plex Serif was retired in favour of
 *  EB Garamond + Alice, contributed by the user.  Legacy `'plex'` or
 *  `'garamond-italic'` in localStorage falls back to `'garamond'`
 *  through readPref's whitelist guard. */
export const LATIN_FONTS: LatinFont[] = [
  { id: 'inter-semibold', label: 'Inter SemiBold', stack: "'Inter', system-ui, -apple-system, sans-serif",      weight: 600 },
  { id: 'inter-regular',  label: 'Inter Regular',  stack: "'Inter', system-ui, -apple-system, sans-serif",      weight: 400 },
  { id: 'garamond',       label: 'EB Garamond',    stack: "'EB Garamond', Georgia, 'Times New Roman', serif",   weight: 500 },
  { id: 'alice',          label: 'Alice',          stack: "'Alice', Georgia, 'Times New Roman', serif",         weight: 400 },
];

export type ArabicFontId =
  | 'qcf-v4'
  | 'qcf-v1'
  | 'uthmani'
  | 'qpc-v4-tajweed';

/** Removed ids (V2 / QPC Hafs / IndoPak / Me Quran) — handled by
 *  readPref's fallback when localStorage carries one of these legacy
 *  values.  V4-Tajweed was previously dropped and is now re-enabled
 *  with the coloured-mushaf renderer (see TajweedAyah). */

export type ArabicFont = {
  id: ArabicFontId;
  label: string;
  /** Picker preview stack — what the chip displays the sample text in.
   *  For PUA-page faces (qcf-v1, qcf-v4) the chip falls back to a
   *  Unicode-text Arabic font because preview text is Unicode "بسم الله",
   *  not the page-specific PUA codepoint a real ayah would use. */
  stack: string;
  /** Renderer category — drives which AyahLine component SurahScreen picks */
  kind: 'qcf-v4' | 'qcf-v1' | 'text' | 'tajweed';
  /** Only for kind='text': which edition + font face combo to use.
   *  Currently only 'uthmani' remains — IndoPak was removed; kept as
   *  a union (single value) so the type stays expressive if more
   *  Unicode editions land later. */
  textEdition?: 'uthmani';
  textStack?: string;
  textLetterSpacing?: string;
  /** Extra px to add to the renderer's BASE_FONT_PX at scale=1.
   *  Default 0 (QCF V4).  All non-default modes get +7 — the
   *  alternative faces (V1, Uthmani Unicode) carry smaller metric
   *  heights than QCF V4 at the same nominal font-size; without
   *  the bump they read visibly thinner than the default mushaf. */
  fontPxOffset?: number;
  /** How TextAyahLine renders the end-of-ayah marker:
   *   'native'  — emit U+06DD as plain text; the font draws its
   *               default bare-rosette glyph.  Works for KFGQPC
   *               Uthmanic Hafs v22.
   *   'overlay' — wrap U+06DD in a sized container with ligatures
   *               disabled, for fonts whose default U+06DD glyph
   *               needs explicit sizing or composition control. */
  endMarkerVariant?: 'native' | 'overlay';
  /** Multiplier for the rosette's font-size relative to the line's
   *  font-size.  Default 1.0.  Fonts that draw an oversized rosette
   *  glyph can dial it down so the marker reads as decoration, not
   *  a separate word. */
  endMarkerScale?: number;
};

/**
 * Цветной таджвид — снова в работе, по просьбе владельца.
 *
 * Он был спрятан ради размера пакета: 604 постраничных шрифта весят
 * 159 МБ и лежат именно в пакете, а не качаются, потому что цвет на
 * iPhone берётся из SVG-таблицы шрифта, а публичные CDN отдают только
 * COLRv1, который Safari не рисует.
 *
 * Почему всё-таки в пакете, а не докачкой с нашего сервера: Коран
 * обязан читаться без сети, включая этот режим, а постоянного домена у
 * проекта пока нет — привязывать чтение мусхафа к рабочему адресу,
 * который может смениться, нельзя.
 *
 * Цена: iOS-архив вырастает примерно до 230 МБ. Публикации это не
 * мешает (предел App Store — 4 ГБ), но скачивание по сотовой сети
 * потребует подтверждения: у Apple порог 200 МБ.  Если однажды это
 * станет мешать, шрифты переводятся на докачку по странице — механизм
 * уже есть, тот же, что у мусхафа (см. hooks/useTajweedFont.ts).
 *
 * 604 правила `@font-face` статическим CSS больше не подключаются: они
 * занимали 120 КБ из 126 КБ всего CSS приложения.  Правило для нужной
 * страницы вставляется по требованию — hooks/useTajweedFont.ts.
 */
export const TAJWEED_ENABLED = true;

const ALL_ARABIC_FONTS: ArabicFont[] = [
  {
    // Uthmani — Unicode Uthmani text in KFGQPC Uthmanic Hafs v22.
    // First in the list AND first-run default: clean Unicode rendering
    // that reads well on both light and dark backgrounds without the
    // visual weight of the coloured mushaf.  New users land on it
    // automatically.  Existing users with a saved `arabicFont` pref
    // keep their previous choice (readPref's localStorage path runs
    // before this default).
    id: 'uthmani', label: 'Усмани', kind: 'text',
    textEdition: 'uthmani',
    stack: "'KFGQPC Uthmanic Hafs v22', serif",
    textStack: "'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif",
    // 20 (= the default +7 for non-V4 faces, plus +13 cumulative
    // user bumps — same total as V1).  Added after
    // `TextAyahLine`'s BASE_FONT_PX(38) * scale, so every step grows
    // by exactly +13 px from the original offset=7 calibration.
    fontPxOffset: 20,
  },
  {
    // QPC v4 Tajweed — official King Fahd Complex coloured-glyph mushaf.
    // Glyphs carry their tajweed-rule colours in COLR/CPAL tables.
    // See components/TajweedAyah.tsx for the renderer and
    // scripts/gen/{fetch,patch,upgrade,strip-tajweed-svg}
    // for the data pipeline that produced the 604 page-scoped fonts.
    // `stack` is the picker-chip preview stack (Unicode "بسم الله"),
    // since the page-scoped tajweed faces have no Unicode coverage —
    // chips fall back to KFGQPC for the swatch text.
    id: 'qpc-v4-tajweed', label: 'Таджвид', kind: 'tajweed',
    stack: "'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif",
  },
  {
    id: 'qcf-v4', label: 'Мусхаф', kind: 'qcf-v4',
    stack: "'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif",
  },
  {
    id: 'qcf-v1', label: 'V1 · Мадани', kind: 'qcf-v1',
    stack: "'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif",
    // 13 (= the default +7 for non-V4 faces, plus +6 net user bumps:
    // +5, +8, -7).  Added after `BASE_FONT_PX * scale`, so every step
    // grows by the same absolute amount and the picker's relative
    // deltas stay intact.
    fontPxOffset: 13,
  },
];

export const ARABIC_FONTS: ArabicFont[] = ALL_ARABIC_FONTS.filter(
  f => TAJWEED_ENABLED || f.kind !== 'tajweed',
);

export const ARABIC_FONT_IDS: ArabicFontId[] = ARABIC_FONTS.map(f => f.id);

export function arabicFontConfig(id: ArabicFontId): ArabicFont {
  return ARABIC_FONTS.find(f => f.id === id) ?? ARABIC_FONTS[0];
}

/** Discrete scales for translations (small text). */
/**
 * Ступени размера текста — десять вместо четырёх.
 *
 * Владелец 07.09.2026: «чтобы вариаций было 10… то, что сейчас есть, возьмём
 * за основу, и чтобы можно было меньше делать на 4 пункта и на 2 пункта
 * больше ещё». Прежние четыре — 0.85, 1.0, 1.2, 1.4 — сохранены на своих
 * местах и стоят посередине новой шкалы: ниже них добавлены четыре, выше две.
 *
 * 🔴 Прежние значения оставлены БЕЗ изменения намеренно. Они записаны в
 * localStorage у всех, кто уже настраивал размер, а `readScale` притягивает
 * сохранённое к ближайшей разрешённой ступени. Сдвинь я 1.2 на 1.25 — у
 * человека молча поехал бы размер текста, который он однажды выбрал.
 *
 * Выбираются они теперь не рядом кнопок «А», а плюсом и минусом: десять
 * кнопок в ряд не помещаются, а на две строки это уже не выбор, а таблица.
 */
export const SCALE_OPTIONS: { value: number; label: string }[] = [
  { value: 0.45, label: 'A' },
  { value: 0.55, label: 'A' },
  { value: 0.65, label: 'A' },
  { value: 0.75, label: 'A' },
  { value: 0.85, label: 'A' },
  { value: 1.0,  label: 'A' },
  { value: 1.2,  label: 'A' },
  { value: 1.4,  label: 'A' },
  { value: 1.65, label: 'A' },
  { value: 1.9,  label: 'A' },
];
/** Кегль буквы-образца на каждой ступени — для предпросмотра в настройках. */
export const SCALE_FONT_PX = [13, 15, 17, 19, 22, 24, 27, 30, 34, 38];

export function latinStack(id: LatinFontId): string {
  return LATIN_FONTS.find(f => f.id === id)?.stack ?? LATIN_FONTS[0].stack;
}
/** Look up the weight a Latin variant should render at. Both Inter ids share
 *  the same family stack — only the weight differs, so callers read this
 *  alongside latinStack() to apply the right boldness. */
export function latinWeight(id: LatinFontId): number {
  return LATIN_FONTS.find(f => f.id === id)?.weight ?? 400;
}

/** Whether `id` is a serif face that needs the +10px reading bump and
 *  tighter line-height compared to the Inter sans defaults.  Used by
 *  SurahScreen when sizing translation paragraphs. */
export function latinIsSerif(id: LatinFontId): boolean {
  return id === 'garamond' || id === 'alice';
}

/** Px bump to apply to translation text when the selected face is one
 *  of the serif options (EB Garamond / Alice).  Serif x-heights read
 *  smaller than Inter at the same nominal size, so we kick the size up
 *  on top of the discrete scale step.  Returns 0 for sans-serif faces.
 *  Used by Azkar translation rendering across both flat and SuraAyahs
 *  modes. */
export function latinSizeBump(id: LatinFontId): number {
  return latinIsSerif(id) ? 6 : 0;
}

export function readPref<T extends string>(key: string, def: T, allowed: readonly T[]): T {
  const v = localStorage.getItem(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}

export function readNumber(key: string, def: number): number {
  const v = localStorage.getItem(key);
  if (!v) return def;
  const n = parseFloat(v);
  return isFinite(n) ? n : def;
}
