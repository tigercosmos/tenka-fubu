import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch } from '../../src/core/commands/march';
import type { Army, GameState } from '../../src/core/state/gameState';
import type {
  ArmyId,
  BattleId,
  CastleId,
  ClanId,
  MapNodeId,
  OfficerId,
} from '../../src/core/state/ids';
import { canonicalStringify } from '../../src/core/state/serialize';
import { advanceBattleTick, applyStartKassen } from '../../src/core/systems/battle';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

// Same fixture, commands and placement as battle.spec.ts prepareCombat()/B8.
// Deliberately separate from its historical fixed-hash assertion: this proves
// current repeatability/stream isolation, not compatibility with that baseline.
function deploy(
  state: GameState,
  clanId: ClanId,
  originCastleId: CastleId,
  leaderId: OfficerId,
  targetNodeId: MapNodeId,
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
      soldiers: 2_000,
      food: Math.ceil(2_000 * BAL.fieldFoodPerSoldierDaily * 30),
      targetNodeId,
    },
    () => undefined,
  );
  const id = Object.keys(state.armies).find((candidate) => !before.has(candidate)) as ArmyId;
  return state.armies[id]!;
}

function prepareB8(): { state: GameState; battleId: BattleId } {
  const state = buildTinyState();
  state.castles[CASTLE_A2]!.soldiers = 2_500;
  state.castles[CASTLE_B1]!.soldiers = 2_500;
  const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
  const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
  for (const army of [alpha, beta]) {
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.status = 'holding';
  }
  startFieldCombat(state, CASTLE_A2, [alpha.id], [beta.id]);
  const combat = Object.values(state.fieldCombats)[0]!;
  applyStartKassen(
    state,
    { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
    () => undefined,
  );
  return { state, battleId: Object.keys(state.battles)[0] as BattleId };
}

const nonBattleStreams = (state: GameState) => ({
  dev: state.rng.dev,
  ai: state.rng.ai,
  event: state.rng.event,
  misc: state.rng.misc,
});

describe('independent B8 current-state repeatability and RNG isolation', () => {
  it('compares full canonical states after every authoritative B8 tick, including tick1', () => {
    const fixture = prepareB8();
    const stateA = structuredClone(fixture.state);
    const stateB = structuredClone(fixture.state);
    const initial = canonicalStringify(fixture.state);
    let ticks = 0;
    const observations: string[] = [];
    for (let tick = 0; tick < 10; tick++) {
      advanceBattleTick(stateA, fixture.battleId);
      advanceBattleTick(stateB, fixture.battleId);
      const snapshot = canonicalStringify(stateA);
      expect(snapshot, `B8 tick${tick + 1}: full-state repeatability`).toBe(
        canonicalStringify(stateB),
      );
      observations.push(snapshot);
      ticks++;
      if (stateA.battles[fixture.battleId]!.result !== null) break;
    }
    expect(ticks).toBe(10);
    expect(observations[0]).not.toBe(initial);
    expect(new Set(observations).size).toBe(10);
    expect(canonicalStringify(fixture.state)).toBe(initial);
  });

  it('checks every non-battle stream at each B8 tick without a fixed-hash prerequisite', () => {
    const fixture = prepareB8();
    const state = structuredClone(fixture.state);
    const before = nonBattleStreams(state);
    let ticks = 0;
    for (let tick = 0; tick < 10; tick++) {
      advanceBattleTick(state, fixture.battleId);
      expect(nonBattleStreams(state), `B8 tick${tick + 1}: dev/ai/event/misc`).toEqual(before);
      ticks++;
      if (state.battles[fixture.battleId]!.result !== null) break;
    }
    expect(ticks).toBe(10);
  });

  it('does not erase a non-battle RNG mutation from either independent observation', () => {
    const { state, battleId } = prepareB8();
    advanceBattleTick(state, battleId);
    const changed = structuredClone(state);
    changed.rng.misc = (changed.rng.misc + 1) >>> 0;
    expect(nonBattleStreams(changed)).not.toEqual(nonBattleStreams(state));
    expect(canonicalStringify(changed)).not.toBe(canonicalStringify(state));
  });
});
