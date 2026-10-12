import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWasmGeographicScorer } from '../../src/ui/map/wasmGeographicScorer';
import {
  createGeographicLabelLayouter,
  type GeographicLabelCandidate,
} from '../../src/ui/map/geographicLabelLayout';
import { geographicPreparationSignature } from '../../src/ui/map/wasmGeographicPreparation';
import { createGeographicPreparationOracle } from '../helpers/geographicPreparationOracle';
import { realRenderWasmExports } from '../helpers/realRenderWasm';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});
const rectangle = (x = 0, y = 0, width = 20, height = 10): PlateRect => ({ x, y, width, height });
function owner(budget?: number) {
  const exports = realRenderWasmExports();
  const prepare = vi.fn(exports.geo_prepare as (...args: number[]) => number);
  const preparedScore = vi.fn(exports.geo_score_prepared as (...args: number[]) => number);
  const legacyScore = vi.fn(exports.geo_score as (...args: number[]) => number);
  const allocate = vi.fn(exports.engine_alloc as (words: number) => number);
  const free = vi.fn(exports.engine_free as (pointer: number, words: number) => void);
  const scorer = createWasmGeographicScorer(
    {
      ...exports,
      geo_prepare: prepare,
      geo_score_prepared: preparedScore,
      geo_score: legacyScore,
      engine_alloc: allocate,
      engine_free: free,
    },
    budget === undefined ? undefined : { capacityBudgetWords: budget },
  );
  disposers.push(() => scorer.dispose());
  const preparation = scorer.getPreparation();
  const capture = vi.spyOn(preparation, 'prepare');
  return {
    exports,
    scorer,
    preparation,
    capture,
    prepare,
    preparedScore,
    legacyScore,
    allocate,
    free,
    layout: createGeographicLabelLayouter(scorer),
  };
}
function comparison(budget: number | undefined) {
  const actual = owner(budget),
    oracle = createGeographicPreparationOracle();
  return (
    labels: GeographicLabelCandidate[],
    obstacles: PlateRect[],
    hard: PlateRect[],
    context: string,
  ) => {
    const expected = oracle.layout(labels, obstacles, hard);
    const beforePrepared = actual.preparedScore.mock.calls.length,
      beforeLegacy = actual.legacyScore.mock.calls.length,
      beforePrep = actual.prepare.mock.calls.length;
    actual.capture.mockClear();
    const placements = actual.layout.layout(labels, obstacles, hard);
    expect([...placements], context + '.placements').toEqual([...expected.placements]);
    expect(actual.layout.getDiagnostics(), context + '.cache').toEqual(expected.diagnostics);
    const misses = expected.steps.filter((step) => step.scored).length;
    const bulk = actual.preparation.getDiagnostics().mode === 'wasm';
    expect(actual.preparedScore.mock.calls.length - beforePrepared).toBe(bulk ? misses : 0);
    expect(actual.legacyScore.mock.calls.length - beforeLegacy).toBe(bulk ? 0 : misses);
    expect(actual.prepare.mock.calls.length - beforePrep).toBe(bulk ? expected.steps.length : 0);
    if (bulk)
      expected.steps.forEach((step, i) => {
        const result = actual.capture.mock.results[i]!;
        if (result.type !== 'return') throw new Error('Preparation threw unexpectedly');
        const prepared = result.value;
        expect(
          geographicPreparationSignature(step.rect, step.roadLine, step.roadCapsules, prepared),
          context + '.' + step.id + '.signature',
        ).toBe(step.signature);
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
          expect(prepared[field], context + '.' + step.id + '.' + field).toEqual(step[field]);
      });
  };
}
describe('formal geographic layouter actual preparation routing', () => {
  it.each([
    { budget: undefined, batch: 0 },
    { budget: undefined, batch: 1 },
    { budget: 0, batch: 0 },
    { budget: 0, batch: 1 },
  ])('matches 80 seeds and cache transitions %#', ({ budget, batch }) => {
    const run = comparison(budget);
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
  });
  it.each([undefined, 0])(
    'preserves metadata and absent/null/empty/oversize roads in route %s',
    (budget) => {
      const run = comparison(budget);
      const rect = { tag: 'first', height: 10, x: -0, width: 20, y: 0, extra: { label: 'paint' } };
      for (const capsules of [
        undefined,
        null,
        [],
        [{ a: { x: -1e308, y: 1e308 }, b: { x: 1e308, y: 1e308 }, radius: 2 }],
        Array.from({ length: 256 }, () => ({ a: { x: NaN, y: 0 }, b: { x: 0, y: 0 }, radius: -1 })),
      ]) {
        const labels: GeographicLabelCandidate[] = [
          {
            id: 'metadata',
            kind: 'road',
            rect,
            ...(capsules === undefined ? {} : { roadCapsules: capsules }),
          },
        ];
        run(labels, [{ ...rect }], [{ ...rect }], 'metadata');
        run(
          structuredClone(labels),
          structuredClone([{ ...rect }]),
          structuredClone([{ ...rect }]),
          'metadataClone',
        );
      }
    },
  );
  it('routes actual 8192 and 32768 row scenes with identical final placements under the default policy', () => {
    for (const count of [8192, 32768]) {
      const actual = owner(),
        oracle = createGeographicPreparationOracle();
      const rows = Array.from({ length: count }, (_, i) => rectangle(1e6 + i * 100, 1e6, 1, 1));
      const labels: GeographicLabelCandidate[] = Array.from({ length: 3 }, (_, i) => ({
        id: String(i),
        kind: 'district',
        rect: rectangle(i * 200),
      }));
      expect([...actual.layout.layout(labels, rows)]).toEqual([
        ...oracle.layout(labels, rows).placements,
      ]);
      expect(actual.preparation.getDiagnostics().mode).toBe(count === 8192 ? 'wasm' : 'capacity');
      expect(actual.prepare.mock.calls.length).toBe(count === 8192 ? 3 : 0);
      expect(actual.preparedScore.mock.calls.length).toBe(count === 8192 ? 3 : 0);
      expect(actual.legacyScore.mock.calls.length).toBe(count === 8192 ? 0 : 3);
    }
  });
  it('keeps geo, castle and preparation arenas independent across growth and owner disposal', () => {
    const a = owner(),
      b = owner();
    const labels: GeographicLabelCandidate[] = [
      { id: 'label', kind: 'district', rect: rectangle() },
    ];
    const castles = [{ id: 'castle', baseline: rectangle(), anchor: { x: 10, y: -10 } }];
    const legacy = {
      rect: rectangle(),
      baselinePrimary: 0,
      offsets: [{ x: 0, y: 0 }],
      primary: [],
      hard: [],
      hardBaseline: [],
      reserved: [],
    };
    const geo = a.layout.layout(labels, []),
      castle = a.scorer.layoutCastleRibbons(castles, []);
    expect(a.scorer.score(legacy)).toBe(legacy.offsets[0]);
    const prep = a.preparation.prepare(rectangle());
    const preparedBeforeGrowth = a.preparation.scorePrepared(prep, undefined, undefined);
    const before = a.allocate.mock.calls.length;
    (a.exports.memory as WebAssembly.Memory).grow(1);
    expect(a.preparation.scorePrepared(prep, undefined, undefined)).toEqual(preparedBeforeGrowth);
    expect(a.layout.layout(labels, [])).toEqual(geo);
    expect(a.scorer.layoutCastleRibbons(castles, [])).toEqual(castle);
    expect(a.scorer.score(legacy)).toBe(legacy.offsets[0]);
    expect(a.allocate.mock.calls.length).toBe(before);
    b.layout.layout(labels, []);
    a.scorer.dispose();
    a.scorer.dispose();
    const allocations = a.allocate.mock.results.map((result, i) => [
      result.value >>> 0,
      a.allocate.mock.calls[i]![0],
    ]);
    expect(a.free.mock.calls.length).toBe(allocations.length);
    expect(
      a.free.mock.calls
        .map(([pointer, words]) => [pointer >>> 0, words])
        .sort((x, y) => x[0]! - y[0]!),
    ).toEqual(allocations.sort((x, y) => x[0]! - y[0]!));
    expect(() => a.preparation.prepare(rectangle())).toThrow('disposed');
    expect(b.layout.layout(labels, [])).toEqual(geo);
    expect(b.scorer.layoutCastleRibbons(castles, [])).toEqual(castle);
  });
});
