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
- 特性（Trait）37 個之完整定義（id、繁中名、掛鉤點、公式、稀有度；含 7 個戰法解鎖特性，勘誤 E-06）。
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

- 每名武將持有 0..`BAL.maxTraitsPerOfficer`（定案 **4**，值依 15／E-05）個特性，由劇本資料指定
  （浪人程序生成池的特性抽取規則見 `14`）。v1.0 不提供特性後天習得（§8 D-3）。
- 特性效果為**被動、無條件常駐**，於掛鉤點以乘數（`mult`：最終值 ×(1+value) 或 ×(1−value)）
  或加值（`add`：直接加到機率/點數）介入。同類 hook 多來源時：`mult` 相乘、`add` 相加。
- 「部隊主將」指 `Army` 的主將（參見 07）；「所率部隊」含任部隊副將時同樣生效的效果會特別註明，
  否則一律**僅主將生效**。
- 機率類 `add` 效果套用後仍受該機制原本的上下限（如成功率封頂 0.95）約束。

#### 特性完整表（37 個；傳說 4／稀有 11／普通 22。#31~#37 為戰法解鎖特性，勘誤 E-06）

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
| 31 | `trait.benzetsu` | 辯舌 | 普通 | 戰法解鎖（07） | 解鎖戰法「挑撥」（`tac.taunt`）；無被動數值效果（`effects: []`） |
| 32 | `trait.gunryaku` | 軍略 | 普通 | 戰法解鎖（07） | 解鎖戰法「攪亂」（`tac.disrupt`）；無被動數值效果（`effects: []`） |
| 33 | `trait.fudou` | 不動 | 普通 | 戰法解鎖（07） | 解鎖戰法「堅守」（`tac.hold`）；無被動數值效果（`effects: []`） |
| 34 | `trait.hizeme` | 火攻 | 普通 | 戰法解鎖（07） | 解鎖戰法「火矢」（`tac.fire-arrow`）；無被動數值效果（`effects: []`） |
| 35 | `trait.kesshi` | 決死 | 普通 | 戰法解鎖（07） | 解鎖戰法「背水」（`tac.last-stand`）；無被動數值效果（`effects: []`） |
| 36 | `trait.roukou` | 老巧 | 普通 | 戰法解鎖（07） | 解鎖戰法「牽制」（`tac.pin`）；無被動數值效果（`effects: []`） |
| 37 | `trait.iryou` | 醫療 | 普通 | 戰法解鎖（07） | 解鎖戰法「治療」（`tac.heal`）；無被動數值效果（`effects: []`） |

稀有度僅用於：(a) 劇本資料配布密度指引（傳說全劇本 ≤ 12 人持有、稀有每大勢力 ≤ 5 人、普通不限；
細則見 14）；(b) UI 顯示徽章顏色（見 §6）。稀有度不進任何公式。

### 3.4 身分六階與特權

身分（`Rank`）六階＋當主特殊身分。升格需同時滿足：功績達門檻、且由玩家（或 09 之 AI）
下達 `CmdPromoteRank`（身分推舉是褒賞的一種，不自動升格；理由見 §8 D-4）。

#### 3.4.1 升格功績門檻（累積值，不因升格歸零）

| 階 | rankIndex | `Rank` 值 | 繁中名 | 升至此階所需功績 `BAL.rankMeritThresholds[i]` |
|---|---|---|---|---|
| 1 | 0 | `kumigashira` | 足輕組頭 | 0（起始階） |
| 2 | 1 | `ashigaru-taisho` | 足輕大將 | 300 |
| 3 | 2 | `samurai-taisho` | 侍大將 | 800 |
| 4 | 3 | `busho` | 部將 | 1600 |
| 5 | 4 | `karo` | 家老 | 3000 |
| 6 | 5 | `shukuro` | 宿老 | 5000 |

`BAL.rankMeritThresholds = [0, 300, 800, 1600, 3000, 5000]`。升格一次只升一階（不可跳階）。

#### 3.4.2 身分特權表

| 身分 | 可任城主 | 可任軍團長 | 知行郡數上限 `BAL.fiefMaxByRank[i]` | 帶兵上限 `BAL.rankTroopCap[i]`（人，絕對值） | 月俸祿（貫）`BAL.rankSalary[i]` |
|---|---|---|---|---|---|
| 足輕組頭 | 否 | 否 | 0 | 500 | 3 |
| 足輕大將 | 否 | 否 | 1 | 1,000 | 6 |
| 侍大將 | 可 | 否 | 1 | 2,000 | 10 |
| 部將 | 可 | 否 | 2 | 3,000 | 15 |
| 家老 | 可 | 可 | 3 | 5,000 | 22 |
| 宿老 | 可 | 可 | 4 | 8,000 | 30 |

- `BAL.fiefMaxByRank = [0, 1, 1, 2, 3, 4]`、`BAL.rankSalary = [3, 6, 10, 15, 22, 30]`。
- 帶兵上限＝`BAL.rankTroopCap[rankIndex]`（07 §3.1 定義之絕對值上限，六階 500/1000/2000/3000/5000/8000）；
  原乘數制 `rankTroopBonus` 已廢除（帶兵成長已內含於絕對值表，勘誤 E-37）。
- **俸祿**：每月 1 日經濟月結（參見 05）時，勢力對每名**無知行**的在籍武將支付
  `BAL.rankSalary[rankIndex]` 貫；**持有知行者（以 `District.stewardId` 反查受封郡數 > 0）不支俸祿**
  （知行收益即其待遇，收益歸屬見 05；取捨見 §8 D-5）。
- 金錢不足以支付全額俸祿時：支付至金錢歸零，該月**全體支薪對象**忠誠即時
  −`BAL.unpaidSalaryLoyaltyPenalty`=2（欠俸）。
- 升格即時效果：忠誠 +`BAL.loyaltyPromote`=8（§3.6）。

#### 3.4.3 當主（特殊身分）

- 當主由 `Clan.leaderId` 指定，不佔六階（`rank` 欄位保留其原值但不生效）。
- 特權：視同宿老（可任軍團長、帶兵上限 8,000＝`BAL.rankTroopCap` 宿老值、知行郡數上限 4）；不支俸祿。
- 忠誠恆為 100，不參與忠誠月結；不可成為出奔、引拔、流言之對象。
- 當主之政務與勢力威信進入全家臣忠誠公式（§3.6，「當主魅力代理」）。

### 3.5 功績來源

功績 `merit` 為累積值（不消耗）。來源與常數（同列為該事件給予的能力經驗維度，見 §3.2）：

| 來源 | 常數（建議初值） | 給予對象 | 能力經驗維度 |
|---|---|---|---|
| 具申被採納 | `BAL.meritProposalAdopted` = 30 | 提案人 | 依具申種類：develop/facility/policy/recruit→`pol`；march→`ldr`；diplomacy→`pol`；plot→`int` |
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
  + (hasFief(o) ? BAL.loyaltyFiefBonus : 0)   // 10；hasFief＝以 District.stewardId 反查受封郡數 > 0（E-57）
  + kinshipBonus(o)                                   // 一門 kin=BAL.loyaltyKinBonus(30)、
                                                      // 譜代 fudai=BAL.loyaltyFudaiBonus(10)、外樣 tozama=0
  + floor(leader.pol / BAL.loyaltyLeaderPolDivisor)   // 20 → 當主政務代理，最高 +6
  + floor(clan.prestige / BAL.loyaltyPrestigeDivisor) // 400 → 威信代理，最高 +5
  + traitLoyaltyAdj(o)                                // chushin +20、yashin −10、
                                                      // 同城 jinbo +3 / hitotarashi +5（光環，可疊加）
  - (isPromotionStalled(o) ? BAL.loyaltyStalledPromotion : 0)   // 5，見下
, 0, 100)

treatment(o) = clamp((rankIndex(o) − expectedRankIndex(o)) × BAL.loyaltyRankGapWeight,
                      −BAL.loyaltyTreatmentClampAbs, +BAL.loyaltyTreatmentClampAbs)
  // BAL.loyaltyRankGapWeight = 6、BAL.loyaltyTreatmentClampAbs = 18

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

- 條件：`status === 'serving'`、非當主、`kinship !== 'kin'`、無 `trait.chushin`、
  `loyalty < BAL.defectionThreshold`（建議 **30**）。
- 機率：`p = (BAL.defectionThreshold − loyalty) × BAL.defectionChancePerPoint`（建議 **0.01**）
  → 忠誠 0 時每月 30%。
- 出奔結果：解除所有役職（城主/領主/軍團長，職缺處理見 05/07）、知行歸還直轄、
  `status = 'ronin'`、`clanId = null`、留在原 `locationCastleId` 成為浪人（可被任何勢力登用，含原主家）、
  發事件 `officer.defected{officerId, fromClanId, toClanId: null}`（出奔＝流浪，`toClanId=null`；報告由 13 §3.7 導出，13 §6.11 `report.officer.defect`；02 §4.19）。
- 出陣中（隸屬於行動中 `Army`）的武將**不判定出奔**，回城後恢復判定。

#### 3.6.5 被引拔受理（受理端規則）

他家對我方武將發動引拔（發動端流程、費用、執行者修正見 08）。本文件定義受理端：

- 受理端硬性條件（本文件）：非當主、非一門（`kinship !== 'kin'`）、無 `trait.chushin`。
  發動端「可下達」門檻（`loyalty < BAL.plotPoachLoyaltyThreshold`＝**75**）由 08 定義；本文件的
  `BAL.poachEligibleLoyalty`（**40**）僅作為受理成功率 `acceptanceFactor` 的分母（見下；發動與受理兩端併存，勘誤 E-33）。
- 最終成功率 = 08 計算之 `plotBaseSuccess` × `acceptanceFactor`，其中：

```
acceptanceFactor = clamp((BAL.poachEligibleLoyalty − loyalty) / BAL.poachEligibleLoyalty, 0, 1)
```

- 成功：武將即刻改屬發動勢力（`clanId` 變更、役職與知行同出奔處理）、初始忠誠
  設為 `BAL.poachedInitialLoyalty`（建議 **45**）、移動至發動勢力最近之城（08 指定）。
  引拔為 08 調略之效果，成功事件由 08 發出 `plot.succeeded{kind:'poach', …}`（08 §5.5.2；另 emit `officer.recruited{source:'poach'}`）；受理端（本文件）僅定義成功率與移籍效果、不另發事件，被引拔方視角報告由 13 §3.7 依該事件導出（13 §6.11 `report.officer.poached`）。

### 3.7 登用

#### 3.7.1 浪人登用

- 指令：`CmdRecruitRonin`。前提：目標 `status === 'ronin'` 且其 `locationCastleId`
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

- 成功：目標加入我方，`status='serving'`；初始身分 = `min(expectedRankIndex(target), 3)` 對應階
  （最高部將；對象忠誠傾向即 `expectedRankIndex` 與待遇之關係，透過 §3.6 目標值自然呈現）；
  支付支度金 `abilityScore × BAL.recruitSigningBonusPerAbility`（建議 **2**）貫；
  初始忠誠 = 依 §3.6.1 計算之目標值。
- 失敗：該浪人對**本勢力**進入冷卻，`recruitRetryOn = 今日 + BAL.recruitRetryCooldownDays`（建議 **90** 日）；發事件 `officer.recruitFailed{officerId, executorId, clanId}`（`officerId`＝婉拒之浪人、`executorId`＝登用者、`clanId`＝登用勢力；報告由 13 §3.7 導出，13 §6.11 `report.officer.recruitFailed`；02 §4.19；七輪裁決 2）。
- 浪人不支俸祿、不老化消失（壽命排程照常適用）。

#### 3.7.2 捕虜處置

捕虜的產生條件與機率公式見 07 §3.14（時機 2 合戰敗北：敗方潰走／遭殲滅部隊之大將先擲戰死、未死者再擲捕獲；時機 3 落城：城內守將逃脫／被俘／戰死三分；勝方由此捕獲敵將，公式歸 07，七輪裁決 3）。捕虜 `status='captive'`、
`capturedByClanId` 為捕獲方、關押於捕獲方指定城（07 給定）。捕虜期間 `clanId` 維持**原屬勢力不變**
（供本節 (b) 釋放與關押城陷落歸還之目的地判定，即使原勢力已滅亡；02 INV-08，2026-07-11 驗證修復），
捕獲方僅記於 `capturedByClanId`。處置指令 `CmdHandleCaptive`，
`action`（`CaptiveAction`，02 §3.3）三種：

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

**(c) 處斬**：`status='dead'`（直接設定，**不呼叫** §5.5 `die()`）；威信 −`BAL.executePrestigeLoss`（建議 **10**）；
我方全體非一門家臣忠誠 −`BAL.executeLoyaltyPenalty`=2；對象勢力感情大幅惡化（數值見 08）；
發事件 `officer.executed(officerId, byClanId)`，**不**另發 `officer.died`（`officer.died.cause` 收斂為
`'age'|'battle'`、不含處刑，五輪裁決 C／02 §4.19 表後註）。敵方**當主**被俘時的處置與勢力吸收另見 10。

#### 3.7.3 他家引拔的受理

見 §3.6.5（受理端規則集中於忠誠章節，08 只需呼叫 `resolvePoachAcceptance()`）。

### 3.8 褒賞

三種褒賞皆為 Command，任意時刻可下達（月初褒賞介面只是彙整入口，見 §6）：

#### 3.8.1 金錢賞賜（`CmdRewardOfficer`）

| 檔位 | 費用（貫） | 忠誠基礎增益 |
|---|---|---|
| 小（`small`） | `BAL.rewardGoldSmallCost` = 50 | +`BAL.rewardGoldSmallLoyalty` = 4 |
| 中（`medium`） | `BAL.rewardGoldMediumCost` = 100 | +`BAL.rewardGoldMediumLoyalty` = 6 |
| 大（`large`） | `BAL.rewardGoldLargeCost` = 200 | +`BAL.rewardGoldLargeLoyalty` = 9 |

**遞減**：對同一武將，年內（每年 1 月 1 日重置 `rewardGiftsThisYear`）第 n 次賞賜的實得
增益 = `floor(基礎增益 / 2^(n−1))`，最低 +1。例：大賞賜連發 → +9、+4、+2、+1、+1…。

#### 3.8.2 加封知行

分封指令與流程屬 05（參見 05 知行章節）；本文件定義：新增一郡知行時忠誠
+`BAL.loyaltyGrantFief`=8；知行郡數不得超過 `BAL.fiefMaxByRank[rankIndex]`（05 的指令驗證器須引用本表）。

#### 3.8.3 身分推舉（`CmdPromoteRank`）

- 驗證：目標 `merit ≥ BAL.rankMeritThresholds[rankIndex + 1]` 且未達宿老。
- 效果：`rankIndex + 1`、忠誠 +8、`stalledPromotionMonths` 歸零、發事件 `officer.promoted{officerId, clanId, newRank}`（報告由 13 §3.7 導出，13 §6.11 `report.officer.promoted`；02 §4.19）。
- 無金錢費用（俸祿上升即長期成本）。

### 3.9 壽命與死亡、家督繼承

#### 3.9.1 死亡排程（開局一次性，決定論）

劇本初始化時，對**每名**武將（含未登場者）以 `rng.event` 排定 `scheduledDeath`：

```
if (14 資料含史實卒年 deathYear):
    o.deathYear = 資料值                          # 卒年基準（02 §4.4 deathYear）
    year  = o.deathYear + uniformInt(rng.event, −2, +2)
else:
    deathAge = BAL.defaultDeathAge + uniformInt(rng.event, −BAL.defaultDeathAgeSpread, +BAL.defaultDeathAgeSpread)
               // 60 ± 8
    o.deathYear = o.birthYear + deathAge          # 生成卒年寫回 deathYear（02 §4.4）
    year  = o.deathYear
month = uniformInt(rng.event, 1, 12)             # 卒月一律生成（14 不提供卒月；historicalDeathMonth 已廢除，四輪裁決追記）
year = max(year, scenarioStartYear + 1)        // 不得排在開局年（避免開場即死）
o.scheduledDeath = { year, month }
```

戰死（07 之合戰/攻城戰死判定）與史實事件死亡（10，如本能寺）**優先於**排程，
發生即死，排程作廢。

#### 3.9.2 死亡結算（每月 1 日檢查）

`status ∈ {serving, ronin, captive}`（且 `hasComeOfAge`）且 `scheduledDeath` 等於當前年月者，自然死亡：

1. `status = 'dead'`；發事件 `officer.died(officerId, clanId, cause='age', nodeId=null)`（對應報告
   `report.officer.death`；02 §4.19、五輪裁決 C）。
2. 解除役職：城主缺由該城所屬勢力中**身分 ≥ 侍大將（`samurai-taisho`）**且身分最高者（同分取 abilityScore 高者）自動遞補，
   無合格者則懸缺（委任城由 09 補派；遞補下限依 02 INV-04，勘誤 E-54）；知行郡歸還直轄；軍團長缺之處理參見 07。
3. 若為當主 → 家督繼承（§3.9.3）。

#### 3.9.3 家督繼承

```
heir = 該勢力 status='serving' 且 kinship='kin' 的武將中，
       依 (rankIndex desc, abilityScore desc, 年齡 desc) 排序取第一人
if heir 存在:
    deceased = clan.leaderId；clan.leaderId = heir.id；發事件 clan.succession{clanId, deceasedId: deceased（歿去之當主）, heirId: heir.id}（clanIds=[clanId]；報告由 13 §3.7 導出，13 §6.11 report.clan.succession；02 §4.19；七輪裁決 2）
    全家臣即時忠誠：外樣 −10、譜代 −5、一門 0（§3.6.3）
else:
    勢力滅亡 → 處理流程參見 plan/10-events-and-victory.md
    （所屬武將全數成浪人、領土歸屬等由 10 定義）
```

玩家勢力當主死亡且有繼承人 → 遊戲繼續（玩家改扮演新當主）；無繼承人 → 敗北結局（10）。

攻城落城時，若勢力仍有領地而當主被俘，俘虜保留 `status='captive'`。同城全部守方武將須先各自完成
逃脫／戰死／被俘結算，之後才針對結算後仍 `serving` 的名冊執行一次改立當主：

1. 先依上述通常規則，從已元服且仍在籍的一門武將選擇繼承人。
2. 若無一門，為避免存活勢力指向非 `serving` 當主（INV-08），改由全體已元服且仍在籍武將依同一
   `(rankIndex desc, abilityScore desc, 年齡 desc, OfficerId asc)` 順序取第一人，作為緊急繼承人。
3. 新當主忠誠設為 100；其餘在籍家臣立即承受通常相續衝擊（外樣 −10、譜代 −5、一門 0）。不新增 RNG 消耗。
4. 沿用 canonical `clan.succession{clanId, deceasedId, heirId}`；`deceasedId` 為既有欄名，此情形指被俘前任。
   報告渲染須檢查該前任目前 `status`，使用「遭俘」而非「逝去」。
5. 若連已元服在籍武將皆無，勢力立即標記滅亡；玩家勢力另設 `defeat.no-heir`。M4 落城結算須原子地將
   該勢力所有殘存城與所轄郡轉予攻城方，轉入城一律清除城主／代官／制壓／軍團參照並改為直轄支城
   （攻城方本城除外），同時清除滅亡勢力所有軍團與部隊；只發一次 `clan.destroyed`。此為 M4 的最小
   invariant-safe 吸收規則，不提前實作 M8 的外交、俘虜處置或演出。

### 3.10 元服

- 武將資料含 `debutYear`／`debutClanId`／`debutCastleId`（02 §4.4 已收，五輪裁決 E）；14 劇本資料為可選欄位，
  未給值時 builder 依序推導：`debutYear = birthYear + BAL.comingOfAgeAge`（建議 **15**）、`debutClanId = clanId`、
  `debutCastleId = locationCastleId`。
- 每年 1 月 1 日（officers 步驟之年 hook）：`hasComeOfAge === false` 且 `debutYear ≤ 當前年` 者登場：
  - `hasComeOfAge = true`、`status = 'serving'`；加入 `debutClanId` 指定勢力（該勢力已滅亡則於 `debutCastleId`
    就地成浪人）；初始身分足輕組頭、`merit = 0`、忠誠依 §3.6.1 計算。
  - 發事件 `officer.comingOfAge{officerId, clanId}`（僅我方與鄰接勢力顯示，過濾規則見 03 報告系統；報告由 13 §3.7 導出，13 §6.11 `report.officer.comingOfAge`；02 §4.19）。

### 3.11 具申機制

#### 3.11.1 流程總覽

1. **生成**（每月 1 日，tick 步驟 10；生成邏輯＝挑誰提什麼，見 09）：09 對玩家勢力產出
   0..`BAL.proposalMaxPerMonth`（建議 **5**）件 `Proposal`，同一武將同月至多
   `BAL.proposalMaxPerOfficerPerMonth`（建議 **1**）件。AI 勢力不生成 Proposal 物件
   （AI 決策直接走 09 內部管線）。
2. **送達**：進入 `GameState.proposals`（`status='pending'`），觸發自動暫停（00 §5.2）與 UI 具申箱。
3. **裁決**：玩家於期限前下達 `CmdResolveProposal`（`accept: true` 採納／`accept: false` 駁回）。
4. **結算**（本文件權責）：
   - **採納**：以提案內含之 `command` 重新驗證（該 Command 的驗證器，見 03/各系統）。
     驗證通過 → 將 `command` 推入佇列立即執行、提案人 `merit + proposal.meritReward`
     （含 §3.5 之能力經驗）、忠誠 +2、`status='accepted'`。
     驗證失敗（局勢已變，如標的城已易主）→ `status='expired'`，發事件
     `proposal.expired{proposalId, officerId, reason:'invalidated'}`（報告由 13 §3.7 依 `reason` 分流導出 `report.proposal.invalid`；02 §4.19；七輪裁決 2），**無**忠誠懲罰。執行成本＝該 Command 本身的成本
     （`estimatedCostGold` 僅供顯示；金錢不足即驗證失敗）。
   - **駁回**：`status='rejected'`、提案人忠誠 −2。
   - **逾期**（`expiresDay = createdDay + BAL.proposalExpireDays`＝60 日；逾期日仍 `pending` 者）：
     `status='expired'`、提案人忠誠 −1，發事件 `proposal.expired{proposalId, officerId, reason:'timeout'}`（報告由 13 §3.7 依 `reason` 分流導出 `report.proposal.expired`；02 §4.19；七輪裁決 2）。
5. 已終結（非 pending）之提案保留至次月月初後從 `GameState.proposals` 清除（報告留存）。

#### 3.11.2 具申種類與對應 Command

| `ProposalKind` | 繁中名 | 內含 Command（定義文件） |
|---|---|---|
| `develop` | 開發 | 郡開發指令（05） |
| `facility` | 建設 | 城下施設建設指令（05） |
| `march` | 出陣 | 編成出陣指令（07） |
| `diplomacy` | 外交 | 外交工作指令（08） |
| `plot` | 調略 | 調略指令（08） |
| `recruit` | 登用 | `CmdRecruitRonin`（本文件） |
| `policy` | 政策 | 政策施行指令（05） |

> `ProposalKind` 全集依 02 §3.3（11 值：`develop`／`facility`／`conscript`／`transport`／`march`／
> `recall`／`diplomacy`／`plot`／`policy`／`recruit`／`reward`）；上表為本系統具申生成常用之子集（勘誤 E-48）。

---

## 4. 資料結構

以下型別為本系統之權威定義（由 02 收錄；`ClanId`/`CastleId`/`ArmyId`/`DistrictId`/`ProposalId`/
`Command`/`CommandBase`/`CaptiveAction`/`RewardTier`/`StatBlock` 等基礎型別見 02/03；
`captiveRetryOn`/`recruitRetryOn` 為絕對日 `number`、非 `GameDate`，依 02 §4.4 慣例，2026-07-11 驗證修復）：

```ts
/** 武將 ID，形如 'off.oda-nobunaga'（00 §8） */
type OfficerId = string;
/** 特性 ID，形如 'trait.gunshin' */
type TraitId = string;

/** 身分六階（rankIndex 0..5 依此順序） */
type Rank =
  | 'kumigashira'     // 足輕組頭
  | 'ashigaru-taisho' // 足輕大將
  | 'samurai-taisho'  // 侍大將
  | 'busho'           // 部將
  | 'karo'            // 家老
  | 'shukuro';        // 宿老

/** 家臣出身標記：一門／譜代／外樣（劇本資料指定；登用浪人一律 tozama，捕虜登用沿用原標記但視為 tozama） */
type Kinship = 'kin' | 'fudai' | 'tozama';

/** 武將生存狀態（依 02 §3.3；未元服以 hasComeOfAge=false 表示，不設獨立狀態，見 02 DDR-5／勘誤 E-02） */
type OfficerStatus =
  | 'serving'  // 在籍（仕官中）
  | 'ronin'    // 浪人（clanId = null）
  | 'captive'  // 捕虜
  | 'dead';    // 死亡（保留於陣列供查詢，不再參與任何系統）

/** 四維數值組（統率/武勇/知略/政務），單位：點（對齊 02 §4.4 `StatBlock`，2026-07-11 驗證修復） */
interface StatBlock {
  ldr: number; // 統率 1..120
  val: number; // 武勇 1..120
  int: number; // 知略 1..120
  pol: number; // 政務 1..120
}

interface Officer {
  id: OfficerId;
  name: string;                       // 繁中顯示名，如「木下藤吉郎」（專有名詞不進 i18n）
  clanId: ClanId | null;              // 所屬勢力：serving＝現屬（該勢力 alive）；captive＝**原屬勢力**
                                      //   （供 §3.7.2 釋放/歸還目的地判定，可能已滅亡；捕獲方另存於
                                      //   `capturedByClanId`）；ronin/dead＝null（對齊 02 INV-08，
                                      //   2026-07-11 驗證修復）
  status: OfficerStatus;              // serving/ronin/captive/dead（無 unborn，見 §3.10 與 02 DDR-5）
  hasComeOfAge: boolean;              // 已元服；false＝未登場（取代舊 'unborn' 狀態，依 02 DDR-5／E-02）
  birthYear: number;                  // 西曆生年
  debutYear: number;                  // 元服登場年（02 §4.4 已收；14 資料缺值時 builder 推導 = birthYear + BAL.comingOfAgeAge，五輪裁決 E）
  debutClanId: ClanId | null;         // 元服時加入的勢力（null＝直接為浪人；02 §4.4 已收；14 資料缺值時 builder 推導 = clanId，五輪裁決 E）
  debutCastleId: CastleId;            // 元服/淪為浪人時的所在城（02 §4.4 已收；14 資料缺值時 builder 推導 = locationCastleId，五輪裁決 E）
  deathYear: number;                  // 卒年基準（史實或開局生成，02 §4.4；14 資料缺卒年時由 §3.9.1 生成寫入）
  scheduledDeath: { year: number; month: number }; // 開局以 rng.event 排定（§3.9.1；卒月一律生成，historicalDeathMonth 已廢除）
  ldr: number;                         // 統率基礎值，1..120；有效值＝min(120, ldr + statGrowth.ldr)
  val: number;                         // 武勇基礎值，1..120
  int: number;                         // 知略基礎值，1..120
  pol: number;                         // 政務基礎值，1..120
  statExp: StatBlock;                  // 各維累積經驗（點；每 BAL.statExpPerPoint → 成長 +1）
  statGrowth: StatBlock;               // 各維已獲成長（0..BAL.statGrowthCap）
  traits: TraitId[];                  // 特性，長度 ≤ BAL.maxTraitsPerOfficer
  rank: Rank;                         // 身分
  merit: number;                      // 功績累積值（點，≥0）
  loyalty: number;                    // 忠誠 0..100（當主恆 100）
  kinship: Kinship;                   // 一門/譜代/外樣
  locationCastleId: CastleId | null;  // 所在城：serving 未出陣=駐在城；ronin=寄寓城；captive=關押城；
                                      //   出陣中/死亡=null（與 armyId 恰有一者非 null，02 INV-07；
                                      //   死亡時兩者皆 null，2026-07-11 驗證修復）
  armyId: ArmyId | null;              // 出陣中所屬部隊；未出陣為 null（07 於編成/解散時寫入，02 §4.4；
                                      //   2026-07-11 驗證修復新增）
  capturedByClanId: ClanId | null;    // 捕虜時的捕獲方（原屬勢力見 `clanId`）
  captiveRetryOn: number | null;      // 捕虜登用失敗後，下次可嘗試絕對日（對齊 02 §4.4：絕對日 number，
                                      //   非 GameDate，2026-07-11 驗證修復）
  recruitRetryOn: number | null;      // 浪人登用失敗後，本勢力下次可嘗試絕對日（單一勢力冷卻即可：
                                      //   浪人只存在於一座城，僅該城所屬勢力能嘗試；對齊 02 §4.4：
                                      //   絕對日 number，非 GameDate，2026-07-11 驗證修復）
  rewardGiftsThisYear: number;        // 年內已受金錢賞賜次數（每年 1/1 歸零）
  stalledPromotionMonths: number;     // 功績達下一階門檻但未升格的連續月數
}
// 知行（受封郡）以 District.stewardId 反查、軍團歸屬以其所在城 castle.corpsId 反查，不存於 Officer
//（避免雙重真相，依 02 §4.4／勘誤 E-57）。armyId 為出陣部隊之直接前向欄位（非反查），對齊 02 §4.4／INV-07。

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
// 全部 37 個 TraitDef（含 7 個戰法解鎖特性，勘誤 E-06）以常數表 TRAITS: Record<TraitId, TraitDef>
// 實作於 src/core/state/traits.ts；數值一律引用 BAL.trait*。戰法解鎖特性 effects 為空陣列，
// 其作用為 07 §3.8 合戰之戰法可用性閘門（非 traitModifier 數值 hook）。

/** 具申種類（全集依 02 §3.3，11 值；本系統生成常用者見 §3.11.2） */
type ProposalKind =
  | 'develop' | 'facility' | 'conscript' | 'transport'
  | 'march' | 'recall'
  | 'diplomacy' | 'plot'
  | 'policy' | 'recruit' | 'reward';

type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired';   // 依 02（勘誤 E-48）

interface Proposal {
  id: ProposalId;                // 'prop.<流水號>'（勢力內遞增，02 §3.2）
  clanId: ClanId;                // 收件勢力（v1.0 僅玩家勢力會有 Proposal 物件）
  officerId: OfficerId;          // 具申武將（提案人；欄位名依 02，勘誤 E-48）
  kind: ProposalKind;
  command: Command;              // 採納即入佇列的完整 Command（參數已由 09 填妥）
  createdDay: number;            // 生成絕對日（每月 1 日）
  expiresDay: number;            // 逾期絕對日 = createdDay + BAL.proposalExpireDays（60）
  meritReward: number;           // 採納時提案人獲得之功績（生成時算定 = BAL.meritProposalAdopted；02/09）
  status: ProposalStatus;
  estimatedCostGold: number;     // 預估執行成本（貫；僅 UI 顯示，實際扣款由 Command 執行；02 §4.15 已收，E-48）
  summaryKey: string;            // 具申內容一句話的 i18n key（09 生成時指定；02 §4.15 已收，E-48）
  summaryParams: Record<string, string | number>; // 插值參數（人名/地名等）
}

/* ------- Commands（本文件為語意權威；型別聯集併入 02 §4.18 之 Command；名稱/欄位對齊 02，勘誤 E-29/E-32） ------- */
// 皆 extends CommandBase（02 §4.18）：發令勢力一律由 CommandBase.clanId 承載，故各指令不再自宣告 clanId。

interface CmdRecruitRonin extends CommandBase {
  type: 'recruitRonin';
  officerId: OfficerId;    // 目標浪人（status='ronin'，locationCastleId 屬我方）
  executorId: OfficerId;   // 登用者（須與目標同城、未出陣）；成功率公式必要輸入（§3.7.1），02 §4.18 已收（2026-07-10 二輪裁決 A）
}

interface CmdHandleCaptive extends CommandBase {
  type: 'handleCaptive';
  officerId: OfficerId;                          // 目標捕虜（capturedByClanId === CommandBase.clanId）
  action: CaptiveAction;                         // 'recruit' | 'release' | 'execute'（02 §3.3）
  executorId: OfficerId | null;                  // 登用時的執行者；null＝以當主代入；02 §4.18 已收（2026-07-10 二輪裁決 A）
}

interface CmdRewardOfficer extends CommandBase {
  type: 'rewardOfficer';
  officerId: OfficerId;
  tier: RewardTier;        // 'small' | 'medium' | 'large'（02 §3.3）；費用與忠誠增益見 §3.8.1（年內遞減）
}

interface CmdPromoteRank extends CommandBase {
  type: 'promoteRank';
  officerId: OfficerId;
}

interface CmdResolveProposal extends CommandBase {   // 採納/駁回具申（02 §4.18 將 adopt/reject 合併為單一指令）
  type: 'resolveProposal';
  proposalId: ProposalId;
  accept: boolean;         // true＝採納、false＝駁回
}
```

`GameState` 掛載點（02 收錄）：`officers: Record<OfficerId, Officer>`、
`proposals: Record<ProposalId, Proposal>`（容器依 02，勘誤 E-48）。

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
    payees = clan 在籍武將 where status='serving' && 非當主 && 無受封知行（District.stewardId 反查郡數 === 0）
    total  = Σ BAL.rankSalary[rankIndex(o)]
    if clan.gold >= total: clan.gold -= total
    else:
      clan.gold = 0
      for o in payees: o.loyalty = max(0, o.loyalty − BAL.unpaidSalaryLoyaltyPenalty)
      // 欠俸事件 economy.upkeepUnpaid{clanId, payeeIds} 由 05 於 economy 月結時單一發出；payeeIds 固定為結算當下的實際支薪對象（05 §3.1.4／§5.2；報告由 13 §3.7 導出，13 §6.11 report.economy.upkeepUnpaid，02 §4.19）；本函式僅定義俸祿金額與欠俸忠誠懲罰、不重複發出
```

（扣帳時點併入 economy 月結順序，參見 05；本函式定義金額與欠俸效果。）

### 5.3 忠誠月結

```
recomputeLoyalty(state):
  for o in 全武將 where status='serving' && 非當主:
    target = loyaltyTarget(o)                       // §3.6.1
    delta  = clamp(target − o.loyalty, −BAL.loyaltyDriftPerMonth, +BAL.loyaltyDriftPerMonth)
    o.loyalty = clamp(o.loyalty + delta, 0, 100)
```

同城光環（`officer.loyaltyAuraAdd`）計算：掃描 `locationCastleId` 非 null 且與其相同的**其他**在籍我方
武將（出陣中武將 `locationCastleId=null`，不參與此比對，避免以 null 誤判同城，2026-07-11 驗證修復），
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
  for o in 全武將 where hasComeOfAge && status in {serving, ronin, captive}（依 OfficerId 字典序）:
    if o.scheduledDeath.year === time.year && o.scheduledDeath.month === time.month:
      die(o, cause='age', nodeId=null)

die(o, cause, nodeId):   // cause: 'age' | 'battle'；nodeId: MapNodeId | null（僅 cause='battle' 由 07
                          // 呼叫時帶入戰場節點、其餘 null；簽名對齊 02 §4.19 表後註③，五輪裁決 B/C）
  o.status = 'dead'
  o.locationCastleId = null；o.armyId = null（02 INV-07：死亡兩者皆 null；出陣中陣亡由 07 同步移除
                                            其部隊編制，2026-07-11 驗證修復）
  釋出役職與知行（§3.9.2；城主遞補：同城同勢力中 rank ≥ 'samurai-taisho' 者，rankIndex desc → abilityScore desc 取首；無合格者懸缺）
  if o 是某勢力當主: succession(clan)    // §3.9.3
  發事件 officer.died(officerId, clanId, cause, nodeId)：cause='age' 對應報告 report.officer.death、
  cause='battle' 對應報告 report.officer.killedInAction（由 07 呼叫 die，nodeId＝戰場節點；02 §4.19 表後註③）
```

### 5.6 元服

```
comingOfAge(state):
  for o in 全武將 where o.hasComeOfAge === false && o.debutYear <= time.year（依 OfficerId 字典序）:
    o.hasComeOfAge = true
    if o.scheduledDeath 早於 o.debutYear（史實早夭）: o.status='dead'; o.locationCastleId=null; o.armyId=null; continue（不發報告，§5.11；02 INV-07，2026-07-11 驗證修復）
    o.status = 'serving'
    if o.debutClanId 存在且該勢力存活: 加入之；o.locationCastleId = o.debutCastleId
    else: o.status='ronin'; o.clanId=null; o.locationCastleId = o.debutCastleId
    o.rank='kumigashira'; o.merit=0; o.loyalty = loyaltyTarget(o)
    發事件 officer.comingOfAge{officerId: o.id, clanId: o.clanId}（報告由 13 §3.7 導出，13 §6.11 report.officer.comingOfAge；02 §4.19）
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
  // 功績達下一階門檻不發報告：改由 11 武將一覽／詳細卡 badge 直讀 state（o.merit ≥ rankMeritThresholds[nextRank]）呈現（UI-only、state 可衍生，13 §6.11 註記；七輪裁決 2）
```

### 5.8 具申結算

```
applyResolveProposal(cmd):   // CmdResolveProposal；依 cmd.accept 分流採納/駁回
  p = 找到 cmd.proposalId 且 status='pending'（否則指令無效，靜默丟棄並發 UI 錯誤字串）
  if cmd.accept:             // 採納
    if validateCommand(p.command) 通過:
      executeCommand(p.command)
      gainMerit(提案人, p.meritReward, expStatsByKind(p.kind))   // §3.5 表；meritReward 生成時算定
      提案人.loyalty = min(100, 提案人.loyalty + BAL.proposalAdoptLoyalty)
      p.status = 'accepted'
    else:
      p.status = 'expired'; 發事件 proposal.expired{proposalId: p.id, officerId: p.officerId, reason:'invalidated'}（報告由 13 §3.7 依 reason 分流導出 report.proposal.invalid；02 §4.19；七輪裁決 2）
  else:                      // 駁回
    p.status = 'rejected'; 提案人.loyalty −= BAL.proposalRejectLoyalty

proposalsSystem(state):    // tick 步驟 10
  if day === 1:
    對 expiresDay ≤ time.day 之 pending 提案：status='expired'、提案人忠誠 −BAL.proposalExpireLoyalty、發事件 proposal.expired{proposalId, officerId, reason:'timeout'}（報告由 13 §3.7 依 reason 分流導出 report.proposal.expired；02 §4.19；七輪裁決 2）
    清除已終結（非 pending）且逾一個月之提案
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

能力成長：`statExpPerPoint`=100、`statGrowthCap`=5、`maxTraitsPerOfficer`=4（值依 15，E-05）。
身分：`rankMeritThresholds`=[0,300,800,1600,3000,5000]、`fiefMaxByRank`=[0,1,1,2,3,4]、
`rankTroopCap`={500,1000,2000,3000,5000,8000}（絕對值，07；rankTroopBonus 廢除 E-37）、`rankSalary`=[3,6,10,15,22,30]、
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
- 未元服（`hasComeOfAge=false`）武將不出現在任何 UI 名單、不參與死亡以外的任何判定
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
| `term.rank.kumigashira` | 足輕組頭 |
| `term.rank.ashigaru-taisho` | 足輕大將 |
| `term.rank.samurai-taisho` | 侍大將 |
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

- [ ] **T1　型別與常數**：實作 §4 全部型別、`TRAITS` 表（37 筆）、§5.10 常數併入 `balance.ts`。
  驗收：`tsc --noEmit` 通過；`TRAITS` 單元測試檢查 37 筆、id 前綴 `trait.`、稀有度分布 4/11/22。
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
- **D-3　特性固定 4 個上限、無後天習得**：特性是資料層身分標籤而非成長系統；
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

### 勘誤消化記錄（依 `19-glossary.md` §3.13；00 §0 規則 5）

- **E-01（2026-07-07）**：`Rank` enum 值由 camelCase 改為 02 kebab-case
  （`kumigashira`／`ashigaru-taisho`／`samurai-taisho`／`busho`／`karo`／`shukuro`）；
  §3.4.1 表、§4 型別、§5.6 元服賦值、§6.2 `term.rank.*` key 同步。依 E-01（代碼識別符依 02 §3.3）。
- **E-02（2026-07-07）**：`OfficerStatus` 移除 `'unborn'`／`'active'`，改採 02 之 `serving/ronin/captive/dead`，
  並新增 `hasComeOfAge: boolean`（未元服＝`hasComeOfAge=false`）；§3.6.4／§3.7.1／§3.9／§3.10／
  §5.2／§5.3／§5.5／§5.6／§5.11 全數改判。依 E-02（02 DDR-5）。
- **E-03（2026-07-07）**：知行郡數上限常數 `rankFiefCap` 改名 `fiefMaxByRank`（值 `[0,1,1,2,3,4]`）；
  §3.4.2 表、§3.8.2、§5.10 同步。依 E-03（名依 02、值依 15 §5.2）。
- **E-05（2026-07-07）**：`maxTraitsPerOfficer` 由 3 改為 4（容納 E-06 追加特性）；§3.3、§5.10、§8 D-3 同步。
  依 E-05（值依 15 §5.2）。
- **E-06（2026-07-07）**：特性表由 30 擴充至 37，新增 7 個戰法解鎖特性
  （`trait.benzetsu`／`gunryaku`／`fudou`／`hizeme`／`kesshi`／`roukou`／`iryou`，名依 19 §3.5 附表），
  稀有度均普通、`effects` 空、作用為 07 §3.8 戰法閘門；§1.2、§3.3、§4 註解、§7 T1 同步。依 E-06。
- **E-29／E-32（2026-07-10）**：§4 指令介面對齊 02 §4.18 canonical——`RewardGoldCommand`→`CmdRewardOfficer`
  （`type:'rewardGold'`→`'rewardOfficer'`、`targetId`→`officerId`、`tier` 型別改引 02 `RewardTier`；
  02 已裁決採 06 三檔制，故僅名稱／欄位對齊，機制與費用/忠誠增益仍歸 §3.8.1，E-29）；
  `PromoteRankCommand`→`CmdPromoteRank`、`RecruitRoninCommand`→`CmdRecruitRonin`、
  `HandleCaptiveCommand`→`CmdHandleCaptive`（`disposition`→`action: CaptiveAction`，02 §3.3）；
  各指令改 `extends CommandBase`、移除自宣告之 `clanId`（發令勢力由 `CommandBase.clanId` 承載）、
  `targetId`→`officerId`；`AdoptProposalCommand`／`RejectProposalCommand` 合併為 02 之
  `CmdResolveProposal { type:'resolveProposal'; proposalId: ProposalId; accept }`
  （§5.8 結算函式併為 `applyResolveProposal` 依 `accept` 分流，並修正採納忠誠賦值為
  `min(100, loyalty + BAL.proposalAdoptLoyalty)` 以合 §3.6.3）；型別聯集歸屬更新為 02 §4.18；
  §3.4／§3.7／§3.8／§3.11／§4／§5.8 全數同步。理由：02 為樞紐，指令名稱與欄位以 02 為準收斂。
  另註：`CmdRecruitRonin.executorId` 與 `CmdHandleCaptive.executorId` 屬 06 機制必要欄位
  （登用者代入 §3.7 成功率公式），02 §4.18 對應型別目前僅 `officerId`，已回報 02 待補收（本次不逕改 02）。依 E-29／E-32。
  ——後記（2026-07-10 同日）：02 已於「二輪裁決 A」收錄 `executorId`（`CmdHandleCaptive` 為 `OfficerId | null`），
  並統一命名慣例「`officerId`＝被作用武將／`executorId`＝執行武將」；本檔 §4 註記同步收斂為「已收」。
- **E-33（2026-07-07）**：引拔發動端「可下達」門檻改由 08 定義（`plotPoachLoyaltyThreshold`＝75），
  06 保留 `poachEligibleLoyalty`＝40 僅作 `acceptanceFactor` 分母；初始忠誠 `poachedInitialLoyalty`＝45；
  §3.6.5 同步。依 E-33（發動與受理兩端併存，值依 15 §5.2）。
- **E-37（2026-07-07）**：帶兵上限改採 07 絕對值表 `rankTroopCap`（500..8000），廢除乘數制 `rankTroopBonus`；
  §3.4.2 表、§3.4.3 當主特權、§5.10 同步。依 E-37（依 07 絕對值表）。
- **E-48（2026-07-07）**：`Proposal` 欄位／status／容器對齊 02——`proposerId→officerId`、
  `createdOn/expiresOn→createdDay/expiresDay`（number）、新增 `meritReward`、
  `ProposalStatus 'adopted'→'accepted'`、`ProposalKind 'development'→'develop'`（全集 11 值依 02）、
  逾期改 `BAL.proposalExpireDays`＝60 日、容器改 `Record<ProposalId, Proposal>`；
  `estimatedCostGold/summaryKey`（02 待補收）保留；§3.5／§3.11／§4／§5.8 同步。依 E-48。
- **E-54（2026-07-07）**：城主死亡遞補限身分 ≥ 侍大將（`samurai-taisho`），無合格者懸缺；
  §3.9.2、§5.5 同步。依 E-54（合 02 INV-04）。
- **E-57（2026-07-07）**：`Officer` 刪除 `fiefDistrictIds`／`corpsId` 兩欄，受封郡改以 `District.stewardId` 反查、
  軍團歸屬改以其所在城 `castle.corpsId` 反查；§3.4.2、§3.6.1、§4、§5.2 同步。依 E-57（避免雙重真相）。
- **E-58（2026-07-07）**：捕獲方欄位 `captorClanId` 統一為 02 之 `capturedByClanId`；§3.7.2、§4 已同步。依 E-58。
- **2026-07-11（驗證修復，依 02 §4.4 四輪裁決 A）**：Officer 型別雙重權威收斂——(a) `baseStats: OfficerStats`
  攤平為 `ldr`/`val`/`int`/`pol` 四個直接欄位，`statExp`/`statGrowth` 改型別 `StatBlock`（`OfficerStats`
  介面更名為 `StatBlock`，對齊 02 §4.4）；(b) `locationCastleId` 改 `CastleId | null`、新增
  `armyId: ArmyId | null`（與 `locationCastleId` 恰有一者非 null，死亡時兩者皆 null，對齊 02 INV-07），
  §5.5 `die()`、§5.6 `comingOfAge()` 早夭分支、§5.3 同城光環掃描同步改判；(c) `captiveRetryOn`／
  `recruitRetryOn` 型別由 `GameDate` 改絕對日 `number`（對齊 02 §4.4 慣例）；(d) 明訂捕虜期間 `clanId`
  維持**原屬勢力**不變（供 §3.7.2 釋放/歸還判定，捕獲方僅記於 `capturedByClanId`），對齊 02 INV-08 新裁決
  （四輪裁決 A-c）。`scheduledDeath`／`rewardGiftsThisYear`／`stalledPromotionMonths` 三欄位已由 02 §4.4
  收錄且形狀一致，本次未更動。§4 型別區、§3.7.2 敘述同步；grep 自查已排除殘留 `baseStats`／
  `OfficerStats`／與 02 相左之位置模型敘述。
  ——追記（同日收尾，依 02 四輪裁決 A 追記）：`historicalDeathYear` 更名 `deathYear`（02 §4.4 同名；
  14 資料缺卒年時由 §3.9.1 生成寫回）；`historicalDeathMonth` 廢除（14 不提供卒月、該欄恆 null 屬死規格，
  `scheduledDeath.month` 一律由 rng.event 生成）；§3.9.1 偽碼與 §4 型別同步。
- **2026-07-11（五輪裁決 C／E，依 02 §4.4／§4.19 表後註）**：(1) debut 三欄位（`debutYear`／`debutClanId`／
  `debutCastleId`）明訂「02 §4.4 已收；14 資料缺值時 builder 推導」（`debutYear = birthYear +
  BAL.comingOfAgeAge`、`debutClanId = clanId`、`debutCastleId = locationCastleId`）；§3.10、§4 型別區同步
  （五輪裁決 E）。(2) `officer.died.cause` 收斂 `'age'|'battle'`（`'natural'`→`'age'`）：§5.5 `checkDeaths()`／
  `die()` 呼叫改 `cause='age'`，`die()` 簽名新增 `nodeId: MapNodeId | null` 參數（`cause='battle'` 時由 07
  呼叫並帶入戰場節點，其餘為 `null`），發出事件 `officer.died(officerId, clanId, cause, nodeId)`；§3.9.2
  自然死亡明訂發 `officer.died(cause='age', nodeId=null)`；§3.7.2(c) 處刑路徑明訂「不呼叫 `die()`、僅發
  `officer.executed`、不重複發 `officer.died`」（五輪裁決 C／02 §4.19 表後註③）。(3) grep 自查已排除
  `'natural'`／`cause='execution'` 殘留（`CaptiveAction` 之 `'execute'` 值為不同型別，不受影響）。
- **2026-07-11（七輪裁決 2／3，依 02 §8「2026-07-11 七輪裁決」及其 06 下游清單；新契約：core 不得直發 `report.*` key、報告一律由 13 §3.7 `renderReport` 於渲染時導出，五輪 A）**：本檔「直發 `report.*`／泛稱『發報告』」之活體全數收束為發 02 §4.19 canonical 事件（型別／payload 以 02 為準），比照 05 §8.4／§8.5 同型改法。逐項：
  (1) **出奔**（§3.6.4）`report.officer.defect` → 發事件 `officer.defected{officerId, fromClanId, toClanId: null}`（出奔＝流浪，`toClanId=null`）。
  (2) **引拔受理**（§3.6.5）刪直發 `report.officer.poached`——引拔為 08 調略效果，成功事件由 08 §5.5.2 發 `plot.succeeded{kind:'poach'}`（另 emit `officer.recruited{source:'poach'}`），被引拔方視角報告由 13 §3.7 依該事件導出；受理端不另發事件。
  (3) **登用失敗**（§3.7.1）補發事件 `officer.recruitFailed{officerId, executorId, clanId}`（七輪裁決 2 收錄——core 內部決定論結果、非 state 可衍生，與 `officer.recruited` 成功報告對稱；原僅有 catalog 字串、無 emit 點，屬孤兒事件缺口）。
  (4) **身分推舉**（§3.8.3）泛稱「發報告」→ 發事件 `officer.promoted{officerId, clanId, newRank}`（02 §4.19 既有、06 為生產者，原無 emit 點；同型收束，逾 02 §8 06 下游清單四項之補全）。
  (5) **家督繼承**（§3.9.3／§5.5）`report.clan.succession` → 發事件 `clan.succession{clanId, deceasedId, heirId}`（`deceasedId`＝重寫前 `clan.leaderId`＝歿去之當主；`clanIds=[clanId]`；七輪裁決 2 收錄）。
  (6) **元服**（§3.10／§5.6）`report.officer.comingOfAge` → 發事件 `officer.comingOfAge{officerId, clanId}`（正常登場路徑；§5.6 早夭跳過分支仍不發，§5.11）。
  (7) **欠俸**（§5.2）刪直發 `report.clan.unpaidSalary`——欠俸事件 `economy.upkeepUnpaid{clanId, payeeIds}` 由 05 於 economy 月結時單一發出（05 §3.1.4／§5.2、單一生產者），本函式僅定義俸祿金額與忠誠懲罰、不重複發出（報告 13 §6.11 `report.economy.upkeepUnpaid`）。
  (8) **功績達門檻**（§5.7）刪直發 `report.officer.meritReady`——判 **UI-only**（條件 `o.merit ≥ rankMeritThresholds[nextRank]` state 可衍生），改由 11 武將一覽／詳細卡 badge 直讀 state 呈現（七輪裁決 2；13 §6.11 註記）。
  (9) **具申失效**（§3.11.1／§5.8）`report.proposal.invalid` 併入 `proposal.expired`：採納後 Command 再驗證失敗 → 發 `proposal.expired{proposalId, officerId, reason:'invalidated'}`（無忠誠懲罰）；逾期分支（§3.11.1／§5.8 `proposalsSystem`）補發 `proposal.expired{…, reason:'timeout'}`（原逾期分支無 emit 點，屬 06 為生產者之孤兒事件缺口）；13 §3.7 依 `reason` 分流 `report.proposal.expired`（timeout）／`report.proposal.invalid`（invalidated）。
  (10) **合戰捕獲**（§3.7.2，七輪裁決 3）：捕虜產生條件敘述對齊 07 §3.14——時機 2 合戰敗北（敗將先擲戰死、未死者再擲捕獲）、時機 3 落城（逃脫／被俘／戰死三分）；機率公式歸 07（僅引用，`officer.captured` 已 canonical、02 不改）。
  §6 report 字串 catalog 不動（比照 05 §6.2 保留、13 §6.11 為權威）。grep 自查：「發報告 report.」歸零（餘「不發報告」負向敘述與 UI-only 註記各 1）；未動 00／02／19；無待決標記與簡體殘留。
- **2026-07-12（M2a review 遺留 F2：treatment() 夾限常數化）**：§3.6.1 `treatment(o)` 之對稱夾限
  `−18/+18` 原為公式內硬編字面值，未如同段 `loyaltyRankGapWeight` 等其餘係數一般具名；依 00 §11／
  15 §3.2「數值必須有名有出處，不得魔術數字」原則，提為常數 `BAL.loyaltyTreatmentClampAbs`＝18
  （15 §5.1 主表新增列，06 子表 106→107 項）。§3.6.1 公式改以常數名表述（`clamp(…, −BAL.loyaltyTreatmentClampAbs,
  +BAL.loyaltyTreatmentClampAbs)`），數值不動（仍為 18）。實作：`src/core/balance.ts` 新增鍵、
  `src/core/state/builder.ts` `applyInitialLoyalty()` 改引用（原硬編 `-18, 18` 兩處字面值消除）。
- **2026-07-13（M3 review 三項收尾）**：
  (F1) **收支預覽俸祿口徑對齊實際結算**：`officerSalary()`（預覽用，`src/core/domestic.ts`）原缺
  `hasComeOfAge` 判斷，致仕官未元服武將（`status='serving'` 且 `hasComeOfAge=false`，如 s1560 織田家
  之織田長益）被預覽計薪，而實際 `paySalaryForClan()` 之支薪對象過濾含 `hasComeOfAge`——違反 05-T5-10
  「預覽＝次月實際」。修法：`officerSalary` 起首補 `!officer.hasComeOfAge → 0`，兩處口徑一致（實測
  織田家預覽＝實際＝326）。
  (F2) **欠俸忠誠懲罰移至月結漂移之後套用**：欠俸 −`BAL.unpaidSalaryLoyaltyPenalty`（§3.6.3）原於
  economy 步驟（Step 6）由 `paySalaryForClan` 直接施加，而 §3.6.2 之月結漂移於 officers 步驟（Step 9）
  同 tick 後行，致懲罰被同月 ±2 漂移即時抹平（忠誠處於目標值者淨變化為 0），牴觸 §3.6.2「事件造成的
  忠誠增減不會立即被抹平」。依 §3.6.3「05 觸發、[06]定值」之權責劃分裁定：economy 步驟僅司金錢結算與
  發 `economy.upkeepUnpaid{clanId, payeeIds}`（金錢單一擁有者不變）；忠誠懲罰改由 officers 步驟於
  `recomputeLoyalty` 漂移「之後」以 `applyUnpaidSalaryPenalty(state, unpaidPayeeIds)` 套用。M4 接線後，
  `payeeIds` 固定為 economy Step 6 結算當下之實際支薪對象快照，officers Step 9 直接消費事件內清單，
  不再重推可能已因行軍、戰死或俘虜而變動的武將集合。13 步固定順序不動。
  (F3) **政策／施設效果倍率去魔術數字**：`development`／`domestic`／`uprising`／`conscription`／`transport`
  諸系統內嵌之政策／施設倍率與治安細目（如樂市/關所/檢地開發倍率、傳馬制/港灣輸送日數倍率、寺社保護/
  五人組治安與一揆率係數等）比照上條 F2 同型改法，提為 `BAL.pol*`／`BAL.fac*`／`BAL.security*`／
  `BAL.uprising*` 具名常數（15 §5.1／05 §5.6 主表新增列），數值不動、行為 bit-exact 不變。

---

*本文件依 `00-foundations.md` §13 撰寫；BAL 定案值以 `plan/15-balance.md` 為準。*
