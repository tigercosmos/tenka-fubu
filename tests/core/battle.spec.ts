import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch } from '../../src/core/commands/march';
import { validateCommand } from '../../src/core/commands/validate';
import { CoreError } from '../../src/core/errors';
import {
  advanceBattleTick,
  applyStartKassen,
  closeResolvedBattle,
  gatherKassenParticipants,
  generateBattlefield,
} from '../../src/core/systems/battle';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { canonicalStringify, stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { mulberry32Next } from '../../src/core/rng';
import type { Army, FieldCombat, GameState } from '../../src/core/state/gameState';
import type {
  ArmyId,
  BattleId,
  CastleId,
  ClanId,
  MapNodeId,
  OfficerId,
} from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function deploy(
  state: GameState,
  clanId: ClanId,
  originCastleId: CastleId,
  leaderId: OfficerId,
  targetNodeId: MapNodeId,
  soldiers: number,
): Army {
  const before = new Set(Object.keys(state.armies));
  applyMarch(
    state,
    {
      type: 'march',
      clanId,
      originCastleId,
      leaderId,
      deputyIds: [],
      soldiers,
      food: Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily * 30),
      targetNodeId,
    },
    () => undefined,
  );
  const id = Object.keys(state.armies).find((candidate) => !before.has(candidate)) as ArmyId;
  return state.armies[id]!;
}

function place(army: Army, nodeId: MapNodeId): void {
  army.posNodeId = nodeId;
  army.path = [nodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
}

function rngSeedWhere(predicate: (first: number, second: number) => boolean): number {
  for (let seed = 0; seed < 100_000; seed += 1) {
    const [first, next] = mulberry32Next(seed);
    const [second] = mulberry32Next(next);
    if (predicate(first, second)) return seed;
  }
  throw new Error('test RNG seed not found');
}

function prepareCombat(soldiers = 2_000): {
  state: GameState;
  combat: FieldCombat;
  alpha: Army;
  beta: Army;
} {
  const state = buildTinyState();
  state.castles[CASTLE_A2]!.soldiers = soldiers + 500;
  state.castles[CASTLE_B1]!.soldiers = soldiers + 500;
  const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, soldiers);
  const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, soldiers);
  place(alpha, CASTLE_A2);
  place(beta, CASTLE_A2);
  startFieldCombat(state, CASTLE_A2, [alpha.id], [beta.id]);
  return { state, combat: Object.values(state.fieldCombats)[0]!, alpha, beta };
}

function connected(
  combat: Pick<ReturnType<typeof generateBattlefield>, 'jins' | 'edges'>,
): boolean {
  const start = combat.jins[0]?.id;
  if (!start) return false;
  const visited = new Set([start]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const edge of combat.edges) {
      const other = edge.a === current ? edge.b : edge.b === current ? edge.a : undefined;
      if (other === undefined || visited.has(other)) continue;
      visited.add(other);
      queue.push(other);
    }
  }
  return visited.size === combat.jins.length;
}

describe('M5-1 startKassen and deterministic battlefield generation', () => {
  it('registers B1 validation and rejects a field combat below the troop threshold', () => {
    const { state, combat } = prepareCombat(700);
    expect(
      validateCommand(state, {
        type: 'startKassen',
        clanId: CLAN_ALPHA,
        fieldCombatId: combat.id,
      }),
    ).toEqual({ ok: false, reasonKey: 'cmd.reject.insufficientTroops' });
  });

  it('starts once, gathers only eligible exact-clan armies, and freezes the source FieldCombat', () => {
    const { state, combat, alpha, beta } = prepareCombat();
    const routedId = 'army.900001' as ArmyId;
    state.armies[routedId] = { ...alpha, id: routedId, status: 'routed', battleId: null };
    const siegingId = 'army.900002' as ArmyId;
    state.armies[siegingId] = { ...beta, id: siegingId, status: 'sieging', battleId: null };
    const otherCombatId = 'army.900003' as ArmyId;
    state.armies[otherCombatId] = {
      ...alpha,
      id: otherCombatId,
      status: 'engaged',
      battleId: null,
    };

    const participants = gatherKassenParticipants(state, combat, CLAN_ALPHA, CLAN_BETA);
    expect(participants.attacker.map((army) => army.id)).toEqual([alpha.id]);
    expect(participants.defender.map((army) => army.id)).toEqual([beta.id]);
    delete state.armies[routedId];
    delete state.armies[siegingId];
    delete state.armies[otherCombatId];
    expect(
      validateCommand(state, {
        type: 'startKassen',
        clanId: CLAN_ALPHA,
        fieldCombatId: combat.id,
      }),
    ).toEqual({ ok: true });

    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const battle = Object.values(state.battles)[0]!;
    expect(combat).toMatchObject({ kassenUsed: true, interrupted: true });
    expect(battle.units.map((unit) => unit.armyId).sort()).toEqual([alpha.id, beta.id].sort());
    expect(alpha.battleId).toBe(battle.id);
    expect(beta.battleId).toBe(battle.id);
    expect(validateState(state)).toEqual([]);
  });

  it('includes armies exactly two hops away and caps each side at the six strongest units', () => {
    const { state, combat, alpha } = prepareCombat();
    const eligibleIds: ArmyId[] = [];
    for (let index = 0; index < 7; index += 1) {
      const id = `army.91000${String(index)}` as ArmyId;
      state.armies[id] = {
        ...alpha,
        id,
        soldiers: 3_000 + index,
        posNodeId: DIST_A1X,
        path: [DIST_A1X],
        targetNodeId: DIST_A1X,
        status: 'holding',
        battleId: null,
      };
      eligibleIds.push(id);
    }
    const tooFarId = 'army.919999' as ArmyId;
    state.armies[tooFarId] = {
      ...alpha,
      id: tooFarId,
      soldiers: 9_999,
      posNodeId: 'node.out-of-range' as MapNodeId,
      path: ['node.out-of-range' as MapNodeId],
      targetNodeId: 'node.out-of-range' as MapNodeId,
      status: 'holding',
      battleId: null,
    };

    const participants = gatherKassenParticipants(state, combat, CLAN_ALPHA, CLAN_BETA);

    expect(participants.attacker).toHaveLength(BAL.kassenMaxUnitsPerSide);
    expect(participants.attacker.map((army) => army.id)).toEqual(eligibleIds.slice(1).reverse());
    expect(participants.attacker.some((army) => army.id === tooFarId)).toBe(false);
  });

  it('generates 1000 compliant connected layouts and consumes only rng.battle', () => {
    const { state, combat } = prepareCombat();
    const untouched = {
      dev: state.rng.dev,
      ai: state.rng.ai,
      event: state.rng.event,
      misc: state.rng.misc,
    };
    for (let index = 0; index < 1_000; index += 1) {
      const battle = generateBattlefield(state, combat, CLAN_ALPHA, CLAN_BETA);
      const jinIds = new Set(battle.jins.map((jin) => jin.id));
      const edgeKeys = battle.edges.map((edge) => [edge.a, edge.b].sort().join('|'));
      expect(battle.jins.length).toBeGreaterThanOrEqual(BAL.jinCountMin);
      expect(battle.jins.length).toBeLessThanOrEqual(BAL.jinCountMax);
      expect(jinIds.size).toBe(battle.jins.length);
      expect(new Set(edgeKeys).size).toBe(edgeKeys.length);
      expect(connected(battle)).toBe(true);
      expect(
        battle.edges.every((edge) => jinIds.has(edge.a) && jinIds.has(edge.b) && edge.a !== edge.b),
      ).toBe(true);
      for (const col of [1, 2, 3]) {
        expect(battle.jins.some((jin) => jin.col === col && !jin.isHonjin)).toBe(true);
      }
      expect(
        battle.jins
          .filter((jin) => jin.isHonjin)
          .map((jin) => [jin.col, jin.row])
          .sort(),
      ).toEqual([
        [0, 1],
        [4, 1],
      ]);
    }
    expect({
      dev: state.rng.dev,
      ai: state.rng.ai,
      event: state.rng.event,
      misc: state.rng.misc,
    }).toEqual(untouched);
  });

  it('is bit-exact for equal state and applies hill/river terrain modifiers', () => {
    const fixture = prepareCombat();
    const stateA = structuredClone(fixture.state);
    const stateB = structuredClone(fixture.state);
    const combatA = stateA.fieldCombats[fixture.combat.id]!;
    const combatB = stateB.fieldCombats[fixture.combat.id]!;
    const hillA = generateBattlefield(stateA, combatA, CLAN_ALPHA, CLAN_BETA, undefined, 'hill');
    const hillB = generateBattlefield(stateB, combatB, CLAN_ALPHA, CLAN_BETA, undefined, 'hill');
    expect(canonicalStringify(hillA)).toBe(canonicalStringify(hillB));
    expect(
      hillA.jins.filter((jin) => !jin.isHonjin && jin.defenseBonus === BAL.jinDefHill),
    ).toHaveLength(3);

    const river = generateBattlefield(
      fixture.state,
      fixture.combat,
      CLAN_ALPHA,
      CLAN_BETA,
      undefined,
      'river',
    );
    const crossing = river.edges.filter((edge) => {
      const a = river.jins.find((jin) => jin.id === edge.a)!;
      const b = river.jins.find((jin) => jin.id === edge.b)!;
      return Math.abs(a.col - b.col) === 1 && (a.col === 2 || b.col === 2);
    });
    expect(crossing.length).toBeGreaterThan(0);
    expect(crossing.every((edge) => edge.moveCost === 2)).toBe(true);
  });
});

describe('M5-2 deterministic battle tick and atomic writeback', () => {
  it('moves, deals simultaneous damage, captures flags, and accumulates saihai without touching Armies', () => {
    const { state, combat, alpha, beta } = prepareCombat();
    const battle = generateBattlefield(state, combat, CLAN_ALPHA, CLAN_BETA);
    state.battles[battle.id] = battle;
    combat.kassenUsed = true;
    combat.interrupted = true;
    for (const unit of battle.units) state.armies[unit.armyId]!.battleId = battle.id;
    const attacker = battle.units.find((unit) => unit.side === 'attacker')!;
    const defender = battle.units.find((unit) => unit.side === 'defender')!;
    attacker.delegated = false;
    defender.delegated = false;
    const targetJinId = battle.edges.find(
      (edge) => edge.a === attacker.jinId || edge.b === attacker.jinId,
    )!;
    const destination = targetJinId.a === attacker.jinId ? targetJinId.b : targetJinId.a;
    const armySnapshot = canonicalStringify(state.armies);
    const saihaiBefore = battle.saihai.attacker;

    advanceBattleTick(state, battle.id, [
      { kind: 'move', unitId: attacker.id, targetJinId: destination },
    ]);

    expect(attacker.jinId).toBe(destination);
    expect(battle.saihai.attacker).toBeGreaterThan(saihaiBefore);
    expect(canonicalStringify(state.armies)).toBe(armySnapshot);

    attacker.jinId = destination;
    defender.jinId = destination;
    attacker.moveTargetJinId = null;
    defender.moveTargetJinId = null;
    const attackerBefore = attacker.troops;
    const defenderBefore = defender.troops;
    advanceBattleTick(state, battle.id, [
      { kind: 'attack', unitId: attacker.id, targetUnitId: defender.id },
      { kind: 'attack', unitId: defender.id, targetUnitId: attacker.id },
    ]);
    expect(attacker.troops).toBeLessThan(attackerBefore);
    expect(defender.troops).toBeLessThan(defenderBefore);
    expect(alpha.soldiers).toBe(2_000);
    expect(beta.soldiers).toBe(2_000);
  });

  it('resolves B2 on total rout and writes Army/result/events/FieldCombat atomically', () => {
    const { state, combat, alpha, beta } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const battle = Object.values(state.battles)[0]!;
    const defender = battle.units.find((unit) => unit.side === 'defender')!;
    defender.morale = BAL.moraleBreakThreshold;
    const armyHashBefore = canonicalStringify(state.armies);

    const result = advanceBattleTick(state, battle.id);

    expect(result.resolved).toBe(true);
    expect(armyHashBefore).not.toBe(canonicalStringify(state.armies));
    expect(battle.result?.winnerSide).toBe('attacker');
    expect(alpha.battleId).toBeNull();
    expect(beta.battleId).toBeNull();
    expect(beta.status).toBe('routed');
    expect(state.fieldCombats[combat.id]).toBeUndefined();
    expect(state.meta.deferredEvents.some((event) => event.type === 'awe.triggered')).toBe(true);
    expect(state.meta.deferredEvents.some((event) => event.type === 'battle.ended')).toBe(true);
    expect(validateState(state)).toEqual([]);

    closeResolvedBattle(state, battle.id);
    expect(state.battles[battle.id]).toBeUndefined();
  });

  it('refuses to close an active battle before its result is acknowledged', () => {
    const { state, combat } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const battle = Object.values(state.battles)[0]!;

    expect(() => closeResolvedBattle(state, battle.id)).toThrow(CoreError);
    expect(state.battles[battle.id]).toBe(battle);
    expect(validateState(state)).toEqual([]);
  });

  it('resolves immediately when the enemy honjin flag falls', () => {
    const { state, combat } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const battle = Object.values(state.battles)[0]!;
    const attacker = battle.units.find((unit) => unit.side === 'attacker')!;
    const defender = battle.units.find((unit) => unit.side === 'defender')!;
    const defenderHonjin = battle.jins.find((jin) => jin.isHonjin && jin.col === 4)!;
    const retreatJinId = battle.edges
      .flatMap((edge) =>
        edge.a === defenderHonjin.id ? [edge.b] : edge.b === defenderHonjin.id ? [edge.a] : [],
      )
      .sort()[0]!;
    attacker.delegated = false;
    attacker.jinId = defenderHonjin.id;
    defender.jinId = retreatJinId;
    defenderHonjin.flagPower = 1;

    const result = advanceBattleTick(state, battle.id);

    expect(result.resolved).toBe(true);
    expect(battle.result?.winnerSide).toBe('attacker');
    expect(battle.result?.aweLevel).toBe('large');
    expect(battle.honjinFallenTick).toBe(1);
  });

  it('rolls defeated routed generals for capture after the death roll and disbands leaderless armies', () => {
    const { state, combat, beta } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    state.rng.misc = rngSeedWhere(
      (death, capture) =>
        death >= BAL.battleDeathChanceDefeatGeneral &&
        capture < BAL.battleCaptureChanceDefeatGeneral,
    );
    const battle = Object.values(state.battles)[0]!;
    battle.units.find((unit) => unit.side === 'defender')!.morale = BAL.moraleBreakThreshold;

    advanceBattleTick(state, battle.id);

    const general = state.officers[OFF_BETA_TAISHO]!;
    expect(general).toMatchObject({
      status: 'captive',
      capturedByClanId: CLAN_ALPHA,
      locationCastleId: CASTLE_A2,
      armyId: null,
    });
    expect(state.armies[beta.id]).toBeUndefined();
    expect(
      state.meta.deferredEvents.some(
        (event) => event.type === 'officer.captured' && event.officerId === general.id,
      ),
    ).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('applies the mutually exclusive defeated-general death roll before capture', () => {
    const { state, combat } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    state.rng.misc = rngSeedWhere((death) => death < BAL.battleDeathChanceDefeatGeneral);
    const battle = Object.values(state.battles)[0]!;
    battle.units.find((unit) => unit.side === 'defender')!.morale = BAL.moraleBreakThreshold;

    advanceBattleTick(state, battle.id);

    const general = state.officers[OFF_BETA_TAISHO]!;
    expect(general.status).toBe('dead');
    expect(general.capturedByClanId).toBeNull();
    expect(
      state.meta.deferredEvents.some(
        (event) => event.type === 'officer.died' && event.officerId === general.id,
      ),
    ).toBe(true);
    expect(
      state.meta.deferredEvents.some(
        (event) => event.type === 'officer.captured' && event.officerId === general.id,
      ),
    ).toBe(false);
    expect(validateState(state)).toEqual([]);
  });

  it('fully delegated armies always resolve no later than the 120-tick limit', () => {
    const { state, combat } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const battle = Object.values(state.battles)[0]!;
    for (const unit of battle.units) unit.delegated = true;

    for (let tick = 0; tick < BAL.kassenMaxTicks && battle.result === null; tick += 1) {
      advanceBattleTick(state, battle.id);
    }

    expect(battle.result).not.toBeNull();
    expect(battle.tick).toBeLessThanOrEqual(BAL.kassenMaxTicks);
  });

  it('applies delegation toggles before choosing that same tick AI order', () => {
    const { state, combat } = prepareCombat();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const battle = Object.values(state.battles)[0]!;
    const attacker = battle.units.find((unit) => unit.side === 'attacker')!;
    attacker.delegated = false;
    const initialJinId = attacker.jinId;

    advanceBattleTick(state, battle.id, [
      { kind: 'toggleDelegate', unitId: attacker.id, enabled: true },
    ]);

    expect(attacker.delegated).toBe(true);
    expect(attacker.jinId !== initialJinId || attacker.moveTargetJinId !== null).toBe(true);
  });

  it('keeps B8 tick hashes deterministic and leaves non-battle RNG streams untouched', () => {
    const fixture = prepareCombat();
    applyStartKassen(
      fixture.state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: fixture.combat.id },
      () => undefined,
    );
    const stateA = structuredClone(fixture.state);
    const stateB = structuredClone(fixture.state);
    const battleId = Object.keys(stateA.battles)[0] as BattleId;
    const rngBefore = {
      dev: stateA.rng.dev,
      ai: stateA.rng.ai,
      event: stateA.rng.event,
      misc: stateA.rng.misc,
    };
    const hashesA: string[] = [];
    const hashesB: string[] = [];
    for (let tick = 0; tick < 10; tick += 1) {
      advanceBattleTick(stateA, battleId);
      advanceBattleTick(stateB, battleId);
      hashesA.push(stateHash(stateA));
      hashesB.push(stateHash(stateB));
      if (stateA.battles[battleId]!.result !== null) break;
    }
    expect(hashesA).toEqual([
      '69297e23382a39d5',
      '07f4279aa58d91e0',
      '600bfd019f890078',
      'abcdb4aed6bd758c',
      'ca72d2f69e1c29fd',
      'ae9621e3ce1890b8',
      '26acf4d30f6fc8fb',
      '0029b000f2e06c10',
      '578cc5468ebd6164',
      'a7673cc192448535',
    ]);
    expect(hashesA).toEqual(hashesB);
    expect({
      dev: stateA.rng.dev,
      ai: stateA.rng.ai,
      event: stateA.rng.event,
      misc: stateA.rng.misc,
    }).toEqual(rngBefore);
  });
});
