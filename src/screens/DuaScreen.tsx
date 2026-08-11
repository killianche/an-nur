/**
 * DuaScreen — раздел «Дуа»: мой список и все дуа.
 *
 * ── Устройство экрана ─────────────────────────────────────────────────
 *
 * Один переключатель на два состояния, как описал владелец:
 *
 *   [ Мой список ] [ Все дуа ]
 *
 * «Мой список» стоит первым и открывается по умолчанию — это то, ради
 * чего в раздел заходят каждый день.  «Все дуа» — витрина, откуда
 * добавляют.
 *
 * Почему переключатель, а не две вкладки внизу или два экрана: список и
 * витрина — это одно и то же содержимое в двух срезах, между ними
 * переключаются постоянно, и любой переход с уходом на другой экран
 * ломал бы этот ритм.
 *
 * ── Что в списке ──────────────────────────────────────────────────────
 *
 * Только дуа.  Не аяты, не азкары — решение владельца, и тип это
 * гарантирует: `lib/duaList.ts` хранит id из `dua.json` и ничего
 * другого принять не может.
 *
 * ── Про пустоту ───────────────────────────────────────────────────────
 *
 * Пока `dua.json` пуст, и это честно показано, а не спрятано за
 * бесконечным спиннером.  Тексты — сакральные, они переносятся из
 * источника владельца, а не сочиняются (см. CLAUDE.md и
 * public/dua/README.md).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, BookOpen, Close, Sparkle } from '../components/icons';
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

/** Тот же стек, что у арабского в азкарах: раздел рядом, и разное
 *  начертание читалось бы как разное качество текста. */
const ARABIC_STACK =
  "'Azkar KFGQPC', 'KFGQPC Uthmanic Hafs v22', 'KFGQPC Uthmanic Hafs', serif";

export function DuaScreen({ theme, setTheme }: Props) {
  const [data, setData] = useState<DuaData | null>(null);
  const [mode, setMode] = useState<Mode>('mine');
  const [list, setList] = useState<string[]>(readDuaList);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    loadDuaData().then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  useEffect(() => onDuaListChange(() => setList(readDuaList())), []);

  const byId = useMemo(() => {
    const map = new Map<string, DuaEntry>();
    for (const e of data?.entries ?? []) map.set(e.id, e);
    return map;
  }, [data]);

  // Список хранит только id: если дуа исчезло из данных (правка
  // сборника), запись просто не показывается, но из хранилища не
  // стирается — вернётся вместе с текстом.
  const mine = list.map(id => byId.get(id)).filter((e): e is DuaEntry => !!e);
  const total = data?.entries.length ?? 0;

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

      <Segmented
        mode={mode}
        onChange={setMode}
        mineCount={mine.length}
        allCount={total}
      />

      {!data && <Skeleton />}

      {data && mode === 'mine' && (
        mine.length === 0 ? (
          <Empty
            icon={<Sparkle size={26} />}
            title="Список пуст"
            text={total === 0
              ? 'Сюда попадут дуа, которые вы отметите. Сначала нужно, чтобы в разделе появились сами тексты.'
              : 'Откройте «Все дуа» и отметьте те, что читаете часто — они соберутся здесь в нужном вам порядке.'}
            action={total > 0
              ? { label: 'Открыть все дуа', onClick: () => setMode('all') }
              : undefined}
          />
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {mine.map((e, i) => (
              <DuaCard
                key={e.id}
                entry={e}
                inList
                position={{ index: i, total: mine.length }}
                onToggle={() => removeFromDuaList(e.id)}
                onMove={d => moveInDuaList(e.id, d)}
              />
            ))}
          </div>
        )
      )}

      {data && mode === 'all' && (
        total === 0 ? (
          <Empty
            icon={<BookOpen size={26} />}
            title="Дуа пока не добавлены"
            text="Раздел готов, тексты появятся здесь. Дуа переносятся из проверенного источника дословно — поэтому они добавляются вручную, а не берутся откуда придётся."
          />
        ) : (
          <div style={{ display: 'grid', gap: '22px' }}>
            {data.categories
              .filter(c => (data.by_category[c.id] ?? 0) > 0)
              .map(c => (
                <section key={c.id}>
                  <div style={{ padding: '0 2px 10px' }}>
                    <h2 style={{
                      margin: 0, fontSize: '10px', fontWeight: 600,
                      letterSpacing: '0.10em', textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                    }}>
                      {c.title_ru} · {data.by_category[c.id]}
                    </h2>
                    {c.subtitle_ru && (
                      <p style={{
                        margin: '4px 0 0', fontSize: '12.5px',
                        color: 'var(--text-tertiary)',
                      }}>
                        {c.subtitle_ru}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {data.entries
                      .filter(e => e.category === c.id)
                      .map(e => (
                        <DuaCard
                          key={e.id}
                          entry={e}
                          inList={list.includes(e.id)}
                          onToggle={() => toggleInDuaList(e.id)}
                        />
                      ))}
                  </div>
                </section>
              ))}

            {/* Записи без категории не теряем: у присланных текстов
                категории может не оказаться вовсе. */}
            <UncategorisedSection data={data} list={list} />
          </div>
        )
      )}
    </div>
  );
}

function UncategorisedSection({ data, list }: { data: DuaData; list: string[] }) {
  const known = new Set(data.categories.map(c => c.id));
  const rest = data.entries.filter(e => !known.has(e.category));
  if (rest.length === 0) return null;
  return (
    <section>
      <h2 style={{
        margin: '0 0 10px 2px', fontSize: '10px', fontWeight: 600,
        letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      }}>
        Остальные · {rest.length}
      </h2>
      <div style={{ display: 'grid', gap: '12px' }}>
        {rest.map(e => (
          <DuaCard
            key={e.id}
            entry={e}
            inList={list.includes(e.id)}
            onToggle={() => toggleInDuaList(e.id)}
          />
        ))}
      </div>
    </section>
  );
}

/** Переключатель «Мой список / Все дуа». */
function Segmented({ mode, onChange, mineCount, allCount }: {
  mode: Mode;
  onChange: (m: Mode) => void;
  mineCount: number;
  allCount: number;
}) {
  const item = (id: Mode, label: string, count: number) => {
    const on = mode === id;
    return (
      <button
        key={id}
        onClick={() => onChange(id)}
        aria-pressed={on}
        style={{
          flex: 1, minHeight: '40px', borderRadius: '10px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          border: 'none',
          background: on ? 'var(--surface)' : 'transparent',
          boxShadow: on ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
          color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontFamily: 'inherit', fontSize: '14px', fontWeight: on ? 600 : 500,
          cursor: 'pointer', transition: 'background 0.18s ease, color 0.18s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {label}
        {count > 0 && (
          <span style={{
            fontSize: '11.5px', fontWeight: 500,
            color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{
      display: 'flex', gap: '4px', padding: '4px',
      borderRadius: '13px',
      background: 'color-mix(in srgb, var(--ink) 6%, transparent)',
      border: '1px solid var(--hairline)',
      marginBottom: '18px',
    }}>
      {item('mine', 'Мой список', mineCount)}
      {item('all', 'Все дуа', allCount)}
    </div>
  );
}

/**
 * Карточка дуа.
 *
 * Порядок сверху вниз — порядок чтения: сначала когда читают, потом
 * арабский, потом транскрипция, потом перевод, в самом низу источник.
 * Арабский самый крупный: он и есть текст, остальное — опора.
 */
function DuaCard({ entry, inList, position, onToggle, onMove }: {
  entry: DuaEntry;
  inList: boolean;
  position?: { index: number; total: number };
  onToggle: () => void;
  onMove?: (delta: number) => void;
}) {
  return (
    <article style={{
      padding: '16px 18px',
      borderRadius: '18px',
      border: '1px solid var(--hairline)',
      background: 'var(--surface)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin: 0, fontSize: '15px', fontWeight: 600, lineHeight: 1.3,
            color: 'var(--text-primary)',
          }}>
            {entry.title_ru}
          </h3>
          {entry.repeat && entry.repeat > 1 && (
            <p style={{
              margin: '4px 0 0', fontSize: '12px', color: 'var(--text-tertiary)',
            }}>
              Читается {entry.repeat} раза
            </p>
          )}
        </div>

        {position && onMove && (
          <span style={{ display: 'inline-flex', gap: '2px', flexShrink: 0 }}>
            <SmallButton
              label="Выше" disabled={position.index === 0}
              onClick={() => onMove(-1)}
            >↑</SmallButton>
            <SmallButton
              label="Ниже" disabled={position.index === position.total - 1}
              onClick={() => onMove(1)}
            >↓</SmallButton>
          </span>
        )}

        <button
          onClick={onToggle}
          aria-label={inList ? 'Убрать из моего списка' : 'Добавить в мой список'}
          title={inList ? 'Убрать из моего списка' : 'Добавить в мой список'}
          style={{
            width: '34px', height: '34px', flexShrink: 0, borderRadius: '9999px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${inList ? 'var(--text-primary)' : 'var(--hairline)'}`,
            background: inList
              ? 'color-mix(in srgb, var(--ink) 10%, transparent)'
              : 'transparent',
            color: inList ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '17px', lineHeight: 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {inList ? <Close size={15} /> : '+'}
        </button>
      </div>

      {/* Арабский — verbatim из источника, шрифтом мусхафа. */}
      <p dir="rtl" lang="ar" style={{
        margin: 0,
        fontFamily: ARABIC_STACK,
        fontSize: '26px', lineHeight: 2.0,
        textAlign: 'right',
        color: 'var(--text-primary)',
      }}>
        {entry.arabic}
      </p>

      {entry.translit_ru && (
        <p style={{
          margin: '14px 0 0', fontSize: '13.5px', lineHeight: 1.6,
          color: 'var(--text-secondary)',
        }}>
          {entry.translit_ru}
        </p>
      )}

      <p style={{
        margin: '12px 0 0', fontSize: '14.5px', lineHeight: 1.65,
        color: 'var(--text-primary)',
      }}>
        {entry.russian}
      </p>

      {entry.refs && entry.refs.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px',
        }}>
          {entry.refs.map(r => (
            <span key={r} style={{
              fontSize: '11.5px', padding: '3px 9px', borderRadius: '9999px',
              border: '1px solid var(--hairline)',
              color: 'var(--text-tertiary)',
            }}>
              {r}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function SmallButton({ children, onClick, disabled, label }: {
  children: React.ReactNode; onClick: () => void; disabled: boolean; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: '30px', height: '30px', borderRadius: '8px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--hairline)', background: 'transparent',
        color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        fontFamily: 'inherit', fontSize: '13px', lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Пустое состояние.  Говорит, что произошло и что делать дальше —
 * пустой экран без объяснения читается как поломка.
 */
function Empty({ icon, title, text, action }: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: '56px 20px',
    }}>
      <span style={{
        width: '58px', height: '58px', borderRadius: '9999px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--hairline)',
        background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
        color: 'var(--text-secondary)', marginBottom: '16px',
      }}>
        {icon}
      </span>
      <p className="display-serif" style={{
        margin: 0, fontSize: '21px', fontWeight: 400,
        color: 'var(--text-primary)', letterSpacing: '-0.01em',
      }}>
        {title}
      </p>
      <p style={{
        margin: '9px 0 0', maxWidth: '34ch',
        fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-tertiary)',
      }}>
        {text}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: '18px', minHeight: '42px', padding: '0 18px',
            borderRadius: '12px', border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
            color: 'var(--text-primary)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '14px', fontWeight: 500,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'grid', gap: '12px' }} aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: '186px', borderRadius: '18px' }} />
      ))}
    </div>
  );
}
