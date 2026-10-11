import { afterEach, describe, expect, it } from 'vitest';
import {
  createGeographicLabelLayouter,
  layoutGeographicLabels,
  type GeographicLabelCandidate,
} from '../../src/ui/map/geographicLabelLayout';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';
import { roadLabelClearsCapsules } from '../../src/ui/map/roadLabelCapsules';
import { isRustPathfindingReady } from '../../src/core/acceleration/pathfindingKernel';
import {
  createGeographicLabelLayouter as createReference,
  layoutGeographicLabels as referenceLayout,
} from '../helpers/geographicWasmReference';
import { realGeographicWasm } from '../helpers/realGeographicWasm';

const owners: Awaited<ReturnType<typeof realGeographicWasm>>[] = [];
async function owner() {
  const value = await realGeographicWasm();
  owners.push(value);
  return value;
}
afterEach(() => {
  for (const value of owners.splice(0)) value.scorer.dispose();
});
function exact(actual: Map<string, { x: number; y: number }>, expected: typeof actual) {
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  for (const [id, offset] of expected) {
    const got = actual.get(id)!;
    expect(Object.is(got.x, offset.x), `${id}: exact x including signed zero`).toBe(true);
    expect(Object.is(got.y, offset.y), `${id}: exact y including signed zero`).toBe(true);
  }
  expect(JSON.stringify([...actual])).toBe(JSON.stringify([...expected]));
}
const candidate = (id = 'label'): GeographicLabelCandidate => ({
  id,
  kind: 'district',
  rect: { x: 0, y: 0, width: 20, height: 10 },
});

describe('compiled Rust geographic scorer against frozen 239f300 layout', () => {
  it('matches ordered offsets and serialized bytes across 320 deterministic scenes', async () => {
    const { scorer, getScoreCalls } = await owner();
    const cached = createGeographicLabelLayouter(scorer);
    let seed = 0x61e0a3;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let scene = 0; scene < 320; scene++) {
      const dense = scene % 2 === 0;
      const labels = Array.from({ length: 4 }, (_, i): GeographicLabelCandidate => ({
        id: `label.${i}`,
        kind: i === 0 ? 'province' : i % 2 ? 'road' : 'district',
        rect: {
          x: random() * (dense ? 90 : 900) - 100,
          y: random() * (dense ? 60 : 600) - 100,
          width: random() * 90,
          height: random() * 30,
        },
        ...(i % 2
          ? {
              roadLine: { normal: { x: random() - 0.5, y: random() - 0.5 }, slack: random() * 30 },
              roadCapsules: [{ a: { x: -50, y: -50 }, b: { x: 100, y: 90 }, radius: 2 }],
            }
          : {}),
      }));
      const blockers: PlateRect[] = Array.from({ length: 35 }, () => ({
        x: random() * (dense ? 150 : 1400) - 130,
        y: random() * (dense ? 120 : 900) - 130,
        width: random() * 100,
        height: random() * 40,
      }));
      const hard = blockers.filter((_, i) => i % 4 === 0);
      const expected = referenceLayout(labels, blockers, hard);
      exact(layoutGeographicLabels(labels, blockers, hard, undefined, scorer), expected);
      exact(cached.layout(labels, blockers, hard), expected);
      exact(
        cached.layout(structuredClone(labels), structuredClone(blockers), structuredClone(hard)),
        expected,
      );
    }
    expect(getScoreCalls()).toBeGreaterThan(1000);
  });

  it('preserves cache hits, input invalidation, ID eviction and core backend isolation', async () => {
    const beforeCore = isRustPathfindingReady();
    const { scorer, getScoreCalls } = await owner();
    const cached = createGeographicLabelLayouter(scorer),
      reference = createReference();
    const labels = [candidate()];
    const blockers = [{ x: 0, y: 0, width: 20, height: 10 }];
    const check = () => {
      exact(
        cached.layout(labels, blockers, blockers),
        reference.layout(labels, blockers, blockers),
      );
      expect(cached.getDiagnostics()).toEqual(reference.getDiagnostics());
    };
    check();
    const firstCalls = getScoreCalls();
    check();
    expect(getScoreCalls()).toBe(firstCalls);
    labels[0]!.rect.width++;
    check();
    blockers[0]!.x++;
    check();
    labels[0]!.roadLine = { normal: { x: -0, y: -1 }, slack: 0 };
    check();
    labels[0]!.roadCapsules = null;
    check();
    labels[0]!.roadCapsules = [];
    check();
    delete labels[0]!.roadCapsules;
    check();
    cached.layout([], blockers);
    reference.layout([], blockers);
    expect(cached.getDiagnostics()).toEqual(reference.getDiagnostics());
    expect(cached.getDiagnostics().entries).toBe(0);
    expect(isRustPathfindingReady()).toBe(beforeCore);
  });

  it('matches radius, padded collision and capsule epsilon boundaries with extreme finite coordinates', async () => {
    const { scorer } = await owner();
    const cases: { labels: GeographicLabelCandidate[]; blockers: PlateRect[] }[] = [];
    for (const epsilon of [-1e-10, 0, 1e-10]) {
      for (const edge of [-52, -48, -44, 44, 48, 52]) {
        cases.push({
          labels: [candidate()],
          blockers: [
            { x: 20 + edge + epsilon, y: 0, width: 0, height: 10 },
            { x: 0, y: 10 + edge + epsilon, width: 20, height: 0 },
          ],
        });
      }
    }
    for (const epsilon of [-2e-8, -1e-8, -1e-10, 0, 1e-10, 1e-8, 2e-8]) {
      for (const radius of [0, 2]) {
        const label = candidate();
        label.kind = 'road';
        label.roadLine = { normal: { x: -0, y: -1 }, slack: 1e-8 + epsilon };
        label.roadCapsules = [
          {
            a: { x: -100, y: 10 + radius + epsilon },
            b: { x: 100, y: 10 + radius + epsilon },
            radius,
          },
        ];
        cases.push({ labels: [label], blockers: [] });
      }
    }
    for (const value of [-1e9, -0, 0, 1e9]) {
      for (const width of [0, 4096]) {
        const label = candidate();
        label.rect = { x: value, y: value, width, height: width };
        cases.push({ labels: [label], blockers: [{ ...label.rect }] });
      }
    }
    const pointRoad = candidate();
    pointRoad.kind = 'road';
    pointRoad.roadCapsules = [{ a: { x: 10, y: 5 }, b: { x: 10, y: 5 }, radius: 0 }];
    cases.push({ labels: [pointRoad], blockers: [] });
    for (const capsules of [
      undefined,
      null,
      [],
      [{ a: { x: NaN, y: 0 }, b: { x: 100, y: 0 }, radius: 2 }],
      [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, radius: -1 }],
      Array.from({ length: 256 }, () => ({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, radius: 0 })),
    ]) {
      const label = candidate();
      label.kind = 'road';
      if (capsules !== undefined) label.roadCapsules = capsules;
      cases.push({ labels: [label], blockers: [] });
    }
    for (const invalid of [NaN, Infinity]) {
      const label = candidate();
      label.roadLine = { normal: { x: invalid, y: 1 }, slack: invalid };
      cases.push({ labels: [label], blockers: [] });
    }
    for (const { labels, blockers } of cases)
      exact(
        layoutGeographicLabels(labels, blockers, blockers, undefined, scorer),
        referenceLayout(labels, blockers, blockers),
      );
  });

  it('keeps original caller offsets including signed zero and independent instance ownership', async () => {
    const a = await owner(),
      b = await owner();
    expect(a.instance.exports.memory).not.toBe(b.instance.exports.memory);
    const offset = { x: -0, y: -0 };
    const input = {
      rect: candidate().rect,
      baselinePrimary: 0,
      offsets: [offset],
      primary: [],
      hard: [],
      hardBaseline: [],
      reserved: [],
    };
    expect(a.scorer.score(input)).toBe(offset);
    expect(Object.is(a.scorer.score(input)!.x, -0)).toBe(true);
    expect(b.scorer.score(input)).toBe(offset);
    a.scorer.dispose();
    a.scorer.dispose();
    expect(() => a.scorer.score(input)).toThrow(/disposed/);
    expect(b.scorer.score(input)).toBe(offset);
    expect(b.scorer.isReady()).toBe(true);
  });

  it('matches finite extreme layout/cache inputs and overflowing capsule intermediates', async () => {
    const { scorer, getScoreCalls } = await owner();
    const cached = createGeographicLabelLayouter(scorer),
      reference = createReference();
    let validScenes = 0;
    for (const magnitude of [1e16, 1e100, 1e308]) {
      for (const sign of [-1, 1]) {
        for (const size of [0, magnitude]) {
          const rect = { x: sign * magnitude, y: sign * magnitude, width: size, height: size };
          // The existing layout contract also requires finite padded endpoint sums.
          if (![rect.x + rect.width + 4, rect.y + rect.height + 4].every(Number.isFinite)) continue;
          validScenes++;
          const labels: GeographicLabelCandidate[] = [
            { id: 'extreme.province', kind: 'province', rect },
            {
              id: 'extreme.road',
              kind: 'road',
              rect: { ...rect },
              roadCapsules: [
                {
                  a: { x: -magnitude, y: -magnitude },
                  b: { x: magnitude, y: magnitude },
                  radius: 2,
                },
              ],
            },
          ];
          const blockers = [
            { ...rect },
            { x: -sign * magnitude, y: -sign * magnitude, width: 0, height: 0 },
          ];
          const expected = referenceLayout(labels, blockers, blockers);
          exact(layoutGeographicLabels(labels, blockers, blockers, undefined, scorer), expected);
          exact(
            cached.layout(labels, blockers, blockers),
            reference.layout(labels, blockers, blockers),
          );
          const calls = getScoreCalls();
          exact(
            cached.layout(
              structuredClone(labels),
              structuredClone(blockers),
              structuredClone(blockers),
            ),
            reference.layout(
              structuredClone(labels),
              structuredClone(blockers),
              structuredClone(blockers),
            ),
          );
          expect(getScoreCalls()).toBe(calls);
          expect(cached.getDiagnostics()).toEqual(reference.getDiagnostics());
        }
      }
    }
    expect(validScenes).toBe(11);
    const offset = { x: 8, y: 0 };
    const probes = [
      {
        rect: { x: 1e308, y: 1e308, width: 0, height: 0 },
        capsules: [{ a: { x: -1e308, y: -1e308 }, b: { x: 1e308, y: 1e308 }, radius: 2 }],
        observedEligible: false,
      },
      {
        rect: { x: 0, y: 0, width: 0, height: 0 },
        capsules: [{ a: { x: -1e308, y: 1e308 }, b: { x: 1e308, y: 1e308 }, radius: 2 }],
        observedEligible: false,
      },
      {
        rect: { x: 0, y: 0, width: 0, height: 0 },
        capsules: [{ a: { x: -100, y: 100 }, b: { x: 100, y: 100 }, radius: 2 }],
        observedEligible: true,
      },
    ];
    for (const { rect, capsules, observedEligible } of probes) {
      const moved = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
      // Public JS observations govern both overflow probes and the finite positive control.
      const eligible = roadLabelClearsCapsules(moved, capsules);
      expect(eligible).toBe(observedEligible);
      const actual = scorer.score({
        rect,
        offsets: [offset],
        baselinePrimary: 0,
        primary: [],
        hard: [],
        hardBaseline: [],
        reserved: [],
        roadCapsules: capsules,
      });
      expect(actual).toBe(eligible ? offset : undefined);
    }
  });

  it('preserves layout validation before any compiled score call', async () => {
    const { scorer, getScoreCalls } = await owner();
    for (const badRect of [
      { x: NaN },
      { x: Infinity },
      { x: Number.MAX_VALUE, width: Number.MAX_VALUE },
      { width: -1 },
      { height: -1 },
    ]) {
      const label = candidate();
      Object.assign(label.rect, badRect);
      expect(() => referenceLayout([label], [])).toThrow();
      expect(() => layoutGeographicLabels([label], [], [], undefined, scorer)).toThrow();
    }
    for (const labels of [
      [candidate(), candidate()],
      [{ ...candidate(), kind: 'invalid' } as unknown as GeographicLabelCandidate],
    ]) {
      expect(() => referenceLayout(labels, [])).toThrow();
      expect(() => layoutGeographicLabels(labels, [], [], undefined, scorer)).toThrow();
    }
    expect(getScoreCalls()).toBe(0);
  });
});
