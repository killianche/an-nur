/**
 * screenStack — чистые операции над стеком экранов.
 *
 * Вынесены из App.tsx отдельно ровно затем, чтобы их можно было проверить
 * тестами без React и без DOM. Навигация — то место, где ошибка не падает,
 * а тихо ведёт человека не туда: «назад» с главного экрана проваливается
 * обратно в суру, стек растёт без предела, жест и кнопка расходятся.
 * Такое ловится тестом, а не взглядом.
 *
 * Здесь нет ни History API, ни состояния React: только «какой стек должен
 * получиться». Побочные эффекты (`pushState`, `go`) остаются в App.tsx.
 */

/** Минимум, который операциям нужно знать об экране. */
export type StackEntry = { name: string; tab?: string };

/** Индекс ближайшей снизу записи «вкладка Коран». -1, если её нет. */
export function findQuranHome(stack: ReadonlyArray<StackEntry>): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.name === 'tabs' && s.tab === 'quran') return i;
  }
  return -1;
}

/**
 * Сколько записей истории снять, чтобы попасть на выбор суры.
 *
 * 0 означает «мы уже там» — снимать нечего. Отрицательных не бывает.
 */
export function stepsToQuranHome(stack: ReadonlyArray<StackEntry>): number {
  const target = findQuranHome(stack);
  if (target < 0) return 0;
  return stack.length - 1 - target;
}

/**
 * Приведение стека к глубине из истории.
 *
 * Возвращает тот же массив, если приводить нечего: на этом держится
 * идемпотентность обработчика popstate.
 */
export function reconcile<T extends StackEntry>(
  stack: ReadonlyArray<T>,
  depth: number,
  root: T,
): T[] {
  if (stack.length === depth + 1) return stack as T[];
  if (depth + 1 < stack.length) return stack.slice(0, depth + 1);
  // Глубина больше стека — восстановить промежуточное неоткуда.
  return [root];
}

/** Корень ли текущее положение: с него аппаратная «назад» сворачивает приложение. */
export function isRoot(depth: number | undefined): boolean {
  return depth === 0;
}
