import type { PlateRect } from './armyPlateLayout';
import { roadLabelClearsCapsules, type RoadLabelCapsule } from './roadLabelCapsules';

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

const DISK_OFFSETS: readonly { x: number; y: number }[] = (() => {
  const offsets = [];
  for (let y = -LIMIT; y <= LIMIT; y += GRID_STEP)
    for (let x = -LIMIT; x <= LIMIT; x += GRID_STEP)
      if (x * x + y * y <= LIMIT * LIMIT) offsets.push({ x, y });
  return offsets;
})();

interface EdgeIndex {
  starts: number[];
  ends: number[];
}

// Index only bounded coordinates. A one-pixel query margin exceeds rounding
// error in this range; extreme valid rectangles retain the full original scan.
function canIndexEdges(rect: PlateRect) {
  return (
    Math.abs(rect.x) <= 1e6 &&
    Math.abs(rect.y) <= 1e6 &&
    Math.abs(rect.width) <= 1e6 &&
    Math.abs(rect.height) <= 1e6
  );
}

function createEdgeIndex(reserved: readonly PlateRect[], vertical: boolean): EdgeIndex {
  return {
    starts: reserved.map((r) => (vertical ? r.y : r.x)).sort((a, b) => a - b),
    ends: reserved.map((r) => (vertical ? r.y + r.height : r.x + r.width)).sort((a, b) => a - b),
  };
}

function visitRange(
  values: readonly number[],
  lower: number,
  upper: number,
  visit: (value: number) => void,
) {
  let left = 0;
  let right = values.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (values[middle]! < lower) left = middle + 1;
    else right = middle;
  }
  for (let index = left; index < values.length && values[index]! <= upper; index++)
    visit(values[index]!);
}

/** Preserve exact edge arithmetic and ordering while querying fixed obstacle edges. */
function edgeAxis(
  rect: PlateRect,
  reserved: readonly PlateRect[],
  vertical: boolean,
  index?: EdgeIndex,
) {
  const values = new Set<number>([0]);
  const add = (value: number) => {
    if (Number.isFinite(value) && Math.abs(value) <= LIMIT) values.add(value);
  };
  const origin = vertical ? rect.y : rect.x;
  const size = vertical ? rect.height : rect.width;
  if (index) {
    const margin = LIMIT + GAP + 1;
    visitRange(index.starts, origin + size - margin, origin + size + margin, (start) => {
      add(start - origin - size);
      add(start - origin - size - GAP);
    });
    visitRange(index.ends, origin - margin, origin + margin, (end) => {
      add(end - origin);
      add(end - origin + GAP);
    });
  }
  for (const r of reserved) {
    const start = vertical ? r.y : r.x;
    const extent = vertical ? r.height : r.width;
    add(start - origin - size);
    add(start - origin - size - GAP);
    add(start + extent - origin);
    add(start + extent - origin + GAP);
  }
  return [...values].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b).slice(0, EDGE_AXIS_CAP);
}

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

interface CachedPlacement {
  signature: string;
  offset: { x: number; y: number };
}

/** One most recent placement per admitted label; changing geometry invalidates exactly. */
export function createGeographicLabelLayouter() {
  const placements = new Map<string, CachedPlacement>();
  let computed = 0;
  let reused = 0;
  return {
    layout(
      candidates: readonly GeographicLabelCandidate[],
      obstacles: readonly PlateRect[],
      hardObstacles: readonly PlateRect[] = [],
    ) {
      const ids = new Set(candidates.map(({ id }) => id));
      for (const id of placements.keys()) if (!ids.has(id)) placements.delete(id);
      return layoutGeographicLabels(candidates, obstacles, hardObstacles, {
        placements,
        computed: () => computed++,
        reused: () => reused++,
      });
    },
    getDiagnostics: () => ({ computed, reused, entries: placements.size }),
  };
}

/** Moves visible geography text only. Callers retain world anchors and visibility policy. */
export function layoutGeographicLabels(
  candidates: readonly GeographicLabelCandidate[],
  obstacles: readonly PlateRect[],
  hardObstacles: readonly PlateRect[] = [],
  cache?: {
    placements: Map<string, CachedPlacement>;
    computed: () => void;
    reused: () => void;
  },
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
  const fixed = [...primary, ...hard];
  const indexed = fixed.every(canIndexEdges);
  const xIndex = indexed ? createEdgeIndex(fixed, false) : undefined;
  const yIndex = indexed ? createEdgeIndex(fixed, true) : undefined;
  for (const { id, rect, roadLine, roadCapsules } of sorted) {
    const reserved = [...primary, ...hard, ...placed];
    // Every eligible placement lies in this envelope. Outside rectangles contribute
    // zero overlap even with the existing two-pixel scoring padding on both sides.
    const near = (r: PlateRect) =>
      r.x < rect.x + rect.width + LIMIT + 4 &&
      r.x + r.width > rect.x - LIMIT - 4 &&
      r.y < rect.y + rect.height + LIMIT + 4 &&
      r.y + r.height > rect.y - LIMIT - 4;
    const nearPrimary = primary.filter(near);
    const nearHard = hard.filter(near);
    const nearReserved = reserved.filter(near);
    const baselinePrimary = nearPrimary.reduce((sum, r) => sum + overlap(rect, r, 0), 0);
    const hardBaseline = nearHard.map((r) => overlap(rect, r, 0));
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
    const useIndex = indexed && canIndexEdges(rect);
    const xs = edgeAxis(rect, useIndex ? placed : reserved, false, useIndex ? xIndex : undefined);
    const ys = edgeAxis(rect, useIndex ? placed : reserved, true, useIndex ? yIndex : undefined);
    // The seven dynamic directions plus both exact axes fully determine offset order;
    // disk samples are fixed constants. Keep distant edge inputs in these axes.
    const signature = cache
      ? JSON.stringify([
          rect,
          roadLine,
          roadCapsules === undefined,
          roadCapsules,
          offsets.slice(0, 7),
          xs,
          ys,
          nearPrimary,
          nearHard,
          nearReserved,
        ])
      : null;
    const cached = cache?.placements.get(id);
    if (cached && cached.signature === signature) {
      cache?.reused();
      result.set(id, { ...cached.offset });
      placed.push({ ...rect, x: rect.x + cached.offset.x, y: rect.y + cached.offset.y });
      continue;
    }
    cache?.computed();
    // The exact cache signature above already determines all candidate offsets.
    // Only a cache miss needs the disk and edge-pair scoring candidates.
    // Keep their original order, including duplicates, for identical tie breaks.
    offsets.push(...DISK_OFFSETS);
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
      if (nearHard.some((r, index) => overlap(moved, r, 0) > hardBaseline[index]!)) continue;
      // Primary bodies, plates and castle ribbons always outrank geographic clearance.
      // Including the baseline prevents an accepted offset from increasing this area.
      const primaryArea = nearPrimary.reduce((sum, r) => sum + overlap(moved, r, 0), 0);
      if (primaryArea > baselinePrimary) continue;
      const secondaryArea = nearReserved.reduce((sum, r) => sum + overlap(moved, r, 2), 0);
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
    if (signature !== null) cache?.placements.set(id, { signature, offset: { ...best } });
    placed.push({ ...rect, x: rect.x + best.x, y: rect.y + best.y });
  }
  return result;
}
