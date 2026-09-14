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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { Appearance, BookOpen, Typography, ICON_SIZE } from '../components/icons';
import { BottomDock } from '../components/BottomDock';
import { QcfMushafPage } from '../components/QcfMushafPage';
import { FontErrorBanner } from '../components/FontErrorBanner';
import { ScreenHeader, screenHeaderOffset } from '../components/ScreenHeader';
import {
  isStripAligned, pageAtScrollLeft, scrollLeftForPage, stripWidth,
} from '../lib/mushafStrip';

/**
 * Зазор между соседними листами, px.
 *
 * 🔴 Одно число и для вида, и для арифметики листания. 07.09.2026 зазор жил
 * только в CSS, а доводка целилась ровно в ширину экрана — и лист в конце
 * подпрыгивал на 18 px. Держать зазор в двух местах нельзя.
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
  const { data, error } = useQcfPage(page, edition);
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
  // Горизонтальное листание целиком делает системная прокрутка iOS (см.
  // шапку `lib/mushafStrip.ts`): дорожка — нативный прокручиваемый контейнер
  // с привязкой к страницам. Здесь остаются только жесты поверх неё:
  // удержание выбирает аят, короткий неподвижный тап показывает/скрывает
  // верхнюю панель.
  const touch = useRef<{
    x: number;
    y: number;
    startedAt: number;
    verseKey: string | null;
    interactive: boolean;
    longPressed: boolean;
    /** Касание остановило идущую прокрутку — это не тап, шапку не трогаем. */
    caughtScroll: boolean;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Номер страницы для обработчика прокрутки — без пересоздания обработчика. */
  const pageRef = useRef(page);
  pageRef.current = page;

  const clearLongPress = () => {
    if (longPressTimer.current != null) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  useEffect(() => () => clearLongPress(), []);

  /**
   * Ширина листа на ленте — ЦЕЛАЯ, в пикселях.
   *
   * 🔴 Замер области бывает дробным (401.98 px — отступы с `env()`). Дробный
   * шаг на ленте в четверть миллиона пикселей набегал: на странице 3 (место
   * 601) расхождение между точкой привязки, которую округляет WebKit, и нашей
   * арифметикой доходило до 10 px — замер в iOS-симуляторе 14.09.2026. Целый
   * шаг даёт точные координаты на всех 604 страницах. Кегль по-прежнему
   * подбирается под настоящую, дробную область.
   */
  const pageWidth = Math.floor(area?.width ?? 0);
  /** Шаг ленты: ширина листа плюс зазор. Без чтения вёрстки. */
  const step = pageWidth + PAGE_GUTTER;

  /** Номер, выставленный самой прокруткой: такой номер ленту не выравнивает. */
  const pageFromScroll = useRef<number | null>(null);
  /**
   * Принятая страница — та, на которой лента ОСТАНОВИЛАСЬ. От неё, а не от
   * номера на ходу, зависят сброс выделения, следование за звуком и запись
   * позиции чтения.
   */
  const acceptedPage = useRef(page);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (settleTimer.current != null) clearTimeout(settleTimer.current);
  }, []);

  /**
   * Лента остановилась на странице — принять её.
   *
   * 🔴 Не на середине пути. Протянул на 60 % и вернул — страница та же, и
   * ничего не должно случиться: ни закрыться лист звучащего аята, ни
   * выключиться следование за звуком (ревью 14.09.2026). `scrollend` в Safari
   * рассчитывать нельзя, поэтому остановку подтверждает тишина событий
   * прокрутки и выровненная лента.
   */
  const settleStrip = () => {
    settleTimer.current = null;
    const track = pageTrackRef.current;
    if (!track || !area) return;
    // Палец держит ленту между листами — ждём: отпускание даст новые события.
    if (!isStripAligned(track.scrollLeft, step)) return;
    if (track.dataset.turning !== undefined) delete track.dataset.turning;
    const стоит = pageAtScrollLeft(track.scrollLeft, step, MUSHAF_FIRST_PAGE, MUSHAF_LAST_PAGE);
    pageFromScroll.current = null;
    if (стоит !== pageRef.current) setPageS(стоит);
    if (стоит !== acceptedPage.current) {
      acceptedPage.current = стоит;
      // Человек сам перелистнул — это важнее автоследования за звуком.
      followsAudio.current = false;
      setSelected(null);
      localStorage.setItem(PAGE_KEY, String(стоит));
    }
  };

  /**
   * Прокрутка ленты → номер страницы.
   *
   * Номер в шапке и окно монтирования меняются посреди движения, как только
   * новая страница заняла больше половины шага: соседи поспевают за глазом.
   * Места листов от номера не зависят (каждый стоит на своей координате
   * ленты), поэтому смена номера ничего на экране не сдвигает. Всё, что
   * «принимает» страницу, — в `settleStrip`.
   */
  const onTrackScroll = () => {
    const track = pageTrackRef.current;
    if (!track || !area) return;
    const x = track.scrollLeft;
    // Пока лента между страницами — `data-turning`: волосок стыка виден, подбор
    // кегля дальних листов ждёт. Пишем только при смене — событие частое.
    const между = !isStripAligned(x, step);
    if (между !== (track.dataset.turning !== undefined)) {
      if (между) track.dataset.turning = '';
      else delete track.dataset.turning;
    }
    const под = pageAtScrollLeft(x, step, MUSHAF_FIRST_PAGE, MUSHAF_LAST_PAGE);
    if (под !== pageRef.current) {
      pageFromScroll.current = под;
      setPageS(под);
    }
    if (settleTimer.current != null) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settleStrip, 120);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    // Второй палец — это масштабирование: снимок касания сбрасываем, иначе
    // отпускание одного пальца дало бы «тап» посреди щипка.
    if (e.touches.length !== 1) {
      touch.current = null;
      clearLongPress();
      return;
    }
    const t = e.touches[0];
    const target = e.target instanceof Element ? e.target : null;
    // Первые 28 px принадлежат системному жесту «Назад» iOS. Ссылки и
    // заблокированные контролы тоже не переключают панель. WebKit доставляет
    // события заблокированной кнопки предку, поэтому :disabled проверяется явно.
    const interactive = t.clientX <= 28
      || !!target?.closest(
        'button, a, input, textarea, select, [role="button"], [aria-disabled="true"]',
      );
    const verseKey = target?.closest<HTMLElement>('[data-verse-key]')
      ?.dataset.verseKey ?? null;
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      startedAt: performance.now(),
      verseKey,
      interactive,
      longPressed: false,
      caughtScroll: pageTrackRef.current?.dataset.turning !== undefined,
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
    if (!start || start.interactive) return;
    const t = e.touches[0];
    // Палец пошёл — это листание или прокрутка, не удержание.
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) clearLongPress();
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
    const moved = Math.hypot(t.clientX - start.x, t.clientY - start.y);
    const elapsed = performance.now() - start.startedAt;
    if (moved <= 8 && elapsed <= 340 && !start.caughtScroll) {
      setThemeOpen(false);
      setHeaderVisible(v => !v);
    }
  };
  const onTouchCancel = () => {
    touch.current = null;
    clearLongPress();
  };

  // 🔴 Окно из пяти слоёв, собранное из двух частей.
  //
  // Соседи текущей страницы (±1) нужны СРАЗУ: они видны, пока палец тянет
  // лист. Соседи через одну (±2) — впрок, и монтируются по отложенному
  // номеру страницы: React собирает их прерываемо, мимо касания.
  //
  // Раньше (при самодельном пейджере) слоёв было три, и каждая смена страницы
  // монтировала нового дальнего соседа прямо в `flushSync` внутри касания — синхронная сборка
  // страницы Корана посреди быстрой серии листаний. Теперь к моменту смены
  // новый сосед уже смонтирован и измерен (он был «через одну»), и смена
  // только меняет номер: места слоёв на ленте от него не зависят.
  const deferredPage = useDeferredValue(page);
  const pageWindow = [...new Set([
    ...mushafPageWindow(page, 1),
    ...mushafPageWindow(deferredPage, 2),
  ])];

  // 🔴 Номер страницы → прокрутка ленты, но только когда номер сменился НЕ
  // прокруткой: стрелками, вслед за звуком, прыжком к аяту, открытием экрана.
  //
  // Номер, пришедший из самой прокрутки, ленту не трогает никогда, даже если
  // к этому моменту она уже ушла дальше: сверка «номер против прокрутки»
  // здесь давала рывок под пальцем (ревью 14.09.2026). И любой внешний номер
  // ждёт, пока лента в движении или палец на экране: явное действие человека
  // важнее автоследования (грабли §7) — остановка сама примет страницу.
  //
  // Смена ширины (поворот, новое окно) меняет шаг, поэтому тогда ленту
  // выравниваем всегда. Эффект раскладки — до кадра, без мигания.
  const выровненоДляШага = useRef(0);
  useLayoutEffect(() => {
    const track = pageTrackRef.current;
    if (!track || !area) return;
    const шагСменился = выровненоДляШага.current !== step;
    выровненоДляШага.current = step;
    const вДвижении = track.dataset.turning !== undefined || touch.current != null;
    const внешний = page !== pageFromScroll.current;
    if (шагСменился || (внешний && !вДвижении
      && pageAtScrollLeft(track.scrollLeft, step, MUSHAF_FIRST_PAGE, MUSHAF_LAST_PAGE) !== page)) {
      track.scrollLeft = scrollLeftForPage(page, step, MUSHAF_LAST_PAGE);
      if (track.dataset.turning !== undefined) delete track.dataset.turning;
      pageFromScroll.current = null;
      // Страница выставлена снаружи — она и принята; остановка не должна
      // принять её ещё раз как «перелистнул сам».
      acceptedPage.current = page;
    }
  }, [page, area, step]);

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
    // Лента в движении или под пальцем — номер сейчас меняет человек, и
    // возвращать его к звучащей странице посреди жеста нельзя.
    if (pageTrackRef.current?.dataset.turning !== undefined || touch.current != null) return;
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
          // Горизонталь отдана ленте страниц — нативной прокрутке.
          touchAction: 'pan-x pinch-zoom',
        }}
      >
        {/* 🔴 Ошибка — плашкой ПОВЕРХ ленты, а лента остаётся. Прежде дорожка
            размонтировалась при ошибке, и без сети листать было больше нечем
            (ревью 14.09.2026). Заготовка строк на время загрузки живёт внутри
            каждого листа (`MushafPageSkeleton`) — отдельная рядом с дорожкой
            делила с ней ширину пополам. */}
        {error && (
          <p style={{
            position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 2, pointerEvents: 'none', margin: 0,
            padding: '0 24px', textAlign: 'center',
            fontSize: 'var(--font-footnote)', lineHeight: 1.6, color: 'var(--text-tertiary)',
          }}>
            Не удалось загрузить страницу {page}.<br />{error}
          </p>
        )}

        {/* Плашка о неприехавшем шрифте — поверх страницы, потому что
            сама страница в этот момент показывает только заготовки строк
            и без объяснения выглядит сломанной. */}
        <div style={{ position: 'absolute', top: 0, left: 12, right: 12, zIndex: 2 }}>
          <FontErrorBanner source={colourMode ? 'both' : 'qcf'} edition={edition} />
        </div>

        <div
          ref={pageTrackRef}
          className="mushaf-page-track"
          onScroll={onTrackScroll}
          style={{
            // Зазор задаётся отсюда, а не из CSS: то же число участвует в
            // расчёте шага ленты, и разъехаться они не должны.
            '--mushaf-gutter': `${PAGE_GUTTER}px`,
            position: 'relative', width: '100%', height: '100%', minHeight: 0,
            // 🔴 Нативная прокрутка с привязкой к страницам — её на iOS
            // ведёт системный UIScrollView (шапка `lib/mushafStrip.ts`).
            overflowX: area ? 'auto' : 'hidden',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            // Резинка на краю книги не утаскивает жест дальше — в «назад»
            // браузера или в прокрутку страницы.
            overscrollBehaviorX: 'contain',
            touchAction: 'pan-x pinch-zoom',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
        >
          {area && (
            <div style={{
              position: 'relative',
              width: stripWidth(pageWidth, PAGE_GUTTER, MUSHAF_FIRST_PAGE, MUSHAF_LAST_PAGE),
              height: '100%',
            }}>
              <MushafSnapPoints step={step} pageWidth={pageWidth} />
              {pageWindow.map(preparedPage => (
                <PreparedMushafPage
                  key={preparedPage}
                  page={preparedPage}
                  visible={preparedPage === page}
                  offset={page - preparedPage}
                  left={scrollLeftForPage(preparedPage, step, MUSHAF_LAST_PAGE)}
                  width={pageWidth}
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
 * Лист стоит на СВОЕЙ координате ленты (`left`) и никуда не двигается сам:
 * двигается прокрутка. Соседний лист (±1) виден, пока страница едет, поэтому
 * подбирает кегль сразу при монтировании. Лист через одну (±2) одним жестом
 * не показать — `scroll-snap-stop: always` не пускает дальше соседа, — и он
 * меряется в простое. Результат в обоих случаях кладётся в кэш.
 */
function PreparedMushafPage({
  page,
  visible,
  offset,
  left,
  width,
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
  /** Сколько страниц от текущей: решает, мерить ли кегль сразу или в простое. */
  offset: number;
  /** Координата листа на ленте, px. */
  left: number;
  /** Ширина листа, px — ширина кадра. */
  width: number;
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
      style={{
        // Соседние листы разведены зазором (шаг ленты = ширина + зазор):
        // между ними видно поле, а не стык двух картинок. Владелец 07.09.2026
        // попросил именно это — «расстояние между двумя листами».
        position: 'absolute',
        top: 0,
        bottom: landscapeWide ? 'auto' : 0,
        left,
        width,
        minHeight: '100%',
        display: 'flex',
        alignItems: landscapeWide ? 'flex-start' : 'center',
        justifyContent: 'center',
        opacity: 1,
        visibility: 'visible',
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? 1 : 0,
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
          deferMeasure={Math.abs(offset) >= 2}
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

/**
 * Точки привязки ленты — по одной на каждую из 604 страниц.
 *
 * Пустые блоки без содержимого: привязка прокрутки работает только по
 * элементам, а смонтированных страниц всего пять. `scroll-snap-stop: always`
 * — одна страница за бросок, как в книге. Пересобираются только при смене
 * ширины.
 */
function MushafSnapPoints({ step, pageWidth }: { step: number; pageWidth: number }) {
  const точки = useMemo(() => Array.from(
    { length: MUSHAF_LAST_PAGE - MUSHAF_FIRST_PAGE + 1 },
    (_, i) => (
      <div
        key={i}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: i * step,
          width: pageWidth,
          height: 1,
          scrollSnapAlign: 'start',
          scrollSnapStop: 'always',
          pointerEvents: 'none',
        }}
      />
    ),
  ), [step, pageWidth]);
  return <>{точки}</>;
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
