# 02 — 資料模型（Data Model）

> 本文件是全案 **TypeScript 型別、enum、ID 規範、不變量** 的單一真相來源。
> 依 `plan/00-foundations.md`（下稱 00）§7 分工，任何其他文件出現的型別皆以本文件為準；
> 規格衝突優先序：`00` > `02（本文件）` > `15` > 各系統文件。

---

## 1. 目的與範圍

本文件定義：

1. `GameState` 完整 interface 樹與全部實體型別（每欄位附註解、單位、合法範圍）。
2. Branded ID 型別系統與 00 §8 前綴規範的對應、執行期 ID 生成規則。
3. 全部 enum 的完整列舉（enum 值用英文；繁中顯示字串收錄於 `plan/13-i18n-strings.md`）。
4. 參照完整性不變量清單（供 `plan/14-scenario-data.md` 驗證器與 `plan/17-testing.md` 測試使用）。
5. 衍生值與快取策略（何者即時計算、何者快取、何時失效）。
6. 序列化規範與狀態大小估算。
7. `Command` 與 `GameEvent` 型別聯集總表（payload 欄位；行為語意參見各系統文件）。

**不在**本文件範圍：各欄位數值如何隨遊戲演進（各系統文件）、BAL 常數定案值（`plan/15-balance.md`）、
存檔壓縮與遷移流程（`plan/16-save-and-settings.md`）、劇本 JSON 的 zod schema（`plan/14-scenario-data.md`）。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | 實體命名（§4/§14）、ID 前綴（§8）、單位範圍（§6）皆承襲之，本文件僅細化。 |
| `plan/03-game-loop.md` | 使用本文件的 `Command`/`GameEvent` envelope；定義佇列、apply 順序與重放紀錄格式。 |
| `plan/04-map-and-movement.md` | 使用 `RoadEdge`/`Army`/`MapNodeId`；定義行軍、制壓、遭遇語意。 |
| `plan/05-domestic.md` ~ `plan/10-events-and-victory.md` | 使用本文件型別；定義各欄位的變化規則與公式。 |
| `plan/14-scenario-data.md` | 劇本 JSON schema 欄位必須與本文件實體靜態欄位一一對應；驗證器實作 §5.2 不變量。 |
| `plan/15-balance.md` | 本文件引用的 `BAL.*` 常數在 15 定案。 |
| `plan/16-save-and-settings.md` | 依 §3.4 序列化規範實作存讀檔與版本遷移。 |
| `plan/17-testing.md` | golden test 使用 §5.4 canonical 序列化；不變量測試使用 §5.2 清單。 |

---

## 3. 設計細節

### 3.1 正規化儲存原則

- **一律 `Record<Id, Entity>` 正規化儲存**；實體之間只以 ID 互相引用，嚴禁巢狀持有另一實體物件。
- **單一真相（single source of truth）**：一個事實只存在一處。例：
  - 「武將 X 是清洲城城主」只存於 `castles['castle.kiyosu'].lordId`，`Officer` 上**不**存 `lordOf` 欄位。
  - 「武將 X 受封春日井郡」只存於 `districts['dist.owari-kasugai'].stewardId`。
  - 「城 Y 屬於軍團 Z」只存於 `castles[y].corpsId`，`Corps` 上不存 `castleIds`。
  - 反向查詢一律以 selector 完成（見 §5.1）。
- `Record` 的 key 必須等於 value 的 `id` 欄位（INV-01）。
- 所有實體都是 **plain object**：無 class、無 method、無 getter；行為全部放在 `src/core/systems/` 的純函式。

### 3.2 ID 系統：branded string types

```ts
// src/core/state/ids.ts
declare const __brand: unique symbol;
type Brand<B extends string> = { readonly [__brand]: B };

/** 靜態 ID：由劇本資料定義（00 §8 前綴規範） */
export type ClanId     = string & Brand<'ClanId'>;      // 'clan.oda'
export type OfficerId  = string & Brand<'OfficerId'>;   // 'off.oda-nobunaga'
export type CastleId   = string & Brand<'CastleId'>;    // 'castle.kiyosu'
export type DistrictId = string & Brand<'DistrictId'>;  // 'dist.owari-kasugai'
export type ProvinceId = string & Brand<'ProvinceId'>;  // 'prov.owari'
export type RoadEdgeId = string & Brand<'RoadEdgeId'>;  // 'road.kiyosu-sunpu-01'
export type EventId    = string & Brand<'EventId'>;     // 'evt.okehazama'
export type PolicyId   = string & Brand<'PolicyId'>;    // 'pol.rakuichi'
export type TraitId    = string & Brand<'TraitId'>;     // 'trait.gunshin'
export type TacticId   = string & Brand<'TacticId'>;    // 'tac.charge'
export type TaimeiId   = string & Brand<'TaimeiId'>;    // 'taimei.sokuji'
export type FacilityTypeId = string & Brand<'FacilityTypeId'>; // 'fac.market'（城下施設種類，型錄見 05）
export type AiPersonaId    = string & Brand<'AiPersonaId'>;    // 'persona.conqueror'（AI 性格參數組，型錄見 09）

/** 執行期 ID：遊戲進行中由 §5.3 流水號生成器產生 */
export type ArmyId      = string & Brand<'ArmyId'>;      // 'army.000042'
export type BattleId    = string & Brand<'BattleId'>;    // 'battle.000007'（合戰 BattleState，勘誤 E-18）
export type SiegeId     = string & Brand<'SiegeId'>;     // 'siege.000003'
export type CorpsId     = string & Brand<'CorpsId'>;     // 'corps.000001'
export type ProposalId  = string & Brand<'ProposalId'>;  // 'prop.000118'（具申）
export type ReportId    = string & Brand<'ReportId'>;    // 'rep.004250'
export type TransportId = string & Brand<'TransportId'>; // 'trans.000005'（輸送隊，勘誤 E-41）
export type PlotId      = string & Brand<'PlotId'>;      // 'plot.000012'（調略，08；勘誤 E-28）

/** 地圖節點 = 城 ∪ 郡（00 §4：地圖是節點圖） */
export type MapNodeId = CastleId | DistrictId;

/** 無向勢力對 key：字典序小者在前，'|' 連接。見 §5.5 pairKey() */
export type ClanPairKey = string & Brand<'ClanPairKey'>; // 'clan.imagawa|clan.oda'
```

| 型別 | 前綴 | 生成方式 | 格式 regex |
|---|---|---|---|
| ClanId | `clan.` | 劇本靜態 | `^clan\.[a-z0-9-]+$` |
| OfficerId | `off.` | 劇本靜態＋浪人程序生成（14） | `^off\.[a-z0-9-]+$` |
| CastleId | `castle.` | 劇本靜態 | `^castle\.[a-z0-9-]+$` |
| DistrictId | `dist.` | 劇本靜態 | `^dist\.[a-z0-9-]+$` |
| ProvinceId | `prov.` | 劇本靜態 | `^prov\.[a-z0-9-]+$` |
| RoadEdgeId | `road.` | 劇本靜態 | `^road\.[a-z0-9-]+(-\d{2})?$` |
| EventId / PolicyId / TraitId / TacticId / TaimeiId | `evt.` / `pol.` / `trait.` / `tac.` / `taimei.` | 劇本／型錄靜態 | 同上 slug 規則 |
| FacilityTypeId | `fac.` | 型錄靜態（05） | `^fac\.[a-z0-9-]+$` |
| AiPersonaId | `persona.` | 型錄靜態（09） | `^persona\.[a-z0-9-]+$` |
| ArmyId…ReportId | `army.` `battle.` `siege.` `corps.` `prop.` `rep.` | 執行期流水號（§5.3） | `^army\.\d{6}$` 等 |
| TransportId | `trans.` | 執行期流水號（§5.3） | `^trans\.\d{6}$`（勘誤 E-41／E-51） |
| PlotId | `plot.` | 執行期流水號（§5.3） | `^plot\.\d{6}$`（調略，08；勘誤 E-28／E-51） |
| 合戰／野戰內部 id | `fc.` `bu.` `jin.` | 合戰／野戰結算期內生：**不入 nextSerials**（非流水號，ID 由 `rng.battle` 與節點/tick 決定論導出）；**隨所屬狀態正常序列化落地**——`fc.` 隨 `GameState.fieldCombats`、`bu.`／`jin.` 隨 `GameState.battles`（`BattleState`）（勘誤 E-12／E-18／E-51；四輪裁決 C-3 修正原「不序列化」誤述）。`fc.` 可作為事件 payload 的 `battleId`／`sourceBattleId`（型別 string，見 §4.19，四輪裁決 C-2） | `fc.<node>-<tick>`／`bu.<army>`／`jin.<col>-<row>` |

> 前綴登記註記（勘誤 E-51）：`trans.`／`plot.`／`fc.`／`bu.`／`jin.` 於此登記；`pact.`／`crank.`／`stitle.` 前綴**廢除**——協定內嵌於 `DiplomacyRow.pacts`（§4.11，無獨立 `PactId`）、官位／幕府役職以 enum 值即識別符（§3.3，勘誤 E-25／E-26／E-28）。

### 3.3 全案 enum 總表

enum 一律以 **string literal union** 實作（利於 JSON 序列化與存檔可讀性）。
繁中顯示值透過 i18n key `term.<enumName>.<value>` 取得（key 主表見 13）；下表「顯示」欄為建議字串。

```ts
// src/core/state/enums.ts
export type CastleTier    = 'main' | 'branch';                       // 城格：本城/支城
export type OfficerStatus = 'serving' | 'ronin' | 'captive' | 'dead'; // 仕官/浪人/捕虜/死亡
export type Rank =                                                    // 身分六階（00 §4）
  | 'kumigashira'      // 足輕組頭
  | 'ashigaru-taisho'  // 足輕大將
  | 'samurai-taisho'   // 侍大將（可任城主）
  | 'busho'            // 部將
  | 'karo'             // 家老（可任軍團長）
  | 'shukuro';         // 宿老
export type ArmyStatus =                                              // 部隊狀態機（七態，勘誤 E-10 聯集定案）
  | 'marching'      // 行軍
  | 'engaged'       // 交戰（野戰/合戰中）
  | 'sieging'       // 攻城
  | 'subjugating'   // 制壓（翻轉敵郡）
  | 'returning'     // 歸還（04 的 retreating 併入）
  | 'routed'        // 潰走（合戰/野戰敗走；行為單一擁有者見 07 §3.4）
  | 'holding';      // 固守待命（07 的 resting 併入）
export type ArmyMission =                                            // 部隊出陣任務目標（意圖層；與 ArmyStatus 活動層正交，二輪裁決 B；語意見 07 §3.1）
  | 'march'         // 進軍：抵達非敵城目標後駐留 holding；途經敵郡依 04 制壓
  | 'conquer'       // 攻略：目標為敵城，抵達後自動建立 Siege（07 §3.11）
  | 'return';       // 歸還：目標＝originCastleId（已失守則最近我方城），抵達解散（07 §3.13）
export type BattleMode  = 'auto' | 'tactical';    // 【作廢，勘誤 E-18】野戰改用 FieldCombat、合戰改用 BattleState（§4.9）；保留僅供舊資料遷移
export type SiegeMode   = 'encircle' | 'assault'; // 包圍 / 強攻
export type AweLevel    = 'none' | 'small' | 'medium' | 'large'; // 威風 無/小/中/大
export type RoadKind    = 'land' | 'sea';         // 街道 / 海路
export type PactKind    = 'alliance' | 'marriage' | 'ceasefire' | 'vassal'; // 同盟/婚姻/停戰/從屬
export type PlotKind    = 'poach' | 'rumor' | 'betrayal'; // 引拔/流言/內應
export type CourtRank =                                    // 朝廷官位（低→高；語意見 08）
  | 'none'    // 無位無官
  | 'ju5ge'   // 從五位下
  | 'ju5jo'   // 從五位上
  | 'ju4ge'   // 從四位下
  | 'ju4jo'   // 從四位上
  | 'ju3'     // 從三位
  | 'sho3'    // 正三位
  | 'ju2'     // 從二位
  | 'sho2';   // 正二位（v1.0 天花板）
export type ShogunateTitle =                               // 幕府役職（語意見 08）
  | 'none'        // 無役職
  | 'hokoshu'     // 奉公眾
  | 'otomoshu'    // 御供眾
  | 'shobanshu'   // 相伴眾
  | 'kanrei'      // 管領
  | 'fukushogun'  // 副將軍
  | 'shogun';     // 征夷大將軍
export type CorpsDirective = 'advance' | 'hold' | 'develop'; // 軍團方針：攻略/固守/開發（語意見 09）
export type DevelopFocus   = 'agri' | 'commerce' | 'barracks'; // 直轄郡開發重點：農業/商業/兵舍（第三值採 05 barracks：人口成長×2、徵兵×1.25，勘誤 E-07；語意見 05 §3.2.2）
export type ConscriptPolicy = 'low' | 'mid' | 'high'; // 城徵兵方針：低/中/高（每月自動回復，勘誤 E-42；語意見 05 §3.5）
export type Kinship        = 'kin' | 'fudai' | 'tozama'; // 家臣出身：一門/譜代/外樣（忠誠公式依賴，勘誤 E-34；語意見 06 §4）
export type BattleOrderKind = 'advance' | 'hold' | 'charge' | 'withdraw'; // 【作廢，勘誤 E-18】合戰改用 CmdBattleMove/Attack/Tactic/Delegate（§4.18）取代單一 order 欄位
export type ProposalKind =                                  // 具申種類（生成邏輯見 06/09）
  | 'develop' | 'facility' | 'conscript' | 'transport'      // 內政類
  | 'march' | 'recall'                                      // 軍事類
  | 'diplomacy' | 'plot'                                    // 外交調略類
  | 'policy' | 'recruit' | 'reward';                        // 勢力經營類
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type Difficulty  = 'easy' | 'normal' | 'hard';       // 初級/中級/上級（00 §11）
export type Season      = 'spring' | 'summer' | 'autumn' | 'winter';
export type Region =                                        // 9 地方批次（00 §10）
  | 'tokai' | 'kinki' | 'kanto' | 'koshinetsu' | 'hokuriku'
  | 'chugoku' | 'shikoku' | 'kyushu' | 'tohoku';
export type CaptiveAction = 'recruit' | 'release' | 'execute'; // 捕虜處置：登用/釋放/處斬
export type RewardTier   = 'small' | 'medium' | 'large'; // 金錢褒賞檔位：小/中/大（費用與忠誠增益由 BAL 推導、年內遞減，勘誤 E-29；語意見 06 §3.8.1）
```

### 3.4 序列化規範（canonical）

1. `GameState` 全樹必須是 **JSON 可直接序列化的 plain object**：
   - 禁止 `Map` / `Set` / `Date` / `RegExp` / `BigInt` / class instance / 函式。
   - 禁止 `undefined`：可缺欄位一律型別宣告為 `X | null` 並存 `null`。
   - 禁止循環引用：實體間只存 ID 字串。
2. 數值欄位一律 **有限數**（禁 `NaN` / `Infinity`）；註明「整數」的欄位在寫入時以 `Math.round` 取整。
3. 存檔即 `JSON.stringify(state)` 後經 lz-string 壓縮（流程見 16）；狀態內含全部靜態欄位
   （名稱、座標、上限），**存檔自我完備**，讀檔不需重查劇本資料（版本遷移策略見 16）。
4. golden test 與狀態雜湊使用 §5.4 的 **sorted-key canonical stringify**，確保跨平台位元一致。
5. `Record` 走訪順序不可依賴 insertion order 產生遊戲邏輯差異：所有需要迭代實體的系統，
   **必須以 id 字典序排序後迭代**（決定論要求，見 00 §5.5；實作規範見 03）。
6. **序列化 transient 剔除例外（勘誤 E-60）**：`GameState.ai.intentLog`（AI 決策環形緩衝，§4.20）
   **不落地存檔、亦不入第 4 點狀態雜湊**，是 state 樹內唯一不持久化的欄位。剔除機制（寫死）：
   `JSON.stringify`（存檔）與 `canonicalStringify`（§5.4 雜湊）之前，以淺拷貝將該欄位覆寫為空陣列
   ——`serialized = { ...state, ai: { ...state.ai, intentLog: [] } }`，不變動記憶體中的原 `state`；
   讀檔後 `intentLog` 恆初始化為 `[]`。此為第 1 點「全樹 JSON 可序列化」與 DDR-8 原則在 state 樹內的
   唯一顯式落地例外（`intentLog` 為除錯紀錄、非可推導值，故不違反 DDR-8「可推導值不存 state」）。

### 3.5 狀態大小估算（郡 350／武將 600 規模）

以 minified JSON（未壓縮）估算單一實體平均位元組：

| 集合 | 數量 | 每筆估計 | 小計 |
|---|---:|---:|---:|
| officers | 600 | ~330 B | ~198 KB |
| districts | 350 | ~270 B | ~95 KB |
| castles | 122 | ~380 B（含施設 slot） | ~46 KB |
| roads | ~450 | ~120 B | ~54 KB |
| clans（含 taimei 狀態） | 40 | ~300 B | ~12 KB |
| diplomacy.rows（滿矩陣 40×39/2） | 780 | ~190 B | ~148 KB |
| armies（尖峰） | ~60 | ~280 B | ~17 KB |
| battles + sieges（尖峰） | ~15 | ~600 B | ~9 KB |
| corps / policies / proposals / events / court | — | — | ~25 KB |
| reports（上限 `BAL.reportMaxKept` = 500 筆） | 500 | ~230 B | ~115 KB |
| provinces / time / rng / meta | — | — | ~8 KB |
| **合計（未壓縮）** | | | **≈ 750 KB** |

lz-string `compressToUTF16` 後預期 **100–180 KB／存檔槽**，IndexedDB 容量無虞。
`diplomacy.rows` 採**稀疏儲存**（僅存曾互動、數值偏離預設的 pair，見 §4.11）可再省約 100 KB。

---

## 4. 資料結構

以下為 `src/core/state/` 各檔的完整型別。**所有欄位皆必填**（可缺者明示 `| null`）。

### 4.1 GameState 樹

```ts
// src/core/state/gameState.ts
export interface GameState {
  meta:      MetaState;                       // 劇本/種子/版本/流水號
  time:      TimeState;                       // 曆法
  rng:       RngState;                        // 多流亂數內部狀態
  clans:     Record<ClanId, Clan>;
  officers:  Record<OfficerId, Officer>;
  castles:   Record<CastleId, Castle>;
  districts: Record<DistrictId, District>;
  provinces: Record<ProvinceId, Province>;
  roads:     Record<RoadEdgeId, RoadEdge>;    // 邊集合（載入後不變）
  armies:    Record<ArmyId, Army>;
  fieldCombats: Record<string, FieldCombat>; // 進行中野戰（每節點一場；key = FieldCombat.id 'fc.*'；勘誤 E-18）
  battles:   Record<BattleId, BattleState>;   // 進行中合戰（戰術戰場；同時至多一場，勘誤 E-18）
  sieges:    Record<SiegeId, Siege>;          // 進行中攻城戰
  corps:     Record<CorpsId, Corps>;          // 軍團
  transports: Record<TransportId, TransportOrder>; // 進行中輸送隊（勘誤 E-41）
  diplomacy: DiplomacyState;                  // 外交列＋進行中外交工作＋調略＋提案
  court:     CourtState;                      // 朝廷與幕府
  policies:  Record<ClanId, ClanPolicyState>; // 各勢力政策狀態
  proposals: Record<ProposalId, Proposal>;    // 具申
  events:    EventsState;                     // 事件引擎狀態
  ai:        AiState;                         // AI 狀態分支（09；intentLog 為 transient，勘誤 E-60）
  reports:   Report[];                        // 通知（新→舊，長度 ≤ BAL.reportMaxKept）
}
```

### 4.2 MetaState / TimeState / RngState

```ts
export interface MetaState {
  saveVersion: number;      // 存檔格式版本，整數 ≥1；遷移規則見 16
  appVersion: string;       // 建置版本字串（如 '1.0.3'），僅供顯示與除錯
  scenarioId: string;       // 劇本 id：v1.0 恆為 's1560'
  seed: number;             // 初始種子，uint32（0..2^32-1）；重放重現用
  playerClanId: ClanId;     // 玩家勢力
  difficulty: Difficulty;   // 難易度（僅影響 AI 修正，00 §11）
  nextSerials: {            // 執行期 ID 流水號（§5.3），各為整數 ≥1，只增不減
    army: number; battle: number; siege: number;
    corps: number; proposal: number; report: number;
    transport: number; plot: number; // 勘誤 E-41／E-28
  };
  gameOver: GameOverState | null; // 結局狀態；null=遊戲進行中（10 §4.3 canonical，勘誤 E-55）
}

/** 結局狀態（10 §3.8／§4.3；gameOver≠null 時一切 Command 被拒，見 10 §5） */
export interface GameOverState {
  kind: 'victory' | 'defeat'; // 勝利／敗北
  endingId: string;           // 結局條件 id：'unification'/'tenkabito'/'no-heir'/'no-castle'（10 定義）
}

export interface TimeState {
  day: number;         // 絕對日（單一真相）：0 = 1560年1月1日，整數 ≥0；1年=360日
  year: number;        // 快取：西曆年（=1560+floor(day/360)）；INV-24 驗證
  month: number;       // 快取：1..12
  dayOfMonth: number;  // 快取：1..30
}
// season 為衍生值：month∈{3,4,5}→spring、{6,7,8}→summer、{9,10,11}→autumn、{12,1,2}→winter

export interface RngState {
  // mulberry32 各流內部狀態，uint32（0..2^32-1）；分流用途見 00 §5.5，演算法見 03
  battle: number;  // 戰鬥（野戰/合戰/攻城）
  dev: number;     // 內政開發
  ai: number;      // AI 決策
  event: number;   // 事件引擎
  misc: number;    // 其他（壽命、忠誠抖動等）
}
```

### 4.3 Clan（勢力）與 TaimeiState

```ts
export interface Clan {
  id: ClanId;
  name: string;               // 顯示名（繁中，如「織田家」）；專有名詞不進 i18n（00 §8）
  leaderId: OfficerId;        // 當主；INV-08：必為本家 serving 武將
  homeCastleId: CastleId;     // 本城（居城）；INV-09：須為本家 tier='main' 之城
  gold: number;               // 金錢（貫），整數 ≥0（勢力層級資源，00 §4）
  prestige: number;           // 威信，整數 0..BAL.prestigeMax（2000）
  courtRank: CourtRank;       // 當主現任朝廷官位（v1.0 官位掛在勢力當主，見 §8 DDR-6）
  shogunateTitle: ShogunateTitle; // 幕府役職
  // persona 唯一真相為 AiClanState.personaId（§4.20）；Clan.personaId 已刪（四輪裁決 D-13，消除雙重真相）。
  // 劇本 clan 區塊之 personaId 於載入時直寫 state.ai.clans[clanId].personaId（AI 與玩家勢力皆持有；備忘錄交 14／09）。
  colorIndex: number;         // 勢力色索引，整數 0..39（40 色相環；渲染層由公式導出 hex，見 12 D5；劇本資料指定，勘誤 E-35）
  alive: boolean;             // 滅亡狀態：false = 已滅亡（所有城被奪）；滅亡勢力保留於 state 供史錄
  destroyedDay: number | null;// 滅亡絕對日；alive=true 時為 null
  taimei: TaimeiState;        // 大命狀態（可發動清單為衍生值，見 §5.1；語意見 10）
}

export interface TaimeiState {
  activeTaimeiId: TaimeiId | null; // 進行中大命；同時至多一個
  activeUntilDay: number;          // 效果結束絕對日；無進行中大命時為 0
  cooldownUntilDay: number;        // 此日（含）之前不可再發動；初始 0
}
```

### 4.4 Officer（武將）

```ts
export interface Officer {
  id: OfficerId;
  name: string;                 // 顯示名（繁中，如「織田信長」）
  clanId: ClanId | null;        // 所屬勢力：serving＝現屬（該勢力 alive）；captive＝**原屬勢力**（供釋放/歸還目的地判定，可能已滅亡，四輪裁決 A-c／06 §3.7.2）；ronin/dead＝null（INV-08；捕獲方另存於 capturedByClanId）
  status: OfficerStatus;        // 仕官 serving / 浪人 ronin / 捕虜 captive / 死亡 dead
  ldr: number;                  // 統率「基礎值」，整數 1..BAL.abilityMax（120）；有效值見下 statGrowth
  val: number;                  // 武勇基礎值，整數 1..120
  int: number;                  // 知略基礎值，整數 1..120
  pol: number;                  // 政務基礎值，整數 1..120
  statExp: StatBlock;           // 各維累積經驗（點；每 BAL.statExpPerPoint→成長 +1，勘誤 E-59；06 §3.2）
  statGrowth: StatBlock;        // 各維已獲成長，整數 0..BAL.statGrowthCap；effectiveStat = min(120, 基礎值 + statGrowth)
  traits: TraitId[];            // 特性（被動技），0..BAL.maxTraitsPerOfficer（4）個，不重複
  rank: Rank;                   // 身分六階；升格規則見 06
  merit: number;                // 功績，整數 ≥0（累積值，升格門檻見 06）
  loyalty: number;              // 忠誠，整數 0..100；當主恆 100（INV-08）；<30 有出奔/被引拔風險
  kinship: Kinship;             // 出身：一門/譜代/外樣；影響忠誠與繼承（勘誤 E-34；06 §4）
  spouseId: OfficerId | null;   // 婚姻同盟成婚對象；無為 null（勘誤 E-44；08 §3.4.1）
  birthYear: number;            // 生年（西曆），如 1534
  deathYear: number;            // 卒年基準（西曆）：史實或生成卒年（＝06 historicalDeathYear，備忘錄交 06 對齊命名）；開局據此＋rng.event 抖動決定論排定 scheduledDeath（06 §3.9.1），執行期不再另計抖動
  hasComeOfAge: boolean;        // 已元服（年滿 15）；false 者不可被任何系統引用（INV-06）
  debutYear: number;            // 元服登場年（06 §3.10；14 資料未給時 builder 以 birthYear + BAL.comingOfAgeAge 生成，五輪裁決收錄）
  debutClanId: ClanId | null;   // 元服時加入的勢力（null＝直接為浪人，06 §3.10）；14 未給時 builder 預設 = clanId
  debutCastleId: CastleId;      // 元服/淪為浪人時的所在城（06 §3.10）；14 未給時 builder 預設 = locationCastleId
  locationCastleId: CastleId | null; // 所在城：serving 未出陣=駐在城；ronin=寄寓城；captive=關押城；出陣中/dead=null
  armyId: ArmyId | null;        // 出陣中所屬部隊；未出陣為 null（與 locationCastleId 互斥，INV-07）
  capturedByClanId: ClanId | null;   // status='captive' 時的捕獲勢力（俘方）；否則 null（原屬勢力見 clanId）
  // ── 06 機制持久欄位（四輪裁決 A：02 原缺、06 機制必需，全數收錄；日期一律絕對日 number，非 06 之 GameDate，備忘錄交 06）──
  scheduledDeath: { year: number; month: number }; // 開局以 rng.event 決定論排定之壽命死亡年月（06 §3.9.1）；每月 1 日與 time 比對觸發自然死亡（06 §3.9.2）；戰死/事件死優先發生時排程作廢
  captiveRetryOn: number | null;     // captive 登用失敗後之下次可嘗試絕對日（06 §3.7.2）；否則 null
  recruitRetryOn: number | null;     // ronin 登用失敗後、其寄寓城所屬勢力之下次可嘗試絕對日（單一勢力冷卻，06 §3.7.1）；否則 null
  rewardGiftsThisYear: number;       // 年內已受金錢賞賜次數，整數 ≥0（每年 1/1 歸零；賞賜忠誠增益年內遞減用，06 §3.8.1）
  stalledPromotionMonths: number;    // 功績達下一階門檻但未獲升格的連續月數，整數 ≥0（升格具申生成參考，06 §3.4.1／§5.1）
}

/** 四維數值組（統率/武勇/知略/政務），單位：點（勘誤 E-59；06 §4 OfficerStats） */
export interface StatBlock {
  ldr: number; val: number; int: number; pol: number;
}
```

武將的「役職」（城主／領主／軍團長）**不存於 Officer**，一律由 `Castle.lordId` /
`District.stewardId` / `Corps.corpsLeaderId` 反查（selector 見 §5.1），避免雙重真相。

### 4.5 Castle（城）與 BuildOrder

```ts
export interface Castle {
  id: CastleId;
  name: string;                // 顯示名（繁中，如「清洲城」）
  tier: CastleTier;            // 城格：'main' 本城 / 'branch' 支城
  provinceId: ProvinceId;      // 所屬國（顯示分組）
  coastal: boolean;            // 臨海（湊/南蠻寺建設前置；劇本靜態，載入後不變；語意見 05 §3.4.2；勘誤 E-44/E-61）
  pos: { x: number; y: number }; // 地圖世界座標，0..4096（投影公式見 00 §8；載入後不變）
  ownerClanId: ClanId;         // 所屬勢力；INV-02：必存在且 alive
  lordId: OfficerId | null;    // 城主；null=空缺（由 AI/具申補任）；INV-04：serving＋同勢力＋rank ≥ 'samurai-taisho'
  directControl: boolean;      // true=大名直轄；false=委任（城主AI代管，語意見 09）
  corpsId: CorpsId | null;     // 所屬軍團；null=不屬任何軍團（大名直轄方面）
  durability: number;          // 耐久，整數 0..maxDurability；攻城目標（07）
  maxDurability: number;       // 耐久上限，整數；建議初值 BAL.durabilityMain（3000）/ BAL.durabilityBranch（1000）
  soldiers: number;            // 駐留兵力（人），整數 ≥0；上限為衍生值 castleMaxSoldiers（§5.1）
  food: number;                // 兵糧（石），整數 ≥0；上限為衍生值 castleFoodCap（05）
  foodFrac: number;            // 兵糧日消耗小數累加器，0..1（存檔保留以維持決定論；food 恆整數，05 §3.1.3／§5.2；四輪裁決 D-12）
  riceTradedThisMonth: number; // 本月米問屋買賣累計量（石），整數 ≥0；每月 1 日重置為 0；BAL.riceTradeCapMonthly 上限判定用（05 §5.5；四輪裁決 D-10 追記）
  morale: number;              // 城士氣，整數 0..100；受威風/圍城影響（07）
  conscriptPolicy: ConscriptPolicy; // 徵兵方針 low/mid/high（每月自動回復；委任城由城主 AI 設定，勘誤 E-42；05 §3.5）
  facilities: FacilityTypeId[];// 已建成城下施設（每種至多一個；佇列制，勘誤 E-39；05 §3.4）
  buildQueue: BuildOrder[];    // 建造佇列（[0]=施工中；長度 ≤ BAL.buildQueueSize；同時施工 1 件，完工自動接續，勘誤 E-39）
  betrayalReadyClanId: ClanId | null; // 內應成果持有勢力；圍攻該城時可發動內應（勘誤 E-44；08 §3.7.3）
  betrayalReadyUntilDay: number; // 內應標記到期絕對日；無標記時為 0
  districtIds: DistrictId[];   // 所轄郡，2..4 個；與 District.castleId 互為鏡像（INV-03）
}

/** 建造佇列項（勘誤 E-39；05 §3.4） */
export interface BuildOrder {
  facilityTypeId: FacilityTypeId; // 目標施設種類
  daysLeft: number;               // 剩餘工期（日），整數 ≥0；下單時 = 該施設 buildDays（05 型錄）
}
```

### 4.6 District（郡）

```ts
export interface District {
  id: DistrictId;
  name: string;                // 顯示名（繁中，如「春日井郡」）
  castleId: CastleId;          // 所轄城（載入後不變；城易主時郡隨城，制壓為暫時例外）
  isPort: boolean;             // 港郡（海路端點資格；劇本靜態，載入後不變；語意見 04 §3.4.3；勘誤 E-44）
  pos: { x: number; y: number }; // 地圖世界座標 0..4096（節點圖節點；載入後不變）
  ownerClanId: ClanId;         // 歸屬勢力；平時=castleId 之 ownerClanId，制壓/威風後可暫時不同（04/07）
  stewardId: OfficerId | null; // 領主（知行受封者）；null=直轄；INV-05：serving＋同勢力；知行數上限見 §5.1
  kokudaka: number;            // 石高（石/年，農業產出年額），≥0，≤ kokudakaCap（**內部浮點儲存、顯示 floor**，05 §3.2.1／§8-D5；四輪裁決 D-12）
  kokudakaCap: number;         // 石高開發潛力上限（石/年），整數；劇本資料指定，遊戲中不變
  commerce: number;            // 商業，0..commerceCap（**內部浮點儲存、顯示 floor**，05 §3.2.1）
  commerceCap: number;         // 商業潛力上限，整數 ≤ BAL.commerceMaxAbs（2000，00 §6）
  population: number;          // 人口（人），≥0，≤ populationCap（**內部浮點儲存、顯示 floor**，05 §3.2.1）；徵兵與城兵力上限基礎
  populationCap: number;       // 人口上限（人），整數；劇本資料指定
  publicOrder: number;         // 治安，整數 0..100；低於 BAL.uprisingOrderThreshold 有一揆風險（05）
  developFocus: DevelopFocus;  // 開發重點（直轄郡由玩家指令設定；受封郡由領主AI自設，05/09）
  subjugation: {               // 制壓進度；無人制壓時為 null（進度為郡的事實，DDR-9）
    clanId: ClanId;            //   制壓方勢力；INV-20：≠ ownerClanId
    progress: number;          //   進度 0..100（每日推進量見 04）；達 100 翻轉 ownerClanId
    daysRequired: number;      //   制壓所需日數快取，整數 ≥1（由當前制壓部隊抵達時依 04 §3.8 算定；每日 progress += 100/daysRequired；同勢力接力換將時以新部隊大將重算，四輪裁決 D-14／DDR-9）
  } | null;
  uprising: UprisingState | null; // 一揆狀態；null=無（勘誤 E-43；語意見 05 §3.8）
}

/** 一揆狀態（勘誤 E-43；05 §3.8） */
export interface UprisingState {
  startedOnDay: number;        // 爆發絕對日
  armySoldiers: number;        // 一揆軍現存兵力（人），整數 ≥0
}
```

「開發度」為衍生值 `developmentPct`（§5.1），不另存欄位。

### 4.7 Province（國）與 RoadEdge（街道邊）

```ts
export interface Province {
  id: ProvinceId;
  name: string;                // 顯示名（繁中，如「尾張」）
  region: Region;              // 9 地方分區（資料製作批次與 UI 篩選用）
  labelPos: { x: number; y: number }; // 國名標籤渲染座標 0..4096
}
// Province 轄下城清單為衍生值（以 castle.provinceId 反查）；Province 無任何可變欄位。

export interface RoadEdge {
  id: RoadEdgeId;
  a: MapNodeId;                // 端點甲（城或郡節點）
  b: MapNodeId;                // 端點乙；INV-11：a ≠ b、皆存在；(a,b) 無向對全域唯一
  type: RoadKind;              // 'land' 陸路 / 'sea' 海路（勘誤 E-36：欄位名依 04；海路行軍規則見 04 §3.4.3）
  grade: 1 | 2 | 3;            // 道級（道路品質）；速度倍率 BAL.roadGradeSpeedMult（海路固定 1，勘誤 E-36；04 §3.4.2）
  baseDays: number;            // 基礎行軍日數（道級 1、無修正時走完此邊；0.5 為最小刻度，∈[0.5,8]）；有效日數 edgeCostDays = baseDays / roadGradeSpeedMult[grade]（04）
}
// RoadEdge 載入後全欄位不變；鄰接表為載入時建立的 transient 衍生結構（§5.1）。
```

### 4.8 Army（出陣中部隊）

```ts
export interface Army {
  id: ArmyId;
  clanId: ClanId;              // 所屬勢力
  leaderId: OfficerId;         // 大將；INV-06：serving＋同勢力＋officer.armyId 回指本部隊
  deputyIds: OfficerId[];      // 副將 0..BAL.maxDeputies（2）人；約束同大將
  soldiers: number;            // 兵數（人），整數 ≥0；歸 0 時部隊潰散消滅（07）
  initialTroops: number;       // 出陣時兵數（人），整數 ≥0；潰走判定基準 soldiers < initialTroops × BAL.routTroopRatio（07 §3.2／§3.4）；途中補兵時同步上調（二輪裁決 B）
  food: number;                // 攜帶兵糧（石），整數 ≥0；每日消耗，歸 0 士氣崩落（07）
  morale: number;              // 部隊士氣，整數 0..100；≤ BAL.moraleBreakThreshold 潰走（07）
  status: ArmyStatus;          // 活動層狀態機：marching / engaged / sieging / subjugating / returning / routed / holding
  mission: ArmyMission;        // 意圖層任務目標（march/conquer/return，§3.3）；與 status 正交（conquer 意圖可歷經 marching→engaged→sieging），非可穩健衍生自 status 或 isEnemyCastleNode(target)（二輪裁決 B；07 §3.1／§3.11／§3.13）
  originCastleId: CastleId;    // 出陣城（歸還目的地；兵員兵糧歸還入庫）
  targetNodeId: MapNodeId | null; // 最終目標節點；returning 時為 originCastleId 所在節點、可為 null（原地解散待命不允許，見 04）
  path: MapNodeId[];           // 尋路結果節點序列（含起點與終點）；重尋路時整條替換
  pathCursor: number;          // 已抵達之 path 索引（＝04 §4.2 MarchState.nodeIndex 語意），整數 0..path.length-1
  posNodeId: MapNodeId;        // 最近抵達節點（= path[pathCursor]）
  edgeProgressDays: number;    // 往 path[pathCursor+1] 之當前邊已累積行軍日數（日，浮點 ≥0）；位於節點上／已抵終點為 0（勘誤 E-11；日數累加模型見 04 §5）
  edgeCostDays: number;        // 當前邊有效日數（日）＝edge.baseDays / BAL.roadGradeSpeedMult[grade]（海路固定＝baseDays）；抵達判定 edgeProgressDays ≥ edgeCostDays（勘誤 E-11；04 §3.4.2／§5）；位於終點節點時為 0
  battleId: BattleId | null;   // 進入合戰（BattleState）時所屬合戰；否則 null。野戰 engaged 的歸屬改由 FieldCombat.sideX.armyIds 反查（勘誤 E-18，INV-13）
  siegeId: SiegeId | null;     // status='sieging' 時所屬攻城戰；否則 null（INV-13）
  autoReturn: boolean;         // 自動歸還開關（預設 true）；糧將盡／任務完成時自動轉 returning（CmdSetAutoReturn 切換，勘誤 E-32；07 §3.13）（二輪裁決 B）
  corpsId: CorpsId | null;     // 所屬軍團；null=大名直轄。非衍生：出陣時快照，軍團解散／收回城時顯式改 null（07 §3.12）；不可由 originCastle.corpsId 衍生（直轄城出陣後才入軍團之情形會誤判歸屬）（二輪裁決 B）
}
```

狀態機合法轉移（詳細觸發條件見 04/07）：

```
marching ──遭遇敵軍──▶ engaged ──野戰/合戰勝──▶ marching│holding│returning
marching ──抵達敵郡──▶ subjugating ──完成──▶ marching
marching（mission=conquer）──抵達敵城──▶ sieging ──陷落/解圍──▶ marching│holding│returning
marching（mission=march）──抵達非敵城目標──▶ holding ；holding ──新指令/召回──▶ marching│returning
任意態 ──玩家召回(CmdRecallArmy) / 任務完成 / 糧將盡(autoReturn)──▶ returning ──抵達出陣城──▶ （部隊解散，從 armies 移除）
任意態 ──士氣崩(morale ≤ BAL.moraleBreakThreshold，**含糧盡致崩**) 或 兵力潰(soldiers < initialTroops × BAL.routTroopRatio)──▶ routed ──抵達最近我方城──▶ （殘兵編入城，Army 移除）
returning／routed ──全地圖無我方城──▶ 就地解散（武將成浪人，07 §3.4）
（潰走/糧盡的士氣崩模型單一擁有者為 07 §3.4／§3.13；四輪裁決 D-8 修正原「糧盡→returning」之矛盾）
```

### 4.9 野戰（FieldCombat）與合戰（BattleState）進行中狀態

> **勘誤 E-18（明定例外，02 > 07 優先序之例外，理由見 §8 DDR-12）**：本節以 07 §4 的
> **陣（Jin）節點圖**模型置換原方格戰場模型。野戰＝`FieldCombat`（每節點一場、`military.combat`
> 每日解算，存於 `GameState.fieldCombats`）；合戰＝`BattleState`（策略時間暫停期間的 modal 子迴圈，
> 存於 `GameState.battles`）。`BattleMode`／`BattleOrderKind` enum 隨此置換作廢（§3.3 標註）。

```ts
/** 野戰交戰狀態（一節點一場；欄位語意與規則見 07 §3.3／§5.2） */
export interface FieldCombat {
  id: string;                  // 'fc.<nodeId去前綴>-<開始日絕對tick>'（內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2）
  nodeId: MapNodeId;           // 交戰節點
  startedDay: number;          // 開始絕對日
  sideA: FieldCombatSide;      // 先到方
  sideB: FieldCombatSide;
  kassenUsed: boolean;         // 本遭遇是否已發動過合戰
  interrupted: boolean;        // 有進行中合戰（BattleState）或援軍流程時暫停每日解算（勘誤 E-64）
}

export interface FieldCombatSide {
  clanIds: ClanId[];           // 同側勢力（含同盟援軍）
  armyIds: ArmyId[];           // 同側部隊
  initialTroops: number;       // 交戰開始時總兵數（威風判定用）
  cumulativeLosses: number;    // 累計損失兵數
}

/** 合戰（戰術戰場）——策略時間暫停期間的獨立狀態機（07 §3.5～§3.9） */
export interface BattleState {
  id: BattleId;                // 六位流水（勘誤 E-12：id 格式依 02 §5.3）
  fieldCombatId: string;       // 來源野戰遭遇（FieldCombat.id）
  nodeId: MapNodeId;
  terrain: string;             // 遭遇節點地形（terrain 枚舉見 04）
  attackerClanId: ClanId;      // 發動側
  defenderClanId: ClanId;
  jins: Jin[];                 // 陣（戰場節點，建議 5×3）
  edges: JinEdge[];            // 陣間連線
  units: BattleUnit[];         // 合戰部隊（1 Army = 1 BattleUnit）
  tick: number;                // 目前 battle tick（0 起）；達 BAL.kassenMaxTicks（120）強制結束
  saihai: { attacker: number; defender: number }; // 各側共用采配值 0..BAL.saihaiMax
  honjinFallenTick: number | null; // 本陣陷落 tick（威風判定用）
  result: BattleResult | null; // 進行中為 null
}

export type BattleSide = 'attacker' | 'defender';

/** 陣（合戰戰場節點，07 §3.6） */
export interface Jin {
  id: string;                  // 'jin.<col>-<row>'（內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2）
  col: number;                 // 0..4
  row: number;                 // 0..2
  owner: BattleSide | 'neutral';
  isHonjin: boolean;           // 本陣（陷落＝立即敗北）
  flagPower: number;           // 現有旗力
  flagPowerMax: number;        // 旗力上限
  defenseBonus: number;        // 防禦加成 0..1（僅對歸屬側部隊生效）
}

export interface JinEdge {
  a: string;                   // Jin id
  b: string;                   // Jin id
  moveCost: number;            // 移動所需 tick（1 或 2）
}

/** 合戰部隊（勘誤 E-18：取代舊 BattleUnit 方格模型） */
export interface BattleUnit {
  id: string;                  // 'bu.<armyId去前綴>'（內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2）
  armyId: ArmyId;              // 對應出陣部隊
  side: BattleSide;
  generalId: OfficerId;        // 沿用 Army 大將
  troops: number;              // 現有兵數（人），整數 ≥0
  battleInitialTroops: number; // 合戰開始時兵數（潰走與治療基準）
  morale: number;              // 0..100
  jinId: string;               // 所在陣
  moveTargetJinId: string | null; // 移動中的目標陣（沿單一邊）
  moveProgress: number;        // 已累積移動 tick
  attackTargetUnitId: string | null; // 玩家指定攻擊目標
  activeTactics: ActiveTactic[];
  tacticCooldowns: Record<string, number>; // tacticId → 剩餘冷卻 tick
  delegated: boolean;          // 是否委任 AI
  routed: boolean;             // 已潰走（撤離中或已離場）
}

export interface ActiveTactic {
  tacticId: TacticId;          // 'tac.*'
  remainingTicks: number;      // 即時型不入列
  targetUnitId: string | null; // 減益型的目標
}

export interface BattleResult {
  winnerSide: BattleSide;
  endTick: number;
  attackerLosses: number;      // 攻方累計損兵
  defenderLosses: number;
  aweLevel: AweLevel;          // 勝方獲得的威風（'none'=無）
}
```

合戰結束時由 07 的結算函式計算 `AweLevel`（威風）填入 `BattleResult.aweLevel` 並發出
`battle.ended`／`awe.triggered` 事件；威風擴散效果直接改寫周邊 `District.ownerClanId` 與 `Castle.morale`。

### 4.10 Siege（攻城戰進行中狀態）

```ts
export interface Siege {
  id: SiegeId;
  castleId: CastleId;          // 被圍之城
  attackerClanId: ClanId;      // 攻方勢力（多部隊同勢力聯攻；跨勢力聯攻 v1.0 不支援）
  attackerArmyIds: ArmyId[];   // 攻方部隊（≥1，status 皆 'sieging'）
  mode: SiegeMode;             // 'encircle' 包圍（斷糧耗士氣）/ 'assault' 強攻（削耐久、傷兵）
  startDay: number;            // 開圍絕對日
  interrupted: boolean;        // 援軍交戰中，圍城每日效果暫停（07 §3.11；與 E-18/E-64 同構）
  betrayalUsed: boolean;       // 本場圍城是否已發動過內應（CmdUseBetrayal，勘誤 E-32）
}
// 城方兵力/兵糧/耐久/士氣直接使用 Castle 欄位演進（07），Siege 不重複儲存。
```

### 4.11 DiplomacyState（外交）

```ts
export interface DiplomacyState {
  rows: Record<ClanPairKey, DiplomacyRow>; // 稀疏：僅存偏離預設值的 pair；缺列視同預設列（§5.5）
  missions: DiploMission[];                // 進行中外交／獻金工作（同一 (fromClanId, target) 至多一件，INV-14；target 可為 'court'（朝廷獻金）或 'shogunate'（幕府獻金）工作，勘誤 E-27／三輪裁決 2）
  plots: Plot[];                           // 進行中調略（引拔/流言/內應；勘誤 E-28；語意見 08 §3.7）
  pendingProposals: DiplomacyProposal[];   // 送達待回應的外交提案（勘誤 E-28；語意見 08 §3.4）
}

/** 每對勢力一列（無向 key；方向性數值以 a/b 兩欄表示，a = pairKey 字典序小者） */
export interface DiplomacyRow {
  key: ClanPairKey;            // = pairKey(a,b)
  a: ClanId;                   // 字典序小的勢力
  b: ClanId;                   // 字典序大的勢力
  trustAtoB: number;           // a 對 b 累積的信用，0..100（a 花費它對 b 提案；**允許小數累積、顯示 floor**——月增益含政務/感情小數項，08 §5.2.1；四輪裁決 D-16）
  trustBtoA: number;           // b 對 a 累積的信用，0..100（允許小數累積、顯示 floor）
  sentimentAtoB: number;       // a 對 b 的感情，−100..100（0=中立，允許小數累積；勘誤 E-24；預設 0，劇本可覆寫史實仇誼）
  sentimentBtoA: number;       // b 對 a 的感情，−100..100（0=中立，允許小數累積）
  pacts: Pact[];               // 進行中協定（同 kind 至多一件）
  // ── 08 機制之每對狀態欄位（語意擁有者 08、結構在此；稀疏：未設＝各自預設，materialize 該列時才寫入。三輪裁決 1）──
  lastHostileDay?: number;     // 最近敵對行為絕對日（無向、單一值）；未設＝從未交戰（≠ 0：0 代表「第 0 日敵對」，劇本開局交戰即設 0，見 14）；atWar 由此值在 BAL.warStateMonths 內推導、07 於野戰/合戰/攻城/制壓敵郡時回寫（08 §3.1）
  refusalCooldownUntilDay?: Partial<Record<DiplomacyActionKind, number>>; // 各外交行動被拒後之冷卻到期絕對日（pair 共用、依 kind 索引；缺鍵＝0＝無冷卻）；08 §5.3.2 寫、§5.3.1 讀
  lastReinforceRequestDayAtoB?: number; // a 向 b 上次請求援軍之絕對日（有向；未設＝從未請求＝冷卻已過，首次恆允許）；08 §5.3.2 寫、§5.3.5 讀
  lastReinforceRequestDayBtoA?: number; // b 向 a 上次請求援軍之絕對日（有向，同上）；有向存取語糖 lastReinforceRequestDay(X→Y) 見 08 §3.1（方向性定義）／§4.11
}

/** 調略（勘誤 E-28；08 §3.7） */
export interface Plot {
  id: PlotId;                  // 'plot.*'（§3.2）
  kind: PlotKind;              // poach 引拔 / rumor 流言 / betrayal 內應
  ownerClanId: ClanId;         // 發動方
  officerId: OfficerId;        // 執行武將（佔用：不可出陣、不可另任外交工作/調略）
  targetClanId: ClanId;        // 目標勢力
  targetOfficerId: OfficerId | null; // poach／rumor(武將模式) 必填；betrayal=目標城城主快照；否則 null
  targetCastleId: CastleId | null;   // rumor(城模式)／betrayal 必填；否則 null
  investGold: number;          // 一次性投入（貫），整數 ≥0；下達時已扣款
  progress: number;            // 進度 0..100
  startedDay: number;          // 開始絕對日
}

/** 外交提案種類（勘誤 E-28；08 §3.4）。08 的 'proposeNonAggression'（不可侵條約）依勘誤 E-23 降級 v1.1，v1.0 不收錄。 */
export type DiplomacyActionKind =
  | 'proposeAlliance'          // 同盟
  | 'proposeCeasefire'         // 停戰
  | 'proposeMarriage'          // 婚姻同盟
  | 'demandVassal'             // 從屬勸告（強→弱）
  | 'offerVassal'              // 從屬提案（弱→強）
  | 'requestReinforce';        // 援軍請求

/** 送達待回應的外交提案（勘誤 E-28；08 §3.4） */
export interface DiplomacyProposal {
  id: ProposalId;              // 與具申共用 prop. 流水（§5.3 nextSerials.proposal，全域唯一，勘誤 E-28）
  kind: DiplomacyActionKind;
  fromClanId: ClanId;          // 發起方
  toClanId: ClanId;            // 對象方
  createdDay: number;          // 建立絕對日
  expiresDay: number;          // 逾期絕對日（逾期視同拒絕）
  marriageOfficerIds: [OfficerId, OfficerId] | null; // 婚姻：〔from 方一門, to 方一門〕；否則 null
  reinforceAgainstClanId: ClanId | null; // 援軍請求：對抗的敵勢力；否則 null
}

export interface Pact {
  kind: PactKind;              // alliance / marriage / ceasefire / vassal
  startDay: number;            // 生效絕對日
  endDay: number | null;       // 到期絕對日（含）；null=無期限（marriage、vassal）
  vassalClanId: ClanId | null; // kind='vassal' 時的從屬方（必為 a 或 b）；其他 kind 為 null
}

export interface DiploMission {
  fromClanId: ClanId;          // 發起方
  target: ClanId | 'court' | 'shogunate'; // 對象：勢力（累積信用）／'court' 朝廷獻金（→courtFavor）／'shogunate' 幕府獻金（→shogunateFavor）；勘誤 E-27／三輪裁決 2，機制參見 08 §3.2／§3.5／§3.6.2
  officerId: OfficerId;        // 執行武將（serving、屬 from 方；執行期間不可出陣，08）
  startDay: number;            // 開始絕對日
  // 月費為固定 BAL 常數（對勢力 diplomacyWorkMonthlyCost／'court' courtWorkMonthlyCost），非玩家自訂；累積速率僅讀武將政務（08 §3.2／§5.2）。原 goldPerMonth 欄位刪除（勘誤 E-27 尾）。
}
```

### 4.12 CourtState（朝廷與幕府）

```ts
export interface CourtState {
  courtFavor: Record<ClanId, number>;     // 各勢力朝廷友好度，0..100（**允許小數累積、顯示 floor**——月增益含政務小數項，08 §5.2.2；四輪裁決 D-16）；由持續型獻金工作（DiploMission target='court'，勘誤 E-27）累積；官位敘任門檻（不消耗）與停戰斡旋消耗資源（機制參見 08 §3.5）
  shogunateFavor: Record<ClanId, number>; // 各勢力幕府友好度，0..100（允許小數累積、顯示 floor，08 §5.2.2）；由獻金工作（DiploMission target='shogunate'，三輪裁決 2）累積；役職敘任門檻（機制參見 08 §3.6.2）
  shogunateExists: boolean;               // 幕府存續；歷史事件可使其滅亡（10）
  shogunClanId: ClanId | null;            // 將軍家勢力（s1560 = 'clan.ashikaga'）；幕府滅亡後為 null（將軍本人為該家 Officer〔off.ashikaga-yoshiteru〕，其存亡走 Officer/事件，非存於此）
  patronClanId: ClanId | null;            // 擁立將軍的勢力（全域至多一個）；未擁立或幕府滅亡為 null（三輪裁決 2，機制參見 08 §3.6.3）
  mediationCooldownUntil: Record<ClanId, number>; // 各勢力下次可請朝廷斡旋停戰的絕對日；缺 key 視同 0
}
// 官位/幕府役職的「持有狀態」存於 Clan.courtRank / Clan.shogunateTitle（單一真相，DDR-6；非 CourtState 內的 Record）；本結構為朝廷/幕府之全域事實（友好度、存續、將軍家、擁立者、斡旋冷卻）。CourtState 採扁平結構（不巢狀 ShogunateState；08 §4 引用本定義，三輪裁決 2）。
```

### 4.13 Corps（軍團）

```ts
export interface Corps {
  id: CorpsId;
  clanId: ClanId;              // 所屬勢力
  corpsLeaderId: OfficerId;    // 軍團長；INV-10：serving＋同勢力＋rank ≥ 'karo'
  directive: CorpsDirective;   // 方針：advance 攻略 / hold 固守 / develop 開發（AI 行為見 09）
  targetNodeId: MapNodeId | null; // directive='advance' 時的攻略目標；其他方針為 null
  gold: number;                // 軍團金庫（貫），整數 ≥0；轄城收入上繳 BAL.corpsTithe（07 §3.12；勘誤 E-22）
  createdDay: number;          // 成立絕對日
}
// 軍團轄下城清單為衍生值（以 castle.corpsId 反查，§5.1）。

/** 輸送隊（GameState.transports；勘誤 E-41；語意見 05 §3.6） */
export interface TransportOrder {
  id: TransportId;             // 'trans.*'（§3.2）
  clanId: ClanId;              // 所屬勢力
  fromCastleId: CastleId;      // 出發城
  toCastleId: CastleId;        // 目的城
  soldiers: number;            // 押運兵力（人），整數 ≥0
  gold: number;                // 押運金錢（貫），整數 ≥0
  food: number;                // 押運兵糧（石），整數 ≥0（三者不得同時為 0）
  path: MapNodeId[];           // 全路徑節點序列（04 尋路產出，含起訖）
  pathCursor: number;          // 目前所在節點在 path 的索引（與 Army 同語意＝04 MarchState.nodeIndex；勘誤 E-11）
  edgeProgressDays: number;    // 往 path[pathCursor+1] 之當前邊已累積行軍日數（日，浮點 ≥0）；位於節點上為 0（勘誤 E-11；04 §5）
  edgeCostDays: number;        // 當前邊（**輸送隊調整後**）有效日數（日）；**完整公式歸 05 §3.6／§5.4**（roadGradeSpeedMult 與 transportSpeedFactor 皆為速度係數、對日數採**除以**慣例；消除與 05 之公式矛盾，四輪裁決 D-15／五輪裁決殘留修正）；抵達判定 edgeProgressDays ≥ edgeCostDays（勘誤 E-11；04 §3.4.2）
  returning: boolean;          // 是否已被撤回折返中
}
// 輸送隊為非戰鬥單位，不需武將帶隊、不佔兵力（05 §3.6）。
```

### 4.14 ClanPolicyState（政策狀態）

```ts
export interface ClanPolicyState {
  clanId: ClanId;
  active: PolicyId[];          // 已施行政策（不重複；同時上限為「動態政策格」= min(BAL.policySlotMax=6, 1+floor(威信/300))，勘誤 E-38；05 §3.7）
  cooldownUntil: Partial<Record<PolicyId, number>>; // 各政策廢止後可再採用之絕對日（缺鍵＝無冷卻＝0；BAL.policyReadoptCooldownMonths=6，05 §3.7.1；四輪裁決 D-11）
}
// 政策採「即刻生效」——無施行期（四輪裁決 D-11：機制擁有者 05 §3.7.1 為單一真相，原 enacting 施行期欄位刪除）：
// 採用（CmdEnactPolicy）即入 active 並發 policy.enacted；廢止（CmdRevokePolicy）即出 active、發 policy.revoked 並寫入 cooldownUntil。
// 政策型錄（成本/效果/威信門檻）為靜態資料，見 05；本結構只存「誰、已施行什麼、各政策再採用冷卻」。
// 備忘錄交 05：ClanDomestic 之 activePolicies／policyCooldowns 應遷入本結構（GameState.policies[clanId]，DDR-1）並對齊名 active／cooldownUntil。
```

### 4.15 Proposal（具申）

```ts
export interface Proposal {
  id: ProposalId;
  clanId: ClanId;              // 受理勢力（v1.0 僅玩家勢力會收到具申；AI 內部決策不走此表）
  officerId: OfficerId;        // 具申武將（serving、屬同勢力，INV-15）
  kind: ProposalKind;          // 種類（顯示分類）
  command: Command;            // 採納時原樣入佇列執行的指令（單一真相：具申內容=指令 payload）
  createdDay: number;          // 提出絕對日
  expiresDay: number;          // 逾期絕對日 = createdDay + BAL.proposalExpireDays（60）
  status: ProposalStatus;      // pending / accepted / rejected / expired
  meritReward: number;         // 採納時具申者獲得的功績，整數 ≥0（生成時算定，06/09）
  estimatedCostGold: number;   // 預估執行成本（貫；僅 UI 顯示，實際扣款由 command 執行，勘誤 E-48；06 §3.11）
  summaryKey: string;          // 具申內容一句話的 i18n key（09 生成時指定，勘誤 E-48）
  summaryParams: Record<string, string | number>; // summaryKey 的插值參數（人名/地名等）
}
```

### 4.16 EventsState（事件引擎狀態）

```ts
export interface EventsState {
  fired: Record<EventId, number>;      // 已觸發史實/條件事件 → 觸發絕對日（每事件一生一次）
  cooldownUntil: Record<string, number>; // 汎用事件群組 key → 冷卻到期絕對日（群組定義見 10）
  pendingChoiceEventId: EventId | null;  // 等待玩家選擇的事件（modal 開啟中）；核心暫停推進（03）
  flags: Record<string, number>;       // 事件旗標（布林以 0/1；含 unlock.* / harvest.* / defeat.*，勘誤 E-55；10 §4.3）
  tenkabitoStreakMonths: number;       // 天下人條件連續成立月數，整數 ≥0（勘誤 E-55）
  stats: VictoryStats;                 // 結局統計（供 EndingScreen；勘誤 E-55；10 §3.8.5）
}

/** 結局統計（勘誤 E-55；10 §4.3） */
export interface VictoryStats {
  battlesFought: number;       // 玩家參戰場數，整數 ≥0
  battlesWon: number;          // 玩家獲勝場數，整數 ≥0
  maxCastles: number;          // 玩家歷史最大持城數，整數 ≥0
  maxKokudaka: number;         // 玩家歷史最大石高（石），整數 ≥0
}
```

### 4.17 Report（通知）

```ts
export interface Report {
  id: ReportId;
  day: number;                 // 產生絕對日
  event: GameEvent;            // 原始事件（單一真相；core 只存原始 event，不存 key/params，03 §3.4.3）。顯示 key/params 導出契約見 13 §3.7：UI 層 selector renderReport(report, state, playerClanId) 於渲染時導出（含 ID→顯示名 enrichment 與玩家攻守視角分流），非直用 payload key（五輪裁決 A）
  read: boolean;               // 已讀
}
// reports 陣列新→舊排列；超過 BAL.reportMaxKept（500，值依 15；勘誤 E-31）時自尾端捨棄已讀舊報告。
```

### 4.18 Command 型別聯集總表

Command 是「玩家（或具申採納、AI 對等操作）意圖」的唯一表達方式；
於下一個 tick 開頭依提交順序統一結算（00 §5.2；佇列與驗證失敗處理見 03）。
**變速/暫停/存讀檔是 UI 與外殼操作，不是 Command。**

> **武將欄位命名慣例（二輪裁決 A）**：Command payload 中，`officerId` 專指動作的**被作用武將**（動作對象，例：受封者、目標浪人／捕虜、受賞者、升格者）；**執行動作的武將一律以 `executorId` 表示**；對方勢力之武將以 `targetOfficerId` 表示。僅涉單一執行武將、無被作用武將者（`CmdStartDiploWork`／`CmdStartPlot`）之執行者亦用 `executorId`。狀態實體 `Plot`／`DiploMission`（§4.11）為單一武將實體、無被作用武將並存，其 `officerId` 即該執行武將（無歧義，沿用不改名）；命令 `executorId` 於 apply 時寫入該狀態之 `officerId`。

```ts
// src/core/commands/types.ts
export interface CommandBase {
  type: CommandType;
  clanId: ClanId;   // 發令勢力（權限驗證基準：只能操作自家實體）
}
export type Command =
  // ── 內政（語意見 05）──
  | CmdGrantFief | CmdSetDevelopFocus | CmdBuildFacility | CmdCancelBuild | CmdDemolishFacility
  | CmdSetConscriptPolicy | CmdTransport | CmdRecallTransport | CmdTradeRice | CmdEnactPolicy | CmdRevokePolicy
  | CmdAppointLord | CmdSetCastleControl
  // ── 軍事（語意見 04/07）──
  | CmdMarch | CmdSetArmyTarget | CmdRecallArmy | CmdSetAutoReturn
  | CmdStartKassen | CmdBattleMove | CmdBattleAttack | CmdBattleTactic | CmdBattleDelegate
  | CmdSetSiegeMode | CmdUseBetrayal
  // ── 武將（語意見 06）──
  | CmdRecruitRonin | CmdRewardOfficer | CmdHandleCaptive | CmdPromoteRank
  // ── 外交與調略（語意見 08）──
  | CmdStartDiploWork | CmdStopDiploWork | CmdProposePact | CmdRespondPact | CmdBreakPact
  | CmdRequestCourtRank | CmdRequestMediation
  | CmdRequestShogunateTitle | CmdNominateShogun
  | CmdStartPlot | CmdCancelPlot
  // ── 軍團（語意見 07 §3.12；軍團 AI 見 09，四輪裁決 D-18）──
  | CmdCreateCorps | CmdSetCorpsDirective | CmdAssignCastleToCorps | CmdDissolveCorps
  // ── 具申／大命／事件（語意見 06/10）──
  | CmdResolveProposal | CmdInvokeTaimei | CmdResolveEventChoice;
// 註（勘誤 E-32，重複語意合併）：07 `CmdRemoveCastleFromCorps` ＝ `CmdAssignCastleToCorps(corpsId:null)`，統一以後者表達；
// 07 `CmdUseBetrayal(siegeId)` 與 08 `activateBetrayal(castleId)` 為同一動作，統一以 `CmdUseBetrayal`（圍城 context）表達。

export type CommandType = Command['type'];

// —— 內政 ——
export interface CmdGrantFief extends CommandBase {         // 知行：分封/收回郡
  type: 'grantFief'; districtId: DistrictId;
  officerId: OfficerId | null;   // null=收回直轄
}
export interface CmdSetDevelopFocus extends CommandBase {   // 設定直轄郡開發重點
  type: 'setDevelopFocus'; districtId: DistrictId; focus: DevelopFocus;
}
export interface CmdBuildFacility extends CommandBase {     // 建設城下施設（下單即入 buildQueue、全額扣造價，勘誤 E-39）
  type: 'buildFacility'; castleId: CastleId;
  facilityTypeId: FacilityTypeId;
}
export interface CmdCancelBuild extends CommandBase {       // 取消佇列建設（退款 造價×BAL.buildRefundRate，勘誤 E-39）
  type: 'cancelBuild'; castleId: CastleId;
  queueIndex: number;            // 0-based，指向 castle.buildQueue
}
export interface CmdDemolishFacility extends CommandBase {  // 拆除已建成施設（勘誤 E-39）
  type: 'demolishFacility'; castleId: CastleId; facilityTypeId: FacilityTypeId;
}
export interface CmdSetConscriptPolicy extends CommandBase { // 設定城徵兵方針（每月自動回復，取代一次性徵兵，勘誤 E-42）
  type: 'setConscriptPolicy'; castleId: CastleId; policy: ConscriptPolicy;
}
export interface CmdTransport extends CommandBase {         // 城際輸送兵力/金錢/兵糧（勘誤 E-41）
  type: 'transport'; fromCastleId: CastleId; toCastleId: CastleId;
  soldiers: number;              // ≥0（人）
  gold: number;                  // ≥0（貫）
  food: number;                  // ≥0（石）；三者不得同時為 0
}
export interface CmdRecallTransport extends CommandBase {   // 撤回進行中輸送隊（勘誤 E-41）
  type: 'recallTransport'; transportId: TransportId;
}
export interface CmdTradeRice extends CommandBase {         // 米問屋買賣兵糧（需該城有米問屋施設；四輪裁決 D-10：收錄自 05，統一走 Command 佇列次 tick 開頭結算，廢除 05 原「即時結算」）
  type: 'tradeRice'; castleId: CastleId;
  mode: 'buy' | 'sell';          // buy＝金錢換兵糧、sell＝兵糧換金錢（匯率／月上限 BAL.riceBuyRate／riceSellRate／riceTradeCapMonthly，05 §5.5）
  amount: number;                // 交易量（石），>0
}
export interface CmdEnactPolicy extends CommandBase { type: 'enactPolicy'; policyId: PolicyId; }
export interface CmdRevokePolicy extends CommandBase { type: 'revokePolicy'; policyId: PolicyId; }
export interface CmdAppointLord extends CommandBase {       // 任命/罷免城主
  type: 'appointLord'; castleId: CastleId; officerId: OfficerId | null;
}
export interface CmdSetCastleControl extends CommandBase {  // 切換直轄/委任
  type: 'setCastleControl'; castleId: CastleId; directControl: boolean;
}

// —— 軍事 ——
export interface CmdMarch extends CommandBase {             // 出陣
  type: 'march'; originCastleId: CastleId;
  leaderId: OfficerId; deputyIds: OfficerId[];              // 0..2 人
  soldiers: number;              // 自城中撥出兵力，>0
  food: number;                  // 自城中撥出兵糧（石），≥0
  targetNodeId: MapNodeId;       // 目標節點（尋路由 core 執行，04）
}
export interface CmdSetArmyTarget extends CommandBase {     // 變更部隊目標（重尋路）
  type: 'setArmyTarget'; armyId: ArmyId; targetNodeId: MapNodeId;
}
export interface CmdRecallArmy extends CommandBase { type: 'recallArmy'; armyId: ArmyId; } // 召回
export interface CmdSetAutoReturn extends CommandBase {     // 切換部隊自動歸還（勘誤 E-32；07 §3.13）
  type: 'setAutoReturn'; armyId: ArmyId; enabled: boolean;
}
export interface CmdStartKassen extends CommandBase {       // 對進行中野戰（FieldCombat）發動合戰（門檻見 07；勘誤 E-18）
  type: 'startKassen'; fieldCombatId: string;
}
export interface CmdBattleMove extends CommandBase {        // 合戰：移動至目標陣（勘誤 E-18）
  type: 'battleMove'; battleId: BattleId; unitId: string; targetJinId: string;
}
export interface CmdBattleAttack extends CommandBase {      // 合戰：指定攻擊目標（勘誤 E-18）
  type: 'battleAttack'; battleId: BattleId; unitId: string; targetUnitId: string;
}
export interface CmdBattleTactic extends CommandBase {      // 合戰：發動戰法（勘誤 E-18）
  type: 'battleTactic'; battleId: BattleId; unitId: string; tacticId: TacticId;
  targetUnitId: string | null;   // 減益型的目標；否則 null
}
export interface CmdBattleDelegate extends CommandBase {    // 合戰：委任 AI 開關（勘誤 E-18）
  type: 'battleDelegate'; battleId: BattleId;
  unitId: string | 'all'; enabled: boolean;
}
export interface CmdSetSiegeMode extends CommandBase { type: 'setSiegeMode'; siegeId: SiegeId; mode: SiegeMode; }
export interface CmdUseBetrayal extends CommandBase {       // 圍城時發動已備妥的內應（勘誤 E-32）。**效果採 08（四輪裁決 B，調略單一真相＝08）**：城士氣降至 BAL.plotBetrayalMoraleFloor(=5)、城主忠誠歸 0（見 08 §5.5.3／§3.7.3）；07 §3.11 之 betrayalMoraleHit（一次性−40）廢棄，備忘錄交 07（§3.11/§4/T12）／15
  type: 'useBetrayal'; siegeId: SiegeId;
}

// —— 武將 ——
export interface CmdRecruitRonin extends CommandBase {     // 登用浪人（成功率以登用者 pol／特性為輸入，06 §3.7.1）
  type: 'recruitRonin';
  officerId: OfficerId;          // 目標浪人（status='ronin'、locationCastleId 屬我方）
  executorId: OfficerId;         // 登用者（同城、未出陣）；成功率公式必要輸入（二輪裁決 A；06 §3.7.1）
}
export interface CmdRewardOfficer extends CommandBase {     // 金錢褒賞（提忠誠；三檔制，費用與忠誠增益由 BAL 推導，勘誤 E-29）
  type: 'rewardOfficer'; officerId: OfficerId;
  tier: RewardTier;              // 賞賜檔位 small/medium/large；費用 BAL.rewardGold{Small,Medium,Large}Cost、忠誠增益見 06 §3.8.1（年內遞減）
}
export interface CmdHandleCaptive extends CommandBase {     // 捕虜處置
  type: 'handleCaptive';
  officerId: OfficerId;          // 目標捕虜（capturedByClanId === CommandBase.clanId）
  action: CaptiveAction;
  executorId: OfficerId | null;  // action='recruit' 時的登用者；null＝以當主能力代入（招降成功率必要輸入，二輪裁決 A；06 §3.7.2）
}
export interface CmdPromoteRank extends CommandBase {       // 身分推舉（升格；褒賞的一種，勘誤 E-32；06 §3.8.3）
  type: 'promoteRank'; officerId: OfficerId;
}

// —— 外交與調略 ——
export interface CmdStartDiploWork extends CommandBase {    // 開始外交工作（對勢力＝派使者累積信用；target='court'＝朝廷獻金、'shogunate'＝幕府獻金，取代舊 CmdDonateCourt，勘誤 E-27／三輪裁決 2）
  type: 'startDiploWork';
  target: ClanId | 'court' | 'shogunate'; // 對象：勢力（累積信用）／'court' 朝廷獻金（→courtFavor）／'shogunate' 幕府獻金（→shogunateFavor）；月費為固定 BAL 常數、非玩家自訂（機制參見 08 §3.2／§3.5／§3.6.2、勘誤 E-27 尾）
  executorId: OfficerId;         // 執行武將（serving、屬 from 方；執行期間不可出陣）；apply 時寫入 DiploMission.officerId（二輪裁決 A；08 §3.5）
}
export interface CmdStopDiploWork extends CommandBase { type: 'stopDiploWork'; target: ClanId | 'court' | 'shogunate'; } // 撤回外交／獻金工作（勘誤 E-27／三輪裁決 2）
export interface CmdProposePact extends CommandBase {       // 提案外交行動（消耗信用；成立/接受度判定見 08 §5.3／§5.6）
  type: 'proposePact'; targetClanId: ClanId;
  kind: DiplomacyActionKind;     // 六種外交行動（proposeAlliance/proposeCeasefire/proposeMarriage、demandVassal/offerVassal〔從屬方向以 kind 表達：demand＝目標從屬、offer＝我方從屬〕、requestReinforce）；產生同 kind 之 DiplomacyProposal（§4.11）。期限依 kind 查 BAL 常數（allianceMonths 等，08 §5.3.2），不由指令帶入（三輪裁決 3a，原 termDays 刪除）
  reinforceAgainstClanId: ClanId | null; // kind='requestReinforce' 時對抗的敵勢力；其他 kind 為 null。婚姻成婚武將由 08 §5.3.1 決定論自動選定，不入本指令（三輪裁決 3d）
}
export interface CmdRespondPact extends CommandBase {       // 回應送達的外交提案（來使 modal；勘誤 E-32；08 §3.4）
  type: 'respondPact'; proposalId: ProposalId; accept: boolean;
}
export interface CmdBreakPact extends CommandBase {         // 毀約（信用/感情懲罰見 08）
  type: 'breakPact'; targetClanId: ClanId; kind: PactKind;
}
export interface CmdRequestCourtRank extends CommandBase { type: 'requestCourtRank'; } // 請求敘任下一階官位
export interface CmdRequestMediation extends CommandBase {  // 請朝廷斡旋停戰
  type: 'requestMediation'; targetClanId: ClanId;
}
export interface CmdRequestShogunateTitle extends CommandBase { type: 'requestShogunateTitle'; } // 申請下一階幕府役職（勘誤 E-32；08 §3.6）
export interface CmdNominateShogun extends CommandBase { type: 'nominateShogun'; } // 擁立將軍（勘誤 E-32；08 §3.6.3）
export interface CmdStartPlot extends CommandBase {         // 調略：引拔/流言/內應
  type: 'startPlot'; kind: PlotKind;
  executorId: OfficerId;         // 執行武將（我方）；apply 時寫入 Plot.officerId（二輪裁決 A；08 §3.7）
  targetClanId: ClanId;          // 對象勢力
  targetOfficerId: OfficerId | null; // poach／rumor(武將模式) 的對象武將；rumor(城模式)／betrayal 為 null（08 §3.7.1／§3.7.2；betrayal 之目標城主由 targetCastleId 反查、apply 時快照入 Plot.officerId，四輪裁決 D-17）
  targetCastleId: CastleId | null;   // rumor(城模式)/betrayal 的對象城；否則 null（08 §3.7）
  investGold: number;                // 一次性投入（貫），≥0（08 §3.7）
}
export interface CmdCancelPlot extends CommandBase {        // 中止進行中調略（無退款，勘誤 E-32；08 §3.7）
  type: 'cancelPlot'; plotId: PlotId;
}

// —— 軍團 ——
export interface CmdCreateCorps extends CommandBase {
  type: 'createCorps'; corpsLeaderId: OfficerId;
  castleIds: CastleId[];         // 初始轄下城（≥1，皆我方且未屬其他軍團）
  directive: CorpsDirective;
  targetNodeId: MapNodeId | null; // directive='advance' 必填，否則 null（與 Corps.targetNodeId／CmdSetCorpsDirective 一致，四輪裁決 D-9）
}
export interface CmdSetCorpsDirective extends CommandBase {
  type: 'setCorpsDirective'; corpsId: CorpsId; directive: CorpsDirective;
  targetNodeId: MapNodeId | null; // directive='advance' 必填，否則 null
}
export interface CmdAssignCastleToCorps extends CommandBase {
  type: 'assignCastleToCorps'; castleId: CastleId; corpsId: CorpsId | null; // null=移出軍團
}
export interface CmdDissolveCorps extends CommandBase { type: 'dissolveCorps'; corpsId: CorpsId; }

// —— 具申／大命／事件 ——
export interface CmdResolveProposal extends CommandBase {   // 採納/駁回具申
  type: 'resolveProposal'; proposalId: ProposalId; accept: boolean;
}
export interface CmdInvokeTaimei extends CommandBase { type: 'invokeTaimei'; taimeiId: TaimeiId; } // 發動大命
export interface CmdResolveEventChoice extends CommandBase {// 回應事件選項
  type: 'resolveEventChoice'; eventId: EventId;
  choiceIndex: number;           // 0-based，須 < 該事件選項數（10）
}
```

### 4.19 GameEvent 型別聯集總表

`GameEvent` 是 core 每 tick 對外發出的事實紀錄，用途：轉為 `Report`、驅動 UI 動畫/自動暫停、
golden test 斷言。envelope 統一為：

```ts
export interface GameEventBase {
  type: GameEventType;
  day: number;         // 發生絕對日
  clanIds: ClanId[];   // 主要關聯勢力（供 03 isPlayerRelevant 判定；純時間事件為空陣列，非 optional，四輪裁決 C-4；備忘錄交 03：§4.3 之 clanIds? 對齊為非 optional ClanId[]）
}
export type GameEvent = /* 下表全部成員的 union */;
export type GameEventType = GameEvent['type'];
```

| `type` | payload 欄位（GameEventBase 之外） | 發出時機 | 語意文件 |
|---|---|---|---|
| `battle.started` | `battleId: string, nodeId, attackerClanId, defenderClanId` | 野戰開打 | 07 |
| `battle.kassenAvailable` | `battleId: string` | 兵力達合戰門檻（自動暫停候選） | 07 |
| `battle.ended` | `battleId: string, winnerClanId: ClanId \| null, aweLevel: AweLevel, attackerLosses: number, defenderLosses: number, nodeId: MapNodeId, attackerClanId: ClanId, defenderClanId: ClanId` | 野戰/合戰結束（null=平手撤離；nodeId/attacker/defender 供報告 enrichment，見表後註，五輪裁決 B） | 07 |
| `awe.triggered` | `sourceBattleId: string, clanId, level: AweLevel, flippedDistrictIds: DistrictId[], affectedCastleIds: CastleId[]` | 威風擴散結算 | 07 |
| `siege.started` | `siegeId, castleId, attackerClanId` | 開圍（自動暫停候選） | 07 |
| `siege.relief` | `siegeId, castleId` | 援軍抵達受圍城節點、圍城每日效果暫停（`Siege.interrupted=true`）、展開解圍野戰（07 §3.3 援軍解圍；`clanIds=[圍城方,守城方]`；報告 report.siege.relief；七輪裁決 2 收錄——解圍野戰之**開始**為獨立於 siege.ended〔`fallen:false`＝解圍成功〕之核心模擬時刻、且該變體槽已由 report.siege.repelled 佔用〔時刻與槽位皆衝突，故不併入〕；render 不可反查已結束/已解除中斷之 Siege，故 castleId 隨 event 落地；與同 tick 併發之 battle.started→report.field.begin 之去重由 13 定） | 07 |
| `siege.ended` | `siegeId, castleId, fallen: boolean, newOwnerClanId: ClanId \| null` | 陷落或解圍 | 07 |
| `district.subjugated` | `districtId, fromClanId, toClanId, armyId: ArmyId` | 制壓完成翻轉歸屬（armyId＝完成制壓之部隊，供報告 leader enrichment，見表後註，五輪裁決 B） | 04 |
| `army.departed` | `armyId, clanId, originCastleId, targetNodeId` | 出陣 | 04 |
| `army.arrived` | `armyId, clanId, nodeId: MapNodeId` | 部隊抵達其目標節點（04 movement；勘誤 E-30） | 04 |
| `army.returned` | `armyId, clanId, castleId, soldiersReturned: number` | 歸還入城解散 | 04 |
| `army.blocked` | `armyId, clanId, nodeId: MapNodeId` | 行軍受阻、於節點轉 holding 待命（validateNextStep 失敗，04 §5.4；四輪裁決 C-6，收錄自 04；備忘錄交 04 發出、13 報告 key 對齊 report.army.blocked） | 04 |
| `army.starving` | `armyId, clanId` | 攜帶兵糧歸 0 | 07 |
| `army.routed` | `armyId, clanId, nodeId: MapNodeId` | 部隊士氣崩潰／糧盡潰走轉 `status='routed'`（野戰 07 §3.4 每日、合戰 §3.9 戰後皆適用；`nodeId`＝潰走發生節點；`clanIds=[clanId]`；報告 report.field.rout，`{army}` 經 armyId 於部隊存活期間解析〔13 transient-timing enrichment，同 army.departed/arrived/blocked 慣例〕；七輪裁決 2 收錄，發出者 07〔§3.4 潰走行為單一擁有者，四輪 E20〕） | 07 |
| `economy.income` | `clanId, gold: number, foodByCastle: Record<CastleId, number>` | 每月 1 日收入 | 05 |
| `economy.harvest` | `clanId, totalFood: number` | 9/1 秋收 | 05 |
| `economy.granaryOverflow` | `clanId, castleId, food: number` | 米藏超過容量、溢出兵糧散失（秋收/收入結算 05 §3.2、輸送抵達 05 §3.6；`food`＝散失石數；六輪裁決 1，收錄自 05 直發 report） | 05 |
| `economy.upkeepUnpaid` | `clanId` | 金錢不足、當月俸祿未全額發放（家臣忠誠懲罰；warning 級，13 §6.11 report.economy.upkeepUnpaid；四輪裁決 C-5，收錄自 05） | 05 |
| `economy.foodShortage` | `clanId, castleId` | 城兵糧見底、士卒逃散（**非圍城**一般糧盡；warning 級，13 §6.11 report.economy.castleStarving；四輪裁決 C-5，收錄自 05 §3.1.3） | 05 |
| `facility.completed` | `castleId, facilityTypeId` | 施設完工（佇列制無 slotIndex，勘誤 E-39） | 05 |
| `policy.enacted` / `policy.revoked` | `clanId, policyId` | 政策生效/廢止 | 05 |
| `policy.autoRevoked` | `clanId, policyId: PolicyId` | 政策維持費不足、由新到舊自動廢止（每廢止一項一則；05 §3.6／§5.2；六輪裁決 1，收錄自 05 直發 report） | 05 |
| `conscript.completed` | `castleId, soldiers: number` | 徵兵入營 | 05 |
| `transport.arrived` | `fromCastleId, toCastleId, soldiers: number, gold: number, food: number` | 輸送抵達（勘誤 E-41） | 05 |
| `transport.looted` | `ownerClanId: ClanId, fromCastleId, toCastleId, byClanId: ClanId, nodeId: MapNodeId, soldiers: number, gold: number, food: number` | 輸送隊被劫消滅（05 §3.6；`ownerClanId`＝輸送隊所屬〔＝`TransportOrder.clanId`〕、`byClanId`＝劫方；被劫方視角 report.transport.looted〔playerClanId===ownerClanId〕、劫方視角 report.transport.lootGain〔playerClanId===byClanId〕由 13 §3.7 分流；`clanIds=[ownerClanId,byClanId]`；六輪裁決追記＋七輪裁決 1〔TransportOrder 被劫當下移除、fromCastleId 事後亦可能易主，render 不可反查所屬，故 ownerClanId 隨 event 落地〕） | 05 |
| `uprising.started` | `districtId, severity: number` | 一揆爆發（severity 1..3） | 05 |
| `uprising.ended` | `districtId, resolved: 'suppressed' \| 'subsided'` | 一揆結束（`suppressed`＝我方部隊野戰鎮壓、治安設 45；`subsided`＝滿 `BAL.uprisingAutoEndMonths` 自然平息、治安設 40；`clanIds`＝郡所屬勢力；05 §3.8.3；六輪裁決 1，收錄自 05 直發 report） | 05 |
| `officer.died` | `officerId, clanId: ClanId \| null, cause: 'age' \| 'battle', nodeId: MapNodeId \| null` | 武將死亡（`cause='execution'` 移除，處刑改由 `officer.executed` 承載；nodeId 僅 `cause='battle'` 為戰死地、否則 null；見表後註，五輪裁決 B/C） | 06/07 |
| `officer.comingOfAge` | `officerId, clanId` | 元服登場（1/1） | 06 |
| `officer.promoted` | `officerId, clanId, newRank: Rank` | 身分升格 | 06 |
| `officer.loyaltyLow` | `officerId, clanId, loyalty: number` | 月結忠誠重算後跌破 30（warning 級報告，二輪裁決 C） | 06 |
| `officer.defected` | `officerId, fromClanId, toClanId: ClanId \| null` | 出奔（null=流浪為浪人） | 06 |
| `officer.recruited` | `officerId, clanId, source: 'ronin' \| 'captive' \| 'poach'` | 登用成功 | 06/08 |
| `officer.recruitFailed` | `officerId, executorId: OfficerId, clanId` | 浪人登用擲骰失敗（06 §3.7.1 即時判定 `rng.misc`；`officerId`＝婉拒之浪人、`executorId`＝登用者、`clanId`＝登用勢力；`clanIds=[clanId]`；報告 report.officer.recruitFailed；七輪裁決 2 收錄——核心內部決定論結果、非 state 可衍生〔失敗後僅留 `recruitRetryOn`＋扣金〕，須事件承載且與 officer.recruited 成功報告對稱） | 06 |
| `officer.captured` | `officerId, byClanId` | 戰敗被俘 | 07 |
| `officer.released` / `officer.executed` | `officerId, byClanId` | 捕虜處置 | 06 |
| `pact.signed` | `aClanId, bClanId, kind: PactKind, endDay: number \| null` | 協定成立 | 08 |
| `pact.expired` / `pact.broken` | `aClanId, bClanId, kind: PactKind`（broken 另有 `breakerClanId`） | 到期/毀約 | 08 |
| `diplo.refused` | `fromClanId, toClanId, kind: DiplomacyActionKind` | 提案被拒（含逾期；kind 由 PactKind 改 DiplomacyActionKind 以涵蓋 demand/offerVassal/requestReinforce，四輪裁決 C-1） | 08 |
| `diplo.reinforceAgreed` | `fromClanId, toClanId, againstClanId: ClanId` | 援軍請求（requestReinforce）獲接受——不建立 Pact，故不發 pact.signed（四輪裁決 D-21；備忘錄交 08 發、13 接報告） | 08 |
| `diplo.envoyArrived` | `fromClanId, proposalId: ProposalId, kind: DiplomacyActionKind` | 外交提案送達玩家勢力（觸發來使 modal 自動暫停；勘誤 E-32；`kind` 由 08 emit 端持有〔Proposal.kind〕、供 13 `{proposal}` 於渲染時取提案型別——Proposal 屆時已 transient 不可反查 proposalId，六輪裁決 2） | 08 |
| `diplo.workStopped` | `clanId, target: ClanId \| 'court' \| 'shogunate'` | 外交/獻金工作因金錢不足當月中止（08 §5.1 步驟 1／§3.6.4 幕府滅亡中止 shogunate 獻金；原 08 名 `dip.workStopped`，命名對齊 `diplo.*` 族系；六輪裁決 1） | 08 |
| `court.rankGranted` | `clanId, newCourtRank: CourtRank` | 官位敘任 | 08 |
| `court.mediationResult` | `clanId, targetClanId: ClanId, success: boolean, ceasefireMonths: number` | 朝廷停戰斡旋結算（`clanId`＝斡旋發起方；`success` 分流 `report.court.mediationSuccess`／`mediationFailed`；`ceasefireMonths`＝`BAL.courtMediationCeasefireMonths`〔成功〕／0〔失敗〕；成功另 emit `pact.signed`〔強制停戰〕，08 §5.4.2；`clanIds=[clanId,targetClanId]`；六輪裁決 1） | 08 |
| `shogunate.titleGranted` | `clanId, title: ShogunateTitle` | 幕府役職授與 | 08 |
| `shogunate.nominated` | `clanId` | 上洛擁立將軍成立（`clanId`＝擁立者＝patron；世界級廣播報告；08 §5.4.3；六輪裁決 1） | 08 |
| `shogunate.patronLost` | `clanId` | 擁立者喪失京都、patron 資格解除（`clanId`＝失去者；月初資格檢查，08 §3.6.3；報告為當事勢力視角〔僅發給該勢力〕；六輪裁決 1） | 08 |
| `shogunate.collapsed` | （無 payload）；`clanIds=[]`（全域廣播） | 室町幕府滅亡（由 10 事件引擎呼叫 08 `collapseShogunate`；08 §3.6.4／§5.4.3；六輪裁決 1） | 08/10 |
| `plot.succeeded` / `plot.failed` | `kind: PlotKind, actorClanId, targetClanId, targetOfficerId: OfficerId \| null, targetCastleId: CastleId \| null` | 調略結算（targetCastleId：betrayal／rumor(城模式) 填、其餘 null；供報告 enrichment，見表後註，五輪裁決 B） | 08 |
| `plot.exposed` | `kind: PlotKind, actorClanId, targetClanId, targetOfficerId: OfficerId \| null, targetCastleId: CastleId \| null` | 調略失敗且敗露（payload 鏡射 `plot.failed`；08 §5.5.2；`clanIds=[actorClanId,targetClanId]`；actor 視角→`report.plot.exposed`、target 視角→`report.plot.exposedByEnemy`；六輪裁決 1） | 08 |
| `plot.betrayalActivated` | `actorClanId, targetClanId, castleId: CastleId` | 內應於圍城發動（08 §5.5.3 `CmdUseBetrayal`；`clanIds=[actorClanId,targetClanId]`；報告 `report.plot.betrayalActivated{castle}`；六輪裁決 1） | 08 |
| `proposal.submitted` | `proposalId, officerId, kind: ProposalKind` | 具申送達（自動暫停候選） | 06 |
| `proposal.resolved` | `proposalId, accepted: boolean` | 玩家裁決 | 06 |
| `proposal.expired` | `proposalId, officerId, reason: 'timeout' \| 'invalidated'` | 具申失效——`reason='timeout'`：逾期作廢（createdDay + 60 日仍 pending、忠誠 −1，二輪裁決 C）；`reason='invalidated'`：採納時內含 Command 再驗證失敗（局勢已變、無忠誠懲罰，06 §3.11/§5.8）。13 §3.7 依 reason 分流 report.proposal.expired（timeout）／report.proposal.invalid（invalidated）；七輪裁決 2 併入 | 06 |
| `event.fired` | `eventId, hasChoice: boolean` | 歷史/汎用事件觸發（自動暫停候選） | 10 |
| `taimei.invoked` / `taimei.expired` | `clanId, taimeiId` | 大命發動/效果結束 | 10 |
| `clan.succession` | `clanId, deceasedId: OfficerId, heirId: OfficerId` | 當主歿後家督繼承（06 §3.9.3；`deceasedId`＝亡故當主、`heirId`＝繼任者，皆持久 OfficerId〔亡者紀錄留存 state，渲染時可解析 oldLeader/newLeader〕；`clanIds=[clanId]`；報告 report.clan.succession；七輪裁決 2 收錄〔重大情報〕，發出者 06） | 06 |
| `clan.destroyed` | `clanId, byClanId: ClanId \| null` | 勢力滅亡 | 10 |
| `victory.tenkabitoProgress` | `clanId, months: number` | 天下人條件連續達成進度提示（`tenkabitoStreakMonths ≥ 6` 起每月一則；10 §6.4；`months`＝連續月數；`clanIds=[clanId]`；info 級；報告 report.victory.tenkabitoProgress；七輪裁決 2 收錄，發出者 10） | 10 |
| `game.victory` / `game.defeat` | `clanId, condition: string`（條件 id，10 定義） | 勝敗判定成立 | 10 |
| `time.monthStart` | `year: number, month: number` | 每月 1 日（UI 月結摘要用） | 03 |
| `time.seasonStart` | `year: number, season: Season` | 季初（3／6／9／12 月 1 日）；app 層季首自動存檔消費（16 §5.3，二輪裁決 C） | 03 |

> **戰鬥事件 id 型別（四輪裁決 C-2）**：`battle.started`／`battle.kassenAvailable`／`battle.ended` 的 `battleId`
> 與 `awe.triggered` 的 `sourceBattleId` 型別為 **`string`（`FieldCombat.id`〔`fc.*`〕∪ `BattleId`）**——野戰路徑餵入
> `fc.*`（07 §5.2 `emit battle.ended(battleId: fc.id …)`、`applyAwe(…, fc.id)`），合戰路徑餵入 `BattleId`；
> 故不以 `BattleId` brand 宣告（`fc.*` 事件可出現，§3.2 已註）。
> **`development.completed` 不列入本表（四輪裁決 C-5）**：無任何消費者（13 null-report），裁決廢除，備忘錄交 03 §4.3 停止發出。
> **報告 enrichment payload 補全（五輪裁決 B）**：五輪裁決 (a) 定案報告改由 UI 層 `renderReport(report, state, playerClanId)` 於**渲染時**導出 key/params（13 §3.7；`Report` 只存原始 event，§4.17／03 §3.4.3），
> 故顯示所需之**持久實體 ID** 必須隨 event 落地——transient 實體（部隊、已結束之 `FieldCombat`／`BattleState`）於渲染時已不可反查。逐項補全：
> ① `battle.ended` 增 `nodeId/attackerClanId/defenderClanId`（13 §6.11 `report.field.resolved`／`report.battle.won`／`report.battle.lost` 之 place/attacker/defender；欄位鏡射 `battle.started`，07 §3.3／§3.9 emit 端已持有）。
> ② `district.subjugated` 增 `armyId`（`report.army.subjugated` 之 `{leader}`；04 §3.8 填為完成制壓之部隊，與 `army.departed/arrived` 之 leader 導出同慣例）。
> ③ `officer.died` 增 `nodeId: MapNodeId | null`（`report.officer.killedInAction` 之 `{place}`，僅 `cause='battle'` 非 null；06 §5.5 `die()` 簽名補此參、`cause='battle'` 由 07 帶入戰場節點）。
> ④ `plot.succeeded`／`plot.failed` 增 `targetCastleId: CastleId | null`（`report.plot.betrayalReady` 之 `{castle}`；betrayal／rumor 城模式填、其餘 null；`Plot` 狀態本已持有此欄，08 §3.7）。
> **`officer.died.cause` 收斂 `'age'|'battle'`（五輪裁決 C）**：移除 `'execution'`——處刑死亡由獨立 `officer.executed` 承載（06 §3.7.2(c) 直接設 `status='dead'`、不經 `die()`，`officer.died` 不重複發），備忘錄交 06（§5.5 `die()` 之 `'natural'` 對齊為 `'age'`）／13（§3.7 分流依據 `natural`→`age`）。
> **六輪裁決事件收錄（2026-07-11，完整裁決見 §8）**：本輪將 13 §6.11 事件欄為「—」但生產者實際「發事件」或「直發 `report.*`」者收束入表——05 側：`policy.autoRevoked`／`economy.granaryOverflow`／`uprising.ended`；08 側：`diplo.workStopped`（原 `dip.workStopped`）／`court.mediationResult`／`shogunate.nominated`／`shogunate.patronLost`／`shogunate.collapsed`／`plot.exposed`／`plot.betrayalActivated`。新契約下 core **不得直接發 `report.*` key**，一律改發本表事件、由 13 §3.7 `renderReport` 於渲染時導出報告（五輪裁決 A）。`save.autosaveFailed` **不收錄本表**——屬 app 層 I/O 失敗（非決定論、不得進 core state／§5.4 golden hash），改由 16 走 app 層 UI 通知（非 core Report 機制），詳見 §8 六輪裁決 4。`officer.died(cause='battle')` 之生產者規格歸 07（v1 保留戰死，§8 六輪裁決 3 明訂 07 待補框架；02 本表 `officer.died` 不變）。
> **七輪裁決事件收錄（2026-07-11，完整裁決見 §8）**：末輪 dry check 續收 13 §6.11 事件欄仍為「—」之孤兒報告鍵對應核心事實——新增 `clan.succession`（06）／`officer.recruitFailed`（06）／`siege.relief`（07）／`army.routed`（07）／`victory.tenkabitoProgress`（10）五事件；`proposal.expired` 增 `reason: 'timeout'|'invalidated'`（併入原 report.proposal.invalid）；`transport.looted` 增 `ownerClanId`（被劫方視角分流所需）。另二鍵不入本表：`report.officer.meritReady` 判 **UI-only**（條件 state 可衍生、武將一覽/詳細卡 badge 直讀）、`report.diplomacy.proposalAccepted` **刪鍵**（由既有 `pact.signed`／`diplo.reinforceAgreed` 覆蓋）。`officer.captured`／`officer.died` 表項不變（合戰敗將捕獲時機由 07 §3.14 時機 2 補、officer.captured 已 canonical）。`save.autosaveFailed` 續採六輪 4 之 app 層 UI-only。新契約下 core 不得直發 `report.*`（五輪 A）。

### 4.20 AiState（AI 狀態分支）

> **勘誤 E-60**：09 §4 宣稱其 AI 型別納入 02 的 `GameState.ai`，故於此收錄（型別語意與行為見 09）。
> persona 採**登錄制**（09 §8-D16）：`AiState.personas` 為持久化的 persona 登錄表（`AiPersonaId → AiPersona`），
> `AiClanState.personaId` 僅存**未解析參照**（不內嵌 persona 物件），於使用處即時解析為
> `state.ai.personas[personaId]`（09 §5 全節公式的 `persona` 均指此解析結果；型錄見 09 §3.2、`AiPersonaId` 定義於 §3.2）。
> `AiState.intentLog`／`AiIntent` 為 **transient**（不序列化、不入 §5.4 狀態雜湊；剔除機制見 §3.4 第 6 點；
> 決策已反映於 Command 紀錄與狀態，09 §8-D5）；`personas`／`AiClanState` 持久化。

```ts
// src/core/systems/ai/types.ts —— GameState.ai 分支（模組路徑對齊 09 §4，四輪裁決 D-19；09 §4 為行為真相來源）
export interface AiState {
  personas: Record<AiPersonaId, AiPersona>; // persona 登錄表（持久化）；有效 persona = personas[clan 的 AiClanState.personaId]（勘誤 E-60；09 §4）
  clans: Record<ClanId, AiClanState>; // 以 clanId 為 key（AI 與玩家勢力皆持有）
  intentLog: AiIntent[];              // 環形緩衝決策紀錄（容量 BAL.aiIntentLogSize；transient，不序列化亦不入雜湊，剔除機制見 §3.4 第 6 點）
  deferredPhases: Array<{ clanId: ClanId; phase: CouncilPhase }>; // 本 tick 溢出而順延的評定階段
}

/** AI 性格參數。所有軸 0..100 整數（09 §3.2）。 */
export interface AiPersona {
  aggression: number;  // 侵攻性：開戰門檻與擴張積極度
  diplomacy: number;   // 外交傾向：外交工作預算與求和/結盟意願
  development: number; // 內政傾向：資源分配偏向內政的程度
  loyalty: number;     // 義理：守約傾向；低者傾向調略與背盟
  ambition: number;    // 野心：從屬意願（反向）與擴張規模
}

export type CouncilPhase = 'threat' | 'military' | 'domestic' | 'diplomacy'; // 評定階段
export type AttackPlanStage = 'muster' | 'advance' | 'siege' | 'consolidate'; // 攻略計畫階段

/** 攻略計畫（大名 AI 與軍團 AI 共用）。 */
export interface AttackPlan {
  id: string;                    // 'plan.{clanId去前綴}-{遞增序號}'（序號存於 AiClanState.nextPlanSeq）
  ownerCorpsId: CorpsId | null;  // 發起者：null=大名評定；否則軍團
  targetCastleId: CastleId;      // 目標敵城
  stagingCastleId: CastleId;     // 集結城
  sourceCastleIds: CastleId[];   // 協同出兵城（含集結城），長度 ≤ BAL.diffAiCoopMaxCastles
  stage: AttackPlanStage;
  armyIds: ArmyId[];             // 本計畫指揮的部隊
  startedDay: number;            // 建立絕對日
  stageEnteredDay: number;       // 進入當前階段的絕對日（timeout 判定用）
  plannedTroops: number;         // 集結目標總兵力（人）
}

/** 對單一敵勢力的威脅評估項。 */
export interface ThreatEntry {
  enemyClanId: ClanId;
  borderPowerEnemy: number;      // 敵方在接壤地帶可投入戰力（估算兵力，人）
  borderPowerOurs: number;       // 我方在接壤地帶的戰力
  relationFactor: number;        // 關係係數：交戰 1.5 / 無協定 1.0 / 停戰 0.6 / 同盟或從屬 0.2
  threat: number;                // 威脅分 = borderPowerEnemy / max(borderPowerOurs,1) × relationFactor
  threatenedCastleIds: CastleId[]; // 受該勢力威脅的我方城
}

/** 威脅評估快取。 */
export interface ThreatCache {
  computedDay: number;           // 計算絕對日；超過 BAL.aiThreatCacheDays 或失效事件時重算
  entries: ThreatEntry[];
  totalThreat: number;           // entries.threat 之總和
}

/** 單一勢力的 AI 狀態（玩家勢力亦持有一份供委任 AI/具申，但 pendingPhases 恆空）。 */
export interface AiClanState {
  clanId: ClanId;
  personaId: AiPersonaId;        // AI 性格參照（未解析），使用處解析為 state.ai.personas[personaId]（勘誤 E-60；09 §4）
  councilOffset: number;         // 評定排程偏移 0..29（= fnv1a(clanId) % BAL.aiCouncilSpreadTicks）
  pendingPhases: CouncilPhase[]; // 本月尚未執行的評定階段（依 CouncilPhase 順序 pop）
  attackPlans: AttackPlan[];     // 進行中攻略計畫
  nextPlanSeq: number;           // 攻略計畫序號產生器
  threatCache: ThreatCache | null;
  lastCouncilDay: number;        // 最近一次完成評定的絕對日
}

/** AI 決策紀錄（debug 與測試用；transient，不序列化進存檔）。 */
export interface AiIntent {
  day: number;                   // 決策絕對日
  clanId: ClanId;
  layer: 'council' | 'reactive' | 'corps' | 'steward' | 'castle' | 'proposal'; // 決策層
  kind: string;                  // 點分語意字串，如 'expand.select' / 'defense.hold'
  detail: Record<string, string | number | boolean>; // 決策相關實體與數值
  scores: { label: string; value: number }[] | null; // 分數分解（無則 null；02 不用 optional，勘誤 E-60）
  commands: Command[];           // 實際下達的 Command（空陣列 = 評估後不行動）
}
```

---

## 5. 演算法與公式

### 5.1 衍生值與快取策略

**原則**：`GameState` 只存「事實」；一切可由事實推導的值都是衍生值，以 selector（純函式）計算。
快取一律放在 **state 之外的 transient `DerivedCache`**（不序列化、不影響 golden hash），
在每個 tick 開頭整批清空（memoization 僅在單一 tick 內生效）。唯二存回 state 的快取是
`TimeState.year/month/dayOfMonth`（由 time 系統維護，INV-24 驗證）。

| 衍生值 | 公式 / 來源 | 計算時機與快取 |
|---|---|---|
| `castleMaxSoldiers(c)` | 採 05 `maxSoldiers` 為唯一公式（勘誤 E-61；15 §5.2 表 C）：`城格基礎（本 1000／支 500）＋ floor( Σ_{d ∈ c.districtIds, d.ownerClanId=c.ownerClanId} d.population × BAL.soldiersPerPop（0.025） ) × 政策係數 ＋ 兵舍加成`（郡被制壓走即時降低上限）；舊 `BAL.garrisonPopRatio` 已廢除 | selector；tick 內 memo |
| `castleFoodCap(c)` | 基準值＋施設加成（公式見 05） | selector；tick 內 memo |
| `clanKokudaka(clan)` | `Σ` 該勢力所有郡 `kokudaka` | selector；tick 內 memo（AI/UI 高頻用） |
| `clanSoldiers(clan)` | `Σ` 自家城 `soldiers` ＋自家部隊 `soldiers` | selector；tick 內 memo |
| `clanIncome(clan)` | 月初由 economy 系統計得並直接入帳，同時發 `economy.income` 事件；**不存欄位** | 每月 1 日即算即用 |
| `developmentPct(d)` | `round(100 × (d.kokudaka/d.kokudakaCap + d.commerce/max(1,d.commerceCap)) / 2)`（郡開發度 0..100） | selector，UI 顯示用 |
| `officerFiefs(o)` | 反查 `districts` 中 `stewardId = o.id` 者 | selector；tick 內 memo（建反向索引一次） |
| `officerRole(o)` | 反查城主/領主/軍團長三表 | 同上（共用反向索引） |
| `corpsCastles(k)` | 反查 `castles` 中 `corpsId = k.id` 者 | 同上 |
| `provinceCastles(p)` | 反查 `castles` 中 `provinceId = p.id` 者 | 載入時建立，永不失效（provinceId 不變） |
| `adjacency`（節點鄰接表） | 由 `roads` 建 `Map<MapNodeId, {edge, other}[]>` | 載入時建立，永不失效（roads 不變）；尋路（04）使用 |
| `fiefCapOf(rank)` | `BAL.fiefMaxByRank`（勘誤 E-03；值定案見 15 §5.2）：`{ kumigashira:0, 'ashigaru-taisho':1, 'samurai-taisho':1, busho:2, karo:3, shukuro:4 }` | 常數查表 |
| `availableTaimei(clan)` | 由 `prestige`、`courtRank`、`shogunateTitle` 對照大命型錄門檻（10） | selector，UI/AI 用 |
| `season(month)` | 月份對映（§4.2 註解） | 純函式 |
| `clanPowerScore(clan)` | AI 用綜合國力 = f(kokudaka, soldiers, gold)（09 定義） | 每月 1 日 AI 系統算後存於 transient cache 供當月使用 |

失效規則總結：**tick 內 memo（預設）→ 每 tick 清空；載入時建立（靜態圖）→ 永不失效；
月度 AI 快取 → 下個月初重算**。任何系統不得讀取跨 tick 的 memo 值。

### 5.2 不變量清單（referential integrity）

`tools/validate.ts`（14）於劇本載入後、`tests/`（17）於每個 golden 模擬 checkpoint、
以及 dev build 的每 N tick（`BAL.devInvariantCheckEveryDays` 建議 30）呼叫
`validateState(state): Violation[]`。**正式 build 不跑**（效能）。

| # | 不變量 |
|---|---|
| INV-01 | 所有 `Record<Id,Entity>` 中 `key === value.id`，且 id 符合 §3.2 前綴 regex。 |
| INV-02 | `castle.ownerClanId`、`district.ownerClanId`、`army.clanId`、`corps.clanId` 皆存在於 `clans` 且 `alive=true`。 |
| INV-03 | `district.castleId` 存在；`castle.districtIds` 與 `district.castleId` 互為鏡像（雙向一致、無重複、每郡恰屬一城）。 |
| INV-04 | `castle.lordId ≠ null` ⇒ 該武將 `status='serving'`、`clanId=castle.ownerClanId`、`rank ≥ 'samurai-taisho'`；同一武將至多任一城城主。 |
| INV-05 | `district.stewardId ≠ null` ⇒ 該武將 `status='serving'`、`clanId=district.ownerClanId`；每武將受封郡數 ≤ `fiefCapOf(rank)`。 |
| INV-06 | `army.leaderId` 與 `deputyIds` 的武將皆 `status='serving'`、`clanId=army.clanId`、`hasComeOfAge=true`、`armyId=該army.id`；`deputyIds.length ≤ BAL.maxDeputies`；同一武將不得同時在兩支部隊。 |
| INV-07 | 每位武將 `locationCastleId` 與 `armyId` 恰有一者非 null（`status='dead'` 時兩者皆 null）。 |
| INV-08 | 每個 `alive` 勢力的 `leaderId` 是本家 `serving` 武將且 `loyalty=100`；`status='serving'` ⇒ `clanId ≠ null` 且該勢力 `alive`；`status='captive'` ⇒ `clanId ≠ null`（＝**原屬勢力**，供釋放/歸還，可能已滅亡；捕獲方另存於 `capturedByClanId`）；`status∈{'ronin','dead'}` ⇒ `clanId = null`（四輪裁決 A-c，對齊 06 §3.7.2 捕虜機制）。 |
| INV-09 | `clan.homeCastleId` 存在、屬本家、`tier='main'`。 |
| INV-10 | `corps.corpsLeaderId` 為本家 `serving` 且 `rank ≥ 'karo'`；`castle.corpsId ≠ null` ⇒ 該軍團存在且同勢力。 |
| INV-11 | 每條 `RoadEdge` 的 `a`/`b` 存在於 `castles ∪ districts`、`a ≠ b`、無向對不重複；全圖連通（含海路）。 |
| INV-12 | `army.path` 相鄰節點間必有 RoadEdge 相連；`path[pathCursor] = posNodeId`；`0 ≤ pathCursor < path.length`；`0 ≤ edgeProgressDays ≤ edgeCostDays`（位於節點上／已抵終點時 edgeProgressDays=0；抵達下一節點時餘量結轉，見 04 §5；TransportOrder 同此模型，勘誤 E-11）。 |
| INV-13 | `army.status='engaged'` ⇔ 該部隊出現在某 `FieldCombat` 的 `sideA/sideB.armyIds`（野戰）；進入合戰時 `battleId ≠ null` 且該 `BattleState.units` 含對應 `bu.<army>`；`status='sieging'` ⇔ `siegeId ≠ null` 且該 `Siege.attackerArmyIds` 含此部隊（欄名對齊 §4.10 Siege，修正 02 自身殘留 `Siege.armyIds`，四輪裁決 D-7）；FieldCombat/BattleState/Siege 引用的部隊必存在且狀態相符（勘誤 E-18）。 |
| INV-14 | `DiplomacyRow.key = pairKey(a,b)` 且 `a < b`（字典序）、`a ≠ b`；`missions` 中同一 `(fromClanId, target)` 至多一件、`officerId` 屬 from 方 serving；`target` 為勢力時 `≠ fromClanId` 且兩端 alive，`target ∈ {'court','shogunate'}`（朝廷／幕府獻金工作）時不受「≠ from、皆 alive」限制（勘誤 E-27／三輪裁決 2）。 |
| INV-15 | `status='pending'` 的 Proposal：`officerId` 為該勢力 serving 武將、`expiresDay > time.day`、`command.clanId = proposal.clanId`。 |
| INV-16 | 數值範圍：`loyalty/morale/publicOrder/trust*/courtFavor ∈ [0,100]`；`sentiment* ∈ [-100,100]`（0=中立，允許小數，勘誤 E-24）；`ldr/val/int/pol ∈ [1,120]`（基礎值；有效值 = min(120, 基礎+statGrowth)）；`prestige ∈ [0,2000]`；`commerce ≤ commerceCap`、`kokudaka ≤ kokudakaCap`、`population ≤ populationCap`、`durability ≤ maxDurability`；`gold/food/soldiers/merit ≥ 0` 且為整數。 |
| INV-17 | `Pact.kind='vassal'` ⇒ `vassalClanId ∈ {a,b}`；其他 kind ⇒ `vassalClanId=null`；同一 row 內同 kind 協定至多一件；`endDay=null` 僅允許 marriage/vassal。 |
| INV-18 | `officer.status='captive'` ⇔ `capturedByClanId ≠ null`（且該勢力 alive、`locationCastleId` 屬該勢力）。 |
| INV-19 | `officer.status='dead'` ⇒ 不被任何 `lordId/stewardId/leaderId/corpsLeaderId/army/mission/proposal(pending)` 引用。 |
| INV-20 | `district.subjugation ≠ null` ⇒ `subjugation.clanId ≠ district.ownerClanId`、`progress ∈ [0,100)` 且 `daysRequired ≥ 1`（四輪裁決 D-14）。 |
| INV-21 | `castle.facilities` 內各 `FacilityTypeId` 至多一個、不重複；`castle.buildQueue.length ≤ BAL.buildQueueSize`（=3），各項 `daysLeft ≥ 0`（[0] 為施工中）；建造中／已建成之施設不重複（勘誤 E-39）。 |
| INV-22 | `clan.alive=false` ⇒ 不擁有任何城/郡/部隊/軍團、不出現在任何 pending Proposal 與 DiploMission。 |
| INV-23 | `meta.playerClanId` 存在（可為已滅亡勢力：此時應已發出 `game.defeat`）。 |
| INV-24 | `time.year/month/dayOfMonth` 與 `time.day` 換算一致（§5.6）；`rng` 各流 ∈ [0, 2^32)。 |
| INV-25 | 全樹無 `undefined`/`NaN`/`Infinity`/函式/class instance；`reports.length ≤ BAL.reportMaxKept`。 |

驗證器骨架：

```
validateState(state):
  v = []
  for each 檢查群組 g in [INV-01 .. INV-25]:
    v += g.check(state)        // 每筆 Violation = { inv: 'INV-04', message: string, refs: Id[] }
  return v                     // 空陣列 = 通過
```

### 5.3 執行期 ID 生成（決定論）

```
nextId(state, kind):            // kind ∈ {army,battle,siege,corps,proposal,report,transport,plot}（勘誤 E-41／E-28）
  n = state.meta.nextSerials[kind]
  state.meta.nextSerials[kind] = n + 1
  return `${prefix[kind]}.${String(n).padStart(6,'0')}`   // 例：'army.000042'
```

流水號只增不減、隨存檔保存，確保重放時 ID 完全一致（golden test 前提）。

### 5.4 canonical stringify（golden hash 用）

```
canonicalStringify(v):
  if v is null|number|string|boolean: return JSON 基本序列化
  if v is Array: return '[' + v.map(canonicalStringify).join(',') + ']'
  if v is Object: keys = Object.keys(v).sort()   // 字典序
                  return '{' + keys.map(k => JSON.stringify(k)+':'+canonicalStringify(v[k])).join(',') + '}'
stateHash(state) = fnv1a32(canonicalStringify(state))      // 32-bit FNV-1a，實作於 17；入 hash 前先剔除 ai.intentLog（§3.4 第 6 點 transient 例外，勘誤 E-60）
```

### 5.5 pairKey 與預設外交列

```
pairKey(x, y): return x < y ? `${x}|${y}` : `${y}|${x}`    // 字串字典序
getRow(diplomacy, x, y):
  k = pairKey(x,y)
  return diplomacy.rows[k] ?? defaultRow(k)                // 缺列 = 預設列（不寫入 state）
defaultRow(k): trust 雙向 0、sentiment 雙向 0（0=中立，勘誤 E-24）、pacts []
              # 08 機制欄位（lastHostileDay／refusalCooldownUntilDay／lastReinforceRequestDay{AtoB,BtoA}）於預設列一律未設＝各自預設（§4.11；atWar 否、無冷卻、援軍冷卻已過）
// 任何系統要「修改」外交值時才 materialize 該列寫入 rows（稀疏儲存，§3.5）。
```

### 5.6 曆法換算

```
dayToCalendar(day):  year = 1560 + floor(day/360)
                     month = floor((day mod 360)/30) + 1
                     dayOfMonth = (day mod 30) + 1
calendarToDay(y,m,d) = (y-1560)*360 + (m-1)*30 + (d-1)
```

### 5.7 本文件引入的 BAL 常數（建議初值；定案見 15）

| 常數 | 建議值 | 用途 |
|---|---:|---|
| `BAL.abilityMax` | 120 | 四維能力上限 |
| `BAL.prestigeMax` | 2000 | 威信上限 |
| `BAL.commerceMaxAbs` | 2000 | 商業絕對上限（郡 `commerceCap` ≤ 此值） |
| `BAL.maxTraitsPerOfficer` | 4 | 特性數上限 |
| `BAL.maxDeputies` | 2 | 部隊副將數上限 |
| ~~`BAL.garrisonPopRatio`~~ | 廢除 | 【廢除，勘誤 E-61】城最大兵力改採 05 `maxSoldiers` 公式（`BAL.soldiersPerPop`=0.025），見 §5.1／15 §5.2 表 C |
| `BAL.durabilityMain` / `BAL.durabilityBranch` | 3000 / 1000 | 本城/支城耐久上限基準 |
| `BAL.facilitySlotsMain` / `BAL.facilitySlotsBranch` | 6 / 3 | 城下施設 slot 數 |
| `BAL.fiefMaxByRank` | [0,1,1,2,3,4] | 各身分知行郡數上限（§5.1 表；值定案見 15 §5.2，勘誤 E-03） |
| `BAL.policySlotMax` | 6 | 同時生效政策數「硬上限」；實際格數為動態 min(6, 1+floor(威信/300))（勘誤 E-38；05） |
| `BAL.proposalExpireDays` | 60 | 具申逾期日數 |
| `BAL.reportMaxKept` | 500 | 報告保留上限（值依 15，E-31） |
| ~~`BAL.kassenFieldW` / `BAL.kassenFieldH`~~ | 廢除 | 【廢除，勘誤 E-18】合戰改用陣（Jin）節點圖 5×3，不再用方格戰場 |
| `BAL.kassenMaxTicks` | 120 | 合戰強制結束 tick（名依統一，值定案見 15，勘誤 E-19） |
| `BAL.devInvariantCheckEveryDays` | 30 | dev build 不變量檢查頻率 |

---

## 6. UI/UX

本文件無獨立畫面。與 UI 的唯一接點是 **enum 顯示字串規約**：
所有 §3.3 enum 值以 i18n key `term.<enumName>.<value>`（camelCase enum 名、原樣 value）取字串，
例：`term.rank.samurai-taisho = "侍大將"`、`term.armyStatus.subjugating = "制壓中"`、
`term.aweLevel.large = "威風・大"`、`term.pactKind.ceasefire = "停戰"`。
完整字串表由 `plan/13-i18n-strings.md` 收錄；本文件各 enum 註解中的繁中詞即為建議值。

## 7. 實作任務清單

- [ ] `src/core/state/ids.ts`：branded ID 型別＋前綴 regex 常數＋`isClanId()` 等 type guard。
      驗收：regex 覆蓋 §3.2 全表；type guard 有單元測試。
- [ ] `src/core/state/enums.ts`：§3.3 全部 string literal union 與對應值陣列常數（如 `RANK_VALUES`）。
      驗收：每個 union 有同名 `*_VALUES` 陣列供迭代與 zod 驗證使用。
- [ ] `src/core/state/gameState.ts`：§4 全部 interface，欄位註解含單位與範圍。
      驗收：`tsc --strict` 通過；無 `any`；無 optional（`?:`）欄位。
- [ ] `src/core/commands/types.ts`：§4.18 Command 聯集。驗收：`CommandType` 可窮舉 discriminated union。
- [ ] `src/core/state/events.ts`：§4.19 GameEvent 聯集。驗收：同上。
- [ ] `src/core/state/selectors.ts`：§5.1 全部 selector＋`DerivedCache`（tick 內 memo、tick 開頭 `clear()`）。
      驗收：單元測試證明「郡被制壓走 → `castleMaxSoldiers` 立即下降」；memo 不跨 tick。
- [ ] `src/core/state/invariants.ts`：`validateState()` 實作 INV-01..25。
      驗收：對 25 條各構造一個違規 fixture，全部被偵測；s1560 初始狀態零違規。
- [ ] `src/core/state/serialize.ts`：`canonicalStringify` / `stateHash` / `nextId` / `pairKey` / 曆法換算。
      驗收：同一 state 兩次 hash 一致；打亂物件 key 順序後 hash 不變；`calendarToDay(dayToCalendar(d)) = d` 全量 property test。
- [ ] `src/core/state/builder.ts`：由劇本 JSON 建初始 `GameState`（含 `defaultRow` 稀疏外交、facilities 初始化）。
      驗收：建置後 `validateState` 零違規；`reports=[]`、`nextSerials` 全 1。
- [ ] 體積實測腳本 `tools/state-size.ts`：輸出 §3.5 各集合實際位元組，偏差 >50% 時回文件修表。

## 8. 設計決策記錄

- **DDR-1｜政策狀態獨立為 `GameState.policies`**：政策的「已施行清單／再採用冷卻」是會頻繁演進的流程狀態，
  獨立成 `Record<ClanId, ClanPolicyState>` 讓 Clan 本體保持低頻變動欄位；Clan 不重複儲存政策清單，
  避免雙重真相。查詢統一走 `state.policies[clanId]`。政策採即刻生效（無施行期，四輪裁決 D-11）；
  廢止後之再採用冷卻存於 `ClanPolicyState.cooldownUntil`。
- **DDR-2｜役職不存於 Officer**：城主/領主/軍團長皆以任職實體（Castle/District/Corps）為單一真相，
  Officer 只以 selector 反查。代價是反向索引每 tick 重建一次（600 武將 × 3 表 <1ms），換得零同步 bug。
- **DDR-3｜外交列採「無向 pair＋方向欄位」**：相較全有向表（40×39=1560 列），無向 780 列且協定天然
  pair 層級，不需雙列同步；信用/感情的方向性以 `trustAtoB/trustBtoA` 兩欄表達。另採稀疏儲存省 ~100KB。
- **DDR-4｜存檔自我完備**：靜態欄位（名稱、座標、上限）隨 state 序列化，讀檔不依賴劇本檔版本，
  遷移只需處理 state schema（16）。代價是存檔 +~40%（壓縮後約 +30KB），可接受。
- **DDR-5｜未元服武將以 `hasComeOfAge=false` 存在於 state**：00 §14 只定義四種武將狀態，
  不增加第五狀態，改用布林旗標＋INV-06 禁止引用；元服由 officers 系統於每年 1/1 翻轉（06）。
- **DDR-6｜官位/幕府役職掛在 Clan（當主）**：v1.0 不做武將個人官位，簡化敘任 UI 與繼承；
  當主更替時官位隨勢力保留。CourtState 只存朝廷友好度與幕府存續等全域事實。
- **DDR-7｜具申直接內嵌 Command**：`Proposal.command` 採納時原樣入佇列，具申＝「預先擬好的指令」，
  免去每種具申各寫一套執行邏輯，也保證具申效果與玩家手動操作完全一致。
- **DDR-8｜快取一律 transient、tick 內有效**：拒絕在 state 內存任何可推導值（唯一例外：曆法快取欄位），
  以「每 tick 清空」的粗粒度失效換取正確性；效能實測不足時再引入細粒度失效（17 的效能基準把關）。
- **DDR-9｜制壓進度存於 District 而非 Army**：多支部隊可先後接力制壓同一郡，進度屬於郡的事實；
  Army 只持有狀態 `subjugating`。**制壓所需日數 `daysRequired` 亦歸 `District.subjugation`**（四輪裁決 D-14）——
  由當前制壓部隊抵達時依 04 §3.8 算定、同勢力接力換將時以新部隊大將重算；Army 側不再持 `subjugation` 擴充欄位
  （備忘錄交 04 §4.2 移除 `ArmySubjugation`，`districtId` 由 `posNodeId` 反查）。
- **DDR-10｜執行期 ID 用六位數流水號**：取代 UUID/隨機字串，保證重放決定論且體積小；
  流水號存於 `meta.nextSerials` 隨檔保存。
- **DDR-11｜新增 `fac.`/`persona.` 前綴**：00 §8 未列城下施設種類與 AI 性格組的 ID 前綴，
  依同一 slug 規則補充；已同步列入 §3.2 對照表，19-glossary 收錄時以本表為準。
- **DDR-12｜合戰戰場模型採 07 陣（Jin）節點圖（2026-07-07，依 19 §3.13 E-18）**：§4.9 以 07 §4 的
  `FieldCombat`／`BattleState`／`Jin`／`JinEdge`／`BattleUnit`／`BattleResult` 置換原 24×16 方格模型；
  `GameState.battles` 改存 `BattleState`、新增 `fieldCombats`；`CmdBattleOrder` 拆為
  `CmdBattleMove/Attack/Tactic/Delegate`；`BattleMode`／`BattleOrderKind`／`kassenFieldW/H`／`kassenMaxRounds` 作廢。
  此為 02 > 07 優先序之明定例外（07 的陣圖已被 11 合戰畫面、戰法表、采配機制整體依賴）。依據：E-18 建議定案。

**2026-07-07 勘誤消化（依 `plan/19-glossary.md` §3.13；建議定案為據）**：

- **E-03**：`BAL.fiefMaxByRank` 值改為 `[0,1,1,2,3,4]`（§5.1／§5.7）；依 15 §5.2 值定案。
- **E-06**：刪 `Officer.tactics`（戰法改由 07 特性解鎖制持有）；依 E-06「建議依 07（刪 02 的 tactics 欄）」。
- **E-07**：`DevelopFocus` 第三值 `security`→`barracks`（§3.3／§4.6）；依 E-07「修 02 改為 barracks 並同步 09」。
- **E-10**：`ArmyStatus` 擴充為七態（新增 `routed`／`holding`，併入 04 retreating／07 resting，§3.3／§4.8）；依 E-10 聯集定案。
- **E-12／E-51**：§3.2 前綴表登記 `trans.`／`plot.`／`fc.`／`bu.`／`jin.`；`pact.`／`crank.`／`stitle.` 前綴廢除。
- **E-19**：`BAL.kassenMaxRounds`→`BAL.kassenMaxTicks`（值 120，§4.9／§5.7）；依 E-19。
- **E-24**：`sentiment*` 範圍 0..100(50中立)→−100..100(0中立、允許小數)（§4.11／§5.5／INV-16）；依 08。
- **E-28**：收錄 `Plot`（`PlotId`）、`DiplomacyProposal`、`DiplomacyActionKind`，`DiplomacyState` 增 `plots`／`pendingProposals`（§4.11）；保留 02 無向 pair rows 結構；依 E-28。
- **E-32**：Command 聯集補收 `CmdPromoteRank`／`CmdSetAutoReturn`／`CmdUseBetrayal`／`CmdRespondPact`／`CmdRequestShogunateTitle`／`CmdNominateShogun`／`CmdCancelPlot`；重複語意合併（`RemoveCastleFromCorps`＝`assignCastleToCorps(null)`、`activateBetrayal`＝`useBetrayal`）；依 E-32。
- **E-34**：`Officer.isKin: boolean`→`kinship: Kinship`（kin/fudai/tozama，§3.3／§4.4）；依 06 忠誠模型。
- **E-35**：`Clan.color: '#rrggbb'`→`colorIndex: number`(0..39)（§4.3）；依 12 D5。
- **E-36**：`RoadEdge` 欄位 `kind/length`→`type/grade/baseDays`（§4.7）；依 04 baseDays 模型（行軍進度累加器模型之 02 側收斂另見 2026-07-10 E-11）。
- **E-38**：政策同時生效數改動態制，`maxActivePolicies`→`policySlotMax`(=6 硬上限)、實際 min(6,1+floor(威信/300))（§4.14／§5.7）；依 05。
- **E-39**：`FacilitySlot[]` 固定槽→05 佇列制（`facilities: FacilityTypeId[]`＋`buildQueue: BuildOrder[]`）；`CmdBuildFacility` 去 `slotIndex`、增 `CmdCancelBuild`；`CmdDemolishFacility` 改 `facilityTypeId`（§4.5／§4.18／INV-21）；依 05。
- **E-41**：`CmdTransport` 併為 `(soldiers, gold, food)`；新增 `GameState.transports`、`TransportOrder`、`CmdRecallTransport`、`TransportId`（`trans.`，§4.1／§4.18／§5.3）；依 E-41。
- **E-42**：一次性 `CmdConscript`→方針制 `CmdSetConscriptPolicy`；`Castle.conscriptPolicy` 收錄、新增 `ConscriptPolicy` enum（§3.3／§4.5／§4.18）；依 05。
- **E-43**：`District` 增 `uprising: UprisingState | null`＋收錄 `UprisingState`（§4.6）；依 05。
- **E-44**：`Castle.betrayalReadyClanId`／`betrayalReadyUntilDay`、`Officer.spouseId` 收錄（§4.4／§4.5）；`isPort`／`coastal` 原已收錄；依 04／08。
- **E-48**：`Proposal` 增 `estimatedCostGold`／`summaryKey`／`summaryParams`（§4.15）；依 06。
- **E-55**：`MetaState` 增 `gameOver: GameOverState | null`；`EventsState` 增 `flags`／`tenkabitoStreakMonths`／`stats`（＋`VictoryStats`）（§4.2／§4.16）；依 10 §4.3。
- **E-59**：`Officer` 增 `statExp`／`statGrowth`（＋`StatBlock`）；`ldr/val/int/pol` 定位為基礎值、有效值 min(120,base+growth)（§4.4／INV-16）；依 06 成長模型。
- **E-60**：`GameState.ai: AiState` 收錄（§4.1／§4.20）；`intentLog`／`AiIntent` 標 transient 不序列化、`AiClanState` 持久化、`persona ← personas[personaId]`（persona 登錄制與序列化剔除之欄位級定案見 2026-07-10 E-60）；依 09 §4。
- **E-61**：`castleMaxSoldiers` selector 改引 05 `maxSoldiers` 公式、刪 `garrisonPopRatio`（§5.1／§5.7）；依 15 §5.2 表 C。
- **E-64**：`FieldCombat` 增 `interrupted`（合戰進行中／援軍時暫停每日解算，§4.9）；依 E-64。

**2026-07-10 樞紐定案（勘誤結構性殘項收束；依 `plan/19-glossary.md` §3.13）**：

- **E-27｜朝廷獻金改持續型獻金工作**：刪除一次性 `CmdDonateCourt`（原 `type:'donateCourt'; gold`）與其 §4.18
  聯集列項；朝廷獻金併入 `CmdStartDiploWork`——`targetClanId: ClanId` 擴充為 `target: ClanId | 'court'`
  （`CmdStopDiploWork` 與 §4.11 `DiploMission` 同步：後者 `toClanId: ClanId`→`target: ClanId | 'court'`），
  `target='court'` 即獻金工作，每月 `goldPerMonth` 投入 → `courtFavor` 累積（機制參見 08 §3.5）。
  `CourtState.courtFavor` 註解、`missions` 註解、INV-14 同步。欄位名依 02（`courtFavor`）、機制依 08。
  理由：消除「一次性 vs 持續型」雙模型與 §4.18「v1.0 暫留一次性」之逆向註記；`ClanId | 'court'` 型別安全
  （分支以 `target === 'court'` 判別，ClanId 為 branded string 無交集）且最小侵入。
- **E-11｜行軍模型收斂為唯一權威「日數累加器」**：§4.8 `Army` 與 §4.13 `TransportOrder` 的行軍進度欄位由
  `edgeProgress: number (0..1)` 收斂為 `edgeProgressDays`（當前邊已累積行軍日數）＋`edgeCostDays`
  （當前邊有效日數＝`edge.baseDays / BAL.roadGradeSpeedMult[grade]`，海路固定＝baseDays），抵達判定
  `edgeProgressDays ≥ edgeCostDays`（餘量結轉見 04 §5）；`TransportOrder.pathIndex`→`pathCursor` 統一命名；
  INV-12 由 `0 ≤ edgeProgress < 1` 改為 `0 ≤ edgeProgressDays ≤ edgeCostDays`。與 04 §4.2 `MarchState` 完全對齊
  （02 `pathCursor` ＝ 04 `nodeIndex` 語意）。理由：原 02 的 0..1 比例模型與 04 日數累加器並存＝雙真相；
  本次裁決以**日數累加器為唯一權威**（尋路/遭遇/圍城中斷均以日數運算），04 側僅需 `nodeIndex`→`pathCursor` 改名即對齊。
- **E-60｜AiState 欄位級對齊 09 §4 persona 登錄制**：§4.20 `AiState` 新增 `personas: Record<AiPersonaId, AiPersona>`
  （持久化登錄表）；`AiClanState.persona: AiPersona`→`personaId: AiPersonaId`（未解析參照，使用處解析
  `state.ai.personas[personaId]`）；§4.20 開頭說明段改寫為「登錄表＋未解析參照＋使用處解析」，消除原
  「載入時解析成 persona 物件」之矛盾。序列化剔除機制（§3.4 新增第 6 點）：`GameState.ai.intentLog`
  不落地存檔／不入 §5.4 狀態雜湊，序列化與 hash 前以淺拷貝 `{ ...state, ai: { ...state.ai, intentLog: [] } }`
  覆寫該欄位（不動原 state），讀檔後恆為 `[]`。依 09 §4／§8-D16。
- **E-30｜補收「部隊抵達」事件**：§4.19 總表新增 `army.arrived`（payload `armyId, clanId, nodeId: MapNodeId`；
  部隊抵達其目標節點時由 04 movement 發出）。canonical 名採 `army.*` 族系——跟隨 02 既有
  `army.departed`／`army.returned`／`army.starving`（02 §4.19 並無 `military.*` 族系）；03 §3.4 的
  `military.armyArrived` 對應本名，比照既有映射 `military.armyDeparted → army.departed`（03 已聲明事件名以
  02 §4.19 總表為準，E-30）。理由：與 02 事件命名慣例一致、避免另立 `military.*` 前綴。
- **E-29｜`CmdRewardOfficer` 採 06 三檔制**：payload `gold: number`→`tier: RewardTier`（`'small'|'medium'|'large'`，
  §3.3 新增）；機制擁有者為 06 §3.8.1，費用與忠誠增益由 BAL 推導（`BAL.rewardGold{Small,Medium,Large}Cost`／
  `…Loyalty`，年內遞減），讀 06 §3.8／15 §5.1 確認褒賞無自由金額需求（三檔全由常數決定）。並覆核：
  §4.18 Command 聯集完整（cancelBuild／recallTransport／setAutoReturn／useBetrayal／promoteRank／
  requestShogunateTitle／nominateShogun／cancelPlot／setConscriptPolicy／battleMove·Attack·Tactic·Delegate／
  respondPact 均已在列）；§4.19 GameEvent 總表無 `combat.*`／`dip.*` 舊族系殘留（`diplo.refused` 為現行
  canonical，非殘留）。

**2026-07-10 二輪裁決（02 樞紐回寫時發現之跨檔缺口收束；沿用既有勘誤台帳編號，無新增台帳項）**：

- **二輪 A｜登用類指令補收 `executorId` 與 `officerId` 命名慣例**（依 E-29；06 §3.7）：`CmdRecruitRonin`
  增 `executorId: OfficerId`、`CmdHandleCaptive` 增 `executorId: OfficerId | null`（06 §3.7.1／§3.7.2
  之登用／招降成功率公式以登用者 `pol` 與特性為輸入，02 原缺執行者欄位＝機制必要缺口）。§4.18 開頭補
  命名慣例：`officerId`＝被作用武將、`executorId`＝執行武將、`targetOfficerId`＝對方武將。據此
  `CmdStartDiploWork`／`CmdStartPlot` 之執行者欄由 `officerId`→`executorId`（08 §4 命令聯集需同步；狀態
  `Plot.officerId`／`DiploMission.officerId` 為單一武將實體、無被作用武將並存，沿用不改名，apply 時由
  `executorId` 寫入）。理由：消除同名 `officerId` 在「被作用／執行」語意間漂移；與 E-29 已列的
  `RecruitRoninCommand(executorId,targetId)` 命名一致。
- **二輪 B｜§4.8 `Army` 欄位 02↔07 對帳收斂**（依 E-11／E-18／E-22；07 §3.2／§3.4／§3.11～§3.13／§4）：
  逐欄裁決——`initialTroops`（潰走判定基準 `soldiers < initialTroops × BAL.routTroopRatio`，07 §3.2／§3.4
  使用；名沿 07 與 §4.9 `FieldCombatSide.initialTroops` 一致，不採 `initialSoldiers`）**收**；`autoReturn`
  （`CmdSetAutoReturn` 之狀態欄，E-32；預設 true）**收**；`mission: ArmyMission`（意圖層，與 `status` 活動層
  正交——conquer 觸發抵城自動圍城、return 觸發歸還，07 §3.11／§3.13；非可穩健衍生自 `status` 或
  `isEnemyCastleNode(target)`〔目標易主會誤判〕）**收**，§3.3 增 `ArmyMission` enum；`corpsId: CorpsId | null`
  （出陣時快照、軍團解散／收回城時顯式改 null，不可由 `originCastle.corpsId` 衍生〔直轄城出陣後才入軍團
  之情形會誤判歸屬〕）**收**。`troopType`（07 §3.2 v1 一律 `'standard'`、明訂不得實作分支）**廢**：屬恆定值
  （違 DDR-8「不存可推導值」），v1 不入 state，兵種為 post-v1 schema 擴充。反向確認：`battleId`／`siegeId`
  前向指標為 canonical（§4.8／INV-13：野戰 engaged 走 `FieldCombat.armyIds` 反查、合戰走 `battleId`、圍城
  `siegeId`＋`Siege.attackerArmyIds`），已由 DDR-12（E-18）涵蓋；07 §4 `Army` 缺此二欄，列入下游備忘錄補齊。
- **二輪 C｜§4.19 事件完整性裁決**（依 E-30 事件 canonical 收束原則）：以「有報告／自動暫停／程式消費者→收、
  純冗餘→廢」逐一裁決 03／04／05／06／13／16 引用而 02 未收之事件。**收**三項：`officer.loyaltyLow`
  （13 `report.officer.loyaltyLow`＋03 §3.4.2 warning 級；payload `officerId, clanId, loyalty`；06 發）、
  `proposal.expired`（13 `report.proposal.expired`＋03 Step10 逾期；payload `proposalId, officerId`〔七輪裁決 2 增 `reason: 'timeout'|'invalidated'`，見 §4.19／下方七輪裁決〕；06 發）、
  `time.seasonStart`（16 §5.3 季首自動存檔實際消費；payload `year, season`；03 發）。**廢**六項：
  `military.encounter`（＝野戰成立，統一用既有 `battle.started`）、`military.districtLost`（守方視角，
  `district.subjugated.fromClanId` 已含守方資訊）、`siege.progress`（11 §3.11.2 攻城 overlay 明訂「與 core
  狀態同步」＝讀 `Siege`／`Castle` 狀態、非事件驅動；13 null-report）、`time.monthEnd`／`time.yearStart`
  （無消費者，tick 各步以 `state.time` 日期閘控而非消費事件；13 null-report）、`development.districtGrown`
  （13 null-report、無任何消費者）。另確認：`battle.won/lost`／`siege.fallen/repelled` 一律不新增（13 已改用
  `battle.ended.winnerClanId`／`siege.ended.fallen` 變體判別）。
- **二輪 D｜`CmdMarch`／`CmdSetArmyTarget` waypoints v1 廢除**（04 §4.3／§5.2 為尋路權威）：04 `PathQuery`
  為單一 `from→to`、`computePath` 單目標 Dijkstra，無多經由點 API；04 `RoadEdgeData.waypoints` 僅為街道
  畫線中繼點（明訂「不影響模擬」），與 07 出陣經由點無關；11 亦無出陣經由點 UI。故 02 `CmdMarch`／
  `CmdSetArmyTarget` 維持單一 `targetNodeId`（不收 waypoints）；改道需求由 `CmdSetArmyTarget` 覆寫目標
  即足。07 §3.1／§5.1（`findPathWithWaypoints`）與 §4 命令表 waypoints 欄列入下游備忘錄刪除。
- **二輪 E｜下游對齊備忘錄（02 已 canonical，本輪不改 02）**：`Castle.soldiers`（§4.5 L375）、
  `CmdSetSiegeMode`（§4.18）、`CommandBase.clanId`（§4.18）、`CmdMarch.originCastleId`（§4.18）為 canonical；
  07 之 `castle.garrison`／`CmdSiegeMode`／`cmd.issuerClanId`／`CmdMarch.castleId` 待改（詳見本輪裁決備忘錄）。

**2026-07-10 外交系統大改連動（08 為主記錄；依 `plan/19-glossary.md` §3.13 E-23／E-28／E-27／E-32）**：

- **E-27 尾｜`goldPerMonth` 刪除（機制歸 08）**：08 §3.2／§3.5.1 訂外交／獻金工作月費為固定 `BAL` 常數
  （對勢力 `diplomacyWorkMonthlyCost`、`'court'` `courtWorkMonthlyCost`），favor/信用累積僅讀武將政務、不讀
  投入額。故 §4.18 `CmdStartDiploWork` 與 §4.11 `DiploMission` 之 `goldPerMonth` 欄位刪除（月費由 `target`
  種類查常數，非玩家自訂）；相關註解改「固定月費」。理由：消除「玩家自訂投入額」與 08 固定月費機制之矛盾，
  採最小發明（維持 08）。
- **E-32｜`diplo.envoyArrived` 收錄 §4.19**：08 「外交提案送達玩家」事件（原 08 `dip.proposalReceived`）跟隨
  既有 `diplo.*` 族系正名為 `diplo.envoyArrived`，payload `{ fromClanId, proposalId }`、發出者 08、觸發 11
  來使 modal 自動暫停；§4.19 總表加列（03 §4.3／13 §6.11 引用名同步）。理由：與 02 事件命名慣例一致、
  收束「08 擴充事件待 02 收錄」缺口。
- **E-28 備忘（下游待補，本輪不改 02 結構）**：08 機制於外交列讀寫三個每對狀態欄位——`lastHostileDay`
  （atWar 推導）、`refusalCooldownUntilDay`（提案拒絕冷卻）、`lastReinforceRequestDay`（援軍冷卻）——
  語意由 08 擁有，§4.11 `DiplomacyRow` 目前未列其型別欄位；列入下游備忘錄補齊（不影響 08 機制語意）。
  **【已收束，見下方 2026-07-10 三輪裁決 1】**

**2026-07-10 外交三輪裁決（02↔08 三缺口收束；主編輯 02，連動最小改 08；沿用勘誤台帳語境，無新增台帳項）**：

- **三輪裁決 1｜§4.11 `DiplomacyRow` 收錄 08 機制每對欄位**（收束上方 E-28 備忘；語意擁有者 08、結構擁有者 02）：
  依 08 實際讀寫語意逐欄定方向性——(a) `lastHostileDay?: number`＝**無向單一值**（08 §3.1 明訂；07 回寫、atWar 推導）；
  未設＝從未交戰（≠ 0：0 為劇本開局交戰標記，14）。(b) `refusalCooldownUntilDay?: Partial<Record<DiplomacyActionKind, number>>`＝
  **pair 共用、依 kind**（08 §5.3.1／§5.3.2 皆於無向列以 `[kind]` 索引、無方向分支；提案協商冷卻對雙向對稱，pair 共用語意正確）。
  (c) 援軍請求冷卻＝**有向**（「A 向盟友請求」之速率限制；單一欄會使互為同盟之 A、B 其一請求阻塞另一方之合法請求＝方向性缺口），
  故拆為 `lastReinforceRequestDayAtoB?`／`lastReinforceRequestDayBtoA?`，08 §3.1（方向性定義）／§5.3.2／§5.3.5 之單欄讀寫同步改有向存取。
  三欄皆 optional（稀疏；未設＝預設，非 `undefined` 值，符 INV-25／DDR-3）。
- **三輪裁決 2｜幕府獻金與 CourtState（結構依 02、扁平）**：`DiploMission.target`／`CmdStartDiploWork`／`CmdStopDiploWork.target`
  由 `ClanId|'court'` 擴為 `ClanId|'court'|'shogunate'`（missions 註解、INV-14 同步）；§4.12 `CourtState`（維持扁平、`Clan.courtRank`/`Clan.shogunateTitle`
  單一真相不變）補收機制必要欄位 `shogunateFavor: Record<ClanId,number>`（幕府友好度，08 §3.6.2）與 `patronClanId: ClanId|null`
  （擁立將軍者，08 §3.6.3；02 原缺、08 機制必需）。08 側連動：`courtRankByClan`→`Clan.courtRank`、`grantedTitle`→`Clan.shogunateTitle`、
  巢狀 `ShogunateState`／`shogunOfficerId`（無讀者、冗於 `shogunClanId`＋Officer 資料）／`mediationCooldownUntilDay`（改 02 名 `mediationCooldownUntil`）
  之結構表述改為引用 02 §4.12（08 §4／§5.4）。**回報（不逕改）**：03 §3.3.4 Command 一覽表 `startDiploWork` 僅列「勢力／`'court'`」兩列，
  應增「幕府獻金 `target='shogunate'`」一列。
- **三輪裁決 3｜`CmdProposePact` 表達力**：(3a) 刪 `termDays`（期限依 kind 查 BAL 常數，08 機制、最小發明）。(3b)+(3c) `kind` 由 `PactKind`
  改 `DiplomacyActionKind`（六值），使指令 kind 與所產生之 `DiplomacyProposal.kind` 直接對應（原 `PactKind` 無法表達 demandVassal/offerVassal
  之方向、亦無 requestReinforce）；**從屬方向由 demandVassal（目標從屬）/offerVassal（我方從屬）兩 kind 表達**（依 08 §3.4.1／§5.3.2 用語，
  免另設方向欄）；**requestReinforce 循 08 §3.4「所有行動由 proposePact 發起」納入本指令**（增 `reinforceAgainstClanId`），故不另立 `CmdRequestReinforce`
  （§4.18 Command 聯集不變）。(3d) 婚姻成婚武將維持 08 大改「雙方決定論自動選定」（§5.3.1），不加指令欄。

**2026-07-11 四輪裁決（對抗式驗證 CONFIRMED findings 修復；02 為裁決主體，連動最小改；沿用勘誤台帳語境，無新增台帳項）**：

- **A｜Officer 雙重真相（02 §4.4 vs 06 §4）收束（BLOCKER）**：§4.4 收錄 06 機制必需的持久欄位
  `scheduledDeath`／`captiveRetryOn`／`recruitRetryOn`／`rewardGiftsThisYear`／`stalledPromotionMonths`
  （日期一律絕對日 `number`，非 06 之 `GameDate`）。形狀裁決：(a) 能力欄位維持 **02 平鋪** `ldr/val/int/pol`＋`statExp/statGrowth: StatBlock`
  （備忘錄交 06：`baseStats: OfficerStats` 包裝改攤平）；(b) 位置模型維持 **02** `locationCastleId(出陣中=null)`＋`armyId`
  （備忘錄交 06：`locationCastleId: CastleId` 改可空並收 `armyId`）；(c) **INV-05/INV-08 語意定案**——捕虜保留 `clanId=原屬勢力`
  （06 §3.7.2 釋放/歸還必需；`capturedByClanId` 僅承載俘方），INV-08 由「serving ⇔ clanId≠null」改為「serving⇒clanId≠null 且 alive；
  captive⇒clanId≠null(原屬，可能已滅亡)；ronin/dead⇒clanId=null」。`deathYear` 保留（＝06 `historicalDeathYear`，備忘錄交 06 對齊名）、
  註解改「開局據此排定 scheduledDeath、執行期不再另計抖動」。
  ——追記（同日收尾）：06 之 `historicalDeathMonth` 廢除（14 劇本資料不提供卒月，該欄恆 null 屬死規格；
  `scheduledDeath.month` 一律由 rng.event 生成）；`Castle.riceTradedThisMonth` 收錄（05 米問屋月上限累加器，D-10 連動）。
- **B｜`CmdUseBetrayal` 效果二選一定案＝08**：調略單一真相為 08，§4.18 `CmdUseBetrayal` 註解改「城士氣降至
  `BAL.plotBetrayalMoraleFloor`(=5)、城主忠誠歸 0」（08 §5.5.3）；07 §3.11 之 `betrayalMoraleHit`(一次性−40) 廢棄（備忘錄交 07／15）。
- **C｜§4.19 事件系統**：(C-1) `diplo.refused.kind` `PactKind`→`DiplomacyActionKind`。(C-2) `battle.started/kassenAvailable/ended.battleId`
  與 `awe.triggered.sourceBattleId` 型別明訂 **`string`（FieldCombat.id ∪ BattleId）**（野戰餵 `fc.*`，07 §5.2），§3.2 加註 `fc.*` 可入事件 payload。
  (C-3) §3.2 `fc./bu./jin.` 列「不序列化」誤述改為「不入 nextSerials（決定論導出）；`fc.` 隨 `fieldCombats`、`bu./jin.` 隨 `battles`(BattleState) 正常序列化」。
  (C-4) `GameEventBase` 收錄 `clanIds: ClanId[]`（非 optional、可空陣列；03 §4.3 對齊）。(C-5) 收錄 `economy.upkeepUnpaid{clanId}`／
  `economy.foodShortage{clanId,castleId}`（05 發、13 §6.11 報告消費）；`development.completed` 無消費者→**廢除**（備忘錄交 03 停發）。
  (C-6) 收錄 `army.blocked{armyId,clanId,nodeId}`（04 §5.4 發、13 報告消費）。
- **D｜型別/欄位**：(D-7) INV-13 `Siege.armyIds`→`Siege.attackerArmyIds`（02 自身殘留）。(D-8) §4.8 狀態機補 `routed`／`holding`
  轉移邊、「糧盡→returning」改「糧將盡(autoReturn)→returning」＋「士氣崩→routed」（07 §3.4/§3.13 為單一擁有者）。
  (D-9) `CmdCreateCorps` 補 `targetNodeId: MapNodeId | null`。(D-10) 收錄 `CmdTradeRice`（讀 05 §5.5）；**結算時點裁決：廢除 05「即時結算」、統一走
  Command 佇列次 tick 開頭**（備忘錄交 05）。(D-11) 政策模型定案：容器維持 `GameState.policies`，`ClanPolicyState` 刪 `enacting`（**即刻生效**、機制擁有者 05）、
  增 `cooldownUntil`（05 再採用冷卻），備忘錄交 05（`activePolicies/policyCooldowns` 遷入並對齊名）。(D-12) `Castle.foodFrac` 收錄；
  `District.kokudaka/commerce/population` 整數宣告改**浮點內部儲存、顯示 floor**（05 §3.2.1）。(D-13) persona 唯一真相＝`AiClanState.personaId`，
  **刪 `Clan.personaId`**（載入直寫 `ai.clans`，備忘錄交 14／09）。(D-14) 制壓 `daysRequired` 併入 `District.subjugation`（DDR-9/INV-20 同步；
  備忘錄交 04 移除 `ArmySubjugation`）。(D-15) `TransportOrder.edgeCostDays` 註解改「完整公式歸 05 §3.6/§5.4」消除公式矛盾。
  (D-16) `trust*`／`courtFavor`／`shogunateFavor` 整數宣告改**允許小數累積、顯示 floor**（08 §5.2.1/§5.2.2 月增益含小數；與 08 T2「10 月恰 60」相容：
  pol=100 時 6.0/月×10=60）。(D-17) `CmdStartPlot.targetOfficerId` 註解改「poach／rumor(武將模式) 對象武將；rumor(城模式)/betrayal 為 null」。
  (D-18) §4.18 軍團指令群組註記「（語意見 09）」→「（語意見 07 §3.12；軍團 AI 見 09）」。(D-19) §4.20 模組路徑
  `src/core/ai/types.ts`→`src/core/systems/ai/types.ts`；`AiIntent.scores` 已為 `| null`（09 對齊，備忘錄註記）。
- **E 組｜下游裁決（02 不改，記錄裁決供下游；編號為本輪 finding 序，非勘誤台帳 E-XX）**：(項20) 04 `retreatSpeedFactor`／`armyDisbandSoldiers`／「士氣以0計」／「被迫野戰」與 07 §3.4 矛盾
  → **07 模型全勝**（`routDailyLossRate`/追擊/無城解散）；`retreatSpeedFactor` **保留**（movement 速度常數，returning/routed 共用，04 §5.3；07 §3.4 敘述援引）；
  `armyDisbandSoldiers`／「士氣0計」／「被迫野戰」**廢除**（備忘錄交 04/07/15）。(項21) `requestReinforce` 接受分支不可發 `pact.signed`（payload 不可滿足）
  → 收錄 `diplo.reinforceAgreed{fromClanId,toClanId,againstClanId}` 於 §4.19（備忘錄交 08 發、13 接）。(項22) AI 受方提案結算點三檔不一
  → **唯一結算點＝Step 4 diplomacy 以 `evaluateProposal` 決定論結算**（08 §5.3.1 已如此；備忘錄交 03/08/09 統一，09 §3.4.5「反應層立即判定」與 03 Step11 對齊為 Step 4）。
  (項23) 08 §5.1 感情月結「for clan in clans」對 pair 雙倍套用 → **改 for row in rows 依 key 字典序一次**（備忘錄交 08）。(項24) 08 clan-adjacencyCache
  月中失效 → **lazy 重算（任一 tick 首次需要時重算、tick 內快取）**（備忘錄交 08；與 02 §5.1 節點鄰接表〔靜態、載入時建〕無關）。

**2026-07-11 五輪裁決（對抗式驗證 V6 CONFIRMED findings 修復；02 為裁決主體，連動最小改；沿用勘誤台帳語境，無新增台帳項）**：

- **A｜報告渲染契約歸屬（BLOCKER）**：報告「顯示層 enrichment」規格歸 13（字串擁有者）。簽名裁決＝**UI 層 selector** `renderReport(report, state, playerClanId)`——
  core 只存原始 event（§4.17 `Report` 不變、03 §3.4.3 一致），key 與 params 於 UI 渲染時導出（含 ID→顯示名 enrichment 與玩家攻守視角分流），**params 由 enrichment 導出而非直用 payload key**。
  §4.17 `event` 註解補「顯示 key/params 導出契約見 13 §3.7」。細則交 13（§3.7 現存「`makeReportEntry` 於 core 執行、`messageKeyForEvent` 為 core 側」之敘述與本裁決相牴觸，須改判為 UI 側 `renderReport`；預設規則「params = event.payload／payload key 即參數名」須改為「payload ID 經 enrichment 導出顯示 param」）。
- **B｜報告 enrichment payload 缺口補全**：§4.19 逐項補持久實體 ID（表後註完整）——`battle.ended` +`nodeId/attackerClanId/defenderClanId`；`district.subjugated` +`armyId`；
  `officer.died` +`nodeId: MapNodeId | null`；`plot.succeeded`／`plot.failed` +`targetCastleId: CastleId | null`。理由：裁決 A 改渲染時導出後，transient 實體（部隊、已結束戰鬥）不可反查，顯示所需持久 ID 須隨 event 落地。
  §4.19 逐列快查 13 §6.11 之結論：`army.departed/arrived/blocked`（leader 經 `armyId`）、`battle.kassenAvailable`（place 經 `battleId`）等**ID 已在 payload**、屬 13 之 enrichment-timing（transient 實體須於同 tick／存活期間解析），非本輪 payload 缺口；`report.plot.poachSuccess` 之 `{officer}`／`{target}` 語意（executor vs 被引拔者）待 08/13 釐清（見備忘錄）。
- **C｜`officer.died.cause` 收斂**：`'age'|'battle'|'execution'`→`'age'|'battle'`，移除 `'execution'`（處刑死亡由 `officer.executed` 承載；06 §3.7.2(c) 不經 `die()`、`officer.died` 不重複發）。備忘錄交 06／13。
- **D｜殘留修正**：(D-a) §4.13 `TransportOrder.edgeCostDays` 註解刪除內嵌算式殘留「× BAL.transportSpeedFactor」（與 05 §3.6「輸送隊進入邊時**除以** transportSpeedFactor」矛盾），僅留「公式歸 05 §3.6／§5.4（速度係數採除以慣例）」。
  (D-b) §4.9 `FieldCombat.id`／`Jin.id`／`BattleUnit.id` 註解「transient 前綴」→「內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2」（對齊 §3.2／四輪裁決 C-3）。
- **E｜§4.4 debut 欄位收錄（回歸驗證 major）**：§4.4 收 `debutYear: number`／`debutClanId: ClanId | null`／`debutCastleId: CastleId`（06 §3.10 元服機制必需、06 §4 已有、02 原缺）。備忘錄交 14（`zOfficer` 三欄為**可選**、builder 推導：`debutYear` 缺→`birthYear + BAL.comingOfAgeAge`；`debutClanId` 缺→`clanId`；`debutCastleId` 缺→`locationCastleId`）。

**2026-07-11 六輪裁決（事件↔報告邊界末輪收束；02 為裁決主體、只編輯本檔，連動改以下游清單交付；沿用勘誤台帳語境，無新增台帳項）**：

背景：五輪 A 定案「報告由 UI 層 `renderReport` 於渲染時導出、core 只存原始 event」（§4.17／03 §3.4.3）後，新契約下 **core 不得直接發 `report.*` key**。末輪驗證發現 13 §6.11 尚有多列事件欄為「—」而其生產者實際「發事件（08 擴充事件，02 未收）」或「05 直發 `report.*`」，仍有邊界缺口。逐一裁決如下。

- **1｜擴充事件收錄裁決（全數收錄 §4.19；無一判 UI-only，因 13 §6.11 皆有 Report 消費列且語意屬 core 模擬事實）**。收錄表（canonical 名／payload 全文／`clanIds`／對應 13 §6.11 報告 key／發出者）：

  | canonical 事件 | payload（envelope 外） | `clanIds` | 13 §6.11 報告 key（視角/分流） | 發出者 |
  |---|---|---|---|---|
  | `policy.autoRevoked` | `clanId, policyId: PolicyId` | `[clanId]` | `report.policy.autoRevoked{name}`（name←policyId 經 PolicyDef.nameKey） | 05 §3.6／§5.2 |
  | `economy.granaryOverflow` | `clanId, castleId, food: number` | `[clanId]` | `report.economy.granaryOverflow{castle,food}`（food＝散失石數，原樣 number） | 05 §3.2／§3.6 |
  | `uprising.ended` | `districtId, resolved: 'suppressed' \| 'subsided'` | `[郡所屬勢力]` | `resolved='suppressed'`→`report.uprising.suppressed{district}`；`'subsided'`→`report.uprising.subsided{district}` | 05 §3.8.3 |
  | `diplo.workStopped` | `clanId, target: ClanId \| 'court' \| 'shogunate'` | `[clanId]` | `report.diplomacy.workStopped{target}`（target='court'/'shogunate' 顯示朝廷/幕府） | 08 §5.1／§3.6.4 |
  | `court.mediationResult` | `clanId, targetClanId: ClanId, success: boolean, ceasefireMonths: number` | `[clanId,targetClanId]` | `success`→`report.court.mediationSuccess{clan=targetClanId,months=ceasefireMonths}`；`!success`→`report.court.mediationFailed{clan=targetClanId}` | 08 §5.4.2 |
  | `shogunate.nominated` | `clanId` | `[clanId]` | `report.shogunate.nominated{clan}`（世界級廣播，第三人稱字串對全視角通用） | 08 §5.4.3 |
  | `shogunate.patronLost` | `clanId` | `[clanId]` | `report.shogunate.patronLost`（無參數；**當事勢力視角**，字串為「我方…」，僅該勢力可見） | 08 §3.6.3 |
  | `shogunate.collapsed` | （無） | `[]`（全域廣播） | `report.shogunate.collapsed`（無參數；全視角） | 08 §3.6.4（10 呼叫） |
  | `plot.exposed` | `kind: PlotKind, actorClanId, targetClanId, targetOfficerId: OfficerId \| null, targetCastleId: CastleId \| null`（鏡射 `plot.failed`） | `[actorClanId,targetClanId]` | actor 視角→`report.plot.exposed{clan=targetClanId,plot=kind}`；target 視角→`report.plot.exposedByEnemy{clan=actorClanId,plot=kind}` | 08 §5.5.2 |
  | `plot.betrayalActivated` | `actorClanId, targetClanId, castleId: CastleId` | `[actorClanId,targetClanId]` | `report.plot.betrayalActivated{castle}` | 08 §5.5.3 |

  裁決理由：(a) 上列全為 core 決定論模擬事實（經濟/治安/外交/朝幕/調略），入 `state.reports` 不破壞 §5.4 golden hash；(b) 命名對齊既有族系（`dip.workStopped`→`diplo.workStopped`；`court.*`／`shogunate.*`／`plot.*` 與 `court.rankGranted`／`shogunate.titleGranted`／`plot.succeeded/failed` 同前綴）；(c) payload 只承載持久實體 ID 與判別旗標，顯示名/視角分流一律交 13 §3.7 `renderReport`（五輪 A/B）。`court.mediationResult` 成功時另 emit `pact.signed`（強制停戰），故該 tick 會同時產生 `report.court.mediationSuccess` 與 `report.diplomacy.pactSigned` 兩則——是否於 13 去重由 13 定（見下游清單）。

- **2｜`diplo.envoyArrived` 增 `kind: DiplomacyActionKind`**：payload 由 `{fromClanId, proposalId}` 增為 `{fromClanId, proposalId, kind}`。理由：13 §6.11 `report.diplomacy.envoyArrived{clan,proposal}` 之 `{proposal}` 需顯示提案型別，但 renderReport 於渲染時 Proposal 已 transient（受方裁決後移出 `pendingProposals`）、`proposalId` 不可反查；`kind`（＝`Proposal.kind`）於 08 emit 端已持有，隨 event 落地後 13 可直接取型別 i18n。`proposalId` 保留供來使 modal／11 跳轉。發出者 08 §5.6。

- **3｜戰死生產者裁決（`officer.died(cause='battle')`）＝v1 保留戰死、規格歸 07；02 本表不改**。現況缺口：07 全文無戰死判定（§3.4 潰走追擊僅折兵、§3.11 落城 step 2「逃脫判定（公式參見 06）」只分流「逃脫／被俘」無戰死）；06 §2（L34）「戰死機率：參見 07」、06 §3.9.2／§5.5 `die(o,'battle',nodeId)`「由 07 呼叫、nodeId＝戰場節點」、06 §4「戰死判定由 07 定義」、13 `report.officer.killedInAction` 皆已預設戰死存在——即多文件懸空引用 07 卻無定義。裁決：**保留戰死**（回退代價＝改動 06×4 處＋13＋02 表後註③，較收束為高，且史實桶狹間今川義元戰死等 10 §覆寫亦仰賴此路徑），`officer.died.cause` 維持 `'age'|'battle'`、`nodeId: MapNodeId|null`（五輪 B/C 已定），02 不動。**07 待補最小規格框架**（下游 07 落實）：
  - 戰死時機三處：(i) 野戰潰走被追擊（§3.4 追擊命中的潰走部隊大將/副將）、(ii) 合戰敗北一方大將（§3.5 敗北側潰走/殲滅部隊之大將）、(iii) 落城守將逃脫失敗（§3.11 step 2 之「逃脫判定」擴為三分：逃脫／被俘／戰死）。
  - 機率為 BAL 常數，07 給建議初值：`BAL.battleDeathChanceRout`（潰走追擊被殺，建議 0.05）、`BAL.battleDeathChanceDefeatGeneral`（合戰敗將，建議 0.03）、`BAL.siegeDeathChanceEscapeFail`（落城逃脫失敗後轉戰死之比例，建議 0.15，其餘為被俘）；隨機流一律 `rng.misc`（與捕虜/逃脫同流，03 §3.5 一致）。
  - 呼叫慣例：戰死由 07 呼叫 06 `die(o, 'battle', nodeId)`，`nodeId`＝該野戰/合戰/圍城之戰場節點；06 `die()` 內發 `officer.died(officerId, clanId, 'battle', nodeId)`（06 §5.5，不由 07 直發）。落城 step 2 三分後：被俘者續發 `officer.captured`（既有），戰死者不另發 `officer.captured`。

- **4｜`save.autosaveFailed` 裁決＝不收錄 §4.19、改判 app 層 UI 通知（非 core Report）**。依 16 §5.3（app 層季首 hook：`else → 降級：發重大 Report(report.save.autosaveFailed)`）與 03 §3.4.3（`reportsSystem` 於 Step 13 由 GameEvent 產生 `Report` 並 `state.reports.push`、Report 隨 `GameState` 序列化並入 §5.4 hash）核對：自動存檔失敗係 **app 層 I/O 失敗（IndexedDB 配額/寫入錯誤）**，非決定論、core 不感知；若令其成為 core GameEvent 或進 `state.reports`，非決定論訊號將污染 §5.4 golden hash、破壞重放決定論（03 §3.5.4）。故**不得**收錄 §4.19、**不得**經 core Report 機制。裁決方向採「16 走 app 層 UI 通知」：失敗時由 16 §5.3 hook 直接以 app 層 UI 通知呈現（toast＋HUD 常駐警示圖示 `ui.hud.autosaveSuspendedTip`），`autosaveSuspended` 為 session 旗標（本即 app 層、不入 state）。13 §6.11 `report.save.autosaveFailed` 一列改判 **UI-only**（非 Report 機制），逐列註明消費者＝16 §5.3 autosave hook（app 層 toast），字串宜遷入 `ui.notify.*`／`ui.save.*` 命名空間（app 層通知，非 `report.*`）。

- **下游檔案待改清單（本輪 02 已收束，連動改交下游 agent）**：
  - **03**：(a) §3.4.2 severity 分級表補列本輪新收 10 事件（`policy.autoRevoked`／`economy.granaryOverflow` warning；`uprising.ended` info/warning；`diplo.workStopped` info/warning；`court.mediationResult`／`shogunate.nominated`／`shogunate.collapsed` major/critical〔世界級〕；`shogunate.patronLost` 當事勢力 warning；`plot.exposed`／`plot.betrayalActivated` warning/major）——`severityOf(e, playerClanId)` 支援視角別嚴重度。(b) 確認 §3.4.3 `isPlayerRelevant` 對 `clanIds=[]`（`shogunate.collapsed`）與世界級 major 事件之推送（`sev!=='info'` 即入庫，與 `time.*` 空 clanIds 同慣例）。
  - **04**：無本輪連動（戰死時機不涉 04；`district.subjugated.armyId` 為五輪 B 既案）。
  - **05**：(a) §3.2/§3.6 米藏溢出、§3.6 輸送抵達溢出：`發 report.economy.granaryOverflow` → **`emit economy.granaryOverflow{clanId,castleId,food}`**（`food`＝散失石數）。(b) §3.6/§5.2 政策自動廢止：`每廢止一項發 report.policy.autoRevoked` → **`emit policy.autoRevoked{clanId,policyId}`**（每項一則）。(c) §3.8.3 一揆鎮壓/自然平息：`發 report.uprising.suppressed/subsided` → **`emit uprising.ended{districtId,resolved}`**（`clanIds=[郡所屬勢力]`；鎮壓＝`'suppressed'`、自然平息＝`'subsided'`）。
  - **07**：落實六輪裁決 3 戰死框架——§3.4/§3.5/§3.11 三處戰死時機、三 BAL 常數（建議初值如上）、`die(o,'battle',nodeId)` 呼叫；§3.11 step 2「逃脫判定」擴為逃脫／被俘／戰死三分；BAL 常數同步登錄 15。
  - **08**：(a) `dip.workStopped` 更名 **`diplo.workStopped`**（§5.1 步驟 1、§3.6.4/§5.4.3 幕府滅亡中止獻金兩 emit 點），payload `{clanId,target}`。(b) `court.mediationResult` emit（§5.4.2）補 payload `{clanId,targetClanId,success,ceasefireMonths}`。(c) `shogunate.nominated`（§5.4.3）payload `{clanId}`；**新增 `shogunate.patronLost{clanId}` emit**（§3.6.3 月初資格喪失檢查目前僅敘述 `patronClanId=null`、缺 emit，須補）；`shogunate.collapsed`（§5.4.3）payload 空。(d) `plot.exposed`（§5.5.2）補 payload（鏡射 `plot.failed`：`{kind,actorClanId,targetClanId,targetOfficerId,targetCastleId}`）；`plot.betrayalActivated`（§5.5.3）補 payload `{actorClanId,targetClanId,castleId}`。(e) §4.3 事件清單將上列 8 事件由「08 擴充事件（02 尚未收錄）」改註「已收錄 02 §4.19 canonical（六輪裁決 1）」。(f) `diplo.envoyArrived` emit（§5.6）補 `kind`（＝`Proposal.kind`）。
  - **13**：(a) §6.11 事件欄「—」改填 canonical 事件並標視角/分流：`report.policy.autoRevoked`←`policy.autoRevoked`；`report.economy.granaryOverflow`←`economy.granaryOverflow`；`report.uprising.suppressed`←`uprising.ended(suppressed)`、`report.uprising.subsided`←`uprising.ended(subsided)`；`report.diplomacy.workStopped`←`diplo.workStopped`；`report.court.mediationSuccess`←`court.mediationResult(success)`、`report.court.mediationFailed`←`court.mediationResult(!success)`；`report.shogunate.nominated`←`shogunate.nominated`、`report.shogunate.patronLost`←`shogunate.patronLost`、`report.shogunate.collapsed`←`shogunate.collapsed`；`report.plot.betrayalActivated`←`plot.betrayalActivated`；`report.plot.exposed`←`plot.exposed(actor)`、`report.plot.exposedByEnemy`←`plot.exposed(target)`。(b) §3.7 enrichment：`diplo.envoyArrived.{proposal}` 由 `payload.kind` 取型別 i18n（不反查 proposalId）；`court.mediationResult.{months}`＝`payload.ceasefireMonths`。(c) `report.save.autosaveFailed` 一列改判 **UI-only**（非 Report／renderReport），註明消費者＝16 §5.3 autosave hook；字串宜遷 `ui.notify.*`／`ui.save.*`。(d) `court.mediationResult(success)` 與同 tick `pact.signed` 之雙報告去重：由 13 決（renderReport 對源自斡旋的 `pact.signed` 抑制，或接受兩則並存）。(e) `report.shogunate.patronLost` 視角過濾（僅 `e.clanIds.includes(playerClanId)` 者渲染，餘 return null）。
  - **16**：§3.5.6／§5.3 自動存檔失敗降級：`發重大 Report(report.save.autosaveFailed)` → **app 層 UI 通知（toast＋HUD 常駐警示）、不經 core Report、不入 `state.reports`**；`autosaveSuspended` 維持 session 旗標。字串命名與 13 對齊（遷 `ui.notify.*`／`ui.save.*`）。
  ——追記（同日收尾）：六輪下游回寫時發現同型漏網一件——輸送隊被劫（05 §3.6）僅有 13 報告 key（`report.transport.looted`／`report.transport.lootGain` 雙視角）而無 canonical 事件，§4.19 補收
  **`transport.looted{ownerClanId, fromCastleId, toCastleId, byClanId, nodeId, soldiers, gold, food}`**（發出者 05；被劫方／劫方雙視角由 13 §3.7 依 playerClanId 分流；`ownerClanId` 由下方**七輪裁決 1** 補入——被劫方視角分流所需，此追記 payload 同步）；下游：05 §3.6 被劫結算改 emit 此事件、
  13 §6.11 兩列事件欄補填＋§3.7(3) 補分流列、03 §3.4.2/§4.3 補列（warning）。

**2026-07-11 七輪裁決（事件↔報告邊界末輪 dry check 殘項——06/10 未經收束＋8 孤兒報告鍵；02 為裁決主體、只編輯本檔，連動改交下游清單；沿用勘誤台帳語境，無新增台帳項）**：

背景：六輪定案後，末輪 dry check 逐列核對 13 §6.11「事件型別」欄，尋得 8 個仍為「—」之孤兒報告鍵（生產者敘述尚存但無 canonical 事件、於新契約下屬「core 直發 report.*」殘漏），另發現 `transport.looted` 被劫方視角分流缺輸送隊所屬 clanId。先讀各生產者敘述與 13 §6.11 對應列後逐項定案如下。

- **1｜`transport.looted` 增 `ownerClanId: ClanId`**：payload 前置 `ownerClanId`（＝輸送隊所屬 `TransportOrder.clanId`），全文 `{ownerClanId, fromCastleId, toCastleId, byClanId, nodeId, soldiers, gold, food}`。理由：13 §3.7 依 playerClanId 分流「被劫方視角 report.transport.looted」／「劫方視角 report.transport.lootGain」，需同時持有兩造 clanId；`byClanId`（劫方）原已在 payload，`ownerClanId`（被劫方）缺——TransportOrder 於被劫當下即移除、`fromCastleId` 事後亦可能易主，renderReport 於渲染時不可反查所屬，故 owner 必須隨 event 落地。`clanIds=[ownerClanId, byClanId]`（雙方視角）。§4.19 該列與六輪追記已同步更新。下游備忘錄：**05**（§3.6 被劫結算 `emit transport.looted{ ownerClanId: t.clanId, byClanId: 劫方, … }`）／**13**（§3.7 分流判別改依 `payload.ownerClanId===playerClanId`→report.transport.looted、`payload.byClanId===playerClanId`→report.transport.lootGain）／**03**（§3.4.2 `severityOf` 對被劫方視角判 warning、劫方視角判 info）。

- **2｜八個孤兒報告鍵逐一定案**（收錄事件／併入變體／UI-only＋消費者／刪鍵）：

  | 孤兒 report key | 生產者 | 定案 | 理由 |
  |---|---|---|---|
  | `report.clan.succession` | 06 §3.9.3 | **收錄** `clan.succession{clanId, deceasedId: OfficerId, heirId: OfficerId}`，`clanIds=[clanId]`，發出者 06 | 重大核心事實；亡者/繼任者皆持久 OfficerId（亡者紀錄留存 state，渲染時可解析 oldLeader/newLeader）。 |
  | `report.officer.meritReady` | 06 §5.7 | **UI-only**（消費者＝11 武將一覽/詳細卡 badge，直讀 state） | 條件 `o.merit ≥ rankMeritThresholds[nextRank]` 為 **state 可衍生**，badge 直讀即可、無須事件；報告匣價值低。06 §5.7 gainMerit 停發該 report。 |
  | `report.proposal.invalid` | 06 §3.11/§5.8 | **併入** `proposal.expired`（payload 加 `reason: 'timeout'\|'invalidated'`） | 二者同實體（Proposal）、同終態（`status='expired'`）、同「具申無效果作廢」語意；差異僅觸發（逾期 vs 採納後 Command 再驗證失敗）與忠誠效果（−1 vs 無），恰由 `reason` 判別表達，不另立事件（最小發明）。13 §3.7 依 `reason` 分流 report.proposal.expired（timeout）／report.proposal.invalid（invalidated）。 |
  | `report.victory.tenkabitoProgress` | 10 §6.4 | **收錄** `victory.tenkabitoProgress{clanId, months: number}`，`clanIds=[clanId]`，info 級，發出者 10 | 核心模擬進度事實（`tenkabitoStreakMonths ≥ 6` 起每月一則）。 |
  | `report.field.rout` | 07 §3.4 | **收錄** `army.routed{armyId, clanId, nodeId: MapNodeId}`，`clanIds=[clanId]`，發出者 07 | 潰走轉 `status='routed'` 為核心事實；`{army}` 經 armyId 於部隊存活期間解析（13 transient-timing enrichment，同 army.departed/arrived/blocked 慣例）。07 §3.4 為潰走行為單一擁有者（四輪 E20）、合戰 §3.9 戰後轉 routed 亦適用同事件。 |
  | `report.siege.relief` | 07 §3.3 援軍解圍 | **收錄** `siege.relief{siegeId, castleId}`，`clanIds=[圍城方,守城方]`，發出者 07（**推翻**任務傾向之「併入 siege.ended{fallen:false}」） | 推翻理由：字串「援軍抵達{castle}，展開解圍戰！」係解圍野戰**開始**（`Siege.interrupted=true`）之時刻，非解圍**成功**；siege.ended{fallen:false}（圍城方全潰走/撤退）為解圍成功之時刻、且該變體槽已由 report.siege.repelled 佔用——時刻與槽位皆衝突，不可併入。render 不可反查已結束/已解除中斷之 Siege，故此獨立時刻須以事件（含持久 castleId）承載。與同 tick 併發之 battle.started→report.field.begin 去重由 13 定（比照六輪 1 之 mediation+pact.signed）。 |
  | `report.officer.recruitFailed` | 06 §3.7.1 | **收錄** `officer.recruitFailed{officerId, executorId: OfficerId, clanId}`，`clanIds=[clanId]`，發出者 06（**推翻**任務傾向之 UI-only） | 06 §3.7.1 雖為「即時判定（rng.misc）」，然此為 **core 內部決定論結果**、非 state 可衍生（失敗後僅留 `recruitRetryOn`＋扣金，無法據以推導「剛失敗」），與 meritReady 之 state 可衍生 badge 本質不同，故不可 UI-only、須事件承載；且與成功之 officer.recruited→report.officer.recruited 對稱、90 日冷卻＋禮金損失屬值得存檔之後果。`officerId`＝婉拒之浪人、`executorId`＝登用者、`clanId`＝登用勢力。 |
  | `report.diplomacy.proposalAccepted` | 08 §5.3.2 | **刪鍵** | 08 §5.3.2 我方提案獲受：締約類（alliance/ceasefire/marriage/vassal，含 demand/offerVassal）→ emit `pact.signed`；requestReinforce → emit `diplo.reinforceAgreed`——全部接受分支皆已有 canonical 事件覆蓋，report.diplomacy.proposalAccepted 冗餘。13 §6.11 移除該列；13 §3.7 補「我方為提案方時 pact.signed/diplo.reinforceAgreed 之提案方視角措辭」說明（pactSigned 第三人稱字串已通用，proposer-view 為 nice-to-have、不新增 key）。註：report.diplomacy.proposalRejected 保留（其唯一事件源 diplo.refused 無替代、非冗餘），與本項不對稱屬合理。 |

- **3｜合戰大勝捕獲敵將（07 §3.14 時機 2 補捕獲判定；02 不改）**：06 §3.7.2（L332「捕虜的產生條件見 07——合戰大勝、攻城落城時機率捕獲敵將」）與捕虜處置 modal（06 §6.2「合戰/攻城結束產生捕虜時彈出」）預設「合戰」捕獲存在；07 §3.14 現況時機 2（合戰敗北）僅判戰死（`BAL.battleDeathChanceDefeatGeneral`）、時機 3（落城）方有捕獲——合戰捕獲為懸空缺口。裁決：**07 §3.14 時機 2 補合戰敗將捕獲判定**——敗方潰走/遭殲滅部隊之大將先擲戰死；未死者再擲捕獲（機率為新 BAL 常數、建議初值由 07 定，`rng.misc` 同流），命中則 emit `officer.captured{officerId, byClanId}`（既有 canonical），關押城由 07 讀語境定（傾向勝方大將 originCastle）。02 不改（officer.captured 已 canonical；`officer.captured`／`officer.died` 互斥沿 07 §3.14「戰死者不另發 officer.captured」）。BAL 常數同步登錄 15。

- **4｜備忘錄併記（02 不改，下游落實）**：
  - **03**：§3.5.2 `rng.misc` 消費者表補列「Step 8 戰死／逃脫／捕獲（07 §3.14）」——現表僅列 Step 4/7/9；07 §3.14 之戰死/逃脫/捕獲擲骰明訂走 `rng.misc`（非 `rng.battle`，因係策略層 Officer 狀態變更）、落於 Step 8 military.combat，須登錄為 misc 消費者。
  - **13**：`court.mediationResult` 視角分流補全——比照 plot.exposed（actor/target 雙 key）為 `clanIds=[clanId(斡旋發起方), targetClanId]` 補「對象方（targetClanId）／第三方視角」措辭（現 report.court.mediationSuccess/Failed 字串為發起方視角）。
  - **17**：§3.4.5 S3（落城強攻）期望「發 `report.siege.fallen` 報告」改判「發 `siege.ended` 事件（`fallen:true`）」斷言（新契約 core 不發 report.* key，五輪 A；報告由 13 renderReport 渲染時導出）。

- **下游檔案待改清單（本輪 02 已收束，連動改交下游 agent）**：
  - **02（本檔，已改）**：§4.19 新增 `clan.succession`／`officer.recruitFailed`／`siege.relief`／`army.routed`／`victory.tenkabitoProgress` 五列、`proposal.expired` 增 `reason`、`transport.looted` 增 `ownerClanId`；表後補七輪收錄 blockquote；六輪 transport.looted 追記 payload 同步。
  - **05**：§3.6 被劫結算 emit `transport.looted` 帶 `ownerClanId: t.clanId`。
  - **06**：(a) §3.9.3 家督繼承 `發報告 report.clan.succession` → `emit clan.succession{clanId, deceasedId, heirId}`。(b) §5.7 gainMerit `發報告 report.officer.meritReady` 刪除（改 UI badge 直讀 state）。(c) §5.8 applyResolveProposal 採納再驗證失敗 `發報告 report.proposal.invalid` → `emit proposal.expired{proposalId, officerId, reason:'invalidated'}`；proposalsSystem 逾期分支 `emit proposal.expired{…, reason:'timeout'}`。(d) §3.7.1 登用失敗 `發報告 report.officer.recruitFailed` → `emit officer.recruitFailed{officerId, executorId, clanId}`。
  - **07**：(a) §3.4 潰走轉 routed／§3.9 合戰戰後轉 routed 處 `emit army.routed{armyId, clanId, nodeId}`。(b) §3.3 援軍解圍 `Siege.interrupted=true` 處 `emit siege.relief{siegeId, castleId}`（`clanIds=[圍城方,守城方]`）。(c) §3.14 時機 2 補合戰敗將捕獲判定（戰死未死者再擲捕獲、新 BAL 常數建議初值、emit officer.captured、關押城語境）；BAL 常數登錄 15。字串 report.field.rout／report.siege.relief 仍歸 07 §6.5。
  - **10**：§6.4 `發 info 報告 report.victory.tenkabitoProgress` → `emit victory.tenkabitoProgress{clanId, months}`（`tenkabitoStreakMonths ≥ 6` 起每月）。
  - **13**：(a) §6.11 事件欄「—」改填 canonical：report.clan.succession←clan.succession；report.field.rout←army.routed；report.siege.relief←siege.relief；report.victory.tenkabitoProgress←victory.tenkabitoProgress；report.proposal.expired←proposal.expired(timeout)、report.proposal.invalid←proposal.expired(invalidated)；report.officer.recruitFailed←officer.recruitFailed。(b) report.officer.meritReady 一列改判 **UI-only**（消費者＝11 武將一覽/詳細卡 badge，直讀 state、非 renderReport），字串留 report.* 或遷 ui.* 由 13 定。(c) **刪** report.diplomacy.proposalAccepted 一列（由 pact.signed／diplo.reinforceAgreed 覆蓋）；§3.7 補提案方視角措辭說明。(d) §3.7 transport.looted 分流改依 ownerClanId/byClanId（本輪 1）。(e) court.mediationResult 視角分流補 target/第三方（比照 plot.exposed，本輪 4）。(f) §3.7 siege.relief 與同 tick battle.started→report.field.begin 去重由 13 定。
  - **11**：武將一覽／詳細卡新增「功績達門檻可推舉」badge（直讀 state `o.merit ≥ rankMeritThresholds[nextRank]`，替代 report.officer.meritReady）。
  - **15**：登錄 07 新增之合戰捕獲機率 BAL 常數（建議初值由 07 定）。
  - **16**：無本輪連動。
  - **17**：§3.4.5 S3 期望改 `siege.ended`（fallen:true）事件斷言（本輪 4）。
