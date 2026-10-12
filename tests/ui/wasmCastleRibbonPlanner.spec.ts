import { describe, expect, it, vi } from 'vitest';
import { createWasmCastleRibbonPlanner } from '../../src/ui/map/wasmCastleRibbonPlanner';
import type { CastleRibbonCandidate } from '../../src/ui/map/sceneParts/castleRibbonLayout';

function backend() {
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
  const solve = vi.fn((pointer: number, words: number) => {
    const view = new Float64Array(memory.buffer, pointer, words);
    const count = view[1]!;
    const output = 16 + count * 8 + (view[2]! + view[3]! + view[4]!) * 4;
    view[6] = 7;
    for (let row = 0; row < count; row++) {
      const input = 16 + row * 8,
        start = output + row * 16;
      view.set(
        [
          0,
          -0,
          view[input]!,
          view[input + 1]!,
          view[input + 2]!,
          view[input + 3]!,
          0,
          1,
          0,
          2,
          0,
          view[input + 4]!,
          view[input + 5]!,
          3,
          4,
          1,
        ],
        start,
      );
    }
    return count;
  });
  const exports = {
    memory,
    engine_alloc: alloc,
    engine_free: free,
    castle_ribbon_abi_version: () => 1,
    castle_ribbon_solve: solve,
  };
  return { memory, alloc, free, solve, exports };
}
const rect = (x: number) => ({ x, y: x + 1, width: x + 2, height: x + 3 });
const candidate = (id = 'a'): CastleRibbonCandidate => ({
  id,
  baseline: rect(1),
  anchor: { x: 6, y: 7 },
});

describe('castle WASM adapter protocol', () => {
  it('packs priority/UTF16 sorting, stable ordinary rectangles and original hard/leader order', () => {
    const wasm = backend();
    const planner = createWasmCastleRibbonPlanner(wasm.exports);
    const emoji = { ...candidate('😀'), leaderObstacles: [rect(11), rect(9)] };
    const selected = {
      ...candidate('z'),
      selected: true,
      leaderObstacles: [rect(7)],
    };
    const inputs = [candidate('\uE000'), emoji, selected];
    const hard = [rect(13), rect(5)];
    const output = planner.layout(inputs, [rect(3), rect(2)], hard);
    expect([...output.keys()]).toEqual(['z', '😀', '\uE000']);
    const [pointer, words] = wasm.solve.mock.calls[0]!;
    expect(words).toBe(116);
    expect(Array.from(new Float64Array(wasm.memory.buffer, pointer, 16))).toEqual([
      1, 3, 2, 2, 3, 16, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const packed = new Float64Array(wasm.memory.buffer, pointer, words);
    expect(Array.from(packed.slice(16, 40))).toEqual([
      1, 2, 3, 4, 6, 7, 0, 1, 1, 2, 3, 4, 6, 7, 1, 2, 1, 2, 3, 4, 6, 7, 3, 0,
    ]);
    expect(Array.from(packed.slice(40, 68))).toEqual([
      2, 3, 4, 5, 3, 4, 5, 6, 13, 14, 15, 16, 5, 6, 7, 8, 7, 8, 9, 10, 11, 12, 13, 14, 9, 10, 11,
      12,
    ]);
    expect(inputs.map((value) => value.id)).toEqual(['\uE000', '😀', 'z']);
    expect(hard.map((value) => value.x)).toEqual([13, 5]);
    planner.dispose();
  });

  it('decodes all sixteen output fields with extra properties, signed zero and success-only callback', () => {
    const wasm = backend();
    const planner = createWasmCastleRibbonPlanner(wasm.exports);
    const label = {
      ...candidate(),
      baseline: { ...rect(1), marker: 'paint' },
      anchor: { x: 6, y: 7, marker: 'world' },
    };
    const onWork = vi.fn();
    const result = planner.layout([label], [], [], { onWork }).get('a')!;
    expect(result).toStrictEqual({
      offset: { x: 0, y: -0 },
      rect: { ...rect(1), marker: 'paint' },
      overlapArea: 0,
      baselineOverlapArea: 1,
      unresolved: false,
      triedPlacements: 2,
      budgetLimited: false,
      leader: {
        start: { x: 6, y: 7, marker: 'world' },
        end: { x: 3, y: 4 },
        visible: true,
      },
    });
    expect(onWork.mock.calls).toEqual([[7]]);
    planner.dispose();
  });

  it('reacquires memory after solve growth, reuses capacity and frees exactly once', () => {
    const wasm = backend();
    const normal = wasm.solve.getMockImplementation()!;
    wasm.solve.mockImplementationOnce((pointer, words) => {
      wasm.memory.grow(1);
      return normal(pointer, words);
    });
    const planner = createWasmCastleRibbonPlanner(wasm.exports);
    const original = planner.layout([candidate()], []);
    planner.layout([candidate()], []);
    expect(wasm.alloc).toHaveBeenCalledTimes(1);
    planner.layout(
      Array.from({ length: 256 }, (_, i) => candidate(String(i))),
      [],
    );
    expect(wasm.alloc).toHaveBeenCalledTimes(2);
    expect(wasm.free.mock.calls[0]).toEqual([8, 40]);
    planner.dispose();
    planner.dispose();
    expect(wasm.free).toHaveBeenCalledTimes(2);
    expect(wasm.free.mock.calls[1]?.[1]).toBe(wasm.alloc.mock.calls[1]?.[0]);
    expect(original.get('a')?.leader.start).toEqual({ x: 6, y: 7 });
    expect(() => planner.layout([], [])).toThrow('disposed');
  });

  it('validates original limits and error order before allocation', () => {
    const wasm = backend();
    const planner = createWasmCastleRibbonPlanner(wasm.exports);
    expect(() =>
      planner.layout(
        Array.from({ length: 257 }, () => candidate()),
        [rect(-1)],
      ),
    ).toThrow('count limit');
    expect(() =>
      planner.layout(
        [{ ...candidate(), anchor: { x: Infinity, y: 0 } }],
        [{ ...rect(1), width: 0 }],
      ),
    ).toThrow('rectangle');
    expect(() =>
      planner.layout(
        [
          {
            ...candidate(),
            leaderObstacles: Array.from({ length: 1025 }, () => rect(1)),
          },
        ],
        [],
      ),
    ).toThrow('leader count');
    expect(() => planner.layout([candidate(), candidate()], [])).toThrow('candidate');
    expect(wasm.alloc).not.toHaveBeenCalled();
    planner.dispose();
  });

  it('rejects ABI, allocation, status and every output protocol error without callback', () => {
    expect(() => createWasmCastleRibbonPlanner({})).toThrow('ABI');
    expect(() =>
      createWasmCastleRibbonPlanner({
        ...backend().exports,
        castle_ribbon_abi_version: () => 2,
      }),
    ).toThrow('ABI');
    const wasm = backend();
    const planner = createWasmCastleRibbonPlanner(wasm.exports);
    const onWork = vi.fn();
    const normal = wasm.solve.getMockImplementation()!;
    for (const status of [-2, -1, 0, 0.5, NaN]) {
      wasm.solve.mockReturnValueOnce(status);
      expect(() => planner.layout([candidate()], [], [], { onWork })).toThrow();
    }
    for (const [column, bad] of [
      [6, NaN],
      [8, 2],
      [9, 0],
      [9, 1.5],
      [10, -1],
      [15, 2],
    ]) {
      wasm.solve.mockImplementationOnce((pointer, words) => {
        const status = normal(pointer, words);
        new Float64Array(wasm.memory.buffer, pointer, words)[24 + column!] = bad!;
        return status;
      });
      expect(() => planner.layout([candidate()], [], [], { onWork })).toThrow();
    }
    for (const work of [-1, 1000001, 0.5, Infinity]) {
      wasm.solve.mockImplementationOnce((pointer, words) => {
        const status = normal(pointer, words);
        new Float64Array(wasm.memory.buffer, pointer, words)[6] = work;
        return status;
      });
      expect(() => planner.layout([candidate()], [], [], { onWork })).toThrow('work');
    }
    expect(onWork).not.toHaveBeenCalled();
    planner.dispose();
    const invalid = backend();
    invalid.alloc.mockReturnValue(3);
    expect(() => createWasmCastleRibbonPlanner(invalid.exports).layout([], [])).toThrow('arena');
  });

  it('supports empty layouts and independent arena owners', () => {
    const wasm = backend();
    const first = createWasmCastleRibbonPlanner(wasm.exports);
    const second = createWasmCastleRibbonPlanner(wasm.exports);
    const onWork = vi.fn();
    expect(first.layout([], [], [], { onWork }).size).toBe(0);
    expect(onWork.mock.calls).toEqual([[7]]);
    second.layout([candidate()], []);
    first.dispose();
    expect(() => second.layout([candidate()], [])).not.toThrow();
    second.dispose();
  });
});
