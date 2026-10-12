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

- `5f250eb` 修正 0.9 倍率的報告提示密度超標：上下 padding 統一減少，字級、完整換行與 32px 按鈕維持；原版十五項為 14 PASS／1 FAIL，候選十五項全通過，報告中心另驗 195 個控制。`cf9fb7e` 增加武將／設定／存讀檔三類面板十五倍率驗收，45 項通過。這些只是 M8-23 子門檻；所有強制 overlay、Battle 控制、其他面板、完整文字可讀性與原生全套五分鐘仍待驗證。新提示間距的六張候選圖已保存，尚未收到人工核准，不得更新 references。

- `934163c` 最小視窗鍵盤六項成功；逐項穩定前後畫面驗十一個鏡頭輸入，quick-save 以完成後的實際 snapshot 日為準。固定此來源整合 227 unit＋7 source contract＋6 原生跨畫面、型別／ESLint／資料／素材／build／bundle 通過；Linux final 報告十五及非政策四十五再次成功。Linux／Darwin 原視覺各 4 PASS／1 protected 三視角 FAIL，新的六張 final actual 仍待人工核准，舊審查提案已被新六圖取代。詳見 `ui-integrated-934163c` 與兩個 `protected-art-final-*-934163c` 證據套件。

- 最新已驗證修正：`f03ba63` 修復面板焦點下的 Home／M；`f5d8969` 清除貼圖批次的稀疏索引快取；`7d37c28` 增加政策面板十五倍率驗收。固定 `7d37c28` 全量測試 6,445 通過、1 既有無嗣失敗、1 跳過；原生 60 FPS、whole-heap、protected art、long-run 與其餘 M6–M9 門檻仍未完成。六張 Linux／Darwin 基準與無嗣規則等待明確決策。完整證據見 `docs/validation/2026-10-12/completion-audit/`。

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
