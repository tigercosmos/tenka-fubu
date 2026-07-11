# 12 — UI 元件庫與 Design Tokens

> 本文件是《天下布武》共用 UI 元件庫、design tokens、PixiJS 場景內視覺元件的**單一真相來源**。
> 依 `plan/00-foundations.md` §13 規範撰寫；術語依 00 §14 與 `plan/19-glossary.md`。

---

## 1. 目的與範圍

### 1.1 目的

定義所有可重用 UI 建材，使畫面層（`plan/11-ui-screens.md`）能以「組裝」方式實作，
不需要再做任何視覺設計決策。內容包含：

1. Design tokens 完整表（CSS custom properties 與 TypeScript 常數雙形式）。
2. 24 個共用 React 元件的 props 介面、狀態、行為、樣式要點。
3. PixiJS 地圖場景內 8 種視覺元件的繪製參數。
4. 動畫規範與 `prefers-reduced-motion` 支援。
5. 無障礙基線。
6. 元件目錄結構、命名規範、開發用展示路由 `/dev/components`。

### 1.2 範圍界線

- **屬於本文件**：可跨畫面重用的元件、tokens、Pixi 場景元件的「長相與動態」。
- **不屬於本文件**：畫面佈局與導航（參見 `plan/11-ui-screens.md`）、Pixi 渲染管線與圖層架構
  （參見 `plan/04-map-and-movement.md`）、字串主表（參見 `plan/13-i18n-strings.md`）、
  遊戲數值（參見 `plan/15-balance.md`）。

---

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/00-foundations.md` | 最高準則；技術選型（React 18、PixiJS 8、CSS Modules、Noto Serif TC）與禁止事項（不得使用 CSS 框架）由 00 §2 定案 |
| `plan/02-data-model.md` | 本文件引用的 `OfficerId`、`CastleId`、`ClanId`、`ArmyId`、`GameDate` 等型別定義於 02；元件 props 直接使用這些型別 |
| `plan/04-map-and-movement.md` | Pixi 圖層順序、鏡頭、世界座標系（4096×4096）定義於 04；本文件只定義「畫在圖層上的元件」 |
| `plan/07-military.md` | 威風等級、士氣崩潰、合戰門檻等**遊戲規則**定義於 07；本文件僅消費其事件與數值做視覺呈現 |
| `plan/11-ui-screens.md` | 消費本文件元件組裝畫面；全域鍵盤快捷鍵註冊也在 11 |
| `plan/13-i18n-strings.md` | 本文件 §6 列出元件層需要的字串 key 與建議繁中文字；13 的主表為定案值 |
| `plan/16-save-and-settings.md` | 設定畫面使用本文件元件；本文件不新增任何設定項 |

規則重申：一個機制只在一份文件定義。本文件引用他文件機制時一律「參見」，不複述公式。

---

## 3. 設計細節

### 3.1 Design Tokens

#### 3.1.1 單一真相來源：`src/ui/styles/tokens.ts`

Tokens 以 TypeScript 常數為唯一定義處，理由：PixiJS 需要 `0xRRGGBB` 數值色，
CSS 需要 custom properties，兩者必須永遠一致。

```ts
// src/ui/styles/tokens.ts —— 全部 UI tokens 的單一真相來源
export const TOKENS = {
  color: { /* §3.1.2、§3.1.3 全部色彩，值為 '#rrggbb' 字串 */ },
  font: { /* §3.1.4 */ },
  space: { /* §3.1.5 */ },
  radius: { /* §3.1.5 */ },
  shadow: { /* §3.1.5 */ },
  zIndex: { /* §3.1.6 */ },
  duration: { /* §3.1.7 */ },
} as const;

/** 啟動時（main.tsx，React mount 前）呼叫一次：
 *  將 TOKENS 全部展平成 :root 的 CSS custom properties（--ink-900 等），
 *  並生成 40 個勢力色 --clan-00 .. --clan-39（公式見 §5.1）。 */
export function injectCssVariables(): void;

/** 給 PixiJS 用：'#b23a28' → 0xb23a28。啟動時預先計算成 TOKENS_NUM 快取。 */
export function hexToNum(hex: string): number;
```

CSS 檔案（`*.module.css`、`global.css`）一律以 `var(--token-name)` 引用，禁止硬編碼色碼。
Pixi 繪製程式一律以 `TOKENS_NUM.xxx` 引用。

#### 3.1.2 色彩系統 — 墨黑階、和紙階、功能色

美術方向（詳見 `plan/11-ui-screens.md`）：和紙底、墨字、朱印點綴的戰國文書風。

| Token | 值 | 用途 |
|---|---|---|
| `--ink-900` | `#14120e` | 主文字、Pixi 描邊、最深墨 |
| `--ink-700` | `#2b2620` | 次級文字、標題列底 |
| `--ink-500` | `#4a4238` | 說明文字、圖示描線 |
| `--ink-300` | `#716759` | 邊框、分隔線、停用文字（值見 §8-D14） |
| `--ink-100` | `#b3a893` | 淡描線、表格斑馬紋疊色 |
| `--washi-100` | `#f5efe0` | 面板主底色（最亮和紙） |
| `--washi-200` | `#ece3cd` | 頁面底、hover 底 |
| `--washi-300` | `#e0d4b8` | 凹陷區、輸入框底、地圖陸地底色 |
| `--accent-vermilion` | `#b23a28` | 朱紅：危險、敵對、警告文字（文字安全，見 §3.5） |
| `--accent-vermilion-bright` | `#d9503a` | 朱紅亮色：裝飾、特效、非文字 |
| `--accent-gold` | `#b8862d` | 金：選取、高亮、貨幣圖示（僅裝飾，不做和紙底上文字） |
| `--accent-gold-text` | `#8a6216` | 金文字安全色（和紙底上的金色文字一律用此） |
| `--accent-indigo` | `#2e5c8a` | 藍：資訊、我方友軍、連結 |
| `--accent-moss` | `#3f6b35` | 綠：成功、成長、開發（文字安全） |
| `--accent-moss-bright` | `#5c9450` | 綠亮色：裝飾、進度條填色 |
| `--neutral-clanless` | `#8c8c84` | 無主郡／浪人的中立灰 |
| `--trait-legendary` | `#b8862d` | 特性稀有度・傳說徽章色（金；語意見 `plan/06-officers.md` §3.3／§6.2） |
| `--trait-rare` | `#6a4a86` | 特性稀有度・稀有徽章色（紫） |
| `--trait-common` | `#5f6f7c` | 特性稀有度・普通徽章色（灰藍） |

和紙質感：`--texture-washi` 為內嵌 data URI 的 SVG `feTurbulence` 雜訊
（`baseFrequency=0.9`、`numOctaves=2`、灰階、鋪磚 128×128），以
`background-image` 疊在 `--washi-100` 上、`opacity: 0.05` 等效（實作用預先乘好透明度的雜訊）。
禁止外部圖片資產。

#### 3.1.3 勢力色盤 — 40 色相環

- 40 個勢力色由公式生成（見 §5.1）：`hue = index × 9°`（360/40），
  地圖填色用 `hsl(hue, 62%, 42%)`，亮變體（棋子旗面、Badge 底）用 `hsl(hue, 58%, 52%)`。
- 生成後注入為 `--clan-00` … `--clan-39` 與 `--clan-00-bright` … `--clan-39-bright`。
- **指派規則**：`Clan.colorIndex: number`（0..39，欄位定義參見 `plan/02-data-model.md`）由劇本資料指定
  （參見 `plan/14-scenario-data.md`）。指派時遵守：
  1. 主要大名釘選建議 index（歷史印象色）：織田 5（金黃）、武田 0（赤）、今川 31（紫）、
     長尾 24（藍）、北條 21（水色）、毛利 15（綠）、三好 35（茜紅紫）、島津 27（紺）、
     伊達 38（深紅）、淺井 18（青綠）。定案表在 14。
  2. 地圖上相鄰勢力的 index 差 ≥ 4（36° 以上色相差），由 `tools/validate.ts` 檢查（參見 14）。
- 無主（`ownerId === null`）與浪人一律 `--neutral-clanless`。

#### 3.1.4 字體與字級階

```css
--font-family-serif: 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif; /* 全站唯一字族 */
--font-size-xs: 12px;   /* 輔助說明、表格密集數字 */
--font-size-sm: 14px;   /* 內文預設 */
--font-size-md: 16px;   /* 強調內文、列表項標題 */
--font-size-lg: 20px;   /* 面板標題 */
--font-size-xl: 24px;   /* 畫面標題、Dialog 標題 */
--font-size-xxl: 32px;  /* 標題畫面、結局畫面大字 */
--line-height-tight: 1.3;
--line-height-body: 1.6;
```

- Noto Serif TC 自帶打包 woff2 子集（繁中子集化，參見 `plan/01-architecture.md` 建置節）；
  現況僅 weight 400（Regular）一檔（見 §8-D13），粗體文字（如 ReportStack critical 標題）
  由瀏覽器 `font-synthesis` 合成粗體呈現，不額外宣告 `font-weight: 700` 的 `@font-face`。
- 所有數字欄位（資源、兵力、表格）套 `font-variant-numeric: tabular-nums;` 確保等寬對齊。

#### 3.1.5 間距、圓角、陰影、邊框

間距階（4 基數）：

```css
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
```

圓角（和風偏方正，圓角刻意小）：

```css
--radius-sm: 2px;   /* 按鈕、輸入框 */
--radius-md: 4px;   /* 面板、卡片 */
--radius-round: 999px; /* 士氣點、Badge 圓點 */
```

陰影（墨色、低擴散）：

```css
--shadow-1: 0 1px 3px rgba(20, 18, 14, 0.25);             /* 面板、卡片 */
--shadow-2: 0 4px 16px rgba(20, 18, 14, 0.35);            /* Dialog、Tooltip */
--shadow-focus: 0 0 0 2px var(--washi-100), 0 0 0 4px var(--accent-gold); /* 鍵盤焦點 */
```

邊框（和風細線＋角飾）：

```css
--border-thin: 1px solid var(--ink-300);   /* 一般分隔 */
--border-strong: 2px solid var(--ink-700); /* 面板外框 */
```

角飾（kado-kazari）：`Panel` 的 `ornate` 變體在四角疊 8×8px 的 L 形飾線
（`::before`/`::after` 各畫兩角，`border-top/left: 2px solid var(--ink-500)` 旋轉套用），
內縮 2px，不佔版面空間。

#### 3.1.6 z-index 層級表

| Token | 值 | 內容 |
|---|---|---|
| `--z-map` | 0 | Pixi canvas |
| `--z-map-overlay` | 50 | 地圖上的 DOM 標籤層（ETA 標籤等） |
| `--z-hud` | 100 | ResourceBar、SpeedControl、MiniMap、ContextPanel |
| `--z-dropdown` | 500 | MenuList 彈出、下拉 |
| `--z-tooltip` | 900 | Tooltip |
| `--z-modal-backdrop` | 1000 | Dialog 背板 |
| `--z-modal` | 1010 | Dialog 本體（含合戰、事件 modal） |
| `--z-toast` | 1100 | Toast/ReportStack |
| `--z-dev` | 1200 | 開發用覆蓋層（參見 `plan/01-architecture.md` 除錯工具） |

同層內以 DOM 順序決定堆疊，禁止在元件內出現表外 z-index 值。

#### 3.1.7 動效 tokens

```css
--duration-fast: 150ms;   /* 面板進出、hover、按鈕 */
--duration-normal: 300ms; /* 進度條補間、Toast 進出 */
--duration-focus: 400ms;  /* 地圖鏡頭聚焦（Pixi 內以 TOKENS.duration.focus 引用） */
--duration-awe: 800ms;    /* 威風衝擊波 */
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

#### 3.1.8 UI 常數（非 BAL）

不影響模擬結果的純呈現常數集中於 `src/ui/uiConstants.ts` 的 `UI` 物件
（**不進** `src/core/balance.ts`，理由見 §8 決策 D1）：

```ts
export const UI = {
  tooltipDelayMs: 400,        // Tooltip 延遲顯示（ms）
  tooltipFollowOffsetX: 14,   // 跟隨游標的 x 位移（px）
  tooltipFollowOffsetY: 18,   // 跟隨游標的 y 位移（px）
  toastDurationInfoMs: 6000,  // info/success Toast 自動消失（ms）
  toastDurationWarnMs: 10000, // warning Toast 自動消失（ms）
  toastMaxVisible: 5,         // Toast 同時顯示上限
  tableRowHeightPx: 40,       // DataTable 預設列高（px，固定列高）
  tableOverscanRows: 8,       // 虛擬捲動上下各多渲染列數
  virtualizeThreshold: 60,    // 列數超過此值且有 height 才啟用虛擬捲動
  minimapSizePx: 224,         // MiniMap 邊長（px）
  minimapRedrawMs: 1000,      // MiniMap 底圖重繪節流（ms）
  moralePipHigh: 70,          // 士氣點顯示分級（僅呈現用；崩潰規則參見 plan/07）
  moralePipLow: 40,
  durabilityRingWarn: 0.6,    // 耐久環轉金色門檻（比例）
  durabilityRingDanger: 0.3,  // 耐久環轉朱紅門檻（比例）
  uiScaleMin: 0.8,            // 介面縮放（16 設定項 #11 `uiScale`）下限
  uiScaleMax: 1.5,            // 介面縮放上限
  uiScaleStep: 0.05,          // 介面縮放滑桿步進
} as const;
```

### 3.2 共用 React 元件規格

通則（適用全部元件，下文不重複）：

- 位置 `src/ui/components/<Name>/<Name>.tsx` ＋ 同名 `*.module.css`，經 `src/ui/components/index.ts` 匯出。
- 所有顯示文字由呼叫端傳入**已翻譯字串**，或元件內用 `t(key)`；禁止硬編碼中文（00 §9）。
- 可互動元件皆支援鍵盤操作與 `--shadow-focus` 焦點環（§3.5）。
- 停用態：`opacity: 0.45; pointer-events: none;` 並保留 `aria-disabled`。

#### 3.2.1 Panel — 和紙質感容器

```ts
interface PanelProps {
  title?: string;                 // 標題（已翻譯）；省略則無標題列
  variant?: 'plain' | 'ornate';   // ornate = 四角角飾；預設 'plain'
  padding?: keyof typeof TOKENS.space; // 內距 token，預設 'space4'（16px）
  onClose?: () => void;           // 提供時右上顯示關閉 IconButton
  children: React.ReactNode;
}
```

- 樣式：底 `--washi-100` 疊 `--texture-washi`，外框 `--border-strong`，`--radius-md`，`--shadow-1`。
  標題列高 40px、字級 `--font-size-lg`、下緣 `--border-thin`。
- 行為：純容器，無內部狀態；進出場動畫由掛載它的畫面控制（§3.4）。

#### 3.2.2 Dialog — 對話框（Modal）

```ts
interface DialogProps {
  open: boolean;
  title: string;                    // 已翻譯
  size?: 'sm' | 'md' | 'lg';        // 寬 360 / 560 / 800px；高最大 80vh，內容捲動
  onClose: () => void;              // Esc、背板點擊、關閉鈕共用出口
  closeOnBackdrop?: boolean;        // 預設 true；ConfirmDialog 與事件 modal 設 false
  footer?: React.ReactNode;         // 底部按鈕列（右對齊）
  initialFocusRef?: React.RefObject<HTMLElement>; // 開啟時聚焦目標；預設第一個可聚焦元素
  children: React.ReactNode;
}
```

- 以 React portal 掛到 `#modal-root`；背板 `rgba(20,18,14,0.55)`。
- 開啟時鎖 `body` 捲動；focus trap（演算法見 §5.4）；`role="dialog"` `aria-modal="true"`
  `aria-labelledby` 指向標題。
- 開場動畫：背板淡入 + 本體 `translateY(8px)→0` 淡入，`--duration-fast` `--ease-out`。
- 遊戲時間互動：Dialog 本身**不**負責暫停時間；需要暫停的呼叫端（合戰、歷史事件）
  自行下暫停指令（參見 `plan/03-game-loop.md`）。

#### 3.2.3 Tooltip — 延遲顯示、可跟隨

```ts
interface TooltipProps {
  content: React.ReactNode;   // 支援富內容（如 ResourceBar 的增減明細表）
  delayMs?: number;           // 預設 UI.tooltipDelayMs
  follow?: boolean;           // true=跟隨游標；false=錨定觸發元素上緣置中。預設 false
  maxWidth?: number;          // px，預設 280
  disabled?: boolean;
  children: React.ReactElement; // 單一觸發元素（cloneElement 綁事件）
}
```

- Portal 至 `#tooltip-root`，`--z-tooltip`；底 `--ink-900`、文字 `--washi-100`、
  `--radius-sm`、`--shadow-2`、內距 `--space-2 --space-3`、字級 `--font-size-xs`。
- 觸發：`pointerenter` 起算 `delayMs` 後顯示；`pointerleave`／`pointerdown` 立即隱藏；
  觸發元素獲鍵盤焦點時無延遲顯示（無障礙）。
- 定位與翻轉演算法見 §5.3。同一時間全域最多一個 Tooltip（單例管理器）。

#### 3.2.4 TabView — 分頁

```ts
interface TabItem {
  id: string;
  label: string;      // 已翻譯
  badge?: number;     // 右上角數字徽章（如未讀具申數）；0 或省略不顯示
  disabled?: boolean;
}
interface TabViewProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'line' | 'contained'; // line=底線式（面板內）；contained=方塊式（畫面級）
  keepMounted?: boolean;          // 預設 false：非作用分頁卸載
  children: React.ReactNode;      // 與 tabs 對位的 <TabView.Pane id=...> 清單
}
```

- 作用分頁：`--accent-gold-text` 文字＋2px `--accent-gold` 底線（line）或 `--washi-100` 凸起（contained）。
- 鍵盤：`←`/`→` 移動、`Home`/`End` 跳端點、跳過 disabled；`role="tablist"/"tab"/"tabpanel"`。

#### 3.2.5 DataTable — 泛型表格（排序＋虛擬捲動 600 列）

```ts
interface ColumnDef<T> {
  key: string;                       // 欄唯一鍵，也是排序鍵
  header: string;                    // 已翻譯欄標題
  width?: number;                    // px；未指定的欄平分剩餘寬度
  align?: 'left' | 'right' | 'center'; // 預設 left；數字欄一律 right
  sortable?: boolean;                // 預設 false
  sortValue?: (row: T) => number | string; // 排序取值；sortable 時必填
  render: (row: T) => React.ReactNode;
}
interface SortState { key: string; dir: 'asc' | 'desc'; }
interface DataTableProps<T> {
  rows: readonly T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  rowHeight?: number;                // px，預設 UI.tableRowHeightPx；虛擬捲動要求固定列高
  height?: number;                   // 可視高 px；提供且列數 > UI.virtualizeThreshold 才虛擬化
  sort?: SortState;                  // 受控排序狀態
  onSortChange?: (s: SortState) => void;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;       // 高亮列
  emptyText?: string;                // 預設 t('ui.table.empty')
}
```

- 用途基準：武將一覽最多約 650 列（00 §10），60fps 捲動。虛擬捲動演算法見 §5.2。
- 表頭固定（sticky），排序欄顯示 ▲/▼；點擊循環 `asc → desc →（換欄重設 asc）`。
  排序為穩定排序，次鍵為 `rowKey`（確保重繪順序決定性）。
- 斑馬紋：偶數列疊 `--ink-100` 8% 透明度；hover 列底 `--washi-200`；
  選取列左緣 3px `--accent-gold` 實線。
- 空資料時整表區域渲染 `EmptyState`。

#### 3.2.6 OfficerCard — 武將卡（小／中／大）

```ts
type OfficerCardSize = 'sm' | 'md' | 'lg';
interface OfficerCardProps {
  officerId: OfficerId;        // 型別參見 plan/02；卡片內部以 selector 取 Officer 資料
  size?: OfficerCardSize;      // 預設 'md'
  selected?: boolean;
  disabled?: boolean;          // 如：已出陣不可再選
  disabledReason?: string;     // 已翻譯；有值時 hover 顯示 Tooltip
  showLoyalty?: boolean;       // 預設 true（md/lg 有效）
  onClick?: (id: OfficerId) => void;
}
```

| 尺寸 | 外框 | 內容 |
|---|---|---|
| `sm` | 160×44px | 勢力 Badge、姓名（`--font-size-sm`）、統率數字 |
| `md` | 220×72px | 姓名＋身分（`Rank` 顯示名）、四維數字一列（統/武/知/政，`tabular-nums`）、忠誠小字（<30 時 `--accent-vermilion`） |
| `lg` | 280×180px | md 內容＋四維 `StatBar` 四條、特性名列（最多 3 個，`Badge` 樣式）、功績值、現任役職（城主／軍團長／領主，取自 02 欄位） |

- 選取態：外框轉 `--accent-gold` 2px；`role="button"`、Enter/Space 觸發 onClick。
- 忠誠、功績、身分等數值直接讀 `GameState`（經 selector），本元件不做任何計算。

#### 3.2.7 CastleListItem — 城列表項

```ts
interface CastleListItemProps {
  castleId: CastleId;
  selected?: boolean;
  showGarrison?: boolean;   // 預設 true：顯示兵力/兵糧
  onClick?: (id: CastleId) => void;
}
```

- 固定高 48px。左至右：勢力 `Badge`（sm）→ 城格圖示（本城=雙層天守輪廓 16px、支城=單層 12px，
  inline SVG）→ 城名（`--font-size-md`）→ 右側 `showGarrison` 時「12,500兵　8,000石」小字
  （`--font-size-xs`、`--ink-500`）→ 耐久迷你 `ProgressBar`（寬 56px、高 4px）。
- 被圍城中：城名右側加朱紅「圍」字徽章（字串 `ui.castle.underSiege`）。

#### 3.2.8 ResourceBar — HUD 資源列（含增減預覽 tooltip）

```ts
interface ResourceDeltaLine { label: string; value: number; } // label 已翻譯；value 正負皆可
interface ResourceDelta {
  perMonth: number;                  // 每月淨增減（單位同資源本體）
  breakdown: ResourceDeltaLine[];    // 明細（收入來源/支出項），由 core selector 提供
}
interface ResourceBarProps {
  gold: number;                 // 貫（勢力層級，00 §6）
  goldDelta: ResourceDelta;
  foodTotal: number;            // 石；全勢力各城 food 加總（僅顯示用彙總）
  foodDelta: ResourceDelta;
  soldiersTotal: number;        // 人；全勢力現有兵力
  soldiersCap: number;          // 人；兵力上限（推導規則參見 plan/05）
  prestige: number;             // 威信 0..2000
  date: GameDate;               // 顯示 "1560年5月3日"（格式化參見 plan/13）
}
```

- 版位：畫面頂列（佈局參見 11），高 44px、底 `--ink-900`、文字 `--washi-100`。
- 每項資源 = 圖示（IconButton 的 icon 集）＋數值（千分位、`tabular-nums`）。
  hover 任一資源 → `Tooltip`（富內容）：首行「每月 +320貫」
  （正 `--accent-moss-bright`、負 `--accent-vermilion-bright`），下列 breakdown 兩欄表。
- 數值變動時做 300ms 補間滾動（reduce-motion 時直接跳值）。
- 所有 delta 計算屬 core selector（參見 `plan/05-domestic.md`），本元件只渲染。

#### 3.2.9 StatBar — 能力條（0..120）

```ts
interface StatBarProps {
  label: string;        // 已翻譯：統率/武勇/知略/政務
  value: number;        // 1..120（00 §6）
  compareValue?: number; // 有值時疊第二根半透明對照條（如加成後預覽）
  width?: number;       // px，預設 120
}
```

- 高 10px、底 `--washi-300`、填色 `--accent-indigo`；**100 以上的溢出段**改填 `--accent-gold`
  （即 `min(value,100)/120` 寬為藍、`(value-100)/120` 寬為金），一眼識別破百猛將。
- 右側數字固定 3 字元寬；`compareValue` 條 45% 透明度疊上。
- 無互動；`role="img"` ＋ `aria-label="統率 92"` 形式。

#### 3.2.10 NumberSlider — 兵數分配滑桿

```ts
interface NumberSliderProps {
  min: number;
  max: number;                 // 如城內可徵兵上限
  step?: number;               // 預設 100（兵）；金錢用 10（貫）
  value: number;
  onChange: (v: number) => void;
  label?: string;              // 已翻譯
  unit?: string;               // '兵' | '石' | '貫'，顯示於數值後（00 §9 單位緊貼）
  quickRatios?: number[];      // 快速鈕比例，預設 [0, 0.25, 0.5, 1]
}
```

- 構成：label → 滑軌（高 6px，填色 `--accent-gold`，把手 16px 圓、`--ink-700` 框）→
  數值輸入框（可直接鍵入，blur 時 clamp 到 [min,max] 並貼齊 step）→ 快速鈕列（「0」「¼」「½」「全」）。
- 鍵盤：`←`/`→` ±step、`PageUp/Down` ±10×step、`Home/End` 到 min/max。
- 拖曳中即時 onChange（呼叫端自行節流）；`role="slider"` 帶 `aria-valuemin/max/now`。

#### 3.2.11 SpeedControl — 速度控制

```ts
type GameSpeed = 'paused' | 'x1' | 'x2' | 'x5'; // 檔位定義參見 00 §5.2
interface SpeedControlProps {
  speed: GameSpeed;
  onChange: (s: GameSpeed) => void;
  disabled?: boolean;   // 合戰/事件 modal 開啟時鎖定（時間規則參見 plan/03）
}
```

- 四顆 `IconButton`（pause/play/ff2/ff5）橫列，作用檔位 `toggled`。
- 暫停中：整列外框以 `--accent-vermilion` 1px 脈動（1.5s 週期，reduce-motion 時恆亮不動）。
- 全域快捷鍵（Space=暫停切換、`1`/`2`/`3`=×1/×2/×5）由畫面層註冊（參見 11），本元件只處理點擊。

#### 3.2.12 MiniMap — 小地圖（canvas 縮圖＋視窗框）

```ts
interface MiniMapProps {
  size?: number;   // px 邊長，預設 UI.minimapSizePx（224）
  viewport: { x: number; y: number; width: number; height: number }; // 主鏡頭可視範圍（世界座標）
  onNavigate: (worldX: number, worldY: number) => void; // 點擊/拖曳 → 主鏡頭中心移至該點
}
```

- 兩層 `<canvas>`：底圖層（日本輪廓 `--washi-300` 填色＋城點 3px 勢力色＋部隊點 2px）與
  視窗框層（`--accent-gold` 1.5px 矩形）。底圖重繪節流 `UI.minimapRedrawMs`，
  視窗框隨鏡頭每幀更新（只清框層）。
- 底圖資料來自 selector `selectMiniMapModel`（§4.2），不直接讀 Pixi。
- 互動：mousedown/drag 皆呼叫 `onNavigate`（世界座標換算見 §5.5）；主鏡頭移動補間 `--duration-focus`。
- `role="img"` ＋ `aria-label={t('ui.minimap.ariaLabel')}`；鍵盤導航不支援（地圖操作皆有面板替代路徑，§3.5）。

#### 3.2.13 Toast / ReportStack — 通知堆疊

```ts
type ReportSeverity = 'info' | 'success' | 'warning' | 'critical';
// Report 實體（core 事件彙整產物）定義參見 plan/02 與 plan/03 §reports
interface ToastItem {
  id: string;
  severity: ReportSeverity;
  title: string;              // 已翻譯（core 給 key＋參數，UI 層翻譯）
  body?: string;
  date: GameDate;             // 遊戲內日期戳
  onClick?: () => void;       // 跳轉動作（如聚焦事發城）；有值時整條可點
  sticky?: boolean;           // 不自動消失；critical 預設 true
}
interface ReportStackProps {
  items: ToastItem[];         // 由新到舊
  max?: number;               // 同時顯示上限，預設 UI.toastMaxVisible
  onDismiss: (id: string) => void;
}
```

- 版位：右上角、寬 320px、由上往下堆疊（最新在最上）；超過 `max` 時最舊的非 sticky 立即移除。
- 重要度樣式：左緣 4px 色條 — info `--accent-indigo`、success `--accent-moss`、
  warning `--accent-gold`、critical `--accent-vermilion`；critical 另將標題轉 `--accent-vermilion` 粗體。
- 自動消失：info/success `UI.toastDurationInfoMs`、warning `UI.toastDurationWarnMs`、
  critical 需手動關閉。hover 時暫停倒數。
- 進出動畫：右滑淡入/淡出 `--duration-normal`；`role="status"`（critical 用 `role="alert"`）。
- 哪些 GameEvent 產生哪種 severity 的 Report，定義參見 `plan/03-game-loop.md` 與各系統文件。

#### 3.2.14 ContextPanel — 底部上下文容器

```ts
interface ContextPanelProps {
  open: boolean;
  title: string;               // 已翻譯（如選取對象名稱）
  height?: number;             // px，預設 260
  actions?: React.ReactNode;   // 標題列右側動作鈕
  onClose: () => void;         // 關閉鈕與 Esc（無 Dialog 開啟時）
  children: React.ReactNode;   // 內容由畫面層依選取對象組裝（參見 plan/11）
}
```

- 固定於視窗底緣、水平滿版（左右各留 `--space-4`）；`Panel(ornate)` 外觀。
- 進出：`translateY(100%)→0`，`--duration-fast` `--ease-out`；切換選取對象時內容直接替換不重播動畫。
- 開啟時不阻擋地圖互動（非 modal）。

#### 3.2.15 ConfirmDialog — 確認對話框

```ts
interface ConfirmDialogProps {
  open: boolean;
  title: string;                // 已翻譯
  message: React.ReactNode;     // 已翻譯；可含粗體數字
  confirmText?: string;         // 預設 t('ui.common.confirm')
  cancelText?: string;          // 預設 t('ui.common.cancel')
  danger?: boolean;             // true 時確認鈕底色 --accent-vermilion（處斬、解僱、解除同盟等）
  onConfirm: () => void;
  onCancel: () => void;
}
```

- 內部即 `Dialog(size='sm', closeOnBackdrop=false)`；`initialFocusRef` 指向**取消鈕**（防誤觸）。
- Enter=確認、Esc=取消。footer 按鈕序：取消（左）、確認（右）。

#### 3.2.16 Badge — 勢力徽章

```ts
interface BadgeProps {
  clanId?: ClanId | null;   // null/undefined = 中立灰（--neutral-clanless）
  label?: string;           // 已翻譯（勢力名或短字）；省略則只顯示 12px 色塊方印
  size?: 'sm' | 'md';       // 高 16 / 20px
}
```

- 樣式：方印形（`--radius-sm`）、底 `--clan-XX-bright`、字 `--ink-900`、外框 1px `--ink-700`。
  取色：`clanId → Clan.colorIndex → --clan-{index}-bright`。
- 純顯示元件；點擊行為由外層包 button。

#### 3.2.17 ProgressBar — 進度條（工期／制壓）

```ts
interface ProgressBarProps {
  value: number;
  max: number;                 // value/max 比例；max=0 時顯示空條
  color?: 'gold' | 'moss' | 'vermilion' | 'indigo'; // 預設 'moss'
  height?: number;             // px，預設 8
  label?: string;              // 已翻譯，如 "12/30日"；顯示於條右側
}
```

- 底 `--washi-300`、內框 1px `--ink-100`；填色取對應 `--accent-*-bright`（indigo 無 bright，用本色）。
- 值變動補間 `--duration-normal` 線性；`role="progressbar"` 帶 `aria-valuenow/max`。
- 用途：城下施設工期（05）、制壓進度（04）、外交工作進度（08）、開發度等。

#### 3.2.18 IconButton — 圖示按鈕

```ts
type IconName =
  | 'close' | 'pause' | 'play' | 'ff2' | 'ff5'
  | 'plus' | 'minus' | 'chevron-left' | 'chevron-right' | 'arrow-up' | 'arrow-down'
  | 'gear' | 'flag' | 'sword' | 'castle' | 'scroll' | 'coin' | 'rice' | 'people'
  | 'crown' | 'handshake' | 'search' | 'pin' | 'book';
interface IconButtonProps {
  icon: IconName;
  ariaLabel: string;          // 必填（無可見文字）；也作為預設 Tooltip 內容
  size?: 'sm' | 'md';         // 24 / 32px 方形
  toggled?: boolean;          // 常駐按下態（如 SpeedControl 現行檔）
  disabled?: boolean;
  onClick: () => void;
}
```

- 圖示：**自繪 inline SVG sprite**（`src/ui/components/IconButton/icons.tsx`），
  24×24 網格、`stroke: currentColor`、線寬 1.75；禁止外部 icon 庫（00 §2 禁止清單精神）。
- 態：hover 底 `--washi-200`；toggled 底 `--accent-gold` 20% 透明度＋`--accent-gold-text` 圖色。

#### 3.2.19 MenuList — 選單列表

```ts
interface MenuItem {
  id: string;
  label: string;              // 已翻譯
  icon?: IconName;
  disabled?: boolean;
  disabledReason?: string;    // 已翻譯；hover/聚焦時以 Tooltip 顯示不可用原因（重要 UX 規則）
  danger?: boolean;           // 朱紅字（破棄協定等）
}
interface MenuListProps {
  items: MenuItem[];
  onSelect: (id: string) => void;
}
```

- 用於指令選單（城指令、外交指令等，指令清單由各畫面定義，參見 11）。
- 列高 36px；`role="menu"/"menuitem"`；`↑`/`↓` 導航（跳過 disabled）、Enter 觸發。
- **停用項仍渲染**並可 hover 顯示 `disabledReason`（例：「金錢不足（需 500貫）」），
  讓玩家理解條件；reason 文字由呼叫端從驗證器結果組出（參見 `plan/03-game-loop.md` Command 驗證）。

#### 3.2.20 EmptyState — 空狀態

```ts
interface EmptyStateProps {
  icon?: IconName;      // 預設 'scroll'
  text: string;         // 已翻譯，如「目前沒有具申」
  actionText?: string;  // 已翻譯；有值時顯示動作鈕
  onAction?: () => void;
}
```

- 置中直排：圖示 40px（`--ink-100`）→ 文字（`--ink-500`、`--font-size-sm`）→ 次要按鈕。
- 用於：空表格、無報告、無俘虜、無可用武將等。

#### 3.2.21 RadioGroup — 單選鈕群組

```ts
interface RadioOption<T extends string = string> {
  value: T;
  label: string;              // 已翻譯
  disabled?: boolean;
  disabledReason?: string;    // 已翻譯；hover／聚焦時以 Tooltip 顯示不可用原因
}
interface RadioGroupProps<T extends string = string> {
  name: string;               // 群組名（同組互斥）
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;             // 已翻譯：群組標題（<legend>）
  orientation?: 'vertical' | 'horizontal'; // 預設 'vertical'
  disabled?: boolean;         // 整組停用
}
```

- 用於單選設定（如徵兵方針 低／中／高、開發重點、難易度、攻城模式 強攻／包圍）。
- 樣式：每項左側 16px 圓形指示器（選取時內填 8px `--accent-gold`、外框 1.5px `--ink-700`），
  右側 label（`--font-size-sm`）；項間距 `--space-2`；水平排列時各項以 `--space-4` 分隔。
- 結構：`<fieldset>` ＋ `<legend>`（label）；容器 `role="radiogroup"`；各項 `role="radio"` ＋ `aria-checked`。
- 鍵盤：`↑`/`↓`（水平時 `←`/`→`）於選項間移動並即時 onChange、跳過 disabled；`Home`/`End` 到端點；
  焦點進入群組時落在目前選中項（roving tabindex）。

#### 3.2.22 Checkbox — 核取方塊

```ts
interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;             // 已翻譯；省略時須給 ariaLabel
  ariaLabel?: string;         // label 省略時必填
  disabled?: boolean;
  indeterminate?: boolean;    // 部分選取態（如表頭全選欄）
}
```

- 用於布林選項（如「顯示 ETA 標籤」「僅顯示未讀」）。
- 樣式：16px 方形（`--radius-sm`）、外框 1.5px `--ink-700`；勾選時底 `--accent-gold` 20% 透明度
  ＋ `--ink-900` 勾號（inline SVG）；indeterminate 改畫一條 `--ink-900` 橫線。
- 以原生 `<input type="checkbox">` 實作；label 用 `<label>` 關聯，整塊可點；Space 切換（原生）。

#### 3.2.23 Switch — 開關

```ts
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;             // 已翻譯
  ariaLabel?: string;         // label 省略時必填
  disabled?: boolean;
}
```

- 語意上同 Checkbox 的布林值，但用於「切換後立即生效」的偏好（設定畫面）；表單型勾選用 Checkbox，
  即時開關用 Switch。
- 樣式：軌 36×20px（`--radius-round`）——關＝底 `--ink-300`、把手靠左；開＝底 `--accent-moss`、把手靠右；
  把手 16px 圓 `--washi-100`；位移過渡 `--duration-fast`（reduce-motion 時直接跳位）。
- `role="switch"` ＋ `aria-checked`；Space／Enter 切換。

#### 3.2.24 TextInput — 文字輸入

```ts
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;       // 已翻譯
  label?: string;             // 已翻譯；省略時須給 ariaLabel
  ariaLabel?: string;         // label 省略時必填
  maxLength?: number;
  disabled?: boolean;
  invalid?: boolean;          // 驗證失敗態（朱紅外框）
  leadingIcon?: IconName;     // 前置圖示（如 'search'）
  onEnter?: () => void;       // 按 Enter 提交（如搜尋、存檔命名）
}
```

- 用於**文字**輸入（存檔命名、武將／城搜尋框）；**數量輸入一律用 `NumberSlider`**（§6 慣例 3），
  本元件不承載數值調整。
- 樣式：高 32px、底 `--washi-300`、內框 1px `--ink-300`、`--radius-sm`、字級 `--font-size-sm`；
  `invalid` 時外框改 `--accent-vermilion`；有 `leadingIcon` 時左內距加 `--space-6`。
- 以原生 `<input type="text">` 實作；label 用 `<label>` 關聯或以 ariaLabel 提供；`invalid` 時加 `aria-invalid="true"`。

### 3.3 PixiJS 場景內元件

以下元件是 `src/ui/map/sceneParts/` 內的 Pixi 繪製模組（每個一檔，工廠函式回傳
`Container` 與 `update(props)` 方法）。圖層歸屬與掛載時機參見 `plan/04-map-and-movement.md`。
所有色值取 `TOKENS_NUM`；尺寸單位為**世界像素**（世界 4096×4096，00 §8），
文字用 `BitmapText`（啟動時由 Noto Serif TC 生成數字＋常用字 atlas，參見 04 效能節）。

#### 3.3.1 ArmyChip — 部隊棋子（旗＋兵數＋勢力色＋士氣點）

| 部件 | 繪製參數 |
|---|---|
| 旗竿 | 線寬 2、高 30、色 `ink900`，底端錨定於部隊世界座標 |
| 旗面 | 18×26 矩形（右緣切燕尾 6px）、填 `--clan-XX-bright`、框 1.5px `ink900`；軍團所屬部隊在旗面加一條 3px `ink900` 橫帶 |
| 兵數字 | 旗竿下方 washi100 圓角底板（`radius-sm`）＋ BitmapText 12px `ink900`；顯示千分位整數（如 `3,200`）；兵力變動時跳字 |
| 士氣點 | 底板下方 3 個 4px 圓點：士氣 ≥ `UI.moralePipHigh` 亮 3 點 `mossBright`；≥ `UI.moralePipLow` 亮 2 點 `gold`；其下亮 1 點 `vermilionBright`；滅點畫 `ink100` |
| 行進動態 | 沿路徑移動時旗面做 ±3° 搖擺（週期 900ms）；reduce-motion 時靜止 |
| 交戰中 | 疊 BattleSpark（§3.3.7）；棋子本體不動 |

點擊命中區：以旗面外擴 6px 的矩形為 hitArea。同節點多部隊時橫向錯開 14px 排列（最多顯示 4 個，第 5 起收合為「+N」棋子）。

#### 3.3.2 CastleNode — 城節點（城格差異＋耐久環）

| 部件 | 繪製參數 |
|---|---|
| 本城 | 天守輪廓多邊形（雙層屋簷剪影）28×28、填 `--clan-XX`、框 2px `ink900` |
| 支城 | 單層櫓剪影 20×20、同上填框 |
| 耐久環 | 圓弧半徑：本城 20／支城 15，線寬 3；起角 −90°、掃角 = `durability/durabilityMax × 360°`（欄位參見 02）；色：比例 > `UI.durabilityRingWarn` 用 `mossBright`、> `UI.durabilityRingDanger` 用 `gold`、否則 `vermilionBright`；底環 `ink300` 25% 透明度 |
| 名標 | 節點下方 BitmapText 12px `ink900`，washi100 描邊 3px（halo）；鏡頭縮小超過閾值時隱藏支城名標（閾值參見 04 LOD 節） |
| 被圍 | 疊 SiegeMarker（§3.3.8） |
| 落城瞬間 | 填色 300ms 從舊勢力色補間至新勢力色＋一次 12 粒 `ink500` 煙塵粒子（壽命 500ms） |

#### 3.3.3 DistrictNode — 郡節點

- 圓形半徑 7、填 `--clan-XX` 70% 透明度、框 1px `ink700`；無主郡填 `--neutral-clanless`。
- 直轄郡：中心加 2.5px `ink900` 實心點；知行郡（有 `stewardId`）：中心加 2.5px `washi100` 空心點。
- 制壓中：外圈疊進度弧（半徑 10、線寬 2、`vermilionBright`，掃角 = 制壓進度比例 × 360°；
  進度規則參見 04）。
- 一揆中：節點上方 8px 處畫 6px 朱紅三角警示，1s 週期閃爍（reduce-motion 恆亮）。

#### 3.3.4 SelectionRing — 選取光圈

- 圓環半徑 = 目標命中半徑 + 6、線寬 2、色 `gold`。
- 動態：scale 1.00→1.08→1.00、alpha 0.9→0.6→0.9，週期 1200ms `--ease-in-out`；
  reduce-motion：靜止實環。
- 同時間僅一個選取目標（多選部隊時每個棋子各掛一環，主選對象環加粗至 3px）。

#### 3.3.5 PathPreview — 路徑預覽虛線

- 沿選定路徑的街道邊折線繪製：線寬 3、虛線段 8／間隔 6。
- 分色：我方已控節點間 `gold`；需制壓的敵郡段 `vermilionBright`；海路邊改用點線（段 2／間隔 6）。
- 終點畫實心三角箭頭（邊長 10、同段色）；路徑中點上方以 DOM overlay（`--z-map-overlay`）
  顯示 ETA 標籤「約12日」（字串 `ui.march.eta`；天數計算參見 04 行軍節）。
- 虛線流動動畫：dash offset 每秒 −14px（reduce-motion 靜止）。確認出陣後光圈消失、虛線轉 60% 透明度定格為在途路徑線。

#### 3.3.6 AweShockwave — 威風衝擊波

- 觸發：core 發出威風事件（等級小/中/大與受影響郡清單由事件 payload 提供；規則參見 `plan/07-military.md`）。
- 視覺半徑 = payload 內的影響半徑（世界座標）直接使用，**不在 UI 層重算**。
- 時間軸（總長 `--duration-awe` 800ms）：
  - t=0：主環自半徑 8 擴至影響半徑，線寬 4→1、色 `gold`、alpha 0.9→0，easeOutQuad。
  - t=150ms：第二環（線寬 2、alpha 0.6→0）同軌跡。
  - t=300ms：受影響各郡節點做 300ms 閃色（washi100 → 新歸屬勢力色）。
- 大威風（等級大）加第三環（t=300ms）並全畫面 washi100 4% 閃光 120ms。
- reduce-motion：不畫擴散環，改為受影響郡同時 600ms 淡變色＋主城一個靜態金環顯示 600ms。

#### 3.3.7 BattleSpark — 戰鬥交鋒火花

- 掛載於野戰交戰點（兩部隊接觸中點）。交戰期間每 900ms 迸發一次：
  8 條短線粒子（長 4–8、線寬 1.5、色 `gold` 與 `vermilionBright` 各半、
  隨機方向速度 30–60 世界px/s、壽命 400ms、alpha 線性衰減）。
- 交戰點上方 16px 畫交叉雙刀圖示（16×16、`ink900`、washi100 halo），恆顯不動畫。
- reduce-motion：不迸發粒子，只顯示雙刀圖示。粒子池上限 128（全地圖共用，超出丟棄新請求）。

#### 3.3.8 SiegeMarker — 圍城標記

- 城節點外圈半徑 24 畫 3 段等分圓弧（每段掃角 70°、線寬 3、色 `vermilionBright`）。
- 模式差異（攻城規則參見 07）：**包圍**＝虛線弧、旋轉 8s/圈；**強攻**＝實線弧、旋轉 4s/圈，
  且每 1.2s 在城節點上迸發一次 BattleSpark 粒子。
- reduce-motion：弧線靜止（保留虛實線區分）。
- 城内糧盡倒數等文字資訊不畫在場景內，由 ContextPanel 顯示（參見 11）。

### 3.4 動畫規範總表

| 動畫 | 時長 token | 緩動 | 備註 |
|---|---|---|---|
| 面板/ContextPanel/Dialog 進出 | `--duration-fast` 150ms | `--ease-out` | 位移 ≤ 8px＋淡入 |
| hover/按鈕/焦點過渡 | `--duration-fast` | ease | 只動 background/outline |
| 進度條、資源數字補間 | `--duration-normal` 300ms | linear | |
| Toast 進出 | `--duration-normal` | `--ease-out` | 右滑 24px |
| 地圖鏡頭聚焦（點 MiniMap、點報告跳轉） | `--duration-focus` 400ms | easeInOutCubic | Pixi 內以 TOKENS.duration 引用 |
| 威風衝擊波 | `--duration-awe` 800ms | easeOutQuad | §3.3.6 |
| 選取光圈脈動 | 1200ms 循環 | `--ease-in-out` | 裝飾性 |

**reduce-motion 規則（強制）**：`@media (prefers-reduced-motion: reduce)` 命中時 —

1. 全部 CSS transition/animation 時長歸 0（全域樣式一條規則覆蓋），進度條補間保留（屬資訊非裝飾）。
2. Pixi 裝飾動畫（旗搖擺、光圈脈動、虛線流動、弧旋轉、粒子）停用，各節點顯示其靜態終態。
3. 鏡頭聚焦改為直接跳轉（0ms）。
4. 威風改用 §3.3.6 的替代呈現。

UI 層以 `matchMedia('(prefers-reduced-motion: reduce)')` 讀取一次並訂閱變更，
經 React context `MotionContext` 與 Pixi 端旗標 `sceneFlags.reduceMotion` 傳遞。

### 3.5 無障礙基線

1. **焦點可見**：所有可聚焦元素 `:focus-visible` 套 `--shadow-focus`（金色雙環）；禁止 `outline: none` 而無替代。
2. **Dialog focus trap**：§5.4 演算法；關閉後焦點還原至開啟前元素。
3. **對比 ≥ 4.5:1**（本文已驗算的文字組合，實作不得改動這些配對）：

| 前景 | 背景 | 對比 |
|---|---|---|
| `--ink-900` | `--washi-100` | ≈ 16.3:1 |
| `--ink-500` | `--washi-100` | ≈ 8.6:1 |
| `--ink-300` | `--washi-100` | ≈ 4.8:1（僅限停用態與輔助字；值見 §8-D14） |
| `--accent-vermilion` | `--washi-100` | ≈ 5.2:1 |
| `--accent-moss` | `--washi-100` | ≈ 5.4:1 |
| `--accent-indigo` | `--washi-100` | ≈ 6.1:1 |
| `--accent-gold-text` | `--washi-100` | ≈ 4.8:1 |
| `--washi-100` | `--ink-900` | ≈ 16.3:1 |

   `--accent-gold` 與各 `-bright` 亮色**禁止**作為和紙底上的文字色（僅裝飾/圖形）。
4. **語意角色**：各元件規格中已指定 `role`/`aria-*`；表格用原生 `<table>` 結構（虛擬捲動仍保留 `<thead>`）。
5. **地圖替代路徑**：Pixi canvas 對螢幕閱讀器不可及；所有地圖可做的操作必須在 DOM 面板有等價入口
   （城一覽、武將一覽、部隊一覽；佈局參見 11）。此為 11 的畫面驗收條件之一。
6. 最小可點目標 24×24px（IconButton sm 即為下限）。

### 3.6 目錄結構、命名與 /dev/components 展示路由

```
src/ui/
├── styles/
│   ├── tokens.ts            # §3.1 全部 tokens ＋ injectCssVariables ＋ TOKENS_NUM
│   ├── global.css           # reset、@font-face、:root 之外的全域規則、reduce-motion 覆蓋
│   └── fonts/               # Noto Serif TC 子集 woff2
├── uiConstants.ts           # UI.* 呈現常數（§3.1.8）
├── components/
│   ├── index.ts             # 全部具名匯出
│   ├── Panel/Panel.tsx  Panel.module.css
│   ├── Dialog/  Tooltip/  TabView/  DataTable/  OfficerCard/  CastleListItem/
│   ├── ResourceBar/  StatBar/  NumberSlider/  SpeedControl/  MiniMap/
│   ├── ReportStack/  ContextPanel/  ConfirmDialog/  Badge/  ProgressBar/
│   ├── IconButton/          # 內含 icons.tsx（SVG sprite）
│   ├── MenuList/  EmptyState/
│   ├── RadioGroup/  Checkbox/  Switch/  TextInput/   # 表單控制元件
│   └── dev/ComponentGallery.tsx   # 展示路由頁
└── map/sceneParts/
    ├── armyChip.ts  castleNode.ts  districtNode.ts  selectionRing.ts
    ├── pathPreview.ts  aweShockwave.ts  battleSpark.ts  siegeMarker.ts
    └── particles.ts         # 共用粒子池
```

命名規範：元件資料夾與檔名 PascalCase、一資料夾一元件；CSS Modules class 用 camelCase；
sceneParts 檔名 camelCase（非 React）。元件不得 import `src/core/systems/*`（只可用 02 型別與 selector）。

**Storybook 替代方案**：不引入 Storybook（決策 D3）。改提供 `ComponentGallery`：

- 進入方式：URL hash `#/dev/components`；僅 `import.meta.env.DEV` 為真時掛載路由，
  production build 以 dead-code elimination 移除。
- 內容：每個元件一個 section（錨點側欄目錄），以寫死的假資料渲染**全部具名狀態**
  （預設／hover 說明／selected／disabled／empty／各 size／各 severity）。
- DataTable section 以 650 列生成資料驗證虛擬捲動；ReportStack section 提供「加一條 info/critical」按鈕。
- Gallery 用字不進 i18n 主表（開發工具豁免，仍須繁中）。

---

## 4. 資料結構

（元件 props 已於 §3.2 定義；本節為跨元件共用型別。全部放
`src/ui/components/types.ts`，遊戲實體型別一律 import 自 02。）

```ts
import type { OfficerId, CastleId, ClanId, GameDate } from '@/core/state/types'; // 參見 plan/02

/** 排序狀態（DataTable 受控） */
export interface SortState {
  key: string;            // ColumnDef.key
  dir: 'asc' | 'desc';
}

/** 通知重要度（Report → Toast 對映規則參見 plan/03） */
export type ReportSeverity = 'info' | 'success' | 'warning' | 'critical';

/** MiniMap 底圖模型 —— 由 selectMiniMapModel(state) 產生（純函式，位於 core selector） */
export interface MiniMapModel {
  /** 日本陸地輪廓多邊形（世界座標，來源 src/data/map/，參見 plan/04） */
  outline: readonly { x: number; y: number }[][];
  /** 每城：位置與現任 ownerId 對應的 colorIndex */
  castles: readonly { x: number; y: number; colorIndex: number | null }[];
  /** 出陣中部隊：位置與 colorIndex */
  armies: readonly { x: number; y: number; colorIndex: number | null }[];
  /** 狀態版本號：MiniMap 以此判斷底圖是否需重繪（歸屬變更時遞增，參見 plan/03 事件匯流排） */
  version: number;
}

/** Pixi sceneParts 共用旗標（由 UI 層注入） */
export interface SceneFlags {
  reduceMotion: boolean;
}

/** sceneParts 工廠統一介面 */
export interface ScenePart<P> {
  container: import('pixi.js').Container;
  update(props: P): void;   // 冪等；只在 props 變更時改繪
  destroy(): void;
}
```

`TOKENS` 的型別由 `as const` 推導；`--clan-XX` 系列不進 `TOKENS.color`
（執行期生成，經 `clanColorHex(index)`／`clanColorNum(index)` 取用，見 §5.1）。

---

## 5. 演算法與公式

本節皆為 UI 呈現演算法，不含遊戲規則數值，故引用 `UI.*`（§3.1.8）而非 `BAL.*`；
涉及遊戲數值處（威風半徑、士氣、耐久、制壓進度）一律使用 core 事件/狀態提供的值。

### 5.1 勢力色公式

```
clanColorHsl(index, bright):
  hue = index * 9                          // 0..351°，40 等分
  if bright: return hsl(hue, 58%, 52%)     // 旗面、Badge 底
  else:      return hsl(hue, 62%, 42%)     // 地圖填色
```

`injectCssVariables()` 於啟動時將 0..39 全部轉為 hex 注入 `--clan-XX` / `--clan-XX-bright`，
並快取 `clanColorNum(index, bright)` 供 Pixi。HSL→RGB 用標準轉換，四捨五入到整數通道。

### 5.2 DataTable 虛擬捲動（固定列高視窗化）

```
啟用條件: rows.length > UI.virtualizeThreshold 且 props.height 已提供
onScroll(scrollTop):                        // scroll 事件以 rAF 節流至每幀一次
  first = floor(scrollTop / rowHeight) - UI.tableOverscanRows;  clamp 至 [0, n-1]
  last  = ceil((scrollTop + height) / rowHeight) + UI.tableOverscanRows;  clamp 至 [0, n-1]
  topSpacerHeight    = first * rowHeight    // 以單一空白 tr 撐高
  bottomSpacerHeight = (n - 1 - last) * rowHeight
  只渲染 rows[first..last]；key 用 rowKey(row) 使 React 重用列
排序:
  sorted = useMemo(stableSort(rows, by sortValue, dir; tie-break by rowKey), [rows, sort])
  數字與字串比較分流：typeof sortValue 結果決定 numeric compare 或 localeCompare('zh-Hant')
```

驗收效能：650 列、8 欄，於基準機（參見 `plan/17-testing.md` 效能基準節）捲動維持 60fps，
DOM 列數恆 ≤ 可視列數 + 2×overscan。

### 5.3 Tooltip 定位與翻轉

```
show(trigger, mode):
  若 mode = follow:
    pos = (cursor.x + UI.tooltipFollowOffsetX, cursor.y + UI.tooltipFollowOffsetY)
    每次 pointermove 更新（rAF 節流）
  否則(anchored):
    pos = trigger 矩形上緣中點，tooltip 底邊對齊其上方 8px 處，水平置中
  翻轉規則（兩模式共用，量測 tooltip 實際寬高 w,h）:
    if pos.x + w > viewportW - 8: x 改為 cursor.x - w - UI.tooltipFollowOffsetX（follow）
                                   或水平夾擠至 [8, viewportW - w - 8]（anchored）
    if pos.y + h > viewportH - 8 或 anchored 上方空間不足: 翻至游標/觸發元素下方
```

### 5.4 Dialog focus trap

```
open 時:
  previouslyFocused = document.activeElement
  focus(initialFocusRef ?? dialog 內第一個可聚焦元素 ?? dialog 本體[tabindex=-1])
keydown 監聽（掛在 dialog 根）:
  Escape → onClose()
  Tab → focusables = dialog 內 querySelectorAll(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') 中可見且未停用者
        若 shift+Tab 且 activeElement == focusables[0] → 聚焦最後一個並 preventDefault
        若 Tab 且 activeElement == 最後一個 → 聚焦 focusables[0] 並 preventDefault
close 時: previouslyFocused?.focus()
多層 Dialog: 以 modal-root 內堆疊順序，僅最上層攔截鍵盤與背板事件。
```

### 5.5 MiniMap 座標換算與重繪

```
world→mini:  s = size / 4096;  mx = wx * s;  my = wy * s
mini→world:  wx = mx / s;      wy = my / s
點擊/拖曳:   onNavigate(mini→world(event.offsetXY))  // 主鏡頭中心補間至該點（--duration-focus）
底圖重繪:    model.version 變更 且 距上次重繪 ≥ UI.minimapRedrawMs 時重繪底圖層；
             視窗框層每幀清除重畫（單一 strokeRect，成本可忽略）
繪製順序:    輪廓多邊形（washi300 填、ink300 0.5px 描）→ 城點（3px 方點，clanColor）
             → 部隊點（2px 圓點，clanColorBright）→（框層）viewport 矩形（gold 1.5px）
```

### 5.6 耐久環與進度弧（Pixi 通用弧）

```
drawRing(g, radius, ratio, colorNum, width):
  g.clear()
  g.arc(0, 0, radius, -PI/2, -PI/2 + 2*PI*clamp(ratio,0,1))  // 12 點鐘起順時針
  g.stroke({ width, color: colorNum })
耐久環色彩: ratio > UI.durabilityRingWarn → mossBright
            ratio > UI.durabilityRingDanger → gold；否則 vermilionBright
更新時機: 訂閱該城 durability 變更事件，補間 300ms（reduce-motion 直接跳值）
```

### 5.7 Toast 堆疊與逐出

```
push(item):
  stack.unshift(item)
  visible = stack[0..max-1]；被擠出者若非 sticky 直接移除、sticky 者保留佇列待前面消失後遞補
  非 sticky 者排程 setTimeout(依 severity 取 UI.toastDuration*)；hover 時暫停、離開重排剩餘時間
dismiss(id): 播退場動畫（--duration-normal）後自 stack 移除
點擊 item: 先執行 onClick（跳轉），不自動 dismiss（critical 保留供再讀）
```

---

## 6. UI/UX — 元件層繁中字串表

以下為**元件庫自身**需要的字串 key 與建議文字；主表與最終定案參見 `plan/13-i18n-strings.md`。
畫面級字串（指令名、報告內文等）不在此表。

| Key | 繁中文字 | 用處 |
|---|---|---|
| `ui.common.confirm` | 確認 | ConfirmDialog 預設確認鈕 |
| `ui.common.cancel` | 取消 | ConfirmDialog 預設取消鈕 |
| `ui.common.close` | 關閉 | Dialog/Panel/Toast 關閉鈕 aria-label |
| `ui.common.back` | 返回 | 通用返回 |
| `ui.table.empty` | 無符合條件的資料 | DataTable 空狀態 |
| `ui.table.sortAsc` | 遞增排序 | 表頭 aria-label |
| `ui.table.sortDesc` | 遞減排序 | 表頭 aria-label |
| `ui.speed.pause` | 暫停 | SpeedControl aria-label |
| `ui.speed.x1` | 一倍速 | 同上 |
| `ui.speed.x2` | 二倍速 | 同上 |
| `ui.speed.x5` | 五倍速 | 同上 |
| `ui.hud.gold` | 金錢 | ResourceBar 圖示 tooltip 標題 |
| `ui.hud.food` | 兵糧 | 同上 |
| `ui.hud.soldiers` | 兵力 | 同上 |
| `ui.hud.prestige` | 威信 | 同上 |
| `ui.hud.deltaPerMonth` | 每月增減 | 資源 tooltip 首行標籤 |
| `ui.hud.soldiersCap` | 上限{max} | 兵力 tooltip 補充行 |
| `ui.slider.all` | 全 | NumberSlider 快速鈕 |
| `ui.slider.half` | 半 | 同上（½ 鈕文字） |
| `ui.slider.quarter` | 四分之一 | 同上（¼ 鈕 aria-label） |
| `ui.slider.none` | 零 | 同上 |
| `ui.minimap.ariaLabel` | 全國小地圖 | MiniMap aria |
| `ui.march.eta` | 約{days}日 | PathPreview ETA 標籤 |
| `ui.castle.underSiege` | 圍 | CastleListItem 被圍徽章 |
| `ui.officer.loyaltyLow` | 忠誠低落 | OfficerCard 忠誠 <30 tooltip |
| `ui.toast.dismiss` | 關閉通知 | Toast 關閉鈕 aria-label |
| `ui.empty.default` | 目前沒有項目 | EmptyState 預設文字 |
| `ui.contextpanel.close` | 關閉面板 | ContextPanel 關閉鈕 aria-label |

互動慣例（跨元件一致性規則）：

1. 破壞性動作（danger）一律經 `ConfirmDialog(danger)`，預設焦點在取消。
2. 不可用的指令**顯示但停用**並附 `disabledReason`，不得直接隱藏（玩家需能發現機制存在）。
3. 數量輸入一律 `NumberSlider`（含手動輸入框），不做純文字輸入。
4. 所有面板關閉手段至少兩種：關閉鈕＋Esc（modal）或關閉鈕＋再次點擊選取對象（非 modal）。

---

## 7. 實作任務清單

實作順序建議（對應里程碑參見 `plan/18-roadmap.md`：tokens/HUD 類屬 M1、
地圖 sceneParts 屬 M2/M4/M5、其餘隨畫面需求落在 M3–M8）。

- [ ] **T1 tokens.ts ＋ injectCssVariables ＋ global.css**
  - 驗收：`:root` 上可檢得全部 §3.1 變數；`--clan-00..39` 與 `-bright` 共 80 個生成；
    Vitest 驗證 `hexToNum('#b23a28') === 0xb23a28`；§3.5 對比表以程式驗算全數 ≥ 4.5。
- [ ] **T2 IconButton（含 SVG sprite 24 icons）、Badge、ProgressBar、EmptyState、StatBar**
  - 驗收：Gallery 中各狀態渲染正確；StatBar value=112 時可見金色溢出段；全部可鍵盤聚焦（互動者）。
- [ ] **T3 Panel、ContextPanel、TabView、MenuList**
  - 驗收：ornate 四角飾線不影響內容盒；ContextPanel 進出 150ms；MenuList 鍵盤導航跳過 disabled
    且 disabledReason tooltip 可讀。
- [ ] **T4 Dialog、ConfirmDialog、Tooltip**
  - 驗收：focus trap 通過（Tab 循環、Esc 關閉、焦點還原）；巢狀 Dialog 僅頂層攔 Esc；
    Tooltip 延遲 400ms、視窗邊緣翻轉、全域單例。
- [ ] **T5 DataTable（排序＋虛擬捲動）**
  - 驗收：650 列捲動 60fps（17 的效能基準法量測）；DOM 列數受控；排序穩定且中文欄用 zh-Hant collator；
    受控 sort 狀態不因重繪遺失。
- [ ] **T6 OfficerCard 三尺寸、CastleListItem**
  - 驗收：三尺寸像素規格相符；忠誠 <30 顯朱紅；被圍城顯「圍」徽章；資料全部經 selector 取得（無 props 傳整個 Officer 物件）。
- [ ] **T7 ResourceBar、SpeedControl、NumberSlider**
  - 驗收：資源 hover 顯增減明細 tooltip；數字補間 300ms；SpeedControl 四檔切換與 toggled 樣式；
    NumberSlider 鍵盤全操作、輸入框 clamp＋貼齊 step。
- [ ] **T8 ReportStack**
  - 驗收：四種 severity 樣式；上限 5、sticky 遞補邏輯；hover 暫停倒數；critical 需手動關閉。
- [ ] **T9 MiniMap**
  - 驗收：底圖節流 1s、視窗框每幀更新；點擊與拖曳導航正確（世界座標誤差 < 1 世界px）；
    勢力歸屬變更後 1s 內底圖更新。
- [ ] **T10 sceneParts：ArmyChip、CastleNode、DistrictNode、SelectionRing**
  - 驗收：與 §3.3 繪製參數逐項相符（尺寸、色、hitArea）；同節點 5+ 部隊收合為 +N；
    耐久環三段變色門檻正確。
- [ ] **T11 sceneParts：PathPreview、AweShockwave、BattleSpark、SiegeMarker、粒子池**
  - 驗收：威風三等級時間軸正確（大威風三環＋閃光）；粒子池上限 128 不溢出；
    包圍/強攻弧線虛實與轉速區分。
- [ ] **T12 reduce-motion 全面支援**
  - 驗收：模擬 media query 下，CSS 動畫歸零、Pixi 裝飾動畫靜止、威風替代呈現生效、鏡頭直跳。
- [ ] **T13 ComponentGallery（#/dev/components）**
  - 驗收：DEV 模式可達且列出全部元件與狀態；production bundle 無 Gallery 程式碼（build 產物字串掃描）。
- [ ] **T14 無障礙驗收**
  - 驗收：axe-core（開發依賴）跑 Gallery 無 critical violation；全元件鍵盤可達；
    §3.5 對比表通過自動驗算。

---

## 8. 設計決策記錄

- **D1｜UI 呈現常數不進 BAL**：`00 §11` 的 BAL 定位為影響模擬結果的平衡數值（`src/core/balance.ts`、
  15 主表管理）。Tooltip 延遲、Toast 時長等純呈現值放入 `src/ui/uiConstants.ts` 的 `UI.*`，
  避免污染平衡主表、也避免 core 承載 UI 概念。本文件因此**不新增任何 BAL 常數**；
  涉及遊戲數值的視覺（威風半徑、士氣門檻）一律消費 core 事件 payload 或 07/15 既有常數。
- **D2｜tokens.ts 為單一真相來源，執行期注入 CSS 變數**：因 Pixi 需要數值色而 CSS 需要變數，
  雙檔手寫必然漂移；以 TS 定義＋啟動注入，且 40 勢力色可用公式生成免手寫 80 條。
  代價是首繪前需執行一次注入（<1ms，可接受）。
- **D3｜不採用 Storybook**：依賴體積大、升級成本高，且本專案元件消費者只有本專案與實作 AI；
  以 DEV-only `ComponentGallery` 路由替代，同時兼作無障礙與視覺回歸的手動檢查頁。
- **D4｜DataTable 採固定列高虛擬捲動**：最大資料集為武將一覽 ~650 列，固定列高（40px）足夠且
  演算法簡單、可測；不做動態列高與無限載入。列高不同的清單（如城一覽）改用 `CastleListItem` 直排。
- **D5｜勢力色採 40 等分色相環＋資料層釘選**：公式生成保證互異與可維護，
  歷史印象色以 `colorIndex` 釘選滿足沉浸感；「相鄰勢力色相差 ≥36°」放在資料驗證器（14）而非執行期，
  因開局歸屬已知、執行期併吞造成的鄰接變化不可能全域避色。
- **D6｜朱紅與金各拆「文字安全色」與「裝飾亮色」**：單一色值無法同時滿足和紙底 4.5:1 對比與
  地圖特效的視覺亮度；拆檔並以規範禁止亮色作內文，是最小成本的合規做法。
- **D7｜Tooltip／ETA 標籤等文字浮層一律用 DOM 而非 Pixi 文字**：DOM 排版與換行能力遠勝 BitmapText，
  且無障礙可及；Pixi 內僅保留高頻短字（兵數、城名）用 BitmapText 以保 60fps。
- **D8｜reduce-motion 僅跟隨 OS media query**：不新增遊戲內設定項（16 的設定表因此不受本文件影響），
  降低設定面與測試矩陣；OS 層級偏好已覆蓋目標使用者情境。
- **D9｜Dialog 不內建「開啟即暫停」**：暫停屬遊戲時間規則（03 的自動暫停清單），由呼叫端下指令；
  元件庫保持零 core 依賴方向（components → core 只允許型別與 selector）。
- **D10｜補齊表單控制元件（2026-07-07，依 `plan/19-glossary.md` §3.13 勘誤 E-68）**：
  11 多畫面（設定、徵兵方針、攻城模式、存檔命名、搜尋）需要單選鈕群組／核取方塊／開關／文字輸入，
  原 §3.2 二十元件未涵蓋。故於 §3.2 增 §3.2.21 RadioGroup、§3.2.22 Checkbox、§3.2.23 Switch、
  §3.2.24 TextInput 四規格（共用元件計 20→24），並同步更新 §1.1 元件數與 §3.6 目錄結構。
  依 E-68 建議定案「12 §3.2 增 RadioGroup／Checkbox／Switch／TextInput 規格」。
  沿用 §6 慣例 3：數量輸入仍一律走 `NumberSlider`，TextInput 僅承載文字。
- **D11｜補特性稀有度色彩 token（2026-07-07，依 `plan/19-glossary.md` §3.13 勘誤 E-75）**：
  06 §6.2 指定稀有度徽章色 `--trait-legendary`（金）／`--trait-rare`（紫）／`--trait-common`（灰藍）
  並註明「值見 12」，而原 §3.1.2 色彩表缺此三 token。故於 §3.1.2 補三 token 並給定案值
  `#b8862d`／`#6a4a86`／`#5f6f7c`（色相對應 06 之金／紫／灰藍）。依 E-75 建議定案「12 §3.1.2 補三 token 並給值」。
  此三色僅作徽章色（非和紙底內文），不列入 §3.5 對比配對表。
- **D12｜收納介面縮放三常數 `uiScaleMin/Max/Step` 入 `UI.*`（2026-07-10，依 `plan/19-glossary.md` §3.13 勘誤 E-56 殘項）**：
  16 §3.8 設定項 #11 `uiScale`（介面縮放）沿用 15 §4.3／§5.2 表 D 的分類「UI 互動／顯示」，屬不影響模擬結果的
  純呈現常數，與本文件 §3.1.8 既有 `UI.tooltipDelayMs`、`UI.minimapSizePx` 等同類（依 D1 判準），
  故不歸 16 的存檔專屬常數表 `SAVECFG.*`（該表僅收存檔／體積門檻類，語意不合）。
  故於 §3.1.8 `UI` 物件補 `uiScaleMin`＝`0.8`、`uiScaleMax`＝`1.5`、`uiScaleStep`＝`0.05`
  （值不變，仍以 15 §5.2 表 D 為準），命名沿用既有 `uiScale*` 識別字以呼應 16 `GameSettings.uiScale` 欄位與
  CSS 變數 `--ui-scale`，不再另創無字首的 `scaleMin` 等名稱。16 對應三處 `BAL.uiScale*` 改引 `UI.uiScale*`，
  16 §8 D12「待統一」註記同步收斂（詳見 16 §8 D13）。
- **D13｜§3.1.4 字型粗體宣告與現況（`01-A13`／字型管線）對齊（2026-07-11，M1-19 實作）**：
  原文「Noto Serif TC 自帶打包 woff2（weight 400、700 兩檔）」與 `01-architecture.md` §8-D14
  已定案的字型子集管線不符——該管線（`tools/subset-font.ts`）目前僅以 `variationAxes: { wght: 400 }`
  產出單一 Regular 檔（`public/fonts/noto-serif-tc-subset.woff2`），未產出 700（Bold）子集，
  01 為字型管線的系統文件、其 D14 為既定實作事實，故依此更正本節文字：現況僅 400 一檔，
  粗體需求（如 ReportStack critical 標題「粗體」）改依瀏覽器 `font-synthesis` 合成粗體呈現。
  若未來有大量粗體文字需求造成合成粗體觀感不佳，再擴充 `tools/subset-font.ts` 加產 700 子集，
  依 00 §0.5 屆時回寫本節與 01 §8-D14。
- **D14｜§3.1.2／§3.5 對比驗算：修正 `--ink-300` 實際未達 4.5:1 之誤，並更正三筆算錯的近似值
  （2026-07-11，M1-19 實作，`tests/ui/tokens.spec.ts` 對比驗算發現）**：
  以 WCAG 2.x relative luminance 標準公式（`sRGB→linear`：`c ≤ 0.03928` 時 `c/12.92`，否則
  `((c+0.055)/1.055)^2.4`；`L = 0.2126R+0.7152G+0.0722B`；`contrast = (L1+0.05)/(L2+0.05)`）
  程式重新驗算全部 §3.5 文字配對後發現：①`--ink-300`(`#7a6f60`) 對 `--washi-100` 實際僅
  ≈4.29:1，未達本文件 §3.5 規定之 4.5:1 門檻（原文誤記為 ≈4.6:1，很可能是手算誤差）；
  ②`--ink-900`／`--ink-500` 對 `--washi-100` 原文近似值（≈12.9:1／≈7.9:1）同樣算錯，
  實際為 ≈16.3:1／≈8.6:1（兩者仍遠高於門檻，不影響合規結論，僅更正數字）；
  ③其餘四組（`accent-vermilion`／`accent-moss`／`accent-indigo`／`accent-gold-text`）
  程式驗算值與原文近似值相符（誤差 ≤0.1，屬四捨五入），確認公式與原文一致、僅 ink 家族三筆算錯。
  依 00 §0.5「不得留下未解決的 TBD」與本文件 §3.5 第 3 點「對比 ≥4.5:1」之硬性驗收，
  將 `--ink-300` 由 `#7a6f60` 調整為 `#716759`（HSL 同色相 34.6°／同飽和度 11.9%，
  僅明度由 42.7% 降至 39.7%，肉眼觀感差異極小，維持「邊框、分隔線、停用文字」原用途），
  使其對 `--washi-100` 對比提升至 ≈4.8:1（實測 4.834，留有餘裕）；同步更正 §3.5 表三筆近似值
  （12.9→16.3、7.9→8.6、4.6→4.8）。此為色彩定案值的唯一一次事後修正，其餘 39 個色彩 token
  與 40 勢力色公式（§5.1）不受影響。

---

*本文件依 `plan/00-foundations.md` §13 撰寫；實作期變更請記錄於 §8。*
