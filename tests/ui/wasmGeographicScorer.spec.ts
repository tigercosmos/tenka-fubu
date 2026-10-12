import { readFileSync } from 'node:fs';
import { isRustPathfindingReady } from '../../src/core/acceleration/pathfindingKernel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWasmGeographicScorer,
  geographicScorerImports,
  type GeographicScorerInput,
} from '../../src/ui/map/wasmGeographicScorer';

function mockBackend(variant: 0 | 1 = 0) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let next = 8;
  const alloc = vi.fn((words: number) => {
    const pointer = next;
    next += words * 8;
    while (next > memory.buffer.byteLength) memory.grow(1);
    return pointer;
  });
  const free = vi.fn((pointer: number, words: number) => {
    void pointer;
    void words;
  });
  const score = vi.fn((pointer: number, words: number) => {
    void pointer;
    void words;
    return 0;
  });
  const exports = {
    memory,
    render_numeric_abi_version: () => 1,
    render_numeric_variant: () => variant,
    geographic_abi_version: () => 1,
    engine_alloc: alloc,
    engine_free: free,
    geo_score: score,
  };
  return { memory, alloc, free, score, exports };
}
function input(): GeographicScorerInput {
  return {
    rect: { x: 1, y: 2, width: 3, height: 4 },
    baselinePrimary: 5,
    roadLine: { normal: { x: 6, y: 7 }, slack: 8 },
    offsets: [
      { x: -0, y: 9 },
      { x: 10, y: 11 },
    ],
    primary: [{ x: 12, y: 13, width: 14, height: 15 }],
    hard: [{ x: 16, y: 17, width: 18, height: 19 }],
    hardBaseline: [20],
    reserved: [{ x: 21, y: 22, width: 23, height: 24 }],
    roadCapsules: [{ a: { x: 25, y: 26 }, b: { x: 27, y: 28 }, radius: 29 }],
  };
}
function freezeDeep(value: object): void {
  Object.freeze(value);
  for (const child of Object.values(value))
    if (typeof child === 'object' && child !== null) freezeDeep(child as object);
}
afterEach(() => vi.restoreAllMocks());

describe('WASM geographic scorer adapter', () => {
  it('packs the exact ABI field order without changing inputs, and returns the original object', () => {
    const wasm = mockBackend();
    const scorer = createWasmGeographicScorer(wasm.exports);
    const data = input();
    freezeDeep(data);
    wasm.score.mockReturnValue(1);
    expect(scorer.score(data)).toBe(data.offsets[1]);
    const [pointer, words] = wasm.score.mock.calls[0]!;
    expect(words).toBe(38);
    expect(Array.from(new Float64Array(wasm.memory.buffer, pointer, words))).toEqual([
      1, 1, 2, 3, 4, 5, 1, 6, 7, 8, 2, 2, 1, 1, 1, 1, -0, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    ]);
    wasm.score.mockReturnValue(0);
    expect(Object.is(scorer.score(data)!.x, -0)).toBe(true);
    scorer.dispose();
  });

  it.each([
    [undefined, 0],
    [null, 1],
    [[], 2],
  ] as const)(
    'distinguishes capsule mode %s without stale optional header fields',
    (capsules, mode) => {
      const wasm = mockBackend();
      const scorer = createWasmGeographicScorer(wasm.exports);
      scorer.score(input());
      const base = { ...input() };
      delete (base as { roadLine?: unknown }).roadLine;
      delete (base as { roadCapsules?: unknown }).roadCapsules;
      const data = capsules === undefined ? base : { ...base, roadCapsules: capsules };
      scorer.score(data);
      const [pointer, words] = wasm.score.mock.calls[1]!;
      const packed = new Float64Array(wasm.memory.buffer, pointer, words);
      expect(Array.from(packed.slice(6, 11))).toEqual([0, 0, 0, 0, mode]);
      expect(packed[15]).toBe(0);
      expect(words).toBe(33);
      scorer.dispose();
    },
  );

  it('reuses capacity, frees exact allocation lengths, and survives memory growth during solve', () => {
    const wasm = mockBackend();
    const scorer = createWasmGeographicScorer(wasm.exports);
    wasm.score.mockImplementationOnce(() => {
      wasm.memory.grow(1);
      return 0;
    });
    const original = input();
    const returned = scorer.score(original);
    scorer.score(original);
    expect(wasm.alloc).toHaveBeenCalledTimes(1);
    expect(returned).toBe(original.offsets[0]);
    const larger = {
      ...original,
      offsets: Array.from({ length: 10000 }, () => ({ x: 0, y: 0 })),
    };
    scorer.score(larger);
    expect(wasm.alloc).toHaveBeenCalledTimes(2);
    expect(wasm.free.mock.calls[0]).toEqual([8, 38]);
    scorer.score(original);
    expect(wasm.alloc).toHaveBeenCalledTimes(2);
    scorer.dispose();
    scorer.dispose();
    expect(wasm.free).toHaveBeenCalledTimes(2);
    expect(wasm.free.mock.calls[1]?.[1]).toBe(wasm.alloc.mock.calls[1]?.[0]);
    expect(returned).toBe(original.offsets[0]);
    expect(scorer.isReady()).toBe(false);
    expect(() => scorer.score(original)).toThrow('disposed');
  });

  it('distinguishes legitimate no-result from malformed or invalid kernel results', () => {
    const wasm = mockBackend();
    const scorer = createWasmGeographicScorer(wasm.exports);
    wasm.score.mockReturnValue(-1);
    expect(scorer.score(input())).toBeUndefined();
    wasm.score.mockReturnValue(-2);
    expect(() => scorer.score(input())).toThrow('Malformed');
    for (const result of [-3, 2, 0.5, NaN, Infinity]) {
      wasm.score.mockReturnValue(result);
      expect(() => scorer.score(input())).toThrow('Invalid geographic scorer result');
    }
    scorer.dispose();
  });

  it('does not reject nonfinite scoring values that the existing arithmetic can produce', () => {
    const wasm = mockBackend();
    const scorer = createWasmGeographicScorer(wasm.exports);
    scorer.score({
      ...input(),
      baselinePrimary: Infinity,
      hardBaseline: [NaN],
    });
    const [pointer, words] = wasm.score.mock.calls[0]!;
    const packed = new Float64Array(wasm.memory.buffer, pointer, words);
    expect(packed[5]).toBe(Infinity);
    expect(packed[28]).toBeNaN();
    scorer.dispose();
  });

  it('rejects incompatible exports, unready use, baseline mismatch and invalid allocation', () => {
    for (const exports of [{}, { ...mockBackend().exports, geographic_abi_version: () => 2 }])
      expect(() => createWasmGeographicScorer(exports)).toThrow('ABI');
    const scorer = createWasmGeographicScorer();
    expect(scorer.isReady()).toBe(false);
    expect(() => scorer.score(input())).toThrow('not ready');
    const wasm = mockBackend();
    scorer.install(wasm.exports);
    expect(() => scorer.install(wasm.exports)).toThrow('already installed');
    expect(() => scorer.score({ ...input(), hardBaseline: [] })).toThrow('count mismatch');
    expect(wasm.alloc).not.toHaveBeenCalled();
    wasm.alloc.mockReturnValue(3);
    expect(() => scorer.score(input())).toThrow('Invalid geographic scorer arena');
    expect(wasm.score).not.toHaveBeenCalled();
    scorer.dispose();
  });

  it('aborts a pending fetch on disposal before instantiation or arena allocation', async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      expect(_url).toBe('/render.wasm');
      signal = options?.signal ?? undefined;
      const transportSignal = signal;
      if (!transportSignal) throw new Error('Missing fetch abort signal');
      return new Promise<Response>((_resolve, reject) => {
        void _resolve;
        transportSignal.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Transport aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    });
    const wasm = mockBackend();
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');
    const scorer = createWasmGeographicScorer();
    const pending = scorer.initialize({
      url: '/render.wasm',
      variant: 'scalar',
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(signal?.aborted).toBe(false);
    scorer.dispose();
    expect(signal?.aborted).toBe(true);
    await rejected;
    expect(instantiate).not.toHaveBeenCalled();
    expect(wasm.alloc).not.toHaveBeenCalled();
    expect(scorer.isReady()).toBe(false);
  });

  it('creates only a separate instance and rejects late initialization after disposal', async () => {
    let resolveBytes!: (bytes: ArrayBuffer) => void;
    const bytes = new Promise<ArrayBuffer>((resolve) => {
      resolveBytes = resolve;
    });
    const response = { ok: true, arrayBuffer: () => bytes };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response as Response);
    const wasm = mockBackend();
    const instantiate = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: { exports: wasm.exports } as unknown as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    } as unknown as WebAssembly.Instance);
    const scorer = createWasmGeographicScorer();
    const pending = scorer.initialize({
      url: '/render.wasm',
      variant: 'scalar',
    });
    await expect(scorer.initialize({ url: '/render.wasm', variant: 'scalar' })).rejects.toThrow(
      'already started',
    );
    scorer.dispose();
    resolveBytes(new ArrayBuffer(8));
    await expect(pending).rejects.toThrow('disposed');
    expect(instantiate).not.toHaveBeenCalled();
    expect(wasm.alloc).not.toHaveBeenCalled();
    expect(scorer.isReady()).toBe(false);
    expect(() => geographicScorerImports().env.path_node_cost(0)).toThrow('render instance');
  });

  it('cannot install a module that finishes instantiating after disposal', async () => {
    const wasm = mockBackend();
    let resolveInstance!: (value: WebAssembly.WebAssemblyInstantiatedSource) => void;
    const pendingInstance = new Promise<WebAssembly.WebAssemblyInstantiatedSource>((resolve) => {
      resolveInstance = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as Response);
    const started = vi.fn();
    vi.spyOn(WebAssembly, 'instantiate').mockImplementation(() => {
      started();
      return pendingInstance as unknown as Promise<WebAssembly.Instance>;
    });
    const scorer = createWasmGeographicScorer();
    const pending = scorer.initialize({
      url: '/render.wasm',
      variant: 'scalar',
    });
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    scorer.dispose();
    resolveInstance({
      instance: { exports: wasm.exports },
      module: {},
    });
    await expect(pending).rejects.toThrow('disposed');
    expect(scorer.isReady()).toBe(false);
    expect(wasm.alloc).not.toHaveBeenCalled();
    expect(() => scorer.install(wasm.exports)).toThrow('disposed');
  });

  it('keeps arenas independent across owners sharing the same exports', () => {
    const wasm = mockBackend();
    const first = createWasmGeographicScorer(wasm.exports);
    const second = createWasmGeographicScorer(wasm.exports);
    first.score(input());
    second.score(input());
    const firstPointer = wasm.score.mock.calls[0]![0];
    const secondPointer = wasm.score.mock.calls[1]![0];
    expect(firstPointer).not.toBe(secondPointer);
    first.dispose();
    expect(wasm.free.mock.calls).toEqual([[firstPointer, 38]]);
    second.score(input());
    expect(wasm.score.mock.calls[2]![0]).toBe(secondPointer);
    second.dispose();
    expect(wasm.free.mock.calls[1]).toEqual([secondPointer, 38]);
  });

  it('awaits successful initialization and surfaces fetch and ABI preparation failures', async () => {
    const wasm = mockBackend();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    const scorer = createWasmGeographicScorer();
    await expect(scorer.initialize({ url: '/render.wasm', variant: 'scalar' })).rejects.toThrow(
      '404',
    );
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as Response);
    const instantiate = vi
      .spyOn(WebAssembly, 'instantiate')
      .mockResolvedValueOnce({
        instance: { exports: {} } as WebAssembly.Instance,
        module: {} as WebAssembly.Module,
      } as unknown as WebAssembly.Instance)
      .mockResolvedValueOnce({
        instance: { exports: wasm.exports } as unknown as WebAssembly.Instance,
        module: {} as WebAssembly.Module,
      } as unknown as WebAssembly.Instance);
    await expect(scorer.initialize({ url: '/render.wasm', variant: 'scalar' })).rejects.toThrow(
      'ABI',
    );
    await scorer.initialize({ url: '/render.wasm', variant: 'scalar' });
    expect(scorer.isReady()).toBe(true);
    const data = input();
    expect(scorer.score(data)).toBe(data.offsets[0]);
    expect(instantiate).toHaveBeenCalledTimes(2);
    scorer.dispose();
  });
  it.each([
    {
      supported: true,
      variant: 'simd128',
      flag: 1,
      file: 'tenka_engine.simd.wasm',
    },
    { supported: false, variant: 'scalar', flag: 0, file: 'tenka_engine.wasm' },
  ] as const)(
    'initializes the selected $variant once, with explicit matching exports',
    async ({ supported, variant, flag, file }) => {
      const validate = vi.spyOn(WebAssembly, 'validate').mockReturnValue(supported);
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as Response);
      const wasm = mockBackend(flag);
      const instantiate = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
        instance: { exports: wasm.exports },
        module: {},
      } as unknown as WebAssembly.Instance);
      const scorer = createWasmGeographicScorer();
      await scorer.initialize();
      expect(validate).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
      expect(instantiate).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]![0]).toBe(`/wasm/${file}`);
      expect(scorer.getNumericVariant()).toBe(variant);
      expect(scorer.isReady()).toBe(true);
      expect(() => geographicScorerImports().env.path_node_cost(0)).toThrow('render instance');
      const data = input();
      scorer.score(data);
      const allocations = wasm.alloc.mock.calls.length;
      wasm.memory.grow(1);
      expect(scorer.score(data)).toBe(data.offsets[0]);
      expect(wasm.alloc.mock.calls.length).toBe(allocations);
      scorer.dispose();
      scorer.dispose();
      expect(wasm.free).toHaveBeenCalledTimes(allocations);
      expect(scorer.getNumericVariant()).toBeNull();
    },
  );
  it('retains the first selection across an explicit retry and rejects a different custom artifact', async () => {
    const validate = vi.spyOn(WebAssembly, 'validate').mockReturnValue(true);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const wasm = mockBackend(1);
    vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: { exports: wasm.exports },
      module: {},
    } as unknown as WebAssembly.Instance);
    const scorer = createWasmGeographicScorer();
    await expect(scorer.initialize()).rejects.toThrow('503');
    expect(() => scorer.install(mockBackend().exports)).toThrow('variant mismatch');
    validate.mockReturnValue(false);
    await expect(
      scorer.initialize({ url: '/wasm/tenka_engine.wasm', variant: 'scalar' }),
    ).rejects.toThrow('already selected');
    fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as Response);
    await scorer.initialize();
    expect(validate).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url === '/wasm/tenka_engine.simd.wasm')).toBe(true);
    expect(scorer.getNumericVariant()).toBe('simd128');
    scorer.dispose();
  });
  it.each([
    'fetch',
    'instantiate',
    'missingABI',
    'missingVariant',
    'wrongABI',
    'wrongVariant',
  ] as const)('surfaces selected-module %s failure without a scalar fallback', async (failure) => {
    vi.spyOn(WebAssembly, 'validate').mockReturnValue(true);
    const wasm = mockBackend(1),
      exports: Record<string, unknown> = { ...wasm.exports };
    if (failure === 'missingABI') delete exports.render_numeric_abi_version;
    if (failure === 'missingVariant') delete exports.render_numeric_variant;
    if (failure === 'wrongABI') exports.render_numeric_abi_version = () => 2;
    if (failure === 'wrongVariant') exports.render_numeric_variant = () => 0;
    const fetch = vi.spyOn(globalThis, 'fetch');
    if (failure === 'fetch') fetch.mockRejectedValue(new Error('network unavailable'));
    else
      fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as Response);
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');
    if (failure === 'instantiate') instantiate.mockRejectedValue(new Error('compile failure'));
    else
      instantiate.mockResolvedValue({
        instance: { exports },
        module: {},
      } as unknown as WebAssembly.Instance);
    const scorer = createWasmGeographicScorer();
    await expect(scorer.initialize()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toBe('/wasm/tenka_engine.simd.wasm');
    expect(instantiate).toHaveBeenCalledTimes(failure === 'fetch' ? 0 : 1);
    expect(scorer.isReady()).toBe(false);
    expect(wasm.alloc).not.toHaveBeenCalled();
    scorer.dispose();
  });
  it('requires explicit expected SIMD for injected exports and leaves readiness false on mismatch', () => {
    const wasm = mockBackend(1);
    expect(() => createWasmGeographicScorer(wasm.exports)).toThrow('variant mismatch');
    const scorer = createWasmGeographicScorer(wasm.exports, undefined, 'simd128');
    expect(scorer.getNumericVariant()).toBe('simd128');
    scorer.dispose();
    const pending = createWasmGeographicScorer();
    expect(() => pending.install(wasm.exports)).toThrow('variant mismatch');
    expect(pending.isReady()).toBe(false);
    pending.install(wasm.exports, 'simd128');
    expect(pending.isReady()).toBe(true);
    pending.dispose();
  });

  it('keeps a failed capability decision fatal for all later initialization attempts', async () => {
    const error = new Error('capability runtime failure');
    const validate = vi.spyOn(WebAssembly, 'validate').mockImplementation(() => {
      throw error;
    });
    const fetch = vi.spyOn(globalThis, 'fetch'),
      instantiate = vi.spyOn(WebAssembly, 'instantiate');
    const scorer = createWasmGeographicScorer();
    await expect(scorer.initialize()).rejects.toBe(error);
    validate.mockReturnValue(false);
    expect(() => scorer.install(mockBackend().exports)).toThrow(error);
    await expect(scorer.initialize()).rejects.toBe(error);
    await expect(scorer.initialize({ url: '/scalar.wasm', variant: 'scalar' })).rejects.toBe(error);
    expect(validate).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(instantiate).not.toHaveBeenCalled();
    scorer.dispose();
  });
  it('keeps actual scalar/SIMD render memories, three planners and disposal independent of the core backend', () => {
    const coreReady = isRustPathfindingReady();
    const make = (variant: 'scalar' | 'simd128') => {
      const bytes = Uint8Array.from(
        readFileSync(`public/wasm/tenka_engine${variant === 'simd128' ? '.simd' : ''}.wasm`),
      );
      const exports = new WebAssembly.Instance(
        new WebAssembly.Module(bytes),
        geographicScorerImports(),
      ).exports;
      const allocate = vi.fn(exports.engine_alloc as (words: number) => number);
      const free = vi.fn(exports.engine_free as (pointer: number, words: number) => void);
      const owner = createWasmGeographicScorer(
        { ...exports, engine_alloc: allocate, engine_free: free },
        undefined,
        variant,
      );
      return { exports, allocate, free, owner };
    };
    const a = make('simd128'),
      b = make('scalar');
    expect(a.exports.memory).not.toBe(b.exports.memory);
    expect(isRustPathfindingReady()).toBe(coreReady);
    const rect = { x: 0, y: 0, width: 20, height: 10 },
      geo = {
        rect,
        baselinePrimary: 0,
        offsets: [{ x: 0, y: 0 }],
        primary: [],
        hard: [],
        hardBaseline: [],
        reserved: [],
      };
    const castles = [{ id: 'castle', baseline: rect, anchor: { x: 10, y: -10 } }];
    for (const value of [a, b]) {
      value.owner.prepareCastlePlanner();
      value.owner.getPreparation().beginFrame([], [], 1);
      const descriptor = value.owner.getPreparation().prepare(rect);
      expect(value.owner.getPreparation().scorePrepared(descriptor, undefined, undefined)).toEqual({
        x: 0,
        y: 0,
      });
      expect(value.owner.score(geo)).toBe(geo.offsets[0]);
    }
    const castle = a.owner.layoutCastleRibbons(castles, []);
    expect(b.owner.layoutCastleRibbons(castles, [])).toEqual(castle);
    const count = a.allocate.mock.calls.length;
    (a.exports.memory as WebAssembly.Memory).grow(1);
    expect(
      a.owner
        .getPreparation()
        .scorePrepared(a.owner.getPreparation().prepare(rect), undefined, undefined),
    ).toEqual({ x: 0, y: 0 });
    expect(a.owner.layoutCastleRibbons(castles, [])).toEqual(castle);
    expect(a.owner.score(geo)).toBe(geo.offsets[0]);
    expect(a.allocate.mock.calls.length).toBe(count);
    a.owner.dispose();
    a.owner.dispose();
    expect(a.free.mock.calls.length).toBe(count);
    const allocations = a.allocate.mock.results.map((result, i) => [
      result.value >>> 0,
      a.allocate.mock.calls[i]![0],
    ]);
    expect(
      a.free.mock.calls.map(([ptr, words]) => [ptr >>> 0, words]).sort((x, y) => x[0]! - y[0]!),
    ).toEqual(allocations.sort((x, y) => x[0]! - y[0]!));
    expect(b.owner.layoutCastleRibbons(castles, [])).toEqual(castle);
    expect(b.owner.score(geo)).toBe(geo.offsets[0]);
    b.owner.dispose();
    expect(b.free.mock.calls.length).toBe(b.allocate.mock.calls.length);
    expect(isRustPathfindingReady()).toBe(coreReady);
  });
});
