import { expect, it } from 'vitest';
import { BufferImageSource, DOMAdapter, Texture } from 'pixi.js';
import {
  buildTerrainElevatedSurfaceBuffers,
  createTerrainElevatedSurface,
} from '@ui/map/terrain/terrainElevatedSurface';
const field = {
  sample: ({ x }: { x: number; y: number }) => Math.max(0, Math.min(20, (x - 64) * 0.18)),
  project(p: { x: number; y: number }) {
    const h = this.sample(p);
    return { x: p.x - 0.18 * h, y: p.y - h };
  },
  bounds: { maximumQueryEdgeVisits: 0, cells: 8, worldSize: 256 },
};
it('matches independent slope/height substrate math and preserves original lighting at every emitted vertex', () => {
  const b = buildTerrainElevatedSurfaceBuffers(field);
  const smooth = (low: number, high: number, value: number) => {
    const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
    return 3 * t * t - 2 * t * t * t;
  };
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const corners = [
        [col * 32, row * 32],
        [(col + 1) * 32, row * 32],
        [(col + 1) * 32, (row + 1) * 32],
        [col * 32, (row + 1) * 32],
      ];
      for (let corner = 0; corner < 4; corner++) {
        const [x, y] = corners[corner]!,
          h = field.sample({ x: x!, y: y! });
        const dx = (field.sample({ x: x! + 1, y: y! }) - field.sample({ x: x! - 1, y: y! })) / 2;
        const rise = smooth(0, 6, h),
          slope = Math.abs(dx);
        // This fixture has no maximumHeight metadata: the presentation policy
        // uses its declared default64, not the fixture's observed maximum20.
        const crest = smooth(0.55, 0.85, h / 64);
        const steep = smooth(0.2, 0.38, slope);
        const aspect = smooth(-0.15, 0.25, -(0.45 * dx) / Math.hypot(0.45, 0.55));
        const wood = rise * (1 - 0.65 * crest) * (0.9 + 0.1 * Math.sin((x! + 0.6 * y!) / 64));
        const rock = crest * steep * aspect;
        const expected = 0.78 * wood * (1 - rock) - 0.7 * rock;
        const i = ((row * 8 + col) * 4 + corner) * 6;
        expect(b.vertices[i + 5]).toBe(Math.fround(expected));
        const normalLength = Math.hypot(0.45, 0.55, 0.7);
        const light = 1 + (0.45 * dx + 0.7) / Math.hypot(dx, 1) / normalLength - 0.7 / normalLength;
        expect(b.vertices[i + 4]).toBe(Math.fround(light));
      }
    }
});
it('actual moderate low shoulder remains wooded rather than becoming exposed rock', () => {
  const b = buildTerrainElevatedSurfaceBuffers(field);
  const material = Array.from({ length: b.vertices.length / 6 }, (_, i) => b.vertices[i * 6 + 5]!);
  expect(material.some((v) => v < 0)).toBe(false);
  expect(material.some((v) => v > 0.3)).toBe(true);
  expect(b.bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
});
it('keeps projected coordinates, tiling and lighting unchanged while making gentle raised shoulders wooded', () => {
  const shoulder = {
    ...field,
    sample: ({ x }: { x: number; y: number }) => Math.max(0, Math.min(10, (x - 64) * 0.06)),
    project(p: { x: number; y: number }) {
      const h = this.sample(p);
      return { x: p.x - 0.18 * h, y: p.y - h };
    },
  };
  const b = buildTerrainElevatedSurfaceBuffers(shoulder);
  let wooded = 0;
  for (let y = 0; y <= 8; y++)
    for (let x = 0; x <= 8; x++) {
      const p = { x: x * 32, y: y * 32 },
        scene = shoulder.project(p);
      const matching = [];
      for (let i = 0; i < b.vertices.length; i += 6)
        if (
          Math.abs(b.vertices[i]! - scene.x) < 1e-4 &&
          Math.abs(b.vertices[i + 1]! - scene.y) < 1e-4
        )
          matching.push(i);
      expect(matching.length).toBeGreaterThan(0);
      for (const i of matching) {
        if (b.vertices[i + 5]! > 0.3) wooded++;
        expect(Number.isFinite(b.vertices[i + 4])).toBe(true);
      }
    }
  expect(wooded).toBeGreaterThan(0);
});
it('leaves zero-height substrate at the original flat material and owns no extra buffers/textures', () => {
  const flat = {
    sample: () => 0,
    project: (p: { x: number; y: number }) => p,
    bounds: { maximumQueryEdgeVisits: 0, cells: 8, worldSize: 256 },
  };
  const b = buildTerrainElevatedSurfaceBuffers(flat);
  for (let i = 5; i < b.vertices.length; i += 6) expect(b.vertices[i]).toBe(0);
  const source = new BufferImageSource({
      resource: new Uint8Array([130, 140, 110, 255]),
      width: 1,
      height: 1,
    }),
    texture = new Texture({ source }),
    adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  });
  try {
    const surface = createTerrainElevatedSurface(texture, field);
    expect(surface.geometry.getAttribute('aSubstrate')).toMatchObject({ stride: 24, offset: 20 });
    expect(surface.shader.glProgram.fragment).toContain('rock');
    expect(surface.getDiagnostics()).toMatchObject({
      ownedBuffers: 2,
      ownedTextures: 0,
      ownedSources: 0,
      ownedMasks: 0,
      ownedFilters: 0,
    });
    surface.destroy();
    surface.destroy();
    expect(source.destroyed).toBe(false);
  } finally {
    DOMAdapter.set(adapter);
    texture.destroy(true);
  }
});
