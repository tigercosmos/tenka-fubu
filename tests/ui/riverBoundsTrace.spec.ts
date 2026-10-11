import { describe, expect, it } from 'vitest';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createWaterFeatures, probeRiverRuntimeIdentity } from '@ui/map/terrain/terrainDraw';
import {
  createRiverSurfaceMaterial,
  inspectRiverBounds,
  probeRiverSurfaceBoundsPair,
  type RiverMaterialFactoryStage,
} from '@ui/map/terrain/riverSurfaceMaterial';

const factoryStages: readonly RiverMaterialFactoryStage[] = [
  'beforePixels',
  'afterPixels',
  'beforeSource',
  'afterSource',
  'beforeTexture',
  'afterTexture',
  'beforeMatrix',
  'afterMatrix',
  'beforeReturn',
];

describe('river bounds boundary evidence (installed Pixi CPU, not a native remount fix)', () => {
  it.each(['before', 'after'] as const)(
    'runs the same two actual routes with rich inspection only %s both calls',
    (timing) => {
      const events: string[] = [];
      const terrain = buildTerrainPack();
      const rivers = terrain.rivers.map((river) => ({
        ...river,
        points: river.points.map((point, index) =>
          river.id === 'rv.chikugo' && index === 0
            ? new Proxy(point, {
                getPrototypeOf(target) {
                  events.push('rich');
                  return Object.getPrototypeOf(target) as object;
                },
              })
            : point,
        ),
      }));
      const retained = (firstId: string, secondId: string) => {
        events.push('retained');
        return probeRiverSurfaceBoundsPair(
          rivers.find((river) => river.id === firstId)!.points,
          4,
          rivers.find((river) => river.id === secondId)!.points,
          4,
        );
      };
      const direct: typeof probeRiverSurfaceBoundsPair = (...args) => {
        events.push('canonical');
        return probeRiverSurfaceBoundsPair(...args);
      };
      const result = probeRiverRuntimeIdentity(
        rivers,
        rivers,
        direct,
        retained,
        'rv.chikugo',
        'rv.fuji',
        'retained-first',
        timing,
      )!;
      expect(events.filter((event) => event !== 'rich')).toEqual(['retained', 'canonical']);
      expect(events.indexOf('rich') < events.indexOf('retained')).toBe(timing === 'before');
      expect(events.lastIndexOf('rich') > events.indexOf('canonical')).toBe(timing === 'after');
      expect(result.inspectionTiming).toBe(timing);
      expect(timing === 'before' ? result.identityBefore : result.identityAfter).not.toBeNull();
      expect(timing === 'before' ? result.identityAfter : result.identityBefore).toBeNull();
      expect(result.primitiveBefore.firstRiverReferenceEqual).toBe(true);
      expect(result.primitiveBefore.firstPointsReferenceEqual).toBe(true);
      expect(result.primitiveBefore.pointReferencesEqual).toBe(true);
      expect(result.primitiveBefore.coordinateValuesEqual).toBe(true);
      expect(result.primitiveBefore.coordinateValuesFinite).toBe(true);
      expect(result.retained).toEqual(result.canonical);
      expect(result.retained!.before.tuple).toEqual([656, 3418, 86, 153]);
      expect(result.retained!.after).toEqual(result.retained!.before);
    },
  );
  it('compares actual canonical/retained input identity without changing retained materials', () => {
    const terrain = buildTerrainPack();
    const water = createWaterFeatures(terrain.rivers, terrain.lakes);
    try {
      const before = water.getRiverMaterialDiagnostics();
      for (const order of ['retained-first', 'canonical-first'] as const) {
        const result = water.getRiverRuntimeIdentityProbe(
          'rv.chikugo',
          'rv.fuji',
          order,
          terrain.rivers,
          probeRiverSurfaceBoundsPair,
        )!;
        expect(result.identityBefore!.probeImportEqualsDirect).toBe(true);
        for (const river of result.identityBefore!.rivers) {
          expect(river.riverReferenceEqualsCanonical).toBe(true);
          expect(river.pointsReferenceEqualsCanonical).toBe(true);
          expect(river.pointReferencesEqual).toBe(true);
          expect(river.retainedWidth).toBe(4);
          expect(river.canonicalWidth).toBe(4);
          expect(river.retained).toEqual(river.canonical);
          expect(river.retained.arrayPrototypeIsNative).toBe(true);
          expect(river.retained.points.every((point) => point.prototypeIsNative)).toBe(true);
        }
        expect(result.retained).toEqual(result.canonical);
        expect(result.retained!.before.tuple).toEqual([656, 3418, 86, 153]);
        expect(result.retained!.after).toEqual(result.retained!.before);
      }
      expect(water.getRiverMaterialDiagnostics()).toEqual(before);
      expect(
        water.getRiverRuntimeIdentityProbe(
          'missing',
          'rv.fuji',
          'retained-first',
          terrain.rivers,
          probeRiverSurfaceBoundsPair,
        ),
      ).toBeNull();
    } finally {
      water.destroy();
    }
    expect(
      water.getRiverRuntimeIdentityProbe(
        'rv.chikugo',
        'rv.fuji',
        'retained-first',
        terrain.rivers,
        probeRiverSurfaceBoundsPair,
      ),
    ).toBeNull();
  });

  it.each(['retained-first', 'canonical-first'] as const)(
    'records %s call order and distinguishes equal-valued but distinct inputs/imports',
    (order) => {
      const terrain = buildTerrainPack();
      const canonical = terrain.rivers.map((river) => ({
        ...river,
        points: river.points.map((point) => ({ ...point })),
      }));
      const calls: string[] = [];
      const direct: typeof probeRiverSurfaceBoundsPair = (...args) => {
        calls.push('canonical');
        return probeRiverSurfaceBoundsPair(...args);
      };
      const retained = (firstId: string, secondId: string) => {
        calls.push('retained');
        const first = terrain.rivers.find((river) => river.id === firstId)!;
        const second = terrain.rivers.find((river) => river.id === secondId)!;
        return probeRiverSurfaceBoundsPair(first.points, 4, second.points, 4);
      };
      const result = probeRiverRuntimeIdentity(
        terrain.rivers,
        canonical,
        direct,
        retained,
        'rv.chikugo',
        'rv.fuji',
        order,
      )!;
      expect(calls).toEqual(
        order === 'retained-first' ? ['retained', 'canonical'] : ['canonical', 'retained'],
      );
      expect(result.identityBefore!.probeImportEqualsDirect).toBe(false);
      expect(
        result.identityBefore!.rivers.every(
          (river) =>
            !river.riverReferenceEqualsCanonical &&
            !river.pointsReferenceEqualsCanonical &&
            !river.pointReferencesEqual,
        ),
      ).toBe(true);
      expect(result.retained).toEqual(result.canonical);
    },
  );
  it('probes two pure producers on demand without material resources or returned pixel buffers', () => {
    const terrain = buildTerrainPack();
    const first = terrain.rivers.find((river) => river.id === 'rv.chikugo')!;
    const second = terrain.rivers.find((river) => river.id === 'rv.fuji')!;
    const direct = probeRiverSurfaceBoundsPair(first.points, 4, second.points, 4)!;
    expect(direct.before.tuple).toEqual([656, 3418, 86, 153]);
    expect(direct.after).toEqual(direct.before);
    expect(direct.second.tuple).toEqual([2343, 2758, 39, 135]);
    expect(direct.sourceScalars).toEqual(direct.before.tuple);
    expect(direct.secondSourceScalars).toEqual(direct.second.tuple);
    expect(direct.firstEqualsOriginal).toBe(true);
    expect(direct.firstEqualsSecond).toBe(false);
    expect(direct.firstRgbaBytes).toBeLessThanOrEqual(131072);
    expect(direct.secondRgbaBytes).toBeLessThanOrEqual(131072);
    expect(direct).not.toHaveProperty('pixels');
    expect(direct).not.toHaveProperty('texture');
    expect(direct).not.toHaveProperty('matrix');
    expect(probeRiverSurfaceBoundsPair([], 4, second.points, 4)).toBeNull();
    const water = createWaterFeatures(terrain.rivers, terrain.lakes);
    try {
      const before = water.getRiverMaterialDiagnostics();
      expect(water.getRiverPureBoundsProbe(first.id, second.id)).toEqual(direct);
      expect(water.getRiverPureBoundsProbe('missing', second.id)).toBeNull();
      expect(water.getRiverMaterialDiagnostics()).toEqual(before);
    } finally {
      water.destroy();
    }
    expect(water.getRiverPureBoundsProbe(first.id, second.id)).toBeNull();
  });
  it('observes the same previous object across the next factory without changing either material', () => {
    const rivers = buildTerrainPack().rivers;
    const chikugo = rivers.find((river) => river.id === 'rv.chikugo')!;
    const fuji = rivers.find((river) => river.id === 'rv.fuji')!;
    const previous = createRiverSurfaceMaterial(chikugo.points, 4)!;
    const reference = previous.bounds;
    const snapshots: {
      stage: RiverMaterialFactoryStage;
      bounds: ReturnType<typeof inspectRiverBounds>;
      sameReference: boolean;
    }[] = [];
    const next = createRiverSurfaceMaterial(fuji.points, 4, undefined, undefined, (stage) => {
      snapshots.push({
        stage,
        bounds: inspectRiverBounds(previous.bounds),
        sameReference: previous.bounds === reference,
      });
    })!;
    try {
      expect(snapshots.map((snapshot) => snapshot.stage)).toEqual(factoryStages);
      for (const snapshot of snapshots) {
        expect(snapshot.bounds.tuple).toEqual([656, 3418, 86, 153]);
        expect(snapshot.bounds.descriptorValues).toEqual(snapshot.bounds.tuple);
        expect(JSON.parse(snapshot.bounds.nativeJSON)).toEqual(reference);
        expect(snapshot.bounds.frozen && snapshot.sameReference).toBe(true);
      }
      expect(previous.bounds).not.toBe(next.bounds);
      expect(next.bounds).toEqual({ x: 2343, y: 2758, width: 39, height: 135 });
      expect(previous.matrix.tx).toBe(656);
      expect(next.matrix.tx).toBe(2343);
      expect(previous.getDiagnostics().ownedSources).toBe(1);
      expect(next.getDiagnostics().ownedSources).toBe(1);
    } finally {
      next.destroy();
      previous.destroy();
    }
    expect(previous.getDiagnostics().ownedSources).toBe(0);
    expect(next.getDiagnostics().ownedSources).toBe(0);
  });
  it('captures primitive construction values independently from the retained object and live matrix', () => {
    const material = createRiverSurfaceMaterial(
      [
        { x: 10, y: 20 },
        { x: 70, y: 120 },
      ],
      4,
    )!;
    try {
      const before = material.getBoundsTrace(material.bounds);
      expect(before.sourceScalars).toEqual([8, 18, 64, 104]);
      expect(before.surfaceBounds).toEqual(before.sourceScalars);
      expect(before.materialBounds).toEqual(before.sourceScalars);
      expect(before.surfaceEqualsMaterial).toBe(true);
      expect(before.surfaceFrozen).toBe(true);
      expect(before.materialFrozen).toBe(true);
      expect(before.matrixAtConstruction).toEqual([
        64 / material.width,
        0,
        0,
        104 / material.height,
        8,
        18,
      ]);
      expect(before.matrixLive).toEqual(before.matrixAtConstruction);
      for (const checkpoint of [
        before.surfaceAtAllocation,
        before.surfaceAfterMatrix,
        before.surfaceLive,
      ]) {
        expect(checkpoint.tuple).toEqual(before.sourceScalars);
        expect(JSON.parse(checkpoint.nativeJSON)).toEqual(material.bounds);
        expect(checkpoint.descriptorValues).toEqual(before.sourceScalars);
        expect(
          checkpoint.descriptorFlags.every(
            (flag) => flag.data && !flag.writable && !flag.configurable && flag.enumerable,
          ),
        ).toBe(true);
      }
      expect(before.boundsAfterMatrixEqualsLiteral && before.surfaceLiveEqualsLiteral).toBe(true);
      material.matrix.tx += 1; // Test-only public matrix mutation; evidence must not repair it.
      const after = material.getBoundsTrace(material.bounds);
      expect(after.matrixAtConstruction).toEqual(before.matrixAtConstruction);
      expect(after.matrixLive[4]).toBe(9);
      expect(after.sourceScalars).toEqual(before.sourceScalars);
      expect(Object.isFrozen(after.matrixLive)).toBe(true);
    } finally {
      material.destroy();
    }
    expect(material.getDiagnostics().ownedSources).toBe(0);
  });

  it('records the exact supplied getter output without another getter, normalization or producer mutation', () => {
    const terrain = buildTerrainPack();
    const water = createWaterFeatures(terrain.rivers, terrain.lakes);
    try {
      const before = water.getRiverMaterialDiagnostics();
      const producerOnly = water.getRiverBoundsTrace();
      expect(producerOnly.every((r) => r.getterBounds === null)).toBe(true);
      const trace = water.getRiverBoundsTrace(before.rivers);
      expect(trace).toHaveLength(10);
      for (const row of trace) {
        const river = before.rivers.find((r) => r.id === row.id)!;
        const pad = ({ 1: 2, 2: 4, 3: 7 } as const)[river.widthClass] / 2;
        const xs = river.points.map((p) => p.x),
          ys = river.points.map((p) => p.y);
        const expected = [
          Math.min(...xs) - pad,
          Math.min(...ys) - pad,
          Math.max(...xs) - Math.min(...xs) + 2 * pad,
          Math.max(...ys) - Math.min(...ys) + 2 * pad,
        ];
        for (const key of [
          'sourceScalars',
          'surfaceBounds',
          'materialBounds',
          'entryBounds',
          'getterBounds',
        ] as const)
          expect(row[key]).toEqual(expected);
        expect(row.surfaceEqualsMaterial).toBe(true);
        expect(row.materialEqualsEntry).toBe(true);
        expect(row.sharedEntryBoundsWith).toEqual([]);
        expect(row.entryFrozen && row.getterFrozen).toBe(true);
        expect(row.terrainAtRetention?.tuple).toEqual(expected);
        expect(row.terrainAtRetention?.descriptorValues).toEqual(expected);
        expect(row.retentionEqualsMaterial).toBe(true);
        for (const checkpoint of [row.terrainBeforePaint, row.terrainAfterPaint]) {
          expect(checkpoint?.tuple).toEqual(expected);
          expect(checkpoint?.descriptorValues).toEqual(expected);
          expect(JSON.parse(checkpoint!.nativeJSON)).toEqual(river.bounds);
        }
        expect(row.checkpointIdentities.every(Boolean)).toBe(true);
        if (row.nextMaterialId !== null) {
          expect(row.terrainNextFactoryStages.map((snapshot) => snapshot.stage)).toEqual(
            factoryStages,
          );
          for (const snapshot of row.terrainNextFactoryStages) {
            expect(snapshot.bounds.tuple).toEqual(expected);
            expect(snapshot.bounds.descriptorValues).toEqual(expected);
            expect(JSON.parse(snapshot.bounds.nativeJSON)).toEqual(river.bounds);
            expect(snapshot.sameReference).toBe(true);
          }
          for (const checkpoint of [row.terrainAtNextLoop, row.terrainBeforeNextFactory]) {
            expect(checkpoint?.tuple).toEqual(expected);
            expect(checkpoint?.descriptorValues).toEqual(expected);
            expect(JSON.parse(checkpoint!.nativeJSON)).toEqual(river.bounds);
          }
          expect(row.checkpointIdentities).toHaveLength(4);
          expect(row.terrainAfterNextMaterial?.tuple).toEqual(expected);
          expect(row.terrainAfterNextMaterial?.descriptorValues).toEqual(expected);
          expect(row.afterNextEqualsRetention).toBe(true);
        }
        expect(Object.isFrozen(row.entryBounds)).toBe(true);
      }
      const chikugo = before.rivers.find((r) => r.id === 'rv.chikugo')!;
      const fuji = before.rivers.find((r) => r.id === 'rv.fuji')!;
      const corrupted = before.rivers.map((r) =>
        r === chikugo ? { ...r, bounds: fuji.bounds } : r,
      );
      const evidence = water.getRiverBoundsTrace(corrupted).find((r) => r.id === chikugo.id)!;
      expect(evidence.getterBounds).toEqual([2343, 2758, 39, 135]);
      expect(evidence.sourceScalars).toEqual([656, 3418, 86, 153]);
      expect(evidence.materialBounds).toEqual(evidence.sourceScalars);
      expect(evidence.entryBounds).toEqual(evidence.sourceScalars);
      expect(evidence.nextMaterialId).toBe('rv.fuji');
      expect(evidence.terrainBeforePaint?.tuple).toEqual(evidence.sourceScalars);
      expect(evidence.terrainAfterPaint?.tuple).toEqual(evidence.sourceScalars);
      expect(evidence.terrainAtNextLoop?.tuple).toEqual(evidence.sourceScalars);
      expect(evidence.terrainBeforeNextFactory?.tuple).toEqual(evidence.sourceScalars);
      expect(evidence.terrainAfterNextMaterial?.tuple).toEqual(evidence.sourceScalars);
      expect(evidence.surfaceLive?.descriptorValues).toEqual(evidence.sourceScalars);
      expect(water.getRiverMaterialDiagnostics()).toEqual(before);
      expect(water.getRiverBoundsTrace(before.rivers)).toEqual(trace);
    } finally {
      water.destroy();
    }
    expect(water.getRiverMaterialDiagnostics().ownedTextures).toBe(0);
  });
});
