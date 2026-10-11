import { BufferImageSource, Texture } from 'pixi.js';
import { LAKE_SURFACE } from '../mapViewConfig';
import type { LakePoint } from './displayLakeGeometry';

export interface LakeSurfacePixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}

const cross = (a: LakePoint, b: LakePoint, c: LakePoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: LakePoint, b: LakePoint, c: LakePoint, d: LakePoint) {
  return (
    !(
      Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
      Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
      Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
      Math.max(c.y, d.y) < Math.min(a.y, b.y)
    ) &&
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0
  );
}
const channels = (color: number) => [16, 8, 0].map((shift) => (color >> shift) & 255);
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Decorative bank tint and sky reflection only; no bathymetry, time or simulation input. */
export function lakeSurfacePixels(points: readonly LakePoint[]): LakeSurfacePixels | null {
  const config = LAKE_SURFACE.material;
  if (
    points.length < 3 ||
    points.length > config.maxVertices ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return null;
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  const worldWidth = Math.max(...points.map((p) => p.x)) - x;
  const worldHeight = Math.max(...points.map((p) => p.y)) - y;
  if (![worldWidth, worldHeight].every((v) => Number.isFinite(v) && v > 1e-6)) return null;
  const local = points.map((p) => ({ x: p.x - x, y: p.y - y }));
  let area = 0;
  const edges = local.map((a, i) => {
    const b = local[(i + 1) % local.length]!;
    area += a.x * b.y - a.y * b.x;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    return { a, b, dx, dy, length: dx * dx + dy * dy };
  });
  if (
    !Number.isFinite(area) ||
    Math.abs(area) < 1e-6 ||
    edges.some((e) => !Number.isFinite(e.length) || e.length <= 0)
  )
    return null;
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      if (j === i + 1 || (i === 0 && j === edges.length - 1)) continue;
      if (intersects(edges[i]!.a, edges[i]!.b, edges[j]!.a, edges[j]!.b)) return null;
    }
  const longest = Math.max(worldWidth, worldHeight);
  const width = Math.max(config.minSide, Math.ceil((config.maxSide * worldWidth) / longest));
  const height = Math.max(config.minSide, Math.ceil((config.maxSide * worldHeight) / longest));
  const pixels = new Uint8Array(width * height * 4);
  const shallow = channels(config.shallowColor),
    interior = channels(config.interiorColor);
  const reflection = channels(config.reflectionColor);
  const bankWidth = Math.min(config.shoreWidth, Math.min(worldWidth, worldHeight) * 0.2);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const px = ((col + 0.5) * worldWidth) / width,
        py = ((row + 0.5) * worldHeight) / height;
      let inside = false,
        distanceSquared = Infinity;
      for (const edge of edges) {
        const { a, b, dx, dy, length } = edge;
        if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / length));
        distanceSquared = Math.min(
          distanceSquared,
          (px - a.x - t * dx) ** 2 + (py - a.y - t * dy) ** 2,
        );
      }
      if (!inside) continue;
      const bank = 1 - smooth(Math.min(1, Math.sqrt(distanceSquared) / bankWidth));
      const nx = px / worldWidth,
        ny = py / worldHeight;
      const sky = Math.exp(-(((nx * 0.65 + ny * 0.35 - 0.32) / 0.23) ** 2)) * 0.24;
      const swell = (Math.cos(nx * 8 + ny * 17) + Math.cos(nx * 5 - ny * 23)) * 1.6 * (1 - bank);
      const offset = (row * width + col) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const base = interior[channel]! * (0.9 + 0.1 * bank);
        const bankTone = base + (shallow[channel]! - base) * bank;
        pixels[offset + channel] = Math.round(
          Math.max(
            0,
            Math.min(255, bankTone + (reflection[channel]! - bankTone) * sky * (1 - bank) + swell),
          ),
        );
      }
      pixels[offset + 3] = 255;
    }
  return {
    width,
    height,
    pixels,
    bounds: Object.freeze({ x, y, width: worldWidth, height: worldHeight }),
  };
}

export function createLakeSurfaceMaterial(points: readonly LakePoint[]) {
  const surface = lakeSurfacePixels(points);
  if (!surface) return null;
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
  const texture = new Texture({ source });
  const enforceClamp = () => {
    if (source.style.addressMode === 'clamp-to-edge') return;
    source.style.addressMode = 'clamp-to-edge';
    source.style.update();
  };
  source.style.on('change', enforceClamp);
  let destroyed = false;
  return {
    texture,
    source,
    width: surface.width,
    height: surface.height,
    rgbaBytes: surface.pixels.byteLength,
    bounds: surface.bounds,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      source.style.off('change', enforceClamp);
      texture.destroy(true);
    },
  };
}
