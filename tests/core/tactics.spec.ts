import { describe, expect, it } from 'vitest';
import tacticsJson from '../../src/data/scenarios/s1560/tactics.json';
import { zTacticsFile } from '../../src/data/schemas/tactic';
import type { Army, BattleState, BattleUnit, GameState } from '../../src/core/state/gameState';
import type {
  ArmyId,
  BattleId,
  ClanId,
  OfficerId,
  TacticId,
  TraitId,
} from '../../src/core/state/ids';
import {
  TACTIC_IDS,
  TACTICS,
  applyBattleTactic,
  decrementTacticTimers,
  fireArrowTargetUnitId,
  forcedAttackTargetUnitId,
  getAvailableTacticIds,
  hasCavalryTactic,
  isTacticImmobile,
  loadTacticCatalog,
  tacticAttackMultiplier,
  tacticDamageTakenMultiplier,
  tacticMoraleFloor,
  validateBattleTactic,
  type BattleTacticOrder,
  type TacticValidationResult,
} from '../../src/core/tactics';
import {
  buildMiniState,
  CASTLE_A1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO_B,
  OFF_ALPHA_TAISHO_C,
  OFF_BETA_LORD,
} from '../fixtures/mini';

const BATTLE_ID = 'battle.000001' as BattleId;
const ACTOR_ARMY_ID = 'army.000001' as ArmyId;
const TARGET_ARMY_ID = 'army.000002' as ArmyId;
const ALLY_ARMY_ID = 'army.000003' as ArmyId;

const tid = (id: string): TacticId => id as TacticId;
const trait = (id: string): TraitId => id as TraitId;

function makeArmy(
  id: ArmyId,
  clanId: ClanId,
  leaderId: OfficerId,
  deputyIds: OfficerId[] = [],
): Army {
  return {
    id,
    clanId,
    leaderId,
    deputyIds,
    soldiers: 1_000,
    initialTroops: 1_000,
    food: 1_000,
    morale: 70,
    status: 'engaged',
    mission: 'conquer',
    originCastleId: CASTLE_A1,
    targetNodeId: CASTLE_A1,
    path: [CASTLE_A1],
    pathCursor: 0,
    posNodeId: CASTLE_A1,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    battleId: BATTLE_ID,
    siegeId: null,
    autoReturn: true,
    corpsId: null,
    pursuitEligibleArmyIds: [],
  };
}

function makeUnit(
  id: string,
  armyId: ArmyId,
  side: 'attacker' | 'defender',
  generalId: OfficerId,
  jinId: string,
): BattleUnit {
  return {
    id,
    armyId,
    side,
    generalId,
    troops: 900,
    battleInitialTroops: 1_000,
    morale: 70,
    jinId,
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

interface TacticFixture {
  state: GameState;
  battle: BattleState;
  actor: BattleUnit;
  ally: BattleUnit;
  target: BattleUnit;
  farTarget: BattleUnit;
}

function buildFixture(unlockAll = true): TacticFixture {
  const state = buildMiniState({ seed: 42 });
  state.armies[ACTOR_ARMY_ID] = makeArmy(ACTOR_ARMY_ID, CLAN_ALPHA, OFF_ALPHA_LORD, [
    OFF_ALPHA_TAISHO_B,
    OFF_ALPHA_TAISHO_C,
  ]);
  state.armies[TARGET_ARMY_ID] = makeArmy(TARGET_ARMY_ID, CLAN_BETA, OFF_BETA_LORD);
  state.armies[ALLY_ARMY_ID] = makeArmy(ALLY_ARMY_ID, CLAN_ALPHA, OFF_ALPHA_TAISHO_B);

  if (unlockAll) {
    state.officers[OFF_ALPHA_LORD]!.traits = [
      trait('trait.gunshin'),
      trait('trait.benzetsu'),
      trait('trait.gunryaku'),
      trait('trait.fudou'),
    ];
    state.officers[OFF_ALPHA_TAISHO_B]!.traits = [
      trait('trait.hizeme'),
      trait('trait.kiba'),
      trait('trait.teppo'),
      trait('trait.kesshi'),
    ];
    state.officers[OFF_ALPHA_TAISHO_C]!.traits = [trait('trait.roukou'), trait('trait.iryou')];
  } else {
    state.officers[OFF_ALPHA_LORD]!.traits = [];
    state.officers[OFF_ALPHA_TAISHO_B]!.traits = [];
    state.officers[OFF_ALPHA_TAISHO_C]!.traits = [];
  }

  const actor = makeUnit('bu.actor', ACTOR_ARMY_ID, 'attacker', OFF_ALPHA_LORD, 'jin.a');
  const ally = makeUnit('bu.ally', ALLY_ARMY_ID, 'attacker', OFF_ALPHA_TAISHO_B, 'jin.a');
  const target = makeUnit('bu.target', TARGET_ARMY_ID, 'defender', OFF_BETA_LORD, 'jin.mid');
  const farTarget = makeUnit('bu.far', TARGET_ARMY_ID, 'defender', OFF_BETA_LORD, 'jin.far');
  const battle: BattleState = {
    id: BATTLE_ID,
    fieldCombatId: 'fc.test-90',
    nodeId: CASTLE_A1,
    terrain: 'plain',
    attackerClanId: CLAN_ALPHA,
    defenderClanId: CLAN_BETA,
    jins: [],
    edges: [
      { a: 'jin.a', b: 'jin.mid', moveCost: 1 },
      { a: 'jin.mid', b: 'jin.b', moveCost: 1 },
      { a: 'jin.b', b: 'jin.far', moveCost: 1 },
    ],
    units: [actor, ally, target, farTarget],
    tick: 0,
    saihai: { attacker: 20, defender: 20 },
    honjinFallenTick: null,
    result: null,
  };
  state.battles[BATTLE_ID] = battle;
  return { state, battle, actor, ally, target, farTarget };
}

function order(tacticId: string, targetUnitId: string | null = null): BattleTacticOrder {
  return { kind: 'tactic', unitId: 'bu.actor', tacticId: tid(tacticId), targetUnitId };
}

function rejectionReason(result: TacticValidationResult): string | null {
  return result.ok ? null : result.reason;
}

describe('canonical 12-tactic catalog', () => {
  it('locks ids, costs, kinds, durations, cooldowns, targets, traits, and numeric modifiers', () => {
    expect(TACTIC_IDS).toHaveLength(12);
    expect(
      TACTIC_IDS.map((id) => {
        const def = TACTICS[id]!;
        return [
          def.id,
          def.saihaiCost,
          def.kind,
          def.category,
          def.durationTicks,
          def.cooldownTicks,
          def.needsTarget,
          def.unlockTraitId,
          def.atkMult,
          def.dmgTakenMult,
          def.immobile,
        ];
      }),
    ).toEqual([
      ['tac.charge', 5, 'buff', 'charge', 3, 8, false, null, 1.5, 1.2, false],
      ['tac.volley', 4, 'instant', 'ranged', 0, 8, true, null, 1, 1, false],
      ['tac.inspire', 4, 'instant', 'valor', 0, 8, false, 'trait.gunshin', 1, 1, false],
      ['tac.taunt', 3, 'debuff', 'intrigue', 4, 8, true, 'trait.benzetsu', 0.8, 1, false],
      ['tac.disrupt', 4, 'debuff', 'intrigue', 3, 8, true, 'trait.gunryaku', 0.7, 1, true],
      ['tac.hold', 3, 'buff', 'valor', 4, 8, false, 'trait.fudou', 1, 0.6, true],
      ['tac.fire-arrow', 5, 'buff', 'ranged', 3, 8, true, 'trait.hizeme', 1.3, 1, false],
      ['tac.cavalry', 6, 'buff', 'charge', 2, 8, false, 'trait.kiba', 1.6, 1, false],
      ['tac.triple-volley', 8, 'instant', 'ranged', 0, 10, true, 'trait.teppo', 1, 1, false],
      ['tac.last-stand', 6, 'buff', 'valor', 5, 8, false, 'trait.kesshi', 1.8, 1.3, false],
      ['tac.pin', 3, 'debuff', 'intrigue', 3, 8, true, 'trait.roukou', 1, 1, true],
      ['tac.heal', 5, 'instant', 'intrigue', 0, 8, false, 'trait.iryou', 1, 1, false],
    ]);
  });

  it('loads scenario names only when all canonical ids and unlock traits match', () => {
    const parsed = zTacticsFile.parse(tacticsJson);
    const loaded = loadTacticCatalog(parsed.tactics);
    expect(loaded.map(({ id, name }) => [id, name])).toEqual([
      ['tac.charge', '突擊'],
      ['tac.volley', '齊射'],
      ['tac.inspire', '鼓舞'],
      ['tac.taunt', '挑撥'],
      ['tac.disrupt', '攪亂'],
      ['tac.hold', '堅守'],
      ['tac.fire-arrow', '火矢'],
      ['tac.cavalry', '騎突'],
      ['tac.triple-volley', '鐵砲三段'],
      ['tac.last-stand', '背水'],
      ['tac.pin', '牽制'],
      ['tac.heal', '治療'],
    ]);
    expect(() =>
      loadTacticCatalog([
        ...parsed.tactics.slice(0, -1),
        { ...parsed.tactics.at(-1)!, unlockTraitId: 'trait.wrong' },
      ]),
    ).toThrow(/tac\.heal/);
  });

  it('exposes only defaults without traits and includes deputy-unlocked tactics deterministically', () => {
    const locked = buildFixture(false);
    expect(getAvailableTacticIds(locked.state, locked.actor)).toEqual([
      tid('tac.charge'),
      tid('tac.volley'),
    ]);
    const unlocked = buildFixture(true);
    expect(getAvailableTacticIds(unlocked.state, unlocked.actor)).toEqual(TACTIC_IDS);
  });
});

describe('battle tactic validation', () => {
  it('checks shared saihai, cooldown, unlock, target side/state, and same-or-adjacent range', () => {
    const { state, battle, actor, ally, target, farTarget } = buildFixture();
    expect(validateBattleTactic(state, battle, order('tac.volley', target.id)).ok).toBe(true);
    expect(rejectionReason(validateBattleTactic(state, battle, order('tac.volley')))).toBe(
      'targetRequired',
    );
    expect(
      rejectionReason(validateBattleTactic(state, battle, order('tac.charge', target.id))),
    ).toBe('targetForbidden');
    expect(rejectionReason(validateBattleTactic(state, battle, order('tac.volley', ally.id)))).toBe(
      'targetFriendly',
    );
    expect(
      rejectionReason(validateBattleTactic(state, battle, order('tac.volley', farTarget.id))),
    ).toBe('targetOutOfRange');
    target.routed = true;
    expect(
      rejectionReason(validateBattleTactic(state, battle, order('tac.volley', target.id))),
    ).toBe('targetRouted');
    target.routed = false;
    actor.tacticCooldowns['tac.volley'] = 1;
    expect(
      rejectionReason(validateBattleTactic(state, battle, order('tac.volley', target.id))),
    ).toBe('cooldown');
    actor.tacticCooldowns = {};
    battle.saihai.attacker = 3;
    expect(
      rejectionReason(validateBattleTactic(state, battle, order('tac.volley', target.id))),
    ).toBe('insufficientSaihai');
    const locked = buildFixture(false);
    expect(
      rejectionReason(validateBattleTactic(locked.state, locked.battle, order('tac.inspire'))),
    ).toBe('tacticLocked');
  });
});

describe('tactic effects', () => {
  it('tac.charge applies ×1.5 attack, ×1.2 damage taken for 3 ticks', () => {
    const { state, battle, actor } = buildFixture();
    expect(applyBattleTactic(state, battle, order('tac.charge')).applied).toBe(true);
    expect(tacticAttackMultiplier(actor)).toBe(1.5);
    expect(tacticDamageTakenMultiplier(actor)).toBe(1.2);
    expect(actor.activeTactics).toEqual([
      { tacticId: 'tac.charge', remainingTicks: 3, targetUnitId: null },
    ]);
    expect(actor.tacticCooldowns['tac.charge']).toBe(8);
    expect(battle.saihai.attacker).toBe(15);
  });

  it('tac.volley deals one 1.2× unreturned hit immediately', () => {
    const { state, battle, target } = buildFixture();
    const result = applyBattleTactic(state, battle, order('tac.volley', target.id), {
      attackPower: 1_000,
    });
    expect(result).toMatchObject({ applied: true, damageDealt: 24 });
    expect(target.troops).toBe(876);
  });

  it('tac.inspire gives self and same-jin allies +15 morale, capped at 100', () => {
    const { state, battle, actor, ally, target } = buildFixture();
    actor.morale = 80;
    ally.morale = 90;
    target.morale = 60;
    const result = applyBattleTactic(state, battle, order('tac.inspire'));
    expect(result).toMatchObject({ applied: true, moraleGained: 25 });
    expect([actor.morale, ally.morale, target.morale]).toEqual([95, 100, 60]);
  });

  it('tac.taunt forces the target to attack its source and applies ×0.8 attack for 4 ticks', () => {
    const { state, battle, actor, target } = buildFixture();
    applyBattleTactic(state, battle, order('tac.taunt', target.id));
    expect(forcedAttackTargetUnitId(target)).toBe(actor.id);
    expect(tacticAttackMultiplier(target)).toBe(0.8);
    expect(target.activeTactics[0]?.remainingTicks).toBe(4);
  });

  it('tac.disrupt clears ongoing tactics, immobilizes, and applies ×0.7 attack for 3 ticks', () => {
    const { state, battle, target } = buildFixture();
    target.activeTactics = [
      { tacticId: tid('tac.charge'), remainingTicks: 2, targetUnitId: null },
      { tacticId: tid('tac.taunt'), remainingTicks: 2, targetUnitId: 'bu.ally' },
    ];
    applyBattleTactic(state, battle, order('tac.disrupt', target.id));
    expect(target.activeTactics).toEqual([
      { tacticId: 'tac.disrupt', remainingTicks: 3, targetUnitId: 'bu.actor' },
    ]);
    expect(isTacticImmobile(target)).toBe(true);
    expect(tacticAttackMultiplier(target)).toBe(0.7);
  });

  it('tac.hold applies ×0.6 damage taken and prevents movement for 4 ticks', () => {
    const { state, battle, actor } = buildFixture();
    applyBattleTactic(state, battle, order('tac.hold'));
    expect(tacticDamageTakenMultiplier(actor)).toBe(0.6);
    expect(isTacticImmobile(actor)).toBe(true);
    expect(actor.activeTactics[0]?.remainingTicks).toBe(4);
  });

  it('tac.fire-arrow applies ×1.3 attack and retains its target for 30 flag damage per tick', () => {
    const { state, battle, actor, target } = buildFixture();
    applyBattleTactic(state, battle, order('tac.fire-arrow', target.id));
    expect(tacticAttackMultiplier(actor)).toBe(1.3);
    expect(fireArrowTargetUnitId(actor)).toBe(target.id);
    expect(TACTICS[tid('tac.fire-arrow')]!.effect).toEqual({
      type: 'fireArrow',
      flagDamagePerTick: 30,
    });
  });

  it('tac.cavalry applies ×1.6 attack and permits move-before-attack for 2 ticks', () => {
    const { state, battle, actor } = buildFixture();
    applyBattleTactic(state, battle, order('tac.cavalry'));
    expect(tacticAttackMultiplier(actor)).toBe(1.6);
    expect(hasCavalryTactic(actor)).toBe(true);
    expect(actor.activeTactics[0]?.remainingTicks).toBe(2);
  });

  it('tac.triple-volley deals three separate normal-power hits and uses cooldown 10', () => {
    const { state, battle, actor, target } = buildFixture();
    const result = applyBattleTactic(state, battle, order('tac.triple-volley', target.id), {
      attackPower: 1_000,
    });
    expect(result).toMatchObject({ applied: true, damageDealt: 60 });
    expect(target.troops).toBe(840);
    expect(actor.tacticCooldowns['tac.triple-volley']).toBe(10);
  });

  it('tac.last-stand applies ×1.8 attack, ×1.3 damage taken, and morale floor 31', () => {
    const { state, battle, actor } = buildFixture();
    applyBattleTactic(state, battle, order('tac.last-stand'));
    expect(tacticAttackMultiplier(actor)).toBe(1.8);
    expect(tacticDamageTakenMultiplier(actor)).toBe(1.3);
    expect(tacticMoraleFloor(actor)).toBe(31);
    expect(actor.activeTactics[0]?.remainingTicks).toBe(5);
  });

  it('tac.pin prevents target movement for 3 ticks without preventing attacks', () => {
    const { state, battle, target } = buildFixture();
    applyBattleTactic(state, battle, order('tac.pin', target.id));
    expect(isTacticImmobile(target)).toBe(true);
    expect(tacticAttackMultiplier(target)).toBe(1);
    expect(target.activeTactics[0]?.remainingTicks).toBe(3);
  });

  it('tac.heal restores at most 5% of battle-start troops and never exceeds the initial count', () => {
    const { state, battle, actor } = buildFixture();
    actor.troops = 930;
    expect(applyBattleTactic(state, battle, order('tac.heal'))).toMatchObject({
      applied: true,
      troopsHealed: 50,
    });
    expect(actor.troops).toBe(980);
  });

  it('replaces self buffs, refreshes same debuffs, and decrements timers deterministically', () => {
    const { state, battle, actor, target } = buildFixture();
    applyBattleTactic(state, battle, order('tac.charge'));
    applyBattleTactic(state, battle, order('tac.hold'));
    expect(actor.activeTactics.map((active) => active.tacticId)).toEqual(['tac.hold']);
    applyBattleTactic(state, battle, order('tac.taunt', target.id));
    target.activeTactics[0]!.remainingTicks = 1;
    actor.tacticCooldowns['tac.taunt'] = 0;
    applyBattleTactic(state, battle, order('tac.taunt', target.id));
    expect(target.activeTactics.filter((active) => active.tacticId === 'tac.taunt')).toHaveLength(
      1,
    );
    expect(target.activeTactics[0]?.remainingTicks).toBe(4);

    decrementTacticTimers(battle);
    expect(actor.activeTactics[0]?.remainingTicks).toBe(3);
    expect(actor.tacticCooldowns['tac.charge']).toBe(7);
    expect(actor.tacticCooldowns['tac.hold']).toBe(7);
    expect(target.activeTactics[0]?.remainingTicks).toBe(3);
  });
});
