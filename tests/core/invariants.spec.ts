// validateState() INV-01..25 驗收測試（M1-11）。
// 規格：plan/02-data-model.md §5.2（不變量原文）／§7（驗收：25 條各構造一違規 fixture 被偵測）。
//
// 手法：`makeBaseState()` 建立一個零違規的最小手工 GameState 片段（2 勢力、2 城、1 郡、1 條街道連通、
// 1 支部隊、1 個軍團），每個 INV-xx 測試呼叫一次（回傳全新物件、無跨測試共用可變參照），
// 針對該條不變量做最小手工突變，斷言 `validateState()` 的結果含對應 `inv` 代碼。

import { describe, expect, it } from 'vitest';
import { validateState } from '../../src/core/state/invariants';
import type {
  Army,
  Castle,
  Clan,
  Corps,
  District,
  GameState,
  Officer,
  Proposal,
} from '../../src/core/state/gameState';
import type {
  ArmyId,
  CastleId,
  ClanId,
  DistrictId,
  OfficerId,
  ProposalId,
  ProvinceId,
} from '../../src/core/state/ids';

const CLAN_ODA = 'clan.oda' as ClanId;
const CLAN_IMAGAWA = 'clan.imagawa' as ClanId;
const CASTLE_ODA = 'castle.oda-main' as CastleId;
const CASTLE_IMAGAWA = 'castle.imagawa-main' as CastleId;
const DIST_ODA_A = 'dist.oda-a' as DistrictId;
const PROV_OWARI = 'prov.owari' as ProvinceId;
const ARMY_1 = 'army.000001' as ArmyId;
const CORPS_1 = 'corps.000001' as import('../../src/core/state/ids').CorpsId;

const OFF_ODA_LEADER = 'off.oda-leader' as OfficerId;
const OFF_ODA_LORD = 'off.oda-lord' as OfficerId;
const OFF_ODA_STEWARD = 'off.oda-steward' as OfficerId;
const OFF_ODA_GENERAL = 'off.oda-general' as OfficerId;
const OFF_ODA_DEPUTY = 'off.oda-deputy' as OfficerId;
const OFF_ODA_CORPSLEADER = 'off.oda-corpsleader' as OfficerId;
const OFF_IMAGAWA_LEADER = 'off.imagawa-leader' as OfficerId;

function makeOfficer(overrides: Partial<Officer> & Pick<Officer, 'id' | 'clanId'>): Officer {
  return {
    name: overrides.id,
    status: 'serving',
    ldr: 80,
    val: 80,
    int: 80,
    pol: 80,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: 'busho',
    merit: 100,
    loyalty: 80,
    kinship: 'fudai',
    spouseId: null,
    birthYear: 1520,
    deathYear: 1590,
    hasComeOfAge: true,
    debutYear: 1535,
    debutClanId: overrides.clanId,
    debutCastleId: CASTLE_ODA,
    locationCastleId: CASTLE_ODA,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: 1590, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
    ...overrides,
  };
}

/** 建立一個零違規的最小手工 GameState（每次呼叫回傳全新物件）。 */
function makeBaseState(): GameState {
  const clans: Record<ClanId, Clan> = {
    [CLAN_ODA]: {
      id: CLAN_ODA,
      name: '織田家',
      leaderId: OFF_ODA_LEADER,
      homeCastleId: CASTLE_ODA,
      gold: 1000,
      prestige: 100,
      courtRank: 'none',
      shogunateTitle: 'none',
      colorIndex: 0,
      alive: true,
      destroyedDay: null,
      taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
    },
    [CLAN_IMAGAWA]: {
      id: CLAN_IMAGAWA,
      name: '今川家',
      leaderId: OFF_IMAGAWA_LEADER,
      homeCastleId: CASTLE_IMAGAWA,
      gold: 800,
      prestige: 100,
      courtRank: 'none',
      shogunateTitle: 'none',
      colorIndex: 1,
      alive: true,
      destroyedDay: null,
      taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
    },
  };

  const officers: Record<OfficerId, Officer> = {
    [OFF_ODA_LEADER]: makeOfficer({
      id: OFF_ODA_LEADER,
      clanId: CLAN_ODA,
      rank: 'shukuro',
      loyalty: 100,
      kinship: 'kin',
      merit: 1000,
    }),
    [OFF_ODA_LORD]: makeOfficer({
      id: OFF_ODA_LORD,
      clanId: CLAN_ODA,
      rank: 'samurai-taisho',
      merit: 500,
    }),
    [OFF_ODA_STEWARD]: makeOfficer({
      id: OFF_ODA_STEWARD,
      clanId: CLAN_ODA,
      rank: 'busho',
      merit: 300,
    }),
    [OFF_ODA_GENERAL]: makeOfficer({
      id: OFF_ODA_GENERAL,
      clanId: CLAN_ODA,
      rank: 'karo',
      merit: 400,
      locationCastleId: null,
      armyId: ARMY_1,
    }),
    [OFF_ODA_DEPUTY]: makeOfficer({
      id: OFF_ODA_DEPUTY,
      clanId: CLAN_ODA,
      rank: 'busho',
      merit: 200,
      locationCastleId: null,
      armyId: ARMY_1,
    }),
    [OFF_ODA_CORPSLEADER]: makeOfficer({
      id: OFF_ODA_CORPSLEADER,
      clanId: CLAN_ODA,
      rank: 'karo',
      merit: 350,
    }),
    [OFF_IMAGAWA_LEADER]: makeOfficer({
      id: OFF_IMAGAWA_LEADER,
      clanId: CLAN_IMAGAWA,
      rank: 'shukuro',
      loyalty: 100,
      kinship: 'kin',
      merit: 1000,
      locationCastleId: CASTLE_IMAGAWA,
      debutCastleId: CASTLE_IMAGAWA,
    }),
  };

  const castles: Record<CastleId, Castle> = {
    [CASTLE_ODA]: {
      id: CASTLE_ODA,
      name: '清洲城',
      tier: 'main',
      provinceId: PROV_OWARI,
      coastal: false,
      pos: { x: 0, y: 0 },
      ownerClanId: CLAN_ODA,
      lordId: OFF_ODA_LORD,
      directControl: true,
      corpsId: null,
      durability: 3000,
      maxDurability: 3000,
      soldiers: 1000,
      food: 1000,
      foodFrac: 0,
      riceTradedThisMonth: 0,
      morale: 80,
      conscriptPolicy: 'mid',
      facilities: [],
      buildQueue: [],
      betrayalReadyClanId: null,
      betrayalReadyUntilDay: 0,
      districtIds: [DIST_ODA_A],
    },
    [CASTLE_IMAGAWA]: {
      id: CASTLE_IMAGAWA,
      name: '駿府城',
      tier: 'main',
      provinceId: PROV_OWARI,
      coastal: false,
      pos: { x: 10, y: 10 },
      ownerClanId: CLAN_IMAGAWA,
      lordId: null,
      directControl: true,
      corpsId: null,
      durability: 3000,
      maxDurability: 3000,
      soldiers: 500,
      food: 500,
      foodFrac: 0,
      riceTradedThisMonth: 0,
      morale: 80,
      conscriptPolicy: 'mid',
      facilities: [],
      buildQueue: [],
      betrayalReadyClanId: null,
      betrayalReadyUntilDay: 0,
      districtIds: [],
    },
  };

  const districts: Record<DistrictId, District> = {
    [DIST_ODA_A]: {
      id: DIST_ODA_A,
      name: '春日井郡',
      castleId: CASTLE_ODA,
      isPort: false,
      pos: { x: 1, y: 1 },
      ownerClanId: CLAN_ODA,
      stewardId: OFF_ODA_STEWARD,
      kokudaka: 1000,
      kokudakaCap: 2000,
      commerce: 100,
      commerceCap: 200,
      population: 5000,
      populationCap: 10000,
      publicOrder: 80,
      developFocus: 'agri',
      subjugation: null,
      uprising: null,
    },
  };

  const armies: Record<ArmyId, Army> = {
    [ARMY_1]: {
      id: ARMY_1,
      clanId: CLAN_ODA,
      leaderId: OFF_ODA_GENERAL,
      deputyIds: [OFF_ODA_DEPUTY],
      soldiers: 500,
      initialTroops: 500,
      food: 100,
      morale: 80,
      status: 'holding',
      mission: 'march',
      originCastleId: CASTLE_ODA,
      targetNodeId: CASTLE_ODA,
      path: [CASTLE_ODA],
      pathCursor: 0,
      posNodeId: CASTLE_ODA,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      battleId: null,
      siegeId: null,
      autoReturn: true,
      corpsId: null,
      pursuitEligibleArmyIds: [],
    },
  };

  const corps: Record<import('../../src/core/state/ids').CorpsId, Corps> = {
    [CORPS_1]: {
      id: CORPS_1,
      clanId: CLAN_ODA,
      corpsLeaderId: OFF_ODA_CORPSLEADER,
      directive: 'hold',
      targetNodeId: null,
      gold: 0,
      createdDay: 0,
    },
  };

  return {
    meta: {
      saveVersion: 1,
      appVersion: '0.0.0-test',
      scenarioId: 's-test',
      seed: 42,
      playerClanId: CLAN_ODA,
      difficulty: 'normal',
      nextSerials: {
        army: 2,
        battle: 1,
        siege: 1,
        corps: 2,
        proposal: 1,
        report: 1,
        transport: 1,
        plot: 1,
      },
      gameOver: null,
      stateVersion: 0,
      lastAppliedCmdSeq: 0,
      debugMode: false,
      territoryChangedToday: false,
      deferredEvents: [],
    },
    time: { day: 0, year: 1560, month: 1, dayOfMonth: 1 },
    rng: { battle: 1, dev: 2, ai: 3, event: 4, misc: 5 },
    clans,
    officers,
    castles,
    districts,
    provinces: {
      [PROV_OWARI]: { id: PROV_OWARI, name: '尾張', region: 'tokai', labelPos: { x: 0, y: 0 } },
    },
    roads: {
      ['road.imagawa-oda' as import('../../src/core/state/ids').RoadEdgeId]: {
        id: 'road.imagawa-oda' as import('../../src/core/state/ids').RoadEdgeId,
        a: CASTLE_IMAGAWA,
        b: CASTLE_ODA,
        type: 'land',
        grade: 1,
        baseDays: 2,
      },
      ['road.oda-dist' as import('../../src/core/state/ids').RoadEdgeId]: {
        id: 'road.oda-dist' as import('../../src/core/state/ids').RoadEdgeId,
        a: CASTLE_ODA,
        b: DIST_ODA_A,
        type: 'land',
        grade: 1,
        baseDays: 1,
      },
    },
    armies,
    fieldCombats: {},
    battles: {},
    sieges: {},
    corps,
    transports: {},
    diplomacy: { rows: {}, missions: [], plots: [], pendingProposals: [] },
    court: {
      courtFavor: {},
      shogunateFavor: {},
      shogunateExists: true,
      shogunClanId: null,
      patronClanId: null,
      mediationCooldownUntil: {},
    },
    policies: {
      [CLAN_ODA]: { clanId: CLAN_ODA, active: [], cooldownUntil: {} },
      [CLAN_IMAGAWA]: { clanId: CLAN_IMAGAWA, active: [], cooldownUntil: {} },
    },
    proposals: {},
    events: {
      fired: {},
      cooldownUntil: {},
      pendingChoiceEventId: null,
      flags: {},
      tenkabitoStreakMonths: 0,
      stats: { battlesFought: 0, battlesWon: 0, maxCastles: 0, maxKokudaka: 0 },
    },
    ai: {
      personas: {
        ['persona.default' as import('../../src/core/state/ids').AiPersonaId]: {
          aggression: 50,
          diplomacy: 50,
          development: 50,
          loyalty: 50,
          ambition: 50,
        },
      },
      clans: {
        [CLAN_ODA]: {
          clanId: CLAN_ODA,
          personaId: 'persona.default' as import('../../src/core/state/ids').AiPersonaId,
          councilOffset: 0,
          pendingPhases: [],
          attackPlans: [],
          nextPlanSeq: 1,
          threatCache: null,
          lastCouncilDay: 0,
        },
        [CLAN_IMAGAWA]: {
          clanId: CLAN_IMAGAWA,
          personaId: 'persona.default' as import('../../src/core/state/ids').AiPersonaId,
          councilOffset: 0,
          pendingPhases: [],
          attackPlans: [],
          nextPlanSeq: 1,
          threatCache: null,
          lastCouncilDay: 0,
        },
      },
      intentLog: [],
      deferredPhases: [],
    },
    reports: [],
  };
}

/** noUncheckedIndexedAccess 下的測試專用斷言：fixture 建構時已知該 key 必存在。 */
function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('unexpected undefined in test fixture');
  }
  return value;
}

function makeProposal(overrides: Partial<Proposal> & Pick<Proposal, 'id' | 'clanId'>): Proposal {
  return {
    officerId: OFF_ODA_STEWARD,
    kind: 'develop',
    command: {
      type: 'setDevelopFocus',
      clanId: overrides.clanId,
      districtId: DIST_ODA_A,
      focus: 'agri',
    },
    createdDay: 0,
    expiresDay: 60,
    status: 'pending',
    meritReward: 10,
    estimatedCostGold: 0,
    summaryKey: 'proposal.develop.summary',
    summaryParams: {},
    ...overrides,
  };
}

describe('validateState()（02 §5.2／§7：INV-01..25）', () => {
  it('基準 state 零違規', () => {
    expect(validateState(makeBaseState())).toEqual([]);
  });

  it('INV-01：Record key 與 value.id 不一致被偵測', () => {
    const state = makeBaseState();
    // @ts-expect-error 刻意以錯誤 key 建構違規 fixture
    state.clans['clan.wrong-key'] = state.clans[CLAN_ODA];
    delete (state.clans as Record<string, unknown>)[CLAN_ODA];
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-01')).toBe(true);
  });

  it('INV-02：城 ownerClanId 指向不存在勢力被偵測', () => {
    const state = makeBaseState();
    must(state.castles[CASTLE_ODA]).ownerClanId = 'clan.nonexistent' as ClanId;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-02')).toBe(true);
  });

  it('INV-03：郡 castleId 與所屬城 districtIds 鏡像失敗被偵測', () => {
    const state = makeBaseState();
    must(state.districts[DIST_ODA_A]).castleId = CASTLE_IMAGAWA;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-03')).toBe(true);
  });

  it('INV-04：城主非 serving 被偵測', () => {
    const state = makeBaseState();
    const lord = must(state.officers[OFF_ODA_LORD]);
    lord.status = 'ronin';
    lord.clanId = null;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-04')).toBe(true);
  });

  it('INV-04：同一武將同時任兩城城主被偵測', () => {
    const state = makeBaseState();
    must(state.castles[CASTLE_IMAGAWA]).lordId = OFF_ODA_LORD;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-04')).toBe(true);
  });

  it('INV-05：受封郡數超過身分上限被偵測', () => {
    const state = makeBaseState();
    // off.oda-steward 為 busho（上限=2），額外手工建一郡讓其受封數達 3。
    const baseDistrict = must(state.districts[DIST_ODA_A]);
    const oda = must(state.castles[CASTLE_ODA]);
    const extraId = 'dist.oda-b' as DistrictId;
    state.districts[extraId] = { ...baseDistrict, id: extraId, castleId: CASTLE_ODA };
    oda.districtIds.push(extraId);
    const extraId2 = 'dist.oda-c' as DistrictId;
    state.districts[extraId2] = { ...baseDistrict, id: extraId2, castleId: CASTLE_ODA };
    oda.districtIds.push(extraId2);
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-05')).toBe(true);
  });

  it('INV-06：部隊副將數超過上限被偵測', () => {
    const state = makeBaseState();
    const extraDeputy = 'off.oda-extra-deputy' as OfficerId;
    state.officers[extraDeputy] = makeOfficer({
      id: extraDeputy,
      clanId: CLAN_ODA,
      rank: 'busho',
      locationCastleId: null,
      armyId: ARMY_1,
    });
    must(state.armies[ARMY_1]).deputyIds.push(extraDeputy, 'off.oda-extra-deputy-2' as OfficerId);
    state.officers['off.oda-extra-deputy-2' as OfficerId] = makeOfficer({
      id: 'off.oda-extra-deputy-2' as OfficerId,
      clanId: CLAN_ODA,
      rank: 'busho',
      locationCastleId: null,
      armyId: ARMY_1,
    });
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-06')).toBe(true);
  });

  it('INV-06：後續追擊資格不得重複或包含部隊自身', () => {
    const state = makeBaseState();
    must(state.armies[ARMY_1]).pursuitEligibleArmyIds = [ARMY_1, ARMY_1];
    expect(validateState(state).some((violation) => violation.inv === 'INV-06')).toBe(true);
  });

  it('INV-07：武將 locationCastleId 與 armyId 皆為 null 被偵測', () => {
    const state = makeBaseState();
    must(state.officers[OFF_ODA_STEWARD]).locationCastleId = null;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-07')).toBe(true);
  });

  it('INV-08：alive 勢力當主忠誠 ≠ 100 被偵測', () => {
    const state = makeBaseState();
    must(state.officers[OFF_ODA_LEADER]).loyalty = 90;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-08')).toBe(true);
  });

  it('INV-09：本城 tier ≠ main 被偵測', () => {
    const state = makeBaseState();
    must(state.castles[CASTLE_ODA]).tier = 'branch';
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-09')).toBe(true);
  });

  it('INV-10：軍團長身分未達 karo 被偵測', () => {
    const state = makeBaseState();
    must(state.officers[OFF_ODA_CORPSLEADER]).rank = 'busho';
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-10')).toBe(true);
  });

  it('INV-11：地圖節點圖不連通被偵測', () => {
    const state = makeBaseState();
    delete (state.roads as Record<string, unknown>)['road.imagawa-oda'];
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-11')).toBe(true);
  });

  it('INV-12：部隊 path 相鄰節點無街道相連被偵測', () => {
    const state = makeBaseState();
    const army = must(state.armies[ARMY_1]);
    army.path = [CASTLE_ODA, CASTLE_IMAGAWA, DIST_ODA_A];
    army.pathCursor = 0;
    army.posNodeId = CASTLE_ODA;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-12')).toBe(true);
  });

  it('INV-13：部隊狀態為 engaged 但未出現於任何野戰被偵測', () => {
    const state = makeBaseState();
    must(state.armies[ARMY_1]).status = 'engaged';
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-13')).toBe(true);
  });

  it('INV-14：外交列 key 與 pairKey(a,b) 不一致被偵測', () => {
    const state = makeBaseState();
    const key = `${CLAN_IMAGAWA}|${CLAN_ODA}` as import('../../src/core/state/ids').ClanPairKey;
    state.diplomacy.rows[key] = {
      key: 'clan.wrong|clan.key' as import('../../src/core/state/ids').ClanPairKey,
      a: CLAN_IMAGAWA,
      b: CLAN_ODA,
      trustAtoB: 0,
      trustBtoA: 0,
      sentimentAtoB: 0,
      sentimentBtoA: 0,
      pacts: [],
      lastHostileDay: null,
      refusalCooldownUntilDay: {},
      lastReinforceRequestDayAtoB: null,
      lastReinforceRequestDayBtoA: null,
    };
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-14')).toBe(true);
  });

  it('INV-15：pending 具申 expiresDay 未大於當前日被偵測', () => {
    const state = makeBaseState();
    const propId = 'prop.000001' as ProposalId;
    state.proposals[propId] = makeProposal({ id: propId, clanId: CLAN_ODA, expiresDay: 0 });
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-15')).toBe(true);
  });

  it('INV-16：武將 loyalty 超出 [0,100] 被偵測', () => {
    const state = makeBaseState();
    must(state.officers[OFF_ODA_STEWARD]).loyalty = 150;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-16')).toBe(true);
  });

  it('INV-17：非 marriage/vassal 協定 endDay=null 被偵測', () => {
    const state = makeBaseState();
    const key = `${CLAN_IMAGAWA}|${CLAN_ODA}` as import('../../src/core/state/ids').ClanPairKey;
    state.diplomacy.rows[key] = {
      key,
      a: CLAN_IMAGAWA,
      b: CLAN_ODA,
      trustAtoB: 0,
      trustBtoA: 0,
      sentimentAtoB: 0,
      sentimentBtoA: 0,
      pacts: [{ kind: 'ceasefire', startDay: 0, endDay: null, vassalClanId: null }],
      lastHostileDay: null,
      refusalCooldownUntilDay: {},
      lastReinforceRequestDayAtoB: null,
      lastReinforceRequestDayBtoA: null,
    };
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-17')).toBe(true);
  });

  it('INV-18：captive 武將 capturedByClanId 為 null 被偵測', () => {
    const state = makeBaseState();
    const steward = must(state.officers[OFF_ODA_STEWARD]);
    steward.status = 'captive';
    steward.clanId = CLAN_ODA;
    steward.capturedByClanId = null;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-18')).toBe(true);
  });

  it('INV-19：已死亡武將仍被城引用為 lordId 被偵測', () => {
    const state = makeBaseState();
    const deadLord = must(state.officers[OFF_ODA_LORD]);
    deadLord.status = 'dead';
    deadLord.clanId = null;
    deadLord.locationCastleId = null;
    deadLord.armyId = null;
    // castle.lordId 刻意保留舊引用（違規 fixture）。
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-19')).toBe(true);
  });

  it('INV-20：制壓方與 ownerClanId 相同被偵測', () => {
    const state = makeBaseState();
    must(state.districts[DIST_ODA_A]).subjugation = {
      clanId: CLAN_ODA,
      progress: 10,
      daysRequired: 5,
    };
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-20')).toBe(true);
  });

  it('INV-21：buildQueue 長度超過上限被偵測', () => {
    const state = makeBaseState();
    must(state.castles[CASTLE_ODA]).buildQueue = [
      {
        facilityTypeId: 'fac.market' as import('../../src/core/state/ids').FacilityTypeId,
        daysLeft: 5,
      },
      {
        facilityTypeId: 'fac.dojo' as import('../../src/core/state/ids').FacilityTypeId,
        daysLeft: 5,
      },
      {
        facilityTypeId: 'fac.inn' as import('../../src/core/state/ids').FacilityTypeId,
        daysLeft: 5,
      },
      {
        facilityTypeId: 'fac.temple' as import('../../src/core/state/ids').FacilityTypeId,
        daysLeft: 5,
      },
    ];
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-21')).toBe(true);
  });

  it('INV-22：已滅亡勢力仍擁有城被偵測', () => {
    const state = makeBaseState();
    must(state.clans[CLAN_IMAGAWA]).alive = false;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-22')).toBe(true);
  });

  it('INV-23：meta.playerClanId 不存在被偵測', () => {
    const state = makeBaseState();
    state.meta.playerClanId = 'clan.nonexistent' as ClanId;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-23')).toBe(true);
  });

  it('INV-24：time.year 與 day 換算不一致被偵測', () => {
    const state = makeBaseState();
    state.time.year = 1999;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-24')).toBe(true);
  });

  it('INV-24：rng 流超出 [0,2^32) 被偵測', () => {
    const state = makeBaseState();
    state.rng.battle = -1;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-24')).toBe(true);
  });

  it('INV-25：數值為 NaN 被偵測', () => {
    const state = makeBaseState();
    must(state.clans[CLAN_ODA]).gold = Number.NaN;
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-25')).toBe(true);
  });

  it('INV-25：reports.length 超過 BAL.reportMaxKept 被偵測', () => {
    const state = makeBaseState();
    for (let i = 0; i < 501; i += 1) {
      state.reports.push({
        id: `rep.${String(i).padStart(6, '0')}` as import('../../src/core/state/ids').ReportId,
        day: 0,
        event: { type: 'time.monthStart', day: 0, clanIds: [], year: 1560, month: 1 },
        read: false,
      });
    }
    const violations = validateState(state);
    expect(violations.some((x) => x.inv === 'INV-25')).toBe(true);
  });
});
