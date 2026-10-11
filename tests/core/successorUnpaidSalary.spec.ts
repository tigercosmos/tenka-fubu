import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { RoadEdgeId } from '../../src/core/state/ids';
import { advanceDay } from '../../src/core/systems';
import { armyPhysicalLeg } from '../../src/core/systems/armyReroute';
import {
  applyUnpaidSalaryPenalty,
  loyaltyTarget,
  salaryPayees,
} from '../../src/core/systems/officers';
import { calendarToDay } from '../../src/core/systems/time';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_LORD,
  OFF_BETA_BUSHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function fixture() {
  // Declared controlled unit world, NOT an unchanged-mini or permanent replay fixture.
  const state = buildTinyState({ startDay: calendarToDay(1560, 4, 30), seed: 42 });
  const refuge = state.castles[CASTLE_A2]!;
  refuge.ownerClanId = CLAN_BETA;
  refuge.lordId = OFF_BETA_BUSHO;
  for (const id of refuge.districtIds) state.districts[id]!.ownerClanId = CLAN_BETA;
  state.officers[OFF_ALPHA_TAISHO]!.locationCastleId = CASTLE_A1;
  state.officers[OFF_BETA_BUSHO]!.locationCastleId = CASTLE_A2;
  state.officers[OFF_BETA_BUSHO]!.kinship = 'kin';
  state.officers[OFF_BETA_TAISHO]!.locationCastleId = CASTLE_A2;
  state.clans[CLAN_BETA]!.gold = 0;
  for (const district of Object.values(state.districts))
    if (district.ownerClanId === CLAN_BETA) district.commerce = 0;
  const target = state.castles[CASTLE_B1]!;
  target.soldiers = 100;
  target.morale = 1;
  target.durability = 1;
  state.roads['road.salary-frontier' as RoadEdgeId] = {
    id: 'road.salary-frontier' as RoadEdgeId,
    a: CASTLE_A1,
    b: CASTLE_B1,
    baseDays: 1,
    grade: 1,
    type: 'land',
  };
  expect(validateState(state)).toEqual([]);
  return state;
}

function journey(native = false) {
  let state = fixture();
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 1500,
    food: 1000,
    targetNodeId: CASTLE_B1,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  expect(salaryPayees(state, CLAN_BETA).map((o) => o.id)).toContain(OFF_BETA_BUSHO);
  queue.enqueue(command, state.time.day);
  if (native) {
    const decoded = decodeSave(encodeSave(state, 0, queue.snapshotPlayerCommands()));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.saveFile.pendingCommands).toEqual([command]);
    state = decoded.saveFile.state;
    queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    for (const pending of decoded.saveFile.pendingCommands) queue.enqueue(pending, state.time.day);
  }
  let newLeaderBeforeOfficers:
    { loyalty: number; regular: number; regularTarget: number } | undefined;
  const envelopes = queue.drain();
  const result = advanceDay(state, envelopes, {
    now: () => {
      // Read-only step-boundary observer, not a benchmark and never a mutation seam.
      if (!newLeaderBeforeOfficers && state.clans[CLAN_BETA]!.leaderId === OFF_BETA_BUSHO) {
        newLeaderBeforeOfficers = {
          loyalty: state.officers[OFF_BETA_BUSHO]!.loyalty,
          regular: state.officers[OFF_BETA_TAISHO]!.loyalty,
          regularTarget: loyaltyTarget(state, state.officers[OFF_BETA_TAISHO]!),
        };
      }
      return 0;
    },
  });
  expect(result.appliedCommands).toEqual(envelopes);
  const unpaid = result.events.find(
    (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_BETA,
  );
  expect(unpaid).toBeDefined();
  if (!unpaid || unpaid.type !== 'economy.upkeepUnpaid')
    throw new Error('Expected Beta unpaid-salary event');
  expect(unpaid.clanId).toBe(CLAN_BETA);
  expect(unpaid.payeeIds).toContain(OFF_BETA_BUSHO);
  expect(unpaid.payeeIds).toContain(OFF_BETA_TAISHO);
  expect(result.events).toContainEqual(
    expect.objectContaining({
      type: 'clan.succession',
      clanId: CLAN_BETA,
      deceasedId: OFF_BETA_LORD,
      heirId: OFF_BETA_BUSHO,
    }),
  );
  expect(result.events).toContainEqual(
    expect.objectContaining({ type: 'siege.ended', fallen: true, castleId: CASTLE_B1 }),
  );
  expect(newLeaderBeforeOfficers).toBeDefined();
  expect(newLeaderBeforeOfficers!.loyalty).toBe(100);
  expect(state.officers[OFF_BETA_BUSHO]!.loyalty).toBe(100);
  const regular = newLeaderBeforeOfficers!.regular;
  const drift = Math.max(
    -BAL.loyaltyDriftPerMonth,
    Math.min(BAL.loyaltyDriftPerMonth, newLeaderBeforeOfficers!.regularTarget - regular),
  );
  expect(state.officers[OFF_BETA_TAISHO]!.loyalty).toBe(
    regular + drift - BAL.unpaidSalaryLoyaltyPenalty,
  );
  expect(state.clans[CLAN_BETA]!.gold).toBe(0);
  expect(validateState(state)).toEqual([]);
  expect(armyPhysicalLeg(Object.values(state.armies)[0]!)).toBeNull();
  const next = advanceDay(state, []);
  expect(validateState(state)).toEqual([]);
  return { state, events: [result.events, next.events] };
}

describe('current successor is exempt from the former monthly salary-payee penalty', () => {
  it('preserves loyalty100 after actual month-opening conquest appoints an unpaid former payee', () => {
    expect(journey().state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_BUSHO);
  });
  it('preserves real pending march native continuation, events and RNG', () => {
    const first = journey();
    const restored = journey(true);
    const persistent = (state: typeof first.state) => {
      const copy = structuredClone(state);
      copy.ai.intentLog = [];
      return copy;
    };
    expect(persistent(restored.state)).toEqual(persistent(first.state));
    expect(restored.events).toEqual(first.events);
    expect(restored.state.rng).toEqual(first.state.rng);
  });
  it('still skips dead former payees without changing state or RNG', () => {
    const state = fixture();
    const officer = state.officers[OFF_BETA_TAISHO]!;
    officer.status = 'dead';
    officer.clanId = null;
    officer.locationCastleId = null;
    expect(validateState(state)).toEqual([]);
    const before = structuredClone(state);
    applyUnpaidSalaryPenalty(state, new Set([officer.id]));
    expect(state).toEqual(before);
  });
});
