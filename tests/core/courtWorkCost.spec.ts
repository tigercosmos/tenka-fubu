import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { DiploMission } from '../../src/core/state/gameState';
import type { TraitId } from '../../src/core/state/ids';
import { monthlyDiplomacyWorkCost } from '../../src/core/systems/court';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

function prepared(discounted: boolean, titled: boolean) {
  const state = buildTinyState();
  state.officers[OFF_ALPHA_BUSHO]!.traits = discounted ? ['trait.chotei' as TraitId] : [];
  if (titled) {
    state.court.shogunateExists = true;
    state.clans[CLAN_ALPHA]!.shogunateTitle = 'otomoshu';
  }
  for (let i = 0; i < 29; i++) advanceDay(state, []);
  expect(state.time.dayOfMonth).toBe(30);
  expect(validateState(state)).toEqual([]);
  return state;
}

function workTick(state: ReturnType<typeof buildTinyState>, target: DiploMission['target']) {
  const command = {
    type: 'startDiploWork' as const,
    clanId: CLAN_ALPHA,
    target,
    executorId: OFF_ALPHA_BUSHO,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  const result = advanceDay(state, queue.drain());
  expect(result.appliedCommands).toHaveLength(1);
  expect(
    result.events.some(
      (event) => event.type === 'command.rejected' || event.type === 'diplo.workStopped',
    ),
  ).toBe(false);
  expect(validateState(state)).toEqual([]);
  return result;
}

describe('named court mission executor cost (06 §3.3)', () => {
  it('keeps invalid, absent and foreign executors undiscounted without mutating state or RNG', () => {
    const state = prepared(true, false);
    state.officers[OFF_BETA_BUSHO]!.traits = ['trait.chotei' as TraitId];
    const mission = {
      fromClanId: CLAN_ALPHA,
      target: 'court' as const,
      officerId: OFF_ALPHA_BUSHO,
    };
    const before = structuredClone(state);
    expect(monthlyDiplomacyWorkCost(state, { ...mission, officerId: null })).toBe(
      BAL.courtWorkMonthlyCost,
    );
    expect(monthlyDiplomacyWorkCost(state, { ...mission, officerId: OFF_BETA_BUSHO })).toBe(
      BAL.courtWorkMonthlyCost,
    );
    expect(state).toEqual(before);
    state.officers[OFF_ALPHA_BUSHO]!.status = 'captive';
    expect(monthlyDiplomacyWorkCost(state, mission)).toBe(BAL.courtWorkMonthlyCost);
    state.officers[OFF_ALPHA_BUSHO]!.status = 'serving';
    state.officers[OFF_ALPHA_BUSHO]!.hasComeOfAge = false;
    expect(monthlyDiplomacyWorkCost(state, mission)).toBe(BAL.courtWorkMonthlyCost);
  });
  it.each([false, true])(
    'composes the executor trait and title before one rounding (title=%s)',
    (titled) => {
      const plain = prepared(false, titled);
      const discounted = prepared(true, titled);
      const titleMult = titled ? BAL.shogunateWorkCostMult : 1;
      const plainCost = Math.round(BAL.courtWorkMonthlyCost * titleMult);
      const traitCost = Math.round(BAL.courtWorkMonthlyCost * titleMult * (1 - BAL.traitChotei));
      workTick(discounted, 'court');
      workTick(plain, 'court');
      expect(discounted.clans[CLAN_ALPHA]!.gold - plain.clans[CLAN_ALPHA]!.gold).toBe(
        plainCost - traitCost,
      );
      expect(discounted.rng).toEqual(plain.rng);
      expect(discounted.diplomacy.missions).toMatchObject([
        { target: 'court', officerId: OFF_ALPHA_BUSHO },
      ]);
      expect(discounted.court.courtFavor[CLAN_ALPHA]).toBeGreaterThan(0);

      const decoded = decodeSave(encodeSave(discounted, 42));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      const restored = decoded.saveFile.state;
      for (let i = 0; i < 30; i++) {
        expect(advanceDay(restored, []).events).toEqual(advanceDay(discounted, []).events);
        expect(validateState(restored)).toEqual([]);
      }
      discounted.ai.intentLog = [];
      restored.ai.intentLog = [];
      expect(restored).toEqual(discounted);
    },
  );

  it.each(['shogunate', CLAN_BETA] as const)('does not discount another target %s', (target) => {
    const plain = prepared(false, true);
    const discounted = prepared(true, true);
    workTick(plain, target);
    workTick(discounted, target);
    expect(discounted.clans[CLAN_ALPHA]!.gold).toBe(plain.clans[CLAN_ALPHA]!.gold);
    expect(discounted.rng).toEqual(plain.rng);
  });
});
