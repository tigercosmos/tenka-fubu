// Frozen pre-optimization layout oracle: preserve exhaustive collision scoring.
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';
import { roadLabelClearsCapsules, type RoadLabelCapsule } from '../../src/ui/map/roadLabelCapsules';

export interface GeographicLabelCandidate {
  id: string;
  kind: 'province' | 'district' | 'road';
  /** Visible text bounds including halo, at the unchanged baseline CSS anchor. */
  rect: PlateRect;
  roadLine?: { normal: { x: number; y: number }; slack: number };
  roadCapsules?: readonly RoadLabelCapsule[] | null;
}

const PRIORITY = { province: 0, district: 1, road: 2 } as const;
const GAP = 4;
const LIMIT = 48;
const GRID_STEP = 8;
const EDGE_AXIS_CAP = 16;

function validate(r: PlateRect) {
  if (
    ![r.x, r.y, r.width, r.height, r.x + r.width + GAP, r.y + r.height + GAP].every(
      Number.isFinite,
    ) ||
    r.width < 0 ||
    r.height < 0
  )
    throw new Error('Invalid geographic label rectangle');
}

function overlap(a: PlateRect, b: PlateRect, padding: number) {
  return (
    Math.max(
      0,
      Math.min(a.x + a.width + padding, b.x + b.width + padding) -
        Math.max(a.x - padding, b.x - padding),
    ) *
    Math.max(
      0,
      Math.min(a.y + a.height + padding, b.y + b.height + padding) -
        Math.max(a.y - padding, b.y - padding),
    )
  );
}

/** Moves visible geography text only. Callers retain world anchors and visibility policy. */
export function layoutGeographicLabels(
  candidates: readonly GeographicLabelCandidate[],
  obstacles: readonly PlateRect[],
  hardObstacles: readonly PlateRect[] = [],
): Map<string, { x: number; y: number }> {
  obstacles.forEach(validate);
  hardObstacles.forEach(validate);
  const ids = new Set<string>();
  for (const c of candidates) {
    validate(c.rect);
    if (ids.has(c.id) || !Number.isFinite(PRIORITY[c.kind]))
      throw new Error('Invalid geographic label candidate');
    ids.add(c.id);
  }
  const primary = obstacles
    .map((r) => ({ ...r }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
  const placed: PlateRect[] = [];
  const hard = hardObstacles
    .map((r) => ({ ...r }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
  const result = new Map<string, { x: number; y: number }>();
  const sorted = [...candidates].sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const { id, rect, roadLine, roadCapsules } of sorted) {
    const reserved = [...primary, ...hard, ...placed];
    const baselinePrimary = primary.reduce((sum, r) => sum + overlap(rect, r, 0), 0);
    const hardBaseline = hard.map((r) => overlap(rect, r, 0));
    const intersecting = reserved.filter((r) => overlap(rect, r, 2) > 0);
    const directions = [
      { x: 0, y: Math.max(0, ...intersecting.map((r) => r.y + r.height + GAP - rect.y)) },
      { x: Math.max(0, ...intersecting.map((r) => r.x + r.width + GAP - rect.x)), y: 0 },
      { x: Math.min(0, ...intersecting.map((r) => r.x - GAP - rect.width - rect.x)), y: 0 },
      { x: 0, y: Math.min(0, ...intersecting.map((r) => r.y - GAP - rect.height - rect.y)) },
    ];
    const offsets = [{ x: 0, y: 0 }, ...directions];
    for (const sign of [1, -1]) {
      const first = sign > 0 ? directions[0]!.y : directions[3]!.y;
      const edges = reserved
        .map((r) => (sign > 0 ? r.y + r.height + GAP - rect.y : r.y - GAP - rect.height - rect.y))
        .filter((y) => sign * y > sign * first && Math.abs(y) <= LIMIT)
        .sort((a, b) => sign * (a - b));
      offsets.push({ x: 0, y: edges[0] ?? sign * LIMIT });
    }
    // Aggregating every blocker can skip useful interior positions in a crowded cluster.
    // Fixed disk samples and bounded individual-edge pairs add at most 369 candidates.
    // Together with the seven original candidates this is at most 376 per label.
    for (let y = -LIMIT; y <= LIMIT; y += GRID_STEP) {
      for (let x = -LIMIT; x <= LIMIT; x += GRID_STEP) {
        if (x * x + y * y <= LIMIT * LIMIT) offsets.push({ x, y });
      }
    }
    const axis = (values: number[]) =>
      [...new Set([0, ...values])]
        .filter((value) => Number.isFinite(value) && Math.abs(value) <= LIMIT)
        .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
        .slice(0, EDGE_AXIS_CAP);
    const xs = axis(
      reserved.flatMap((r) => [
        r.x - rect.x - rect.width,
        r.x - rect.x - rect.width - GAP,
        r.x + r.width - rect.x,
        r.x + r.width - rect.x + GAP,
      ]),
    );
    const ys = axis(
      reserved.flatMap((r) => [
        r.y - rect.y - rect.height,
        r.y - rect.y - rect.height - GAP,
        r.y + r.height - rect.y,
        r.y + r.height - rect.y + GAP,
      ]),
    );
    for (const y of ys)
      for (const x of xs) if (x * x + y * y <= LIMIT * LIMIT) offsets.push({ x, y });
    let best = { x: 0, y: 0 },
      bestPrimary = Infinity,
      bestSecondary = Infinity,
      bestDistance = Infinity;
    for (const offset of offsets) {
      const distance = offset.x * offset.x + offset.y * offset.y;
      if (distance > LIMIT * LIMIT) continue;
      if (
        roadLine &&
        (!Number.isFinite(roadLine.slack) ||
          !Number.isFinite(roadLine.normal.x) ||
          !Number.isFinite(roadLine.normal.y) ||
          offset.x * roadLine.normal.x + offset.y * roadLine.normal.y < -roadLine.slack - 1e-8)
      )
        continue;
      const moved = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
      if (roadCapsules !== undefined && !roadLabelClearsCapsules(moved, roadCapsules)) continue;
      // A clearer ordinary cluster cannot pay for a new collision with any
      // protected castle channel. Zero offset is always eligible, even if a
      // constrained label already overlaps a channel at its original anchor.
      if (hard.some((r, index) => overlap(moved, r, 0) > hardBaseline[index]!)) continue;
      // Primary bodies, plates and castle ribbons always outrank geographic clearance.
      // Including the baseline prevents an accepted offset from increasing this area.
      const primaryArea = primary.reduce((sum, r) => sum + overlap(moved, r, 0), 0);
      if (primaryArea > baselinePrimary) continue;
      const secondaryArea = reserved.reduce((sum, r) => sum + overlap(moved, r, 2), 0);
      if (
        primaryArea < bestPrimary ||
        (primaryArea === bestPrimary &&
          (secondaryArea < bestSecondary ||
            (secondaryArea === bestSecondary && distance < bestDistance)))
      ) {
        best = offset;
        bestPrimary = primaryArea;
        bestSecondary = secondaryArea;
        bestDistance = distance;
      }
      if (primaryArea === 0 && secondaryArea === 0 && distance === 0) break;
    }
    result.set(id, { ...best });
    placed.push({ ...rect, x: rect.x + best.x, y: rect.y + best.y });
  }
  return result;
}
