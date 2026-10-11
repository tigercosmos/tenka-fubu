import { afterAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import * as esm from 'pixi.js';
import type { AlphaMaskPipe, Texture } from 'pixi.js';
import type { FilterEffect, MaskFilter } from 'pixi.js';

const cjs = createRequire(import.meta.url)('pixi.js') as typeof esm;
const modules = [esm, cjs];
const adapters = modules.map((module) => module.DOMAdapter.get());
modules.forEach((module, index) =>
  module.DOMAdapter.set({
    ...adapters[index]!,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  }),
);
afterAll(() => modules.forEach((module, index) => module.DOMAdapter.set(adapters[index]!)));

// Actual installed alpha-mask pipe and filter; only GPU submission is omitted.
function maskPass(texture: Texture, api = esm, duringPass?: (filter: MaskFilter) => void) {
  const { AlphaMaskPipe, Sprite, Matrix } = api;
  let effect: FilterEffect | undefined;
  const renderer = {
    filter: {
      push: (instruction: { filterEffect: FilterEffect }) => {
        effect = instruction.filterEffect;
      },
      pop: () => {},
    },
  } as unknown as ConstructorParameters<typeof AlphaMaskPipe>[0];
  const pipe = new AlphaMaskPipe(renderer);
  const mask = { renderMaskToTexture: false, mask: new Sprite(texture), channel: 'red' };
  const execute = (action: string) =>
    pipe.execute({ action, mask, inverse: false, maskedContainer: {} } as unknown as Parameters<
      AlphaMaskPipe['execute']
    >[0]);
  execute('pushMaskBegin');
  execute('pushMaskEnd');
  if (!effect) throw new Error('Actual alpha mask did not publish a filter');
  const filter = effect.filters[0] as MaskFilter;
  const manager = {
    calculateSpriteMatrix: () => new Matrix(),
    applyFilter: () => {},
  } as unknown as Parameters<MaskFilter['apply']>[0];
  filter.apply(manager, texture, texture, false);
  duringPass?.(filter);
  execute('popMaskEnd');
  pipe.destroy();
  mask.mask.destroy({ texture: false, textureSource: false });
  return filter;
}

const maskTexture = (api = esm) =>
  new api.Texture({
    source: new api.BufferImageSource({ resource: new Uint8Array(16), width: 2, height: 2 }),
  });

describe.each([
  ['ESM', esm],
  ['CJS', cjs],
] as const)('installed Pixi %s pooled alpha-mask teardown', (_mode, api) => {
  it('reuses a completed mask after its renderer-owned source was disposed exactly once', () => {
    const first = maskTexture(api);
    const sourceDestroy = vi.spyOn(first.source, 'destroy');
    const filter = maskPass(first, api);
    first.destroy(true);
    expect(sourceDestroy).toHaveBeenCalledTimes(1);
    expect(first.source).toBeNull();
    const second = maskTexture(api);
    try {
      expect(() => maskPass(second, api)).not.toThrow();
      expect(filter.resources.uMaskTexture).toBe(api.Texture.EMPTY.source);
    } finally {
      second.destroy(true);
    }
  });

  it('does not destroy or modify a separate live texture owner', () => {
    const independent = maskTexture(api),
      disposed = maskTexture(api);
    const independentSource = independent.source;
    try {
      expect(() =>
        maskPass(independent, api, (activeFilter) => {
          const completedFilter = maskPass(disposed, api);
          expect(completedFilter).not.toBe(activeFilter);
          disposed.destroy(true);
          const remounted = maskTexture(api);
          try {
            expect(maskPass(remounted, api)).toBe(completedFilter);
          } finally {
            remounted.destroy(true);
          }
          expect(activeFilter.resources.uMaskTexture).toBe(independentSource);
          expect(() => {
            activeFilter.inverse = true;
          }).not.toThrow();
        }),
      ).not.toThrow();
      expect(independent.source).toBe(independentSource);
      expect(independentSource.destroyed).toBe(false);
    } finally {
      independent.destroy(true);
    }
  });
});
