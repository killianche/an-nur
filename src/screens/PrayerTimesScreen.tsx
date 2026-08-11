/**
 * PrayerTimesScreen — время намаза по нескольким городам.
 *
 * Считается офлайн (см. lib/prayerTimes.ts), список городов и их
 * настройки живут в lib/prayerCities.ts.
 *
 * ── Почему несколько городов ──────────────────────────────────────────
 *
 * Как погода в iOS.  Человек живёт в одном городе, родня в другом,
 * работа в третьем, и вопрос «а во сколько там магриб» возникает
 * постоянно.  Перевыбирать место каждый раз — значит терять свои
 * поправки и метод, потому что они привязаны к расписанию, а не к
 * человеку.
 *
 * ── Что на главной, а что за дверью ───────────────────────────────────
 *
 * На главной только то, зачем экран открывают: ближайший намаз и день
 * списком.  Метод расчёта убран отсюда по решению владельца — он
 * настраивается раз в жизни, а место на экране занимал каждый день.
 * Теперь он внутри города, в панели «Города»: настройка стоит рядом с
 * тем, к чему относится, и заодно перестаёт выглядеть общей для всех.
 *
 * ── Что показывает день ───────────────────────────────────────────────
 *
 * Прошедшие намазы приглушены, наступивший подсвечен, будущие обычные.
 * Раньше выделялся только следующий, и по списку нельзя было понять, где
 * ты в сутках — приходилось сверять с часами. Полоса под карточкой
 * показывает, сколько прошло от предыдущего намаза до следующего:
 * «через 2 ч 42 мин» отвечает «когда», полоса — «много ли осталось».
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Appearance, ChevronRight, Clock, Close, Plus, Trash } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';
import {
  CITIES, locate, LOCATE_ERROR_TEXT, type LocateError,
} from '../lib/location';
import {
  addCity, moveCity, onCitiesChange, readActiveId, readCities,
  removeCity, setActiveId, updateCitySettings, MAX_CITIES,
  type PrayerCity,
} from '../lib/prayerCities';
import {
  METHODS, MADHAB_LABELS, PRAYER_LABELS, PRAYER_ORDER, IS_PRAYER,
  formatLeft, formatTime, methodById, nextPrayer, timesFor,
  type DayTimes, type Madhab, type MethodId, type PrayerSettings,
} from '../lib/prayerTimes';

type Props = { theme: Theme; setTheme: (t: Theme) => void };

export function PrayerTimesScreen({ theme, setTheme }: Props) {
  const [cities, setCities] = useState<PrayerCity[]>(readCities);
  const [activeId, setActive] = useState<string>(() => readActiveId());
  const [themeOpen, setThemeOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onCitiesChange(() => {
    const list = readCities();
    setCities(list);
    setActive(readActiveId(list));
  }), []);

  // Минутный тик: обратный отсчёт идёт сам, без перезахода на экран.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const index = Math.max(0, cities.findIndex(c => c.id === activeId));
  const city = cities[index] ?? cities[0];

  const times = useMemo(() => timesFor(city, now, city.settings), [city, now]);
  const next  = useMemo(() => nextPrayer(city, now, city.settings), [city, now]);
  const prevAt = useMemo(() => previousPrayerAt(city, times, now), [city, times, now]);

  const span = next.at.getTime() - prevAt;
  const progress = span > 0
    ? Math.min(1, Math.max(0, (now.getTime() - prevAt) / span))
    : 0;

  const go = (delta: number) => {
    if (cities.length < 2) return;
    // По кругу: тупик в конце списка читается как «сломалось».
    setActiveId(cities[(index + delta + cities.length) % cities.length].id);
  };

  // ── Смах между городами ─────────────────────────────────────────────
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Экран прокручивается — вертикальный жест не должен листать города.
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    go(dx < 0 ? 1 : -1);
  };

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
        paddingBottom: '6px',
      }}>
        <h1 className="display-serif" style={{
          margin: 0, flex: 1, minWidth: 0,
          fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 400,
          letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.05,
        }}>
          Намаз
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

      {/* ── Город ────────────────────────────────────────────────────────
          Кнопка, а не подпись: город — главный переключатель этого
          экрана, и он должен выглядеть нажимаемым. */}
      <button
        onClick={() => setCitiesOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          width: '100%', padding: '2px 2px 14px',
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {city.name}
        </span>
        <span style={{
          display: 'inline-flex', color: 'var(--text-tertiary)', flexShrink: 0,
          transform: 'translateY(1px)',
        }}>
          <ChevronRight size={15} />
        </span>
        <span style={{ flex: 1 }} />
        {cities.length > 1 && <Dots count={cities.length} index={index} />}
      </button>

      {/* Смах ловим на блоке времён: ниже настроек нет, выше — заголовок. */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <NextPrayerCard next={next} now={now} progress={progress} />

        <section style={{ marginTop: '16px' }}>
          {PRAYER_ORDER.map(key => {
            const at = times[key].getTime();
            const isNext = IS_PRAYER[key] && key === next.key && !next.tomorrow;
            // «Идёт сейчас» — последний наступивший намаз. Именно он
            // отвечает на вопрос «какой намаз сейчас», а не следующий.
            const current = IS_PRAYER[key] && at <= now.getTime() && at === prevAt;
            return (
              <TimeRow
                key={key}
                label={PRAYER_LABELS[key]}
                time={formatTime(times[key])}
                isNext={isNext}
                isCurrent={current}
                past={at <= now.getTime() && !current}
                muted={!IS_PRAYER[key]}
                adjust={city.settings.adjustments[key]}
              />
            );
          })}
        </section>
      </div>

      <p style={{
        margin: '20px 4px 0', fontSize: '11.5px', lineHeight: 1.55,
        color: 'var(--text-tertiary)',
      }}>
        <span style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: '5px' }}>
          <Clock size={14} />
        </span>
        Время считается на устройстве по координатам, без интернета.
        Сверьтесь с расписанием своей мечети: если оно расходится хотя бы
        на минуту — выставьте разницу в настройках города.
      </p>

      {citiesOpen && (
        <CitiesSheet
          cities={cities}
          activeId={city.id}
          now={now}
          onPick={id => { setActiveId(id); setCitiesOpen(false); }}
          onClose={() => setCitiesOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Последний наступивший намаз, в миллисекундах.
 *
 * Нужен и полосе прогресса, и подсветке «идёт сейчас».  До фаджра
 * предыдущим считается вчерашняя иша — иначе ночью полоса считалась бы
 * от начала суток и всегда стояла почти полной.
 */
function previousPrayerAt(city: PrayerCity, times: DayTimes, now: Date): number {
  const t = now.getTime();
  let best = -Infinity;
  for (const key of PRAYER_ORDER) {
    if (!IS_PRAYER[key]) continue;
    const at = times[key].getTime();
    if (at <= t && at > best) best = at;
  }
  if (best !== -Infinity) return best;
  const yesterday = new Date(t - 24 * 60 * 60 * 1000);
  return timesFor(city, yesterday, city.settings).isha.getTime();
}

/**
 * Ближайший намаз крупно.
 *
 * Полоса внизу — доля пройденного от предыдущего намаза до следующего.
 * Она отвечает на то, чего не отвечает текст: «много ли осталось».
 * Тонкая и без цвета: это фон, а не индикатор загрузки.
 */
function NextPrayerCard({ next, now, progress }: {
  next: { key: keyof typeof PRAYER_LABELS; at: Date; tomorrow: boolean };
  now: Date;
  progress: number;
}) {
  return (
    <section style={{
      position: 'relative',
      overflow: 'hidden',
      padding: '20px 22px 22px',
      borderRadius: '20px',
      border: '1px solid var(--hairline)',
      background: `
        radial-gradient(120% 140% at 100% 0%,
          color-mix(in srgb, var(--ink) 5%, transparent) 0%,
          transparent 62%),
        var(--surface)
      `,
    }}>
      <div style={{
        fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        {next.tomorrow ? 'Следующий — завтра' : 'Следующий намаз'}
      </div>

      <div style={{
        marginTop: '9px',
        display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap',
      }}>
        <span className="display-serif" style={{
          fontSize: 'clamp(30px, 8.5vw, 36px)', fontWeight: 400,
          letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1,
        }}>
          {PRAYER_LABELS[next.key]}
        </span>
        <span style={{
          fontSize: '23px', fontWeight: 600,
          color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}>
          {formatTime(next.at)}
        </span>
      </div>

      <div style={{
        marginTop: '7px', fontSize: '13.5px', color: 'var(--text-secondary)',
      }}>
        через {formatLeft(next.at.getTime() - now.getTime())}
      </div>

      <div
        aria-hidden
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: '3px',
          background: 'color-mix(in srgb, var(--ink) 7%, transparent)',
        }}
      >
        <div style={{
          width: `${(progress * 100).toFixed(1)}%`, height: '100%',
          background: 'color-mix(in srgb, var(--ink) 34%, transparent)',
          transition: 'width 0.6s ease',
        }} />
      </div>
    </section>
  );
}

/** Точки-индикатор, как у страниц погоды. */
function Dots({ count, index }: { count: number; index: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: '5px', flexShrink: 0 }} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            width: '6px', height: '6px', borderRadius: '9999px',
            background: i === index
              ? 'var(--text-primary)'
              : 'color-mix(in srgb, var(--ink) 20%, transparent)',
            transition: 'background 0.2s ease',
          }}
        />
      ))}
    </span>
  );
}

function TimeRow({ label, time, isNext, isCurrent, past, muted, adjust }: {
  label: string; time: string;
  isNext: boolean; isCurrent: boolean; past: boolean; muted: boolean;
  adjust: number;
}) {
  const strong = isNext || isCurrent;
  const colour = muted || past
    ? 'var(--text-tertiary)'
    : 'var(--text-primary)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      minHeight: '50px', padding: '7px 14px',
      borderRadius: '13px',
      marginBottom: '3px',
      background: strong ? 'color-mix(in srgb, var(--ink) 6%, transparent)' : 'transparent',
      border: `1px solid ${isNext ? 'var(--hairline-strong)' : 'transparent'}`,
      opacity: past && !isCurrent ? 0.62 : 1,
      transition: 'opacity 0.3s ease, background 0.3s ease',
    }}>
      {/* Метка «сейчас» вместо второго цвета: цвет уже занят под
          «прошло / не прошло», и третий оттенок не читался бы. */}
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: '15px', fontWeight: strong ? 600 : 500, color: colour,
      }}>
        {label}
        {isCurrent && (
          <span style={{
            marginLeft: '8px', fontSize: '10.5px', fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}>
            идёт
          </span>
        )}
        {adjust !== 0 && (
          <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {adjust > 0 ? `+${adjust}` : adjust} мин
          </span>
        )}
      </span>
      <span style={{
        fontSize: '16px', fontWeight: strong ? 600 : 500, color: colour,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
      }}>
        {time}
      </span>
    </div>
  );
}

/**
 * Панель городов.
 *
 * Три вещи в одном месте, потому что все три про «мои города»: выбрать,
 * настроить и упорядочить.  Настройки конкретного города раскрываются
 * внутри его строки — так видно, чему они принадлежат.
 *
 * Режим правки отдельной кнопкой, а не постоянными стрелками у каждой
 * строки: в обычном состоянии список читают, а не перекладывают, и
 * шесть кнопок на строке этому мешают.
 */
function CitiesSheet({ cities, activeId, now, onPick, onClose }: {
  cities: PrayerCity[];
  activeId: string;
  now: Date;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tuning, setTuning] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLocate = async () => {
    setError(null);
    setLocating(true);
    try {
      const p = await locate();
      addCity(p);
      setAdding(false);
      onClose();
    } catch (e) {
      setError(LOCATE_ERROR_TEXT[e as LocateError] ?? 'Не удалось определить местоположение.');
    } finally {
      setLocating(false);
    }
  };

  const title = adding ? 'Добавить город' : 'Мои города';

  /*
   * Портал в body, а не рендер на месте.
   *
   * Экран задаёт `position: relative; z-index: 1` и тем самым создаёт
   * контекст наложения: внутри него `z-index: 45` листа ничего не
   * значит против таб-бара, который лежит снаружи с z-index 40.  Лист
   * уезжал под панель вкладок — поймано на симуляторе.
   */
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
        aria-label="Мои города"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
          maxHeight: '82vh',
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
            {title}
          </h2>

          {!adding && cities.length > 1 && (
            <button
              onClick={() => { setEditing(v => !v); setTuning(null); }}
              style={{
                minHeight: '32px', padding: '0 12px', borderRadius: '9999px',
                border: `1px solid ${editing ? 'var(--text-primary)' : 'var(--hairline)'}`,
                background: editing
                  ? 'color-mix(in srgb, var(--ink) 8%, transparent)'
                  : 'transparent',
                color: 'var(--text-primary)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
              }}
            >
              {editing ? 'Готово' : 'Изменить'}
            </button>
          )}

          <button
            onClick={() => (adding ? setAdding(false) : onClose())}
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
          {!adding && (
            <>
              {cities.map((c, i) => (
                <CityRow
                  key={c.id}
                  city={c}
                  now={now}
                  active={c.id === activeId}
                  editing={editing}
                  first={i === 0}
                  last={i === cities.length - 1}
                  onlyOne={cities.length <= 1}
                  tuning={tuning === c.id}
                  onPick={() => onPick(c.id)}
                  onTune={() => setTuning(t => (t === c.id ? null : c.id))}
                  onMove={d => moveCity(c.id, d)}
                  onRemove={() => removeCity(c.id)}
                />
              ))}

              <button
                onClick={() => { setAdding(true); setEditing(false); setError(null); }}
                disabled={cities.length >= MAX_CITIES}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', minHeight: '54px',
                  border: 'none', borderTop: '1px solid var(--hairline)',
                  background: 'transparent',
                  color: cities.length >= MAX_CITIES
                    ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontFamily: 'inherit', fontSize: '14.5px', fontWeight: 500,
                  cursor: cities.length >= MAX_CITIES ? 'default' : 'pointer',
                }}
              >
                <Plus size={16} />
                {cities.length >= MAX_CITIES
                  ? `Максимум ${MAX_CITIES} городов`
                  : 'Добавить город'}
              </button>
            </>
          )}

          {adding && (
            <div style={{ padding: '14px 18px 18px' }}>
              <button
                onClick={onLocate}
                disabled={locating}
                style={{
                  width: '100%', minHeight: '48px', borderRadius: '14px',
                  border: '1px solid var(--hairline)',
                  background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
                  color: 'var(--text-primary)', cursor: locating ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: '14.5px', fontWeight: 500,
                  marginBottom: '12px',
                }}
              >
                {locating ? 'Определяю…' : 'Определить моё место'}
              </button>

              {error && (
                <p style={{
                  margin: '0 0 12px', fontSize: '12.5px', lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                }}>
                  {error}
                </p>
              )}

              <p style={{
                margin: '0 0 8px 2px', fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
              }}>
                Из списка
              </p>
              <div style={{
                border: '1px solid var(--hairline)', borderRadius: '14px',
                overflow: 'hidden',
              }}>
                {CITIES.map((c, i) => {
                  const already = cities.some(x => x.name === c.name);
                  return (
                    <button
                      key={c.name}
                      disabled={already}
                      onClick={() => { addCity({ ...c, source: 'manual' }); setAdding(false); onClose(); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', minHeight: '46px', padding: '10px 14px',
                        border: 'none',
                        borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                        background: 'transparent',
                        color: already ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        textAlign: 'left', fontFamily: 'inherit', fontSize: '14.5px',
                        cursor: already ? 'default' : 'pointer',
                      }}
                    >
                      <span>{c.name}</span>
                      {already && <span style={{ fontSize: '12px' }}>добавлен</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* Домашний индикатор: без запаса последняя строка списка
            оказывается прямо под ним и её не нажать. */}
        <div style={{ height: 'env(safe-area-inset-bottom)', flexShrink: 0 }} />
      </div>
    </>,
    document.body,
  );
}

function CityRow({
  city, now, active, editing, first, last, onlyOne, tuning,
  onPick, onTune, onMove, onRemove,
}: {
  city: PrayerCity;
  now: Date;
  active: boolean;
  editing: boolean;
  first: boolean;
  last: boolean;
  onlyOne: boolean;
  tuning: boolean;
  onPick: () => void;
  onTune: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const n = nextPrayer(city, now, city.settings);
  const method = methodById(city.settings.method);
  const tweaks = PRAYER_ORDER.filter(k => city.settings.adjustments[k] !== 0).length;

  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--hairline)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '10px 12px 10px 18px',
        background: active ? 'color-mix(in srgb, var(--ink) 5%, transparent)' : 'transparent',
      }}>
        {editing && (
          <span style={{ display: 'inline-flex', gap: '3px', flexShrink: 0, marginRight: '4px' }}>
            <Mini label="Выше" disabled={first} onClick={() => onMove(-1)}>↑</Mini>
            <Mini label="Ниже" disabled={last} onClick={() => onMove(1)}>↓</Mini>
          </span>
        )}

        <button
          onClick={editing ? onTune : onPick}
          style={{
            flex: 1, minWidth: 0, display: 'block', textAlign: 'left',
            border: 'none', background: 'transparent', padding: '4px 0',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{
            display: 'block',
            fontSize: '15.5px', fontWeight: active ? 600 : 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {city.name}
          </span>
          <span style={{
            display: 'block', marginTop: '2px',
            fontSize: '12px', color: 'var(--text-tertiary)',
          }}>
            {/* В обычном режиме — время, в правке — что настроено:
                это два разных вопроса, и оба нужны в своём режиме. */}
            {editing
              ? `${method.label}${tweaks > 0 ? ` · поправок ${tweaks}` : ''}`
              : `${PRAYER_LABELS[n.key]} ${formatTime(n.at)}`}
          </span>
        </button>

        {editing ? (
          <>
            <button
              onClick={onTune}
              aria-label={`Настроить ${city.name}`}
              style={{
                minHeight: '32px', padding: '0 11px', borderRadius: '9999px',
                border: `1px solid ${tuning ? 'var(--text-primary)' : 'var(--hairline)'}`,
                background: tuning ? 'color-mix(in srgb, var(--ink) 8%, transparent)' : 'transparent',
                color: 'var(--text-primary)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '12.5px', flexShrink: 0,
              }}
            >
              Метод
            </button>
            <Mini label={`Удалить ${city.name}`} disabled={onlyOne} onClick={onRemove}>
              <Trash size={14} />
            </Mini>
          </>
        ) : (
          <span style={{
            display: 'inline-flex', color: 'var(--text-tertiary)', flexShrink: 0,
            paddingRight: '4px',
          }}>
            <ChevronRight size={15} />
          </span>
        )}
      </div>

      {tuning && <CitySettings city={city} />}
    </div>
  );
}

/** Настройки конкретного города — метод, мазхаб, поправки. */
function CitySettings({ city }: { city: PrayerCity }) {
  const method = methodById(city.settings.method);
  const update = (patch: Partial<PrayerSettings>) =>
    updateCitySettings(city.id, { ...city.settings, ...patch });

  return (
    <div style={{
      padding: '4px 18px 18px',
      display: 'grid', gap: '16px',
      background: 'color-mix(in srgb, var(--ink) 3%, transparent)',
    }}>
      <div>
        <p style={groupTitle}>Углы фаджра и иши</p>
        <div style={{ display: 'grid', gap: '6px' }}>
          {METHODS.map(m => {
            const on = city.settings.method === m.id;
            return (
              <button
                key={m.id}
                onClick={() => update({ method: m.id as MethodId })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '10px', minHeight: '42px', padding: '8px 12px',
                  borderRadius: '11px',
                  border: `1px solid ${on ? 'var(--text-primary)' : 'var(--hairline)'}`,
                  background: on ? 'color-mix(in srgb, var(--ink) 7%, transparent)' : 'transparent',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13.5px', textAlign: 'left',
                }}
              >
                <span>{m.label}</span>
                <span style={{
                  fontSize: '11.5px', color: 'var(--text-tertiary)',
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {m.fajr}° / {'angle' in m.isha ? `${m.isha.angle}°` : `${m.isha.minutes} мин`}
                </span>
              </button>
            );
          })}
        </div>
        <p style={hint}>{method.source}.</p>
        {method.caution && (
          <p style={{ ...hint, color: 'var(--text-secondary)' }}>{method.caution}</p>
        )}
      </div>

      <div>
        <p style={groupTitle}>Аср</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {(['shafi', 'hanafi'] as Madhab[]).map(m => {
            const on = city.settings.madhab === m;
            return (
              <button
                key={m}
                onClick={() => update({ madhab: m })}
                style={{
                  minHeight: '42px', borderRadius: '11px',
                  border: `1px solid ${on ? 'var(--text-primary)' : 'var(--hairline)'}`,
                  background: on ? 'color-mix(in srgb, var(--ink) 7%, transparent)' : 'transparent',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13.5px',
                }}
              >
                {MADHAB_LABELS[m]}
              </button>
            );
          })}
        </div>
        <p style={hint}>У ханафитов аср наступает позже — разница доходит до часа.</p>
      </div>

      <div>
        <p style={groupTitle}>Поправка, минуты</p>
        <div style={{ display: 'grid', gap: '4px' }}>
          {PRAYER_ORDER.map(key => (
            <AdjustRow
              key={key}
              label={PRAYER_LABELS[key]}
              value={city.settings.adjustments[key]}
              onChange={v => update({
                adjustments: { ...city.settings.adjustments, [key]: v },
              })}
            />
          ))}
        </div>
        <p style={hint}>
          Если расписание вашей мечети отличается на пару минут — выставьте
          разницу здесь, она запомнится для этого города.
        </p>
      </div>
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
        fontFamily: 'inherit', fontSize: '13px', lineHeight: 1, flexShrink: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

const groupTitle: React.CSSProperties = {
  margin: '14px 0 8px',
  fontSize: '10px', fontWeight: 600, letterSpacing: '0.10em',
  textTransform: 'uppercase', color: 'var(--text-tertiary)',
};

const hint: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: '11.5px', lineHeight: 1.5, color: 'var(--text-tertiary)',
};

function AdjustRow({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const step = (d: number) => onChange(Math.max(-60, Math.min(60, value + d)));
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '10px', minHeight: '40px',
    }}>
      <span style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <StepButton onClick={() => step(-1)} label={`${label}: минус минута`}>−</StepButton>
        <span style={{
          minWidth: '46px', textAlign: 'center',
          fontSize: '13.5px', fontVariantNumeric: 'tabular-nums',
          color: value === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
        }}>
          {value > 0 ? `+${value}` : value}
        </span>
        <StepButton onClick={() => step(1)} label={`${label}: плюс минута`}>+</StepButton>
      </span>
    </div>
  );
}

function StepButton({ children, onClick, label }: {
  children: React.ReactNode; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: '34px', height: '34px',
        borderRadius: '10px',
        border: '1px solid var(--hairline)',
        background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
        color: 'var(--text-primary)', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '16px', lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}
