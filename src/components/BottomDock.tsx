import { SkipBack, SkipForward, Play as PlayIc, Pause as PauseIc, Close as CloseIc } from './icons';

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

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
};

/**
 * Floating audio dock — appears only when an ayah is queued/playing.
 * Minimal layout: [speed] [prev] [play/pause] [next] [×]   with a 2px
 * progress hairline pinned to the bottom edge of the pill.
 */
export function BottomDock({
  audioState, progress = 0, playbackRate = 1,
  onPlayPause, onPrev, onNext, onCyclePlaybackRate, onClose,
}: Props) {
  const playing = audioState === 'playing';
  const loading = audioState === 'loading';
  const pct = Math.min(1, Math.max(0, progress));

  return (
    <div
      role="region"
      aria-label="Audio player"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        transition: 'transform 0.25s ease',
        zIndex: 25,
        height: '76px',
        background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
        border: '1px solid var(--hairline)',
        borderRadius: '9999px',
        boxShadow: 'rgba(0,0,0,0.04) 0 1px 2px, rgba(0,0,0,0.12) 0 14px 36px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 14px',
        backdropFilter: 'saturate(160%) blur(20px)',
        WebkitBackdropFilter: 'saturate(160%) blur(20px)',
        maxWidth: 'min(96vw, 400px)',
        overflow: 'hidden',
      }}
    >
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
            // Driven every frame by useAyahAudio's rAF loop — no CSS transition
            // here, otherwise the easing fights with per-frame writes and the
            // bar visibly judders.
            width: `${pct * 100}%`,
            background: 'var(--ink, var(--text-primary))',
            willChange: 'width',
          }}
        />
      </div>

      {/* Playback rate cycler — replaces the old repeat toggle. Shows the
          current rate as a tabular-num pill ("0.75×", "1×", "1.25×") and
          rotates through the three values on tap. data-active when off
          1.0 so the user can glance and see "I'm in non-default mode". */}
      <DockBtn
        aria-label={`Скорость ${playbackRate}×`}
        title={`Скорость ${playbackRate}×`}
        onClick={onCyclePlaybackRate}
        data-active={playbackRate !== 1}
      >
        <span style={{
          fontSize: '12px',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}>
          {playbackRate === 1 ? '1×' : `${playbackRate}×`}
        </span>
      </DockBtn>

      <DockBtn aria-label="Previous ayah" onClick={onPrev}>
        <SkipBack size={22} />
      </DockBtn>

      {/* Play / pause — used to be a 56 px filled-ink CTA that visually
          dominated the dock and pulled the eye away from the surah. The
          user reads the verse, the player is just a control surface, so
          this button now matches the other DockBtns: same 48 px, no
          filled background, just text-secondary. Slight emphasis when
          playing (data-active) so the state stays glanceable. */}
      <DockBtn
        onClick={onPlayPause}
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={loading}
        data-active={playing}
        style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
      >
        {playing ? <PauseIc size={22} /> : <PlayIc size={22} />}
      </DockBtn>

      <DockBtn aria-label="Next ayah" onClick={onNext}>
        <SkipForward size={22} />
      </DockBtn>

      <DockBtn aria-label="Stop audio" onClick={onClose}>
        <CloseIc size={20} />
      </DockBtn>
    </div>
  );
}

function DockBtn({
  children, style, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode; 'data-active'?: boolean }) {
  const active = (rest as { 'data-active'?: boolean })['data-active'];
  return (
    <button
      {...rest}
      style={{
        width: '48px', height: '48px',
        borderRadius: '9999px',
        border: 'none',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        flexShrink: 0,
        transition: 'color 0.15s ease, background 0.15s ease',
        // Merge caller's style last so per-call overrides (e.g. cursor:
        // wait while loading) win against the base.
        ...style,
      }}
    >
      {children}
    </button>
  );
}
