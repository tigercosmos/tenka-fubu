# 08 — 外交與調略（Diplomacy & Plots）

> 本文件是「外交工作／信用、感情、協定、朝廷官位、幕府役職、調略（引拔／流言／內應）、
> AI 外交接受度公式」的**單一真相來源**。規格衝突時優先序依 `00-foundations.md` 卷首規定。
> 實作位置：`src/core/systems/diplomacy.ts`（純邏輯，不得 import React／Pixi／DOM）。

---

## 1. 目的與範圍

本文件定義《天下布武》v1.0 的外交與調略系統，包含：

- **外交工作與信用（trust）**：指派武將對目標勢力進行長期工作，累積可花費的外交資本。
- **感情（sentiment）**：對方勢力對我方的好惡值，影響信用累積速度與 AI 接受度。
- **外交行動**：不可侵條約、同盟、停戰、婚姻同盟、從屬勸告、從屬提案、援軍請求、破棄。
- **朝廷**：朝廷友好度、官位八階（從五位下→正二位）、停戰斡旋。
- **幕府**：幕府友好度、役職五階、上洛與將軍擁立、幕府滅亡後的效果失效處理。
- **調略**：引拔、流言、內應（多月進度制諜報行動）。
- **與 AI 的介面**：每種外交行動的接受度評分公式（本文件定義公式；AI 何時主動提案見 09）。

不在本文件範圍：AI 主動外交策略與援軍派兵邏輯（`plan/09-ai.md`）、
幕府滅亡事件的觸發條件（`plan/10-events-and-victory.md`）、
威風的產生條件（`plan/07-military.md`）、政策槽機制本體（`plan/05-domestic.md`）。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/02-data-model.md` | 本文件的 interface 由 02 彙整為最終型別；`Officer.kinship`（一門／譜代／外樣，一門判定 `kinship==='kin'`；勘誤 E-34）、`Officer.spouseId`、`Castle.betrayalReadyClanId` 等跨域欄位以 02 定案。 |
| `plan/03-game-loop.md` | 本系統於每日 tick 順序第 4 步 `diplomacy` 執行（見 00 §5.4）；Command 與 GameEvent 匯流排規範依 03。 |
| `plan/04-map-and-movement.md` | 「接壤」判定使用 RoadEdge 節點圖；停戰／同盟的通行限制由 04 的移動驗證讀取本文件的協定資料。 |
| `plan/05-domestic.md` | 官位／役職的「政策槽 +1」由 05 的政策系統讀取本文件輸出的 `extraPolicySlots()`；從屬上繳金於 05 的月收入結算時執行（公式在本文件 §5.3.6）。 |
| `plan/06-officers.md` | 特性提供的 `diplomacyWorkMult` 倍率、引拔成功後武將移籍與安置細節、忠誠機制本體。 |
| `plan/07-military.md` | 威風（awe）產生時呼叫本文件 §5.2.4 的 `applyAweDiplomacy`；內應發動對攻城戰的士氣效果由 07 的攻城 tick 讀取。 |
| `plan/09-ai.md` | AI 何時提案、何時破棄、援軍是否派兵與派兵規模；本文件僅定義「接受度評分」。 |
| `plan/10-events-and-victory.md` | 幕府滅亡事件、桶狹間等史實事件對感情／協定的一次性修改。 |
| `plan/15-balance.md` | 本文件所有 `BAL.*` 建議初值的最終定案。 |

## 3. 設計細節

### 3.1 總覽與方向性定義

外交狀態以 `DiplomacyRow` 為單位：勢力 A 對每個其他勢力 B 各持一列。**方向性約定（canonical）**：

- `rows[A][B].trust`＝A 在 B 處累積的信用（A 可花費，0..100）。
- `rows[A][B].sentiment`＝**B 對 A** 的感情（-100..100）。玩家在外交畫面看到的即
  「我方信用」與「對方對我方的感情」，與遊戲操作直覺一致。
- 協定（Pact）為雙邊事實，登記於全域 `DiplomacyState.pacts`，兩側 row 以 `pactIds` 引用同一筆。

「交戰中」為衍生狀態，不另設宣戰指令：
`atWar(A,B) := rows[A][B].lastHostileDay 在 BAL.warStateMonths（建議 6）個月內`，
且雙方無生效中的停戰／同盟／不可侵／從屬。`lastHostileDay` 由 07 在野戰、合戰、攻城、
制壓敵郡發生時回寫（雙向同值）。

「接壤」為衍生狀態：存在至少一條 RoadEdge，其兩端節點（城或郡）分屬 A、B 兩勢力。
每月 1 日於 diplomacy 系統開頭重算一次快取 `adjacencyCache: Set<string /* "clanA|clanB" 字典序 */>`。

### 3.2 外交工作與信用

- 玩家（或 AI）指派一名武將對目標進行**外交工作**。目標三種：其他勢力（累積信用）、
  朝廷（累積朝廷友好度）、幕府（累積幕府友好度）。
- 條件：武將未出陣、未擔任其他外交工作或調略（一人同時僅一件）；城主／領主可兼任，無治理懲罰。
- 每月 1 日扣費：對勢力 `BAL.diplomacyWorkMonthlyCost`（建議 20 貫）；
  對朝廷 `BAL.courtWorkMonthlyCost`（建議 50 貫）；對幕府 `BAL.shogunateWorkMonthlyCost`（建議 50 貫）。
  金錢不足時該工作自動中止並發報告。
- 全勢力同時進行的外交工作上限 `BAL.diplomacyWorkMaxConcurrent`（建議 6）。
- 信用每月增益（詳細公式見 §5.2.1）：`(基礎 + 政務/係數) × 特性倍率 × 感情倍率 × 官位加成`，
  上限 `BAL.trustMax = 100`。感情越低，累積越慢（感情 -100 時减半）——
  修正：感情 -100 時**減半**（×0.5），感情 +100 時 ×1.5。
- 信用只在外交行動**成立時**扣除；提案被拒不扣信用，但該行動對該目標進入
  `BAL.dipRefusalCooldownMonths`（建議 3）個月冷卻。
- 對同一勢力同時僅能有一件外交工作；撤回工作立即生效、已扣費用不退。

### 3.3 感情（sentiment）

範圍 -100..100，初始值由劇本資料指定（`plan/14-scenario-data.md`）。每月 1 日結算變動，
再向 0 漂移 `BAL.sentimentDriftMonthly`（建議 1；即無事件時感情緩慢回歸中立）。
所有變動因素（正負號為對「B 對 A 感情」的影響，事件型為一次性，狀態型為每月）：

| 因素 | 型態 | 變動量（BAL 常數，建議值） |
|---|---|---|
| 交戰中（atWar） | 每月 | `BAL.sentimentAtWarMonthly = -2` |
| 接壤且無任何協定（邊境緊張） | 每月 | `BAL.sentimentBorderTensionMonthly = -0.5` |
| 共同敵人（雙方皆與同一第三勢力 atWar） | 每月 | `BAL.sentimentCommonEnemyMonthly = +1` |
| 締結不可侵條約 | 一次 | `BAL.sentimentPactSignedNonAggression = +10` |
| 締結同盟 | 一次 | `BAL.sentimentPactSignedAlliance = +20` |
| 締結婚姻同盟 | 一次 | `BAL.sentimentPactSignedMarriage = +30` |
| 成立停戰 | 一次 | `BAL.sentimentPactSignedCeasefire = +5` |
| 被 A 破棄協定（B 對 A） | 一次 | `BAL.sentimentBetrayalHit = -60` |
| A 破棄協定（所有第三勢力對 A） | 一次 | `BAL.betrayalGlobalSentimentHit = -10` |
| A 對 B 取得威風（小/中/大，B 對 A） | 一次 | `BAL.aweSentimentLoserHit = [-8, -15, -25]` |
| A 取得威風（A 的接壤第三勢力對 A，畏懼） | 一次 | `BAL.aweSentimentNeighborHit = [-3, -5, -8]` |
| A 擁立將軍（所有勢力對 A，敬意） | 一次 | `BAL.shogunPatronSentimentGain = +10` |
| 調略敗露（B 對 A，依調略種類） | 一次 | 見 §3.7 各項 |
| 引拔成功（B 對 A） | 一次 | `BAL.plotPoachSuccessSentimentHit = -20` |

漂移規則：月變動全部套用後，若 `sentiment > 0` 則 `-BAL.sentimentDriftMonthly`，
若 `< 0` 則 `+BAL.sentimentDriftMonthly`，跨越 0 時取 0。最後 clamp 至 [-100, 100]。

### 3.4 外交行動表

所有行動由 `proposePact` Command 發起，產生 `DiplomacyProposal` 送達對方；
對方為 AI 時於**同一 tick 的 diplomacy 步驟**以 §5.6 公式即時判定；對方為玩家時觸發
「外交來使」自動暫停（00 §5.2），提案存活 `BAL.dipProposalExpiryDays`（建議 30）日，逾期視同拒絕。
成立時：扣提案方信用與金錢、建立 Pact、套用一次性感情變化、發 GameEvent。

#### 3.4.1 行動總表

| 行動 | 前置條件 | 信用成本 | 金錢成本 | 期限 | 效果 |
|---|---|---|---|---|---|
| 不可侵條約 | 非交戰中；無生效中不可侵/同盟/從屬 | `BAL.trustCostNonAggression = 30` | 0 | `BAL.nonAggressionMonths = 24` 月 | 雙方不可攻擊對方城/郡、不可對對方調略（引拔/流言/內應指令對其無效） |
| 同盟 | 非交戰中；信用 ≥ 成本；無從屬關係 | `BAL.trustCostAlliance = 60` | 0 | `BAL.allianceMonths = 60` 月 | 不可侵效果＋領土通行權（參見 04）＋可請求援軍＋可共同作戰（同一敵城/敵軍可協同，07） |
| 停戰 | 與目標 atWar | `BAL.trustCostCeasefire = 20` | 0 | `BAL.ceasefireMonths = 12` 月 | 雙方不可攻擊、部隊不可進入對方領土；**停戰期間絕對不可破棄** |
| 婚姻同盟 | 已有生效中同盟；雙方各有至少一名「適齡一門」（`kinship==='kin'`、年齡 `BAL.marriageMinAge=13`..`BAL.marriageMaxAge=45`、`spouseId===null`） | `BAL.trustCostMarriage = 40` | `BAL.goldCostMarriage = 500` | 附著於同盟 | 同盟到期日延長至「現在＋60 月」與原到期日之較大者；設定 `noBreakUntilDay = 現在 + BAL.marriageNoBreakMonths(=36) 月`；兩名一門武將互設 `spouseId` |
| 從屬勸告（強→弱） | `clanPower(我)/clanPower(目標) ≥ BAL.vassalDemandPowerRatio = 3.0` | 0 | 0 | 無期限 | 目標成為我方從屬：視同不可侵＋通行權；從屬方每月上繳金錢收入 × `BAL.vassalTributeRate = 0.15`（於 05 月收入結算轉移）；從屬方 AI 外交追隨宗主（09） |
| 從屬提案（弱→強） | `clanPower(目標)/clanPower(我) ≥ BAL.vassalOfferPowerRatio = 2.0` | 0 | 0 | 無期限 | 我方成為目標的從屬（效果同上，方向相反） |
| 援軍請求 | 與目標有生效中同盟；距上次請求 ≥ `BAL.reinforceCooldownMonths = 6` 月 | `BAL.trustCostReinforce = 20` | 0 | 一次性 | 向盟友請求對指定敵勢力出兵；AI 是否派兵、派多少（參見 09 §援軍）；玩家收到請求時以提案 UI 回覆 |
| 破棄 | 有生效中不可侵/同盟/從屬；`今日 ≥ noBreakUntilDay`；停戰不可破棄 | 0 | 0 | 即時 | 協定消滅；我方在對方處信用歸零；對方對我感情 `BAL.sentimentBetrayalHit = -60`；我方威信 `-BAL.betrayalPrestigeHit = 150`；所有第三勢力對我感情 `BAL.betrayalGlobalSentimentHit = -10` |

補充規則：

- 同一對勢力間，不可侵與同盟互斥（同盟涵蓋不可侵）；停戰可與任何狀態並存（但成立同盟時停戰自動作廢併入）。
- 協定到期：每日檢查 `expiryDay`；到期即移除並發報告，無感情變化（和平到期非背叛）。
- 從屬破棄：從屬方破棄＝獨立，宗主方破棄＝放逐，兩者皆套用完整破棄懲罰（見 §8 決策 D6）。
- 婚姻武將死亡不解除婚姻強化效果（`noBreakUntilDay` 與延長照舊），僅清除 `spouseId`。
- 對從屬我方的勢力與宗主，不可再提不可侵/同盟（從屬已涵蓋）。

#### 3.4.2 信用與金錢扣款時機

提案送出時**凍結檢查**（信用、金錢、前置條件不足則 Command 驗證失敗，不產生提案）；
對方接受的當下再次檢查並扣款，若此時信用/金錢已不足，提案自動失敗並發報告（不進冷卻）。

#### 3.4.3 停戰的絕對效力

停戰協定無 `breakPact` 路徑：期間內任何攻擊性 Command（出陣目標為對方城/郡）驗證失敗。
朝廷停戰斡旋（§3.5.3）產生的停戰同樣絕對。此設計保證「花信用/友好度買到的和平」不會被瞬間撕毀。

### 3.5 朝廷

#### 3.5.1 朝廷友好度

- 各勢力對朝廷有友好度 `courtFavor`：0..`BAL.courtFavorMax = 100`。
- 以「獻金工作」（外交工作、目標＝朝廷）累積：每月 `BAL.courtFavorGainBase(=2) + 政務/BAL.courtFavorGainPolDivisor(=40)`。
- 當月無獻金工作則衰減 `BAL.courtFavorDecayMonthly = 1`（下限 0）。
- 友好度是官位敘任的**門檻**（不消耗）與停戰斡旋的**消耗資源**。

#### 3.5.2 官位表（八階，canonical）

敘任規則：以 `requestCourtRank` Command 申請；必須逐階敘任（下一階＝現階＋1）；
條件＝友好度達標＋一次性獻金（金錢）；敘任即**永久取得**（不會失去；當主更替不影響，官位屬勢力名義）；
威信加成於敘任時一次性加算至勢力威信；解鎖效果持續有效。僅最高官位的名稱顯示於 UI。

| 階 | id | 官位 | 友好度需求 | 獻金（貫） | 威信加成 | 解鎖效果 |
|---|---|---|---|---|---|---|
| 1 | `ju5ge` | 從五位下 | 20 | 300 | +50 | — |
| 2 | `ju5jo` | 從五位上 | 30 | 500 | +80 | 外交工作信用增益 ×1.1（`trustGainBonus`） |
| 3 | `ju4ge` | 從四位下 | 40 | 800 | +120 | 解鎖**停戰斡旋**（`mediation`） |
| 4 | `ju4jo` | 從四位上 | 50 | 1200 | +170 | **政策槽 +1**（`policySlot`，參見 05） |
| 5 | `ju3` | 從三位 | 60 | 1800 | +230 | 從屬勸告接受度 +10（`vassalDemandBonus`） |
| 6 | `sho3` | 正三位 | 70 | 2500 | +300 | 停戰斡旋友好度成本 ×0.75（`mediationDiscount`） |
| 7 | `ju2` | 從二位 | 85 | 3500 | +400 | 同盟／不可侵接受度 +5（`allianceBonus`） |
| 8 | `sho2` | 正二位 | 95 | 5000 | +550 | **政策槽再 +1**（`policySlot`，與第 4 階累計共 +2） |

上表以常數 `BAL.courtRankTable`（`CourtRankDef[]`）實作於 `balance.ts`；官位階集合與
`id` 一律採 02 §3.3 的 `CourtRank` enum 值（`crank.` 前綴廢除，enum 值即識別符；勘誤 E-25）。
各階的友好度需求／獻金／威信加成／解鎖效果之值依 15 §5.2 表 G。

#### 3.5.3 停戰斡旋

- 條件：我方官位 ≥ 第 3 階（從四位下）；與目標 atWar；我方對「斡旋」的冷卻已過
  （每勢力共用一個冷卻：`BAL.courtMediationCooldownMonths = 12`，成功失敗皆起算）。
- 成本：朝廷友好度 `BAL.courtMediationFavorCost = 40`（第 6 階持有者 ×0.75，四捨五入）＋
  金錢 `BAL.courtMediationGoldCost = 500` 貫。
- 判定（使用 `rng.misc`）：`rankDiff = max(0, 目標官位階 − 我方官位階)`；
  `失敗率 = clamp(BAL.courtMediationFailBase(=0.1) + rankDiff × BAL.courtMediationFailPerRank(=0.2), 0, BAL.courtMediationFailMax(=0.8))`。
  對方官位高於我方時，朝廷偏袒高位者，失敗率顯著上升。
- 成功：**強制**建立我方與目標的停戰 `BAL.courtMediationCeasefireMonths = 6` 月（不需對方同意、不扣信用）。
- 失敗：友好度全額消耗、金錢退還一半（250 貫）、發報告。

### 3.6 幕府

#### 3.6.1 存續狀態

s1560 開局：室町幕府存續，將軍足利義輝（`off.ashikaga-yoshiteru`）在世、居於京都。
`shogunate.exists = true`。幕府滅亡事件（觸發條件與演出參見 10）將 `exists` 設為 `false`，
處理見 §3.6.4。

#### 3.6.2 幕府友好度與役職表（五階，canonical）

幕府友好度累積方式與朝廷相同（獻金工作、同公式、同衰減；常數
`BAL.shogunateFavorGainBase = 2`、`BAL.shogunateFavorGainPolDivisor = 40`、
`BAL.shogunateFavorDecayMonthly = 1`）。役職以 `requestShogunateTitle` 申請，
逐階敘任、威信一次性加算（但幕府滅亡時**收回**，見 §3.6.4）、效果持有期間有效。

| 階 | id | 役職 | 條件 | 獻金（貫） | 威信加成 | 效果 |
|---|---|---|---|---|---|---|
| 1 | `hokoshu` | 奉公眾 | 威信 ≥ 150、幕府友好度 ≥ 30 | 500 | +60 | 幕府相關歷史事件解鎖額外選項（參見 10） |
| 2 | `otomoshu` | 御供眾 | 威信 ≥ 350、友好度 ≥ 50、任奉公眾 | 1000 | +120 | 外交工作與獻金工作每月費用 ×0.8 |
| 3 | `shobanshu` | 相伴眾 | 威信 ≥ 600、友好度 ≥ 70、任御供眾 | 2000 | +200 | 從屬勸告接受度 +15 |
| 4 | `kanrei` | 管領 | 威信 ≥ 900、友好度 ≥ 85、任相伴眾、**控制京都所在城或為擁立者** | 3500 | +300 | **政策槽 +1**（參見 05） |
| 5 | `fukushogun` | 副將軍 | 威信 ≥ 1200、友好度 ≥ 90、**必須為擁立將軍者**、任管領 | 5000 | +400 | 大義名分：我方所有外交行動接受度 +10 |

上表以常數 `BAL.shogunateTitleTable`（`ShogunateTitleDef[]`）實作；役職 `id` 一律採 02 §3.3 的
`ShogunateTitle` enum 值（`stitle.` 前綴廢除；勘誤 E-26），逐階值依 15 §5.2 表 H。

#### 3.6.3 上洛與將軍擁立

- 「京都所在城」由劇本資料欄位 `scenario.court.capitalCastleId` 指定（s1560 ＝ 二條御所所在之
  `castle.nijo`，資料細節參見 14）。
- 擁立條件（`nominateShogun`）：`shogunate.exists`、`patronClanId === null`（全域唯一）、
  我方控制京都所在城、幕府友好度 ≥ `BAL.shogunNominateFavorMin = 50`。
- 效果：`patronClanId = 我方`；一次性威信 `+BAL.shogunNominatePrestigeGain = 300`；
  所有勢力對我感情一次性 `+BAL.shogunPatronSentimentGain = 10`；
  此後每月威信 `+BAL.shogunPatronMonthlyPrestige = 5`；幕府役職獻金 ×`BAL.shogunPatronTitleCostMult = 0.5`；
  解鎖副將軍申請資格。
- 資格喪失：月初檢查，若擁立者不再控制京都所在城，`patronClanId` 歸 `null`；
  一次性威信不收回，每月威信與費用減免即刻停止；副將軍役職若已敘任則保留（其條件僅於敘任時檢查）。

#### 3.6.4 幕府滅亡的處理

由 10 的事件引擎呼叫本系統的 `collapseShogunate(state)`（本文件 §5.4.3）：

1. `shogunate.exists = false`、`patronClanId = null`。
2. 各勢力已敘任役職的威信加成總額（依 `BAL.shogunateTitleTable` 重算）自其威信扣除（下限 0），
   `grantedTitle` 全部清空。役職效果（費用減免、接受度加成、政策槽）即刻失效——
   政策槽減少導致超編時的卸除規則參見 05。
3. 幕府友好度凍結保留（無任何用途）；目標為幕府的獻金工作自動中止並發報告。
4. 此後 `requestShogunateTitle`／`nominateShogun` Command 驗證一律失敗；朝廷系統**不受影響**。

### 3.7 調略（對敵勢力的諜報行動）

共通規則：

- 以 `startPlot` 下達；執行武將條件同外交工作（未出陣、一人一件）。
- 每勢力並行調略上限 `BAL.plotMaxConcurrent = 3`；同一目標（武將或城）同時僅能有我方一件同種調略。
- 對不可侵／同盟／停戰／從屬對象不可發動任何調略（Command 驗證失敗）。
- 多月進度制：每月 1 日進度 +（依種類公式），滿 100 時以 `rng.misc` 判定成功／失敗。
- 每月扣維持費；一次性投入 `investGold` 於下達時扣款（不退）。金錢不足以付月費時自動中止。
- 敗露：成功不敗露；**失敗時**以各種類的敗露率判定，敗露則目標勢力對我感情下降並套用反制效果，
  且我方該次調略作廢；未敗露僅作廢，可重新下達。
- 可隨時 `cancelPlot` 中止（無退款、不判定敗露）。

#### 3.7.1 引拔（poach）——挖角敵方武將

| 項目 | 規格 |
|---|---|
| 目標條件 | 敵方武將：`loyalty < BAL.plotPoachLoyaltyThreshold = 75`、非當主、非一門（`kinship !== 'kin'`）、未被俘 |
| 執行週期 | 每月進度 `+ BAL.plotPoachProgressBase(=25) + 知略/BAL.plotPoachProgressIntDivisor(=4)`（知略 100 → 50/月，約 2 個月） |
| 費用 | 每月 `BAL.plotMonthlyCost = 30` 貫；一次性投入 `investGold ∈ {0, 200, 500, 1000}`（下達時四選一） |
| 成功率 | `p = clamp(BAL.plotPoachBase(=0.10) + (100 − 目標忠誠)/BAL.plotPoachLoyaltyDivisor(=200) + (知略 − 50)/BAL.plotPoachIntDivisor(=300) + investGold/BAL.plotPoachGoldDivisor(=2500), BAL.plotPoachPMin(=0.05), BAL.plotPoachPMax(=0.85))` |
| 成功效果 | 目標即日移籍我方（安置於我方本城、官職與知行剝奪、忠誠設為 `BAL.poachedInitialLoyalty = 45`（名/值依 15 §5.2、勘誤 E-33）；移籍細節參見 06）；原主對我感情 `-20`（`BAL.plotPoachSuccessSentimentHit`） |
| 失敗敗露 | 敗露率 `BAL.plotExposeChancePoach = 0.5`；敗露→目標勢力對我感情 `BAL.plotPoachExposeSentimentHit = -15`、目標武將忠誠 `+BAL.plotPoachExposeLoyaltyGain = 10`（警覺） |

#### 3.7.2 流言（rumor）——動搖忠誠或士氣

兩種模式擇一（下達時指定）：對**武將**（降低忠誠）或對**城**（降低城士氣，士氣定義參見 07）。

| 項目 | 規格 |
|---|---|
| 目標條件 | 武將模式：任意敵方武將；城模式：任意敵城 |
| 執行週期 | 每月進度 `+ BAL.plotRumorProgressBase(=30) + 知略/4`（約 2 個月） |
| 費用 | 每月 `BAL.plotMonthlyCost = 30` 貫；無一次性投入（`investGold = 0`） |
| 成功率 | `p = clamp(BAL.plotRumorBase(=0.55) + (我方知略 − 反制知略)/BAL.plotRumorIntDivisor(=250), 0.25, 0.90)`；反制知略＝目標武將所在城城主知略（城模式＝該城城主知略；城主空缺以 50 計） |
| 成功效果 | 武將模式：目標忠誠 `-BAL.plotRumorLoyaltyHit = 12`；城模式：城士氣 `-BAL.plotRumorMoraleHit = 15` |
| 失敗敗露 | 敗露率 `BAL.plotExposeChanceRumor = 0.3`；敗露→感情 `BAL.plotRumorExposeSentimentHit = -8` |

#### 3.7.3 內應（betrayal）——策反敵城城主

| 項目 | 規格 |
|---|---|
| 目標條件 | 敵城，其城主（`lordId`）存在、非當主、`loyalty < BAL.plotBetrayalLoyaltyThreshold = 70`、該城未在內應免疫期 |
| 執行週期 | 每月進度 `+ BAL.plotBetrayalProgressBase(=12) + 知略/BAL.plotBetrayalProgressIntDivisor(=6)`（知略 100 → 約 29/月，約 4–6 個月） |
| 費用 | 每月 `BAL.plotMonthlyCost × BAL.plotBetrayalCostMult(=2) = 60` 貫；一次性投入 `investGold ≥ BAL.plotBetrayalMinInvestGold = 500`（500/1000/2000 三檔） |
| 成功率 | `p = clamp(BAL.plotBetrayalBase(=0.20) + (100 − 城主忠誠)/BAL.plotBetrayalLoyaltyDivisor(=250) + 知略/BAL.plotBetrayalIntDivisor(=400) + investGold/BAL.plotBetrayalGoldDivisor(=4000), 0.05, BAL.plotBetrayalPMax(=0.60))` |
| 成功效果 | 該城標記 `betrayalReadyClanId = 我方`、`betrayalReadyUntilDay = 今日 + BAL.plotBetrayalMarkMonths(=12)×30`；我軍圍攻該城期間可下達 `activateBetrayal` **發動**：城士氣立即降至 `BAL.plotBetrayalMoraleFloor = 5`、該城主忠誠歸 0（攻城與戰後捕虜處理參見 07／06）；發動後標記清除 |
| 失敗敗露 | 敗露率 `BAL.plotExposeChanceBetrayal = 0.6`；敗露→感情 `BAL.plotBetrayalExposeSentimentHit = -25`、城主忠誠 `+15`（`BAL.plotBetrayalExposeLoyaltyGain`）、該城進入內應免疫 `BAL.plotBetrayalImmunityMonths = 12` 個月 |

標記失效：城易主、城主更替、或超過 `betrayalReadyUntilDay`，標記即清除（每日檢查）。

### 3.8 與 AI 的介面

本文件輸出兩個純函式供 09 與本系統共用（實作於 `diplomacy.ts`）：

1. `clanPower(state, clanId): number` —— 勢力綜合國力（§5.6.1），從屬勸告門檻與接受度共用。
2. `evaluateProposal(state, proposal): { score: number; accept: boolean }` ——
   接受度評分（§5.6.2）。**AI 收到任何提案（含玩家提案與 AI 互相提案）一律以此函式判定**，
   無隨機成分（決定論、且玩家可透過 UI 預估）。AI 何時主動送出提案、破棄與援軍派兵行為屬 09。

## 4. 資料結構

以下 interface 由 `plan/02-data-model.md` 彙整定案；欄位單位與註解如下。

```ts
// ===== 識別子（ID 規範見 00 §8）=====
type ClanId = string;      // 'clan.oda'
type OfficerId = string;   // 'off.oda-nobunaga'
type CastleId = string;    // 'castle.kiyosu'
type PactId = string;      // 'pact.0001'（執行期序號產生）
type PlotId = string;      // 'plot.0001'
type ProposalId = string;  // 'prop.0001'

// ===== 協定 =====
/** 協定種類（不可侵／同盟／停戰／從屬；婚姻是同盟的強化旗標，非獨立種類） */
export type PactKind = 'nonAggression' | 'alliance' | 'ceasefire' | 'vassal';

/** 生效中的協定。全域唯一登記於 DiplomacyState.pacts，雙方 row 以 pactIds 引用。 */
export interface Pact {
  id: PactId;
  kind: PactKind;
  clanAId: ClanId;                 // 兩造，clanAId 取字典序較小者（正規化，確保決定論）
  clanBId: ClanId;
  signedDay: number;               // 簽訂日（絕對日數：自劇本開始的 tick 序號）
  expiryDay: number;               // 到期日（絕對日數）；vassal 為 Number.MAX_SAFE_INTEGER（無期限）
  noBreakUntilDay: number;         // 此日（含）之前不可破棄；0 = 無限制（ceasefire 恆不可破棄，不看此欄）
  marriage: boolean;               // 僅 alliance：是否經婚姻強化
  marriageOfficerIds: [OfficerId, OfficerId] | null; // 成婚兩武將（clanA 方在前）
  overlordClanId: ClanId | null;   // 僅 vassal：宗主方
}

// ===== 外交列 =====
/** 勢力 owner 對 other 的外交列。方向性約定見 §3.1。 */
export interface DiplomacyRow {
  otherClanId: ClanId;
  trust: number;                   // 0..100（點）：owner 在 other 處累積的信用
  sentiment: number;               // -100..100（點）：other 對 owner 的感情（允許小數累積）
  pactIds: PactId[];               // 生效中協定（與鏡像 row 完全一致）
  lastHostileDay: number;          // 最近敵對行為日（絕對日數）；-1 = 從未
  lastReinforceRequestDay: number; // 最近援軍請求日；-1 = 從未（冷卻用）
  refusalCooldownUntilDay: Partial<Record<DiplomacyActionKind, number>>; // 各行動被拒後的冷卻期限
}

// ===== 外交工作 =====
export type DiplomacyWorkTarget =
  | { type: 'clan'; clanId: ClanId }   // 對勢力：累積信用
  | { type: 'court' }                  // 對朝廷：累積朝廷友好度（獻金工作）
  | { type: 'shogunate' };             // 對幕府：累積幕府友好度（獻金工作）

export interface DiplomacyWork {
  officerId: OfficerId;            // 擔當武將（佔用：不可出陣、不可另任工作/調略）
  target: DiplomacyWorkTarget;
  startedDay: number;              // 開始日（絕對日數）
}

// ===== 調略 =====
export type PlotKind = 'poach' | 'rumor' | 'betrayal';  // 引拔／流言／內應（00 §14）

export interface Plot {
  id: PlotId;
  kind: PlotKind;
  ownerClanId: ClanId;             // 發動方
  officerId: OfficerId;            // 執行武將（佔用規則同外交工作）
  targetClanId: ClanId;            // 目標勢力
  targetOfficerId: OfficerId | null; // poach／rumor(武將模式) 必填；betrayal = 目標城城主快照
  targetCastleId: CastleId | null;   // rumor(城模式)／betrayal 必填
  investGold: number;              // 一次性投入（貫）；下達時已扣款
  progress: number;                // 0..100（點）
  startedDay: number;              // 開始日（絕對日數）
}

// ===== 提案 =====
export type DiplomacyActionKind =
  | 'proposeNonAggression'  // 不可侵條約
  | 'proposeAlliance'       // 同盟
  | 'proposeCeasefire'      // 停戰
  | 'proposeMarriage'       // 婚姻同盟
  | 'demandVassal'          // 從屬勸告（強→弱）
  | 'offerVassal'           // 從屬提案（弱→強）
  | 'requestReinforce';     // 援軍請求

export interface DiplomacyProposal {
  id: ProposalId;
  kind: DiplomacyActionKind;
  fromClanId: ClanId;
  toClanId: ClanId;
  createdDay: number;              // 建立日（絕對日數）
  expiresDay: number;              // 逾期日 = createdDay + BAL.dipProposalExpiryDays；逾期視同拒絕
  marriageOfficerIds: [OfficerId, OfficerId] | null; // 婚姻：〔from 方一門, to 方一門〕，建立時即選定
  reinforceAgainstClanId: ClanId | null;             // 援軍請求：對抗的敵勢力
}

// ===== 朝廷與幕府（GameState.court）=====
export interface CourtState {
  courtFavor: Record<ClanId, number>;         // 朝廷友好度 0..100（點）
  courtRankByClan: Record<ClanId, number>;       // 已敘任最高官位階 0(無)..8
  mediationCooldownUntilDay: Record<ClanId, number>; // 停戰斡旋冷卻期限（絕對日數）
  shogunate: ShogunateState;
}

// 幕府役職 enum：02 §3.3 定案（`stitle.` 前綴廢除、enum 值即識別符；勘誤 E-26）。
// 可敘任的五階＝hokoshu…fukushogun；'none'（無役職）與 'shogun'（征夷大將軍，將軍本人）不經敘任取得。
export type ShogunateTitle =
  | 'none' | 'hokoshu' | 'otomoshu' | 'shobanshu'
  | 'kanrei' | 'fukushogun' | 'shogun';

export interface ShogunateState {
  exists: boolean;                 // 幕府存續；10 的幕府滅亡事件設為 false
  shogunOfficerId: OfficerId;      // 'off.ashikaga-yoshiteru'（s1560）
  patronClanId: ClanId | null;     // 擁立將軍的勢力（全域至多一個）
  shogunateFavor: Record<ClanId, number>;              // 幕府友好度 0..100（點）
  grantedTitle: Record<ClanId, ShogunateTitle | null>; // 已敘任最高役職
}

// ===== 外交總狀態（GameState.diplomacy）=====
export interface ClanDiplomacyState {
  rows: Record<ClanId, DiplomacyRow>;  // 對每個其他存活勢力一列
  works: DiplomacyWork[];              // ≤ BAL.diplomacyWorkMaxConcurrent
  plots: Plot[];                       // ≤ BAL.plotMaxConcurrent
}

export interface DiplomacyState {
  byClan: Record<ClanId, ClanDiplomacyState>;
  pacts: Record<PactId, Pact>;
  pendingProposals: DiplomacyProposal[];
  nextPactSerial: number;              // 產生 'pact.0001' 用
  nextProposalSerial: number;
  nextPlotSerial: number;
  adjacencyCache: string[];            // "clanA|clanB"（字典序），每月 1 日重算
}

// ===== 平衡表列型別（balance.ts）=====
export type CourtRankUnlock =
  | 'mediation' | 'policySlot' | 'trustGainBonus'
  | 'mediationDiscount' | 'vassalDemandBonus' | 'allianceBonus';

export interface CourtRankDef {
  rank: number;          // 1..8
  id: CourtRank;         // 02 §3.3 CourtRank enum 值（如 'ju5ge'；`crank.` 前綴廢除，勘誤 E-25）
  name: string;          // '從五位下'（顯示名，專有名詞不進 i18n）
  favorRequired: number; // 敘任所需朝廷友好度（門檻，不消耗）
  goldCost: number;      // 一次性獻金（貫）
  prestigeBonus: number; // 敘任時一次性威信加成（點）
  unlock: CourtRankUnlock | null;
}

export type ShogunateTitleEffect =
  | 'eventOption' | 'workCostDiscount' | 'vassalDemandBonus'
  | 'policySlot' | 'acceptanceAura';

export interface ShogunateTitleDef {
  order: number;                   // 1..5
  id: ShogunateTitle;              // 02 §3.3 enum 值（可敘任五階；勘誤 E-26）
  name: string;                    // '奉公眾' 等
  prestigeRequired: number;        // 威信門檻（點）
  favorRequired: number;           // 幕府友好度門檻（點）
  goldCost: number;                // 一次性獻金（貫）
  requiresCapitalOrPatron: boolean;// 管領：需控制京都所在城或為擁立者
  requiresPatron: boolean;         // 副將軍：必須為擁立者
  prestigeBonus: number;           // 敘任時一次性威信加成（幕府滅亡時收回）
  effect: ShogunateTitleEffect;
}

// ===== Command（併入 03 的 Command 聯集）=====
export type DiplomacyCommand =
  | { type: 'startDiploWork'; clanId: ClanId; officerId: OfficerId; target: DiplomacyWorkTarget }
  | { type: 'stopDiploWork'; clanId: ClanId; officerId: OfficerId }
  | { type: 'proposePact'; clanId: ClanId; kind: DiplomacyActionKind; targetClanId: ClanId;
      reinforceAgainstClanId?: ClanId; marriageOfficerId?: OfficerId /* 我方一門，婚姻用 */ }
  | { type: 'respond'; clanId: ClanId; proposalId: ProposalId; accept: boolean }
  | { type: 'breakPact'; clanId: ClanId; pactId: PactId }
  | { type: 'requestCourtRank'; clanId: ClanId }
  | { type: 'requestMediation'; clanId: ClanId; targetClanId: ClanId }
  | { type: 'requestShogunateTitle'; clanId: ClanId }
  | { type: 'nominateShogun'; clanId: ClanId }
  | { type: 'startPlot'; clanId: ClanId; kind: PlotKind; officerId: OfficerId;
      targetClanId: ClanId; targetOfficerId?: OfficerId; targetCastleId?: CastleId; investGold: number }
  | { type: 'cancelPlot'; clanId: ClanId; plotId: PlotId }
  | { type: 'activateBetrayal'; clanId: ClanId; castleId: CastleId };
```

跨域欄位（於 02 定案，責任歸屬如下）：

- `Officer.kinship: Kinship`（一門／譜代／外樣；一門＝`kinship==='kin'`，勘誤 E-34）、`Officer.spouseId: OfficerId | null` —— 婚姻同盟使用（06 定義一門本體與 `Kinship` 型別）。
- `Castle.betrayalReadyClanId: ClanId | null`、`Castle.betrayalReadyUntilDay: number` —— 內應標記。
- `Clan.prestige`（威信 0..2000）已於 00 §6 定義，本系統讀寫。

不變量（invariants，02 彙整）：

1. `rows[A][B].pactIds` 與 `rows[B][A].pactIds` 恆相等（鏡像一致）。
2. `trust ∈ [0,100]`、`sentiment ∈ [-100,100]`、`courtFavor/shogunateFavor ∈ [0,100]`、`progress ∈ [0,100]`。
3. 一名武將至多出現在全域一件 `DiplomacyWork` 或 `Plot` 中。
4. 同對勢力間 `nonAggression` 與 `alliance` 不並存；`vassal` 與兩者不並存。
5. `patronClanId` 全域至多一個；`shogunate.exists === false` 時 `grantedTitle` 全為 `null`。
6. 勢力滅亡（參見 10）時：其 rows、works、plots、pendingProposals、pacts 全數移除，
   其官位／役職／友好度紀錄刪除；他勢力對其之列同步移除。

GameEvent 種類（併入 03 事件匯流排；payload 從略，均含當事勢力與日期）：
`pact.signed`、`pact.expired`、`pact.broken`、`dip.proposalReceived`、
`dip.proposalResolved`、`dip.workStopped`、`court.rankGranted`、`court.mediationResult`、
`shogunate.titleGranted`、`shogunate.nominated`、`shogunate.patronLost`、`shogunate.collapsed`、
`plot.completed`、`plot.failed`、`plot.exposed`、`plot.betrayalActivated`。

## 5. 演算法與公式

### 5.1 tick 整合（00 §5.4 第 4 步 `diplomacy`）

```
diplomacyDailyTick(state):
  # 每日
  1. 協定到期：for pact in pacts（依 id 序）: if day > pact.expiryDay → 移除（雙側 pactIds 同步）、emit pact.expired
  2. 提案逾期：for prop in pendingProposals: if day > prop.expiresDay → 視同拒絕（進冷卻）、emit dip.proposalResolved
  3. 內應標記逾期／失效檢查（城易主、城主更替、day > betrayalReadyUntilDay → 清除標記）
  4. if 月初(日==1): diplomacyMonthlyTick(state)

diplomacyMonthlyTick(state):
  0. 重算 adjacencyCache（掃描全部 RoadEdge 兩端歸屬，參見 04）
  for clan in clans（依 clanId 字典序，確保決定論）:
    1. 工作扣費：每件 work 依目標扣月費（含御供眾 ×0.8）；金錢不足 → 中止該件、emit dip.workStopped
    2. 工作結算：對勢力 → trust += trustGainMonthly()（§5.2.1，clamp 0..100）
                對朝廷/幕府 → favor += favorGainMonthly()（§5.2.2，clamp 0..100）
    3. 調略扣費與進度（§5.5.1）；progress ≥ 100 → resolvePlot()（§5.5.2）
    4. 感情月變動（§5.2.3：交戰/接壤緊張/共同敵人）
    5. 感情漂移向 0（BAL.sentimentDriftMonthly）並 clamp
    6. 朝廷/幕府友好度衰減（當月無對應獻金工作時 −BAL.courtFavorDecayMonthly / shogunateFavorDecayMonthly）
    7. 擁立者資格檢查（§3.6.3）；擁立者每月威信 +BAL.shogunPatronMonthlyPrestige
```

Command 於 tick 第 1 步 `applyCommands` 套用（03）；本系統的 Command 驗證器與效果見 §5.3。
所有隨機判定（調略成敗、敗露、斡旋失敗）一律使用 `rng.misc` 流；
`evaluateProposal` 無隨機成分。

### 5.2 信用與感情公式

#### 5.2.1 信用月增益

```
trustGainMonthly(officer, row, clan):
  base    = BAL.trustGainBase(=2) + officer.pol / BAL.trustGainPolDivisor(=25)
  traitM  = 特性倍率 diplomacyWorkMult（參見 06；無相關特性 = 1.0）
  sentM   = clamp(1 + row.sentiment / BAL.trustGainSentimentDivisor(=200), 0.5, 1.5)
  rankM   = 官位 unlock 含 trustGainBonus ? 1.1 : 1.0
  return base × traitM × sentM × rankM       # 政務100、感情0、無特性 → 6/月
```

#### 5.2.2 朝廷／幕府友好度月增益

```
favorGainMonthly(officer):  # 朝廷幕府同式，常數各自獨立
  return BAL.courtFavorGainBase(=2) + officer.pol / BAL.courtFavorGainPolDivisor(=40)
  # 幕府用 BAL.shogunateFavorGainBase(=2)、BAL.shogunateFavorGainPolDivisor(=40)
```

#### 5.2.3 感情月變動（狀態型）

```
sentimentMonthly(state, A, B):   # 更新 rows[A][B].sentiment（B 對 A 的感情）
  d = 0
  if atWar(A,B):                                  d += BAL.sentimentAtWarMonthly(=-2)
  elif adjacent(A,B) 且 A,B 間無任何協定:         d += BAL.sentimentBorderTensionMonthly(=-0.5)
  if 存在 C ≠ A,B 使 atWar(A,C) 且 atWar(B,C):    d += BAL.sentimentCommonEnemyMonthly(=+1)
  rows[A][B].sentiment = clamp(sentiment + d, -100, 100)
```

事件型變動（簽約、破棄、威風、擁立、調略敗露）於事件發生當下即時套用（§3.3 表）。

#### 5.2.4 威風掛鉤（由 07 於威風結算時呼叫）

```
applyAweDiplomacy(state, winner, loser, level /* 0=小,1=中,2=大 */):
  rows[winner][loser].sentiment   += BAL.aweSentimentLoserHit[level]      # [-8,-15,-25]
  for N in winner 的接壤勢力（adjacencyCache）且 N ≠ loser 且 N 非 winner 的同盟/從屬:
    rows[winner][N].sentiment     += BAL.aweSentimentNeighborHit[level]   # [-3,-5,-8]
  （皆 clamp 至 [-100,100]）
```

### 5.3 外交行動判定

#### 5.3.1 提案建立（`proposePact` 驗證器）

```
validatePropose(state, cmd):
  row = rows[cmd.clanId][cmd.targetClanId]
  1. 目標存活且 ≠ 自己；day ≥ row.refusalCooldownUntilDay[cmd.kind]（未設 = 0）
  2. 依 §3.4.1 檢查前置條件（atWar/協定互斥/國力比/一門適齡/同盟存在…）
  3. trust ≥ 行動信用成本；clan.gold ≥ 行動金錢成本
  4. 同對象同種提案已存在於 pendingProposals → 失敗
  婚姻：cmd.marriageOfficerId 為我方合法適齡一門；對方一門自動選定：
        「年齡最小者，同齡取 OfficerId 字典序小者」（決定論）
  通過 → 建立 DiplomacyProposal 加入 pendingProposals；
        目標為 AI → 本 tick diplomacy 步驟內即時 resolveProposal；
        目標為玩家 → emit dip.proposalReceived（觸發自動暫停「外交來使」）
```

#### 5.3.2 提案結算

```
resolveProposal(state, prop, accept):
  from pendingProposals 移除
  if !accept:
    rows[from][to].refusalCooldownUntilDay[kind] = day + BAL.dipRefusalCooldownMonths(=3)×30
    emit dip.proposalResolved(拒絕); return
  再驗證前置與成本（§3.4.2），不足 → 自動失敗（不進冷卻）、emit dip.proposalResolved(失效)
  扣 from 方信用與金錢 → 依種類套用效果：
    proposeNonAggression → createPact('nonAggression', 期限 BAL.nonAggressionMonths×30)
    proposeAlliance      → 若有停戰 pact 先移除；createPact('alliance', BAL.allianceMonths×30)
    proposeCeasefire     → createPact('ceasefire', BAL.ceasefireMonths×30)
    proposeMarriage      → 同盟 pact.marriage = true；expiryDay = max(expiryDay, day + BAL.allianceMonths×30)
                           noBreakUntilDay = day + BAL.marriageNoBreakMonths(=36)×30
                           兩武將互設 spouseId
    demandVassal         → createPact('vassal', 無期限, overlordClanId = from)
    offerVassal          → createPact('vassal', 無期限, overlordClanId = to)
    requestReinforce     → rows[from][to].lastReinforceRequestDay = day；
                           派兵決策與部隊生成移交 09/07
  套用一次性感情（§3.3 表）；emit pact.signed / dip.proposalResolved
```

#### 5.3.3 破棄（`breakPact`）

```
validateBreak: pact 生效中、cmd.clanId 為當事方、pact.kind ≠ 'ceasefire'、day > pact.noBreakUntilDay
applyBreak(state, clan, pact):
  other = 對造
  移除 pact（雙側）
  rows[clan][other].trust = 0                                   # 信用歸零
  rows[clan][other].sentiment += BAL.sentimentBetrayalHit(=-60) # 對方對我感情大減
  clan.prestige = max(0, clan.prestige − BAL.betrayalPrestigeHit(=150))
  for C in 其他存活勢力: rows[clan][C].sentiment += BAL.betrayalGlobalSentimentHit(=-10)
  emit pact.broken
```

#### 5.3.4 停戰／同盟的軍事約束（供 04/07 讀取的謂詞）

```
canAttack(state, A, B)  := !hasPact(A,B,'ceasefire') && !hasPact(A,B,'alliance')
                           && !hasPact(A,B,'nonAggression') && !hasVassalRelation(A,B)
canPass(state, A, B)    := hasPact(A,B,'alliance') || hasVassalRelation(A,B)
canPlot(state, A, B)    := 無 ceasefire/alliance/nonAggression/vassal（§3.7 共通規則）
```

#### 5.3.5 援軍請求成本與冷卻

信用成本 `BAL.trustCostReinforce = 20` 於**盟友接受時**扣除；
冷卻 `day − lastReinforceRequestDay ≥ BAL.reinforceCooldownMonths(=6)×30` 於提案時檢查。
盟友（AI）是否接受不走 §5.6 通式，由 09 的援軍派兵邏輯判定（其輸入含本文件的
`clanPower`、sentiment、trust）。

#### 5.3.6 從屬上繳（於 05 月收入結算時呼叫）

```
vassalTribute(state, vassalClan):
  tribute = floor(vassalClan 當月金錢收入 × BAL.vassalTributeRate(=0.15))
  vassalClan.gold -= tribute; overlord.gold += tribute   # 參見 05 月結順序
```

### 5.4 朝廷與幕府演算法

#### 5.4.1 官位敘任（`requestCourtRank`）

```
next = courtRankByClan[clan] + 1；next ≤ 8
def  = BAL.courtRankTable[next-1]
驗證: courtFavor[clan] ≥ def.favorRequired 且 clan.gold ≥ def.goldCost
效果: gold -= def.goldCost；courtRankByClan[clan] = next；
      clan.prestige = min(2000, prestige + def.prestigeBonus)；emit court.rankGranted
（友好度為門檻不消耗；官位永久持有；unlock 效果由 selector 依 courtRankByClan 即時推導）
```

#### 5.4.2 停戰斡旋（`requestMediation`）

```
驗證: 官位階 ≥ 3；atWar(我, 目標)；day ≥ mediationCooldownUntilDay[我]
      favorCost = round(BAL.courtMediationFavorCost(=40) × (官位階 ≥ 6 ? 0.75 : 1))
      courtFavor ≥ favorCost 且 gold ≥ BAL.courtMediationGoldCost(=500)
執行: 扣 favorCost 與金錢
      failP = clamp(BAL.courtMediationFailBase(=0.1)
                    + max(0, 目標官位階 − 我官位階) × BAL.courtMediationFailPerRank(=0.2),
                    0, BAL.courtMediationFailMax(=0.8))
      if rng.misc() < failP: gold += 250（退還半額）；emit court.mediationResult(失敗)
      else: createPact('ceasefire', 期限 BAL.courtMediationCeasefireMonths(=6)×30)  # 強制，不需對方同意
            emit court.mediationResult(成功) + pact.signed
      mediationCooldownUntilDay[我] = day + BAL.courtMediationCooldownMonths(=12)×30
```

#### 5.4.3 役職敘任、擁立、幕府滅亡

```
requestShogunateTitle: 逐階；驗證 shogunate.exists、威信/友好度/前階/requiresCapitalOrPatron/requiresPatron、
  goldCost×(patron ? 0.5 : 1)；效果同官位（prestigeBonus 加算、grantedTitle 更新）

nominateShogun: 驗證 §3.6.3 條件 → patronClanId = clan；prestige += 300；
  for C ≠ clan: rows[clan][C].sentiment += BAL.shogunPatronSentimentGain(=10)；emit shogunate.nominated

collapseShogunate(state):   # 由 10 的事件引擎呼叫
  for clan with grantedTitle ≠ null:
    refund = Σ 該勢力已敘任各階 prestigeBonus（依 shogunateTitleTable 自 order 1 累計至現階）
    clan.prestige = max(0, clan.prestige − refund)；grantedTitle[clan] = null
  patronClanId = null；exists = false
  中止全部 target=shogunate 的獻金工作（emit dip.workStopped）；emit shogunate.collapsed
```

### 5.5 調略演算法

#### 5.5.1 進度與費用（每月）

```
plotMonthly(state, plot):
  cost = BAL.plotMonthlyCost(=30) × (plot.kind==='betrayal' ? BAL.plotBetrayalCostMult(=2) : 1)
  gold 不足 → cancelPlot（emit plot.failed）；否則 gold -= cost
  目標失效檢查（武將死亡/移籍、城易主、目標忠誠回升至門檻以上不中止——僅下達時檢查門檻）:
    目標消失 → cancelPlot
  progress += 進度增量（§3.7 各表；知略 = plot.officerId 的 int）
  if progress ≥ 100: resolvePlot(state, plot)
```

#### 5.5.2 成敗與敗露

```
resolvePlot(state, plot):
  p = 依種類公式（§3.7.1–3.7.3）
  if rng.misc() < p:
    套用成功效果（移籍/忠誠/士氣/內應標記）；emit plot.completed
  else:
    exposeP = BAL.plotExposeChance{Poach|Rumor|Betrayal}
    if rng.misc() < exposeP:
      套用敗露效果（感情/忠誠/免疫）；emit plot.exposed
    else: emit plot.failed
  自 plots 移除
```

#### 5.5.3 內應發動（`activateBetrayal`）

```
驗證: castle.betrayalReadyClanId === 我方 且 我方部隊正圍攻該城（07 的攻城狀態）
效果: castle.morale = min(castle.morale, BAL.plotBetrayalMoraleFloor(=5))
      城主 loyalty = 0；清除標記；emit plot.betrayalActivated（攻城後續參見 07）
```

### 5.6 AI 接受度評分

#### 5.6.1 勢力綜合國力

```
clanPower(state, clan) =
    Σ所轄郡石高 × BAL.powerKokudakaWeight(=0.001)
  + Σ所轄城現有兵力 × BAL.powerTroopsWeight(=0.01)
  + clan.prestige × BAL.powerPrestigeWeight(=0.1)
```

#### 5.6.2 接受度評分（`evaluateProposal`，B 評估 A 的提案）

```
score = base(kind)
      + rows[A][B].sentiment × BAL.dipSentimentWeight(=0.8)     # B 對 A 的感情
      + rows[A][B].trust     × BAL.dipTrustWeight(=0.6)         # A 在 B 處的信用
      + powerTerm + specialTerm
      + (A 為副將軍持有者 ? 10 : 0)                              # acceptanceAura
      + 官位/役職 unlock 修正（allianceBonus/vassalDemandBonus，僅對應種類）
accept := score ≥ BAL.dipAcceptThreshold(=60)

P = clanPower(A) / clanPower(B)
powerTerm  = clamp((P − 1) × BAL.dipPowerTermScale(=15), −BAL.dipPowerTermClamp(=25), +25)
```

| kind | base（BAL 常數，建議值） | specialTerm |
|---|---|---|
| proposeNonAggression | `BAL.dipBaseNonAggression = 20` | 共同敵人 `+BAL.dipCommonEnemyBonus(=20)` |
| proposeAlliance | `BAL.dipBaseAlliance = 0` | 共同敵人 +20；存在第三勢力 C 接壤雙方且 `clanPower(C) > 1.5×` 雙方各自國力 → 再 +15（`BAL.dipCommonThreatBonus`） |
| proposeCeasefire | `BAL.dipBaseCeasefire = -10` | B 佔優（`clanPower(B)/clanPower(A) ≥ BAL.ceasefireWinningRatio(=1.5)`）→ `BAL.ceasefireWinningPenalty(=-30)`；B 劣勢（`≤ BAL.ceasefireLosingRatio(=0.7)`）→ `BAL.ceasefireLosingBonus(=+40)` |
| proposeMarriage | `BAL.dipBaseMarriage = -10` | 同盟剩餘期限 < 12 月 → +15（`BAL.dipMarriageRenewBonus`，續盟誘因） |
| demandVassal | `BAL.dipBaseVassalDemand = -40` | powerTerm 改用 `(P − BAL.vassalDemandPowerRatio) × 30`（不 clamp 上限）；B 的本城正被圍攻 → +30（`BAL.dipVassalSiegeBonus`） |
| offerVassal | `BAL.dipBaseVassalOffer = 30` | 感情 < `BAL.dipVassalOfferMinSentiment(=-20)` → 直接拒絕（score 設 −999） |
| requestReinforce | 不走本式，見 §5.3.5（09） | — |

本函式為純函式、無隨機，UI 可直接呼叫顯示「成功見込：高／中／低」
（score ≥ 60 高、40..59 中、< 40 低）。

### 5.7 BAL 常數彙總（本文件引入；定案值以 15 為準）

| 常數 | 建議值 | 說明（單位） |
|---|---|---|
| `BAL.diplomacyWorkMonthlyCost` | 20 | 對勢力外交工作月費（貫） |
| `BAL.diplomacyWorkMaxConcurrent` | 6 | 外交工作並行上限（件） |
| `BAL.trustMax` | 100 | 信用上限（點） |
| `BAL.trustGainBase` / `trustGainPolDivisor` / `trustGainSentimentDivisor` | 2 / 25 / 200 | 信用月增益公式 |
| `BAL.warStateMonths` | 6 | 交戰狀態判定窗（月） |
| `BAL.sentimentDriftMonthly` | 1 | 感情向 0 漂移（點/月） |
| `BAL.sentimentAtWarMonthly` / `sentimentBorderTensionMonthly` / `sentimentCommonEnemyMonthly` | -2 / -0.5 / +1 | 感情月變動（點/月） |
| `BAL.sentimentPactSignedNonAggression/Alliance/Marriage/Ceasefire` | +10 / +20 / +30 / +5 | 簽約感情（點） |
| `BAL.sentimentBetrayalHit` / `betrayalGlobalSentimentHit` / `betrayalPrestigeHit` | -60 / -10 / 150 | 破棄懲罰（點） |
| `BAL.aweSentimentLoserHit` / `aweSentimentNeighborHit` | [-8,-15,-25] / [-3,-5,-8] | 威風感情（點，小/中/大） |
| `BAL.trustCostNonAggression/Alliance/Ceasefire/Marriage/Reinforce` | 30 / 60 / 20 / 40 / 20 | 信用成本（點） |
| `BAL.goldCostMarriage` | 500 | 婚姻金錢成本（貫） |
| `BAL.nonAggressionMonths` / `allianceMonths` / `ceasefireMonths` / `marriageNoBreakMonths` | 24 / 60 / 12 / 36 | 協定期限（月） |
| `BAL.vassalDemandPowerRatio` / `vassalOfferPowerRatio` / `vassalTributeRate` | 3.0 / 2.0 / 0.15 | 從屬（倍率／比例） |
| `BAL.reinforceCooldownMonths` | 6 | 援軍請求冷卻（月） |
| `BAL.dipProposalExpiryDays` / `dipRefusalCooldownMonths` | 30 / 3 | 提案時限（日）／拒絕冷卻（月） |
| `BAL.marriageMinAge` / `marriageMaxAge` | 13 / 45 | 適齡一門（歲） |
| `BAL.courtWorkMonthlyCost` / `shogunateWorkMonthlyCost` | 50 / 50 | 獻金工作月費（貫） |
| `BAL.courtFavorGainBase` / `courtFavorGainPolDivisor` / `courtFavorDecayMonthly` / `courtFavorMax` | 2 / 40 / 1 / 100 | 朝廷友好度（幕府另有同構常數 `shogunateFavor*`） |
| `BAL.courtRankTable` | §3.5.2 表 | 官位八階定義 |
| `BAL.courtMediationFavorCost/GoldCost/CeasefireMonths/FailBase/FailPerRank/FailMax/CooldownMonths` | 40 / 500 / 6 / 0.1 / 0.2 / 0.8 / 12 | 停戰斡旋 |
| `BAL.shogunateTitleTable` | §3.6.2 表 | 役職五階定義 |
| `BAL.shogunNominateFavorMin` / `shogunNominatePrestigeGain` / `shogunPatronMonthlyPrestige` / `shogunPatronSentimentGain` / `shogunPatronTitleCostMult` | 50 / 300 / 5 / 10 / 0.5 | 將軍擁立 |
| `BAL.plotMaxConcurrent` / `plotMonthlyCost` | 3 / 30 | 調略共通（件／貫） |
| `BAL.plotPoachLoyaltyThreshold/ProgressBase/ProgressIntDivisor/Base/LoyaltyDivisor/IntDivisor/GoldDivisor/PMin/PMax` | 75 / 25 / 4 / 0.10 / 200 / 300 / 2500 / 0.05 / 0.85 | 引拔（進度／成功率） |
| `BAL.poachedInitialLoyalty` | 45 | 引拔成功移籍後初始忠誠（名依 06、值依 15 §5.2；勘誤 E-33，原 `plotPoachInitialLoyalty=60` 併入） |
| `BAL.plotPoachSuccessSentimentHit` / `plotExposeChancePoach` / `plotPoachExposeSentimentHit` / `plotPoachExposeLoyaltyGain` | -20 / 0.5 / -15 / +10 | 引拔感情與敗露 |
| `BAL.plotRumorProgressBase/Base/IntDivisor/LoyaltyHit/MoraleHit` / `plotExposeChanceRumor` / `plotRumorExposeSentimentHit` | 30 / 0.55 / 250 / 12 / 15 / 0.3 / -8 | 流言 |
| `BAL.plotBetrayalLoyaltyThreshold/ProgressBase/ProgressIntDivisor/CostMult/MinInvestGold/Base/LoyaltyDivisor/IntDivisor/GoldDivisor/PMax` | 70 / 12 / 6 / 2 / 500 / 0.20 / 250 / 400 / 4000 / 0.60 | 內應 |
| `BAL.plotBetrayalMarkMonths/MoraleFloor` / `plotExposeChanceBetrayal` / `plotBetrayalExposeSentimentHit/ExposeLoyaltyGain/ImmunityMonths` | 12 / 5 / 0.6 / -25 / +15 / 12 | 內應標記與敗露 |
| `BAL.powerKokudakaWeight/TroopsWeight/PrestigeWeight` | 0.001 / 0.01 / 0.1 | 國力公式 |
| `BAL.dipSentimentWeight/TrustWeight/AcceptThreshold/PowerTermScale/PowerTermClamp/CommonEnemyBonus/CommonThreatBonus` | 0.8 / 0.6 / 60 / 15 / 25 / 20 / 15 | 接受度通式 |
| `BAL.dipBaseNonAggression/Alliance/Ceasefire/Marriage/VassalDemand/VassalOffer` | 20 / 0 / -10 / -10 / -40 / 30 | 各行動基礎分 |
| `BAL.ceasefireWinningRatio/WinningPenalty/LosingRatio/LosingBonus` | 1.5 / -30 / 0.7 / +40 | 停戰情勢修正 |
| `BAL.dipMarriageRenewBonus` / `dipVassalSiegeBonus` / `dipVassalOfferMinSentiment` | +15 / +30 / -20 | 個別修正 |

## 6. UI/UX

畫面佈局與 wireframe 屬 11；元件屬 12。本節定義互動流程與本系統專屬字串。

### 6.1 互動流程摘要

- **外交畫面**：左側勢力清單（顯示感情臉色圖示與信用條）→ 右側詳情：信用、感情、
  生效協定（含剩餘月數）、行動按鈕列。不可用的行動按鈕灰化，tooltip 顯示原因
  （前置不足／信用不足／冷卻中）。每個提案按鈕顯示成功見込（高／中／低，§5.6.2）。
- **朝廷／幕府頁**：友好度條、現任官位／役職、下一階條件核對清單（✓/✗）、
  停戰斡旋與擁立按鈕。幕府滅亡後整頁顯示浮水印「幕府已滅亡」，按鈕全部停用。
- **調略畫面**：進行中調略列表（目標、執行武將、進度條、預估成功率）＋新調略精靈
  （選種類→選目標→選武將→選投入金額→確認）。
- **外交來使**（自動暫停 modal）：來使勢力、提案內容、接受／拒絕按鈕；婚姻顯示成婚武將。

### 6.2 繁中字串表（`src/i18n/zh-TW.ts`；key 規範見 00 §9）

| key | 字串 |
|---|---|
| `ui.diplomacy.title` | `外交` |
| `ui.diplomacy.trust` | `信用` |
| `ui.diplomacy.sentiment` | `感情` |
| `ui.diplomacy.pactNone` | `無協定` |
| `ui.diplomacy.pactRemaining` | `{pact}（剩餘{months}月）` |
| `ui.diplomacy.assignWork` | `指派外交工作` |
| `ui.diplomacy.workOfficer` | `擔當武將` |
| `ui.diplomacy.monthlyCost` | `每月費用 {gold}貫` |
| `ui.diplomacy.outlook.high` | `成功見込：高` |
| `ui.diplomacy.outlook.mid` | `成功見込：中` |
| `ui.diplomacy.outlook.low` | `成功見込：低` |
| `ui.diplomacy.cooldown` | `冷卻中（至{date}）` |
| `cmd.diplomacy.proposeNonAggression` | `締結不可侵條約` |
| `cmd.diplomacy.proposeAlliance` | `締結同盟` |
| `cmd.diplomacy.proposeCeasefire` | `請求停戰` |
| `cmd.diplomacy.proposeMarriage` | `締結婚姻同盟` |
| `cmd.diplomacy.demandVassal` | `從屬勸告` |
| `cmd.diplomacy.offerVassal` | `從屬提案` |
| `cmd.diplomacy.requestReinforce` | `請求援軍` |
| `cmd.diplomacy.breakPact` | `破棄協定` |
| `cmd.diplomacy.breakPactConfirm` | `確定要破棄與{clan}的{pact}嗎？信用將歸零，威信與各勢力感情將大幅下降。` |
| `term.pact.nonAggression` | `不可侵條約` |
| `term.pact.alliance` | `同盟` |
| `term.pact.ceasefire` | `停戰` |
| `term.pact.vassal` | `從屬` |
| `ui.court.title` | `朝廷` |
| `ui.court.favor` | `朝廷友好度` |
| `ui.court.rank` | `官位` |
| `ui.court.rankNone` | `無位無官` |
| `ui.court.requestRank` | `請求敘任` |
| `ui.court.mediation` | `停戰斡旋` |
| `ui.court.mediationTarget` | `斡旋對象` |
| `ui.shogunate.title` | `幕府` |
| `ui.shogunate.favor` | `幕府友好度` |
| `ui.shogunate.titleLabel` | `役職` |
| `ui.shogunate.requestTitle` | `請求任官` |
| `ui.shogunate.nominate` | `擁立將軍` |
| `ui.shogunate.collapsed` | `幕府已滅亡` |
| `ui.plot.title` | `調略` |
| `ui.plot.poach` | `引拔` |
| `ui.plot.rumor` | `流言` |
| `ui.plot.betrayal` | `內應` |
| `ui.plot.investGold` | `投入金錢` |
| `ui.plot.progress` | `進度` |
| `ui.plot.successChance` | `預估成功率 {pct}%` |
| `ui.plot.activateBetrayal` | `發動內應` |
| `report.diplomacy.pactSigned` | `{a}與{b}締結{pact}。` |
| `report.diplomacy.pactExpired` | `與{clan}的{pact}已到期。` |
| `report.diplomacy.pactBroken` | `{clan}破棄了與我方的{pact}！` |
| `report.diplomacy.envoyArrived` | `{clan}遣使來訪：{proposal}` |
| `report.diplomacy.proposalAccepted` | `{clan}接受了我方的{proposal}。` |
| `report.diplomacy.proposalRejected` | `{clan}拒絕了我方的{proposal}。` |
| `report.diplomacy.workStopped` | `金錢不足，對{target}的外交工作已中止。` |
| `report.court.rankGranted` | `朝廷敘任{clan}當主為{rank}。` |
| `report.court.mediationSuccess` | `朝廷斡旋成功，與{clan}停戰{months}月。` |
| `report.court.mediationFailed` | `朝廷斡旋失敗，{clan}官位在我方之上。` |
| `report.shogunate.titleGranted` | `幕府任命{clan}為{title}。` |
| `report.shogunate.nominated` | `{clan}上洛擁立將軍，威名遠播！` |
| `report.shogunate.patronLost` | `我方失去京都，將軍庇護不再。` |
| `report.shogunate.collapsed` | `室町幕府滅亡，諸役職效果盡失。` |
| `report.plot.poachSuccess` | `{officer}引拔成功，{target}前來仕官！` |
| `report.plot.rumorSuccess` | `流言奏效，{target}軍心動搖。` |
| `report.plot.betrayalReady` | `對{castle}的內應工作完成，攻城時可發動。` |
| `report.plot.betrayalActivated` | `{castle}內應發動，城內士氣崩潰！` |
| `report.plot.failed` | `對{clan}的{plot}未能奏效。` |
| `report.plot.exposed` | `我方對{clan}的{plot}敗露，兩家關係惡化！` |
| `report.plot.exposedByEnemy` | `發覺{clan}對我方進行{plot}！` |

## 7. 實作任務清單

- [ ] **T1 資料結構與初始化**：實作 §4 全部型別；劇本載入時建立全對 `DiplomacyRow`
      （初始 trust=0、sentiment 依劇本資料）、`CourtState`（s1560：全勢力 favor=0、官位=0、
      幕府 exists=true、義輝在世、patron=null）。
      驗收：載入 s1560 後 `rows` 完整成對、鏡像不變量成立（單元測試遍歷全對）。
- [ ] **T2 外交工作與信用**：assignWork/cancelWork Command、月費扣款、§5.2.1 增益、上限與佔用檢查。
      驗收：政務 100 武將、感情 0，10 個月信用恰為 60（誤差 0，決定論）；金錢歸零時工作自動中止並發報告。
- [ ] **T3 感情引擎**：月變動（交戰/接壤/共同敵人）、漂移、事件型套用、`applyAweDiplomacy`。
      驗收：構造交戰＋接壤場景，12 個月後 sentiment 數值與手算一致；威風大勝後目標 -25、接壤者 -8。
- [ ] **T4 協定與提案流程**：propose/respond/breakPact、Pact 生命週期、到期、冷卻、§3.4.1 全表效果。
      驗收：同盟成立→援軍可請求；破棄後信用 0、威信 -150、全勢力感情 -10；停戰期間攻擊 Command 驗證失敗；
      婚姻後 36 月內 breakPact 驗證失敗。
- [ ] **T5 朝廷**：獻金工作、官位敘任（逐階、永久）、停戰斡旋（含官位差失敗率、冷卻、半額退款）。
      驗收：以固定 seed 重放，斡旋成敗序列穩定；官位 3 階前斡旋按鈕不可用；第 4+8 階合計政策槽 +2（05 讀取）。
- [ ] **T6 幕府**：役職敘任、擁立將軍與資格喪失、`collapseShogunate` 全套失效處理。
      驗收：滅亡後威信扣回值＝已敘任各階 prestigeBonus 總和；役職 Command 全部失敗；朝廷功能不受影響。
- [ ] **T7 調略**：三種調略的下達、進度、成敗、敗露、內應標記與發動；並行上限與目標互斥。
      驗收：固定 seed 下引拔成功率統計（1000 次模擬）落在公式 ±3%；敗露後感情變化正確；
      對同盟勢力 startPlot 驗證失敗。
- [ ] **T8 AI 介面**：`clanPower`、`evaluateProposal` 純函式化並輸出至 09；UI 成功見込三檔。
      驗收：同一 GameState 下重複呼叫結果完全相同；門檻邊界（score=59.9/60.0）行為正確。
- [ ] **T9 UI 整合**：外交畫面、朝廷幕府頁、調略精靈、外交來使 modal、§6.2 全部字串上表。
      驗收：字串無硬編碼（掃描通過）、簡體字黑名單掃描通過（17）；來使提案觸發自動暫停。
- [ ] **T10 golden test**：含外交工作、同盟、破棄、斡旋、引拔的 5 年腳本重放，狀態雜湊穩定（17）。

## 8. 設計決策記錄

- **D1 感情的方向性收納**：`rows[A][B]` 同列存放「A 的信用（在 B 處）」與「B 對 A 的感情」。
  雖然兩者方向相反，但這正是玩家外交頁一眼要看的兩個數字（我累積了多少、對方喜不喜歡我），
  避免 UI 每次都要跨兩列讀取。鏡像一致性只需維護 `pactIds`。
- **D2 提案被拒不扣信用**：信用累積以月計、得來不易；若被拒即焚毀會使玩家不敢嘗試、AI 難以校準。
  改以 3 個月冷卻防止刷提案。成本只在成立時支付，語意是「動用信用促成協定」。
- **D3 停戰絕對不可破棄**：停戰是花信用或朝廷友好度買到的喘息窗；若可破棄則失去購買意義，
  且 AI 難以評估其價值。不可侵／同盟可破棄但付出重懲（`BAL.betrayalPrestigeHit=150` 約為
  中期大名威信的兩成），婚姻再加 36 個月硬鎖，作為「可信承諾」的階梯。
- **D4 官位永久、役職可失**：朝廷官位史實上不隨幕府興衰，永久持有可讓獻金投資有安全感；
  幕府役職繫於幕府存續，滅亡時連威信一併收回，製造「投資幕府體制」的風險對價，
  並讓 10 的幕府滅亡事件有實質系統衝擊。
- **D5 接受度公式零隨機**：AI 接受與否完全由 `evaluateProposal` 決定，無擲骰。
  好處：決定論易測試、UI 能給出誠實的「成功見込」、玩家可以推理外交而非賭運氣。
  隨機性集中於調略與斡旋（本就是諜報／請託性質）。
- **D6 從屬雙向破棄同罰**：宗主放逐從屬與從屬獨立採同一懲罰，避免宗主「免費甩鍋」
  或從屬「零成本反叛」；規則單一也減少實作與教學成本。
- **D7 內應常數改用 `plotBetrayal*` 前綴**：00 §14 定內應識別符為 `betrayal`，
  但破棄協定的懲罰常數 `BAL.betrayalPrestigeHit` 已佔用 `betrayal` 語意。
  為避免混淆，內應相關 BAL 常數一律加 `plot` 前綴（`plotBetrayalBase` 等），
  與 `plotPoach*`、`plotRumor*` 保持同構；型別與 Command 中的 `'betrayal'` 字面值仍遵循 00 §14。
- **D8 不做贈禮／金錢外交**：Shinsei 系有貢品系統，本作割捨——信用是唯一外交貨幣，
  若金錢可直接買感情，後期富裕勢力會使外交失去節奏（信用累積的時間成本是主要平衡閥）。
  金錢僅出現於婚姻聘金、獻金與調略投入等一次性場合。
- **D9 交戰狀態採「最近敵對行為」推導而非宣戰旗標**：免去宣戰/媾和的狀態機與其邊角案例
  （多方混戰、繼承戰爭），`lastHostileDay` 單欄位即可推導，且自然支持「打累了自動降溫」
  （6 個月無交火即脫離交戰，感情懲罰停止）。
- **D10 婚姻不引入獨立協定種類**：婚姻實作為同盟 pact 的 `marriage` 旗標＋延長＋硬鎖，
  避免第五種 PactKind 造成互斥矩陣複雜化；「婚姻必附著於同盟」也符合戰國政略婚的語意。
- **D11 調略月費固定、成功率吃一次性投入**：月費做為持續佔用的維持成本（武將＋金錢），
  一次性投入是玩家的風險決策槓桿；兩者分離讓「便宜慢慢磨」與「重金速成」都成立。
- **D12 目標長度取捨**：官位／役職表各效果刻意選用既有系統的掛鉤（政策槽、接受度、費用倍率），
  不引入新機制，控制 M6 里程碑實作面積；若 15 平衡驗證發現效果過弱，優先調數值而非加機制。

### 修正階段套用記錄（依 19 §3.13 勘誤台帳）

- **（2026-07-07）E-25 官位階集合改採 02**：§3.5.2 官位八階表重排為 02 §3.3 `CourtRank`
  enum 值（`ju5ge`/`ju5jo`/`ju4ge`/`ju4jo`/`ju3`/`sho3`/`ju2`/`sho2`），`crank.` 前綴廢除、
  enum 值即識別符；第 3~8 階顯示名隨 02 更新（正五位下→從四位下 等）；§3.5.3 斡旋條件之
  第 3 階名改「從四位下」；§4 `CourtRankDef.id` 型別由 `string` 改 `CourtRank`。各階友好度／
  獻金／威信加成／解鎖效果之值不變（依 15 §5.2 表 G）。依據：E-25「依 02（§3.10 表）；
  08 §3.5.2 門檻表重排、`crank.` 前綴廢除」。
- **（2026-07-07）E-26 幕府役職集合改採 02**：§3.6.2 役職表對映至 02 §3.3 `ShogunateTitle`
  可敘任五階（`hokoshu`/`otomoshu`/`shobanshu`/`kanrei`/`fukushogun`），`stitle.` 前綴廢除；
  顯示名隨 02 更新（御供眾→奉公眾、御相伴眾→御供眾、管領代→相伴眾…），前階條件鏈同步；
  §4 型別 `ShogunateTitleId`→`ShogunateTitle`（02 七值，含 `none`/`shogun`），`grantedTitle`
  與 `ShogunateTitleDef.id` 隨改；§5.1 tick 內 ×0.8 折扣持有役職名改「御供眾」。值不變
  （依 15 §5.2 表 H）。依據：E-26。
- **（2026-07-07）E-27 朝廷友好度欄位名改採 02**：`CourtState.imperialFavor`→`courtFavor`
  （全檔一致，含 §3.5.1、§4 型別、§5.4 敘任／斡旋、不變量）；獻金機制仍維持 08 的持續
  「獻金工作」制（外交工作 `target:'court'`）。依據：E-27「機制依 08，欄位名依 02 `courtFavor`」。
- **（2026-07-07）E-29 Command 去斜線命名空間**：§4 `DiplomacyCommand` 聯集與全文引用一律去除
  `diplomacy/` 前綴、改 02 §4.18 camelCase 名（`assignWork`→`startDiploWork`、
  `cancelWork`→`stopDiploWork`、`propose`→`proposePact`、`requestCourtMediation`→`requestMediation`；
  `respond`/`breakPact`/`requestCourtRank`/`requestShogunateTitle`/`nominateShogun`/`startPlot`/
  `cancelPlot`/`activateBetrayal` 去前綴）。02 未收之新增指令（respond 等）待 02 聯集補收
  （E-32，屬 02 側）；`CmdProposePact`/`CmdBreakPact` 之參數差異隨 E-28 結構定案處理。依據：E-29。
- **（2026-07-07）E-30 協定事件名改採 02**：GameEvent `dip.pactSigned/pactExpired/pactBroken`
  → 02 §4.19 之 `pact.signed`/`pact.expired`/`pact.broken`。08 專屬事件（`dip.proposalReceived`/
  `dip.proposalResolved`/`dip.workStopped`/`court.mediationResult`/`shogunate.nominated`/
  `shogunate.patronLost`/`shogunate.collapsed`/`plot.*`）02 §4.19 尚未收錄，暫留原名待 02 補收
  （同 E-32 處理，屬 02 側）。依據：E-30「依 02 §4.19 總表；08 事件名改為 02 名」。
- **（2026-07-07）E-33 引拔初始忠誠常數統一**：§3.7.1 成功效果與 §5.7 彙總之
  `BAL.plotPoachInitialLoyalty(=60)` → `BAL.poachedInitialLoyalty(=45)`（名依 06、值依
  15 §5.2）；發動門檻仍 `plotPoachLoyaltyThreshold=75`（08 為發動端擁有者）。依據：E-33。
- **（2026-07-07）E-34 一門標記改採 kinship**：§2 關係表、§3.4.1 婚姻適齡一門、§3.7.1 引拔
  目標條件、§4 跨域欄位之 `Officer.isKin` 判定一律改為 `Officer.kinship==='kin'`（型別 `Kinship`
  由 06 定義）。依據：E-34「08 的 `isKin` 判定改為 `kinship==='kin'`」。

> 未套用（列 needsReview，待專案設計裁決）：**E-23**（PactKind 改 00 §14 四協定、
> 婚姻改獨立 kind、不可侵條約降 v1.1）與 **E-28**（外交資料結構改依 02 無向 pairKey＋
> 內嵌 Pact）。兩者為跨全檔的資料模型／機制重構、且分別推翻本檔 §8 D10 與 D1，
> 涉及互斥不變量與 04／07 消費端連動，非本次可安全就地套用之範圍。

---

*本文件依 00 §13 規範撰寫；術語依 00 §14 與 19-glossary。實作期變更請記錄於 §8。*
