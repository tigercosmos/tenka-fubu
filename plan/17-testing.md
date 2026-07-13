# 17 — 測試與品質（Testing & Quality）

> 本文件是《天下布武》測試策略、決定論 golden test、資料驗證、效能基準與 CI 品質門檻的
> **單一真相來源**。撰寫依 `plan/00-foundations.md` §13 規範；術語依 00 §14 與 `plan/19-glossary.md`。

---

## 1. 目的與範圍

### 1.1 目的

1. 保證 `src/core/` 是**可驗證的確定性狀態機**：同（劇本、種子、Command 紀錄）必然重放出相同結果。
2. 讓平衡調整（`BAL.*` 改值）與重構有安全網：單元測試鎖行為、golden test 鎖整體數值軌跡。
3. 把「資料壞了」「混入簡體字」「效能退化」全部變成 **CI 紅燈**，而非人工檢查。
4. 建立 bug 報告的標準格式（command log 重放檔），使任何錯誤可被精確重現。

### 1.2 範圍（本文件擁有）

- 測試金字塔、工具對應、測試目錄與命名規範。
- core 各 system 的單元測試清單（具體案例與期望）。
- 決定論 golden test 與 bitwise 重跑測試的完整規格。
- 資料驗證測試整合（`tools/validate.ts` → Vitest）與**簡體字黑名單掃描器**規格。
- UI 元件測試（React Testing Library）與 Playwright smoke 的案例清單。
- 效能基準（`advanceDay` 門檻、地圖 60fps 手動驗收步驟）。
- command log 匯出／重放檔案格式（回歸素材）。
- CI 矩陣與各里程碑品質門檻。

### 1.3 範圍外（僅引用，不定義）

- 各 system 的遊戲公式本體：見 `plan/05-domestic.md`、`plan/07-military.md` 等（分工見 00 §7）。
- 資料驗證的**規則清單**（連通性、石高總量等）：見 `plan/14-scenario-data.md`；本文件只規定其測試整合方式。
- 除錯面板的 UI 佈局與 `window.__tenka` 全域掛載實作：見 `plan/01-architecture.md`；本文件定義測試所需的最小契約。
- CI 的部署（GitHub Pages）流程：見 `plan/01-architecture.md`。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | 最高準則：tick 順序（§5.4）、決定論要求（§5.5）、目錄結構（§3） |
| `plan/01-architecture.md` | 除錯面板、`window.__tenka` 掛載、CI 部署工作流程的實作歸它；本文件定義測試契約 `TestDebugApi` |
| `plan/02-data-model.md` | `GameState`／`Command` 型別的來源；序列化可比較性的不變量（純 JSON 值、無 Map/Set） |
| `plan/03-game-loop.md` | `advanceDay` 簽名、Command 驗證器、`rng.ts` 介面；本文件的 helper 依其介面撰寫 |
| `plan/05~10` 各系統文件 | 單元測試案例引用其公式與 `BAL.*` 常數；公式本體不在此複述 |
| `plan/12-ui-components.md` | `DataTable`／`NumberSlider` 等元件規格；本文件只列測試行為 |
| `plan/13-i18n-strings.md` | 本文件 §6.1 新增的字串 key 併入 13 主表 |
| `plan/14-scenario-data.md` | `tools/validate.ts` 的驗證規則清單歸它；本文件規定 Vitest 整合 |
| `plan/15-balance.md` | 本文件提出的 `BAL.*` 建議初值以 15 主表定案值為準 |
| `plan/16-save-and-settings.md` | 存讀檔格式與遷移；本文件的 save 測試依其規格 |
| `plan/18-roadmap.md` | 里程碑任務分解歸它；本文件 §3.11 定義各里程碑「品質門檻」（哪些測試何時轉為阻斷） |

---

## 3. 設計細節

### 3.1 測試金字塔與工具對應

由下而上，數量遞減、成本遞增：

| 層 | 工具 | 測的東西 | 執行環境 | 數量級 |
|---|---|---|---|---|
| L1 靜態 | `tsc --noEmit`、ESLint、Prettier check | 型別、程式風格 | Node | 全案 |
| L2 資料 | Vitest（引用 `tools/validate.ts`）＋簡體字掃描器 | 劇本 JSON 合法性、全案無簡體字 | Node | 每劇本 |
| L3 單元／整合 | Vitest（node 環境） | core 各 system 行為、Command 驗證、save roundtrip | Node | 200–400 案例 |
| L4 golden | Vitest（node 環境） | 決定論、跨系統長程模擬的數值軌跡 | Node | 2 條（mini／全國） |
| L5 UI 元件 | Vitest（jsdom）＋ React Testing Library | 關鍵通用元件行為 | jsdom | ~20 案例 |
| L6 E2E | Playwright（chromium） | 5 條 smoke，開機到合戰的關鍵路徑 | 真瀏覽器 | 5 條 |
| L7 效能 | Vitest bench ＋門檻測試 | `advanceDay` 平均耗時 | Node | 1 條阻斷＋bench |
| 手動 | 驗收清單 | 地圖 60fps、視覺回歸 | 真瀏覽器 | 發版前 |

原則：

- **core 邏輯一律在 L3 以 node 環境測**（00 §3 鐵律保證 core 零 DOM 依賴，這是可測性的根基）。
- UI 測試**不追求覆蓋率**，只鎖「壞了會靜默出錯」的元件行為（排序、邊界夾取、存檔列表）。
- E2E 永遠只有 5 條 smoke，不擴張；細節行為下沉到 L3／L5。

### 3.2 測試目錄、命名與 Vitest 設定

```
tenka-fubu/
├── src/
│   ├── core/
│   │   └── systems/
│   │       ├── economy.ts
│   │       └── economy.spec.ts        # 單元測試與被測檔同層，後綴 .spec.ts
│   └── ui/
│       └── components/
│           ├── DataTable.tsx
│           └── DataTable.spec.tsx     # UI 測試同層，後綴 .spec.tsx（jsdom）
├── tests/                             # 跨系統測試與素材
│   ├── config.ts                      # TESTCFG 常數（見 §4.1）
│   ├── helpers/
│   │   ├── build-state.ts             # buildMiniState / buildFullState
│   │   ├── run.ts                     # runDays / runMonths
│   │   ├── hash.ts                    # stableStringify / fnv1a64 / hashState
│   │   └── rng-stub.ts                # fixedRng
│   ├── fixtures/
│   │   ├── mini/                      # mini 劇本（§3.3）
│   │   └── saves/                     # 舊版存檔（遷移測試用）
│   ├── golden/
│   │   ├── golden.spec.ts
│   │   └── snapshots/
│   │       ├── mini-seed42.json
│   │       └── s1560-seed15600519.json
│   ├── determinism.spec.ts
│   ├── data/
│   │   ├── validate.spec.ts           # tools/validate 整合
│   │   └── no-simplified.spec.ts      # 簡體字掃描整合
│   ├── replay/
│   │   ├── replay.spec.ts
│   │   └── cases/                     # *.tfulog.json 回歸案例庫
│   └── perf/
│       ├── advance-day.bench.ts       # vitest bench（參考值）
│       └── advance-day.gate.spec.ts   # 門檻測試（M9 起阻斷）
├── tools/
│   ├── validate.ts                    # CLI 入口（規則見 14）
│   ├── scan-simplified.ts             # 簡體字掃描 CLI 入口
│   └── simplified-chars.ts            # 黑名單常數（本文件 §5.4 定義）
└── e2e/
    ├── playwright.config.ts
    └── smoke.spec.ts                  # 5 條 smoke（§3.8）
```

Vitest 以 workspace 分兩個 project：

```ts
// vitest.workspace.ts
export default [
  {
    test: {
      name: 'core',
      environment: 'node',
      include: ['src/core/**/*.spec.ts', 'tests/**/*.spec.ts'],
    },
  },
  {
    test: {
      name: 'ui',
      environment: 'jsdom',
      include: ['src/ui/**/*.spec.tsx'],
      setupFiles: ['tests/helpers/rtl-setup.ts'], // jest-dom matchers
    },
  },
];
```

npm scripts（package.json）：

| script | 內容 |
|---|---|
| `test` | `vitest run`（兩個 project 全跑，含資料測試） |
| `test:watch` | `vitest` |
| `test:core` | `vitest run --project core` |
| `test:ui` | `vitest run --project ui` |
| `test:golden` | `vitest run tests/golden` |
| `golden:update` | `UPDATE_GOLDEN=1 vitest run tests/golden` |
| `test:e2e` | `playwright test`（自動 `vite build && vite preview`） |
| `bench` | `vitest bench tests/perf` |
| `validate:data` | `tsx tools/validate.ts s1560` |
| `scan:simplified` | `tsx tools/scan-simplified.ts` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint . && prettier --check .` |

覆蓋率：provider `v8`；只對 `src/core/**` 設門檻（行 ≥ 80%、分支 ≥ 70%，M9 起阻斷，之前僅報告）。
UI 與 `src/app` 不設覆蓋率門檻。

### 3.3 測試 fixtures 與共用 helpers

#### 3.3.1 mini 劇本（`tests/fixtures/mini/`）

單元測試不載入全國資料，統一使用手寫的最小劇本（與 s1560 同 schema，通過 zod 驗證）：

| 項目 | 內容 |
|---|---|
| 勢力 | `clan.alpha`（預設玩家）、`clan.beta`（AI）；金錢各 1,000 貫、威信 100 |
| 城 | `castle.a1`（alpha 本城，耐久 1000、兵 2000、兵糧 5000）、`castle.a2`（alpha 支城，耐久 500、兵 800、兵糧 1500）、`castle.b1`／`castle.b2`（beta 對稱同值） |
| 郡 | 每城轄 2 郡（`dist.a1x`、`dist.a1y`…共 8 郡）：石高 20,000、商業 300、人口 15,000、治安 70、開發度 30；全部直轄 |
| 武將 | 每勢力 4 名。當主 `off.alpha-lord`：統率 80／武勇 70／知略 75／政務 85、年齡 30、身分 宿老、忠誠 100。其餘三名：能力 60±10、身分 侍大將、忠誠 70、功績 0 |
| 街道 | 直線 `castle.a1 — dist.a1y — castle.a2 — dist.b2x — castle.b2 — dist.b1y — castle.b1`，每邊行軍 3 日程；圖連通 |
| 外交 | alpha↔beta 信用 0、無協定、非交戰 |
| 開局 | 1560 年 4 月 1 日；預設種子 `TESTCFG.goldenSeedMini`（42） |

對稱設計（alpha 與 beta 鏡像同值）是野戰公平性測試（§3.4.3 M6）的前提。

#### 3.3.2 共用 helpers（`tests/helpers/`）

```ts
/** 建 mini 劇本初始狀態；overrides 以深層部分覆寫（結構見 02） */
function buildMiniState(opts?: {
  seed?: number;             // 預設 TESTCFG.goldenSeedMini
  allAi?: boolean;           // true: 玩家勢力也交給大名 AI（golden 用）
  overrides?: DeepPartial<GameState>;
}): GameState;

/** 建 s1560 全國初始狀態（golden 與效能測試用） */
function buildFullState(opts?: { seed?: number; allAi?: boolean }): GameState;

/** 推進 n 日；commands 依 day 分組，於該日 tick 開頭套用（簽名見 03） */
function runDays(state: GameState, n: number,
                 commands?: ReadonlyArray<{ day: number; command: Command }>): GameState;

/** 穩定序列化與雜湊（規格見 §5.1、§5.2） */
function stableStringify(v: unknown): string;
function hashState(state: GameState): string;   // 16 位十六進位

/** 回傳固定序列的 RngStream 替身（介面見 03）；序列耗盡即 throw */
function fixedRng(sequence: number[]): RngStream;
```

規範：單元測試的期望值**一律由 `BAL.*` 常數推導**（測試內 import `BAL` 計算期望），
不得把公式結果硬編碼成魔法數字——平衡調整不應弄壞單元測試；數值軌跡的回歸由 golden test 負責。

### 3.4 core 單元測試清單

以下每列為一個必須實作的測試案例。「期望」欄引用的公式歸各系統文件所有（§2 對應表），
測試以「引用 BAL 常數重算」的方式斷言。BAL 建議初值僅供推導，定案以 `plan/15-balance.md` 為準。

#### 3.4.1 economy（`src/core/systems/economy.spec.ts`）

| # | 案例 | 輸入（基於 mini） | 期望 |
|---|---|---|---|
| E1 | 月初金錢收入 | 推進至下個月 1 日 | alpha 金錢增量 = Σ(4 郡商業 300) × `BAL.goldPerCommerce`(0.1) − 支出（俸祿＋政策維持費，見 05 §5.3） |
| E2 | 非月初無收入 | 從 4 月 2 日推進至 4 月 3 日 | 金錢不變（無其他支出時） |
| E3 | 秋收 | 推進跨過 9 月 1 日 | `castle.a1.food` 增量 = Σ轄郡石高 40,000 × `BAL.harvestRate`(0.3) = 12,000 石；8 月 30 日與 9 月 2 日皆無此增量 |
| E4 | 駐軍日糧 | 推進 1 日 | 每城日糧耗 = 駐軍 × `BAL.garrisonFoodPerSoldierMonthly`(0.1)／30（小數以 `foodFrac` 累加，見 05 §5.2）；2,000 兵 → 約 6.67 石/日 |
| E5 | 出陣部隊日糧較高 | alpha 出陣 1,000 兵攜糧 500 石，推進 1 日 | 部隊攜行糧 −ceil(1,000 × `BAL.fieldFoodPerSoldierDaily`(0.02)) = −20 石；城不再為該 1,000 兵扣糧 |
| E6 | 月初俸祿支出 | 推進至月初 | 金錢支出 = Σ現役武將俸祿（`BAL.rankSalary`，當主與受封領主全免）＋Σ活躍政策維持費；**無任何每兵金錢維持費**（15 §5.2 表 B/C：`upkeepGoldPerSoldierMonth` 已刪） |
| E7 | 赤字（欠俸）行為 | override alpha 金錢 = 0，推進至月初 | 金錢 clamp 為 0（不為負）；發欠俸報告；alpha 全武將忠誠 −`BAL.unpaidSalaryLoyaltyPenalty`(2)；**赤字不扣城士氣**（15 §5.2 表 B/C：`deficitMoralePenalty` 已刪） |
| E8 | 赤字懲罰每月至多一次 | 承 E7，同月內再推進數日 | 懲罰不重複套用 |
| E9 | 商業 0 邊界 | override 全郡商業 = 0 | 月初商業收入為 0，金錢僅減維持費 |
| E10 | 城糧盡（非圍城） | override `castle.a1.food` = 0，推進 3 日 | 走 05 §5.2 非圍城糧盡路徑：該城士氣每日 −`BAL.castleStarveMoraleDaily`(2)（下限 0）、駐軍每日 ×(1−`BAL.starveDesertRate`(0.01))；`food` 不為負；每月至多一次報告 |

#### 3.4.2 development（`src/core/systems/development.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| D1 | 領主自動開發 | `dist.a1x` 分封給政務 85 武將、農業方針，推進 30 日 | 石高月成長依 05 §3.2.3：有效政務(85) × `BAL.devPolFactor`(0.6) × weight(主屬性 1.0) × scale(石高 1.0) × diminish × `BAL.fiefDevBonus`(1.25)；日成長 = 月額／30 |
| D2 | 直轄管理係數較低 | `dist.a1y` 維持直轄（城主政務 85）、同方針，推進 30 日 | 同 05 §3.2.3 公式但管理係數為 `BAL.directDevFactor`(0.8)；同有效政務下受封（`fiefDevBonus` 1.25）> 直轄（0.8），故 D1 增量 > D2 增量 |
| D3 | 屬性潛力上限 | override `dist.a1x.kokudaka` = `kokudakaCap`（02/14 定案名，E-09），推進 30 日 | 石高不再成長（diminish→0，不溢出上限）；開發度為 02 §5.1 衍生 `developmentPct`(0..100)，無獨立上限常數 |
| D4 | 商業上限 | override 商業 = `BAL.commerceMaxAbs`(2000)，推進 60 日 | 商業不再成長（00 §6：商業 0..2000） |
| D5 | 開發帶動產值 | 開發度 30 → 40 的郡 | 石高與商業依 05 公式單調不減；斷言前後關係（大於等於）而非絕對值 |
| D6 | 政務差異 | 兩郡領主政務 80 vs 40，各推進 30 日 | 政務 80 郡的開發度增量嚴格較大 |
| D7 | 一揆停止開發 | override `dist.a1y.uprising` 為進行中，推進 30 日 | 該郡三屬性成長皆為 0（05 §3.2.3：一揆中開發停止）；一揆結束後恢復（治安高低不直接抑制開發，`lowSecurityThreshold`／`lowSecurityDevFactor` 機制不存在，15 §5.2 表 B/C 已刪） |
| D8 | 被制壓的郡 | 敵部隊制壓 `dist.a1y` 完成 | 郡歸屬翻轉、開發度保留、治安下降（數值見 04/05）；開發下一日起計入新勢力 |

#### 3.4.3 military（`src/core/systems/military.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| M1 | 行軍日數 | alpha 自 `castle.a1` 出陣至 `castle.a2`（1 邊、3 日程） | 第 3 個 tick 結束時部隊位於 `castle.a2`，發 `army.arrived` 事件；第 2 個 tick 尚未抵達 |
| M2 | 途經敵郡需制壓 | alpha 部隊路徑含敵郡 `dist.b2x` | 進入該節點後停留 `BAL.subjugateDaysBase`(4) 日完成制壓（修正見 04），郡歸屬翻轉後才續行 |
| M3 | 糧盡潰走 | 出陣部隊攜糧 override = 0 | 每日兵力 −ceil(兵力 × `BAL.noFoodDesertionRate`(0.05))、士氣 −`BAL.noFoodMoraleDaily`(8)；士氣 ≤ `BAL.moraleBreakThreshold`(30) 當日轉為潰走、自動折返出發城 |
| M4 | 遭遇判定 | 兩敵對部隊同日進入同一節點 | 產生野戰（`fieldCombat`）；同勢力或同盟部隊不觸發 |
| M5 | 野戰解算對稱性（函數級） | 兩軍能力、兵力、士氣、地形完全相同 | 戰力評估函數對兩側回傳相同值；互換攻守參數順序，各自的每日傷害期望互為鏡像（公式見 07） |
| M6 | 野戰統計公平 | mini 對稱兩軍，`TESTCFG.fieldFairnessSeeds`(1000) 個固定種子各解算一次 | alpha 勝率 ∈ [0.45, 0.55]（§5.6 說明界限依據）；測試整體確定性：同 1000 種子重跑結果完全相同 |
| M7 | 士氣潰走 | 野戰中一方士氣先降至 ≤ `BAL.moraleBreakThreshold`(30) | 該方潰走：脫離戰鬥、承受追擊損失（見 07）、自動返城且途中不可再下令 |
| M8 | 部隊全滅 | 野戰打到一方兵力 0 | 該 `Army` 自 `state.armies` 移除；所屬武將進入捕虜／討死判定（見 06/07） |
| M9 | 抵達友城解散 | 部隊行軍終點為我方城 | 兵力併入城駐軍、剩餘攜行糧併入城 `food`、部隊移除 |
| M10 | 制壓已方郡為 no-op | 路徑僅經我方郡 | 不觸發制壓、不減速 |

#### 3.4.4 battle 合戰（`src/core/systems/battle.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| B1 | 發動門檻 | 雙方合計兵力 < `BAL.kassenMinTroops`(3000) | 不可發動合戰（Command 被驗證器拒絕），僅野戰自動解算 |
| B2 | 勝敗判定 | 合戰子迴圈跑至一方總大將部隊潰走或殲滅 | 該方敗北；`Battle` 結果物件標記勝方、殲滅比、總大將是否被討取 |
| B3 | 威風（小） | 勝方為任意合戰勝利且殲滅比 < 中門檻 | 結果 `awe = 'small'`（小威風＝任意勝利，無殲滅比門檻；15 §5.2 表 B：`aweSmallKillRatio` 已刪） |
| B4 | 威風（中／大） | 殲滅比 ≥ `BAL.aweMedKillRatio`(0.5)／≥ `BAL.aweLargeKillRatio`(0.7) 或敵總大將被討取 | `awe = 'medium'`／`'large'`（判定優先序見 07） |
| B5 | 威風擴散效果 | 大威風、戰場鄰近有敵郡與敵城 | 影響範圍內敵郡歸順翻轉、敵城士氣 −`BAL.aweCastleMoraleHit`(20)（範圍與衰減見 07）；範圍外不受影響 |
| B6 | 回寫策略層 | 合戰結束 | 傷亡、士氣、糧耗、俘虜全數回寫 `GameState`；合戰前後 `hashState` 差異僅來自這些欄位 |
| B7 | 戰法合法性 | 對無采配值／冷卻中的部隊下戰法 Command | 驗證器拒絕，狀態不變（戰法規格見 07） |
| B8 | 合戰用 `rng.battle` 流 | 同種子同輸入打兩次同一場合戰 | 結果完全相同；期間 `rng.dev`／`rng.ai` 等其他流的指標不動 |

#### 3.4.5 siege 攻城（`src/core/systems/siege.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| S1 | 強攻削耐久 | alpha 3,000 兵對 `castle.b2`（耐久 500）強攻 | 每日耐久減量 > 0（公式見 07）；攻方每日傷亡 > 同兵力包圍時傷亡 |
| S2 | 包圍耗糧 | 同上改包圍 | 守城 `food` 每日消耗 ×`BAL.encircleFoodMult`(2.0)；耐久每日減量遠小於強攻（可為 0，見 07） |
| S3 | 落城（強攻） | 推進至耐久 ≤ 0 | 城歸屬翻轉；殘兵與武將處置依 07；發出 `siege.ended` 事件（`fallen: true`、`newOwnerClanId`＝攻方） |
| S4 | 開城（糧盡） | 包圍下守城 `food` = 0 且士氣降至 0 | 開城：歸屬翻轉、守軍處置依 07 §3.11 |
| S5 | 解圍 | beta 援軍擊破圍城部隊 | 圍城狀態解除、守城士氣停止衰減（**無加成**；解圍即停止下降，15 §5.2 表 B/C、07 §3.11／T12：`siegeReliefMoraleBonus` 已刪） |
| S6 | 圍城士氣滲透 | 包圍持續 10 日 | 守城士氣每日 −`BAL.encircleCastleMoraleDaily`(2)（威風效果另計） |
| S7 | 攻方糧盡 | 圍城部隊攜行糧耗盡 | 依 M3 進入糧盡流程並潰走，圍城自動解除 |
| S8 | 本城支城差異 | 同兵力分別攻本城（耐久 1000）與支城（500） | 落城所需日數本城嚴格較長（其他條件相同） |

#### 3.4.6 diplomacy（`src/core/systems/diplomacy.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| DP1 | 外交工作累積信用 | alpha 對 beta 執行外交工作 3 個月（月費 `BAL.diplomacyWorkMonthlyCost`(20) 貫） | beta 對 alpha 信用 +3 × `BAL.trustPerWorkMonth`(3)；金錢同步扣款；信用上限 100 |
| DP2 | 同盟接受度 | 信用 ≥ `BAL.allianceTrustMin`(60) 且非交戰 → 提案；信用 40 → 提案 | 前者接受、後者拒絕（完整接受度公式見 08，測試以邊界兩側取值） |
| DP3 | 停戰效力 | 交戰中締結停戰 | `BAL.ceasefireMonths`(12，＝360 日) 內對該勢力的出陣 Command 被驗證器拒絕；期滿次日恢復合法 |
| DP4 | 破約懲罰 | 同盟存續中對盟友宣戰 | 對象信用歸 0、alpha 威信 −`BAL.betrayalPrestigeHit`(150)、其他所有勢力對 alpha 信用 −`BAL.betrayalTrustPenaltyOthers`(20) |
| DP5 | 協定到期 | 同盟自然到期（`BAL.allianceMonths`(60，＝1800 日)） | 到期日自動解除、雙方收到報告、不觸發破約懲罰 |
| DP6 | 重複提案非法 | 已有婚姻同盟，再送婚姻提案 | Command 驗證器拒絕，狀態不變 |
| DP7 | 從屬與上貢 | 威信差 ≥ `BAL.vassalPrestigeGap`(500) 的小勢力接受從屬 | 每月上貢 = 其月收入 × `BAL.vassalTributeRate`(0.15)（歸主家）；從屬期間主家對其出陣非法 |
| DP8 | 信用範圍 | 任意操作序列後 | 全部信用值恆在 0..100（不變量檢查） |

#### 3.4.7 officers（`src/core/systems/officers.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| O1 | 知行提升忠誠 | 分封 1 郡給忠誠 70 的武將，推進至月初 | 忠誠月結後 ≥ 70 + `BAL.fiefLoyaltyBonus`(5) + 1 × `BAL.fiefLoyaltyPerDistrict`(3)（05 §3.3.2 分級式，其他項不變時）；上限 100 |
| O2 | 低忠誠出奔 | override 忠誠 = 20（< `BAL.defectionThreshold`(30)） | 每月機率 =(門檻−忠誠)×`BAL.defectionChancePerPoint`(0.01)（06 §3.6.4；忠誠 20 → 0.1）判定（`rng.misc`）；用 `fixedRng` 分別注入 0.05 與 0.95：前者出奔（武將轉浪人、知行回收）、後者留任 |
| O3 | 功績升格 | override 功績 = `BAL.rankMeritThresholds[1]`(300) − 1，再獲 1 點 | 身分 足輕組頭 → 足輕大將；發升格報告；閾值陣列 [0, 300, 800, 1600, 3000, 5000]（15 §5.2 表 B／表 E） |
| O4 | 身分權限 | 以足輕大將任命城主 | Command 驗證器拒絕（侍大將以上才可任城主，00 §4）；侍大將任命成功 |
| O5 | 壽命死亡 | override 武將年齡 = 80，固定種子推進 | 於可預期月份死亡（判定公式見 06）；同種子重跑死亡月份相同 |
| O6 | 當主死亡繼承 | 當主死亡 | 依 06 繼承順位產生新當主；全家臣忠誠依譜代／外樣分別 −`BAL.successionLoyaltyShockFudai`(5)／−`BAL.successionLoyaltyShockTozama`(10)（15 §5.2 表 B）；無繼承人時勢力滅亡處理（見 10） |
| O7 | 領主死亡知行回收 | 受封武將死亡 | 其知行郡全部回歸直轄，郡資料不遺失 |
| O8 | 元服 | 劇本內 14 歲預備武將 | 次年 1 月 1 日年滿 15 時登場為可用武將；發報告 |
| O9 | 忠誠範圍不變量 | 任意操作序列後 | 全武將忠誠恆在 0..100 |

#### 3.4.8 ai（`src/core/systems/ai/*.spec.ts`）

AI 測試的核心是**合法性 property test**：AI 永遠只能產生驗證器接受的 Command。

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| A1 | mini 全 AI 合法性 | `buildMiniState({ allAi: true })`，模擬 24 個月，攔截全部 AI Command | 每一條都通過 Command 驗證器；驗證器拒絕數 = 0 |
| A2 | 全國合法性（slow） | `buildFullState({ allAi: true })`，模擬 12 個月 | 同上；此測試標記 `slow`，CI 於 nightly 與 M7 後的 PR 跑 |
| A3 | 遵守協定 | alpha↔beta 同盟中 | AI 的 beta 在同盟期間不產生對 alpha 的出陣／調略 Command |
| A4 | 赤字保守 | AI 勢力金錢 < `BAL.aiLowGoldThreshold`(100) | 該月評定不產生徵兵與新出陣 Command（AI 決策規格見 09） |
| A5 | 軍團權限邊界 | 設一軍團轄 `castle.b2` | 軍團 AI 產生的 Command 涉及的城／部隊全部屬於該軍團轄下 |
| A6 | 難易度只影響 AI | 初級 vs 上級各模擬 3 個月 | 玩家勢力（非 allAi）收入逐 tick 相同；AI 勢力收入依難易度乘數不同（00 §11） |
| A7 | AI 決策確定性 | 同種子同狀態跑兩次月初評定 | 產生的 Command 序列完全相同（`rng.ai` 流） |

#### 3.4.9 events（`src/core/systems/events.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| EV1 | 條件觸發 | 建構滿足 `evt.okehazama` 全部 trigger 條件的狀態（條件定義見 10/14），推進至判定日 | 事件觸發一次、效果套用、發報告 |
| EV2 | 不重複觸發 | 承 EV1 再推進 12 個月 | 同事件不再觸發（fired flag） |
| EV3 | 條件不足不觸發 | 使任一條件不成立（如今川家已滅亡） | 推進至時限結束仍不觸發 |
| EV4 | 機率事件重現性 | 帶機率的汎用事件，固定種子 | 同種子觸發月份相同；不同種子可不同（`rng.event` 流） |
| EV5 | 效果套用 | 汎用「豐作」事件觸發 | 目標城 `food` 增量與事件定義一致；其他欄位不變 |
| EV6 | 選項分歧 | 有 A/B 選項的事件，分別以 Command 回覆 A、B | 各自套用對應效果；未回覆前策略層事件停留待決（自動暫停規格見 00 §5.2） |
| EV7 | 判定時點 | 事件條件於月中才成立 | 依 10 的判定時點（月初為主）於下個月初觸發，不在當日觸發 |

#### 3.4.10 save（`src/core/save/save.spec.ts`）

| # | 案例 | 輸入 | 期望 |
|---|---|---|---|
| SV1 | roundtrip 深度相等 | mini 推進 100 日的狀態 → `serialize` → `deserialize` | 與原狀態深度相等（含 `rng` 各流內部狀態、事件 fired flags、外交列） |
| SV2 | hash 等價 | 承 SV1 | `hashState(原) === hashState(還原)` |
| SV3 | 續跑等價 | 狀態 A 直接跑 30 日 vs A 存檔→讀檔→跑 30 日 | 兩者 `hashState` 相同（決定論跨越存讀檔） |
| SV4 | 壓縮完整性 | 序列化字串 → lz-string 壓縮 → 解壓 | 與原字串逐字元相等 |
| SV5 | 版本遷移 | `tests/fixtures/saves/` 內 schemaVersion n−1 的存檔 | 遷移後通過 zod 驗證且可載入續跑（遷移規格見 16） |
| SV6 | 損壞存檔 | 壓縮資料截斷 50% | `load` 回傳型別化錯誤結果（不 throw 未捕捉例外）；UI 層可據以顯示 `ui.save.corruptSlot` |
| SV7 | 存檔體積 | s1560 開局狀態壓縮後 | 位元組數 < `TESTCFG.maxSaveCompressedBytes`(2,000,000) |
| SV8 | 不可序列化值防呆 | 對含 `NaN`／`Infinity`／`undefined` 欄位的狀態呼叫 `serialize` | 開發模式下 throw 帶欄位路徑的錯誤（02 不變量：GameState 為純 JSON 值） |

### 3.5 決定論與 golden test

#### 3.5.1 golden test（數值軌跡快照）

兩條 golden 皆為固定劇本＋固定種子的長程模擬。M7 AI 落地後採「零玩家指令＋全勢力 AI」；
M4 階段的 golden-mini 依第 19 條實作裁決改用固定軍事 Command 排程，避免 `allAi:true` 尚無行為時出現虛假覆蓋：

| 名稱 | 劇本 | 種子 | 模擬長度 | 快照點 | 阻斷起點 |
|---|---|---|---|---|---|
| golden-mini | mini | `TESTCFG.goldenSeedMini`(42) | 2 遊戲年（720 tick） | 每 360 tick，共 2 點 | M4 |
| golden-s1560 | s1560 全國 | `TESTCFG.goldenSeedFull`(15600519) | 5 遊戲年（1,800 tick） | 每 360 tick，共 5 點 | M9（資料於 M8 補完後） |

流程：

1. M4 golden-mini 以 `buildMiniState({ seed })` 建初始狀態，第 1 tick 投遞固定雙方出陣 Command；
   M7 後改為 `buildFullState({ seed, allAi: true })`，由大名 AI 接管全勢力且玩家 Command 佇列為空。
2. 逐 tick 呼叫 `advanceDay(state, [])`；每 360 tick 記錄 `{ day, hash: hashState(state) }`。
3. 與 `tests/golden/snapshots/*.json`（格式見 §4.3）比對：**任一 checkpoint hash 不符即測試失敗**。
4. 失敗訊息必須印出：首個不符的 checkpoint、期望與實得 hash、更新指令提示
   `npm run golden:update`。
5. `UPDATE_GOLDEN=1` 時改為重寫快照檔。**快照更新必須隨 PR 提交**，且 PR 說明需列出
   「哪個 core 改動、為何預期改變數值軌跡」；快照檔的無說明變更視為 review 阻擋事由。

#### 3.5.2 bitwise 重跑測試（`tests/determinism.spec.ts`）

| # | 案例 | 期望 |
|---|---|---|
| DT1 | 同輸入跑兩次 | 各自從 `buildMiniState({ seed: 42 })` 推進 `TESTCFG.determinismDays`(360) tick；兩份最終狀態 `stableStringify` 結果**逐位元組相同**（字串嚴格相等） |
| DT2 | 含指令的重跑 | 兩次都在第 10 日投遞相同徵兵 Command、第 40 日投遞相同出陣 Command；最終字串仍嚴格相等 |
| DT3 | 禁用非決定性 API | 靜態掃描 `src/core/**`：出現 `Math.random`、`Date.now`、`new Date(`、`performance.now` 即失敗（正規表達式掃描原始碼，測試實作於 determinism.spec.ts） |
| DT4 | 分流獨立性 | 只消耗 `rng.battle` 的操作前後，`rng.dev`／`rng.ai`／`rng.event`／`rng.misc` 的內部狀態不變 |

### 3.6 資料驗證測試與簡體字掃描

#### 3.6.1 `tools/validate.ts` 整合進 Vitest（`tests/data/validate.spec.ts`）

- `tools/validate.ts` 必須拆成**純函式庫＋CLI 包裝**兩部分：
  `validateScenario(scenarioId: string): ValidationResult`（不呼叫 `process.exit`、不印東西），
  CLI 包裝負責印報告與 exit code。驗證規則清單（zod schema、ID 唯一、參照完整、街道圖連通、
  總石高範圍、00 §10 數量目標）歸 `plan/14-scenario-data.md` 定義。
- Vitest 測試直接 import 純函式：

| # | 案例 | 期望 |
|---|---|---|
| V1 | s1560 全量驗證 | `validateScenario('s1560').errors` 為空陣列；任何劇本資料損壞（改壞一個參照）都使 CI 紅燈 |
| V2 | mini fixture 驗證 | `tests/fixtures/mini` 同樣通過（fixture 與正式資料同 schema） |
| V3 | 錯誤可讀性 | 對故意壞掉的 inline 測試資料（懸空 `stewardId`），錯誤物件含 `file`、`path`、繁中訊息 |

#### 3.6.2 簡體字黑名單掃描（`tools/scan-simplified.ts`）

00 §9 規定全案禁止簡體字。掃描器規格：

- **掃描範圍**（glob）：`src/**/*.{ts,tsx,json,css}`、`plan/**/*.md`、`tools/**/*.ts`、
  `tests/**/*.{ts,json}`、`e2e/**/*.ts`、`README.md`、`index.html`。
- **豁免檔案**（與 19 §4 掃描器豁免統一，至少含 17／19／14；E-73）：
  `TESTCFG.scanExemptFiles = ['plan/14-scenario-data.md', 'plan/17-testing.md', 'plan/19-glossary.md', 'tools/simplified-chars.ts', 'tools/glossary/forbiddenChars.ts']`
  （這些檔案必然含黑名單字元本身：本測試文件、劇本資料規格內嵌誤字引用、術語勘誤表，及兩份黑名單轉錄常數）。
  豁免的是 `plan/14-scenario-data.md` 規格文件（其 V10 規則內嵌誤字示例），**實際劇本 JSON（`src/data/scenarios/**`）不在豁免內、仍照掃**。豁免以外**無任何白名單檔案**。
- **三層清單**（字元常數定義見 §5.4；完整字集為 canonical，實作時逐字複製）：
  - **L1 無歧義簡體字**（167 字；E-73 補齊涵蓋 §3.12 簡體欄）：出現即錯誤。這些字元在台灣正體中無合法用途
    （對應正體字見 §5.4 註解），包含高風險遊戲用字：粮（糧）、战（戰）、贯（貫）、
    条（條，北條）、将（將）、围（圍）、领（領）、虏（虜）、铳（銃）、岛（島，島津）等。
  - **L2 語境敏感字**（3 字：后、干、里）：這些是**合法正體字**（皇后、若干、公里），
    但常見於劣質簡轉繁輸出（越后→越後、干部→幹部、这里→這裡）。掃描規則：該字所在行
    必須匹配該字的允許正規表達式，否則報錯（表見 §5.4）。
  - **L3 日文新字體**（40 字；E-73 補齊涵蓋 §3.12 新字體欄）：抜、戦、国、斎、滝、沢、辺、桜、塩、発、対、図、気、済、継、単、竜、駅、隣、姫、広、浜、関、鉄、験、栄、売、読、検、灯、来、徳、恵、狭、浅、弾、伝、衆、応、帰。
    劇本資料自日文來源整理時最易混入（沢→澤、桜→櫻、姫→姬）；出現即錯誤。
  - 明確**不列入**黑名單的易誤判字（皆為合法正體）：只、松、面、才、系、准、志、台、著、云、周。
- **輸出**：每筆 `檔案:行:欄 字元 → 建議正體字`；有任何一筆即 exit code 1。
- **Vitest 整合**（`tests/data/no-simplified.spec.ts`）：import 掃描函式，斷言回傳的
  `ScanFinding[]` 為空；失敗訊息完整列出所有筆數與位置。自 M0 起阻斷（plan/ 已存在）。

### 3.7 UI 元件測試（React Testing Library）

原則：只測「行為契約」，不測樣式與快照；不追求覆蓋率。元件規格見 `plan/12-ui-components.md`，
字串 key 見 `plan/13-i18n-strings.md`。三個必測元件：

**DataTable（`src/ui/components/DataTable.spec.tsx`）**

| # | 案例 | 期望 |
|---|---|---|
| U1 | 渲染資料列 | 傳 5 列資料 → 表格顯示 5 列與正確儲存格內容 |
| U2 | 點欄頭升冪 | 點數值欄（如兵力）欄頭 → 依數值升冪（1,000 在 200 之後不可發生——必須數值排序而非字串排序） |
| U3 | 再點降冪 | 同欄再點 → 降冪；欄頭顯示排序指示 |
| U4 | 文字欄以 zh-Hant 排序 | 武將名欄用 `Intl.Collator('zh-Hant-TW')` 比較 |
| U5 | 穩定排序 | 相同值的列維持原相對順序 |
| U6 | 空資料 | 傳空陣列 → 顯示 `t('ui.common.noData')` =「（無資料）」 |

**NumberSlider（`src/ui/components/NumberSlider.spec.tsx`）**

| # | 案例 | 期望 |
|---|---|---|
| U7 | 最小值夾取 | 輸入 min−1 → 值夾至 min，`onChange` 收到 min |
| U8 | 最大值夾取 | 輸入 max+1 → 值夾至 max |
| U9 | 步進吸附 | step=100 時拖至 250 → 吸附至 300 或 200（四捨五入規則見 12） |
| U10 | 鍵盤操作 | 方向鍵 ↑/→ 增一個 step、↓/← 減一個 step，不越界 |
| U11 | 非數字輸入 | 文字框輸入「abc」失焦 → 還原為前值、不觸發 `onChange` |
| U12 | disabled | 禁用時拖曳與鍵盤皆無效 |

**SaveList（`src/ui/components/SaveList.spec.tsx`）**

| # | 案例 | 期望 |
|---|---|---|
| U13 | 槽位渲染 | 依 16 的槽數渲染；空槽顯示 `t('ui.save.emptySlot')` |
| U14 | 已用槽資訊 | 顯示勢力名、遊戲內日期（`1565年3月2日` 格式）、實際存檔時刻 |
| U15 | 讀檔回呼 | 點已用槽的讀取 → `onLoad(slotId)` 恰被呼叫一次 |
| U16 | 刪除需確認 | 點刪除 → 出現確認對話（`t('ui.save.deleteConfirm')`）；取消不刪、確認後 `onDelete(slotId)` |
| U17 | 損毀槽 | 標記損毀的槽顯示 `t('ui.save.corruptSlot')`=「存檔損毀」且讀取鈕 disabled |

### 3.8 Playwright smoke（5 條，不增不減）

設定：僅 chromium；`baseURL` 指向 `vite preview`；每條逾時 60 秒、全套 < 5 分鐘；
共用前置：監聽 `console` 的 `error` 與 `pageerror`，出現即該條失敗。
所有選取器使用 `data-testid`（一覽見 §6.2）。

| # | 名稱 | 步驟 | 斷言 |
|---|---|---|---|
| P1 | 載入標題 | 開 `/` | `screen-title` 可見；頁面含「天下布武」字樣；無 console error |
| P2 | 開新局選織田 | 點 `title-newgame` → 點 `scenario-pick-s1560` → 點 `clan-pick-clan.oda` → 點 `newgame-start` | `screen-strategy` 可見；`hud-date` 顯示 s1560 開局日期（含「1560年」） |
| P3 | 推進 3 個月 | 承 P2；點 `speed-5`；輪詢 `hud-date` 直到月份 +3 | 過程中 `error-boundary` 不出現；點 `speed-pause` 後日期停止變化 |
| P4 | 存檔再讀檔 | 承 P3；`menu-open` → `menu-save` → `save-slot-1`；回標題；`title-loadgame` → `save-slot-1` | 回到 `screen-strategy` 且 `hud-date` 與存檔時刻完全相同 |
| P5 | 直達合戰畫面 | 開 `/?debug=1`；`page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'))` | `screen-battle` 可見；點 `battle-retreat` 後回到 `screen-strategy` |

`debug-battle-01` 是 core 內建的除錯合戰佈局（雙方各 2 部隊的固定編成），
由 `TestDebugApi.startBattle` 載入（契約見 §4.5；實作歸 01）。

### 3.9 效能基準

#### 3.9.1 `advanceDay` 門檻（自動，M9 起阻斷）

- **bench**（參考值，不阻斷）：`tests/perf/advance-day.bench.ts` 以 `vitest bench`
  對 `buildFullState` 後的 `advanceDay` 取樣，輸出 mean/p99 供觀測趨勢。
- **gate**（阻斷）：`tests/perf/advance-day.gate.spec.ts`
  1. `buildFullState({ seed: 15600519, allAi: true })`。
  2. 暖身推進 `TESTCFG.perfWarmupDays`(60) tick（JIT 與快取就緒）。
  3. 以 `process.hrtime.bigint()` 計時，連續推進 `TESTCFG.perfMeasureDays`(360) tick。
  4. 平均每 tick 毫秒數 `avg = 總耗時 / 360`。
  5. 斷言 `avg < TESTCFG.advanceDayAvgMsMax(8) × (CI 環境 ? TESTCFG.ciPerfFactor(2) : 1)`。
  6. 首次失敗允許自動重測一次（吸收機器抖動）；連續兩次失敗才判定紅燈。

#### 3.9.2 地圖 60fps 手動驗收（發版檢查表，M9）

1. `npm run build && npm run preview`，Chrome 開啟，視窗 1920×1080。
2. 開發者工具 → 效能監視器（Performance Monitor）顯示 FPS。
3. 讀入 s1560 開局；縮放到全國視野 → 平移地圖 10 秒：FPS 持續 ≥ 55。
4. 縮放到最近視野（可見城名與郡界）→ 平移 10 秒：FPS ≥ 55。
5. 以除錯面板 `spawnArmies(20)`（契約見 §4.5）產生 20 支移動中部隊，×5 速度跑 1 遊戲月：FPS ≥ 55、無爆記憶體（heap 曲線平穩）。
6. 滾輪連續縮放 10 次往返：無閃爍、無 WebGL context lost。
7. 任一步不達標即開 issue 並阻擋發版（渲染分層與剔除策略見 04）。

### 3.10 回歸素材：command log 匯出／重放

**用途**：bug 報告的標準格式。玩家（或開發者）在除錯面板匯出 `.tfulog.json`，
附在 issue 上；開發者以重放精確重現當時狀態。修復後該檔案存入 `tests/replay/cases/`
成為永久回歸案例——**每修一個 core bug，就新增一條 replay case**。

- **記錄**：core 在每次 `applyCommands` 成功套用 Command 時，附掛 `{ day, seq, command }`
  到 `state` 外側的環形紀錄器（不進 GameState、不進存檔；容量 `TESTCFG.commandLogCapacity`(50,000) 條，
  溢出、從進度存檔開始、或同 tick 硬驗證拒絕使 success-only 格式無法完整表達時，整檔標記
  `truncated: true` 且不可作為回歸案例；可選 `incompleteReasons` 提供診斷）。紀錄器由遊戲迴圈持有（見 03）。
- **匯出**：除錯面板按鈕（字串見 §6.1）產出 `CommandLogFile`（格式見 §4.4），
  含劇本 ID、種子、`balanceHash`（BAL 全表的 hash，偵測平衡版本不符）、最終日與最終 `hashState`。
- **重放**（演算法見 §5.5）：從同劇本同種子重建初始狀態，逐日餵入紀錄的 Command，
  比對最終 hash。除錯面板內建重放（顯示一致／不一致與首次分歧日）；
  `tests/replay/replay.spec.ts` 自動重放 `cases/` 內全部檔案並斷言 `finalHash` 相符。
- **平衡版本不符**：重放時 `balanceHash` 與當前不同 → 測試將該案例標記為
  「需重錄」失敗（訊息指示更新方式），除錯面板則顯示警告但允許執行。

### 3.11 CI 矩陣與里程碑品質門檻

#### 3.11.1 CI 工作流程（`.github/workflows/ci.yml`）

- 觸發：`push` 到 `main`、所有 PR。環境：`ubuntu-latest`、Node 22.x、npm cache。
  單一 OS／單一 Node 版本／單一瀏覽器（chromium）——不開矩陣（理由見 §8）。
- Jobs（相依關係）：

```
install ──┬── lint        （eslint + prettier check）
          ├── typecheck   （tsc --noEmit）
          ├── unit        （vitest run：core+ui+data+scan+golden+replay；上傳覆蓋率報告）
          ├── e2e         （vite build → playwright smoke；上傳 trace on failure）
          └── perf-gate   （M9 起加入：vitest run tests/perf/advance-day.gate.spec.ts）
```

- `A2 全國 AI 合法性` 與 `golden-s1560` 較慢（各約 1–3 分鐘），仍在 PR 內跑（總時長預算 10 分鐘內）；
  另設 nightly workflow 跑 `bench` 與 10 遊戲年的延長 golden（僅觀測、不阻斷）。
- 部署 workflow（GitHub Pages）與 CI 分離，僅 `main` 全綠後觸發，規格見 01。

#### 3.11.2 里程碑品質門檻（✓＝阻斷 PR；○＝僅報告；—＝尚未存在）

| 檢查項 | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 |
|---|---|---|---|---|---|---|---|---|---|---|
| tsc / eslint / prettier | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 簡體字掃描 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| core 單元測試（已實作系統） | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 資料驗證（validate.spec） | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| determinism（DT1–DT4） | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| golden-mini | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| golden-s1560 | — | — | — | — | — | — | — | — | ○ | ✓ |
| UI 元件測試（RTL） | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Playwright P1 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Playwright P2 | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Playwright P3 | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Playwright P5（合戰） | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Playwright P4（存讀檔） | — | — | — | — | — | — | — | — | ✓ | ✓ |
| AI 合法性 A1 | — | — | — | — | — | — | — | ✓ | ✓ | ✓ |
| AI 合法性 A2（全國） | — | — | — | — | — | — | — | ○ | ✓ | ✓ |
| replay 回歸庫 | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| perf gate（8ms） | — | — | — | — | ○ | ○ | ○ | ○ | ○ | ✓ |
| core 覆蓋率 80/70 | — | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ✓ |
| 60fps 手動驗收 | — | — | — | — | — | — | — | — | — | ✓ |

規則：每個里程碑的「完成定義」包含其欄位全部 ✓ 項通過；門檻只增不減；
任務分解與其餘驗收項見 `plan/18-roadmap.md`。

---

## 4. 資料結構

### 4.1 測試設定常數（`tests/config.ts`）

測試門檻**不是遊戲平衡值**，不進 `BAL.*`（理由見 §8-1）；集中於 `TESTCFG`：

```ts
export const TESTCFG = {
  /** golden：全國劇本種子（任意固定值，取桶狹間 1560/05/19） */
  goldenSeedFull: 15600519,
  /** golden：mini 劇本種子 */
  goldenSeedMini: 42,
  /** golden：全國模擬遊戲年數 */
  goldenYearsFull: 5,
  /** golden：mini 模擬遊戲年數 */
  goldenYearsMini: 2,
  /** bitwise 重跑測試的模擬日數 */
  determinismDays: 360,
  /** 野戰公平性測試的固定種子數 */
  fieldFairnessSeeds: 1000,
  /** 野戰公平性勝率下限／上限（≈ p=0.5 的 3σ，見 §5.6） */
  fieldFairnessWinRateMin: 0.45,
  fieldFairnessWinRateMax: 0.55,
  /** advanceDay 平均毫秒上限（本機基準；00 效能目標） */
  advanceDayAvgMsMax: 8,
  /** CI 機器放寬係數 */
  ciPerfFactor: 2,
  /** 效能測試暖身／量測 tick 數 */
  perfWarmupDays: 60,
  perfMeasureDays: 360,
  /** s1560 開局存檔壓縮後大小上限（bytes） */
  maxSaveCompressedBytes: 2_000_000,
  /** command log 環形紀錄器容量（條） */
  commandLogCapacity: 50_000,
  /** core 覆蓋率門檻（%） */
  coreCoverageLinesMin: 80,
  coreCoverageBranchesMin: 70,
  /** 簡體字掃描豁免檔（相對 repo 根目錄；與 19 §4 掃描器豁免統一，E-73） */
  scanExemptFiles: [
    'plan/14-scenario-data.md',
    'plan/17-testing.md',
    'plan/19-glossary.md',
    'tools/simplified-chars.ts',
    'tools/glossary/forbiddenChars.ts',
  ],
} as const;
```

### 4.2 掃描結果（`tools/scan-simplified.ts` 匯出）

```ts
/** 掃描規則種類 */
export type ScanRule =
  | 'simplified'   // L1 無歧義簡體字
  | 'context'      // L2 語境敏感字且該行未匹配允許 pattern
  | 'shinjitai';   // L3 日文新字體

export interface ScanFinding {
  file: string;        // repo 相對路徑
  line: number;        // 1 起算行號
  col: number;         // 1 起算欄號（以 code point 計）
  char: string;        // 命中字元（單一 code point）
  suggestion: string;  // 建議正體字（可能多個，如「發/髮」）
  rule: ScanRule;
}

/** 純函式：回傳全部命中；CLI 包裝負責印出與 exit code */
export function scanSimplified(rootDir: string): ScanFinding[];
```

### 4.3 golden 快照檔（`tests/golden/snapshots/*.json`）

```ts
export interface GoldenSnapshotFile {
  formatVersion: 1;          // 快照檔格式版本
  scenarioId: string;        // 's1560' | 'mini'
  seed: number;              // 建局種子
  ticks: number;             // 模擬總 tick 數（=年數×360）
  checkpoints: Array<{
    day: number;             // 自開局起算的 tick 序號（360, 720, …）
    hash: string;            // hashState 結果（16 位十六進位）
  }>;
  /** 產生當下的 BAL 全表 hash（§5.5）；BAL 改值必然使 golden 失效，此欄輔助訊息 */
  balanceHash: string;
}
```

### 4.4 command log 重放檔（`*.tfulog.json`）

```ts
export interface CommandLogEntry {
  day: number;      // 該 Command 被套用的 tick 序號（自開局第 1 日起算）
  seq: number;      // 同日內的套用順序（0 起算；決定論要求順序固定）
  command: Command; // 03 定義的 Command 聯集，原樣 JSON
}

export interface CommandLogFile {
  formatVersion: 1;
  appVersion: string;      // package.json version（僅供人讀）
  scenarioId: string;      // 劇本 ID
  seed: number;            // 建局種子
  playerClanId: string;    // 玩家勢力（如 'clan.oda'）
  balanceHash: string;     // 匯出當下 BAL 全表 hash；重放前比對
  truncated: boolean;      // 紀錄不完整（true 則不可作回歸案例）
  incompleteReasons?: Array<'capacity' | 'hardRejection' | 'loadedGame'>; // v1 可選診斷
  finalDay: number;        // 匯出當下的 tick 序號
  finalHash: string;       // 匯出當下的 hashState
  entries: CommandLogEntry[]; // 依 (day, seq) 嚴格遞增排序
}
```

### 4.5 測試所需除錯契約（實作歸 `plan/01-architecture.md`）

```ts
/** window.__tenka.debug 必須實作的最小介面（僅 ?debug=1 時掛載） */
export interface TestDebugApi {
  /** 直接載入內建除錯合戰佈局並開啟合戰畫面（P5 用）；id: 'debug-battle-01' */
  startBattle(layoutId: string): void;
  /** 產生 n 支隨機路徑的我方部隊（60fps 手動驗收用） */
  spawnArmies(n: number): void;
  /** 匯出 command log（回傳 CommandLogFile；UI 按鈕同源） */
  exportCommandLog(): CommandLogFile;
  /** 重放檔案並回傳結果（UI 與測試共用核心邏輯） */
  replayCommandLog(log: CommandLogFile): Promise<ReplayResult>;
}

export interface ReplayResult {
  match: boolean;          // finalHash 是否一致
  actualHash: string;      // 重放實得 hash
  expectedHash: string;    // log.finalHash
  divergedDay: number | null; // 首次分歧 tick（match=true 時為 null；偵測法見 §5.5）
  balanceMismatch: boolean;   // balanceHash 不一致（結果僅供參考）
}
```

---

## 5. 演算法與公式

### 5.1 stableStringify（穩定序列化）

hash 的前提是序列化結果與物件鍵插入順序無關。02 已保證 GameState 為純 JSON 值
（無 Map/Set/Date/函式/undefined/NaN）。

```
stableStringify(v):
  if v is null                → 'null'
  if v is boolean | string    → JSON.stringify(v)
  if v is number:
      assert Number.isFinite(v)          # NaN/Infinity 立即 throw（含欄位路徑）
      if Object.is(v, -0) → '0'          # 規避 -0 與 0 的表示差異
      return JSON.stringify(v)
  if v is Array               → '[' + v.map(stableStringify).join(',') + ']'
  if v is plain object:
      keys = Object.keys(v).sort()       # 依 UTF-16 code unit 排序
      pairs = keys
        .filter(k => v[k] !== undefined) # undefined 視為欄位不存在
        .map(k => JSON.stringify(k) + ':' + stableStringify(v[k]))
      return '{' + pairs.join(',') + '}'
  otherwise                   → throw（Map/Set/Date/class 一律拒絕，訊息含路徑）
```

### 5.2 fnv1a64 與 hashState

採 FNV-1a 64-bit（純 TypeScript BigInt 實作，零依賴、Node 與瀏覽器結果一致，
可同步呼叫——選型理由見 §8-5）：

```
fnv1a64(text):
  bytes = utf8Encode(text)
  h = 0xcbf29ce484222325n
  for b in bytes:
      h = h XOR BigInt(b)
      h = (h * 0x00000100000001b3n) AND 0xffffffffffffffffn
  return h.toString(16).padStart(16, '0')

hashState(state)  = fnv1a64(stableStringify(state))
balanceHash       = fnv1a64(stableStringify(BAL))
```

### 5.3 golden 執行器

```
runGolden(scenarioId, seed, years):
  state = buildInitialState(scenarioId, seed, { allAi: true })
  checkpoints = []
  for tick in 1 .. years * 360:
      advanceDay(state, [])                 # 玩家指令永遠為空
      if tick mod 360 == 0:
          checkpoints.push({ day: tick, hash: hashState(state) })
  return checkpoints

goldenSpec(name):
  expected = readJson(snapshotPath(name))
  actual   = runGolden(...)
  if env.UPDATE_GOLDEN:
      writeJson(snapshotPath(name), { ...meta, checkpoints: actual })
      pass
  else:
      for i in 0 .. expected.checkpoints.length-1:
          assert actual[i].hash == expected.checkpoints[i].hash,
            '第 {day} 日 hash 不符：期望 {e} 實得 {a}。' +
            '若此變更是刻意的，執行 npm run golden:update 並在 PR 說明原因。'
```

### 5.4 簡體字掃描器

字元清單（canonical，實作時逐字複製至 `tools/simplified-chars.ts`）：

```ts
/** L1：無歧義簡體字（167 字；E-73 補齊，涵蓋 19 §3.12 簡體欄）——出現即錯誤。
 *  對應正體（同序）：發東門長書學歷時義樂與協軍農達過還進選給
 *                  變現應擊勢壓產傷報繼絕紹織縣區濟漢鐵錢貫
 *                  戰國們會來對開關車馬頭買賣見頁說讀寫議讓
 *                  論轉輕邊運陣隊陽陰際陸難雙聖堅場糧幣帥師
 *                  歸當點劍動勞華單衛員圖團圍圓處備復奪寶實
 *                  宮壽將歲島廣庫張彈強條權極槍榮藥虜補裝計
 *                  認討記許諸談謀諜負貢敗貨賊賞賴銀銃鋒間聞
 *                  險順領飛騎體澤滿溫彥麼淺狹
 *                  齋瀧櫻鹽氣龍驛鄰濱驗檢燈傳眾（E-73 補齊行，對應 §3.12 簡體欄） */
export const SIMPLIFIED_L1: string =
  '发东门长书学历时义乐与协军农达过还进选给' +
  '变现应击势压产伤报继绝绍织县区济汉铁钱贯' +
  '战国们会来对开关车马头买卖见页说读写议让' +
  '论转轻边运阵队阳阴际陆难双圣坚场粮币帅师' +
  '归当点剑动劳华单卫员图团围圆处备复夺宝实' +
  '宫寿将岁岛广库张弹强条权极枪荣药虏补装计' +
  '认讨记许诸谈谋谍负贡败货贼赏赖银铳锋间闻' +
  '险顺领飞骑体泽满温彦么浅狭' +
  '斋泷樱盐气龙驿邻滨验检灯传众';

/** L3：日文新字體（40 字；E-73 補齊，涵蓋 19 §3.12 新字體欄）——出現即錯誤。
 *  對應正體（同序）：拔戰國齋瀧澤邊櫻鹽發對圖氣濟繼單龍驛鄰姬廣濱關鐵驗榮賣讀檢燈來德惠狹淺彈傳眾應歸 */
export const SHINJITAI_L3: string = '抜戦国斎滝沢辺桜塩発対図気済継単竜駅隣姫広浜関鉄験栄売読検灯来徳恵狭浅弾伝衆応帰';

/** L2：語境敏感字——該行未匹配 allow 即錯誤 */
export const CONTEXT_L2: ReadonlyArray<{ char: string; allow: RegExp; suggestion: string }> = [
  { char: '后', allow: /[皇太王]后|后妃|后土/u, suggestion: '後' },
  { char: '干', allow: /干支|天干|干戈|若干|干擾/u, suggestion: '幹/乾' },
  { char: '里', allow: /[公海]里|里程|鄉里|里山|里見/u, suggestion: '裡' },
];
```

掃描演算法：

```
scanSimplified(rootDir):
  findings = []
  files = glob(掃描範圍 §3.6.2) − TESTCFG.scanExemptFiles
  for file in files:
      lines = readUtf8(file).split('\n')
      for (lineNo, line) in lines:
          for (colNo, ch) in codePoints(line):        # 以 code point 迭代
              if ch in SIMPLIFIED_L1:
                  findings.push({file, lineNo, colNo, ch, rule:'simplified',
                                 suggestion: L1_MAP[ch]})
              else if ch in SHINJITAI_L3:
                  findings.push({..., rule:'shinjitai', suggestion: L3_MAP[ch]})
              else if ch in CONTEXT_L2 and not CONTEXT_L2[ch].allow.test(line):
                  findings.push({..., rule:'context', suggestion: CONTEXT_L2[ch].suggestion})
  return findings          # CLI：印出每筆並在 findings 非空時 exit 1
```

`L1_MAP`／`L3_MAP` 由上方註解的正體字串同序 zip 而成（實作時以兩條等長字串建表，
建構時 assert 長度相等）。

### 5.5 command log 重放與分歧定位

```
replay(log):
  balanceMismatch = (log.balanceHash != fnv1a64(stableStringify(BAL)))
  state = buildInitialState(log.scenarioId, log.seed, { playerClanId: log.playerClanId })
  byDay = groupBy(log.entries, e => e.day)      # 各組內依 seq 升冪
  for tick in 1 .. log.finalDay:
      advanceDay(state, commandsOf(byDay[tick]))
  actual = hashState(state)
  return { match: actual == log.finalHash, actualHash: actual,
           expectedHash: log.finalHash, balanceMismatch, divergedDay: null }

# 分歧定位（僅不一致且需要診斷時第二次執行；O(n) 額外 hash 成本）：
locateDivergence(log, dailyHashes?):
  若 log 內含選配欄位 dailyHashes（除錯版匯出每 30 tick 一筆 {day, hash}）：
      重放時於相同 tick 取 hashState 比對，回傳第一個不符的 day
  否則 divergedDay = null（僅報告 finalHash 不符）
```

`tests/replay/replay.spec.ts`：對 `cases/*.tfulog.json` 逐一執行 `replay`，
斷言 `match === true`；`balanceMismatch === true` 的案例改為失敗並提示重錄
（訊息：「BAL 已變更，請以目前版本重錄此回歸案例或更新 finalHash」）。

### 5.6 野戰公平性統計界限（M6 案例）

n = 1000 次伯努利試驗、理論 p = 0.5 時，樣本勝率標準差 σ = √(0.25/1000) ≈ 0.0158；
取 ±3σ ≈ ±0.047，放寬為 ±0.05 → 界限 [0.45, 0.55]，偽陽性率 < 0.3%。
種子集固定為 `1..1000`（非隨機抽樣），因此**此測試本身完全確定**：
若公式無側偏，結果永遠通過；若有側偏（如攻方恆先手未補償，見 07），穩定失敗。

### 5.7 效能量測

```
perfGate():
  state = buildFullState({ seed: TESTCFG.goldenSeedFull, allAi: true })
  for i in 1 .. TESTCFG.perfWarmupDays: advanceDay(state, [])
  t0 = hrtime()
  for i in 1 .. TESTCFG.perfMeasureDays: advanceDay(state, [])
  avgMs = (hrtime() - t0) / 1e6 / TESTCFG.perfMeasureDays
  limit = TESTCFG.advanceDayAvgMsMax * (env.CI ? TESTCFG.ciPerfFactor : 1)
  assert avgMs < limit   # 失敗時允許整段重測一次，兩次皆失敗才紅燈
```

量測含 AI 月初評定的攤提（360 tick 內含 12 次評定），與實際遊戲負載一致。

---

## 6. UI/UX

本文件僅新增除錯／測試相關字串與 `data-testid` 契約；除錯面板佈局見 01，字串主表見 13。

### 6.1 新增繁中字串（併入 `src/i18n/zh-TW.ts`，key 規範依 00 §9）

| key | 字串 |
|---|---|
| `ui.common.noData` | （無資料） |
| `ui.debug.exportLog` | 匯出指令紀錄 |
| `ui.debug.replayLog` | 重放指令紀錄 |
| `ui.debug.replayRunning` | 重放中…（第{day}日） |
| `ui.debug.replayOk` | 重放一致（hash {hash}） |
| `ui.debug.replayFail` | 重放不一致：期望 {expected}，實得 {actual} |
| `ui.debug.replayDiverged` | 首次分歧於第{day}日 |
| `ui.debug.replayBalanceWarn` | 警告：數值版本不符，重放結果僅供參考 |
| `ui.debug.startBattle` | 直達合戰（除錯） |
| `ui.debug.spawnArmies` | 產生測試部隊 |
| `ui.save.emptySlot` | －空－ |
| `ui.save.corruptSlot` | 存檔損毀 |
| `ui.save.deleteConfirm` | 確定要刪除這個存檔嗎？此動作無法復原。 |

### 6.2 `data-testid` 契約（smoke 測試選取器；元件實作見 11/12）

| testid | 所在畫面／元件 |
|---|---|
| `screen-title` / `screen-strategy` / `screen-battle` | 各畫面根節點 |
| `title-newgame` / `title-loadgame` | 標題選單按鈕 |
| `scenario-pick-s1560` | 劇本選擇卡片 |
| `clan-pick-{clanId}` | 勢力選擇（如 `clan-pick-clan.oda`） |
| `newgame-start` | 開局確認按鈕 |
| `hud-date` | HUD 日期文字（格式 `1560年5月3日`） |
| `speed-pause` / `speed-1` / `speed-2` / `speed-5` | 速度檔位按鈕 |
| `menu-open` / `menu-save` / `menu-load` | 系統選單 |
| `save-slot-{n}` | 存檔槽（1 起算） |
| `battle-retreat` | 合戰撤退按鈕 |
| `error-boundary` | React error boundary 顯示層（出現即異常） |

規則：上表 testid 為**穩定 API**，重構 UI 不得改名；新增畫面時比照命名（`screen-*`）。

---

## 7. 實作任務清單

- [ ] **T1 測試基建**：vitest.workspace（core/node ＋ ui/jsdom）、`tests/config.ts`（TESTCFG）、npm scripts 全表（§3.2）。
      驗收：`npm test` 可跑空測試集；`npm run typecheck`／`lint` 綠燈。
- [ ] **T2 helpers 與 hash**：`stableStringify`／`fnv1a64`／`hashState`／`fixedRng`／`runDays`。
      驗收：對含 `-0`、排序不同鍵序、巢狀陣列的物件，stableStringify 結果穩定；對 `NaN`／Map throw 帶路徑錯誤；hash 對已知字串有固定值（自帶測試向量 `fnv1a64('') === 'cbf29ce484222325'`）。
- [ ] **T3 簡體字掃描器**：`tools/simplified-chars.ts`（§5.4 清單逐字複製）＋ `tools/scan-simplified.ts` ＋ `tests/data/no-simplified.spec.ts`。
      驗收：對植入 `战`、`桜`、`越后` 的暫存檔各回報 1 筆（rule 分別為 simplified/shinjitai/context）；對 `皇后`、`若干`、`公里` 0 筆；掃描全 repo 0 筆；CLI exit code 正確。
- [ ] **T4 mini fixture**：`tests/fixtures/mini/` 依 §3.3.1 建置並通過 `validateScenario`。
      驗收：`buildMiniState()` 可建局並推進 30 日無錯。
- [ ] **T5 determinism 套件**：DT1–DT4。
      驗收：全綠；在 core 任意檔案植入 `Math.random()` 時 DT3 紅燈。
- [ ] **T6 core 單元測試**：§3.4.1–3.4.10 全部案例（各系統實作到位時同步交付，見 §3.11.2 門檻）。
      驗收：案例編號（E1…SV8）出現在測試名稱中；期望值皆由 `BAL` 推導、無魔法數字；`npm run test:core` 綠燈。
- [ ] **T7 golden**：`runGolden`、快照檔、`golden:update` 流程、golden-mini 與 golden-s1560。
      驗收：連跑兩次 golden 結果一致；改任一 `BAL` 值後 golden 紅燈且訊息含更新指引；`UPDATE_GOLDEN=1` 重寫後綠燈。
- [ ] **T8 資料驗證整合**：`tools/validate.ts` 拆純函式庫＋CLI；`tests/data/validate.spec.ts`。
      驗收：故意刪除一名武將的 JSON 後 CI 紅燈，錯誤訊息含檔名與 path。
- [ ] **T9 UI 元件測試**：U1–U17。
      驗收：`npm run test:ui` 綠燈；DataTable 數值欄以字串排序時 U2 必然紅燈（防呆自檢）。
- [ ] **T10 Playwright smoke**：P1–P5、`playwright.config.ts`（chromium、preview server、trace on failure）。
      驗收：本機與 CI 全綠、總時長 < 5 分鐘；任一畫面 throw 時對應條目紅燈。
- [ ] **T11 效能**：bench ＋ perf gate（§5.7）。
      驗收：本機輸出平均毫秒數；門檻邏輯以假時鐘單元測試（超標→失敗、重測一次的行為正確）。
- [ ] **T12 command log**：環形紀錄器掛載（配合 03）、`TestDebugApi.exportCommandLog`／`replayCommandLog`（配合 01）、`tests/replay/replay.spec.ts`、`cases/` 目錄與 README（一句話：修 bug 必附 case）。
      驗收：手動下 10 條指令→匯出→重放 match=true；竄改 log 中一條指令後 match=false。
- [ ] **T13 CI workflow**：`.github/workflows/ci.yml` 依 §3.11.1；nightly workflow（bench＋延長 golden）。
      驗收：PR 上五個 job 並行、失敗註記到 PR；門檻表 §3.11.2 以 job 條件化（依 milestone 標籤或設定檔）落實。
- [ ] **T14 發版檢查表**：`plan/17-testing.md` §3.9.2 的 60fps 步驟複製為 repo 內 `RELEASE_CHECKLIST.md`，含核取方塊。
      驗收：M9 發版 PR 附已勾選清單。

---

## 8. 設計決策記錄

1. **測試門檻用 `TESTCFG` 而非 `BAL.*`**：00 §11 將 `BAL` 定義為「遊戲數值」單一真相來源；
   效能毫秒數、統計界限、覆蓋率門檻是工程品質參數，混入 BAL 會污染 15-balance 主表，
   故獨立於 `tests/config.ts`。
2. **單元測試期望值由 BAL 推導、golden 鎖絕對數值**：若單元測試硬編碼結果，每次平衡調整都要改
   幾十個測試（成本高且易亂改）；改為「單元鎖公式形狀、golden 鎖數值軌跡」的雙層防護，
   平衡調整只需更新 golden 快照一處，且該更新在 PR 中顯式可審。
3. **簡體字黑名單分三層並排除易誤判字**：任務要求的清單中「后」在正體中文合法（皇后），
   直接列黑名單會誤殺，故設 L2 語境白名單制；「只、松、面、系、台」等字完全排除。
   另補日文新字體 L3——劇本資料多自日文史料整理，沢／桜／姫類混入風險比簡體更高。
   掃描器豁免 `plan/17-testing.md` 與 `tools/simplified-chars.ts`（黑名單本身必然含黑名單字元）；
   此兩檔的正文由人工確保正體，風險可接受。
4. **golden 採 allAi 而非「玩家勢力靜止」**：玩家勢力零指令且無 AI 接管時，該勢力等同植物人，
   模擬覆蓋不到玩家勢力的經濟／軍事路徑；`allAi: true` 讓全部系統都被長程行使，
   決定論不受影響（AI 亦走 `rng.ai` 固定流）。
5. **hash 用 FNV-1a 64 而非 SHA-256**：WebCrypto 的 `subtle.digest` 是非同步且 Node/瀏覽器
   API 形狀有差；FNV-1a 以 BigInt 純同步實作約 15 行、跨環境位元一致。golden 場景不需抗碰撞
   的密碼學強度，64-bit 對 5 個 checkpoint 的偶然碰撞機率可忽略。
6. **CI 不開矩陣**：core 是純 TS 無平台分支，多 OS／多 Node 版本矩陣只增加時長；
   Playwright 只跑 chromium——本作桌面優先（00 §1.5），Firefox/Safari 差異由發版前手動抽查承擔。
7. **perf gate 進 CI 而非只留 bench**：bench 無斷言等於沒有防線；門檻乘 CI 係數 2 並允許
   單次重測，是「防退化」與「防 flaky」的折衷。8ms 門檻直接承接 00 §6 效能目標
   （×5 速度 120ms/日 需 advanceDay 遠小於此值以保留渲染預算）。
8. **E2E 固定 5 條、UI 覆蓋率不設門檻**：E2E 與 UI 測試維護成本最高、回報遞減最快；
   把行為驗證下沉到 core 單元層（core 覆蓋率 80% 有阻斷門檻），UI 只鎖三個高風險通用元件。
9. **command log 不進存檔**：紀錄器容量 5 萬條若進 GameState 會膨脹存檔且破壞 hash 穩定性；
   放在遊戲迴圈側（state 之外）即可支援匯出／重放，代價是「讀檔後 log 從讀檔點重新開始」，
   對 bug 報告場景足夠。
10. **P4（存讀檔 smoke）門檻放 M8**：00 §12 的里程碑概覽未明列存讀檔完整化時點，
    本文件取 M8（全部畫面補完）為預設；若 `plan/18-roadmap.md` 將 16-save 提前，
    僅需把 §3.11.2 該列的 ✓ 起點前移，不影響其他規格。
11. **本文件提出的 `BAL.*` 名稱屬先行提案**：economy/military 等常數名（如
    `BAL.harvestRate`、`BAL.routMoraleThreshold`）以本文件用名為初稿，各系統文件與
    15-balance 主表定案時若改名，依 00 優先序修訂本文件測試清單引用（單向同步，不反向牽制）。
12. **（2026-07-07）E-80：§3.4 測試常數改引權威（依 15 §5.2 表 A/B/C）**：本文件 §3.4 原有一批
    自訂測試常數多為別名或不存在機制，全數改斷言權威公式／常數：
    - **值定案（表 A）**：`goldPerCommerce` 0.5→0.1（E1）、`harvestRate` 0.8→0.3（E3）、
      `directDevFactor` 0.6→0.8（D2）、`fiefLoyaltyBonus` 10→5（O1）、`aweLargeKillRatio` 0.6→0.7（B4）、
      `vassalTributeRate` 0.1→0.15（DP7）。
    - **別名改名（表 B）**：`armyFoodPerSoldierDay`→`fieldFoodPerSoldierDaily`(0.02，E5)、
      `garrisonFoodPerSoldierDay`→`garrisonFoodPerSoldierMonthly`(0.1，E4)、
      `subjugateBaseDays`→`subjugateDaysBase`(4，M2)、`starvationAttritionRate`→`noFoodDesertionRate`／
      `starvationMoralePerDay`→`noFoodMoraleDaily`(8)／`routMoraleThreshold`→`moraleBreakThreshold`(30)（M3/M7）、
      `battleMinSoldiers`→`kassenMinTroops`（B1）、`aweMediumKillRatio`→`aweMedKillRatio`(0.5)／
      `aweMoraleHit`→`aweCastleMoraleHit`(20)（B4/B5）、`siegeFoodFactor`→`encircleFoodMult`(2.0)／
      `surrenderMoraleThreshold`→`moraleBreakThreshold`(30)／`siegeMoraleDecayPerDay`→`encircleCastleMoraleDaily`(2)（S2/S4/S6）、
      `diploWorkGoldPerMonth`→`diplomacyWorkMonthlyCost`／`ceasefireDays`→`ceasefireMonths`(12)／
      `betrayalPrestigePenalty`→`betrayalPrestigeHit`(150)／`allianceDays`→`allianceMonths`(60)（DP1/DP3/DP4/DP5）、
      `defectionLoyaltyThreshold`→`defectionThreshold`／`defectionChancePerMonth`→`defectionChancePerPoint`(0.01)／
      `meritRankThresholds`→`rankMeritThresholds`([0,300,800,1600,3000,5000])／`successionLoyaltyShock`→
      `successionLoyaltyShockFudai`(5)/`Tozama`(10)（O2/O3/O6）、`commerceCap`→`commerceMaxAbs`（D4）、
      `deficitLoyaltyPenalty`→`unpaidSalaryLoyaltyPenalty`（E7）、`garrisonStarvationMoralePerDay`→非圍城路徑
      `castleStarveMoraleDaily`(2)＋`starveDesertRate`(0.01)（E10）。
    - **刪除不存在機制常數（表 B/C）**：`upkeepGoldPerSoldierMonth`（E6 改斷言支出僅俸祿＋政策）、
      `deficitMoralePenalty`（E7 赤字不扣城士氣）、`siegeReliefMoraleBonus`（S5 解圍為停止下降、無加成）、
      `devDailyBase`／`devCap`／`stewardPolWeight`／`lowSecurityThreshold`／`lowSecurityDevFactor`
      （D1/D2/D3/D7 改依 05 §3.2.3 三屬性開發模型＋02 §5.1 `developmentPct` 衍生；D7 改測「一揆停止開發」）。
    依據：19 §3.13 E-80、15 §5.2 表 A/B/C。
13. **（2026-07-07；2026-07-10 覆核修正字數敘述）E-73：簡體字掃描器字形集補齊與豁免統一**：§3.6.2 與 §5.4 之
    `SIMPLIFIED_L1` 補入 §3.12 簡體欄缺漏 14 字（原有本體 153 字→167 字）、`SHINJITAI_L3` 由 17 字擴為 40 字
    （涵蓋 §3.12 新字體欄全部 40 個相異誤字形），使 L1∪L3 ⊇ 19 §3.12 全 71 個相異誤字形——§3.12 計 40 個新
    字體誤字形＋36 個簡體誤字形（扣除拔／姬／德／惠 4 列「同繁」註記，該 4 字簡體與正體同形、非誤字形），
    兩欄再扣除同形重疊 5 字（國/国、燈/灯、來/来、狹/狭、淺/浅）後聯集為 71；§3.6.2 與 §4.1
    `TESTCFG.scanExemptFiles` 統一為
    `['plan/14-scenario-data.md','plan/17-testing.md','plan/19-glossary.md','tools/simplified-chars.ts','tools/glossary/forbiddenChars.ts']`
    （與 19 §4 掃描器豁免一致、至少含 17／19／14；14 僅豁免規格文件本身，實際劇本 JSON 仍照掃）。
    一併消化 E-72 之 17 側（14 內嵌誤字改以豁免處理）。依據：19 §3.13 E-73／E-72、19 §3.12、19 §4。
14. **（2026-07-11）§3.4.5 S3 測試斷言改依 canonical 事件、非 core 直發 `report.*` key**：
    02 §8「2026-07-11 七輪裁決」定案新契約——core 不得直發 `report.*` key，一律發 02 §4.19 canonical
    事件，報告字串由 13 `renderReport` 於**渲染時**導出，非 core 斷言標的。S3（落城強攻）期望原「發
    `report.siege.fallen` 報告」改為「發出 `siege.ended` 事件（`fallen: true`、`newOwnerClanId`＝攻方，
    payload 見 02 §4.19）」；`siege.fallen`／`siege.repelled` 兩變體鍵已由 `siege.ended.fallen` 布林判別
    取代（02 六輪裁決），本文件不應再以已淘汰之 report 變體鍵命名測試期望。
    全文 grep `report` 確認僅此一處落在「core 斷言引用具名 `report.*` key」語境，已同型修正；其餘出現
    「發報告」字樣的案例（如 EV1／E7／O3／O8 等）皆為泛稱、未具名特定 `report.*` key，不構成 core 直發
    report key 的斷言，不在本次修正範圍內、維持原文。依據：`plan/02-data-model.md` §8「2026-07-11 七輪
    裁決」框架記 3、E-01…E-80 主體「新契約下 core 不得直發 `report.*`」。
15. **（2026-07-11；M0-6 實作時發現並修正）§5.4 `CONTEXT_L2`「里」規則補「里見」姓氏例外**：
    實作 `tools/scan-simplified.ts` 後對全 repo 實跑，`09-ai.md` 大名能力表「里見」（關東大名里見氏，
    亦見 `14-scenario-data.md` `clan.satomi`）被 L2「里」規則誤判——原允許正規表達式
    `/[公海]里|里程|鄉里|里山/u` 未涵蓋姓氏用法，導致該合法史實專有名詞遭誤報。全文 grep 確認
    `里` 於非豁免文件中僅有「里程碑」（已由 `里程` 允許）與此「里見」兩種用法，別無其他姓氏／
    地名組合，故追加 `|里見` 分支即可覆蓋現有全部合法用例，不影響既有「誤判即報」的嚴格度。
    另同批實跑亦於 `07-military.md` 抓到一處真實簡體字誤植（「同步补」應為「同步補」），已直接
    修正該處文字，非規格層面問題。依據：M0-6 實跑 `npm run validate:data` 輸出（本文件 §5.4／
    `tools/simplified-chars.ts` 同步修訂）。
16. **（2026-07-11；M1-16／M1-17 實作時新增）`vitest.workspace.ts` 增設 `app` project（jsdom），
    §3.2 canonical 範本之 core／ui 兩個 project 保留不變**：`src/app/**`（`store.ts`／`bridge.ts`／
    `gameLoop.ts`／`autoPause.ts`）需要 DOM（`requestAnimationFrame`／`document.visibilitychange`）
    才能測試（01-A7「假時鐘測試」、01-A8「模擬 visibility 事件」），但 §3.2 範本的 `core` project
    為 `node` 環境（無 DOM）、`ui` project 只收 `src/ui/**/*.spec.tsx`（不含 `src/app/**`），兩者皆
    無法承接。新增第三個 `app` project（`environment: 'jsdom'`，`include: ['src/app/**/*.spec.ts',
    'tests/app/**/*.spec.ts']`，共用 `tests/helpers/rtl-setup.ts`）填補此缺口；`core`／`ui` 兩個
    project 定義完全不變（僅 `core` 之 `include` 另加 `exclude: ['tests/app/**']`，避免與新
    `app` project 的 glob 交集使同一檔案在 node 環境下被重跑一次而失敗）。另實測發現 jsdom 的
    `requestAnimationFrame` 在 `vi.useFakeTimers()` 下雖同步觸發 callback，但 `now` 引數不受 fake
    clock 控制（見 `plan/01-architecture.md` §8 D19 ④），故 `gameLoop.ts` 之累加器精確毫秒邊界
    測試改以手動 `FrameScheduler`（`tests/helpers/manualFrameScheduler.ts`）驅動，非直接倚賴
    jsdom 原生 `requestAnimationFrame`；`stepDays` 之 `setTimeout` 鏈則不受此限、仍以
    `vi.useFakeTimers()` 驅動。`package.json` 新增 `test:app` script 與既有 `test:core`／`test:ui`
    對稱。實作：`vitest.workspace.ts`、`package.json`、`tests/helpers/manualFrameScheduler.ts`、
    `tests/helpers/rtl-setup.ts`（另補 `IS_REACT_ACT_ENVIRONMENT` 旗標與 RTL `cleanup()` 註冊，
    修正 `act()` 警告與跨測試元件殘留掛載問題，兩者皆與 vitest 未開 `test.globals` 有關）。
17. **（2026-07-11；M1-21 實作時新增）`tests/determinism.spec.ts`（DT1–DT4）三項實作裁決**：
    ①**DT1/DT2 之 `buildMiniState` 改用 `buildTinyState`**：本節原文字面寫 `buildMiniState({ seed: 42 })`，
    但 mini fixture（zod 驗證版）是 M2 產物；沿用 18-roadmap.md §8-D4 既有裁決（M1 用 TS 常數 tiny
    劇本頂替），語意等價（固定劇本＋固定種子＋長程 tick），M2 mini 就緒後亦不需回頭改動本檔（golden
    另案改用 mini/s1560，§3.5.1 已界定）。②**DT2 之「徵兵／出陣 Command」選用 `setConscriptPolicy`／
    `march`，兩者於 M1 尚未登錄 handler（分屬 M3／M4）**：依 `command.rejected`（`notImplemented`）
    既有骨架（§8-D14；`tests/core/commands.spec.ts` 已示範同一手法）完整走過 Step 1 驗證／結算
    （消費 seq、`lastAppliedCmdSeq` 前進、發出 `command.rejected`→落地 Report），足以驗證「指令投遞
    時點與內容影響狀態演化路徑」之決定論本質；待 M3/M4 該二 handler 落地後無需改動本檔（相同
    Command 序列，只是不再被拒絕）。③**DT3 掃描前先去除 `//`／`/* */` 註解**：§3.5.2 原文「出現即
    失敗」若逐字採「原始碼全文（含註解）字面比對」，會誤判 `src/core/rng.ts`／`systems/index.ts`
    檔頭以中文註解**說明**「core 禁止 Math.random/Date.now」等既有合法文件字面（M1-4／M1-7 程式碼，
    非違規）；DT3 立意是攔「實際呼叫」，故本檔掃描前以空白覆蓋註解內容（保留換行、行號不漂移），
    語意對齊 18 §3.4 M1-21 驗收標準原文「植入 `Math.random()` 時 DT3 紅燈」（即真呼叫，非提及其名）。
    ④**DT3 三層防線**：主防線＝正規表達式靜態掃描 `src/core/**`（§3.5.2 原文）；補強保險 1＝斷言
    `eslint.config.js`（01 §3.7.3 canonical 內容）對 `src/core/**/*.ts` 仍登記 `no-restricted-properties`
    (Math.random／Date.now) 與 `no-restricted-syntax`(new Date) 三項規則（防未來調整設定檔悄悄拿掉
    此道防線）；補強保險 2＝`vi.spyOn(Math, 'random')` 實跑一段模擬斷言零呼叫（防迂迴寫法規避①之
    逐行正規表達式）。**`performance.now` 現況不在 01 §3.7.3 的 `no-restricted-globals`／
    `no-restricted-properties` 清單內**（該清單本就只列 8 個 DOM/BOM 全域＋2 個屬性限制）——此為
    01 既有定案範圍，非本次任務之缺陷，不擅自回頭修改 `eslint.config.js`（產出物歸 01-A3、M0 已
    gate 通過）；`performance.now` 之防線僅倚賴①regex 掃描＋②執行期 spy 兩層，非三層。
    實作：`tests/determinism.spec.ts`。
18. **（2026-07-13；M4 規格對齊）糧盡折損與落城門檻以 07／15 為準**：§3.4.3 M3 原寫
    `floor(兵力×noFoodDesertionRate)`，與 07 §3.13「向上取整」及 15 定案相牴觸，改為 `ceil`；
    §3.4.5 S4 原以城士氣低於 30 即開城，與 07 §3.11「耐久、士氣、守兵任一降至 0」相牴觸，
    改測城士氣降至 0。依優先序系統文件 07 高於測試文件 17，測試不得另立第二套機制。
19. **（2026-07-13；M4-16～M4-18 回歸基礎實作裁決）golden 階段排程、不完整 log 與非同步重放**：
    ① M7 AI 尚未落地，`allAi:true` 在 M4 無行為差異；M4 golden-mini 改為種子 42 加第 1 tick
    固定雙方 `march` Command，以真實覆蓋行軍／遭遇／野戰路徑，M7 後再切回零玩家指令的全 AI 長程模擬。
    ② success-only 檔無法重建硬驗證拒絕所消耗的全域 command seq，且記錄器依設計不進存檔；
    因此 `truncated` 統一表示「不可作為位元回歸案例的不完整記錄」，並以可選 `incompleteReasons`
    區分 `capacity`／`hardRejection`／`loadedGame`；除錯重放仍可執行以供參考，`tests/replay/cases/` 必須拒絕。
    ③ production 劇本為保留 code-split 只有 async loader（`loadScenario`），故 debug `replayCommandLog`
    回傳 `Promise<ReplayResult>`；它使用與新遊戲相同的 `buildNewGameState` 重建，不另造同步 loader
    而破壞劇本 JSON 分塊。④ M4 bench 固定暖身 60 tick 後取樣 360 tick；M7 AI 落地後再加入 AI 負載。
