/**
 * QcfMushafPage — одна страница мединского мусхафа, целиком.
 *
 * Изданий два: QCF V4 (мусхаф 1441 г.х.) и QCF V1 («Мадани 1405»).
 * Формат данных у них общий, а вот шрифты устроены по-разному, и
 * компонент обязан брать издание из `pageData.edition`, а не угадывать
 * его по имени шрифта: PUA-коды у изданий общие, слова за ними разные.
 *
 * Каждое слово на странице — ОДИН глиф из области частного использования
 * (U+F100…), нарисованный шрифтом, под который эта страница свёрстана.
 * Строки заданы в данных явно: переносить текст не нужно, вёрстка уже
 * такая же, как в печатном мусхафе.
 *
 * ── Почему пословные span'ы не нарушают сакральное правило ─────────────
 *
 * Правило запрещает разрывать арабское шейпинг-склеивание внутри слова
 * (см. CLAUDE.md §7).  Здесь оно не нарушается: слово целиком — это уже
 * готовый глиф, склейка запечена в самом шрифте, а между словами в
 * арабском связи и не бывает.  Разбиение идёт ровно по границам слов,
 * как в самом мусхафе.
 *
 * ── Подгонка под экран ────────────────────────────────────────────────
 *
 * Страница обязана быть видна целиком — в этом весь смысл режима.
 * Кегль не берётся из настроек, а вычисляется: сначала прикидка по
 * высоте (15 строк), потом замер реальной вёрстки и поправка, если
 * самая длинная строка не влезла по ширине.  Проходов до трёх: ширина
 * зависит от кегля почти линейно, но продвижения глифов округляются под
 * пиксельную сетку, и после первой поправки остаётся невязка.
 *
 * Ширина строки — сумма ширин слов, а не `scrollWidth`.  У строки,
 * выключенной по центру, содержимое вылезает на обе стороны, и
 * `scrollWidth` засчитывает только один край; у выключенной по ширине он
 * слеп совсем.  Правила подгонки вынесены в `lib/mushafFit.ts` и покрыты
 * тестами, здесь остаётся чтение вёрстки.
 *
 * Подобранное кладётся в кэш на модуле: страница, к которой вернулись,
 * не меряется заново и получает ровно тот же кегль.  Несошедшаяся
 * подгонка не кешируется — иначе плохой кегль застрял бы на всю сессию.
 *
 * Почему не `transform: scale()` — он даёт мыло на тексте и убивает
 * попадание пальцем: у отмасштабированного слоя координаты тапа
 * перестают совпадать с макетом.
 *
 * ── Подсветка ─────────────────────────────────────────────────────────
 *
 * Два независимых уровня:
 *   activeVerseKey + activeWordPos — слово, которое звучит сейчас
 *     (караоке при воспроизведении);
 *   selectedVerseKey — весь аят, который человек выбрал удержанием.
 */

import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQcfFont } from '../hooks/useQcfFont';
import { ArabicSkeleton } from './ArabicSkeleton';
import { SurahPlate } from './SurahPlate';
import { distinctFontRefs, editionOf, pageFontRefs, qcfWordFamily } from '../lib/qcf4';
import type { QcfPageData, QcfWord } from '../lib/qcf4';
import { fontFamilyForPage } from '../content/quran-tajweed-meta';
import { PALETTE_NAME } from '../lib/tajweedPalette';
import { tajweedVisualWordPosition } from '../lib/tajweedAudioPosition';
import { MAX_FIT_PASSES, fitScale, lineJustified } from '../lib/mushafFit';
import type { MushafFontId } from '../lib/mushafFont';
import type { TajweedPageData, TajweedPageWord } from '../lib/tajweedPage';

type Props = {
  pageData: QcfPageData;
  /** Место, в которое надо вписать страницу.  Без него — базовый кегль. */
  fitTo?: { width: number; height: number } | null;
  /** «сура:аят» звучащего сейчас аята. */
  activeVerseKey?: string | null;
  /** Позиция звучащего слова внутри аята, с единицы. */
  activeWordPos?: number | null;
  /** У чтеца нет пословных сегментов: выделить весь звучащий аят. */
  wholeAyahAudioHighlight?: boolean;
  /** «сура:аят», выбранный удержанием. */
  selectedVerseKey?: string | null;
  onAyahTap?: (verseKey: string) => void;
  /** Горизонтальный режим: вписываем по ширине и прокручиваем по высоте. */
  landscapeWide?: boolean;
  /**
   * Слой через одну страницу от текущей — замер можно отложить в простой.
   *
   * 🔴 ТОЛЬКО для расстояния 2 и дальше. 09.09.2026 отсрочку уже вводили для
   * всех невидимых слоёв и сняли по ревью: соседний лист (расстояние 1) едет
   * за пальцем и виден весь жест, и неподобранная страница въехала бы в кадр
   * обрезанной. Лист через одну за один жест не виден: протяжка пальцем
   * ограничена шагом (MushafScreen, `onTouchMove`), так что в кадр въезжает
   * только сосед. А когда лист через одну сам становится соседом, флаг
   * снимается, и замер (если простоя так и не случилось) идёт синхронно, до
   * отрисовки.
   */
  deferMeasure?: boolean;
  variant?: MushafFontId;
  tajweedPageData?: TajweedPageData | null;
  tajweedFontReady?: boolean;
};

/** Кегль, если вписывать некуда. */
const BASE_FONT_PX = 22;
/**
 * Во столько раз высота строки больше кегля.
 *
 * Было 2.0 — «диакритике нужен воздух». Воздуха оказалось вдвое больше
 * нужного: замер на странице 563 показал коробку строки 47px при высоте
 * чернил 23px, то есть половина строки пустая. Владелец увидел это как
 * разрежённый текст.
 *
 * Тот же множитель отвечал и за поля по бокам, хотя напрямую с ними не
 * связан. Подбор кегля идёт от высоты (`fitTo.height / (строк ×
 * LINE_FACTOR)`) и ужимается, только если строка не влезла по ширине. При
 * 2.0 упор был в высоту, кегль не дорастал до ширины — и строки не
 * дотягивались до краёв: 327px из 390 при поле в 4px, то есть по 32px
 * пустоты с каждой стороны.
 *
 * 1.6 проверено замером и глазами: кегль вырос с 19.1 до 21.7, поля по
 * бокам сжались с 32px до 4px (то есть ровно до заданного поля), строки
 * стоят плотнее, а огласовки соседних строк не соприкасаются.
 *
 * 🔴 1.5 не берём, хотя визуально там тоже чисто: строка при нём выходит
 * за полосу набора примерно на 2px с каждой стороны и упирается в край
 * экрана. Подрезать сакральный текст краем недопустимо, а 2px запаса —
 * это не запас.
 */
const LINE_FACTOR = 1.6;
/**
 * Поля страницы по горизонтали — намеренно минимальные.
 *
 * Это не косметика, а прямая прибавка к кеглю. Подбор размера идёт так:
 * прикидка берётся от ВЫСОТЫ (`fitTo.height / (строк × LINE_FACTOR)`), а
 * дальше кегль только ужимается, если строка не влезла по ширине. На
 * телефоне в портрете ограничивает именно ширина: строка мусхафа длинная,
 * и каждый пиксель поля отнимается у неё дважды — слева и справа. Поле в
 * 14px съедало 28px ширины и заставляло ужимать шрифт сильнее, чем нужно.
 *
 * `env(safe-area-inset-*)` в `max()` — для горизонтальной ориентации: там
 * «чёлка» уходит вбок, и текст без этого частично оказался бы под ней.
 * Обе стороны берут одно значение, чтобы блок текста оставался
 * симметричным: несимметричные поля сдвигают страницу мусхафа вбок, а она
 * должна стоять по центру.
 */
const SIDE_PADDING_CSS =
  'max(4px, env(safe-area-inset-left), env(safe-area-inset-right))';

/**
 * Готовая подгонка страницы: кегль и выключка строк.
 *
 * Результат замера однозначно определяется страницей, изданием шрифта и
 * размером места — значит вторично мерить его незачем. Без кэша каждая
 * страница, к которой человек вернулся назад, подбирала кегль заново:
 * два прохода вёрстки плюс чтение прямоугольника у каждого слова.
 *
 * Кэш живёт на модуле, а не в состоянии: слои страниц монтируются и
 * размонтируются на каждом листании, и состояние умирает вместе с ними.
 */
type PageFit = { fontSize: number; justified: boolean[] };
const fitCache = new Map<string, PageFit>();
/** Больше окна листания на порядок — хватает на долгую сессию чтения. */
const FIT_CACHE_LIMIT = 64;

/** Листание идёт: палец ведёт лист или лист летит (у дорожки стоит `data-turning`). */
function pagerBusy(): boolean {
  return !!document.querySelector('.mushaf-page-track[data-turning]');
}

/**
 * Отложить работу до простоя — и до конца листания.
 *
 * 🔴 `requestIdleCallback` в Safari, по всей видимости, не выпущен (за
 * экспериментальным флагом), то есть на iPhone почти всегда работает запасной
 * таймер. Простой таймер попадал бы замером дальней страницы — синхронный
 * перерендер и чтение прямоугольника у каждого слова — прямо в следующий жест
 * (ревью 10.09.2026). Поэтому и в запасной ветке, и после простоя замер ждёт,
 * пока лист не встанет. Верхняя граница — две секунды: страница всё равно
 * должна быть готова до того, как станет соседом.
 */
function whenIdle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const deadline = performance.now() + 2000;
  let cancelled = false;
  let idle = 0;
  let timer = 0;
  const attempt = () => {
    if (cancelled) return;
    if (pagerBusy() && performance.now() < deadline) {
      timer = window.setTimeout(attempt, 120);
      return;
    }
    run();
  };
  if (typeof w.requestIdleCallback === 'function') {
    idle = w.requestIdleCallback(attempt, { timeout: 600 });
  } else {
    timer = window.setTimeout(attempt, 60);
  }
  return () => {
    cancelled = true;
    if (idle) w.cancelIdleCallback?.(idle);
    if (timer) clearTimeout(timer);
  };
}

function rememberFit(key: string, fit: PageFit) {
  // Сначала снимаем прежнюю запись: перезапись существующего ключа не
  // должна вытеснять чужую подгонку.
  fitCache.delete(key);
  if (fitCache.size >= FIT_CACHE_LIMIT) {
    const oldest = fitCache.keys().next().value;
    if (oldest !== undefined) fitCache.delete(oldest);
  }
  fitCache.set(key, fit);
}


export const QcfMushafPage = memo(function QcfMushafPage({
  pageData,
  fitTo = null,
  activeVerseKey = null,
  activeWordPos = null,
  wholeAyahAudioHighlight = false,
  selectedVerseKey = null,
  onAyahTap,
  landscapeWide = false,
  deferMeasure = false,
  variant = 'qcf-v4',
  tajweedPageData = null,
  tajweedFontReady = false,
}: Props) {
  const tajweedLines = useMemo(() => new Map(
    (variant === 'qpc-v4-tajweed' ? tajweedPageData?.lines ?? [] : [])
      .map(line => [line.line, line] as const),
  ), [variant, tajweedPageData]);
  const qcfLines = useMemo(() => variant === 'qpc-v4-tajweed'
    ? pageData.lines.filter(line => !tajweedLines.has(line.line))
    : pageData.lines, [variant, pageData.lines, tajweedLines]);
  // Издание страницы решает, где искать шрифт слова, и берётся только из
  // самих данных: в них оно проставлено загрузчиком и всегда однозначно.
  const edition = editionOf(pageData);
  // У V1 шрифт страницы назван на самой странице, а не на каждом слове,
  // поэтому список считается по странице целиком.  Цветной таджвид на V1
  // не распространяется (это шрифт поверх данных V4), и фильтрация строк
  // здесь не нужна.
  const fontRefs = useMemo(
    () => edition === 'qcf-v1'
      ? pageFontRefs(pageData)
      : distinctFontRefs(qcfLines.flatMap(l => l.words), 'qcf-v4'),
    [edition, pageData, qcfLines],
  );
  // @font-face инжектится в фазе рендера, а не в эффекте: браузер должен
  // начать качать шрифт в том же кадре, в котором появился текст.
  //
  // Готовность важна не только против кубиков: подгонка кегля ниже мерит
  // ширину строк, и до прихода шрифта мерила бы запасной — то есть
  // подбирала кегль под чужие метрики.
  const qcfFontsReady = useQcfFont(fontRefs);
  const fontsReady = qcfFontsReady
    && (variant !== 'qpc-v4-tajweed' || (!!tajweedPageData && tajweedFontReady));

  const lineCount = pageData.lines.length || 15;
  // Прикидка по высоте. Ширину проверим замером — предсказать её нельзя:
  // в строке от двух до десятка слов разной длины.
  const guess = fitTo
    ? landscapeWide
      ? Math.max(18, Math.min(64, fitTo.width / 18))
      : Math.max(9, Math.min(46, fitTo.height / (lineCount * LINE_FACTOR)))
    : BASE_FONT_PX;

  const fitKey = `${pageData.page}|${variant}|${landscapeWide ? 'wide' : 'page'}|${fitTo?.width ?? 0}|${fitTo?.height ?? 0}`;
  // Готовая подгонка для этой же страницы в этом же месте, если она уже
  // считалась раньше. Ключ включает издание и размер места, поэтому
  // повторный замер дал бы ровно то же число.
  const cachedFit = fitCache.get(fitKey);

  /**
   * Подгонка вместе с ключом, к которому она относится.
   *
   * Одним состоянием, а не двумя: кегль и выключка меряются в одном
   * проходе и обязаны меняться вместе. Ключ внутри состояния нужен, чтобы
   * при переходе на другую страницу не осталось ни одного кадра со старым
   * кеглем — сброс идёт в фазе рендера, а не эффектом.
   *
   * 🔴 Сбрасывать эффектом нельзя, и это стоило неверной вёрстки. Эффекты
   * одного коммита выполняются по порядку объявления, поэтому замер видел
   * ещё СТАРЫЙ кегль: страница мерилась по числу от предыдущего места и
   * считалась вписанной. Прежний код это переживал (сброс запускал новый
   * проход), но строки Аль-Фатихи выходили за полосу набора на 1–3px —
   * замер второго прохода был слепым: выключенная по ширине строка по
   * определению равна контейнеру, и переполнение в `scrollWidth` не видно.
   */
  const [fit, setFit] = useState<PageFit & { key: string }>(() => ({
    key: fitKey,
    fontSize: cachedFit?.fontSize ?? guess,
    justified: cachedFit?.justified ?? [],
  }));
  const boxRef = useRef<HTMLDivElement>(null);
  // Сколько поправок уже сделали для этой страницы и этого места.
  const passRef = useRef(cachedFit ? MAX_FIT_PASSES : 0);
  const keyRef = useRef(fitKey);
  /** Замер для текущего ключа закончен — вёрстку больше не трогаем. */
  const doneRef = useRef(!!cachedFit);
  /** Отложенный замер дальнего слоя: отмена, для какого места, разрешён ли. */
  const cancelDefer = useRef<(() => void) | null>(null);
  const scheduledKey = useRef<string | null>(null);
  const idleGranted = useRef<string | null>(null);
  const [, bumpIdle] = useState(0);

  if (keyRef.current !== fitKey) {
    keyRef.current = fitKey;
    passRef.current = cachedFit ? MAX_FIT_PASSES : 0;
    doneRef.current = !!cachedFit;
    setFit({
      key: fitKey,
      fontSize: cachedFit?.fontSize ?? guess,
      justified: cachedFit?.justified ?? [],
    });
  }

  const fontSize = fit.key === fitKey ? fit.fontSize : cachedFit?.fontSize ?? guess;
  /**
   * Как выключать каждую строку: `true` — по ширине, `false` — по центру.
   *
   * В печатном мусхафе по ширине выключены только ЗАПОЛНЕННЫЕ строки, а
   * короткая (Аль-Фатиха, конец суры) стоит по центру с обычными пробелами.
   * Раньше по ширине тянулись все, и на первой странице слова расходились
   * на пол-экрана: «بِسْمِ» у одного края, «ٱلرَّحِيمِ» у другого.
   *
   * Решается замером, а не числом слов: слова мусхафа разной длины, и три
   * длинных слова заполняют строку, а шесть коротких — нет.
   */
  const justified = fit.key === fitKey ? fit.justified : cachedFit?.justified ?? [];

  useLayoutEffect(() => () => {
    cancelDefer.current?.();
    cancelDefer.current = null;
  }, []);

  // Подбор кегля и выключки. Без списка зависимостей: каждая поправка —
  // это новый рендер, после которого вёрстку надо перемерить.
  useLayoutEffect(() => {
    if (doneRef.current) {
      // Подгонка уже есть (из кэша или синхронным замером) — отложенный
      // замер больше не нужен: его колбэк всё равно разбудил бы лишний
      // полный перерендер страницы, возможно посреди жеста.
      if (cancelDefer.current) { cancelDefer.current(); cancelDefer.current = null; scheduledKey.current = null; }
      return;
    }
    if (!fitTo || !boxRef.current) return;
    // Мерить по запасному шрифту нельзя — метрики другие, кегль выйдет
    // неверным, а после подмены страница не впишется.
    if (!fontsReady) return;

    // Дальний слой ждёт простоя. Когда простой случится, колбэк не мерит
    // сам, а разрешает замер и будит рендер: мерить можно только в фазе
    // вёрстки, где DOM уже соответствует кеглю этого рендера.
    if (deferMeasure && idleGranted.current !== fitKey) {
      if (scheduledKey.current !== fitKey) {
        cancelDefer.current?.();
        scheduledKey.current = fitKey;
        const ждём = fitKey;
        cancelDefer.current = whenIdle(() => {
          cancelDefer.current = null;
          scheduledKey.current = null;
          if (keyRef.current !== ждём) return;
          idleGranted.current = ждём;
          bumpIdle(t => t + 1);
        });
      }
      return;
    }

    // Меряем сейчас — отложенный замер, если он был назначен, отменяем.
    if (cancelDefer.current) { cancelDefer.current(); cancelDefer.current = null; scheduledKey.current = null; }

    const box = boxRef.current;
    const key = fitKey;
    const lines = Array.from(box.children) as HTMLElement[];

    // Истинная ширина набора в каждой строке — сумма ширин слов.
    //
    // 🔴 Не `scrollWidth`, и это принципиально. У строки, выключенной по
    // центру, содержимое вылезает на ОБЕ стороны, а `scrollWidth`
    // засчитывает только один край — в RTL как раз не тот. Замер выходил
    // примерно вдвое меньше настоящего, и подбор кегля не сходился: две
    // поправки по половине вылета оставляли строку за полосой набора.
    // У выключенной по ширине строки он и вовсе слеп — такая строка равна
    // контейнеру по определению.
    //
    // Сумма ширин слов верна в обоих случаях: выключка добавляет пробелы
    // МЕЖДУ словами, самих слов не меняя. Ею же решается, тянуть ли строку
    // по ширине, — поэтому замер один на оба вопроса, и вёрстка читается
    // за один проход вместо двух.
    const fills = lines.map(line => {
      const kids = Array.from(line.children) as HTMLElement[];
      if (!kids.length || line.clientWidth <= 0) return 0;
      const content = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0);
      return content / line.clientWidth;
    });
    const heightRatio = !landscapeWide && box.scrollHeight > fitTo.height
      ? box.scrollHeight / fitTo.height
      : 1;

    // Множитель считается ВСЕГДА, даже когда поправки кончились: иначе
    // несошедшаяся подгонка молча уехала бы в кэш и застряла там на всю
    // сессию, а перемерить её было бы уже некому.
    const scale = fitScale(fills, heightRatio);
    if (scale > 1 && passRef.current < MAX_FIT_PASSES) {
      passRef.current += 1;
      setFit(f => f.key === key ? { ...f, fontSize: Math.max(9, f.fontSize / scale) } : f);
      return;
    }

    const next = lines.map((line, i) => lineJustified(fills[i], line.children.length));
    doneRef.current = true;
    // `fontSize` здесь — ровно тот, по которому только что мерили: эффект
    // выполняется в коммите своего рендера, и другого значения в DOM быть
    // не может.
    if (scale === 1) rememberFit(key, { fontSize, justified: next });
    setFit(f => f.key !== key
      ? f
      : f.justified.length === next.length && f.justified.every((v, i) => v === next[i])
        ? f
        : { ...f, justified: next });
  });

  return (
    <div
      ref={boxRef}
      className="mushaf-page"
      style={{
        direction: 'rtl',
        // Вертикальные поля не декоративные: верхняя мадда и нижняя
        // кясра выходят за строчный бокс, и без запаса первая строка
        // подрезалась краем экрана.  Подгонка их учитывает — scrollHeight
        // считает padding.
        padding: `${Math.round(fontSize * 0.45)}px ${SIDE_PADDING_CSS}`,
        width: '100%',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Шрифт страницы ещё едет.  Скелет на столько же строк и того же
          ритма: когда текст придёт, страница проявится, а не перестроится. */}
      {!fontsReady ? (
        <ArabicSkeleton
          lines={lineCount}
          fontSize={fontSize}
          align="stretch"
        />
      ) : pageData.lines.map((line, idx) => {
        const tajweedLine = tajweedLines.get(line.line);
        const isSurahHeader = line.words.some(w => w.type === 'surah_header');
        const isBasmala = line.words.some(w => w.type === 'bismillah');
        const words = tajweedLine
          ? tajweedLine.words.map((word, i) => (
              <TajweedWordSpan
                key={i}
                word={word}
                page={pageData.page}
                fontSize={fontSize}
                activeVerseKey={activeVerseKey}
                activeWordPos={activeWordPos}
                wholeAyahAudioHighlight={wholeAyahAudioHighlight}
                selectedVerseKey={selectedVerseKey}
                onTap={onAyahTap}
              />
            ))
          : line.words.map((word, i) => (
              <QcfWordSpan
                key={i}
                word={word}
                pageData={pageData}
                fontSize={fontSize}
                isActive={
                  !!word.verse_key
                  && word.verse_key === activeVerseKey
                  && word.position === activeWordPos
                }
                isWholeAyahActive={
                  wholeAyahAudioHighlight
                  && !!word.verse_key
                  && word.verse_key === activeVerseKey
                }
                isSelected={!!word.verse_key && word.verse_key === selectedVerseKey}
                onTap={onAyahTap}
              />
            ));
        // Короткие строки (конец суры) в мусхафе тоже стоят по центру.
        const centred = isSurahHeader || isBasmala || words.length <= 2;

        // Название суры — в золочёной рамке, как в печатном издании.
        // Строка отдаётся плашке целиком: в данных мусхафа заголовок
        // всегда занимает свою строку и никогда не делит её с аятами.
        if (isSurahHeader) {
          return (
            <SurahPlate key={line.line} height={Math.round(fontSize * LINE_FACTOR * 0.92)}>
              <div style={{
                display: 'flex',
                direction: 'rtl',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
              }}>
                {words}
              </div>
            </SurahPlate>
          );
        }

        // Первый проход измеряет строки в естественном виде — по центру со
        // зазорами; после замера полные строки переходят на выключку по
        // ширине.  Порядок именно такой: измерять надо ненатянутую строку.
        const stretch = !centred && justified[idx] === true;
        return (
          <div
            key={line.line}
            style={{
              display: 'flex',
              direction: 'rtl',
              alignItems: 'center',
              justifyContent: stretch ? 'space-between' : 'center',
              height: `${fontSize * LINE_FACTOR}px`,
            }}
          >
            {words}
          </div>
        );
      })}
    </div>
  );
});

type WordSpanProps = {
  word: QcfWord;
  /** Нужна целиком: у V1 шрифт обычного слова записан на странице. */
  pageData: QcfPageData;
  fontSize: number;
  isActive: boolean;
  isWholeAyahActive: boolean;
  isSelected: boolean;
  onTap?: (verseKey: string) => void;
};

function QcfWordSpan({
  word, pageData, fontSize, isActive, isWholeAyahActive, isSelected, onTap,
}: WordSpanProps) {
  const isHeader = word.type === 'surah_header';
  // Маркер конца аята — золочёная розетка с номером, как в печатном
  // издании.  Отделять его цветом важно не только для красоты: глаз
  // цепляется за границы аятов, когда ищет нужное место, а на странице
  // из пятнадцати плотных строк без ориентиров это трудно.
  const isEndMark = word.type === 'end';
  const key = word.verse_key;

  return (
    <span
      {...(isActive ? { 'data-active-word': '' } : {})}
      {...(isWholeAyahActive ? { 'data-mushaf-audio-active': '' } : {})}
      {...(key ? { 'data-verse-key': key } : {})}
      {...(isSelected ? { 'data-mushaf-selected': '' } : {})}
      onClick={key && onTap ? () => onTap(key) : undefined}
      style={{
        // Семейство считается по изданию страницы — см. qcfWordFamily:
        // у V4 к имени шрифта добавляется номер страницы, у V1 имя шрифта
        // уже постраничное.  Одни и те же PUA-коды в разных шрифтах
        // означают разные слова, поэтому ошибка здесь не видна глазом.
        fontFamily: `'${qcfWordFamily(word, pageData)}', serif`,
        fontSize: isHeader ? `${fontSize * 0.82}px` : `${fontSize}px`,
        color: isActive
          ? 'var(--qcf-active, var(--accent, #1a6b3c))'
          : isEndMark
            ? 'var(--gold)'
            // Название суры внутри плашки — полными чернилами: рамка вокруг
            // уже золотая, и приглушённый заголовок на её фоне читался
            // тусклее, чем сам текст суры, хотя должен возглавлять страницу.
            : 'var(--qcf-text, var(--text-primary))',
        // Выбранный аят оформляет CSS через data-mushaf-selected: там
        // единый для обычного и цветного мусхафа «фокус чтения».
        // Звучащее слово по-прежнему получает пользовательский цвет
        // караоке через data-active-word.
        background: 'transparent',
        whiteSpace: 'nowrap',
        letterSpacing: 0,
        wordSpacing: 0,
        lineHeight: 1,
        display: 'inline-block',
        cursor: key && onTap ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-label={word.text || undefined}
    >
      {word.char}
    </span>
  );
}

function TajweedWordSpan({
  word,
  page,
  fontSize,
  activeVerseKey,
  activeWordPos,
  wholeAyahAudioHighlight,
  selectedVerseKey,
  onTap,
}: {
  word: TajweedPageWord;
  page: number;
  fontSize: number;
  activeVerseKey: string | null;
  activeWordPos: number | null;
  wholeAyahAudioHighlight: boolean;
  selectedVerseKey: string | null;
  onTap?: (verseKey: string) => void;
}) {
  const visualPosition = tajweedVisualWordPosition(word.verseKey, activeWordPos);
  const isActive = word.type === 'word'
    && word.verseKey === activeVerseKey
    && word.position === visualPosition;
  const isSelected = word.verseKey === selectedVerseKey;
  const isWholeAyahActive = wholeAyahAudioHighlight
    && word.verseKey === activeVerseKey;
  const family = fontFamilyForPage(page);

  return (
    <span
      className="tajweed-theme-ink"
      data-verse-key={word.verseKey}
      data-position={word.position}
      {...(isWholeAyahActive ? { 'data-mushaf-audio-active': '' } : {})}
      {...(isSelected ? { 'data-mushaf-selected': '' } : {})}
      onClick={onTap ? () => onTap(word.verseKey) : undefined}
      style={{
        fontFamily: family ? `'${family}', serif` : 'serif',
        fontSize: `${fontSize}px`,
        fontPalette: PALETTE_NAME,
        color: 'var(--text-primary)',
        // text-shadow нельзя: у COLR он рисуется отдельно для каждого
        // цветного слоя и даёт «двойной» контур. Поэтому аудио и выбор
        // аята отмечаются фоном, не меняя цвета самого таджвида.
        background: isActive
          ? 'rgb(var(--accent-rgb) / 0.14)'
          : 'transparent',
        borderRadius: isActive ? '3px' : undefined,
        whiteSpace: 'nowrap',
        letterSpacing: 0,
        wordSpacing: 0,
        lineHeight: 1,
        display: 'inline-block',
        cursor: onTap ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-label={word.text || undefined}
    >
      {word.code}
    </span>
  );
}
