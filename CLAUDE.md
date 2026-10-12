# 天下布武（tenka-fubu）— 給 coding session 的專案說明

瀏覽器單機戰國大戰略遊戲（向《信長之野望·新生》致敬的非商業同人作品）。
純前端 SPA：TypeScript strict＋React 18＋Vite＋Zustand＋PixiJS 8，搭配 Rust WASM 路徑核心與 Web Worker 模擬，部署 GitHub Pages。

## 架構鐵律（違反即 CI 紅燈，不得繞過）

1. `src/core/` 是純狀態機，禁止 import React／Pixi／DOM API；
   Rust 路徑核心位於 `rust/engine/`，經明確 WASM 介面供 core 使用，Worker 的載入與生命週期由 app 層持有。
   禁止 `Math.random`／`Date.now`（一律用 `src/core/rng.ts` 的五流 mulberry32）；每日十三步結算順序不變。
2. 一切狀態變更走 Command 管道：UI 只 dispatch Command 與訂閱 selector；
   同（劇本、種子、Command 紀錄）必須重放出 bit-exact 相同狀態（golden test 把關）。
3. 全部平衡數值命名 `BAL.camelCaseName`，唯一定義於 `src/core/balance.ts`；
   測試期望值由 BAL 推導，不寫魔法數字。
4. 全部 UI 文字經 `t(key)` 取自 `src/i18n/zh-TW.ts`，繁體中文（台灣慣用語）；
   全案禁止簡體字與日文新字體（`npm run validate:data` 內建掃描）。
5. 每日 tick 的 13 步系統順序固定（00 §5.4），不得增刪重排。

## 常用指令

| 指令                                                 | 用途                                                  |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                        | 開發伺服器（`?debug=1&seed=42` 開除錯面板與固定種子） |
| `npm run typecheck`                                  | `tsc --noEmit` ＋ core 純度檢查（tsconfig.core.json） |
| `npm run lint` / `npm run format`                    | ESLint＋Prettier                                      |
| `npm test` / `npm run test:core` / `npm run test:ui` | Vitest 全部／core／ui                                 |
| `npm run validate:data`                              | 劇本資料 zod 驗證＋簡體字掃描＋字型涵蓋率             |
| `npm run golden:update`                              | 重寫 golden 快照（僅限刻意的數值變更，PR 須說明）     |
| `npm run wasm:build`                                 | 使用鎖定 Rust 工具鏈重建 WASM 核心與來源 manifest     |
| `npm run wasm:check`                                 | 驗證來源、WASM 產物與 ABI；dev／build 前自動執行      |
| `npm run e2e`                                        | build＋Playwright smoke（chromium）                   |
| `npm run bench` / `npm run simulate`                 | 效能取樣／無頭全 AI 平衡模擬（M7 起）                 |

## plan/ 目錄用法與優先序

- 開工前先讀 `plan/00-foundations.md`（最高準則），再依 `plan/18-roadmap.md`
  找到當前里程碑（見 `milestone.json` 的 `current`），讀該里程碑「開工前必讀」清單。
- 規格衝突優先序：`00` > `02` > `15` > 系統文件（03–10、16）> UI 文件（11–13）；
  里程碑歸屬以 `18` 為準；術語以 `00 §14`／`19-glossary` 為準。
- 發現規格矛盾：依優先序決定、完成實作，回寫對應 plan 文件 §8「設計決策記錄」。
  **絕對不要修改 `plan/00-foundations.md`。** 不得留下 TBD。
- 每完成一個任務：commit 訊息帶任務 ID（如 `[M3-8]`，格式見 `plan/18-roadmap.md` §3.13）；
  每完成一個里程碑：執行 `plan/18-roadmap.md` §3.14 checkpoint 程序。
- 使用者要求的 Rust WASM／Worker 架構裁決見 `plan/01-architecture.md` §8 D22。
  正式流程不在 WASM 或 Worker 載入失敗時悄悄改用同步後端；TypeScript 路徑實作保留作一致性參考。

## 目前進度

- 當前里程碑：見 `milestone.json`；歷史進度：見 README 進度表。

- `a98046e` 修正朝廷 E2E 在正常 x5 Worker 日結算前讀取快照的競態：保留原 clock／UI，等精確下一日及零 pending ticks 後再讀完整狀態。原案例與觀測衍生版本均 RED，精確候選 PASS。`1e40539` 修正 earned-alliance 的另一種正常影格邊界：原 day299 尚未派發下一 tick，不是 generator 失敗；保留原 32／152／120ms 與 UI 控制，最多補三個受 x5／無 dialog 保護的 16ms RAF，每次等 pending tick 完成，仍要求精確一日及原完整斷言。原版／診斷 RED，最終原生 PASS 21.4 秒。最後固定 `1e40539` 的型別、完整 ESLint、格式、364 項 discovery 與 1,633 Git 輸入前後校驗通過；完整原生未重跑。
- Hojo 援軍尚未完成：day120 信用已足夠，但實際分數 0.487169 未達 0.5；診斷延至 day150 時 null cache 的表面 0.9 不是合法安全證據，實際刷新分數為零。day121–125 的強制重算 0.5716 也只是反事實，正式十日 cache 仍沿用 day120 分數。六個省略 eventEngine 的 clone-core 診斷均拒絕，沒有宣稱覆蓋 day151–180。另有 exact label locator 與實際 combobox AX 不符；未把 locator 修正當成正向出兵通過。需要原期限內真正改善威脅／防禦的合法遊戲路徑，不能改門檻或操弄 cache。
- 色覺原 achromatopsia 案例再次 RED：還原後九個差異像素位於右上 HUD 按鈕邊緣，這次沒有重現較早左側縫隙。獨立診斷的三組無 CDP 對照均零差異；還原差異由原樣式十一個、移除陰影六個、隱藏 HUD／rail 零個，僅支持 DOM／compositor 邊緣相關，未確定單一 paint owner。WebGL canvas readback 為均勻黑色，無效而排除。plan17 要求色覺／灰階人工辨識檢查，精確 full-page CDP 還原是額外 E2E oracle；本批保持原零差異斷言、期限及基準，沒有把診斷當成通過。

- `c74a46c` 將 coast 的 renderer-ready 前置抽成共用 helper，只接到 coast、army material、context focus 三個原生路徑，在第一個需要 renderer 的呼叫前等待。控制延遲字型載入時舊兩項均因尚未掛載失敗，候選延遲四項與精確原案例四項均通過；既有 coast 延遲回歸保持。固定提交的型別、完整 ESLint、四檔格式與 364 項 discovery 通過，1,633 個來源輸入前後同 Git。沒有改遊戲、期限、全域 fixture 或保護基準。
- `bf6638e` 修正軍團 E2E 在 Worker 結算完成前讀狀態的競態：保留原 `stepDays`，以原五秒 poll 等精確目標日及零 pending ticks。原兩項均失敗，觀測到 pendingTicks=1 與舊日期；候選兩項通過，原軍團／金庫／解散／手動暫停斷言保持。最後型別、完整 ESLint、五檔格式、364 項 discovery 與 1,633 來源前後校驗通過。首次來源前置因先寫入的 CLAUDE 交接段落停止，已保存唯一差異及恢復後的獨立成功執行；未改用 blocker 語意不同的 `stepDaysAsync`。
- 固定較早 `ecba08b` 的完整 364 項並行度診斷，僅改 CLI workers，均到原 300 秒上限。4 workers：162 PASS／9 FAIL／0 timeout／20 其他 skipped／2 interrupted／171 未派發；8 workers：218 PASS／9 FAIL／1 timeout／23 其他 skipped／3 interrupted／110 未派發。兩者都 RED，未採用新的 worker 上限；原 16-worker `1464146` 是不同來源／363 項，只能作歷史參考。兩個新測試修正尚未重跑完整原生。

- `5500bc0` 將三個 Ending 瀏覽器流程的合法存檔生成集中到檔案內 `beforeAll`，每個 worker 生命週期各新生成一次；保留獨立 browser context、單一 `chromium` project、原 5 秒 generator／300 秒全套上限。三項通過，生成失敗、worker 重啟、毀損存檔、無關 subset 與子程序逾時清理均有控制證據。這不是每次 invocation 絕對只生成一次，也尚未清除全套的生成逾時。
- `1464146` 修正 actor-depth 測試把 canonical Y 當成地形抬升後 scene Y 的錯誤；改用獨立節點投影觀測，保留精確城池腳點相等、軍隊 anchor 關係、排序／重疊／選取斷言。原三項 1 FAIL／2 PASS，最後三項通過。`3ec8d7` 補 coast 初次掛載的 ready 前置；控制延遲字型載入時舊版失敗，新版原案例加回歸兩項通過。三次提交都只改 E2E，沒有改遊戲或期限。
- 固定 `1464146` 原完整原生 363 項、預設 16 workers，300,015ms 到全套上限：226 PASS、15 FAIL、3 case timeout、29 其他 skipped、7 interrupted、83 未派發。Ending 單一 generator 仍花 6.719 秒而超過原 5 秒；後兩項未執行。該批次最後 `3ec8d7` 的型別、coast ESLint／Prettier、364 項 discovery 與 1,632 輸入前後校驗成功；該批次完整 ESLint 與完整原生釘選 `1464146`，沒有改標。後續完整 ESLint 見上方 `bf6638e`。
- 分類更正：重新比對原 `8ea965a` JSON 與七項 terminal interrupted 名稱，正確分類為 222 PASS、18 FAIL、3 timeout、27 其他 skipped、7 interrupted、85 未派發。先前的 34／7／78 分法把有 skipped result 的 interrupted 錯當成空結果；原 raw 與歷史套件不改，新 `native-full-suite-1464146` 保存補正。兩次全套都未通過，不能把四個額外 PASS 當因果效能提升。
- 色覺 CDP 還原仍 RED；獨立重現 416 個差異像素，無 CDP 控制也有同區域 385 個差異，paint owner 未確定，沒有放寬零差異或更換基準。下一步可做固定來源、完整案例、原期限下的 4／8 worker 診斷；未採用新的 worker 設定，亦不再重複同來源 16-worker 全套。

- `51abd75` 修復 1280×720／1.5 倍率結局徽記被上緣裁切：只把垂直對齊改為 `safe center`，保留可捲動內容及原字級。Ending、事件、具申／月結各十五倍率的分組證據已保存；具申／月結最後鍵盤版本十五項通過。只有 Event 最後新增的橫向溢出與 Enter 斷言只在精確 1.5 倍率 focused run 驗過，不能把較早事件十五項成功改標為最後測試版本。Battle 控制十五倍率加原生鍵盤共十六項通過。
- `b867014` 修正 Battle 速度按鈕的可及名稱，包含可見倍率，並為戰法容器加上 group 語意。Axe serious 三節點降為零，原 critical 零維持；41 項受影響的一般原生案例通過。`3da2334` 補齊十個 unit 精確名稱查詢，原 7 FAIL／14 PASS 轉為 21 PASS。最後固定 `3da2334` 的 138 focused tests、型別、完整 ESLint、資料／素材、build／bundle 成功，1,632 輸入前後符合 Git。national-soak 只有 selector 靜態更新，沒有長跑結論。
- 原完整原生 `51abd75` 在 Node 22 discovery 因 court-rank 間接匯入 JSON 而失敗；`8ea965a` 只修正測試的存檔預期值，保留全 state 相等。原完整 `8ea965a` 的分類補正見上方；現有個別測試的 75–270 秒 override 未改，不能宣稱每項都受 60 秒限制。最新完整 core 仍釘選 `7d37c28`，不得把 focused 或後續語意修改當全量成功。
- 先前 Ending dependency setup 提案由 `5500bc0` 的檔案內 worker 生命週期方案取代，避免 `--project=chromium` 漏掉新 project 或無關 subset 被迫生成 fixture。其餘原生失敗、strict60、whole-heap、long-run、其他介面與全 M6–M9 gate 保持開放。無嗣／戰術終局、人口校準及 934163c 六圖人工核准均未收到決策。
- 後續隔離副本使用 `docs/validation/2026-10-12/completion-audit/scoped-source-snapshot-79682cd/tenka-scoped-source-archive.py` 的 allowlist／精確 delta 與全來源校驗，禁止再串流整個驗證文件樹。這批 Battle setup 的全 tracked archive 例外已明載；所有新的驗證 subprocess 仍須先 exclusive-create 完整 log，Playwright 使用唯一 output／report。未 push／deploy，milestone 未提升。

- `5f250eb` 修正 0.9 倍率的報告提示密度超標：上下 padding 統一減少，字級、完整換行與 32px 按鈕維持；原版十五項為 14 PASS／1 FAIL，候選十五項全通過，報告中心另驗 195 個控制。`cf9fb7e` 增加武將／設定／存讀檔三類面板十五倍率驗收，45 項通過。這些只是 M8-23 子門檻；強制 overlay、Battle 控制的後續結果見上方，其他面板、完整文字可讀性與原生全套五分鐘仍未完成。新提示間距的六張候選圖已保存，尚未收到人工核准，不得更新 references。

- `934163c` 最小視窗鍵盤六項成功；逐項穩定前後畫面驗十一個鏡頭輸入，quick-save 以完成後的實際 snapshot 日為準。固定此來源整合 227 unit＋7 source contract＋6 原生跨畫面、型別／ESLint／資料／素材／build／bundle 通過；Linux final 報告十五及非政策四十五再次成功。Linux／Darwin 原視覺各 4 PASS／1 protected 三視角 FAIL，新的六張 final actual 仍待人工核准，舊審查提案已被新六圖取代。詳見 `ui-integrated-934163c` 與兩個 `protected-art-final-*-934163c` 證據套件。

- 前批已驗證修正：`f03ba63` 修復面板焦點下的 Home／M；`f5d8969` 清除貼圖批次的稀疏索引快取；`7d37c28` 增加政策面板十五倍率驗收。固定 `7d37c28` 全量測試 6,445 通過、1 既有無嗣失敗、1 跳過；原生 60 FPS、whole-heap、protected art、long-run 與其餘 M6–M9 門檻仍未完成。六張 Linux／Darwin 基準與無嗣規則等待明確決策。完整證據見 `docs/validation/2026-10-12/completion-audit/`。

## 貼圖批次快取與政策倍率驗收（2026-10-12）

- `f5d8969` 以唯一非零負數 TextureSource UID 避免 sparse indexed backing，clear 時刪除已釋放 key。29-target 精確修補保留 CJS／ESM、排序、padding、替換與重用。27 項 Pixi 測試通過；既有 25-target 可直接升級，實測四次寫入後重跑零次。這不改變較早 23→25 必須 fresh npm ci 的限制。
- sim4 原 20 次 remount 通過；獨立 240 次診斷的 63 個穩定批次 ID map 在 120／240 次皆零 key／indexed backing。原快照的分析獨立重跑與保存 JSON 完全相同。延長診斷後半仍增加 208,584 bytes，因此 whole-heap 未達標。
- Fresh baseline／candidate 三張 actual PNG 完全相同，原保護基準仍 RED。候選獨立 GPU probe 因尚未掛載 renderer 而失敗；GPU 身分只在延長診斷的 actual page 直接核對，不將同 launch flags 當原視覺執行的 GPU 證明。
- `7d37c28` 的政策驗收涵蓋 1280×720、0.8–1.5 每 0.05 共十五倍率、十二政策與詳情、捲動及真實鍵盤路徑。25-target 與整合 29-target 各十五項通過；另 375 個互動目標符合 32×32 CSS px 下限。這只完成政策子門檻，不代表 M8-23 全畫面完成。
- 固定 `7d37c28` 全量為 6,445 通過、1 既有無嗣失敗、1 跳過，694 檔；1,557 來源前後精確符合 Git blobs。型別、完整 lint、資料／素材、建置及 bundle 通過。來源後續若改動，不得將此結果改標為新 HEAD 全量。
- 證據缺失已明載：早期 npm PATH 失敗 log 遭覆寫；整合政策第一輪十五項成功 log 保留，但幾何與圖片被後續 probe 覆寫，恢復執行另行保存，不能冒充第一輪。後續所有 Playwright 作業必須指定唯一 output、report 與 log 路徑。
- Battle 手動存讀仍缺少原子 tick 邊界及戰術 pending queue 的保存／還原契約；依 16 高優先規格保留停用，未自行擴充 SaveFile 或丟棄未執行命令。其餘全專案門檻保持，未 push／deploy。

- `f03ba63` 依 11 主頁快捷鍵範圍讓非原生控制的面板焦點可使用 Home／M；輸入、按鈕、dialog／modal、重複鍵與資源列本地 Home 仍受原 guard 保護。舊來源配新增測試為 2 FAIL／18 PASS，修正後 20 PASS；真實鍵盤在武將特性焦點下由原無效轉為隱藏小地圖與選取本據城。七項跨畫面原生控制第一輪平行有一個斷言前 JSON 解析失敗，同七項串行全部通過，第一輪 raw stdout 未保存，僅串行成功 log 封存。最新全量仍是修正前 `7d37c28`，未冒稱 `f03ba63` 全量。

- 後續驗證先以 exclusive-create 的唯一 log 檔接住完整 stdout／stderr，再啟動 subprocess；Playwright 同時使用唯一 output／report 路徑。不得只依賴工具回覆或完成後才搬走預設目錄。

- `f03ba63` 與新增證據檔完成最終完整 ESLint／Prettier，exit 0；詳細 log 封存在 hotkey-main-focus。完整 Vitest 結果仍釘選 `7d37c28`。
