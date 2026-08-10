/**
 * SurahPicker — главный экран: продолжить чтение, поиск, 114 сур.
 *
 * ── Что изменилось против прежней версии ──────────────────────────────
 *
 * Была сетка карточек 2×57 с крупным арабским названием по центру.
 * Красиво на скриншоте, но плохо работает как список: карточка
 * одинакова для «Аль-Фатихи» и для «Аль-Бакары», глазу не за что
 * зацепиться, а номер суры — то, чем люди реально пользуются, — стоял
 * мелко в подписи.  Заменено на строки: номер в рамке слева, название
 * и подпись, арабское начертание справа.  Строка сканируется за один
 * взгляд, помещается больше, и появилось место для перевода названия.
 *
 * ── Поиск ─────────────────────────────────────────────────────────────
 *
 * Ищет и суры, и текст перевода (см. lib/search.ts).  Результаты по
 * аятам показываются фрагментом с подсвеченным совпадением; тап
 * открывает суру сразу на нужном аяте.
 *
 * Поиск по переводу считается в `useDeferredValue`: набор текста
 * остаётся отзывчивым, а тяжёлый проход по 6236 аятам React выполняет
 * в фоне и не блокирует ввод.
 *
 * ── Почему список сур без деления на джузы ────────────────────────────
 *
 * Пробовали подписи «Джуз N» между строками — выходило «1 → 3 → 4 → 6»,
 * потому что джузы 2 и 5 начинаются посреди Аль-Бакары и Ан-Нисы.
 * Потом был переключатель «Суры / Джузы» с честными границами.  Снят
 * по решению владельца: экран открывают, чтобы найти суру, и лишний
 * орган управления над списком только отвлекает.  Разрез по джузам
 * лежит в истории git — вернуть можно одним коммитом.
 */

import { useState, useMemo, useRef, useDeferredValue } from 'react';
import { SURAHS, SURAH_BY_NUMBER, type SurahMeta } from '../content/surahs';
import { readRecents } from '../lib/recents';
import { search, snippet, type AyahHit } from '../lib/search';
import { Appearance, Search, Close, Bookmark as BookmarkIcon } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';

type Props = {
  onSelectSurah: (number: number, ayah?: number) => void;
  onBookmarks?: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
};

/** Склонение слова «аят». */
function ayahWord(n: number): string {
  const two = n % 100, one = n % 10;
  if (two >= 11 && two <= 14) return 'аятов';
  if (one === 1) return 'аят';
  if (one >= 2 && one <= 4) return 'аята';
  return 'аятов';
}

export function SurahPicker({ onSelectSurah, onBookmarks, theme, setTheme }: Props) {
  const [query, setQuery] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Поиск по 6236 переводам — работа заметная.  useDeferredValue
  // отдаёт вводу приоритет: буквы появляются сразу, список
  // догоняет следующим кадром.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => search(deferredQuery), [deferredQuery]);
  const searching = query.trim().length > 0;

  const recents = useMemo(
    () => readRecents().map(r => ({ ...r, meta: SURAH_BY_NUMBER[r.surah] })).filter(r => r.meta),
    [],
  );
  const lastRead = recents[0];

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 'min(100%, 720px)',
      margin: '0 auto',
      padding: `0 16px calc(${TAB_BAR_HEIGHT}px + 36px + env(safe-area-inset-bottom))`,
      position: 'relative',
      zIndex: 1,
    }}>
      {themeOpen && (
        <ThemeSettings
          theme={theme}
          setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {/* ── Шапка ─────────────────────────────────────────────────────
          Заголовок и действия в одной строке.  Прежний огромный
          вордмарк «Quran» на пол-экрана выглядел как обложка, а не как
          начало списка, и отжимал сам список ниже сгиба. */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingTop: 'calc(env(safe-area-inset-top) + 18px)',
        paddingBottom: '16px',
      }}>
        <h1
          className="display-serif"
          style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: 'clamp(30px, 8vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.05,
          }}
        >
          Коран
        </h1>

        {onBookmarks && (
          <IconAction label="Закладки" onClick={onBookmarks}>
            <BookmarkIcon size={19} />
          </IconAction>
        )}
        <IconAction
          label="Оформление"
          onClick={() => setThemeOpen(v => !v)}
          active={themeOpen}
          btnRef={themeBtnRef}
        >
          <Appearance size={19} />
        </IconAction>
      </header>

      {/* ── Поиск ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        height: '48px', padding: '0 14px',
        borderRadius: '14px',
        background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
        border: '1px solid var(--hairline)',
        marginBottom: '20px',
      }}>
        <span aria-hidden style={{ color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 }}>
          <Search size={18} />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Сура, номер или слово из перевода"
          aria-label="Поиск"
          enterKeyHint="search"
          style={{
            flex: 1, minWidth: 0,
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text-primary)',
            fontFamily: 'inherit', fontSize: '15px',
            letterSpacing: '0.005em',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label="Очистить"
            className="icon-btn"
            style={{ width: '30px', height: '30px', flexShrink: 0, color: 'var(--text-tertiary)' }}
          >
            <Close size={16} />
          </button>
        )}
      </div>

      {searching
        ? <SearchResults results={results} onOpen={onSelectSurah} />
        : (
          <>
            {lastRead && (
              <ContinueCard
                title={lastRead.meta!.transliteration}
                ayah={lastRead.ayah}
                total={lastRead.meta!.ayahs}
                onClick={() => onSelectSurah(lastRead.surah, lastRead.ayah)}
              />
            )}

            <SurahList surahs={SURAHS} onSelect={onSelectSurah} />
          </>
        )}
    </div>
  );
}

// ─── Действие в шапке ────────────────────────────────────────────────────

function IconAction({ label, onClick, children, active, btnRef }: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  btnRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={btnRef}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="icon-btn"
      data-active={active}
      style={{
        width: '42px', height: '42px', flexShrink: 0,
        borderRadius: '12px',
        border: '1px solid var(--hairline)',
        background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

// ─── Продолжить чтение ───────────────────────────────────────────────────

function ContinueCard({ title, ayah, total, onClick }: {
  title: string; ayah: number; total: number; onClick: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const pct = Math.min(100, Math.round((ayah / total) * 100));
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '16px 18px 14px',
        marginBottom: '26px',
        borderRadius: '16px',
        border: '1px solid var(--hairline)',
        background: 'var(--surface)',
        cursor: 'pointer',
        fontFamily: 'inherit', color: 'inherit',
        transform: pressed ? 'scale(0.99)' : 'scale(1)',
        transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div style={{
        fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        Продолжить чтение
      </div>
      <div
        className="display-serif"
        style={{
          marginTop: '8px', fontSize: '22px', fontWeight: 500,
          letterSpacing: '-0.015em', color: 'var(--text-primary)', lineHeight: 1.15,
        }}
      >
        {title}
      </div>
      <div style={{
        marginTop: '4px', fontSize: '12.5px', color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        Аят {ayah} из {total}
      </div>
      <div style={{
        marginTop: '12px', height: '3px', borderRadius: '2px',
        background: 'var(--hairline)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'var(--text-primary)', opacity: 0.55,
        }} />
      </div>
    </button>
  );
}

// ─── Список сур ──────────────────────────────────────────────────────────

function SurahList({ surahs, onSelect }: {
  surahs: SurahMeta[];
  onSelect: (n: number) => void;
}) {
  return (
    <div>
      {surahs.map(s => (
        <SurahRow key={s.number} meta={s} onClick={() => onSelect(s.number)} />
      ))}
    </div>
  );
}

function SectionHeading({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '22px 2px 10px',
    }}>
      <span style={{
        fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
        flexShrink: 0,
      }}>
        {text}
      </span>
      <span aria-hidden style={{ flex: 1, height: '1px', background: 'var(--hairline)' }} />
    </div>
  );
}

function SurahRow({ meta, onClick }: { meta: SurahMeta; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        width: '100%', minHeight: '64px',
        padding: '10px 6px',
        border: 'none',
        borderBottom: '1px solid var(--hairline-soft, var(--hairline))',
        background: pressed
          ? 'color-mix(in srgb, var(--ink) 5%, transparent)'
          : 'transparent',
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit', color: 'inherit',
        transition: 'background 120ms ease',
      }}
    >
      {/* Номер в ромбе — форма из мусхафа, где номер аята стоит в
          розетке.  Читается как «порядковый знак», а не как счётчик. */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: '34px', height: '34px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transform: 'rotate(45deg)',
          border: '1px solid var(--hairline-strong)',
          borderRadius: '9px',
        }}
      >
        <span style={{
          transform: 'rotate(-45deg)',
          fontSize: '12px', fontWeight: 600,
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {meta.number}
        </span>
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: '15.5px', fontWeight: 500,
          color: 'var(--text-primary)', letterSpacing: '-0.005em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta.transliteration}
        </span>
        <span style={{
          display: 'block', marginTop: '2px',
          fontSize: '12px', color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta.russian} · {meta.ayahs} {ayahWord(meta.ayahs)}
        </span>
      </span>

      <span
        dir="rtl"
        lang="ar"
        style={{
          flexShrink: 0,
          fontFamily: "'KFGQPC Uthmanic Hafs v22', serif",
          fontSize: '19px',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        {meta.arabic}
      </span>
    </button>
  );
}

// ─── Результаты поиска ───────────────────────────────────────────────────

function SearchResults({ results, onOpen }: {
  results: ReturnType<typeof search>;
  onOpen: (surah: number, ayah?: number) => void;
}) {
  const { surahs, ayahs, truncated, tooShortForText } = results;
  const nothing = surahs.length === 0 && ayahs.length === 0;

  if (nothing) {
    return (
      <p style={{
        textAlign: 'center', padding: '48px 16px',
        fontSize: '14px', color: 'var(--text-tertiary)', lineHeight: 1.6,
      }}>
        {tooShortForText
          ? 'Введите хотя бы три буквы, чтобы искать по переводу'
          : 'Ничего не найдено'}
      </p>
    );
  }

  return (
    <div>
      {surahs.length > 0 && (
        <>
          <SectionHeading text={`Суры · ${surahs.length}`} />
          <SurahList surahs={surahs} onSelect={onOpen} />
        </>
      )}

      {ayahs.length > 0 && (
        <>
          <SectionHeading
            text={`В переводе · ${ayahs.length}${truncated ? '+' : ''}`}
          />
          {ayahs.map(h => (
            <AyahHitRow
              key={`${h.surah}:${h.ayah}`}
              hit={h}
              onClick={() => onOpen(h.surah, h.ayah)}
            />
          ))}
          {truncated && (
            <p style={{
              padding: '14px 6px 0', fontSize: '12px',
              color: 'var(--text-tertiary)', lineHeight: 1.5,
            }}>
              Показаны первые {ayahs.length}. Уточните запрос, чтобы
              совпадений стало меньше.
            </p>
          )}
        </>
      )}

      {tooShortForText && surahs.length > 0 && (
        <p style={{
          padding: '18px 6px 0', fontSize: '12px',
          color: 'var(--text-tertiary)', lineHeight: 1.5,
        }}>
          Для поиска по переводу введите хотя бы три буквы.
        </p>
      )}
    </div>
  );
}

function AyahHitRow({ hit, onClick }: { hit: AyahHit; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  const s = snippet(hit);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '12px 6px',
        border: 'none',
        borderBottom: '1px solid var(--hairline-soft, var(--hairline))',
        background: pressed
          ? 'color-mix(in srgb, var(--ink) 5%, transparent)'
          : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
        transition: 'background 120ms ease',
      }}
    >
      <span style={{
        display: 'inline-block', marginBottom: '6px',
        padding: '3px 9px', borderRadius: '9999px',
        border: '1px solid var(--hairline)',
        fontSize: '11px', fontWeight: 500, lineHeight: 1,
        color: 'var(--text-tertiary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {hit.surahTitle} · {hit.surah}:{hit.ayah}
      </span>
      <span style={{
        display: 'block',
        fontSize: '14px', lineHeight: 1.5,
        color: 'var(--text-secondary)',
        letterSpacing: '-0.005em',
      }}>
        {s.before}
        {/* Подсветка совпадения — фоном, а не цветом текста: цвет уже
            занят под караоке-подсветку в чтении, и два разных смысла
            одного приёма путали бы. */}
        <mark style={{
          background: 'color-mix(in srgb, var(--ink) 14%, transparent)',
          color: 'var(--text-primary)',
          borderRadius: '3px',
          padding: '0 2px',
          fontWeight: 600,
        }}>
          {s.match}
        </mark>
        {s.after}
      </span>
    </button>
  );
}
