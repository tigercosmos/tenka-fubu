import { describe, expect, it } from 'vitest';
import { CommandLogRecorder, replayCommandLog } from '../../src/core/replay/commandLog';
import { advanceDay } from '../../src/core/systems';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import type { CommandEnvelope } from '../../src/core/commands/types';
import { validateState } from '../../src/core/state/invariants';
import { dayToCalendar } from '../../src/core/systems/time';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

function catalog(): EventDef[] {
  return [
    {
      id: 'evt.replay-fixture' as EventId,
      kind: 'generic',
      priority: 20,
      target: 'randomDistrict',
      ownerCandidates: [CLAN_ALPHA],
      trigger: {
        from: { year: 1560, month: 1, day: 1 },
        to: { year: 1562, month: 12, day: 30 },
        check: 'monthStart',
        hooks: [],
        conditions: [],
        probability: 1,
        once: true,
        cooldownDays: 0,
        cooldownKey: null,
      },
      cutscene: { title: 'Replay fixture', body: 'Replay fixture', monClanId: '$clan' },
      effects: [{ op: 'setFlag', key: 'replay-common', value: 1 }],
      choices: [
        {
          label: 'Accept',
          conditions: [],
          aiWeight: 1,
          effects: [
            { op: 'addDistrictOrder', districtId: '$district', amount: -7 },
            { op: 'setFlag', key: 'replay-choice', value: 1 },
          ],
        },
        {
          label: 'Decline',
          conditions: [],
          aiWeight: 1,
          effects: [{ op: 'setFlag', key: 'replay-choice', value: 2 }],
        },
      ],
    },
  ];
}

function initialState() {
  const state = buildTinyState();
  state.time = { day: 29, ...dayToCalendar(29) };
  return state;
}

function record() {
  const state = initialState();
  const engine = createRuntimeEventEngine(catalog());
  const recorder = new CommandLogRecorder();
  const rngBefore = structuredClone(state.rng);
  const first = advanceDay(state, [], { eventEngine: engine });
  recorder.recordTick(first.appliedCommands);
  expect(first.events.some((event) => event.type === 'event.fired')).toBe(true);
  expect(state.events.pendingChoiceEventId).toBe(catalog()[0]!.id);
  expect(state.events.pendingChoiceBinding?.districtId).not.toBeNull();
  expect(state.rng.event).not.toEqual(rngBefore.event);
  const envelope: CommandEnvelope = {
    seq: state.meta.lastAppliedCmdSeq + 1,
    issuedDay: state.time.day,
    command: {
      type: 'resolveEventChoice',
      clanId: CLAN_ALPHA,
      eventId: catalog()[0]!.id,
      choiceIndex: 0,
    },
  };
  const second = advanceDay(state, [envelope], { eventEngine: engine });
  expect(second.appliedCommands).toEqual([envelope]);
  recorder.recordTick(second.appliedCommands);
  expect(state.events.flags['replay-choice']).toBe(1);
  expect(state.events.pendingChoiceEventId).toBeNull();
  expect(validateState(state)).toEqual([]);
  return { state, log: recorder.export(state) };
}

describe('event-runtime command log replay context', () => {
  it('replays actual fired event bindings and choice effects with identical full hash and RNG', () => {
    const { state, log } = record();
    expect(log.truncated).toBe(false);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.command.type).toBe('resolveEventChoice');
    const rebuilt = initialState();
    const result = replayCommandLog(log, () => rebuilt, {
      eventEngine: createRuntimeEventEngine(catalog()),
    });
    expect(result).toMatchObject({
      match: true,
      balanceMismatch: false,
      actualHash: log.finalHash,
    });
    expect(rebuilt).toEqual(state);
    expect(rebuilt.rng).toEqual(state.rng);
    expect(validateState(rebuilt)).toEqual([]);
    expect(
      replayCommandLog(log, initialState, { eventEngine: createRuntimeEventEngine(catalog()) }),
    ).toEqual(result);
  });

  it('cannot pretend event-dependent logs match without the injected runtime', () => {
    const { log } = record();
    const rebuilt = initialState();
    const result = replayCommandLog(log, () => rebuilt);
    expect(result.match).toBe(false);
    expect(result.balanceMismatch).toBe(false);
    expect(rebuilt.events.flags).toEqual({});
    expect(rebuilt.events.fired).toEqual({});
  });

  it('detects a different injected catalog and choice-command tampering', () => {
    const { log } = record();
    const different = catalog();
    different[0]!.effects = [{ op: 'setFlag', key: 'different-common', value: 1 }];
    expect(
      replayCommandLog(log, initialState, { eventEngine: createRuntimeEventEngine(different) })
        .match,
    ).toBe(false);
    const tampered = structuredClone(log);
    const command = tampered.entries[0]!.command;
    if (command.type !== 'resolveEventChoice') throw new Error('Expected recorded event choice');
    command.choiceIndex = 1;
    expect(
      replayCommandLog(tampered, initialState, { eventEngine: createRuntimeEventEngine(catalog()) })
        .match,
    ).toBe(false);
  });
});
