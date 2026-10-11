import type { ReactElement } from 'react';
import { KamonIcon } from './KamonIcon';
import type { KamonSpec } from './types';

/** Pure SVG helper; static serialization matches the component without generated IDs. */
export function renderKamon(spec: Readonly<KamonSpec>, size = 64, label?: string): ReactElement {
  return <KamonIcon spec={spec} size={size} {...(label === undefined ? {} : { label })} />;
}
