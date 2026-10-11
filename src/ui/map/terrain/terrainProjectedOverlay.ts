import { Mesh, MeshGeometry, type Texture } from 'pixi.js';

export interface ProjectedOverlayField {
  readonly vertexHeights: readonly number[];
  readonly bounds: {
    readonly worldSize: number;
    readonly cells: number;
    readonly displacementLipschitz: number;
  };
  project(this: void, point: { x: number; y: number }): { x: number; y: number };
}

export const PROJECTED_OVERLAY_LIMITS = Object.freeze({ cells: 128, bufferBytes: 512 * 1024 });

/** Borrow a full-frame world raster, preserving its original RGBA/source/UVs.
 * Only geometry is owned. Positions follow the SAME sampled 00→11 grid as the
 * ground; no shader, filter, mask, texture or framebuffer is allocated here.
 */
export function createProjectedTerrainOverlay(texture: Texture, field: ProjectedOverlayField) {
  const { cells, worldSize, displacementLipschitz } = field.bounds;
  if (
    !Number.isInteger(cells) ||
    cells < 1 ||
    cells > PROJECTED_OVERLAY_LIMITS.cells ||
    !Number.isFinite(worldSize) ||
    worldSize <= 0 ||
    worldSize > 4096 ||
    !Number.isFinite(displacementLipschitz) ||
    displacementLipschitz < 0 ||
    displacementLipschitz >= 1
  )
    throw new RangeError('projected overlay field budget');
  const side = cells + 1,
    vertices = side * side,
    triangles = 2 * cells * cells;
  const bufferBytes = vertices * 16 + triangles * 6;
  if (field.vertexHeights.length !== vertices || bufferBytes > PROJECTED_OVERLAY_LIMITS.bufferBytes)
    throw new RangeError('projected overlay vertex budget');
  for (const height of field.vertexHeights)
    if (!Number.isFinite(height) || height < 0 || height > 64)
      throw new RangeError('invalid projected overlay height');
  // Mesh's default texture UV matrix supports subframes, but this adapter is
  // intentionally the original full-frame territory/faction world raster.
  const frame = texture.frame,
    source = texture.source;
  if (
    !source ||
    texture.destroyed ||
    source.destroyed ||
    texture.rotate !== 0 ||
    texture.trim ||
    frame.x !== 0 ||
    frame.y !== 0 ||
    frame.width !== source.width ||
    frame.height !== source.height ||
    texture.orig.width !== frame.width ||
    texture.orig.height !== frame.height
  )
    throw new RangeError('projected overlay requires a live full-frame texture');
  const positions = new Float32Array(vertices * 2),
    uvs = new Float32Array(vertices * 2);
  const indices = new Uint16Array(triangles * 3);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x,
        p = field.project({ x: (x * worldSize) / cells, y: (y * worldSize) / cells });
      if (
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 1e6 ||
        Math.abs(p.y) > 1e6
      )
        throw new RangeError('invalid projected overlay point');
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;
      uvs[i * 2] = x / cells;
      uvs[i * 2 + 1] = y / cells;
    }
  let cursor = 0;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      const a = y * side + x,
        b = a + 1,
        c = a + side + 1,
        d = a + side;
      for (const index of [a, b, c, a, c, d]) indices[cursor++] = index;
    }
  // Verify the ACTUAL emitted Float32 triangles, not only a claimed field bound.
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 2,
      b = indices[i + 1]! * 2,
      c = indices[i + 2]! * 2;
    const cross =
      (positions[b]! - positions[a]!) * (positions[c + 1]! - positions[a + 1]!) -
      (positions[b + 1]! - positions[a + 1]!) * (positions[c]! - positions[a]!);
    if (!Number.isFinite(cross) || cross <= 0)
      throw new RangeError('folded projected overlay triangle');
  }
  // MeshGeometry's installed runtime accepts Uint16, but its options declaration
  // admits Uint32 only. The Buffer data setter correctly admits both. Replace
  // the constructor's temporary six-index/24-byte default in the SAME buffer.
  const geometry = new MeshGeometry({ positions, uvs });
  geometry.indexBuffer.data = indices;
  const positionBuffer = geometry.getBuffer('aPosition'),
    uvBuffer = geometry.getBuffer('aUV');
  const destroyGeometry = () => {
    // Pixi8.19 Geometry.destroy(true) destroys index twice: it appears in
    // buffers AND is unconditionally destroyed separately. Own attributes
    // explicitly; destroy(false) owns exactly the index + geometry GPU lease.
    geometry.destroy(false);
    positionBuffer.destroy();
    uvBuffer.destroy();
  };
  let mesh: Mesh<MeshGeometry>;
  try {
    mesh = new Mesh({ geometry, texture });
  } catch (error) {
    destroyGeometry();
    throw error;
  }
  mesh.label = 'terrain-projected-overlay';
  mesh.eventMode = 'none';
  let destroyed = false;
  return {
    mesh,
    getDiagnostics: () =>
      Object.freeze({
        vertices: destroyed ? 0 : vertices,
        triangles: destroyed ? 0 : triangles,
        bufferBytes: destroyed ? 0 : bufferBytes,
        ownedMeshes: destroyed ? 0 : 1,
        ownedGeometries: destroyed ? 0 : 1,
        ownedBuffers: destroyed ? 0 : 3,
        ownedTextures: 0,
        ownedTextureSources: 0,
        ownedShaders: 0,
      }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mesh.parent?.removeChild(mesh);
      mesh.destroy({ texture: false, textureSource: false });
      destroyGeometry();
    },
  };
}
