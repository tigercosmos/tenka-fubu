// s1560「桶狹間前夜」劇本動態載入殼（M2-8 骨架 → M2-19 接上實資料）。
//
// 規格：plan/01-architecture.md §3.9.3（劇本資料不進主 bundle：`boot.ts` 以
// `await import('@data/scenarios/s1560/index.ts')` 動態載入，Vite 自動 code-split）；
// plan/14-scenario-data.md §3.1（`index.ts` 彙整匯出全部子檔為單一 `ScenarioBundleData` 形狀）、
// §7-T7（`index.ts` 彙整＋動態載入接線）；plan/18-roadmap.md M2-9（B1 東海）／M2-10（B2 近畿）／
// M2-19（本檔自殼轉實作，接上新遊戲流程）。
//
// 【現況（M2-19）】`src/data/scenarios/s1560/*.json` 已有 B1 東海＋B2 近畿兩批實資料（M2-9／M2-10），
// 但尚缺兩個型錄：
//   - `policies.json`（05-T5-1／18-roadmap M3-5 才落地，`zScenario.catalogs.policies` 要求恰 13 筆）；
//   - `events.json`（劇本腳本事件，晚於本批）。
// 依 `tools/validate.ts` 既有「增量建置」慣例（`loadRawScenario`：檔案缺席即以空陣列處理、不視為
// 違規，見該檔檔頭），本檔比照辦理：不對整份資料呼叫 `zScenario.parse`（該 aggregate schema 對
// `catalogs.policies` 有 `.length(13)` 硬性要求，缺資料時必定丟出，等同讓「尚有型錄未到位」阻擋
// 「已到位批次可玩」，兩者優先序上限縮的是後者，不合理）——改為對「已存在」的每個檔案個別以其
// 專屬 zod schema（與 `tools/validate.ts`/`src/core/state/builder.ts` 共用同一份 `src/data/schemas`）
// 解析，缺席型錄以空陣列補上。這對 `buildGameState` 管線無副作用：`deriveScenarioInput`
//（`src/core/state/builder.ts`）只消費 `bundle.catalogs.traits`（篩 common 稀有度供浪人生成）與
// `bundle.catalogs.personas`（AI persona 表），完全不讀 `catalogs.policies`／`catalogs.tactics`／
// `bundle.events`——留空不影響任何既有建局路徑。待 M3-5 補上 `policies.json`、劇本事件腳本就緒後，
// 本檔可改回單純 `zScenario.parse(rawBundle)` 一次到位（回寫本節）。
//
// 9 地方 `officers` 陣列（§3.1 `officers/{region}.json`，順序＝`REGION_VALUES`）：本階段僅
// `tokai`（索引 0）／`kinki`（索引 1）兩檔存在，其餘 7 地方留空陣列，待 M8-26 全國批次逐批補上。
//
// 【`S1560_SCENARIO_ID`／`S1560_LOADED_REGIONS` 定義於 `./meta.ts`，本檔轉出】見該檔檔頭：
// `src/app/boot.ts` 需要這兩個常數在模組載入當下即可用，若直接對本檔（同時含 JSON 靜態 import）
// 做「靜態 import 常數＋動態 import 載入函式」的混寫，Rollup 會放棄 code-split，劇本 JSON 因而
// 混入主 bundle（實測 grep 主 chunk 可見「織田信長」等資料字串），違反 01 §3.9.3／14 §7-T7 驗收。

import provincesJson from './provinces.json';
import castlesJson from './castles.json';
import districtsJson from './districts.json';
import roadsJson from './roads.json';
import clansJson from './clans.json';
import personasJson from './personas.json';
import traitsJson from './traits.json';
import tacticsJson from './tactics.json';
import tokaiOfficersJson from './officers/tokai.json';
import kinkiOfficersJson from './officers/kinki.json';

import {
  zProvincesFile,
  zCastlesFile,
  zDistrictsFile,
  zRoadsFile,
  zClansFile,
  zPersonasFile,
  zTraitsFile,
  zTacticsFile,
  zOfficersFile,
} from '../../schemas';
import type { ScenarioBundleData } from '../../schemas';
import { REGION_VALUES } from '../../../core/state/enums';
import { S1560_SCENARIO_ID, S1560_LOADED_REGIONS } from './meta';

export { S1560_SCENARIO_ID, S1560_LOADED_REGIONS };

/** 9 地方索引官員陣列（§3.1；本階段僅 tokai／kinki 有資料，其餘為空陣列）。 */
function buildOfficersByRegion(): ScenarioBundleData['officers'] {
  const tokaiOfficers = zOfficersFile.parse(tokaiOfficersJson).officers;
  const kinkiOfficers = zOfficersFile.parse(kinkiOfficersJson).officers;

  return REGION_VALUES.map((region) => {
    if (region === 'tokai') return tokaiOfficers;
    if (region === 'kinki') return kinkiOfficers;
    return [];
  });
}

/**
 * 動態載入 s1560 劇本資料束（01 §3.9.3）；`await import('@data/scenarios/s1560/index.ts')`
 * 觸發本模組（含其內部靜態 import 之全部 JSON）整體載入，達成主 bundle 不含劇本資料之目標。
 *
 * 每檔各自以其專屬 zod schema 解析（見本檔檔頭決策，與 `tools/validate.ts`/`src/core/state/
 * builder.ts` 共用同一份 `src/data/schemas`）；任一檔案解析失敗即拋出含檔名與欄位路徑的
 * `ZodError`（不靜默吞下資料錯誤）。`catalogs.policies`／`events` 為尚未落地之型錄，固定回傳空陣列。
 */
export function loadS1560Scenario(): Promise<ScenarioBundleData> {
  const clansFile = zClansFile.parse(clansJson);

  const bundle: ScenarioBundleData = {
    id: S1560_SCENARIO_ID,
    provinces: zProvincesFile.parse(provincesJson).provinces,
    castles: zCastlesFile.parse(castlesJson),
    districts: zDistrictsFile.parse(districtsJson),
    roads: zRoadsFile.parse(roadsJson).edges,
    clans: clansFile.clans,
    diplomacy: clansFile.diplomacy,
    events: [],
    officers: buildOfficersByRegion(),
    catalogs: {
      traits: zTraitsFile.parse(traitsJson).traits,
      policies: [],
      tactics: zTacticsFile.parse(tacticsJson).tactics,
      personas: zPersonasFile.parse(personasJson).personas,
    },
  };
  return Promise.resolve(bundle);
}
