import { describe, expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { createEventEngine } from '../../src/core/systems/events/engine';
import { applyEventEffects } from '../../src/core/systems/events/effects';
import type { EventDef } from '../../src/core/systems/events/types';
import { reportsSystem, severityOf } from '../../src/core/systems/reports';
import { dayToCalendar } from '../../src/core/systems/time';
import type { EventId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import { buildTinyState, CLAN_BETA } from '../fixtures/tiny';

function definition(kind: EventDef['kind'] = 'historical'): EventDef {
  return {
    id: 'evt.report' as EventId,
    kind,
    priority: 20,
    target: 'fixed',
    ownerCandidates: [],
    cutscene: { title: 'Fixture', body: 'Fixture', monClanId: null },
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1561, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    effects: [],
    choices: [],
  };
}
function fixture() {
  const state = buildTinyState();
  state.time = { day: 29, ...dayToCalendar(29) };
  return state;
}

describe('catalog-aware historical report retention', () => {
  it('retains an empty-owner historical narrative through real Step3 and Step13', () => {
    const state = fixture();
    const eventRng = state.rng.event;
    const result = advanceDay(state, [], {
      eventEngine: createEventEngine([definition()], applyEventEffects),
    });
    const fired = result.events.find((event) => event.type === 'event.fired')!;
    expect(fired.clanIds).toEqual([]);
    expect(severityOf(fired, state.meta.playerClanId)).toBe('info');
    expect(state.reports.filter((report) => report.event.type === 'event.fired')).toEqual([
      expect.objectContaining({ event: fired, read: false }),
    ]);
    expect(result.autoPauseReasons).not.toContain('historicalEvent');
    expect(state.rng.event).toBe(eventRng);
  });

  it('keeps NPC generic info filtering unchanged through the same real tick', () => {
    const state = fixture();
    const def = definition('generic');
    def.ownerCandidates = [CLAN_BETA];
    advanceDay(state, [], { eventEngine: createEventEngine([def], applyEventEffects) });
    expect(state.reports.some((report) => report.event.type === 'event.fired')).toBe(false);
  });

  it('does not change default/no-catalog or unknown-event filtering and draws no RNG', () => {
    const state = fixture();
    const rng = structuredClone(state.rng);
    const event: GameEvent = {
      type: 'event.fired',
      eventId: 'evt.unknown' as EventId,
      hasChoice: false,
      day: state.time.day,
      clanIds: [],
    };
    expect(reportsSystem(state, [event])).toEqual([]);
    const engine = createEventEngine([definition()], applyEventEffects);
    expect(
      reportsSystem(state, [event], {
        isHistoricalEvent: (id) => engine.getDef(id)?.kind === 'historical',
      }),
    ).toEqual([]);
    expect(state.reports).toEqual([]);
    expect(state.rng).toEqual(rng);
  });

  it('leaves real ticks without an injected engine unchanged', () => {
    const state = fixture();
    advanceDay(state, []);
    expect(state.reports.some((report) => report.event.type === 'event.fired')).toBe(false);
  });
});
