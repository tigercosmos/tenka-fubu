import type { RibbonRect } from './castleRibbonLayout';

/** Conservative broadphase for every nearest-point leader in the 48 CSS px disk. */
export function filterCastleRibbonLeaderObstacles(
  anchor: { x: number; y: number },
  baseline: RibbonRect,
  obstacles: readonly RibbonRect[],
): readonly RibbonRect[] {
  const validRect = (rect: RibbonRect) => {
    if (
      ![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(
        Number.isFinite,
      ) ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      throw new Error('Invalid castle ribbon leader rectangle');
  };
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
    throw new Error('Invalid castle ribbon leader anchor');
  validRect(baseline);
  obstacles.forEach(validRect);
  // Every endpoint belongs to the shifted rectangle; the straight segment is
  // contained in the hull of that rectangle and its fixed world-foot anchor.
  // The square is a superset of the disk. Inclusive contact stays conservative.
  const left = Math.min(anchor.x, baseline.x - 48);
  const top = Math.min(anchor.y, baseline.y - 48);
  const right = Math.max(anchor.x, baseline.x + 48 + baseline.width);
  const bottom = Math.max(anchor.y, baseline.y + 48 + baseline.height);
  return obstacles.filter(
    (rect) =>
      rect.x <= right &&
      rect.x + rect.width >= left &&
      rect.y <= bottom &&
      rect.y + rect.height >= top,
  );
}
