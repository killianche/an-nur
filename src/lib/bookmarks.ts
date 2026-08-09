/**
 * Per-ayah bookmarks. Stored in localStorage as a JSON array of "surah:ayah" strings.
 * Order is irrelevant; we just check membership.
 */

const KEY = 'ayahBookmarks';

export function readBookmarks(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(x => typeof x === 'string') as string[]);
  } catch {
    return new Set();
  }
}

export function isBookmarked(surah: number, ayah: number): boolean {
  return readBookmarks().has(`${surah}:${ayah}`);
}

/** Toggle and return the new state. */
export function toggleBookmark(surah: number, ayah: number): boolean {
  const key = `${surah}:${ayah}`;
  const set = readBookmarks();
  const next = !set.has(key);
  if (next) set.add(key); else set.delete(key);
  localStorage.setItem(KEY, JSON.stringify([...set]));
  return next;
}
