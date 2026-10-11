import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  monthlyGoldIncome,
  monthlyGoldIncomeForCastles,
  castleHarvest,
} from '../../src/core/domestic';
import { applyCreateCorps } from '../../src/core/commands/corpsCommands';
import { economySystem } from '../../src/core/systems/economy';
import { splitCorpsIncome } from '../../src/core/systems/corps';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';
import type { PolicyId } from '../../src/core/state/ids';
import type { GameState } from '../../src/core/state/gameState';

function twoCorps(state: GameState) {
  for (const [castleId, officerId] of [
    [CASTLE_A1, OFF_ALPHA_BUSHO],
    [CASTLE_A2, OFF_ALPHA_TAISHO],
  ] as const) {
    state.officers[officerId]!.rank = 'karo';
    state.castles[castleId]!.directControl = true;
    applyCreateCorps(
      state,
      {
        type: 'createCorps',
        clanId: CLAN_ALPHA,
        corpsLeaderId: officerId,
        castleIds: [castleId],
        directive: 'hold',
        targetNodeId: null,
      },
      () => {},
    );
  }
}

describe('difficulty and regional corps economy integration', () => {
  it('preserves integer total income across two corps, rounding and one clan-wide flat grant', () => {
    const state = buildTinyState();
    state.meta.playerClanId = CLAN_BETA;
    state.meta.difficulty = 'hard';
    state.policies[CLAN_ALPHA]!.active = ['pol.nanban' as PolicyId];
    for (const district of Object.values(state.districts))
      if (district.ownerClanId === CLAN_ALPHA) district.commerce = 137;
    twoCorps(state);
    const total = Math.floor(monthlyGoldIncome(state, CLAN_ALPHA) * 1.2);
    const retained = [CASTLE_A1, CASTLE_A2].map(
      (id) =>
        splitCorpsIncome(Math.floor(monthlyGoldIncomeForCastles(state, [id]) * 1.2)).corpsGold,
    );
    const events = economySystem(state);
    const income = events.find((e) => e.type === 'economy.income' && e.clanId === CLAN_ALPHA);
    expect(income).toMatchObject({
      type: 'economy.income',
      gold: total - retained.reduce((a, b) => a + b, 0),
    });
    const corpsIncome = Object.values(state.corps).map((c) => c.gold);
    expect(corpsIncome).toEqual(retained);
    expect(
      (income?.type === 'economy.income' ? income.gold : 0) +
        corpsIncome.reduce((a, b) => a + b, 0),
    ).toBe(total);
  });
  it('charges vassal tribute only on actual clan-wallet income, not retained corps shares or treasury', () => {
    const ordinary = buildTinyState();
    twoCorps(ordinary);
    const subject = structuredClone(ordinary);
    ensureDiplomacyRow(subject, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'vassal',
      startDay: subject.time.day,
      endDay: null,
      vassalClanId: CLAN_ALPHA,
    });
    const events = economySystem(ordinary);
    const income = events.find((e) => e.type === 'economy.income' && e.clanId === CLAN_ALPHA)!;
    if (income.type !== 'economy.income') throw new Error('expected income');
    const tribute = Math.floor(income.gold * BAL.vassalTributeRate);
    economySystem(subject);
    expect(ordinary.clans[CLAN_ALPHA]!.gold - subject.clans[CLAN_ALPHA]!.gold).toBe(tribute);
    expect(subject.clans[CLAN_BETA]!.gold - ordinary.clans[CLAN_BETA]!.gold).toBe(tribute);
    expect(Object.values(subject.corps).map((c) => c.gold)).toEqual(
      Object.values(ordinary.corps).map((c) => c.gold),
    );
  });
  it('never buffs player corps or player harvest while applying AI difficulty to gold and food', () => {
    const state = buildTinyState();
    state.meta.difficulty = 'hard';
    state.time.month = 9;
    state.time.dayOfMonth = 1;
    twoCorps(state);
    for (const castle of Object.values(state.castles)) {
      castle.food = 0;
      castle.soldiers = 0;
    }
    const goldAlpha = monthlyGoldIncome(state, CLAN_ALPHA);
    const goldBeta = Math.floor(monthlyGoldIncome(state, CLAN_BETA) * 1.2);
    const foodAlpha = Object.values(state.castles)
      .filter((c) => c.ownerClanId === CLAN_ALPHA)
      .reduce((sum, c) => sum + castleHarvest(state, c.id), 0);
    const foodBeta = Object.values(state.castles)
      .filter((c) => c.ownerClanId === CLAN_BETA)
      .reduce((sum, c) => sum + Math.floor(castleHarvest(state, c.id) * 1.2), 0);
    const events = economySystem(state);
    const incomes = events.filter((e) => e.type === 'economy.income');
    const playerIncome = incomes.find((e) => e.clanId === CLAN_ALPHA)!.gold;
    expect(playerIncome + Object.values(state.corps).reduce((sum, c) => sum + c.gold, 0)).toBe(
      goldAlpha,
    );
    expect(incomes.find((e) => e.clanId === CLAN_BETA)!.gold).toBe(goldBeta);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'economy.harvest',
        clanId: CLAN_ALPHA,
        totalFood: foodAlpha,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'economy.harvest', clanId: CLAN_BETA, totalFood: foodBeta }),
    );
  });
});
