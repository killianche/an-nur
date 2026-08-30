import { SkipBack, SkipForward, Play as PlayIc, Pause as PauseIc, Close as CloseIc } from './icons';

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

/** Размер глифа плеера — ступень `--icon-dock` из общей шкалы.  Иконки
 *  принимают размер числом, поэтому значение дублируется здесь и в
 *  CSS-токене; менять их нужно вместе.  Крестик «закрыть» раньше был на
 *  два пикселя мельче остальных без причины. */
const DOCK_ICON = 22;

type Props = {
  audioState: AudioState;
  currentAyah: number | null;
  totalAyahs?: number;
  /** 0..1 — playback progress within the current ayah; resets on each new ayah. */
  progress?: number;
  /** Current playback rate (0.75 / 1.0 / 1.25). Shown as a pill in the dock. */
  playbackRate?: number;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCyclePlaybackRate: () => void;
  onClose: () => void;
  /** Floating over the reader, or embedded in another surface (Mushaf sheet). */
  layout?: 'floating' | 'inline';
  /** Compact verse marker shown only in the embedded Mushaf player. */
  inlineLabel?: React.ReactNode;
};

/**
 * Floating audio dock — appears only when an ayah is queued/playing.
 * Minimal layout: [speed] [prev] [play/pause] [next] [×]   with a 2px
 * progress hairline pinned to the bottom edge of the pill.
 */
export function BottomDock({
  audioState, progress = 0, playbackRate = 1,
  onPlayPause, onPrev, onNext, onCyclePlaybackRate, onClose,
  layout = 'floating', inlineLabel,
}: Props) {
  const playing = audioState === 'playing';
  const loading = audioState === 'loading';
  const pct = Math.min(1, Math.max(0, progress));
  const inline = layout === 'inline';

  return (
    <div
      role="region"
      aria-label="Audio player"
      style={{
        position: inline ? 'relative' : 'fixed',
        left: inline ? undefined : '50%',
        bottom: inline
          ? undefined
          : 'max(var(--space-margin), env(safe-area-inset-bottom))',
        transform: inline ? undefined : 'translateX(-50%)',
        zIndex: inline ? undefined : 25,
        height: inline ? '48px' : '76px',
        background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
        border: '1px solid var(--hairline)',
        borderRadius: inline ? 'var(--radius-card)' : 'var(--radius-pill)',
        boxShadow: 'rgba(0,0,0,0.04) 0 1px 2px, rgba(0,0,0,0.12) 0 14px 36px',
        display: 'flex',
        alignItems: 'center',
        gap: inline ? 'var(--space-hair)' : 'var(--space-snug)',
        padding: inline ? '0 var(--space-tight)' : '0 var(--space-cozy)',
        // Общее для всей навигации значение размытия вместо собственных
        // 20px — плеер, шапка и вкладки должны быть из одного материала.
        backdropFilter: 'saturate(var(--saturate-chrome)) blur(var(--blur-chrome))',
        WebkitBackdropFilter: 'saturate(var(--saturate-chrome)) blur(var(--blur-chrome))',
        width: inline ? '100%' : undefined,
        maxWidth: inline ? 'none' : 'min(96vw, 400px)',
        justifyContent: inline ? 'space-between' : undefined,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {inline && inlineLabel && (
        <span style={{
          minWidth: 'var(--hit-min)',
          padding: 'var(--space-tight) var(--space-snug)',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--hairline)', color: 'var(--text-secondary)',
          fontSize: 'var(--font-caption2)',
          fontWeight: 'var(--weight-semibold)', textAlign: 'center',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          flexShrink: 0,
        }}>
          {inlineLabel}
        </span>
      )}
      {/* Progress hairline — bottom edge of the pill, clipped by overflow:hidden */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: '2px',
          background: 'var(--hairline-soft)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            // useAyahAudio обновляет значение с умеренной частотой — без CSS
            // transition, чтобы easing не догонял каждую новую точку.
            width: `${pct * 100}%`,
            background: 'var(--ink, var(--text-primary))',
            willChange: 'width',
          }}
        />
      </div>

      {/* Playback rate cycler — shows the current value without a filled
          active background: the number itself is enough to communicate
          the non-default speed and does not compete with Play/Pause. */}
      <DockBtn
        compact={inline}
        aria-label={`Скорость ${playbackRate}×`}
        title={`Скорость ${playbackRate}×`}
        onClick={onCyclePlaybackRate}
      >
        <span style={{
          fontSize: 'var(--font-caption1)',
          fontWeight: 'var(--weight-semibold)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 'var(--tracking-tight)',
          // lineHeight: 1 — глиф центрируется флексом самой кнопки,
          // ступень межстрочного здесь только сдвинула бы его вниз.
          lineHeight: 1,
        }}>
          {playbackRate === 1 ? '1×' : `${playbackRate}×`}
        </span>
      </DockBtn>

      <DockBtn compact={inline} aria-label="Previous ayah" onClick={onPrev}>
        <SkipBack size={DOCK_ICON} />
      </DockBtn>

      {/* Play / pause — used to be a 56 px filled-ink CTA that visually
          dominated the dock and pulled the eye away from the surah. The
          user reads the verse, the player is just a control surface, so
          this button now matches the other DockBtns: same 48 px, no
          filled background, just text-secondary. Slight emphasis when
          playing (data-active) so the state stays glanceable. */}
      <DockBtn
        compact={inline}
        onClick={onPlayPause}
        aria-label={loading ? 'Загрузка аята' : playing ? 'Pause' : 'Play'}
        disabled={loading}
        data-active={playing}
        style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
      >
        {loading
          ? <AudioSpinner size={DOCK_ICON} />
          : playing
            ? <PauseIc size={DOCK_ICON} />
            : <PlayIc size={DOCK_ICON} />}
      </DockBtn>

      <DockBtn compact={inline} aria-label="Next ayah" onClick={onNext}>
        <SkipForward size={DOCK_ICON} />
      </DockBtn>

      <DockBtn compact={inline} aria-label="Закрыть плеер" onClick={onClose}>
        <CloseIc size={DOCK_ICON} />
      </DockBtn>
    </div>
  );
}

/** Shared loading state for every ayah play button. */
export function AudioSpinner({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden
      data-audio-spinner
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: '2px solid color-mix(in srgb, currentColor 24%, transparent)',
        borderTopColor: 'currentColor',
        animation: 'audio-spinner 0.75s linear infinite',
        boxSizing: 'border-box',
      }}
    />
  );
}

function DockBtn({
  children, style, compact = false, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  compact?: boolean;
  'data-active'?: boolean;
}) {
  const active = (rest as { 'data-active'?: boolean })['data-active'];
  return (
    <button
      {...rest}
      // Класс держит прозрачный «доводчик» зоны касания до 44×44 —
      // компактный вариант кнопки нарисован 40×40 (столько даёт высота
      // встроенного плеера), а это меньше рекомендованного Apple
      // минимума.  Видимый кружок и фон нажатия остаются прежними.
      className="dock-btn"
      style={{
        width: compact ? '40px' : '48px', height: compact ? '40px' : '48px',
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        flexShrink: 0,
        transition:
          'color var(--dur-fast) var(--ease-standard),'
          + ' background var(--dur-fast) var(--ease-standard)',
        // Merge caller's style last so per-call overrides (e.g. cursor:
        // wait while loading) win against the base.
        ...style,
      }}
    >
      {children}
    </button>
  );
}
