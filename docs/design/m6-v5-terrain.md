# M6-V5 技術設計文件（最終版）：地形／水系／領地與三級 LOD

版本：Opus REVISER 交付（已納入 spec/visual 與 engineering 兩份對抗性審查，逐條處置見 §13）。
實作 agent 僅依本文件＋三份 brief 施工。
語言：繁體中文（台灣慣用語）；程式契約為 TypeScript。所有路徑為 repo 相對語意，
根為 `/Users/tigercosmos/nobunaga_ambition`。

> 本版相對草稿的四項關鍵修正（皆已對 repo 原始碼驗證）：
>
> 1. **地形/水系/領地必須在 `init()` 與 `setMapData` 兩處建構**——實機 effect 序為
>    `init()`（async，未 resolve）→ `setMapData`（此時 `initialized===false`）→ `updateView`；
>    草稿只掛在 `setMapData` 的 `if(this.initialized)` 分支，實機永不執行（Blocker）。
> 2. **領地首幀著色**：`buildTerritoryLayer` 於 build 當下即以 `this.view.districtOwner` 做一次
>    `recolorTerritory + source.update()`（比照 `buildStaticDataLayers` 於 build 時以 `this.view` 上色
>    node），否則 fixture 因 `viewState` 為穩定 `useMemo` 參考、`updateView` 不再 post-init 觸發，
>    領地永遠全透明（Blocker）。
> 3. **`destroy()` 不得讓 `app.destroy({texture:true})` 銷毀共享 relief/forest texture**：先 detach
>    並 `sprite.destroy({texture:false})`，共享 source 只經 `terrainLoader.dispose()` refcount 釋放，
>    否則 StrictMode 重掛取到已銷毀 texture（Major）。
> 4. **切片整合序改為 B→A→C→D**：`tools/gen-assets.ts`（A）需 import `MAP_PALETTE_HEX`（B 落於
>    `tokens.ts`），故 A 依賴 B（Major）。

---

## 1. 目標與範圍（Goal / Scope）

### 1.1 使命

把「抽象圖論」地圖（米黃平面陸地、深藍海、直黑線、彩色多邊形節點、重疊白字）升級為
**手作戰國沙盤**：紙雕層疊山脈、綠色森林帶、藍色河流／湖泊、柔和染紙式勢力領地、海岸暖灰
內陰影（無白邊）。針對三段固定截圖 scale 最佳化視覺回報：

- **0.25（far）**：紙浮雕日本，可辨主要山系、**森林帶**、主要河湖、柔染勢力領地；**絕不退回單色多邊形**。
  （森林於 far 以低 alpha 0.35 顯示，屬對 spec LOD 表的刻意偏離，直接回應「米黃平面」抱怨；見 VD3 與 §10-(7)。）
- **0.5（mid）**：東海走廊的個別山脈／森林結構化，次要水系與郡界浮現。
- **1.25（near）**：局部紋理乾淨呈現（無雪花噪點），河湖銳利、森林邊緣輪廓可讀（boundary visible，非銳邊；見 §9.3 註）。

### 1.2 交付內容

1. `terrainBase`(1) 圖層：陸地底＋平原＋分層山脈剪影＋短墨脊＋海岸內陰影（烘焙紋理 Sprite）＋森林群塊（烘焙紋理 Sprite）。
2. `waterFeatures`(2) 圖層：河川（widthClass 1/2/3，上游細下游寬）＋湖泊（多邊形）。
3. `territory`(3) 圖層：既有 `TerritoryGrid`（柵格化 Voronoi）接成 `Sprite`＋界線烘焙，**build 當下首幀著色**，owner 翻轉下一次 `updateView` 更新。
4. 三級 LOD（far/mid/near）＋ hysteresis，決定論對映三段截圖 preset。
5. 地形向量原始資料（`src/data/map/terrain.json`）＋ zod schema＋驗證測試。
6. 地形紋理素材管線（`tools/gen-assets.ts` 程序生成，manifest 登錄，validate:assets 綠燈）。
7. 地圖色票落為具名常數（`tokens.ts` 之 `MAP_PALETTE_*`），`MAPVIEW.colors` 遷移為引用。

### 1.3 硬約束（違反即 CI 紅燈，不得繞過）

- `src/core/` 維持純 TS；`GameState`／golden byte-identical，**禁止 `npm run golden:update`**；13 步 daily tick 零變更。
- 渲染常數進 `MAPVIEW`／`MAP_PALETTE`，不進 `BAL`（04 §8-D8）。
- 繪製程式色彩一律取自 token／`MAPVIEW`；art-bible 地圖色先落為具名常數再消費。
- 全繁體中文，無簡體字／日文新字體（`validate:data` 掃描含字串／註解）。**不新增 user-visible `BitmapText` 字串**（本里程碑地形無文字）。
- 新素材走 `tools/gen-assets.ts`（決定論、seeded LCG、無 `Math.random`／`Date.now`）＋ manifest＋validate:assets（A01–A16）；首屏預算 8 MiB（現用 156.8 KiB）；單一 texture 每邊 ≤ 2048px。
- M6-V4 dirty-update DoD 測試（`src/ui/map/mapRendererDirty.spec.ts`）維持全綠：無變更 tick 不重建靜態層；owner 翻轉下一幀更新且僅受影響節點；`day` 變更不觸發任何靜態重畫。
- `MapRebuildCounts` 介面**不得增刪欄位**（`mapRendererDirty.spec` 以 `toEqual` 整物件比對）。
- `MapRenderer` 生命週期 StrictMode 安全、`destroy` 冪等、重掛無 texture/cache 洩漏（含共享 relief/forest texture）。
- **絕不修改 `plan/00-foundations.md`**。規格衝突依 00>02>15>系統>UI 裁定、實作、回寫對應 plan §8，不留 TBD。
- Playwright 視覺 baseline（`e2e/visual.spec.ts`，三 preset 0.25/0.5/1.25）**預期改變**（V5 首次刻意更新），baseline 更新為獨立 commit。

---

## 2. 決策紀錄（VD1–VD10）

### VD1 — 地形資料來源與格式

**決策**

- **(a) 原始資料落位**：新增 `src/data/map/terrain.json`（世界座標，扁平 `[x0,y0,...]` 整數陣列），
  以 `src/data/schemas/terrain.ts`（zod）把關。作者以 `lonLatToWorld(lon,lat)`（`src/data/map/projection.ts`）
  由公有領域地理知識推導座標後，四捨五入落盤為世界座標（見 §6）。
- **(b) 真實地理特徵**：全 landmass 粗涵蓋＋東海／近畿密集（見 §6 完整清單與座標指引）。
- **(c) relief／forest 成為紋理**：由 `tools/gen-assets.ts` **從 `terrain.json`＋`japan-outline.json` 程序生成**兩張
  **2048×2048** PNG（覆蓋 4096×4096 世界，Sprite scale=2），紙雕風格；河湖**不烘焙**、於 `waterFeatures` 以向量繪製。
  - `texture.terrain.relief@1x`：陸地底（`map.land.base`）＋平原提亮（`map.plain.light`）＋2–3 層錯位山脈剪影＋短墨脊（`map.relief.ink`）＋海岸內陰影（2–4 texel 暖灰，**無白邊**）；海為透明（露出 `seaBackground`）。
  - `texture.terrain.forest@1x`：森林群塊（`map.forest.moss` alpha 0.82，林緣節奏），其餘透明。
  - **LOD 對映**：以兩張紋理 Sprite 的 `visible`/`alpha` 切換（**relief 恆顯；forest far 低 alpha 0.35、mid 0.85、near 0.9**），
    **不做多重解析度變體**（省記憶體）；relief 以 `scaleMode:'linear'` 上採，close 讀為柔和紙雕而非方塊。close 局部紋理由 relief/forest 全不透明＋銳利河湖向量＋領地染色達成，V5 不另做 runtime 向量細節 overlay。
  - **成本估算**：relief ≈ 1.2–1.8 MiB、forest ≈ 0.4–0.8 MiB（大量透明，deflate 壓縮佳），合計 ≤ ~2.5 MiB，加現用 156.8 KiB 遠低於 8 MiB。兩者列入 `FIRST_SCREEN_ASSET_IDS`。GPU 記憶體 2×(2048²×4)=32 MiB，桌面可接受。

**替代方案**：(i) 純 runtime `Graphics` 畫山（不烘焙）——被否，reserved 契約明列 `reliefAssetId`/`forestAssetId`（烘焙），且大量向量每幀重繪違反效能。(ii) 多解析度 relief 變體——被否，記憶體翻倍、需擴充契約，V5 payoff 不需。**理由**：兩張全域紋理 + linear 上採在三段固定 scale 皆讀為手作紙雕，實作面最小、風險最低。

### VD2 — 圖層堆疊演進

**決策**：一次補齊 04 §3.10.1 全 13 層（多出者為空 `Container`，避免 V6–V10 反覆改序）。新 `LAYER_ORDER`（由下而上）：

```
['seaBackground','terrainBase','waterFeatures','territory','analysisOverlay',
 'roads','settlements','nodeMarkers','armies','selectionAndPath','effects','labels','debug']
```

`MapLayers` 新增 5 個 readonly 欄位：`terrainBase`、`waterFeatures`、`analysisOverlay`、`settlements`、`debug`。

**影響**：`buildLayers` 迴圈 `LAYER_ORDER` 已泛型化（`MapRenderer.ts:326` 迴圈自動建齊容器），回傳物件字面量須補 5 個 key（`MapRenderer.ts:333–343`）。
`MapCanvasHost.spec`（line 247 `world.children.map(label)).toEqual([...LAYER_ORDER])`）以 `LAYER_ORDER` 參數化，自動通過；其 child-count 斷言僅在 `seaBackground`/`roads`/`nodeMarkers`/`labels`，不受新層影響。`mapRendererDirty.spec` 不檢查 layer 集合。

**替代**：只加兩層——被否，V6/V10/debug 遲早要加，一次到位免二次改序與二次改測試。

### VD3 — 三級 LOD

**決策**：新增 `MAPVIEW.lodNearScale = 1.0`、`MAPVIEW.lodHysteresis = 0.1`（保留 `lodFarScale = 0.5`、`labelScale = 1.0`）。
新型別 `LodStage = 'far'|'mid'|'near'`。純分類 `lodStageForScale`：`<0.5`→far、`<1.0`→mid、`>=1.0`→near。
帶 hysteresis 版 `lodStageWithHysteresis(scale, prev)`：只在跨界時用 10% 死區（上行需超過界×1.1、下行需低於界×0.9），同段回傳同段。

**決定論保證**：`setCameraPose`（e2e `setMapCameraPreset` 唯一入口，`MapRenderer.ts:663`）在套用前先 `this.lodStage = lodStageForScale(clampedScale)`（純分類、清 hysteresis 狀態），故 0.25→far、0.5→mid、1.25→near **無歧義**；hysteresis 只作用於滾輪連續縮放（防臨界閃爍）。截圖 preset 為瞬移，不吃死區。

**既有消費者零行為變更（關鍵低風險手法）**：`applyLodAndCulling`（`MapRenderer.ts:526–562`）開頭以
`const nearish = stage !== 'far'`（等價舊 `near = lodModeForScale(scale)==='near'`，即 `scale>=0.5`）、
`const detail = stage === 'near'`（等價舊 `shouldShowDetailLabels(scale)`，即 `scale>=1.0`）
逐一取代函式內舊 `near`/`shouldShowDetailLabels(camera.scale)`。roads（line 560）/nodeMarkers（548–549）/labels（551–558）/主城放大 1.4 之判定**逐項等價**，V4 測試與現有截圖語意不破。`mid`/`near` 之細分**只由地形/水系/領地新消費**。roads 維持 `layers.roads.visible = nearish`（= 舊行為，far 隱藏；不使其更糟，全 roads far LOD 屬 V6）。

各段地形/水系/領地顯示（**forest far 由「隱」改為 alpha 0.35，見 §13-M1 處置**）：

| 域                | far                  | mid                  | near                 |
| ----------------- | -------------------- | -------------------- | -------------------- |
| relief Sprite     | 顯（alpha 1）        | 顯                   | 顯                   |
| forest Sprite     | **顯（alpha 0.35）** | 顯（alpha 0.85）     | 顯（alpha 0.9）      |
| water 河（class） | 僅 3                 | 3,2                  | 3,2,1                |
| water 湖          | 顯                   | 顯                   | 顯                   |
| territory alpha   | 0.65                 | 0.45（faction 0.85） | 0.45（faction 0.85） |
| territory 界線    | 有（烘焙）           | 有                   | 有                   |

### VD4 — 領地 Sprite 接線（含首幀著色與雙路徑建構）

**決策**

- **build 時機（關鍵修正）**：`TerritoryGrid` 於 **`init()`（`buildStaticDataLayers()` 之後）與 `setMapData` 的 `if(this.initialized)` 分支兩處**同步建構（比照既有 `buildStaticDataLayers` 之雙呼叫路徑：`init()` line 303＋`setMapData` line 794）。**只掛 `setMapData` 分支不足**——實機 effect 序為 `init()`（async，await 前 `initialized===false`）→ `[staticData]` effect 呼 `setMapData`（此時 `initialized===false`，跳過 build 分支、僅存 `this.staticData`）→ `[viewState]` effect 呼 `updateView`（`initialized===false`，line 809 early-return、僅存 `this.view`）；隨後 `init()` 之 microtask resolve 才 `buildStaticDataLayers()`。故三個地形建構器必須在 `init()` 內鏡像呼叫，否則實機/fixture 永遠空地形。
  - 實作以一個私有整合器 `reconstructTerrainLayers()` 封裝三呼叫（見 §5.1），於 `init()`（line 303 之後、line 305 `redrawMilitaryObjects` 之前或之後皆可，須在 layers 已建、`this.view` 已具 pre-init 值後）與 `setMapData` 之 `if(this.initialized)` 分支各呼叫一次。
  - `~115ms` 一次性、載入期、在 perf gate <200ms 內、e2e 於首幀前需就緒。不採 async/idle 排程（會複雜化 `waitMapIdle` 決定論）。territory 與 terrain pack **無關**（只需 graph＋outline＋clanColorIndex），故無 terrain 亦建。
- **首幀著色（關鍵修正）**：`buildTerritoryLayer()` 於建 grid＋sprite 後，**當下立即**以
  `recolorTerritory(grid, this.view.districtOwner, this.staticData.clanColorIndex)` + `source.update()`
  做一次首幀著色（比照 `buildStaticDataLayers` 於 build 當下以 `buildOwnerByNode(this.view)` 為 node 上色的既有語意，`MapRenderer.ts:383,398`）。**不可**只依賴 `updateView` 的 dirty 路徑——fixture 之 `viewState` 為穩定 `useMemo` 參考，post-init 不再觸發 `[viewState]` effect，`updateView` 永不再跑、`grid.imageData` 全零、Sprite 全透明。首幀著色**不動** `rebuildCounts`（見下）。
- **Pixi v8 API（已對 `pixi.js@8.19.0` typings 驗證）**：
  ```ts
  import { BufferImageSource, Texture, Sprite } from 'pixi.js';
  const source = new BufferImageSource({
    resource: grid.imageData.data, // Uint8ClampedArray（TypedArray）
    width: grid.size,
    height: grid.size, // 1024
    scaleMode: 'linear', // 見 filtering 決策
    alphaMode: 'premultiply-alpha-on-upload',
    label: 'territory',
  });
  const texture = new Texture({ source });
  const sprite = new Sprite(texture);
  sprite.setSize(WORLD_SIZE, WORLD_SIZE); // 4096×4096；texture 1024 → 隱含 scale 4
  ```
  更新：`recolorTerritory(grid, ...)` 寫 `grid.imageData.data` 後呼叫 `source.update()`（in-place 重上傳，不重建 Texture）。
- **recolor dirty 觸發（後續 owner 翻轉）**：整合既有 `applyOwnerDirty`——當 `diffOwnerByNode` 之 `dirty.size>0` 時，於既有 `this.rebuildCounts.territory += 1` 之後另設 `this.territoryDirty = true`。`updateView` 於 `applyOwnerDirty` 後、`redrawMilitaryObjects` 之前，若 `territoryDirty && grid` 則呼叫一次 `recolorTerritory + source.update()`、清旗標（**每幀至多一次**）。此保持 V4 測試：owner 翻轉 `territory` 計數 +1、day-only +0；`recolorTerritory`/`source.update` 不動 `rebuildCounts`（不新增欄位）。首幀著色（build 時）不設 `territoryDirty`、不增計數。
- **alpha 規則**：一般 0.45；far 0.65；`view.analysisMode === 'faction'` → 0.85。於 `applyLodAndCulling` 依 stage＋analysisMode 設 `sprite.alpha`。
- **filtering：`linear`（不用 nearest）**。理由：cell=4 世界單位，在 overview/mid（領地主要判讀 scale）為次像素～1–2px，linear 給平滑勢力大面與柔和界線（染紙感），避免對角海岸線／界線在 0.25 截圖的鋸齒階梯；close 時領地為 0.45 淡染、壓在銳利 roads/城/標籤之下，輕微柔化優於 4px 方塊。1-cell ×0.55 界線烘焙上採為 ~4 世界單位柔深縫，正合 art-bible §6.2「局部墨深、非霓虹線」。
- **destroy／StrictMode**：見 §5.1 destroy 段（territory 為自持 texture，顯式 destroy；relief/forest 為共享，先 detach 再 `destroy({texture:false})`＋refcount 釋放）。
- **perf gate**：既有 `tests/perf/territoryGrid.gate.spec.ts` 不變（build 純函式未改）。

### VD5 — 海岸陰影與海

**決策**

- 海岸內陰影**烘焙進 relief 紋理**（陸側 2–4 texel 暖灰 `map.relief.ink` alpha ~0.18），非 runtime stroke；維持**無白邊**。此陰影在 far（0.25）為次像素、幾不可見（世界空間烘焙隨 zoom 正確縮放），故屬 mid/near 眼驗收項，非 far 項（見 §9.3 註）。
- `seaBackground`(0) **維持現行 `drawSeaBackground`**（海色 rect＋各島陸地多邊形填 `map.land.base`）**作為永久 fallback 底**；`terrainBase` 的 relief Sprite 以**相同陸地底色**＋山脈＋海岸陰影疊上完整覆蓋，故 relief 載入失敗時退回現行平面陸地（不崩、不現接縫）。relief 載入成功則見浮雕。
- **relief/sea 海岸接縫風險**：relief 陸地遮罩以 0.5 texel/world 烘焙、linear 上採，與 `seaBackground` 陸地多邊形非像素一致，理論上可能於 0.25 出現細微 fringe（relief 陸略越海或反之）。因兩者陸地皆用同一 `landBase` 底色，fringe 僅在陸緣邊際 alpha 過渡可見，屬紙沙盤可接受範圍；列入 §9.3 眼驗收（「無 relief/海 海岸接縫」）。
- **far 不退單色**：far 顯示 relief Sprite（含山系剪影）＋forest（0.35）→ 滿足 V5 顯性 DoD。

**替代**：relief 接管全部陸地填色、`seaBackground` 只畫海——被否，失去 fallback 底、relief 未載入時 far 變全透明陸地（露海）＝比現況更糟。

### VD6 — terrain pack 填充路徑

**決策**：由 **UI 邊界**填充，core 維持純淨、golden 不動。

- core `selectMapStaticModel`（`src/core/state/selectors.ts`）**不改**，仍不含 `terrain`（不 import terrain.json，維持純度）。
- 新增 UI 純函式 `buildTerrainPack()`（`src/ui/map/terrain/terrainPack.ts`）：讀 `src/data/map/terrain.json`＋manifest asset ids，回傳 `MapStaticData['terrain']`（模組級快取）。
- `MainScreen.tsx` 之 `staticData` useMemo 改為 `{ ...selectMapStaticModel(game), terrain: buildTerrainPack() }`。debug 視覺路徑（`?debug=visual-map`）同經 `MainScreen`，自動取得 terrain。
- **`terrain` 欄位維持 optional（不改必填）**——刻意偏離 reserved 註解「V5 填值後改必填」。理由：改必填會逼所有測試 fixture（`mapRendererDirty.spec`/`MapCanvasHost.spec`）補 terrain，且牴觸「terrain 資產載入失敗須優雅退回平面渲染、絕不崩潰」之要求。回寫 04 §8（見 §10）。
- **執行期失敗處理**：`terrain === undefined` 或紋理 acquire reject → `terrainBase`/`waterFeatures` 空、territory 照常（territory 與 terrain 無關）、`seaBackground` fallback 底生效 → 平面渲染、不崩。

### VD7 — 地圖色票落位

**決策**：於 `src/ui/styles/tokens.ts` 新增**獨立具名常數**（**不放 `TOKENS.color`**，以免動到 `tokens.spec.ts` 之「每個 `TOKENS.color` 皆須有 `TOKENS_NUM`」一一對應斷言與 CSS 變數表）：

```ts
export const MAP_PALETTE_HEX = {
  seaDeep: '#27303d',
  landBase: '#cfc6ae',
  plainLight: '#d8cfb8',
  reliefInk: '#776a55',
  forestMoss: '#4f6448',
  waterRiver: '#5f8190',
  roadCasing: '#302a22',
  roadArterial: '#b89b64',
  roadMinor: '#86745a',
  neutral: '#8a8578',
} as const;
export const MAP_PALETTE_NUM = {
  seaDeep: hexToNum(MAP_PALETTE_HEX.seaDeep),
  /* …每鍵… */ neutral: hexToNum(MAP_PALETTE_HEX.neutral),
} as const;
```

`MAPVIEW.colors` 遷移：`sea → MAP_PALETTE_NUM.seaDeep`、`land → MAP_PALETTE_NUM.landBase`、
`neutral → MAP_PALETTE_NUM.neutral`（`borderDarken`/`pathOk`/`pathBad`/`awe` 不變）。
`terrainDraw`（水系）色彩取 `MAP_PALETTE_NUM.waterRiver`/`reliefInk`；`gen-assets` 取 `MAP_PALETTE_HEX`。
road* 三色本階段先定義（「先落具名常數」），V6 消費。回寫 04 §8。

> **切片相依（Major 4 處置）**：`tools/gen-assets.ts` 目前 `import { TOKENS } from '../src/ui/styles/tokens'`（line 27），本設計改為額外 import `MAP_PALETTE_HEX`。`MAP_PALETTE_HEX` 由本切片（B）落於 `tokens.ts`，故 **Slice A（gen-assets）依賴 Slice B 先落 `MAP_PALETTE_HEX`**。整合序改為 **B→A→C→D**（見 §7）。A、B 檔案擁有權互斥、可並行開發，但 A 的 `gen:assets`／manifest hash／`genAssetsTerrain.spec` 須待 B 的 `tokens.ts` 變更 landed 才能執行。

**替代**：塞進 `TOKENS.color`——被否，需同步改 `TOKENS_NUM`＋CSS 變數表＋`tokens.spec`，churn 大且地圖色非 CSS 用途。

### VD8 — debug fixture 與 baseline

**決策**：`buildVisualMapState`（`src/core/debugVisual.ts`）**不改**（core 純度、無地形欄位）；terrain 由 §VD6 的 `MainScreen` 接線自動掛上，故 debug fixture 三 preset 均能見地形。fixture 城郡位於東海（x1900–2340, y2770–2970），對映 §6 的伊吹／鈴鹿／木曾山系、木曾三川／天龍川、琵琶湖／濱名湖。三新 baseline 應顯示：far 紙浮雕日本（海岸＋山系＋森林帶＋主河湖＋柔染領地）、mid 東海走廊山脈森林結構、near 局部紙雕紋理乾淨＋河湖銳利。再生程序與驗收見 §9。

### VD9 — 測試計畫

見 §8 完整表。要點：新純模組（`terrainDraw` 水系繪製以錄製 mock `Graphics`、`terrainPack`、`terrain` zod＋地理健全、LOD 門檻/hysteresis 語意）皆單測；`mapRendererDirty.spec` 擴充 territory sprite dirty **與地形/水系/領地正向存在斷言**（見 §8.2）；資產管線靠 validate:assets A14/A15＋gen 雙跑 byte-identical；jsdom 無法測 texture upload → territory/terrain texture 路徑以 `pixiMock` 擴充（Sprite/Texture/BufferImageSource/Assets stub）；**`MapCanvasHost.spec.tsx` 的自帶 inline mock 必須同步擴充**（見 §5.6，Slice D 必改）。

### VD10 — 平行切片

見 §7。4 切片（A 資料/資產、B token/config/LOD、C 地形/水系繪製、D 整合），檔案擁有權嚴格互斥，**整合序 B→A→C→D**（A 依 B 之 `MAP_PALETTE_HEX`）。

---

## 3. 精確型別與常數變更

### 3.1 `src/ui/map/mapViewConfig.ts`（Slice B）

於 `MAPVIEW` 內：

```ts
lodFarScale: 0.5,       // 不變
lodNearScale: 1.0,      // 新增：mid/near 界（= labelScale 值，但獨立命名，語意為 LOD 段界）
labelScale: 1.0,        // 不變（detail 標籤門檻）
lodHysteresis: 0.1,     // 新增：10% 死區
```

`colors` 遷移（需於檔頂 `import { MAP_PALETTE_NUM } from '@ui/styles/tokens';`）：

```ts
colors: {
  sea: MAP_PALETTE_NUM.seaDeep,
  land: MAP_PALETTE_NUM.landBase,
  neutral: MAP_PALETTE_NUM.neutral,
  borderDarken: 0.55,
  pathOk: 0xffffff, pathBad: 0xcc3333, awe: 0xe8b93f,
},
territoryAlphaFar: 0.65,      // 新增
territoryAlphaFaction: 0.85,  // 新增
```

檔尾新增：

```ts
/** 河川 widthClass → 線寬（world unit）；上游細下游寬另由 taper 逐段內插達成（terrainDraw）。 */
export const RIVER_WIDTH: Readonly<Record<1 | 2 | 3, number>> = { 1: 2, 2: 4, 3: 7 };
/** 河川沿線起端相對寬度比例（0..1）；末端＝1（下游最寬）。 */
export const RIVER_TAPER_HEAD = 0.4;
/** relief／forest 烘焙紋理邊長（world unit 覆蓋範圍）；Sprite setSize 用。 */
export const TERRAIN_SPRITE_WORLD = WORLD_SIZE; // 4096
/** forest Sprite 各 LOD 段 alpha（far 低 alpha 亦顯，回應「米黃平面」抱怨；VD3／§10-(7)）。 */
export const FOREST_ALPHA: Readonly<Record<'far' | 'mid' | 'near', number>> = {
  far: 0.35,
  mid: 0.85,
  near: 0.9,
};
```

### 3.2 `src/ui/styles/tokens.ts`（Slice B）

新增 `MAP_PALETTE_HEX`／`MAP_PALETTE_NUM`（見 VD7）。放於 `TOKENS_NUM` 之後、`CLAN_COLOR_COUNT` 之前。
**不動** `TOKENS.color`、`buildBaseCssVarEntries`、`injectCssVariables`。

### 3.3 `src/ui/map/lod.ts`（Slice B）

```ts
export type LodMode = 'far' | 'near'; // 保留（既有消費者相容）
export type LodStage = 'far' | 'mid' | 'near'; // 新增

export function lodModeForScale(scale: number): LodMode {
  /* 不變 */
}
export function shouldShowDetailLabels(scale: number): boolean {
  /* 不變 */
}

/** 純分類（無 hysteresis）：截圖 preset 用，決定論。 */
export function lodStageForScale(scale: number): LodStage {
  if (scale < MAPVIEW.lodFarScale) return 'far'; // <0.5
  if (scale < MAPVIEW.lodNearScale) return 'mid'; // <1.0
  return 'near'; // >=1.0
}

/** 帶 10% 死區（滾輪連續縮放防閃）：同段回傳同段；跨段須超過死區邊界。 */
export function lodStageWithHysteresis(scale: number, prev: LodStage): LodStage {
  const f = MAPVIEW.lodFarScale,
    n = MAPVIEW.lodNearScale,
    h = MAPVIEW.lodHysteresis;
  const pure = lodStageForScale(scale);
  if (pure === prev) return prev;
  if (prev === 'far') return scale >= f * (1 + h) ? pure : 'far';
  if (prev === 'near') return scale <= n * (1 - h) ? pure : 'near';
  // prev === 'mid'
  if (pure === 'near') return scale >= n * (1 + h) ? 'near' : 'mid';
  /* pure === 'far' */ return scale <= f * (1 - h) ? 'far' : 'mid';
}
```

`SpatialCullIndex`、`bucketKey`、`WorldRect` 不變。

### 3.4 `src/ui/map/mapViewTypes.ts`（Slice D）

`MapLayers` 新增（維持 readonly，註解 04 §3.10.1 對應層號）：

```ts
readonly terrainBase: Container;     // 1
readonly waterFeatures: Container;   // 2
readonly analysisOverlay: Container; // 4（V10 空）
readonly settlements: Container;     // 6（V7 空）
readonly debug: Container;           // 12（DEV 空）
```

`LAYER_ORDER` 改為 13 元素（見 VD2）。`MapStaticData.terrain` 型別**維持不變**（optional，
`reliefAssetId`/`forestAssetId`/`rivers`/`lakes`）——`buildTerrainPack` 回傳即此形狀。

### 3.5 `MapRebuildCounts`（`MapRenderer.ts`）

**不變**（`toEqual` 契約）。territory 重繪沿用既有 `territory` 計數作 dirty 訊號。

---

## 4. 新檔規格（完整簽章＋行為）

### 4.1 `src/data/schemas/terrain.ts`（Slice A，新檔）

```ts
import { z } from 'zod';

const zCoord = z.number().int().min(0).max(4096);
/** 扁平多邊形 [x0,y0,...]：偶數長度、≥3 點（≥6 數）。 */
const zFlatPolygon = z.array(zCoord).refine((a) => a.length % 2 === 0 && a.length >= 6, {
  message: '多邊形須為偶數長度且至少 3 點',
});
/** 扁平折線 [x0,y0,...]：偶數長度、≥2 點（≥4 數）。 */
const zFlatPolyline = z.array(zCoord).refine((a) => a.length % 2 === 0 && a.length >= 4, {
  message: '折線須為偶數長度且至少 2 點',
});

export const zTerrainMountain = z.object({
  id: z.string().min(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  mass: zFlatPolygon,
  ridges: z.array(zFlatPolyline).min(0),
});
export const zTerrainForest = z.object({ id: z.string().min(1), polygon: zFlatPolygon });
export const zTerrainRiver = z.object({
  id: z.string().min(1),
  points: zFlatPolyline, // 上游→下游（末點為河口）
  widthClass: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export const zTerrainLake = z.object({ id: z.string().min(1), polygon: zFlatPolygon });

export const zTerrainFile = z.object({
  version: z.literal(1),
  mountains: z.array(zTerrainMountain),
  forests: z.array(zTerrainForest),
  rivers: z.array(zTerrainRiver),
  lakes: z.array(zTerrainLake),
});
export type TerrainFile = z.infer<typeof zTerrainFile>;
```

行為：純 schema，無副作用；供 `gen-assets`（Node）與 `terrainPack`（瀏覽器）共用 import。

### 4.2 `src/data/map/terrain.json`（Slice A，新檔）

`version:1`；內容見 §6（實作 agent 依 §6 座標指引產出）。長度預估：mountains ~14、forests ~10、rivers ~10、lakes ~2。

### 4.3 `src/ui/map/terrain/terrainPack.ts`（Slice C，新檔）

```ts
import type { MapStaticData } from '../mapViewTypes';
import terrainJson from '@data/map/terrain.json';
import { zTerrainFile } from '@data/schemas/terrain';

export const TERRAIN_RELIEF_ASSET_ID = 'texture.terrain.relief@1x';
export const TERRAIN_FOREST_ASSET_ID = 'texture.terrain.forest@1x';

export type TerrainPack = NonNullable<MapStaticData['terrain']>;

let cached: TerrainPack | null = null;

/** 讀 terrain.json（zod 解析、模組級快取）＋ manifest 資產 id → MapStaticData.terrain 形狀。
 *  扁平 [x,y,...] 轉為 {x,y}；mountains/forests 不進 runtime（relief/forest 已烘焙），僅 rivers/lakes 進。 */
export function buildTerrainPack(): TerrainPack {
  if (cached !== null) return cached;
  const file = zTerrainFile.parse(terrainJson);
  const toPoints = (flat: readonly number[]) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
    return out;
  };
  cached = {
    reliefAssetId: TERRAIN_RELIEF_ASSET_ID,
    forestAssetId: TERRAIN_FOREST_ASSET_ID,
    rivers: file.rivers.map((r) => ({
      id: r.id,
      points: toPoints(r.points),
      widthClass: r.widthClass,
    })),
    lakes: file.lakes.map((l) => ({ id: l.id, polygon: toPoints(l.polygon) })),
  };
  return cached;
}
```

行為：純函式；同輸入回傳同快取參考（`MainScreen` useMemo 友善）。

### 4.4 `src/ui/map/terrain/terrainDraw.ts`（Slice C，新檔）

```ts
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import { RIVER_WIDTH, RIVER_TAPER_HEAD, TERRAIN_SPRITE_WORLD } from '../mapViewConfig';
import type { MapStaticData } from '../mapViewTypes';

type Rivers = NonNullable<MapStaticData['terrain']>['rivers'];
type Lakes = NonNullable<MapStaticData['terrain']>['lakes'];

/** relief／forest 烘焙紋理 Sprite（鋪滿 4096×4096 世界）；scaleMode 由 loader 端 texture source 決定（linear）。 */
export function createTerrainSprite(texture: Texture): Sprite {
  const s = new Sprite(texture);
  s.position.set(0, 0);
  s.setSize(TERRAIN_SPRITE_WORLD, TERRAIN_SPRITE_WORLD);
  return s;
}

export interface WaterFeatures {
  readonly container: Container;
  setStage(stage: LodStage): void;
  destroy(): void;
}

/** 建 waterFeatures：湖（恆顯）＋三個 class Graphics（far:3／mid:3,2／near:3,2,1）。init 一次，LOD 只切 visible。 */
export function createWaterFeatures(rivers: Rivers, lakes: Lakes): WaterFeatures {
  /* 見行為 */
}
```

**行為（`createWaterFeatures`）**：

- `container` 內含 4 個 `Graphics`：`lakeGfx`、`riverGfx3`、`riverGfx2`、`riverGfx1`。
- 湖：對每 lake `g.poly(flat).fill({ color: MAP_PALETTE_NUM.waterRiver })`；描邊 `stroke({ width:1, color: MAP_PALETTE_NUM.reliefInk, alpha:0.4 })`。
- 河：依 widthClass 分派到 river Gfx；每河以 **taper 逐段 stroke** 繪製：對 points 相鄰段 `moveTo/lineTo` 後以該段線寬 `stroke`，線寬由 `RIVER_WIDTH[widthClass]` 乘上沿線比例 `lerp(RIVER_TAPER_HEAD, 1, i/(n-1))`（上游 0.4×→下游 1.0×），色 `MAP_PALETTE_NUM.waterRiver`、`cap:'round'`、`join:'round'`。
- `setStage(stage)`：`riverGfx3.visible = true`；`riverGfx2.visible = stage !== 'far'`；`riverGfx1.visible = stage === 'near'`；`lakeGfx.visible = true`。
- `destroy()`：`container.destroy({ children: true })`。
- 決定論：river 依 `id` 字典序處理（快照穩定）。

### 4.5 `tools/gen-assets.ts` 內新增（Slice A，MODIFY）

新增純生成函式（回傳 `RgbaImage`），沿用既有 `hexToRgb`/`fillRect`/`setPixel`/`lcgMix`/`fillIsoscelesTriangleUp` 慣例，**色取新 import 之 `MAP_PALETTE_HEX`（來自 Slice B 的 `tokens.ts`；故 A 依賴 B，見 VD7）**：

```ts
export const TERRAIN_TEXTURE_SIZE = 2048; // 每邊（≤2048 限制）
const TERRAIN_WORLD = 4096; // 覆蓋世界邊長
const TERRAIN_TEXEL_PER_WORLD = TERRAIN_TEXTURE_SIZE / TERRAIN_WORLD; // 0.5
// world→texel：Math.round(worldCoord * 0.5)

/** relief 紋理：陸地底＋平原提亮＋2–3 層錯位山脈剪影＋短墨脊＋海岸內陰影；海透明。無白邊。 */
export function generateReliefTexture(terrain: TerrainFile, outline: JapanOutlineFile): RgbaImage;
/** forest 紋理：森林群塊 forestMoss alpha≈0.82＋林緣節奏（seeded 缺口）；其餘透明。 */
export function generateForestTexture(terrain: TerrainFile): RgbaImage;
```

**`generateReliefTexture` 行為**（全 seeded／整數／線性，無 `Math.random`）：

1. 陸地遮罩：對每列以 outline polygon 掃描線相交（比照 `territoryGrid.rowLandSpans` 手法或就地實作）判 land；land texel 填 `landBase`（alpha 255），sea texel 保持透明。
2. 平原提亮：land texel 若距任何 mountain.mass 皆遠（> ~200 世界單位；以 mass AABB 粗篩距離）→ 混入 `plainLight`（40% 混色），形成大塊安靜明面。
3. 山脈：對每 mountain（依 id 序）畫 `2 + tier` 層（tier1→3 層、tier3→5 層封頂 4 層）錯位剪影：第 k 層將 mass 多邊形整體平移 `(-3k, -3k)` texel（左上受光），填 `reliefInk`，alpha 由底層 0.20 遞減至頂層 0.12（兩階明暗、非 PBR）；再對 `ridges` 每條折線以 `reliefInk` alpha 0.5、1px 描短脊。
4. 海岸內陰影：對每個 land texel，若其 3×3（或距離 ≤2–4 texel）鄰域含 sea texel → 疊 `reliefInk` alpha 0.18（暖灰）。**不畫任何白/高亮邊**。
5. 多邊形填色以掃描線或逐 texel point-in-polygon（AABB 粗篩）實作，皆決定論。
   **`generateForestTexture` 行為**：透明底；每 forest.polygon 掃描線填 `forestMoss` alpha 209（≈0.82×255）；邊緣以 `washiNoiseValue` 風格 seeded 缺口製造林緣節奏（外輪廓重於內部紋理）。
   **`runGenAssets` 內新增**：`import terrainJson`＋`zTerrainFile.parse`（或直接讀已驗證 JSON）與 `loadOutline` 等價（gen 端可直接 import japan-outline.json＋parse）。生成兩張 → `encodeDeterministicPng` → 寫 `ASSETS_PUBLIC_DIR/textures/terrain-relief@1x.png`、`terrain-forest@1x.png` → `writeAndHash` → push results（id/hashedPath/sha256）。**無 source master**（如 compass，直接即 runtime）。

### 4.6 素材載入：territory 用 `BufferImageSource`（不經 loader）；relief/forest 經 loader

- territory 為 runtime 生成 buffer，不進 manifest、不經 `MapAssetLoader`（直接 `new BufferImageSource`）。
- relief/forest 為 manifest texture，`MapRenderer` 以自持 `MapAssetLoader` `acquire`。**首屏預熱為非阻塞**（`App.tsx:35` `void preloadFirstScreenAssets()` 未 await；Minor 5 處置）：`terrainLoader.acquire` 若在 boot preload 完成前執行，將自行冷載（`Assets.add`＋`Assets.load`，非必為 cache hit），functionally safe；截圖決定論由 `advanceIdleWaiters` 之 `terrainTexturesPending` gate 保證，與 boot 是否已完成無關。`scaleMode:'linear'` 為 texture 預設；為明示，於 `acquire` 後設 `texture.source.scaleMode = 'linear'`。

---

## 5. 既有檔案修改清單

### 5.1 `src/ui/map/MapRenderer.ts`（Slice D）— 核心整合

新增私有欄位：

```ts
private reliefSprite: Sprite | null = null;
private forestSprite: Sprite | null = null;
private waterFeatures: ReturnType<typeof createWaterFeatures> | null = null;
private territoryGrid: TerritoryGrid | null = null;
private territorySprite: Sprite | null = null;
private territoryTexture: Texture | null = null;
private territorySource: BufferImageSource | null = null;
private territoryDirty = false;
private lodStage: LodStage = 'far';
private terrainLoader: MapAssetLoader | null = null;
private terrainTexturesPending = false;
```

新 import：`Sprite, Texture, BufferImageSource`（pixi.js）、`buildTerritoryGrid, recolorTerritory, type TerritoryGrid`（./territoryGrid）、`createTerrainSprite, createWaterFeatures`（./terrain/terrainDraw）、`lodStageForScale, lodStageWithHysteresis, type LodStage`（./lod）、`MapAssetLoader`（@ui/assets/loader）。

`buildLayers`（`MapRenderer.ts:333`）：回傳物件補 5 個新 key（`terrainBase`/`waterFeatures`/`analysisOverlay`/`settlements`/`debug`）。

`init`（`MapRenderer.ts:275`）：

- 於 line 295（`this.app = app`）之後、或 line 299 建 layers 之後，建 `this.terrainLoader = new MapAssetLoader()`（建構本身不 load）。
- **關鍵修正（Blocker 1）**：於 line 303 `this.buildStaticDataLayers()` 之後新增 `this.reconstructTerrainLayers();`（此時 `this.view` 已具 pre-init `updateView` 帶入之真實 view，`this.staticData` 已具 pre-init `setMapData` 之資料）。

`setMapData`（`MapRenderer.ts:789`）之 `if (this.initialized)` 分支（line 792–798，在 `buildStaticDataLayers` 之後、`applyLodAndCulling` 之前）新增 `this.reconstructTerrainLayers();`。
`data === null` 分支：`reconstructTerrainLayers` 內部見 null 即清空（見下），故仍呼叫一次以清 territory grid/sprite/texture/source、water、relief/forest。

新私有整合器與三建構器：

```ts
/** Blocker 1 修正：init() 與 setMapData(initialized) 共用之地形/水系/領地重建路徑。 */
private reconstructTerrainLayers(): void {
  this.buildTerritoryLayer();     // grid＋sprite＋首幀著色（graph 存在即建，與 terrain pack 無關）
  this.buildWaterFeatures();      // data.terrain?.rivers/lakes → waterFeatures（無 terrain 則空）
  this.loadTerrainTextures();     // async fire-and-forget，disposed 防護
}

private buildTerritoryLayer(): void {
  // 清舊（含 detach 以免 app.destroy 或後續重建雙重銷毀）
  if (this.territorySprite) { this.layers?.territory.removeChild(this.territorySprite); this.territorySprite.destroy({ texture: false }); }
  this.territoryTexture?.destroy(true); this.territorySource?.destroy();
  this.territorySprite = null; this.territoryTexture = null; this.territorySource = null; this.territoryGrid = null;
  const data = this.staticData; if (this.layers === null || data === null) return;
  const outline = data.outline ?? loadOutline();
  this.territoryGrid = buildTerritoryGrid(data.graph, outline);         // 同步 ~115ms
  this.territorySource = new BufferImageSource({
    resource: this.territoryGrid.imageData.data, width: this.territoryGrid.size,
    height: this.territoryGrid.size, scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload', label: 'territory',
  });
  this.territoryTexture = new Texture({ source: this.territorySource });
  this.territorySprite = createTerrainSprite(this.territoryTexture); // setSize 4096；position 0,0
  this.territorySprite.alpha = MAPVIEW.territoryAlpha;
  this.layers.territory.addChild(this.territorySprite);
  // Blocker 2 修正：build 當下即以 this.view 首幀著色（比照 buildStaticDataLayers 為 node 上色）。
  recolorTerritory(this.territoryGrid, this.view.districtOwner, data.clanColorIndex);
  this.territorySource.update();
  // 首幀著色不設 territoryDirty、不動 rebuildCounts。
}

private buildWaterFeatures(): void {
  if (this.waterFeatures) { this.layers?.waterFeatures.removeChild(this.waterFeatures.container); this.waterFeatures.destroy(); this.waterFeatures = null; }
  const t = this.staticData?.terrain; if (this.layers === null || t === undefined) return;
  this.waterFeatures = createWaterFeatures(t.rivers, t.lakes);
  this.layers.waterFeatures.addChild(this.waterFeatures.container);
  this.waterFeatures.setStage(this.lodStage);
}

private loadTerrainTextures(): void {
  // 清舊 relief/forest（detach＋destroy，共享 texture 不隨之銷毀）
  for (const s of [this.reliefSprite, this.forestSprite]) if (s) { s.parent?.removeChild(s); s.destroy({ texture: false }); }
  this.reliefSprite = null; this.forestSprite = null;
  const t = this.staticData?.terrain; const loader = this.terrainLoader;
  if (this.layers === null || t === undefined || loader === null) { this.terrainTexturesPending = false; return; }
  this.terrainTexturesPending = true;
  void (async () => {
    try {
      const [relief, forest] = await Promise.all([loader.acquire(t.reliefAssetId), loader.acquire(t.forestAssetId)]);
      if (this.disposed || this.layers === null) return;
      relief.source.scaleMode = 'linear'; forest.source.scaleMode = 'linear';
      this.reliefSprite = createTerrainSprite(relief); this.forestSprite = createTerrainSprite(forest);
      this.layers.terrainBase.addChild(this.reliefSprite); this.layers.terrainBase.addChild(this.forestSprite);
      this.applyLodAndCulling(); // 依 stage 設 forest alpha
    } catch { /* 優雅退回：relief/forest 缺席，seaBackground fallback 底生效（VD5/VD6） */ }
    finally { this.terrainTexturesPending = false; }
  })();
}
```

`applyOwnerDirty`（`MapRenderer.ts` 附近 line 466–475 之 owner-dirty 迴圈）：於既有 `if (dirty.size > 0) this.rebuildCounts.territory += 1;` 之後加 `this.territoryDirty = true;`（僅 dirty.size>0 時）。

`updateView`（`MapRenderer.ts:807`）：於 `this.applyOwnerDirty(view)` 之後、`this.redrawMilitaryObjects()` 之前：

```ts
if (
  this.territoryDirty &&
  this.territoryGrid !== null &&
  this.staticData !== null &&
  this.territorySource !== null
) {
  recolorTerritory(this.territoryGrid, view.districtOwner, this.staticData.clanColorIndex);
  this.territorySource.update();
  this.territoryDirty = false;
}
```

（territory 只吃郡 owner，`recolorTerritory` 簽章即 `districtOwner`；城 owner 不進 territory 格，維持 `view.districtOwner`。）

`applyLodAndCulling`（`MapRenderer.ts:526`）：開頭改為

```ts
const stage = lodStageWithHysteresis(camera.scale, this.lodStage);
this.lodStage = stage;
const nearish = stage !== 'far'; // 取代舊 near（line 545）
const detail = stage === 'near'; // 取代舊 shouldShowDetailLabels(camera.scale)（line 557）
```

移除舊 `const near = lodModeForScale(camera.scale) === 'near'`（line 545）；所有 `near` 用法改 `nearish`（line 548,549,555,556,560），`shouldShowDetailLabels(camera.scale)` 改 `detail`（line 557）——**逐項等價**。結尾（line 561 之後）新增地形/水系/領地：

```ts
if (this.reliefSprite) this.reliefSprite.visible = true;
if (this.forestSprite) {
  this.forestSprite.visible = true;
  this.forestSprite.alpha = FOREST_ALPHA[stage];
}
this.waterFeatures?.setStage(stage);
if (this.territorySprite) {
  const faction = this.view.analysisMode === 'faction';
  this.territorySprite.alpha = faction
    ? MAPVIEW.territoryAlphaFaction
    : stage === 'far'
      ? MAPVIEW.territoryAlphaFar
      : MAPVIEW.territoryAlpha;
}
```

（forest 恆顯，alpha 由 `FOREST_ALPHA[stage]` 給 far 0.35／mid 0.85／near 0.9；relief 恆顯。）

`setCameraPose`（`MapRenderer.ts:663`）：於 `void this.camera.focusOn(...)`（line 666）之後、`applyLodAndCulling`（line 668）之前加 `this.lodStage = lodStageForScale(clampedScale);`（清 hysteresis，preset 決定論）。

`advanceIdleWaiters`（`MapRenderer.ts:227`）：**開頭加**

```ts
if (this.terrainTexturesPending) return; // relief/forest 尚未掛上前不推進 idle，保證截圖含地形（決定論）
```

（e2e `waitMapIdle`＝`waitForIdleFrames(2)`；此確保紋理 attach 後才數兩幀。）

`destroy`（`MapRenderer.ts:745`）：**在既有 `app.destroy(...)`（line 759）之前**新增以下（Major 3 修正——避免 `app.destroy({texture:true})` 直接銷毀與 boot 共享之 relief/forest texture source）：

```ts
// 先 detach＋destroy 地形/領地 sprite，控制 texture 銷毀範圍，再讓 app.destroy 收其餘 display object。
for (const s of [this.reliefSprite, this.forestSprite])
  if (s) {
    s.parent?.removeChild(s);
    s.destroy({ texture: false });
  }
this.reliefSprite = null;
this.forestSprite = null;
if (this.territorySprite) {
  this.territorySprite.parent?.removeChild(this.territorySprite);
  this.territorySprite.destroy({ texture: false });
  this.territorySprite = null;
}
this.territoryTexture?.destroy(true);
this.territoryTexture = null; // 自持 texture，顯式銷毀
this.territorySource?.destroy();
this.territorySource = null;
this.territoryGrid = null;
this.waterFeatures?.destroy();
this.waterFeatures = null; // 顯式，勿依賴 app.destroy
this.terrainLoader?.dispose();
this.terrainLoader = null; // 共享 relief/forest 只經 refcount 釋放
this.territoryDirty = false;
this.terrainTexturesPending = false;
this.lodStage = 'far';
```

（`app.destroy({children:true, texture:true})` 隨後執行時，terrainBase/waterFeatures/territory 容器內已無 display object，故不會銷毀共享 relief/forest texture；territory 自持 texture 已顯式銷毀、sprite 已 detach，無雙重銷毀。boot 仍持有 relief/forest refcount，`terrainLoader.dispose()` 只遞減 refcount、不 `Assets.unload`，StrictMode 重掛 acquire 取得完好共享 texture。）

### 5.2 `src/ui/assets/manifest.ts`（Slice A）

於 `VISUAL_ASSET_MANIFEST` 陣列新增兩筆（contentHash 由 `gen:assets` 產出後填入，遵 AD7 不留 `''`）：

```ts
{
  id: 'texture.terrain.relief@1x',
  runtimePath: 'assets/textures/terrain-relief@1x.png',
  sourcePath: null,
  kind: 'texture',
  authorOrTool: 'tools/gen-assets.ts（程序生成，紙雕分層山脈／平原／海岸內陰影 relief）',
  sourceUrl: null,
  license: 'project-original',
  derivative: false,
  contentHash: '<gen:assets 產出>',
  pixelSize: { width: 2048, height: 2048 },
},
{
  id: 'texture.terrain.forest@1x',
  runtimePath: 'assets/textures/terrain-forest@1x.png',
  sourcePath: null,
  kind: 'texture',
  authorOrTool: 'tools/gen-assets.ts（程序生成，森林群塊冠幅 forest）',
  sourceUrl: null,
  license: 'project-original',
  derivative: false,
  contentHash: '<gen:assets 產出>',
  pixelSize: { width: 2048, height: 2048 },
},
```

`FIRST_SCREEN_ASSET_IDS` 新增兩 id。（A05：texture→`assets/textures/**.png` ✓；A16 預算：+~2.5 MiB < 8 MiB ✓。）

### 5.3 `src/ui/screens/MainScreen.tsx`（Slice D）

`staticData` useMemo 改：

```ts
import { buildTerrainPack } from '../map/terrain/terrainPack';
const staticData: MapStaticData | null = useMemo(() => {
  const game = store.getState().game;
  if (game === null) return null;
  return { ...selectMapStaticModel(game), terrain: buildTerrainPack() };
}, []);
```

### 5.4 `tests/helpers/pixiMock.ts`（Slice D）

`createPixiMockClasses` 回傳型別與物件新增 `Sprite`/`Texture`/`BufferImageSource`/`Assets`：

```ts
class Sprite extends Container {
  texture: unknown;
  anchor = {
    x: 0,
    y: 0,
    set(x: number, y = x) {
      this.x = x;
      this.y = y;
    },
  };
  width = 0;
  height = 0;
  alpha = 1;
  constructor(t?: unknown) {
    super();
    this.texture = t ?? null;
  }
  setSize(w: number, h: number = w) {
    this.width = w;
    this.height = h;
  }
  destroy(_o?: unknown): void {}
}
class BufferImageSource {
  scaleMode = 'linear';
  constructor(_o: unknown) {}
  update(): void {}
  destroy(): void {}
}
class Texture {
  source: { scaleMode: string };
  constructor(o?: { source?: unknown }) {
    this.source = (o?.source as { scaleMode: string }) ?? { scaleMode: 'linear' };
  }
  destroy(_b?: boolean): void {}
}
const Assets = {
  add(_o: unknown) {},
  async load(_k: unknown) {
    return new Texture();
  },
  get(_k: unknown) {
    return new Texture();
  },
  async unload(_k: unknown) {},
};
```

回傳物件加入 `Sprite, Texture, BufferImageSource, Assets`（介面型別同步補）。
（`Rectangle` 已存在；loader.ts import `{ Assets, Rectangle, Texture }` 因而在 mock 下可解析。`destroy` 接受 options 物件以相容 `destroy({texture:false})`。）

### 5.5 `src/ui/map/mapRendererDirty.spec.ts`（Slice D，擴充）

新增 territory sprite dirty 語意測試＋地形/水系正向存在斷言（見 §8）。其餘既有測試**不得改斷言值**。

- **fixture 提供小型合成 outline（Minor 6 處置）**：`makeRenderer()`/`staticData()` 傳入一個環繞其節點座標（100–300 世界座標）的小 box outline（如 `{version:1,source:'test',polygons:[{id:'box',points:[50,50, 350,50, 350,350, 50,350]}]}`），使 `buildTerritoryLayer` 的 `loadOutline()` fallback 不啟用完整 470 點 japan outline，讓 grid 掃描線只掃小陸地範圍、hermetic 且快（recolor 兩趟 ~1M cell 為固定成本，屬 ms 級，非阻塞）。
- `staticData()`（無 terrain）下，`buildTerritoryLayer` 仍建 grid＋sprite（territory 容器 +1 child），但 `rebuildCounts`、nodeMarkers 斷言不受影響（territory sprite 不進任何計數）。

### 5.6 `src/ui/map/MapCanvasHost.spec.tsx`（Slice D，**必改**；B1 處置）

`MapCanvasHost.spec.tsx` 有自帶 inline `vi.mock('pixi.js', …)`（line 20–120，僅定義 `Container`/`Graphics`/`BitmapText`/`Rectangle`/`Application`，**無** `Sprite`/`Texture`/`BufferImageSource`/`Assets`），且不經 `tests/helpers/pixiMock.ts`。整合後 `MapRenderer.init()`（含新 `reconstructTerrainLayers()→buildTerritoryLayer()`）會 `new BufferImageSource(...)`/`new Texture(...)`/`createTerrainSprite(new Sprite(...))`，於此 inline mock 下這些名稱為 `undefined` → `BufferImageSource is not a constructor`，`test:ui` 紅、且破壞 01-A10 StrictMode 重掛洩漏測試（M6-V DoD item 5）。
**必改**：

- 於 inline mock 補上 `Sprite`/`Texture`/`BufferImageSource`/`Assets`（同 §5.4 stub 形狀），使 `setMapData`/`init` 的 territory build 路徑不 throw。
- 新增一則 **territory/terrain 重掛無洩漏斷言**：StrictMode 掛→卸→再掛後，確認每次建立的 territory `BufferImageSource`/`Texture` 皆對稱 `destroy`（以 spy 計數），與既有 Application 對稱 destroy 斷言並列（此檔本即 01-A10 洩漏守門檔）。
- 既有 seaBackground(1)/roads(1)/nodeMarkers(1)/labels(2) child-count 斷言不受影響（新內容落新層）；`world.children` label 序斷言已由 `LAYER_ORDER` 參數化，自動涵蓋 13 層。

---

## 6. 地形地理內容規格（§6）

> 座標指引：作者以 `lonLatToWorld(lon,lat)` 推導，四捨五入落 `terrain.json`。每筆山體／森林／湖泊
> centroid 須以 `pointInPolygon`（`src/data/map/outlineGeometry.ts`）驗證落於某 outline polygon 內
> （河口點允許貼海岸，容差見 §8.1 terrain.spec）。outline 範圍：本州 x559..3157 y1148..3296、
> 九州 x253..822 y3178..3957、四國 x826..1461 y3063..3494。以下世界座標由投影公式預算
> （lonMin128.5/lonMax146.0/latMin30.5/latMax45.8）。

### 6.1 山脈（mountains；密集：東海／近畿）

| id             | 名稱                     | 代表經緯    | 世界座標(約) | tier |
| -------------- | ------------------------ | ----------- | ------------ | ---- |
| mt.hida        | 飛驒山脈（北阿爾卑斯）   | 137.6,36.3  | 2130,2596    | 3    |
| mt.kiso        | 木曾山脈（中央阿爾卑斯） | 137.8,35.7  | 2177,2756    | 3    |
| mt.akaishi     | 赤石山脈（南阿爾卑斯）   | 138.2,35.5  | 2270,2810    | 3    |
| mt.ibuki       | 伊吹山地                 | 136.4,35.42 | 1859,2779    | 2    |
| mt.suzuka      | 鈴鹿山脈                 | 136.4,35.0  | 1859,2891    | 2    |
| mt.kii         | 紀伊山地                 | 135.9,34.1  | 1742,3132    | 2    |
| mt.tanba       | 丹波高地                 | 135.4,35.2  | 1625,2836    | 1    |
| mt.chugoku     | 中國山地                 | 133.3,35.1  | 1123,2863    | 2    |
| mt.shikoku     | 四國山地                 | 133.5,33.8  | 1170,3211    | 2    |
| mt.kyushu-aso  | 阿蘇／九州中央           | 131.1,32.9  | 609,3453     | 2    |
| mt.ou          | 奧羽山脈（東北脊）       | 140.8,39.7  | 2881,1628    | 3    |
| mt.kanto       | 關東山地                 | 138.7,35.9  | 2387,2703    | 1    |
| mt.echigo      | 越後山脈                 | 139.3,37.0  | 2528,2409    | 2    |
| mt.hakone-fuji | 富士／箱根火山群         | 138.7,35.36 | 2387,2846    | 2    |

每 mountain：`mass` 為包住山系走向的凸略橢圓多邊形（6–12 點，長軸沿山脈走向）；`ridges` 為 1–3 條短折線（沿脊線）。tier 決定烘焙層數／alpha（見 §4.5）。

### 6.2 森林（forests；群塊，覆蓋山麓與高地）

沿主要山系山麓與丘陵鋪 8–10 塊 canopy（`polygon` 6–10 點），代表性：
`fo.kiso`(木曾谷森林 ~2150,2700)、`fo.kii`(紀伊 ~1742,3100)、`fo.tanba`(丹波 ~1620,2830)、
`fo.chugoku`(中國 ~1150,2860)、`fo.shikoku`(四國 ~1180,3200)、`fo.kyushu`(九州中央 ~640,3450)、
`fo.ou`(奧羽 ~2860,1700)、`fo.echigo`(越後 ~2520,2420)、`fo.hakone`(富士山麓 ~2400,2860)、
`fo.suzuka`(鈴鹿東麓 ~1900,2890)。外輪廓重於內部（§4.5 林緣節奏）。

### 6.3 河川（rivers；上游→下游，末點河口貼海岸）

| id         | 名稱                                                                                                                 | 上游(約) → 河口(約)                   | widthClass |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------- |
| rv.kiso    | 木曾三川（木曾／長良／揖斐合流）                                                                                     | 2130,2650 → 伊勢灣口 1900,2920        | 3          |
| rv.tenryu  | 天龍川                                                                                                               | 2200,2650 → 遠州灘 2205,2990          | 2          |
| rv.oi      | 大井川                                                                                                               | 2270,2760 → 駿河灣 2255,2960          | 2          |
| rv.fuji    | 富士川                                                                                                               | 2380,2760 → 駿河灣 2360,2900          | 2          |
| rv.yodo    | 淀川（琵琶湖→大阪灣）                                                                                                | 琵琶湖南 1785,2850 → 大阪灣 1620,2985 | 3          |
| rv.yamato  | 大和川                                                                                                               | 1780,2980 → 大阪灣 1620,2990          | 1          |
| rv.kumano  | 熊野川                                                                                                               | 1760,3080 → 熊野灘 1800,3180          | 1          |
| rv.shinano | 信濃川（全國最長，涵蓋中部）                                                                                         | 越後山 2450,2500 → 日本海 2520,2280   | 3          |
| rv.tone    | 利根川（關東；**1560 年注入江戶灣**，非太平洋——利根川東遷為江戶期工程，1654 完工，故 s1560 河口取江戶灣，見 §13-m2） | 2500,2650 → 江戶灣 2500,2820          | 3          |
| rv.chikugo | 筑後川（九州）                                                                                                       | 700,3420 → 有明海 640,3520            | 2          |

河川須沿地形順應（多段折線 4–8 點），末點落海岸線上（河口）。terrain.spec 之「河口末點距海岸≤容差」須採**緊容差**（≤ ~24 世界單位），以攔截 `rv.shinano`/`rv.tone` 等長河河口偏離。

### 6.4 湖泊（lakes；多邊形）

| id        | 名稱   | 中心(約)  | 形狀指引                                           |
| --------- | ------ | --------- | -------------------------------------------------- |
| lk.biwa   | 琵琶湖 | 1779,2824 | 南北長橢圓，8–10 點，範圍 ~x1765..1795 y2775..2880 |
| lk.hamana | 濱名湖 | 2130,2966 | 小型不規則，6 點，範圍 ~x2120..2145 y2952..2980    |

（Biwa centroid 須在本州 polygon 內；Hamana 近海岸，centroid 仍須驗證落陸。）

---

## 7. 切片分解與整合序（§7）

**檔案擁有權嚴格互斥；無兩切片碰同一檔。整合序 B→A→C→D（A 依 B 之 `MAP_PALETTE_HEX`，見 VD7／§13-Major4）。**

### Slice B — token／config／LOD（**最先**）

**擁有檔**：`src/ui/styles/tokens.ts`（改：`MAP_PALETTE_HEX`/`MAP_PALETTE_NUM`）、
`src/ui/map/mapViewConfig.ts`（改：lodNearScale/lodHysteresis/colors 遷移/territoryAlpha*/RIVER_*/FOREST_ALPHA）、
`src/ui/map/lod.ts`（改：`LodStage`＋兩函式）、`src/ui/map/lod.spec.ts`（新）。
**契約產出**：`MAP_PALETTE_HEX`/`MAP_PALETTE_NUM` 鍵；`lodStageForScale`/`lodStageWithHysteresis`/`LodStage`；`MAPVIEW.lodNearScale/lodHysteresis/territoryAlphaFar/territoryAlphaFaction`；`RIVER_WIDTH/RIVER_TAPER_HEAD/TERRAIN_SPRITE_WORLD/FOREST_ALPHA`。
**驗收**：`npm run typecheck`；`lod.spec` 驗三段門檻＋hysteresis＋三 preset 值分類；`tokens.spec` 仍綠（未動 TOKENS.color）。

### Slice A — 地形資料與資產管線（依 B 之 `MAP_PALETTE_HEX`）

**擁有檔**：`src/data/map/terrain.json`（新）、`src/data/schemas/terrain.ts`（新）、
`tools/gen-assets.ts`（改：新增 relief/forest 生成＋runGenAssets 落盤；import `MAP_PALETTE_HEX`）、
`src/ui/assets/manifest.ts`（改：兩筆 texture＋first-screen）、
`public/assets/textures/terrain-relief@1x.png`／`terrain-forest@1x.png`（生成物）、
`tests/data/terrain.spec.ts`（新：schema＋地理健全）、`tests/tools/genAssetsTerrain.spec.ts`（新：determinism）。
**依賴契約**：Slice B（`MAP_PALETTE_HEX`）。
**契約產出**：asset id `texture.terrain.relief@1x`／`texture.terrain.forest@1x`；`terrain.json` shape（§4.1/§6）。
**驗收**：`npm run gen:assets` 雙跑 byte-identical；`npm run validate:assets` 綠（A01–A16）；`npm run validate:data`（terrain.json 經 zod）＋無簡體字；`terrain.spec` 全綠。

### Slice C — 地形／水系繪製

**擁有檔**：`src/ui/map/terrain/terrainDraw.ts`（新）、`src/ui/map/terrain/terrainPack.ts`（新）、
`src/ui/map/terrain/terrainDraw.spec.ts`（新）、`src/ui/map/terrain/terrainPack.spec.ts`（新）。
**依賴契約**：Slice A（terrain.json＋schema＋asset id）、Slice B（`MAP_PALETTE_NUM`/`RIVER_*`/`LodStage`）。
**驗收**：`terrainDraw.spec` 以錄製 mock `Graphics` 驗河（class 分派、taper 逐段線寬、id 序）與湖（fill＋stroke）、`setStage` visible 切換；`terrainPack.spec` 驗 flat→{x,y}、快取、asset id。

### Slice D — 整合器（integrator，**最後**）

**擁有檔**：`src/ui/map/mapViewTypes.ts`（改：LAYER_ORDER＋MapLayers）、
`src/ui/map/MapRenderer.ts`（改：全部接線，含 `reconstructTerrainLayers` 雙路徑、首幀著色、destroy 共享 texture 防護）、
`src/ui/map/mapRendererDirty.spec.ts`（擴充＋合成 outline fixture）、
`tests/helpers/pixiMock.ts`（改：Sprite/Texture/BufferImageSource/Assets）、
`src/ui/screens/MainScreen.tsx`（改：terrain 併入 staticData）、
`src/ui/map/MapCanvasHost.spec.tsx`（**必改**：inline mock 擴充＋重掛洩漏斷言）。
**依賴契約**：Slice B（lod/config）、Slice C（terrainDraw/terrainPack）、Slice A（terrain type shape/asset id）。
**驗收**：`mapRendererDirty.spec` 全綠（含新 territory dirty＋正向存在案例）；`MapCanvasHost.spec` 全綠（LAYER_ORDER 13 序＋擴充 mock）；`npm run test:ui`／`test:core`。

### 整合序

`B`（config/token/lod）→ `A`（依 B 之 `MAP_PALETTE_HEX` 產資料/資產/型別 id）→ `C`（依 A/B 的繪製與 pack）→ `D`（整合）。
B、A 檔案互斥可並行開發，但 A 之 `gen:assets`/hash/測試須待 B 之 `tokens.ts` landed；C 可在 A/B 契約凍結後並行；D 最後整合。**整合唯一檔** `MapRenderer.ts`／`mapViewTypes.ts` 皆歸 D 獨佔。

---

## 8. 測試計畫（§8）

### 8.1 純模組單測

| 測試檔（擁有者）                              | 覆蓋                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/data/terrain.spec.ts`（A）             | zod：合法/非法（座標越界、多邊形奇數長、河<2點）；地理：每 mountain.mass／forest／lake centroid `pointInPolygon(outline)`；河 widthClass∈{1,2,3}；河口末點距海岸≤**緊容差（≤24wu）**；`rv.tone` 河口落江戶灣側（x≈2500,y≈2820）非太平洋；lake Biwa/Hamana 命中本州 |
| `tests/tools/genAssetsTerrain.spec.ts`（A）   | `generateReliefTexture`/`generateForestTexture` 雙跑 rgba byte-identical；relief 海 texel 透明（alpha0）、陸 texel 非透明；forest 大量透明；色取 `MAP_PALETTE_HEX`；無 `Math.random`（行為決定論）                                                                 |
| `src/ui/map/lod.spec.ts`（B）                 | `lodStageForScale`：0.25→far、0.5→mid、1.0→near、1.25→near、0.49→far；`lodStageWithHysteresis`：far 停留至 0.55 才進 mid、mid 退 far 需 ≤0.45、mid 進 near 需 ≥1.1、near 退 mid 需 ≤0.9；同段 idempotent                                                           |
| `src/ui/map/terrain/terrainDraw.spec.ts`（C） | 河 class 分派（far 僅 g3、mid g3+g2、near 全）、taper 首段線寬≈0.4×末段、id 字典序；湖 fill＋stroke 指令；`setStage` visible 矩陣                                                                                                                                  |
| `src/ui/map/terrain/terrainPack.spec.ts`（C） | flat→{x,y} 正確、快取同參考、asset id 常數、rivers/lakes 數量對映 terrain.json                                                                                                                                                                                     |

### 8.2 `mapRendererDirty.spec.ts` 擴充（D）— territory dirty＋地形正向存在（M2 處置）

新 `describe('territory sprite dirty（M6-V5）')`：

- **首繪＋首幀著色**：`setMapData`＋首 `updateView` → territory 容器有 1 sprite child；`territorySource.update` 於 build 當下已被呼叫 ≥1 次（首幀著色，spy）；owner 翻轉計數行為見下。
- **owner 翻轉**：翻一郡 owner → `territory` 計數 +1、`source.update` 再 +1；`nodeMarkers` 僅受影響節點（既有斷言不變）。
- **day-only**：僅 `day` 變 → `territory` 計數不增、`source.update` 不再呼叫（連跑 30 日零增量，沿用既有迴圈斷言）。
- **無 terrain pack**：`staticData()`（無 terrain）→ territory 仍建（sprite 存在）、`waterFeatures` 容器空、terrainBase 空；不崩。

新 `describe('地形/水系正向存在（M6-V5，M2 處置）')`——**堵住「靜默退回平面圖仍 pass」的漏洞**：

- 以帶真實 terrain pack（relief/forest asset id＋一河一湖）之 `staticData` 呼 `setMapData`，await 一個 microtask/idle 週期（`loadTerrainTextures` 之 mock `Assets.load` 同步 resolve mock Texture）後斷言：`layers.terrainBase.children.length === 2`（relief＋forest 皆掛上）、`layers.waterFeatures` 之 container 含預期 river/lake `Graphics`（非空）。此為 M6-V DoD item 3「layer-presence smoke」的 mock 版，確保地形確有渲染而非靜默 fallback。
- **app 序回歸守門（Blocker 1 處置）**：新增一則以**實機 effect 序**重現的測試——先 `setMapData(data)`（`initialized===false`）、再 `updateView(view)`、**最後** `await init(host,handler)`，斷言 init 完成後 `layers.territory` 有 sprite child、且首幀著色已跑（`source.update` 被呼叫）。此序與既有 `makeRenderer`（先 init 後 setMapData）相反，專防 builder 只掛 setMapData-initialized 分支之回歸。

### 8.3 jsdom 可測/不可測

- **不可測**：實際 GPU texture upload、relief/forest 像素外觀、composite 明暗透光 → 由 e2e baseline 人工核（§9.3）。
- **可測（mock 下）**：layer 結構、child 掛載（含 terrainBase 2 child 正向存在）、dirty 計數、`source.update` 呼叫次數、alpha/visible 由 stage 設定（可斷言 `territorySprite.alpha`、`forestSprite.alpha`）、LOD 純函式、app-序 build 回歸、重掛 texture 對稱 destroy。
- territory/terrain texture 路徑須以擴充 pixiMock（含 `MapCanvasHost.spec` inline mock）保證 jsdom 不 throw。

### 8.4 e2e

- `e2e/visual.spec.ts` **不改**（三 preset 已存在）；baseline 三張重生（獨立 commit，§9）。
- 完整 e2e layer-presence smoke（跨真實 WebGL）**屬 V11**；本階段以 §8.2 的 mock 版正向存在斷言涵蓋 DoD item 3 的單元層面。

---

## 9. Gate 清單與 baseline 程序（§9）

### 9.1 orchestrator gate 指令序（依 plan/18 §3.13）

```
npm run typecheck
npm run lint
npm run gen:assets           # 產 relief/forest PNG，印 sha256（須先 landed Slice B 之 MAP_PALETTE_HEX）
# 將印出 sha256 貼回 manifest.ts 兩筆 contentHash
npm run gen:assets           # 再跑一次，確認 byte-identical（determinism）
npm run validate:assets      # A01–A16 綠（含 A11 hash、A16 預算）
npm run validate:data        # terrain.json zod＋簡體字掃描＋字型涵蓋
npm test                     # 全 vitest（core＋ui；含 dirty spec、正向存在、app 序、lod、terrain、gen determinism）
npm run build
npm run e2e                  # build＋Playwright smoke（chromium）
# 確認地形/領地顯示無誤後，再單獨更新視覺 baseline：
npm run e2e:visual:update    # darwin
```

**禁**：`npm run golden:update`（golden 未變，core 未動）。

### 9.2 baseline 再生（darwin＋linux）

- darwin（開發機）：`npm run e2e:visual:update`。
- linux（CI parity）：於 docker `mcr.microsoft.com/playwright:v1.61.1-noble` 掛載 repo 跑同指令，再 in-container `npm run e2e:visual` 確認重現。
- baseline 檔：`e2e/visual.spec.ts-snapshots/strategy-{overview,operational,close}-chromium-{darwin,linux}.png`。
- **獨立 commit**（plan/17 §3.9.3.1），PR 附 before/after＋對應 art-bible 條目（§6.1/§6.2/§4.2/§5）＋reviewer 核准。

### 9.3 眼驗收（提交 baseline 前；含 M3/m1/m3/Minor7 處置）

1. far(0.25)：紙浮雕日本——山系剪影可見、**綠森林帶（alpha 0.35）**、藍河湖（琵琶湖/濱名湖可辨）、柔染勢力領地（0.65）；**非單色多邊形**。
2. **far 領地-地形透光複合閘（M3 處置，pass/fail 明確）**：於 far 0.65 染色壓在有主陸地上，**山脈剪影與海岸暗面須仍可辨識透出**（染色不得吃掉地形明暗，art-bible §6.2）。若不可辨，依序調整槓桿：(a) 大面積用之領地 clan 填色降飽和、(b) 降 far alpha、(c) 加一道極淡 relief-over-territory pass。此為驗收必過項，非「照抄數字即可」。（territoryMaxDist=260 外之荒野/山地為透明領地，relief 本即透出——`territoryGrid.ts:266`。）
3. mid(0.5)：東海走廊個別山脈/森林結構化；次要河（class2）出現；郡界/城名可讀；領地 0.45。
4. close(1.25)：局部紙雕紋理**乾淨無噪點**；河湖銳利（class1 出現）；森林邊緣**輪廓可讀（boundary visible，非銳邊；relief 單張 2048² 於 4096 世界＝0.5 texel/world，close 為 linear 上採 ~2.5× 的柔和紙雕過渡，m1 處置）**；領地淡染、roads/城/標籤在上仍清楚。
5. **無白色海岸線**（全段）；海岸暖灰內陰影於 **mid/near 可見**（far 為次像素、幾不可見，屬正常，勿以此判 far baseline 失敗，m3 處置）；地形不蓋過道路/節點（次要地景 alpha 低於 roads/nodes）。
6. **無 relief/海 海岸接縫**（Minor 7 處置）：relief 陸地遮罩與 `seaBackground` 陸地多邊形於 0.25 不現明顯 fringe；因兩者同用 `landBase` 底色，僅陸緣過渡可接受。
7. StrictMode 重掛後無 WebGL context lost、heap/texture 回穩態；relief/forest 共享 texture 未被 `app.destroy` 銷毀（重掛後地形仍顯）。

---

## 10. plan §8 回寫草稿（§10）

於 `plan/04-map-and-movement.md` §8.1 末新增（**不改 §00**）：

> **2026-07-17（[M6-V5] 地形／水系／領地與三級 LOD；T15 部分落地）**：依 §3.10.1–§3.10.3 落地
> `terrainBase`/`waterFeatures`/`territory` 三層與 far/mid/near LOD，逐項裁決：
> (1) **13 層一次補齊**：`LAYER_ORDER` 由 8 擴為 §3.10.1 全 13 層，多出者（`analysisOverlay`/`settlements`/`debug`）
> 為空 `Container`，避免 V6–V10 反覆改序（`buildLayers` 已泛型化，`MapCanvasHost.spec` label 序斷言參數化自動涵蓋）。
> (2) **relief/forest 為烘焙紋理、河湖為 runtime 向量**：`MapStaticData.terrain.reliefAssetId`/`forestAssetId`
> 對映 `tools/gen-assets.ts` 程序生成之 2048² PNG；`rivers`/`lakes` 以 `waterFeatures` 向量繪製（widthClass→線寬、
> 上游細下游寬 taper）。原始向量落 `src/data/map/terrain.json`（新 zod schema `src/data/schemas/terrain.ts`），
> 座標以 `lonLatToWorld` 由公有領域地理推導、`pointInPolygon` 驗證落陸。史地修正：`rv.tone`（利根川）河口
> 取 **1560 年江戶灣**而非太平洋（利根川東遷屬江戶期工程）。
> (3) **`terrain` 維持 optional（不改必填）**：偏離原 reserved 註解「V5 填值後改必填」。理由：改必填逼所有測試
> fixture 補 terrain，且牴觸「資產載入失敗須優雅退回平面渲染、絕不崩潰」；`seaBackground` 維持海＋陸多邊形
> fallback 底。填充於 UI 邊界（`MainScreen` `{...selectMapStaticModel, terrain: buildTerrainPack()}`），
> core `selectMapStaticModel` 不 import terrain（純度／golden 不動）。
> (4) **territory 接 `Sprite`＋首幀著色**：既有 `buildTerritoryGrid`/`recolorTerritory` 接 `BufferImageSource`＋`Texture`＋`Sprite`
> （1024²→4096 世界，scale 4，`scaleMode:'linear'`）。**build 當下即以 `this.view.districtOwner` 首幀著色**
> （比照 `buildStaticDataLayers` 為 node 上色），owner dirty 於 `updateView` 同幀至多一次
> `recolorTerritory`＋`source.update()`，沿用 `rebuildCounts.territory` 訊號（`MapRebuildCounts` 欄位不變）。
> alpha：一般 0.45／far 0.65／faction 0.85。
> (5) **三層/領地於 `init()` 與 `setMapData` 兩處建構**：因實機 React effect 序為 `init`（async 未 resolve）→
> `setMapData`（`initialized===false`）→ `updateView`（`initialized===false` early-return），故地形建構器須在
> `init()`（`buildStaticDataLayers` 之後）鏡像呼叫，否則實機/fixture 永遠空地形。
> (6) **三級 LOD＋hysteresis**：`MAPVIEW.lodNearScale=1.0`、`lodHysteresis=0.1`；`lodStageForScale`（純分類，
> `setCameraPose` 用，preset 決定論）＋`lodStageWithHysteresis`（滾輪防閃）。既有 roads/nodeMarkers/labels
> 以 `nearish=stage!=='far'`、`detail=stage==='near'` 逐項等價對映，零行為變更；mid/near 細分僅地形/水系/領地新消費。
> (7) **forest 於 far 低 alpha 顯示（刻意偏離 §3.10.3/art-bible §5 LOD 表）**：spec 將森林群塊列 operational/mid，
> 本設計於 far 以 alpha 0.35 顯示 forest，直接回應使用者「米黃平面陸地」抱怨、於 overview 提供綠塊層次
> （DoD 只要求 far 不退單色、可辨山系/水系，未禁 far 森林）。mid 0.85／near 0.9。
> (8) **地圖色票遷移**：art-bible §3.2 十色落為 `src/ui/styles/tokens.ts` 之 `MAP_PALETTE_HEX`/`MAP_PALETTE_NUM`
> 具名常數（獨立於 `TOKENS.color`）；`MAPVIEW.colors.sea/land/neutral` 遷移為引用。road* 三色先落常數、V6 消費。
> `tools/gen-assets.ts` import `MAP_PALETTE_HEX`，故資產切片依賴 token 切片（整合序 B→A→C→D）。
> (9) **StrictMode texture 生命週期**：relief/forest 為與首屏 boot 共享之 texture，`destroy()` 先 detach 並
> `sprite.destroy({texture:false})`、共享 source 只經 `terrainLoader.dispose()` refcount 釋放，避免
> `app.destroy({texture:true})` 直接銷毀共享 texture 致重掛取到已銷毀 texture。territory 自持 texture 顯式銷毀。
> 依據：M6-V5 技術設計（4 slice：config/lod、資料/資產、地形繪製、整合）；18-roadmap M6-V5；
> CLAUDE.md 鐵律①②；`test:core` golden/replay/determinism 全綠（stateHash 未變）；baseline 更新獨立 commit。

---

## 11. Commit 計畫（§11，依 plan/18 §3.13；整合序 B→A→C→D）

1. `feat(map): M6-V5 地圖色票落 token 與三級 LOD [M6-V5]`（**Slice B 先行**：tokens MAP_PALETTE＋mapViewConfig（含 FOREST_ALPHA）＋lod＋lod.spec）。
2. `feat(data): M6-V5 terrain 向量原始資料與 zod schema [M6-V5]`（Slice A：terrain.json＋schema＋terrain.spec）。
3. `feat(assets): M6-V5 relief／forest 紙雕紋理生成管線 [M6-V5]`（Slice A：gen-assets（import MAP_PALETTE_HEX）＋manifest＋PNG＋determinism spec）。
4. `feat(map): M6-V5 地形／水系繪製與 terrain pack [M6-V5]`（Slice C：terrain/*）。
5. `feat(map): M6-V5 terrainBase／waterFeatures／territory Sprite 接線 [M6-V5]`（Slice D：mapViewTypes/MapRenderer（含 reconstructTerrainLayers 雙路徑、首幀著色、destroy 防護）/MainScreen/pixiMock/dirty spec/MapCanvasHost.spec）。
6. `test(visual): 更新 M6-V5 三段 baseline（地形／水系／領地）[M6-V5]`（**獨立** baseline commit，附 before/after＋art-bible 條目）。
7. `docs(plan): 回寫 04 §8 M6-V5 設計決策 [M6-V5]`（§10 草稿）。

（2–5 可依整合序合併為較少 commit，但 Slice B（1）須早於 A（2–3），baseline（6）與 plan 回寫（7）**須獨立**。每則含 `[M6-V5]` tag。）

---

## 12. 風險與回滾（§12）

| 風險                                                               | 影響                                 | 緩解／回滾                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| relief/forest PNG 過大破 8 MiB 預算                                | validate:assets A16 紅               | 兩張合計 ~2.5 MiB 遠低；若超，降 forest 為 1024²（**須重測 near 森林輪廓可讀，m1**）或提高 deflate；最劣移出 first-screen 改 lazy                                                                                                    |
| 1024² territory grid 同步建構卡 setMapData/init                    | 載入期 ~115ms jank                   | 一次性、載入期、perf gate <200ms 內；dirty-spec 以小型合成 outline 保 hermetic（Minor 6）；若回歸改 idle 排程（`terrainTexturesPending` 機制已預留）                                                                                 |
| 地形/水系/領地只掛 setMapData-initialized 分支                     | **實機空地形（Blocker）**            | `reconstructTerrainLayers` 於 `init()`＋`setMapData` 兩處呼叫；§8.2 app 序回歸測試守門                                                                                                                                               |
| 領地首幀未著色（依賴 post-init updateView）                        | **領地全透明（Blocker）**            | `buildTerritoryLayer` build 當下以 `this.view` 首幀 `recolorTerritory+update`；§8.2 首繪斷言                                                                                                                                         |
| `app.destroy({texture:true})` 銷毀共享 relief/forest texture       | **重掛地形空白（Major）**            | destroy 先 detach＋`destroy({texture:false})`；共享 source 只經 `terrainLoader.dispose()` refcount 釋放；§9.3-7 眼驗收                                                                                                               |
| gen-assets 依賴未 landed 之 `MAP_PALETTE_HEX`                      | Slice A 無法 build/run               | 整合序 B→A；A 之 gen:assets/hash/測試待 B landed（§7）                                                                                                                                                                               |
| MapCanvasHost.spec inline mock 缺 Sprite/Texture/BufferImageSource | test:ui 紅（`is not a constructor`） | Slice D 明列 MapCanvasHost.spec 必改，補四類 stub＋重掛洩漏斷言（§5.6）                                                                                                                                                              |
| pixiMock 擴充不足致 UI 測 throw                                    | test:ui 紅                           | Slice D 擴 helper＋inline 兩處 mock；loader.ts import `{Assets,Rectangle,Texture}` 皆備                                                                                                                                              |
| hysteresis 使截圖非決定論                                          | baseline 抖動                        | `setCameraPose` 先 `lodStageForScale` 清狀態，preset 純分類、不吃死區（lod.spec 驗）                                                                                                                                                 |
| 紋理載入未及首幀致 baseline 缺地形                                 | 截圖不穩                             | relief/forest 列 first-screen 預熱（**boot preload 非阻塞、未必 cache hit，terrainLoader 可能冷載，functionally safe，Minor 5**）；`advanceIdleWaiters` 於 `terrainTexturesPending` 時不推進，`waitMapIdle` 保證紋理 attach 後才數幀 |
| far 領地 0.65 染色吃掉地形明暗                                     | art-bible §6.2 違反                  | §9.3-2 複合閘明確 pass/fail＋三槓桿（降飽和/降 alpha/relief-over pass）                                                                                                                                                              |
| forest far 0.35 綠塊糊成一片                                       | far 視覺劣化                         | 外輪廓重於內部、alpha 低；眼驗收 §9.3-1 核，必要時降至 0.25 或退回 relief-only far（回寫 §10-(7)）                                                                                                                                   |
| `MapRebuildCounts` 誤加欄位                                        | dirty spec `toEqual` 紅              | 明令不加欄位，territory 沿用既有計數                                                                                                                                                                                                 |
| terrain.json 座標落海／河口偏離                                    | 山/湖懸空、河口離岸                  | terrain.spec `pointInPolygon` 驗每 centroid 落陸＋河口緊容差（≤24wu），CI 阻斷                                                                                                                                                       |
| 白色海岸線違規                                                     | art-bible 硬違反                     | relief 烘焙暖灰內陰影、seaBackground 無描邊；眼驗收 §9.3-5                                                                                                                                                                           |

**整體回滾**：本里程碑全在 `src/ui`／`src/data`／`tools`／assets，core 與 golden 零觸。若 far 視覺不達標，
可暫時只交付 territory Sprite＋LOD（Slice B/D 局部），terrain 紋理（A/C）延後——DoD「領地翻轉下一幀」與
「far 不退單色」由 territory＋relief 任一達成，具漸進交付彈性。

---

## 13. 審查處置表（§13）

### 13.1 CRITIQUE 1（spec/visual）

| 編號 | 摘要                                                                                                                                                         | 處置                     | 對應變更                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | `MapCanvasHost.spec.tsx` 自帶 inline mock 缺 Sprite/Texture/BufferImageSource/Assets，整合後 `setMapData`/`init` 之 territory build 崩、破壞 01-A10 洩漏測試 | **接受**                 | §5.6 列 `MapCanvasHost.spec.tsx` 為 Slice D **必改**：補四類 stub＋新增重掛 texture 對稱 destroy 斷言；VD9、§7 Slice D、§12 風險表同步                                                               |
| M1   | 內部矛盾：§1.1/§9.3 稱 far 見森林帶，但 VD3/applyLodAndCulling 於 far 隱 forest；spec LOD 表列 forest 於 mid                                                 | **接受（取偏離選項 b）** | VD3 表 forest far 由「隱」改 alpha 0.35（`FOREST_ALPHA`）；applyLodAndCulling forest 恆顯；§1.1/§9.3 保留森林帶並標為刻意偏離；回寫 §10-(7)。理由：直接回應使用者「米黃平面」抱怨、DoD 未禁 far 森林 |
| M2   | 無自動證明地形確有渲染；靜默 fallback 平面圖仍 pass                                                                                                          | **接受**                 | §8.2 新增「地形/水系正向存在」describe（mock 下斷 terrainBase 2 child＋waterFeatures 非空）＋app 序回歸測試；涵蓋 DoD item 3 單元層面                                                                |
| M3   | far territory 0.65 染色壓 relief 恐吃掉地形明暗、近似「單色多邊形」                                                                                          | **接受**                 | §9.3-2 升為明確 pass/fail 複合閘＋三槓桿（降飽和/降 alpha/relief-over pass）；§12 風險表列入                                                                                                         |
| m1   | near 解析度天花板：relief 0.5 texel/world 上採，森林邊緣為柔和過渡非銳邊                                                                                     | **接受（釐清，無碼改）** | §1.1、§9.3-4 明訂「輪廓可讀 boundary visible，非銳邊」；1024² fallback 須重測 near（§12）                                                                                                            |
| m2   | `rv.tone`（利根川）河口置太平洋，1560 年應注入江戶灣（東遷為江戶期工程）                                                                                     | **接受**                 | §6.3 rv.tone 河口改江戶灣 ~2500,2820；§8.1 terrain.spec 斷言河口在江戶灣側；回寫 §10-(2)                                                                                                             |
| m3   | 海岸內陰影 2–4 texel 於 far 次像素、幾不可見；§9.3-4 屬 mid/near 項                                                                                          | **接受（釐清）**         | §9.3-5 標海岸陰影為 mid/near 可見項，勿以此判 far baseline 失敗；VD5 補述                                                                                                                            |

### 13.2 CRITIQUE 2（engineering）

| 編號      | 摘要                                                                                                                     | 處置     | 對應變更                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker 1 | 地形/水系/領地只掛 `setMapData` 之 `if(initialized)` 分支；實機序 init(async)→setMapData(未 init)→updateView，故永不建構 | **接受** | §5.1 新增 `reconstructTerrainLayers()`，於 `init()`（buildStaticDataLayers 後）＋`setMapData`(initialized) 兩處呼叫；§8.2 app 序回歸測試；VD4、§10-(5)                            |
| Blocker 2 | territory 建好但首幀未著色（recolor 只在 updateView，fixture 之 viewState 穩定參考 post-init 不再觸發）                  | **接受** | `buildTerritoryLayer` build 當下以 `this.view.districtOwner` 首幀 `recolorTerritory+source.update()`；VD4、§8.2 首繪斷言、§10-(4)                                                 |
| Major 3   | `app.destroy({texture:true})` 直接銷毀與 boot 共享之 relief/forest texture，重掛取到已銷毀 texture                       | **接受** | §5.1 destroy 於 `app.destroy` 前 detach＋`sprite.destroy({texture:false})`；共享 source 只經 `terrainLoader.dispose()` refcount；territory 自持 texture 顯式銷毀；§9.3-7、§10-(9) |
| Major 4   | Slice A（gen-assets）需 import `MAP_PALETTE_HEX`，該常數屬 Slice B（tokens.ts），故 A 依賴 B；原序 A→B 死鎖              | **接受** | 整合序改 **B→A→C→D**；§7、VD7、VD10、§11 commit 序、§12 風險表同步                                                                                                                |
| Minor 5   | 「首屏已預熱 cache hit」不準：`preloadFirstScreenAssets` 未 await，terrainLoader 可能冷載                                | **接受** | §4.6、§12 風險表更正為「非阻塞、未必 cache hit、terrainLoader 可能冷載，functionally safe，決定論由 terrainTexturesPending gate 保證」                                            |
| Minor 6   | dirty-spec 每測跑完整 1024² build＋recolor（含 470 點 japan outline），慢＋~6MB 配置                                     | **接受** | §5.5 dirty-spec fixture 傳入環繞節點座標之小型合成 outline，掃描線只掃小陸地、hermetic；recolor 固定成本 ms 級可接受                                                              |
| Minor 7   | seaBackground 陸多邊形與 relief 陸遮罩非像素一致，overview 可能現海岸 fringe                                             | **接受** | §9.3-6 新增「無 relief/海 海岸接縫」眼驗收；VD5 補述（同 landBase 底色，僅陸緣過渡可接受）                                                                                        |

**無拒絕項**：兩份審查之所有 blocker/major/minor 均已對 repo 原始碼驗證為真並納入設計。
