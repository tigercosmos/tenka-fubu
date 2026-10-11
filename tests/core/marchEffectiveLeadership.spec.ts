import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { TraitId } from '../../src/core/state/ids';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA, DIST_A1X, OFF_ALPHA_LORD } from '../fixtures/tiny';

function queuedTick(state: ReturnType<typeof buildTinyState>, command?: Command) {
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  if (command) {
    const before = structuredClone(state);
    expect(validateCommand(state, command)).toEqual({ ok: true });
    expect(state).toEqual(before);
    queue.enqueue(command, state.time.day);
    expect(state).toEqual(before);
  }
  const result = advanceDay(state, queue.drain());
  expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(validateState(state)).toEqual([]);
  return result;
}

it.each([
  [119, 0, false],
  [119, 1, false],
  [119, 5, false],
  [120, 5, false],
  [70, 1, true],
] as const)(
  'initial queued march morale uses ordinary capped leadership %s + %s (Gunshin=%s)',
  (base, growth, gunshin) => {
    const state = buildTinyState();
    const officer = state.officers[OFF_ALPHA_LORD]!;
    // Controlled valid pre-existing ability metadata, not a claim of earned
    // growth. The army is created only by the centrally validated queued march.
    officer.ldr = base;
    officer.statGrowth.ldr = growth;
    officer.traits = gunshin ? ['trait.gunshin' as TraitId] : [];
    expect(validateState(state)).toEqual([]);
    const expected = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          BAL.moraleInitBase + Math.min(BAL.abilityMax, base + growth) * BAL.moraleInitLdrFactor,
        ),
      ),
    );
    const march: Command = {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 100,
      targetNodeId: DIST_A1X,
    };
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const result = queuedTick(state, march);
    expect(queuedTick(restored, march).events).toEqual(result.events);
    expect(result.events.filter((event) => event.type === 'army.departed')).toHaveLength(1);
    const armies = Object.values(state.armies);
    expect(armies).toHaveLength(1);
    // The route stays on friendly land: no enemy daily morale penalty masks the
    // command's initial morale. Normal difficulty adds no morale bonus.
    expect(armies[0]!.morale).toBe(expected);
    expect(officer.ldr).toBe(base);
    expect(officer.statGrowth.ldr).toBe(growth);
    expect(encodeSave(restored, 42)).toBe(encodeSave(state, 42));
    expect(restored.rng).toEqual(state.rng);
    const continued = decodeSave(encodeSave(state, 42));
    expect(continued.ok).toBe(true);
    if (!continued.ok) throw new Error(continued.code);
    expect(queuedTick(continued.saveFile.state).events).toEqual(queuedTick(state).events);
    expect(encodeSave(continued.saveFile.state, 42)).toBe(encodeSave(state, 42));
    expect(continued.saveFile.state.rng).toEqual(state.rng);
  },
);
