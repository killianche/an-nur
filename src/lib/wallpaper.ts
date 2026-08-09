/**
 * wallpaper — photo backdrops for the reading themes.
 *
 * Stores the active wallpaper id in localStorage and projects it onto two
 * CSS custom properties on `:root`:
 *   --wallpaper-image  — `url("…")` of the photo, or `none`
 *   --wallpaper-scrim  — translucent overlay tuned per-photo so the
 *                        ayah text stays readable on top
 * plus a `data-wallpaper` attribute on `<html>` used by the index.css
 * selectors that paint the fixed-position layer behind everything.
 *
 * Wallpaper is orthogonal to the theme: presets set both
 * (e.g. "moss" picks `dark-soft` as the text-colour base and turns
 * the moss photo on; light/cosmic presets call setWallpaper('none')
 * so switching back cleans up).
 */

export type WallpaperId = 'none' | 'moss' | 'sky' | 'clouds';

const KEY = 'wallpaper';

const WALLPAPER_URL: Record<Exclude<WallpaperId, 'none'>, string> = {
  moss:   '/wallpapers/moss.jpg',
  sky:    '/wallpapers/sky.jpg',
  clouds: '/wallpapers/clouds.jpg',
};

// Per-photo scrim — the photo's average luminance determines whether we
// darken (moss/clouds — keep white text on a busy mid-tone surface) or
// lighten (sky — keep dark text on the pale-blue cloud field). Values
// tuned against the secondary body-copy colours of each preset's base
// theme (--body in dark-soft / dark-slate is mid-grey, not pure white,
// so the scrim has to push the photo's bright highlights down enough
// that the muted translation lines don't dissolve into the leaf/cloud
// texture). Sky scrim stays light because the base is light-white and
// the ink colour is true black — plenty of contrast already.
const WALLPAPER_SCRIM: Record<Exclude<WallpaperId, 'none'>, string> = {
  moss:   'rgba(0, 0, 0, 0.46)',
  sky:    'rgba(255, 255, 255, 0.18)',
  clouds: 'rgba(0, 0, 0, 0.42)',
};

export function getWallpaper(): WallpaperId {
  const v = localStorage.getItem(KEY);
  if (v === 'moss' || v === 'sky' || v === 'clouds') return v;
  return 'none';
}

export function applyWallpaper(id: WallpaperId = getWallpaper()): void {
  const root = document.documentElement;
  if (id === 'none') {
    root.removeAttribute('data-wallpaper');
    root.style.removeProperty('--wallpaper-image');
    root.style.removeProperty('--wallpaper-scrim');
    return;
  }
  root.setAttribute('data-wallpaper', id);
  root.style.setProperty('--wallpaper-image', `url("${WALLPAPER_URL[id]}")`);
  root.style.setProperty('--wallpaper-scrim', WALLPAPER_SCRIM[id]);
}

export function setWallpaper(id: WallpaperId): void {
  localStorage.setItem(KEY, id);
  applyWallpaper(id);
}
