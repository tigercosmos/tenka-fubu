# 10 — 事件、大命與勝敗（Events, Taimei & Victory）

> 依 `plan/00-foundations.md`（下稱 00）§13 規範撰寫。本文件是**事件引擎、史實事件、
> 汎用事件、大命系統、勝敗判定與結局**的單一真相來源（00 §7）。
> 型別命名以 `plan/02-data-model.md`（下稱 02）為準（優先序 00 > 02 > 15 > 本文件）。

---

## 1. 目的與範圍

本文件定義：

1. **事件引擎**：`EventDef` 資料結構、條件 DSL、`EffectOp` 效果操作表、檢查時機
   （每月 1 日＋hook 訊號）、玩家選擇與 AI 選擇的解決流程。
2. **史實事件 15 份完整規格**：觸發條件、繁中 cutscene 文本、選項、效果、雙方皆 AI 時的處理。
3. **汎用事件表**（機率型）：豐作／凶作、地震、疫病、南蠻商人來航、鐵砲商人；一揆之連動說明。
4. **大命系統**：解鎖、發動、持續、冷卻、8 種大命型錄與效果公式、對其他系統的掛鉤介面。
5. **勝敗判定**：勝利條件 A（天下統一）／B（天下人）、敗北條件、勢力滅亡結算、
   結局畫面資料協定、勝利後續玩與敗北觀戰。
6. 與 UI 的介面：事件 cutscene modal（EventModal）的資料協定（畫面佈局見 11）。

**不在**本文件範圍：一揆的判定與效果（`plan/05-domestic.md` §3.8）、威風（`plan/07-military.md`
§3.10）、家督繼承順位（`plan/06-officers.md` §3.9.3）、EventModal 佈局與打字機效果
（`plan/11-ui-screens.md` §3.12.1）、事件 JSON 的 zod schema 落地（`plan/14-scenario-data.md`）。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/02-data-model.md` | `EventsState`／`TaimeiState`／`CmdResolveEventChoice`／`CmdInvokeTaimei`／`event.fired` 等型別與事件名以 02 為準；本文件 §4.6 對 `EventsState` 的擴充欄位為 canonical，02 §4.16 收錄時以本節為準（見 §8 D11）。 |
| `plan/03-game-loop.md` | 事件系統掛載於 Step 3、勝敗於 Step 12（00 §5.4）；modal 時間凍結契約（03 §3.7.3）；本文件 §5.6 補充 pendingChoice 的解凍判定式。 |
| `plan/04-map-and-movement.md` | 大命「疾風迅雷」的行軍速度乘數掛鉤（§3.7.4）。 |
| `plan/05-domestic.md` | 豐作／凶作的秋收乘數掛鉤、政策 `pol.nanban`／`pol.kakishuchu` 的事件解鎖旗標（05 §3.7）、大命對徵兵／商業成長／施設工期的乘數掛鉤；一揆規則全歸 05 §3.8。 |
| `plan/06-officers.md` | `killOfficer` 效果操作經由 06 的 `die()` 結算（含家督繼承）；當主死亡無繼承人時 06 設定敗北旗標、本文件 Step 12 收尾。 |
| `plan/07-military.md` | 大命「鐵壁」的攻城防禦乘數掛鉤；合戰／攻城結束時發出 hook 訊號（§3.1.3）。 |
| `plan/08-diplomacy.md` | `declareWar` 效果操作寫入 `lastHostileDay`（08 §3 的 atWar 推導）；`signPact`／`breakPact` 語意；幕府役職對事件額外選項的解鎖（08 §3.6）。 |
| `plan/09-ai.md` | AI 大名何時發動大命、事件選項權重的消費端；勢力滅亡時的 AI 清理 hook。 |
| `plan/11-ui-screens.md` | EventModal（§3.12.1）、EndingScreen（§3.12.3）讀取本文件 §6.1／§6.2 的資料協定。 |
| `plan/14-scenario-data.md` | `src/data/scenarios/s1560/events.json` 承載本文件 §3.5／§3.6 的事件資料；schema 對應 §4.1。 |
| `plan/15-balance.md` | 本文件 `BAL.*` 建議初值的定案主表。 |

---

## 3. 設計細節

### 3.1 事件引擎總覽

#### 3.1.1 事件的兩類

| 類別 | `kind` | 觸發 | 次數 | 例 |
|---|---|---|---|---|
| 史實事件 | `historical` | 日期窗＋條件（全部具名實體） | 一生一次（`once=true`） | 桶狹間、本能寺 |
| 汎用事件 | `generic` | 機率＋條件（含 `$clan` 等綁定符） | 可重複，受冷卻限制 | 豐作、地震 |

**靜默略過原則（canonical）**：日期窗已到但條件不符 → 本次檢查直接跳過，不發任何事件、
不記錄任何狀態；日期窗整個過去仍未觸發 → 該事件永遠不再觸發（`fired` 不記錄，自然失效）。

#### 3.1.2 檢查時機（canonical）

事件判定全部在 `advanceDay` **Step 3**（00 §5.4）內執行，時機分三種：

| `check` 值 | 判定時機 | 用途 |
|---|---|---|
| `monthStart` | 每月 1 日 | 預設；全部史實事件與多數汎用事件 |
| `harvest` | 每年 9 月 1 日（Step 3 在 Step 6 秋收之前，同 tick 生效） | 豐作／凶作 |
| `hook` | 收到對應 hook 訊號的次一個 tick | 需要即時反應的條件式事件（美濃攻略等） |

03 §3.2.3 Step 3 敘述的「汎用事件每日」以本表為定案：Step 3 每日都被呼叫，
但**判定閘控**為月初／9/1／hook 訊號三種（理由見 §8 D6）。一揆判定不屬本引擎，
由 05 §3.8.2 於 Step 3 內以 `rng.event` 自行執行（呼叫順序：先本引擎、後一揆判定）。

#### 3.1.3 hook 訊號（EventHookSignal）

各系統在事實發生當下呼叫 `signalHook(state, signal)`（events 模組匯出的純函式，
僅 push 進 `state.events.hookSignals`），**次一個 tick 的 Step 3** 統一消費後清空：

| `EventHookKind` | 發出者（呼叫點） | payload |
|---|---|---|
| `castleFallen` | 07 攻城陷落、`transferCastle` 效果操作、04 制壓不發（郡不算城） | `castleId, fromClanId, toClanId` |
| `clanDestroyed` | 本文件 §3.8.3 滅亡結算 | `clanId` |
| `leaderDied` | 06 §3.9 當主死亡結算 | `clanId, officerId` |
| `battleEnded` | 07 野戰／合戰結束結算 | `winnerClanId(null可), clanIds[2], playerInvolved: boolean` |

訊號存於 state（可序列化，決定論安全）。`battleEnded` 另供 §3.8.5 結局統計累計。

#### 3.1.4 觸發流程（單一 tick 內）

1. 依 `(priority 降冪, id 字典序升冪)` 排序全部未失效 `EventDef` 逐一檢查（決定論）。
2. 過閘：日期窗 → `once`/`fired` → 冷卻 → 檢查時機（§3.1.2）→ 綁定具體化（§3.2.3）→
   條件 AND 全過 → `probability` 擲骰（`rng.event.chance`）。
3. 觸發：記錄 `fired[id] = 今日`（`once=true` 者）、寫入冷卻、發 `event.fired { eventId, hasChoice }`。
4. 效果解決：
   - **無選項事件**（`choices=[]`）：立即套用 `effects`。UI 端據 `event.fired` 排入
     EventModal（單顆［繼續］鈕），不凍結時間（03 §3.7.3）。
   - **有選項、選擇權勢力為 AI**：立即以 aiWeight 加權抽選（§3.4.2）並套用該選項效果，
     不凍結時間。
   - **有選項、選擇權勢力為玩家**：寫入 `pendingChoiceEventId`（＋綁定），時間凍結
     （03 §3.7.1），等待 `CmdResolveEventChoice`。
5. **每 tick 至多一件「待玩家選擇」事件**：一旦寫入 pendingChoice，本 tick 停止後續檢查；
   其餘符合條件者次日（或下個月初）再檢查。無選項事件不受此限（同日可觸發多件，UI 依
   modalQueue 依序呈現，11 §3.14.2）。

### 3.2 條件 DSL（EventCondition）

全部條件為對 `GameState` 的純謂詞，**不消費亂數**（03 §3.5.4 禁令 2）。多條件間為 AND；
OR 與 NOT 以組合子表達。可出現於 `trigger.conditions` 與 `EventChoice.conditions`。

```ts
// src/core/systems/events/conditions.ts
export type EventCondition =
  // ── 勢力 ──
  | { kind: 'clanAlive';        clanId: ClanRef }                       // 勢力存活
  | { kind: 'clanIsPlayer';     clanId: ClanRef; value: boolean }       // 是否玩家勢力
  | { kind: 'clanGoldAtLeast';  clanId: ClanRef; value: number }        // 金錢 ≥ value（貫）
  | { kind: 'prestigeAtLeast';  clanId: ClanRef; value: number }        // 威信 ≥ value
  | { kind: 'castleCountAtLeast'; clanId: ClanRef; count: number }      // 持城數 ≥ count
  | { kind: 'kokudakaShareAtLeast'; clanId: ClanRef; percent: number }  // 石高占全國比 ≥ percent（%）
  | { kind: 'clanOwnsCoastalCastle'; clanId: ClanRef }                  // 持有臨海城（05 Castle.coastal）
  | { kind: 'ownsProvince';     clanId: ClanRef; provinceId: ProvinceId } // 持有該國全部城
  // ── 城／郡 ──
  | { kind: 'castleOwner';      castleId: CastleId; clanId: ClanRef }   // 城歸屬
  // ── 武將 ──
  | { kind: 'officerAlive';     officerId: OfficerId }                  // status ≠ 'dead'
  | { kind: 'officerServes';    officerId: OfficerId; clanId: ClanRef } // 在世且仕於該勢力
  | { kind: 'officerIsLeader';  officerId: OfficerId; clanId: ClanRef } // 為該勢力當主
  | { kind: 'officerInProvinces'; officerId: OfficerId; provinceIds: ProvinceId[] }
    // 武將所在城（locationCastleId）屬列舉國之一；出陣中（armyId ≠ null）視為不成立
  // ── 外交／朝廷／幕府 ──
  | { kind: 'atWar';            a: ClanRef; b: ClanRef }                // 08 §3 交戰中推導
  | { kind: 'pactExists';       a: ClanRef; b: ClanRef; pact: PactKind }
  | { kind: 'shogunateExists';  value: boolean }
  | { kind: 'shogunateTitleAtLeast'; clanId: ClanRef; title: ShogunateTitle }
    // 依 02 §3.3 列舉順序比較（none < hokoshu < otomoshu < shobanshu < kanrei < fukushogun < shogun）
  | { kind: 'courtRankAtLeast'; clanId: ClanRef; rank: CourtRank }
  // ── 事件狀態 ──
  | { kind: 'flag';             key: string; min: number }              // flags[key] ?? 0 ≥ min
  | { kind: 'eventFired';       eventId: EventId }                      // 該事件已觸發
  // ── 組合子 ──
  | { kind: 'not';              cond: EventCondition }
  | { kind: 'any';              conds: EventCondition[] };              // OR（非空）

/** ClanRef：具體 ClanId，或綁定符（僅汎用事件可用；§3.2.3） */
export type ClanRef = ClanId | '$clan';
```

#### 3.2.1 語意細則（邊界條件）

- 引用的實體 ID 不存在（劇本缺資料）→ 條件視為 **false**（防禦性；14 的驗證器會另行報錯）。
- `clanAlive` 對 `alive=false` 勢力為 false；其他以勢力為主詞的條件在該勢力已滅亡時一律 false。
- `officerServes` 要求 `status='serving' && clanId=目標`；捕虜、浪人、未元服皆 false。
- `ownsProvince`：該國**至少一座城**且全部城 `ownerClanId` = 目標勢力（空國不存在，14 保證每國 ≥1 城）。
- `kokudakaShareAtLeast`：`clanKokudaka(clan) / Σ全部郡 kokudaka × 100 ≥ percent`（02 §5.1 selector）。
- `flag`：布林旗標以 0/1 儲存（§4.6），`min:1` 即「旗標為真」。

#### 3.2.2 京畿的定義（canonical）

「京畿」＝五畿內國：`prov.yamashiro`（山城）、`prov.yamato`（大和）、`prov.kawachi`（河內）、
`prov.izumi`（和泉）、`prov.settsu`（攝津）。常數 `KINAI_PROVINCE_IDS` 定義於
`src/core/systems/events/catalog.ts`，本能寺之變與天下人條件引用之。

#### 3.2.3 綁定（EventBinding；僅汎用事件）

汎用事件的條件與效果可用綁定符 `'$clan'`／`'$castle'`／`'$district'`。Step 3 檢查該事件時：

1. 依 `def.target` 產生候選清單（§3.6 各事件指明），以 id 字典序排序。
2. `target='player'` → 綁定玩家勢力；`target='eachClan'` → 依字典序逐勢力各自檢查與擲骰
   （每勢力獨立冷卻，冷卻 key 加 `.<clanId>` 後綴）；`target='randomDistrict'` 等 →
   以 `rng.event.pick` 自候選抽一。
3. 綁定結果 `EventBinding { clanId, castleId | null, districtId | null }` 供條件求值、
   效果套用與文本插值（§6.1）使用；玩家待選事件將綁定存於 `pendingChoiceBinding`。

史實事件一律使用具體 ID，綁定恆為 `{ clanId: ownerClanId, castleId: null, districtId: null }`。

### 3.3 效果操作表（EffectOp）

效果是宣告式操作序列，依陣列順序套用。**防禦性 no-op 原則（canonical）**：操作引用的實體
不存在、已死亡、已滅亡，或數值已在邊界 → 該操作靜默跳過（不擲例外、不發事件；理由見 §8 D9）。
所有數值寫入遵守 02 INV-16 的範圍 clamp 與取整。

```ts
// src/core/systems/events/effects.ts
export type EffectOp =
  // ── 資源 ──
  | { op: 'addGold';     clanId: ClanRef; amount: number }   // 貫，可負；clamp ≥0
  | { op: 'addFood';     castleId: CastleId; amount: number }// 石，可負；clamp 0..castleFoodCap
  | { op: 'addSoldiers'; castleId: CastleId; amount: number }// 人，可負；clamp 0..castleMaxSoldiers
  | { op: 'reduceClanSoldiersPct'; clanId: ClanRef; pct: number }
    // 該勢力全部城與部隊兵力 ×(1−pct/100) 取整（劇本式戰損；pct 0..100）
  | { op: 'addPrestige'; clanId: ClanRef; amount: number }   // 威信，可負；clamp 0..BAL.prestigeMax
  // ── 武將 ──
  | { op: 'addLoyalty';      officerId: OfficerId; amount: number }  // clamp 0..100；當主恆 100 不動
  | { op: 'addClanLoyalty';  clanId: ClanRef; amount: number }       // 該勢力全 serving 武將（當主除外）
  | { op: 'addMerit';        officerId: OfficerId; amount: number }  // 功績 ≥0
  | { op: 'transferOfficer'; officerId: OfficerId; toClanId: ClanId }
    // 移籍：serving/ronin → 目標勢力 serving；解除原職（城主/領主/軍團長）與部隊隸屬
    //（出陣中則兵歸建原勢力最近我城、武將移籍）；忠誠設 BAL.evtTransferLoyalty(=60)
  | { op: 'makeRonin';       officerId: OfficerId }
    // 出奔成浪人：解除全部職務與所屬，status='ronin'、clanId=null、寄寓於原所在城
  | { op: 'killOfficer';     officerId: OfficerId; cause: 'age' | 'battle' | 'execution' }
    // 一律經由 06 的 die(officerId, cause) 結算（含解職、家督繼承、officer.died 事件）
  | { op: 'renameOfficer';   officerId: OfficerId; name: string }    // 僅改顯示名，id 不變
  // ── 外交 ──
  | { op: 'addSentiment'; from: ClanRef; to: ClanRef; amount: number } // 感情，clamp 0..100
  | { op: 'addTrust';     from: ClanRef; to: ClanRef; amount: number } // 信用，clamp 0..100
  | { op: 'declareWar';   a: ClanRef; b: ClanRef }
    // 宣戰：materialize 外交列、雙方 lastHostileDay=今日（進入 atWar，08 §3）、
    // 雙方感情各 −BAL.evtDeclareWarSentiment(=20)；既有停戰/同盟/婚姻協定即時消滅（不加毀約懲罰）
  | { op: 'signPact';     a: ClanRef; b: ClanRef; pact: PactKind; months: number | null;
      vassalClanId: ClanId | null }
    // 締結協定（事件強制成立，不消耗信用）；months=null 僅 marriage/vassal（02 INV-17）
  | { op: 'breakPact';    a: ClanRef; b: ClanRef; pact: PactKind }
    // 事件解約：協定消滅，不施加 08 §3.4 的毀約信用/威信懲罰（史實劇本效果）
  // ── 城與領土 ──
  | { op: 'transferCastle'; castleId: CastleId; toClanId: ClanId }
    // 城歸屬轉移：城與其全部轄郡 ownerClanId=目標；駐兵/兵糧/施設隨城；城主與轄郡領主解職
    //（武將仍屬原勢力、駐在地改為原勢力最近我城，無城則成浪人）；corpsId=null；
    // 設 meta.territoryChangedToday=true；發 castleFallen hook 訊號
  | { op: 'renameCastle';   castleId: CastleId; name: string }
  | { op: 'renameClan';     clanId: ClanRef; name: string }
  | { op: 'addCastleMorale';      castleId: CastleId; amount: number } // clamp 0..100
  | { op: 'addClanCastlesMorale'; clanId: ClanRef; amount: number }    // 該勢力全城
  | { op: 'addCastleDurability';  castleId: CastleId; amount: number } // clamp 0..maxDurability
  | { op: 'scaleCastleDurability'; castleId: CastleId; pct: number }   // ×(1−pct/100)，地震用
  | { op: 'addDistrictOrder';   districtId: DistrictId; amount: number } // 治安 clamp 0..100
  | { op: 'addClanOrder';       clanId: ClanRef; amount: number }        // 該勢力全郡治安
  | { op: 'scalePopulation';    districtId: DistrictId; pct: number }    // 人口 ×(1−pct/100)
  // ── 朝廷與幕府 ──
  | { op: 'addCourtFavor'; clanId: ClanRef; amount: number }             // clamp 0..100
  | { op: 'grantCourtRank'; clanId: ClanRef; rank: CourtRank }           // 直授（不經獻金流程）
  | { op: 'grantShogunateTitle'; clanId: ClanRef; title: ShogunateTitle }
  | { op: 'endShogunate' }
    // 幕府滅亡：shogunateExists=false、shogunClanId=null、全勢力 shogunateTitle='none'、
    // 依 08 §3.6.4 收回役職威信加成
  // ── 事件狀態 ──
  | { op: 'setFlag'; key: string; value: number };                       // flags[key]=value（整數）
```

**效果操作不含**：建立新勢力、生成部隊、直接開啟合戰——這三者實作與驗證成本過高，
15 份史實事件全部以上表操作組合表達（見 §8 D4）。效果套用產生的衍生事件
（`officer.died`、`pact.signed`……）照各系統規則正常發出。

### 3.4 選項與 AI 選擇

#### 3.4.1 選項結構

每個 `EventChoice` 含：`label`（繁中按鈕字）、`conditions`（不符 → 按鈕反灰，tooltip 顯示
`ui.event.choiceLocked`）、`effects`、`aiWeight`（≥0 整數）。選項效果與事件層 `effects` 的關係：
**先套用事件層 `effects`（共通效果），再套用被選選項的 `effects`**。

#### 3.4.2 選擇權與 AI 解決

- `EventDef.ownerCandidates: ClanId[]`：選擇權歸屬候選（依序）。求值規則：
  清單中第一個「存活且為玩家勢力」者 → 玩家選擇；否則取清單第一個存活勢力，由 AI 解決。
  空清單＝純敘事（不可有選項）。
- AI 解決：過濾 `conditions` 成立且 `aiWeight > 0` 的選項，依權重以
  `rng.event.nextInt(1, ΣaiWeight)` 加權抽選；若無合格選項，取 index 最小的條件成立選項；
  仍無 → 只套用事件層共通效果。
- 玩家解決：`CmdResolveEventChoice { eventId, choiceIndex }` 於 Step 1 套用（§5.3）。

### 3.5 史實事件 15 份完整規格

共通規定：全部 `kind:'historical'`、`once:true`、`priority` 如各表、`probability:1.0`
（例外於個別事件註明）、`check:'monthStart'`（例外註明 hook）。日期窗以劇本曆
`{年/月/日}` 標示，載入時經 02 §5.6 `calendarToDay` 換算。文本為 `cutscene.body` 定案字串
（打字機呈現，11 §3.12.1）；`cutscene.title` 同表首行。`monClanId` 為家紋浮水印勢力。
「AI 處理」欄描述選擇權勢力為 AI 時的加權結果與雙方皆 AI 的淨效果。

以下實體 ID 為對 `plan/14-scenario-data.md` 的**資料需求**（s1560 劇本必須包含）：
`clan.oda / clan.imagawa / clan.matsudaira / clan.takeda / clan.nagao / clan.ashikaga /
clan.azai / clan.asakura / clan.mori / clan.miyoshi`；武將與城見各事件。
另：s1560 開局時 `clan.matsudaira`（松平家，當主 off.matsudaira-motoyasu）即以獨立勢力存在，
並與 `clan.imagawa` 有 `vassal` 協定（松平為從屬方，endDay=null）——此為事件 3 的前提（§8 D5）。

---

#### 事件 1｜evt.okehazama　桶狹間之戰

| 項目 | 內容 |
|---|---|
| 日期窗 | 1560/5/1 ～ 1560/5/30（月初檢查 → 實際於 1560/5/1 觸發） |
| priority | 100 |
| 條件 | `clanAlive(clan.oda)`、`clanAlive(clan.imagawa)`、`officerIsLeader(off.imagawa-yoshimoto, clan.imagawa)`、`officerIsLeader(off.oda-nobunaga, clan.oda)`、`not(pactExists(oda, imagawa, ceasefire))`、`not(pactExists(oda, imagawa, alliance))` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.oda` |

**文本**（title：`永祿三年五月　桶狹間`）：
「今川治部大輔義元，親率大軍二萬五千，自駿府踏上上洛之途。沓掛、丸根、鷲津諸砦相繼陷落，
尾張危如累卵。清洲城內，眾臣或言籠城、或言請和，議論紛紛。信長獨坐良久，忽而起身，
舞《敦盛》一曲——『人間五十年，與化天相較，如夢又似幻。』天將破曉，暴雨驟至。
斥候來報：義元本陣，正在田樂狹間歇馬。」

**共通效果**：`declareWar(oda, imagawa)`。

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 乘雨奇襲田樂狹間！ | — | `killOfficer(off.imagawa-yoshimoto,'battle')`、`reduceClanSoldiersPct(imagawa,20)`、`addClanCastlesMorale(imagawa,-30)`、`addPrestige(oda,+200)`、`addPrestige(imagawa,-150)`、`addMerit(off.shibata-katsuie,+150)`、`addMerit(off.kinoshita-tokichiro,+100)`、`setFlag('okehazama-win',1)` | 1 |
| B | 憑清洲之固，靜觀其變 | — | `addClanCastlesMorale(oda,-10)`、`addPrestige(oda,-50)` | 0 |

**AI 處理**：織田為 AI 時必選 A（史實鎖定）。雙方皆 AI → 義元戰死、今川家督由 06 繼承規則
交由氏真、今川全城士氣崩落，之後的攻防由大名 AI 常規邏輯接手。玩家扮演今川時亦然：
選擇權屬織田，義元之死為劇本開局的十字路口（§8 D10）。

---

#### 事件 2｜evt.kawanakajima4　第四次川中島

| 項目 | 內容 |
|---|---|
| 日期窗 | 1561/9/1 ～ 1561/10/30 |
| priority | 90 |
| 條件 | `officerIsLeader(off.takeda-shingen, clan.takeda)`、`officerIsLeader(off.nagao-kagetora, clan.nagao)`、`not(pactExists(takeda, nagao, alliance))`、`not(pactExists(takeda, nagao, ceasefire))` |
| ownerCandidates | `[clan.takeda, clan.nagao]` |
| monClanId | `clan.takeda` |

**文本**（title：`永祿四年九月　川中島`）：
「千曲川畔，霧鎖八幡原。長尾景虎盡起越後精兵，布車懸之陣；武田信玄倚啄木鳥之計，
分軍夜襲妻女山。豈料霧散之際，越軍已臨眼前——單騎白袍，直取本陣，三太刀斬向信玄，
信玄舉軍配相格。龍虎相搏，血染秋水。此一戰，將決定信濃的歸屬，亦將耗盡兩雄的歲月。」

**共通效果**：`declareWar(takeda, nagao)`、`renameOfficer(off.nagao-kagetora,'上杉謙信')`、
`renameClan(clan.nagao,'上杉家')`。

**選項**（`$clan`＝選擇權勢力）：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 決戰八幡原！ | — | `killOfficer(off.takeda-nobushige,'battle')`、`killOfficer(off.yamamoto-kansuke,'battle')`、`reduceClanSoldiersPct(takeda,15)`、`reduceClanSoldiersPct(nagao,15)`、`addPrestige(takeda,+100)`、`addPrestige(nagao,+100)`、`addSentiment(takeda,nagao,-30)`、`addSentiment(nagao,takeda,-30)` | 1 |
| B | 按兵不動，避其鋒芒 | — | `addPrestige('$clan',-50)`、`addSentiment(takeda,nagao,-10)`、`addSentiment(nagao,takeda,-10)` | 0 |

**AI 處理**：雙方皆 AI → 武田方（候選第一）選 A：信繁、勘助戰死，兩軍各折 15%，
兩家進入交戰。玩家任一方時由玩家決定是否承受史實損耗換取威信。

---

#### 事件 3｜evt.kiyosu-domei　三河獨立與清洲同盟

| 項目 | 內容 |
|---|---|
| 日期窗 | 1562/1/1 ～ 1563/12/30 |
| priority | 90 |
| 條件 | `eventFired(evt.okehazama)`、`flag('okehazama-win',1)`、`clanAlive(clan.oda)`、`officerIsLeader(off.matsudaira-motoyasu, clan.matsudaira)`、`pactExists(matsudaira, imagawa, vassal)` |
| ownerCandidates | `[clan.oda, clan.matsudaira]` |
| monClanId | `clan.matsudaira` |

**文本**（title：`永祿五年正月　清洲城`）：
「桶狹間一戰，義元橫死，今川的威望隨之崩解。岡崎城的松平元康趁勢收復三河舊領，
不再對駿府俯首。此時，織田家的使者石川數正往來清洲與岡崎之間，攜來信長的口信：
『與其相爭於尾三之境，不如攜手共望天下。』昔日人質歲月的舊識，今日兩國之主——
元康立於清洲城下，天下的棋局悄然改變。」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 締結清洲同盟 | — | `breakPact(matsudaira, imagawa, vassal)`、`declareWar(matsudaira, imagawa)`、`signPact(oda, matsudaira, alliance, months:240, vassalClanId:null)`、`addSentiment(oda,matsudaira,+30)`、`addSentiment(matsudaira,oda,+30)`、`addTrust(oda,matsudaira,+30)`、`addTrust(matsudaira,oda,+30)`、`renameOfficer(off.matsudaira-motoyasu,'德川家康')`、`renameClan(clan.matsudaira,'德川家')`、`addPrestige(oda,+50)`、`addPrestige(matsudaira,+80)` | 1 |
| B | 各行其道 | — | `addSentiment(oda,matsudaira,-10)`、`addSentiment(matsudaira,oda,-10)` | 0 |

**AI 處理**：雙方皆 AI → 選 A：松平脫離今川從屬、與織田結成 20 年同盟並改稱德川家。
玩家今川無法阻止（選擇權在織田／松平方）。改名合併於本事件一次完成（§8 D5）。

---

#### 事件 4｜evt.yoshiteru-shi　將軍足利義輝橫死（永祿之變）

| 項目 | 內容 |
|---|---|
| 日期窗 | 1565/5/1 ～ 1565/6/30 |
| priority | 80 |
| 條件 | `shogunateExists(true)`、`officerIsLeader(off.ashikaga-yoshiteru, clan.ashikaga)`、`clanAlive(clan.miyoshi)` |
| ownerCandidates | `[]`（純敘事） |
| monClanId | `clan.ashikaga` |

**文本**（title：`永祿八年五月　二條御所`）：
「京都二條御所，喊殺聲驟起。三好三人眾與松永久通率兵萬餘，白晝闖入將軍御所。
第十三代將軍足利義輝，人稱『劍豪將軍』，將愛刀一字排開插於榻榻米上，換刀而戰，
斬敵無數，終究寡不敵眾，血濺御所。幕府的權威，隨著這位將軍的殞落而墜入谷底。
其弟一乘院覺慶（後之義昭）倉皇出奔，流轉諸國，尋求上洛復仇之機。」

**效果**：`killOfficer(off.ashikaga-yoshiteru,'battle')`、`addPrestige(miyoshi,-100)`、
`addCourtFavor(miyoshi,-20)`、`addSentiment(ashikaga,miyoshi,-40)`、
`setFlag('yoshiteru-dead',1)`。

**AI 處理**：無選項；效果一律套用。義輝為足利家當主時由 06 繼承規則自動立義昭
（`off.ashikaga-yoshiaki`，一門）。本事件是事件 6（上洛）的前置。

---

#### 事件 5｜evt.mino-koryaku　美濃攻略與稻葉山城易主

| 項目 | 內容 |
|---|---|
| 日期窗 | 1560/1/1 ～ 1599/12/30（純條件式） |
| 檢查 | `check:'hook'`，訂閱 `castleFallen`（另每月 1 日補檢查，防讀檔漏訊號） |
| priority | 80 |
| 條件 | `castleOwner(castle.inabayama, clan.oda)`、`officerIsLeader(off.oda-nobunaga, clan.oda)` |
| ownerCandidates | `[]`（純敘事） |
| monClanId | `clan.oda` |

**文本**（title：`稻葉山落城　天下布武`）：
「金華山頂的稻葉山城，龍興治下的美濃齋藤氏在此終結。信長入主此城，將其更名為『岐阜』——
取周文王起於岐山、一統天下之典故。自此，信長開始使用一方新印：『天下布武』。
以武家之政權布於天下，這四個字，是宣言，亦是野望。尾張的大傻瓜，如今立於美濃之巔，
眺望的已是京都的方向。」

**效果**：`renameCastle(castle.inabayama,'岐阜城')`、`addPrestige(oda,+150)`、
`addClanLoyalty(oda,+5)`、`setFlag('tenka-fubu',1)`。

**AI 處理**：無選項；織田為 AI 攻下稻葉山城時同樣觸發（威信與忠誠效果照常）。
玩家為齋藤方而守住稻葉山 → 永不觸發（靜默略過）。

---

#### 事件 6｜evt.joraku　信長上洛與義昭將軍

| 項目 | 內容 |
|---|---|
| 日期窗 | 1568/9/1 ～ 1572/12/30 |
| priority | 85 |
| 條件 | `eventFired(evt.mino-koryaku)`、`flag('yoshiteru-dead',1)`、`shogunateExists(true)`、`officerAlive(off.ashikaga-yoshiaki)`、`clanAlive(clan.oda)`、`castleCountAtLeast(clan.oda, 8)` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.oda` |

**文本**（title：`永祿十一年九月　上洛`）：
「流亡的足利義昭，輾轉越前、美濃，終於來到岐阜城下，向信長泣訴：『助我上洛，重興幕府！』
奉將軍家之名上洛，既是大義名分，亦是號令天下的鑰匙。六萬大軍集結於岐阜，
沿途南近江的六角氏聞風而逃，三好勢望風退出京都。九月末，信長奉義昭入洛，
擁立其為第十五代征夷大將軍。將軍感激涕零，欲授信長副將軍或管領之位——」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 辭謝官位，唯取實利 | — | `addPrestige(oda,+300)`、`addCourtFavor(oda,+20)`、`addSentiment(ashikaga,oda,+30)`、`addTrust(oda,ashikaga,+40)`、`declareWar(oda, miyoshi)`、`setFlag('joraku-done',1)` | 2 |
| B | 拜領副將軍之職 | — | `grantShogunateTitle(oda,'fukushogun')`、`addPrestige(oda,+200)`、`addSentiment(ashikaga,oda,+20)`、`declareWar(oda, miyoshi)`、`setFlag('joraku-done',1)` | 1 |

**AI 處理**：織田為 AI → 權重 2:1 傾向史實的 A（辭官）。雙方皆 AI 的淨效果：
織田威信大增、與三好開戰、旗標 `joraku-done` 開啟事件 10 的前置。
織田始終未壯大（城數 < 8）→ 日期窗過後靜默失效，幕府滅亡事件亦連帶不觸發。

---

#### 事件 7｜evt.kanegasaki　金崎撤退

| 項目 | 內容 |
|---|---|
| 日期窗 | 1570/4/1 ～ 1571/12/30 |
| priority | 80 |
| 條件 | `flag('joraku-done',1)`、`atWar(clan.oda, clan.asakura)`、`any([pactExists(oda, azai, alliance), pactExists(oda, azai, marriage)])`、`clanAlive(clan.azai)` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.azai` |

**文本**（title：`元龜元年四月　金崎`）：
「討伐朝倉的軍勢正順利北進，金崎城已然攻落。就在此時，一份急報送抵本陣——
『北近江的淺井長政，舉兵反了。』妹婿背盟，織田軍瞬間陷入朝倉、淺井南北夾擊的死地。
『阿市的夫君，竟然……』信長臉色鐵青。此刻唯有捨棄輜重，火速撤離敦賀。
殿軍——最凶險的任務，木下藤吉郎挺身而出：『請主公先行，殿後之事，交給藤吉郎！』」

**共通效果**：`breakPact(oda, azai, alliance)`、`breakPact(oda, azai, marriage)`、
`declareWar(azai, oda)`、`addSentiment(oda,azai,-40)`。

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 命藤吉郎殿後，本隊速退 | `officerServes(off.kinoshita-tokichiro, clan.oda)` | `reduceClanSoldiersPct(oda,3)`、`addMerit(off.kinoshita-tokichiro,+300)`、`addLoyalty(off.kinoshita-tokichiro,+10)` | 1 |
| B | 全軍強行撤退 | — | `reduceClanSoldiersPct(oda,8)`、`addPrestige(oda,-50)` | 1 |

**AI 處理**：織田為 AI → A、B 等權重（A 需藤吉郎在籍，不在則自動落入 B）。
雙方皆 AI 的淨效果：淺井毀約參戰、織田小幅戰損。前置協定（織田×淺井同盟／婚姻）
從未成立則本事件靜默失效——姉川、比叡山鏈condition 隨之斷開。

---

#### 事件 8｜evt.anegawa　姉川之戰

| 項目 | 內容 |
|---|---|
| 日期窗 | 1570/6/1 ～ 1571/12/30 |
| priority | 79 |
| 條件 | `eventFired(evt.kanegasaki)`、`atWar(clan.oda, clan.azai)`、`clanAlive(clan.azai)`、`clanAlive(clan.asakura)` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.oda` |

**文本**（title：`元龜元年六月　姉川`）：
「為雪金崎之恥，信長親率大軍直指北近江，德川家康亦引兵來援。姉川淺灘之上，
織德聯軍與淺井、朝倉兩軍隔川對峙。六月二十八日拂曉，戰端開啟——淺井猛將磯野員昌
連破織田十一段陣勢，戰況一度危殆；然德川勢自側翼擊潰朝倉軍，戰局逆轉。
川原屍橫遍野，姉川之水為之染赤。」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 與家康並肩，決戰姉川 | — | `reduceClanSoldiersPct(azai,25)`、`reduceClanSoldiersPct(asakura,25)`、`reduceClanSoldiersPct(oda,10)`、`addPrestige(oda,+100)`、`addClanCastlesMorale(azai,-15)`、`addClanCastlesMorale(asakura,-15)`、`addSentiment(oda,matsudaira,+10)`、`addSentiment(matsudaira,oda,+10)` | 1 |
| B | 時機未熟，暫且退兵 | — | `addPrestige(oda,-30)` | 0 |

**AI 處理**：織田為 AI → 必選 A。雙方皆 AI 淨效果：淺井、朝倉軍力重挫，
為其後的滅亡鋪路；織德感情提升。

---

#### 事件 9｜evt.hieizan　比叡山燒討

| 項目 | 內容 |
|---|---|
| 日期窗 | 1571/9/1 ～ 1572/12/30 |
| priority | 78 |
| 條件 | `eventFired(evt.anegawa)`、`any([atWar(clan.oda, clan.azai), atWar(clan.oda, clan.asakura)])`、`clanAlive(clan.oda)` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.oda` |

**文本**（title：`元龜二年九月　比叡山`）：
「比叡山延曆寺——鎮護國家八百年的佛法聖地，如今卻庇護淺井、朝倉的敗軍，
僧兵挾持佛威，屢拒信長的最後通牒。九月十二日，織田軍包圍全山。
『山上之人，僧俗不論，盡數斬殺。』軍令冷冽如霜。諸將面面相覷——燒討聖山，
是要與千年的佛法為敵；然若縱容，叡山永遠是插在京都後背的一把刀。火把已經點燃，
只待主公一聲令下。」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 燒討！佛敵之名，信長一身當之 | — | `addPrestige(oda,+100)`、`addCourtFavor(oda,-20)`、`addClanOrder(oda,-5)`、`addClanCastlesMorale(azai,-10)`、`addClanCastlesMorale(asakura,-10)`、`addSentiment(azai,oda,-20)`、`addSentiment(asakura,oda,-20)`、`setFlag('hieizan-burned',1)` | 2 |
| B | 圍而不攻，斷其糧道 | — | `addPrestige(oda,-30)`、`addCourtFavor(oda,+10)` | 1 |

**AI 處理**：織田為 AI → 權重 2:1 傾向史實燒討。雙方皆 AI 淨效果：織田威信升、
朝廷觀感降、領內治安小幅動盪，淺井朝倉士氣再挫。

---

#### 事件 10｜evt.muromachi-metsubo　室町幕府滅亡

| 項目 | 內容 |
|---|---|
| 日期窗 | 1573/4/1 ～ 1580/12/30 |
| priority | 85 |
| 條件 | `flag('joraku-done',1)`、`shogunateExists(true)`、`ownsProvince(clan.oda, prov.yamashiro)`、`clanAlive(clan.oda)` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.ashikaga` |

**文本**（title：`天正元年七月　幕府終焉`）：
「將軍義昭終究與信長反目。他暗結武田、朝倉、本願寺，編織『信長包圍網』，
甚至親自舉兵，據二條御所與槙島城相抗。然而天下已非將軍的天下——槙島城旋即陷落。
義昭手捧太刀請降，城下眾人皆以為將軍人頭落地之日已至。信長卻只是揮了揮手。
足利尊氏以來二百三十七年，室町幕府的命運，繫於信長一念之間。」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 放逐義昭——幕府，到此為止 | — | `endShogunate`、`addPrestige(oda,+200)`、`setFlag('muromachi-ended',1)` | 2 |
| B | 留將軍為傀儡 | `shogunateTitleAtLeast(clan.oda,'otomoshu')` | `addPrestige(oda,+80)`、`addCourtFavor(oda,+10)`、`grantShogunateTitle(oda,'kanrei')`、`addSentiment(ashikaga,oda,-30)` | 1 |

**AI 處理**：織田為 AI → 權重 2:1 傾向 A（幕府滅亡；役職體系隨之作廢，08 §3.6.4）。
選項 B 需幕府役職「御供眾」以上（08 §3.6 的「幕府相關歷史事件解鎖額外選項」即此），
不符則反灰、AI 亦不可選。

---

#### 事件 11｜evt.nagashino　長篠之戰

| 項目 | 內容 |
|---|---|
| 日期窗 | 1575/5/1 ～ 1576/12/30 |
| priority | 80 |
| 條件 | `officerIsLeader(off.takeda-katsuyori, clan.takeda)`、`pactExists(oda, matsudaira, alliance)`、`any([atWar(clan.takeda, clan.matsudaira), atWar(clan.takeda, clan.oda)])` |
| ownerCandidates | `[clan.oda, clan.matsudaira]` |
| monClanId | `clan.takeda` |

**文本**（title：`天正三年五月　設樂原`）：
「武田勝賴挾信玄遺威，猛攻三河長篠城。城將奧平信昌死守待援，足輕鳥居強右衛門
捨命突圍報信——援軍將至，而他自己被磔於城下。織田、德川聯軍三萬八千進抵設樂原，
連夜設起三重馬防柵，柵後，是三千挺鐵砲。『武田的騎馬軍團天下無雙——所以，
不能讓他們跑起來。』五月二十一日黎明，山縣昌景的赤備隊率先發起突擊，
蹄聲如雷，直撲柵線。」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 三段擊！讓鐵砲終結騎馬的時代 | `clanGoldAtLeast('$clan', 800)` | `addGold('$clan',-800)`、`reduceClanSoldiersPct(takeda,30)`、`killOfficer(off.yamagata-masakage,'battle')`、`killOfficer(off.baba-nobuharu,'battle')`、`killOfficer(off.naito-masatoyo,'battle')`、`addClanCastlesMorale(takeda,-20)`、`addPrestige('$clan',+150)`、`addPrestige(takeda,-150)` | 3 |
| B | 依托柵線，持久對峙 | — | `reduceClanSoldiersPct(takeda,5)`、`reduceClanSoldiersPct('$clan',5)` | 1 |

**AI 處理**：`$clan`＝選擇權勢力（織田優先）。AI 且金錢足夠 → 3:1 傾向 A：
武田折損三成、三名宿將戰死，自此由盛轉衰；金錢不足則自動落入 B（僵持消耗）。

---

#### 事件 12｜evt.honnoji　本能寺之變

| 項目 | 內容 |
|---|---|
| 日期窗 | 1582/6/1 ～ 1590/12/30（條件式） |
| priority | 100 |
| 條件 | `castleCountAtLeast(clan.oda, BAL.evtHonnojiOdaCastleMin=25)`、`officerIsLeader(off.oda-nobunaga, clan.oda)`、`officerServes(off.akechi-mitsuhide, clan.oda)`、`officerInProvinces(off.oda-nobunaga, KINAI_PROVINCE_IDS)` |
| ownerCandidates | `[clan.oda]` |
| monClanId | `clan.oda` |

**文本**（title：`天正十年六月二日　本能寺`）：
「『敵在本能寺！』夜半，京都的天空被火光映紅。明智日向守光秀，率一萬三千大軍
反戈相向，將信長下榻的本能寺圍得水洩不通。近侍森蘭丸疾呼：『是明智軍的水色桔梗旗！』
信長放下手中的茶碗，沉默片刻，只說了一句：『……是非に及ばず（事已至此，多言無益）。』
弓弦已斷、槍桿已折，堂內火勢蔓延。天下布武之夢，是要在這裡化為灰燼，
還是殺出一條血路？」

**選項**：

| # | label | 條件 | 效果 | aiWeight |
|---|---|---|---|---|
| A | 人間五十年——縱身火海（史實） | — | `killOfficer(off.oda-nobunaga,'battle')`、`killOfficer(off.oda-nobutada,'battle')`、`makeRonin(off.akechi-mitsuhide)`、`addClanLoyalty(oda,-15)`、`addPrestige(oda,-300)`、`addClanCastlesMorale(oda,-20)` | 1 |
| B | 殺出重圍！ | — | `makeRonin(off.akechi-mitsuhide)`、`addClanLoyalty(oda,-10)`、`addPrestige(oda,-200)`、`addClanCastlesMorale(oda,-20)` | 0 |

**AI 處理**：織田為 AI → 必選 A：信長、信忠橫死，家督依 06 繼承規則傳承，
光秀出奔為浪人（不另立明智勢力，§8 D4），織田家威信、忠誠、士氣全面動搖——
給其他勢力（含玩家）翻盤之機。玩家織田可選 B 保信長性命，但威信忠誠代價照付。
條件永不齊備（織田不夠大、信長不在京畿、光秀不在籍）→ 靜默略過。

---

#### 事件 13｜evt.takamoto-soshi　毛利隆元早逝

| 項目 | 內容 |
|---|---|
| 日期窗 | 1563/8/1 ～ 1563/9/30 |
| priority | 60 |
| 條件 | `officerServes(off.mori-takamoto, clan.mori)`、`officerAlive(off.mori-takamoto)` |
| ownerCandidates | `[]`（純敘事） |
| monClanId | `clan.mori` |

**文本**（title：`永祿六年八月　安藝吉田`）：
「出雲遠征軍中忽傳噩耗——毛利家當主隆元，於備後和智氏的宴席之後暴斃，得年四十一。
元就聞訊，悲慟逾恆：三子之中，隆元仁厚，最得人心，『三矢之訓』的長矢竟先折斷。
老臣們連夜擁立隆元之子幸鶴丸（輝元）——然主少國疑，西國的重擔，
再度落回年邁的元就肩上。」

**效果**：`killOfficer(off.mori-takamoto,'age')`、`addClanLoyalty(mori,-5)`。

**AI 處理**：無選項；毛利為玩家或 AI 一律套用。隆元若為當主，06 繼承規則自動選出
新當主（輝元未元服時由一門長者元就系繼任）。隆元已因他故死亡 → 靜默略過。

---

#### 事件 14｜evt.shingen-byoshi　武田信玄病逝

| 項目 | 內容 |
|---|---|
| 日期窗 | 1573/4/1 ～ 1573/5/30 |
| priority | 60 |
| 條件 | `officerAlive(off.takeda-shingen)`、`officerServes(off.takeda-shingen, clan.takeda)` |
| ownerCandidates | `[]`（純敘事） |
| monClanId | `clan.takeda` |

**文本**（title：`元龜四年四月　信州駒場`）：
「西上途中的武田軍，忽然停止了前進。三方原大破德川的甲斐之虎，此刻臥於陣中，
氣若游絲。『我死之後，三年秘喪。瀨田之橋，立我風林火山之旗——』遺言未竟，
一代軍神溘然長逝，享年五十三。大軍靜靜掉頭，退回甲斐的群山。
上洛之夢，就此埋葬於信濃的春雪之中。」

**效果**：`killOfficer(off.takeda-shingen,'age')`、`addClanCastlesMorale(takeda,-10)`、
`addClanLoyalty(takeda,-5)`。

**AI 處理**：無選項。信玄為當主時家督由 06 規則繼承（勝賴），開啟事件 11 的前提。

---

#### 事件 15｜evt.kenshin-byoshi　上杉謙信病逝

| 項目 | 內容 |
|---|---|
| 日期窗 | 1578/3/1 ～ 1578/4/30 |
| priority | 60 |
| 條件 | `officerAlive(off.nagao-kagetora)`、`officerServes(off.nagao-kagetora, clan.nagao)` |
| ownerCandidates | `[]`（純敘事） |
| monClanId | `clan.nagao` |

**文本**（title：`天正六年三月　春日山城`）：
「春日山城的廁間，軍神倒下了。關東遠征在即，四十九年的生涯，四十餘度出陣，
自詡毘沙門天化身的越後之龍，最終敗給了自己的身體。『四十九年一睡夢，一期榮華一杯酒。』
辭世之句猶在耳畔。謙信未曾明立繼嗣，景勝與景虎二子之間，暗流已然湧動——
越後的雪，今年格外地冷。」

**效果**：`killOfficer(off.nagao-kagetora,'age')`、`addClanCastlesMorale(nagao,-10)`、
`addClanLoyalty(nagao,-10)`（御館之亂的動盪以忠誠震盪抽象表現，不另立內亂事件）。

**AI 處理**：無選項。家督由 06 繼承規則自動決定。

---

### 3.6 汎用事件表（機率型）

全部 `kind:'generic'`、`once:false`、`priority` 依表、機率為**每次檢查**（月初或 9/1）
對每個綁定對象獨立擲骰（`rng.event`）。冷卻 key＝`cooldownKey + '.' + 綁定 clanId`
（全域型事件無後綴）。效果中 `$clan`／`$castle`／`$district` 依 §3.2.3 綁定。

| id | 名稱 | 檢查 | target | 機率 | 條件 | 冷卻 | priority |
|---|---|---|---|---|---|---|---|
| `evt.gen-hosaku` | 豐作 | `harvest`(9/1) | `eachClan` | `BAL.genHosakuChance`=0.10 | `clanAlive($clan)` | key `gen.harvest`，`BAL.genHarvestCooldownDays`=300 | 20 |
| `evt.gen-kyosaku` | 凶作 | `harvest`(9/1) | `eachClan` | `BAL.genKyosakuChance`=0.10 | `clanAlive($clan)` | 同上（與豐作共用 → 同年互斥） | 19 |
| `evt.gen-jishin` | 地震 | `monthStart` | `randomRegionClan`※ | `BAL.genJishinChance`=0.01 | — | key `gen.jishin`（全域），`BAL.genJishinCooldownDays`=720 | 18 |
| `evt.gen-ekibyo` | 疫病 | `monthStart` | `randomDistrict` | `BAL.genEkibyoChance`=0.008 | 該郡人口 ≥ 5000 | key `gen.ekibyo`（全域），`BAL.genEkibyoCooldownDays`=360 | 17 |
| `evt.nanban-visit` | 南蠻商人來航 | `monthStart` | `eachClan` | `BAL.genNanbanChance`=0.05 | `clanOwnsCoastalCastle($clan)` | key `gen.nanban`，`BAL.genNanbanCooldownDays`=360 | 16 |
| `evt.teppo-denrai` | 鐵砲商人 | `monthStart` | `eachClan` | `BAL.genTeppoChance`=0.04 | `clanGoldAtLeast($clan, BAL.genTeppoCost=500)` | key `gen.teppo`，`BAL.genTeppoCooldownDays`=540 | 15 |

※ `randomRegionClan`：以 `rng.event.pick` 抽一個 `Region`（02 §3.3 九地方，字典序排列），
效果作用於該地方全部城與郡（不綁定單一勢力；`$clan` 不可用）。

**效果與文本**：

- **豐作**（title `五穀豐登`）：「今年風調雨順，{clanName}領內稻穗垂金，農人笑逐顏開。
  秋收可期大熟。」效果：`setFlag('harvest.'+year+'.'+$clan, 120)`——當年秋收乘數 120%
  （定點整數百分比；05 秋收公式乘上 §5.5 的 `eventHarvestMultiplier`）。無選項。
- **凶作**（title `凶年`）：「夏日冷雨連綿，{clanName}領內稻作歉收，米價騰貴，
  百姓面有菜色。今秋恐難足額入倉。」效果：`setFlag('harvest.'+year+'.'+$clan, 70)`
  （70%）＋`addClanOrder($clan,-3)`。無選項。
- **地震**（title `大地震`）：「{regionName}地方發生大地震！城郭石垣崩塌，屋舍傾頹，
  領民流離。」效果：該地方全部城 `scaleCastleDurability(城, BAL.genJishinDurabilityLossPct=20)`；
  全部郡 `addDistrictOrder(郡,-BAL.genJishinOrderLoss=10)`、
  `scalePopulation(郡, BAL.genJishinPopLossPct=2)`。無選項。全域事件對每個受災勢力各發一則報告。
- **疫病**（title `疫病流行`）：「{districtName}爆發疫病，十室九病，村落間炊煙漸稀。」
  效果：`scalePopulation($district, BAL.genEkibyoPopLossPct=8)`、
  `addDistrictOrder($district,-BAL.genEkibyoOrderLoss=8)`、
  所轄城 `addSoldiers(城, -floor(城兵 × BAL.genEkibyoSoldierLossPct=10 / 100))`。無選項。
- **南蠻商人來航**（title `南蠻船入港`）：「一艘掛著異國帆影的黑船駛入{clanName}領內的港灣。
  紅毛商人獻上玻璃器與天鵝絨，請求通商之許。」ownerCandidates=[$clan]。選項：
  A「允其通商」：`addGold($clan,+BAL.genNanbanGold=300)`、`setFlag('unlock.pol.nanban.'+$clan,1)`
  （aiWeight 3）；B「異教之物，逐之」：`addCourtFavor($clan,+5)`（aiWeight 1）。
  旗標 `unlock.pol.nanban.<clanId>` 即 05 §3.7 政策表「事件 `evt.nanban-visit` 達成」的判定依據。
- **鐵砲商人**（title `種子島的商人`）：「堺的商人攜來數十挺鐵砲——『此物一放，
  百年武藝灰飛煙滅。』開價{cost}貫，是笑談，還是天下的新聲？」ownerCandidates=[$clan]。
  選項：A「重金購下」：`addGold($clan,-BAL.genTeppoCost=500)`、
  `setFlag('unlock.pol.kakishuchu.'+$clan,1)`、`addPrestige($clan,+30)`（aiWeight 2；
  選項條件 `clanGoldAtLeast($clan,500)`）；B「送客」：無效果（aiWeight 1）。
  旗標對應 05 §3.7 `pol.kakishuchu` 的事件解鎖。

**一揆連動**：一揆不是本引擎的事件（判定、一揆軍生成、鎮壓全歸 05 §3.8）。
連動關係：凶作、地震、疫病降低治安 → 間接提高 05 的一揆判定機率；本文件不另設連動係數。

### 3.7 大命系統

#### 3.7.1 定位與生命週期

大命（Taimei）＝勢力級強力限時指令，以**威信**為貨幣。狀態存於 `Clan.taimei`
（02 §4.3 `TaimeiState`，canonical）：**同時進行中大命至多一道**、全體大命共用一條冷卻。

```
可發動 ⟶ CmdInvokeTaimei ⟶ 生效中（activeTaimeiId, activeUntilDay）
                                  │ 到期（Step 3 開頭檢查）
                                  ▼
                          冷卻中（cooldownUntilDay）⟶ 冷卻結束 ⟶ 可發動
```

- 發動（Step 1 套用）：扣除威信成本 → `activeTaimeiId = id`、
  `activeUntilDay = 今日 + durationDays`、`cooldownUntilDay = activeUntilDay + BAL.taimeiCooldownDays(=180)`、
  即時型效果立即套用、發 `taimei.invoked`。
- 到期（Step 3 開頭）：`今日 > activeUntilDay` → `activeTaimeiId = null`、發 `taimei.expired`。
  即時型（duration 0）於發動當 tick 即到期（`activeUntilDay = 今日`，次 tick 發 `taimei.expired`）。
- 驗證器（`cmd.reject.*` 依 03 §3.3.2）：勢力存活、`availableTaimei` 含該 id（解鎖）、
  `activeTaimeiId === null`、`今日 ≥ cooldownUntilDay`、`prestige ≥ 威信成本`、
  獻金免役另驗 `gold ≥ BAL.taimeiKenkinGold`。

#### 3.7.2 解鎖公式（02 §5.1 `availableTaimei` 的定義）

```
effectivePrestige(clan) = clan.prestige
  + courtRankStep(clan.courtRank) × BAL.taimeiRankDiscountPerStep(=50)
  + (clan.shogunateTitle ∈ {kanrei, fukushogun, shogun} ? BAL.taimeiShogunateDiscount(=200) : 0)
// courtRankStep：none=0, ju5ge=1, ju5jo=2, ju4ge=3, ju4jo=4, ju3=5, sho3=6, ju2=7, sho2=8
availableTaimei(clan) = { t ∈ 大命型錄 | effectivePrestige(clan) ≥ t.unlockPrestige }
```

解鎖是門檻（不消耗）；發動時的威信成本才實際扣除（威信可因此下降到再度未解鎖，
但**進行中的大命不會中斷**）。

#### 3.7.3 大命型錄（8 種，canonical）

| id | 名稱 | 解鎖門檻 | 威信成本 | 持續（日） | 效果 |
|---|---|---:|---:|---:|---|
| `taimei.sokuji-chohei` | 即時徵兵 | 200 | `BAL.taimeiSokujiPrestige`=100 | 0（即時） | 每座我方城即時獲兵 `min(castleMaxSoldiers − soldiers, floor(Σ轄郡人口 × BAL.taimeiSokujiPopRatio(=0.02)))`；各轄郡人口依比例扣減同額（§5.4.1） |
| `taimei.kenkin-meneki` | 獻金免役 | 250 | `BAL.taimeiKenkinPrestige`=80 | 0（即時） | 另扣金錢 `BAL.taimeiKenkinGold`=1000 貫；總兵糧 `1000 × BAL.taimeiKenkinFoodPerGold(=5)`=5000 石，依各城 `castleFoodCap − food` 空位比例分配（§5.4.2） |
| `taimei.sodoin` | 總動員 | 400 | `BAL.taimeiSodoinPrestige`=150 | `BAL.taimeiSodoinDays`=90 | 期間徵兵（05）：單次可徵上限 ×(1+`BAL.taimeiSodoinMaxBonus`=0.25)、徵兵金錢成本 ×`BAL.taimeiSodoinCostMult`=0.5 |
| `taimei.gaiko-kosei` | 外交攻勢 | 300 | `BAL.taimeiGaikoPrestige`=120 | `BAL.taimeiGaikoDays`=180 | 期間我方全部外交工作的信用累積速度 ×`BAL.taimeiGaikoTrustMult`=2（08 §3.2 累積式乘上） |
| `taimei.rakuichi-shinko` | 樂市大振興 | 450 | `BAL.taimeiRakuichiPrestige`=150 | `BAL.taimeiRakuichiDays`=180 | 期間我方全部郡的商業每日成長量 ×`BAL.taimeiRakuichiCommerceMult`=2（05 開發步進乘上） |
| `taimei.teppeki` | 鐵壁 | 350 | `BAL.taimeiTeppekiPrestige`=130 | `BAL.taimeiTeppekiDays`=90 | 期間我方城受攻城傷害：耐久損失 ×(1−`BAL.taimeiTeppekiReduce`=0.3)；守城方防禦戰力 ×`BAL.taimeiTeppekiDefMult`=1.2（07 攻城公式乘上） |
| `taimei.shippu-jinrai` | 疾風迅雷 | 300 | `BAL.taimeiShippuPrestige`=100 | `BAL.taimeiShippuDays`=90 | 期間我方全部部隊行軍日速 ×(1+`BAL.taimeiShippuSpeedBonus`=0.30)（04 行軍公式乘上） |
| `taimei.tenka-bushin` | 天下普請 | 600 | `BAL.taimeiBushinPrestige`=180 | `BAL.taimeiBushinDays`=180 | 期間我方全部建設中施設 `buildRemainingDays` 每日 −`BAL.taimeiBushinStep`=2（即工期折半；05 建設步進） |

顯示名（繁中）為型錄靜態資料（`src/core/systems/events/taimeiCatalog.ts` 的 `name` 欄），
不進 i18n 字串表（比照政策與施設，05）。

#### 3.7.4 對其他系統的掛鉤介面（canonical）

events 模組匯出唯一查詢函式，各系統在公式中乘上對應欄位（未發動時全部為 1）：

```ts
/** 大命效果乘數；clan 無進行中大命時回傳全 1 的 TAIMEI_NEUTRAL 常數 */
export function taimeiEffects(state: GameState, clanId: ClanId): TaimeiEffects;

export interface TaimeiEffects {
  conscriptMaxMult: number;   // 05 徵兵上限乘數（總動員 1.25）
  conscriptCostMult: number;  // 05 徵兵金錢成本乘數（總動員 0.5）
  trustGainMult: number;      // 08 信用累積乘數（外交攻勢 2）
  commerceGrowthMult: number; // 05 商業成長乘數（樂市大振興 2）
  siegeDamageTakenMult: number; // 07 我城耐久損傷乘數（鐵壁 0.7）
  castleDefenseMult: number;  // 07 守城戰力乘數（鐵壁 1.2）
  marchSpeedMult: number;     // 04 行軍速度乘數（疾風迅雷 1.3）
  buildStepPerDay: number;    // 05 施設每日工期遞減量（天下普請 2；平常 1）
}
```

呼叫端（04/05/07/08）在各自文件公式中已預留乘數位；未預留者實作時依上表補乘並於
該文件 §8 註記（00 §0 規則 5）。AI 大名發動大命的時機規則屬 09（評定階段）；
委任 AI（軍團／城主）**不得**動用大命（09 §3.7 護欄）。

### 3.8 勝敗判定與勢力滅亡

#### 3.8.1 勝利條件（僅對玩家勢力判定）

| 條件 id | 名稱 | 判定式 | 檢查時機 |
|---|---|---|---|
| `unification` | 天下統一 | 玩家支配圈持有**全部**城 | 每日（`territoryChangedToday` 為真時） |
| `tenkabito` | 天下人 | 玩家支配圈石高 ≥ 全國 `BAL.victoryKokudakaSharePct`(=50)% **且** 玩家本家持有山城國（`prov.yamashiro`）全部城，兩者**連續** `BAL.victoryTenkabitoMonths`(=12) 個月成立 | 每月 1 日 |

**支配圈（dominion）定義**：玩家本家 ∪ 以玩家為宗主的從屬勢力（`vassal` 協定中
`vassalClanId ≠ 玩家` 的另一方為玩家者……即玩家為宗主）。石高與城數皆以支配圈合計；
唯山城國須**本家直接持有**（京都須親自掌握，§8 D13）。

`tenkabito` 的連續月數存於 `state.events.tenkabitoStreakMonths`：每月 1 日 Step 12 檢查，
成立 → `+1`，不成立 → 歸 0；達 12 → 勝利。

#### 3.8.2 敗北條件（僅對玩家勢力判定）

| 條件 id | 判定式 | 入口 |
|---|---|---|
| `no-heir` | 玩家當主死亡且無任何繼承人（06 §3.9.3 繼承順位為空） | 06 於 Step 9 設 `flags['defeat.no-heir']=1`，Step 12 收尾 |
| `no-castle` | 玩家本家持有城數 = 0 | Step 12 滅亡結算（§3.8.3）連動 |

判定成立 → `state.meta.gameOver = { kind:'defeat', endingId }`、發 `game.defeat { clanId, condition }`、
UI 進入 EndingScreen（§3.9）。

#### 3.8.3 勢力滅亡結算（destroyClan；含 AI 勢力）

任何勢力（含玩家）持有城數歸 0 時，Step 12 依 clanId 字典序逐一執行：

```
destroyClan(state, clanId, emit):
  clan.alive = false; clan.destroyedDay = 今日
  1. 武將：該勢力全部 serving 武將 → status='ronin'、clanId=null、解除全部職務；
     寄寓城 = 原 locationCastleId（城已易主，浪人留在當地）；出陣中武將先隨部隊解散入 3
  2. 捕虜：被本勢力關押的他家武將 → status='ronin'（就地釋放，capturedByClanId=null）；
     本勢力武將被他家關押者維持 captive 不變
  3. 部隊：state.armies 中 clanId=本勢力者全部移除（兵潰散、攜行糧散失）；
     其參與中的 Battle/Siege 依 07 的參戰者退出規則收束
  4. 軍團：corps 全部移除；進行中 DiploMission（任一端為本勢力）移除；
     pending Proposal 全部標記 expired
  5. 外交：rows 中含本勢力的 pacts 全部消滅（不發毀約懲罰）；行列保留供史錄
  6. 大命：activeTaimeiId=null
  7. emit clan.destroyed { clanId, byClanId: null }（§8 D14）；signalHook('clanDestroyed')
  8. clanId === playerClanId → 依 §3.8.2 no-castle 敗北收尾
```

結算後 state 必須滿足 02 INV-22。幕府將軍家（`clan.ashikaga`）滅亡時：
`shogunateExists=false`、`shogunClanId=null`、全勢力 `shogunateTitle='none'`
（等同 `endShogunate` 效果；武力滅幕府）。

#### 3.8.4 勝利後續玩與敗北觀戰

`state.meta.gameOver` 非 null 時，一切 Command 被拒（03 `cmd.reject.gameOver`）。
結局畫面的後續動作**不是 Command**，由外殼直接呼叫 core API（比照存讀檔，16；§8 D8）：

```ts
/** 結局畫面動作。mode='continue' 僅勝利結局可用 */
export function acknowledgeGameOver(state: GameState, mode: 'continue' | 'observe'): void;
```

- `mode:'continue'`（勝利限定，「繼續治世」）：`flags['victory.ack.' + endingId] = 1`、
  `meta.gameOver = null`。已達成的勝利條件此後不再判定（另一條件仍可達成並再次結算）。
- `mode:'observe'`（敗北限定，「繼續觀戰」）：`gameOver` 維持原值，回到地圖畫面；
  時間可推進、指令持續被拒、鏡頭自由——純觀戰。隨時可自 SystemMenu 回標題。
- 「回到標題」：外殼直接切換畫面（16 標題流程），state 丟棄（自動存檔已在，16）。

#### 3.8.5 結局統計（VictoryStats）

存於 `state.events.stats`，供 EndingScreen 顯示（11 §3.12.3）：

| 欄位 | 更新時機 | 語意 |
|---|---|---|
| `battlesFought` | Step 3 消費 `battleEnded` 訊號且 `playerInvolved` | 玩家參與的野戰＋合戰場數 |
| `battlesWon` | 同上且 `winnerClanId = playerClanId` | 其中獲勝場數 |
| `maxCastles` | 每月 1 日 Step 12 | `max(現值, 玩家本家持城數)` |
| `maxKokudaka` | 每月 1 日 Step 12 | `max(現值, 玩家本家石高)`（石） |

### 3.9 結局畫面內容規格（資料協定）

EndingScreen（11 §3.12.3）以下列 ViewModel 渲染（selector `buildEndingVM(state)`）：

```ts
export interface EndingScreenVM {
  kind: 'victory' | 'defeat';
  endingId: 'unification' | 'tenkabito' | 'no-heir' | 'no-castle';
  clanName: string;            // 玩家勢力顯示名
  leaderName: string;          // 現任（或末代）當主顯示名
  elapsedYears: number;        // floor(time.day / 360)
  elapsedMonths: number;       // floor((time.day mod 360) / 30)
  battlesFought: number;       // stats（§3.8.5）
  battlesWon: number;
  maxCastles: number;          // 最大版圖（城數）
  maxKokudaka: number;         // 最大石高（石）
  officerCount: number;        // 現任 serving 家臣數（即時計算）
  actions: Array<'continue' | 'observe' | 'title'>;
    // victory → ['continue','title']；defeat → ['observe','title']
}
```

標語（§6.3 字串表）：`unification`「天下布武，四海歸一」；`tenkabito`「奉戴朝廷，號令天下」；
`no-heir`「{clanName}，就此斷絕」；`no-castle`「{clanName}的旗幟，自天下消失了」。

---

## 4. 資料結構

### 4.1 EventDef 與相關型別

```ts
// src/core/systems/events/types.ts
export interface EventDef {
  id: EventId;                       // 'evt.okehazama'
  kind: 'historical' | 'generic';    // §3.1.1
  priority: number;                  // 檢查順位（降冪），整數 0..100
  trigger: EventTrigger;
  ownerCandidates: ClanId[];         // 選擇權候選（§3.4.2）；[] = 純敘事
  target: EventTargetKind;           // 綁定方式（§3.2.3）；historical 一律 'fixed'
  cutscene: EventCutscene;
  choices: EventChoice[];            // [] = 無選項（UI 顯示［繼續］）
  effects: EffectOp[];               // 共通效果（選項效果之前套用，§3.4.1）
}

export type EventTargetKind = 'fixed' | 'player' | 'eachClan' | 'randomDistrict' | 'randomRegionClan';

export interface EventTrigger {
  from: ScenarioDate;                // 日期窗起（含）
  to: ScenarioDate;                  // 日期窗迄（含）
  check: 'monthStart' | 'harvest' | 'hook';  // §3.1.2
  hooks: EventHookKind[];            // check='hook' 時訂閱的訊號；其他為 []
  conditions: EventCondition[];      // AND（§3.2）
  probability: number;               // 0..1；每次檢查以 rng.event.chance 擲骰
  once: boolean;                     // true=一生一次（記入 fired）
  cooldownDays: number;              // once=false 時觸發後的冷卻日數；once=true 填 0
  cooldownKey: string | null;        // 冷卻群組 key；null=以事件 id 為 key
}

export interface ScenarioDate { year: number; month: number; day: number; } // 載入時轉絕對日（02 §5.6）

export interface EventCutscene {
  title: string;                     // 繁中標題（含和曆年號風味）
  body: string;                      // 繁中內文 100~200 字；可含 {clanName} 等插值符（§6.1）
  monClanId: ClanId | '$clan' | null; // 家紋浮水印勢力（11 §3.12.1）；null=無
}

export interface EventChoice {
  label: string;                     // 繁中按鈕字（≤ 14 字）
  conditions: EventCondition[];      // 不符 → 反灰（玩家）／不可選（AI）
  effects: EffectOp[];
  aiWeight: number;                  // AI 加權（≥0 整數）；全 0 → 取 index 最小的合格選項
}

export type EventHookKind = 'castleFallen' | 'clanDestroyed' | 'leaderDied' | 'battleEnded';

export interface EventHookSignal {
  kind: EventHookKind;
  day: number;                       // 發出絕對日
  clanIds: ClanId[];                 // 相關勢力（battleEnded=雙方；其他=單一）
  castleId: CastleId | null;         // castleFallen 用；其他 null
  officerId: OfficerId | null;       // leaderDied 用；其他 null
  winnerClanId: ClanId | null;       // battleEnded 用（平手 null）；其他 null
  playerInvolved: boolean;           // battleEnded：玩家是否參戰；其他 false
}

export interface EventBinding {
  clanId: ClanId | null;             // '$clan' 的具體值
  castleId: CastleId | null;         // '$castle'
  districtId: DistrictId | null;     // '$district'
}
```

事件資料檔：史實與汎用事件全部收錄於 `src/data/scenarios/s1560/events.json`
（schema＝上列型別的 zod 鏡像，14 落地）；大命型錄與汎用事件的引擎參數屬程式常數
（`taimeiCatalog.ts`／`BAL.*`）。

### 4.2 TaimeiDef（大命型錄項）

```ts
// src/core/systems/events/taimeiCatalog.ts
export interface TaimeiDef {
  id: TaimeiId;                 // 'taimei.sokuji-chohei'
  name: string;                 // 繁中顯示名（「即時徵兵」…）；靜態資料，不進 i18n
  description: string;          // 繁中效果說明（UI tooltip）
  unlockPrestige: number;       // 解鎖門檻（effectivePrestige 比較值，§3.7.2）
  prestigeCost: number;         // 發動威信成本
  goldCost: number;             // 附帶金錢成本（僅獻金免役 1000；其他 0）
  durationDays: number;         // 持續日數；0=即時型
  kind: 'instant' | 'sustained'; // 即時／持續
}
export const TAIMEI_CATALOG: readonly TaimeiDef[]; // §3.7.3 的 8 筆，依 id 字典序
```

### 4.3 EventsState 擴充（canonical；02 §4.16 收錄時以本節為準）

```ts
export interface EventsState {
  fired: Record<EventId, number>;        // 已觸發（once 類）→ 觸發絕對日
  cooldownUntil: Record<string, number>; // 冷卻群組 key → 到期絕對日
  pendingChoiceEventId: EventId | null;  // 等待玩家選擇的事件；非 null 時時間凍結（03 §3.7）
  pendingChoiceBinding: EventBinding | null; // 待選事件的綁定；歷史事件為固定綁定
  hookSignals: EventHookSignal[];        // 待消費 hook 訊號（次一 tick Step 3 消費後清空）
  flags: Record<string, number>;         // 事件旗標（布林以 0/1；含 unlock.* / harvest.* / defeat.*）
  tenkabitoStreakMonths: number;         // 天下人條件連續成立月數，整數 ≥0
  stats: VictoryStats;                   // 結局統計（§3.8.5）
}

export interface VictoryStats {
  battlesFought: number;   // 玩家參戰場數，整數 ≥0
  battlesWon: number;      // 玩家獲勝場數，整數 ≥0
  maxCastles: number;      // 玩家歷史最大持城數，整數 ≥0
  maxKokudaka: number;     // 玩家歷史最大石高（石），整數 ≥0
}
```

初始值：`fired={}`、`cooldownUntil={}`、`pendingChoiceEventId=null`、`pendingChoiceBinding=null`、
`hookSignals=[]`、`flags={}`、`tenkabitoStreakMonths=0`、`stats` 全 0。

### 4.4 相關 Command 與 GameEvent（02 為準，此處僅重申語意）

- `CmdResolveEventChoice { type:'resolveEventChoice'; eventId; choiceIndex }`（02 §4.18）：
  驗證＝`eventId === pendingChoiceEventId` 且 `0 ≤ choiceIndex < choices.length`；套用見 §5.3。
- `CmdInvokeTaimei { type:'invokeTaimei'; taimeiId }`（02 §4.18）：驗證與套用見 §3.7.1。
- GameEvent（02 §4.19）：`event.fired { eventId, hasChoice }`、`taimei.invoked / taimei.expired
  { clanId, taimeiId }`、`clan.destroyed { clanId, byClanId }`、`game.victory / game.defeat
  { clanId, condition }`（condition＝§3.8.1／§3.8.2 的條件 id 字串）、`victory.tenkabitoProgress
  { clanId, months }`（`tenkabitoStreakMonths ≥ 6` 起每月一則，套用見 §5.6；七輪裁決 2 收錄，
  13 renderReport 導出 `report.victory.tenkabitoProgress`，非 core 直發 `report.*`）。
- 03 §3.3.4 表中 `cmd.respondEvent`／`cmd.issueTaimei` 為同物的暫定名，以 02 命名為準（§8 D1）。

---

## 5. 演算法與公式

### 5.1 eventsSystem（Step 3）主流程

```
eventsSystem(state, emit):
  // (0) 大命到期
  for clanId of sortedKeys(state.clans) where clans[clanId].alive:
    t = clans[clanId].taimei
    if t.activeTaimeiId != null and state.time.day > t.activeUntilDay:
      emit(taimei.expired { clanId, taimeiId: t.activeTaimeiId }); t.activeTaimeiId = null

  // (1) 消費 hook 訊號
  signals = state.events.hookSignals; state.events.hookSignals = []
  for s of signals where s.kind == 'battleEnded' and s.playerInvolved:
    stats.battlesFought += 1
    if s.winnerClanId == meta.playerClanId: stats.battlesWon += 1

  // (2) 玩家待選事件擋門
  if state.events.pendingChoiceEventId != null: return   // 時間凍結中（防禦性早退）

  // (3) 過期 harvest 旗標清理（每年 10 月 1 日）
  if month == 10 and dayOfMonth == 1:
    刪除 flags 中 key 以 'harvest.' 開頭且年份 < 當年 者

  // (4) 事件判定
  defs = 全部 EventDef 依 (priority 降冪, id 升冪) 排序
  for def of defs:
    if not (def.trigger.from ≤ 今日 ≤ def.trigger.to): continue
    if def.trigger.once and def.id in state.events.fired: continue
    due = (def.trigger.check == 'monthStart' and dayOfMonth == 1)
       or (def.trigger.check == 'harvest' and month == 9 and dayOfMonth == 1)
       or (def.trigger.check == 'hook' and (signals 含 def.trigger.hooks 任一種
           or dayOfMonth == 1))          // hook 類每月 1 日補檢查（防讀檔遺漏）
    if not due: continue
    for binding of resolveBindings(def, state):     // 'fixed'/'player' → 1 個；'eachClan' → 逐勢力
      ck = cooldownKeyOf(def, binding)              // (cooldownKey ?? def.id) + clan 後綴（§3.6）
      if (state.events.cooldownUntil[ck] ?? 0) > 今日: continue
      if not def.trigger.conditions.every(c => evalCond(c, state, binding)): continue
      if def.trigger.probability < 1 and not rng.event.chance(def.trigger.probability): continue
      fireEvent(state, def, binding, emit)
      if state.events.pendingChoiceEventId != null: return   // 一 tick 一件待選事件（§3.1.4）
```

```
fireEvent(state, def, binding, emit):
  if def.trigger.once: state.events.fired[def.id] = 今日
  else: state.events.cooldownUntil[cooldownKeyOf(def,binding)] = 今日 + def.trigger.cooldownDays
  emit(event.fired { eventId: def.id, hasChoice: def.choices.length > 0 })
  applyEffects(state, def.effects, binding, emit)            // 共通效果
  if def.choices.length == 0: return
  owner = ownerCandidates 中第一個存活且為玩家者；否則第一個存活者（AI）；皆無 → return
  if owner == meta.playerClanId:
    state.events.pendingChoiceEventId = def.id
    state.events.pendingChoiceBinding = binding              // 時間凍結（03 §3.7.1）
  else:
    choice = aiPickChoice(def, state, binding)               // §3.4.2 加權；rng.event
    if choice != null: applyEffects(state, choice.effects, binding, emit)
```

決定論註記：`resolveBindings` 的候選一律 id 字典序；`rng.event` 消費次數只依 state 內容而定，
與速度檔位、是否為玩家勢力無關（03 §3.5.4 規則 3——AI 與玩家事件走同一檢查序，
僅「解決」分岔，且玩家分岔不消費亂數、AI 分岔消費恰一次）。

### 5.2 applyEffects（防禦性套用）

```
applyEffects(state, ops, binding, emit):
  for op of ops:                                   // 依陣列順序
    ids = 以 binding 具體化 op 中的 '$clan'/'$castle'/'$district'
    if 任一引用實體缺失/已死/已滅亡: continue        // 防禦性 no-op（§3.3）
    switch op.op:
      addGold:      clan.gold = max(0, clan.gold + round(amount))
      killOfficer:  officers06.die(state, officerId, cause, emit)   // 06 全流程（含繼承）
      transferCastle: …（§3.3 註解步驟；設 territoryChangedToday、signalHook('castleFallen')）
      declareWar:   row = materializeRow(a,b)；row.lastHostileDay = 今日；
                    雙方感情 −BAL.evtDeclareWarSentiment；刪除 ceasefire/alliance/marriage 協定
      …其餘依 §3.3 表逐項實作，全部帶 clamp
```

### 5.3 CmdResolveEventChoice 的套用（Step 1）

```
apply(state, cmd, emit):
  def = catalog[cmd.eventId]; binding = state.events.pendingChoiceBinding
  choice = def.choices[cmd.choiceIndex]
  if not choice.conditions.every(c => evalCond(c, state, binding)):
    // 凍結期間同 tick 前置 Command 可能使條件失效（例：先花掉金錢）：
    choice = aiPickChoice(def, state, binding)     // 回退：依 AI 規則另選（§3.4.2）
  if choice != null: applyEffects(state, choice.effects, binding, emit)
  state.events.pendingChoiceEventId = null
  state.events.pendingChoiceBinding = null
```

驗證器（此前已擋）：`pendingChoiceEventId === cmd.eventId`（否則 `cmd.reject.invalidTarget`）、
`choiceIndex` 界內、發令者為玩家勢力。**解凍契約（補充 03 §3.1）**：
`hasBlockingInteraction` 對 pendingChoice 的判定改為「`pendingChoiceEventId ≠ null` 且
佇列中無對應的 `resolveEventChoice`」——玩家選擇後驅動器得以跑一個 tick 套用選項並解凍
（§8 D7）。存檔於待選狀態 → 讀檔後 UI 依 `pendingChoiceEventId` 重開 EventModal。

### 5.4 大命即時型公式

#### 5.4.1 即時徵兵（taimei.sokuji-chohei）

```
for castle of 我方城（id 字典序）:
  pool  = Σ (d.population for d in castle.districtIds where d.ownerClanId == clanId)
  gain  = min(castleMaxSoldiers(castle) − castle.soldiers, floor(pool × BAL.taimeiSokujiPopRatio))
  if gain ≤ 0: continue
  castle.soldiers += gain
  按各郡 population 比例分攤扣減人口（餘數依郡 id 字典序自前而後 +1，總和恰為 gain）
```

#### 5.4.2 獻金免役（taimei.kenkin-meneki）

```
clan.gold −= BAL.taimeiKenkinGold                       // 驗證器保證足夠
totalFood = BAL.taimeiKenkinGold × BAL.taimeiKenkinFoodPerGold   // 5000 石
caps = 各我方城 (castleFoodCap − food)，id 字典序
依 caps 比例分配 totalFood（floor；餘數依序 +1），逐城 castle.food += 分得量
全城皆滿 → 溢出部分丟棄（威信與金錢照扣：發動前 UI 顯示預估入庫量警示，§6.4）
```

### 5.5 秋收乘數掛鉤（供 05 引用）

```
eventHarvestMultiplier(state, clanId): number =
  (state.events.flags['harvest.' + state.time.year + '.' + clanId] ?? 100) / 100
// 05 的 harvest() 對每勢力收成總量乘上本值（預設 1.0；豐作 1.2、凶作 0.7）
```

### 5.6 victorySystem（Step 12）

```
victorySystem(state, emit):
  if state.meta.gameOver != null: return
  // (1) 滅亡結算（每日，僅領土變動日）
  if state.meta.territoryChangedToday:
    for clanId of sortedKeys(state.clans) where alive and 持城數(clanId) == 0:
      destroyClan(state, clanId, emit)                    // §3.8.3
  // (2) 玩家敗北
  if flags['defeat.no-heir'] == 1:
    gameOver = { kind:'defeat', endingId:'no-heir' }; emit(game.defeat); return
  if not clans[playerClanId].alive:
    gameOver = { kind:'defeat', endingId:'no-castle' }; emit(game.defeat); return
  // (3) 天下統一（領土變動日）
  if state.meta.territoryChangedToday and flags['victory.ack.unification'] != 1:
    if 支配圈(player) 持有全部城: gameOver = { kind:'victory', endingId:'unification' };
                                  emit(game.victory); return
  // (4) 天下人＋統計（每月 1 日）
  if dayOfMonth == 1:
    stats.maxCastles  = max(stats.maxCastles, 玩家本家持城數)
    stats.maxKokudaka = max(stats.maxKokudaka, clanKokudaka(player))
    if flags['victory.ack.tenkabito'] != 1:
      ok = 支配圈石高占比 ≥ BAL.victoryKokudakaSharePct
           and ownsProvince(playerClanId, prov.yamashiro)   // 本家直接持有
      state.events.tenkabitoStreakMonths = ok ? +1 : 0
      if tenkabitoStreakMonths ≥ 6:
        emit(victory.tenkabitoProgress { clanId: playerClanId, months: tenkabitoStreakMonths })
        // info 級進度提示；13 renderReport 導出 report.victory.tenkabitoProgress（七輪裁決 2，§6.4）
      if tenkabitoStreakMonths ≥ BAL.victoryTenkabitoMonths:
        gameOver = { kind:'victory', endingId:'tenkabito' }; emit(game.victory)
```

### 5.7 本文件引入的 BAL 常數彙整（建議初值；定案見 15）

| 常數 | 建議值 | 單位 | 用途 |
|---|---:|---|---|
| `BAL.evtHonnojiOdaCastleMin` | 25 | 城 | 本能寺條件：織田持城門檻 |
| `BAL.evtDeclareWarSentiment` | 20 | 點 | declareWar 的雙方感情懲罰 |
| `BAL.evtTransferLoyalty` | 60 | 點 | transferOfficer 移籍後忠誠初值 |
| `BAL.genHosakuChance` / `BAL.genKyosakuChance` | 0.10 / 0.10 | 機率 | 豐作／凶作（每年 9/1 每勢力） |
| `BAL.genHarvestCooldownDays` | 300 | 日 | 豐凶共用冷卻（同年互斥） |
| `BAL.genJishinChance` | 0.01 | 機率/月 | 地震 |
| `BAL.genJishinDurabilityLossPct` / `BAL.genJishinOrderLoss` / `BAL.genJishinPopLossPct` | 20 / 10 / 2 | %／點／% | 地震效果 |
| `BAL.genJishinCooldownDays` | 720 | 日 | 地震全域冷卻 |
| `BAL.genEkibyoChance` | 0.008 | 機率/月 | 疫病 |
| `BAL.genEkibyoPopLossPct` / `BAL.genEkibyoSoldierLossPct` / `BAL.genEkibyoOrderLoss` | 8 / 10 / 8 | %／%／點 | 疫病效果 |
| `BAL.genEkibyoCooldownDays` | 360 | 日 | 疫病全域冷卻 |
| `BAL.genNanbanChance` / `BAL.genNanbanGold` / `BAL.genNanbanCooldownDays` | 0.05 / 300 / 360 | 機率/貫/日 | 南蠻商人 |
| `BAL.genTeppoChance` / `BAL.genTeppoCost` / `BAL.genTeppoCooldownDays` | 0.04 / 500 / 540 | 機率/貫/日 | 鐵砲商人 |
| `BAL.taimeiCooldownDays` | 180 | 日 | 大命共用冷卻（效果結束起算） |
| `BAL.taimeiRankDiscountPerStep` / `BAL.taimeiShogunateDiscount` | 50 / 200 | 點 | 解鎖門檻折抵（§3.7.2） |
| `BAL.taimeiSokujiPrestige` / `BAL.taimeiSokujiPopRatio` | 100 / 0.02 | 點／比率 | 即時徵兵 |
| `BAL.taimeiKenkinPrestige` / `BAL.taimeiKenkinGold` / `BAL.taimeiKenkinFoodPerGold` | 80 / 1000 / 5 | 點/貫/石·貫⁻¹ | 獻金免役 |
| `BAL.taimeiSodoinPrestige` / `BAL.taimeiSodoinDays` / `BAL.taimeiSodoinMaxBonus` / `BAL.taimeiSodoinCostMult` | 150 / 90 / 0.25 / 0.5 | — | 總動員 |
| `BAL.taimeiGaikoPrestige` / `BAL.taimeiGaikoDays` / `BAL.taimeiGaikoTrustMult` | 120 / 180 / 2 | — | 外交攻勢 |
| `BAL.taimeiRakuichiPrestige` / `BAL.taimeiRakuichiDays` / `BAL.taimeiRakuichiCommerceMult` | 150 / 180 / 2 | — | 樂市大振興 |
| `BAL.taimeiTeppekiPrestige` / `BAL.taimeiTeppekiDays` / `BAL.taimeiTeppekiReduce` / `BAL.taimeiTeppekiDefMult` | 130 / 90 / 0.3 / 1.2 | — | 鐵壁 |
| `BAL.taimeiShippuPrestige` / `BAL.taimeiShippuDays` / `BAL.taimeiShippuSpeedBonus` | 100 / 90 / 0.30 | — | 疾風迅雷 |
| `BAL.taimeiBushinPrestige` / `BAL.taimeiBushinDays` / `BAL.taimeiBushinStep` | 180 / 180 / 2 | — | 天下普請 |
| `BAL.victoryKokudakaSharePct` | 50 | % | 天下人石高占比 |
| `BAL.victoryTenkabitoMonths` | 12 | 月 | 天下人連續月數 |

事件效果表內的一次性數值（威信 ±、忠誠 ±、戰損 %……）屬**劇本資料**，寫死於
`events.json`，不設 BAL 常數（§8 D2）。

---

## 6. UI/UX

### 6.1 事件 cutscene modal 的資料協定（EventModal；佈局見 11 §3.12.1）

UI 以 selector 取得 ViewModel（core 不知 modal 存在）：

```ts
export interface EventModalVM {
  eventId: EventId;
  title: string;                 // cutscene.title
  body: string;                  // cutscene.body 完成插值後的全文
  monClanId: ClanId | null;      // 家紋浮水印（binding 具體化後）
  choices: Array<{
    label: string;               // 按鈕字
    enabled: boolean;            // 選項條件求值結果（反灰依據）
    hint: string;                // enabled=false 時的提示（ui.event.choiceLocked 插值）
  }>;                            // 無選項事件 → 空陣列，UI 顯示單顆［繼續］
  requiresChoice: boolean;       // true=玩家待選（pendingChoice；不可 ESC 逃逸，11 §5.1）
}
export function buildEventModalVM(state: GameState, eventId: EventId): EventModalVM;
```

- **待選事件**（`pendingChoiceEventId`）：讀檔或觸發後 UI 恆重建此 modal；
  玩家點選 → 送 `CmdResolveEventChoice` → 關 modal → 解凍（§5.3）。
- **無選項／AI 已解決事件**：UI 於收到 `event.fired` 報告後排入 modalQueue（11 §3.14.2），
  純呈現、不產生 Command。僅玩家勢力為 `ownerCandidates` 成員、效果涉及玩家勢力、
  或 kind='historical' 的事件才彈 modal；其餘（如他國豐作）只進報告匣。
- 文本插值符：`{clanName}`（binding.clanId 的顯示名）、`{districtName}`、`{castleName}`、
  `{regionName}`（地震）、`{cost}`（鐵砲商人）。歷史事件文本為定案全文、無插值符。

### 6.2 大命面板（TaimeiPanel；佈局歸 11，此處定資料與行為）

- 入口：政略畫面「大命」頁籤。列出 8 筆 `TaimeiDef`（型錄序）：名稱、效果說明、
  威信成本、持續、狀態徽章（未解鎖／可發動／生效中餘 N 日／冷卻中餘 N 日）。
- 發動鈕軟驗證同 `CmdInvokeTaimei` 驗證器；生效中於 HUD 顯示常駐圖示＋剩餘日 tooltip。

### 6.3 繁中字串表（key 依 00 §9；13 彙整收錄）

| key | 字串 |
|---|---|
| `ui.event.continue` | `繼續` |
| `ui.event.choiceLocked` | `條件不足：{reason}` |
| `ui.event.pendingBanner` | `歷史的岔路——請做出抉擇` |
| `ui.taimei.title` | `大命` |
| `ui.taimei.invoke` | `發動大命` |
| `ui.taimei.confirm` | `以威信{cost}點發動「{name}」？` |
| `ui.taimei.stateLocked` | `未解鎖（需威信{need}）` |
| `ui.taimei.stateReady` | `可發動` |
| `ui.taimei.stateActive` | `生效中（餘{days}日）` |
| `ui.taimei.stateCooldown` | `冷卻中（餘{days}日）` |
| `ui.taimei.kenkinOverflow` | `倉廩將滿，預估僅能入庫{food}石` |
| `ui.ending.victory.unification` | `天下布武，四海歸一` |
| `ui.ending.victory.tenkabito` | `奉戴朝廷，號令天下` |
| `ui.ending.defeat.noHeir` | `{clanName}，就此斷絕` |
| `ui.ending.defeat.noCastle` | `{clanName}的旗幟，自天下消失了` |
| `ui.ending.statYears` | `歷時：{years}年{months}月` |
| `ui.ending.statBattles` | `合戰：{fought}戰{won}勝` |
| `ui.ending.statMaxCastles` | `最大版圖：{count}城` |
| `ui.ending.statMaxKokudaka` | `最大石高：{koku}石` |
| `ui.ending.statOfficers` | `麾下家臣：{count}名` |
| `ui.ending.actionContinue` | `繼續治世` |
| `ui.ending.actionObserve` | `繼續觀戰` |
| `ui.ending.actionTitle` | `回到標題` |
| `report.event.fired` | `發生事件：{title}` |
| `report.taimei.invoked` | `{clanName}發動大命「{name}」` |
| `report.taimei.expired` | `大命「{name}」的效力已盡` |
| `report.clan.destroyed` | `{clanName}滅亡了` |
| `report.victory.tenkabitoProgress` | `天下人之路：條件已連續達成{months}／12月` |
| `cmd.reject.taimeiLocked` | `威信不足，尚未解鎖此大命` |
| `cmd.reject.taimeiBusy` | `已有大命生效中` |
| `cmd.reject.taimeiCooldown` | `大命冷卻中（餘{days}日）` |
| `cmd.reject.prestigeShort` | `威信不足（需要{cost}點）` |

（事件標題與內文、大命與選項名稱屬劇本／型錄資料，不進字串表——00 §8。）

### 6.4 互動細則

- 獻金免役發動前，確認框顯示 `ui.taimei.kenkinOverflow` 預估（軟驗證計算 §5.4.2 分配）。
- `game.victory`／`game.defeat` 觸發 → UI 立即切至 EndingScreen（11 §3.12.3）；
  統計卡資料取 §3.9 `buildEndingVM`。EndingScreen 動作鈕依 `actions` 陣列渲染：
  `continue` → `acknowledgeGameOver(state,'continue')` 後回地圖；`observe` → 同理；
  `title` → 外殼回標題流程（16）。11 §3.12.3 需補列「繼續治世／繼續觀戰」鈕（§8 D8）。
- 天下人進度提示：`tenkabitoStreakMonths ≥ 6` 起每月由 §5.6 `victorySystem` emit
  `victory.tenkabitoProgress{clanId, months}`（core 不直發 `report.*`，五輪裁決 A）；
  13 renderReport 於渲染時導出 info 級報告 `report.victory.tenkabitoProgress`（§6.3 字串表）。

---

## 7. 實作任務清單

- [ ] **T1　條件 DSL 與求值器**：`EventCondition` 全 kind、`evalCond`（含綁定具體化、
  缺實體 false、組合子）。驗收：每 kind 至少一組 true/false fixture；`ownsProvince` 對
  空持有、部分持有、全持有三態正確。
- [ ] **T2　EffectOp 套用器**：§3.3 全表、防禦性 no-op、clamp、`killOfficer` 委派 06 `die()`、
  `transferCastle` 的職務解除與 hook 訊號。驗收：對每個 op 的正常／邊界（溢界 clamp、
  目標已死）雙 fixture；套用後 `validateState` 零違規。
- [ ] **T3　事件引擎主流程**：§5.1 檢查序、綁定、冷卻、`probability`、pendingChoice 擋門、
  `fireEvent`。驗收：固定種子下事件觸發序 golden 鎖定；同 tick 僅一件待選事件；
  「日期窗過、條件不符 → 靜默略過」有測試。
- [ ] **T4　hook 訊號管線**：`signalHook`、07/06/10 的發出點接線、次 tick 消費、
  讀檔後訊號保留。驗收：攻下稻葉山城次日內 `evt.mino-koryaku` 觸發；統計計數與
  訊號序無關（排序穩定）。
- [ ] **T5　CmdResolveEventChoice**：驗證器、§5.3 套用、條件失效回退、解凍判定式
  （03 驅動器同步修改）。驗收：待選中存讀檔→modal 重建→選擇→效果一致；
  同 tick 先花錢使選項失效時回退路徑正確。
- [ ] **T6　s1560 史實事件資料 15 筆**：§3.5 全部欄位落入 `events.json`＋zod schema（14）。
  驗收：`tools/validate.ts` 通過；文本經簡體字黑名單掃描（17）；全 AI 觀戰模擬
  1560–1585 中位數觸發 ≥ 8 件（跑 20 種子統計）。
- [ ] **T7　汎用事件 6 筆＋掛鉤**：§3.6 資料、`eventHarvestMultiplier` 接入 05 秋收、
  `unlock.*` 旗標接入 05 政策驗證器。驗收：豐凶同年互斥；冷卻期間不重複；
  南蠻旗標使 `pol.nanban` 免威信門檻可施行。
- [ ] **T8　大命系統**：型錄 8 筆、解鎖公式、`CmdInvokeTaimei` 驗證與套用、到期、
  `taimeiEffects()` 及 04/05/07/08 公式接線。驗收：每種大命一個效果生效測試
  （如疾風迅雷下行軍日數 ÷1.3）；冷卻與同時上限拒絕路徑；即時型分配公式含餘數
  case 測試。
- [ ] **T9　勝敗與滅亡**：`victorySystem`、`destroyClan`、`no-heir` 旗標接線（06）、
  `acknowledgeGameOver`。驗收：統一／天下人（含連續中斷歸零）／兩種敗北各一個
  劇本化測試；滅亡後 `validateState` 零違規（INV-22）；勝利後 continue 不再重複觸發。
- [ ] **T10　結局統計與 VM**：`VictoryStats` 更新、`buildEndingVM`、`buildEventModalVM`。
  驗收：統計欄位與 golden 重放一致；VM 對四種 endingId 的 actions 正確。
- [ ] **T11　UI 接線**：EventModal（含待選重建）、TaimeiPanel、EndingScreen 動作鈕、
  §6.3 字串進 `zh-TW.ts`。驗收：Playwright smoke——觸發桶狹間、選 A、關 modal、
  時間恢復；威信作弊後發動大命 HUD 顯示圖示。

---

## 8. 設計決策記錄

- **D1｜命名以 02 為準**：03 §3.3.4 的 `cmd.respondEvent`／`cmd.issueTaimei` 與 02 §4.18 的
  `resolveEventChoice`／`invokeTaimei` 並存，依 00 優先序（02 > 03）採 02 命名；
  GameEvent 亦同（`event.fired`／`game.victory`／`game.defeat`／`clan.destroyed`）。
  03 的 `event.historicalTriggered`／`victory.achieved` 等視為同物異名，實作以 02 為準。
- **D2｜事件效果數值屬劇本資料、不設 BAL**：15 份事件的一次性威信／忠誠／戰損數值
  如同武將能力值，是內容而非平衡旋鈕；全部進 `events.json`。引擎級參數（機率、門檻、
  冷卻、大命公式）才立 BAL 常數。避免 BAL 表被百餘個一次性常數淹沒。
- **D3｜大命同時僅一道、共用冷卻**：02 `TaimeiState` 的單槽結構為 canonical；
  「同時持有上限」定案為 1，簡化 UI 與 AI 決策，強化「大命＝關鍵時刻的王牌」定位。
- **D4｜EffectOp 不含建立勢力／生成部隊／強制開戰鬥**：本能寺不另立明智家（光秀出奔
  為浪人）、桶狹間不生成今川軍（以 declareWar＋AI 常規入侵表現）。運行期新勢力會衝擊
  INV-02/22、外交列、AI 排程等大量機制，成本遠超一個事件的敘事收益。
- **D5｜三河獨立以「開局既存松平家＋從屬協定」實作**：s1560 即含 `clan.matsudaira`
  （從屬今川），事件 3 只需 breakPact＋signPact；並將元康→家康、松平→德川的改名
  合併於同一事件（史實分散在 1563/1566，合併換取事件數精簡）。
- **D6｜檢查時機定案為「月初＋9/1＋hook 訊號」**：03 字面上寫「汎用事件每日」，
  但逐日對全事件表擲骰會使機率參數難以直覺調校（月機率 → 日機率換算）且浪費預算；
  定案以月初閘控，`hook` 類事件經訊號機制獲得即時性。一揆維持 05 的月初判定不變。
- **D7｜pendingChoice 解凍判定式補充**：03 §3.1 的 `hasBlockingInteraction` 若無條件
  凍結，玩家的 `resolveEventChoice` 永無套用機會（死鎖）。定案：佇列中存在對應
  resolve 指令時放行 tick。此為對 03 的介面補充，實作時同步在 03 §3.1 註記。
- **D8｜結局後續動作走外殼 API 而非 Command**：`gameOver` 期間一切 Command 被拒
  （03），「繼續治世／繼續觀戰」如同存讀檔屬外殼操作，以 `acknowledgeGameOver` 實作，
  不記入重放紀錄（重放至 gameOver 即止）。11 §3.12.3 需補「繼續」鈕，實作時回填。
- **D9｜EffectOp 防禦性 no-op**：事件效果引用的實體可能因玩家行動先行消滅（如長篠前
  昌景已戰死）。逐 op 靜默跳過使 15 份事件無需為每種先死組合寫分支；與 Command
  「驗證窮盡＋套用不失敗」（03 D4）不衝突——事件效果是劇本資料，非玩家輸入。
- **D10｜桶狹間對玩家今川無選擇權**：選擇權設計上屬被襲方（織田）的奇襲決斷；
  玩家今川承受史實開局（義元死、氏真繼）換得「以衰退今川翻盤」的劇本張力，
  與《信長之野望》系列的桶狹間處理一致。
- **D11｜EventsState 擴充欄位**：02 §4.16 缺 `flags`／`hookSignals`／`pendingChoiceBinding`／
  `tenkabitoStreakMonths`／`stats`。本文件為事件引擎單一真相來源，§4.3 為定案版，
  02 收錄時以本節為準（比照 03 對迴圈型別的先例）；旗標值取整數（布林 0/1）以符
  03 §3.5.4 規則 6 的定點化要求。
- **D12｜本能寺 probability=1.0**：條件齊備即於下個月初必發，不做逐月懸念擲骰——
  golden test 可精準斷言觸發日，玩家亦可透過「不讓信長進京畿」明確迴避，
  規則透明優於隨機懸念。
- **D13｜天下人條件的山城國須本家直接持有**：支配圈（含從屬）計石高，但京都象徵
  「天下人親臨」，從屬代持不算；避免玩家以從屬鏈簿記式達成勝利。
- **D14｜`clan.destroyed.byClanId` 一律 null**：追認「滅亡者是誰」需要記錄每城最後
  奪取者的新欄位，收益僅一行報告文案；定案不記名（報告寫「{clanName}滅亡了」），
  02 的 payload 型別 `ClanId | null` 仍相容。
- **D15｜2026-07-11｜天下人進度提示改為 emit canonical 事件（收束 02 §8 七輪裁決 2）**：
  §6.4 原敘述「`report.victory.tenkabitoProgress`：…起每月發 info 報告」為五輪裁決 A
  （core 不得直發 `report.*`）定案前的殘留寫法。依 02 §8 七輪裁決 2，`victory.tenkabitoProgress
  {clanId, months}` 已收錄 02 §4.19 canonical 事件表（發出者 10）。本次改動：(a) §5.6
  `victorySystem` 偽碼於 `tenkabitoStreakMonths ≥ 6` 分支補 `emit(victory.tenkabitoProgress
  {clanId: playerClanId, months})`；(b) §6.4 該條改為描述 emit 事件、由 13 renderReport
  於渲染時導出 `report.victory.tenkabitoProgress`（§6.3 字串表不變）；(c) §4.4 GameEvent
  清單補列本事件。全檔另依「發 report\.」／「發.*報告」活體語境掃描一遍，僅
  §3.6 地震效果敘述「全域事件對每個受災勢力各發一則報告」一處尚存「報告」字樣，
  惟未指名任何 `report.*` key、亦未宣稱 core 繞過 `event.fired`（該事件本身即 02 §4.19
  canonical、§5.1 `fireEvent` 已 emit）直接產生報告，核實後判定非直發 `report.*` 違例、
  維持原文不改。

---

*本文件由 Fable 5 設計定稿。事件文本與資料需求由 `plan/14-scenario-data.md` 落地，
BAL 定案值見 `plan/15-balance.md`。*
