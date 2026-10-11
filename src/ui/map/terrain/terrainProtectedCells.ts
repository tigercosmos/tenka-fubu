import { LAKE_SURFACE } from '../mapViewConfig';

export interface ProtectedCellPoint {
  readonly x: number;
  readonly y: number;
}
export interface TerrainProtectedCellInput {
  readonly worldSize: number;
  readonly cells: number;
  readonly landPolygons: readonly (readonly ProtectedCellPoint[])[];
  readonly waterGeometry: {
    readonly lakes: readonly { readonly points: readonly ProtectedCellPoint[] }[];
    readonly rivers: readonly {
      readonly displaySegments: readonly {
        readonly a: ProtectedCellPoint;
        readonly b: ProtectedCellPoint;
        readonly width: number;
      }[];
    }[];
  };
  readonly onDiagnostics?: (diagnostics: TerrainProtectedCellDiagnostics) => void;
}
export interface TerrainProtectedCellDiagnostics {
  readonly status: 'ok' | 'invalidGeometry' | 'workLimit';
  readonly failClosed: boolean;
  readonly cells: number;
  readonly protectedCount: number;
  readonly unprotectedCount: number;
  readonly work: number;
  readonly riverAaWorld: number;
  readonly lakePaintSupportWorld: number;
}
const MAX_WORK = 64_000_000;
const MAX_POINTS = 16_384;
const MAX_SEGMENTS = 16_384;
const RIVER_AA_WORLD = 2 / 0.15;
// The centered outline uses Pixi's default miterLimit=10. The other two
// strokes have alignment=1 and round joins; using their whole widths is conservative.
const LAKE_PAINT_SUPPORT_WORLD =
  RIVER_AA_WORLD +
  Math.max(
    (LAKE_SURFACE.outline.width / 2) * 10,
    LAKE_SURFACE.innerDark.width,
    LAKE_SURFACE.innerLight.width,
  );
const LIMIT = new Error('terrain protected-cell work limit');
// Boolean-only guard preserves the caller's structural readonly-array types.
const isArray = (value: unknown): boolean => Array.isArray(value);
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Ring {
  points: readonly ProtectedCellPoint[];
  box: Box;
}
const finite = (p: ProtectedCellPoint) =>
  p != null &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) <= 1e6 &&
  Math.abs(p.y) <= 1e6;
const cross = (a: ProtectedCellPoint, b: ProtectedCellPoint, c: ProtectedCellPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const same = (a: ProtectedCellPoint, b: ProtectedCellPoint) => a.x === b.x && a.y === b.y;
const inBox = (p: ProtectedCellPoint, b: Box) =>
  p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
const overlaps = (a: Box, b: Box) =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
function segmentBox(a: ProtectedCellPoint, b: ProtectedCellPoint): Box {
  return {
    left: Math.min(a.x, b.x),
    right: Math.max(a.x, b.x),
    top: Math.min(a.y, b.y),
    bottom: Math.max(a.y, b.y),
  };
}
function intersects(
  a: ProtectedCellPoint,
  b: ProtectedCellPoint,
  c: ProtectedCellPoint,
  d: ProtectedCellPoint,
) {
  if (!overlaps(segmentBox(a, b), segmentBox(c, d))) return false;
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (abC === 0 && inBox(c, segmentBox(a, b))) ||
    (abD === 0 && inBox(d, segmentBox(a, b))) ||
    (cdA === 0 && inBox(a, segmentBox(c, d))) ||
    (cdB === 0 && inBox(b, segmentBox(c, d))) ||
    (abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0)
  );
}
function pointDistance(p: ProtectedCellPoint, a: ProtectedCellPoint, b: ProtectedCellPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const corners = (b: Box): ProtectedCellPoint[] => [
  { x: b.left, y: b.top },
  { x: b.right, y: b.top },
  { x: b.right, y: b.bottom },
  { x: b.left, y: b.bottom },
];
function boundaryTouchesCell(ring: Ring, b: Box, charge: () => void) {
  const cell = corners(b);
  for (let i = 0; i < ring.points.length; i++) {
    charge();
    const a = ring.points[i]!,
      next = ring.points[(i + 1) % ring.points.length]!;
    if (!overlaps(segmentBox(a, next), b)) continue;
    if (
      inBox(a, b) ||
      inBox(next, b) ||
      cell.some((p, j) => intersects(a, next, p, cell[(j + 1) % 4]!))
    )
      return true;
  }
  return false;
}
function inside(p: ProtectedCellPoint, ring: Ring, charge: () => void) {
  let yes = false;
  for (let i = 0, j = ring.points.length - 1; i < ring.points.length; j = i++) {
    charge();
    const a = ring.points[i]!,
      b = ring.points[j]!;
    if (cross(a, b, p) === 0 && inBox(p, segmentBox(a, b))) return false;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
}
function capsuleTouchesCell(
  a: ProtectedCellPoint,
  b: ProtectedCellPoint,
  radius: number,
  box: Box,
) {
  if (inBox(a, box) || inBox(b, box)) return true;
  const cell = corners(box);
  for (let i = 0; i < 4; i++) {
    const c = cell[i]!,
      d = cell[(i + 1) % 4]!;
    if (intersects(a, b, c, d)) return true;
    if (
      Math.min(
        pointDistance(a, c, d),
        pointDistance(b, c, d),
        pointDistance(c, a, b),
        pointDistance(d, a, b),
      ) <= radius
    )
      return true;
  }
  return false;
}

/** Conservative, row-major display mask. A protected cell flattens all four mesh vertices.
 * Uses complete closed cells, actual emitted lake polygons and actual emitted river capsules.
 * Invalid geometry/work exhaustion returns ALL protected, with explicit diagnostics.
 * Invalid grid dimensions throw before allocation. Inputs are never modified or retained.
 */
export function createTerrainProtectedCells(input: TerrainProtectedCellInput): Uint8Array {
  const { worldSize, cells } = input;
  if (
    !Number.isFinite(worldSize) ||
    worldSize <= 0 ||
    worldSize > 1e6 ||
    !Number.isInteger(cells) ||
    cells < 1 ||
    cells > 256
  )
    throw new RangeError('invalid terrain protected-cell grid');
  const bitmap = new Uint8Array(cells * cells).fill(1);
  let work = 0,
    points = 0;
  const charge = () => {
    if (++work > MAX_WORK) throw LIMIT;
  };
  const finish = (status: TerrainProtectedCellDiagnostics['status']) => {
    if (status !== 'ok') bitmap.fill(1);
    const protectedCount = bitmap.reduce((sum, n) => sum + n, 0);
    input.onDiagnostics?.(
      Object.freeze({
        status,
        failClosed: status !== 'ok',
        cells,
        protectedCount,
        unprotectedCount: bitmap.length - protectedCount,
        work,
        riverAaWorld: RIVER_AA_WORLD,
        lakePaintSupportWorld: LAKE_PAINT_SUPPORT_WORLD,
      }),
    );
    return bitmap;
  };
  const normalize = (raw: readonly ProtectedCellPoint[]): Ring | null => {
    if (!isArray(raw) || raw.length < 3 || raw.length > 4096 || !raw.every(finite)) return null;
    const ring = same(raw[0]!, raw[raw.length - 1]!) ? raw.slice(0, -1) : raw;
    points += ring.length;
    if (ring.length < 3 || points > MAX_POINTS || !ring.every(finite)) return null;
    let area = 0;
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      if (same(a, b)) return null;
      area += a.x * b.y - b.x * a.y;
      box.left = Math.min(box.left, a.x);
      box.right = Math.max(box.right, a.x);
      box.top = Math.min(box.top, a.y);
      box.bottom = Math.max(box.bottom, a.y);
      for (let j = i + 1; j < ring.length; j++) {
        charge();
        if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
        if (intersects(a, b, ring[j]!, ring[(j + 1) % ring.length]!)) return null;
      }
    }
    return area === 0 ? null : { points: ring, box };
  };
  try {
    if (
      !isArray(input.landPolygons) ||
      input.landPolygons.length > 128 ||
      !input.waterGeometry ||
      !isArray(input.waterGeometry.lakes) ||
      !isArray(input.waterGeometry.rivers) ||
      input.waterGeometry.lakes.length > 128 ||
      input.waterGeometry.rivers.length > 128
    )
      return finish('invalidGeometry');
    const land = input.landPolygons.map(normalize),
      lakes = input.waterGeometry.lakes.map((lake) => normalize(lake?.points));
    if (land.some((ring) => ring === null) || lakes.some((ring) => ring === null))
      return finish('invalidGeometry');
    const validLand = land as Ring[],
      validLakes = lakes as Ring[];
    const segments = [];
    for (const river of input.waterGeometry.rivers) {
      if (!river || !isArray(river.displaySegments)) return finish('invalidGeometry');
      for (const s of river.displaySegments) {
        charge();
        if (
          segments.length >= MAX_SEGMENTS ||
          !finite(s?.a) ||
          !finite(s?.b) ||
          !Number.isFinite(s.width) ||
          s.width <= 0 ||
          s.width > worldSize
        )
          return finish('invalidGeometry');
        segments.push({ a: s.a, b: s.b, radius: s.width / 2 + RIVER_AA_WORLD });
      }
    }
    const size = worldSize / cells;
    const cellBox = (row: number, col: number): Box => ({
      left: col * size,
      top: row * size,
      right: (col + 1) * size,
      bottom: (row + 1) * size,
    });
    for (let row = 0; row < cells; row++)
      for (let col = 0; col < cells; col++) {
        charge();
        const box = cellBox(row, col);
        // A single polygon must contain ALL corners, and NO actual coast boundary
        // may cross/touch/lie inside the full cell (including contained islands).
        const contained = validLand.some(
          (ring) =>
            ring.box.left < box.left &&
            ring.box.right > box.right &&
            ring.box.top < box.top &&
            ring.box.bottom > box.bottom &&
            corners(box).every((p) => inside(p, ring, charge)),
        );
        if (
          !contained ||
          validLand.some(
            (ring) => overlaps(ring.box, box) && boundaryTouchesCell(ring, box, charge),
          )
        )
          continue;
        bitmap[row * cells + col] = 0;
      }
    const visit = (bounds: Box, test: (box: Box) => boolean) => {
      if (
        bounds.right < 0 ||
        bounds.bottom < 0 ||
        bounds.left > worldSize ||
        bounds.top > worldSize
      )
        return;
      // Include both sides of exact grid-line tangencies.
      const left = Math.max(0, Math.ceil(bounds.left / size) - 1),
        right = Math.min(cells - 1, Math.floor(bounds.right / size));
      const top = Math.max(0, Math.ceil(bounds.top / size) - 1),
        bottom = Math.min(cells - 1, Math.floor(bounds.bottom / size));
      for (let row = top; row <= bottom; row++)
        for (let col = left; col <= right; col++) {
          charge();
          const index = row * cells + col;
          if (bitmap[index] === 0 && test(cellBox(row, col))) bitmap[index] = 1;
        }
    };
    for (const lake of validLakes)
      visit(
        lake.box,
        (box) =>
          boundaryTouchesCell(lake, box, charge) ||
          corners(box).some((p) => inside(p, lake, charge)) ||
          lake.points.some((p) => inBox(p, box)),
      );
    for (const lake of validLakes)
      for (let i = 0; i < lake.points.length; i++) {
        const a = lake.points[i]!,
          b = lake.points[(i + 1) % lake.points.length]!;
        const box = segmentBox(a, b),
          radius = LAKE_PAINT_SUPPORT_WORLD;
        visit(
          {
            left: box.left - radius,
            right: box.right + radius,
            top: box.top - radius,
            bottom: box.bottom + radius,
          },
          (cell) => capsuleTouchesCell(a, b, radius, cell),
        );
      }
    for (const s of segments) {
      const box = segmentBox(s.a, s.b);
      visit(
        {
          left: box.left - s.radius,
          right: box.right + s.radius,
          top: box.top - s.radius,
          bottom: box.bottom + s.radius,
        },
        (cell) => capsuleTouchesCell(s.a, s.b, s.radius, cell),
      );
    }
    return finish('ok');
  } catch (error) {
    if (error === LIMIT) return finish('workLimit');
    throw error;
  }
}
