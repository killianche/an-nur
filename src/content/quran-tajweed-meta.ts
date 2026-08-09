// Лёгкие meta-экспорты Tajweed-данных (без 3-МБ TAJWEED_GLYPHS).
// Цель — позволить sync-импорт font-family списков и helper'ов без
// притаскивания за собой 6240-аятного словаря глифов.  Сам словарь
// + getTajweedAyah() живут в quran-tajweed-glyphs.ts, который теперь
// lazy-import'ится только из мест, где он реально нужен (рендер аята
// в Tajweed-mode).

export type TajweedWord = { code: string; text: string };

export type TajweedAyahData = {
  surah: number;
  ayah: number;
  page: number;
  words: TajweedWord[];
  endMarker: string;
};

/** 604 page-scoped font families для QPC4 Tajweed мусхафа.
 *  QPC4Tajweed-001 ... QPC4Tajweed-604.  Используется tajweedPalette
 *  для CSS-генерации; pure data, без зависимости на бакет глифов. */
export const ALL_TAJWEED_FONT_FAMILIES: string[] = Array.from(
  { length: 604 },
  (_, i) => `QPC4Tajweed-${String(i + 1).padStart(3, '0')}`,
);

/** Имя font-family для конкретной страницы мусхафа (1..604). */
export function fontFamilyForPage(page: number): string | null {
  if (page < 1 || page > 604) return null;
  return ALL_TAJWEED_FONT_FAMILIES[page - 1];
}
