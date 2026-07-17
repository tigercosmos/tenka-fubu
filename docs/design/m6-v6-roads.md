# M6-V6 技術設計文件（定稿版）：道路／橋樑（waypoints 多段線、casing、道級線型、主幹道 far LOD、道路名、擴大命中容錯）

版本：Opus 二輪 REVISER 交付（已納入第一輪 spec/eng 兩份對抗性審查【§13】＋第二輪四份平行對抗性審查【§14】，逐條處置）。
實作 agent 僅依本文件＋四份 brief（brief-specs / brief-architecture / brief-assets / design-m6v5-final）施工。
語言：繁體中文（台灣慣用語）；程式契約為 TypeScript。所有路徑語意根為 `/Users/tigercosmos/nobunaga_ambition`。

> 前置事實（皆已對現行 working tree 驗證，M6-V5 已落於工作區）：
>
> - 現行 `roads` 圖層（`LAYER_ORDER` 第 6 項）由 `MapRenderer.buildStaticDataLayers()` 建立**單一** `roadsGfx`（`drawRoads(g,graph)`，`src/ui/map/mapDraw.ts`），畫直線段（無 waypoints），`applyLodAndCulling` 以 `this.layers.roads.visible = nearish`（`MapRenderer.ts:727`）於 **far LOD 整層隱藏**。此違反 04 §3.10.3 硬規則「不得在 overview 隱藏整個 `roads` 層」與 V6 DoD「overview 可見主幹道」——**本階段核心修正**。已驗證全 `src/`＋`tests/` 無任何測試斷言 `roads.visible`，翻為 `true` 不破隱藏測試。
> - `MapRoadEdge`（`src/core/state/mapGraph.ts`）已攜帶 `name?`/`waypoints?`（[M6-V4] D1，transient，不進 `GameState`）；`buildMapGraph` 已接受 `roadDisplay` 參數併入；`selectMapStaticModel` 已以 `roadDisplayLookup()`（`selectors.ts:438`，**現為私有、硬編碼 s1560**）供給。本階段補齊 scenario 分派並 **export** `roadDisplayLookup`。
> - 地圖色票 `MAP_PALETTE_NUM.roadCasing(#302a22)`/`roadArterial(#b89b64)`/`roadMinor(#86745a)`/`waterRiver(#5f8190)`/`seaDeep(#27303d)`/`plainLight(#d8cfb8)` **已於 M6-V5 落於 `tokens.ts`**。V6 **不新增任何顏色 token**。
> - `MAP_PALETTE road` 為向量繪製；**V6 不新增任何二進位／atlas 素材**（橋樑、道路皆為 `Graphics` 向量），故 **不需 gen:assets／validate:assets**。
> - canonical `RoadEdge`（`builder.ts:612`）僅映 `id/a/b/type/grade/baseDays`，**刻意剝除 name/waypoints/bridges**；故於 `roads.json` 增 waypoints/bridges **不影響 `stateHash`／golden**（同 M6-V4 name 之安全路徑，已對 `builder.ts` 驗證）。
> - `armyChip.ts:138` 之 `BitmapText` 以 `fill: TOKENS_NUM.ink900` 上深色（Pixi v8 認 `fill`）；MapRenderer 之 node label（`:450`/`:471`）**未帶 fill**（渲染為預設）。故道路名 `BitmapText` **必須顯式帶 `fill: TOKENS_NUM.ink900`**（否則白字落暖底不可讀，違 DoD）——見 V6D5／§5.1。
> - **【二輪新驗證】** LOD 三段界：`lodStageForScale` far `<0.5`／mid `<1.0`／near `>=1.0`（`lod.ts`）；三段 baseline preset 恰對 `visualOverviewScale=0.25`(far)／`visualOperationalScale=0.5`(mid)／`visualCloseScale=1.25`(near)（`mapViewConfig.ts:66-68`）。`roads` 層於相機縮放世界容器下，**螢幕線寬＝世界線寬 × scale**；固定世界線寬在 0.25 呈次像素（見 §V6D3 修正）。
> - **【二輪新驗證】** `terrain.json`（`src/data/map/terrain.json`）：`mt.akaishi.mass` x[2209..2324] y[2695..2930]（tier3）；`mt.kiso` x[2128..2219] y[2651..2893]；`rv.tenryu` x[2200..2210] y[2650..2987]；`rv.oi` x[2258..2279] y[2760..2970]。fixture 節點 `sunpu(2312,2897)` 落於 akaishi mass 之 bbox 內——arterial 端點逼近段之穿山不可完全避免，須以「內部 waypoints 避 mass 多段形、僅端點逼近段豁免」處理（§6.1／§8.1，處置 x4-M2）。
> - **【二輪新驗證】** `MapGraph.adjacency: ReadonlyMap<MapNodeId, readonly RoadEdgeId[]>`（`mapGraph.ts:52`）——回傳**邊 id**（非 `MapRoadEdge`）；roadHighlight 須先 `graph.edges.get(edgeId)`（§4.3，處置 x4-m7）。
> - **【二輪新驗證】** 全樹 `addChildAt` 使用數＝0；`tests/helpers/pixiMock.ts` 與 `MapCanvasHost.spec.tsx` inline mock 皆**無** `addChildAt`。故 roadHighlight 掛載**不得**用 `addChildAt`，改「先 `addChild` roadHighlight、後 `addChild` pathPreview」取得下層 z-order（§5.1，處置 x3-MAJOR）。`MapRenderer.init` 現於 `:333` 建 `pathPreview`、`:334` `addChild` 至 `selectionAndPath`。

---

## 1. 目標與範圍（Goal / Scope）

### 1.1 使命

把「所有道路同一種細黑直線、far LOD 整層消失、端點直線穿山越海」升級為 **墨線護邊的沙盤交通脈絡**：

- 每條道路＝**casing（深墨外框）＋內線**；依道級換線寬＋線型（主幹道寬暖金實線／次道較窄棕金實線／小路短節線）。
- 海路＝河色系水線＋長節線＋週期波節，**全程與陸路形狀不同**（非只換色）；**波節僅落海（陸段抑制）**。
- 道路循 **waypoints 多段線**順應地形，**無端點直線穿山／穿海**（內部 waypoints 避山系 mass，僅合成端點之短逼近段豁免）。
- 橋樑＝水面上短矩形橋面＋兩端橋頭（**非單一圓點**）。
- 三級 LOD：**far 保留主幹道＋海路**（不整層隱）、mid 加次道＋橋樑、near 加小路＋道路名。**所有線寬／節線／波節之螢幕外觀跨三段近似恆定**（per-stage 世界線寬倍率，避免 0.25 次像素，V6D3）。
- 節點與小路互動 **≥ 32 CSS px 命中容錯**（縮小時仍可點；僅套用於城／郡節點，**不動軍隊命中半徑**）。
- 補 visual fixture 之東海主幹道 waypoints（避 akaishi mass）／海路 waypoints／橋樑標記／**節點選取**，使三段 baseline 直接呈現 DoD（含選取相鄰道路金色高亮）。

### 1.2 交付內容

1. `roads`(5) 圖層重寫為 **RoadsLayer 子容器**（依道級／海路分批的 `Graphics`＋橋樑 `Graphics`），LOD 以 `setStage` **切 `visible` 並依 per-stage 倍率重描**（幾何於 build 時解析並存、stage 改變才重描；靜態一次建、非每幀重畫）。
2. waypoints 多段線繪製（casing＋內線兩趟 stroke），缺省退回兩端點直線。
3. 橋樑向量繪製（橋面矩形＋兩端橋頭，方位由道路段方向推導）。
4. 道路名 `BitmapText` 標籤（near-only，落 `labels` 層，`fill: ink900`，隨既有 label LOD／cull）。
5. 命中測試 scale-aware CSS-px 下限（`interaction.ts`；**僅城／郡節點**）。
6. 選取道路高亮（節點選取 → 相鄰道路金色高亮；`selectionAndPath`(9) 動態層；Slice E，**in-scope**，fixture 預選節點以入 baseline）。
7. 資料：`roads.json` arterial waypoints/bridges；`road.ts` schema 加 `bridges?`；`validate.ts` 加 bridges 偶數檢；`roadDisplayLookup(scenarioId)`（**export**）分派＋fixture 顯示資料 `debugVisualRoadDisplay.ts`。
8. visual fixture 三段 baseline 更新（獨立 commit）；fixture 選取由「軍隊」改為 `VISUAL_ANCHOR_CASTLE_ID`（駿府節點）以顯示道路高亮。

### 1.3 硬約束（違反即 CI 紅燈）

- `src/core/` 維持純 TS（無 React/Pixi/DOM、無 `Math.random`/`Date.now`）。`GameState`／golden **byte-identical**，**禁 `npm run golden:update`**；13 步 daily tick 零變更。`selectMapStaticModel`／`roadDisplayLookup`／`debugVisualRoadDisplay` 皆為 **view-model 純函式/純資料**（golden 只 hash `GameState`）。fixture 選取為 **UI store → composeMapViewState → `MapViewState.selection`**（`composeMapView.ts:38`），**永不進 `GameState`**，golden 安全。
- 渲染常數進 `MAPVIEW`／具名常數，不進 `BAL`。顏色一律取 token（`TOKENS_NUM`/`MAP_PALETTE_NUM`）；V6 不新增顏色。**render 模組不得 import `@core/balance`**（V6D12：不實作 BAL 驅動之每日刻度，故無此耦合）。
- 全繁體中文，無簡體字／日文新字體（`validate:data` 掃描）。**道路名為新增 `BitmapText` 字串** → **必須 `npm run font:subset`＋`check-font-coverage` 綠**（見 §9）。
- 新素材走 gen-assets——**V6 無新素材**，此條不觸發。
- M6-V4 dirty-update DoD（`mapRendererDirty.spec.ts`）維持全綠：無變更 tick 不重建靜態層；roads/road-labels 只在 `setMapData` 建、`day` 變更不觸發重畫；`MapRebuildCounts` **5 欄位不增刪**（`toEqual` 整物件比對）——橋樑/道路名沿用 `roads`/`labels` 既有計數，選取高亮**不動任何計數**。**`setStage` 依 stage 改變之重描為 LOD 轉場（相機縮放時 `applyLodAndCulling` 本就重跑），非 tick、不動 `rebuildCounts`；day-only tick stage 不變 → `setStage` 早退不重描**（§4.1／§8.2 保障）。
- `MapRenderer` 生命週期 StrictMode 安全、`destroy` 冪等、重掛無 texture/cache 洩漏（V5 territory/relief/forest 生命週期不得回歸）。
- **絕不修改 `plan/00-foundations.md`**。規格衝突依 00>02>15>系統>UI 裁定、實作、回寫 04 §8，不留 TBD。
- Playwright 視覺 baseline（三 preset 0.25/0.5/1.25）**預期改變**（far 首次顯示主幹道／海路；新增選取高亮），baseline 更新為獨立 commit。

---

## 2. 決策紀錄（V6D1–V6D12）

### V6D1 — 道路分批與 casing／內線層序

**決策**：`roads` 層放**單一 `RoadsLayer` 子容器**，其內含 5 個 `Graphics`，由下而上：
`seaGfx`（海路）→ `pathGfx`（grade1）→ `bridgeGfx`（橋面）→ `minorGfx`（grade2）→ `arterialGfx`（grade3，最上、最顯）。
每個道級 `Graphics` **內部先畫全部 casing 再畫全部內線**（Pixi v8 依呼叫序繪製，casing 在下、內線在上，交叉口自然連通）。橋面置於陸路內線之下，使「道路過橋」正確——橋面板側緣（寬於 casing）與橋頭露出。
**替代**：(i) 單一 `Graphics` 全畫——被否，無法對道級做 LOD `visible` 切換（04 §3.10.4）。(ii) 每幀依 LOD 重畫過濾道級——被否，違反 dirty 契約（惟 stage 改變之重描不違反，見 V6D3／§4.1）。
**理由**：分批＋視能見度切換＝靜態建構＋零每幀重畫；跨道級交叉口以「高道級在上」讓主幹道視覺主導。

### V6D2 — RoadsLayer 為子容器（`layers.roads.children.length === 1` 不破）

**決策**：`buildRoadsLayer(graph, seaTest?)` 回傳 `{ container, tiers, setStage, destroy }`；`MapRenderer` 只將**一個** `container` 掛進 `layers.roads`。故 `MapCanvasHost.spec.tsx:396` 之 `layers.roads.children.length === 1` **維持通過**。`rebuildCounts.roads` 仍於 `buildStaticDataLayers` **+1 一次**（`mapRendererDirty.spec.ts:175` `baseline.roads===1` 不破）。
**測試 affordance（處置 x1-MINOR7）**：介面**具名暴露** `readonly tiers: { sea; path; bridge; minor; arterial }`（5 個 `Graphics` 具名參考），使單測**以具名 tier 斷言 `visible`／描繪指令**，不依賴 `container.children[i]` 之隱含 z-order index。z-order 仍由 `addChild` 序（下→上）決定並於 JSDoc 註記為穩定契約。
**替代**：直接掛 5 個 Graphics 到 `layers.roads`——被否，破壞既有 child-count 斷言、且 destroy 分散。

### V6D3 — 道級 → 線型 ＋ per-stage 螢幕不變線寬（不只靠顏色＋overview 可見，DoD 硬項）

**決策 A（線型編碼，世界單位「near 基準」；顏色皆既有 token）**：

| grade/type | casing 寬(near)   | casing 色      | 內線                                    | 內線寬(near) | 內線色       | far | mid | near |
| ---------- | ----------------- | -------------- | --------------------------------------- | ------------ | ------------ | --- | --- | ---- |
| 3 主幹道   | 4                 | roadCasing     | 實線                                    | 2.0          | roadArterial | 顯  | 顯  | 顯   |
| 2 次道     | 2.5               | roadCasing     | 實線                                    | 1.2          | roadMinor    | 隱  | 顯  | 顯   |
| 1 小路     | 1.5               | roadCasing     | **短節線** dash5/gap4                   | 1.0          | roadMinor    | 隱  | 隱  | 顯   |
| sea 海路   | 3（外halo，α0.5） | **waterRiver** | **長節線** dash14/gap10＋波節（僅落海） | 1.5          | waterRiver   | 顯  | 顯  | 顯   |

**決策 B — per-stage 螢幕不變線寬（處置 x2-M1／x4-M1；核心修正）**：
上表為 **near（scale 1.25）基準**。`roads` 於相機世界容器下，固定世界線寬在 far(0.25) 呈次像素（arterial casing 4wu×0.25＝1px、內線 2wu×0.25＝0.5px、海路波節/長節線幾近消失），**使 arterial「不可見」、海路之非顏色辨識通道（波節/長節線）失效於 DoD 所指之 0.25**。故引入 **per-stage 線寬倍率**：

```ts
ROAD_STAGE_WIDTH_MULT = { far: 5, mid: 2.5, near: 1 }; // = 1.25 / stageScale（螢幕近似恆定）
```

所有線寬、節線 dash/gap、海路波節 spacing/radius、橋樑幾何於 `setStage` **乘 stage 倍率後重描**。螢幕外觀：far/mid/near 皆 ≈ near×1.25 螢幕像素（arterial casing ≈5px、內線 ≈2.5px；海路 halo ≈3.75px、波節 r≈3.75px、長節線 dash≈17.5px）。`setStage` 僅於 **stage 實際改變**時重描（快取 `lastStage`）；`buildRoadsLayer` 於 build 時**只解析並存多段線幾何、不描繪**，首次 `setStage`（`buildStaticDataLayers` 內 `setStage(this.lodStage)`）產生首描。
**與 dirty 契約相容**：重描屬 LOD 轉場（相機縮放，`applyLodAndCulling` 本就重跑），非 tick、不動 `rebuildCounts`、`roadsLayer` 參考不變；day-only tick stage 不變 → 早退零重描（§8.2 spec 保障，spy `arterialGfx.clear` 呼叫數）。
**替代**：(i) 單一固定世界線寬——被否（0.25 次像素，DoD 不過）。(ii) Pixi `stroke({pixelLine})`——僅限 1px 線，無法表達道級寬差，被否。(iii) 傳 live `camera.scale` 逐值除算並每幀重描——被否（連續縮放每幀重描，且三段 baseline 為離散 preset，per-stage 倍率已 DoD-exact 且更省）。

**辨識三通道**：**線寬＋單線/節線＋（海路）波節**共同編碼，非只換色（art-bible §3.3），且三段皆讀得（決策 B）。海路 `全程與陸路形狀不同`。
**海路配色（處置 spec-F3）**：海路**全走河色系**（art-bible §3.2「海路使用河色家族 `map.water.river`」）——外 halo（α0.5）＋內長節線＋波節皆 `waterRiver`。**不用 `reliefInk`**（暖地/山脊色，屬水面特徵配色錯誤）；**亦不用 `roadCasing`**（#302a22 對 `seaDeep` #27303d 亮度差近乎不可見，且海路穿海不需深墨護邊）。`waterRiver` 對 `seaDeep` 對比充足、切齊 §3.2 家族規則。此微決策回寫 §10-(1)。
**理由**：與 §6.3 表逐列對應；海路於 far 亦顯（連通性態勢必要）且非顏色通道於 0.25 仍讀。

### V6D4 — far LOD 保留主幹道＋海路（DoD 核心修正）

**決策**：`applyLodAndCulling` **移除** `this.layers.roads.visible = nearish`（`MapRenderer.ts:727`），改 `this.layers.roads.visible = true` ＋ `this.roadsLayer?.setStage(stage)`。`setStage`：`arterialGfx`/`seaGfx` 恆顯；`minorGfx` `stage!=='far'`；`pathGfx` `stage==='near'`；`bridgeGfx` `stage!=='far'`；並依 stage 倍率重描（V6D3-B）。這是 baseline 改變之主因（far 由「無路」變「主幹道＋海路」）。
既有 nodeMarkers/labels 之 `nearish`/`detail` 判定**不動**（V5 逐項等價語意保留）。

### V6D5 — 道路名標籤（near-only；新增 BitmapText 字串，`fill: ink900`）

**決策**：對每條 `edge.name !== undefined` 之邊，於其多段線**弧長中點**、沿該中點段之**真法線**（偏上）位移 `MAPVIEW.roadLabelOffset = 10` 世界單位，建 `BitmapText`：

```ts
new BitmapText({
  text,
  style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.ink900 },
});
```

**`fill: TOKENS_NUM.ink900` 為硬性（處置 eng-F2）**：Pixi v8 認 `BitmapText.style.fill`（`armyChip.ts:138` 為證）；node label 略此欄故渲染預設色，道路名若循之則落暖底（`landBase`/`plainLight`）不可讀，違 DoD 眼驗收。故 `MapRenderer` **須新增 `import { TOKENS_NUM } from '@ui/styles/tokens'`**（現行僅 import `MAPVIEW`/`FOREST_ALPHA`/`WORLD_SIZE` 於 config）。
落 `labels`(11) 層、存入既有 `labelParts`（`kind` 擴為 `'castle'|'district'|'province'|'road'`，key＝`road:${edgeId}`）、`labelCull` 收錄。LOD：`kind==='road'` 僅 `detail`（stage==='near'）時顯（04 §3.10.3）。
**法線公式（處置 spec-F1／eng-F1）**：段方向角 `a`，取**真法線並偏上**（保證 `⊥` 方向、y 分量為負＝畫面上方）：

```ts
let nx = -Math.sin(a),
  ny = Math.cos(a);
if (ny > 0) {
  nx = -nx;
  ny = -ny;
} // 令 ny<0（世界 y 向下，偏上避 casing）
```

（舊草稿 `nx=-sin,ny=-cos` **非垂直**：與方向 `(cos,sin)` 內積 `=-2 sin·cos≠0`，於 45° 沿路反向、落 casing 上；此為對角 arterial 之實 bug。）
**不加 washi 底板**——與現行 node label 一致；ink900 落暖底＋標籤層在最上，偏移 10 單位避深墨 casing。
**font 影響**：fixture 道路名限 `東海道`（已在 s1560 `roads.json`，受 `tools/subset-font.ts` 掃描）；新增 s1560 arterial 名（如 `中山道`）亦須落 `roads.json`。**Gate 必跑 `font:subset`＋`check-font-coverage`。**

### V6D6 — 橋樑資料模型＝**per-edge 顯示欄位**

**決策**：橋樑為**作者標定之顯示欄位** `bridges?: number[]`（扁平 `[x0,y0,...]` 世界座標，橋面中心點），與 `waypoints` 同路徑流動（`roads.json`→`zRoadEdge`→`roadDisplayLookup`→`MapRoadEdge.bridges`→RoadsLayer）。**不進 canonical `RoadEdge`／`GameState`**（`builder.ts:612` 剝除），不影響 golden。橋面**方位由道路多段線在該點所屬段之方向推導**（`segmentAngleAt`）。
**替代**：(i) 進 `GameState.roads`——被否，違 golden。(ii) 幾何自動偵測——被否，脆弱。
**回寫**：04 §3.4.1 `RoadEdgeData` 增 `bridges?`。

### V6D7 — 橋樑 LOD 與層序

**決策**：`bridgeGfx.visible = stage !== 'far'`（mid/near 顯，並依 stage 倍率重描）。層序見 V6D1（橋面在陸路內線之下）。far 只見主幹道連續線、無橋面細節。

### V6D8 — 命中測試 scale-aware CSS-px 下限（DoD「≥32 CSS px」；**僅城／郡節點**）

**決策**：新增 `MAPVIEW.hitMinCssRadius = 16`（世界→有效半徑下限＝`16/scale`，達 32 CSS px 直徑）。

- 純函式 `hitTestWorldPoint` 新增 `opts.minHitRadius?: number`：**僅**於 **城（castle）與郡（district）**候選之有效半徑套 `max(baseRadius, minHitRadius)`；**軍隊（army）維持固定 `MAPVIEW.hitRadius.army`（不 floor）**（處置 eng-F4：軍隊優先序最高，若於 far 一併放大會吞掉鄰近城/郡的點擊）。缺省（undefined）時三類**行為完全不變**（既有 `interaction.spec` 不傳 → 綠）。
- `MapInteraction` 增 `private scale = 1;`＋`setScale(scale)`；`hitTest` 計 `minHit = MAPVIEW.hitMinCssRadius / this.scale`，傳入 `hitTestWorldPoint(..., { minHitRadius: minHit })`，並**僅擴大節點 query box 半邊**（`max(castleMain, minHit)`）——**軍隊 query box 不動**。
- `MapRenderer.applyLodAndCulling` 每幀 `this.interaction.setScale(camera.scale)`（`interaction` 為 `readonly` 欄位初始化，恆存在，無 null-deref）。
  **理由**：far(0.25) 時 district base 12wu＝3 CSS px 遠不足 32；floor 使 `16/0.25=64wu` 有效半徑。優先序（army>城>郡）與「最近者」不變；軍隊維持原半徑故不吞城/郡點擊。

### V6D9 — fixture／s1560 waypoints 與 bridges 來源（scenario 分派）

**決策**：

- `roadDisplayLookup(scenarioId: string)`（`selectors.ts`，**改為 export**，處置 spec-F6）scenario 分派：`scenarioId === 'debug-visual-map-01'` → 回 `DEBUG_VISUAL_ROAD_DISPLAY`（新葉模組 `src/core/state/debugVisualRoadDisplay.ts`）；否則讀 `s1560/roads.json`。`selectMapStaticModel(state)` 傳 `state.scenarioId`（`gameState.ts:94`）。**MainScreen 無需改**。
- `debugVisualRoadDisplay.ts` 為**純資料葉模組**（僅 import 型別），避免 production selector import 整個 debug fixture（coupling／bundle 汙染）。
- fixture road id 與 s1560 **零重疊**（已驗證），葉模組獨立標定 fixture 座標（§6）。
- s1560：對 **9 條 grade-3 arterial 邊**加 waypoints（順海岸/避山系 mass）＋於跨 terrain.json 河流處加 bridges；grade1/2 短程地方道維持直線。
  **理由**：既有 roadDisplay 管線（M6-V4）延用，最小侵入；view-only、golden 安全。

### V6D10 — `drawRoads` 汰除

**決策**：`mapDraw.ts` 移除 `drawRoads`/`addDashedPath`/`EdgeEndpoints`/`endpointsOf`；`ROAD_GRADE_WIDTH`/`SEA_ROUTE_DASH`（`mapViewConfig.ts`）**由 Slice F 移除**（隨 drawRoads；已驗證消費者僅 `mapDraw.ts`＋`mapDraw.spec.ts`；`pathPreview` 自有 dash 常數 2/8）。`tests/ui/mapDraw.spec.ts` 之 drawRoads 區塊＋**line 14 之 `ROAD_GRADE_WIDTH` import** 移除（處置 eng-F5a），drawSeaBackground/drawNodeMarker 保留。新 `roadsDraw.spec.ts` 承接道路繪製測試。
**理由**：職責移轉；避免兩套道路繪製並存。

### V6D11 — 阻斷道路（阻斷／blocked）**明確延後**

**決策**：V6 **不**實作阻斷道路視覺。理由：(a) roadmap 任務文字與 DoD **未列**阻斷；(b) 阻斷為**動態**狀態（停戰/敵領，08 外交），需新增 `MapViewState` 欄位＋selector＋per-tick dirty 路徑，牴觸 dirty 契約與 view 契約凍結；(c) art-bible §6.3 阻斷列為未來完整內容。**RoadsLayer 之場景部件（單容器、per-tier `Graphics` 於 `setMapData` 建）現無「狀態 dirty」重描入口；未來阻斷落地時須為 `roads` 增狀態 dirty 進入點**（roadmap 層表 18-roadmap.md:406「road data／狀態 dirty」）。回寫 04 §8（原線保留＋斷口＋叉形封印＋原因 tooltip，不只轉紅）。

### V6D12 — 每日刻度／arterial 節點雙短刻 **明確延後**（處置 x4-M3）

**決策**：V6 **不**實作 close LOD 之「每日刻度（per-day tick marks）」與 art-bible §6.3 arterial「節點雙短刻（double short ticks）」。
**理由**：(a) 每日刻度感之 tick 間距若由 `baseDays` 推導、且欲貼合每日行軍距離，最忠實實作須讀 `BAL.roadGradeSpeedMult`（速度→每日世界距離），**使 `src/ui` render 模組 import `@core/balance`**——牴觸「render 常數不進 BAL／不耦合模擬調值」之鐵律（CLAUDE.md）；純幾何近似（等弧長切 N 段）則與「每日」語意脫節、易誤導。(b) DoD 三段 baseline 未列每日刻度為驗收項；V6 頭條為 casing/道級/far 主幹道/海路/道路名/命中/高亮。(c) 與 V6D11 一致採「明確記錄延後」而非靜默丟失（CLAUDE.md「不留 TBD」）。
**未來落地**：每日刻度於 close LOD 沿多段線鋪，其世界間距＝`baseDays` 對應之每日推進距離，屬**顯示衍生自模擬節奏**——落地時應於 `MAPVIEW`／道路 view-model 提供**顯示專用間距常數**或由 selector 預算後以 view-model 欄位傳入 render（避免 render 直 import BAL）。arterial 節點雙短刻可純幾何（節點端沿邊方向兩短垂劃）於同階段補。回寫 04 §8-(9)。

---

## 3. 精確型別與常數變更

### 3.1 `src/ui/map/mapViewConfig.ts`（Slice B）

`MAPVIEW` 內新增（置於 `hitRadius` 之後）：

```ts
/** 命中測試 CSS-px 半徑下限（world 有效半徑＝hitMinCssRadius/scale；達 ~32 CSS px 命中區，04 §3.12.1 DoD）。僅套用於城/郡節點。 */
hitMinCssRadius: 16,
/** 道路名標籤沿道路法線之偏移（world unit，偏上避開 casing；V6D5）。 */
roadLabelOffset: 10,
```

檔尾新增（顏色皆取 `MAP_PALETTE_NUM`，V5 已備；線寬為 **near 基準**，`setStage` 乘 stage 倍率）：

```ts
export const ROAD_CASING_WIDTH: Readonly<Record<1 | 2 | 3, number>> = { 1: 1.5, 2: 2.5, 3: 4 };
export const ROAD_INNER_WIDTH: Readonly<Record<1 | 2 | 3, number>> = { 1: 1.0, 2: 1.2, 3: 2.0 };
export const ROAD_PATH_DASH = { dash: 5, gap: 4 } as const;
export const SEA_ROUTE_KNOT = { dash: 14, gap: 10 } as const;
/** 海路外 halo／內線線寬（world unit，near 基準）；皆 waterRiver 家族（V6D3）。 */
export const SEA_ROUTE_WIDTH = { outer: 3, inner: 1.5 } as const;
/** 海路外 halo 之 alpha（低 alpha 水暈，內線／波節全 alpha）。 */
export const SEA_ROUTE_OUTER_ALPHA = 0.5;
/** 海路週期波節：每 spacing 世界單位一枚半圓弧、半徑 radius（僅落海之段繪製；near 基準）。 */
export const SEA_WAVE = { spacing: 40, radius: 3 } as const;
/** 橋樑幾何（world unit，near 基準）。 */
export const BRIDGE = { deckLength: 16, deckWidth: 9, abutment: 3 } as const;
/** per-stage 線寬倍率（螢幕近似恆定＝1.25/stageScale；V6D3-B）。setStage 乘於所有線寬/節線/波節/橋樑幾何。 */
export const ROAD_STAGE_WIDTH_MULT: Readonly<Record<'far' | 'mid' | 'near', number>> = {
  far: 5,
  mid: 2.5,
  near: 1,
};
```

**移除歸 Slice F**（V6D10）：`ROAD_GRADE_WIDTH`、`SEA_ROUTE_DASH`。Slice B **只新增**。

> 註：`ROAD_STAGE_WIDTH_MULT` 以 inline 字面聯集 `'far'|'mid'|'near'` 為鍵，**不** import `LodStage`（避免 `mapViewConfig` ↔ `lod` 循環依賴，lod 已 import MAPVIEW）。

> 顏色引用（皆已存在，不新增）：casing/橋頭 `MAP_PALETTE_NUM.roadCasing`；arterial 內線 `roadArterial`；minor/path 內線 `roadMinor`；**海路 halo＋內線＋波節 `waterRiver`（河色系，V6D3）**；橋面板 `MAP_PALETTE_NUM.plainLight`；選取高亮 `TOKENS_NUM.accentGold`；道路名 `TOKENS_NUM.ink900`。

### 3.2 `src/data/schemas/road.ts`（Slice A）

`zRoadEdge` 增一欄（置 `waypoints` 之後）：

```ts
bridges: z.array(z.number().int()).optional(), // 橋面中心點扁平 [x,y,...]（偶數長度，validate.ts 檢）；顯示用
```

`RoadEdgeData` 型別隨 `z.infer` 自動含 `bridges?`。

### 3.3 `src/core/state/mapGraph.ts`（Slice A）

`MapRoadEdge` 增：

```ts
/** 橋面中心點（扁平 x,y,...；世界座標）；模擬不使用，roads 層繪製橋樑。來源：roadDisplay。V6 起 RoadsLayer 消費。 */
readonly bridges?: readonly number[];
```

`buildMapGraph` 之 `roadDisplay` 參數型別擴為 `{ name?; waypoints?; bridges? }`；合併邏輯比照 name/waypoints 增 `...(disp.bridges !== undefined ? { bridges: disp.bridges } : {})`；edge 遍歷維持既有**預設 `.sort()`**（見 §4.1 決定論註）。
**註解更新（處置 eng-F5b）**：`mapGraph.ts:39,41` 之 `name`/`waypoints` 註解「V6 起 `drawRoads` 消費」改為「V6 起 **RoadsLayer** 消費」（drawRoads 本階段汰除）。

### 3.4 `src/core/state/selectors.ts`（Slice A）

- `roadDisplayLookup` **改為 `export function roadDisplayLookup(scenarioId: string)`**（處置 spec-F6：測試計畫直接呼叫）；型別擴含 `bridges?`；快取改為 `Map<string, Table>`（依 scenarioId 分快取）。scenario 分派見 V6D9。s1560 分支多讀 `bridges`。
- `selectMapStaticModel(state)` 內：`buildMapGraph(state.castles, state.districts, state.roads, roadDisplayLookup(state.scenarioId))`。

### 3.5 `src/ui/map/interaction.ts`（Slice D）

- `HitTestOptions` 增 `minHitRadius?: number`。
- `hitTestWorldPoint` 內：**僅**城與郡之 `nearestWithinRadius` 之 `radiusOf` 包 floor——
  - 城：`(n) => Math.max(castleTier[n.id]==='main' ? MAPVIEW.hitRadius.castleMain : MAPVIEW.hitRadius.castleBranch, opts.minHitRadius ?? 0)`。
  - 郡：`() => Math.max(MAPVIEW.hitRadius.district, opts.minHitRadius ?? 0)`。
  - **軍隊維持 `() => MAPVIEW.hitRadius.army`（不 floor）**（處置 eng-F4）。
- `MapInteraction` 增 `private scale = 1;`＋`setScale(scale: number): void { this.scale = scale > 0 ? scale : 1; }`；`hitTest` 內 `const minHit = MAPVIEW.hitMinCssRadius / this.scale;` 傳入 `{ minHitRadius: minHit }`，且**僅節點 query box 半邊**改用 `Math.max(<原節點半徑>, minHit)`（**軍隊 query box 不動**），否則遠景城/郡候選被 bucket 查詢漏掉。

### 3.6 `MapRebuildCounts`（`MapRenderer.ts`）

**不變**（`toEqual` 契約）。roads 沿用 `roads` 計數（+1/次 `setMapData`）；道路名沿用 `labels`；橋樑不獨立計數；選取高亮＋`setStage` 重描**不動任何計數**。

### 3.7 `src/ui/map/mapViewTypes.ts`（Slice F，僅註解/文件）

`MapStaticData.graph` 註解（現 `mapViewTypes.ts:103`「本階段 `drawRoads` 仍不消費（V6)」）**更新為「V6：RoadsLayer 消費 name/waypoints/bridges」**（處置 x1-MINOR6）。`MapLayers.roads` 註解補「casing＋內線、waypoints、道級分批、海路、橋面；主幹道 far 保留；per-stage 線寬」。`MapViewState.selection` 註解補「V6 選取高亮消費（相鄰道路金色）」。**無型別變更。**

---

## 4. 新檔規格（完整簽章＋行為）

### 4.1 `src/ui/map/roads/roadsDraw.ts`（Slice C，新檔）

```ts
import { Container, Graphics } from 'pixi.js';
import type { MapGraph, MapRoadEdge } from '@core/state/mapGraph';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import {
  ROAD_CASING_WIDTH,
  ROAD_INNER_WIDTH,
  ROAD_PATH_DASH,
  SEA_ROUTE_KNOT,
  SEA_ROUTE_WIDTH,
  SEA_ROUTE_OUTER_ALPHA,
  SEA_WAVE,
  BRIDGE,
  ROAD_STAGE_WIDTH_MULT,
} from '../mapViewConfig';

export interface RoadsLayer {
  readonly container: Container;
  /** 具名 tier 參考（測試 affordance；z-order 下→上：sea/path/bridge/minor/arterial，穩定契約）。 */
  readonly tiers: {
    readonly sea: Graphics;
    readonly path: Graphics;
    readonly bridge: Graphics;
    readonly minor: Graphics;
    readonly arterial: Graphics;
  };
  /** 切換 LOD 能見度；stage 改變時依 ROAD_STAGE_WIDTH_MULT 重描全 tier（快取 lastStage，未變則早退）。 */
  setStage(stage: LodStage): void;
  destroy(): void;
}
export interface Pt {
  x: number;
  y: number;
}

/** 海路波節「是否落海」判定；true=該點位於海（非任何 land polygon 內）。缺省時全繪。 */
export type SeaTest = (x: number, y: number) => boolean;

/** 邊的多段線頂點（[a.pos, ...waypoints, b.pos]）；端點缺失回 null。 */
export function edgePolyline(edge: MapRoadEdge, graph: MapGraph): Pt[] | null;
/** 多段線弧長中點座標＋該點所屬段角度（rad）；供道路名標籤定位。空/單點回 null。 */
export function polylineMidpoint(
  pts: readonly Pt[],
): { x: number; y: number; angle: number } | null;
/** 在 pts 上找最接近 (px,py) 的段之方向角（rad）；供橋面方位。 */
export function segmentAngleAt(pts: readonly Pt[], px: number, py: number): number;
/** 多段線 stroke（moveTo/lineTo 全點後單次 stroke，round cap/join）。**export 供 Slice E 復用**。 */
export function strokePolyline(
  g: Graphics,
  pts: readonly Pt[],
  width: number,
  color: number,
  alpha?: number,
): void;

/** 建 roads 圖層：依道級/海路分批＋橋樑；build 時**只解析並存多段線幾何、不描繪**，
 *  首次 setStage 產生首描（依 stage 倍率）。seaTest 提供時，海路波節僅於落海之弧節繪製（陸段抑制；spec-F2）。 */
export function buildRoadsLayer(graph: MapGraph, seaTest?: SeaTest): RoadsLayer;
```

**`buildRoadsLayer` 行為**：

- `container` 內含 5 個 `Graphics`，`addChild` 序（下→上）：`seaGfx`, `pathGfx`, `bridgeGfx`, `minorGfx`, `arterialGfx`，同時填入 `tiers`。
- 遍歷 `[...graph.edges.keys()].sort()`（**預設字典序，決定論**；與 `buildMapGraph`／舊 `drawRoads` 一致，處置 eng-F6）；每 key 取 edge，`edgePolyline`，null 則略過。**解析結果（pts＋grade/type＋bridges）存入閉包內部陣列，依 tier 分組**；build 時不呼 stroke。
- `setStage(stage)`：若 `stage === lastStage` **早退**（零重描，守 day-only tick 契約）；否則 `lastStage = stage`，`const m = ROAD_STAGE_WIDTH_MULT[stage]`，對 5 個 `Graphics` 各 `g.clear()` 後依 m 重描：
  - 陸路（`type!=='sea'`）依 `grade`：**先對該級所有邊畫 casing（`strokePolyline(g, pts, ROAD_CASING_WIDTH[grade]*m, roadCasing)`），再畫內線**：grade3/2 實線 `ROAD_INNER_WIDTH[grade]*m`（grade3 roadArterial／grade2 roadMinor）；grade1 節線 `dashedPolyline(g, pts, ROAD_PATH_DASH.dash*m, ROAD_PATH_DASH.gap*m, ROAD_INNER_WIDTH[1]*m, roadMinor)`。
  - 海路 → `seaGfx`：`drawSeaRoute(seaGfx, pts, m, seaTest)`：
    1. 外 halo `strokePolyline(pts, SEA_ROUTE_WIDTH.outer*m, waterRiver, SEA_ROUTE_OUTER_ALPHA)`。
    2. 長節線內線 `dashedPolyline(pts, SEA_ROUTE_KNOT.dash*m, SEA_ROUTE_KNOT.gap*m, SEA_ROUTE_WIDTH.inner*m, waterRiver)`（連續至端點，含岸邊落地段）。
    3. 波節：沿多段線每 `SEA_WAVE.spacing*m` 一點；**若 `seaTest` 提供且 `seaTest(cx,cy)===false`（該點落陸）則跳過此波節**（spec-F2）；否則 `g.arc(cx,cy,SEA_WAVE.radius*m,a,a+Math.PI)`＋`stroke({width:1*m,color:waterRiver})`，`a`＝`segmentAngleAt`。
  - 橋樑 → `bridgeGfx`：對每邊 `edge.bridges` 每對 (x,y) 呼 `drawBridge(bridgeGfx,{x,y},segmentAngleAt(pts,x,y),m)`：橋面 `poly(四頂點, deckLength*m × deckWidth*m).fill({color:plainLight}).stroke({width:1*m,color:roadCasing})`＋兩端橋頭 `fill({color:roadCasing})`。
  - **能見度**：`arterial.visible=true`；`sea.visible=true`；`minor.visible=stage!=='far'`；`path.visible=stage==='near'`；`bridge.visible=stage!=='far'`。（隱藏 tier 仍重描——成本低且保證顯示時即時；亦可對隱藏 tier 跳過描繪以省算，實作自定，spec 只斷言可見 tier 內容＋能見度矩陣。）
- `destroy()`：`container.destroy({ children: true })`。

**內部純繪製輔助**：`strokePolyline`(export)、`dashedPolyline`（逐段沿弧長鋪 dash，跨頂點連續）、`drawSeaRoute`、`drawBridge`。

### 4.2 `src/core/state/debugVisualRoadDisplay.ts`（Slice A，新檔）

```ts
/** visual fixture（scenarioId='debug-visual-map-01'）之道路顯示資料（name/waypoints/bridges，世界座標）。
 *  純資料葉模組（僅供 selectMapStaticModel 之 roadDisplayLookup 分派；不 import 任何 core 系統）。 */
export const DEBUG_VISUAL_ROAD_DISPLAY: Readonly<
  Record<string, { name?: string; waypoints?: readonly number[]; bridges?: readonly number[] }>
> = {
  'road.narumi-sunpu': {
    name: '東海道',
    // narumi(1995,2865) → 沿海岸南緣**避 mt.akaishi.mass**（x2209..2324,y2695..2930）：內部 waypoints 壓 y>2930，
    // 於 akaishi 南麓外側東行，末段方由南逼近 sunpu(2312,2897)（端點逼近段豁免，見 §8.1）。
    waypoints: [2080, 2905, 2170, 2938, 2240, 2946, 2300, 2940],
    bridges: [2205, 2942, 2265, 2944], // 跨 rv.tenryu(x2200..2210,y..2987) / rv.oi(x2258..2279,y..2970)——y~2942 落兩河 y 範圍
  },
  'road.kiyosu-narumi': { waypoints: [1985, 2848] }, // 尾張幹道微彎（無 name，避 §6.1 三重「東海道」）
  'road.sunpu-kakegawa': { waypoints: [2270, 2955], bridges: [2270, 2955] }, // 跨 rv.oi 下游（無 name）
  'road.kakegawa-gifu': {
    // 海路：kakegawa(2226,2953) 南入伊勢／遠州灣水域，沿灣西北上、盡量貼水，
    // 最短陸段接合成內陸港 gifu(1938,2774)（core 固定 type='sea'，不可改；無 name）。
    // 中段 waypoints 須落海（pointInPolygon false）；末段短陸線由 seaTest 抑制波節、僅留連續藍節線。
    // 路徑西行不觸 mt.kiso(x2128..2219)／mt.ibuki(x1817..1908)：x~1940 之末段在兩山之間。
    waypoints: [2200, 2988, 2020, 2984, 1948, 2942, 1942, 2900],
  },
};
```

> 座標為設計建議值；實作 agent 以 `pointInPolygon`（`src/data/map/outlineGeometry.ts`）＋ `terrain.json` mass 驗證：陸路內部 waypoints 落陸且**不落任何 mountain `mass` 多段形**（沿段密取樣，見 §8.1）、海路**中段** waypoints 落海、橋樑點鄰其邊多段線（≤ ~24wu）。`road.narumi-sunpu` 逼近 sunpu 之**末段**、`road.kakegawa-gifu` 逼近 gifu 之**末段**允許落陸/入 mass（合成端點），詳 §8.1。

### 4.3 `src/ui/map/roads/roadHighlight.ts`（Slice E，新檔，**in-scope**）

```ts
import { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import { TOKENS_NUM } from '@ui/styles/tokens';
import { edgePolyline, strokePolyline } from './roadsDraw'; // 依 Slice C 之 export

export interface RoadHighlight {
  readonly container: Container;
  update(props: { graph: MapGraph; selectedNodeId: string | null } | null): void;
  destroy(): void;
}
/** 節點選取時，將其相鄰道路以金色高亮（accentGold, width 5, alpha 0.5）。無選取則清空。 */
export function createRoadHighlight(): RoadHighlight;
```

**行為（處置 x4-m7）**：`update` 讀 `graph.adjacency.get(selectedNodeId)`（型別 `readonly RoadEdgeId[]`——**回傳邊 id 陣列**）→ 對每 `edgeId` 先 `const edge = graph.edges.get(edgeId)`（略過 undefined）→ `edgePolyline(edge, graph)` → `strokePolyline(g, pts, 5, TOKENS_NUM.accentGold, 0.5)`。`selectedNodeId===null`/`props===null` → `g.clear()`。掛於 `selectionAndPath`(9) 層、**在 pathPreview 之下**（路徑預覽在上；掛載方式見 §5.1，用 addChild 先後序、**不用 addChildAt**）。`selectionAndPath` 無 LOD visible gate，故高亮於三段 preset 皆顯（近景最顯）。

---

## 5. 既有檔案修改清單

### 5.1 `src/ui/map/MapRenderer.ts`（Slice F）— 核心整合

**欄位**：移除 `private roadsGfx: Graphics | null`；新增

```ts
private roadsLayer: ReturnType<typeof buildRoadsLayer> | null = null;
private roadHighlight: ReturnType<typeof createRoadHighlight> | null = null;
private prevSelectionKey: string | null = null;
```

**import**：`buildRoadsLayer, edgePolyline, polylineMidpoint, type SeaTest` from `./roads/roadsDraw`；`createRoadHighlight` from `./roads/roadHighlight`；**`TOKENS_NUM` from `@ui/styles/tokens`（新增，供道路名 fill）**。移除 `drawRoads`（保留 `drawNodeMarker, drawSeaBackground, loadOutline`）。

**seaTest 建構**：於 roads 重建時，以 outline 建 `const seaTest: SeaTest = (x,y) => !landPolys.some(p => pointInPolygon(x,y,p));`（`landPolys` 來自 `data.outline ?? loadOutline()`；`pointInPolygon` from `@data/map/outlineGeometry`）。傳入 `buildRoadsLayer(data.graph, seaTest)`。

**`init`（處置 x3-MAJOR：不用 `addChildAt`）**：於現行 `:333` `this.pathPreview = createPathPreview()` **之前**新增，使 roadHighlight 以 plain `addChild` 取得較低 z-order：

```ts
this.roadHighlight = createRoadHighlight();
this.layers.selectionAndPath.addChild(this.roadHighlight.container); // 先加 → 在 pathPreview 之下
this.pathPreview = createPathPreview(); // 既有 :333
this.layers.selectionAndPath.addChild(this.pathPreview.container); // 既有 :334
```

（全樹無 `addChildAt`、mock 亦無；plain `addChild` 依插入序決定 z-order，無需擴充 pixi mock。）

**`buildStaticDataLayers`**：

- 移除 `roadsGfx` 建立/`drawRoads`/`data===null` 清 `roadsGfx.clear()`。
- roads 重建：

```ts
if (this.roadsLayer) { this.layers.roads.removeChild(this.roadsLayer.container); this.roadsLayer.destroy(); this.roadsLayer = null; }
if (data === null) { /* 既有 node/label 清理 */ this.roadHighlight?.update(null); this.prevSelectionKey = null; return; }
const seaTest: SeaTest = /* 見上 */;
this.roadsLayer = buildRoadsLayer(data.graph, seaTest);
this.layers.roads.addChild(this.roadsLayer.container);
this.roadsLayer.setStage(this.lodStage);   // 首描
this.prevSelectionKey = null;               // 處置 x3-staleness：graph swap 後強制下次 updateView 重算高亮
this.rebuildCounts.roads += 1;              // 維持一次
```

- **道路名標籤**：於 node-label 迴圈之後、province-label 迴圈之前，新增（**排序統一為預設 `.sort()` on keys**，處置 eng-F6）：

```ts
for (const edgeId of [...data.graph.edges.keys()].sort()) {
  const edge = data.graph.edges.get(edgeId)!;
  if (edge.name === undefined) continue;
  const pts = edgePolyline(edge, data.graph);
  if (pts === null) continue;
  const mid = polylineMidpoint(pts);
  if (mid === null) continue;
  let nx = -Math.sin(mid.angle),
    ny = Math.cos(mid.angle); // 真法線
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  } // 偏上
  const lx = mid.x + nx * MAPVIEW.roadLabelOffset,
    ly = mid.y + ny * MAPVIEW.roadLabelOffset;
  const id = `road:${edgeId}`;
  activeLabels.add(id);
  let part = this.labelParts.get(id);
  if (part === undefined) {
    const label = new BitmapText({
      text: edge.name,
      style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.ink900 },
    });
    label.position.set(lx, ly);
    this.layers.labels.addChild(label);
    part = { label, kind: 'road' };
    this.labelParts.set(id, part);
  }
  part.label.text = edge.name;
  part.label.position.set(lx, ly);
  this.labelCull.upsert(id, lx, ly);
  this.rebuildCounts.labels += 1;
}
```

（`labelParts` value `kind` 型別擴 `'road'`；既有 stale 清理迴圈以 `activeLabels` 涵蓋 road label id，自動移除。）

**`applyLodAndCulling`**：

- labels 迴圈 `lodVisible` 擴：

```ts
const lodVisible =
  part.kind === 'province'
    ? !nearish
    : part.kind === 'road'
      ? detail
      : nearish && ((part.kind === 'castle' && mainCastle) || detail);
```

- **移除** `this.layers.roads.visible = nearish;`（`:727`），改：

```ts
this.layers.roads.visible = true;
this.roadsLayer?.setStage(stage); // stage 未變則內部早退（零重描）
this.interaction.setScale(camera.scale); // V6D8：命中 CSS-px 下限
```

**`updateView`**：於 `redrawMilitaryObjects()` 之前新增選取高亮 dirty：

```ts
const selKey = view.selection !== null && view.selection.kind === 'node' ? view.selection.id : null;
if (selKey !== this.prevSelectionKey) {
  this.prevSelectionKey = selKey;
  if (this.staticData !== null)
    this.roadHighlight?.update({ graph: this.staticData.graph, selectedNodeId: selKey });
}
```

（**不動 `rebuildCounts`**；day-only 變更 selKey 不變 → 不重畫，守 dirty 契約。graph swap 後 `prevSelectionKey` 已於 `buildStaticDataLayers` 重設為 null → 下次 updateView 必重算，杜絕陳舊高亮，處置 x3-staleness。）

**`setMapData`**：`data===null` 之處理由 `buildStaticDataLayers` 涵蓋（上）；非 null 亦重設 `prevSelectionKey=null`（上）。

**`destroy`**：`app.destroy` 之前新增

```ts
if (this.roadsLayer) {
  this.roadsLayer.container.parent?.removeChild(this.roadsLayer.container);
  this.roadsLayer.destroy();
  this.roadsLayer = null;
}
this.roadHighlight?.destroy();
this.roadHighlight = null;
this.prevSelectionKey = null;
```

移除 `this.roadsGfx = null`。V5 territory/relief/forest 銷毀序**不動**。

### 5.2 `src/ui/map/mapDraw.ts`（Slice F，V6D10）

移除 `drawRoads`、`addDashedPath`、`interface EdgeEndpoints`、`endpointsOf`、`SEA_ROUTE_DASH`/`ROAD_GRADE_WIDTH` import。保留 `loadOutline`/`drawSeaBackground`/`drawNodeMarker`/`drawNodeMarkers`/`regularPolygon`/`ownerColor`。

### 5.3 `tests/ui/mapDraw.spec.ts`（Slice F）

移除 `drawRoads` 相關 describe/it，**並移除 line 14 之 `ROAD_GRADE_WIDTH` import token**（處置 eng-F5a／x2-MINOR：否則 no-unused-vars 使 lint 紅；改為 `import { MAPVIEW, WORLD_SIZE } from ...`，且移除 `drawRoads` 於 import 行）。保留 drawSeaBackground/drawNodeMarker 測試。

### 5.4 `src/ui/map/MapCanvasHost.spec.tsx`（Slice F）

- line 396 `layers.roads.children.length` **維持 `toBe(1)`**（V6D2）；it 標題可微調（「roads 建立 RoadsLayer 子容器」）。`soloGraph()` 零 edge → RoadsLayer container 為唯一 child、無道路名（labels 仍 `toBe(2)`，line 398 不動；已驗證，處置 x2/x3「open Q1」——保持 fixture roads 無 name 即自動成立）。**不需擴充 pixi mock**（roadHighlight 以 plain `addChild` 掛載，見 §5.1）。

### 5.5 `src/ui/map/mapRendererDirty.spec.ts`（Slice F，擴充）

既有斷言**不改值**（roads=1、day-only 零增量、owner 翻轉計數）。新增 §8.2 之 describe。dirty-spec 之 `makeGraph` 可加**一條具 name 的邊＋一條 grade-3 邊**於新 case 專用 graph（不動既有 baseline case，line 178 fixture 無 name → 無道路名，既有計數不破；既有 fixtureGraph 為 grade1，故 far-arterial case 須自建含 grade3 之 graph，處置 x3-obs）。

### 5.6 `src/app/visualMapBoot.ts`（Slice F）— fixture 選取改節點（處置 spec-F4）

`visualMapBoot.ts:56` 現為 `uiStore.getState().actions.setSelection({ kind: 'army', id: marching.id })`。**改為**：

```ts
uiStore.getState().actions.setSelection({ kind: 'castle', id: VISUAL_ANCHOR_CASTLE_ID });
```

使 fixture 預選駿府本城（相機錨點），`composeMapViewState` 映為 `selection={kind:'node',id:sunpu}`，`roadHighlight` 於三段 baseline 點亮其相鄰道路（`road.narumi-sunpu` 東海道 arterial＋`road.sunpu-kakegawa`）金色，**在截圖直接驗證 Slice E**。**golden 安全**（selection 走 UI store，非 `GameState`）。

- **選取仍滿足 M6-V DoD「3 秒內辨識當前選取」**：本城金色高亮＋相鄰道路金線比原軍隊選取更契合 V6 主題。軍隊之敵我/方向辨識不依賴其被選取，DoD 軍隊項不受影響。
- 若既有 `visualMapBoot.spec` 斷言選取 id/kind，須同步更新（Slice F 擁有）。

### 5.7 `src/core/state/selectors.ts`／`mapGraph.ts`／`road.ts`／`validate.ts`／`debugVisualRoadDisplay.ts`／`roads.json`

見 §3.2–§3.4、§4.2、§6。`validate.ts:667` 之 waypoints 偶數檢下方新增 bridges 偶數檢：

```ts
if (r.bridges !== undefined && r.bridges.length % 2 !== 0) {
  v.push(err('V5', `街道 ${r.id} bridges 長度非偶數（${r.bridges.length}）`, [r.id]));
}
```

---

## 6. 內容／資料規格

### 6.1 visual fixture 道路顯示（`debugVisualRoadDisplay.ts`；DoD 三 baseline 之來源）

fixture 節點（`debugVisual.ts` 驗證）：kiyosu 1966,2838；narumi 1995,2865；sunpu 2312,2897；kakegawa 2226,2953；gifu 1938,2774。terrain.json（已驗證）於此區有 **mt.akaishi.mass x[2209..2324] y[2695..2930]**、mt.kiso x[2128..2219]、rv.tenryu(x2200..2210,y..2987)／rv.oi(x2258..2279,y..2970)、伊勢/遠州灣口 ~y2920+。

- **`road.narumi-sunpu`（grade3, 東海道）**：waypoints **內部點壓 y>2930 走 akaishi mass 南麓外側**（不落 mass 多段形）；bridges 於跨 rv.tenryu／rv.oi 處（y~2942 落兩河 y 範圍）。sunpu 本身落 akaishi bbox 內——**末段（末 waypoint→sunpu）之逼近段落 mass 為不可避、豁免**（§8.1 只驗內部段）。far/mid baseline 主角（彎曲金色主幹道，per-stage 線寬使 0.25 亦讀）；選取駿府後此邊金色高亮。**唯此 fixture 邊帶 `name`**（處置 x1-MINOR4：避免相鄰三邊皆「東海道」之重複標籤）。
- **`road.kakegawa-gifu`（sea）**：waypoints 沿灣水域西北上、貼水至最接近 gifu 之灣頭；**中段點須落海**（`pointInPolygon` false）；終點段允許短陸段（gifu 為合成內陸港，core 固定 `type='sea'`，不可改）。展示海路長節線＋波節（**波節僅落海**）、形狀異於陸路。**此為 demo-only 例外**（處置 x4-m6）：04 §3.4.3「海路端點須為 `isPort` 郡」對 s1560 由 `validate.ts:658` 把關，但 code fixture（`debugVisual.ts`）端點為城、且 gifu 非真沿海——**係承襲既有 fixture、僅供海路線型 demo，不代表真實地理**；於 `debugVisualRoadDisplay.spec` 註記為刻意 demo 例外，不擴散至 s1560。
- 其餘 fixture 地方道（grade1/2）**不加** waypoints；`road.kiyosu-narumi`/`road.sunpu-kakegawa` **無 name**。
- **道路名限 `東海道`**（已在 s1560 roads.json，font 掃描涵蓋）。

### 6.2 s1560 arterial waypoints／bridges（`roads.json`；真實遊戲，非 baseline-tested）

對 **9 條 grade-3 邊**以 `lonLatToWorld` 依公有領域地理推導 waypoints（4–8 點順海岸/避 §terrain.json 山系 mass），並於跨 terrain.json 主要河流（rv.kiso/rv.tenryu/rv.oi/rv.yodo）處加 bridges。所有陸路**內部** waypoints `pointInPolygon(japan-outline)` 為 land **且不落任何 mountain mass 多段形**（§8.1 spec 驗，處置 x4-M2／x2-M2）、bridges 鄰近其邊多段線。grade1/2 不強制。可為 1–2 條近畿 arterial 加 `name`（如 `中山道`，須落 roads.json 受 font 掃描）。**s1560 arterial 之 waypoint/bridge 為真實遊戲內容、非 DoD baseline 截圖來源**，DoD 驗證場僅 fixture（§6.1）——但 §8.1 之 `pointInPolygon`＋mass-avoidance 斷言**同時覆蓋 s1560 arterial 與 fixture**，使「無穿山／穿海」有自動 gate（不只眼驗，處置 x2-M2）。

### 6.3 繪製幾何總表（world unit，**near 基準**；`setStage` 乘 stage 倍率 far×5/mid×2.5/near×1，螢幕近似恆定）

| 元件                  | 幾何(near)                                                                | 螢幕近似(全段)                          | 顏色                                   | LOD                    |
| --------------------- | ------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------- | ---------------------- |
| 主幹道 casing / 內線  | 多段線 4 / 2.0 實線 round                                                 | ~5px / ~2.5px                           | roadCasing / roadArterial              | far/mid/near           |
| 次道 casing / 內線    | 2.5 / 1.2 實線                                                            | ~3.1px / ~1.5px                         | roadCasing / roadMinor                 | mid/near               |
| 小路 casing / 內線    | 1.5 / 1.0（dash5/gap4）                                                   | ~1.9px / ~1.25px                        | roadCasing / roadMinor                 | near                   |
| 海路 外halo/內線/波節 | 3(α0.5) / 1.5(dash14/gap10) / 半圓 r3 每 40（僅落海）                     | ~~3.75px / ~~1.9px / r~~3.75px 每~~50px | **waterRiver（三者同色）**             | far/mid/near           |
| 橋面/橋頭             | 16×9 矩形沿路 / 兩端 9×3                                                  | ~20×11px / ~11×3.75px                   | plainLight+roadCasing描邊 / roadCasing | mid/near               |
| 道路名                | BitmapText 12px（螢幕字級，不隨 scale），中點真法線偏 10，**fill ink900** | 12px                                    | ink900                                 | near                   |
| 選取高亮              | 相鄰邊多段線 stroke 5（world；不隨 stage 倍率——見註）                     | 隨 scale                                | accentGold                             | 任意（動態；三段皆顯） |

> 註：選取高亮沿用固定世界寬 5（於 pathPreview 同層、與其一致，隨 scale 縮放），於 far 0.25＝1.25px——仍疊在主幹道之上為金色暈，near 最顯；DoD「辨識當前選取」以三段皆金線＋本城金色滿足，不強制 per-stage 恆定（如審查後嫌 far 太細，可比照 V6D3 於 highlight 亦乘倍率，屬 Slice E 可選微調）。

---

## 7. 切片分解與整合序（檔案擁有權嚴格互斥）

### Slice B — config 常數（**最先**，純新增）

**擁有**：`src/ui/map/mapViewConfig.ts`（§3.1，只新增）。
**契約產出**：`ROAD_CASING_WIDTH`/`ROAD_INNER_WIDTH`/`ROAD_PATH_DASH`/`SEA_ROUTE_KNOT`/`SEA_ROUTE_WIDTH`/`SEA_ROUTE_OUTER_ALPHA`/`SEA_WAVE`/`BRIDGE`/`ROAD_STAGE_WIDTH_MULT`/`MAPVIEW.hitMinCssRadius`/`MAPVIEW.roadLabelOffset`。**不移除** `ROAD_GRADE_WIDTH`/`SEA_ROUTE_DASH`（移除歸 Slice F）。
**驗收**：`npm run typecheck`。

### Slice A — 資料／schema／core view 分派

**擁有**：`src/data/schemas/road.ts`、`src/data/scenarios/s1560/roads.json`、`tools/validate.ts`、`src/core/state/mapGraph.ts`（+`bridges`＋註解更新）、`src/core/state/selectors.ts`（`roadDisplayLookup` **export**＋分派）、`src/core/state/debugVisualRoadDisplay.ts`（新）、`tests/data/roadsDisplay.spec.ts`（新）、`src/core/state/debugVisualRoadDisplay.spec.ts`（新）。
**契約產出**：`MapRoadEdge.bridges`；**exported** `roadDisplayLookup(scenarioId)`；`DEBUG_VISUAL_ROAD_DISPLAY`；roads.json arterial 顯示資料。
**驗收**：`npm run validate:data`；`npm run test:core`（golden **未變**、buildMapGraph 合併 bridges、fixture id⊂roads、name⊂roads.json names、pointInPolygon 陸/海健全、**mass-avoidance 斷言**）；`npm run typecheck`。

### Slice C — roads 繪製

**擁有**：`src/ui/map/roads/roadsDraw.ts`（新）、`src/ui/map/roads/roadsDraw.spec.ts`（新）。
**依賴**：Slice B、Slice A。
**契約產出**：`buildRoadsLayer(graph, seaTest?)`（回 `{container, tiers, setStage, destroy}`）/`edgePolyline`/`polylineMidpoint`/`segmentAngleAt`/**`strokePolyline`（export）**/`SeaTest`/`RoadsLayer`。
**驗收**：`roadsDraw.spec` 全綠（見 §8.1，**含自備 recording pixi mock**）；`npm run test:ui`。

### Slice D — 命中 CSS-px 下限

**擁有**：`src/ui/map/interaction.ts`（§3.5）、`src/ui/map/interaction.spec.tsx`＋`tests/ui/interaction.spec.ts`（擴充，既有不改）。
**依賴**：Slice B（`MAPVIEW.hitMinCssRadius`）。
**驗收**：既有命中測試綠（不傳 minHitRadius）；新 floor case 綠（含「軍隊不 floor」case）。

### Slice E — 選取道路高亮（**in-scope**）

**擁有**：`src/ui/map/roads/roadHighlight.ts`（新）、`src/ui/map/roads/roadHighlight.spec.ts`（新）。
**依賴**：**Slice C（`edgePolyline`/`strokePolyline` export）——必須待 C export 凍結後開工**（處置 eng-F5c：E import C，非真並行）、Slice A（graph）。
**驗收**：`roadHighlight.spec` 綠。

### Slice F — 整合器（**最後**）

**擁有**：`src/ui/map/MapRenderer.ts`、`src/ui/map/mapDraw.ts`（移除 drawRoads＋移除 B 之過時常數）、`src/ui/map/mapViewTypes.ts`（註解，含 :103 過時 drawRoads 註解修正）、`src/app/visualMapBoot.ts`（fixture 選取改節點）、`tests/ui/mapDraw.spec.ts`（移除 drawRoads 測＋line 14 import）、`src/ui/map/MapCanvasHost.spec.tsx`、`src/ui/map/mapRendererDirty.spec.ts`、`src/app/visualMapBoot.spec.ts`（若有選取斷言）。
**依賴**：B/A/C/D/E 全部。
**驗收**：`npm test` 全綠；`npm run build`；`npm run e2e`（舊 baseline 失敗＝預期）。

### 整合序

`B`（純新增常數）→ `A`（資料/schema/core 分派）→ `C` → （`E` 待 C export 凍結後）`‖` `D` → `F`（整合、移除 drawRoads/過時常數、接線、fixture 選取、整合測試、baseline）。
（D 可與 C/E 並行；**E 嚴格在 C 之後**。）

---

## 8. 測試計畫

### 8.1 純模組單測

| 測試檔（擁有者）                                                | 覆蓋                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/data/roadsDisplay.spec.ts`（A）                          | zod bridges optional／偶數；`validate.ts` bridges 奇數報 V5；roads.json arterial waypoints 偶數＋**內部點落陸且不落任何 terrain.json mountain mass 多段形（沿段密取樣 pointInPolygon，處置 x4-M2/x2-M2）**＋bridges 鄰邊；`roadDisplayLookup('s1560')` 含 waypoints/bridges、`roadDisplayLookup('debug-visual-map-01')`===`DEBUG_VISUAL_ROAD_DISPLAY`；`buildMapGraph` 併入 bridges                                                                                                                                                                                                                                                                                                                      |
| `debugVisualRoadDisplay.spec.ts`（A）                           | 每 key ∈ fixture roads（比對 `debugVisual` road id 集）；waypoints/bridges 偶數；陸路**內部** waypoints 落陸**且不落 mountain mass**（末段逼近段豁免：`road.narumi-sunpu` 末 waypoint→sunpu、`road.kakegawa-gifu` 末陸段）、`road.kakegawa-gifu` **中段** waypoints 落海（pointInPolygon false）；bridges 點鄰其邊多段線 ≤24wu；**每個 `name` ∈ `s1560/roads.json` 之道路 name 集**（font-subset 安全，處置 spec-F7／eng-F3——`debugVisualRoadDisplay.ts` 為 `.ts` 未受 font-charset 掃描，此斷言確保無新字漏入子集）；**kakegawa-gifu demo-only 例外註記**（處置 x4-m6）                                                                                                                                 |
| `roadsDraw.spec.ts`（C，**自備 recording pixi mock**，見 §8.3） | `edgePolyline`（waypoints 展開、缺端點回 null）；`polylineMidpoint` 弧長中點＋角度；**道路名法線 ⊥ 方向之 case（含 a=45°，斷言偏移向量與段方向內積≈0 且 y 分量<0，處置 spec-F1／eng-F1）**；`buildRoadsLayer`：grade→正確具名 tier、casing 先於內線、casing 寬>內線寬、casing 色=roadCasing；grade1 內線 dash；**海路 halo/內線/波節皆 waterRiver（無 reliefInk）**；**seaTest 回 false 之點不生波節 arc**（處置 spec-F2）；橋樑＝poly＋2 橋頭；`setStage` visible 矩陣（以具名 `tiers` 斷言，處置 x1-MINOR7）；**`setStage('far')` 之 casing 描繪寬＝ROAD_CASING_WIDTH[3]×5（per-stage 倍率，處置 x2-M1/x4-M1）；`setStage(same)` 早退不重描（`clear` 呼叫數不增）**；**edge id 預設 `.sort()` 決定論** |
| `roadHighlight.spec.ts`（E）                                    | 選取節點 → **`adjacency` 回邊 id → `edges.get` → 多段線 stroke gold**（處置 x4-m7）；null → clear；重複同 id idempotent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| interaction floor（D）                                          | `hitTestWorldPoint` 傳 `minHitRadius=64`：base12 district 於 40wu 命中（無 floor 不中）；**army 不受 floor（傳大 minHitRadius 時 army 半徑仍 16、不吞鄰近城/郡）**（處置 eng-F4）；不傳 minHitRadius → 既有行為；`MapInteraction.setScale(0.25)` → **節點** query box 半邊 ≥64、遠距小節點命中，army query box 不變                                                                                                                                                                                                                                                                                                                                                                                      |

### 8.2 `mapRendererDirty.spec.ts` 擴充（F）

新 `describe('roads／道路名／橋樑／選取高亮（M6-V6）')`：

- **靜態建構＋正向存在**：含具 `name`('東海道')＋waypoints＋bridges＋**grade-3 邊** 之 graph → `setMapData`：`layers.roads.children.length===1`、其 container 子 Graphics ===5、`labels` 含 `road:<edgeId>`（`text==='東海道'`）——堵靜默無路/無名。
- **roads 靜態化＋setStage 不動計數**：首 `setMapData` → `rebuildCounts.roads===1`；後續 `updateView`（含只 `day` 變、stage 不變）連跑 30 日 → `roads`/`labels` 零增量、`roadsLayer` 參考不變、**`arterialGfx.clear` 呼叫數不增（stage 未變、setStage 早退）**。
- **far 主幹道可見＋per-stage 重描**：`setCameraPose(center,0.25)` 後 `roadsLayer.tiers.arterial/sea` `visible===true`、minor/path `false`（DoD 單元證明）；stage 由 near→far 時 arterial 有重描（`clear` 呼叫數 +1）。
- **選取高亮 dirty（Slice E）**：selection null→node → `roadHighlight` 重畫（spy）；再 day-only `updateView` → 不重畫；graph swap（`setMapData` 非 null）後 selection 不變 → 下次 updateView 仍重算（prevSelectionKey 已重設）；`rebuildCounts` 全程不變、`MapRebuildCounts` 5 欄位 `toEqual` 成立。

### 8.3 jsdom 可測/不可測

- **可測（mock 下）**：RoadsLayer 結構/具名 tier/子 Gfx 數、繪製指令序、`setStage` visible＋per-stage 描繪寬＋早退、道路名 label 存在＋fill＋LOD、命中 floor 純函式（含 army 豁免）、選取高亮 dirty、`rebuildCounts` 不變、`children.length===1`。
- **不可測**：線條外觀/交叉口連通/橋面美感/道路名對比/海路波節落海與否之視覺 → e2e baseline 人工核（§9.3）。
- **pixi mock（處置 x2-MINOR）**：`MapCanvasHost.spec`/`mapRendererDirty.spec` 沿用其既有 inline/shared mock（含 `addChild`、`clear/rect/poly/circle/arc/moveTo/lineTo/fill/stroke`；roadHighlight 用 plain `addChild` 無需 `addChildAt`）。**惟 `roadsDraw.spec.ts` 需自備 recording mock**（`vi.mock('pixi.js')` 錄 `new Container/Graphics` 及各繪製方法之呼叫序）——共用 `tests/helpers/pixiMock.ts` 之 Graphics **不記錄呼叫**，無法斷言「casing 先於內線」「per-stage 寬」等呼叫序/引數，須比照 `terrainDraw.spec.ts` 之自備錄製 mock 模式。

---

## 9. Gate 清單與 baseline 程序

### 9.1 orchestrator gate 指令序（plan/18 §3.13）

```
npm run typecheck
npm run lint
npm run validate:data      # roads.json waypoints/bridges 偶數＋zod＋簡體字＋道路名
npm run font:subset        # 道路名新字體（東海道之字）納入子集
npm run check-font-coverage # 涵蓋率綠
npm test                   # 全 vitest（core golden 未變＋ui roads/dirty/interaction/highlight）
npm run build
npm run e2e                # build＋Playwright smoke；舊 baseline 視覺失敗＝預期
# 確認 roads/橋樑/道路名/命中/高亮顯示無誤後，單獨更新視覺 baseline：
npm run e2e:visual:update  # darwin
```

**禁**：`npm run golden:update`。**不需** gen:assets／validate:assets（V6 無新素材）。

### 9.2 baseline 再生（darwin＋linux）

- darwin：`npm run e2e:visual:update`。
- linux（CI parity）：docker `mcr.microsoft.com/playwright:v1.61.1-noble` 掛載 repo 跑同指令再 in-container 確認。
- 檔：`e2e/visual.spec.ts-snapshots/strategy-{overview,operational,close}-chromium-{darwin,linux}.png`。
- **獨立 commit**（plan/17 §3.9.3.1），附 before/after＋art-bible §6.3 條目＋reviewer 核准。

### 9.3 眼驗收（提交 baseline 前）

1. **far(0.25)**：主幹道（金色寬線＋深墨 casing，**per-stage 倍率使 casing ~5px／內線 ~2.5px、明確可見非髮絲**）＋海路（藍長節線＋波節，**~3.75px halo／波節可辨**）**可見**；次道/小路/道路名/橋樑**不顯**；主幹道**彎曲**順海岸、**無直線或曲線穿 mt.akaishi.mass／穿海**（內部段避 mass，僅 sunpu 逼近末段入 mass 屬合成端點）；**選取本城相鄰之東海道呈金色高亮**。（可對 `roadsDraw.spec` far casing 寬斷言交叉印證，非純眼驗——處置 x2-M1/x4-M1。）
2. **mid(0.5)**：＋次道＋橋樑；仍無道路名；三道級以線寬/線型可辨；**海路波節僅落於灣水域，`road.kakegawa-gifu` 逼近 gifu 之短陸段僅見連續藍節線、無波節鋪陸**（合成內陸港終點段，接受一小段陸上藍線）。
3. **near(1.25)**：＋小路（短節線）＋道路名（東海道，**ink900 深字可讀**、無被 casing 蓋、**fixture 僅一枚東海道無三重疊**）＋橋樑細節；海路全程形狀異於陸路；選取金色高亮明顯。
4. **色弱/灰階**：三道級＋海路**不只靠顏色**（線寬＋單線/節線＋波節，**三段皆讀得**）；橋樑非圓點；選取為金色雙重描邊感（非升飽和）。
5. **命中**（互動核，非截圖）：far 時小郡節點 hover/tap 仍作用（≥32 CSS px）；**軍隊命中不因 floor 擴大而吞鄰近城/郡**。
6. **無回歸**：V5 地形/水系/領地/relief/forest 顯示不變；StrictMode 重掛地形仍在；zoom 連續縮放無明顯 setStage 重描閃爍（stage 內死區）。
7. **1280×720 預設視角無 label 全重疊**（道路名 near-only，預設視角隱藏）。

---

## 10. plan §8 回寫草稿

於 `plan/04-map-and-movement.md` §8.1 末新增（**不改 §00**）：

> **2026-07-17（[M6-V6] 道路／橋樑）**：依 §3.4／§3.10 落地 `roads`(5) 完整內容與三級 LOD：
> (1) **道路分批＋casing/內線＋道級線型＋per-stage 螢幕不變線寬**：`roads` 層放單一 RoadsLayer 子容器（sea/path/bridge/minor/arterial 五 `Graphics`，下→上），每級 casing 先於內線。道級線型以線寬＋線型共同編碼（§3.3）。線寬以 near 為基準、`setStage` 乘 stage 倍率（far×5/mid×2.5/near×1）重描，使螢幕外觀跨三 preset 近似恆定——**修正固定世界線寬於 overview 0.25 呈次像素、arterial/海路辨識通道失效之缺陷**。顏色取 M6-V5 已落 `MAP_PALETTE_NUM`。**海路全走河色系（`waterRiver` 之外 halo＋長節線＋波節）**——art-bible §6.3「deep-sea-blue outer line」因本專案全畫布海底即 `seaDeep`，深墨/深藍外線於海上不可見且海路穿海不需護邊，故以 `waterRiver` 家族（§3.2「海路使用河色家族」）忠實實現，切齊色弱形狀通道。
> (2) **far 保留主幹道＋海路（修正 M6-V5 `roads.visible=nearish` 整層隱）**：`setStage` 使 arterial/sea 恆顯、minor mid 起、path/道路名 near、bridge mid 起——落實 §3.10.3 與 V6 DoD。setStage 重描屬 LOD 轉場（相機縮放時本就重跑），非 tick、不動 rebuildCounts、stage 未變早退，dirty 契約不破。
> (3) **waypoints 多段線**：`MapRoadEdge.waypoints` 由 RoadsLayer 消費為多段線，缺省退回兩端點直線；杜絕端點直線穿山越海。內部 waypoints 避 terrain.json mountain mass（spec pointInPolygon 密取樣把關），僅合成端點之短逼近段豁免。**海路波節僅於落海之弧節繪製**（`pointInPolygon` 判定），合成內陸港終點段之短陸線僅保留連續藍節線。
> (4) **橋樑＝顯示欄位 `bridges?`（新增 §3.4.1 RoadEdgeData 欄位）**：作者標定橋面中心點，繪為橋面矩形＋兩端橋頭（非圓點），方位由道路段方向推導。與 name/waypoints 同為顯示欄位，canonical `RoadEdge`／`GameState` 刻意不含（`builder` 剝除），不進 stateHash／golden。
> (5) **道路名標籤**：`edge.name` 於多段線弧長中點**真法線**偏移建 `BitmapText`（`fill: ink900`，near-only，落 labels 層隨既有 LOD/cull）。新字體字串經 `font:subset`。
> (6) **命中 CSS-px 下限**：`MAPVIEW.hitMinCssRadius=16`，`hitTestWorldPoint` 城/郡有效半徑＝`max(base, 16/scale)`，遠景小節點仍 ≥32 CSS px 可點（§3.12.1 DoD）；**軍隊維持固定半徑不 floor**（保優先序，避免遠景吞鄰近城/郡點擊）。**街道邊仍不可點擊**（§3.12.1 硬規則），DoD「小路可命中」係經其端點所屬**郡節點**之命中下限實現（系統文件 §3.12.1 優先於 roadmap DoD 措辭）。
> (7) **fixture／s1560 顯示資料 scenario 分派**：`roadDisplayLookup(scenarioId)`（export）分派 s1560 與 debug-visual（`debugVisualRoadDisplay.ts` 純資料葉模組）；`selectMapStaticModel` 傳 `state.scenarioId`。fixture 選取由軍隊改為 `VISUAL_ANCHOR_CASTLE_ID`（駿府），使選取相鄰道路金色高亮入三段 baseline（selection 走 UI store，golden 安全）。fixture 海路 `road.kakegawa-gifu` 為 demo-only 例外（端點為城、gifu 非真沿海，承襲既有 fixture，僅示線型，不擴散 s1560）。
> (8) **阻斷道路延後**：V6 不實作阻斷（動態狀態，牴觸 roads 靜態 dirty 契約與 view 契約凍結；roadmap/DoD 未列）。未來視覺契約：原線保留＋斷口＋叉形封印＋原因 tooltip（不只轉紅），須先於 `MapViewState` 增動態欄位、並為 `roads` 場景部件增「狀態 dirty」重描入口。
> (9) **每日刻度／arterial 節點雙短刻延後**：V6 不實作 close LOD 每日刻度與節點雙短刻。每日刻度最忠實實作須讀 `BAL.roadGradeSpeedMult`（每日推進距離），牴觸「render 不 import BAL」鐵律；純幾何近似與「每日」語意脫節。未來落地應由 selector 預算間距後以 view-model 欄位傳入 render（不使 render 直依 BAL），節點雙短刻可純幾何補。DoD 未列此項為驗收。
> 依據：M6-V6 技術設計（B config／A 資料·core／C roads 繪製／D 命中／E 選取高亮／F 整合）；CLAUDE.md 鐵律①②；`test:core` golden/replay/determinism 全綠（stateHash 未變）；baseline 更新獨立 commit。

---

## 11. Commit 計畫（整合序 B→A→C→E/D→F，每則帶 `[M6-V6]`）

1. `feat(map): M6-V6 道路繪製常數（道級線寬/海路節線/橋樑幾何/per-stage 倍率/命中下限）[M6-V6]`（Slice B）。
2. `feat(data): M6-V6 roads bridges schema、s1560 arterial waypoints/橋樑(避 mass)、fixture 道路顯示分派（roadDisplayLookup export）[M6-V6]`（Slice A）。
3. `feat(map): M6-V6 RoadsLayer 多段線 casing/內線/海路(波節落海)/橋樑繪製＋per-stage 重描 [M6-V6]`（Slice C）。
4. `feat(map): M6-V6 命中測試 CSS-px 下限（城/郡；軍隊豁免）[M6-V6]`（Slice D）。
5. `feat(map): M6-V6 節點選取相鄰道路金色高亮 [M6-V6]`（Slice E，待 C export 凍結）。
6. `feat(map): M6-V6 roads 層接線／far 主幹道／道路名(ink900)／fixture 選取節點／汰除 drawRoads [M6-V6]`（Slice F）。
7. `test(visual): 更新 M6-V6 三段 baseline（主幹道／海路／橋樑／道路名／選取高亮）[M6-V6]`（**獨立** baseline commit）。
8. `docs(plan): 回寫 04 §8 M6-V6 設計決策 [M6-V6]`（§10 草稿）。

（3 → 5；4 可並行；1 早於 2 之型別依賴；baseline(7)＋plan 回寫(8) 獨立。font:subset 隨 commit 6 或獨立 `chore(font)`。）

---

## 12. 風險與回滾

| 風險                                                | 影響                                     | 緩解／回滾                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `roads.visible` 恆顯破 V5「逐項等價」               | far baseline 改變                        | **刻意**（DoD 核心）；baseline 獨立更新；§8.2 far arterial 可見單元證明。（已驗證無 `roads.visible` 測試斷言，翻 true 不破既測。）              |
| 固定世界線寬於 0.25 呈次像素                        | overview arterial/海路辨識失效、DoD 不過 | **per-stage 倍率重描**（V6D3-B）；`roadsDraw.spec` 斷言 far casing 寬＝base×5；§9.3-1 交叉印證                                                  |
| per-stage 重描被誤認違 dirty 契約                   | dirty-spec 誤紅                          | 重描屬 LOD 轉場非 tick、不動 rebuildCounts、stage 未變早退；§8.2 斷言 day-only 30 日 arterial `clear` 不增                                      |
| 道路名新字體字串未入子集                            | 豆腐                                     | 道路名限落 roads.json（受 subset 掃描）；`debugVisualRoadDisplay.spec` 斷言 name⊂roads.json names；gate 跑 `font:subset`＋`check-font-coverage` |
| 道路名白字落暖底不可讀                              | near 不可讀                              | `fill: TOKENS_NUM.ink900`（§5.1）；MapRenderer 新增 `TOKENS_NUM` import                                                                         |
| roadHighlight 用 addChildAt → mock 無此法           | init 崩、兩 suite 紅                     | 改 plain `addChild`（先 highlight 後 pathPreview）取下層 z（§5.1）；無需擴 mock                                                                 |
| graph swap 後高亮陳舊                               | 誤顯舊圖高亮                             | `buildStaticDataLayers` 非 null 亦重設 `prevSelectionKey=null`（§5.1）                                                                          |
| 命中 floor 誤套軍隊 → far 吞鄰近城/郡               | 誤選                                     | floor 僅城/郡；軍隊固定半徑（§3.5，§8.1 test）                                                                                                  |
| 海路波節鋪內陸終點段                                | 業餘感 artifact                          | seaTest 抑制陸段波節（§4.1）；`road.kakegawa-gifu` waypoints 貼水最短陸段；§9.3-2 眼驗收                                                        |
| arterial waypoints 穿山系 mass                      | DoD「無穿山」不過                        | fixture 內部點壓 y>2930 避 akaishi mass；§8.1 spec 沿段密取樣 pointInPolygon 對每 mass 把關（fixture＋s1560）                                   |
| 海路配色用暖地色 reliefInk                          | 水面配色錯                               | 全走 waterRiver 河色系（§3.1/§4.1/§6.3；回寫 §10-(1)）                                                                                          |
| `layers.roads.children.length` 破                   | spec 紅                                  | RoadsLayer 子容器 → `toBe(1)`（V6D2）                                                                                                           |
| `rebuildCounts.roads` 多次 +1                       | dirty-spec 紅                            | `buildRoadsLayer` 一次、`+1` 一次                                                                                                               |
| 移除 `ROAD_GRADE_WIDTH`/`SEA_ROUTE_DASH` 仍有消費者 | typecheck/lint 紅                        | 移除歸 Slice F；併移 `mapDraw.spec.ts:14` import；grep 確認 pathPreview 自帶 dash                                                               |
| roadsDraw.spec 用共用 mock 無法斷言呼叫序           | 測試無效                                 | 自備 recording mock（terrainDraw.spec 模式，§8.3）                                                                                              |
| Slice E 誤與 C 並行                                 | 編譯序錯                                 | E 嚴格待 C export 凍結（§7）                                                                                                                    |
| fixture 選取改動破 visualMapBoot.spec               | 測試紅                                   | Slice F 同步更新該 spec 選取斷言                                                                                                                |
| golden 誤動                                         | test:core 紅                             | roadDisplay/selectMapStaticModel/fixture selection 皆 view-model／UI；builder 剝除；禁 golden:update                                            |
| 阻斷道路/每日刻度被誤納                             | scope 爆 dirty 契約/BAL 耦合             | 明確延後（V6D11/V6D12）                                                                                                                         |

**整體回滾**：全在 `src/ui`／`src/data`／`tools/validate.ts`／`src/core/state`（view-model 純函式/純資料）／`roads.json`／debug 顯示葉模組／`visualMapBoot`（UI selection）；`GameState`／tick／golden 零觸。最小 DoD 交付＝B/A/C/D/E/F 全部（Slice E 已 in-scope）。

---

## 13. 第一輪對抗性審查逐條處置表（spec / eng）

| #             | 來源 | findings                                                                                                                                                | 嚴重度 | 處置                                                                                              | 落於章節                    |
| ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- | --------------------------- |
| C1-RIGHT 1–10 | spec | stage 解析、core DoD 修正、golden 安全、命中數學、fixture id、scenarioId 分派、單一子容器、常數移除安全、阻斷延後、色弱次通道                           | —      | **確認正確，保留不回歸**                                                                          | §前置/V6D2/V6D4/V6D8/V6D11  |
| C1-F1         | spec | 道路名法線公式非垂直（對角路 label 落 casing）                                                                                                          | MAJOR  | **接受**：改真法線＋偏上；新增 45° spec case                                                      | V6D5／§5.1／§8.1            |
| C1-F2         | spec | fixture 海路終於內陸、波節鋪陸                                                                                                                          | MAJOR  | **接受**：刪除「近 gifu 岸」偽述、貼水最短陸段 waypoints、加眼驗收項；**採 seaTest 抑制陸段波節** | V6D3/§4.1/§4.2/§6.1/§9.3-2  |
| C1-F3         | spec | 海路外線 reliefInk 屬暖地色、off-palette                                                                                                                | MINOR  | **接受（finding）；改採 waterRiver 河色系**（非 critic 建議之 roadCasing）；回寫 §10-(1)          | V6D3／§3.1／§4.1／§6.3／§10 |
| C1-F4         | spec | Slice E 被降為可裁切、baseline 不可見                                                                                                                   | MINOR  | **接受**：Slice E 改 in-scope；fixture 選取改 `VISUAL_ANCHOR_CASTLE_ID`                           | §1.2/§4.3/§5.6/§7/§8.2      |
| C1-F5         | spec | 小路命中 vs §3.12.1「街道邊不可點」未回寫                                                                                                               | MINOR  | **接受**：§10-(6) 明記街道邊仍不可點、小路命中經郡節點下限                                        | §10-(6)                     |
| C1-F6         | spec | `roadDisplayLookup` 為私有、測試需呼叫                                                                                                                  | MINOR  | **接受**：改 `export`                                                                             | §3.4／§7 Slice A            |
| C1-F7         | spec | fixture 顯示 `.ts` 未受 font 掃描（脆弱）                                                                                                               | MINOR  | **接受**：spec 斷言每 name ∈ roads.json name 集                                                   | §8.1                        |
| C2-RIGHT 1–10 | eng  | scenarioId、selection discriminant、無新色、golden 構造安全、child-count、fixture id、東海道 font、無 roads.visible 測、無 pixi mock 擴充、命中不破既測 | —      | **確認正確，保留不回歸**                                                                          | §前置/V6D2/§5.4             |
| C2-F1         | eng  | 法線非垂直（同 C1-F1）                                                                                                                                  | minor  | **接受**（同 C1-F1）                                                                              | V6D5／§5.1                  |
| C2-F2         | eng  | 道路名 code 漏 `fill`，DoD 要 ink900                                                                                                                    | MAJOR  | **接受**：`BitmapText` 加 `fill: ink900`；MapRenderer 新增 `TOKENS_NUM` import                    | 前置事實／V6D5／§5.1        |
| C2-F3         | eng  | 顯示葉模組在 font 掃描外（同 C1-F7）                                                                                                                    | minor  | **接受**（spec 斷言）                                                                             | §8.1                        |
| C2-F4         | eng  | 命中 floor 誤套軍隊                                                                                                                                     | minor  | **接受**：floor 僅城/郡；軍隊固定半徑；query box 僅擴節點                                         | V6D8／§3.5／§8.1            |
| C2-F5a        | eng  | `mapDraw.spec.ts:14` import 未清                                                                                                                        | minor  | **接受**：Slice F 明列移除                                                                        | V6D10／§5.3                 |
| C2-F5b        | eng  | `mapGraph.ts:39,41` 註解過時                                                                                                                            | minor  | **接受**：改「RoadsLayer 消費」                                                                   | §3.3                        |
| C2-F5c        | eng  | C‖E 非真並行                                                                                                                                            | minor  | **接受**：E 嚴格在 C export 凍結後                                                                | §7                          |
| C2-F6         | eng  | 排序鍵不一致                                                                                                                                            | minor  | **接受**：全統一預設 `.sort()` on keys                                                            | §3.3／§4.1／§5.1            |

**第一輪無任何 finding 被整體拒絕。**

---

## 14. 第二輪四份平行對抗性審查逐條處置表

> 四份審查對象皆為草稿 `design-M6-V6.md`；故部分 finding **第一輪修訂已解**，於此標「已解（指出章節）」；未解者「接受（折入章節）」；判斷不成立者「駁回（理由）」。

### 14.1 wf_2029ccd2-819 critic 1（spec/DoD）

| #         | finding                                                   | 嚴重度 | 處置                                                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| x1-M1     | fixture 海路 kakegawa-gifu 穿陸/山/河（草稿無 waypoints） | MAJOR  | **已解（folded 第一輪 C1-F2）＋二輪強化**：final §4.2 已賦 waypoints 南入灣、seaTest 抑陸段波節；二輪再加 §8.1 mass-avoidance 密取樣 gate（x4-M2）＋§9.3-1「無曲線穿海」。                                                               |
| x1-M2     | 選取高亮延後至 V9（V9 非選取里程碑，孤兒化）              | MAJOR  | **已解（第一輪 C1-F4）**：Slice E 已改 **in-scope**，fixture 預選節點入三段 baseline（§1.2/§4.3/§5.6/§7）。                                                                                                                              |
| x1-M3     | 阻斷道路為 roads 層規格但靜默省略、無延後決策             | MAJOR  | **已解（第一輪 V6D11）＋二輪強化**：final 已有 V6D11 明確延後＋§10-(8) plan 回寫；二輪於 V6D11 補「未來須為 roads 增狀態 dirty 入口」（呼應 roadmap 層表）。                                                                             |
| x1-MINOR4 | fixture 三相鄰邊皆「東海道」重複標籤                      | MINOR  | **接受**：final §4.2/§6.1 已只給 grade-3 `road.narumi-sunpu` 帶 name，`kiyosu-narumi`/`sunpu-kakegawa` 移除 name → fixture 僅一枚東海道；§9.3-3 眼驗收明列。（s1560 多邊同名為既有資料、near-only，屬可接受，未來可 de-dup，非本階段。） |
| x1-MINOR5 | D11 render 耦合 `BAL.roadGradeSpeedMult`（每日刻度）      | MINOR  | **駁回為現況、以 V6D12 根治**：草稿之 BAL 耦合源於「每日刻度」；final **不實作每日刻度**（V6D12 明確延後），故 render **不 import BAL**，耦合不存在。§1.3 明列鐵律。                                                                     |
| x1-MINOR6 | mapViewTypes.ts:103 過時 `drawRoads` 註解                 | MINOR  | **已解（第一輪 §3.7）＋二輪確認行號**：final §3.7 更新該註解；已對 live tree 驗 :103 即此註解，Slice F 擁有並修。                                                                                                                        |
| x1-MINOR7 | 場景部件測試依賴未文件化的 child 順序（脆弱）             | MINOR  | **接受（新折入）**：`RoadsLayer` 介面新增具名 `tiers` 參考供測試斷言，z-order 於 JSDoc 記為穩定契約（V6D2／§4.1／§8.1）。                                                                                                                |

### 14.2 wf_2029ccd2-819 critic 2（eng）

| #                         | finding                                              | 嚴重度 | 處置                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| x2-M1                     | 固定世界線寬於 0.25 overview 呈 ~1px 髮絲、DoD① 不過 | MAJOR  | **接受（新折入，核心）**：per-stage 線寬倍率 `ROAD_STAGE_WIDTH_MULT`，`setStage` 依 stage 重描（V6D3-B／§3.1／§4.1）；§6.3 加螢幕近似欄；§8.1 far casing 寬斷言使 §9.3-1 可測。 |
| x2-M2                     | s1560 arterial waypoints DoD-irrelevant/僅 zod 驗    | MAJOR  | **接受（新折入）**：§8.1 加 `pointInPolygon`＋mass-avoidance 斷言（同覆 fixture＋s1560）；§6.2 明述 s1560 為真實內容、DoD 截圖僅 fixture，但 gate 覆蓋兩者。                    |
| x2-MINOR unused-import    | drawRoads 移除後 lint no-unused-vars                 | minor  | **已解（第一輪 eng-F5a）**：§5.2/§5.3 mandate 移除兩處 import。                                                                                                                 |
| x2-MINOR over-stated test | 無 `roads.visible` 斷言可翻                          | minor  | **已解/確認**：final 前置事實已述「無 roads.visible 測」；§12 風險列已註「翻 true 不破既測」；§8.2 far arterial 為新增斷言（非改既有）。                                        |
| x2-MINOR open Q1          | soloGraph 無 edge → labels 仍 2                      | minor  | **已解（§5.4）**：明記維持 `toBe(2)`、fixture roads 無 name 自動成立。                                                                                                          |
| x2-MINOR roadsDraw mock   | 共用 pixiMock 不記錄呼叫、需自備 recording mock      | minor  | **接受（新折入）**：§8.3／Slice C 驗收明列 `roadsDraw.spec` 自備 recording mock（terrainDraw.spec 模式）。                                                                      |
| x2-MINOR D11 BAL optional | 可裁                                                 | minor  | **駁回為現況**：final 無此 D11（V6D12 延後每日刻度），無 BAL import。                                                                                                           |

### 14.3 wf_5b026a64-b3c critic 1（eng）

| #                             | finding                                                            | 嚴重度           | 處置                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| x3-MAJOR addChildAt           | init 用 `addChildAt`，全樹/兩 mock 皆無此法 → init 崩、兩 suite 紅 | MAJOR（Slice E） | **接受（新折入）**：§5.1 改「先 `addChild` roadHighlight、後 `addChild` pathPreview」取下層 z-order，**不用 addChildAt**；無需擴 mock。已驗 live init :333-334 順序。 |
| x3-MINOR fill omitted         | label snippet 漏 fill                                              | minor            | **已解（第一輪 C2-F2）**：§5.1 snippet 已含 `fill: TOKENS_NUM.ink900`。                                                                                               |
| x3-MINOR army floor           | floor 誤套軍隊劫持點擊                                             | minor            | **已解（第一輪 C2-F4）**：floor 僅城/郡，軍隊固定半徑。                                                                                                               |
| x3-MINOR graph-swap staleness | 非 null setMapData 未重設 prevSelectionKey → 高亮陳舊              | minor            | **接受（新折入）**：§5.1 `buildStaticDataLayers` 非 null 分支亦 `prevSelectionKey=null`；§8.2 加 graph-swap 重算斷言。                                                |
| x3-OBS 各項                   | 座標未驗、font no-op、s1560 重複標籤、dirty fixture 需 grade3      | —                | 確認/已納：座標交 Slice A（§4.2 註）；dirty far-arterial case 自建 grade-3 graph（§5.5/§8.2）。                                                                       |

### 14.4 wf_5b026a64-b3c critic 2（spec/DoD）

| #             | finding                                                                                                                      | 嚴重度 | 處置                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| x4-M1         | 固定世界線寬於 0.25 次像素、非顏色通道失效（同 x2-M1）                                                                       | MAJOR  | **接受（同 x2-M1 折入）**：per-stage 倍率重描（V6D3-B）。                                                                                                                                                             |
| x4-M2         | 「無穿山」無自動 gate、且建議 waypoints 仍穿 mt.akaishi mass（x2209..2324,y2695..2930）                                      | MAJOR  | **接受（新折入）**：(a) §8.1 加沿段密取樣對每 mountain mass `pointInPolygon` 斷言；(b) §4.2/§6.1 re-derive `road.narumi-sunpu` 內部 waypoints 壓 y>2930 避 mass，sunpu 逼近末段豁免。已對 terrain.json 實 mass 驗證。 |
| x4-M3         | 每日刻度／arterial 節點雙短刻靜默丟失、無決策                                                                                | MAJOR  | **接受（新折入）**：新增 **V6D12** 明確延後（每日刻度忠實實作須 BAL、牴觸鐵律；純幾何脫節）＋§10-(9) plan 回寫。同時根治 x1-MINOR5（無 BAL 耦合）。                                                                   |
| x4-m4         | Slice E 可裁但 roadmap 列選取高亮                                                                                            | minor  | **已解（第一輪 C1-F4）**：Slice E in-scope。                                                                                                                                                                          |
| x4-m5         | `roadDisplayLookup` 須 export                                                                                                | minor  | **已解（第一輪 C1-F6）**：§3.4 已 export。                                                                                                                                                                            |
| x4-m6         | kakegawa-gifu 海路地理不合理、端點為城非 isPort 郡                                                                           | minor  | **接受（新折入註記）**：§6.1 明記為 demo-only 例外（承襲既有 fixture，僅示線型，不擴散 s1560）；`debugVisualRoadDisplay.spec` 註記。                                                                                  |
| x4-m7         | roadHighlight §4.3 措辭：adjacency 存邊 id 非 MapRoadEdge                                                                    | minor  | **接受（新折入）**：§4.3 明述先 `graph.edges.get(edgeId)` 再 `edgePolyline`；§8.1 roadHighlight case 斷言此映射。                                                                                                     |
| x4-RIGHT 各項 | core DoD 修正、子容器 child-count、golden 安全、scenarioId、font-charset、token 齊、橋座標、命中設計、常數移除安全、slice 序 | —      | **確認正確，保留不回歸**。                                                                                                                                                                                            |

### 14.5 第二輪處置統計

- **接受並新折入（final 原無）**：9 — x1-MINOR7（tiers 具名 affordance）、x2-M1/x4-M1（per-stage 線寬，計 1 修正）、x2-M2/x4-M2（mass-avoidance gate＋re-derive waypoints，計 1 修正主軸另含 waypoint 重推）、x2-MINOR（roadsDraw 自備 mock）、x3-MAJOR（addChildAt→addChild）、x3-MINOR（graph-swap staleness）、x4-M3（V6D12 每日刻度延後）、x4-m6（demo-only 註記）、x4-m7（adjacency 邊 id 映射）。
- **已解（第一輪修訂已涵蓋）**：x1-M1、x1-M2、x1-M3、x1-MINOR4、x1-MINOR6、x2-MINOR×3（unused-import／over-stated／open-Q1）、x3-MINOR fill、x3-MINOR army floor、x4-m4、x4-m5＝共 13。
- **駁回（判斷不成立於 final）**：2 — x1-MINOR5＋x2-MINOR D11 BAL（final 不實作每日刻度、render 無 BAL import，耦合不存在；根因以 V6D12 記錄延後）。

**四份審查無「已解」以外之未處置項；兩處駁回皆因 final 已由設計選擇（不實作每日刻度）根除該耦合，並以 V6D12 正式記錄，非靜默。**
