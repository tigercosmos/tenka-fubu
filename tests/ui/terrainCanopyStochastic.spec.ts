import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { BufferImageSource, DOMAdapter, Texture, UniformGroup } from 'pixi.js';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import {
  createTerrainFoothillCanopy,
  foothillCanopySamples,
  foothillCanopyTileWorld,
  FOOTHILL_CANOPY,
  FOOTHILL_CROWN_PATCHES,
} from '@ui/map/terrain/terrainFoothillCanopy';

it('uses separated original crown regions rather than repeating one central stamp', () => {
  const tile = foothillCanopyTileWorld({
    width: 1374,
    height: 1145,
    worldPerSourcePixel: FOOTHILL_CANOPY.worldPerSourcePixel,
  });
  const centers = [];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const taps = foothillCanopySamples({
        x: (x + y / 2) * tile.x,
        y: ((y * Math.sqrt(3)) / 2) * tile.y,
      });
      centers.push({
        u: taps.reduce((sum, tap) => sum + tap.u * tap.weight, 0),
        v: taps.reduce((sum, tap) => sum + tap.v * tap.weight, 0),
      });
    }
  expect(
    Math.max(...centers.map((p) => p.u)) - Math.min(...centers.map((p) => p.u)),
  ).toBeGreaterThan(0.5);
  expect(
    Math.max(...centers.map((p) => p.v)) - Math.min(...centers.map((p) => p.v)),
  ).toBeGreaterThan(0.45);
});

it('binds all certified original centers to one private three-tap shader without changing owned resources', () => {
  const adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  });
  let texture: Texture | undefined,
    owner: ReturnType<typeof createTerrainFoothillCanopy> | undefined;
  try {
    const png = PNG.sync.read(
      readFileSync(
        new URL('../../public/assets/textures/terrain-forest-canopy-v1.png', import.meta.url),
      ),
    );
    texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(png.data),
        width: png.width,
        height: png.height,
      }),
    });
    const style = texture.source.style;
    owner = createTerrainFoothillCanopy(
      texture,
      createSampledTerrainElevation(createTerrainTopography([])),
    );
    const uniforms = (owner.shader.resources.canopyUniforms as UniformGroup).uniforms;
    for (const [i, p] of FOOTHILL_CROWN_PATCHES.entries()) {
      const pair = uniforms[`uCrownPair${Math.floor(i / 2)}`] as Float32Array;
      expect([...pair.slice((i % 2) * 2, (i % 2) * 2 + 2)]).toEqual([
        Math.fround((p.x + 0.5) / 1374),
        Math.fround((p.y + 0.5) / 1145),
      ]);
      expect(owner.shader.glProgram.fragment).toContain(
        `return uCrownPair${Math.floor(i / 2)}.${i % 2 ? 'zw' : 'xy'}`,
      );
    }
    const expectedBytes = new Float32Array(
      FOOTHILL_CROWN_PATCHES.flatMap((p) => [(p.x + 0.5) / 1374, (p.y + 0.5) / 1145]),
    );
    const actualBytes = new Float32Array(
      Array.from({ length: 8 }, (_, i) => [...(uniforms[`uCrownPair${i}`] as Float32Array)]).flat(),
    );
    expect(new Uint8Array(actualBytes.buffer)).toEqual(new Uint8Array(expectedBytes.buffer));
    expect(actualBytes.byteLength).toBe(128);
    expect(owner.shader.glProgram.fragment?.match(/uniform vec4 uCrownPair/g)).toHaveLength(8);
    expect(owner.shader.glProgram.fragment).not.toContain('sin(');
    expect(owner.shader.glProgram.fragment).toContain(
      'canopy=tap(p,a)*w.x+tap(p,b)*w.y+tap(p,c)*w.z',
    );
    expect(owner.shader.glProgram.fragment).toContain(
      'vec4(canopy.rgb*vLight,canopy.a)*vCanopy*vColor',
    );
    expect(owner.getDiagnostics()).toMatchObject({
      ownedMeshes: 1,
      ownedGeometries: 1,
      ownedBuffers: 2,
      ownedShaders: 1,
      ownedPrograms: 1,
      ownedTextures: 0,
      ownedSources: 0,
      ownedMasks: 0,
      ownedFilters: 0,
      ownedFramebuffers: 0,
      bufferBytes: 792600,
      sampleQueries: 99846,
    });
    owner.destroy();
    owner.destroy();
    expect(texture.destroyed).toBe(false);
    expect(texture.source.destroyed).toBe(false);
    expect(texture.source.style).toBe(style);
    expect(owner.getDiagnostics().bufferBytes).toBe(0);
  } finally {
    owner?.destroy();
    texture?.destroy(true);
    DOMAdapter.set(adapter);
  }
});

it('certifies every original source texel and bilinear margin in overlapping near-opaque crown windows', () => {
  const bytes = readFileSync(
    new URL('../../public/assets/textures/terrain-forest-canopy-v1.png', import.meta.url),
  );
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '451903f3bd3eb1b6c4d5127fa3e3a135ad31541709a009895c8b70ed590c4262',
  );
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([1374, 1145]);
  const rx = Math.ceil(0.105 * png.width) + 2,
    ry = Math.ceil(0.105 * png.height) + 2;
  expect([rx, ry]).toEqual([147, 123]);
  // Exhaustive ORIGINAL RGBA scan, independent of producer catalog/UV math.
  const side = png.width + 1,
    integral = new Uint32Array(side * (png.height + 1));
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const i = (y + 1) * side + x + 1;
      integral[i] =
        (png.data[(y * png.width + x) * 4 + 3]! < 250 ? 1 : 0) +
        integral[i - 1]! +
        integral[i - side]! -
        integral[i - side - 1]!;
    }
  const eligible: { x: number; y: number }[] = [];
  for (let y = ry; y + ry < png.height; y += 16)
    for (let x = rx; x + rx < png.width; x += 16) {
      const x0 = x - rx,
        y0 = y - ry,
        x1 = x + rx + 1,
        y1 = y + ry + 1;
      if (
        integral[y1 * side + x1]! -
          integral[y0 * side + x1]! -
          integral[y1 * side + x0]! +
          integral[y0 * side + x0]! !==
        0
      )
        continue;
      eligible.push({ x, y });
    }
  expect(eligible).toHaveLength(633);
  const selected: { x: number; y: number }[] = [];
  while (selected.length < 16) {
    let best = eligible[0]!,
      score = -Infinity;
    for (const p of eligible) {
      const value = selected.length
        ? Math.min(...selected.map((q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2))
        : -((p.x - png.width / 2) ** 2 + (p.y - png.height / 2) ** 2);
      if (value > score) {
        best = p;
        score = value;
      }
    }
    selected.push(best);
  }
  expect(FOOTHILL_CROWN_PATCHES).toEqual(selected);
  let minimumAlpha = 255,
    checked = 0,
    minimumSeparation = Infinity;
  for (const [i, p] of FOOTHILL_CROWN_PATCHES.entries()) {
    expect(p.x - rx).toBeGreaterThanOrEqual(0);
    expect(p.y - ry).toBeGreaterThanOrEqual(0);
    expect(p.x + rx).toBeLessThan(png.width);
    expect(p.y + ry).toBeLessThan(png.height);
    for (let y = p.y - ry; y <= p.y + ry; y++)
      for (let x = p.x - rx; x <= p.x + rx; x++) {
        minimumAlpha = Math.min(minimumAlpha, png.data[(y * png.width + x) * 4 + 3]!);
        checked++;
      }
    for (const q of FOOTHILL_CROWN_PATCHES.slice(i + 1))
      minimumSeparation = Math.min(minimumSeparation, Math.hypot(p.x - q.x, p.y - q.y));
  }
  expect(checked).toBe(16 * 295 * 247);
  expect(minimumAlpha).toBeGreaterThanOrEqual(250);
  expect(minimumSeparation).toBe(112);
  // Windows overlap: separated centers do NOT imply disjoint original content.
  // Convex blending preserves actual alpha in[250,255], never normalizes to255.
});

it('shares exact translated images across every triangle edge and diagonal, including negative world sites', () => {
  const tile = foothillCanopyTileWorld({
    width: 1374,
    height: 1145,
    worldPerSourcePixel: FOOTHILL_CANOPY.worldPerSourcePixel,
  });
  const point = (x: number, y: number) => ({
    x: (x + y / 2) * tile.x,
    y: ((y * Math.sqrt(3)) / 2) * tile.y,
  });
  for (let y = -5; y <= 5; y++)
    for (let x = -5; x <= 5; x++)
      for (const t of [0.1, 0.5, 0.9]) {
        for (const [qx, qy, dx, dy] of [
          [x + t, y, 0, 1],
          [x, y + t, 1, 0],
          [x + t, y + 1 - t, 1, 1],
        ]) {
          const a = foothillCanopySamples(point(qx! - dx! * 1e-8, qy! - dy! * 1e-8));
          const b = foothillCanopySamples(point(qx! + dx! * 1e-8, qy! + dy! * 1e-8));
          for (const taps of [a, b]) {
            expect(taps).toHaveLength(3);
            expect(taps.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 12);
            for (const tap of taps) {
              expect(tap.weight).toBeGreaterThanOrEqual(0);
              const center = FOOTHILL_CROWN_PATCHES[tap.patchIndex]!;
              expect(Math.abs(tap.u - (center.x + 0.5) / 1374)).toBeLessThanOrEqual(0.105 + 1e-12);
              expect(Math.abs(tap.v - (center.y + 0.5) / 1145)).toBeLessThanOrEqual(0.105 + 1e-12);
            }
          }
          for (const p of a.filter((p) => p.weight > 1e-10)) {
            const q = b.find((q) => q.site[0] === p.site[0] && q.site[1] === p.site[1]);
            expect(q).toBeDefined();
            expect(q!.patchIndex).toBe(p.patchIndex);
            expect(q!.u).toBeCloseTo(p.u, 7);
            expect(q!.v).toBeCloseTo(p.v, 7);
            expect(q!.weight).toBeCloseTo(p.weight, 6);
          }
        }
      }
});
