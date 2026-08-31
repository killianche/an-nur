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
 *
 * ── Почему тот же учёт обслуживает и QCF V1 ───────────────────────────
 *
 * У V1 («Мадани 1405») шрифты не режутся: файл `QCF_P106.woff2` сам и
 * есть страница 106, а семейство равно имени шрифта.  Само правило
 * `@font-face` для него вставляет hooks/useArabicPageFont.ts — там
 * живут имена файлов V1.  Но учёт готовности, признак неудачи и повтор
 * остаются здесь, общими на оба издания: у PUA-кодов V1 запасного глифа
 * ровно так же нет, а плашка об ошибке в шапке экрана одна.
 */

import { useEffect, useState } from 'react';
import {
  DEFAULT_QCF_EDITION,
  qcfFontFamily,
  qcfPageFontUrl,
  type QcfEdition,
  type QcfFontRef,
} from '../lib/qcf4';
import {
  injectV1FamilyFont,
  resetArabicPageFont,
} from './useArabicPageFont';

/**
 * Уже подключённые семейства и пары, из которых они собраны.
 *
 * Map, а не Set: повтору после сбоя нужно пересоздать `@font-face`, а для
 * этого нужны шрифт и страница, а не только имя семейства.  Разбирать имя
 * обратно ненадёжно — в именах шрифтов свои подчёркивания.
 *
 * Инициализируется осмотром DOM, чтобы перезагрузка модуля в dev не
 * вставляла правила повторно.
 */
function buildInitialMap(): Map<string, QcfFontRef> {
  const map = new Map<string, QcfFontRef>();
  if (typeof document !== 'undefined') {
    document.head
      .querySelectorAll<HTMLStyleElement>('style[data-qcf-font]')
      .forEach(el => {
        const name = el.dataset.qcfFont;
        const font = el.dataset.qcfSrcFont;
        const page = Number(el.dataset.qcfPage);
        if (name && font && Number.isFinite(page)) map.set(name, { font, page });
      });
  }
  return map;
}
const injected: Map<string, QcfFontRef> = buildInitialMap();

/** Семейства, чья загрузка уже подтверждена — переживает размонтирование. */
const ready = new Set<string>();
/**
 * Семейства, которые загрузить не удалось.
 *
 * Отдельно от `ready`, потому что «не смогли» и «готово» ведут себя
 * противоположно: на готовом рисуем текст, на несмогшем — НЕ рисуем.
 * Раньше сбой сети приравнивался к успеху, и на месте аята появлялись
 * ряды квадратов: у PUA-кодов нет запасного глифа ни в одном шрифте.
 * Кубики вместо слов Корана недопустимы, поэтому лучше честно показать,
 * что текст не приехал, и дать повторить.
 */
const failed = new Set<string>();

/**
 * Издание, которому принадлежит семейство.
 *
 * Берётся из `injected`, куда ссылку кладёт `injectQcfFont` — то есть из
 * записанного факта, а не из разбора префикса имени.  Разбор префикса
 * здесь запрещён: он прячет правило внутри строки.
 */
function matchesEdition(family: string, edition?: QcfEdition): boolean {
  if (!edition) return true;
  return (injected.get(family)?.edition ?? DEFAULT_QCF_EDITION) === edition;
}

/**
 * Есть ли непрогруженные шрифты у этого издания.
 *
 * 🔴 Фильтр по изданию нужен не для красоты. Плашка «шрифт не приехал»
 * глобальная, а набор неудач общий на всё приложение. Без фильтра
 * сценарий такой: в «Мадани 1405» на плохой сети падает шрифт страницы,
 * человек переключается на обычный мусхаф, тот берётся из кэша и рисуется
 * целиком — а красная плашка об ошибке висит поверх исправного текста и
 * не уходит, пока не нажать «Повторить», который потянет ненужный сейчас
 * шрифт другого издания.
 */
function hasFailed(edition?: QcfEdition): boolean {
  if (!edition) return failed.size > 0;
  for (const family of failed) if (matchesEdition(family, edition)) return true;
  return false;
}
/** Загрузки в полёте, чтобы не просить одно и то же дважды. */
const inFlight = new Map<string, Promise<void>>();

const READY_EVENT = 'qcf-font-ready';
const FAILED_EVENT = 'qcf-font-failed';

/**
 * Вставить `@font-face` для одной пары «шрифт + страница».
 *
 * Правило добавляется в фазе рендера, а не в эффекте: браузер должен
 * начать качать файл до первой отрисовки, иначе к загрузке добавляется
 * лишний кадр ожидания.
 */
export function injectQcfFont(ref: QcfFontRef): string {
  const family = qcfFontFamily(ref);
  if (injected.has(family) || typeof document === 'undefined') return family;
  injected.set(family, ref);

  // У V1 правило вставляет useArabicPageFont: имена файлов этого издания
  // описаны там, и дублировать их здесь значило бы завести второй
  // источник истины про одни и те же 605 файлов.  Если имя семейства
  // окажется чужим, правила не появится — это увидит waitFor и честно
  // отметит неудачу, вместо того чтобы показать кубики.
  if ((ref.edition ?? 'qcf-v4') === 'qcf-v1') {
    injectV1FamilyFont(family);
    return family;
  }

  const style = document.createElement('style');
  style.dataset.qcfFont = family;
  // Пара нужна повтору после сбоя — см. buildInitialMap.
  style.dataset.qcfSrcFont = ref.font;
  style.dataset.qcfPage = String(ref.page);
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
    .then(faces => {
      // Одного «промис не упал» мало.  При 404 браузеры расходятся:
      // одни реджектят, другие резолвятся пустым списком.  Пустой список
      // означает, что глифов не будет, — а значит рисовать текст нельзя.
      //
      // Смотрим статус самих FontFace, а НЕ document.fonts.check().
      // check() без второго аргумента проверяет, нарисуется ли пробел, а
      // в подмножестве страницы бывает один-единственный PUA-глиф без
      // пробела — вполне загруженный шрифт считался бы сломанным, и
      // человек видел бы плашку об ошибке на живом тексте.
      const ok = faces.length > 0 && faces.every(f => f.status === 'loaded');
      if (ok) ready.add(family);
      else failed.add(family);
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

/**
 * Повторить неудавшиеся загрузки.
 *
 * `@font-face` пересоздаём, а не просто просим ещё раз: браузер помнит
 * неудачу по правилу и второй запрос за файлом сам не отправит.
 */
export function retryFailedQcfFonts(edition?: QcfEdition): void {
  if (typeof document === 'undefined') return;
  const again = Array.from(failed).filter(family => matchesEdition(family, edition));
  for (const family of again) failed.delete(family);

  for (const family of again) {
    const ref = injected.get(family);
    document.head
      .querySelectorAll<HTMLStyleElement>(`style[data-qcf-font="${family}"]`)
      .forEach(el => el.remove());
    injected.delete(family);
    // Правило V1 живёт в другом модуле и под другим атрибутом — снять его
    // надо там же, иначе повторная вставка окажется пустой операцией и
    // браузер продолжит помнить неудачу.
    if (ref && (ref.edition ?? 'qcf-v4') === 'qcf-v1') resetArabicPageFont(family);
    if (!ref) continue;
    // Просим сами, а не ждём перерисовки: список семейств у компонентов
    // не изменился, поэтому их эффект загрузки повторно не сработает —
    // раньше повтор убирал плашку, но за файлом никто не шёл.
    injectQcfFont(ref);
    void waitFor(family);
  }
  window.dispatchEvent(new CustomEvent(FAILED_EVENT, { detail: '' }));
}

/**
 * Есть ли шрифты, которые не удалось загрузить.
 *
 * Экран показывает по этому признаку одну общую плашку с повтором —
 * сообщение у каждого аята превратило бы страницу в список ошибок.
 */
export function useQcfFontFailure(
  edition?: QcfEdition,
): { failed: boolean; retry: () => void } {
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
    failed: hasFailed(edition),
    retry: () => retryFailedQcfFonts(edition),
  };
}

/** Готово ли семейство прямо сейчас — без ожидания. */
export function isQcfFontReady(ref: QcfFontRef): boolean {
  return ready.has(qcfFontFamily(ref));
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
      // Пустая строка — сигнал повтора: он сбрасывает признак неудачи
      // сразу для всех, и перерисоваться должны тоже все.
      if (!cancelled && (family === '' || families.includes(family))) {
        bump(n => n + 1);
      }
    };
    window.addEventListener(READY_EVENT, onReady);
    window.addEventListener(FAILED_EVENT, onReady);

    // Уже готовые ждать не нужно — событие по ним больше не придёт.
    // Неудавшиеся снова попадут сюда после retryFailedQcfFonts: он чистит
    // признак неудачи и правило, а waitFor заново дедуплицирует запрос.
    for (const family of families) {
      if (!ready.has(family)) void waitFor(family);
    }
    // Ждали, пока список менялся — сверимся ещё раз.
    if (families.length && families.every(f => ready.has(f))) bump(n => n + 1);

    return () => {
      cancelled = true;
      window.removeEventListener(READY_EVENT, onReady);
      window.removeEventListener(FAILED_EVENT, onReady);
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
