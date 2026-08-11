/**
 * PrayerTimesScreen — время намаза по нескольким городам.
 *
 * Считается офлайн (см. lib/prayerTimes.ts), список городов и их
 * настройки живут в lib/prayerCities.ts.
 *
 * ── Почему несколько городов, а не одно место ─────────────────────────
 *
 * Как погода в iOS.  Человек живёт в одном городе, родня в другом,
 * работа в третьем, и вопрос «а во сколько там магриб» возникает
 * постоянно.  Перевыбирать место каждый раз — значит терять свои
 * поправки и метод, потому что они привязаны к расписанию, а не к
 * человеку.  Поэтому город — это карточка со своими настройками, а не
 * значение одного поля.
 *
 * ── Что на экране ─────────────────────────────────────────────────────
 *
 * Сверху название города и точки — сколько их всего и где мы.  Смах
 * влево-вправо переключает город, как страницы погоды.  Ниже ближайший
 * намаз с обратным отсчётом (то, ради чего экран открывают), потом весь
 * день списком, в самом низу — метод расчёта этого города.
 *
 * ── Почему метод виден, а не спрятан ──────────────────────────────────
 *
 * Разные школы дают разное время: между 16° и 18° для фаджра в Назрани
 * около 17 минут.  Человек, у которого приложение расходится с его
 * мечетью, должен сразу видеть, по какому методу считалось, и уметь
 * поправить — иначе он просто перестанет доверять цифрам.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, Clock, Close, Trash } from '../components/icons';
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
  type Madhab, type MethodId, type PrayerSettings,
} from '../lib/prayerTimes';

type Props = { theme: Theme; setTheme: (t: Theme) => void };

export function PrayerTimesScreen({ theme, setTheme }: Props) {
  const [cities, setCities] = useState<PrayerCity[]>(readCities);
  const [activeId, setActive] = useState<string>(() => readActiveId());
  const [themeOpen, setThemeOpen] = useState(false);
  const [panel, setPanel] = useState<'none' | 'cities' | 'method'>('none');
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onCitiesChange(() => {
    const list = readCities();
    setCities(list);
    setActive(readActiveId(list));
  }), []);

  // Минутный тик: обратный отсчёт должен идти сам, без перезахода на
  // экран.  Секунды не показываем, поэтому и тикать чаще незачем.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const index = Math.max(0, cities.findIndex(c => c.id === activeId));
  const city = cities[index] ?? cities[0];

  const times = useMemo(() => timesFor(city, now, city.settings), [city, now]);
  const next  = useMemo(() => nextPrayer(city, now, city.settings), [city, now]);
  const method = methodById(city.settings.method);

  const go = (delta: number) => {
    if (cities.length < 2) return;
    // По кругу: на последнем городе смах влево возвращает к первому.
    // Тупик в конце списка читается как «сломалось».
    const n = (index + delta + cities.length) % cities.length;
    setActiveId(cities[n].id);
  };

  const update = (patch: Partial<PrayerSettings>) => {
    const nextSettings: PrayerSettings = { ...city.settings, ...patch };
    updateCitySettings(city.id, nextSettings);
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
    // Порог и требование «горизонтальнее вертикального»: экран
    // прокручивается, и вертикальный жест не должен листать города.
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
        paddingBottom: '10px',
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
          style={iconBtn(themeOpen)}
        >
          <Appearance size={19} />
        </button>
      </header>

      {/* ── Город и точки ────────────────────────────────────────────── */}
      <button
        onClick={() => setPanel(p => (p === 'cities' ? 'none' : 'cities'))}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          width: '100%', padding: '4px 2px 12px',
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: '19px', fontWeight: 600, letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {city.name}
        </span>
        {cities.length > 1 && <Dots count={cities.length} index={index} />}
        <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
          Города
        </span>
      </button>

      {panel === 'cities' && (
        <CityManager
          cities={cities}
          activeId={city.id}
          onPick={id => { setActiveId(id); setPanel('none'); }}
          onClose={() => setPanel('none')}
        />
      )}

      {/* Смах ловим на блоке времён, а не на всём экране: внизу лежат
          настройки со своими горизонтальными элементами. */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <section style={{
          padding: '20px 22px',
          borderRadius: '18px',
          border: '1px solid var(--hairline)',
          background: 'var(--surface)',
          marginBottom: '18px',
        }}>
          <div style={{
            fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--text-tertiary)',
          }}>
            {next.tomorrow ? 'Следующий — завтра' : 'Следующий намаз'}
          </div>
          <div style={{
            marginTop: '10px',
            display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap',
          }}>
            <span className="display-serif" style={{
              fontSize: 'clamp(28px, 8vw, 34px)', fontWeight: 400,
              letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1,
            }}>
              {PRAYER_LABELS[next.key]}
            </span>
            <span style={{
              fontSize: '22px', fontWeight: 600,
              color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
            }}>
              {formatTime(next.at)}
            </span>
          </div>
          <div style={{ marginTop: '8px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            через {formatLeft(next.at.getTime() - now.getTime())}
          </div>
        </section>

        <section style={{ marginBottom: '18px' }}>
          {PRAYER_ORDER.map(key => (
            <TimeRow
              key={key}
              label={PRAYER_LABELS[key]}
              time={formatTime(times[key])}
              isNext={IS_PRAYER[key] && key === next.key && !next.tomorrow}
              muted={!IS_PRAYER[key]}
              adjust={city.settings.adjustments[key]}
            />
          ))}
        </section>
      </div>

      {/* ── Метод расчёта этого города ───────────────────────────────── */}
      <div style={{ display: 'grid', gap: '8px' }}>
        <SettingRow
          label="Метод расчёта"
          value={method.label}
          open={panel === 'method'}
          onClick={() => setPanel(p => (p === 'method' ? 'none' : 'method'))}
        />
        {panel === 'method' && (
          <div style={{
            border: '1px solid var(--hairline)', borderRadius: '14px',
            background: 'var(--surface)', padding: '14px',
            display: 'grid', gap: '14px',
          }}>
            {/* Напоминание, что настройка принадлежит городу, а не
                приложению: без него человек решит, что меняет всё разом. */}
            <p style={{ ...hint, margin: 0 }}>
              Настройки ниже — только для города «{city.name}».
            </p>

            <div>
              <p style={groupTitle}>Углы фаджра и иши</p>
              <div style={{ display: 'grid', gap: '6px' }}>
                {METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => update({ method: m.id as MethodId })}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '10px', minHeight: '42px', padding: '8px 12px',
                      borderRadius: '10px',
                      border: `1px solid ${city.settings.method === m.id ? 'var(--text-primary)' : 'var(--hairline)'}`,
                      background: city.settings.method === m.id
                        ? 'color-mix(in srgb, var(--ink) 7%, transparent)'
                        : 'transparent',
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
                ))}
              </div>
              <p style={hint}>{method.source}.</p>
              {method.caution && (
                <p style={{ ...hint, color: 'var(--text-secondary)' }}>{method.caution}</p>
              )}
            </div>

            <div>
              <p style={groupTitle}>Аср</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {(['shafi', 'hanafi'] as Madhab[]).map(m => (
                  <button
                    key={m}
                    onClick={() => update({ madhab: m })}
                    style={{
                      minHeight: '42px', borderRadius: '10px',
                      border: `1px solid ${city.settings.madhab === m ? 'var(--text-primary)' : 'var(--hairline)'}`,
                      background: city.settings.madhab === m
                        ? 'color-mix(in srgb, var(--ink) 7%, transparent)'
                        : 'transparent',
                      color: 'var(--text-primary)', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '13.5px',
                    }}
                  >
                    {MADHAB_LABELS[m]}
                  </button>
                ))}
              </div>
              <p style={hint}>
                У ханафитов аср наступает позже — разница доходит до часа.
              </p>
            </div>

            <div>
              <p style={groupTitle}>Поправка, минуты</p>
              <div style={{ display: 'grid', gap: '6px' }}>
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
                Если расписание вашей мечети отличается на пару минут —
                выставьте разницу здесь, она запомнится.
              </p>
            </div>
          </div>
        )}
      </div>

      <p style={{
        margin: '16px 4px 0', fontSize: '11.5px', lineHeight: 1.55,
        color: 'var(--text-tertiary)',
      }}>
        <span style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: '5px' }}>
          <Clock size={14} />
        </span>
        Время считается на устройстве по координатам, без интернета.
        Сверьтесь с расписанием своей мечети: если оно расходится хотя бы
        на минуту — выставьте разницу в поправках, она запомнится.
      </p>
    </div>
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
              : 'color-mix(in srgb, var(--ink) 22%, transparent)',
            transition: 'background 0.2s ease',
          }}
        />
      ))}
    </span>
  );
}

/**
 * Список городов: выбрать, переставить, удалить, добавить.
 *
 * Показывает у каждого города ближайший намаз со временем — иначе
 * список превращается в набор названий, по которому нечего выбирать.
 * Это и есть главная ценность режима: увидеть все свои города разом.
 */
function CityManager({ cities, activeId, onPick, onClose }: {
  cities: PrayerCity[];
  activeId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

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

  const taken = (name: string) => cities.some(c => c.name === name);

  return (
    <div style={{
      border: '1px solid var(--hairline)', borderRadius: '16px',
      background: 'var(--surface)', overflow: 'hidden',
      marginBottom: '16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 14px 10px',
      }}>
        <p style={{ ...groupTitle, margin: 0, flex: 1 }}>
          {adding ? 'Добавить город' : `Мои города · ${cities.length}`}
        </p>
        <button
          onClick={() => (adding ? setAdding(false) : onClose())}
          aria-label="Закрыть"
          className="icon-btn"
          style={{
            width: '30px', height: '30px', borderRadius: '9999px',
            border: '1px solid var(--hairline)', background: 'transparent',
            color: 'var(--text-secondary)',
          }}
        >
          <Close size={14} />
        </button>
      </div>

      {!adding && (
        <>
          <div>
            {cities.map((c, i) => {
              const n = nextPrayer(c, now, c.settings);
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 14px',
                    borderTop: '1px solid var(--hairline-soft, var(--hairline))',
                    background: c.id === activeId
                      ? 'color-mix(in srgb, var(--ink) 6%, transparent)'
                      : 'transparent',
                  }}
                >
                  <button
                    onClick={() => onPick(c.id)}
                    style={{
                      flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline',
                      gap: '8px', border: 'none', background: 'transparent',
                      padding: '6px 0', cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: '14.5px',
                      fontWeight: c.id === activeId ? 600 : 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {c.name}
                    </span>
                    <span style={{
                      fontSize: '12.5px', color: 'var(--text-secondary)',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>
                      {PRAYER_LABELS[n.key]} {formatTime(n.at)}
                    </span>
                  </button>

                  <span style={{ display: 'inline-flex', gap: '2px', flexShrink: 0 }}>
                    <MiniButton
                      label={`${c.name}: выше`}
                      disabled={i === 0}
                      onClick={() => moveCity(c.id, -1)}
                    >↑</MiniButton>
                    <MiniButton
                      label={`${c.name}: ниже`}
                      disabled={i === cities.length - 1}
                      onClick={() => moveCity(c.id, 1)}
                    >↓</MiniButton>
                    <MiniButton
                      label={`Удалить ${c.name}`}
                      // Последний город не удаляем: экрану нужно что-то
                      // показывать, а пустое состояние здесь бессмысленно.
                      disabled={cities.length <= 1}
                      onClick={() => removeCity(c.id)}
                    ><Trash size={14} /></MiniButton>
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => { setAdding(true); setError(null); }}
            disabled={cities.length >= MAX_CITIES}
            style={{
              width: '100%', minHeight: '46px',
              borderTop: '1px solid var(--hairline)', border: 'none',
              borderTopWidth: '1px', borderTopStyle: 'solid',
              borderTopColor: 'var(--hairline)',
              background: 'transparent',
              color: cities.length >= MAX_CITIES ? 'var(--text-tertiary)' : 'var(--text-primary)',
              fontFamily: 'inherit', fontSize: '14px',
              cursor: cities.length >= MAX_CITIES ? 'default' : 'pointer',
            }}
          >
            {cities.length >= MAX_CITIES ? `Максимум ${MAX_CITIES} городов` : '+ Добавить город'}
          </button>
        </>
      )}

      {adding && (
        <div style={{ padding: '0 14px 14px' }}>
          <button
            onClick={onLocate}
            disabled={locating}
            style={{
              width: '100%', minHeight: '44px', borderRadius: '12px',
              border: '1px solid var(--hairline)',
              background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
              color: 'var(--text-primary)', cursor: locating ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 500,
              marginBottom: '10px',
            }}
          >
            {locating ? 'Определяю…' : 'Определить моё место'}
          </button>

          {error && (
            <p style={{ ...hint, marginTop: 0, marginBottom: '10px' }}>{error}</p>
          )}

          <div style={{
            maxHeight: '38vh', overflowY: 'auto',
            border: '1px solid var(--hairline)', borderRadius: '12px',
          }}>
            {CITIES.map(c => {
              const already = taken(c.name);
              return (
                <button
                  key={c.name}
                  disabled={already}
                  onClick={() => {
                    addCity({ ...c, source: 'manual' });
                    setAdding(false);
                    onClose();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', minHeight: '44px', padding: '10px 14px',
                    border: 'none',
                    borderBottom: '1px solid var(--hairline-soft, var(--hairline))',
                    background: 'transparent',
                    color: already ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    textAlign: 'left', fontFamily: 'inherit', fontSize: '14.5px',
                    cursor: already ? 'default' : 'pointer',
                  }}
                >
                  <span>{c.name}</span>
                  {already && <span style={{ fontSize: '12px' }}>уже добавлен</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniButton({ children, onClick, disabled, label }: {
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

function iconBtn(active: boolean): React.CSSProperties {
  return {
    width: '42px', height: '42px', flexShrink: 0, borderRadius: '12px',
    border: '1px solid var(--hairline)',
    background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  };
}

const groupTitle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: '10px', fontWeight: 600, letterSpacing: '0.10em',
  textTransform: 'uppercase', color: 'var(--text-tertiary)',
};

const hint: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: '11.5px', lineHeight: 1.5, color: 'var(--text-tertiary)',
};

function TimeRow({ label, time, isNext, muted, adjust }: {
  label: string; time: string; isNext: boolean; muted: boolean; adjust: number;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      minHeight: '52px', padding: '8px 14px',
      borderRadius: '12px',
      marginBottom: '4px',
      background: isNext ? 'color-mix(in srgb, var(--ink) 7%, transparent)' : 'transparent',
      border: `1px solid ${isNext ? 'var(--hairline-strong)' : 'transparent'}`,
    }}>
      <span style={{
        fontSize: '15px',
        fontWeight: isNext ? 600 : 500,
        color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)',
      }}>
        {label}
        {adjust !== 0 && (
          <span style={{ marginLeft: '7px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {adjust > 0 ? `+${adjust}` : adjust} мин
          </span>
        )}
      </span>
      <span style={{
        fontSize: '16px',
        fontWeight: isNext ? 600 : 500,
        color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {time}
      </span>
    </div>
  );
}

function SettingRow({ label, value, open, onClick }: {
  label: string; value: string; open: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', minHeight: '48px', padding: '10px 16px',
        borderRadius: '13px',
        border: `1px solid ${open ? 'var(--text-primary)' : 'var(--hairline)'}`,
        background: 'color-mix(in srgb, var(--ink) 3%, transparent)',
        color: 'var(--text-primary)', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '14px', textAlign: 'left',
      }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </button>
  );
}

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
        borderRadius: '9px',
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
