# 18 — 實作路線圖（Roadmap：M0–M9）

> 依 `plan/00-foundations.md` §12 的里程碑框架展開。本文件是**里程碑歸屬與任務分解的單一真相來源**：
> 各系統文件 §7 的任務項若與本文件的里程碑歸屬不一致，以本文件為準（歸屬），
> 任務的技術內容與驗收細節仍以各系統文件為準（內容）。

---

## 1. 目的與範圍

### 1.1 目的

把 `plan/01`～`plan/17` 各文件的「實作任務清單」彙整為一條可直接執行的施工路線：
每個里程碑（M0–M9）給出目標敘述、開工前必讀文件、任務分解（含依賴與規模）、
以及可操作的 Definition of Done（DoD：跑哪個指令、看到什麼）。

### 1.2 範圍（本文件擁有）

- M0–M9 的任務分解、任務間依賴、規模估計、里程碑歸屬。
- commit／PR 切分粒度與訊息格式。
- 里程碑收尾 checkpoint 程序（全測試、README 進度回寫、golden 快照更新規則）。
- 風險清單與緩解排程。
- `CLAUDE.md` 的內容規格（M0 產出物）。
- `milestone.json`（CI 門檻條件化設定檔，17 §3.11.2 所稱「設定檔」的定案）。

### 1.3 範圍外（僅引用）

- 各任務的技術規格、公式、型別 → 各系統文件（見每個任務的「規格依據」欄）。
- 測試案例內容與品質門檻表 → `plan/17-testing.md` §3.4／§3.11.2。
- 劇本資料的批次製作內容 → `plan/14-scenario-data.md` §3.5／§3.6／§7。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | §12 里程碑概覽為本文件骨架；§7 分工表決定各任務的規格依據 |
| `plan/01-architecture.md` | §7 任務 A1–A13 分配至 M0/M1/M2（歸屬微調見 §8-D3）；npm scripts 以 01 §3.7.5 為準 |
| `plan/02-data-model.md` | §7 任務全數落 M1（builder 資料側除外，落 M2） |
| `plan/03-game-loop.md` | §7 任務 T1–T12 全數落 M1 |
| `plan/04-map-and-movement.md` | §7 任務拆為 M2（渲染／尋路）與 M4（行軍／制壓／遭遇），見 §8-D2 |
| `plan/05-domestic.md` | §7 任務全數落 M3（一揆鎮壓的軍事接線延至 M4，見 §8-D12） |
| `plan/06-officers.md` | §7 任務拆為 M3（T1–T5）與 M6（T6–T12），見 §8-D8 |
| `plan/07-military.md` | §7 任務拆為 M4（T1–T5、T11、T12 前半）、M5（T6–T10）、M6（T12 後半）、M7（T13 軍團） |
| `plan/08-diplomacy.md` | §7 任務全數落 M6 |
| `plan/09-ai.md` | §7 任務全數落 M7（領主開發方針子集提前至 M3，見 §8-D8） |
| `plan/10-events-and-victory.md` | §7 任務全數落 M8 |
| `plan/11-ui-screens.md` | §7 任務依所屬系統分散於 M1–M8（每個任務表標明） |
| `plan/12-ui-components.md` | §7 任務依消費時點分散於 M1–M8 |
| `plan/13-i18n-strings.md` | 字串 key 規範；若該文件於某里程碑開工時尚未存在，回退規則見 §3.15-R5 |
| `plan/14-scenario-data.md` | §7 之 T1–T4 落 M2；批次 B1/B2 落 M2、B3–B9 落 M8；T5–T7 落 M8 |
| `plan/15-balance.md` | BAL 定案主表；尚未存在時的回退規則見 §3.15-R5 與 §8-D1 |
| `plan/16-save-and-settings.md` | §7 任務全數落 M8（追認 17 §8-10 的 P4 門檻預設） |
| `plan/17-testing.md` | §3.11.2 品質門檻表為每個里程碑 DoD 的必要條件；測試任務隨系統分散落地 |

---

## 3. 設計細節

### 3.1 里程碑總覽與依賴

```
M0 鷹架 ──► M1 core骨架＋最小HUD ──► M2 資料子集＋地圖 ──► M3 內政 ──► M4 軍事(自動解算)
                                                                        │
        M9 平衡/效能/發版 ◄── M8 事件/存檔/全國資料 ◄── M7 AI ◄── M6 外交/家臣 ◄── M5 合戰
```

- 里程碑**嚴格順序執行**，不並行：後一里程碑的開工條件是前一里程碑 checkpoint（§3.14）完成。
- 每個里程碑完成時，`plan/17-testing.md` §3.11.2 該欄全部「✓」項必須在 CI 上阻斷生效且綠燈。
- 里程碑內的任務可依依賴欄局部並行（同一 session 內以拓撲序逐一完成即可）。

### 3.2 任務規格格式

- **任務 ID**：`M{里程碑}-{序號}`（如 `M3-8`）。commit 與 PR 引用此 ID（§3.13）。
- **規模**：`S` ＝ 半日、`M` ＝ 1 日、`L` ＝ 2–3 日（以一個專注實作 session 為半日計）。
- **規格依據**：`文件 §節` 或 `文件-任務號`（如 `05-T5-4` 指 `plan/05-domestic.md` §7 的 T5-4）。
  任務的完整驗收標準以規格依據處的原文為準；本文件「驗收標準」欄為摘要＋本文件新增的整合條件。
- **產出檔案**：主要新增／修改檔案（非窮舉；目錄結構依 00 §3）。

### 3.3 M0 — 專案鷹架

**目標**：建立可 build、可測試、可部署的空專案，並讓四道護欄（core 純度、決定論 lint、
簡體字掃描、CI）從第一個 commit 起生效。**本里程碑不寫任何遊戲邏輯。**

**開工前必讀**：`00`（全文）、`01` §3（全）、`17` §3.2／§3.6.2／§3.11、本文件 §3.13–§3.14。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M0-1 | 撰寫 `CLAUDE.md`（內容規格見 §3.3.1） | 本文件 §3.3.1 | `CLAUDE.md` | — | S | 檔案含 §3.3.1 全部五節；指令表與 01 §3.7.5 一致 |
| M0-2 | 專案鷹架：Vite＋React＋TS strict、目錄骨架、全部設定檔 | 01-A1 | `package.json`、`vite.config.ts`、`src/**`（空殼） | M0-1 | M | 01-A1 驗收：`dev`/`build`/`typecheck`/`lint`/`test` 全通過 |
| M0-3 | `tsconfig.core.json` core 純度把關 | 01-A2 | `tsconfig.core.json` | M0-2 | S | 01-A2 驗收：core 內寫 DOM API 使 typecheck 失敗 |
| M0-4 | ESLint 邊界規則＋決定論守門（禁 `Math.random`/`Date.now` 於 core） | 01-A3、03-T12 | `eslint.config.js` | M0-2 | S | 01-A3 與 03-T12 驗收全文 |
| M0-5 | 測試基建：vitest workspace、`TESTCFG`、helpers 與 hash | 17-T1、17-T2 | `vitest.workspace.ts`、`tests/config.ts`、`tests/helpers/*` | M0-2 | M | 17-T1/T2 驗收：`npm test` 可跑；`fnv1a64('')` 測試向量通過 |
| M0-6 | 簡體字掃描器（黑名單三層） | 17-T3 | `tools/simplified-chars.ts`、`tools/scan-simplified.ts`、`tests/data/no-simplified.spec.ts` | M0-5 | M | 17-T3 驗收：植入 17 §7-T3 所列三個測試字元（簡體／新字體／語境各一）各報 1 筆；全 repo 0 筆 |
| M0-7 | `validate:data` 佔位：`tools/validate.ts` stub（無劇本資料時輸出提示、exit 0）＋掃描器接線 | 01 §3.7.5、§8-D6 | `tools/validate.ts` | M0-6 | S | `npm run validate:data` 綠燈且輸出「尚無劇本資料」提示 |
| M0-8 | CI workflow（install→lint/typecheck/unit/e2e 五 job） | 01-A4、17-T13 | `.github/workflows/ci.yml` | M0-5 | M | 01-A4 驗收：PR 觸發、任一步失敗紅燈 |
| M0-9 | 部署 workflow（GitHub Pages） | 01-A5 | `.github/workflows/deploy.yml` | M0-8 | S | 01-A5 驗收：push main 後 Pages URL 可開、資產無 404 |
| M0-10 | 里程碑設定與進度表：`milestone.json`、README 進度表、PR 模板 | 本文件 §4.1／§4.2 | `milestone.json`、`README.md`、`.github/pull_request_template.md` | M0-2 | S | `milestone.json` 通過 §4.1 型別；README 含 §4.2 進度表且 M0 列為進行中；README 含 00 §1.2 致敬聲明 |
| M0-11 | 字型子集管線 | 01-A13 | `tools/subset-font.ts`、`src/ui/styles/fonts/*` | M0-7 | M | 01-A13 驗收：缺字使 `validate:data` 失敗；重跑後通過 |

**第一步具體指令（M0 開工）**：

```bash
npm create vite@latest tenka-fubu -- --template react-ts
cd tenka-fubu
npm i zustand pixi.js idb-keyval lz-string zod
npm i -D vitest @vitest/coverage-v8 @playwright/test eslint prettier tsx \
        @testing-library/react @testing-library/user-event jsdom
mkdir -p src/core/{state,commands,systems/ai,save} src/data/{schemas,map,scenarios/s1560} \
         src/ui/{screens,components,map,hooks,styles} src/i18n src/app tools tests e2e plan
git init && git add -A && git commit -m "chore(scaffold): 專案鷹架初始化 [M0-2]"
```

#### 3.3.1 CLAUDE.md 內容規格（M0-1 產出；以下為全文範本，實作時原樣落地並隨里程碑更新進度節）

````markdown
# 天下布武（tenka-fubu）— 給 coding session 的專案說明

瀏覽器單機戰國大戰略遊戲（向《信長之野望·新生》致敬的非商業同人作品）。
純前端 SPA：TypeScript strict＋React 18＋Vite＋Zustand＋PixiJS 8，部署 GitHub Pages。

## 架構鐵律（違反即 CI 紅燈，不得繞過）

1. `src/core/` 是純 TypeScript 狀態機，禁止 import React／Pixi／DOM API；
   禁止 `Math.random`／`Date.now`（一律用 `src/core/rng.ts` 的五流 mulberry32）。
2. 一切狀態變更走 Command 管道：UI 只 dispatch Command 與訂閱 selector；
   同（劇本、種子、Command 紀錄）必須重放出 bit-exact 相同狀態（golden test 把關）。
3. 全部平衡數值命名 `BAL.camelCaseName`，唯一定義於 `src/core/balance.ts`；
   測試期望值由 BAL 推導，不寫魔法數字。
4. 全部 UI 文字經 `t(key)` 取自 `src/i18n/zh-TW.ts`，繁體中文（台灣慣用語）；
   全案禁止簡體字與日文新字體（`npm run validate:data` 內建掃描）。
5. 每日 tick 的 13 步系統順序固定（00 §5.4），不得增刪重排。

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器（`?debug=1&seed=42` 開除錯面板與固定種子） |
| `npm run typecheck` | `tsc --noEmit` ＋ core 純度檢查（tsconfig.core.json） |
| `npm run lint` / `npm run format` | ESLint＋Prettier |
| `npm test` / `npm run test:core` / `npm run test:ui` | Vitest 全部／core／ui |
| `npm run validate:data` | 劇本資料 zod 驗證＋簡體字掃描＋字型涵蓋率 |
| `npm run golden:update` | 重寫 golden 快照（僅限刻意的數值變更，PR 須說明） |
| `npm run e2e` | build＋Playwright smoke（chromium） |
| `npm run bench` / `npm run simulate` | 效能取樣／無頭全 AI 平衡模擬（M7 起） |

## plan/ 目錄用法與優先序

- 開工前先讀 `plan/00-foundations.md`（最高準則），再依 `plan/18-roadmap.md`
  找到當前里程碑（見 `milestone.json` 的 `current`），讀該里程碑「開工前必讀」清單。
- 規格衝突優先序：`00` > `02` > `15` > 系統文件（03–10、16）> UI 文件（11–13）；
  里程碑歸屬以 `18` 為準；術語以 `00 §14`／`19-glossary` 為準。
- 發現規格矛盾：依優先序決定、完成實作，回寫對應 plan 文件 §8「設計決策記錄」。
  **絕對不要修改 `plan/00-foundations.md`。** 不得留下 TBD。
- 每完成一個任務：commit 訊息帶任務 ID（如 `[M3-8]`，格式見 `plan/18-roadmap.md` §3.13）；
  每完成一個里程碑：執行 `plan/18-roadmap.md` §3.14 checkpoint 程序。

## 目前進度

- 當前里程碑：見 `milestone.json`；歷史進度：見 README 進度表。
````

#### 3.3.2 M0 Definition of Done

1. `npm run dev` → 瀏覽器顯示空白 App 無 console error。
2. `npm run build && npm run preview` → 頁面可開。
3. `npm run typecheck && npm run lint && npm test && npm run validate:data` 全綠。
4. 在 `src/core/` 任一檔臨時加入 `Math.random()` → `npm run lint` 紅燈（驗畢移除）。
5. 開一個 PR → CI 五 job 觸發；merge 到 main → Pages URL 回 200。
6. 執行 §3.14 checkpoint（README 進度表勾 M0、`milestone.json.current` 改 `"M1"`）。

### 3.4 M1 — core 狀態機＋曆法 tick＋Command 佇列＋最小 HUD

**目標**：確定性狀態機骨架成形：曆法推進、Command 管道、事件匯流排、13 步 tick 骨架、
存於記憶體的 tiny 測試劇本可連跑 10 年無例外；瀏覽器內有最小標題畫面與 HUD（日期＋速度控制）。

**開工前必讀**：`02`（全文）、`03`（全文）、`01` §3.4–§3.5／§3.9、`12` §3.1（tokens）、`17` §3.3–§3.5。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M1-1 | branded ID 型別＋enum 全表 | 02 §7（ids/enums） | `src/core/state/ids.ts`、`enums.ts` | — | S | 02 §7 對應驗收 |
| M1-2 | `GameState` 全部 interface（欄位註解含單位） | 02 §4 | `src/core/state/gameState.ts` | M1-1 | L | strict 無 any、無 optional 欄位 |
| M1-3 | Command／GameEvent discriminated union | 02 §4.18/§4.19 | `src/core/commands/types.ts`、`state/events.ts` | M1-2 | M | `CommandType` 可窮舉 |
| M1-4 | `rng.ts`：mulberry32 五流 | 03-T2 | `src/core/rng.ts` | — | S | 固定種子前 1000 值與 fixture 一致 |
| M1-5 | 曆法與 time 系統 | 03-T1 | `src/core/systems/time.ts` | M1-2 | S | 跨年／季界／`absoluteDay` 測試 |
| M1-6 | Command 佇列骨架（驗證器/apply 註冊表） | 03-T3 | `src/core/commands/*` | M1-3 | M | 非法指令不改 state＋reasonKey |
| M1-7 | `advanceDay` 13 步骨架（空殼系統佔位） | 03-T4 | `src/core/systems/index.ts` | M1-5, M1-6 | M | 空劇本 3600 tick 無例外；步序鎖定 |
| M1-8 | GameEvent 匯流排與 reports 修剪 | 03-T5 | `src/core/systems/reports.ts` | M1-7 | M | severity 表逐列測試 |
| M1-9 | `DerivedCache`（tick 內 memo） | 03-T9、02 §7 | `src/core/state/derivedCache.ts` | M1-7 | M | 髒標記／跨 tick 不殘留 |
| M1-10 | 基礎 selector（曆法/資源/反向索引） | 02 §5.1 | `src/core/state/selectors.ts` | M1-9 | S | 02 §7 selector 驗收（隨系統擴充） |
| M1-11 | `validateState()` 不變量 INV-01..25 | 02 §7 | `src/core/state/invariants.ts` | M1-2 | M | 25 條各一違規 fixture 被偵測 |
| M1-12 | canonical 序列化／`stateHash`／`nextId` | 02 §7 | `src/core/state/serialize.ts` | M1-2 | S | key 順序打亂 hash 不變 |
| M1-13 | tiny 測試劇本（TS 常數，2 勢力 3 城 6 郡；§8-D4） | 本文件 §8-D4、17 §3.3.1 精神 | `tests/fixtures/tiny.ts` | M1-2 | S | builder 可建局、`validateState` 零違規 |
| M1-14 | builder 骨架（state 初始化；資料側補值留 M2） | 02 §7（builder） | `src/core/state/builder.ts` | M1-11, M1-13 | M | tiny 建局後 `reports=[]`、`nextSerials` 全 1 |
| M1-15 | Zustand store 與橋接 | 01-A6 | `src/app/store.ts`、`bridge.ts` | M1-6 | M | 01-A6 驗收全文 |
| M1-16 | rAF 遊戲迴圈驅動（速度檔位、積欠上限 4） | 01-A7、03-T7 | `src/app/gameLoop.ts` | M1-15 | M | 01-A7 假時鐘驗收 |
| M1-17 | 失焦自動暫停 | 01-A8 | `src/app/gameLoop.ts` | M1-16 | S | 01-A8 e2e 驗收 |
| M1-18 | 錯誤處理與致命錯誤畫面 | 01-A9 | `src/app/errors.ts`、`src/ui/components/ErrorBoundary.tsx` | M1-15 | S | 01-A9 驗收 |
| M1-19 | design tokens＋CSS 變數注入 | 12-T1 | `src/ui/styles/tokens.ts`、`global.css` | — | M | 12-T1 驗收（80 勢力色、對比驗算） |
| M1-20 | 最小標題畫面＋最小 HUD（日期、金錢佔位、SpeedControl 簡版；`data-testid` 依 17 §6.2） | 11 §3.2/§3.3 縮減、12-T7 部分 | `src/ui/screens/TitleScreen.tsx`、`MainScreen.tsx` | M1-16, M1-19 | M | 頁面含「天下布武」；HUD 日期隨 tick 前進 |
| M1-21 | determinism 套件 DT1–DT4 | 17-T5 | `tests/determinism.spec.ts` | M1-14 | M | 17-T5 驗收：植入 `Math.random` 時 DT3 紅燈 |
| M1-22 | 除錯面板＋debug Command（§8-D3 自 M0 調入） | 01-A11、03-T11 | `src/app/debug.ts`、`src/ui/screens/DebugPanel.tsx` | M1-20 | M | 01-A11／03-T11 驗收：跳轉 360 日與逐日 hash 一致 |
| M1-23 | perfMonitor 打點 | 01-A12 | `src/app/perfMonitor.ts` | M1-22 | S | 01-A12 驗收 |
| M1-24 | AI 排程器骨架（評定空殼、攤平游標） | 03-T10 | `src/core/systems/ai/scheduler.ts` | M1-7 | S | 40 家 10 tick 各評定恰一次 |
| M1-25 | 月結整合測試（stub 系統） | 03-T6 | `tests/core/monthly.spec.ts` | M1-7 | M | 兩個月事件序列 golden 紀錄比對 |
| M1-26 | 合戰子迴圈契約（假解算器） | 03-T8 | `src/core/systems/battle.ts`（stub） | M1-7 | S | 寫回原子性、重放 bit-exact |
| M1-27 | Playwright P1（載入標題） | 17 §3.8-P1 | `e2e/smoke.spec.ts` | M1-20 | S | P1 綠燈、無 console error |

**M1 DoD**：
1. `npm test` 全綠（DT1–DT4 阻斷生效）；`npm run test:core` 含 time／rng／command／invariants 案例。
2. `npm run e2e` → P1 綠。
3. `npm run dev` → 標題→（暫以 debug 進入）主畫面，×1/×2/×5 檔位下 HUD 日期推進；空白鍵暫停。
4. `?debug=1` 面板「+30日」快進正常；`debug.addGold` 後 HUD 金錢 +10,000貫。
5. 17 §3.11.2 M1 欄全部 ✓ 在 CI 阻斷。執行 §3.14 checkpoint。

### 3.5 M2 — 資料 schema＋驗證工具＋東海/近畿子集＋Pixi 地圖

**目標**：資料生產線（zod schema、validate、stats）建成；**先做 B1 東海＋B2 近畿兩批
（合計 34 城、94 郡、約 185 名武將、535 萬石）讓遊戲以子集地圖可玩**；
全國其餘 7 批延至 M8（14 §7 批次計畫）。Pixi 地圖渲染、鏡頭、勢力色、新局流程最小版完成。

**開工前必讀**：`14`（全文，特別是 §3.2/§3.5/§5）、`04` §3.1–§3.5／§5.1–§5.2、`12` §3.3、`11` §3.2。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M2-1 | zod schemas 全套 | 14-T1 | `src/data/schemas/*` | — | M | 14-T1 驗收：範例片段通過、非法樣本被拒 |
| M2-2 | `tools/validate.ts` 完整版（V1–V15＋`--regions`） | 14-T2 | `tools/validate.ts` | M2-1 | L | 每條檢查各一違規 fixture 被偵測 |
| M2-3 | `tools/stats.ts` 統計報表 | 14-T3 | `tools/stats.ts` | M2-2 | S | 織田 31 萬石／今川 67 萬石校準輸出 |
| M2-4 | 投影與 outline schema | 04-T1 | `src/data/map/projection.ts` | — | S | 錨點 6 點誤差 ≤1 world unit |
| M2-5 | `japan-outline.json` 製作 | 04-T2 | `src/data/map/japan-outline.json` | M2-4 | M | 04-T2 自動檢查全過 |
| M2-6 | roads schema＋`MapGraph` 建構 | 04-T3 | `src/core/state/mapGraph.ts` | M2-1 | M | 連通性違規報錯並指出邊 id |
| M2-7 | 尋路 `computePath`（§8-D2 自 M4 調入） | 04-T4 | `src/core/systems/pathfinding.ts` | M2-6 | M | fixture 圖路徑與 totalDays bit 相同 |
| M2-8 | builder 資料側：補值規則＋浪人生成＋`regions` 白名單載入（§8-D5） | 14-T4、本文件 §8-D5 | `src/core/state/builder.ts`、`src/data/scenarios/s1560/index.ts` | M2-1, M1-14 | M | 子集建局 `validateState` 零違規；同 seed 浪人相同 |
| M2-9 | B1 東海批次資料 | 14 §3.5、14 §7-B1 | `src/data/scenarios/s1560/*.json`、`officers/tokai.json` | M2-2 | L | 14 §7 每批驗收流程（validate→stats ±10%→人工抽查表） |
| M2-10 | B2 近畿批次資料 | 14 §3.6、14 §7-B2 | 同上＋`officers/kinki.json` | M2-9 | L | 同上；清洲→京都 ETA 5–9 日抽測 |
| M2-11 | mini fixture（測試劇本 zod 版） | 17-T4 | `tests/fixtures/mini/*` | M2-1 | S | `buildMiniState()` 推進 30 日無錯 |
| M2-12 | 資料驗證整合進 CI | 17-T8 | `tests/data/validate.spec.ts` | M2-2 | S | 刪一名武將 → CI 紅燈含檔名與 path |
| M2-13 | MapCanvasHost 生命週期＋MapRenderer 骨架（8 圖層） | 01-A10、04-T8 | `src/ui/map/*` | M2-5, M2-6 | L | StrictMode 重掛無洩漏；子集 60fps |
| M2-14 | TerritoryGrid 勢力色與界線 | 04-T9 | `src/ui/map/territoryGrid.ts` | M2-13 | M | 1024 網格 <200ms；翻轉次幀更新 |
| M2-15 | 鏡頭（縮放錨點/夾限/慣性/focusOn） | 04-T10 | `src/ui/map/camera.ts` | M2-13 | M | 縮放不漂移（誤差 <0.5） |
| M2-16 | sceneParts：CastleNode/DistrictNode/SelectionRing | 12-T10 部分 | `src/ui/map/sceneParts/*` | M2-13 | M | 12-T10 繪製參數逐項相符 |
| M2-17 | 地圖互動（idle 模式、tooltip、`useMapEvents`） | 04-T12 部分 | `src/ui/map/interaction.ts` | M2-16 | M | hover 城出 tooltip；點城開面板事件發出 |
| M2-18 | 迷你地圖＋勢力圖模式 | 04-T13、12-T9 | `src/ui/components/MiniMap.tsx` | M2-14 | M | 點擊跳轉；Tab 切換勢力圖 |
| M2-19 | 新遊戲流程最小版（劇本→大名→開局） | 11-T2 縮減、17 §3.8-P2 | `src/ui/screens/ScenarioSelect.tsx`、`DaimyoSelect.tsx` | M2-8, M1-20 | M | 選織田進入主畫面、HUD 顯示 1560年 |
| M2-20 | Playwright P2 | 17 §3.8-P2 | `e2e/smoke.spec.ts` | M2-19 | S | P2 綠燈 |

**M2 DoD**：
1. `npm run validate:data` → `--regions=tokai,kinki` 模式全綠；`tsx tools/stats.ts` 兩地方配額偏差 ≤10%。
2. `npm run e2e` → P1、P2 綠。
3. `npm run dev` → 新局選織田：地圖顯示東海＋近畿、勢力色正確、縮放平移 60fps（devtools 效能監視器目測）。
4. `npm test` 全綠（含 mini fixture、validate.spec）。17 §3.11.2 M2 欄全 ✓。執行 §3.14 checkpoint。

### 3.6 M3 — 內政（經濟／郡開發／知行／施設／政策／徵兵）

**目標**：內政循環完整可玩：收入→開發→徵兵→輸送→政策；知行任命與領主自動開發運轉；
身分／俸祿／忠誠月結（06 前半）支撐知行制。城面板、郡面板、武將一覽可操作。

**開工前必讀**：`05`（全文）、`06` §3.1–§3.4／§5.7–§5.10、`09` §領主AI（開發方針節）、
`11` §3.3–§3.5／§3.7、`12` §3.2、`15`（若已存在；否則依 §3.15-R5）。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M3-1 | 06 型別＋`TRAITS` 37 筆＋`traitModifier` | 06-T1、06-T2、14 §8-D2 | `src/core/state/officerTypes.ts`、`src/core/traits.ts` | — | M | 37 筆（30＋7 戰法解鎖）；mult 疊乘測試 |
| M3-2 | 功績與能力成長 | 06-T3 | `src/core/systems/officers.ts` | M3-1 | S | 06-T3 驗收 |
| M3-3 | 身分與俸祿月結 | 06-T4 | 同上 | M3-2 | M | 跳階拒絕；知行者不支薪 |
| M3-4 | 忠誠月結（目標值＋漂移） | 06-T5 | 同上 | M3-3 | M | target 逐項核對；漂移 ±2 封頂 |
| M3-5 | 05 資料結構＋`FacilityDef` 16 筆＋`PolicyDef` 12 筆 | 05-T5-1 | `src/core/facilities.ts`、`policies.ts` | — | M | validate 對子集資料通過 |
| M3-6 | 經濟 tick（消耗/收入/秋收/欠俸） | 05-T5-2 | `src/core/systems/economy.ts` | M3-5, M3-3 | L | 360 tick 軌跡與手算一致；`foodFrac` 零漂移 |
| M3-7 | 郡開發（日步進＋報酬遞減＋人口成長） | 05-T5-3 | `src/core/systems/development.ts` | M3-5 | M | 05-T5-3 驗收（誤差 <1%） |
| M3-8 | 知行任命/罷免＋自動解除 | 05-T5-4 | `src/core/commands/fief.ts` | M3-4, M3-7 | M | 五條驗證；罷免忠誠差值正確 |
| M3-9 | 領主 AI 開發方針子集（每月 1 日選方針；§8-D8） | 09 §8-D11、05 §8-D3 | `src/core/systems/ai/stewardAi.ts` | M3-8 | S | 受封郡 12 個月自動成長符合 05-T5-3 數值 |
| M3-10 | 城下施設（slot/佇列/前置/拆除） | 05-T5-5 | `src/core/systems/facilities.ts` | M3-6 | M | 05-T5-5 驗收 |
| M3-11 | 徵兵（回復/上限/方針/超編） | 05-T5-6 | `src/core/systems/conscription.ts` | M3-6 | M | 中方針 +150 兵/月、上限 1750 |
| M3-12 | 輸送（尋路整合/被劫/撤回） | 05-T5-7 | `src/core/systems/transport.ts` | M2-7, M3-6 | M | 敵軍駐節點 100% 被劫；傳馬制 2/3 日數 |
| M3-13 | 政策（解鎖/slot/互斥/冷卻） | 05-T5-8 | `src/core/systems/policy.ts` | M3-6 | M | 威信 300 → slot 2；互斥拒絕 |
| M3-14 | 治安與一揆（軍事鎮壓接線留 M4-11） | 05-T5-9 | `src/core/systems/uprising.ts` | M3-7 | M | 固定種子 100 月爆發率 40%±5% |
| M3-15 | 收支預覽 selector＋05 字串表 | 05-T5-10 | `src/core/state/selectors.ts`、`src/i18n/zh-TW.ts` | M3-6 | S | 預覽＝次月實際；掃描通過 |
| M3-16 | UI store 完整導航機（panel 堆疊/modal 佇列/ESC） | 11-T1 | `src/ui/hooks/uiStore.ts` | — | M | 11-T1 驗收 |
| M3-17 | 通用元件第一批（IconButton/Badge/ProgressBar/StatBar/Panel/TabView/MenuList） | 12-T2、12-T3 | `src/ui/components/*` | M1-19 | M | 12-T2/T3 驗收 |
| M3-18 | 通用元件第二批（Dialog/Tooltip/DataTable/OfficerCard/ResourceBar/NumberSlider） | 12-T4、12-T5、12-T6、12-T7 | 同上 | M3-17 | L | 12-T4–T7 驗收（650 列 60fps） |
| M3-19 | 城面板四頁 | 11-T4 | `src/ui/screens/panels/CastlePanel.tsx` | M3-16, M3-18 | L | 四頁籤；施設下單發出正確 Command |
| M3-20 | 郡面板 | 11-T5 | `.../DistrictPanel.tsx` | M3-19 | M | 領主任命候選排序正確 |
| M3-21 | 武將一覽＋詳細卡 | 11-T7 | `src/ui/screens/OfficerList.tsx` | M3-18 | M | 排序決定性；忠誠 <30 警示 |
| M3-22 | ReportStack 通知堆疊 | 12-T8 | `src/ui/components/ReportStack.tsx` | M3-17 | S | 12-T8 驗收 |
| M3-23 | UI 元件測試 U1–U17（已交付元件） | 17-T9 | `tests/ui/*` | M3-18 | M | `npm run test:ui` 綠 |
| M3-24 | Playwright P3（推進 3 個月） | 17 §3.8-P3 | `e2e/smoke.spec.ts` | M3-6 | S | P3 綠燈 |

**M3 DoD**：
1. `npm run test:core` → economy/development 案例（17 §3.4.1/§3.4.2）全綠，期望值由 BAL 推導。
2. 手動：新局織田 ×5 跑 24 個月——金錢/兵糧無 NaN；9/1 秋收報告出現；知行一名武將後該郡自動開發。
3. `npm run e2e` → P1–P3 綠。17 §3.11.2 M3 欄全 ✓。執行 §3.14 checkpoint。

### 3.7 M4 — 軍事一：出陣／行軍／制壓／野戰自動解算／攻城

**目標**：戰爭迴圈可玩（合戰戰術戰場除外）：編成出陣→沿街道行軍→制壓敵郡→野戰自動解算→
圍城／強攻→落城翻轉。golden-mini 與 command log 重放自本里程碑起阻斷。

**開工前必讀**：`07` §3.1–§3.5／§3.10–§3.11（出陣/野戰/兵站/攻城）、`04` §3.6–§3.8／§5.3–§5.5、
`17` §3.5／§3.10、`11` §3.6。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M4-1 | 部隊與出陣 Command | 07-T1 | `src/core/commands/march.ts` | M2-7 | M | 越界拒絕；同 tick 三筆依序結算 |
| M4-2 | 行軍系統（進度累加/跨邊/重驗） | 04-T5 | `src/core/systems/military.ts` | M4-1 | M | 04-T5 驗收 |
| M4-3 | 兵站（糧耗/補給/自動歸還） | 07-T2 | 同上 | M4-2 | M | 第 61 日起士氣 −8/日 |
| M4-4 | 制壓系統 | 04-T6 | 同上 | M4-2 | M | daysRequired 公式；勝保留敗歸零 |
| M4-5 | 遭遇判定（同節點/相向/追擊） | 04-T7 | 同上 | M4-2 | S | 三情境各觸發恰一次 |
| M4-6 | 野戰自動解算（地利/挾擊/特性/士氣） | 07-T3 | `src/core/systems/fieldCombat.ts` | M4-5, M3-1 | L | 等力損耗相等；挾擊 ×1.3 |
| M4-7 | 潰走與追擊 | 07-T4 | 同上 | M4-6 | M | 士氣 ≤30 轉 routed；數量守恆 |
| M4-8 | 野戰威風（小） | 07-T5 | `src/core/systems/awe.ts` | M4-6 | S | 殲滅 65% → 1 跳翻轉 |
| M4-9 | 攻城（強攻/包圍/糧盡/落城） | 07-T11 | `src/core/systems/siege.ts` | M4-6 | L | 支城 12–20 日落城；包圍不減耐久 |
| M4-10 | 援軍解圍（interrupted 流程） | 07-T12 前半 | 同上 | M4-9 | S | 援軍抵達日城士氣止跌 |
| M4-11 | 一揆鎮壓軍事接線（§8-D12） | 05-T5-9 | `src/core/systems/uprising.ts` | M4-6 | S | 部隊抵郡後一揆解除、治安回升 |
| M4-12 | sceneParts：ArmyChip/PathPreview/SiegeMarker | 12-T10 剩餘、12-T11 部分 | `src/ui/map/sceneParts/*` | M4-2 | M | 5+ 部隊收合 +N；路徑日刻度 |
| M4-13 | LOD 與視錐剔除 | 04-T11 | `src/ui/map/lod.ts` | M4-12 | M | 500 節點/120 部隊 ≥55fps |
| M4-14 | 出陣編成 modal＋orderMarch 地圖直選 | 11-T6、04-T12 剩餘 | `src/ui/screens/MarchModal.tsx` | M4-1, M3-18 | M | confirm 前零副作用；ETA 與尋路一致 |
| M4-15 | 攻城 overlay（強攻/包圍切換） | 11-T10 攻城部分 | `src/ui/screens/SiegeOverlay.tsx` | M4-9 | M | 三條進度與 core 同步 |
| M4-16 | golden-mini 快照 | 17-T7 前半 | `tests/golden/*` | M4-9, M2-11 | M | 連跑兩次一致；改 BAL 紅燈 |
| M4-17 | command log 匯出/重放＋`cases/` 目錄 | 17-T12 | `tests/replay/*` | M4-16 | M | 10 條指令重放 match=true |
| M4-18 | perf bench（僅報告） | 17-T11 bench | `tests/perf/advance-day.bench.ts` | M4-16 | S | 輸出 mean/p99 |

**M4 DoD**：
1. 手動流程：織田對齋藤出陣→制壓一郡→野戰勝→圍稻葉山→落城→城與轄郡翻轉、報告正確。
2. `npm test` → golden-mini、replay、military/siege 案例全綠。
3. `npm run bench` 有輸出（不阻斷）。17 §3.11.2 M4 欄全 ✓。執行 §3.14 checkpoint。

### 3.8 M5 — 合戰戰術戰場＋戰法＋威風

**目標**：兵力達門檻的野戰可升級為合戰 modal：戰場生成、部隊操作、戰法、采配、委任 AI、
勝敗判級與威風（小/中/大）擴散。策略層在 modal 期間凍結、結果原子寫回（03 契約）。

**開工前必讀**：`07` §3.6–§3.9（合戰/戰法/威風）、`03` §3.1（凍結）、`11` §3.11、`12` §3.3（特效）。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M5-1 | 戰場生成（決定論、9–13 陣、連通） | 07-T6 | `src/core/systems/battle.ts` | M4-6 | M | 1000 次生成皆合規 |
| M5-2 | battle tick 核心（移動/交戰/傷害/佔領/采配） | 07-T7 | 同上 | M5-1 | L | 固定 seed 逐 tick hash 一致 |
| M5-3 | 戰法 12 種＋冷卻＋解鎖特性 | 07-T8 | `src/core/tactics.ts` | M5-2, M3-1 | L | 每種戰法數值單測 |
| M5-4 | 合戰委任 AI 與三種結束條件 | 07-T9 | `src/core/systems/battleAi.ts` | M5-3 | M | 全委任於 `BAL.kassenMaxTicks` 內結束 |
| M5-5 | 合戰威風（判級/翻轉/威信） | 07-T10 | `src/core/systems/awe.ts` | M5-4, M4-8 | M | 速攻 35 tick → 威風大、3 跳翻轉 |
| M5-6 | 合戰畫面（部隊操作/戰法列/委任開關） | 11-T10 合戰部分 | `src/ui/screens/BattleScreen.tsx` | M5-2, M3-18 | L | 采配不足戰法灰化；委任即時生效 |
| M5-7 | 戰場特效（AweShockwave/BattleSpark/粒子池） | 12-T11 剩餘 | `src/ui/map/sceneParts/*` | M5-5 | M | 威風三等級時間軸；粒子池 ≤128 |
| M5-8 | `debug-battle-01` 內建佈局＋P5 | 17 §3.8-P5、§4.5 | `src/core/debugBattle.ts`、`e2e/smoke.spec.ts` | M5-6 | S | P5 綠燈 |
| M5-9 | golden 擴充：含合戰場景的重放 | 03-T8、17 §3.5 | `tests/golden/*` | M5-5 | S | 含合戰紀錄重放 bit-exact |

**M5 DoD**：
1. 手動：發動一場合戰→放戰法→陷本陣→威風大動畫→鄰接敵郡翻轉。
2. `npm run e2e` → P1–P3、P5 綠。`npm test` 含 battle 案例（17 §3.4.4）全綠。
3. 17 §3.11.2 M5 欄全 ✓。執行 §3.14 checkpoint。

### 3.9 M6 — 外交／朝廷幕府／調略／家臣系統完整化

**目標**：08 全系統（信用/協定/朝廷/幕府/調略）與 06 後半（出奔/引拔/登用/捕虜/壽命/繼承/
元服/具申結算）落地；外交畫面、具申收件匣、家臣團 UI 完成。

**開工前必讀**：`08`（全文）、`06` §3.5–§3.8、`07` §3.11（內應接點）、`11` §3.8–§3.10。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M6-1 | 外交資料結構與初始化（DiplomacyRow/CourtState） | 08-T1 | `src/core/systems/diplomacy.ts` | — | M | 鏡像不變量成立 |
| M6-2 | 外交工作與信用 | 08-T2 | 同上 | M6-1 | M | 10 個月信用恰 60（決定論） |
| M6-3 | 感情引擎（月變動/漂移/威風接線） | 08-T3 | 同上 | M6-2 | M | 12 個月手算一致 |
| M6-4 | 協定與提案（同盟/婚姻/停戰/從屬/破棄） | 08-T4 | `src/core/commands/pacts.ts` | M6-3 | L | 破棄懲罰；婚姻 36 月硬鎖 |
| M6-5 | 朝廷（獻金/官位/斡旋） | 08-T5 | `src/core/systems/court.ts` | M6-2 | M | 斡旋成敗序列決定論 |
| M6-6 | 幕府（役職/擁立/滅亡） | 08-T6 | 同上 | M6-5 | M | `collapseShogunate` 全套失效 |
| M6-7 | 調略三種＋內應發動 | 08-T7、07-T12 後半 | `src/core/systems/plots.ts` | M6-3 | L | 1000 次統計 ±3%；內應發動後城士氣降至 `BAL.plotBetrayalMoraleFloor`(=5)、城主忠誠歸 0（08 §5.5.3） |
| M6-8 | `clanPower`/`evaluateProposal` 純函式（AI 介面） | 08-T8 | `src/core/systems/diplomacyEval.ts` | M6-4 | S | 同 state 重複呼叫結果相同 |
| M6-9 | 出奔與引拔受理 | 06-T6 | `src/core/systems/officers.ts` | M3-4, M6-7 | M | 一門/忠臣/當主不出奔 |
| M6-10 | 登用與捕虜 | 06-T7 | 同上 | M6-9 | M | 冷卻拒絕；城陷釋放 |
| M6-11 | 壽命與繼承 | 06-T8 | 同上 | M3-3 | M | 繼承順位單測；無嗣滅亡入口 |
| M6-12 | 元服 | 06-T9 | 同上 | M6-11 | S | `debutYear` 1/1 登場 |
| M6-13 | 具申結算（生命週期） | 06-T10 | `src/core/systems/proposals.ts` | M3-4 | M | 採納執行內含 Command |
| M6-14 | 家臣 UI（家臣團/詳情/褒賞/捕虜/浪人登用） | 06-T11 | `src/ui/screens/*` | M6-10, M3-21 | L | smoke：完成一次小額賞賜 |
| M6-15 | 外交畫面＋朝廷幕府頁＋調略精靈＋來使 modal | 08-T9、11-T8 外交/政策部分 | `src/ui/screens/DiplomacyScreen.tsx` 等 | M6-4, M6-7 | L | disabled 有原因 tooltip；來使自動暫停 |
| M6-16 | 具申收件匣 | 11-T9 | `src/ui/screens/ProposalInbox.tsx` | M6-13 | M | 卡片流；處理完接續月初佇列 |
| M6-17 | 外交 5 年 golden 腳本 | 08-T10 | `tests/golden/*` | M6-7 | S | 狀態雜湊穩定 |
| M6-18 | officers 24 個月整合測試 | 06-T12 | `tests/core/officers-integration.spec.ts` | M6-13 | S | 無 NaN；欠俸路徑觸發 |

**M6 DoD**：
1. `npm test` → diplomacy/officers 案例（17 §3.4.6/§3.4.7）與兩條 golden 全綠。
2. 手動：與武田締結同盟→請求援軍；對今川武將引拔成功一次；一件具申完整走完採納流程。
3. 17 §3.11.2 M6 欄全 ✓。執行 §3.14 checkpoint。

### 3.10 M7 — AI：大名 AI／委任 AI／難易度

**目標**：AI 勢力完整運轉（評定四階段、攻略計畫、反應層、外交層）；領主/城主/軍團委任 AI；
軍團系統（07-T13）；難易度三檔；`tools/simulate.ts` 無頭模擬工具建成（§8-D10）。

**開工前必讀**：`09`（全文）、`07` §3.12（軍團）、`08` §5（接受度）、`17` §3.4.8。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M7-1 | AI 型別＋persona 載入（42 筆含 default） | 09-T1、14-T6 部分 | `src/core/systems/ai/types.ts`、`src/data/scenarios/s1560/personas.json` | — | S | 五軸 0..100 zod 驗證 |
| M7-2 | 威脅評估快取 | 09-T2 | `src/core/systems/ai/threat.ts` | M7-1 | M | threat 精確斷言；事件失效 |
| M7-3 | 攻略計畫狀態機 | 09-T3 | `src/core/systems/ai/attackPlan.ts` | M7-2 | L | 全轉移與 abort 路徑單測 |
| M7-4 | 評定排程器完整版（攤平＋削峰） | 09-T4 | `src/core/systems/ai/scheduler.ts` | M1-24, M7-3 | M | 每 tick ≤4 階段 |
| M7-5 | 資源決策 Phase C | 09-T5 | `src/core/systems/ai/council.ts` | M7-4 | M | 金錢不低於儲備 |
| M7-6 | 外交層 Phase D | 09-T6 | 同上 | M6-8, M7-5 | M | 09-T6 驗收 |
| M7-7 | 反應層（攔截/解圍/合戰/來使） | 09-T7 | `src/core/systems/ai/reactive.ts` | M7-4 | M | 入侵當日產生 intent |
| M7-8 | 委任 AI 完整版（steward/castle/corps＋護欄） | 09-T8 | `src/core/systems/ai/delegation.ts` | M3-9, M7-5 | L | 護欄驗收全文 |
| M7-9 | 具申生成（四類候選＋Top-K） | 09-T9 | `src/core/systems/ai/proposalGen.ts` | M6-13, M7-5 | M | payload 全通過 Command 驗證器 |
| M7-10 | 軍團系統（建立/劃撥/收支上繳） | 07-T13 | `src/core/systems/corps.ts` | M7-8 | M | 20%/80% 分帳；解散併入 |
| M7-11 | 軍團畫面 | 11-T8 軍團部分 | `src/ui/screens/CorpsScreen.tsx` | M7-10 | M | 11-T8 驗收 |
| M7-12 | 難易度三檔接線 | 09-T10 | `src/core/systems/ai/difficulty.ts` | M7-4 | S | 玩家收入不受影響 |
| M7-13 | AiIntent 環形緩衝＋除錯面板 | 09-T11 | `src/ui/screens/DebugPanel.tsx` | M7-4 | S | 不進存檔序列化 |
| M7-14 | AI 合法性測試 A1（全國 A2 於 M8 轉阻斷） | 17 §3.4.8 | `tests/core/ai-legality.spec.ts` | M7-7 | S | A1 綠燈阻斷 |
| M7-15 | AI golden（互毆 360 tick） | 09-T12 | `tests/golden/*` | M7-7 | S | 重放 hash 相等 |
| M7-16 | `tools/simulate.ts` 無頭模擬（§4.3/§5.3） | 15 §平衡驗證法（缺席時依本文件 §5.3） | `tools/simulate.ts` | M7-15 | M | `npm run simulate -- --seeds=5 --years=10` 輸出 §4.3 全欄位 |

**M7 DoD**：
1. 手動：新局後放置不動 30 分鐘（×5）——AI 勢力間發生戰爭、有城易主、無例外拋出。
2. `npm test` → A1、AI golden 綠。`tsx tools/simulate.ts --seeds=5 --years=10` 輸出統計 JSON。
3. 17 §3.11.2 M7 欄全 ✓。執行 §3.14 checkpoint。

### 3.11 M8 — 事件／大命／勝敗／存讀檔／畫面補完／全國資料

**目標**：v1.0 功能面收齊：事件引擎與 15 筆史實事件、大命、勝敗與結局、存讀檔與設定、
標題完整流程、其餘全部畫面；**全國資料 B3–B9 七批補完**（14 §7），golden-s1560 開始觀測。

**開工前必讀**：`10`（全文）、`16`（全文）、`14` §3.6／§7（B3–B9）、`11` §3.12–§3.16、`12` §3.4–§3.6、
`13`（若已存在；否則依 §3.15-R5）。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M8-1 | 條件 DSL 與求值器 | 10-T1 | `src/core/systems/events.ts` | — | M | 每 kind true/false fixture |
| M8-2 | EffectOp 套用器 | 10-T2 | 同上 | M8-1 | M | 套用後零違規 |
| M8-3 | 事件引擎主流程 | 10-T3 | 同上 | M8-2 | M | 觸發序 golden 鎖定 |
| M8-4 | hook 訊號管線 | 10-T4 | 同上 | M8-3 | S | 攻下稻葉山次日觸發美濃攻略 |
| M8-5 | `CmdResolveEventChoice`＋解凍判定 | 10-T5 | `src/core/commands/events.ts` | M8-3 | S | 存讀檔後選擇一致 |
| M8-6 | 史實事件 15 筆資料 | 10-T6、14-T5 | `src/data/scenarios/s1560/events.json` | M8-3 | L | 20 種子中位數觸發 ≥8 件 |
| M8-7 | 汎用事件 6 筆＋掛鉤 | 10-T7 | 同上 | M8-6 | M | 豐凶互斥；南蠻旗標接線 |
| M8-8 | 大命系統（型錄 8 筆＋公式接線） | 10-T8 | `src/core/systems/taimei.ts` | M8-2 | L | 每種大命效果測試 |
| M8-9 | 勝敗與滅亡 | 10-T9 | `src/core/systems/victory.ts` | M6-11 | M | 四種結局劇本化測試 |
| M8-10 | 結局統計與 VM | 10-T10 | `src/core/state/selectors.ts` | M8-9 | S | 統計與 golden 一致 |
| M8-11 | 事件 modal／大命面板／結局畫面 | 10-T11、11-T11 部分 | `src/ui/screens/*` | M8-5, M8-8 | M | 桶狹間 smoke 流程 |
| M8-12 | 存檔編解碼＋遷移框架 | 16-T1、16-T2 | `src/core/save/*` | — | M | 往返 deep-equal；篡改回 corrupt |
| M8-13 | 儲存 adapter 與 14 槽位 | 16-T3 | `src/core/save/storage.ts` | M8-12 | M | 記憶體 adapter 全流程 |
| M8-14 | 自動存檔（季首輪替）＋快速存讀 | 16-T4 | `src/app/autosave.ts` | M8-13 | S | auto:1→2→3→1；配額降級 |
| M8-15 | 匯出／匯入 | 16-T5 | `src/core/save/exportImport.ts` | M8-13 | S | 16-T5 驗收 |
| M8-16 | 設定系統（localStorage＋即時套用） | 16-T6 | `src/app/settingsStore.ts` | — | M | 垃圾輸入回合法預設 |
| M8-17 | 標題畫面完整流程（四主鈕＋新遊戲精靈） | 16-T7、11-T2 | `src/ui/screens/TitleScreen.tsx` | M8-13, M8-16 | M | 無存檔「繼續」停用；種子欄驗證 |
| M8-18 | dirty 追蹤＋beforeunload | 16-T8 | `src/app/dirtyTracker.ts` | M8-13 | S | 16-T8 smoke 驗收 |
| M8-19 | golden save fixture 凍結 | 16-T9 | `tests/fixtures/saves/save-v1.tenkafubu.json` | M8-12 | S | decode 後續跑 30 tick |
| M8-20 | 系統選單／存讀檔／設定 UI | 11-T12 | `src/ui/screens/SystemMenu.tsx` | M8-14 | M | 槽位覆蓋確認；F5/F9 |
| M8-21 | 月初摘要／報告中心 | 11-T11 剩餘 | `src/ui/screens/ReportCenter.tsx` | M3-22 | M | 篩選與「前往」跳轉 |
| M8-22 | 家紋渲染器 | 11-T14 | `src/ui/components/KamonIcon.tsx` | — | S | 12 種 shape 決定性 SVG |
| M8-23 | 快捷鍵全表＋uiScale 縮放 | 11-T15 | `src/app/hotkeys.ts` | M8-20 | S | 1280×720 無溢版 |
| M8-24 | reduce-motion＋ComponentGallery＋無障礙驗收 | 12-T12、12-T13、12-T14 | `src/ui/**` | M3-18 | M | axe-core 無 critical |
| M8-25 | 型錄檔（traits/tactics/policies/personas）＋index 動態載入 | 14-T6、14-T7 | `src/data/scenarios/s1560/index.ts` | M2-1 | M | V14 雙向相等；主 bundle 不含劇本 JSON |
| M8-26 | 全國資料 B3–B9（關東→甲信越→北陸→中國→四國→九州→東北；每批獨立 PR） | 14 §7 批次表＋人工抽查表 | `src/data/scenarios/s1560/*.json`、`officers/*.json` | M2-10, M8-25 | 7×L | 每批：`validate --regions` 全綠→stats ±10%→抽查表全勾；B9 跑全量 validate（無 `--regions`） |
| M8-27 | Playwright P4（存讀檔） | 17 §3.8-P4 | `e2e/smoke.spec.ts` | M8-20 | S | P4 綠燈 |
| M8-28 | golden-s1560（觀測，M9 轉阻斷） | 17-T7 後半 | `tests/golden/*` | M8-26 | S | 快照產出、CI 報告 |
| M8-29 | A2 全國 AI 合法性轉阻斷 | 17 §3.4.8 | `.github/workflows/ci.yml` | M8-26 | S | A2 綠燈阻斷 |

**M8 DoD**：
1. `npm run validate:data`（全量，無 `--regions`）全綠；`tsx tools/stats.ts` 全國配額全部 ±10% 內
   （121 城／343 郡／1,800 萬石／625 武將／41 家基準，14 §3.2）。
2. `npm run e2e` → P1–P5 全綠。
3. 手動：新局→桶狹間事件觸發→存檔→關閉分頁→重開→讀檔→日期與狀態一致；設定改 uiScale 即時生效。
4. `tsx tools/simulate.ts --seeds=20 --years=25` 完跑無例外（統計供 M9 用）。
5. 17 §3.11.2 M8 欄全 ✓。執行 §3.14 checkpoint。

### 3.12 M9 — 平衡調校／golden／效能／部署

**目標**：以 simulate 統計把平衡調到 00 §6 的設計目標帶；perf gate 與 golden-s1560 轉阻斷；
60fps 手動驗收；發版 v1.0 至 GitHub Pages。

**開工前必讀**：`15`（全文；缺席時依 §3.15-R5 先行彙整）、`17` §3.9／§3.11、`01` §3.8–§3.9。

| ID | 任務 | 規格依據 | 產出檔案 | 依賴 | 規模 | 驗收標準 |
|---|---|---|---|---|---|---|
| M9-1 | `balance.ts` 與 15 主表對齊（15 缺席時：將現值彙整撰寫為 `plan/15-balance.md` 主表；§8-D1） | 15、00 §11 | `src/core/balance.ts`、`plan/15-balance.md` | — | M | 全部 BAL 常數在主表有列、無孤兒常數（腳本比對） |
| M9-2 | simulate 平衡回歸（20 種子 × 25 年） | 15 §平衡驗證法、本文件 §5.3 | 調整 `balance.ts` | M9-1 | L | 統一年數中位數落 15–25 年；織田 25 年存活率 ≥60%；今川/武田/毛利/北條/島津 10 年存活率 ≥70% |
| M9-3 | 難易度平衡驗證（三檔對比模擬） | 09-T10、15 | 同上 | M9-2 | S | 上級下玩家勢力（AI 代打）勝率明顯下降且規則未變 |
| M9-4 | perf gate 轉阻斷＋效能優化 | 17 §3.9.1、01 §3.9 | `tests/perf/advance-day.gate.spec.ts` | — | L | `advanceDay` 全國全 AI 平均 <8ms（CI ×2 係數） |
| M9-5 | 60fps 手動驗收與渲染修正 | 17 §3.9.2 | `src/ui/map/*` | M9-4 | M | 檢查表七步全過（FPS ≥55） |
| M9-6 | golden-s1560 轉阻斷 | 17-T7 | `.github/workflows/ci.yml` | M9-2 | S | CI 綠燈阻斷 |
| M9-7 | core 覆蓋率 80/70 補洞 | 17 §3.11.2 | `tests/**` | — | M | 覆蓋率門檻轉阻斷後綠燈 |
| M9-8 | `RELEASE_CHECKLIST.md` | 17-T14 | `RELEASE_CHECKLIST.md` | M9-5 | S | 發版 PR 附已勾選清單 |
| M9-9 | nightly workflow（bench＋10 年延長 golden） | 17-T13 | `.github/workflows/nightly.yml` | M9-6 | S | 排程觸發成功一次 |
| M9-10 | README 完成（致敬聲明/操作說明/已知限制/進度表收尾） | 00 §1.2 | `README.md` | — | S | 聲明全文在列；簡體字掃描通過 |
| M9-11 | v1.0 tag 與 Pages 發版 | 01 §3.8.2 | git tag `v1.0.0` | M9-8 | S | 正式 URL 可玩完整一局 |

**M9 DoD**：
1. `npm run lint && npm run typecheck && npm run validate:data && npm test && npm run e2e` 全綠，
   17 §3.11.2 M9 欄（全部檢查項）✓。
2. `npm run simulate -- --seeds=20 --years=25` 統計落 M9-2 目標帶，結果 JSON 附於發版 PR。
3. `RELEASE_CHECKLIST.md` 全勾；Pages 上手動完整通關抽測一次（可用上級難度＋×5）。
4. 執行 §3.14 checkpoint；`milestone.json.current` 設 `"DONE"`。

### 3.13 commit／PR 切分粒度與訊息格式

**commit 訊息格式**（Conventional Commits 變體；subject 用繁體中文、識別符用英文）：

```
<type>(<scope>): <subject 繁中一句話> [<任務ID>]

<body：變更摘要、規格依據章節、驗收方式>（可省略）
```

- `type`：`feat`｜`fix`｜`refactor`｜`test`｜`data`（劇本資料批次）｜`balance`（僅動 BAL 值）｜
  `docs`（含回寫 plan §8）｜`chore`｜`perf`｜`ci`。
- `scope`：`core`｜`ui`｜`map`｜`data`｜`save`｜`ai`｜`tools`｜`i18n`｜`e2e`｜`ci`｜`scaffold`｜`plan`。
- 例：`feat(core): 郡開發日步進與報酬遞減 [M3-7]`、`data(data): 近畿批次 B2 資料 [M2-10]`、
  `balance(core): 依 simulate 統計下修 BAL.assaultGarrisonLossRate [M9-2]`。

**切分粒度**：

1. **一個任務 ID ＝ 一個 PR**（S 任務可 2–3 個合併為一個 PR，但不得跨系統檔案）。
2. L 任務在 PR 內拆多個 commit：型別→核心邏輯→測試→UI 接線，每個 commit 可獨立通過 typecheck。
3. golden 快照更新**必須獨立 commit**（`test(core): 更新 golden 快照 [M9-2]`），
   且 PR 說明列出變動的 checkpoint 欄位與原因（17 §3.5.1）。
4. 資料批次（M2-9/10、M8-26）每批一個 PR，PR 說明貼上 `stats.ts` 輸出與人工抽查表勾選結果。
5. 回寫 plan 文件 §8 的設計決策，與觸發它的程式變更放同一個 PR（`docs(plan)` commit）。
6. PR 標題 ＝ `[任務ID] 任務名`；PR 模板含三個必填核取方塊：
   「驗收標準逐條複核」「新增/更新測試」「golden 若變動已附說明」。

### 3.14 里程碑 checkpoint 程序（每個 Mx 結束時執行；步驟化見 §5.2）

1. **全測試**：`npm run lint && npm run typecheck && npm run validate:data && npm test && npm run e2e`
   全綠；M4 起加跑 `npm run bench` 並記錄 mean（貼進 checkpoint PR）。
2. **golden 快照規則**：
   - checkpoint 時 golden 必須是綠的；若本里程碑刻意改變了數值軌跡（新系統接入 tick、BAL 調整），
     以 `npm run golden:update` 重寫，於 checkpoint PR 列出各 checkpoint 欄位的變動摘要。
   - **禁止**在 golden 紅燈原因不明時更新快照——必須先以 `tests/replay` 與 debug 面板定位差異來源。
   - 新系統接入 13 步 tick 的當個里程碑，golden 快照**必然**重寫一次（新系統改變軌跡是預期行為）。
3. **進度回寫**：README 進度表勾選本里程碑（完成日期＋一句話摘要）；`milestone.json` 的
   `completed` 加入本里程碑、`current` 前進一格；CI 依 `milestone.json` 自動啟用下一欄新增的 ✓ 門檻。
4. **tag**：`git tag m<N>`（如 `m3`）推上 origin，作為回歸比較基準點。
5. **checkpoint PR**：標題 `checkpoint(M<N>)：<里程碑名>`，內容為 DoD 逐條核對結果。

### 3.15 風險清單與緩解

| # | 風險 | 影響 | 緩解（已排入排程） |
|---|---|---|---|
| R1 | **資料量**：600+ 武將、343 郡、121 城的手工資料出錯率高、量大拖期 | M8 爆量、品質失控 | 驗證器與統計工具**在 M2 先建**（M2-2/M2-3）；資料分 9 批各自過「validate→stats ±10%→人工抽查表」三關（14 §7）；每批獨立 PR 可回退；M2 只做 2 批即讓遊戲可玩，後 7 批與 M8 其他任務交錯進行 |
| R2 | **合戰複雜度**：戰術戰場是最大單體系統，估錯會卡住主線 | M5 逾期連鎖 | **先自動解算後戰術戰場**：M4 完成野戰＋攻城的自動解算即形成完整可玩迴圈；M5 若逾期，降級路徑＝合戰維持自動解算（發動門檻臨時視為不可達），主線不斷；合戰以 03-T8 契約隔離，接口在 M1 就凍結 |
| R3 | **效能**：全國 41 家 AI＋343 郡逐日 tick 可能超出 8ms 預算 | M9 才發現則重構代價大 | **攤平設計早入**：AI 排程器骨架 M1（M1-24）、評定四階段攤平 M7（M7-4）、DerivedCache M1（M1-9）；bench 自 M4 起每次 CI 報告趨勢（M4-18），偏差在當期修而非 M9 補救 |
| R4 | **平衡**：常數彼此耦合，靠手玩調不動 40 家勢力的宏觀走勢 | 成品不好玩 | `tools/simulate.ts` **在 M7 建好**（M7-16，非 M9）：M8 每合入一批資料就跑統計校準地方強弱；M9-2 以 20 種子×25 年的分布做最終回歸；單元測試由 BAL 推導期望值（17 §8-2），調參不需改測試 |
| R5 | **規格缺口**：`13-i18n-strings.md`、`15-balance.md`、`19-glossary.md` 於撰寫本文件時尚未存在 | 開工時無主表可查 | 回退規則（canonical）：BAL 值以各系統文件的「建議初值」為定案值直到 15 出現（00 §11 語意）；字串 key 依 00 §9 規範＋各文件 §6 字串表；術語依 00 §14。M9-1 規定：若屆時 15 仍缺，由實作者將 `balance.ts` 現值彙整撰寫為 `plan/15-balance.md` |
| R6 | **存檔格式演進**：M8 後改 state 結構會破壞既有存檔 | 玩家/測試檔失效 | `SAVE_FORMAT_VERSION`＋遷移鏈（M8-12）；golden save fixture 凍結（M8-19）使破壞性變更立刻紅燈 |
| R7 | **WebGL 相容性／渲染洩漏** | 特定機器白屏 | A10 生命週期驗收（M2-13）；P1–P5 全程監聽 console error；60fps 手動驗收含 context lost 檢查（M9-5） |
| R8 | **實作 session 上下文限制**：單一 AI session 無法載入全部規格 | 實作偏離規格 | `CLAUDE.md`（M0-1）固化鐵律與導航；每里程碑「開工前必讀」限定必要章節；任務粒度 S/M/L 對齊單 session 工作量；一任務一 PR 讓偏離可在 review 攔截 |

---

## 4. 資料結構

### 4.1 `milestone.json`（repo 根目錄；CI 門檻條件化的設定檔，落實 17-T13）

```typescript
/** 里程碑代號。'DONE' 表示 v1.0 發版後。 */
export type MilestoneId =
  | 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9' | 'DONE';

/** 任務規模：S=半日、M=1日、L=2-3日。 */
export type TaskSize = 'S' | 'M' | 'L';

/** repo 根目錄 milestone.json 的形狀（CI 讀取以決定啟用哪些阻斷 gate，對照 17 §3.11.2）。 */
export interface MilestoneConfig {
  /** 進行中的里程碑；checkpoint 時前進。 */
  current: MilestoneId;
  /** 已完成的里程碑（依序）；CI 以「current 之前全部完成」做一致性檢查。 */
  completed: MilestoneId[];
  /** 各里程碑完成日（ISO 8601 日期字串），供 README 進度表產生器引用。 */
  completedAt: Partial<Record<MilestoneId, string>>;
}
```

初始內容：`{ "current": "M0", "completed": [], "completedAt": {} }`。
CI 內以一段 node 腳本讀取 `current`，對照 17 §3.11.2 決定 `golden-s1560`、`perf-gate`、
`A2`、`P4/P5`、覆蓋率等 job 是否以阻斷模式執行（其餘恆為阻斷）。

### 4.2 README 進度表格式（M0-10 建立；checkpoint 時更新）

```markdown
## 開發進度

| 里程碑 | 內容 | 狀態 | 完成日 |
|---|---|---|---|
| M0 | 專案鷹架 | ✅ | 2026-07-10 |
| M1 | core 狀態機＋最小 HUD | 🔨 進行中 | — |
| M2 | 資料子集＋地圖渲染 | ⬜ | — |
| …  | …（M3–M9 同格式） | ⬜ | — |
```

狀態列舉固定三值：`✅`（完成）／`🔨 進行中`（恰一列）／`⬜`（未開始）。

### 4.3 `SimulateSummary`（`tools/simulate.ts` 輸出；M7-16。15 出現後若擴充欄位，以 15 為準、只增不減）

```typescript
/** 單一種子一局模擬的結果摘要。 */
export interface SimulateRunSummary {
  seed: number;                    // 種子（0..2^32-1）
  yearsSimulated: number;          // 實際模擬年數（年；達成統一時提前結束）
  unifiedByClanId: string | null;  // 統一勢力 ClanId；期限內無人統一為 null
  unifiedYear: number | null;      // 統一達成的西曆年；null 同上
  clanStats: Array<{
    clanId: string;                // 勢力 id（如 'clan.oda'）
    survived: boolean;             // 模擬結束時是否存續
    castleCount: number;           // 結束時城數（座）
    kokudaka: number;              // 結束時支配石高（石）
    peakKokudaka: number;          // 過程中峰值石高（石）
    destroyedYear: number | null;  // 滅亡年；存續為 null
  }>;
  totalBattles: number;            // 野戰＋合戰場次
  totalSieges: number;             // 攻城戰場次
  avgTickMs: number;               // advanceDay 平均毫秒（效能趨勢觀測用）
}

/** 多種子彙總（CLI 以 JSON 輸出到 stdout 與 tests/perf/simulate-report.json）。 */
export interface SimulateSummary {
  runs: SimulateRunSummary[];
  unificationRate: number;         // 期限內統一比例 0..1
  medianUnifiedYear: number | null;// 統一年中位數（僅計統一的局）
  survivalRateByClan: Record<string, number>; // 各勢力存活率 0..1
}
```

---

## 5. 演算法與公式

本文件為流程文件，**不新增任何 `BAL.*` 常數**（理由見 §8-D9）；以下為程序性演算法。

### 5.1 單一任務的標準執行流程（給實作 AI；每個 Mx-n 皆適用）

```
executeTask(taskId):
  1. 讀 milestone.json 確認 taskId 屬於 current 里程碑；讀該里程碑「開工前必讀」中
     與本任務「規格依據」對應的章節（含其引用鏈）。
  2. 若規格依據處有 TypeScript interface / 虛擬碼 → 先落型別與純函式骨架。
  3. 先寫測試（以規格依據處的驗收標準為案例來源；期望值由 BAL 推導）。
  4. 實作至測試綠燈；跑 npm run typecheck && npm run lint（core 純度與決定論守門）。
  5. 若實作中發現規格矛盾 → 依 00 優先序裁定 → 實作 → 回寫對應 plan 文件 §8。
  6. commit（§3.13 格式，帶 [taskId]）；開 PR；驗收標準逐條寫入 PR 說明。
```

### 5.2 checkpoint 程序（§3.14 的可執行版）

```
checkpoint(mx):
  1. run: npm run lint && npm run typecheck && npm run validate:data
  2. run: npm test            // 含 golden；紅燈 → 依 §3.14-2 規則處理後重跑
  3. run: npm run e2e
  4. if mx >= M4: run npm run bench，記錄 mean 貼入 PR
  5. if mx >= M7: run tsx tools/simulate.ts --seeds=5 --years=10（無例外即可，統計存檔）
  6. 核對 plan/17 §3.11.2 mx 欄全部 ✓ 皆為阻斷且綠
  7. 更新 README 進度表（§4.2）與 milestone.json（current 前進、completed/completedAt 追加）
  8. git tag m<N>; 開 checkpoint PR（標題 checkpoint(M<N>)），內文貼 DoD 逐條核對
```

### 5.3 golden 快照更新決策

```
onGoldenRed(diff):
  if 本 PR 未刻意改動任何 BAL 值、未新增系統入 tick、未改資料:
      → 視為回歸 bug：用 tests/replay 定位首個分岐 tick，修 bug，不更新快照
  else if 變動可由本 PR 的意圖完整解釋（例：接入 economy 後金錢軌跡整體平移）:
      → npm run golden:update；獨立 commit；PR 說明列出各 checkpoint 欄位變動與原因
  else:
      → 縮小 PR 範圍直到變動可解釋為止（禁止「順手」更新快照）
```

### 5.4 simulate 的判定式（M9-2 平衡回歸的通過條件）

```
pass(summary: SimulateSummary):
  assert 0.5 <= summary.unificationRate           // 25 年內半數以上局面有人統一
  assert summary.medianUnifiedYear ∈ [1575, 1585] // 對應 00 §6「15–25 年統一」目標帶
  assert survivalRateByClan['clan.oda']    >= 0.6 // 25 年
  for c in ['clan.takeda','clan.mori','clan.hojo','clan.shimazu','clan.imagawa']:
      assert survivalRateAtYear10(c) >= 0.7       // 10 年存活率（自 runs 重算）
  assert mean(runs.avgTickMs) < 8                 // 承接 17 §3.9.1 門檻
```

未達則調整 `balance.ts`（一次只動一組相關常數，重跑 20 種子），並依 §5.3 更新 golden。

---

## 6. UI/UX

不適用。本文件無遊戲內 UI；本文件引入的玩家不可見產出（`CLAUDE.md`、`milestone.json`、
README 進度表）之格式已於 §3.3.1 與 §4 定義，無繁中字串表需求（README 與 CLAUDE.md 正文
仍受簡體字掃描約束）。

---

## 7. 實作任務清單

本文件自身的落地任務（皆併入 M0 執行，於 M0 checkpoint 驗收）：

- [ ] **RM-1 `CLAUDE.md` 落地**（＝M0-1）。
      驗收：內容與 §3.3.1 範本一致（五節俱全）；`npm run validate:data` 簡體字掃描通過。
- [ ] **RM-2 `milestone.json` 落地與 CI 接線**（＝M0-10 前半＋M0-8 的 gate 條件化）。
      驗收：`current` 為 `"M0"`；CI 內對 17 §3.11.2 的階段性 job（golden-s1560/perf-gate/A2/P4/P5/
      覆蓋率）依 `current` 值決定阻斷與否，並有一條單元測試鎖住「completed 必為 current 的前綴序列」。
- [ ] **RM-3 README 進度表與 PR 模板落地**（＝M0-10 後半）。
      驗收：README 含 §4.2 進度表（M0 為 🔨）；`.github/pull_request_template.md` 含 §3.13-6 三核取方塊。
- [ ] **RM-4 checkpoint 慣例首次演練**：M0 完成時完整走一次 §5.2（1–3、6–8 步）。
      驗收：存在 tag `m0`；checkpoint PR 含 DoD 逐條核對；`milestone.json.current === "M1"`。
- [ ] **RM-5 里程碑歸屬回寫**：實作期間若任務在里程碑間移動（如降級路徑觸發），
      更新本文件對應任務表與 §8，不得只改程式不改文件。
      驗收：抽查任一已完成里程碑，其任務表與實際 merge 的 PR 清單一致。

---

## 8. 設計決策記錄

- **D1｜13／15／19 缺席時的回退規則**：撰寫本文件時 `plan/` 尚無 `13-i18n-strings.md`、
  `15-balance.md`、`19-glossary.md`。為不阻塞施工，定案：BAL 以各系統文件建議初值為定案值、
  字串依 00 §9＋各文件 §6、術語依 00 §14；三份文件任一出現後即恢復其最高權威。
  並把「彙整 balance.ts 回寫成 15 主表」定為 M9-1 的一部分，確保 v1.0 發版時主表存在。
- **D2｜04-T4 尋路提前至 M2**：00 §12 把行軍歸 M4，但 05 的輸送（M3）依賴 `computePath`。
  尋路是純圖演算法、只依賴 M2 的 MapGraph，提前無 UI 成本；行軍／制壓／遭遇仍留 M4。
- **D3｜01-A11／A12 由 M0 調整至 M1**：01 §7 字面上把除錯面板與 perfMonitor 歸 M0，
  但其驗收（「+30日」快進、HUD 金錢 +10,000貫）需要 M1 的 core 與 HUD 才可執行。
  依「驗收可執行」原則調至 M1 尾；里程碑歸屬以本文件為單一真相（見文件頭注）。
- **D4｜M1 用 TS 常數 tiny 劇本、M2 才有 zod mini fixture**：determinism 門檻（17 §3.11.2）
  自 M1 阻斷，但 zod schema 是 M2 產物。以程式內建 tiny 劇本（不經 zod）支撐 M1 的 DT 與
  單元測試；M2 的 mini fixture 落地後，tiny 僅保留給最小單元測試用，golden 一律用 mini/s1560。
- **D5｜M2 資料子集＝B1＋B2（34 城）**：任務要求「約 30 城」，採 14 §3.2 配額的東海 16＋近畿 18。
  選近畿而非關東作第二批的理由：與東海直接接壤（鈴鹿／中山道接縫）、含京都（朝廷／幕府
  系統的測試前提）、且 14 §7 本就以 B2=近畿 為第二批。builder 增加 `regions` 白名單載入：
  端點不在白名單內的街道邊剔除、未載入勢力不建外交列；勝敗判定的「全國」以已載入城集合為準。
  此模式僅供開發期，v1.0 出貨組態固定載入全部 9 批。
- **D6｜簡體字掃描器檔名採 17 的 `tools/scan-simplified.ts`**：01 §3.7.5 寫作
  `tools/check-simplified.ts`，兩者指同一工具。17 是掃描器規格的單一真相來源，故以 17 命名為準，
  `validate:data` script 同步改為 `tsx tools/validate.ts && tsx tools/scan-simplified.ts`；
  實作時在 01 §8 註記此修正。
- **D7｜軍團（07-T13）落 M7**：軍團的存在意義是「委任方面軍」，沒有軍團 AI（09-T8）時只是
  空殼簿記；與軍團 AI 同里程碑交付可一次驗收「劃撥→AI 自主攻略→收支上繳」全鏈。
- **D8｜06 拆 M3／M6，領主開發方針子集提前 M3**：知行（M3）依賴身分／俸祿／忠誠（06-T1..T5），
  而出奔／引拔／捕虜依賴調略與戰爭（M4–M6），自然斷開為兩批。受封郡「每月自動開發」是 M3
  內政可玩性的必要件，故 09 的 stewardAi 先交付「開發方針選擇」子集，M7-8 再完整化
  （褒賞／建造等其餘委任行為）；兩階段共用同一檔案與 Command 介面，無棄置成本。
- **D9｜本文件不新增 BAL 常數**：里程碑門檻、任務規模、模擬通過條件屬工程流程參數而非
  遊戲平衡值（比照 12 §8-D1 的 `UI.*` 與 17 §8-1 的 `TESTCFG` 先例）；§5.4 的判定值直接
  寫在 simulate 腳本內並引用 `TESTCFG` 風格常數，避免污染 15 主表。
- **D10｜simulate 於 M7 建成而非 M9**：M7 結束時 AI 已完備，統計即有效；讓 M8 的 7 批資料
  「邊做邊校準」（每批合入後跑 5 種子快檢），把平衡風險攤到兩個里程碑，而非 M9 一次爆發。
  輸出形狀（§4.3）先行定案，15 出現後只增不減，避免工具返工。
- **D11｜commit subject 用繁體中文**：與全案語言一致、review 時與 plan 文件詞彙對齊；
  type/scope/任務 ID 維持英文確保工具可解析。捨棄全英文訊息（與規格術語對照成本高）。
- **D12｜一揆的軍事鎮壓接線延至 M4**：05-T5-9 的鎮壓需要部隊抵達郡節點，M3 尚無行軍。
  M3 先交付爆發／產出歸零／自然平息（可完整測試治安模型），M4-11 補「部隊鎮壓」路徑；
  05 §7 的驗收在 M4-11 完成時才算全數滿足。
- **D13｜`milestone.json` 作為 17-T13「設定檔」的定案**：17 §7-T13 允許「milestone 標籤或
  設定檔」兩案；採設定檔——標籤依附 PR 易漏設，設定檔隨 checkpoint commit 演進、可被單元
  測試鎖一致性，且本地跑 CI 腳本行為與雲端一致。
- **D14｜P4（存讀檔）門檻取 M8**：追認 17 §8-10 的預設。16 的存讀檔不排更早的理由：
  M4 起 golden＋replay 已提供決定論回歸能力，存檔提早只增加 state schema 演進期的遷移負擔；
  M8 時 state 結構已收斂，遷移鏈從 v1 起算最乾淨。
- **D15｜M6-7 驗收標準回歸修正（2026-07-11，回歸修復）**：內應發動效果之單一真相已改採
  08 §5.5.3（四輪裁決 B）——城士氣降至 `BAL.plotBetrayalMoraleFloor`(=5)、城主忠誠歸 0；
  07 §3.11 之一次性 `betrayalMoraleHit`(−40) 模型已廢棄（07 §8-D28、15 §8-D16）。本文件 M6-7
  驗收標準仍寫舊制「內應城士氣 −40」，與現行機制不符，回改對齊 07 T12／08 §5.5.3。
  另 grep 全文 `betrayalMoraleHit`／`goldPerMonth`／`termDays`／`donateCourt` 均無殘留，
  除 M6-7 本項外無需其他修正。

---

*本文件由 Fable 5 設計定稿；依 00 §0.5，實作期若有里程碑歸屬變更，回寫本文件並於本節註記原因。*
