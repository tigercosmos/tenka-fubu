import { BufferImageSource, Matrix, Texture } from 'pixi.js';
import { LAKE_SURFACE, RIVER_TAPER_HEAD } from '../mapViewConfig';

export interface RiverSurfacePoint {
  readonly x: number;
  readonly y: number;
}
export interface RiverSurfaceSegment {
  readonly a: RiverSurfacePoint;
  readonly b: RiverSurfacePoint;
  readonly width: number;
}
export interface RiverSurfaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type RiverBoundsTuple = readonly [number, number, number, number];
export const riverBoundsTuple = (bounds: RiverSurfaceBounds): RiverBoundsTuple =>
  Object.freeze([bounds.x, bounds.y, bounds.width, bounds.height]);
/** Observe the original object through independent public reads; never repair it. */
export function inspectRiverBounds(bounds: RiverSurfaceBounds) {
  const keys = ['x', 'y', 'width', 'height'] as const;
  return Object.freeze({
    tuple: riverBoundsTuple(bounds),
    nativeJSON: JSON.stringify(bounds),
    descriptorValues: Object.freeze(
      keys.map((key) => {
        const value: unknown = Object.getOwnPropertyDescriptor(bounds, key)?.value;
        return typeof value === 'number' ? value : null;
      }),
    ),
    descriptorFlags: Object.freeze(
      keys.map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(bounds, key);
        return Object.freeze({
          writable: descriptor?.writable === true,
          configurable: descriptor?.configurable === true,
          enumerable: descriptor?.enumerable === true,
          data: descriptor !== undefined && 'value' in descriptor,
        });
      }),
    ),
    frozen: Object.isFrozen(bounds),
  });
}
export const RIVER_SURFACE_LIMITS = {
  maxRivers: 32,
  maxPoints: 256,
  maxTexels: 32768,
  maxSide: 512,
  minAlong: 128,
} as const;
const channels = (color: number) => [16, 8, 0].map((shift) => (color >> shift) & 255);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Static decorative reflection; the caller's tapered round strokes own all geometry.
 * A broad bent bounding box spends more of the bounded texture on unused area, so the
 * returned transverseTexels is an honest sampling estimate, not a universal detail guarantee.
 */
export function riverSurfacePixels(
  points: readonly RiverSurfacePoint[],
  baseWidth: number,
  taper = RIVER_TAPER_HEAD,
  displaySegments?: readonly RiverSurfaceSegment[],
) {
  if (
    points.length < 2 ||
    points.length > RIVER_SURFACE_LIMITS.maxPoints ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
    !Number.isFinite(baseWidth) ||
    baseWidth <= 0 ||
    baseWidth > 128 ||
    !Number.isFinite(taper) ||
    taper <= 0 ||
    taper > 1
  )
    return null;
  if (
    displaySegments &&
    (displaySegments.length > RIVER_SURFACE_LIMITS.maxPoints ||
      !displaySegments.length ||
      displaySegments.some(
        (s) =>
          ![s.a.x, s.a.y, s.b.x, s.b.y, s.width].every(Number.isFinite) ||
          s.width <= 0 ||
          s.width > baseWidth,
      ))
  )
    return null;
  const sourceSegments =
    displaySegments ??
    points.slice(1).map((b, i) => ({
      a: points[i]!,
      b,
      width: baseWidth * (points.length > 2 ? taper + ((1 - taper) * i) / (points.length - 2) : 1),
    }));
  let arc = 0;
  const segments = sourceSegments.map(({ a, b, width }) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const radius = width / 2;
    const length = Math.sqrt(length2),
      start = arc;
    arc += length;
    return { a, dx, dy, length2, radius, length, start };
  });
  if (
    segments.some((s) => !Number.isFinite(s.length2) || s.length2 <= 0 || s.radius * s.radius === 0)
  )
    return null;
  const half = baseWidth / 2;
  const x = Math.min(...points.map((p) => p.x)) - half,
    y = Math.min(...points.map((p) => p.y)) - half;
  const worldWidth = Math.max(...points.map((p) => p.x)) + half - x;
  const worldHeight = Math.max(...points.map((p) => p.y)) + half - y;
  if (
    ![x, y, worldWidth, worldHeight, x + worldWidth, y + worldHeight].every(Number.isFinite) ||
    worldWidth <= 0 ||
    worldHeight <= 0 ||
    !Number.isFinite(worldWidth * worldHeight)
  )
    return null;
  const desired = Math.min(
    16 / baseWidth,
    RIVER_SURFACE_LIMITS.maxSide / Math.max(worldWidth, worldHeight),
  );
  const budget = Math.sqrt(RIVER_SURFACE_LIMITS.maxTexels / (worldWidth * worldHeight));
  const scale = Math.min(desired, budget);
  let width = Math.max(8, Math.floor(worldWidth * scale)),
    height = Math.max(8, Math.floor(worldHeight * scale));
  if (worldWidth >= worldHeight) width = Math.max(RIVER_SURFACE_LIMITS.minAlong, width);
  else height = Math.max(RIVER_SURFACE_LIMITS.minAlong, height);
  // Minimum minor-side sampling can otherwise overrun the area cap on extreme aspect ratios.
  if (width * height > RIVER_SURFACE_LIMITS.maxTexels) {
    if (width >= height) height = Math.floor(RIVER_SURFACE_LIMITS.maxTexels / width);
    else width = Math.floor(RIVER_SURFACE_LIMITS.maxTexels / height);
  }
  const pixels = new Uint8Array(width * height * 4);
  const light = channels(LAKE_SURFACE.material.shallowColor),
    dark = channels(LAKE_SURFACE.material.interiorColor);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const px = ((col + 0.5) * worldWidth) / width,
        py = ((row + 0.5) * worldHeight) / height;
      let distance = Infinity;
      let nearestAlong = 0,
        nearestDaylight = 0,
        nearestSide = 0;
      let weightSum = 0,
        alongSum = 0,
        daylightSum = 0,
        sideSum = 0;
      for (const segment of segments) {
        const ax = segment.a.x - x,
          ay = segment.a.y - y;
        const t = Math.max(
          0,
          Math.min(1, ((px - ax) * segment.dx + (py - ay) * segment.dy) / segment.length2),
        );
        const dx = px - ax - t * segment.dx,
          dy = py - ay - t * segment.dy;
        const normalized = (dx * dx + dy * dy) / (segment.radius * segment.radius);
        const along = segment.start + t * segment.length;
        const daylight = Math.max(-1, Math.min(1, (-0.6 * dx - 0.8 * dy) / segment.radius));
        const side = (-segment.dy * dx + segment.dx * dy) / (segment.length * segment.radius);
        if (normalized < distance) {
          distance = normalized;
          nearestAlong = along;
          nearestDaylight = daylight;
          nearestSide = side;
        }
        const weight = Math.max(0, 1 - normalized / 9) ** 3;
        weightSum += weight;
        alongSum += weight * along;
        daylightSum += weight * daylight;
        sideSum += weight * side;
      }
      const along = weightSum > 0 ? alongSum / weightSum : nearestAlong;
      const daylight = weightSum > 0 ? daylightSum / weightSum : nearestDaylight;
      const side = weightSum > 0 ? sideSum / weightSum : nearestSide;
      const bank = smooth(Math.max(0, Math.min(1, (Math.sqrt(distance) - 0.25) / 0.75)));
      const variation =
        (Math.sin(along * 0.07) * 3.4 + Math.sin(along * 0.027) * 2.2) * (1 - bank * 0.25);
      const reflection = Math.exp(-(((side + 0.18) / 0.4) ** 2)) * 0.1 * (1 - bank);
      const offset = (row * width + col) * 4;
      for (let c = 0; c < 3; c++)
        pixels[offset + c] = Math.round(
          dark[c]! +
            (light[c]! - dark[c]!) * (bank * (0.65 + daylight * 0.2) + reflection) +
            variation,
        );
      pixels[offset + 3] = 255;
    }
  // Independent primitive capture before constructing the public bounds object.
  // Diagnostic evidence only: these values do not drive texture or paint setup.
  const boundsScalars: RiverBoundsTuple = Object.freeze([x, y, worldWidth, worldHeight]);
  const bounds = Object.freeze({ x, y, width: worldWidth, height: worldHeight });
  const boundsAtAllocation = inspectRiverBounds(bounds);
  return {
    width,
    height,
    pixels,
    bounds,
    boundsScalars,
    boundsLiteralReference: bounds,
    boundsAtAllocation,
    transverseTexels: baseWidth * Math.min(width / worldWidth, height / worldHeight),
  };
}

/** Explicit diagnostic invocation only; no texture, matrix or retained pixel buffer. */
export function probeRiverSurfaceBoundsPair(
  firstPoints: readonly RiverSurfacePoint[],
  firstWidth: number,
  secondPoints: readonly RiverSurfacePoint[],
  secondWidth: number,
) {
  const first = riverSurfacePixels(firstPoints, firstWidth);
  if (!first) return null;
  const reference = first.bounds;
  const originalValues = first.boundsScalars;
  const identities = new Map([[reference, originalValues]]);
  const sameValueEvidence = () => {
    const beforeOperation = inspectRiverBounds(reference);
    // SameValue definitions on non-writable, non-configurable data properties
    // are legal no-ops. Never define an alternate value or repair the object.
    const accepted = Object.freeze(
      (['x', 'y', 'width', 'height'] as const).map((key, index) =>
        Reflect.defineProperty(reference, key, { value: originalValues[index] }),
      ),
    );
    return Object.freeze({
      originalValues,
      beforeOperation,
      accepted,
      afterOperation: inspectRiverBounds(reference),
      mapHasOriginal: identities.has(reference),
      mapHasCurrent: identities.has(first.bounds),
      mapKeyEqualsOriginal: identities.keys().next().value === reference,
      mapValueEqualsAllocation: identities.get(reference) === originalValues,
      currentEqualsOriginal: first.bounds === reference,
    });
  };
  const before = inspectRiverBounds(reference);
  const sameValueBefore = sameValueEvidence();
  const second = riverSurfacePixels(secondPoints, secondWidth);
  if (!second) return null;
  const after = inspectRiverBounds(first.bounds);
  const sameValueAfter = sameValueEvidence();
  return Object.freeze({
    before,
    after,
    sameValueBefore,
    sameValueAfter,
    second: inspectRiverBounds(second.bounds),
    sourceScalars: first.boundsScalars,
    secondSourceScalars: second.boundsScalars,
    firstEqualsOriginal: first.bounds === reference,
    firstEqualsSecond: first.bounds === second.bounds,
    firstDimensions: Object.freeze([first.width, first.height] as const),
    secondDimensions: Object.freeze([second.width, second.height] as const),
    firstRgbaBytes: first.pixels.byteLength,
    secondRgbaBytes: second.pixels.byteLength,
  });
}

export type RiverMaterialFactoryStage =
  | 'beforePixels'
  | 'afterPixels'
  | 'beforeSource'
  | 'afterSource'
  | 'beforeTexture'
  | 'afterTexture'
  | 'beforeMatrix'
  | 'afterMatrix'
  | 'beforeReturn';

export function createRiverSurfaceMaterial(
  points: readonly RiverSurfacePoint[],
  baseWidth: number,
  taper = RIVER_TAPER_HEAD,
  displaySegments?: readonly RiverSurfaceSegment[],
  observeFactoryStage?: (stage: RiverMaterialFactoryStage) => void,
) {
  observeFactoryStage?.('beforePixels');
  const surface = riverSurfacePixels(points, baseWidth, taper, displaySegments);
  observeFactoryStage?.('afterPixels');
  if (!surface) return null;
  observeFactoryStage?.('beforeSource');
  const source = new BufferImageSource({
    resource: surface.pixels,
    width: surface.width,
    height: surface.height,
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha',
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
    autoGenerateMipmaps: false,
  });
  observeFactoryStage?.('afterSource');
  observeFactoryStage?.('beforeTexture');
  const texture = new Texture({ source });
  observeFactoryStage?.('afterTexture');
  observeFactoryStage?.('beforeMatrix');
  const transform = new Matrix(
    surface.bounds.width / surface.width,
    0,
    0,
    surface.bounds.height / surface.height,
    surface.bounds.x,
    surface.bounds.y,
  );
  observeFactoryStage?.('afterMatrix');
  const matrixTuple = () =>
    Object.freeze([
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.tx,
      transform.ty,
    ] as const);
  const matrixAtConstruction = matrixTuple();
  const boundsAfterMatrix = inspectRiverBounds(surface.bounds);
  const boundsAfterMatrixEqualsLiteral = surface.bounds === surface.boundsLiteralReference;
  const enforceClamp = () => {
    if (source.style.addressMode !== 'clamp-to-edge') {
      source.style.addressMode = 'clamp-to-edge';
      source.style.update();
    }
  };
  source.style.on('change', enforceClamp);
  let destroyed = false;
  observeFactoryStage?.('beforeReturn');
  return {
    texture,
    source,
    transform,
    matrix: transform,
    textureSpace: 'global' as const,
    width: surface.width,
    height: surface.height,
    bounds: surface.bounds,
    rgbaBytes: surface.pixels.byteLength,
    getBoundsTrace: (retainedBounds: RiverSurfaceBounds = surface.bounds) =>
      Object.freeze({
        sourceScalars: surface.boundsScalars,
        surfaceAtAllocation: surface.boundsAtAllocation,
        surfaceAfterMatrix: boundsAfterMatrix,
        surfaceLive: inspectRiverBounds(surface.bounds),
        boundsAfterMatrixEqualsLiteral,
        surfaceLiveEqualsLiteral: surface.bounds === surface.boundsLiteralReference,
        surfaceBounds: riverBoundsTuple(surface.bounds),
        materialBounds: riverBoundsTuple(retainedBounds),
        matrixAtConstruction,
        matrixLive: matrixTuple(),
        textureWidth: surface.width,
        textureHeight: surface.height,
        surfaceFrozen: Object.isFrozen(surface.bounds),
        materialFrozen: Object.isFrozen(retainedBounds),
        surfaceEqualsMaterial: surface.bounds === retainedBounds,
      }),
    getDiagnostics: () =>
      Object.freeze({
        width: surface.width,
        height: surface.height,
        transverseTexels: surface.transverseTexels,
        ownedTextures: destroyed ? 0 : 1,
        ownedSources: destroyed ? 0 : 1,
        ownedStyleListeners: destroyed ? 0 : 1,
        rgbaBytes: destroyed ? 0 : surface.pixels.byteLength,
      }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      source.style.off('change', enforceClamp);
      texture.destroy(true);
    },
  };
}
