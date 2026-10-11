import type { ElevationMountain, ElevationPoint } from './terrainElevation';

const PEAK = { 1: 20, 2: 40, 3: 64 } as const;
const L = 0.4;
const X = -0.18;
const CONTRACTION = Math.hypot(X, 1) * L;
const array = (value: unknown): boolean => Array.isArray(value);
const finite = (p: ElevationPoint) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6;
function distance(p: ElevationPoint, a: ElevationPoint, b: ElevationPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function inside(p: ElevationPoint, ring: readonly ElevationPoint[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
}
/** Presentation foothills, NOT new canonical geography. Influence may extend outside
 * the authored mass, but its centerlines are exclusively authored ridge polylines.
 * Distance to their union is 1-Lipschitz. The ridge profile has a center cusp
 * with one-sided slope L (no analytic gradient at the crest), then a quadratic
 * toe joined C1 to the straight face and zero exterior. With toe=.2*peak,
 * join=(peak-toe)/L and R=(peak+toe)/L, every one-sided derivative is <=L.
 * It is NOT globally C1, including max-union creases. Max across bands and min
 * with the same land-distance cap preserve L and displacement contraction <1.
 */
export function createTerrainTopography(
  input: readonly ElevationMountain[],
  displayLand?: readonly (readonly ElevationPoint[])[],
) {
  if (!array(input) || input.length > 64) throw new RangeError('topography mountain budget');
  let points = 0;
  const bands = input.map((m) => {
    if (
      !m ||
      (m.tier !== 1 && m.tier !== 2 && m.tier !== 3) ||
      !array(m.mass) ||
      m.mass.length < 3 ||
      m.mass.length > 512 ||
      !array(m.ridges) ||
      m.ridges.length > 128
    )
      throw new RangeError('invalid topography mountain');
    for (const ring of [m.mass, ...m.ridges]) {
      if (!array(ring) || ring.length > 512) throw new RangeError('topography ring budget');
      points += ring.length;
      if (points > 8192 || !ring.every((p) => p && finite(p)))
        throw new RangeError('invalid topography points');
    }
    const ridges = m.ridges.map((r) => r.map((p) => ({ x: p.x, y: p.y })));
    const ridgePoints = ridges.flat(),
      peak = PEAK[m.tier],
      toe = 0.2 * peak,
      join = (peak - toe) / L,
      radius = (peak + toe) / L;
    return {
      peak,
      toe,
      join,
      radius,
      ridges,
      minX: ridgePoints.length ? Math.min(...ridgePoints.map((p) => p.x)) - radius : Infinity,
      maxX: ridgePoints.length ? Math.max(...ridgePoints.map((p) => p.x)) + radius : -Infinity,
      minY: ridgePoints.length ? Math.min(...ridgePoints.map((p) => p.y)) - radius : Infinity,
      maxY: ridgePoints.length ? Math.max(...ridgePoints.map((p) => p.y)) + radius : -Infinity,
    };
  });
  if (
    displayLand &&
    (!array(displayLand) ||
      displayLand.length > 16 ||
      displayLand.some((r) => !array(r) || r.length < 3 || r.length > 8192))
  )
    throw new RangeError('topography land budget');
  let landPoints = 0;
  const land = displayLand?.map((r) => {
    landPoints += r.length;
    if (landPoints > 8192 || !r.every((p) => p && finite(p)))
      throw new RangeError('invalid topography land');
    return r.map((p) => ({ x: p.x, y: p.y }));
  });
  const sample = (p: ElevationPoint) => {
    if (!p || !finite(p)) throw new RangeError('invalid topography query');
    let height = 0;
    for (const b of bands) {
      if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
      let d = Infinity;
      for (const r of b.ridges) {
        if (r.length === 1) d = Math.min(d, Math.hypot(p.x - r[0]!.x, p.y - r[0]!.y));
        for (let i = 1; i < r.length; i++) d = Math.min(d, distance(p, r[i - 1]!, r[i]!));
      }
      const ridgeHeight =
        d <= b.join
          ? b.peak - L * d
          : d < b.radius
            ? (L * L * (b.radius - d) ** 2) / (4 * b.toe)
            : 0;
      height = Math.max(height, ridgeHeight);
    }
    if (land && height > 0) {
      let safe = 0;
      for (const ring of land) {
        if (!inside(p, ring)) continue;
        let d = Infinity;
        for (let i = 0; i < ring.length; i++)
          d = Math.min(d, distance(p, ring[i]!, ring[(i + 1) % ring.length]!));
        safe = Math.max(safe, L * d);
      }
      height = Math.min(height, safe);
    }
    return height;
  };
  const project = (p: ElevationPoint) => {
    const h = sample(p);
    return { x: p.x + X * h, y: p.y - h };
  };
  const unprojectWithDiagnostics = (scene: ElevationPoint) => {
    if (!scene || !finite(scene)) throw new RangeError('invalid topography query');
    let p = { x: scene.x, y: scene.y };
    for (let iteration = 1; iteration <= 64; iteration++) {
      const h = sample(p),
        next = { x: scene.x - X * h, y: scene.y + h };
      const errorBound = (CONTRACTION / (1 - CONTRACTION)) * Math.hypot(next.x - p.x, next.y - p.y);
      p = next;
      if (errorBound <= 1e-9) return { point: p, iterations: iteration, errorBound };
    }
    throw new Error('topography inverse did not converge');
  };
  return {
    sample,
    project,
    unproject: (p: ElevationPoint) => unprojectWithDiagnostics(p).point,
    unprojectWithDiagnostics,
    bounds: Object.freeze({
      maximumHeight: 64,
      heightLipschitz: L,
      displacementLipschitz: CONTRACTION,
      maximumIterations: 64,
      maximumPoints: 8192,
      maximumLandPoints: 8192,
      maximumQueryEdgeVisits: 2 * (points + landPoints),
    }),
  };
}
