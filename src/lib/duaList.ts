/**
 * duaList — «Мой список» дуа.
 *
 * ── Почему список только для дуа ──────────────────────────────────────
 *
 * Решение владельца, и оно правильное.  Первым заходом я собирался
 * сделать один общий механизм подборок на дуа, аяты и азкары — так
 * меньше кода.  Но человек, который собрал себе список дуа на дорогу,
 * открывает его, чтобы прочитать дуа, а не встретить там аят и азкар.
 * Смешанный список пришлось бы фильтровать глазами при каждом чтении.
 *
 * Поэтому здесь только дуа, и тип этого не допускает: хранятся id из
 * `dua.json`, ничего другого сюда не положить.
 *
 * ── Почему список один, а не несколько именованных ────────────────────
 *
 * Владелец описал ровно два состояния экрана: «Мой список» и «Все дуа».
 * Несколько подборок — это ещё экран управления, имена, порядок между
 * ними; всё это стоит делать, когда одного списка окажется мало, а не
 * заранее.  Хранилище держит массив, так что добавить именованные
 * подборки потом можно без переноса данных.
 *
 * ── Порядок ───────────────────────────────────────────────────────────
 *
 * Порядок в списке — порядок чтения, и задаёт его человек.  Поэтому
 * массив, а не множество: новое добавляется в конец, переставляется
 * перетаскиванием за хват в режиме правки.
 */

const KEY = 'dua.list';
export const DUA_LIST_EVENT = 'dua-list-changed';

function sanitise(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !v) continue;
    if (out.includes(v)) continue;   // дубли ломают счётчики и порядок
    out.push(v);
  }
  return out;
}

/** Id дуа в порядке чтения. */
export function readDuaList(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return sanitise(JSON.parse(raw));
  } catch {
    // Испорченное хранилище не роняет экран и не стирается: вдруг
    // данные починятся следующей версией.
    return [];
  }
}

export function writeDuaList(ids: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(sanitise(ids)));
  window.dispatchEvent(new Event(DUA_LIST_EVENT));
}

export function onDuaListChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DUA_LIST_EVENT, fn);
  return () => window.removeEventListener(DUA_LIST_EVENT, fn);
}

export function isInDuaList(id: string): boolean {
  return readDuaList().includes(id);
}

export function addToDuaList(id: string) {
  const list = readDuaList();
  if (list.includes(id)) return;
  writeDuaList([...list, id]);
}

export function removeFromDuaList(id: string) {
  writeDuaList(readDuaList().filter(x => x !== id));
}

/** Одна кнопка на добавление и снятие — так это и ощущается на экране. */
export function toggleInDuaList(id: string): boolean {
  const list = readDuaList();
  if (list.includes(id)) {
    writeDuaList(list.filter(x => x !== id));
    return false;
  }
  writeDuaList([...list, id]);
  return true;
}

/**
 * Вставить дуа на конкретное место.
 *
 * Нужно для «Вернуть» после удаления: обратимую потерю Apple лечит
 * отменой, а не диалогом перед каждым удалением, — а отмена обязана
 * вернуть дуа туда, откуда оно ушло, иначе порядок чтения ломается.
 */
export function insertIntoDuaList(id: string, index: number) {
  const list = readDuaList().filter(x => x !== id);
  const at = Math.max(0, Math.min(list.length, Math.round(index)));
  list.splice(at, 0, id);
  writeDuaList(list);
}

/** Переставить дуа в списке: порядок чтения задаёт человек. */
export function moveInDuaList(id: string, delta: number) {
  const list = readDuaList();
  const from = list.indexOf(id);
  if (from === -1) return;
  const to = from + delta;
  if (to < 0 || to >= list.length) return;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  writeDuaList(next);
}

export function clearDuaList() {
  writeDuaList([]);
}
