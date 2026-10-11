import { describe, expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { dayToCalendar, calendarToDay } from '../../src/core/systems/time';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

describe('transient opening settlement tick output', () => {
  it('exposes only the incoming month opening and does not carry it into later ticks', () => {
    const state = buildTinyState();
    const day = calendarToDay(1560, 4, 30);
    state.time = { day, ...dayToCalendar(day) };
    const opening = advanceDay(state, []);
    expect(opening.monthOpeningSettlement).toMatchObject({
      day: day + 1,
      year: 1560,
      month: 5,
    });
    expect(opening.autosaveDue).toBe('monthly');
    const snapshot = structuredClone(opening.monthOpeningSettlement);
    const next = advanceDay(state, []);
    expect(next).not.toHaveProperty('monthOpeningSettlement');
    expect(next.autosaveDue).toBeNull();
    expect(opening.monthOpeningSettlement).toEqual(snapshot);
    expect(state).not.toHaveProperty('monthOpeningSettlement');
  });

  it('recreates the same settlement after a real save decode across a year boundary', () => {
    const state = buildTinyState();
    const day = calendarToDay(1560, 12, 30);
    state.time = { day, ...dayToCalendar(day) };
    expect(validateState(state)).toEqual([]);
    const saved = encodeSave(state, 123);
    expect(saved).not.toContain('monthOpeningSettlement');
    const decoded = decodeSave(saved);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Opening settlement fixture failed to decode');
    const restored = decoded.saveFile.state;
    const originalTick = advanceDay(state, []);
    const restoredTick = advanceDay(restored, []);
    expect(originalTick.monthOpeningSettlement).toMatchObject({ year: 1561, month: 1 });
    expect(restoredTick.monthOpeningSettlement).toEqual(originalTick.monthOpeningSettlement);
    expect(restoredTick.events).toEqual(originalTick.events);
    expect(restored).toEqual(state);
    expect(restored.rng).toEqual(state.rng);
    expect(validateState(restored)).toEqual([]);
    // The output is detached from the authoritative wallet, even at runtime.
    const row = restoredTick.monthOpeningSettlement?.clans.find((c) => c.clanId === CLAN_ALPHA);
    expect(row).toBeDefined();
    const gold = restored.clans[CLAN_ALPHA]!.gold;
    Object.assign(row!, { goldAfter: -1 });
    expect(restored.clans[CLAN_ALPHA]!.gold).toBe(gold);
    expect(originalTick.monthOpeningSettlement).not.toEqual(restoredTick.monthOpeningSettlement);
  });
});
