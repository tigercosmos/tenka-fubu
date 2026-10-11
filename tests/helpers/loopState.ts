// 迴圈測試用最小 GameState 建構器（M1-6／M1-7）。
// 非 M1-13 官方 tiny 劇本 fixture——本檔僅供 commands／advance-day 單元測試建立可跑 advanceDay 的
// 最小狀態（1 勢力、1 城、1 位當主，其餘實體空）。欄位型別依 plan/02-data-model.md §4。
// 名稱刻意用無簡體變體之字（本家／本城），避開 validate:data 簡體掃描。

import type {
  Castle,
  Clan,
  GameOverState,
  GameState,
  Officer,
} from '../../src/core/state/gameState';
import type { CastleId, ClanId, OfficerId, ProvinceId } from '../../src/core/state/ids';
import { dayToCalendar } from '../../src/core/systems/time';

export const TEST_CLAN = 'clan.test' as ClanId;
export const TEST_CASTLE = 'castle.test' as CastleId;
export const TEST_LEADER = 'off.test' as OfficerId;

export interface LoopStateOpts {
  day?: number; // 初始絕對日（預設 0＝1560/1/1）
  debugMode?: boolean; // meta.debugMode（預設 true，便於測 debug 指令）
  gold?: number; // 測試勢力初始金錢（預設 0）
  food?: number; // 測試城初始兵糧（預設 0）
  lastAppliedCmdSeq?: number; // 冪等防線起點（預設 0）
  gameOver?: GameOverState | null; // 結局狀態（預設 null）
}

/** 建立 1 勢力、1 城與其合法當主的最小 GameState，供迴圈測試。 */
export function makeLoopTestState(opts: LoopStateOpts = {}): GameState {
  const {
    day = 0,
    debugMode = true,
    gold = 0,
    food = 0,
    lastAppliedCmdSeq = 0,
    gameOver = null,
  } = opts;
  const cal = dayToCalendar(day);

  const clan: Clan = {
    id: TEST_CLAN,
    name: '本家',
    leaderId: TEST_LEADER,
    homeCastleId: TEST_CASTLE,
    gold,
    rewardGoldSpentThisMonth: 0,
    prestige: 0,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 0,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  };

  const castle: Castle = {
    id: TEST_CASTLE,
    name: '本城',
    tier: 'main',
    provinceId: 'prov.test' as ProvinceId,
    coastal: false,
    pos: { x: 0, y: 0 },
    ownerClanId: TEST_CLAN,
    lordId: null,
    directControl: true,
    corpsId: null,
    durability: 1000,
    maxDurability: 1000,
    soldiers: 0,
    food,
    foodFrac: 0,
    riceTradedThisMonth: 0,
    morale: 50,
    conscriptPolicy: 'mid',
    facilities: [],
    buildQueue: [],
    betrayalReadyClanId: null,
    betrayalReadyUntilDay: 0,
    betrayalImmunityUntilDay: 0,
    betrayalReadyTargetClanId: null,
    betrayalReadyTargetLordId: null,
    districtIds: [],
  };

  const leader: Officer = {
    id: TEST_LEADER,
    name: '當主',
    clanId: TEST_CLAN,
    status: 'serving',
    ldr: 50,
    val: 50,
    int: 50,
    pol: 50,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: 'kumigashira',
    merit: 0,
    loyalty: 100,
    kinship: 'fudai',
    spouseId: null,
    birthYear: 1530,
    deathYear: 1600,
    hasComeOfAge: true,
    debutYear: 1545,
    debutClanId: TEST_CLAN,
    debutCastleId: TEST_CASTLE,
    locationCastleId: TEST_CASTLE,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: 1600, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
  };

  return {
    meta: {
      saveVersion: 1,
      appVersion: '0.0.0-test',
      scenarioId: 's-test',
      seed: 42,
      playerClanId: TEST_CLAN,
      difficulty: 'normal',
      nextSerials: {
        army: 1,
        battle: 1,
        siege: 1,
        corps: 1,
        proposal: 1,
        report: 1,
        transport: 1,
        plot: 1,
      },
      gameOver,
      stateVersion: 0,
      lastAppliedCmdSeq,
      debugMode,
      territoryChangedToday: false,
      deferredEvents: [],
    },
    time: { day, year: cal.year, month: cal.month, dayOfMonth: cal.dayOfMonth },
    rng: { battle: 1, dev: 2, ai: 3, event: 4, misc: 5 },
    clans: { [TEST_CLAN]: clan },
    officers: { [TEST_LEADER]: leader },
    castles: { [TEST_CASTLE]: castle },
    districts: {},
    provinces: {},
    roads: {},
    armies: {},
    fieldCombats: {},
    battles: {},
    sieges: {},
    corps: {},
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
    policies: {},
    proposals: {},
    events: {
      fired: {},
      cooldownUntil: {},
      pendingChoiceEventId: null,
      pendingChoiceBinding: null,
      hookSignals: [],
      flags: {},
      tenkabitoStreakMonths: 0,
      stats: { battlesFought: 0, battlesWon: 0, maxCastles: 0, maxKokudaka: 0 },
    },
    ai: {
      personas: {},
      clans: {},
      intentLog: [],
      deferredPhases: [],
      pendingOrders: [],
      allAi: false,
      councilJobs: [],
      lastCouncilEnrollment: {},
    },
    reports: [],
  };
}
