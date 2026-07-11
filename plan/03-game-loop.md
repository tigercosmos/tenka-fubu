# 03 — 遊戲主迴圈與核心引擎（Game Loop & Core Engine）

> 依 `plan/00-foundations.md`（下稱 00）§13 規範撰寫。本文件是 tick 引擎、Command 架構、
> 系統執行順序、亂數系統、GameEvent 匯流排與月結流程的**單一真相來源**（00 §7）。

---

## 1. 目的與範圍

本文件定義《天下布武》core 層（`src/core/`）的執行骨架，使實作者能直接寫出：

- `advanceDay`：每日 tick 的 13 步固定流程（00 §5.4），含每步的輸入、輸出與觸發時機。
- Command 架構：玩家指令的提交佇列、驗證器、套用順序、冪等與失敗語意。
- GameEvent 匯流排：core 產生 typed event，`reports` 系統彙整為持久化通知（重要度三級與自動暫停）。
- 亂數系統：mulberry32 的逐位元實作規格、五個具名流、決定論規則與禁令。
- 月結流程：每月 1 日跨步驟的完整結算順序（協定到期改為每日逐日檢查 `endDay`，不綁晦日）。
- 合戰／歷史事件 modal 的子迴圈契約：策略時間凍結、Battle 子狀態機、效果寫回介面。
- 效能骨架：髒標記與增量重算快取、AI 攤平排程器的介面。
- 時間跳轉（debug）與自動存檔 hook 的掛載點。

**不在本文件範圍**：各系統的業務規則（開發公式、戰鬥解算、外交數值……）由 00 §7 分工表
指定的文件定義；本文件只規定「它們何時被呼叫、讀寫什麼、發什麼事件」。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | 最高準則。曆法（§5.1）、速度檔位（§5.2）、13 步順序（§5.4）、決定論（§5.5）皆為 canonical，本文件展開細節。 |
| `plan/01-architecture.md` | 定義 store 橋接與 UI 驅動器的實際檔案位置；本文件定義驅動器必須遵守的契約（§3.1、§3.9）。 |
| `plan/02-data-model.md` | 實體型別（`Clan`／`Officer`／`Castle`……）與 ID 規範以 02 為準。本文件 §4 定義的**迴圈機制型別**（`CommandEnvelope`、`GameEvent`、`RngState` 等）為 canonical，02 彙整收錄時以本文件為準。 |
| `plan/05-domestic.md`～`plan/08-diplomacy.md`、`plan/10-events-and-victory.md` | 各 Command 的 payload 欄位與業務驗證規則、各系統步驟的內部演算法，見各該文件。本文件僅列 Command 清單、通用驗證契約與失敗語意。 |
| `plan/09-ai.md` | AI 決策內容。本文件 §3.8 只定義 AI 排程器介面與 tick 預算。 |
| `plan/15-balance.md` | 本文件引入的 `BAL.*` 常數建議初值，最終定案值以 15 主表為準。 |
| `plan/16-save-and-settings.md` | 自動存檔的實際持久化、設定項預設值。本文件只定義 hook 觸發點（§3.9）。 |
| `plan/17-testing.md` | golden-master 重放測試利用本文件的決定論規則（§3.5）。 |

---

## 3. 設計細節

### 3.1 引擎總覽與資料流

core 是確定性狀態機（00 §3）：

```
(GameState, CommandEnvelope[]) --advanceDay--> GameState' + GameEvent[]
```

- **就地修改（in-place mutation）**：`advanceDay` 直接修改傳入的 `GameState` 並回傳同一參考。
  core 不用 immutable 複製（全國 300+ 郡每日複製成本過高）。UI 層透過 Zustand store 的
  版本遞增通知（`state.meta.stateVersion += 1`，於每次 `advanceDay` 結尾執行）觸發重繪。
- **UI 驅動器**（`src/app/` 內，實際檔案見 01）：`requestAnimationFrame` 累加器（00 §5.3）。
  虛擬碼：

```
loop(frameMs):
  if speed === 'paused' or hasBlockingInteraction(state): accMs = 0; return
  accMs += frameMs
  ticks = 0
  while accMs >= msPerDay(speed) and ticks < BAL.maxTicksPerFrame:
    result = core.advanceDay(state, queue.drain())
    hooks.onAfterTick(result)
    if result.autoPauseReasons.length > 0: setSpeed('paused'); hooks.onAutoPause(...); break
    accMs -= msPerDay(speed); ticks += 1
  if ticks === BAL.maxTicksPerFrame: accMs = 0   // 防止螺旋落後
```

- `msPerDay`：`BAL.tickMsX1 = 600`、`BAL.tickMsX2 = 300`、`BAL.tickMsX5 = 120`（00 §5.2 canonical）。
- `BAL.maxTicksPerFrame = 4`（建議初值）：單一 frame 最多補跑 4 個 tick，超過即丟棄累積毫秒。
- `hasBlockingInteraction(state)`：selector，回傳 `true` 當（a）玩家參與的 `Battle` 尚未
  `resolved`，或（b）存在等待玩家選擇的歷史事件（`state.events.pendingChoice != null`，型別見 10）。
  為 `true` 時策略時間凍結（§3.7）。

### 3.2 advanceDay：13 步流程

#### 3.2.1 函式簽名

```ts
function advanceDay(state: GameState, queue: CommandEnvelope[]): TickResult;
```

事件收集採「本 tick 事件陣列」：各系統透過 `emit(event)` 追加，第 13 步 `reports` 統一消費。
事件**不持久化**；持久化的是 `Report`（§3.4.3；型別依 02 §4.17，E-78）。

#### 3.2.2 觸發時機表（canonical）

`absoluteDay` 定義：`absDay = (year − state.time.startYear) * 360 + (month − 1) * 30 + (day − 1)`，
劇本開始日為 0。輔助判定式：

| 時機 | 判定式 | 說明 |
|---|---|---|
| 每日 | 恆真 | 每次 `advanceDay` 都執行 |
| 每月 1 日（月初） | `state.time.day === 1` | 月結主日 |
| 每季初 | `day === 1 && month ∈ {3, 6, 9, 12}` | 春 3／夏 6／秋 9／冬 12（00 §5.1） |
| 每年 1 月 1 日 | `day === 1 && month === 1` | 年結（元服、年齡遞增） |
| 秋收：9 月 1 日 | `day === 1 && month === 9` | 石高入庫（00 §5.1） |

#### 3.2.3 各步驟的輸入／輸出／觸發時機

以下每步標注：**頻率**（該步每日都被呼叫，但內部依時機表閘控）、**讀**（輸入的 state 區塊）、
**寫**（輸出的 state 區塊）、**發**（代表性 GameEvent）。內部演算法見「詳見」欄指向的文件。

**Step 1 `applyCommands`** — 頻率：每日。
- 讀：`queue`（本 tick 前收到的全部 `CommandEnvelope`，依 `seq` 升冪）、全 state（驗證用）。
- 寫：依各 Command 定義（見 §3.3.4 表）；`state.meta.lastAppliedCmdSeq`。
- 發：`command.rejected`（驗證失敗時）。
- 詳見：驗證與套用契約 §3.3；各 payload 見 05/06/07/08/10。

**Step 2 `time`** — 頻率：每日。
- 讀：`state.time`。
- 寫：`state.time`（`day += 1`，進位月、年；更新 `season`、`absoluteDay`）。
- 發：`time.monthStart`（1 日）、`time.seasonStart`（季初）。
  年初（1/1）、秋收（9/1）不發 GameEvent——對應結算改由各步以 `state.time`
  日期直接閘控（年結 Step 9、秋收 Step 6；二輪裁決 C）。協定到期改為 Step 4 每日檢查
  `endDay`（08 §5.1），不綁晦日、月末不再有特殊結算。
- 注意：Step 2 之後的所有步驟看到的是**新日期**。Step 1 的 Command 以舊日期驗證。

**Step 3 `events`** — 頻率：每日；歷史事件條件判定閘控在每月 1 日，汎用事件（一揆等）每日。
- 讀：`state.events`（事件旗標、已觸發集合）、觸發條件所需的任意 state、`rng.event`。
- 寫：`state.events`（`pendingChoice`、已觸發集合）；即時效果型事件直接改寫目標實體。
- 發：`event.fired`（歷史/汎用觸發，以 payload `hasChoice` 區分）、`uprising.started`。
- 詳見：`plan/10-events-and-victory.md`。

**Step 4 `diplomacy`** — 頻率：每日（外交工作進度、協定到期逐日檢查 `endDay`）。
- 讀：`state.diplomacy`、`state.clans`、`rng.misc`（調略成敗／敗露、斡旋失敗判定；08、E-47）。
  外交工作無隨機（決定論）；AI 受方對送達提案的接受與否於本步以 `evaluateProposal`
  **決定論結算**（無隨機、不消費 `rng.ai`；08 §5.6.2、備忘錄 E-22 統一結算點），AI 主動送出提案屬 Step 11。
- 寫：`state.diplomacy`（信用、感情、到期協定移除、進行中工作進度）。
- 發：`diplo.envoyArrived`、`pact.signed`、`pact.expired`、`court.rankGranted`、
  `plot.succeeded`、`plot.failed`。
- 詳見：`plan/08-diplomacy.md`。

**Step 5 `development`** — 頻率：每日（小步進）。
- 讀：`state.districts`、`state.officers`（領主能力）、`state.clans`（政策修正）。（05 §3.2 開發與經濟結算無隨機，本步不消費亂數，E-47。）
- 寫：`state.districts`（開發度、石高、商業、治安、人口的每日增量）。
- 發：無（`development.completed` 已廢除——無消費者，四輪裁決 C-5；`development.districtGrown` 亦無消費者不發，二輪裁決 C；開發進度由 UI 讀 District 狀態呈現）。
- 詳見：`plan/05-domestic.md`。

**Step 6 `economy`** — 頻率：兵糧消耗每日；收入與維持費每月 1 日；秋收 9 月 1 日。
- 讀：`state.clans`、`state.castles`、`state.districts`、`state.armies`。
- 寫：`state.clans.gold`（收入、維持費）、`state.castles.food`（消耗、秋收）、`state.armies.food`（行軍攜行糧消耗）。
- 發：`economy.income`、`economy.upkeepUnpaid`、`economy.harvest`、`economy.foodShortage`。
- 順序（canonical，月結見 §3.6）：收入 → 維持費 → 兵糧消耗。
- 詳見：`plan/05-domestic.md`（公式）、`plan/07-military.md`（部隊攜行糧）。

**Step 7 `military.movement`** — 頻率：每日。
- 讀：`state.armies`、地圖節點圖、`state.districts`（制壓目標）、`rng.misc`（遭遇雜項判定）。
- 寫：`state.armies`（位置、路徑進度）、`state.districts.ownerClanId`（制壓完成翻轉）。
- 發：`army.departed`、`army.arrived`、`army.blocked`、`district.subjugated`。
  （`army.blocked`＝行軍受阻於節點轉 holding 待命〔validateNextStep 失敗，04 §5.4〕，取代舊
  「直發 `report.march.blocked`」，13 §6.11 `report.army.blocked` 消費；四輪裁決 C-6。
  遭遇以既有 `battle.started` 表達、我方失郡以 `district.subjugated` 之 `fromClanId` 判別，
  不另立 `military.encounter`／`military.districtLost`；二輪裁決 C。）
- 詳見：`plan/04-map-and-movement.md`。

**Step 8 `military.combat`** — 頻率：每日。
- 讀：`state.armies`、`state.battles`、`state.castles`、`rng.battle`。
- 寫：野戰自動解算 tick（兵力、士氣）、攻城 tick（耐久、城內兵糧）、`state.battles`
  （建立可發動合戰的旗標；玩家合戰本體在 modal 子迴圈跑，見 §3.7）。
  已被 `startKassen` 升格為合戰之 `FieldCombat` 標記 `interrupted`，本步跳過其自動推進（E-64）。
- 發：`battle.kassenAvailable`、`battle.ended`（`winnerClanId` 判勝負）、`siege.started`、
  `siege.ended`（`fallen` 區分落城/解圍）、`awe.triggered`（AI 對 AI 自動解算時）。
  （攻城進度不發 `siege.progress`——UI overlay 讀 `Siege`/`Castle` 狀態同步，見 11 §3.11.2；二輪裁決 C。）
- 詳見：`plan/07-military.md`。

**Step 9 `officers`** — 頻率：每日呼叫；忠誠變化與壽命死亡判定閘控每月 1 日；元服每年 1 月 1 日。
- 讀：`state.officers`、`state.clans`、`rng.misc`（忠誠擾動、出奔、登用判定）。
  （壽命死亡為開局以 `rng.event` 排定 `scheduledDeath` 後之定值比對，本步不消費亂數；06 §3.9.1，E-47。）
- 寫：`state.officers`（忠誠、年齡、生死、出奔）、`state.clans`（當主死亡繼承）。
- 發：`officer.loyaltyLow`、`officer.defected`、`officer.died`、`officer.comingOfAge`、`officer.promoted`。
- 詳見：`plan/06-officers.md`。

**Step 10 `proposals`** — 頻率：每月 1 日（生成）；每日（逾期作廢檢查）。
- 讀：`state.officers`、`state.districts`、`state.castles`、`rng.ai`。
- 寫：`state.proposals`（新增 `Proposal`、逾期標記）。
- 發：`proposal.submitted`、`proposal.expired`。
- 詳見：`plan/06-officers.md`（具申機制）、`plan/09-ai.md`（生成邏輯）。

**Step 11 `ai`** — 頻率：評定入列每月 1 日；評定消化與反應式決策每日（§3.8.2 排程器）。
- 讀：全 state（唯讀決策）、`state.ai`（排程器狀態）、`rng.ai`。
- 寫：AI 直接呼叫與 Command 共用的 apply 函式改寫 state（不進玩家佇列，見 §3.3.5）；`state.ai`。
- 發：由被呼叫的 apply 函式發出（與玩家指令相同的事件）。
- 詳見：`plan/09-ai.md`。

**Step 12 `victory`** — 頻率：每日（廉價檢查：僅在 `state.meta.territoryChangedToday` 髒標記為真時做全量統計）。
- 讀：`state.clans`、`state.castles`、勝敗條件定義。
- 寫：`state.meta.gameOver`（勝敗旗標與結局種類）。
- 發：`game.victory`、`game.defeat`、`clan.destroyed`。
- 詳見：`plan/10-events-and-victory.md`。

**Step 13 `reports`** — 頻率：每日。
- 讀：本 tick 事件陣列、`state.time`、玩家勢力 ID。
- 寫：`state.reports`（追加 `Report`、修剪保留期）；計算 `TickResult.autoPauseReasons`。
- 發：無（本步是事件的終端消費者）。
- 詳見：§3.4。

#### 3.2.4 advanceDay 完整虛擬碼

```
advanceDay(state, queue) -> TickResult:
  events: GameEvent[] = []
  emit = (e) => events.push(e)

  applyCommands(state, queue, emit)                    // Step 1（舊日期）
  timeSystem(state, emit)                              // Step 2（日期 +1）
  eventsSystem(state, emit)                            // Step 3
  diplomacySystem(state, emit)                         // Step 4
  developmentSystem(state, emit)                       // Step 5
  economySystem(state, emit)                           // Step 6
  militaryMovementSystem(state, emit)                  // Step 7
  militaryCombatSystem(state, emit)                    // Step 8
  officersSystem(state, emit)                          // Step 9
  proposalsSystem(state, emit)                         // Step 10
  aiSystem(state, emit)                                // Step 11
  victorySystem(state, emit)                           // Step 12
  autoPauseReasons = reportsSystem(state, events)      // Step 13

  state.meta.territoryChangedToday = false             // 重置每日髒標記
  state.meta.stateVersion += 1
  return { state, events, autoPauseReasons, perf: samplePerf() }
```

規則：**任何系統不得跳過**（即使當日無事可做也要被呼叫，由內部時機閘控早退），
確保重放時呼叫序完全一致。

### 3.3 Command 架構

#### 3.3.1 生命週期

```
UI 操作 → 建立 Command → queue.enqueue()（指派 seq）→ [下一個 tick 開頭 Step 1]
        → 硬驗證 validate() → ok: applyCommand()（原子） / fail: emit command.rejected
```

- **提交佇列**位於 app 層（`src/app/`），core 不持有佇列；`advanceDay` 收到的是本 tick 前
  `drain()` 出的陣列。任意時刻可提交（含暫停中），一律於下一個 tick 開頭統一結算（00 §5.2）。
- `seq` 由佇列指派：全域單調遞增整數，隨存檔保存於 `state.meta.lastAppliedCmdSeq` 之後接續，
  重放紀錄（見 17）記載 `(absoluteDay, seq, command)` 三元組。
- 單 tick 套用上限 `BAL.maxCommandsPerTick = 200`（建議初值）：超出的留在佇列下一 tick 處理
  （保持 seq 順序）。此上限僅防禦異常灌入，正常遊玩不會觸及。

#### 3.3.2 驗證器（Validator）

每種 Command 有一個純函式驗證器：

```ts
type Validator<C extends Command> = (state: Readonly<GameState>, cmd: C) => ValidationResult;
```

- **兩段驗證**：
  1. **軟驗證（submit-time）**：UI 在按鈕致能與確認對話框即時呼叫同一個驗證器，僅供回饋，
     結果可能因狀態變化而過時，**不具權威性**。
  2. **硬驗證（apply-time）**：Step 1 內套用前必經；唯一權威判定。
- 驗證器**禁止**：消費亂數、修改 state、讀取 UI 狀態。違反即破壞決定論（§3.5.4 禁令 2）。
- 失敗回饋：發出 `command.rejected` 事件（severity `warning`），內含 `reasonKey`（i18n key）
  與插值參數；Step 13 轉為 `Report`，UI 以 toast 呈現（§6）。

通用拒絕原因（各 Command 可另定義專屬原因，見各系統文件）：

| `reasonKey` | 條件 |
|---|---|
| `cmd.reject.notOwner` | 目標實體不屬於 `clanId`（發令勢力） |
| `cmd.reject.invalidTarget` | 目標 ID 不存在或已消滅 |
| `cmd.reject.insufficientGold` | `clan.gold < cost` |
| `cmd.reject.insufficientFood` | `castle.food < cost` |
| `cmd.reject.insufficientTroops` | 城內可動員兵力不足 |
| `cmd.reject.officerBusy` | 指定武將已有進行中任務 |
| `cmd.reject.alreadyActive` | 重複啟動已在進行的項目 |
| `cmd.reject.rankTooLow` | 武將身分不符任命門檻（00 §4） |
| `cmd.reject.pathBlocked` | 無法規劃合法路徑 |
| `cmd.reject.gameOver` | 勝敗已判定，僅接受 debug 指令 |
| `cmd.reject.debugOnly` | 非 debug 模式下提交 debug 指令 |
| `cmd.reject.delegatedToCorps` | 目標城已編入軍團，玩家不可直接對其下內政／出陣指令（07 §3.12，E-74） |

#### 3.3.3 套用順序、原子性與冪等

- **套用順序＝提交序**：嚴格依 `seq` 升冪。同一 tick 內先提交者先套用，後續 Command 的
  驗證看得到前面 Command 的效果（例：先徵兵、再出陣，同 tick 合法）。
- **原子性**：`applyCommand` 全有或全無。驗證通過後的套用**不得再失敗**——一切可失敗條件
  必須在驗證器內窮盡；若套用中遇到理論上不可能的狀態，擲出例外令 golden test 失敗（fail-fast），
  不做部分回滾。
- **冪等防線**：Step 1 跳過 `seq <= state.meta.lastAppliedCmdSeq` 的 envelope。
  存讀檔（16）與重放（17）依此保證每個 Command 至多套用一次。
- **重複提交語意**：同一玩家對同一目標再次下達同型指令（新 `seq`）不是冪等重試，
  依 §3.3.4 表逐一定義為「拒絕／覆蓋／疊加」三種之一。

#### 3.3.4 Command 一覽表（canonical 清單；payload 見擁有文件）

| CommandType（判別值一律採 02 §4.18 名，E-29） | 擁有文件 | 主要驗證重點 | 重複提交語意 |
|---|---|---|---|
| `setDevelopFocus`（郡開發指示） | 05 | 直轄郡、金錢足夠 | 覆蓋（改開發方針） |
| `grantFief`（知行任命領主） | 05, 06 | 郡屬我方、武將身分與知行上限 | 覆蓋（換領主） |
| `grantFief`（收回直轄，`officerId=null`） | 05 | 郡有領主 | 拒絕 `alreadyActive`（已直轄） |
| `buildFacility`（城下施設；下單即入建設佇列、全額扣造價，E-39） | 05 | 金錢足夠、建設佇列未滿（≤ `BAL.buildQueueSize`）、該施設未建成/未在佇列 | 疊加（各施設入佇列）；同施設拒絕 `alreadyActive` |
| `cancelBuild`（取消佇列建設；退款造價×`BAL.buildRefundRate`，E-39） | 05 | `queueIndex` 指向存在的佇列項 | 拒絕 `invalidTarget`（項已消化/不存在） |
| `demolishFacility`（拆除已建成施設） | 05 | 施設已建成 | 拒絕 `invalidTarget` |
| `setConscriptPolicy`（設定城徵兵方針，E-42） | 05 | 城屬我方 | 覆蓋（改方針 low/mid/high） |
| `transport`（輸送金錢/兵糧/兵力） | 05 | 來源城庫存、路徑連通 | 疊加（每筆為獨立輸送隊） |
| `recallTransport`（撤回輸送隊，E-41） | 05 | 輸送隊屬我方且進行中 | 拒絕 `invalidTarget` |
| `enactPolicy`（施行政策） | 05 | 威信門檻、金錢、互斥政策 | 拒絕 `alreadyActive` |
| `revokePolicy`（廢止政策） | 05 | 政策施行中 | 拒絕 `invalidTarget` |
| `setCastleControl`（切換直轄/委任） | 05 | 城屬我方 | 覆蓋 |
| `march`（編成出陣） | 07 | 城內兵力、大將指定、目標節點 | 疊加（可多路出兵） |
| `setArmyTarget`（改路徑/目標） | 07 | 部隊屬我方、路徑合法 | 覆蓋 |
| `recallArmy`（撤收） | 07 | 部隊屬我方 | 拒絕 `alreadyActive`（已在回程） |
| `setAutoReturn`（切換自動歸還，E-32） | 07 | 部隊屬我方 | 覆蓋 |
| `startKassen`（對進行中野戰發動合戰） | 07 | `battle.kassenAvailable` 旗標存在、兵力門檻 | 拒絕 `invalidTarget`（機會已逝） |
| `setSiegeMode`（強攻/包圍切換） | 07 | 我方為圍城方 | 覆蓋 |
| `useBetrayal`（圍城發動內應，E-32） | 07 | 我方為圍城方、持有該城內應成果、本場未用過 | 拒絕 `alreadyActive`（本場已發動） |
| `createCorps`（設立軍團） | 07 | 軍團長身分家老以上、城群連通 | 拒絕 `alreadyActive` |
| `setCorpsDirective`（設定軍團方針） | 07 | 軍團屬我方；`advance` 須目標節點 | 覆蓋 |
| `assignCastleToCorps`（城編入/移出軍團，`corpsId=null` 為移出） | 07 | 城屬我方、軍團存在 | 覆蓋 |
| `dissolveCorps`（解散軍團） | 07 | 軍團存在 | 拒絕 `invalidTarget` |
| `startDiploWork`（外交工作，`target`=勢力） | 08 | 金錢、使者武將空閒 | 拒絕 `alreadyActive`（同對象進行中） |
| `startDiploWork`（朝廷獻金，`target='court'`；每月扣固定 `BAL.courtWorkMonthlyCost`→`courtFavor`，見 08 §3.5，E-27） | 08 | 金錢、使者武將空閒 | 拒絕 `alreadyActive`（獻金工作進行中） |
| `startDiploWork`（幕府獻金，`target='shogunate'`；每月扣固定 `BAL.shogunateWorkMonthlyCost`→`shogunateFavor`，見 08 §3.6.2，三輪裁決 2） | 08 | 金錢、使者武將空閒 | 拒絕 `alreadyActive`（獻金工作進行中） |
| `stopDiploWork`（撤回外交／獻金工作） | 08 | 對該對象有進行中工作 | 拒絕 `invalidTarget`（無進行中工作） |
| `proposePact`（提案協定） | 08 | 信用門檻、無互斥協定 | 拒絕 `alreadyActive` |
| `respondPact`（回應來使） | 08 | 存在待回應提案 | 拒絕 `invalidTarget`（已回應） |
| `breakPact`（破棄協定） | 08 | 協定存在、非鎖定期（婚姻 36 月；停戰無此路徑，見 08 §5.3.3） | 拒絕 `invalidTarget` |
| `requestCourtRank`（請求敘任官位） | 08 | `courtFavor` 門檻、金錢、逐階（08 §5.4.1） | 拒絕 `rankTooLow`／`alreadyActive` |
| `requestMediation`（請朝廷斡旋停戰） | 08 | 與目標交戰中、`courtFavor` 門檻、金錢（08 §5.4.2） | 拒絕 `alreadyActive` |
| `requestShogunateTitle`（申請幕府役職） | 08 | 幕府存在、威信/友好度/前階（08 §3.6） | 拒絕 `rankTooLow`／`alreadyActive` |
| `nominateShogun`（擁立將軍） | 08 | 幕府擁立條件（08 §3.6.3） | 拒絕 `alreadyActive` |
| `startPlot`（調略：引拔/流言/內應） | 08 | 執行武將知略門檻、金錢 | 疊加（不同目標）；同目標拒絕 |
| `cancelPlot`（中止調略；無退款） | 08 | 調略進行中 | 拒絕 `invalidTarget` |
| `recruitRonin`（登用浪人）／`handleCaptive`（俘虜，`action='recruit'`） | 06 | 目標為浪人或俘虜、金錢 | 拒絕 `alreadyActive` |
| `rewardOfficer`（金錢褒賞；三檔 small/medium/large，E-29） | 06 | 金錢足夠（依 tier，`BAL.rewardGold*Cost`） | 疊加（年內忠誠增益遞減，見 06 §3.8.1） |
| `promoteRank`（身分推舉/升格，E-32） | 06 | 武將屬我方、未達身分上限、條件（06 §3.8.3） | 拒絕 `rankTooLow`／`alreadyActive` |
| `appointLord`（任命城主） | 06 | 身分侍大將以上 | 覆蓋 |
| `handleCaptive`（俘虜處置：釋放/處斬） | 06 | 俘虜存在 | 拒絕 `invalidTarget` |
| `resolveProposal`（裁可/駁回具申） | 06 | 具申未逾期 | 拒絕 `invalidTarget`（已結案） |
| `invokeTaimei`（發動大命） | 10 | 大命點數/條件 | 拒絕 `alreadyActive` |
| `resolveEventChoice`（歷史事件選擇） | 10 | `pendingChoice` 存在且選項合法 | 拒絕 `invalidTarget` |
| `debugSkipDays`（時間跳轉） | 03（本文件 §3.9） | debug 模式 | 疊加 |
| `debugGrant`（資源作弊） | 03（本文件 §3.9） | debug 模式 | 疊加 |

本表為佇列型策略指令全集，與 02 §4.18 聯集一致（以 02 §4.18 為準）。合戰內指令
`battleMove`／`battleAttack`／`battleTactic`／`battleDelegate` 不走提交佇列、由合戰子迴圈以
`BattleCommand` 直接處理（§3.7.2），故列於 §4.2 `CommandType` 聯集而不列於本表。

擴充規則：新增 Command 必須（a）加入 `Command` 聯集、（b）登錄驗證器與 apply 函式、
（c）在擁有文件補列本表同格式資訊。

#### 3.3.5 AI 與 Command 的關係（canonical 決策）

AI（Step 11）**不經過玩家佇列**，直接同步呼叫與 Command 相同的 apply 函式
（共用驗證器；驗證失敗即放棄該行動，不發 `command.rejected` 事件——AI 的失誤不打擾玩家）。
理由與後果見 §8 D2。因此重放紀錄只需（劇本、種子、玩家 Command 序列）三者。

### 3.4 GameEvent 匯流排與報告系統

#### 3.4.1 typed event

事件是 discriminated union（`type` 為判別欄），只存在於單一 tick 的記憶體內。
canonical 完整事件型別清單見 02 §4.19 總表（E-30）；本文件 §4.3 為 03 步驟發出／消費之子集鏡射，
各系統文件可擴充，但必須同步登錄 §3.4.2 的分級表與 02 §4.19。

`save.autosaveFailed` **不屬本事件匯流排**（02 §8 六輪裁決 4）：自動存檔失敗係 app 層 I/O 失敗
（IndexedDB 配額／寫入錯誤），非決定論、core 不感知，不得建模為 `GameEvent` 或經 `reportsSystem`／
`state.reports`（§3.4.3、§5.4 golden hash 之非決定論禁令）——core 不做 I/O（§3.9.1）。改由 16 §5.3
季首 autosave hook 於 app 層直接呈現 UI 通知（`ui.save.autosaveFailed` toast＋HUD 警示
`ui.hud.autosaveSuspendedTip`），非 core Report 機制；與 §3.9.1 `TickHooks.onAutosave`（正常存檔時點
掛鉤）為不同關注點，兩者不可混同。

#### 3.4.2 重要度分級與自動暫停對應（canonical）

三級：`'info'`（情報）／`'warning'`（警告）／`'critical'`（重大）。
自動暫停僅對**玩家勢力相關**事件觸發，且每項皆可於設定關閉（00 §5.2；預設值見 16）。

| 事件 type | 重要度 | 自動暫停原因（`AutoPauseReason`） | 說明 |
|---|---|---|---|
| `time.monthStart` | info | `monthStart` | 月初（00 §5.2 列名） |
| `siege.started`（我方城被圍） | critical | `siegeOnPlayer` | 00 §5.2 列名 |
| `battle.kassenAvailable`（玩家可發動） | critical | `battleAvailable` | 00 §5.2 列名 |
| `proposal.submitted` | info | `proposalArrived` | 具申送達（00 §5.2 列名） |
| `diplo.envoyArrived` | warning | `envoyArrived` | 外交來使（00 §5.2 列名） |
| `diplo.workStopped` | 涉我方 warning；否則 info | — | 外交/獻金工作因金錢不足中止（08；六輪裁決 1） |
| `event.fired`（`hasChoice=true`） | critical | `historicalEvent` | 開 modal（00 §5.2 列名） |
| `battle.ended`（我方參戰） | critical | —（modal 已凍結時間） | 依 payload `winnerClanId` 判勝負 |
| `siege.ended`（`fallen=true` 我方城陷落） | 我方 critical；他勢力 info | — | |
| `officer.died` / `officer.defected` | 我方 warning；他勢力 info | — | |
| `officer.loyaltyLow` | warning | — | 忠誠 < 30（00 §6） |
| `economy.upkeepUnpaid` / `economy.foodShortage` | warning | — | |
| `economy.granaryOverflow` | warning | — | 米藏溢出兵糧散失（05；六輪裁決 1） |
| `policy.autoRevoked` | warning | — | 政策維持費不足自動廢止（05；六輪裁決 1） |
| `uprising.started` | 我方領內 warning；他勢力 info | — | |
| `uprising.ended` | 我方領內 warning；他勢力 info | — | 一揆結束（`suppressed`／`subsided`；05；比照 `uprising.started`；六輪裁決 1） |
| `pact.expired` / `pact.broken` | 涉我方 warning；否則 info | — | |
| `court.mediationResult` | 涉我方（`clanId`／`targetClanId`）critical；否則 warning | — | 朝廷停戰斡旋結算（08；六輪裁決 1） |
| `shogunate.nominated` | critical（不分視角） | — | 上洛擁立將軍成立、世界級廣播（08；六輪裁決 1） |
| `shogunate.patronLost` | 當事勢力 warning | — | 擁立資格喪失、僅當事勢力可見（08；13 render 層另行視角過濾；六輪裁決 1） |
| `shogunate.collapsed` | critical（不分視角） | — | 室町幕府滅亡、全域廣播（`clanIds=[]`；08/10；六輪裁決 1） |
| `plot.exposed` / `plot.betrayalActivated` | actor 視角 warning；target 視角 critical | — | 調略敗露／內應圍城發動（08；六輪裁決 1） |
| `clan.destroyed` | info（涉我方另走 `game.defeat`） | — | |
| `game.victory` / `game.defeat` | critical | —（進結局畫面，見 10/11） | |
| `command.rejected` | warning | — | 僅玩家指令會產生 |
| 其餘未列事件 | info | — | 預設情報級 |

> **六輪裁決 1 分級補列說明**：02 §8 六輪裁決記錄以「info/warning」「major/critical」「warning/major」
> 等區間描述新收 10 事件之分級意向；本表僅有三級（`info`/`warning`/`critical`，00 未定義第四級），
> 故依語意折算：(a) `uprising.ended`／`diplo.workStopped` 比照既有「涉我方/否則」二分慣例
>（同 `uprising.started`／`pact.expired`/`pact.broken`）定為 warning/info；(b) `court.mediationResult`／
> `shogunate.nominated`／`shogunate.collapsed` 屬朝廷/幕府政局大事，較「涉我方/否則」二分再拉高一階，
> 定為 critical/warning；`shogunate.nominated`／`shogunate.collapsed` 為世界級廣播（無「涉我方」概念、
> 全員同一嚴重度），一律 critical，且**必須非 info** 使 `shogunate.collapsed`（`clanIds=[]`）與
> `shogunate.nominated`（`clanIds=[clanId]` 僅含 patron）仍能對非當事勢力玩家推送（`sev!=='info'` 即入庫，
> 與 `time.*` 空 `clanIds` 同慣例——`isPlayerRelevant` 對空陣列恆為 false，須靠 severity 頂替）；
> (c) `plot.exposed`／`plot.betrayalActivated` 依 13 §3.7(3) 既有 actor/target 雙視角分流（`report.plot.exposed`
> vs `report.plot.exposedByEnemy`；betrayal 亦分雙方影響），故不用「涉我方/否則」而按角色分流：
> actor（發起／得利方）warning、target（被害方）critical——遭圖謀/城陷落對受害一方衝擊顯著較高。
> `shogunate.patronLost` 依 02 明文「僅當事勢力可見」單列 warning，非當事勢力之顯示由 13 render 層
> （非本表）過濾為 null，與本表分級（決定是否入庫）為不同關注點。

同一 tick 多個自動暫停原因會合併去重後放入 `TickResult.autoPauseReasons`（陣列，依上表列序排序）。

#### 3.4.3 reports 系統（Step 13）行為

```
// 不產生 Report 之事件型別（13 §3.7(5) 權威登錄；renderReport 對此清單恆回傳 null，
// 故提前排除、不入 state.reports，避免存入無法顯示之死列——五輪備忘承接，本輪定案）：
const NOT_REPORTED: ReadonlySet<GameEventType> = new Set([
  'time.monthStart', 'time.seasonStart',   // app 層季首自動存檔消費（16 §5.3）
  'game.victory', 'game.defeat',           // 直接切結局畫面（10 §6.4）
  'policy.enacted', 'policy.revoked',      // 玩家主動操作之即時結果，UI 當下已回饋
  'proposal.resolved',                     // 玩家裁決之即時結果，UI 當下已回饋
  'conscript.completed',                   // 逐城逐月觸發，逐一報告灌爆報告匣
]);

reportsSystem(state, events) -> AutoPauseReason[]:
  for e of events:                          // 依發出順序
    if NOT_REPORTED.has(e.type): continue   // 命中即不 push Report（13 §3.7(5)）；不影響下方 autoPause／events 本身
    sev  = severityOf(e, state.meta.playerClanId)   // §3.4.2 表（由 event 即時推導，不入庫）
    if isPlayerRelevant(e) or sev !== 'info':
      state.reports.push(makeReport(e))   // Report 存原始 event（02 §4.17）；顯示 key／params 由 UI 層 renderReport(report, state, playerClanId) 依 13 §3.7 導出（五輪裁決 A）
  // 修剪：保留最近 BAL.reportRetentionDays = 360 日內，且總數 ≤ BAL.reportMaxKept = 500
  //（超量時先丟最舊的 info 級，再丟最舊的 warning 級；critical 不受總數修剪、僅受日數修剪；severity 由 report.event 推導）
  return dedupedAutoPauseReasons(events, state.settings)
  // ↑ 讀入參 events 全集（非 state.reports），故 NOT_REPORTED 排除不影響自動暫停判定——
  //   time.monthStart 之 monthStart 自動暫停（§3.4.2）、game.victory/defeat 之結局畫面切換
  //   （由驅動器/10 §6.4 另行讀 events 判定，非經本函式回傳值）皆不受影響。
```

- `NOT_REPORTED` 命中者即使 `isPlayerRelevant` 為真或 `sev !== 'info'` 亦不 push（13 §3.7(5) 為權威登錄，
  本清單為其在 03 執行面的落實；擴充須同步登錄 13 §3.7(5) 與本清單兩處）。
- 純他勢力之間的 info 事件（如 AI 互相開發）**不產生** `Report`，只在事件陣列供
  UI 當日 ticker 顯示（若 UI 有訂閱），避免報告匣被灌爆。
- 報告的跳轉目標（相關城／武將／部隊）由 UI 依 `Report.event` 內容推導（11 定義跳轉行為）。

### 3.5 亂數系統

#### 3.5.1 mulberry32 實作規格（canonical，逐位元固定）

`src/core/rng.ts`。狀態為單一 uint32，產生下一亂數的演算法**必須逐位元一致**（golden test 依賴）：

```
next(streamState: uint32) -> (float64 in [0,1), newState: uint32):
  s = (streamState + 0x6D2B79F5) >>> 0
  t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
  value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return (value, s)
```

衍生 API（全部以 `next()` 為唯一熵源，呼叫次數固定可預期）：

```
nextInt(min, max)  = min + floor(next() * (max − min + 1))   // 含兩端整數；消費 1 次
chance(p)          = next() < p                              // p ∈ [0,1]；消費 1 次
pick(arr)          = arr[nextInt(0, arr.length − 1)]         // arr 非空；消費 1 次
shuffle(arr)       = Fisher–Yates 自尾向頭；消費 arr.length − 1 次
```

`nextInt` 採 floor 映射而非 rejection sampling：偏差 < 2⁻³²，可忽略（§8 D7）。

#### 3.5.2 五個具名流與種子推導

| 流名 | 用途（實際消費者；依 05／06／08 各系統文件，E-47） |
|---|---|
| `battle` | Step 8 野戰/攻城自動解算、合戰子迴圈（§3.7）（07） |
| `dev` | 保留流；05 §3.2 明定開發與經濟結算無隨機，v1 無消費者 |
| `ai` | Step 10 具申生成、Step 11 AI 決策（09） |
| `event` | Step 3 歷史/汎用事件判定（10）、一揆爆發判定（05 §3.8）、開局武將壽命排程（06 §3.9.1，於劇本初始化執行） |
| `misc` | Step 4 調略成敗／敗露／斡旋失敗（08；外交工作無隨機、`evaluateProposal` 決定論）、Step 7 遭遇（04）、Step 9 出奔／登用／捕虜／月度忠誠擾動（06）、浪人生成 |

種子推導（新遊戲開始時執行一次）：

```
fnv1a32(str) -> uint32:
  h = 0x811C9DC5
  for byte b of utf8(str): h = Math.imul(h ^ b, 0x01000193) >>> 0
  return h >>> 0

initRng(masterSeed: uint32) -> RngState:
  for name of ['battle','dev','ai','event','misc']:
    s = (fnv1a32('tenka:' + name) ^ masterSeed) >>> 0
    重複 BAL.rngWarmupDraws = 12 次 next() 空轉（去除低熵種子相關性）
    rng[name] = s'
  rng.masterSeed = masterSeed
```

`masterSeed` 由標題畫面產生（可由玩家輸入指定，見 16）；**產生 masterSeed 是 UI 層唯一
允許使用 `Math.random` 的地方**。

#### 3.5.3 狀態存放

五流目前狀態（各一個 uint32）＋ `masterSeed` 存於 `GameState.rng`（型別 §4.4），
隨存檔序列化。讀檔後不重新播種、直接續用，保證跨存讀的決定論。

#### 3.5.4 決定論規則與禁令（canonical）

1. core 內**禁用** `Math.random`、`Date.now`、`performance.now`、`crypto.getRandomValues`
   （ESLint `no-restricted-*` 規則強制，見 17）。
2. 驗證器、selector、任何唯讀查詢**禁止消費亂數**。亂數只能在 systems 的 apply 路徑消費。
3. 亂數消費次數不得依賴：速度檔位、渲染狀態、設定值、是否開啟 modal、是否為玩家勢力。
   （例：AI 對 AI 的野戰與玩家野戰必須走同一解算程式、同一消費序。）
4. 各流僅限 §3.5.2 表列消費者使用，禁止跨流借用。
5. 疊代 `Record<string, T>` 一律 `Object.keys(obj).sort()` 後疊代；`Array.prototype.sort`
   必須提供全序比較器（同值以 id 字典序 tie-break）。core 內禁止依賴 `Map`/`Set` 插入序疊代
   （除非該序本身由決定性流程建立且有註解證明）。
6. 禁止以浮點累加跨 tick 儲存進度後再比較相等；進度值一律定點化（整數「百分點 ×100」等），
   規則細節由各系統文件遵循。
7. UI 層需要隨機表現（粒子、抖動）時自備非 core 亂數，嚴禁觸碰 `GameState.rng`。

### 3.6 月結流程完整順序

月結主結算集中於**每月 1 日**；協定到期改為**每日**逐日檢查 `endDay`（不再綁定晦日，見 §8 D1）。
兵糧消耗與協定到期為每日連續發生，在圖中以「每日」段表示。順序嚴格內嵌於 §5.4 的 13 步固定順序。

```
─── 每月 1 日的 advanceDay ───────────────────────────────────────────
Step 2  time      : 發 time.monthStart
Step 3  events    : 歷史事件月度判定
Step 6  economy   : (1) 收入      — 商業金錢收入入庫 clan.gold（公式見 05）
                    (2) 維持費    — 家臣俸祿、施設維持、部隊月維持自 clan.gold 扣除（見 05/06/07）
                                    gold 不足 → 扣到 0，發 economy.upkeepUnpaid（忠誠懲罰由 06 定義）
                    (3) 兵糧消耗  — 當日份（每日皆有，見下）
Step 9  officers  : (4) 忠誠更新  — 月度忠誠增減結算（俸祿欠繳懲罰在此生效，見 06）
Step 10 proposals : (5) 具申生成  — 家臣依 AI 邏輯產生 Proposal（見 06/09）
Step 11 ai        : (6) AI 評定   — 全 AI 勢力入列排程器；自本 tick 起分批消化（§3.8.2）
Step 13 reports   : (7) 月結摘要  — 產生 report.month.summary 報告
─── 每日（含 1 日；貫穿全月每一 tick，2~30 日同）────────────────────
Step 4  diplomacy : 協定到期 — 逐日檢查各協定 `endDay`：`day > endDay` 者失效、
                                自對列 pacts 移除、發 pact.expired（`endDay=null` 之婚姻/
                                從屬永不到期；每日檢查與延長規則見 08 §5.1）
Step 6  economy   : 兵糧消耗（每日）：出陣部隊攜行糧、圍城中守城糧（見 05/07）
Step 11 ai        : 排程器繼續消化評定佇列＋每日反應式決策
──────────────────────────────────────────────────────────────────────
```

不變量：同一個 1 日 tick 內，(1)→(7) 的相對順序由 13 步固定順序自然保證，
實作時**不得**把其中任何一項移到別的步驟。秋收（9/1）在 (1) 收入之前執行
（同屬 Step 6，economy 內部順序：秋收 → 收入 → 維持費 → 兵糧消耗）。

### 3.7 合戰／歷史事件 modal 的子迴圈

#### 3.7.1 策略時間凍結

`hasBlockingInteraction(state)`（§3.1）為 `true` 期間，UI 驅動器不呼叫 `advanceDay`，
且速度檔位 UI 鎖定為暫停態。凍結來源只有兩種：

1. 玩家參與的 `Battle`（`state.battles` 中 `playerInvolved === true` 且 `status !== 'resolved'`）。
2. 待玩家選擇的歷史事件（`state.events.pendingChoice != null`）。

AI 對 AI 的野戰／合戰一律在 Step 8 內自動解算，**永不**開 modal、永不凍結時間。

#### 3.7.2 Battle 子狀態機與自有 tick

`Battle` 實體欄位見 02/07；本節定義迴圈契約。子狀態機：

```
'deploying'（佈陣） --玩家按開戰--> 'fighting'（交戰） --勝敗判定--> 'resolved'（結束）
```

- 玩家於 `battle.kassenAvailable` 後下達 `startKassen`；Step 1 套用時建立
  `Battle`（status `'deploying'`）並凍結時間。**同一 tick 的其餘步驟照常跑完**
  （合戰發生在「該日之內」，該日其他系統照常運作），唯 Step 8 `military.combat` 會將該合戰
  對應的 `FieldCombat` 標記 `interrupted` 並跳過其自動推進，避免同一戰鬥被自動解算與合戰子迴圈
  重複結算（E-64；`FieldCombat.interrupted` 欄見 07 §4／02）。
- modal 開啟後，UI 以獨立計時器每 `BAL.battleTickMs = 500`（建議初值，實際毫秒；
  合戰內變速規則見 07）呼叫一次：

```ts
function advanceBattleTick(state: GameState, battleId: BattleId): BattleTickResult;
```

- `advanceBattleTick` 是 core 函式：只讀寫 `state.battles[battleId]` 內部欄位與
  `state.rng.battle`，**不得**觸碰策略層其他區塊（部隊真身、城、外交……），
  直到 resolved 寫回。合戰內玩家操作（移動、戰法）以 `BattleCommand` 直接作為
  `advanceBattleTick` 的參數傳入（不走策略 Command 佇列；型別見 07）。
- 勝敗達成時 `advanceBattleTick` 內部立即執行**原子寫回**（§8 D3）：

```ts
/** 合戰結束時由 core 寫回主狀態的結果介面（計算規則見 07） */
interface BattleResult {
  battleId: string;
  winnerClanId: string;            // 勝方勢力
  casualties: Record<string, number>; // key=armyId，value=損失兵力（人）
  moraleDelta: Record<string, number>; // key=armyId，value=士氣增減（點）
  aweLevel: 'none' | 'small' | 'medium' | 'large'; // 威風等級（判定門檻見 07）
  aweAffectedDistrictIds: string[]; // 威風波及而歸順的郡（計算見 07）
  capturedOfficerIds: string[];    // 被俘武將
  routedArmyIds: string[];         // 潰走部隊（撤退目的地由 07 規則決定）
}
```

  寫回內容：套用傷亡與士氣至 `state.armies`、移除全滅部隊、俘虜入列、威風翻轉郡歸屬
  （設 `territoryChangedToday`）、發 `battle.ended`（`winnerClanId` 判勝負）/`awe.triggered`/
  `officer.captured` 事件——這些事件**掛入下一個 tick 的事件流**：實作上暫存於
  `state.meta.deferredEvents`，由下一次 `advanceDay` 的 Step 13 前併入事件陣列。
- 玩家關閉結果畫面 → UI 清除 modal → `hasBlockingInteraction` 回到 `false` → 時間可恢復
  （不自動恢復，等玩家按播放；`autoPauseReasons` 已使檔位為暫停）。

#### 3.7.3 歷史事件 modal

- Step 3 觸發需要選擇的事件時，寫入 `state.events.pendingChoice` 並發
  `event.fired`（`hasChoice=true`；critical、自動暫停、開 modal）。
- 玩家選擇 → `resolveEventChoice` 入佇列 → 玩家按播放 → 下一 tick Step 1 套用選項效果
  （效果操作集見 10）並清除 `pendingChoice`。無選項的純敘事事件不設 `pendingChoice`、
  不凍結時間，僅自動暫停＋報告。

### 3.8 效能設計

單 tick core 計算預算：`BAL.tickBudgetMs = 8`（建議初值；×5 速度 120ms/日 下留足渲染裕度）。
超預算時的優化順位與量測方法見 01/17；本節定義兩個結構性機制。

#### 3.8.1 髒標記與增量重算（DerivedCache）

高頻讀取但低頻變動的衍生值（勢力總石高、城最大兵力、勢力月收入預覽、尋路圖）
**不存 GameState**，集中於執行期快取 `DerivedCache`（`src/core/state/cache.ts`）：

- 快取**不序列化**；讀檔後以 `rebuildCache(state)` 全量重建（§8 D5）。
- 失效以髒標記驅動：所有會影響衍生值的變更必須經由 mutation helper
  （如 `setDistrictOwner(state, cache, districtId, clanId)`），helper 同時改 state 並標髒：
  `cache.dirty.economy.add(clanId)`、`cache.dirty.pathGraph = true` 等。
  禁止在 systems 內直接指派這些欄位（ESLint 限制 + code review 準則，見 17）。
- 重算時機：**惰性**——selector 讀取時發現髒才重算該勢力／該城的條目；
  `pathGraph` 髒則於下次尋路請求時重建（尋路演算法見 04）。
- `cache.version` 與 `state.meta.stateVersion` 對齊校驗：debug 模式下每 30 tick
  全量重算一次與快取比對，不一致即擲例外（防快取腐敗）。

#### 3.8.2 AI 攤平排程器（介面；決策內容見 09）

~40 家 AI 勢力的月度評定若集中在 1 日單一 tick 會爆預算。排程器把評定攤平到多個 tick，
狀態存於 `GameState.ai`（**需序列化**，保證存讀檔後續跑一致）：

```ts
/** AI 排程器狀態（存於 GameState.ai；欄位語意如下） */
interface AiSchedulerState {
  councilQueue: string[]; // 待評定的 AI 勢力 clanId，依 clanId 字典序排列（決定論）
  reactiveCursor: number; // 反應式檢查的輪詢游標（指向排序後 AI 勢力清單的索引）
}
```

- **入列**：每月 1 日 Step 11，將全部存活 AI 勢力 clanId 排序後放入 `councilQueue`。
- **消化**：每 tick（含 1 日當日）自佇列頭取至多 `BAL.aiCouncilsPerTick = 4`（建議初值）家
  執行評定（40 家 ≈ 10 tick 內完成，遊戲內 10 日，體感自然）。
- **反應式決策**：每 tick 依 `reactiveCursor` 輪詢至多 `BAL.aiReactiveChecksPerTick = 8`
  （建議初值）家做輕量反應檢查（迎擊、撤退等，見 09），游標循環遞增。
- 決定論保證：佇列排序、消化量、游標推進皆與真實時間無關；AI 內部一律用 `rng.ai`。

### 3.9 時間跳轉（debug）與自動存檔 hook

#### 3.9.1 Hook 掛載點

core 不做 I/O；app 層驅動器建立時注入 hooks：

```ts
/** 由 app 層注入的迴圈掛鉤；core 於固定時點回呼（皆為同步呼叫，實作應輕量） */
interface TickHooks {
  /** 每個 advanceDay 完成後（含 debug 跳轉中的每一日） */
  onAfterTick?(result: TickResult): void;
  /** 自動存檔時點到達（實際持久化流程見 16）。reason 見下表 */
  onAutosave?(state: GameState, reason: 'monthly' | 'preBattle'): void;
  /** 本 tick 產生自動暫停（驅動器據此切換檔位並顯示提示） */
  onAutoPause?(reasons: AutoPauseReason[]): void;
}
```

自動存檔觸發點（canonical；持久化細節、slot 輪替見 16）：

| reason | 時點 | 頻率 |
|---|---|---|
| `'monthly'` | 每月 1 日 tick 的 Step 13 之後 | 每 `BAL.autosaveEveryMonths = 1` 個月 |
| `'preBattle'` | `startKassen` 套用成功、modal 開啟前 | 每次玩家合戰 |

`onAutosave` 由驅動器呼叫（core 在 `TickResult.perf` 旁附 `autosaveDue` 布林旗標，
驅動器讀旗標後呼叫 hook）；debug 跳轉期間旗標照常產生但驅動器抑制實際存檔（§3.9.2）。

#### 3.9.2 時間跳轉（debug）

`debugSkipDays { days }`：

- 驗證：`state.meta.debugMode === true`（由 URL 參數 `?debug=1` 設定，見 01），
  `1 ≤ days ≤ BAL.debugSkipMaxDays = 3600`。
- 語意：套用後驅動器進入跳轉模式——同步連續呼叫 `advanceDay`（空佇列）`days` 次，
  期間（a）忽略 `autoPauseReasons`（不暫停），（b）抑制 `onAutosave`，
  （c）不逐 tick 重繪（僅每 30 tick 更新一次進度條），（d）`hasBlockingInteraction`
  為真時**中止跳轉**（玩家合戰不可能發生於跳轉中——無玩家指令；但歷史事件
  `pendingChoice` 會中止並開 modal）。
- 跳轉結束發 `command.rejected` 以外的專屬報告？否——跳轉本身不產生報告；
  期間各系統照常產生的 `Report` 全數保留，玩家可事後翻閱。
- 決定論：跳轉走與正常播放完全相同的 `advanceDay`，golden test 可用它快速推進。

`debugGrant { gold?, food?, castleId? }`：debug 模式下直接加資源，用於測試；
驗證僅檢查 `debugMode` 與目標存在。兩個 debug 指令都記入重放紀錄（重放時同樣生效）。

---

## 4. 資料結構

本章型別為 canonical（02 彙整收錄）。實體型別（`GameState` 的各實體區塊）見 02。

### 4.1 時間與 tick

```ts
/** 遊戲曆（00 §5.1：1月=30日、1年=360日） */
interface GameTime {
  year: number;        // 西曆年，如 1560
  month: number;       // 1..12
  day: number;         // 1..30（30 即晦日）
  season: 'spring' | 'summer' | 'autumn' | 'winter'; // 春3-5/夏6-8/秋9-11/冬12-2
  absoluteDay: number; // 自劇本開始日起算的第幾日（開始日=0）；冗餘欄位，Step 2 同步維護
  startYear: number;   // 劇本開始年（s1560=1560）；absoluteDay 換算基準
}

/** advanceDay 回傳值 */
interface TickResult {
  state: GameState;                  // 與傳入同一參考（就地修改）
  events: GameEvent[];               // 本 tick 全部事件（依發出順序）
  autoPauseReasons: AutoPauseReason[]; // 去重後的自動暫停原因（可空）
  autosaveDue: 'monthly' | null;     // 驅動器據此呼叫 onAutosave（§3.9.1）
  perf: { totalMs: number; stepMs: number[] }; // 各步耗時取樣（debug 用；正式版可全 0）
}

type AutoPauseReason =
  | 'siegeOnPlayer' | 'battleAvailable' | 'proposalArrived'
  | 'envoyArrived' | 'historicalEvent' | 'monthStart';

type GameSpeed = 'paused' | 'x1' | 'x2' | 'x5'; // 毫秒對應 BAL.tickMsX1/X2/X5
```

### 4.2 Command

```ts
/** 佇列信封：由 app 層佇列指派 seq 後包裝 */
interface CommandEnvelope {
  seq: number;        // 全域單調遞增序號（跨存讀持續；重放紀錄的主鍵）
  issuedDay: number;  // 提交當下的 absoluteDay（僅供紀錄/除錯，不參與邏輯）
  command: Command;
}

/** 所有 Command 的共同欄位 */
interface CommandBase {
  type: CommandType;     // 判別欄，見 §3.3.4 表（值即表中字串）
  clanId: ClanId;        // 發令勢力（權限驗證基準：只能操作自家實體；玩家指令=playerClanId、debug 指令亦填玩家）；欄位名依 02 §4.18（E-29）
}

/** 判別值一律採 02 §4.18 聯集（無 `cmd.` 前綴、camelCase；E-29）。
    canonical 且完整的 Command 聯集以 02 §4.18 為準；下列鏡射 02 §4.18 現行全集並附 03 專有的 debug 指令（02 未收）。 */
type CommandType =
  // 內政（05/06）
  | 'grantFief' | 'setDevelopFocus' | 'buildFacility' | 'cancelBuild' | 'demolishFacility'
  | 'setConscriptPolicy' | 'transport' | 'recallTransport' | 'enactPolicy' | 'revokePolicy'
  | 'appointLord' | 'setCastleControl'
  // 軍事（07）
  | 'march' | 'setArmyTarget' | 'recallArmy' | 'setAutoReturn'
  | 'startKassen' | 'battleMove' | 'battleAttack' | 'battleTactic' | 'battleDelegate'
  | 'setSiegeMode' | 'useBetrayal'
  // 武將（06）
  | 'recruitRonin' | 'rewardOfficer' | 'handleCaptive' | 'promoteRank'
  // 外交與調略（08）
  | 'startDiploWork' | 'stopDiploWork' | 'proposePact' | 'respondPact' | 'breakPact'
  | 'requestCourtRank' | 'requestMediation' | 'requestShogunateTitle' | 'nominateShogun'
  | 'startPlot' | 'cancelPlot'
  // 軍團（07 §3.12；軍團 AI 見 09）
  | 'createCorps' | 'setCorpsDirective' | 'assignCastleToCorps' | 'dissolveCorps'
  // 具申／大命／事件（06/10）
  | 'resolveProposal' | 'invokeTaimei' | 'resolveEventChoice'
  // debug（本文件 §3.9 專有；02 未收）
  | 'debugSkipDays' | 'debugGrant';

type Command = /* 上列各型別的 discriminated union；成員介面由擁有文件定義並繼承 CommandBase */ CommandBase & { [k: string]: unknown };
// 實作時以真正的 union 取代上行（此處為佔位寫法，禁止照抄 index signature）。

/** 驗證結果 */
type ValidationResult =
  | { ok: true }
  | { ok: false; reasonKey: string; params?: Record<string, string | number> };
```

### 4.3 GameEvent 與 Report

```ts
/** 事件基底：type 為判別欄；day 為發生日 absoluteDay */
interface GameEventBase {
  type: GameEventType;
  day: number;
  /** 事件主要關聯勢力（供 isPlayerRelevant 判定；純時間事件為空陣列，非 optional；02 §4.19、四輪裁決 C-4） */
  clanIds: ClanId[];
}

type GameEventType =
  // 時間（依 02 §4.19 canonical：time.monthStart／time.seasonStart，含 app 消費者）
  | 'time.monthStart' | 'time.seasonStart'
  // 指令（03 迴圈機制專有：apply-time 拒絕；02 §4.19 不模型化 core 迴圈拒絕）
  | 'command.rejected'
  // 經濟（依 02 §4.19：economy.income／upkeepUnpaid／foodShortage／harvest／granaryOverflow；
  //   upkeepUnpaid／foodShortage 四輪裁決 C-5 收錄自 05；granaryOverflow 六輪裁決 1 收錄自 05 直發 report；
  //   發出者皆 05、13 §6.11 報告消費）
  | 'economy.income' | 'economy.upkeepUnpaid' | 'economy.foodShortage' | 'economy.harvest' | 'economy.granaryOverflow'
  // 政策（依 02 §4.19：policy.autoRevoked；六輪裁決 1 收錄自 05 直發 report；發出者 05）
  | 'policy.autoRevoked'
  // 軍事（依 02 §4.19：army.departed／army.arrived／army.blocked／district.subjugated／battle.*／siege.*／awe.triggered）
  | 'army.departed' | 'army.arrived' | 'army.blocked' | 'district.subjugated'
  | 'battle.kassenAvailable' | 'battle.started' | 'battle.ended' | 'awe.triggered'
  | 'siege.started' | 'siege.ended'
  // 武將（依 02 §4.19）
  | 'officer.loyaltyLow' | 'officer.defected' | 'officer.died' | 'officer.comingOfAge'
  | 'officer.promoted' | 'officer.captured'
  // 具申（依 02 §4.19）
  | 'proposal.submitted' | 'proposal.expired'
  // 外交/朝廷/調略（依 02 §4.19：pact.signed／pact.expired／pact.broken／diplo.envoyArrived／diplo.workStopped／
  //   court.rankGranted／court.mediationResult／shogunate.nominated／shogunate.patronLost／shogunate.collapsed／
  //   plot.succeeded／plot.failed／plot.exposed／plot.betrayalActivated；diplo.envoyArrived 已收錄 02 §4.19，
  //   勘誤 E-32；diplo.workStopped（原 08 名 dip.workStopped）／court.mediationResult／shogunate.nominated／
  //   shogunate.patronLost／shogunate.collapsed／plot.exposed／plot.betrayalActivated 六輪裁決 1 收錄自 08
  //   擴充事件、發出者皆 08（shogunate.collapsed 08/10）
  | 'diplo.envoyArrived' | 'diplo.workStopped' | 'pact.signed' | 'pact.expired'
  | 'pact.broken' | 'court.rankGranted' | 'court.mediationResult'
  | 'shogunate.nominated' | 'shogunate.patronLost' | 'shogunate.collapsed'
  | 'plot.succeeded' | 'plot.failed' | 'plot.exposed' | 'plot.betrayalActivated'
  // 事件/勝敗（依 02 §4.19）
  | 'event.fired' | 'uprising.started' | 'uprising.ended'
  | 'game.victory' | 'game.defeat' | 'clan.destroyed';
// canonical 完整聯集以 02 §4.19 總表為準（E-30）；本 union 為 03 步驟發出／消費之子集，命名一律採 02 §4.19：
// 舊 battle.won/lost 併入 battle.ended（payload `winnerClanId` 判勝負）、
// 舊 siege.fallen/repelled 併入 siege.ended（payload `fallen` 區分）、army 系不用舊前綴（詳見 §8 E-30）。
// 非 02 §4.19 成員：僅 command.rejected（03 迴圈機制專有，apply-time 拒絕；02 §4.19 不模型化 core 迴圈拒絕）。
// economy.upkeepUnpaid／economy.foodShortage 已收錄 02 §4.19 canonical（05 發、13 §6.11 報告消費，四輪裁決 C-5）；
// development.completed 已廢除（無消費者，四輪裁決 C-5，備忘錄交 03 停發），不再列入本 union。
// （diplo.envoyArrived 原列此、現已收錄 02 §4.19 canonical，勘誤 E-32。）
// 二輪裁決 C 廢除且不再發出：military.encounter／military.districtLost（改用 battle.started／district.subjugated）、
// siege.progress、development.districtGrown、time.monthEnd／time.yearStart／time.harvest（改由日期閘控）。
// 六輪裁決 1 新收 10 事件（原 13 §6.11 事件欄「—」但生產者實際發事件／直發 report 者，本輪收束入 02 §4.19、
// 同步補入本 union）：economy.granaryOverflow／policy.autoRevoked／uprising.ended（05 直發 report 改發事件）、
// diplo.workStopped（原 dip.workStopped）／court.mediationResult／shogunate.nominated／patronLost／collapsed／
// plot.exposed／plot.betrayalActivated（08 擴充事件，02 尚未收錄→已收錄 02 §4.19 canonical）。
// save.autosaveFailed 不收錄本 union（app 層 I/O 失敗、非 core GameEvent，六輪裁決 4，詳見 §3.4.1）。
// 擴充規則：新增事件必須同步登錄 02 §4.19、§3.4.2 分級表與 13 的 i18n 對照。

type GameEvent = /* 02 §4.19 總表全部成員的 discriminated union（各成員 payload 型別見該表）；下行為佔位 */
  GameEventBase & { payload: Record<string, unknown> };
// payload 各欄位型別由 02 §4.19 總表逐成員定義，可含 boolean／null／陣列
// （例：siege.ended.fallen: boolean、battle.ended.winnerClanId: ClanId|null、
// awe.triggered.flippedDistrictIds: DistrictId[]）；Record<string,string|number> 不足以表達，
// 實作時以 02 §4.19 之 discriminated union 取代此佔位型別（禁止照抄）。
// payload 為 core 側原始資料（持久實體 ID 等），非顯示用插值參數；顯示 key／params 由 UI 層
// renderReport(report, state, playerClanId) 依 enrichment 規則導出，非逐一對應 payload key（13 §3.7，五輪裁決 A）。

type ReportSeverity = 'info' | 'warning' | 'critical'; // 情報/警告/重大（由 event 型別經 §3.4.2 表推導，不存於 Report）

/** 持久化的通知（存於 GameState.reports；內容模型依 02 §4.17，E-78；陣列新→舊排列） */
interface Report {
  id: string;                  // `rep.{absoluteDay}.{當日流水號}`（ReportId＝`rep.*`）
  day: number;                 // 發生日 absoluteDay
  event: GameEvent;            // 原始事件（單一真相）；severity／顯示 key／params／跳轉目標皆由 UI 層 renderReport(report, state, playerClanId) 依此導出（13 §3.7，五輪裁決 A）
  read: boolean;               // 玩家已讀（UI 置換；cmd 不需要，由 UI 直寫允許——唯一例外欄位，見 §8 D11）
}
```

### 4.4 亂數

```ts
type RngStreamName = 'battle' | 'dev' | 'ai' | 'event' | 'misc';

/** 存於 GameState.rng；全部 uint32 */
interface RngState {
  masterSeed: number;  // 開局種子（顯示於設定畫面供回報重現）
  battle: number;      // 各流當前狀態
  dev: number;
  ai: number;
  event: number;
  misc: number;
}

/** rng.ts 對 systems 暴露的介面（綁定單一流；內部讀寫 RngState 對應欄位） */
interface RngStream {
  next(): number;                       // [0,1) float64
  nextInt(min: number, max: number): number; // 含上下界整數
  chance(p: number): boolean;           // 機率判定，p ∈ [0,1]
  pick<T>(arr: readonly T[]): T;        // arr 必須非空（呼叫端保證）
  shuffle<T>(arr: T[]): T[];            // Fisher–Yates 就地洗牌並回傳同陣列
}
```

### 4.5 快取與 meta

```ts
/** 執行期衍生快取（不序列化；讀檔後 rebuildCache 重建） */
interface DerivedCache {
  version: number;                              // 與 state.meta.stateVersion 對齊校驗
  clanEconomy: Map<string, ClanEconomySnapshot>; // 勢力月收支預覽（欄位見 05）
  castleMaxSoldiers: Map<string, number>;        // 城最大兵力（由轄郡人口推導，公式見 05）
  clanTotals: Map<string, { kokudaka: number; districts: number; castles: number }>;
  pathGraphVersion: number;                      // 領土變更遞增 → 尋路快取失效（見 04）
  dirty: {
    economy: Set<string>;   // 髒的 clanId
    castles: Set<string>;   // 髒的 castleId
    totals: Set<string>;    // 髒的 clanId
    pathGraph: boolean;
  };
}

/** GameState.meta（迴圈機制相關欄位；其餘 meta 欄位見 02/16） */
interface LoopMeta {
  stateVersion: number;          // 每 tick +1；UI 訂閱依據
  lastAppliedCmdSeq: number;     // 冪等防線（§3.3.3）
  playerClanId: string;          // 玩家勢力
  debugMode: boolean;            // debug 指令閘門
  territoryChangedToday: boolean; // Step 12 勝敗檢查的髒標記；Step 13 後重置
  deferredEvents: GameEvent[];   // 合戰寫回暫存（§3.7.2）；下一 tick 併入後清空
  gameOver: { kind: 'victory' | 'defeat'; endingId: string } | null; // 結局種類見 10
}
```

---

## 5. 演算法與公式

### 5.1 Step 1 applyCommands 虛擬碼

```
applyCommands(state, queue, emit):
  applied = 0
  for env of queue:                         // queue 已依 seq 升冪
    if applied >= BAL.maxCommandsPerTick: requeueRemainder(); break
    if env.seq <= state.meta.lastAppliedCmdSeq: continue   // 冪等：至多一次
    v = validators[env.command.type](state, env.command)
    if not v.ok:
      emit({ type: 'command.rejected', day: state.time.absoluteDay,
             clanIds: [env.command.clanId],
             payload: { reasonKey: v.reasonKey, ...v.params } })
    else:
      appliers[env.command.type](state, env.command, emit)  // 原子；不得失敗
    state.meta.lastAppliedCmdSeq = env.seq   // 拒絕的也推進（該 seq 已消費）
    applied += 1
```

### 5.2 Step 2 time 虛擬碼

```
timeSystem(state, emit):
  // 先併入合戰寫回的延遲事件（§3.7.2）
  for e of state.meta.deferredEvents: emit(e)
  state.meta.deferredEvents = []

  t = state.time
  t.day += 1; t.absoluteDay += 1
  if t.day > 30: t.day = 1; t.month += 1
  if t.month > 12: t.month = 1; t.year += 1
  t.season = seasonOf(t.month)   // 3-5春/6-8夏/9-11秋/12-2冬

  if t.day === 1:
    emit(time.monthStart)
    if t.month in {3,6,9,12}: emit(time.seasonStart)
  // 年初（1/1）、秋收（9/1）不發 GameEvent；對應結算由各步以
  // t.day／t.month 直接閘控（年結 Step 9、秋收 Step 6；二輪裁決 C）
  // 協定到期改 Step 4 每日檢查 endDay（08 §5.1），不綁晦日、月末無特殊結算
```

### 5.3 月結內 economy 順序（Step 6，每月 1 日）

```
economySystem(state, emit):            // 每日呼叫
  if isMonthStart(state):
    if state.time.month === 9: harvest(state, emit)   // 秋收（公式見 05）
    income(state, emit)                                // 收入（公式見 05）
    upkeep(state, emit)                                // 維持費（05/06/07 各分項）
  dailyFoodConsumption(state, emit)                    // 每日（05/07）
```

`upkeep` 內若 `clan.gold` 不足：扣到 0、記錄欠繳比例於當月（供 Step 9 忠誠懲罰讀取，
懲罰公式見 06），發 `economy.upkeepUnpaid`。

### 5.4 reports 修剪演算法（Step 13）

```
trimReports(reports):
  cutoff = state.time.absoluteDay - BAL.reportRetentionDays   // = 360
  移除 day < cutoff 的全部項目
  while reports.length > BAL.reportMaxKept:                   // = 500（名依 02，E-31）
    victim = 最舊的 severity=='info' 項；若無 info 則最舊的 'warning'；
    若僅剩 critical 則停止修剪
    移除 victim
```

### 5.5 本文件引入的 BAL 常數彙整（建議初值；定案見 15）

| 常數 | 建議初值 | 單位 | 說明 |
|---|---|---|---|
| `BAL.tickMsX1` | 600 | ms/日 | ×1 速度（00 §5.2 canonical） |
| `BAL.tickMsX2` | 300 | ms/日 | ×2 速度（00 §5.2 canonical） |
| `BAL.tickMsX5` | 120 | ms/日 | ×5 速度（00 §5.2 canonical） |
| `BAL.maxTicksPerFrame` | 4 | tick | 單 frame 補跑上限（§3.1） |
| `BAL.maxCommandsPerTick` | 200 | 個 | Step 1 套用上限（§3.3.1） |
| `BAL.reportRetentionDays` | 360 | 日 | 報告保留期（§3.4.3） |
| `BAL.reportMaxKept` | 500 | 筆 | 報告總量上限（名依 02，E-31；§3.4.3） |
| `BAL.rngWarmupDraws` | 12 | 次 | 各流播種後空轉（§3.5.2） |
| `BAL.battleTickMs` | 500 | ms | 合戰子迴圈 tick 間隔（§3.7.2） |
| `BAL.tickBudgetMs` | 8 | ms | 單 tick core 計算預算（§3.8） |
| `BAL.aiCouncilsPerTick` | 4 | 家/tick | AI 評定消化速率（§3.8.2） |
| `BAL.aiReactiveChecksPerTick` | 8 | 家/tick | AI 反應式輪詢速率（§3.8.2） |
| `BAL.autosaveEveryMonths` | 1 | 月 | 自動存檔頻率（§3.9.1） |
| `BAL.debugSkipMaxDays` | 3600 | 日 | 時間跳轉單次上限（§3.9.2） |

---

## 6. UI/UX

本文件僅定義迴圈機制直接需要的字串與互動；通知中心與 HUD 的完整佈局見 11/12，
主字串表見 13（下表為 canonical 種子，13 彙整）。

### 6.1 互動流程要點

- **指令拒絕**：`command.rejected` 報告以 toast（右下、4 秒淡出）顯示 `reasonKey` 對應文字；
  同時進報告匣。軟驗證已擋掉多數非法操作（按鈕反灰＋tooltip 顯示同一 reason 文字）。
- **自動暫停**：檔位切至暫停、HUD 顯示 `ui.notify.autopause` 橫幅＋觸發原因文字，
  點擊橫幅跳轉至 `linkTarget`。
- **報告匣**：三個重要度分頁籤＋全部；未讀計數徽章；critical 未讀時徽章呈紅色。

### 6.2 繁中字串表（key 依 00 §9 規範）

| key | 字串 |
|---|---|
| `ui.notify.severity.info` | `情報` |
| `ui.notify.severity.warning` | `警告` |
| `ui.notify.severity.critical` | `重大` |
| `ui.notify.autopause` | `時間已自動暫停：{reason}` |
| `ui.notify.reason.siegeOnPlayer` | `我方城池遭到包圍` |
| `ui.notify.reason.battleAvailable` | `可發動合戰` |
| `ui.notify.reason.proposalArrived` | `收到家臣具申` |
| `ui.notify.reason.envoyArrived` | `他國使者來訪` |
| `ui.notify.reason.historicalEvent` | `發生歷史事件` |
| `ui.notify.reason.monthStart` | `月初` |
| `ui.reports.title` | `報告` |
| `ui.reports.empty` | `目前沒有任何報告` |
| `ui.reports.tab.all` | `全部` |
| `ui.reports.unread` | `{count}則未讀` |
| `ui.speed.paused` | `暫停` |
| `ui.speed.x1` | `×1` |
| `ui.speed.x2` | `×2` |
| `ui.speed.x5` | `×5` |
| `ui.battle.timeFrozen` | `合戰進行中，天下大勢暫停` |
| `ui.debug.skipDays` | `跳轉{days}日` |
| `ui.debug.skipping` | `時間跳轉中……（{done}／{total}日）` |
| `cmd.reject.generic` | `指令無法執行` |
| `cmd.reject.notOwner` | `目標不屬於我方勢力` |
| `cmd.reject.invalidTarget` | `目標無效或已不存在` |
| `cmd.reject.insufficientGold` | `金錢不足（需要{cost}貫）` |
| `cmd.reject.insufficientFood` | `兵糧不足（需要{cost}石）` |
| `cmd.reject.insufficientTroops` | `兵力不足（需要{count}人）` |
| `cmd.reject.officerBusy` | `{name}正在執行其他任務` |
| `cmd.reject.alreadyActive` | `該項目已在執行中` |
| `cmd.reject.rankTooLow` | `{name}的身分不足以擔任此職` |
| `cmd.reject.pathBlocked` | `無法規劃通往目標的路徑` |
| `cmd.reject.gameOver` | `大局已定，無法再下達指令` |
| `cmd.reject.debugOnly` | `此指令僅限除錯模式使用` |
| `cmd.reject.delegatedToCorps` | `此城已交由軍團管理，無法直接下令` |
| `report.month.summary` | `{year}年{month}月：收入{income}貫、支出{upkeep}貫` |
| `report.command.rejected` | `指令遭駁回：{reason}` |

（各事件 → 報告文字的完整映射，如 `report.battle.ended`、`report.siege.ended`，由 13 主表定義。）

---

## 7. 實作任務清單

- [ ] **T1　曆法與 time 系統**：`GameTime`、`seasonOf`、進位邏輯、兩種時間事件（`time.monthStart`／`time.seasonStart`）。
  驗收：單元測試涵蓋 12/30→1/1 跨年、季界、`absoluteDay` 連續性；360 日=1 年。
- [ ] **T2　rng.ts**：mulberry32（§3.5.1 逐位元）、fnv1a32 播種、五流、`RngStream` API。
  驗收：固定種子下前 1000 個 `next()` 輸出與 fixture 完全一致；`shuffle` 消費次數 = n−1。
- [ ] **T3　Command 骨架**：`CommandEnvelope`、佇列（enqueue/drain/seq 指派）、
  驗證器/apply 註冊表、Step 1 演算法（§5.1）、`command.rejected` 事件。
  驗收：非法指令不改 state 且產生正確 reasonKey；同 tick 兩指令依 seq 序生效；
  重複 seq 被跳過。
- [ ] **T4　advanceDay 骨架**：13 步固定呼叫序（未實作系統以空殼佔位）、`TickResult`、
  `stateVersion` 遞增、`deferredEvents` 併入。
  驗收：空劇本連跑 3600 tick 無例外；步序以測試斷言（呼叫紀錄陣列）鎖定。
- [ ] **T5　GameEvent 匯流排與 reports**：severity 表、`Report` 生成、修剪演算法、
  `autoPauseReasons` 去重。
  驗收：§3.4.2 表逐列測試；500 筆上限修剪順序（info→warning、critical 保留）正確。
- [ ] **T6　月結整合測試**：以 stub 系統驗證 1 日順序（秋收→收入→維持費→兵糧→忠誠→
  具申→AI 入列→月結報告）與每日協定到期（逐日 `endDay` 檢查）。
  驗收：golden 紀錄比對兩個完整月份的事件序列。
- [ ] **T7　UI 驅動器**：rAF 累加器、速度檔位、`maxTicksPerFrame` 防護、
  `hasBlockingInteraction` 凍結、自動暫停切檔。
  驗收：Playwright smoke——×5 跑 30 日、暫停中提交指令於恢復後首 tick 生效。
- [ ] **T8　合戰子迴圈契約**：`advanceBattleTick` 介面、`BattleResult` 原子寫回、
  延遲事件掛入下一 tick。（戰鬥內容以假解算器代替，真解算見 07。）
  驗收：寫回後 armies/districts 一致；重放含合戰的紀錄結果 bit-exact。
- [ ] **T9　DerivedCache**：髒標記 helper、惰性重算、讀檔重建、debug 對齊校驗。
  驗收：直接指派受管欄位觸發 ESLint 錯誤；30 tick 校驗在故意弄髒快取時擲例外。
- [ ] **T10　AI 排程器骨架**：`AiSchedulerState`、入列/消化/游標推進（評定本體為空殼）。
  驗收：40 家在 10 tick 內各被評定恰一次；存檔於消化中途、讀檔續跑結果一致。
- [ ] **T11　debug 跳轉與自動存檔 hook**：`debugSkipDays`、`debugGrant`、
  `TickHooks`、`autosaveDue` 旗標。
  驗收：跳轉 360 日與逐日播放 360 日的最終 state 雜湊一致；跳轉中不觸發存檔與暫停。
- [ ] **T12　決定論守門**：ESLint 禁用 `Math.random`/`Date.now` 於 `src/core/`、
  sorted-keys 疊代 helper（`sortedKeys(obj)`）。
  驗收：CI 上 lint 通過；golden 重放測試（17）綠燈。

---

## 8. 設計決策記錄

- **D1　協定到期排在每月晦日而非 1 日（已廢止，2026-07-11）**：〔原論證〕需求的月結順序
  （……→AI評定→協定到期→報告）與 00 §5.4 的固定步序（diplomacy 在 economy 之前）表面衝突，
  遂將到期判定定於晦日（月末最後一日），使其自然落在 1 日各項結算之後。**此決策已廢止**：
  02 §4.11 `Pact` 僅有絕對日 `endDay`（無 `remainingMonths`），08 §5.1 於 Step 4 diplomacy
  **每日**檢查 `day > endDay` 即失效並發 `pact.expired`（`endDay=null` 之婚姻/從屬永不到期）。
  到期改每日 endDay 制、不綁晦日、無月度扣減；晦日不再有任何特殊結算。
- **D2　AI 不走玩家 Command 佇列**：AI 直接同步呼叫共用 apply 函式。若 AI 也入佇列，
  重放紀錄必須包含全部 AI 指令，存檔與紀錄體積暴增；共用驗證器已保證 AI 不能作弊，
  決定論由 `rng.ai` 與排序疊代保證。代價：AI 行動在 Step 11 立即生效、
  不像玩家指令延到下一 tick——此不對稱可接受（AI 決策本來就發生在 tick 內）。
- **D3　合戰結果於 resolved 當下在 core 內原子寫回**：不採「modal 關閉時 UI 呼叫 commit」，
  避免 UI 崩潰或玩家強制重整導致結果遺失；modal 關閉只負責恢復時間。
  寫回產生的事件暫存 `deferredEvents` 掛入下一 tick，維持「事件只在 advanceDay 內流動」
  的單一管道。
- **D4　Command 原子性採「驗證窮盡＋套用不失敗」**：不做交易回滾機制（成本高、易漏）。
  套用中遇到不可能狀態直接擲例外 fail-fast，靠 golden test 攔截，換取實作簡單。
- **D5　DerivedCache 不序列化**：衍生值可由 state 完全重建，序列化只會膨脹存檔並引入
  「快取與本體不一致」類 bug。讀檔全量重建一次的成本（<50ms 量級）可接受。
- **D6　事件不持久化、Report 才持久化**：GameEvent 是 tick 內的通訊媒介，量大且多數
  與玩家無關；持久化層只保留玩家可讀的 `Report` 並設保留期與總量上限，
  控制存檔體積。
- **D7　`nextInt` 用 floor 映射而非 rejection sampling**：偏差上界 2⁻³²，對遊戲數值毫無
  影響；rejection sampling 的不定次消費會讓「消費次數可預期」的決定論規則複雜化。
- **D8　AI 評定攤平（每 tick 4 家）**：犧牲「全 AI 同日完成評定」的模擬純度，換取
  單 tick 預算穩定；攤平序由 clanId 排序決定，決定論不受影響。10 日內完成評定
  對月度節奏無感知差異。
- **D9　兵糧消耗維持每日結算**：需求的月結順序圖含「兵糧消耗」，但 00 §5.4 明定其為
  每日項目（攻城糧盡張力依賴逐日消耗）。本文件在月結圖中以「每日持續」線呈現，
  順序位置（收入、維持費之後）僅指 1 日當天 economy 內部的執行序。
- **D10　debug 跳轉抑制自動暫停與存檔**：跳轉的用途是測試與快進，逐月存檔會產生大量
  無用寫入；期間報告全數保留使玩家（或測試）事後可稽核。跳轉遇 `pendingChoice`
  中止而非自動選擇，避免 debug 路徑分岔出不同決定論結果。
- **D11　`Report.read` 允許 UI 直寫**：已讀狀態純屬介面便利，不影響任何模擬結果，
  為它開 Command 徒增噪音。此為「UI 不得直改 state」鐵律的唯一列名例外。

### 8.1 勘誤消化記錄（依 19 §3.13）

- **2026-07-07　E-29（Command 命名對齊 02 §4.18）**：§3.3.4 Command 一覽表與 §4.2 `CommandType`
  聯集去除 `cmd.` 前綴、改採 02 §4.18 camelCase 判別值（`developDistrict→setDevelopFocus`、
  `assignSteward/revokeSteward→grantFief`、`initiateBattle→startKassen`、`setArmyPath→setArmyTarget`、
  `formCorps→createCorps`、`diplomacyWork→startDiploWork`、`plot→startPlot`、`recruitOfficer→recruitRonin`、
  `releaseOrExecute→handleCaptive`、`appointCastleLord→appointLord`、`respondProposal→resolveProposal`、
  `issueTaimei→invokeTaimei`、`respondEvent→resolveEventChoice`、`courtAction` 拆為
  `donateCourt/requestCourtRank/requestMediation` 等）；debug 指令去前綴為 `debugSkipDays/debugGrant`（03 專有）。
  依據：19 §3.13 E-29 建議定案（依 02 §4.18 聯集）。`cmd.reject.*` 為 i18n 拒絕鍵，非 Command 型別，維持不變。
- **2026-07-07　E-30（GameEvent 命名對齊 02 §4.19）**：§3.4.2 分級表、§4.3 `GameEventType` 聯集與各步
  `發：` 清單改採 02 名（`combat.battleAvailable→battle.kassenAvailable`、`battle.won/lost`＋
  `combat.fieldResolved→battle.ended`、`battle.aweTriggered→awe.triggered`、`siege.fallen/repelled→siege.ended`、
  `military.armyDeparted→army.departed`、`military.subjugated→district.subjugated`、`officer.rankPromoted→officer.promoted`、
  `diplomacy.pactSigned/pactExpired/pactBroken→pact.signed/pact.expired/pact.broken`、
  `event.historicalTriggered/genericTriggered→event.fired`、`economy.harvested→economy.harvest`、
  `uprising.broke→uprising.started`、`victory.achieved/defeat.playerEliminated/clan.eliminated→game.victory/game.defeat/clan.destroyed`）。
  依據：19 §3.13 E-30（依 02 §4.19 總表）。03 專有迴圈事件（`command.rejected`、`time.*`、`development.*` 等）保留並註記待 02 收錄。
- **2026-07-07　E-31／E-78（Report 型別與常數對齊 02 §4.17）**：`ReportEntry` 更名為 `Report`、內容模型改依
  02 §4.17（存原始 `event`，severity／顯示文字／跳轉目標由 UI 依 event 推導）；`BAL.reportMaxEntries` 更名為
  `BAL.reportMaxKept`（值 500，依 15 §5.2 表 A）。日數修剪規則（`reportRetentionDays`=360）併同保留。
  依據：19 §3.13 E-31、E-78 建議定案。
- **2026-07-07　E-47（亂數流→實際消費者）**：§3.5.2 五流表改為「流→實際消費者」對照——`dev` 流因 05 開發／
  經濟無隨機而 v1 無消費者；`event` 流用於事件判定、一揆爆發（05）、開局壽命排程（06）；外交工作成敗／調略／
  斡旋（08）、出奔／登用（06）改列 `misc`。Step 4／5／9 的 `讀：` 亂數說明同步更正。
  依據：19 §3.13 E-47（依各系統文件實際用流 05／06／08）。
- **2026-07-07　E-64（合戰發動 tick 步序）**：§3.7.2 與 Step 8 明定——`startKassen` 建立 `Battle` 凍結時間後，
  同 tick 的 `military.combat` 會將該合戰對應的 `FieldCombat` 標記 `interrupted` 並跳過其自動推進，
  避免同一戰鬥被自動解算與合戰子迴圈重複結算。依據：19 §3.13 E-64（`FieldCombat.interrupted` 見 07 §4／02）。
- **2026-07-07　E-74（軍團城拒絕碼）**：§3.3.2 拒絕原因表新增 `cmd.reject.delegatedToCorps`
  （軍團城玩家不可直接下內政／出陣指令）；並補入 §6.2 繁中字串種子。依據：19 §3.13 E-74（13 另補主表字串）。
- **2026-07-10　§3.3.4／§4.2 Command 全集對齊 02 §4.18（E-27／E-32／E-39／E-41／E-42）**：§3.3.4 Command
  一覽表與 §4.2 `CommandType` 聯集依 02 §4.18 現行全集重列——新增 `cancelBuild`（E-39）、`recallTransport`（E-41）、
  `setConscriptPolicy`（E-42，取代舊 `conscript`）、`setCastleControl`、`setAutoReturn`／`useBetrayal`／`promoteRank`（E-32）、
  `setCorpsDirective`、`assignCastleToCorps`、`respondPact`、`breakPact`、`requestShogunateTitle`、`nominateShogun`、
  `cancelPlot`；`startDiploWork` 分列外交工作與朝廷獻金（`target='court'`，E-27，取代舊 `donateCourt`）；`buildFacility`
  改佇列制（E-39）；`rewardOfficer` 標明金錢三檔（E-29）；合戰內指令改為 `battleMove`／`battleAttack`／`battleTactic`／
  `battleDelegate` 四令（不走提交佇列，僅列 §4.2 union，取代舊 `battleOrder`）。並補「本表為佇列型策略指令全集」
  與合戰指令歸屬註記。理由：02 §4.18 為 Command 聯集 canonical，03 鏡射其現行全集（表體由前一 agent 落實，本記錄補登）。
- **2026-07-10　CommandBase 欄位名對齊 02 §4.18（E-29）**：§4.2 `CommandBase.actorClanId: string` 改為
  `clanId: ClanId`（發令勢力／權限基準）；§5.1 `applyCommands` 與 §3.3.2 拒絕表內文同步改用 `clanId`。
  理由：02 §4.18 `CommandBase.clanId` 為 canonical 欄位名（前一 agent 落實，本記錄補登）。
- **2026-07-10　GameEvent 名收斂與二輪裁決 C（E-30 及 02 §4.19 事件完整性裁決）**：§4.3 `GameEventType` 聯集、
  §3.4.1 導言與各步 `發：` 清單依 02 §4.19 現行總表收斂——(1) `military.armyArrived`→`army.arrived`（E-30）；
  (2) `officer.loyaltyLow`／`proposal.expired`／`time.seasonStart` 由「03 專有待收」改標 02 §4.19 canonical（二輪裁決 C 已收錄 02）；
  (3) 廢除且不再發出：`military.encounter`（改用 `battle.started`）、`military.districtLost`（改用 `district.subjugated` 之 `fromClanId`）、
  `siege.progress`（UI 讀 `Siege`/`Castle` 狀態，11 §3.11.2）、`development.districtGrown`（13 null-report 無消費者）、
  `time.monthEnd`／`time.yearStart`／`time.harvest`（無消費者，改由 `state.time` 日期閘控：協定到期 Step 4、年結 Step 9、秋收 Step 6）；
  (4) 保留之非 02 §4.19 成員（`command.rejected` 迴圈機制專有，`economy.upkeepUnpaid`／`economy.foodShortage`／
  `development.completed`／`diplomacy.envoyArrived` 為 05／08 事件）改標為擁有文件發出、13 §6.11 報告或 §3.4.2
  分級／自動暫停消費，語意以擁有文件為準（去除舊「待 02 收錄」註記）；§3.4.1 導言改指 02 §4.19 為完整 canonical
  總表、本文件 §4.3 為子集鏡射。理由：02 §4.19 事件命名／完整性 canonical（E-30 ＋ 二輪裁決 C）。
- **2026-07-10　外交系統大改連動（08 主記錄；E-27 尾／E-32）**：(1) §3.3.4 `startDiploWork`
  （`target='court'`）列措辭由「每月 `goldPerMonth`→`courtFavor`」改「每月扣固定 `BAL.courtWorkMonthlyCost`
  →`courtFavor`」——02 已刪 `goldPerMonth` 欄位、月費為固定 `BAL` 常數（機制歸 08 §3.2／§3.5，E-27 尾）；
  (2) 事件 `diplomacy.envoyArrived`→`diplo.envoyArrived`（§4.3 Step 4 `發：` 清單、§3.4.2 自動暫停表、
  §4.3 `GameEventType` 聯集與導言註記同步）——該事件已收錄 02 §4.19 canonical（payload
  `{fromClanId, proposalId}`、發出者 08、`AutoPauseReason='envoyArrived'` 不變），不再列為「非 02 §4.19 之
  08 擴充事件」。理由：02 §4.11／§4.18／§4.19 為 canonical、03 鏡射其現行全集（勘誤 E-32）。
- **2026-07-10　外交三輪裁決 2 連動（幕府獻金）**：§3.3.4 Command 一覽表補「`startDiploWork`（幕府獻金，
  `target='shogunate'`；每月扣固定 `BAL.shogunateWorkMonthlyCost`→`shogunateFavor`，08 §3.6.2）」一列（與朝廷獻金列同型：
  月費固定 `BAL` 常數、重複提交拒絕 `alreadyActive`）；`target` 型別擴為 `ClanId|'court'|'shogunate'`（02 §4.18／08 §4）。
  §4.2 `CommandType` 聯集無新增（`proposePact` 等判別值同名，`kind` 型別 `DiplomacyActionKind` 之變更為 02 §4.18 內部欄位、不影響本檔判別字串）。理由：02 §4.12／§4.18 為 canonical、08 為機制擁有者。
- **2026-07-11　對抗式驗證修復（彙整；依 02 四輪裁決備忘錄與各擁有文件核實）**：
  (1) **協定到期全面改每日 `endDay` 制**——02 §4.11 `Pact` 僅有絕對日 `endDay`（無 `remainingMonths`）、
  08 §5.1 於 Step 4 diplomacy 每日檢查 `day > endDay`；同步改：§1 目的、§3.2.2 觸發表（刪「每月晦日／月末結算」列）、
  §3.2.3 Step 2／Step 4（頻率含協定到期）、§3.6（月結圖以「每日」段取代晦日區塊、intro 改述）、§5.2 timeSystem 註解、
  T6 驗收、§8 D1（加「已廢止」註記）；廢除舊「晦日 `remainingMonths −= 1`／月末特殊結算」模型。
  (2) §4.3 `GameEventBase.clanIds?: string[]` → `clanIds: ClanId[]`（非 optional；02 §4.19、四輪裁決 C-4）；
  `GameEvent.payload` 由 `Record<string, string|number>` 改述為「各成員 payload 型別依 02 §4.19 總表之 discriminated union，
  可含 boolean／null／陣列」（`Record<string, unknown>` 佔位，實作以 02 union 取代）。
  (3) `development.completed` 廢除（無消費者，四輪裁決 C-5）：自 §4.3 union 與 Step 5 `發：` 清單移除；
  `economy.upkeepUnpaid`／`economy.foodShortage` 改標為已收錄 02 §4.19 canonical（05 發、13 §6.11 報告消費），
  §4.3 non-canonical 成員僅餘 `command.rejected`。
  (4) T1「五種時間事件」→「兩種（`time.monthStart`／`time.seasonStart`）」。
  (5) §4.2 軍團指令群組註記（09）→（07 §3.12；軍團 AI 見 09）——擁有文件為 07。
  (6) `rng.misc` 消費者更正：§3.2.3 Step 4 讀與 §3.5.2 `misc` 列——調略成敗／敗露、斡旋失敗用 `rng.misc`；
  **外交工作無隨機**（決定論；08 §5.1／§5.6.2）。
  (7) AI 受方提案結算點統一於 **Step 4 diplomacy 以 `evaluateProposal` 決定論結算**（無隨機、不消費 `rng.ai`；
  備忘錄 E-22）；§3.2.3 Step 4 讀改述（原「AI 回應判定屬 Step 11」）。AI 主動送出提案仍屬 Step 11。
  (8) 收錄 `army.blocked`（02 §4.19、四輪裁決 C-6）：§4.3 union 軍事段與 Step 7 `發：` 清單新增；
  取代舊「直發 `report.march.blocked`」，13 §6.11 `report.army.blocked` 消費。
  依據：02 四輪裁決備忘錄 C-4／C-5／C-6、E-22，各擁有文件（02 §4.11／§4.19、08 §5.1／§5.6.2、07 §3.12）。
- **2026-07-11（五輪裁決 A 連動，依 02 §8 五輪裁決／13 §3.7）**：報告顯示層 enrichment 規格歸屬 13（字串擁有者）；
  簽名裁決＝ UI 層 selector `renderReport(report, state, playerClanId)`——core（本文件 Step 13）只存原始 `event`
  （§4.3 `Report` 不變），顯示 key／params 於 UI 渲染時依 enrichment 規則導出，非逐一對應 payload key。修正與此
  相牴觸之敘述：(1) §3.4.3 `reportsSystem` 偽碼 `makeReport(e)` 註解「顯示文字由 UI 以 `report.<event.type>`
  插值（13）」改為「顯示 key／params 由 UI 層 `renderReport(report, state, playerClanId)` 依 13 §3.7 導出」；
  (2) §4.3 `GameEvent` 型別區註解「key 一律對應 i18n 插值參數名（§6 / 13）」（隱含 payload key 與顯示參數名
  一律對應之預設規則，與新契約牴觸）改為「payload 為 core 側原始資料，顯示 key／params 由 UI 層 renderReport
  依 enrichment 規則導出、非逐一對應 payload key」；(3) §4.3 `Report.event` 欄位註解同步補 `renderReport`
  簽名與 13 §3.7 出處。核實：`officer.died.cause`（五輪裁決 C：`'age'|'battle'`，移除 `'execution'`）、
  `development.completed`／`battle.won`／`battle.lost`／`siege.fallen`／`siege.repelled` 等舊事件名於本文件
  皆僅存於「已廢除／改用新名」註記與 §8 歷史沿革記錄中，無現行活用殘留，grep 自查通過，無需修改。
  依據：02 §8 五輪裁決 A／C、13 §3.7。
- **2026-07-11　六輪裁決連動（事件↔報告邊界末輪收束；依 02 §8「2026-07-11 六輪裁決」下游清單之 03 項）**：
  承接五輪備忘（見上一條）將「不產生報告」排除規則自 13 §3.7(5) 正式落實為 §3.4.3 `reportsSystem`
  偽碼之顯式 `NOT_REPORTED` 排除集合，並補列六輪裁決 1 新收 10 事件之分級與 union 成員。逐項：
  (1) **§3.4.3 排除集合**：新增 `NOT_REPORTED: ReadonlySet<GameEventType>` 常數，成員取 13 §3.7(5)
  權威登錄之五類八項——`time.monthStart`／`time.seasonStart`（app 層季首自動存檔消費，16 §5.3）、
  `game.victory`／`game.defeat`（直接切結局畫面，10 §6.4）、`policy.enacted`／`policy.revoked`
  （玩家主動操作即時回饋）、`proposal.resolved`（玩家裁決即時回饋）、`conscript.completed`
  （逐城逐月觸發、避免灌爆）。`reportsSystem` 迴圈內命中即 `continue`、不 push `state.reports`；
  `dedupedAutoPauseReasons(events, …)` 與結局切換皆讀 `events` 原始陣列（非 `state.reports`），
  故不受此排除影響（`time.monthStart` 之 `monthStart` 自動暫停、`game.victory`/`game.defeat` 之結局畫面
  切換照常）。其中 `policy.enacted`／`policy.revoked`／`proposal.resolved`／`conscript.completed` 四型別
  原不在本文件 §4.3 union 之列（03 從未發出/鏡射），僅為完整落實 13 §3.7(5) 而在排除集合中列名；
  `GameEventType` 於實作時為 02 §4.19 全集（§4.3 首段既有註明「本 union 為 03 步驟發出／消費之子集」），
  排除集合對此四型別的引用不受 03 局部 union 未列而失效。
  (2) **§3.4.2 分級表**：補列六輪裁決 1 新收 10 事件之重要度——`policy.autoRevoked`／`economy.granaryOverflow`
  warning；`uprising.ended`／`diplo.workStopped` 比照既有「涉我方/否則」二分慣例定 warning/info；
  `court.mediationResult`／`shogunate.nominated`／`shogunate.collapsed` 定 critical/warning（`shogunate.nominated`／
  `shogunate.collapsed` 為世界級廣播、不分視角一律 critical，且必須非 info 方能對非當事勢力玩家推送，
  與 `time.*` 空 `clanIds` 同慣例）；`shogunate.patronLost` 當事勢力 warning（僅該勢力可見，13 render 層另行
  視角過濾）；`plot.exposed`／`plot.betrayalActivated` 依既有 actor/target 雙視角分流定 actor=warning、
  target=critical。02 §8 六輪裁決記錄以「info/warning」「major/critical」「warning/major」等區間描述分級
  意向，本表僅三級（無「major」），已於表後 blockquote 逐項註明折算依據。(3) **§4.3 union**：補入上述
  10 事件成員（經濟／政策／外交-朝廷-調略／事件四段落各就其類插入），union 尾註同步補六輪裁決 1 摘要；
  `save.autosaveFailed` 依裁決 4 不收錄本 union、不建模為 core `GameEvent`，改於 §3.4.1 新增專段說明其
  app 層 UI 通知路徑（16 §5.3；非 core Report 機制，與 §3.9.1 `TickHooks.onAutosave` 為不同關注點）。
  grep 自查：六輪裁決 1 新收 10 事件全數存在於本文件 §4.3 union；union 相對 02 §4.19 canonical 無多餘
  成員（僅 03 專有 `command.rejected` 例外，符合既有「本 union 為 03 步驟發出／消費之子集」定位，
  非六輪裁決要求之全量鏡射）。依據：02 §8「2026-07-11 六輪裁決」1／2／4，13 §3.7(5)。
