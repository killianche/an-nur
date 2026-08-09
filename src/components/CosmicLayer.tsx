/**
 * CosmicLayer — composite backdrop for the cosmic theme.
 *
 * Three optional layers stack inside one full-screen `aria-hidden` div:
 *   1. Stars  (CosmicWarp = canvas 3D-flight, OR StarsTwinkle = static
 *              twinkling field). Picked by `cosmic.stars.mode`.
 *   2. Aurora (single DOM-element drift over a chosen palette).
 *
 * The container uses `isolation: isolate` + `contain: paint` so the
 * blend tree is settled inside this layer — without it iOS Safari
 * recomposites the page on every scroll tick and the prose above stutters.
 *
 * The whole thing is gated by `themeMode === 'cosmic'` upstream
 * (see App.tsx). When the user switches to light/dark this component
 * just doesn't render — no opacity fade, no DOM cost.
 */

import { useEffect, useState } from 'react';
import { Aurora } from './Aurora';
import { CosmicWarp } from './CosmicWarp';
import { StarsTwinkle } from './StarsTwinkle';
import {
  isStarsEnabled, getStarsMode, getStarsSpeed, getStarsTwinkleDensity,
  isAuroraEnabled, getAuroraBrightness, getAuroraPalette, getAuroraDirection,
  STARS_TWINKLE_COUNTS, AURORA_PALETTES,
} from '../lib/cosmic';

const COSMIC_CHANGED_EVENT = 'cosmic-changed';

/** Fire this from any setter in lib/cosmic.ts to make CosmicLayer pick up
 *  the new value without a parent re-render. */
export function dispatchCosmicChanged() {
  window.dispatchEvent(new Event(COSMIC_CHANGED_EVENT));
}

export function CosmicLayer() {
  const [starsOn,        setStarsOn]        = useState<boolean>(isStarsEnabled);
  const [starsMode,      setStarsMode]      = useState(getStarsMode);
  const [starsSpeed,     setStarsSpeed]     = useState<number>(getStarsSpeed);
  const [twinkleDensity, setTwinkleDensity] = useState(getStarsTwinkleDensity);
  const [auroraOn,       setAuroraOn]       = useState<boolean>(isAuroraEnabled);
  const [brightness,     setBrightness]     = useState<number>(getAuroraBrightness);
  const [palette,        setPalette]        = useState(getAuroraPalette);
  const [direction,      setDirection]      = useState(getAuroraDirection);

  useEffect(() => {
    const refresh = () => {
      setStarsOn(isStarsEnabled());
      setStarsMode(getStarsMode());
      setStarsSpeed(getStarsSpeed());
      setTwinkleDensity(getStarsTwinkleDensity());
      setAuroraOn(isAuroraEnabled());
      setBrightness(getAuroraBrightness());
      setPalette(getAuroraPalette());
      setDirection(getAuroraDirection());
    };
    window.addEventListener(COSMIC_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh); // cross-tab
    return () => {
      window.removeEventListener(COSMIC_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Project the aurora palette onto the karaoke-highlight CSS var so the
  // active word lights up in the same colour as the sky. The default
  // text-shadow rule in index.css falls through to a neutral ink glow when
  // this variable is absent (light/dark themes), so untheming is automatic
  // — when CosmicLayer unmounts it leaves the var dangling but no element
  // outside cosmic mode references it.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--ayah-word-shadow',
      AURORA_PALETTES[palette].wordShadow,
    );
    return () => {
      document.documentElement.style.removeProperty('--ayah-word-shadow');
    };
  }, [palette]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        isolation: 'isolate',
        contain: 'paint',
        transform: 'translateZ(0)',
        willChange: 'transform',
        background: '#000',
      }}
    >
      {starsOn && (starsMode === 'twinkle'
        ? <StarsTwinkle count={STARS_TWINKLE_COUNTS[twinkleDensity]} speed={starsSpeed} />
        : <CosmicWarp speed={starsSpeed} />)
      }
      {auroraOn && (
        <Aurora
          brightness={brightness}
          palette={palette}
          direction={direction}
        />
      )}
    </div>
  );
}
