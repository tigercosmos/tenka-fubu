import type { ElevationPoint } from './terrainElevation';
export interface SampledElevationBase {
  sample(point: ElevationPoint): number;
  readonly bounds: { readonly heightLipschitz: number; readonly maximumHeight: number };
}
export interface SampledElevationOptions {
  readonly worldSize?: number;
  readonly cells?: number;
  readonly protectedCells?: readonly boolean[] | Uint8Array;
}
/** Exact squared Euclidean distance transform, O(side²), not chamfer distance. */
function edtLine(input: Float64Array, output: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < input.length; q++) {
    let s = 0;
    do {
      const p = v[k]!;
      s = (input[q]! + q * q - (input[p]! + p * p)) / (2 * (q - p));
      if (s <= z[k]!) k--;
      else break;
    } while (k >= 0);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < input.length; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    output[q] = (q - p) ** 2 + input[p]!;
  }
}
/** The SAME piecewise-affine field rendered by the global grid: diagonal 00→11.
 * Vertex Lipschitz bound L is preserved by min(base,L*distance-to-zero-vertices).
 * Each triangle's two axial derivatives are <=L, so |gradient|<=sqrt(2)*L.
 * Displacement contraction remains <1. Query work is constant (three vertices).
 */
export function createSampledTerrainElevation(
  base: SampledElevationBase,
  options: SampledElevationOptions = {},
) {
  const world = options.worldSize ?? 4096,
    cells = options.cells ?? 128,
    protectedCells = options.protectedCells;
  if (
    !Number.isFinite(world) ||
    world <= 0 ||
    world > 4096 ||
    !Number.isInteger(cells) ||
    cells < 1 ||
    cells > 128 ||
    (protectedCells && protectedCells.length !== cells * cells)
  )
    throw new RangeError('sampled elevation budget');
  if (protectedCells)
    for (const value of protectedCells)
      if (value !== true && value !== false && value !== 0 && value !== 1)
        throw new RangeError('invalid protected cells');
  const side = cells + 1,
    step = world / cells,
    L = base.bounds.heightLipschitz,
    maximumHeight = base.bounds.maximumHeight,
    heights = new Float64Array(side * side),
    zeros = new Uint8Array(side * side);
  if (!Number.isFinite(L) || L <= 0 || L > 0.4)
    throw new RangeError('invalid base Lipschitz bound');
  if (!Number.isFinite(maximumHeight) || maximumHeight < 0 || maximumHeight > 64)
    throw new RangeError('invalid base height bound');
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x,
        h = base.sample({ x: x * step, y: y * step });
      if (!Number.isFinite(h) || h < 0 || h > maximumHeight)
        throw new RangeError('invalid base height');
      heights[i] = h;
      if (h === 0 || x === 0 || y === 0 || x === cells || y === cells) zeros[i] = 1;
    }
  if (protectedCells)
    for (let y = 0; y < cells; y++)
      for (let x = 0; x < cells; x++)
        if (protectedCells[y * cells + x])
          for (const i of [
            y * side + x,
            y * side + x + 1,
            (y + 1) * side + x,
            (y + 1) * side + x + 1,
          ])
            zeros[i] = 1;
  const grid = new Float64Array(side * side),
    line = new Float64Array(side),
    out = new Float64Array(side),
    v = new Int32Array(side),
    z = new Float64Array(side + 1);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) line[x] = zeros[y * side + x] ? 0 : 1e20;
    edtLine(line, out, v, z);
    grid.set(out, y * side);
  }
  for (let x = 0; x < side; x++) {
    for (let y = 0; y < side; y++) line[y] = grid[y * side + x]!;
    edtLine(line, out, v, z);
    for (let y = 0; y < side; y++) {
      const i = y * side + x;
      heights[i] = Math.min(heights[i]!, L * Math.sqrt(out[y]!) * step);
    }
  }
  // Verify actual axial slopes before admitting a field to camera inversion.
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (
        (x < cells && Math.abs(heights[i]! - heights[i + 1]!) > L * step + 1e-10) ||
        (y < cells && Math.abs(heights[i]! - heights[i + side]!) > L * step + 1e-10)
      )
        throw new RangeError('base field exceeds Lipschitz bound');
    }
  const sample = (p: ElevationPoint) => {
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.x) > 1e6 ||
      Math.abs(p.y) > 1e6
    )
      throw new RangeError('invalid sampled query');
    if (p.x < 0 || p.y < 0 || p.x > world || p.y > world) return 0;
    const gx = p.x / step,
      gy = p.y / step,
      x = Math.min(cells - 1, Math.floor(gx)),
      y = Math.min(cells - 1, Math.floor(gy)),
      u = gx - x,
      w = gy - y,
      i = y * side + x;
    return w <= u
      ? heights[i]! * (1 - u) + heights[i + 1]! * (u - w) + heights[i + side + 1]! * w
      : heights[i]! * (1 - w) + heights[i + side + 1]! * u + heights[i + side]! * (w - u);
  };
  const contraction = Math.SQRT2 * L * Math.hypot(0.18, 1);
  const project = (p: ElevationPoint) => {
    const h = sample(p);
    return { x: p.x - 0.18 * h, y: p.y - h };
  };
  const unprojectWithDiagnostics = (scene: ElevationPoint) => {
    sample(scene);
    let p = { x: scene.x, y: scene.y };
    for (let iterations = 1; iterations <= 64; iterations++) {
      const h = sample(p),
        next = { x: scene.x + 0.18 * h, y: scene.y + h },
        errorBound = (contraction / (1 - contraction)) * Math.hypot(next.x - p.x, next.y - p.y);
      p = next;
      if (errorBound <= 1e-9) return { point: p, iterations, errorBound };
    }
    throw new Error('sampled inverse did not converge');
  };
  return {
    sample,
    project,
    unproject: (p: ElevationPoint) => unprojectWithDiagnostics(p).point,
    unprojectWithDiagnostics,
    vertexHeights: Object.freeze(Array.from(heights)),
    bounds: Object.freeze({
      worldSize: world,
      cells,
      step,
      maximumHeight,
      heightLipschitz: Math.SQRT2 * L,
      vertexLipschitz: L,
      displacementLipschitz: contraction,
      maximumIterations: 64,
      maximumQueryEdgeVisits: 0,
      maximumQueryVertices: 3,
    }),
  };
}
