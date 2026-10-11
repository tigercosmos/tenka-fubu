import { expect, it } from 'vitest';
import { validateEnactPolicy } from '../../src/core/commands/domesticCommands';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import type { GameEvent } from '../../src/core/state/events';
import type { PolicyId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

const command: Command = {
  type: 'enactPolicy',
  clanId: CLAN_ALPHA,
  policyId: 'pol.tenmasei' as PolicyId,
};
function fixture() {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.prestige = 450;
  state.clans[CLAN_ALPHA]!.gold = 0;
  expect(validateState(state)).toEqual([]);
  return state;
}
it('returns the actual policy adoption price without mutating state', () => {
  const state = fixture();
  const before = structuredClone(state);
  expect(validateEnactPolicy(state, command)).toEqual({
    ok: false,
    reasonKey: 'cmd.reject.insufficientGold',
    params: { cost: 60 },
  });
  expect(state).toEqual(before);
});
it('preserves price metadata through a real queued rejection without adopting or charging', () => {
  const state = fixture();
  const rng = structuredClone(state.rng);
  const events: GameEvent[] = [];
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toEqual([]);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'command.rejected',
      reasonKey: 'cmd.reject.insufficientGold',
      params: { cost: 60 },
    }),
  );
  expect(state.policies[CLAN_ALPHA]!.active).toEqual([]);
  expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
});
