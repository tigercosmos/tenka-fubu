import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { marriageCandidates } from '../../src/core/commands/diplomacyCommands';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import { comingOfAge, dieOfficer, transferOfficer } from '../../src/core/systems/officers';
import { clearSpouseOnDeath } from '../../src/core/systems/marriage';
import {
  adjustSentiment,
  adjustTrust,
  getDiplomacyRow,
} from '../../src/core/systems/diplomacyCommon';
import { calendarToDay } from '../../src/core/systems/time';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

function queued(state: GameState, command: Command, strategyTick = false) {
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  if (strategyTick) {
    const result = advanceDay(state, queue.drain());
    expect(result.appliedCommands).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
    expect(validateState(state)).toEqual([]);
    return result.events;
  }
  const events: GameEvent[] = [];
  expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toHaveLength(1);
  expect(events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(validateState(state)).toEqual([]);
  return events;
}

function married() {
  const state = buildTinyState();
  for (const id of [OFF_ALPHA_BUSHO, OFF_BETA_BUSHO]) state.officers[id]!.kinship = 'kin';
  adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 100);
  adjustTrust(state, CLAN_ALPHA, CLAN_BETA, BAL.trustMax);
  const proposal = {
    type: 'proposePact' as const,
    clanId: CLAN_ALPHA,
    targetClanId: CLAN_BETA,
    reinforceAgainstClanId: null,
  };
  expect(
    queued(state, { ...proposal, kind: 'proposeAlliance' }, true).some(
      (event) => event.type === 'pact.signed',
    ),
  ).toBe(true);
  adjustTrust(state, CLAN_ALPHA, CLAN_BETA, BAL.trustMax);
  expect(
    queued(state, { ...proposal, kind: 'proposeMarriage' }, true).some(
      (event) => event.type === 'pact.signed',
    ),
  ).toBe(true);
  expect(state.officers[OFF_ALPHA_BUSHO]!.spouseId).toBe(OFF_BETA_BUSHO);
  expect(state.officers[OFF_BETA_BUSHO]!.spouseId).toBe(OFF_ALPHA_BUSHO);
  const pact = getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.find(
    (entry) => entry.kind === 'marriage',
  )!;
  expect(pact.endDay).toBeNull();
  return { state, pact: structuredClone(pact) };
}

function assertUnlinked(state: GameState, pact: ReturnType<typeof married>['pact']) {
  expect(state.officers[OFF_ALPHA_BUSHO]!.spouseId).toBeNull();
  expect(state.officers[OFF_BETA_BUSHO]!.spouseId).toBeNull();
  expect(
    getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.find((entry) => entry.kind === 'marriage'),
  ).toEqual(pact);
  expect(marriageCandidates(state, CLAN_ALPHA)).toContain(OFF_ALPHA_BUSHO);
  expect(validateState(state)).toEqual([]);
}

describe('death-only spouse cleanup with permanent marriage pacts (08 §3.4.1)', () => {
  it('clears both links on the actual scheduled natural-death month, exactly once', () => {
    const { state, pact } = married();
    state.officers[OFF_BETA_BUSHO]!.scheduledDeath = {
      year: state.time.year,
      month: state.time.month + 1,
    };
    const events: GameEvent[] = [];
    while (state.time.dayOfMonth !== 1) {
      events.push(...advanceDay(state, []).events);
      expect(validateState(state)).toEqual([]);
    }
    expect(
      events.filter((event) => event.type === 'officer.died' && event.officerId === OFF_BETA_BUSHO),
    ).toEqual([expect.objectContaining({ cause: 'age', nodeId: null })]);
    assertUnlinked(state, pact);
    const before = structuredClone(state);
    expect(dieOfficer(state, OFF_BETA_BUSHO, null, false, 'age')).toEqual([]);
    expect(state).toEqual(before);
  });

  it('clears reciprocal links on a real queued execution without a died event or RNG draw', () => {
    const { state, pact } = married();
    // Controlled valid captive prerequisite; no claim to reproduce capture mechanics.
    const target = state.officers[OFF_BETA_BUSHO]!;
    target.status = 'captive';
    target.capturedByClanId = CLAN_ALPHA;
    target.locationCastleId = CASTLE_A1;
    expect(validateState(state)).toEqual([]);
    const rng = structuredClone(state.rng);
    const events = queued(state, {
      type: 'handleCaptive',
      clanId: CLAN_ALPHA,
      officerId: target.id,
      action: 'execute',
      executorId: null,
    });
    expect(events.map((event) => event.type)).toEqual(['officer.executed']);
    expect(state.rng).toEqual(rng);
    assertUnlinked(state, pact);
  });

  it('uses the same death-only cleanup for battle death and the pre-debut death branch', () => {
    const battle = married();
    const rng = structuredClone(battle.state.rng);
    expect(dieOfficer(battle.state, OFF_BETA_BUSHO, CASTLE_B1).map((event) => event.type)).toEqual([
      'officer.died',
    ]);
    expect(battle.state.rng).toEqual(rng);
    assertUnlinked(battle.state, battle.pact);

    const juvenile = married();
    const target = juvenile.state.officers[OFF_BETA_BUSHO]!;
    // Defensive legacy/input fixture, not a claim that a non-employed minor can
    // form a legal queued marriage under 02 INV-06.
    target.hasComeOfAge = false;
    target.debutYear = juvenile.state.time.year + 1;
    target.scheduledDeath = { year: target.debutYear - 1, month: 1 };
    // Controlled valid debut boundary, exercising the existing non-emitting branch.
    juvenile.state.time = {
      day: calendarToDay(target.debutYear, 1, 1),
      year: target.debutYear,
      month: 1,
      dayOfMonth: 1,
    };
    const beforeRng = structuredClone(juvenile.state.rng);
    expect(comingOfAge(juvenile.state)).toEqual([]);
    expect(target.status).toBe('dead');
    expect(juvenile.state.rng).toEqual(beforeRng);
    assertUnlinked(juvenile.state, juvenile.pact);
  });

  it('preserves both links and the pact on a living transfer or captive release', () => {
    const { state, pact } = married();
    const target = state.officers[OFF_BETA_BUSHO]!;
    transferOfficer(
      state,
      target.id,
      {
        clanId: CLAN_ALPHA,
        castleId: CASTLE_A1,
        rank: target.rank,
        loyalty: BAL.poachedInitialLoyalty,
      },
      () => {},
    );
    expect(target.spouseId).toBe(OFF_ALPHA_BUSHO);
    expect(state.officers[OFF_ALPHA_BUSHO]!.spouseId).toBe(target.id);
    expect(
      getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.find(
        (entry) => entry.kind === 'marriage',
      ),
    ).toEqual(pact);
    expect(validateState(state)).toEqual([]);

    const released = married();
    const captive = released.state.officers[OFF_BETA_BUSHO]!;
    captive.status = 'captive';
    captive.capturedByClanId = CLAN_ALPHA;
    captive.locationCastleId = CASTLE_A1;
    queued(released.state, {
      type: 'handleCaptive',
      clanId: CLAN_ALPHA,
      officerId: captive.id,
      action: 'release',
      executorId: null,
    });
    expect(captive.spouseId).toBe(OFF_ALPHA_BUSHO);
    expect(released.state.officers[OFF_ALPHA_BUSHO]!.spouseId).toBe(captive.id);
  });

  it('defensively preserves a different partner backlink and tolerates a missing partner', () => {
    const { state, pact } = married();
    // Deliberately asymmetric legacy input, not a valid new marriage command.
    const partner = state.officers[OFF_ALPHA_BUSHO]!;
    partner.spouseId = partner.id;
    const rng = structuredClone(state.rng);
    clearSpouseOnDeath(state, OFF_BETA_BUSHO);
    expect(state.officers[OFF_BETA_BUSHO]!.spouseId).toBeNull();
    expect(partner.spouseId).toBe(partner.id);
    delete state.officers[OFF_ALPHA_BUSHO];
    state.officers[OFF_BETA_BUSHO]!.spouseId = OFF_ALPHA_BUSHO;
    expect(() => clearSpouseOnDeath(state, OFF_BETA_BUSHO)).not.toThrow();
    expect(state.officers[OFF_BETA_BUSHO]!.spouseId).toBeNull();
    expect(state.rng).toEqual(rng);
    expect(
      getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.find(
        (entry) => entry.kind === 'marriage',
      ),
    ).toEqual(pact);
  });

  it('continues the natural-death boundary identically through the native save codec', () => {
    const { state, pact } = married();
    state.officers[OFF_BETA_BUSHO]!.scheduledDeath = {
      year: state.time.year,
      month: state.time.month + 1,
    };
    while (state.time.dayOfMonth !== 30) advanceDay(state, []);
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const result = advanceDay(state, []);
    const continued = advanceDay(restored, []);
    expect(result.events).toEqual(continued.events);
    const persistent = structuredClone(state);
    persistent.ai.intentLog = [];
    const restoredPersistent = structuredClone(restored);
    restoredPersistent.ai.intentLog = [];
    expect(restoredPersistent).toEqual(persistent);
    expect(restored.rng).toEqual(state.rng);
    assertUnlinked(state, pact);
    assertUnlinked(restored, pact);
  });
});
