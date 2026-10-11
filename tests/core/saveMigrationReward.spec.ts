import { describe, expect, it } from 'vitest';
import { buildSaveFile, decodeSave, encodeSave } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION, runMigrationChain } from '../../src/core/save/migrate';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

describe('v4 monthly reward accounting persistence', () => {
  it.each([1, 2, 3])(
    'migrates v%s to unknown totals without inferring or retaining stray history',
    (version) => {
      const save = buildSaveFile(buildTinyState(), 123);
      save.version = version;
      save.state.meta.saveVersion = version;
      const original = structuredClone(save);
      const clans = save.state.clans as unknown as Record<string, Record<string, unknown>>;
      for (const clan of Object.values(clans)) clan.rewardGoldSpentThisMonth = 999;
      runMigrationChain(save);
      expect(save.version).toBe(4);
      expect(save.state.meta.saveVersion).toBe(4);
      for (const [id, clan] of Object.entries(save.state.clans)) {
        expect(clan).toEqual({
          ...original.state.clans[id as keyof typeof original.state.clans],
          rewardGoldSpentThisMonth: null,
        });
      }
      expect(save.state.rng).toEqual(original.state.rng);
      expect(save.state.officers).toEqual(original.state.officers);
      expect(save.timestamp).toBe(original.timestamp);
      const decoded = decodeSave(JSON.stringify(save));
      expect(decoded.ok).toBe(true);
    },
  );

  it.each([0, 123, null])('preserves v4 total %s in an owned roundtrip', (amount) => {
    const state = buildTinyState();
    (state.clans[CLAN_ALPHA] as unknown as Record<string, unknown>).rewardGoldSpentThisMonth =
      amount;
    const before = structuredClone(state);
    expect(SAVE_FORMAT_VERSION).toBe(4);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.migrated).toBe(false);
    expect(decoded.saveFile.state).toEqual(before);
    expect(validateState(decoded.saveFile.state)).toEqual([]);
    expect(state).toEqual(before);
    decoded.saveFile.state.clans[CLAN_ALPHA]!.gold++;
    expect(state).toEqual(before);
  });

  it.each([
    ['missing', undefined],
    ['explicit undefined', undefined],
    ['negative', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['string', '123'],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['fraction', 0.5],
  ])('rejects malformed v4 counter: %s', (label, amount) => {
    const state = buildTinyState();
    const clan = state.clans[CLAN_ALPHA] as unknown as Record<string, unknown>;
    if (label === 'missing') delete clan.rewardGoldSpentThisMonth;
    else clan.rewardGoldSpentThisMonth = amount;
    expect(validateState(state).some((entry) => entry.inv === 'INV-16')).toBe(true);
    const save = buildSaveFile(state, 123);
    save.version = 4;
    save.state.meta.saveVersion = 4;
    // JSON maps nonfinite numbers to null; INV checks the raw value, not unavailable JSON evidence.
    if (typeof amount === 'number' && !Number.isFinite(amount)) return;
    expect(decodeSave(JSON.stringify(save))).toMatchObject({ ok: false, code: 'corrupt' });
  });
});
