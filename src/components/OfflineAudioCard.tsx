/**
 * OfflineAudioCard — секция «Скачать для офлайна» в попапе настроек.
 *
 * Показывает по строке на чтеца: имя, состояние, полоса прогресса и
 * одна кнопка действия (скачать / пауза / удалить).  Живёт рядом с
 * выбором чтеца — скачивание это свойство чтеца, а не отдельный раздел
 * приложения, поэтому отдельного экрана «Загрузки» здесь нет.
 *
 * Состояние не хранится в компоненте: загрузка идёт в модуле
 * lib/audioDownloads.ts и продолжается, даже когда попап закрыт.
 * Компонент только подписывается и перерисовывается.
 *
 * В браузере офлайн-хранилище не работает (нужен service worker,
 * который перехватывал бы запросы `<audio>`), поэтому вместо кнопок
 * показываем честное пояснение, а не неработающий контрол.
 */

import { useEffect, useState } from 'react';
import { RECITERS, type ReciterId } from '../lib/reciters';
import {
  TOTAL_AYAHS, downloadedUpTo, isOfflineSupported, subscribeAudioStore,
} from '../lib/audioStore';
import {
  getDownloadState, startDownload, pauseDownload, removeDownload,
  subscribeDownloads, estimatedTotalBytes, formatBytes,
} from '../lib/audioDownloads';
import { settingCard, cardTitle } from './ReadingSettings';
import { Download, Trash, CheckCircle, Pause } from './icons';

/** Перерисовка на любое изменение реестра или прогресса загрузки. */
function useDownloadsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    const un1 = subscribeAudioStore(bump);
    const un2 = subscribeDownloads(bump);
    return () => { un1(); un2(); };
  }, []);
  return tick;
}

export function OfflineAudioCard() {
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
          margin: 0,
          fontSize: '12px',
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}>
          В браузере чтение идёт стримом. Скачать все суры на устройство
          можно в приложении для iPhone и Android.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {RECITERS.map(r => <ReciterRow key={r.id} id={r.id} label={r.label} />)}
          <p style={{
            margin: 0,
            fontSize: '11px',
            lineHeight: 1.45,
            color: 'var(--text-tertiary)',
          }}>
            Полная запись одного чтеца — примерно {formatBytes(estimatedTotalBytes())}.
            Качать лучше по Wi-Fi. Загрузку можно прервать и продолжить позже
            с того же места.
          </p>
        </div>
      )}
    </section>
  );
}

function ReciterRow({ id, label }: { id: ReciterId; label: string }) {
  const st = getDownloadState(id);
  // done из реестра, а не из state: реестр — источник истины и
  // переживает перезапуск приложения, а state обнуляется вместе с
  // модулем.
  const done = Math.max(st.done, downloadedUpTo(id));
  const complete = done >= TOTAL_AYAHS;
  const pct = Math.round((done / TOTAL_AYAHS) * 100);
  const running = st.status === 'running';

  const action = running
    ? { label: 'Пауза',   icon: <Pause size={16} />,       onClick: () => pauseDownload(id) }
    : complete
    ? { label: 'Удалить', icon: <Trash size={16} />,       onClick: () => { void removeDownload(id); } }
    : { label: done > 0 ? 'Продолжить' : 'Скачать',
        icon: <Download size={16} />,                      onClick: () => { void startDownload(id); } };

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: '12.5px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>

        {complete && !running && (
          <span
            aria-hidden
            style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}
          >
            <CheckCircle size={15} />
          </span>
        )}

        <button
          onClick={action.onClick}
          aria-label={`${action.label} — ${label}`}
          title={action.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            minHeight: '30px',
            padding: '0 10px',
            borderRadius: '8px',
            border: '1px solid var(--hairline-strong)',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '11.5px',
            fontWeight: 500,
          }}
        >
          {action.icon}
          {action.label}
        </button>
      </div>

      {/* Полоса прогресса — рисуем только пока есть что показывать,
          иначе пустой жёлоб на нетронутом чтеце выглядит как ошибка. */}
      {(running || (done > 0 && !complete)) && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TOTAL_AYAHS}
          aria-valuenow={done}
          style={{
            height: '3px',
            borderRadius: '2px',
            background: 'var(--hairline)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--text-primary)',
            opacity: 0.7,
            transition: 'width 240ms ease',
          }} />
        </div>
      )}

      <span style={{
        fontSize: '11px',
        color: st.status === 'error' ? '#e0654a' : 'var(--text-tertiary)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.35,
      }}>
        {st.status === 'error'
          ? st.error
          : complete
          ? 'Все суры на устройстве'
          : done > 0
          ? `${done} из ${TOTAL_AYAHS} аятов · ${pct}%` +
            (st.bytes > 0 ? ` · ${formatBytes(st.bytes)} за сессию` : '')
          : 'Не скачано — играет стримом'}
      </span>
    </div>
  );
}
