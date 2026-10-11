import { describe, expect, it } from 'vitest';
import { Graphics, type StrokeInstruction } from 'pixi.js';
import {
  buildDisplayRiver,
  buildNaturalDisplayRiver,
  DISPLAY_RIVER,
  NATURAL_RIVER,
} from '@ui/map/terrain/displayRiverGeometry';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { RIVER_WIDTH } from '@ui/map/mapViewConfig';
import outline from '../../src/data/map/japan-outline.json';
import { buildFullState } from '../helpers/fullState';
import { selectMapStaticModel } from '@core/state/selectors';
import { buildDisplayCoast } from '@ui/map/displayCoast';
import { collectRiverBridgeFootprints } from '@ui/map/constrainedCoast';
import { collectRiverDisplayConstraints } from '@ui/map/terrain/riverDisplayConstraints';

const bent = [
  { x: 0, y: 0 },
  { x: 80, y: 0 },
  { x: 80, y: 80 },
];
describe('local river display interpolation, with exact original paint mask', () => {
  it('opts Kiso into a certified wider display corridor with exact protected contact legs', () => {
    const river = buildTerrainPack().rivers.find((r) => r.id === 'rv.kiso')!;
    const constraints = {
      boundaryPolygons: [
        [
          { x: 1500, y: 2400 },
          { x: 2500, y: 2400 },
          { x: 2500, y: 3200 },
          { x: 1500, y: 3200 },
        ],
      ],
      obstacles: [],
    };
    const water: ReturnType<typeof createWaterFeatures> = Reflect.apply(
      createWaterFeatures,
      undefined,
      [[river], [], [], constraints],
    );
    try {
      const info = water.getRiverMaterialDiagnostics().rivers[0]!;
      expect(info.clipKind).toBe('certifiedDisplayCorridor');
      expect(info.corridorRadius).toBe(8);
      expect(info.decisions.filter((d) => d.accepted)).toHaveLength(2);
      expect(info.displaySegments[0]).toEqual({ ...info.segments[0], sourceSegment: 0 });
      expect(info.displaySegments.at(-1)).toEqual({ ...info.segments.at(-1), sourceSegment: 3 });
      const group = water.container.children[1]!.children[0]!;
      const paint = group.children[0] as Graphics,
        mask = group.children[1] as Graphics;
      const strokes = paint.context.instructions.filter(
        (s): s is StrokeInstruction => s.action === 'stroke',
      );
      expect(strokes).toHaveLength(4);
      expect(
        Reflect.get(strokes[1]!.data.path.shapePath.shapePrimitives[0]!.shape, 'points'),
      ).toHaveLength(22); // Raw entry/exit plus the unchanged eight curved chords.
      expect(
        mask.context.instructions
          .filter((s): s is StrokeInstruction => s.action === 'stroke')
          .map((s) => s.data.style.width),
      ).toEqual(info.segments.map((s) => s.width + 16));
    } finally {
      water.destroy();
    }
  });
  it('emits certified Shinano inland banks on the actual national graph without changing contact legs or other rivers', async () => {
    const terrain = buildTerrainPack();
    const { graph } = selectMapStaticModel(await buildFullState());
    const coast = buildDisplayCoast(outline, graph, terrain.rivers);
    const constraints = collectRiverDisplayConstraints(graph, coast);
    expect(constraints).not.toBeNull();
    const bridges = collectRiverBridgeFootprints(graph);
    const before = createWaterFeatures(terrain.rivers, terrain.lakes, bridges);
    const water = createWaterFeatures(terrain.rivers, terrain.lakes, bridges, constraints);
    try {
      const info = water.getRiverMaterialDiagnostics().rivers.find((r) => r.id === 'rv.shinano')!;
      expect(info.clipKind).toBe('certifiedDisplayCorridor');
      expect(info.corridorRadius).toBe(8);
      expect(info.decisions.filter((d) => d.accepted).map((d) => d.sourceSegment)).toEqual([1, 2]);
      expect(info.displaySegments[0]).toEqual({ ...info.segments[0], sourceSegment: 0 });
      expect(info.displaySegments.at(-1)).toEqual({ ...info.segments.at(-1), sourceSegment: 3 });
      const source = info.segments[2]!;
      const dx = source.b.x - source.a.x,
        dy = source.b.y - source.a.y,
        length = Math.hypot(dx, dy);
      const departure = (p: { x: number; y: number }) =>
        Math.abs(dx * (p.y - source.a.y) - dy * (p.x - source.a.x)) / length;
      const decision = info.decisions.find((d) => d.sourceSegment === 2)!;
      // All cubic controls inside the source's convex 8-world corridor certify
      // the entire cubic, not merely sampled vertices. Chord capsules retain
      // the exact source width, so the complete paint stays within that corridor.
      expect(Math.max(...decision.controls.map(departure))).toBeLessThanOrEqual(8);
      const actual = info.displaySegments.filter((s) => s.sourceSegment === 2);
      expect(Math.max(...actual.flatMap((s) => [departure(s.a), departure(s.b)]))).toBeGreaterThan(
        4,
      );
      expect(actual.every((s) => s.width === source.width)).toBe(true);
      // Independent native failure: the natural inland window must not restore
      // the 66.94-degree raw join at the retained (2515,2310) anchor.
      const junctionTurns = info.displaySegments.slice(1).flatMap((s, i) => {
        const previous = info.displaySegments[i]!;
        if (Math.hypot(s.a.x - 2515, s.a.y - 2310) > 13) return [];
        const ax = previous.b.x - previous.a.x,
          ay = previous.b.y - previous.a.y,
          bx = s.b.x - s.a.x,
          by = s.b.y - s.a.y;
        return [
          (Math.acos(
            Math.max(
              -1,
              Math.min(1, (ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by)),
            ),
          ) *
            180) /
            Math.PI,
        ];
      });
      expect(Math.max(...junctionTurns)).toBeLessThan(30);
      const find = (node: typeof water.container): Graphics | undefined => {
        if (node.label === 'river-paint:rv.shinano') return node as Graphics;
        for (const child of node.children) {
          const result = find(child);
          if (result) return result;
        }
      };
      const paint = find(water.container)!;
      const strokes = paint.context.instructions.filter(
        (s): s is StrokeInstruction => s.action === 'stroke',
      );
      const shape = strokes[2]!.data.path.shapePath.shapePrimitives[0]!.shape;
      expect(Reflect.get(shape, 'points')).toEqual([
        actual[0]!.a.x,
        actual[0]!.a.y,
        ...actual.flatMap((s) => [s.b.x, s.b.y]),
      ]);
      for (const previous of before.getRiverMaterialDiagnostics().rivers) {
        if (previous.id === 'rv.kiso' || previous.id === 'rv.shinano') continue;
        expect(
          water.getRiverMaterialDiagnostics().rivers.find((r) => r.id === previous.id),
        ).toEqual(previous);
      }
    } finally {
      before.destroy();
      water.destroy();
    }
  });
  it('composes only a certified raw collar, retaining the natural interior and entire pinned mouth leg', () => {
    const river = buildTerrainPack().rivers.find((r) => r.id === 'rv.shinano')!;
    const constraints = {
      boundaryPolygons: [
        [
          { x: 2200, y: 2000 },
          { x: 2700, y: 2000 },
          { x: 2700, y: 2700 },
          { x: 2200, y: 2700 },
        ],
      ],
      obstacles: [],
    };
    const before = buildNaturalDisplayRiver(river.points, 7, [], constraints);
    const after = buildNaturalDisplayRiver(river.points, 7, [], constraints, [], {
      composePinnedJunctions: true,
    });
    const original = before.displaySegments.filter((s) => s.sourceSegment === 2);
    const changed = after.displaySegments.filter((s) => s.sourceSegment === 2);
    expect(changed.slice(0, original.length - 1)).toEqual(original.slice(0, -1));
    expect(after.decisions).toEqual(before.decisions);
    expect(after.displaySegments.filter((s) => s.sourceSegment !== 2)).toEqual(
      before.displaySegments.filter((s) => s.sourceSegment !== 2),
    );
    expect(after.junctions).toHaveLength(1);
    const certificate = after.junctions[0]!;
    expect(certificate.sourceSegment).toBe(2);
    expect(certificate.controls[0]).toEqual(original.at(-1)!.a);
    expect(certificate.controls.at(-1)).toEqual(river.points[3]);
    const end = certificate.controls[3]!,
      tangent = certificate.controls[2]!,
      last = river.points[4]!;
    expect(
      (end.x - tangent.x) * (last.y - end.y) - (end.y - tangent.y) * (last.x - end.x),
    ).toBeCloseTo(0, 8);
    expect(Object.isFrozen(after.junctions)).toBe(true);
    expect(Object.isFrozen(certificate.controls[1])).toBe(true);
    // Capsule convexity certifies the entire new cubic, not just its chords.
    for (const p of certificate.controls) {
      const a = river.points[2]!,
        b = river.points[3]!,
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
      );
      expect(Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)).toBeLessThanOrEqual(8);
    }
    // Road/body/other-water contacts at the junction cannot be traded away for
    // the corner improvement; only this collar falls back, not the inland hump.
    const blockedConstraints = {
      ...constraints,
      obstacles: [{ a: river.points[3]!, b: river.points[3]!, radius: 1 }],
    };
    const blockedBefore = buildNaturalDisplayRiver(river.points, 7, [], blockedConstraints);
    const blockedAfter = buildNaturalDisplayRiver(river.points, 7, [], blockedConstraints, [], {
      composePinnedJunctions: true,
    });
    expect(blockedAfter.displaySegments).toEqual(blockedBefore.displaySegments);
    expect(blockedAfter.junctions).toEqual([]);
    expect(blockedAfter.corridorRadius).toBe(8);
    const coastConstraints = {
      ...constraints,
      boundaryPolygons: [
        [
          { x: 2200, y: 2000 },
          { x: 2516, y: 2000 },
          { x: 2516, y: 2700 },
          { x: 2200, y: 2700 },
        ],
      ],
    };
    const coastBefore = buildNaturalDisplayRiver(river.points, 7, [], coastConstraints);
    const coastAfter = buildNaturalDisplayRiver(river.points, 7, [], coastConstraints, [], {
      composePinnedJunctions: true,
    });
    expect(coastAfter.displaySegments).toEqual(coastBefore.displaySegments);
    expect(coastAfter.junctions).toEqual([]);
    expect(coastAfter.corridorRadius).toBe(8);
  });
  it('keeps the complete Shinano source capsule unchanged when a bridge protects its inland bend', () => {
    const river = buildTerrainPack().rivers.find((r) => r.id === 'rv.shinano')!;
    const bridge = { a: { x: 2507.5, y: 2335 }, b: { x: 2507.5, y: 2335 }, radius: 20 };
    const water = createWaterFeatures([river], [], [bridge], {
      boundaryPolygons: [
        [
          { x: 2200, y: 2000 },
          { x: 2700, y: 2000 },
          { x: 2700, y: 2700 },
          { x: 2200, y: 2700 },
        ],
      ],
      obstacles: [],
    });
    try {
      const info = water.getRiverMaterialDiagnostics().rivers[0]!;
      expect(info.displaySegments.filter((s) => s.sourceSegment === 2)).toEqual([
        { ...info.segments[2], sourceSegment: 2 },
      ]);
      expect(info.displaySegments[0]).toEqual({ ...info.segments[0], sourceSegment: 0 });
      expect(info.displaySegments.at(-1)).toEqual({ ...info.segments.at(-1), sourceSegment: 3 });
    } finally {
      water.destroy();
    }
  });
  it('certifies the full cubic control hull within each expanded raw capsule and keeps local obstacle fallback', () => {
    const points = buildTerrainPack().rivers.find((r) => r.id === 'rv.kiso')!.points;
    const constraints = {
      boundaryPolygons: [
        [
          { x: 1500, y: 2400 },
          { x: 2500, y: 2400 },
          { x: 2500, y: 3200 },
          { x: 1500, y: 3200 },
        ],
      ],
      obstacles: [],
    };
    const result = buildNaturalDisplayRiver(points, 7, [], constraints);
    const distance = (
      p: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    let deviation = 0;
    for (const decision of result.decisions.filter((d) => d.accepted)) {
      const raw = result.rawSegments[decision.sourceSegment]!;
      for (const p of decision.controls) expect(distance(p, raw.a, raw.b)).toBeLessThanOrEqual(8);
      for (const segment of result.displaySegments.filter(
        (s) => s.sourceSegment === decision.sourceSegment,
      )) {
        deviation = Math.max(deviation, distance(segment.b, raw.a, raw.b));
        expect(segment.width).toBe(raw.width);
      }
    }
    expect(deviation).toBeGreaterThan(1);
    const obstacle = { a: { x: 2020, y: 2760 }, b: { x: 2020, y: 2760 }, radius: 2 };
    const blocked = buildNaturalDisplayRiver(points, 7, [], {
      ...constraints,
      obstacles: [obstacle],
    });
    expect(blocked.decisions[1]!.accepted).toBe(true);
    // This disk is exactly on the source midpoint. Its complete old-water
    // contact interval is [-R,+R] along the line, not merely a sampled point.
    const source = blocked.rawSegments[1]!;
    const length = Math.hypot(source.b.x - source.a.x, source.b.y - source.a.y);
    const ux = (source.b.x - source.a.x) / length,
      uy = (source.b.y - source.a.y) / length,
      radius = obstacle.radius + source.width / 2;
    const contactEnds = [-radius, radius].map((d) => ({
      x: obstacle.a.x + ux * d,
      y: obstacle.a.y + uy * d,
    }));
    expect(
      blocked.displaySegments.some(
        (s) => s.sourceSegment === 1 && contactEnds.every((p) => distance(p, s.a, s.b) < 1e-8),
      ),
    ).toBe(true);
    expect(blocked.decisions[2]!.accepted).toBe(true);
    const bridge = buildNaturalDisplayRiver(points, 7, [obstacle], constraints);
    expect(bridge.displaySegments).toContainEqual(bridge.rawSegments[1]);
    const lake = [
      [
        { x: 2018, y: 2758 },
        { x: 2022, y: 2758 },
        { x: 2022, y: 2762 },
        { x: 2018, y: 2762 },
      ],
    ];
    expect(
      buildNaturalDisplayRiver(points, 7, [], constraints, lake).displaySegments,
    ).toContainEqual(result.rawSegments[1]);
    for (const invalid of [
      null,
      { ...constraints, boundaryPolygons: [] },
      {
        ...constraints,
        obstacles: Array.from({ length: NATURAL_RIVER.maxObstacles + 1 }, () => obstacle),
      },
    ]) {
      const fallback = buildNaturalDisplayRiver(points, 7, [], invalid);
      expect(fallback.displaySegments).toBe(fallback.rawSegments);
    }
    expect(Object.isFrozen(result.decisions[1]!.controls[1])).toBe(true);
    expect(buildNaturalDisplayRiver(points, 7, [], constraints)).toEqual(result);
  });
  it('rejects an entirely offshore hull and preserves old local curves when the natural context is unsafe', () => {
    const river = buildTerrainPack().rivers.find((r) => r.id === 'rv.kiso')!;
    const constraints = {
      boundaryPolygons: [
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      ],
      obstacles: [],
    };
    const natural = buildNaturalDisplayRiver(river.points, 7, [], constraints);
    expect(natural.curvedCorners).toBe(0);
    const water = createWaterFeatures([river], [], [], constraints);
    try {
      const actual = water.getRiverMaterialDiagnostics().rivers[0]!;
      expect(actual.clipKind).toBe('originalCapsuleUnion');
      expect(actual.displaySegments).toEqual(
        buildDisplayRiver(river.points, 7, []).displaySegments,
      );
      expect(actual.decisions.some((d) => d.reason === 'unsafe-hull')).toBe(true);
    } finally {
      water.destroy();
    }
  });
  it('retains a folded source leg when a nonadjacent own-water capsule occupies its proposed corridor', () => {
    const points = buildTerrainPack().rivers.find((r) => r.id === 'rv.kiso')!.points;
    const constraints = {
      boundaryPolygons: [
        [
          { x: 1500, y: 2400 },
          { x: 2500, y: 2400 },
          { x: 2500, y: 3200 },
          { x: 1500, y: 3200 },
        ],
      ],
      obstacles: [],
    };
    expect(buildNaturalDisplayRiver(points, 7, [], constraints).decisions[1]!.accepted).toBe(true);
    const folded = [...points, points[1]!, points[2]!];
    const before = structuredClone(folded);
    const result = buildNaturalDisplayRiver(folded, 7, [], constraints);
    expect(result.decisions[1]!.accepted).toBe(false);
    expect(result.displaySegments).toContainEqual(result.rawSegments[1]);
    expect(folded).toEqual(before);
  });
  it('distributes actual Fuji and Shinano turns across the unchanged eight-chord local curve', () => {
    const rivers = buildTerrainPack().rivers;
    for (const [id, corner, limit] of [
      ['rv.fuji', { x: 2364, y: 2870 }, 20],
      ['rv.shinano', { x: 2515, y: 2310 }, 30],
    ] as const) {
      const river = rivers.find((r) => r.id === id)!;
      const result = buildDisplayRiver(river.points, RIVER_WIDTH[river.widthClass]);
      const turns: number[] = [];
      for (let i = 1; i < result.displaySegments.length; i++) {
        const previous = result.displaySegments[i - 1]!,
          current = result.displaySegments[i]!;
        if (Math.hypot(current.a.x - corner.x, current.a.y - corner.y) > 13) continue;
        const ax = previous.b.x - previous.a.x,
          ay = previous.b.y - previous.a.y;
        const bx = current.b.x - current.a.x,
          by = current.b.y - current.a.y;
        turns.push(
          (Math.acos(
            Math.max(
              -1,
              Math.min(1, (ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by)),
            ),
          ) *
            180) /
            Math.PI,
        );
      }
      expect(turns.length).toBeGreaterThan(0);
      expect(Math.max(...turns), id).toBeLessThan(limit);
      expect(DISPLAY_RIVER.steps).toBe(8);
    }
  });
  it('genuinely changes bend direction while retaining original anchors, end legs and taper widths', () => {
    const before = structuredClone(bent),
      result = buildDisplayRiver(bent, 7);
    expect(result.curvedCorners).toBe(1);
    expect(result.displaySegments.length).toBeGreaterThan(2);
    expect(result.rawSegments[0]!.width).toBeCloseTo(2.8, 12);
    expect(result.rawSegments[1]!.width).toBe(7);
    expect(result.displaySegments[0]!.a).toEqual(bent[0]);
    expect(result.displaySegments.at(-1)!.b).toEqual(bent.at(-1));
    expect(result.displaySegments[0]!.a.y).toBe(result.displaySegments[0]!.b.y);
    expect(result.displaySegments.at(-1)!.a.x).toBe(result.displaySegments.at(-1)!.b.x);
    for (const p of bent)
      expect(
        result.displaySegments.some(
          (s) => (s.a.x === p.x && s.a.y === p.y) || (s.b.x === p.x && s.b.y === p.y),
        ),
      ).toBe(true);
    expect(result.displaySegments.some((s) => s.a.x !== s.b.x && s.a.y !== s.b.y)).toBe(true);
    for (const s of result.displaySegments)
      expect(s.width).toBe(result.rawSegments[s.sourceSegment]!.width);
    expect(Object.isFrozen(result.displaySegments)).toBe(true);
    expect(
      result.displaySegments.every(
        (s) => Object.isFrozen(s) && Object.isFrozen(s.a) && Object.isFrozen(s.b),
      ),
    ).toBe(true);
    expect(buildDisplayRiver(bent, 7)).toEqual(result);
    expect(bent).toEqual(before);
  });
  it('pins the entire original water capsule intersecting a bridge footprint, not just its center', () => {
    const keepout = { a: { x: 40, y: 4 }, b: { x: 40, y: 4 }, radius: 3 };
    const pinned = buildDisplayRiver(bent, 7, [keepout]);
    expect(pinned.curvedCorners).toBe(0);
    expect(pinned.displaySegments).toBe(pinned.rawSegments);
    const clear = buildDisplayRiver(bent, 7, [
      { ...keepout, a: { x: 40, y: 20 }, b: { x: 40, y: 20 } },
    ]);
    expect(clear.curvedCorners).toBe(1);
  });
  it('rejects invalid bounds and falls back for degenerate, straight and reversed legs without NaN', () => {
    for (const points of [
      [],
      [
        { x: NaN, y: 0 },
        { x: 1, y: 1 },
      ],
      Array.from({ length: 257 }, (_, x) => ({ x, y: 0 })),
    ])
      expect(buildDisplayRiver(points, 7).displaySegments).toEqual([]);
    for (const width of [0, -1, NaN, Infinity, 129])
      expect(buildDisplayRiver(bent, width).displaySegments).toEqual([]);
    for (const keepout of [
      { a: { x: NaN, y: 0 }, b: { x: 0, y: 0 }, radius: 1 },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, radius: -1 },
    ])
      expect(buildDisplayRiver(bent, 7, [keepout]).curvedCorners).toBe(0);
    for (const points of [
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ],
    ]) {
      const result = buildDisplayRiver(points, 7);
      expect(result.displaySegments).toBe(result.rawSegments);
    }
  });
  it('emits every bridge-protected capsule exactly, including its full wet flank, while other corners curve', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 160 },
    ];
    const keepout = { a: { x: 40, y: 3 }, b: { x: 40, y: 3 }, radius: 2 };
    const result = buildDisplayRiver(points, 7, [keepout]);
    expect(result.curvedCorners).toBeGreaterThan(0);
    // Independent disk/capsule intersection: its center is outside the centerline,
    // but distance 3 is less than the first capsule radius 1.4 plus disk radius 2.
    expect(3).toBeGreaterThan(keepout.radius);
    expect(3).toBeLessThan(result.rawSegments[0]!.width / 2 + keepout.radius);
    expect(result.displaySegments).toContainEqual(result.rawSegments[0]);
    const water = createWaterFeatures([{ id: 'rv.bridge', points, widthClass: 3 }], [], [keepout]);
    try {
      const group = water.container.children[1]!.children[0]!;
      const paint = group.children[0] as Graphics,
        mask = group.children[1] as Graphics;
      const exactFirstCapsule = (g: Graphics) =>
        g.context.instructions.some((instruction) => {
          if (
            instruction.action !== 'stroke' ||
            instruction.data.style.width !== result.rawSegments[0]!.width
          )
            return false;
          const shape = instruction.data.path.shapePath.shapePrimitives[0]!.shape;
          return (
            JSON.stringify(Reflect.get(shape, 'points')) === JSON.stringify([0, 0, 80, 0]) &&
            instruction.data.style.cap === 'round'
          );
        });
      expect(exactFirstCapsule(paint)).toBe(true);
      expect(exactFirstCapsule(mask)).toBe(true);
      expect(group.mask).toBe(mask);
      // The full identical capsule in BOTH paint and mask proves wet coverage,
      // not merely containment or sampled centerline contact.
      expect(buildDisplayRiver(points, 7, null).displaySegments).toEqual(result.rawSegments);
    } finally {
      water.destroy();
    }
  });
  it('changes actual national bends with bounded static output and unchanged references', () => {
    const rivers = buildTerrainPack().rivers,
      before = structuredClone(rivers);
    let curved = 0;
    for (const river of rivers) {
      const result = buildDisplayRiver(river.points, RIVER_WIDTH[river.widthClass]);
      curved += result.curvedCorners;
      expect(result.displaySegments.length).toBeLessThanOrEqual(DISPLAY_RIVER.maxOutputSegments);
      expect(result.rawSegments.length).toBe(river.points.length - 1);
      for (const segment of result.displaySegments)
        expect(
          [segment.a.x, segment.a.y, segment.b.x, segment.b.y, segment.width].every(
            Number.isFinite,
          ),
        ).toBe(true);
    }
    expect(curved).toBeGreaterThan(0);
    expect(rivers).toEqual(before);
  });
  it('uses real Pixi Graphics stroke masks for the full original tapered capsule union and releases contexts once', () => {
    const water = createWaterFeatures([{ id: 'rv.test', points: bent, widthClass: 3 }], []);
    const bucket = water.container.children[1]!;
    const group = bucket.children[0]!;
    const paint = group.children[0] as Graphics,
      mask = group.children[1] as Graphics;
    const paintDestroy = paint.context.destroy.bind(paint.context),
      maskDestroy = mask.context.destroy.bind(mask.context);
    let paints = 0,
      masks = 0;
    paint.context.destroy = function () {
      paints++;
      return paintDestroy();
    };
    mask.context.destroy = function () {
      masks++;
      return maskDestroy();
    };
    try {
      expect(group.mask).toBe(mask);
      const strokes = mask.context.instructions.filter(
        (instruction): instruction is StrokeInstruction => instruction.action === 'stroke',
      );
      expect(strokes).toHaveLength(2);
      for (const [i, s] of strokes.entries()) {
        expect(s.data.style.width).toBeCloseTo(i === 0 ? 2.8 : 7, 12);
        expect(s.data.style.cap).toBe('round');
        const shape = s.data.path.shapePath.shapePrimitives[0]!.shape;
        expect(Reflect.get(shape, 'points')).toEqual([
          bent[i]!.x,
          bent[i]!.y,
          bent[i + 1]!.x,
          bent[i + 1]!.y,
        ]);
      }
      const diagnostics = water.getRiverMaterialDiagnostics();
      expect(diagnostics).toMatchObject({
        ownedMaskGraphics: 1,
        ownedDisplayGraphics: 1,
        ownedTextures: 1,
      });
      expect(diagnostics.rivers[0]!.clipKind).toBe('originalCapsuleUnion');
      expect(diagnostics.rivers[0]!.segments).toHaveLength(2);
      expect(diagnostics.rivers[0]!.displaySegments.length).toBeGreaterThan(2);
      water.setStage('far');
      water.setStage('near');
      expect(water.getRiverMaterialDiagnostics()).toEqual(diagnostics);
    } finally {
      water.destroy();
      water.destroy();
    }
    expect(paints).toBe(1);
    expect(masks).toBe(1);
    expect(water.getRiverMaterialDiagnostics()).toMatchObject({
      ownedMaskGraphics: 0,
      ownedDisplayGraphics: 0,
      ownedTextures: 0,
    });
  });
});
