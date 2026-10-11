import { describe, expect, it } from 'vitest';
import { buildSaveFile, decodeSave, encodeSave } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import {
  defaultOmittedEventPersistenceFields,
  validateSavedEvents,
} from '../../src/core/save/validateEvents';
import { validateState } from '../../src/core/state/invariants';
import type { EventId } from '../../src/core/state/ids';
import type { EventHookSignal } from '../../src/core/systems/events/types';
import {
  buildTinyState,
  CASTLE_A1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

const binding = { clanId: CLAN_ALPHA, castleId: CASTLE_A1, districtId: DIST_A1X };
const signal: EventHookSignal = {
  kind: 'battleEnded',
  day: 90,
  clanIds: [CLAN_ALPHA, CLAN_BETA],
  castleId: null,
  officerId: null,
  winnerClanId: CLAN_ALPHA,
  playerInvolved: true,
};

describe('M8 persisted event boundary fields', () => {
  it.each([1, 2])(
    'historical format%i migration also supplies only the omitted event defaults',
    (version) => {
      const save = buildSaveFile(buildTinyState(), 123);
      save.version = version;
      save.state.meta.saveVersion = version;
      const legacy = structuredClone(save) as unknown as {
        state: { events: Record<string, unknown> };
      };
      delete legacy.state.events.pendingChoiceBinding;
      delete legacy.state.events.hookSignals;
      const decoded = decodeSave(JSON.stringify(legacy));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.migrated).toBe(true);
      expect(decoded.saveFile.version).toBe(SAVE_FORMAT_VERSION);
      expect(decoded.saveFile.state.events).toEqual(save.state.events);
      expect(decoded.saveFile.state.rng).toEqual(save.state.rng);
    },
  );
  it('roundtrips pending binding and all hook kinds in original order without RNG changes', () => {
    const state = buildTinyState();
    state.events.pendingChoiceEventId = 'evt.pending-save' as EventId;
    state.events.pendingChoiceBinding = binding;
    state.events.hookSignals = [
      {
        ...signal,
        kind: 'castleFallen',
        castleId: CASTLE_A1,
        winnerClanId: null,
        playerInvolved: false,
      },
      {
        ...signal,
        kind: 'clanDestroyed',
        clanIds: [CLAN_BETA],
        winnerClanId: null,
        playerInvolved: false,
      },
      {
        ...signal,
        kind: 'leaderDied',
        clanIds: [CLAN_ALPHA],
        officerId: OFF_ALPHA_LORD,
        winnerClanId: null,
        playerInvolved: false,
      },
      signal,
    ];
    expect(validateState(state)).toEqual([]);
    const before = structuredClone(state);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.migrated).toBe(false);
    expect(decoded.saveFile.state.events).toEqual(before.events);
    expect(decoded.saveFile.state.rng).toEqual(before.rng);
    expect(validateState(decoded.saveFile.state)).toEqual([]);
    expect(state).toEqual(before);
  });

  it('omitted format3 fields default additively without format bump, inferred binding, or source mutation', () => {
    const save = buildSaveFile(buildTinyState(), 123);
    save.state.events.pendingChoiceEventId = 'evt.legacy-pending' as EventId;
    const legacy = structuredClone(save) as unknown as {
      version: number;
      state: { events: Record<string, unknown> };
    };
    delete legacy.state.events.pendingChoiceBinding;
    delete legacy.state.events.hookSignals;
    const raw = JSON.stringify(legacy);
    const decoded = decodeSave(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.migrated).toBe(false);
    expect(decoded.saveFile.version).toBe(SAVE_FORMAT_VERSION);
    expect(SAVE_FORMAT_VERSION).toBe(4);
    expect(decoded.saveFile.state.events).toEqual({
      ...save.state.events,
      pendingChoiceBinding: null,
      hookSignals: [],
    });
    expect(decoded.saveFile.state.rng).toEqual(save.state.rng);
    expect(JSON.stringify(legacy)).toBe(raw);
    expect(decodeSave(JSON.stringify(decoded.saveFile))).toEqual(decoded);
  });

  it.each([
    true,
    {},
    { ...binding, clanId: 'castle.a1' },
    { ...binding, castleId: '$castle' },
    { clanId: CLAN_ALPHA, castleId: null },
    { ...binding, extra: 1 },
  ])('rejects malformed provided pending binding %# rather than defaulting it', (value) => {
    const save = buildSaveFile(buildTinyState(), 123);
    save.state.events.pendingChoiceEventId = 'evt.pending-save' as EventId;
    const events = save.state.events as unknown as Record<string, unknown>;
    events.pendingChoiceBinding = value;
    expect(decodeSave(JSON.stringify(save))).toEqual({ ok: false, code: 'corrupt' });
  });

  it('rejects an orphan binding when no event is pending', () => {
    const save = buildSaveFile(buildTinyState(), 123);
    save.state.events.pendingChoiceBinding = binding;
    expect(decodeSave(JSON.stringify(save))).toEqual({ ok: false, code: 'corrupt' });
  });

  it.each([
    null,
    {},
    [null],
    [{ ...signal, kind: 'unknown' }],
    [{ ...signal, day: -1 }],
    [{ ...signal, day: 0.5 }],
    [{ ...signal, day: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...signal, clanIds: ['castle.a1'] }],
    [{ ...signal, castleId: '$castle' }],
    [{ ...signal, officerId: 'clan.alpha' }],
    [{ ...signal, winnerClanId: 'off.alpha-lord' }],
    [{ ...signal, playerInvolved: 1 }],
    [{ ...signal, extra: true }],
    [{ kind: 'battleEnded', day: 90, clanIds: [CLAN_ALPHA] }],
  ])('rejects malformed provided hook signals %# rather than discarding them', (value) => {
    const save = buildSaveFile(buildTinyState(), 123);
    (save.state.events as unknown as Record<string, unknown>).hookSignals = value;
    expect(decodeSave(JSON.stringify(save))).toEqual({ ok: false, code: 'corrupt' });
  });

  it('runtime guard is pure and normalizer does not overwrite present undefined fields', () => {
    const state = buildTinyState();
    const events = state.events as unknown as Record<string, unknown>;
    events.pendingChoiceBinding = undefined;
    events.hookSignals = undefined;
    defaultOmittedEventPersistenceFields(state);
    expect(Object.hasOwn(events, 'pendingChoiceBinding')).toBe(true);
    expect(events.pendingChoiceBinding).toBeUndefined();
    expect(events.hookSignals).toBeUndefined();
    expect(validateSavedEvents(state)).toBe(false);
    const before = structuredClone(state);
    validateSavedEvents(state);
    expect(state).toEqual(before);
  });
});
