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

- 最新已驗證修正：`f6691c9` 修復聚落避讓預算；`89acc88` 修復 renderer GPU 快取索引增長。精確整合測試 6,442 通過、1 既有無嗣失敗、1 跳過；`0b4b1c1` 只格式化測試。原生 60 FPS、whole-heap、protected art、long-run 仍未完成，六張 Linux／Darwin 基準與無嗣規則等待明確決策。完整證據見 `docs/validation/2026-10-12/completion-audit/`。
