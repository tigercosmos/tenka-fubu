# 13 — i18n 字串規格（Strings & Localization）

> 本文件是《天下布武》**字串 key 命名規範、t() 與格式化函式、主字串表**的單一真相來源
> （00 §7）。各系統文件（03～10、16）與 UI 文件（11、12）之字串表為「來源草案」，
> **一律以本文件主表為定案**；來源與定案不一致之處，於 §3.5 的正名對照表逐條裁定。
> 依 `plan/00-foundations.md` §13 規範撰寫；術語用字依 00 §14 與 `plan/19-glossary.md`。

---

## 1. 目的與範圍

### 1.1 目的

1. 定義 `src/i18n/` 模組：`zh-TW.ts` 字串表結構、`t()` 插值函式、缺 key 開發期警告。
2. 定義 key 命名規範細則（延伸 00 §9）：九個區段前綴（`ui. / cmd. / report. / term. /
   evt. / trait. / tac. / pol. / err.`）的語意、擁有者與動態 key 模式。
3. 彙整**主字串表**：全部系統 UI 字串之繁體中文（台灣慣用語）定稿。
4. 定義數字與日期格式化函式（`1560年5月3日`、`3,000兵`、`12,500石`、`800貫`）。
5. 定義 GameEvent → 報告 messageKey 的映射表（03 §3.4.2 指定由本文件登錄）。
6. 裁定遊戲名詞顯示字串的歸屬：哪些進 i18n（`term.*` 等），哪些屬型錄／劇本資料。

### 1.2 範圍外

- 專有名詞（武將名、城名、郡名、國名、勢力名、事件標題與內文、大命名稱）：
  屬劇本／型錄資料的 `name` 欄位，**不進 i18n**（00 §8；參見 `plan/14-scenario-data.md`）。
- 簡體字黑名單掃描與字串硬編碼掃描的測試實作：參見 `plan/17-testing.md`。
- 各字串所在畫面的佈局：參見 `plan/11-ui-screens.md`、`plan/12-ui-components.md`。
- 多語系切換：v1.0 唯一語系 `zh-TW`（00 §9），本文件架構不為多語系預留執行期切換。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | §8 ID 規範、§9 i18n 規範為最高準則；本文件為其細則 |
| `plan/02-data-model.md` | `Report{ id, day, event, read }`（§4.17，只存原始 event）、`GameEvent` payload（§4.19）、ID 品牌型別由 02 定義；顯示 key/params 之導出契約歸本文件 §3.7（五輪裁決 A） |
| `plan/03-game-loop.md` | `command.rejected` 之 `reasonKey`、報告嚴重度、`cmd.reject.*` 種子表源於 03 |
| `plan/05-domestic.md`～`plan/10-events-and-victory.md` | 各 §6 字串表為來源草案；機制語意以各文件為準 |
| `plan/11-ui-screens.md`、`plan/12-ui-components.md` | 畫面與元件字串來源草案；「key 與文案由 13 定案」為兩文件明文 |
| `plan/16-save-and-settings.md` | 存讀檔／設定字串來源草案；`SaveErrorCode` → `err.*` 映射 |
| `plan/14-scenario-data.md` | 專有名詞 `name` 欄規範；資料不進 i18n 的分界 |
| `plan/17-testing.md` | 簡體字掃描、硬編碼掃描、key 覆蓋測試的執行方式 |
| `plan/19-glossary.md` | `term.*` 值必須逐字一致的術語對照表（§3.6） |

---

## 3. 設計細節

### 3.1 模組結構與檔案分工

```
src/i18n/
├── zh-TW.ts     # 主字串表（本文件 §6 全部內容；純資料，零邏輯）
├── index.ts     # t()、hasKey()、getMissingKeys()（§5.1）
└── format.ts    # formatNumber / formatDate / formatQuantity 等（§5.3）
```

- 00 §3 的目錄樹僅列 `zh-TW.ts`；`index.ts` 與 `format.ts` 為本文件新增的同資料夾檔案
  （理由見 §8 D1）。
- `src/i18n/` 屬 UI 層資源：**core 不得 import `src/i18n/`**。core 只存原始 `event`
  （02 §4.17 `Report{ id, day, event, read }`）；報告顯示 `messageKey`／`params` 之導出
  （含 enrichment 與玩家視角分流）、翻譯與格式化一律在 UI 層 `renderReport` 執行（§3.7、五輪裁決 A）。
- `zh-TW.ts` 採**扁平 key、點號分段**的單一物件字面值，依 §6 的小節順序以註解分段：

```ts
// src/i18n/zh-TW.ts — 全部 UI 字串（唯一語系）。禁止簡體字與日文新字體（17 掃描）。
export const zhTW = {
  // ── 6.1 通用 ─────────────────────────
  'ui.common.confirm': '確定',
  'ui.common.cancel': '取消',
  // …（§6 主表全部條目，依小節順序）
} as const;

export type ZhTwTable = typeof zhTW;
export type StringKey = keyof ZhTwTable;   // 字面值聯集，供 t() 靜態檢查
```

- 禁止巢狀物件、禁止執行期組表（`as const` 使全部 key 成為字面值型別）。
- 同一 key 不得重複宣告（TypeScript 物件字面值重複 key 為編譯錯誤，天然防呆）。

### 3.2 t() 函式與插值

簽名（`src/i18n/index.ts`）：

```ts
export type TParam = string | number;
export type TParams = Readonly<Record<string, TParam>>;

/** 取字串並插值。key 參數型別採 StringKey | (string & {})：
 *  字面值呼叫享有自動完成與存在性檢查；動態組出的 key（report.*、term.rank.* 等）仍可傳入。 */
export function t(key: StringKey | (string & {}), params?: TParams): string;

/** key 是否存在於 zhTW（動態 key 呼叫前的防禦性檢查用） */
export function hasKey(key: string): boolean;

/** DEV 模式蒐集到的全部缺 key（測試與除錯用；PROD 恆回空陣列） */
export function getMissingKeys(): readonly string[];
```

插值規則（canonical）：

1. 插值符為 `{name}` 大括號具名參數（00 §9）；參數名 `[a-zA-Z][a-zA-Z0-9]*`。
   報告模板（`report.*`）之參數名為 §3.7 enrichment 導出之**顯示參數名**（如 `leader`／
   `place`／`castle`），**非 payload key 原樣**（五輪裁決 A/B）；其餘 UI 字串之參數名由呼叫端自定。
2. **number 型參數自動經 `formatNumber()` 千分位化**後插入；string 型參數原樣插入。
   曆法值（年、月、日）**禁止以 number 參數傳入**（會被千分位成 `1,560`）——
   一律先以 `formatDate()` / `formatYearMonth()` 格式化成 string 再傳（§8 D6）。
3. 模板中出現、但 params 未提供的參數：DEV 警告一次並保留 `{name}` 字面原樣輸出；
   params 多給的參數靜默忽略。
4. 大括號為保留字元：主表字串內不得出現字面 `{`、`}`（不提供跳脫語法）。

### 3.3 缺 key 的開發期警告

```
t(key, params):
  entry = zhTW[key]
  if entry === undefined:
    if import.meta.env.DEV:
      if key ∉ missingKeySet:               // 每個 key 只警告一次
        missingKeySet.add(key)
        console.warn(`[i18n] 缺少字串 key：${key}`)
      return `⟦${key}⟧`                     // 開發期以雙角括號醒目標示
    return key                              // 產品環境：回傳 key 本身（可讀降級，不擲例外）
  return interpolate(entry, params)          // §5.2
```

- `missingKeySet` 為模組層 `Set<string>`；DEV 模式另掛 `window.__i18nMissing`
  （指向同一 Set）供除錯面板（`plan/01-architecture.md` 除錯工具）讀取。
- Vitest 覆蓋測試（17）：掃描 `src/` 內全部 `t('…')` 字面值呼叫，斷言 key 皆存在；
  並反向列出主表中未被引用的 key（僅列印警示，不視為失敗——動態 key 無法靜態偵測）。

### 3.4 key 命名規範細則（延伸 00 §9）

#### 3.4.1 區段前綴表（canonical，僅此九個）

| 前綴 | 內容 | 典型形態 | 例 |
|---|---|---|---|
| `ui.` | 畫面與元件的靜態標籤、標題、按鈕、提示、aria 文字 | `ui.<畫面或元件>.<語意>` | `ui.castle.durability` |
| `cmd.` | Command 動詞、確認文案；`cmd.reject.*` 為驗證失敗訊息（03） | `cmd.<系統>.<動詞>` | `cmd.march.confirm` |
| `report.` | 報告模板（由 UI 層 `renderReport` 導出，§3.7；主表 §6.11） | `report.<領域>.<事件>` | `report.siege.fallen` |
| `term.` | 系統性遊戲名詞（身分、官位、協定、季節、單位…），與 19-glossary 逐字一致 | `term.<類別>.<項目>` | `term.rank.karo` |
| `evt.` | 事件引擎的外框與後備字串（事件內容屬資料，見 §3.6） | `evt.<語意>` | `evt.fallback.title` |
| `trait.` | 特性說明文（名稱屬 `TRAITS` 靜態表，06；見 §3.6） | `trait.<slug>.desc` | `trait.gunshin.desc` |
| `tac.` | 戰法名稱與說明 | `tac.<slug>.name / .desc` | `tac.charge.name` |
| `pol.` | 政策名稱與效果說明（`PolicyDef.nameKey` 指向之，05） | `pol.<slug>.name / .desc` | `pol.rakuichi.name` |
| `err.` | 系統層錯誤（存讀檔、匯入、載入崩潰） | `err.<領域>.<錯誤>` | `err.load.corrupt` |

- 名詞區段前綴刻意與 00 §8 的 ID 前綴一致（`tac.charge`、`pol.rakuichi`、`trait.gunshin`），
  使「實體 ID → i18n key」可機械推導：`${id}.name`、`${id}.desc`。
  例外：施設名 key 為 `term.facility.<slug>`（05 §4 `FacilityDef.nameKey` 已定案，尊重之）。
- key 字元規則（`tools/validate.ts` 與 17 的測試共同檢查）：
  `^(ui|cmd|report|term|evt|trait|tac|pol|err)\.[a-z][a-zA-Z0-9-]*(\.[a-z0-9][a-zA-Z0-9-]*)*$`
  ——段內 camelCase；嵌入實體 slug 的段允許連字號（首段亦同，如 `tac.fire-arrow.name`、
  `report.save.autosave-failed`）。
- 新增 key 必須落在上表九區段之一；不得新設頂層前綴。

#### 3.4.2 動態 key 模式（enum 值 → key）

UI 依 enum 值組 key 的固定模式（全部列舉；實作時以樣板字串組出並經 `hasKey` 防禦）：

| 資料值 | key 模式 | 例 |
|---|---|---|
| `Rank`（06） | `term.rank.<rank>` | `term.rank.samuraiTaisho` |
| `PactKind`（08） | `term.pact.<kind>` | `term.pact.alliance` |
| `CourtRank`（02 §3.3，語意見 08；enum 值本身即識別符，無獨立 ID） | `term.crank.<value>` | `term.crank.ju5ge` |
| `ShogunateTitle`（02 §3.3，語意見 08；enum 值本身即識別符，無獨立 ID） | `term.stitle.<value>` | `term.stitle.kanrei` |
| `DevPolicy`（05） | `term.devPolicy.<value>` | `term.devPolicy.barracks` |
| `conscriptPolicy`（05） | `term.conscript.<value>` | `term.conscript.high` |
| `FacilityId`（05，去 `fac.` 前綴） | `term.facility.<slug>` | `term.facility.ichi` |
| 季節（02 `season()`） | `term.season.<value>` | `term.season.spring` |
| `ArmyStatus`（02 §3.3 七值；狀態機語意見 07） | `ui.army.status.<value>` | `ui.army.status.marching` |
| `ReportSeverity`（03） | `ui.notify.severity.<value>` | `ui.notify.severity.critical` |
| `TacticDef.id` | `<id>.name` / `<id>.desc` | `tac.volley.desc` |
| `PolicyDef.id` | `<id>.name` / `<id>.desc` | `pol.kenchi.desc` |
| `TraitDef.id` | `<id>.desc`（名稱取 `TRAITS[id].name`） | `trait.chushin.desc` |
| 調略種類（08 `plot`） | `term.plot.<kind>` | `term.plot.poach` |
| 威風等級（07） | `term.awe.<level>` | `term.awe.large` |
| 難易度（00 §11） | `term.difficulty.<value>` | `term.difficulty.normal` |
| `SaveErrorCode`（16） | §6.16 映射表（kebab → camel） | `err.load.newerVersion` |

#### 3.4.3 文案風格規則

- 台灣慣用語、戰國語感；句尾標點：完整句用全形句號「。」，標籤與按鈕不加標點。
- 按鈕文字 2～4 字為原則（「出陣」「全部駁回」）；標題不加冒號；
  提示句可用全形驚嘆號「！」（戰報）與頓號「、」。
- 數量單位緊貼數字（00 §9）：`3,000兵`、`12,500石`、`800貫`、`90日`——模板寫作
  `{soldiers}兵`，不寫 `{soldiers} 兵`。
- **全案禁止簡體字與日文新字體**。高風險正字（樂、戰、關、檢、將、亂、榮、齊、澤、邊、
  賴、櫻、鐵、廢、氣、餘等）與其對應誤字形之完整「正→誤」對照，見 `plan/19-glossary.md`
  §3.12；本文件不內嵌任何誤字形，以免掃描器自傷（19 §3.12 屬掃描 allowlist 檔案，見 17）。
  「余」僅作第一人稱使用；黑名單掃描見 17。

### 3.5 來源文件 key 正名對照（衝突裁定，canonical）

各來源文件標明「字串由 13 彙整定案」；下表為**唯一有效**的裁定結果。實作一律使用
「定案 key／定案值」；來源文件中的舊 key 不實作、不設別名。

| 來源 | 來源 key／值 | 定案 key | 定案值 | 理由 |
|---|---|---|---|---|
| 07 §6.5 | `tactic.<slug>.name` | `tac.<slug>.name` | （不變） | 對齊 00 §8 ID 前綴 `tac.` |
| 16 §6.5 | `error.*` | `err.*`（§6.16） | （不變） | 對齊 §3.4.1 區段前綴表 |
| 05 §6.2 | `report.economy.salaryUnpaid` | `report.economy.upkeepUnpaid` | 見 §6.11 | 與 06 重複；統一為事件型別衍生 key |
| 06 §6.2 | `report.clan.unpaidSalary` | `report.economy.upkeepUnpaid` | 見 §6.11 | 同上 |
| 06 §6.2 | `ui.officer.list.title`＝家臣團 | `ui.officers.title` | 武將一覽 | 與 11 同義 key 合併；採畫面標題 |
| 11 §6 | `ui.proposal.accept`＝採納 | `ui.proposal.adopt` | 採納 | 與 06 同義 key 合併；動詞對齊 `adopted` 狀態 |
| 05/11 | `ui.policy.adopt`＝採用／施行 | `ui.policy.adopt` | 施行 | 法令語感；與「廢止」對仗 |
| 05/11 | `ui.policy.revoke`／`ui.policy.abolish` | `ui.policy.revoke` | 廢止 | key 從 05，值兩文件相同 |
| 11/12 | `ui.common.confirm`＝確定／確認 | `ui.common.confirm` | 確定 | 台灣 UI 慣用 |
| 11/16 | `ui.title.newGame`＝開始新遊戲／新遊戲 | `ui.title.newGame` | 新遊戲 | 16 擁有標題流程 |
| 11/16 | `ui.title.continue`＝繼續遊戲／繼續 | `ui.title.continue` | 繼續 | 同上；副標由 `ui.title.continueHint` 補足 |
| 07/11 | `ui.march.title`＝出陣／出陣編成 | `ui.march.title` | 出陣編成 | modal 標題需區別於「出陣」動詞鈕 |
| 10/11 | `ui.taimei.invoke`＝發動大命／發動 | `ui.taimei.invoke` | 發動大命 | 10 擁有大命系統 |
| 11 §6 | `ui.ending.victory`／`ui.ending.defeat` | `ui.ending.victory.*`／`ui.ending.defeat.*` | 見 §6.9 | 10 §3.9 已細分四種結局，11 之舊 key 廢除 |
| 03/11 | `ui.reports.title`＝報告／報告中心 | `ui.reports.title` | 報告中心 | 採畫面正式名稱（11） |
| 03/12 | `ui.speed.x1`＝×1／一倍速 | `ui.speed.x1`＋`ui.speed.aria.x1` | ×1／一倍速 | 顯示字與 aria 拆 key |
| 11 §3.5 | `ui.district.devPolicy.agri` 等＝農業優先… | `term.devPolicy.*` | 農業／商業／兵舍 | 05 §3.2.2 方針三值為 canonical（11 草案過時） |
| 05 §6.2 | `cmd.transport.title` | `ui.transport.title` | 輸送 | 面板標題屬 `ui.`；動詞鈕另為 `cmd.transport.confirm` |

### 3.6 遊戲名詞顯示字串的歸屬（canonical）

名詞分三類，歸屬互斥；`tools/validate.ts` 依此檢查資料檔不含 i18n key、i18n 不含專有名詞：

1. **專有名詞（劇本資料 `name` 欄，不進 i18n）**：武將、城、郡、國、勢力、街道之顯示名；
   歷史／汎用事件的標題與內文、選項文字（10 §6.3）；大命名稱（10 §3.7.3
   `TaimeiDef.name`）；特性名稱（06 §4 `TraitDef.name`，如「軍神」）。
2. **系統名詞（i18n `term.*` 與 `pol.* / tac.*` 區段）**：身分、役職、官位、幕府役職、
   協定、季節、單位、開發方針、徵兵方針、施設名（`FacilityDef.nameKey`，05）、
   政策名與效果說明（`PolicyDef.nameKey` 指向 `pol.<slug>.name`，05）、戰法名與說明。
3. **說明文（i18n）**：特性說明 `trait.<slug>.desc`（06 未提供 desc 欄，由本文件補齊）、
   政策與戰法 desc。說明文一律**定性描述、不含數值**——精確數值由 UI 依
   `TraitDef.effects`／`TacticDef`／`BAL.*` 即時渲染於 tooltip 明細列（§8 D5）。

與 `plan/19-glossary.md` 的一致性要求（canonical）：

- `term.*` 的每一個值、以及主表中出現的所有機制名詞（威風、知行、具申、制壓…），
  用字必須與 19 的術語表**逐字一致**；19 若修訂，本表同步修訂（單向依賴：19 → 13）。
- 17 的驗證腳本以 19 的對照表對 `zh-TW.ts` 做「同義異字」抽查（例：出現「聲望」即失敗，
  應為「威信」；出現「城堡」即失敗，應為「城」）。

### 3.7 GameEvent → 報告渲染契約（UI 層 enrichment）

報告顯示**不於 core 組裝**。core 只存原始 `event`（02 §4.17 `Report{ id, day, event, read }`、
03 §3.4.3）；顯示用的 `messageKey` 與插值 `params`（含 ID→顯示名 **enrichment** 與玩家攻守
視角分流）一律由 **UI 層 selector** `renderReport(report, state, playerClanId)` 於**渲染時**導出
（五輪裁決 A）。實作於 UI 層（`src/ui/report/renderReport.ts`，引用 `src/i18n` 之 `t()`／
`format*` 與 core selector 反查 state），**非 core**——`src/core` 不得 import `src/i18n`（§3.1）。

**(1) messageKey 導出**：

- **權威登錄＝§6.11「事件型別」欄**：每個會產生報告的事件型別對應一個 `report.*` key（含歷史
  沿用 key，如 `battle.started`→`report.field.begin`、`siege.started`→`report.siege.begin`、
  `facility.completed`→`report.build.done`、`army.starving`→`report.army.noFood`）；
  多數為 `report.<領域>.<事件>` 型態，不強制等於 `'report.' + event.type`（§8 D9）。
- **變體規則**（同一事件依 payload 欄位或 `playerClanId` 分岔多 key／分視角）：見下方 (3) 表。

**(2) params 導出（enrichment，取代舊「params = event.payload」）**：模板參數名**不再等於 payload
key**，而是由 payload 之**持久實體 ID** 經下表導出為顯示字串（五輪裁決 A/B）；number 型 payload
（`gold`／`food`／`soldiers`／`age` 等）原樣作為 number 參數傳入（`t()` 自動千分位，§3.2）。

| payload 欄位 | 顯示參數 | enrichment（render 時反查 state） |
|---|---|---|
| `armyId` | `leader`／`army` | `leader` = 部隊大將 `Officer.name`（`armyId`→`Army.leaderId`→name）；`army` = 「{大將}隊」 |
| `castleId`／`originCastleId`／`toCastleId`／`targetCastleId` | `castle` | `Castle.name` |
| `nodeId` | `place` | `MapNode.name`（節點→所在地名） |
| `districtId` | `district` | `District.name` |
| 任一 `*ClanId`（`clanId`／`from`・`toClanId`／`a`・`bClanId`／`winner`・`attacker`・`defenderClanId`／`actor`・`targetClanId`／`by`・`against`・`newOwnerClanId` …） | `clan`／`clanName`／`a`／`b`／`attacker`／`defender`／`winner`／`loser`／`enemy` 等具名 | `Clan.name` |
| `officerId`／`targetOfficerId`／`deceasedId`／`heirId`／`executorId`（皆 `OfficerId`；後三者為 `clan.succession`／`officer.recruitFailed` 專屬欄名，七輪裁決 2 收錄） | `name`／`officer`／`target`／`oldLeader`／`newLeader` 等具名 | `Officer.name`；`age` = 當年 − `Officer.birthYear`（02 §5.6 曆法） |
| `proposalId` | （不導出報告參數） | 保留於 payload 供來使 modal／11 跳轉；`report.diplomacy.envoyArrived` 之 `{proposal}` **不再反查 proposalId**，改由同 payload 之 `kind`（`DiplomacyActionKind`）直接導出（見下列 `kind` 行；六輪裁決 2——Proposal 於 render 時已 transient、`proposalId` 不可反查） |
| `target`（`diplo.workStopped`：`ClanId`｜`'court'`｜`'shogunate'`） | `target` | `ClanId`→`Clan.name`；`'court'`→`ui.court.title`（朝廷）、`'shogunate'`→`ui.shogunate.title`（幕府） |
| `ceasefireMonths`（`court.mediationResult`） | `months` | number 原樣（成功＝`BAL.courtMediationCeasefireMonths`、失敗＝0；`t()` 自動千分位，§3.2） |
| `taimeiId` | `name` | `TaimeiDef.name`（劇本/型錄專有名，不進 i18n；§3.6） |
| `policyId` | `name` | `PolicyDef.nameKey`→`pol.<slug>.name` |
| `facilityTypeId` | `facility` | `term.facility.<slug>`（§3.4.2） |
| `title`（`ShogunateTitle`）／`newCourtRank`（`CourtRank`）／`newRank`（`Rank`） | `title`／`rank` | `term.stitle.<value>`／`term.crank.<value>`／`term.rank.<value>`（§3.4.2） |
| `kind`（`PlotKind`／`DiplomacyActionKind`／`PactKind`） | `plot`／`proposal`／`pact` | `term.plot.<kind>`／`cmd.diplomacy.<kind>` 標籤（§6.7）／`term.pact.<kind>`（§3.4.2） |

**(3) 玩家視角與 payload 變體表**（全部列舉）：

| 事件型別 | 分流依據 | messageKey | 顯示參數（enrichment 來源） |
|---|---|---|---|
| `awe.triggered` | `payload.level`（small/medium/large） | `report.battle.awe.<level>` | large：`clan`←`clanId` |
| `officer.died` | `payload.cause`（**age/battle**，五輪裁決 C） | `report.officer.death`／`report.officer.killedInAction` | death：`name`←`officerId`, `age`←`officerId`(birthYear)；killedInAction：`name`←`officerId`, `place`←`nodeId`（僅 `cause='battle'` 非 null） |
| `officer.recruited` | `payload.source`（ronin/captive/poach） | `report.officer.recruited`／`report.captive.recruited`／**null** | ronin/captive：`name`←`officerId`；**poach→null**（該次登用已由 `plot.succeeded(poach)`→`report.plot.poachSuccess` 報告，避免重複列） |
| `officer.comingOfAge` | `payload.clanId` 是否 null（02 §4.19：null＝原定勢力已滅亡、就地成浪人） | `report.officer.comingOfAge`／`report.officer.comingOfAgeRonin` | 非 null：`name`←`officerId`, `clan`←`clanId`；null：`name`←`officerId`（浪人變體不列 clan） |
| `plot.succeeded` | `payload.kind`＋依 `playerClanId` 分視角 | poach：`actorClanId`=玩家→`report.plot.poachSuccess`／`targetClanId`=玩家→`report.officer.poached`；rumor：`actorClanId`=玩家→`report.plot.rumorSuccess`／否則→**null**（covert 未敗露、不洩漏給被害方）；betrayal：`actorClanId`=玩家→`report.plot.betrayalReady`／否則→**null** | poachSuccess：`officer`←`targetOfficerId`, `clan`←`targetClanId`；poached：`name`←`targetOfficerId`, `clan`←`actorClanId`；rumorSuccess：`target`←`targetOfficerId`(武將模式)∨`targetCastleId`(城模式)；betrayalReady：`castle`←`targetCastleId` |
| `plot.failed` | `actorClanId`=玩家→`report.plot.failed`／否則→**null**（covert；敗露另由 `plot.exposed*` 承載） | `report.plot.failed` | `clan`←`targetClanId`, `plot`←`kind` |
| `command.rejected` | `payload.reasonKey`（已是 i18n key） | 直接採 `reasonKey`（`cmd.reject.*` 或 `report.march.failed.*`） | 參數隨 `reasonKey` 之模板（03；此為 non-canonical、03 專有事件） |
| `event.fired` | — | `report.event.fired` | `title`←事件標題資料（10 專有名，不進 i18n） |
| `battle.ended` | `payload.winnerClanId` 與 `playerClanId`：`winnerClanId=playerClanId`→**won**；`playerClanId∈{attackerClanId,defenderClanId}` 且非勝方 **且 `winnerClanId≠null`**→**lost**；`playerClanId` 非雙方（第三方）或 `winnerClanId=null`（平手撤離）→**resolved**（`winnerClanId=null` 一律走此支，與 lost 無重疊） | `report.battle.won`／`report.battle.lost`／`report.field.resolved`（二輪／五輪裁決） | won/lost：`winner`←`winnerClanId`, `loser`←(`winnerClanId=attackerClanId ? defenderClanId : attackerClanId`), `place`←`nodeId`；resolved：`place`←`nodeId`（中性、不列 winner，`null` 平手亦適用） |
| `district.subjugated` | `fromClanId`/`toClanId` 與 `playerClanId`：`toClanId=playerClanId`（我方制壓）→**subjugated**；`fromClanId=playerClanId`（我方失郡）→**districtLost**；皆非（他勢力間，依 §3.4.3 relevance 一般不入報告匣） | `report.army.subjugated`／`report.army.districtLost` | subjugated：`leader`←`armyId`, `district`←`districtId`；districtLost：`district`←`districtId`, `clan`←`toClanId` |
| `siege.ended` | `payload.fallen`（true/false） | `report.siege.fallen`／`report.siege.repelled`（二輪裁決 C） | `castle`←`castleId` |
| `diplo.refused` | — | `report.diplomacy.proposalRejected` | `clan`←`toClanId`, `proposal`←`kind`（`DiplomacyActionKind`→`cmd.diplomacy.<kind>` 標籤，§6.7） |
| `uprising.ended` | `payload.resolved`（suppressed/subsided） | `report.uprising.suppressed`／`report.uprising.subsided` | `district`←`districtId`（六輪裁決 1） |
| `court.mediationResult` | `payload.success`（true/false）＋`playerClanId` 三分視角（比照 `plot.exposed`；七輪裁決 4）：`clanId`=玩家（斡旋發起方）→發起方視角；`targetClanId`=玩家（被斡旋方）→目標方視角；皆非→第三方視角——**與 `plot.exposed` 之「皆非→null」不同**：03 §3.4.2 對本事件第三方判 warning（非 info），恆推入報告匣，故第三方分支不可回傳 null、須補渲染字串 | success：`report.court.mediationSuccess`（發起方）／`report.court.mediationImposed`（目標方）／`report.court.mediationSuccessOther`（第三方）；!success：`report.court.mediationFailed`（發起方）／`report.court.mediationEvaded`（目標方）／`report.court.mediationFailedOther`（第三方） | 發起方：`clan`←`targetClanId`；目標方：`clan`←`clanId`；第三方：`a`←`clanId`, `b`←`targetClanId`；success 各視角皆加 `months`←`ceasefireMonths`（number）；!success 無 `months`（六輪裁決 1；成功時同 tick 另有 `pact.signed`→`report.diplomacy.pactSigned`，兩則並存不去重，見下方說明與 §8） |
| `plot.exposed` | 依 `playerClanId` 分視角：`actorClanId`=玩家→`report.plot.exposed`／`targetClanId`=玩家→`report.plot.exposedByEnemy`／皆非→**null** | `report.plot.exposed`／`report.plot.exposedByEnemy` | exposed：`clan`←`targetClanId`, `plot`←`kind`；exposedByEnemy：`clan`←`actorClanId`, `plot`←`kind`（`PlotKind`→`term.plot.<kind>`；六輪裁決 1/2） |
| `shogunate.patronLost` | 視角過濾：`e.clanIds.includes(playerClanId)`（`clanId`=玩家）→`report.shogunate.patronLost`／否則→**null**（當事勢力視角，字串為「我方…」，僅該勢力可見） | `report.shogunate.patronLost`／**null** | （無參數；六輪裁決 1） |
| `transport.looted` | `payload.ownerClanId`／`payload.byClanId` 與 `playerClanId` 直接比對（不再依 `e.clanIds` 反推輸送隊歸屬，七輪裁決 1）：`ownerClanId=playerClanId`（被劫方＝我方）→**looted**；`byClanId=playerClanId`（劫方＝我方）→**lootGain**；皆非→**null** | `report.transport.looted`／`report.transport.lootGain`／**null** | looted：`place`←`nodeId`, `clan`←`byClanId`；lootGain：`place`←`nodeId`（六輪裁決追記；`ownerClanId` 由七輪裁決 1 補入 payload） |
| `proposal.expired` | `payload.reason`（`'timeout'`／`'invalidated'`；`'invalidated'` 併入原孤兒鍵 `proposal.invalid`，七輪裁決 2；非玩家視角分流，兩分支對所有視角一致） | `report.proposal.expired`（`reason='timeout'`）／`report.proposal.invalid`（`reason='invalidated'`） | `name`←`officerId`（兩分支皆同） |

- **同 tick 多報告並存（不去重，七輪裁決追記）**：`renderReport(report, state, playerClanId)` 僅見單一 event 與 state，
  無 provenance 可判斷某報告是否為另一報告之肇因，故以下兩案皆定為**兩則並存、不去重**：
  `court.mediationResult(success)` 與同 tick 另發之 `pact.signed`→`report.diplomacy.pactSigned`（六輪裁決 6）；
  `siege.relief` 與援軍抵達同 tick「交戰成立」即自動觸發之 `battle.started`→`report.field.begin`
  （07 §3.3：遭遇判定成立即建立 `FieldCombat` 並發 `battle.started`，非需玩家指令觸發；`siege.relief` 之
  `Siege.interrupted=true` 為同一時刻的另一面——兩事件 payload 無交叉引用〔`siege.relief` 僅 `{siegeId,castleId}`、
  `battle.started` 僅 `{battleId,nodeId,attackerClanId,defenderClanId}`〕，render 時無法核銷任一方，比照六輪裁決 6 定案）。
- **`report.diplomacy.proposalAccepted` 已刪鍵（七輪裁決 2）**：我方提案獲受一律由既有事件承載——締約類
  （alliance/ceasefire/marriage/vassal）→`pact.signed`→`report.diplomacy.pactSigned`；`requestReinforce`→
  `diplo.reinforceAgreed`→`report.diplomacy.reinforceAgreed`。`pactSigned`（`{a}與{b}締結{pact}。`）之第三人稱
  字串已可涵蓋提案方視角（我方為 a 或 b 皆通順可讀），故不另立提案方專屬 key（nice-to-have，非必要）。

**(4) enrichment timing（transient 實體）**：

- **持久實體**（`Clan`／`Castle`／`MapNode`／`District`／`Officer`／`Policy`／`Taimei`）於 render
  時由 state 反查恆可解析（死亡武將 `status='dead'` 仍留於 state、滅亡勢力名亦留存）。
- **transient 實體**（`armyId`＝部隊、`battleId`／`sourceBattleId`＝已結束之 `FieldCombat`／
  `BattleState`）於事件當 tick 仍存活、但 render（尤其事後於報告中心重看）時可能已移除。
  **定案（擇 13 體例，五輪裁決 A/B）**：core 只存原始 event、**不於 03 Step 13 預解析名字入
  `Report`**；故 `renderReport` 於 render 時反查 state，**該 transient 已不在 state 時以 fallback
  顯示**——`{leader}`／`{army}` 退為通用語「我軍」（或以事件 `clanId` 之 `Clan.name`＋「軍」），
  `battle.kassenAvailable` 之 `{place}`（僅 `battleId`）於戰鬥已結束時退為通用「戰場」。**顯示所需
  之持久 ID 已由 02 §4.19 五輪裁決 B 直接落地於 payload**（`battle.ended`／`officer.died` 之
  `nodeId`、`district.subjugated` 之 `armyId`、`plot.*` 之 `targetCastleId`、以及各 `*ClanId`），
  使 place/clan/castle 顯示不依賴 transient 反查、恆可解析。

**(5) 不產生報告的事件**（`renderReport` 回傳 null；僅供 UI 當 tick 動畫／自動暫停消費。
備忘錄交 03 §3.4.3：本清單事件即使 `isPlayerRelevant` 為真亦不 push 為 `Report`，避免存入無法顯示之死列）：

- `time.monthStart`、`time.seasonStart`（app 層季首自動存檔消費，16 §5.3；二輪裁決 C）、
  `game.victory`、`game.defeat`（直接切結局畫面，10 §6.4）。
- `policy.enacted`／`policy.revoked`（**五輪裁決新增排除**）：施行／廢止為玩家主動操作之即時結果，
  UI 當下已回饋；金錢不足之被動廢止另有 `report.policy.autoRevoked`（他勢力政策非玩家相關）。
- `proposal.resolved`（**新增排除**）：具申裁決為玩家即時操作、結果即時反映於狀態；待裁決之提示
  已由 `proposal.submitted`（`report.proposal.submitted`）承載。
- `conscript.completed`（**新增排除**）：徵兵為玩家設定之持續方針、每月於多城觸發，逐一報告會
  灌爆報告匣（比照 03 §3.4.3「避免報告匣被灌爆」）；入營兵數於城面板即時可見。
- `army.returned`（**五輪裁決新增報告**，非排除）：歸還入城解散對玩家價值高（得知部隊凱旋與返還
  兵力），產生 `report.army.returned`（見 §6.11）。
- 系統文件另定義的非 03 清單報告 key（輸送、褒賞、朝廷、幕府、大命等）沿用其事件擴充
  （03 §4.3 擴充規則），全部收錄於 §6.11。

### 3.8 數字與日期格式（規格總覽；演算法見 §5.3）

| 需求 | 函式 | 輸出例 |
|---|---|---|
| 千分位整數 | `formatNumber(3000)` | `3,000` |
| 帶正負號 | `formatSigned(-1180)` | `−1,180`（U+2212）；`formatSigned(320)` → `+320` |
| 完整日期 | `formatDate(129)` | `1560年5月10日`（絕對日→曆法用 02 §5.6 `dayToCalendar`） |
| 年月 | `formatYearMonth(129)` | `1560年5月` |
| 數量＋單位 | `formatQuantity(12500, 'term.unit.koku')` | `12,500石` |
| 金錢 | `formatQuantity(800, 'term.unit.gold')` | `800貫` |
| 兵力 | `formatQuantity(3000, 'term.unit.soldiers')` | `3,000兵` |

- 年月日**無前導零**（`5月3日`，非 `05月03日`）；年為西曆四位數，不做千分位。
- 顯示負號一律 U+2212「−」（視覺對齊 tabular-nums）；內部運算仍為一般 number。
- 小數：全部顯示值皆為整數（02/05 內部浮點於顯示前 `Math.trunc`）；
  百分比參數（`{pct}`、`{rate}`）由呼叫端預先四捨五入為整數再傳入。

---

## 4. 資料結構

```ts
// ── src/i18n/zh-TW.ts ───────────────────────────────────────────
/** 主字串表：扁平 key、點號分段；內容＝本文件 §6 全部條目 */
export const zhTW: Record<string, string>; // 實際宣告為物件字面值 + as const（§3.1）
export type ZhTwTable = typeof zhTW;
export type StringKey = keyof ZhTwTable;

// ── src/i18n/index.ts ───────────────────────────────────────────
export type TParam = string | number;                 // number 自動千分位（§3.2 規則 2）
export type TParams = Readonly<Record<string, TParam>>;
export function t(key: StringKey | (string & {}), params?: TParams): string;
export function hasKey(key: string): boolean;
export function getMissingKeys(): readonly string[];  // DEV 蒐集；PROD 空陣列

// ── src/i18n/format.ts ──────────────────────────────────────────
/** 曆法三元組（12 已引用此名；由 02 §5.6 dayToCalendar 的回傳值定型於此） */
export interface GameDate {
  year: number;        // 西曆年（1560 起）
  month: number;       // 1..12
  dayOfMonth: number;  // 1..30（00 §5.1：1 月 = 30 日）
}
export function formatNumber(n: number): string;          // 千分位；負號 U+2212
export function formatSigned(n: number): string;          // 恆帶 +/−（0 → '±0'）
export function formatDate(absoluteDay: number): string;      // '1560年5月3日'
export function formatYearMonth(absoluteDay: number): string; // '1560年5月'
export function formatQuantity(n: number, unitKey: StringKey): string; // '3,000兵'
/** 感情數值（-100..100，08 §3.3）→ 顯示分檔 term key（§5.4；純呈現，不進 BAL） */
export function sentimentTermKey(sentiment: number): StringKey;

// ── src/ui/report/renderReport.ts（UI 層 selector；依 §3.7 契約實作，五輪裁決 A） ─────
/** 報告 → 顯示字串。於渲染時導出 messageKey＋enrichment params 並呼叫 t()；
 *  回傳 null 表示該事件不產生報告（§3.7(5) 排除清單）。needs GameState（反查 ID→顯示名）
 *  與 playerClanId（攻守/勝敗視角分流）。core 不得 import 本檔（§3.1）。 */
export function renderReport(
  report: Report,          // 02 §4.17（只存原始 event）
  state: GameState,        // 02（enrichment 反查來源）
  playerClanId: ClanId     // 玩家視角分流（§3.7(3)）
): string | null;
/** 內部：事件 → { messageKey, params }（含變體與 enrichment）；供 §5.6 測試斷言。 */
export function deriveReportMessage(
  event: GameEvent, state: GameState, playerClanId: ClanId  // 02 §4.19／§4.17
): { messageKey: string; params: Record<string, string | number> } | null;
```

---

## 5. 演算法與公式

本文件**不引入任何 BAL 常數**：i18n 與格式化屬純呈現，無可平衡數值（§8 D2）。
引用之既有常數：`BAL.reportMaxEntries`／`BAL.reportRetentionDays`（03，報告保留）。

### 5.1 t()（含缺 key 處理）

見 §3.3 虛擬碼；補充：`t` 為純函式（同輸入同輸出），警告副作用僅 DEV 存在。

### 5.2 插值 interpolate

```
interpolate(template, params):
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (m, name) =>
    params 無 name 屬性 → DEV 警告一次（key+name 組合）；回傳 m 原樣
    v = params[name]
    typeof v === 'number' → formatNumber(v)
    否則 → v（字串原樣）
  )
```

### 5.3 格式化函式

```
formatNumber(n):
  i = Math.trunc(n)                       // 顯示值一律整數
  s = Math.abs(i) 十進位字串，自右每 3 位插入 ','
  return (i < 0 ? '−' : '') + s           // U+2212

formatSigned(n):
  i = Math.trunc(n)
  if i > 0: return '+' + formatNumber(i)
  if i < 0: return formatNumber(i)        // 已含 −
  return '±0'

formatDate(absoluteDay):
  { year, month, dayOfMonth } = dayToCalendar(absoluteDay)   // 02 §5.6
  return `${year}年${month}月${dayOfMonth}日`                 // 年不做千分位

formatYearMonth(absoluteDay):
  { year, month } = dayToCalendar(absoluteDay)
  return `${year}年${month}月`

formatQuantity(n, unitKey):
  return formatNumber(n) + t(unitKey)     // 單位緊貼（00 §9）
```

### 5.4 感情顯示分檔（純呈現；閾值為 UI 常數，不影響模擬）

```
sentimentTermKey(s):                 // s ∈ [-100, 100]（08 §3.3）
  s >= 60  → 'term.sentiment.devoted'    // 親密
  s >= 20  → 'term.sentiment.friendly'   // 友好
  s > -20  → 'term.sentiment.neutral'    // 普通
  s > -60  → 'term.sentiment.wary'       // 不信
  否則     → 'term.sentiment.hostile'    // 敵視
```

閾值（60／20／−20／−60）寫死於 `format.ts`（僅此一處），不進 `BAL`、不進 `UI`
（12 §3.1.8 的 `UI.*` 為 12 擁有，本文件不擴充其表；§8 D2）。

### 5.5 報告渲染（UI 層 `renderReport`）

依 §3.7 契約：core 只存原始 `event`（02 §4.17 `Report`），顯示 key/params 於渲染時導出
（含 enrichment 與玩家視角分流，五輪裁決 A）。

```
renderReport(report, state, playerClanId):        // report: 02 §4.17；回傳 string | null
  m = deriveReportMessage(report.event, state, playerClanId)   // §3.7(1)(2)(3)：messageKey＋enrichment params；排除事件回 null
  if m === null: return null                       // §3.7(5) 不產生報告之事件
  return t(m.messageKey, m.params)                 // number 參數自動千分位（§3.2）

deriveReportMessage(event, state, playerClanId):
  key = messageKey(event, playerClanId)            // §3.7(1) 權威＝§6.11 事件型別欄；(3) 變體/視角分流；排除事件回 null
  if key === null: return null
  params = enrich(event, state)                    // §3.7(2)：payload 持久 ID → 顯示名（transient 不在 state 時 fallback，§3.7(4)）
  return { messageKey: key, params }
```

- 報告列顯示格式（報告中心、月初摘要共用）：`${formatDate(report.day)}　${renderReport(report, state, playerClanId)}`
  （回傳 null 之事件不入列表；僅供當 tick 動畫/自動暫停）。
- toast 顯示：標題列＝渲染結果前 18 字（溢出加「…」）；內文列＝全文。

### 5.6 key 覆蓋與品質驗證（實作於 17 的測試套件）

```
1. 靜態掃描 src/**/*.tsx? 內 t('…') 字面值 → 斷言 key ∈ zhTW（缺 key 即 fail）
2. zhTW 全部 key 通過 §3.4.1 正規表達式（格式 fail）
3. zhTW 全部值通過簡體字黑名單與日文新字體黑名單（17 定義字元集）
4. §3.4.2 動態 key 模式逐一展開（enum 全值 × 模式）→ 斷言存在（例：六個 Rank 皆有 term.rank.*）
5. §3.7 契約：對每個會產生報告的 GameEventType 構造假事件＋最小 state → `deriveReportMessage`
   → 斷言 messageKey 存在，且**模板參數名 ⊆ §3.7(2) enrichment 導出集**（非 payload keys；
   五輪裁決 A/B）；玩家視角分流事件（`battle.ended`／`district.subjugated`／`plot.exposed`／`transport.looted`／
   `court.mediationResult`）以 won/lost/resolved／subjugated/districtLost／exposed/exposedByEnemy／
   looted/lootGain/null／發起方-目標方-第三方（各×success/!success，六例）各視角各構造一例
   （`battle.ended` 另構造 `winnerClanId=null` 平手一例斷言走 resolved 而非 lost；`transport.looted` 分流依據改為
   `payload.ownerClanId`／`byClanId` 直接比對〔七輪裁決 1，不再依 `e.clanIds` 反推〕，另構造二者皆非玩家之
   第三方一例斷言回傳 null；`court.mediationResult` 三視角六例皆不可回傳 null——第三方分支依 03 §3.4.2
   「否則 warning」恆入報告匣，異於 `plot.exposed` 之皆非→null，七輪裁決 4）；payload 分岔事件
   （`uprising.ended` suppressed/subsided、`proposal.expired` timeout/invalidated〔七輪裁決 2，併入原孤兒鍵
   `proposal.invalid`〕）各分支各構造一例；視角過濾事件（`shogunate.patronLost`）構造當事勢力與非當事勢力
   各一例、後者斷言回傳 null；`diplo.envoyArrived` 斷言 `{proposal}` 解自 `payload.kind`（非 proposalId）；
   單值母集擴入 `clan.succession`／`officer.recruitFailed`／`siege.relief`／`army.routed`／
   `victory.tenkabitoProgress`（七輪裁決 2，皆單一 messageKey、無視角/payload 分岔，各構造一例）；
   排除清單事件（§3.7(5)）斷言回傳 null（`save.autosaveFailed`／`officer.meritReady` 皆非 GameEventType、
   不在本項母集，分屬六輪裁決 4／七輪裁決 2）
```

---

## 6. UI/UX — 主字串表（全部繁中定稿）

> 本節即 `zh-TW.ts` 的完整內容規格。表內「字串」欄為定案值；插值參數以 `{名}` 標示。
> 條目依區段分小節；實作時依序照抄為物件字面值。

### 6.1 通用與元件（`ui.common.* / ui.table.* / ui.slider.* / ui.speed.* / ui.toast.* / ui.notify.*`）

| key | 字串 |
|---|---|
| `ui.common.confirm` | 確定 |
| `ui.common.cancel` | 取消 |
| `ui.common.close` | 關閉 |
| `ui.common.back` | 返回 |
| `ui.common.execute` | 執行 |
| `ui.common.none` | （無） |
| `ui.common.unknown` | 不明 |
| `ui.common.days` | {days}日 |
| `ui.common.months` | {months}個月 |
| `ui.common.search` | 搜尋 |
| `ui.common.filterAll` | 全部 |
| `ui.table.empty` | 無符合條件的資料 |
| `ui.table.sortAsc` | 遞增排序 |
| `ui.table.sortDesc` | 遞減排序 |
| `ui.slider.all` | 全 |
| `ui.slider.half` | 半 |
| `ui.slider.quarter` | 四分之一 |
| `ui.slider.none` | 零 |
| `ui.speed.paused` | 暫停 |
| `ui.speed.x1` | ×1 |
| `ui.speed.x2` | ×2 |
| `ui.speed.x5` | ×5 |
| `ui.speed.aria.pause` | 暫停 |
| `ui.speed.aria.x1` | 一倍速 |
| `ui.speed.aria.x2` | 二倍速 |
| `ui.speed.aria.x5` | 五倍速 |
| `ui.toast.dismiss` | 關閉通知 |
| `ui.empty.default` | 目前沒有項目 |
| `ui.contextpanel.close` | 關閉面板 |
| `ui.minimap.ariaLabel` | 全國小地圖 |
| `ui.notify.severity.info` | 情報 |
| `ui.notify.severity.warning` | 警告 |
| `ui.notify.severity.critical` | 重大 |
| `ui.notify.autopause` | 時間已自動暫停：{reason} |
| `ui.notify.reason.siegeOnPlayer` | 我方城池遭到包圍 |
| `ui.notify.reason.battleAvailable` | 可發動合戰 |
| `ui.notify.reason.proposalArrived` | 收到家臣具申 |
| `ui.notify.reason.envoyArrived` | 他國使者來訪 |
| `ui.notify.reason.historicalEvent` | 發生歷史事件 |
| `ui.notify.reason.monthStart` | 月初 |
| `ui.system.tooSmall` | 視窗過小：本遊戲需要至少 1280×720 的視窗 |

### 6.2 標題、新遊戲精靈（`ui.title.* / ui.newGame.* / ui.scenario.* / ui.daimyo.*`）

| key | 字串 |
|---|---|
| `ui.title.gameTitle` | 天下布武 |
| `ui.title.subtitle` | 〜 戰國大戰略・致敬同人作品 〜 |
| `ui.title.newGame` | 新遊戲 |
| `ui.title.continue` | 繼續 |
| `ui.title.loadGame` | 讀取存檔 |
| `ui.title.settings` | 設定 |
| `ui.title.continueHint` | {clan}・{date}（{realTime}） |
| `ui.title.disclaimer` | 本作為非商業致敬同人作品 |
| `ui.newGame.stepScenario` | 選擇劇本 |
| `ui.newGame.stepDaimyo` | 選擇大名 |
| `ui.newGame.stepDifficulty` | 選擇難易度 |
| `ui.newGame.stepSeed` | 亂數種子 |
| `ui.newGame.seedHint` | 相同的劇本、種子與操作將重現完全相同的戰局。可自行輸入數字。 |
| `ui.newGame.seedAuto` | 自動 |
| `ui.newGame.recommended` | 推薦新手 |
| `ui.newGame.start` | 開始遊戲 |
| `ui.newGame.back` | 返回 |
| `ui.scenario.title` | 劇本選擇 |
| `ui.scenario.choose` | 選擇此劇本 |
| `ui.scenario.stats` | 勢力數：{clans}　城數：{castles} |
| `ui.daimyo.title` | 大名選擇 |
| `ui.daimyo.leader` | 當主 |
| `ui.daimyo.kokudaka` | 石高 |
| `ui.daimyo.castles` | 城 |
| `ui.daimyo.officers` | 武將 |
| `ui.daimyo.rating` | 難易度評價 |
| `ui.daimyo.difficulty` | 難易度 |

### 6.3 HUD、快捷列、地圖（`ui.hud.* / ui.rail.* / ui.map.* / ui.march.eta`）

| key | 字串 |
|---|---|
| `ui.hud.gold` | 金錢 |
| `ui.hud.food` | 兵糧 |
| `ui.hud.soldiers` | 兵力 |
| `ui.hud.prestige` | 威信 |
| `ui.hud.deltaPerMonth` | 每月增減 |
| `ui.hud.soldiersCap` | 上限{max} |
| `ui.hud.taimeiActive` | 大命「{name}」生效中（餘{days}日） |
| `ui.hud.autosaveSuspendedTip` | 自動存檔已暫停：儲存空間不足。請刪除舊存檔或匯出備份。 |
| `ui.rail.domestic` | 內政 |
| `ui.rail.military` | 軍事 |
| `ui.rail.diplomacy` | 外交 |
| `ui.rail.officers` | 武將 |
| `ui.rail.policy` | 政策 |
| `ui.rail.corps` | 軍團 |
| `ui.rail.taimei` | 大命 |
| `ui.map.mode.faction` | 勢力圖 |
| `ui.map.mode.normal` | 一般地圖 |
| `ui.map.tooltip.castle` | {name}（{clan}）　兵{soldiers}　糧{food}石　耐久{durability} |
| `ui.map.tooltip.district` | {name}（{clan}）　{kokudaka}石　治安{security} |
| `ui.map.tooltip.districtSteward` | 領主：{steward} |
| `ui.map.tooltip.army` | {leader}隊（{clan}）　{soldiers}兵　士氣{morale} |
| `ui.map.tooltip.armyFood` | 兵糧尚可支{days}日 |
| `ui.map.path.total` | 預計{days}日 |
| `ui.map.path.subjugate` | （含制壓{days}日） |
| `ui.map.path.unreachable` | 無法抵達 |
| `ui.map.path.seaRoute` | 經海路 |
| `ui.map.order.selectTarget` | 選擇目的地（右鍵取消） |
| `ui.march.eta` | 約{days}日 |

### 6.4 城、郡、內政（`ui.castle.* / ui.district.* / ui.facility.* / ui.conscript.* / ui.budget.* / ui.transport.* / cmd.rice.*`）

| key | 字串 |
|---|---|
| `ui.castle.tab.overview` | 概要 |
| `ui.castle.tab.domestic` | 內政 |
| `ui.castle.tab.military` | 軍事 |
| `ui.castle.tab.transport` | 輸送 |
| `ui.castle.durability` | 耐久 |
| `ui.castle.garrison` | 兵力 |
| `ui.castle.morale` | 士氣 |
| `ui.castle.food` | 兵糧 |
| `ui.castle.lord` | 城主 |
| `ui.castle.changeLord` | 更換城主 |
| `ui.castle.districts` | 所轄郡 |
| `ui.castle.stationed` | 駐留武將 |
| `ui.castle.march` | 出陣 |
| `ui.castle.conscript` | 徵兵 |
| `ui.castle.foodDays` | 守城可支{days}日 |
| `ui.castle.underSiege` | 圍 |
| `ui.castle.armiesFromHere` | 在途我方部隊 |
| `ui.district.kokudaka` | 石高 |
| `ui.district.commerce` | 商業 |
| `ui.district.population` | 人口 |
| `ui.district.security` | 治安 |
| `ui.district.steward` | 領主 |
| `ui.district.direct` | 直轄 |
| `ui.district.potential` | {current}／{max} |
| `ui.district.devPolicy` | 開發方針 |
| `ui.district.devPolicyReadonly` | 受封郡由領主自行治理，方針為唯讀 |
| `ui.district.monthlyPop` | 月增 {delta}人 |
| `ui.district.riotRisk` | 一揆危險 |
| `ui.district.specialty` | 特產 |
| `ui.district.roads` | 街道 |
| `ui.facility.build` | 建造 |
| `ui.facility.demolish` | 拆除 |
| `ui.facility.queue` | 建造佇列 |
| `ui.facility.daysLeft` | 尚需{days}日 |
| `ui.facility.slotEmpty` | （空地） |
| `ui.facility.slotLocked` | （未開放） |
| `ui.facility.requireNotMet` | 未滿足建造條件：{reason} |
| `ui.conscript.policy` | 徵兵方針 |
| `ui.conscript.monthly` | 每月徵兵：約{amount}兵 |
| `ui.conscript.max` | 最大兵力：{max}兵 |
| `ui.budget.title` | 收支 |
| `ui.budget.incomeMonthly` | 每月收入 |
| `ui.budget.salary` | 家臣俸祿 |
| `ui.budget.policyUpkeep` | 政策維持 |
| `ui.budget.net` | 每月淨額 |
| `ui.budget.foodUpkeep` | 每月兵糧消耗 |
| `ui.budget.harvestForecast` | 秋收預估 |
| `ui.budget.foodMonthsLeft` | 兵糧可支撐{months}個月 |
| `ui.transport.title` | 輸送 |
| `ui.transport.target` | 輸送至 |
| `ui.transport.escort` | 護送武將 |
| `ui.transport.preview` | 預估{days}日・路徑：{path} |
| `cmd.transport.confirm` | 自{from}輸送至{to}，預計{days}日 |
| `cmd.transport.recall` | 撤回輸送隊 |
| `cmd.rice.buy` | 購入兵糧 |
| `cmd.rice.sell` | 出售兵糧 |

### 6.5 武將、褒賞、登用、捕虜、具申（`ui.officers.* / ui.officer.* / ui.reward.* / ui.recruit.* / ui.captive.* / ui.proposal.* / cmd.fief.*`）

| key | 字串 |
|---|---|
| `ui.officers.title` | 武將一覽 |
| `ui.officers.filter.location` | 所在城 |
| `ui.officers.filter.rank` | 身分 |
| `ui.officers.filter.title` | 役職 |
| `ui.officer.ldr` | 統率 |
| `ui.officer.val` | 武勇 |
| `ui.officer.int` | 知略 |
| `ui.officer.pol` | 政務 |
| `ui.officer.rank` | 身分 |
| `ui.officer.merit` | 功績 |
| `ui.officer.meritReady` | {name}功績已足，可推舉為{rank}。 |
| `ui.officer.loyalty` | 忠誠 |
| `ui.officer.loyaltyLow` | 忠誠低落 |
| `ui.officer.traits` | 特性 |
| `ui.officer.tactic` | 戰法 |
| `ui.officer.fief` | 知行 |
| `ui.officer.salary` | 俸祿 |
| `ui.officer.age` | 年齡 |
| `ui.officer.history` | 經歷 |
| `ui.officer.location` | 所在 |
| `ui.officer.marchingTo` | 出陣中→{target} |
| `ui.officer.kinship.kin` | 一門 |
| `ui.officer.kinship.fudai` | 譜代 |
| `ui.officer.kinship.tozama` | 外樣 |
| `ui.officer.action.reward` | 褒賞 |
| `ui.officer.action.move` | 移動 |
| `ui.officer.action.appoint` | 任命 |
| `ui.reward.title` | 褒賞 |
| `ui.reward.gold.small` | 賞賜（50貫） |
| `ui.reward.gold.medium` | 賞賜（100貫） |
| `ui.reward.gold.large` | 賞賜（200貫） |
| `ui.reward.promote` | 推舉身分 |
| `ui.reward.grantFief` | 加封知行 |
| `ui.reward.monthTotal` | 本月褒賞支出：{amount}貫 |
| `ui.reward.nextGain` | 此次可提升忠誠 +{value} |
| `ui.recruit.action` | 登用 |
| `ui.recruit.successRate` | 成功率約 {rate}% |
| `ui.recruit.cooldown` | 此人暫不願仕官（{days}日後可再訪） |
| `ui.captive.title` | 捕虜處置 |
| `ui.captive.recruit` | 招降 |
| `ui.captive.release` | 釋放 |
| `ui.captive.execute` | 處斬 |
| `ui.proposal.title` | 具申 |
| `ui.proposal.adopt` | 採納 |
| `ui.proposal.reject` | 駁回 |
| `ui.proposal.rejectAll` | 全部駁回 |
| `ui.proposal.cost` | 預估費用：{amount}貫 |
| `ui.proposal.from` | {name}（{title}）呈報： |
| `cmd.fief.appoint` | 任命領主 |
| `cmd.fief.dismiss` | 罷免領主 |
| `cmd.fief.confirmDismiss` | 罷免{name}將使其忠誠下降，確定執行？ |
| `ui.fief.limitReached` | {name}的知行已達身分上限 |
| `ui.fief.notInCastle` | 武將須駐於該郡所屬城 |

### 6.6 軍事：出陣、部隊、合戰、攻城、軍團（`ui.march.* / ui.army.* / ui.battle.* / ui.siege.* / ui.corps.* / cmd.*`）

| key | 字串 |
|---|---|
| `ui.march.title` | 出陣編成 |
| `ui.march.leader` | 大將 |
| `ui.march.sub` | 副將 |
| `ui.march.selectGeneral` | 選擇大將 |
| `ui.march.selectDeputies` | 選擇副將（至多{max}名） |
| `ui.march.soldiers` | 兵數 |
| `ui.march.food` | 攜帶兵糧 |
| `ui.march.carryDays` | 攜糧日數 |
| `ui.march.foodPreview` | 攜帶兵糧：{food}石（城內餘{rest}石） |
| `ui.march.troopCap` | 帶兵上限：{cap}人 |
| `ui.march.target` | 目標 |
| `ui.march.pickTarget` | 請在地圖上點選目標 |
| `ui.march.pathSummary` | {from}→{to}（經 {via}）・預估{days}日 |
| `ui.march.estDays` | 預估{days}日 |
| `cmd.march.confirm` | 出陣 |
| `ui.army.status.marching` | 行軍中 |
| `ui.army.status.engaged` | 交戰中 |
| `ui.army.status.sieging` | 攻城中 |
| `ui.army.status.subjugating` | 制壓中 |
| `ui.army.status.returning` | 歸還中 |
| `ui.army.status.routed` | 潰走中 |
| `ui.army.status.holding` | 駐留中 |
| `ui.army.changeTarget` | 變更目標 |
| `ui.army.recall` | 撤返 |
| `cmd.army.return` | 歸還 |
| `cmd.army.autoReturn` | 自動歸還 |
| `ui.battle.prompt` | 是否發動合戰？ |
| `cmd.battle.open` | 發動合戰 |
| `ui.battle.saihai` | 采配 |
| `ui.battle.tick` | 第{tick}刻／{max}刻 |
| `ui.battle.log` | 戰況記錄 |
| `ui.battle.logLine` | [{tick}刻] {text} |
| `cmd.battle.move` | 移動 |
| `cmd.battle.attack` | 攻擊 |
| `cmd.battle.tactic` | 戰法 |
| `cmd.battle.delegate` | 委任 |
| `cmd.battle.delegateAll` | 全軍委任 |
| `ui.battle.retreat` | 撤退 |
| `ui.battle.retreatConfirm` | 撤退將使士氣受挫並受追擊，確定撤退？ |
| `ui.battle.honjinFallen` | 本陣陷落！ |
| `ui.battle.victory` | 合戰勝利 |
| `ui.battle.defeat` | 合戰敗北 |
| `ui.battle.result.lossOurs` | 我方損兵 {count}人 |
| `ui.battle.result.lossEnemy` | 敵方損兵 {count}人 |
| `ui.battle.result.merit` | 獲得功績 {merit} |
| `ui.battle.result.awe` | 威風：{level} |
| `ui.battle.timeFrozen` | 合戰進行中，天下大勢暫停 |
| `ui.siege.title` | {castle}攻圍 ─ 第{days}日 |
| `ui.siege.assault` | 強攻 |
| `ui.siege.encircle` | 包圍 |
| `ui.siege.encircleNeed` | 包圍需兵力達城兵{ratio}倍 |
| `ui.siege.castleFoodEst` | 城糧　估 {days}日 |
| `cmd.siege.betrayal` | 發動內應 |
| `ui.corps.title` | 軍團 |
| `ui.corps.leader` | 軍團長 |
| `ui.corps.castles` | 所轄城 |
| `ui.corps.directive.advance` | 攻略 |
| `ui.corps.directive.hold` | 固守 |
| `ui.corps.directive.develop` | 開發 |
| `ui.corps.gold` | 軍團金庫 |
| `ui.corps.remitted` | 上月上繳 {gold}貫 |
| `cmd.corps.create` | 編成軍團 |
| `cmd.corps.dissolve` | 解散軍團 |
| `cmd.corps.assignCastle` | 劃撥城 |
| `cmd.corps.removeCastle` | 收回城 |

### 6.7 外交、朝廷、幕府、調略（`ui.diplomacy.* / ui.court.* / ui.shogunate.* / ui.plot.* / cmd.diplomacy.*`）

| key | 字串 |
|---|---|
| `ui.diplomacy.title` | 外交 |
| `ui.diplomacy.tab.clans` | 勢力 |
| `ui.diplomacy.tab.court` | 朝廷 |
| `ui.diplomacy.tab.shogunate` | 幕府 |
| `ui.diplomacy.trust` | 信用 |
| `ui.diplomacy.sentiment` | 感情 |
| `ui.diplomacy.atWar` | 交戰中 |
| `ui.diplomacy.pactNone` | 無協定 |
| `ui.diplomacy.pactRemaining` | {pact}（剩餘{months}月） |
| `ui.diplomacy.assignWork` | 指派外交工作 |
| `ui.diplomacy.workOfficer` | 擔當武將 |
| `ui.diplomacy.monthlyCost` | 每月費用 {gold}貫 |
| `ui.diplomacy.outlook.high` | 成功見込：高 |
| `ui.diplomacy.outlook.mid` | 成功見込：中 |
| `ui.diplomacy.outlook.low` | 成功見込：低 |
| `ui.diplomacy.cooldown` | 冷卻中（至{date}） |
| `cmd.diplomacy.proposeAlliance` | 締結同盟 |
| `cmd.diplomacy.proposeCeasefire` | 請求停戰 |
| `cmd.diplomacy.proposeMarriage` | 締結婚姻同盟 |
| `cmd.diplomacy.demandVassal` | 從屬勸告 |
| `cmd.diplomacy.offerVassal` | 從屬提案 |
| `cmd.diplomacy.requestReinforce` | 請求援軍 |
| `cmd.diplomacy.breakPact` | 破棄協定 |
| `cmd.diplomacy.breakPactConfirm` | 確定要破棄與{clan}的{pact}嗎？信用將歸零，威信與各勢力感情將大幅下降。 |
| `ui.court.title` | 朝廷 |
| `ui.court.favor` | 朝廷友好度 |
| `ui.court.rank` | 官位 |
| `ui.court.requestRank` | 請求敘任 |
| `ui.court.startDonation` | 開始獻金工作 |
| `ui.court.stopDonation` | 停止獻金工作 |
| `ui.court.donationAmount` | 每月獻金 {gold}貫（固定） |
| `ui.court.donationMonths` | 已投入{months}個月 |
| `ui.court.mediation` | 停戰斡旋 |
| `ui.court.mediationTarget` | 斡旋對象 |
| `ui.court.nextRankNeed` | 下一階：{rank}（友好度{favor}・一次性獻金{gold}貫） |
| `ui.shogunate.title` | 幕府 |
| `ui.shogunate.favor` | 幕府友好度 |
| `ui.shogunate.titleLabel` | 役職 |
| `ui.shogunate.requestTitle` | 請求任官 |
| `ui.shogunate.startDonation` | 開始獻金工作 |
| `ui.shogunate.stopDonation` | 停止獻金工作 |
| `ui.shogunate.donationAmount` | 每月獻金 {gold}貫（固定） |
| `ui.shogunate.donationMonths` | 已投入{months}個月 |
| `ui.shogunate.nominate` | 擁立將軍 |
| `ui.shogunate.patron` | 擁立者：{clan} |
| `ui.shogunate.collapsed` | 幕府已滅亡 |
| `ui.plot.title` | 調略 |
| `ui.plot.ongoing` | 進行中調略（{n}） |
| `ui.plot.kind` | 種別 |
| `ui.plot.target` | 目標 |
| `ui.plot.investGold` | 投入金錢 |
| `ui.plot.progress` | 進度 |
| `ui.plot.remaining` | 剩餘 |
| `ui.plot.ready` | 就緒 |
| `ui.plot.successChance` | 預估成功率 {pct}% |
| `ui.plot.activateBetrayal` | 發動內應 |
| `ui.plot.executor` | 執行武將 |
| `ui.plot.newPlot` | 新調略 |
| `ui.plot.targetPicker` | 在地圖／名簿選擇 |
| `ui.plot.start` | 著手調略 |
| `ui.plot.cancel` | 中止 |

朝廷／幕府頁獻金工作區塊（11 §3.8，勘誤 E-27／三輪裁決 2）補充說明：進行中／選擇執行武將之標籤
兩頁皆重用既有 `ui.diplomacy.workOfficer`（擔當武將），非本表新增列；幕府頁獻金字串為本輪新增
`ui.shogunate.startDonation/stopDonation/donationAmount/donationMonths`（比照朝廷頁 `ui.court.*` 模式）。

調略 Panel（11 §3.8.1，勘誤 E-66）補充說明：`ui.plot.remaining` 為欄位標題，儲存格內實際
天數沿用既有 `ui.common.days`（`{days}日`）；新調略精靈步驟③之「執行武將」重用既有
`ui.plot.executor`、成功率預覽重用既有 `ui.plot.successChance`；精靈頁尾的「取消」（退出
精靈、不送出）重用既有 `ui.common.cancel`（取消），非本表新增列——僅列表中已在進行的
調略之「中止」動作為 `ui.plot.cancel`（新增，語意為中止已送出的調略，與精靈的取消不同）。

### 6.8 政策、大命、事件（`ui.policy.* / ui.taimei.* / ui.event.*`）

| key | 字串 |
|---|---|
| `ui.policy.title` | 政策 |
| `ui.policy.active` | 生效中 {n}／{max} |
| `ui.policy.adopt` | 施行 |
| `ui.policy.revoke` | 廢止 |
| `ui.policy.statusActive` | 施行中 |
| `ui.policy.statusReady` | 可施行 |
| `ui.policy.locked` | 未解鎖：{condition} |
| `ui.policy.exclusive` | 與「{name}」互斥 |
| `ui.policy.cooldown` | 廢止後冷卻中（{months}個月） |
| `ui.policy.upkeep` | 月{gold}貫 |
| `ui.taimei.title` | 大命 |
| `ui.taimei.invoke` | 發動大命 |
| `ui.taimei.confirm` | 以威信{cost}點發動「{name}」？ |
| `ui.taimei.stateLocked` | 未解鎖（需威信{need}） |
| `ui.taimei.stateReady` | 可發動 |
| `ui.taimei.stateActive` | 生效中（餘{days}日） |
| `ui.taimei.stateCooldown` | 冷卻中（餘{days}日） |
| `ui.taimei.kenkinOverflow` | 倉廩將滿，預估僅能入庫{food}石 |
| `ui.event.continue` | 繼續 |
| `ui.event.choiceLocked` | 條件不足：{reason} |
| `ui.event.pendingBanner` | 歷史的岔路——請做出抉擇 |

### 6.9 月初摘要、報告中心、結局（`ui.summary.* / ui.reports.* / ui.ending.*`）

| key | 字串 |
|---|---|
| `ui.summary.title` | {date}　月初摘要 |
| `ui.summary.income` | 收入 |
| `ui.summary.expense` | 支出 |
| `ui.summary.food` | 兵糧 |
| `ui.summary.domestic` | 領內動靜 |
| `ui.summary.world` | 天下動靜 |
| `ui.summary.proposalsHandled` | 具申 {count}件已處理 |
| `ui.summary.continue` | 關閉並繼續 |
| `ui.reports.title` | 報告中心 |
| `ui.reports.empty` | 目前沒有任何報告 |
| `ui.reports.tab.all` | 全部 |
| `ui.reports.unread` | {count}則未讀 |
| `ui.reports.goto` | 前往 |
| `ui.reports.importantOnly` | 只看重要 |
| `ui.reports.cat.domestic` | 內政 |
| `ui.reports.cat.military` | 軍事 |
| `ui.reports.cat.diplomacy` | 外交 |
| `ui.reports.cat.personnel` | 人事 |
| `ui.reports.cat.event` | 事件 |
| `ui.reports.cat.system` | 系統 |
| `ui.ending.victory.unification` | 天下布武，四海歸一 |
| `ui.ending.victory.tenkabito` | 奉戴朝廷，號令天下 |
| `ui.ending.defeat.noHeir` | {clanName}，就此斷絕 |
| `ui.ending.defeat.noCastle` | {clanName}的旗幟，自天下消失了 |
| `ui.ending.statYears` | 歷時：{years}年{months}月 |
| `ui.ending.statBattles` | 合戰：{fought}戰{won}勝 |
| `ui.ending.statMaxCastles` | 最大版圖：{count}城 |
| `ui.ending.statMaxKokudaka` | 最大石高：{koku}石 |
| `ui.ending.statOfficers` | 麾下家臣：{count}名 |
| `ui.ending.actionContinue` | 繼續治世 |
| `ui.ending.actionObserve` | 繼續觀戰 |
| `ui.ending.actionTitle` | 回到標題 |

### 6.10 系統選單、存讀檔、設定、除錯（`ui.system.* / ui.save.* / ui.load.* / ui.settings.* / ui.debug.*`）

| key | 字串 |
|---|---|
| `ui.system.resume` | 回到遊戲 |
| `ui.system.save` | 存檔 |
| `ui.system.load` | 讀檔 |
| `ui.system.settings` | 設定 |
| `ui.system.toTitle` | 回到標題 |
| `ui.system.confirmToTitle` | 尚有未存檔的進度，確定要回到標題畫面嗎？ |
| `ui.save.title` | 存檔 |
| `ui.load.title` | 讀檔 |
| `ui.save.slotManual` | 手動 {n} |
| `ui.save.slotAuto` | 自動 {n} |
| `ui.save.slotQuick` | 快速存檔 |
| `ui.save.empty` | （空） |
| `ui.save.corrupt` | （損壞的存檔） |
| `ui.save.summary` | {castles}城・{officers}將・{koku}石 |
| `ui.save.playtime` | 遊玩 {hours}時{minutes}分 |
| `ui.save.willMigrate` | 舊版存檔（v{from}），載入時將升級至 v{to} |
| `ui.save.action.save` | 存檔 |
| `ui.save.action.load` | 載入 |
| `ui.save.action.delete` | 刪除 |
| `ui.save.action.export` | 匯出 |
| `ui.save.action.exportRaw` | 匯出原始資料 |
| `ui.save.overwriteConfirm` | 要覆蓋「{label}」嗎？原存檔（{clan}・{date}）將無法復原。 |
| `ui.save.deleteConfirm` | 要刪除存檔「{label}」（{clan}・{date}）嗎？此動作無法復原。 |
| `ui.save.saved` | 已存檔至「{label}」 |
| `ui.save.quickSaved` | 已快速存檔 |
| `ui.save.deleted` | 已刪除存檔 |
| `ui.save.autosaveFailed` | 自動存檔失敗，本場遊戲已暫停自動存檔。請盡快手動存檔或匯出備份。 |
| `ui.save.import` | 匯入存檔 |
| `ui.save.importHint` | 將 .tenkafubu.json 檔案拖曳至此，或點擊選擇檔案 |
| `ui.save.importDropOverlay` | 放開以匯入存檔 |
| `ui.save.importPreview` | 匯入預覽 |
| `ui.save.importLoad` | 直接開始 |
| `ui.save.importStore` | 存入槽位 |
| `ui.save.importCancel` | 取消 |
| `ui.load.loadConfirm` | 尚有未存檔的進度，載入「{label}」將失去目前進度。要繼續嗎？ |
| `ui.load.quickLoadConfirm` | 尚有未存檔的進度，要讀取快速存檔嗎？ |
| `ui.load.quickEmpty` | 沒有快速存檔 |
| `ui.settings.title` | 設定 |
| `ui.settings.groupTime` | 時間與暫停 |
| `ui.settings.groupNotify` | 通知與地圖 |
| `ui.settings.groupDisplay` | 顯示 |
| `ui.settings.groupAudio` | 音訊 |
| `ui.settings.defaultSpeed` | 預設遊戲速度 |
| `ui.settings.autoPause` | 自動暫停 |
| `ui.settings.autoPause.monthStart` | 月初 |
| `ui.settings.autoPause.proposal` | 具申送達 |
| `ui.settings.autoPause.envoy` | 外交來使 |
| `ui.settings.autoPause.siege` | 我方城被圍 |
| `ui.settings.autoPause.battle` | 合戰可發動 |
| `ui.settings.autoPause.event` | 歷史事件 |
| `ui.settings.notificationFilter` | 通知過濾 |
| `ui.settings.notificationFilter.all` | 全部 |
| `ui.settings.notificationFilter.major` | 重要以上 |
| `ui.settings.notificationFilter.critical` | 僅重大 |
| `ui.settings.mapLabelDensity` | 地圖標籤密度 |
| `ui.settings.mapLabelDensity.high` | 高 |
| `ui.settings.mapLabelDensity.medium` | 中 |
| `ui.settings.mapLabelDensity.low` | 低 |
| `ui.settings.effects` | 地圖特效 |
| `ui.settings.uiScale` | 介面縮放 |
| `ui.settings.volume` | 主音量 |
| `ui.settings.language` | 語言 |
| `ui.settings.languageValue` | 繁體中文（台灣） |
| `ui.settings.reset` | 回復預設值 |
| `ui.settings.resetConfirm` | 要將所有設定回復為預設值嗎？ |
| `ui.debug.skipDays` | 跳轉{days}日 |
| `ui.debug.skipping` | 時間跳轉中……（{done}／{total}日） |
| `ui.debug.ai.title` | AI 決策紀錄 |
| `ui.debug.ai.filterClan` | 勢力篩選 |
| `ui.debug.ai.filterLayer` | 層級篩選 |
| `ui.debug.ai.layer.council` | 評定 |
| `ui.debug.ai.layer.reactive` | 反應 |
| `ui.debug.ai.layer.corps` | 軍團 |
| `ui.debug.ai.layer.steward` | 領主 |
| `ui.debug.ai.layer.castle` | 城主 |
| `ui.debug.ai.layer.proposal` | 具申 |
| `ui.debug.ai.noAction` | （評估後不行動） |
| `ui.debug.ai.empty` | 尚無決策紀錄 |
| `ui.debug.ai.scores` | 分數分解 |
| `ui.debug.ai.commands` | 下達指令 |
| `ui.debug.ai.budget` | 本tick AI 耗時：{ms}毫秒 |
| `ui.debug.ai.deferred` | 順延階段：{count}件 |

### 6.11 報告模板主表（`report.*`；含插值參數表）

「參數」欄列出模板之**顯示參數名**，由 §3.7(2) enrichment 自事件 payload 之持久 ID 導出
（**非 payload key 原樣**，五輪裁決 A/B）；number 參數（gold/food/soldiers/age…）原樣傳入。
「事件型別」欄＝該報告 key 之權威來源事件（02 §4.19 canonical）；`(…)` 標記 payload 分岔或
玩家視角（§3.7(3)）。事件型別欄空白（—）者＝無直接事件、由他報告合併承載或 UI 專有。

| key | 事件型別（02 §4.19） | 參數（§3.7(2) enrichment） | 字串 |
|---|---|---|---|
| `report.army.departed` | `army.departed` | leader, castle | {leader}隊自{castle}出陣。 |
| `report.army.arrived` | `army.arrived` | leader, place | {leader}隊抵達{place}。 |
| `report.army.returned` | `army.returned` | leader, castle | {leader}隊歸還{castle}。 |
| `report.army.subjugated` | `district.subjugated`(我方制壓) | leader, district | {leader}隊制壓{district}。 |
| `report.army.districtLost` | `district.subjugated`(我方失郡) | district, clan | {district}遭{clan}制壓！ |
| `report.army.noFood` | `army.starving` | army | {army}兵糧耗盡，士氣潰散中！ |
| `report.army.blocked` | `army.blocked` | army, place | {army}行軍受阻，於{place}待命。 |
| `report.field.begin` | `battle.started` | a, b, place | {a}與{b}於{place}交戰！ |
| `report.field.resolved` | `battle.ended`(第三方/平手) | place | {place}的戰鬥告一段落。 |
| `report.field.rout` | `army.routed` | army | {army}潰走！ |
| `report.battle.available` | `battle.kassenAvailable` | place | {place}可發動合戰！ |
| `report.battle.won` | `battle.ended`(勝方＝我方) | winner, place, loser | {winner}於{place}擊破{loser}！ |
| `report.battle.lost` | `battle.ended`(敗方＝我方) | loser, place, winner | {loser}於{place}敗於{winner}。 |
| `report.battle.awe.small` | `awe.triggered` | — | 威風（小）！鄰近敵郡望風歸順。 |
| `report.battle.awe.medium` | `awe.triggered` | — | 威風（中）！敵方諸郡動搖歸順。 |
| `report.battle.awe.large` | `awe.triggered` | clan | 威風（大）！{clan}威名震動天下！ |
| `report.siege.begin` | `siege.started` | castle, clan | {castle}遭{clan}包圍！ |
| `report.siege.relief` | `siege.relief` | castle | 援軍抵達{castle}，展開解圍戰！ |
| `report.siege.fallen` | `siege.ended` | castle | {castle}落城！ |
| `report.siege.repelled` | `siege.ended` | castle | {castle}擊退了圍城之敵。 |
| `report.march.failed.soldiers` | `command.rejected` | castle | 出陣失敗：{castle}兵力不足 |
| `report.march.failed.cap` | `command.rejected` | general, cap | 出陣失敗：超過{general}的帶兵上限（{cap}人） |
| `report.march.failed.food` | `command.rejected` | castle | 出陣失敗：{castle}兵糧不足 |
| `report.economy.income` | `economy.income` | month, gold | {month}月收入{gold}貫。 |
| `report.economy.harvest` | `economy.harvest` | food | 秋收！全領兵糧入庫{food}石。 |
| `report.economy.granaryOverflow` | `economy.granaryOverflow` | castle, food | {castle}米藏已滿，{food}石散失。 |
| `report.economy.castleStarving` | `economy.foodShortage` | castle | {castle}兵糧見底，士卒逃散！ |
| `report.economy.upkeepUnpaid` | `economy.upkeepUnpaid` | — | 金錢不足，本月俸祿未能全額發放，家臣心生不滿。 |
| `report.build.done` | `facility.completed` | castle, facility | {castle}的{facility}已落成。 |
| `report.transport.arrived` | `transport.arrived` | castle | 輸送隊已抵達{castle}。 |
| `report.transport.looted` | `transport.looted`(被劫方＝我方) | place, clan | 輸送隊於{place}遭{clan}劫掠！ |
| `report.transport.lootGain` | `transport.looted`(劫方＝我方) | place | 我軍於{place}劫獲敵方輸送隊。 |
| `report.policy.autoRevoked` | `policy.autoRevoked` | name | 金錢不足，政策「{name}」已自動廢止。 |
| `report.uprising.started` | `uprising.started` | district | {district}爆發一揆！ |
| `report.uprising.suppressed` | `uprising.ended`(suppressed) | district | {district}的一揆已被鎮壓。 |
| `report.uprising.subsided` | `uprising.ended`(subsided) | district | {district}的一揆自然平息。 |
| `report.officer.death` | `officer.died`(age) | name, age | {name}病歿，享年{age}歲。 |
| `report.officer.killedInAction` | `officer.died`(battle) | name, place | {name}於{place}戰死。 |
| `report.officer.defect` | `officer.defected` | name | {name}對待遇不滿，出奔而去！ |
| `report.officer.poached` | `plot.succeeded`(poach，我方失士) | name, clan | {name}被{clan}引拔，離開了我家！ |
| `report.officer.comingOfAge` | `officer.comingOfAge`(clanId≠null) | name, clan | {name}元服，加入{clan}。 |
| `report.officer.comingOfAgeRonin` | `officer.comingOfAge`(clanId=null) | name | {name}元服，然主家已亡，暫為浪人。 |
| `report.officer.loyaltyLow` | `officer.loyaltyLow` | name | {name}忠誠低落，恐有異心。 |
| `report.officer.promoted` | `officer.promoted` | name, rank | {name}升格為{rank}。 |
| `report.officer.recruited` | `officer.recruited`(ronin) | name | {name}仕官於我家。 |
| `report.officer.recruitFailed` | `officer.recruitFailed` | name | {name}婉拒了登用。 |
| `report.officer.captured` | `officer.captured` | name, clan | {name}被{clan}俘虜。 |
| `report.captive.recruited` | `officer.recruited`(captive) | name | {name}降伏，仕官於我家。 |
| `report.captive.released` | `officer.released` | name | 已釋放{name}，威信提升。 |
| `report.captive.executed` | `officer.executed` | name | 已處斬{name}。家中隱有不安。 |
| `report.clan.succession` | `clan.succession` | oldLeader, newLeader | {oldLeader}逝去，{newLeader}繼任家督。 |
| `report.clan.destroyed` | `clan.destroyed` | clanName | {clanName}滅亡了 |
| `report.proposal.submitted` | `proposal.submitted` | name | 收到{name}的具申。 |
| `report.proposal.expired` | `proposal.expired`(`reason='timeout'`) | name | {name}的具申已逾期作罷。 |
| `report.proposal.invalid` | `proposal.expired`(`reason='invalidated'`) | name | {name}的具申因情勢變化而作罷。 |
| `report.diplomacy.pactSigned` | `pact.signed` | a, b, pact | {a}與{b}締結{pact}。 |
| `report.diplomacy.pactExpired` | `pact.expired` | clan, pact | 與{clan}的{pact}已到期。 |
| `report.diplomacy.pactBroken` | `pact.broken` | clan, pact | {clan}破棄了與我方的{pact}！ |
| `report.diplomacy.envoyArrived` | `diplo.envoyArrived` | clan, proposal | {clan}遣使來訪：{proposal} |
| `report.diplomacy.proposalRejected` | `diplo.refused` | clan, proposal | {clan}拒絕了我方的{proposal}。 |
| `report.diplomacy.workStopped` | `diplo.workStopped` | target | 金錢不足，對{target}的外交工作已中止。 |
| `report.diplomacy.reinforceAgreed` | `diplo.reinforceAgreed` | clan, enemy | {clan}同意派遣援軍，協力對抗{enemy}。 |
| `report.court.rankGranted` | `court.rankGranted` | clan, rank | 朝廷敘任{clan}當主為{rank}。 |
| `report.court.mediationSuccess` | `court.mediationResult`(success，發起方視角) | clan, months | 朝廷斡旋成功，與{clan}停戰{months}月。 |
| `report.court.mediationFailed` | `court.mediationResult`(!success，發起方視角) | clan | 朝廷斡旋失敗，{clan}官位在我方之上。 |
| `report.court.mediationImposed` | `court.mediationResult`(success，目標方視角；七輪裁決 4) | clan, months | {clan}的朝廷斡旋奏效，我方被迫與其停戰{months}月。 |
| `report.court.mediationEvaded` | `court.mediationResult`(!success，目標方視角；七輪裁決 4) | clan | {clan}企圖藉朝廷斡旋逼我方停戰，未能得逞。 |
| `report.court.mediationSuccessOther` | `court.mediationResult`(success，第三方視角；七輪裁決 4) | a, b, months | 朝廷斡旋成立，{a}與{b}停戰{months}月。 |
| `report.court.mediationFailedOther` | `court.mediationResult`(!success，第三方視角；七輪裁決 4) | a, b | {a}對{b}的朝廷斡旋未能奏效。 |
| `report.shogunate.titleGranted` | `shogunate.titleGranted` | clan, title | 幕府任命{clan}為{title}。 |
| `report.shogunate.nominated` | `shogunate.nominated` | clan | {clan}上洛擁立將軍，威名遠播！ |
| `report.shogunate.patronLost` | `shogunate.patronLost`(當事勢力視角，餘 null) | — | 我方失去京都，將軍庇護不再。 |
| `report.shogunate.collapsed` | `shogunate.collapsed` | — | 室町幕府滅亡，諸役職效果盡失。 |
| `report.plot.poachSuccess` | `plot.succeeded`(poach) | officer, clan | {officer}自{clan}被引拔，前來仕官！ |
| `report.plot.rumorSuccess` | `plot.succeeded`(rumor) | target | 流言奏效，{target}軍心動搖。 |
| `report.plot.betrayalReady` | `plot.succeeded`(betrayal) | castle | 對{castle}的內應工作完成，攻城時可發動。 |
| `report.plot.betrayalActivated` | `plot.betrayalActivated` | castle | {castle}內應發動，城內士氣崩潰！ |
| `report.plot.failed` | `plot.failed` | clan, plot | 對{clan}的{plot}未能奏效。 |
| `report.plot.exposed` | `plot.exposed`(actor) | clan, plot | 我方對{clan}的{plot}敗露，兩家關係惡化！ |
| `report.plot.exposedByEnemy` | `plot.exposed`(target) | clan, plot | 發覺{clan}對我方進行{plot}！ |
| `report.event.fired` | `event.fired` | title | 發生事件：{title} |
| `report.taimei.invoked` | `taimei.invoked` | clanName, name | {clanName}發動大命「{name}」 |
| `report.taimei.expired` | `taimei.expired` | name | 大命「{name}」的效力已盡 |
| `report.victory.tenkabitoProgress` | `victory.tenkabitoProgress` | months | 天下人之路：條件已連續達成{months}／12月 |

> **`save.autosaveFailed` 非本表項（UI-only；六輪裁決 4）**：自動存檔失敗屬 **app 層 I/O 失敗**（IndexedDB 配額／寫入錯誤，非決定論、不入 core state／§5.4 golden hash），既非 02 §4.19 GameEvent、亦不經 UI 層 `renderReport`。原 `report.save.autosaveFailed` 一列已自本表移除；提示字串遷至 §6.10 `ui.save.autosaveFailed`（app 層 toast）。**消費者＝16 §5.3 autosave hook**（季首自動存檔失敗時直接以 app 層 UI 呈現），並配合 HUD 常駐警示 `ui.hud.autosaveSuspendedTip`（§6.3）。

> **`report.officer.meritReady` 非本表項（UI-only；七輪裁決 2）**：「功績達門檻可推舉」為 **state 可衍生**條件
> （`o.merit ≥ rankMeritThresholds[nextRank]`），06 §5.7 `gainMerit` 已停發本報告，不經 02 §4.19 事件、亦不經
> UI 層 `renderReport`。原 `report.officer.meritReady` 一列已自本表移除；字串遷至 §6.5 **`ui.officer.meritReady`**
> （武將一覽／詳細卡 badge）。**消費者＝11 武將一覽／詳細卡**（直讀 state 即時判斷是否顯示 badge，非讀報告匣）。

### 6.12 遊戲名詞（`term.*`）

| key | 字串 |
|---|---|
| `term.rank.ashigaruKumigashira` | 足輕組頭 |
| `term.rank.ashigaruTaisho` | 足輕大將 |
| `term.rank.samuraiTaisho` | 侍大將 |
| `term.rank.busho` | 部將 |
| `term.rank.karo` | 家老 |
| `term.rank.shukuro` | 宿老 |
| `term.rank.leader` | 當主 |
| `term.title.lord` | 城主 |
| `term.title.steward` | 領主 |
| `term.title.corpsLeader` | 軍團長 |
| `term.title.none` | 無役 |
| `term.castle.main` | 本城 |
| `term.castle.branch` | 支城 |
| `term.pact.alliance` | 同盟 |
| `term.pact.marriage` | 婚姻同盟 |
| `term.pact.ceasefire` | 停戰 |
| `term.pact.vassal` | 從屬 |
| `term.crank.none` | 無位無官 |
| `term.crank.ju5ge` | 從五位下 |
| `term.crank.ju5jo` | 從五位上 |
| `term.crank.ju4ge` | 從四位下 |
| `term.crank.ju4jo` | 從四位上 |
| `term.crank.ju3` | 從三位 |
| `term.crank.sho3` | 正三位 |
| `term.crank.ju2` | 從二位 |
| `term.crank.sho2` | 正二位 |
| `term.stitle.none` | 無役職 |
| `term.stitle.hokoshu` | 奉公眾 |
| `term.stitle.otomoshu` | 御供眾 |
| `term.stitle.shobanshu` | 相伴眾 |
| `term.stitle.kanrei` | 管領 |
| `term.stitle.fukushogun` | 副將軍 |
| `term.stitle.shogun` | 征夷大將軍 |
| `term.season.spring` | 春 |
| `term.season.summer` | 夏 |
| `term.season.autumn` | 秋 |
| `term.season.winter` | 冬 |
| `term.unit.gold` | 貫 |
| `term.unit.koku` | 石 |
| `term.unit.soldiers` | 兵 |
| `term.unit.people` | 人 |
| `term.unit.day` | 日 |
| `term.unit.month` | 月 |
| `term.devPolicy.agri` | 農業 |
| `term.devPolicy.commerce` | 商業 |
| `term.devPolicy.barracks` | 兵舍 |
| `term.conscript.low` | 低 |
| `term.conscript.mid` | 中 |
| `term.conscript.high` | 高 |
| `term.sentiment.devoted` | 親密 |
| `term.sentiment.friendly` | 友好 |
| `term.sentiment.neutral` | 普通 |
| `term.sentiment.wary` | 不信 |
| `term.sentiment.hostile` | 敵視 |
| `term.plot.poach` | 引拔 |
| `term.plot.rumor` | 流言 |
| `term.plot.betrayal` | 內應 |
| `term.awe.small` | 威風・小 |
| `term.awe.medium` | 威風・中 |
| `term.awe.large` | 威風・大 |
| `term.difficulty.easy` | 初級 |
| `term.difficulty.normal` | 中級 |
| `term.difficulty.hard` | 上級 |
| `term.ronin` | 浪人 |
| `term.facility.ichi` | 市 |
| `term.facility.komedoiya` | 米問屋 |
| `term.facility.heisha` | 兵舍 |
| `term.facility.umaya` | 馬廄 |
| `term.facility.kajiba` | 鍛冶場 |
| `term.facility.shagekijo` | 射擊場 |
| `term.facility.hyojosho` | 評定所 |
| `term.facility.minato` | 湊 |
| `term.facility.jisha` | 寺社 |
| `term.facility.nanbanji` | 南蠻寺 |
| `term.facility.inkyo` | 隱居所 |
| `term.facility.kura` | 藏 |
| `term.facility.toride` | 砦 |
| `term.facility.gakumonjo` | 學問所 |
| `term.facility.ikan` | 醫館 |
| `term.facility.jokaku` | 城郭強化 |

### 6.13 戰法（`tac.<slug>.name / .desc`；機制數值見 07 §3.8）

| key | 字串 |
|---|---|
| `tac.charge.name` | 突擊 |
| `tac.charge.desc` | 一段時間內攻擊大幅提升，但承受的傷害也隨之增加。 |
| `tac.volley.name` | 齊射 |
| `tac.volley.desc` | 立即對目標部隊射擊造成傷害，不受反擊。 |
| `tac.inspire.name` | 鼓舞 |
| `tac.inspire.desc` | 立即振奮自身與同陣友軍的士氣。 |
| `tac.taunt.name` | 挑撥 |
| `tac.taunt.desc` | 迫使目標部隊以本隊為攻擊對象，並削弱其攻擊。 |
| `tac.disrupt.name` | 攪亂 |
| `tac.disrupt.desc` | 使目標部隊無法移動、攻擊減弱，並解除其進行中的戰法。 |
| `tac.hold.name` | 堅守 |
| `tac.hold.desc` | 一段時間內大幅減少承受的傷害，但期間不可移動。 |
| `tac.fire-arrow.name` | 火矢 |
| `tac.fire-arrow.desc` | 攻擊提升，並持續灼燒目標所在陣的旗力。 |
| `tac.cavalry.name` | 騎突 |
| `tac.cavalry.desc` | 短時間內攻擊大幅提升，且可於移動後立即發起攻擊。 |
| `tac.triple-volley.name` | 鐵砲三段 |
| `tac.triple-volley.desc` | 對目標連續三次射擊，不受反擊。冷卻時間較長。 |
| `tac.last-stand.name` | 背水 |
| `tac.last-stand.desc` | 攻擊極大提升、承受傷害增加；效果期間全軍死戰不潰。 |
| `tac.pin.name` | 牽制 |
| `tac.pin.desc` | 使目標部隊無法移動（仍可攻擊）。 |
| `tac.heal.name` | 治療 |
| `tac.heal.desc` | 立即回復部分兵數。 |

### 6.14 特性說明（`trait.<slug>.desc`；名稱屬 `TRAITS` 靜態表，06 §4）

06 §3.3 的 30 個特性各一條說明；定性描述，精確數值由 UI 依 `TraitDef.effects` 渲染（§3.6）。
特性清單若經 06/07 實作調整，desc key 依 `${traitId}.desc` 慣例同步增補。

| key | 字串 |
|---|---|
| `trait.gunshin.desc` | 合戰中，所率部隊以更高的能力值計算攻防與戰法威力。解鎖戰法「鼓舞」。 |
| `trait.ifudodo.desc` | 合戰勝利時的威風等級提升一級；大威風的波及範圍更廣。 |
| `trait.boshin.desc` | 執行調略時成功率大幅提升，且所需費用減少。 |
| `trait.hitotarashi.desc` | 登用與招降極易成功；同城我方武將的忠誠隨之提高。 |
| `trait.onimusha.desc` | 武勇系戰法的威力提升。 |
| `trait.chikujo.desc` | 擔任建設負責人時，城下施設的工期大幅縮短。 |
| `trait.naisei.desc` | 擔任開發負責人或知行領主時，郡開發效率提升。 |
| `trait.gaiko.desc` | 執行外交工作時，信用累積更快。 |
| `trait.teppo.desc` | 部隊遠程攻擊與遠程系戰法的威力提升。解鎖戰法「鐵砲三段」。 |
| `trait.kiba.desc` | 部隊近戰攻擊與突擊系戰法的威力提升。解鎖戰法「騎突」。 |
| `trait.ninja.desc` | 執行調略時成功率提升。 |
| `trait.kojo.desc` | 率隊攻城時，每日對城耐久的傷害提升。 |
| `trait.rojo.desc` | 擔任城主之城被圍時，耐久損傷與士氣下降皆大幅減緩。 |
| `trait.chiebukuro.desc` | 更常提出具申，且提案品質更高。 |
| `trait.chushin.desc` | 忠誠恆常維持高檔，絕不出奔，也不受引拔。 |
| `trait.kaizoku.desc` | 率隊經海路行軍時，速度大幅提升。 |
| `trait.nosei.desc` | 石高開發效率提升。 |
| `trait.shosai.desc` | 商業開發效率提升。 |
| `trait.reisei.desc` | 所率部隊士氣不易下降，也更不易潰走。 |
| `trait.goketsu.desc` | 部隊攻擊力提升。 |
| `trait.keigan.desc` | 執行登用時成功率提升。 |
| `trait.jinsei.desc` | 治理之郡的治安每月額外提升。 |
| `trait.shinsoku.desc` | 率隊陸路行軍時速度提升。 |
| `trait.heitan.desc` | 所率部隊行軍與圍城的兵糧消耗減少。 |
| `trait.boshu.desc` | 擔任城主之城的徵兵所得兵力增加。 |
| `trait.jinbo.desc` | 同城我方武將的忠誠略為提高。 |
| `trait.yashin.desc` | 功績獲得增加，但忠誠不易維持。 |
| `trait.chotei.desc` | 朝廷獻金與官位申請的費用減少。 |
| `trait.hayamimi.desc` | 所在城不易遭敵方調略得逞。 |
| `trait.seiatsu.desc` | 率隊制壓敵郡所需的時間縮短。 |

### 6.15 政策（`pol.<slug>.name / .desc`；`PolicyDef.nameKey` 指向 name，05 §4）

| key | 字串 |
|---|---|
| `pol.rakuichi.name` | 樂市樂座 |
| `pol.rakuichi.desc` | 全勢力的商業收入與商業開發成長提升。 |
| `pol.kenchi.name` | 檢地 |
| `pol.kenchi.desc` | 秋收增加、直轄郡開發加快、受封郡上繳率提高。 |
| `pol.tenmasei.name` | 傳馬制 |
| `pol.tenmasei.desc` | 輸送隊與部隊的移動速度提升。 |
| `pol.jishahogo.name` | 寺社保護 |
| `pol.jishahogo.desc` | 全郡治安每月上升，一揆更難發生。 |
| `pol.nanban.name` | 南蠻貿易 |
| `pol.nanban.desc` | 每月獲得額外金錢，並解鎖鐵砲購入。 |
| `pol.sekisho.name` | 關所撤廢 |
| `pol.sekisho.desc` | 商業開發成長與人口成長提升。 |
| `pol.jokashuju.name` | 城下集住 |
| `pol.jokashuju.desc` | 城的最大兵力與徵兵量提升，人口成長略降。 |
| `pol.meyasubako.name` | 目安箱 |
| `pol.meyasubako.desc` | 治安與家臣忠誠上升，具申更為頻繁。 |
| `pol.heinobunri.name` | 兵農分離 |
| `pol.heinobunri.desc` | 徵兵不再損及治安，部隊士氣上限提升，駐兵糧耗略增。 |
| `pol.goningumi.name` | 五人組 |
| `pol.goningumi.desc` | 治安大幅上升，一揆與敵方調略更難得逞。 |
| `pol.kakishuchu.name` | 火器集中 |
| `pol.kakishuchu.desc` | 鐵砲隊攻擊提升，鐵砲購入更為便宜。 |
| `pol.enkokinko.name` | 遠交近攻 |
| `pol.enkokinko.desc` | 外交工作效率提升，對遠方勢力的信用成長加快。 |

### 6.16 事件外框與系統錯誤（`evt.* / err.*`）

| key | 字串 |
|---|---|
| `evt.kind.historical` | 歷史事件 |
| `evt.kind.generic` | 領內外異變 |
| `evt.fallback.title` | （佚失的事件） |
| `evt.fallback.body` | 此事件的內容資料已無法讀取。 |
| `evt.choice.byRegent` | （由重臣代為決斷） |
| `err.save.quotaExceeded` | 儲存空間不足，無法寫入存檔。請刪除舊存檔，或匯出目前進度作為備份。 |
| `err.save.tooLarge` | 存檔資料異常過大，寫入已取消。請回報此問題並匯出目前進度。 |
| `err.save.writeFailed` | 存檔寫入失敗。請重試，或匯出目前進度作為備份。 |
| `err.load.corrupt` | 存檔資料損壞，無法載入。 |
| `err.load.invalidFile` | 檔案格式不正確，並非《天下布武》的存檔。 |
| `err.load.fileTooLarge` | 檔案過大，無法匯入。 |
| `err.load.newerVersion` | 此存檔由較新版本的遊戲（存檔格式 v{version}）建立，目前版本無法載入。請更新遊戲後再試。 |
| `err.load.migrationGap` | 找不到存檔升級路徑（v{version}），無法載入。請回報此問題。 |
| `err.load.emptySlot` | 此槽位沒有存檔。 |

`SaveErrorCode`（16 §4.3，kebab-case）→ `err.*` 映射：`quota-exceeded`→`err.save.quotaExceeded`、
`too-large`→`err.save.tooLarge`、`write-failed`→`err.save.writeFailed`、`corrupt`→`err.load.corrupt`、
`invalid-file`→`err.load.invalidFile`、`file-too-large`→`err.load.fileTooLarge`、
`newer-version`→`err.load.newerVersion`、`migration-gap`→`err.load.migrationGap`、
`empty-slot`→`err.load.emptySlot`。

### 6.17 指令拒絕訊息（`cmd.reject.*`；03 §6.2 種子＋10 §6.3 擴充，全數收錄）

| key | 字串 |
|---|---|
| `cmd.reject.generic` | 指令無法執行 |
| `cmd.reject.notOwner` | 目標不屬於我方勢力 |
| `cmd.reject.invalidTarget` | 目標無效或已不存在 |
| `cmd.reject.insufficientGold` | 金錢不足（需要{cost}貫） |
| `cmd.reject.insufficientFood` | 兵糧不足（需要{cost}石） |
| `cmd.reject.insufficientTroops` | 兵力不足（需要{count}人） |
| `cmd.reject.officerBusy` | {name}正在執行其他任務 |
| `cmd.reject.alreadyActive` | 該項目已在執行中 |
| `cmd.reject.rankTooLow` | {name}的身分不足以擔任此職 |
| `cmd.reject.pathBlocked` | 無法規劃通往目標的路徑 |
| `cmd.reject.taimeiLocked` | 威信不足，尚未解鎖此大命 |
| `cmd.reject.taimeiBusy` | 已有大命生效中 |
| `cmd.reject.taimeiCooldown` | 大命冷卻中（餘{days}日） |
| `cmd.reject.gameOver` | 大局已定，無法再下達指令 |
| `cmd.reject.debugOnly` | 此指令僅限除錯模式使用 |
| `cmd.reject.delegatedToCorps` | 此城已委由軍團管理，無法直接下令 |
| `cmd.reject.prestigeShort` | 威信不足（需要{cost}點） |

---

## 7. 實作任務清單

- [ ] **T1　`zh-TW.ts` 主表**：依 §6 全部小節照抄為 `as const` 物件字面值（§3.1 骨架）。
      驗收：條目數 ≥ 480；TypeScript 編譯通過（無重複 key）；§5.6 第 2、3 項掃描通過
      （key 格式、簡體字／日文新字體黑名單）。
- [ ] **T2　`index.ts`：t()／hasKey()／getMissingKeys()**：§3.2／§3.3／§5.1／§5.2。
      驗收：單元測試——存在 key 正常插值；number 參數千分位（`t(k,{soldiers:3000})` 含
      `3,000兵`）；缺 key DEV 回 `⟦key⟧` 且 console.warn 恰一次、PROD 回 key；
      缺參數保留 `{name}` 原樣；多餘參數忽略。
- [ ] **T3　`format.ts` 格式化函式**：§5.3／§5.4 五函式＋ `sentimentTermKey`。
      驗收：`formatNumber(1234567)==='1,234,567'`；`formatNumber(-5)==='−5'`（U+2212）；
      `formatSigned(0)==='±0'`；`formatDate(0)==='1560年1月1日'`、
      `formatDate(129)==='1560年5月10日'`（與 02 §5.6 換算一致）；
      `formatQuantity(12500,'term.unit.koku')==='12,500石'`；
      `sentimentTermKey` 五檔邊界值（60／20／−20／−60）各有測試。
- [ ] **T4　`renderReport`／`deriveReportMessage`（UI 層，`src/ui/report/renderReport.ts`）**：§3.7
      契約——key 登錄（§6.11 事件型別欄）＋(2) enrichment 導出＋(3) 玩家視角/payload 變體＋(4) transient
      fallback＋(5) 排除清單（五輪裁決 A）。**core 不得 import 本檔**（§3.1）。
      驗收：§5.6 第 5 項——每個產報告事件型別的假事件＋state 均解出存在的 key、參數 ⊆ enrichment 導出集；
      `battle.ended`／`district.subjugated` 各視角分流正確；`time.monthStart`／`policy.enacted`／
      `proposal.resolved`／`conscript.completed` 等排除事件回傳 null；`command.rejected` 直通 `reasonKey`。
- [ ] **T5　動態 key 模式覆蓋測試**：§3.4.2 表逐列展開（enum 全值）斷言 key 存在
      （6 身分＋5 協定＋8 官位＋5 役職＋4 季節＋3 方針＋3 徵兵＋16 施設＋12 戰法×2＋
      30 特性 desc＋12 政策×2＋9 存檔錯誤…）。
      驗收：測試全綠；新增 enum 值而未補字串時測試必然失敗（防漂移）。
- [ ] **T6　硬編碼掃描接線**：17 的掃描腳本納入本文件 §3.4.3 高風險字對照與
      「UI 元件內禁止中文字面值」規則（12 §3.2 通則）。
      驗收：於任一 `src/ui/**` 檔案植入中文字面值或簡體字，CI 掃描失敗。
- [ ] **T7　來源文件正名落實**：實作全程使用 §3.5 定案 key；`tactic.*`／`error.*`／
      舊 `ui.ending.victory` 等來源 key 不得出現在程式碼中。
      驗收：全域 grep `t('tactic.`、`t('error.`、`t('ui.ending.victory'`（無子段）零命中。
- [ ] **T8　19-glossary 一致性抽查**：19 完成後，將其對照表加入 §5.6 第 3 項掃描
      （同義異字黑名單：聲望／城堡／士兵／糧食／金幣…）。
      驗收：`zh-TW.ts` 與 19 術語逐字一致；抽查腳本納入 CI。

---

## 8. 設計決策記錄

- **D1｜i18n 模組拆三檔（zh-TW.ts／index.ts／format.ts）**：00 §3 僅列 `zh-TW.ts`；
  將 500 條字串與執行邏輯同檔會使字串表難以人工審閱與掃描（17 的黑名單掃描以「純資料檔」
  為前提最單純）。拆檔後 `zh-TW.ts` 保持零邏輯純資料。此為對 00 目錄樹的最小擴充，
  不牴觸其任何規範。
- **D2｜不引入任何 BAL 常數、不擴充 UI.\* 表**：依 12 §8 D1 的先例，純呈現數值不進
  `BAL`；本文件僅有的門檻（感情分檔 60/20/−20/−60）寫死於 `format.ts` 單一處。
  若日後要調整，改 `format.ts` 即可，不影響模擬與存檔。
- **D3｜13 為字串 key 的最終定案者，衝突以 §3.5 表裁定且不設別名**：11/12 明文
  「key 與文案由 13 定案」、05～08/16 明文「併入 13 主表」，故正名（`tactic.*`→`tac.*`、
  `error.*`→`err.*`、重複 key 合併）屬本文件職權。不提供舊 key 別名，避免雙 key 漂移；
  §7 T7 以 grep 驗收。取捨：實作者讀來源文件時可能先看到舊 key，故 §3.5 表逐條列出、
  一查即得。
- **D4｜名詞歸屬三分法（§3.6）**：專有名詞入資料 `name`（00 §8）、系統名詞入 i18n、
  說明文入 i18n。尊重各擁有文件的既有欄位設計——05 的施設／政策用 `nameKey`（i18n）、
  06 的特性與 10 的大命用靜態 `name`（型錄資料）——不強行統一，因統一需修改高優先序
  文件的型別。i18n 的 `trait.*` 區段因此只含 desc。
- **D5｜特性／戰法／政策說明文採定性描述、不嵌數值**：平衡數值由 15 定案且會迭代；
  字串內嵌數字必然過期。精確數值由 UI 自 `TraitDef.effects`／`TacticDef`／`BAL.*`
  以通用格式器渲染於 tooltip 明細列，說明文只講機制方向。
- **D6｜t() 對 number 參數自動千分位、曆法值禁用 number 參數**：報告 payload 幾乎全是
  數量（兵、石、貫），自動格式化可杜絕整批「忘了千分位」的缺陷；唯一反例是年份
  （1560 會變 1,560），故立規則：年月日一律經 `formatDate`／`formatYearMonth` 轉字串後
  傳入，主表所有模板已依此設計（無任何 `{year}` number 參數；`ui.summary.title` 用
  `{date}`）。§5.6 第 5 項測試防止回歸。
- **D7｜缺 key 產品環境回傳 key 本身而不擲例外**：戰報在 tick 迴圈中高頻渲染，
  一個缺 key 不應讓整局遊戲崩潰；key 本身（`report.siege.fallen`）對玩家仍具最低可讀性，
  且 DEV 期的 `⟦key⟧` 標示＋覆蓋測試（§5.6）使缺 key 幾乎不可能流入產品。
- **D8｜感情顯示分檔定義在 13 而非 08**：08 只定義連續值（-100..100）與其變動；
  「五檔中文標籤」純屬呈現層翻譯（同 12 的士氣點分級），放在 i18n 的格式器旁最內聚。
  若 08 日後需要機制性分檔（如行動門檻），屆時於 08 另立 BAL 常數，與本顯示分檔無關。
- **D9｜`report.*` key 不強制等於 `'report.'+event.type`**：多數依預設規則，但保留
  變體（死因、威風等級、調略種類）與歷史沿用 key（`report.siege.begin` 對
  `siege.started`）。以 §3.7 映射表為單一登錄點，比強行改名事件型別（02/03 職權）成本低。
- **D10｜v1.0 不做字串抽換／模組懶載入**：全表約 500 條、UTF-8 約 40KB，直接打包
  進主 bundle 即可；懶載入徒增載入狀態處理。多語系化（含 key 不變、換表）留待未來，
  屆時 `zhTW` 物件換成表選擇器即可，`t()` 簽名不變。
- **D11｜E-70：key 正規式首段允許連字號**（2026-07-07，依 `plan/19-glossary.md` §3.13
  E-70）：§3.4.1 key 字元規則正規式第一段由 `[a-z][a-zA-Z0-9]*` 改為 `[a-z][a-zA-Z0-9-]*`，
  使嵌入實體 slug 的首段（如 `tac.fire-arrow.name`）與後段（如 `report.save.autosave-failed`）
  皆能通過 `tools/validate.ts` 與 17 的格式驗證；先前僅後段允許連字號，與同節「嵌入 slug
  的段允許連字號」之敘述及 `tac.fire-arrow.*` 既有 key 相矛盾。
- **D12｜E-72：移除 §3.4.3 行內誤字形，改引 19 §3.12**（2026-07-07，依
  `plan/19-glossary.md` §3.13 E-72）：原「高風險字對照（正→誤）」於括號內嵌日文新字體
  誤字形示例；因本文件不在禁用字掃描 allowlist（19 §4 `FORBIDDEN_ALLOWLIST_FILES`）之列，
  該行會遭 17 掃描器自傷。改為僅列繁體正字並引用 `plan/19-glossary.md` §3.12 之完整
  「正→誤」對照表，本文件不再內嵌任何誤字形。
- **D13｜E-30：報告事件型別欄全面改採 02 §4.19 canonical 名**（2026-07-10，依
  `plan/19-glossary.md` §3.13 E-30）：02 §4.19 定案後，本文件 §3.7 與 §6.11 殘留多處
  03/07/08 舊命名（`battle.aweTriggered`、`event.historicalTriggered`／
  `event.genericTriggered`、`victory.achieved`、`defeat.playerEliminated`、
  `combat.fieldResolved`、`combat.battleAvailable`、`uprising.broke`、`clan.eliminated`，
  以及未列舉但同屬殘留的 `military.armyDeparted`／`military.armyArrived`／
  `military.subjugated`／`military.districtLost`／`military.encounter`），逐一對照 02
  §4.19 總表改為 `awe.triggered`／`event.fired`／`game.victory`／`game.defeat`／
  `battle.ended`／`battle.kassenAvailable`／`uprising.started`／`clan.destroyed`／
  `army.departed`／`army.arrived`／`district.subjugated`（`report.army.subjugated`與
  `report.army.districtLost`為同一 02 事件之攻守雙方視角報告，故共用同一 canonical 事件名）／
  `battle.started`。02 §4.19 無 `military.*`／`combat.*`／`dip.*` 族系，改畢後全表 grep
  三前綴已無殘留。`diplomacy.*` 前綴（`report.diplomacy.*` 系列）不在本次 grep 範圍
  （非字面 `dip.` 前綴），且屬 E-23 後續 08 外交大改 pass 範圍，本次不動。
- **D14｜E-27：朝廷獻金字串改為持續工作制措辭**（2026-07-10，依
  `plan/19-glossary.md` §3.13 E-27）：02 樞紐定案已刪除一次性 `CmdDonateCourt`，朝廷獻金
  併入 `CmdStartDiploWork`（`target:'court'`）／`CmdStopDiploWork`（`target:'court'`），
  機制依 08 §3.5。`ui.court.donation`（獻金，對應舊一次性動作）拆為
  `ui.court.startDonation`（開始獻金工作）／`ui.court.stopDonation`（停止獻金工作）／
  `ui.court.donationAmount`（每月投入金額 {gold}貫）／`ui.court.donationMonths`
  （已投入{months}個月），與 11 §3.8（同日依此勘誤改版）朝廷頁獻金工作區塊 wireframe
  對齊；執行武將標籤重用既有 `ui.diplomacy.workOfficer`，不新增重複字串。
  `ui.court.nextRankNeed` 之「獻金{gold}貫」改為「一次性獻金{gold}貫」，
  與新增的持續型「獻金工作」用詞區隔，避免玩家誤讀為同一筆支出（該值本為官位敘任的
  一次性費用，08 §3.5.2，與獻金工作之月投入無關）。
- **D15｜E-66：補齊調略 Panel（PlotPanel）字串**（2026-07-10，依
  `plan/19-glossary.md` §3.13 E-66）：11 §3.8.1 已補調略 Panel wireframe（進行中調略列表＋
  新調略精靈），對照其欄位與按鈕新增 `ui.plot.ongoing`（進行中調略（{n}））／
  `ui.plot.kind`（種別）／`ui.plot.target`（目標）／`ui.plot.remaining`（剩餘；儲存格數值
  沿用既有 `ui.common.days`）／`ui.plot.ready`（就緒）／`ui.plot.newPlot`（新調略）／
  `ui.plot.targetPicker`（在地圖／名簿選擇）／`ui.plot.start`（著手調略）／
  `ui.plot.cancel`（中止；中止「已在進行中」之調略，與精靈頁尾重用既有
  `ui.common.cancel`「取消」退出精靈為不同動作，不可合併）。執行武將／進度／預估成功率／
  發動內應沿用既有 `ui.plot.executor`／`ui.plot.progress`／`ui.plot.successChance`／
  `ui.plot.activateBetrayal`，未新增重複字串。
- **D16｜二輪裁決：事件變體規則與排除清單對齊 02 §4.19（含 D13 殘留清理）**（2026-07-10，
  依 02 二輪裁決備忘錄 A–E，§4.19 事件完整性裁決 C）：02 樞紐回寫二輪確認
  `battle.won`／`battle.lost`／`siege.fallen`／`siege.repelled` 四個舊事件型別不新增、一律併入
  `battle.ended`／`siege.ended`（payload `winnerClanId`／`fallen` 判別），故 §6.11
  `report.battle.won`／`report.battle.lost`／`report.siege.fallen`／`report.siege.repelled`
  四列之「事件型別」欄改為 `battle.ended`／`siege.ended`；並於 §3.7 變體規則表新增兩列：
  `battle.ended` 依 `payload.winnerClanId` 與玩家勢力關係分流 won／lost／平手
  （`winnerClanId=null` 僅野戰可能，撤離不分勝負，沿用既有通用戰報 `report.field.resolved`，
  不另立平手專用 key——第三方〔非玩家參戰〕之野戰結算亦沿用同一 `report.field.resolved`，
  兩種情境用字皆為中性描述、無需區分）；`siege.ended` 依 `payload.fallen`（true/false）分流
  `report.siege.fallen`／`report.siege.repelled`，無歧義。同步修正 §3.7 排除清單：移除
  `time.monthEnd`／`time.yearStart`／`siege.progress`／`development.districtGrown`
  （02 二輪裁決 C 已廢除此四事件型別，02 §4.19 總表不再收錄，不應留存於本文件任何清單）；
  新增 `time.seasonStart`（02 二輪裁決 C 新收，16 §5.3 季首自動存檔為其唯一消費者、不產生
  玩家報告，故屬 null-report）；`time.monthStart`／`game.victory`／`game.defeat` 不變。
  `officer.loyaltyLow`／`proposal.expired`（02 二輪裁決 C 新收）之 §6.11 對應列（分別在
  `report.officer.loyaltyLow`／`report.proposal.expired`）原已採 02 canonical 事件名，
  無需改動，僅確認一致。
  另於本輪 grep 自查（§6.11 全表逐列核對 02 §4.19 總表，非僅本次異動列）中，額外尋得三處
  D13（2026-07-10 前次「事件型別欄全面改採 02 canonical」宣稱）之殘留舊名，一併修正：
  `report.economy.harvest` 之 `economy.harvested`→`economy.harvest`（02 §4.19 canonical、05
  發出；03 §8.1 E-30 亦已列此更名，13 先前漏改）、`report.build.done` 之
  `development.completed`→`facility.completed`（02 §4.19 canonical 為施設完工事件、05 發出；
  `development.completed` 為 03 §4.3 專有之另一事件〔單項開發滿級〕，語意與本報告「{castle}的
  {facility}已落成」不符，屬誤植而非命名歧異）、`report.officer.promoted` 之
  `officer.rankPromoted`→`officer.promoted`（02 §4.19 canonical、06 發出；03 §8.1 E-30 亦已
  列此更名）。`report.diplomacy.pactSigned`／`pactExpired`／`pactBroken`（現仍用
  `diplomacy.*` 舊前綴，02 canonical 為 `pact.signed`／`pact.expired`／`pact.broken`）**維持
  不動**：D13 已明文此三列「屬 E-23 後續 08 外交大改 pass 範圍，本次不動」，本輪比照沿用該
  既定裁決，不在本次一併處理，避免與該規劃中的專案改動衝突。`command.rejected`／
  `economy.foodShortage`／`economy.upkeepUnpaid`／`save.autosaveFailed`／
  `diplomacy.envoyArrived` 等維持現狀：03／16 自身文件明文列為「專有／擴充事件」（03 §4.3
  逐一註記「為 03 專有」／16 §5.3 存檔錯誤事件），屬 §3.7「系統文件另定義的非 03 清單報告
  key……沿用其事件擴充」允許範圍，非 02 §4.19 canonical 名稱漂移，故不視為需修正之不一致。
- **（2026-07-10）E-23／E-27 尾／E-32：08 外交大改字串與事件名連動**（08 為主記錄）：
  (1) **E-23**——刪 `cmd.diplomacy.proposeNonAggression`（締結不可侵條約）與 `term.pact.nonAggression`
  （不可侵條約）；`PactKind` v1.0 為四值，不可侵降 v1.1（`term.pact.marriage`＝婚姻同盟已在列）。
  (2) **E-27 尾**——`ui.court.donationAmount` 由「每月投入金額 {gold}貫」改「每月獻金 {gold}貫（固定）」：
  月費為固定 `BAL` 常數、非玩家自訂投入額，02 已刪 `goldPerMonth`（機制歸 08 §3.2／§3.5）。
  (3) **E-32**——§6.11 報告事件名對齊 02 §4.19 canonical：`report.diplomacy.pactSigned`／`pactExpired`／
  `pactBroken` 之事件欄 `diplomacy.pactSigned`／`pactExpired`／`pactBroken`→`pact.signed`／`pact.expired`／
  `pact.broken`（原 D13 記錄明列「屬 E-23 後續 08 外交大改 pass 範圍，本次不動」，本 pass 即該範圍、
  一併處理）；`report.diplomacy.envoyArrived` 之事件欄 `diplomacy.envoyArrived`→`diplo.envoyArrived`
  （已收錄 02 §4.19 canonical）。報告字串本文與插值參數不變，僅事件對照名對齊。
- **（2026-07-10）外交三輪裁決 2 連動：幕府獻金字串**：§6.7 幕府頁補獻金工作字串
  `ui.shogunate.startDonation`（開始獻金工作）／`stopDonation`（停止獻金工作）／`donationAmount`
  （每月獻金 {gold}貫（固定））／`donationMonths`（已投入{months}個月），比照朝廷頁 `ui.court.*` 模式
  （11 §3.8 幕府頁同日補幕府獻金工作區塊、發 `startDiploWork`/`stopDiploWork`、`target:'shogunate'`）；
  執行武將標籤兩頁皆重用 `ui.diplomacy.workOfficer`，不新增重複字串。提案類字串無期限自訂措辭
  （期限依 kind 由 08 BAL 常數決定，三輪裁決 3a，無 `termDays`）；`cmd.diplomacy.demandVassal`／
  `offerVassal` 兩方向字串已在列，無需新增。理由：對齊 08 §3.6／§3.4.1 與 11 §3.8。
- **（2026-07-11）驗證修復：02 四輪裁決下游對齊（5 項）**：
  (1) §3.4.2 動態 key 模式表（原 L162-163）——`CourtRankId`／`ShogunateTitleId`（隱含獨立 branded ID、
  需去 `crank.`／`stitle.` 前綴取 slug）之舊敘述已與 02 §3.2 不符（02 四輪裁決 A 已定案：`pact.`／`crank.`／
  `stitle.` ID 前綴廢除，官位／幕府役職以 enum 值即識別符）；型別名改為 02 §3.3 現行之 `CourtRank`／
  `ShogunateTitle`，敘述改「enum 值本身即識別符，無獨立 ID」，樣板佔位由 `<slug>` 改 `<value>`
  （對齊 `DevPolicy`／`conscriptPolicy` 等純 enum 列之既有寫法）。
  (2) §6.12 `term.crank.*`／`term.stitle.*` 兩張階梯表為 E-25／E-26 前之舊集合（含已廢除的
  `sho5ge`／`sho4ge`／`sho1`／`oshobanshu`／`kanreidai`，且缺 `hokoshu`／`shogun`），依 02 §3.3
  `CourtRank`／`ShogunateTitle` 現行 enum 全集重排：官位九值（`none`＋八階
  `ju5ge/ju5jo/ju4ge/ju4jo/ju3/sho3/ju2/sho2`）、役職七值（`none/hokoshu/otomoshu/shobanshu/
  kanrei/fukushogun/shogun`），中文沿用 02 §3.3 各值行內註解。
  (3) §3.7 變體規則表 `plot.succeeded` 分流依據 `payload.plot`→`payload.kind`（`PlotKind`）：
  02 §4.19 該事件 payload 命名為 `kind: PlotKind`（02-data-model.md 行 1067），02 自身無 `plot` 欄。
  (4) §6.11 新增 `report.army.blocked`（事件 `army.blocked`，02 §4.19 四輪裁決 C-6 canonical、
  04 §5.4 發出、備忘錄明列「13 報告 key 對齊 report.army.blocked」）；同表
  `report.march.failed.troops`→`report.march.failed.soldiers`，補上 07 §6.6 已完成之更名
  （07 行 1050：`ui.march.troops`→`ui.march.soldiers`／`report.march.failed.troops`→
  `report.march.failed.soldiers`）在本表的漏改殘留。
  (5) §6.11 新增 `report.diplomacy.reinforceAgreed`（事件 `diplo.reinforceAgreed`，
  02 §4.19 四輪裁決項 21／D-21：`requestReinforce` 獲接受不建立 Pact、故不發 `pact.signed`，
  改發此專屬事件，備忘錄明列「交 08 發、13 接報告」）。
- **（2026-07-11）五輪裁決落實：報告渲染契約歸 13＋enrichment＋事件收斂（對抗式驗證 V6，blocker＋7 項）**：
  (A｜blocker) **§3.7 全面改寫為 UI 層 enrichment 契約**：依 02 §4.17／§4.19 五輪裁決 A，報告顯示不再於
  core 組裝——core 只存原始 `event`（02 §4.17 `Report{ id, day, event, read }`），`messageKey`＋插值 `params`
  由 **UI 層 selector `renderReport(report, state, playerClanId)`** 於渲染時導出。據此改判並改寫：§3.7 開頭原
  「`makeReportEntry` 於 core 執行、實作於 `src/core/systems/reports.ts`」全部改為 UI 層 `src/ui/report/renderReport.ts`；
  預設規則原「`params = event.payload`／payload key 即參數名」改為「**params 由 §3.7(2) enrichment 自 payload
  持久 ID 導出顯示參數**」；§3.1（core 只存 event）、§3.2 規則 1（報告參數名＝enrichment 顯示名、非 payload key）、
  §3.4.1（`report.` 前綴敘述）、§2 關係表（02 改指 `Report{…event…}`＋§4.17／§4.19）、§4 資料結構（刪 core 側
  `messageKeyForEvent`、改宣告 UI 側 `renderReport`＋`deriveReportMessage`）、§5.5（renderReport 三參數簽名重寫）、
  §5.6 測試 5（斷言「模板參數 ⊆ enrichment 導出集」、非 payload keys；含視角分流各例、排除清單回 null）、§7 T4
  （改 UI 層 renderReport／deriveReportMessage）同步。新增 §3.7(2) **enrichment 對照表**（`armyId`→leader/army、
  `castleId`→castle、`nodeId`→place、`districtId`→district、`*ClanId`→clan、`officerId`/`targetOfficerId`→name、
  `taimeiId`/`policyId`/`facilityTypeId`/`title`/`kind` → 型錄名或 term key）；(3) **玩家視角與 payload 變體表**；
  (4) **transient enrichment timing 定案**：擇 13 體例——core 只存 event、不於 03 Step 13 預解析名字入 Report，
  故 `renderReport` render 時反查 state、transient（`armyId`／`battleId`）已移除時以 fallback 顯示（`{leader}`／
  `{army}`→「我軍」、`battle.kassenAvailable` 之 `{place}`→「戰場」）；顯示所需持久 ID 已由五輪裁決 B 落地於 payload，
  place/clan/castle 恆可解析、不依賴 transient 反查。
  (B｜enrichment payload) §3.7(3)／§6.11 逐列以 02 §4.19 五輪裁決 B 補全之 payload 閉合參數欄：`battle.ended`
  之 `place`←`nodeId`、`winner`←`winnerClanId`、`loser`←對造 `attacker/defenderClanId`；`district.subjugated` 之
  `leader`←`armyId`；`officer.died(battle)` 之 `place`←`nodeId`；`plot.*` 之 `castle`←`targetCastleId`。
  (C｜officer.died) §3.7 變體與 §6.11 兩列分流依據 `payload.cause` 由 `natural/battle` 改 **`age/battle`**
  （處刑死亡改由 `officer.executed` 承載、`officer.died` 不再發 `execution`）：`report.officer.death` 事件欄
  `officer.died(natural)`→`officer.died(age)`；`report.officer.killedInAction` `{place}` 改用新收 `nodeId` enrichment。
  (2｜major ArmyStatus) §3.4.2／§6.6 `ui.army.status.*` 對齊 02 §3.3 `ArmyStatus` 七值：`fighting`→`engaged`、
  `resting`→`holding`、新增 `subjugating`（制壓中）；七值＝marching/engaged/sieging/subjugating/returning/routed/holding。
  §3.4.2 資料值欄由「Army.status（07）」改「ArmyStatus（02 §3.3 七值；狀態機語意見 07）」。
  (3｜major 空事件欄補全) §6.11 事件欄空白但 02 §4.19 已有 canonical 者逐列補：`report.army.noFood`←`army.starving`、
  `report.transport.arrived`←`transport.arrived`、`report.officer.recruited`←`officer.recruited(ronin)`、
  `report.captive.recruited`←`officer.recruited(captive)`、`report.captive.released`←`officer.released`、
  `report.captive.executed`←`officer.executed`、`report.shogunate.titleGranted`←`shogunate.titleGranted`、
  `report.taimei.invoked`←`taimei.invoked`、`report.taimei.expired`←`taimei.expired`、
  `report.diplomacy.proposalRejected`←`diplo.refused`。`officer.recruited` 於 §3.7(3) 依 `payload.source`
  三分流 ronin→`report.officer.recruited`／captive→`report.captive.recruited`／**poach→null**（該次登用已由
  `plot.succeeded(poach)`→`report.plot.poachSuccess` 報告，避免同一挖角出兩列）。
  (4｜major battle.started 雙 key) 刪除 §6.11 `report.battle.started`（`{place}合戰開始！`）列——合戰開始由 11
  合戰 modal 呈現、07 無此 canonical 事件；`battle.started` 唯一報告為 `report.field.begin`（歷史沿用 key，
  §3.7(1) 已註 `battle.started`→`report.field.begin`）。
  (6｜major 排除清單裁決) §3.7(5) 逐一裁決先前未列之 02 §4.19 事件：`army.returned`→**補報告列**
  `report.army.returned`（`{leader}隊歸還{castle}。`；玩家價值高）；`policy.enacted`／`policy.revoked`／
  `proposal.resolved`／`conscript.completed`→**排除（null）**（前三者為玩家主動操作之即時結果、UI 當下已回饋
  〔自動廢止另有 `report.policy.autoRevoked`〕；`conscript.completed` 為持續方針每月多城觸發、逐列會灌爆報告匣，
  比照 03 §3.4.3）。
  (7｜minor corps directive) §6.6 `ui.corps.directive.*` 對齊 02 `CorpsDirective` enum：`conquer/defend/auto`
  →`advance/hold/develop`（攻略／固守／開發，值依 02 §3.3 行內註解）。
  (8｜minor ReportEntry／節號殘留) 全檔 `ReportEntry`／`02 §4.3` 殘留改對齊 02 §4.17 `Report{ id, day, event, read }`
  （§2 關係表、§3.1、§3.4.1、§4、§5.5）；§5.5 `renderReport` 敘述隨契約改為 `(report, state, playerClanId)` 三參數。
  (9｜poach {officer}/{target} 釐清) 讀 08 §3.7.1 後定案：`plot.succeeded(poach)` payload（五輪裁決 B 定稿）為
  `{ kind, actorClanId, targetClanId, targetOfficerId, targetCastleId }`——**無 executor 欄**，且執行武將關聯
  （`Plot.officerId`）於結算後 Plot 即移除、render 時不可反查（五輪裁決 A：core 只存 event）；故報告不指名執行者。
  `report.plot.poachSuccess` 由 `{officer}引拔成功，{target}前來仕官！` 改為 **`{officer}自{clan}被引拔，前來仕官！`**，
  參數 `officer`＝**被引拔者**←`targetOfficerId`（enrichment→`Officer.name`，持久）、`clan`＝原主勢力←`targetClanId`
  （→`Clan.name`，持久），兩者 render 時恆可解析、與失守方鏡射報告 `report.officer.poached`（`{name}被{clan}引拔…`）
  對稱。（`officer.recruited(poach)`→null，見(3)，不重複。）另收束 `plot.succeeded` 之玩家視角與
  covert 洩漏問題（契約閉合所必需、比照 (1d) 視角分流）：poach 依 `playerClanId` 分視角——`actorClanId`=玩家
  →`report.plot.poachSuccess`、`targetClanId`=玩家→`report.officer.poached`（原事件欄「—」，本輪閉合為
  `plot.succeeded(poach，我方失士)`，`name`←`targetOfficerId`、`clan`←`actorClanId`），修正被害方原會誤渲染
  「前來仕官」之錯誤；rumor／betrayal／`plot.failed` 為隱密諜報，僅 `actorClanId`=玩家時產生報告，否則
  `renderReport` 回 null（未敗露不洩漏給被害方；敗露另由 `plot.exposed*` 承載）。
  (10｜plot 城名) `report.plot.betrayalReady` 之 `{castle}` 明定 enrichment 自 `plot.succeeded` 之 `targetCastleId`
  （五輪裁決 B 新落地欄，§3.7(2)(3)）；`report.plot.rumorSuccess` 之 `{target}` 依模式 ←`targetOfficerId`（武將）∨
  `targetCastleId`（城）。
  另附帶修正（本輪契約閉合所必需）：`report.field.resolved` 之 `{place}的戰鬥分出勝負，{winner}獲勝。` 因需同時涵蓋
  第三方結算與 `winnerClanId=null` 平手撤離（二輪裁決 D16「一 key、中性描述」），改為 null-safe 中性句
  **`{place}的戰鬥告一段落。`**（去 `{winner}`）；`report.battle.won`／`report.battle.lost` 之參數由 `attacker/defender`
  改 **`winner/loser`**（`winner`←`winnerClanId`、`loser`←對造），修正「勝方＝守方」時原「{attacker}擊破{defender}」
  敘述與勝負相反之潛在錯誤（玩家為守方而勝／而敗皆正確渲染）。
- **（2026-07-11）六輪裁決落實：事件↔報告邊界末輪收束（依 02 §8 六輪裁決下游清單 13(a)–(e)；02 為裁決主體、本檔只落實）**：
  (1｜major §6.11 空事件欄收錄) §6.11 事件欄為「—」但 02 §4.19 已收 canonical（六輪裁決 1）者逐列補，全數收錄、無一判 UI-only：
  `report.economy.granaryOverflow`←`economy.granaryOverflow`（05）；`report.policy.autoRevoked`←`policy.autoRevoked`（05）；
  `report.uprising.suppressed`←`uprising.ended(suppressed)`、`report.uprising.subsided`←`uprising.ended(subsided)`（05）；
  `report.diplomacy.workStopped`←`diplo.workStopped`（08，原 08 名 `dip.workStopped` 已於 02 更名對齊 `diplo.*`）；
  `report.court.mediationSuccess`←`court.mediationResult(success)`、`report.court.mediationFailed`←`court.mediationResult(!success)`（08）；
  `report.shogunate.nominated`←`shogunate.nominated`、`report.shogunate.patronLost`←`shogunate.patronLost`（當事勢力視角、餘 null）、
  `report.shogunate.collapsed`←`shogunate.collapsed`（08）；`report.plot.betrayalActivated`←`plot.betrayalActivated`（08）；
  `report.plot.exposed`←`plot.exposed(actor)`、`report.plot.exposedByEnemy`←`plot.exposed(target)`（08）。
  (2｜major §3.7(3) 視角/payload 分流) 新增四列：`uprising.ended`（`payload.resolved` suppressed/subsided 二分，`district`←`districtId`）；
  `court.mediationResult`（`payload.success` 二分；success：`clan`←`targetClanId`、`months`←`ceasefireMonths`〔number〕；!success：`clan`←`targetClanId`）；
  `plot.exposed`（依 `playerClanId` 分視角：actor→`report.plot.exposed{clan←targetClanId,plot←kind}`／target→`report.plot.exposedByEnemy{clan←actorClanId,plot←kind}`／皆非→null）；
  `shogunate.patronLost`（視角過濾：`e.clanIds.includes(playerClanId)` 者渲染、餘 null）。
  (3｜major envoyArrived {proposal} 改源) §3.7(2) `proposalId` 行改判「不導出報告參數」——`report.diplomacy.envoyArrived` 之 `{proposal}` 不再反查
  transient Proposal，改由同 payload 之 `kind`（`DiplomacyActionKind`，六輪裁決 2）經既有 `kind`→`proposal`→`cmd.diplomacy.<kind>` 標籤導出；
  `proposalId` 保留於 payload 僅供來使 modal／11 跳轉。另補 §3.7(2) `target`（`diplo.workStopped`）與 `ceasefireMonths`（`court.mediationResult`）兩 enrichment 列。
  (4｜minor battle.ended lost/resolved 去重疊) §3.7(3) `battle.ended` lost 分支補「**且 `winnerClanId≠null`**」，`winnerClanId=null`（平手撤離）一律走 resolved，消除與 lost 之重疊。
  (5｜save.autosaveFailed 判 UI-only) 依六輪裁決 4：自動存檔失敗屬 **app 層 I/O 失敗**（非決定論、不入 core state／§5.4 golden hash）、非 02 §4.19 事件、不經 `renderReport`。
  自 §6.11 移除 `report.save.autosaveFailed` 一列，字串遷至 §6.10 **`ui.save.autosaveFailed`**（app 層 toast），消費者＝16 §5.3 autosave hook，
  另配合既有 HUD 常駐警示 `ui.hud.autosaveSuspendedTip`；§6.11 表後補 blockquote 說明。（16 下游將把 `report.save.autosaveFailed` 引用改指 `ui.save.autosaveFailed`。）
  (6｜mediation 雙報告去重裁決＝02 §8 13(d) 交 13 定) `court.mediationResult(success)` 與同 tick `pact.signed`（強制停戰）之雙報告：**定為兩則並存、不去重**。
  理由：`renderReport(report,state,playerClanId)` 僅見單一 event 與 state、無法可靠判別某 `pact.signed` 是否源自朝廷斡旋（provenance 不在 payload、Plot/Proposal 已 transient），
  且兩訊息語意互補（`mediationSuccess` 報外交結果、`pactSigned` 報協定成立）；核銷任一皆需 core 端不發或改 payload（逾 13 職權、且 02 明定成功時另 emit `pact.signed`）。
  (7｜§5.6 測試同步) test 5 母集擴入本輪新產報告事件；視角分流枚舉加 `plot.exposed`（actor/target）、payload 分岔加 `uprising.ended`／`court.mediationResult` 各分支、
  視角過濾加 `shogunate.patronLost`（當事/非當事各一、後者斷言 null）、`battle.ended` 補平手（`winnerClanId=null`→resolved）一例、`diplo.envoyArrived` 斷言 `{proposal}` 解自 `kind`；
  並註明 `save.autosaveFailed` 非 GameEventType、不在本項母集。02（不改）、19-glossary（不改）；本檔 grep 自查簡體/新字體 clean、無 TBD/needsReview。
- **（2026-07-11）六輪裁決追記落實：`transport.looted` 收尾（依 02 §8 六輪裁決末尾「追記（同日收尾）」；02 為裁決主體、本檔只落實）**：
  §6.11 `report.transport.looted`／`report.transport.lootGain` 事件欄由「—」改填 `transport.looted`（前者被劫方＝我方視角、後者劫方＝我方視角）；
  §3.7(3) 補分流列：`byClanId≠playerClanId` 且輸送隊屬玩家（`e.clanIds` 判別）→looted（`place`←`nodeId`、`clan`←`byClanId`）；
  `byClanId=playerClanId`→lootGain（`place`←`nodeId`）；皆非→null；§5.6 test 5 視角分流枚舉加 `transport.looted`
  （looted／lootGain／第三方 null 三例）。02（不改）、19-glossary（不改）；本檔 grep 自查簡體/新字體 clean、無 TBD/needsReview。
- **（2026-07-11）七輪裁決落實：事件↔報告邊界末輪收束（依 02 §8 七輪裁決下游清單 13(a)–(f)；02 為裁決主體、本檔只落實）**：
  (1｜transport.looted 分流改依 payload 直接比對) §3.7(3) `transport.looted` 分流依據由「`byClanId` 與
  `e.clanIds` 判別輸送隊歸屬」改為**直接比對 `payload.ownerClanId`／`payload.byClanId` 與 `playerClanId`**
  （`ownerClanId=playerClanId`→looted；`byClanId=playerClanId`→lootGain；皆非→null；七輪裁決 1，`ownerClanId`
  為新落地 payload 欄）；不再依賴 `e.clanIds` 反推。§5.6 test 5 同步。
  (2｜八孤兒鍵逐一收束，七輪裁決 2) §6.11 事件欄「—」改填 canonical、五列全收錄：`report.clan.succession`←
  `clan.succession`；`report.field.rout`←`army.routed`；`report.siege.relief`←`siege.relief`；
  `report.officer.recruitFailed`←`officer.recruitFailed`；`report.victory.tenkabitoProgress`←
  `victory.tenkabitoProgress`（皆單一 messageKey、無視角/payload 分岔）。`report.proposal.invalid` 併入
  `proposal.expired`（`payload.reason:'timeout'|'invalidated'`）——§3.7(3) 新增變體列，`report.proposal.expired`
  （timeout）／`report.proposal.invalid`（invalidated）二報告鍵並存、皆 `name`←`officerId`。
  `report.officer.meritReady` 判 **UI-only**（條件 `o.merit ≥ rankMeritThresholds[nextRank]` 為 state 可衍生、
  06 §5.7 已停發）——自 §6.11 移除、比照六輪裁決 4 之 `save.autosaveFailed` 體例補 blockquote 說明，字串遷至
  §6.5 **`ui.officer.meritReady`**，消費者＝11 武將一覽／詳細卡 badge（直讀 state，非讀報告匣）。
  `report.diplomacy.proposalAccepted` **刪列**（由既有 `report.diplomacy.pactSigned`／`reinforceAgreed` 覆蓋，
  無視角分流可補——事件已被其他 canonical 事件涵蓋，非「併入變體」情形）；§3.7 新增備註說明
  `pactSigned` 第三人稱字串已可涵蓋提案方視角、不另立 key（nice-to-have）。§3.7(2) enrichment 表補
  `deceasedId`／`heirId`／`executorId` 三 `OfficerId` 專屬欄名（`clan.succession`／`officer.recruitFailed` 用）。
  (3｜court.mediationResult 視角分流補全，七輪裁決 4) §3.7(3) 比照 `plot.exposed` 補三分視角，但「皆非」分支
  **判第三人稱、非 null**——理由：03 §3.4.2 對本事件之「否則」分支判 **warning**（非 info），使非當事勢力玩家
  之 `isPlayerRelevant(e) or sev!=='info'` 恆真、該 Report 恆被推入 `state.reports`；若 `renderReport` 對此分支
  回傳 null 將產生「已入庫卻無法顯示」之死列（03 §3.4.3 NOT_REPORTED 機制正是為避免此情形而設），故與
  `plot.exposed`（`clanIds` 僅含 actor/target 二方、第三方本不會被推入、null 分支形同防禦性斷言）本質不同，
  必須補渲染字串。新增 4 報告鍵：`report.court.mediationImposed`／`mediationEvaded`（目標方視角，`clan`←
  `clanId`）、`report.court.mediationSuccessOther`／`mediationFailedOther`（第三方視角，`a`←`clanId`、
  `b`←`targetClanId`）；既有 `report.court.mediationSuccess`／`mediationFailed`（發起方視角，`clan`←
  `targetClanId`）事件欄標注視角以資區別。§6.11／§5.6 test 5 同步（三視角×success/!success 共六例，皆非 null）。
  (4｜siege.relief 與 field.begin 同 tick 並存，七輪裁決追記) 07 §3.3 遭遇判定成立即自動建立 `FieldCombat` 並
  發 `battle.started`——援軍解圍（`Siege.interrupted=true`）與此為同一時刻之兩面、無 payload 交叉引用可供
  `renderReport` 核銷任一方，比照六輪裁決 6（`court.mediationResult`+`pact.signed`）定為**兩則並存、不去重**；
  §3.7(3) 表後新增此說明段落（與 proposalAccepted 刪鍵說明並列）。
  (5｜§5.6 test 5 同步) 母集擴入本輪新收 5 單值事件與 `proposal.expired` reason 分岔；視角分流枚舉加
  `court.mediationResult`（三視角六例，皆非 null）；`transport.looted` 分流依據描述同步改為 payload 直接比對；
  排除清單註記新增 `officer.meritReady`（非 GameEventType、七輪裁決 2，比照六輪裁決 4 `save.autosaveFailed`）。
- **D17｜i18n 模組定案為單檔 `zh-TW.ts`（廢 D1 三檔規劃／不新增 `t.ts` 內容／不新增 `index.ts`／`format.ts`）**
  （2026-07-11，M1-18／M1-20／M1-22 交界處實作；本節取代並修正稍早同編號之草稿）：實測
  `eslint.config.js`「邊界規則 3：i18n 零依賴」（`files: ['src/i18n/**/*.ts']` 配
  `no-restricted-imports` 之 `patterns: [{ group: ['*'] }]`）會擋下**同目錄的相對匯入**
  （如 `./zh-TW`），並非僅擋外部套件——故 D1 規劃之三檔（`zh-TW.ts`／`index.ts`／`format.ts`）
  彼此無法互相 `import`，在目前鐵律下不可行；又 `plan/00-foundations.md` §3 canonical 目錄樹
  `src/i18n/` 下本就僅列 `zh-TW.ts` 一檔，`plan/01-architecture.md` §3.3 另列的 `t.ts`（同函式
  `t(key, params)` 的落點）與本文件 D1 的 `index.ts` 為同一內容之兩個不同檔名提案、兩者皆與
  00 canonical 樹不符。依 00 > 01／13 優先序：**廢止 D1 三檔規劃**，`t()`／`hasKey()`／
  `getMissingKeys()`／`formatNumber()`／`formatDate()`／`formatYearMonth()`（§3.2／§4／§5.2／
  §5.3 全部內容契約，逐字沿用本文件定案）與主字串表 `zhTW` 合併為單一檔案
  `src/i18n/zh-TW.ts`（零 import，符合 13/01 共同的「i18n 零依賴」鐵律），`src/i18n/t.ts`
  維持 M0 stub（`export {}`）不再使用、亦不刪除（避免與 01 §3.3 目錄樹產生新的檔案存在性落差；
  01 §3.3 之後若整併請一併回寫）。`formatDate`／`formatYearMonth` 因同一零依賴限制不得
  `import` `src/core` 之 `dayToCalendar`（02 §5.6／`src/core/systems/time.ts`），故在
  `zh-TW.ts` 內自帶一份等價的絕對日→曆法換算純函式（與 `src/core/state/serialize.ts` 因
  「core 不得 import tests/」而獨立重寫 `fnv1a64`／`canonicalStringify` 同一理由：邊界規則
  造成的刻意小型重複；`EPOCH_YEAR`＝1560、`DAYS_PER_MONTH`＝30、`DAYS_PER_YEAR`＝360 兩處常數
  如再改動須與 02 §5.6／`time.ts` 同步手動更新）。
  另（M1-22 除錯面板字串併入）：01 §3.11.2／§6.2 之 `ui.debug.title`／`section.time`／
  `section.cheat`／`addGold`／`needCastleSelected` 屬「來源草案」尚未併入本文件 §6.10 主表
  （§6.10 現行內容僅含 03 之 `skipDays`／`skipping` 與 09/17 之 `ai.*`／`exportLog` 等），
  本輪依 01 原樣併入主表（無衝突、非正名）；時間跳轉之實際按鈕文案改採本文件已定案之
  `ui.debug.skipDays`（`跳轉{days}日`）／`ui.debug.skipping`，不採 01 §3.11.2 草案另一措辭
  `ui.debug.jumpDays`（`快進{days}日`，與 `skipDays` 同義重複、03/本文件之版本對應實際
  Command 名 `debugSkipDays`，依 §3.5 慣例採之）；另新增本文件與 01 皆未收錄之
  `ui.debug.stateHash`（狀態雜湊：{hash}），供 M1-22／03-T11 除錯面板顯示 `stateHash()`
  （`src/core/state/serialize.ts`）供人工核對「跳轉 360 日與逐日 hash 一致」用，純新增、
  非正名衝突。實作見 `src/i18n/zh-TW.ts`。
  02（不改）、19-glossary（不改）；本檔 grep 自查簡體/新字體 clean、無 TBD/needsReview。
