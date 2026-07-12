// mini 劇本 fixture（M2-11；17-T4／17 §3.3.1）——「zod 版」測試劇本：與 s1560 同 14 §4 檔案
// schema（provinces/castles/districts/roads/clans/officers/<region>），每個檔案內容皆實際跑對應
// zod schema 解析（模組載入時；資料若不合法會直接拋錯，不會靜默過關）。
//
// 規格：plan/17-testing.md §3.3.1（勢力/城/郡/武將/街道/外交/開局規模表）、§3.3.2
// （`buildMiniState` 簽名）；plan/18-roadmap.md M2-11（「zod 版測試劇本」＋`buildMiniState()`
// 推進 30 日無錯）。
//
// 【與 14 §3.1 s1560 彙整流程的差異：型錄（traits/tactics/policies/personas）】14 §4.8/§4.9/
// §4.10/§4.11 之型錄 zod schema 為「全域固定長度」（37 特性／12 戰法／13 政策／≥41 persona，
// 對應 06/07/05/09 canonical 定案），屬「實際劇本資料」的驗收範圍（14-T2 對 s1560 才有意義），
// 非本 mini 測試劇本的關注點——tests/fixtures/scenarioBundle.ts（M2-8）已立下相同precedent：
// 手動建構 `ScenarioBundleData.catalogs`（不逐一經過 zTraitsFile.length(37) 等長度限制），
// 本檔沿用同一慣例。mini 官員不使用 traits/tactics（皆為空陣列），故 catalogs.traits/tactics/
// policies 留空即可；catalogs.personas 僅需持有 clans.json 實際引用的 'persona.default' 一筆
// （值＝五軸皆 50 中性 persona，同 tests/fixtures/tiny.ts 的 PERSONA_DEFAULT 慣例）。

import {
  zProvincesFile,
  zCastlesFile,
  zDistrictsFile,
  zRoadsFile,
  zClansFile,
  zOfficersFile,
  type PersonaEntryData,
  type ScenarioBundleData,
} from '../../../src/data/schemas';
import { buildGameState, deriveScenarioInput } from '../../../src/core/state/builder';
import type { GameState } from '../../../src/core/state/gameState';
import type {
  ClanId,
  CastleId,
  DistrictId,
  OfficerId,
  ProvinceId,
} from '../../../src/core/state/ids';
import { REGION_VALUES } from '../../../src/core/state/enums';
import { calendarToDay } from '../../../src/core/systems/time';
import { TESTCFG } from '../../config';

import provincesRaw from './provinces.json';
import castlesRaw from './castles.json';
import districtsRaw from './districts.json';
import roadsRaw from './roads.json';
import clansRaw from './clans.json';
import officersTokaiRaw from './officers/tokai.json';

// ── ID 常數（供測試直接引用；同 tests/fixtures/tiny.ts 慣例） ──
export const CLAN_ALPHA = 'clan.alpha' as ClanId;
export const CLAN_BETA = 'clan.beta' as ClanId;

export const CASTLE_A1 = 'castle.a1' as CastleId; // alpha 本城
export const CASTLE_A2 = 'castle.a2' as CastleId; // alpha 支城
export const CASTLE_B1 = 'castle.b1' as CastleId; // beta 本城
export const CASTLE_B2 = 'castle.b2' as CastleId; // beta 支城

export const DIST_A1X = 'dist.a1x' as DistrictId;
export const DIST_A1Y = 'dist.a1y' as DistrictId; // 前線街道經此節點
export const DIST_A2X = 'dist.a2x' as DistrictId;
export const DIST_A2Y = 'dist.a2y' as DistrictId;
export const DIST_B2X = 'dist.b2x' as DistrictId; // 前線街道經此節點
export const DIST_B2Y = 'dist.b2y' as DistrictId;
export const DIST_B1Y = 'dist.b1y' as DistrictId; // 前線街道經此節點
export const DIST_B1X = 'dist.b1x' as DistrictId;

export const PROV_KAI = 'prov.kai' as ProvinceId; // castle.a1／a2 所屬
export const PROV_SURUGA = 'prov.suruga' as ProvinceId; // castle.b1／b2 所屬

export const OFF_ALPHA_LORD = 'off.alpha-lord' as OfficerId; // alpha 當主（統率80/武勇70/知略75/政務85）
export const OFF_ALPHA_TAISHO_A = 'off.alpha-taisho-a' as OfficerId; // castle.a2 城主
export const OFF_ALPHA_TAISHO_B = 'off.alpha-taisho-b' as OfficerId;
export const OFF_ALPHA_TAISHO_C = 'off.alpha-taisho-c' as OfficerId;
export const OFF_BETA_LORD = 'off.beta-lord' as OfficerId; // beta 當主（鏡像同值）
export const OFF_BETA_TAISHO_A = 'off.beta-taisho-a' as OfficerId; // castle.b2 城主
export const OFF_BETA_TAISHO_B = 'off.beta-taisho-b' as OfficerId;
export const OFF_BETA_TAISHO_C = 'off.beta-taisho-c' as OfficerId;

export const PERSONA_DEFAULT = 'persona.default';

/** 開局絕對日：1560 年 4 月 1 日（02 §5.6 calendarToDay；17 §3.3.1）。 */
export const MINI_START_DAY = calendarToDay(1560, 4, 1);
/** 預設種子（17 §3.3.1／`TESTCFG.goldenSeedMini`）。 */
export const MINI_SEED = TESTCFG.goldenSeedMini;

// ── 各檔案內容：實際跑對應 14 §4 zod schema（「zod 版」測試劇本之所繫；解析失敗直接拋錯） ──
const provincesFile = zProvincesFile.parse(provincesRaw);
const castlesFile = zCastlesFile.parse(castlesRaw);
const districtsFile = zDistrictsFile.parse(districtsRaw);
const roadsFile = zRoadsFile.parse(roadsRaw);
const clansFile = zClansFile.parse(clansRaw);
const officersTokaiFile = zOfficersFile.parse(officersTokaiRaw);

/** persona 型錄（見檔頭說明：不逐一經 zPersonasFile.min(41)，手動建構同 scenarioBundle.ts 慣例）。 */
const MINI_PERSONAS: PersonaEntryData[] = [
  {
    id: PERSONA_DEFAULT,
    aggression: 50,
    diplomacy: 50,
    development: 50,
    loyalty: 50,
    ambition: 50,
  },
];

/** 9 地方分檔（順序＝`REGION_VALUES`）：僅 tokai 有內容（mini 不分地方，取一檔即可）。 */
const officersByRegion = REGION_VALUES.map((region) =>
  region === officersTokaiFile.region ? officersTokaiFile.officers : [],
);

/** mini 劇本彙整束（14 §3.1 `ScenarioBundleData` 形狀；`deriveScenarioInput` 直接消費）。 */
export const MINI_BUNDLE: ScenarioBundleData = {
  id: 'mini',
  provinces: provincesFile.provinces,
  castles: castlesFile,
  districts: districtsFile,
  roads: roadsFile.edges,
  clans: clansFile.clans,
  diplomacy: clansFile.diplomacy, // alpha↔beta 信用0（缺列即預設列）、無協定、非交戰（17 §3.3.1）
  events: [],
  officers: officersByRegion,
  catalogs: {
    traits: [],
    policies: [],
    tactics: [],
    personas: MINI_PERSONAS,
  },
};

/** `T` 之深層部分覆寫型別（供 `buildMiniState({ overrides })`；17 §3.3.2）。 */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** 就地無關、回傳新物件的深層合併（葉節點／陣列整體以 `patch` 取代）。 */
function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (
    patch === undefined ||
    patch === null ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    typeof base !== 'object' ||
    base === null ||
    Array.isArray(base)
  ) {
    return patch as T;
  }
  const out = { ...(base as object) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as object)) {
    if (value === undefined) continue;
    out[key] = deepMerge((base as Record<string, unknown>)[key], value as DeepPartial<unknown>);
  }
  return out as T;
}

export interface BuildMiniStateOptions {
  /** 預設 `TESTCFG.goldenSeedMini`（42）。 */
  seed?: number;
  /**
   * true：玩家勢力也交給大名 AI（golden 用；17 §3.3.2）。
   * 【M2-11 現況】09 AI 系統尚未實作（`stepAi` 為 M1 骨架、恆回傳空事件），engine 尚無「玩家/AI」
   * 分支可接——此旗標目前僅被接受、無行為差異，保留介面供 M7 AI 系統／M4-16 golden-mini 銜接。
   */
  allAi?: boolean;
  /** 深層部分覆寫（結構見 02；例：override 某郡 kokudaka）。 */
  overrides?: DeepPartial<GameState>;
}

/** 建 mini 劇本初始狀態（17 §3.3.2）；每次呼叫回傳全新獨立物件（`buildGameState` 內部已深拷貝）。 */
export function buildMiniState(opts: BuildMiniStateOptions = {}): GameState {
  const seed = opts.seed ?? MINI_SEED;
  const input = deriveScenarioInput(MINI_BUNDLE, {
    appVersion: '0.0.0-mini',
    seed,
    playerClanId: CLAN_ALPHA,
    difficulty: 'normal',
    startDay: MINI_START_DAY,
  });
  const state = buildGameState(input);
  return opts.overrides ? deepMerge(state, opts.overrides) : state;
}
