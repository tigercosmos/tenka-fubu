import { BufferImageSource, Container, Mesh, MeshGeometry, Texture } from 'pixi.js';
import type { OutlineGeometry } from '../displayCoast';
import { WORLD_SIZE } from '../mapViewConfig';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';

export const COAST_SURFACE = {
  seaWidth: 12,
  landWidth: 3,
  atlasWidth: 128,
  atlasHeight: 4,
  maxVertices: 4096,
  maxPolygons: 16,
  maxBucketInsertions: 150_000,
  maxIntersectionChecks: 300_000,
  maxGeometryBytes: 1_212_416,
} as const;
type Point = Readonly<{ x: number; y: number }>;
interface Edge {
  a: Point;
  b: Point;
  polygon: number;
  index: number;
  count: number;
}
export interface CoastRibbon {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}
export interface CoastProfile {
  sea: CoastRibbon;
  land: CoastRibbon;
  inputVertices: number;
  geometryBytes: number;
}
function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function intersects(a: Edge, b: Edge) {
  if (
    Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) ||
    Math.max(b.a.x, b.b.x) < Math.min(a.a.x, a.b.x) ||
    Math.max(a.a.y, a.b.y) < Math.min(b.a.y, b.b.y) ||
    Math.max(b.a.y, b.b.y) < Math.min(a.a.y, a.b.y)
  )
    return false;
  return (
    cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) <= 0 &&
    cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) <= 0
  );
}
function inside(p: Point, polygon: readonly Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
}
function prepare(outline: OutlineGeometry) {
  if (!outline.polygons.length || outline.polygons.length > COAST_SURFACE.maxPolygons) return null;
  const ids = new Set<string>(),
    polygons: Point[][] = [];
  let count = 0;
  for (const polygon of outline.polygons) {
    if (ids.has(polygon.id) || polygon.points.length % 2) return null;
    ids.add(polygon.id);
    count += polygon.points.length / 2;
    if (count > COAST_SURFACE.maxVertices) return null;
    const points: Point[] = [];
    for (let i = 0; i < polygon.points.length; i += 2) {
      const x = polygon.points[i]!,
        y = polygon.points[i + 1]!;
      if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= WORLD_SIZE)) return null;
      const previous = points.at(-1);
      if (!previous || previous.x !== x || previous.y !== y) points.push({ x, y });
    }
    if (points.length > 1 && points[0]!.x === points.at(-1)!.x && points[0]!.y === points.at(-1)!.y)
      points.pop();
    if (points.length < 3) return null;
    polygons.push(points);
  }
  const buckets = new Map<string, Edge[]>();
  let insertions = 0,
    checks = 0;
  for (let polygon = 0; polygon < polygons.length; polygon++) {
    const points = polygons[polygon]!;
    let area = 0;
    for (let index = 0; index < points.length; index++) {
      const a = points[index]!,
        b = points[(index + 1) % points.length]!;
      area +=
        (a.x - points[0]!.x) * (b.y - points[0]!.y) - (a.y - points[0]!.y) * (b.x - points[0]!.x);
      const edge = { a, b, polygon, index, count: points.length };
      const seen = new Set<Edge>();
      for (
        let y = Math.floor(Math.min(a.y, b.y) / 64);
        y <= Math.floor(Math.max(a.y, b.y) / 64);
        y++
      )
        for (
          let x = Math.floor(Math.min(a.x, b.x) / 64);
          x <= Math.floor(Math.max(a.x, b.x) / 64);
          x++
        ) {
          if (++insertions > COAST_SURFACE.maxBucketInsertions) return null;
          const key = `${x},${y}`,
            list = buckets.get(key) ?? [];
          for (const other of list) {
            if (seen.has(other)) continue;
            seen.add(other);
            if (
              other.polygon === polygon &&
              (Math.abs(other.index - index) === 1 ||
                Math.abs(other.index - index) === points.length - 1)
            )
              continue;
            if (++checks > COAST_SURFACE.maxIntersectionChecks || intersects(edge, other))
              return null;
          }
          list.push(edge);
          buckets.set(key, list);
        }
    }
    if (!Number.isFinite(area) || Math.abs(area) < 1e-6) return null;
  }
  for (let i = 0; i < polygons.length; i++)
    for (let j = i + 1; j < polygons.length; j++)
      if (inside(polygons[i]![0]!, polygons[j]!) || inside(polygons[j]![0]!, polygons[i]!))
        return null;
  return polygons;
}
function ribbon(
  polygons: readonly (readonly Point[])[],
  width: number,
  sea: boolean,
): CoastRibbon | null {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const add = (p: Point, u: number, v: number) => {
    const index = positions.length / 2;
    positions.push(p.x, p.y);
    uvs.push(u, v);
    return index;
  };
  for (const points of polygons) {
    let area = 0;
    const edges = points.map((a, i) => {
      const b = points[(i + 1) % points.length]!,
        length = Math.hypot(b.x - a.x, b.y - a.y);
      area +=
        (a.x - points[0]!.x) * (b.y - points[0]!.y) - (a.y - points[0]!.y) * (b.x - points[0]!.x);
      return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    });
    const side = Math.sign(area) * (sea ? -1 : 1);
    const normals = edges.map((edge) => ({ x: -edge.y * side, y: edge.x * side }));
    const joins = points.map((p, i) => {
      const prev = edges[(i + edges.length - 1) % edges.length]!,
        next = edges[i]!;
      if (prev.x * next.x + prev.y * next.y < -0.999999) return null;
      const a = normals[(i + normals.length - 1) % normals.length]!,
        b = normals[i]!;
      const length = Math.hypot(a.x + b.x, a.y + b.y);
      if (!length) return null;
      const outward = {
        x: ((a.x + b.x) / length) * (sea ? 1 : -1),
        y: ((a.y + b.y) / length) * (sea ? 1 : -1),
      };
      const shade = (1 + (outward.x + outward.y) / Math.SQRT2) / 2;
      const v = ((sea ? 0 : 2) + 0.5 + Math.max(0, Math.min(1, shade))) / COAST_SURFACE.atlasHeight;
      if ((prev.x * next.y - prev.y * next.x) * side > 1e-8) {
        const offset = {
          x: p.x + ((a.x + b.x) / length) * width,
          y: p.y + ((a.y + b.y) / length) * width,
        };
        return { incoming: offset, outgoing: offset, v };
      }
      return {
        incoming: { x: p.x + a.x * width, y: p.y + a.y * width },
        outgoing: { x: p.x + b.x * width, y: p.y + b.y * width },
        v,
      };
    });
    if (joins.some((join) => !join)) return null;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length,
        a = joins[i]!,
        b = joins[j]!;
      const start = add(points[i]!, 0, a.v);
      add(points[j]!, 0, b.v);
      add(a.outgoing, 1, a.v);
      add(b.incoming, 1, b.v);
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
      if (Math.hypot(a.incoming.x - a.outgoing.x, a.incoming.y - a.outgoing.y) > 1e-8) {
        const vertex = add(points[i]!, 0, a.v);
        add(a.incoming, 1, a.v);
        add(a.outgoing, 1, a.v);
        indices.push(vertex, vertex + 1, vertex + 2);
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** Decorative coast profile; the supplied shoreline anchors and canonical data never move. */
export function buildCoastProfile(outline: OutlineGeometry): CoastProfile | null {
  const polygons = prepare(outline);
  if (!polygons) return null;
  const sea = ribbon(polygons, COAST_SURFACE.seaWidth, true),
    land = ribbon(polygons, COAST_SURFACE.landWidth, false);
  if (!sea || !land) return null;
  const geometryBytes = [sea, land].reduce(
    (sum, r) => sum + r.positions.byteLength + r.uvs.byteLength + r.indices.byteLength,
    0,
  );
  if (geometryBytes > COAST_SURFACE.maxGeometryBytes) return null;
  return {
    sea,
    land,
    inputVertices: polygons.reduce((sum, polygon) => sum + polygon.length, 0),
    geometryBytes,
  };
}

export function coastProfilePixels() {
  const { atlasWidth: width, atlasHeight: height } = COAST_SURFACE,
    pixels = new Uint8Array(width * height * 4);
  const channels = (color: number) => [16, 8, 0].map((shift) => (color >> shift) & 255);
  const water = channels(MAP_PALETTE_NUM.waterRiver),
    deep = channels(MAP_PALETTE_NUM.seaDeep);
  const ground = channels(MAP_PALETTE_NUM.landBase),
    earth = channels(MAP_PALETTE_NUM.reliefInk),
    grass = channels(MAP_PALETTE_NUM.forestMoss);
  const shallow = water.map((v, i) => v * 0.58 + deep[i]! * 0.34 + grass[i]! * 0.08);
  const bank = earth.map((v, i) => v * 0.6 + ground[i]! * 0.25 + grass[i]! * 0.15);
  const grassySlope = ground.map((v, i) => v * 0.45 + grass[i]! * 0.55);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const t = col / (width - 1),
        smooth = t * t * (3 - 2 * t),
        sea = row < 2;
      // The two row pairs encode NW daylight and SE shade, never a pale all-coast rim.
      const lit = row % 2 === 0;
      const shade = sea ? (lit ? 1.03 : 0.93) : lit ? 1.035 : 0.91;
      const offset = (row * width + col) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = Math.round(
          Math.min(
            255,
            ((sea ? shallow[channel]! : bank[channel]!) * (1 - smooth) +
              (sea ? deep[channel]! : grassySlope[channel]!) * smooth) *
              shade,
          ),
        );
      const opacity = sea ? (lit ? 0.32 : 0.25) : lit ? 0.42 : 0.31;
      pixels[offset + 3] = Math.round(255 * opacity * Math.pow(1 - t, sea ? 1.5 : 0.7));
    }
  return pixels;
}

/** One owner-local atlas serves both ribbons; neither Mesh owns its shared atlas. */
export function createCoastSurface(outline: OutlineGeometry) {
  const profile = buildCoastProfile(outline);
  if (!profile) return null;
  const source = new BufferImageSource({
    resource: coastProfilePixels(),
    width: COAST_SURFACE.atlasWidth,
    height: COAST_SURFACE.atlasHeight,
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha',
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
    autoGenerateMipmaps: false,
  });
  const texture = new Texture({ source });
  const seaGeometry = new MeshGeometry(profile.sea),
    landGeometry = new MeshGeometry(profile.land);
  const seaMesh = new Mesh({ geometry: seaGeometry, texture }),
    landMesh = new Mesh({ geometry: landGeometry, texture });
  const seaContainer = new Container(),
    landContainer = new Container();
  seaContainer.label = 'coast-shallow-shelf';
  landContainer.label = 'coast-bank-slope';
  for (const item of [seaMesh, landMesh, seaContainer, landContainer]) item.eventMode = 'none';
  seaContainer.addChild(seaMesh);
  landContainer.addChild(landMesh);
  let destroyed = false;
  return {
    seaContainer,
    landContainer,
    seaMesh,
    landMesh,
    getDiagnostics: () =>
      Object.freeze({
        ownedTextures: destroyed ? 0 : 1,
        ownedSources: destroyed ? 0 : 1,
        ownedGeometries: destroyed ? 0 : 2,
        rgbaBytes: destroyed ? 0 : COAST_SURFACE.atlasWidth * COAST_SURFACE.atlasHeight * 4,
        atlasWidth: COAST_SURFACE.atlasWidth,
        atlasHeight: COAST_SURFACE.atlasHeight,
        geometryBytes: destroyed ? 0 : profile.geometryBytes,
        inputVertices: profile.inputVertices,
        seaWidth: COAST_SURFACE.seaWidth,
        landWidth: COAST_SURFACE.landWidth,
        seaVertices: profile.sea.positions.length / 2,
        landVertices: profile.land.positions.length / 2,
        seaIndices: profile.sea.indices.length,
        landIndices: profile.land.indices.length,
      }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      seaContainer.parent?.removeChild(seaContainer);
      landContainer.parent?.removeChild(landContainer);
      seaContainer.destroy({ children: true, texture: false, textureSource: false });
      landContainer.destroy({ children: true, texture: false, textureSource: false });
      seaGeometry.destroy();
      landGeometry.destroy();
      texture.destroy(true);
    },
  };
}
