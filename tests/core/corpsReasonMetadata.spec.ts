import { expect, it } from 'vitest';
import { validateCreateCorps } from '../../src/core/commands/corpsCommands';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import type { GameEvent } from '../../src/core/state/events';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, OFF_ALPHA_LORD } from '../fixtures/tiny';

function fixture() {
  const state = buildTinyState();
  const command: Command = {
    type: 'createCorps',
    clanId: CLAN_ALPHA,
    corpsLeaderId: OFF_ALPHA_LORD,
    castleIds: [CASTLE_A1],
    directive: 'hold',
    targetNodeId: null,
  };
  expect(validateCreateCorps(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
  expect(validateState(state)).toEqual([]);
  return { state, command: { ...command, castleIds: [CASTLE_A2] } };
}

it('includes the actual busy Corps leader name in the pure validation rejection', () => {
  const { state, command } = fixture();
  const before = structuredClone(state);
  expect(validateCreateCorps(state, command)).toEqual({
    ok: false,
    reasonKey: 'cmd.reject.officerBusy',
    params: { name: state.officers[OFF_ALPHA_LORD]!.name },
  });
  expect(state).toEqual(before);
});

it('preserves the busy leader name through a real queued rejection without creating another Corps', () => {
  const { state, command } = fixture();
  const before = structuredClone(state);
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  const events: GameEvent[] = [];
  expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toEqual([]);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'command.rejected',
      reasonKey: 'cmd.reject.officerBusy',
      params: { name: state.officers[OFF_ALPHA_LORD]!.name },
    }),
  );
  expect(Object.keys(state.corps)).toHaveLength(1);
  expect(state.corps).toEqual(before.corps);
  expect(state.castles).toEqual(before.castles);
  expect(state.clans).toEqual(before.clans);
  expect(state.officers).toEqual(before.officers);
  expect(state.rng).toEqual(before.rng);
  expect(validateState(state)).toEqual([]);
});
