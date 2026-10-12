import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Exports {
  memory: WebAssembly.Memory;
  engine_alloc(words: number): number;
  engine_free(pointer: number, words: number): void;
  geographic_preparation_abi_version(): number;
  geo_prepare(frame: number, words: number, output: number, capacity: number): number;
  geo_score_prepared(
    frame: number,
    words: number,
    output: number,
    outputWords: number,
    road: number,
    roadWords: number,
  ): number;
}

async function fixture() {
  const module = await WebAssembly.instantiate(readFileSync('public/wasm/tenka_engine.wasm'), {
    env: { path_node_cost: () => 0 },
  });
  const exports = module.instance.exports as unknown as Exports;
  const arenas: { pointer: number; words: number }[] = [];
  const allocate = (words: number) => {
    const arena = { pointer: exports.engine_alloc(words) >>> 0, words };
    arenas.push(arena);
    return arena;
  };
  const view = (arena: (typeof arenas)[number]) =>
    new Float64Array(exports.memory.buffer, arena.pointer, arena.words);
  const frame = allocate(16);
  const output = allocate(62);
  const road = allocate(8);
  view(frame).set([1, 2 ** 40, 0, 0, 0, 0, -0, 0, 20, 10, 2 ** 40 + 1, 0, 0, 0, 0, 0]);
  view(output).fill(73);
  view(road).set([1, 0, 0, 0, 0, 0, 0, 0]);
  const prepare = () =>
    exports.geo_prepare(frame.pointer, frame.words, output.pointer, output.words);
  const score = (words: number) =>
    exports.geo_score_prepared(
      frame.pointer,
      frame.words,
      output.pointer,
      words,
      road.pointer,
      road.words,
    );
  return {
    exports,
    frame,
    output,
    road,
    view,
    prepare,
    score,
    dispose: () => {
      for (const { pointer, words } of arenas.reverse()) exports.engine_free(pointer, words);
    },
  };
}

describe('actual compiled geographic preparation ABI', () => {
  it('accepts safe tokens above wasm32 usize and owns bit-exact geometry', async () => {
    const f = await fixture();
    try {
      expect(f.exports.geographic_preparation_abi_version()).toBe(1);
      const frame = f.view(f.frame).slice();
      const words = f.prepare();
      expect(words).toBe(32);
      expect(f.view(f.output)[1]).toBe(2 ** 40);
      expect(f.view(f.output)[11]).toBe(2 ** 40 + 1);
      expect(Object.is(f.view(f.output)[12], -0)).toBe(true);
      expect(f.score(words)).toBe(0);
      expect([...f.view(f.output).slice(8, 11)]).toEqual([0, 0, 0]);
      expect(f.view(f.frame)).toEqual(frame);
      f.exports.memory.grow(1);
      expect(f.score(words)).toBe(0);
    } finally {
      f.dispose();
    }
  });

  it('rejects overlapping, unaligned, and out-of-memory regions before writing', async () => {
    const f = await fixture();
    try {
      const frame = f.view(f.frame).slice();
      const output = f.view(f.output).slice();
      expect(f.exports.geo_prepare(f.frame.pointer, 16, f.frame.pointer, 16)).toBe(-2);
      expect(f.exports.geo_prepare(f.frame.pointer + 1, 16, f.output.pointer, 62)).toBe(-2);
      expect(
        f.exports.geo_prepare(f.exports.memory.buffer.byteLength - 8, 16, f.output.pointer, 62),
      ).toBe(-2);
      expect(f.exports.geo_prepare(f.frame.pointer, 16, f.output.pointer, 16)).toBe(-2);
      expect(f.view(f.frame)).toEqual(frame);
      expect(f.view(f.output)).toEqual(output);
    } finally {
      f.dispose();
    }
  });

  it.each([1, 10, 6])('rejects stale frame field %i without modifying prep', async (field) => {
    const f = await fixture();
    try {
      const words = f.prepare();
      const output = f.view(f.output).slice();
      f.view(f.frame)[field] = f.view(f.frame)[field]! + 1;
      expect(f.score(words)).toBe(-2);
      expect(f.view(f.output)).toEqual(output);
    } finally {
      f.dispose();
    }
  });

  it('rejects overlapping road and malformed road lengths atomically', async () => {
    const f = await fixture();
    try {
      const words = f.prepare();
      const output = f.view(f.output).slice();
      expect(
        f.exports.geo_score_prepared(
          f.frame.pointer,
          16,
          f.output.pointer,
          words,
          f.output.pointer,
          8,
        ),
      ).toBe(-2);
      f.view(f.road)[6] = 1;
      expect(f.score(words)).toBe(-2);
      expect(f.view(f.output)).toEqual(output);
    } finally {
      f.dispose();
    }
  });
});
