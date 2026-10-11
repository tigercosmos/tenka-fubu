// Frozen pre-optimization seed from 07efa67. Candidate generation/order stays authoritative.
// This independent reference deliberately retains full collision scans.
import type { ArmyPlateCandidate, PlateRect } from '../../src/ui/map/armyPlateLayout';
const GAP = 4;
const LIMIT = 48;
const MAX_FOREGROUND_ESCAPES = 128;

function validate(rect: PlateRect) {
  if (
    ![
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      rect.x + rect.width + GAP,
      rect.y + rect.height + GAP,
    ].every(Number.isFinite) ||
    rect.width < 0 ||
    rect.height < 0
  )
    throw new Error('Invalid plate rectangle');
}

// Padding both rectangles by two CSS pixels reserves a four-pixel gap.
function overlap(a: PlateRect, b: PlateRect) {
  return (
    Math.max(0, Math.min(a.x + a.width + 2, b.x + b.width + 2) - Math.max(a.x - 2, b.x - 2)) *
    Math.max(0, Math.min(a.y + a.height + 2, b.y + b.height + 2) - Math.max(a.y - 2, b.y - 2))
  );
}
function bodyOverlap(a: PlateRect, b: PlateRect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

/** CSS offsets only; no world-coordinate, visibility or input mutation. */
export function referenceArmyPlateSeed(
  candidates: readonly ArmyPlateCandidate[],
  obstacles: readonly PlateRect[],
  castleBodies: readonly PlateRect[] = [],
  foregroundBodies: readonly PlateRect[] = [],
): Map<string, { x: number; y: number }> {
  obstacles.forEach(validate);
  castleBodies.forEach(validate);
  foregroundBodies.forEach(validate);
  const ids = new Set<string>();
  for (const c of candidates) {
    validate(c.rect);
    if (c.anchor && ![c.anchor.x, c.anchor.y].every(Number.isFinite))
      throw new Error('Invalid plate anchor');
    if (!Number.isFinite(c.priority) || ids.has(c.id)) throw new Error('Invalid plate candidate');
    ids.add(c.id);
  }
  const reserved = [...obstacles, ...castleBodies, ...foregroundBodies]
    .map((r) => ({ ...r }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
  const bodies = [...castleBodies].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
  );
  const foreground = [...foregroundBodies].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
  );
  const result = new Map<string, { x: number; y: number }>();
  const sorted = [...candidates].sort(
    (a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const { id, rect } of sorted) {
    const intersecting = reserved.filter((r) => overlap(rect, r) > 0);
    const directions = [
      { x: 0, y: Math.max(0, ...intersecting.map((r) => r.y + r.height + GAP - rect.y)) },
      { x: Math.max(0, ...intersecting.map((r) => r.x + r.width + GAP - rect.x)), y: 0 },
      { x: Math.min(0, ...intersecting.map((r) => r.x - GAP - rect.width - rect.x)), y: 0 },
      { x: 0, y: Math.min(0, ...intersecting.map((r) => r.y - GAP - rect.height - rect.y)) },
    ];
    const offsets = [{ x: 0, y: 0 }, ...directions];
    // A second edge-derived escape can clear an obstacle reached by the first move.
    for (const sign of [1, -1]) {
      const first = sign > 0 ? directions[0]!.y : directions[3]!.y;
      const edges = reserved
        .map((r) => (sign > 0 ? r.y + r.height + GAP - rect.y : r.y - GAP - rect.height - rect.y))
        .filter((y) => sign * y > sign * first && Math.abs(y) <= LIMIT)
        .sort((a, b) => sign * (a - b));
      offsets.push({ x: 0, y: edges[0] ?? sign * LIMIT });
    }
    if (castleBodies.length > 0) {
      for (const body of bodies) {
        if (overlap(rect, body) === 0) continue;
        const xs = [body.x + body.width + GAP - rect.x, body.x - GAP - rect.width - rect.x];
        const ys = [body.y + body.height + GAP - rect.y, body.y - GAP - rect.height - rect.y];
        for (const x of xs) for (const y of ys) offsets.push({ x, y });
      }
    }
    // Individual edges avoid an aggregate escape exceeding the bounded disk in dense clusters.
    // Static deterministic ordering and a fixed proposal cap bound this additional search.
    let foregroundEscapes = 0;
    for (const actor of foreground) {
      if (foregroundEscapes >= MAX_FOREGROUND_ESCAPES) break;
      if (overlap(rect, actor) === 0) continue;
      const xs = [actor.x + actor.width + GAP - rect.x, actor.x - GAP - rect.width - rect.x];
      const ys = [actor.y + actor.height + GAP - rect.y, actor.y - GAP - rect.height - rect.y];
      const local = [
        { x: 0, y: ys[0]! },
        { x: xs[0]!, y: 0 },
        { x: xs[1]!, y: 0 },
        { x: 0, y: ys[1]! },
        ...xs.flatMap((x) => ys.map((y) => ({ x, y }))),
      ];
      for (const offset of local) {
        if (foregroundEscapes >= MAX_FOREGROUND_ESCAPES) break;
        offsets.push(offset);
        foregroundEscapes++;
      }
    }
    let best = { x: 0, y: 0 },
      bestBodyArea = Infinity,
      bestForegroundArea = Infinity,
      bestArea = Infinity,
      bestDistance = Infinity;
    for (const offset of offsets) {
      const distance = offset.x * offset.x + offset.y * offset.y;
      if (distance > LIMIT * LIMIT) continue;
      const moved = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
      const bodyArea = bodies.reduce((sum, body) => sum + bodyOverlap(moved, body), 0);
      const foregroundArea = foreground.reduce((sum, actor) => sum + bodyOverlap(moved, actor), 0);
      const area = reserved.reduce((sum, r) => sum + overlap(moved, r), 0);
      if (
        bodyArea < bestBodyArea ||
        (bodyArea === bestBodyArea &&
          (foregroundArea < bestForegroundArea ||
            (foregroundArea === bestForegroundArea &&
              (area < bestArea || (area === bestArea && distance < bestDistance)))))
      ) {
        best = offset;
        bestBodyArea = bodyArea;
        bestForegroundArea = foregroundArea;
        bestArea = area;
        bestDistance = distance;
      }
      if (area === 0 && castleBodies.length === 0 && foreground.length === 0) break;
    }
    result.set(id, { ...best });
    reserved.push({ ...rect, x: rect.x + best.x, y: rect.y + best.y });
  }
  return result;
}
