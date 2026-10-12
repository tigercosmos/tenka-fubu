import { describe, expect, it, vi } from 'vitest';
import { layoutCastleRibbons as reference } from '../helpers/castleWasmReference';
import type {
  CastleRibbonCandidate,
  CastleRibbonPlacement,
  RibbonRect,
} from '../../src/ui/map/sceneParts/castleRibbonLayout';
import { realCastleOwner } from '../helpers/realCastleWasm';

function exact(actual: unknown, expected: unknown): void {
  if (typeof expected === 'number') {
    expect(Object.is(actual, expected)).toBe(true);
    return;
  }
  if (expected === null || typeof expected !== 'object') {
    expect(actual).toBe(expected);
    return;
  }
  expect(Object.keys(actual as object)).toEqual(Object.keys(expected));
  for (const key of Object.keys(expected)) {
    exact((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]);
  }
}
function compare(
  actual: Map<string, CastleRibbonPlacement>,
  expected: Map<string, CastleRibbonPlacement>,
) {
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  for (const [id, placement] of expected) exact(actual.get(id), placement);
  expect(JSON.stringify([...actual])).toBe(JSON.stringify([...expected]));
}
function freeze(value: object): void {
  Object.freeze(value);
  for (const child of Object.values(value))
    if (typeof child === 'object' && child !== null) freeze(child as object);
}
const rect = (x = 0, y = 0, width = 40, height = 20): RibbonRect => ({
  x,
  y,
  width,
  height,
});
const candidate = (id = 'a', x = 0, y = 0): CastleRibbonCandidate => ({
  id,
  baseline: rect(x, y),
  anchor: { x: x + 20, y: y - 10 },
});
function verify(
  candidates: CastleRibbonCandidate[],
  obstacles: RibbonRect[],
  hard: RibbonRect[] = [],
) {
  freeze(candidates);
  freeze(obstacles);
  freeze(hard);
  const referenceWork = vi.fn((work: number) => {
      void work;
    }),
    actualWork = vi.fn((work: number) => {
      void work;
    });
  const expected = reference(candidates, obstacles, hard, {
    onWork: referenceWork,
  });
  const owner = realCastleOwner();
  const actual = owner.planner.layout(candidates, obstacles, hard, {
    onWork: actualWork,
  });
  compare(actual, expected);
  expect(actualWork.mock.calls).toEqual(referenceWork.mock.calls);
  expect(actualWork).toHaveBeenCalledTimes(1);
  owner.planner.dispose();
  return { actual, work: actualWork.mock.calls[0]![0] };
}

describe('actual compiled castle planner against frozen 9e49 reference', () => {
  it('matches 320 seeded scenes including priority, hard/leader order and dense overlap', () => {
    let state = 0x19e49cc9;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const position = () => Math.round((random() - 0.5) * 240) + random() / 8;
    for (let seed = 0; seed < 320; seed++) {
      const blockers = Array.from({ length: 8 + (seed % 39) }, () =>
        rect(position(), position(), 1 + random() * 95, 1 + random() * 70),
      );
      const hard = seed % 3 === 0 ? [] : blockers.slice(0, 1 + (seed % 9)).reverse();
      const labels = Array.from({ length: 2 + (seed % 6) }, (_, i): CastleRibbonCandidate => ({
        id: (i % 3 === 0 ? '😀' : i % 3 === 1 ? '\uE000' : 'a') + i,
        baseline: rect(position(), position(), 12 + random() * 70, 8 + random() * 25),
        anchor: { x: position(), y: position() },
        selected: i === seed % 7,
        critical: (i + seed) % 4 === 0,
        target: (i + seed) % 5 === 0,
        leaderObstacles: seed % 4 === 0 ? [] : blockers.slice(0, seed % 13),
      }));
      verify(labels, blockers, hard);
    }
  });

  it('preserves SameValueZero axes, dynamic/grid duplicate replacement and epsilon contacts', () => {
    for (const epsilon of [-Number.EPSILON, -0, 0, Number.EPSILON, 2 ** -40]) {
      const labels = [candidate('b', -0, 0), candidate('a', 0, -0)];
      const blockers = [
        rect(40 + 4 + epsilon, 0),
        rect(-48 - 4, 8),
        rect(8, -48 - 4),
        rect(0, 0),
        rect(-0, 0),
      ];
      verify(labels, blockers);
      verify([...labels].reverse(), [...blockers].reverse(), [rect(40 + epsilon, 0)]);
    }
    // Dynamic edges include exact grid offsets and non-grid adjacent representable values.
    verify(
      [candidate()],
      [rect(8 + 40 + 4, 0), rect(8 + 40 + 4 + 2 ** -40, 0), rect(-8 - 4 - 40, 8)],
    );
  });

  it('keeps huge finite anchor clipping, open-edge/corner and zero-length segment semantics', () => {
    for (const magnitude of [1e100, 1e308, Number.MAX_VALUE]) {
      for (const sign of [-1, 1]) {
        const label = {
          ...candidate(),
          anchor: { x: sign * magnitude, y: -sign * magnitude },
          leaderObstacles: [rect(0, 0), rect(-1, -1, 1, 1)],
        };
        verify([label], [rect(0, 0), rect(40, 20)], [rect(0, 0)]);
      }
    }
    for (const anchor of [
      { x: 20, y: 10 },
      { x: 0, y: 0 },
      { x: 40, y: 20 },
      { x: 20, y: -10 },
      { x: -10, y: 10 },
    ])
      verify([{ ...candidate(), anchor, leaderObstacles: [rect(0, 0)] }], [rect(0, 0)]);
    verify(
      [{ ...candidate(), baseline: rect(-1e9, 1e9, 4096, 4096) }],
      [rect(1e9, -1e9, 4096, 4096)],
    );
  });

  it('matches full logical work exhaustion, attempted proposals and later zero-charge admissions', () => {
    const crowd = Array.from({ length: 40 }, (_, i) =>
      candidate('dense.' + String(i).padStart(3, '0')),
    );
    const blockers = Array.from({ length: 1024 }, () => rect(-1, -1, 200, 100));
    const far = { ...candidate('zz.final', 1e6, 1e6), leaderObstacles: [] };
    const result = verify([...crowd, far], blockers, blockers);
    expect(result.work).toBeLessThanOrEqual(1000000);
    expect([...result.actual.values()].some((p) => p.budgetLimited)).toBe(true);
    expect(result.actual.get('zz.final')!.budgetLimited).toBe(false);
    expect(result.actual.get('zz.final')!.triedPlacements).toBeGreaterThan(1);
    verify(
      crowd.slice(0, 4).map((label) => ({ ...label, leaderObstacles: blockers })),
      blockers,
    );
  });

  it('handles count maxima, independent memory, metadata, callback throws and empty results', () => {
    verify(
      Array.from({ length: 256 }, (_, i) => candidate(String(i), i * 5000)),
      [],
    );
    verify(
      Array.from({ length: 4 }, (_, i) => ({
        ...candidate(String(i)),
        leaderObstacles: Array.from({ length: 1024 }, () => rect(1e6)),
      })),
      Array.from({ length: 1024 }, () => rect(1e6)),
      Array.from({ length: 1024 }, () => rect(1e6)),
    );
    const label = {
      ...candidate(),
      baseline: { ...rect(), marker: 'paint' },
      anchor: { x: 20, y: -10, marker: 'world' },
    };
    Object.setPrototypeOf(label.baseline, { inheritedMarker: 'not-own' });
    Object.setPrototypeOf(label.anchor, { inheritedMarker: 'not-own' });
    const metadata = verify([label], []).actual.get(label.id)!;
    expect(Object.getPrototypeOf(metadata.rect)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(metadata.leader.start)).toBe(Object.prototype);
    expect(Object.hasOwn(metadata.rect, 'inheritedMarker')).toBe(false);
    expect(Object.hasOwn(metadata.leader.start, 'inheritedMarker')).toBe(false);
    expect(verify([], []).work).toBe(0);
    const first = realCastleOwner(),
      second = realCastleOwner();
    const expected = reference([candidate()], [rect(0, 0)]);
    compare(first.planner.layout([candidate()], [rect(0, 0)]), expected);
    first.planner.dispose();
    compare(second.planner.layout([candidate()], [rect(0, 0)]), expected);
    const onWork = vi.fn(() => {
      throw new Error('observer failed');
    });
    expect(() => second.planner.layout([], [], [], { onWork })).toThrow('observer failed');
    expect(onWork).toHaveBeenCalledTimes(1);
    second.planner.dispose();
  });

  it('matches input validation errors before kernel invocation', () => {
    const { planner } = realCastleOwner();
    const cases: [CastleRibbonCandidate[], RibbonRect[], RibbonRect[]][] = [
      [Array.from({ length: 257 }, () => candidate()), [], []],
      [[candidate()], Array.from({ length: 1025 }, () => rect()), []],
      [[candidate()], [], Array.from({ length: 1025 }, () => rect())],
      [[{ ...candidate(), baseline: rect(0, 0, 0) }], [], []],
      [[{ ...candidate(), baseline: rect(1e9 + 1) }], [], []],
      [[{ ...candidate(), anchor: { x: Infinity, y: 0 } }], [], []],
      [[candidate('')], [], []],
      [[candidate(), candidate()], [], []],
      [
        [
          {
            ...candidate(),
            leaderObstacles: Array.from({ length: 1025 }, () => rect()),
          },
        ],
        [],
        [],
      ],
      [
        Array.from({ length: 5 }, (_, i) => ({
          ...candidate(String(i)),
          leaderObstacles: Array.from({ length: 1024 }, () => rect()),
        })),
        [],
        [],
      ],
    ];
    for (const [labels, ordinary, hard] of cases) {
      let expected: unknown;
      try {
        reference(labels, ordinary, hard);
      } catch (error) {
        expected = error;
      }
      expect(expected).toBeInstanceOf(Error);
      expect(() => planner.layout(labels, ordinary, hard)).toThrow((expected as Error).message);
    }
    planner.dispose();
  });

  it('rejects malformed raw ABI instead of relying on JS validation', () => {
    const { exports, planner } = realCastleOwner();
    const pointer = exports.engine_alloc(16);
    const header = new Float64Array(exports.memory.buffer, pointer, 16);
    const reset = () => {
      header.fill(0);
      header[0] = 1;
      header[5] = 16;
    };
    reset();
    expect(exports.castle_ribbon_solve(pointer, 16)).toBe(0);
    for (const [column, bad] of [
      [0, 2],
      [1, 0.5],
      [1, 257],
      [2, 1025],
      [3, -1],
      [4, 4097],
      [5, 15],
      [1, NaN],
      [2, Infinity],
      [7, 1],
    ]) {
      reset();
      header[column!] = bad!;
      expect(exports.castle_ribbon_solve(pointer, 16)).toBe(-2);
    }
    reset();
    expect(exports.castle_ribbon_solve(pointer, 15)).toBe(-2);
    exports.engine_free(pointer, 16);
    planner.dispose();
  });
});
