import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import type { TraitId } from '../../src/core/state/ids';
import { advanceDay } from '../../src/core/systems';
import { planMarchFromCastle } from '../../src/core/systems/ai/shared';
import type { AiScope } from '../../src/core/systems/ai/types';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

describe('AI march selection uses ordinary capped effective leadership', () => {
  it.each([
    ['growth changes order', 80, 0, 79, 5, false],
    ['upper-bound tie retains officer ID order', BAL.abilityMax, 0, BAL.abilityMax - 1, 5, false],
    [
      'upper-bound overflow cannot outrank the ID tie',
      BAL.abilityMax - 1,
      5,
      BAL.abilityMax,
      0,
      false,
    ],
    ['Gunshin does not modify ordinary selection', 80, 0, 84, 0, true],
  ] as const)('%s', (_label, lordBase, lordGrowth, bushoBase, bushoGrowth, gunshin) => {
    const state = buildTinyState();
    const lord = state.officers[OFF_ALPHA_LORD]!;
    const busho = state.officers[OFF_ALPHA_BUSHO]!;
    lord.ldr = lordBase;
    lord.statGrowth.ldr = lordGrowth;
    lord.traits = gunshin ? ['trait.gunshin' as TraitId] : [];
    busho.ldr = bushoBase;
    busho.statGrowth.ldr = bushoGrowth;
    busho.traits = [];
    expect(lord.locationCastleId).toBe(CASTLE_A1);
    expect(busho.locationCastleId).toBe(CASTLE_A1);
    expect(OFF_ALPHA_BUSHO.localeCompare(OFF_ALPHA_LORD)).toBeLessThan(0);
    expect(validateState(state)).toEqual([]);
    const scope: AiScope = {
      clanId: CLAN_ALPHA,
      corpsId: null,
      castleIds: [CASTLE_A1],
      targetNodeId: null,
    };
    const before = structuredClone(state);
    const command = planMarchFromCastle(state, scope, state.castles[CASTLE_A1]!, CASTLE_A2, 100);
    expect(state).toEqual(before);
    expect(state.rng).toEqual(before.rng);
    expect(command).not.toBeNull();
    if (!command) throw new Error('Expected legal friendly march');
    expect(command.soldiers).toBe(100);
    expect(validateCommand(state, command)).toEqual({ ok: true });
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const envelope = queue.enqueue(command, state.time.day);
    const result = advanceDay(state, queue.drain());
    expect(result.appliedCommands).toEqual([envelope]);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(Object.values(state.armies)).toHaveLength(1);
    expect(Object.values(state.armies)[0]!.leaderId).toBe(command.leaderId);
    expect(validateState(state)).toEqual([]);
    expect(command.leaderId).toBe(OFF_ALPHA_BUSHO);
  });
});
