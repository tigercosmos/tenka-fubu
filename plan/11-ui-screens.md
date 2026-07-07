# 11 — UI 畫面規格（UI Screens）

> 遵循 `plan/00-foundations.md` §13 結構。本文件是**畫面清單、wireframe、導航、美術方向**的單一真相來源。
> 元件層級細節（按鈕、表格、slider 的樣式與 design token 數值）見 `plan/12-ui-components.md`；
> 字串主表見 `plan/13-i18n-strings.md`；本文件出現的字串 key 與建議文案由 13 彙整定案。

---

## 1. 目的與範圍

定義《天下布武》全部玩家可見畫面：資訊架構、每個畫面的 ASCII wireframe、區塊像素尺寸、
進出導航、互動流程、鍵盤快捷鍵、縮放策略與美術方向定調。實作者依本文件即可完成
`src/ui/screens/` 全部畫面骨架與 `src/app/` 的 UI 狀態機，不需再做畫面設計決策。

**不在本文件範圍**：遊戲機制與公式（見各系統文件）、design token 精確值與通用元件
（見 12）、地圖鏡頭與 Pixi 渲染（見 04）、存讀檔與設定的資料邏輯（見 16）。

## 2. 與其他文件的關係

| 文件 | 本文件如何引用 |
|---|---|
| `plan/02-data-model.md` | 所有實體欄位（Castle.durability、District.kokudaka…）以 02 為準；本文件只描述「顯示什麼」 |
| `plan/03-game-loop.md` | 玩家操作一律轉為 Command 入佇列；Command 型別與驗證見 03 |
| `plan/04-map-and-movement.md` | 地圖渲染、鏡頭操作、尋路與預估日數公式；迷你地圖繪製 |
| `plan/05-domestic.md` | 施設 slot 規則、開發方針效果、輸送與徵兵機制 |
| `plan/06-officers.md` | 能力、特性、身分、忠誠、具申的機制與資料 |
| `plan/07-military.md` | 編成規則、合戰戰場模型、戰法、采配、威風、攻城模式 |
| `plan/08-diplomacy.md` | 外交行動、信用/感情、朝廷幕府機制 |
| `plan/09-ai.md` | 委任（軍團/合戰委任）AI 行為 |
| `plan/10-events-and-victory.md` | 事件資料、大命效果、勝敗條件 |
| `plan/12-ui-components.md` | 本文件引用之通用元件（`ResourceBar`、`DataTable`、`Modal`…）與 token 定案 |
| `plan/13-i18n-strings.md` | 字串 key 主表；本文件 §6 為畫面字串的來源草案 |
| `plan/16-save-and-settings.md` | 存讀檔槽位邏輯、設定項語意、標題流程的資料面 |

---

## 3. 設計細節

### 3.1 資訊架構總圖與導航模型

#### 3.1.1 畫面層級總圖

```
TitleScreen（標題）
 ├─ 開始新遊戲 ──▶ ScenarioSelectScreen（劇本選擇）
 │                   └─ 選定劇本 ──▶ DaimyoSelectScreen（大名選擇＋難易度）
 │                                     └─ 開始 ──▶ MainScreen（主畫面）
 ├─ 繼續遊戲 ──▶ SaveLoadPanel(讀檔模式) ──▶ MainScreen
 └─ 設定 ──▶ SettingsPanel（回標題）

MainScreen（策略層，常駐）
 ├─ 選取物 ▶ 底部上下文面板（城/郡/部隊 三態）
 │            ├─ 城 ▶ CastlePanel（概要/內政/軍事/輸送 四頁）
 │            │        └─ 軍事頁「出陣」▶ MarchModal（出陣編成）
 │            └─ 郡 ▶ DistrictPanel
 ├─ 左側快捷列（F1..F7）
 │    ├─ 內政 ▶ CastlePanel(選取城或本城)     ├─ 軍事 ▶ MarchModal
 │    ├─ 外交 ▶ DiplomacyPanel（勢力/朝廷/幕府）├─ 武將 ▶ OfficersPanel ▶ OfficerDetail
 │    ├─ 政策 ▶ PolicyPanel  ├─ 軍團 ▶ CorpsPanel  └─ 大命 ▶ TaimeiPanel
 ├─ 通知堆疊 ▶ ReportsPanel（報告中心）
 ├─ 月初（自動暫停）▶ EventModal* ▶ ProposalInbox ▶ MonthSummaryModal
 ├─ 合戰發動 ──▶ BattleScreen（含攻城前哨野戰；結束返回 MainScreen）
 ├─ ESC ▶ SystemMenu ▶ SaveLoadPanel / SettingsPanel / 回標題
 └─ 勝敗判定成立 ──▶ EndingScreen ──▶ TitleScreen
```

#### 3.1.2 導航規則（canonical）

- **Screen** 是互斥的頂層畫面（`ScreenId`，見 §4），同時只存在一個。
- **Panel** 是主畫面上的可疊視窗，以單一堆疊（`panelStack`）管理；開新 panel 推入堆疊，
  ESC 或關閉鈕彈出最上層。堆疊上限 3 層（例：武將一覽 → 武將詳細 → 所在城面板）；
  超過時移除最底層。同一 `PanelId` 重複開啟時更新參數並移到頂層，不重複入疊。
- **Modal** 是阻擋型視窗（出陣編成、具申、事件、月初摘要、系統選單、確認框），
  同時最多顯示一個，其餘排入 `modalQueue` 依序顯示。事件/具申/月初摘要/合戰顯示時
  策略時間強制暫停（00 §5.3）；出陣編成與系統選單開啟時**不**強制暫停（玩家可自行暫停）。
- ESC 優先序：modal > panelStack 頂層 > 取消目前選取 > 開啟 SystemMenu。

### 3.2 標題、劇本選擇、大名選擇

#### 3.2.1 TitleScreen（1920×1080 全螢幕，墨黑底＋金色紋樣邊框）

```
┌──────────────────────────────────────────────┐
│                                              │
│              天  下  布  武                   │  ← 遊戲標題，Noto Serif TC 96px，和紙色
│         〜 戰國大戰略・致敬同人作品 〜          │  ← 副標 20px，金色
│                                              │
│              ［ 開始新遊戲 ］                  │  ← 按鈕 320×56，垂直間距 16px
│              ［ 繼續遊戲   ］                  │  ← 無任何存檔時 disabled
│              ［ 設定       ］                  │
│                                              │
│  v1.0.0 ・ 非商業同人作品聲明（8px 頁尾）       │
└──────────────────────────────────────────────┘
```

- 進入：應用程式啟動、EndingScreen 結束、系統選單「回到標題」。
- 離開：三顆按鈕。「繼續遊戲」直接開啟 SaveLoadPanel（讀檔模式，覆蓋於標題之上）。

#### 3.2.2 ScenarioSelectScreen

```
┌─ 劇本選擇 ──────────────────────────［返回］─┐
│ ┌──────────────┐  ┌────────────────────────┐ │
│ │ ▶ 1560       │  │  桶狹間前夜             │ │
│ │   桶狹間前夜  │  │  1560年5月。今川義元…   │ │  ← 右側：劇本說明 640px 寬
│ │ （v1.0 僅一） │  │  勢力數：41　城數：120   │ │     含起始年月、規模統計
│ └──────────────┘  │        ［ 選擇此劇本 ］  │ │
│   左列 400px 寬    └────────────────────────┘ │
└──────────────────────────────────────────────┘
```

- 進入：標題「開始新遊戲」。離開：「返回」回標題；「選擇此劇本」→ DaimyoSelectScreen。
- v1.0 僅 s1560 一個項目，但列表元件即為多劇本佈局（00 §1.5）。

#### 3.2.3 DaimyoSelectScreen

```
┌─ 大名選擇 ─ 1560 桶狹間前夜 ─────────［返回］─┐
│ ┌────────────────────────┐ ┌────────────────┐ │
│ │                        │ │ ◆ 織田家（家紋） │ │
│ │   全國地圖預覽          │ │ 當主：織田信長   │ │
│ │  （勢力色塊，點選即選定）│ │ 石高：31萬石     │ │
│ │                        │ │ 城：4　武將：28  │ │
│ │                        │ │ 難易度評價：★★★ │ │
│ └────────────────────────┘ ├────────────────┤ │
│  左 60% 寬                  │ 難易度 [中級 ▼] │ │
│  推薦大名列（橫向卡片×6）    │ 種子   [自動  ] │ │
│  [織田][今川][武田][長尾]…  │ ［ 開始遊戲 ］  │ │
└──────────────────────────────────────────────┘
```

- 地圖預覽為靜態勢力色塊渲染（04 的簡化模式）；點任一勢力領地即選取該大名。
- 難易度三檔（初級/中級/上級，00 §11）；種子欄留空則隨機（顯示「自動」），
  規則見 `plan/16`。「開始遊戲」→ 建立 GameState → MainScreen。

### 3.3 主畫面（MainScreen）：全螢幕地圖＋HUD

基準解析度 1920×1080（uiScale=1，縮放見 §3.16）。地圖 canvas 鋪滿整個視窗，
HUD 為 DOM 層覆蓋其上；HUD 未覆蓋處均可與地圖互動。

```
┌──────────────────────────────────────────────────────── 1920×48 ─┐
│ 1560年5月3日 春 │ 金 1,250貫 │ 糧 48,000石 │ 威信 320 │ ⏸ ×1 ×2 ×5 │ ← 上緣資源列
├──┬───────────────────────────────────────────────┬───────────────┤
│紋│                                               │ ▣ 清洲城 徵兵完成│ ← 通知堆疊
│──│                                               │ ▣ 今川軍出陣！   │    320px 寬
│內│                                               │               │
│軍│                                               │               │
│外│           全螢幕地圖（PixiJS，見 04）           │               │
│武│                                               │               │
│政│                                               ├───┬───────────┤
│團│                                               │   │           │
│命│                                               │   │ 迷你地圖   │
├──┴──────────────────────────────────────────┬────┘   │ 288×192   │
│ 底部上下文面板 1536×168（選城/郡/部隊時切換）  │        │           │
└─────────────────────────────────────────────┴────────┴───────────┘
 ↑左側快捷列 72px 寬
```

#### HUD 區塊尺寸表（uiScale=1；rem 制，1rem=16px）

| 區塊 | 位置（x, y） | 尺寸 | 內容摘要 |
|---|---|---|---|
| 上緣資源列 | 0, 0 | 1920×48 | 日期＋季節、金錢、全城兵糧合計、威信、速度控制 |
| 左側快捷列 | 0, 48 | 72×1032 | 家紋 72×88 ＋ 七顆 56×56 圖示鈕（間距 8px） |
| 通知堆疊 | 1588, 60 | 320×(72×N) | 最新在上，最多 `BAL.uiToastMaxVisible` 張 |
| 迷你地圖 | 1620, 876 | 288×192 | 勢力色塊＋視野框；點擊跳轉鏡頭（04） |
| 底部上下文面板 | 72, 912 | 1536×168 | 選取物三態內容；未選取時隱藏 |

#### 3.3.1 上緣資源列

```
│ 1560年5月3日 春 ┃ 金 1,250貫 ▲ ┃ 糧 48,000石 ┃ 威信 320 ┃ ⏸ │×1│×2│×5│ ┃ ☰ │
```

- 日期依 00 §9 格式；季節以單字（春/夏/秋/冬）金色小字。
- 金錢後的 ▲/▼ 表示上月收支正負（滑鼠懸停顯示 tooltip：上月收入/支出明細，元件見 12）。
- 兵糧為**我方全部城的合計**（僅總覽；分城數字在城面板）。
- 速度控制四鈕互斥高亮：暫停/×1/×2/×5（00 §5.2）。暫停時全鈕外框轉朱紅並緩慢呼吸閃爍。
- 最右 ☰ 鈕＝開啟 SystemMenu（等同 ESC 於無面板時）。

#### 3.3.2 左側大名欄與快捷

- 頂端家紋方塊 72×88：上 64×64 家紋 SVG（§3.15），下 24px 顯示大名家短名（如「織田」）。
  點擊＝鏡頭跳至本城並選取之。
- 七顆快捷鈕由上而下（F1..F7）：內政、軍事、外交、武將、政策、軍團、大命。
  - 內政：開啟目前選取城的 CastlePanel 內政頁；未選城則開本城。
  - 軍事：開啟 MarchModal（出發城＝目前選取城，未選則本城）。
  - 其餘五顆開對應 Panel。有未讀具申時「大命」上方另插入朱紅圓點徽章於「☰」；
    具申未讀徽章顯示於通知堆疊頂端常駐卡（見 3.11）。

#### 3.3.3 通知堆疊（右側）

- 每張 toast 320×72：左 40×40 類別圖示、標題一行、內文一行（溢出省略）。
- 來源為每 tick 的 Report（00 §5.4 步驟 13）。嚴重度三級：`info`（和紙底）、
  `warning`（金框）、`critical`（朱紅框，例：我方城被圍、武將出奔）。
- 顯示 `BAL.uiToastDurationMs` 後淡出；`critical` 不自動淡出，需點擊。
  點擊 toast：跳轉鏡頭至相關地點並選取相關物；右上 ✕ 僅關閉。
- 堆疊底部固定一顆「報告中心」小鈕（320×28）開啟 ReportsPanel。

#### 3.3.4 底部上下文面板（三態）

選取城（我方）：
```
┌ 清洲城（本城）◆織田 ─────────────────────────────────────────┐
│ 耐久 ████████░░ 800/1000   兵 4,200人   糧 12,500石           │
│ 城主：柴田勝家   所轄郡：春日井・愛知・海東                     │
│                          ［城面板］［出陣］［輸送］             │168px
└──────────────────────────────────────────────────────────────┘
```
選取郡：
```
┌ 春日井郡（清洲城轄）◆織田 ───────────────────────────────────┐
│ 石高 42,000石  商業 380  人口 21,000人  治安 ██████░░ 64      │
│ 領主：木下藤吉郎（開發方針：商業優先）        ［郡面板］        │
└──────────────────────────────────────────────────────────────┘
```
選取部隊（我方）：
```
┌ 柴田勝家隊 ◆織田 ────────────────────────────────────────────┐
│ 兵 3,000人  士氣 ██████████ 85  糧 900石（尚可 30日）          │
│ 目標：鳴海城（剩 4日）狀態：行軍中    ［變更目標］［撤返］       │
└──────────────────────────────────────────────────────────────┘
```

- 敵方城/郡/部隊：同版型但只讀（無按鈕；數值依情報規則顯示，規則見 `plan/04`/`plan/08`）。
- 我方部隊圍城中時，按鈕列改為 ［強攻］［包圍］［撤返］，並於地圖城節點上方顯示攻城
  overlay（§3.12.2）。
- 面板高 168px 固定；未選取任何物時整塊隱藏（地圖可視範圍放大）。

### 3.4 城面板（CastlePanel）

左錨視窗：位置 (84, 60)，尺寸 480×840。頂部標題列＋四頁籤：概要/內政/軍事/輸送。
敵方城僅顯示概要頁（只讀）。

#### 3.4.1 概要頁

```
┌ 清洲城 ◆織田（本城）────────────［✕］┐
│ [概要]│內政│軍事│輸送                │
│ 城主：柴田勝家（統85 武92 知68 政70）  │
│ 耐久 ████████░░  800 / 1,000         │
│ 兵力 ██████░░░░ 4,200 / 7,000        │
│ 兵糧 12,500石（守城可支 90日）         │
│ 士氣 █████████░ 88                   │
│ ── 所轄郡（3）──────────────────────  │
│ ▸ 春日井郡  42,000石 治64 領主:木下…  │ ← 列點擊＝選取該郡並開 DistrictPanel
│ ▸ 愛知郡    38,000石 治71 直轄       │
│ ▸ 海東郡    27,000石 治58 領主:前田…  │
│ ── 駐留武將（6）────────────────────  │
│ 柴田勝家(城主)・前田利家・佐佐成政 …   │ ← 點名字開 OfficerDetail
└──────────────────────────────────────┘
```

- 「守城可支 n日」＝顯示值，公式見 `plan/07`（兵糧÷日耗）。城主列點擊可更換城主
  （下拉：駐留中身分「侍大將」以上武將，00 §4；發 Command，見 06）。

#### 3.4.2 內政頁（城下施設）

```
│ 概要│[內政]│軍事│輸送                 │
│ ── 城下施設（slot 6，本城規格見 05）── │
│ ┌────┐┌────┐┌────┐                  │
│ │市場 ││兵舍 ││(空) │  ← slot 128×96  │
│ │Lv2  ││Lv1  ││ ＋  │     3欄×2列格狀 │
│ └────┘└────┘└────┘                  │
│ ┌────┐┌────┐┌────┐                  │
│ │(空) ││(鎖) ││(鎖) │ ← 鎖=耐久等級不足│
│ └────┘└────┘└────┘                  │
│ ── 建造選單（點空 slot 展開）────────  │
│ ▸ 市場      500貫  90日  商業+…       │
│ ▸ 兵舍      400貫  60日  徵兵+…       │
│ ▸ 米倉      300貫  60日  兵糧上限+…   │
│   （清單與效果數值見 plan/05）         │
│ ── 徵兵 ────────────────────────────  │
│ 徵兵 [▁▂▃ slider ▃▂▁] 500人  [執行]   │
└──────────────────────────────────────┘
```

- slot 數量、建造清單、成本與效果全部以 `plan/05` 為準；本頁只定佈局：3 欄格狀、
  每格 128×96、顯示施設名＋等級、建造中顯示進度環與剩餘日數。
- 點擊「＋」空格展開建造選單（同頁下半部清單，選項點擊→確認框→發 Command）。

#### 3.4.3 軍事頁

```
│ 概要│內政│[軍事]│輸送                 │
│ 兵力 4,200 / 7,000   士氣 88          │
│ ［ 出　陣 ］  ← 主按鈕 432×56 朱紅     │
│ ── 駐留武將（可出陣 6）──────────────  │
│ ☐ 柴田勝家  統85 武92  兵疲勞:無      │
│ ☐ 前田利家  統78 武88  兵疲勞:無      │
│ ☐ 佐佐成政  統74 武80  （出陣中）灰字  │
│ ── 在途我方部隊（此城出發 1）────────  │
│ ▸ 佐佐成政隊 1,200人 → 鳴海城 剩2日   │
└──────────────────────────────────────┘
```

- 「出陣」開 MarchModal 並預選本城為出發城；勾選的武將帶入 modal 的編成槽。

#### 3.4.4 輸送頁

```
│ 概要│內政│軍事│[輸送]                 │
│ 自 清洲城 輸送至：[小牧山城 ▼]         │ ← 下拉：連通的我方城（04 尋路）
│ 兵糧 [slider] 3,000石（庫存12,500）    │
│ 金錢由勢力統一持有，不需輸送（00 §4）   │
│ 兵力 [slider] 500人（駐兵4,200）       │
│ 護送武將：[前田利家 ▼]（可空）          │
│ 預估 6日・路徑：清洲→小牧山            │
│                       ［執行輸送］     │
└──────────────────────────────────────┘
```

- 輸送規則（是否可被截擊、耗時公式）見 `plan/05`／`plan/04`；slider 刻度
  `BAL.uiMarchFoodStep`（石）與 `BAL.uiMarchSoldierStep`（人）。

### 3.5 郡面板（DistrictPanel）

左錨視窗同 CastlePanel 位置，尺寸 480×560。

```
┌ 春日井郡（清洲城轄）◆織田 ──────［✕］┐
│ 石高   ████████░░ 42,000石（開發72%）  │
│ 商業   █████░░░░░ 380 / 2,000         │
│ 人口   21,000人（月增 +80）            │
│ 治安   ██████░░░░ 64                  │
│ ── 領主任命 ─────────────────────────  │
│ 領主：[木下藤吉郎 ▼]                   │ ← 下拉含「直轄」＋候選武將
│  候選排序：政務高→低；顯示 政務/忠誠    │
│ ── 開發方針（三選一，效果見 plan/05）── │
│ (○) 農業優先   ( ) 商業優先   ( ) 均衡 │
│ ── 郡情報 ──────────────────────────  │
│ 特產：－   街道：清洲、小牧山方面       │
└──────────────────────────────────────┘
```

- 四條資源條顏色：石高＝金、商業＝朱、人口＝和紙白、治安＝依值漸層（低於
  `BAL.securityRiotThreshold`＝30 時整條轉朱紅並顯示「一揆危險」，機制見 05）。
- 領主任命與開發方針變更即發 Command；直轄郡的開發方針單選鈕 disabled
  （直轄郡不自動開發，規則見 05），並顯示灰字說明「直轄郡由玩家以城內政操作」。

### 3.6 出陣編成 Modal（MarchModal）

置中 modal 880×600；進入目標選擇階段時收合為頂部橫條 480×64，讓出地圖。

```
┌ 出陣編成 ─ 出發：清洲城 ────────────────────［✕］┐
│ ┌─ 大將 ─────┐ ┌─ 副將1 ────┐ ┌─ 副將2 ────┐   │
│ │ 柴田勝家    │ │ 前田利家    │ │  ＋ 選擇    │   │ ← 卡片 272×160
│ │ 統85 武92   │ │ 統78 武88   │ │             │   │   點擊開武將選單
│ │ 戰法:突擊    │ │ 戰法:槍衾   │ │             │   │   （駐留可出陣者）
│ └────────────┘ └────────────┘ └────────────┘   │
│ 兵數   [▁▂▃▅▆ slider ▆▅▃▂▁]  3,000 / 4,200人    │ ← 刻度 BAL.uiMarchSoldierStep
│ 兵糧   [▁▂▃ slider ▃▂▁]  900石（可支 30日）       │ ← 刻度 BAL.uiMarchFoodStep
│ 目標   （未選）［ 在地圖上選擇目標 ］              │
│ 路徑預覽：—                                      │
│                    ［取消］      ［出　陣］(灰)   │
└──────────────────────────────────────────────────┘
```

目標選擇階段（modal 收合，時間自動暫停直到確認或取消）：
```
┌ 請在地圖上點選目標（城或郡）───［返回編成］┐   ← 固定於畫面頂緣中央 480×64
└────────────────────────────────────────────┘
   地圖上：懸停合法目標→高亮；點擊→繪出路徑折線＋「預估 12日」浮標
```

- 副將槽位數＝`BAL.armyMaxSubOfficers`（建議初值 2，定義見 `plan/07`）。
- 兵數 slider 上限＝城駐兵；預設值＝大將統率推導之建議兵數（公式見 07）。
- 兵糧 slider 預設＝「可支日數 ≒ 預估行軍日數×2＋30」所需量（純 UI 預設，
  `BAL.uiMarchFoodDefaultExtraDays`＝30）；上限＝城庫存。
- 目標選定後回到編成版面，顯示路徑摘要「清洲→鳴海（經 愛知郡）・預估 12日」，
  「出陣」鈕轉為可按（朱紅）。按下→發 march Command（03）→關閉 modal。
- 合法目標與預估日數公式見 `plan/04`；非法目標（不連通、我方城）點擊時目標條
  抖動並顯示原因 tooltip。

### 3.7 武將一覽（OfficersPanel）與武將詳細卡（OfficerDetail）

全螢幕 panel：置中 1440×880，背景 60% 墨黑 scrim（地圖仍在後方，時間不暫停）。

```
┌ 武將一覽（織田家 28名）───────────────────────────［✕］┐
│ 篩選:[全部▼][所在城▼][身分▼][役職▼]  搜尋:[____]      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 姓名▾    統▾ 武▾ 知▾ 政▾ 身分▾   忠誠▾ 所在▾ 役職▾ │ │ ← 表頭點擊排序
│ │ 柴田勝家  85  92  68  70 家老     92   清洲  城主   │ │
│ │ 木下藤吉郎 78  62  94  96 侍大將   96   春日井 領主  │ │
│ │ …（虛擬捲動列表，列高 40px）                        │ │
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

- 欄位：姓名/統率/武勇/知略/政務/身分/忠誠/所在/役職；預設排序＝身分降冪→功績降冪。
- 忠誠 <30 者整列淡朱紅底（出奔風險，00 §6）；出陣中者「所在」顯示「出陣中→目標」。
- 點列 → OfficerDetail 疊於堆疊頂層（480×700 右錨視窗）：

```
┌ 柴田勝家 ◆織田 家老 ────────────［✕］┐
│ 統率 ████████▌  85 /120               │ ← 條狀圖（§8 決策 D6）
│ 武勇 █████████▏ 92                    │
│ 知略 ██████▏    68                    │
│ 政務 ██████▊    70                    │
│ 忠誠 92   功績 3,480   年齡 38         │
│ 身分：家老   役職：清洲城主            │
│ 戰法：突擊    特性：[鬼柴田][猛攻]      │ ← 特性 chip，懸停顯效果（06）
│ 知行：－（城主不受封郡）               │
│ ── 經歷（最近 5 筆）─────────────────  │
│ 1560/4 尾張統一戰 功績+120             │
│ ── 操作 ────────────────────────────  │
│ ［褒賞］［移動］［任命…▼］             │ ← 可用操作依 06 規則
└──────────────────────────────────────┘
```

### 3.8 外交畫面（DiplomacyPanel）

全螢幕 panel 1440×880。三頁籤：勢力/朝廷/幕府。

```
┌ 外交 ──────────────────────────────────────────［✕］┐
│ [勢力]│朝廷│幕府                                     │
│ ┌ 勢力列表（左 560px）─────┐ ┌ 詳細（右 816px）────┐ │
│ │ ◆今川家  感情:敵視 信用12 │ │ ◆ 今川家            │ │
│ │   ⚔(交戰中)              │ │ 當主:今川義元        │ │
│ │ ◇武田家  感情:普通 信用35 │ │ 感情 ██░░░ 敵視(18) │ │
│ │   🤝(同盟) 婚(婚姻)       │ │ 信用 █▏░░░ 12/100   │ │
│ │ ◇齋藤家  感情:不信 信用 8 │ │ 協定：無            │ │
│ │ …（依感情排序，可捲動）    │ │ ── 行動 ──────────  │ │
│ │                          │ │ [外交工作(月100貫)]  │ │
│ │                          │ │ [同盟締結][婚姻同盟] │ │
│ │                          │ │ [停戰交涉][從屬勸告] │ │
│ │                          │ │ [斷交]（不足則灰＋因）│ │
│ └──────────────────────────┘ └────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- 感情/信用數值與行動門檻、成本全依 `plan/08`；按鈕 disabled 時 tooltip 顯示缺什麼
  （「信用不足：需 60，現 12」）。協定圖示：🤝同盟、婚婚姻、休停戰、從從屬（以 12 的
  icon 元件實作，此處定語意）。
- 朝廷頁：朝廷友好度條、獻金按鈕、官位一覽表（已授與者顯示武將名）；幕府頁：
  幕府關係、役職請求；機制全見 `plan/08`。佈局同勢力頁之左右分欄。
- 調略（引拔/流言/內應）行動入口在**目標武將/城**的詳細面板上（06/08），不在本畫面。

### 3.9 政策、軍團、大命畫面

三者皆為全螢幕 panel 1440×880，共用「卡片網格」版式：左側卡片網格（3 欄，卡 432×240），
右側 480px 詳細欄。

- **PolicyPanel（政策）**：每張卡＝一項政策（名稱、每月維持費、威信門檻、效果摘要、
  狀態徽章：施行中/可施行/未解鎖）。右欄顯示完整效果與［施行］/［廢止］鈕。
  政策清單與效果見 `plan/05`。
- **CorpsPanel（軍團）**：上半部軍團列表（軍團名、軍團長、轄下城數、方針）；
  下半部選定軍團的編輯區：軍團長下拉（家老以上，00 §4）、轄城多選清單（點擊城名切換
  歸屬）、方針單選（選項與語意見 `plan/07`/`plan/09`）。
  ［新設軍團］／［解散軍團］鈕在列表頂部。
- **TaimeiPanel（大命）**：卡片＝可發動的大命（名稱、發動成本、持續期間、效果、
  冷卻中則顯示剩餘日數）。右欄詳細＋［發動］。大命清單與效果見 `plan/10`。

```
┌ 政策 ────────────────────────────────［✕］┐
│ ┌────────┐┌────────┐┌────────┐ ┌ 詳細 ──┐ │
│ │樂市樂座 ││兵農分離 ││(未解鎖) │ │樂市樂座 │ │
│ │施行中   ││可施行   ││威信800  │ │商業成長 │ │
│ │月200貫  ││月350貫  ││         │ │+…(05)  │ │
│ └────────┘└────────┘└────────┘ │[廢止]   │ │
│ …                               └────────┘ │
└────────────────────────────────────────────┘
```

### 3.10 具申收件匣（ProposalInbox）

月初自動彈出（modal，時間已暫停）；亦可從通知堆疊常駐卡開啟。置中 720×640。

```
┌ 具申 ─ 1560年6月（3件）──────────────┐
│ ┌──────────────────────────────────┐ │
│ │ 木下藤吉郎（春日井郡領主）呈報：    │ │ ← 提案卡 672×200
│ │ 「懇請於清洲城增建市場，振興商業。」│ │    含提案者頭銜、內文、
│ │  成本：500貫・工期 90日            │ │    成本/效果摘要（06）
│ │        ［駁回］      ［採納］       │ │
│ └──────────────────────────────────┘ │
│  ● ○ ○   ← 卡片流指示點，處理完自動下一張│
│                        ［全部駁回］    │
└──────────────────────────────────────┘
```

- 一次一張卡；採納/駁回即發 Command（採納駁回對忠誠的影響見 06），
  自動翻至下一張；全部處理完 modal 自動關閉並進入月初流程下一步（§3.14.2）。

### 3.11 合戰畫面（BattleScreen）與攻城 overlay

#### 3.11.1 合戰畫面（頂層 Screen，策略時間暫停，00 §5.3）

```
┌ 桶狹間合戰 ─ 織田 3,000 對 今川 12,000 ─ 第2刻 ─ ⏸ ×1 ×2 │委任[關]│［撤退］┐ 48px
├────────┬────────────────────────────────────────────┬──────────────────┤
│我方部隊卡│                                            │ 戰況記錄          │
│┌──────┐│         戰術地圖（陣節點圖，Pixi）            │ [1刻]兩軍於田樂狹間│
││柴田隊  ││   ◎我陣─○─○─◎敵本陣  節點=陣，線=通路      │      接觸         │
││3,000  ││   部隊棋子置於節點上，點選我隊→點目標節點移動 │ [2刻]柴田隊突擊！ │
││士氣85██││                                            │      敵先鋒潰走   │
│└──────┘│                                            │ …（自動捲動）     │
│ 280px   │                                            │ 320px            │
├────────┴────────────────────────────────────────────┴──────────────────┤
│ 采配 ████████░░ 62/100（回復中）  ［突擊 25］［齊射 20］［鼓舞 15］［罠 30］│ 136px
└─────────────────────────────────────────────────────────────────────────┘
```

- 進入：野戰兵力達門檻時（07）自動暫停並彈確認框「發動合戰？」→ 是 → 本畫面；
  否 → 維持自動解算。離開：勝敗判定成立（07）→ 結果 modal（威風獲得量、損害）→
  返回 MainScreen；或「撤退」（確認框，撤退罰則見 07）。
- 部隊卡：武將名、兵數（即時遞減）、士氣條、狀態徽章（交戰/移動/潰走）。點卡＝選取。
- 戰法鈕：顯示名稱＋采配成本；采配不足時灰化。采配上限與回復速率見 07
  （`BAL.battleSaihaiMax` 建議 100）。鈕按下→選目標（依戰法型態自動或點選）。
- 委任開關：開啟後由 AI 操作我軍（09），玩家仍可隨時關閉收回操作；速度鈕僅作用於
  合戰子迴圈。戰況記錄每列格式 `[{battleTick}刻] {內文}`，battleTick 定義見 07。

#### 3.11.2 攻城 overlay（策略地圖上，非獨立畫面）

我方部隊圍城中、且選取該部隊或該城時，於城節點上方顯示錨定 overlay 320×132：

```
        ┌ 鳴海城攻圍 ─ 第18日 ──────────┐
        │ 耐久 ██████░░░░ 540/900        │
        │ 士氣 ████░░░░░░ 38             │
        │ 城糧 ██░░░░░░░░ 估 20日        │ ← 敵城兵糧為估計值（情報規則見 08）
        │   (○)包圍   ( )強攻            │ ← 切換即發 Command（模式效果見 07）
        └───────────────────────────────┘
```

- 三條顏色：耐久＝金、士氣＝和紙白、城糧＝朱。強攻選中時 overlay 外框轉朱紅。
- 底部上下文面板同步顯示同資訊＋［撤返］（§3.3.4）。落城時 overlay 以金色閃光收束，
  發 `critical` 報告。

### 3.12 事件 cutscene、月初摘要、勝敗結局、報告中心

#### 3.12.1 事件 cutscene modal（EventModal）

置中 960×540，上下黑邊 letterbox；背景＝墨黑漸層＋事件關聯勢力家紋 20% 透明浮水印
（不使用外部圖片資產）。

```
┌──────────────────────────────────────────┐
│（家紋浮水印背景）                          │
│  永祿三年五月——                           │ ← 事件標題 32px 金色
│  今川義元率大軍二萬五千，上洛之途…          │ ← 內文打字機效果，
│                                          │   BAL.uiEventTextSpeedMsPerChar
│         ［迎擊！(選項A)］ ［籠城 (選項B)］  │ ← 無選項事件則單顆［繼續］
└──────────────────────────────────────────┘
```

- 事件內容與選項效果由 `plan/10` 資料驅動；點擊畫面任意處可跳過打字機直接全文。

#### 3.12.2 月初摘要 modal（MonthSummaryModal）

置中 800×620，月初流程最後一步（§3.14.2）。

```
┌ 1560年6月 月初摘要 ──────────────────┐
│ 收入  金 +1,850貫（商業1,650/其他200） │
│ 支出  金 −1,180貫（俸祿900/政策280）   │
│ 兵糧  −3,600石（存量 44,400石）        │
│ ── 領內動靜 ──────────────────────    │
│ ・春日井郡 商業 +12（木下藤吉郎）       │
│ ・小牧山城 兵舍 完工                   │
│ ・具申 2件已處理                       │
│ ── 天下動靜 ─────────────────────     │
│ ・武田家攻落 葛尾城                    │
│                    ［關閉並繼續▶］     │
└──────────────────────────────────────┘
```

- 內容列由當月 Report 聚合（分類規則見 §5.3）；列數超過 12 時內部捲動。

#### 3.12.3 勝敗結局畫面（EndingScreen，頂層 Screen）

- 勝利（統一/勝利條件見 10）：墨黑全屏 → 金色「天下布武」大字 → 統計卡
  （耗時年月、合戰數、最大版圖、家臣數）→［回到標題］。
- 敗北（本城陷落且無城/當主死亡無繼承，見 10）：朱紅轉黑 → 「〈家名〉，就此斷絕」→
  同統計卡 →［回到標題］。兩者皆不可 ESC 跳過統計卡。

#### 3.12.4 報告中心（ReportsPanel）

全螢幕 panel 1440×880。左側篩選欄 280px：類別核取（內政/軍事/外交/人事/事件/系統）、
只看重要（warning 以上）、日期範圍（年月下拉）。右側時間軸列表（新→舊），每列：
日期、類別圖示、內文、［前往▸］（跳轉鏡頭至相關地點）。分頁大小
`BAL.uiReportPageSize`；Report 保留與清理策略見 `plan/03`。

### 3.13 系統選單、存讀檔、設定

- **SystemMenu**（modal 400×420，開啟時不強制暫停，但預設行為「開啟即暫停」為設定項，
  見 16）：五鈕直排——回到遊戲/存檔/讀檔/設定/回到標題（回標題需確認框，提示未存檔進度
  將遺失）。
- **SaveLoadPanel**（置中 960×720）：槽位直列，槽數 `BAL.saveSlotCount`（建議初值 12，
  定義見 `plan/16`；另含 1 自動存檔槽置頂、只讀）。每槽 912×88：家紋、勢力名、
  遊戲內日期、城數/石高摘要、真實存檔時刻、遊玩時數。存檔模式點槽→若非空槽確認覆蓋；
  讀檔模式點槽→確認→載入。序列化與版本遷移見 16。
- **SettingsPanel**（置中 720×640）：分組開關/下拉——自動暫停事件逐項開關（00 §5.2 清單）、
  UI 縮放（自動/固定 100%）、打字機效果開關、自動存檔頻率。設定項語意與儲存見 16；
  本畫面只定佈局：左標籤右控制項、每列高 48px。

### 3.14 互動流程逐步圖

#### 3.14.1 出陣流程

```
[玩家] 選取我方城 ──▶ 底部面板［出陣］或城面板軍事頁［出陣］或快捷 F2
   ▼
[UI] 開 MarchModal（編成階段）
   ▼ 玩家：點大將卡 → 武將選單選柴田勝家 → （可選）副將 ×2
   ▼ 玩家：拉兵數 slider、兵糧 slider（UI 顯示可支日數）
   ▼ 玩家：按［在地圖上選擇目標］
[UI] modal 收合為頂部條；時間暫停（記錄先前速度）
   ▼ 玩家：地圖點選 鳴海城（合法性檢查：04）
[UI] 繪路徑折線＋預估 12日浮標 → 自動展回編成版面（顯示路徑摘要）
   ▼ 玩家：按［出陣］
[UI] 發 Command{march}（03）→ 關 modal → 恢復先前速度
   ▼ 下一 tick
[core] 建立 Army、開始沿 path 行軍（04/07）→ Report「柴田勝家隊出陣」
```

#### 3.14.2 月初流程（自動暫停 → 具申 → 摘要 → 繼續）

```
[core] tick 進入 X月1日 → 產出月初 GameEvent 群（00 §5.4）
   ▼
[UI] 偵測月初 → 記錄 wasRunning ← (速度≠暫停) → 強制暫停
   ▼ 依序組 modalQueue：
     1. EventModal ×N（本月觸發之歷史/汎用事件，10）
     2. ProposalInbox（若待處理具申 >0）
     3. MonthSummaryModal（恆有）
   ▼ 逐一顯示，玩家逐一處理/關閉
[UI] 佇列清空 → 若 wasRunning 且設定「月初後自動繼續」開啟 → 恢復速度
     （若玩家在設定關閉「月初自動暫停」：跳過整段，僅發摘要 toast；§8 D8）
```

#### 3.14.3 宣戰到落城的完整玩家旅程

```
1 [外交] DiplomacyPanel：對今川［斷交］（協定解除/宣戰效果見 08）→ 感情轉敵對
2 [備戰] 城面板內政頁徵兵、輸送頁向前線城集糧
3 [出陣] §3.14.1 流程，目標＝敵境鳴海城
4 [行軍] 部隊沿街道移動；途經敵郡自動「制壓」（進度環顯示於郡節點，04）
5 [遭遇] 敵援軍接近 → 自動暫停（設定）→ 野戰自動解算開始（07）
6 [合戰] 兵力達門檻 → 確認框「發動合戰？」→ BattleScreen → 大勝
7 [威風] 結果 modal 顯示「威風・大！」→ 返回地圖：鄰近敵郡逐一翻色歸順動畫
         ＋ Report 連發（07 威風規則）
8 [圍城] 部隊抵鳴海城 → 攻城 overlay 出現 → 玩家切［包圍］耗其城糧
9 [落城] 城糧盡、士氣崩 → 落城（07）→ critical Report「鳴海城落城」
         → 城歸屬翻轉、捕虜處置 modal（06）→ 戰線推進完成
```

### 3.15 美術方向（定調；token 數值定案見 plan/12）

#### 3.15.1 色票（建議 hex，12 定案）

| 名稱 | 建議值 | 用途 |
|---|---|---|
| 墨黑 `ink` | `#161310` | 全域背景、scrim |
| 墨黑亮 `inkLight` | `#242019` | 面板內分隔、hover 底 |
| 和紙 `washi` | `#EDE4D3` | 面板底、主要文字（於墨黑上） |
| 和紙暗 `washiDim` | `#B8AD98` | 次要文字、disabled |
| 朱紅 `vermilion` | `#C93A2B` | 主要行動鈕、警戒、敵對 |
| 金 `gold` | `#C9A227` | 強調框線、資源數字、我方高亮 |
| 松綠 `pine` | `#3D6B52` | 成功/完成狀態 |

- 質感：面板以 `washi` 上疊 3% 雜訊 SVG 濾鏡模擬紙紋；外框 1px `gold` 40% 透明；
  modal 陰影為柔和墨暈（大半徑低透明）。嚴禁漸層濫用——僅結局畫面與事件背景可用。
- 字體：全域 Noto Serif TC（自帶打包，00 §2）；數字用 `font-variant-numeric: tabular-nums`
  對齊；標題可用 700 weight，內文 400。

#### 3.15.2 家紋（Kamon）：資料驅動幾何 SVG

每個 Clan 一枚家紋，由 `KamonSpec`（§4）驅動：底色圓（直徑 60/64 viewBox，外環 2px 金）
＋前景幾何形。形狀枚舉 `KamonShape` 12 式（皆為簡化幾何，非史實家紋摹寫，避免資產爭議）：

| shape | 幾何描述 | 參考聯想（僅示意） |
|---|---|---|
| `petal5` | 五枚等距花瓣（圓弧） | 織田（木瓜簡化） |
| `bars2` | 橫粗條二枚 | 今川（引兩簡化） |
| `nestedDiamond` | 菱形內含四小菱 | 武田（四菱） |
| `tripleTriangle` | 三角形品字三枚 | 北條（三鱗） |
| `crossRing` | 圓環內十字 | 島津（轡十字） |
| `star3Bar` | 橫條上三圓點 | 毛利（一文字三星） |
| `tomoe3` | 三逗點旋形（以三偏心圓近似） | 長尾/巴紋系 |
| `squareEyes4` | 斜置四目結（四小方孔） | 尼子 |
| `ring` | 單粗圓環 | 通用 |
| `doubleRing` | 雙同心環 | 通用 |
| `petal6` | 六枚花瓣 | 通用 |
| `bars3` | 橫條三枚 | 通用 |

各大名之 shape/顏色指派存於劇本資料（`plan/14`）；渲染演算法見 §5.4。
前景色預設 `washi`、底色預設該勢力色（`Clan` 勢力色欄位見 02），資料可覆寫。

### 3.16 鍵盤快捷鍵與縮放策略

#### 3.16.1 快捷鍵表（canonical；不可重綁，v1.0 無自訂鍵位）

| 鍵 | 作用 | 條件 |
|---|---|---|
| `Space` | 暫停/恢復（恢復至前一檔位） | MainScreen、BattleScreen |
| `1` / `2` / `3` | 速度 ×1 / ×2 / ×5 | 同上 |
| `Esc` | 依 §3.1.2 優先序關閉/開系統選單 | 全域 |
| `F1`~`F7` | 左側快捷列七項（§3.3.2） | MainScreen |
| `Tab` / `Shift+Tab` | 循環選取我方城（鏡頭跟隨） | MainScreen |
| `Home` | 鏡頭跳至本城並選取 | MainScreen |
| `W A S D` / 方向鍵 | 平移鏡頭（參數見 04） | MainScreen |
| `＋`/`－`/滾輪 | 縮放鏡頭（04） | MainScreen |
| `R` | 開啟報告中心 | MainScreen |
| `M` | 迷你地圖顯示切換 | MainScreen |
| `F5` / `F9` | 快速存檔 / 快速讀檔（槽位規則見 16） | MainScreen |
| `Enter` | 觸發目前 modal 的主要（右側）按鈕 | modal 開啟時 |

- 文字輸入框聚焦時停用全部單鍵快捷（僅 Esc 有效＝離開輸入框）。

#### 3.16.2 最小解析度 1280×720 縮放策略

- 設計基準 1920×1080。啟動與 resize 時計算
  `uiScale = clamp(min(vw/1920, vh/1080), BAL.uiScaleMin, BAL.uiScaleMax)`，
  寫入 `document.documentElement` 的 `--ui-scale` 並設 `font-size: calc(16px * var(--ui-scale))`。
- **全部 HUD/面板尺寸以 rem 撰寫**（本文件之 px 皆指 uiScale=1 時的等效值；
  實作換算 `px ÷ 16 = rem`）。地圖 canvas 不縮放，原生填滿視窗（devicePixelRatio 處理見 04）。
- 1280×720 時 uiScale＝0.667：頂列 32px、左列 48px、上下文面板 112px，地圖可視區仍
  ≥ 1160×512。視窗小於 1280×720 時，鋪全屏遮罩顯示 `ui.system.tooSmall` 字串，暫停遊戲。
- 設定可強制 uiScale=1（「UI 縮放：固定 100%」，見 16），供高解析玩家取得更小 HUD。

---

## 4. 資料結構

以下型別屬 UI 層（`src/ui/` 與 `src/app/`），存於獨立 Zustand UI store，
**不進 GameState、不入存檔**（設定除外，見 16）。`KamonSpec` 例外：其值由劇本資料
（14）提供、掛於 Clan 實體（欄位定義以 02 為準），本文件擁有其型別語意。

```ts
/** 頂層畫面（互斥） */
export type ScreenId =
  | 'title'          // 標題
  | 'scenarioSelect' // 劇本選擇
  | 'daimyoSelect'   // 大名選擇
  | 'main'           // 主畫面（策略層）
  | 'battle'         // 合戰畫面
  | 'ending';        // 勝敗結局

/** 主畫面可疊面板 */
export type PanelId =
  | 'castle'        // 城面板（params.castleId、params.tab）
  | 'district'      // 郡面板（params.districtId）
  | 'officers'      // 武將一覽
  | 'officerDetail' // 武將詳細卡（params.officerId）
  | 'diplomacy'     // 外交（params.tab: 'clans'|'court'|'shogunate'）
  | 'policy'        // 政策
  | 'corps'         // 軍團
  | 'taimei'        // 大命
  | 'reports'       // 報告中心
  | 'saveLoad'      // 存讀檔（params.mode: 'save'|'load'）
  | 'settings';     // 設定

/** 阻擋型 modal */
export type ModalId =
  | 'march'         // 出陣編成
  | 'proposalInbox' // 具申收件匣
  | 'monthSummary'  // 月初摘要
  | 'event'         // 事件 cutscene（params.eventId）
  | 'battlePrompt'  // 「發動合戰？」確認
  | 'battleResult'  // 合戰結果（含威風）
  | 'captive'       // 捕虜處置（06）
  | 'systemMenu'    // 系統選單
  | 'confirm';      // 通用確認框（params.messageKey…）

export interface PanelInstance {
  id: PanelId;
  /** 面板參數，值一律為 ID 字串或 enum 字面值 */
  params: Record<string, string>;
}

export interface ModalInstance {
  id: ModalId;
  params: Record<string, string>;
  /** true = 顯示期間強制暫停策略時間（§3.1.2 表列） */
  pausesTime: boolean;
}

/** 地圖選取物（單選；kind 決定底部上下文面板型態） */
export interface Selection {
  kind: 'castle' | 'district' | 'army';
  id: string; // castle.* / dist.* / army 實體 ID（02）
}

/** 通知 toast（由 Report 投影而來；Report 本體在 GameState.reports） */
export interface ToastItem {
  reportId: string;              // 對應 Report ID（02）
  severity: 'info' | 'warning' | 'critical';
  createdAtMs: number;           // 真實時間戳（performance.now()，僅供淡出計時）
}

/** 出陣編成 modal 的工作狀態（confirm 前不產生任何 Command） */
export interface MarchDraft {
  originCastleId: string;        // 出發城
  leaderOfficerId: string | null;// 大將（必填才可出陣）
  subOfficerIds: string[];       // 副將，長度 ≤ BAL.armyMaxSubOfficers
  soldiers: number;              // 兵數（人），刻度 BAL.uiMarchSoldierStep
  food: number;                  // 攜帶兵糧（石），刻度 BAL.uiMarchFoodStep
  targetNodeId: string | null;   // 目標節點（castle.* 或 dist.*）
  previewPath: string[] | null;  // 預覽路徑節點 ID 序列（04 尋路結果）
  previewDays: number | null;    // 預估日數（04 公式）
  phase: 'compose' | 'pickTarget'; // modal 兩階段
}

/** UI store 根狀態 */
export interface UIState {
  screen: ScreenId;
  panelStack: PanelInstance[];   // 最上層＝末端；長度 ≤ 3
  modal: ModalInstance | null;   // 目前顯示中的 modal
  modalQueue: ModalInstance[];   // 待顯示佇列（FIFO）
  selection: Selection | null;
  toasts: ToastItem[];           // 顯示中 toast，最新在前
  marchDraft: MarchDraft | null; // march modal 開啟期間存在
  speedBeforePause: 1 | 2 | 5;   // 強制暫停前的檔位（恢復用）
  uiScale: number;               // §3.16.2 計算結果
}

/** 家紋規格（值由劇本資料提供；掛載欄位見 02 之 Clan） */
export interface KamonSpec {
  shape: KamonShape; // 幾何形式
  fg: string;        // 前景色 hex；預設 '#EDE4D3'（washi）
  bg: string;        // 底圓色 hex；預設＝勢力色
}

export type KamonShape =
  | 'petal5' | 'petal6' | 'bars2' | 'bars3'
  | 'nestedDiamond' | 'tripleTriangle' | 'crossRing' | 'star3Bar'
  | 'tomoe3' | 'squareEyes4' | 'ring' | 'doubleRing';

/** 武將一覽表格的排序狀態 */
export interface OfficerTableSort {
  key: 'name' | 'ldr' | 'val' | 'int' | 'pol'
     | 'rank' | 'loyalty' | 'location' | 'title';
  dir: 'asc' | 'desc';
}
```

---

## 5. 演算法與公式

本文件引入之 BAL 常數（單位、建議初值；定案見 `plan/15-balance.md`）：

| 常數 | 建議初值 | 單位/說明 |
|---|---|---|
| `BAL.uiToastDurationMs` | 8000 | toast 自動淡出毫秒（critical 不適用） |
| `BAL.uiToastMaxVisible` | 5 | 同時顯示 toast 上限，溢出者僅入報告中心 |
| `BAL.uiMarchSoldierStep` | 100 | 兵數 slider 刻度（人） |
| `BAL.uiMarchFoodStep` | 100 | 兵糧 slider 刻度（石） |
| `BAL.uiMarchFoodDefaultExtraDays` | 30 | 出陣兵糧預設值的緩衝日數 |
| `BAL.uiDoubleClickMs` | 300 | 地圖雙擊判定窗（雙擊城＝直接開城面板） |
| `BAL.uiEventTextSpeedMsPerChar` | 18 | 事件打字機每字毫秒 |
| `BAL.uiReportPageSize` | 50 | 報告中心每頁筆數 |
| `BAL.uiScaleMin` | 0.667 | uiScale 下限（=1280/1920） |
| `BAL.uiScaleMax` | 1.25 | uiScale 上限 |

### 5.1 導航堆疊與 ESC 處理

```
openPanel(id, params):
  if panelStack 內已有相同 id: 更新其 params, 移至頂端; return
  panelStack.push({id, params})
  if panelStack.length > 3: panelStack.shift()   // 移除最底層

onEsc():
  if modal != null:
    if modal.id in ['event','proposalInbox','monthSummary','battleResult','captive']:
      return                     // 強制處理型 modal 不可 ESC 逃逸
    closeModal()                 // 其餘（march/systemMenu/confirm）等同取消
  else if panelStack.length > 0: panelStack.pop()
  else if selection != null:     selection = null   // 同時隱藏底部面板
  else:                          enqueueModal('systemMenu', pausesTime=false)
```

### 5.2 modal 佇列與強制暫停

```
enqueueModal(instance):
  modalQueue.push(instance); pump()

pump():   // modal 關閉時亦呼叫
  if modal != null or modalQueue.empty: return
  modal = modalQueue.shift()
  if modal.pausesTime and speed != paused:
    speedBeforePause = speed; core.setSpeed(paused)

closeModal():
  wasPausing = modal.pausesTime; modal = null
  if modalQueue.empty and wasPausing and monthStartResumePermitted():
    core.setSpeed(speedBeforePause)   // 佇列清空才恢復（月初多 modal 連放）
  pump()
```

`monthStartResumePermitted()`：月初流程時尊重設定「月初後自動繼續」；非月初情境恆 true。

### 5.3 月初 UI 編排（對應 §3.14.2）

```
onGameEvents(events):            // 每 tick 由 app 層收 core 的 GameEvent[]
  if events.has('monthStart'):
    if settings.autoPause.monthStart == false:
      pushToast(monthSummaryReport); return   // 僅摘要 toast，不彈 modal
    for e in events.filter(kind=='historicalEvent' or 'genericEvent'):
      enqueueModal('event', {eventId: e.id}, pausesTime=true)
    if state.proposals.pendingCount > 0:
      enqueueModal('proposalInbox', {}, pausesTime=true)
    enqueueModal('monthSummary', {}, pausesTime=true)
```

月初摘要分組規則：Report 依 category 映射至「收支（economy）/領內動靜（我方 clanId 相關
之 domestic/military/personnel）/天下動靜（他勢力 military/diplomacy 大事，僅
`warning` 以上）」，各組依日期升冪列出。

### 5.4 家紋 SVG 產生

```
renderKamon(spec: KamonSpec, sizePx) -> SVGElement:
  svg(viewBox 0 0 64 64):
    circle(cx32 cy32 r30, fill=spec.bg)
    circle(cx32 cy32 r30, stroke=GOLD@40%, strokeWidth2, fill none)
    switch spec.shape:                       // 全部以 fill=spec.fg 繪製
      petal5/petal6: N 枚橢圓花瓣，中心 (32,32)，半徑 18，每枚旋轉 360/N 度
      bars2/bars3:   N 條 36×8 圓角矩形，垂直等距置中
      nestedDiamond: 4 枚 12×12 菱形，排成大菱形四象限（間隙 2）
      tripleTriangle:3 枚邊長 16 等邊三角形，品字排列
      crossRing:     環（外r20 內r14）＋ 十字（兩條 28×7 矩形）挖空重疊
      star3Bar:      36×7 橫條（y=22）＋ 3 枚 r4 圓（y=38，x=20/32/44）
      tomoe3:        3 枚 r9 圓，圓心繞中心 r10 等距 120 度（近似巴紋）
      squareEyes4:   4 枚 10×10 方形旋轉 45 度，繞中心 r11 等距 90 度
      ring/doubleRing: 同心環（外r20 內r13；double 加 外r26 內r23）
  以 CSS 縮放至 sizePx（SVG 向量無損）
```

### 5.5 武將一覽排序（穩定多鍵）

```
sortOfficers(rows, sort: OfficerTableSort):
  primary = compare by sort.key（rank 依六階序數、location 依城名筆畫、其餘數值/字串）
  tieBreak = merit desc, then officer id asc      // 保證決定性順序
  return stableSort(rows, [primary(sort.dir), tieBreak])
```

### 5.6 uiScale 計算（對應 §3.16.2）

```
onResize():
  if vw < 1280 or vh < 720: showTooSmallOverlay(); core.setSpeed(paused); return
  hideTooSmallOverlay()
  uiScale = settings.uiScaleFixed ? 1
          : clamp(min(vw/1920, vh/1080), BAL.uiScaleMin, BAL.uiScaleMax)
  setCssVar('--ui-scale', uiScale)
```

### 5.7 toast 生命週期

```
onReports(reports):              // 每 tick 步驟 13 的產出
  for r in reports.filter(r => r.toastWorthy):     // 分級規則見 plan/03
    toasts.unshift({reportId:r.id, severity:r.severity, createdAtMs:now()})
  while countVisible(toasts) > BAL.uiToastMaxVisible:
    移除最舊之非 critical toast（critical 保留，可能暫時超量顯示）
每 rAF: 對 severity != 'critical' 且 age > BAL.uiToastDurationMs 者播放淡出後移除
```

---

## 6. UI/UX：繁中字串表（key 依 00 §9；主表彙整於 plan/13）

| key | 繁中文案 |
|---|---|
| `ui.title.newGame` | 開始新遊戲 |
| `ui.title.continue` | 繼續遊戲 |
| `ui.title.settings` | 設定 |
| `ui.title.disclaimer` | 本作為非商業致敬同人作品 |
| `ui.scenario.title` | 劇本選擇 |
| `ui.scenario.choose` | 選擇此劇本 |
| `ui.daimyo.title` | 大名選擇 |
| `ui.daimyo.difficulty` | 難易度 |
| `ui.daimyo.seed` | 亂數種子 |
| `ui.daimyo.start` | 開始遊戲 |
| `ui.common.back` | 返回 |
| `ui.common.close` | 關閉 |
| `ui.common.confirm` | 確定 |
| `ui.common.cancel` | 取消 |
| `ui.hud.gold` | 金錢 |
| `ui.hud.food` | 兵糧 |
| `ui.hud.prestige` | 威信 |
| `ui.hud.pause` | 暫停 |
| `ui.rail.domestic` | 內政 |
| `ui.rail.military` | 軍事 |
| `ui.rail.diplomacy` | 外交 |
| `ui.rail.officers` | 武將 |
| `ui.rail.policy` | 政策 |
| `ui.rail.corps` | 軍團 |
| `ui.rail.taimei` | 大命 |
| `ui.castle.tab.overview` | 概要 |
| `ui.castle.tab.domestic` | 內政 |
| `ui.castle.tab.military` | 軍事 |
| `ui.castle.tab.transport` | 輸送 |
| `ui.castle.durability` | 耐久 |
| `ui.castle.garrison` | 兵力 |
| `ui.castle.lord` | 城主 |
| `ui.castle.districts` | 所轄郡 |
| `ui.castle.march` | 出陣 |
| `ui.castle.conscript` | 徵兵 |
| `ui.castle.foodDays` | 守城可支{days}日 |
| `ui.district.steward` | 領主 |
| `ui.district.direct` | 直轄 |
| `ui.district.devPolicy.agri` | 農業優先 |
| `ui.district.devPolicy.commerce` | 商業優先 |
| `ui.district.devPolicy.balanced` | 均衡發展 |
| `ui.district.riotRisk` | 一揆危險 |
| `ui.march.title` | 出陣編成 |
| `ui.march.leader` | 大將 |
| `ui.march.sub` | 副將 |
| `ui.march.soldiers` | 兵數 |
| `ui.march.food` | 攜帶兵糧 |
| `ui.march.pickTarget` | 請在地圖上點選目標 |
| `ui.march.estDays` | 預估{days}日 |
| `ui.march.go` | 出陣 |
| `ui.officers.title` | 武將一覽 |
| `ui.officer.loyalty` | 忠誠 |
| `ui.officer.merit` | 功績 |
| `ui.officer.rank` | 身分 |
| `ui.officer.history` | 經歷 |
| `ui.diplomacy.title` | 外交 |
| `ui.diplomacy.tab.court` | 朝廷 |
| `ui.diplomacy.tab.shogunate` | 幕府 |
| `ui.diplomacy.trust` | 信用 |
| `ui.diplomacy.sentiment` | 感情 |
| `ui.policy.adopt` | 施行 |
| `ui.policy.abolish` | 廢止 |
| `ui.corps.new` | 新設軍團 |
| `ui.corps.disband` | 解散軍團 |
| `ui.taimei.invoke` | 發動 |
| `ui.proposal.title` | 具申 |
| `ui.proposal.accept` | 採納 |
| `ui.proposal.reject` | 駁回 |
| `ui.proposal.rejectAll` | 全部駁回 |
| `ui.battle.delegate` | 委任 |
| `ui.battle.retreat` | 撤退 |
| `ui.battle.saihai` | 采配 |
| `ui.battle.prompt` | 是否發動合戰？ |
| `ui.siege.assault` | 強攻 |
| `ui.siege.encircle` | 包圍 |
| `ui.army.changeTarget` | 變更目標 |
| `ui.army.recall` | 撤返 |
| `ui.summary.title` | {year}年{month}月　月初摘要 |
| `ui.summary.continue` | 關閉並繼續 |
| `ui.ending.victory` | 天下布武，大業成矣 |
| `ui.ending.defeat` | {clan}，就此斷絕 |
| `ui.reports.title` | 報告中心 |
| `ui.reports.goto` | 前往 |
| `ui.system.save` | 存檔 |
| `ui.system.load` | 讀檔 |
| `ui.system.toTitle` | 回到標題 |
| `ui.system.resume` | 回到遊戲 |
| `ui.system.confirmToTitle` | 未存檔的進度將會遺失，確定回到標題？ |
| `ui.system.tooSmall` | 視窗過小：本遊戲需要至少 1280×720 的視窗 |

---

## 7. 實作任務清單

- [ ] **T1　UI store 與導航機**：實作 `UIState`、panel 堆疊、modal 佇列、ESC 優先序（§5.1/§5.2）。
      驗收：單元測試覆蓋堆疊上限、重複開啟、強制型 modal 不可 ESC、月初佇列恢復速度。
- [ ] **T2　標題三畫面**：Title/ScenarioSelect/DaimyoSelect 全流程可玩到進入 MainScreen。
      驗收：無存檔時「繼續遊戲」disabled；難易度與種子正確傳入 GameState 建構。
- [ ] **T3　主畫面 HUD**：資源列、左快捷列、通知堆疊、迷你地圖框、上下文面板三態（§3.3）。
      驗收：1920×1080 下各區塊尺寸誤差 ≤2px；選取切換 <16ms 更新；敵方選取為只讀。
- [ ] **T4　城面板四頁**（§3.4）。驗收：四頁籤切換保留捲動位置；施設格與建造選單發出正確
      Command；敵城僅概要頁。
- [ ] **T5　郡面板**（§3.5）。驗收：領主任命下拉候選排序正確；直轄時方針 disabled。
- [ ] **T6　出陣編成 modal**（§3.6）。驗收：兩階段切換；非法目標有原因提示；confirm 前
      零 Command 副作用；預估日數與 04 尋路一致。
- [ ] **T7　武將一覽＋詳細卡**（§3.7）。驗收：600 筆資料排序/篩選 <50ms；排序決定性
      （§5.5 tieBreak）；忠誠 <30 列有視覺警示。
- [ ] **T8　外交/政策/軍團/大命 四畫面**（§3.8/§3.9）。驗收：disabled 行動皆有原因
      tooltip；卡片網格在 uiScale 0.667 不溢版。
- [ ] **T9　具申收件匣**（§3.10）。驗收：卡片流逐張處理、全部駁回、處理完自動關閉並
      接續月初佇列。
- [ ] **T10　合戰畫面＋攻城 overlay**（§3.11）。驗收：委任開關即時生效；采配不足戰法灰化；
      overlay 三條與 core 狀態同步；強攻/包圍切換發 Command。
- [ ] **T11　事件/月初摘要/結局/報告中心**（§3.12）。驗收：打字機可跳過；摘要分組正確；
      報告篩選與「前往」跳轉正常；結局統計卡數據正確。
- [ ] **T12　系統選單/存讀檔/設定**（§3.13）。驗收：槽位覆蓋確認；F5/F9 可用；
      回標題有確認框。
- [ ] **T13　月初與出陣互動流程整合測試**（§3.14）。驗收：Playwright smoke 走完
      「新遊戲→出陣→月初三連 modal→繼續」不出錯。
- [ ] **T14　家紋渲染器**（§5.4）。驗收：12 種 shape 於 16/24/64px 皆清晰；同一 spec
      輸出之 SVG 字串完全一致（決定性）。
- [ ] **T15　快捷鍵與縮放**（§3.16）。驗收：全表快捷鍵於對應畫面生效、輸入框聚焦時停用；
      1280×720 全畫面無溢版、無橫向捲軸；過小視窗出現遮罩並暫停。

---

## 8. 設計決策記錄

- **D1　單堆疊面板而非自由多視窗**：多視窗拖曳增加狀態複雜度與遮擋問題；單堆疊（上限 3）
  行為可預測、ESC 語意單純，符合本作「地圖為主體」的資訊架構。
- **D2　全螢幕 panel 不暫停時間，強制型 modal 才暫停**：保留「即時天下大勢」的緊張感
  （00 §1.3 支柱 2）；玩家翻閱武將表時世界仍在動，需要細想可隨時 Space。自動暫停清單
  以 00 §5.2 為準，本文件不擴充。
- **D3　家紋採資料驅動幾何 SVG**：迴避著作權資產（00 §1.2）、零圖片資源、任意尺寸清晰、
  新增勢力只需資料不需美術。取捨：辨識度低於真實家紋，以勢力色＋短名輔助辨識。
- **D4　選取資訊用固定底部面板，不用游標旁 popup**：popup 隨游標跳動易遮地圖且難以
  放置操作鈕；固定面板讓「選取→行動」動線穩定，也是攻城操作（強攻/包圍）的錨點。
- **D5　出陣目標選擇採「modal 收合＋地圖直選」混合式**：在 modal 內嵌小地圖會與 04 的
  主地圖渲染重複實作；收合式讓玩家用完整地圖（含縮放尋路預覽）選目標，成本低且體驗好。
  期間強制暫停，避免目標在選取中移動（部隊目標仍限城/郡節點，追擊機制見 07）。
- **D6　武將能力用水平條狀圖，不用雷達圖**：四維雷達面積易誤導（相鄰軸相關性錯覺）、
  小尺寸難讀；條狀圖可直接標數值且與 120 上限（00 §6）對齊，實作僅需 div。
- **D7　兵糧在 HUD 只顯示全國合計**：兵糧為城層級資源（00 §4），逐城數字放城面板；
  HUD 合計僅供宏觀感知，避免頂列塞入城清單。懸停 tooltip 列出前 5 大糧倉城。
- **D8　關閉「月初自動暫停」設定時整段月初 modal 流程降級為 toast**：既然玩家選擇不被
  打斷，彈任何 modal 都違反其意圖；具申改累積於收件匣常駐卡（含未讀數），事件仍依
  00 §5.2 各自的自動暫停設定獨立判定。
- **D9　px 規格一律以 uiScale=1 基準、rem 實作**：讓 1280×720 到 2560×1440 共用一套
  版面數字；地圖 canvas 獨立於 uiScale，確保世界渲染解析度不因 UI 縮放而劣化。
- **D10　v1.0 不做快捷鍵自訂**：鍵位表固定可降低設定/存檔面積與測試矩陣；表列鍵位已避開
  瀏覽器保留組合。若未來加入，於 16 的設定資料結構擴充。
