import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTheme, themeMode } from './hooks/useTheme';
import { SurahPicker } from './screens/SurahPicker';
import { SurahScreen } from './screens/SurahScreen';
import { MushafScreen } from './screens/MushafScreen';
import { AzkarScreen } from './screens/AzkarScreen';
import { DuaScreen } from './screens/DuaScreen';
import { AzkarCategoryScreen } from './screens/AzkarCategoryScreen';
import { BookmarksScreen } from './screens/BookmarksScreen';
import { PrayerTimesScreen } from './screens/PrayerTimesScreen';
import { QiblaScreen } from './screens/QiblaScreen';
import { CosmicLayer } from './components/CosmicLayer';
import { PaperLayer } from './components/PaperLayer';
import { StatusBarScrim } from './components/StatusBarScrim';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar, type TabId } from './components/TabBar';
import { applyHighlightVars } from './lib/audioPrefs';
import { applyPaletteToDocument } from './lib/tajweedPalette';
import { syncStatusBarToTheme } from './lib/nativeStatusBar';
import { hideSplashAfterFirstPaint } from './lib/nativeSplash';
import { wireAndroidBackButton } from './lib/androidBack';
import type { AzkarCategoryId } from './lib/azkar';

/**
 * Навигация приложения — два уровня.
 *
 *   • `tabs` — корневые разделы, переключает нижняя панель.
 *   • Экраны «поверх» (сура, закладки, лента азкаров) — панель вкладок
 *     скрыта, назад ведёт плавающий хедер самого экрана.
 *
 * В QuranIng разделов было два и они жили горизонтальной слайд-парой:
 * контейнер шириной 200% с translateX, оба экрана всегда смонтированы.
 * С четырьмя разделами приём не масштабируется (контейнер на 400% и
 * четыре живых дерева), поэтому активный раздел теперь ровно один.
 * Побочный эффект — браузер не вернёт позицию прокрутки при возврате
 * на вкладку, поэтому она сохраняется вручную (tabScrollRef ниже).
 */
type Screen =
  | { name: 'tabs'; tab: TabId }
  | { name: 'azkar-category'; category: AzkarCategoryId }
  | { name: 'bookmarks' }
  | { name: 'surah'; number: number; initialAyah?: number }
  // Режим мусхафа — отдельный экран, а не вариант чтения: у него своя
  // единица навигации (страница, не аят) и своя история.
  | { name: 'mushaf'; page: number }
  // Кибла ушла из вкладок: открывается с экрана намаза и имеет свою
  // запись в истории, поэтому системная «назад» возвращает к намазу.
  | { name: 'qibla' };

const INITIAL_SCREEN: Screen = { name: 'tabs', tab: 'quran' };

export default function App() {
  const { theme, setTheme } = useTheme();
  const [screen, setScreen] = useState<Screen>(INITIAL_SCREEN);
  const isCosmic = themeMode(theme) === 'cosmic';
  const cosmicVariant = theme === 'aurora2' ? 'aurora2' as const : 'aurora' as const;
  const isPaper = theme === 'mushaf';

  // ── History-API routing ──────────────────────────────────────────────────
  // Каждый переход вперёд кладёт в history запись со следующим Screen.
  // Системный «назад» (edge-swipe на iOS, аппаратная кнопка на Android,
  // кнопка браузера) прилетает как popstate и превращается обратно в
  // setScreen — отдельной проводки не нужно.  Кнопки «назад» внутри
  // экранов зовут goBack() (= history.back()), чтобы выход был один и
  // два пути не разъезжались.
  //
  // Переключение вкладки — тоже переход вперёд: системный «назад»
  // возвращает на предыдущую вкладку, а не выбрасывает из приложения
  // сразу.  На Android это ожидаемое поведение.
  const navigate = (next: Screen) => {
    // Позицию уходящей вкладки снимаем ЗДЕСЬ, а не в эффекте: к моменту
    // эффекта новый экран уже мог сбросить скролл (SurahScreen делает
    // это, когда восстанавливать нечего), и мы записали бы ноль.
    rememberTabScroll();
    setScreen(next);
    history.pushState({ screen: next }, '');
  };
  const goBack = () => {
    rememberTabScroll();
    history.back();
  };

  useEffect(() => {
    // Привязываем текущую запись истории к стартовому экрану, чтобы
    // последующие history.back() не откатились в состояние, оставшееся
    // от прошлой перезагрузки или hot-reload'а.
    // `root: true` помечает самую первую запись истории.  По ней
    // обработчик аппаратной «назад» на Android отличает «мы в корне,
    // выходить» от «есть куда возвращаться» — см. lib/androidBack.ts.
    history.replaceState({ screen: INITIAL_SCREEN, root: true }, '');
    const onPop = (e: PopStateEvent) => {
      // popstate прилетает ДО перерисовки, поэтому window.scrollY здесь
      // ещё принадлежит уходящему экрану — момент снять его позицию.
      // Нужно для системного «назад» между вкладками: программные
      // переходы это делают в navigate()/goBack().
      rememberTabScroll();
      // На самой первой записи истории state пуст — она соответствует
      // стартовому экрану.
      setScreen((e.state?.screen ?? INITIAL_SCREEN) as Screen);
    };
    window.addEventListener('popstate', onPop);
    const unwireBack = wireAndroidBackButton();
    return () => {
      window.removeEventListener('popstate', onPop);
      unwireBack();
    };
  }, []);

  // Инжектим <style id="tajweed-palette"> — по одному блоку
  // @font-palette-values на каждое постраничное семейство таджвида.
  // Пересобирается на смену темы: базовая палитра переключается между
  // тёмной и светлой, иначе на светлой странице каллиграфия рисовалась
  // бы белым по белому.
  useEffect(() => { applyPaletteToDocument(); }, [theme]);

  // Переменные подсветки — на первый кадр и на каждую смену темы.
  // Светлая тема принудительно сводит стиль подсветки к 'color'
  // независимо от сохранённого выбора, поэтому результат зависит от
  // темы и пересчитывается вместе с ней.
  useEffect(() => { applyHighlightVars(theme); }, [theme]);

  // Нативный статус-бар (iOS + Android) под тему.  В вебе no-op.
  useEffect(() => { syncStatusBarToTheme(theme); }, [theme]);

  // Снять нативный сплэш после первого отрисованного кадра.  Конфиг
  // держит заставку до явного вызова (launchAutoHide: false), поэтому
  // без этого эффекта приложение зависло бы на ней — ровно та ошибка,
  // что осталась незамеченной в QuranIng.
  useEffect(() => { hideSplashAfterFirstPaint(); }, []);

  // ── Позиция прокрутки вкладок ────────────────────────────────────────────
  // Активная вкладка одна, остальные размонтированы, поэтому браузер
  // сам позицию не вернёт.  Запоминаем scrollY уходящей вкладки и
  // восстанавливаем при возврате — иначе список сур каждый раз
  // открывается сверху, хотя человек читал середину.
  //
  // Экраны «поверх» тут не участвуют: SurahScreen сам решает, куда
  // встать (последний прочитанный аят либо аят из закладки).
  const tabScrollRef = useRef<Partial<Record<TabId, number>>>({});
  const currentTab = screen.name === 'tabs' ? screen.tab : null;
  // Держим активную вкладку в ref'е, чтобы rememberTabScroll могла
  // работать синхронно из обработчика, не завися от замыкания рендера.
  const currentTabRef = useRef<TabId | null>(currentTab);
  currentTabRef.current = currentTab;

  function rememberTabScroll() {
    const t = currentTabRef.current;
    if (t) tabScrollRef.current[t] = window.scrollY;
  }

  useEffect(() => {
    if (!currentTab) return;
    // Двойной rAF: первый кадр монтирует содержимое вкладки, второй
    // получает уже разложенную страницу нужной высоты — до этого
    // scrollTo упёрся бы в короткий документ и обрезался.
    const saved = tabScrollRef.current[currentTab] ?? 0;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, saved));
    });
    return () => cancelAnimationFrame(id);
  }, [currentTab]);

  // Экраны «поверх» всегда открываются с начала.  Исключение — сура:
  // она сама восстанавливает позицию чтения, и сброс здесь гонялся бы
  // с её эффектом.
  useEffect(() => {
    if (screen.name === 'tabs' || screen.name === 'surah') return;
    window.scrollTo(0, 0);
  }, [screen.name]);

  // ── Экраны «поверх» ──────────────────────────────────────────────────────
  if (screen.name === 'surah') {
    return (
      <Shell isCosmic={isCosmic} isPaper={isPaper} cosmicVariant={cosmicVariant}>
        <ErrorBoundary name="SurahScreen" onReset={goBack}>
          <SurahScreen
            surahNumber={screen.number}
            initialAyah={screen.initialAyah}
            theme={theme}
            setTheme={setTheme}
            onBack={goBack}
            onOpenSurah={(n, ayah) => navigate({ name: 'surah', number: n, initialAyah: ayah })}
            onOpenMushaf={page => navigate({ name: 'mushaf', page })}
          />
        </ErrorBoundary>
      </Shell>
    );
  }

  if (screen.name === 'mushaf') {
    return (
      <Shell isCosmic={isCosmic} isPaper={isPaper} cosmicVariant={cosmicVariant}>
        <ErrorBoundary name="MushafScreen" onReset={goBack}>
          <MushafScreen
            initialPage={screen.page}
            theme={theme}
            setTheme={setTheme}
            onBack={goBack}
          />
        </ErrorBoundary>
      </Shell>
    );
  }

  if (screen.name === 'qibla') {
    return (
      <Shell isCosmic={isCosmic} isPaper={isPaper} cosmicVariant={cosmicVariant}>
        <ErrorBoundary name="QiblaScreen" onReset={goBack}>
          <QiblaScreen theme={theme} setTheme={setTheme} onBack={goBack} />
        </ErrorBoundary>
      </Shell>
    );
  }

  if (screen.name === 'bookmarks') {
    return (
      <Shell isCosmic={isCosmic} isPaper={isPaper} cosmicVariant={cosmicVariant}>
        <ErrorBoundary name="BookmarksScreen" onReset={goBack}>
          <BookmarksScreen
            theme={theme}
            setTheme={setTheme}
            onBack={goBack}
            onOpen={(number, ayah) => navigate({ name: 'surah', number, initialAyah: ayah })}
          />
        </ErrorBoundary>
      </Shell>
    );
  }

  if (screen.name === 'azkar-category') {
    return (
      <Shell isCosmic={isCosmic} isPaper={isPaper} cosmicVariant={cosmicVariant}>
        <ErrorBoundary name="AzkarCategoryScreen" onReset={goBack}>
          <AzkarCategoryScreen
            category={screen.category}
            theme={theme}
            setTheme={setTheme}
            onBack={goBack}
          />
        </ErrorBoundary>
      </Shell>
    );
  }

  // ── Корневые вкладки ─────────────────────────────────────────────────────
  const tab = screen.tab;
  return (
    <Shell isCosmic={isCosmic} isPaper={isPaper} cosmicVariant={cosmicVariant}>
      {tab === 'quran' && (
        <ErrorBoundary name="SurahPicker">
          <SurahPicker
            onSelectSurah={(n, ayah) => navigate({ name: 'surah', number: n, initialAyah: ayah })}
            onBookmarks={() => navigate({ name: 'bookmarks' })}
            theme={theme}
            setTheme={setTheme}
          />
        </ErrorBoundary>
      )}
      {tab === 'azkar' && (
        <ErrorBoundary name="AzkarScreen">
          <AzkarScreen
            theme={theme}
            setTheme={setTheme}
            onOpenCategory={c => navigate({ name: 'azkar-category', category: c })}
          />
        </ErrorBoundary>
      )}
      {tab === 'dua' && (
        <ErrorBoundary name="DuaScreen">
          <DuaScreen theme={theme} setTheme={setTheme} />
        </ErrorBoundary>
      )}
      {tab === 'prayer' && (
        <ErrorBoundary name="PrayerTimesScreen">
          <PrayerTimesScreen
            theme={theme}
            setTheme={setTheme}
            onOpenQibla={() => navigate({ name: 'qibla' })}
          />
        </ErrorBoundary>
      )}
      <TabBar
        active={tab}
        onSelect={next => {
          if (next === tab) {
            // Повторный тап по активной вкладке — «наверх», как в
            // системных приложениях.
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          navigate({ name: 'tabs', tab: next });
        }}
      />
    </Shell>
  );
}

/** Общая обёртка: фон темы под контентом, контент над ним.
 *  Космос и бумага взаимоисключающи — это разные темы, — но проверки
 *  независимы, чтобы добавление третьего фона не требовало правки
 *  условий. */
function Shell({ isCosmic, isPaper, cosmicVariant, children }: {
  isCosmic: boolean;
  isPaper: boolean;
  cosmicVariant: 'aurora' | 'aurora2';
  children: ReactNode;
}) {
  return (
    <>
      {isCosmic && <CosmicLayer variant={cosmicVariant} />}
      {isPaper && <PaperLayer />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
      {/* Крышка под системной строкой — последней в дереве, чтобы
          лежать поверх контента любого экрана. */}
      <StatusBarScrim />
    </>
  );
}
