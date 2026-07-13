import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  applyBuildFacility,
  applyEnactPolicy,
  applyGrantFief,
  applyTransport,
  validateBuildFacility,
  validateEnactPolicy,
  validateGrantFief,
  validateTransport,
} from '../../src/core/commands/domesticCommands';
import { applyCommands } from '../../src/core/commands/queue';
import {
  castleFoodCap,
  castleMaxSoldiers,
  facilityIsActive,
  garrisonFoodMonthly,
} from '../../src/core/domestic';
import { selectBudgetForecast } from '../../src/core/state/selectors';
import type { FacilityTypeId, PolicyId } from '../../src/core/state/ids';
import { conscriptionSystem } from '../../src/core/systems/conscription';
import { developDistrictDaily, developmentSystem } from '../../src/core/systems/development';
import { economySystem } from '../../src/core/systems/economy';
import { facilitiesDaily } from '../../src/core/systems/facilities';
import { applyUnpaidSalaryPenalty, loyaltyTarget } from '../../src/core/systems/officers';
import { transportDaily } from '../../src/core/systems/transport';
import { monthlyUprising } from '../../src/core/systems/uprising';
import { advanceDay } from '../../src/core/systems';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import type { ClanId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_A1Y,
  OFF_ALPHA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

const policy = (id: string): PolicyId => id as PolicyId;
const facility = (id: string): FacilityTypeId => id as FacilityTypeId;

describe('M3 內政 core', () => {
  it('政務 80 的受封郡每日開發採月額 60 起步並受上限約束', () => {
    const state = buildTinyState();
    const district = state.districts[DIST_A1X];
    const officer = state.officers[OFF_ALPHA_BUSHO];
    expect(district).toBeDefined();
    expect(officer).toBeDefined();
    district!.stewardId = OFF_ALPHA_BUSHO;
    district!.developFocus = 'agri';
    district!.kokudaka = 0;
    district!.kokudakaCap = 10_000;
    officer!.pol = 80;
    for (let day = 0; day < 30; day += 1) developDistrictDaily(state, district!);
    expect(district!.kokudaka).toBeGreaterThan(59);
    expect(district!.kokudaka).toBeLessThanOrEqual(60);
    district!.kokudaka = district!.kokudakaCap;
    developDistrictDaily(state, district!);
    expect(district!.kokudaka).toBe(district!.kokudakaCap);
  });

  it('徵兵與上限由人口、城格、方針共同推導', () => {
    const state = buildTinyState();
    const castle = state.castles[CASTLE_A1]!;
    castle.soldiers = 0;
    castle.conscriptPolicy = 'mid';
    for (const districtId of castle.districtIds) state.districts[districtId]!.population = 15_000;
    expect(castleMaxSoldiers(state, castle)).toBe(1750);
    const events = conscriptionSystem(state);
    expect(castle.soldiers).toBe(150);
    expect(events[0]).toMatchObject({ type: 'conscript.completed', soldiers: 150 });
  });

  it('兵糧小數累加器長期結算無漂移', () => {
    const state = buildTinyState();
    for (const castle of Object.values(state.castles)) {
      castle.soldiers = 0;
      castle.food = 100_000;
    }
    const castle = state.castles[CASTLE_A1]!;
    castle.soldiers = 100;
    state.time.dayOfMonth = 2;
    const before = castle.food;
    for (let day = 0; day < 1000; day += 1) economySystem(state);
    const exact = (100 * BAL.garrisonFoodPerSoldierMonthly * 1000) / 30;
    expect(before - castle.food).toBe(Math.floor(exact));
    expect(castle.foodFrac).toBeCloseTo(exact - Math.floor(exact), 10);
  });

  it('知行驗證、罷免忠誠與無效領主自動解除', () => {
    const state = buildTinyState();
    const officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.rank = 'busho';
    officer.locationCastleId = CASTLE_A1;
    const appoint = {
      type: 'grantFief' as const,
      clanId: CLAN_ALPHA,
      districtId: DIST_A1X,
      officerId: OFF_ALPHA_BUSHO,
    };
    expect(validateGrantFief(state, appoint)).toEqual({ ok: true });
    const beforeGrant = officer.loyalty;
    applyGrantFief(state, appoint);
    expect(officer.loyalty).toBe(beforeGrant + BAL.loyaltyGrantFief);
    const oneFiefTarget = loyaltyTarget(state, officer);
    state.districts[DIST_A1Y]!.stewardId = officer.id;
    expect(loyaltyTarget(state, officer)).toBe(oneFiefTarget + BAL.fiefLoyaltyPerDistrict);
    state.districts[DIST_A1Y]!.stewardId = null;
    const loyalty = officer.loyalty;
    applyGrantFief(state, { ...appoint, officerId: null });
    expect(officer.loyalty).toBe(loyalty - BAL.loyaltyReduceFief);
    state.districts[DIST_A1X]!.stewardId = OFF_ALPHA_BUSHO;
    officer.status = 'dead';
    officer.clanId = null;
    developmentSystem(state);
    expect(state.districts[DIST_A1X]!.stewardId).toBeNull();
  });

  it('升格 Command 已登錄並發出 officer.promoted', () => {
    const state = buildTinyState();
    const officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.merit = BAL.rankMeritThresholds[4]!;
    const events: string[] = [];
    applyCommands(
      state,
      [
        {
          seq: 1,
          issuedDay: state.time.day,
          command: { type: 'promoteRank', clanId: CLAN_ALPHA, officerId: officer.id },
        },
      ],
      (event) => events.push(event.type),
    );
    expect(officer.rank).toBe('karo');
    expect(events).toContain('officer.promoted');
  });

  it('開發特性與領主月結功績使用共用成長管線', () => {
    const plain = buildTinyState();
    const boosted = buildTinyState();
    for (const state of [plain, boosted]) {
      const district = state.districts[DIST_A1X]!;
      const steward = state.officers[OFF_ALPHA_BUSHO]!;
      district.stewardId = steward.id;
      district.kokudaka = 0;
      district.kokudakaCap = 10_000;
      steward.pol = 80;
    }
    boosted.officers[OFF_ALPHA_BUSHO]!.traits = [
      'trait.naisei' as never,
      'trait.nosei' as never,
      'trait.yashin' as never,
    ];
    developDistrictDaily(plain, plain.districts[DIST_A1X]!);
    developDistrictDaily(boosted, boosted.districts[DIST_A1X]!);
    expect(boosted.districts[DIST_A1X]!.kokudaka).toBeGreaterThan(
      plain.districts[DIST_A1X]!.kokudaka,
    );
    const beforeMerit = boosted.officers[OFF_ALPHA_BUSHO]!.merit;
    boosted.time.dayOfMonth = 1;
    developmentSystem(boosted);
    expect(boosted.officers[OFF_ALPHA_BUSHO]!.merit - beforeMerit).toBe(
      Math.round(BAL.stewardMeritPerDistrict * (1 + BAL.traitYashinMerit)),
    );
    expect(boosted.officers[OFF_ALPHA_BUSHO]!.statExp.pol).toBeGreaterThan(0);
  });

  it('失去前置後施設停用，下一筆無效佇列自動取消並退款', () => {
    const state = buildTinyState();
    const castle = state.castles[CASTLE_A1]!;
    castle.facilities = [facility('fac.komedoiya')];
    expect(facilityIsActive(state, castle, 'fac.komedoiya')).toBe(false);
    castle.buildQueue = [
      { facilityTypeId: facility('fac.ichi'), daysLeft: 1 },
      { facilityTypeId: facility('fac.nanbanji'), daysLeft: 120 },
    ];
    const gold = state.clans[CLAN_ALPHA]!.gold;
    facilitiesDaily(state);
    expect(castle.buildQueue).toHaveLength(0);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + Math.floor(500 * BAL.buildRefundRate));
  });

  it('欠俸事件由 economy 發出、懲罰於 officers 步驟套用，受封領主不受影響', () => {
    const state = buildTinyState();
    for (const district of Object.values(state.districts)) district.commerce = 0;
    const steward = state.officers[OFF_ALPHA_BUSHO]!;
    state.districts[DIST_A1X]!.stewardId = steward.id;
    state.clans[CLAN_ALPHA]!.gold = 0;
    const loyalty = steward.loyalty;
    state.time.dayOfMonth = 1;
    const events = economySystem(state);
    expect(events.some((e) => e.type === 'economy.upkeepUnpaid' && e.clanId === CLAN_ALPHA)).toBe(
      true,
    );
    applyUnpaidSalaryPenalty(state, new Set([CLAN_ALPHA]));
    expect(steward.loyalty).toBe(loyalty); // 受封領主非支薪對象，欠俸不減其忠誠
  });

  it('收支預覽與超編、兵農分離後的實際駐軍糧耗共用公式', () => {
    const state = buildTinyState();
    const castle = state.castles[CASTLE_A1]!;
    castle.soldiers = castleMaxSoldiers(state, castle) + 500;
    state.policies[CLAN_ALPHA]!.active = [policy('pol.heinobunri')];
    const forecast = selectBudgetForecast(state, CLAN_ALPHA);
    const expected = Object.values(state.castles)
      .filter((item) => item.ownerClanId === CLAN_ALPHA)
      .reduce((sum, item) => sum + garrisonFoodMonthly(state, item), 0);
    expect(forecast.foodUpkeepMonthly).toBe(expected);
  });

  it('輸送隊在當前節點遭劫，敵軍兵糧受攜行上限截斷', () => {
    const state = buildTinyState();
    state.diplomacy.rows['clan.alpha|clan.beta' as never] = {
      key: 'clan.alpha|clan.beta' as never,
      a: CLAN_ALPHA,
      b: CLAN_BETA,
      trustAtoB: 0,
      trustBtoA: 0,
      sentimentAtoB: 0,
      sentimentBtoA: 0,
      pacts: [],
      lastHostileDay: state.time.day,
      refusalCooldownUntilDay: {},
      lastReinforceRequestDayAtoB: null,
      lastReinforceRequestDayBtoA: null,
    };
    const enemyArmyId = 'army.loot' as never;
    state.armies[enemyArmyId] = {
      id: enemyArmyId,
      clanId: CLAN_BETA,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 100,
      initialTroops: 100,
      food: 119,
      morale: 80,
      status: 'holding',
      mission: 'march',
      originCastleId: CASTLE_B1,
      targetNodeId: null,
      path: [CASTLE_A1],
      pathCursor: 0,
      posNodeId: CASTLE_A1,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      battleId: null,
      siegeId: null,
      autoReturn: true,
      corpsId: null,
    };
    applyTransport(state, {
      type: 'transport',
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 0,
      gold: 0,
      food: 100,
    });
    expect(transportDaily(state)[0]?.type).toBe('transport.looted');
    expect(state.armies[enemyArmyId].food).toBe(120);
    expect(Object.keys(state.transports)).toHaveLength(0);
  });

  it('施設下單扣款、完工，政策 slot/互斥/冷卻由同一型錄驅動', () => {
    const state = buildTinyState();
    state.clans[CLAN_ALPHA]!.gold = 10_000;
    const build = {
      type: 'buildFacility' as const,
      clanId: CLAN_ALPHA,
      castleId: CASTLE_A1,
      facilityTypeId: facility('fac.ichi'),
    };
    expect(validateBuildFacility(state, build)).toEqual({ ok: true });
    applyBuildFacility(state, build);
    state.castles[CASTLE_A1]!.buildQueue[0]!.daysLeft = 1;
    expect(facilitiesDaily(state)[0]?.type).toBe('facility.completed');
    expect(state.castles[CASTLE_A1]!.facilities).toContain(facility('fac.ichi'));
    expect(castleFoodCap(state.castles[CASTLE_A1]!)).toBe(BAL.castleFoodCapMain);

    state.clans[CLAN_ALPHA]!.prestige = 300;
    const enact = {
      type: 'enactPolicy' as const,
      clanId: CLAN_ALPHA,
      policyId: policy('pol.kenchi'),
    };
    expect(validateEnactPolicy(state, enact)).toEqual({ ok: true });
    applyEnactPolicy(state, enact, () => undefined);
    expect(state.policies[CLAN_ALPHA]!.active).toContain(enact.policyId);
  });

  it('輸送下單整合 M2 尋路並立即扣除來源資源', () => {
    const state = buildTinyState();
    const from = state.castles[CASTLE_A1]!;
    const before = {
      soldiers: from.soldiers,
      food: from.food,
      gold: state.clans[CLAN_ALPHA]!.gold,
    };
    const cmd = {
      type: 'transport' as const,
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 10,
      food: 20,
      gold: 30,
    };
    expect(validateTransport(state, cmd)).toEqual({ ok: true });
    applyTransport(state, cmd);
    expect(from.soldiers).toBe(before.soldiers - 10);
    expect(from.food).toBe(before.food - 20);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(before.gold - 30);
    expect(Object.values(state.transports)[0]?.path.at(0)).toBe(CASTLE_A1);
  });

  it('收支預覽為純函式且反映下一次月結公式', () => {
    const state = buildTinyState();
    const snapshot = JSON.stringify(state);
    const forecast = selectBudgetForecast(state, CLAN_ALPHA);
    expect(forecast.goldIncomeMonthly).toBeGreaterThan(0);
    expect(forecast.goldNetMonthly).toBe(forecast.goldIncomeMonthly - forecast.goldUpkeepMonthly);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('治安 10 的一揆判定以 event RNG 決定論重放', () => {
    const run = (): boolean => {
      const state = buildTinyState();
      state.districts[DIST_A1X]!.publicOrder = 10;
      state.districts[DIST_A1Y]!.publicOrder = 100;
      monthlyUprising(state);
      return state.districts[DIST_A1X]!.uprising !== null;
    };
    expect(run()).toBe(run());
  });

  it('M3 DoD：織田劇本連跑 24 個月無 NaN，秋收與知行自動開發持續運作', async () => {
    const bundle = await loadS1560Scenario();
    const oda = 'clan.oda' as ClanId;
    const state = buildGameStateFromScenario(bundle, {
      appVersion: 'm3-dod',
      seed: 42,
      playerClanId: oda,
      difficulty: 'normal',
      startDay: 0,
      regions: ['tokai', 'kinki'],
    });
    const district = Object.values(state.districts).find(
      (candidate) => candidate.ownerClanId === oda,
    )!;
    const steward = Object.values(state.officers).find(
      (officer) =>
        officer.clanId === oda &&
        officer.status === 'serving' &&
        officer.locationCastleId === district.castleId &&
        officer.id !== state.clans[oda]!.leaderId,
    )!;
    steward.rank = 'busho';
    district.stewardId = steward.id;
    const initialKokudaka = district.kokudaka;
    const eventTypes: string[] = [];
    for (let day = 0; day < 720; day += 1) {
      eventTypes.push(...advanceDay(state, []).events.map((event) => event.type));
    }
    expect(eventTypes).toContain('economy.harvest');
    expect(district.kokudaka).toBeGreaterThan(initialKokudaka);
    for (const clan of Object.values(state.clans)) expect(Number.isFinite(clan.gold)).toBe(true);
    for (const castle of Object.values(state.castles)) {
      expect(Number.isFinite(castle.food)).toBe(true);
      expect(Number.isFinite(castle.foodFrac)).toBe(true);
    }
    for (const current of Object.values(state.districts)) {
      expect([current.kokudaka, current.commerce, current.population].every(Number.isFinite)).toBe(
        true,
      );
    }
  });
});
