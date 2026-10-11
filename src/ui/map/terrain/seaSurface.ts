import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { MAP_PALETTE_NUM } from '../../styles/tokens';
import { WORLD_SIZE } from '../mapViewConfig';

export const SEA_MATERIAL = { resolution: 512, maxBytes: 1_048_576, facets: 96 } as const;

function validateResolution(resolution: number) {
  if (!Number.isInteger(resolution) || resolution < 32 || resolution > SEA_MATERIAL.resolution)
    throw new RangeError('Sea surface resolution must be an integer between 32 and 512');
}

/** Original static daylight reflection, not bathymetry, weather, noise or simulation state. */
export function seaSurfacePixels(resolution: number = SEA_MATERIAL.resolution) {
  validateResolution(resolution);
  const pixels = new Uint8Array(resolution * resolution * 4);
  const basis = Array.from({ length: resolution }, (_, i) => {
    const t = (i + 0.5) / resolution;
    const a = t * 48 + 0.7 * Math.sin(t * 11),
      b = t * 39 + 0.8 * Math.sin(t * 9),
      c = t * 33 + 0.9 * Math.sin(t * 13),
      d = t * 61 + 0.6 * Math.sin(t * 5),
      e = t * 103 + 0.5 * Math.sin(t * 21),
      f = t * 77 + 0.7 * Math.sin(t * 15);
    return {
      sin: Math.sin(t * 4.7 + 0.3),
      cos: Math.cos(t * 3.1 - 0.6),
      t,
      sinA: Math.sin(a),
      cosA: Math.cos(a),
      sinB: Math.sin(b),
      cosB: Math.cos(b),
      sinC: Math.sin(c),
      cosC: Math.cos(c),
      sinD: Math.sin(d),
      cosD: Math.cos(d),
      sinE: Math.sin(e),
      cosE: Math.cos(e),
      sinF: Math.sin(f),
      cosF: Math.cos(f),
    };
  });
  const deep = [16, 8, 0].map((shift) => (MAP_PALETTE_NUM.seaDeep >> shift) & 255);
  const reflected = [16, 8, 0].map((shift) => (MAP_PALETTE_NUM.waterRiver >> shift) & 255);
  for (let y = 0; y < resolution; y++) {
    const row = basis[y]!;
    for (let x = 0; x < resolution; x++) {
      const column = basis[x]!;
      // Broad crossed fields: neither row bands nor repeating texture tiles.
      const mix = Math.max(
        0.025,
        Math.min(
          0.165,
          0.085 +
            0.025 * column.sin * row.cos +
            0.018 * column.cos * row.sin +
            0.012 * (1 - column.t - row.t) +
            // Smooth phase-warped crossed currents remain visible in close water views.
            // Addition identities retain coherent 2D fields without per-pixel trigonometry.
            0.018 * (column.sinA * row.cosB + column.cosA * row.sinB) +
            0.011 * (column.sinC * row.cosD - column.cosC * row.sinD) +
            0.009 * (column.sinE * row.cosF + column.cosE * row.sinF),
        ),
      );
      const offset = (y * resolution + x) * 4;
      for (let c = 0; c < 3; c++)
        pixels[offset + c] = Math.round(deep[c]! + (reflected[c]! - deep[c]!) * mix);
      pixels[offset + 3] = 255;
    }
  }
  // Sparse elongated reflection facets follow a gently changing common current.
  // Low-discrepancy positions avoid rows; no random/hash noise or per-frame variation.
  for (let i = 0; i < SEA_MATERIAL.facets; i++) {
    const u = ((i + 1) * 0.618033988749895) % 1;
    const v = ((i + 1) * 0.414213562373095 + 0.17) % 1;
    const cx = u * resolution,
      cy = v * resolution;
    const length = ((24 + 10 * Math.sin(i * 1.7)) * resolution) / WORLD_SIZE;
    const breadth = (5 * resolution) / WORLD_SIZE;
    const angle = -0.18 + 0.15 * Math.sin(u * 4 + v * 2);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const radius = Math.ceil(length + breadth + 1);
    for (
      let y = Math.max(0, Math.floor(cy - radius));
      y <= Math.min(resolution - 1, Math.ceil(cy + radius));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(cx - radius));
        x <= Math.min(resolution - 1, Math.ceil(cx + radius));
        x++
      ) {
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - cy;
        const along = (dx * cos + dy * sin) / length,
          across = (-dx * sin + dy * cos) / breadth;
        const coverage = Math.max(0, 1 - along * along) * Math.max(0, 1 - Math.abs(across));
        if (coverage === 0) continue;
        const offset = (y * resolution + x) * 4;
        for (let c = 0; c < 3; c++)
          pixels[offset + c] = Math.min(255, pixels[offset + c]! + Math.round(3 * coverage));
      }
  }
  return { resolution, pixels };
}

/** Own one static, non-interactive whole-world sea Sprite beneath land and shelves. */
export function createSeaSurface(options: { resolution?: number } = {}) {
  const { resolution, pixels } = seaSurfacePixels(options.resolution);
  const source = new BufferImageSource({
    resource: pixels,
    width: resolution,
    height: resolution,
    scaleMode: 'linear',
  });
  const texture = new Texture({ source });
  const sprite = new Sprite(texture);
  sprite.width = WORLD_SIZE;
  sprite.height = WORLD_SIZE;
  sprite.eventMode = 'none';
  const container = new Container();
  container.label = 'sea-surface-material';
  container.eventMode = 'none';
  container.addChild(sprite);
  let destroyed = false;
  return {
    container,
    sprite,
    texture,
    getDiagnostics: () =>
      Object.freeze({
        resolution,
        rawBytes: resolution * resolution * 4,
        ownedRawBytes: destroyed ? 0 : resolution * resolution * 4,
        rgbaBytes: destroyed ? 0 : resolution * resolution * 4,
        ownedTextures: destroyed ? 0 : 1,
        ownedSources: destroyed ? 0 : 1,
        facets: SEA_MATERIAL.facets,
        destroyed,
      }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      container.parent?.removeChild(container);
      sprite.parent?.removeChild(sprite);
      sprite.destroy({ texture: false, textureSource: false });
      container.destroy({ children: true });
      texture.destroy(true);
    },
  };
}
