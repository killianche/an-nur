/**
 * DuaScreen — раздел «Дуа».  Переписан с нуля.
 *
 * ── Что было не так в первой версии ───────────────────────────────────
 *
 * Переключатель и стопка одинаковых обведённых карточек.  Три проблемы,
 * и все три — не про цвета:
 *
 *   1. Внутри карточки не было структуры: заголовок, арабский,
 *      транскрипция, перевод и источник шли одним потоком с равными
 *      отступами.  Глаз не знал, где начинается текст, а где опора.
 *   2. Кнопки правки жили в карточках чтения.  Читать и перекладывать —
 *      разные занятия с разной нужной плотностью: чтобы поменять
 *      порядок, приходилось прокручивать полные тексты.
 *   3. Список не выглядел последовательностью, хотя порядок в нём и
 *      есть главная ценность: человек собрал дуа в том порядке, в
 *      котором читает.
 *
 * ── Что сделано ───────────────────────────────────────────────────────
 *
 * Два режима с разной плотностью.  **Чтение**: карточка со структурой —
 * шапка, правило, арабский, правило, перевод, источник; номер по
 * порядку слева, чтобы список читался как последовательность.
 * **Правка**: те же дуа сжимаются в строки, весь список виден целиком,
 * стрелки и удаление под рукой.  Переход — кнопкой «Изменить».
 *
 * Переключатель «Мой список / Все дуа» — с едущей подложкой, а не двумя
 * перекрашиваемыми кнопками: подложка показывает, что состояния два и
 * они рядом.
 *
 * ── Про пустоту ───────────────────────────────────────────────────────
 *
 * `dua.json` пуст намеренно.  Дуа — сакральный текст: он переносится из
 * источника владельца посимвольно, а не сочиняется (CLAUDE.md,
 * public/dua/README.md).  Пустые состояния поэтому настоящие: объясняют,
 * что произошло и что будет дальше.
 */

import {
  type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { GLASS_BLUR } from '../lib/glass';
import { createPortal } from 'react-dom';
import { Appearance, EyeOff, ICON_SIZE, Typography, Eye } from '../components/icons';
import { AzkarTypographySettings } from '../components/AzkarSettings';
import { SettingsSheet } from '../components/ReadingSettings';
import { TasbihPill } from '../components/DevotionalBits';
import { azkarFontConfig, type AzkarFontId } from '../lib/azkarFonts';
import {
  readDuaPrefs, writeDuaFont, writeDuaLatinFont, writeDuaPref, writeDuaScale,
  type DuaPrefs,
} from '../lib/duaPrefs';
import { latinSizeBump, latinStack, latinWeight, type LatinFontId } from '../lib/typography';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';
import { loadDuaData, type DuaData, type DuaEntry } from '../lib/dua';
import { HitArea } from '../components/HitArea';
import {
  readHiddenDua, hideDua, unhideDua, onHiddenDuaChange,
} from '../lib/duaHidden';

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

/** Дальше задержку не растим: последние карточки не должны ждать. */
const MAX_STAGGER_MS = 240;

export function DuaScreen({ theme, setTheme }: Props) {
  const [data, setData] = useState<DuaData | null>(null);
  const [hidden, setHidden] = useState<string[]>(readHiddenDua);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [typographyOpen, setTypographyOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const typographyBtnRef = useRef<HTMLButtonElement>(null);

  // Настройки текста — свои, не азкарные: попап подписан «Текст дуа» и
  // обязан менять только дуа (см. lib/duaPrefs.ts).
  const [prefs, setPrefs] = useState<DuaPrefs>(readDuaPrefs);
  const reloadPrefs = () => setPrefs(readDuaPrefs());

  // Счётчик повторов — в памяти, как у азкаров: он про «сколько раз я
  // прочитал сейчас», а не про историю, и переживать перезапуск ему не
  // нужно.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const inc = (id: string) => setCounts(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const reset = (id: string) => setCounts(c => ({ ...c, [id]: 0 }));

  useEffect(() => {
    let alive = true;
    loadDuaData().then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  useEffect(() => onHiddenDuaChange(() => setHidden(readHiddenDua())), []);

  const byId = useMemo(() => {
    const map = new Map<string, DuaEntry>();
    for (const e of data?.entries ?? []) map.set(e.id, e);
    return map;
  }, [data]);

  // Скрытые храним по id: если дуа исчезло из сборника, запись просто не
  // найдётся, но из хранилища не стирается — вернётся вместе с текстом.
  const скрытые = hidden.map(id => byId.get(id)).filter((e): e is DuaEntry => !!e);
  const total = data?.entries.length ?? 0;

  /*
   * И вопрос, и отмена — они про разные ошибки.
   *
   * Вопрос перед скрытием владелец попросил 21.09.2026: он защищает от
   * случайного нажатия по кнопке, стоящей на каждой карточке. Плашка отмены
   * остаётся: она защищает от другой ошибки — «нажал осознанно, но не на том
   * дуа», когда вопрос уже подтверждён. Прежняя редакция этого комментария
   * отвергала подтверждение как «нытьё»; это верно для диалога на КАЖДОЕ
   * действие, а здесь действие одно и редкое.
   *
   * Помним и место, откуда дуа ушло: вернуть надо туда же, иначе
   * порядок чтения ломается.
   */
  const [undo, setUndo] = useState<{ id: string; index: number; title: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const rememberUndo = useCallback((id: string, index: number, title: string) => {
    setUndo({ id, index, title });
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000);
  }, []);

  useEffect(() => () => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }, []);

  const скрыть = useCallback((entry: DuaEntry) => {
    hideDua(entry.id);
    // Место в списке для отмены не нужно: витрина идёт порядком сборника,
    // и возвращённое дуа само встаёт на своё место.
    rememberUndo(entry.id, 0, entry.title_ru);
  }, [rememberUndo]);

  /*
   * Витрина показывает всё, кроме скрытого.
   *
   * 🔴 Скрытие уже было в этом экране и его СНИМАЛИ — ровно потому, что
   * вернуть спрятанное было нечем: дуа исчезало навсегда, без единой кнопки.
   * Владелец 09.09.2026 попросил вернуть скрытие вместе с возвратом, а
   * 10.09.2026 — делать это не свайпом, а меню «три точки» на карточке:
   * «Скрыть» в витрине, «Вернуть» в скрытых. Кнопка в шапке показывает
   * спрятанное. Без неё фичу возвращать нельзя — это та же яма.
   *
   * Прежний ключ `dua.hidden` намеренно НЕ читается, ключ теперь свой
   * (`dua.hidden.v1`): у того, кто успел что-то спрятать до снятия фичи, эти
   * дуа не должны молча исчезнуть снова спустя месяц.
   */
  const shown = useMemo(() => {
    const all = (data?.entries ?? []).filter(e => !hidden.includes(e.id));
    return category === null ? all : all.filter(e => e.category === category);
  }, [data, category, hidden]);

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 'min(100%, 720px)',
      margin: '0 auto',
      padding: `0 var(--space-margin) calc(${TAB_BAR_HEIGHT}px + var(--space-section) + var(--mini-player-space, 0px) + env(safe-area-inset-bottom))`,
      position: 'relative',
      zIndex: 1,
    }}>
      {themeOpen && (
        <ThemeSettings
          theme={theme} setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {typographyOpen && (
        <AzkarTypographySettings
          title="Текст дуа"
          showArabic={prefs.showArabic}
          setShowArabic={v => { writeDuaPref('showArabic', v); reloadPrefs(); }}
          showRussian={prefs.showRussian}
          setShowRussian={v => { writeDuaPref('showRussian', v); reloadPrefs(); }}
          showTranslit={prefs.showTranslit}
          setShowTranslit={v => { writeDuaPref('showTranslit', v); reloadPrefs(); }}
          arabicScale={prefs.arabicScale}
          setArabicScale={v => { writeDuaScale('arabicScale', v); reloadPrefs(); }}
          russianScale={prefs.russianScale}
          setRussianScale={v => { writeDuaScale('russianScale', v); reloadPrefs(); }}
          translitScale={prefs.translitScale}
          setTranslitScale={v => { writeDuaScale('translitScale', v); reloadPrefs(); }}
          arabicFont={prefs.arabicFont}
          setArabicFont={(v: AzkarFontId) => { writeDuaFont(v); reloadPrefs(); }}
          russianFont={prefs.russianFont}
          setRussianFont={(v: LatinFontId) => { writeDuaLatinFont('russianFont', v); reloadPrefs(); }}
          translitFont={prefs.translitFont}
          setTranslitFont={(v: LatinFontId) => { writeDuaLatinFont('translitFont', v); reloadPrefs(); }}
          onClose={() => setTypographyOpen(false)}
          anchorEl={typographyBtnRef.current}
        />
      )}

      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-cozy)',
        paddingTop: 'calc(env(safe-area-inset-top) + var(--space-margin))',
        paddingBottom: 'var(--space-margin)',
      }}>
        <h1 className="display-serif" style={{
          margin: 0, flex: 1, minWidth: 0,
          fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 'var(--weight-regular)',
          letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.05,
        }}>
          Дуа
        </h1>

        {/* Кнопка скрытых — маленькая, в правом углу, и только когда есть
            что показывать. Кнопка, которая ничего не открывает, — лишний
            орган управления в шапке; пустой список за ней объяснить нечем. */}
        {скрытые.length > 0 && (
          <button
            onClick={() => setHiddenOpen(true)}
            // Число скрытых — только для экранного диктора: на экране его нет.
            aria-label={`Скрытые дуа: ${скрытые.length}`}
            title="Скрытые дуа"
            className="icon-btn"
            style={{
              width: '42px', height: '42px', flexShrink: 0,
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--hairline)',
              background: 'rgb(var(--ink-rgb) / 0.04)',
              color: 'var(--text-secondary)',
            }}
          >
            {/* 🔴 Без счётчика. Владелец 10.09.2026: «эти цифры не нужны,
                чтобы глаза не мозолил». Кружок с числом — это язык
                уведомлений: он зовёт открыть и сбросить, а скрытые дуа
                ничего не ждут. Сама кнопка и так появляется только когда
                скрытое есть. */}
            <EyeOff size={ICON_SIZE.md} />
          </button>
        )}

        <button
          ref={typographyBtnRef}
          onClick={() => { setTypographyOpen(v => !v); setThemeOpen(false); }}
          aria-label="Текст и шрифты" title="Текст и шрифты"
          className="icon-btn" data-active={typographyOpen}
          style={{
            width: '42px', height: '42px', flexShrink: 0,
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--hairline)',
            background: 'rgb(var(--ink-rgb) / 0.04)',
            color: typographyOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Typography size={ICON_SIZE.md} />
        </button>

        <button
          ref={themeBtnRef}
          onClick={() => { setThemeOpen(v => !v); setTypographyOpen(false); }}
          aria-label="Оформление" title="Оформление"
          className="icon-btn" data-active={themeOpen}
          style={{
            width: '42px', height: '42px', flexShrink: 0,
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--hairline)',
            background: 'rgb(var(--ink-rgb) / 0.04)',
            color: themeOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Appearance size={ICON_SIZE.md} />
        </button>
      </header>

      {total > 0 && data && data.categories.length > 1 && (
        <CategoryChips data={data} value={category} onChange={setCategory} />
      )}

      {!data && <Skeleton />}

      {data && (
        total === 0
          ? <EmptyAll />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-margin)' }}>
              {shown.map((e, i) => (
                <DuaCard
                  key={e.id}
                  entry={e}
                  delay={Math.min(i * 40, MAX_STAGGER_MS)}
                  prefs={prefs}
                  count={counts[e.id] ?? 0}
                  onCount={() => inc(e.id)}
                  onResetCount={() => reset(e.id)}
                  menu={
                    <HideButton
                      title={e.title_ru}
                      question="Скрыть это дуа из витрины?"
                      confirmLabel="Скрыть"
                      confirmIcon={<EyeOff size={ICON_SIZE.sm} />}
                      onConfirm={() => скрыть(e)}
                    />
                  }
                />
              ))}
            </div>
          )
      )}

      {hiddenOpen && (
        <HiddenSheet
          items={скрытые}
          onReturn={id => unhideDua(id)}
          onClose={() => setHiddenOpen(false)}
        />
      )}

      {undo && (
        <UndoBar
          title={undo.title}
          onUndo={() => { unhideDua(undo.id); setUndo(null); }}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}
/**
 * HideButton — кнопка «скрыть» на карточке и подтверждение рядом с ней.
 *
 * ── Почему кнопка, а не меню ──────────────────────────────────────────
 *
 * Владелец 21.09.2026: «сделаем базовую кнопку, на которую нажимаешь, потом
 * подтверждение; кнопка не должна отвлекать». До этого здесь было меню из
 * трёх точек с единственным пунктом «Скрыть» (10.09.2026), а ещё раньше —
 * невидимый свайп. Меню с одним пунктом — лишний шаг: кнопка делает то же
 * самое, а вопрос перед скрытием защищает от случайного нажатия.
 *
 * Кнопка не отвлекает: только значок, цвет третичного текста, без фона и
 * рамки. Попадание при этом 40 px — отрицательные поля возвращают карточке
 * её отступы, и шапка карточки не становится выше.
 *
 * ── Почему через портал ───────────────────────────────────────────────
 *
 * У карточки `overflow: hidden` и анимация появления на `transform`. Внутри
 * такого предка всплывающее окно обрезалось бы краем карточки, а
 * `position: fixed` отсчитывался бы от карточки, а не от экрана. Окно
 * рисуется в `body` и ставится по прямоугольнику кнопки.
 *
 * Закрывается касанием мимо, прокруткой и Escape; при открытии с клавиатуры
 * фокус переходит на подтверждение.
 */
function HideButton({ title, question, confirmLabel, confirmIcon, onConfirm }: {
  /** Название карточки — для подписи кнопки у экранного диктора. */
  title: string;
  /** Вопрос в окне подтверждения. */
  question: string;
  confirmLabel: string;
  confirmIcon: ReactNode;
  onConfirm: () => void;
}) {
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const окноRef = useRef<HTMLDivElement>(null);
  /** Вопрос — его читает экранный диктор вместе с окном (`aria-describedby`). */
  const вопросId = useId();
  /**
   * Куда вернуть фокус, когда окно закрылось.
   *
   * `наКнопку` — обычный случай (отмена, Escape): фокус туда, откуда пришли.
   * После подтверждения кнопки скоро не станет вместе с карточкой, и
   * проверка `isConnected` не спасает: в этот момент она ещё в документе, а
   * размонтируется следующим рендером — фокус уезжал в body (замер
   * 21.09.2026). Поэтому после действия сразу целимся в кнопку скрытых.
   */
  const вернутьФокус = (наКнопку = true) => {
    if (наКнопку && btnRef.current?.isConnected) {
      btnRef.current.focus({ preventScroll: true });
      return;
    }
    // Карточка ушла вместе с кнопкой — фокус на кнопку скрытых в шапке,
    // оттуда дуа и возвращают. Иначе фокус падает в body, и следующий Tab
    // начинается с начала документа (ревью 21.09.2026).
    //
    // Следующим тиком: после первого же скрытия кнопка скрытых только
    // появляется в шапке, и в момент подтверждения её ещё нет в документе
    // (замер 21.09.2026 — фокус уходил в body).
    window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label^="Скрытые дуа"]')
        ?.focus({ preventScroll: true });
    }, 0);
  };
  const open = place !== null;

  const toggle = () => {
    if (open) { setPlace(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Окно: вопрос и два действия — 98 px по замеру. Ставим по этой оценке, а
    // после монтирования поправляем по настоящей высоте (длинный вопрос на
    // узком экране занимает три строки). Не влезает под кнопку — открываем
    // над ней, чтобы нижнюю карточку не прятала панель вкладок.
    const высота = 98;
    const снизу = r.bottom + 6;
    const top = снизу + высота > window.innerHeight - 96 ? r.top - высота - 6 : снизу;
    setPlace({ top, right: Math.max(8, window.innerWidth - r.right) });
  };

  // Настоящая высота окна известна только после монтирования: если оно вышло
  // за нижний край, переносим его над кнопкой (ревью 21.09.2026).
  useLayoutEffect(() => {
    const окно = окноRef.current;
    const кнопка = btnRef.current?.getBoundingClientRect();
    if (!окно || !кнопка || !place) return;
    const h = окно.getBoundingClientRect().height;
    if (place.top + h <= window.innerHeight - 96) return;
    const наверх = кнопка.top - h - 6;
    if (наверх >= 8 && наверх !== place.top) setPlace({ ...place, top: наверх });
  }, [place]);

  useEffect(() => {
    if (!open) return;
    // 🔴 Фокус уходит на САМО окно, а не на кнопку внутри. Программный фокус
    // на кнопке рисовал вокруг неё жирную рамку (снимок 10.09.2026) — пальцу
    // она не нужна; у контейнера с `outline: none` рамки нет, зато VoiceOver
    // попадает в окно и читает вопрос, а не продолжает по карточке (ревью
    // 21.09.2026). С клавиатуры первый Tab даёт «Отмена» — безопасное
    // действие идёт первым.
    окноRef.current?.focus({ preventScroll: true });
    const мимо = (e: PointerEvent) => {
      const t = e.target as Node;
      if (окноRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      // 🔴 Касание мимо ТОЛЬКО закрывает окно, как в iOS. Раньше оно ещё и
      // срабатывало под пальцем — например, давало +1 к счётчику соседней
      // карточки (ревью 10.09.2026). Гасим и само касание (слушатель на
      // документе в фазе захвата — раньше корня React), и клик следом.
      //
      // 🔴 Кроме кнопки скрытия другой карточки: гасить её значит требовать
      // второго тапа, и кнопка выглядит сломанной (ревью 21.09.2026). Там
      // нет побочного действия — только открытие такого же окна.
      const поКнопкеСкрытия = t instanceof Element
        && !!t.closest('[aria-haspopup="dialog"]');
      if (поКнопкеСкрытия) { setPlace(null); return; }
      e.stopPropagation();
      // Ловушка на один клик. Касание могло перейти в прокрутку, и клика не
      // будет вовсе — тогда её снимает следующее касание (оно уже другой
      // жест) или таймер. Иначе она съела бы законный тап следом, например
      // по счётчику (ревью 10.09.2026). Слушатель, добавленный во время
      // этого же pointerdown, на нём самом не сработает — таков порядок DOM.
      const снять = () => {
        document.removeEventListener('click', глотать, { capture: true } as EventListenerOptions);
        document.removeEventListener('pointerdown', снять, { capture: true } as EventListenerOptions);
        window.clearTimeout(таймер);
      };
      const глотать = (c: MouseEvent) => { c.preventDefault(); c.stopPropagation(); снять(); };
      document.addEventListener('click', глотать, { capture: true });
      document.addEventListener('pointerdown', снять, { capture: true });
      const таймер = window.setTimeout(снять, 700);
      setPlace(null);
    };
    const клавиша = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape закрывает только это окно. Лист скрытых слушает Escape на окне, и
      // без этого одно нажатие закрывало бы сразу оба слоя.
      e.stopImmediatePropagation();
      setPlace(null);
      вернутьФокус();
    };
    // Окно стоит по координатам кнопки; при прокрутке оно бы от неё уехало.
    const прокрутка = () => setPlace(null);
    document.addEventListener('pointerdown', мимо, true);
    document.addEventListener('keydown', клавиша);
    window.addEventListener('scroll', прокрутка, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', мимо, true);
      document.removeEventListener('keydown', клавиша);
      window.removeEventListener('scroll', прокрутка, { capture: true } as EventListenerOptions);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => toggle()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Скрыть: ${title}`}
        title="Скрыть"
        className="icon-btn"
        style={{
          flexShrink: 0,
          // Попадание 40 px, а на вид — только значок: отрицательные поля
          // возвращают карточке её отступы, и шапка не становится выше.
          width: '40px', height: '40px',
          margin: '-10px -10px -10px 0',
          borderRadius: 'var(--radius-pill)',
          color: open ? 'var(--text-primary)' : 'var(--text-tertiary)',
          background: open ? 'rgb(var(--ink-rgb) / 0.06)' : 'transparent',
        }}
      >
        <EyeOff size={ICON_SIZE.sm} />
      </button>
      {place && createPortal(
        <div
          ref={окноRef}
          role="dialog"
          aria-modal="false"
          aria-label={title}
          aria-describedby={вопросId}
          tabIndex={-1}
          className="liquid-glass"
          style={{
            ...GLASS_BLUR,
            position: 'fixed',
            top: `${place.top}px`,
            right: `${place.right}px`,
            // Поверх всего, включая лист скрытых и плашку отмены: окно живёт
            // секунды и обязано быть видно целиком.
            zIndex: 1000,
            width: 'min(268px, calc(100vw - 32px))',
            padding: 'var(--space-cozy)',
            borderRadius: '14px',
            outline: 'none',
            animation: 'card-in 0.16s cubic-bezier(0.22,1,0.36,1) both',
          }}
        >
          <p id={вопросId} style={{
            margin: '0 0 var(--space-snug)',
            fontSize: 'var(--font-subhead)',
            lineHeight: 'var(--leading-subhead)',
            color: 'var(--text-primary)',
          }}>
            {question}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-tight)' }}>
            <button
              type="button"
              onClick={() => { setPlace(null); вернутьФокус(); }}
              style={{
                flex: 1, minHeight: '44px',
                border: '1px solid var(--hairline)', borderRadius: '10px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontFamily: 'inherit', fontSize: 'var(--font-subhead)',
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => { setPlace(null); onConfirm(); вернутьФокус(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 'var(--space-tight)',
                flex: 1, minHeight: '44px',
                border: 'none', borderRadius: '10px',
                background: 'rgb(var(--ink-rgb) / 0.08)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit', fontSize: 'var(--font-subhead)',
                fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer',
              }}
            >
              <span>{confirmLabel}</span>
              <span aria-hidden style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}>
                {confirmIcon}
              </span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * HiddenSheet — что спрятано и как вернуть.
 *
 * Открывается кнопкой в шапке. Без неё скрытие делать нельзя: прежняя
 * редакция этого экрана прятала дуа без единого способа вернуть, и фичу
 * пришлось снимать целиком.
 */
function HiddenSheet({ items, onReturn, onClose }: {
  items: DuaEntry[];
  onReturn: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <SettingsSheet onClose={onClose} title="Скрытые дуа">
      <div style={{ display: 'grid', gap: 'var(--space-snug)' }}>
        {items.length === 0 && (
          <p style={{
            margin: 0, padding: 'var(--space-cozy) 0',
            fontSize: 'var(--font-subhead)', color: 'var(--text-tertiary)',
          }}>
            Ничего не скрыто.
          </p>
        )}
        {items.map(e => (
          <div key={e.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-snug)',
            minHeight: '48px',
            padding: '0 var(--space-tight) 0 var(--space-cozy)',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--hairline)',
            background: 'rgb(var(--ink-rgb) / 0.03)',
          }}>
            <span style={{
              flex: 1, minWidth: 0,
              fontSize: 'var(--font-subhead)', color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {e.title_ru}
            </span>
            {/* Возврат — обычной кнопкой, без вопроса: он ничего не прячет и
                легко отменяется повторным скрытием. Подтверждение стоит там,
                где действие убирает дуа с глаз (владелец 21.09.2026). */}
            <button
              type="button"
              onClick={() => onReturn(e.id)}
              aria-label={`Вернуть: ${e.title_ru}`}
              className="icon-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-tight)',
                flexShrink: 0, minHeight: '36px',
                padding: '0 var(--space-snug)',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--hairline)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontFamily: 'inherit', fontSize: 'var(--font-footnote)',
                cursor: 'pointer',
              }}
            >
              <span>Вернуть</span>
              <Eye size={ICON_SIZE.sm} />
            </button>
          </div>
        ))}
      </div>
    </SettingsSheet>
  );
}

function CategoryChips({ data, value, onChange }: {
  data: DuaData;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const chips: { id: string | null; label: string }[] = [
    { id: null, label: 'Все' },
    ...data.categories
      .filter(c => (data.by_category[c.id] ?? 0) > 0)
      .map(c => ({ id: c.id as string | null, label: c.title_ru })),
  ];

  return (
    <div
      style={{
        display: 'flex', gap: 'var(--space-snug)',
        overflowX: 'auto', overflowY: 'hidden',
        padding: '0 var(--space-hair) var(--space-margin)',
        // Полосу прокрутки не показываем: лента короткая, и её
        // продолжение видно по обрезанному краю.
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {chips.map(c => {
        const on = c.id === value;
        return (
          <button
            key={c.id ?? 'all'}
            onClick={() => onChange(c.id)}
            style={{
              flexShrink: 0, minHeight: '32px', padding: '0 var(--space-cozy)',
              borderRadius: 'var(--radius-pill)',
              border: `1px solid ${on ? 'var(--text-primary)' : 'var(--hairline)'}`,
              background: on
                ? 'rgb(var(--ink-rgb) / 0.08)'
                : 'transparent',
              color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'inherit', fontSize: 'var(--font-footnote)',
              fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Карточка дуа.
 *
 * Сделана как карточка азкара — по решению владельца, и это правильно:
 * два раздела с одинаковым содержимым (арабский, перевод, транскрипция,
 * источник) не должны выглядеть по-разному.  Порядок блоков, кегли,
 * межстрочные и приглушение перевода взяты оттуда же, а счётчик и
 * раскрывающийся источник — буквально те же компоненты
 * (`components/DevotionalBits.tsx`).
 *
 * ── Чем отличается от азкара ──────────────────────────────────────────
 *
 * Сверху есть строка с названием: у дуа заголовок отвечает на «когда
 * это читают», и без него список превращается в набор текстов.  У
 * азкаров такой строки нет — там всё содержимое одной категории читают
 * подряд.
 *
 * Кнопки воспроизведения нет: аудиозаписей для дуа в приложении пока
 * нет вовсе.  Рисовать кнопку, которой нечего проиграть, — обман.
 */
function DuaCard({
  entry, delay,
  prefs, count, onCount, onResetCount, menu,
}: {
  entry: DuaEntry;
  delay: number;
  prefs: DuaPrefs;
  count: number;
  onCount: () => void;
  onResetCount: () => void;
  /** Кнопка скрытия в правом верхнем углу карточки. */
  menu?: ReactNode;
}) {
  const font = azkarFontConfig(prefs.arabicFont);
  const repeat = entry.repeat && entry.repeat > 1 ? entry.repeat : null;

  return (
    <article
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--hairline)',
        background: `
          radial-gradient(120% 130% at 100% 0%,
            rgb(var(--ink-rgb) / 0.04) 0%,
            transparent 58%),
          var(--surface)
        `,
        animation: `card-in 0.34s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--space-cozy)',
        padding: 'var(--space-margin) var(--space-margin) var(--space-cozy)',
      }}>
        <h3 style={{
          flex: 1, minWidth: 0, margin: 0,
          fontSize: 'var(--font-subhead)', fontWeight: 'var(--weight-semibold)',
          lineHeight: 'var(--leading-subhead)',
          color: 'var(--text-primary)', letterSpacing: '-0.005em',
        }}>
          {entry.title_ru}
        </h3>
        {menu}
      </div>

      <Rule />

      <div style={{
        padding: 'var(--space-section) var(--space-margin) var(--space-margin)',
      }}>
        {/* Арабский — verbatim из источника.  Кегль, межстрочный и
            OpenType-фичи те же, что в азкарах: одна типографика на два
            раздела. */}
        {prefs.showArabic && (
          <div
            dir="rtl"
            lang="ar"
            style={{
              direction: 'rtl',
              textAlign: 'right',
              fontFamily: font.stack,
              fontSize: `clamp(${26 * font.sizeMul * prefs.arabicScale + 17}px, calc(${6.5 * font.sizeMul * prefs.arabicScale}vw + 17px), ${38 * font.sizeMul * prefs.arabicScale + 17}px)`,
              lineHeight: font.lineHeight,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-line',
              letterSpacing: 0,
              wordSpacing: 0,
              fontFeatureSettings: '"liga" 1, "calt" 1, "kern" 1',
              marginBottom: repeat ? '20px' : '22px',
            }}
          >
            {entry.arabic}
          </div>
        )}

        {repeat && (
          <div style={{ display: 'flex', marginBottom: '20px' }}>
            <TasbihPill
              current={count}
              target={repeat}
              onTap={onCount}
              onReset={onResetCount}
            />
          </div>
        )}

        {prefs.showRussian && entry.russian && (
          <p style={{
            margin: '0 0 18px',
            fontFamily: latinStack(prefs.russianFont),
            fontSize: `${15 * prefs.russianScale + latinSizeBump(prefs.russianFont)}px`,
            fontWeight: latinWeight(prefs.russianFont),
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-line',
          }}>
            {entry.russian}
          </p>
        )}

        {prefs.showTranslit && entry.translit_ru && (
          <p style={{
            margin: '0 0 18px',
            fontFamily: latinStack(prefs.translitFont),
            fontSize: `${15 * prefs.translitScale + latinSizeBump(prefs.translitFont)}px`,
            fontWeight: latinWeight(prefs.translitFont),
            lineHeight: 1.55,
            color: 'var(--text-tertiary)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-line',
          }}>
            {entry.translit_ru}
          </p>
        )}

        {entry.refs && entry.refs.length > 0 && (
          /* Ссылка стоит на карточке открыто, а не под кнопкой «Источник».
             Правило проекта: там, где цитируется аят, на экране должны быть
             видны и арабский, и перевод, и ссылка сура:аят — читающий обязан
             видеть, откуда текст, не совершая лишних действий.

             Раскрывающийся блок остаётся у азкаров: там за ним прячется
             список наград, а у дуа его нет — прятать одну строчку незачем. */
          <p style={{
            margin: 'var(--space-margin) 0 0',
            fontSize: 'var(--font-caption1)',
            lineHeight: 'var(--leading-caption1)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}>
            {entry.refs.join(' · ')}
          </p>
        )}
      </div>
    </article>
  );
}


function Rule() {
  return (
    <div
      aria-hidden
      style={{
        height: '1px',
        background: 'rgb(var(--ink-rgb) / 0.08)',
      }}
    />
  );
}
function UndoBar({ title, onUndo, onDismiss }: {
  title: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return createPortal(
    <div
      role="status"
      style={{
        position: 'fixed', left: 'var(--space-cozy)', right: 'var(--space-cozy)',
        zIndex: 62,
        bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom) + var(--space-cozy))`,
        display: 'flex', alignItems: 'center', gap: 'var(--space-cozy)',
        padding: 'var(--space-cozy) var(--space-cozy) var(--space-cozy) var(--space-margin)',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--hairline)',
        background: 'rgb(var(--surface-rgb) / 0.94)',
        backdropFilter: 'saturate(150%) blur(14px)',
        WebkitBackdropFilter: 'saturate(150%) blur(14px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        maxWidth: 'min(100%, 640px)', margin: '0 auto',
        animation: 'sheet-up 0.22s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 'var(--font-footnote)', color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        «{title}» убрано
      </span>
      <button
        onClick={onUndo}
        style={{
          flexShrink: 0, minHeight: '32px', padding: '0 var(--space-cozy)',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--hairline)',
          background: 'rgb(var(--ink-rgb) / 0.06)',
          color: 'var(--text-primary)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 'var(--font-footnote)',
          fontWeight: 'var(--weight-semibold)',
        }}
      >
        Вернуть
      </button>
      <button
        onClick={onDismiss}
        aria-label="Закрыть"
        style={{
          position: 'relative',
          flexShrink: 0, width: '30px', height: '30px',
          borderRadius: 'var(--radius-pill)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent',
          color: 'var(--text-tertiary)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 'var(--font-body)', lineHeight: 1,
        }}
      >
        <HitArea />
        ×
      </button>
    </div>,
    document.body,
  );
}
function Rosette({ size = 76 }: { size?: number }) {
  const petals = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    // Розетка — не иконка интерфейса, а орнамент пустого состояния, и
    // она остаётся в своей сетке 100×100: восемь лепестков через 45°
    // на 24 единицах округлились бы до заметно разной ширины, и
    // симметрия — единственное, ради чего фигура тут стоит, — сломалась
    // бы.  С набором её роднят правила, а не размер поля: одна толщина
    // на все линии (было 1.1 у лепестков и колец), одна прозрачность на
    // всю фигуру (было три разных — 0.5 / 0.75 / 0.5, из-за чего кольцо
    // выглядело обводкой другого веса), заливка только у сердцевины —
    // по тому же правилу «метка-указатель», что у компаса и цветка.
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.55"
      >
        {petals.map(a => (
          <ellipse
            key={a}
            cx="50" cy="27" rx="10.5" ry="20"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="12" />
        <circle cx="50" cy="50" r="3" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function EmptyAll() {
  return (
    <EmptyShell
      title="Тексты готовятся"
      text="Раздел собран и ждёт наполнения. Дуа переносятся из проверенного источника дословно, поэтому добавляются вручную, а не берутся откуда придётся."
    />
  );
}

function EmptyShell({ title, text, action }: {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: '44px 20px 40px',
      animation: 'card-in 0.4s cubic-bezier(0.22,1,0.36,1) both',
    }}>
      <span style={{
        color: 'var(--text-tertiary)', marginBottom: 'var(--space-section)',
      }}>
        <Rosette />
      </span>
      <p className="display-serif" style={{
        margin: 0, fontSize: 'var(--font-title2)',
        lineHeight: 'var(--leading-title2)', fontWeight: 'var(--weight-regular)',
        color: 'var(--text-primary)', letterSpacing: '-0.015em',
      }}>
        {title}
      </p>
      <p style={{
        margin: 'var(--space-cozy) 0 0', maxWidth: '33ch',
        fontSize: 'var(--font-footnote)', lineHeight: 'var(--leading-footnote)',
        color: 'var(--text-tertiary)',
      }}>
        {text}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 'var(--space-section)', minHeight: 'var(--hit-min)',
            padding: '0 var(--space-margin)',
            borderRadius: 'var(--radius-control)', border: '1px solid var(--hairline)',
            background: 'rgb(var(--ink-rgb) / 0.05)',
            color: 'var(--text-primary)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 'var(--font-subhead)',
            fontWeight: 'var(--weight-regular)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Заглушка повторяет геометрию карточки, чтобы при подмене не прыгало. */
function Skeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-margin)' }} aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: '212px', borderRadius: 'var(--radius-card)' }}
        />
      ))}
    </div>
  );
}
