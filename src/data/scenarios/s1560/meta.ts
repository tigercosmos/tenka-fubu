// s1560 劇本輕量中繼資料（id／已載入地方批次）——刻意獨立於 `index.ts`。
//
// 為什麼要拆出這個檔案：`index.ts` 靜態 import 全部劇本 JSON（castles/districts/officers/…），
// 依 01 §3.9.3「劇本 JSON 不進主 bundle」須經 `await import('@data/scenarios/s1560/index')`
// 動態載入才能讓 Vite 把它 code-split 成獨立 chunk。但 `src/app/boot.ts` 在模組載入當下（非等到
// 玩家點「新遊戲」）就需要 `S1560_SCENARIO_ID`（`SUPPORTED_SCENARIO_IDS`／劇本 id 比對）與
// `S1560_LOADED_REGIONS`（`NEW_GAME_REGIONS`）這兩個極輕量常數——若直接對 `index.ts` 做「靜態
// import 常數＋動態 import 載入函式」的混合寫法，Rollup 會因為偵測到同一模組同時被靜／動態
// import 而放棄 code-split（`npm run build` 會印出「dynamic import will not move module into
// another chunk」警告），劇本 JSON 因而混進主 bundle，違反 14 §7-T7 驗收（「主 bundle 不含劇本
// JSON」）。實測（M2-19）：混寫版本的主 chunk 內可直接 grep 到「織田信長」等劇本資料字串。
//
// 拆開後：`boot.ts` 只靜態 import 本檔（零 JSON 依賴，bundle 成本可忽略）；`index.ts` 的
// `loadS1560Scenario` 仍是唯一真正載入 JSON 的入口，只透過 `await import(...)` 呼叫。

/** s1560 劇本 id（14 §1）。 */
export const S1560_SCENARIO_ID = 's1560';

/** 目前已落地的地方批次（M2-9 東海／M2-10 近畿）；供 `src/app/boot.ts` 的 `regions` 白名單使用。 */
export const S1560_LOADED_REGIONS = ['tokai', 'kinki'] as const;
