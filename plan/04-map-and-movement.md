# 04 — 地圖與移動（Map and Movement）

> 遵循 `plan/00-foundations.md`（下稱 00）。本文件是「地圖資料格式、投影、Pixi 渲染、鏡頭、
> 尋路、行軍、制壓、遭遇」的單一真相來源（00 §7）。

---

## 1. 目的與範圍

本文件定義：

1. 地圖的資料層：節點圖（城 ∪ 郡）與街道邊（`RoadEdge`）的 JSON 資料格式、
   日本海岸線背景（`japan-outline.json`）的製作規格與驗收標準。
2. 地圖的模擬層：通行規則、Dijkstra 尋路、每日行軍模擬、制壓、遭遇判定、糧盡潰散。
3. 地圖的呈現層：PixiJS 渲染器（圖層、勢力色郡域、LOD、視錐剔除）、鏡頭、
   命中測試、與 React overlay 的事件協定、迷你地圖與勢力圖模式。

**不在本文件範圍**（僅引用）：野戰與合戰解算、威風效果數值、攻城（`plan/07-military.md`）；
部隊編成與出陣 Command 的欄位（`plan/07-military.md`）；外交協定的成立與敵對狀態判斷
（`plan/08-diplomacy.md`）；實體型別的最終歸屬（`plan/02-data-model.md`）；
劇本資料內容與製作管線（`plan/14-scenario-data.md`）；BAL 常數定案值（`plan/15-balance.md`）。

## 2. 與其他文件的關係

| 文件 | 關係 |
|---|---|
| `plan/02-data-model.md` | `Castle` / `District` / `Army` / `RoadEdge` 型別的最終歸屬。本文件給出地圖必需欄位（`pos`、`isPort`、`grade` 等），02 需原樣收錄。 |
| `plan/03-game-loop.md` | 行軍與制壓在每日 tick 的 `military.movement` 階段執行（00 §5.4 第 7 步）；Command 佇列架構參見 03。 |
| `plan/05-domestic.md` | 政策提供的行軍速度修正（`policyMarchFactor`）由 05 定義來源，本文件定義套用方式。 |
| `plan/07-military.md` | 出陣編成、野戰／合戰解算、威風、攻城、兵站常數（`BAL.fieldFoodPerSoldierDaily` 等）。本文件觸發野戰後即移交 07。 |
| `plan/08-diplomacy.md` | 敵對／同盟／從屬／停戰狀態的判斷函式 `getStance(clanA, clanB)` 由 08 定義；本文件使用其結果。 |
| `plan/11-ui-screens.md`、`plan/12-ui-components.md` | 地圖畫面在整體佈局中的位置、design tokens。本文件的 `MAPVIEW` 色彩建議值可被 12 的 token 覆蓋。 |
| `plan/14-scenario-data.md` | `roads.json`、各城郡座標的資料內容與九批製作流程；本文件只定格式與驗證規則。 |
| `plan/15-balance.md` | 本文件所有 `BAL.*` 建議初值的定案主表。 |

---

## 3. 設計細節

### 3.1 地圖模型總覽

- 地圖是**無向節點圖**：節點 = 全部城（`Castle`）∪ 全部郡（`District`），
  邊 = 街道（`RoadEdge`）。沒有格子、沒有自由移動；部隊只能沿邊在節點間移動。
- `MapNodeId = CastleId | DistrictId`（ID 規範見 00 §8，如 `castle.kiyosu`、`dist.owari-kasugai`）。
- 圖必須全域連通（含海路邊；驗證見 §3.4.4 與 `plan/14-scenario-data.md`）。
- 每個郡隸屬一座城（`District.castleId`）；城與郡的歸屬勢力（`ownerClanId`）獨立記錄——
  制壓可以只翻轉郡而不動城。

### 3.2 座標與投影

- 世界空間 4096×4096，投影公式為 00 §8 的線性投影（canonical，不得更改）：
  `x = (lon − 128.5) / (146.0 − 128.5) × 4096`、`y = (45.8 − lat) / (45.8 − 30.5) × 4096`。
- 投影常數與轉換函式集中於 `src/data/map/projection.ts`：

```ts
/** 00 §8 canonical 投影常數。 */
export const PROJECTION = {
  lonMin: 128.5, lonMax: 146.0,   // 經度範圍（度）
  latMin: 30.5,  latMax: 45.8,    // 緯度範圍（度）
  worldSize: 4096,                // 世界空間邊長（world unit）
} as const;

/** 經緯度（度）→ 世界座標（world unit，取整數）。 */
export function lonLatToWorld(lon: number, lat: number): { x: number; y: number } {
  const { lonMin, lonMax, latMin, latMax, worldSize } = PROJECTION;
  return {
    x: Math.round(((lon - lonMin) / (lonMax - lonMin)) * worldSize),
    y: Math.round(((latMax - lat) / (latMax - latMin)) * worldSize),
  };
}
```

- 所有節點座標（`pos`）以世界座標整數存於劇本資料（`castles.json` / `districts.json`，
  內容規格見 `plan/14-scenario-data.md`）。參考錨點（供資料製作與除錯）：

| 地點 | lon, lat | 世界座標 (x, y) |
|---|---|---|
| 清洲（尾張） | 136.9, 35.2 | (1966, 2838) |
| 京都 | 135.77, 35.01 | (1701, 2889) |
| 江戶 | 139.70, 35.68 | (2621, 2709) |
| 下關 | 130.94, 33.95 | (571, 3172) |
| 鹿兒島 | 130.55, 31.60 | (480, 3801) |
| 青森（津輕） | 140.74, 40.82 | (2866, 1333) |

### 3.3 海岸線背景：`src/data/map/japan-outline.json`

#### 3.3.1 檔案格式

風格化折線多邊形，總點數 **300~600**（全部島嶼合計），允許地理不精確但輪廓必須可辨識。

```ts
/** src/data/map/japan-outline.json 的 zod schema（實作於 src/data/schemas/outline.ts）。 */
export interface JapanOutlineFile {
  version: 1;
  /** 資料來源：'natural-earth'（簡化自公有領域資料）或 'handcrafted'（AI 手繪）。 */
  source: 'natural-earth' | 'handcrafted';
  polygons: OutlinePolygon[];
}

export interface OutlinePolygon {
  /** 島嶼識別：'honshu' | 'shikoku' | 'kyushu' 為必備；'awaji' | 'sado' 可選（純裝飾）。 */
  id: string;
  /** 頂點扁平陣列 [x0,y0,x1,y1,...]，世界座標整數，逆時針纏繞（land 在左側），
   *  首尾不重複（渲染時自動閉合）。每島 60~300 點。 */
  points: number[];
}
```

#### 3.3.2 製作方案 A：由 Natural Earth 公有領域資料簡化（建議優先）

1. 下載 Natural Earth（公有領域）`ne_50m_land`（https://www.naturalearthdata.com）。
2. 以 mapshaper CLI 裁切、簡化、去小島：
   ```
   npx mapshaper ne_50m_land.shp \
     -clip bbox=128.5,30.5,146.0,45.8 \
     -filter-islands min-area=2500km2 \
     -simplify visvalingam 4% keep-shapes \
     -o format=geojson precision=0.01 japan-raw.geojson
   ```
3. 撰寫一次性腳本 `tools/build-outline.ts`（tsx 執行）：讀 `japan-raw.geojson`，
   對每個 polygon 的每個頂點呼叫 `lonLatToWorld`，去除投影後距離 < 6 world unit 的相鄰重複點，
   依面積比對命名（最大=honshu、九州區域最大=kyushu、四國區域最大=shikoku），
   統一為逆時針纏繞，輸出 `src/data/map/japan-outline.json`。
4. 若總點數不在 300~600，調整 `-simplify` 百分比重跑（4% 起，每次 ±1%）。

#### 3.3.3 製作方案 B：AI 依地理知識手繪折線（無外部資料時的替代）

直接以地理知識寫出各島折線，`source: 'handcrafted'`。必須依序穿過下列輪廓錨點
（世界座標，允許 ±60 world unit 誤差），錨點之間自行補中間點使線條平滑（每兩錨點間 3~10 點）：

- **本州**（逆時針，自下關起）：下關 (571,3172) → 廣島灣 (900,3080) → 岡山 (1330,3020) →
  紀伊半島南端潮岬 (1900,3210) → 伊勢灣口 (1990,2960) → 渥美半島 (2150,2920) →
  駿河灣 (2380,2830) → 三浦半島 (2650,2740) → 房總半島南端 (2720,2810) → 犬吠埼 (2870,2610) →
  仙台灣 (2960,2050) → 三陸海岸 (3080,1700) → 下北半島 (2960,1250) → 津輕 (2820,1310) →
  男鹿半島 (2670,1580) → 能登半島突出 (2130,2280) → 若狹灣 (1750,2760) → 出雲 (1150,2900) →
  萩 (700,3060) → 回到下關。
- **四國**：以佐田岬 (1010,3330)、足摺岬 (1240,3520)、室戶岬 (1540,3440)、
  鳴門 (1620,3170) 為四角的橫向長條。
- **九州**：以門司 (560,3190)、佐世保 (250,3360)、長崎 (300,3480)、佐多岬 (500,3900)、
  大隅 (560,3860)、佐賀關 (700,3330) 圍成，鹿兒島灣以一道向北凹入 (500,3780) 表現。
- 瀨戶內海必須是本州—四國—九州之間可辨識的帶狀海域（寬 ≥ 80 world unit）。

#### 3.3.4 兩方案共同驗收標準（`tools/validate.ts` 自動檢查）

- 總點數 300~600；每 polygon 逆時針、無自交（線段兩兩相交檢查）。
- **全部城與郡節點座標必須落在某 polygon 內部**（ray casting；容忍值：距邊界 8 world unit 內視為通過）。
- honshu / shikoku / kyushu 三 polygon 必須存在且互不重疊。

### 3.4 街道邊（RoadEdge）

#### 3.4.1 資料格式：`src/data/scenarios/s1560/roads.json`

```ts
export interface RoadsFile {
  version: 1;
  edges: RoadEdgeData[];
}

/** 街道邊。型別最終歸屬 plan/02-data-model.md，02 需原樣收錄本欄位集。 */
export interface RoadEdgeData {
  /** ID，規範見 00 §8，例：'road.kiyosu-sunpu-01'。 */
  id: string;
  /** 端點 A / B（無向邊；MapNodeId）。 */
  a: string;
  b: string;
  /** 'land' 陸路｜'sea' 海路。 */
  type: 'land' | 'sea';
  /** 道級 1~3；海路一律填 1（速度由 type 規則決定，見 §3.4.3）。 */
  grade: 1 | 2 | 3;
  /** 基礎行軍日數（道級 1、無修正時走完此邊所需日數）；0.5 為最小刻度。陸路典型 1~4，海路典型 2~6。 */
  baseDays: number;
  /** 顯示用街道名（繁中，可選），例：'東海道'。專有名詞不進 i18n（00 §8）。 */
  name?: string;
  /** 渲染用中繼點 [x0,y0,x1,y1,...]（世界座標，可選）；只影響畫線弧度，不影響模擬。 */
  waypoints?: number[];
}
```

#### 3.4.2 道級與速度

- 道級（`grade`）代表道路品質，提供速度倍率 `BAL.roadGradeSpeedMult`（見 §5.8 常數表）：
  1 級 ×1.0、2 級 ×1.3、3 級 ×1.6。
- 邊的**有效日數** `edgeCostDays = baseDays / BAL.roadGradeSpeedMult[grade]`。
- 道級由劇本資料給定（主要街道如東海道為 3 級；山道 1 級）；v1.0 道級不可由玩家升級
  （城下施設對道級的影響若有，定義於 `plan/05-domestic.md`）。

#### 3.4.3 海路規則

- 海路邊（`type: 'sea'`）的**兩端點都必須是 `isPort: true` 的郡節點**（港郡；
  `District.isPort` 欄位由本文件引入，02 收錄，14 於資料中標定）。
- 部隊由陸路轉入海路（登船）時，額外消耗 `BAL.seaEmbarkDays`（建議 1 日）；
  由海路轉回陸路（下船）不另計。連續兩段海路之間不重複計登船。
- 海路上的速度：`edgeCostDays = baseDays`（`grade` 固定 1、不吃道級倍率），
  且**不套用**士氣、特性、政策等陸上行軍修正（見 §5.3；船速與武將無關）。
- 海路**不可制壓**：海路邊不經過任何郡的領域，通過不改變任何歸屬，也不觸發侵入宣戰
  （宣戰判定僅在登陸進入敵郡/敵城節點時發生，參見 `plan/08-diplomacy.md`）。
- 海路上仍會發生遭遇（§3.9）；v1.0 無獨立海戰模型，解算同野戰（參見 `plan/07-military.md`；
  決策記錄見 §8）。

#### 3.4.4 連通性與資料驗證（`tools/validate.ts`）

- 全圖（含海路）必須是單一連通分量。
- 每條邊的 `a`、`b` 必須是存在的節點且 `a !== b`；無重複邊（同端點對最多 1 條同型邊）。
- 海路邊端點必須皆為 `isPort` 郡。
- `baseDays ∈ [0.5, 8]`、為 0.5 的倍數。

### 3.5 通行規則（canonical）

以行軍勢力 `mover` 對節點擁有者 `owner` 的外交立場 `getStance(mover, owner)`
（參見 `plan/08-diplomacy.md`）決定：

| 立場 | 郡節點 | 城節點 |
|---|---|---|
| 我方（同勢力） | 自由通過 | 自由通過 |
| 同盟（alliance）／婚姻（marriage） | 自由通過，不可制壓 | 自由通過 |
| 從屬關係（vassal，任一方向） | 自由通過，不可制壓 | 自由通過 |
| 交戰中（at war） | 須**制壓**後方可繼續前進（§3.8） | **不可通過**；只能作為路徑終點（攻城，參見 07） |
| 停戰中（ceasefire） | **不可進入**（不可通過、不可制壓） | 不可進入 |
| 中立（無任何協定） | 視同交戰中：進入即觸發宣戰（參見 08），須制壓 | 視同交戰中：只能作為終點，抵達即宣戰＋開始攻城 |

補充規則：

- 部隊本身無視「節點上有其他部隊」的阻擋——阻擋以遭遇（§3.9）處理，不以通行規則處理。
- 通行合法性**每日在移動前重新驗證**（外交狀態可能中途改變）：
  若下一個節點或當前目標變為不可進入（例如簽了停戰），部隊原地轉為 `holding` 狀態並發出
  `army.blocked` 事件（`armyId, clanId, nodeId`；02 §4.19，四輪裁決 C-6；對應報告 key
  `report.army.blocked`，見 §6.2），等待玩家（或 AI）重新下令。
- 海路邊永遠可通行（海上無領有權）。

### 3.6 尋路（Dijkstra）

- 演算法：Dijkstra，最小化**預估總日數**。邊權 = `edgeCostDays / speedFactor`（§5.3）
  ＋ 登船延遲（若適用）；節點權 = 進入敵郡時的**預估制壓日數**（§5.4；以下令當下的狀態估算）。
- 不可通過節點（敵城非終點、停戰領）直接從圖中排除。
- 決定論：priority queue 以 `(cost, nodeId)` 排序，cost 相同時比較 `nodeId` 字典序（00 §5.5）。
- 尋路是 **core 純函式**（`src/core/systems/pathfinding.ts`），UI 的路徑預覽與 AI 共用同一實作。
- 節點數 ~500、邊數 ~700，單次 Dijkstra < 1ms，無需 A*／快取（決策見 §8）。
- 路徑預覽 API 見 §4.3 `computePath`；回傳含逐節點 ETA（抵達日）與制壓標記，供 UI 畫日數刻度。

### 3.7 行軍模擬（每日 tick，`military.movement`）

- `Army` 的行軍欄位（`status`／`path`／`pathCursor`／`edgeProgressDays`／`edgeCostDays`／`posNodeId`，
  定義歸 02 §4.8、消費語意見 §4.2）：記錄目前所在節點或所在邊上的進度。
- 核心模型：**進度累加器**。部隊每日累加 `speedFactor`（§5.3）到 `edgeProgressDays`；
  當 `edgeProgressDays ≥ edgeCostDays` 時抵達下一節點，**餘量結轉**到下一條邊
  （同一日可跨多個短邊）。渲染層以 `edgeProgressDays / edgeCostDays` 線性內插畫部隊位置，
  core 不儲存連續座標。
- 抵達節點時依序處理：宣戰判定（參見 08）→ 若為敵郡 → 進入制壓（§3.8）；
  若為敵城且是終點 → 轉入攻城（參見 07）；若為終點我方城 → 部隊入城解散回兵力兵糧
  （入城結算參見 07 兵站）；否則繼續下一條邊。
- 抵達路徑終點（`targetNodeId`）時，無論其後轉入何種狀態，一律發出 `army.arrived` 事件
  （`armyId, clanId, nodeId`；02 §4.19；發出者＝本 movement 系統）。
- 對稱地，部隊出陣建立（Command 結算見 `plan/07-military.md` §5.1 `applyCmdMarch`）時發出
  `army.departed` 事件（`armyId, clanId, originCastleId, targetNodeId`；02 §4.19），
  標記其在本系統路徑推進的起點；本文件 movement 系統自該筆 `Army` 建立後接手逐日推進。
- **兵糧**：部隊出陣攜帶兵糧（出陣時自城扣除，參見 07）。每日消耗
  `soldiers × BAL.fieldFoodPerSoldierDaily`（定義於 07 兵站、值 0.02 石/人/日見 15；勘誤 E-14）。
- **糧盡懲罰**（糧盡起算由本 movement 系統執行；`food == 0` 起）：每日
  士氣 −`BAL.noFoodMoraleDaily`（8，07 §3.13；E-17）、兵力流失
  `ceil(soldiers × BAL.noFoodDesertionRate)`（0.05，向上取整，07 §3.13；E-17）。
  當士氣 ≤ `BAL.moraleBreakThreshold`（崩潰閾值，名依 02、值 30 見 07/15；E-16）時部隊**潰走**，
  轉入 `status='routed'`。**潰走後之行為（路徑改算、每日折損率、遭遇免疫、解散/編入城駐兵條件）
  以 `plan/07-military.md` §3.4 為單一擁有者**，本文件不重述（四輪裁決 E20）；
  潰走行軍速度沿用本文件 §5.3 的 `BAL.retreatSpeedFactor`（建議 1.25，與 `returning` 共用同一常數）。

### 3.8 制壓（subjugate）

- 部隊停在敵郡節點自動開始制壓（不需另下指令；路徑中的敵郡一律「制壓後通過」，不可跳過）。
- 所需日數（下令與抵達時各算一次，以抵達時為準）：

```
subjugateDays = clamp(
  BAL.subjugateDaysBase                                   // 建議 4
    + floor(district.kokudaka / BAL.subjugateKokuPerExtraDay)  // 建議 30000（石）：郡規模修正
    - (大將 ldr ≥ BAL.subjugateLdrBonusThreshold ? 1 : 0),     // 建議 80：名將加速
  BAL.subjugateDaysMin,                                   // 建議 3
  BAL.subjugateDaysMax                                    // 建議 10
)
```

  此值抵達當下算定後快取於 `District.subjugation.daysRequired`（02 §4.6 canonical；
  四輪裁決 D-14／DDR-9——Army 側不另存此欄位，見 §4.2）；同勢力接力換將時以新部隊大將重算。

- 進度存於 `District.subjugation.progress`（0..100，依 02／DDR-9 接力制壓，E-13）。每日
  `progress += 100 / daysRequired`（制壓進度**不吃**行軍速度修正）。`progress ≥ 100` 時：
  郡 `ownerClanId` 翻轉為制壓方、郡治安下降 `BAL.subjugateSecurityHit`（建議 15）、
  發出 `district.subjugated` 事件（`districtId, fromClanId, toClanId`；02 §4.19），
  部隊於次日繼續沿路徑前進（攻守雙方報告文字見 `plan/13-i18n-strings.md` §6.11
  `report.army.subjugated`／`report.army.districtLost`）。
- **制壓中被攻擊**：敵部隊抵達同節點 → 立即中斷制壓、進入野戰（參見 07）。
  - 制壓方勝（敵退走或全滅）：`progress` **保留**，次日繼續累計。
  - 制壓方敗退或潰走：`progress` 歸零；該郡不翻轉。
- 同勢力多部隊同時位於同一敵郡：只累計一份進度（不疊加、不加速；決策見 §8）。
- 威風造成的鄰郡歸順是另一機制（不經制壓；參見 `plan/07-military.md`）。

### 3.9 遭遇判定與友軍疊放

每日 tick 分兩相（確保決定論，00 §5.5）：**相 1** 依 `armyId` 字典序移動全部部隊；
**相 2** 依 `(armyIdA, armyIdB)` 字典序檢查遭遇。敵對 = `getStance` 為交戰中
（中立部隊互不攻擊；先有領土侵入宣戰才會轉為交戰）。

觸發規則（canonical）：

1. **同節點**：敵對雙方部隊位於同一節點（含一方停駐、制壓中、圍城中）→ 野戰
   （圍城中被襲即「後詰決戰」，解算參見 07）。同節點多方敵對時，取兵數最大的兩個敵對勢力交戰，其餘部隊待機（依 07 §3.3；E-63）。
2. **同邊相向**：敵對部隊在同一條邊相向而行，且 `progressA + progressB ≥ edgeCostDays`
   → 於邊上遭遇，進入野戰；敗者向自己的來向節點退卻。
3. **同邊追擊**：敵對部隊同邊同向，後方部隊移動後 `progress後 ≥ progress前` → 追上，進入野戰。
4. 海路邊適用規則 2、3（v1.0 以一般野戰解算）。

友軍疊放規則（canonical）：

- 同勢力／同盟部隊可**無上限**疊放於同一節點或同一邊，互不阻擋、不自動合流。
- v1.0 不支援部隊合流與拆分（依 07 D14；E-46）。
- 野戰爆發時，同節點的我方與同盟部隊是否參戰由 07 的援軍規則決定，本文件只負責觸發。

### 3.10 PixiJS 渲染器

實作於 `src/ui/map/`（00 §3）。渲染器是**純 view**：讀取 core 匯出的 `MapViewState`
（plain data selector，見 §4.6），不 import core 內部、不改遊戲狀態。

#### 3.10.1 圖層順序（由下而上，各為一個 `Container`）

| # | 圖層 key | 內容 |
|---|---|---|
| 0 | `seaBackground` | 全畫布海色矩形＋ `japan-outline` 陸地多邊形（`Graphics` 填色，靜態一次建立） |
| 1 | `territory` | 勢力色郡域紋理（§3.10.2 柵格化 Voronoi `Sprite`）＋烘焙其中的勢力界線 |
| 2 | `roads` | 街道線（`Graphics`；依 `grade` 線寬 1.5/2.5/3.5 world unit、海路虛線 dash 12/8） |
| 3 | `nodeMarkers` | 城標記（本城：五角天守形 icon；支城：小方形）、郡標記（菱形點）；填色＝擁有者勢力色 |
| 4 | `armies` | 部隊 sprite：勢力色旗印＋兵數簡寫文字（`3.2k`→顯示「3200」縮排規則見 §6）＋行進方向箭頭 |
| 5 | `selectionAndPath` | 選取高亮環、行軍路徑預覽折線＋每日刻度圓點＋制壓節點標記 |
| 6 | `effects` | 威風擴散環（金色、依小/中/大威風半徑 120/220/360 world unit、1.5s 淡出）、野戰交鋒 icon、攻城火焰 icon |
| 7 | `labels` | 文字標籤（`BitmapText`，Noto Serif TC 預烘焙字集）：城名、郡名、國名、勢力名 |

#### 3.10.2 勢力色郡域渲染：柵格化 Voronoi（選定方案，細節見 §5.5）

**選定：以郡節點為 seed 的柵格化 Voronoi 紋理**（放棄半徑漸層色塊；理由見 §8-D2）。

- 載入時一次性建立 `TerritoryGrid`：解析度 `MAPVIEW.territoryGridSize = 1024`（1024×1024，
  每 cell 覆蓋 4×4 world unit）。對每個 cell 求**最近郡節點**（均勻網格桶加速），
  存 `Uint16Array`（郡索引；`0xFFFF` = 海／超距）。cell 中心不在任何陸地 polygon 內、
  或最近郡距離 > `MAPVIEW.territoryMaxDist = 260` world unit 者標記 `0xFFFF`。
  此陣列與座標俱為靜態，整局不變。
- 每當任何郡 `ownerClanId` 變動（制壓、威風歸順、劇本事件），標記 dirty；
  下一渲染幀以 palette 查表重建 RGBA `ImageData`：cell 顏色 = 擁有勢力 `clan.color`
  （欄位參見 02）；無主郡 = 中性灰 `#8a8578`。同一 pass 做**勢力界線烘焙**：
  cell 與其右/下鄰 cell 勢力不同時，兩側各乘 0.55 變暗形成界線。
  重建 1024² 查表約 8ms，每日最多一次，可接受。
- 紋理以 `Sprite` 鋪滿 4096×4096 世界空間，`alpha = MAPVIEW.territoryAlpha = 0.45`
  （勢力圖模式 0.85、遠 LOD 0.65）。
- 「國界與郡域」圖層即此紋理；v1.0 不畫舊國（Province）邊界多邊形（無資料，決策見 §8-D6），
  國名以 `labels` 層文字（成員城座標質心）表達。

#### 3.10.3 LOD（以鏡頭縮放 `scale` = 螢幕 px / world unit 判斷）

| 模式 | 條件 | 顯示 |
|---|---|---|
| 遠（far） | `scale < MAPVIEW.lodFarScale (0.5)` | 海陸背景、勢力色紋理（alpha 0.65）、城標記（僅本城放大 1.4×）、部隊、國名標籤 |
| 近（near） | `scale ≥ 0.5` | 全部圖層；郡標記與街道顯示；`scale ≥ MAPVIEW.labelScale (1.0)` 才顯示郡名標籤與街道名 |

切換以圖層/物件 `visible` 開關實作，無漸變動畫。

#### 3.10.4 視錐剔除

- 對 `nodeMarkers` / `armies` / `labels` 三層做剔除（`roads` 為單一批次 `Graphics`、
  `territory` 為單一 sprite，不需剔除）。
- 建立**空間雜湊網格**：桶邊長 256 world unit（16×16 桶）。每個 display object 依世界座標入桶
  （部隊每日移動後更新所屬桶）。
- 鏡頭變化時（含慣性）計算可視世界矩形，外擴 `MAPVIEW.cullMargin = 256`，
  只把落在可視桶內的物件設 `visible = true`，其餘 `false`。
- 效能目標：全國資料（~500 節點、~120 部隊、~700 邊）在 1080p 下穩定 60fps。

### 3.11 鏡頭（Camera）

鏡頭狀態 `CameraState = { x, y, scale }`（`x,y` = 畫面中心的世界座標）。

- **縮放範圍**：`scale ∈ [MAPVIEW.minScale, MAPVIEW.maxScale] = [0.15, 4.0]`
  （0.15 可在 1280×720 視窗看見全日本；4.0 時一個郡佔半個畫面）。
- **縮放操作**：滑鼠滾輪，每格 `scale ×= MAPVIEW.wheelZoomStep (1.1)`（反向 ÷），
  以**游標所指世界點不動**為錨（公式見 §5.7）。
- **平移**：滑鼠左鍵拖曳（拖曳距離 > 4px 才視為拖曳，否則視為點擊）；中鍵拖曳亦可；
  鍵盤方向鍵每幀平移 `600 / scale` px。中心點夾限在世界範圍外擴 128 world unit 內。
- **慣性**：放開拖曳後以最後速度續滑，每幀速度 ×`MAPVIEW.inertiaDamping (0.92)`，
  低於 `MAPVIEW.inertiaMinSpeed (0.02 world unit/幀)` 停止。任何新輸入立即取消慣性。
- **聚焦動畫 API**：`focusOn(nodeId, opts?)` → 以 easeInOutCubic 在
  `opts.durationMs ?? MAPVIEW.focusDurationMs (600)` 內同時動畫中心到節點座標、
  scale 到 `opts.scale ?? MAPVIEW.focusScale (1.5)`；回傳 `Promise<void>`；
  動畫中任何使用者鏡頭輸入立即中止動畫（Promise 仍 resolve）。
  用途：點報告跳轉、合戰結束回焦、`focusOn(castleId)` 開場聚焦玩家本城。

### 3.12 命中測試與互動協定

#### 3.12.1 命中測試

- 不用 Pixi 內建 interaction 對每物件掛監聽（物件多、LOD 切換頻繁）；
  改為**單一 canvas 指標事件 + 空間查詢**：把螢幕座標轉世界座標，查空間雜湊網格。
- 命中半徑（world unit）與優先序（高→低）：部隊 16 > 城（本城 20／支城 16）> 郡 12 > 無。
  多個候選時取距離最近者；街道邊不可點擊（路徑資訊由預覽層呈現）。

#### 3.12.2 與 React overlay 的事件協定

渲染器透過自製極簡 emitter（`on/off/emit`，不引第三方）對 React 溝通；
React 以 hook `useMapEvents` 訂閱。**渲染器永不直接改 GameState**；
React 收事件後轉成 Command 丟入佇列（00 §3）。

```ts
export type MapRendererEvent =
  | { type: 'nodeHover';  nodeId: string | null; screenX: number; screenY: number }  // null=移出
  | { type: 'nodeClick';  nodeId: string }
  | { type: 'armyClick';  armyId: string }
  | { type: 'emptyClick' }                                   // 點擊海面/空地：清除選取
  | { type: 'rightClick' }                                   // 取消目前模式/選取
  | { type: 'cameraChanged'; camera: CameraState }           // 節流 100ms
  | { type: 'pathPreviewHover'; targetNodeId: string; path: PathResult | null }; // orderMarch 模式下
```

互動模式（由 React 以 `setMode` 設定）：

- `'idle'`：hover 節點/部隊 → 發 `nodeHover`（React 顯示 tooltip，內容見 §6.2）；
  左鍵點擊 → 發 `nodeClick`/`armyClick`（React 開啟對應面板，參見 `plan/11-ui-screens.md`）；
  右鍵 → `rightClick`（React 清除選取）。
- `'orderMarch'`（React 在玩家按下「出陣／移動」後設定，附 `armyId` 或出陣城）：
  hover 任意節點 → 渲染器即時呼叫 core 的 `computePath` 並發 `pathPreviewHover`、
  同時在 `selectionAndPath` 層畫預覽（可通行=勢力色實線＋日刻度；不可達=紅色虛線至最近可達點）；
  左鍵點擊可達節點 → `nodeClick`（React 送出行軍 Command）；右鍵/ESC → 取消回 `idle`。

#### 3.12.3 渲染器公開 API（`class MapRenderer`）

```ts
export interface MapRendererApi {
  init(canvas: HTMLCanvasElement, staticData: MapStaticData): Promise<void>;
  /** 每次 core tick 後由橋接層呼叫；內部 diff 更新部隊/歸屬/特效。 */
  update(view: MapViewState): void;
  on<E extends MapRendererEvent['type']>(type: E, cb: (e: Extract<MapRendererEvent, { type: E }>) => void): () => void;
  focusOn(nodeId: string, opts?: { scale?: number; durationMs?: number }): Promise<void>;
  setMode(mode: 'idle' | 'orderMarch', ctx?: { armyId?: string; originCastleId?: string }): void;
  setFactionMapMode(onOff: boolean): void;
  showPathPreview(path: PathResult | null): void;
  playAweEffect(centerNodeId: string, tier: 'small' | 'medium' | 'large'): void;  // 威風環，數值機制見 07
  resize(width: number, height: number): void;
  destroy(): void;
}
```

### 3.13 迷你地圖與勢力圖模式

#### 3.13.1 迷你地圖

- 固定於地圖畫面右下角的 200×200 px HTML `<canvas>`（2D context，非 Pixi；React 元件
  `<Minimap/>`，位置與外框樣式參見 `plan/12-ui-components.md`）。
- 內容：海色底 → 直接把 `TerritoryGrid` 的 RGBA `ImageData` 以 `drawImage` 縮放繪入
  （陸地形狀已隱含其中，勢力色即全局概覽）→ 疊主鏡頭可視範圍白框（1px）。
- 更新時機：郡歸屬 dirty 時重繪底圖；`cameraChanged`（節流 100ms）時只重繪白框。
- 互動：點擊或拖曳迷你地圖 → 主鏡頭中心跳至對應世界座標（無動畫）。

#### 3.13.2 勢力圖模式（faction map mode）

- 切換：HUD 按鈕「勢力圖」（字串 `ui.map.mode.faction`）或快捷鍵 `Tab`；再按退出。
- 進入效果（純渲染，不動模擬、不動鏡頭）：
  `territory` alpha → 0.85；隱藏 `roads`、郡標記、支城標記、街道與郡標籤；
  部隊縮為 6px 色點；`labels` 層改顯示**勢力名標籤**：每個勢力在其領有城座標的
  加權質心（權重 = 城所轄郡石高和）顯示勢力名（勢力色、描邊白），
  字級隨領土石高分 3 級（20/16/13 px）。
- 退出後還原原圖層狀態。迷你地圖不受此模式影響（本來就是勢力概覽）。

---

## 4. 資料結構

以下型別置於 `src/core/`（模擬用）與 `src/ui/map/`（渲染用）；
實體欄位（`RoadEdge`、`District.isPort`、`Army` 行軍欄位等）最終歸屬 `plan/02-data-model.md`。

### 4.1 節點與圖

```ts
/** 地圖節點 ID：CastleId（'castle.*'）或 DistrictId（'dist.*'）。 */
export type MapNodeId = string;

/** 載入劇本後建立的唯讀圖結構（src/core/state/mapGraph.ts），整局不變。 */
export interface MapGraph {
  /** 節點查表。 */
  nodes: ReadonlyMap<MapNodeId, MapGraphNode>;
  /** 邊查表。 */
  edges: ReadonlyMap<string, RoadEdgeData>;
  /** 鄰接表：nodeId → 與其相連的 RoadEdge id 陣列（依 edgeId 字典序，確保決定論）。 */
  adjacency: ReadonlyMap<MapNodeId, readonly string[]>;
}

export interface MapGraphNode {
  id: MapNodeId;
  kind: 'castle' | 'district';
  /** 世界座標（world unit，整數）。 */
  pos: { x: number; y: number };
  /** 郡節點限定：是否港郡（海路端點資格）。城節點恆 false。 */
  isPort: boolean;
  /** 郡節點限定：所屬城。 */
  castleId?: string;
}
```

### 4.2 行軍與制壓狀態（掛在 `Army` 上；定義歸 02 §4.8，本節僅列 04 消費之欄位語意）

02 §4.8（權威）已將行軍狀態直接攤平為 `Army` 的頂層欄位，**不再有**獨立巢狀 `march: MarchState`
物件（2026-07-10 對齊，見 §8）。以下僅重列 04 行軍／制壓模擬（§3.5～§3.8、§5.2～§5.4）消費的
欄位型別與語意，欄位定義一律以 02 §4.8 為準：

```ts
export type ArmyStatus =              // 型別最終歸屬 02 §3.3；採 02 聯集定案（E-10）
  | 'marching'      // 沿路徑行進中
  | 'subjugating'   // 停在敵郡制壓中
  | 'engaged'       // 野戰中（由 07 控制，movement 系統跳過；原 'fighting'）
  | 'sieging'       // 攻城中（由 07 控制；原 'besieging'）
  | 'returning'     // 奉令撤退／歸還（走路徑回城，可再下令；原 'retreating'）
  | 'routed'        // 糧盡/崩潰潰走（不可控，強制回最近我方城）
  | 'holding';      // 原地待命（含通行被阻；07 'resting' 併入此態）
```

| `Army` 欄位（02 §4.8） | 04 消費語意 |
|---|---|
| `status: ArmyStatus` | 行軍/制壓/戰鬥活動層狀態機（見上 `ArmyStatus`）。 |
| `path: MapNodeId[]` | 完整路徑節點序列（含起點與終點）。`holding` 且無路徑時為長度 1。 |
| `pathCursor: number` | 目前所在 `path` 索引：位於 `path[pathCursor]`，或行進於 `path[pathCursor]→path[pathCursor+1]` 邊上。 |
| `posNodeId: MapNodeId` | 最近抵達節點，恆等於 `path[pathCursor]`。 |
| `edgeProgressDays: number` | 當前邊已累積的進度（日）。位於節點上時為 0。 |
| `edgeCostDays: number` | 當前邊的有效日數快取（進入邊時計算）。 |
| `mission: ArmyMission` | 意圖層任務目標（march/conquer/return，02 §3.3，二輪裁決 B）；與 `status` 正交，07 出陣/自動轉移邏輯依此判斷（07 §3.1／§3.11／§3.13）；04 movement 不依此分支，僅列出供對照。 |

制壓狀態（02 §4.6 canonical；四輪裁決 D-14／DDR-9 回寫——**Army 側已不再持有任何制壓擴充欄位**，
原 04 專屬 `ArmySubjugation` 介面〔`districtId`＋`daysRequired`〕已刪除）：

`Army.status==='subjugating'` 期間，制壓目標郡即 `posNodeId`（無需另存 `districtId`，
直接反查即可）；所需日數與進度一律讀寫 `District.subjugation`（`clanId`／`progress`／
`daysRequired`，型別見 02 §4.6）——`daysRequired` 由抵達當下依 §3.8 公式算定並快取於該欄位，
同勢力接力換將時以新部隊大將重算；`progress`（0..100）之推進、完成翻轉、勝敗保留/歸零規則
見 §3.8（依 02 DDR-9／E-13，進度為郡的事實，非 Army 的事實）。

### 4.3 尋路 API

```ts
export interface PathQuery {
  /** 行軍勢力（決定通行規則）。 */
  clanId: string;
  from: MapNodeId;
  to: MapNodeId;
  /** 部隊速度係數（§5.3；預覽時可用 1.0 估算或傳入實際部隊值）。 */
  speedFactor: number;
}

export interface PathResult {
  found: boolean;
  /** 節點序列（含首尾）；found=false 時為空陣列。 */
  nodes: MapNodeId[];
  /** 對應的邊 id 序列（長度 = nodes.length - 1）。 */
  edgeIds: string[];
  /** 純行軍日數（不含制壓）。 */
  travelDays: number;
  /** 預估制壓總日數。 */
  subjugateDays: number;
  /** travelDays + subjugateDays，四捨五入至 0.5 日。 */
  totalDays: number;
  /** 逐節點明細：抵達該節點的累計日數與是否需制壓（UI 日刻度用）。 */
  steps: { nodeId: MapNodeId; etaDays: number; needsSubjugate: boolean }[];
}

/** src/core/systems/pathfinding.ts；純函式，UI 預覽與 AI 共用。 */
export function computePath(state: GameState, graph: MapGraph, q: PathQuery): PathResult;
```

### 4.4 勢力色網格（渲染層，`src/ui/map/territory.ts`）

```ts
export interface TerritoryGrid {
  /** 網格邊長（cell 數）＝ MAPVIEW.territoryGridSize（1024）。 */
  size: number;
  /** 每 cell 最近郡的索引（指向 districtIds）；0xFFFF = 海或超距。靜態。 */
  nearestDistrict: Uint16Array;
  /** 索引 → DistrictId 對照。 */
  districtIds: string[];
  /** 供重繪的 RGBA 畫布資料（size×size×4）。 */
  imageData: ImageData;
}
```

### 4.5 渲染設定常數（`src/ui/map/mapViewConfig.ts`；非 BAL，理由見 §8-D8）

```ts
export const MAPVIEW = {
  minScale: 0.15, maxScale: 4.0,        // 鏡頭縮放範圍（螢幕px / world unit）
  wheelZoomStep: 1.1,                    // 滾輪每格倍率
  inertiaDamping: 0.92,                  // 慣性每幀衰減
  inertiaMinSpeed: 0.02,                 // 慣性停止閾值（world unit/幀）
  focusDurationMs: 600, focusScale: 1.5, // focusOn 預設
  lodFarScale: 0.5, labelScale: 1.0,     // LOD 門檻
  cullMargin: 256, cullBucket: 256,      // 視錐剔除外擴與桶邊長（world unit）
  territoryGridSize: 1024,               // 勢力色網格解析度
  territoryMaxDist: 260,                 // 郡域最大延伸距離（world unit）
  territoryAlpha: 0.45,                  // 郡域紋理透明度（一般/遠LOD 0.65/勢力圖 0.85）
  colors: {                              // 建議值；design token 覆蓋參見 plan/12
    sea: 0x27303d, land: 0xcfc6ae, neutral: 0x8a8578,
    borderDarken: 0.55, pathOk: 0xffffff, pathBad: 0xcc3333, awe: 0xe8b93f,
  },
  hitRadius: { army: 16, castleMain: 20, castleBranch: 16, district: 12 }, // 命中半徑（world unit）
} as const;
```

### 4.6 渲染器輸入（core → view 的 plain data selector，`src/core/state/selectors.ts`）

```ts
/** 靜態資料（init 時傳入一次）。 */
export interface MapStaticData {
  graph: MapGraph;
  outline: JapanOutlineFile;
  /** clanId → 24bit 色（來自劇本 clan.color，參見 02/14）。 */
  clanColors: Record<string, number>;
  names: Record<string, string>;         // nodeId/clanId → 顯示名（繁中）
  provinceLabelPos: Record<string, { x: number; y: number }>; // 國名標籤位置（成員城質心）
}

/** 每 tick 更新的動態視圖（不含任何函式/類別，可直接結構比對 diff）。 */
export interface MapViewState {
  day: number;                                        // 遊戲日序號（diff 用）
  districtOwner: Record<string, string | null>;       // districtId → clanId（null=無主）
  castleOwner: Record<string, string>;
  armies: {
    id: string; clanId: string; soldiers: number;
    status: ArmyStatus;
    /** 渲染位置內插參數。 */
    fromNode: MapNodeId; toNode: MapNodeId | null; edgeT: number; // edgeT = progress/cost ∈ [0,1]
  }[];
  battles: { nodeOrEdgeId: string; kind: 'field' | 'siege' }[];   // 交鋒 icon 位置
  selection: { kind: 'node' | 'army'; id: string } | null;
}
```

---

## 5. 演算法與公式

### 5.1 圖建構（載入時）

```
buildMapGraph(castles, districts, roads):
  nodes ← {}
  for c in castles: nodes[c.id] = { kind:'castle', pos:c.pos, isPort:false }
  for d in districts: nodes[d.id] = { kind:'district', pos:d.pos, isPort:d.isPort, castleId:d.castleId }
  adjacency ← multimap(nodeId → [])
  for e in roads.edges（依 e.id 字典序）:
    assert nodes[e.a] 與 nodes[e.b] 存在
    adjacency[e.a].push(e.id); adjacency[e.b].push(e.id)
  驗證連通（BFS 自任一節點需達全部節點）
  return frozen MapGraph
```

### 5.2 尋路 `computePath`（Dijkstra）

```
computePath(state, graph, q):
  passable(nodeId) / needsSubjugate(nodeId)：依 §3.5 查 getStance（q.to 例外：敵城可為終點）
  dist ← map(全部 +∞); dist[q.from] = 0; prev ← {}
  pq ← 最小堆，元素 (cost, nodeId)，cost 相同比 nodeId 字典序   // 決定論
  push (0, q.from)
  while pq 非空:
    (cost, u) ← pop
    if u == q.to: break
    if cost > dist[u]: continue
    for edgeId in graph.adjacency[u]:                            // 已按字典序
      e ← graph.edges[edgeId]; v ← e 的另一端
      if not passable(v)（且 v ≠ q.to 為敵城終點例外）: continue
      moveDays ← e.baseDays / (e.type=='sea' ? 1 : BAL.roadGradeSpeedMult[e.grade])
      moveDays ← moveDays / (e.type=='sea' ? 1 : q.speedFactor)   // 海路不吃行軍修正（§3.4.3）
      if e.type=='sea' 且（u 為起點所在 或 prevEdge(u).type=='land'）: moveDays += BAL.seaEmbarkDays
      stepCost ← moveDays + (needsSubjugate(v) ? estimateSubjugateDays(state, v) : 0)   // §3.8 公式
      if dist[u] + stepCost < dist[v]:
        dist[v] = dist[u] + stepCost; prev[v] = (u, edgeId); push (dist[v], v)
  若 dist[q.to] = +∞ → { found:false, ... }
  否則回溯 prev 組出 nodes/edgeIds/steps；totalDays = round(dist[q.to] × 2) / 2
```

註：`seaEmbarkDays` 依賴前一條邊的型別，嚴格而言使成本非馬可夫；因海路邊稀少且
登船延遲小（1 日），以「展開節點時攜帶進入邊型別」的雙態節點（`nodeId × 'land'|'sea'`）
處理：每個節點存兩個 dist 槽位，實作照此即可精確。

### 5.3 每日速度係數（僅陸路邊）

```
speedFactor(army) = clamp(
  1.0
  × traitFactor        // 大將行軍類特性乘數，定義參見 plan/06/07（無則 1.0）
  × moraleFactor       // 士氣 < BAL.marchLowMoraleThreshold(40) ? BAL.marchLowMoraleFactor(0.8) : 1.0
  × policyFactor       // 勢力政策乘數，定義參見 plan/05（無則 1.0）
  × (status=='returning' || status=='routed' ? BAL.retreatSpeedFactor(1.25) : 1.0),
  BAL.marchSpeedMin(0.5), BAL.marchSpeedMax(2.0))
```

### 5.4 每日行軍 tick（`src/core/systems/military.ts`，於 00 §5.4 第 7 步）

```
movementSystem(state):
  // 相 1：移動（依 armyId 字典序）
  for army in sortById(state.armies):
    if army.status in ('engaged','sieging'): continue                  // 由 07 控制
    consumeFood(army)                                                  // §3.7；糧盡處理
    if army.status == 'subjugating': subjugationTick(army); continue
    if army.status == 'holding': continue
    if not validateNextStep(army): army.status='holding'; emit army.blocked(armyId, clanId, nodeId=army.posNodeId); continue  // 02 §4.19，四輪裁決 C-6
    budget ← speedFactor(army)                                         // 海路邊改為 1.0
    while budget > 0 且未到路徑終點:
      需要登船（下一邊為海路且當前邊為陸路/起步）→ 先扣 BAL.seaEmbarkDays 的 budget（不足則停）
      step ← min(budget, edgeCostDays − edgeProgressDays)
      edgeProgressDays += step; budget −= step
      if edgeProgressDays ≥ edgeCostDays: 抵達 path[pathCursor+1] → onArriveNode(army)
        （若進入 subjugating/sieging/入城解散 → break）
  // 相 2：遭遇（依 (idA,idB) 字典序檢查 §3.9 規則 1~3）
  for 每對敵對部隊 (a, b): if 觸發 → startFieldCombat(a, b, ...)       // 解算移交 07

onArriveNode(army):
  pathCursor += 1; edgeProgressDays = 0
  若 path[pathCursor] == army.targetNodeId → 發出 army.arrived 事件（armyId, clanId, nodeId=path[pathCursor]；02 §4.19）
  if army.status in ('routed','returning'):                            // E-62：潰走/歸還穿越敵境不觸發
    終點為我方城 → 入城解散/整補（參見 07）；否則續行，不 declareWar/不制壓/不主動遭遇
    return
  owner ← 節點擁有者; stance ← getStance(army.clanId, owner)
  if 侵入中立領 → declareWar(...)                                      // 參見 08
  if 節點為敵郡 → army.status='subjugating'; d ← state.districts[army.posNodeId];
    d.subjugation = { clanId: army.clanId, progress: (d.subjugation?.clanId === army.clanId ? d.subjugation.progress : 0), daysRequired: <依 §3.8 公式，抵達時算定> }
    （02 §4.6 canonical；D-14／DDR-9——Army 側不再另存 `subjugation` 欄位，§4.2）
  else if 節點為敵城（必為終點）→ army.status='sieging'                // 參見 07
  else if 節點為終點:
     終點為我方城 → 入城解散（參見 07 兵站）
     否則 army.status='holding'（駐於節點）
```

### 5.5 勢力色網格建構與重繪（`src/ui/map/territory.ts`）

```
buildTerritoryGrid(graph, outline):                     // 載入時一次，~80ms 允許
  cellW ← 4096 / 1024
  buckets ← 均勻網格（128 world unit）內放全部郡節點
  for cy in 0..1023, cx in 0..1023:
    p ← cell 中心世界座標
    if p 不在任何 outline polygon 內（ray casting，先用 polygon AABB 篩）: nearest[i]=0xFFFF; continue
    d ← 由 p 所在桶向外環狀擴張搜尋最近郡（找到後再檢查一圈確保正確）
    nearest[i] ← dist(p,d) ≤ MAPVIEW.territoryMaxDist ? index(d) : 0xFFFF

recolorTerritory(grid, districtOwner, clanColors):      // 郡歸屬 dirty 時，每幀至多一次
  pass1：cell 勢力索引 clanIdx[i] ←（nearest[i]==0xFFFF ? NONE : 擁有勢力，無主= NEUTRAL）
  pass2：for 每 cell：base 色 ← clan.color 或 neutral 或 透明(海)
         若右鄰或下鄰 clanIdx 不同 → 本 cell 與該鄰 cell 皆乘 MAPVIEW.colors.borderDarken
  寫入 imageData → texture.update()
```

### 5.6 視錐剔除（每次 cameraChanged）

```
可視世界矩形 R ← 由 camera 反推，外擴 cullMargin
(bx0,by0,bx1,by1) ← R 覆蓋的桶索引範圍
for 三個受剔除圖層的每個桶：桶在範圍內 → 其成員 visible=true，否則 false
（部隊每日更新位置時同步換桶。）
```

### 5.7 鏡頭縮放錨點與 focusOn

```
onWheel(deltaY, cursor):
  s0 ← scale; s1 ← clamp(s0 × (deltaY<0 ? 1.1 : 1/1.1), 0.15, 4.0)
  w ← screenToWorld(cursor, camera)          // 縮放前游標世界座標
  camera.scale = s1
  camera.x += w.x − screenToWorld(cursor).x  // 使 w 在縮放後仍位於游標下
  camera.y += w.y − screenToWorld(cursor).y

focusOn(nodeId, opts): 每幀 t∈[0,1]，easeInOutCubic(t) 內插 (x,y,scale)；
  使用者輸入（wheel/drag/key）→ 立即中止並 resolve。
```

### 5.8 本文件引入的 BAL 常數（建議初值；定案以 `plan/15-balance.md` 為準）

| 常數 | 建議值 | 單位/說明 |
|---|---|---|
| `BAL.roadGradeSpeedMult` | `{1:1.0, 2:1.3, 3:1.6}` | 道級速度倍率 |
| `BAL.seaEmbarkDays` | 1 | 日；陸轉海登船延遲 |
| `BAL.marchLowMoraleThreshold` | 40 | 士氣；低於此值行軍減速 |
| `BAL.marchLowMoraleFactor` | 0.8 | 低士氣速度乘數 |
| `BAL.marchSpeedMin` / `BAL.marchSpeedMax` | 0.5 / 2.0 | speedFactor 夾限 |
| `BAL.retreatSpeedFactor` | 1.25 | 撤退/潰走速度乘數 |
| `BAL.subjugateDaysBase` | 4 | 日；制壓基礎日數 |
| `BAL.subjugateKokuPerExtraDay` | 30000 | 石；郡石高每滿此值 +1 日 |
| `BAL.subjugateLdrBonusThreshold` | 80 | 大將統率 ≥ 此值 −1 日 |
| `BAL.subjugateDaysMin` / `BAL.subjugateDaysMax` | 3 / 10 | 制壓日數夾限 |
| `BAL.subjugateSecurityHit` | 15 | 點；制壓完成時郡治安下降 |
| `BAL.noFoodMoraleDaily` | 8 | 點/日；糧盡士氣（定義 07/15，E-17） |
| `BAL.noFoodDesertionRate` | 0.05 | 比例/日，向上取整；糧盡逃兵（定義 07/15，E-17） |
| `BAL.fieldFoodPerSoldierDaily` | 0.02 | 石/人/日；定義 07、值 15（E-14） |
| `BAL.moraleBreakThreshold` | 30 | 崩潰閾值；名依 02、值 07/15（E-16） |

---

## 6. UI/UX

### 6.1 互動流程摘要

1. **查看**：hover 城/郡/部隊 → tooltip（0.25s 延遲淡入，跟隨游標右下 16px 偏移）；
   點擊 → 開啟對應側欄面板（面板內容參見 `plan/11-ui-screens.md`）。
2. **下令行軍**：選取部隊或於城面板按「出陣」→ 進入 `orderMarch` 模式（游標變旗印）→
   hover 目的地即時顯示路徑預覽（實線＋日刻度圓點；需制壓的郡以 ⚔ 記號＋天數；
   總計顯示於游標旁）→ 左鍵確認 → 送出 Command；右鍵/ESC 取消。
3. **兵數縮寫**：部隊 sprite 上兵數 ≥ 10000 顯示「1.2萬」、1000~9999 顯示「3200」、
   <1000 顯示實數。
4. **威風演出**：合戰大勝時 `playAweEffect` 於戰場節點播金色擴散環；歸順郡的勢力色
   於環掃過時翻轉（純演出時序，實際歸屬由 core 一次翻轉；機制參見 07）。

### 6.2 繁中字串表（併入 `src/i18n/zh-TW.ts`；key 規範見 00 §9）

| key | 字串 |
|---|---|
| `ui.map.mode.faction` | `勢力圖` |
| `ui.map.mode.normal` | `一般地圖` |
| `ui.map.tooltip.castle` | `{name}（{clan}）　兵{soldiers}　糧{food}石　耐久{durability}` |
| `ui.map.tooltip.district` | `{name}（{clan}）　{kokudaka}石　治安{security}` |
| `ui.map.tooltip.districtSteward` | `領主：{steward}` |
| `ui.map.tooltip.army` | `{leader}隊（{clan}）　{soldiers}兵　士氣{morale}` |
| `ui.map.tooltip.armyFood` | `兵糧尚可支{days}日` |
| `ui.map.path.total` | `預計{days}日` |
| `ui.map.path.subjugate` | `（含制壓{days}日）` |
| `ui.map.path.unreachable` | `無法抵達` |
| `ui.map.path.seaRoute` | `經海路` |
| `ui.map.order.selectTarget` | `選擇目的地（右鍵取消）` |
| `cmd.march.confirm` | `向{target}進軍` |
| `cmd.march.cancel` | `取消行軍` |
| `report.army.arrived` | `{leader}隊抵達{place}。` |
| `report.army.blocked` | `{army}行軍受阻，於{place}待命。` |
| `report.army.noFood` | `{army}兵糧耗盡，士氣潰散中！` |
| `report.subjugate.begin` | `{army}開始制壓{district}。` |
| `report.subjugate.interrupted` | `{district}的制壓遭{enemy}阻止。` |

（潰走／解散／野戰／攻城／威風相關報告字串（含潰走專用 `report.field.rout`）定義於
`plan/07-military.md`（07 §3.4 為潰走行為單一擁有者，四輪裁決 E20）；郡制壓翻轉之攻守雙方
報告字串 `report.army.subjugated`／`report.army.districtLost` 已列於 `plan/13-i18n-strings.md`
§6.11（對應同一 `district.subjugated` 事件，本表不另立重複 key）；通用 UI 字串亦於 13。）

---

## 7. 實作任務清單

- [ ] **T1 投影與 outline schema**：`projection.ts`、`schemas/outline.ts`（zod）。
      驗收：§3.2 錨點表 6 點誤差 ≤ 1 world unit；非法 outline JSON 被 zod 拒絕。
- [ ] **T2 japan-outline.json 製作**（方案 A 或 B 擇一）。
      驗收：§3.3.4 全部自動檢查通過；肉眼可辨識本州/四國/九州與瀨戶內海。
- [ ] **T3 roads.json schema 與 MapGraph 建構**：`schemas/roads.ts`、`mapGraph.ts`。
      驗收：連通性/港郡/重複邊/baseDays 範圍違規時 `tools/validate.ts` 報錯並指出邊 id。
- [ ] **T4 尋路 `computePath`**：含通行規則、雙態節點登船成本、決定論 tie-break。
      驗收：Vitest 固定 fixture 圖（10 節點）斷言路徑與 totalDays；敵城僅可為終點；
      停戰領不可入；同輸入重複呼叫結果 bit 相同。
- [ ] **T5 行軍系統**：進度累加、跨邊結轉、每日通行重驗、兵糧消耗掛鉤、糧盡潰散。
      驗收：模擬 fixture：3 級道 baseDays 3 之邊在 speedFactor 1.0 下 2 日走完
      （3/1.6=1.875）；糧盡部隊依常數逐日掉士氣/兵力並在閾值潰走。
- [ ] **T6 制壓系統**：日數公式、進度保留/歸零規則、翻轉與治安扣減、報告事件。
      驗收：kokudaka 90000 之郡、大將 ldr 85 → daysRequired = 4+3−1 = 6；
      制壓中戰勝續算、戰敗歸零之單元測試。
- [ ] **T7 遭遇判定**：同節點/相向/追擊三規則、兩相決定論順序、移交 07 的介面 stub。
      驗收：構造三種情境 fixture 各觸發一次且僅一次；同勢力/同盟不觸發。
- [ ] **T8 MapRenderer 骨架**：Pixi 初始化、8 圖層、outline 與街道繪製、`MapViewState` diff 更新。
      驗收：載入東海+近畿子集資料（M2 範圍）60fps；圖層順序以截圖目視驗證。
- [ ] **T9 勢力色 TerritoryGrid**：建構、重繪、界線烘焙、dirty 機制。
      驗收：1024 網格建構 < 200ms（M2 子集）；翻轉一郡歸屬後下一幀顏色更新。
- [ ] **T10 鏡頭**：縮放錨點、平移夾限、慣性、`focusOn` Promise 與中止。
      驗收：滾輪縮放時游標下世界點不漂移（自動化：縮放前後 `screenToWorld` 誤差 < 0.5）；
      focusOn 期間拖曳立即接管。
- [ ] **T11 LOD 與視錐剔除**：門檻切換、空間雜湊、部隊換桶。
      驗收：全國模擬資料（程序生成 500 節點/120 部隊）縮放平移維持 ≥ 55fps。
- [ ] **T12 互動與事件協定**：命中測試、`idle`/`orderMarch` 模式、事件 emitter、
      React `useMapEvents`、tooltip、路徑預覽含日刻度。
      驗收：Playwright smoke：hover 城出現 tooltip 文字含城名；點城開面板；
      orderMarch 下右鍵取消回 idle。
- [ ] **T13 迷你地圖與勢力圖模式**。
      驗收：點迷你地圖任意點主鏡頭跳轉；Tab 切換勢力圖模式，勢力名標籤出現且退出後復原。

## 8. 設計決策記錄

- **D1（柵格化 Voronoi，不引幾何庫）**：分析式 Voronoi 需 Fortune/Delaunay 實作或引入
  d3-delaunay，前者複雜、後者增加 00 §2 未列的依賴。柵格最近鄰 + palette 重繪把
  「歸屬變動」成本降為 O(cells) 查表（~8ms/日上限），且陸地遮罩、界線烘焙、迷你地圖
  底圖三者共用同一 `ImageData`，實作面最小。
- **D2（放棄半徑漸層色塊）**：漸層圓在郡密集處互相疊色混濁、稀疏處露出無色縫隙，
  無法呈現「連續領土」的讀圖需求；Voronoi 天然鋪滿且界線清晰。
- **D3（敵城不可過境、只能為終點）**：若允許繞過敵城深入，攻城戰略地位崩壞；
  與《新生》的戰線推進體感一致。代價是尋路需終點例外，已在 §5.2 處理。
- **D4（停戰領完全不可進入）**：若允許通行將出現「停戰借道偷襲第三方」的路徑濫用；
  一律禁止最單純且符合停戰語意。
- **D5（海上遭遇沿用野戰解算，v1.0 無海戰模型）**：海戰系統（船型、水軍）超出 v1.0
  範圍（00 §1.5 精神）；海路邊少、衝突罕見，沿用野戰可玩且省一套系統。留待 v1.x。
- **D6（不畫舊國 Province 邊界多邊形）**：Province 僅為顯示分組（00 §4），無邊界資料；
  以國名標籤（成員城質心）在遠 LOD 表達即可，省去 ~58 國的多邊形製作與維護成本。
- **D7（制壓不因多部隊疊加而加速）**：允許疊加會使「拆兵洗地」成為最優解，
  破壞行軍調度的取捨；固定單份進度使制壓時間可預期，利於 AI 與玩家計畫。
- **D8（鏡頭/渲染常數放 `MAPVIEW` 而非 BAL）**：00 §11 的 BAL 管的是遊戲性數值；
  縮放範圍、透明度、命中半徑不影響模擬決定論也不參與平衡，放入 `src/core/balance.ts`
  會違反 core 無 UI 概念的鐵律（00 §3）。凡影響模擬的數值（速度、制壓、糧耗）仍全在 BAL。
- **D9（進度累加器而非連續座標）**：core 只存「第幾條邊、累積幾日」，
  存檔小、決定論簡單；平滑移動由渲染層以 `edgeT` 內插，兩層職責乾淨分離。
- **D10（登船成本的雙態節點）**：海路登船延遲使邊權依賴前驅邊型別；以
  `nodeId × {land,sea}` 展開為雙態即可維持 Dijkstra 正確性，圖規模小、成本可忽略。
- **D11（制壓進度「勝則保留、敗則歸零」）**：全保留使騷擾無意義、全歸零使防守方
  只需無限派小隊即可凍結戰線；以戰鬥勝負為界最能獎勵「護衛制壓部隊」的正確運兵。

### 8.1 勘誤消化記錄（依 `plan/19-glossary.md` §3.13）

- **2026-07-07 · E-10**：§4.2 型別 `ArmyMoveStatus` 重命名為 `ArmyStatus` 並改用 02 §3.3 聯集值
  （`fighting`→`engaged`、`besieging`→`sieging`、`retreating`→`returning`；07 `resting` 併入 `holding`）；
  §4.6、§5.3、§5.4 之狀態引用同步。依據：E-10 建議定案「修 02 擴充為聯集定案，04／07 改用」。
- **2026-07-07 · E-13**：制壓進度改存於 `District.subjugation.progress`（0..100，DDR-9 接力制壓）；
  §3.8 由 `daysDone += 1` 改為 `progress += 100/daysRequired`、完成判定改 `progress ≥ 100`、勝保留／敗歸零皆改指 `progress`；
  §4.2 `MarchState.subjugation` 移除 `daysDone`，僅保留 `districtId＋daysRequired` 快取；§5.4 初始化說明同步。
  依據：E-13「依 02（存於郡）；04 的 daysRequired 公式保留、進度換算為 0..100」。
- **2026-07-07 · E-46**：刪除 §3.9「合流是明確的 Command，定義參見 07」句，改記「v1.0 不支援部隊合流與拆分」。
  依據：E-46「依 07（不支援）；刪 04 該句」。
- **2026-07-07 · E-62**：§5.4 `onArriveNode` 對 `status∈{routed,returning}` 加守衛（不 declareWar／不制壓／不主動遭遇，
  解除 §3.7 與 §5.4 之自相矛盾）；§3.7 標註潰走行為以 07 §3.4 為單一擁有者。依據：E-62。
- **2026-07-07 · E-63**：§3.9 觸發規則 1 末句由「該節點上所有互為敵對的部隊全部捲入同一場野戰」改為
  「取兵數最大的兩個敵對勢力交戰、其餘部隊待機」。依據：E-63「依 07 §3.3」。
- **2026-07-07 · E-14／E-16／E-17**（本檔糧耗／潰走常數改名）：§2、§3.7、§5.8 已由本輪修正將
  `armyFoodPerSoldierPerDay`→`fieldFoodPerSoldierDaily`(0.02)、`routMoraleThreshold`→`moraleBreakThreshold`(30)、
  `starvationMoraleLossPerDay`→`noFoodMoraleDaily`、`starvationDesertRatePerDay`→`noFoodDesertionRate`(0.05) 全部改齊，
  值以 15 §5.2 為準。依據：E-14／E-16／E-17。
- **2026-07-10 · E-11／E-36**（02 樞紐定案回寫）：§4.2 `MarchState.nodeIndex` 更名為 `pathCursor`
  （定義句與欄位名同步；§5.4 `movementSystem`／`onArriveNode` 全部引用處同步改名）；
  `edgeProgressDays`／`edgeCostDays` 語意已與 02 一致，不動。依據：02 樞紐定案備忘錄第 2 項
  「行軍唯一權威模型＝日數累加器；02 `pathCursor` ＝ 04 `nodeIndex` 語意，04 側僅需改名即對齊」
  （E-11／E-36）。
- **2026-07-10 · E-30**：§3.7 新增一句、§5.4 `onArriveNode` 新增一行，明文部隊抵達路徑終點
  （`targetNodeId`）時發出 `army.arrived` 事件（`armyId, clanId, nodeId`；發出者＝04 movement）。
  依據：02 §4.19 已收錄該事件（勘誤 E-30「補收部隊抵達事件」）。
- **2026-07-10（02 二輪裁決回寫；MarchState 攤平對齊 02）**：§4.2 刪除獨立 `MarchState` interface，
  改寫為「`Army` 行軍欄位一覽（定義歸 02 §4.8，本節僅列 04 消費之欄位語意）」的引用式表格；
  制壓快取（`districtId`＋`daysRequired`）改列為 02 未收錄之 04 專屬擴充型別 `ArmySubjugation`，
  掛於 `Army.subjugation`（原巢狀 `march.subjugation`）。全檔 `army.march.status` 改
  `army.status`（§5.4 `movementSystem` 三處）、`march.subjugation(...)` 改 `army.subjugation={...}`
  （§5.4 `onArriveNode`）；§3.7、§4（entity 歸屬句）之 `Army.march` 措辭同步改為「`Army` 行軍欄位」，
  消除原「`march: MarchState`（§4.4）」之錯誤章節引用（正確歸屬為 §4.2）。制壓進度確認：
  `District.subjugation.progress`（0..100）為進度唯一存放處（02 DDR-9／E-13），§3.8／§5.4 現況已一致，
  無殘留於 Army 側之進度重複存放。依據：02 二輪裁決備忘錄（2026-07-10）§8 二輪 A/B、DDR-9；
  02 §4.8 canonical 未定義獨立巢狀 `march` 物件。
- **2026-07-11（驗證修復；依 02 四輪裁決備忘錄下游清單回寫）**：
  (1) §3.7 刪除潰走行為自訂規格（「被迫野戰」「潰走部隊士氣以 0 計」「兵力 < `armyDisbandSoldiers` 就地解散」
  三句與該常數），改為純引用 `plan/07-military.md` §3.4 為潰走後行為單一擁有者（四輪裁決 E20）；
  `BAL.retreatSpeedFactor` 保留（returning／routed 共用之行軍速度常數，§5.3）；§5.8 常數表移除
  `BAL.armyDisbandSoldiers` 列。
  (2) §3.7 糧盡逃兵公式 `floor(soldiers × BAL.noFoodDesertionRate)` 改 `ceil(...)`，對齊 07 §3.13／15
  之「向上取整」（E-17）；§5.8 `noFoodDesertionRate` 說明列同步加註。
  (3) §3.8 制壓完成敘述由「發出 `report.subjugate.done`」改為「發出 `district.subjugated` 事件
  （`districtId, fromClanId, toClanId`；02 §4.19）」，攻守雙方報告文字改指 13 §6.11 既有之
  `report.army.subjugated`／`report.army.districtLost`；§3.8 另補一句明示 `daysRequired` 快取於
  `District.subjugation.daysRequired`（02 §4.6）。
  (4) §3.5、§5.4 之 `emit report.march.blocked` 改為 `emit army.blocked(armyId, clanId, nodeId)`
  （02 §4.19，四輪裁決 C-6；對應報告 key `report.army.blocked`）。
  (5) §3.7 補一句部隊出陣時發出 `army.departed` 事件（`armyId, clanId, originCastleId, targetNodeId`；
  02 §4.19）之敘述，並註明其 Command 結算處為 07 §5.1 `applyCmdMarch`（07 尚未文件化此發出動作，
  故於 04 側補述，非重複定義）。
  (6) §4.2 依 02 D-14／DDR-9 移除獨立 `ArmySubjugation` 介面與 `Army.subjugation` 欄位；改為文字
  說明制壓中之 `districtId` 由 `posNodeId` 反查、`daysRequired`／`progress` 一律讀寫
  `District.subjugation`（02 §4.6 canonical）；§5.4 `onArriveNode` 之 `army.subjugation={...}` 賦值
  同步改為對 `District.subjugation` 賦值（含同勢力接力保留進度、異勢力/首次制壓歸零之邏輯）。
  (7) §6.2 報告字串表對齊 13 §6.11 現行 `report.army.*` 系列：`report.march.arrived`→`report.army.arrived`、
  `report.march.starving`→`report.army.noFood`、`report.march.blocked`→`report.army.blocked`；移除與
  07／13 重複之 `report.march.routed`（潰走敘述歸 07 `report.field.rout`）、`report.march.disbanded`
  （解散行為歸 07 §3.4）、`report.subjugate.done`（已由 13 `report.army.subjugated`／
  `report.army.districtLost` 承接同一 `district.subjugated` 事件）；表末註腳同步改寫，指向正確擁有文件。
  依據：02 四輪裁決備忘錄（2026-07-10）§C-6／D-14／項20，「04-map-and-movement」下游待改清單全 5 項；
  六名對抗式驗證員 CONFIRMED findings（本輪指派 04 之 5 項）。
