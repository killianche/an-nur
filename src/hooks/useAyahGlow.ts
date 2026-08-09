/**
 * useAyahGlow — measure the bbox of the currently-active word inside an
 * ayah container, so the AyahGlowLayer component can render a position-
 * absolute radial-gradient "dome" exactly over it.
 *
 * Why a separate hook (not inlined into each rendering component):
 *   QcfAyahLine, V2AyahLine, TextAyahLine all need the exact same logic
 *   (ref + measure + rAF-throttle + ResizeObserver + fonts.ready). The
 *   only differences between them are how words are split (PUA glyph
 *   vs Unicode whitespace) and how the font is loaded — once words are
 *   rendered with refs, the geometry math is identical.
 *
 * Active mode (color vs glow) is read from lib/audioPrefs.ts and the
 * hook subscribes to `audio-prefs-changed` so it can short-circuit in
 * color mode — no observers, no measure, no extra work. Measuring 50+
 * word boxes per scroll frame would tank scroll perf on Snapdragon 4xx
 * if we didn't gate it.
 *
 * Return value: the bbox of the active word relative to the container
 * (left/top/width/height in CSS px), or null when:
 *   - highlight is disabled
 *   - style is 'color'
 *   - no ayah is currently active
 *   - the active word ref hasn't mounted yet
 *
 * Callers pass a stable wordRefs array (the rendering component owns it
 * and writes refs during render). The hook does NOT mutate it.
 */

import { useEffect, useState, type RefObject } from 'react';
import {
  getHighlightEnabled,
  getEffectiveHighlightStyle,
  subscribeAudioPrefs,
} from '../lib/audioPrefs';

export type WordBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Args = {
  /** The ayah's outer container (position:relative). All boxes are
   *  measured relative to this element's bounding rect. */
  containerRef: RefObject<HTMLElement | null>;
  /** Refs to each word's <span>, indexed 0..N-1 (NOT 1-based). Length
   *  equals the word count of the ayah. Stable across renders — the
   *  rendering component creates it with useRef and refills slots in
   *  the map callback. */
  wordRefs: RefObject<Array<HTMLSpanElement | null>>;
  /** 1-based position of the currently-recited word, or null if no
   *  audio is playing for this ayah. */
  activeWordPos: number | null;
  /** Whether this ayah is the active one. When false, hook returns
   *  null without measuring. */
  isActive: boolean;
  /** Number of words in the ayah — used as the measurement-deps key.
   *  Pass words.length from the renderer. */
  wordCount: number;
  /** Font-size in px — passed as a deps key so re-measuring kicks in
   *  when the user changes the scale slider (boxes shift). */
  fontSize: number;
};

export function useAyahGlow({
  containerRef,
  wordRefs,
  activeWordPos,
  isActive,
  wordCount,
  fontSize,
}: Args): WordBox | null {
  // Local mirror of audioPrefs so a settings change re-runs the effect
  // and either starts/stops measuring (no prop drilling). We use the
  // *effective* style here (not the raw user pref) — on light themes
  // glow is force-resolved to color, and we don't want to measure word
  // boxes for a dome that CSS is going to hide. applyHighlightVars()
  // dispatches the prefs-changed event whenever the effective style
  // flips (e.g. on theme switch), so this hook re-reads correctly.
  const [mode, setMode] = useState<'on' | 'off'>(() =>
    getHighlightEnabled() && getEffectiveHighlightStyle() === 'glow' ? 'on' : 'off',
  );
  useEffect(() => {
    return subscribeAudioPrefs(() => {
      const next =
        getHighlightEnabled() && getEffectiveHighlightStyle() === 'glow' ? 'on' : 'off';
      setMode(prev => (prev === next ? prev : next));
    });
  }, []);

  const [boxes, setBoxes] = useState<WordBox[]>([]);

  useEffect(() => {
    // Color mode (or disabled): no measuring, no observers — release any
    // boxes we had so AyahGlowLayer renders nothing and React stays
    // tidy if the user toggles modes repeatedly.
    if (mode === 'off') {
      if (boxes.length > 0) setBoxes([]);
      return;
    }

    const cont = containerRef.current;
    if (!cont) return;

    const measure = () => {
      const cRect = cont.getBoundingClientRect();
      const refs = wordRefs.current ?? [];
      const next: WordBox[] = [];
      for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        if (!ref) {
          // Preserve indexing — push a zero-box placeholder so position
          // N in wordBoxes always maps to word position N+1.
          next.push({ left: 0, top: 0, width: 0, height: 0 });
          continue;
        }
        const r = ref.getBoundingClientRect();
        next.push({
          left:   r.left - cRect.left,
          top:    r.top  - cRect.top,
          width:  r.width,
          height: r.height,
        });
      }
      setBoxes(next);
    };

    measure();

    // rAF-throttle: scroll / ResizeObserver / fonts.ready can fire
    // 60–3000×/sec; collapse them into one measure per animation frame
    // so we don't thrash layout on bottom-end Android (see spec §10).
    let rafPending = 0;
    const schedule = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = 0;
        measure();
      });
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(cont);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);

    // Web-fonts can finish loading after first paint; bbox shifts when
    // the real face replaces the system fallback. fonts.ready resolves
    // once all currently-requested fonts are loaded (or fails, which
    // we swallow — the initial measure() already ran with whatever was
    // available).
    let cancelled = false;
    const docFonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (docFonts && typeof docFonts.ready?.then === 'function') {
      docFonts.ready.then(() => { if (!cancelled) measure(); }).catch(() => {});
    }

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', schedule);
      if (rafPending) cancelAnimationFrame(rafPending);
    };
    // boxes intentionally NOT in deps — we set it from inside, including
    // it would create a measure loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, containerRef, wordRefs, wordCount, fontSize]);

  if (mode === 'off' || !isActive || activeWordPos == null) return null;
  const idx = activeWordPos - 1;
  if (idx < 0 || idx >= boxes.length) return null;
  const b = boxes[idx];
  // Guard against the placeholder zero-box (word ref hadn't mounted at
  // measure time) — returning a zero-sized dome looks like a glitch
  // flash, better to render nothing for one frame.
  if (b.width === 0 || b.height === 0) return null;
  return b;
}
