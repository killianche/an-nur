/**
 * duaHidden — скрытые дуа.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Раньше в разделе было два режима: «Мой список» и «Все дуа». Владелец
 * 09.09.2026 попросил убрать список совсем и оставить одну витрину, а лишнее
 * прятать свайпом влево — как строку в списках iOS.
 *
 * Это ровно обратная модель прежней. Там человек набирал себе подборку и по
 * умолчанию видел пустой экран; здесь он видит всё и убирает ненужное. Для
 * сборника из десятков дуа второе честнее: новый человек сразу получает
 * содержимое, а не приглашение его собрать.
 *
 * ── Что здесь НЕ хранится ─────────────────────────────────────────────
 *
 * Порядок. Прежний список умел переставлять карточки перетаскиванием; в
 * витрине порядок задаёт сборник, и переставлять нечего. Код перетаскивания
 * удалён вместе с режимом — он лежит в истории git.
 *
 * Скрытие обратимо и ничего не удаляет: id складывается в список, сам текст
 * дуа остаётся на месте. Вернуть можно кнопкой в шапке раздела.
 */

const KEY = 'dua.hidden.v1';
export const DUA_HIDDEN_EVENT = 'dua-hidden-changed';

function читать(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    // Испорченное значение не должно ломать раздел: считаем, что скрытых нет.
    return [];
  }
}

function писать(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(DUA_HIDDEN_EVENT));
}

export function readHiddenDua(): string[] {
  return читать();
}

export function isDuaHidden(id: string): boolean {
  return читать().includes(id);
}

export function hideDua(id: string) {
  const ids = читать();
  if (ids.includes(id)) return;
  писать([...ids, id]);
}

export function unhideDua(id: string) {
  писать(читать().filter(x => x !== id));
}

/** Подписка на изменения — экран перерисовывается без перезахода. */
export function onHiddenDuaChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DUA_HIDDEN_EVENT, fn);
  return () => window.removeEventListener(DUA_HIDDEN_EVENT, fn);
}
