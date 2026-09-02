/**
 * MiniPlayer — полоска звучащей суры над нижней панелью.
 *
 * ── Зачем ─────────────────────────────────────────────────────────────
 *
 * Плеер в разделах чтения (лента, мусхаф) уже есть — это `BottomDock`. Но
 * на вкладках его нет, и включённая с главного экрана сура звучала «из
 * ниоткуда»: остановить её было негде, вернуться к ней тоже.
 *
 * ── Почему появляется сам, а не живёт кнопкой ─────────────────────────
 *
 * Владелец предлагал добавить на главную кнопку плеера. Кнопка, которая
 * ничего не делает, пока ничего не играет, — это лишний элемент в списке
 * из 114 строк. Полоска появляется, когда звук пошёл, и исчезает, когда
 * его нет: она сама себе объяснение.
 *
 * ── Что здесь НЕ делается ─────────────────────────────────────────────
 *
 * Полоска не подписывается на прогресс и позицию слова. Ей нужны только
 * номер суры и состояние — иначе каждый кадр воспроизведения перерисовывал
 * бы её поверх списка сур.
 */

import { Pause, Play, ICON_SIZE } from './icons';
import { useAudioActions, useAudioState } from '../hooks/AudioProvider';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { reciterById } from '../lib/reciters';
import { GLASS_BLUR } from '../lib/glass';
import { TAB_BAR_HEIGHT } from './TabBar';

export function MiniPlayer({ onOpen }: { onOpen: (surah: number) => void }) {
  const { currentSurah, audioState, reciter } = useAudioState();
  const audio = useAudioActions();

  if (!currentSurah || audioState === 'idle') return null;
  const meta = SURAH_BY_NUMBER[currentSurah];
  const playing = audioState === 'playing';

  return (
    <div
      role="region"
      aria-label="Звучит сейчас"
      className="liquid-glass"
      style={{
        ...GLASS_BLUR,
        position: 'fixed',
        left: '12px',
        right: '12px',
        // Ровно над капсулой вкладок, с тем же зазором: две плавающие
        // панели должны читаться одной стопкой, а не случайной парой.
        bottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_HEIGHT + 6}px)`,
        zIndex: 39,
        maxWidth: '560px',
        margin: '0 auto',
        height: '52px',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-tight)',
        padding: '0 var(--space-tight) 0 var(--space-snug)',
        boxSizing: 'border-box',
      }}
    >
      <button
        onClick={() => onOpen(currentSurah)}
        aria-label={`Открыть суру ${meta?.transliteration ?? currentSurah}`}
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          gap: '1px',
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          maxWidth: '100%',
          fontSize: 'var(--font-caption1)',
          lineHeight: 'var(--leading-caption1)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta?.transliteration ?? `Сура ${currentSurah}`}
        </span>
        <span style={{
          maxWidth: '100%',
          fontSize: 'var(--font-caption2)',
          lineHeight: 'var(--leading-caption2)',
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {reciterById(reciter).label}
        </span>
      </button>

      <button
        onClick={() => {
          if (playing) audio.pause();
          else if (meta) audio.playFrom(currentSurah, 1, meta.ayahs, audio.currentMode());
        }}
        aria-label={playing ? 'Пауза' : 'Продолжить'}
        className="icon-btn"
        style={{
          flexShrink: 0,
          width: 'var(--hit-min)', height: 'var(--hit-min)',
          color: 'var(--text-primary)',
        }}
      >
        {playing ? <Pause size={ICON_SIZE.md} /> : <Play size={ICON_SIZE.md} />}
      </button>
    </div>
  );
}
