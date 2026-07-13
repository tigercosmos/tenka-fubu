import { describe, expect, it } from 'vitest';
import { applyAwe, judgeBattleAwe } from '../../src/core/systems/awe';
import type { BattleSide, BattleState, BattleUnit } from '../../src/core/state/gameState';
import type {
  ArmyId,
  BattleId,
  ClanId,
  DistrictId,
  MapNodeId,
  OfficerId,
  RoadEdgeId,
} from '../../src/core/state/ids';
import { buildTinyState, CASTLE_B1, CLAN_ALPHA, CLAN_BETA, DIST_B1X } from '../fixtures/tiny';

function unit(side: BattleSide, initial: number, troops: number): BattleUnit {
  const suffix = side === 'attacker' ? 'a' : 'd';
  return {
    id: `bu.${suffix}`,
    armyId: `army.00000${suffix === 'a' ? '1' : '2'}` as ArmyId,
    side,
    generalId: `officer.${suffix}` as OfficerId,
    troops,
    battleInitialTroops: initial,
    morale: 80,
    jinId: `jin.${side === 'attacker' ? '0' : '4'}-1`,
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: false,
    routed: false,
    exited: false,
    strategyStatus: 'engaged',
  };
}

function battle(defenderTroops: number, honjinFallenTick: number | null = null): BattleState {
  return {
    id: 'battle.000001' as BattleId,
    fieldCombatId: 'fc.test',
    nodeId: 'castle.test' as MapNodeId,
    terrain: 'plain',
    attackerClanId: 'clan.attacker' as ClanId,
    defenderClanId: 'clan.defender' as ClanId,
    jins: [],
    edges: [],
    units: [unit('attacker', 1_000, 900), unit('defender', 1_000, defenderTroops)],
    tick: 35,
    saihai: { attacker: 5, defender: 5 },
    honjinFallenTick,
    result: null,
  };
}

describe('judgeBattleAwe（07 §3.10）', () => {
  it('returns small for an ordinary victory below the medium kill ratio', () => {
    expect(judgeBattleAwe(battle(501), 'attacker')).toBe('small');
  });

  it('returns medium at the canonical kill threshold or for a late honjin fall', () => {
    expect(judgeBattleAwe(battle(500), 'attacker')).toBe('medium');
    expect(judgeBattleAwe(battle(900, 41), 'attacker')).toBe('medium');
  });

  it('returns large at the canonical kill threshold or for a fast honjin fall', () => {
    expect(judgeBattleAwe(battle(300), 'attacker')).toBe('large');
    expect(judgeBattleAwe(battle(900, 40), 'attacker')).toBe('large');
  });

  it('derives losses from the actual losing side', () => {
    const state = battle(900);
    state.units[0]!.troops = 300;
    expect(judgeBattleAwe(state, 'defender')).toBe('large');
  });

  it('large awe flips losing districts through exactly three road hops', () => {
    const state = buildTinyState();
    const template = state.districts[DIST_B1X]!;
    for (const district of Object.values(state.districts)) district.ownerClanId = CLAN_ALPHA;
    const districtIds = Array.from(
      { length: 5 },
      (_, index) => `district.awe-${String(index)}` as DistrictId,
    );
    for (const [index, id] of districtIds.entries()) {
      state.districts[id] = {
        ...structuredClone(template),
        id,
        name: `威風測試郡${String(index)}`,
        castleId: CASTLE_B1,
        ownerClanId: CLAN_BETA,
      };
    }
    for (let index = 0; index < districtIds.length - 1; index += 1) {
      const id = `road.awe-${String(index)}` as RoadEdgeId;
      state.roads[id] = {
        id,
        a: districtIds[index]!,
        b: districtIds[index + 1]!,
        type: 'land',
        grade: 1,
        baseDays: 1,
      };
    }
    const linkId = 'road.awe-link' as RoadEdgeId;
    state.roads[linkId] = {
      id: linkId,
      a: DIST_B1X,
      b: districtIds[0]!,
      type: 'land',
      grade: 1,
      baseDays: 1,
    };

    const [event] = applyAwe(
      state,
      'large',
      districtIds[0]!,
      CLAN_ALPHA,
      CLAN_BETA,
      'battle.awe-range',
    );

    expect(event).toMatchObject({
      type: 'awe.triggered',
      level: 'large',
      flippedDistrictIds: districtIds.slice(0, 4),
    });
    expect(districtIds.slice(0, 4).map((id) => state.districts[id]!.ownerClanId)).toEqual([
      CLAN_ALPHA,
      CLAN_ALPHA,
      CLAN_ALPHA,
      CLAN_ALPHA,
    ]);
    expect(state.districts[districtIds[4]!]!.ownerClanId).toBe(CLAN_BETA);
  });
});
