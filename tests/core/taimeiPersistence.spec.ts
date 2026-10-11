import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateSavedTaimei } from '../../src/core/save/validateTaimei';
import { TAIMEI_CATALOG } from '../../src/core/systems/events/taimeiCatalog';
import { buildTinyState } from '../fixtures/tiny';

describe('Taimei persisted lifecycle', () => {
  it('preserves all eight active identities and cooldown without spending resources', () => {
    expect(TAIMEI_CATALOG).toHaveLength(8);
    for (const def of TAIMEI_CATALOG) {
      const state = buildTinyState();
      const clan = state.clans[state.meta.playerClanId]!;
      clan.taimei = {
        activeTaimeiId: def.id,
        activeUntilDay: state.time.day + def.durationDays,
        cooldownUntilDay: state.time.day + def.durationDays + BAL.taimeiCooldownDays,
      };
      const decoded = decodeSave(encodeSave(state, 123));
      expect(decoded.ok).toBe(true);
      if (decoded.ok) expect(decoded.saveFile.state).toEqual(state);
    }
  });

  it('retains an overdue identity for normal expiry instead of rewriting it on load', () => {
    const state = buildTinyState();
    state.clans[state.meta.playerClanId]!.taimei = {
      activeTaimeiId: TAIMEI_CATALOG[0]!.id,
      activeUntilDay: 1,
      cooldownUntilDay: 1 + BAL.taimeiCooldownDays,
    };
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.saveFile.state).toEqual(state);
  });

  it('preserves an inactive shared cooldown and all ordinary old-format lifecycle defaults', () => {
    const state = buildTinyState();
    state.clans[state.meta.playerClanId]!.taimei.cooldownUntilDay = state.time.day + 100;
    expect(validateSavedTaimei(state)).toBe(true);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.saveFile.state).toEqual(state);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { activeTaimeiId: 'taimei.unknown', activeUntilDay: 0, cooldownUntilDay: 180 },
    { activeTaimeiId: null, activeUntilDay: 1, cooldownUntilDay: 180 },
    { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: -1 },
    { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 1.5 },
    { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: Number.MAX_SAFE_INTEGER + 1 },
    { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: '180' },
    { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 180, extra: true },
  ])('rejects malformed lifecycle %# rather than repairing it', (taimei) => {
    const save = JSON.parse(encodeSave(buildTinyState(), 123)) as {
      state: { meta: { playerClanId: string }; clans: Record<string, { taimei: unknown }> };
    };
    save.state.clans[save.state.meta.playerClanId]!.taimei = taimei;
    expect(decodeSave(JSON.stringify(save))).toEqual({ ok: false, code: 'corrupt' });
  });
});
