/**
 * PrayerTimesScreen — время намаза.
 *
 * Считается офлайн (см. lib/prayerTimes.ts), место берётся из общего
 * слоя lib/location.ts — того же, что у киблы.
 *
 * ── Что на экране ─────────────────────────────────────────────────────
 *
 * Сверху — ближайший намаз и сколько до него осталось: это то, ради
 * чего экран открывают, и оно должно читаться с расстояния вытянутой
 * руки.  Ниже — весь день списком, текущий отрезок подсвечен.  В самом
 * низу — место и метод расчёта, потому что их меняют раз в жизни.
 *
 * ── Почему метод виден, а не спрятан ──────────────────────────────────
 *
 * Разные школы дают разное время: между 16° и 18° для фаджра в Назрани
 * около 17 минут.  Человек, у которого приложение расходится с его
 * мечетью, должен сразу видеть, по какому методу считалось, и уметь
 * поправить — иначе он просто перестанет доверять цифрам.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, Clock } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';
import {
  CITIES, locate, onPlaceChange, readPlace, writePlace,
  LOCATE_ERROR_TEXT, type LocateError, type Place,
} from '../lib/location';
import {
  METHODS, MADHAB_LABELS, PRAYER_LABELS, PRAYER_ORDER, IS_PRAYER,
  formatLeft, formatTime, methodById, nextPrayer, onSettingsChange,
  readSettings, timesFor, usesTimetable, writeSettings,
  type Madhab, type MethodId, type PrayerSettings,
} from '../lib/prayerTimes';

type Props = { theme: Theme; setTheme: (t: Theme) => void };

export function PrayerTimesScreen({ theme, setTheme }: Props) {
  const [place, setPlace] = useState<Place>(readPlace);
  const [settings, setSettings] = useState<PrayerSettings>(readSettings);
  const [themeOpen, setThemeOpen] = useState(false);
  const [panel, setPanel] = useState<'none' | 'place' | 'method'>('none');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  // Минутный тик: обратный отсчёт должен идти сам, без перезахода на
  // экран.  Секунды не показываем, поэтому и тикать чаще незачем.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => onPlaceChange(() => setPlace(readPlace())), []);
  useEffect(() => onSettingsChange(() => setSettings(readSettings())), []);

  const times = useMemo(() => timesFor(place, now, settings), [place, now, settings]);
  const next = useMemo(() => nextPrayer(place, now, settings), [place, now, settings]);
  const method = methodById(settings.method);
  const fromTimetable = usesTimetable(place, settings);

  const onLocate = async () => {
    setError(null);
    setLocating(true);
    try {
      const p = await locate();
      writePlace(p);
      setPlace(p);
    } catch (e) {
      setError(LOCATE_ERROR_TEXT[e as LocateError] ?? 'Не удалось определить местоположение.');
    } finally {
      setLocating(false);
    }
  };

  const update = (patch: Partial<PrayerSettings>) => {
    const nextS = { ...settings, ...patch };
    setSettings(nextS);
    writeSettings(nextS);
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
        paddingBottom: '16px',
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

      {/* Ближайший намаз */}
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

      {/* День списком */}
      <section style={{ marginBottom: '18px' }}>
        {PRAYER_ORDER.map(key => (
          <TimeRow
            key={key}
            label={PRAYER_LABELS[key]}
            time={formatTime(times[key])}
            isNext={IS_PRAYER[key] && key === next.key && !next.tomorrow}
            muted={!IS_PRAYER[key]}
            adjust={settings.adjustments[key]}
          />
        ))}
      </section>

      {error && (
        <p style={{
          margin: '0 0 12px', padding: '11px 14px', borderRadius: '12px',
          background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
          border: '1px solid var(--hairline)',
          fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-secondary)',
        }}>
          {error}
        </p>
      )}

      {/* Место и метод */}
      <div style={{ display: 'grid', gap: '8px' }}>
        <SettingRow
          label="Место"
          value={place.name}
          open={panel === 'place'}
          onClick={() => setPanel(p => (p === 'place' ? 'none' : 'place'))}
        />
        {panel === 'place' && (
          <div style={{ display: 'grid', gap: '8px' }}>
            <button
              onClick={onLocate}
              disabled={locating}
              style={{
                minHeight: '44px', borderRadius: '12px',
                border: '1px solid var(--hairline)',
                background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
                color: 'var(--text-primary)', cursor: locating ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: '14px', fontWeight: 500,
              }}
            >
              {locating ? 'Определяю…' : 'Определить моё место'}
            </button>
            <div style={{
              maxHeight: '34vh', overflowY: 'auto',
              border: '1px solid var(--hairline)', borderRadius: '14px',
              background: 'var(--surface)',
            }}>
              {CITIES.map(c => (
                <button
                  key={c.name}
                  onClick={() => {
                    writePlace({ ...c, source: 'manual' });
                    setPlace({ ...c, source: 'manual' });
                    setPanel('none');
                    setError(null);
                  }}
                  style={{
                    display: 'block', width: '100%', minHeight: '44px',
                    padding: '10px 14px', border: 'none',
                    borderBottom: '1px solid var(--hairline-soft, var(--hairline))',
                    background: place.name === c.name
                      ? 'color-mix(in srgb, var(--ink) 6%, transparent)'
                      : 'transparent',
                    color: 'var(--text-primary)', textAlign: 'left',
                    fontFamily: 'inherit', fontSize: '14.5px', cursor: 'pointer',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
            <div>
              <p style={groupTitle}>Метод расчёта</p>
              <div style={{ display: 'grid', gap: '6px' }}>
                {METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => update({ method: m.id as MethodId })}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '10px', minHeight: '42px', padding: '8px 12px',
                      borderRadius: '10px',
                      border: `1px solid ${settings.method === m.id ? 'var(--text-primary)' : 'var(--hairline)'}`,
                      background: settings.method === m.id
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
                      {/*
                        Без своей подписи «Назрань 2» и «ДУМ России»
                        выглядели бы одинаково — у обоих 16° / 15°, —
                        но дают разное время: первое берётся из
                        печатного календаря. Два одинаковых с виду
                        пункта с разным результатом читаются как ошибка.
                      */}
                      {m.short ?? `${m.fajr}° / ${'angle' in m.isha ? `${m.isha.angle}°` : `${m.isha.minutes} мин`}`}
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
                      border: `1px solid ${settings.madhab === m ? 'var(--text-primary)' : 'var(--hairline)'}`,
                      background: settings.madhab === m
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
                    value={settings.adjustments[key]}
                    onChange={v => update({
                      adjustments: { ...settings.adjustments, [key]: v },
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
        {/*
          Откуда цифры — не мелочь: «из календаря мечети» и «посчитано по
          углам» это разный уровень доверия, и человек имеет право знать,
          что именно он видит. Подменять одно другим молча нельзя.
        */}
        {fromTimetable
          ? 'Времена — из печатного календаря Ингушетии, он лежит в приложении и работает без интернета.'
          : 'Время считается на устройстве по координатам, без интернета.'}
        {' '}
        Сверьтесь с расписанием своей мечети: если оно расходится хотя бы
        на минуту — выставьте разницу в поправках, она запомнится.
      </p>
    </div>
  );
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
