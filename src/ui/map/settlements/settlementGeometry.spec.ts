import { describe, expect, it } from 'vitest';
import type { MapGraph } from '@core/state/mapGraph';
import type { MapNodeId, RoadEdgeId } from '@core/state/ids';
import {
  buildSettlementGeometry,
  TOWN_LIMITS,
  type SettlementContext,
  type TownCapsule,
} from './settlementGeometry';
import { buildFullState } from '../../../../tests/helpers/fullState';
import { selectMapStaticModel } from '@core/state/selectors';
import { buildDisplayCoast } from '../displayCoast';
import outline from '@data/map/japan-outline.json';
import { buildTerrainPack } from '../terrain/terrainPack';
import { createWaterFeatures } from '../terrain/terrainDraw';
import { collectCoastFootprints, collectRiverBridgeFootprints } from '../constrainedCoast';
import { collectRiverDisplayConstraints } from '../terrain/riverDisplayConstraints';
import { buildVisualMapState } from '@core/debugVisual';
import { CASTLE_BODY_ART_BY_TIER, castleBodyArtPlacement } from '../sceneParts/castleBodyArt';
import { CASTLE_NODE_GEOMETRY } from '../sceneParts/castleNode';

const main = 'castle.main' as MapNodeId,
  end = 'dist.end' as MapNodeId,
  road = 'road.approach' as RoadEdgeId;
function graph(reverse = false): MapGraph {
  const entries: [
    MapNodeId,
    MapGraph['nodes'] extends ReadonlyMap<MapNodeId, infer T> ? T : never,
  ][] = [
    [main, { id: main, kind: 'castle', pos: { x: 100, y: 100 }, isPort: false }],
    [end, { id: end, kind: 'district', pos: { x: 300, y: 100 }, isPort: false }],
  ];
  return {
    nodes: new Map(reverse ? entries.reverse() : entries),
    edges: new Map([[road, { id: road, a: main, b: end, type: 'land', grade: 3, baseDays: 1 }]]),
    adjacency: new Map([
      [main, [road]],
      [end, [road]],
    ]),
  };
}
const context: SettlementContext = {
  land: { polygons: [{ id: 'island', points: [0, 0, 500, 0, 500, 500, 0, 500] }] },
  lakes: [],
  obstacles: [],
};
const build = (c = context) => buildSettlementGeometry(graph(), { 'castle.main': 'main' }, c);
function paintedCastleRadius() {
  let radius = 22;
  for (const tier of ['main', 'branch'] as const)
    for (const spec of Object.values(CASTLE_BODY_ART_BY_TIER[tier])) {
      const p = castleBodyArtPlacement(
          spec,
          tier === 'main'
            ? CASTLE_NODE_GEOMETRY.paintedMainWidth
            : CASTLE_NODE_GEOMETRY.paintedBranchWidth,
        ),
        f = spec.contentBounds;
      for (const x of [f.x, f.x + f.width])
        for (const y of [f.y, f.y + f.height])
          radius = Math.max(radius, Math.hypot(p.x + x * p.scale, p.y + y * p.scale) + 2);
    }
  return radius;
}
describe('complete road-oriented town footprints', () => {
  it('compact actual visual fixture admits Sunpu and Kiyosu towns without reducing any emitted model/road/water guard', () => {
    const model = selectMapStaticModel(buildVisualMapState()),
      terrain = buildTerrainPack(),
      land = buildDisplayCoast(outline, model.graph, terrain.rivers);
    const water = createWaterFeatures(
      terrain.rivers,
      terrain.lakes,
      collectRiverBridgeFootprints(model.graph),
      collectRiverDisplayConstraints(model.graph, land),
    );
    try {
      let radius = 22;
      for (const tier of ['main', 'branch'] as const)
        for (const spec of Object.values(CASTLE_BODY_ART_BY_TIER[tier])) {
          const placement = castleBodyArtPlacement(
              spec,
              tier === 'main'
                ? CASTLE_NODE_GEOMETRY.paintedMainWidth
                : CASTLE_NODE_GEOMETRY.paintedBranchWidth,
            ),
            f = spec.contentBounds;
          for (const x of [f.x, f.x + f.width])
            for (const y of [f.y, f.y + f.height])
              radius = Math.max(
                radius,
                Math.hypot(placement.x + x * placement.scale, placement.y + y * placement.scale) +
                  2,
              );
        }
      const obstacles = collectCoastFootprints(model.graph, [])!.map((o) => ({
        ...o,
        radius: o.id.startsWith('node:')
          ? model.graph.nodes.get(o.id.slice(5) as MapNodeId)?.kind === 'castle'
            ? radius
            : 14
          : o.radius,
      }));
      for (const river of water.getRiverMaterialDiagnostics().rivers)
        for (const s of river.displaySegments)
          obstacles.push({ id: `water:${river.id}`, a: s.a, b: s.b, radius: s.width / 2 });
      const before = JSON.stringify(obstacles);
      const geometry = buildSettlementGeometry(model.graph, model.castleTier ?? {}, {
        land,
        lakes: water.getLakeGeometry().map((l) => l.points),
        obstacles,
        crests: (terrain.mountains ?? []).map((m) => ({
          id: m.id,
          mass: m.mass,
          ridges: m.ridges,
        })),
      });
      expect(geometry.houses.filter((h) => h.castleId === 'castle.sunpu')).toHaveLength(1);
      expect(geometry.houses.filter((h) => h.castleId === 'castle.kiyosu')).toHaveLength(2);
      expect(geometry.houses.filter((h) => h.castleId === 'castle.gifu')).toHaveLength(3);
      expect(geometry.houses.filter((h) => h.castleId === 'castle.sunpu').length).toBeGreaterThan(
        0,
      );
      expect(geometry.houses.filter((h) => h.castleId === 'castle.kiyosu').length).toBeGreaterThan(
        0,
      );
      expect(JSON.stringify(obstacles)).toBe(before);
      for (const h of geometry.houses) {
        const node = model.graph.nodes.get(h.castleId as MapNodeId)!;
        expect(Math.hypot(h.center.x - node.pos.x, h.center.y - node.pos.y)).toBeLessThanOrEqual(
          80,
        );
      }
      expect(geometry.attempted).toBeLessThanOrEqual(36);
    } finally {
      water.destroy();
    }
  });
  it('normal s1560 produces real coherent towns using actual coast, emitted lakes/rivers and road footprints without state mutation', async () => {
    const model = selectMapStaticModel(await buildFullState()),
      terrain = buildTerrainPack();
    const before = JSON.stringify([...model.graph.nodes, ...model.graph.edges]);
    const land = buildDisplayCoast(outline, model.graph, terrain.rivers);
    const water = createWaterFeatures(
      terrain.rivers,
      terrain.lakes,
      collectRiverBridgeFootprints(model.graph),
      collectRiverDisplayConstraints(model.graph, land),
    );
    try {
      const obstacles: TownCapsule[] = collectCoastFootprints(model.graph, [])!.map((o) => ({
        ...o,
        radius: o.id.startsWith('node:')
          ? model.graph.nodes.get(o.id.slice(5) as MapNodeId)?.kind === 'castle'
            ? 36
            : 14
          : o.radius,
      }));
      for (const r of water.getRiverMaterialDiagnostics().rivers)
        for (const s of r.displaySegments) obstacles.push({ a: s.a, b: s.b, radius: s.width / 2 });
      const geometry = buildSettlementGeometry(model.graph, model.castleTier ?? {}, {
        land,
        lakes: water.getLakeGeometry().map((l) => l.points),
        obstacles,
      });
      expect(geometry.houses.length).toBeGreaterThan(20);
      const grounded = buildSettlementGeometry(model.graph, model.castleTier ?? {}, {
        land,
        lakes: water.getLakeGeometry().map((l) => l.points),
        obstacles: obstacles.map((o) => ({
          ...o,
          radius:
            o.id?.startsWith('node:') &&
            model.graph.nodes.get(o.id.slice(5) as MapNodeId)?.kind === 'castle'
              ? paintedCastleRadius()
              : o.radius,
        })),
        crests: (terrain.mountains ?? []).map((m) => ({
          id: m.id,
          mass: m.mass,
          ridges: m.ridges,
        })),
      });
      expect(grounded.houses.filter((h) => h.castleId === 'castle.sunpu')).toHaveLength(0);
      expect(grounded.houses.filter((h) => h.castleId === 'castle.kiyosu')).toHaveLength(1);
      expect(grounded.houses).toHaveLength(104);
      // The omitted national Udo lot truly contains an authored crest point;
      // exact triple clipping cannot rescue it. Compact Sunpu stays positive above.
      const old = geometry.houses.find(
        (h) => h.castleId === 'castle.sunpu' && h.approachId === 'road.sunpu-udo-01',
      )!;
      const point = { x: 2302, y: 2846 };
      expect(old).toBeDefined();
      expect(point.x).toBeGreaterThan(old.footprint[0]!.x);
      expect(point.x).toBeLessThan(old.footprint[2]!.x);
      expect(point.y).toBeGreaterThan(old.footprint[0]!.y);
      expect(point.y).toBeLessThan(old.footprint[2]!.y);
      const akaishi = (terrain.mountains ?? []).find((m) => m.id === 'mt.akaishi')!;
      expect(akaishi.ridges.flat()).toContainEqual(point);
      let insideMass = false;
      for (let i = 0, j = akaishi.mass.length - 1; i < akaishi.mass.length; j = i++) {
        const a = akaishi.mass[i]!,
          b = akaishi.mass[j]!;
        if (
          a.y > point.y !== b.y > point.y &&
          point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        )
          insideMass = !insideMass;
      }
      expect(insideMass).toBe(true);
      expect(geometry.houses.some((h) => h.castleId === 'castle.sunpu')).toBe(true);
      expect(geometry.houses.some((h) => h.castleId === 'castle.kiyosu')).toBe(true);
      expect(geometry.houses.length).toBeLessThanOrEqual(TOWN_LIMITS.houses);
      expect(JSON.stringify([...model.graph.nodes, ...model.graph.edges])).toBe(before);
    } finally {
      water.destroy();
    }
  });
  it('only mass-gated authored crests reject lots; empty ridges and outside-mass capsules do not', () => {
    const mass = [
      { x: 115, y: 65 },
      { x: 160, y: 65 },
      { x: 160, y: 105 },
      { x: 115, y: 105 },
    ];
    const ridge = [
      { x: 120, y: 86 },
      { x: 155, y: 86 },
    ];
    const c = { id: 'mountain', mass, ridges: [ridge] };
    const result = build({ ...context, crests: [c] });
    expect(result.houses.filter((h) => h.center.y === 86)).toHaveLength(0);
    expect(result.houses.filter((h) => h.center.y === 114)).toHaveLength(2);
    expect(build({ ...context, crests: [{ ...c, ridges: [] }] })).toEqual(build());
    expect(
      build({ ...context, crests: [{ ...c, mass: mass.map((p) => ({ x: p.x + 300, y: p.y })) }] }),
    ).toEqual(build());
    const point = build({ ...context, crests: [{ ...c, ridges: [[{ x: 130, y: 86 }]] }] });
    expect(point.houses.some((h) => h.center.x === 130 && h.center.y === 86)).toBe(false);
    const frozen = JSON.stringify(c);
    expect(
      build({
        ...context,
        crests: [
          { ...c, ridges: Array.from({ length: TOWN_LIMITS.boundaryPoints + 1 }, () => []) },
        ],
      }).limited,
    ).toBe(true);
    expect(
      build({ ...context, crests: [{ ...c, mass: [{ x: 1e308, y: 0 }, ...mass] }] }).limited,
    ).toBe(true);
    build({ ...context, crests: [c] });
    expect(JSON.stringify(c)).toBe(frozen);
    expect(build({ ...context, crests: [{ ...c, ridges: [[{ x: NaN, y: 0 }]] }] }).limited).toBe(
      true,
    );
    expect(
      build({
        ...context,
        crests: [
          {
            ...c,
            ridges: [Array.from({ length: TOWN_LIMITS.boundaryPoints + 1 }, () => ridge[0]!)],
          },
        ],
      }).limited,
    ).toBe(true);
  });
  it('actual approach organizes paired buildings with roofs, walls and southeast shadows', () => {
    const result = build();
    expect(result.houses.length).toBeGreaterThanOrEqual(4);
    expect(result.houses.length).toBeLessThanOrEqual(8);
    for (const h of result.houses) {
      expect(h.approachId).toBe(road);
      expect([130, 145]).toContain(h.center.x);
      expect([86, 114]).toContain(h.center.y);
      expect(h.roofs).toHaveLength(2);
      expect(h.walls).toHaveLength(2);
      const p = h.footprint,
        min = p[0]!,
        max = p[2]!;
      for (const v of [...h.shadow, ...h.roofs.flat(), ...h.walls.flat()]) {
        expect(v.x).toBeGreaterThan(min.x);
        expect(v.x).toBeLessThan(max.x);
        expect(v.y).toBeGreaterThan(min.y);
        expect(v.y).toBeLessThan(max.y);
      }
    }
  });
  it('all four road quadrants emit world-south-facing walls rather than rotated back faces', () => {
    for (const [x, y] of [
      [300, 300],
      [-100, 300],
      [-100, -100],
      [300, -100],
    ]) {
      const g = graph();
      const target = g.nodes.get(end)!;
      const result = buildSettlementGeometry(
        { ...g, nodes: new Map([...g.nodes, [end, { ...target, pos: { x: x!, y: y! } }]]) },
        { 'castle.main': 'main' },
        context,
      );
      expect(result.houses.length).toBeGreaterThan(0);
      for (const h of result.houses) {
        expect(h.walls).toHaveLength(2);
        for (const wall of h.walls) {
          // For the authored CCW base, outward normal is (edgeY,-edgeX).
          // Screen extrusion goes upward, so only positive-Y outward faces survive.
          expect(wall[1]!.x - wall[0]!.x).toBeLessThan(0);
          expect(wall[2]!.y).toBe(wall[1]!.y - 3);
          expect(wall[3]!.y).toBe(wall[0]!.y - 3);
        }
      }
    }
  });
  it('rejects roofs crossing the shore even when their center is on land', () => {
    const narrow = {
      ...context,
      land: { polygons: [{ id: 'shore', points: [0, 0, 132, 0, 132, 500, 0, 500] }] },
    };
    expect(build(narrow).houses).toHaveLength(0);
  });
  it('tiny contained lake is not missed by corner-only tests', () => {
    const lake = [
      { x: 129, y: 85 },
      { x: 131, y: 85 },
      { x: 131, y: 87 },
      { x: 129, y: 87 },
    ];
    const result = build({ ...context, lakes: [lake] });
    expect(result.houses.some((h) => h.center.x === 130 && h.center.y === 86)).toBe(false);
    expect(result.houses.length).toBeGreaterThan(0);
  });
  it('full capsule, including endpoint radius, excludes complete shadows not just roof centers', () => {
    const blocked = { a: { x: 137, y: 90 }, b: { x: 137, y: 90 }, radius: 2 };
    const result = build({ ...context, obstacles: [blocked] });
    expect(result.houses.some((h) => h.center.x === 130 && h.center.y === 86)).toBe(false);
    for (const h of result.houses) {
      const a = h.footprint[0]!,
        b = h.footprint[2]!;
      const nx = Math.max(a.x, Math.min(b.x, blocked.a.x)),
        ny = Math.max(a.y, Math.min(b.y, blocked.a.y));
      expect(Math.hypot(nx - blocked.a.x, ny - blocked.a.y)).toBeGreaterThan(blocked.radius);
    }
  });
  it('no approach, branch-only and sea-only graphs produce no invented town', () => {
    expect(
      buildSettlementGeometry(graph(), { 'castle.main': 'branch' }, context).houses,
    ).toHaveLength(0);
    const g = graph();
    expect(
      buildSettlementGeometry({ ...g, adjacency: new Map() }, { 'castle.main': 'main' }, context)
        .houses,
    ).toHaveLength(0);
    expect(
      buildSettlementGeometry(
        { ...g, edges: new Map([[road, { ...g.edges.get(road)!, type: 'sea' }]]) },
        { 'castle.main': 'main' },
        context,
      ).houses,
    ).toHaveLength(0);
  });
  it('turning approaches use actual arclength stations and local heading instead of extrapolating their first segment', () => {
    const g = graph(),
      e = g.edges.get(road)!;
    const bend = { ...g, edges: new Map([[road, { ...e, waypoints: [130, 100, 130, 300] }]]) };
    const result = buildSettlementGeometry(bend, { 'castle.main': 'main' }, context);
    expect(
      result.houses.some(
        (h) => Math.abs(h.center.x - 144) < 1e-8 && Math.abs(h.center.y - 115) < 1e-8,
      ),
    ).toBe(true);
    expect(result.houses.some((h) => Math.abs(h.center.x - 145) < 1e-8)).toBe(false);
  });
  it('large admitted model clearance never pushes lots beyond the explicit 80world origin budget', () => {
    const result = build({
      ...context,
      obstacles: [
        { id: 'node:castle.main', a: { x: 100, y: 100 }, b: { x: 100, y: 100 }, radius: 80 },
      ],
    });
    expect(result.houses).toHaveLength(0);
    expect(result.attempted).toBe(12);
    expect(result.limited).toBe(false);
  });
  it('invalid/budgeted input fails closed; empty towns and immutable input are safe', () => {
    expect(
      build({ ...context, obstacles: [{ a: { x: NaN, y: 0 }, b: { x: 0, y: 0 }, radius: 1 }] })
        .houses,
    ).toHaveLength(0);
    expect(
      build({
        ...context,
        obstacles: Array.from({ length: TOWN_LIMITS.obstacles + 1 }, () => ({
          a: { x: 0, y: 0 },
          b: { x: 0, y: 0 },
          radius: 1,
        })),
      }).limited,
    ).toBe(true);
    const before = JSON.stringify(context),
      a = build(),
      b = buildSettlementGeometry(graph(true), { 'castle.main': 'main' }, context);
    expect(b).toEqual(a);
    expect(JSON.stringify(context)).toBe(before);
    expect(Object.isFrozen(a.houses)).toBe(true);
    expect(Object.isFrozen(a.houses[0]!.footprint[0])).toBe(true);
  });
});
