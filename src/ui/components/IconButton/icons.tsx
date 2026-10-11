import type { SVGProps } from 'react';

export type IconName =
  | 'close'
  | 'pause'
  | 'play'
  | 'ff2'
  | 'ff5'
  | 'plus'
  | 'minus'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'arrow-up'
  | 'arrow-down'
  | 'gear'
  | 'flag'
  | 'sword'
  | 'castle'
  | 'scroll'
  | 'coin'
  | 'rice'
  | 'people'
  | 'crown'
  | 'handshake'
  | 'search'
  | 'pin'
  | 'book'
  | 'army'
  | 'road'
  | 'bridge'
  | 'terrain'
  | 'layer'
  | 'supply'
  | 'morale'
  | 'siege'
  | 'warning'
  | 'blocked'
  | 'eye'
  | 'eye-off';

const paths: Record<IconName, React.ReactNode> = {
  close: <path d="M5 5l14 14M19 5L5 19" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M8 5l11 7-11 7z" />,
  ff2: (
    <>
      <path d="M4 6l7 6-7 6zM11 6l7 6-7 6z" />
      <path d="M20 7v10" />
    </>
  ),
  ff5: (
    <>
      <path d="M3 6l7 6-7 6zM10 6l7 6-7 6z" />
      <path d="M19 7v10" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'chevron-up': <path d="M5 15l7-7 7 7" />,
  'chevron-down': <path d="M5 9l7 7 7-7" />,
  'arrow-up': <path d="M12 20V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 4v15M6 13l6 6 6-6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  flag: <path d="M6 21V4m0 1h11l-2 4 2 4H6" />,
  sword: <path d="M5 19l10-10m-7 6l-3 3 1 1 3-3M14 4l6-1-1 6-3 3-5-5z" />,
  castle: <path d="M4 21V9h4V5h3v4h2V5h3v4h4v12M3 21h18M9 21v-5h6v5" />,
  scroll: <path d="M7 4h12v14a3 3 0 01-3 3H6a3 3 0 003-3V3H6a3 3 0 00-3 3v1h4M12 9h4M12 13h4" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9c0-2 6-2 6 0s-6 1-6 4 6 2 6 0M12 6v12" />
    </>
  ),
  rice: (
    <path d="M12 21V7M12 9C8 8 6 6 6 3c4 0 6 2 6 6zm0 4c4-1 6-3 6-6-4 0-6 2-6 6zm0 4c-4-1-6-3-6-6 4 0 6 2 6 6z" />
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 20c0-5 12-5 12 0M14 15c4-2 7 1 7 4" />
    </>
  ),
  crown: <path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10zM5 21h14" />,
  handshake: <path d="M3 10l5-5 4 3 4-2 5 5-6 7-4-3-3 2-5-5zM8 5l-5 4M16 6l5 4" />,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="M15 15l6 6" />
    </>
  ),
  pin: <path d="M12 22s7-7 7-13a7 7 0 10-14 0c0 6 7 13 7 13z" />,
  book: <path d="M3 5c4-2 7-1 9 1v15c-2-2-5-3-9-1zm18 0c-4-2-7-1-9 1v15c2-2 5-3 9-1z" />,
  // Original geometry: military glyphs use pointed standards and grouped shields,
  // map glyphs use open terrain contours, status glyphs retain recognizable outlines.
  army: (
    <>
      <path d="M12 3v8m0-7h7l-2 3h-5M3 13h5v4l-2.5 3L3 17zm6 0h6v5l-3 3-3-3zm7 0h5v4l-2.5 3-2.5-3z" />
    </>
  ),
  road: <path d="M4 21C3 14 12 14 9 3m11 18c-1-7-10-7-7-18M12 19v-2m0-6V9m-1-4V3" />,
  bridge: (
    <path d="M3 9h18M4 9V5m5 4V5m6 4V5m5 4V5M4 9v11m16-11v11M4 16c4-8 12-8 16 0M3 21h4m10 0h4" />
  ),
  terrain: <path d="M3 20l7-14 4 8 3-5 4 11zM8 10l2 2 2-2M14 20l-3-6" />,
  layer: <path d="M3 8l9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5" />,
  supply: (
    <>
      <path d="M4 6h13v11H4zM8 6v11m5-11v11M3 17h18l-2-7h-2" />
      <circle cx="7" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  morale: <path d="M6 21V4m0 1l8-2 5 5-5 5-8-2M13 18v-5m-3 3l3-3 3 3" />,
  siege: <path d="M3 21V9h3V6h3v3h3V6h3v3h3v12M3 21h15M8 21v-5h5v5M21 4v11m-3-8l3-3M18 14l3 3" />,
  warning: <path d="M12 3L3 21h18zM12 9v5m0 3v1" />,
  blocked: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </>
  ),
  eye: (
    <>
      <path d="M3 12c4-9 14-9 18 0-4 9-14 9-18 0z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <path d="M3 3l18 18M8 6c5-2 9 0 13 6l-3 4M15 18c-5 1-8-1-12-6l3-4M10 10a3 3 0 004 4" />
  ),
};

/** Reduced detail for explicit 16px consumers; no shared IDs or external sprite state. */
const compactPaths: Partial<Record<IconName, React.ReactNode>> = {
  army: <path d="M12 3v8m0-7h7l-2 3h-5M3 13h7v5l-3.5 3L3 18zm11 0h7v5l-3.5 3-3.5-3z" />,
  road: <path d="M4 21C3 14 12 14 9 3m11 18c-1-7-10-7-7-18" />,
  terrain: <path d="M3 20l7-14 4 8 3-5 4 11z" />,
  supply: <path d="M4 5h13v12H4zM10 5v12M3 17h18l-2-7h-2M6 20h2m9 0h2" />,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const compact =
    props.width === 16 ||
    props.width === '16' ||
    props.style?.width === 16 ||
    props.style?.width === '16px';
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {compact ? (compactPaths[name] ?? paths[name]) : paths[name]}
    </svg>
  );
}
