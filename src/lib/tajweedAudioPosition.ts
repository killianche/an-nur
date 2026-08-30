/**
 * Сопоставляет позицию слова из аудиотайминга с визуальным элементом
 * постраничного цветного шрифта.
 *
 * Обычно позиции совпадают один к одному. Исключение 37:130 приходит из
 * источника шрифта одним элементом «إِلْ يَاسِينَ», тогда как тайминг
 * чтеца считает его двумя словами. Обе аудиопозиции поэтому должны
 * подсвечивать третий визуальный элемент.
 */
const POSITION_OVERRIDES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  '37:130': { 4: 3 },
};

export function tajweedVisualWordPosition(
  verseKey: string,
  audioPosition: number | null,
): number | null {
  if (audioPosition == null) return null;
  return POSITION_OVERRIDES[verseKey]?.[audioPosition] ?? audioPosition;
}
