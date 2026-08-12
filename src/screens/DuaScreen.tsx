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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Appearance, Check, Close, DragHandle, EyeOff, MinusCircleFill, Plus, Typography,
} from '../components/icons';
import { AzkarTypographySettings } from '../components/AzkarSettings';
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
import {
  addToDuaList, insertIntoDuaList, moveInDuaList, onDuaListChange,
  readDuaList, removeFromDuaList,
} from '../lib/duaList';
import {
  hideDua, onHiddenDuaChange, readHiddenDua, unhideDua,
} from '../lib/duaHidden';

type Props = { theme: Theme; setTheme: (t: Theme) => void };
type Mode = 'mine' | 'all';

/** Дальше задержку не растим: последние карточки не должны ждать. */
const MAX_STAGGER_MS = 240;

export function DuaScreen({ theme, setTheme }: Props) {
  const [data, setData] = useState<DuaData | null>(null);
  const [mode, setMode] = useState<Mode>('mine');
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [list, setList] = useState<string[]>(readDuaList);
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

  useEffect(() => onDuaListChange(() => setList(readDuaList())), []);

  const [hidden, setHidden] = useState<string[]>(readHiddenDua);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  useEffect(() => onHiddenDuaChange(() => setHidden(readHiddenDua())), []);

  // Правка живёт только в «моём списке»: в витрине нечего переставлять.
  useEffect(() => { if (mode !== 'mine') setEditing(false); }, [mode]);

  const byId = useMemo(() => {
    const map = new Map<string, DuaEntry>();
    for (const e of data?.entries ?? []) map.set(e.id, e);
    return map;
  }, [data]);

  // Список хранит только id: если дуа исчезло из данных при правке
  // сборника, запись не показывается, но из хранилища не стирается —
  // вернётся вместе с текстом.
  const mine = list.map(id => byId.get(id)).filter((e): e is DuaEntry => !!e);
  const total = data?.entries.length ?? 0;

  /*
   * Отмена вместо подтверждения.
   *
   * Потеря дуа из списка обратима, и Apple такие вещи лечит не диалогом
   * перед каждым удалением, а возможностью вернуть — как «Undo Send» в
   * Почте.  Диалог на каждое удаление превращается в нытьё, и человек
   * начинает жать «да» не читая.
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

  const remove = useCallback((entry: DuaEntry) => {
    const index = readDuaList().indexOf(entry.id);
    removeFromDuaList(entry.id);
    rememberUndo(entry.id, index < 0 ? 0 : index, entry.title_ru);
  }, [rememberUndo]);

  /*
   * Кнопка в витрине только добавляет.
   *
   * Раньше она была переключателем и снимала дуа из списка одним
   * касанием — та же дыра, из-за которой убрали закладку с карточек
   * «Моего списка».  Убирать теперь можно ровно в одном месте: «Мой
   * список» → «Изменить».  Одно действие — одно место.
   */
  const add = useCallback((entry: DuaEntry) => {
    addToDuaList(entry.id);
    setUndo(null);
  }, []);

  // Витрина без скрытого: смысл скрытия в том, чтобы этого здесь не
  // было.  «Мой список» не фильтруем — его человек собрал руками, и
  // прятать оттуда никто не просил.
  const visible = useMemo(
    () => (data?.entries ?? []).filter(e => !hidden.includes(e.id)),
    [data, hidden],
  );
  const shown = useMemo(() => (
    category === null ? visible : visible.filter(e => e.category === category)
  ), [visible, category]);
  const hiddenEntries = hidden
    .map(id => byId.get(id))
    .filter((e): e is DuaEntry => !!e);

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 'min(100%, 720px)',
      margin: '0 auto',
      padding: `0 16px calc(${TAB_BAR_HEIGHT}px + 28px + env(safe-area-inset-bottom))`,
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
        display: 'flex', alignItems: 'center', gap: '10px',
        paddingTop: 'calc(env(safe-area-inset-top) + 18px)',
        paddingBottom: '14px',
      }}>
        <h1 className="display-serif" style={{
          margin: 0, flex: 1, minWidth: 0,
          fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 400,
          letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.05,
        }}>
          Дуа
        </h1>

        {/* «Изменить» стоит в шапке справа, а не отдельной строкой под
            переключателем: у Apple вход в правку списка живёт именно
            здесь, и рука тянется туда по привычке. */}
        {mode === 'mine' && mine.length > 0 && (
          <button
            onClick={() => setEditing(v => !v)}
            style={{
              minHeight: '34px', padding: '0 14px', borderRadius: '9999px',
              border: `1px solid ${editing ? 'var(--text-primary)' : 'var(--hairline)'}`,
              background: editing
                ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                : 'transparent',
              color: 'var(--text-primary)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px',
              fontWeight: editing ? 600 : 500,
              flexShrink: 0,
            }}
          >
            {editing ? 'Готово' : 'Изменить'}
          </button>
        )}

        <button
          ref={typographyBtnRef}
          onClick={() => { setTypographyOpen(v => !v); setThemeOpen(false); }}
          aria-label="Текст и шрифты" title="Текст и шрифты"
          className="icon-btn" data-active={typographyOpen}
          style={{
            width: '42px', height: '42px', flexShrink: 0, borderRadius: '12px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: typographyOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Typography size={19} />
        </button>

        <button
          ref={themeBtnRef}
          onClick={() => { setThemeOpen(v => !v); setTypographyOpen(false); }}
          aria-label="Оформление" title="Оформление"
          className="icon-btn" data-active={themeOpen}
          style={{
            width: '42px', height: '42px', flexShrink: 0, borderRadius: '12px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: themeOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Appearance size={19} />
        </button>
      </header>

      <ModeSwitch
        mode={mode}
        onChange={setMode}
        mineCount={mine.length}
        allCount={visible.length}
      />

      {mode === 'all' && total > 0 && data && data.categories.length > 1 && (
        <CategoryChips data={data} value={category} onChange={setCategory} />
      )}

      {/* Кнопка появляется только когда есть что возвращать: пустой
          пункт «Скрытые · 0» был бы мусором на экране. */}
      {mode === 'all' && hiddenEntries.length > 0 && (
        <button
          onClick={() => setHiddenOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            width: '100%', minHeight: '40px', padding: '0 14px',
            marginBottom: '14px',
            borderRadius: '12px',
            border: '1px dashed var(--hairline-strong)',
            background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '13px', textAlign: 'left',
          }}
        >
          <EyeOff size={16} />
          <span style={{ flex: 1 }}>Скрытые</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)' }}>
            {hiddenEntries.length}
          </span>
        </button>
      )}

      {!data && <Skeleton />}

      {data && mode === 'mine' && (
        mine.length === 0
          ? <EmptyMine hasAny={total > 0} onBrowse={() => setMode('all')} />
          : editing
            ? (
              <EditList items={mine} onRemove={remove} />
            )
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' }}>
                {mine.map((e, i) => (
                  /*
                   * Кнопки удаления на карточке чтения нет намеренно.
                   * Раньше закладка справа сверху убирала дуа одним
                   * касанием — случайный тап терял собранное молча.
                   * Убрать можно только через «Изменить», и там в два
                   * шага.
                   */
                  <DuaCard
                    key={e.id}
                    entry={e}
                    ordinal={i + 1}
                    inList
                    delay={Math.min(i * 40, MAX_STAGGER_MS)}
                    prefs={prefs}
                    count={counts[e.id] ?? 0}
                    onCount={() => inc(e.id)}
                    onResetCount={() => reset(e.id)}
                  />
                ))}
              </div>
            )
      )}

      {data && mode === 'all' && (
        total === 0
          ? <EmptyAll />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' }}>
              {shown.map((e, i) => (
                <DuaCard
                  key={e.id}
                  entry={e}
                  inList={list.includes(e.id)}
                  delay={Math.min(i * 40, MAX_STAGGER_MS)}
                  onAdd={() => add(e)}
                  onHide={() => hideDua(e.id)}
                  prefs={prefs}
                  count={counts[e.id] ?? 0}
                  onCount={() => inc(e.id)}
                  onResetCount={() => reset(e.id)}
                />
              ))}
            </div>
          )
      )}

      {hiddenOpen && (
        <HiddenSheet
          entries={hiddenEntries}
          onUnhide={id => unhideDua(id)}
          onClose={() => setHiddenOpen(false)}
        />
      )}

      {undo && (
        <UndoBar
          title={undo.title}
          onUndo={() => { insertIntoDuaList(undo.id, undo.index); setUndo(null); }}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}

/**
 * Переключатель с едущей подложкой.
 *
 * Подложка, а не две перекрашиваемые кнопки: она показывает, что
 * состояния ровно два и они рядом.  Едет `transform`, а не `left`: это
 * композиторное свойство и оно не вызывает пересчёт вёрстки.
 */
function ModeSwitch({ mode, onChange, mineCount, allCount }: {
  mode: Mode;
  onChange: (m: Mode) => void;
  mineCount: number;
  allCount: number;
}) {
  const items: { id: Mode; label: string; count: number }[] = [
    { id: 'mine', label: 'Мой список', count: mineCount },
    { id: 'all',  label: 'Все дуа',    count: allCount },
  ];
  const index = items.findIndex(i => i.id === mode);

  return (
    <div
      role="tablist"
      style={{
        position: 'relative',
        display: 'flex',
        padding: '4px',
        borderRadius: '14px',
        background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
        border: '1px solid var(--hairline)',
        marginBottom: '14px',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: '4px', bottom: '4px', left: '4px',
          width: 'calc(50% - 4px)',
          borderRadius: '11px',
          background: 'var(--surface)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.06)',
          transform: `translateX(${index * 100}%)`,
          transition: 'transform 0.26s cubic-bezier(0.22,1,0.36,1)',
        }}
      />
      {items.map(it => {
        const on = it.id === mode;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            style={{
              position: 'relative',
              flex: 1, minHeight: '38px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              border: 'none', background: 'transparent',
              color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: on ? 600 : 500,
              cursor: 'pointer', transition: 'color 0.2s ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {it.label}
            {it.count > 0 && (
              <span style={{
                fontSize: '11.5px', fontWeight: 500,
                color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Фильтр по подборкам — горизонтальной лентой, чтобы не съедать высоту. */
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
        display: 'flex', gap: '7px',
        overflowX: 'auto', overflowY: 'hidden',
        padding: '0 2px 14px',
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
              flexShrink: 0, minHeight: '32px', padding: '0 13px',
              borderRadius: '9999px',
              border: `1px solid ${on ? 'var(--text-primary)' : 'var(--hairline)'}`,
              background: on
                ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                : 'transparent',
              color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: on ? 600 : 500,
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
  entry, ordinal, inList, delay, onAdd, onHide,
  prefs, count, onCount, onResetCount,
}: {
  entry: DuaEntry;
  ordinal?: number;
  inList: boolean;
  delay: number;
  /** Добавить в мой список.  Без него кнопки нет — так карточка в
   *  «Моём списке» остаётся без действий над списком. */
  onAdd?: () => void;
  /** Скрыть из витрины.  Только в витрине. */
  onHide?: () => void;
  prefs: DuaPrefs;
  count: number;
  onCount: () => void;
  onResetCount: () => void;
}) {
  const font = azkarFontConfig(prefs.arabicFont);
  const repeat = entry.repeat && entry.repeat > 1 ? entry.repeat : null;

  return (
    <article
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '20px',
        border: '1px solid var(--hairline)',
        background: `
          radial-gradient(120% 130% at 100% 0%,
            color-mix(in srgb, var(--ink) 4%, transparent) 0%,
            transparent 58%),
          var(--surface)
        `,
        animation: `card-in 0.34s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '15px 16px 13px',
      }}>
        {ordinal !== undefined && (
          <span style={{
            flexShrink: 0,
            width: '24px', height: '24px', borderRadius: '9999px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--hairline)',
            fontSize: '11.5px', fontWeight: 600,
            color: 'var(--text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
            marginTop: '1px',
          }}>
            {ordinal}
          </span>
        )}

        <h3 style={{
          flex: 1, minWidth: 0, margin: 0,
          fontSize: '15px', fontWeight: 600, lineHeight: 1.35,
          color: 'var(--text-primary)', letterSpacing: '-0.005em',
        }}>
          {entry.title_ru}
        </h3>

        {onHide && (
          <button
            onClick={onHide}
            aria-label={`Скрыть «${entry.title_ru}»`}
            title="Скрыть из «Все дуа»"
            style={{
              flexShrink: 0,
              width: '34px', height: '34px', borderRadius: '9999px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              marginTop: '-2px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <EyeOff size={19} />
          </button>
        )}

        {onAdd && (
          /*
           * Крупный «+» вместо прежней закладки — решение владельца.
           * Плюс прямо говорит, что произойдёт: дуа добавится в список.
           * Закладка этого не говорила, её принимали за «отметить».
           *
           * Когда дуа уже в списке — галочка, и кнопка не нажимается.
           * Убрать можно ровно в одном месте: «Мой список» →
           * «Изменить».  Иначе вернулась бы потеря по случайному
           * касанию, из-за которой закладку и убрали.
           */
          <button
            onClick={inList ? undefined : onAdd}
            disabled={inList}
            aria-label={inList ? 'Уже в вашем списке' : `Добавить «${entry.title_ru}» в мой список`}
            title={inList ? 'Уже в вашем списке' : 'Добавить в мой список'}
            style={{
              flexShrink: 0,
              width: '36px', height: '36px', borderRadius: '9999px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${inList ? 'transparent' : 'var(--hairline-strong)'}`,
              background: inList
                ? 'color-mix(in srgb, var(--ink) 7%, transparent)'
                : 'color-mix(in srgb, var(--ink) 5%, transparent)',
              color: inList ? 'var(--text-tertiary)' : 'var(--text-primary)',
              cursor: inList ? 'default' : 'pointer',
              marginTop: '-3px', marginRight: '-2px',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.18s ease, color 0.18s ease',
            }}
          >
            {inList ? <Check size={18} /> : <Plus size={22} />}
          </button>
        )}
      </div>

      <Rule />

      <div style={{ padding: '20px 16px 16px' }}>
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
            margin: '14px 0 0',
            fontSize: '12px',
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
        background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
      }}
    />
  );
}

/**
 * Список в режиме правки — с перетаскиванием за хват.
 *
 * ── Почему перетаскивание, а не стрелки ───────────────────────────────
 *
 * Стрелки были моей самоделкой: у Apple порядок в списке меняют
 * перетаскиванием за хват из трёх полос справа.  Стрелками десять
 * позиций переставляются десятью нажатиями, перетаскиванием — одним
 * движением.
 *
 * Тянуть можно только за хват: `touch-action: none` стоит на нём одном,
 * поэтому за остальную площадь строки страница по-прежнему
 * прокручивается.  Если бы захват работал по всей строке, список
 * перестал бы скроллиться.
 *
 * Стрелки клавиатуры на хвате оставлены для доступности — так порядок
 * меняется и без мыши, и у Apple это работает так же.
 *
 * ── Почему удаление в два шага ─────────────────────────────────────────
 *
 * Минус слева ничего не удаляет: он открывает кнопку «Удалить».
 * Удаляет только второе касание.  Это тот самый порядок, что у Apple в
 * списках, и он защищает от случайного касания надёжнее диалога —
 * диалог люди закрывают не читая.
 */
function EditList({ items, onRemove }: {
  items: DuaEntry[];
  onRemove: (entry: DuaEntry) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  // Какая строка раскрыла кнопку «Удалить».  Одна за раз: две открытые
  // красные кнопки на экране — приглашение промахнуться.
  const [armed, setArmed] = useState<string | null>(null);

  const startY = useRef(0);

  const rowsNow = () => Array.from(
    boxRef.current?.querySelectorAll<HTMLElement>('[data-dua-row]') ?? [],
  );

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    // Захват указателя нужен, чтобы палец, ушедший за пределы хвата,
    // продолжал тянуть строку.  В try, потому что на неактивном
    // указателе браузер бросает NotFoundError, и падение обработчика
    // сорвало бы весь жест.
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* не критично */ }
    setDragId(id);
    setDragDy(0);
    setArmed(null);
    startY.current = e.clientY;
  };

  const onPointerMove = (id: string) => (e: React.PointerEvent) => {
    if (dragId !== id) return;
    setDragDy(e.clientY - startY.current);

    // Куда переносить: строка, чью середину пересёк палец.  Пересчитываем
    // из DOM на каждом движении — после переноса порядок и координаты
    // меняются, кэшировать нельзя.
    const rows = rowsNow();
    const from = rows.findIndex(r => r.dataset.duaRow === id);
    if (from === -1) return;
    let to = from;
    for (let i = 0; i < rows.length; i++) {
      if (i === from) continue;
      const r = rows[i].getBoundingClientRect();
      const middle = r.top + r.height / 2;
      if (i < from && e.clientY < middle) { to = i; break; }
      if (i > from && e.clientY > middle) to = i;
    }
    if (to !== from) {
      moveInDuaList(id, to - from);
      // Точку отсчёта переносим вместе со строкой, иначе смещение
      // накапливается и строка «убегает» от пальца.
      startY.current = e.clientY;
      setDragDy(0);
    }
  };

  const endDrag = () => { setDragId(null); setDragDy(0); };

  const onHandleKey = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveInDuaList(id, -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveInDuaList(id, 1); }
  };

  return (
    <div
      ref={boxRef}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' }}
    >
      {items.map((e, i) => {
        const dragging = dragId === e.id;
        return (
          <div
            key={e.id}
            data-dua-row={e.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              minHeight: '56px', padding: '8px 8px 8px 10px',
              borderRadius: '14px',
              border: `1px solid ${dragging ? 'var(--hairline-strong)' : 'var(--hairline)'}`,
              background: 'var(--surface)',
              overflow: 'hidden',
              // Поднимаем перетаскиваемую строку над остальными: без
              // этого непонятно, что именно ты держишь.
              transform: dragging ? `translateY(${dragDy}px) scale(1.015)` : 'none',
              boxShadow: dragging ? '0 10px 26px rgba(0,0,0,0.28)' : 'none',
              zIndex: dragging ? 2 : 1,
              position: 'relative',
              transition: dragging
                ? 'box-shadow 0.18s ease'
                : 'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s ease',
              touchAction: 'pan-y',
            }}
          >
            <button
              onClick={() => setArmed(a => (a === e.id ? null : e.id))}
              aria-label={armed === e.id ? 'Отменить удаление' : `Удалить ${e.title_ru}`}
              aria-expanded={armed === e.id}
              style={{
                flexShrink: 0,
                width: '34px', height: '34px', borderRadius: '9999px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent',
                color: 'var(--danger)', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                // Поворот минуса — тот же знак, что у Apple: «нажатие
                // принято, подтверди справа».
                transform: armed === e.id ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <MinusCircleFill size={21} />
            </button>

            <span style={{
              flexShrink: 0,
              width: '22px', height: '22px', borderRadius: '9999px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--ink) 7%, transparent)',
              fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {i + 1}
            </span>

            <span style={{
              flex: 1, minWidth: 0,
              fontSize: '14.5px', fontWeight: 500, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {e.title_ru}
            </span>

            {armed === e.id ? (
              <button
                onClick={() => { setArmed(null); onRemove(e); }}
                style={{
                  flexShrink: 0, minHeight: '34px', padding: '0 14px',
                  borderRadius: '9999px', border: 'none',
                  background: 'var(--danger)',
                  color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600,
                  animation: 'card-in 0.18s ease both',
                }}
              >
                Удалить
              </button>
            ) : (
              <button
                onPointerDown={onPointerDown(e.id)}
                onPointerMove={onPointerMove(e.id)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onHandleKey(e.id)}
                aria-label={`${e.title_ru}: изменить порядок`}
                style={{
                  flexShrink: 0,
                  width: '38px', height: '38px', borderRadius: '10px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent',
                  color: 'var(--text-tertiary)',
                  cursor: dragging ? 'grabbing' : 'grab',
                  // Только на хвате: за остальную площадь строки страница
                  // должна прокручиваться как обычно.
                  touchAction: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <DragHandle size={19} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Список скрытых дуа.
 *
 * Единственный путь вернуть скрытое — так попросил владелец, и это
 * честно: скрывают осознанно и надолго, всплывашка «вернуть» здесь была
 * бы шумом.  Зато сам список обязан быть на виду, иначе скрытое
 * превращается в потерянное — поэтому кнопка к нему стоит прямо в
 * витрине и показывает, сколько там лежит.
 *
 * Портал в body: экран задаёт свой контекст наложения, и без портала
 * лист уехал бы под панель вкладок.
 */
function HiddenSheet({ entries, onUnhide, onClose }: {
  entries: DuaEntry[];
  onUnhide: (id: string) => void;
  onClose: () => void;
}) {
  // Когда вернули последнее — закрываемся сами: пустой лист держать
  // открытым незачем.
  useEffect(() => { if (entries.length === 0) onClose(); }, [entries.length, onClose]);

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.45)',
          animation: 'fade-in 0.18s ease',
        }}
      />
      <div
        role="dialog"
        aria-label="Скрытые дуа"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
          maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)',
          borderTopLeftRadius: '22px', borderTopRightRadius: '22px',
          borderTop: '1px solid var(--hairline)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.32)',
          animation: 'sheet-up 0.24s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '16px 18px 12px',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <h2 className="display-serif" style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: '22px', fontWeight: 400, letterSpacing: '-0.015em',
            color: 'var(--text-primary)',
          }}>
            Скрытые
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="icon-btn"
            style={{
              width: '34px', height: '34px', flexShrink: 0, borderRadius: '9999px',
              border: '1px solid var(--hairline)', background: 'transparent',
              color: 'var(--text-secondary)',
            }}
          >
            <Close size={15} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          {entries.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 18px',
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                overflow: 'hidden',
              }}
            >
              <span style={{
                flex: 1, minWidth: 0,
                fontSize: '14.5px', color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {e.title_ru}
              </span>
              <button
                onClick={() => onUnhide(e.id)}
                style={{
                  flexShrink: 0, minHeight: '32px', padding: '0 14px',
                  borderRadius: '9999px',
                  border: '1px solid var(--hairline)',
                  background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                }}
              >
                Вернуть
              </button>
            </div>
          ))}
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom)', flexShrink: 0 }} />
      </div>
    </>,
    document.body,
  );
}

/**
 * Всплывашка отмены.
 *
 * Портал в body: экран задаёт свой контекст наложения, и без портала
 * всплывашка уехала бы под панель вкладок — та же ловушка, что была с
 * листом городов на экране намаза.
 *
 * Живёт шесть секунд.  Меньше — не успеть прочитать и дотянуться,
 * больше — начинает мешать.
 */
function UndoBar({ title, onUndo, onDismiss }: {
  title: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return createPortal(
    <div
      role="status"
      style={{
        position: 'fixed', left: '12px', right: '12px', zIndex: 62,
        bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom) + 12px)`,
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '11px 12px 11px 16px',
        borderRadius: '15px',
        border: '1px solid var(--hairline)',
        background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
        backdropFilter: 'saturate(150%) blur(14px)',
        WebkitBackdropFilter: 'saturate(150%) blur(14px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        maxWidth: 'min(100%, 640px)', margin: '0 auto',
        animation: 'sheet-up 0.22s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: '13.5px', color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        «{title}» убрано
      </span>
      <button
        onClick={onUndo}
        style={{
          flexShrink: 0, minHeight: '32px', padding: '0 14px',
          borderRadius: '9999px',
          border: '1px solid var(--hairline)',
          background: 'color-mix(in srgb, var(--ink) 6%, transparent)',
          color: 'var(--text-primary)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600,
        }}
      >
        Вернуть
      </button>
      <button
        onClick={onDismiss}
        aria-label="Скрыть"
        style={{
          flexShrink: 0, width: '30px', height: '30px', borderRadius: '9999px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent',
          color: 'var(--text-tertiary)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '17px', lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

/**
 * Розетка — та же форма, что обрамляет номер аята в мусхафе.
 *
 * Вместо иконки из общего набора: пустое состояние — единственное
 * место, где у раздела есть возможность выглядеть своим, а не
 * «экраном приложения».
 */
function Rosette({ size = 76 }: { size?: number }) {
  const petals = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      {petals.map(a => (
        <ellipse
          key={a}
          cx="50" cy="27" rx="10.5" ry="20"
          transform={`rotate(${a} 50 50)`}
          stroke="currentColor"
          strokeWidth="1.1"
          opacity="0.5"
        />
      ))}
      <circle cx="50" cy="50" r="12" stroke="currentColor" strokeWidth="1.1" opacity="0.75" />
      <circle cx="50" cy="50" r="3" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function EmptyMine({ hasAny, onBrowse }: { hasAny: boolean; onBrowse: () => void }) {
  return (
    <EmptyShell
      title="Здесь будет ваш порядок"
      text={hasAny
        ? 'Отметьте закладкой дуа, которые читаете часто. Они соберутся здесь в том порядке, в каком вы их читаете, — порядок можно менять.'
        : 'Сюда попадут дуа, которые вы отметите закладкой. Сначала в разделе должны появиться сами тексты.'}
      action={hasAny ? { label: 'Смотреть все дуа', onClick: onBrowse } : undefined}
    />
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
      <span style={{ color: 'var(--text-tertiary)', marginBottom: '20px' }}>
        <Rosette />
      </span>
      <p className="display-serif" style={{
        margin: 0, fontSize: '22px', fontWeight: 400,
        color: 'var(--text-primary)', letterSpacing: '-0.015em',
      }}>
        {title}
      </p>
      <p style={{
        margin: '10px 0 0', maxWidth: '33ch',
        fontSize: '13.5px', lineHeight: 1.65, color: 'var(--text-tertiary)',
      }}>
        {text}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: '20px', minHeight: '44px', padding: '0 20px',
            borderRadius: '13px', border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
            color: 'var(--text-primary)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '14.5px', fontWeight: 500,
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' }} aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: '212px', borderRadius: '20px' }} />
      ))}
    </div>
  );
}
