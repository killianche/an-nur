/**
 * useQcfFont — подключает постраничные подмножества шрифтов мусхафа и
 * говорит, готовы ли они к показу.
 *
 * ── Почему подмножества, а не 48 исходных файлов ──────────────────────
 *
 * QCF V4 раздаёт Коран 48 файлами по ~780 КБ, и пара (PUA-код, шрифт)
 * задаёт слово: один и тот же код в разных файлах — разные слова.  На
 * страницу приходилось в среднем 0.89 МБ, местами 1.78 МБ, хотя нужно ей
 * около 140 глифов из 2073.  Худший случай — служебные шрифты: страница
 * 77 тянула 924 КБ ради одного глифа с названием суры.
 *
 * `scripts/build-page-fonts.py` режет их по страницам: 2.26 МБ → 84 КБ.
 * Файлы лежат в `/qcf4/fonts-page/077/QCF4_Hafs_06.woff2`, семейство в
 * CSS получает суффикс страницы (`QCF4_Hafs_06_p77`) — см. qcfPageFamily,
 * там же почему одним именем обойтись нельзя.
 *
 * ── Почему готовность отслеживается, а не отдана на font-display ───────
 *
 * `font-display: block` держит текст невидимым около трёх секунд, а потом
 * показывает запасной шрифт.  У PUA-кодов запасного глифа нет ни в одном
 * системном шрифте, поэтому вместо арабского появлялись кубики — и
 * оставались до конца загрузки.  Владелец видел их по 10-20 секунд.
 *
 * Кубик на месте слова Корана недопустим, поэтому решение принимаем сами:
 * пока `document.fonts.load` не подтвердил готовность, текст не рисуется
 * вовсе, а на его месте живёт скелет (ArabicSkeleton).  Скелет честнее:
 * он говорит «идёт загрузка», а кубики выглядят как испорченный текст.
 *
 * `font-display: block` в правиле остаётся — на случай, если готовность
 * почему-то не отследилась: пустая строка лучше кубиков.
 */

import { useEffect, useState } from 'react';
import {
  qcfPageFamily,
  qcfPageFontUrl,
  type QcfFontRef,
} from '../lib/qcf4';

/**
 * Уже подключённые семейства.  Инициализируется осмотром DOM, чтобы
 * перезагрузка модуля в dev не вставляла правила повторно.
 */
function buildInitialSet(): Set<string> {
  const set = new Set<string>();
  if (typeof document !== 'undefined') {
    document.head
      .querySelectorAll<HTMLStyleElement>('style[data-qcf-font]')
      .forEach(el => {
        const name = el.dataset.qcfFont;
        if (name) set.add(name);
      });
  }
  return set;
}
const injected: Set<string> = buildInitialSet();

/** Семейства, чья загрузка уже подтверждена — переживает размонтирование. */
const ready = new Set<string>();
/** Загрузки в полёте, чтобы не просить одно и то же дважды. */
const inFlight = new Map<string, Promise<void>>();

const READY_EVENT = 'qcf-font-ready';

/**
 * Вставить `@font-face` для одной пары «шрифт + страница».
 *
 * Правило добавляется в фазе рендера, а не в эффекте: браузер должен
 * начать качать файл до первой отрисовки, иначе к загрузке добавляется
 * лишний кадр ожидания.
 */
export function injectQcfFont(ref: QcfFontRef): string {
  const family = qcfPageFamily(ref.font, ref.page);
  if (injected.has(family) || typeof document === 'undefined') return family;
  injected.add(family);

  const style = document.createElement('style');
  style.dataset.qcfFont = family;
  style.textContent = [
    `@font-face {`,
    `  font-family: '${family}';`,
    `  src: url('${qcfPageFontUrl(ref.font, ref.page)}') format('woff2');`,
    `  font-display: block;`,
    `  font-weight: normal;`,
    `  font-style: normal;`,
    `}`,
  ].join('\n');
  document.head.appendChild(style);
  return family;
}

/**
 * Дождаться готовности семейства и разбудить подписчиков.
 *
 * `document.fonts.load` требует размер в запросе шрифта — без него
 * спецификация разрешает вернуть пустой список, ничего не загрузив.
 */
function waitFor(family: string): Promise<void> {
  const existing = inFlight.get(family);
  if (existing) return existing;

  if (typeof document === 'undefined' || !document.fonts) {
    // Нет Font Loading API — полагаемся на font-display и не держим текст.
    ready.add(family);
    return Promise.resolve();
  }

  const promise = document.fonts
    .load(`16px '${family}'`)
    .then(() => { /* успех */ })
    .catch(() => { /* сеть подвела — покажем как есть, не держим экран */ })
    .then(() => {
      ready.add(family);
      inFlight.delete(family);
      window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: family }));
    });

  inFlight.set(family, promise);
  return promise;
}

/** Готово ли семейство прямо сейчас — без ожидания. */
export function isQcfFontReady(ref: QcfFontRef): boolean {
  return ready.has(qcfPageFamily(ref.font, ref.page));
}

/**
 * Подключить нужные подмножества и сказать, все ли готовы.
 *
 * Возвращает `true`, когда каждое семейство из списка загружено и текст
 * можно рисовать.  Пустой список считается готовым: рисовать нечего.
 *
 * `enabled = false` означает «этот текст ещё далеко от экрана — не проси
 * его шрифт».  Возвращает `false`, то есть вызывающий покажет скелет.
 * Так первый экран не делит канал с концом суры: подробнее в
 * hooks/useNearViewport.ts.
 */
export function useQcfFont(refs: QcfFontRef[], enabled = true): boolean {
  // Фаза рендера: правила и запросы стартуют до первой отрисовки.
  const families = enabled ? refs.map(injectQcfFont) : [];
  const allReady = enabled && families.every(f => ready.has(f));

  const [, bump] = useState(0);
  const key = families.join(',');

  useEffect(() => {
    if (allReady) return;
    let cancelled = false;

    const onReady = (e: Event) => {
      const family = (e as CustomEvent<string>).detail;
      if (!cancelled && families.includes(family)) bump(n => n + 1);
    };
    window.addEventListener(READY_EVENT, onReady);

    // Уже готовые ждать не нужно — событие по ним больше не придёт.
    for (const family of families) {
      if (!ready.has(family)) void waitFor(family);
    }
    // Ждали, пока список менялся — сверимся ещё раз.
    if (families.length && families.every(f => ready.has(f))) bump(n => n + 1);

    return () => {
      cancelled = true;
      window.removeEventListener(READY_EVENT, onReady);
    };
    // families пересобирается каждый рендер; сравниваем по строковому ключу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allReady]);

  return allReady;
}

/**
 * Заранее подтянуть подмножества страницы.
 *
 * Нужно для соседних страниц в мусхафе и для суры, которую человек вот-вот
 * откроет: 70 КБ качаются незаметно, зато перелистывание получается
 * мгновенным.
 */
export function preloadQcfFonts(refs: QcfFontRef[]): void {
  for (const ref of refs) {
    const family = injectQcfFont(ref);
    if (!ready.has(family)) void waitFor(family);
  }
}
