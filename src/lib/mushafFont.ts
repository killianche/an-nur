/**
 * mushafFont — какими глифами набрана страница в полноэкранном мусхафе.
 *
 * Вариантов три, и они не равнозначны по смыслу:
 *   qcf-v4          — мединский мусхаф 1441 г.х., обычное начертание;
 *   qpc-v4-tajweed  — тот же мусхаф, цветной таджвид (другой шрифт, те же
 *                     данные страницы);
 *   qcf-v1          — мусхаф «Мадани 1405», ДРУГОЕ издание: свои данные
 *                     страниц (/qcf1/pages) и свои шрифты (/qcf1/fonts-woff2).
 *
 * Отсюда `mushafEdition`: выбор шрифта решает не только начертание, но и
 * то, из какого каталога грузить саму страницу.  Смешать издания нельзя —
 * PUA-коды у них общие, а слова за ними разные.
 */

import type { QcfEdition } from './qcf4';

export type MushafFontId = 'qcf-v4' | 'qpc-v4-tajweed' | 'qcf-v1';

export const MUSHAF_FONT_OPTIONS: ReadonlyArray<{
  id: MushafFontId;
  label: string;
}> = [
  { id: 'qcf-v4', label: 'Обычный' },
  { id: 'qpc-v4-tajweed', label: 'Цветной таджвид' },
  { id: 'qcf-v1', label: 'Мадани 1405' },
];

export const DEFAULT_MUSHAF_FONT: MushafFontId = 'qcf-v4';
export const MUSHAF_FONT_KEY = 'mushaf.font';

export function normaliseMushafFont(value: string | null): MushafFontId {
  return MUSHAF_FONT_OPTIONS.some(option => option.id === value)
    ? value as MushafFontId
    : DEFAULT_MUSHAF_FONT;
}

export function readMushafFont(): MushafFontId {
  if (typeof window === 'undefined') return DEFAULT_MUSHAF_FONT;
  return normaliseMushafFont(localStorage.getItem(MUSHAF_FONT_KEY));
}

export function writeMushafFont(font: MushafFontId): void {
  localStorage.setItem(MUSHAF_FONT_KEY, font);
}

/**
 * Следующий вариант по кругу — для быстрой кнопки в шапке.
 *
 * Цикл по списку, а не пара значений: список вариантов растёт, и
 * переключатель «одно или другое» пришлось бы переписывать при каждом
 * новом издании, молча теряя доступ к нему из шапки.
 *
 * Неизвестное значение (например, из localStorage чужой версии) ведёт к
 * первому варианту, а не роняет переключатель.
 */
export function toggleMushafFont(font: MushafFontId): MushafFontId {
  const index = MUSHAF_FONT_OPTIONS.findIndex(option => option.id === font);
  const next = index < 0 ? 0 : (index + 1) % MUSHAF_FONT_OPTIONS.length;
  return MUSHAF_FONT_OPTIONS[next].id;
}

/** Человеческое имя варианта — для подписи кнопки. */
export function mushafFontLabel(font: MushafFontId): string {
  return MUSHAF_FONT_OPTIONS.find(option => option.id === font)?.label ?? '';
}

/**
 * Из какого издания грузить данные страницы для выбранного шрифта.
 *
 * Цветной таджвид — это V4 с другим шрифтом поверх тех же данных
 * страницы, поэтому издание у него общее с обычным вариантом.
 */
export function mushafEdition(font: MushafFontId): QcfEdition {
  return font === 'qcf-v1' ? 'qcf-v1' : 'qcf-v4';
}
