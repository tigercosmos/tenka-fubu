import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWasmGeographicScorer,
  geographicScorerImports,
  type GeographicScorerInput,
} from '../../src/ui/map/wasmGeographicScorer';

function mockBackend() {
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
    const larger = { ...original, offsets: Array.from({ length: 10000 }, () => ({ x: 0, y: 0 })) };
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
    scorer.score({ ...input(), baselinePrimary: Infinity, hardBaseline: [NaN] });
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
    const pending = scorer.initialize('/render.wasm');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
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
    const pending = scorer.initialize('/render.wasm');
    await expect(scorer.initialize('/render.wasm')).rejects.toThrow('already started');
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
    const pending = scorer.initialize('/render.wasm');
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
    await expect(scorer.initialize('/render.wasm')).rejects.toThrow('404');
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
    await expect(scorer.initialize('/render.wasm')).rejects.toThrow('ABI');
    await scorer.initialize('/render.wasm');
    expect(scorer.isReady()).toBe(true);
    const data = input();
    expect(scorer.score(data)).toBe(data.offsets[0]);
    expect(instantiate).toHaveBeenCalledTimes(2);
    scorer.dispose();
  });
});
