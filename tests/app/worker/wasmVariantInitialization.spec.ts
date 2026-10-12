import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initializeRustBackend,
  createWorkerExecutor,
} from '../../../src/app/worker/simulation.worker';
import {
  clearRustPathfinding,
  isRustPathfindingReady,
  rustPathfindingImports,
} from '../../../src/core/acceleration/pathfindingKernel';
import { buildTinyState } from '../../fixtures/tiny';
import { advanceDay } from '../../../src/core/systems';
import type { SimulationWorkerRequest } from '../../../src/app/worker/protocol';
afterEach(() => {
  vi.restoreAllMocks();
  clearRustPathfinding();
});
const bytesFor = (variant: 'scalar' | 'simd128') =>
  Uint8Array.from(
    readFileSync(`public/wasm/tenka_engine${variant === 'simd128' ? '.simd' : ''}.wasm`),
  ).buffer;
function transport(variant: 'scalar' | 'simd128') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(bytesFor(variant)),
  } as Response);
}
function fetchedUrl(value: RequestInfo | URL): string {
  if (!(value instanceof URL)) throw new Error('Worker loader must fetch a resolved URL');
  return value.href;
}
describe('actual Worker numeric variant initialization', () => {
  it.each([
    { supported: true, variant: 'scalar', file: 'tenka_engine.wasm' },
    { supported: false, variant: 'scalar', file: 'tenka_engine.wasm' },
  ] as const)(
    'confirms $variant before the unchanged ready handshake and deterministic tick',
    async ({ supported, variant, file }) => {
      clearRustPathfinding();
      const validate = vi.spyOn(WebAssembly, 'validate').mockReturnValue(supported),
        fetch = transport(variant);
      const executor = createWorkerExecutor();
      const [ready, second] = await Promise.all([executor.initialize(7), executor.initialize(7)]);
      expect(ready).toEqual({
        kind: 'ready',
        epoch: 7,
        backend: 'rust-wasm',
        engineAbi: 1,
      });
      expect(second).toEqual(ready);
      expect(validate).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetchedUrl(fetch.mock.calls[0]![0])).toBe(
        new URL(`/wasm/${file}`, globalThis.location.origin).href,
      );
      expect(isRustPathfindingReady()).toBe(true);
      const state = buildTinyState(),
        reference = structuredClone(state);
      advanceDay(reference, []);
      const request: SimulationWorkerRequest = {
        kind: 'tick',
        epoch: 7,
        requestId: 1,
        beforeStateVersion: state.meta.stateVersion,
        state,
        commands: [],
        eventDefs: null,
      };
      const reply = await executor(request);
      if (reply.kind !== 'complete') throw new Error(reply.error.message);
      expect(reply.state).toEqual(reference);
      expect(reply.backend).toBe('rust-wasm');
      expect(validate).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it('checks an explicit custom artifact expected mode rather than deriving it from the module', async () => {
    clearRustPathfinding();
    const fetch = transport('scalar');
    await expect(
      initializeRustBackend({ url: '/custom.wasm', variant: 'simd128' }),
    ).rejects.toThrow('variant mismatch');
    expect(fetch).toHaveBeenCalledOnce();
    expect(isRustPathfindingReady()).toBe(false);
    await expect(initializeRustBackend({ url: '/custom.wasm', variant: 'scalar' })).resolves.toBe(
      1,
    );
    expect(isRustPathfindingReady()).toBe(true);
  });
  it.each([
    'fetch',
    'instantiate',
    'missingABI',
    'missingVariant',
    'wrongABI',
    'wrongVariant',
  ] as const)(
    'never sends ready or attempts another artifact fallback for %s failure',
    async (failure) => {
      clearRustPathfinding();
      vi.spyOn(WebAssembly, 'validate').mockReturnValue(true);
      const exports: Record<string, unknown> = {
        ...new WebAssembly.Instance(
          new WebAssembly.Module(new Uint8Array(bytesFor('scalar'))),
          rustPathfindingImports(),
        ).exports,
      };
      if (failure === 'missingABI') delete exports.render_numeric_abi_version;
      if (failure === 'missingVariant') delete exports.render_numeric_variant;
      if (failure === 'wrongABI') exports.render_numeric_abi_version = () => 2;
      if (failure === 'wrongVariant') exports.render_numeric_variant = () => 1;
      const fetch = vi.spyOn(globalThis, 'fetch');
      if (failure === 'fetch') fetch.mockRejectedValue(new Error('network failure'));
      else
        fetch.mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(bytesFor('scalar')),
        } as Response);
      const instantiate = vi.spyOn(WebAssembly, 'instantiate');
      if (failure === 'instantiate')
        instantiate.mockRejectedValue(new Error('instantiation failure'));
      else
        instantiate.mockResolvedValue({
          instance: { exports },
          module: {},
        } as unknown as WebAssembly.Instance);
      const executor = createWorkerExecutor();
      await expect(executor.initialize(9)).rejects.toThrow();
      await expect(executor.initialize(9)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetchedUrl(fetch.mock.calls[0]![0])).toContain('/wasm/tenka_engine.wasm');
      expect(instantiate).toHaveBeenCalledTimes(failure === 'fetch' ? 0 : 1);
      expect(isRustPathfindingReady()).toBe(false);
    },
  );
  it('caches capability errors per executor without fetching or producing ready', async () => {
    clearRustPathfinding();
    const error = new Error('capability validation failure');
    const validate = vi.spyOn(WebAssembly, 'validate').mockImplementation(() => {
      throw error;
    });
    const fetch = vi.spyOn(globalThis, 'fetch'),
      instantiate = vi.spyOn(WebAssembly, 'instantiate');
    const executor = createWorkerExecutor();
    await expect(executor.initialize(12)).rejects.toBe(error);
    validate.mockReturnValue(false);
    await expect(executor.initialize(12)).rejects.toBe(error);
    expect(validate).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(instantiate).not.toHaveBeenCalled();
    expect(isRustPathfindingReady()).toBe(false);
  });
  it('retains explicit custom SIMD initialization and the original ready handshake', async () => {
    clearRustPathfinding();
    const fetch = transport('simd128');
    const executor = createWorkerExecutor(() =>
      initializeRustBackend({ url: '/custom-simd.wasm', variant: 'simd128' }),
    );
    await expect(executor.initialize(17)).resolves.toEqual({
      kind: 'ready',
      epoch: 17,
      backend: 'rust-wasm',
      engineAbi: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetchedUrl(fetch.mock.calls[0]![0])).toBe(
      new URL('/custom-simd.wasm', globalThis.location.origin).href,
    );
    expect(isRustPathfindingReady()).toBe(true);
  });
});
