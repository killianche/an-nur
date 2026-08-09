import { useState, useEffect } from 'react';

/**
 * Три темы — по одной на режим.
 *
 *   light   — белая бумага, чёрные чернила
 *   dark    — мягкий графит #1a1a1c
 *   aurora  — чёрная канва + звёзды и полярное сияние (<CosmicLayer>)
 *
 * В QuranIng было двенадцать тем и одиннадцать пресетов поверх них,
 * плюс бумажные паттерны и фото-обои.  Здесь модель плоская: id темы
 * это и есть всё её состояние.  `themeMode` сохранён отдельной
 * функцией, потому что весь остальной код рассуждает в терминах
 * «светлая / тёмная / космос», а не конкретных id — и когда/если тем
 * снова станет больше, менять придётся только эту функцию.
 */

export type ThemeMode = 'light' | 'dark' | 'cosmic';

export type Theme = 'light' | 'mushaf' | 'dark' | 'aurora';

export const ALL_THEMES: Theme[] = ['light', 'mushaf', 'dark', 'aurora'];

export const THEME_LABELS: Record<Theme, string> = {
  light:  'Светлая',
  mushaf: 'Мусхаф',
  dark:   'Тёмная',
  aurora: 'Аврора',
};

/** Первый запуск открывается на «Авроре» — это визуальная подпись
 *  приложения, и новый пользователь должен увидеть её сразу.  Дальше
 *  читается сохранённый выбор. */
export const FIRST_RUN_DEFAULT: Theme = 'aurora';

const STORAGE_KEY = 'theme';

/**
 * Миграция сохранённых значений из QuranIng: там id темы был вида
 * `light-ivory` / `dark-velvet` / `cosmic-night`.  Сводим всё
 * семейство к одной из трёх новых тем по префиксу, чтобы человек,
 * открывший приложение поверх старого localStorage, не улетел на
 * дефолт и не потерял «светлая была светлой».
 */
function migrateLegacy(v: string): Theme | null {
  if (v.startsWith('cosmic')) return 'aurora';
  // Кремовые светлые темы QuranIng ближе всего к «Мусхафу».
  if (v === 'light-cream' || v === 'light-ivory') return 'mushaf';
  if (v.startsWith('light'))  return 'light';
  if (v.startsWith('dark'))   return 'dark';
  // Совсем древние значения без префикса.
  if (v === 'parchment' || v === 'sepia') return 'mushaf';
  return null;
}

export function themeMode(t: Theme): ThemeMode {
  if (t === 'aurora') return 'cosmic';
  if (t === 'mushaf') return 'light';   // тёплая бумага — светлый режим
  return t;
}

/** Светлая ли тема по существу.  Отдельная функция, потому что
 *  светлых тем теперь две и сравнение `t === 'light'` то и дело
 *  оказывалось бы неполным — именно так и появлялись бы баги вида
 *  «на Мусхафе подсветка ведёт себя как на тёмной». */
export function isLightTheme(t: Theme): boolean {
  return themeMode(t) === 'light';
}

function readStoredTheme(): Theme {
  const v = localStorage.getItem(STORAGE_KEY);
  if (!v) return FIRST_RUN_DEFAULT;
  if ((ALL_THEMES as string[]).includes(v)) return v as Theme;
  return migrateLegacy(v) ?? FIRST_RUN_DEFAULT;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  return { theme, setTheme };
}
