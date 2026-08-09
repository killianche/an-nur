/**
 * AyahGlowLayer — Layer 2 of the karaoke "glow" highlight.
 *
 * Renders a single `<span data-ayah-glow>` positioned absolutely inside
 * the ayah container, sized 1.8× the active word's bbox and centred on
 * it. The actual gradient + breathing animation live in index.css; this
 * file only computes geometry and renders the wrapper.
 *
 * Why the 1.8× scale: the dome should bleed past the word edges so the
 * gradient's transparent fade lands outside the letters. At 1.0× the
 * gradient stops cut visibly at the bbox edge; 1.5–2.0× looks soft. 1.8
 * is the spec value.
 *
 * The component is intentionally a no-op when `box` is null. Caller
 * (useAyahGlow) returns null in color mode, when highlight is disabled,
 * when no ayah is active, or before refs mount — so the layer simply
 * isn't in the DOM in those states.
 */

import type { WordBox } from '../hooks/useAyahGlow';

const SCALE = 1.8;

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const DURATION = '360ms';

export function AyahGlowLayer({ box }: { box: WordBox | null }) {
  if (!box) return null;

  const width  = box.width  * SCALE;
  const height = box.height * SCALE;
  const left   = box.left + box.width  * 0.5 - width  / 2;
  const top    = box.top  + box.height * 0.5 - height / 2;

  return (
    <span
      aria-hidden="true"
      data-ayah-glow=""
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        // Smooth slide from word-N's dome to word-N+1's dome — keeps the
        // user's eye following the same shape instead of cutting between
        // hard stops. 360ms matches the spec; the ease curve is a
        // material-ish overshoot for an organic "settle".
        transition:
          `left ${DURATION} ${EASE}, ` +
          `top ${DURATION} ${EASE}, ` +
          `width ${DURATION} ${EASE}, ` +
          `height ${DURATION} ${EASE}`,
      }}
    />
  );
}
