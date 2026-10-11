export interface ElevationPoint {
  readonly x: number;
  readonly y: number;
}
export interface ElevationMountain {
  readonly tier: 1 | 2 | 3;
  readonly mass: readonly ElevationPoint[];
  readonly ridges: readonly (readonly ElevationPoint[])[];
}
const PEAK = { 1: 8, 2: 14, 3: 20 } as const;
const X = -0.18;
const HEIGHT_LIPSCHITZ = 7 / 32;
const CONTRACTION = Math.hypot(X, 1) * HEIGHT_LIPSCHITZ;
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
/** Presentation only. Edge distance extended by zero outside is 1-Lipschitz.
 * Each ridge distance is 1-Lipschitz, tanh'<=1 and exp(-d/w)'<=1/w.
 * With w=8*peak the product's height Lipschitz bound is 1/8+3/32=7/32.
 * Max preserves that bound, hence scene displacement is a contraction <1.
 * This proves a unique global inverse, including overlapping/narrow masses.
 * Optional display-land cap is max over rings of (7/32)*interior boundary distance,
 * zero outside. Min with mountain height retains the bound. Thus displacement
 * length <= CONTRACTION*distance-to-boundary < distance-to-boundary: land remains land.
 */
export function createTerrainElevation(
  input: readonly ElevationMountain[],
  displayLand?: readonly (readonly ElevationPoint[])[],
) {
  if (input.length > 64) throw new RangeError('elevation mountain budget');
  let points = 0;
  const mountains = input.map((m) => {
    if (
      (m.tier !== 1 && m.tier !== 2 && m.tier !== 3) ||
      m.mass.length < 3 ||
      m.mass.length > 512 ||
      m.ridges.length > 128
    )
      throw new RangeError('invalid elevation mountain');
    const rings = [m.mass, ...m.ridges];
    for (const ring of rings) {
      if (ring.length > 512) throw new RangeError('elevation ring budget');
      points += ring.length;
      if (points > 8192 || !ring.every(finite)) throw new RangeError('invalid elevation points');
    }
    return {
      tier: m.tier,
      minX: Math.min(...m.mass.map((p) => p.x)),
      maxX: Math.max(...m.mass.map((p) => p.x)),
      minY: Math.min(...m.mass.map((p) => p.y)),
      maxY: Math.max(...m.mass.map((p) => p.y)),
      mass: m.mass.map((p) => ({ x: p.x, y: p.y })),
      ridges: m.ridges.map((r) => r.map((p) => ({ x: p.x, y: p.y }))),
    };
  });
  if (
    displayLand &&
    (displayLand.length > 16 || displayLand.some((r) => r.length < 3 || r.length > 8192))
  )
    throw new RangeError('elevation land budget');
  let landPoints = 0;
  const land = displayLand?.map((r) => {
    landPoints += r.length;
    if (landPoints > 8192 || !r.every(finite)) throw new RangeError('invalid elevation land');
    return {
      ring: r.map((p) => ({ x: p.x, y: p.y })),
      minX: Math.min(...r.map((p) => p.x)),
      maxX: Math.max(...r.map((p) => p.x)),
      minY: Math.min(...r.map((p) => p.y)),
      maxY: Math.max(...r.map((p) => p.y)),
    };
  });
  const sample = (p: ElevationPoint) => {
    if (!finite(p)) throw new RangeError('invalid elevation query');
    let height = 0;
    for (const m of mountains) {
      if (p.x < m.minX || p.x > m.maxX || p.y < m.minY || p.y > m.maxY) continue;
      if (!inside(p, m.mass)) continue;
      let edge = Infinity,
        ridge = Infinity;
      for (let i = 0; i < m.mass.length; i++)
        edge = Math.min(edge, distance(p, m.mass[i]!, m.mass[(i + 1) % m.mass.length]!));
      for (const ring of m.ridges) {
        if (ring.length === 1)
          ridge = Math.min(ridge, Math.hypot(p.x - ring[0]!.x, p.y - ring[0]!.y));
        for (let i = 1; i < ring.length; i++)
          ridge = Math.min(ridge, distance(p, ring[i - 1]!, ring[i]!));
      }
      const peak = PEAK[m.tier],
        width = 8 * peak;
      const crest = Number.isFinite(ridge) ? Math.exp(-ridge / width) : 1;
      height = Math.max(height, peak * Math.tanh(edge / width) * (0.25 + 0.75 * crest));
    }
    if (land && height > 0) {
      let safeHeight = 0;
      for (const r of land) {
        if (p.x < r.minX || p.x > r.maxX || p.y < r.minY || p.y > r.maxY || !inside(p, r.ring))
          continue;
        let edge = Infinity;
        for (let i = 0; i < r.ring.length; i++)
          edge = Math.min(edge, distance(p, r.ring[i]!, r.ring[(i + 1) % r.ring.length]!));
        safeHeight = Math.max(safeHeight, HEIGHT_LIPSCHITZ * edge);
      }
      height = Math.min(height, safeHeight);
    }
    return height;
  };
  const project = (p: ElevationPoint) => {
    const h = sample(p);
    return { x: p.x + X * h, y: p.y - h };
  };
  const unprojectWithDiagnostics = (scene: ElevationPoint) => {
    if (!finite(scene)) throw new RangeError('invalid elevation query');
    let p = { x: scene.x, y: scene.y };
    for (let iteration = 1; iteration <= 64; iteration++) {
      const h = sample(p),
        next = { x: scene.x - X * h, y: scene.y + h };
      const errorBound = (CONTRACTION / (1 - CONTRACTION)) * Math.hypot(next.x - p.x, next.y - p.y);
      p = next;
      if (errorBound <= 1e-9) return { point: p, iterations: iteration, errorBound };
    }
    throw new Error('elevation inverse did not converge');
  };
  return {
    sample,
    project,
    unproject: (p: ElevationPoint) => unprojectWithDiagnostics(p).point,
    unprojectWithDiagnostics,
    bounds: Object.freeze({
      maximumHeight: 20,
      heightLipschitz: HEIGHT_LIPSCHITZ,
      displacementLipschitz: CONTRACTION,
      maximumIterations: 64,
      maximumPoints: 8192,
      maximumLandPoints: 8192,
      // One query: bounded polygon ray tests + segment distances; no grid/cache allocation.
      maximumQueryEdgeVisits: 2 * (points + landPoints),
    }),
  };
}
