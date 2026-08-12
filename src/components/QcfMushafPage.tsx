/**
 * QcfMushafPage — одна страница мединского мусхафа (QCF V4), целиком.
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
 * самая длинная строка не влезла по ширине.  Двух проходов хватает:
 * зависимость ширины от кегля линейная.
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
 *   selectedVerseKey — весь аят, по которому человек тапнул.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useQcfFont } from '../hooks/useQcfFont';
import { ArabicSkeleton } from './ArabicSkeleton';
import { SurahPlate } from './SurahPlate';
import { distinctFontRefs, qcfPageFamily } from '../lib/qcf4';
import type { QcfPageData, QcfWord } from '../lib/qcf4';

type Props = {
  pageData: QcfPageData;
  /** Место, в которое надо вписать страницу.  Без него — базовый кегль. */
  fitTo?: { width: number; height: number } | null;
  /** «сура:аят» звучащего сейчас аята. */
  activeVerseKey?: string | null;
  /** Позиция звучащего слова внутри аята, с единицы. */
  activeWordPos?: number | null;
  /** «сура:аят», выбранный тапом. */
  selectedVerseKey?: string | null;
  onAyahTap?: (verseKey: string) => void;
};

/** Кегль, если вписывать некуда. */
const BASE_FONT_PX = 22;
/** Во столько раз высота строки больше кегля.  Диакритике нужен воздух. */
const LINE_FACTOR = 2.0;
/** Поля страницы по горизонтали. */
const SIDE_PADDING = 14;
/**
 * С какой заполненности строка считается полной и тянется по ширине.
 *
 * Замер идёт по естественной ширине слов: у глифов QCF боковые отступы
 * уже внутри, поэтому своего зазора вёрстка не добавляет — добавленный
 * заставлял строки переполняться и сбивал подбор кегля.
 *
 * 0.9 отделяет набранную строку от короткой: последняя строка суры и
 * строки Аль-Фатихи заполняют меньше, обычная строка мусхафа — больше.
 */
const JUSTIFY_FILL = 0.9;


export function QcfMushafPage({
  pageData,
  fitTo = null,
  activeVerseKey = null,
  activeWordPos = null,
  selectedVerseKey = null,
  onAyahTap,
}: Props) {
  const fontRefs = distinctFontRefs(pageData.lines.flatMap(l => l.words));
  // @font-face инжектится в фазе рендера, а не в эффекте: браузер должен
  // начать качать шрифт в том же кадре, в котором появился текст.
  //
  // Готовность важна не только против кубиков: подгонка кегля ниже мерит
  // ширину строк, и до прихода шрифта мерила бы запасной — то есть
  // подбирала кегль под чужие метрики.
  const fontsReady = useQcfFont(fontRefs);

  const lineCount = pageData.lines.length || 15;
  // Прикидка по высоте. Ширину проверим замером — предсказать её нельзя:
  // в строке от двух до десятка слов разной длины.
  const guess = fitTo
    ? Math.max(9, Math.min(46, fitTo.height / (lineCount * LINE_FACTOR)))
    : BASE_FONT_PX;

  const [fontSize, setFontSize] = useState(guess);
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
  const [justified, setJustified] = useState<boolean[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  // Сколько поправок уже сделали для этой страницы и этого места.
  const passRef = useRef(0);
  const keyRef = useRef('');

  const fitKey = `${pageData.page}|${fitTo?.width ?? 0}|${fitTo?.height ?? 0}`;
  if (keyRef.current !== fitKey) {
    keyRef.current = fitKey;
    passRef.current = 0;
  }

  useLayoutEffect(() => {
    if (!fitTo || !boxRef.current) return;
    if (passRef.current >= 2) return;
    // Мерить по запасному шрифту нельзя — метрики другие, кегль выйдет
    // неверным, а после подмены страница не впишется.
    if (!fontsReady) return;

    const box = boxRef.current;
    const lines = Array.from(box.children) as HTMLElement[];
    let widthRatio = 1;
    for (const line of lines) {
      // Строки свёрстаны через space-between: если содержимое шире
      // контейнера, оно вылезает, и scrollWidth это показывает.
      if (line.clientWidth > 0 && line.scrollWidth > line.clientWidth) {
        widthRatio = Math.max(widthRatio, line.scrollWidth / line.clientWidth);
      }
    }
    const heightRatio = box.scrollHeight > fitTo.height
      ? box.scrollHeight / fitTo.height
      : 1;
    const ratio = Math.max(widthRatio, heightRatio);

    // 0.5 px — порог, ниже которого поправка не стоит лишней перерисовки.
    if (ratio > 1.002) {
      passRef.current += 1;
      setFontSize(f => Math.max(9, f / ratio));
      return;
    }
    passRef.current = 2;
  });

  // Какие строки тянуть по ширине.
  //
  // Отдельным эффектом, а не внутри подбора кегля: тот выходит досрочно,
  // как только кегль устоялся, и замер выключки до него не доходил — все
  // строки оставались по центру, включая полные.
  //
  // Считаем сумму ширин слов: у flex-строки scrollWidth этого не покажет,
  // потому что растянутая по ширине строка по определению занимает всю
  // ширину, сколько бы в ней ни было слов.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !fontsReady) return;
    const lines = Array.from(box.children) as HTMLElement[];
    const next = lines.map(line => {
      const kids = Array.from(line.children) as HTMLElement[];
      if (kids.length < 2 || line.clientWidth <= 0) return false;
      const content = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0);
      return content / line.clientWidth >= JUSTIFY_FILL;
    });
    setJustified(prev =>
      prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next);
  }, [fontsReady, fontSize, pageData.page, fitTo?.width, fitTo?.height]);

  // Смена страницы или размера окна — считаем заново от прикидки.
  const [lastKey, setLastKey] = useState(fitKey);
  if (lastKey !== fitKey) {
    setLastKey(fitKey);
    setFontSize(guess);
  }

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
        padding: `${Math.round(fontSize * 0.45)}px ${SIDE_PADDING}px`,
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
        const isSurahHeader = line.words.some(w => w.type === 'surah_header');
        const isBasmala = line.words.some(w => w.type === 'bismillah');
        // Короткие строки (конец суры) в мусхафе тоже стоят по центру.
        const centred = isSurahHeader || isBasmala || line.words.length <= 2;

        const words = line.words.map((word, i) => (
          <QcfWordSpan
            key={i}
            word={word}
            fontSize={fontSize}
            isActive={
              !!word.verse_key
              && word.verse_key === activeVerseKey
              && word.position === activeWordPos
            }
            isSelected={!!word.verse_key && word.verse_key === selectedVerseKey}
            onTap={onAyahTap}
          />
        ));

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
}

type WordSpanProps = {
  word: QcfWord;
  fontSize: number;
  isActive: boolean;
  isSelected: boolean;
  onTap?: (verseKey: string) => void;
};

function QcfWordSpan({ word, fontSize, isActive, isSelected, onTap }: WordSpanProps) {
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
      {...(key ? { 'data-verse-key': key } : {})}
      onClick={key && onTap ? () => onTap(key) : undefined}
      style={{
        // Семейство с суффиксом страницы — см. qcfPageFamily: одни и те же
        // PUA-коды в разных шрифтах означают разные слова.
        fontFamily: `'${qcfPageFamily(word.font, word.page ?? 0)}', serif`,
        fontSize: isHeader ? `${fontSize * 0.82}px` : `${fontSize}px`,
        color: isActive
          ? 'var(--qcf-active, var(--accent, #1a6b3c))'
          : isEndMark
            ? 'var(--gold)'
            // Название суры внутри плашки — полными чернилами: рамка вокруг
            // уже золотая, и приглушённый заголовок на её фоне читался
            // тусклее, чем сам текст суры, хотя должен возглавлять страницу.
            : 'var(--qcf-text, var(--text-primary))',
        // Выбранный аят подсвечивается фоном, а не цветом букв: цвет
        // текста уже занят под караоке, и два смысла на одном канале
        // читались бы как один.
        background: isSelected && !isActive
          ? 'color-mix(in srgb, var(--ink) 12%, transparent)'
          : 'transparent',
        borderRadius: isSelected ? '3px' : undefined,
        transition: 'color 0.15s ease, background 0.15s ease',
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
