// ScenarioData → 初始 GameState builder（M1-14 骨架）。
// 規格：plan/02-data-model.md §7（實作任務清單：builder 驗收＝建置後 validateState 零違規、
// reports=[]、nextSerials 全 1）／§5.5（pairKey 與預設外交列：稀疏 rows，缺列＝預設列，不需
// materialize）／§5.6（曆法換算）；plan/01-architecture.md §3.3（core 公開 API 匯出名
// `buildGameState`）；plan/18-roadmap.md M1-14（本檔範圍：state 初始化）／M2-8（範圍外：資料側
// 補值規則＋浪人生成＋regions 白名單載入，留待 M2 依 14-scenario-data.md 擴充本檔）。
//
// 【M1 範圍界定】M1 尚無 zod 劇本 schema（M2 territory，見 18 §8-D4）。本檔輸入 `ScenarioInput`
// 直接採 02 §4 全欄位完整實體（Clan/Officer/Castle/District/Province/RoadEdge），非 14 §4 的
// 「劇本檔精簡子集＋.default() 補值」格式——「資料側補值」（缺欄位推導、浪人生成等）是 M2-8
// 讀 14 zod 劇本後才要做的事，M1 呼叫端（如 tests/fixtures/tiny.ts）必須自行提供完整合法欄位。
// 本檔只做「state 初始化」：陣列→Record 組裝＋rng 播種＋AI/外交/朝廷/政策/事件等分支的預設骨架。

import { initRng } from '../rng';
import { dayToCalendar } from '../systems/time';
import type { Difficulty } from './enums';
import type {
  AiClanState,
  AiPersona,
  Castle,
  Clan,
  ClanPolicyState,
  District,
  GameState,
  Officer,
  Province,
  RoadEdge,
} from './gameState';
import type {
  AiPersonaId,
  CastleId,
  ClanId,
  DistrictId,
  OfficerId,
  ProvinceId,
  RoadEdgeId,
} from './ids';

/**
 * builder 輸入契約（M1 範圍；M2-8 將擴充/置換為由 14 zod 劇本推導出的等價結構，§8-D4／§8-D5）。
 * 全部實體欄位必須已是 02 §4 完整合法值（builder 本身不補值、不驗證——建置後由呼叫端另跑
 * `validateState`，M1 骨架不強制內建，維持 core 分層單純）。
 */
export interface ScenarioInput {
  scenarioId: string; // → MetaState.scenarioId
  appVersion: string; // → MetaState.appVersion（建置版本字串；由呼叫端注入，builder 不硬編）
  seed: number; // → MetaState.seed，同時餵給 initRng()（uint32，02 §4.2）
  startDay: number; // 開局絕對日（02 §5.6 calendarToDay 產出）→ TimeState.day 與快取三欄之源
  playerClanId: ClanId;
  difficulty: Difficulty;
  clans: Clan[];
  officers: Officer[];
  castles: Castle[];
  districts: District[];
  provinces: Province[];
  roads: RoadEdge[];
  /** AI persona 登錄表（02 §4.20 AiState.personas；唯一真相，Clan 不持有 personaId，勘誤四輪 D-13）。 */
  personas: Record<AiPersonaId, AiPersona>;
  /** 各勢力採用之 personaId（14 §4.5 zClan.personaId 對應；builder 寫入 ai.clans[clanId].personaId）。 */
  clanPersonaIds: Record<ClanId, AiPersonaId>;
}

/** JSON 深拷貝：core 純度（tsconfig.core.json 排除 DOM lib）不可用 `structuredClone`；
 * 02 §3.4 保證全樹為純 JSON 值，JSON 往返可安全深拷貝。用途：確保回傳的 GameState 與傳入的
 * `ScenarioInput`（常為跨測試共用的常數，如 tests/fixtures/tiny.ts）不共享任何物件參照——
 * 呼叫端可自由 mutate 建出的 state 而不污染共用 fixture 或其他次建置。 */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 陣列（元素含 `id` 欄）→ `Record<id 型別, 元素>`；key 與 value.id 保證一致（INV-01 前提）。 */
function toRecord<K extends string, T extends { id: K }>(items: readonly T[]): Record<K, T> {
  const out = {} as Record<K, T>;
  for (const item of items) {
    out[item.id] = item;
  }
  return out;
}

/**
 * 由 `ScenarioInput` 建初始 `GameState`（02 §7 builder；01 §3.3 公開 API 匯出名 `buildGameState`）。
 * M1 骨架涵蓋：陣列組裝為 Record、`meta.nextSerials` 全 1、`reports=[]`、`rng` 由 `seed` 播種
 * （`initRng`，03 §3.5.2）、曆法三欄由 `startDay` 換算（02 §5.6）、`ai.clans` 逐勢力初始化並填入
 * `personaId`、`policies` 逐勢力建立空白 `ClanPolicyState`、外交/朝廷/事件採 02 §5.5／§4.12／§4.16
 * 定義的空白預設（稀疏 `diplomacy.rows`：缺列＝預設列，不 materialize）。
 * 不含：M2-8 之「資料側補值規則」（14 §4 精簡劇本子集的欄位預設、浪人生成、regions 白名單）。
 */
export function buildGameState(input: ScenarioInput): GameState {
  const scenario = cloneJson(input);
  const cal = dayToCalendar(scenario.startDay);

  const clans = toRecord<ClanId, Clan>(scenario.clans);
  const officers = toRecord<OfficerId, Officer>(scenario.officers);
  const castles = toRecord<CastleId, Castle>(scenario.castles);
  const districts = toRecord<DistrictId, District>(scenario.districts);
  const provinces = toRecord<ProvinceId, Province>(scenario.provinces);
  const roads = toRecord<RoadEdgeId, RoadEdge>(scenario.roads);

  const aiClans: Record<ClanId, AiClanState> = {};
  const policies: Record<ClanId, ClanPolicyState> = {};
  for (const clan of scenario.clans) {
    const personaId = scenario.clanPersonaIds[clan.id];
    if (personaId === undefined) {
      throw new Error(`buildGameState: clanPersonaIds 缺少勢力 ${clan.id} 的 personaId`);
    }
    aiClans[clan.id] = {
      clanId: clan.id,
      personaId,
      councilOffset: 0, // M1 骨架恆 0（fnv1a 錯開排程屬 M7-4 完整版，03 §8-D13；本欄僅需合法存在）
      pendingPhases: [],
      attackPlans: [],
      nextPlanSeq: 1,
      threatCache: null,
      lastCouncilDay: 0,
    };
    policies[clan.id] = { clanId: clan.id, active: [], cooldownUntil: {} };
  }

  return {
    meta: {
      saveVersion: 1,
      appVersion: scenario.appVersion,
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      playerClanId: scenario.playerClanId,
      difficulty: scenario.difficulty,
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
      gameOver: null,
      stateVersion: 0,
      lastAppliedCmdSeq: 0,
      debugMode: false,
      territoryChangedToday: false,
      deferredEvents: [],
    },
    time: { day: scenario.startDay, year: cal.year, month: cal.month, dayOfMonth: cal.dayOfMonth },
    rng: initRng(scenario.seed),
    clans,
    officers,
    castles,
    districts,
    provinces,
    roads,
    armies: {},
    fieldCombats: {},
    battles: {},
    sieges: {},
    corps: {},
    transports: {},
    diplomacy: { rows: {}, missions: [], plots: [], pendingProposals: [] }, // 稀疏預設（02 §5.5）
    court: {
      courtFavor: {},
      shogunateFavor: {},
      shogunateExists: true,
      shogunClanId: null,
      patronClanId: null,
      mediationCooldownUntil: {},
    },
    policies,
    proposals: {},
    events: {
      fired: {},
      cooldownUntil: {},
      pendingChoiceEventId: null,
      flags: {},
      tenkabitoStreakMonths: 0,
      stats: { battlesFought: 0, battlesWon: 0, maxCastles: 0, maxKokudaka: 0 },
    },
    ai: { personas: scenario.personas, clans: aiClans, intentLog: [], deferredPhases: [] },
    reports: [],
  };
}
