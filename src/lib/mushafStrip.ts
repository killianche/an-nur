/**
 * mushafStrip — геометрия ленты страниц мусхафа для нативной прокрутки.
 *
 * ── Почему листает сам iOS ────────────────────────────────────────────
 *
 * Владелец 14.09.2026: «изучи, как листает Apple Books, и сделай так же. Не
 * придумывай, бери то, что уже сделано крупной компанией».
 *
 * Параметры листания Books Apple не публикует. Но их стиль «сдвиг» и
 * `UIPageViewController` в режиме `.scroll` построены на системном
 * `UIScrollView` (Apple: «the animation follows the user's finger»; внутри —
 * приватный `_UIQueuingScrollView`, подкласс UIScrollView). А в WKWebView
 * контейнер с CSS `scroll-snap` прокручивается ИМЕННО настоящим UIScrollView:
 * WebKit ставит ему `decelerationRate` и подменяет точку остановки на
 * ближайшую точку привязки (`ScrollingTreeScrollingNodeDelegateIOS.mm`).
 *
 * Поэтому здесь нет своей физики: ни доводки, ни пружины, ни порогов. Палец,
 * бросок, торможение, резинка на краях и остановка касанием — системные.
 * `scroll-snap-stop: always` не даёт проскочить страницу одним броском.
 *
 * Прежние попытки — CSS-переход доводки, физика полёта на компоновщике
 * (`mushafFling.ts`) и листание без анимации (`mushafSwipe.ts`) — в истории
 * git. Возвращаться к собственной физике без замера на устройстве не нужно.
 *
 * ── Направление ───────────────────────────────────────────────────────
 *
 * Мусхаф листается справа налево: палец идёт вправо — приходит следующая
 * страница. В обычной (LTR) прокрутке это значит, что следующая страница
 * лежит ЛЕВЕЕ текущей. Лента выложена задом наперёд: страница 604 у левого
 * края, страница 1 — у правого. `direction: rtl` для этого не используется:
 * у RTL-прокрутки `scrollLeft` отрицательный и в разных движках считался
 * по-разному, а зеркальная раскладка даёт то же направление без этих граблей.
 */

export const STRIP_FIRST_PAGE = 1;
export const STRIP_LAST_PAGE = 604;

/** Место страницы в ленте слева направо: 0 — последняя страница книги. */
export function stripIndex(page: number, last = STRIP_LAST_PAGE): number {
  return last - page;
}

/** Координата прокрутки, при которой страница стоит ровно в кадре. */
export function scrollLeftForPage(page: number, step: number, last = STRIP_LAST_PAGE): number {
  return stripIndex(page, last) * step;
}

/**
 * Какая страница ближе всего к кадру при данной прокрутке.
 *
 * Середина между листами решает в пользу того, что занимает больше экрана, —
 * так номер в шапке меняется ровно тогда, когда глаз уже видит новую страницу.
 */
export function pageAtScrollLeft(
  scrollLeft: number,
  step: number,
  first = STRIP_FIRST_PAGE,
  last = STRIP_LAST_PAGE,
): number {
  if (!(step > 0) || !Number.isFinite(scrollLeft)) return first;
  const page = last - Math.round(scrollLeft / step);
  return Math.min(last, Math.max(first, page));
}

/**
 * Допуск, в котором лента считается стоящей на странице, px.
 *
 * 🔴 Не пиксель. WebKit на iOS отдаёт странице положение прокрутки с
 * запаздыванием: после остановки последнее значение застывает в −10…+7 px от
 * точки привязки, хотя лист на экране стоит ровно (замер свайпами в
 * iOS-симуляторе 14.09.2026). А палец, замерший посреди листа, — это десятки
 * и сотни пикселей. Пять процентов шага, но не меньше 16 px, разделяют эти
 * два случая.
 */
export function stripSettleTolerance(step: number): number {
  return Math.max(16, step * 0.05);
}

/** Лента стоит на странице — не посередине между листами. */
export function isStripAligned(scrollLeft: number, step: number, tolerance = 1): boolean {
  if (!(step > 0) || !Number.isFinite(scrollLeft)) return true;
  const r = scrollLeft / step;
  return Math.abs(r - Math.round(r)) * step < tolerance;
}

/** Ширина всей ленты: все шаги между страницами плюс ширина последнего листа. */
export function stripWidth(
  pageWidth: number,
  gutter: number,
  first = STRIP_FIRST_PAGE,
  last = STRIP_LAST_PAGE,
): number {
  return (last - first) * (pageWidth + gutter) + pageWidth;
}
