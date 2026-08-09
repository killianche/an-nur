/**
 * OfflineAudioCard — секция «Офлайн» в попапе настроек.
 *
 * Живёт рядом с выбором чтеца: скачанность — свойство чтеца, а не
 * отдельный раздел приложения, поэтому экрана «Загрузки» нет.
 *
 * Что показывает:
 *   • Когда открыт из экрана суры (`surahNumber` задан) — первой
 *     строкой идёт ЭТА сура с кнопкой скачать/удалить.  Человек,
 *     который её сейчас читает, чаще всего хочет именно её.
 *   • Дальше — строка на чтеца: сколько сур из 114 лежит целиком,
 *     сколько аятов всего, прогресс активного задания и одна кнопка
 *     действия.
 *
 * Состояние не в компоненте: задание выполняется в
 * lib/audioDownloads.ts и продолжается при закрытом попапе.  Здесь
 * только подписка и перерисовка.
 *
 * В браузере офлайн-хранилища нет (чтобы `<audio>` читал Cache API,
 * нужен service worker с перехватом запросов), поэтому вместо кнопок
 * показываем честное пояснение.
 */

import { useEffect, useState } from 'react';
import { RECITERS, type ReciterId } from '../lib/reciters';
import {
  TOTAL_AYAHS, TOTAL_SURAHS, downloadedCount, completeSurahCount,
  downloadedInSurah, isSurahComplete, isOfflineSupported,
  subscribeAudioStore, clearReciter, clearSurah,
} from '../lib/audioStore';
import {
  getDownloadState, startDownload, pauseDownload, resetDownloadState,
  subscribeDownloads, estimateBytes, formatBytes, missingCount,
  type DownloadScope,
} from '../lib/audioDownloads';
import { optOutOfAutoDownload } from '../lib/audioAutoDownload';
import { ayahsInSurah } from '../lib/ayahNumbering';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { settingCard, cardTitle } from './ReadingSettings';
import { Download, Trash, CheckCircle, Pause } from './icons';

/** Перерисовка на любое изменение реестра или прогресса задания. */
function useDownloadsTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    const un1 = subscribeAudioStore(bump);
    const un2 = subscribeDownloads(bump);
    return () => { un1(); un2(); };
  }, []);
}

export function OfflineAudioCard({ reciter, surahNumber }: {
  /** Активный чтец — его строка идёт первой и подписана «сейчас». */
  reciter: ReciterId;
  /** Открыто из экрана суры — тогда добавляем строку про неё. */
  surahNumber?: number;
}) {
  useDownloadsTick();
  const supported = isOfflineSupported();

  return (
    <section style={{ ...settingCard, marginTop: '10px' }}>
      <p style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Download size={13} />
        Офлайн
      </p>

      {!supported ? (
        <p style={{
          margin: 0, fontSize: '12px', lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}>
          В браузере чтение идёт стримом. Скачать суры на устройство
          можно в приложении для iPhone и Android.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {surahNumber != null && (
            <SurahRow reciter={reciter} surah={surahNumber} />
          )}

          {RECITERS.map(r => (
            <ReciterRow
              key={r.id}
              id={r.id}
              label={r.label}
              isCurrent={r.id === reciter}
            />
          ))}

          <p style={{
            margin: 0, fontSize: '11px', lineHeight: 1.45,
            color: 'var(--text-tertiary)',
          }}>
            Аяты, которые вы слушаете, сохраняются сами. Полная запись
            чтеца — примерно {formatBytes(estimateBytes(TOTAL_AYAHS))};
            качать лучше по Wi-Fi, прервать и продолжить можно в любой
            момент.
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Строка текущей суры ────────────────────────────────────────────────

function SurahRow({ reciter, surah }: { reciter: ReciterId; surah: number }) {
  const meta = SURAH_BY_NUMBER[surah];
  const total = ayahsInSurah(surah);
  const have = downloadedInSurah(reciter, surah);
  const complete = isSurahComplete(reciter, surah);
  const st = getDownloadState(reciter);
  const busyOnThis = st.status === 'running'
    && st.scope?.kind === 'surah' && st.scope.surah === surah;

  return (
    <div style={{
      display: 'grid', gap: '6px',
      paddingBottom: '12px',
      borderBottom: '1px solid var(--hairline)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: '12.5px', fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta?.transliteration ?? `Сура ${surah}`}
        </span>

        {complete ? (
          <ActionButton
            label="Удалить"
            icon={<Trash size={15} />}
            onClick={() => { void clearSurah(reciter, surah); }}
          />
        ) : busyOnThis ? (
          <ActionButton
            label="Пауза"
            icon={<Pause size={15} />}
            onClick={() => pauseDownload(reciter)}
          />
        ) : (
          <ActionButton
            label={have > 0 ? 'Докачать' : 'Скачать'}
            icon={<Download size={15} />}
            onClick={() => { void startDownload(reciter, { kind: 'surah', surah }); }}
          />
        )}
      </div>

      <Meter value={have} max={total} />

      <span style={meta_}>
        {complete
          ? 'Эта сура есть офлайн'
          : `Эта сура — ${have} из ${total} аятов · ≈ ${formatBytes(estimateBytes(total - have))} осталось`}
      </span>
    </div>
  );
}

// ─── Строка чтеца ───────────────────────────────────────────────────────

function ReciterRow({ id, label, isCurrent }: {
  id: ReciterId; label: string; isCurrent: boolean;
}) {
  const have = downloadedCount(id);
  const suras = completeSurahCount(id);
  const complete = have >= TOTAL_AYAHS;
  const st = getDownloadState(id);
  const running = st.status === 'running';

  const ALL: DownloadScope = { kind: 'all' };
  const left = missingCount(id, ALL);

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: '12.5px', fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
          {isCurrent && (
            <span style={{
              marginLeft: '6px', fontSize: '10px', fontWeight: 600,
              color: 'var(--text-tertiary)', letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              сейчас
            </span>
          )}
        </span>

        {complete && !running && (
          <span aria-hidden style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}>
            <CheckCircle size={15} />
          </span>
        )}

        {complete ? (
          <ActionButton
            label="Удалить"
            icon={<Trash size={15} />}
            onClick={() => {
              void clearReciter(id).then(() => resetDownloadState(id));
            }}
          />
        ) : running ? (
          <ActionButton
            label="Пауза"
            icon={<Pause size={15} />}
            onClick={() => {
              pauseDownload(id);
              // Ручная пауза = отказ от автозагрузки: раз человек
              // остановил, приложение больше не начинает само.
              void optOutOfAutoDownload();
            }}
          />
        ) : (
          <ActionButton
            label={have > 0 ? 'Докачать всё' : 'Скачать всё'}
            icon={<Download size={15} />}
            onClick={() => { void startDownload(id, ALL); }}
          />
        )}
      </div>

      <Meter value={have} max={TOTAL_AYAHS} />

      <span style={{
        ...meta_,
        color: st.status === 'error' ? '#e0654a' : 'var(--text-tertiary)',
      }}>
        {st.status === 'error'
          ? st.error
          : complete
          ? `Весь Коран офлайн · ${TOTAL_SURAHS} сур`
          : running
          ? `Качаю: ${st.done} из ${st.total} · ${formatBytes(st.bytes)}`
          : have > 0
          ? `${suras} из ${TOTAL_SURAHS} сур целиком · ${have} аятов · ≈ ${formatBytes(estimateBytes(left))} осталось`
          : 'Не скачано — играет стримом'}
      </span>
    </div>
  );
}

// ─── Мелочи ─────────────────────────────────────────────────────────────

const meta_: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-tertiary)',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.35,
};

function ActionButton({ label, icon, onClick }: {
  label: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        flexShrink: 0, minHeight: '30px', padding: '0 10px',
        borderRadius: '8px',
        border: '1px solid var(--hairline-strong)',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '11.5px', fontWeight: 500,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/** Полоса прогресса.  Не рисуем пустой жёлоб на нетронутом чтеце —
 *  он читается как ошибка, а не как «ещё ничего нет». */
function Meter({ value, max }: { value: number; max: number }) {
  if (value <= 0 || max <= 0) return null;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{
        height: '3px', borderRadius: '2px',
        background: 'var(--hairline)', overflow: 'hidden',
      }}
    >
      <div style={{
        height: '100%', width: `${pct}%`,
        background: 'var(--text-primary)', opacity: 0.7,
        transition: 'width 240ms ease',
      }} />
    </div>
  );
}
