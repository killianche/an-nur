/**
 * useTajweedFont — подключает шрифт цветного таджвида для одной страницы.
 *
 * ── Почему по требованию, а не статическим CSS ─────────────────────────
 *
 * QPC v4 Tajweed раздаётся так же, как мусхаф: 604 постраничных шрифта,
 * `QPC4Tajweed-001`…`-604`, по ~77 КБ. Раньше все 604 правила `@font-face`
 * лежали в `styles/tajweed-fonts.css` — 120 КБ из 126 КБ всего CSS
 * приложения, и разбирал их браузер на каждом запуске, даже если человек
 * читает мусхафом и таджвид не открывал ни разу.
 *
 * Правило для нужной страницы вставляется здесь, тем же приёмом, что и у
 * мусхафа (hooks/useQcfFont.ts): в фазе рендера, чтобы браузер начал
 * качать файл до первой отрисовки.
 *
 * ── Почему цвет не задаётся из CSS ────────────────────────────────────
 *
 * Цвет живёт внутри шрифта: COLR-таблица для Chrome и Firefox, SVG-таблица
 * для Safari. Поэтому `color` на span не влияет на буквы — им управляет
 * `font-palette` (см. lib/tajweedPalette.ts), а на iOS палитра запечена в
 * SVG. Отсюда же ограничение: шрифты лежат в пакете, а не качаются с
 * публичного CDN, — тот отдаёт только COLRv1, который Safari не рисует.
 *
 * ── unicode-range ─────────────────────────────────────────────────────
 *
 * Диапазон PUA U+FC00–FFFF сохранён от прежнего CSS. Без него семейство
 * могло бы применяться к обычному арабскому тексту в остальном
 * приложении — например к азкарам, — и там появились бы цветные буквы
 * там, где их не ждут.
 */

import { useEffect, useState } from 'react';

/** Уже подключённые семейства: правило вставляется один раз. */
const injected = new Set<string>();
/** Загрузки в полёте — не просим один файл дважды. */
const inFlight = new Map<string, Promise<void>>();
/** Готовые к отрисовке. */
const ready = new Set<string>();

const READY_EVENT = 'tajweed-font-ready';

/** /fonts/qpc-v4-tajweed-p077.woff2 */
function fontUrl(page: number): string {
  return `/fonts/qpc-v4-tajweed-p${String(page).padStart(3, '0')}.woff2`;
}

function inject(family: string, page: number): void {
  if (injected.has(family) || typeof document === 'undefined') return;
  injected.add(family);

  const style = document.createElement('style');
  style.dataset.tajweedFont = family;
  style.textContent = [
    `@font-face {`,
    `  font-family: '${family}';`,
    `  src: url('${fontUrl(page)}') format('woff2');`,
    `  font-weight: 400;`,
    `  font-style: normal;`,
    // swap, а не block: у цветных глифов PUA тоже нет запасного шрифта,
    // но здесь текст не остаётся без замены — родитель показывает обычный
    // мусхаф, пока цветной не приехал (см. ArabicAyahRouter).
    `  font-display: swap;`,
    `  unicode-range: U+FC00-FFFF;`,
    `}`,
  ].join('\n');
  document.head.appendChild(style);
}

function waitFor(family: string, sample: string): Promise<void> {
  const existing = inFlight.get(family);
  if (existing) return existing;

  if (typeof document === 'undefined' || !document.fonts) {
    ready.add(family);
    return Promise.resolve();
  }

  // Образец текста обязателен.  У правила стоит `unicode-range:
  // U+FC00-FFFF`, а `load()` без второго аргумента спрашивает про пробел —
  // он в диапазон не попадает, браузер отвечает «нечего загружать», файл
  // не запрашивается вовсе, и таджвид молча не включается.  Поймано
  // проверкой: правило в head есть, сеть пуста, текст обычным мусхафом.
  const promise = document.fonts
    .load(`16px '${family}'`, sample)
    .then(faces => {
      // Как и у мусхафа, смотрим статус самих FontFace: пустой список или
      // ошибка означают, что цветных глифов не будет.
      if (faces.length > 0 && faces.every(f => f.status === 'loaded')) {
        ready.add(family);
      }
    })
    .catch(() => { /* останемся на обычном мусхафе */ })
    .then(() => {
      inFlight.delete(family);
      window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: family }));
    });

  inFlight.set(family, promise);
  return promise;
}

/**
 * Подключить шрифт таджвида для страницы и сказать, готов ли он.
 *
 * `page = null` означает «данных ещё нет» — ничего не просим.
 */
export function useTajweedFont(
  page: number | null,
  family: string | null,
  /** Любой глиф этой страницы — им проверяется готовность шрифта. */
  sample: string | null,
): boolean {
  if (page != null && family) inject(family, page);
  const isReady = !!family && ready.has(family);

  const [, bump] = useState(0);
  useEffect(() => {
    if (!family || !sample || isReady) return;
    let cancelled = false;
    const onReady = (e: Event) => {
      if (!cancelled && (e as CustomEvent<string>).detail === family) {
        bump(n => n + 1);
      }
    };
    window.addEventListener(READY_EVENT, onReady);
    void waitFor(family, sample);
    return () => {
      cancelled = true;
      window.removeEventListener(READY_EVENT, onReady);
    };
  }, [family, sample, isReady]);

  return isReady;
}

/**
 * Заранее подтянуть шрифт таджвида для страницы.
 *
 * Нужен переключению режима: человек нажимает «таджвид», и страница
 * должна раскраситься сразу, а не после того, как доедет 77 КБ.
 */
export function preloadTajweedFont(page: number, family: string, sample: string): void {
  inject(family, page);
  if (!ready.has(family)) void waitFor(family, sample);
}
