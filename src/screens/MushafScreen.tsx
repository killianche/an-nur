/**
 * MushafScreen — чтение мусхафа страницами, только арабский.
 *
 * Отдельный режим, а не вариант ленты аятов.  В ленте главное — аят с
 * переводом, экран листается вниз, и текст свёрстан так, как удобно
 * экрану.  Здесь главное — страница мединского мусхафа ровно такая,
 * какая она в печатном издании: пятнадцать строк, та же разбивка слов
 * по строкам, тот же порядок.  Человек, который учит наизусть, держит в
 * памяти картинку страницы, и любая пересборка вёрстки эту картинку
 * ломает.
 *
 * ── Что здесь принципиально ───────────────────────────────────────────
 *
 * Страница видна целиком и не прокручивается.  Прокрутка внутри
 * страницы означала бы, что «полной страницы» нет, а есть кусок.
 * Кегль подбирается под экран — см. components/QcfMushafPage.tsx.
 *
 * Листание — справа налево, как в печатной книге: палец идёт вправо —
 * приходит следующая страница.  Это не мелочь: у того, кто читает
 * мусхаф, направление зашито в моторику.
 *
 * ── Удержание аята ────────────────────────────────────────────────────
 *
 * Удержание открывает компактный аудиоплеер. Верхняя панель может
 * визуально уехать по чистому тапу, но не размонтируется и не меняет
 * геометрию страницы.
 *
 * Кегль по-прежнему диктует страница, но у того же издания доступны два
 * постраничных лица: обычный QCF V4 и цветной QPC V4 Tajweed. Оба
 * используют фиксированные строки источника; это не свободная перевёрстка.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Appearance, BookOpen, Typography, ICON_SIZE } from '../components/icons';
import { BottomDock } from '../components/BottomDock';
import { QcfMushafPage } from '../components/QcfMushafPage';
import { FontErrorBanner } from '../components/FontErrorBanner';
import { ScreenHeader, screenHeaderOffset } from '../components/ScreenHeader';
import {
  approachTau, clampSpeed, isSettled, projectTarget, stepFling, type FlingState,
} from '../lib/mushafFling';

/**
 * Зазор между соседними листами, px.
 *
 * 🔴 Одно число и для вида, и для арифметики доводки — иначе рывок.
 *
 * 07.09.2026 зазор жил только в CSS, а доводка целилась ровно в ширину
 * экрана. Соседний лист при этом стоит на «ширина + зазор», поэтому в самом
 * конце страница доезжала и ПОДПРЫГИВАЛА на 18 px, подравнивая разницу.
 * Владелец увидел это сразу: «в самом конце дёргается, подравнивая
 * добавленный отступ». Держать зазор в двух местах нельзя.
 */
const PAGE_GUTTER = 18;
import { MushafReadingSettings, ThemeSettings } from '../components/ReadingSettings';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { useAudioActions, useAudioState, useAudioTick } from '../hooks/AudioProvider';
import { ensurePage, preloadPage, useQcfPage } from '../hooks/useQcfPage';
import { preloadQcfFonts } from '../hooks/useQcfFont';
import {
  preloadTajweedFont,
  TAJWEED_FONT_SAMPLE,
  useTajweedFont,
} from '../hooks/useTajweedFont';
import { preloadTajweedPage, useTajweedPage } from '../hooks/useTajweedPage';
import { pageFontRefs, type QcfEdition } from '../lib/qcf4';
import type { Theme } from '../hooks/useTheme';
import {
  juzOfPage,
  mushafPageWindow,
  pageOfAyah,
  surahAyahOfPage,
} from '../lib/mushafPages';
import {
  usesWholeAyahHighlight,
} from '../lib/reciters';
import { fontFamilyForPage } from '../content/quran-tajweed-meta';
import {
  readMushafFont,
  mushafEdition,
  writeMushafFont,
  type MushafFontId,
} from '../lib/mushafFont';
import {
  audioStateForVerse,
  mushafActiveVerseKey,
} from '../lib/mushafAudio';
import { lockReaderOrientation } from '../lib/screenOrientation';

export const MUSHAF_FIRST_PAGE = 1;
export const MUSHAF_LAST_PAGE = 604;

type Props = {
  initialPage: number;
  onBack: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /**
   * Уйти в ленту аятов на том же месте.
   *
   * Кнопка книги работает переключателем: в ленте она уводит на страницу
   * мусхафа, здесь — возвращает к тому же аяту с переводом.  Раньше назад
   * вела только кнопка «Назад», и это читалось как выход, а не как смена
   * вида одного и того же текста.
   */
  onOpenFeed?: (surah: number, ayah: number) => void;
};

const PAGE_KEY = 'mushaf.page';
/** Запомненная страница — чтобы режим открывался там, где закрыли. */
export function readMushafPage(): number {
  if (typeof window === 'undefined') return MUSHAF_FIRST_PAGE;
  const n = parseInt(localStorage.getItem(PAGE_KEY) ?? '', 10);
  return Number.isFinite(n) && n >= MUSHAF_FIRST_PAGE && n <= MUSHAF_LAST_PAGE
    ? n : MUSHAF_FIRST_PAGE;
}

export function MushafScreen({ initialPage, onBack, theme, setTheme, onOpenFeed }: Props) {
  const [page, setPageS] = useState(() => clampPage(initialPage));
  const [selected, setSelected] = useState<string | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [themeOpen, setThemeOpen] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const readingBtnRef = useRef<HTMLButtonElement>(null);
  const [mushafFont, setMushafFontState] = useState<MushafFontId>(readMushafFont);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  // Звук общий на всё приложение (`AudioProvider`): чтение суры переживает
  // уход с экрана, а чтец один на ленту и мусхаф. Раньше он жил двумя
  // независимыми `useState`, и смена в одном месте не доходила до другого.
  const audioActions = useAudioActions();
  const audioSt = useAudioState();
  const reciter = audioSt.reciter;
  const setReciter = audioActions.setReciter;
  const audio = { ...audioSt, ...audioActions };
  // Прогресс и позиция слова приходят отдельным контекстом: они меняются
  // несколько раз в секунду, и подписан на них только тот, кому они правда
  // нужны — караоке-подсветка и полоса плеера. Список сур на главном экране
  // их не получает и на тиках не перерисовывается.
  const tick = useAudioTick();
  // Выбор шрифта определяет и издание: у «Мадани 1405» свои данные страниц
  // в /qcf1/pages.  Смешать издания нельзя — PUA-коды у них общие, а слова
  // за этими кодами разные.
  const edition = mushafEdition(mushafFont);
  const { data, loading, error } = useQcfPage(page, edition);
  const colourMode = mushafFont === 'qpc-v4-tajweed';
  const tajweedFamily = fontFamilyForPage(page);
  // Шрифт открытой страницы заказывается уже в первом рендере, до
  // прихода обоих JSON. Фиксированный PUA sample попадает в unicode-range
  // каждого постраничного лица и не создаёт последовательной задержки.
  const warmCurrentTajweed = useCallback(() => {
    preloadTajweedPage(page);
    if (tajweedFamily) {
      preloadTajweedFont(page, tajweedFamily, TAJWEED_FONT_SAMPLE);
    }
  }, [page, tajweedFamily]);

  useEffect(() => {
    void lockReaderOrientation('portrait');
    return () => { void lockReaderOrientation('portrait'); };
  }, []);

  const setMushafFont = useCallback((font: MushafFontId) => {
    writeMushafFont(font);
    setMushafFontState(font);
    if (font === 'qpc-v4-tajweed') {
      warmCurrentTajweed();
    }
  }, [warmCurrentTajweed]);

  /**
   * Ведёт ли звук ЭТОТ экран.
   *
   * 🔴 Пока аудио принадлежало экрану, вопрос не стоял: раз звучит — значит
   * отсюда. Теперь звук общий на приложение, и сура может играть, запущенная
   * с главной. Без этого признака мусхаф вёл себя так: на входе прыгал на
   * страницу звучащей суры, затирал сохранённую позицию чтения, а дальше
   * любой свайп немедленно откатывался обратно — листать было нельзя вовсе.
   *
   * Ставится, когда звук запущен тапом по аяту ЗДЕСЬ; снимается, как только
   * человек сам перелистнул страницу: явное действие человека важнее
   * автоследования (те же грабли §7).
   */
  const followsAudio = useRef(false);

  const setPage = useCallback((n: number) => {
    const next = clampPage(n);
    followsAudio.current = false;
    setPageS(next);
    setSelected(null);
    localStorage.setItem(PAGE_KEY, String(next));
  }, []);

  // Соседние страницы подгружаем заранее: листание должно быть
  // мгновенным, а json страницы — единицы килобайт.
  //
  // Вместе с json тянем и шрифты этих страниц.  После нарезки по
  // страницам это около 70 КБ на страницу — незаметно в фоне, зато
  // перелистывание открывает готовый текст, без скелета.
  useEffect(() => {
    const neighbours = [
      page + 1 <= MUSHAF_LAST_PAGE ? page + 1 : null,
      page - 1 >= MUSHAF_FIRST_PAGE ? page - 1 : null,
    ];
    for (const n of neighbours) {
      preloadPage(n, edition);
      if (n == null) continue;
      if (colourMode) {
        preloadTajweedPage(n);
        const family = fontFamilyForPage(n);
        if (family) preloadTajweedFont(n, family, TAJWEED_FONT_SAMPLE);
      }
      // JSON соседней страницы может ещё ехать. Дожидаемся его вместо
      // одноразовой синхронной проверки, которая часто ничего не находила.
      void ensurePage(n, edition).then(known => {
        // В цветном режиме основной текст рисует шрифт таджвида, и из QCF
        // нужны только заголовок суры с басмалой.  Вне его — вся страница
        // целиком, а какие у неё шрифты, знает pageFontRefs: у V4 они
        // записаны на словах, у V1 — на самой странице.
        if (colourMode) {
          const decor = known.lines.filter(line => line.words.some(word =>
            word.type === 'surah_header' || word.type === 'bismillah'));
          preloadQcfFonts(
            pageFontRefs({ ...known, lines: decor }),
          );
        } else {
          preloadQcfFonts(pageFontRefs(known));
        }
      }).catch(() => { /* соседняя страница не должна ломать текущую */ });
    }
  }, [page, data, colourMode, edition]);

  // Клавиатура: стрелки листают. Влево — следующая страница, потому что
  // книга арабская и «вперёд» здесь физически налево.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setPage(page + 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPage(page - 1); }
      if (e.key === 'Escape' && selected) setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, selected, setPage]);

  // ── Место под страницу ──────────────────────────────────────────────
  // Меряем реально доступный прямоугольник, а не считаем по формуле:
  // на разных телефонах шапка, вырез и «дом-бар» дают разный остаток.
  const areaRef = useRef<HTMLDivElement>(null);
  const pageTrackRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      // QcfMushafPage вписывается во внутреннюю область. Передавать сюда
      // border-box нельзя: в него входят отступ под фиксированную шапку и
      // нижний safe-area. Тогда страница центрируется по завышенной высоте
      // и выходит за область — в том числе под расположенный ниже плеер.
      const css = getComputedStyle(el);
      const horizontalPadding = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
      const verticalPadding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
      setArea({
        width: Math.max(0, el.clientWidth - horizontalPadding),
        height: Math.max(0, el.clientHeight - verticalPadding),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Жесты страницы ──────────────────────────────────────────────────
  // Удержание выбирает аят, горизонтальный жест листает страницу, а
  // короткий неподвижный тап показывает/скрывает верхнюю панель.
  const touch = useRef<{
    x: number;
    y: number;
    /** Где стоял лист в момент касания: жест продолжает движение, а не начинает с нуля. */
    baseX: number;
    /** Предыдущая точка и её время — для мгновенной скорости при отпускании. */
    lastX: number;
    lastAt: number;
    startedAt: number;
    verseKey: string | null;
    interactive: boolean;
    longPressed: boolean;
    axis: 'pending' | 'horizontal' | 'vertical';
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Живое состояние листа: где он сейчас и с какой скоростью идёт.
   *
   * 🔴 Одно на всё — и на палец, и на полёт. Раньше их было двое: смещение
   * пальца и отдельный CSS-переход доводки, и они спорили. Новое касание
   * могло только ОБОРВАТЬ переход, а обрыв ставил лист на место мгновенно —
   * отсюда и рывок при быстром листании. Теперь касание просто продолжает
   * то же движение с той же скоростью.
   */
  const fling = useRef<FlingState>({ x: 0, v: 0 });
  /** Куда лист едет сейчас: 0 — назад на место, ±шаг — на соседнюю. */
  const flingTarget = useRef(0);
  /** Страница, которую нужно зафиксировать, когда лист доедет. */
  const flingPage = useRef<number | null>(null);
  const flingFrame = useRef<number | null>(null);
  const flingClock = useRef(0);
  /** Постоянная времени текущего полёта: её задаёт скорость отпускания. */
  const flingTau = useRef(0);
  const dragFrame = useRef<number | null>(null);
  const pendingDrag = useRef(0);

  const clearLongPress = () => {
    if (longPressTimer.current != null) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  /**
   * Показать листы на координате x.
   *
   * 🔴 Трансформация пишется КАЖДОМУ слою напрямую, а не одной переменной
   * на дорожку. Разница не косметическая: переменная на родителе
   * обесценивает стиль всего поддерева, а в поддереве полторы сотни слов
   * страницы. Замер показал ровно это — при кадровой записи переменной
   * пересчёт стилей за шестнадцать листаний вырос с ~700 мс до ~2100 мс,
   * то есть анимация начала стоить дороже, чем экономила. Инлайновый
   * `transform` трогает три элемента и ничего не наследует.
   */
  const writeX = useCallback((x: number) => {
    const track = pageTrackRef.current;
    if (!track) return;
    // Пока лист движется — показываем корешок между страницами (см. CSS
    // `.mushaf-page-track[data-turning]`). В покое он не нужен: лист один.
    if (x !== 0) track.dataset.turning = '';
    else delete track.dataset.turning;
    const step = (track.clientWidth || window.innerWidth) + PAGE_GUTTER;
    for (const слой of Array.from(track.children) as HTMLElement[]) {
      const offset = Number(слой.dataset.offset ?? 0);
      const own = offset > 0 ? step : offset < 0 ? -step : 0;
      слой.style.transform = `translate3d(${own + x}px, 0, 0)`;
    }
  }, []);

  /** Смещение пальца рисуем не чаще кадра: touchmove приходит чаще. */
  const paintDrag = useCallback((x: number) => {
    pendingDrag.current = x;
    if (dragFrame.current != null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      writeX(pendingDrag.current);
    });
  }, [writeX]);

  const stopFling = useCallback(() => {
    if (flingFrame.current != null) cancelAnimationFrame(flingFrame.current);
    flingFrame.current = null;
  }, []);

  /**
   * Зафиксировать перевёрнутую страницу, не сдвинув картинку ни на пиксель.
   *
   * 🔴 Здесь вся суть переделки. Слои расставлены относительно ТЕКУЩЕЙ
   * страницы, поэтому смена номера сама по себе двигает их ровно на шаг.
   * Значит одновременно с номером надо вычесть шаг из смещения — и на
   * экране не изменится ничего. `flushSync` не оставляет между этими двумя
   * действиями ни одного кадра, иначе лист мигнул бы на шаг в сторону.
   *
   * Прежний код делал ровно это в конце доводки, но ТОЛЬКО в конце. Если
   * доводку обрывали касанием, он всё равно доводил смещение до нуля —
   * то есть телепортировал лист на остаток пути. Теперь фиксация не
   * привязана к концу движения: её можно сделать в любой момент, в том
   * числе прямо под пальцем.
   */
  const commitPage = useCallback((step: number) => {
    const target = flingPage.current;
    if (target == null || step === 0) return;
    fling.current.x -= step;
    flingTarget.current = 0;
    flingPage.current = null;
    flushSync(() => setPage(target));
    writeX(fling.current.x);
  }, [setPage, writeX]);

  const runFling = useCallback(() => {
    stopFling();
    // Чем быстрее отпустили, тем короче полёт — ровно то, что просил
    // владелец: «если быстро перелистываешь, они быстрее перелистываются».
    flingTau.current = approachTau(
      fling.current.x - flingTarget.current,
      fling.current.v,
    );
    flingClock.current = performance.now();
    const tick = (now: number) => {
      flingFrame.current = null;
      const dt = now - flingClock.current;
      flingClock.current = now;
      const target = flingTarget.current;
      fling.current = stepFling(fling.current, target, dt, flingTau.current);
      if (isSettled(fling.current, target)) {
        fling.current = { x: target, v: 0 };
        if (target !== 0) {
          commitPage(target);
        } else {
          writeX(0);
        }
        fling.current.v = 0;
        return;
      }
      writeX(fling.current.x);
      flingFrame.current = requestAnimationFrame(tick);
    };
    flingFrame.current = requestAnimationFrame(tick);
  }, [commitPage, stopFling, writeX]);

  const resetPager = useCallback(() => {
    stopFling();
    if (dragFrame.current != null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pendingDrag.current = 0;
    fling.current = { x: 0, v: 0 };
    flingTarget.current = 0;
    flingPage.current = null;
    writeX(0);
  }, [stopFling, writeX]);

  useEffect(() => () => {
    clearLongPress();
    resetPager();
  }, [resetPager]);

  const onTouchStart = (e: React.TouchEvent) => {
    // 🔴 Лист на ходу НЕ ставится на место — он перехватывается там, где
    // сейчас есть, вместе со своей скоростью. Именно доводка «до конца» и
    // давала рывок при быстром листании: лист был на полпути, а его
    // мгновенно телепортировали на остаток.
    //
    // Если страница уже была переведена в соседнюю, фиксируем её прямо
    // сейчас — визуально это ничего не меняет (см. `commitPage`), зато
    // следующий свайп начинает с чистого листа и может перевернуть ещё одну.
    stopFling();
    if (flingTarget.current !== 0) commitPage(flingTarget.current);
    flingTarget.current = 0;
    // Второй палец — это масштабирование (touchAction разрешает pinch-zoom).
    // Без этой проверки он перезаписывал снимок касания, и отпускание одного
    // пальца давало «неподвижный тап» с малым смещением: панель прыгала
    // посреди щипка.
    if (e.touches.length !== 1) {
      touch.current = null;
      clearLongPress();
      return;
    }
    const t = e.touches[0];
    const target = e.target instanceof Element ? e.target : null;
    // Первые 28 px принадлежат системному жесту «Назад» iOS. Пейджер не
    // конкурирует с ним и не пытается одновременно перелистнуть мусхаф.
    // Список целей тот же, что в ленте: ссылки и заблокированные контролы
    // тоже не должны переключать панель. WebKit доставляет события
    // заблокированной кнопки предку, поэтому :disabled проверяется явно.
    const interactive = t.clientX <= 28
      || !!target?.closest(
        'button, a, input, textarea, select, [role="button"], [aria-disabled="true"]',
      );
    const verseKey = target?.closest<HTMLElement>('[data-verse-key]')
      ?.dataset.verseKey ?? null;
    const now = performance.now();
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      // Лист мог не успеть вернуться — тянем от того места, где он стоит,
      // а не от нуля. Иначе он прыгнул бы под пальцем.
      baseX: fling.current.x,
      lastX: t.clientX,
      lastAt: now,
      startedAt: now,
      verseKey,
      interactive,
      longPressed: false,
      axis: 'pending',
    };
    clearLongPress();
    if (verseKey && !interactive) {
      longPressTimer.current = setTimeout(() => {
        if (!touch.current) return;
        touch.current.longPressed = true;
        setSelected(verseKey);
      }, 460);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touch.current;
    // 🔴 Условия «идёт доводка» здесь больше нет. Раньше она глушила
    // движение целиком: пока лист доезжал, палец не слушался вовсе.
    if (!start || start.interactive) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.hypot(dx, dy) > 12) {
      clearLongPress();
    }
    if (start.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
      start.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'horizontal' : 'vertical';
    }
    if (start.axis !== 'horizontal') return;

    e.preventDefault();
    const canTurn = dx > 0
      ? page < MUSHAF_LAST_PAGE
      : page > MUSHAF_FIRST_PAGE;
    // На границе книги остаётся мягкое сопротивление вместо пустого экрана.
    const visualDx = canTurn ? dx : dx * 0.18;

    // Мгновенная скорость по последним двум точкам, а не по всему жесту:
    // важно, чем ЗАКОНЧИЛОСЬ движение, а не каким оно было в среднем.
    // Палец, притормозивший перед отпусканием, не должен бросать лист.
    const now = performance.now();
    const dtMove = now - start.lastAt;
    if (dtMove > 0) {
      const мгновенная = (t.clientX - start.lastX) / dtMove;
      // Сглаживание: одиночный выброс координаты не должен решать судьбу листа.
      fling.current.v = clampSpeed(fling.current.v * 0.3 + мгновенная * 0.7);
      start.lastX = t.clientX;
      start.lastAt = now;
    }
    fling.current.x = start.baseX + visualDx;
    paintDrag(fling.current.x);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    clearLongPress();
    if (!start || start.interactive) return;
    if (start.longPressed) {
      // Не позволяем WebKit породить click после удержания.
      e.preventDefault();
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const elapsed = Math.max(1, performance.now() - start.startedAt);
    if (start.axis === 'pending') {
      if (Math.hypot(dx, dy) <= 8 && elapsed <= 340) {
        setThemeOpen(false);
        setHeaderVisible(v => !v);
      }
      return;
    }
    if (start.axis !== 'horizontal') return;

    const width = Math.max(1, pageTrackRef.current?.clientWidth ?? window.innerWidth);
    // Целимся в ширину ПЛЮС зазор: ровно туда, где стоит соседний лист.
    const step = width + PAGE_GUTTER;
    // Порог тот же, что был: пятая часть экрана, но не больше 104 px.
    const threshold = Math.min(104, width * 0.18);
    const target = projectTarget(fling.current.x, fling.current.v, step, threshold, {
      canForward: page < MUSHAF_LAST_PAGE,
      canBack: page > MUSHAF_FIRST_PAGE,
    });

    flingTarget.current = target;
    flingPage.current = target === 0 ? null : page + (target > 0 ? 1 : -1);
    runFling();
  };

  const onTouchCancel = () => {
    const start = touch.current;
    touch.current = null;
    clearLongPress();
    if (start?.axis !== 'horizontal') return;
    // Отменённый жест возвращает лист на место — тоже пружиной, а не рывком.
    flingTarget.current = 0;
    flingPage.current = null;
    runFling();
  };

  // Три слоя живут одновременно: открытый и два соседних. React сохраняет
  // их по номеру страницы, поэтому после свайпа уже измеренный сосед просто
  // становится видимым, а новый дальний сосед готовится вне экрана.
  const pageWindow = mushafPageWindow(page);

  const surahsHere = data?.surahs ?? [];
  const title = surahsHere.length
    ? surahsHere
        // В данных V1 названия сур нет — только номер, поэтому справочник
        // приложения здесь основной источник, а поле страницы запасной.
        .map(s => SURAH_BY_NUMBER[s.id]?.transliteration ?? s.name ?? `Сура ${s.id}`)
        .join(' · ')
    : `Страница ${page}`;

  // useAyahAudio хранит activeKey как `чтец:сура:аят`. Данные мусхафа
  // используют `сура:аят`, поэтому сравнивать с activeKey напрямую нельзя:
  // из-за этого старый плеер никогда не показывал Pause и не подсвечивал
  // звучащее слово. Берём публичные координаты очереди, как SurahScreen.
  const activeVerseKey = mushafActiveVerseKey(audio.currentSurah, audio.currentAyah);
  const selectedIsActive = !!selected && activeVerseKey === selected;
  const selectedAudioState = audioStateForVerse(selected, activeVerseKey, audio.audioState);

  // Полноэкранный мусхаф следует за очередью так же, как лента следует
  // за активным аятом: плеер, выделение и страница не остаются позади
  // после кнопок «предыдущий/следующий» или автоперехода.
  useEffect(() => {
    if (!followsAudio.current) return;
    if (!audio.currentSurah || !audio.currentAyah || audio.audioState === 'idle') return;
    const verseKey = `${audio.currentSurah}:${audio.currentAyah}`;
    // Издание обязательно: у «Мадани 1405» своя разбивка страниц, и без
    // него автоперелистывание за аудио встало бы на странице, где
    // звучащего аята нет.
    const audioPage = pageOfAyah(audio.currentSurah, audio.currentAyah, edition);
    if (audioPage !== page) {
      setPageS(audioPage);
      localStorage.setItem(PAGE_KEY, String(audioPage));
    }
    setSelected(verseKey);
  }, [audio.currentSurah, audio.currentAyah, audio.audioState, page]);

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      background: 'transparent',
    }}>
      <ScreenHeader
          visible={headerVisible}
          title={title}
          subtitle={`Страница ${page} · Джуз ${juzOfPage(page)}`}
          onBack={onBack}
          actions={[
          ...(onOpenFeed ? [{
            key: 'feed',
            label: 'Вернуться к ленте с переводом',
            icon: <BookOpen size={ICON_SIZE.lg} />,
            onClick: () => {
              const { surah, ayah } = surahAyahOfPage(page, edition);
              onOpenFeed(surah, ayah);
            },
          }] : []),
          {
            key: 'mushaf-reading',
            // Кнопка открывает выбор, а не перебирает варианты по кругу.
            // Перебор годился, пока вариант был один — шрифт; с чтецом это
            // уже два независимых списка, и цикл по ним был бы угадайкой.
            label: 'Чтение: шрифт и чтец',
            icon: <Typography size={ICON_SIZE.lg} />,
            active: readingOpen,
            ref: readingBtnRef,
            onClick: () => {
              setThemeOpen(false);
              setReadingOpen(v => !v);
            },
          },
          {
            key: 'theme',
            label: 'Оформление',
            icon: <Appearance size={ICON_SIZE.lg} />,
            active: themeOpen,
            ref: themeBtnRef,
            onClick: () => {
              // Пока человек открывает оформление и выбирает цветной
              // вариант, текущий файл уже едет в фоне.
              warmCurrentTajweed();
              setReadingOpen(false);
              setThemeOpen(v => !v);
            },
          },
          ]}
      />

      {themeOpen && (
        <ThemeSettings
          theme={theme} setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {readingOpen && (
        <MushafReadingSettings
          font={mushafFont}
          setFont={setMushafFont}
          reciter={reciter}
          setReciter={setReciter}
          onClose={() => setReadingOpen(false)}
          anchorEl={readingBtnRef.current}
        />
      )}

      {/* ── Страница ─────────────────────────────────────────────────── */}
      <div
        ref={areaRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onContextMenu={e => e.preventDefault()}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // 🔴 Сверху отводится ПОЛНАЯ высота панели, а не только «чёлка».
          //
          // Недолго здесь стоял резерв в «чёлку плюс 6px» — ради большей
          // страницы, с рассуждением «читают с убранной панелью, а она
          // полупрозрачная и убирается одним тапом». Рассуждение неверное:
          // при показанной панели под неё уходила ПЕРВАЯ СТРОКА СТРАНИЦЫ.
          // Владелец поймал это на своём iPhone на странице 130 — строка
          // «قُلْ أَىُّ شَىْءٍ أَكْبَرُ شَهَـٰدَةً» была не видна, пока панель не убрана.
          //
          // Скрытая строка Корана недопустима ни на секунду и ни при каком
          // состоянии интерфейса (`CLAUDE.md`, правило видимости). Размер
          // страницы — вещь приятная, целостность текста — обязательная.
          // При конфликте выигрывает текст.
          //
          // Значение берётся из `screenHeaderOffset()`, общего для всех
          // экранов: собственная арифметика здесь однажды и разъехалась с
          // настоящей высотой панели.
          //
          // Геометрия остаётся постоянной при любом состоянии панели —
          // это важно: иначе ResizeObserver менял бы fitTo, и QCF заново
          // подбирал кегль прямо во время чтения. Поэтому резерв не
          // «дышит» вместе с панелью: когда она убрана, сверху просто
          // остаётся пустое поле, а кегль не прыгает.
          paddingTop: screenHeaderOffset(),
          // Снизу резерв под плеер аята. Он постоянный по той же причине:
          // появление плеера не должно запускать новый подбор кегля. Но
          // 76px было с запасом — плеер сведён к одной строке и занимает
          // около 48px над «домашней» полосой. 56px закрывают его целиком
          // и не дают перекрыть нижнюю строку Корана.
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 56px)',
          position: 'relative',
          touchAction: 'pan-y pinch-zoom',
        }}
      >
        {error && (
          <p style={{
            padding: '0 24px', textAlign: 'center',
            fontSize: 'var(--font-footnote)', lineHeight: 1.6, color: 'var(--text-tertiary)',
          }}>
            Не удалось загрузить страницу {page}.<br />{error}
          </p>
        )}

        {!error && !data && loading && (
          <div style={{ width: '100%', padding: '0 max(4px, env(safe-area-inset-left), env(safe-area-inset-right))' }} aria-hidden>
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="skeleton"
                style={{
                  height: '18px', borderRadius: '4px',
                  margin: '0 auto 14px',
                  // Строки мусхафа выровнены по обоим краям, кроме
                  // последней в суре — заглушка это повторяет, чтобы при
                  // подмене ничего не прыгнуло.
                  width: i % 7 === 6 ? '55%' : '100%',
                }}
              />
            ))}
          </div>
        )}

        {/* Плашка о неприехавшем шрифте — поверх страницы, потому что
            сама страница в этот момент показывает только заготовки строк
            и без объяснения выглядит сломанной. */}
        <div style={{ position: 'absolute', top: 0, left: 12, right: 12, zIndex: 2 }}>
          <FontErrorBanner source={colourMode ? 'both' : 'qcf'} edition={edition} />
        </div>

        {!error && (
          <div ref={pageTrackRef} className="mushaf-page-track" style={{
            // Зазор задаётся отсюда, а не из CSS: то же число участвует в
            // расчёте доводки, и разъехаться они не должны.
            '--mushaf-gutter': `${PAGE_GUTTER}px`,
            position: 'relative', width: '100%', height: '100%', minHeight: 0,
            overflowY: 'hidden',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}>
            {pageWindow.map(preparedPage => (
              <PreparedMushafPage
                key={preparedPage}
                page={preparedPage}
                visible={preparedPage === page}
                offset={page - preparedPage}
                fitTo={area}
                activeVerseKey={activeVerseKey}
                activeWordPos={tick.currentWordPos}
                wholeAyahAudioHighlight={usesWholeAyahHighlight(reciter)}
                selectedVerseKey={selected}
                landscapeWide={false}
                variant={mushafFont}
                edition={edition}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── Лист выбранного аята ─────────────────────────────────────── */}
      {selected && (
        <AyahSheet
          verseKey={selected}
          audioState={selectedAudioState}
          progress={selectedIsActive ? tick.progress : 0}
          playbackRate={audio.playbackRate}
          currentAyah={selectedIsActive ? audio.currentAyah : Number(selected.split(':')[1])}
          onPlayPause={() => {
            const [s, a] = selected.split(':').map(Number);
            // Звук запущен отсюда — значит странице можно следовать за ним.
            followsAudio.current = true;
            audio.handlePlay(s, a, SURAH_BY_NUMBER[s]?.ayahs ?? a);
          }}
          onPrev={audio.prev}
          onNext={audio.next}
          onCyclePlaybackRate={audio.cyclePlaybackRate}
          onClose={() => {
            // Без листа плеер в этом режиме был бы скрыт. Закрытие листа
            // поэтому одновременно останавливает звук, а не оставляет
            // невидимое воспроизведение без доступной кнопки Stop.
            audio.stopAll();
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Одна постоянно смонтированная страница из маленького окна вокруг текущей.
 *
 * Слой смонтирован и виден: он стоит на ширину экрана в сторону и едет за
 * пальцем, показывая зазор между листами. Поэтому подобрать кегль он обязан
 * заранее, до того как въедет в кадр, — QcfMushafPage делает это сразу при
 * монтировании, а результат кладёт в кэш, чтобы при возврате не мерить снова.
 */
function PreparedMushafPage({
  page,
  visible,
  offset,
  fitTo,
  activeVerseKey,
  activeWordPos,
  wholeAyahAudioHighlight,
  selectedVerseKey,
  landscapeWide,
  variant,
  edition,
}: {
  page: number;
  visible: boolean;
  offset: number;
  fitTo: { width: number; height: number } | null;
  activeVerseKey: string | null;
  activeWordPos: number | null;
  wholeAyahAudioHighlight: boolean;
  selectedVerseKey: string | null;
  landscapeWide: boolean;
  variant: MushafFontId;
  /**
   * Издание страницы.  Приходит пропом, а не вычисляется из `variant`
   * на месте: соседние слои монтируются заранее, и слой, загрузивший
   * страницу не того издания, показал бы чужой арабский после свайпа.
   */
  edition: QcfEdition;
}) {
  const { data } = useQcfPage(page, edition);
  const colourMode = variant === 'qpc-v4-tajweed';
  const tajweedPage = useTajweedPage(page, colourMode);
  const family = fontFamilyForPage(page);
  const tajweedFontReady = useTajweedFont(
    page,
    family,
    TAJWEED_FONT_SAMPLE,
    colourMode,
  );

  return (
    <div
      aria-hidden={!visible}
      className="mushaf-page-layer"
      data-current={visible ? '' : undefined}
      // Своё место слоя в px считает пейджер: он же двигает лист каждый кадр.
      data-offset={offset}
      style={{
        // Соседние листы разведены зазором: между ними видно поле, а не
        // стык двух картинок. Владелец 07.09.2026 попросил именно это —
        // «расстояние между двумя листами» вместо прежнего свечения.
        '--mushaf-page-offset': offset === 0
          ? '0%'
          : offset > 0
            ? 'calc(100% + var(--mushaf-gutter))'
            : 'calc(-100% - var(--mushaf-gutter))',
        position: 'absolute',
        inset: landscapeWide ? '0 0 auto' : 0,
        minHeight: '100%',
        display: 'flex',
        alignItems: landscapeWide ? 'flex-start' : 'center',
        justifyContent: 'center',
        opacity: 1,
        visibility: 'visible',
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? 1 : 0,
        willChange: 'transform',
        contain: 'layout paint style',
      } as React.CSSProperties}
    >
      {data ? (
        <QcfMushafPage
          pageData={data}
          fitTo={fitTo}
          activeVerseKey={activeVerseKey}
          activeWordPos={activeWordPos}
          wholeAyahAudioHighlight={wholeAyahAudioHighlight}
          selectedVerseKey={selectedVerseKey}
          landscapeWide={landscapeWide}
          variant={variant}
          tajweedPageData={tajweedPage.data}
          tajweedFontReady={tajweedFontReady}
        />
      ) : (
        <MushafPageSkeleton />
      )}
    </div>
  );
}

function MushafPageSkeleton() {
  return (
    <div style={{ width: '100%', padding: '18px max(4px, env(safe-area-inset-left), env(safe-area-inset-right))' }} aria-hidden>
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 18,
            borderRadius: 4,
            margin: '0 auto 14px',
            width: i % 7 === 6 ? '55%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

function clampPage(n: number): number {
  if (!Number.isFinite(n)) return MUSHAF_FIRST_PAGE;
  return Math.min(MUSHAF_LAST_PAGE, Math.max(MUSHAF_FIRST_PAGE, Math.round(n)));
}

/**
 * Компактный плеер выбранного аята.
 *
 * Плеер закреплён поверх нижней системной области и не участвует в flex-
 * расчёте. Поэтому его появление не уменьшает страницу и не запускает
 * повторный подбор кегля мусхафа.
 */
function AyahSheet({
  verseKey,
  audioState,
  progress,
  playbackRate,
  currentAyah,
  onPlayPause,
  onPrev,
  onNext,
  onCyclePlaybackRate,
  onClose,
}: {
  verseKey: string;
  audioState: 'idle' | 'loading' | 'playing' | 'paused';
  progress: number;
  playbackRate: number;
  currentAyah: number | null;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCyclePlaybackRate: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Аят ${verseKey}`}
      style={{
        position: 'absolute', zIndex: 45,
        left: 0, right: 0, bottom: 0,
        width: '100%',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)',
        borderTop: '1px solid var(--hairline)',
        borderTopLeftRadius: '14px', borderTopRightRadius: '14px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.28)',
        padding: '5px 8px calc(env(safe-area-inset-bottom) + 5px)',
        animation: 'sheet-up 0.22s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <div>
        <BottomDock
          layout="inline"
          inlineLabel={verseKey}
          audioState={audioState}
          currentAyah={currentAyah}
          progress={progress}
          playbackRate={playbackRate}
          onPlayPause={onPlayPause}
          onPrev={onPrev}
          onNext={onNext}
          onCyclePlaybackRate={onCyclePlaybackRate}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
