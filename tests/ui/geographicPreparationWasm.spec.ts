import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWasmGeographicPreparation,
  geographicPreparationSignature,
} from '../../src/ui/map/wasmGeographicPreparation';
import {
  createWasmGeographicScorer,
  geographicScorerImports,
} from '../../src/ui/map/wasmGeographicScorer';
import {
  createGeographicLabelLayouter,
  type GeographicLabelCandidate,
} from '../../src/ui/map/geographicLabelLayout';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';
import { createGeographicPreparationOracle } from '../helpers/geographicPreparationOracle';

const module = new WebAssembly.Module(
  new Uint8Array(readFileSync('public/wasm/tenka_engine.wasm')),
);
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});
function owner(budget?: number) {
  const { exports } = new WebAssembly.Instance(module, geographicScorerImports());
  const allocations: { pointer: number; words: number }[] = [],
    frees: { pointer: number; words: number }[] = [];
  const allocate = exports.engine_alloc as (words: number) => number;
  const free = exports.engine_free as (pointer: number, words: number) => void;
  const prepare = exports.geo_prepare as (f: number, fw: number, p: number, pw: number) => number;
  const score = exports.geo_score_prepared as (
    f: number,
    fw: number,
    p: number,
    pw: number,
    r: number,
    rw: number,
  ) => number;
  let prepCalls = 0,
    scoreCalls = 0,
    winner = -2;
  const wrapped = {
    ...exports,
    engine_alloc: (words: number) => {
      const pointer = allocate(words);
      allocations.push({ pointer, words });
      return pointer;
    },
    engine_free: (pointer: number, words: number) => {
      frees.push({ pointer, words });
      free(pointer, words);
    },
    geo_prepare: (f: number, fw: number, p: number, pw: number) => {
      prepCalls++;
      return prepare(f, fw, p, pw);
    },
    geo_score_prepared: (f: number, fw: number, p: number, pw: number, r: number, rw: number) => {
      scoreCalls++;
      winner = score(f, fw, p, pw, r, rw);
      return winner;
    },
  };
  const service = createWasmGeographicPreparation(
    wrapped,
    budget === undefined ? {} : { capacityBudgetWords: budget },
  );
  disposers.push(() => service.dispose());
  return {
    service,
    exports,
    wrapped,
    allocations,
    frees,
    getCounts: () => ({ prepCalls, scoreCalls, winner }),
  };
}
function exact(actual: unknown, expected: unknown, path = 'value'): void {
  if (typeof expected === 'number') {
    if (!Object.is(actual, expected))
      throw new Error(`${path}: numeric mismatch ${String(actual)} / ${String(expected)}`);
    return;
  }
  if (expected === null || typeof expected !== 'object') {
    if (actual !== expected) throw new Error(`${path}: scalar mismatch`);
    return;
  }
  if (actual === null || typeof actual !== 'object') throw new Error(`${path}: missing object`);
  const keys = Object.keys(expected);
  if (keys.join('\0') !== Object.keys(actual).join('\0'))
    throw new Error(`${path}: keys/order mismatch`);
  for (const key of keys)
    exact(
      (actual as Record<string, unknown>)[key],
      (expected as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
}
const rectangle = (x = 0, y = 0, width = 20, height = 10): PlateRect => ({ x, y, width, height });
function comparison() {
  const actual = owner(),
    oracle = createGeographicPreparationOracle();
  const cache = new Map<string, { signature: string; offset: { x: number; y: number } }>();
  let computed = 0,
    reused = 0;
  return (
    labels: GeographicLabelCandidate[],
    obstacles: PlateRect[],
    hard: PlateRect[],
    context: string,
  ) => {
    const expected = oracle.layout(labels, obstacles, hard);
    const ids = new Set(labels.map((label) => label.id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    const first = expected.steps[0];
    const primary =
      first?.primary ??
      obstacles
        .map((r) => ({ ...r }))
        .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
    const fixedHard =
      first?.hard ??
      hard
        .map((r) => ({ ...r }))
        .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
    expect(actual.service.beginFrame(primary, fixedHard, expected.steps.length).mode).toBe('wasm');
    const result = new Map<string, { x: number; y: number }>();
    for (const step of expected.steps) {
      const prepared = actual.service.prepare(step.rect);
      for (const field of [
        'firstOffsets',
        'xs',
        'ys',
        'nearPrimary',
        'nearHard',
        'nearReserved',
        'nearPrimaryIndices',
        'nearHardIndices',
        'nearReservedIndices',
      ] as const)
        exact(prepared[field], step[field], `${context}.${step.id}.${field}`);
      prepared.nearPrimary.forEach((r, i) =>
        expect(r).toBe(primary[prepared.nearPrimaryIndices[i]!]),
      );
      prepared.nearHard.forEach((r, i) => expect(r).toBe(fixedHard[prepared.nearHardIndices[i]!]));
      const signature = geographicPreparationSignature(
        step.rect,
        step.roadLine,
        step.roadCapsules,
        prepared,
      );
      expect(signature, `${context}.${step.id}.signature`).toBe(step.signature);
      const cached = cache.get(step.id);
      let offset: { x: number; y: number };
      const calls = actual.getCounts().scoreCalls;
      if (cached?.signature === signature) {
        reused++;
        offset = { ...cached.offset };
        expect(step.scored).toBe(false);
      } else {
        computed++;
        expect(step.scored).toBe(true);
        offset = actual.service.scorePrepared(prepared, step.roadLine, step.roadCapsules) ?? {
          x: 0,
          y: 0,
        };
        expect(actual.getCounts().winner, `${context}.${step.id}.winner`).toBe(step.winnerIndex);
        cache.set(step.id, { signature, offset: { ...offset } });
      }
      expect(actual.getCounts().scoreCalls - calls).toBe(step.scored ? 1 : 0);
      exact(offset, step.offset, `${context}.${step.id}.offset`);
      result.set(step.id, { ...offset });
      actual.service.appendPlaced({
        ...step.rect,
        x: step.rect.x + offset.x,
        y: step.rect.y + offset.y,
      });
    }
    exact([...result], [...expected.placements], `${context}.allPlacements`);
    exact({ computed, reused, entries: cache.size }, expected.diagnostics, `${context}.cache`);
  };
}

describe('actual Rust geographic preparation service', () => {
  it.each([0, 1, 2, 3])(
    'matches original preparation/signatures/cache and winners for 80-seed batch %i',
    (batch) => {
      const run = comparison();
      let state = 0x7e691755;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      for (let i = 0; i < batch * 80 * 87; i++) random();
      for (let seed = batch * 80; seed < (batch + 1) * 80; seed++) {
        const labels = Array.from({ length: 3 }, (_, i): GeographicLabelCandidate => ({
          id: ['😀', '\uE000', 'a'][i]!,
          kind: i === 0 ? 'province' : i === 1 ? 'road' : 'district',
          rect: rectangle(random() * 180 - 90, random() * 100 - 50, random() * 70, random() * 25),
          ...(i === 1
            ? {
                roadLine: {
                  normal: { x: random() - 0.5, y: random() - 0.5 },
                  slack: random() * 30,
                },
                roadCapsules: [{ a: { x: -60, y: -20 }, b: { x: 100, y: 60 }, radius: 2 }],
              }
            : {}),
        }));
        const blockers = Array.from({ length: 18 }, () =>
          rectangle(random() * 300 - 150, random() * 240 - 120, random() * 60, random() * 35),
        );
        const hard = blockers.filter((_, i) => i % 5 === 0).reverse();
        run(labels, blockers, hard, `seed${seed}.initial`);
        run(
          structuredClone(labels),
          structuredClone(blockers),
          structuredClone(hard),
          `seed${seed}.clone`,
        );
        const changed = structuredClone(blockers);
        changed[0]!.x += 1 / 8;
        run(labels, changed, hard, `seed${seed}.blocker`);
        labels[1]!.roadLine!.slack += 1 / 16;
        run(labels, changed, hard, `seed${seed}.road`);
        labels[0]!.rect.width += 1 / 32;
        run(labels, changed, hard, `seed${seed}.rect`);
        run(labels.slice(1), changed, hard, `seed${seed}.evict`);
      }
    },
  );

  it('preserves signed zero, distant axes, metadata/key order, capsule states and valid overflow', () => {
    const run = comparison();
    const rect = { tag: 'first', height: 10, x: -0, width: 20, y: 0, extra: { label: 'paint' } };
    const far = { tag: 'far', y: 1e6, width: 0, x: 24, height: 0 };
    for (const capsules of [
      undefined,
      null,
      [],
      [{ a: { x: -1e308, y: 1e308 }, b: { x: 1e308, y: 1e308 }, radius: 2 }],
      Array.from({ length: 256 }, () => ({ a: { x: NaN, y: 0 }, b: { x: 0, y: 0 }, radius: -1 })),
    ]) {
      const labels: GeographicLabelCandidate[] = [
        {
          id: 'meta',
          kind: 'road',
          rect,
          ...(capsules === undefined ? {} : { roadCapsules: capsules }),
        },
      ];
      run(labels, [{ ...rect }, far], [{ ...rect }], `caps${String(capsules?.length)}`);
      run(
        structuredClone(labels),
        structuredClone([{ ...rect }, far]),
        structuredClone([{ ...rect }]),
        'capsClone',
      );
    }
    let valid = 0;
    for (const magnitude of [1e16, 1e100, 1e308])
      for (const sign of [-1, 1])
        for (const size of [0, magnitude]) {
          const rect = rectangle(sign * magnitude, sign * magnitude, size, size);
          if (![rect.x + rect.width + 4, rect.y + rect.height + 4].every(Number.isFinite)) continue;
          valid++;
          run(
            [{ id: 'extreme', kind: 'district', rect }],
            [rect, rectangle(-sign * magnitude, -sign * magnitude, 0, 0)],
            [rect],
            'extreme',
          );
        }
    expect(valid).toBe(11);
    run([], [], [], 'empty');
  });

  it('chooses capacity before allocation and still requires every new feature ABI', () => {
    const value = owner(0);
    expect(value.service.beginFrame([rectangle()], [], 1).mode).toBe('capacity');
    expect(value.allocations).toEqual([]);
    const unrestricted = owner();
    // Legal scene capacity exceeds the new ABI's single-region isize bound.
    expect(unrestricted.service.beginFrame([], [], 0x04000000).mode).toBe('capacity');
    expect(unrestricted.allocations).toEqual([]);
    expect(unrestricted.service.beginFrame([], [], Number.MAX_SAFE_INTEGER).mode).toBe('capacity');
    expect(unrestricted.allocations).toEqual([]);
    expect(() => value.service.prepare(rectangle())).toThrow('WASM mode');
    const scorer = createWasmGeographicScorer(value.exports);
    disposers.push(() => scorer.dispose());
    const actual = createGeographicLabelLayouter(scorer),
      oracle = createGeographicPreparationOracle();
    exact(
      [...actual.layout([{ id: 'a', kind: 'district', rect: rectangle() }], [rectangle()])],
      [
        ...oracle.layout([{ id: 'a', kind: 'district', rect: rectangle() }], [rectangle()])
          .placements,
      ],
    );
    expect(value.getCounts().prepCalls).toBe(0);
    for (const name of ['geo_prepare', 'geo_score_prepared', 'geographic_preparation_abi_version'])
      expect(() =>
        createWasmGeographicPreparation(
          { ...value.exports, [name]: undefined },
          { capacityBudgetWords: 0 },
        ),
      ).toThrow('ABI');
    expect(() =>
      createWasmGeographicPreparation(value.exports, { capacityBudgetWords: -1 }),
    ).toThrow('budget');
  });

  it('rejects stale owner/token/K/revision/rect and survives growth without borrowed views', () => {
    const first = owner(),
      second = owner();
    first.service.beginFrame([], [], 2);
    second.service.beginFrame([], [], 1);
    const a = first.service.prepare(rectangle(-0));
    const b = second.service.prepare(rectangle());
    expect(() => first.service.scorePrepared(b, undefined, undefined)).toThrow('descriptor');
    (first.exports.memory as WebAssembly.Memory).grow(1);
    const offset = first.service.scorePrepared(a, undefined, undefined)!;
    offset.x = 999;
    exact(first.service.scorePrepared(a, undefined, undefined), { x: 0, y: 0 });
    const old = first.service.prepare(rectangle(1));
    expect(() => first.service.scorePrepared(a, undefined, undefined)).toThrow('descriptor');
    first.service.appendPlaced(rectangle());
    expect(() => first.service.scorePrepared(old, undefined, undefined)).toThrow('descriptor');
    const c = first.service.prepare(rectangle(-0));
    new Float64Array(
      (first.exports.memory as WebAssembly.Memory).buffer,
      first.allocations[0]!.pointer,
      first.allocations[0]!.words,
    )[6] = 0;
    expect(() => first.service.scorePrepared(c, undefined, undefined)).toThrow('rectangle');
    first.service.beginFrame([], [], 1);
    expect(() => first.service.scorePrepared(c, undefined, undefined)).toThrow('descriptor');
    const allocations = first.allocations.length;
    first.service.prepare(rectangle());
    first.service.scorePrepared(first.service.prepare(rectangle()), undefined, undefined);
    expect(first.allocations).toHaveLength(allocations);
    first.service.dispose();
    first.service.dispose();
    expect(first.frees).toHaveLength(first.allocations.length);
    expect(() => first.service.beginFrame([], [], 1)).toThrow('disposed');
  });

  it('records large valid bulk packing before any production budget choice', () => {
    const value = owner();
    const rows = [];
    for (const count of [8192, 32768]) {
      const primary = Array.from({ length: count }, (_, i) => rectangle(1e6 + i, 1e6, 0, 0));
      const begin = performance.now();
      const frame = value.service.beginFrame(primary, [], 1);
      const packedMs = performance.now() - begin;
      const prepared = value.service.prepare(rectangle());
      exact(value.service.scorePrepared(prepared, undefined, undefined), { x: 0, y: 0 });
      expect(prepared.nearReserved).toEqual([]);
      rows.push({
        count,
        packedMs,
        ...frame,
        allocatedWords: value.service.getDiagnostics().allocatedWords,
      });
    }
    console.log('DIAGNOSTIC_NODE_BULK_PACKING_NOT_NATIVE_FPS', JSON.stringify(rows));
  });
});
