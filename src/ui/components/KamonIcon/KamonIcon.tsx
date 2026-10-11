import type { ReactElement } from 'react';
import { TOKENS } from '../../styles/tokens';
import { kamonGeometry } from './geometry';
import type { KamonSpec } from './types';

export interface KamonIconProps {
  spec: Readonly<KamonSpec>;
  size?: number;
  /** Localized name supplied by the caller; omitted/blank means decorative. */
  label?: string;
}
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu;

export function KamonIcon({ spec, size = 64, label }: KamonIconProps): ReactElement {
  if (!Number.isFinite(size) || size <= 0)
    throw new RangeError('Kamon size must be positive and finite');
  if (!HEX_COLOR.test(spec.fg) || !HEX_COLOR.test(spec.bg))
    throw new TypeError('Kamon colors must be hexadecimal');
  const name = label?.trim() || undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={name === undefined ? undefined : 'img'}
      aria-label={name}
      aria-hidden={name === undefined ? true : undefined}
      focusable="false"
      data-kamon-shape={spec.shape}
    >
      {name === undefined ? null : <title>{name}</title>}
      <circle data-part="background" cx={32} cy={32} r={30} fill={spec.bg} />
      <circle
        data-part="outline"
        cx={32}
        cy={32}
        r={30}
        fill="none"
        stroke={TOKENS.color.accentGold}
        strokeOpacity={0.4}
        strokeWidth={2}
      />
      <g data-part="foreground" fill={spec.fg}>
        {kamonGeometry(spec.shape)}
      </g>
    </svg>
  );
}
