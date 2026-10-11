import { describe, expect, it } from 'vitest';
import {
  buildSaveFile,
  buildSaveMeta,
  decodeSave,
  encodeSave,
  validSaveMeta,
  type CanonicalSaveMeta,
  type SaveMetadataContext,
} from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { dayToCalendar } from '../../src/core/systems/time';
import { stateHash } from '../../src/core/state/serialize';
import { formatDate } from '../../src/i18n/zh-TW';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { createSaveStore } from '../../src/app/persistence/saveStore';
import { buildTinyState } from '../fixtures/tiny';

const additions = new Set(['date', 'dateText', 'seed', 'playtimeSeconds', 'version', 'slotLabel']);
const legacySave = () => {
  const save = buildSaveFile(buildTinyState(), 100);
  save.meta = Object.fromEntries(
    Object.entries(save.meta).filter(([key]) => !additions.has(key)),
  ) as typeof save.meta;
  return save;
};

describe('M8 additive canonical save metadata', () => {
  it.each([0, 29, 30, 59, 60, 359, 360, 719])(
    'derives canonical 360-day date from absolute day %i',
    (day) => {
      const state = buildTinyState();
      state.time.day = day;
      const metadata: CanonicalSaveMeta = buildSaveMeta(state);
      const date = dayToCalendar(day);
      expect(metadata.date).toEqual({ year: date.year, month: date.month, day: date.dayOfMonth });
      expect(metadata.dateText).toBe(formatDate(day));
      expect(metadata.day).toBe(day);
      expect(validSaveMeta(metadata)).toBe(true);
    },
  );
  it('injects app context and derives seed/version without changing state, RNG or hash', () => {
    const state = buildTinyState();
    state.meta.seed = 0xffffffff;
    const before = structuredClone(state);
    const hash = stateHash(state);
    const context = {
      playtimeSeconds: 1234,
      appVersion: '1.0.0+test',
      slotLabel: '自動・1560年春',
    };
    const save = buildSaveFile(state, 123456, [], context);
    expect(save.meta).toMatchObject({ ...context, seed: 0xffffffff, version: SAVE_FORMAT_VERSION });
    expect(save.timestamp).toBe(123456);
    expect(state).toEqual(before);
    expect(stateHash(state)).toBe(hash);
    const decoded = decodeSave(encodeSave(state, 123456, [], context));
    expect(decoded).toMatchObject({ ok: true, saveFile: { meta: save.meta } });
  });
  it('preserves existing builder signatures with explicit honest defaults', () => {
    const state = buildTinyState();
    expect(buildSaveMeta(state)).toMatchObject({
      playtimeSeconds: 0,
      slotLabel: '',
      appVersion: state.meta.appVersion,
      seed: state.meta.seed,
      version: SAVE_FORMAT_VERSION,
    });
    expect(buildSaveFile(state, 100).meta).toEqual(buildSaveMeta(state));
  });
  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, '12'])(
    'rejects invalid injected playtime %#',
    (value) => {
      const context = { playtimeSeconds: value } as unknown as SaveMetadataContext;
      expect(() => buildSaveMeta(buildTinyState(), context)).toThrow();
      expect(() => buildSaveFile(buildTinyState(), 100, [], context)).toThrow();
    },
  );
  it('rejects invalid injected string context rather than producing unsafe metadata', () => {
    expect(() =>
      buildSaveMeta(buildTinyState(), { appVersion: 1 } as unknown as SaveMetadataContext),
    ).toThrow();
    expect(() =>
      buildSaveMeta(buildTinyState(), { slotLabel: null } as unknown as SaveMetadataContext),
    ).toThrow();
  });
  it('reads old current-format metadata without silently adding fields or migrating', () => {
    const legacy = legacySave();
    const before = structuredClone(legacy);
    expect(validSaveMeta(legacy.meta)).toBe(true);
    const decoded = decodeSave(JSON.stringify(legacy));
    expect(decoded).toEqual({ ok: true, saveFile: before, migrated: false });
    expect(legacy).toEqual(before);
  });
  it('roundtrips legacy and enriched metadata through the compressed store and cache repair', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    const old = legacySave();
    const enriched = buildSaveFile(buildTinyState(), 200, [], {
      playtimeSeconds: 600,
      slotLabel: '自動・1560年秋',
    });
    await store.saveToSlot('manual:1', old);
    await store.saveToSlot('auto:1', enriched);
    await adapter.delMany(['tf.save.manual:1.meta', 'tf.save.auto:1.meta']);
    const slots = await store.listSlots();
    expect(slots.find((slot) => slot.slotId === 'manual:1')).toMatchObject({
      status: 'ok',
      meta: old.meta,
      needsMigration: false,
    });
    expect(slots.find((slot) => slot.slotId === 'auto:1')).toMatchObject({
      status: 'ok',
      meta: enriched.meta,
    });
    expect(await store.loadFromSlot('manual:1')).toEqual({
      ok: true,
      save: old,
      migratedFrom: null,
    });
    expect(await store.loadFromSlot('auto:1')).toEqual({
      ok: true,
      save: enriched,
      migratedFrom: null,
    });
  });
  it.each([
    { date: null },
    { date: { year: 1560, month: 13, day: 1 } },
    { date: { year: 1560, month: 2, day: 31 } },
    { date: { year: 1560.5, month: 1, day: 1 } },
    { dateText: 5 },
    { seed: -1 },
    { seed: 0x100000000 },
    { seed: 1.5 },
    { playtimeSeconds: -1 },
    { playtimeSeconds: 0.5 },
    { playtimeSeconds: Number.MAX_SAFE_INTEGER + 1 },
    { version: 0 },
    { version: 1.5 },
    { slotLabel: null },
    { date: undefined },
  ])('rejects malformed supplied optional metadata %#', (patch) => {
    const save = legacySave();
    Object.assign(save.meta, patch);
    expect(validSaveMeta(save.meta)).toBe(false);
    if (patch.date !== undefined || !Object.hasOwn(patch, 'date'))
      expect(decodeSave(JSON.stringify(save))).toMatchObject({ ok: false, code: 'invalidFile' });
  });
});
