import { describe, expect, it } from 'vitest';
import { getTransportPreview, getTransportPreviews } from '../../src/app/transportBridge';
import { applyTransport, validateTransport } from '../../src/core/commands/domesticCommands';
import { transportDaily, transportEstimatedDays } from '../../src/core/systems/transport';
import { canonicalStringify } from '../../src/core/state/serialize';
import type {
  CastleId,
  DistrictId,
  FacilityTypeId,
  PolicyId,
  RoadEdgeId,
} from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_A2X,
} from '../fixtures/tiny';

describe('authoritative read-only transport preview', () => {
  it('includes only reachable distinct owned destinations, detached and fresh without mutations', () => {
    const state = buildTinyState();
    const before = canonicalStringify(state);
    const rows = getTransportPreviews(state, CLAN_ALPHA, CASTLE_A1);
    expect(rows.map((row) => row.toCastleId)).toEqual([CASTLE_A2]);
    expect(rows[0]!.nodeIds[0]).toBe(CASTLE_A1);
    expect(rows[0]!.nodeIds.at(-1)).toBe(CASTLE_A2);
    expect(rows[0]!.nodeNames.at(-1)).toBe(state.castles[CASTLE_A2]!.name);
    (rows[0]!.nodeIds as unknown as string[]).push('detached');
    expect(canonicalStringify(state)).toBe(before);
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    expect(getTransportPreviews(state, CLAN_ALPHA, CASTLE_A1)).toEqual([]);
    expect(getTransportPreviews(null, CLAN_ALPHA, CASTLE_A1)).toEqual([]);
    expect(getTransportPreviews(state, CLAN_ALPHA, CASTLE_B1)).toEqual([]);
    expect(getTransportPreviews(state, CLAN_ALPHA, 'missing' as CastleId)).toEqual([]);
    expect(getTransportPreview(state, CLAN_ALPHA, CASTLE_A1, CASTLE_A1)).toBeNull();
  });

  it.each(['land', 'sea'] as const)(
    'ETA matches real daily transport on fractional %s edges and policies',
    (type) => {
      const state = buildTinyState();
      // Connected synthetic route with a real district-to-district sea-capable segment.
      delete state.roads['road.a1-a2' as RoadEdgeId];
      const crossId = 'road.preview-cross' as RoadEdgeId;
      state.roads[crossId] = {
        id: crossId,
        a: DIST_A1X,
        b: DIST_A2X,
        type: 'land',
        grade: 1,
        baseDays: 1,
      };
      for (const edge of Object.values(state.roads)) {
        edge.baseDays = 0.7;
        edge.grade = 2;
      }
      if (type === 'sea') {
        // Synthetic presentation/timing case; sea legality uses real port district endpoints only.
        for (const edge of Object.values(state.roads)) {
          if (
            state.districts[edge.a as keyof typeof state.districts] &&
            state.districts[edge.b as keyof typeof state.districts]
          ) {
            edge.type = 'sea';
            state.districts[edge.a as keyof typeof state.districts]!.isPort = true;
            state.districts[edge.b as keyof typeof state.districts]!.isPort = true;
          }
        }
        state.castles[CASTLE_A1]!.facilities.push('fac.minato' as FacilityTypeId);
      }
      state.policies[CLAN_ALPHA]!.active.push('pol.tenmasei' as PolicyId);
      const preview = getTransportPreview(state, CLAN_ALPHA, CASTLE_A1, CASTLE_A2)!;
      const cmd = {
        type: 'transport' as const,
        clanId: CLAN_ALPHA,
        fromCastleId: CASTLE_A1,
        toCastleId: CASTLE_A2,
        soldiers: 0,
        food: 1,
        gold: 0,
      };
      expect(validateTransport(state, cmd)).toEqual({ ok: true });
      applyTransport(state, cmd);
      let days = 0;
      while (Object.keys(state.transports).length && days < 100) {
        days += 1;
        transportDaily(state);
      }
      expect(days).toBe(preview.estimatedDays);
      expect(Object.keys(state.transports)).toHaveLength(0);
    },
  );

  it('does not promise destinations behind hostile passability even when all roads remain connected', () => {
    const state = buildTinyState();
    delete state.roads['road.a1-a2' as RoadEdgeId];
    const id = 'road.blocked' as RoadEdgeId;
    state.roads[id] = { id, a: CASTLE_A1, b: CASTLE_B1, type: 'land', grade: 1, baseDays: 1 };
    expect(getTransportPreviews(state, CLAN_ALPHA, CASTLE_A1)).toEqual([]);
  });

  it('matches actual first-pair movement edge when pathfinding selects a cheaper parallel edge', () => {
    const state = buildTinyState();
    const first = state.roads['road.a1-a2' as RoadEdgeId]!;
    first.baseDays = 5;
    const id = 'road.parallel-cheaper' as RoadEdgeId;
    state.roads[id] = { ...first, id, grade: 3, baseDays: 0.2 };
    const preview = getTransportPreview(state, CLAN_ALPHA, CASTLE_A1, CASTLE_A2)!;
    expect(preview.estimatedDays).toBe(5);
    const cmd = {
      type: 'transport' as const,
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 0,
      food: 1,
      gold: 0,
    };
    applyTransport(state, cmd);
    for (let day = 1; day < 5; day += 1) {
      transportDaily(state);
      expect(Object.keys(state.transports)).toHaveLength(1);
    }
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
  });

  it('keeps a synthetic 30-edge two-thirds route ETA equal to actual 20-day arrival', () => {
    const state = buildTinyState();
    for (let i = 0; i < 23; i += 1) {
      const id = `dist.long.${i}` as DistrictId;
      state.districts[id] = { ...structuredClone(state.districts[DIST_A1X]!), id };
    }
    const path = [CASTLE_A1, ...(Object.keys(state.districts).sort() as DistrictId[]), CASTLE_A2];
    const nodes = [...path, CASTLE_B1];
    state.roads = Object.fromEntries(
      nodes.slice(1).map((node, i) => {
        const id = `road.long.${i}` as RoadEdgeId;
        return [id, { id, a: nodes[i]!, b: node, type: 'land', grade: 1, baseDays: 1 }];
      }),
    );
    state.policies[CLAN_ALPHA]!.active.push('pol.tenmasei' as PolicyId);
    const preview = getTransportPreview(state, CLAN_ALPHA, CASTLE_A1, CASTLE_A2)!;
    expect(preview.nodeIds).toHaveLength(31);
    expect(preview.estimatedDays).toBe(20);
    applyTransport(state, {
      type: 'transport',
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 0,
      food: 1,
      gold: 0,
    });
    for (let day = 1; day < 20; day += 1) {
      transportDaily(state);
      expect(Object.keys(state.transports)).toHaveLength(1);
    }
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
    expect(transportEstimatedDays(20.0000001)).toBe(21);
    expect(transportEstimatedDays(Number.EPSILON)).toBe(1);
  });
});
