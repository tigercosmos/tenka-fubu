// 劇本 JSON dynamic import → zod 驗證 → buildGameState。
// 規格：plan/01-architecture.md §3.7.2、§3.9.3；plan/18-roadmap.md M2-19（新遊戲流程最小版：
// ScenarioSelectScreen → DaimyoSelectScreen → `buildGameState(regions=[tokai,kinki])` →
// MainScreen）。M2-8（`src/core/state/builder.ts`）已備妥 `loadScenarioBundle`／`deriveScenarioInput`／
// `buildGameStateFromScenario`；本檔是唯一呼叫端（app 層負責「劇本 id → 動態 import → 建局」的
// 選擇與組裝，core 不知道有幾個劇本、也不知道檔案在哪）。
//
// v1.0 僅 s1560 一個劇本（11 §3.2.2「v1.0 僅 s1560 一個項目」），`SUPPORTED_SCENARIO_IDS` 仍以
// 一個小型 dispatch table 表達（非 if/else 單例），供日後多劇本時只需在表中增列。
//
// 【M2 現況：`regions` 白名單】s1560 資料僅 B1 東海／B2 近畿兩批落地（M2-9／M2-10；其餘 7 地方
// 待 M8-26 全國批次），`NEW_GAME_REGIONS` 固定為這兩個地方——並非玩家可選項，而是「目前資料涵蓋
// 範圍」，全部 9 地方批次到位後（M8-26）此常數改為省略 `regions`（等同 `REGION_VALUES` 全部，
// `deriveScenarioInput` 之預設值，18 §8-D5）。

import type { ClanId, CastleId } from '@core/state/ids';
import type { Difficulty, Region } from '@core/state/enums';
import type { GameState } from '@core/state/gameState';
import { buildGameStateFromScenario } from '@core/state/builder';
import type { ScenarioBundleData } from '@data/schemas';
// 只靜態 import 輕量 meta（零 JSON 依賴）；實際劇本資料經下方 `loadScenario` 動態 import
// `@data/scenarios/s1560/index`，兩者刻意分屬不同模組以保住 Vite code-split（見 meta.ts 檔頭，
// M2-19：混寫版本主 bundle 會混入劇本 JSON，`npm run build` 印出 Rollup 降級警告）。
import { S1560_SCENARIO_ID, S1560_LOADED_REGIONS } from '@data/scenarios/s1560/meta';

/** 目前唯一劇本（11 §3.2.2）；v1.0 出貨組態不變，多劇本留待後續版本。 */
export const SUPPORTED_SCENARIO_IDS = [S1560_SCENARIO_ID] as const;

/**
 * 劇本顯示名（劇本 id → 標題，如「桶狹間前夜」）。依 00 §8／13 §2「專有名詞顯示名放資料 JSON
 * 的 name 欄，不進 i18n」精神，本不該塞進字串表——但 14 §4 `zScenario` 現行 schema 並無劇本層級
 * 的 `name`/`title` 欄位（僅 `id`），新增該欄屬資料模型變更（14 §4.1，跨 `tools/validate.ts` 與
 * 既有劇本 JSON），非本次 M2-19 UI 接線範圍。暫以此處小常數表頂著（ScenarioSelect／DaimyoSelect
 * 標頭顯示用），待劇本 schema 補上該欄後改為讀 `bundle.name`（回寫本節與 14 §8）。
 */
const SCENARIO_TITLES: Readonly<Record<string, string>> = {
  [S1560_SCENARIO_ID]: '桶狹間前夜',
};

/** 劇本顯示名；未知 id 退回其 id 本身（不擲例外，供防禦性 UI 顯示）。 */
export function getScenarioTitle(scenarioId: string): string {
  return SCENARIO_TITLES[scenarioId] ?? scenarioId;
}

/** 本階段（M2）已載入之地方批次白名單（見檔頭）；供 `buildNewGameState` 與 `ScenarioSelect` 顯示用。 */
export const NEW_GAME_REGIONS: readonly Region[] = S1560_LOADED_REGIONS;

/**
 * 依劇本 id 動態載入其 `ScenarioBundleData`（01 §3.9.3：劇本 JSON 不進主 bundle，交由 Vite
 * 依 `import()` 呼叫點自動 code-split）。目前僅 `s1560` 一個有效值。
 */
export async function loadScenario(scenarioId: string): Promise<ScenarioBundleData> {
  if (scenarioId === S1560_SCENARIO_ID) {
    const mod = await import('@data/scenarios/s1560/index');
    return mod.loadS1560Scenario();
  }
  throw new Error(`loadScenario: 不支援的劇本 id「${scenarioId}」`);
}

/** DaimyoSelectScreen 卡片用之勢力摘要（11 §3.2.3：當主／石高／城數）。 */
export interface DaimyoSummary {
  clanId: ClanId;
  name: string;
  leaderName: string;
  homeCastleId: CastleId;
  /** 石高＝Σ 該勢力所有已轄郡 kokudaka（開局值，取自劇本資料，非 GameState）。 */
  kokudaka: number;
  /** 城數＝該勢力開局擁有之城數。 */
  castleCount: number;
  /** 武將數＝開局登錄於該勢力麾下之具名武將數（不含浪人）。 */
  officerCount: number;
}

/**
 * 由已載入的劇本資料束彙整 DaimyoSelectScreen 所需之勢力摘要清單（依 `bundle.clans` 原始順序）。
 * 純函式，只讀 `bundle`（劇本資料層形狀，非 GameState），故毋須先 `buildGameState` 才能顯示卡片。
 */
export function summarizeClans(bundle: ScenarioBundleData): DaimyoSummary[] {
  const leaderNameById = new Map(bundle.officers.flat().map((o) => [o.id, o.name]));
  const castlesByClan = new Map<string, number>();
  const homeCastleById = new Map(bundle.castles.map((c) => [c.id, c]));
  for (const castle of bundle.castles) {
    castlesByClan.set(castle.ownerClanId, (castlesByClan.get(castle.ownerClanId) ?? 0) + 1);
  }
  const officerCountByClan = new Map<string, number>();
  for (const officer of bundle.officers.flat()) {
    if (officer.clanId === null) continue;
    officerCountByClan.set(officer.clanId, (officerCountByClan.get(officer.clanId) ?? 0) + 1);
  }
  const kokudakaByClan = new Map<string, number>();
  for (const district of bundle.districts) {
    const owner = homeCastleById.get(district.castleId)?.ownerClanId;
    if (owner === undefined) continue;
    kokudakaByClan.set(owner, (kokudakaByClan.get(owner) ?? 0) + district.kokudaka);
  }

  return bundle.clans.map((clan) => ({
    clanId: clan.id as ClanId,
    name: clan.name,
    leaderName: leaderNameById.get(clan.leaderId) ?? clan.name,
    homeCastleId: clan.homeCastleId as CastleId,
    kokudaka: kokudakaByClan.get(clan.id) ?? 0,
    castleCount: castlesByClan.get(clan.id) ?? 0,
    officerCount: officerCountByClan.get(clan.id) ?? 0,
  }));
}

/** 開局選項：由 DaimyoSelectScreen 收集後交給 `buildNewGameState`（種子省略＝隨機，比照 M1-20）。 */
export interface NewGameOptions {
  playerClanId: ClanId;
  difficulty: Difficulty;
  seed?: number;
}

/** app 版本字串（存檔／`MetaState.appVersion` 用；與 `package.json` version 手動同步，比照 tests/fixtures/tiny.ts）。 */
const APP_VERSION = '0.0.0';

/**
 * 由已載入的劇本資料束＋玩家選擇建立初始 `GameState`（buildGameState(regions=[tokai,kinki])，
 * 18-roadmap M2-19）。開局日固定 1560 年 1 月 1 日（`startDay` 省略＝0＝`EPOCH_YEAR`，02 §5.6）。
 */
export function buildNewGameState(bundle: ScenarioBundleData, opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 0x100000000);
  return buildGameStateFromScenario(bundle, {
    appVersion: APP_VERSION,
    seed,
    playerClanId: opts.playerClanId,
    difficulty: opts.difficulty,
    startDay: 0,
    regions: NEW_GAME_REGIONS,
  });
}
