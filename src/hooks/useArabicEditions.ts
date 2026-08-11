/**
 * useArabicEditions — React hook that loads the bundled multi-edition
 * Arabic dataset once and re-renders consumers as soon as it lands.
 * Components fall back to the QCF V4 default rendering while the JSON
 * is in flight, then re-render with the alternative data when it's
 * ready — no flash of empty text.
 */

import { useEffect, useState } from 'react';
import { loadArabicEditions, getEdition, type AyahEditionData } from '../lib/arabicEditions';

let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (loaded) return;
  loadArabicEditions()
    .then(() => {
      loaded = true;
      listeners.forEach(fn => fn());
    })
    .catch(err => {
      console.warn('arabic-editions load failed', err);
    });
}

/**
 * Returns the edition record for the given verseKey, or null while
 * the dataset is still loading.  Subscribes the component so it
 * re-renders once load completes.
 *
 * `needed = false` означает «выбранный шрифт этот датасет не использует
 * — не качай».  Файл весит 3.9 МБ, и до этого флага он тянулся при
 * КАЖДОМ открытии суры, хотя по умолчанию читают мусхафом QCF V4,
 * которому editions не нужны вовсе.  На медленной сети он забивал канал
 * и шрифт страницы ждал за ним: человек смотрел на скелет секунды
 * вместо 0.8.
 */
export function useEdition(
  verseKey: string,
  needed = true,
): AyahEditionData | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!needed) return;
    ensureLoaded();
    if (loaded) return;
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [needed]);
  return needed ? getEdition(verseKey) : null;
}
