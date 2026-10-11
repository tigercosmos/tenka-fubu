import { describe, expect, it } from 'vitest';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { validateCommand } from '../../src/core/commands/validate';
import { CommandQueue } from '../../src/core/commands/queue';
import { BAL } from '../../src/core/balance';
import { gainMerit } from '../../src/core/systems/officers';
import { advanceDay } from '../../src/core/systems';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { Command } from '../../src/core/commands/types';
import type { TraitId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_BETA,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function beforeFall(ambitious = false) {
  const state = buildTinyState();
  state.meta.playerClanId = CLAN_BETA;
  const commander = state.officers[OFF_BETA_TAISHO]!;
  const deputy = state.officers[OFF_BETA_BUSHO]!;
  commander.traits = ambitious ? ['trait.yashin' as TraitId] : [];
  deputy.traits = ambitious ? ['trait.yashin' as TraitId] : [];
  commander.merit =
    BAL.rankMeritThresholds[3] - Math.round(BAL.meritSiegeWin * BAL.meritCommanderMult);
  commander.statExp.ldr = 90;
  commander.statExp.val = 90;
  // A controlled near-fall castle, not an injected army/position or campaign claim.
  state.castles[CASTLE_A2]!.durability = 1;
  state.castles[CASTLE_A2]!.soldiers = 100;
  const cmd: Command = {
    type: 'march',
    clanId: CLAN_BETA,
    originCastleId: CASTLE_B1,
    leaderId: commander.id,
    deputyIds: [deputy.id],
    soldiers: 300,
    food: 300,
    targetNodeId: CASTLE_A2,
  };
  expect(validateMarch(state, cmd)).toEqual({ ok: true });
  applyMarch(state, cmd, () => {});
  expect(validateState(state)).toEqual([]);
  // Normal day order generates actual movement and the siege. Save before the
  // successful combat day to exercise continuation, not synthetic placement.
  for (let i = 0; i < 20; i++) {
    const army = Object.values(state.armies)[0]!;
    if (army.posNodeId === CASTLE_A2 || army.pathCursor === army.path.length - 2) return state;
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  throw new Error('real march did not approach the target');
}

function finish(state: ReturnType<typeof buildTinyState>) {
  const events = [];
  for (let i = 0; i < 20 && state.castles[CASTLE_A2]!.ownerClanId !== CLAN_BETA; i++) {
    events.push(...advanceDay(state, []).events);
    expect(validateState(state)).toEqual([]);
  }
  expect(events.filter((event) => event.type === 'siege.ended' && event.fallen)).toHaveLength(1);
  return events;
}

describe('real siege-success officer merit', () => {
  it.each([false, true])(
    'awards commander/deputy merit and equal ldr/val experience (ambitious=%s)',
    (ambitious) => {
      // 06 §3.5/§5.7: round commander base first, then trait-adjust the award.
      const traitMultiplier = ambitious ? 1 + BAL.traitYashinMerit : 1;
      const commanderGain = Math.round(
        Math.round(BAL.meritSiegeWin * BAL.meritCommanderMult) * traitMultiplier,
      );
      const deputyGain = Math.round(BAL.meritSiegeWin * traitMultiplier);
      const state = beforeFall(ambitious);
      const before = structuredClone(state.officers);
      finish(state);
      for (const [id, gain] of [
        [OFF_BETA_TAISHO, commanderGain],
        [OFF_BETA_BUSHO, deputyGain],
      ] as const) {
        const officer = state.officers[id]!;
        expect(officer.merit - before[id]!.merit).toBe(gain);
        for (const stat of ['ldr', 'val'] as const) {
          expect(
            officer.statExp[stat] +
              officer.statGrowth[stat] * BAL.statExpPerPoint -
              before[id]!.statExp[stat] -
              before[id]!.statGrowth[stat] * BAL.statExpPerPoint,
          ).toBe(gain);
        }
        expect(officer.rank).toBe(before[id]!.rank);
      }
      expect(state.officers[OFF_BETA_LORD]!.merit).toBe(before[OFF_BETA_LORD]!.merit);
      expect(state.officers[OFF_ALPHA_LORD]!.merit).toBe(before[OFF_ALPHA_LORD]!.merit);
      expect(
        validateCommand(state, {
          type: 'promoteRank',
          clanId: CLAN_BETA,
          officerId: OFF_BETA_TAISHO,
        }),
      ).toEqual({ ok: true });
      const awarded = structuredClone(state.officers);
      advanceDay(state, []);
      expect(state.officers[OFF_BETA_TAISHO]!.merit).toBe(awarded[OFF_BETA_TAISHO]!.merit);
      expect(validateState(state)).toEqual([]);
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      queue.enqueue(
        { type: 'promoteRank', clanId: CLAN_BETA, officerId: OFF_BETA_TAISHO },
        state.time.day,
      );
      const promotion = advanceDay(state, queue.drain());
      expect(promotion.events.some((event) => event.type === 'officer.promoted')).toBe(true);
      expect(state.officers[OFF_BETA_TAISHO]!.rank).toBe('busho');
      expect(validateState(state)).toEqual([]);
    },
  );

  it('does not award merit for an ongoing siege and the shared award consumes no RNG', () => {
    const state = beforeFall();
    state.castles[CASTLE_A2]!.durability = state.castles[CASTLE_A2]!.maxDurability;
    const merit = state.officers[OFF_BETA_TAISHO]!.merit;
    for (let i = 0; i < 20 && Object.keys(state.sieges).length === 0; i++) {
      advanceDay(state, []);
      expect(validateState(state)).toEqual([]);
    }
    expect(Object.keys(state.sieges)).toHaveLength(1);
    expect(state.castles[CASTLE_A2]!.ownerClanId).not.toBe(CLAN_BETA);
    expect(state.officers[OFF_BETA_TAISHO]!.merit).toBe(merit);
    const rng = structuredClone(state.rng);
    gainMerit(
      state.officers[OFF_BETA_TAISHO]!,
      Math.round(BAL.meritSiegeWin * BAL.meritCommanderMult),
      ['ldr', 'val'],
    );
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('repeats and resumes a genuine pre-fall save with identical core and RNG', () => {
    const state = beforeFall();
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const repeat = structuredClone(state);
    const loaded = decoded.saveFile.state;
    expect(finish(repeat)).toEqual(finish(loaded));
    // Save format deliberately excludes transient AI diagnostic history.
    repeat.ai.intentLog = [];
    loaded.ai.intentLog = [];
    expect(loaded).toEqual(repeat);
    expect(loaded.rng).toEqual(repeat.rng);
    expect(decodeSave(encodeSave(loaded, 42)).ok).toBe(true);
    expect(validateState(loaded)).toEqual([]);
  });
});
