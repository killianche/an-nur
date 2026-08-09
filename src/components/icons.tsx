/**
 * Icon set — Solar / Iconoir family. All 24×24, stroke 1.5, round caps + joins.
 * Refactored to match the SVG sources placed in the project root by the
 * user (ChevronLeft.svg, Filter.svg, Moon.svg, MoreVertical.svg, Pause.svg,
 * Play.svg). Pass `size` to scale, defaults to 22px.
 */

type Props = { size?: number };

const stroke = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

const filled = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
});

export const ChevronLeft = ({ size = 22 }: Props) => (
  <svg {...stroke(size)}>
    <path d="m14.25 4.75-6.19 6.19a1.5 1.5 0 0 0 0 2.12l6.19 6.19" />
  </svg>
);

export const ChevronRight = ({ size = 22 }: Props) => (
  <svg {...stroke(size)}>
    <path d="m9.75 4.75 6.19 6.19a1.5 1.5 0 0 1 0 2.12l-6.19 6.19" />
  </svg>
);

/** ArrowChevronRight — double chevron `≫`, used for "jump to ayah" (fast
 *  forward through the surah to a specific position). Filled glyph. */
export const ArrowChevronRight = ({ size = 22 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    fillRule="evenodd"
    clipRule="evenodd"
    aria-hidden="true"
  >
    <path d="M2 7.25a.75.75 0 0 0 0 1.5h5.69l-2.72 2.72a.75.75 0 1 0 1.06 1.06l4-4a.75.75 0 0 0 0-1.06l-4-4a.75.75 0 0 0-1.06 1.06l2.72 2.72zm7.47 4.22a.75.75 0 1 0 1.06 1.06l4-4a.75.75 0 0 0 0-1.06l-4-4a.75.75 0 1 0-1.06 1.06L12.94 8z" />
  </svg>
);

/** Filter — for "jump to ayah" (filter the list down to a position). */
export const Filter = ({ size = 22 }: Props) => (
  <svg {...stroke(size)}>
    <path d="M4.5 7.25h15M7.385 12h9.23m-6.345 4.75h3.46" />
  </svg>
);

/** Moon — theme toggle / dark mode. */
export const Moon = ({ size = 22 }: Props) => (
  <svg {...stroke(size)} strokeLinecap={undefined as any}>
    <path d="M11.578 3.512a6.307 6.307 0 0 0 8.91 8.91a.45.45 0 0 1 .466-.095c.176.067.29.24.275.428A9.255 9.255 0 1 1 5.461 5.45a9.22 9.22 0 0 1 5.784-2.68a.42.42 0 0 1 .428.275c.06.16.02.34-.095.466Z" />
  </svg>
);

/** MoreVertical — 3 dots, opens contextual menu. */
export const MoreVertical = ({ size = 22 }: Props) => (
  <svg {...filled(size)}>
    <circle cx="12" cy="6"  r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="18" r="1.75" />
  </svg>
);

/** Sparkle — 4-point star + 2 small dots. Used for the "design / reading" entry. */
export const Sparkle = ({ size = 22 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M11.256 3.567c.266-.675 1.222-.675 1.488 0l2.047 5.19a.8.8 0 0 0 .451.452l5.191 2.047c.675.266.675 1.222 0 1.488l-5.19 2.047a.8.8 0 0 0-.452.451l-2.047 5.191c-.266.675-1.222.675-1.488 0l-2.047-5.19a.8.8 0 0 0-.451-.452l-5.191-2.047c-.675-.266-.675-1.222 0-1.488l5.19-2.047a.8.8 0 0 0 .452-.451z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="5.25" cy="5.25" r="1.25" fill="currentColor" />
    <circle cx="19"   cy="19"   r="1"    fill="currentColor" />
  </svg>
);

/** TextLetterSpacing — used for "Jump to ayah" / typographic position. */
export const TextLetterSpacing = ({ size = 22 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path
        strokeLinejoin="round"
        d="m7.6 16.937 1.571-3.781m0 0h5.658m-5.658 0 2.408-5.793c.166-.4.676-.4.842 0l2.408 5.793m0 0 1.571 3.78"
      />
      <path d="M21.25 20.25V3.75m-18.5 16.5V3.75" />
    </g>
  </svg>
);

/** Send — paper-airplane. Reserved for future "share / send" actions. */
export const Send = ({ size = 22 }: Props) => (
  <svg {...stroke(size)}>
    <path d="M14.76 12H6.832m0 0c0-.275-.057-.55-.17-.808L4.285 5.814c-.76-1.72 1.058-3.442 2.734-2.591L20.8 10.217c1.46.74 1.46 2.826 0 3.566L7.02 20.777c-1.677.851-3.495-.872-2.735-2.591l2.375-5.378A2 2 0 0 0 6.83 12" />
  </svg>
);

/** Play — outlined wedge (Play (1) — копия.svg). */
export const Play = ({ size = 20 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M14.642 6.285c1.294.777 1.294 2.653 0 3.43L5.53 15.183c-1.292.775-2.924-.102-3.025-1.571l-.005-.144V2.532l.005-.143C2.605.919 4.238.043 5.53.818zm-.771 2.144a.5.5 0 0 0 0-.857L4.756 2.104A.5.5 0 0 0 4 2.532v10.936a.5.5 0 0 0 .757.429z" />
  </svg>
);

/** Pause — outlined two bars (Pause (1) — копия.svg). */
export const Pause = ({ size = 20 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M5.25 1.5C6.216 1.5 7 2.284 7 3.25v9.5a1.75 1.75 0 0 1-1.75 1.75h-2l-.179-.009A1.75 1.75 0 0 1 1.51 12.93l-.01-.18v-9.5a1.75 1.75 0 0 1 1.571-1.741L3.25 1.5zm7.5 0c.966 0 1.75.784 1.75 1.75v9.5a1.75 1.75 0 0 1-1.75 1.75h-2l-.179-.009A1.75 1.75 0 0 1 9.01 12.93L9 12.75v-9.5a1.75 1.75 0 0 1 1.571-1.741l.179-.009zM3.25 3a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.25.25 0 0 0 .25-.25v-9.5A.25.25 0 0 0 5.25 3zm7.5 0a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25z" />
  </svg>
);

/** ListOrdered — kept around for potential reuse but no longer used in header. */
export const ListOrdered = ({ size = 20 }: Props) => (
  <svg {...stroke(size)}>
    <line x1="10" y1="6"  x2="21" y2="6"  />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);

/** Bookmark — outlined ribbon by default (Bookmark — копия.svg).
 *  isFilled=true switches the fill-rule to nonzero so the inner cutout
 *  fills in, making the same path read as a solid bookmark. */
export const Bookmark = ({ size = 18, isFilled = false }: Props & { isFilled?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    fillRule={isFilled ? 'nonzero' : 'evenodd'}
    clipRule="evenodd"
    aria-hidden
  >
    <path d="m8 9.524l.976.837l2.988 2.56a.325.325 0 0 0 .536-.246V4.5A1.5 1.5 0 0 0 11 3H5a1.5 1.5 0 0 0-1.5 1.5v8.175a.325.325 0 0 0 .536.247l2.988-2.56zM14 4.5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v8.175a1.825 1.825 0 0 0 3.013 1.386L8 11.5l2.987 2.56A1.825 1.825 0 0 0 14 12.676z" />
  </svg>
);

/** ForwardStep — wedge with end-bar on the right (ForwardStep.svg). */
export const SkipForward = ({ size = 20 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M13.75 2a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-1.5 0V2.75a.75.75 0 0 1 .75-.75M1.505 3.632C1.597 2.32 3.079 1.56 4.206 2.295l6.498 4.24a1.75 1.75 0 0 1 0 2.93l-6.498 4.24l-.11.066c-1.111.62-2.502-.134-2.591-1.404l-.005-.129V3.761zM3 12.238c0 .199.22.319.387.21L9.884 8.21a.25.25 0 0 0 0-.419L3.387 3.552A.25.25 0 0 0 3 3.76z" />
  </svg>
);

/** BackwardStep — wedge with end-bar on the left (BackwardStep.svg). */
export const SkipBack = ({ size = 20 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M2.25 2a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 2.25 2M13 3.896a.25.25 0 0 0-.384-.212l-6.48 4.105a.25.25 0 0 0 0 .422l6.48 4.106a.25.25 0 0 0 .384-.21zm1.5 8.21l-.005.127c-.09 1.303-1.553 2.066-2.681 1.351L5.333 9.479a1.75 1.75 0 0 1 0-2.958l6.48-4.104l.11-.064c1.112-.601 2.485.154 2.572 1.415l.005.128z" />
  </svg>
);

/** Close — CloseBold.svg: bold filled X. */
export const Close = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" aria-hidden>
    <path d="M195.2 195.2a64 64 0 0 1 90.5 0L512 421.5l226.3-226.3a64 64 0 0 1 90.5 90.5L602.5 512l226.3 226.3a64 64 0 0 1-90.5 90.5L512 602.5L285.7 828.8a64 64 0 0 1-90.5-90.5L421.5 512L195.2 285.7a64 64 0 0 1 0-90.5" />
  </svg>
);

export const Search = ({ size = 18 }: Props) => (
  <svg {...stroke(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

/** SquareBracketsLetterA — outlined "[A]" letter selector for jump-by-position. */
export const SquareBracketsLetterA = ({ size = 22 }: Props) => (
  <svg {...stroke(size)}>
    <path d="M7 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h2" />
    <path d="M17 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2" />
    <path d="m9.25 15 2.75-7 2.75 7" />
    <path d="M10.1 12.5h3.8" />
  </svg>
);

/** Palette — outlined artist palette (Lucide-style). */
export const Palette = ({ size = 22 }: Props) => (
  <svg {...stroke(size)}>
    <path d="M12 22a9.96 9.96 0 0 1-7.07-2.93 9.96 9.96 0 0 1 0-14.14A9.96 9.96 0 0 1 12 2a9.96 9.96 0 0 1 7.07 2.93 9.96 9.96 0 0 1 0 14.14C18 21 15 21.5 13 21.5c-1 0-1.5-.5-1.5-1.5 0-1 .5-1.5 1.5-1.5 1 0 1.5-.5 1.5-1.5 0-1-.5-1.5-1.5-1.5z" />
    <circle cx="7"  cy="13" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="9"  cy="7"  r="1.25" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7"  r="1.25" fill="currentColor" stroke="none" />
    <circle cx="17" cy="13" r="1.25" fill="currentColor" stroke="none" />
  </svg>
);

/** RotateLeft — loop / repeat. From ArrowsRotateLeft.svg. */
export const RotateLeft = ({ size = 20 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" fillRule="evenodd" clipRule="evenodd" aria-hidden>
    <path d="M8 1.5a6.5 6.5 0 0 1 6.445 5.649a.75.75 0 1 1-1.488.194A5.001 5.001 0 0 0 4.43 4.5h1.32a.75.75 0 0 1 0 1.5h-3A.75.75 0 0 1 2 5.25v-3a.75.75 0 1 1 1.5 0v1.06A6.48 6.48 0 0 1 8 1.5m5.25 13a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-3a.75.75 0 1 0 0 1.5h1.32a5.001 5.001 0 0 1-8.528-2.843a.75.75 0 1 0-1.487.194a6.501 6.501 0 0 0 10.945 3.84v1.059c0 .414.336.75.75.75" />
  </svg>
);

/** Microphone — used to badge the "Чтец" (reciter) settings tab so the
 *  tab pair reads as Text-vs-Voice rather than two equally generic
 *  word labels. */
export const Microphone = ({ size = 16 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);
