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
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { PolicyId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { monthlyGoldIncome } from '../../src/core/domestic';
import { buildMiniState, CLAN_ALPHA, CLAN_BETA, CASTLE_B2, DIST_B2X } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(
    new URL('./cases/m6-rakuichi-income-ownership.tfulog.json', import.meta.url),
    'utf8',
  ),
) as CommandLogFile;
const policyId = 'pol.rakuichi' as PolicyId;
function persistent(state: GameState) {
  const copy = structuredClone(state);
  copy.ai.intentLog = []; // The codec omits only this transient diagnostic history.
  return copy;
}
/** Independent arithmetic for this earned mini state, including the deliberately wrong pre-fix attribution. */
function income(state: GameState, oldCastlePolicy = false) {
  expect(state.policies[CLAN_ALPHA]!.active.every((id) => id === policyId)).toBe(true);
  let commerce = 0;
  for (const district of Object.values(state.districts)) {
    if (district.ownerClanId !== CLAN_ALPHA || district.uprising !== null) continue;
    const castle = state.castles[district.castleId]!;
    const actor = oldCastlePolicy ? castle.ownerClanId : CLAN_ALPHA;
    const policy = state.policies[actor]!.active.includes(policyId) ? BAL.polRakuichiIncomeMult : 1;
    const market = castle.facilities.some((id) => id === 'fac.ichi')
      ? 1 + BAL.facMarketIncomeBonus
      : 1;
    const port = castle.facilities.some((id) => id === 'fac.minato')
      ? 1 + BAL.facPortIncomeBonus
      : 1;
    commerce +=
      district.commerce *
      (district.stewardId === null ? 1 : BAL.fiefTaxRate) *
      market *
      port *
      policy;
  }
  return Math.floor(commerce * BAL.goldPerCommerce);
}
/** Unmodified mini: three actual Alpha commands plus every naturally generated AI order.
 * The policy-off twin is a legal player revoke, never a policy/state injection.
 */
function journey(native = false, revoke = false) {
  let state = buildMiniState({ seed: source.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  const checkpoints: Array<{ tick: number; player: number; ai: number }> = [];
  let month:
    | { actual: number; expected: number; old: number; settlementGold: number; state: GameState }
    | undefined;
  let subjugatedDay: number | undefined;
  expect(state.clans[CLAN_ALPHA]!.prestige).toBe(100);
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= source.finalDay; tick++) {
    for (const entry of source.entries.filter((e) => e.day === tick && !e.authority)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    if (revoke && tick === 29) {
      const command = { type: 'revokePolicy' as const, clanId: CLAN_ALPHA, policyId };
      expect(validateCommand(state, command)).toEqual({ ok: true });
      queue.enqueue(command, state.time.day);
    }
    if (native && [1, 24, 30].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
      expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
      checkpoints.push({ tick, player: pending.length, ai: state.ai.pendingOrders.length });
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
    }
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands, `tick ${tick}`).toEqual(envelopes);
    expect(result.events.filter((e) => e.type === 'command.rejected')).toEqual([]);
    expect(validateState(state), `absolute day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    if (result.events.some((e) => e.type === 'district.subjugated' && e.districtId === DIST_B2X))
      subjugatedDay = state.time.day;
    if (tick === 30) {
      expect(state.time.day).toBe(120);
      expect(state.districts[DIST_B2X]!.ownerClanId).toBe(CLAN_ALPHA);
      expect(state.castles[CASTLE_B2]!.ownerClanId).toBe(CLAN_BETA);
      const event = result.events.find(
        (e) => e.type === 'economy.income' && e.clanId === CLAN_ALPHA,
      );
      if (!event || event.type !== 'economy.income') throw Error('missing real monthly income');
      const settlement = result.monthOpeningSettlement!.clans.find((c) => c.clanId === CLAN_ALPHA)!;
      expect(event.gold).toBe(income(state));
      expect(monthlyGoldIncome(state, CLAN_ALPHA)).toBe(income(state));
      expect(settlement.incomeGold).toBe(event.gold);
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(settlement.goldAfter);
      expect(settlement.goldAfter).toBe(
        settlement.goldBefore +
          settlement.incomeGold +
          settlement.tributeReceived -
          settlement.tributePaid -
          settlement.salaryPaid -
          settlement.policyPaid,
      );
      month = {
        actual: event.gold,
        expected: income(state),
        old: income(state, true),
        settlementGold: settlement.goldAfter,
        state: structuredClone(state),
      };
    }
  }
  return { state, log: recorder.export(state), events, checkpoints, month: month!, subjugatedDay };
}

describe('permanent earned district income ownership replay (no castle conquest)', () => {
  it('records the complete real AI/player journey and rejects the old castle-policy arithmetic', () => {
    const a = journey(),
      b = journey();
    expect(a.subjugatedDay).toBe(97);
    expect(a.log).toEqual(source);
    expect(a.log.truncated).toBe(false);
    expect(a.log.entries.filter((e) => !e.authority)).toHaveLength(3);
    expect(a.log.entries.filter((e) => e.authority).length).toBeGreaterThan(0);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    expect(a.month.actual).toBeGreaterThan(a.month.old);
    expect(a.state.time.day).toBe(121);
    expect(stateHash(a.state)).toBe(source.finalHash);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
    });
  });
  it('continues genuine pending player and natural AI queues through native saves with all persistent state/RNG/events equal', () => {
    const a = journey(),
      b = journey(true);
    expect(b.checkpoints).toEqual([
      { tick: 1, player: 3, ai: 0 },
      { tick: 24, player: 0, ai: 8 },
      { tick: 30, player: 0, ai: 0 },
    ]);
    expect(b.log).toEqual(source);
    expect(persistent(b.state)).toEqual(persistent(a.state));
    expect(b.state.rng).toEqual(a.state.rng);
    expect(b.events).toEqual(a.events);
    expect({ ...b.month, state: persistent(b.month.state) }).toEqual({
      ...a.month,
      state: persistent(a.month.state),
    });
  });
  it('a legal pre-month policy revoke removes the multiplier, with zero rejection and a different complete replay hash', () => {
    const a = journey(),
      b = journey(false, true);
    // Revoke also removes the existing daily commerce-growth bonus; compare each
    // earned state with its own exact arithmetic, not an invented identical twin.
    expect(b.month.state.districts[DIST_B2X]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(b.month.state.castles[CASTLE_B2]!.ownerClanId).toBe(CLAN_BETA);
    expect(b.month.state.policies[CLAN_ALPHA]!.active).not.toContain(policyId);
    expect(b.month.actual).toBe(b.month.old);
    expect(b.month.actual).toBeLessThan(a.month.actual);
    expect(b.log.truncated).toBe(false);
    expect(b.log.entries.some((e) => e.command.type === 'revokePolicy')).toBe(true);
    expect(stateHash(b.state)).not.toBe(source.finalHash);
    expect(replayCommandLog(b.log, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
    });
    expect(
      replayCommandLog({ ...b.log, finalHash: source.finalHash }, (log) =>
        buildMiniState({ seed: log.seed }),
      ),
    ).toMatchObject({ match: false, balanceMismatch: false });
  });
});
