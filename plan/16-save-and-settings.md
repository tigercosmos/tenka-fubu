# 16 — 存讀檔與設定（Save, Load & Settings）

> 本文件是「存讀檔、版本遷移、設定、標題畫面流程」的單一真相來源（分工見 `plan/00-foundations.md` §7）。
> 型別與欄位命名以 `plan/02-data-model.md` 為準；本文件新增的存檔／設定專屬型別由本文件定義，02 收錄之。

---

## 1. 目的與範圍

本文件規定：

1. **存檔格式**：`SaveFile` 信封結構、`GameState` 序列化規則、lz-string 壓縮、idb-keyval 儲存、體積估算與上限。
2. **槽位制度**：手動 10 槽、自動 3 槽（每季輪替）、快速存檔 1 槽；覆蓋確認與存檔列表資料需求。
3. **匯出／匯入**：`.tenkafubu.json` 檔案下載與拖放匯入、驗證與錯誤處理。
4. **版本遷移框架**：`migrations` 陣列、逐級升級、不可降級、golden save fixtures（測試面見 `plan/17-testing.md`）。
5. **損壞存檔處理**：不崩潰原則、zod 淺驗證、損壞槽位的 UI 呈現。
6. **設定系統**：完整設定項表（預設值、localStorage 持久化、即時生效）。
7. **標題畫面流程**：繼續／新遊戲（劇本→大名→難易度→種子）／讀檔／設定；回到標題確認。
8. **未存檔保護**：`beforeunload` 警告、自動存檔失敗的降級行為。

不在本文件範圍：Report 通知系統本體（`plan/03-game-loop.md`）、設定畫面的視覺 wireframe（`plan/11-ui-screens.md`）、
元件外觀（`plan/12-ui-components.md`）、golden test 的執行細節（`plan/17-testing.md`）。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | 技術選型（idb-keyval、lz-string、zod）、決定論規範（§5.5）、i18n 規範（§9） |
| `plan/02-data-model.md` | `GameState`、`Command`、`Difficulty`、`SpeedLevel` 等型別定義；本文件的存檔／設定型別回饋收錄於 02 |
| `plan/03-game-loop.md` | tick 邊界、Command 佇列、`GameEvent`（含 `seasonStart`、月初 hook）、Report 嚴重度分級 |
| `plan/04-map-and-movement.md` | 地圖標籤密度設定值對應的 LOD 渲染規則、地圖特效開關的作用對象 |
| `plan/09-ai.md`／`plan/15-balance.md` | 難易度定義與修正值；本文件僅在新遊戲流程中引用 `Difficulty` |
| `plan/11-ui-screens.md` | 標題畫面、存讀檔畫面、設定畫面的版面 wireframe |
| `plan/13-i18n-strings.md` | 本文件 §6.5 字串表併入主字串表 |
| `plan/17-testing.md` | 存檔往返測試、遷移 golden fixtures、簡體字掃描 |

---

## 3. 設計細節

### 3.1 儲存層架構

存檔程式碼分兩層，遵守 `00` §3 的 core 純淨鐵律：

- **`src/core/save/`（純邏輯，可在 Node 測試）**：
  - `codec.ts`：`GameState` ⇄ JSON 字串的序列化／反序列化、`SaveFile` 信封組裝。
  - `migrations.ts`：`SAVE_FORMAT_VERSION` 常數、`MIGRATIONS` 陣列、遷移鏈執行器。
  - `schemas.ts`：`SaveFile` 信封與 `GameState` 頂層淺驗證的 zod schema。
  - 本層**禁止** `Date.now()`（`00` §5.5）：時間戳與遊玩時數由呼叫端注入。
- **`src/app/persistence/`（瀏覽器 I/O）**：
  - `saveStore.ts`：idb-keyval 讀寫、lz-string 壓縮解壓、槽位管理、配額錯誤處理。
  - `settingsStore.ts`：localStorage 設定讀寫與即時套用。
  - `exportImport.ts`：檔案下載（Blob + `<a download>`）與拖放／選檔匯入。

儲存介質分工（canonical）：

| 資料 | 介質 | 理由 |
|---|---|---|
| 存檔本體（壓縮字串）與 meta | IndexedDB（idb-keyval） | 容量大、非同步、不阻塞主執行緒 |
| 設定（`GameSettings`） | localStorage | 極小、同步讀取、標題畫面開啟前即需生效 |
| 自動存檔輪替游標 | IndexedDB（idb-keyval） | 與存檔同生命週期 |

### 3.2 SaveFile 格式與序列化規則

存檔信封為 `SaveFile`（完整型別見 §4.1）：

```
SaveFile {
  version: number            // 存檔格式版本 = SAVE_FORMAT_VERSION（寫入當下）
  timestamp: number          // Unix 毫秒，UI 層注入（core 不得呼叫 Date.now）
  meta: SaveMeta             // 列表顯示用摘要，不需解壓 state 即可讀
  state: GameState           // 完整遊戲狀態
  pendingCommands: Command[] // 存檔當下佇列中尚未結算的指令（見 §8 決策 D3）
}
```

**序列化規則（canonical）**：

1. `GameState` 全樹必須是 plain object／array／原始型別；**禁止** `Map`、`Set`、`Date`、`undefined` 欄位、
   函式、class 實例（此為 02 的不變量，存檔往返測試驗證之，見 17）。
2. 亂數狀態（`state.rng`，mulberry32 五條流的內部 32-bit 整數）隨 state 一併序列化，
   讀檔後亂數序列必須與存檔前完全銜接（決定論，`00` §5.5）。
3. 序列化 = `JSON.stringify(saveFile)`；不使用自訂 replacer，欄位順序不保證（比對一律比 parse 後的結構，不比字串）。
4. 儲存前以 `lz-string` 的 `compressToUTF16()` 壓縮（IndexedDB 儲存 UTF-16 字串最安全）；
   讀取以 `decompressFromUTF16()`。匯出檔**不壓縮**（見 §3.5）。
5. 存檔一律發生在 **tick 邊界**（`advanceDay` 回傳之後、下一次呼叫之前）。存檔面板開啟時策略層必為暫停狀態。

**idb-keyval 鍵名規範**：

| 鍵 | 值型別 | 說明 |
|---|---|---|
| `tf.save.{slotId}.blob` | `string` | `compressToUTF16` 後的存檔本體 |
| `tf.save.{slotId}.meta` | `SaveMeta` | 未壓縮 meta 快取，供列表快速渲染 |
| `tf.save.autosaveCursor` | `number` | 自動存檔輪替游標（0 起算，遞增不歸零） |

`slotId` 格式見 §4.2。meta 同時存在於 blob 內與獨立鍵；獨立鍵僅是快取，若遺失可解壓 blob 重建（見 §5.4 步驟 2）。

**體積估算**（依 `00` §10 劇本規模推估）：

| 組成 | 估算 | 原始 JSON |
|---|---|---|
| officers（650 名 × ~400 B） | 能力、特性、忠誠、功績、役職 | ~260 KB |
| districts（370 郡 × ~250 B） | 石高、商業、人口、治安、開發度、領主 | ~95 KB |
| castles（125 城 × ~300 B） | 兵力、兵糧、耐久、施設 | ~40 KB |
| clans + diplomacy（42 家 × 41 列 × ~60 B） | 信用、感情、協定 | ~150 KB |
| armies／battles（尖峰 ~60 部隊） | 路徑、士氣、編成 | ~25 KB |
| reports（保留上限依 03 規範） | 通知歷史 | ~100 KB |
| events／court／time／rng 等 | 旗標與雜項 | ~30 KB |
| **合計（原始）** | | **~0.7–1.5 MB** |
| **合計（compressToUTF16 後，經驗壓縮率 20–35%）** | | **~150–500 KB／檔** |

14 個槽位全滿 < 8 MB，遠低於瀏覽器 IndexedDB 配額（通常 ≥ 數百 MB）。上限常數：

- `BAL.saveCompressedWarnBytes = 3_000_000`：單檔壓縮後超過此值 → `console.warn` 並照常寫入（開發期偵測 state 膨脹）。
- `BAL.saveCompressedMaxBytes = 15_000_000`：超過此值 → 拒絕寫入，顯示 `error.save.tooLarge`（此情況代表嚴重 bug，如 reports 未修剪）。

寫入前**不**主動查詢 `navigator.storage.estimate()`（估算不準且非同步）；以捕捉 `QuotaExceededError` 為準（§3.10）。

### 3.3 槽位制度

共 **14 個槽位**，三類：

| 類別 | 數量常數 | slotId | 寫入時機 | 可被玩家覆蓋／刪除 |
|---|---|---|---|---|
| 手動 | `BAL.manualSaveSlots = 10` | `manual:1` … `manual:10` | 玩家於存檔畫面點選 | 是（覆蓋需確認） |
| 自動 | `BAL.autoSaveSlots = 3` | `auto:1` … `auto:3` | 每季首日輪替（§3.4） | 可刪除；不可手動寫入 |
| 快速 | `BAL.quickSaveSlots = 1` | `quick:1` | Ctrl+S（§3.4） | 快速存檔直接覆蓋，不確認 |

規則：

1. **覆蓋確認**：對非空的手動槽存檔時，彈出確認對話框（字串 `ui.save.overwriteConfirm`，含原存檔的大名與日期插值）。
   空槽直接寫入。自動槽輪替與快速存檔**不**確認（設計本意即高頻覆蓋）。
2. **刪除**：任何非空槽可於讀檔／存檔畫面刪除（確認字串 `ui.save.deleteConfirm`）。刪除 = 同時移除 blob 與 meta 兩鍵。
3. **存檔列表 UI 資料需求**：列表渲染**只讀 meta 鍵**（14 次 `get`，不解壓任何 blob）。每列顯示：
   - 槽位名（`ui.save.slotManual` / `ui.save.slotAuto` / `ui.save.slotQuick`）
   - 大名家名與當主名（`meta.clanName`、`meta.leaderName`）
   - 遊戲內日期（`meta.dateText`，格式 `1560年5月3日`）
   - 進度摘要：`{castleCount}城・{officerCount}將・{totalKokudaka}石`（數字千分位）
   - 難易度、真實存檔時刻（`timestamp` 以瀏覽器時區格式化）、遊玩時數
   - 舊版標記：`meta` 內 `version < SAVE_FORMAT_VERSION` 時顯示 `ui.save.willMigrate` 徽章
   - 狀態：空（`ui.save.empty`）／正常／損壞（`ui.save.corrupt`，見 §3.7）

### 3.4 自動存檔與快速存檔

**自動存檔（每季輪替）**：

- 觸發：`advanceDay` 完成後，UI 層檢查本 tick 的 `GameEvent` 是否含季節開始事件
  （3/1、6/1、9/1、12/1，事件定義見 03）。即 `BAL.autoSaveIntervalMonths = 3` 個月一次。
- 輪替：目標槽 = `auto:{(autosaveCursor % BAL.autoSaveSlots) + 1}`；寫入成功後 `autosaveCursor += 1` 並持久化。
  三槽因此永遠保有最近三季的快照。
- 執行方式：在季首 tick 結束的同一個 frame 內同步序列化＋壓縮＋非同步寫入。
  最壞情況約 100–200 ms 的單次停頓，每遊戲年僅 4 次，可接受（見 §8 決策 D5）。
- 自動存檔的 `meta.slotLabel` 記錄季節文字（如「自動・1560年秋」）。
- 失敗降級行為見 §3.10。

**快速存檔／快速讀檔**：

- `Ctrl+S`：立即覆蓋 `quick:1`（`event.preventDefault()` 阻止瀏覽器「另存網頁」）。成功後顯示 toast `ui.save.quickSaved`。
- `F9`：讀取 `quick:1`。若目前有未存檔進度（dirty，§3.10），先彈確認 `ui.load.quickLoadConfirm`；槽為空則 toast `ui.load.quickEmpty`。
- 兩者僅在遊戲進行中（非標題畫面、非合戰 modal 進行中）有效；合戰 modal 內停用（合戰是子迴圈，狀態不在 tick 邊界）。

### 3.5 匯出與匯入

**匯出**：

- 任何非損壞槽位、以及「目前遊戲狀態」皆可匯出。
- 檔案內容：**未壓縮**的 `SaveFile` JSON（`JSON.stringify(saveFile)`，不縮排以省體積），信封含 `version`。
- 檔名：`tenkafubu_{clanId去前綴}_{yyyy}-{mm}-{dd}_{timestamp}.tenkafubu.json`，
  例：`tenkafubu_oda_1561-03-01_1751808000000.tenkafubu.json`。
- 實作：`new Blob([json], { type: 'application/json' })` → `URL.createObjectURL` → 隱形 `<a download>` 點擊 → `revokeObjectURL`。

**匯入**：

- 入口：讀檔畫面的「匯入存檔」區（`ui.save.importHint`），支援 (a) 拖放檔案至讀檔畫面任意處（dragover 顯示遮罩）、
  (b) 點擊開啟 `<input type="file" accept=".json,.tenkafubu.json">`。
- 驗證管線（任一步失敗即中止並顯示對應錯誤，**不**寫入任何槽位）：
  1. 檔案大小 ≤ `BAL.importFileMaxBytes = 50_000_000`，否則 `error.load.fileTooLarge`。
  2. `JSON.parse` 成功，否則 `error.load.invalidFile`。
  3. 信封淺驗證 `SaveFileEnvelopeSchema`（§5.5）通過，否則 `error.load.invalidFile`。
  4. 版本檢查與遷移鏈（§3.6）；`version > SAVE_FORMAT_VERSION` → `error.load.newerVersion`。
  5. `GameState` 頂層淺驗證 `GameStateShallowSchema` 通過，否則 `error.load.corrupt`。
- 驗證通過後顯示**匯入預覽卡**（渲染 `meta`，同存檔列表列），提供兩個動作：
  - 「直接開始」（`ui.save.importLoad`）：不落地，直接以此 `SaveFile` 進入遊戲。
  - 「存入槽位」（`ui.save.importStore`）：選擇一個手動槽寫入（非空槽走覆蓋確認），寫入時以**當前格式版本**重新封裝
    （即遷移結果落地，不保留舊版本體）。

### 3.6 版本與遷移框架

- `SAVE_FORMAT_VERSION: number`（目前 `= 1`）定義於 `src/core/save/migrations.ts`。
  它是**程式結構常數而非平衡數值**，不放入 `BAL.*`（理由見 §8 決策 D2）。
  凡 `GameState` 或 `SaveFile` 結構有不相容變更，此值 +1，並同時新增一筆 migration 與一份 golden fixture。
- 遷移定義：

```ts
interface SaveMigration {
  /** 此遷移的來源版本；套用後版本變為 fromVersion + 1 */
  fromVersion: number
  /** 變更摘要（開發者文件用，繁中） */
  description: string
  /**
   * 純函式：就地或回傳新物件皆可，但不得丟出例外（防禦性容錯，缺欄位補預設值）。
   * 輸入輸出皆為「尚未通過深驗證的原始 JSON 物件」。
   */
  migrate: (draft: Record<string, unknown>) => Record<string, unknown>
}

/** 依 fromVersion 嚴格遞增排列；MIGRATIONS[i].fromVersion === i + 1 */
export const MIGRATIONS: SaveMigration[] = []
```

- **讀檔時逐級升級**：`version = n` 的存檔依序套用 `fromVersion = n, n+1, …, SAVE_FORMAT_VERSION - 1` 的遷移。
  鏈中缺格（找不到對應 `fromVersion`）→ 錯誤 `migration-gap`（理論上不會發生，屬 CI 防呆，17 有測試守護）。
- **不可降級**：`version > SAVE_FORMAT_VERSION` → 直接拒絕，錯誤碼 `newer-version`，
  UI 顯示 `error.load.newerVersion`（插值 `{version}`）。不嘗試「盡力載入」。
- 遷移只在**讀取路徑**執行（記憶體中），原槽位 blob 不自動改寫；下次玩家對該槽存檔時自然以新版落地。
  匯入時的「存入槽位」是唯一主動落地遷移結果的路徑（§3.5）。
- **Golden save fixtures**：每個歷史版本保留一份代表性存檔於 `tests/fixtures/saves/save-v{N}.tenkafubu.json`
  （版本升級當下凍結）。CI 驗證：每份 fixture 經遷移鏈升級後通過淺驗證、且載入後連續推進 30 tick 無例外。
  fixture 產製與測試斷言細節見 `plan/17-testing.md`。

### 3.7 損壞存檔處理

最高原則：**任何槽位的資料異常都不得讓應用程式崩潰或讓其他槽位不可用。**

- 列表建構：逐槽 `try/catch`。meta 鍵缺失但 blob 存在 → 嘗試解壓重建 meta（§5.4）；重建也失敗 → 該槽標記 `corrupt`。
- 載入：解壓失敗（`decompressFromUTF16` 回傳 `null` 或空字串）、`JSON.parse` 失敗、信封淺驗證失敗、
  遷移後 `GameState` 淺驗證失敗 → 一律回 `LoadOutcome { ok: false }`，UI 顯示 `error.load.corrupt`，槽位標記 `corrupt`。
- 淺驗證原則：zod 只驗**信封四欄 + meta 欄位 + `GameState` 頂層 13 鍵的存在與粗型別**
  （`00` §4：time／clans／officers／castles／districts／provinces／armies／battles／diplomacy／court／events／reports／rng）。
  不做深層全樹驗證（成本高且與 02 的型別重複；深層異常由載入後第一個 tick 的例外邊界兜底，見下）。
- 載入後保險：進入遊戲的第一次 `advanceDay` 以 `try/catch` 包裹；若丟例外 → 回到標題並顯示 `error.load.corrupt`
  （不覆寫任何槽位）。此後的 tick 例外處理屬 03 的除錯規範，不在此擴張。
- 損壞槽位的 UI：顯示 `ui.save.corrupt`，僅提供「刪除」與「匯出原始資料」（把原始 blob 解壓字串或原字串包成
  `.corrupt.txt` 下載，供回報 bug）兩動作；「載入」按鈕停用。

### 3.8 設定系統

- 儲存：localStorage 鍵 `tf.settings.v1`，值為 `GameSettings` 的 JSON。**與存檔無關**：換存檔、開新遊戲都沿用同一份設定。
- 讀取：應用啟動時讀取一次；`SettingsSchema`（zod）驗證，**逐欄位**容錯——缺欄位或非法值以預設值補（`.catch()`），
  未知欄位捨棄；整體 parse 失敗則整份回預設。永不因設定損壞而無法啟動。
- 寫入：任何設定變更即刻 (a) 寫回 localStorage、(b) 套用至執行中系統（**全部即時生效**，無「套用」按鈕）。
- 設定屬 UI／app 層，**不進 `GameState`、不進存檔**；core 需要的值（如自動暫停判斷）由 app 層在邊界讀取後決定
  是否暫停，core 本身不知道設定存在。

**設定項完整表（canonical）**：

| # | 欄位（`GameSettings.`） | 型別 | 預設值 | 選項／範圍 | 生效方式 | 說明 |
|---|---|---|---|---|---|---|
| 1 | `defaultSpeed` | `SpeedLevel` | `'x1'` | `'x1' / 'x2' / 'x5'`（不含暫停） | 下次進入遊戲時的初始檔位；進行中不改變當前檔位 | 遊戲載入後仍先處於暫停，玩家解除暫停時採用此檔位 |
| 2 | `autoPause.monthStart` | `boolean` | `true` | — | 即時 | 月初（每月 1 日 tick 後）自動暫停 |
| 3 | `autoPause.proposal` | `boolean` | `true` | — | 即時 | 具申送達時自動暫停 |
| 4 | `autoPause.envoy` | `boolean` | `true` | — | 即時 | 外交來使時自動暫停 |
| 5 | `autoPause.siege` | `boolean` | `true` | — | 即時 | 我方城被圍時自動暫停 |
| 6 | `autoPause.battle` | `boolean` | `true` | — | 即時 | 合戰可發動時自動暫停 |
| 7 | `autoPause.event` | `boolean` | `true` | — | 即時 | 歷史事件觸發時自動暫停 |
| 8 | `notificationFilter` | `NotificationFilterLevel` | `'all'` | `'all' / 'major' / 'critical'` | 即時 | 通知 toast 的過濾等級；對應 Report 嚴重度（分級定義見 03）。報告記錄畫面永遠顯示全部 |
| 9 | `mapLabelDensity` | `MapLabelDensity` | `'medium'` | `'high' / 'medium' / 'low'` | 即時 | 地圖標籤密度；各檔位實際顯示哪些標籤由 04 的 LOD 規則定義 |
| 10 | `effectsEnabled` | `boolean` | `true` | — | 即時 | 地圖動態特效（行軍軌跡、威風擴散波紋等，作用對象見 04／12）；關閉以提升低階機效能 |
| 11 | `uiScale` | `number` | `1.0` | `BAL.uiScaleMin = 0.8` ～ `BAL.uiScaleMax = 1.5`，步進 `BAL.uiScaleStep = 0.05` | 即時 | 介面縮放；實作為根元素 CSS 變數 `--ui-scale`，全 UI 以 rem 基準縮放（不影響 Pixi 地圖視口） |
| 12 | `audio.masterVolume` | `number` | `70` | `0..100` 整數 | 即時（v1 無作用） | **v1 預留**：設定畫面中整組隱藏（`FEATURE_AUDIO = false` 編譯旗標），欄位保留於 schema |
| 13 | `audio.muted` | `boolean` | `false` | — | 同上 | v1 預留，隱藏 |
| 14 | `language` | `'zh-TW'` | `'zh-TW'` | 僅此一項 | — | 顯示為停用的下拉選單，固定「繁體中文（台灣）」；架構上為未來多語系留欄位 |

設定畫面另提供「回復預設值」按鈕（`ui.settings.reset`，需確認 `ui.settings.resetConfirm`）：整份寫回 `DEFAULT_SETTINGS` 並即時套用。

### 3.9 標題畫面流程

標題畫面（wireframe 見 11）四個主按鈕，狀態機如下：

```
標題畫面
├─ 繼續        （無任何可載入存檔時停用）
│    └─ 直接載入「timestamp 最大」的非損壞存檔（掃描全部 14 槽 meta）→ 進入遊戲
├─ 新遊戲
│    ├─ 步驟1 選擇劇本：v1 僅列出 s1560「桶狹間前夜」（單選，架構支援多劇本清單）
│    ├─ 步驟2 選擇大名：地圖＋勢力清單（資料需求見下）；選定一家
│    ├─ 步驟3 選擇難易度：初級／中級／上級（Difficulty，修正值見 15）
│    ├─ 步驟4 亂數種子：顯示自動產生的種子（UI 層 Date.now() % 2^32，core 外允許），
│    │        可手動改為任意 0..4294967295 整數；附說明 ui.newGame.seedHint
│    └─ 開始遊戲 → 以（劇本, 大名, 難易度, 種子）呼叫 core 初始化 builder → 進入遊戲（暫停狀態）
├─ 讀取存檔 → 存檔列表（含匯入區，§3.5）→ 選槽載入
└─ 設定     → 設定畫面（§3.8）→ 返回
```

- 每個精靈步驟皆可「返回」上一步；步驟間選擇保留（返回再前進不重選）。
- 「繼續」按鈕下方以小字顯示將載入的存檔摘要（大名・日期・真實時刻）。
- 選擇大名步驟的資料需求：每勢力的 `clanId`、家名、當主名、城數、總石高、武將數、推薦難度標籤
  （「推薦新手」給織田等強勢開局，資料來源見 14）。
- **回到標題確認**：遊戲中系統選單的「回到標題」在 dirty（§3.10）時彈確認 `ui.confirm.toTitle`；
  非 dirty 直接返回。回到標題即丟棄記憶體中的遊戲狀態。
- 本作為網頁應用，無「結束程式」按鈕；關閉分頁的保護由 `beforeunload` 承擔（§3.10）。

### 3.10 未存檔保護與降級行為

**Dirty 追蹤**：

- app 層維護 `lastSavedMark = { tick: number, commandSerial: number }`（存檔成功時更新；
  `commandSerial` 為 03 定義的指令流水號）。
- `dirty = (目前 tick > lastSavedMark.tick) || (目前 commandSerial > lastSavedMark.commandSerial)`。
- 讀檔完成與新遊戲初始化完成視為「剛存檔」（不 dirty）——新遊戲玩家尚無進度可失去，第一個季首自動存檔會很快落地。

**beforeunload**：

- 遊戲進行中且 dirty 時註冊 `beforeunload` handler：`e.preventDefault(); e.returnValue = ''`
  （瀏覽器顯示原生通用警告，文字不可自訂）。非 dirty 或在標題畫面時解除註冊，避免無謂攔截。

**自動存檔失敗的降級行為**（依序執行）：

1. 捕捉寫入例外。若為 `QuotaExceededError`：刪除「最舊的自動槽」（meta.timestamp 最小者）後重試一次
   （重試次數上限 `BAL.autoSaveRetryMax = 1`）。
2. 重試仍失敗（或非配額錯誤）：
   - 發出一則重大等級 Report（字串 `report.save.autosaveFailed`；Report 機制見 03）。
   - 設定 session 旗標 `autosaveSuspended = true`：本次遊戲不再嘗試自動存檔（避免每季卡頓＋重複報錯），
     HUD 常駐顯示警示圖示（tooltip `ui.hud.autosaveSuspendedTip`）。
   - 手動存檔與快速存檔**不受影響**，仍可嘗試（玩家可能已清出空間）。
3. **手動／快速存檔失敗**：彈錯誤對話框 `error.save.quotaExceeded`，附「匯出目前進度」按鈕
   （走 §3.5 匯出路徑——匯出不經 IndexedDB，必定可行），確保玩家永遠有逃生門。

---

## 4. 資料結構

以下型別定義於 `src/core/save/` 與 `src/app/persistence/`，並收錄進 02 的型別總表。
`GameState`、`Command`、`Difficulty`、`SpeedLevel`、`ClanId`、`ScenarioId` 等既有型別參見 `plan/02-data-model.md`。

### 4.1 存檔信封

```ts
/** 存檔格式版本（程式結構常數，非 BAL 平衡值）。結構不相容變更時 +1。 */
export const SAVE_FORMAT_VERSION = 1

/** 存檔信封：匯出檔與 IndexedDB blob 的共同結構 */
export interface SaveFile {
  /** 存檔格式版本；寫入當下恆等於 SAVE_FORMAT_VERSION */
  version: number
  /** 真實世界存檔時刻（Unix 毫秒）；由 app 層注入，core 不產生 */
  timestamp: number
  /** 列表顯示摘要；不解壓 state 即可渲染存檔列表 */
  meta: SaveMeta
  /** 完整遊戲狀態（02 定義；plain JSON 樹，含 rng 流狀態） */
  state: GameState
  /** 存檔當下佇列中尚未結算的 Command（讀檔後原樣還原至佇列） */
  pendingCommands: Command[]
}

/** 存檔列表顯示摘要（單位與格式見各欄註解） */
export interface SaveMeta {
  /** 劇本 ID，如 's1560' */
  scenarioId: ScenarioId
  /** 玩家勢力 ID，如 'clan.oda' */
  clanId: ClanId
  /** 勢力顯示名（繁中，冗餘存放避免列表渲染需查劇本資料），如 '織田家' */
  clanName: string
  /** 當主顯示名（繁中），如 '織田信長' */
  leaderName: string
  /** 遊戲內日期（年/月/日，曆法見 00 §5.1） */
  date: { year: number; month: number; day: number }
  /** 預格式化日期字串，如 '1560年5月3日'（列表直接顯示） */
  dateText: string
  /** 難易度（初級/中級/上級；型別見 02，修正見 15） */
  difficulty: Difficulty
  /** 開局亂數種子（0..2^32-1），供玩家回報與重現 */
  seed: number
  /** 玩家勢力城數（個） */
  castleCount: number
  /** 玩家勢力所屬武將數（名） */
  officerCount: number
  /** 玩家勢力總石高（石） */
  totalKokudaka: number
  /** 累計遊玩真實時間（秒）；由 app 層計時、存檔時注入、讀檔後接續累計 */
  playtimeSeconds: number
  /** 寫入此檔的存檔格式版本（= 信封 version 的冗餘，供 meta 快取單獨判斷舊版徽章） */
  version: number
  /** 應用程式版本字串（package.json version＋git short hash），僅供除錯顯示 */
  appVersion: string
  /** 槽位顯示標籤，如 '自動・1560年秋'；手動槽與快速槽為空字串 */
  slotLabel: string
}
```

### 4.2 槽位與列表

```ts
/** 槽位識別字：類別 + 1 起算序號 */
export type SaveSlotId =
  | `manual:${number}`   // manual:1 .. manual:10（BAL.manualSaveSlots）
  | `auto:${number}`     // auto:1 .. auto:3（BAL.autoSaveSlots）
  | 'quick:1'            // 快速存檔（BAL.quickSaveSlots = 1）

/** 槽位狀態 */
export type SaveSlotStatus = 'empty' | 'ok' | 'corrupt'

/** 存檔列表單列的 view model（由 saveStore.listSlots() 產生） */
export interface SaveSlotView {
  slotId: SaveSlotId
  status: SaveSlotStatus
  /** status === 'ok' 時必有；empty/corrupt 為 null */
  meta: SaveMeta | null
  /** meta.version < SAVE_FORMAT_VERSION 時為 true（顯示升級徽章） */
  needsMigration: boolean
}

/** 儲存介面抽象：core 測試用記憶體實作、正式環境為 idb-keyval 實作 */
export interface SaveStorageAdapter {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}
```

### 4.3 載入結果與錯誤碼

```ts
/** 存讀檔錯誤碼（→ 對應 i18n 字串，見 §6.5） */
export type SaveErrorCode =
  | 'quota-exceeded'   // 寫入空間不足 → error.save.quotaExceeded
  | 'too-large'        // 壓縮後超過 BAL.saveCompressedMaxBytes → error.save.tooLarge
  | 'write-failed'     // 其他寫入例外 → error.save.writeFailed
  | 'corrupt'          // 解壓/parse/淺驗證失敗 → error.load.corrupt
  | 'invalid-file'     // 匯入檔非本作存檔 → error.load.invalidFile
  | 'file-too-large'   // 匯入檔超過 BAL.importFileMaxBytes → error.load.fileTooLarge
  | 'newer-version'    // 存檔版本高於程式（不可降級）→ error.load.newerVersion
  | 'migration-gap'    // 遷移鏈缺格 → error.load.migrationGap
  | 'empty-slot'       // 讀取空槽 → error.load.emptySlot

/** 載入結果（decode + migrate + validate 的統一回傳） */
export type LoadOutcome =
  | { ok: true; save: SaveFile; /** 若經遷移，原始版本號；未遷移為 null */ migratedFrom: number | null }
  | { ok: false; error: SaveErrorCode }
```

### 4.4 設定

```ts
/** 通知過濾等級：全部 / 重要以上 / 僅重大（對應 03 的 Report 嚴重度） */
export type NotificationFilterLevel = 'all' | 'major' | 'critical'

/** 地圖標籤密度（LOD 對應規則見 04） */
export type MapLabelDensity = 'high' | 'medium' | 'low'

/** 全域設定；localStorage 鍵 'tf.settings.v1'。欄位語意與預設值見 §3.8 表 */
export interface GameSettings {
  /** 設定結構版本（與存檔版本無關；結構變更時 +1，舊欄位以預設值補） */
  settingsVersion: number
  /** 解除暫停時採用的預設速度檔位（'x1'|'x2'|'x5'；SpeedLevel 見 02） */
  defaultSpeed: Exclude<SpeedLevel, 'pause'>
  /** 自動暫停開關組（00 §5.2 的六種事件） */
  autoPause: {
    monthStart: boolean   // 月初
    proposal: boolean     // 具申送達
    envoy: boolean        // 外交來使
    siege: boolean        // 我方城被圍
    battle: boolean       // 合戰可發動
    event: boolean        // 歷史事件
  }
  /** 通知 toast 過濾等級 */
  notificationFilter: NotificationFilterLevel
  /** 地圖標籤密度 */
  mapLabelDensity: MapLabelDensity
  /** 地圖動態特效開關 */
  effectsEnabled: boolean
  /** 介面縮放倍率（BAL.uiScaleMin..BAL.uiScaleMax，步進 BAL.uiScaleStep） */
  uiScale: number
  /** 音量（v1 預留，UI 隱藏） */
  audio: {
    masterVolume: number  // 0..100 整數
    muted: boolean
  }
  /** 語言；v1 固定 'zh-TW'（UI 顯示但鎖定） */
  language: 'zh-TW'
}

export const DEFAULT_SETTINGS: GameSettings = {
  settingsVersion: 1,
  defaultSpeed: 'x1',
  autoPause: { monthStart: true, proposal: true, envoy: true, siege: true, battle: true, event: true },
  notificationFilter: 'all',
  mapLabelDensity: 'medium',
  effectsEnabled: true,
  uiScale: 1.0,
  audio: { masterVolume: 70, muted: false },
  language: 'zh-TW',
}
```

### 4.5 遷移

`SaveMigration` 與 `MIGRATIONS` 見 §3.6 代碼塊（canonical 定義即該處）。

---

## 5. 演算法與公式

本節數值常數彙整（`15-balance.md` 主表收錄，衝突時以 15 定案值為準）：

| 常數 | 建議初值 | 說明 |
|---|---|---|
| `BAL.manualSaveSlots` | `10` | 手動槽數 |
| `BAL.autoSaveSlots` | `3` | 自動槽數 |
| `BAL.quickSaveSlots` | `1` | 快速槽數 |
| `BAL.autoSaveIntervalMonths` | `3` | 自動存檔間隔（月）＝每季首日 |
| `BAL.autoSaveRetryMax` | `1` | 自動存檔配額錯誤時的重試次數 |
| `BAL.saveCompressedWarnBytes` | `3_000_000` | 單檔壓縮後警告門檻（bytes） |
| `BAL.saveCompressedMaxBytes` | `15_000_000` | 單檔壓縮後拒存門檻（bytes） |
| `BAL.importFileMaxBytes` | `50_000_000` | 匯入檔大小上限（bytes） |
| `BAL.uiScaleMin` | `0.8` | UI 縮放下限 |
| `BAL.uiScaleMax` | `1.5` | UI 縮放上限 |
| `BAL.uiScaleStep` | `0.05` | UI 縮放步進 |

### 5.1 建立存檔（core 純函式）

```
createSaveFile(state: GameState, pendingCommands: Command[],
               ctx: { now: number; playtimeSeconds: number; appVersion: string; slotLabel: string }): SaveFile
  1. meta ← buildSaveMeta(state, ctx)
     - 由 state 推導：scenarioId、clanId（玩家勢力）、clanName、leaderName、
       date 與 dateText（'{year}年{month}月{day}日'）、difficulty、seed、
       castleCount / officerCount / totalKokudaka（以 02 的 selector 計算玩家勢力聚合值）
     - 由 ctx 注入：timestamp=now、playtimeSeconds、appVersion、slotLabel；version = SAVE_FORMAT_VERSION
  2. return { version: SAVE_FORMAT_VERSION, timestamp: ctx.now, meta, state, pendingCommands }
     // 不深拷貝：呼叫端保證在 tick 邊界、序列化完成前不再 mutate state
```

### 5.2 寫入槽位（app 層）

```
saveToSlot(slotId: SaveSlotId, saveFile: SaveFile): Promise<{ ok: true } | { ok: false; error: SaveErrorCode }>
  1. json ← JSON.stringify(saveFile)
  2. blob ← lzString.compressToUTF16(json)
  3. bytes ← blob.length × 2                                 // UTF-16 每字元 2 bytes
     if bytes > BAL.saveCompressedMaxBytes → return { ok:false, error:'too-large' }
     if bytes > BAL.saveCompressedWarnBytes → console.warn(...)
  4. try:
       await adapter.set(`tf.save.${slotId}.blob`, blob)
       await adapter.set(`tf.save.${slotId}.meta`, saveFile.meta)
     catch e:
       if isQuotaError(e) → return { ok:false, error:'quota-exceeded' }
       else → return { ok:false, error:'write-failed' }
  5. 更新 lastSavedMark（dirty 追蹤，§3.10）；return { ok:true }
```

覆蓋流程（手動槽 UI）：`目標槽 status !== 'empty'` → 先彈 `ui.save.overwriteConfirm` → 確認才呼叫 `saveToSlot`。

### 5.3 自動存檔（app 層，季首 hook）

```
onTickCompleted(events: GameEvent[]):
  if !events.some(e => e.type === 'seasonStart') → return        // 事件型別見 03
  if autosaveSuspended → return
  cursor ← (await adapter.get('tf.save.autosaveCursor')) ?? 0
  slotId ← `auto:${(cursor mod BAL.autoSaveSlots) + 1}`
  label  ← `自動・{year}年{季節名}`                               // 季節名：春/夏/秋/冬（00 §5.1）
  result ← saveToSlot(slotId, createSaveFile(state, queue, { now: Date.now(), ..., slotLabel: label }))
  if result.ok → await adapter.set('tf.save.autosaveCursor', cursor + 1)
  else if result.error === 'quota-exceeded' AND retriesUsed < BAL.autoSaveRetryMax:
     刪除三個自動槽中 meta.timestamp 最小者（blob+meta 兩鍵）；retriesUsed += 1；重跑步驟 4
  else → 降級：發重大 Report(report.save.autosaveFailed)；autosaveSuspended ← true；HUD 顯示警示
```

### 5.4 讀取槽位（app 層 → core 解碼）

```
loadFromSlot(slotId: SaveSlotId): Promise<LoadOutcome>
  1. blob ← await adapter.get(`tf.save.${slotId}.blob`)
     if blob === undefined → return { ok:false, error:'empty-slot' }
  2. json ← lzString.decompressFromUTF16(blob)
     if json 為 null 或 '' → 標記槽位 corrupt；return { ok:false, error:'corrupt' }
  3. return decodeAndMigrate(json)                              // §5.5；失敗同樣標記 corrupt
  // meta 快取重建：listSlots() 發現 meta 鍵缺失但 blob 存在時，執行步驟 1–3 成功後
  // 將 save.meta 寫回 meta 鍵；失敗則該槽 status='corrupt'
```

### 5.5 解碼與遷移鏈（core 純函式）

```
decodeAndMigrate(json: string): LoadOutcome
  1. raw ← try JSON.parse(json) catch → { ok:false, error:'corrupt' }
  2. envelope ← SaveFileEnvelopeSchema.safeParse(raw)
     // 淺驗證：version:number(int≥1)、timestamp:number、meta:object（欄位逐一淺驗）、
     //        state:object、pendingCommands:array —— 不驗 state 內部
     if !envelope.success → { ok:false, error:'invalid-file' }   // 槽位讀取時視同 'corrupt'
  3. v ← raw.version
     if v > SAVE_FORMAT_VERSION → { ok:false, error:'newer-version' }
  4. migratedFrom ← v < SAVE_FORMAT_VERSION ? v : null
     while v < SAVE_FORMAT_VERSION:
       m ← MIGRATIONS.find(m => m.fromVersion === v)
       if m 不存在 → { ok:false, error:'migration-gap' }
       raw ← m.migrate(raw)；raw.version ← v + 1；v ← v + 1
  5. shallow ← GameStateShallowSchema.safeParse(raw.state)
     // 淺驗證：00 §4 列出的 13 個頂層鍵存在且為 object/array；time.year 為 number 等粗檢
     if !shallow.success → { ok:false, error:'corrupt' }
  6. return { ok:true, save: raw as SaveFile, migratedFrom }
```

### 5.6 匯出／匯入（app 層）

```
exportSave(saveFile: SaveFile): void
  1. json ← JSON.stringify(saveFile)                            // 不壓縮、不縮排
  2. name ← `tenkafubu_{stripPrefix(meta.clanId)}_{date.year}-{pad2(month)}-{pad2(day)}_{timestamp}.tenkafubu.json`
  3. Blob → objectURL → <a download=name> click → revokeObjectURL

importSave(file: File): Promise<LoadOutcome>
  1. if file.size > BAL.importFileMaxBytes → { ok:false, error:'file-too-large' }
  2. json ← await file.text()
  3. return decodeAndMigrate(json)                              // §5.5
  // ok 時 UI 顯示匯入預覽卡（§3.5）：「直接開始」或「存入槽位」（存入時 version 已為當前版）
```

### 5.7 設定載入／儲存（app 層）

```
loadSettings(): GameSettings
  1. raw ← localStorage.getItem('tf.settings.v1')
     if raw === null → return DEFAULT_SETTINGS
  2. parsed ← try JSON.parse(raw) catch → return DEFAULT_SETTINGS
  3. return SettingsSchema.parse(parsed)
     // SettingsSchema 每個欄位皆掛 .catch(預設值)：單欄位非法 → 該欄回預設，其餘保留；
     // uiScale 額外 clamp 至 [BAL.uiScaleMin, BAL.uiScaleMax]

updateSetting(patch: Partial<GameSettings>): void
  1. next ← { ...current, ...patch }（巢狀物件 autoPause/audio 以淺合併處理）
  2. localStorage.setItem('tf.settings.v1', JSON.stringify(next))
  3. applySettings(next)：
     - uiScale → document.documentElement.style.setProperty('--ui-scale', String(next.uiScale))
     - mapLabelDensity / effectsEnabled → 通知 Pixi 渲染器（介面見 04）
     - notificationFilter → 通知 toast 管線（見 03/12）
     - autoPause.* / defaultSpeed → app 層旗標，於對應 GameEvent 邊界讀取
```

### 5.8 「繼續」按鈕的目標決定

```
findLatestSave(): Promise<SaveSlotView | null>
  1. views ← listSlots()                     // 逐槽 try/catch 建構（§3.7）
  2. candidates ← views.filter(v => v.status === 'ok')
  3. return candidates 中 meta.timestamp 最大者；無候選 → null（按鈕停用）
```

---

## 6. UI/UX

版面 wireframe 與導航歸 11、元件外觀歸 12；本節定義流程、資料綁定與字串。

### 6.1 存檔／讀檔畫面（同一畫面雙模式）

- 進入點：遊戲中系統選單「存檔」「讀檔」；標題畫面「讀取存檔」（僅讀檔模式，另含匯入區）。
- 列表 14 列固定順序：手動 1–10 → 自動 1–3 → 快速。每列渲染 `SaveSlotView`（資料欄位見 §3.3 第 3 點）。
- 存檔模式：自動槽與快速槽的列顯示但「存檔」動作停用（僅可刪除／匯出）。
- 讀檔模式：dirty 時任何「載入」先彈 `ui.load.loadConfirm`；損壞槽「載入」停用。
- 每列次要動作：刪除（確認）、匯出；損壞槽為刪除、匯出原始資料。

### 6.2 設定畫面

- 分組呈現：「時間與暫停」（#1–7）、「通知與地圖」（#8–10）、「顯示」（#11、14）、「音訊」（#12–13，v1 隱藏）。
- 控件型態：布林 → 開關；枚舉 → 分段按鈕（segmented control）；`uiScale` → 滑桿（顯示百分比，如「100%」）。
- 底部「回復預設值」按鈕。所有變更即時生效、即時寫入，無確認、無套用按鈕。

### 6.3 標題畫面

流程見 §3.9。新遊戲精靈為四步驟單頁切換，頂部顯示步驟進度（1 劇本 → 2 大名 → 3 難易度 → 4 種子）。

### 6.4 匯入互動

- 讀檔畫面常駐一個虛線框拖放區；整個讀檔畫面亦接受拖放（dragover 顯示全版遮罩 `ui.save.importDropOverlay`）。
- 驗證失敗 → 錯誤 toast（對應 `SaveErrorCode` 字串），拖放區短暫紅框震動（動效見 12）。
- 驗證成功 → 匯入預覽卡取代拖放區，含「直接開始」「存入槽位」「取消」。

### 6.5 繁中字串表（併入 `plan/13-i18n-strings.md` 主表）

| Key | 繁中字串 |
|---|---|
| `ui.title.continue` | `繼續` |
| `ui.title.newGame` | `新遊戲` |
| `ui.title.loadGame` | `讀取存檔` |
| `ui.title.settings` | `設定` |
| `ui.title.continueHint` | `{clan}・{date}（{realTime}）` |
| `ui.newGame.stepScenario` | `選擇劇本` |
| `ui.newGame.stepDaimyo` | `選擇大名` |
| `ui.newGame.stepDifficulty` | `選擇難易度` |
| `ui.newGame.stepSeed` | `亂數種子` |
| `ui.newGame.seedHint` | `相同的劇本、種子與操作將重現完全相同的戰局。可自行輸入數字。` |
| `ui.newGame.recommended` | `推薦新手` |
| `ui.newGame.start` | `開始遊戲` |
| `ui.newGame.back` | `返回` |
| `ui.save.title` | `存檔` |
| `ui.load.title` | `讀檔` |
| `ui.save.slotManual` | `手動 {n}` |
| `ui.save.slotAuto` | `自動 {n}` |
| `ui.save.slotQuick` | `快速存檔` |
| `ui.save.empty` | `（空）` |
| `ui.save.corrupt` | `（損壞的存檔）` |
| `ui.save.summary` | `{castles}城・{officers}將・{koku}石` |
| `ui.save.playtime` | `遊玩 {hours}時{minutes}分` |
| `ui.save.willMigrate` | `舊版存檔（v{from}），載入時將升級至 v{to}` |
| `ui.save.action.save` | `存檔` |
| `ui.save.action.load` | `載入` |
| `ui.save.action.delete` | `刪除` |
| `ui.save.action.export` | `匯出` |
| `ui.save.action.exportRaw` | `匯出原始資料` |
| `ui.save.overwriteConfirm` | `要覆蓋「{label}」嗎？原存檔（{clan}・{date}）將無法復原。` |
| `ui.save.deleteConfirm` | `要刪除存檔「{label}」（{clan}・{date}）嗎？此動作無法復原。` |
| `ui.save.saved` | `已存檔至「{label}」` |
| `ui.save.quickSaved` | `已快速存檔` |
| `ui.save.deleted` | `已刪除存檔` |
| `ui.save.import` | `匯入存檔` |
| `ui.save.importHint` | `將 .tenkafubu.json 檔案拖曳至此，或點擊選擇檔案` |
| `ui.save.importDropOverlay` | `放開以匯入存檔` |
| `ui.save.importPreview` | `匯入預覽` |
| `ui.save.importLoad` | `直接開始` |
| `ui.save.importStore` | `存入槽位` |
| `ui.save.importCancel` | `取消` |
| `ui.load.loadConfirm` | `尚有未存檔的進度，載入「{label}」將失去目前進度。要繼續嗎？` |
| `ui.load.quickLoadConfirm` | `尚有未存檔的進度，要讀取快速存檔嗎？` |
| `ui.load.quickEmpty` | `沒有快速存檔` |
| `ui.confirm.toTitle` | `尚有未存檔的進度，確定要回到標題畫面嗎？` |
| `ui.hud.autosaveSuspendedTip` | `自動存檔已暫停：儲存空間不足。請刪除舊存檔或匯出備份。` |
| `ui.settings.groupTime` | `時間與暫停` |
| `ui.settings.groupNotify` | `通知與地圖` |
| `ui.settings.groupDisplay` | `顯示` |
| `ui.settings.groupAudio` | `音訊` |
| `ui.settings.defaultSpeed` | `預設遊戲速度` |
| `ui.settings.autoPause` | `自動暫停` |
| `ui.settings.autoPause.monthStart` | `月初` |
| `ui.settings.autoPause.proposal` | `具申送達` |
| `ui.settings.autoPause.envoy` | `外交來使` |
| `ui.settings.autoPause.siege` | `我方城被圍` |
| `ui.settings.autoPause.battle` | `合戰可發動` |
| `ui.settings.autoPause.event` | `歷史事件` |
| `ui.settings.notificationFilter` | `通知過濾` |
| `ui.settings.notificationFilter.all` | `全部` |
| `ui.settings.notificationFilter.major` | `重要以上` |
| `ui.settings.notificationFilter.critical` | `僅重大` |
| `ui.settings.mapLabelDensity` | `地圖標籤密度` |
| `ui.settings.mapLabelDensity.high` | `高` |
| `ui.settings.mapLabelDensity.medium` | `中` |
| `ui.settings.mapLabelDensity.low` | `低` |
| `ui.settings.effects` | `地圖特效` |
| `ui.settings.uiScale` | `介面縮放` |
| `ui.settings.volume` | `主音量` |
| `ui.settings.language` | `語言` |
| `ui.settings.languageValue` | `繁體中文（台灣）` |
| `ui.settings.reset` | `回復預設值` |
| `ui.settings.resetConfirm` | `要將所有設定回復為預設值嗎？` |
| `error.save.quotaExceeded` | `儲存空間不足，無法寫入存檔。請刪除舊存檔，或匯出目前進度作為備份。` |
| `error.save.tooLarge` | `存檔資料異常過大，寫入已取消。請回報此問題並匯出目前進度。` |
| `error.save.writeFailed` | `存檔寫入失敗。請重試，或匯出目前進度作為備份。` |
| `error.load.corrupt` | `存檔資料損壞，無法載入。` |
| `error.load.invalidFile` | `檔案格式不正確，並非《天下布武》的存檔。` |
| `error.load.fileTooLarge` | `檔案過大，無法匯入。` |
| `error.load.newerVersion` | `此存檔由較新版本的遊戲（存檔格式 v{version}）建立，目前版本無法載入。請更新遊戲後再試。` |
| `error.load.migrationGap` | `找不到存檔升級路徑（v{version}），無法載入。請回報此問題。` |
| `error.load.emptySlot` | `此槽位沒有存檔。` |
| `report.save.autosaveFailed` | `自動存檔失敗，本場遊戲已暫停自動存檔。請盡快手動存檔或匯出備份。` |
| `ui.save.exportSuccess` | `已匯出存檔檔案` |

（難易度顯示字串 `term.difficulty.*`＝初級／中級／上級，歸 15／13 定義，此處僅引用。）

---

## 7. 實作任務清單

- [ ] **T16-1　core 存檔編解碼**：`src/core/save/codec.ts` 之 `createSaveFile` / `buildSaveMeta` / `decodeAndMigrate`；
      `schemas.ts` 之 `SaveFileEnvelopeSchema`、`GameStateShallowSchema`。
      驗收：任一初始化後的 `GameState` 經 stringify→decode 往返 deep-equal；`Date.now`／`Math.random` 於 `src/core/save/` 零出現（lint 守護）；
      篡改頂層鍵後 decode 回 `corrupt`。
- [ ] **T16-2　遷移框架**：`migrations.ts` 之 `SAVE_FORMAT_VERSION`、`MIGRATIONS`、鏈式升級。
      驗收：`version+1` 的假存檔回 `newer-version`；人工缺格回 `migration-gap`；
      `MIGRATIONS[i].fromVersion === i+1` 的結構斷言測試通過（見 17）。
- [ ] **T16-3　儲存 adapter 與槽位管理**：`SaveStorageAdapter` 介面、idb-keyval 實作、記憶體實作（測試用）；
      `saveToSlot` / `loadFromSlot` / `deleteSlot` / `listSlots` / `findLatestSave`。
      驗收：記憶體 adapter 下 14 槽讀寫刪全流程單元測試通過；meta 鍵刪除後 `listSlots` 能由 blob 重建；blob 亂改後該槽 `corrupt` 且其餘槽正常。
- [ ] **T16-4　自動存檔與快速存檔**：季首 hook、輪替游標、`Ctrl+S`／`F9` 快捷鍵（含 `preventDefault`）。
      驗收：模擬推進 4 個季首依序寫入 auto:1→2→3→1；配額錯誤注入時走 §3.10 降級（刪最舊→重試→掛起＋Report）。
- [ ] **T16-5　匯出／匯入**：`exportImport.ts`、拖放與選檔、匯入預覽卡。
      驗收：匯出檔可 `JSON.parse` 且 `version === SAVE_FORMAT_VERSION`；匯出再匯入後 state deep-equal；
      餵入任意 .txt／截斷 JSON／超大檔各回正確錯誤碼且 UI 不崩潰。
- [ ] **T16-6　設定系統**：`settingsStore.ts`、`SettingsSchema`（逐欄 `.catch`）、`applySettings` 即時套用。
      驗收：清空／塞垃圾進 localStorage 後啟動皆得合法設定；改 `uiScale` 立即反映於 `--ui-scale`；
      重新整理頁面後設定保留；「回復預設值」後 localStorage 內容等於 `DEFAULT_SETTINGS`。
- [ ] **T16-7　標題畫面流程**：四主按鈕、新遊戲四步驟精靈、「繼續」目標決定。
      驗收：無存檔時「繼續」停用；有存檔時載入 timestamp 最大者；精靈可逐步返回且選擇保留；
      種子欄位接受 0..4294967295，非法輸入時「開始遊戲」停用。
- [ ] **T16-8　dirty 追蹤與 beforeunload**：`lastSavedMark`、handler 註冊/解除。
      驗收（Playwright smoke，見 17）：推進一日後關閉分頁觸發原生攔截；存檔後立即關閉不攔截；標題畫面不攔截。
- [ ] **T16-9　golden save fixtures**：`tests/fixtures/saves/save-v1.tenkafubu.json` 產製腳本（`tools/` 下）與凍結流程文件註解。
      驗收：fixture 經 `decodeAndMigrate` 成功、續跑 30 tick 無例外（測試本體見 17）。

---

## 8. 設計決策記錄

- **D1（meta 獨立鍵快取）**：存檔列表若需解壓 14 個 blob 會造成讀檔畫面秒級卡頓，故 meta 以未壓縮獨立鍵冗餘存放，
  列表渲染 O(槽數) 次小型 `get` 即完成；blob 內仍含 meta 作為單一真相，快取遺失可重建。
- **D2（`SAVE_FORMAT_VERSION` 不入 BAL）**：`00` §11 的 BAL 規範針對「可調平衡數值」；存檔版本是結構性常數，
  調它不是調平衡而是宣告不相容變更，且遷移正確性不得受 15 的數值調整牽動，故定義於 `src/core/save/migrations.ts`。
  槽數、體積門檻等雖非玩法平衡，但屬「可調門檻」，依 §11 字面規範仍入 BAL（於 balance.ts 內以「系統」分區註解隔開）。
- **D3（`pendingCommands` 進信封）**：玩家慣於「暫停→下一串指令→存檔」；此時指令尚未於 tick 開頭結算，
  若存檔只含 `state` 會無聲遺失這些指令。將佇列一併序列化、讀檔時原樣還原，成本近零且保決定論
  （重放紀錄同樣涵蓋這些指令，見 17）。此為對任務原型 `{version, timestamp, meta, state}` 的擴充。
- **D4（淺驗證而非全樹 zod）**：`GameState` 全樹 schema 與 02 的 TS 型別高度重複、維護成本高，且深層驗證數 MB 資料
  有可感知延遲。採「信封＋頂層 13 鍵淺驗證＋載入後首 tick 例外邊界」三層防線，涵蓋實務上的損壞樣態
  （截斷、亂碼、手改 JSON）。深層語意錯誤交由 golden test 與不變量檢查（17）在開發期攔截。
- **D5（自動存檔同步壓縮，不用 Web Worker）**：每季一次、實測級距 100–200 ms 的停頓，發生於季首
  （多數玩家開著月初自動暫停），體感成本低；Worker 需結構化複製 state 或轉 SharedArrayBuffer，複雜度不成比例。
  若 M9 效能調校發現超標，屆時再遷移至 Worker，介面（`saveToSlot` 為 async）已預留。
- **D6（壓縮採 `compressToUTF16`）**：IndexedDB 儲存 JS 字串；`compress()` 產生的字元可能含無效 surrogate pair，
  部分瀏覽器實作序列化有風險；`compressToUTF16` 犧牲約 6% 壓縮率換取全瀏覽器安全，為正確之選。
- **D7（設定不進存檔）**：自動暫停、標籤密度等屬玩家個人偏好而非戰局狀態；隨存檔攜帶會導致「讀老檔設定倒退」的
  反直覺行為。設定單獨存 localStorage、全域生效；`GameState` 保持與呈現偏好零耦合，也簡化決定論重放。
- **D8（不可降級一律硬拒）**：舊程式讀新檔的「盡力而為」載入無法保證不變量，寧可明確報錯並提示更新遊戲；
  匯出檔為未壓縮 JSON，進階玩家仍可自行手改救援。
- **D9（快捷鍵取 `Ctrl+S`／`F9`）**：`Ctrl+S` 可被 `preventDefault` 攔截且符合直覺；快速讀檔避開瀏覽器保留鍵
  （`Ctrl+L`、`F5` 等不可攔或高風險），取常見遊戲慣例 `F9`。
- **D10（自動存檔失敗即整場掛起）**：配額不足極少自癒；每季重試會反覆卡頓並轟炸通知。改為一次性降級＋常駐 HUD 警示＋
  保留手動存檔路徑與必定可行的匯出逃生門，把「資料安全」責任交還玩家並給足工具。
- **D11（種子於 UI 層產生）**：`00` §5.5 禁止 core 用 `Date.now`；新遊戲種子由標題畫面以 `Date.now() % 2^32` 產生後
  作為參數傳入 core 初始化 builder，並全程顯示與記錄於 `SaveMeta.seed`，兼顧決定論與可重現回報。
