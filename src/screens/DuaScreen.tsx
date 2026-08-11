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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, Bookmark, Trash } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';
import { loadDuaData, type DuaData, type DuaEntry } from '../lib/dua';
import {
  moveInDuaList, onDuaListChange, readDuaList,
  removeFromDuaList, toggleInDuaList,
} from '../lib/duaList';

type Props = { theme: Theme; setTheme: (t: Theme) => void };
type Mode = 'mine' | 'all';

/** Тот же стек, что у арабского в азкарах: разделы рядом, и разное
 *  начертание читалось бы как разное качество текста. */
const ARABIC_STACK =
  "'Azkar KFGQPC', 'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif";

/** Дальше задержку не растим: последние карточки не должны ждать. */
const MAX_STAGGER_MS = 240;

export function DuaScreen({ theme, setTheme }: Props) {
  const [data, setData] = useState<DuaData | null>(null);
  const [mode, setMode] = useState<Mode>('mine');
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [list, setList] = useState<string[]>(readDuaList);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    loadDuaData().then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  useEffect(() => onDuaListChange(() => setList(readDuaList())), []);

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

  const shown = useMemo(() => {
    if (!data) return [];
    if (category === null) return data.entries;
    return data.entries.filter(e => e.category === category);
  }, [data, category]);

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
        <button
          ref={themeBtnRef}
          onClick={() => setThemeOpen(v => !v)}
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
        allCount={total}
      />

      {/* Панель режима: слева что показано, справа вход в правку.
          Появляется только когда есть что править. */}
      {mode === 'mine' && mine.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '0 2px 12px',
        }}>
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: '12px', color: 'var(--text-tertiary)',
          }}>
            {editing
              ? 'Стрелками — порядок чтения'
              : `${mine.length} в вашем порядке`}
          </span>
          <button
            onClick={() => setEditing(v => !v)}
            style={{
              minHeight: '30px', padding: '0 13px', borderRadius: '9999px',
              border: `1px solid ${editing ? 'var(--text-primary)' : 'var(--hairline)'}`,
              background: editing
                ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                : 'transparent',
              color: 'var(--text-primary)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {editing ? 'Готово' : 'Изменить'}
          </button>
        </div>
      )}

      {mode === 'all' && total > 0 && data && data.categories.length > 1 && (
        <CategoryChips data={data} value={category} onChange={setCategory} />
      )}

      {!data && <Skeleton />}

      {data && mode === 'mine' && (
        mine.length === 0
          ? <EmptyMine hasAny={total > 0} onBrowse={() => setMode('all')} />
          : editing
            ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' }}>
                {mine.map((e, i) => (
                  <EditRow
                    key={e.id}
                    entry={e}
                    ordinal={i + 1}
                    first={i === 0}
                    last={i === mine.length - 1}
                    onMove={d => moveInDuaList(e.id, d)}
                    onRemove={() => removeFromDuaList(e.id)}
                  />
                ))}
              </div>
            )
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' }}>
                {mine.map((e, i) => (
                  <DuaCard
                    key={e.id}
                    entry={e}
                    ordinal={i + 1}
                    inList
                    delay={Math.min(i * 40, MAX_STAGGER_MS)}
                    onToggle={() => removeFromDuaList(e.id)}
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
                  onToggle={() => toggleInDuaList(e.id)}
                />
              ))}
            </div>
          )
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
 * Карточка для чтения.
 *
 * Структура важнее украшений.  Шапка (когда читают, сколько раз,
 * закладка) отделена правилом от текста; арабский стоит отдельным
 * блоком с воздухом под диакритику; перевод отделён вторым правилом.
 * Так глаз сразу знает, где текст, а где опора к нему.
 *
 * Номер по порядку — только в «моём списке»: там порядок задал человек
 * и он часть смысла.  В витрине номер был бы шумом.
 */
function DuaCard({ entry, ordinal, inList, delay, onToggle }: {
  entry: DuaEntry;
  ordinal?: number;
  inList: boolean;
  delay: number;
  onToggle: () => void;
}) {
  return (
    <article
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '20px',
        border: '1px solid var(--hairline)',
        // Тот же приём, что у карточки ближайшего намаза: очень слабый
        // блик из верхнего угла.  Дом один — язык один.
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

        {entry.repeat && entry.repeat > 1 && (
          <span
            title={`Читается ${entry.repeat} раза`}
            style={{
              flexShrink: 0, minWidth: '30px', height: '24px', padding: '0 7px',
              borderRadius: '9999px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--ink) 7%, transparent)',
              fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums', marginTop: '1px',
            }}
          >
            ×{entry.repeat}
          </span>
        )}

        <button
          onClick={onToggle}
          aria-label={inList ? 'Убрать из моего списка' : 'Добавить в мой список'}
          title={inList ? 'Убрать из моего списка' : 'Добавить в мой список'}
          style={{
            flexShrink: 0,
            width: '32px', height: '32px', borderRadius: '9999px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent',
            color: inList ? 'var(--text-primary)' : 'var(--text-tertiary)',
            cursor: 'pointer', marginTop: '-3px', marginRight: '-4px',
            WebkitTapHighlightColor: 'transparent',
            transition: 'color 0.18s ease',
          }}
        >
          <Bookmark size={19} isFilled={inList} />
        </button>
      </div>

      <Rule />

      {/* Арабский — verbatim из источника, шрифтом мусхафа. */}
      <p dir="rtl" lang="ar" style={{
        margin: 0, padding: '18px 16px 16px',
        fontFamily: ARABIC_STACK,
        fontSize: '26px', lineHeight: 2.05,
        textAlign: 'right',
        color: 'var(--text-primary)',
      }}>
        {entry.arabic}
      </p>

      {entry.translit_ru && (
        <p style={{
          margin: 0, padding: '0 16px 16px',
          fontSize: '13px', lineHeight: 1.6,
          color: 'var(--text-tertiary)',
        }}>
          {entry.translit_ru}
        </p>
      )}

      <Rule />

      <div style={{ padding: '14px 16px 16px' }}>
        <p style={{
          margin: 0, fontSize: '14.5px', lineHeight: 1.65,
          color: 'var(--text-primary)',
        }}>
          {entry.russian}
        </p>

        {entry.refs && entry.refs.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '13px',
          }}>
            {entry.refs.map(r => (
              <span key={r} style={{
                fontSize: '11px', padding: '3px 9px', borderRadius: '9999px',
                border: '1px solid var(--hairline)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.01em',
              }}>
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** Правило внутри карточки — слабее рамки, иначе карточка распадается
 *  на три отдельные плашки. */
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
 * Строка в режиме правки.
 *
 * Плотно: весь список должен быть виден целиком, иначе переставлять
 * приходится наугад.  Тексты здесь не нужны — переставляют по названию.
 */
function EditRow({ entry, ordinal, first, last, onMove, onRemove }: {
  entry: DuaEntry;
  ordinal: number;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      minHeight: '54px', padding: '8px 10px 8px 12px',
      borderRadius: '14px',
      // Колонка grid снаружи задана как minmax(0, 1fr), но подстрахуемся:
      // без этого nowrap-заголовок вытягивал строку за край экрана и
      // стрелки с корзиной уезжали за границу — поймано на симуляторе.
      overflow: 'hidden',
      border: '1px solid var(--hairline)',
      background: 'var(--surface)',
    }}>
      <span style={{
        flexShrink: 0,
        width: '22px', height: '22px', borderRadius: '9999px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--ink) 7%, transparent)',
        fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {ordinal}
      </span>

      <span style={{
        flex: 1, minWidth: 0,
        fontSize: '14.5px', fontWeight: 500, color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {entry.title_ru}
      </span>

      <span style={{ display: 'inline-flex', gap: '3px', flexShrink: 0 }}>
        <Mini label="Выше" disabled={first} onClick={() => onMove(-1)}>↑</Mini>
        <Mini label="Ниже" disabled={last} onClick={() => onMove(1)}>↓</Mini>
        <Mini label="Убрать из списка" disabled={false} onClick={onRemove}>
          <Trash size={14} />
        </Mini>
      </span>
    </div>
  );
}

function Mini({ children, onClick, disabled, label }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: '32px', height: '32px', borderRadius: '9px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--hairline)', background: 'transparent',
        color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        fontFamily: 'inherit', fontSize: '13px', lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
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
