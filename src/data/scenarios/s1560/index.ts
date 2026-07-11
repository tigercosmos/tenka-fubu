// s1560「桶狹間前夜」劇本動態載入殼（M2-8；14 §3.1／01 §3.9.3；18 §8-D5）。
//
// 規格：plan/01-architecture.md §3.9.3（劇本資料不進主 bundle：`boot.ts` 以
// `await import('@data/scenarios/s1560/index.ts')` 動態載入，Vite 自動 code-split）；
// plan/14-scenario-data.md §3.1（`index.ts` 彙整匯出全部子檔為單一 `ScenarioBundleData` 形狀）、
// §7-T7（`index.ts` 彙整＋動態載入接線；驗收：`npm run build` 後主 bundle 不含劇本 JSON、
// 標題畫面可載入 s1560）。
//
// 【現況（M2-8）】本檔僅為「殼」：資料批次（B1 東海…B9 東北，14 §7）尚未落地——
// `src/core/state/builder.ts`（M2-8）已備妥消費端（`loadScenarioBundle`／`deriveScenarioInput`／
// `buildGameStateFromScenario`），但本目錄下尚無 `provinces.json`／`castles.json`／
// `officers/*.json` 等實體檔案可供靜態匯入（M2-9 B1 東海、M2-10 B2 近畿為最早批次；M8-25 起
// 逐批補完＋接上 `catalogs` 型錄檔，14-T6／T7）。
//
// 待批次資料就緒後，本檔將改為（14 §3.1 範式）：
//   import provinces from './provinces.json';
//   import castles from './castles.json';
//   // ...其餘同構（districts/roads/clans/events/officers 9 檔/catalogs 4 檔）
//   export const s1560: ScenarioBundleData = { id: 's1560', provinces, castles, ... };
//   export async function loadS1560Scenario() { return loadScenarioBundle(s1560); }
// 屆時 `loadS1560Scenario` 之呼叫端（`src/app/boot.ts` 等）以 `await import(...)` 觸發本模組
// 整體載入（含其內部靜態 import 之 JSON），達成主 bundle 不含劇本資料之目標——此為 Vite
// code-split 邊界落在「模組」而非「個別檔案」之緣故，見 01 §3.9.3。
//
// 本殼現階段僅暴露一個尚未可用的載入函式，明確拋出「資料未就緒」錯誤（不靜默回傳假資料，
// 也不讓呼叫端誤以為 s1560 已可玩）；一旦 M2-9 起首批 JSON 落地，改為上述範式即可，
// 呼叫端介面（`loadS1560Scenario(): Promise<ScenarioBundleData>`）不需變動。

import type { ScenarioBundleData } from '../../schemas';

/** s1560 劇本 id（14 §1）。 */
export const S1560_SCENARIO_ID = 's1560';

/**
 * 動態載入 s1560 劇本資料束（01 §3.9.3）。
 *
 * M2-8 現況：B1 東海批次（M2-9）尚未落地，本函式必定 reject——這是殼本身的預期行為
 * （不是缺陷）；`src/core/state/builder.ts` 的 `loadScenarioBundle`／`buildGameStateFromScenario`
 * 已就緒，待資料就緒後兩者即可直接串接。
 */
export async function loadS1560Scenario(): Promise<ScenarioBundleData> {
  return Promise.reject(
    new Error(
      's1560 劇本資料尚未就緒（B1 東海批次落地於 M2-9，14 §7）；' +
        '本檔為 M2-8 動態載入殼，待批次 JSON 到位後接上 loadScenarioBundle()。',
    ),
  );
}
