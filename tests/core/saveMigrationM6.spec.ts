import { describe, expect, it } from 'vitest';
import { buildSaveFile, decodeSave, encodeSave } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { canonicalStringify, stateHash } from '../../src/core/state/serialize';
import { betrayalDailyTick } from '../../src/core/systems/plots';
import { BAL } from '../../src/core/balance';
import { DAYS_PER_MONTH } from '../../src/core/systems/time';
import {
  buildTinyState,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

describe('M6 betrayal save format migration', () => {
  it('upgrades v1 with neutral defaults and clears unsafe legacy owner/lord-less marks', () => {
    const state = buildTinyState();
    const save = buildSaveFile(state, 0);
    const legacy = JSON.parse(JSON.stringify(save)) as {
      version: number;
      state: { meta: { saveVersion: number }; castles: Record<string, Record<string, unknown>> };
    };
    legacy.version = 1;
    legacy.state.meta.saveVersion = 1;
    for (const castle of Object.values(legacy.state.castles)) {
      delete castle.betrayalImmunityUntilDay;
      delete castle.betrayalReadyTargetClanId;
      delete castle.betrayalReadyTargetLordId;
      castle.betrayalReadyClanId = CLAN_ALPHA;
      castle.betrayalReadyUntilDay = state.time.day + 1;
    }
    const decoded = decodeSave(JSON.stringify(legacy));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.migrated).toBe(true);
    expect(decoded.saveFile.version).toBe(SAVE_FORMAT_VERSION);
    expect(decoded.saveFile.state.meta.saveVersion).toBe(SAVE_FORMAT_VERSION);
    for (const castle of Object.values(decoded.saveFile.state.castles))
      expect(castle).toMatchObject({
        betrayalImmunityUntilDay: 0,
        betrayalReadyClanId: null,
        betrayalReadyUntilDay: 0,
        betrayalReadyTargetClanId: null,
        betrayalReadyTargetLordId: null,
      });
    expect(decoded.saveFile.state.rng).toEqual(state.rng);
    expect(decoded.saveFile.state.clans).toEqual(state.clans);
  });

  it('roundtrips v2 immunity, ownership/lord snapshots, exact expiry and canonical hash', () => {
    const state = buildTinyState(),
      castle = state.castles[CASTLE_B1]!;
    castle.lordId = OFF_BETA_TAISHO;
    castle.betrayalReadyClanId = CLAN_ALPHA;
    castle.betrayalReadyTargetClanId = CLAN_BETA;
    castle.betrayalReadyTargetLordId = OFF_BETA_TAISHO;
    castle.betrayalReadyUntilDay = state.time.day + BAL.plotBetrayalMarkMonths * DAYS_PER_MONTH;
    castle.betrayalImmunityUntilDay =
      state.time.day + BAL.plotBetrayalImmunityMonths * DAYS_PER_MONTH;
    const decoded = decodeSave(encodeSave(state, 0));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.migrated).toBe(false);
    expect(canonicalStringify(decoded.saveFile.state)).toBe(canonicalStringify(state));
    expect(stateHash(decoded.saveFile.state)).toBe(stateHash(state));
    betrayalDailyTick(decoded.saveFile.state, () => {});
    expect(decoded.saveFile.state.castles[CASTLE_B1]!.betrayalReadyClanId).toBe(CLAN_ALPHA);
    decoded.saveFile.state.castles[CASTLE_B1]!.lordId = null;
    betrayalDailyTick(decoded.saveFile.state, () => {});
    expect(decoded.saveFile.state.castles[CASTLE_B1]!.betrayalReadyClanId).toBeNull();
    expect(decoded.saveFile.state.castles[CASTLE_B1]!.betrayalImmunityUntilDay).toBe(
      castle.betrayalImmunityUntilDay,
    );
  });
});
