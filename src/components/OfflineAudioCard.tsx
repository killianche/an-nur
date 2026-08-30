/**
 * OfflineAudioCard — загрузка только открытой суры в попапе чтения.
 *
 * Полные загрузки по чтецам вынесены в AccountScreen через
 * FullQuranAudioManager, чтобы настройки чтения не превращались в
 * отдельный экран управления файлами.
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
import { RECITERS, reciterById, supportsAyahOffline, type ReciterId } from '../lib/reciters';
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
import { Download, Trash, CheckCircle, Pause, ICON_SIZE } from './icons';

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
  reciter: ReciterId;
  surahNumber?: number;
}) {
  useDownloadsTick();
  const supported = isOfflineSupported();
  const activeSupportsOffline = supportsAyahOffline(reciter);

  return (
    <section style={{ ...settingCard, marginTop: '10px' }}>
      <p style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Download size={ICON_SIZE.sm} />
        Скачать эту суру
      </p>

      {!supported ? (
        <p style={{
          margin: 0, fontSize: 'var(--font-caption1)', lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}>
          Скачивание доступно в приложении для iPhone.
        </p>
      ) : surahNumber != null && activeSupportsOffline ? (
        <SurahRow reciter={reciter} surah={surahNumber} />
      ) : (
        <p style={{ margin: 0, fontSize: 'var(--font-caption1)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Для открытой суры загрузка недоступна.
        </p>
      )}
    </section>
  );
}

/** Управление полными записями Корана — отдельный раздел «Аккаунта». */
export function FullQuranAudioManager() {
  useDownloadsTick();

  if (!isOfflineSupported()) {
    return (
      <p style={{ margin: 0, padding: '14px 16px', fontSize: 'var(--font-caption1)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        Полные записи можно скачать в приложении для iPhone.
      </p>
    );
  }

  return (
    <div>
      {RECITERS.filter(r => supportsAyahOffline(r.id)).map((r, index, list) => (
        <div
          key={r.id}
          style={{
            padding: '14px 16px',
            borderBottom: index < list.length - 1 ? '1px solid var(--hairline)' : 'none',
          }}
        >
          <ReciterRow id={r.id} label={r.label} />
        </div>
      ))}
      <p style={{ margin: 0, padding: '0 16px 14px', fontSize: 'var(--font-caption2)', lineHeight: 1.5, color: 'var(--text-tertiary)' }}>
        Здесь скачивается весь Коран выбранного чтеца. Отдельную суру можно скачать в настройках её чтения.
      </p>
    </div>
  );
}

// ─── Строка текущей суры ────────────────────────────────────────────────

function SurahRow({ reciter, surah }: { reciter: ReciterId; surah: number }) {
  const meta = SURAH_BY_NUMBER[surah];
  const total = ayahsInSurah(surah);
  const have = downloadedInSurah(reciter, surah);
  const complete = isSurahComplete(reciter, surah);
  const st = getDownloadState(reciter);
  const running = st.status === 'running';
  const busyOnThis = running && st.scope?.kind === 'surah' && st.scope.surah === surah;

  return (
    <div style={{
      display: 'grid', gap: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 'var(--font-caption1)', fontWeight: 'var(--weight-regular)',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta?.transliteration ?? `Сура ${surah}`}
          <span style={{ display: 'block', marginTop: '3px', fontSize: 'var(--font-caption2)', fontWeight: 'var(--weight-regular)', color: 'var(--text-tertiary)' }}>
            {reciterById(reciter).label}
          </span>
        </span>

        {complete ? (
          <ActionButton
            label="Удалить с устройства"
            icon={<Trash size={ICON_SIZE.sm} />}
            onClick={() => { void clearSurah(reciter, surah); }}
          />
        ) : running ? (
          <ActionButton
            label="Пауза"
            icon={<Pause size={ICON_SIZE.sm} />}
            onClick={() => pauseDownload(reciter)}
          />
        ) : (
          <ActionButton
            label={have > 0 ? 'Докачать суру' : 'Скачать суру'}
            icon={<Download size={ICON_SIZE.sm} />}
            onClick={() => { void startDownload(reciter, { kind: 'surah', surah }); }}
          />
        )}
      </div>

      <Meter value={have} max={total} />

      <span style={meta_}>
        {complete
          ? 'Эта сура есть офлайн'
          : running && !busyOnThis
          ? 'Для этого чтеца уже идёт другая загрузка. Управление — в разделе «Аккаунт».'
          : `${have} из ${total} аятов · ≈ ${formatBytes(estimateBytes(reciter, total - have))} осталось`}
      </span>
    </div>
  );
}

// ─── Строка чтеца ───────────────────────────────────────────────────────

function ReciterRow({ id, label }: {
  id: ReciterId; label: string;
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
          fontSize: 'var(--font-caption1)', fontWeight: 'var(--weight-regular)',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>

        {complete && !running && (
          <span aria-hidden style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}>
            <CheckCircle size={ICON_SIZE.sm} />
          </span>
        )}

        {complete ? (
          <ActionButton
            label="Удалить"
            icon={<Trash size={ICON_SIZE.sm} />}
            onClick={() => {
              void clearReciter(id).then(() => resetDownloadState(id));
            }}
          />
        ) : running ? (
          <ActionButton
            label="Пауза"
            icon={<Pause size={ICON_SIZE.sm} />}
            onClick={() => {
              pauseDownload(id);
              // Ручная пауза = отказ от автозагрузки: раз человек
              // остановил, приложение больше не начинает само.
              void optOutOfAutoDownload();
            }}
          />
        ) : (
          <ActionButton
            label={have > 0 ? 'Докачать' : 'Скачать весь Коран'}
            icon={<Download size={ICON_SIZE.sm} />}
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
          ? `${suras} из ${TOTAL_SURAHS} сур целиком · ${have} аятов · ≈ ${formatBytes(estimateBytes(id, left))} осталось`
          : 'Не скачано — играет стримом'}
      </span>
    </div>
  );
}

// ─── Мелочи ─────────────────────────────────────────────────────────────

const meta_: React.CSSProperties = {
  fontSize: 'var(--font-caption2)',
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
        fontFamily: 'inherit', fontSize: 'var(--font-caption2)', fontWeight: 'var(--weight-regular)',
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
