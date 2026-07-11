# 01 — 技術架構（Architecture）

> 本文件是《天下布武》（`tenka-fubu`）技術架構的單一真相來源。
> 技術選型已於 `plan/00-foundations.md` §2 定案，本文件不重議選型，只規定「怎麼用、邊界在哪」。

---

## 1. 目的與範圍

本文件定義：

- 各技術套件的具體使用方式與整合邊界。
- 專案目錄結構展開至檔案級，每個檔案的職責。
- `src/core/` 純邏輯層與 UI 層之間的狀態橋接（Zustand vanilla store、selector 粒度、Command 佇列 API）。
- 遊戲主迴圈（`requestAnimationFrame` 累加器）與 React 的整合、暫停／變速／失焦行為。
- PixiJS 與 React 的共存模式（單一 canvas、imperative renderer、HTML overlay、resize／devicePixelRatio）。
- TypeScript／ESLint／Prettier／Vite 的具體設定值與 import 邊界 lint 規則。
- GitHub Actions CI 與 GitHub Pages 部署的完整 workflow 規格。
- 效能預算與達成手段。
- 錯誤處理、log 策略、開發者除錯工具。

**不在本文件範圍**（參見 00 §7 分工表）：GameState 各實體欄位（`plan/02-data-model.md`）、
tick 引擎內部與 Command 語意（`plan/03-game-loop.md`）、地圖渲染的視覺內容與尋路演算法
（`plan/04-map-and-movement.md`）、存讀檔格式（`plan/16-save-and-settings.md`）、
測試策略細節（`plan/17-testing.md`）、畫面與元件規格（`plan/11`、`plan/12`）。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | 最高準則。§2 選型、§3 目錄骨架、§5 主迴圈為本文件細化的基礎。 |
| `plan/02-data-model.md` | `GameState` 與全部遊戲實體型別在 02 定義；本文件只定義「架構層」型別（store、loop、renderer、error、debug）。 |
| `plan/03-game-loop.md` | `advanceDay` 內部系統順序、Command 聯集、GameEvent 匯流排在 03 定義；本文件定義 UI 側如何驅動它。 |
| `plan/04-map-and-movement.md` | 地圖圖層內容、鏡頭操作、尋路在 04 定義；本文件定義 `MapRenderer` 的生命週期契約與 React 掛載方式。 |
| `plan/12-ui-components.md` | design tokens 與元件庫在 12 定義；本文件只規定 `src/ui/styles/` 的檔案位置與 CSS Modules 慣例。 |
| `plan/13-i18n-strings.md` | 字串主表在 13；本文件 §6 的字串（錯誤畫面、除錯面板）為 13 主表的一部分，key 以本文件為準。 |
| `plan/15-balance.md` | 本文件引入的 `BAL.ui*`／`BAL.perf*` 常數建議初值，最終值以 15 主表定案。 |
| `plan/16-save-and-settings.md` | idb-keyval／lz-string 的存檔管線細節在 16；本文件只定 IO 邊界（core 不做 IO）。 |
| `plan/17-testing.md` | Vitest／Playwright／golden test／效能驗證細節在 17；本文件提供 CI yaml 與 npm scripts 契約。 |
| `plan/18-roadmap.md` | 本文件 §7 任務多數屬 M0，部分屬 M1／M2。 |

---

## 3. 設計細節

### 3.1 分層架構總覽與依賴規則

四層，依賴方向嚴格單向（箭頭表示「可以 import」）：

```
ui ──────┐
         ├──▶ core ──▶ data/schemas（僅型別與 zod schema，皆為純 TS）
app ─────┤
         └──▶ ui、core、data、i18n（app 是唯一可以認識所有層的組裝層）
i18n ────▶（無依賴；純字串表與 t 函式）
```

鐵律（違反即 lint error，見 §3.7.3）：

1. `src/core/**` 與 `src/data/**` **不得** import React、PixiJS、Zustand、idb-keyval、
   任何 `src/ui/`、`src/app/`、`src/i18n/` 模組，也不得使用任何 DOM／BOM 全域
   （`window`、`document`、`requestAnimationFrame`、`setTimeout`、`localStorage`……）。
2. `src/core/**` 不得使用 `Math.random`、`Date.now`、`new Date()`（00 §5.5；亂數一律走 `core/rng.ts`）。
3. `src/ui/**` 只能 import core 的**公開 API**（`@core/index`、`@core/state/selectors`、型別），
   不得 import `@core/systems/**` 內部模組；UI 絕不直接改寫 `GameState`，一切變更走 Command。
4. `src/i18n/**` 無任何依賴；UI 文字一律經 `t(key)`（00 §9）。
5. 只有 `src/app/**` 可以同時接觸 core、ui、Zustand store、瀏覽器 IO（IndexedDB、檔案下載）。
6. `lz-string` 例外地允許在 `core/save/` 使用（純 JS 字串壓縮，無 IO、無 DOM），
   但 IndexedDB 讀寫（idb-keyval）只在 app 層。

### 3.2 技術選型使用方式與整合邊界

| 套件 | 使用範圍 | 具體用法與邊界 |
|---|---|---|
| TypeScript 5.x | 全案 | `strict` 全開＋`noUncheckedIndexedAccess`＋`exactOptionalPropertyTypes`；core 另以無 DOM lib 的 `tsconfig.core.json` 二次 typecheck（§3.7.1）。 |
| React 18.x | `src/ui`、`src/app` | 只負責 HTML overlay UI 與畫面切換。開發模式啟用 `<StrictMode>`；不使用 Suspense for data、不使用 Server Components、不引入 react-router（畫面切換是 store 狀態，見 §8 決策 D8）。 |
| Vite 6.x | 建置 | SPA 單入口 `index.html`；`base` 由環境變數 `VITE_BASE` 注入（GH Pages 子路徑，§3.8.2）；`manualChunks` 拆 vendor（§3.9.3）。 |
| Zustand 5.x | store 在 `src/app/store.ts`；React binding 只在 `src/ui` | 用 `createStore`（`zustand/vanilla`）建立，core 完全不知道 store 存在；React 元件經 `useStore` + selector 訂閱（§3.4）。禁止在 store 內放遊戲邏輯。 |
| PixiJS 8.x | 僅 `src/ui/map/**` | 單一全螢幕 canvas；imperative renderer class，React 只負責掛載／卸載（§3.6）。UI 面板一律 HTML，不用 Pixi 畫 UI（Pixi 內小型 UI 例外見 `plan/12` §Pixi 內 UI）。 |
| idb-keyval 6.x | 僅 `src/app/persistence.ts` | 存檔槽讀寫 IndexedDB；core 只輸出／輸入純字串（參見 `plan/16`）。 |
| lz-string 1.5.x | 僅 `src/core/save/serialize.ts` | `compressToUTF16`／`decompressFromUTF16`（IndexedDB 對 UTF-16 字串友善）。 |
| zod 3.x | `src/data/schemas/**`、`core/save/migrate.ts` | 劇本 JSON 與存檔載入時 `safeParse` 驗證；執行期遊戲邏輯內不跑 zod（效能）。 |
| Vitest 2.x | `tests/**`、`src/**/*.test.ts` | 跑在 Node 環境（core 無 DOM 依賴故可直接測）；golden test 見 `plan/17`。 |
| Playwright 1.x | `e2e/**` | 僅 chromium、僅 smoke（開機→開新局→跑 30 日不噴錯）；細節見 `plan/17`。 |
| ESLint + Prettier | 全案 | flat config；邊界規則見 §3.7.3；Prettier 見 §3.7.4。 |
| Noto Serif TC | `public/fonts/` | 離線子集化成 woff2 後 commit（§3.9.3、§8 決策 D7）；`@font-face` 於 `src/ui/styles/global.css` 宣告，`font-display: swap`。 |

### 3.3 目錄結構展開（檔案級）

以 00 §3 骨架細化。標注「▷ 見 plan/xx」者，其內容規格屬該文件，此處只定位置與職責。

```
tenka-fubu/
├── index.html                      # 唯一 HTML 入口；<div id="root">＋字型 preload
├── package.json                    # scripts 見 §3.7.5
├── vite.config.ts                  # base、alias、manualChunks（§3.7.2）
├── tsconfig.json                   # 全案 typecheck 設定（§3.7.1）
├── tsconfig.core.json              # core/data 無 DOM lib 的二次把關（§3.7.1）
├── eslint.config.js                # flat config＋import 邊界規則（§3.7.3）
├── .prettierrc.json                # 格式化設定（§3.7.4）
├── playwright.config.ts            # e2e smoke 設定（§3.7.6）
├── vitest.config.ts                # 測試設定；alias 與 vite 共用
├── .github/
│   └── workflows/
│       ├── ci.yml                  # lint＋typecheck＋test＋validate:data＋build＋e2e（§3.8.1）
│       └── deploy.yml              # main 分支 → GitHub Pages（§3.8.2）
├── public/
│   └── fonts/
│       └── noto-serif-tc-subset.woff2   # 子集化字型成品（committed）
├── plan/                           # 本計畫規格文件
├── src/
│   ├── main.tsx                    # 進入點：解析 URL 參數 → boot() → ReactDOM.createRoot
│   ├── app/
│   │   ├── App.tsx                 # 頂層元件：ErrorBoundary、畫面切換、DebugPanel 掛載
│   │   ├── store.ts                # Zustand vanilla store（GameStore 型別、初始 session 值）
│   │   ├── bridge.ts               # dispatchCommand / publishTick / runOneDay（§3.4.3、§5.2）
│   │   ├── gameLoop.ts             # GameLoopController：rAF 累加器、速度、暫停（§3.5、§5.1）
│   │   ├── boot.ts                 # 劇本 JSON dynamic import → zod 驗證 → buildGameState
│   │   ├── persistence.ts          # idb-keyval 存檔槽 IO（▷ 管線見 plan/16）
│   │   ├── autoPause.ts            # GameEvent → 自動暫停判定（依設定，▷ 設定項見 plan/16）
│   │   └── debug.ts                # DebugFlags 解析、window.__TENKA_DEBUG__ 安裝（§3.11）
│   ├── core/                       # 純邏輯層（可在 Node 執行）
│   │   ├── index.ts                # core 公開 API 唯一出口：advanceDay、validateCommand、
│   │   │                           #   buildGameState、serialize、selectors 再匯出
│   │   ├── balance.ts              # 全部 BAL.* 常數（▷ 主表見 plan/15）
│   │   ├── rng.ts                  # mulberry32 多流亂數（▷ 規格見 plan/03）
│   │   ├── errors.ts               # CoreError 型別階層（§3.10.1、§4.4）
│   │   ├── log.ts                  # CoreLogger 介面＋setLogger 注入點（§3.10.3）
│   │   ├── state/
│   │   │   ├── gameState.ts        # GameState 與實體型別（▷ 見 plan/02）
│   │   │   ├── build.ts            # ScenarioData → 初始 GameState builder（▷ 見 plan/02、14）
│   │   │   ├── selectors.ts        # 純函式查詢（UI／AI 共用，如 getClanArmies(state, clanId)）
│   │   │   └── invariants.ts       # checkInvariants(state)：dev 模式每 tick 後執行（▷ 不變量清單見 plan/02）
│   │   ├── commands/
│   │   │   ├── types.ts            # Command 聯集（▷ 見 plan/03；debug.* 子集由本文件 §3.11.3 定義）
│   │   │   ├── validate.ts         # validateCommand(state, cmd) → CommandDispatchResult
│   │   │   └── apply.ts            # applyCommands（tick 開頭統一結算，▷ 見 plan/03）
│   │   ├── systems/                # 每日 tick 系統（順序＝00 §5.4；▷ 各系統見對應文件）
│   │   │   ├── time.ts             # 曆法推進（▷ plan/03）
│   │   │   ├── economy.ts          # 收入、消耗、秋收（▷ plan/05）
│   │   │   ├── development.ts      # 郡開發、領主自動治理（▷ plan/05）
│   │   │   ├── military.ts         # 行軍、制壓、遭遇、野戰解算（▷ plan/04、07）
│   │   │   ├── battle.ts           # 合戰戰術戰場子迴圈（▷ plan/07）
│   │   │   ├── siege.ts            # 攻城 tick（▷ plan/07）
│   │   │   ├── diplomacy.ts        # 外交、朝廷、幕府、調略（▷ plan/08）
│   │   │   ├── officers.ts         # 忠誠、功績、壽命、元服（▷ plan/06）
│   │   │   ├── proposals.ts        # 具申生成與結算（▷ plan/06、09）
│   │   │   ├── events.ts           # 歷史事件引擎＋勝敗判定（▷ plan/10）
│   │   │   └── ai/
│   │   │       ├── daimyo.ts       # 大名 AI（▷ plan/09）
│   │   │       ├── corps.ts        # 軍團委任 AI（▷ plan/09）
│   │   │       ├── steward.ts      # 領主／城主委任 AI（▷ plan/09）
│   │   │       └── shared.ts       # AI 共用評估函式（▷ plan/09）
│   │   └── save/
│   │       ├── serialize.ts        # GameState ⇄ 壓縮字串（lz-string；▷ plan/16）
│   │       └── migrate.ts          # 存檔版本遷移（▷ plan/16）
│   ├── data/
│   │   ├── schemas/                # zod schemas＋由之推導的 ScenarioData 型別（▷ plan/14）
│   │   │   ├── scenario.ts         # 劇本總 schema
│   │   │   ├── clan.ts / officer.ts / castle.ts / district.ts / road.ts / event.ts
│   │   │   └── index.ts            # 匯出全部 schema 與型別
│   │   ├── map/
│   │   │   ├── japan-outline.json  # 日本輪廓折線（▷ plan/04、14）
│   │   │   └── projection.ts       # 00 §8 經緯度 → 4096×4096 投影常數與函式
│   │   └── scenarios/s1560/        # 劇本資料 JSON（clans/officers/castles/districts/roads/events；▷ plan/14）
│   ├── ui/
│   │   ├── screens/                # 畫面級元件（檔案清單 ▷ plan/11）
│   │   ├── components/             # 通用元件庫（檔案清單 ▷ plan/12）
│   │   ├── map/
│   │   │   ├── MapCanvasHost.tsx   # React 掛載點：建立／銷毀 MapRenderer（§3.6.2）
│   │   │   ├── MapRenderer.ts      # imperative Pixi 渲染器（§3.6.1、§4.3）
│   │   │   ├── camera.ts           # 鏡頭狀態與縮放／平移（▷ 操作規格 plan/04）
│   │   │   └── layers/             # baseMap / territory / roads / nodes / armies / effects / debugOverlay
│   │   │                           #   各一檔（▷ 圖層內容 plan/04）
│   │   ├── debug/
│   │   │   ├── DebugPanel.tsx      # 除錯面板（§3.11.2）
│   │   │   └── StateViewer.tsx     # 唯讀 JSON 樹狀態檢視器
│   │   ├── hooks/
│   │   │   ├── useGameSelector.ts  # 訂閱 game slice 的標準 hook（§3.4.2）
│   │   │   ├── useSession.ts       # 訂閱 session slice 的 hook
│   │   │   └── useHotkeys.ts       # 鍵盤快捷鍵（空白鍵暫停、1/2/3 變速、` 開除錯面板）
│   │   └── styles/
│   │       ├── tokens.css          # design tokens（▷ plan/12）
│   │       └── global.css          # reset、@font-face、根層 layout
│   ├── i18n/
│   │   ├── zh-TW.ts                # 全部 UI 字串（▷ plan/13）
│   │   └── t.ts                    # t(key, params) 取字＋{name} 插值；缺 key 時 dev 拋錯、prod 回傳 key
│   └── vite-env.d.ts               # Vite 型別引用
├── tools/                          # 以 tsx 執行的開發腳本
│   ├── validate.ts                 # 劇本資料 zod 驗證＋連通性檢查（▷ plan/14、17）
│   ├── stats.ts                    # 劇本統計（總石高、勢力規模表；▷ plan/14）
│   ├── scan-simplified.ts          # 簡體字黑名單掃描（▷ plan/17 §3.6.2；命名依 17，D15）
│   ├── subset-font.ts              # 掃描 zh-TW.ts＋劇本 JSON 用字 → 產生子集 woff2（§3.9.3）
│   └── assets/NotoSerifTC-Regular.otf  # 字型原始檔（僅供子集化，不進 bundle）
├── tests/                          # golden-master 模擬測試、效能基準、fixtures（▷ plan/17）
└── e2e/
    └── smoke.spec.ts               # Playwright 開機煙霧測試（▷ plan/17）
```

### 3.4 core ↔ UI 橋接

#### 3.4.1 Store 形狀與所有權

單一 Zustand vanilla store，兩個 slice：

- **`game` slice**：指向目前 `GameState` 的參考。**只有 `bridge.ts` 能 setState 這個 slice**。
  core 在 `advanceDay` 內**就地變異** `GameState`（理由見 §8 決策 D1），
  因此每次 tick 後由 bridge 遞增 `tickSeq` 讓訂閱者重跑 selector。
- **`session` slice**：純 UI 執行期狀態（速度、暫停原因、目前畫面、地圖選取、開啟中的 modal、
  除錯旗標、致命錯誤）。UI 元件可經 store 上的 action 函式修改。

store 建立於 `src/app/store.ts`：

```ts
import { createStore } from 'zustand/vanilla';

export const store = createStore<GameStore>()((set) => ({
  game: null,          // boot 完成前為 null（型別見 §4.1）
  tickSeq: 0,
  session: initialSession,
  actions: { /* setSpeed, select, openModal... 皆為純 session 操作 */ },
}));
```

#### 3.4.2 Selector 粒度策略（防止整棵重渲染）

因為 `game` 是就地變異的物件，**「選出物件參考」無法作為變更訊號**（參考永遠相同）。
規則如下，違反者視為 bug：

1. **UI selector 只能回傳原始值（number/string/boolean）、原始值 tuple、或每次重新建構的小型
   derived 物件**；禁止回傳 `GameState` 內部的可變物件／陣列參考給 React 使用。
2. 一律透過 `useGameSelector` hook 訂閱（內部以 `useShallow` 做輸出淺比較）：

```ts
// src/ui/hooks/useGameSelector.ts
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { store } from '@app/store';

export function useGameSelector<T>(select: (game: GameState) => T): T {
  return useStore(store, useShallow((s) => {
    if (s.game === null) throw new CoreError('DATA_INTEGRITY', 'game 尚未初始化');
    return select(s.game);
  }));
}
// 用例：const gold = useGameSelector((g) => g.clans.get(playerId)!.gold);
// 用例：const armyIds = useGameSelector((g) => selectors.getClanArmyIds(g, clanId)); // 回傳新陣列，useShallow 比較元素
```

3. 運作原理：`publishTick` 以 `set({ tickSeq: n })` 通知所有訂閱者 → 每個 selector 重跑 →
   `useShallow` 比較輸出 → 值沒變的元件不重渲染。因此 **selector 的計算成本必須 O(1) 或
   O(小常數)**；需要掃描全實體的彙總值（如勢力總石高）由 `core/state/selectors.ts` 提供
   帶 `tickSeq` 快取的版本（§5.3）。
4. 清單類 UI（城一覽、武將一覽）selector 先選出 **id 陣列**（`useShallow` 逐元素比較），
   列元件再各自以 id 訂閱自己的欄位；如此單一城數值變動只重渲染該列。
5. `session` slice 是不可變更新（一般 Zustand 慣例），元件用 `useSession(selector)` 訂閱。

#### 3.4.3 Command 佇列 API

UI 對遊戲狀態的**唯一**寫入路徑（Command 語意與完整聯集見 `plan/03`）：

```ts
// src/app/bridge.ts
const pendingQueue: Command[] = [];   // 模組私有；下一 tick 開頭統一結算（00 §5.2）

export function dispatchCommand(cmd: Command): CommandDispatchResult {
  const game = store.getState().game;
  if (game === null) return { ok: false, reason: 'NOT_BOOTED' };
  const verdict = validateCommand(game, cmd);      // 同步預檢，立即回饋 UI
  if (!verdict.ok) return verdict;                 // UI 以 t(key) 顯示原因（key 對照 ▷ plan/03）
  pendingQueue.push(cmd);
  store.setState({ session: { ...s.session, pendingCommandCount: pendingQueue.length } });
  return { ok: true };
}
```

- 預檢通過只代表「當下合法」；`advanceDay` 的 `applyCommands` 會**再次驗證**（狀態可能已變），
  屆時失敗不拋錯，而是產生一則 `Report`（拒絕原因），參見 `plan/03`。
- 暫停中下達的 Command 留在佇列，HUD 顯示待處理數（`pendingCommandCount`）；恢復後第一個 tick 結算。
- 佇列在 `runOneDay` 開頭被整批取走（`splice(0)`），保證同一 tick 內順序＝提交順序（00 §5.4 第 1 步）。
- 佇列同時抄錄到 command log（重放與 golden test 用，▷ plan/03、17）。

#### 3.4.4 publishTick 與 renderer 訂閱

```ts
// src/app/bridge.ts
export function runOneDay(): GameEvent[] {
  const game = store.getState().game!;
  const commands = pendingQueue.splice(0);
  const t0 = performance.now();
  const events = advanceDay(game, commands);       // core：就地變異 game
  perfMonitor.recordTick(performance.now() - t0);  // §3.9.4
  if (import.meta.env.DEV || debugFlags.enabled) checkInvariants(game); // §3.10.4
  store.setState((s) => ({ tickSeq: s.tickSeq + 1,
    session: { ...s.session, pendingCommandCount: 0 } }));
  evaluateAutoPause(events);                       // §3.5.3
  return events;
}
```

`MapRenderer` **不經 React** 訂閱：`store.subscribe` 監看 `tickSeq` 變化即 `markDirty()`，
於自己的 render frame 內直接讀 `store.getState().game` 增量更新顯示物件（§3.6.1）。

### 3.5 遊戲迴圈與 React 整合

#### 3.5.1 責任劃分

- `gameLoop.ts` 持有唯一的 `requestAnimationFrame` 迴圈（不用 Pixi ticker 驅動邏輯；
  Pixi 只管畫，見 §3.6.1），實作 `GameLoopController`（§4.2）。
- React 不驅動時間；HUD 的速度按鈕只呼叫 `loop.setSpeed(...)`，並從 `session.speed` 讀取顯示。
- 合戰與歷史事件 modal 開啟時，策略層時間暫停（00 §5.3）：開 modal 的 action 一律呼叫
  `loop.requestPause('modalOpen')`；合戰在 modal 內以自己的子迴圈跑（▷ plan/07）。

#### 3.5.2 累加器規格

演算法見 §5.1。要點：

- 每日毫秒數依速度檔位：`BAL.uiDayMsX1 = 600`、`BAL.uiDayMsX2 = 300`、`BAL.uiDayMsX5 = 120`
  （00 §5.2 canonical 值）。
- 單幀 `dt` 上限 `BAL.uiFrameDtCapMs = 250`：防止分頁切回、GC 停頓後的補跑暴衝。
- 單幀最多結算 `BAL.uiMaxTicksPerFrame = 4` 個 tick；仍有積欠則**丟棄**多餘累積
  （夾到一日毫秒數），寧可時間變慢也不進死亡螺旋。
- 暫停時累加器歸零，避免恢復瞬間補跑。

#### 3.5.3 暫停、變速與自動暫停

- 速度檔位：`'paused' | 'x1' | 'x2' | 'x5'`（型別 `GameSpeed`）。`setSpeed` 只改 `session.speed`
  與內部檔位；切換不重置累加器（暫停除外）。
- 自動暫停有兩個來源：
  1. **core 事件**：`runOneDay` 回傳的 `GameEvent[]` 交給 `autoPause.ts`，
     依玩家設定（▷ plan/16）比對 00 §5.2 清單（我方城被圍、合戰可發動、具申送達、
     外交來使、歷史事件、月初）。命中即 `requestPause(reason)` 並發 HUD 通知。
  2. **頁面失焦**：監聽 `document.visibilitychange`，`document.hidden === true` 時
     `requestPause('windowHidden')`。**恢復可見時不自動續跑**，HUD 顯示
     `ui.hud.autoPausedHidden` 與「繼續」按鈕（理由見 §8 決策 D4）。
- `requestPause(reason)`：設 `session.speed = 'paused'`、記錄 `session.lastPauseReason`、
  記住暫停前檔位 `resumeSpeed`；`resume()` 恢復 `resumeSpeed`。
- 玩家手動暫停（空白鍵）與自動暫停共用同一機制，`reason: 'user'`。

### 3.6 PixiJS 與 React 共存模式

#### 3.6.1 imperative renderer

- 全畫面**單一** canvas，由 `MapRenderer`（純 class，非 React）持有
  `Application`。初始化：

```ts
await app.init({
  resizeTo: hostElement,
  resolution: Math.min(window.devicePixelRatio, BAL.uiDprMax /* = 2 */),
  autoDensity: true,           // CSS 尺寸與實際像素解耦
  antialias: true,
  preference: 'webgl',
  background: /* tokens 由 plan/12 定義 */,
});
```

- 場景圖分固定圖層（stage 子容器，順序固定）：`baseMap`（日本輪廓＋國界，靜態，
  `cacheAsTexture()`）→ `territory`（勢力塗色）→ `roads` → `nodes`（城／郡標記）→
  `armies`（移動部隊）→ `effects`（威風波紋等）→ `debugOverlay`。各圖層內容規格 ▷ `plan/04`。
- **資料流入**：renderer 以 `store.subscribe` 監看 `tickSeq` 與 `session.selection`，設 dirty 旗標；
  在 `app.ticker` 每幀檢查：dirty 才做增量同步（diff by id：新增／移除／更新 sprite），
  沒 dirty 且鏡頭靜止時跳過同步（渲染仍由 Pixi 決定）。
- **事件流出**：Pixi `eventMode: 'static'` 的節點 pointer 事件 → renderer 轉成
  `MapRendererEvents`（§4.3）呼叫掛載時注入的 callback → callback 內呼叫
  `store.actions.select(...)` 或開啟面板。renderer 不 import store 的 action 型別以外的 UI 模組。
- **鏡頭**：縮放／平移狀態存活在 `camera.ts`（renderer 內部），**不進 store**（每幀變動會打爆
  React 訂閱；見 §8 決策 D5）。UI 需要「鏡頭跳到某城」時呼叫 `renderer.focusNode(nodeId)`。

#### 3.6.2 React 掛載（MapCanvasHost）

```tsx
// src/ui/map/MapCanvasHost.tsx
export function MapCanvasHost(props: { onMapEvent: (e: MapRendererEvent) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    const renderer = new MapRenderer();
    void renderer.init(hostRef.current!, props.onMapEvent).then(() => {
      if (disposed) renderer.destroy();   // StrictMode 雙掛載防護：init 完成前已卸載則直接銷毀
    });
    return () => { disposed = true; renderer.destroy(); };
  }, []);
  return <div ref={hostRef} className={styles.canvasHost} />;
}
```

- `renderer.destroy()` 必須冪等（可安全重複呼叫），內部銷毀 Pixi Application 與所有 texture。
- **HTML overlay**：`App.tsx` 的 layout 是
  `canvasHost（position:fixed; inset:0）` 之上疊 `overlay（pointer-events:none）`，
  各 HUD／面板容器自行 `pointer-events:auto`。畫面佈局 ▷ `plan/11`。
- **resize**：交給 Pixi `resizeTo: hostElement`（內建 ResizeObserver）；renderer 另監聽
  `app.renderer.on('resize', ...)` 以重算鏡頭夾限。`devicePixelRatio` 變動（拖到不同螢幕）：
  監聽 `matchMedia('(resolution: ...)')` 變化，重設 `renderer.resolution` 後強制重繪一次。

### 3.7 工具鏈設定

#### 3.7.1 tsconfig

`tsconfig.json`（全案）：

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "useDefineForClassFields": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@core/*": ["src/core/*"],
      "@data/*": ["src/data/*"],
      "@ui/*":   ["src/ui/*"],
      "@app/*":  ["src/app/*"],
      "@i18n/*": ["src/i18n/*"]
    }
  },
  "include": ["src", "tools", "tests", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`tsconfig.core.json`（core／data 純度的型別級把關；CI 與 `npm run typecheck` 皆執行）：

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],          // 無 DOM：core 內引用 window/document 直接 typecheck 失敗
    "types": []                 // 亦排除 vite/client 的 DOM 相依型別
  },
  "include": ["src/core", "src/data"]
}
```

#### 3.7.2 Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',        // GH Pages 子路徑由 CI 注入（§3.8.2）
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@ui':   fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@app':  fileURLToPath(new URL('./src/app', import.meta.url)),
      '@i18n': fileURLToPath(new URL('./src/i18n', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pixi': ['pixi.js'],
        },
      },
    },
  },
});
```

- 劇本資料**不**進主 bundle：`boot.ts` 以 `await import('@data/scenarios/s1560/index.ts')`
  動態載入（Vite 自動 code-split），標題畫面先渲染、劇本背景載入（§3.9.3）。
- 本專案無 URL 路由（單頁、畫面切換為 store 狀態），GH Pages 不需 404 fallback hack。

#### 3.7.3 ESLint（flat config）與 import 邊界

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },

  // React 規則只作用於 ui/app
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
    },
  },

  // ── 邊界規則 1：core 與 data 的純度 ──
  {
    files: ['src/core/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'core/data 不得依賴 React。' },
          { group: ['pixi.js', '@pixi/*'],                            message: 'core/data 不得依賴 PixiJS。' },
          { group: ['zustand', 'zustand/*'],                          message: 'core/data 不得依賴 Zustand；狀態橋接屬 app 層。' },
          { group: ['idb-keyval'],                                    message: '儲存 IO 屬 app 層（src/app/persistence.ts）。' },
          { group: ['@ui/*', '@app/*', '@i18n/*', '**/ui/**', '**/app/**', '**/i18n/**'],
            message: 'core/data 不得 import UI／app／i18n 層。' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'window',   message: 'core 禁用 DOM 全域。' },
        { name: 'document', message: 'core 禁用 DOM 全域。' },
        { name: 'navigator', message: 'core 禁用 BOM 全域。' },
        { name: 'localStorage', message: 'core 禁止直接 IO。' },
        { name: 'requestAnimationFrame', message: '迴圈驅動屬 app 層。' },
        { name: 'setTimeout', message: 'core 必須是同步純函式。' },
        { name: 'setInterval', message: 'core 必須是同步純函式。' },
        { name: 'fetch', message: 'core 禁止網路 IO。' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: '用 core/rng.ts（00 §5.5）。' },
        { object: 'Date', property: 'now',    message: '用 state.time（00 §5.5）。' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date']", message: '用 state.time（00 §5.5）。' },
      ],
    },
  },
  // 例外：core/save 允許 lz-string（§3.1 第 6 條）——以覆蓋順序後置放行
  {
    files: ['src/core/save/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [ /* 同上，但不含 lz-string；React/Pixi/Zustand/idb-keyval/UI 禁令照舊 */ ],
      }],
    },
  },

  // ── 邊界規則 2：ui 不碰 core 內部與 IO ──
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@core/systems/*', '@core/systems/**', '@core/commands/apply'],
            message: 'UI 只能用 core 公開 API（@core/index、selectors、型別）。' },
          { group: ['idb-keyval'], message: '存檔 IO 走 app 層。' },
          { group: ['zustand/vanilla'], message: 'UI 經 hooks 訂閱，不直接建 store。' },
        ],
      }],
    },
  },

  // ── 邊界規則 3：i18n 零依賴 ──
  {
    files: ['src/i18n/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['*'], message: 'i18n 不得 import 任何模組。' }] }],
    },
  },
);
```

（`src/core/save/**` 的覆蓋塊需完整重列 patterns 陣列；flat config 的 rule 覆蓋是整條取代。）

#### 3.7.4 Prettier

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

#### 3.7.5 package.json scripts（canonical；CI 與文件引用以此為準）

```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.core.json --noEmit",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "npm run build && playwright test",
    "validate:data": "tsx tools/validate.ts && tsx tools/scan-simplified.ts && tsx tools/check-font-coverage.ts",
    "font:subset": "tsx tools/subset-font.ts"
  }
}
```

#### 3.7.6 Playwright 設定

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

smoke 測試內容與斷言 ▷ `plan/17`。

### 3.8 CI 與部署

#### 3.8.1 CI workflow（`.github/workflows/ci.yml`）

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run validate:data
      - run: npm run test
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist, retention-days: 7 }

  e2e-smoke:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report, retention-days: 7 }
```

#### 3.8.2 部署 workflow（`.github/workflows/deploy.yml`）

GitHub Pages 以「repo 名」為子路徑（`https://<user>.github.io/<repo>/`），
故建置時把 `VITE_BASE` 設成 `/<repo>/`，`vite.config.ts` 讀取（§3.7.2）。
repo 名由 GitHub context 取得，改 repo 名不需改 yaml。

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          VITE_BASE: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

前置設定（一次性、寫入 README）：repo Settings → Pages → Source 選「GitHub Actions」。

### 3.9 效能預算與達成手段

#### 3.9.1 預算表（M9 驗證，量測法 ▷ plan/17）

| 項目 | 預算 | 常數 | 量測情境 |
|---|---|---|---|
| 地圖幀率 | ≥ 60 fps | `BAL.perfFpsTarget = 60` | 全國視野、×5 速度、40 支部隊行軍中 |
| 每日 tick | < 8 ms（95 百分位） | `BAL.perfTickBudgetMs = 8` | s1560 全資料、遊戲中期（20+ 勢力存活） |
| 初次載入 | < 3000 ms（可互動） | `BAL.perfInitialLoadBudgetMs = 3000` | 冷快取、Fast 4G throttling、GH Pages |
| 初始 JS（gzip） | ≤ 800 KB | `BAL.perfMainBundleKb = 800` | vite build 產物（三個 chunk 合計） |
| 劇本 JSON（gzip） | ≤ 1200 KB | `BAL.perfScenarioKb = 1200` | s1560 動態載入 chunk |
| 子集字型 | ≤ 2048 KB | `BAL.perfFontKb = 2048` | woff2，`font-display: swap` 不擋互動 |

#### 3.9.2 tick 效能手段（core）

- `GameState` 頂層集合採 `Map<Id, Entity>`（O(1) 查找；02 定案結構），
  另建唯讀反向索引（如 `castleId → districtIds`）於 build 時產生、於歸屬變更時增量維護。
- 就地變異、tick 內零大型複製；禁止在每日系統內做全實體排序／全圖掃描——
  月結系統（收入、忠誠、AI 評定）以日期 guard 提前 return（00 §5.4 順序不變）。
- 每個系統以 `performance.mark/measure` 打點（僅 dev／debug 開啟時），除錯面板顯示分項耗時。

#### 3.9.3 載入效能手段

- 三段式載入：主 bundle（React＋UI）→ 標題畫面可互動 → 背景 `import()` Pixi chunk 與劇本 chunk。
  「可互動」定義為標題畫面按鈕可點擊。
- 字型子集化：`tools/subset-font.ts`（devDependency `subset-font`）掃描
  `src/i18n/zh-TW.ts` 全字串＋ `src/data/scenarios/**/*.json` 全 `name` 欄位＋數字標點集，
  由 `tools/assets/NotoSerifTC-Regular.otf` 產出 `public/fonts/noto-serif-tc-subset.woff2`。
  成品 commit 進 repo；字串或劇本大改後手動重跑 `npm run font:subset`（CI 的
  `validate:data` 檢查子集涵蓋率，缺字即 fail，▷ plan/17）。
- `index.html` 對字型 `<link rel="preload" as="font" crossorigin>`。

#### 3.9.4 渲染效能手段（ui/map）

- 靜態圖層（`baseMap`）`cacheAsTexture()`；勢力塗色層只在領土歸屬變更事件後重繪。
- 視野剔除：郡標記與文字標籤僅在可視矩形（外擴 10%）內存在 display object；
  縮小到全國視野時標籤依 LOD 淘汰（▷ 門檻常數 plan/04）。
- 文字用 `Text` 物件池＋按內容快取，不逐幀重建；不使用 CJK BitmapFont（字集過大）。
- `resolution` 上限 `BAL.uiDprMax = 2`。
- 暫停且鏡頭靜止 ≥ 1 秒時，將 `app.ticker.maxFPS` 降到 `BAL.uiIdleFps = 10`；
  任何輸入或恢復播放即還原 60。
- `perfMonitor`（`src/app/` 內建小工具）維護最近 120 幀 fps 與最近 60 tick 耗時的環形緩衝，
  供除錯面板讀取。

### 3.10 錯誤處理與 log 策略

#### 3.10.1 core 的錯誤分類

- **遊戲規則內的失敗不是錯誤**：Command 不合法、行動失敗，一律以
  `CommandDispatchResult`／`Report` 表達（▷ plan/03），core 不拋例外。
- **例外只用於缺陷**：`CoreError`（§4.4）四種 code——
  `INVALID_COMMAND_SHAPE`（收到型別畸形的 Command，屬呼叫端 bug）、
  `DATA_INTEGRITY`（懸空 id 參照、找不到實體）、
  `SAVE_VERSION`（存檔版本不可遷移，▷ plan/16）、
  `INVARIANT_VIOLATION`（§3.10.4 檢查失敗）。

#### 3.10.2 UI 的錯誤攔截

- `App.tsx` 最外層一個 React class `ErrorBoundary`：攔截渲染例外 →
  `loop.stop()` → 顯示致命錯誤畫面（字串見 §6.2）。
- `runOneDay` 以 try/catch 包住 `advanceDay`：捕獲 `CoreError` → `loop.stop()` →
  `session.fatalError = { code, message, stack }` → 同一致命錯誤畫面。
- 致命錯誤畫面提供：「匯出存檔」（以錯誤發生**前**最後一次自動快照序列化下載，
  快照機制 ▷ plan/16）、「重新載入」（`location.reload()`）、可展開的錯誤詳情（code＋stack）。
- dev 模式（`import.meta.env.DEV`）下錯誤同時 `console.error` 原樣拋出堆疊。

#### 3.10.3 log 策略

- `core/log.ts` 定義注入式介面，core 內以 `log.debug('battle', ...)` 打點，**預設 no-op**：

```ts
export interface CoreLogger {
  debug(tag: LogTag, msg: string, data?: unknown): void;
  info(tag: LogTag, msg: string, data?: unknown): void;
  warn(tag: LogTag, msg: string, data?: unknown): void;
}
export type LogTag = 'time' | 'economy' | 'dev' | 'military' | 'battle' | 'siege'
  | 'diplomacy' | 'officers' | 'proposals' | 'ai' | 'events' | 'save' | 'rng';
export function setLogger(l: CoreLogger): void; // app 層於 boot 時注入
```

- app 層注入的實作：prod 只轉發 `warn` 到 `console.warn`；dev／debug 模式依 URL 參數
  `?log=battle,ai`（逗號分隔 tag 白名單；`?log=all` 全開）轉發到 console，前綴 `[tag]`。
- log 是診斷用旁路，**不影響狀態**；golden test 以 no-op logger 執行（▷ plan/17）。

#### 3.10.4 不變量檢查（dev 安全網）

`core/state/invariants.ts` 匯出 `checkInvariants(state): void`，違反即擲
`CoreError('INVARIANT_VIOLATION', ...)`。檢查清單由 `plan/02` 定義（如：金錢／兵糧／兵力非負、
id 參照皆存在、部隊 path 節點相鄰）。只在 dev 或 `?debug=1` 時於每 tick 後執行（§3.4.4），
prod 常規遊玩不付此成本。

### 3.11 開發者除錯工具

#### 3.11.1 URL 參數開關（`src/app/debug.ts` 於 boot 前解析）

| 參數 | 型別／值 | 效果 |
|---|---|---|
| `?debug=1` | boolean | 啟用除錯模式：debug Command 合法化、面板快捷鍵、不變量檢查、效能打點 |
| `?seed=12345` | number | 覆蓋新局亂數種子（未給則隨機；種子顯示於除錯面板） |
| `?scenario=s1560` | string | 指定劇本 id（v1.0 只有 s1560） |
| `?speed=x5` | GameSpeed | 開局預設速度檔位 |
| `?skipTitle=1` | boolean | 跳過標題直接以預設勢力開新局（e2e 與開發迭代用） |
| `?log=battle,ai` | string | log tag 白名單（§3.10.3）；`all` 全開 |

`debugFlags.enabled === false` 時：debug 面板不掛載、`debug.*` Command 一律被驗證器拒絕、
`window.__TENKA_DEBUG__` 不安裝。

#### 3.11.2 除錯面板（`src/ui/debug/DebugPanel.tsx`）

- 開關：反引號鍵（`` ` ``）或 HUD 隱藏按鈕；浮動於畫面右側，HTML overlay 一部分。
- 區塊與功能：
  1. **時間**：按鈕「+7日」「+30日」「+180日」「+360日」＋自訂天數輸入 → `loop.stepDays(n)`
     （同步快進演算法見 §5.4；快進中顯示進度條並鎖輸入）。
  2. **資源作弊**：「金錢 +10,000貫」（玩家勢力）；「兵糧 +10,000石」「兵力 +1,000人」
     （需先在地圖選取一座我方城，未選取則按鈕停用並顯示 `ui.debug.needCastleSelected`）。
     一律經 `dispatchCommand` 送 `debug.*` Command（§3.11.3）。
  3. **AI 意圖**：checkbox → `renderer.setDebugOverlay({ aiIntent: true })`；
     地圖上每個 AI 勢力本城旁顯示其當前戰略意圖摘要文字與目標連線
     （資料來源：AI 狀態的公開 selector，▷ plan/09）。
  4. **尋路**：checkbox 開啟後，在地圖依序點兩個節點 → 呼叫 core 尋路 selector
     （▷ plan/04）→ `debugOverlay` 畫出路徑折線與總成本標籤；再點一次清除。
  5. **狀態檢視器**：`StateViewer.tsx` 唯讀 JSON 樹（lazy 展開，每節點展開時才讀取，
     避免序列化整棵 state）；附「複製此節點 JSON」。
  6. **效能**：fps、上一 tick ms、近 60 tick 平均／最大 ms、各系統分項耗時（§3.9.2）、
     實體數（城／郡／武將／部隊）、目前種子與 `tickSeq`。

#### 3.11.3 debug Command（由本文件定義；納入 plan/03 的 Command 聯集）

```ts
type DebugCommand =
  | { type: 'debug.addGold';  clanId: ClanId;   amount: number }   // 貫；amount 建議 10000
  | { type: 'debug.addFood';  castleId: CastleId; amount: number } // 石；建議 10000
  | { type: 'debug.addTroops'; castleId: CastleId; amount: number }; // 人；建議 1000；受城兵力上限夾限
```

驗證規則：`state.debugEnabled === true`（boot 時由 URL 參數寫入 state，存檔會保留此旗標）
才合法。debug Command 與一般 Command 同樣進 command log，**重放時可完整重現**，
不破壞決定論（§8 決策 D6）。

#### 3.11.4 console API（`window.__TENKA_DEBUG__`）

```ts
interface TenkaDebugApi {
  getState(): GameState;                       // 直接參考（唯讀約定，僅供檢查）
  dispatch(cmd: Command): CommandDispatchResult;
  stepDays(n: number): void;
  setSpeed(s: GameSpeed): void;
  getSeed(): number;
  getPerf(): PerfSnapshot;                     // §4.6
}
```

僅 `debugFlags.enabled` 時安裝；Playwright smoke 亦透過此 API 斷言（▷ plan/17）。

---

## 4. 資料結構

本節只含架構層型別；遊戲實體型別一律 ▷ `plan/02`。

### 4.1 GameStore（`src/app/store.ts`）

```ts
import type { GameState, Command, GameEvent } from '@core/index';

/** 速度檔位；'paused' 之外對應 00 §5.2 的三檔 */
export type GameSpeed = 'paused' | 'x1' | 'x2' | 'x5';

/** 自動暫停原因（00 §5.2 清單＋架構層原因） */
export type PauseReason =
  | 'user'             // 玩家手動（空白鍵／按鈕）
  | 'castleBesieged'   // 我方城被圍
  | 'battleOffer'      // 合戰可發動
  | 'proposalArrived'  // 具申送達
  | 'diploEnvoy'       // 外交來使
  | 'historicalEvent'  // 歷史事件
  | 'monthStart'       // 月初
  | 'windowHidden'     // 頁面失焦（visibilitychange）
  | 'modalOpen'        // 合戰／事件 modal 開啟（00 §5.3）
  | 'fatalError';      // CoreError 捕獲

/** 地圖選取（單選；kind 決定 id 的實體型別） */
export interface Selection {
  kind: 'castle' | 'district' | 'army' | 'none';
  id: string | null;                 // kind='none' 時為 null
}

/** 純 UI 執行期狀態（不進存檔） */
export interface SessionState {
  screen: ScreenId;                  // 目前畫面 id（清單 ▷ plan/11）
  speed: GameSpeed;                  // 目前檔位（含 'paused'）
  resumeSpeed: Exclude<GameSpeed, 'paused'>; // 恢復播放時回到的檔位
  lastPauseReason: PauseReason | null;
  selection: Selection;
  openModal: ModalDescriptor | null; // modal 種類與參數（▷ plan/11）
  pendingCommandCount: number;       // 佇列中未結算 Command 數（HUD 顯示）
  fatalError: { code: string; message: string; stack: string } | null;
  debug: DebugSessionState;          // §4.5 的執行期部分（overlay 開關等）
}

export interface GameStore {
  game: GameState | null;            // boot 完成前為 null；boot 後由 bridge 獨佔寫入
  tickSeq: number;                   // 每次 publishTick +1；selector 重跑的訊號
  session: SessionState;
  actions: SessionActions;           // 只操作 session slice 的函式集
}
```

### 4.2 GameLoopController（`src/app/gameLoop.ts`）

```ts
export interface GameLoopController {
  start(): void;                       // 掛上 rAF；重複呼叫為 no-op
  stop(): void;                        // 卸下 rAF（致命錯誤／回標題時）
  setSpeed(speed: GameSpeed): void;    // 含 'paused'；同步更新 session.speed
  requestPause(reason: PauseReason): void; // 冪等；記錄 reason 並暫停
  resume(): void;                      // 回到 resumeSpeed
  stepDays(n: number): void;           // debug 同步快進（§5.4）；n ≥ 1 整數
  isRunning(): boolean;
}
```

### 4.3 MapRenderer 契約（`src/ui/map/MapRenderer.ts`）

```ts
/** renderer 對外事件（React 世界經 MapCanvasHost 注入 handler） */
export type MapRendererEvent =
  | { type: 'nodeClick';  nodeKind: 'castle' | 'district'; id: string }
  | { type: 'armyClick';  id: string }
  | { type: 'emptyClick' }                          // 點空白處 → 清除選取
  | { type: 'nodeHover';  nodeKind: 'castle' | 'district'; id: string | null }
  | { type: 'pathPick';   nodeId: string };          // 尋路除錯模式下的節點揀選

export interface DebugOverlayFlags {
  aiIntent: boolean;      // 顯示 AI 意圖標籤與目標連線
  pathfinding: boolean;   // 顯示尋路揀選與結果路徑
}

export interface MapRenderer {
  /** 建立 Pixi Application、載入圖層、開始訂閱 store；host 為滿版容器 div */
  init(host: HTMLElement, onEvent: (e: MapRendererEvent) => void): Promise<void>;
  focusNode(nodeId: string): void;              // 鏡頭平滑移至節點（UI「前往」按鈕用）
  setDebugOverlay(flags: Partial<DebugOverlayFlags>): void;
  showDebugPath(path: string[] | null, costLabel: string | null): void; // 尋路結果（null 清除）
  destroy(): void;                              // 冪等；銷毀 Pixi 與訂閱
}
```

### 4.4 CoreError（`src/core/errors.ts`）

```ts
export type CoreErrorCode =
  | 'INVALID_COMMAND_SHAPE'   // Command 物件畸形（呼叫端 bug，非規則拒絕）
  | 'DATA_INTEGRITY'          // 懸空 id、實體缺失、劇本資料矛盾
  | 'SAVE_VERSION'            // 存檔版本無法遷移（▷ plan/16）
  | 'INVARIANT_VIOLATION';    // invariants.ts 檢查失敗

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details?: unknown;   // 診斷附帶資料（實體 id 等）；不得含循環參照
  constructor(code: CoreErrorCode, message: string, details?: unknown);
}
```

### 4.5 CommandDispatchResult 與 DebugFlags

```ts
/** dispatchCommand 的同步預檢結果；拒絕原因枚舉全集 ▷ plan/03 */
export type CommandDispatchResult =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };  // UI 以 t(`cmd.reject.${reason}`) 顯示

/** URL 參數解析結果（boot 前產生，執行期唯讀） */
export interface DebugFlags {
  enabled: boolean;             // ?debug=1
  seed: number | null;          // ?seed=N（null＝隨機）
  scenario: string;             // ?scenario=…；預設 's1560'
  initialSpeed: GameSpeed;      // ?speed=…；預設 'paused'
  skipTitle: boolean;           // ?skipTitle=1
  logTags: LogTag[] | 'all' | null; // ?log=…
}

/** session.debug：除錯面板的執行期狀態 */
export interface DebugSessionState {
  panelOpen: boolean;
  overlay: DebugOverlayFlags;
  pathPickBuffer: string[];     // 尋路模式已揀選的節點（0..2 個）
  jumping: { totalDays: number; doneDays: number } | null; // stepDays 進度；null＝未快進
}
```

### 4.6 PerfSnapshot（`src/app/` perfMonitor）

```ts
export interface PerfSnapshot {
  fps: number;                  // 最近 120 幀平均
  lastTickMs: number;           // 上一 tick 耗時
  avgTickMs: number;            // 最近 60 tick 平均
  maxTickMs: number;            // 最近 60 tick 最大
  systemBreakdownMs: Record<string, number>; // 各系統上一 tick 分項（debug 模式才有值）
  entityCounts: { castles: number; districts: number; officers: number; armies: number };
}
```

---

## 5. 演算法與公式

本節常數建議初值：`BAL.uiDayMsX1 = 600`、`BAL.uiDayMsX2 = 300`、`BAL.uiDayMsX5 = 120`
（00 §5.2 canonical）、`BAL.uiFrameDtCapMs = 250`、`BAL.uiMaxTicksPerFrame = 4`、
`BAL.uiDprMax = 2`、`BAL.uiIdleFps = 10`、`BAL.uiJumpChunkDays = 30`、
`BAL.perfTickBudgetMs = 8`、`BAL.perfFpsTarget = 60`、`BAL.perfInitialLoadBudgetMs = 3000`、
`BAL.perfMainBundleKb = 800`、`BAL.perfScenarioKb = 1200`、`BAL.perfFontKb = 2048`。
（最終值以 `plan/15` 主表為準。）

### 5.1 rAF 累加器（gameLoop.ts）

```
狀態：accumulatorMs = 0, lastFrameTs = null, rafId = null

onFrame(now):
  1. rafId = requestAnimationFrame(onFrame)          // 先排下一幀
  2. if lastFrameTs == null: lastFrameTs = now; return
  3. dt = min(now - lastFrameTs, BAL.uiFrameDtCapMs) // 夾限：切回分頁不暴衝
     lastFrameTs = now
  4. speed = session.speed
     if speed == 'paused': accumulatorMs = 0; return
  5. dayMs = { x1: BAL.uiDayMsX1, x2: BAL.uiDayMsX2, x5: BAL.uiDayMsX5 }[speed]
  6. accumulatorMs += dt
     ticks = 0
  7. while accumulatorMs >= dayMs AND ticks < BAL.uiMaxTicksPerFrame
        AND session.speed != 'paused':               // tick 可能觸發自動暫停，須逐次重查
       runOneDay()                                    // §3.4.4；含 publishTick 與自動暫停判定
       accumulatorMs -= dayMs
       ticks += 1
  8. if accumulatorMs > dayMs: accumulatorMs = dayMs  // 丟棄積欠，避免死亡螺旋
```

邊界條件：

- `setSpeed('paused')` 與 `requestPause` 立即生效於第 7 步的迴圈條件（同幀不再多跑）。
- `stop()` 呼叫 `cancelAnimationFrame(rafId)` 並清空累加器與 `lastFrameTs`。
- 變速（x1→x5）不清空累加器：殘餘毫秒以新檔位換算，最多提早一日，無感知問題。

### 5.2 每 tick 橋接流程（bridge.runOneDay）

```
runOneDay():
  1. game = store.game（null 則 CoreError('DATA_INTEGRITY')）
  2. commands = pendingQueue.splice(0)               // 取走全部；順序＝提交順序
  3. commandLog.append(day, commands)                // 重放紀錄（▷ plan/03）
  4. t0 = performance.now()
  5. events = core.advanceDay(game, commands)        // 00 §5.4 十三步；就地變異
  6. perfMonitor.recordTick(performance.now() - t0)
  7. if devMode or debugFlags.enabled: checkInvariants(game)
  8. store.set({ tickSeq: +1, session.pendingCommandCount: 0 })
  9. evaluateAutoPause(events)                       // 命中設定的事件 → loop.requestPause(reason)
                                                     //   並由通知系統顯示（▷ plan/11 通知列）
```

### 5.3 帶版本快取的彙總 selector

供 UI 訂閱 O(n) 彙總值（如勢力總石高）而不逐 tick 重算：

```
makeCachedSelector(compute):
  cache = { seq: -1, args: null, value: null }
  return (game, tickSeq, ...args):
    if tickSeq == cache.seq AND shallowEqual(args, cache.args): return cache.value
    cache = { seq: tickSeq, args, value: compute(game, ...args) }
    return cache.value
```

`useGameSelector` 的變體 `useCachedGameSelector` 自動代入目前 `tickSeq`。
core 內 AI 若需同類彙總，直接呼叫 `compute`（core 無 tickSeq 概念，快取屬 app/ui 層包裝）。

### 5.4 debug 時間跳轉（stepDays）

同步快進但分塊讓出主執行緒，UI 顯示進度：

```
stepDays(n):
  1. if n < 1 或非整數 或 jumping != null 或 fatalError != null: return
  2. requestPause('user')；session.debug.jumping = { totalDays: n, doneDays: 0 }
  3. loopChunk():
       repeat min(BAL.uiJumpChunkDays, 剩餘天數) 次:
         runOneDay()
         若觸發 fatalError: 中止快進
       session.debug.jumping.doneDays += 本塊實跑天數
       if doneDays < totalDays: setTimeout(loopChunk, 0)   // 讓瀏覽器繪製進度條
       else: session.debug.jumping = null                  // 完成；維持暫停
```

快進期間自動暫停事件**不**中斷快進（僅記入通知），`fatalError` 例外。

### 5.5 resize 與 devicePixelRatio 處理

```
init 時：
  1. app.init({ resizeTo: host, resolution: min(devicePixelRatio, BAL.uiDprMax), autoDensity: true })
  2. app.renderer.on('resize', (w, h) => camera.clampToBounds(w, h))
  3. mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
     mq.addEventListener('change', onDprChange, { once: true })

onDprChange():
  1. app.renderer.resolution = min(window.devicePixelRatio, BAL.uiDprMax)
  2. app.renderer.resize(host.clientWidth, host.clientHeight)
  3. 重新註冊 matchMedia（新 dpr 值、once: true）
```

---

## 6. UI/UX

本文件僅定義架構層 UI（致命錯誤畫面、自動暫停提示、除錯面板）；
其餘畫面 ▷ `plan/11`、元件 ▷ `plan/12`。以下字串為 `plan/13` 主表的一部分。

### 6.1 佈局原則

- 根層：`MapCanvasHost`（`position: fixed; inset: 0`）＋ HTML overlay（`pointer-events: none`，
  子面板各自 `pointer-events: auto`）。
- 除錯面板：右側固定寬 320px 浮動欄，`z-index` 高於一般面板、低於 modal 與致命錯誤畫面。
- 致命錯誤畫面：全螢幕不可關閉遮罩，置於最頂層。

### 6.2 繁中字串表

| key | 字串 |
|---|---|
| `ui.error.title` | `發生未預期的錯誤` |
| `ui.error.body` | `遊戲遇到無法復原的錯誤，時間已停止。你可以匯出最近的進度存檔，重新載入頁面後讀取。` |
| `ui.error.detail` | `錯誤詳情` |
| `ui.error.export` | `匯出存檔` |
| `ui.error.reload` | `重新載入` |
| `ui.hud.autoPausedHidden` | `視窗切換至背景，遊戲已自動暫停` |
| `ui.hud.pausedBy.user` | `已暫停` |
| `ui.hud.resume` | `繼續` |
| `ui.hud.pendingCommands` | `待執行指令：{count}件` |
| `ui.debug.title` | `除錯面板` |
| `ui.debug.section.time` | `時間` |
| `ui.debug.jumpDays` | `快進{days}日` |
| `ui.debug.jumpCustom` | `自訂天數` |
| `ui.debug.jumpProgress` | `快進中……{done}／{total}日` |
| `ui.debug.section.cheat` | `資源作弊` |
| `ui.debug.addGold` | `金錢 +{amount}貫` |
| `ui.debug.addFood` | `兵糧 +{amount}石（選定城）` |
| `ui.debug.addTroops` | `兵力 +{amount}人（選定城）` |
| `ui.debug.needCastleSelected` | `請先在地圖選取一座我方城` |
| `ui.debug.section.ai` | `AI` |
| `ui.debug.showAiIntent` | `顯示 AI 意圖` |
| `ui.debug.section.path` | `尋路` |
| `ui.debug.showPathfinding` | `顯示尋路（依序點選兩個節點）` |
| `ui.debug.pathCost` | `路徑成本：{cost}` |
| `ui.debug.section.state` | `狀態檢視器` |
| `ui.debug.copyNode` | `複製此節點 JSON` |
| `ui.debug.section.perf` | `效能` |
| `ui.debug.perfFps` | `幀率：{fps}` |
| `ui.debug.perfTick` | `上一tick：{ms}ms（平均{avg}ms／最大{max}ms）` |
| `ui.debug.perfSeed` | `種子：{seed}` |

### 6.3 互動細節

- 空白鍵：暫停⇄繼續（`resume()`／`requestPause('user')`）。數字鍵 1／2／3：×1／×2／×5。
  反引號：除錯面板（僅 debug 模式）。快捷鍵在輸入框聚焦時停用。
- 自動暫停時，HUD 速度列閃爍一次並顯示原因 tooltip（原因字串 key ▷ plan/13 的
  `ui.hud.pausedBy.*` 系列，13 補齊全部 reason）。
- 致命錯誤畫面的「匯出存檔」按下後以 `<a download>` 觸發檔案下載，檔名
  `tenka-fubu-crash-{ISO日期}.sav`（格式 ▷ plan/16）。

---

## 7. 實作任務清單

對應里程碑見 `plan/18`（多數屬 M0；A7–A9 屬 M1；A10 屬 M2）。

- [ ] **A1 專案鷹架**：Vite＋React＋TS 專案建立，§3.3 目錄骨架（空檔含職責註解）、
      §3.7 全部設定檔、`npm run dev` 顯示空白 App。
      驗收：`dev`／`build`／`typecheck`／`lint`／`test`（空測試）全部通過。
- [ ] **A2 tsconfig.core.json 把關**：驗收：在 `src/core/` 任一檔寫 `window.alert('')`，
      `npm run typecheck` 失敗；移除後通過。
- [ ] **A3 ESLint 邊界規則**：§3.7.3 全部規則生效。
      驗收：在 `src/core/` 寫 `import React from 'react'`、`Math.random()`、`new Date()`
      各得到對應 lint error；`src/core/save/` import `lz-string` 不報錯；
      `src/ui/` import `@core/systems/economy` 報錯。
- [ ] **A4 CI workflow**：§3.8.1 的 `ci.yml` 上線。
      驗收：PR 觸發 verify＋e2e-smoke 兩 job，任一步驟失敗則紅燈。
- [ ] **A5 部署 workflow**：§3.8.2 的 `deploy.yml` 上線，Pages Source 設為 GitHub Actions。
      驗收：push main 後 `https://<user>.github.io/<repo>/` 可開啟且資產路徑正確（無 404）。
- [ ] **A6 store 與橋接**：`store.ts`＋`bridge.ts`（§3.4；含 `useGameSelector`、
      `useCachedGameSelector`、`dispatchCommand`、`runOneDay`）。
      驗收：Vitest——dispatch 合法 Command 後佇列長度 +1；`runOneDay` 後 `tickSeq` +1、
      佇列清空；selector 輸出未變時元件不重渲染（以 render 計數器測）。
- [ ] **A7 遊戲迴圈**：`gameLoop.ts` 實作 §5.1／§5.4，含空白鍵與數字鍵快捷鍵。
      驗收：Vitest 以假時鐘餵 dt 序列——×1 下 600ms 累積恰跑 1 tick；dt=5000ms 單幀最多
      4 tick 且累加器夾限；暫停後累加器歸零。
- [ ] **A8 失焦自動暫停**：`visibilitychange` 掛勾＋`ui.hud.autoPausedHidden` 提示。
      驗收：e2e——切背景分頁再切回，速度為 `paused` 且提示可見，按「繼續」恢復原檔位。
- [ ] **A9 錯誤處理**：`errors.ts`、`ErrorBoundary`、致命錯誤畫面、log 注入。
      驗收：debug console 觸發一個擲 `CoreError` 的假 Command 後，錯誤畫面出現、
      rAF 已停止、「重新載入」可用；dev console 有完整堆疊。
- [ ] **A10 MapCanvasHost＋renderer 生命週期**：§3.6 掛載／銷毀／resize／DPR，
      圖層容器與事件管線就緒（圖層內容留給 plan/04 實作）。
      驗收：StrictMode 下掛載→卸載→再掛載無 WebGL context 洩漏警告；
      視窗縮放後 canvas 尺寸與鏡頭夾限正確；`?debug=1` 時 `__TENKA_DEBUG__` 存在。
- [ ] **A11 除錯工具**：URL 參數解析、除錯面板全部區塊、debug Command 驗證規則、
      console API。
      驗收：`?debug=1&seed=42` 開局後面板可開；「+30日」快進且進度條顯示；
      `debug.addGold` 使 HUD 金錢 +10,000貫；無 `?debug=1` 時同 Command 被拒且面板不存在。
- [ ] **A12 perfMonitor 與效能打點**：§3.9.4 環形緩衝＋系統分項 mark。
      驗收：除錯面板效能區塊六項數值即時更新；prod build（無 debug）不呼叫
      `performance.mark`（以 bundle 搜尋斷言）。
- [ ] **A13 字型子集管線**：`tools/subset-font.ts`＋涵蓋率檢查納入 `validate:data`。
      驗收：故意在 `zh-TW.ts` 加入子集外罕字 → `validate:data` 失敗；重跑
      `font:subset` 後通過；成品 woff2 ≤ `BAL.perfFontKb`。

---

## 8. 設計決策記錄

| # | 決策 | 理由與捨棄的替代方案 |
|---|---|---|
| D1 | **core 就地變異 GameState，以 `tickSeq` 遞增作為變更訊號**，而非每 tick 產生不可變快照 | s1560 有 ~350 郡、~600 武將、數十部隊；×5 速度下每 120ms 一 tick，若做結構共享複製，GC 壓力與複製成本會侵蝕 8ms tick 預算。代價是 selector 不能依賴參考相等，故以 §3.4.2 的「只選原始值＋useShallow」規則配套。捨棄 Immer（強制不可變、額外 proxy 成本）。 |
| D2 | **單一 store、game／session 兩 slice**，不拆多個 store | 跨 slice 訂閱（如「選取的城的金流」同時要 selection 與 game）在單 store 內最簡單；多 store 會產生訂閱順序與撕裂問題。 |
| D3 | **core 純度雙重把關：`tsconfig.core.json`（無 DOM lib）＋ ESLint 規則**，不用 TS project references | project references 增加建置複雜度且 Vite 不需要它；兩道靜態檢查已足以在 CI 擋下違規，成本僅多一次 `tsc --noEmit`（core 子集，數秒）。 |
| D4 | **失焦暫停只監聽 `visibilitychange`（hidden），且恢復可見時不自動續跑** | `window.blur` 在點擊 devtools、iframe、第二螢幕時誤觸發太頻繁；而分頁隱藏時瀏覽器本就節流 rAF，遊戲時間實質已停，明確暫停＋手動繼續讓玩家對即時制時間有確定感。 |
| D5 | **鏡頭狀態放 renderer 內部，不進 Zustand store** | 平移／縮放每幀變動，進 store 會迫使訂閱者逐幀重跑 selector；UI 對鏡頭的少數需求（前往某城）用 `focusNode()` 指令式 API 滿足即可。 |
| D6 | **除錯作弊一律走 Command 管道並記入 command log** | 若直接改 state，golden test 與 bug 重放遇到用過作弊的存檔就無法重現；多付一點 Command 定義成本換取決定論完整（00 §5.5）。 |
| D7 | **字型子集離線產生、成品 commit，不在 CI 每次重跑** | 子集化需要 20MB 原始字型與數十秒處理，放 CI 拖慢每次建置；改以涵蓋率檢查（缺字即 fail）保證成品與字串同步。 |
| D8 | **不引入 react-router；畫面切換是 `session.screen` 狀態** | 單機遊戲無深連結需求，URL 只承載除錯參數；省 bundle 與 GH Pages 路由 hack。 |
| D9 | **邏輯迴圈由自有 rAF 驅動，Pixi ticker 只負責渲染** | 邏輯與渲染解耦：暫停時可把 Pixi 降到 `BAL.uiIdleFps` 省電，而 rAF 迴圈仍即時響應輸入；也避免 tick 節奏被渲染負載拖動。 |
| D10 | **積欠 tick 上限 4、超過即丟棄**（時間變慢而非補跑） | 補跑會在低階機器造成愈補愈欠的死亡螺旋；即時大戰略對牆鐘時間無精確承諾，時間變慢是玩家無感的退化方式。 |
| D11 | **Playwright 只跑 chromium** | 00 §2 定 E2E 僅 smoke；多瀏覽器矩陣對單機 WebGL 遊戲的回報價值低於 CI 時間成本。相容性風險由 Pixi 的 WebGL 抽象吸收。 |
| D12 | **`session.debug.jumping` 快進期間不受自動暫停中斷** | 快進的目的就是跳過事件雜訊直達目標日期；事件仍完整結算並進通知列，不遺失資訊。 |
| D13 | **`ci.yml` 採 17-T13（17 §3.11.1）的五 job 圖（install→lint/typecheck/unit/e2e），取代本文件 §3.8.1 的二 job（verify/e2e-smoke）範例**（2026-07-11，M0-8 實作） | 兩文件對 CI job 拆分方式不一致：本文件 §3.8.1 把 lint/typecheck/validate/test/build 併入單一 `verify` job；17 §3.11.1 拆成四個平行 job（另加 M9 起的 `perf-gate`），且 17 §3.11.2 的里程碑品質門檻表（golden-s1560／AI 合法性 A2／perf-gate／P4-P5／覆蓋率依 `current` 條件式阻斷，見 18 §4.1）需要以 job 為單位掛 `continue-on-error`，在單一 `verify` job 內無法對個別檢查項獨立設定阻斷模式。17 是測試矩陣與門檻表的單一真相來源（18 §2 關係表），故以 17 的五 job 圖為準；§3.8.1 的 yaml 範例保留供參考建置指令片段（`npm ci`/`npm run lint` 等步驟內容不變），但 job 拆分方式與依賴圖以 17 §3.11.1 為準。實作見 `.github/workflows/ci.yml`；里程碑門檻旗標由 `tools/ci/milestone-gate.ts` 讀 `milestone.json` 計算後以 job outputs 傳遞。 |
| D14 | **字型子集管線（M0-11／A13）四項實作定案**（2026-07-11，M0-11 實作）：①子集工具採 `subset-font`（npm，harfbuzzjs 綁定）而非 fonttools/Python——本文件 §3.9.3 原文已提及此 devDependency，且其 `variationAxes` 選項原生支援可變字型軸值釘選，維持工具鏈全在 Node/tsx 內、CI 不需另裝 Python。②原始字型檔改以 Google Fonts 官方可變字型 `NotoSerifTC[wght].ttf`（SIL OFL，取自 `github.com/google/fonts` 官方倉，`fonvar` 軸 `wght: 200–900`）存為 `tools/assets/NotoSerifTC-Regular.ttf`——副檔名由規格原文 `.otf` 改為 `.ttf`（實際取得的來源檔為 TrueType 容器，SFNT 家族對 harfbuzz/`subset-font` 無功能差異）；因可變字型預設軸值為 200（ExtraLight）而非 400，子集化時明確傳入 `variationAxes: { wght: 400 }` 才是規格所稱之 Regular。③涵蓋率把關（`tools/check-font-coverage.ts`）採「產生時寫入 manifest（`public/fonts/noto-serif-tc-subset.manifest.json`，記錄當次實際嵌入字元）、下次比對重新掃描結果與 manifest」的方式，不即時解析 woff2 二進位 cmap 表——省去二進位解析成本，代價是若有人手動置換 woff2 而不更新 manifest 則測不出，M0 階段風險可接受（成品僅由 `npm run font:subset` 產生）。④18-roadmap.md M0-11 任務表「產出檔案」欄寫作 `src/ui/styles/fonts/*`，與本文件 §3.3 目錄樹／§3.9.3／§3.2 表格定案的 `public/fonts/noto-serif-tc-subset.woff2` 不一致；依 18 文件頭「任務之技術內容與驗收細節以各系統文件為準」，以本文件 `public/fonts/` 為準，未在 `src/ui/styles/` 下另建字型目錄（`@font-face` 宣告仍如既有規劃留給 `src/ui/styles/global.css`，屬 M1-19 範圍）。⑤原始字型檔（~16MB）與子集成品（M0 現況 117 字元、約 37KB，遠低於 `perfFontKb=2048`）已於 M0-11 一併產生並納入本次變更；`src/i18n/zh-TW.ts`／劇本資料尚未填入前，子集僅含基準數字標點集，屬預期現況（字串或劇本大改後依 §3.9.3 手動重跑 `npm run font:subset`）。原始字型缺席時的降級（`check-font-coverage.ts` 回傳 `missing-font`、CLI 僅警告、exit 0，不阻斷 `validate:data`）保留於程式內作為 M0 期間豁免，供離線環境或原始字型另需替換時使用。 |
| D15 | **npm scripts 以 `package.json` 為最終真相；掃描器檔名定案 `scan-simplified.ts`**（2026-07-11，M0 checkpoint）：本文件 §3.7.5 原載 `tsx tools/check-simplified.ts`——該檔名為筆誤（17 §3.6.2／18 §8-D6／M0-6 實作均為 `scan-simplified.ts`），已更正；`validate:data` 定案為三段直串（zod 驗證＋簡體字掃描＋字型涵蓋率，與 CLAUDE.md 用途描述一致），不採 18 §8-D6 曾述之 shell 條件式（三工具皆已存在，條件式無必要）。18 §3.3.1 CLAUDE.md 範本指令表與本表為「範本節錄 vs 全表」關係，`package.json` 為超集且為唯一可執行真相；後續里程碑新增 scripts 時回寫本表。 |

---

*本文件由 Fable 5 設計定稿；依 00 §0.5，實作期若有變更，回寫本節並註記原因。*
