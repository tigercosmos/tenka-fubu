import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const failures = vi.hoisted(() => ({ shader: false }));
vi.mock('pixi.js', async (importActual) => {
  const actual = await importActual<typeof import('pixi.js')>();
  return {
    ...actual,
    Shader: class extends actual.Shader {
      constructor(...args: ConstructorParameters<typeof actual.Shader>) {
        if (failures.shader) throw new Error('controlled shader construction failure');
        super(...args);
      }
    },
  };
});
import { DOMAdapter, GlProgram, GlShaderSystem, Texture, type WebGLRenderer } from 'pixi.js';
import { createTerrainFoothillCanopy } from '@ui/map/terrain/terrainFoothillCanopy';
import { createTerrainElevatedSurface } from '@ui/map/terrain/terrainElevatedSurface';
const adapter = DOMAdapter.get();
const field = {
  vertexHeights: [0, 0, 0, 0],
  bounds: {
    cells: 1,
    worldSize: 32,
    maximumHeight: 0,
    displacementLipschitz: 0,
    maximumQueryEdgeVisits: 0,
  },
  sample: () => 0,
  project: (p: { x: number; y: number }) => p,
};
const factories = {
  canopy: () => createTerrainFoothillCanopy(Texture.WHITE, field),
  elevated: () => createTerrainElevatedSurface(Texture.WHITE, field, { cells: 1, worldSize: 32 }),
};
beforeEach(() =>
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  }),
);
afterEach(() => {
  failures.shader = false;
  vi.restoreAllMocks();
  DOMAdapter.set(adapter);
});
it.each(Object.keys(factories) as (keyof typeof factories)[])(
  '%s bounds interned source keys across repeated private-owner replacement',
  (family) => {
    const keys = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const a = factories[family]();
      keys.add(a.shader.glProgram._key);
      a.destroy();
      a.destroy();
    }
    expect(keys.size).toBe(1);
  },
);
it.each(Object.keys(factories) as (keyof typeof factories)[])(
  '%s reuses a released key without sharing the program of another live renderer owner',
  (family) => {
    // CPU object ownership; browser remount test separately verifies actual GPU lifecycle.
    const a = factories[family](),
      b = factories[family]();
    const key = a.shader.glProgram._key,
      other = b.shader.glProgram,
      vertex = other.vertex;
    expect(a.shader.glProgram).not.toBe(other);
    expect(key).not.toBe(other._key);
    a.destroy();
    a.destroy();
    const replacement = factories[family]();
    try {
      expect(replacement.shader.glProgram._key).toBe(key);
      expect(replacement.shader.glProgram).not.toBe(other);
      expect(replacement.shader.glProgram).not.toBe(a.shader.glProgram);
      expect(other.vertex).toBe(vertex);
      expect(other.vertex).not.toBeNull();
      replacement.destroy();
      expect(other.vertex).toBe(vertex);
    } finally {
      replacement.destroy();
      b.destroy();
    }
  },
);
it.each(Object.keys(factories) as (keyof typeof factories)[])(
  '%s returns a private slot after shader construction failure',
  (family) => {
    const first = factories[family](),
      key = first.shader.glProgram._key;
    first.destroy();
    const programDestroy = vi.spyOn(GlProgram.prototype, 'destroy');
    failures.shader = true;
    expect(() => factories[family]()).toThrow('controlled shader construction failure');
    failures.shader = false;
    const recovered = factories[family]();
    try {
      expect(programDestroy.mock.contexts.map((program) => (program as GlProgram)._key)).toEqual([
        key,
      ]);
      expect(recovered.shader.glProgram._key).toBe(key);
    } finally {
      recovered.destroy();
    }
  },
);

it('keeps compiled program cache entries local to simultaneous renderers when a released source key is reused', () => {
  // Exercise actual Pixi cache lookup/destruction with admitted compiled-data records;
  // no GL compilation is claimed by this CPU test.
  const a = factories.canopy(),
    b = factories.canopy();
  const key = a.shader.glProgram._key;
  const rendererA = new GlShaderSystem({} as WebGLRenderer),
    rendererB = new GlShaderSystem({} as WebGLRenderer);
  const dataA = {
    attributeData: {},
    reflectedUniformData: {},
    uniformBlockData: {},
    destroy: vi.fn(),
  };
  const dataB = {
    attributeData: {},
    reflectedUniformData: {},
    uniformBlockData: {},
    destroy: vi.fn(),
  };
  const cache = (renderer: GlShaderSystem) =>
    renderer as unknown as {
      _programDataHash: Record<number, typeof dataA>;
      _getProgramData(program: GlProgram): typeof dataA;
    };
  cache(rendererA)._programDataHash[key] = dataA;
  cache(rendererB)._programDataHash[b.shader.glProgram._key] = dataB;
  a.destroy();
  const c = factories.canopy();
  try {
    expect(c.shader.glProgram._key).toBe(key);
    expect(cache(rendererA)._getProgramData(c.shader.glProgram)).toBe(dataA);
    expect(cache(rendererB)._getProgramData(b.shader.glProgram)).toBe(dataB);
    rendererA.destroy();
    expect(dataA.destroy).toHaveBeenCalledTimes(1);
    expect(dataB.destroy).not.toHaveBeenCalled();
    expect(cache(rendererB)._getProgramData(b.shader.glProgram)).toBe(dataB);
    expect(b.shader.glProgram.vertex).not.toBeNull();
  } finally {
    c.destroy();
    b.destroy();
    rendererB.destroy();
  }
});
