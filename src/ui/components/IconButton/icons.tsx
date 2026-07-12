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
  | 'book';

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
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
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
      {paths[name]}
    </svg>
  );
}
