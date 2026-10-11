import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import * as esm from 'pixi.js';

const cjs = createRequire(import.meta.url)('pixi.js') as typeof esm;

// Real installed system/source/target. Only native GPU allocation and submission are omitted.
function owner(api: typeof esm, source: esm.BufferImageSource) {
  const renderer = { gc: { addCollection: () => {} } } as unknown as ConstructorParameters<
    typeof esm.RenderTargetSystem
  >[0];
  const system = new api.RenderTargetSystem(renderer);
  const gpu = {},
    releaseGpu = vi.fn();
  Object.defineProperty(system, 'adaptor', {
    value: {
      initGpuRenderTarget: () => gpu,
      destroyGpuRenderTarget: releaseGpu,
    },
  });
  const target = system.getRenderTarget(source);
  system.getGpuRenderTarget(target);
  const destroyTarget = vi.spyOn(target, 'destroy');
  return { system, target, destroyTarget, releaseGpu };
}

describe.each([
  ['ESM', esm],
  ['CJS', cjs],
] as const)('installed Pixi %s render target ownership', (_mode, api) => {
  it('detaches only its own destroy callback while a separate live owner retains shared source cleanup', () => {
    const source = new api.BufferImageSource({ resource: new Uint8Array(16), width: 2, height: 2 });
    const first = owner(api, source),
      second = owner(api, source);
    expect(source.listenerCount('destroy')).toBe(2);
    first.system.destroy();
    expect(source.listenerCount('destroy')).toBe(1);
    expect(first.destroyTarget).toHaveBeenCalledTimes(1);
    expect(source.destroyed).toBe(false);
    source.destroy();
    expect(source.listenerCount('destroy')).toBe(0);
    expect(first.destroyTarget).toHaveBeenCalledTimes(1);
    expect(first.releaseGpu).not.toHaveBeenCalled();
    expect(second.destroyTarget).toHaveBeenCalledTimes(1);
    expect(second.releaseGpu).toHaveBeenCalledTimes(1);
    const callbacks: unknown = Reflect.get(second.system, '_renderSurfaceDestroyCallbacks');
    expect(callbacks).toBeInstanceOf(Map);
    if (!(callbacks instanceof Map)) throw new Error('Missing owned callback registry');
    expect(callbacks.size).toBe(0);
    second.system.destroy();
    expect(second.destroyTarget).toHaveBeenCalledTimes(1);
  });

  it('keeps listeners bounded across repeated renderer remounts without clearing shared sources', () => {
    const source = new api.BufferImageSource({ resource: new Uint8Array(16), width: 2, height: 2 });
    const external = vi.fn();
    source.on('destroy', external);
    for (let cycle = 0; cycle < 20; cycle++) {
      const current = owner(api, source);
      expect(source.listenerCount('destroy')).toBe(2);
      current.system.destroy();
      expect(source.listenerCount('destroy')).toBe(1);
      expect(current.destroyTarget).toHaveBeenCalledTimes(1);
      expect(source.destroyed).toBe(false);
    }
    source.destroy();
    expect(external).toHaveBeenCalledTimes(1);
  });
});
