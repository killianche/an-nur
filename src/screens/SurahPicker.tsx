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
 *
 * ── Типографика ───────────────────────────────────────────────────────
 *
 * Все кегли, веса, радиусы и отступы — ступени шкалы из src/index.css.
 * Строки списка и заголовки секций выровнены по одному отступу
 * (--space-hair), чтобы номер суры стоял ровно под словом «Суры».
 */

import { useState, useMemo, useRef, useDeferredValue } from 'react';
import { SURAHS, SURAH_BY_NUMBER, type SurahMeta } from '../content/surahs';
import { juzOfSurah } from '../lib/ayahNumbering';
import { readRecents } from '../lib/recents';
import { search, snippet, type AyahHit } from '../lib/search';
import { useQuranSources } from '../content/quran-sources-lazy';
import { Appearance, Search, Close, Bookmark as BookmarkIcon, Person, ICON_SIZE, Play, Pause } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { useAudioActions, useAudioState } from '../hooks/AudioProvider';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';
import { HitArea } from '../components/HitArea';

/**
 * Единственная форма капс-подзаголовка на экране: «Продолжить чтение»
 * и заголовки секций выдачи.
 *
 * В шкале нет трекинга для прописных — `--tracking-loose` (0.01em)
 * рассчитан на мелкий строчный текст.  На капсе 11px он слипается,
 * поэтому разряд задан явно, одним значением на весь файл.
 */
const CAP_LABEL: React.CSSProperties = {
  fontSize: 'var(--font-caption2)',
  lineHeight: 'var(--leading-caption2)',
  fontWeight: 'var(--weight-semibold)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

type Props = {
  onSelectSurah: (number: number, ayah?: number) => void;
  onBookmarks?: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Аккаунт переехал из нижнего меню сюда, в шапку. */
  onAccount?: () => void;
};

/** Склонение слова «аят». */
function ayahWord(n: number): string {
  const two = n % 100, one = n % 10;
  if (two >= 11 && two <= 14) return 'аятов';
  if (one === 1) return 'аят';
  if (one >= 2 && one <= 4) return 'аята';
  return 'аятов';
}

export function SurahPicker({ onSelectSurah, onBookmarks, onAccount, theme, setTheme }: Props) {
  const [query, setQuery] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Поиск по 6236 переводам — работа заметная.  useDeferredValue
  // отдаёт вводу приоритет: буквы появляются сразу, список
  // догоняет следующим кадром.
  const deferredQuery = useDeferredValue(query);
  const searching = query.trim().length > 0;
  // Словарь переводов лежит отдельным чанком, чтобы не задерживать старт.
  // Начинаем тянуть его при первом же вводе; обычно он уже прогрет в простое
  // (см. warmQuranSources в App.tsx), и ждать не приходится.
  const sourcesReady = useQuranSources(searching) != null;
  const results = useMemo(
    () => search(deferredQuery),
    // sourcesReady в зависимостях намеренно: как только словарь доехал,
    // выдачу нужно пересчитать — сам запрос при этом не менялся.
    [deferredQuery, sourcesReady],
  );

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
      padding: `0 var(--space-margin) calc(${TAB_BAR_HEIGHT}px + var(--space-section) + var(--mini-player-space, 0px) + env(safe-area-inset-bottom))`,
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
        gap: 'var(--space-snug)',
        paddingTop: 'calc(env(safe-area-inset-top) + var(--space-margin))',
        paddingBottom: 'var(--space-margin)',
      }}>
        <h1
          className="display-serif"
          style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: 'clamp(30px, 8vw, 40px)',
            fontWeight: 'var(--weight-regular)',
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.05,
          }}
        >
          Коран
        </h1>

        {onBookmarks && (
          <IconAction label="Закладки" onClick={onBookmarks}>
            <BookmarkIcon size={ICON_SIZE.md} />
          </IconAction>
        )}
        <IconAction
          label="Оформление"
          onClick={() => setThemeOpen(v => !v)}
          active={themeOpen}
          btnRef={themeBtnRef}
        >
          <Appearance size={ICON_SIZE.md} />
        </IconAction>
        {/* Аккаунт переехал сюда из нижнего меню: там он занимал пятую часть
            самой дорогой полосы экрана, а открывают его редко. */}
        {onAccount && (
          <IconAction label="Аккаунт" onClick={onAccount}>
            <Person size={ICON_SIZE.md} />
          </IconAction>
        )}
      </header>

      {/* ── Поиск ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-snug)',
        height: 'calc(var(--hit-min) + var(--space-tight))',
        padding: '0 var(--space-cozy)',
        borderRadius: 'var(--radius-control)',
        background: 'rgb(var(--ink-rgb) / 0.05)',
        border: '1px solid var(--hairline)',
        marginBottom: 'var(--space-margin)',
      }}>
        <span aria-hidden style={{ color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 }}>
          <Search size={ICON_SIZE.md} />
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
            fontFamily: 'inherit',
            fontSize: 'var(--font-subhead)',
            lineHeight: 'var(--leading-subhead)',
            letterSpacing: 'var(--tracking-loose)',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label="Очистить"
            className="icon-btn"
            style={{
              position: 'relative',
              width: '30px', height: '30px', flexShrink: 0,
              color: 'var(--text-tertiary)',
            }}
          >
            <Close size={ICON_SIZE.sm} />
            <HitArea />
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
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--hairline)',
        background: 'rgb(var(--ink-rgb) / 0.04)',
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
        padding: 'var(--space-margin) var(--space-margin) var(--space-cozy)',
        marginBottom: 'var(--space-section)',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--hairline)',
        background: 'var(--surface)',
        cursor: 'pointer',
        fontFamily: 'inherit', color: 'inherit',
        transform: pressed ? 'scale(0.99)' : 'scale(1)',
        transition: 'transform var(--dur-base) var(--ease-standard)',
      }}
    >
      <div style={{ ...CAP_LABEL, color: 'var(--text-tertiary)' }}>
        Продолжить чтение
      </div>
      <div
        className="display-serif"
        style={{
          marginTop: 'var(--space-snug)',
          fontSize: 'var(--font-title2)',
          lineHeight: 'var(--leading-title2)',
          fontWeight: 'var(--weight-regular)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </div>
      <div style={{
        marginTop: 'var(--space-tight)',
        fontSize: 'var(--font-caption1)',
        lineHeight: 'var(--leading-caption1)',
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        Аят {ayah} из {total}
      </div>
      <div style={{
        marginTop: 'var(--space-cozy)', height: '3px',
        borderRadius: 'var(--radius-pill)',
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

function SurahList({ surahs, onSelect, grouped = true }: {
  surahs: SurahMeta[];
  onSelect: (n: number) => void;
  /** Группировать по джузам. В результатах поиска выключено: заголовки
   *  джузов над разрозненными находками только мешают. */
  grouped?: boolean;
}) {
  // Группируем по джузу, в котором сура НАЧИНАЕТСЯ. Границы джузов не совпадают
  // с границами сур, поэтому это приближение — и оно названо честно в
  // `juzOfSurah`. Для заголовков в списке его достаточно.
  const секции = useMemo(() => {
    if (!grouped) return [{ juz: 0, items: surahs }];
    const out: { juz: number; items: SurahMeta[] }[] = [];
    for (const m of surahs) {
      const juz = juzOfSurah(m.number);
      const последняя = out[out.length - 1];
      if (последняя && последняя.juz === juz) последняя.items.push(m);
      else out.push({ juz, items: [m] });
    }
    return out;
  }, [surahs, grouped]);

  // 🔴 Подписка на звук — ОДНА на весь список, а не в каждой карточке.
  //
  // Раньше `useAudioState()` вызывался внутри карточки, и на каждой границе
  // аята перерисовывались все 114 карточек с арабской типографикой. Теперь
  // список знает, что звучит, и передаёт карточке готовый ответ; React
  // перерисует только ту, у которой он изменился.
  const { currentSurah, audioState } = useAudioState();
  const звучит = audioState === 'playing' ? currentSurah : null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-margin)' }}>
      {секции.map(({ juz, items }) => (
        <section key={juz || 'all'} style={{ display: 'grid', gap: 'var(--space-snug)' }}>
          {juz > 0 && <JuzHeading juz={juz} />}
          <div style={{
            display: 'grid',
            // Два столбца — просьба владельца: список из 114 строк в один
            // столбец на телефоне читается как бесконечная лента. На узком
            // экране (320 px) карточка ужимается, но не ломается.
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--space-snug)',
          }}>
            {items.map(m => (
              <SurahCard
                key={m.number}
                meta={m}
                onClick={() => onSelect(m.number)}
                // Одинокая сура в джузе занимает обе колонки.
                //
                // В начале Корана суры длинные, и в джуз попадает ровно одна:
                // при жёсткой сетке получался столбец полупустых рядов, то
                // есть два столбца ради ничего. Широкая карточка читается как
                // намеренная, а длинной суре крупный вид и к лицу.
                wide={items.length === 1}
                sounding={звучит === m.number}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SectionHeading({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-cozy)',
      padding: 'var(--space-section) var(--space-hair) var(--space-snug)',
    }}>
      <span style={{
        ...CAP_LABEL,
        color: 'var(--text-tertiary)',
        flexShrink: 0,
      }}>
        {text}
      </span>
      <span aria-hidden style={{ flex: 1, height: '1px', background: 'var(--hairline)' }} />
    </div>
  );
}

/** Заголовок джуза: тонкая линия и подпись капителью — как разделы в мусхафе. */
function JuzHeading({ juz }: { juz: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-snug)',
      paddingTop: 'var(--space-tight)',
    }}>
      <span style={{
        fontSize: 'var(--font-caption2)',
        lineHeight: 'var(--leading-caption2)',
        fontWeight: 'var(--weight-semibold)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
      }}>
        Джуз {juz}
      </span>
      <span aria-hidden style={{ flex: 1, height: '1px', background: 'var(--hairline)' }} />
    </div>
  );
}

/**
 * Карточка суры.
 *
 * Пришла на смену строке во всю ширину: в два столбца строка не помещается,
 * и содержимое пересобрано под вертикальный порядок — знак и воспроизведение
 * сверху, арабское название крупно, ниже название и перевод.
 *
 * Оформление — то же «жидкое стекло», что у нижней панели: полупрозрачная
 * поверхность, волосяная рамка и светлая кромка сверху. Цвета взяты токенами,
 * поэтому карточка одинаково работает на всех пяти темах, включая тёмные и
 * фотографическую «бумагу».
 */
function SurahCard({ meta, onClick, wide = false, sounding = false }: {
  meta: SurahMeta;
  onClick: () => void;
  wide?: boolean;
  /** Звучит ли именно эта сура. Приходит сверху: подписка на звук одна на
   *  весь список, иначе перерисовывались бы все 114 карточек. */
  sounding?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const audio = useAudioActions();
  const soundingHere = sounding;

  return (
    <div
      style={{
        position: 'relative',
        gridColumn: wide ? '1 / -1' : undefined,
        borderRadius: '18px',
        background: pressed
          ? 'rgb(var(--ink-rgb) / 0.07)'
          : 'rgb(var(--ink-rgb) / 0.035)',
        border: '1px solid var(--hairline)',
        boxShadow: 'inset 0 1px 0 rgb(var(--surface-rgb) / 0.5)',
        transform: pressed ? 'scale(0.985)' : 'none',
        transition:
          'background var(--dur-fast) var(--ease-standard),'
          + ' transform var(--dur-fast) var(--ease-standard)',
      }}
    >
      <button
        onClick={onClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        style={{
          display: 'grid', gap: 'var(--space-hair)',
          width: '100%', minWidth: 0,
          padding: 'var(--space-snug)',
          paddingBottom: 'var(--space-tight)',
          border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left',
          fontFamily: 'inherit', color: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Номер в ромбе — форма из мусхафа, где номер аята стоит в розетке. */}
        <span aria-hidden style={{
          width: '30px', height: '30px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transform: 'rotate(45deg)',
          border: '1px solid var(--hairline-strong)',
          borderRadius: 'var(--radius-chip)',
        }}>
          <span style={{
            transform: 'rotate(-45deg)',
            fontSize: 'var(--font-caption2)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {meta.number}
          </span>
        </span>

        <span
          dir="rtl"
          lang="ar"
          style={{
            display: 'block',
            fontFamily: "'KFGQPC Uthmanic Hafs v22', serif",
            fontSize: 'var(--font-title3)',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {meta.arabic}
        </span>

        <span style={{
          display: 'block',
          fontSize: 'var(--font-subhead)',
          lineHeight: 'var(--leading-subhead)',
          color: 'var(--text-primary)',
          letterSpacing: 'var(--tracking-tight)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta.transliteration}
        </span>

        <span style={{
          display: 'block',
          fontSize: 'var(--font-caption2)',
          lineHeight: 'var(--leading-caption2)',
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta.russian} · {meta.ayahs} {ayahWord(meta.ayahs)}
        </span>
      </button>

      {/* Слушать суру целиком — отдельной кнопкой в углу: нажатие на карточку
          открывает чтение, это разные намерения. Вынесена абсолютно, чтобы не
          сжимать текст в узком столбце. */}
      <button
        onClick={() => {
          if (soundingHere) audio.pause();
          else audio.playSurah(meta.number, meta.ayahs);
        }}
        aria-label={soundingHere
          ? `Пауза: ${meta.transliteration}`
          : `Слушать суру ${meta.transliteration} целиком`}
        className="icon-btn"
        style={{
          position: 'absolute',
          top: 'var(--space-hair)', right: 'var(--space-hair)',
          width: '38px', height: '38px',
          color: soundingHere ? 'var(--text-primary)' : 'var(--text-tertiary)',
        }}
      >
        {soundingHere ? <Pause size={ICON_SIZE.sm} /> : <Play size={ICON_SIZE.sm} />}
      </button>
    </div>
  );
}

// ─── Результаты поиска ───────────────────────────────────────────────────

function SearchResults({ results, onOpen }: {
  results: ReturnType<typeof search>;
  onOpen: (surah: number, ayah?: number) => void;
}) {
  const { surahs, ayahs, truncated, tooShortForText, notReady } = results;
  const nothing = surahs.length === 0 && ayahs.length === 0;

  if (nothing) {
    return (
      <p style={{
        textAlign: 'center',
        padding: 'calc(var(--space-section) * 2) var(--space-margin)',
        fontSize: 'var(--font-subhead)',
        lineHeight: 'var(--leading-subhead)',
        color: 'var(--text-tertiary)',
      }}>
        {notReady
          ? 'Готовим перевод…'
          : tooShortForText
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
              padding: 'var(--space-cozy) var(--space-hair) 0',
              fontSize: 'var(--font-caption1)',
              lineHeight: 'var(--leading-caption1)',
              color: 'var(--text-tertiary)',
            }}>
              Показаны первые {ayahs.length}. Уточните запрос, чтобы
              совпадений стало меньше.
            </p>
          )}
        </>
      )}

      {tooShortForText && surahs.length > 0 && (
        <p style={{
          padding: 'var(--space-margin) var(--space-hair) 0',
          fontSize: 'var(--font-caption1)',
          lineHeight: 'var(--leading-caption1)',
          color: 'var(--text-tertiary)',
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
        padding: 'var(--space-cozy) var(--space-hair)',
        border: 'none',
        borderBottom: '1px solid var(--hairline-soft, var(--hairline))',
        background: pressed
          ? 'rgb(var(--ink-rgb) / 0.05)'
          : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
        transition: 'background var(--dur-fast) var(--ease-standard)',
      }}
    >
      <span style={{
        display: 'inline-block', marginBottom: 'var(--space-snug)',
        padding: 'var(--space-tight) var(--space-snug)',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--hairline)',
        fontSize: 'var(--font-caption2)',
        fontWeight: 'var(--weight-regular)',
        lineHeight: 1,
        color: 'var(--text-tertiary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {hit.surahTitle} · {hit.surah}:{hit.ayah}
      </span>
      <span style={{
        display: 'block',
        fontSize: 'var(--font-subhead)',
        lineHeight: 'var(--leading-subhead)',
        color: 'var(--text-secondary)',
        letterSpacing: 'var(--tracking-tight)',
      }}>
        {s.before}
        {/* Подсветка совпадения — фоном, а не цветом текста: цвет уже
            занят под караоке-подсветку в чтении, и два разных смысла
            одного приёма путали бы.

            Скругление 3px намеренно вне шкалы радиусов: она начинается
            с --radius-chip (8px), а это не плашка, а подложка под два-три
            слова внутри строки — на восьми пикселях она превращается в
            капсулу и рвёт строку на куски. */}
        <mark style={{
          background: 'rgb(var(--ink-rgb) / 0.14)',
          color: 'var(--text-primary)',
          borderRadius: '3px',
          padding: '0 var(--space-hair)',
          fontWeight: 'var(--weight-semibold)',
        }}>
          {s.match}
        </mark>
        {s.after}
      </span>
    </button>
  );
}
