import { Buffer, BufferUsage, Container, Geometry, Mesh, earcut, type Texture } from 'pixi.js';
import type { MapStaticData } from '../mapViewTypes';
import type { ElevationPoint } from './terrainElevation';
import { forestRasterLayout, mountainRasterPlacement } from './terrainRaster';

type Field = {
  project(p: ElevationPoint): ElevationPoint;
  bounds: { cells: number; worldSize: number };
};
const LIMIT = {
  forests: 10,
  points: 64,
  triangles: 32768,
  work: 4_000_000,
  bytes: 2 * 1024 * 1024,
};
const cross = (a: ElevationPoint, b: ElevationPoint, c: ElevationPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** Static polygon→same sampled-grid triangulation. Original canopy registration
 * is warped by P at every vertex, not by a one-anchor billboard transform.
 * Meshes use Pixi's renderer-owned texture shader; no private shader/mask/FBO.
 */
export function createTerrainProjectedCanopy(
  texture: Texture,
  terrain: NonNullable<MapStaticData['terrain']>,
  field: Field,
) {
  const cells = field.bounds.cells,
    world = field.bounds.worldSize,
    step = world / cells;
  if (
    !Number.isInteger(cells) ||
    cells < 1 ||
    cells > 128 ||
    !Number.isFinite(world) ||
    world <= 0 ||
    world > 4096
  )
    throw new RangeError('canopy grid');
  if (
    texture.destroyed ||
    !texture.source ||
    texture.source.destroyed ||
    !Number.isFinite(texture.source.width) ||
    !Number.isFinite(texture.source.height) ||
    texture.source.width <= 0 ||
    texture.source.height <= 0 ||
    texture.rotate !== 0 ||
    (texture.trim !== null && texture.trim !== undefined) ||
    !texture.orig ||
    texture.orig.x !== 0 ||
    texture.orig.y !== 0 ||
    texture.orig.width !== texture.source.width ||
    texture.orig.height !== texture.source.height ||
    !texture.frame ||
    texture.frame.x !== 0 ||
    texture.frame.y !== 0 ||
    texture.frame.width !== texture.source.width ||
    texture.frame.height !== texture.source.height ||
    !(texture.width > 0 && texture.height > 0)
  )
    throw new RangeError('canopy full frame');
  if ((terrain.forests?.length ?? 0) > LIMIT.forests) throw new RangeError('canopy forest budget');
  // Validate source polygons before the legacy layout can filter malformed bboxes.
  for (const forest of terrain.forests ?? []) {
    if (
      forest.polygon.length < 3 ||
      forest.polygon.length > LIMIT.points ||
      forest.polygon.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.y < 0 ||
          p.x > world ||
          p.y > world,
      )
    )
      throw new RangeError('canopy polygon');
  }
  const patches = forestRasterLayout(terrain);
  let work = 0,
    totalTriangles = 0,
    totalBytes = 0;
  const charge = (n = 1) => {
    work += n;
    if (work > LIMIT.work) throw new RangeError('canopy work budget');
  };
  const prepared = patches.map((patch) => {
    const ring = patch.polygon;
    if (
      ring.length < 3 ||
      ring.length > LIMIT.points ||
      ring.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.y < 0 ||
          p.x > world ||
          p.y > world,
      )
    )
      throw new RangeError('canopy polygon');
    charge(ring.length * ring.length);
    // Reject crossing rings before triangulation; collinear/zero area also fails.
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      area += a.x * b.y - a.y * b.x;
      for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        const c = ring[j]!,
          d = ring[(j + 1) % ring.length]!;
        if (
          cross(a, b, c) * cross(a, b, d) <= 0 &&
          cross(c, d, a) * cross(c, d, b) <= 0 &&
          Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
            Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
            Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
        )
          throw new RangeError('canopy crossing polygon');
      }
    }
    if (Math.abs(area) < 1e-8) throw new RangeError('canopy zero area');
    const placement = mountainRasterPlacement(patch, texture.width, texture.height);
    const original = earcut(
      ring.flatMap((p) => [p.x, p.y]),
      undefined,
      2,
    );
    const vertices: number[] = [],
      indices: number[] = [],
      ground: number[] = [];
    const clip = (polygon: ElevationPoint[], tri: ElevationPoint[]) => {
      let output = polygon;
      for (let edge = 0; edge < tri.length; edge++) {
        const a = tri[edge]!,
          b = tri[(edge + 1) % tri.length]!,
          input = output;
        output = [];
        for (let i = 0; i < input.length; i++) {
          charge();
          const p = input[i]!,
            q = input[(i + 1) % input.length]!,
            cp = cross(a, b, p),
            cq = cross(a, b, q);
          if (cp >= 0) output.push(p);
          if (cp >= 0 !== cq >= 0) {
            const t = cp / (cp - cq);
            output.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
          }
        }
      }
      return output;
    };
    for (let i = 0; i < original.length; i += 3) {
      let tri = [ring[original[i]!]!, ring[original[i + 1]!]!, ring[original[i + 2]!]!];
      if (cross(tri[0]!, tri[1]!, tri[2]!) < 0) tri = [tri[0]!, tri[2]!, tri[1]!];
      const rightSource = placement.x + texture.width * placement.scale,
        bottomSource = placement.y + texture.height * placement.scale;
      tri = clip(tri, [
        { x: placement.x, y: placement.y },
        { x: rightSource, y: placement.y },
        { x: rightSource, y: bottomSource },
        { x: placement.x, y: bottomSource },
      ]);
      if (tri.length < 3) continue;
      const left = Math.max(0, Math.floor(Math.min(...tri.map((p) => p.x)) / step)),
        right = Math.min(cells - 1, Math.floor(Math.max(...tri.map((p) => p.x)) / step));
      const top = Math.max(0, Math.floor(Math.min(...tri.map((p) => p.y)) / step)),
        bottom = Math.min(cells - 1, Math.floor(Math.max(...tri.map((p) => p.y)) / step));
      for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) {
          charge();
          const a = { x: x * step, y: y * step },
            b = { x: (x + 1) * step, y: y * step },
            c = { x: (x + 1) * step, y: (y + 1) * step },
            d = { x: x * step, y: (y + 1) * step };
          for (const gridTri of [
            [a, b, c],
            [a, c, d],
          ]) {
            const polygon = clip(tri, gridTri);
            for (let k = 1; k + 1 < polygon.length; k++) {
              const points = [polygon[0]!, polygon[k]!, polygon[k + 1]!];
              if (cross(points[0]!, points[1]!, points[2]!) <= 1e-8) continue;
              if (++totalTriangles > LIMIT.triangles)
                throw new RangeError('canopy triangle budget');
              const start = vertices.length / 4;
              for (const p of points) {
                charge();
                const projected = field.project(p);
                if (
                  !Number.isFinite(projected.x) ||
                  !Number.isFinite(projected.y) ||
                  Math.abs(projected.x) > 1e6 ||
                  Math.abs(projected.y) > 1e6
                )
                  throw new RangeError('canopy projection');
                vertices.push(
                  projected.x,
                  projected.y,
                  (p.x - placement.x) / (texture.width * placement.scale),
                  (p.y - placement.y) / (texture.height * placement.scale),
                );
                ground.push(p.x, p.y);
              }
              indices.push(start, start + 1, start + 2);
            }
          }
        }
    }
    const data = new Float32Array(vertices),
      index = new Uint32Array(indices);
    for (let i = 0; i < data.length; i += 12) {
      const area = cross(
        { x: data[i]!, y: data[i + 1]! },
        { x: data[i + 4]!, y: data[i + 5]! },
        { x: data[i + 8]!, y: data[i + 9]! },
      );
      if (!Number.isFinite(area) || area <= 0) throw new RangeError('canopy projected fold');
    }
    totalBytes += data.byteLength + index.byteLength;
    if (totalBytes > LIMIT.bytes) throw new RangeError('canopy buffer budget');
    return {
      id: patch.id,
      data,
      index,
      ground: Object.freeze(ground),
      placement: Object.freeze({ ...placement }),
    };
  });
  // All admission completes before allocating GPU-owned resources.
  const container = new Container();
  container.eventMode = 'none';
  container.label = 'projected-original-canopies';
  const owned: { mesh: Mesh<Geometry>; geometry: Geometry; attribute: Buffer }[] = [];
  const allocatedBuffers: Buffer[] = [],
    allocatedGeometries: Geometry[] = [];
  const destroy = () => {
    for (const item of owned.splice(0)) item.mesh.destroy({ texture: false, textureSource: false });
    for (const geometry of allocatedGeometries.splice(0)) geometry.destroy(false);
    for (const buffer of allocatedBuffers.splice(0)) if (!buffer.destroyed) buffer.destroy();
    if (!container.destroyed) container.destroy();
  };
  try {
    for (const p of prepared) {
      if (!p.index.length) continue;
      const attribute = new Buffer({
        data: p.data,
        usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
      });
      allocatedBuffers.push(attribute);
      const index = new Buffer({ data: p.index, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
      allocatedBuffers.push(index);
      const geometry = new Geometry({
        attributes: {
          aPosition: { buffer: attribute, format: 'float32x2', stride: 16, offset: 0 },
          aUV: { buffer: attribute, format: 'float32x2', stride: 16, offset: 8 },
        },
        indexBuffer: index,
      });
      allocatedGeometries.push(geometry);
      const mesh = new Mesh({ geometry, texture });
      mesh.label = `projected-canopy:${p.id}`;
      mesh.eventMode = 'none';
      owned.push({ mesh, geometry, attribute });
      container.addChild(mesh);
    }
  } catch (error) {
    destroy();
    throw error;
  }
  const records = Object.freeze(
    prepared.map((p) =>
      Object.freeze({
        id: p.id,
        placement: p.placement,
        sourceGround: p.ground,
        projectedUV: Object.freeze([...p.data]),
        indices: Object.freeze([...p.index]),
      }),
    ),
  );
  return {
    container,
    destroy,
    getDiagnostics: () => ({
      ownedMeshes: owned.length,
      ownedGeometries: owned.length,
      ownedBuffers: owned.length * 2,
      ownedTextures: 0,
      ownedSources: 0,
      ownedShaders: 0,
      ownedPrograms: 0,
      ownedMasks: 0,
      ownedFilters: 0,
      bufferBytes: owned.length ? totalBytes : 0,
      work,
      forests: records,
    }),
  };
}
