# 15 — 平衡數值主表（Balance）

> 本文件是全案 `BAL.*` 數值常數的**定案值單一真相來源**。所有系統文件（03~10、16）在公式中引用
> `BAL.常數名` 並附「建議初值」；本文件彙整為主表、對值分歧定案、驗證平衡，並實作於
> `src/core/balance.ts`（唯一檔案，00 §11）。規格衝突優先序：`00 > 02 > 15 > 系統文件(03~10,16) > UI 文件(11~13)`。
> **就 `BAL.*` 常數的『值』而言，本文件為最終定案**（00 §11）；但**常數的『名稱』一律以 `19-glossary.md` §3.13
> 勘誤表為準**（其正確套用 00>02 優先序，把重名常數統一到資料模型 02 或機制擁有文件的名稱）。
> 本文件**不新增遊戲機制**：機制定義仍歸各擁有文件（00 §7）。

---

## 1. 目的與範圍

### 1.1 本文件負責

1. **BAL 常數主表**（§5.1）：涵蓋全部 21 份文件出現過的每一個 `BAL.*` 常數（共 631 個名稱），
   逐項給定定案值、單位、語意、出處、備註。
2. **值分歧定案**（§5.2）：15 項同名異值衝突的定案值、60 項同義／重名別名的併入（名稱依 19 §3.13）、
   機制重疊裁決、27+ 項不進 `balance.ts` 的非模擬常數。
3. **平衡目標鏈驗證**（§5.3）：以 00 §6 的四項設計目標逐條例算（含完整算式）。
4. **難易度修正主表**（§5.4）與**成長曲線表**（§5.5）。
5. **平衡驗證方法**（§5.6）：`tools/simulate.ts` 無頭模擬規格與判讀準則。
6. **`src/core/balance.ts` 程式結構**（§4）。

### 1.2 本文件不負責

- **不做命名裁決**：常數名的跨文件統一歸 19 §3.13 勘誤表（E-01…E-56）；本文件僅固定「值」並沿用其名稱決定。
- 不定義遊戲機制、型別、公式步驟（歸各系統文件）；不新增 UI 字串（歸 13）。
- 難易度只修正 AI 勢力的收入／士氣／積極度乘數，**永不改變玩家規則**（00 §11）。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `00-foundations.md` | §6 平衡目標、§11 BAL 規範為上位準則；不得修改 00。 |
| `19-glossary.md` §3.13 | **命名與跨文件一致性的權威勘誤表**（E-01…E-56）。本文件的別名併入（§5.2 表 B）與其一致，並標注對應 E 編號；修正階段兩文件並用。 |
| `02-data-model.md` | 常數名若在 02 有定義（如 `moraleBreakThreshold`、`reportMaxKept`、`fiefMaxByRank`），依 02（00>02）；BAL 值仍以本文件為準。 |
| `05~10、16`（系統文件） | 各文件 §5 的建議初值為本主表輸入；值衝突時本文件定案，修正階段回寫來源文件 §8。 |
| `17-testing.md` | golden 期望值須以本主表為準；17 §3.4 現存一批自訂測試常數多與權威常數重名異值，須改（§5.2 表 B）。 |

---

## 3. 設計細節

### 3.1 主表的組織與讀法

- §5.1 主表依**機制擁有文件（00 §7）**分成 15 個子表，便於閱讀；每子表內按常數名字母序。
- 每列欄位：`常數名`｜`定案值`｜`單位`｜`語意`｜`出處`｜`備註`。`備註` 欄的 `⚠` 表示存在跨文件衝突/重名，
  其裁決見 §5.2 並標注對應 19 §3.13 的 E 編號。
- **物件／表格型常數**（`rankTroopCap`、`courtRankTable`…）以父名列一列，逐階值見 §5.5 或擁有文件正文。
- 主表只收**模擬層常數**（進 `balance.ts`）；UI／效能／節奏／存檔設定等**非模擬常數**另列於 §5.2 表 D。

### 3.2 值定案原則

1. **值以 15 為準**（00 §11）：主表「定案值」即最終值，覆蓋任何文件的建議初值。
2. **名以 19 §3.13 為準**：同義／重名常數統一採勘誤表指定名（多為 02 或機制擁有文件），本文件沿用不另裁。
3. **量綱一致**：同一物理量統一為主表所列單位（§3.3）並換算校核（如城內糧耗用「石/人/月」、出陣糧耗用「石/人/日」）。
4. **平衡目標優先**：若建議值使 §5.3 目標鏈失衡，改定案值以符合 00 §6，並於 §8 記錄。
5. **非模擬值不進 balance.ts**：改了不影響 golden hash 者（UI 動畫/渲染/效能/速度節奏/存檔槽），歸 UI/app/perf/存檔設定（00 §3.7；§4.3、§5.2 表 D）。

### 3.3 單位與量綱規範（canonical）

| 類別 | 單位寫法 | 範例常數 |
|---|---|---|
| 貨幣 | 貫（勢力級整數） | `goldPerCommerce`（貫/商業點/月） |
| 兵糧 | 石（城級整數；率為實數） | `harvestRate`、`fieldFoodPerSoldierDaily`（石/人/日） |
| 比率／機率 | 無量綱 0..1 | `fieldCombatDailyLossRate`、`uprisingChancePerPoint` |
| 乘數／係數 | 無量綱（1.0 中性） | `fiefDevBonus`、`pincerMult` |
| 時長 | 日 / 月 / tick | `subjugateDaysBase`（日）、`marriageNoBreakMonths`（月） |
| 點數 | 點（士氣/治安/忠誠/威信…） | `moraleBreakThreshold`、`awePrestigeLarge` |
| 表格常數 | 六階陣列或 `Def[]` | `rankSalary[6]`、`courtRankTable: CourtRankDef[]` |

**時間換算**（00 §5.1）：`1 月 = 30 日`、`1 年 = 360 日`；「/月」常數於每日結算取 `值/30`。

### 3.4 平衡設計目標（引用 00 §6，本文件據以驗證）

1. `soldiersPerKoku ≈ 0.025`：1 萬石 ≈ 250 常備兵。以 `soldiersPerPop = 0.025` 且劇本「郡人口 ≈ 郡石高」達成（05 §3.2.1）。
2. 10 萬石大名維持約 3,000 野戰兵力連續作戰 6 個月不斷糧（§5.3 例算一）。
3. ×1 速度統一天下約 4–8 小時真實時間（遊戲內 15–25 年）（§5.3 例算三、四）。
4. 1560 開局：織田 ~30 萬石、今川 ~70 萬石（§5.3 例算二採 14 實測 31.0/67.0 萬石）。

---

## 4. 資料結構

### 4.1 `src/core/balance.ts` 檔案結構

全部模擬層常數集中於單一 `readonly` 物件 `BAL`，`as const` 凍結，分區註解對齊 §5.1 子表：

```typescript
// src/core/balance.ts — 全部 BAL.* 模擬層常數的單一真相來源（15-balance.md §5.1）。
// 鐵律：core 內任何影響 golden hash 的數字都必須來自此物件；禁止魔術數字（00 §11、README §3.7-4）。
// 常數命名依 19-glossary §3.13；非模擬常數（UI 節奏/效能/縮放/存檔槽）不在此，見 §4.3。

export const BAL = {
  // ── 經濟・開發・知行・施設・徵兵・政策・治安（05）──
  goldPerCommerce: 0.1,
  fiefTaxRate: 0.7,
  harvestRate: 0.3,
  garrisonFoodPerSoldierMonthly: 0.1,
  castleFoodCapMain: 60_000,
  castleFoodCapBranch: 30_000,
  mainCastleSlots: 6,
  branchCastleSlots: 3,
  policySlotMax: 6,                              // 硬上限；生效數＝min(6,1+floor(威信/300))（05 §3.7）
  castleStarveMoraleDaily: 2,                    // 新增：一般糧盡城士氣日扣（原 05 §3.1.3 未命名，見 §5.2 表 C）
  // …（§5.1「05」子表全部常數）

  // ── 武將・特性・身分・忠誠・功績・具申（06）──
  rankMeritThresholds: [0, 300, 800, 1600, 3000, 5000],
  fiefMaxByRank: [0, 1, 1, 2, 3, 4],            // 名依 02（E-03）；值採 06 序列
  rankSalary: [3, 6, 10, 15, 22, 30],           // 貫/月；index=rankIndex（E-04）
  maxTraitsPerOfficer: 4,                        // E-05：值定 4
  poachedInitialLoyalty: 45,                     // E-33：名依 06，值 15 定案
  loyaltyReduceFief: 15,                         // E-53：收回知行統一走此
  // …

  // ── 軍事・野戰・合戰・威風・攻城・兵站（07）──
  fieldFoodPerSoldierDaily: 0.02,               // 石/人/日；出陣/野戰/行軍統一（E-14）
  rankTroopCap: { ashigaruKumigashira: 500, ashigaruTaisho: 1000, samuraiTaisho: 2000,
                  busho: 3000, karo: 5000, shukuro: 8000 },   // 最終帶兵上限（絕對值，E-37）
  fieldCombatDailyLossRate: 0.04,
  moraleBreakThreshold: 30,                      // 名依 02（E-16）；潰走士氣閾值
  // …

  // ── 外交・朝廷・幕府・調略（08）── / … 09 / 10 / 04 / 03 / 02 …
  courtRankTable: [ /* CourtRankDef[]，見 §5.5 表 G */ ],
  shogunateTitleTable: [ /* ShogunateTitleDef[]，見 §5.5 表 H */ ],
  reportMaxKept: 500,                            // 名依 02（E-31）
  // …
} as const;

export type BalConfig = typeof BAL;
```

- **難易度不進 `BAL`**：`BAL` 只存中立（玩家）數值；難易度四常數（`diffAi*`，§5.4）經 `getDifficultyMods(state)` 只作用於 AI（09 §3.9）。
- **表格型常數**（`courtRankTable`、`shogunateTitleTable`）以 `Def[]` 存於 `BAL`；型別定義於 02／08，不重複定義。

### 4.2 引用的型別（歸 02／各系統文件）

`Rank`、`CourtRankDef`、`ShogunateTitleDef`、`TaimeiDef`、`DevelopFocus`、`ConscriptPolicy` 等型別由 02 或擁有文件定義；
`balance.ts` 僅 `import type`，不另立同義型別。

### 4.3 非模擬常數的歸屬（不進 balance.ts）

依 00 §3.7-4 判準（「改了會不會變 golden hash」——不會變者非 BAL），以下雖以 `BAL.*` 書寫，實作**不入** `balance.ts`（清單見 §5.2 表 D）：

- **速度節奏／每日毫秒**（`uiDayMsX1/2/5`、`uiMaxTicksPerFrame`…）→ `src/app/` 迴圈驅動設定（01 §3）；清除 03 的重複定義。
- **效能預算**（`perfFontKb`、`perfMainBundleKb`、`perfTickBudgetMs`…）→ 建置/CI 設定（01 §3.9、17）。
- **UI 互動/顯示**（`uiToastDurationMs`、`uiReportPageSize`、`uiScaleMin/Max/Step`…）→ `src/ui/` 與設定（12、16）。
- **存檔設定**（`manualSaveSlots`、`autoSaveSlots`、`quickSaveSlots`、`autoSaveIntervalMonths`…）→ 16 的 `SAVECFG.*`（E-56）。
- **合戰 UI tick 時長**（`kassenTickMs`）→ UI 層；合戰**邏輯**的 `kassenMaxTicks`、`battleTickDamageRate` 等仍屬 BAL。

---

## 5. 演算法與公式

### 5.1 BAL 常數主表（536 項模擬層常數，依擁有文件分子表）

> 定案值即最終值。備註 `⚠` 者見 §5.2 裁決（標注 19 §3.13 的 E 編號）。物件/表格常數逐階值見 §5.5。

#### 經濟・郡開發・知行・施設・徵兵・政策・治安一揆（05）（58）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `barracksConscriptBonus` | 1.25 | 係數(無量綱) | 郡方針為兵舍時該郡對所屬城徵兵貢獻的乘數 | 05 §3.2.2 |  |
| `barracksPopGrowthFactor` | 2.0 | 係數(無量綱) | 郡開發方針為兵舍時人口自然成長的乘數 | 05 §3.2.2 |  |
| `branchCastleSlots` | 3 | slot(數量) | 支城的城下施設可用 slot 數 | 05 §3.4.1 | ⚠ E-39：名依 05；02.facilitySlotsBranch 別名（值一致） |
| `buildQueueSize` | 3 | 件(數量) | 每城建造佇列容量 | 05 §3.4.1 |  |
| `buildRefundRate` | 0.5 | 比率(退款率) | 取消佇列項(含施工中)時的造價退還比例 | 05 §3.4.1 |  |
| `castleBaseSoldiersBranch` | 500 | 人 | 支城最大兵力的城格基礎值 | 05 §3.5 |  |
| `castleBaseSoldiersMain` | 1000 | 人 | 本城最大兵力的城格基礎值 | 05 §3.5 |  |
| `castleFoodCapBranch` | 30000 | 石 | 支城兵糧容量基準(未含藏加成) | 05 §3.1.2 |  |
| `castleFoodCapMain` | 60000 | 石 | 本城兵糧容量基準(未含藏加成) | 05 §3.1.2 |  |
| `conscriptPolicyFactor` | 低0.5/中1.0/高1.8 | 係數(無量綱) | 徵兵方針對徵兵量的乘數 | 05 §3.5 |  |
| `conscriptPopFactor` | 低1.1/中1.0/高0.5 | 係數(無量綱) | 徵兵方針對人口自然成長的係數 | 05 §3.2.4 |  |
| `conscriptRate` | 0.005 | 比率(/月) | 每月可徵兵量對郡有效人口的基準比例 | 05 §3.5 |  |
| `conscriptSecurityDelta` | 低+1/中0/高−2 | 點/月(治安) | 徵兵方針對所屬城轄郡治安的月變化(兵農分離時高改0) | 05 §3.8.1 |  |
| `devDiminishExp` | 2 | 指數(無量綱) | 開發報酬遞減公式的指數 (1−(當前/上限)^exp) | 05 §3.2.3 |  |
| `devOffWeight` | 0.15 | 權重(無量綱) | 開發時非方針主屬性的成長權重(主屬性 1.0) | 05 §3.2.3 |  |
| `devPolFactor` | 0.6 | 點/政務點/月 | 開發月額成長對政務點的基準轉換係數(未乘 scale) | 05 §3.2.3 |  |
| `devScaleCommerce` | 0.4 | 係數(無量綱) | 商業屬性的開發尺度係數(石高 1.0) | 05 §3.2.3 |  |
| `devScalePop` | 3.0 | 係數(無量綱) | 人口屬性的開發尺度係數(石高 1.0) | 05 §3.2.3 |  |
| `directDevFactor` | 0.8 | 係數(無量綱) | 直轄郡的開發管理係數 | 05 §3.2.3 | ⚠ E-（17）17 §3.4.2 之 0.6 須改為 0.8 |
| `facBarracksConscriptBonus` | 0.25 | 係數(徵兵加成) | 兵舍施設:該城每月徵兵量 ×(1+此值) | 05 §3.4.2 |  |
| `facBarracksSoldierCap` | 500 | 人 | 兵舍施設:城最大兵力加值 | 05 §3.4.2 |  |
| `facFortDurability` | 300 | 點(耐久) | 砦:城耐久上限加值 | 05 §3.4.2 |  |
| `facMarketIncomeBonus` | 0.15 | 係數(收入加成) | 市:該城轄郡商業收入 ×(1+此值) | 05 §3.4.2 |  |
| `facNanbanGold` | 80 | 貫/月 | 南蠻寺:每月固定金錢收入 | 05 §3.4.2 |  |
| `facPortIncomeBonus` | 0.20 | 係數(收入加成) | 湊:該城轄郡商業收入 ×(1+此值) | 05 §3.4.2 |  |
| `facRangeGunAtkBonus` | 0.10 | 係數(攻擊加成) | 射擊場:該城鐵砲隊攻擊 ×(1+此值) | 05 §3.4.2 |  |
| `facRiceHarvestBonus` | 0.10 | 係數(秋收加成) | 米問屋:該城秋收 ×(1+此值) | 05 §3.4.2 |  |
| `facSmithyAtkBonus` | 0.05 | 係數(攻擊加成) | 鍛冶場:該城部隊攻擊 ×(1+此值)(套用點見07) | 05 §3.4.2 |  |
| `facStorehouseCap` | 20000 | 石 | 藏:城兵糧容量加值 | 05 §3.4.2 |  |
| `facTempleSecurity` | 2 | 點/月(治安) | 寺社:該城轄郡治安每月加值 | 05 §3.4.2 |  |
| `facWallDurability` | 500 | 點(耐久) | 城郭強化:城耐久上限加值 | 05 §3.4.2 |  |
| `fiefDevBonus` | 1.25 | 係數(無量綱) | 受封郡的開發管理係數(高於直轄,為分封誘因) | 05 §3.2.3 |  |
| `fiefLoyaltyBonus` | 5 | 點(忠誠) | 受封領主的持續忠誠基礎加成 | 05 §3.3.2 | ⚠ 17 之 10 須改為 5；與 06.loyaltyFiefBonus 關係見表 C |
| `fiefLoyaltyPerDistrict` | 3 | 點(忠誠/郡) | 受封領主每持有一郡的持續忠誠加成 | 05 §3.3.2 |  |
| `fiefTaxRate` | 0.7 | 比率(無量綱) | 受封郡商業收入與秋收對勢力的上繳率(差額為領主知行收入,不入帳) | 05 §3.1.1 |  |
| `garrisonFoodPerSoldierMonthly` | 0.1 | 石/人/月 | 城駐兵每人每月兵糧維持消耗 | 05 §3.1.3 |  |
| `goldPerCommerce` | 0.1 | 貫/商業點/月 | 每點商業每月換算的勢力金錢收入係數 | 05 §3.1.1 | ⚠ 17 §3.4.1 之 0.5 須改為 0.1 |
| `harvestRate` | 0.3 | 比率(入庫比例) | 秋收時石高年產額轉為城兵糧入庫的比例 | 05 §3.1.2 | ⚠ 17 §3.4.1 之 0.8 須改為 0.3 |
| `mainCastleSlots` | 6 | slot(數量) | 本城的城下施設可用 slot 數 | 05 §3.4.1 | ⚠ E-39：名依 05；02.facilitySlotsMain 別名（值一致） |
| `noLordDevPol` | 30 | 政務點 | 城主缺任時直轄郡開發採用的政務基準值 | 05 §3.2.3 |  |
| `policyReadoptCooldownMonths` | 6 | 月 | 政策廢止後再次採用的冷卻月數 | 05 §3.7.1 |  |
| `policySlotMax` | 6 | 格(數量上限) | 同時生效政策數的硬上限 | 05 §3.7.1 | ⚠ E-38：為硬上限；生效數＝min(6,1+floor(威信/300)) 動態（05）；02.maxActivePolicies=4 固定制廢 |
| `policySlotPrestige` | 300 | 威信/格 | 每增加一政策格所需的威信量 | 05 §3.7.1 |  |
| `polNanbanGold` | 200 | 貫/月 | 南蠻貿易政策:每月固定金錢收入 | 05 §3.7.2 |  |
| `popGrowthBase` | 0.002 | 比率(/月) | 人口每月自然成長的基準率(再乘治安、方針等係數) | 05 §3.2.4 |  |
| `riceBuyRate` | 0.04 | 貫/石 | 米問屋買米單價(金換石) | 05 §3.4.2 |  |
| `riceSellRate` | 0.02 | 貫/石 | 米問屋賣米單價(石換金) | 05 §3.4.2 |  |
| `riceTradeCapMonthly` | 10000 | 石/月/城 | 每城每月米買賣交易量上限 | 05 §3.4.2 |  |
| `securityAfterSuppress` | 45 | 點(治安) | 一揆被鎮壓後治安直接設定的值 | 05 §3.8.1 |  |
| `securityOnSubjugated` | 20 | 點(治安) | 郡被制壓翻轉歸屬時的一次性治安扣減 | 05 §3.8.1 |  |
| `soldiersPerPop` | 0.025 | 兵/人口(係數) | 人口換算為城最大兵力的係數 | 05 §3.2.1 |  |
| `starveDesertRate` | 0.01 | 機率(每日逃兵率) | 糧盡時城駐兵每日逃散比例 | 05 §3.1.3 |  |
| `stewardMeritPerDistrict` | 6 | 功績點/郡/月 | 受封領主每月每郡累積的功績 | 05 §3.3.2 |  |
| `transportSpeedFactor` | 1.0 | 係數(×步兵基準日速) | 輸送隊相對步兵基準日速的速度係數 | 05 §3.6 |  |
| `uprisingArmyRate` | 0.05 | 比率(人口比例) | 一揆爆發時一揆軍兵力對郡人口的比例 | 05 §3.8.3 |  |
| `uprisingAutoEndMonths` | 6 | 月 | 一揆自然平息所需持續月數 | 05 §3.8.3 |  |
| `uprisingChancePerPoint` | 0.02 | 機率/點/月 | 低於門檻每差 1 點治安增加的每月一揆爆發機率 | 05 §3.8.2 |  |
| `uprisingThreshold` | 30 | 點(治安門檻) | 觸發一揆判定的治安門檻(低於此值才判定) | 05 §3.8.2 | ⚠ 05 治安擁有者；02.uprisingOrderThreshold/11.securityRiotThreshold 別名 |

#### 武將能力・特性・身分功績・忠誠・登用褒賞・壽命・具申（06）（106）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `captiveInitialLoyalty` | 40 | 忠誠點 | 捕虜登用成功後加入我方的初始忠誠 | 06 §3.7.2 |  |
| `captiveKinPenalty` | 0.35 | 機率(add) | 敵方一門捕虜的登用成功率懲罰（幾乎不降） | 06 §3.7.2 |  |
| `captiveRecruitBaseRate` | 0.20 | 機率 | 捕虜登用基礎成功率 | 06 §3.7.2 |  |
| `captiveRecruitLoyaltyWeight` | 0.004 | 機率/點 | 捕虜忠誠低（100−忠誠）每點的登用成功率權重 | 06 §3.7.2 |  |
| `captiveRecruitPolWeight` | 0.003 | 機率/點 | 執行者政務高於50每點的捕虜登用成功率權重 | 06 §3.7.2 |  |
| `captiveRecruitPrestigeWeight` | 0.0002 | 機率/點 | 勢力威信（上限1000）每點的捕虜登用成功率權重 | 06 §3.7.2 |  |
| `captiveRetryCooldownDays` | 30 | 日 | 捕虜登用失敗後下次可嘗試的冷卻天數 | 06 §3.7.2 |  |
| `comingOfAgeAge` | 15 | 歲 | 未指定登場年時的元服年齡（debutYear=birthYear+此值） | 06 §3.10 |  |
| `defaultDeathAge` | 60 | 歲 | 無史實卒年者的預設死亡年齡基準 | 06 §3.9.1 |  |
| `defaultDeathAgeSpread` | 8 | 歲(±) | 預設死亡年齡的隨機浮動範圍（60±8） | 06 §3.9.1 |  |
| `defectionChancePerPoint` | 0.01 | 機率/點 | 出奔機率＝(門檻−忠誠)×此係數（忠誠0時每月30%） | 06 §3.6.4 |  |
| `defectionThreshold` | 30 | 忠誠點 | 出奔判定的忠誠門檻（低於此值才判定） | 06 §3.6.4 | ⚠ 17.defectionLoyaltyThreshold=30 別名須改名（值一致） |
| `executeLoyaltyPenalty` | 2 | 忠誠點 | 處斬捕虜時我方全體非一門家臣連坐的忠誠懲罰 | 06 §3.6.3 |  |
| `executePrestigeLoss` | 10 | 威信點 | 處斬捕虜的威信損失 | 06 §3.7.2 |  |
| `expectedRankAbilityThresholds` | 55/70/80/90/100（≥各值分別對應期待身分1..5階） | 能力點 | 由最高維能力值推定期待身分階的能力門檻表 | 06 §3.6.1 |  |
| `loyaltyBase` | 50 | 忠誠點 | 忠誠目標值計算的基礎值 | 06 §3.6.1 |  |
| `loyaltyBattleRoutPenalty` | 3 | 忠誠點 | 我方合戰大敗時參戰者的忠誠即時懲罰 | 06 §3.6.3 |  |
| `loyaltyDismiss` | 10 | 忠誠點 | 罷免（解除城主/軍團長職）的忠誠即時懲罰 | 06 §3.6.3 |  |
| `loyaltyDriftPerMonth` | 2 | 忠誠點/月 | 每月忠誠向目標值漂移的最大幅度（±） | 06 §3.6.2 |  |
| `loyaltyFiefBonus` | 10 | 忠誠點 | 持有知行者的忠誠目標值加成 | 06 §3.6.1 |  |
| `loyaltyFudaiBonus` | 10 | 忠誠點 | 譜代（fudai）出身的忠誠目標值加成 | 06 §3.6.1 |  |
| `loyaltyGrantFief` | 8 | 忠誠點 | 加封知行（新增一郡）的忠誠即時增益 | 06 §3.6.3 |  |
| `loyaltyKinBonus` | 30 | 忠誠點 | 一門（kin）出身的忠誠目標值加成 | 06 §3.6.1 |  |
| `loyaltyLeaderPolDivisor` | 20 | 除數(政務點) | 當主政務代理項除數（floor(leader.pol/此值)，最高+6） | 06 §3.6.1 |  |
| `loyaltyPrestigeDivisor` | 400 | 除數(威信點) | 勢力威信代理項除數（floor(clan.prestige/此值)，最高+5） | 06 §3.6.1 |  |
| `loyaltyPromote` | 8 | 忠誠點 | 身分推舉（升格）的忠誠即時增益 | 06 §3.6.3 |  |
| `loyaltyRankGapWeight` | 6 | 忠誠點/階 | 身分與期待身分階差距每階對待遇項的忠誠權重（clamp ±18） | 06 §3.6.1 |  |
| `loyaltyReduceFief` | 15 | 忠誠點 | 減封（沒收一郡）的忠誠即時懲罰 | 06 §3.6.3 | ⚠ E-53：收回知行統一走此；05.dismissLoyaltyPenalty(15) 改引用 |
| `loyaltyStalledPromotion` | 5 | 忠誠點 | 升格停滯（達標未推舉）時忠誠目標值扣減 | 06 §3.6.1 |  |
| `maxTraitsPerOfficer` | 4 | 個 | 每名武將可持有的特性數量上限 | 06 §3.3 | ⚠ E-05：名已同（02/06）；值定 4（容納 E-06 追加特性），06 之 3 改為 4 |
| `meritBattleAweBonus` | 20 | 功績點 | 合戰大勝（產生威風）額外給予的功績 | 06 §3.5 |  |
| `meritBattleWin` | 40 | 功績點 | 合戰勝利給參戰各武將的功績 | 06 §3.5 |  |
| `meritCommanderMult` | 1.5 | 係數(無量綱) | 戰鬥類功績部隊主將的乘數（四捨五入） | 06 §3.5 |  |
| `meritDevelopment` | 10 | 功績點 | 開發指令完成一階段給開發負責人的功績 | 06 §3.5 |  |
| `meritDiplomacy` | 25 | 功績點 | 外交工作成果（協定成立或信用滿）給執行武將的功績 | 06 §3.5 |  |
| `meritFieldLose` | 5 | 功績點 | 野戰敗方參戰給予的功績 | 06 §3.5 |  |
| `meritFieldWin` | 20 | 功績點 | 野戰勝利給參戰各武將的功績 | 06 §3.5 |  |
| `meritPlot` | 35 | 功績點 | 調略成功給執行武將的功績 | 06 §3.5 |  |
| `meritProposalAdopted` | 30 | 功績點 | 具申被採納給予提案人的功績 | 06 §3.5 |  |
| `meritSiegeWin` | 30 | 功績點 | 攻城成功（落城）給參戰各武將的功績 | 06 §3.5 |  |
| `meritStewardMonthly` | 5 | 功績點 | 領主自動治理月結給該郡領主的功績 | 06 §3.5 |  |
| `poachedInitialLoyalty` | 45 | 忠誠點 | 被引拔成功後於新勢力的初始忠誠 | 06 §3.6.5 | ⚠ E-33：名統一 poachedInitialLoyalty；08.plotPoachInitialLoyalty(60) 併入，值定 45 |
| `poachEligibleLoyalty` | 40 | 忠誠點 | 可被列為引拔目標的忠誠門檻，並用於受理成功率factor | 06 §3.6.5 |  |
| `proposalAdoptLoyalty` | 2 | 忠誠點 | 具申採納給提案人的忠誠即時增益 | 06 §3.6.3 |  |
| `proposalExpireLoyalty` | 1 | 忠誠點 | 具申逾期未理給提案人的忠誠即時懲罰 | 06 §3.6.3 |  |
| `proposalMaxPerMonth` | 5 | 件/月 | 每月對玩家勢力產出的具申件數上限 | 06 §3.11.1 |  |
| `proposalMaxPerOfficerPerMonth` | 1 | 件/月 | 同一武將同月最多提出的具申件數 | 06 §3.11.1 |  |
| `proposalRejectLoyalty` | 2 | 忠誠點 | 具申駁回給提案人的忠誠即時懲罰 | 06 §3.6.3 |  |
| `rankMeritThresholds` | [0,300,800,1600,3000,5000] | 功績點 | 各身分階升至該階所需之累積功績門檻表 | 06 §3.4.1 | ⚠ 17.meritRankThresholds=[0,500,1500,3500,7000,12000] 別名須改 |
| `rankSalary` | [3,6,10,15,22,30] | 貫/月 | 各身分階無知行者之月俸祿表 | 06 §3.4.2 | ⚠ E-04：名統一 rankSalary；05.salaryByRank 別名（表 B） |
| `recruitAbilityPenalty` | 0.004 | 機率/點 | 目標能力值超過60每點的登用成功率懲罰（名將更難） | 06 §3.7.1 |  |
| `recruitAttemptCost` | 20 | 貫 | 每次浪人登用嘗試支付的禮金（成敗皆不退） | 06 §3.7.1 |  |
| `recruitBaseRate` | 0.30 | 機率 | 浪人登用基礎成功率 | 06 §3.7.1 |  |
| `recruitPolWeight` | 0.004 | 機率/點 | 登用執行者政務高於50每點的成功率權重 | 06 §3.7.1 |  |
| `recruitPrestigeWeight` | 0.0003 | 機率/點 | 勢力威信（上限1000）每點的登用成功率權重 | 06 §3.7.1 |  |
| `recruitRetryCooldownDays` | 90 | 日 | 浪人登用失敗後對本勢力的冷卻天數 | 06 §3.7.1 |  |
| `recruitSigningBonusPerAbility` | 2 | 貫/能力點 | 登用成功時支度金＝abilityScore×此值 | 06 §3.7.1 |  |
| `releasePrestigeGain` | 5 | 威信點 | 釋放捕虜的威信增益 | 06 §3.7.2 |  |
| `rewardGoldLargeCost` | 200 | 貫 | 大額金錢賞賜的費用 | 06 §3.8.1 |  |
| `rewardGoldLargeLoyalty` | 9 | 忠誠點 | 大額賞賜的忠誠基礎增益（年內遞減） | 06 §3.8.1 |  |
| `rewardGoldMediumCost` | 100 | 貫 | 中額金錢賞賜的費用 | 06 §3.8.1 |  |
| `rewardGoldMediumLoyalty` | 6 | 忠誠點 | 中額賞賜的忠誠基礎增益（年內遞減） | 06 §3.8.1 |  |
| `rewardGoldSmallCost` | 50 | 貫 | 小額金錢賞賜的費用 | 06 §3.8.1 |  |
| `rewardGoldSmallLoyalty` | 4 | 忠誠點 | 小額賞賜的忠誠基礎增益（年內遞減） | 06 §3.8.1 |  |
| `stalledPromotionGraceMonths` | 3 | 月 | merit 達下一階門檻後認定為升格停滯所需的連續月數 | 06 §3.6.1 |  |
| `statExpPerPoint` | 100 | 經驗點 | 每維各自累積經驗，每累積此點數該維成長+1 | 06 §3.2 |  |
| `statGrowthCap` | 5 | 成長點 | 每維能力成長上限（+5），到頂後溢出經驗捨棄 | 06 §3.2 |  |
| `successionLoyaltyShockFudai` | 5 | 忠誠點 | 家督交替時譜代家臣的忠誠即時衝擊（−5） | 06 §3.6.3 |  |
| `successionLoyaltyShockTozama` | 10 | 忠誠點 | 家督交替時外樣家臣的忠誠即時衝擊（−10） | 06 §3.6.3 |  |
| `traitBoshin` | 0.35 | 機率(add) | 謀神：執行調略成功率加值 | 06 §3.3 |  |
| `traitBoshinCostCut` | 0.25 | 係數(無量綱) | 謀神：調略費用削減比例 | 06 §3.3 |  |
| `traitBoshu` | 0.20 | 係數(無量綱) | 募兵上手：任城主之城徵兵所得兵力乘數加成 | 06 §3.3 |  |
| `traitChiebukuro` | 0.50 | 係數(無量綱) | 智囊：具申生成權重乘數加成 | 06 §3.3 |  |
| `traitChikujo` | 0.30 | 係數(無量綱) | 築城名手：擔任建設負責人時城下施設工期削減 | 06 §3.3 |  |
| `traitChotei` | 0.25 | 係數(無量綱) | 朝廷通：朝廷獻金與官位申請費用削減 | 06 §3.3 |  |
| `traitChushin` | 20 | 忠誠點 | 忠臣：忠誠目標值加成；且不可成為出奔/引拔對象 | 06 §3.3 |  |
| `traitGaiko` | 0.25 | 係數(無量綱) | 外交上手：外交工作信用累積乘數加成 | 06 §3.3 |  |
| `traitGoketsu` | 0.10 | 係數(無量綱) | 豪傑：野戰/合戰部隊攻擊乘數加成 | 06 §3.3 |  |
| `traitGunshin` | 0.15 | 係數(無量綱) | 軍神：合戰中該武將部隊攻防與戰法計算所用四維乘數加成 | 06 §3.3 |  |
| `traitHayamimi` | 0.20 | 機率(add) | 早耳：敵方對該武將所在城調略時敵成功率減值 | 06 §3.3 |  |
| `traitHeitan` | 0.20 | 係數(無量綱) | 兵站上手：行軍與圍城之兵糧消耗削減 | 06 §3.3 |  |
| `traitHitotarashi` | 0.30 | 機率(add) | 人蕩：登用與捕虜登用成功率加值 | 06 §3.3 |  |
| `traitHitotarashiLoyalty` | 5 | 忠誠點 | 人蕩：同城其他我方武將忠誠目標值加成（光環） | 06 §3.3 |  |
| `traitIfudodoAweRange` | 1 | 郡跳數 | 威風堂堂：已為大威風時威風擴散範圍加成 | 06 §3.3 |  |
| `traitJinbo` | 3 | 忠誠點 | 人望：同城其他我方武將忠誠目標值加成（光環，不含自身） | 06 §3.3 |  |
| `traitJinsei` | 1 | 治安點/月 | 仁政：知行郡與任城主之城直轄郡每月額外治安加成 | 06 §3.3 |  |
| `traitKaizoku` | 0.50 | 係數(無量綱) | 海賊：部隊主將經海路邊行軍速度乘數加成 | 06 §3.3 |  |
| `traitKeigan` | 0.20 | 機率(add) | 慧眼：執行登用（浪人/捕虜）成功率加值 | 06 §3.3 |  |
| `traitKiba` | 0.15 | 係數(無量綱) | 騎馬達人：部隊近戰攻擊乘數加成 | 06 §3.3 |  |
| `traitKibaCharge` | 0.20 | 係數(無量綱) | 騎馬達人：突擊系戰法威力乘數加成 | 06 §3.3 |  |
| `traitKojo` | 0.20 | 係數(無量綱) | 攻城名手：部隊主將攻城每日耐久傷害乘數加成 | 06 §3.3 |  |
| `traitNaisei` | 0.20 | 係數(無量綱) | 內政名人：郡開發效率乘數加成 | 06 §3.3 |  |
| `traitNinja` | 0.20 | 機率(add) | 忍者：執行調略成功率加值 | 06 §3.3 |  |
| `traitNosei` | 0.15 | 係數(無量綱) | 農政家：石高開發效率乘數加成 | 06 §3.3 |  |
| `traitOnimusha` | 0.20 | 係數(無量綱) | 鬼武者：武勇系戰法威力乘數加成 | 06 §3.3 |  |
| `traitReisei` | 0.25 | 係數(無量綱) | 冷靜：所率部隊每日士氣下降削減 | 06 §3.3 |  |
| `traitReiseiRout` | 10 | 閾值點 | 冷靜：部隊潰走閾值降低 | 06 §3.3 |  |
| `traitRojo` | 0.20 | 係數(無量綱) | 籠城名手：任城主之城被圍時耐久損傷削減 | 06 §3.3 |  |
| `traitRojoMorale` | 0.50 | 係數(無量綱) | 籠城名手：守城方每日士氣下降削減 | 06 §3.3 |  |
| `traitSeiatsu` | 0.25 | 係數(無量綱) | 攻略上手：部隊主將制壓敵郡所需時間削減 | 06 §3.3 |  |
| `traitShinsoku` | 0.20 | 係數(無量綱) | 神足：部隊主將陸路行軍速度乘數加成 | 06 §3.3 |  |
| `traitShosai` | 0.15 | 係數(無量綱) | 商才：商業開發效率乘數加成 | 06 §3.3 |  |
| `traitTeppo` | 0.20 | 係數(無量綱) | 鐵砲名人：遠程攻擊與遠程系戰法威力乘數加成 | 06 §3.3 |  |
| `traitYashinLoyalty` | 10 | 忠誠點 | 野心家：忠誠目標值降低 | 06 §3.3 |  |
| `traitYashinMerit` | 0.20 | 係數(無量綱) | 野心家：功績獲得乘數加成 | 06 §3.3 |  |
| `unpaidSalaryLoyaltyPenalty` | 2 | 忠誠點 | 金錢不足全額支薪時，該月全體支薪對象忠誠即時扣減（欠俸） | 06 §3.4.2 | ⚠ 06 忠誠擁有者；05.unpaidSalaryLoyaltyHit(3)/17.deficitLoyaltyPenalty 別名，統一 2 |

#### 編成出陣・野戰・合戰・戰法・威風・攻城・軍團・兵站（07）（83）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `assaultAttackerLossRate` | 0.05 | 比率(每日) | 強攻每日攻方兵損率（對城方power） | 07 §3.11 |  |
| `assaultCastleMoraleDaily` | 1 | 點/日 | 強攻每日城士氣下降 | 07 §3.11 |  |
| `assaultDefenderLossRate` | 0.008 | 比率(每日) | 強攻每日守兵損率（對Σ攻方power） | 07 §3.11 |  |
| `assaultDurabilityRate` | 0.004 | 比率(每日) | 強攻每日城耐久傷害率（對Σ攻方power） | 07 §3.11 |  |
| `autoReturnFoodDays` | 7 | 日 | 剩餘兵糧可支撐日數低於此→觸發自動歸還 | 07 §3.13 |  |
| `aweCastleDurabilityRatio` | 0.05 | 比率(佔耐久上限) | 威風範圍內敗方城耐久扣減比 | 07 §3.10 |  |
| `aweCastleMoraleHit` | 20 | 點 | 威風範圍內敗方城士氣扣減 | 07 §3.10 | ⚠ 17.aweMoraleHit=15 別名須改為 20 |
| `aweLargeFastTicks` | 40 | tick | 本陣陷落tick≤此值→威風(大) | 07 §3.10 |  |
| `aweLargeKillRatio` | 0.7 | 比率 | 殲滅比例≥此值→威風(大) | 07 §3.10 | ⚠ 17 §3.4.4 之 0.6 須改為 0.7 |
| `aweMedKillRatio` | 0.5 | 比率 | 殲滅比例≥此值→威風(中) | 07 §3.10 | ⚠ 17.aweMediumKillRatio=0.45 別名須改為 0.5 |
| `awePrestigeLarge` | 50 | 點(威信) | 威風(大)勢力威信獎勵 | 07 §3.10 |  |
| `awePrestigeMed` | 25 | 點(威信) | 威風(中)勢力威信獎勵 | 07 §3.10 |  |
| `awePrestigeSmall` | 10 | 點(威信) | 威風(小)勢力威信獎勵 | 07 §3.10 |  |
| `aweRangeLarge` | 3 | 跳(節點距) | 威風(大)效果半徑 | 07 §3.10 |  |
| `aweRangeMed` | 2 | 跳(節點距) | 威風(中)效果半徑 | 07 §3.10 |  |
| `aweRangeSmall` | 1 | 跳(節點距) | 威風(小)效果半徑 | 07 §3.10 |  |
| `battleTickDamageRate` | 0.02 | 比率(每tick) | 合戰每tick傷害率 | 07 §3.7 |  |
| `betrayalMoraleHit` | 40 | 點 | 發動內應一次性城士氣扣減 | 07 §3.11 | ⚠ 廢棄：內應效果單一真相改採 08（四輪裁決 B）——城士氣直接降至 `plotBetrayalMoraleFloor`(=5)、城主忠誠歸 0；本一次性−40 模型作廢（02 `CmdUseBetrayal` 註解／08 §3.7.3） |
| `castleMoraleRecoverMonthly` | 10 | 點/月 | 平時（非圍城）城士氣每月回復至100 | 07 §3.11 |  |
| `corpsTithe` | 0.2 | 比率 | 軍團收入上繳勢力金庫比例（軍團留成80%） | 07 §3.12 |  |
| `defaultCarryDays` | 60 | 日 | 預設攜帶兵糧日數 | 07 §3.1 |  |
| `encircleAttackerLossRate` | 0.005 | 比率(每日) | 包圍每日攻方兵損率（對城方power） | 07 §3.11 |  |
| `encircleCastleMoraleDaily` | 2 | 點/日 | 包圍每日城士氣下降 | 07 §3.11 |  |
| `encircleFoodMult` | 2.0 | 倍率(無量綱) | 包圍時城內兵糧每日消耗倍率 | 07 §3.11 |  |
| `encircleRatio` | 3.0 | 倍率(無量綱) | 包圍所需兵力達城駐兵的倍率（不足自動退回強攻） | 07 §3.11 |  |
| `fieldAweKillRatio` | 0.6 | 比率 | 野戰敗方累計損失>初始總兵×此值→勝方得威風(小) | 07 §3.3 |  |
| `fieldCombatDailyLossRate` | 0.04 | 比率(每日) | 野戰每日損耗率（對對方Σpower） | 07 §3.3 |  |
| `fieldFoodPerSoldierDaily` | 0.02 | 石/人/日 | 出陣部隊每日兵糧消耗 | 07 §3.1 | ⚠ E-14：07 為軍事真相來源；04/05/17 別名須改（表 B） |
| `fieldMoraleDailyLose` | 4 | 點/日 | 野戰當日損耗比例較高側士氣下降 | 07 §3.3 |  |
| `fieldMoraleDailyWin` | 2 | 點/日 | 野戰當日損耗比例較低側士氣上升 | 07 §3.3 |  |
| `flagCaptureRate` | 0.012 | 旗力/兵/tick | 佔陣時每兵每tick削減目標陣旗力 | 07 §3.7 |  |
| `flagResetRatio` | 0.5 | 比率 | 陣翻轉後旗力回復至上限之比 | 07 §3.7 |  |
| `homeGroundLossMult` | 0.85 | 乘數(無量綱) | 地利側（節點屬己方）承受損耗的乘數 | 07 §3.3 |  |
| `jinCountMax` | 13 | 個(陣數) | 合戰戰場陣總數上限 | 07 §3.6 |  |
| `jinCountMin` | 9 | 個(陣數) | 合戰戰場陣總數下限 | 07 §3.6 |  |
| `jinDefHill` | 0.3 | 比率(防禦加成) | 高台陣防禦加成 | 07 §3.6 |  |
| `jinDefHonjin` | 0.4 | 比率(防禦加成) | 本陣防禦加成 | 07 §3.6 |  |
| `jinDefNeutral` | 0.15 | 比率(防禦加成) | 中立陣防禦加成 | 07 §3.6 |  |
| `jinFlagHonjin` | 1000 | 旗力點 | 本陣旗力上限 | 07 §3.6 |  |
| `jinFlagNeutral` | 400 | 旗力點 | 中立陣／高台陣旗力上限 | 07 §3.6 |  |
| `jinStackLimit` | 2 | 支 | 每陣每側部隊堆疊數上限 | 07 §3.6 |  |
| `kassenGatherRange` | 2 | 跳(節點距) | 合戰集結拉入部隊的半徑 | 07 §3.5 |  |
| `kassenMaxTicks` | 120 | tick | 合戰時限（tick上限） | 07 §3.7 |  |
| `kassenMaxUnitsPerSide` | 6 | 支 | 合戰每側部隊數上限（超過取兵數最大者） | 07 §3.5 |  |
| `kassenMinTroops` | 3000 | 人 | 合戰發動門檻（雙方合計現有兵數） | 07 §3.5 |  |
| `kassenTiebreakMult` | 1.05 | 倍率(無量綱) | 合戰時限到期攻方判勝所需的殘存戰力倍率 | 07 §3.9 |  |
| `ldrBattleFactor` | 0.004 | 係數(無量綱) | 合戰大將統率對攻擊力的係數 | 07 §3.7 |  |
| `ldrCombatFactor` | 0.01 | 係數(無量綱) | 大將統率對戰力的線性係數（統率100→戰力×2.0） | 07 §3.2 |  |
| `maxCarryDays` | 180 | 日 | 攜糧日數可調上限 | 07 §3.1 |  |
| `minCarryDays` | 10 | 日 | 攜糧日數可調下限 | 07 §3.1 |  |
| `minMarchTroops` | 100 | 人 | 出陣最小兵數 | 07 §3.1 |  |
| `moraleDefeatLoss` | 15 | 點 | 敗北（非潰走殘存部隊）士氣損失 | 07 §3.2 |  |
| `moraleEnemyLandDaily` | 1 | 點/日 | 部隊每日位於敵對勢力節點的士氣下降 | 07 §3.2 |  |
| `moraleFactorBase` | 0.5 | 係數(無量綱) | 士氣戰力係數的基底（士氣0時的下限） | 07 §3.2 |  |
| `moraleFactorDivisor` | 200 | 除數(無量綱) | 士氣戰力係數的除數（士氣100→係數1.0） | 07 §3.2 |  |
| `moraleInitBase` | 70 | 點 | 部隊初始士氣基底 | 07 §3.2 |  |
| `moraleInitLdrFactor` | 0.2 | 係數(無量綱) | 大將統率對初始士氣的加成係數 | 07 §3.2 |  |
| `moraleVictoryGain` | 10 | 點 | 野戰或合戰勝利全體參戰部隊士氣獎勵 | 07 §3.2 |  |
| `noFoodDesertionRate` | 0.05 | 比率(每日) | 部隊糧盡每日兵逃散率（向上取整） | 07 §3.13 | ⚠ E-17：07 命名；04.starvationDesertRatePerDay=0.03 須改為 0.05 |
| `noFoodMoraleDaily` | 8 | 點/日 | 部隊糧盡每日士氣下降 | 07 §3.13 |  |
| `pincerMult` | 1.3 | 乘數(無量綱) | 挾擊（2對1）時敵側承受損耗的乘數，不隨數量疊加 | 07 §3.3 |  |
| `postSiegeCastleMorale` | 50 | 點 | 落城後城士氣設定值 | 07 §3.11 |  |
| `postSiegeDurabilityRatio` | 0.3 | 比率(佔耐久上限) | 落城後耐久回復下限比 | 07 §3.11 |  |
| `postSiegeFoodKeepRatio` | 0.5 | 比率 | 落城後城內殘存兵糧留存比 | 07 §3.11 |  |
| `pursuitDamageRate` | 0.10 | 比率 | 追擊損害率（勝側Σpower，合戰潰走時減半） | 07 §3.4 |  |
| `pursuitMoraleMin` | 50 | 點(士氣) | 可參與追擊的部隊最低士氣 | 07 §3.4 |  |
| `rankTroopCap` | {500,1000,2000,3000,5000,8000} | 人 | 六階身分帶兵上限（當主視同宿老8000） | 07 §3.1 | ⚠ E-37：絕對值為最終上限；06.rankTroopBonus 刪（表 C） |
| `routDailyLossRate` | 0.08 | 比率(每日) | 潰走部隊每日折損率（向上取整） | 07 §3.4 |  |
| `routTroopRatio` | 0.2 | 比率(佔initialTroops) | 兵數潰走閾值（低於初始兵數此比例） | 07 §3.4 |  |
| `saihaiBase` | 1 | 點/tick | 采配每tick基礎累積量 | 07 §3.7 |  |
| `saihaiInit` | 5 | 點 | 合戰兩側采配初始值 | 07 §3.7 |  |
| `saihaiLdrFactor` | 0.02 | 係數(無量綱) | 側內最高統率大將對采配累積的係數 | 07 §3.7 |  |
| `saihaiMax` | 20 | 點 | 采配值上限 | 07 §3.7 |  |
| `siegeMitigationBranch` | 0.3 | 比率(城防減免) | 支城城防減免 | 07 §3.11 |  |
| `siegeMitigationMain` | 0.5 | 比率(城防減免) | 本城城防減免 | 07 §3.11 |  |
| `starvingCastleDesertionRate` | 0.03 | 比率(每日) | 城糧盡時守兵每日逃散率 | 07 §3.11 |  |
| `starvingCastleMoraleDaily` | 5 | 點/日 | 城內兵糧歸零時每日額外城士氣下降 | 07 §3.11 |  |
| `tacFireFlagDamage` | 30 | 旗力點/tick | 火矢戰法對目標陣旗力每tick額外傷害 | 07 §3.8 |  |
| `tacHealRatio` | 0.05 | 比率(佔合戰開始兵數) | 治療戰法兵數回復上限比 | 07 §3.8 |  |
| `tacticCooldownTicks` | 8（鐵砲三段10） | tick | 戰法通用冷卻時間 | 07 §3.8 |  |
| `tacVolleyDamageMult` | 1.2 | 乘數(無量綱) | 齊射戰法傷害乘數 | 07 §3.8 |  |
| `traitCombatMultCap` | 1.5 | 乘數上限(無量綱) | 野戰參戰武將特性乘數聚合後的上限 | 07 §3.3 |  |
| `valBattleFactor` | 0.008 | 係數(無量綱) | 合戰大將武勇對攻擊力的係數 | 07 §3.7 |  |

#### 外交工作信用・協定・朝廷官位・幕府役職・調略（08）（122）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `allianceMonths` | 60 | 月 | 同盟協定期限 | 08 §3.4.1 |  |
| `aweSentimentLoserHit` | 小-8/中-15/大-25 | 點(小/中/大) | 取得威風時敗方對勝方的感情下降(依威風等級) | 08 §3.3 |  |
| `aweSentimentNeighborHit` | 小-3/中-5/大-8 | 點(小/中/大) | 取得威風時勝方接壤第三勢力對勝方的感情下降(畏懼) | 08 §3.3 |  |
| `betrayalGlobalSentimentHit` | -10 | 點 | 破棄協定時所有第三勢力對破棄方的感情下降 | 08 §3.4.1 |  |
| `betrayalPrestigeHit` | 150 | 點(威信) | 破棄協定的威信懲罰(約中期大名威信兩成) | 08 §3.4.1 | ⚠ 17.betrayalPrestigePenalty=100 別名須改為 150 |
| `ceasefireLosingBonus` | +40 | 分(接受度) | B劣勢時停戰提案接受度加成 | 08 §5.6.2 |  |
| `ceasefireLosingRatio` | 0.7 | 比例(無量綱) | 判定B劣勢的國力比門檻(clanPower(B)/clanPower(A)) | 08 §5.6.2 |  |
| `ceasefireMonths` | 12 | 月 | 停戰協定期限 | 08 §3.4.1 |  |
| `ceasefireWinningPenalty` | -30 | 分(接受度) | B佔優時停戰提案接受度懲罰 | 08 §5.6.2 |  |
| `ceasefireWinningRatio` | 1.5 | 比例(無量綱) | 判定B佔優的國力比門檻(clanPower(B)/clanPower(A)) | 08 §5.6.2 |  |
| `courtFavorDecayMonthly` | 1 | 點/月 | 當月無獻金工作時朝廷友好度每月衰減(下限0) | 08 §3.5.1 |  |
| `courtFavorGainBase` | 2 | 點/月 | 朝廷友好度月增益基礎 | 08 §3.5.1 |  |
| `courtFavorGainPolDivisor` | 40 | 除數(無量綱) | 朝廷友好度增益的政務除數 | 08 §3.5.1 |  |
| `courtFavorMax` | 100 | 點 | 朝廷友好度上限 | 08 §3.5.1 |  |
| `courtMediationCeasefireMonths` | 6 | 月 | 停戰斡旋成功強制建立停戰的期限 | 08 §3.5.3 |  |
| `courtMediationCooldownMonths` | 12 | 月 | 停戰斡旋冷卻(每勢力共用,成敗皆起算) | 08 §3.5.3 |  |
| `courtMediationFailBase` | 0.1 | 機率 | 停戰斡旋失敗率基礎 | 08 §3.5.3 |  |
| `courtMediationFailMax` | 0.8 | 機率 | 停戰斡旋失敗率上限 | 08 §3.5.3 |  |
| `courtMediationFailPerRank` | 0.2 | 機率/階 | 對方官位每高我方一階增加的斡旋失敗率 | 08 §3.5.3 |  |
| `courtMediationFavorCost` | 40 | 點(朝廷友好度) | 停戰斡旋朝廷友好度成本(第6階持有者×0.75) | 08 §3.5.3 |  |
| `courtMediationGoldCost` | 500 | 貫 | 停戰斡旋金錢成本(失敗退還半額250) | 08 §3.5.3 |  |
| `courtRankTable` | 從五位下(友20/獻300/威+50)/從五位上(30/500/+80,信用×1.1)/從四位下(40/800/+120,解鎖停戰斡旋)/從四位上(50/1200/+170,政策槽+1)/從三位(60/1800/+230,從屬勸告+10)/正三位(70/2500/+300,斡旋成本×0.75)/從二位(85/3500/+400,同盟+5)/正二位(95/5000/+550,政策槽+1) | 表(八階) | 官位八階定義表(友好度需求/獻金/威信加成/解鎖效果) | 08 §3.5.2 |  |
| `courtWorkMonthlyCost` | 50 | 貫/月 | 對朝廷獻金工作月費 | 08 §3.2 |  |
| `dipAcceptThreshold` | 60 | 分(接受度門檻) | AI接受提案的分數門檻(≥60接受) | 08 §5.6.2 |  |
| `dipBaseAlliance` | 0 | 分(接受度基礎) | 同盟提案基礎分 | 08 §5.6.2 |  |
| `dipBaseCeasefire` | -10 | 分(接受度基礎) | 停戰提案基礎分 | 08 §5.6.2 |  |
| `dipBaseMarriage` | -10 | 分(接受度基礎) | 婚姻同盟提案基礎分 | 08 §5.6.2 |  |
| `dipBaseNonAggression` | 20 | 分(接受度基礎) | 不可侵條約提案基礎分 | 08 §5.6.2 | ⚠ E-23：不可侵條約降為 v1.1 擴充，v1.0 不實作（08 §1／§3.4.1）；本常數 v1.0 不進 `balance.ts` |
| `dipBaseVassalDemand` | -40 | 分(接受度基礎) | 從屬勸告提案基礎分 | 08 §5.6.2 |  |
| `dipBaseVassalOffer` | 30 | 分(接受度基礎) | 從屬提案基礎分 | 08 §5.6.2 |  |
| `dipCommonEnemyBonus` | 20 | 分(接受度) | 共同敵人時同盟提案接受度加成 | 08 §5.6.2 |  |
| `dipCommonThreatBonus` | 15 | 分(接受度) | 存在接壤雙方且強大的第三勢力威脅時同盟接受度加成 | 08 §5.6.2 |  |
| `diplomacyWorkMaxConcurrent` | 6 | 件 | 全勢力同時進行的外交工作上限 | 08 §3.2 |  |
| `diplomacyWorkMonthlyCost` | 20 | 貫/月 | 對勢力外交工作月費 | 08 §3.2 |  |
| `dipMarriageRenewBonus` | +15 | 分(接受度) | 同盟剩餘期限<12月時婚姻續盟接受度加成 | 08 §5.6.2 |  |
| `dipPowerTermClamp` | 25 | 分(接受度) | 國力項對接受度的上下限夾值(±25) | 08 §5.6.2 |  |
| `dipPowerTermScale` | 15 | 係數(分) | 國力比項(P-1)的接受度縮放係數 | 08 §5.6.2 |  |
| `dipProposalExpiryDays` | 30 | 日 | 提案存活時限,逾期視同拒絕 | 08 §3.4 |  |
| `dipRefusalCooldownMonths` | 3 | 月 | 提案被拒後同行動對同目標的冷卻期 | 08 §3.2 |  |
| `dipSentimentWeight` | 0.8 | 權重(無量綱) | 接受度公式中感情(B對A)的權重 | 08 §5.6.2 |  |
| `dipTrustWeight` | 0.6 | 權重(無量綱) | 接受度公式中信用(A在B處)的權重 | 08 §5.6.2 |  |
| `dipVassalOfferMinSentiment` | -20 | 點(感情) | 從屬提案最低感情門檻,低於則直接拒絕(score=-999) | 08 §5.6.2 |  |
| `dipVassalSiegeBonus` | +30 | 分(接受度) | B本城被圍攻時從屬勸告接受度加成 | 08 §5.6.2 |  |
| `goldCostMarriage` | 500 | 貫 | 婚姻同盟金錢成本(聘金) | 08 §3.4.1 |  |
| `marriageMaxAge` | 45 | 歲 | 適齡一門年齡上限 | 08 §3.4.1 |  |
| `marriageMinAge` | 13 | 歲 | 適齡一門年齡下限 | 08 §3.4.1 |  |
| `marriageNoBreakMonths` | 36 | 月 | 婚姻強化後不可破棄的硬鎖期 | 08 §3.4.1 |  |
| `nonAggressionMonths` | 24 | 月 | 不可侵條約期限 | 08 §3.4.1 | ⚠ E-23：不可侵條約降為 v1.1 擴充，v1.0 不實作（08 §1／§3.4.1）；本常數 v1.0 不進 `balance.ts` |
| `plotBetrayalBase` | 0.20 | 機率 | 內應成功率基礎 | 08 §3.7.3 |  |
| `plotBetrayalCostMult` | 2 | 倍率(無量綱) | 內應月費相對基礎調略月費的倍率(30×2=60) | 08 §3.7.3 |  |
| `plotBetrayalExposeLoyaltyGain` | +15 | 點(忠誠) | 內應敗露時目標城主忠誠回升 | 08 §3.7.3 |  |
| `plotBetrayalExposeSentimentHit` | -25 | 點(感情) | 內應敗露時目標勢力對我感情下降 | 08 §3.7.3 |  |
| `plotBetrayalGoldDivisor` | 4000 | 除數(無量綱) | 內應成功率的一次性投入金錢除數 | 08 §3.7.3 |  |
| `plotBetrayalImmunityMonths` | 12 | 月 | 內應敗露後該城的內應免疫期 | 08 §3.7.3 |  |
| `plotBetrayalIntDivisor` | 400 | 除數(無量綱) | 內應成功率的知略除數 | 08 §3.7.3 |  |
| `plotBetrayalLoyaltyDivisor` | 250 | 除數(無量綱) | 內應成功率的城主忠誠除數(100-忠誠) | 08 §3.7.3 |  |
| `plotBetrayalLoyaltyThreshold` | 70 | 點(忠誠) | 內應目標城主忠誠上限門檻(需<70) | 08 §3.7.3 |  |
| `plotBetrayalMarkMonths` | 12 | 月 | 內應成功後可發動標記的有效期 | 08 §3.7.3 |  |
| `plotBetrayalMinInvestGold` | 500 | 貫 | 內應最低一次性投入金錢(500/1000/2000三檔) | 08 §3.7.3 |  |
| `plotBetrayalMoraleFloor` | 5 | 點(士氣) | 內應發動後城士氣立即降至的下限值 | 08 §3.7.3 |  |
| `plotBetrayalPMax` | 0.60 | 機率 | 內應成功率上限 | 08 §3.7.3 |  |
| `plotBetrayalProgressBase` | 12 | 點/月(進度) | 內應每月進度基礎 | 08 §3.7.3 |  |
| `plotBetrayalProgressIntDivisor` | 6 | 除數(無量綱) | 內應進度增量的知略除數 | 08 §3.7.3 |  |
| `plotExposeChanceBetrayal` | 0.6 | 機率 | 內應失敗時的敗露率 | 08 §3.7.3 |  |
| `plotExposeChancePoach` | 0.5 | 機率 | 引拔失敗時的敗露率 | 08 §3.7.1 |  |
| `plotExposeChanceRumor` | 0.3 | 機率 | 流言失敗時的敗露率 | 08 §3.7.2 |  |
| `plotMaxConcurrent` | 3 | 件 | 每勢力並行調略上限 | 08 §3.7 |  |
| `plotMonthlyCost` | 30 | 貫/月 | 調略每月維持費(共通基礎) | 08 §3.7.1 |  |
| `plotPoachBase` | 0.10 | 機率 | 引拔成功率基礎 | 08 §3.7.1 |  |
| `plotPoachExposeLoyaltyGain` | +10 | 點(忠誠) | 引拔敗露時目標武將忠誠回升(警覺) | 08 §3.7.1 |  |
| `plotPoachExposeSentimentHit` | -15 | 點(感情) | 引拔敗露時目標勢力對我感情下降 | 08 §3.7.1 |  |
| `plotPoachGoldDivisor` | 2500 | 除數(無量綱) | 引拔成功率的一次性投入金錢除數 | 08 §3.7.1 |  |
| `plotPoachIntDivisor` | 300 | 除數(無量綱) | 引拔成功率的知略除數(知略-50) | 08 §3.7.1 |  |
| `plotPoachLoyaltyDivisor` | 200 | 除數(無量綱) | 引拔成功率的目標忠誠除數(100-忠誠) | 08 §3.7.1 |  |
| `plotPoachLoyaltyThreshold` | 75 | 點(忠誠) | 引拔目標武將忠誠上限門檻(需<75) | 08 §3.7.1 |  |
| `plotPoachPMax` | 0.85 | 機率 | 引拔成功率上限 | 08 §3.7.1 |  |
| `plotPoachPMin` | 0.05 | 機率 | 引拔成功率下限 | 08 §3.7.1 |  |
| `plotPoachProgressBase` | 25 | 點/月(進度) | 引拔每月進度基礎(知略100→50/月) | 08 §3.7.1 |  |
| `plotPoachProgressIntDivisor` | 4 | 除數(無量綱) | 引拔進度增量的知略除數 | 08 §3.7.1 |  |
| `plotPoachSuccessSentimentHit` | -20 | 點(感情) | 引拔成功時原主對我感情下降 | 08 §3.7.1 |  |
| `plotRumorBase` | 0.55 | 機率 | 流言成功率基礎 | 08 §3.7.2 |  |
| `plotRumorExposeSentimentHit` | -8 | 點(感情) | 流言敗露時目標勢力對我感情下降 | 08 §3.7.2 |  |
| `plotRumorIntDivisor` | 250 | 除數(無量綱) | 流言成功率的我方與反制知略差除數 | 08 §3.7.2 |  |
| `plotRumorLoyaltyHit` | 12 | 點(忠誠) | 流言(武將模式)成功時目標武將忠誠下降 | 08 §3.7.2 |  |
| `plotRumorMoraleHit` | 15 | 點(士氣) | 流言(城模式)成功時城士氣下降 | 08 §3.7.2 |  |
| `plotRumorProgressBase` | 30 | 點/月(進度) | 流言每月進度基礎 | 08 §3.7.2 |  |
| `powerKokudakaWeight` | 0.001 | 權重(無量綱) | 勢力國力公式中所轄郡石高的權重 | 08 §5.6.1 |  |
| `powerPrestigeWeight` | 0.1 | 權重(無量綱) | 勢力國力公式中威信的權重 | 08 §5.6.1 |  |
| `powerTroopsWeight` | 0.01 | 權重(無量綱) | 勢力國力公式中所轄城現有兵力的權重 | 08 §5.6.1 |  |
| `reinforceCooldownMonths` | 6 | 月 | 援軍請求冷卻(距上次請求) | 08 §3.4.1 |  |
| `sentimentAtWarMonthly` | -2 | 點/月 | 交戰中(atWar)每月感情變動 | 08 §3.3 |  |
| `sentimentBetrayalHit` | -60 | 點 | 被破棄方對破棄方的感情下降(一次性) | 08 §3.3 |  |
| `sentimentBorderTensionMonthly` | -0.5 | 點/月 | 接壤且無任何協定(邊境緊張)每月感情變動 | 08 §3.3 |  |
| `sentimentCommonEnemyMonthly` | +1 | 點/月 | 共同敵人(雙方與同一第三勢力atWar)每月感情變動 | 08 §3.3 |  |
| `sentimentDriftMonthly` | 1 | 點/月 | 無事件時感情每月向0漂移量 | 08 §3.3 |  |
| `sentimentPactSignedAlliance` | +20 | 點 | 締結同盟一次性感情加成 | 08 §3.3 |  |
| `sentimentPactSignedCeasefire` | +5 | 點 | 成立停戰一次性感情加成 | 08 §3.3 |  |
| `sentimentPactSignedMarriage` | +30 | 點 | 締結婚姻同盟一次性感情加成 | 08 §3.3 |  |
| `sentimentPactSignedNonAggression` | +10 | 點 | 締結不可侵條約一次性感情加成 | 08 §3.3 | ⚠ E-23：不可侵條約降為 v1.1 擴充，v1.0 不實作（08 §1／§3.4.1）；本常數 v1.0 不進 `balance.ts` |
| `shogunateFavorDecayMonthly` | 1 | 點/月 | 當月無獻金工作時幕府友好度每月衰減 | 08 §3.6.2 |  |
| `shogunateFavorGainBase` | 2 | 點/月 | 幕府友好度月增益基礎 | 08 §3.6.2 |  |
| `shogunateFavorGainPolDivisor` | 40 | 除數(無量綱) | 幕府友好度增益的政務除數 | 08 §3.6.2 |  |
| `shogunateTitleTable` | 奉公眾(威150/友30/獻500/威+60,事件選項)/御供眾(350/50/1000/+120,工作費用×0.8)/相伴眾(600/70/2000/+200,從屬勸告+15)/管領(900/85/3500/+300,政策槽+1)/副將軍(1200/90/5000/+400,外交接受度+10) | 表(五階) | 幕府役職五階定義表(威信/友好度門檻/獻金/威信加成/效果) | 08 §3.6.2 |  |
| `shogunateWorkMonthlyCost` | 50 | 貫/月 | 對幕府獻金工作月費 | 08 §3.2 |  |
| `shogunNominateFavorMin` | 50 | 點(幕府友好度) | 擁立將軍的最低幕府友好度門檻 | 08 §3.6.3 |  |
| `shogunNominatePrestigeGain` | 300 | 點(威信) | 擁立將軍一次性威信加成 | 08 §3.6.3 |  |
| `shogunPatronMonthlyPrestige` | 5 | 點/月(威信) | 擁立者此後每月威信加成 | 08 §3.6.3 |  |
| `shogunPatronSentimentGain` | +10 | 點 | 擁立將軍後所有勢力對擁立者一次性感情加成(敬意) | 08 §3.6.3 |  |
| `shogunPatronTitleCostMult` | 0.5 | 倍率(無量綱) | 擁立者的幕府役職獻金倍率 | 08 §3.6.3 |  |
| `trustCostAlliance` | 60 | 點(信用) | 同盟信用成本 | 08 §3.4.1 |  |
| `trustCostCeasefire` | 20 | 點(信用) | 停戰信用成本 | 08 §3.4.1 |  |
| `trustCostMarriage` | 40 | 點(信用) | 婚姻同盟信用成本 | 08 §3.4.1 |  |
| `trustCostNonAggression` | 30 | 點(信用) | 不可侵條約信用成本 | 08 §3.4.1 | ⚠ E-23：不可侵條約降為 v1.1 擴充，v1.0 不實作（08 §1／§3.4.1）；本常數 v1.0 不進 `balance.ts` |
| `trustCostReinforce` | 20 | 點(信用) | 援軍請求信用成本(盟友接受時扣除) | 08 §3.4.1 |  |
| `trustGainBase` | 2 | 點/月 | 信用月增益基礎 | 08 §5.2.1 |  |
| `trustGainPolDivisor` | 25 | 除數(無量綱) | 信用月增益的政務除數 | 08 §5.2.1 |  |
| `trustGainSentimentDivisor` | 200 | 除數(無量綱) | 信用月增益的感情倍率除數(sentM=clamp(1+感情/200,0.5,1.5)) | 08 §5.2.1 |  |
| `trustMax` | 100 | 點 | 信用上限 | 08 §3.2 |  |
| `vassalDemandPowerRatio` | 3.0 | 比例(無量綱) | 從屬勸告(強→弱)的國力比門檻(我/目標≥3.0) | 08 §3.4.1 |  |
| `vassalOfferPowerRatio` | 2.0 | 比例(無量綱) | 從屬提案(弱→強)的國力比門檻(目標/我≥2.0) | 08 §3.4.1 |  |
| `vassalTributeRate` | 0.15 | 比例(無量綱) | 從屬方每月上繳宗主的金錢收入比例 | 08 §3.4.1 | ⚠ 17 §3.4.6 之 0.1 須改為 0.15 |
| `warStateMonths` | 6 | 月 | 交戰狀態判定窗(最近敵對行為在此月數內視為atWar) | 08 §3.1 |  |

#### AI 決策・委任 AI・具申生成・難易度（09）（55）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `aiAdvanceAbortRatio` | 0.8 | 係數(戰力比) | 進軍(advance)中我方兵力÷(目標守兵+沿途敵野戰)低於此值即撤退 | 09 §3.4.3 |  |
| `aiAidScoreMin` | 0.5 | 分數(援助分) | 響應同盟援軍請求出兵所需的最低aidScore | 09 §3.4.5 |  |
| `aiAssaultRatio` | 3.0 | 係數(兵力比) | 圍城時兵力≥守兵×此值且城耐久≤半時選擇強攻的門檻 | 09 §3.4.3 |  |
| `aiAttackPowerRatioAggrBonus` | 0.6 | 係數(無量綱) | aggression對開戰所需戰力比門檻的最大減免幅度 | 09 §5.1 |  |
| `aiAttackPowerRatioBase` | 1.8 | 係數(戰力比) | 開戰所需戰力比(requiredRatio)的基準值 | 09 §5.1 |  |
| `aiBetrayLoyaltyMax` | 40 | 義理值(0..100) | 義理≥此值的勢力永不主動破棄協定 | 09 §3.4.5 |  |
| `aiBuildBudgetRatio` | 0.5 | 比例(超額金錢) | 超出儲備部分用於施設建造的預算比例 | 09 §3.4.4 |  |
| `aiConscriptSecurityMin` | 50 | 治安值(0..100) | 下達徵兵Command所需的最低所轄郡治安 | 09 §3.4.4 |  |
| `aiConsolidateDays` | 45 | 日 | 落城後鞏固(consolidate)期天數,期間佔用一個計畫槽 | 09 §3.4.3 |  |
| `aiConsolidateGarrisonRatio` | 0.5 | 比例(攻方兵力) | 落城後留駐新城的兵力比例(不超過新城最大兵力) | 09 §3.4.3 |  |
| `aiCouncilMaxPerTick` | 4 | 個(階段/tick) | 每tick最多執行的評定階段數,用於削峰;超出者順延 | 09 §3.10 |  |
| `aiCouncilPhaseCount` | 4 | 個(階段) | 單一勢力每次評定攤平成的階段數(每tick執行一階段) | 09 §3.3 |  |
| `aiCouncilSpreadTicks` | 30 | tick(日) | 評定排程攤平的tick數,各勢力councilOffset對其取模 | 09 §3.3 |  |
| `aiDefenseGarrisonRatio` | 0.6 | 係數(對敵投入兵力比) | 受威脅城守兵目標(相對預期敵方投入兵力),不足即增援 | 09 §3.4.2 |  |
| `aiDiploFearThreshold` | 1.5 | 威脅分 | 對強鄰主動求和/結盟的威脅分門檻(threat≥此值) | 09 §3.4.5 |  |
| `aiDistanceNormDays` | 10 | 日 | 擴張分數計算的距離正規化天數(distFactor基準) | 09 §5.3 |  |
| `aiExpandScoreMin` | 12 | 分數 | 建立攻略計畫所需的最低擴張分數;亦作具申出陣案需求係數基準 | 09 §3.4.3 |  |
| `aiFoodReserveDays` | 180 | 日 | 每座城兵糧安全存量目標天數(守兵×每日糧耗×天數) | 09 §3.4.4 |  |
| `aiGarrisonTargetPeace` | 0.7 | 比例(城最大兵力) | 承平時期每城守兵目標比例 | 09 §3.4.4 |  |
| `aiGarrisonTargetWar` | 0.95 | 比例(城最大兵力) | 交戰中或受威脅時每城守兵目標比例 | 09 §3.4.4 |  |
| `aiGoldReserveMonths` | 2 | 月(月收入倍數) | 金錢儲備=月收入×此倍數(建造預算基準,亦為委任AI護欄) | 09 §3.4.4 |  |
| `aiHomeGarrisonMin` | 500 | 人 | 出兵城須保留的守備兵力底線(絕對值) | 09 §3.4.3 |  |
| `aiHomeGarrisonRatio` | 0.3 | 比例(現有兵力) | 出兵城守備底線的現有兵力比例(與底線取max) | 09 §3.4.3 |  |
| `aiIntentLogSize` | 1024 | 筆(環形緩衝容量) | AI決策紀錄intentLog環形緩衝的容量 | 09 §3.11 |  |
| `aiInterceptRatioMin` | 1.1 | 係數(戰力比) | 敵軍入侵時出城攔截所需的最低戰力比(我÷敵) | 09 §3.5 |  |
| `aiKassenWinRateMin` | 0.65 | 機率 | AI主動發動合戰所需的預測勝率門檻 | 09 §3.5 |  |
| `aiMusterTimeoutDays` | 30 | 日 | 攻略計畫集結(muster)階段的逾時天數,逾時以已到兵力重檢 | 09 §3.4.3 |  |
| `aiPersonaDefault` | 50 | 點(五軸值) | 未列於persona表的勢力其五軸性格預設值(五軸皆50) | 09 §3.2 |  |
| `aiPlanPerCastles` | 8 | 座(城數) | 每N座城增加一個攻略計畫槽(maxPlans上限3) | 09 §3.4.3 |  |
| `aiPowerLdrDivisor` | 240 | 除數(無量綱) | estPower估值中統率(ldr)加成的除數(ldr120→估值×1.5) | 09 §5.2 |  |
| `aiRecallThreat` | 2.0 | 威脅分(總和) | 總威脅≥此值時中止muster/advance攻略、召回部隊回防 | 09 §3.4.2 |  |
| `aiReinforceMaxDays` | 6 | 日 | 可作為增援來源之安全城的最大行軍天數 | 09 §3.4.2 |  |
| `aiReinforceRatio` | 0.5 | 比例(現有兵力) | 單座安全城最大可抽調的增援兵力比例 | 09 §3.4.2 |  |
| `aiRewardBudgetRatio` | 0.3 | 比例(可用金錢) | 當月褒賞總支出占可用金錢(扣儲備後)的預算比例上限 | 09 §3.4.4 |  |
| `aiRewardLoyaltyThreshold` | 40 | 忠誠值(0..100) | 觸發褒賞維穩的家臣忠誠門檻(忠誠<此值) | 09 §3.4.4 |  |
| `aiSiegeFoodAbortDays` | 15 | 日 | 圍城時攜行兵糧將於此天數內耗盡且無法補給則撤退 | 09 §3.4.3 |  |
| `aiSiegeReliefMaxDays` | 8 | 日 | 集結解圍軍之來源城的最大行軍天數 | 09 §3.5 |  |
| `aiSiegeReliefRatio` | 1.2 | 係數(兵力比) | 解圍軍合計兵力達圍城敵軍×此值才出動 | 09 §3.5 |  |
| `aiStewardSecurityFloor` | 60 | 治安值(0..100) | 領主自動開發時治安<此值即排除 barracks 方針（於 agri/commerce 擇 gap 大者） | 09 §3.7.1 | ⚠ E-07（2026-07-10）：敘述對齊 09 §5.7 |
| `aiThreatAlertRatio` | 1.2 | 威脅分 | 觸發防衛部署處理的威脅分門檻(threat≥此值) | 09 §3.4.2 |  |
| `aiThreatCacheDays` | 10 | 日 | 威脅評估快取(ThreatCache)有效天數,期滿或失效事件發生時重算 | 09 §3.4.1 |  |
| `aiValueConnectivityWeight` | 2 | 權重(每街道連接數) | 城價值中節點街道連接度(degree)的權重 | 09 §5.3 |  |
| `aiValueKokudakaDivisor` | 1000 | 除數(石高) | 城價值計算中石高(kokudaka)的換算除數 | 09 §5.3 |  |
| `aiValueMainCastleBonus` | 15 | 點(價值加成) | 目標為本城(tier=main)時的城價值加成 | 09 §5.3 |  |
| `aiVassalAmbitionWeight` | 0.4 | 權重(無量綱) | AI受理從屬時的野心反向加成權重((100−ambition)×此值) | 09 §3.4.5 |  |
| `aiVassalDemandRatio` | 3.0 | 係數(戰力比) | 對弱鄰發出從屬勸告所需的戰力比(我÷彼≥此值) | 09 §3.4.5 |  |
| `aiWeaknessCap` | 3.0 | 係數(上限,無量綱) | 擴張分數中弱度(weakness)值的上限 | 09 §5.3 |  |
| `aiWeaknessEpsilon` | 100 | 兵力估值(下限) | 弱度計算分母的下限值(防除零/極小值) | 09 §5.3 |  |
| `diffAiCoopMaxCastles` | 2/3/4 | 座(城數) | 難易度:攻略計畫協同出兵城數上限(初級/中級/上級) | 09 §3.9 |  |
| `diffAiCouncilTimesPerMonth` | 1/1/2 | 次/月 | 難易度:AI每月評定頻率(上級多一次臨時軍議)(初級/中級/上級) | 09 §3.9 |  |
| `diffAiIncomeMult` | 0.8/1.0/1.2 | 乘數 | 難易度:AI勢力金錢與兵糧收入乘數(初級/中級/上級) | 09 §3.9 |  |
| `diffAiMoraleBonus` | 0/0/10 | 士氣點 | 難易度:AI部隊與城的士氣加成(上限仍100)(初級/中級/上級) | 09 §3.9 |  |
| `proposalCooldownDays` | 60 | 日 | 同一武將上次具申被採納/駁回後的具申冷卻天數 | 09 §3.8 |  |
| `proposalStatThreshold` | 70 | 能力值(0..100) | 生成具申候選所需的最高四維能力門檻 | 09 §3.8 |  |
| `proposalTopK` | 3 | 件/月 | 全勢力具申評分排序後每月送達玩家的件數 | 09 §3.8 |  |

#### 事件引擎・史實事件・大命・勝敗（10）（52）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `evtDeclareWarSentiment` | 20 | 點 | declareWar 效果操作對交戰雙方施加的感情懲罰 | 10 §3.3 |  |
| `evtHonnojiOdaCastleMin` | 25 | 城 | 本能寺之變觸發條件：織田家持城數門檻 | 10 §3.5 |  |
| `evtTransferLoyalty` | 60 | 點 | transferOfficer 移籍後武將的忠誠初值 | 10 §3.3 |  |
| `genEkibyoChance` | 0.008 | 機率/月 | 疫病事件每月的觸發機率 | 10 §3.6 |  |
| `genEkibyoCooldownDays` | 360 | 日 | 疫病事件的全域冷卻日數 | 10 §3.6 |  |
| `genEkibyoOrderLoss` | 8 | 點 | 疫病對該郡治安的減損 | 10 §3.6 |  |
| `genEkibyoPopLossPct` | 8 | % | 疫病對該郡人口的損失百分比 | 10 §3.6 |  |
| `genEkibyoSoldierLossPct` | 10 | % | 疫病對所轄城兵力的損失百分比 | 10 §3.6 |  |
| `genHarvestCooldownDays` | 300 | 日 | 豐作與凶作共用的冷卻日數（同年互斥） | 10 §3.6 |  |
| `genHosakuChance` | 0.10 | 機率 | 豐作事件每年9/1對每勢力的觸發機率 | 10 §3.6 |  |
| `genJishinChance` | 0.01 | 機率/月 | 地震事件每月的觸發機率 | 10 §3.6 |  |
| `genJishinCooldownDays` | 720 | 日 | 地震事件的全域冷卻日數 | 10 §3.6 |  |
| `genJishinDurabilityLossPct` | 20 | % | 地震對災區各城耐久的損失百分比 | 10 §3.6 |  |
| `genJishinOrderLoss` | 10 | 點 | 地震對災區各郡治安的減損 | 10 §3.6 |  |
| `genJishinPopLossPct` | 2 | % | 地震對災區各郡人口的損失百分比 | 10 §3.6 |  |
| `genKyosakuChance` | 0.10 | 機率 | 凶作事件每年9/1對每勢力的觸發機率 | 10 §3.6 |  |
| `genNanbanChance` | 0.05 | 機率/月 | 南蠻商人來航事件每月對每勢力的觸發機率 | 10 §3.6 |  |
| `genNanbanCooldownDays` | 360 | 日 | 南蠻商人事件的冷卻日數 | 10 §3.6 |  |
| `genNanbanGold` | 300 | 貫 | 南蠻商人來航允許通商時獲得的金錢 | 10 §3.6 |  |
| `genTeppoChance` | 0.04 | 機率/月 | 鐵砲商人事件每月對每勢力的觸發機率 | 10 §3.6 |  |
| `genTeppoCooldownDays` | 540 | 日 | 鐵砲商人事件的冷卻日數 | 10 §3.6 |  |
| `genTeppoCost` | 500 | 貫 | 鐵砲商人開價（亦為觸發與購買的金錢門檻） | 10 §3.6 |  |
| `taimeiBushinDays` | 180 | 日 | 天下普請的持續日數 | 10 §3.7.3 |  |
| `taimeiBushinPrestige` | 180 | 點 | 大命「天下普請」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiBushinStep` | 2 | 日/日 | 天下普請期間建設中施設每日工期的遞減量（平常為1） | 10 §3.7.3 |  |
| `taimeiCooldownDays` | 180 | 日 | 大命共用冷卻日數（自效果結束起算） | 10 §3.7.1 |  |
| `taimeiGaikoDays` | 180 | 日 | 外交攻勢的持續日數 | 10 §3.7.3 |  |
| `taimeiGaikoPrestige` | 120 | 點 | 大命「外交攻勢」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiGaikoTrustMult` | 2 | 係數(無量綱) | 外交攻勢期間我方外交工作信用累積速度的乘數 | 10 §3.7.3 |  |
| `taimeiKenkinFoodPerGold` | 5 | 石/貫 | 獻金免役每貫金錢換算的兵糧量 | 10 §3.7.3 |  |
| `taimeiKenkinGold` | 1000 | 貫 | 獻金免役附帶扣除的金錢成本（亦為驗證門檻） | 10 §3.7.3 |  |
| `taimeiKenkinPrestige` | 80 | 點 | 大命「獻金免役」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiRakuichiCommerceMult` | 2 | 係數(無量綱) | 樂市大振興期間我方各郡商業每日成長量的乘數 | 10 §3.7.3 |  |
| `taimeiRakuichiDays` | 180 | 日 | 樂市大振興的持續日數 | 10 §3.7.3 |  |
| `taimeiRakuichiPrestige` | 150 | 點 | 大命「樂市大振興」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiRankDiscountPerStep` | 50 | 點 | 官位每階對大命解鎖門檻的威信折抵 | 10 §3.7.2 |  |
| `taimeiShippuDays` | 90 | 日 | 疾風迅雷的持續日數 | 10 §3.7.3 |  |
| `taimeiShippuPrestige` | 100 | 點 | 大命「疾風迅雷」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiShippuSpeedBonus` | 0.30 | 係數(無量綱) | 疾風迅雷期間我方部隊行軍日速的加成（×(1+0.30)） | 10 §3.7.3 |  |
| `taimeiShogunateDiscount` | 200 | 點 | 幕府高位（管領/副將軍/將軍）對大命解鎖門檻的威信折抵 | 10 §3.7.2 |  |
| `taimeiSodoinCostMult` | 0.5 | 係數(無量綱) | 總動員期間徵兵金錢成本的乘數 | 10 §3.7.3 |  |
| `taimeiSodoinDays` | 90 | 日 | 總動員的持續日數 | 10 §3.7.3 |  |
| `taimeiSodoinMaxBonus` | 0.25 | 係數(無量綱) | 總動員期間單次徵兵上限的加成（×1.25） | 10 §3.7.3 |  |
| `taimeiSodoinPrestige` | 150 | 點 | 大命「總動員」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiSokujiPopRatio` | 0.02 | 比率 | 即時徵兵每城依所轄郡人口徵召的比率 | 10 §3.7.3 |  |
| `taimeiSokujiPrestige` | 100 | 點 | 大命「即時徵兵」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiTeppekiDays` | 90 | 日 | 鐵壁的持續日數 | 10 §3.7.3 |  |
| `taimeiTeppekiDefMult` | 1.2 | 係數(無量綱) | 鐵壁期間守城方防禦戰力的乘數 | 10 §3.7.3 |  |
| `taimeiTeppekiPrestige` | 130 | 點 | 大命「鐵壁」的發動威信成本 | 10 §3.7.3 |  |
| `taimeiTeppekiReduce` | 0.3 | 係數(無量綱) | 鐵壁期間我方城受攻城耐久損失的減免比例（×(1−0.3)） | 10 §3.7.3 |  |
| `victoryKokudakaSharePct` | 50 | % | 天下人勝利條件：玩家支配圈石高占全國比門檻 | 10 §3.8.1 |  |
| `victoryTenkabitoMonths` | 12 | 月 | 天下人勝利條件須連續成立的月數 | 10 §3.8.1 |  |

#### 地圖・尋路・行軍・制壓・遭遇（04）（14）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `armyDisbandSoldiers` | 100 | 人 | 兵力低於此值時部隊就地解散 | 04 §5.8 | ⚠ 廢除：潰走解散模型定案採 07 §3.4（抵我方城→併入城駐兵；全地圖無我方城→立即解散），非兵力門檻判定（四輪裁決 E-20，07 全勝） |
| `marchLowMoraleFactor` | 0.8 | 係數(無量綱) | 低士氣時套用的行軍速度乘數 | 04 §5.8 |  |
| `marchLowMoraleThreshold` | 40 | 士氣點 | 士氣低於此值時行軍減速的門檻 | 04 §5.8 |  |
| `marchSpeedMax` | 2.0 | 係數(無量綱) | 每日行軍速度係數(speedFactor)的上限夾限 | 04 §5.8 |  |
| `marchSpeedMin` | 0.5 | 係數(無量綱) | 每日行軍速度係數(speedFactor)的下限夾限 | 04 §5.8 |  |
| `retreatSpeedFactor` | 1.25 | 係數(無量綱) | 撤退或潰走時的行軍速度乘數 | 04 §5.8 | 保留：撤退／潰走共用之移動速度常數（04 movement 持有），潰走行為模型定案見 07 §3.4（四輪裁決 E-20） |
| `roadGradeSpeedMult` | 道級1:1.0/2:1.3/3:1.6 | 倍率(無量綱) | 依道路品質(道級)給出的行軍速度倍率表 | 04 §5.8 |  |
| `seaEmbarkDays` | 1 | 日 | 由陸路轉入海路(登船)時額外消耗的日數 | 04 §5.8 |  |
| `subjugateDaysBase` | 4 | 日 | 制壓一郡的基礎所需日數 | 04 §5.8 | ⚠ 17.subjugateBaseDays=5 別名須改為 4 |
| `subjugateDaysMax` | 10 | 日 | 制壓所需日數的上限夾限 | 04 §5.8 |  |
| `subjugateDaysMin` | 3 | 日 | 制壓所需日數的下限夾限 | 04 §5.8 |  |
| `subjugateKokuPerExtraDay` | 30000 | 石 | 郡石高每滿此值使制壓日數+1的規模修正 | 04 §5.8 |  |
| `subjugateLdrBonusThreshold` | 80 | 統率點 | 大將統率達此值時制壓-1日的名將加速門檻 | 04 §5.8 |  |
| `subjugateSecurityHit` | 15 | 治安點 | 制壓完成時該郡治安下降的點數 | 04 §5.8 |  |

#### 遊戲迴圈・tick・報告（03）（6）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `aiCouncilsPerTick` | 4 | 家/tick | AI 月度評定每 tick 消化的勢力家數 | 03 §3.8.2 |  |
| `aiReactiveChecksPerTick` | 8 | 家/tick | AI 反應式決策每 tick 輪詢的勢力家數 | 03 §3.8.2 |  |
| `debugSkipMaxDays` | 3600 | 日 | debug 時間跳轉單次上限日數 | 03 §3.9.2 |  |
| `maxCommandsPerTick` | 200 | 個（每 tick） | Step 1 單 tick 套用 Command 數上限 | 03 §3.3.1 |  |
| `reportRetentionDays` | 360 | 日 | 報告保留期（超過此日數即修剪） | 03 §3.4.3 |  |
| `rngWarmupDraws` | 12 | 次 | 各亂數流播種後空轉抽取次數（去除低熵種子相關性） | 03 §3.5.2 |  |

#### 核心資料模型與不變量（02）（14）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `abilityMax` | 120 | 點（能力值） | 武將四維能力（統率/武勇/知略/政務）上限 | 02 §5.7 |  |
| `commerceMaxAbs` | 2000 | 點（商業） | 商業絕對上限（郡 commerceCap 不得超過此值） | 02 §5.7 |  |
| `devInvariantCheckEveryDays` | 30 | 日（tick） | dev build 每 N tick 執行一次不變量檢查 | 02 §5.7 |  |
| `durabilityBranch` | 1000 | 點（耐久） | 支城耐久上限基準值 | 02 §5.7 |  |
| `durabilityMain` | 3000 | 點（耐久） | 本城耐久上限基準值 | 02 §5.7 |  |
| `fiefMaxByRank` | [0,1,1,2,3,4] | 郡數 | 各身分階級可受封知行郡數上限（查表） | 02 §5.7 | ⚠ E-03：名依 02 fiefMaxByRank；值採 06 序列 [0,1,1,2,3,4]；05/06 別名須改 |
| `kassenFieldH` | 16 | 格 | 合戰戰術戰場格高 | 02 §5.7 |  |
| `kassenFieldW` | 24 | 格 | 合戰戰術戰場格寬 | 02 §5.7 |  |
| `kassenMaxRounds` | 60 | 回合 | 合戰強制結束回合數 | 02 §5.7 |  |
| `maxDeputies` | 2 | 人 | 每支部隊副將數上限 | 02 §5.7 |  |
| `moraleBreakThreshold` | 30 | 點（士氣） | 部隊士氣 ≤ 此值時潰走（值定義於 07） | 02 §4.8 | ⚠ E-16：名依 02 moraleBreakThreshold；07.routThreshold/04&17.routMoraleThreshold 別名，值 30 |
| `prestigeMax` | 2000 | 點（威信） | 勢力威信上限 | 02 §5.7 |  |
| `proposalExpireDays` | 60 | 日 | 具申逾期作廢日數 | 02 §5.7 |  |
| `reportMaxKept` | 500 | 筆 | 報告（通知）保留數量上限 | 02 §5.7 | ⚠ E-31：名依 02 reportMaxKept；03.reportMaxEntries(500)/02(600) 統一為 500 |

#### 存檔・遷移・設定（16）（1）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `importFileMaxBytes` | 50_000_000 | 位元組(bytes) | 匯入存檔檔案大小上限，超過報 error.load.fileTooLarge | 16 §3.5 |  |

#### 劇本資料製作與驗證（14）（17）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `dataAnchorTolerance` | 16 | world unit | 錨點城市座標與基準值容許的偏差 | 14 §3.4 |  |
| `dataCastleMax` | 125 | 座 | 全國城數驗證上限 | 14 §3.2 |  |
| `dataCastleMin` | 115 | 座 | 全國城數驗證下限 | 14 §3.2 |  |
| `dataClanColorMinRing` | 4 | 索引環距(無量綱) | 相鄰勢力之colorIndex色盤索引的最小環距 | 14 §5.4 |  |
| `dataClanMax` | 42 | 家 | 勢力數驗證上限 | 14 §3.2 |  |
| `dataClanMin` | 38 | 家 | 勢力數驗證下限 | 14 §3.2 |  |
| `dataDistrictMax` | 370 | 個 | 全國郡數驗證上限 | 14 §3.2 |  |
| `dataDistrictMin` | 330 | 個 | 全國郡數驗證下限 | 14 §3.2 |  |
| `dataDistrictsPerCastleMax` | 4 | 個 | 每座城所轄郡數的上限 | 14 §3.2 |  |
| `dataDistrictsPerCastleMin` | 2 | 個 | 每座城所轄郡數的下限 | 14 §3.2 |  |
| `dataOfficerMax` | 650 | 名 | 具名武將數驗證上限 | 14 §3.2 |  |
| `dataOfficerMin` | 550 | 名 | 具名武將數驗證下限 | 14 §3.2 |  |
| `dataProvinceCount` | 60 | 國 | 國(令制國)數目定值 | 14 §3.2 |  |
| `dataTotalKokudakaMax` | 18500000 | 石 | 全國總石高驗證上限 | 14 §3.2 |  |
| `dataTotalKokudakaMin` | 17500000 | 石 | 全國總石高驗證下限 | 14 §3.2 |  |
| `roninPoolSize` | 40 | 名 | 開局由builder程序生成的無名浪人數量 | 14 §3.8 |  |
| `roninTraitChance` | 0.35 | 機率 | 生成浪人持有1個普通特性的機率 | 14 §3.8 |  |

#### 測試・golden・效能基準（17）（5）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `aiLowGoldThreshold` | 100 | 貫 | AI 勢力轉為保守決策的低金錢門檻 | 17 §3.4.8 |  |
| `allianceTrustMin` | 60 | 信用點 | 提出並被接受同盟所需的最低信用 | 17 §3.4.6 |  |
| `betrayalTrustPenaltyOthers` | 20 | 信用點 | 破約後其他所有勢力對背叛者的信用扣減 | 17 §3.4.6 |  |
| `trustPerWorkMonth` | 3 | 信用點/月 | 外交工作每月累積的信用 | 17 §3.4.6 |  |
| `vassalPrestigeGap` | 500 | 威信點 | 小勢力接受從屬所需的威信差 | 17 §3.4.6 |  |

#### UI 畫面相關（11，多屬非模擬層）（2）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `armyMaxSubOfficers` | 2 | 個(槽) | 部隊副將槽位數（建議初值；正式定義見 plan/07） | 11 §3.6 |  |
| `battleSaihaiMax` | 100 | 點(采配) | 合戰采配上限（回復速率見 plan/07） | 11 §3.11.1 |  |

#### 基石（00）（1）

| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
| `soldiersPerKoku` | ≈0.025 | 兵/石 | 每 1 石可養之常備兵數（1 萬石≈250 常備兵） | 00 §6 |  |

### 5.2 值定案與別名併入

> **命名一律以 19 §3.13（E-01…E-56）為準**；本節固定「值」並登記別名併入，與該勘誤表對應。

#### 表 A — 同名異值衝突的值定案（15 項）

| 常數（依 19 §3.13 名） | 候選值（出處） | 定案值 | 理由 | E 編號 / 待改 |
|---|---|---|---|---|
| `directDevFactor` | 0.8（05）/ 0.6（17） | **0.8** | 05 為開發擁有者 | 17 §3.4.2 |
| `fiefLoyaltyBonus` | 5（05）/ 10（17） | **5** | 05 為知行擁有者；與 06.loyaltyFiefBonus 重疊見表 C | 17 |
| `goldPerCommerce` | 0.1（05）/ 0.5（17） | **0.1** | 17 之 0.5 使月收入超標 5 倍（例算二） | 17 §3.4.1 |
| `harvestRate` | 0.3（05）/ 0.8（17） | **0.3** | 0.8 破壞例算一糧食平衡 | 17 §3.4.1 |
| `maxTraitsPerOfficer` | 4（02）/ 3（06） | **4** | E-05：容納 E-06 追加戰法解鎖特性 | E-05；06 §3.3 |
| `aweLargeKillRatio` | 0.7（07）/ 0.6（17） | **0.7** | 07 為威風擁有者 | 17 §3.4.4 |
| `fieldFoodPerSoldierDaily` | 0.02（07）/ 0.005（04）/ 0.006（17）/ 0.3石·月⁻¹（05） | **0.02** | E-14：07 為軍事真相來源；四源統一（表 B） | E-14；04、05、17 |
| `vassalTributeRate` | 0.15（08）/ 0.1（17） | **0.15** | 08 為外交擁有者 | 17 §3.4.6 |
| `rankSalary` | [3,6,10,15,22,30]（06）/ salaryByRank[2,4,7,12,20,30]（05） | **[3,6,10,15,22,30]** | E-04：名統一 rankSalary；05 為別名 | E-04；05 §3.1.4 |
| `rankTroopCap` | 絕對值 500..8000（07）/ 06 rankTroopBonus % | **500..8000（絕對值即最終上限）** | E-37：rankTroopBonus 刪（表 C） | E-37；06 §3.4.2 |
| `reportMaxKept` | 600（02）/ reportMaxEntries 500（03） | **500** | E-31：名依 02，值取 03 之 500 | E-31；03、02 §5.7 |
| `poachedInitialLoyalty` | 45（06）/ plotPoachInitialLoyalty 60（08） | **45** | E-33：名依 06；值 45（略高於捕虜 40，仍具流動風險） | E-33；08 §3.7.1 |
| `unpaidSalaryLoyaltyPenalty` | 2（06）/ 3（05 unpaidSalaryLoyaltyHit）/ 2（17 deficitLoyaltyPenalty） | **2** | 06 為忠誠擁有者；餘為別名 | 05 §3.1.4、17 §3.4.1 |
| `moraleBreakThreshold` | 30（07 routThreshold）/ 20（17 routMoraleThreshold）/ 未給（02 名） | **30** | E-16：名依 02，值取 07 之 30 | E-16；02、04、17 |
| `uprisingThreshold` | 30（05）/ 未給（02、11 別名） | **30** | 05 為治安擁有者 | 02、11 |

（另：`fiefMaxByRank`＝**[0,1,1,2,3,4]**（E-03，名依 02、值採 06）；`aweCastleMoraleHit`＝**20**、`aweMedKillRatio`＝**0.5**、
`rankMeritThresholds`＝**[0,300,800,1600,3000,5000]**、`subjugateDaysBase`＝**4**、`betrayalPrestigeHit`＝**150**——皆以擁有文件值定案，17 之別名須改，見表 B。）

#### 表 B — 同義／重名常數併入（廢棄別名 → 定案常數；名稱依 19 §3.13）

| 廢棄別名（文件現況） | 出處 | 併入的定案常數 | 定案值 | 說明 |
|---|---|---|---|---|
| `lowSecurityThreshold` = 20 | 17 §3.4.2 | `(刪除：05 無低治安抑制開發機制)` | — | 低於此治安即抑制開發成長的門檻 |
| `stewardPolWeight` = 0.01 | 17 §3.4.2 | `(刪除：05 用 effectivePol×devPolFactor)` | — | 領主政務值對開發加成的權重 |
| `lowSecurityDevFactor` = 0.5 | 17 §3.4.2 | `(刪除：同上；如採此機制須先於 05 §3.2.3 定義)` | — | 治安過低時開發成長的抑制乘數 |
| `garrisonPopRatio` = 0.08 | 02 §5.7 | `(刪除：城最大兵力採 05 maxSoldiers 公式；徵兵率用 soldiersPerPop 0.025)` | — | 城最大兵力 = 所轄郡人口和 × 此係數 |
| `aweSmallKillRatio` = 0.3 | 17 §3.4.4 | `(刪除：小威風＝任意合戰勝利，無門檻)` | — | 判定小威風的殲滅比門檻 |
| `siegeReliefMoraleBonus` = 20 | 17 §3.4.5 | `(刪除：援軍解圍為停止下降、無加成；07 §3.11/T12)` | — | 援軍解圍時守城士氣加成(上限100) |
| `upkeepGoldPerSoldierMonth` = 0.01 | 17 §3.4.1 | `(刪除：無每兵金錢維持費；05 §3.1.4 僅俸祿+政策)` | — | 每兵每月的兵力維持費 |
| `deficitMoralePenalty` = 5 | 17 §3.4.1 | `(刪除：赤字僅扣忠誠 unpaidSalaryLoyaltyPenalty，不扣城士氣)` | — | 赤字時全城士氣懲罰 |
| `devDailyBase` = 0.05 | 17 §3.4.2 | `(刪除：開發以 05 §3.2.3 三屬性模型為準)` | — | 每日基礎開發度成長率 |
| `devCap` = 100 | 17 §3.4.2 | `(刪除：開發度為 02 §5.1 衍生 developmentPct 0..100)` | — | 郡開發度上限 |
| `marchBaseSpeed` | 05 §3.6 | `(非常數：04 以 edge.baseDays / roadGradeSpeedMult 計)` | — | 已廢棄；05 §3.6 已改以 04 baseDays 模型＋BAL.transportSpeedFactor 表述（2026-07-10） |
| `allianceDays` = 1800 | 17 §3.4.6 | `allianceMonths` | 60 | 同盟協定自然存續天數 |
| `autosaveEveryMonths` = 1 | 03 §3.9.1 | `autoSaveIntervalMonths` | 3 | 自動存檔頻率（每 N 個月） |
| `aweMoraleHit` = 15 | 17 §3.4.4 | `aweCastleMoraleHit` | 20 | 威風擴散對範圍內敵城的士氣扣減 |
| `aweMediumKillRatio` = 0.45 | 17 §3.4.4 | `aweMedKillRatio` | 0.5 | 判定中威風的殲滅比門檻 |
| `betrayalPrestigePenalty` = 100 | 17 §3.4.6 | `betrayalPrestigeHit` | 150 | 對盟友破約宣戰時自身的威信懲罰 |
| `facilitySlotsBranch` = 3 | 02 §5.7 | `branchCastleSlots` | 3 | 支城城下施設 slot 數 |
| `ceasefireDays` = 360 | 17 §3.4.6 | `ceasefireMonths` | 12 | 停戰協定生效、禁止對該勢力出陣的天數 |
| `commerceCap` = 2000 | 17 §3.4.2 | `commerceMaxAbs` | 2000 | 郡商業值上限 |
| `defectionChancePerMonth` = 0.1 | 17 §3.4.7 | `defectionChancePerPoint` | 0.01 | 低忠誠武將每月出奔的判定機率 |
| `defectionLoyaltyThreshold` = 30 | 17 §3.4.7 | `defectionThreshold` | 30 | 低於此忠誠即觸發出奔判定的門檻 |
| `diploWorkGoldPerMonth` = 20 | 17 §3.4.6 | `diplomacyWorkMonthlyCost` | 20 | 執行外交工作的每月花費 |
| `siegeMoraleDecayPerDay` = 0.5 | 17 §3.4.5 | `encircleCastleMoraleDaily` | 2 | 圍城持續時守城每日士氣衰減 |
| `siegeFoodFactor` = 2 | 17 §3.4.5 | `encircleFoodMult` | 2.0 | 被包圍時守城兵糧消耗的倍率 |
| `fiefLimitByRank` = 足輕組頭1/足輕大將1/侍大將2/部將3/家老4/宿老5 | 05 §3.3.1 | `fiefMaxByRank` | [0,1,1,2,3,4] | 依身分計的知行(受封郡)數量上限表 |
| `rankFiefCap` = 組頭0/足輕大將1/侍大將1/部將2/家老3/宿老4 | 06 §3.4.2 | `fiefMaxByRank` | [0,1,1,2,3,4] | 各身分階知行郡數上限表 |
| `armyFoodPerSoldierDay` = 0.006 | 17 §3.4.1 | `fieldFoodPerSoldierDaily` | 0.02 | 出陣部隊每兵每日兵糧消耗 |
| `armyFoodPerSoldierPerDay` | 04 §5.8 | `fieldFoodPerSoldierDaily` | 0.02 | 每兵每日兵糧消耗量(此檔僅列參考值0.005,定義權在07、 |
| `marchFoodPerSoldierMonthly` | 05 §3.1.3 | `fieldFoodPerSoldierDaily` | 0.02 | 出陣部隊每人每月兵糧消耗(07 定義,本文件註明建議 0.3 |
| `castleFoodPerSoldierDaily` | 07 §3.11 | `garrisonFoodPerSoldierMonthly` | 0.1 | 城兵每日基準糧耗（定義於05，本文件僅引用作為包圍消耗基準） |
| `garrisonFoodPerSoldierDay` = 0.002 | 17 §3.4.1 | `garrisonFoodPerSoldierMonthly` | 0.1 | 城駐軍每兵每日兵糧消耗 |
| `battleMinSoldiers` = 3000 | 17 §3.4.4 | `kassenMinTroops` | 3000 | 可發動合戰的雙方最低合計兵力 |
| `battleTickMs` = 500 | 03 §3.7.2 | `kassenTickMs` | 800 | 合戰子迴圈 tick 間隔 |
| `dismissLoyaltyPenalty` = 15 | 05 §3.3.3 | `loyaltyReduceFief` | 15 | 罷免領主時被罷免者的一次性忠誠懲罰 |
| `facilitySlotsMain` = 6 | 02 §5.7 | `mainCastleSlots` | 6 | 本城城下施設 slot 數 |
| `routMoraleThreshold` = 20 | 17 §3.4.3 | `moraleBreakThreshold` | 30 | 部隊或野戰一方士氣降至此值即潰走 |
| `routThreshold` = 30 | 07 §3.4 | `moraleBreakThreshold` | 30 | 士氣潰走閾值 |
| `surrenderMoraleThreshold` = 30 | 17 §3.4.5 | `moraleBreakThreshold` | 30 | 包圍糧盡時守城開城的士氣門檻 |
| `starvationAttritionRate` = 0.05 | 17 §3.4.3 | `noFoodDesertionRate` | 0.05 | 糧盡部隊每日兵力減損率 |
| `starvationDesertRatePerDay` = 0.03 | 04 §5.8 | `noFoodDesertionRate` | 0.05 | 兵糧耗盡後每日兵力逃亡比例 |
| `starvationMoraleLossPerDay` = 8 | 04 §5.8 | `noFoodMoraleDaily` | 8 | 兵糧耗盡後每日士氣流失量 |
| `starvationMoralePerDay` = 10 | 17 §3.4.3 | `noFoodMoraleDaily` | 8 | 糧盡部隊每日士氣扣減 |
| `tickBudgetMs` = 8 | 03 §3.8 | `perfTickBudgetMs` | 8 | 單 tick core 計算預算 |
| `plotPoachInitialLoyalty` = 60 | 08 §3.7.1 | `poachedInitialLoyalty` | 45 | 引拔成功後移籍武將的初始忠誠 |
| `maxActivePolicies` = 4 | 02 §5.7 | `policySlotMax` | 6 | 同時生效政策數上限 |
| `meritRankThresholds` = [0, 500, 1500, 3500, 7000, 12000] | 17 §3.4.7 | `rankMeritThresholds` | [0,300,800,1600,3000,5000] | 各身分升格所需累積功績的閾值陣列 |
| `salaryByRank` = 足輕組頭2/足輕大將4/侍大將7/部將12/家老20/宿老30 | 05 §3.1.4 | `rankSalary` | [3,6,10,15,22,30] | 依身分計的家臣月俸祿表(當主與受封領主全免) |
| `rankTroopBonus` = 組頭0/足輕大將0.10/侍大將0.20/部將0.30/家老0.40/宿老0.50 | 06 §3.4.2 | `rankTroopCap` | {500,1000,2000,3000,5000,8000} | 各身分階帶兵上限加成比例表 |
| `reportMaxEntries` = 500 | 03 §3.4.3 | `reportMaxKept` | 500 | 報告總量上限（超量時先丟最舊的 info、再 warning |
| `garrisonStarvationMoralePerDay` = 3 | 17 §3.4.1 | `starvingCastleMoraleDaily` | 5 | 城兵糧耗盡時駐軍每日士氣扣減 |
| `subjugateBaseDays` = 5 | 17 §3.4.3 | `subjugateDaysBase` | 4 | 制壓敵郡完成所需的基礎停留天數 |
| `successionLoyaltyShock` = 15 | 17 §3.4.7 | `successionLoyaltyShockFudai/Tozama` | （見主表） | 當主死亡繼承時全家臣的忠誠衝擊 |
| `tickMsX1` = 600 | 03 §5.5 | `uiDayMsX1` | 600 | ×1 速度每日毫秒數 |
| `tickMsX2` = 300 | 03 §5.5 | `uiDayMsX2` | 300 | ×2 速度每日毫秒數 |
| `tickMsX5` = 120 | 03 §5.5 | `uiDayMsX5` | 120 | ×5 速度每日毫秒數 |
| `maxTicksPerFrame` = 4 | 03 §3.1 | `uiMaxTicksPerFrame` | 4 | 單一 frame 最多補跑 tick 數，超過即丟棄累積毫秒 |
| `deficitLoyaltyPenalty` = 2 | 17 §3.4.1 | `unpaidSalaryLoyaltyPenalty` | 2 | 赤字時全勢力武將的忠誠懲罰 |
| `unpaidSalaryLoyaltyHit` = 3 | 05 §3.1.4 | `unpaidSalaryLoyaltyPenalty` | 2 | 俸祿未足額時當月全體武將的一次性忠誠懲罰 |
| `securityRiotThreshold` = 30 | 11 §3.5 | `uprisingThreshold` | 30 | 治安一揆危險門檻；≤此值時 UI 轉朱紅顯示「一揆危險」（機 |
| `uprisingOrderThreshold` | 02 §4.6 | `uprisingThreshold` | 30 | 郡治安低於此值有一揆（暴動）風險（值定義於 05） |

#### 表 C — 機制重疊裁決

| 機制 | 重疊來源 | 裁決 | E / 待改 |
|---|---|---|---|
| 帶兵上限 | 07 `rankTroopCap`（絕對值） vs 06 `rankTroopBonus`（%） | 上限**直接為** `rankTroopCap[rank]`；`rankTroopBonus` 刪 | E-37；06 §3.4.2 |
| 領主知行忠誠加成 | 05 `fiefLoyaltyBonus=5`+`fiefLoyaltyPerDistrict=3` vs 06 `loyaltyFiefBonus=10` | 採 05 分級式（`5+3×受封郡數`），於 06 忠誠管線內計；06 平坦常數廢 | 06 §3.6.1 |
| 引拔（poach）模型 | 06 `poachEligibleLoyalty=40`（受理端）/ 08 `plotPoachLoyaltyThreshold=75`（發動門檻）；初始忠誠雙名 | E-33：**兩端併存**——發動門檻依 08（<75 可下達）、受理加權依 06（分母 40）；初始忠誠統一 `poachedInitialLoyalty=45` | E-33；06、08 |
| 收回知行忠誠懲罰 | 05 `dismissLoyaltyPenalty=15` vs 06 `loyaltyReduceFief=15` | E-53：統一走 06 `loyaltyReduceFief`；05 改引用；`loyaltyDismiss` 僅役職解任 | E-53；05 §3.3.3 |
| 出陣/行軍/野戰食糧 | 04/05/07/17 四源 | 統一 07 `fieldFoodPerSoldierDaily=0.02`；05 收支預覽月額改 `0.02×30=0.6`（原註 0.3 誤）；07 §3.11 圍城基準改引 `garrisonFoodPerSoldierMonthly/30` | E-14/E-15；04、05、07 |
| 城糧盡雙路徑 | 05 一般糧盡（`starveDesertRate=0.01`，另有未命名「城士氣−2」） vs 07 圍城糧盡（`starvingCastleDesertionRate=0.03`、`starvingCastleMoraleDaily=5`） | 互斥：圍城中走 07、不套 05；且 05 未命名的「城士氣每日−2」**新增為** `castleStarveMoraleDaily=2` 補入 `balance.ts` | 05 §3.1.3（新增常數） |
| 政策同時生效數 | 02 `maxActivePolicies=4` 固定 vs 05 `min(6,1+floor(威信/300))` 動態 | E-38：依 05 動態制，`policySlotMax=6` 為硬上限；02 固定制廢 | E-38；02 §5.7 |
| 速度節奏毫秒 | 01 `uiDayMsX1/2/5`… vs 03 `tickMsX1/2/5`… 重複 | 採 01（迴圈驅動擁有者）之名，且**非模擬**（表 D）；03 同義常數改引 01 | 03 §3.1/§5.5 |
| 城最大兵力 | 05 `maxSoldiers`（城格基礎 本1000/支500 + floor(Σpop×`soldiersPerPop` 0.025)×政策係數，含兵舍 +500） vs 02 §5.1 selector `castleMaxSoldiers` 用 `garrisonPopRatio`(0.08) | 採 05 `maxSoldiers` 為唯一公式（0.025 由 00 §6 校準；0.08 給每萬人 800 兵違反目標）；`garrisonPopRatio` 刪，02 selector 改引 05 公式 | 02 §5.1/§5.7 |
| 17 專屬不存在機制常數 | 17 §3.4 之 `upkeepGoldPerSoldierMonth`(每兵金錢維持費)、`deficitMoralePenalty`(赤字扣城士氣)、`siegeReliefMoraleBonus`(解圍士氣加成)、`devDailyBase/devCap/stewardPolWeight/lowSecurityThreshold/lowSecurityDevFactor`(替代開發模型) 在 05/07 正文皆無對應機制 | 一律刪除（見表 B）：金錢支出僅俸祿+政策（05 §3.1.4）、赤字僅扣忠誠、解圍為停止下降（07 T12）、開發採 05 §3.2.3 三屬性＋02 developmentPct 衍生 | 17 §3.4.1/2/3/5 |

#### 表 D — 非模擬層常數（35 項；文件以 `BAL.*` 書寫，實作**不進** `balance.ts`）

| 常數（文件中以 `BAL.*` 標示，實際不入 `balance.ts`） | 值 | 單位 | 語意 | 出處 |
|---|---|---|---|---|
| `perfFontKb` | 2048 | KB | 子集字型檔（woff2, gzip）大小上限 | 01 §3.9.1 |
| `perfFpsTarget` | 60 | fps | 地圖幀率目標 | 01 §3.9.1 |
| `perfInitialLoadBudgetMs` | 3000 | 毫秒(ms) | 初次載入至可互動的時間預算 | 01 §3.9.1 |
| `perfMainBundleKb` | 800 | KB | 初始 JS（gzip，三 chunk 合計）大小上限 | 01 §3.9.1 |
| `perfScenarioKb` | 1200 | KB | 劇本 JSON（gzip）大小上限 | 01 §3.9.1 |
| `perfTickBudgetMs` | 8 | 毫秒(ms) | 每日 tick 結算時間預算（95 百分位） | 01 §3.9.1 |
| `uiDayMsX1` | 600 | 毫秒/遊戲日 | ×1 速度檔位每遊戲日對應的毫秒數 | 01 §3.5.2 |
| `uiDayMsX2` | 300 | 毫秒/遊戲日 | ×2 速度檔位每遊戲日對應的毫秒數 | 01 §3.5.2 |
| `uiDayMsX5` | 120 | 毫秒/遊戲日 | ×5 速度檔位每遊戲日對應的毫秒數 | 01 §3.5.2 |
| `uiDprMax` | 2 | 倍率(無量綱) | Pixi resolution／devicePixelRatio 取用上限 | 01 §3.6.1 |
| `uiFrameDtCapMs` | 250 | 毫秒(ms) | 單幀 dt 上限，防切回分頁／GC 停頓後補跑暴衝 | 01 §3.5.2 |
| `uiIdleFps` | 10 | fps | 暫停且鏡頭靜止 ≥1 秒時 Pixi ticker 降頻目標 | 01 §3.9.4 |
| `uiJumpChunkDays` | 30 | 日 | debug 時間跳轉每批推進的天數 | 01 §5.4 |
| `uiMaxTicksPerFrame` | 4 | 個(tick)/幀 | 單幀最多結算 tick 數，超出則丟棄多餘累積 | 01 §3.5.2 |
| `kassenTickMs` | 800 | 毫秒(ms) | 合戰UI每tick推進時長（可隨速度檔位縮放） | 07 §3.7 |
| `aiTickBudgetMs` | 4 | 毫秒 | AI步驟(tick第11步)的軟預算,僅供debug面板監測顯示不影響行為 | 09 §3.10 |
| `saveSlotCount` | 12 | 個(槽) | 存讀檔面板（SaveLoadPanel）槽位數 | 11 §3.13 |
| `uiDoubleClickMs` | 300 | 毫秒(ms) | 地圖雙擊判定窗（雙擊城＝直接開城面板） | 11 §5 |
| `uiEventTextSpeedMsPerChar` | 18 | 毫秒/字 | 事件打字機每字顯示毫秒 | 11 §5 |
| `uiMarchFoodDefaultExtraDays` | 30 | 日 | 出陣兵糧預設值的緩衝日數 | 11 §5 |
| `uiMarchFoodStep` | 100 | 石 | 出陣編成兵糧 slider 刻度 | 11 §5 |
| `uiMarchSoldierStep` | 100 | 人 | 出陣編成兵數 slider 刻度 | 11 §5 |
| `uiReportPageSize` | 50 | 筆/頁 | 報告中心每頁筆數 | 11 §5 |
| `uiToastDurationMs` | 8000 | 毫秒(ms) | toast 自動淡出時間（critical 不適用） | 11 §5 |
| `uiToastMaxVisible` | 5 | 張 | 同時顯示 toast 上限，溢出者僅入報告中心 | 11 §5 |
| `autoSaveIntervalMonths` | 3 | 月 | 自動存檔間隔（每季首日，3/1、6/1、9/1、12/1） | 16 §3.4 |
| `autoSaveRetryMax` | 1 | 次 | 自動存檔遇配額錯誤時的重試次數上限 | 16 §3.10 |
| `autoSaveSlots` | 3 | 個(槽) | 自動存檔槽數（auto:1…auto:3，輪替用） | 16 §3.3 |
| `manualSaveSlots` | 10 | 個(槽) | 手動存檔槽數（manual:1…manual:10） | 16 §3.3 |
| `quickSaveSlots` | 1 | 個(槽) | 快速存檔槽數（quick:1） | 16 §3.3 |
| `saveCompressedMaxBytes` | 15_000_000 | 位元組(bytes) | 單檔壓縮後拒存門檻，超過則拒絕寫入並報 error.save.tooLarge | 16 §3.2 |
| `saveCompressedWarnBytes` | 3_000_000 | 位元組(bytes) | 單檔壓縮後警告門檻，超過則 console.warn 並照常寫入 | 16 §3.2 |
| `uiScaleMax` | 1.5 | 倍率(無量綱) | UI 縮放（--ui-scale）上限 | 16 §3.8 |
| `uiScaleMin` | 0.8 | 倍率(無量綱) | UI 縮放（--ui-scale）下限 | 16 §3.8 |
| `uiScaleStep` | 0.05 | 倍率(無量綱) | UI 縮放調整步進 | 16 §3.8 |

### 5.3 平衡目標鏈驗證（四例算）

> 例算採本主表定案值。結論：四項目標皆達成，未觸發改值。

#### 例算一：10 萬石大名維持 3,000 野戰兵 6 個月不斷糧（00 §6 目標 2）

- **可徵兵力**：`soldiersPerPop=0.025`、劇本郡人口 ≈ 郡石高 → 10 萬石 ≈ 10 萬人口 → 常備上限 ≈ 2,500；
  以徵兵方針「高」（`conscriptPolicyFactor=1.8`）短期動員可達約 3,000（超出常備、以人口透支換取，合 00 §6「約 3,000」語意）。
- **6 個月（180 日）野戰糧耗**：`3,000 × fieldFoodPerSoldierDaily(0.02) × 180 = 10,800 石`。
- **同期在城駐兵糧耗**（留守 2,000 兵）：`2,000 × garrisonFoodPerSoldierMonthly(0.1) × 6 = 1,200 石`。
- **同期秋收**：年秋收 `= Σkokudaka × harvestRate(0.3) = 100,000 × 0.3 = 30,000 石/年` → 半年約 **15,000 石**。
- **收支**：半年糧需 `10,800 + 1,200 = 12,000 石` < 半年秋收 15,000 石 ＋ 期初存糧。→ **成立**，留約 25% 餘裕；
  野戰糧耗（0.6 石/人/月）為在城（0.1）之 6 倍，構成「養兵便宜、用兵昂貴」張力。
- **攜糧循環**：預設攜糧 `defaultCarryDays(60)` → 一次攜 `3,000×0.02×60=3,600 石`，6 個月需約 3 次補給（05 輸送），使兵站成戰略變數。**結論：`fieldFoodPerSoldierDaily=0.02` 定案。**

#### 例算二：織田 1560 開局月收支表（00 §6 目標 4；資料源 14 §3.5）

織田開局（14）：石高 310,000（尾張 8 郡全直轄）、3 城（清洲本城＋那古野/犬山支城）、駐兵 4,900、金 2,000 貫、糧 12,000 石、武將 30、清洲已建「市」。

| 項目 | 算式（定案值） | 月額 |
|---|---|---|
| 金錢收入 | Σ直轄郡 commerce(≈2,500) × `goldPerCommerce(0.1)`，清洲轄郡再 ×`(1+facMarketIncomeBonus 0.15)` | ≈ **+260 貫/月** |
| 家臣俸祿 | 約 20 名支薪（當主與受封領主免），均階 ≈ 8 貫 | ≈ −160 貫/月 |
| 政策維持 | 開局 0–1 項 | ≈ −20 貫/月 |
| **月淨金錢** | | **≈ +80 貫/月**（薄，期初 2,000 貫緩衝） |
| 秋收（9/1，年） | `310,000 × harvestRate(0.3)` | +93,000 石/年（各城 cap 60k/30k，無溢出） |
| 駐兵糧耗 | `4,900 × garrisonFoodPerSoldierMonthly(0.1)` | −490 石/月（年 ≈5,880，遠低於秋收） |

- **判讀**：現金極緊、糧食豐沛——重現戰國「富米貧錢」，逼使玩家發展商業換現金。今川（67 萬石、6 城、駐兵 9,900、金 3,500、糧 24,100）
  月收入與秋收約織田 2 倍，合 1:2.16 石高比與「今川強、織田需以桶狹間翻盤」張力。**結論：`goldPerCommerce=0.1`、`harvestRate=0.3` 定案。**

#### 例算三：5,000 對 4,000 野戰逐日推演（00 §6 目標 3 之戰場節奏）

雙方同質：大將統率 70（`ldrCombatFactor 0.01`→×1.7）、初始士氣 75、`troopTypeFactor 1.0`、無地利/挾擊/特性修正。
`power = 兵數 × 1.7 × (0.5+士氣/200)`；`日損 = 敵Σpower × fieldCombatDailyLossRate(0.04)`；士氣：損失比例高側 −`fieldMoraleDailyLose(4)`、低側 +`fieldMoraleDailyWin(2)`；潰走：士氣 ≤ `moraleBreakThreshold(30)` 或 兵數 < 0.2×初始。

| 日 | A 兵(士氣) | B 兵(士氣) | A 日損 | B 日損 |
|---|---|---|---|---|
| 1 | 5000(75) | 4000(75) | 238 | 298 |
| 3 | 4547(79) | 3415(67) | 194 | 277 |
| 5 | ≈4180(83) | ≈2880(59) | ≈160 | ≈255 |
| 8 | ≈3760(89) | ≈2180(47) | ≈120 | ≈225 |
| 11 | ≈3450(95) | ≈1560(**35**) | ≈95 | ≈200 |
| 12 | ≈3360(97) | ≈1370(**31→潰走**) | — | 追擊 |

- **結果**：B（4,000）於約第 12 日士氣破 30 而潰走；A 保約 3,360 兵（≈67%）；B 殲滅比 ≈0.66 > `fieldAweKillRatio(0.6)` → A 得**威風・小**；隨後 `pursuitDamageRate(0.10)` 追擊。
- **判讀**：25% 兵力優勢＋同質 → 約 12 日果決決出、勝方保七成。既非瞬殺（鼓勵集中兵力）又足夠果決。**結論：野戰常數定案。**

#### 例算四：包圍 vs 強攻落城日數（00 §6 目標 3 之攻城節奏）

攻方 5,000 兵、統率 70、士氣 80 → `atkPower = 5000×1.7×0.9 = 7,650`。
支城（`durabilityBranch=1000`、`siegeMitigationBranch=0.3`、守兵 1,000、城主統率 60、城士氣 100、存糧 3,000）：`守方power=1000×1.6×1.3=2,080`。

| 模式 | 落城主因與算式 | 落城日 | 攻方兵損 |
|---|---|---|---|
| 強攻 | 守兵損 = `Σatk 7,650 × assaultDefenderLossRate(0.008) ≈ 61/日` → 守兵 1,000 於 **≈16 日**歸零（早於耐久 47 日、城士氣 100 日） | **≈16 日** | 攻方日損 = `守方power×assaultAttackerLossRate(0.05)`，隨守兵遞減 → 累計 **≈830** |
| 包圍 | 需 `Σatk ≥ 守兵×encircleRatio(3.0)=3,000`（✓）。城士氣 100/`encircleCastleMoraleDaily(2)` = **50 日**歸零（存糧撐約 450 日非瓶頸） | **≈50 日** | 攻方日損 = `守方power×encircleAttackerLossRate(0.005)=10.4/日`×50 → **≈520** |

- **本城**（`durabilityMain=3000`、`siegeMitigationMain=0.5`、守兵 2,600）：單一 5,000 軍強攻攻方日損早期達 312、易先崩 → **本城強攻須多軍疊加**；包圍則城士氣 50 日必落，為穩健路徑。
- **判讀**：強攻快（16 日）但貴（≈830）；包圍慢（50 日）但省（≈520）——清晰的速度／兵損權衡；配合內應（08 `plotBetrayalMoraleFloor=5`，城士氣直接降至下限）與合戰威風翻轉鄰郡，支撐「15–25 年統一」。**結論：攻城常數定案。**

### 5.4 難易度修正主表（09 §3.9；只作用於 AI 勢力）

`getDifficultyMods(state): { incomeMult, moraleBonus, councilTimes, coopMax }`。難易度**永不改玩家規則**（00 §11）。

| 常數 | 初級 easy | 中級 normal | 上級 hard | 作用點 |
|---|---|---|---|---|
| `diffAiIncomeMult` | 0.8 | 1.0 | 1.2 | AI 勢力金錢/秋收乘數 |
| `diffAiMoraleBonus` | 0 | 0 | +10 | AI 部隊/城初始士氣加成（點） |
| `diffAiCouncilTimesPerMonth` | 1 | 1 | 2 | AI 每月評定次數（上級第二次於第 `(councilOffset+15)%30+1` 日） |
| `diffAiCoopMaxCastles` | 2 | 3 | 4 | AI 協同出兵可抽調我方城數上限 |

- 設計取捨（09 §8-D10）：上級以「加倍評定＋更高協同」施壓，而非另寫更聰明的 AI。存檔記錄難易度（16）；玩家勢力四項恆為中級基準。

### 5.5 成長曲線表

#### 表 E — 身分升格功績門檻（`rankMeritThresholds`；06 §3.4.1，累積不歸零）

| 階 | rankIndex | Rank | 繁中名 | 升至此階所需功績 |
|---|---|---|---|---|
| 1 | 0 | `ashigaruKumigashira` | 足輕組頭 | 0（起始） |
| 2 | 1 | `ashigaruTaisho` | 足輕大將 | 300 |
| 3 | 2 | `samuraiTaisho` | 侍大將 | 800 |
| 4 | 3 | `busho` | 部將 | 1,600 |
| 5 | 4 | `karo` | 家老 | 3,000 |
| 6 | 5 | `shukuro` | 宿老 | 5,000 |

#### 表 F — 身分特權（06 §3.4.2；升格一次一階，須玩家/AI 下 `CmdPromoteRank`）

| 身分 | 可任城主 | 可任軍團長 | 知行上限 `fiefMaxByRank` | 月俸祿 `rankSalary`（貫） | 帶兵上限 `rankTroopCap`（人，絕對值） |
|---|---|---|---|---|---|
| 足輕組頭 | 否 | 否 | 0 | 3 | 500 |
| 足輕大將 | 否 | 否 | 1 | 6 | 1,000 |
| 侍大將 | 可 | 否 | 1 | 10 | 2,000 |
| 部將 | 可 | 否 | 2 | 15 | 3,000 |
| 家老 | 可 | 可 | 3 | 22 | 5,000 |
| 宿老 | 可 | 可 | 4 | 30 | 8,000 |

- `fiefMaxByRank` 名依 02（E-03）、值採 06 序列 `[0,1,1,2,3,4]`（足輕組頭不可受封）；`rankTroopBonus` 廢（E-37）。

#### 表 G — 朝廷官位獻金階梯（`courtRankTable: CourtRankDef[]`；08 §3.5.2）

| 階 | id | 官位 | 友好度需求 | 獻金（貫） | 威信加成 | 解鎖 |
|---|---|---|---|---|---|---|
| 1 | `ju5ge` | 從五位下 | 20 | 300 | +50 | — |
| 2 | `ju5jo` | 從五位上 | 30 | 500 | +80 | 外交信用增益 ×1.1 |
| 3 | `ju4ge` | 從四位下 | 40 | 800 | +120 | 解鎖停戰斡旋 |
| 4 | `ju4jo` | 從四位上 | 50 | 1,200 | +170 | 政策槽 +1 |
| 5 | `ju3` | 從三位 | 60 | 1,800 | +230 | 從屬勸告接受度 +10 |
| 6 | `sho3` | 正三位 | 70 | 2,500 | +300 | 斡旋友好度成本 ×0.75 |
| 7 | `ju2` | 從二位 | 85 | 3,500 | +400 | 同盟接受度 +5 |
| 8 | `sho2` | 正二位 | 95 | 5,000 | +550 | 政策槽再 +1（累計 +2） |

- 官位階集合與前綴以 19 §3.13 E-25 為準（依 02 八階，`crank.` 前綴廢除、enum 值即識別符）；友好度以獻金工作累積（08 §3.5.1）。

#### 表 H — 幕府役職獻金階梯（`shogunateTitleTable: ShogunateTitleDef[]`；08 §3.6.2）

| 階 | id | 役職 | 威信需求 | 友好度 | 獻金（貫） | 威信加成 | 效果 |
|---|---|---|---|---|---|---|---|
| 1 | `hokoshu` | 奉公眾 | 150 | 30 | 500 | +60 | 幕府事件額外選項 |
| 2 | `otomoshu` | 御供眾 | 350 | 50 | 1,000 | +120 | 外交/獻金工作月費 ×0.8 |
| 3 | `shobanshu` | 相伴眾 | 600 | 70 | 2,000 | +200 | 從屬勸告接受度 +15 |
| 4 | `kanrei` | 管領 | 900 | 85 | 3,500 | +300 | 政策槽 +1（須控京都城或為擁立者） |
| 5 | `fukushogun` | 副將軍 | 1,200 | 90 | 5,000 | +400 | 大義名分：所有外交接受度 +10（須擁立將軍） |

- 役職集合以 19 §3.13 E-26 為準（依 02，`stitle.` 前綴廢除）。

#### 表 I — 開發報酬遞減與威信來源（速查）

- **開發遞減**：`diminish = 1 − (當前值/上限)^devDiminishExp(2)`；月額 `= 有效政務 × devPolFactor(0.6) × weight × scale × 管理係數 × 政策施設乘數`；
  scale：石高 1.0、商業 `devScaleCommerce(0.4)`、人口 `devScalePop(3.0)`；管理：直轄 `directDevFactor(0.8)`、受封 `fiefDevBonus(1.25)`。
- **威信主要來源**：合戰威風（`awePrestigeSmall/Med/Large`=10/25/50）、官位（表 G，+50…+550）、役職（表 H，+60…+400）、
  大命（`taimei*Prestige` 80–180）、擁立將軍（`shogunNominatePrestigeGain 300`+`shogunPatronMonthlyPrestige 5`/月）、破約（`betrayalPrestigeHit −150`）；上限 `prestigeMax=2000`（對齊 00 §6）。

### 5.6 平衡驗證方法：`tools/simulate.ts`

無頭跑核心狀態機 N 年，輸出各家石高曲線 CSV。**只依賴 `src/core/`**（不載 React/Pixi）。

```typescript
// tools/simulate.ts — 用法：tsx tools/simulate.ts --years=20 --seed=42 --out=sim.csv [--difficulty=normal] [--nPlayers=0]
// 1. 以 s1560 劇本 + 種子建 GameState；nPlayers=0 表全 AI 託管（含原玩家勢力）。
// 2. 迴圈 core.advanceDay() 共 years×360 次；不下任何玩家 Command（純 AI 演化）。
// 3. 每月 1 日抽樣：每家 clanId、總石高、城數、兵力、金錢、威信、存亡。
// 4. 輸出寬表 CSV（row=年月，col=各家石高）＋ summary.json。
interface SimOptions { years: number; seed: number; out: string; difficulty: 'easy'|'normal'|'hard'; nPlayers: 0|1; sampleEveryDays: number; }
interface SimSummary {
  seed: number; years: number;
  survivingClans: number;                 // 期末存活勢力數
  maxClanKokudaka: number;                // 期末最大勢力石高
  yearOfFirst2MKoku: number | null;       // 首度有勢力達 200 萬石之年（null=未達）
  odaSurvivedYears: number;               // 織田存活年數（0=開局即亡）
  top3: { clanId: string; kokudaka: number }[];
}
```

**判讀準則**（跑 ≥ 20 個種子取分布）：

1. **收斂性**：20 遊戲年內應有 AI 勢力達 ≈ 200 萬石（`yearOfFirst2MKoku` 中位數 12–20 年）；普遍 > 25 年 → 擴張太慢（`subjugateDaysBase`↓ 或 `fieldCombatDailyLossRate`↑ 或 AI 積極度↑）；< 10 年 → 太快。
2. **織田非必亡**：全 AI 演化下織田 20 年存活率 > 40%；接近 0 → 開局今川壓力過大，回查例算二/四常數。
3. **多極性**：期末 `survivingClans` 中位數 ≥ 3；常態剩 1 或 > 15 皆失衡。
4. **無爆量/歸零**：石高、金錢不得 NaN/負值/單月暴增 >2×（抓量綱錯誤）。
5. **決定論**：同 `(seed, difficulty)` 兩次跑出的 CSV 逐格相同（呼應 17 golden test）。

CI 於 M9 跑固定 5 種子 `simulate` 冒煙，斷言準則 4、5 與 `yearOfFirst2MKoku ≤ 25`。

---

## 6. UI/UX

不適用：本文件為數值彙整與驗證，無畫面、互動或字串。平衡相關 UI（收支預覽、兵力/糧食面板）見 05 §6、11；除錯用時間跳轉與 `DebugFlags` 見 01 §3.11、03 §3.9。

---

## 7. 實作任務清單

- [ ] **T1 建立 `src/core/balance.ts`**：依 §4.1 結構，把 §5.1 主表全部 536 項模擬層常數寫入單一 `readonly` `BAL`（`as const`）。
  - 驗收：§5.1 每列在 `BAL` 有對應鍵、值一致；`tsc` 通過；core 內無魔術數字（grep）。
- [ ] **T2 落實表 B/C 的併入與改名**：依 19 §3.13 刪除 60 項別名，全 core 引用改為定案名。
  - 驗收：全 repo grep 不到表 B 左欄別名；`rankTroopBonus`/`loyaltyFiefBonus`/`salaryByRank` 等已移除。
- [ ] **T3 新增 `castleStarveMoraleDaily=2`**（表 C）並將 05 §3.1.3「城士氣每日−2」改為引用。
- [ ] **T4 非模擬常數歸位**（§4.3、表 D）：35 項 UI/效能/節奏/存檔常數移出 `balance.ts`（存檔改 16 `SAVECFG.*`）。
  - 驗收：`balance.ts` 不含表 D 任一常數；速度節奏由 01 統一，03 不再重複。
- [ ] **T5 建立 `tools/simulate.ts`**（§5.6）並跑 20 種子基準；五項判讀準則全過；決定論重放一致。
- [ ] **T6 回寫來源文件 §8**：表 A/B/C 每項在被改文件 §8 記錄；與 19 §3.13 對應之 E 編號並存；不得改 00。

---

## 8. 設計決策記錄

- **D1（2026-07-07）值歸 15、名歸 19 §3.13**：00 §11 定 BAL 值以 15 為準；常數名的跨文件統一則以 19 §3.13 勘誤表為準
  （其正確套用 00>02 優先序，把重名常數收斂到 02 或機制擁有文件）。本文件不另做命名裁決，避免與 19 產生第二命名真相。
- **D2（2026-07-07）17-testing 自訂常數群讓位權威常數**：17 §3.4 一批測試撰寫期的獨立命名/數值
  （`meritRankThresholds`、`aweMoraleHit`、`armyFoodPerSoldierDay`、`defectionLoyaltyThreshold`…，見表 B）為 golden 暫用值，非權威；改引主表定案並重建快照。
- **D3（2026-07-07）食糧三源統一 `fieldFoodPerSoldierDaily=0.02`（E-14）**：04（0.005）/17（0.006）/05（月 0.3）互斥。取 07 之 0.02，
  例算一顯示其使「6 個月不斷糧」為有意義而可承受的約束（半年野戰糧耗佔秋收 72%），並與在城 0.1/月 形成 6 倍張力。05 收支預覽月額改 0.6（原註 0.3 誤）。
- **D4（2026-07-07）帶兵上限採絕對值、廢 `rankTroopBonus`（E-37）**；**知行忠誠加成採 05 分級式、廢 06 平坦 `loyaltyFiefBonus`**（表 C）。
- **D5（2026-07-07）引拔兩端併存（E-33）**：發動門檻依 08 `plotPoachLoyaltyThreshold(75)`、受理加權依 06 `poachEligibleLoyalty(40)`；
  初始忠誠統一 `poachedInitialLoyalty=45`（低於 08 原 60，使被引拔者仍具流動風險，與捕虜 40 拉開一階）。此為修正首版「08 取代 06」判斷後之定案。
- **D6（2026-07-07）城糧盡雙路徑互斥並補命名（表 C）**：非圍城糧盡（05）與圍城糧盡（07）不同日重複套用；05 未命名的「城士氣每日−2」補為 `castleStarveMoraleDaily=2`。
- **D7（2026-07-07）`maxTraitsPerOfficer=4`（E-05）**：02 之 4 > 06 之 3，取 4 以容納 E-06 追加之戰法解鎖特性。
- **D8（2026-07-07）非模擬常數不進 `balance.ts`（E-56 等）**：UI 節奏/效能/縮放/存檔槽等 35 項歸 app/設定/建置/`SAVECFG.*`；清除 01 與 03 速度節奏毫秒重複。
- **D9（2026-07-07）四例算全達標、未觸發改值**：例算一~四驗證食糧、開局經濟、野戰、攻城節奏皆符合 00 §6；定案值即各擁有文件建議值（除衝突項）。若 M9 `simulate` 分布顯示偏差，於此續記。
- **D10（2026-07-07）主表含全部 631 名稱**：536 模擬層（§5.1）＋35 非模擬（表 D）＋60 別名（表 B）＝631，與 plan/ 全文 `grep BAL.` 去重數一致。
- **D11（2026-07-10，02 樞紐定案回寫；E-36）**：表 B `marchBaseSpeed` 列說明改為「已廢棄；05 §3.6 已改以 04 baseDays 模型＋
  `BAL.transportSpeedFactor` 表述」——行軍唯一權威模型定案為日數累加器（`path`/`pathCursor`/`posNodeId`/`edgeProgressDays`/`edgeCostDays`，
  02／04），`marchBaseSpeed` 非常數、`edgeProgress(0..1)` 已廢；本檔僅改該列敘述，`roadGradeSpeedMult`、`transportSpeedFactor` 等既有常數值不動。
- **D12（2026-07-10，02 樞紐定案回寫；E-07）**：`aiStewardSecurityFloor` 語意欄由「一律採治安優先方針」修正為「排除 `barracks` 方針
  （於 `agri`/`commerce` 擇 gap 大者）」，對齊 09 §5.7／§3.7.1 之 `pickDevFocus` 實際邏輯（`DevelopFocus` 第三值裁定為 `barracks`）；常數值 60 不動。
- **D13（2026-07-10，02 樞紐定案回寫；E-27／E-29 掃描）**：全檔 grep `donateCourt`／`CmdDonateCourt`／舊指令名，未發現殘留引用；
  `courtWorkMonthlyCost`（08 §3.2）、`courtFavorGainBase`/`courtFavorDecayMonthly`（08 §3.5.1）等獻金相關常數之敘述本即採「持續工作制」
  （對應 `CmdStartDiploWork{target:'court', executorId}`，月費固定查 BAL 常數、無 `goldPerMonth` 玩家自訂欄；E-27 尾），無需修正；`rewardGoldSmall/Medium/LargeCost`、`rewardGoldSmall/Medium/LargeLoyalty`
  （06 §3.8.1）三檔命名與數值本即對應 `CmdRewardOfficer{tier:'small'|'medium'|'large'}` 三檔制，無需修正；未發現語意已不成立之一次性獻金專用常數。
- **D14（2026-07-10，08 外交大改回寫；E-23／E-27 尾）**：不可侵條約（`nonAggression`）依 E-23 降為 v1.1 擴充、v1.0 不實作，
  四項相關常數 `dipBaseNonAggression`／`nonAggressionMonths`／`sentimentPactSignedNonAggression`／`trustCostNonAggression`
  於 §5.1 主表原列處加註「v1.0 不進 `balance.ts`」，僅標記狀態、數值不動（保留供 v1.1 沿用；536 項模擬層常數中此 4 項標記
  v1.1、v1.0 實際寫入 `balance.ts` 為 532 項，631 名稱總數不變）；
  `courtRankTable`（從二位解鎖）與 §5.5 表 G 第 7 階（`ju2`）之敘述由「同盟不可侵+5」更正為「同盟+5」，`dipCommonEnemyBonus`
  說明去「不可侵/」，對齊 08 §1／§3.4.1／§5.6.2 僅同盟提案適用；D13 `CmdStartDiploWork` 引用一併去 `goldPerMonth`
  （改列 `executorId`），對齊 E-27 尾「固定月費查 BAL 常數、不由玩家自訂投入額」裁決。
- **D15（2026-07-10，E-25 官位階名對齊 02 收尾）**：§5.1 主表 `courtRankTable` 內嵌之官位階名序列
  第 3~8 階原為「正五位下／從四位下／從四位上／正四位下／從三位／正一位」，與 02 §3.3／§3.10 `CourtRank`
  八階 enum（`ju4ge`=從四位下／`ju4jo`=從四位上／`ju3`=從三位／`sho3`=正三位／`ju2`=從二位／`sho2`=正二位）
  錯位；依 E-25 定案「依 02（§3.10 表）」，將該序列階名統一為 02 序列（**數值、解鎖效果、階序不動**，逐階值仍依表 G）。
  §5.5 表 G（`courtRankTable: CourtRankDef[]`）之階名先前已隨 E-25 對齊 02（`ju5ge…sho2`），本次無需再改、與主表一致。
  故 15 兩處官位階名現皆為 02 權威序列。
- **D16（2026-07-11，六員驗證修復）**：①§5.1 主表 `shogunateTitleTable` 內嵌役職名序列為 E-26 修正前舊集合
  （御供眾／御相伴眾／管領代），與 02 §3.3 `ShogunateTitle` enum 及 §5.5 表 H 現行序列（奉公眾／御供眾／相伴眾／管領／副將軍）
  錯位；依 E-26 定案改為表 H 序列（**數值、門檻、效果、階序不動**），表 H 先前已對齊、無需再改。②表 F 標題之
  `PromoteRankCommand` 更正為 `CmdPromoteRank`（06 §3.4.2／02 §4.18 現行名）。③D14 計數用語補限定：536 項模擬層常數中
  不可侵條約相關 4 項標記 v1.1、v1.0 實際寫入 `balance.ts` 為 532 項（631 名稱總數不變）；D14 「`courtRankTable`
  （從三位解鎖）與官位表 8-1 第 7 階（`ju2`）」之自相矛盾語更正為「（從二位解鎖）與 §5.5 表 G 第 7 階（`ju2`）」
  （同盟+5 效果掛於從二位 `ju2` 第 7 階，非從三位 `ju3` 第 5 階；「官位表 8-1」非本文件既有編號，改引現行 §5.5 表 G）。
  ④`betrayalMoraleHit`（07 §3.11）標 ⚠ 廢棄，內應效果單一真相改採 08 `plotBetrayalMoraleFloor`（四輪裁決 B）。
  ⑤依四輪裁決 E-20（07 潰走模型全勝）：`armyDisbandSoldiers`（04 §5.8）標 ⚠ 廢除（潰走僅於抵我方城或全地圖無城時解散，
  非兵力門檻）；`retreatSpeedFactor`（04 §5.8）保留並補註為 returning／routed 共用之移動速度常數。
  ⑥核實 `noFoodDesertionRate`（07 §3.13，見 §5.1）「向上取整」敘述與 07 §3.13／§5.4 之 `ceil()` 一致，本檔無需修正
  （04 §5.4 現存 `floor()` 敘述與 07 之 `ceil` 不一致，屬 04 檔待修事項，回報 04，不逕改）。以上僅涉命名/敘述/標記，
  常數數值、階序、解鎖效果一律不動。

*本文件依 00 §13 撰寫；繁體中文（台灣慣用語）；無 TBD。定案值即實作值，唯一寫入 `src/core/balance.ts`；命名依 19 §3.13。*
