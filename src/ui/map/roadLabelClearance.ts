import type { PlateRect } from './armyPlateLayout';

export function roadLabelBaselineOffset(
  bounds: PlateRect,
  normal: { x: number; y: number },
  existingDistance: number,
  halfWidth: number,
): { x: number; y: number } {
  const minimum =
    Math.min(normal.x * bounds.x, normal.x * (bounds.x + bounds.width)) +
    Math.min(normal.y * bounds.y, normal.y * (bounds.y + bounds.height));
  if (
    ![minimum, existingDistance, halfWidth, normal.x, normal.y].every(Number.isFinite) ||
    halfWidth < 0
  )
    return { x: 0, y: 0 };
  const extra = Math.max(0, halfWidth + 4 - existingDistance - minimum);
  if (extra === 0) return { x: 0, y: 0 };
  return { x: normal.x * extra, y: normal.y * extra };
}
export function roadLabelOffsetClearsLine(
  base: { x: number; y: number },
  offset: { x: number; y: number },
  bounds: PlateRect,
  normal: { x: number; y: number },
  existingDistance: number,
  halfWidth: number,
): boolean {
  const minimum =
    Math.min(normal.x * bounds.x, normal.x * (bounds.x + bounds.width)) +
    Math.min(normal.y * bounds.y, normal.y * (bounds.y + bounds.height));
  const distance =
    minimum + existingDistance + (base.x + offset.x) * normal.x + (base.y + offset.y) * normal.y;
  return Number.isFinite(distance) && distance >= halfWidth + 4 - 1e-8;
}
