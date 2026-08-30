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
 * Цвет живёт в исходных COLR v0/CPAL-таблицах шрифта. `font-palette` выбирает светлую
 * или тёмную палитру (см. lib/tajweedPalette.ts), включая основной штрих:
 * чёрный на светлой теме и белый на тёмной. Legacy SVG-in-OpenType удалён:
 * WKWebView выбирал его вместо COLR, не наследовал foreground стабильно и
 * тратил заметно больше времени на разбор тяжёлых SVG-документов.
 *
 * ── unicode-range ─────────────────────────────────────────────────────
 *
 * Диапазон PUA U+FC00–FFFF сохранён от прежнего CSS. Без него семейство
 * могло бы применяться к обычному арабскому тексту в остальном
 * приложении — например к азкарам, — и там появились бы цветные буквы
 * там, где их не ждут.
 */

import { useEffect, useState } from 'react';
import { registerTajweedPaletteFamily } from '../lib/tajweedPalette';

type TajweedFontRef = { page: number; sample: string };
export type TajweedFontStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Уже подключённые семейства и данные, нужные для повторной загрузки. */
const injected = new Map<string, TajweedFontRef>();
/** Загрузки в полёте — не просим один файл дважды. */
const inFlight = new Map<string, Promise<void>>();
/** Готовые к отрисовке. */
const ready = new Set<string>();
/** Семейства, которые браузер не смог загрузить. */
const failed = new Set<string>();

const READY_EVENT = 'tajweed-font-ready';
const FAILED_EVENT = 'tajweed-font-failed';

/** Любой код из unicode-range правила — запускает файл до прихода JSON. */
export const TAJWEED_FONT_SAMPLE = '\uFC00';

/** Версия меняется при любой несовместимой правке бинарного шрифта.
 *  Нужна вебу: без query старый белый SVG может остаться в Safari cache. */
export const TAJWEED_FONT_VERSION = 'official-colrv0-cpal-v6';

/** /fonts/qpc-v4-tajweed-p077.woff2?v=official-colrv0-cpal-v6 */
function fontUrl(page: number): string {
  return `/fonts/qpc-v4-tajweed-p${String(page).padStart(3, '0')}.woff2?v=${TAJWEED_FONT_VERSION}`;
}

function inject(family: string, page: number, sample: string): void {
  if (injected.has(family) || typeof document === 'undefined') return;
  injected.set(family, { page, sample });
  registerTajweedPaletteFamily(family);

  const style = document.createElement('style');
  style.dataset.tajweedFont = family;
  style.dataset.tajweedPage = String(page);
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

  if (ready.has(family) || failed.has(family)) return Promise.resolve();

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
      } else {
        failed.add(family);
      }
    })
    .catch(() => { failed.add(family); })
    .then(() => {
      inFlight.delete(family);
      const ok = ready.has(family);
      window.dispatchEvent(
        new CustomEvent(ok ? READY_EVENT : FAILED_EVENT, { detail: family }),
      );
    });

  inFlight.set(family, promise);
  return promise;
}

/** Текущее состояние семейства — используется UI и регрессионными тестами. */
export function getTajweedFontStatus(family: string): TajweedFontStatus {
  if (ready.has(family)) return 'ready';
  if (failed.has(family)) return 'failed';
  if (inFlight.has(family)) return 'loading';
  return 'idle';
}

/** Подключить одно семейство и дождаться результата загрузки. */
export async function loadTajweedFont(
  page: number,
  family: string,
  sample: string,
): Promise<TajweedFontStatus> {
  inject(family, page, sample);
  await waitFor(family, sample);
  return getTajweedFontStatus(family);
}

/**
 * Повторить все неудавшиеся загрузки.
 *
 * Правило создаётся заново: после сетевой ошибки браузер может помнить
 * неудачу старого `@font-face` и не отправить повторный запрос.
 */
export async function retryFailedTajweedFonts(): Promise<void> {
  if (typeof document === 'undefined') return;
  const again = Array.from(failed);
  failed.clear();

  await Promise.all(again.map(async family => {
    const ref = injected.get(family);
    document.head
      .querySelectorAll<HTMLStyleElement>(`style[data-tajweed-font="${family}"]`)
      .forEach(el => el.remove());
    injected.delete(family);
    if (!ref) return;
    inject(family, ref.page, ref.sample);
    await waitFor(family, ref.sample);
  }));

  window.dispatchEvent(new CustomEvent(FAILED_EVENT, { detail: '' }));
}

/** Есть ли хотя бы один не загрузившийся цветной шрифт. */
export function useTajweedFontFailure(): { failed: boolean; retry: () => void } {
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump(n => n + 1);
    window.addEventListener(FAILED_EVENT, onChange);
    window.addEventListener(READY_EVENT, onChange);
    return () => {
      window.removeEventListener(FAILED_EVENT, onChange);
      window.removeEventListener(READY_EVENT, onChange);
    };
  }, []);

  return {
    failed: failed.size > 0,
    retry: () => { void retryFailedTajweedFonts(); },
  };
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
  /** Далёкие от экрана аяты не должны занимать канал первыми. */
  enabled = true,
): boolean {
  if (enabled && page != null && family && sample) inject(family, page, sample);
  const isReady = enabled && !!family && ready.has(family);

  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled || page == null || !family || !sample || isReady) return;
    let cancelled = false;
    const onReady = (e: Event) => {
      if (!cancelled && (e as CustomEvent<string>).detail === family) {
        bump(n => n + 1);
      }
    };
    window.addEventListener(READY_EVENT, onReady);
    window.addEventListener(FAILED_EVENT, onReady);
    void loadTajweedFont(page, family, sample);
    return () => {
      cancelled = true;
      window.removeEventListener(READY_EVENT, onReady);
      window.removeEventListener(FAILED_EVENT, onReady);
    };
  }, [enabled, page, family, sample, isReady]);

  return isReady;
}

/**
 * Заранее подтянуть шрифт таджвида для страницы.
 *
 * Нужен переключению режима: человек нажимает «таджвид», и страница
 * должна раскраситься сразу, а не после того, как доедет 77 КБ.
 */
export function preloadTajweedFont(page: number, family: string, sample: string): void {
  if (!ready.has(family)) void loadTajweedFont(page, family, sample);
}
