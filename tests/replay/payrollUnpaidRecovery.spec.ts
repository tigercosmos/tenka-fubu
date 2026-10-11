import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { envelopeAuthority } from '../../src/core/commands/authority';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import {
  loyaltyTarget,
  salaryPayees,
  rewardOfficerLoyaltyGain,
} from '../../src/core/systems/officers';
import { buildMiniState, CLAN_ALPHA, OFF_ALPHA_LORD, OFF_ALPHA_TAISHO_B } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-payroll-unpaid-recovery.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;
const persistent = (state: GameState) => {
  const copy = structuredClone(state);
  copy.ai.intentLog = [];
  return copy;
};
const loyalties = (state: GameState) =>
  Object.fromEntries(
    Object.values(state.officers)
      .filter((o) => o.clanId === CLAN_ALPHA)
      .map((o) => [o.id, o.loyalty]),
  );

/** All prerequisites arise from legal player commands; generated AI orders are drained as in the bridge. */
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  const checkpoints: { tick: number; player: number; ai: number }[] = [];
  const monthly = new Map<
    number,
    {
      before: ReturnType<typeof loyalties>;
      after: ReturnType<typeof loyalties>;
      targets: Record<string, number>;
      payees: string[];
    }
  >();
  let refund: { wallet: number; before: number; after: number } | undefined;
  let beforePayroll: GameState | undefined;
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    for (const entry of log.entries.filter((entry) => entry.day === tick && !entry.authority)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    if (native && [24, 29, 31].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
      checkpoints.push({ tick, player: pending.length, ai: state.ai.pendingOrders.length });
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const cmd of decoded.saveFile.pendingCommands) queue.enqueue(cmd, state.time.day);
    }
    const beforeLoyalty = loyalties(state);
    const targets = Object.fromEntries(
      Object.values(state.officers)
        .filter((o) => o.clanId === CLAN_ALPHA)
        .map((o) => [o.id, loyaltyTarget(state, o)]),
    );
    const payees = salaryPayees(state, CLAN_ALPHA).map((o) => o.id);
    const wallet = Object.values(state.corps)[0]?.gold ?? 0;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    if (tick === 30) beforePayroll = structuredClone(state);
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    for (const envelope of envelopes)
      expect(validateCommand(state, envelope.command, envelopeAuthority(envelope))).toEqual({
        ok: true,
      });
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state), `mini day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    if ([30, 60].includes(tick))
      monthly.set(tick, { before: beforeLoyalty, after: loyalties(state), targets, payees });
    if (tick === 31) refund = { wallet, before: gold, after: state.clans[CLAN_ALPHA]!.gold };
  }
  return {
    state,
    log: recorder.export(state),
    events,
    monthly,
    refund,
    beforePayroll,
    checkpoints,
  };
}
const drift = (before: number, target: number) =>
  Math.max(-BAL.loyaltyDriftPerMonth, Math.min(BAL.loyaltyDriftPerMonth, target - before));

describe('unchanged mini actual unpaid payroll and earned corps-wallet recovery', () => {
  it('records actual unpaid payees, exact drift/penalty and successful next-month recovery with a paid twin', () => {
    const original = journey();
    expect(journey()).toEqual(original);
    expect(original.log).toEqual(source);
    expect(original.beforePayroll!.clans[CLAN_ALPHA]!.gold).toBe(0);
    const boundary = original.monthly.get(30)!;
    const unpaid = original.events[29]!.find(
      (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA,
    );
    expect(unpaid).toMatchObject({
      type: 'economy.upkeepUnpaid',
      day: 120,
      payeeIds: boundary.payees,
    });
    expect(boundary.payees).toHaveLength(3);
    expect(boundary.payees).not.toContain(OFF_ALPHA_LORD);
    for (const id of boundary.payees)
      expect(boundary.after[id]).toBe(
        boundary.before[id]! +
          drift(boundary.before[id]!, boundary.targets[id]!) -
          BAL.unpaidSalaryLoyaltyPenalty,
      );
    expect(boundary.after[OFF_ALPHA_LORD]).toBe(100);
    expect(original.refund!.wallet).toBeGreaterThan(0);
    expect(original.refund!.after).toBe(original.refund!.before + original.refund!.wallet);
    expect(Object.values(original.state.corps)).toEqual([]);
    expect(
      original.events[59]!.filter(
        (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA,
      ),
    ).toEqual([]);
    const recovered = original.monthly.get(60)!;
    for (const id of recovered.payees)
      expect(recovered.after[id]).toBe(
        recovered.before[id]! + drift(recovered.before[id]!, recovered.targets[id]!),
      );
    expect(recovered.after[OFF_ALPHA_LORD]).toBe(100);
    // The fifth gift has minimum1 gain for both tiers; change only its legal payment, not loyalty prerequisites.
    const paidLog = structuredClone(source);
    const fifth = paidLog.entries.filter((entry) => entry.command.type === 'rewardOfficer')[4]!
      .command;
    if (fifth.type !== 'rewardOfficer') throw new Error('missing gift');
    const giftOfficer = original.beforePayroll!.officers[OFF_ALPHA_TAISHO_B]!;
    const fourGifts = { ...giftOfficer, rewardGiftsThisYear: 4 };
    expect(rewardOfficerLoyaltyGain(fourGifts, 'small')).toBe(
      rewardOfficerLoyaltyGain(fourGifts, 'large'),
    );
    fifth.tier = 'small';
    const paid = journey(paidLog);
    expect(loyalties(paid.beforePayroll!)).toEqual(loyalties(original.beforePayroll!));
    expect(paid.beforePayroll!.clans[CLAN_ALPHA]!.gold).toBe(
      BAL.rewardGoldLargeCost - BAL.rewardGoldSmallCost,
    );
    expect(
      paid.events[29]!.filter(
        (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA,
      ),
    ).toEqual([]);
    for (const id of boundary.payees)
      expect(paid.monthly.get(30)!.after[id]! - boundary.after[id]!).toBe(
        BAL.unpaidSalaryLoyaltyPenalty,
      );
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: true,
      actualHash: source.finalHash,
      expectedHash: source.finalHash,
      balanceMismatch: false,
    });
  });

  it('restores actual AI pending, five queued gifts and ongoing earned-wallet dissolution', () => {
    const original = journey();
    const restored = journey(source, true);
    expect(restored.checkpoints.map((c) => [c.tick, c.player])).toEqual([
      [24, 0],
      [29, 5],
      [31, 1],
    ]);
    expect(restored.checkpoints[0]!.ai).toBeGreaterThan(0);
    expect(restored.log).toEqual(source);
    expect(restored.events).toEqual(original.events);
    expect(restored.monthly).toEqual(original.monthly);
    expect(restored.refund).toEqual(original.refund);
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.state.rng).toEqual(original.state.rng);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });

  it('detects a legal earlier dissolution that avoids the unpaid month without inventing AI commands', () => {
    const altered = structuredClone(source);
    altered.entries.find((entry) => entry.command.type === 'dissolveCorps')!.day = 28;
    const actual = journey(altered);
    expect(
      actual.events[29]!.filter(
        (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA,
      ),
    ).toEqual([]);
    expect(actual.state.officers[OFF_ALPHA_TAISHO_B]!.rewardGiftsThisYear).toBe(5);
    // AI decisions may change after legal dissolution; replay only their ACTUAL newly recorded commands.
    const tamperedOracle = { ...actual.log, finalHash: source.finalHash };
    const replay = replayCommandLog(tamperedOracle, (log) => buildMiniState({ seed: log.seed }));
    expect(replay.match).toBe(false);
    expect(replay.actualHash).toBe(stateHash(actual.state));
    expect(replay.actualHash).not.toBe(source.finalHash);
  });
});
