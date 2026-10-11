import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { RANK_VALUES } from '../../src/core/state/enums';
import { createMarchDraft, marchOfficerEligible } from '../../src/ui/screens/marchDraft';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

describe('pure castle march draft initialization', () => {
  it('retains ordered roles and canonical commander-only defaults without mutating the game', () => {
    const game = buildTinyState();
    const castle = game.castles[CASTLE_A1]!;
    const officer = game.officers[OFF_ALPHA_BUSHO]!;
    const cap = Math.min(castle.soldiers, BAL.rankTroopCap[RANK_VALUES.indexOf(officer.rank)]!);
    const soldiers = Math.max(0, Math.min(cap, Math.round(cap / 100) * 100));
    const foodMax = Math.min(
      castle.food,
      soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays,
    );
    const before = structuredClone(game);
    expect(createMarchDraft(game, CASTLE_A1, [OFF_ALPHA_BUSHO, OFF_ALPHA_LORD])).toMatchObject({
      leaderOfficerId: OFF_ALPHA_BUSHO,
      subOfficerIds: [OFF_ALPHA_LORD],
      soldiers,
      food: Math.max(
        0,
        Math.min(
          foodMax,
          Math.round((soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays) / 100) * 100,
        ),
      ),
      targetNodeId: null,
      phase: 'compose',
    });
    expect(game).toEqual(before);
  });

  it('uses the ruling lord cap regardless of retained rank and keeps an empty selection blank', () => {
    const game = buildTinyState();
    game.castles[CASTLE_A1]!.soldiers = 7900;
    const lord = createMarchDraft(game, CASTLE_A1, [OFF_ALPHA_LORD]);
    expect(lord?.soldiers).toBe(Math.min(7900, BAL.rankTroopCap[RANK_VALUES.length - 1]!));
    expect(createMarchDraft(game, CASTLE_A1)).toMatchObject({
      leaderOfficerId: null,
      subOfficerIds: [],
      soldiers: 0,
      food: 0,
    });
  });

  it('refuses stale, duplicate, excessive or foreign rosters without silently promoting a deputy', () => {
    const game = buildTinyState();
    expect(createMarchDraft(game, CASTLE_A1, [OFF_ALPHA_BUSHO, OFF_ALPHA_BUSHO])).toBeNull();
    expect(createMarchDraft(game, CASTLE_A1, [OFF_BETA_BUSHO, OFF_ALPHA_LORD])).toBeNull();
    expect(
      createMarchDraft(game, CASTLE_A1, Array(2 + BAL.maxDeputies).fill(OFF_ALPHA_LORD)),
    ).toBeNull();
    game.officers[OFF_ALPHA_BUSHO]!.hasComeOfAge = false;
    expect(createMarchDraft(game, CASTLE_A1, [OFF_ALPHA_BUSHO, OFF_ALPHA_LORD])).toBeNull();
    game.officers[OFF_ALPHA_BUSHO]!.hasComeOfAge = true;
    game.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target: CLAN_BETA,
      officerId: OFF_ALPHA_BUSHO,
      startDay: game.time.day,
    });
    expect(marchOfficerEligible(game, CASTLE_A1, OFF_ALPHA_BUSHO)).toBe(false);
    expect(createMarchDraft(game, CASTLE_A1, [OFF_ALPHA_BUSHO, OFF_ALPHA_LORD])).toBeNull();
  });

  it('refuses foreign or delegated castles and preserves small-garrison clipping', () => {
    const game = buildTinyState();
    expect(createMarchDraft(game, CASTLE_B1)).toBeNull();
    game.castles[CASTLE_A1]!.soldiers = 101;
    expect(createMarchDraft(game, CASTLE_A1, [OFF_ALPHA_LORD])?.soldiers).toBe(100);
    game.castles[CASTLE_A1]!.directControl = false;
    expect(createMarchDraft(game, CASTLE_A1)).toBeNull();
  });
});
