/**
 * duaHidden — скрытые дуа.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Сборник дуа со временем разрастается, и часть его человеку не нужна:
 * не его случай, не его мазхаб, просто не читает.  Витрина «Все дуа»
 * должна оставаться обозримой, поэтому лишнее из неё убирается с глаз.
 *
 * ── Чем это не является ───────────────────────────────────────────────
 *
 * Это не удаление: сакральный текст из приложения никуда не девается.
 * Скрытое лежит в отдельном списке и возвращается оттуда — по решению
 * владельца именно так, а не всплывашкой «вернуть»: скрывают осознанно
 * и надолго, и предлагать отмену прямо сейчас незачем.
 *
 * Это и не «Мой список».  Тот собирают, чтобы читать; этот — чтобы не
 * видеть.  Дуа может оказаться в обоих сразу (собрал, потом решил
 * убрать из витрины), и это не противоречие: «Мой список» человек
 * составил руками, и прятать оттуда никто не просил.
 */

const KEY = 'dua.hidden';
export const DUA_HIDDEN_EVENT = 'dua-hidden-changed';

function sanitise(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !v) continue;
    if (out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

/** Id скрытых дуа.  Порядок — тот, в котором скрывали. */
export function readHiddenDua(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return sanitise(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeHiddenDua(ids: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(sanitise(ids)));
  window.dispatchEvent(new Event(DUA_HIDDEN_EVENT));
}

export function onHiddenDuaChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DUA_HIDDEN_EVENT, fn);
  return () => window.removeEventListener(DUA_HIDDEN_EVENT, fn);
}

export function isHiddenDua(id: string): boolean {
  return readHiddenDua().includes(id);
}

export function hideDua(id: string) {
  const list = readHiddenDua();
  if (list.includes(id)) return;
  writeHiddenDua([...list, id]);
}

export function unhideDua(id: string) {
  writeHiddenDua(readHiddenDua().filter(x => x !== id));
}

export function unhideAllDua() {
  writeHiddenDua([]);
}
