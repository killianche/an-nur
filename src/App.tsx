import {
  useState, useEffect, useLayoutEffect, useRef, lazy, Suspense,
  type ReactNode,
} from 'react';
import { useTheme, themeMode } from './hooks/useTheme';
import { SurahPicker } from './screens/SurahPicker';
import type { DocumentId } from './screens/DocumentScreen';

import { CosmicLayer } from './components/CosmicLayer';
import { PaperLayer } from './components/PaperLayer';
import { StatusBarScrim } from './components/StatusBarScrim';
import {
  IosEdgeBackGesture,
  type IosBackPreview,
} from './components/IosEdgeBackGesture';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar, type TabId } from './components/TabBar';
import { applyHighlightVars } from './lib/audioPrefs';
import { applyPaletteToDocument } from './lib/tajweedPalette';
import { syncStatusBarToTheme } from './lib/nativeStatusBar';
import { hideSplashAfterFirstPaint } from './lib/nativeSplash';
import { wireAndroidBackButton } from './lib/androidBack';
import { warmQuranSources } from './content/quran-sources-lazy';
import { readActiveId, readCities } from './lib/prayerCities';
import { startPrayerAlarmScheduler } from './lib/prayerNotifications';
import type { AzkarCategoryId } from './lib/azkar';

/*
 * Экраны, кроме списка сур, грузятся отдельными чанками.
 *
 * Раньше все 11 экранов лежали в главном бандле, и WKWebView разбирал их
 * до первого кадра вместе с 3.7 МБ текста Корана. Список сур — первое, что
 * человек видит, поэтому он остаётся обычным импортом; всё остальное
 * приезжает по факту перехода. Экспорты именованные, поэтому default
 * подставляем вручную.
 */
const SurahScreen = lazy(() => import('./screens/SurahScreen').then(m => ({ default: m.SurahScreen })));
const MushafScreen = lazy(() => import('./screens/MushafScreen').then(m => ({ default: m.MushafScreen })));
const AzkarScreen = lazy(() => import('./screens/AzkarScreen').then(m => ({ default: m.AzkarScreen })));
const DuaScreen = lazy(() => import('./screens/DuaScreen').then(m => ({ default: m.DuaScreen })));
const AzkarCategoryScreen = lazy(() => import('./screens/AzkarCategoryScreen').then(m => ({ default: m.AzkarCategoryScreen })));
const BookmarksScreen = lazy(() => import('./screens/BookmarksScreen').then(m => ({ default: m.BookmarksScreen })));
const PrayerTimesScreen = lazy(() => import('./screens/PrayerTimesScreen').then(m => ({ default: m.PrayerTimesScreen })));
const QiblaScreen = lazy(() => import('./screens/QiblaScreen').then(m => ({ default: m.QiblaScreen })));
const AccountScreen = lazy(() => import('./screens/AccountScreen').then(m => ({ default: m.AccountScreen })));
const DocumentScreen = lazy(() => import('./screens/DocumentScreen').then(m => ({ default: m.DocumentScreen })));

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
  | { name: 'qibla' }
  // Юридические документы — вложенный экран, а не ссылка наружу: они
  // лежат в пакете и обязаны открываться без интернета.
  | { name: 'document'; doc: DocumentId };

/**
 * Заглушка на время подгрузки чанка экрана.
 *
 * Пустой блок в полную высоту, без спиннера: чанки лежат в пакете
 * приложения и приезжают за десятки миллисекунд, а мелькнувший индикатор
 * читается как сбой. Высоту держим, чтобы фон темы не схлопывался.
 */
function ScreenFallback() {
  return <div style={{ minHeight: '100dvh' }} aria-hidden="true" />;
}

const INITIAL_SCREEN: Screen = { name: 'tabs', tab: 'quran' };

export default function App() {
  const { theme, setTheme } = useTheme();
  const [screen, setScreen] = useState<Screen>(INITIAL_SCREEN);
  const [backPreview, setBackPreview] = useState<IosBackPreview | null>(null);
  /**
   * Проигрывать ли короткое появление у следующего экрана.
   *
   * Только на переходах ВПЕРЁД. Возврат — свайпом, кнопкой или системной
   * «назад» — не анимируется: экран, к которому вернулись, уже был виден
   * человеку, и повторное проявление читается как мигание. На первом кадре
   * приложения тоже не анимируем: там ещё стоит нативная заставка.
   *
   * Раньше это решалось атрибутом `data-ios-edge-back-commit` на <html> и
   * правилом `animation: none` в CSS. Приём давал ровно тот дефект, от
   * которого защищал: снятие атрибута меняло вычисленное `animation-name`
   * с `none` на имя, и по спецификации CSS Animations запускалась НОВАЯ
   * анимация — через пару кадров после жеста экран гас до 72% и проявлялся
   * заново.
   */
  const [animateEnter, setAnimateEnter] = useState(false);
  const quranHomePreviewRef = useRef<IosBackPreview | null>(null);
  const isCosmic = themeMode(theme) === 'cosmic';
  const cosmicVariant = theme === 'aurora2' ? 'aurora2' as const : 'aurora' as const;
  const isPaper = theme === 'mushaf';
  const isDotted = theme === 'aurora';

  // ── History-API routing ──────────────────────────────────────────────────
  // Каждый переход вперёд кладёт в history запись со следующим Screen.
  // Системный «назад» (edge-swipe на iOS, аппаратная кнопка на Android,
  // кнопка браузера) прилетает как popstate и превращается обратно в
  // setScreen — отдельной проводки не нужно.  Кнопки «назад» внутри
  // экранов обычно зовут goBack() (= history.back()). Исключение — оба
  // режима чтения Корана: их стрелка всегда ведёт к выбору суры, потому
  // что смена «лента ↔ мусхаф» имеет отдельную кнопку.
  //
  // Переключение вкладки — тоже переход вперёд: системный «назад»
  // возвращает на предыдущую вкладку, а не выбрасывает из приложения
  // сразу.  На Android это ожидаемое поведение.
  /**
   * Переход между экранами.
   *
   * `back: true` — переход, который человек воспринимает как возврат, даже
   * если технически это `pushState` (стрелка из режимов чтения всегда ведёт
   * к выбору суры, а не по истории). Возврат не проигрывает анимацию
   * появления: экран, к которому вернулись, не должен «приезжать» заново.
   */
  const navigate = (next: Screen, opts: { back?: boolean } = {}) => {
    // Позицию уходящей вкладки снимаем ЗДЕСЬ, а не в эффекте: к моменту
    // эффекта новый экран уже мог сбросить скролл (SurahScreen делает
    // это, когда восстанавливать нечего), и мы записали бы ноль.
    rememberTabScroll();

    // Для интерактивного iOS edge-pop сохраняем настоящий DOM уходящего
    // экрана. Во время жеста он будет виден под текущим — как предыдущий
    // UIViewController под верхним экраном UINavigationController.
    // Клонируем узел, а не сериализуем в outerHTML: строка потом заново
    // разбиралась WebKit'ом в первом кадре жеста, и это была самая дорогая
    // часть свайпа назад. Атрибут data-app-screen с копии снимаем, иначе
    // следующий querySelector нашёл бы клон вместо настоящего экрана.
    //
    // Клон нужен только экранам «поверх»: у корневых вкладок нет жеста
    // возврата от края, и preview им показывать негде. Раньше клонировали
    // всегда — и выход из суры к списку тратил длинную синхронную задачу
    // ровно в кадре перехода, копируя сотни статей с span'ом на каждое
    // слово. Это и ощущалось как рывок при нажатии «назад».
    const needsPreview = next.name !== 'tabs';
    const node = needsPreview
      ? document.querySelector<HTMLElement>('[data-app-screen="current"]')
      : null;
    let captured: IosBackPreview | null = null;
    if (node) {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-app-screen');
      captured = { node: clone, scrollY: window.scrollY };
    }
    if (screen.name === 'tabs' && screen.tab === 'quran' && captured) {
      quranHomePreviewRef.current = captured;
    }
    const returnsToQuran = next.name === 'surah' || next.name === 'mushaf';
    setBackPreview(
      returnsToQuran
        ? (quranHomePreviewRef.current ?? captured)
        : captured,
    );

    setAnimateEnter(!opts.back);
    setScreen(next);
    history.pushState({ screen: next }, '');
  };
  const goBack = () => {
    rememberTabScroll();
    setAnimateEnter(false);
    history.back();
  };
  const goQuranHome = () => navigate({ name: 'tabs', tab: 'quran' }, { back: true });

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
      setAnimateEnter(false);
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

  // Обновляем <style id="tajweed-palette">. В нём только реально
  // запрошенные в этой сессии постраничные семейства, не все 604.
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

  // Переводы Корана лежат отдельным чанком, чтобы не задерживать первый
  // кадр. Прогреваем их в простое сразу после него: к моменту, когда
  // человек откроет суру или начнёт искать, словарь обычно уже готов.
  useEffect(() => { warmQuranSources(); }, []);

  // Локальные напоминания живут независимо от вкладки «Намаз»: при каждом
  // запуске и возврате приложения обновляем ближайшие даты по основному
  // расписанию. Разрешение здесь не запрашивается — только после явного тапа
  // человека по колокольчику на экране намаза.
  useEffect(() => {
    let stop = () => {};
    let disposed = false;
    void startPrayerAlarmScheduler(() => {
      const list = readCities();
      const id = readActiveId(list);
      return list.find(city => city.id === id) ?? list[0] ?? null;
    }).then(unwire => {
      if (disposed) unwire();
      else stop = unwire;
    });
    return () => {
      disposed = true;
      stop();
    };
  }, []);

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

  useLayoutEffect(() => {
    if (!currentTab) return;
    // Ставим сохранённую позицию до первого видимого кадра. Прежний
    // двойной rAF сначала показывал начало списка, а через два кадра
    // резко переставлял его на сохранённую позицию — это и выглядело
    // как рывок при возврате из суры.
    const saved = tabScrollRef.current[currentTab] ?? 0;
    window.scrollTo(0, saved);
  }, [currentTab]);

  // Экраны «поверх» всегда открываются с начала.  Исключение — сура:
  // она сама восстанавливает позицию чтения, и сброс здесь гонялся бы
  // с её эффектом.
  useLayoutEffect(() => {
    if (screen.name === 'tabs' || screen.name === 'surah') return;
    window.scrollTo(0, 0);
  }, [screen.name]);

  // ── Экраны «поверх» ──────────────────────────────────────────────────────
  if (screen.name === 'surah') {
    return (
      <Shell key="surah" isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter} onEdgeBack={goQuranHome} edgeBackPreview={backPreview}>
        <Suspense fallback={<ScreenFallback />}>
        <ErrorBoundary name="SurahScreen" onReset={goQuranHome}>
          <SurahScreen
            surahNumber={screen.number}
            initialAyah={screen.initialAyah}
            theme={theme}
            setTheme={setTheme}
            onBack={goQuranHome}
            onOpenMushaf={page => navigate({ name: 'mushaf', page })}
          />
        </ErrorBoundary>
        </Suspense>
      </Shell>
    );
  }

  if (screen.name === 'mushaf') {
    return (
      <Shell key="mushaf" isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter} onEdgeBack={goQuranHome} edgeBackPreview={backPreview}>
        <Suspense fallback={<ScreenFallback />}>
        <ErrorBoundary name="MushafScreen" onReset={goQuranHome}>
          <MushafScreen
            initialPage={screen.page}
            theme={theme}
            setTheme={setTheme}
            /* «Назад» из книжного вида ведёт к выбору суры, а не по истории.
               По истории он возвращал в ленту — то есть делал то же, что
               кнопка переключения вида, только неявно. Два способа сменить
               вид сбивают: у переключения есть своя кнопка, а «назад»
               должен выводить из режима наружу. */
            onBack={goQuranHome}
            onOpenFeed={(n, ayah) => navigate({ name: 'surah', number: n, initialAyah: ayah })}
          />
        </ErrorBoundary>
        </Suspense>
      </Shell>
    );
  }

  if (screen.name === 'qibla') {
    return (
      <Shell key="qibla" isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter} onEdgeBack={goBack} edgeBackPreview={backPreview}>
        <Suspense fallback={<ScreenFallback />}>
        <ErrorBoundary name="QiblaScreen" onReset={goBack}>
          <QiblaScreen theme={theme} setTheme={setTheme} onBack={goBack} />
        </ErrorBoundary>
        </Suspense>
      </Shell>
    );
  }

  if (screen.name === 'document') {
    return (
      <Shell key="document" isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter} onEdgeBack={goBack} edgeBackPreview={backPreview}>
        <Suspense fallback={<ScreenFallback />}>
        <ErrorBoundary name="DocumentScreen" onReset={goBack}>
          <DocumentScreen doc={screen.doc} onBack={goBack} />
        </ErrorBoundary>
        </Suspense>
      </Shell>
    );
  }

  if (screen.name === 'bookmarks') {
    return (
      <Shell key="bookmarks" isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter} onEdgeBack={goBack} edgeBackPreview={backPreview}>
        <Suspense fallback={<ScreenFallback />}>
        <ErrorBoundary name="BookmarksScreen" onReset={goBack}>
          <BookmarksScreen
            theme={theme}
            setTheme={setTheme}
            onBack={goBack}
            onOpen={(number, ayah) => navigate({ name: 'surah', number, initialAyah: ayah })}
          />
        </ErrorBoundary>
        </Suspense>
      </Shell>
    );
  }

  if (screen.name === 'azkar-category') {
    return (
      <Shell key="azkar-category" isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter} onEdgeBack={goBack} edgeBackPreview={backPreview}>
        <Suspense fallback={<ScreenFallback />}>
        <ErrorBoundary name="AzkarCategoryScreen" onReset={goBack}>
          <AzkarCategoryScreen
            category={screen.category}
            theme={theme}
            setTheme={setTheme}
            onBack={goBack}
          />
        </ErrorBoundary>
        </Suspense>
      </Shell>
    );
  }

  // ── Корневые вкладки ─────────────────────────────────────────────────────
  const tab = screen.tab;
  return (
    <Shell key={`tabs-${tab}`} isCosmic={isCosmic} isPaper={isPaper} isDotted={isDotted} cosmicVariant={cosmicVariant} animateEnter={animateEnter}>
      {/* Вкладки под одним Suspense, а TabBar снаружи: иначе панель
          вкладок пропадала бы на время подгрузки чанка экрана. */}
      <Suspense fallback={<ScreenFallback />}>
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
      {tab === 'account' && (
        <ErrorBoundary name="AccountScreen">
          <AccountScreen
            theme={theme}
            setTheme={setTheme}
            onOpenDocument={doc => navigate({ name: 'document', doc })}
          />
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
      </Suspense>
      <TabBar
        active={tab}
        onSelect={next => {
          if (next === tab) {
            // TabBar вызывает этот путь только после двух быстрых тапов
            // по активной вкладке «Коран» — прокручиваем список сур к началу.
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
function Shell({
  isCosmic,
  isPaper,
  isDotted,
  cosmicVariant,
  onEdgeBack,
  edgeBackPreview,
  animateEnter,
  children,
}: {
  isCosmic: boolean;
  isPaper: boolean;
  isDotted: boolean;
  cosmicVariant: 'aurora' | 'aurora2';
  onEdgeBack?: () => void;
  edgeBackPreview?: IosBackPreview | null;
  /** Проигрывать короткое появление. Только на переходах вперёд. */
  animateEnter?: boolean;
  children: ReactNode;
}) {
  const currentScreenRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={currentScreenRef}
        data-app-screen="current"
        className={animateEnter ? 'app-screen-enter' : undefined}
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100dvh',
          isolation: 'isolate',
          background: isDotted
            ? 'radial-gradient(circle, rgba(116, 106, 92, 0.16) 1.45px, transparent 1.7px) 18px 9px / 60px 60px, var(--surface)'
            : (isCosmic || isPaper ? 'transparent' : 'var(--surface)'),
        }}
      >
        {isCosmic && <CosmicLayer variant={cosmicVariant} />}
        {isPaper && <PaperLayer />}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
        {/* Крышка под системной строкой входит в уходящий экран и движется
            вместе с ним во время интерактивного edge-pop. */}
        <StatusBarScrim />
      </div>
      {onEdgeBack && (
        <IosEdgeBackGesture
          onBack={onEdgeBack}
          currentScreenRef={currentScreenRef}
          preview={edgeBackPreview}
        />
      )}
    </>
  );
}
