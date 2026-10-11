import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import { advanceDay } from '../../src/core/systems';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { RoadEdgeId, TraitId, TaimeiId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_A1Y,
  DIST_A2X,
  DIST_B1X,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

// Controlled valid long road/port corridor; positions arise only from queued
// commands and actual daily movement, never from inserted armies/midpoints.
function fixture(sea = false, warmup = 0) {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.prestige = BAL.policySlotPrestige;
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 20;
  state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 20;
  state.officers[OFF_ALPHA_LORD]!.traits = [];
  if (sea) {
    state.districts[DIST_A1X]!.isPort = true;
    state.districts[DIST_B1X]!.isPort = true;
    const id = 'road.tenmasei-sea' as RoadEdgeId;
    state.roads[id] = { id, a: DIST_A1X, b: DIST_B1X, type: 'sea', grade: 1, baseDays: 20 };
  }
  expect(validateState(state)).toEqual([]);
  for (let day = 0; day < warmup; day++) tick(state);
  const cmd: Command = {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 120,
    targetNodeId: sea ? DIST_B1X : CASTLE_B1,
  };
  tick(state, cmd);
  const army = Object.values(state.armies)[0]!;
  if (sea) {
    for (let i = 0; i < 5 && army.posNodeId !== DIST_A1X; i++) tick(state);
    expect(army.posNodeId).toBe(DIST_A1X);
  } else expect(army.edgeProgressDays).toBe(1);
  return { state, army };
}
function tick(state: ReturnType<typeof buildTinyState>, command?: Command) {
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  if (command) {
    expect(validateCommand(state, command)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day);
  }
  const result = advanceDay(state, queue.drain());
  expect(result.events.filter((e) => e.type === 'command.rejected')).toEqual([]);
  expect(validateState(state)).toEqual([]);
  return result;
}
const enact = { type: 'enactPolicy', clanId: CLAN_ALPHA, policyId: 'pol.tenmasei' } as Command;

it('applies actual queued enact/revoke to an entered land edge on that same normal day', () => {
  const { state, army } = fixture();
  let before = army.edgeProgressDays;
  tick(state, enact);
  expect(army.edgeProgressDays - before).toBeCloseTo(1.1, 12);
  expect(army.edgeCostDays).toBe(20);
  before = army.edgeProgressDays;
  tick(state, { type: 'revokePolicy', clanId: CLAN_ALPHA, policyId: 'pol.tenmasei' } as Command);
  expect(army.edgeProgressDays - before).toBeCloseTo(1, 12);
});
it.each([false, true])(
  'does not borrow enemy policy and does not modify sea movement (sea=%s)',
  (sea) => {
    const { state, army } = fixture(sea);
    state.clans[CLAN_BETA]!.prestige = BAL.policySlotPrestige;
    tick(state, { ...enact, clanId: CLAN_BETA });
    let before = army.edgeProgressDays;
    tick(state);
    expect(army.edgeProgressDays - before).toBeCloseTo(1, 12);
    if (sea) {
      before = army.edgeProgressDays;
      tick(state, enact);
      expect(army.edgeProgressDays - before).toBeCloseTo(1, 12);
    }
  },
);
it('composes the primary trait, low morale and invoked taimei before the ordinary speed clamp', () => {
  const { state, army } = fixture();
  tick(state, enact);
  state.officers[OFF_ALPHA_LORD]!.traits = ['trait.shinsoku' as TraitId];
  state.clans[CLAN_ALPHA]!.prestige = BAL.taimeiUnlockPrestige['taimei.shippu-jinrai'];
  tick(state, {
    type: 'invokeTaimei',
    clanId: CLAN_ALPHA,
    taimeiId: 'taimei.shippu-jinrai' as TaimeiId,
  });
  army.morale = BAL.marchLowMoraleThreshold - 1;
  const before = army.edgeProgressDays;
  const rng = structuredClone(state.rng);
  militaryMovementSystem(state);
  const expected = Math.min(
    BAL.marchSpeedMax,
    Math.max(
      BAL.marchSpeedMin,
      (1 + BAL.traitShinsoku) *
        BAL.marchLowMoraleFactor *
        (1 + BAL.taimeiShippuSpeedBonus) *
        BAL.polTenmaseiMarchSpeedMult,
    ),
  );
  expect(army.edgeProgressDays - before).toBeCloseTo(expected, 12);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
  army.morale = BAL.marchLowMoraleThreshold + 1;
  const reverseBefore = army.edgeProgressDays;
  tick(state, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId: army.id });
  const capped = Math.min(
    BAL.marchSpeedMax,
    (1 + BAL.traitShinsoku) *
      (1 + BAL.taimeiShippuSpeedBonus) *
      BAL.retreatSpeedFactor *
      BAL.polTenmaseiMarchSpeedMult,
  );
  expect(reverseBefore - army.edgeProgressDays).toBeCloseTo(capped, 12);
});
it('removes an unpaid policy before movement on the actual next monthly boundary', () => {
  const { state, army } = fixture(false, 28);
  expect(state.time.day % 30).toBe(29);
  for (const district of Object.values(state.districts)) district.commerce = 0;
  state.clans[CLAN_ALPHA]!.gold = 60;
  expect(validateState(state)).toEqual([]);
  const before = army.edgeProgressDays;
  const result = tick(state, enact);
  expect(state.time.day % 30).toBe(0);
  expect(
    result.events.some((e) => e.type === 'policy.autoRevoked' && e.policyId === 'pol.tenmasei'),
  ).toBe(true);
  expect(state.policies[CLAN_ALPHA]!.active).not.toContain('pol.tenmasei');
  expect(army.edgeProgressDays - before).toBeCloseTo(1, 12);
});
it('uses the same land factor on an actual recalled reverse partial edge and native continuation', () => {
  const { state, army } = fixture();
  tick(state);
  tick(state);
  tick(state);
  const before = army.edgeProgressDays;
  tick(state, enact);
  expect(army.edgeProgressDays - before).toBeCloseTo(1.1, 12);
  const reverseBefore = army.edgeProgressDays;
  tick(state, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId: army.id });
  expect(army.reversingEdgeEndNodeId).toBe(CASTLE_A2);
  expect(reverseBefore - army.edgeProgressDays).toBeCloseTo(BAL.retreatSpeedFactor * 1.1, 12);
  const decoded = decodeSave(encodeSave(state, 42, []));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  tick(state);
  tick(decoded.saveFile.state);
  expect(decoded.saveFile.state).toEqual(state);
});
it('applies the factor to a core-routed reverse land army without changing movement RNG', () => {
  const { state, army } = fixture();
  tick(state, enact);
  tick(state);
  tick(state);
  army.morale = BAL.moraleBreakThreshold;
  const before = army.edgeProgressDays;
  const rng = structuredClone(state.rng);
  const events = militaryMovementSystem(state);
  expect(events.some((e) => e.type === 'army.routed')).toBe(true);
  expect(army.status).toBe('routed');
  expect(before - army.edgeProgressDays).toBeCloseTo(
    BAL.marchLowMoraleFactor * BAL.retreatSpeedFactor * 1.1,
    12,
  );
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
});

function mixedCorridor(reverse = false) {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.prestige = BAL.policySlotPrestige;
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  state.officers[OFF_ALPHA_LORD]!.traits = [];
  state.districts[DIST_A1X]!.isPort = true;
  state.districts[DIST_A2X]!.isPort = true;
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 100;
  const portExit = Object.values(state.roads).find((r) => r.a === CASTLE_A2 && r.b === DIST_A2X)!;
  portExit.baseDays = 10;
  if (reverse) {
    const land = Object.values(state.roads).find((r) => r.a === CASTLE_A1 && r.b === DIST_A1Y)!;
    land.a = DIST_A1X;
    land.baseDays = 1.5;
  }
  const id = 'road.tenmasei-mixed' as RoadEdgeId;
  state.roads[id] = {
    id,
    a: DIST_A1X,
    b: DIST_A2X,
    type: 'sea',
    grade: 1,
    baseDays: reverse ? 10 : 1.5,
  };
  expect(validateState(state)).toEqual([]);
  tick(state, enact);
  tick(state, {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 120,
    targetNodeId: reverse ? DIST_A1Y : CASTLE_A2,
  });
  return { state, army: Object.values(state.armies)[0]! };
}
it('conserves the land-paid residual into sea, then sea-start residual into land without a second multiplier', () => {
  const { state, army } = mixedCorridor();
  expect(army.path).toEqual([CASTLE_A1, DIST_A1X, DIST_A2X, CASTLE_A2]);
  expect(army.posNodeId).toBe(DIST_A1X);
  // 04 §5.4: one paid budget per day; land start pays 1.1, first land costs 1.
  expect(army.edgeProgressDays).toBeCloseTo(1.1 - 1, 12);
  expect(army.edgeCostDays).toBeCloseTo(1.5 + BAL.seaEmbarkDays, 12);
  tick(state);
  tick(state);
  expect(army.edgeProgressDays).toBeCloseTo(2.1, 12);
  tick(state);
  expect(army.posNodeId).toBe(DIST_A2X);
  // Starting on sea pays 1, not 1.1. Its paid remainder carries unchanged to land.
  expect(army.edgeProgressDays).toBeCloseTo(3.1 - (1.5 + BAL.seaEmbarkDays), 12);
  expect(validateState(state)).toEqual([]);
});
it('conserves the already-paid reverse land budget into a new sea tail', () => {
  const { state, army } = mixedCorridor(true);
  expect(army.posNodeId).toBe(DIST_A1X);
  expect(army.edgeProgressDays).toBeCloseTo(0.1, 12);
  tick(state);
  expect(army.edgeProgressDays).toBeCloseTo(1.2, 12);
  tick(state, {
    type: 'setArmyTarget',
    clanId: CLAN_ALPHA,
    armyId: army.id,
    targetNodeId: DIST_A2X,
  });
  expect(army.reversingEdgeEndNodeId).toBe(DIST_A1Y);
  expect(army.edgeProgressDays).toBeCloseTo(0.1, 12);
  tick(state);
  expect(army.reversingEdgeEndNodeId).toBeUndefined();
  expect(army.posNodeId).toBe(DIST_A1X);
  expect(army.edgeProgressDays).toBeCloseTo(1.1 - 0.1, 12);
  expect(army.edgeCostDays).toBe(10 + BAL.seaEmbarkDays);
  expect(validateState(state)).toEqual([]);
});
