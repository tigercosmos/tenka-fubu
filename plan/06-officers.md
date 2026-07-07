# 06 — 武將系統（Officers）

> 本文件是武將相關機制的單一真相來源：四維能力與微成長、特性（Trait）、身分與功績、
> 忠誠、登用與捕虜處置、褒賞、壽命與家督繼承、元服、具申機制（資料與結算）。
> 依 `00-foundations.md` §13 規範撰寫；術語依 00 §14 與 `19-glossary.md`。

---

## 1. 目的與範圍

### 1.1 目的

定義「武將是資產」這條核心體驗支柱（00 §1.3）的全部規則：武將如何量化（能力、特性）、
如何在家中晉升（身分、功績）、如何留住（忠誠、褒賞）、如何取得（登用、捕虜、元服）、
如何失去（出奔、被引拔、壽命、戰死）、以及武將如何主動參與玩家決策（具申）。

### 1.2 範圍內

- 四維能力在各系統的作用總表與微成長規則。
- 特性（Trait）30 個之完整定義（id、繁中名、掛鉤點、公式、稀有度）。
- 身分六階：升格門檻、特權（役職資格、知行上限、帶兵加成、俸祿）；當主特殊身分。
- 功績來源與 `BAL.*` 常數。
- 忠誠模型（月結重算、事件增減、出奔/被引拔判定）。
- 登用（浪人、捕虜處置、他家引拔之受理端規則）。
- 褒賞（金錢賞賜、加封知行、身分推舉）與褒賞介面。
- 壽命排程、死亡結算、家督繼承。
- 元服（登場年檢查）。
- 具申的資料結構與結算（採納/駁回/逾期）。

### 1.3 範圍外（僅引用）

- 忠誠/壽命/元服/具申在每日 tick 的執行時點：參見 `plan/03-game-loop.md`（00 §5.4 步驟 9、10）。
- 知行分封與領主自動治理的執行細節：參見 `plan/05-domestic.md`。
- 帶兵上限基礎值、戰法、捕獲武將的發生條件、戰死機率：參見 `plan/07-military.md`。
- 調略（引拔/流言/內應）的發動端流程與成功率基礎式：參見 `plan/08-diplomacy.md`。
- 具申的**生成邏輯**（哪個武將在何種局面提出什麼）：參見 `plan/09-ai.md`。
- 當主死亡且無繼承人時的勢力滅亡處理：參見 `plan/10-events-and-victory.md`。
- 武將資料的 JSON schema 與 s1560 名單：參見 `plan/14-scenario-data.md`。
- 型別主表收錄：參見 `plan/02-data-model.md`（本文件的介面為權威定義，02 彙整後若有欄位命名調整以 02 為準）。

---

## 2. 與其他文件的關係

| 文件 | 本文件與其之介面 |
|---|---|
| `02-data-model.md` | 本文件 §4 的 `Officer`、`TraitDef`、`Proposal` 等型別由 02 收錄進 `GameState` |
| `03-game-loop.md` | officers 系統於每日 tick 步驟 9 執行；proposals 於步驟 10 結算；本文件定義各步驟內容 |
| `04-map-and-movement.md` | 特性 `trait.kaizoku`/`trait.shinsoku`/`trait.seiatsu` 掛鉤行軍速度與制壓時間 |
| `05-domestic.md` | 知行分封指令與領主治理由 05 定義；本文件定義知行上限、開發類特性乘數、俸祿金額 |
| `07-military.md` | 帶兵上限基礎式、戰法類別標籤、捕虜產生、戰死判定由 07 定義；本文件定義身分帶兵加成與戰鬥類特性乘數。**對 07 的介面需求**：戰法需含 `category: 'valor' \| 'intrigue' \| 'charge' \| 'ranged'` 欄位供特性掛鉤 |
| `08-diplomacy.md` | 調略發動端由 08 定義；本文件定義被引拔受理端規則與外交/調略類特性乘數 |
| `09-ai.md` | 具申生成邏輯、AI 勢力的褒賞/升格/登用自動化由 09 定義；本文件定義資料結構與結算效果 |
| `10-events-and-victory.md` | 勢力滅亡流程；史實戰死事件（如桶狹間之今川義元）覆寫壽命排程 |
| `15-balance.md` | 本文件所有 `BAL.*` 建議初值由 15 主表定案 |

---

## 3. 設計細節

### 3.1 四維能力與作用總表

四維：統率 `ldr`、武勇 `val`、知略 `int`、政務 `pol`，各 1..120（00 §6）。
下表為**作用索引**（公式在各該系統文件，此處不複述）：

| 能力 | 作用點 | 定義文件 |
|---|---|---|
| 統率 `ldr` | 帶兵上限基礎值；部隊防禦力；部隊士氣維持（每日士氣衰減抗性）；野戰自動解算戰力 | `07` |
| 統率 `ldr` | 制壓敵郡所需時間 | `04` |
| 武勇 `val` | 部隊攻擊力；武勇系（valor）與突擊系（charge）戰法威力；攻城強攻傷害 | `07` |
| 知略 `int` | 計謀系（intrigue）戰法威力與敵方計謀抗性；遭遇戰先手判定 | `07` |
| 知略 `int` | 調略（引拔/流言/內應）成功率；反調略（所在城被調略時之抗性） | `08` |
| 知略 `int` | AI 具申品質評分 | `09` |
| 政務 `pol` | 郡開發效率；城下施設工期；徵兵效率 | `05` |
| 政務 `pol` | 外交工作信用累積速度；朝廷交涉 | `08` |
| 政務 `pol` | 登用成功率（執行者）；當主政務進入全家臣忠誠公式（§3.6） | 本文件 |

有效能力值一律為：

```
effectiveStat = min(120, baseStat + statGrowth)    // statGrowth 見 §3.2
```

### 3.2 能力微成長

能力以固定值為主，僅允許小幅成長，保持簡單：

- 每一維各自累積經驗 `statExp`；每累積 `BAL.statExpPerPoint`（建議 **100**）點，
  該維 `statGrowth` +1；每維成長上限 `BAL.statGrowthCap`（建議 **+5**）。
- 到達上限後多餘經驗**捨棄**（不保留溢出）。
- 經驗來源與功績事件綁定（見 §3.5 表）：每次功績事件同時給指定維度等量經驗
  （例：野戰勝利功績 +20 → `ldr` 與 `val` 各 +20 經驗）。
- 不存在能力衰退、不存在教育/修行指令（v1.0 範圍外，見 §8 D-2）。

### 3.3 特性（Trait）

- 每名武將持有 0..`BAL.maxTraitsPerOfficer`（建議 **3**）個特性，由劇本資料指定
  （浪人程序生成池的特性抽取規則見 `14`）。v1.0 不提供特性後天習得（§8 D-3）。
- 特性效果為**被動、無條件常駐**，於掛鉤點以乘數（`mult`：最終值 ×(1+value) 或 ×(1−value)）
  或加值（`add`：直接加到機率/點數）介入。同類 hook 多來源時：`mult` 相乘、`add` 相加。
- 「部隊主將」指 `Army` 的主將（參見 07）；「所率部隊」含任部隊副將時同樣生效的效果會特別註明，
  否則一律**僅主將生效**。
- 機率類 `add` 效果套用後仍受該機制原本的上下限（如成功率封頂 0.95）約束。

#### 特性完整表（30 個；傳說 4／稀有 11／普通 15）

| # | id | 繁中名 | 稀有度 | 掛鉤點（文件） | 效果公式（`BAL.*`＝建議初值） |
|---|---|---|---|---|---|
| 1 | `trait.gunshin` | 軍神 | 傳說 | 合戰數值計算（07） | 合戰中該武將部隊攻防與戰法計算所用四維 ×(1+`BAL.traitGunshin`=0.15) |
| 2 | `trait.ifudodo` | 威風堂堂 | 傳說 | 威風判定（07） | 合戰勝利之威風等級 +1 級（小→中、中→大）；已為大威風時擴散範圍 +`BAL.traitIfudodoAweRange`=1 郡跳數 |
| 3 | `trait.boshin` | 謀神 | 傳說 | 調略成功率（08） | 執行調略成功率 +`BAL.traitBoshin`=0.35（add）；調略費用 ×(1−`BAL.traitBoshinCostCut`=0.25) |
| 4 | `trait.hitotarashi` | 人蕩 | 傳說 | 登用（本文件）；忠誠光環（本文件） | 登用與捕虜登用成功率 +`BAL.traitHitotarashi`=0.30（add）；同城其他我方武將忠誠目標值 +`BAL.traitHitotarashiLoyalty`=5 |
| 5 | `trait.onimusha` | 鬼武者 | 稀有 | 戰法威力（07） | 武勇系（valor）戰法威力 ×(1+`BAL.traitOnimusha`=0.20) |
| 6 | `trait.chikujo` | 築城名手 | 稀有 | 施設建設（05） | 擔任建設負責人時城下施設工期 ×(1−`BAL.traitChikujo`=0.30) |
| 7 | `trait.naisei` | 內政名人 | 稀有 | 郡開發（05） | 擔任開發負責人或知行領主時，郡開發效率 ×(1+`BAL.traitNaisei`=0.20) |
| 8 | `trait.gaiko` | 外交上手 | 稀有 | 外交工作（08） | 執行外交工作時信用累積 ×(1+`BAL.traitGaiko`=0.25) |
| 9 | `trait.teppo` | 鐵砲名人 | 稀有 | 部隊攻擊/戰法（07） | 部隊遠程（ranged）攻擊 ×(1+`BAL.traitTeppo`=0.20)；遠程系戰法威力 ×(1+`BAL.traitTeppo`) |
| 10 | `trait.kiba` | 騎馬達人 | 稀有 | 部隊攻擊/戰法（07） | 部隊近戰攻擊 ×(1+`BAL.traitKiba`=0.15)；突擊系（charge）戰法威力 ×(1+`BAL.traitKibaCharge`=0.20) |
| 11 | `trait.ninja` | 忍者 | 稀有 | 調略成功率（08） | 執行調略成功率 +`BAL.traitNinja`=0.20（add） |
| 12 | `trait.kojo` | 攻城名手 | 稀有 | 攻城（07） | 部隊主將攻城時每日耐久傷害 ×(1+`BAL.traitKojo`=0.20) |
| 13 | `trait.rojo` | 籠城名手 | 稀有 | 守城（07） | 任城主之城被圍時：耐久損傷 ×(1−`BAL.traitRojo`=0.20)；守城方每日士氣下降 ×(1−`BAL.traitRojoMorale`=0.50) |
| 14 | `trait.chiebukuro` | 智囊 | 稀有 | 具申生成（09） | 具申生成權重 ×(1+`BAL.traitChiebukuro`=0.50)（更常被選為提案人；品質評分加成見 09） |
| 15 | `trait.chushin` | 忠臣 | 稀有 | 忠誠（本文件） | 忠誠目標值 +`BAL.traitChushin`=20；不可成為出奔與引拔判定對象 |
| 16 | `trait.kaizoku` | 海賊 | 普通 | 行軍（04） | 部隊主將時經海路邊行軍速度 ×(1+`BAL.traitKaizoku`=0.50) |
| 17 | `trait.nosei` | 農政家 | 普通 | 郡開發（05） | 石高開發效率 ×(1+`BAL.traitNosei`=0.15) |
| 18 | `trait.shosai` | 商才 | 普通 | 郡開發（05） | 商業開發效率 ×(1+`BAL.traitShosai`=0.15) |
| 19 | `trait.reisei` | 冷靜 | 普通 | 部隊士氣（07） | 所率部隊每日士氣下降 ×(1−`BAL.traitReisei`=0.25)；潰走閾值 −`BAL.traitReiseiRout`=10 |
| 20 | `trait.goketsu` | 豪傑 | 普通 | 野戰/合戰（07） | 部隊攻擊 ×(1+`BAL.traitGoketsu`=0.10) |
| 21 | `trait.keigan` | 慧眼 | 普通 | 登用（本文件） | 執行登用（浪人/捕虜）成功率 +`BAL.traitKeigan`=0.20（add） |
| 22 | `trait.jinsei` | 仁政 | 普通 | 治安（05） | 知行郡與任城主之城所轄直轄郡，每月治安額外 +`BAL.traitJinsei`=1 |
| 23 | `trait.shinsoku` | 神足 | 普通 | 行軍（04） | 部隊主將時陸路行軍速度 ×(1+`BAL.traitShinsoku`=0.20) |
| 24 | `trait.heitan` | 兵站上手 | 普通 | 兵糧消耗（05/07） | 所率部隊行軍與圍城之兵糧消耗 ×(1−`BAL.traitHeitan`=0.20) |
| 25 | `trait.boshu` | 募兵上手 | 普通 | 徵兵（05） | 任城主之城徵兵所得兵力 ×(1+`BAL.traitBoshu`=0.20) |
| 26 | `trait.jinbo` | 人望 | 普通 | 忠誠光環（本文件） | 同城其他我方武將忠誠目標值 +`BAL.traitJinbo`=3（不含自身） |
| 27 | `trait.yashin` | 野心家 | 普通 | 功績/忠誠（本文件） | 功績獲得 ×(1+`BAL.traitYashinMerit`=0.20)；忠誠目標值 −`BAL.traitYashinLoyalty`=10 |
| 28 | `trait.chotei` | 朝廷通 | 普通 | 朝廷工作（08） | 朝廷獻金與官位申請費用 ×(1−`BAL.traitChotei`=0.25) |
| 29 | `trait.hayamimi` | 早耳 | 普通 | 反調略（08） | 敵方對該武將所在城執行調略時，敵成功率 −`BAL.traitHayamimi`=0.20（add） |
| 30 | `trait.seiatsu` | 攻略上手 | 普通 | 制壓（04） | 部隊主將時制壓敵郡所需時間 ×(1−`BAL.traitSeiatsu`=0.25) |

稀有度僅用於：(a) 劇本資料配布密度指引（傳說全劇本 ≤ 12 人持有、稀有每大勢力 ≤ 5 人、普通不限；
細則見 14）；(b) UI 顯示徽章顏色（見 §6）。稀有度不進任何公式。

### 3.4 身分六階與特權

身分（`Rank`）六階＋當主特殊身分。升格需同時滿足：功績達門檻、且由玩家（或 09 之 AI）
下達 `PromoteRankCommand`（身分推舉是褒賞的一種，不自動升格；理由見 §8 D-4）。

#### 3.4.1 升格功績門檻（累積值，不因升格歸零）

| 階 | rankIndex | `Rank` 值 | 繁中名 | 升至此階所需功績 `BAL.rankMeritThresholds[i]` |
|---|---|---|---|---|
| 1 | 0 | `ashigaruKumigashira` | 足輕組頭 | 0（起始階） |
| 2 | 1 | `ashigaruTaisho` | 足輕大將 | 300 |
| 3 | 2 | `samuraiTaisho` | 侍大將 | 800 |
| 4 | 3 | `busho` | 部將 | 1600 |
| 5 | 4 | `karo` | 家老 | 3000 |
| 6 | 5 | `shukuro` | 宿老 | 5000 |

`BAL.rankMeritThresholds = [0, 300, 800, 1600, 3000, 5000]`。升格一次只升一階（不可跳階）。

#### 3.4.2 身分特權表

| 身分 | 可任城主 | 可任軍團長 | 知行郡數上限 `BAL.rankFiefCap[i]` | 帶兵上限加成 `BAL.rankTroopBonus[i]` | 月俸祿（貫）`BAL.rankSalary[i]` |
|---|---|---|---|---|---|
| 足輕組頭 | 否 | 否 | 0 | +0% | 3 |
| 足輕大將 | 否 | 否 | 1 | +10% | 6 |
| 侍大將 | 可 | 否 | 1 | +20% | 10 |
| 部將 | 可 | 否 | 2 | +30% | 15 |
| 家老 | 可 | 可 | 3 | +40% | 22 |
| 宿老 | 可 | 可 | 4 | +50% | 30 |

- `BAL.rankFiefCap = [0, 1, 1, 2, 3, 4]`、`BAL.rankTroopBonus = [0, 0.10, 0.20, 0.30, 0.40, 0.50]`、
  `BAL.rankSalary = [3, 6, 10, 15, 22, 30]`。
- 帶兵上限＝07 定義之基礎值 ×(1 + `BAL.rankTroopBonus[rankIndex]`)，四捨五入取整。
- **俸祿**：每月 1 日經濟月結（參見 05）時，勢力對每名**無知行**的在籍武將支付
  `BAL.rankSalary[rankIndex]` 貫；**持有知行（`fiefDistrictIds.length > 0`）者不支俸祿**
  （知行收益即其待遇，收益歸屬見 05；取捨見 §8 D-5）。
- 金錢不足以支付全額俸祿時：支付至金錢歸零，該月**全體支薪對象**忠誠即時
  −`BAL.unpaidSalaryLoyaltyPenalty`=2（欠俸）。
- 升格即時效果：忠誠 +`BAL.loyaltyPromote`=8（§3.6）。

#### 3.4.3 當主（特殊身分）

- 當主由 `Clan.leaderId` 指定，不佔六階（`rank` 欄位保留其原值但不生效）。
- 特權：視同宿老（可任軍團長、帶兵加成 +50%、知行郡數上限 4）；不支俸祿。
- 忠誠恆為 100，不參與忠誠月結；不可成為出奔、引拔、流言之對象。
- 當主之政務與勢力威信進入全家臣忠誠公式（§3.6，「當主魅力代理」）。

### 3.5 功績來源

功績 `merit` 為累積值（不消耗）。來源與常數（同列為該事件給予的能力經驗維度，見 §3.2）：

| 來源 | 常數（建議初值） | 給予對象 | 能力經驗維度 |
|---|---|---|---|
| 具申被採納 | `BAL.meritProposalAdopted` = 30 | 提案人 | 依具申種類：development/facility/policy/recruit→`pol`；march→`ldr`；diplomacy→`pol`；plot→`int` |
| 開發實績（開發指令完成一階段） | `BAL.meritDevelopment` = 10 | 開發負責人 | `pol` |
| 領主自動治理月結 | `BAL.meritStewardMonthly` = 5 | 該郡領主 | `pol` |
| 野戰勝利 | `BAL.meritFieldWin` = 20（敗方參戰 `BAL.meritFieldLose` = 5） | 參戰各武將 | `ldr`、`val` |
| 合戰勝利 | `BAL.meritBattleWin` = 40 | 參戰各武將 | `ldr`、`val` |
| 合戰大勝（產生威風） | 額外 `BAL.meritBattleAweBonus` = 20 | 參戰各武將 | `ldr`、`val` |
| 攻城成功（落城） | `BAL.meritSiegeWin` = 30 | 參戰各武將 | `ldr`、`val` |
| 外交工作成果（協定成立或信用滿） | `BAL.meritDiplomacy` = 25 | 執行武將 | `pol` |
| 調略成功 | `BAL.meritPlot` = 35 | 執行武將 | `int` |

- 戰鬥類功績：部隊主將 ×`BAL.meritCommanderMult`=1.5（四捨五入）。
- `trait.yashin` 對所有來源乘 ×1.2 後取整。
- 戰鬥事件的觸發時點由 07 定義；officers 系統提供 `gainMerit(officerId, amount, expStats)` 供各系統呼叫。

### 3.6 忠誠模型

忠誠 0..100。模型＝「目標值（每月重算）＋漂移＋事件即時增減」三層：

#### 3.6.1 忠誠目標值（每月 1 日重算）

```
loyaltyTarget(o) = clamp(
    BAL.loyaltyBase                                   // 50
  + treatment(o)                                      // 身分待遇 vs 能力，見下
  + (o.fiefDistrictIds.length > 0 ? BAL.loyaltyFiefBonus : 0)   // 10
  + kinshipBonus(o)                                   // 一門 kin=BAL.loyaltyKinBonus(30)、
                                                      // 譜代 fudai=BAL.loyaltyFudaiBonus(10)、外樣 tozama=0
  + floor(leader.pol / BAL.loyaltyLeaderPolDivisor)   // 20 → 當主政務代理，最高 +6
  + floor(clan.prestige / BAL.loyaltyPrestigeDivisor) // 400 → 威信代理，最高 +5
  + traitLoyaltyAdj(o)                                // chushin +20、yashin −10、
                                                      // 同城 jinbo +3 / hitotarashi +5（光環，可疊加）
  - (isPromotionStalled(o) ? BAL.loyaltyStalledPromotion : 0)   // 5，見下
, 0, 100)

treatment(o) = clamp((rankIndex(o) − expectedRankIndex(o)) × BAL.loyaltyRankGapWeight, −18, +18)
  // BAL.loyaltyRankGapWeight = 6

expectedRankIndex(o)：abilityScore = max(ldr, val, int, pol)（有效值）
  abilityScore ≥ 100 → 5；≥ 90 → 4；≥ 80 → 3；≥ 70 → 2；≥ 55 → 1；否則 0
  （門檻表 BAL.expectedRankAbilityThresholds = [55, 70, 80, 90, 100]）

isPromotionStalled(o)：merit 已達下一階門檻且 stalledPromotionMonths ≥ BAL.stalledPromotionGraceMonths(3)
```

#### 3.6.2 每月漂移

每月 1 日（officers 步驟）重算目標值後：

```
loyalty += clamp(loyaltyTarget − loyalty, −BAL.loyaltyDriftPerMonth, +BAL.loyaltyDriftPerMonth)
// BAL.loyaltyDriftPerMonth = 2
```

即：事件造成的忠誠增減不會立即被抹平，而是以每月 ±2 的速度向結構性目標值回歸。

#### 3.6.3 事件即時增減表

| 事件 | 忠誠變化（常數＝建議值） | 觸發文件 |
|---|---|---|
| 褒賞金（小/中/大） | +4 / +6 / +9，年內遞減（§3.9.1） | 本文件 |
| 加封知行（新增一郡） | +`BAL.loyaltyGrantFief` = 8 | 05 執行、本文件定值 |
| 減封（沒收一郡） | −`BAL.loyaltyReduceFief` = 15 | 05 執行、本文件定值 |
| 罷免（解除城主/軍團長職） | −`BAL.loyaltyDismiss` = 10 | 05/07 執行、本文件定值 |
| 身分推舉（升格） | +`BAL.loyaltyPromote` = 8 | 本文件 |
| 具申採納 | +`BAL.proposalAdoptLoyalty` = 2 | 本文件 |
| 具申駁回 | −`BAL.proposalRejectLoyalty` = 2 | 本文件 |
| 具申逾期未理 | −`BAL.proposalExpireLoyalty` = 1 | 本文件 |
| 處斬捕虜（我方非一門家臣連坐） | −`BAL.executeLoyaltyPenalty` = 2 | 本文件 |
| 我方合戰大敗（參戰者） | −`BAL.loyaltyBattleRoutPenalty` = 3 | 07 觸發、本文件定值 |
| 欠俸（該月支薪對象全體） | −`BAL.unpaidSalaryLoyaltyPenalty` = 2 | 05 觸發、本文件定值 |
| 家督交替（新當主上任） | 外樣 −10、譜代 −5、一門 0（`BAL.successionLoyaltyShockTozama`=10、`BAL.successionLoyaltyShockFudai`=5） | 本文件 |

#### 3.6.4 出奔判定（每月）

每月 1 日，漂移結算後，對每名符合條件的武將擲骰（`rng.misc`）：

- 條件：`status === 'active'`、非當主、`kinship !== 'kin'`、無 `trait.chushin`、
  `loyalty < BAL.defectionThreshold`（建議 **30**）。
- 機率：`p = (BAL.defectionThreshold − loyalty) × BAL.defectionChancePerPoint`（建議 **0.01**）
  → 忠誠 0 時每月 30%。
- 出奔結果：解除所有役職（城主/領主/軍團長，職缺處理見 05/07）、知行歸還直轄、
  `status = 'ronin'`、`clanId = null`、留在原 `locationCastleId` 成為浪人（可被任何勢力登用，含原主家）、
  發出報告 `report.officer.defect`。
- 出陣中（隸屬於行動中 `Army`）的武將**不判定出奔**，回城後恢復判定。

#### 3.6.5 被引拔受理（受理端規則）

他家對我方武將發動引拔（發動端流程、費用、執行者修正見 08）。本文件定義受理端：

- 可被列為引拔目標的條件：`loyalty < BAL.poachEligibleLoyalty`（建議 **40**）、非當主、
  非一門（`kinship !== 'kin'`）、無 `trait.chushin`。
- 最終成功率 = 08 計算之 `plotBaseSuccess` × `acceptanceFactor`，其中：

```
acceptanceFactor = clamp((BAL.poachEligibleLoyalty − loyalty) / BAL.poachEligibleLoyalty, 0, 1)
```

- 成功：武將即刻改屬發動勢力（`clanId` 變更、役職與知行同出奔處理）、初始忠誠
  設為 `BAL.poachedInitialLoyalty`（建議 **45**）、移動至發動勢力最近之城（08 指定）、
  發出報告 `report.officer.poached`。

### 3.7 登用

#### 3.7.1 浪人登用

- 指令：`RecruitRoninCommand`。前提：目標 `status === 'ronin'` 且其 `locationCastleId`
  屬於我方；指定一名在同城且未出陣的我方武將為執行者（登用者）。
- 每次嘗試支付禮金 `BAL.recruitAttemptCost`（建議 **20** 貫），成敗皆不退。
- 即時判定（`rng.misc`）：

```
successRate = clamp(
    BAL.recruitBaseRate                                        // 0.30
  + (executor.pol − 50) × BAL.recruitPolWeight                 // 0.004（政務 100 → +0.20）
  + min(clan.prestige, 1000) × BAL.recruitPrestigeWeight       // 0.0003（威信 1000 → +0.30）
  − max(0, abilityScore(target) − 60) × BAL.recruitAbilityPenalty  // 0.004（名將更難）
  + traitAdd(executor)                                         // keigan +0.20、hitotarashi +0.30
, 0.05, 0.95)
```

- 成功：目標加入我方，`status='active'`；初始身分 = `min(expectedRankIndex(target), 3)` 對應階
  （最高部將；對象忠誠傾向即 `expectedRankIndex` 與待遇之關係，透過 §3.6 目標值自然呈現）；
  支付支度金 `abilityScore × BAL.recruitSigningBonusPerAbility`（建議 **2**）貫；
  初始忠誠 = 依 §3.6.1 計算之目標值。
- 失敗：該浪人對**本勢力**進入冷卻，`recruitRetryOn = 今日 + BAL.recruitRetryCooldownDays`（建議 **90** 日）。
- 浪人不支俸祿、不老化消失（壽命排程照常適用）。

#### 3.7.2 捕虜處置

捕虜的產生條件見 07（合戰大勝、攻城落城時機率捕獲敵將）。捕虜 `status='captive'`、
`captorClanId` 為捕獲方、關押於捕獲方指定城（07 給定）。處置指令 `HandleCaptiveCommand`，
三種 `disposition`：

**(a) 登用**（執行者＝同城我方武將，未指定則以當主能力代入）：

```
captiveRecruitRate = clamp(
    BAL.captiveRecruitBaseRate                                  // 0.20
  + (executor.pol − 50) × BAL.captiveRecruitPolWeight           // 0.003
  + (100 − target.loyalty) × BAL.captiveRecruitLoyaltyWeight    // 0.004（忠誠低者易降）
  + min(clan.prestige, 1000) × BAL.captiveRecruitPrestigeWeight // 0.0002
  − (target.kinship === 'kin' ? BAL.captiveKinPenalty : 0)      // 0.35（敵方一門幾乎不降）
  + traitAdd(executor)                                          // keigan +0.20、hitotarashi +0.30
, 0.02, 0.90)
```

- 成功：加入我方（同 §3.7.1 之初始身分/支度金規則），初始忠誠 = `BAL.captiveInitialLoyalty`（建議 **40**）。
- 失敗：維持捕虜，`captiveRetryOn = 今日 + BAL.captiveRetryCooldownDays`（建議 **30** 日）。
- 關押城被敵方攻陷：捕虜獲釋回原勢力（原勢力已滅亡則就地成浪人）。

**(b) 釋放**：威信 +`BAL.releasePrestigeGain`（建議 **5**）；武將回原勢力最近之城
（原勢力滅亡則就地成浪人）；對原勢力之感情改善（數值見 08）。

**(c) 處斬**：`status='dead'`；威信 −`BAL.executePrestigeLoss`（建議 **10**）；
我方全體非一門家臣忠誠 −`BAL.executeLoyaltyPenalty`=2；對象勢力感情大幅惡化（數值見 08）。
敵方**當主**被俘時的處置與勢力吸收另見 10。

#### 3.7.3 他家引拔的受理

見 §3.6.5（受理端規則集中於忠誠章節，08 只需呼叫 `resolvePoachAcceptance()`）。

### 3.8 褒賞

三種褒賞皆為 Command，任意時刻可下達（月初褒賞介面只是彙整入口，見 §6）：

#### 3.8.1 金錢賞賜（`RewardGoldCommand`）

| 檔位 | 費用（貫） | 忠誠基礎增益 |
|---|---|---|
| 小（`small`） | `BAL.rewardGoldSmallCost` = 50 | +`BAL.rewardGoldSmallLoyalty` = 4 |
| 中（`medium`） | `BAL.rewardGoldMediumCost` = 100 | +`BAL.rewardGoldMediumLoyalty` = 6 |
| 大（`large`） | `BAL.rewardGoldLargeCost` = 200 | +`BAL.rewardGoldLargeLoyalty` = 9 |

**遞減**：對同一武將，年內（每年 1 月 1 日重置 `rewardGiftsThisYear`）第 n 次賞賜的實得
增益 = `floor(基礎增益 / 2^(n−1))`，最低 +1。例：大賞賜連發 → +9、+4、+2、+1、+1…。

#### 3.8.2 加封知行

分封指令與流程屬 05（參見 05 知行章節）；本文件定義：新增一郡知行時忠誠
+`BAL.loyaltyGrantFief`=8；知行郡數不得超過 `BAL.rankFiefCap[rankIndex]`（05 的指令驗證器須引用本表）。

#### 3.8.3 身分推舉（`PromoteRankCommand`）

- 驗證：目標 `merit ≥ BAL.rankMeritThresholds[rankIndex + 1]` 且未達宿老。
- 效果：`rankIndex + 1`、忠誠 +8、`stalledPromotionMonths` 歸零、發報告。
- 無金錢費用（俸祿上升即長期成本）。

### 3.9 壽命與死亡、家督繼承

#### 3.9.1 死亡排程（開局一次性，決定論）

劇本初始化時，對**每名**武將（含未登場者）以 `rng.event` 排定 `scheduledDeath`：

```
if (o.historicalDeathYear != null):
    year  = o.historicalDeathYear + uniformInt(rng.event, −2, +2)
    month = o.historicalDeathMonth ?? uniformInt(rng.event, 1, 12)
else:
    deathAge = BAL.defaultDeathAge + uniformInt(rng.event, −BAL.defaultDeathAgeSpread, +BAL.defaultDeathAgeSpread)
               // 60 ± 8
    year  = o.birthYear + deathAge
    month = uniformInt(rng.event, 1, 12)
year = max(year, scenarioStartYear + 1)        // 不得排在開局年（避免開場即死）
o.scheduledDeath = { year, month }
```

戰死（07 之合戰/攻城戰死判定）與史實事件死亡（10，如本能寺）**優先於**排程，
發生即死，排程作廢。

#### 3.9.2 死亡結算（每月 1 日檢查）

`status ∈ {active, ronin, captive}` 且 `scheduledDeath` 等於當前年月者，自然死亡：

1. `status = 'dead'`；發報告 `report.officer.death`。
2. 解除役職：城主缺由該城所屬勢力中同城最高身分（同分取 abilityScore 高者）自動遞補，
   無人則懸缺（委任城由 09 補派）；知行郡歸還直轄；軍團長缺之處理參見 07。
3. 若為當主 → 家督繼承（§3.9.3）。

#### 3.9.3 家督繼承

```
heir = 該勢力 status='active' 且 kinship='kin' 的武將中，
       依 (rankIndex desc, abilityScore desc, 年齡 desc) 排序取第一人
if heir 存在:
    clan.leaderId = heir.id；發報告 report.clan.succession
    全家臣即時忠誠：外樣 −10、譜代 −5、一門 0（§3.6.3）
else:
    勢力滅亡 → 處理流程參見 plan/10-events-and-victory.md
    （所屬武將全數成浪人、領土歸屬等由 10 定義）
```

玩家勢力當主死亡且有繼承人 → 遊戲繼續（玩家改扮演新當主）；無繼承人 → 敗北結局（10）。

### 3.10 元服

- 武將資料含 `birthYear` 與 `debutYear`（未指定時 = `birthYear + BAL.comingOfAgeAge`，建議 **15**）。
- 每年 1 月 1 日（officers 步驟之年 hook）：`status === 'unborn'` 且 `debutYear ≤ 當前年` 者登場：
  - `status = 'active'`；加入 `debutClanId` 指定勢力（該勢力已滅亡則於 `debutCastleId` 就地成浪人，
    該城由 14 資料指定）；初始身分足輕組頭、`merit = 0`、忠誠依 §3.6.1 計算。
  - 發報告 `report.officer.comingOfAge`（僅我方與鄰接勢力顯示，過濾規則見 03 報告系統）。

### 3.11 具申機制

#### 3.11.1 流程總覽

1. **生成**（每月 1 日，tick 步驟 10；生成邏輯＝挑誰提什麼，見 09）：09 對玩家勢力產出
   0..`BAL.proposalMaxPerMonth`（建議 **5**）件 `Proposal`，同一武將同月至多
   `BAL.proposalMaxPerOfficerPerMonth`（建議 **1**）件。AI 勢力不生成 Proposal 物件
   （AI 決策直接走 09 內部管線）。
2. **送達**：進入 `GameState.proposals`（`status='pending'`），觸發自動暫停（00 §5.2）與 UI 具申箱。
3. **裁決**：玩家於期限前下達 `AdoptProposalCommand` 或 `RejectProposalCommand`。
4. **結算**（本文件權責）：
   - **採納**：以提案內含之 `command` 重新驗證（該 Command 的驗證器，見 03/各系統）。
     驗證通過 → 將 `command` 推入佇列立即執行、提案人 `merit + BAL.meritProposalAdopted`
     （含 §3.5 之能力經驗）、忠誠 +2、`status='adopted'`。
     驗證失敗（局勢已變，如標的城已易主）→ `status='expired'`，發報告
     `report.proposal.invalid`，**無**忠誠懲罰。執行成本＝該 Command 本身的成本
     （`estimatedCostGold` 僅供顯示；金錢不足即驗證失敗）。
   - **駁回**：`status='rejected'`、提案人忠誠 −2。
   - **逾期**（`expiresOn` 為生成當月月末 30 日；月末仍 `pending` 者）：`status='expired'`、
     提案人忠誠 −1。
5. 已終結（非 pending）之提案保留至次月月初後從 `GameState.proposals` 清除（報告留存）。

#### 3.11.2 具申種類與對應 Command

| `ProposalKind` | 繁中名 | 內含 Command（定義文件） |
|---|---|---|
| `development` | 開發 | 郡開發指令（05） |
| `facility` | 建設 | 城下施設建設指令（05） |
| `march` | 出陣 | 編成出陣指令（07） |
| `diplomacy` | 外交 | 外交工作指令（08） |
| `plot` | 調略 | 調略指令（08） |
| `recruit` | 登用 | `RecruitRoninCommand`（本文件） |
| `policy` | 政策 | 政策施行指令（05） |

---

## 4. 資料結構

以下型別為本系統之權威定義（由 02 收錄；`ClanId`/`CastleId`/`DistrictId`/`CorpsId`/
`GameDate`/`Command` 等基礎型別見 02/03）：

```ts
/** 武將 ID，形如 'off.oda-nobunaga'（00 §8） */
type OfficerId = string;
/** 特性 ID，形如 'trait.gunshin' */
type TraitId = string;

/** 身分六階（rankIndex 0..5 依此順序） */
type Rank =
  | 'ashigaruKumigashira' // 足輕組頭
  | 'ashigaruTaisho'      // 足輕大將
  | 'samuraiTaisho'       // 侍大將
  | 'busho'               // 部將
  | 'karo'                // 家老
  | 'shukuro';            // 宿老

/** 家臣出身標記：一門／譜代／外樣（劇本資料指定；登用浪人一律 tozama，捕虜登用沿用原標記但視為 tozama） */
type Kinship = 'kin' | 'fudai' | 'tozama';

/** 武將生存狀態 */
type OfficerStatus =
  | 'unborn'   // 未登場（等待元服）
  | 'active'   // 在籍
  | 'ronin'    // 浪人（clanId = null）
  | 'captive'  // 捕虜
  | 'dead';    // 死亡（保留於陣列供查詢，不再參與任何系統）

/** 四維數值組（統率/武勇/知略/政務），單位：點 */
interface OfficerStats {
  ldr: number; // 統率 1..120
  val: number; // 武勇 1..120
  int: number; // 知略 1..120
  pol: number; // 政務 1..120
}

interface Officer {
  id: OfficerId;
  name: string;                       // 繁中顯示名，如「木下藤吉郎」（專有名詞不進 i18n）
  clanId: ClanId | null;              // 所屬勢力；浪人/死亡為 null
  status: OfficerStatus;
  birthYear: number;                  // 西曆生年
  debutYear: number;                  // 元服登場年（資料未給則 birthYear + BAL.comingOfAgeAge）
  debutClanId: ClanId | null;         // 元服時加入的勢力（null＝直接為浪人）
  debutCastleId: CastleId;            // 元服/淪為浪人時的所在城
  historicalDeathYear: number | null; // 史實卒年；無資料為 null
  historicalDeathMonth: number | null;// 史實卒月（1..12）；無資料為 null
  scheduledDeath: { year: number; month: number }; // 開局以 rng.event 排定（§3.9.1）
  baseStats: OfficerStats;            // 固定基礎值
  statExp: OfficerStats;              // 各維累積經驗（點；每 BAL.statExpPerPoint → 成長 +1）
  statGrowth: OfficerStats;           // 各維已獲成長（0..BAL.statGrowthCap）
  traits: TraitId[];                  // 特性，長度 ≤ BAL.maxTraitsPerOfficer
  rank: Rank;                         // 身分
  merit: number;                      // 功績累積值（點，≥0）
  loyalty: number;                    // 忠誠 0..100（當主恆 100）
  kinship: Kinship;                   // 一門/譜代/外樣
  fiefDistrictIds: DistrictId[];      // 知行郡（與 District.stewardId 互為反向索引，05）
  locationCastleId: CastleId;         // 所在城（出陣中以 Army 為準；捕虜＝關押城）
  corpsId: CorpsId | null;            // 所屬軍團（07）
  captorClanId: ClanId | null;        // 捕虜時的捕獲方
  captiveRetryOn: GameDate | null;    // 捕虜登用失敗後，下次可嘗試日
  recruitRetryOn: GameDate | null;    // 浪人登用失敗後，本勢力下次可嘗試日（單一勢力冷卻即可：
                                      //   浪人只存在於一座城，僅該城所屬勢力能嘗試）
  rewardGiftsThisYear: number;        // 年內已受金錢賞賜次數（每年 1/1 歸零）
  stalledPromotionMonths: number;     // 功績達下一階門檻但未升格的連續月數
}

/** 特性掛鉤點（實作為 traitModifier(officer, hook) 查表） */
type TraitHook =
  | 'battle.allStatsMult'        // 合戰四維乘數（07）
  | 'battle.attackMult'          // 部隊攻擊乘數（07）
  | 'battle.rangedAttackMult'    // 遠程攻擊乘數（07）
  | 'battle.tacticPowerValor'    // 武勇系戰法威力（07）
  | 'battle.tacticPowerCharge'   // 突擊系戰法威力（07）
  | 'battle.tacticPowerRanged'   // 遠程系戰法威力（07）
  | 'battle.moraleLossMult'      // 部隊每日士氣下降乘數（07）
  | 'battle.routThresholdAdd'    // 潰走閾值加減（07）
  | 'battle.aweLevelAdd'         // 威風等級加成（07）
  | 'battle.aweRangeAdd'         // 威風範圍加成（07）
  | 'siege.attackMult'           // 攻城耐久傷害乘數（07）
  | 'siege.defenseDamageMult'    // 守城耐久損傷乘數（07）
  | 'siege.defenseMoraleMult'    // 守城士氣下降乘數（07）
  | 'march.landSpeedMult'        // 陸路行軍速度（04）
  | 'march.seaSpeedMult'         // 海路行軍速度（04）
  | 'march.subjugateTimeMult'    // 制壓時間（04）
  | 'army.foodUseMult'           // 部隊兵糧消耗（05/07）
  | 'dev.efficiencyMult'         // 郡開發總效率（05）
  | 'dev.kokudakaMult'           // 石高開發效率（05）
  | 'dev.commerceMult'           // 商業開發效率（05）
  | 'dev.facilityTimeMult'       // 施設工期（05）
  | 'dev.conscriptionMult'       // 徵兵所得（05）
  | 'dev.securityAdd'            // 每月治安加成（05）
  | 'diplo.trustGainMult'        // 信用累積（08）
  | 'diplo.courtCostMult'        // 朝廷費用（08）
  | 'plot.successAdd'            // 調略成功率加成（08）
  | 'plot.costMult'              // 調略費用（08）
  | 'plot.defenseAdd'            // 反調略：敵成功率減值（08）
  | 'officer.recruitSuccessAdd'  // 登用成功率加成（本文件）
  | 'officer.loyaltyAuraAdd'     // 同城忠誠光環（本文件）
  | 'officer.loyaltySelfAdd'     // 自身忠誠目標加減（本文件）
  | 'officer.meritGainMult'      // 功績獲得乘數（本文件）
  | 'proposal.weightMult';       // 具申生成權重（09）

interface TraitEffect {
  hook: TraitHook;
  mode: 'mult' | 'add';  // mult：×(1±value)；add：機率/點數直接加減
  value: number;         // 引用 BAL.traitXxx 常數（§3.3 表）
}

interface TraitDef {
  id: TraitId;
  name: string;                              // 繁中名（顯示用，如「軍神」）
  rarity: 'common' | 'rare' | 'legendary';   // 普通/稀有/傳說
  effects: TraitEffect[];
}
// 全部 30 個 TraitDef 以常數表 TRAITS: Record<TraitId, TraitDef> 實作於
// src/core/state/traits.ts；數值一律引用 BAL.trait*。

/** 具申種類 */
type ProposalKind =
  | 'development' | 'facility' | 'march' | 'diplomacy' | 'plot' | 'recruit' | 'policy';

type ProposalStatus = 'pending' | 'adopted' | 'rejected' | 'expired';

interface Proposal {
  id: string;                    // 'prop.<流水號>'（勢力內遞增）
  clanId: ClanId;                // 收件勢力（v1.0 僅玩家勢力會有 Proposal 物件）
  kind: ProposalKind;
  proposerId: OfficerId;         // 提案人
  createdOn: GameDate;           // 生成日（每月 1 日）
  expiresOn: GameDate;           // 期限＝生成當月 30 日
  command: Command;              // 採納即入佇列的完整 Command（參數已由 09 填妥）
  estimatedCostGold: number;     // 預估執行成本（貫；僅 UI 顯示，實際扣款由 Command 執行）
  status: ProposalStatus;
  summaryKey: string;            // 具申內容一句話的 i18n key（09 生成時指定）
  summaryParams: Record<string, string | number>; // 插值參數（人名/地名等）
}

/* ---------------- Commands（本文件新增；聯集併入 03 之 Command） ---------------- */

interface RecruitRoninCommand {
  type: 'recruitRonin';
  clanId: ClanId;
  executorId: OfficerId;   // 登用者（須與目標同城、未出陣）
  targetId: OfficerId;     // 目標浪人
}

interface HandleCaptiveCommand {
  type: 'handleCaptive';
  clanId: ClanId;
  targetId: OfficerId;                          // 目標捕虜（captorClanId === clanId）
  disposition: 'recruit' | 'release' | 'execute';
  executorId: OfficerId | null;                 // 登用時的執行者；null＝以當主代入
}

interface RewardGoldCommand {
  type: 'rewardGold';
  clanId: ClanId;
  targetId: OfficerId;
  tier: 'small' | 'medium' | 'large';
}

interface PromoteRankCommand {
  type: 'promoteRank';
  clanId: ClanId;
  targetId: OfficerId;
}

interface AdoptProposalCommand {
  type: 'adoptProposal';
  clanId: ClanId;
  proposalId: string;
}

interface RejectProposalCommand {
  type: 'rejectProposal';
  clanId: ClanId;
  proposalId: string;
}
```

`GameState` 掛載點（02 收錄）：`officers: Record<OfficerId, Officer>`、
`proposals: Proposal[]`。

---

## 5. 演算法與公式

### 5.1 officers 每日步驟（tick 步驟 9）

```
officersSystem(state):
  if state.time.day === 1:            // 每月 1 日
    paySalaries(state)                // 5.2（金流實際扣帳於 economy 步驟，此處計算清單，參見 05）
    recomputeLoyalty(state)           // 5.3
    checkDefections(state)            // 5.4
    checkDeaths(state)                // 5.5
    updatePromotionStall(state)       // 對 merit 達標未升格者 stalledPromotionMonths += 1
  if state.time.month === 1 && state.time.day === 1:   // 每年 1/1
    resetRewardCounters(state)        // 全員 rewardGiftsThisYear = 0
    comingOfAge(state)                // 5.6
```

### 5.2 俸祿

```
paySalaries(state):
  for clan in 全勢力:
    payees = clan 在籍武將 where status='active' && 非當主 && fiefDistrictIds.length === 0
    total  = Σ BAL.rankSalary[rankIndex(o)]
    if clan.gold >= total: clan.gold -= total
    else:
      clan.gold = 0
      for o in payees: o.loyalty = max(0, o.loyalty − BAL.unpaidSalaryLoyaltyPenalty)
      發報告 report.clan.unpaidSalary（僅玩家勢力）
```

（扣帳時點併入 economy 月結順序，參見 05；本函式定義金額與欠俸效果。）

### 5.3 忠誠月結

```
recomputeLoyalty(state):
  for o in 全武將 where status='active' && 非當主:
    target = loyaltyTarget(o)                       // §3.6.1
    delta  = clamp(target − o.loyalty, −BAL.loyaltyDriftPerMonth, +BAL.loyaltyDriftPerMonth)
    o.loyalty = clamp(o.loyalty + delta, 0, 100)
```

同城光環（`officer.loyaltyAuraAdd`）計算：掃描同 `locationCastleId` 的**其他**在籍我方武將，
將其 `trait.jinbo`(+3)/`trait.hitotarashi`(+5) 效果加總後計入 target；光環可疊加、無上限
（target 最終仍 clamp 0..100）。

### 5.4 出奔判定

```
checkDefections(state):
  for o in 全武將 where 符合 §3.6.4 條件（依 OfficerId 字典序遍歷，確保決定論）:
    p = (BAL.defectionThreshold − o.loyalty) × BAL.defectionChancePerPoint
    if rng.misc.next() < p: defect(o)   // §3.6.4 出奔結果
```

### 5.5 死亡與繼承

```
checkDeaths(state):
  for o in 全武將 where status in {active, ronin, captive}（依 OfficerId 字典序）:
    if o.scheduledDeath.year === time.year && o.scheduledDeath.month === time.month:
      die(o, cause='natural')

die(o, cause):
  o.status = 'dead'
  釋出役職與知行（§3.9.2；城主遞補：同城同勢力 rankIndex desc → abilityScore desc 取首）
  if o 是某勢力當主: succession(clan)    // §3.9.3
  發報告 report.officer.death / report.officer.killedInAction（cause='battle' 時，由 07 呼叫 die）
```

### 5.6 元服

```
comingOfAge(state):
  for o in 全武將 where status='unborn' && o.debutYear <= time.year（依 OfficerId 字典序）:
    o.status = 'active'
    if o.debutClanId 存在且該勢力存活: 加入之；o.locationCastleId = o.debutCastleId
    else: o.status='ronin'; o.clanId=null; o.locationCastleId = o.debutCastleId
    o.rank='ashigaruKumigashira'; o.merit=0; o.loyalty = loyaltyTarget(o)
    發報告 report.officer.comingOfAge
```

### 5.7 功績與經驗入帳（供各系統呼叫的共用函式）

```
gainMerit(o, baseAmount, expStats: ('ldr'|'val'|'int'|'pol')[]):
  amount = round(baseAmount × (o 有 trait.yashin ? 1 + BAL.traitYashinMerit : 1))
  o.merit += amount
  for s in expStats:
    o.statExp[s] += amount
    while o.statExp[s] >= BAL.statExpPerPoint && o.statGrowth[s] < BAL.statGrowthCap:
      o.statExp[s] -= BAL.statExpPerPoint
      o.statGrowth[s] += 1
    if o.statGrowth[s] >= BAL.statGrowthCap: o.statExp[s] = 0   // 溢出捨棄
  if o.merit 首次達到下一階門檻: 發報告 report.officer.meritReady（僅玩家勢力）
```

### 5.8 具申結算

```
applyAdoptProposal(cmd):
  p = 找到 proposalId 且 status='pending'（否則指令無效，靜默丟棄並發 UI 錯誤字串）
  if validateCommand(p.command) 通過:
    executeCommand(p.command)
    gainMerit(提案人, BAL.meritProposalAdopted, expStatsByKind(p.kind))   // §3.5 表
    提案人.loyalty = min(100, +BAL.proposalAdoptLoyalty)
    p.status = 'adopted'
  else:
    p.status = 'expired'; 發報告 report.proposal.invalid

applyRejectProposal(cmd):
  p.status = 'rejected'; 提案人.loyalty −= BAL.proposalRejectLoyalty

proposalsSystem(state):    // tick 步驟 10
  if day === 1:
    對逾期 pending 提案：status='expired'、提案人忠誠 −BAL.proposalExpireLoyalty
    清除上上月之已終結提案
    呼叫 09 生成本月新提案（上限 BAL.proposalMaxPerMonth；每人 BAL.proposalMaxPerOfficerPerMonth）
```

### 5.9 特性查詢共用函式

```
traitModifier(o, hook) -> { mult: number, add: number }:
  mult = 1; add = 0
  for t in o.traits: for e in TRAITS[t].effects where e.hook === hook:
    if e.mode === 'mult': mult ×= (1 + e.value)    // 減益特性以負 value 表示
    else: add += e.value
  return { mult, add }
// 各系統套用：finalValue = baseValue × mult + add（機率類再 clamp 至該機制上下限）
```

### 5.10 BAL 常數彙整（本文件新增；定案值以 15 為準）

能力成長：`statExpPerPoint`=100、`statGrowthCap`=5、`maxTraitsPerOfficer`=3。
身分：`rankMeritThresholds`=[0,300,800,1600,3000,5000]、`rankFiefCap`=[0,1,1,2,3,4]、
`rankTroopBonus`=[0,0.10,0.20,0.30,0.40,0.50]、`rankSalary`=[3,6,10,15,22,30]、
`unpaidSalaryLoyaltyPenalty`=2。
功績：`meritProposalAdopted`=30、`meritDevelopment`=10、`meritStewardMonthly`=5、
`meritFieldWin`=20、`meritFieldLose`=5、`meritBattleWin`=40、`meritBattleAweBonus`=20、
`meritSiegeWin`=30、`meritDiplomacy`=25、`meritPlot`=35、`meritCommanderMult`=1.5。
忠誠：`loyaltyBase`=50、`loyaltyRankGapWeight`=6、`expectedRankAbilityThresholds`=[55,70,80,90,100]、
`loyaltyFiefBonus`=10、`loyaltyKinBonus`=30、`loyaltyFudaiBonus`=10、`loyaltyLeaderPolDivisor`=20、
`loyaltyPrestigeDivisor`=400、`loyaltyStalledPromotion`=5、`stalledPromotionGraceMonths`=3、
`loyaltyDriftPerMonth`=2、`loyaltyGrantFief`=8、`loyaltyReduceFief`=15、`loyaltyDismiss`=10、
`loyaltyPromote`=8、`loyaltyBattleRoutPenalty`=3、`successionLoyaltyShockTozama`=10、
`successionLoyaltyShockFudai`=5。
出奔/引拔：`defectionThreshold`=30、`defectionChancePerPoint`=0.01、`poachEligibleLoyalty`=40、
`poachedInitialLoyalty`=45。
登用：`recruitBaseRate`=0.30、`recruitPolWeight`=0.004、`recruitPrestigeWeight`=0.0003、
`recruitAbilityPenalty`=0.004、`recruitAttemptCost`=20、`recruitSigningBonusPerAbility`=2、
`recruitRetryCooldownDays`=90。
捕虜：`captiveRecruitBaseRate`=0.20、`captiveRecruitPolWeight`=0.003、
`captiveRecruitLoyaltyWeight`=0.004、`captiveRecruitPrestigeWeight`=0.0002、`captiveKinPenalty`=0.35、
`captiveInitialLoyalty`=40、`captiveRetryCooldownDays`=30、`releasePrestigeGain`=5、
`executePrestigeLoss`=10、`executeLoyaltyPenalty`=2。
褒賞：`rewardGoldSmallCost`=50、`rewardGoldMediumCost`=100、`rewardGoldLargeCost`=200、
`rewardGoldSmallLoyalty`=4、`rewardGoldMediumLoyalty`=6、`rewardGoldLargeLoyalty`=9。
壽命/元服：`defaultDeathAge`=60、`defaultDeathAgeSpread`=8、`comingOfAgeAge`=15。
具申：`proposalMaxPerMonth`=5、`proposalMaxPerOfficerPerMonth`=1、`proposalAdoptLoyalty`=2、
`proposalRejectLoyalty`=2、`proposalExpireLoyalty`=1。
特性（§3.3 表）：`traitGunshin`=0.15、`traitIfudodoAweRange`=1、`traitBoshin`=0.35、
`traitBoshinCostCut`=0.25、`traitHitotarashi`=0.30、`traitHitotarashiLoyalty`=5、`traitOnimusha`=0.20、
`traitChikujo`=0.30、`traitNaisei`=0.20、`traitGaiko`=0.25、`traitTeppo`=0.20、`traitKiba`=0.15、
`traitKibaCharge`=0.20、`traitNinja`=0.20、`traitKojo`=0.20、`traitRojo`=0.20、`traitRojoMorale`=0.50、
`traitChiebukuro`=0.50、`traitChushin`=20、`traitKaizoku`=0.50、`traitNosei`=0.15、`traitShosai`=0.15、
`traitReisei`=0.25、`traitReiseiRout`=10、`traitGoketsu`=0.10、`traitKeigan`=0.20、`traitJinsei`=1、
`traitShinsoku`=0.20、`traitHeitan`=0.20、`traitBoshu`=0.20、`traitJinbo`=3、`traitYashinMerit`=0.20、
`traitYashinLoyalty`=10、`traitChotei`=0.25、`traitHayamimi`=0.20、`traitSeiatsu`=0.25。

### 5.11 邊界條件

- 所有機率 clamp 後才擲骰；擲骰一律走 `rng.misc`（開局死亡排程用 `rng.event`），
  遍歷順序固定為 `OfficerId` 字典序（決定論，00 §5.5）。
- 忠誠、治安、士氣等一切增減後立即 clamp 至其範圍（00 §6）。
- 出陣中武將：不判定出奔（§3.6.4）；可正常死亡（自然死亡時其部隊主將缺位處理見 07）。
- 捕虜不領俸祿、不計入知行、不參與忠誠月結（其 `loyalty` 凍結於被俘當下，供登用公式使用）。
- 同一 tick 多筆褒賞指令對同一武將：依提交順序逐筆結算（遞減計數即時遞增）。
- `unborn` 武將不出現在任何 UI 名單、不參與死亡以外的任何判定
  （若 `scheduledDeath` 早於 `debutYear`，登場檢查時直接跳過並轉為 `dead`，不發報告——史實早夭者）。

---

## 6. UI/UX

畫面佈局與導航屬 11/12；本節定義武將系統特有的互動流程與字串。

### 6.1 互動流程

- **武將一覽**（勢力選單 → 家臣團）：表格欄＝姓名/身分/四維/忠誠/功績/特性/所在/役職；
  忠誠 < 30 紅字、30..49 黃字。列點擊 → 武將詳情面板（含成長進度條、知行清單、褒賞按鈕組）。
- **褒賞介面**（每月 1 日自動暫停時可從通知直達）：列出忠誠升冪之家臣、
  該武將年內已賞賜次數與下次實得增益預覽、三檔賞金按鈕、
  「推舉」按鈕（功績達標時亮起）、「加封」跳轉知行畫面（05）。頂部顯示本月已支出褒賞金總額。
- **具申箱**：月初送達時 modal 彙整全部 pending 提案；每件顯示提案人、種類徽章、
  一句話內容（`summaryKey`）、預估費用、〔採納〕〔駁回〕；可〔全部駁回〕。
- **捕虜處置** modal：合戰/攻城結束產生捕虜時彈出；顯示登用成功率預覽、三按鈕。
- **浪人登用**：城畫面 → 城下 → 在野武將清單 →〔登用〕（顯示成功率預覽與費用；冷卻中置灰）。

### 6.2 繁中字串表（節錄；完整表彙整於 13）

| key | 字串 |
|---|---|
| `ui.officer.list.title` | 家臣團 |
| `ui.officer.ldr` | 統率 |
| `ui.officer.val` | 武勇 |
| `ui.officer.int` | 知略 |
| `ui.officer.pol` | 政務 |
| `ui.officer.rank` | 身分 |
| `ui.officer.merit` | 功績 |
| `ui.officer.loyalty` | 忠誠 |
| `ui.officer.traits` | 特性 |
| `ui.officer.fief` | 知行 |
| `ui.officer.salary` | 俸祿 |
| `ui.officer.kinship.kin` | 一門 |
| `ui.officer.kinship.fudai` | 譜代 |
| `ui.officer.kinship.tozama` | 外樣 |
| `term.rank.ashigaruKumigashira` | 足輕組頭 |
| `term.rank.ashigaruTaisho` | 足輕大將 |
| `term.rank.samuraiTaisho` | 侍大將 |
| `term.rank.busho` | 部將 |
| `term.rank.karo` | 家老 |
| `term.rank.shukuro` | 宿老 |
| `term.rank.leader` | 當主 |
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
| `report.officer.death` | {name}病歿，享年{age}歲。 |
| `report.officer.killedInAction` | {name}於{place}戰死。 |
| `report.officer.defect` | {name}對待遇不滿，出奔而去！ |
| `report.officer.poached` | {name}被{clan}引拔，離開了我家！ |
| `report.officer.comingOfAge` | {name}元服，加入{clan}。 |
| `report.officer.meritReady` | {name}功績已足，可推舉為{rank}。 |
| `report.officer.promoted` | {name}升格為{rank}。 |
| `report.officer.recruited` | {name}仕官於我家。 |
| `report.officer.recruitFailed` | {name}婉拒了登用。 |
| `report.captive.recruited` | {name}降伏，仕官於我家。 |
| `report.captive.released` | 已釋放{name}，威信提升。 |
| `report.captive.executed` | 已處斬{name}。家中隱有不安。 |
| `report.clan.succession` | {oldLeader}逝去，{newLeader}繼任家督。 |
| `report.clan.unpaidSalary` | 金錢不足，本月俸祿未能全額發放，家臣心生不滿。 |
| `report.proposal.invalid` | {name}的具申因情勢變化而作罷。 |

稀有度徽章顏色（design token 名，值見 12）：傳說 `--trait-legendary`（金）、
稀有 `--trait-rare`（紫）、普通 `--trait-common`（灰藍）。

---

## 7. 實作任務清單

- [ ] **T1　型別與常數**：實作 §4 全部型別、`TRAITS` 表（30 筆）、§5.10 常數併入 `balance.ts`。
  驗收：`tsc --noEmit` 通過；`TRAITS` 單元測試檢查 30 筆、id 前綴 `trait.`、稀有度分布 4/11/15。
- [ ] **T2　traitModifier**：實作 §5.9 查詢函式與全部 `TraitHook`。
  驗收：單測覆蓋 mult 疊乘、add 疊加、無特性回傳 {1,0}。
- [ ] **T3　能力成長與功績**：實作 `gainMerit`（§5.7）與有效能力值 selector。
  驗收：單測——經驗 100 進 1 點、上限 +5 後溢出捨棄、`trait.yashin` 乘數、120 封頂。
- [ ] **T4　身分與俸祿**：升格驗證器/效果、俸祿月結（含欠俸）、帶兵加成 selector 供 07 引用。
  驗收：單測——跳階拒絕、門檻不足拒絕、知行者不支薪、欠俸全體 −2。
- [ ] **T5　忠誠月結**：目標值公式、光環、漂移、事件增減 API（供 05/07/08 呼叫）。
  驗收：golden 單測——固定狀態下 target 值逐項核對；漂移 ±2 封頂。
- [ ] **T6　出奔與引拔受理**：§3.6.4/§3.6.5，含決定論遍歷順序。
  驗收：同種子重放結果一致；一門/忠臣/當主/出陣中不出奔。
- [ ] **T7　登用與捕虜**：三個 Command 的驗證器與 apply；冷卻；成功率預覽 selector（UI 用）。
  驗收：單測——成功率 clamp、冷卻期指令被拒、關押城陷落釋放。
- [ ] **T8　壽命與繼承**：開局排程（`rng.event`）、月檢查、`die()`、`succession()`。
  驗收：無卒年者排 60±8；繼承順位（一門→身分→能力→年齡）單測；無嗣觸發 10 之滅亡入口。
- [ ] **T9　元服**：年檢查與登場。驗收：`debutYear` 當年 1/1 登場；勢力滅亡轉浪人；早夭跳過。
- [ ] **T10　具申結算**：`Proposal` 生命週期、採納/駁回/逾期、與 09 生成介面（stub 可先行）。
  驗收：採納執行內含 Command 並加功績忠誠；驗證失敗轉 expired 無懲罰；月末逾期 −1。
- [ ] **T11　UI**：家臣團一覽、武將詳情、褒賞介面、具申箱、捕虜 modal、浪人登用；§6.2 字串入 `zh-TW.ts`。
  驗收：Playwright smoke——開局可開啟家臣團並對一名武將完成小額賞賜。
- [ ] **T12　整合測試**：跑 s1560 前 24 個月模擬，斷言無 NaN/越界忠誠、俸祿現金流為負時觸發欠俸路徑、
  至少一件具申完成完整生命週期。

---

## 8. 設計決策記錄

- **D-1　忠誠採「目標值＋漂移」雙層模型**：純事件加減會讓忠誠漂移無界、難以平衡；
  純公式重算則褒賞瞬間失效、玩家投資無意義。折衷：結構性因素決定長期水位（目標值），
  褒賞等事件提供即時但會緩慢回歸的偏移（每月 ±2），兼顧可預測與可經營。
- **D-2　能力微成長不做教育指令**：成長綁定功績事件即可讓「用誰誰變強」自然發生，
  新增育成指令會增加 UI 與 AI 分支，違反知行自主的減微管理支柱，故排除於 v1.0。
- **D-3　特性固定 3 個上限、無後天習得**：特性是資料層身分標籤而非成長系統；
  習得機制需要額外的觸發與平衡面，收益低於成本。浪人生成池的特性抽取由 14 規範。
- **D-4　升格需玩家推舉而非自動**：升格伴隨俸祿與知行上限變化，屬資源決策；
  自動升格會剝奪褒賞的策略性。以「達標未推舉 3 個月後忠誠目標 −5」保留壓力而非強制。
- **D-5　有知行者不支俸祿**：符合知行制史觀（知行即俸），並讓「加封 vs 發薪」成為
  現金流與土地的取捨；也簡化經濟月結（不需按石高折算差額俸祿）。
- **D-6　出奔後成浪人而非投敵**：直接投敵會讓出奔懲罰過重且方向不可控；
  成浪人留給各方（含原主家）登用機會，被引拔才定向轉移，兩者職責清楚分離。
- **D-7　死亡排程於開局一次性決定**：逐月擲卒亡骰會使 rng 消耗序依局面分岐，
  且 ±2 年規格更適合排程式實作；一次性排程對 golden test（17）最友善。
  排程結果不進存檔外洩 UI（玩家不可預知卒年）。
- **D-8　Proposal 僅玩家勢力生成物件**：AI 勢力的「家臣提案」本質上就是 09 的決策管線，
  生成 Proposal 物件再自我採納只是繞路；只有需要 UI 裁決的玩家勢力需要資料實體。
- **D-9　引拔受理公式放在本文件**：忠誠是受理判定的核心輸入，將 acceptanceFactor
  與資格條件集中於忠誠章節，08 只保留發動端（費用/執行者/`plotBaseSuccess`），避免雙處定義。
- **D-10　浪人登用冷卻為單值欄位**：浪人同一時刻只寄寓一座城、僅該城所屬勢力可嘗試，
  故 `recruitRetryOn` 不需按勢力建 map；浪人被制壓/易主轉移所在城時冷卻沿用。
- **D-11　對 07 的戰法類別介面需求**（valor/intrigue/charge/ranged）記載於 §2 表：
  特性 5/9/10 依賴此標籤；若 07 實作時調整類別集合，僅需同步 §3.3 表之掛鉤描述，公式結構不變。

---

*本文件依 `00-foundations.md` §13 撰寫；BAL 定案值以 `plan/15-balance.md` 為準。*
