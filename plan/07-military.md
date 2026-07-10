# 07 — 軍事系統（Military）

> 本文件是《天下布武》軍事系統的單一真相來源，涵蓋：編成出陣、部隊屬性、野戰自動解算、
> 合戰（戰術戰場）、戰法、威風、攻城戰、軍團、兵站。
> 規格衝突時優先序依 `00-foundations.md`：`00 > 02 > 15 > 本文件`。
> 所有數值以 `BAL.*` 常數名表示並附建議初值，定案值以 `plan/15-balance.md` 主表為準。

---

## 1. 目的與範圍

本文件定義軍事系統的全部規則與資料結構，目標是讓實作者不需再做任何設計決策即可寫出
`src/core/systems/military.ts`（野戰）、`src/core/systems/battle.ts`（合戰）、
`src/core/systems/siege.ts`（攻城）三個系統模組，以及對應的 Command 與 UI 畫面。

**涵蓋**：
- 編成出陣（大將／副將選擇、兵數、兵糧攜帶、目標與路徑、多部隊同城出陣）。
- 部隊屬性（戰力公式、士氣模型、兵種欄位預留）。
- 野戰自動解算（每日互擊、地利／挾擊／特性修正、潰走、追擊）。
- 合戰（發動條件、集結、戰場生成、battle tick 迴圈、采配、玩家指令、委任 AI、勝敗）。
- 戰法表（12 種，含采配成本、效果、持續、解鎖特性）。
- 威風（判定等級、郡翻轉、城士氣與耐久、威信）。
- 攻城戰（強攻／包圍、城方反擊、糧盡、落城處理、援軍解圍、內應發動時機）。
- 軍團（建立、方針、收支與上繳）。
- 兵站（每日糧耗、補給、糧盡懲罰、歸還與自動歸還）。

**不涵蓋**（僅引用）：行軍速度與尋路、制壓、遭遇判定（`plan/04-map-and-movement.md`）；
徵兵與城兵糧收支（`plan/05-domestic.md`）；特性效果數值與捕虜處理（`plan/06-officers.md`）；
調略內應的取得（`plan/08-diplomacy.md`）；軍團 AI 與合戰委任 AI 的完整決策樹（`plan/09-ai.md`）。

---

## 2. 與其他文件的關係

| 文件 | 本文件如何依賴／被依賴 |
|---|---|
| `02-data-model.md` | 本文件 §4 的 interface 為軍事欄位的權威語義說明；最終型別定義由 02 彙整，命名以 02 為準。 |
| `03-game-loop.md` | 野戰／攻城於每日 tick 的 step 7–8 執行；合戰為 modal 子迴圈，策略時間暫停。 |
| `04-map-and-movement.md` | 行軍、尋路（最短路）、制壓、遭遇判定、節點地形（terrain）由 04 定義；本文件在「遭遇成立後」接手。 |
| `05-domestic.md` | 徵兵補充城兵力、城兵糧收支、政策對士氣的修正值、輸送。 |
| `06-officers.md` | 身分（Rank）六階、特性（Trait）清單與效果值、功績結算、捕虜與逃脫判定公式。 |
| `08-diplomacy.md` | 內應（betrayal）成果的取得與存放；同盟關係判定敵對性。 |
| `09-ai.md` | 大名 AI 的出陣決策、軍團 AI 行為、合戰委任 AI 的完整版；本文件 §3.9 僅定義合戰內建簡易委任邏輯。 |
| `13-i18n-strings.md` | 本文件 §6.5 字串表併入主字串表。 |
| `15-balance.md` | 本文件全部 BAL 常數的定案值。 |

本文件為以下機制的單一真相來源，其他文件不得複述公式：
戰力公式、野戰解算、合戰全流程、戰法、威風、攻城解算、軍團收支、兵站。

---

## 3. 設計細節

### 3.1 編成與出陣

**出陣來源**：任一我方直轄城。軍團所屬城由軍團 AI 自行出陣（§3.12），玩家不可直接對軍團城下出陣指令。

**編成規則**：
1. 選擇 **1 名大將**（`leaderId`）＋**至多 2 名副將**（`deputyIds`）。
   候選條件：武將位於該城、未出陣中、非捕虜、非浪人。任何身分皆可任大將（帶兵上限不同）。
2. **兵數**：`BAL.minMarchTroops`（建議 100）≤ 兵數 ≤ `min(城駐兵, BAL.rankTroopCap[大將身分])`。
   副將不增加帶兵上限（v1 簡化，見 §8 D3）。身分帶兵上限：

| 身分 | rank key（`Rank` 值，依 02 kebab-case，E-01） | 帶兵上限（人） |
|---|---|---|
| 足輕組頭 | `kumigashira` | `BAL.rankTroopCap['kumigashira']` = 500 |
| 足輕大將 | `ashigaru-taisho` | `BAL.rankTroopCap['ashigaru-taisho']` = 1000 |
| 侍大將 | `samurai-taisho` | `BAL.rankTroopCap['samurai-taisho']` = 2000 |
| 部將 | `busho` | `BAL.rankTroopCap['busho']` = 3000 |
| 家老 | `karo` | `BAL.rankTroopCap['karo']` = 5000 |
| 宿老 | `shukuro` | `BAL.rankTroopCap['shukuro']` = 8000 |

   當主視同宿老（上限 8000）。此表同時被 `plan/06-officers.md` 引用，數值定案於 15。
3. **攜帶兵糧**：預設 `兵數 × BAL.fieldFoodPerSoldierDaily × BAL.defaultCarryDays`
   （建議 0.02 石/人/日 × 60 日）。玩家可在
   `[兵數 × BAL.fieldFoodPerSoldierDaily × BAL.minCarryDays(10), 兵數 × BAL.fieldFoodPerSoldierDaily × BAL.maxCarryDays(180)]`
   區間內調整，且不得超過城內現存兵糧。出陣時自城兵糧扣除。
4. **目標與任務**：指定任一地圖節點為 `targetNodeId`。
   - 目標為敵城 → `mission = 'conquer'`（抵達後自動轉入圍城，§3.11）。
   - 其他 → `mission = 'march'`（抵達後駐留 `holding`；途經或抵達敵郡時依 04 制壓規則翻轉歸屬）。
5. **路徑**：由 04 對 `targetNodeId` 尋出的單目標最短路（v1 不支援途經點；改道以 `CmdSetArmyTarget` 覆寫目標，見二輪裁決 D）。

**出陣結算**（於下一 tick 的 applyCommands）：
- 再次驗證全部條件；任一不符 → 指令失敗、產生失敗報告（§6.5 字串），不做部分執行。
- 成功 → 建立 `Army`；城駐兵、城兵糧即時扣除；大將與副將標記為出陣中
  （出陣中武將不再參與城內內政與役職效果，參見 05／06）。

**多部隊同城出陣**：同一 tick 內多筆出陣指令依提交順序逐筆結算；每筆各自驗證，
兵數與兵糧逐筆自城扣減（後結算者以扣減後餘額驗證）；同一武將不可同時編入兩支部隊。
同城可同時存在任意數量的在外部隊。

**在外部隊變更目標**：`CmdSetArmyTarget` 可隨時改變 `targetNodeId` 與任務；
路徑自當前位置重新尋路。潰走中（`routed`）部隊不可下令。

### 3.2 部隊屬性

**戰力（power）**——野戰與攻城使用：

```
power = soldiers × (1 + ldr(大將統率) × BAL.ldrCombatFactor) × moraleFactor × troopTypeFactor
moraleFactor = BAL.moraleFactorBase + morale / BAL.moraleFactorDivisor   // 0.5 .. 1.0
```

- `BAL.ldrCombatFactor` = 0.01（統率 100 → 戰力 ×2.0）。
- `BAL.moraleFactorBase` = 0.5、`BAL.moraleFactorDivisor` = 200（士氣 100 → 1.0；士氣 0 → 0.5）。
- `troopTypeFactor`：v1 恆為常數 1.0，不掛任何 state 欄位（`Army.troopType` 已依二輪裁決 B 廢除）。
  兵種（騎馬／鐵砲／足輕）為 post-v1 schema 擴充，屆時才引入對應欄位與分支；v1 不得實作任何兵種分支邏輯。

**士氣（morale，0..100）**：
- 初始值 = `clamp(BAL.moraleInitBase + 大將ldr × BAL.moraleInitLdrFactor + 政策修正, 0, 100)`；
  建議 `BAL.moraleInitBase` = 70、`BAL.moraleInitLdrFactor` = 0.2。政策修正值由 05 的政策表定義（本式僅加總）。
- 每日所在節點歸屬為敵對勢力 → `−BAL.moraleEnemyLandDaily`（建議 1）。
- 野戰或合戰**勝利** → 全體我方參戰部隊 `+BAL.moraleVictoryGain`（建議 10）；
  **敗北**（非潰走的殘存部隊）→ `−BAL.moraleDefeatLoss`（建議 15）。
- 野戰每日與合戰每 tick 另有變動（§3.3、§3.7）。
- 兵糧耗盡的懲罰見 §3.13。所有變動後 clamp 至 0..100。

### 3.3 野戰自動解算

**交戰成立**：04 的遭遇判定成立（雙方敵對部隊位於同節點或於同邊相向而行）時，
建立 `FieldCombat`，雙方部隊 `status = 'engaged'`、行軍暫停，並發出 `battle.started` 事件
（payload 依 02 §4.19：`battleId` 取該 `FieldCombat` id、`nodeId`、`attackerClanId`／`defenderClanId`
分別取 `sideB`（後至／挑起遭遇方）／`sideA`（先至方）之主勢力 `clanIds[0]`）。
同節點若有三個以上互相敵對的勢力：取當前總兵數最大的兩方交戰，其餘部隊待機（不受損、不移動），
交戰結束後重新判定（見 §8 D6）。與交戰任一方**同盟**且與另一方敵對的部隊，抵達同節點時併入該方（同側多勢力）。

**每日解算**（tick step 8，雙方同時結算、以當日開始時的狀態計算）：

```
某側每日損耗 = 對方側Σpower × BAL.fieldCombatDailyLossRate × terrainMod × pincerMod × traitMod
```

- `BAL.fieldCombatDailyLossRate` = 0.04。
- **地利 terrainMod**：交戰節點歸屬 == 我方勢力 → 我方承受的損耗 ×`BAL.homeGroundLossMult`（建議 0.85）；
  節點屬敵方 → 敵方享有同乘數；屬第三方或中立 → 雙方皆 1.0。
- **挾擊 pincerMod**：我側部隊數 ≥ 2 且敵側部隊數 == 1 → 敵側承受的損耗 ×`BAL.pincerMult`（建議 1.3）。
  不隨部隊數量疊加（3 對 1 仍為 1.3）。
- **特性 traitMod**：我側全部參戰武將的野戰類特性乘數相乘，clamp 至 ≤ `BAL.traitCombatMultCap`（建議 1.5）。
  特性清單與各自乘數見 `plan/06-officers.md`。
- 該側總損耗按側內各部隊**現有兵數比例**分攤，四捨五入至整數。

**士氣每日變動**：比較雙方「當日損耗 ÷ 當日開始兵數」：
- 比例較高側 `−BAL.fieldMoraleDailyLose`（建議 4）；較低側 `+BAL.fieldMoraleDailyWin`（建議 2）。
- 兩者差 < 0.05 → 視為互有勝負，雙方各 −1。

**結束條件**：一側全部部隊潰走或殲滅 → 另一側勝利：全體 `+BAL.moraleVictoryGain`、
勝方部隊恢復原任務繼續行動。功績結算參見 06。

**野戰威風**：交戰結束時，若敗方自交戰開始的累計損失兵數 > 敗方初始總兵數 × `BAL.fieldAweKillRatio`（建議 0.6），
勝方獲得**威風（小）**，以交戰節點為中心套用（§3.10）。

### 3.4 潰走與追擊

**潰走條件**（野戰每日與合戰每 tick 檢查）：
`morale ≤ BAL.moraleBreakThreshold`（建議 30）**或** `soldiers < initialTroops × BAL.routTroopRatio`（建議 0.2）。

**潰走行為**：
- `status = 'routed'`；路徑改為「至最近我方城的最短路」（以跳數計，同距取 id 字典序小者）。
- 每日折損 `soldiers × BAL.routDailyLossRate`（建議 0.08，向上取整）。
- 不觸發遭遇、不被制壓阻擋、不可下令、士氣鎖定不再變動。
- 抵達我方城 → 殘兵編入城駐兵、殘糧併入城兵糧、武將回城待命、`Army` 移除。
- 全地圖無我方城 → 部隊立即解散，武將成為浪人（處理參見 06）。

**追擊**：
- 潰走發生當日，勝側每支 `morale ≥ BAL.pursuitMoraleMin`（建議 50）的部隊合計造成一次
  **追擊損害 = 勝側Σpower × BAL.pursuitDamageRate**（建議 0.10），直接扣潰走方兵數。
- 其後勝方不自動尾隨。若日後勝方部隊行軍至與潰走部隊同節點（潰走部隊不觸發交戰），
  每日至多再造成一次同式追擊損害。

### 3.5 合戰——發動與集結

**發動條件**（全部滿足）：
1. 存在進行中的 `FieldCombat` 且**玩家勢力為交戰一方**（AI 對 AI 一律野戰自動解算）。
2. 雙方合計現有兵數 ≥ `BAL.kassenMinTroops`（建議 3000）。
3. 該 `FieldCombat` 尚未發動過合戰（`kassenUsed == false`，每場遭遇限一次）。

條件成立的當日產生 `battle.kassenAvailable` 事件並自動暫停（可於設定關閉）。
玩家可在遭遇持續期間的任一日下 `CmdStartKassen` 發動；發動後 `kassenUsed = true`、
`interrupted = true`（該 FieldCombat 自此暫停野戰逐日解算，見 §5.2，E-64），策略時間暫停，
進入合戰 modal。玩家不發動則持續野戰解算。

**集結（拉入）**：發動時，以遭遇節點為中心、策略地圖 `BAL.kassenGatherRange`（建議 2）跳數內，
交戰雙方勢力的**全部在外部隊**（不含潰走中、不含圍城中）自動拉入戰場；
每側至多 `BAL.kassenMaxUnitsPerSide`（建議 6）支，超過時取兵數最大者。
城駐軍不參與合戰（§8 D7）。同盟軍不拉入（v1，§8 D8）。
被拉入部隊在策略地圖上的位置不變，合戰結果套用後再繼續行動。
1 支 `Army` = 合戰中 1 個 `BattleUnit`（以大將能力計算，副將僅貢獻戰法解鎖與特性）。

**攻守側**：發動合戰的一方為「攻方（attacker）」，另一方為「守方（defender）」。

### 3.6 合戰——戰場生成

戰場為獨立的小型節點圖，節點稱**陣（Jin）**。生成必須走 `rng.battle` 流以保決定論。

**佈局**：抽象網格 5 欄（col 0..4）× 3 列（row 0..2）。
- 攻方本陣固定 (0,1)、守方本陣固定 (4,1)。
- 陣總數 `N = BAL.jinCountMin + floor(rng × (BAL.jinCountMax − BAL.jinCountMin + 1))`，建議 9..13。
- 其餘 `N−2` 個中立陣自 13 個剩餘格位隨機抽取，但 col 1、2、3 各至少 1 個（不足則重抽）。

**邊（JinEdge）**：
- 同欄相鄰列（|row 差| = 1）之間連邊。
- 相鄰欄（|col 差| = 1）且 |row 差| ≤ 1 之間連邊。
- 生成後以 BFS 檢查連通；若不連通，將最近的兩個不連通分量以一條邊相連（取格位距離最小者）。
- 邊移動成本 `moveCost` 預設 1 tick。

**地形修正**（取遭遇節點的 terrain，地形類型定義見 04）：
- `mountain`／`hill`：隨機 3 個中立陣升級為「高台陣」，防禦加成 `BAL.jinDefHill`。
- `river`：col 2 與相鄰欄之間全部邊 `moveCost = 2`（渡河）。
- `plain`／`coast`：無修正。

**陣屬性**：

| 種類 | 旗力上限 | 防禦加成 |
|---|---|---|
| 本陣 | `BAL.jinFlagHonjin` = 1000 | `BAL.jinDefHonjin` = 0.4 |
| 中立陣 | `BAL.jinFlagNeutral` = 400 | `BAL.jinDefNeutral` = 0.15 |
| 高台陣 | `BAL.jinFlagNeutral` = 400 | `BAL.jinDefHill` = 0.3 |

防禦加成的意義：位於**我方歸屬陣**上的部隊，承受傷害 ×(1 − 防禦加成)。中立陣不提供加成。

**初始配置**：每側部隊按兵數由大到小配置——第 1 支置於本陣，其後依序置於距本陣最近
（跳數，同距取 col 靠近己側者）的空位陣；每陣每側至多 `BAL.jinStackLimit`（建議 2）支。
本陣與其鄰接陣的初始歸屬為該側，其餘為中立。

### 3.7 合戰——battle tick 迴圈

合戰於 modal 內以子迴圈執行：`1 battle tick = 戰場 1 刻`，UI 每 `BAL.kassenTickMs`
（建議 800ms，可隨策略速度檔位縮放）推進一次，可隨時暫停下令；指令於下一 tick 開頭生效。
上限 `BAL.kassenMaxTicks`（建議 120）。

**每 tick 執行順序（固定）**：
1. **指令收集**：玩家指令（§6.2）或委任 AI（§3.9）為每支部隊決定行動。
2. **戰法結算**：扣除該側采配、掛上效果；即時型（instant）立即結算效果。
3. **移動推進**：沿邊移動的部隊 `moveProgress += 1`；達到 `moveCost` → 進入目標陣
   （目標陣同側已滿 `BAL.jinStackLimit` → 停在原陣並清除移動目標）。
4. **交戰配對與傷害**：每支未移動中的部隊選定目標——優先「同陣敵部隊」，次之「鄰接陣敵部隊」；
   有指定攻擊目標且合法時優先。全部傷害以 tick 開始時的狀態同時計算後一併套用：

```
attackPower = troops × (1 + val(大將武勇) × BAL.valBattleFactor
                          + ldr(大將統率) × BAL.ldrBattleFactor)
                     × moraleFactor × tacticAtkMult
damage(對目標) = attackPower × BAL.battleTickDamageRate
              × (1 − 目標所在陣防禦加成(僅當該陣歸屬目標側))
              × tacticDefMult(目標)
```

   建議值：`BAL.valBattleFactor` = 0.008、`BAL.ldrBattleFactor` = 0.004、`BAL.battleTickDamageRate` = 0.02。
   `tacticAtkMult`／`tacticDefMult` 來自戰法狀態（§3.8），無狀態時為 1.0。
5. **士氣與潰走**：每支部隊——本 tick 受損 ≥ 現有兵 × 0.03 → 士氣 −2；受損 > 0 → −1；
   造成傷害且未受損 → +1。之後依 §3.4 條件判潰走（`initialTroops` 以**合戰開始時**兵數計）；
   潰走部隊每 tick 沿最短路向己方本陣方向移出戰場邊緣後從戰場移除（不再受控、不接戰、
   途中經過敵部隊所在陣時受一次 §3.4 追擊式損害，`BAL.pursuitDamageRate` 減半）。
6. **陣旗力與佔領**：位於「非我方歸屬陣」且該陣無敵方部隊的每支部隊，
   使該陣 `旗力 −= troops × BAL.flagCaptureRate`（建議 0.012）。旗力 ≤ 0 →
   陣歸屬翻轉為該側、旗力回復至 `旗力上限 × BAL.flagResetRatio`（建議 0.5）。
   **本陣旗力歸零 → 合戰立即結束**（§3.9）。陣上有雙方部隊時旗力不變。
7. **采配累積與效果遞減**：各側采配 `+ BAL.saihaiBase + floor(總大將ldr × BAL.saihaiLdrFactor)`
   （建議 1 + 統率×0.02，總大將 = 該側統率最高的大將），上限 `BAL.saihaiMax`（建議 20）；
   初始值 `BAL.saihaiInit`（建議 5）。全部 ActiveTactic 的 `remainingTicks −= 1`，歸零移除。
8. **勝敗檢查**（§3.9）。

### 3.8 戰法（Tactic）——12 種

**可用性**：一支部隊的可用戰法 = 預設戰法（突擊、齊射）∪ 大將與副將的特性所解鎖之戰法。
特性本體（名稱、取得方式）定義於 `plan/06-officers.md`；下表的「解鎖特性 id」為 canonical，
06 的特性表必須包含這些 id。

**發動規則**：
- 發動主體為部隊，消耗**該側共用采配值**；采配不足不可發動。
- 同一部隊的同一戰法發動後冷卻 `BAL.tacticCooldownTicks`（建議 8）tick（鐵砲三段為 10）。
- 自身增益型（突擊、堅守、騎突、背水）同時僅能存在一個，發動新者覆蓋舊者；
  減益（挑撥、攪亂、牽制）可與增益並存，同種減益重複施加時僅刷新持續時間。
- 指定目標的戰法（齊射、挑撥、攪亂、火矢、鐵砲三段、牽制）目標須為鄰接陣或同陣的敵部隊。

| # | id | 繁中名 | 采配 | 類型 | 效果 | 持續(tick) | 解鎖特性 id |
|---|---|---|---|---|---|---|---|
| 1 | `tac.charge` | 突擊 | 5 | 增益 | 我方 `tacticAtkMult` ×1.5；承受傷害 ×1.2 | 3 | —（預設） |
| 2 | `tac.volley` | 齊射 | 4 | 即時 | 對目標造成 `attackPower × BAL.battleTickDamageRate × BAL.tacVolleyDamageMult(1.2)` 傷害，不受反擊 | 即時 | —（預設） |
| 3 | `tac.inspire` | 鼓舞 | 4 | 即時 | 自身與同陣友軍士氣 +15 | 即時 | `trait.gunshin`（軍神） |
| 4 | `tac.taunt` | 挑撥 | 3 | 減益 | 目標敵部隊被迫以本部隊為攻擊目標，且其 `tacticAtkMult` ×0.8 | 4 | `trait.benzetsu`（辯舌） |
| 5 | `tac.disrupt` | 攪亂 | 4 | 減益 | 目標無法移動、`tacticAtkMult` ×0.7、其進行中戰法立即解除 | 3 | `trait.gunryaku`（軍略） |
| 6 | `tac.hold` | 堅守 | 3 | 增益 | 承受傷害 ×0.6；不可移動 | 4 | `trait.fudou`（不動） |
| 7 | `tac.fire-arrow` | 火矢 | 5 | 增益 | `tacticAtkMult` ×1.3，且攻擊目標所在陣旗力每 tick 額外 −`BAL.tacFireFlagDamage`(30) | 3 | `trait.hizeme`（火攻） |
| 8 | `tac.cavalry` | 騎突 | 6 | 增益 | `tacticAtkMult` ×1.6；效果中每 tick 可先移動一步再攻擊（移動不佔整 tick） | 2 | `trait.kiba`（騎馬） |
| 9 | `tac.triple-volley` | 鐵砲三段 | 8 | 即時 | 對目標連續 3 次齊射（各次 `attackPower × BAL.battleTickDamageRate`），不受反擊；冷卻 10 tick | 即時 | `trait.teppo`（鐵砲） |
| 10 | `tac.last-stand` | 背水 | 6 | 增益 | `tacticAtkMult` ×1.8；承受傷害 ×1.3；效果中士氣不低於 `BAL.moraleBreakThreshold`＋1（不潰走） | 5 | `trait.kesshi`（決死） |
| 11 | `tac.pin` | 牽制 | 3 | 減益 | 目標無法移動（仍可攻擊） | 3 | `trait.roukou`（老巧） |
| 12 | `tac.heal` | 治療 | 5 | 即時 | 兵數回復 `min(合戰開始兵數 − 現有兵, 合戰開始兵數 × BAL.tacHealRatio(0.05))` | 即時 | `trait.iryou`（醫療） |

多個增益乘數不並存（覆蓋制），故 `tacticAtkMult` 恆為單一值；
減益的攻擊乘數與增益相乘（例：突擊×挑撥 → 1.5 × 0.8 = 1.2）。

### 3.9 合戰——委任 AI 與勝敗

**委任模式**（玩家可全程委任，或對個別部隊開啟）。每 tick 對每支委任部隊依序判斷：
1. 我部隊士氣 < 50 且側采配 ≥ 鼓舞成本且可用 → 發動鼓舞。
2. 存在交戰中目標且側采配 ≥（最強可用攻擊型戰法成本 + 5）→ 發動之（優先序：鐵砲三段 > 騎突 > 背水 > 突擊 > 火矢 > 齊射）。
3. 鄰接存在敵部隊且 我power ÷ 敵power ≥ 0.8 → 攻擊其中 power 最低者。
4. 鄰接存在敵方或中立歸屬的陣且其上無敵部隊 → 移動至其中旗力最低者（優先奪弱陣）。
5. 皆否 → 向敵本陣方向前進一步；若本陣受威脅（敵部隊鄰接我本陣）→ 改為回防本陣。

AI 側（非玩家側）整側恆用同邏輯。完整難易度差異化見 `plan/09-ai.md`。

**勝敗判定**（每 tick 末檢查，先滿足者成立）：
1. 一側**本陣陷落**（旗力歸零被佔）→ 該側敗北。
2. 一側全部部隊潰走或殲滅 → 該側敗北。
3. `tick == BAL.kassenMaxTicks` → 比較雙方殘存Σ`power`：
   攻方 ≥ 守方 × `BAL.kassenTiebreakMult`（建議 1.05）→ 攻方勝；否則守方勝（無平手，§8 D9）。

**戰後處理**：
- 合戰中的兵數／士氣變化回寫至各 `Army`。
- 敗方：合戰中潰走的部隊 → 策略地圖上 `routed`（§3.4）；未潰走的殘存部隊 →
  士氣 `−BAL.moraleDefeatLoss`、強制向己方最近城後退 1 個節點後恢復可下令。
- 勝方：全部隊 `+BAL.moraleVictoryGain`，恢復原任務。
- `FieldCombat` 結束；威風判定（§3.10）：如成立則 `applyAwe`（`sourceBattleId` ＝該 `BattleState` id）發出 `awe.triggered`；
  發出 `battle.ended`（`battleId` 為該 `BattleState` id、`winnerClanId`、`aweLevel`＝`BattleResult.aweLevel`、
  `attackerLosses`／`defenderLosses`＝`BattleResult` 對應欄位；報告文字由 UI 依事件推導，02 §4.17）；功績結算參見 06。

### 3.10 威風（awe）

**判定**（合戰勝利時，取最高成立等級；殲滅比例 = 敗方合戰累計損失 ÷ 敗方合戰開始總兵數）：

| 等級 | 條件（任一） |
|---|---|
| 威風・大 | 殲滅比例 ≥ `BAL.aweLargeKillRatio`(0.7)；或 本陣陷落且陷落 tick ≤ `BAL.aweLargeFastTicks`(40) |
| 威風・中 | 殲滅比例 ≥ `BAL.aweMedKillRatio`(0.5)；或 本陣陷落 |
| 威風・小 | 其他任何合戰勝利 |

野戰大勝（§3.3，殲滅 > `BAL.fieldAweKillRatio` = 0.6）給**威風・小**。

**效果**（以戰場（遭遇）節點為中心，策略地圖跳數半徑）：

| 等級 | 半徑（跳） | 威信 |
|---|---|---|
| 小 | `BAL.aweRangeSmall` = 1 | `+BAL.awePrestigeSmall` = 10 |
| 中 | `BAL.aweRangeMed` = 2 | `+BAL.awePrestigeMed` = 25 |
| 大 | `BAL.aweRangeLarge` = 3 | `+BAL.awePrestigeLarge` = 50 |

1. 半徑內**敗方勢力的郡節點**：歸屬直接翻轉為勝方（清除該郡 `District.subjugation` 制壓進度，
   並掃描 `state.armies` 重置正制壓該郡之部隊的制壓進度〔E-65〕；知行解除處理參見 05；
   第三方勢力的郡不受影響；城節點不翻轉）。
2. 半徑內**敗方勢力的城**：城士氣 `−BAL.aweCastleMoraleHit`（建議 20）、
   耐久 `−耐久上限 × BAL.aweCastleDurabilityRatio`（建議 0.05）。
3. 勝方勢力威信依上表增加。

### 3.11 攻城戰（siege）

**開始**：`mission = 'conquer'` 的部隊抵達目標敵城節點 → 自動建立 `Siege`、`status = 'sieging'`，
並發出 `siege.started` 事件（`siegeId`、`castleId`、`attackerClanId`；02 §4.19）。
其他我方部隊抵達同節點自動加入（`armyIds`）。同一城同時僅能有一個圍城方：
若第三方敵對勢力部隊抵達，與圍城方發生野戰（遭遇），不另建 Siege（§8 D10）。

**模式**（`mode`，圍城方玩家可隨時以 `CmdSetSiegeMode` 切換；AI 依 09）：預設 `assault`（強攻）。
- **強攻（assault）**：
  - 每日城耐久 `−= Σ攻方power × BAL.assaultDurabilityRate(0.004) × (1 − 城防減免)`。
    城防減免：本城 `BAL.siegeMitigationMain` = 0.5、支城 `BAL.siegeMitigationBranch` = 0.3
    （城下施設加成參見 05，與此相加後 clamp ≤ 0.7）。
  - 每日攻方兵損 `= 城方power × BAL.assaultAttackerLossRate(0.05)`（城方每日反擊；按攻方各部隊兵數比例分攤）。
  - 每日守兵損 `= Σ攻方power × BAL.assaultDefenderLossRate(0.008)`。
  - 每日城士氣 `−BAL.assaultCastleMoraleDaily`（建議 1）。
- **包圍（encircle）**：切換條件 `Σ攻方兵 ≥ 城駐兵 × BAL.encircleRatio`（建議 3.0），不滿足自動退回強攻。
  - 每日城士氣 `−BAL.encircleCastleMoraleDaily`（建議 2）。
  - 城內兵糧每日消耗 ×`BAL.encircleFoodMult`（建議 2.0；基準日耗＝`BAL.garrisonFoodPerSoldierMonthly / 30`，定義於 05，E-15）。
  - 每日攻方兵損 `= 城方power × BAL.encircleAttackerLossRate(0.005)`；守兵、耐久不變。

**城方 power**：`城駐兵 × (1 + 城主ldr × BAL.ldrCombatFactor) × (1 + 城防減免)`（城主不在則 ldr = 0）。

**共通規則**：
- 圍城中城士氣停止自然回復（平時每月 `+BAL.castleMoraleRecoverMonthly`（建議 10）回復至 100）。
- 城內兵糧歸零 → 城士氣每日額外 `−BAL.starvingCastleMoraleDaily`（建議 5）、
  守兵每日逃散 `× BAL.starvingCastleDesertionRate`（建議 0.03）。
- **內應**：圍城方對該城持有內應成果（取得參見 `plan/08-diplomacy.md`）時，可下 `CmdUseBetrayal`：
  城士氣一次性 `−BAL.betrayalMoraleHit`（建議 40），每份成果限用一次，每場圍城限一次。
- **援軍解圍**：守方（或其同盟）部隊抵達城節點 → `Siege.interrupted = true`，圍城全部每日效果暫停，
  圍城方與援軍依 §3.3 野戰（可發動合戰）。圍城方勝 → 解除 interrupted、圍城續行（進度保留）；
  圍城方全潰走或撤退 → Siege 移除並發出 `siege.ended`（`fallen: false`、`newOwnerClanId: null`；02 §4.19）。

**落城**：`耐久 ≤ 0` 或 `城士氣 ≤ 0` 或 `守兵 ≤ 0` →
1. 城歸攻方勢力；**所轄各郡一併翻轉**為攻方（知行解除參見 05；翻轉時清除各郡 `District.subjugation`，
   並掃描 `state.armies` 重置正制壓這些郡之部隊的制壓進度〔E-65〕）。
2. 城主與城內全部武將逐一做逃脫判定（公式參見 06）；未逃脫者成為攻方**捕虜**（處置參見 06）。
3. 耐久設為 `max(當前耐久, 耐久上限 × BAL.postSiegeDurabilityRatio(0.3))`；
   城士氣設為 `BAL.postSiegeCastleMorale`（建議 50）；殘存守兵解散（歸農，不併入任何方）；
   城內殘存兵糧 ×`BAL.postSiegeFoodKeepRatio`（建議 0.5）留存、其餘視為戰亂散失。
4. 攻方部隊 `+BAL.moraleVictoryGain`、駐留城節點轉 `holding`；發出 `siege.ended` 事件
   （`siegeId`、`castleId`、`fallen: true`、`newOwnerClanId` 為攻方勢力；報告文字由 UI 依事件推導，02 §4.17）；功績參見 06。

### 3.12 軍團（Corps）

- **建立**：`CmdCreateCorps` 指定軍團長（身分 ≥ 家老、非出陣中）與至少 1 座我方直轄城。
  城劃入軍團後玩家不可再對其直接下內政／出陣指令（收回城＝`CmdAssignCastleToCorps(corpsId:null)`，E-32）。
- **方針（directive）**：`advance`（攻略目標，須指定 `targetNodeId`）／`hold`（防衛領內）／
  `develop`（自治：由 AI 自行選擇目標與開發）。玩家可隨時變更。（依 02 三值，E-21）
- **行為**：軍團內的出陣、徵兵、開發全部由軍團 AI 執行（完整邏輯參見 `plan/09-ai.md`）；
  軍團部隊的野戰／攻城仍走本文件同一套解算；軍團部隊參與玩家發動的合戰時可被拉入且受玩家指揮。
- **收支獨立**：軍團領（軍團城所轄郡）的每月金錢收入不入玩家帳，改入 `Corps.gold`；
  入帳同時按 `BAL.corpsTithe`（建議 0.2）比例上繳勢力金庫（即軍團留成 80%）。
  兵糧收支留在軍團各城。軍團 AI 以 `Corps.gold` 支應徵兵與開發。
- **解散／收回**：解散軍團或收回城時，`Corps.gold` 全額併入勢力金庫；在外軍團部隊轉為直轄。
- 軍團長忠誠與獨立風險參見 06／09。

### 3.13 兵站與補給

- **每日消耗**（tick step 7 開頭，先於移動與交戰）：每支在外部隊
  `food −= ceil(soldiers × BAL.fieldFoodPerSoldierDaily)`（建議 0.02 石/人/日）。
- **補給**：部隊位於我方（含同盟）城節點時，每日自該城兵糧自動補至
  `兵數 × BAL.fieldFoodPerSoldierDaily × BAL.defaultCarryDays` 水位（城存量不足則補到用盡為止）。
- **糧盡**（`food == 0`）：每日士氣 `−BAL.noFoodMoraleDaily`（建議 8）、
  兵逃散 `soldiers × BAL.noFoodDesertionRate`（建議 0.05，向上取整）。
- **歸還**：`CmdRecallArmy` → `mission = 'return'`、目標 = `originCastleId`（已失守則最近我方城）；
  抵達後兵力、殘糧併入城，武將回城，`Army` 移除。
- **自動歸還**（`autoReturn == true`，預設開，玩家可關）：滿足任一即自動轉歸還——
  (a) 任務完成（march 抵達目標並完成制壓／conquer 目標落城）且無新指令；
  (b) 剩餘兵糧可支撐日數 ≤ `BAL.autoReturnFoodDays`（建議 7）且不在圍城最後階段
  （城士氣與耐久皆 > 20% 時才允許自動撤）。

---

## 4. 資料結構

> 最終型別由 `plan/02-data-model.md` 彙整；本節為軍事欄位的權威語義。ID 規範依 00 §8。

```ts
/** 地圖節點 id：城節點 "castle.*" 或郡節點 "dist.*"（參見 04） */
type MapNodeId = string;

type ArmyMission = 'march' | 'conquer' | 'return';
// ArmyStatus 依 02 聯集定案（E-10）：fighting→engaged、resting→holding、新增 subjugating（制壓，04 設定）
type ArmyStatus =
  | 'marching'    // 行軍中
  | 'engaged'     // 野戰交戰中（原 fighting）
  | 'sieging'     // 圍城中
  | 'subjugating' // 制壓中（04 設定；本文件不主動設置）
  | 'returning'   // 歸還行軍中（原 retreating 併入）
  | 'routed'      // 潰走中
  | 'holding';    // 駐留（原 resting 併入）

/** 出陣中部隊（策略層） */
interface Army {
  id: string;                 // "army.<6位流水>" 例 "army.000042"（依 02 六位流水，E-12）
  clanId: string;             // 所屬勢力
  originCastleId: string;     // 出陣城（歸還預設目的地）（依 02 §4.8，E-11）
  leaderId: string;           // 大將 Officer id（依 02 §4.8，E-11）
  deputyIds: string[];        // 副將 Officer id，長度 0..2
  soldiers: number;           // 現有兵數（人，整數）（依 02 §4.8，E-11）
  initialTroops: number;      // 出陣時兵數（人；潰走判定基準，途中補兵時同步上調）
  morale: number;             // 士氣 0..100
  food: number;               // 攜帶兵糧（石，整數）
  mission: ArmyMission;
  status: ArmyStatus;
  targetNodeId: MapNodeId;    // 目標節點
  path: MapNodeId[];          // 完整路徑（含起訖；由 04 尋路產生）
  pathCursor: number;         // 已抵達之 path 索引（＝04 MarchState.nodeIndex 語意）（依 02 §4.8，E-11）
  posNodeId: MapNodeId;       // 最近抵達節點（= path[pathCursor]）（依 02 §4.8，E-11）
  edgeProgressDays: number;   // 往 path[pathCursor+1] 之當前邊已累積行軍日數（日，浮點 ≥0）；位於節點上／已抵終點為 0（日數累加模型見 04 §5，E-11）
  edgeCostDays: number;       // 當前邊有效日數（日）＝edge.baseDays / BAL.roadGradeSpeedMult[grade]（海路固定＝baseDays）；抵達判定 edgeProgressDays ≥ edgeCostDays（04 §3.4.2／§5，E-11）
  battleId: string | null;    // 進入合戰（BattleState）時所屬合戰 id；否則 null（依 02 §4.8；野戰 engaged 之歸屬改由 FieldCombat.sideX.armyIds 反查，INV-13／E-18）
  siegeId: string | null;     // status=='sieging' 時所屬攻城戰 id；否則 null（依 02 §4.8，INV-13）
  autoReturn: boolean;        // 糧將盡／任務完成自動歸還
  corpsId: string | null;     // 所屬軍團 id；null = 直轄（非衍生：出陣時快照，軍團解散／收回城時顯式改 null，§3.12；不可由 originCastle.corpsId 衍生）
}

/** 野戰交戰狀態（一節點一場） */
interface FieldCombat {
  id: string;                 // "fc.<nodeId去前綴>-<開始日絕對tick>"
  nodeId: MapNodeId;          // 交戰節點
  startedDay: number;         // 開始日（絕對 tick）
  sideA: FieldCombatSide;     // 先到方
  sideB: FieldCombatSide;
  kassenUsed: boolean;        // 本遭遇是否已發動過合戰
  interrupted: boolean;       // 合戰進行中時暫停野戰逐日解算（E-64；§5.2 combat step 跳過之）
}
interface FieldCombatSide {
  clanIds: string[];          // 同側勢力（含同盟援軍）
  armyIds: string[];
  initialTroops: number;      // 交戰開始時總兵數（威風判定）
  cumulativeLosses: number;   // 累計損失兵數
}

/** 合戰（戰術戰場）——策略時間暫停期間的獨立狀態機 */
interface BattleState {
  id: string;                 // "battle.<6位流水>"（依 02 六位流水，E-12）
  fieldCombatId: string;      // 來源遭遇
  nodeId: MapNodeId;
  terrain: string;            // 遭遇節點地形（terrain 枚舉見 04）
  attackerClanId: string;     // 發動側
  defenderClanId: string;
  jins: Jin[];
  edges: JinEdge[];
  units: BattleUnit[];
  tick: number;               // 目前 battle tick（0 起）
  saihai: { attacker: number; defender: number };  // 各側共用采配值 0..BAL.saihaiMax
  honjinFallenTick: number | null;  // 本陣陷落 tick（威風判定用）
  result: BattleResult | null;
}
type BattleSide = 'attacker' | 'defender';

/** 陣（合戰戰場節點） */
interface Jin {
  id: string;                 // "jin.<col>-<row>"
  col: number;                // 0..4
  row: number;                // 0..2
  owner: BattleSide | 'neutral';
  isHonjin: boolean;          // 本陣
  flagPower: number;          // 現有旗力
  flagPowerMax: number;       // 旗力上限
  defenseBonus: number;       // 防禦加成 0..1（僅對歸屬側部隊生效）
}
interface JinEdge {
  a: string;                  // Jin id
  b: string;                  // Jin id
  moveCost: number;           // 移動所需 tick（1 或 2）
}

/** 合戰部隊（1 Army = 1 BattleUnit） */
interface BattleUnit {
  id: string;                 // "bu.<armyId去前綴>"
  armyId: string;
  side: BattleSide;
  generalId: string;          // 沿用 Army 大將
  troops: number;             // 現有兵數
  battleInitialTroops: number;// 合戰開始時兵數（潰走與治療基準）
  morale: number;             // 0..100
  jinId: string;              // 所在陣
  moveTargetJinId: string | null; // 移動中的目標陣（沿單一邊）
  moveProgress: number;       // 已累積移動 tick
  attackTargetUnitId: string | null; // 玩家指定攻擊目標
  activeTactics: ActiveTactic[];
  tacticCooldowns: Record<string, number>; // tacticId -> 剩餘冷卻 tick
  delegated: boolean;         // 是否委任 AI
  routed: boolean;            // 已潰走（撤離中或已離場）
}
interface ActiveTactic {
  tacticId: string;           // "tac.*"
  remainingTicks: number;     // 即時型不入列
  targetUnitId: string | null;// 減益型的目標
}
interface BattleResult {
  winnerSide: BattleSide;
  endTick: number;
  attackerLosses: number;     // 攻方累計損兵
  defenderLosses: number;
  aweLevel: 'small' | 'medium' | 'large' | null; // 勝方獲得的威風
}

/** 戰法靜態定義（12 筆，硬編碼於 core，非劇本資料） */
interface TacticDef {
  id: string;                 // "tac.*"
  saihaiCost: number;         // 采配成本
  kind: 'buff' | 'debuff' | 'instant';
  durationTicks: number;      // instant 為 0
  cooldownTicks: number;      // 預設 BAL.tacticCooldownTicks
  needsTarget: boolean;       // 是否須指定敵部隊目標
  unlockTraitId: string | null; // null = 預設可用
  atkMult: number;            // tacticAtkMult 乘數（無則 1）
  dmgTakenMult: number;       // 承受傷害乘數（無則 1）
  immobile: boolean;          // 效果中不可移動（堅守／被攪亂／被牽制）
}

/** 圍城狀態 */
interface Siege {
  id: string;                 // "siege.<6位流水>"（依 02 六位流水，E-12）
  castleId: string;
  attackerClanId: string;
  armyIds: string[];          // 圍城部隊（同勢力）
  mode: 'assault' | 'encircle';
  startedDay: number;
  interrupted: boolean;       // 援軍交戰中，每日效果暫停
  betrayalUsed: boolean;      // 本場圍城已用過內應
}

/** 軍團 */
interface Corps {
  id: string;                 // "corps.<clan-slug>-<流水號>"
  clanId: string;
  corpsLeaderId: string;      // 軍團長（身分 ≥ 家老）
  castleIds: string[];        // 劃撥城
  directive: 'advance' | 'hold' | 'develop';  // 依 02（E-21）
  targetNodeId: MapNodeId | null; // directive === 'advance' 時必填（依 02，E-21）
  gold: number;               // 軍團金庫（貫）
}
```

**軍事 Command 一覽**（欄位語義；型別聯集由 02 彙整，驗證與 apply 規範見 03）：

| Command | 欄位 | 說明 |
|---|---|---|
| `CmdMarch` | `originCastleId, leaderId, deputyIds, soldiers, food, targetNodeId` | 出陣（§3.1） |
| `CmdSetArmyTarget` | `armyId, targetNodeId` | 變更在外部隊目標 |
| `CmdRecallArmy` | `armyId` | 命令歸還 |
| `CmdSetAutoReturn` | `armyId, enabled` | 切換自動歸還 |
| `CmdStartKassen` | `fieldCombatId` | 發動合戰（§3.5） |
| `CmdBattleMove` | `battleId, unitId, targetJinId` | 合戰：移動 |
| `CmdBattleAttack` | `battleId, unitId, targetUnitId` | 合戰：指定攻擊目標 |
| `CmdBattleTactic` | `battleId, unitId, tacticId, targetUnitId?` | 合戰：發動戰法 |
| `CmdBattleDelegate` | `battleId, unitId or 'all', enabled` | 合戰：委任開關 |
| `CmdSetSiegeMode` | `siegeId, mode` | 切換強攻／包圍 |
| `CmdUseBetrayal` | `siegeId` | 發動內應 |
| `CmdCreateCorps` | `corpsLeaderId, castleIds, directive, targetNodeId?` | 建立軍團 |
| `CmdSetCorpsDirective` | `corpsId, directive, targetNodeId?` | 變更軍團方針 |
| `CmdAssignCastleToCorps` | `corpsId, castleId` | 劃撥城入軍團（`corpsId: null` ＝收回城，取代原 `CmdRemoveCastleFromCorps`，E-32） |
| `CmdDissolveCorps` | `corpsId` | 解散軍團 |

---

## 5. 演算法與公式

### 5.1 出陣驗證與建立

```
applyCmdMarch(state, cmd):
  castle = state.castles[cmd.originCastleId]
  assert castle.clanId == cmd.clanId 且 castle 非軍團城（玩家指令時）
  general = state.officers[cmd.leaderId]
  assert general 在 castle、未出陣、非捕虜、非浪人
  assert cmd.deputyIds.length ≤ 2，且每名副將同上條件、與大將互異
  cap = BAL.rankTroopCap[general.rank]（當主 → 8000）
  assert BAL.minMarchTroops ≤ cmd.soldiers ≤ min(castle.soldiers, cap)
  minFood = cmd.soldiers × BAL.fieldFoodPerSoldierDaily × BAL.minCarryDays
  maxFood = cmd.soldiers × BAL.fieldFoodPerSoldierDaily × BAL.maxCarryDays
  assert minFood ≤ cmd.food ≤ min(castle.food, maxFood)
  // 任一 assert 失敗 → 產生失敗 Report，指令作廢
  castle.soldiers -= cmd.soldiers;  castle.food -= cmd.food
  mission = isEnemyCastleNode(cmd.targetNodeId) ? 'conquer' : 'march'
  path = computePath(castle.nodeId, cmd.targetNodeId)  // 單目標最短路，參見 04 §5.2
  morale0 = clamp(BAL.moraleInitBase + general.ldr × BAL.moraleInitLdrFactor
                  + policyMoraleBonus(clan), 0, 100)   // 政策值參見 05
  state.armies.push(newArmy(..., initialTroops: cmd.soldiers, morale: morale0))
  markDeployed(general, deputies)
```

### 5.2 野戰每日解算（military.combat，對每個非 interrupted 的 FieldCombat）

```
fieldCombatDailyTick(state, fc):
  A = fc.sideA, B = fc.sideB          // 快照：以當日開始狀態計算
  powerA = Σ computeArmyPower(a) for a in A.armies   // §3.2 公式
  powerB = Σ computeArmyPower(b) for b in B.armies
  node = state.node(fc.nodeId)
  lossA = powerB × BAL.fieldCombatDailyLossRate
          × (node.owner ∈ A.clanIds ? BAL.homeGroundLossMult : 1)
          × (B.armies.length ≥ 2 且 A.armies.length == 1 ? BAL.pincerMult : 1)
          × clampTrait(traitMultOf(B))                 // 對 A 的損耗由 B 側特性放大
  lossB = 同式對稱
  distributeLossByTroops(A, round(lossA)); distributeLossByTroops(B, round(lossB))
  A.cumulativeLosses += lossA; B.cumulativeLosses += lossB
  rA = lossA / soldiersA_start; rB = lossB / soldiersB_start
  if |rA − rB| < 0.05: 雙方全部隊 morale −1
  else 高者側 morale −BAL.fieldMoraleDailyLose、低者側 +BAL.fieldMoraleDailyWin
  for each army: checkRout(army)                       // §3.4
  if 一側全滅或全潰走:
    勝側全部隊 morale += BAL.moraleVictoryGain；套用追擊（§3.4）
    aweLevel = 'none'
    if 敗側.cumulativeLosses > 敗側.initialTroops × BAL.fieldAweKillRatio:
      applyAwe('small', fc.nodeId, 勝側主勢力, 敗側主勢力, fc.id); aweLevel = 'small'   // applyAwe 內發 awe.triggered
    emit battle.ended(battleId: fc.id, winnerClanId: 勝側主勢力, aweLevel,
                      attackerLosses: B.cumulativeLosses, defenderLosses: A.cumulativeLosses)  // 報告文字由 UI 推導（02 §4.17）
    removeFieldCombat(fc)；勝側恢復原任務
```

### 5.3 合戰戰場生成

```
generateBattlefield(state, fc, rng /* rng.battle */):
  N = BAL.jinCountMin + floor(rng() × (BAL.jinCountMax − BAL.jinCountMin + 1))
  放置本陣 (0,1) 攻方、(4,1) 守方
  repeat: 自 13 個剩餘格位以 rng 均勻抽 N−2 格 until col1..3 各至少 1 個
  建邊：同欄相鄰列、相鄰欄且 |row差|≤1
  if 不連通: 反覆將距離最近的兩分量以最短格位距離的邊相連
  terrain = state.node(fc.nodeId).terrain
  if terrain ∈ {mountain, hill}: 以 rng 抽 3 個中立陣 → defenseBonus = BAL.jinDefHill
  if terrain == river: col2 相關邊 moveCost = 2
  設定旗力/防禦（§3.6 表）；本陣與其鄰接陣歸屬各側，其餘 neutral
  deployUnits：每側部隊按兵數降冪，第 1 支入本陣，其後入距本陣最近空位（每陣每側 ≤ BAL.jinStackLimit）
  saihai 兩側初始 = BAL.saihaiInit
```

### 5.4 battle tick（advanceBattleTick；順序即 §3.7 的 1–8）

```
advanceBattleTick(bs, orders):
  1 for u in bs.units where u.delegated 或 該側為AI: orders += delegateAI(u)   // §3.9
  2 for o in orders where o.type == 'tactic':
      def = TACTICS[o.tacticId]
      if 側采配 ≥ def.saihaiCost 且 冷卻歸零 且 目標合法:
        側采配 −= def.saihaiCost; u.tacticCooldowns[id] = def.cooldownTicks
        instant → 立即結算（齊射/鼓舞/鐵砲三段/治療）
        buff → 覆蓋現有 buff；debuff → 掛到目標（同種刷新持續）
  3 for u in 移動中: u.moveProgress += 1（騎突效果中：移動後仍可於本 tick 攻擊）
      if moveProgress ≥ edge.moveCost: 進陣或因滿員退回
  4 配對目標（同陣 > 鄰接；玩家指定優先）；全部 damage 以 tick 初快照同時計算後套用
  5 士氣增減（§3.7-5）；checkRoutInBattle(u)；潰走者向己方本陣方向撤離、離場移除
  6 佔領結算（§3.7-6）；本陣旗力 ≤ 0 → bs.honjinFallenTick = tick，直接進 8
  7 兩側采配累積（cap BAL.saihaiMax）；activeTactics 與 cooldown 遞減
  8 勝敗檢查（§3.9）；成立 → 寫 bs.result 並 resolveBattle(state, bs)（§3.9 戰後回寫；發出 battle.ended／awe.triggered）
```

### 5.5 攻城每日解算（siege.ts，對每個非 interrupted 的 Siege）

```
siegeDailyTick(state, sg):
  castle = state.castles[sg.castleId]
  atk = Σ computeArmyPower(a) for a in sg.armies
  mitigation = clamp((castle.tier=='main'? BAL.siegeMitigationMain : BAL.siegeMitigationBranch)
                     + facilityMitigation(castle) /* 參見05 */, 0, 0.7)
  defPower = castle.soldiers × (1 + lordLdr × BAL.ldrCombatFactor) × (1 + mitigation)
  if sg.mode == 'encircle' 且 Σ攻方兵 < castle.soldiers × BAL.encircleRatio: sg.mode = 'assault'
  if sg.mode == 'assault':
    castle.durability −= atk × BAL.assaultDurabilityRate × (1 − mitigation)
    attackerLoss = defPower × BAL.assaultAttackerLossRate
    castle.soldiers −= round(atk × BAL.assaultDefenderLossRate)
    castle.morale −= BAL.assaultCastleMoraleDaily
  else: // encircle
    castle.morale −= BAL.encircleCastleMoraleDaily
    // 城糧消耗於 economy step 以 ×BAL.encircleFoodMult 計，基準參見 05
    attackerLoss = defPower × BAL.encircleAttackerLossRate
  distributeLossByTroops(sg.armies, round(attackerLoss))
  if castle.food == 0:
    castle.morale −= BAL.starvingCastleMoraleDaily
    castle.soldiers −= ceil(castle.soldiers × BAL.starvingCastleDesertionRate)
  if castle.durability ≤ 0 或 castle.morale ≤ 0 或 castle.soldiers ≤ 0:
    fallCastle(state, sg)        // §3.11 落城處理 1–4
```

### 5.6 威風套用

```
applyAwe(level, centerNodeId, winnerClanId, loserClanId, sourceBattleId):
  // sourceBattleId：合戰觸發＝bs.id（battle.*）、野戰觸發＝fc.id（fc.*），標識威風來源戰役
  range = { small: BAL.aweRangeSmall, medium: BAL.aweRangeMed, large: BAL.aweRangeLarge }[level]
  nodes = bfsWithinHops(centerNodeId, range)           // 策略地圖圖距
  flippedDistrictIds = []; affectedCastleIds = []
  for n in nodes where n 是郡節點 且 n.owner == loserClanId:
    翻轉歸屬至 winnerClanId；清除 District.subjugation 並掃描 state.armies 重置正制壓該郡部隊之進度（E-65）；知行解除（05）
    flippedDistrictIds.push(n.districtId)
  for n in nodes where n 是城節點 且 n.owner == loserClanId:
    castle.morale −= BAL.aweCastleMoraleHit
    castle.durability −= castle.durabilityMax × BAL.aweCastleDurabilityRatio（下限 1）
    affectedCastleIds.push(n.castleId)
  clans[winnerClanId].prestige += { small: BAL.awePrestigeSmall,
                                    medium: BAL.awePrestigeMed,
                                    large: BAL.awePrestigeLarge }[level]
  emit awe.triggered(sourceBattleId, clanId: winnerClanId, level, flippedDistrictIds, affectedCastleIds)
  // 報告文字（report.battle.awe.*）由 UI 依事件推導（02 §4.17）
```

合戰後判級：

```
judgeAwe(bs):
  loserInit = 敗側 Σ battleInitialTroops; loserLoss = 敗側累計損兵
  ratio = loserLoss / loserInit
  if ratio ≥ BAL.aweLargeKillRatio 或 (honjinFallenTick != null 且 ≤ BAL.aweLargeFastTicks): return 'large'
  if ratio ≥ BAL.aweMedKillRatio 或 honjinFallenTick != null: return 'medium'
  return 'small'
```

### 5.7 兵站每日（military.movement 開頭）

```
supplyDailyTick(state, army):
  army.food = max(0, army.food − ceil(army.soldiers × BAL.fieldFoodPerSoldierDaily))
  node = currentNode(army)
  if node 是我方或同盟城節點:
    target = army.soldiers × BAL.fieldFoodPerSoldierDaily × BAL.defaultCarryDays
    refill = min(target − army.food, castle.food); army.food += refill; castle.food −= refill
  if army.food == 0:
    army.morale −= BAL.noFoodMoraleDaily
    army.soldiers −= ceil(army.soldiers × BAL.noFoodDesertionRate)
  if node.owner 與 army 敵對: army.morale −= BAL.moraleEnemyLandDaily
  if army.autoReturn 且 (任務完成 或 剩餘日數 ≤ BAL.autoReturnFoodDays 且 非圍城收尾):
    army.mission = 'return'; army.targetNodeId = 歸還目的地; repath
```

### 5.8 BAL 常數彙總（本文件引入；定案值以 15 為準）

| 常數 | 建議值 | 單位／說明 |
|---|---|---|
| `BAL.minMarchTroops` | 100 | 人；出陣最小兵數 |
| `BAL.rankTroopCap.*` | 500/1000/2000/3000/5000/8000 | 人；六階帶兵上限（§3.1 表） |
| `BAL.fieldFoodPerSoldierDaily` | 0.02 | 石/人/日；出陣糧耗 |
| `BAL.defaultCarryDays` | 60 | 日；預設攜糧 |
| `BAL.minCarryDays` / `BAL.maxCarryDays` | 10 / 180 | 日；攜糧調整區間 |
| `BAL.ldrCombatFactor` | 0.01 | 統率→戰力係數 |
| `BAL.moraleFactorBase` / `BAL.moraleFactorDivisor` | 0.5 / 200 | 士氣係數線性式 |
| `BAL.moraleInitBase` / `BAL.moraleInitLdrFactor` | 70 / 0.2 | 初始士氣 |
| `BAL.moraleEnemyLandDaily` | 1 | 點/日；敵領行軍 |
| `BAL.moraleVictoryGain` / `BAL.moraleDefeatLoss` | 10 / 15 | 點；勝敗士氣 |
| `BAL.fieldCombatDailyLossRate` | 0.04 | 野戰每日損耗率 |
| `BAL.homeGroundLossMult` | 0.85 | 地利減損乘數 |
| `BAL.pincerMult` | 1.3 | 挾擊乘數 |
| `BAL.traitCombatMultCap` | 1.5 | 特性乘數聚合上限 |
| `BAL.fieldMoraleDailyWin` / `BAL.fieldMoraleDailyLose` | 2 / 4 | 點/日；野戰士氣 |
| `BAL.moraleBreakThreshold` | 30 | 士氣潰走閾值 |
| `BAL.routTroopRatio` | 0.2 | 兵數潰走閾值（占 initialTroops） |
| `BAL.routDailyLossRate` | 0.08 | 潰走每日折損率 |
| `BAL.pursuitDamageRate` / `BAL.pursuitMoraleMin` | 0.10 / 50 | 追擊 |
| `BAL.fieldAweKillRatio` | 0.6 | 野戰大勝→威風小 |
| `BAL.kassenMinTroops` | 3000 | 人；合戰發動門檻（雙方合計） |
| `BAL.kassenGatherRange` | 2 | 跳；集結半徑 |
| `BAL.kassenMaxUnitsPerSide` | 6 | 支；每側部隊上限 |
| `BAL.kassenMaxTicks` | 120 | tick；合戰時限 |
| `BAL.kassenTickMs` | 800 | ms；UI 每 tick 時長 |
| `BAL.kassenTiebreakMult` | 1.05 | 時限到期攻方勝所需倍率 |
| `BAL.jinCountMin` / `BAL.jinCountMax` | 9 / 13 | 陣數 |
| `BAL.jinFlagHonjin` / `BAL.jinFlagNeutral` | 1000 / 400 | 旗力 |
| `BAL.jinDefHonjin` / `BAL.jinDefNeutral` / `BAL.jinDefHill` | 0.4 / 0.15 / 0.3 | 防禦加成 |
| `BAL.jinStackLimit` | 2 | 支；每陣每側 |
| `BAL.flagCaptureRate` | 0.012 | 旗力削減/兵/tick |
| `BAL.flagResetRatio` | 0.5 | 佔領後旗力回復比 |
| `BAL.valBattleFactor` / `BAL.ldrBattleFactor` | 0.008 / 0.004 | 合戰攻擊力係數 |
| `BAL.battleTickDamageRate` | 0.02 | 合戰每 tick 傷害率 |
| `BAL.saihaiInit` / `BAL.saihaiBase` / `BAL.saihaiLdrFactor` / `BAL.saihaiMax` | 5 / 1 / 0.02 / 20 | 采配 |
| `BAL.tacticCooldownTicks` | 8 | tick；戰法通用冷卻 |
| `BAL.tacVolleyDamageMult` | 1.2 | 齊射傷害乘數 |
| `BAL.tacFireFlagDamage` | 30 | 火矢旗力追加傷害/tick |
| `BAL.tacHealRatio` | 0.05 | 治療回復比 |
| `BAL.aweLargeKillRatio` / `BAL.aweMedKillRatio` | 0.7 / 0.5 | 威風判級 |
| `BAL.aweLargeFastTicks` | 40 | tick；速陷本陣→威風大 |
| `BAL.aweRangeSmall` / `BAL.aweRangeMed` / `BAL.aweRangeLarge` | 1 / 2 / 3 | 跳 |
| `BAL.aweCastleMoraleHit` | 20 | 點；範圍內敗方城 |
| `BAL.aweCastleDurabilityRatio` | 0.05 | 佔耐久上限比 |
| `BAL.awePrestigeSmall` / `Med` / `Large` | 10 / 25 / 50 | 威信 |
| `BAL.assaultDurabilityRate` | 0.004 | 強攻耐久傷害率 |
| `BAL.siegeMitigationMain` / `BAL.siegeMitigationBranch` | 0.5 / 0.3 | 城防減免 |
| `BAL.assaultAttackerLossRate` / `BAL.assaultDefenderLossRate` | 0.05 / 0.008 | 強攻兵損率 |
| `BAL.assaultCastleMoraleDaily` / `BAL.encircleCastleMoraleDaily` | 1 / 2 | 點/日 |
| `BAL.encircleRatio` | 3.0 | 包圍所需兵力倍率 |
| `BAL.encircleFoodMult` | 2.0 | 圍城城糧消耗倍率 |
| `BAL.encircleAttackerLossRate` | 0.005 | 包圍攻方兵損率 |
| `BAL.starvingCastleMoraleDaily` / `BAL.starvingCastleDesertionRate` | 5 / 0.03 | 城糧盡 |
| `BAL.castleMoraleRecoverMonthly` | 10 | 點/月；平時回復 |
| `BAL.betrayalMoraleHit` | 40 | 點；內應 |
| `BAL.postSiegeDurabilityRatio` | 0.3 | 落城後耐久回復比 |
| `BAL.postSiegeCastleMorale` | 50 | 落城後城士氣 |
| `BAL.postSiegeFoodKeepRatio` | 0.5 | 落城後兵糧留存比 |
| `BAL.corpsTithe` | 0.2 | 軍團上繳比例 |
| `BAL.noFoodMoraleDaily` / `BAL.noFoodDesertionRate` | 8 / 0.05 | 糧盡懲罰 |
| `BAL.autoReturnFoodDays` | 7 | 日；自動歸還門檻 |

---

## 6. UI/UX

### 6.1 出陣面板（自城市面板開啟；畫面框架見 11）

流程：選城 → 「出陣」→ 面板四步：
1. 大將清單（顯示：姓名、身分、統率/武勇、帶兵上限）→ 點選 1 名。
2. 副將清單（同城可用武將）→ 點選 0..2 名。
3. 兵數滑桿（0..min(城駐兵, 上限)，預設上限值）＋ 攜糧日數滑桿（10..180，預設 60，
   即時顯示換算石數與城內餘糧）。
4. 點地圖選目標節點 → 顯示預覽路徑（單目標最短路，v1 無途經點）→「出陣」確認。

### 6.2 合戰畫面（全螢幕 modal；策略時間暫停）

- 中央：陣節點圖（旗力條、歸屬色、防禦加成圖示）；部隊棋子顯示兵數與士氣條。
- 上緣：我方采配值計量條、tick 進度（現在 tick / 上限）、暫停與速度鍵。
- 操作：點選我方部隊 → 底部欄顯示「移動／攻擊／戰法／委任」；
  移動 → 點目標陣；攻擊 → 點敵部隊；戰法 → 橫列戰法卡（灰階 = 采配不足或冷卻中）。
- 「全軍委任」切換鍵位於右上；勝敗結算時顯示戰果畫面（雙方損兵、威風等級、獲得功績）。

### 6.3 攻城面板（點選被圍城開啟）

顯示：城耐久條、城士氣條、城內兵糧估計（知略高的軍師在隊時顯示精確值，參見 06）、
雙方兵力、模式切換鈕（強攻／包圍，包圍不足額時鈕灰階並提示）、內應鈕（持有成果時亮起）。

### 6.4 軍團畫面

軍團清單 → 軍團詳情：軍團長、所轄城列表、方針下拉（攻略／防衛／自治）、攻略目標選擇、
軍團金庫與上月上繳額；「劃撥城／收回城／解散軍團」按鈕。

### 6.5 繁中字串表（併入 13；插值依 00 §9）

| key | 繁中字串 |
|---|---|
| `ui.march.title` | 出陣 |
| `ui.march.selectGeneral` | 選擇大將 |
| `ui.march.selectDeputies` | 選擇副將（至多2名） |
| `ui.march.soldiers` | 兵數 |
| `ui.march.carryDays` | 攜糧日數 |
| `ui.march.foodPreview` | 攜帶兵糧：{food}石（城內餘{rest}石） |
| `ui.march.target` | 目標 |
| `ui.march.troopCap` | 帶兵上限：{cap}人 |
| `cmd.march.confirm` | 出陣 |
| `report.march.failed.soldiers` | 出陣失敗：{castle}兵力不足 |
| `report.march.failed.cap` | 出陣失敗：超過{general}的帶兵上限（{cap}人） |
| `report.march.failed.food` | 出陣失敗：{castle}兵糧不足 |
| `ui.army.status.marching` | 行軍中 |
| `ui.army.status.engaged` | 交戰中 |
| `ui.army.status.sieging` | 攻城中 |
| `ui.army.status.routed` | 潰走中 |
| `ui.army.status.returning` | 歸還中 |
| `ui.army.status.holding` | 駐留中 |
| `cmd.army.return` | 歸還 |
| `cmd.army.autoReturn` | 自動歸還 |
| `report.army.noFood` | {army}兵糧耗盡，士氣潰散中！ |
| `report.field.begin` | {a}與{b}於{place}交戰！ |
| `report.field.rout` | {army}潰走！ |
| `report.battle.available` | {place}可發動合戰！ |
| `cmd.battle.open` | 發動合戰 |
| `ui.battle.saihai` | 采配 |
| `ui.battle.tick` | 第{tick}刻／{max}刻 |
| `cmd.battle.move` | 移動 |
| `cmd.battle.attack` | 攻擊 |
| `cmd.battle.tactic` | 戰法 |
| `cmd.battle.delegate` | 委任 |
| `cmd.battle.delegateAll` | 全軍委任 |
| `ui.battle.honjinFallen` | 本陣陷落！ |
| `ui.battle.victory` | 合戰勝利 |
| `ui.battle.defeat` | 合戰敗北 |
| `report.battle.won` | {attacker}於{place}擊破{defender}！ |
| `report.battle.awe.small` | 威風（小）！鄰近敵郡望風歸順。 |
| `report.battle.awe.medium` | 威風（中）！敵方諸郡動搖歸順。 |
| `report.battle.awe.large` | 威風（大）！{clan}威名震動天下！ |
| `ui.siege.assault` | 強攻 |
| `ui.siege.encircle` | 包圍 |
| `ui.siege.encircleNeed` | 包圍需兵力達城兵{ratio}倍 |
| `cmd.siege.betrayal` | 發動內應 |
| `report.siege.begin` | {castle}遭{clan}包圍！ |
| `report.siege.relief` | 援軍抵達{castle}，展開解圍戰！ |
| `report.siege.fallen` | {castle}落城！ |
| `ui.corps.title` | 軍團 |
| `ui.corps.leader` | 軍團長 |
| `ui.corps.directive.advance` | 攻略 |
| `ui.corps.directive.hold` | 防衛 |
| `ui.corps.directive.develop` | 自治 |
| `ui.corps.gold` | 軍團金庫 |
| `cmd.corps.create` | 編成軍團 |
| `cmd.corps.dissolve` | 解散軍團 |
| `tactic.charge.name` | 突擊 |
| `tactic.volley.name` | 齊射 |
| `tactic.inspire.name` | 鼓舞 |
| `tactic.taunt.name` | 挑撥 |
| `tactic.disrupt.name` | 攪亂 |
| `tactic.hold.name` | 堅守 |
| `tactic.fire-arrow.name` | 火矢 |
| `tactic.cavalry.name` | 騎突 |
| `tactic.triple-volley.name` | 鐵砲三段 |
| `tactic.last-stand.name` | 背水 |
| `tactic.pin.name` | 牽制 |
| `tactic.heal.name` | 治療 |

戰法說明文字（`tactic.*.desc`）以 §3.8 表「效果」欄改寫為玩家語氣，由 13 統一撰寫。

---

## 7. 實作任務清單

對應里程碑 M4（出陣／野戰／攻城）與 M5（合戰／戰法／威風），見 `plan/18-roadmap.md`。

- [ ] **T1 部隊與出陣**：`Army` 型別、`CmdMarch` 驗證與 apply（§5.1）、多部隊同城出陣。
      驗收：兵數／兵糧越界指令被拒且產生報告；同 tick 三筆出陣依序結算、餘額正確。
- [ ] **T2 兵站**：每日糧耗、我方城自動補給、糧盡懲罰、歸還與自動歸還（§5.7）。
      驗收：60 日糧的部隊第 61 日起士氣每日 −8 且兵逃散；行至我方城自動補滿。
- [ ] **T3 野戰解算**：`FieldCombat` 建立與每日互擊、地利／挾擊／特性修正、士氣變動（§5.2）。
      驗收：等兵力等統率下雙方每日損耗相等；地利側總損耗少 15%；2 對 1 時單側損耗 ×1.3。
- [ ] **T4 潰走與追擊**：閾值判定、退卻尋路、每日折損、抵城解編、追擊損害。
      驗收：士氣 ≤30 當日轉 routed 並受一次追擊損害；抵城後駐兵與武將數量守恆。
- [ ] **T5 野戰威風**：殲滅比例統計與威風小套用。
      驗收：構造殲滅 65% 的野戰 → 1 跳內敗方郡全部翻轉。
- [ ] **T6 戰場生成**：`generateBattlefield` 決定論（同 seed 同圖）、連通性、地形修正。
      驗收：1000 次生成陣數皆在 9..13、圖皆連通、col1..3 皆有中立陣。
- [ ] **T7 battle tick 核心**：移動、交戰配對、傷害、士氣潰走、佔領、采配（§5.4）。
      驗收：固定 seed 與指令序列重放，逐 tick 狀態雜湊一致（golden test，參見 17）。
- [ ] **T8 戰法**：12 種效果、冷卻、覆蓋與並存規則、解鎖特性連動。
      驗收：每種戰法各有單元測試驗證數值效果；未持有特性的部隊戰法列表僅含突擊與齊射。
- [ ] **T9 合戰委任 AI 與勝敗**：§3.9 決策序、三種結束條件、戰後回寫。
      驗收：全委任對打可在 `BAL.kassenMaxTicks` 內結束；戰後策略層兵數 = 合戰結束兵數。
- [ ] **T10 合戰威風**：判級與套用、報告與自動暫停。
      驗收：速攻 35 tick 陷本陣 → 威風大、3 跳內敗方郡翻轉、威信 +50。
- [ ] **T11 攻城**：強攻／包圍解算、糧盡、落城處理、耐久回復、捕虜移交（呼叫 06 介面）。
      驗收：支城（耐久 400、守兵 1000）被 5000 兵強攻於 12–20 日內落城；包圍不減耐久。
- [ ] **T12 援軍解圍與內應**：interrupted 流程、`CmdUseBetrayal` 一次性效果。
      驗收：援軍抵達當日城士氣停止下降；內應後城士氣 −40 且第二次發動被拒。
- [ ] **T13 軍團**：建立／方針／劃撥／收回／解散、收支分流與上繳。
      驗收：軍團領月收入 20% 入勢力帳、80% 入軍團金庫；解散後金庫併入且城轉直轄。
- [ ] **T14 UI**：出陣面板、合戰畫面、攻城面板、軍團畫面、§6.5 全部字串經 `t(key)` 取用。
      驗收：Playwright smoke 完成一次出陣→野戰→合戰→攻城→落城流程；簡體字掃描通過。

---

## 8. 設計決策記錄

- **D1 士氣係數線性化（0.5..1.0）**：以 `0.5 + morale/200` 取代乘除表，
  使士氣 0 的部隊仍保有半數戰力，避免雪崩過快；潰走閾值（30）先於戰力歸零生效。
- **D2 野戰逐日、合戰逐 tick 的雙層解算**：野戰保持策略層節奏（可多日拉鋸、可中途發動合戰），
  合戰以獨立子狀態機在 modal 內跑，兩者共用潰走閾值常數以維持直覺一致。
- **D3 副將不增加帶兵上限**：帶兵上限僅取決於大將身分，副將只貢獻戰法解鎖與特性。
  理由：避免「湊副將堆上限」的最佳化壓力，並讓身分升格的價值單一明確。
- **D4 1 Army = 1 BattleUnit**：合戰不拆分部隊，簡化配置與回寫；
  多部隊戰術性由「集結拉入多支部隊」提供。
- **D5 采配為側共用池**：而非各部隊獨立，製造「把采配留給哪支部隊」的決策張力；
  累積速率取決於側內最高統率的大將，體現總大將價值。
- **D6 三方以上同節點取兵力最大兩方交戰**：完整多方混戰的配對規則複雜且罕見，
  v1 以確定性規則簡化；第三方待機不受損，交戰結束後重新判定。
- **D7 城駐軍不參與合戰**：守城張力由攻城戰系統承擔；合戰限定野戰部隊，
  避免「城兵拉出去打合戰」使攻城系統形同虛設。
- **D8 同盟軍不被拉入合戰（v1）**：野戰可同側參戰（§3.3），但合戰拉入僅限交戰雙方勢力，
  避免同盟 AI 部隊在戰術層的指揮權歸屬問題；留待 v2 擴充。
- **D9 合戰時限到期無平手**：攻方需高出 1.05 倍殘存戰力才判勝，否則守方勝——
  向守方傾斜符合「攻方必須速戰」的直覺，並讓拖延成為守方合法戰術。
- **D10 一城一圍城方**：第三方敵對勢力抵達被圍城節點時與圍城方野戰而非另建圍城，
  避免多方圍城的耐久傷害歸屬與落城分配問題。
- **D11 落城時所轄郡一併翻轉**：不要求逐郡制壓，符合「城是郡的支配中樞」的模型，
  也讓攻城的戰略報酬明確；例外流失由威風系統另行提供。
- **D12 強攻守兵損率調至 0.008**：初稿 0.02 會使守兵先於耐久歸零（約 5 日），
  攻城淪為純消耗戰；調低後守兵與耐久大約同步消耗（10–20 日），保留模式選擇的意義。
- **D13 戰法解鎖特性 id 於本文件定案**：`trait.gunshin / benzetsu / gunryaku / fudou / hizeme /
  kiba / teppo / kesshi / roukou / iryou` 十個 id 為 canonical，
  `plan/06-officers.md` 的特性表必須包含之（特性其他效果由 06 自定）。
- **D14 部隊不支援合流與拆分（v1）**：多支部隊同節點各自獨立（可觸發挾擊）；
  合流／拆分的兵糧與士氣併算規則複雜、收益低，留待 v2。
- **D15 圍城尾聲禁止自動歸還**：城士氣與耐久皆 >20% 才允許糧盡自動撤，
  避免玩家長期圍城在最後幾日因自動歸還前功盡棄。
- **D16｜依 19 §3.13 E-01 修正**（2026-07-07）：§3.1 帶兵上限表的 `Rank` 值與 `BAL.rankTroopCap`
  子鍵改為 02 kebab-case（`kumigashira`／`ashigaru-taisho`／`samurai-taisho`／`busho`／`karo`／`shukuro`），
  使 §5.1 `BAL.rankTroopCap[general.rank]` 之索引一致；帶兵上限值（500..8000）仍依 15。
  依據：E-01「依 02 kebab-case；改 06／07 與其字串 key」。
- **D17｜依 19 §3.13 E-10 修正**（2026-07-07）：`ArmyStatus` 改用 02 聯集定案
  （`marching/engaged/sieging/subjugating/returning/routed/holding`）；本文件 `fighting`→`engaged`、
  `resting`→`holding`，並納入 `subjugating`（制壓，04 設定）；對應 `ui.army.status.*` 鍵一併更名。
  依據：E-10「修 02 擴充為聯集定案，04／07 改用」。
- **D18｜依 19 §3.13 E-12 修正**（2026-07-07）：`Army`／`BattleState`／`Siege` 的 id 註解改為
  02 六位流水格式；`fc.`／`bu.`／`jin.` 為合戰內部 transient id 保留（於 02 §3.2 登記）。
  依據：E-12「依 02 六位流水；fc./bu./jin. 可保留」。
- **D19｜依 19 §3.13 E-15 修正**（2026-07-07）：§3.11 包圍城糧消耗基準由不存在的
  `BAL.castleFoodPerSoldierDaily` 改引 `BAL.garrisonFoodPerSoldierMonthly / 30`（05 定義）。
  依據：E-15「07 §3.11 圍城消耗公式改引 garrisonFoodPerSoldierMonthly/30」。
- **D20｜依 19 §3.13 E-21 修正**（2026-07-07）：`Corps.directive` 由 `conquer/defend/auto` 改為
  02 三值 `advance/hold/develop`、`targetCastleId` 改為 `targetNodeId`
  （`CmdCreateCorps`／`CmdSetCorpsDirective`／`ui.corps.directive.*` 一併更名），行為描述改繫於 02 值。
  依據：E-21「依 02 三值與 targetNodeId」。
- **D21｜依 19 §3.13 E-29 修正**（2026-07-07）：合戰發動指令 `CmdOpenBattle`→`CmdStartKassen`、
  歸還指令 `CmdReturnArmy`→`CmdRecallArmy`，對齊 02 §4.18 聯集（type `startKassen`／`recallArmy`）。
  依據：E-29「一律依 02 §4.18 聯集」。
- **D22｜依 19 §3.13 E-30 修正**（2026-07-07）：合戰可發動事件 `battle.available`→`battle.kassenAvailable`，
  對齊 02 §4.19 總表。依據：E-30「07 事件名改為 02 名」。
- **D23｜依 19 §3.13 E-64 修正**（2026-07-07）：`FieldCombat` 補 `interrupted: boolean` 欄位；
  發動合戰同 tick 設 `interrupted = true`，§5.2 野戰逐日解算跳過 interrupted 的 FieldCombat。
  依據：E-64「FieldCombat 補 interrupted；combat step 跳過之」。
- **D24｜依 19 §3.13 E-65 修正**（2026-07-07）：§3.10 威風翻轉、§3.11 落城翻轉、§5.6 applyAwe 統一補
  「翻轉任一郡 ownerClanId 時清除該郡 `District.subjugation` 並掃描 `state.armies`
  重置正制壓該郡部隊之制壓進度」。依據：E-65「翻轉任一郡 ownerClanId 時掃描 state.armies 重置對應 subjugation」。
- **D25｜依 19 §3.13 E-11 修正**（2026-07-10）：`Army` 欄位與全檔引用依 02 §4.8 現行定案改名——
  `generalId`→`leaderId`、`troops`→`soldiers`、`homeCastleId`→`originCastleId`、`pathIndex`→`pathCursor`；
  行軍改採**日數累加器為唯一權威模型**，`Army` 補入 02 欄位 `posNodeId`／`edgeProgressDays`／`edgeCostDays`
  （抵達判定 `edgeProgressDays ≥ edgeCostDays`，機制見 04 §5）。連動更名處：§3.1 出陣、§3.2 戰力公式、
  §3.4 潰走、§3.13 兵站與歸還、§4 `CmdMarch` 參數表、§5.1／§5.2／§5.7 偽碼、§6.5 字串 key
  （`ui.march.troops`→`ui.march.soldiers`、`report.march.failed.troops`→`report.march.failed.soldiers`）。
  合戰 transient `BattleUnit`（bu. 體系）之 `generalId`／`troops` 依 02 §4.9 維持原名，不在改名範圍；
  §3.7 合戰攻擊力／佔領公式與 §4 `BattleUnit` 定義沿用 `troops`。
  依據：E-11「Army／TransportOrder 行軍模型統一為日數累加器並改名（`edgeProgress` 0..1 廢除）」。
- **D26｜依 19 §3.13 E-32 修正**（2026-07-10）：§4 指令表刪除 `CmdRemoveCastleFromCorps`，
  收回城統一以 `CmdAssignCastleToCorps(corpsId:null)` 表達（對齊 02 §4.18 聯集與 §4 合併註記）；
  §3.12 軍團正文引用一併改寫。依據：E-32「重複語意合併，`RemoveCastleFromCorps`＝`assignCastleToCorps(null)`」。
- **D27｜二輪對齊**（2026-07-10，依 02 二輪裁決備忘錄 A–E）：本輪依 02 §4.5／§4.8／§4.18／§4.19 現行定案落實 07 側跟進——
  (1) **Army 欄位（裁決 B）**：§4 移除已廢的 `troopType`（v1 恆定 `'standard'`＝可推導值，違 DDR-8；兵種列 post-v1 schema 擴充），
  §3.2 戰力公式之 `troopTypeFactor` 改述為 v1 常數 1.0、不掛 state 欄位；新增前向指標 `battleId`／`siegeId`（`string | null`）
  對齊 02 §4.8 canonical 與 INV-13（野戰 engaged 之歸屬仍由 `FieldCombat.sideX.armyIds` 反查、圍城走 `siegeId`）；
  `initialTroops`／`mission`／`autoReturn`／`corpsId` 07 早具備且語意一致（`corpsId` 補明「非衍生、出陣快照」註解）。
  (2) **機械改名（裁決 E）**：全檔 `castle.garrison`→`castle.soldiers`（02 §4.5；`BAL.garrisonFoodPerSoldierMonthly` 為常數名不動）；
  `CmdSiegeMode`→`CmdSetSiegeMode`（§3.11／§4 命令表）；§5.1 `cmd.issuerClanId`→`cmd.clanId`（`CommandBase`）、
  `cmd.castleId`→`cmd.originCastleId`（§4 命令表 `CmdMarch` 欄位同步）。
  (3) **waypoints v1 廢除（裁決 D）**：§3.1 路徑改為對 `targetNodeId` 之單目標最短路、§4 `CmdMarch`／`CmdSetArmyTarget`
  欄位刪 `waypoints`、§5.1 `findPathWithWaypoints(...)`→`computePath(castle.nodeId, cmd.targetNodeId)`、
  §6.1 出陣面板刪「可加途經點」；改道以 `CmdSetArmyTarget` 覆寫目標即足（04 §4.3／§5.2 為單目標尋路權威）。
  (4) **事件發出對齊（指派 C，02 §4.19 canonical）**：以 i18n key 代事件之處改發 02 事件——
  §3.11 落城「產生 `report.siege.fallen`」→ 發出 `siege.ended`（`fallen: true`、`newOwnerClanId`＝攻方）、
  §5.6「emit `report.battle.awe.{level}`」→ 發出 `awe.triggered`（補 `sourceBattleId`／`flippedDistrictIds`／`affectedCastleIds`，
  `applyAwe` 加 `sourceBattleId` 參數，合戰＝`bs.id`、野戰＝`fc.id`）；並補明 `battle.started`（§3.3 野戰成立）、
  `battle.ended`（§5.2 野戰結束、§3.9／§5.4 合戰結束）、`siege.started`（§3.11 開始）、解圍時 `siege.ended`（`fallen: false`）之發出點；
  報告文字一律由 UI 依事件推導（02 §4.17），§6.5 `report.*` i18n key 本身不動。
  依據：02 二輪裁決備忘錄 A–E（勘誤 E-11／E-18／E-30／E-32；DDR-8／DDR-12）。
