export type MushafFontId = 'qcf-v4' | 'qpc-v4-tajweed';

export const MUSHAF_FONT_OPTIONS: ReadonlyArray<{
  id: MushafFontId;
  label: string;
}> = [
  { id: 'qcf-v4', label: 'Обычный' },
  { id: 'qpc-v4-tajweed', label: 'Цветной таджвид' },
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

export function toggleMushafFont(font: MushafFontId): MushafFontId {
  return font === 'qpc-v4-tajweed' ? 'qcf-v4' : 'qpc-v4-tajweed';
}
