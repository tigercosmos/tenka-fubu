import { acquirePrivateProgramName, type PrivateProgramNameLease } from './privateProgramName';
import {
  Buffer,
  BufferUsage,
  Geometry,
  GlProgram,
  Mesh,
  Shader,
  UniformGroup,
  type Texture,
} from 'pixi.js';

type Point = { x: number; y: number };
export interface FoothillCanopyField {
  readonly vertexHeights: readonly number[];
  readonly bounds: {
    readonly cells: number;
    readonly worldSize: number;
    readonly maximumHeight: number;
    readonly displacementLipschitz: number;
  };
  sample(point: Point): number;
  project(point: Point): Point;
}
export const FOOTHILL_CANOPY = Object.freeze({
  maximumCells: 128,
  maximumBufferBytes: 2 * 1024 * 1024,
  stride: 24,
  // Median of the ten original 1374×1145 canopy placements (uniform world/source-pixel).
  worldPerSourcePixel: 0.065764192139738,
});
/** Original 1374×1145 PNG: every texel of each 295×247 window is alpha>=250.
 * Near-opaque, not opaque255. Two extra pixels cover bilinear/Float32 support.
 * Farthest-point selection from all 633 certified 16px-lattice windows; minimum
 * center separation112px. Original RGB/alpha are sampled without normalization.
 */
export const FOOTHILL_CROWN_PATCHES = Object.freeze(
  [
    [691, 571],
    [323, 491],
    [1027, 507],
    [771, 843],
    [771, 315],
    [947, 715],
    [483, 635],
    [851, 475],
    [803, 667],
    [675, 427],
    [611, 683],
    [915, 587],
    [339, 619],
    [947, 395],
    [579, 571],
    [1027, 619],
  ].map(([x, y]) => Object.freeze({ x: x!, y: y! })),
);
export interface FoothillCanopySampling {
  width: number;
  height: number;
  worldPerSourcePixel: number;
}
export function foothillCanopyTileWorld(sampling: FoothillCanopySampling) {
  const { width, height, worldPerSourcePixel } = sampling;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    !Number.isFinite(worldPerSourcePixel) ||
    worldPerSourcePixel < 0.001 ||
    worldPerSourcePixel > 1
  )
    throw new RangeError('invalid canopy pixel density');
  return { x: 0.105 * width * worldPerSourcePixel, y: 0.105 * height * worldPerSourcePixel };
}
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const c2 = (t: number) => t * t * t * (t * (6 * t - 15) + 10);
const mod289 = (value: number) => ((value % 289) + 289) % 289;
const permute = (value: number) => mod289((34 * value + 1) * value);
/** Three shared triangular sites provide C0 paint continuity across diagonals.
 * Disappearing taps have zero weight/derivative; the complete blend is not claimed
 * globally C1. Translation only: source orientation and world density unchanged.
 * Integer polynomial hash intermediates stay below2.83M (exact Float32 integers).
 */
export function foothillCanopySamples(
  point: Point,
  sampling: FoothillCanopySampling = {
    width: 1374,
    height: 1145,
    worldPerSourcePixel: FOOTHILL_CANOPY.worldPerSourcePixel,
  },
) {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    Math.abs(point.x) > 1e6 ||
    Math.abs(point.y) > 1e6
  )
    throw new RangeError('invalid canopy sample');
  const tile = foothillCanopyTileWorld(sampling);
  const px = point.x / tile.x,
    py = point.y / tile.y;
  const qx = px - py / Math.sqrt(3),
    qy = (2 * py) / Math.sqrt(3);
  const x = Math.floor(qx),
    y = Math.floor(qy),
    fx = qx - x,
    fy = qy - y;
  const sites =
    fx + fy <= 1
      ? [
          [x, y, 1 - fx - fy],
          [x + 1, y, fx],
          [x, y + 1, fy],
        ]
      : [
          [x + 1, y + 1, fx + fy - 1],
          [x + 1, y, 1 - fy],
          [x, y + 1, 1 - fx],
        ];
  const weights = sites.map((site) => c2(Math.max(0, Math.min(1, site[2]!))));
  const total = weights.reduce((a, b) => a + b, 0);
  return sites.map(([sx, sy], i) => {
    const patchIndex = permute(mod289(permute(mod289(sx!)) + mod289(sy!))) % 16;
    const center = FOOTHILL_CROWN_PATCHES[patchIndex]!;
    return {
      u: (center.x + 0.5) / 1374 + 0.105 * (px - sx! - 0.5 * sy!),
      v: (center.y + 0.5) / 1145 + 0.105 * (py - (Math.sqrt(3) / 2) * sy!),
      weight: weights[i]! / total,
      site: [sx!, sy!] as const,
      patchIndex,
    };
  });
}
/** Same global 00→11 projected triangles as the shared ground. Wooded coverage
 * is presentation height/slope, NOT measured elevation or new forest geography.
 * Every flat protected cell has four zero-coverage vertices, hence zero paint.
 */
export function buildTerrainFoothillCanopyBuffers(field: FoothillCanopyField) {
  const { cells, worldSize: world, maximumHeight, displacementLipschitz } = field.bounds;
  if (
    !Number.isInteger(cells) ||
    cells < 1 ||
    cells > FOOTHILL_CANOPY.maximumCells ||
    !Number.isFinite(world) ||
    world <= 0 ||
    world > 4096 ||
    !Number.isFinite(maximumHeight) ||
    maximumHeight < 0 ||
    maximumHeight > 64 ||
    !Number.isFinite(displacementLipschitz) ||
    displacementLipschitz < 0 ||
    displacementLipschitz >= 1
  )
    throw new RangeError('foothill canopy field budget');
  const side = cells + 1,
    count = side * side,
    bytes = count * 24 + cells * cells * 6 * 4;
  if (field.vertexHeights.length !== count || bytes > FOOTHILL_CANOPY.maximumBufferBytes)
    throw new RangeError('foothill canopy buffer budget');
  if (field.vertexHeights.some((h) => !Number.isFinite(h) || h < 0 || h > maximumHeight))
    throw new RangeError('invalid foothill canopy height');
  const vertices = new Float32Array(count * 6),
    indices = new Uint32Array(cells * cells * 6),
    step = world / cells;
  let maximumCoverage = 0,
    positiveVertices = 0;
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x,
        p = { x: x * step, y: y * step },
        h = field.vertexHeights[i]!,
        scene = field.project(p);
      if (
        !Number.isFinite(scene.x) ||
        !Number.isFinite(scene.y) ||
        Math.abs(scene.x - (p.x - 0.18 * h)) > 1e-6 ||
        Math.abs(scene.y - (p.y - h)) > 1e-6
      )
        throw new RangeError('foothill canopy projection disagrees with shared height');
      const samples = [
        field.sample(p),
        field.sample({ x: p.x - 1, y: p.y }),
        field.sample({ x: p.x + 1, y: p.y }),
        field.sample({ x: p.x, y: p.y - 1 }),
        field.sample({ x: p.x, y: p.y + 1 }),
      ];
      if (
        samples.some((value) => !Number.isFinite(value) || value < 0 || value > maximumHeight) ||
        Math.abs(samples[0]! - h) > 1e-8
      )
        throw new RangeError('invalid foothill canopy field samples');
      const dx = (samples[2]! - samples[1]!) / 2,
        dy = (samples[4]! - samples[3]!) / 2,
        slope = Math.hypot(dx, dy);
      // Same macro-slope NW irradiance as the ground, using the five samples
      // already required for coverage. Zero painted coverage needs no lighting.
      const light =
        h === 0
          ? 1
          : 1 +
            (0.45 * dx + 0.55 * dy + 0.7) / Math.hypot(dx, dy, 1) / Math.hypot(0.45, 0.55, 0.7) -
            0.7 / Math.hypot(0.45, 0.55, 0.7);
      const coverage =
        0.88 * smooth(0, 12, h) * (1 - smooth(0.16, 0.5, slope)) * (1 - 0.5 * smooth(36, 64, h));
      vertices.set([scene.x, scene.y, p.x, p.y, coverage, light], i * 6);
      maximumCoverage = Math.max(maximumCoverage, coverage);
      if (coverage > 0) positiveVertices++;
    }
  let k = 0;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      const a = y * side + x;
      indices.set([a, a + 1, a + side + 1, a, a + side + 1, a + side], k);
      k += 6;
    }
  let minimumFloat32Area = Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 6,
      b = indices[i + 1]! * 6,
      c = indices[i + 2]! * 6;
    const area =
      (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!) -
      (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!);
    if (!Number.isFinite(area) || area <= 0)
      throw new RangeError('invalid foothill canopy Float32 winding');
    minimumFloat32Area = Math.min(minimumFloat32Area, area);
  }
  return {
    vertices,
    indices,
    bytes,
    cells,
    worldSize: world,
    positiveVertices,
    maximumCoverage,
    minimumFloat32Area,
    directSampleQueries: count * 5,
    projectionQueries: count,
    // Shared sampled-field project performs one height query itself.
    sampleQueries: count * 6,
  };
}
const vertex = `
precision highp float;
attribute vec2 aPosition;
attribute vec2 aWorld;
attribute float aCanopy;
attribute float aLight;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
varying highp vec2 vWorld;
varying highp float vCanopy;
varying highp float vLight;
varying highp vec4 vColor;
void main(){
 vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);
 gl_Position=vec4(p.xy,0.0,1.0);
 vWorld=aWorld;vCanopy=aCanopy;vLight=aLight;vColor=uWorldColorAlpha*uColor;
}`;
const fragment = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uCanopyTile;
${Array.from({ length: 8 }, (_, i) => `uniform vec4 uCrownPair${i};`).join('\n')}
varying highp vec2 vWorld;
varying highp float vCanopy;
varying highp float vLight;
varying highp vec4 vColor;
float permute(float n){return mod((34.0*n+1.0)*n,289.0);}
vec2 crown(vec2 n){
 float id=mod(permute(mod(permute(mod(n.x,289.0))+mod(n.y,289.0),289.0)),16.0);
 ${FOOTHILL_CROWN_PATCHES.slice(0, -1)
   .map((_, i) => `if(id<${i}.5)return uCrownPair${Math.floor(i / 2)}.${i % 2 ? 'zw' : 'xy'};`)
   .join('\n ')}
 return uCrownPair7.zw;
}
vec4 tap(vec2 p,vec2 n){
 vec2 site=vec2(n.x+.5*n.y,.8660254037844386*n.y);
 vec2 uv=crown(n)+.105*(p-site);
 return texture2D(uTexture,uv);
}
vec3 quintic(vec3 t){return t*t*t*(t*(6.0*t-15.0)+10.0);}
void main(){
 vec2 p=vWorld/uCanopyTile;
 vec2 q=vec2(p.x-p.y*.5773502691896258,p.y*1.1547005383792515),n=floor(q),f=fract(q);
 vec2 a=n,b=n+vec2(1.0,0.0),c=n+vec2(0.0,1.0);
 vec3 raw=vec3(1.0-f.x-f.y,f.x,f.y);
 if(f.x+f.y>1.0){a=n+vec2(1.0,1.0);raw=vec3(f.x+f.y-1.0,1.0-f.y,1.0-f.x);}
 vec3 w=quintic(clamp(raw,0.0,1.0));w/=w.x+w.y+w.z;
 vec4 canopy=tap(p,a)*w.x+tap(p,b)*w.y+tap(p,c)*w.z;
 gl_FragColor=vec4(canopy.rgb*vLight,canopy.a)*vCanopy*vColor;
}`;
/** Borrow the unmodified original canopy PNG. Caller puts this static mesh below
 * water/roads/models, beside the SAME elevated ground. No texture/filter/mask/FBO.
 * Shader consumes Pixi's premultiplied texture sample and preserves baked tree
 * highlights, modulated by the same NW macro-slope light as the ground. Lighting
 * scales RGB only, never coverage/alpha; flat protected coverage remains zero.
 */
export function createTerrainFoothillCanopy(texture: Texture, field: FoothillCanopyField) {
  const source = texture.source,
    frame = texture.frame,
    orig = texture.orig;
  if (
    texture.destroyed ||
    !source ||
    source.destroyed ||
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width <= 0 ||
    source.height <= 0 ||
    texture.rotate !== 0 ||
    texture.trim ||
    frame.x !== 0 ||
    frame.y !== 0 ||
    frame.width !== source.width ||
    frame.height !== source.height ||
    orig.x !== 0 ||
    orig.y !== 0 ||
    orig.width !== source.width ||
    orig.height !== source.height
  )
    throw new RangeError('foothill canopy requires live original full frame');
  const buffers = buildTerrainFoothillCanopyBuffers(field);
  const tileWorld = foothillCanopyTileWorld({
    width: source.width,
    height: source.height,
    worldPerSourcePixel: FOOTHILL_CANOPY.worldPerSourcePixel,
  });
  let attribute: Buffer | undefined,
    index: Buffer | undefined,
    geometry: Geometry | undefined,
    program: GlProgram | undefined,
    programName: PrivateProgramNameLease | undefined,
    shader: Shader | undefined,
    mesh: Mesh<Geometry, Shader> | undefined;
  try {
    attribute = new Buffer({
      data: buffers.vertices,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
    });
    index = new Buffer({ data: buffers.indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    geometry = new Geometry({
      attributes: {
        aPosition: { buffer: attribute, format: 'float32x2', stride: 24, offset: 0 },
        aWorld: { buffer: attribute, format: 'float32x2', stride: 24, offset: 8 },
        aCanopy: { buffer: attribute, format: 'float32', stride: 24, offset: 16 },
        aLight: { buffer: attribute, format: 'float32', stride: 24, offset: 20 },
      },
      indexBuffer: index,
    });
    programName = acquirePrivateProgramName('terrain-foothill-canopy');
    program = new GlProgram({
      vertex,
      fragment,
      name: programName.name,
      preferredVertexPrecision: 'highp',
      preferredFragmentPrecision: 'highp',
    });
    shader = new Shader({
      glProgram: program,
      resources: {
        uTexture: source,
        uSampler: source.style,
        canopyUniforms: new UniformGroup({
          uCanopyTile: { value: new Float32Array([tileWorld.x, tileWorld.y]), type: 'vec2<f32>' },
          ...Object.fromEntries(
            Array.from({ length: 8 }, (_, i) => [
              `uCrownPair${i}`,
              {
                value: new Float32Array(
                  FOOTHILL_CROWN_PATCHES.slice(i * 2, i * 2 + 2).flatMap((p) => [
                    (p.x + 0.5) / 1374,
                    (p.y + 0.5) / 1145,
                  ]),
                ),
                type: 'vec4<f32>' as const,
              },
            ]),
          ),
        }),
      },
    });
    mesh = new Mesh({ geometry, shader, texture });
  } catch (error) {
    mesh?.destroy({ texture: false, textureSource: false });
    if (geometry) geometry.destroy(false);
    else index?.destroy();
    attribute?.destroy();
    if (shader) shader.destroy(true);
    else program?.destroy();
    programName?.release();
    throw error;
  }
  mesh.label = 'terrain-foothill-canopy';
  mesh.eventMode = 'none';
  let destroyed = false;
  return {
    mesh,
    geometry,
    shader,
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
        ownedFramebuffers: 0,
        bufferBytes: destroyed ? 0 : buffers.bytes,
        positiveVertices: buffers.positiveVertices,
        maximumCoverage: buffers.maximumCoverage,
        sampleQueries: buffers.sampleQueries,
        directSampleQueries: buffers.directSampleQueries,
        projectionQueries: buffers.projectionQueries,
        cells: buffers.cells,
        worldSize: buffers.worldSize,
        tileWorld: [tileWorld.x, tileWorld.y] as const,
        worldPerSourcePixel: FOOTHILL_CANOPY.worldPerSourcePixel,
        crownPatchCount: FOOTHILL_CROWN_PATCHES.length,
        crownMinimumAlpha: 250,
      }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      mesh.destroy({ texture: false, textureSource: false });
      geometry.destroy(false);
      attribute.destroy();
      shader.destroy(true);
      programName.release();
    },
  };
}
