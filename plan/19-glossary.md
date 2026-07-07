# 19 — 完整術語對照表（Glossary）

> 本文件是《天下布武》全案**繁體中文用語、日文原詞、英文、代碼識別符**的單一真相來源（00 §7）。
> 依 `plan/00-foundations.md`（下稱 00）§13 規範撰寫；以 00 §14 種子表為基礎擴充至全部術語。
> 規格衝突優先序：`00 > 02 > 15 > 各系統文件（03~10、16）> UI 文件（11~13）`；
> 本文件的「代碼識別符」欄一律採優先序較高文件的定案（衝突明細見 §3.13 勘誤清單）。

---

## 1. 目的與範圍

本文件提供：

1. **主術語對照表**（§3.2~§3.4）：全部遊戲概念的「繁中定稿用語／日文原詞（新生用語）／英文／
   代碼識別符／首次定義文件」五欄對照，依領域分節。
2. **具名清單全表**（§3.5~§3.11）：30 特性、12 戰法、12 政策、16 城下施設、8 大命、
   8 官位、幕府役職、六階身分、全部畫面與元件名稱。
3. **易錯繁簡字與日文新字體對照警示表**（§3.12）：38 組正誤字形對照，供撰寫與資料製作時查對。
4. **用語風格決定**（§3.1）：日文漢字術語保留與改寫原則、數字與單位寫法。
5. **全 plan 文件術語不一致勘誤清單**（§3.13）：跨文件比對發現的全部衝突，附建議定案，
   供修正階段（00 §0 規則 5）使用。

**不在**本文件範圍：UI 字串主表（`plan/13-i18n-strings.md`）、BAL 常數定案值
（`plan/15-balance.md`）、簡體字掃描器的實作（`plan/17-testing.md`）。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | §14 種子表為本文件母體；本文件不得與 00 衝突，僅擴充。 |
| `plan/02-data-model.md` | 代碼識別符（實體名、欄位名、enum 值、ID 前綴）以 02 為準；本文件照錄並標注來源。 |
| `plan/05-domestic.md`~`plan/10-events-and-victory.md` | 具名清單（政策／施設／特性／戰法／大命／官位）的機制語意屬各該文件；本文件只收名稱與識別符。 |
| `plan/11-ui-screens.md` / `plan/12-ui-components.md` | 畫面與元件名稱來源。 |
| `plan/13-i18n-strings.md` | 本文件的繁中定稿用語即 13 之 `term.*` 字串的正字依據。 |
| `plan/14-scenario-data.md` | 劇本資料 `name` 欄位的正字以本文件 §3.1／§3.12 為準；V10 掃描規則之字元清單需與 §3.12 對齊。 |
| `plan/17-testing.md` | 簡體字／新字體掃描黑名單（L1~L3）需涵蓋 §3.12 全部誤字形。 |

---

## 3. 設計細節

### 3.1 用語風格決定（canonical）

#### 3.1.1 日文漢字術語「保留原詞」原則

以下情形**保留日文漢字詞原樣**（僅轉為繁體字形），不譯為現代中文：

1. **制度・身分詞**：知行、具申、元服、一揆、大名、當主、家督、家老、宿老、足輕、侍大將、
   部將、一門、譜代、外樣、浪人、俸祿、褒賞、加封、減封、出奔、寄騎（未用亦同理）。
2. **軍事詞**：出陣、合戰、野戰、攻城、籠城、後詰、采配、本陣、備（陣）、兵糧、兵站、
   軍團、制壓、調略、引拔、流言、內應、威風。
3. **內政・經濟詞**：石高、檢地、樂市樂座、關所、傳馬、目安箱、五人組、兵農分離、城下、
   湊、藏、砦、鍛冶場、南蠻。
4. **朝廷・幕府詞**：上洛、敘任、官位、役職、將軍、管領、御供眾、獻金、斡旋、大命。

理由：戰國語感是核心體驗支柱（00 §1.3 第 5 條）；這些詞在台灣的歷史遊戲圈已是通行語彙。

#### 3.1.2 改寫原則

1. **字形一律轉繁體**：日文新字體逐字轉為繁體正字（戦→戰、抜→拔、様→樣、対→對、図→圖），
   對照表見 §3.12。**遊戲內任何顯示文字（含專有名詞資料）不得出現新字體。**
2. **假名詞、和語動詞改寫為繁中詞**：引き抜き→引拔；裏切り→內應（機制名）／倒戈（敘述）；
   噂→流言；手切れ→斷交（敘述用，非機制名）；取次→使者（敘述用）。
3. **含假名的混合詞取漢字化通名**：足軽組頭→足輕組頭；侍大将→侍大將。
4. **現代 UI 動詞用台灣慣用語**：儲存／讀取（不用「保存／読込」）、載入、設定、確定、取消、
   關閉、刪除、匯出／匯入、覆蓋。
5. **系統詞用台灣軟體慣用語**：滑鼠、點擊、拖曳、捲動、視窗、面板、頁籤、快捷鍵、載入畫面。
6. **不音譯**：不使用片假名音譯詞的華語音譯（如「卡桑」）；合戰即合戰。

#### 3.1.3 數字與單位寫法（canonical，承 00 §9）

| 規則 | 寫法 | 反例（禁止） |
|---|---|---|
| 千分位 | `12,500石`、`3,000兵` | `12500石`、`3千石` |
| 單位緊貼數字、不空格 | `800貫`、`120日`、`45%` | `800 貫`、`45 %` |
| 日期 | `1560年5月3日`（不補零） | `1560/05/03`、`永祿三年` |
| 大數的敘述性顯示 | 敘述文與總覽卡可用「萬」：`31萬石`（= 310,000 石）；表格與明細一律全數字 | `31万石` |
| 百分比 | UI 顯示整數 `%`：`成功率約 62%`；公式內以 0..1 小數表示 | `六成二` |
| 範圍 | `10..180`（規格）／`10〜180日`（UI） | `10-180日`（易誤認負號） |
| 正負變化量 | `+8`、`−15`（UI 用全形負號「−」U+2212 或「-」統一由 12 定案，規格文件用 −） | `-−15` |
| 遊戲內時長 | 以「日／月／年」；1 月恆 30 日、1 年恆 360 日（00 §5.1） | 以真實毫秒描述遊戲內時間 |

#### 3.1.4 i18n term key 規約（承 02 §6）

enum 顯示字串 key 為 `term.<enumName>.<value>`（enum 名 camelCase、value 原樣），
例：`term.rank.samurai-taisho = "侍大將"`、`term.aweLevel.large = "威風・大"`。
專有名詞（人名、城名、郡名、國名、勢力名、街道名）放資料 `name` 欄，**不進 i18n**（00 §8）。

#### 3.1.5 本文件表格欄位說明

- **日文原詞**欄：《信長之野望・新生》語彙或戰國史通行日文詞，**以繁體字形轉寫**並附羅馬字
  （避免新字體混入本文件；理由見 §8 D2）。與繁中定稿完全同形時仍列出羅馬字。
- **代碼識別符**欄：TypeScript 識別符／enum 值／ID 前綴，衝突時採 §3.13 優先序定案。
- **首次定義**欄：該術語機制語意的單一真相來源文件與章節。

### 3.2 主術語對照表（一）：實體、地理、資源、時間

#### 3.2.1 實體與地理

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 勢力／大名家 | 大名家（daimyo-ke） | clan / daimyo family | `Clan`／`ClanId`＝`clan.*` | 00 §4／02 §4.3 |
| 當主 | 當主（toshu） | clan leader | `Clan.leaderId` | 00 §14／06 §3.4.3 |
| 武將 | 武將（busho） | officer | `Officer`／`OfficerId`＝`off.*` | 00 §4／02 §4.4 |
| 城 | 城（shiro） | castle | `Castle`／`CastleId`＝`castle.*` | 00 §4／02 §4.5 |
| 本城 | 本城（honjo） | main castle | `CastleTier`＝`'main'` | 00 §14／02 §3.3 |
| 支城 | 支城（shijo） | branch castle | `CastleTier`＝`'branch'` | 00 §14／02 §3.3 |
| 城格 | 城格（jokaku…等級） | castle tier | `Castle.tier: CastleTier` | 00 §4 |
| 郡 | 郡（kori） | district | `District`／`DistrictId`＝`dist.*` | 00 §4／02 §4.6 |
| 國 | 國（kuni） | province（顯示分組） | `Province`／`ProvinceId`＝`prov.*` | 00 §4／02 §4.7 |
| 街道（邊） | 街道（kaido） | road edge | `RoadEdge`／`RoadEdgeId`＝`road.*` | 00 §4／02 §4.7 |
| 陸路 | 陸路（rikuro） | land route | `RoadKind`＝`'land'` | 02 §3.3／04 §3.4 |
| 海路 | 海路（kairo） | sea route | `RoadKind`＝`'sea'` | 02 §3.3／04 §3.4.3 |
| 港郡 | 湊（minato）之郡 | port district | `District.isPort`（04 引入，02 待收錄） | 04 §3.4.3 |
| 地圖節點 | —（設計語） | map node（城∪郡） | `MapNodeId = CastleId \| DistrictId` | 00 §4／02 §3.2 |
| 地方（九地方） | 地方（chiho） | region | `Region`＝`'tokai'`…`'tohoku'`（9 值） | 02 §3.3／14 §3.2 |
| 京都所在城 | 京（kyo）・二條御所 | capital castle | `scenario.court.capitalCastleId` | 08 §3.6.3 |
| 家紋 | 家紋（kamon） | clan crest | `Kamon`（幾何 SVG 資料驅動） | 11 §3.15.2 |
| 世界座標 | —（設計語） | world coordinates | `pos: {x, y}`（0..4096） | 00 §8／04 §3.2 |

#### 3.2.2 資源與數值（承 00 §6）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符（單位） | 首次定義 |
|---|---|---|---|---|
| 金錢 | 金錢／金（kane） | gold | `Clan.gold`（貫，勢力層級） | 00 §6 |
| 兵糧 | 兵糧（hyoro） | food / provisions | `Castle.food`／`Army.food`（石，存於城） | 00 §6 |
| 兵力 | 兵（hei） | soldiers | `soldiers`（人） | 00 §6 |
| 石高 | 石高（kokudaka） | agricultural output | `District.kokudaka`（石／年） | 00 §6 |
| 商業 | 商業（shogyo） | commerce | `District.commerce`（點 0..2000） | 00 §6 |
| 人口 | 人口（jinko） | population | `District.population`（人） | 00 §6 |
| 治安 | 治安（chian） | public order | `District.publicOrder`（點 0..100） | 00 §6／02 §4.6 |
| 耐久 | 耐久（taikyu） | durability | `Castle.durability`（點） | 00 §6 |
| 士氣 | 士氣（shiki） | morale | `morale`（點 0..100，部隊／城） | 00 §6 |
| 威信 | 威信（ishin） | prestige | `Clan.prestige`（點 0..2000） | 00 §6 |
| 功績 | 功績（koseki） | merit | `Officer.merit`（點，累積） | 00 §6／06 §3.5 |
| 忠誠 | 忠誠（chusei） | loyalty | `Officer.loyalty`（點 0..100） | 00 §6／06 §3.6 |
| 信用 | 信用（shinyo） | trust | `trustAtoB`／`trustBtoA`（點 0..100） | 00 §6／08 §3.2 |
| 感情 | 感情（kanjo） | sentiment | `sentimentAtoB`／`sentimentBtoA`（點） | 02 §4.11／08 §3.3 |
| 朝廷友好度 | 朝廷友好度 | court favor | `CourtState.courtFavor`（點 0..100） | 02 §4.12／08 §3.5.1 |
| 統率 | 統率（tosotsu） | leadership | `Officer.ldr`（1..120） | 00 §6 |
| 武勇 | 武勇（buyu） | valor | `Officer.val`（1..120） | 00 §6 |
| 知略 | 知略（chiryaku） | intellect | `Officer.int`（1..120） | 00 §6 |
| 政務 | 政務（seimu） | politics | `Officer.pol`（1..120） | 00 §6 |
| 開發度 | 開發（kaihatsu）度 | development % | `developmentPct(d)`（衍生值 0..100） | 02 §5.1 |
| 潛力上限 | —（設計語） | development cap | `kokudakaCap`／`commerceCap`／`populationCap` | 02 §4.6 |
| 城最大兵力 | —（設計語） | garrison cap | `castleMaxSoldiers(c)`（衍生值） | 02 §5.1 |
| 兵糧容量 | —（設計語） | food capacity | `castleFoodCap(c)`（衍生值，05 公式） | 02 §5.1／05 §3.1.2 |

#### 3.2.3 時間與主迴圈

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 日／tick | 一日（ichinichi） | day / tick（1 tick＝1 日） | `TimeState.day`（絕對日，0＝1560/1/1） | 00 §5.1／02 §4.2 |
| 月 | 月（tsuki，恆 30 日） | month | `TimeState.month`（1..12） | 00 §5.1 |
| 季節 | 季節（kisetsu） | season | `Season`＝`'spring'\|'summer'\|'autumn'\|'winter'` | 00 §5.1／02 §3.3 |
| 秋收 | 收穫（shukaku） | autumn harvest（9/1） | `economy.harvest`（GameEvent） | 00 §5.1／05 §3.1.2 |
| 月初 | 月初（tsukisho） | month start | `time.monthStart`（GameEvent） | 02 §4.19 |
| 速度檔位 | —（設計語） | game speed | 暫停／×1／×2／×5（UI 層，非 Command） | 00 §5.2 |
| 自動暫停 | —（設計語） | auto pause | `AutoPauseReason` | 00 §5.2／03 §3.4.2 |
| 每日 tick 順序 | —（設計語） | daily system order | `advanceDay()` 13 步 | 00 §5.4／03 §3.2 |
| 決定論 | 決定論 | determinism | 同（劇本,種子,Command）→同狀態 | 00 §5.5 |
| 亂數流 | —（設計語） | RNG streams | `rng.battle/dev/ai/event/misc`（mulberry32） | 00 §5.5／03 §3.5 |

### 3.3 主術語對照表（二）：內政、武將、軍事

#### 3.3.1 內政（語意見 05）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 知行 | 知行（chigyo） | fief（分封郡給武將） | `fief`；`CmdGrantFief`＝`'grantFief'` | 00 §14／05 §3.3 |
| 領主 | 領主（ryoshu） | steward（受封郡的武將） | `District.stewardId` | 00 §14／05 §3.3 |
| 城主 | 城主（joshu） | castle lord | `Castle.lordId`；`CmdAppointLord` | 00 §14／02 §4.5 |
| 直轄 | 直轄（chokkatsu） | direct control | `directControl: true`；`stewardId: null` | 00 §14 |
| 委任 | 委任（inin） | delegated（AI 代管） | `directControl: false` | 00 §14／09 §3.7 |
| 開發重點 | 方針（hoshin） | develop focus | `DevelopFocus`＝`'agri'\|'commerce'\|'security'` | 02 §3.3（勘誤 E-07） |
| 城下施設 | 城下施設（jokashisetsu） | castle town facility | `Facility`／`FacilityTypeId`＝`fac.*` | 00 §14／05 §3.4 |
| 施設 slot | —（設計語） | facility slot | `FacilitySlot`（本城 6／支城 3） | 02 §4.5 |
| 徵兵 | 徵兵（chohei） | conscription | `conscription`；`CmdConscript` | 00 §14／05 §3.5 |
| 徵兵方針 | 徵兵方針 | conscript policy | `'low'\|'mid'\|'high'`（低／中／高） | 05 §3.5 |
| 輸送 | 輸送（yuso） | transport | `CmdTransport`＝`'transport'` | 05 §3.6 |
| 米買賣 | 米（kome）買賣 | rice trade（需米問屋） | `tradeRice`（buy／sell） | 05 §3.4.2 |
| 政策 | 政策（seisaku） | policy | `Policy`／`PolicyId`＝`pol.*`；`CmdEnactPolicy` | 00 §14／05 §3.7 |
| 施行／廢止 | 施行（shiko）／廢止 | enact / revoke | `'enactPolicy'`／`'revokePolicy'` | 02 §4.18 |
| 俸祿 | 俸祿（horoku） | salary（貫／月，六階表） | `BAL.rankSalary[i]` | 06 §3.4.2（勘誤 E-04） |
| 褒賞 | 褒賞（hosho） | reward | `CmdRewardOfficer`＝`'rewardOfficer'` | 06 §3.8 |
| 加封／減封 | 加增（kazo）／減封（genpo） | grant / reduce fief | `grantFief`（`officerId: null`＝收回） | 06 §3.8.2 |
| 收支預覽 | —（設計語） | budget forecast | `BudgetForecast`（selector） | 05 §3.1.5 |
| 一揆 | 一揆（ikki） | uprising | `uprising`；`uprising.started`（事件） | 00 §14／05 §3.8 |
| 鎮壓 | 鎮壓（chinatsu） | suppression（野戰解算） | —（流程，無獨立型別） | 05 §3.8.3 |
| 欠俸 | —（設計語） | unpaid salary | `report.clan.unpaidSalary` | 05 §3.1.4／06 §5.2 |

#### 3.3.2 武將系統（語意見 06）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 身分 | 身分（mibun） | rank（六階，§3.9） | `Rank`（02 §3.3 六值） | 00 §4／06 §3.4 |
| 升格／推舉 | 昇進（shoshin） | promotion | `PromoteRankCommand`（06；02 待收錄，E-32） | 06 §3.8.3 |
| 特性 | 特性（tokusei） | trait（被動技） | `Trait`／`TraitId`＝`trait.*` | 00 §14／06 §3.3 |
| 稀有度 | —（設計語） | rarity | `'common'\|'rare'\|'legendary'`（普通／稀有／傳說） | 06 §3.3 |
| 能力成長 | —（設計語） | stat growth | `statExp`／`statGrowth`（每維上限 +5） | 06 §3.2 |
| 仕官中 | 仕官（shikan） | serving | `OfficerStatus`＝`'serving'`（06 用 `'active'`，E-02） | 02 §3.3 |
| 浪人 | 浪人（ronin） | ronin | `OfficerStatus`＝`'ronin'` | 00 §14 |
| 捕虜 | 捕虜（horyo） | captive | `OfficerStatus`＝`'captive'`；`CmdHandleCaptive` | 02 §3.3／06 §3.7.2 |
| 招降／釋放／處斬 | 登用／解放／處刑 | recruit / release / execute | `CaptiveAction`＝`'recruit'\|'release'\|'execute'` | 02 §3.3 |
| 登用 | 登用（toyo） | recruitment | `CmdRecruitRonin`＝`'recruitRonin'` | 06 §3.7.1 |
| 出奔 | 出奔（shuppon） | defection | `officer.defected`（事件） | 06 §3.6.4 |
| 元服 | 元服（genpuku） | coming of age（15 歲登場） | `comingOfAge`；`hasComeOfAge` | 00 §14／06 §3.10 |
| 壽命 | 壽命（jumyo） | lifespan | `scheduledDeath`（開局排程） | 06 §3.9.1 |
| 家督繼承 | 家督相續（katoku-sozoku） | succession | `report.clan.succession` | 06 §3.9.3 |
| 一門／譜代／外樣 | 一門／譜代／外樣 | kin / hereditary / outsider | `Kinship`＝`'kin'\|'fudai'\|'tozama'`（06；02 僅 `isKin`，E-34） | 06 §4 |
| 具申 | 具申（gushin） | proposal（家臣提案） | `Proposal`／`ProposalId`＝`prop.*` | 00 §14／06 §3.11 |
| 採納／駁回 | 採用／却下 | adopt / reject | `CmdResolveProposal`（accept: boolean） | 02 §4.18 |
| 婚姻武將 | 婚儀（kongi） | spouse | `Officer.spouseId`（08 引入，02 待收錄） | 08 §3.4.1 |

#### 3.3.3 軍事與行軍（語意見 04／07）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 出陣 | 出陣（shutsujin） | march out | `CmdMarch`＝`'march'` | 00 §14／07 §3.1 |
| 部隊 | 部隊（butai） | army | `Army`／`ArmyId`＝`army.*`（6 位流水） | 00 §14／02 §4.8 |
| 大將 | 大將（taisho） | commanding general | `Army.leaderId`（07 用 `generalId`，E-11） | 02 §4.8 |
| 副將 | 副將（fukusho） | deputy | `Army.deputyIds`（0..2 人） | 02 §4.8 |
| 帶兵上限 | —（設計語） | troop capacity | `BAL.rankTroopCap.*`（六階表，E-37） | 07 §3.1 |
| 行軍 | 行軍（kogun） | marching | `ArmyStatus`＝`'marching'` | 02 §3.3／04 §3.7 |
| 尋路 | —（設計語） | pathfinding（Dijkstra） | `computePath()`（04） | 04 §3.6 |
| 途經點 | —（設計語） | waypoint | `waypoints`（07 出陣參數） | 07 §3.1 |
| 制壓 | 制壓（seiatsu） | subjugation（翻轉敵郡） | `subjugate`；`ArmyStatus`＝`'subjugating'`；`District.subjugation` | 00 §14／04 §3.8 |
| 遭遇 | 遭遇（sogu） | encounter | 04 §3.9 判定；轉入 `'engaged'` | 04 §3.9 |
| 野戰 | 野戰（yasen） | field combat（自動解算） | `fieldCombat`；`Battle.mode`＝`'auto'` | 00 §14／07 §3.3 |
| 合戰 | 合戰（kassen） | tactical battle | `Battle.mode`＝`'tactical'`；`CmdStartKassen` | 00 §14／07 §3.5 |
| 地利 | 地の利（chi-no-ri） | home ground | `BAL.homeGroundLossMult` | 07 §3.3 |
| 挾擊 | 挾擊（kyogeki） | pincer | `BAL.pincerMult` | 07 §3.3 |
| 潰走 | 潰走（kaiso） | rout | `BAL.routThreshold`（名稱勘誤 E-16） | 07 §3.4 |
| 追擊 | 追擊（tsuigeki） | pursuit | `BAL.pursuitDamageRate` | 07 §3.4 |
| 歸還 | 歸還（kikan） | return home | `ArmyStatus`＝`'returning'`；`CmdRecallArmy` | 02 §3.3／07 §3.13 |
| 兵站 | 兵站（heitan） | supply / logistics | 每日糧耗＋我方城自動補給 | 07 §3.13 |
| 糧盡 | 兵糧切れ（hyoro-gire） | out of food | `army.starving`（事件） | 07 §3.13 |
| 戰法 | 戰法（senpo） | tactic（合戰主動技） | `Tactic`／`TacticId`＝`tac.*` | 00 §14／07 §3.8 |
| 采配 | 采配（saihai） | command points（側共用池） | `saihai`（0..`BAL.saihaiMax`） | 07 §3.7 |
| 陣 | 陣（jin） | battlefield node | `Jin`（合戰戰場節點；模型衝突見 E-18） | 07 §3.6 |
| 本陣 | 本陣（honjin） | headquarters | `isHonjin`；本陣陷落＝立即敗北 | 07 §3.6 |
| 旗力 | —（設計語） | flag power（陣佔領值） | `flagPower` | 07 §3.6 |
| 委任（合戰） | 委任（inin） | delegate | `delegated: boolean` | 07 §3.9 |
| 威風 | 威風（ifu） | awe（大勝擴散效果） | `awe`；`AweLevel`＝`'none'\|'small'\|'medium'\|'large'` | 00 §14／07 §3.10 |
| 攻城戰 | 攻城戰（kojo-sen） | siege | `Siege`／`SiegeId`＝`siege.*` | 00 §14／07 §3.11 |
| 強攻 | 強攻（kyoko） | assault | `SiegeMode`＝`'assault'` | 02 §3.3／07 §3.11 |
| 包圍 | 包圍（hoi） | encirclement | `SiegeMode`＝`'encircle'` | 02 §3.3／07 §3.11 |
| 落城 | 落城（rakujo） | castle fallen | `siege.ended`（`fallen: true`） | 07 §3.11 |
| 援軍解圍 | 後詰（gozume） | relief force | `Siege.interrupted` | 07 §3.11 |
| 軍團 | 軍團（gundan） | corps | `Corps`／`CorpsId`＝`corps.*` | 00 §14／02 §4.13 |
| 軍團長 | 軍團長（gundancho） | corps leader | `Corps.corpsLeaderId`（家老以上） | 00 §14 |
| 軍團方針 | 方針（hoshin） | corps directive | `CorpsDirective`＝`'advance'\|'hold'\|'develop'`（07 另一套，E-21） | 02 §3.3 |
| 傷兵歸隊 | —（設計語） | wounded recovery | 醫館效果（`fac.ikan`） | 05 §3.4.2 |

### 3.4 主術語對照表（三）：外交、事件、系統

#### 3.4.1 外交・朝廷・幕府・調略（語意見 08）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 外交工作 | 外交工作（gaiko-kosaku） | diplomacy work | `diplomacyWork`；`DiploMission`；`CmdStartDiploWork` | 00 §14／08 §3.2 |
| 協定 | 協定（kyotei） | pact | `Pact`；`PactKind`（02 四值，E-23） | 02 §4.11 |
| 同盟 | 同盟（domei） | alliance | `PactKind`＝`'alliance'` | 00 §14 |
| 婚姻 | 婚姻（konin） | marriage alliance | `PactKind`＝`'marriage'` | 00 §14 |
| 停戰 | 停戰（teisen） | ceasefire（絕對不可破棄） | `PactKind`＝`'ceasefire'` | 00 §14／08 §3.4.3 |
| 從屬 | 從屬（juzoku） | vassalage | `PactKind`＝`'vassal'`；`vassalClanId` | 00 §14 |
| 宗主 | 宗主（soshu） | overlord | `vassal` 協定的非從屬方 | 08 §3.4.1 |
| 上繳 | 上納（jono） | tribute | `BAL.vassalTributeRate` | 08 §5.3.6 |
| 破棄 | 破棄（haki） | pact breaking | `CmdBreakPact`＝`'breakPact'` | 02 §4.18／08 §3.4 |
| 援軍請求 | 後詰要請（gozume-yosei） | reinforcement request | `requestReinforce`（08；02 待收錄，E-28） | 08 §3.4.1 |
| 接壤 | 隣接（rinsetsu） | adjacency（勢力間） | `adjacencyCache`（衍生） | 08 §3.1 |
| 交戰中 | 交戰（kosen） | at war（衍生狀態） | `atWar(A,B)`；`lastHostileDay` | 08 §3.1 |
| 朝廷 | 朝廷（chotei） | imperial court | `CourtState`（`GameState.court`） | 00 §14／02 §4.12 |
| 官位 | 官位（kan-i） | court rank | `CourtRank`（02 enum，§3.10；E-25） | 00 §14／02 §3.3 |
| 獻金 | 獻金（kenkin） | donation | `CmdDonateCourt`＝`'donateCourt'` | 02 §4.18／08 §3.5.1 |
| 敘任 | 敘任（jonin） | investiture | `CmdRequestCourtRank`；`court.rankGranted` | 02 §4.18／08 §3.5.2 |
| 停戰斡旋 | 和睦斡旋（waboku-assen） | ceasefire mediation | `CmdRequestMediation`＝`'requestMediation'` | 02 §4.18／08 §3.5.3 |
| 幕府 | 幕府（bakufu） | shogunate | `shogunateExists`／`shogunClanId` | 00 §14／02 §4.12 |
| 役職 | 役職（yakushoku） | shogunate title | `ShogunateTitle`（02 enum，§3.11；E-26） | 00 §14／02 §3.3 |
| 將軍 | 將軍（shogun） | shogun | `ShogunateTitle`＝`'shogun'`（征夷大將軍） | 02 §3.3 |
| 擁立將軍 | 將軍擁立（yoritsu） | shogun patronage | `nominateShogun`（08；02 待收錄） | 08 §3.6.3 |
| 上洛 | 上洛（joraku） | march on Kyoto | `evt.joraku`（事件）；控制京都所在城 | 08 §3.6.3／10 事件 6 |
| 調略 | 調略（choryaku） | plot / covert action | `plot`；`PlotKind`；`CmdStartPlot` | 00 §14／08 §3.7 |
| 引拔 | 引拔（hikinuki） | poaching officers | `PlotKind`＝`'poach'` | 00 §14／08 §3.7.1 |
| 流言 | 流言（ryugen） | rumor | `PlotKind`＝`'rumor'` | 00 §14／08 §3.7.2 |
| 內應 | 內應（naio） | betrayal（策反城主） | `PlotKind`＝`'betrayal'`；`betrayalReadyClanId` | 00 §14／08 §3.7.3 |
| 敗露 | 露見（roken） | plot exposure | `plot.exposed`（08 事件；02 為 `plot.failed`） | 08 §3.7 |

#### 3.4.2 事件・大命・勝敗（語意見 10）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 歷史事件 | 歷史イベント（rekishi ibento）→史實事件 | historical event | `EventId`＝`evt.*`（15 份，§3.11.2） | 00 §14／10 §3.5 |
| 汎用事件 | 汎用（hanyo）事件 | generic event | 豐作／凶作／地震／疫病／南蠻商人／鐵砲商人 | 10 §3.6 |
| 事件選項 | 選択肢（sentakushi）→選項 | event choice | `CmdResolveEventChoice`（`choiceIndex`） | 02 §4.18／10 §3.4 |
| 大命 | 大命（taimei） | grand decree | `Taimei`／`TaimeiId`＝`taimei.*`；`CmdInvokeTaimei` | 00 §14／10 §3.7 |
| 大命冷卻 | —（設計語） | taimei cooldown | `TaimeiState.cooldownUntilDay`（共用一條） | 02 §4.3／10 §3.7.1 |
| 勝利條件 | 勝利條件 | victory condition | `'unification'`（天下統一）／`'tenkabito'`（天下人） | 10 §3.8.1 |
| 支配圈 | —（設計語） | dominion（本家∪從屬） | `dominion`（衍生） | 10 §3.8.1 |
| 敗北條件 | 敗北條件 | defeat condition | `'no-heir'`（絕嗣）／`'no-castle'`（失土） | 10 §3.8.2 |
| 勢力滅亡 | 滅亡（metsubo） | clan destruction | `destroyClan()`；`clan.destroyed`（事件） | 10 §3.8.3 |
| 結局 | —（設計語） | ending | `EndingScreenVM`；`meta.gameOver`（10 引入） | 10 §3.9 |
| 繼續治世／觀戰 | —（設計語） | continue / observe | `acknowledgeGameOver(mode)` | 10 §3.8.4 |

#### 3.4.3 AI・系統・存讀檔（語意見 03／09／16／17）

| 繁中定稿 | 日文原詞（羅馬字） | 英文 | 代碼識別符 | 首次定義 |
|---|---|---|---|---|
| 指令 | —（設計語） | command | `Command`（discriminated union；02 §4.18） | 00 §3／02 §4.18 |
| 遊戲事件 | —（設計語） | game event | `GameEvent`（02 §4.19） | 02 §4.19 |
| 報告 | 報告（hokoku） | report（通知） | `Report`／`ReportId`＝`rep.*` | 00 §14／02 §4.17 |
| 評定 | 評定（hyojo） | AI council（每月戰略決策） | Phase A~D（09 §3.3） | 09 §3.3 |
| AI 性格 | —（設計語） | AI persona | `AiPersona`／`AiPersonaId`＝`persona.*`（五軸） | 02 §3.2／09 §3.2 |
| 侵攻性／外交傾向／內政傾向／義理／野心 | —（設計語） | aggression / diplomacy / development / loyalty / ambition | `AiPersona` 五欄（各 0..100） | 09 §3.2 |
| 委任 AI | —（設計語） | delegation AI | `stewardAi`／`castleAi`／`corpsAi` | 09 §3.7 |
| 具申生成 | —（設計語） | proposal generation | `proposalGen.ts`（每月 1 日） | 09 §3.8 |
| 難易度 | 難易度（nan-ido） | difficulty | `Difficulty`＝`'easy'\|'normal'\|'hard'`（初級／中級／上級） | 00 §11／02 §3.3 |
| 不變量 | —（設計語） | invariant | INV-01..INV-25；`validateState()` | 02 §5.2 |
| 衍生值 | —（設計語） | derived value / selector | `DerivedCache`（tick 內 memo） | 02 §5.1 |
| 存檔槽 | —（設計語） | save slot | 手動 10／自動 3／快速 1（`manual:n`／`auto:n`／`quick:1`） | 16 §3.3 |
| 快速存檔 | —（設計語） | quick save | Ctrl+S／F9 讀取 | 16 §3.4 |
| 版本遷移 | —（設計語） | save migration | `saveVersion`；遷移鏈（16 §3.6） | 02 §4.2／16 §3.6 |
| golden test | —（設計語） | golden master test | `stateHash`（FNV-1a 32）重放一致 | 02 §5.4／17 |
| 簡體字掃描 | —（設計語） | banned glyph scan | L1 簡體／L2 異體／L3 新字體黑名單 | 17（§3.12 對齊） |

### 3.5 特性 30 種對照表（定義：06 §3.3；id 前綴 `trait.`）

| # | id | 繁中名 | 稀有度 | 掛鉤領域 |
|---|---|---|---|---|
| 1 | `trait.gunshin` | 軍神 | 傳說 | 合戰四維乘數（07） |
| 2 | `trait.ifudodo` | 威風堂堂 | 傳說 | 威風等級／範圍（07） |
| 3 | `trait.boshin` | 謀神 | 傳說 | 調略成功率／費用（08） |
| 4 | `trait.hitotarashi` | 人蕩 | 傳說 | 登用成功率、同城忠誠光環（06） |
| 5 | `trait.onimusha` | 鬼武者 | 稀有 | 武勇系戰法威力（07） |
| 6 | `trait.chikujo` | 築城名手 | 稀有 | 施設工期（05） |
| 7 | `trait.naisei` | 內政名人 | 稀有 | 郡開發效率（05） |
| 8 | `trait.gaiko` | 外交上手 | 稀有 | 信用累積（08） |
| 9 | `trait.teppo` | 鐵砲名人 | 稀有 | 遠程攻擊／戰法（07）；解鎖「鐵砲三段」 |
| 10 | `trait.kiba` | 騎馬達人 | 稀有 | 近戰攻擊／突擊系戰法（07）；解鎖「騎突」 |
| 11 | `trait.ninja` | 忍者 | 稀有 | 調略成功率（08） |
| 12 | `trait.kojo` | 攻城名手 | 稀有 | 攻城耐久傷害（07） |
| 13 | `trait.rojo` | 籠城名手 | 稀有 | 守城耐久／士氣（07） |
| 14 | `trait.chiebukuro` | 智囊 | 稀有 | 具申生成權重（09） |
| 15 | `trait.chushin` | 忠臣 | 稀有 | 忠誠目標＋20；免出奔／引拔（06） |
| 16 | `trait.kaizoku` | 海賊 | 普通 | 海路行軍速度（04） |
| 17 | `trait.nosei` | 農政家 | 普通 | 石高開發（05） |
| 18 | `trait.shosai` | 商才 | 普通 | 商業開發（05） |
| 19 | `trait.reisei` | 冷靜 | 普通 | 部隊士氣衰減／潰走閾值（07） |
| 20 | `trait.goketsu` | 豪傑 | 普通 | 部隊攻擊（07） |
| 21 | `trait.keigan` | 慧眼 | 普通 | 登用成功率（06） |
| 22 | `trait.jinsei` | 仁政 | 普通 | 治安月加成（05） |
| 23 | `trait.shinsoku` | 神足 | 普通 | 陸路行軍速度（04） |
| 24 | `trait.heitan` | 兵站上手 | 普通 | 部隊兵糧消耗（05／07） |
| 25 | `trait.boshu` | 募兵上手 | 普通 | 徵兵所得（05） |
| 26 | `trait.jinbo` | 人望 | 普通 | 同城忠誠光環（06） |
| 27 | `trait.yashin` | 野心家 | 普通 | 功績 ×1.2、忠誠目標 −10（06） |
| 28 | `trait.chotei` | 朝廷通 | 普通 | 朝廷費用（08） |
| 29 | `trait.hayamimi` | 早耳 | 普通 | 反調略（08） |
| 30 | `trait.seiatsu` | 攻略上手 | 普通 | 制壓時間（04） |

**附註（勘誤 E-06 對應）**：07 §3.8／D13 另要求 7 個戰法解鎖特性 id 為 canonical，
但 06 上表未收錄。修正階段需擴充 06 特性表（30→37）或將戰法解鎖改掛於上表既有特性。
其名稱定稿如下（先行定稿供 13／14 使用）：

| id | 繁中名 | 解鎖戰法 |
|---|---|---|
| `trait.benzetsu` | 辯舌 | 挑撥 |
| `trait.gunryaku` | 軍略 | 攪亂 |
| `trait.fudou` | 不動 | 堅守 |
| `trait.hizeme` | 火攻 | 火矢 |
| `trait.kesshi` | 決死 | 背水 |
| `trait.roukou` | 老巧 | 牽制 |
| `trait.iryou` | 醫療 | 治療 |

### 3.6 戰法 12 種對照表（定義：07 §3.8；id 前綴 `tac.`）

| # | id | 繁中名 | 日文原詞（羅馬字） | 類型 | 采配 | 解鎖特性 |
|---|---|---|---|---|---|---|
| 1 | `tac.charge` | 突擊 | 突擊（totsugeki） | 增益 | 5 | —（預設） |
| 2 | `tac.volley` | 齊射 | 斉射→齊射（seisha） | 即時 | 4 | —（預設） |
| 3 | `tac.inspire` | 鼓舞 | 鼓舞（kobu） | 即時 | 4 | `trait.gunshin` |
| 4 | `tac.taunt` | 挑撥 | 挑發→挑撥（chohatsu） | 減益 | 3 | `trait.benzetsu` |
| 5 | `tac.disrupt` | 攪亂 | 攪亂（kakuran） | 減益 | 4 | `trait.gunryaku` |
| 6 | `tac.hold` | 堅守 | 堅守（kenshu） | 增益 | 3 | `trait.fudou` |
| 7 | `tac.fire-arrow` | 火矢 | 火矢（hiya） | 增益 | 5 | `trait.hizeme` |
| 8 | `tac.cavalry` | 騎突 | 騎馬突擊（kiba-totsugeki） | 增益 | 6 | `trait.kiba` |
| 9 | `tac.triple-volley` | 鐵砲三段 | 三段擊ち→三段擊（sandan-uchi） | 即時 | 8 | `trait.teppo` |
| 10 | `tac.last-stand` | 背水 | 背水の陣→背水（haisui） | 增益 | 6 | `trait.kesshi` |
| 11 | `tac.pin` | 牽制 | 牽制（kensei） | 減益 | 3 | `trait.roukou` |
| 12 | `tac.heal` | 治療 | 治療（chiryo） | 即時 | 5 | `trait.iryou` |

### 3.7 政策 12 項對照表（定義：05 §3.7.2；id 前綴 `pol.`）

| # | id | 繁中名 | 日文原詞（羅馬字） | 解鎖威信 | 互斥 |
|---|---|---|---|---|---|
| 1 | `pol.rakuichi` | 樂市樂座 | 樂市樂座（rakuichi-rakuza） | 100 | — |
| 2 | `pol.kenchi` | 檢地 | 檢地（kenchi） | 300 | — |
| 3 | `pol.tenmasei` | 傳馬制 | 傳馬制（tenma-sei） | 200 | — |
| 4 | `pol.jishahogo` | 寺社保護 | 寺社保護（jisha-hogo） | 150 | `pol.nanban` |
| 5 | `pol.nanban` | 南蠻貿易 | 南蠻貿易（nanban-boeki） | 400（另需湊或事件） | `pol.jishahogo` |
| 6 | `pol.sekisho` | 關所撤廢 | 關所撤廢（sekisho-teppai） | 250 | — |
| 7 | `pol.jokashuju` | 城下集住 | 城下集住（joka-shuju） | 500 | — |
| 8 | `pol.meyasubako` | 目安箱 | 目安箱（meyasubako） | 100 | — |
| 9 | `pol.heinobunri` | 兵農分離 | 兵農分離（heino-bunri） | 600 | `pol.goningumi` |
| 10 | `pol.goningumi` | 五人組 | 五人組（goningumi） | 350 | `pol.heinobunri` |
| 11 | `pol.kakishuchu` | 火器集中 | 火器集中（kaki-shuchu） | 700（另需射擊場或事件） | — |
| 12 | `pol.enkokinko` | 遠交近攻 | 遠交近攻（enko-kinko） | 450（或官位 ≥ 從五位下） | — |

### 3.8 城下施設 16 種對照表（定義：05 §3.4.2；id 前綴 `fac.`）

| # | id | 繁中名 | 日文原詞（羅馬字） | 限制 |
|---|---|---|---|---|
| 1 | `fac.ichi` | 市 | 市（ichi） | — |
| 2 | `fac.komedoiya` | 米問屋 | 米問屋（kome-doiya） | 需 市 |
| 3 | `fac.heisha` | 兵舍 | 兵舍（heisha） | — |
| 4 | `fac.umaya` | 馬廄 | 廄→馬廄（umaya） | — |
| 5 | `fac.kajiba` | 鍛冶場 | 鍛冶場（kajiba） | — |
| 6 | `fac.shagekijo` | 射擊場 | 射擊場（shagekijo） | 需 鍛冶場 |
| 7 | `fac.hyojosho` | 評定所 | 評定所（hyojosho） | 僅本城 |
| 8 | `fac.minato` | 湊 | 湊（minato） | 臨海 |
| 9 | `fac.jisha` | 寺社 | 寺社（jisha） | 與 南蠻寺 互斥 |
| 10 | `fac.nanbanji` | 南蠻寺 | 南蠻寺（nanbanji） | 政策南蠻貿易＋臨海；與 寺社 互斥 |
| 11 | `fac.inkyo` | 隱居所 | 隱居所（inkyo-jo） | 僅本城 |
| 12 | `fac.kura` | 藏 | 藏（kura） | — |
| 13 | `fac.toride` | 砦 | 砦（toride） | — |
| 14 | `fac.gakumonjo` | 學問所 | 學問所（gakumonjo） | 僅本城 |
| 15 | `fac.ikan` | 醫館 | 醫館（ikan） | — |
| 16 | `fac.jokaku` | 城郭強化 | 城郭強化（jokaku-kyoka） | — |

### 3.9 身分六階對照表（定義：06 §3.4；enum 值以 02 §3.3 為準）

| 階（rankIndex） | 繁中名 | 日文原詞（羅馬字） | `Rank` 值（02 定案） | 特權摘要 |
|---|---|---|---|---|
| 0 | 足輕組頭 | 足輕組頭（ashigaru-kumigashira） | `'kumigashira'` | 起始階 |
| 1 | 足輕大將 | 足輕大將（ashigaru-taisho） | `'ashigaru-taisho'` | — |
| 2 | 侍大將 | 侍大將（samurai-taisho） | `'samurai-taisho'` | 可任城主 |
| 3 | 部將 | 部將（busho） | `'busho'` | — |
| 4 | 家老 | 家老（karo） | `'karo'` | 可任軍團長 |
| 5 | 宿老 | 宿老（shukuro） | `'shukuro'` | 最高階 |
| — | 當主（特殊） | 當主（toshu） | `Clan.leaderId`（不佔六階） | 視同宿老；忠誠恆 100 |

（06／07 使用 camelCase 值 `ashigaruKumigashira` 等，為勘誤 E-01；升格門檻、知行上限、
俸祿之數值衝突見 E-03／E-04。）

### 3.10 朝廷官位八階對照表（enum 以 02 §3.3 為準；機制語意見 08 §3.5）

| 階 | 繁中名 | 日文原詞（羅馬字） | `CourtRank` 值（02 定案） |
|---|---|---|---|
| 0 | 無位無官 | 無位無官（mui-mukan） | `'none'` |
| 1 | 從五位下 | 從五位下（ju-goi-no-ge） | `'ju5ge'` |
| 2 | 從五位上 | 從五位上（ju-goi-no-jo） | `'ju5jo'` |
| 3 | 從四位下 | 從四位下（ju-shii-no-ge） | `'ju4ge'` |
| 4 | 從四位上 | 從四位上（ju-shii-no-jo） | `'ju4jo'` |
| 5 | 從三位 | 從三位（ju-sanmi） | `'ju3'` |
| 6 | 正三位 | 正三位（sho-sanmi） | `'sho3'` |
| 7 | 從二位 | 從二位（ju-nii） | `'ju2'` |
| 8 | 正二位（v1.0 天花板） | 正二位（sho-nii） | `'sho2'` |

（08 §3.5.2 使用另一套八階〔含正五位下／正四位下／正一位，id 前綴 `crank.`〕，為勘誤 E-25；
以 02 上表為定稿，08 的門檻／獻金／解鎖效果表需重排至此八階。）

### 3.11 幕府役職對照表（enum 以 02 §3.3 為準；機制語意見 08 §3.6）

| 序 | 繁中名 | 日文原詞（羅馬字） | `ShogunateTitle` 值（02 定案） |
|---|---|---|---|
| 0 | 無役職 | —（naši→無し） | `'none'` |
| 1 | 奉公眾 | 奉公眾（hokoshu） | `'hokoshu'` |
| 2 | 御供眾 | 御供眾（otomoshu） | `'otomoshu'` |
| 3 | 相伴眾 | 相伴眾（shobanshu） | `'shobanshu'` |
| 4 | 管領 | 管領（kanrei） | `'kanrei'` |
| 5 | 副將軍 | 副將軍（fuku-shogun） | `'fukushogun'` |
| 6 | 征夷大將軍 | 征夷大將軍（seii-taishogun） | `'shogun'` |

（08 §3.6.2 使用五階表〔御供眾／御相伴眾／管領代／管領／副將軍，id 前綴 `stitle.`〕，
為勘誤 E-26；以 02 上表為定稿，08 的條件表需對映至此七值。）

### 3.11.2 大命 8 種對照表（定義：10 §3.7.3；id 前綴 `taimei.`）

| # | id | 繁中名 | 日文原詞（羅馬字） | 解鎖威信 | 型態 |
|---|---|---|---|---|---|
| 1 | `taimei.sokuji-chohei` | 即時徵兵 | 即時徵兵（sokuji-chohei） | 200 | 即時 |
| 2 | `taimei.kenkin-meneki` | 獻金免役 | 獻金免役（kenkin-meneki） | 250 | 即時 |
| 3 | `taimei.sodoin` | 總動員 | 總動員（so-doin） | 400 | 90 日 |
| 4 | `taimei.gaiko-kosei` | 外交攻勢 | 外交攻勢（gaiko-kosei） | 300 | 180 日 |
| 5 | `taimei.rakuichi-shinko` | 樂市大振興 | 樂市振興（rakuichi-shinko） | 450 | 180 日 |
| 6 | `taimei.teppeki` | 鐵壁 | 鐵壁（teppeki） | 350 | 90 日 |
| 7 | `taimei.shippu-jinrai` | 疾風迅雷 | 疾風迅雷（shippu-jinrai) | 300 | 90 日 |
| 8 | `taimei.tenka-bushin` | 天下普請 | 天下普請（tenka-bushin） | 600 | 180 日 |

（00 §8 之 ID 例 `taimei.sokuji` 為簡寫示意；正式 id 以 10 型錄上表為準，見勘誤 E-50。）

### 3.11.3 畫面・面板・Modal 名稱對照表（定義：11 §3.1；16／10 補充）

| 代碼名 | 繁中名稱 | 類型 | 定義文件 |
|---|---|---|---|
| `TitleScreen` | 標題畫面 | Screen | 11 §3.2.1 |
| `ScenarioSelectScreen` | 劇本選擇 | Screen | 11 §3.2.2 |
| `DaimyoSelectScreen` | 大名選擇 | Screen | 11 §3.2.3 |
| `MainScreen` | 主畫面（地圖＋HUD） | Screen | 11 §3.3 |
| `BattleScreen` | 合戰畫面 | Screen | 11 §3.11.1 |
| `EndingScreen` | 勝敗結局畫面 | Screen | 11 §3.12.3 |
| `CastlePanel` | 城面板（概要／內政／軍事／輸送 四頁） | Panel | 11 §3.4 |
| `DistrictPanel` | 郡面板 | Panel | 11 §3.5 |
| `OfficersPanel` | 武將一覽（家臣團） | Panel | 11 §3.7 |
| `OfficerDetail` | 武將詳細卡 | Panel | 11 §3.7 |
| `DiplomacyPanel` | 外交畫面（勢力／朝廷／幕府） | Panel | 11 §3.8 |
| `PolicyPanel` | 政策畫面 | Panel | 11 §3.9 |
| `CorpsPanel` | 軍團畫面 | Panel | 11 §3.9 |
| `TaimeiPanel` | 大命面板 | Panel | 11 §3.9／10 §6.2 |
| `ReportsPanel` | 報告中心 | Panel | 11 §3.12.4 |
| `SaveLoadPanel` | 存檔／讀檔畫面（雙模式） | Panel | 11 §3.13／16 §6.1 |
| `SettingsPanel` | 設定畫面 | Panel | 11 §3.13／16 §6.2 |
| `MarchModal` | 出陣編成 | Modal | 11 §3.6 |
| `ProposalInbox` | 具申收件匣 | Modal | 11 §3.10 |
| `EventModal` | 事件 cutscene | Modal | 11 §3.12.1／10 §6.1 |
| `MonthSummaryModal` | 月初摘要 | Modal | 11 §3.12.2 |
| `SystemMenu` | 系統選單 | Modal | 11 §3.13 |
| `ConfirmDialog` | 確認對話框 | Modal 元件 | 12 §3.2.15 |
| 攻城 overlay（`SiegeOverlay`） | 攻城面板（地圖上覆蓋層） | Overlay | 11 §3.11.2／07 §6.3 |
| `ContextPanel` | 底部上下文面板（城／郡／部隊 三態） | HUD 元件 | 11 §3.3.4／12 §3.2.14 |
| `ResourceBar` | 上緣資源列 | HUD 元件 | 11 §3.3.1／12 §3.2.8 |
| `Toast` / `ReportStack` | 通知堆疊 | HUD 元件 | 11 §3.3.3／12 §3.2.13 |
| `MiniMap` | 迷你地圖 | HUD 元件 | 04 §3.13.1／12 §3.2.12 |
| `DebugPanel` | 除錯面板（dev 限定） | Panel | 01 §3.11.2 |

主要地圖場景元件（12 §3.3）：`ArmyChip` 部隊棋子、`CastleNode` 城節點、`DistrictNode` 郡節點、
`SelectionRing` 選取光圈、`PathPreview` 路徑預覽、`AweShockwave` 威風衝擊波、
`BattleSpark` 交鋒火花、`SiegeMarker` 圍城標記。

#### 3.11.4 史實事件 15 份名稱對照（定義：10 §3.5）

`evt.okehazama` 桶狹間之戰、`evt.kawanakajima4` 第四次川中島、`evt.kiyosu-domei` 三河獨立與清洲同盟、
`evt.yoshiteru-shi` 將軍足利義輝橫死（永祿之變）、`evt.mino-koryaku` 美濃攻略與稻葉山城易主、
`evt.joraku` 信長上洛與義昭將軍、`evt.kanegasaki` 金崎撤退、`evt.anegawa` 姉川之戰、
`evt.hieizan` 比叡山燒討、`evt.muromachi-metsubo` 室町幕府滅亡、`evt.nagashino` 長篠之戰、
`evt.honnoji` 本能寺之變、`evt.takamoto-soshi` 毛利隆元早逝、`evt.shingen-byoshi` 武田信玄病逝、
`evt.kenshin-byoshi` 上杉謙信病逝。

### 3.12 易錯繁簡字・日文新字體對照警示表（canonical）

**用途**：撰寫任何繁中文字（規格、UI 字串、劇本資料 `name`／`text`）時查對。
日文新字體混入是**主要風險**（劇本資料多自日文史料整理）；簡體字次之。
下表「誤」欄字形**僅在本表中出現**，全案其他位置零容忍（17 的 L1~L3 掃描黑名單須涵蓋本表）。

| # | 正（繁體） | 誤：日文新字體 | 誤：簡體 | 本作用例（正字） | 備註 |
|---|---|---|---|---|---|
| 1 | 拔 | 抜 | 拔（同繁） | 引拔、選拔 | 「引拔」為調略機制名 |
| 2 | 戰 | 戦 | 战 | 合戰、野戰、戰法、桶狹間之戰 | 全案最高頻字 |
| 3 | 國 | 国 | 国 | 尾張國、戰國、全國 | 新字體與簡體同形 |
| 4 | 齋 | 斎 | 斋 | 齋藤義龍、齋藤家 | 10 號文件已誤用 2 處（E-52） |
| 5 | 瀧 | 滝 | 泷 | 瀧川一益 | 武將名高風險 |
| 6 | 澤 | 沢 | 泽 | 米澤城、澤瀉 | 城名高風險 |
| 7 | 邊 | 辺 | 边 | 渡邊守綱、周邊 | |
| 8 | 櫻 | 桜 | 樱 | 櫻井、櫻花 | |
| 9 | 鹽 | 塩 | 盐 | 鹽田、鹽湖 | |
| 10 | 發 | 発 | 发 | 發動、開發、爆發 | |
| 11 | 對 | 対 | 对 | 對照、敵對、對馬 | |
| 12 | 圖 | 図 | 图 | 地圖、圖層、企圖 | |
| 13 | 氣 | 気 | 气 | 士氣、天氣 | 士氣為核心數值名 |
| 14 | 濟 | 済 | 济 | 經濟、救濟 | |
| 15 | 繼 | 継 | 继 | 繼承、家督繼承 | |
| 16 | 單 | 単 | 单 | 單位、單一 | |
| 17 | 龍 | 竜 | 龙 | 齋藤義龍、龍造寺 | 勢力名高風險 |
| 18 | 驛 | 駅 | 驿 | 驛站 | |
| 19 | 鄰 | 隣 | 邻 | 鄰接、鄰國 | 外交「接壤」相關 |
| 20 | 姬 | 姫 | 姬（同繁） | 濃姬、姬路 | 女性名高風險 |
| 21 | 廣 | 広 | 广 | 廣島、吉川元廣 | |
| 22 | 濱 | 浜 | 滨 | 長濱、橫濱 | |
| 23 | 關 | 関 | 关 | 關所撤廢、關東 | 政策名用字 |
| 24 | 鐵 | 鉄 | 铁 | 鐵砲、鐵壁 | 大命／戰法用字 |
| 25 | 驗 | 験 | 验 | 經驗、驗證 | |
| 26 | 榮 | 栄 | 荣 | 繁榮、榮譽 | |
| 27 | 賣 | 売 | 卖 | 米買賣、商賣 | |
| 28 | 讀 | 読 | 读 | 讀取、存讀檔 | |
| 29 | 檢 | 検 | 检 | 檢地、檢查 | 政策名用字 |
| 30 | 燈 | 灯 | 灯 | 燈火 | |
| 31 | 來 | 来 | 来 | 來航、將來 | 汎用事件「南蠻商人來航」 |
| 32 | 德 | 徳 | 德（同繁） | 德川家康 | 勢力名高風險 |
| 33 | 惠 | 恵 | 惠（同繁） | 惠瓊 | |
| 34 | 狹 | 狭 | 狭 | 桶狹間 | 首事件名用字 |
| 35 | 淺 | 浅 | 浅 | 淺井長政 | 勢力名高風險 |
| 36 | 彈 | 弾 | 弹 | 彈藥、彈正 | 官職名（彈正忠）用字 |
| 37 | 傳 | 伝 | 传 | 傳馬制、傳達 | 政策名用字 |
| 38 | 眾 | 衆 | 众 | 御供眾、國人眾 | 役職名用字；「衆」為異體，統一用「眾」 |
| 39 | 應 | 応 | 应 | 內應、對應 | 調略機制名用字 |
| 40 | 歸 | 帰 | 归 | 歸還、歸屬、歸順 | 11 號文件已誤用 1 處（E-52） |

**補充規則**：
- 「砲」「炮」皆為合法繁體，本作統一用「砲」（鐵砲）；掃描黑名單**不得**收錄「砲」（勘誤 E-52c）。
- 「台」「臺」：本作統一用「台」（台灣慣用；高台陣）。
- 「裡」「裏」：統一用「裡」；日文詞「裏切り」改寫為「內應」，不出現「裏」。
- 「著」「着」：統一用「著」。
- 「勳」不用「勲」；「歲」不用「歳」；「步」不用「歩」（行軍步兵→步兵）。

### 3.13 全 plan 文件術語不一致勘誤清單（canonical，供修正階段）

比對範圍：全部 00~19 文件（13／15／18 已於 2026-07 補齊；A~E 為初版清單、F 為六視角驗證新增，見 §F）。
「建議定案」依優先序 `00 > 02 > 15 > 系統文件 > UI 文件`；02 未涵蓋而系統文件較完整者，
建議修 02 收錄（標「修 02」）。**BAL 常數名／值之裁決以 `15-balance.md` §5.2 為準，本清單只做交叉引用。**

#### A. enum 與欄位命名

| # | 衝突 | 涉及文件 | 建議定案 |
|---|---|---|---|
| E-01 | `Rank` 值：02 kebab-case（`'kumigashira'`、`'ashigaru-taisho'`…）；06／07 camelCase（`'ashigaruKumigashira'`…）；i18n key 兩式並存（02 §6 vs 06 §6.2） | 02, 06, 07 | 依 02 kebab-case；改 06／07 與其字串 key |
| E-02 | `OfficerStatus`：02＝`serving/ronin/captive/dead`＋`hasComeOfAge` 旗標（DDR-5）；06＝`unborn/active/ronin/captive/dead` | 02, 06 | 依 02；06 的 `'unborn'` 改為 `hasComeOfAge=false`、`'active'` 改 `'serving'` |
| E-07 | 開發重點：02 `DevelopFocus`＝`agri/commerce/security`；05 `DevPolicy`＝`agri/commerce/barracks`（兵舍） | 02, 05, 09 | 型別名依 02 `DevelopFocus`；第三值需裁決——05 的 `barracks` 有完整機制（人口×2、徵兵×1.25），建議修 02 改為 `barracks` 並同步 09 |
| E-08 | 治安欄位：02／14＝`publicOrder`；05＝`security` | 02, 05, 14 | 依 02 `publicOrder`；改 05 全文 |
| E-09 | 郡上限欄位：02／14＝`kokudakaCap/commerceCap/populationCap`；05＝`kokudakaMax/commerceMax/populationMax` | 02, 05, 14 | 依 02 `*Cap`；改 05 |
| E-10 | `ArmyStatus` 三套：02 五態（`engaged/subjugating`…）；07 六態（`fighting/routed/resting`）；04 七態（`retreating/holding/besieging`） | 02, 04, 07 | 修 02 擴充為聯集定案（建議：`marching/engaged/sieging/subjugating/returning/routed/holding`，`resting`併入`holding`、`retreating`併入`returning`），04／07 改用 |
| E-11 | Army 欄位：02 `leaderId/soldiers/originCastleId/pathCursor/edgeProgress(0..1)`；07 `generalId/troops/homeCastleId/pathIndex`；04 `march.nodeIndex/edgeProgressDays/edgeCostDays` | 02, 04, 07 | 命名依 02；行軍進度模型需裁決（見 E-36），欄位隨模型定案後回寫 02 |
| E-34 | 一門標記：02／08＝`isKin: boolean`；06＝`Kinship`＝`kin/fudai/tozama`（忠誠公式依賴譜代／外樣） | 02, 06, 08 | 修 02 採 06 的 `kinship`（資訊量必要），08 的 `isKin` 判定改為 `kinship==='kin'` |
| E-35 | 勢力色：02 `Clan.color: '#rrggbb'`；12 `Clan.colorIndex: 0..39`（40 色相環） | 02, 12 | 修 02 採 `colorIndex`（12 D5 之公式生成較可維護），渲染層由公式導出 hex |
| E-44 | `District.isPort`（04 引入）、`Castle.coastal`（05）、`Castle.betrayalReadyClanId/betrayalReadyUntilDay`（08）、`Officer.spouseId`（08）皆未列入 02 實體 | 02, 04, 05, 08 | 修 02 收錄四組欄位 |
| E-43 | 一揆狀態：05 `District.uprising: UprisingState`；02 District 無此欄位 | 02, 05 | 修 02 收錄 `uprising: UprisingState \| null` |

#### B. Command／GameEvent 命名

| # | 衝突 | 涉及文件 | 建議定案 |
|---|---|---|---|
| E-29 | Command 命名三套：02＝`'grantFief'/'enactPolicy'/'recallArmy'/'startKassen'/'resolveProposal'`…；03＝`'cmd.developDistrict'/'cmd.assignSteward'/'cmd.adoptPolicy'/'cmd.initiateBattle'/'cmd.respondProposal'`…；05／06／07／08 又各有一套（`appointSteward`、`RecruitRoninCommand(executorId,targetId)`、`CmdReturnArmy`、`'diplomacy/assignWork'` 等） | 02, 03, 05~08 | 一律依 02 §4.18 聯集（無 `cmd.` 前綴、camelCase type）；03 §3.3.4 表與各系統文件的 Command 節逐一改名；08 的斜線命名空間廢除 |
| E-30 | GameEvent 命名：02＝`battle.kassenAvailable/clan.destroyed/game.victory/uprising.started/pact.expired`；03＝`combat.battleAvailable/clan.eliminated/victory.achieved/uprising.broke/diplomacy.pactExpired`；07＝`battle.available`；08＝`dip.pactExpired` 等 | 02, 03, 07, 08 | 依 02 §4.19 總表；03 §3.4.2 分級表與 07／08 事件名改為 02 名 |
| E-27 | 朝廷獻金機制：02＝`CmdDonateCourt`（一次性）＋`courtFavor`；08＝「獻金工作」（持續型外交工作）＋`imperialFavor` | 02, 08 | 機制依 08（持續工作制較完整），但欄位名依 02 `courtFavor`；修 02 以 08 機制重寫 `CmdDonateCourt`→併入 `CmdStartDiploWork(target:'court')` |
| E-31 | 報告保留：02 `BAL.reportMaxKept`=600；03 `BAL.reportMaxEntries`=500＋`reportRetentionDays`=360 | 02, 03 | 依 02 常數名 `reportMaxKept`；日數修剪規則併入，定值由 15 裁定 |
| E-32 | 06 新增 `PromoteRankCommand`、07 新增 `CmdSetAutoReturn/CmdUseBetrayal/CmdRemoveCastleFromCorps`、08 新增 `respond/requestShogunateTitle/nominateShogun/cancelPlot/activateBetrayal` 等皆不在 02 聯集 | 02, 06, 07, 08 | 修 02 聯集補收；重複語意者合併（`CmdRemoveCastleFromCorps`＝`assignCastleToCorps(corpsId:null)`） |

#### C. 數值與機制衝突

| # | 衝突 | 涉及文件 | 建議定案 |
|---|---|---|---|
| E-03 | 知行郡數上限三套：02 `fiefMaxByRank`＝1/2/3/4/6/8；05 `fiefLimitByRank`＝1/1/2/3/4/5；06 `rankFiefCap`＝0/1/1/2/3/4 | 02, 05, 06 | 常數名依 02 `fiefMaxByRank`；數值由 15 定案（建議採 06 序列 0/1/1/2/3/4——足輕組頭無知行與 06 忠誠模型一致） |
| E-04 | 俸祿：05 `salaryByRank`＝2/4/7/12/20/30；06 `rankSalary`＝3/6/10/15/22/30 | 05, 06 | 常數名統一 `BAL.rankSalary`；數值 15 定案 |
| E-05 | 特性數上限：02 `maxTraitsPerOfficer`=4；06＝3 | 02, 06 | 常數名已同；值 15 定案（建議 4，容納 E-06 追加特性） |
| E-06 | 07 D13 要求 10 個戰法解鎖特性；06 三十表缺 7 個（§3.5 附表） | 06, 07 | 修 06 特性表擴充至 37 或重掛既有特性；02 `Officer.tactics: TacticId[]`（直接持有戰法）與 07 特性解鎖制二擇一——建議依 07（刪 02 的 `tactics` 欄） |
| E-12 | 執行期 ID 格式：02＝`army.000042` 等 6 位流水；07＝`army.oda-003`、`battle.<node>-<day>`、`fc.*`、`siege.<castle>-<day>`、`bu.*`、`jin.*` | 02, 07 | 依 02 六位流水（DDR-10 決定論理由）；07 的 `fc./bu./jin.` 為合戰內部 transient id，可保留但需在 02 §3.2 登記 |
| E-13 | 制壓進度存放：02 `District.subjugation{progress 0..100}`（DDR-9：接力制壓）；04 `Army.march.subjugation{daysDone/daysRequired}` | 02, 04 | 依 02（存於郡）；04 的 daysRequired 公式保留、進度換算為 0..100 |
| E-14 | 部隊行軍糧耗三套：04 `armyFoodPerSoldierPerDay`=0.005；07 `fieldFoodPerSoldierDaily`=0.02；05 引用「`marchFoodPerSoldierMonthly`（07 定義，0.3）」——07 並無此常數；三值換算互斥（0.15 vs 0.6 vs 0.3 石/人/月） | 04, 05, 07 | 常數名統一 `BAL.fieldFoodPerSoldierDaily`（07 為軍事真相來源）；值 15 定案；05 §3.1.3 之引用改名 |
| E-15 | 城駐兵糧耗：05 `garrisonFoodPerSoldierMonthly`=0.1；07 引用「`castleFoodPerSoldierDaily`（05 定義）」——05 並無此常數 | 05, 07 | 依 05 名；07 §3.11 圍城消耗公式改引 `garrisonFoodPerSoldierMonthly/30` |
| E-16 | 潰走閾值：02 名 `moraleBreakThreshold`；07 `routThreshold`=30；04 `routMoraleThreshold`=20 | 02, 04, 07 | 常數名依 02 `moraleBreakThreshold`；值 15 定案（07 的 30 為主建議） |
| E-17 | 糧盡懲罰：04 `starvationMoraleLossPerDay`=8／`starvationDesertRatePerDay`=0.03；07 `noFoodMoraleDaily`=8／`noFoodDesertionRate`=0.05 | 04, 07 | 依 07 命名（軍事真相來源）；04 §3.7 改引用；值 15 定案 |
| E-18 | 合戰戰場模型互斥：02 `TacticalBattleState`＝24×16 方格＋`BattleUnit(x,y,order,tacticGauge)`＋`CmdBattleOrder`；07＝陣（Jin）節點圖 5×3＋側共用采配＋`CmdBattleMove/Attack/Tactic` | 02, 07 | 依 07 陣節點圖（規格完整、11 的合戰畫面亦按陣圖繪製）；**修 02** §4.9 以 07 §4 型別置換（此為 02>07 優先序的明定例外，需在 02 §8 記錄） |
| E-19 | 合戰回合上限：02 `kassenMaxRounds`=60；07 `kassenMaxTicks`=120 | 02, 07 | 統一名 `kassenMaxTicks`；值 15 定案 |
| E-21 | 軍團方針：02 `advance/hold/develop`＋`targetNodeId`；07 `conquer/defend/auto`＋`targetCastleId` | 02, 07, 09 | 依 02 三值與 `targetNodeId`；07／09 行為描述改繫於 02 值 |
| E-22 | 軍團金庫：07 `Corps.gold`＋上繳 `corpsTithe`=0.2；02 Corps 無 gold（收支不分流） | 02, 07 | 依 07 機制（軍團自治需獨立財源）；修 02 收錄 `Corps.gold` |
| E-37 | 帶兵上限：06＝07 基礎值 ×(1+`rankTroopBonus`)乘數制；07＝`rankTroopCap` 絕對值表（500..8000） | 06, 07 | 依 07 絕對值表（06 §2 已聲明基礎式屬 07）；刪 06 `rankTroopBonus` 或降為註記 |
| E-38 | 政策同時生效數：02 `maxActivePolicies`=4 固定；05＝`min(6, 1+floor(威信/300))` 動態政策格 | 02, 05 | 依 05 動態制（威信驅動為政策系統核心張力）；修 02 註解 |
| E-39 | 施設模型：02 `FacilitySlot[]`（固定長度＋`slotIndex`＋單槽工期）；05 `facilities: FacilityId[]`＋`buildQueue`（每城一條佇列、同時施工 1 件） | 02, 05 | 依 05 佇列制（含取消退款規則）；修 02 §4.5 與 `CmdBuildFacility` 參數（`facilityTypeId`，不用 `slotIndex`） |
| E-41 | 輸送：02 `CmdTransport(soldiers, food)`；05 `transport(gold, food)`＋`TransportOrder`／`trans.` 前綴（02 無 transports 集合） | 02, 05 | 合併為 `CmdTransport(soldiers, gold, food)` 三欄皆 ≥0；修 02 收錄 `GameState.transports` 與 `trans.` 前綴 |
| E-42 | 徵兵：02 `CmdConscript(soldiers)` 一次性指令；05＝徵兵方針（low/mid/high）每月自動回復 | 02, 05 | 依 05 方針制（減微管理支柱）；02 的 `CmdConscript` 改為 `CmdSetConscriptPolicy` |
| E-33 | 引拔受理：06 資格 `loyalty<40`（`poachEligibleLoyalty`）、成功初始忠誠 45；08 目標條件 `loyalty<75`、初始忠誠 60（`plotPoachInitialLoyalty`） | 06, 08 | 發動端門檻依 08（<75 可下達）、受理端加權依 06（acceptanceFactor 以 40 為分母）；初始忠誠統一 `BAL.poachedInitialLoyalty`，值 15 定案 |
| E-53 | 罷免懲罰語意重疊：05 `dismissLoyaltyPenalty`=15（罷免領主）；06 `loyaltyReduceFief`=15（減封）＋`loyaltyDismiss`=10（罷免城主／軍團長） | 05, 06 | 「收回知行」統一走 06 `loyaltyReduceFief`；05 §3.3.3 改引用；`loyaltyDismiss` 僅限役職解任 |
| E-46 | 部隊合流：04 §3.9「合流是明確的 Command，定義參見 07」；07 D14「v1 不支援合流與拆分」 | 04, 07 | 依 07（不支援）；刪 04 該句 |
| E-47 | 亂數流指派：03＝壽命死亡與外交工作成敗走 `event` 流、開發成長走 `dev` 流；06 出奔／登用走 `misc`、僅開局排程走 `event`；05 聲明開發無隨機；08 調略／斡旋走 `misc` | 03, 05, 06, 08 | 依各系統文件實際用流（06／05／08）；修 03 §3.5.2 表為「流→實際消費者」對照 |
| E-24 | 感情範圍：02＝0..100（50 中立）；08＝−100..100（0 中立，允許小數） | 02, 08 | 依 08（−100..100；漂移與閾值公式皆以 0 為中心）；修 02 §4.11 與 INV-16 |
| E-23 | `PactKind`：02＝`alliance/marriage/ceasefire/vassal`（承 00 §14）；08＝`nonAggression/alliance/ceasefire/vassal`＋婚姻為同盟旗標 | 00, 02, 08 | 00 §14 四協定為準：`marriage` 保留為獨立 kind、08 的「不可侵條約」降級為 v1.1 擴充（08 §3.4.1 表需移除該列或標註範圍外） |
| E-25 | 官位階集合：02 八階（至正二位）；08 八階（含正五位下／正四位下，至正一位，`crank.` 前綴） | 02, 08 | 依 02（§3.10 表）；08 §3.5.2 門檻表重排、`crank.` 前綴廢除（enum 值即識別符） |
| E-26 | 幕府役職集合：02 七值（奉公眾…征夷大將軍）；08 五階（御相伴眾／管領代，`stitle.` 前綴） | 02, 08 | 依 02（§3.11 表）；08 §3.6.2 條件表對映至 02 值、`stitle.` 前綴廢除 |
| E-28 | 外交資料結構：02 無向 pair 稀疏 rows＋Pact 內嵌；08 有向 byClan rows＋全域 pacts Record＋`PactId`／`pact.`、`plot.` 前綴 | 02, 08 | 依 02 結構（DDR-3）；08 的 Plot／DiplomacyProposal 等新增實體修 02 收錄，`plot.` 前綴登記、`pact.` 廢除 |
| E-36 | 行軍模型：02＝`RoadEdge.length`（距離）÷部隊日速；04＝`baseDays`＋道級倍率＋進度累加器（權威資料格式）；05 輸送引用「`BAL.marchBaseSpeed`（04 定義）」——04 並無此常數 | 02, 04, 05 | 依 04（baseDays 模型，資料製作與尋路皆以其為基礎）；修 02 §4.7 RoadEdge 欄位（`type/grade/baseDays`）；05 §3.6 輸送速度改以「speedFactor＝`BAL.transportSpeedFactor`」表述 |

#### D. 規模・文字・其他

| # | 衝突 | 涉及文件 | 建議定案 |
|---|---|---|---|
| E-48 | 具申型別：02 `Proposal{officerId, createdDay, expiresDay, meritReward}`＋`ProposalStatus`＝`accepted`＋`proposalExpireDays`=60＋`Record` 容器；06 `{proposerId, createdOn, expiresOn, estimatedCostGold, summaryKey}`＋`adopted`＋月末逾期＋陣列容器；`ProposalKind` 02＝11 值 vs 06＝7 值（`develop` vs `development`） | 02, 06 | 欄位名／status／容器依 02；逾期規則依 02（60 日）；`ProposalKind` 依 02 十一值（06 的 7 值為子集，`development`→`develop`）；06 的 `estimatedCostGold/summaryKey` 修 02 補收 |
| E-49 | 勢力數：00 §10＝38~42；09＝40 家 persona 表；14＝41 家（真相來源）；11 劇本選擇畫面示意「勢力數：40」 | 00, 09, 11, 14 | 以 14 的 41 家為準；09 補漏列勢力（套預設 persona）；11 示意文字改 41 |
| E-50 | 大命 ID：00 §8 例 `taimei.sokuji`；10 型錄 `taimei.sokuji-chohei` | 00, 10 | 依 10 型錄（00 §8 該處為示例性質，不改 00 本文，於 14 資料與程式一律用 10 型錄 id） |
| E-51 | ID 前綴未登記：`fac./persona.`（02 DDR-11 已補）；`trans.`（05）、`plot.`（08）、`fc./bu./jin.`（07 合戰 transient）未列 00 §8／02 §3.2 | 02, 05, 07, 08 | 修 02 §3.2 前綴表補收 `trans.`、`plot.`、`fc.`、`bu.`、`jin.`；廢除 `pact./crank./stitle.`（見 E-25／E-26／E-28） |
| E-52 | 文字錯誤（實際錯字）：(a) 10 §3.5 事件 5 內文兩處「斎藤」（L402、L411）應作「齋藤」；(b) 11 §3.9 一處「归屬」（L454）應作「歸屬」；(c) 14 V10 新字體黑名單誤含「砲」——會誤傷正字「鐵砲」，應自黑名單移除 | 10, 11, 14 | 依 §3.12 正字修改三處 |
| E-54 | 城主遞補與不變量：06 §3.9.2 死亡後「同城最高身分自動遞補城主」可能遞補出低於侍大將者，違反 02 INV-04（城主 rank ≥ `samurai-taisho`） | 02, 06 | 修 06：遞補限身分 ≥ 侍大將，無合格者懸缺 |
| E-55 | 10 引入 `meta.gameOver`、`events.stats`、`events.tenkabitoStreakMonths`、`events.flags`；02 之 `MetaState`／`EventsState` 未收錄（10 §4.3 自我聲明 canonical） | 02, 10 | 修 02 §4.2／§4.16 依 10 §4.3 收錄 |
| E-56 | UI／存檔常數進 BAL：16 用 `BAL.manualSaveSlots` 等；12 D1 定調「不影響模擬的 UI 常數不進 BAL」 | 12, 16 | 存檔槽數改入 16 自有常數表（如 `SAVECFG.*`）；BAL 保留純模擬數值 |

#### F. 六視角驗證新增勘誤（E-57…E-80；2026-07-07 補）

> 由六視角一致性驗證（對抗式覆核，31 項確認）新增；均為 A~E 未涵蓋之確認問題，與上表並用。BAL 相關者已同步入 15 §5.2。

| # | 衝突 | 涉及文件 | 建議定案 |
|---|---|---|---|
| E-57 | 06 §4 `Officer` 持有 `fiefDistrictIds`／`corpsId`，違反 02 §3.1／§4.4「役職不存於 Officer、一律反查」（雙重真相） | 02, 06 | 刪 06 兩欄；受封郡查 `District.stewardId`、軍團歸屬查 `castle.corpsId`（selector §5.1） |
| E-58 | `Officer.captorClanId`（06 §4）vs `capturedByClanId`（02 §4.4、INV-18） | 02, 06 | 統一 `capturedByClanId`（依 02）；刪 06 `captorClanId` |
| E-59 | 武將能力成長模型：06 §4 `baseStats/statExp/statGrowth: OfficerStats`（成長制）vs 02 §4.4 扁平 `ldr/val/int/pol` 無成長欄位 | 02, 06 | 以 06 成長模型為準（武將機制擁有者）；修 02 §4.4 收錄 `statExp/statGrowth`（`effectiveStat=min(120,base+growth)`），並定義序列化邊界 |
| E-60 | `GameState.ai: AiState`：09 §4 宣稱 02 收錄，02 §4.1 無 `ai` 分支、未收 AiState/AiClanState/AiPersona | 02, 09 | 修 02 §4.1 增 `ai: AiState` 並收錄型別；`intentLog/AiIntent` 標 transient 不序列化、`AiClanState` 持久化；明訂 `persona ← personas[personaId]` 解析 |
| E-61 | 城最大兵力雙公式：05 §3.5 `maxSoldiers`（城格基礎+施設+政策，`soldiersPerPop` 0.025）vs 02 §5.1 selector `castleMaxSoldiers` 用 `garrisonPopRatio`(0.08，違反 00 §6) | 02, 05, 15 | 採 05 `maxSoldiers` 唯一公式；刪 `garrisonPopRatio`；02 selector 改引 05（見 15 §5.2 表 C） |
| E-62 | 潰走部隊行為 04 vs 07 衝突：折損率（04 §3.7 `armyDisband*` vs 07 §3.4）、且 04 §5.4 潰走穿越敵境與 §3.7「不制壓不遭遇」自相矛盾（onArriveNode 會 declareWar/subjugate） | 04, 07, 15 | 07 §3.4 為潰走行為單一擁有者；04 §5.4 `onArriveNode` 對 `status∈{routed,retreating}` 加守衛（不 declareWar/subjugate/遭遇）；15 §5.2 表 C 增列 |
| E-63 | 多方同節點交戰：04 §3.9 規則1「所有敵對部隊全捲入同一野戰」vs 07 §3.3「取兵數最大兩勢力、餘待機」 | 04, 07 | 依 07 §3.3；改 04 §3.9 規則1 末句 |
| E-64 | 合戰發動 tick 步序：03 §3.7.2 Step1 建 Battle 凍結時間，但同 tick `military.combat` 仍推進該 FieldCombat；FieldCombat 缺 `interrupted` 旗標 | 02, 03, 07 | 07 §4 FieldCombat 與 02 對應型別補 `interrupted`（或 `hasActiveBattle`）；combat step 跳過之 |
| E-65 | 制壓進度外部易主未重置：郡因威風翻轉／落城易主時，`Army.march.subjugation` 無重置規格 | 04, 07 | 07 §3.10/§3.11 與威風翻轉統一補：翻轉任一郡 `ownerClanId` 時掃描 `state.armies` 重置對應 `subjugation` |
| E-66 | 調略 UI 未落地：08 §6.1 宣稱有調略畫面，11 無對應 Panel／wireframe | 08, 11, 13 | 11 補調略 Panel（進行中列表＋新調略精靈）；13 補字串 |
| E-67 | 外交來使 modal 缺：08 §6.1 宣稱有來使 modal（回應他勢力提案），11 §4 ModalId 無之 | 08, 11 | 11 §4 增外交來使 modal（來使勢力／提案／接受拒絕；婚姻顯示成婚武將） |
| E-68 | 12 缺表單控制元件：11 多畫面需單選鈕群組／核取方塊／開關／文字輸入，12 §3.2 二十元件無此 | 11, 12 | 12 §3.2 增 RadioGroup／Checkbox／Switch／TextInput 規格 |
| E-69 | 迷你地圖尺寸衝突：11 §3.3 指定 288×192，12 §3.1.8 `UI.minimapSize` 為正方 | 11, 12 | 世界座標 4096² 正方＋均勻縮放，迷你地圖本質正方；統一二者（建議正方） |
| E-70 | i18n key 正規式不含連字號：13 §3.4.1 key regex 各段 `[a-z][a-zA-Z0-9]*` 不允許 slug 連字號 | 13 | 修正規式使各段允許 `-`（如 `report.save.autosave-failed`） |
| E-71 | 13 缺字串落地：03 §6.2 `cmd.reject.gameOver`／`cmd.reject.debugOnly`、16 §6.5 `report.save.autosaveFailed` 未入 13 主表 | 03, 13, 16 | 13 §6.11/§6.17 補入（值採來源文件定稿） |
| E-72 | 13/14 行內誤字形：13 §3.4.3「高風險字對照」與 14 V10 規則內嵌新字體示例，掃描器會自傷 | 13, 14, 17 | 移除行內誤字形改文字引用 19 §3.12，或列入掃描器 allowlist（見 E-73） |
| E-73 | 掃描器字形集／豁免不完整：17 §5.4 SHINJITAI_L3（17 字）未涵蓋 19 §3.12 全 71 誤字形；17 §3.6 與 19 §4 兩掃描器 allowlist 互不完備 | 17, 19 | 補齊 17 L1~L3 ⊇ §3.12 全 71 字；統一兩掃描器豁免清單（至少含 17/19/14） |
| E-74 | 軍團城指令拒絕碼缺：07 §3.12「軍團城玩家不可直接下內政／出陣」無統一拒絕 reasonKey | 03, 07, 13 | 03 §3.3.2 拒絕原因表增 `cmd.reject.delegatedToCorps`；13 補字串 |
| E-75 | 特性稀有度 token 缺：06 §6.2 指定 `--trait-legendary/rare/common`（值見 12），12 §3.1.2 色彩 token 表無此三 token | 06, 12 | 12 §3.1.2 補三 token 並給值 |
| E-76 | 協定圖示 icon 不足：11 §3.8 稱協定圖示以 12 icon 實作，12 `IconName` 僅 `handshake` | 11, 12 | 修 11 措辭（同盟 handshake、婚／休／從用文字徽章）或 12 增 icon |
| E-77 | 捕虜處置 modal 無 wireframe：11 §4 有 ModalId `captive`、§3.14.3 引用，但缺 wireframe | 11 | 11 §3.x 補捕虜處置 modal wireframe（武將資訊＋招降/釋放/處斬） |
| E-78 | Report/ReportEntry 型別分岔：03 §4.3 `ReportEntry`（改名＋內容模型）vs 02 §4.17 `Report`（存原始 `event`） | 02, 03 | 依 02 §4.17 `Report`；03 改名對齊、內容模型依 02（與 E-31 併同處理） |
| E-79 | 05 §3.5 徵兵施設係數硬編：「有兵舍?1.25:1.0」硬編，未引 `BAL.facBarracksConscriptBonus`(0.25) | 05 | 05 §3.5 改 `(1+BAL.facBarracksConscriptBonus)` |
| E-80 | 17 §3.4 專屬常數對應機制不存在（`upkeepGoldPerSoldierMonth`／`deficitMoralePenalty`／`siegeReliefMoraleBonus`／`devDailyBase` 等）；及 17 別名 `allianceDays/ceasefireDays/battleMinSoldiers/diploWorkGoldPerMonth/commerceCap` 重名權威常數 | 05, 07, 17 | 一律刪除／改引權威（詳見 15 §5.2 表 B/C）；17 §3.4 測試改斷言權威公式 |

---

## 4. 資料結構

術語表本身落地為兩個 TypeScript 常數表（供 lint 工具與 dev 文件頁使用；
**不進 `GameState`、不序列化、不影響模擬**）：

```ts
// tools/glossary/terms.ts —— 由本文件 §3.2~§3.11 表格逐列轉錄
export interface GlossaryEntry {
  zh: string;          // 繁中定稿用語（唯一 key；例：'威風'）
  ja: string;          // 日文原詞（繁體字形轉寫；無對應時為 ''）
  romaji: string;      // 羅馬字（無對應時為 ''）
  en: string;          // 英文（設計溝通用，非 UI 顯示）
  code: string;        // 代碼識別符（型別名/欄位名/enum 值/ID 前綴；無對應時為 ''）
  sourceDoc: string;   // 首次定義文件與章節（例：'07 §3.10'）
  domain:              // 檢索分類
    | 'entity' | 'resource' | 'time' | 'domestic' | 'officer'
    | 'military' | 'diplomacy' | 'event' | 'system' | 'ui';
}
export const GLOSSARY: readonly GlossaryEntry[]; // §3.2~§3.11 全列；zh 不得重複

// tools/glossary/forbiddenChars.ts —— 由本文件 §3.12 表格轉錄
export interface ForbiddenCharEntry {
  correct: string;                    // 正字（單一繁體字元）
  wrong: string[];                    // 誤字形（新字體/簡體；1..2 字元）
  kind: 'shinjitai' | 'simplified' | 'both'; // 誤字來源分類
  exampleWord: string;                // 本作用例（含正字之詞）
}
export const FORBIDDEN_CHARS: readonly ForbiddenCharEntry[]; // §3.12 全 40 組
export const FORBIDDEN_ALLOWLIST_FILES: readonly string[];
// = ['plan/19-glossary.md', 'plan/17-testing.md', 'tools/glossary/forbiddenChars.ts']
// （唯三允許出現誤字形的檔案：本表、17 的掃描黑名單、其轉錄常數）
```

不變量（併入 17 的靜態測試）：

1. `GLOSSARY` 的 `zh` 欄全表唯一；`code` 非空者必須能在 `src/core/` 型別宣告或
   02 §3.2 前綴表中找到同名字串（防止術語表與程式脫鉤）。
2. `FORBIDDEN_CHARS` 展開後的全部 `wrong` 字元，與 17 之 L1~L3 黑名單聯集完全相等
   （雙向：黑名單不得漏收本表、本表不得漏收黑名單）。
3. 「砲」不得出現於任何 `wrong` 欄（E-52c）。

---

## 5. 演算法與公式

本文件不引入任何 `BAL.*` 常數（術語與檢查工具不影響模擬結果；理由見 §8 D4）。
以下為兩個 lint 工具的步驟化虛擬碼。

### 5.1 禁用字元掃描 `tools/glossary-lint.ts --chars`

```
scanForbiddenChars(rootDirs = ['src/', 'plan/', 'tools/', 'tests/']):
  banned = FORBIDDEN_CHARS 全部 wrong 字元的去重集合
  violations = []
  for file in 遞迴列舉 rootDirs 下的 .ts/.tsx/.md/.json（依路徑字典序）:
    if file ∈ FORBIDDEN_ALLOWLIST_FILES: continue
    for (lineNo, line) in 逐行讀取(file, 'utf-8'):
      for ch in line:
        if ch ∈ banned:
          violations.push({ file, lineNo, ch, correct: lookupCorrect(ch) })
  輸出報表（file:line: 誤「ch」→ 正「correct」）
  return violations.length === 0 ? exit 0 : exit 1     // CI 阻斷（17 掛入）
```

邊界條件：以 Unicode code point 逐字比對（`for..of`，避免 surrogate 拆半）；
BOM 與零寬字元先剝除；比對不做正規化（NFC 原樣，黑名單即 NFC 字形）。

### 5.2 術語一致性檢查 `tools/glossary-lint.ts --terms`

```
checkTermConsistency():
  1. 讀取 GLOSSARY 中 code 非空的全部條目
  2. 對 src/i18n/zh-TW.ts 的每個 term.* 字串值 v：
       若存在 GLOSSARY 條目 g 使 v 與 g.zh「同詞異形」（僅 §3.12 誤字形差異）→ 違規
  3. 對 src/data/scenarios/**/*.json 的每個 name/text/label 值：同步驟 2 檢查
  4. 對 GLOSSARY 每條 g.code：
       在 src/core/**/*.ts 全文搜尋該識別符字串；找不到 → 警告（術語表過期）
  5. 回傳違規清單；CI 中步驟 2/3 為 ERROR、步驟 4 為 WARNING
```

### 5.3 勘誤清單消化流程（修正階段指引）

```
for each E-xx in §3.13（依編號序）:
  1. 依「建議定案」欄修改「涉及文件」中非定案側的文件
  2. 於被修文件的 §8 設計決策記錄追加一行：「依 19 §3.13 E-xx 修正」（00 §0 規則 5）
  3. 修畢後於本文件 §3.13 該列尾註「已消化（日期）」——本清單即修正進度追蹤表
  4. 全部消化後，`tools/glossary-lint.ts --terms` 於 CI 轉為 ERROR 級全開
```

---

## 6. UI/UX

本文件無獨立畫面。與 UI 的接點：

1. `term.*` i18n key 的繁中值以本文件 §3.2~§3.11 的「繁中定稿」欄為正字依據（13 收錄主表）。
2. dev 環境提供 `/dev/glossary` 展示路由（沿用 12 §3.6 的元件展示機制）：
   以 `DataTable` 渲染 `GLOSSARY`，欄＝繁中／日文原詞／英文／代碼識別符／首次定義／分類，
   支援全文搜尋——供實作 AI 與資料製作時快速查詢。正式 build 不打包。
3. 本文件不新增 UI 字串（查詢頁為 dev 工具，文字硬編碼即可，不進 `zh-TW.ts`）。

---

## 7. 實作任務清單

- [ ] **T1　GLOSSARY 常數表**：將 §3.2~§3.11 全部表格轉錄為 `tools/glossary/terms.ts`。
      驗收：條目數 ≥ 260；`zh` 唯一性測試通過；每列 `sourceDoc` 非空。
- [ ] **T2　FORBIDDEN_CHARS 常數表**：轉錄 §3.12 全 40 組＋補充規則。
      驗收：與 17 的 L1~L3 黑名單做集合相等測試（§4 不變量 2）；「砲」不在黑名單。
- [ ] **T3　禁用字元掃描器**（§5.1）：`npm run lint:glossary`。
      驗收：對植入「戦」「归」「斎」的暫存檔各偵測 1 筆並非零退出；allowlist 三檔不誤報；
      對現行 repo 全綠（前提：E-52 三處已修）。
- [ ] **T4　術語一致性檢查器**（§5.2）。
      驗收：對 `zh-TW.ts` 植入「合戦」偵測為 ERROR；GLOSSARY 中不存在的識別符產出 WARNING。
- [ ] **T5　/dev/glossary 展示路由**：DataTable＋搜尋。
      驗收：dev build 可開啟並搜尋「威風」得 1 列；`vite build` 產物不含該路由 chunk。
- [ ] **T6　CI 掛載**：T3／T4 加入 17 的 CI pipeline（阻斷級依 §5.3 步驟 5）。
      驗收：CI 綠燈；故意提交含「対」的檔案時 CI 紅燈。
- [ ] **T7　勘誤消化追蹤**：修正階段每消化一條 E-xx，回寫本文件 §3.13 尾註。
      驗收：M1 里程碑（02／03 實作）開始前，A／B 組勘誤（E-01~E-11、E-29~E-32）全數消化。

---

## 8. 設計決策記錄

- **D1｜代碼識別符一律採高優先序文件定案**：衝突時依 `00 > 02 > 系統 > UI`。唯二明定例外：
  (a) E-18 合戰戰場模型採 07（02 §4.9 需重寫）——07 的陣節點圖已被 11 的合戰畫面、
  戰法表、采配機制整體依賴，改 02 一處的成本遠低於改三處；
  (b) E-27／E-38／E-39／E-42 等「02 骨架 vs 系統文件完整機制」型衝突採系統文件機制、
  02 補收欄位——02 的定位是型別彙整，機制語意本就屬系統文件（00 §7）。
  兩類例外皆須回寫 02 並於其 §8 註記。
- **D2｜日文原詞欄以繁體字形轉寫＋羅馬字**：本文件全文（含引用日文詞）不得出現新字體，
  否則 §5.1 掃描器的 allowlist 邏輯會被迫擴大、17 的黑名單自檢也會誤報。
  代價是「日文原詞」非嚴格原文；以羅馬字補足還原資訊。§3.12 表的「誤」欄是唯一例外
  （表的存在目的即列出誤字形），故本文件列入 allowlist。
- **D3｜官位／役職採 02 enum 而非 08 表**：02 的 `CourtRank`／`ShogunateTitle` 是
  string literal union、已被 `Clan` 欄位與 INV 引用；08 的 `crank./stitle.` id 表是平行發明。
  依 D1 原則取 02，08 的門檻／效果表重排即可，機制本身不受影響。
- **D4｜本文件不引入 BAL 常數**：BAL 定位為「影響模擬結果的平衡數值」（00 §11、12 D1）。
  術語表與掃描器是開發期工具，其常數（如黑名單）放 `tools/glossary/`，
  避免 `balance.ts` 被非平衡常數污染。
- **D5｜勘誤清單只列不改**：本文件發現 40 餘處衝突但**不直接修改**任何其他文件
  （含 00——絕對不可改）；修正屬修正階段，依 §5.3 流程逐條消化並回寫追蹤。
  理由：單一 PR 同時改十餘份規格會使審閱不可能；清單化讓每條衝突可獨立驗證。
- **D6｜07 要求的 7 個追加特性名於本文件先行定稿**：`trait.benzetsu` 辯舌等 7 個
  繁中名（§3.5 附表）由本文件定名，供 13（字串）與 14（資料）先行引用，
  免於卡在 06 的表格擴充；06 修正時照抄即可。
- **D7｜易錯字表按「新字體＋簡體」雙欄並列**：實務上兩類誤字來源不同
  （新字體來自日文史料、簡體來自輸入法），分欄可讓 17 的 L1（簡體）／L3（新字體）
  黑名單直接按欄生成；「同繁」標記（拔／姬／德／惠）表示該字簡體與繁體同形、僅防新字體。
- **D8｜統一字形選擇**（§3.12 補充規則）：砲（不用炮）、台（不用臺）、裡（不用裏）、
  著（不用着）、眾（不用衆）。取捨標準：台灣教育部標準字體優先，
  與戰國語感衝突時（無此例）才另議。這五組同時寫入 T2 的正規化建議清單
  （非黑名單，僅 WARNING 級）。
- **D9｜條目粒度**：主表收「機制名詞」與「跨文件溝通詞」，不收單一文件內部的臨時變數名
  （如 `edgeProgressDays`）——後者以 02 型別註解為準即可；收錄標準是
  「會出現在 UI、資料、或兩份以上文件」。

---

*本文件依 `00-foundations.md` §13 規範撰寫；繁中用字以本文件 §3.12 為全案正字依據。*
