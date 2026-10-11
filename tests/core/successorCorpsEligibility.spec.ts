import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import {
  buildMiniState,
  CASTLE_B1,
  CLAN_BETA,
  OFF_BETA_TAISHO_B,
  OFF_BETA_TAISHO_C,
} from '../fixtures/mini';

const earned = JSON.parse(
  readFileSync(
    new URL('../replay/cases/m6-transport-physical-occupancy.tfulog.json', import.meta.url),
    'utf8',
  ),
) as CommandLogFile;
function succession() {
  // Unchanged mini world; only previously earned player marches/siege orders,
  // alongside naturally generated AI orders. No post-setup world injection.
  const state = buildMiniState();
  const queue = new CommandQueue();
  let observed = false;
  for (let tick = 1; tick <= 53; tick++) {
    for (const entry of earned.entries.filter(
      (entry) =>
        entry.day === tick &&
        !entry.authority &&
        ['march', 'setSiegeMode'].includes(entry.command.type),
    )) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    if (
      result.events.some(
        (event) =>
          event.type === 'clan.succession' &&
          event.clanId === CLAN_BETA &&
          event.heirId === OFF_BETA_TAISHO_B,
      )
    )
      observed = true;
    expect(validateState(state), `day ${state.time.day}`).toEqual([]);
  }
  expect(state.time.day).toBe(143);
  expect(observed).toBe(true);
  expect(state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_TAISHO_B);
  expect(state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
  // Preserve actual generated orders. Settle old clan administration before
  // changing its castle to corps scope; never clear or skip pending AI commands.
  for (let wait = 0; state.ai.pendingOrders.length > 0 && wait < 7; wait++) {
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(validateState(state)).toEqual([]);
  }
  expect(state.ai.pendingOrders).toEqual([]);
  return state;
}
const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
const command = {
  type: 'createCorps' as const,
  clanId: CLAN_BETA,
  corpsLeaderId: OFF_BETA_TAISHO_B,
  castleIds: [CASTLE_B1],
  directive: 'hold' as const,
  targetNodeId: null,
};
describe('earned successor corps privilege', () => {
  it('admits the real unchanged-mini low-rank successor and creates the corps on a normal day without rewriting rank', () => {
    const state = succession();
    const before = structuredClone(state);
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    expect(state).toEqual(before);
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day, authority);
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(Object.values(state.corps)).toHaveLength(1);
    expect(Object.values(state.corps)[0]!.corpsLeaderId).toBe(OFF_BETA_TAISHO_B);
    expect(state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
    expect(state.officers[OFF_BETA_TAISHO_B]!.loyalty).toBe(100);
    expect(validateState(state)).toEqual([]);
  });
  it('preserves ordinary nonruler rank rejection and exact native successor eligibility', () => {
    const state = succession();
    const before = structuredClone(state);
    expect(
      validateCommand(state, { ...command, corpsLeaderId: OFF_BETA_TAISHO_C }, authority),
    ).toMatchObject({ ok: false, reasonKey: 'cmd.reject.rankTooLow' });
    const decoded = decodeSave(encodeSave(state, 0));
    if (!decoded.ok) throw new Error(decoded.code);
    expect(validateCommand(decoded.saveFile.state, command, authority)).toEqual({ ok: true });
    expect(decoded.saveFile.state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
    expect(state).toEqual(before);
    expect(decoded.saveFile.state.rng).toEqual(state.rng);
    expect(validateState(decoded.saveFile.state)).toEqual([]);
  });
});
