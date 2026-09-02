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
import { pageTurnDuration } from '../lib/mushafTurn';
import { MushafReadingSettings, ThemeSettings } from '../components/ReadingSettings';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { useAudioActions, useAudioState } from '../hooks/AudioProvider';
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
    startedAt: number;
    verseKey: string | null;
    interactive: boolean;
    longPressed: boolean;
    axis: 'pending' | 'horizontal' | 'vertical';
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDrag = useRef(0);
  const turning = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current != null) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const paintDrag = useCallback((x: number) => {
    pendingDrag.current = x;
    if (dragFrame.current != null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      pageTrackRef.current?.style.setProperty('--mushaf-drag-x', `${pendingDrag.current}px`);
    });
  }, []);

  const resetPager = useCallback(() => {
    if (turnTimer.current != null) clearTimeout(turnTimer.current);
    turnTimer.current = null;
    if (dragFrame.current != null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pendingDrag.current = 0;
    turning.current = false;
    const track = pageTrackRef.current;
    if (!track) return;
    track.style.setProperty('--mushaf-turn-duration', '0ms');
    track.style.setProperty('--mushaf-drag-x', '0px');
  }, []);

  useEffect(() => () => {
    clearLongPress();
    resetPager();
  }, [resetPager]);

  // Фиксируем страницу только после завершения движения. До этого React не
  // получает ни одного обновления: тяжёлые арабские строки уже находятся в
  // соседнем GPU-слое и просто следуют за пальцем.
  const settlePageTurn = useCallback((dragX: number, nextPage: number | null, velocity = 0) => {
    const track = pageTrackRef.current;
    if (!track || turning.current) return;
    turning.current = true;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const width = Math.max(1, track.clientWidth || window.innerWidth);
    const duration = reducedMotion
      ? 0
      : pageTurnDuration(dragX - pendingDrag.current, width, velocity);
    if (dragFrame.current != null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
    track.style.setProperty('--mushaf-turn-duration', `${duration}ms`);
    track.style.setProperty('--mushaf-drag-x', `${dragX}px`);

    const finish = () => {
      turnTimer.current = null;
      // Порядок здесь важен, и он обратный тому, что кажется естественным.
      //
      // Сначала гасим длительность и возвращаем трек в ноль, и только потом
      // меняем страницу. Раньше было наоборот, и это давало вторую
      // «доездку» листа после свайпа: внутри flushSync монтируется новый
      // слой QcfMushafPage, а его layout-эффекты читают clientWidth и
      // getBoundingClientRect, чтобы подобрать кегль. Это принудительный
      // пересчёт стилей — в момент, когда длительность перехода ещё 320ms,
      // сдвиг ещё равен ширине экрана, а смещение слоёв уже новое. Переход
      // стартовал, а последующая смена transition-duration уже идущий
      // переход не отменяет.
      track.style.setProperty('--mushaf-turn-duration', '0ms');
      track.style.setProperty('--mushaf-drag-x', '0px');
      // flushSync не оставляет промежуточного кадра между новым номером
      // страницы и возвратом трека в нулевую координату.
      if (nextPage != null) flushSync(() => setPage(nextPage));
      pendingDrag.current = 0;
      turning.current = false;
    };

    if (duration === 0) finish();
    else turnTimer.current = setTimeout(finish, duration + 24);
  }, [setPage]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (turning.current) return;
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
    if (!start || start.interactive || turning.current) return;
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
    pageTrackRef.current?.style.setProperty('--mushaf-turn-duration', '0ms');
    paintDrag(visualDx);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    clearLongPress();
    if (!start || start.interactive || turning.current) return;
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

    const velocity = Math.abs(dx) / elapsed;
    const width = Math.max(1, pageTrackRef.current?.clientWidth ?? window.innerWidth);
    const delta = dx > 0 ? 1 : -1;
    const next = page + delta;
    const insideBook = next >= MUSHAF_FIRST_PAGE && next <= MUSHAF_LAST_PAGE;
    const committed = insideBook
      && (Math.abs(dx) >= Math.min(104, width * 0.18)
        || (Math.abs(dx) >= 20 && velocity >= 0.48));

    if (committed) settlePageTurn(delta > 0 ? width : -width, next, velocity);
    else settlePageTurn(0, null, velocity);
  };

  const onTouchCancel = () => {
    const start = touch.current;
    touch.current = null;
    clearLongPress();
    if (start?.axis === 'horizontal' && !turning.current) settlePageTurn(0, null);
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
            position: 'relative', width: '100%', height: '100%', minHeight: 0,
            overflowY: 'hidden',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}>
            {pageWindow.map(preparedPage => (
              <PreparedMushafPage
                key={preparedPage}
                page={preparedPage}
                visible={preparedPage === page}
                offset={page - preparedPage}
                fitTo={area}
                activeVerseKey={activeVerseKey}
                activeWordPos={audio.currentWordPos}
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
          progress={selectedIsActive ? audio.progress : 0}
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
 * `visibility: hidden` не убирает слой из layout: QcfMushafPage успевает
 * загрузить шрифты, измерить строки и подобрать кегль. При листании меняется
 * только visibility, без синхронной сборки арабского текста в жесте.
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
      style={{
        '--mushaf-page-offset': `${offset * 100}%`,
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
