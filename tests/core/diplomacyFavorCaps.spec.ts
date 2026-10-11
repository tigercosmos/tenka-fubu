import { describe, expect, it, vi } from 'vitest';
import { BAL } from '../../src/core/balance';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { CLAN_ALPHA, OFF_ALPHA_TAISHO, buildTinyState } from '../fixtures/tiny';

// Distinct test-only caps expose accidental cross-routing of equal production caps.
vi.mock('../../src/core/balance', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/core/balance')>();
  return { ...original, BAL: { ...original.BAL, courtFavorMax: 89, shogunateFavorMax: 97 } };
});

describe('monthly favor uses the destination-specific cap', () => {
  it.each(['court', 'shogunate'] as const)('caps %s work independently', (target) => {
    const state = buildTinyState();
    state.time.dayOfMonth = 1;
    state.court.shogunateExists = true;
    state.clans[CLAN_ALPHA]!.gold = 100_000;
    state.court.courtFavor[CLAN_ALPHA] = BAL.courtFavorMax - 1;
    state.court.shogunateFavor[CLAN_ALPHA] = BAL.shogunateFavorMax - 1;
    state.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target,
      officerId: OFF_ALPHA_TAISHO,
      startDay: state.time.day,
    });

    diplomacySystem(state);

    expect(state.court.courtFavor[CLAN_ALPHA]).toBe(
      target === 'court' ? BAL.courtFavorMax : BAL.courtFavorMax - 1 - BAL.courtFavorDecayMonthly,
    );
    expect(state.court.shogunateFavor[CLAN_ALPHA]).toBe(
      target === 'shogunate'
        ? BAL.shogunateFavorMax
        : BAL.shogunateFavorMax - 1 - BAL.shogunateFavorDecayMonthly,
    );
  });
});
