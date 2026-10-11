import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { RANK_VALUES } from '../../src/core/state/enums';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { advanceDay } from '../../src/core/systems';
import { loyaltyTarget, salaryPayees } from '../../src/core/systems/officers';
import {
  buildMiniState,
  CLAN_BETA,
  OFF_BETA_TAISHO_A,
  OFF_BETA_TAISHO_B,
  OFF_BETA_TAISHO_C,
} from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(
    new URL('./cases/m6-earned-successor-payroll-recovery.tfulog.json', import.meta.url),
    'utf8',
  ),
) as CommandLogFile;
const explicitTypes = new Set(['createCorps', 'rewardOfficer', 'dissolveCorps']);
const loyaltySnapshot = (state: GameState) =>
  Object.fromEntries(
    Object.values(state.officers)
      .filter((officer) => officer.clanId === CLAN_BETA)
      .map((officer) => [officer.id, officer.loyalty]),
  );
const persistent = (state: GameState) => {
  const copy = structuredClone(state);
  copy.ai.intentLog = []; // Codec deliberately omits transient diagnostic history only.
  return copy;
};
const drift = (before: number, target: number) =>
  Math.max(-BAL.loyaltyDriftPerMonth, Math.min(BAL.loyaltyDriftPerMonth, target - before));

/** Unchanged mini, normal AI regenerated/drained in full. Corps creation, three gifts,
 * and dissolution are explicit trusted Beta-clan inputs, NOT spontaneous AI selections
 * or Alpha player UI. Beta inputs are never inserted into saved AI pending orders.
 */
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  const checkpoints: Array<{ tick: number; player: number; ai: number }> = [];
  const months = new Map<
    number,
    {
      gold: number;
      payees: string[];
      salary: number;
      before: ReturnType<typeof loyaltySnapshot>;
      after: ReturnType<typeof loyaltySnapshot>;
      targets: Record<string, number>;
    }
  >();
  let refund:
    | {
        day: number;
        goldBefore: number;
        wallet: number;
        goldAfter: number;
        loyaltyBefore: number;
        loyaltyAfter: number;
      }
    | undefined;
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    for (const entry of log.entries.filter((entry) => entry.day === tick && !entry.authority)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    // Native pending proof is genuine Alpha input / naturally generated AI only.
    // Ticks60/90/91 are resource-state continuation BEFORE external Beta input,
    // not a claim that manual Beta gifts/dissolution survive as player commands.
    if (native && [1, 54, 60, 90, 91].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
      expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
      checkpoints.push({ tick, player: pending.length, ai: state.ai.pendingOrders.length });
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
    }
    for (const entry of log.entries.filter(
      (entry) => entry.day === tick && entry.authority && explicitTypes.has(entry.command.type),
    )) {
      expect(entry.authority).toEqual({ kind: 'clan', clanId: CLAN_BETA });
      expect(validateCommand(state, entry.command, entry.authority)).toEqual({ ok: true });
      if (entry.command.type === 'createCorps') {
        expect(state.ai.pendingOrders).toEqual([]);
        expect(state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_TAISHO_B);
        expect(state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
      }
      if (entry.command.type === 'dissolveCorps') {
        const corps = state.corps[entry.command.corpsId]!;
        refund = {
          day: state.time.day,
          goldBefore: state.clans[CLAN_BETA]!.gold,
          wallet: corps.gold,
          goldAfter: 0,
          loyaltyBefore: state.officers[OFF_BETA_TAISHO_B]!.loyalty,
          loyaltyAfter: 0,
        };
      }
      queue.enqueue(structuredClone(entry.command), state.time.day, entry.authority);
    }
    const before = loyaltySnapshot(state);
    const gold = state.clans[CLAN_BETA]!.gold;
    const payees = salaryPayees(state, CLAN_BETA);
    const salary = payees.reduce(
      (sum, officer) => sum + BAL.rankSalary[RANK_VALUES.indexOf(officer.rank)]!,
      0,
    );
    const targets = Object.fromEntries(
      payees.map((officer) => [officer.id, loyaltyTarget(state, officer)]),
    );
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands, `tick ${tick}`).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state), `absolute day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    if ([150, 180, 210].includes(state.time.day))
      months.set(state.time.day, {
        gold,
        payees: payees.map((officer) => officer.id),
        salary,
        before,
        after: loyaltySnapshot(state),
        targets,
      });
    if (envelopes.some((envelope) => envelope.command.type === 'dissolveCorps')) {
      refund!.goldAfter = state.clans[CLAN_BETA]!.gold;
      refund!.loyaltyAfter = state.officers[OFF_BETA_TAISHO_B]!.loyalty;
    }
  }
  return { state, log: recorder.export(state), events, months, refund, checkpoints };
}

const betaUnpaid = (events: GameEvent[][], day: number) =>
  events
    .flat()
    .filter(
      (event) =>
        event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_BETA && event.day === day,
    );

describe('earned successor payroll exemption, actual unpaid payees and wallet recovery permanent replay', () => {
  it('records all120days, real succession, still-paid150, unpaid180 and paid210 without rank/loyalty fabrication', () => {
    const actual = journey();
    expect(journey()).toEqual(actual);
    expect(actual.log).toEqual(source);
    expect(source).toMatchObject({ finalDay: 120, truncated: false });
    expect(source.entries).toHaveLength(24);
    expect(actual.events.flat()).toContainEqual(
      expect.objectContaining({
        type: 'clan.succession',
        day: 143,
        clanId: CLAN_BETA,
        heirId: OFF_BETA_TAISHO_B,
      }),
    );
    for (const [day, month] of actual.months) {
      expect(month.payees).toEqual([OFF_BETA_TAISHO_A, OFF_BETA_TAISHO_C]);
      expect(month.payees).not.toContain(OFF_BETA_TAISHO_B);
      expect(month.salary).toBe(2 * BAL.rankSalary[RANK_VALUES.indexOf('samurai-taisho')]!);
      const unpaid = day === 180;
      for (const id of month.payees)
        expect(month.after[id]).toBe(
          month.before[id]! +
            drift(month.before[id]!, month.targets[id]!) -
            (unpaid ? BAL.unpaidSalaryLoyaltyPenalty : 0),
        );
      expect(month.after[OFF_BETA_TAISHO_B]).toBe(100);
    }
    expect(actual.months.get(150)!.gold).toBe(20);
    expect(betaUnpaid(actual.events, 150)).toEqual([]); // Income6 still covers salary20.
    expect(actual.months.get(180)!.gold).toBe(6);
    expect(betaUnpaid(actual.events, 180)).toEqual([
      expect.objectContaining({
        payeeIds: [OFF_BETA_TAISHO_A, OFF_BETA_TAISHO_C],
      }),
    ]);
    expect(betaUnpaid(actual.events, 210)).toEqual([]);
    // Refunding the wallet restores money, not the past unpaid-loyalty loss;
    // no ordinary-day repair occurs before the next month's normal drift.
    expect(actual.months.get(210)!.before).toEqual(actual.months.get(180)!.after);
    expect(actual.refund).toEqual({
      day: 180,
      goldBefore: 0,
      wallet: 52,
      goldAfter: 52,
      loyaltyBefore: 100,
      loyaltyAfter: 100,
    });
    expect(actual.months.get(210)!.gold).toBe(actual.refund!.goldAfter);
    expect(actual.state.clans[CLAN_BETA]!.gold).toBe(66);
    expect(Object.values(actual.state.corps)).toEqual([]);
    expect(actual.state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
    expect(actual.state.officers[OFF_BETA_TAISHO_B]!.loyalty).toBe(100);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
    });
  });

  it('restores genuine pending player/AI orders and settled resource checkpoints with identical full persistent state/events/RNG', () => {
    const direct = journey();
    const restored = journey(source, true);
    expect(restored.checkpoints).toEqual([
      { tick: 1, player: 2, ai: 0 },
      { tick: 54, player: 0, ai: 1 },
      { tick: 60, player: 0, ai: 0 },
      { tick: 90, player: 0, ai: 0 },
      { tick: 91, player: 0, ai: 0 },
    ]);
    expect(persistent(restored.state)).toEqual(persistent(direct.state));
    expect(restored.events).toEqual(direct.events);
    expect(restored.months).toEqual(direct.months);
    expect(restored.refund).toEqual(direct.refund);
    expect(restored.state.rng).toEqual(direct.state.rng);
    expect(restored.log).toEqual(source);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });

  it('legal earlier dissolution makes180paid and preserves the ruler without hiding newly generated AI commands', () => {
    const changed = structuredClone(source);
    changed.entries.find((entry) => entry.command.type === 'dissolveCorps')!.day = 89;
    const direct = journey();
    const paid = journey(changed);
    expect(betaUnpaid(paid.events, 180)).toEqual([]);
    expect(paid.months.get(180)!.before).toEqual(direct.months.get(180)!.before);
    for (const id of direct.months.get(180)!.payees)
      expect(paid.months.get(180)!.after[id]! - direct.months.get(180)!.after[id]!).toBe(
        BAL.unpaidSalaryLoyaltyPenalty,
      );
    expect(paid.state.officers[OFF_BETA_TAISHO_B]!.loyalty).toBe(100);
    expect(paid.refund!.wallet).toBeGreaterThan(0);
    // Different legal timing can change future AI decisions: use their complete
    // actual recorder output, but compare against the unchanged original hash.
    const comparison = { ...paid.log, finalHash: source.finalHash };
    expect(replayCommandLog(comparison, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: false,
      balanceMismatch: false,
      expectedHash: source.finalHash,
      actualHash: stateHash(paid.state),
    });
    expect(source.entries.find((entry) => entry.command.type === 'dissolveCorps')!.day).toBe(91);
  });
});
