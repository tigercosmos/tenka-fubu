import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, type Texture } from 'pixi.js';
import { TERRAIN_GROUND_COLOR, TERRAIN_RELIEF } from '../mapViewConfig';
import type { ElevationPoint, createTerrainElevation } from './terrainElevation';

type Field = Pick<ReturnType<typeof createTerrainElevation>, 'sample' | 'project'> & {
  bounds: {
    maximumQueryEdgeVisits: number;
    cells?: number;
    worldSize?: number;
    maximumHeight?: number;
  };
};
export interface ElevatedSurfaceOptions {
  readonly worldSize?: number;
  readonly cells?: number;
  readonly forests?: readonly (readonly ElevationPoint[])[];
}
export const ELEVATED_SURFACE = {
  maxCells: 128,
  tileWorld: 256,
  stride: 24,
  maxBufferBytes: 2 * 1024 * 1024,
  textureAlpha: 0.28,
} as const;
const color = (n: number) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
function inside(p: ElevationPoint, ring: readonly ElevationPoint[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}
/** CPU buffer schema: projectedXY, ground tileUV, NW light, signed substrate.
 * Every 256-world tile seam has independent UV endpoints; no sampler mutation.
 * One regular global grid, not fourteen mountain cutouts or a canopy skirt.
 */
export function buildTerrainElevatedSurfaceBuffers(
  field: Field,
  options: ElevatedSurfaceOptions = {},
) {
  const world = options.worldSize ?? field.bounds.worldSize ?? 4096,
    cells = options.cells ?? field.bounds.cells ?? 128,
    forests = options.forests ?? [];
  if (
    !Number.isFinite(world) ||
    world <= 0 ||
    world > 4096 ||
    !Number.isInteger(cells) ||
    cells < 1 ||
    cells > 128 ||
    !Number.isInteger(world / cells) ||
    256 % (world / cells) !== 0 ||
    forests.length > 64
  )
    throw new RangeError('elevated surface grid budget');
  if (
    (field.bounds.cells !== undefined && cells !== field.bounds.cells) ||
    (field.bounds.worldSize !== undefined && world !== field.bounds.worldSize)
  )
    throw new RangeError('surface and sampled field grids must match');
  let forestPoints = 0;
  for (const r of forests) {
    if (r.length < 3 || r.length > 512) throw new RangeError('elevated forest budget');
    forestPoints += r.length;
    if (
      forestPoints > 8192 ||
      !r.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Math.abs(p.x) <= 1e6 &&
          Math.abs(p.y) <= 1e6,
      )
    )
      throw new RangeError('invalid elevated forest');
  }
  const vertexCount = cells * cells * 4,
    indexCount = cells * cells * 6;
  const bytes = vertexCount * 24 + indexCount * 4;
  if (bytes > ELEVATED_SURFACE.maxBufferBytes)
    throw new RangeError('elevated surface buffer budget');
  const vertices = new Float32Array(vertexCount * 6),
    indices = new Uint32Array(indexCount);
  const step = world / cells;
  // Fixed source sample cache shared by neighbouring cells. No per-frame sampling.
  const samples = new Map<string, readonly [number, number, number, number]>();
  let queryCount = 0;
  const sample = (x: number, y: number) => {
    const key = `${x},${y}`,
      previous = samples.get(key);
    if (previous) return previous;
    const p = { x, y },
      scene = field.project(p);
    queryCount += 5;
    const dx = (field.sample({ x: x + 1, y }) - field.sample({ x: x - 1, y })) / 2;
    const dy = (field.sample({ x, y: y + 1 }) - field.sample({ x, y: y - 1 })) / 2;
    const flat = 0.7 / Math.hypot(0.45, 0.55, 0.7);
    const light =
      1 +
      (0.45 * dx + 0.55 * dy + 0.7) / Math.hypot(dx, dy, 1) / Math.hypot(0.45, 0.55, 0.7) -
      flat;
    let woodland = 0;
    for (const ring of forests) {
      if (!inside(p, ring)) continue;
      let edge = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!,
          b = ring[(i + 1) % ring.length]!,
          vx = b.x - a.x,
          vy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1)),
        );
        edge = Math.min(edge, Math.hypot(x - a.x - t * vx, y - a.y - t * vy));
      }
      const t = Math.min(1, edge / 32);
      woodland = Math.max(woodland, t * t * (3 - 2 * t));
    }
    // Same rendered field, not invented altitude or a separate silhouette.
    // Broad world-space bands vary substrate, never positions or lighting.
    const smooth = (a: number, b: number, value: number) => {
      const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const height = Math.max(0, y - scene.y),
      slope = Math.hypot(dx, dy);
    const raised = smooth(0, 6, height);
    const bands = 0.9 + 0.1 * Math.sin((x + 0.6 * y) / 64);
    // Relative presentation relief, not metres/ecological altitude. Moderate
    // slopes remain wooded; rock requires a high crest AND steep shaded face.
    // A flat summit is not automatically bare, nor is a low protected-bank ramp.
    const maximumHeight = field.bounds.maximumHeight ?? 64;
    const relativeHeight =
      height / (Number.isFinite(maximumHeight) && maximumHeight > 0 ? maximumHeight : 64);
    const crest = smooth(0.55, 0.85, relativeHeight);
    const steep = smooth(0.2, 0.38, slope);
    const shadedAspect = smooth(-0.15, 0.25, -(0.45 * dx + 0.55 * dy) / Math.hypot(0.45, 0.55));
    const shoulder = raised * (1 - 0.65 * crest) * bands;
    const exposure = crest * steep * shadedAspect;
    const substrate = (0.18 * woodland + 0.78 * shoulder) * (1 - exposure) - 0.7 * exposure;
    const result = [scene.x, scene.y, light, substrate] as const;
    samples.set(key, result);
    return result;
  };
  let v = 0,
    k = 0;
  for (let row = 0; row < cells; row++)
    for (let col = 0; col < cells; col++) {
      const x = col * step,
        y = row * step,
        tx = Math.floor((x + step / 2) / 256),
        ty = Math.floor((y + step / 2) / 256),
        start = v / 6;
      for (const [px, py] of [
        [x, y],
        [x + step, y],
        [x + step, y + step],
        [x, y + step],
      ]) {
        const s = sample(px!, py!);
        vertices.set([s[0], s[1], px! / 256 - tx, py! / 256 - ty, s[2], s[3]], v);
        v += 6;
      }
      indices.set([start, start + 1, start + 2, start, start + 2, start + 3], k);
      k += 6;
    }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 6,
      b = indices[i + 1]! * 6,
      c = indices[i + 2]! * 6;
    const area =
      (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!) -
      (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
    if (!Number.isFinite(area) || area <= 0)
      throw new RangeError('invalid projected surface triangle');
  }
  return {
    vertices,
    indices,
    bytes,
    cells,
    worldSize: world,
    queryCount,
    sourceSampleCount: samples.size,
    maximumQueryEdgeVisits:
      queryCount * field.bounds.maximumQueryEdgeVisits + samples.size * 2 * forestPoints,
  };
}
const vertex = `
precision highp float;
attribute vec2 aPosition;
attribute vec2 aUV;
attribute float aLight;
attribute float aSubstrate;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
varying highp vec2 vUV;
varying highp float vLight;
varying highp float vForest;
varying highp vec4 vColor;
void main(){
  vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);
  gl_Position=vec4(p.xy,0.0,1.0);
  vUV=aUV;vLight=aLight;vForest=aSubstrate;vColor=uWorldColorAlpha*uColor;
}`;
const base = color(TERRAIN_GROUND_COLOR),
  forest = color(TERRAIN_RELIEF.forestTint),
  shoulder = color(0x78856b),
  stone = color(0x9c9989);
const fragment = `
precision highp float;
uniform sampler2D uTexture;
varying highp vec2 vUV;
varying highp float vLight;
varying highp float vForest;
varying highp vec4 vColor;
void main(){
  vec4 tex=texture2D(uTexture,vUV);
  vec3 soil=vec3(${base.join(',')})*(1.0-.28*tex.a)+.28*tex.rgb;
  float wooded=max(vForest,0.0);
  float rock=max(-vForest,0.0);
  // At height zero substrate=.18*legacyForest: identical flat material equation.
  vec3 lowWood=mix(soil,vec3(${forest.join(',')}),min(wooded,.18));
  vec3 shoulder=mix(lowWood,vec3(${shoulder.join(',')}),max(wooded-.18,0.0)/.82);
  vec3 painted=mix(shoulder,vec3(${stone.join(',')}),rock)*vLight;
  gl_FragColor=vec4(painted,1.0)*vColor;
}`;
let programSequence = 0;
/** GL-only, one private program. Parent supplies the existing displayed-land clip. */
export function createTerrainElevatedSurface(
  texture: Texture,
  field: Field,
  options: ElevatedSurfaceOptions = {},
) {
  if (
    texture.destroyed ||
    texture.source.destroyed ||
    texture.frame.x !== 0 ||
    texture.frame.y !== 0 ||
    texture.frame.width !== texture.source.width ||
    texture.frame.height !== texture.source.height
  )
    throw new RangeError('elevated surface requires original full ground texture');
  const buffers = buildTerrainElevatedSurfaceBuffers(field, options);
  let attribute: Buffer | undefined,
    index: Buffer | undefined,
    geometry: Geometry | undefined,
    program: GlProgram | undefined,
    shader: Shader | undefined,
    mesh: Mesh<Geometry, Shader> | undefined;
  try {
    attribute = new Buffer({
      data: buffers.vertices,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
    });
    index = new Buffer({
      data: buffers.indices,
      usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
    });
    geometry = new Geometry({
      attributes: {
        aPosition: { buffer: attribute, format: 'float32x2', stride: 24, offset: 0 },
        aUV: { buffer: attribute, format: 'float32x2', stride: 24, offset: 8 },
        aLight: { buffer: attribute, format: 'float32', stride: 24, offset: 16 },
        aSubstrate: { buffer: attribute, format: 'float32', stride: 24, offset: 20 },
      },
      indexBuffer: index,
    });
    program = new GlProgram({
      vertex,
      fragment,
      name: `terrain-elevated-private-${++programSequence}`,
      preferredVertexPrecision: 'highp',
      preferredFragmentPrecision: 'highp',
    });
    shader = new Shader({
      glProgram: program,
      resources: { uTexture: texture.source, uSampler: texture.source.style },
    });
    mesh = new Mesh({ geometry, shader, texture });
  } catch (error) {
    mesh?.destroy({ texture: false, textureSource: false });
    if (geometry) geometry.destroy(false);
    else index?.destroy();
    attribute?.destroy();
    if (shader) shader.destroy(true);
    else program?.destroy();
    throw error;
  }
  const ownedMesh = mesh,
    ownedGeometry = geometry,
    ownedShader = shader,
    ownedAttribute = attribute;
  mesh.label = 'terrain-elevated-surface';
  mesh.eventMode = 'none';
  let destroyed = false;
  return {
    mesh: ownedMesh,
    geometry: ownedGeometry,
    shader: ownedShader,
    buffers,
    getDiagnostics: () =>
      Object.freeze({
        ownedMeshes: destroyed ? 0 : 1,
        ownedGeometries: destroyed ? 0 : 1,
        ownedBuffers: destroyed ? 0 : 2,
        ownedShaders: destroyed ? 0 : 1,
        ownedPrograms: destroyed ? 0 : 1,
        ownedTextures: 0,
        ownedSources: 0,
        ownedMasks: 0,
        ownedFilters: 0,
        bufferBytes: destroyed ? 0 : buffers.bytes,
      }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      ownedMesh.parent?.removeChild(ownedMesh);
      ownedMesh.destroy({ texture: false, textureSource: false });
      ownedGeometry.destroy(false);
      ownedAttribute.destroy();
      ownedShader.destroy(true);
    },
  };
}
