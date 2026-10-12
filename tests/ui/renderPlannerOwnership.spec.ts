import { expect, it, vi } from 'vitest';
import { createWasmGeographicScorer } from '../../src/ui/map/wasmGeographicScorer';
import { realRenderWasmExports } from '../helpers/realRenderWasm';
import type { GeographicScorerInput } from '../../src/ui/map/wasmGeographicScorer';

const geographic = (): GeographicScorerInput => ({
  rect: { x: 0, y: 0, width: 20, height: 10 },
  baselinePrimary: 0,
  offsets: [{ x: 0, y: 0 }],
  primary: [],
  hard: [],
  hardBaseline: [],
  reserved: [],
});
const castles = () => [
  {
    id: 'castle',
    baseline: { x: 0, y: 0, width: 20, height: 10 },
    anchor: { x: 10, y: -10 },
  },
];

it('owns two reusable arenas in one actual module and refreshes both after memory growth', () => {
  const exports = realRenderWasmExports();
  const pointers: number[] = [];
  const rawAllocate = exports.engine_alloc as (words: number) => number;
  const allocate = vi.fn((words: number) => {
    const pointer = rawAllocate(words);
    pointers.push(pointer);
    return pointer;
  });
  const free = vi.fn(exports.engine_free as (pointer: number, words: number) => void);
  const owner = createWasmGeographicScorer({
    ...exports,
    engine_alloc: allocate,
    engine_free: free,
  });
  owner.prepareCastlePlanner();
  owner.prepareCastlePlanner();
  expect(allocate).not.toHaveBeenCalled();
  const input = geographic();
  expect(owner.score(input)).toBe(input.offsets[0]);
  const before = owner.layoutCastleRibbons(castles(), []);
  expect(allocate).toHaveBeenCalledTimes(2);
  const memory = exports.memory as WebAssembly.Memory;
  const oldBuffer = memory.buffer;
  memory.grow(1);
  expect(memory.buffer).not.toBe(oldBuffer);
  expect(owner.layoutCastleRibbons(castles(), [])).toEqual(before);
  expect(owner.score(input)).toBe(input.offsets[0]);
  expect(allocate).toHaveBeenCalledTimes(2);
  const allocations = allocate.mock.calls.map(([words], index) => [pointers[index]!, words]);
  owner.dispose();
  owner.dispose();
  expect(free).toHaveBeenCalledTimes(2);
  expect(free.mock.calls).toEqual([...allocations].reverse());
  expect(() => owner.prepareCastlePlanner()).toThrow('disposed');
  expect(() => owner.layoutCastleRibbons(castles(), [])).toThrow('disposed');
  expect(() => owner.score(input)).toThrow('disposed');
});

it('disposal of one actual module owner leaves the other planner and scorer independent', () => {
  const a = createWasmGeographicScorer(realRenderWasmExports());
  const b = createWasmGeographicScorer(realRenderWasmExports());
  a.prepareCastlePlanner();
  b.prepareCastlePlanner();
  const expected = b.layoutCastleRibbons(castles(), []);
  a.dispose();
  expect(b.layoutCastleRibbons(castles(), [])).toEqual(expected);
  const input = geographic();
  expect(b.score(input)).toBe(input.offsets[0]);
  b.dispose();
});

it('rejects an absent castle feature without silently using the JavaScript planner', () => {
  const exports = { ...realRenderWasmExports() };
  delete exports.castle_ribbon_solve;
  const owner = createWasmGeographicScorer(exports);
  expect(owner.isReady()).toBe(true);
  expect(() => owner.prepareCastlePlanner()).toThrow('Unsupported castle ribbon planner ABI');
  expect(() => owner.layoutCastleRibbons(castles(), [])).toThrow(
    'Unsupported castle ribbon planner ABI',
  );
  owner.dispose();
});
