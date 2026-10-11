import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { selectMapViewModel } from '../../src/core/state/selectors';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import { advanceDay } from '../../src/core/systems';
import { mapHoverLines } from '../../src/ui/map/mapHoverContent';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

/** Controlled friendly corridor; no army, food or status writes after initial setup. */
function fixture(heitan: boolean) {
  const state = buildTinyState();
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 30;
  state.castles[CASTLE_A1]!.food = 50;
  state.officers[OFF_ALPHA_BUSHO]!.traits = heitan ? ['trait.heitan' as TraitId] : [];
  expect(validateState(state)).toEqual([]);
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: [],
    soldiers: 101,
    food: 50,
    targetNodeId: CASTLE_A2,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  queue.enqueue(command, state.time.day);
  return { state, queue };
}

describe('automatic return uses actual sustainable food days', () => {
  it('preserves actual food days and the return boundary through native ongoing-leg reload', () => {
    const { state, queue } = fixture(true);
    for (let tick = 1; tick <= 8; tick++) {
      advanceDay(state, queue.drain());
      expect(validateState(state)).toEqual([]);
    }
    const army = Object.values(state.armies)[0]!;
    expect(army.food).toBe(34);
    expect(army.status).toBe('marching');
    expect(army.edgeProgressDays).toBeGreaterThan(0);
    expect(army.edgeProgressDays).toBeLessThan(army.edgeCostDays);
    const decoded = decodeSave(encodeSave(state, 0));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    // Native codec deliberately omits only transient AI diagnostic intent logs.
    const persistent = (game: typeof state) => {
      const copy = structuredClone(game);
      copy.ai.intentLog = [];
      return copy;
    };
    expect(persistent(restored)).toEqual(persistent(state));
    for (let tick = 9; tick <= 18; tick++) {
      const originalResult = advanceDay(state, []);
      const restoredResult = advanceDay(restored, []);
      expect(restoredResult.events).toEqual(originalResult.events);
      expect(restoredResult.appliedCommands).toEqual(originalResult.appliedCommands);
      expect(persistent(restored)).toEqual(persistent(state));
      expect(restored.rng).toEqual(state.rng);
      expect(validateState(state)).toEqual([]);
      expect(validateState(restored)).toEqual([]);
      const current = state.armies[army.id]!;
      expect(current.food).toBe(50 - tick * 2);
      expect(current.status).toBe(tick < 18 ? 'marching' : 'returning');
      expect(
        selectMapViewModel(restored).armies.find((entry) => entry.id === army.id)!.foodDays,
      ).toBe(current.food / 2);
    }
  });

  it('projects the same actual remaining days from a normally depleted queued army', () => {
    const { state, queue } = fixture(true);
    for (let tick = 0; tick < 14; tick++) {
      const result = advanceDay(state, queue.drain());
      expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(validateState(state)).toEqual([]);
    }
    const army = Object.values(state.armies)[0]!;
    expect(army.food).toBe(22);
    expect(army.status).toBe('marching');
    const before = structuredClone(state);
    const hover = mapHoverLines(state, 'army', army.id);
    expect(hover![1]).toBe('兵糧尚可支11日');
    const model = selectMapViewModel(state);
    expect(state).toEqual(before);
    expect(model.armies.find((entry) => entry.id === army.id)!.foodDays).toBe(11);
  });

  it.each([true, false])('waits for actual daily consumption threshold; Heitan=%s', (heitan) => {
    const { state, queue } = fixture(heitan);
    const daily = Math.ceil(
      101 * BAL.fieldFoodPerSoldierDaily * (heitan ? 1 - BAL.traitHeitan : 1),
    );
    expect(daily).toBe(heitan ? 2 : 3);
    const boundaryTick = Math.ceil((50 - BAL.autoReturnFoodDays * daily) / daily);
    for (let tick = 1; tick <= boundaryTick; tick++) {
      const result = advanceDay(state, queue.drain());
      expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(validateState(state)).toEqual([]);
      if (tick === 1) expect(result.appliedCommands).toHaveLength(1);
      const army = Object.values(state.armies)[0]!;
      expect(army).toBeDefined();
      expect(army.food).toBe(50 - tick * daily);
      expect(army.posNodeId).toBe(CASTLE_A1);
      expect(army.status, `tick=${tick}, food=${army.food}, actualDays=${army.food / daily}`).toBe(
        tick < boundaryTick ? 'marching' : 'returning',
      );
      expect(army.targetNodeId).toBe(tick < boundaryTick ? CASTLE_A2 : CASTLE_A1);
      expect(result.events.some((event) => event.type === 'army.arrived')).toBe(false);
      if (tick < boundaryTick) expect(army.food / daily).toBeGreaterThan(BAL.autoReturnFoodDays);
      else expect(army.food / daily).toBeLessThanOrEqual(BAL.autoReturnFoodDays);
    }
  });
});
