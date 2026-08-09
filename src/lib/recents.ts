/**
 * Recent reads — stored in localStorage as JSON.
 * Up to 4 most-recent { surah, ayah, ts } entries, newest first.
 */

const KEY = 'recentReads';
const MAX = 4;

export type RecentRead = { surah: number; ayah: number; ts: number };

export function readRecents(): RecentRead[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentRead[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(x => typeof x?.surah === 'number' && typeof x?.ayah === 'number')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** Push surah:ayah to the front, dedupe by surah, cap at MAX. */
export function pushRecent(surah: number, ayah: number) {
  const existing = readRecents().filter(r => r.surah !== surah);
  const next: RecentRead[] = [{ surah, ayah, ts: Date.now() }, ...existing].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
}

/** Update the ayah for the most recent entry of this surah (or insert if missing). */
export function updateRecentAyah(surah: number, ayah: number) {
  const all = readRecents();
  const idx = all.findIndex(r => r.surah === surah);
  if (idx === -1) {
    pushRecent(surah, ayah);
    return;
  }
  all[idx] = { surah, ayah, ts: Date.now() };
  // Keep newest first
  all.sort((a, b) => b.ts - a.ts);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)));
}
