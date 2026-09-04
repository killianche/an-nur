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
 * ── Управление прямо в полоске ────────────────────────────────────────
 *
 * Владелец попросил не гонять его в полный плеер ради паузы и соседнего
 * аята. Поэтому здесь есть переход по аятам, пауза и скорость — всё, что
 * нужно на ходу, в один тап.
 *
 * Смена чтеца сюда НЕ вынесена намеренно. Полоска высотой 52 px уже несёт
 * четыре органа управления и название; пятый превратил бы её в панель
 * кнопок, где промахиваешься мимо нужной. Чтец меняется тапом по названию —
 * это открывает полный плеер, где он и живёт, — и ещё кнопкой «Аа» в
 * полноэкранном мусхафе.
 *
 * ── Что здесь НЕ делается ─────────────────────────────────────────────
 *
 * Полоска не подписывается на прогресс и позицию слова. Ей нужны только
 * номер суры и состояние — иначе каждый кадр воспроизведения перерисовывал
 * бы её поверх списка сур.
 */

import { useEffect } from 'react';
import { Pause, Play, SkipBack, SkipForward, ICON_SIZE } from './icons';
import { useAudioActions, useAudioState } from '../hooks/AudioProvider';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { reciterById } from '../lib/reciters';
import { GLASS_BLUR } from '../lib/glass';
import { TAB_BAR_HEIGHT } from './TabBar';

/** Высота полоски и её зазор до панели вкладок. */
const HEIGHT = 52;
const GAP = 6;

export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const { currentSurah, currentAyah, audioState, reciter, playbackRate } = useAudioState();
  const audio = useAudioActions();

  // Полоска перекрывает низ экрана, а её высота известна только ей. Чтобы
  // последняя строка списка не пряталась под ней, она объявляет занятое
  // место переменной, а экраны вкладок добавляют его к своему отступу.
  // Иначе во время чтения сура 114 наполовину уходила под панель.
  const visible = Boolean(currentSurah) && audioState !== 'idle';
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty('--mini-player-space', `${HEIGHT + GAP}px`);
    else root.style.removeProperty('--mini-player-space');
    return () => { root.style.removeProperty('--mini-player-space'); };
  }, [visible]);

  if (!visible || !currentSurah) return null;
  const meta = SURAH_BY_NUMBER[currentSurah];
  const playing = audioState === 'playing';
  const loading = audioState === 'loading';

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
        bottom: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_HEIGHT + GAP}px)`,
        zIndex: 39,
        maxWidth: '560px',
        margin: '0 auto',
        height: `${HEIGHT}px`,
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '0 var(--space-tight) 0 var(--space-snug)',
        boxSizing: 'border-box',
      }}
    >
      <button
        onClick={onOpen}
        aria-label={`Открыть плеер: ${meta?.transliteration ?? currentSurah}`}
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
        onClick={() => audio.prev()}
        aria-label="Предыдущий аят"
        className="icon-btn"
        style={{ flexShrink: 0, width: '40px', height: '40px', color: 'var(--text-secondary)' }}
      >
        <SkipBack size={ICON_SIZE.sm} />
      </button>

      <button
        disabled={loading}
        onClick={() => {
          // Во время загрузки кнопка не работает: повторный тап запускал бы
          // воспроизведение заново поверх ещё не начавшегося.
          if (loading) return;
          if (playing) audio.pause();
          // Продолжаем с ТЕКУЩЕГО аята, а не с первого. Единица тут —
          // аят, и `1` вместо него означала бы «начать суру заново»:
          // человек ставил паузу на сороковом аяте, а получал первый.
          else if (meta) {
            audio.playFrom(currentSurah, currentAyah ?? 1, meta.ayahs, audio.currentMode());
          }
        }}
        aria-label={loading ? 'Загрузка' : playing ? 'Пауза' : 'Продолжить'}
        className="icon-btn"
        style={{
          flexShrink: 0,
          width: '44px', height: '44px',
          color: 'var(--text-primary)',
          opacity: loading ? 0.45 : 1,
        }}
      >
        {playing ? <Pause size={ICON_SIZE.md} /> : <Play size={ICON_SIZE.md} />}
      </button>

      <button
        onClick={() => audio.next()}
        aria-label="Следующий аят"
        className="icon-btn"
        style={{ flexShrink: 0, width: '40px', height: '40px', color: 'var(--text-secondary)' }}
      >
        <SkipForward size={ICON_SIZE.sm} />
      </button>

      <button
        onClick={() => audio.cyclePlaybackRate()}
        aria-label={`Скорость ${playbackRate}×, изменить`}
        style={{
          flexShrink: 0,
          minWidth: '46px', height: '30px',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--hairline)',
          background: 'rgb(var(--ink-rgb) / 0.04)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: 'var(--font-caption2)',
          fontVariantNumeric: 'tabular-nums',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {playbackRate}×
      </button>

    </div>
  );
}
