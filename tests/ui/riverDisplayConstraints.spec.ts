import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { buildFullState } from '../helpers/fullState';
import { selectMapStaticModel } from '@core/state/selectors';
import { collectCoastFootprints, collectRiverBridgeFootprints } from '@ui/map/constrainedCoast';
import { buildDisplayCoast } from '@ui/map/displayCoast';
import outline from '@data/map/japan-outline.json';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { collectRiverDisplayConstraints } from '@ui/map/terrain/riverDisplayConstraints';
import { CASTLE_BODY_ART_BY_TIER, castleBodyArtPlacement } from '@ui/map/sceneParts/castleBodyArt';
import {
  CASTLE_NODE_GEOMETRY,
  drawCastleBody,
  drawCastleWarning,
} from '@ui/map/sceneParts/castleNode';

const coast = {
  polygons: [{ id: 'test', points: [0, 0, 4096, 0, 4096, 4096, 0, 4096] }],
};

describe('river display obstacle context', () => {
  it('changes only actual normal s1560 Kiso and Shinano banks while preserving owned-resource budgets', async () => {
    const model = selectMapStaticModel(await buildFullState());
    const terrain = buildTerrainPack();
    const display = buildDisplayCoast(outline, model.graph, terrain.rivers);
    const bridges = collectRiverBridgeFootprints(model.graph);
    const old = createWaterFeatures(terrain.rivers, terrain.lakes, bridges);
    const candidate = createWaterFeatures(
      terrain.rivers,
      terrain.lakes,
      bridges,
      collectRiverDisplayConstraints(model.graph, display),
    );
    try {
      const before = old.getRiverMaterialDiagnostics();
      const after = candidate.getRiverMaterialDiagnostics();
      const kiso = after.rivers.find((river) => river.id === 'rv.kiso')!;
      expect(kiso.clipKind).toBe('certifiedDisplayCorridor');
      expect(kiso.decisions.some((decision) => decision.accepted)).toBe(true);
      expect(kiso.displaySegments).not.toEqual(
        before.rivers.find((river) => river.id === 'rv.kiso')!.displaySegments,
      );
      expect(kiso.points).toEqual(before.rivers.find((river) => river.id === 'rv.kiso')!.points);
      expect(kiso.segments).toEqual(
        before.rivers.find((river) => river.id === 'rv.kiso')!.segments,
      );
      const shinano = after.rivers.find((river) => river.id === 'rv.shinano')!;
      const oldShinano = before.rivers.find((river) => river.id === 'rv.shinano')!;
      expect(shinano.clipKind).toBe('certifiedDisplayCorridor');
      expect(
        shinano.decisions
          .filter((decision) => decision.accepted)
          .map((decision) => decision.sourceSegment),
      ).toEqual([1, 2]);
      expect(shinano.displaySegments).not.toEqual(oldShinano.displaySegments);
      expect(shinano.points).toEqual(oldShinano.points);
      expect(shinano.segments).toEqual(oldShinano.segments);
      for (const river of after.rivers.filter(
        (entry) => entry.id !== 'rv.kiso' && entry.id !== 'rv.shinano',
      ))
        expect(river).toEqual(before.rivers.find((entry) => entry.id === river.id));
      for (const key of [
        'ownedMaskGraphics',
        'ownedDisplayGraphics',
        'ownedTextures',
        'ownedSources',
        'ownedStyleListeners',
        'rgbaBytes',
      ] as const)
        expect(after[key]).toBe(before[key]);
      candidate.setStage('far');
      candidate.setStage('near');
      expect(candidate.getRiverMaterialDiagnostics()).toEqual(after);
    } finally {
      old.destroy();
      candidate.destroy();
    }
    expect(candidate.getRiverMaterialDiagnostics()).toMatchObject({
      ownedMaskGraphics: 0,
      ownedDisplayGraphics: 0,
      ownedTextures: 0,
      ownedSources: 0,
    });
  });

  it('retains actual road and bridge envelopes and covers painted nodes, without changing the graph', async () => {
    const model = selectMapStaticModel(await buildFullState());
    const before = JSON.stringify([...model.graph.nodes, ...model.graph.edges]);
    const raw = collectCoastFootprints(model.graph, [])!;
    const constraints = collectRiverDisplayConstraints(model.graph, coast)!;
    expect(constraints.obstacles).toHaveLength(raw.length);
    for (const [index, obstacle] of constraints.obstacles.entries()) {
      if (!obstacle.id.startsWith('node:')) {
        expect(obstacle).toEqual(raw[index]);
        continue;
      }
      expect(obstacle.radius).toBeGreaterThan(0);
      expect(obstacle.a).toEqual(raw[index]!.a);
      expect(obstacle.b).toEqual(raw[index]!.b);
    }
    const castleNode = [...model.graph.nodes.values()].find((node) => node.kind === 'castle')!;
    const castle = constraints.obstacles.find((entry) => entry.id === `node:${castleNode.id}`)!;
    for (const tier of ['main', 'branch'] as const) {
      const width =
        tier === 'main'
          ? CASTLE_NODE_GEOMETRY.paintedMainWidth
          : CASTLE_NODE_GEOMETRY.paintedBranchWidth;
      for (const spec of Object.values(CASTLE_BODY_ART_BY_TIER[tier])) {
        const placement = castleBodyArtPlacement(spec, width);
        const frame = spec.contentBounds;
        for (const x of [frame.x, frame.x + frame.width])
          for (const y of [frame.y, frame.y + frame.height])
            expect(
              Math.hypot(placement.x + x * placement.scale, placement.y + y * placement.scale),
            ).toBeLessThan(castle.radius);
      }
    }
    expect(JSON.stringify([...model.graph.nodes, ...model.graph.edges])).toBe(before);
    expect(Object.isFrozen(constraints)).toBe(true);
    expect(Object.isFrozen(constraints.obstacles)).toBe(true);
  });

  it('copies complete display coast rings into immutable world points', async () => {
    const model = selectMapStaticModel(await buildFullState());
    const input = structuredClone(coast);
    const constraints = collectRiverDisplayConstraints(model.graph, input)!;
    expect(constraints.boundaryPolygons).toEqual([
      [
        { x: 0, y: 0 },
        { x: 4096, y: 0 },
        { x: 4096, y: 4096 },
        { x: 0, y: 4096 },
      ],
    ]);
    input.polygons[0]!.points[0] = 9;
    expect(constraints.boundaryPolygons[0]![0]).toEqual({ x: 0, y: 0 });
    expect(Object.isFrozen(constraints.boundaryPolygons[0]![0])).toBe(true);
  });

  it('does not authorize new display water with absent, malformed or nonfinite coast geometry', async () => {
    const model = selectMapStaticModel(await buildFullState());
    for (const invalid of [
      [],
      [0, 0, 1, 1],
      [0, 0, 1, 0, 1, 1, 0],
      [0, 0, 1, 0, 1, Infinity],
      [0, 0, 4097, 0, 1, 1],
    ])
      expect(
        collectRiverDisplayConstraints(model.graph, {
          polygons: invalid.length ? [{ id: 'invalid', points: invalid }] : [],
        }),
      ).toBeNull();
  });

  it('falls back before allocating oversized boundary collections', async () => {
    const model = selectMapStaticModel(await buildFullState());
    expect(
      collectRiverDisplayConstraints(model.graph, {
        polygons: Array.from({ length: 17 }, (_, id) => ({
          id: String(id),
          points: coast.polygons[0]!.points,
        })),
      }),
    ).toBeNull();
    expect(
      collectRiverDisplayConstraints(model.graph, {
        polygons: [{ id: 'oversized', points: Array.from({ length: 8194 }, () => 0) }],
      }),
    ).toBeNull();
  });

  it('covers actual fallback body and warning paint at every castle variant and far scale', async () => {
    const model = selectMapStaticModel(await buildFullState());
    const constraints = collectRiverDisplayConstraints(model.graph, coast)!;
    const node = [...model.graph.nodes.values()].find((entry) => entry.kind === 'castle')!;
    const radius = constraints.obstacles.find((entry) => entry.id === `node:${node.id}`)!.radius;
    for (const tier of ['main', 'branch'] as const)
      for (const terrainKind of ['plain', 'mountain'] as const)
        for (const warning of ['none', 'threatened', 'critical'] as const) {
          const body = new Graphics(),
            status = new Graphics();
          const props = {
            pos: node.pos,
            tier,
            terrainKind,
            warning,
            colorIndex: 0,
            durability: 100,
            maxDurability: 100,
          };
          try {
            drawCastleBody(body, props);
            drawCastleWarning(status, props);
            for (const [graphics, scale] of [
              [body, tier === 'main' ? CASTLE_NODE_GEOMETRY.farMainBodyScale : 1],
              [status, 1],
            ] as const) {
              const bounds = graphics.getLocalBounds();
              for (const x of [bounds.minX, bounds.maxX])
                for (const y of [bounds.minY, bounds.maxY])
                  expect(Math.hypot(x, y) * scale).toBeLessThan(radius);
            }
          } finally {
            body.destroy({ context: true });
            status.destroy({ context: true });
          }
        }
  });
});
