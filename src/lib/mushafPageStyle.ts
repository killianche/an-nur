/**
 * mushafPageStyle — оформление страницы в полноэкранном мусхафе.
 *
 * ── Зачем отдельно от шрифта ──────────────────────────────────────────
 *
 * Шрифт (`mushafFont.ts`) решает, КАКИМИ глифами набран текст: обычный
 * QCF V4 или цветной QPC V4 Tajweed. Оформление решает, как выглядит
 * сама страница вокруг текста. Это разные вещи, и человек вправе хотеть
 * рамку и с обычным начертанием, и с цветным — в печатных изданиях
 * встречается и то, и другое.
 *
 * Если свалить их в один переключатель, получится четыре пункта вместо
 * двух пар, а добавление третьего шрифта превратит список в двенадцать.
 *
 * ── Что такое «печатное» ──────────────────────────────────────────────
 *
 * Повторение бумажного мусхафа: кремовая страница, орнаментальная рамка
 * по периметру текстового блока, тёплые чернила. Ровно то, что владелец
 * прислал фотографией.
 *
 * Рамка декоративная и НЕ несёт содержания: она не заменяет и не
 * дополняет сакральный текст, поэтому к ней не применяются правила
 * цитирования. Всё, что внутри рамки, по-прежнему приходит из данных
 * мусхафа посимвольно.
 */

export type MushafPageStyleId = 'plain' | 'printed';

export const MUSHAF_PAGE_STYLE_OPTIONS: ReadonlyArray<{
  id: MushafPageStyleId;
  label: string;
  hint: string;
}> = [
  { id: 'plain', label: 'Простое', hint: 'Только текст, без рамки' },
  { id: 'printed', label: 'Печатное', hint: 'Кремовая страница с орнаментом' },
];

export const DEFAULT_MUSHAF_PAGE_STYLE: MushafPageStyleId = 'plain';
export const MUSHAF_PAGE_STYLE_KEY = 'mushaf.pageStyle';

export function normaliseMushafPageStyle(value: string | null): MushafPageStyleId {
  return MUSHAF_PAGE_STYLE_OPTIONS.some(option => option.id === value)
    ? value as MushafPageStyleId
    : DEFAULT_MUSHAF_PAGE_STYLE;
}

export function readMushafPageStyle(): MushafPageStyleId {
  if (typeof window === 'undefined') return DEFAULT_MUSHAF_PAGE_STYLE;
  return normaliseMushafPageStyle(localStorage.getItem(MUSHAF_PAGE_STYLE_KEY));
}

export function writeMushafPageStyle(style: MushafPageStyleId): void {
  localStorage.setItem(MUSHAF_PAGE_STYLE_KEY, style);
}

export function toggleMushafPageStyle(style: MushafPageStyleId): MushafPageStyleId {
  return style === 'printed' ? 'plain' : 'printed';
}
