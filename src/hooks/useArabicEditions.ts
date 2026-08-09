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

/** Returns the edition record for the given verseKey, or null while
 *  the dataset is still loading.  Subscribes the component so it
 *  re-renders once load completes. */
export function useEdition(verseKey: string): AyahEditionData | null {
  const [, force] = useState(0);
  useEffect(() => {
    ensureLoaded();
    if (loaded) return;
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return getEdition(verseKey);
}
