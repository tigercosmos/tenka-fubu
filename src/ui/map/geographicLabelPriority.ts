import type { PlateRect } from './armyPlateLayout';

/** CSS-space breathing room around tactical models, not a picking/terrain envelope. */
export const GEOGRAPHIC_PRIMARY_MARGIN = 4;
export interface GeographicPriorityCandidate {
  readonly id: string;
  readonly kind: 'province' | 'district' | 'road';
  readonly rect: PlateRect;
  readonly forced: boolean;
}
export interface GeographicPriorityDecision {
  readonly visible: boolean;
  readonly forced: boolean;
  readonly reason: 'admitted' | 'interaction' | 'primary-collision' | 'budget-fallback';
}
function valid(rect: PlateRect): boolean {
  return (
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width >= 0 &&
    rect.height >= 0
  );
}
/** Post-placement admission only. Existing offsets/density/font/anchors are untouched.
 * Bounded to 512 names × 2048 primary rectangles. Overflow retains existing names,
 * never silently drops essential information. Does not mutate borrowed inputs.
 */
export function prioritizeGeographicLabels(
  candidates: readonly GeographicPriorityCandidate[],
  primary: readonly PlateRect[],
): ReadonlyMap<string, GeographicPriorityDecision> {
  const decisions = new Map<string, GeographicPriorityDecision>();
  const fallback =
    candidates.length > 512 ||
    primary.length > 2048 ||
    candidates.some((candidate) => !valid(candidate.rect)) ||
    primary.some((rect) => !valid(rect));
  for (const candidate of candidates) {
    if (candidate.forced || candidate.kind === 'province' || fallback) {
      decisions.set(candidate.id, {
        visible: true,
        forced: candidate.forced,
        reason: candidate.forced ? 'interaction' : fallback ? 'budget-fallback' : 'admitted',
      });
      continue;
    }
    const rect = candidate.rect;
    const collision = primary.some(
      (other) =>
        other.width > 0 &&
        other.height > 0 &&
        rect.x < other.x + other.width + GEOGRAPHIC_PRIMARY_MARGIN &&
        rect.x + rect.width > other.x - GEOGRAPHIC_PRIMARY_MARGIN &&
        rect.y < other.y + other.height + GEOGRAPHIC_PRIMARY_MARGIN &&
        rect.y + rect.height > other.y - GEOGRAPHIC_PRIMARY_MARGIN,
    );
    decisions.set(candidate.id, {
      visible: !collision,
      forced: false,
      reason: collision ? 'primary-collision' : 'admitted',
    });
  }
  return decisions;
}
