import { logicalPxToRem } from '../layout/sizing';

/** Shared CSS geometry for the map and the notification space above it. */
export function miniMapLayout(size: number, bottomOffset?: number) {
  const bottom = bottomOffset === undefined ? 'var(--space-3)' : logicalPxToRem(bottomOffset);
  const side = `max(32px, min(192px, ${logicalPxToRem(size)}, calc(100dvh - 3rem - ${bottom} - var(--space-3))))`;
  return { bottom, side, reservedBottom: `calc(${bottom} + ${side} + var(--space-3))` };
}
