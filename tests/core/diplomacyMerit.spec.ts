import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { adjustSentiment, adjustTrust, getTrust } from '../../src/core/systems/diplomacyCommon';
import { dieOfficer } from '../../src/core/systems/officers';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { TraitId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

const work: Command = {
  type: 'startDiploWork',
  clanId: CLAN_ALPHA,
  target: CLAN_BETA,
  executorId: OFF_ALPHA_BUSHO,
};

function prepared(ambitious = false) {
  const state = buildTinyState();
  state.officers[OFF_ALPHA_BUSHO]!.traits = ambitious ? ['trait.yashin' as TraitId] : [];
  state.officers[OFF_ALPHA_BUSHO]!.pol = 100;
  state.officers[OFF_ALPHA_BUSHO]!.statExp.pol = BAL.statExpPerPoint - 10;
  // Controlled near-cap credit prerequisite; no fabricated monthly completion.
  adjustTrust(state, CLAN_ALPHA, CLAN_BETA, BAL.trustMax - 1);
  for (let i = 0; i < 29; i++) advanceDay(state, []);
  expect(state.time.dayOfMonth).toBe(30);
  expect(validateState(state)).toEqual([]);
  return state;
}

function commandTick(state: ReturnType<typeof buildTinyState>, command: Command) {
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  const result = advanceDay(state, queue.drain());
  expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(validateState(state)).toEqual([]);
  return result;
}

function nextMonth(state: ReturnType<typeof buildTinyState>) {
  for (let i = 0; i < 30; i++) {
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  expect(state.time.dayOfMonth).toBe(1);
}

describe('monthly diplomacy trust-completion merit', () => {
  it.each([false, true])(
    'awards once at the directional cap with trait-adjusted pol experience (ambitious=%s)',
    (ambitious) => {
      const state = prepared(ambitious);
      const before = structuredClone(state.officers);
      const award = Math.round(BAL.meritDiplomacy * (ambitious ? 1 + BAL.traitYashinMerit : 1));
      commandTick(state, work);
      const officer = state.officers[OFF_ALPHA_BUSHO]!;
      expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax);
      expect(getTrust(state, CLAN_BETA, CLAN_ALPHA)).toBe(0);
      expect(officer.merit - before[officer.id]!.merit).toBe(award);
      expect(
        officer.statExp.pol +
          officer.statGrowth.pol * BAL.statExpPerPoint -
          before[officer.id]!.statExp.pol -
          before[officer.id]!.statGrowth.pol * BAL.statExpPerPoint,
      ).toBe(award);
      expect(officer.rank).toBe(before[officer.id]!.rank);
      expect(state.officers[OFF_ALPHA_LORD]!.merit).toBe(before[OFF_ALPHA_LORD]!.merit);
      nextMonth(state);
      expect(officer.merit - before[officer.id]!.merit).toBe(award);
      commandTick(state, { type: 'stopDiploWork', clanId: CLAN_ALPHA, target: CLAN_BETA });
      commandTick(state, work);
      while (state.time.dayOfMonth !== 1) advanceDay(state, []);
      expect(officer.merit - before[officer.id]!.merit).toBe(award);
    },
  );

  it('awards a new real crossing after an accepted agreement spends trust, not agreement merit', () => {
    const state = prepared();
    commandTick(state, work);
    const initialMerit = state.officers[OFF_ALPHA_BUSHO]!.merit;
    adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 100);
    const accepted = commandTick(state, {
      type: 'proposePact',
      clanId: CLAN_ALPHA,
      targetClanId: CLAN_BETA,
      kind: 'proposeAlliance',
      reinforceAgainstClanId: null,
    });
    expect(accepted.events.some((event) => event.type === 'pact.signed')).toBe(true);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBeLessThan(BAL.trustMax);
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit).toBe(initialMerit);
    for (let i = 0; i < 360 && getTrust(state, CLAN_ALPHA, CLAN_BETA) < BAL.trustMax; i++) {
      advanceDay(state, []);
      expect(validateState(state)).toEqual([]);
    }
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax);
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit - initialMerit).toBe(BAL.meritDiplomacy);
  });

  it('does not reward unpaid work or a dead executor whose mission was cleaned up', () => {
    const unpaid = prepared();
    unpaid.clans[CLAN_ALPHA]!.gold = 0;
    const merit = unpaid.officers[OFF_ALPHA_BUSHO]!.merit;
    const result = commandTick(unpaid, work);
    expect(result.events.some((event) => event.type === 'diplo.workStopped')).toBe(true);
    expect(unpaid.officers[OFF_ALPHA_BUSHO]!.merit).toBe(merit);
    expect(getTrust(unpaid, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax - 1);

    const dead = prepared();
    // Process the real queued assignment at the prior-day command boundary,
    // then invoke canonical death cleanup before its first month-start work.
    const queue = new CommandQueue(dead.meta.lastAppliedCmdSeq + 1);
    expect(validateCommand(dead, work)).toEqual({ ok: true });
    queue.enqueue(work, dead.time.day);
    expect(applyCommands(dead, queue.drain(), () => {})).toHaveLength(1);
    const earned = dead.officers[OFF_ALPHA_BUSHO]!.merit;
    dieOfficer(dead, OFF_ALPHA_BUSHO, null, false, 'age');
    expect(dead.diplomacy.missions).toEqual([]);
    expect(validateState(dead)).toEqual([]);
    advanceDay(dead, []);
    expect(dead.officers[OFF_ALPHA_BUSHO]!.merit).toBe(earned);
    expect(getTrust(dead, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax - 1);
    expect(validateState(dead)).toEqual([]);
  });

  it('does not treat full court favor as a diplomatic trust completion', () => {
    const state = prepared();
    state.court.courtFavor[CLAN_ALPHA] = BAL.courtFavorMax - 1;
    const merit = state.officers[OFF_ALPHA_BUSHO]!.merit;
    commandTick(state, {
      type: 'startDiploWork',
      clanId: CLAN_ALPHA,
      target: 'court',
      executorId: OFF_ALPHA_BUSHO,
    });
    expect(state.court.courtFavor[CLAN_ALPHA]).toBe(BAL.courtFavorMax);
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit).toBe(merit);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax - 1);
  });

  it('continues from native pending-mission save identically and monthly work consumes no RNG', () => {
    const state = prepared();
    const decoded = decodeSave(encodeSave(state, 42, [work]));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const loaded = decoded.saveFile.state;
    commandTick(state, work);
    commandTick(loaded, decoded.saveFile.pendingCommands[0]!);
    state.ai.intentLog = [];
    loaded.ai.intentLog = [];
    expect(loaded).toEqual(state);
    const rng = structuredClone(loaded.rng);
    diplomacySystem(loaded);
    expect(loaded.rng).toEqual(rng);
    expect(loaded.officers[OFF_ALPHA_BUSHO]!.merit).toBe(state.officers[OFF_ALPHA_BUSHO]!.merit);
    expect(validateState(loaded)).toEqual([]);
    expect(decodeSave(encodeSave(loaded, 42)).ok).toBe(true);
  });
});
