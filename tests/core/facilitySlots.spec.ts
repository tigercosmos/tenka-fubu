import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { validateCommand } from '../../src/core/commands/validate';
import { applyBuildFacility } from '../../src/core/commands/domesticCommands';
import { FACILITIES } from '../../src/core/facilities';
import type { FacilityTypeId, PolicyId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { facilitiesDaily } from '../../src/core/systems/facilities';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA } from '../fixtures/tiny';

const facility = (id: string) => id as FacilityTypeId;
const mainFacilities = ['fac.ichi', 'fac.komedoiya', 'fac.heisha', 'fac.umaya', 'fac.kajiba'];

describe('canonical main/branch castle facility slots', () => {
  it.each([
    { castleId: CASTLE_A1, existing: mainFacilities, limit: BAL.mainCastleSlots },
    { castleId: CASTLE_A2, existing: ['fac.ichi', 'fac.heisha'], limit: BAL.branchCastleSlots },
  ])(
    'allows exactly $limit slots including construction reservations at $castleId',
    ({ castleId, existing, limit }) => {
      const game = buildTinyState();
      const castle = game.castles[castleId]!;
      game.clans[CLAN_ALPHA]!.gold = 10_000;
      castle.facilities = existing.map(facility);
      const command = {
        type: 'buildFacility' as const,
        clanId: CLAN_ALPHA,
        castleId,
        facilityTypeId: facility('fac.kura'),
      };
      const beforeRng = structuredClone(game.rng);
      expect(validateState(game)).toEqual([]);
      expect(validateCommand(game, command)).toEqual({ ok: true });
      applyBuildFacility(game, command);
      expect(castle.facilities.length + castle.buildQueue.length).toBe(limit);
      const extra = { ...command, facilityTypeId: facility('fac.ikan') };
      expect(validateCommand(game, extra).ok).toBe(false);
      castle.buildQueue[0]!.daysLeft = 1;
      expect(facilitiesDaily(game)).toEqual([
        {
          type: 'facility.completed',
          day: game.time.day,
          clanIds: [CLAN_ALPHA],
          castleId,
          facilityTypeId: command.facilityTypeId,
        },
      ]);
      expect(castle.facilities).toHaveLength(limit);
      expect(castle.buildQueue).toEqual([]);
      expect(validateCommand(game, extra).ok).toBe(false);
      expect(validateState(game)).toEqual([]);
      expect(game.rng).toEqual(beforeRng);
    },
  );

  it('cancels and refunds a now-policy-invalid next order after a real completion', () => {
    const game = buildTinyState();
    const castle = game.castles[CASTLE_A1]!;
    const nanban = 'pol.nanban' as PolicyId;
    game.clans[CLAN_ALPHA]!.gold = 10_000;
    castle.coastal = true;
    game.policies[CLAN_ALPHA]!.active = [nanban];
    for (const id of ['fac.ichi', 'fac.nanbanji']) {
      const command = {
        type: 'buildFacility' as const,
        clanId: CLAN_ALPHA,
        castleId: castle.id,
        facilityTypeId: facility(id),
      };
      expect(validateCommand(game, command)).toEqual({ ok: true });
      applyBuildFacility(game, command);
    }
    expect(validateState(game)).toEqual([]);
    game.policies[CLAN_ALPHA]!.active = [];
    castle.buildQueue[0]!.daysLeft = 1;
    const gold = game.clans[CLAN_ALPHA]!.gold;
    const beforeRng = structuredClone(game.rng);
    expect(facilitiesDaily(game)).toHaveLength(1);
    expect(castle.facilities).toEqual([facility('fac.ichi')]);
    expect(castle.buildQueue).toEqual([]);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(
      gold + Math.floor(FACILITIES[facility('fac.nanbanji')]!.costGold * BAL.buildRefundRate),
    );
    expect(validateState(game)).toEqual([]);
    expect(game.rng).toEqual(beforeRng);
  });
});
