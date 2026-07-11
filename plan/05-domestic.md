# 05 — 內政系統（Domestic）

> 本文件遵循 `plan/00-foundations.md`（下稱 00）§13 撰寫規範。
> 術語以 00 §14 與 `plan/19-glossary.md` 為準；型別正式收錄以 `plan/02-data-model.md` 為準；
> 全部 `BAL.*` 常數之定案值以 `plan/15-balance.md` 主表為準，本文件附建議初值。

---

## 1. 目的與範圍

本文件是下列機制的**單一真相來源**（00 §7）：

- **經濟循環**：金錢月收入、秋收、城駐兵兵糧維持、家臣俸祿、收支預覽。
- **郡開發**：石高／商業／人口的當前值與潛力上限、直轄開發指示、受封郡領主自動開發、報酬遞減。
- **知行制**：領主任命／罷免規則、身分知行上限、忠誠與功績效果、直轄與分封的產出差異。
- **城下施設**：slot 規則、16 種施設定義、建造佇列。
- **徵兵**：徵兵方針、每月兵力回復、城最大兵力。
- **輸送**：城際金錢／兵糧輸送指令與被劫規則。
- **政策**：12 項勢力級政策的解鎖、維持費、效果、互斥、同時生效數上限。
- **治安與一揆**：治安增減因素、一揆判定、一揆效果與鎮壓。

不在本文件範圍：部隊出陣後的兵糧攜行與行軍消耗（`plan/07-military.md`）、
制壓對郡歸屬的翻轉（`plan/04-map-and-movement.md`）、委任 AI 的決策細節（`plan/09-ai.md`）。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/02-data-model.md` | 本文件 §4 的 interface 為內政系統欄位規格，02 收錄為正式型別；欄位名以本文件為準併入 `District` / `Castle` / `Clan`；政策狀態 `ClanPolicyState` 併入獨立容器 `GameState.policies`（DDR-1，非併入 `Clan`） |
| `plan/03-game-loop.md` | 本文件的結算掛在 00 §5.4 的 `development`（第 5 步）與 `economy`（第 6 步）；Command 佇列機制參見 03 |
| `plan/04-map-and-movement.md` | 輸送隊沿街道移動的距離／速度基準、制壓造成的治安懲罰觸發點 |
| `plan/06-officers.md` | 身分（Rank）、功績（merit）、忠誠（loyalty）的總表與升格規則；本文件只定義內政來源的加減值 |
| `plan/07-military.md` | 出陣部隊的兵糧消耗率、野戰解算（一揆鎮壓引用之）、鐵砲／騎馬編成條件的施設掛鉤 |
| `plan/08-diplomacy.md` | 官位（政策解鎖條件之一）、外交工作效率的政策掛鉤 |
| `plan/09-ai.md` | 領主開發方針選擇、委任城城主的施設建造與徵兵方針決策 |
| `plan/11-ui-screens.md` / `plan/12-ui-components.md` | 內政畫面佈局與元件；本文件 §6 只定義互動流程與字串 |
| `plan/15-balance.md` | 全部 `BAL.*` 定案值 |

---

## 3. 設計細節

### 3.1 經濟循環

#### 3.1.1 金錢收入（每月 1 日）

金錢是**勢力層級**資源（00 §4）。每月 1 日於 `economy` 系統步驟結算：

```
勢力月收入（貫） =
    Σ(直轄郡.commerce) × BAL.goldPerCommerce
  + Σ(受封郡.commerce) × BAL.goldPerCommerce × BAL.fiefTaxRate
  + Σ(施設固定收入)                     # 例：南蠻寺每月 +BAL.facNanbanGold
  + Σ(政策固定收入)                     # 例：南蠻貿易每月 +BAL.polNanbanGold
```

- `BAL.goldPerCommerce = 0.1`（貫／商業點／月）。
- `BAL.fiefTaxRate = 0.7`（受封郡上繳率；差額抽象為領主的知行收入，不進任何帳面）。
- 一揆中的郡（`uprising !== null`）商業收入為 0。
- 結果以 `Math.floor` 取整後入帳。

#### 3.1.2 秋收（每年 9 月 1 日）

兵糧儲存在**城**（00 §4）。9 月 1 日對每座城結算：

```
城秋收入庫（石） = Σ_該城轄下各郡 (郡.kokudaka × BAL.harvestRate × 上繳係數)
  上繳係數 = 直轄郡 1.0；受封郡 BAL.fiefTaxRate；一揆中 0
```

- `BAL.harvestRate = 0.3`（石高為年產額，入庫比例代表軍用徵收部分）。
- 入庫後城兵糧不得超過兵糧容量（見 §3.4 藏）：
  `foodCap = BAL.castleFoodCapMain(=60000) 或 BAL.castleFoodCapBranch(=30000) + 藏加成`。
  超出部分散失，發事件 `economy.granaryOverflow{clanId, castleId, food}`（`food`＝散失石數；報告字串見 13 §6.11 `report.economy.granaryOverflow`；02 §4.19；六輪裁決 1）。

#### 3.1.3 兵糧維持（每日）

城內駐兵每日消耗（於 `economy` 步驟）：

```
日消耗（石，實數） = castle.soldiers × BAL.garrisonFoodPerSoldierMonthly / 30
```

- `BAL.garrisonFoodPerSoldierMonthly = 0.1`（石／人／月）。
  **必須低於**出陣消耗 `BAL.fieldFoodPerSoldierDaily`（07 定義，0.02 石／人／日，月額 0.6；E-14），
  形成「養兵便宜、用兵昂貴」的張力。
- 小數處理：每城持有累加器 `foodFrac`，日消耗累加後扣除整數部分（見 §5.2），
  保證 `food` 恆為 ≥0 整數（00 §6）。
- **糧盡**（`food === 0` 且仍有消耗需求）：該城每日 `soldiers = floor(soldiers × (1 − BAL.starveDesertRate))`，
  `BAL.starveDesertRate = 0.01`；城士氣每日 −`BAL.castleStarveMoraleDaily`(=2)（士氣欄位與下限規則見 07）。發事件 `economy.foodShortage{clanId, castleId}`（warning 級，每城每月至多一次；報告字串見 13 §6.11 `report.economy.castleStarving`；02 §4.19）。
  此為**非圍城**之一般糧盡路徑；城處於圍城中時改用 07 的圍城糧盡規則，兩者互斥（15 §5.2 表 C）。

#### 3.1.4 金錢維持費（每月 1 日，收入入帳後依序扣除）

1. **家臣俸祿**：`Σ_武將 BAL.rankSalary[officer.rank]`，例外：
   - 當主（`leaderId`）不支俸。
   - **受封中的領主（steward）俸祿全免**（知行收入代俸；此為分封的財政誘因，見 §8 決策 D2）。
   - 俸祿表 `BAL.rankSalary`（貫／月；E-04 統一命名、值以 15 定案）：足輕組頭 3、足輕大將 6、侍大將 10、部將 15、家老 22、宿老 30。
2. **政策維持費**：`Σ_生效政策 upkeepGold`（見 §3.7）。

**不足額規則（邊界條件）**：
- 俸祿優先於政策維持費。金錢扣到 0 為止；俸祿未足額時，當月**全體**武將忠誠 −`BAL.unpaidSalaryLoyaltyPenalty`（=2，一次性，06 擁有、值 15 定案；經 06 的忠誠管線），並發事件 `economy.upkeepUnpaid{clanId}`（warning 級，每勢力每月至多一次；報告字串見 13 §6.11 `report.economy.upkeepUnpaid`；02 §4.19）。
- 政策維持費付不出時，依「採用時間由新到舊」自動廢止政策，直到可支付，每廢止一項發事件 `policy.autoRevoked{clanId, policyId}`（每項一則；報告字串見 13 §6.11 `report.policy.autoRevoked`；02 §4.19；六輪裁決 1）。

#### 3.1.5 收支預覽（selector，不改動狀態）

UI 隨時可呼叫 `selectBudgetForecast(state, clanId): BudgetForecast`（§4.8），計算規格：

```
goldIncomeMonthly   = §3.1.1 公式（以當前 commerce 快照計算）
goldUpkeepMonthly   = 俸祿總額 + 生效政策維持費總額
goldNetMonthly      = goldIncomeMonthly − goldUpkeepMonthly
foodUpkeepMonthly   = Σ_城 (soldiers × BAL.garrisonFoodPerSoldierMonthly)
                    + Σ_出陣部隊 (soldiers × BAL.fieldFoodPerSoldierDaily × 30)   # 07 常數（日額 0.02 × 30 = 0.6/月，E-14）
harvestForecast     = §3.1.2 公式（以當前 kokudaka 快照計算，全勢力總和）
foodStock           = Σ_城 food
foodMonthsLeft      = foodUpkeepMonthly > 0 ? floor(foodStock / foodUpkeepMonthly) : Infinity
```

顯示位置與格式見 §6。

### 3.2 郡開發

#### 3.2.1 屬性與潛力上限

每郡（`District`）三項可開發屬性，各有當前值與潛力上限（上限為劇本靜態資料，見 `plan/14-scenario-data.md`）：

| 屬性 | 欄位 | 上限欄位 | 範圍 | 單位 |
|---|---|---|---|---|
| 石高 | `kokudaka` | `kokudakaCap` | 0..上限 | 石 |
| 商業 | `commerce` | `commerceCap` | 0..2000 | 點 |
| 人口 | `population` | `populationCap` | 0..上限 | 人 |

內部以浮點儲存、顯示時 `floor`（見 §8 決策 D5）。
14 的資料基準：郡 `population` 初值約等於 `kokudaka` 數值（1 萬石郡 ≈ 1 萬人口），
使 `BAL.soldiersPerPop = 0.025` 與 00 §6「1 萬石 ≈ 250 常備兵」目標相容。

#### 3.2.2 開發方針（DevelopFocus）

每郡持有一個開發方針，三選一：

| 方針 | 代碼 | 主要屬性 | 附帶效果 |
|---|---|---|---|
| 農業 | `'agri'` | 石高 | — |
| 商業 | `'commerce'` | 商業 | — |
| 兵舍 | `'barracks'` | 人口 | 該郡人口自然成長 ×`BAL.barracksPopGrowthFactor`(=2.0)；該郡對所屬城的徵兵貢獻 ×`BAL.barracksConscriptBonus`(=1.25) |

- **直轄郡**：玩家以 `CmdSetDevelopFocus` 指令設定，永續生效直到更改。委任城的直轄郡由城主 AI 設定（09）。
- **受封郡**：領主 AI 於每月 1 日重新選擇方針（選擇規則參見 `plan/09-ai.md`），玩家不可直接更改（介面唯讀顯示）。

#### 3.2.3 成長公式（每日小步進）

開發於每日 `development` 步驟結算（00 §5.4 第 5 步）。以「月額成長」定義、每日套用 1/30：

```
月額成長(郡, 屬性) =
    有效政務 × BAL.devPolFactor
  × weight(方針, 屬性)          # 方針主屬性 1.0；其餘 BAL.devOffWeight = 0.15
  × scale(屬性)                 # 石高 1.0；商業 BAL.devScaleCommerce = 0.4；人口 BAL.devScalePop = 3.0
  × diminish(屬性)              # 報酬遞減，見下
  × 管理係數                    # 直轄郡 BAL.directDevFactor = 0.8；受封郡 BAL.fiefDevBonus = 1.25
  × 政策/施設乘數               # 例：樂市樂座對商業 ×1.3、檢地對直轄郡 ×1.2

日成長 = 月額成長 / 30
diminish(屬性) = 1 − (當前值 / 上限)^BAL.devDiminishExp    # BAL.devDiminishExp = 2
```

- `BAL.devPolFactor = 0.6`（點／政務點／月，未乘 scale 前的基準）。
- **有效政務**：受封郡＝領主（`stewardId`）的 `pol`；直轄郡＝所屬城城主（`lordId`）的 `pol`；
  城主缺任時取 `BAL.noLordDevPol = 30`。
- 一揆中的郡開發停止（成長 0）。
- 校驗範例：政務 80 的領主、農業方針、開發度 0 的受封郡 → 月成長 ≈ 80 × 0.6 × 1.0 × 1.0 × 1.0 × 1.25 = 60 石／月；
  潛力差 3,000 石約需 5–7 年開滿（含遞減），符合 00 §6「一盤 15–25 年」節奏。

#### 3.2.4 人口自然成長（每月 1 日）

開發成長之外，人口另有自然成長：

```
月自然成長 = population × BAL.popGrowthBase × (0.5 + publicOrder / 100)
             × 徵兵方針人口係數        # 低 1.1／中 1.0／高 0.5（BAL.conscriptPopFactor）
             × 政策係數                # 關所撤廢 ×1.5、城下集住 ×0.9
             × 兵舍方針係數            # 方針為 barracks 時 ×2.0
```

- `BAL.popGrowthBase = 0.002`（/月）。上限 `populationCap`，一揆中改為每月 −1%（§3.8.3）。

### 3.3 知行制

知行＝把郡分封給武將，使其成為**領主**（`stewardId`，00 §14）。

#### 3.3.1 任命規則（`CmdGrantFief`〔officerId≠null〕驗證條件）

1. 目標郡屬於本勢力，且非一揆中。
2. 受封武將為本勢力現役武將（非捕虜、非浪人、非當主）。
3. 受封武將的**所在城**必須是該郡所屬城（領主須就地治理；出陣中武將不可受封）。
4. 該武將受封郡總數（含本次）≤ `BAL.fiefMaxByRank[rank]`（E-03：名依 02、值採 06 序列）：

| 身分 | 足輕組頭 | 足輕大將 | 侍大將 | 部將 | 家老 | 宿老 |
|---|---|---|---|---|---|---|
| 知行上限（郡） | 0 | 1 | 1 | 2 | 3 | 4 |

5. 一郡至多一名領主；改封（換人）視同「罷免＋任命」，套用罷免懲罰。

#### 3.3.2 任命效果

- 郡轉為受封狀態：開發改由領主自動執行（§3.2.3），產出上繳率 `BAL.fiefTaxRate`（§3.1）。
- **忠誠加成**（持續性，受封期間生效，經 06 忠誠管線的「知行加成」項）：
  `+BAL.fiefLoyaltyBonus(=5) + 受封郡數 × BAL.fiefLoyaltyPerDistrict(=3)`。
- **功績累積**：領主每月 1 日獲得 `BAL.stewardMeritPerDistrict(=6) × 受封郡數` 功績（功績→升格見 06）。
- 受封中俸祿全免（§3.1.4）。

#### 3.3.3 罷免規則（`CmdGrantFief`〔officerId=null，收回知行轉直轄〕）

- 隨時可罷免；郡即刻轉為直轄，開發方針保留原值。
- 被罷免武將忠誠一次性 −`BAL.loyaltyReduceFief(=15)`，且失去該郡對應的持續忠誠加成。
- 領主所在城被敵方攻陷、或領主死亡／出奔／被引拔時，其受封郡自動轉直轄（不套罷免懲罰）。
- 郡被敵方制壓翻轉歸屬時（04），知行自動解除（不套罷免懲罰）。

#### 3.3.4 直轄 vs 分封（總覽）

| 面向 | 直轄郡 | 受封郡 |
|---|---|---|
| 開發執行者 | 城主政務（玩家/城主 AI 定方針） | 領主政務（領主 AI 定方針） |
| 開發管理係數 | ×0.8 | ×1.25 |
| 商業收入／秋收上繳 | 100% | ×`BAL.fiefTaxRate`(0.7) |
| 領主俸祿 | —（照常支俸） | 全免 |
| 附帶 | 玩家完全控制 | 領主忠誠＋功績成長 |

### 3.4 城下施設

#### 3.4.1 Slot 與建造規則

- 每城施設 slot 數由城格決定：本城 `BAL.mainCastleSlots = 6`、支城 `BAL.branchCastleSlots = 3`。
- 每種施設**每城限建 1 座**；已建施設佔用 1 slot。
- 建造佇列：每城一條，容量 `BAL.buildQueueSize = 3`；同時施工 1 件，完工後自動開始下一件。
- 下單（`CmdBuildFacility`）時**全額扣除造價**；取消佇列項（`CmdCancelBuild`）退還 `造價 × BAL.buildRefundRate(=0.5)`（施工中亦同）。
- 拆除（`CmdDemolishFacility`）：即時完成、無退款、釋出 slot。
- 前置條件在下單時與完工時各驗證一次；完工時前置不再成立（如政策已廢止）則建造完成但效果停用，
  待條件恢復自動啟用。
- 委任城由城主 AI 依 09 的優先序自動下單建造。

#### 3.4.2 施設一覽（16 種）

工期單位＝日；造價單位＝貫。「該城部隊」＝以該城為出發城編成的部隊（07）。

| ID | 名稱 | 造價 | 工期 | 限制與前置 | 效果（公式） |
|---|---|---|---|---|---|
| `fac.ichi` | 市 | 200 | 60 | — | 該城轄郡商業收入 ×(1 + `BAL.facMarketIncomeBonus`=0.15) |
| `fac.komedoiya` | 米問屋 | 250 | 60 | 需已建 市 | 該城秋收 ×(1 + `BAL.facRiceHarvestBonus`=0.10)；解鎖該城米買賣指令：賣米 `BAL.riceSellRate`=0.02 貫/石、買米 `BAL.riceBuyRate`=0.04 貫/石（每月每城交易上限 `BAL.riceTradeCapMonthly`=10000 石） |
| `fac.heisha` | 兵舍 | 300 | 90 | — | 該城每月徵兵量 ×(1 + `BAL.facBarracksConscriptBonus`=0.25)；城最大兵力 +`BAL.facBarracksSoldierCap`=500 |
| `fac.umaya` | 馬廄 | 400 | 120 | — | 解鎖該城騎馬隊編成；該城部隊機動 +10%（套用點見 07） |
| `fac.kajiba` | 鍛冶場 | 400 | 120 | — | 該城部隊攻擊 ×(1 + `BAL.facSmithyAtkBonus`=0.05)（套用點見 07） |
| `fac.shagekijo` | 射擊場 | 500 | 120 | 需已建 鍛冶場 | 解鎖該城鐵砲隊編成（鐵砲庫存規則見 07）；該城鐵砲隊攻擊 ×(1 + `BAL.facRangeGunAtkBonus`=0.10) |
| `fac.hyojosho` | 評定所 | 350 | 90 | 僅本城 | 該城駐將具申品質提升（掛鉤見 06）；本勢力外交工作效率 ×1.1（掛鉤見 08；全勢力至多一座生效） |
| `fac.minato` | 湊 | 600 | 150 | 城屬性 `coastal === true` | 該城轄郡商業收入 ×(1 + `BAL.facPortIncomeBonus`=0.20)；起訖任一端為本城的輸送隊行經海路邊時速度 ×2（§3.6） |
| `fac.jisha` | 寺社 | 300 | 90 | 與 南蠻寺 互斥 | 該城轄郡治安每月 +`BAL.facTempleSecurity`=2 |
| `fac.nanbanji` | 南蠻寺 | 500 | 120 | 需政策 `pol.nanban` 生效；`coastal === true`；與 寺社 互斥 | 每月金錢 +`BAL.facNanbanGold`=80 貫 |
| `fac.inkyo` | 隱居所 | 250 | 60 | 僅本城 | 該城駐將忠誠持續 +3；壽命死亡判定修正（掛鉤見 06） |
| `fac.kura` | 藏 | 300 | 90 | — | 城兵糧容量 +`BAL.facStorehouseCap`=20000 石 |
| `fac.toride` | 砦 | 350 | 90 | — | 城耐久上限 +`BAL.facFortDurability`=300；敵軍制壓該城轄郡所需日數 ×1.5（套用點見 04） |
| `fac.gakumonjo` | 學問所 | 400 | 120 | 僅本城 | 該城駐將每月能力成長判定機率提升（掛鉤見 06） |
| `fac.ikan` | 醫館 | 300 | 90 | — | 該城傷兵歸隊率 ×1.3（掛鉤見 07）；駐將壽命判定修正（掛鉤見 06） |
| `fac.jokaku` | 城郭強化 | 800 | 180 | — | 城耐久上限 +`BAL.facWallDurability`=500 |

跨文件效果（07/06/08/04）在本表僅定常數與語意，戰鬥／武將管線的套用點由該文件定義；
常數本身仍集中於 `src/core/balance.ts`。

### 3.5 徵兵

- 每城持有徵兵方針 `conscriptPolicy: 'low' | 'mid' | 'high'`（`CmdSetConscriptPolicy` 設定；委任城由城主 AI 設定）。
- **每月 1 日**兵力回復：

```
可徵量 = Σ_該城轄郡 (郡有效人口 × BAL.conscriptRate × 郡兵舍係數)
         × 方針係數 × 施設係數 × 政策係數
  郡有效人口   = 一揆中 0，否則 population
  郡兵舍係數   = 該郡方針為 barracks ? BAL.barracksConscriptBonus(1.25) : 1.0
  方針係數     = BAL.conscriptPolicyFactor: 低 0.5／中 1.0／高 1.8
  施設係數     = 有兵舍施設 ? (1 + BAL.facBarracksConscriptBonus)(=1.25) : 1.0
  政策係數     = 城下集住生效 ? 1.2 : 1.0

實徵量 = min(城最大兵力 − castle.soldiers, floor(可徵量))
castle.soldiers += 實徵量
```

- `BAL.conscriptRate = 0.005`（/月）。
- **城最大兵力**：

```
maxSoldiers = 城格基礎 + floor(Σ_轄郡 population × BAL.soldiersPerPop) × 政策係數
  城格基礎 = 本城 BAL.castleBaseSoldiersMain(=1000)；支城 BAL.castleBaseSoldiersBranch(=500)
  另加施設：兵舍 +500（§3.4.2）
  政策係數 = 城下集住生效 ? 1.1 : 1.0
BAL.soldiersPerPop = 0.025
```

- 徵兵方針的副作用（治安見 §3.8.1、人口見 §3.2.4）：

| 方針 | 治安每月 | 人口成長係數 |
|---|---|---|
| 低 | +1 | ×1.1 |
| 中 | 0 | ×1.0 |
| 高 | −2 | ×0.5 |

- 政策「兵農分離」生效時，高徵兵的治安懲罰歸零（§3.7）。
- 兵力超過 `maxSoldiers`（如轄郡遭制壓使上限下降）時不強制裁軍，但超額期間不徵兵，
  且超額部分維持糧 ×2（嚇阻長期超編）。

### 3.6 兵糧與金錢輸送

- 指令 `CmdTransport`：從我方城 A 輸送 `soldiers`（自 A 城 `castle.soldiers` 扣除，用於城間駐兵調度）、
  `gold`（自勢力金庫扣除，抵達時入庫——金錢雖為勢力資源，輸送金錢的用途是「押運銀被劫」風險敘事＋給 AI
  搶劫目標；見 §8 決策 D7）與 `food`（自 A 城庫存扣除）至我方城 B。三欄皆 ≥0，且不得同時為 0（E-41：合併 02 的兵力輸送）。
- 下單驗證：A、B 同勢力；`soldiers ≤ castleA.soldiers`；`food ≤ castleA.food`；`gold ≤ clan.gold`；路徑存在（A→B 沿街道的最短路，尋路見 04）。
- 出發時生成 `TransportOrder`，物資即刻自來源扣除。輸送隊為**非戰鬥單位**，不需武將帶隊、不佔兵力。
- 移動：沿 04 的節點圖每日推進，欄位與語意同 04 §4.2 `MarchState`（`path`／`pathCursor`／`edgeProgressDays`／`edgeCostDays`，
  對齊 02 §4.13、E-11／E-36）。邊日數 `edgeCostDays = edge.baseDays / BAL.roadGradeSpeedMult[grade]`
  （海路固定＝`baseDays`，見 04 §3.4.2）；輸送隊進入該邊時再**除以**速度係數 `BAL.transportSpeedFactor(=1.0)`
  （15 §5.6 定義為「輸送隊相對步兵基準日速的速度係數」，與同式 `baseDays ÷ roadGradeSpeedMult` 同慣例——速度係數 r 之等效日數乘數為 1/r），
  並乘下列日數係數（原速度倍率 r 之等效日數乘數為 1/r）：
  政策係數（傳馬制生效 ×(2/3)，即原速度 ×1.5 之等效日數乘數）
  × 海路係數（行經海路邊且起訖任一端城有湊 ×(1/2)，即原速度 ×2 之等效日數乘數；否則海路邊 ×1）。
  `edgeProgressDays` 每日 +1，抵達判定 `edgeProgressDays ≥ edgeCostDays`（位於節點上／已抵終點為 0；
  跨節點餘量結轉同 04 §3.7）。預估日數 = 路徑各邊上述調整後日數之總和（無條件進位），下單前 UI 顯示。
- **被劫判定（每日移動結算後）**：輸送隊所在節點存在敵對 `Army`（外交敵對判定見 08）時：
  - 兵糧：敵部隊獲得 `min(輸送糧, 部隊攜行餘裕)`（攜行上限見 07），其餘散失。
  - 金錢：全額歸敵方勢力金庫。
  - 兵力：隨輸送隊消滅而潰散，不併入敵方（押運兵非戰鬥編成）。
  - 輸送隊消滅，發事件 `transport.looted{ownerClanId, fromCastleId, toCastleId, byClanId, nodeId, soldiers, gold, food}`
    （`ownerClanId`＝該輸送隊所屬勢力〔＝`TransportOrder.clanId`，即 `t.clanId`〕，`fromCastleId`／`toCastleId`＝該輸送隊起訖城，
    `byClanId`＝敵方 `Army.clanId`，`nodeId`＝所在節點，`soldiers`／`gold`／`food`＝被劫前之押運量，
    `clanIds=[ownerClanId, byClanId]`；02 §4.19；六輪裁決追記＋七輪裁決 1）；被劫方／劫方雙視角報告由 13 §3.7
    依 `playerClanId` 分流（`report.transport.looted`／`report.transport.lootGain`）。
- 一揆中的郡節點視同存在敵對單位（一揆軍駐於郡節點，§3.8.3）。
- 抵達：兵糧入 B 城（受容量限制，溢出部分發事件 `economy.granaryOverflow{clanId, castleId, food}`，`food`＝散失石數；報告字串見 13 §6.11 `report.economy.granaryOverflow`；02 §4.19；六輪裁決 1）；兵力併入 B 城（受 B 城 `maxSoldiers` 限制，超額散失並報告）；金錢回勢力金庫（即：金錢輸送若安全抵達則無淨變化，僅通過風險區時有損失可能）。
- 玩家可隨時撤回未抵達的輸送隊（`CmdRecallTransport`）：就地折返，規則同上。

### 3.7 政策系統

政策（`Policy`）是勢力級被動法令（00 §14）。

#### 3.7.1 通用規則

- 政策狀態存於獨立容器 `GameState.policies[clanId]`（`ClanPolicyState`，§4；DDR-1）：`active`（生效清單）與 `cooldownUntil`（各政策再採用冷卻）。
- **同時生效數上限** `maxActivePolicies = min(BAL.policySlotMax(=6), 1 + floor(clan.prestige / BAL.policySlotPrestige(=300)))`。
  威信 0 → 1 格；300 → 2 格；…；1500+ → 6 格。
- 採用（`CmdEnactPolicy`）：需滿足解鎖條件、`active` 有空格、非互斥衝突、當下金錢 ≥ 首月維持費（即刻預扣首月維持費）；
  採用**即刻生效**（無施行期，四輪裁決 D-11），該政策即刻入 `active`。
- 之後每月 1 日扣維持費（§3.1.4 順序）。
- 廢止（`CmdRevokePolicy`）：即刻生效、即刻移出 `active`；同一政策廢止後 `BAL.policyReadoptCooldownMonths(=6)` 個月內不得再採用
  （廢止時將可再採用之絕對日寫入 `cooldownUntil[policyId]`）。
- 效果為持續性乘數／加值，於對應公式即時查詢（無快取狀態）。
- AI 勢力採用政策的策略見 09。

#### 3.7.2 政策一覽（12 項）

維持費單位＝貫／月。互斥為雙向。

| ID | 名稱 | 解鎖條件 | 維持費 | 效果（公式） | 互斥 |
|---|---|---|---|---|---|
| `pol.rakuichi` | 樂市樂座 | 威信 ≥ 100 | 50 | 全勢力商業收入 ×1.25；商業開發成長 ×1.3 | — |
| `pol.kenchi` | 檢地 | 威信 ≥ 300 | 100 | 秋收 ×1.1；直轄郡開發成長 ×1.2；受封郡上繳率 +0.05（即 0.75） | — |
| `pol.tenmasei` | 傳馬制 | 威信 ≥ 200 | 60 | 輸送隊速度 ×1.5；部隊行軍速度 +10%（套用點見 07） | — |
| `pol.jishahogo` | 寺社保護 | 威信 ≥ 150 | 40 | 全郡治安每月 +1；一揆判定機率 ×0.5 | `pol.nanban` |
| `pol.nanban` | 南蠻貿易 | 威信 ≥ 400 且全勢力至少一座 湊；或事件 `evt.nanban-visit` 達成 | 120 | 每月金錢 +`BAL.polNanbanGold`(=200) 貫；解鎖鐵砲購入（07） | `pol.jishahogo` |
| `pol.sekisho` | 關所撤廢 | 威信 ≥ 250 | 80 | 商業開發成長 ×1.2；人口自然成長 ×1.5 | — |
| `pol.jokashuju` | 城下集住 | 威信 ≥ 500 | 100 | 城最大兵力 ×1.1；徵兵量 ×1.2；人口自然成長 ×0.9 | — |
| `pol.meyasubako` | 目安箱 | 威信 ≥ 100 | 30 | 全郡治安每月 +1；全武將忠誠持續 +2（06）；具申頻率提升（06） | — |
| `pol.heinobunri` | 兵農分離 | 威信 ≥ 600 | 150 | 徵兵方針之治安懲罰歸零；全部隊士氣上限 +10（07）；城駐兵維持糧 ×1.1 | `pol.goningumi` |
| `pol.goningumi` | 五人組 | 威信 ≥ 350 | 70 | 全郡治安每月 +2；一揆判定機率 ×0.3；敵方調略成功率下降（掛鉤見 08） | `pol.heinobunri` |
| `pol.kakishuchu` | 火器集中 | 威信 ≥ 700 且全勢力至少一座 射擊場；或事件 `evt.teppo-denrai` 達成 | 200 | 全勢力鐵砲隊攻擊 ×1.15（07）；鐵砲購入單價 ×0.8（07） | — |
| `pol.enkokinko` | 遠交近攻 | 威信 ≥ 450，或官位 ≥ 從五位下（官位見 08） | 90 | 外交工作效率 ×1.25（08）；對非鄰接勢力的信用月成長 +2（08） | — |

### 3.8 治安與一揆

#### 3.8.1 治安月結算（每月 1 日，`development` 步驟內）

每郡 `publicOrder ∈ 0..100`。月變化為下列修正之總和，套用後 `clamp(0, 100)`；
`publicOrder > 80` 時正向修正合計減半（軟上限）：

| 因素 | 修正（/月） |
|---|---|
| 徵兵方針（所屬城） | 低 +1／中 0／高 −2（`BAL.conscriptSecurityDelta`；兵農分離生效時「高」改 0） |
| 領主知略（受封郡）／城主知略（直轄郡） | `+floor(int / 40)`（知略 80 → +2） |
| 施設 寺社（所屬城） | +2 |
| 政策 寺社保護／目安箱／五人組 | +1／+1／+2 |
| 郡節點上有敵對部隊停留 | −2 |
| 所屬城被包圍中（07） | −3 |
| 郡被制壓翻轉歸屬（04 觸發，一次性） | −`BAL.securityOnSubjugated`(=20) |
| 一揆被鎮壓（一次性） | 治安直接設為 `BAL.securityAfterSuppress`(=45) |

#### 3.8.2 一揆判定（每月 1 日）

```
對每個非一揆中、屬於任一勢力的郡：
  if 郡.publicOrder < BAL.uprisingThreshold(=30):
    p = (BAL.uprisingThreshold − publicOrder) × BAL.uprisingChancePerPoint(=0.02)   # publicOrder 10 → 40%/月
    if rng.event.next() < p: 爆發一揆
```

#### 3.8.3 一揆效果

爆發時：
- 郡進入 `uprising` 狀態，記錄開始月份；發事件 `uprising.started`（payload `districtId, severity` 見 02 §4.19；
  自動暫停事件之一，00 §5.2 的通知管線；報告由 13 §3.7 導出，13 §6.11 `report.uprising.started`）。
- 於郡節點生成**一揆軍**：兵力 = `floor(population × BAL.uprisingArmyRate(=0.05))`，
  無武將、能力採固定值（統率 40／武勇 50，解算參數見 07），對所有勢力敵對、不移動、不攻城。

持續期間（每月）：
- 郡商業收入、秋收貢獻、徵兵貢獻全部歸零；開發停止；治安凍結不結算。
- 郡人口每月 −1%。

結束條件（先到先算）：
- **鎮壓**：任一我方部隊行軍至該郡節點，與一揆軍進行野戰自動解算（07）；我方勝→一揆結束，
  治安設為 45，參戰武將獲功績（值見 06），發事件 `uprising.ended{districtId, resolved: 'suppressed'}`（`clanIds`＝郡所屬勢力；報告字串見 13 §6.11 `report.uprising.suppressed`；02 §4.19；六輪裁決 1）。我方敗→部隊照 07 敗退規則，一揆軍兵力保留（一揆未結束、不發此事件）。
- **自然平息**：持續滿 `BAL.uprisingAutoEndMonths(=6)` 個月，一揆軍解散，治安設為 40，
  郡人口額外一次性 −5%（流民），發事件 `uprising.ended{districtId, resolved: 'subsided'}`（`clanIds`＝郡所屬勢力；報告字串見 13 §6.11 `report.uprising.subsided`；02 §4.19；六輪裁決 1）。

### 3.9 城主任命與直轄／委任

城主（`Castle.lordId`，02 §4）為城的政務與守備負責人，其在／不在影響開發有效政務（§3.2.3）、城方戰力（07）與治安（§3.8.1）；
直轄／委任（`Castle.directControl`，02 §4）決定該城內政由玩家親自下令或交城主 AI 代管（09）。
本節補齊 `CmdAppointLord`／`CmdSetCastleControl` 兩指令之驗證與效果——此二指令於 02 §4.18 收錄、屬內政域，語意此前懸空，依 00 §0.5 於本文件填補。

#### 3.9.1 城主任命／罷免（`CmdAppointLord`〔castleId, officerId | null〕）

驗證條件：
1. 目標城屬於本勢力，且**非軍團城**（`castle.corpsId === null`）——軍團城之城主由軍團 AI 管理，玩家不可直接任免（07 §3.12）。
2. `officerId ≠ null`（任命）時，受任武將須滿足 02 INV-04：現役（`serving`）、與該城同勢力（`clanId === castle.ownerClanId`）、身分 ≥ 侍大將（`samurai-taisho`，06 §3.4）。
3. 任命時受任武將**所在城**須為該目標城（`locationCastleId === castleId`）且**非出陣中**（`armyId === null`）——城主須就地治理。
4. `officerId = null`（罷免）：將現任城主解職、城 `lordId` 置 `null`（空缺；空缺期間有效政務取 `BAL.noLordDevPol`，§3.2.3）。

效果：
- 設定 `castle.lordId = officerId`（任命）或 `null`（罷免）；同一武將至多任一城城主（INV-04），改任他城視同「先解除原職、再任新職」。
- **忠誠效果**（經 06 §3.6.3 忠誠管線）：任何被**解除城主職**之武將忠誠一次性 −`BAL.loyaltyDismiss`(=10)（含罷免、及因改任他城而騰出原職者）；單純新任城主不另計忠誠增減。
- 城主更替後，該城之開發（§3.2.3）／守備（07）／治安（§3.8.1）即以新城主政務／能力計。

#### 3.9.2 直轄／委任切換（`CmdSetCastleControl`〔castleId, directControl〕）

驗證條件：
1. 目標城屬於本勢力，且**非軍團城**（`castle.corpsId === null`；軍團城恆由軍團 AI 代管，07 §3.12）。
2. 切為委任（`directControl = false`）時，該城須有城主（`lordId ≠ null`）——委任即交城主 AI 代管，無城主則不成立。

效果：
- 設定 `castle.directControl = directControl`；本切換不涉及忠誠增減。
- `true`（直轄）：該城之開發方針（§3.2.2）、徵兵方針（§3.5）、施設建造（§3.4.1）由玩家指令設定。
- `false`（委任）：上述決策改由城主 AI 依 09 之優先序自動執行（玩家介面對該城相關指令唯讀顯示）。

---

## 4. 資料結構

以下 interface 為內政系統欄位規格，正式收錄於 `plan/02-data-model.md`（欄位名以此處為準）。
ID 型別（`DistrictId` 等）與 slug 規範見 00 §8、02。

```ts
/** 開發方針（郡）；型別名依 02（E-07），第三值採 05 的 barracks（02/09 同步） */
export type DevelopFocus = 'agri' | 'commerce' | 'barracks';

/** 徵兵方針（城） */
export type ConscriptPolicy = 'low' | 'mid' | 'high';

/** 郡 — 內政相關欄位（併入 02 的 District） */
export interface DistrictDomestic {
  id: DistrictId;
  name: string;                    // 顯示名（繁中），如「春日井郡」
  castleId: CastleId;              // 所屬城
  kokudaka: number;                // 石高當前值（石；內部浮點，顯示 floor）
  kokudakaCap: number;             // 石高潛力上限（石；劇本靜態）
  commerce: number;                // 商業當前值（點 0..2000；內部浮點）
  commerceCap: number;             // 商業潛力上限（點；劇本靜態）
  population: number;              // 人口當前值（人；內部浮點）
  populationCap: number;           // 人口潛力上限（人；劇本靜態）
  publicOrder: number;             // 治安（0..100 整數）
  stewardId: OfficerId | null;     // 領主；null = 直轄
  developFocus: DevelopFocus;      // 開發方針（受封郡由領主 AI 每月改寫）
  uprising: UprisingState | null;  // 一揆狀態；null = 無
}

/** 一揆狀態 */
export interface UprisingState {
  startedOnDay: number;            // 爆發日（絕對日序，見 03 曆法）
  armySoldiers: number;            // 一揆軍現存兵力（人）
}

/** 城 — 內政相關欄位（併入 02 的 Castle） */
export interface CastleDomestic {
  id: CastleId;
  tier: 'main' | 'branch';         // 城格（00 §14）
  coastal: boolean;                // 臨海（湊/南蠻寺前置；劇本靜態）
  food: number;                    // 兵糧庫存（石；≥0 整數）
  foodFrac: number;                // 兵糧日消耗小數累加器（0..1，存檔保留以維持決定論）
  soldiers: number;                // 城駐兵（人；≥0 整數）
  conscriptPolicy: ConscriptPolicy;// 徵兵方針
  facilities: FacilityTypeId[]; // 已建成施設（每種至多一個）
  buildQueue: BuildOrder[];        // 建造佇列（[0] 為施工中；長度 ≤ BAL.buildQueueSize）
  riceTradedThisMonth: number;     // 本月該城米買賣累計量（石；每月 1 日重置為 0；用於 BAL.riceTradeCapMonthly 上限判定，§5.5）
}

/** 建造佇列項 */
export interface BuildOrder {
  facilityTypeId: FacilityTypeId;  // 目標施設種類
  daysLeft: number;                // 剩餘工期（日；下單時 = FacilityDef.buildDays）
}

/** 施設靜態定義（全 16 筆為 core 內建常數表，非劇本資料） */
export interface FacilityDef {
  id: FacilityTypeId;              // 'fac.ichi' 等，見 §3.4.2
  nameKey: string;                 // i18n key，如 'term.facility.ichi'
  costGold: number;                // 造價（貫）
  buildDays: number;               // 工期（日）
  mainCastleOnly: boolean;         // 僅本城可建
  requiresCoastal: boolean;        // 需臨海
  requiresFacility: FacilityTypeId | null;  // 前置施設（同城已建成）
  requiresPolicy: PolicyId | null;      // 前置政策（本勢力生效中）
  exclusiveWith: FacilityTypeId | null; // 同城互斥施設
}

/** 政策靜態定義（全 12 筆為 core 內建常數表） */
export interface PolicyDef {
  id: PolicyId;                    // 'pol.rakuichi' 等，見 §3.7.2
  nameKey: string;                 // i18n key
  unlockPrestige: number;          // 威信門檻（≥）
  unlockCourtRank: CourtRankId | null;  // 替代解鎖：官位門檻（08；null = 無此途徑）
  unlockEvent: EventId | null;     // 替代解鎖：事件達成（10；null = 無此途徑）
  requiresFacility: FacilityTypeId | null;  // 追加條件：全勢力至少一座該施設
  upkeepGold: number;              // 每月維持費（貫）
  exclusiveWith: PolicyId | null;  // 互斥政策
}

/** 勢力 — 內政相關欄位（併入 02 的 Clan） */
export interface ClanDomestic {
  gold: number;                    // 金錢（貫；≥0 整數）
  prestige: number;                // 威信（0..2000）
}

/** 勢力政策狀態（獨立容器 GameState.policies[clanId]，非併入 Clan，DDR-1；政策採即刻生效、無施行期，四輪裁決 D-11／02 §4.14） */
export interface ClanPolicyState {
  clanId: ClanId;
  active: PolicyId[];              // 生效中政策（採用順序；長度 ≤ maxActivePolicies）
  cooldownUntil: Partial<Record<PolicyId, number>>; // 政策 id → 可再採用的絕對日序（缺鍵＝無冷卻＝0）
}

/** 輸送隊（GameState.transports: TransportOrder[]） */
export interface TransportOrder {
  id: TransportId;                 // 'trans.' 前綴流水 slug
  clanId: ClanId;                  // 所屬勢力
  fromCastleId: CastleId;          // 出發城
  toCastleId: CastleId;            // 目的城
  soldiers: number;                // 押運兵力（人；≥0，E-41）
  gold: number;                    // 押運金錢（貫）
  food: number;                    // 押運兵糧（石）
  path: MapNodeId[];               // 全路徑節點序列（04 尋路產出，含起訖）
  pathCursor: number;              // 目前所在節點在 path 的索引（＝04 MarchState.nodeIndex 語意；02 §4.13、E-11）
  edgeProgressDays: number;        // 往 path[pathCursor+1] 之當前邊已累積行軍日數（日）；位於節點上／已抵終點為 0（E-11）
  edgeCostDays: number;            // 當前邊（輸送隊調整後）有效日數（日）＝邊 edgeCostDays ÷ BAL.transportSpeedFactor（速度係數）
                                    // × 政策/海路日數係數（§3.6）；抵達判定 edgeProgressDays ≥ edgeCostDays（02 §4.13、E-11／E-36）
  returning: boolean;              // 是否已被撤回折返中
}

/** 收支預覽（selector 回傳值，非存檔狀態） */
export interface BudgetForecast {
  goldIncomeMonthly: number;       // 預估月金錢收入（貫）
  goldUpkeepMonthly: number;       // 預估月金錢支出（貫；俸祿＋政策）
  goldNetMonthly: number;          // 月淨額（貫）
  salaryMonthly: number;           // 其中：俸祿（貫）
  policyUpkeepMonthly: number;     // 其中：政策維持費（貫）
  foodUpkeepMonthly: number;       // 預估月兵糧消耗（石；城駐兵＋出陣部隊）
  harvestForecast: number;         // 預估下次秋收總量（石）
  foodStock: number;               // 全勢力兵糧庫存（石）
  foodMonthsLeft: number;          // 兵糧可支撐月數（floor；無消耗時 Infinity）
}
```

內政相關 Command（型別聯集併入 02／03 的 `Command`；驗證失敗的統一錯誤回報機制見 03）：

```ts
export type DomesticCommand =
  | { type: 'setDevelopFocus';    districtId: DistrictId; focus: DevelopFocus }      // 僅直轄郡（E-29）
  | { type: 'grantFief';          districtId: DistrictId; officerId: OfficerId | null } // §3.3；officerId=null 收回直轄（E-29 合併任命/罷免）
  | { type: 'buildFacility';      castleId: CastleId; facilityTypeId: FacilityTypeId }  // §3.4.1（對齊 02 §4.18，E-29）
  | { type: 'cancelBuild';        castleId: CastleId; queueIndex: number }
  | { type: 'demolishFacility';   castleId: CastleId; facilityTypeId: FacilityTypeId }  // 對齊 02 §4.18（E-29）
  | { type: 'setConscriptPolicy'; castleId: CastleId; policy: ConscriptPolicy }
  | { type: 'transport';          fromCastleId: CastleId; toCastleId: CastleId; soldiers: number; gold: number; food: number } // 三欄皆 ≥0，不得同時為 0（E-41）
  | { type: 'recallTransport';    transportId: TransportId }
  | { type: 'tradeRice';          castleId: CastleId; mode: 'buy' | 'sell'; amount: number } // §5.5；需米問屋；amount>0；走 Command 佇列次 tick 開頭結算（D-10，非即時）
  | { type: 'enactPolicy';        policyId: PolicyId }
  | { type: 'revokePolicy';       policyId: PolicyId }
  | { type: 'appointLord';        castleId: CastleId; officerId: OfficerId | null } // §3.9.1；officerId=null 罷免城主（對齊 02 §4.18）
  | { type: 'setCastleControl';   castleId: CastleId; directControl: boolean };     // §3.9.2；true=大名直轄、false=委任城主 AI（對齊 02 §4.18）
```

---

## 5. 演算法與公式

本節為 §3 公式的步驟化整合。執行位置對應 00 §5.4：`development`（第 5 步）、`economy`（第 6 步）。
所有隨機取樣一律走 `rng.event`（一揆判定）；開發與經濟結算**無隨機成分**（決定論友善）。

### 5.1 development 每日步驟

```
developmentDaily(state):
  for 每郡 d（依 id 字典序，確保決定論）:
    if d.uprising !== null: continue
    for attr of ['kokudaka', 'commerce', 'population']:
      monthly = effectivePol(d) × BAL.devPolFactor
                × weight(d.developFocus, attr)      # 主屬性 1.0，其餘 BAL.devOffWeight
                × scale(attr)                       # 1.0 / 0.4 / 3.0
                × (1 − (d[attr] / d[attr+'Cap'])^BAL.devDiminishExp)
                × (d.stewardId ? BAL.fiefDevBonus : BAL.directDevFactor)
                × policyDevMult(state, d, attr)     # 樂市樂座/檢地/關所撤廢 對應乘數
      d[attr] = min(d[attr+'Cap'], d[attr] + monthly / 30)

  if 今日為每月 1 日:
    monthlyDevelopment(state)     # 治安結算 §3.8.1 → 一揆判定 §3.8.2 → 人口自然成長 §3.2.4
                                  # → 受封郡領主重選方針（09）→ 領主功績入帳 §3.3.2

effectivePol(d):
  if d.stewardId: return officers[d.stewardId].pol
  lord = castles[d.castleId].lordId
  return lord ? officers[lord].pol : BAL.noLordDevPol
```

### 5.2 economy 每日步驟

```
economyDaily(state):
  # (a) 城駐兵兵糧消耗（每日）
  for 每城 c（id 字典序）:
    rate = BAL.garrisonFoodPerSoldierMonthly × heinobunriMult(c)      # 兵農分離 ×1.1
    overCap = max(0, c.soldiers − maxSoldiers(c))
    need = (c.soldiers + overCap) × rate / 30                          # 超編部分等效雙倍
    c.foodFrac += need
    whole = floor(c.foodFrac)
    c.foodFrac −= whole
    if c.food >= whole: c.food −= whole
    else:                                                              # 糧盡 §3.1.3
      c.food = 0
      c.soldiers = floor(c.soldiers × (1 − BAL.starveDesertRate))
      城士氣 −BAL.castleStarveMoraleDaily（=2，07 欄位）；發事件 economy.foodShortage{clanId, castleId}（每城每月至多一次，§3.1.3）

  # (b) 建造佇列推進（每日）
  for 每城 c:
    if c.buildQueue.length > 0:
      c.buildQueue[0].daysLeft −= 1
      if daysLeft === 0:
        完工：facilities.push(facilityTypeId)；驗證前置（§3.4.1），發事件 facility.completed{castleId, facilityTypeId}（報告由 13 §3.7 導出，13 §6.11 report.build.done）
        佇列前移；若下一件的 slot/前置已不滿足 → 自動取消並退款 50%，發報告

  # (c) 輸送隊推進與被劫（每日）→ §5.4

  # (d) 每月 1 日：
  if isFirstDayOfMonth:
    for 每城 c: c.riceTradedThisMonth = 0    # 重置米買賣月上限累加器（§5.5）
    monthlyIncomeAndUpkeep(state)   # §5.3
    conscription(state)             # §3.5 公式，逐城結算
  # (e) 每年 9 月 1 日：
  if month === 9 && day === 1:
    autumnHarvest(state)            # §3.1.2，逐城結算、容量截斷
```

### 5.3 每月收支（每月 1 日，勢力依 id 字典序）

```
monthlyIncomeAndUpkeep(state):
  for 每勢力 clan:
    clan.gold += floor(commerceIncome(clan))          # §3.1.1，含施設/政策固定收入
    salary = Σ 現役武將俸祿（當主 0、受封領主 0）
    if clan.gold >= salary: clan.gold −= salary
    else: clan.gold = 0；全武將忠誠 −BAL.unpaidSalaryLoyaltyPenalty（經 06）；發事件 economy.upkeepUnpaid{clanId}
    for pol of state.policies[clan.id].active（由舊到新）:
      if clan.gold >= upkeep(pol): clan.gold −= upkeep(pol)
      else: 標記待廢止
    由新到舊廢止被標記者，直到其餘皆可支付；每廢止一項發事件 policy.autoRevoked{clanId, policyId}
```

### 5.4 輸送隊每日推進

```
transportDaily(state):
  for 每 transport t（id 字典序）:
    if t.edgeCostDays === 0:                                  # 剛進入本邊，計算輸送隊調整後邊日數（§3.6）
      base = edgeCostDays(currentEdge(t))                     # = edge.baseDays / BAL.roadGradeSpeedMult[grade]（海路固定＝baseDays）
      t.edgeCostDays = base / BAL.transportSpeedFactor        # transportSpeedFactor 為速度係數，以 ÷ 套用（15 §5.6）
                       × (傳馬制生效 ? 2/3 : 1.0)
                       × (當前邊為海路 且 起訖任一端城有湊 ? 1/2 : 1.0)
    t.edgeProgressDays += 1
    node = 當前所在節點（未抵達前仍為 path[t.pathCursor]）
    if node 上存在對 t.clanId 敵對的 Army 或一揆軍:
      被劫結算並發事件 transport.looted{ownerClanId: t.clanId, fromCastleId, toCastleId, byClanId, nodeId, soldiers, gold, food}（§3.6）；移除 t；continue
    if t.edgeProgressDays >= t.edgeCostDays:
      t.pathCursor += (t.returning ? -1 : 1)；t.edgeProgressDays = 0；t.edgeCostDays = 0    # 進入下一邊，重算邊日數（餘量結轉略，同 04 §3.7）
      if t.pathCursor 抵達終點（或折返抵達起點）:
        food 入城（容量截斷）；soldiers 併入 B 城（maxSoldiers 截斷）；gold 回勢力金庫；移除 t；
        發事件 transport.arrived{fromCastleId, toCastleId, soldiers, gold, food}（報告由 13 §3.7 導出，13 §6.11 report.transport.arrived）
```

### 5.5 米買賣（`tradeRice`，Command 佇列次 tick 開頭結算）

`tradeRice` 為一般 Command：下單即入佇列，於**次 tick 開頭**的指令處理階段結算（廢除原「即時結算」，統一 Command 語意，D-10；佇列機制見 03）。
結算成功後 `castle.riceTradedThisMonth += amount`（該累加器每月 1 日重置為 0，見 §5.2 (d)）。

```
驗證：城有米問屋；amount > 0；castle.riceTradedThisMonth + amount ≤ BAL.riceTradeCapMonthly
sell: 需 castle.food ≥ amount → food −= amount；clan.gold += floor(amount × BAL.riceSellRate)；castle.riceTradedThisMonth += amount
buy : 需 clan.gold ≥ ceil(amount × BAL.riceBuyRate) → 扣款；food += amount（容量截斷，超出不補償）；castle.riceTradedThisMonth += amount
```

### 5.6 BAL 常數彙整（本文件引入；定案值以 15 為準）

| 常數 | 建議初值 | 單位／說明 |
|---|---|---|
| `BAL.goldPerCommerce` | 0.1 | 貫/商業點/月 |
| `BAL.harvestRate` | 0.3 | 秋收入庫比例 |
| `BAL.garrisonFoodPerSoldierMonthly` | 0.1 | 石/人/月（駐城） |
| `BAL.starveDesertRate` | 0.01 | 糧盡每日逃兵率 |
| `BAL.castleStarveMoraleDaily` | 2 | 一般（非圍城）糧盡城士氣日扣（E-14/E-15 表 C 新增） |
| `BAL.rankSalary` | 3/6/10/15/22/30 | 貫/月（六階；名依 06、值以 15 定案，E-04） |
| `BAL.unpaidSalaryLoyaltyPenalty` | 2 | 欠俸忠誠懲罰（06 擁有，值 15 定案；原名 unpaidSalaryLoyaltyHit） |
| `BAL.fiefTaxRate` | 0.7 | 受封郡上繳率 |
| `BAL.devPolFactor` | 0.6 | 點/政務點/月 |
| `BAL.devOffWeight` | 0.15 | 非方針屬性權重 |
| `BAL.devScaleCommerce` / `BAL.devScalePop` | 0.4 / 3.0 | 屬性尺度係數（石高 1.0） |
| `BAL.devDiminishExp` | 2 | 報酬遞減指數 |
| `BAL.directDevFactor` / `BAL.fiefDevBonus` | 0.8 / 1.25 | 管理係數 |
| `BAL.noLordDevPol` | 30 | 城主缺任時政務基準 |
| `BAL.popGrowthBase` | 0.002 | 人口月自然成長率 |
| `BAL.barracksPopGrowthFactor` / `BAL.barracksConscriptBonus` | 2.0 / 1.25 | 兵舍方針 |
| `BAL.conscriptPopFactor` | 1.1/1.0/0.5 | 低/中/高 |
| `BAL.fiefMaxByRank` | 0/1/1/2/3/4 | 郡（六階；名依 02、值採 06 序列，E-03） |
| `BAL.fiefLoyaltyBonus` / `BAL.fiefLoyaltyPerDistrict` | 5 / 3 | 受封忠誠加成 |
| `BAL.stewardMeritPerDistrict` | 6 | 功績/郡/月 |
| `BAL.loyaltyReduceFief` | 15 | 罷免忠誠懲罰 |
| `BAL.mainCastleSlots` / `BAL.branchCastleSlots` | 6 / 3 | 施設 slot |
| `BAL.buildQueueSize` / `BAL.buildRefundRate` | 3 / 0.5 | 佇列/退款 |
| `BAL.castleFoodCapMain` / `BAL.castleFoodCapBranch` | 60000 / 30000 | 石 |
| 施設常數（§3.4.2 表內全部 `BAL.fac*`） | 見表 | — |
| `BAL.riceSellRate` / `BAL.riceBuyRate` / `BAL.riceTradeCapMonthly` | 0.02 / 0.04 / 10000 | 米買賣 |
| `BAL.conscriptRate` | 0.005 | /月 |
| `BAL.conscriptPolicyFactor` | 0.5/1.0/1.8 | 低/中/高 |
| `BAL.conscriptSecurityDelta` | +1/0/−2 | 低/中/高（治安/月） |
| `BAL.castleBaseSoldiersMain` / `BAL.castleBaseSoldiersBranch` | 1000 / 500 | 人 |
| `BAL.soldiersPerPop` | 0.025 | 兵/人口 |
| `BAL.transportSpeedFactor` | 1.0 | 輸送隊速度係數（§3.6；作用於 `edgeCostDays`，以 ÷ 套用，與傳馬制/海路之 1/r 日數係數同慣例；15 §5.6） |
| `BAL.policySlotMax` / `BAL.policySlotPrestige` | 6 / 300 | 政策格 |
| `BAL.policyReadoptCooldownMonths` | 6 | 月 |
| `BAL.polNanbanGold` | 200 | 貫/月 |
| 政策維持費（§3.7.2 表） | 見表 | 貫/月 |
| `BAL.securityOnSubjugated` / `BAL.securityAfterSuppress` | 20 / 45 | 治安 |
| `BAL.uprisingThreshold` / `BAL.uprisingChancePerPoint` | 30 / 0.02 | 一揆判定 |
| `BAL.uprisingArmyRate` / `BAL.uprisingAutoEndMonths` | 0.05 / 6 | 一揆軍/平息 |

---

## 6. UI/UX

畫面佈局與導航歸 `plan/11-ui-screens.md`；本節定義內政互動流程與繁中字串。

### 6.1 互動流程要點

- **城情報畫面**（11 定義）內政分頁：郡列表（石高/商業/人口/治安/領主/方針，各附「當前/上限」進度條）、
  施設格狀面板（空 slot 點擊開建造選單，不滿足前置的施設以灰階＋原因 tooltip 顯示）、
  徵兵方針三段切換、兵糧庫存與容量條。
- **知行任命**：自郡列點「任命領主」→ 開啟該城駐將清單（顯示身分/政務/忠誠/現有知行數），
  不符資格者灰階＋原因；確認即送出 `grantFief`。罷免需二次確認（顯示忠誠懲罰警告）。
- **收支預覽**：常駐 HUD 顯示金錢與「月淨額（±N貫）」；點擊展開 `BudgetForecast` 明細面板。
  兵糧列顯示「可支撐 N 個月」，N ≤ 2 時數字以警告色顯示。
- **政策畫面**：12 項卡片；生效中高亮、互斥者標記、未解鎖顯示條件；頂部顯示「生效 N / 上限 M」。
- **輸送**：自城情報點「輸送」→ 選目的城（地圖高亮可達城）→ 拉桿設定兵/金/糧 → 顯示預估日數與路線，確認送出。

### 6.2 字串表（併入 `src/i18n/zh-TW.ts`；key 規範見 00 §9）

```ts
// 內政通用
'ui.domestic.title': '內政',
'ui.domestic.districts': '郡一覽',
'ui.domestic.facilities': '城下施設',
'ui.domestic.budget': '收支',
'ui.district.kokudaka': '石高',
'ui.district.commerce': '商業',
'ui.district.population': '人口',
'ui.district.security': '治安',
'ui.district.steward': '領主',
'ui.district.direct': '直轄',
'ui.district.potential': '{current}／{max}',
'ui.district.devPolicy': '開發方針',
'term.devPolicy.agri': '農業',
'term.devPolicy.commerce': '商業',
'term.devPolicy.barracks': '兵舍',
// 收支預覽
'ui.budget.incomeMonthly': '每月收入',
'ui.budget.salary': '家臣俸祿',
'ui.budget.policyUpkeep': '政策維持',
'ui.budget.net': '每月淨額',
'ui.budget.foodUpkeep': '每月兵糧消耗',
'ui.budget.harvestForecast': '秋收預估',
'ui.budget.foodMonthsLeft': '兵糧可支撐{months}個月',
// 知行
'cmd.fief.appoint': '任命領主',
'cmd.fief.dismiss': '罷免領主',
'cmd.fief.confirmDismiss': '罷免{name}將使其忠誠下降，確定執行？',
'ui.fief.limitReached': '{name}的知行已達身分上限',
'ui.fief.notInCastle': '武將須駐於該郡所屬城',
// 施設
'ui.facility.build': '建造',
'ui.facility.demolish': '拆除',
'ui.facility.queue': '建造佇列',
'ui.facility.daysLeft': '尚需{days}日',
'ui.facility.slotEmpty': '（空地）',
'ui.facility.requireNotMet': '未滿足建造條件：{reason}',
'term.facility.ichi': '市', 'term.facility.komedoiya': '米問屋',
'term.facility.heisha': '兵舍', 'term.facility.umaya': '馬廄',
'term.facility.kajiba': '鍛冶場', 'term.facility.shagekijo': '射擊場',
'term.facility.hyojosho': '評定所', 'term.facility.minato': '湊',
'term.facility.jisha': '寺社', 'term.facility.nanbanji': '南蠻寺',
'term.facility.inkyo': '隱居所', 'term.facility.kura': '藏',
'term.facility.toride': '砦', 'term.facility.gakumonjo': '學問所',
'term.facility.ikan': '醫館', 'term.facility.jokaku': '城郭強化',
// 徵兵
'ui.conscript.policy': '徵兵方針',
'term.conscript.low': '低', 'term.conscript.mid': '中', 'term.conscript.high': '高',
'ui.conscript.monthly': '每月徵兵：約{amount}兵',
'ui.conscript.max': '最大兵力：{max}兵',
// 輸送
'cmd.transport.title': '輸送',
'cmd.transport.confirm': '自{from}輸送至{to}，預計{days}日',
'cmd.transport.recall': '撤回輸送隊',
'report.transport.arrived': '輸送隊已抵達{castle}。',
'report.transport.looted': '輸送隊於{place}遭{clan}劫掠！',
'report.transport.lootGain': '我軍於{place}劫獲敵方輸送隊。',
// 米買賣
'cmd.rice.buy': '購入兵糧', 'cmd.rice.sell': '出售兵糧',
// 政策
'ui.policy.title': '政策',
'ui.policy.active': '生效中 {n}／{max}',
'ui.policy.adopt': '採用', 'ui.policy.revoke': '廢止',
'ui.policy.locked': '未解鎖：{condition}',
'ui.policy.exclusive': '與「{name}」互斥',
'ui.policy.cooldown': '廢止後冷卻中（{months}個月）',
'report.policy.autoRevoked': '金錢不足，政策「{name}」已自動廢止。',
// 經濟報告
'report.economy.income': '{month}月收入{gold}貫。',
'report.economy.harvest': '秋收！全領兵糧入庫{food}石。',
'report.economy.granaryOverflow': '{castle}米藏已滿，{food}石散失。',
'report.economy.castleStarving': '{castle}兵糧見底，士卒逃散！',
'report.economy.salaryUnpaid': '俸祿未能全額發放，家臣忠誠動搖。',
// 治安與一揆
'report.uprising.started': '{district}爆發一揆！',
'report.uprising.suppressed': '{district}的一揆已被鎮壓。',
'report.uprising.subsided': '{district}的一揆自然平息。',
'report.build.done': '{castle}的{facility}已落成。',
```

---

## 7. 實作任務清單

- [ ] **T5-1 資料結構**：§4 全部 interface 併入 02 對應型別；`FacilityDef` 16 筆與 `PolicyDef` 12 筆常數表落地 `src/core/`；zod schema（郡三屬性上限）併入 14 的劇本 schema。
  **驗收**：`tools/validate.ts` 對 s1560 子集資料通過；型別 strict 無 any。
- [ ] **T5-2 經濟 tick**：§5.2/§5.3 的每日消耗、每月收支、秋收、糧盡、欠俸、政策自動廢止。
  **驗收**：單元測試——固定 fixture 勢力跑 360 tick，金錢/兵糧軌跡與手算值完全一致；9/1 秋收含容量截斷；`foodFrac` 累加無漂移（1000 日誤差 0）。
- [ ] **T5-3 郡開發**：§5.1 每日步進、報酬遞減、直轄/受封係數、人口自然成長。
  **驗收**：政務 80 領主農業方針郡 12 個月成長 ≈ 60×12×平均遞減，誤差 <1%；達上限後成長為 0。
- [ ] **T5-4 知行**：任命/罷免 Command 驗證全條件（§3.3.1 五條）、忠誠/功績掛鉤（stub 06 管線亦可先行）、自動解除情境（死亡/城陷/制壓）。
  **驗收**：非法任命（身分超限/不在城/一揆中）被拒且回報原因碼；罷免後忠誠差值 = 15＋失去持續加成。
- [ ] **T5-5 城下施設**：slot、佇列、前置/互斥驗證、完工效果啟用、拆除、退款。
  **驗收**：本城第 7 件下單被拒；取消退款 50%；南蠻寺於政策廢止後效果停用、恢復後自動啟用。
- [ ] **T5-6 徵兵**：每月回復、上限推導、方針副作用、超編懲罰。
  **驗收**：轄郡 3×10000 人口的本城，中方針每月 +150 兵、上限 1750（無施設/政策）；郡被制壓後上限即時下修。
- [ ] **T5-7 輸送**：尋路整合（04）、每日推進、被劫、撤回、抵達截斷。
  **驗收**：模擬敵軍駐節點時 100% 被劫且資源轉移正確；傳馬制使日數縮短為 2/3。
- [ ] **T5-8 政策**：解鎖三途徑（威信/官位/事件）、slot 上限、互斥、冷卻、維持費。
  **驗收**：威信 299→300 時 slot 1→2；互斥對同時採用被拒；廢止後 6 個月內再採用被拒。
- [ ] **T5-9 治安與一揆**：月結算全因素、判定（`rng.event`）、一揆軍生成、產出歸零、鎮壓/自然平息。
  **驗收**：publicOrder 10 時以種子固定重放 100 個月，爆發頻率 ≈ 40%（±5%）；一揆中郡收入/秋收/徵兵為 0；golden test 重放一致。
- [ ] **T5-10 收支預覽 selector 與 UI 字串**：`selectBudgetForecast` 純函式；§6.2 字串入 `zh-TW.ts`。
  **驗收**：預覽值與次月 1 日實際結算相符（狀態未變時）；簡體字掃描（17）通過。

---

## 8. 設計決策記錄

- **D1 上繳率同時作用於金錢與兵糧**：`BAL.fiefTaxRate` 對受封郡的商業收入與秋收一體適用，
  規則單一、易於理解與實作；領主自留部分不做帳面追蹤（抽象化），避免引入「武將個人財產」子系統。
- **D2 受封領主俸祿全免**：以知行收入代俸，使「分封＝省俸祿＋快開發＋忠誠功績成長 vs 直轄＝全額產出」
  成為清晰的二元取捨，不需額外係數。當主不支俸同理（自家無需發薪給自己）。
- **D3 開發以「月額定義、每日 1/30 步進」**：00 §5.4 要求 development 每日小步進；本設計讓
  規格以直觀的月額書寫，實作以日步進執行，兩者以除以 30 精確對應（1 月恆為 30 日），
  且受封郡「每月自動開發」語意由「領主 AI 每月 1 日重選方針」承載。
- **D4 直轄郡開發亦自動進行（依城主政務）**：玩家只下「方針」而非逐次點擊開發指令，符合 00 §1.3
  「不微管理每一塊地」支柱；直轄與受封的差異收斂在管理係數（0.8 vs 1.25）與方針控制權。
- **D5 郡屬性內部浮點、資源整數**：石高/商業/人口為緩慢連續成長量，浮點儲存避免日步進被取整吃光；
  金錢/兵糧依 00 §6 維持整數，以 `foodFrac` 累加器保證決定論與零漂移。
- **D6 施設每城限一座、無等級**：16 種 × 有無二態已提供足夠組合深度；引入等級會使委任 AI 與
  UI 複雜度倍增。城郭強化作為一次性大投資替代「城升級」子系統。
- **D7 金錢可被輸送劫掠**：金錢雖為勢力層級資源，仍保留「押運」指令——功能上是給敵我雙方的
  劫掠玩法與 AI 目標（07 的兵站破壞），安全抵達時無淨效果，實作成本低而策略趣味高。
- **D8 一揆軍不移動、不攻城**：v1.0 將一揆定位為「內政懲罰＋派兵處理的摩擦」，而非完整敵勢力；
  移動/攻城型一揆需要 AI 與威風互動的額外規格，收益不成比例。
- **D9 政策效果即時查詢、無快取**：生效政策集合小（≤6），每次公式計算直接查 `state.policies[clanId].active`，
  避免快取失效 bug；效能上每 tick 查詢次數 O(郡數)，可忽略。
- **D10 互斥對僅兩組**（寺社保護↔南蠻貿易、兵農分離↔五人組）：互斥是敘事性取捨（宗教路線／
  兵制路線），過多互斥會讓政策格上限（威信驅動）的取捨感被稀釋。
- **D11 欠俸懲罰採全員一次性 −2 而非個別欠薪追蹤**：避免每武將應收帳款狀態；懲罰月月重複發生
  即形成足夠的財政壓力訊號。

### 8.1 勘誤消化記錄（2026-07-07，依 19 §3.13 與 15 §5.2）

- **E-03（2026-07-07）**：知行郡數上限常數 `fiefLimitByRank`（1/1/2/3/4/5）改名為 `fiefMaxByRank`（名依 02），
  值改為 06 序列 **0/1/1/2/3/4**（足輕組頭無知行）。改動 §3.3.1 規則 4 與其上限表、§5.6 彙整。依據：E-03、15 §5.2 表 A/B。
- **E-04（2026-07-07）**：家臣俸祿常數 `salaryByRank`（2/4/7/12/20/30）改名為 `rankSalary`（名依 06），
  值改為 **3/6/10/15/22/30**。改動 §3.1.4 俸祿公式與俸祿表、§5.6 彙整。依據：E-04、15 §5.2 表 A/B。
- **E-07（2026-07-07）**：開發方針型別 `DevPolicy` 改名為 `DevelopFocus`（名依 02，第三值維持 05 的 `barracks`），
  郡欄位 `devPolicy` 改名為 `developFocus`（對齊 02 `District.developFocus`）。改動 §3.2.2 標題、§4 型別與 `DistrictDomestic`、§5.1 公式。依據：E-07。
- **E-29（2026-07-07）**：內政 Command 名對齊 02 §4.18 既有聯集——`setDevPolicy`→`setDevelopFocus`（欄位 `policy`→`focus`）、
  `adoptPolicy`→`enactPolicy`、`appointSteward`＋`dismissSteward` 合併為 `grantFief`（`officerId=null` 收回直轄，與 02／06 一致）。
  改動 §3.2.2、§3.3.1／§3.3.3 標題、§3.7.1、§4 命令聯集、§6.1 流程。施設命令參數之對齊見 §8.2（2026-07-10）。依據：E-29、02 §4.18。
- **E-08（2026-07-07）**：郡治安欄位 `security` 改名為 `publicOrder`（依 02；BAL 常數 `securityOnSubjugated`／`securityAfterSuppress`／`uprisingThreshold`
  之名稱不變）。改動 §3.2.4、§3.8.1、§3.8.2、§4 `DistrictDomestic`、§7 驗收字句。i18n key（`ui.district.security`）屬 13 範圍未動。依據：E-08。
- **E-09（2026-07-07）**：郡潛力上限欄位 `kokudakaMax`／`commerceMax`／`populationMax` 改名為 `*Cap`（依 02）。
  改動 §3.2.1 表、§3.2.4、§4 `DistrictDomestic`、§5.1 公式。依據：E-09。
- **E-14（2026-07-07）**：出陣糧耗引用由不存在的 `marchFoodPerSoldierMonthly`（建議 0.3）改為 07 的 `fieldFoodPerSoldierDaily`（0.02 石/人/日）；
  §3.1.5 收支預覽月額改為 `fieldFoodPerSoldierDaily × 30`（=0.6/月）。改動 §3.1.3、§3.1.5。依據：E-14、15 §5.2 表 A/B/C。
- **E-41（2026-07-07）**：`CmdTransport` 併入兵力輸送，`transport` 指令與 `TransportOrder` 新增 `soldiers` 欄（三欄 soldiers/gold/food 皆 ≥0、不得同時為 0）；
  §3.6 補押運兵力之扣除／抵達（受 `maxSoldiers` 截斷）／被劫（潰散）規則、§5.4 抵達併入。改動 §3.6、§4、§5.4。依據：E-41。
- **E-53（2026-07-07）**：罷免領主忠誠懲罰由 `dismissLoyaltyPenalty` 改引 06 之 `loyaltyReduceFief`（=15，收回知行統一走此）。改動 §3.3.3、§5.6。依據：E-53、15 §5.2 表 B/C。
- **糧盡城士氣常數命名（2026-07-07）**：§3.1.3／§5.2 原「城士氣每日 −2」未命名者，新增常數 `castleStarveMoraleDaily`(=2)，
  並註明此為非圍城之一般糧盡路徑（圍城改用 07 規則，互斥）。改動 §3.1.3、§5.2、§5.6。依據：15 §5.2 表 C。
- **欠俸忠誠懲罰別名併入（2026-07-07）**：`unpaidSalaryLoyaltyHit`(=3) 併入 06 擁有之 `unpaidSalaryLoyaltyPenalty`(=2)。
  改動 §3.1.4、§5.3、§5.6、決策 D11。依據：15 §5.2 表 A/B。

### 8.2 勘誤消化記錄（2026-07-10，依 19 §3.13 與 02 樞紐定案備忘錄）

- **E-29（2026-07-10，補完）**：解除 2026-07-07 記錄之「未套用」待處理標記——施設 Command 之參數對齊 02 §4.18／E-39
  定案形：`CmdBuildFacility`／`CmdDemolishFacility` 之 `facilityId: FacilityId` 改為 `facilityTypeId: FacilityTypeId`
  （02 之施設命令已無 `slotIndex`，佇列制以 `CmdCancelBuild(queueIndex)` 取代）。一併將 `CastleDomestic.facilities`、
  `BuildOrder.facilityId`、`FacilityDef.id`／`requiresFacility`／`exclusiveWith`、`PolicyDef.requiresFacility`
  之型別與欄位名同步改為 `FacilityTypeId`／`facilityTypeId`，消弭本文件內部之型別落差（02 已無獨立 `FacilityId` 型別）。
  改動 §4 全部施設相關 interface、§4 命令聯集、§5.2 偽碼。依據：E-29、E-39、02 §4.5／§4.18。
- **E-36／E-11（2026-07-10）**：§3.6 輸送速度表述移除不存在之 `BAL.marchBaseSpeed`（04 並無此常數），改採 04 的
  日數累加器模型——邊日數 `edgeCostDays = edge.baseDays / BAL.roadGradeSpeedMult[grade]`（海路固定＝`baseDays`），
  輸送隊進入該邊時再套用 `BAL.transportSpeedFactor`(=1.0)（速度係數；套用方向勘誤見 §8.3）與政策／海路係數；原「速度倍率」表述換算為「日數乘數」
  （傳馬制原 ×1.5 速度 → ×(2/3) 日數；海路＋湊原 ×2 速度 → ×(1/2) 日數，與 §7 T5-7 驗收「傳馬制使日數縮短為 2/3」一致）。
  `TransportOrder` 欄位 `pathIndex`／`edgeProgress` 改名為 `pathCursor`／`edgeProgressDays`，並新增 `edgeCostDays`
  （與 02 §4.13 完全對齊，語意同 04 §4.2 `MarchState`）；§5.4 偽碼同步改寫為逐邊日數推進與抵達判定
  `edgeProgressDays ≥ edgeCostDays`。改動 §3.6、§4 `TransportOrder`、§5.4、§5.6（`transportSpeedFactor` 說明文字）。
  依據：E-36、E-11、02 §4.13、04 §3.4.2／§3.7／§5.3。

### 8.3 勘誤消化記錄（2026-07-11，對抗式驗證修復）

彙整六員對抗式驗證回報之 CONFIRMED findings（已逐項核實兩側原文）：

- **輸送速度係數方向（§3.6／§4 `TransportOrder`／§5.4／§5.6，並更新 §8.2 敘述）**：`BAL.transportSpeedFactor` 於 15 §5.6 定義為
  「輸送隊相對步兵基準日速的速度係數」（值愈大愈快），原 05 以「乘 `edgeCostDays`」套用，方向與速度係數相反（且與同式
  `baseDays ÷ roadGradeSpeedMult`、傳馬制／海路之 1/r 慣例不一致）。改為「除以 `BAL.transportSpeedFactor`」，全部公式與偽碼同步
  （預設值 1.0 下數值不變）。依據：驗證 finding、15 §5.6。
- **米買賣結算時點（§4 `DomesticCommand`／`CastleDomestic`、§5.2 (d)、§5.5）**：對齊 02 §4.18 `CmdTradeRice`／四輪裁決 D-10，廢除原
  「即時結算」，改為一般 Command 於佇列次 tick 開頭結算；`CastleDomestic` 新增 `riceTradedThisMonth`（月上限累加器，每月 1 日重置為 0），
  承載 `BAL.riceTradeCapMonthly` 之「本月該城累計交易量」。依據：D-10、02 §4.18。
- **政策狀態容器（§2 關係表、§3.7.1、§4、§5.3、決策 D9）**：依 DDR-1／四輪裁決 D-11，政策狀態自 `ClanDomestic` 遷入獨立容器
  `GameState.policies[clanId]`（新增 `ClanPolicyState`，欄位對齊 02 §4.14 之 `active`／`cooldownUntil`）；`ClanDomestic` 僅留
  `gold`／`prestige`；明訂政策即刻生效、無施行期。依據：DDR-1、D-11、02 §4.14。
- **城主任命與直轄／委任（新增 §3.9、§4 `DomesticCommand`）**：填補 `CmdAppointLord`／`CmdSetCastleControl` 懸空語意（00 §0.5）——
  補齊驗證條件（身分門檻 06 §3.4／02 INV-04、同城非出陣中、軍團城限制 07 §3.12、委任須有城主）與效果
  （被解除城主職者忠誠 −`BAL.loyaltyDismiss`=10，經 06 §3.6.3）。依據：驗證 finding、02 §4.18、06 §3.4／§3.6.3、07 §3.12。
- **經濟事件具名化（§3.1.3／§3.1.4／§5.2／§5.3）**：原直接「發 `report.economy.castleStarving`／發報告」改為發具名事件
  `economy.foodShortage{clanId, castleId}`（糧盡）與 `economy.upkeepUnpaid{clanId}`（欠俸），明訂發出時機、頻率與 payload；
  報告字串映射見 13 §6.11。依據：四輪裁決 C-5、02 §4.19。
- **郡屬性／`foodFrac` 浮點（存查）**：確認 05 §3.2.1／§4 已為「內部浮點、顯示 floor」（決策 D5）且 `Castle.foodFrac` 已收錄，
  與四輪裁決 D-12／02 §4 一致，無需再改。依據：D-12。

### 8.4 六輪裁決事件收錄（2026-07-11，依 02 §8「2026-07-11 六輪裁決 1」與下游清單）

依五輪 A 定案（報告改由 UI 層 `renderReport` 於渲染時導出、core 不得直接發 `report.*` key）與 02 §8 六輪裁決 1 之 05 側下游清單，
將本文件仍「直接發 `report.*`」之三處收斂為發 canonical 事件（型別／payload 以 02 §4.19 為準）：

- **米藏溢出（§3.1.2 秋收、§3.6 輸送抵達）**：原「並發出 `report.economy.granaryOverflow` 報告」／「溢出散失並報告」，
  兩處均改為發事件 `economy.granaryOverflow{clanId, castleId, food}`（`food`＝散失石數）；報告字串仍映射 13 §6.11 `report.economy.granaryOverflow`。
  改動 §3.1.2、§3.6。依據：02 §4.19、02 §8 六輪裁決 1（05 下游清單 (a)）。
- **政策自動廢止（§3.1.4、§5.3）**：原「每廢止一項發 `report.policy.autoRevoked`」改為發事件 `policy.autoRevoked{clanId, policyId}`（每廢止一項一則）；
  報告字串仍映射 13 §6.11 `report.policy.autoRevoked`。改動 §3.1.4 與 §5.3 偽碼。依據：02 §4.19、02 §8 六輪裁決 1（05 下游清單 (b)）。
- **一揆結束（§3.8.3）**：原「鎮壓／自然平息」兩種結束途徑未具名收束，改為兩者皆發事件 `uprising.ended{districtId, resolved}`
  （`clanIds`＝郡所屬勢力；鎮壓＝`resolved:'suppressed'`、自然平息＝`resolved:'subsided'`；我方鎮壓失敗、一揆未結束者不發此事件）；
  報告字串分流 13 §6.11 `report.uprising.suppressed`／`report.uprising.subsided`。改動 §3.8.3。依據：02 §4.19、02 §8 六輪裁決 1（05 下游清單 (c)）。

**範圍界定（存查，已於 §8.5 同步處理，不再是未決範圍）**：`report.uprising.started`（§3.8.3）、`report.build.done`（§5.2）、
`report.transport.arrived`（§5.4）、`report.transport.looted`／`report.transport.lootGain`（§3.6）等「發 report.*」敘述原非本輪
（六輪裁決 1）裁決範圍——前三者對應之 canonical 事件（`uprising.started`／`facility.completed`／`transport.arrived`）已先於
六輪裁決既存於 02 §4.19，其文字尚未同步純屬既有落差；後二者（劫掠雙報告）當時尚無 02 收錄之 canonical 事件名（13 §6.11
事件欄仍為「—」）。兩類雖皆非 02 §8 六輪裁決 1 之 05 下游清單所列項目，但隨 02 §8 六輪裁決同日追記補收
`transport.looted`（見下）與本檔覆核，兩類落差已一併收斂，詳見 §8.5。

### 8.5 六輪裁決追記與範圍界定殘留同步（2026-07-11）

依 02 §8「2026-07-11 六輪裁決」末尾「追記（同日收尾）」與 §8.4 範圍界定存查項，補齊以下兩類殘留：

- **輸送隊被劫收錄 canonical 事件（`transport.looted`）**：02 §4.19 追記已補收
  `transport.looted{fromCastleId, toCastleId, byClanId, nodeId, soldiers, gold, food}`（發出者 05；被劫方／劫方雙視角由 13 §3.7
  依 `playerClanId` 分流）。本檔同步：(a) §3.6 被劫判定末項「輸送隊消滅，雙方各發報告」改為「發事件 `transport.looted{...}`」
  （payload 逐欄對應：`fromCastleId`／`toCastleId`＝該輸送隊起訖城、`byClanId`＝敵方 `Army.clanId`、`nodeId`＝所在節點、
  `soldiers`／`gold`／`food`＝被劫前之押運量）；(b) §5.4 偽碼「被劫結算（§3.6）」處同步標注發此事件。
  改動 §3.6、§5.4。依據：02 §4.19（六輪裁決追記）。
- **§8.4 範圍界定「既有落差」三處收斂**：`uprising.started`（§3.8.3）／`facility.completed`（§5.2）／`transport.arrived`（§5.4）
  三者之 canonical 事件早於六輪裁決既存於 02 §4.19，惟本檔正文原仍寫「發 `report.*`」，與五輪 A 定案（core 不得直接發
  `report.*` key、報告一律由 13 §3.7 `renderReport` 於渲染時導出）不一致。三處均改為「發事件 X（報告由 13 導出）」表述：
  §3.8.3 一揆爆發改「發事件 `uprising.started`（payload `districtId, severity` 見 02 §4.19）」；§5.2 建造佇列完工改
  「發事件 `facility.completed{castleId, facilityTypeId}`」；§5.4 輸送抵達改「發事件 `transport.arrived{fromCastleId,
  toCastleId, soldiers, gold, food}`」。改動 §3.8.3、§5.2、§5.4。依據：02 §8 六輪裁決（五輪 A 定案延伸適用）、02 §4.19。

### 8.6 七輪裁決 1 同步——`transport.looted` 增 `ownerClanId`（2026-07-11）

依 02 §8「2026-07-11 七輪裁決 1」：`transport.looted` payload 增 `ownerClanId: ClanId`（＝該輸送隊所屬勢力、即 `TransportOrder.clanId`／`t.clanId`，`clanIds=[ownerClanId, byClanId]`），供 13 §3.7 依 `playerClanId` 分流被劫方（`ownerClanId`）／劫方（`byClanId`）視角。本檔同步：§3.6 被劫判定 emit 敘述、§5.4 偽碼 `transport.looted{...}` 皆補 `ownerClanId`（§5.4 以 `t.clanId` 帶入）。改動 §3.6、§5.4。依據：02 §8 七輪裁決 1、02 §4.19。

---

*本文件由 Fable 5 依 00 §13 規範撰寫；實作期若有變更，記錄於本節。*
