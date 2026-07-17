# M6-V7 技術設計文件（最終版）：城池／郡／聚落（平城／山城輪廓、耐久／受攻／警戒、城下低對比地景、選取環）

版本：Opus REVISER 交付（已納入 spec/visual 與 engineering 兩份對抗性審查，逐條處置見 §13）。
實作 agent 僅依本文件＋四份 brief（brief-specs／brief-architecture／brief-assets／design-m6v5-final）＋已 landed 的 **M6-V6 final 設計**（`design-m6v6-final.md`）施工。
語言：繁體中文（台灣慣用語）；程式契約為 TypeScript。所有路徑語意根為 `/Users/tigercosmos/nobunaga_ambition`。

> 前置事實（皆已對現行 working tree〔commit `49f18c5`，M6-V5 已 committed〕與 `design-m6v6-final.md` 驗證；**M6-V6 於本階段之前 landed，其決定視為既有架構**）：
>
> - `nodeMarkers`(z=7) 目前由 `MapRenderer.buildStaticDataLayers()`（`MapRenderer.ts:429-441`）為每節點建**單一 `Graphics`**（`this.nodeParts: Map<id,{graphics,kind}>`，`MapRenderer.ts:126`），以**占位** `drawNodeMarker`（`mapDraw.ts`，`MapRenderer.ts:39` import、`:440`／`:632` 呼叫）繪製。node 於 **build 時即 `drawNodeMarker` 一次（首繪、不計數）**（`:439-440`）；`applyOwnerDirty`（`:616-637`）做 owner diff 後對 dirty 節點 `clear()`+`drawNodeMarker`＋`rebuildCounts.nodeMarkers += 1`（**計數在 updateView，非 build**）。**本階段核心：以 `sceneParts/castleNode`／`districtNode` 之元件取代裸 `Graphics`，徹底移除 `drawNodeMarker` 呼叫（DoD 硬項）。**
> - `sceneParts/castleNode.ts`（`createCastleNode`/`drawCastleNode`／`CASTLE_NODE_GEOMETRY`／`durabilityRingColor`／`drawDurabilityRing`）、`districtNode.ts`、`selectionRing.ts`（`createSelectionRing`／`drawSelectionRing`／`SELECTION_RING_GEOMETRY`）**皆已實作＋單測，但未被 `MapRenderer` import（dead code）**。三者現皆為 `ScenePart<P>`（`{ container, update(props):void, destroy() }`，`src/ui/components/types.ts:35-38`）；繪製函式僅用 `Graphics` 方法子集，於 node 環境可用「錄製 mock」（`tests/ui/sceneParts/recordingGraphics.ts`）驗證。
> - `castleNode.update`（`castleNode.ts:161-172`）**目前於 `props.pos` 變更時 `container.position.set(props.pos.x, props.pos.y)`**；`durabilityRingColor(ratio)`（`:92-95`）三段變色：`ratio > UI.durabilityRingWarn(0.6)`→`accentMossBright`（綠）、`> durabilityRingDanger(0.3)`→`accentGold`、else→`accentVermilionBright`（朱）。**耐久環顏色僅由 ratio 決定；與圍城 warning 是兩條獨立通道**（見 CD7、§6.3）。
> - `settlements`(z=6) 為 V5 建立之**空 `Container`**（`MapLayers.settlements`）。`nodeMarkers` 在其上（z=7），聚落天然被城池壓在下方（母題「不可比城池本體更清楚」）。
> - `MapViewState.castles[]`（= core `MapCastleViewModel`，`selectors.ts:530-532,595-615`）已攜帶 `{ id, ownerClanId, durability, maxDurability, tier, terrainKind:'plain'|'mountain', siegeMode, warning }`；`terrainKind` **V4/V5 為佔位恆 `'plain'`**（`selectors.ts:588`）——本階段填真值。`warning` 由 `siegeMode` 推導（`selectors.ts:605-606`：assault→`critical`、encircle→`threatened`、否則 `none`）。
> - `MapViewState.selection`（`'node'|'army'` 或 null）自 V4 攜帶；**V6 Slice E 已消費**它：`MapRenderer` 有 `roadHighlight`（`selectionAndPath` 層，`prevSelectionKey` dirty 追蹤，`design-m6v6-final.md` §4.3/§5.1），選取節點時金色高亮**相鄰道路**。**V7 之節點選取環必須與此協調、共用 `prevSelectionKey`。**
> - **V6 Slice F 已把 fixture 選取由「軍隊」改為 `VISUAL_ANCHOR_CASTLE_ID`（駿府本城）**：`visualMapBoot.ts` 現行 `setSelection({kind:'army',...})`（`visualMapBoot.ts:62`）**已被 V6 改為 `setSelection({kind:'castle', id: VISUAL_ANCHOR_CASTLE_ID})`**（`design-m6v6-final.md` §5.6/line 428）；`composeMapViewState`（`composeMapView.ts:38-41`）將 `'castle'|'district'`→`'node'`，故 `MapViewState.selection = {kind:'node', id:'castle.sunpu'}`。**故 landed-V6 之後，fixture 已預選駿府節點**——V7 之節點選取環在三段 baseline 皆可見（DoD item 2）。**V7 不需擁有／改動 `visualMapBoot.ts` 或其 spec（V6 Slice F 已完成，golden 安全：selection 走 UI store，不進 GameState）。**（V7 節點環 vs V8 軍隊環之單一 selection 槽衝突，見 CD5。）
> - V6 已將 `roads` 改為 `RoadsLayer` 子容器、`applyLodAndCulling` 之 roads 恆顯＋per-stage 線寬、`labelParts` 之 `kind` 擴為 `'castle'|'district'|'province'|'road'`、新增 `MAPVIEW.hitMinCssRadius`／道路名。**V7 不動 roads/labels/interaction 既有行為。**
> - `SiegeMarker`（`effects` z=10，`createSiegeMarker`）為 **live**，由 `view.sieges` 驅動、`onTick` 逐幀旋轉、`reducedMotion` 凍結。**V7 保留 SiegeMarker 不動**（城被圍之外圈弧由它畫），castleNode 只負責城體本身之受攻/警戒**徽記**。
> - **pixi mock 事實（B1 依據）**：`tests/helpers/pixiMock.ts` 之 `Container`（`:58`）僅有 `addChild`/`removeChild`/`removeChildren`——**無 `getChildIndex`、無 `addChildAt`**；`MapCanvasHost.spec.tsx` 自帶 inline mock 同。全樹 `addChildAt` 使用數＝0（`design-m6v6-final.md` line 17）。**V7 選取環掛載一律用 plain `addChild` 插入序決定 z-order，禁用 `addChildAt`/`getChildIndex`。**
> - **fixture golden 安全性（已驗證）**：golden 只覆蓋 scenario `'mini'`（`tests/golden/goldenRunner.ts:85`）；`debug-visual-map-01`（`debugVisual.ts`）**不在 golden/replay 路徑**，其消費者為 `tests/visual/debugVisual.spec.ts`＋`tests/app/visualMapBoot.spec.tsx`＋視覺 e2e。**故對 `debugVisual.ts` 之耐久/圍城 fixture 資料編修為 golden byte-identical 安全**（見 CD8）。
> - **fixture 耐久快照事實（CD8 依據）**：`debugVisual.ts` 之城建構（`:169-192`）目前 `maxDurability: p.durability`（**= durability，故 ratio 恆 1.0、耐久環恆綠**）；5 城耐久皆滿（`:503/517/531/545/559`＝`BAL.durabilityMain/Branch`）。**現況三段 baseline 完全看不到耐久環三色門檻，也沒有 threatened 警戒態**（唯一圍城為駿府 assault→critical）。CD8 修正之。

---

## 1. 目標與範圍（Goal / Scope）

### 1.1 使命

把「城＝五邊形占位、郡＝菱形占位、無城型差異、無城下地景、選取不可見」升級為 **俯視沙盤中的紙雕城郭**：

- **本城＝五角／不規則外郭＋二階內主郭；支城＝四角郭**，overview 只看輪廓即可分辨本／支城與歸屬。
- **平城＝水平展開、矮郭、護城河短弧；山城＝垂直堆疊、三角岩基、窄郭**，operational 起不靠文字即可分辨。
- **歸屬＝郭內勢力色填面＋ `ink900` 統一描邊**（不同勢力共用同一資產家族，只換填色）；**35° 假等角紙雕**：左上受光、右下 2–3px 投影。
- **耐久環**（close 顯示缺口/段數與三色門檻；overview 僅被圍/瀕危顯示狀態環）、**受攻**（固定裂口徽記＋靜態朱紅光暈）、**警戒**（金色小烽火）、**選取**（金色雙環，錨點置中）。
- **城下聚落**：低對比屋頂群＋田畦，程序生成、決定論、只在 close 顯示、不蓋過城池/道路。
- **郡節點**沿用既有空心圓印家族（明確異於城郭）。
- **不再呼叫占位 `drawNodeMarker`（DoD 硬項）。**

### 1.2 交付內容

1. `castleNode.ts` 幾何擴充：平城/山城 × 本城/支城四型剪影＋右下投影＋二階主郭；`bodyGfx`/`ringGfx`/`warnGfx` 三子 `Graphics` 分離以支援 LOD 逐項顯隱與**只放大剪影（不放大環/徽記）**；`CastleNodeProps` 擴 `terrainKind`/`warning`；新增 `setLodStage`（含 far 本城剪影 ×1.4 boost）。**`update` 維持回傳 `void`（不改 `ScenePart<P>` 契約，見 AD2）。**
2. `districtNode.ts`：新增 `setLodStage`（no-op 佔位以統一介面）、`DistrictNodeProps` 之狀態欄改為可選（無狀態資料時預設直轄點）；`update` 維持 `void`。
3. `selectionRing.ts`：改繪 **金色雙環**（art-bible §6.4「選取：金色雙環」）；`update` 維持 `void`。
4. `settlements/settlementsDraw.ts`（新）：程序生成城下屋頂群＋田畦（seeded、決定論），只繞**本城**，靜態一次建、LOD `visible` 於 close 顯示。
5. `MapRenderer` 整合：`nodeParts` 由裸 `Graphics` 改為 `CastleNodePart`/`DistrictNodePart`；`applyOwnerDirty` 擴為「owner 訊號（territory 用，不變）＋節點視覺簽章 diff」；選取環接線（與 V6 `prevSelectionKey` 共用、plain `addChild` 插序）；聚落建構；LOD 顯隱/剪影放大；徹底移除 `drawNodeMarker`。
6. 城型資料來源：`terrainKind` 落 `castles.json`＋`zCastle` schema，view 邊界以 `castleTerrainLookup(scenarioId)` 供給（scenario 分派，fixture 走葉模組 `debugVisualCastleTerrain.ts`）；`selectMapViewModel` 填真值。**GameState/golden byte-identical**（builder 不搬 terrainKind）。
7. `MapViewState.districts?`（可選）新增，供 districtNode 之知行/制壓/一揆次級狀態（golden 安全 view-model 擴充；fixture 皆 null → baseline 無差異）。
8. **fixture DoD 佐證資料（`debugVisual.ts`，golden 安全）**：讓耐久環三色門檻與雙警戒態在三段 baseline 真正可見——駿府 25%（vermilion 環＋critical 光暈）、掛川 45%（gold 環＋threatened 烽火，新增 encircle 圍城）、其餘滿耐久（綠環）。見 CD8。

### 1.3 硬約束（違反即 CI 紅燈）

- `src/core/` 維持純 TS（無 React/Pixi/DOM、無 `Math.random`/`Date.now`）。**`GameState`／golden byte-identical，禁 `npm run golden:update`；13 步 daily tick 零變更。** `castleTerrainLookup`／`selectMapViewModel` 之 `terrainKind`／`districts` 皆 **view-model**；`terrainKind` **不進 GameState `Castle`**（builder 不搬）。**`debugVisual.ts` 之耐久/圍城 fixture 資料編修為純資料（無 Math.random/Date.now），且 debug-visual 不在 golden 路徑，golden 不受影響（CD8）。**
- 渲染常數進具名常數（`CASTLE_NODE_GEOMETRY`／`SETTLEMENT`／`SELECTION_RING_GEOMETRY`），**不進 `BAL`**。顏色一律取 `TOKENS_NUM`／`MAP_PALETTE_NUM`；**V7 不新增任何顏色 token**（見 §3.4）。
- 全繁體中文，無簡體字／日文新字體（`validate:data` 掃描含 `.json` 之 `name` 與**字串/註解**；新檔 `debugVisualCastleTerrain.ts`／`settlementsDraw.ts`／castleNode 新註解為新掃描面，須繁體）。**V7 不新增任何 user-visible `BitmapText` 字串**（城名/郡名/國名皆 V4 已存在於資料且已 subset；`terrainKind` 值為 ASCII，非 BitmapText）→ **不需 `font:subset`**（見 §9）。
- 新素材走 gen-assets——**V7 無新二進位/atlas 素材**（城池/郡/聚落/選取環皆 `Graphics` 向量）→ **不需 `gen:assets`／`validate:assets`**。既有 V3 之 `castle-plain`/`castle-mountain` 64px atlas frame **不消費、不移除**（見 CD2）。
- M6-V4/V5/V6 dirty-update DoD（`mapRendererDirty.spec.ts`）維持全綠：無變更 tick 不重建靜態層；owner 翻轉下一幀更新且僅受影響節點；**`day` 變更不觸發任何重畫**；`MapRebuildCounts` **5 欄位不增刪**（`toEqual` 整物件比對）——聚落沿用「無計數」（同 seaBackground），節點沿用 `nodeMarkers`，territory 沿用 `territory`，選取環**不動任何計數**。
- `MapRenderer` 生命週期 StrictMode 安全、`destroy` 冪等、重掛無 texture/cache 洩漏（V5 territory/relief/forest、V6 roads/highlight 生命週期不得回歸）。
- **絕不修改 `plan/00-foundations.md`**。規格衝突依 00>02>15>系統>UI 裁定、實作、回寫 04 §8／12 §8，不留 TBD。
- Playwright 視覺 baseline（三 preset 0.25/0.5/1.25）**預期改變**（城型剪影／耐久／聚落／選取環／新 warning 態），baseline 更新為獨立 commit。
- 動效優先「決定論」：fixture 為 `reducedMotion:reduce`；V7 **不引入任何逐幀動畫**（脈衝/落城補間刻意延後，見 CD7），警戒/受攻徽記為**靜態**繪製，三 baseline 天然穩定。

---

## 2. 決策紀錄（CD1–CD8 ＋ 附加決策 AD1–AD3）

### CD1 — nodeParts 由裸 Graphics 改為元件；dirty diff 擴充；**計數以簽章 diff 成員數為準（非 update 回傳值）**

**決策**

- `MapRenderer.nodeParts` 型別改為 `Map<string, { part: MapNodePart; kind: 'castle'|'district' }>`（`MapNodePart = CastleNodePart | DistrictNodePart`，見 §3）。`buildStaticDataLayers` 依 `node.kind` 建 `createCastleNode()`／`createDistrictNode()`，`part.container.position.set(node.pos.x, node.pos.y)`，`addChild` 至 `nodeMarkers`，**於 build 當下呼叫一次 `part.update(this.buildNodeProps(id, kind))`（首繪，比照現行 `drawNodeMarker` 於 build 一次；供實機 init 流程無後續 updateView 時仍能首幀繪出節點）**，並 `part.setLodStage(this.lodStage)`。stale 節點 `part.destroy()`。**移除 `drawNodeMarker` 呼叫（DoD 硬項）。**
- **dirty diff（`applyOwnerDirty` 擴充；見 §5.1）**：拆為兩條並存訊號——
  1. **owner 訊號（territory 用，語意完全不變）**：沿用 `buildOwnerByNode`/`diffOwnerByNode`（`dirty.ts`）；`ownerDirty.size>0` → `rebuildCounts.territory += 1`＋`territoryDirty = true`；`prevOwnerByNode = nextOwner`。（V5 territory dirty 語意零變更。）
  2. **節點視覺簽章 diff（新）**：`buildNodeSig(view)`（純函式，`dirty.ts`）產 `Map<id,string>`（城：`c|owner|dur/max|warning|terrainKind|tier`；郡：`d|owner|steward|subj|ikki`）；`diffNodeSig(prev,next)`（`prev===null` 回傳**全 id**，比照 `diffOwnerByNode` 首繪保證）→ dirty 集。**對 dirty 集中每一 id：`part.update(buildNodeProps(id))` 並 `rebuildCounts.nodeMarkers += 1`（每個 dirty id 一律計數，比照現行 `applyOwnerDirty` 迴圈內無條件 `+= 1`；計數由簽章 diff 成員數決定，不依賴 `update` 回傳值——見 §13-B3）。`prevNodeSig = next`。**
- **簽章欄位（超出 owner）**：`durability`/`maxDurability`（耐久環）、`warning`（烽火/裂口/光暈）、`terrainKind`（平/山城剪影）、`tier`。**`day` 不入簽章**（footgun：day 變更零重畫）。`siegeMode` 不入 castle 簽章（其視覺＝ SiegeMarker，由 `view.sieges` 於 `redrawMilitaryObjects` 獨立驅動；`warning` 已由 siegeMode 推導，簽章含 warning 即涵蓋受攻/警戒狀態變化）。
- **首繪／重建保證**：`buildStaticDataLayers` 於重建時 `prevNodeSig = null`（於 `prevOwnerByNode=null` 同處）。故重新 `setMapData` 後下一次 `updateView` 之 `diffNodeSig(null, next)` 回傳全 id → 全節點各計數一次（`nodeMarkers += 節點數`）。此與現行 owner-diff 首繪保證等價；**計數以簽章成員數為準，與元件 `update` 之冪等短路無關（B3 修正）**。
- **LOD 顯隱/放大規則**（`applyLodAndCulling`，見 §5.1）：
  - far（`stage==='far'`）：僅**本城**節點可見（`castleTier[id]==='main'`）；**far 本城之剪影 `bodyGfx` ×1.4 放大（由 `setLodStage` 施加於 `bodyGfx`，不放大 ring/warn；#3 修正）**；支城、郡節點隱藏。耐久環/警戒徽記僅在 `warning!=='none'`（被圍/瀕危）時顯示（`ringGfx`/`warnGfx`）。
  - mid（`nearish && !detail`）：＋支城、郡節點；平/山城剪影本即恆繪（型別在此浮現）；城名（既有 label LOD，`nearish && (main || detail)`）。
  - near（`detail`）：＋耐久環（恆顯）、警戒/受攻徽記、城下聚落（`settlements.visible = detail`）、互動提示（V6 已備）。

**替代**：(i) 保留裸 Graphics 只換幾何——被否，無法分離耐久環/徽記做 LOD 逐項顯隱、且違 roadmap「接上既有 CastleNode/DistrictNode 元件」。(ii) 每幀對全 node 呼 `update`——被否，浪費 props 配置且 `rebuildCounts` 語意仰賴「只 touch dirty 節點」。(iii) 計數依 `update` 回傳 boolean——**被否（B3）**：元件重用跨 `setMapData` 時，重用元件之內部 `last` 使 `update(sameProps)` 短路回傳「未重繪」→ 重新 setMapData 後既有 `+3` 斷言（`mapRendererDirty.spec.ts:214`）會退為 `+0`。改「計數＝簽章 diff 成員數」（現行 owner-diff 即此語意），杜絕此退化，且不需改 `ScenePart.update` 之 `void` 回傳（見 AD2）。
**理由**：簽章 diff 是 `diffOwnerByNode` 的自然推廣，day-only 零重畫、owner/耐久/警戒/型別變更精準重畫；計數以成員數為準與現行完全同構。

### CD2 — 城池以 Graphics 向量繪製（非 atlas sprite）

**決策**：平/山城剪影以 **`Graphics` 向量**擴充 `castleNode.ts` 繪製（沿用既有 `drawCastleNode` 契約），**不採 atlas sprite**。V3 既有 `castle-plain`/`castle-mountain` 64px atlas frame **不消費、不移除**（保留於 manifest）。
**替代**：atlas sprite——被否：(a) sprite 需**逐勢力 tint**（40 色），與「郭內小面積勢力色＋ink900 統一描邊」母題衝突；(b) 64px sprite 於 0.25/0.5/1.25 三 scale 有解析度天花板，向量恆銳利；(c) 節點靜態（只在 dirty 重繪），向量成本可忽略；(d) 向量與既有 `castleNode` 契約/測試延續，最小侵入。
**理由**：三固定 scale 皆需銳利可讀 + 單一資產家族換填色，向量最佳。

### CD3 — `terrainKind` 資料來源＝作者標定之 scenario 顯示欄位（非 terrain.json 幾何推導）

**決策**

- **(a) 落位**：`terrainKind: 'plain'|'mountain'` 為每城**作者標定**顯示屬性。加入 `src/data/schemas/castle.ts` 之 `zCastle`（`z.enum(['plain','mountain']).default('plain')`，向下相容），並回填 `s1560/castles.json`（§6.2 全 34 城史地指派）。
- **(b) 不進 GameState（golden 安全）**：`builder.ts` 之 `castles.map`（:640 附近）**不搬 terrainKind** 進 `Castle`（比照 roads.json 之 name/waypoints：在 shared schema，builder 刻意剝除，`stateHash` 不變）。核心 `Castle` 型別/`GameState` **零變更**。（已驗證 `builder.ts` 以具名欄位逐一構造 `Castle`、非 spread，故 `terrainKind` 不會外洩，`exactOptionalPropertyTypes` 下亦安全——審查確認為「golden-safety hinge，trivially safe」。）
- **(c) view 邊界供給**：新增 `castleTerrainLookup(scenarioId: string)`（`selectors.ts`，比照 V6 之 `roadDisplayLookup` scenario 分派）：`scenarioId === 'debug-visual-map-01'` → 回傳純資料葉模組 `DEBUG_VISUAL_CASTLE_TERRAIN`（`src/core/state/debugVisualCastleTerrain.ts`，僅 `{ 'castle.gifu': 'mountain' }`）；否則讀 `s1560/castles.json`（`zCastlesFile.parse`，模組級 `Map<scenarioId,Table>` 快取）。`selectMapViewModel(state)` 以 `castleTerrainLookup(state.scenarioId)[id] ?? 'plain'` **取代** `terrainKind:'plain'` 佔位（`selectors.ts:588`）。
- **(d) 派生方案否決**：由 terrain.json 山體多邊形對城 `pos` 做 `pointInPolygon`——被否：terrain.json 僅 ~14 座粗多邊形，多數山城不落任何 mass → 覆蓋率極差且脆弱。作者標定歷史正確、可控。
  **替代**：把 terrainKind 併入 `MapStaticData`——語意可，但既有契約已置於 `MapViewState.castles[].terrainKind`（佔位在該處），最小改動即「換掉佔位」。
  **理由**：與 roads.json 顯示欄位管線同構、golden 安全、史地誠實、fixture 以葉模組零污染 core。

### CD4 — 城下聚落＝程序生成 runtime Graphics（seeded，決定論，本城 only，close LOD）

**決策**：新增 `src/ui/map/settlements/settlementsDraw.ts`。`buildSettlements(graph, castleTier)` 回傳 `{ container, destroy() }`，`MapRenderer` 於 `buildStaticDataLayers` 建一次、掛 `settlements`(z=6) 層、`applyLodAndCulling` 以 `layers.settlements.visible = (stage==='near')` 顯隱（close only，art-bible §5）。

- **範圍**：只繞 **本城**（`castleTier[id]==='main'`）。
- **內容/幾何**（世界單位，皆低對比、低 alpha、繪於城體 `nodeMarkers` 之下）：每本城 `SETTLEMENT.roofCount=6` 枚小屋頂（平行四邊形 `roofW×roofH=5×3`，填 `MAP_PALETTE_NUM.plainLight` α`roofAlpha=0.55`、描 `TOKENS_NUM.ink700` α0.35 w0.75）＋ `furrowCount=4` 條田畦（短平行線 length 8、`MAP_PALETTE_NUM.reliefInk` α`furrowAlpha=0.3` w0.75）。
- **決定論放置**：以城 id 純字串 hash → LCG（`settlementSeed(id)`，NR-LCG，無 `Math.random`/`Date.now`）在城周半徑環 `[SETTLEMENT.innerR=22, SETTLEMENT.outerR=42]` 內散佈；**`innerR=22 ≥ ringRadiusMain(20)`（#6 修正：確保屋頂不侵入耐久環與城體）**；跨平台 byte 穩定。
- **LOD/dirty**：聚落靜態（owner 變更不移動）→ 不進任何 `rebuildCounts`；`layers.settlements.visible` 由 LOD 切換。
  **替代**：(i) 烘焙進 relief——被否，須 close only 且與城位相對。(ii) 繞所有城——被否，雜訊過多。
  **理由**：runtime 向量 + seeded = 決定論 baseline + close-only + 可 LOD 切，最小記憶體。

### CD5 — 節點選取環：V7 接線 `createSelectionRing`，與 V6 `roadHighlight` 協調（plain `addChild` 插序）

**決策**：V7 **接線節點選取環**（金色雙環，繞被選節點本體），與 V6 之 `roadHighlight`（金色高亮相鄰**道路**）**互補共存、共用 `prevSelectionKey` dirty 追蹤**：

- `MapRenderer` 新增 `private selectionRing: ReturnType<typeof createSelectionRing> | null`。
- **`init` 掛載（B1/#4 修正：純 `addChild` 插序，禁 `addChildAt`/`getChildIndex`）**：V6 之 `init` 依序 `addChild(roadHighlight)`→`addChild(pathPreview)`（`design-m6v6-final.md` §5.1）。V7（Slice D 擁有 `MapRenderer.ts`）**改寫此段為三次 `addChild` 插序**，使 `selectionAndPath` 之 z-order（下→上）為 `[roadHighlight, selectionRing, pathPreview]`：
  ```ts
  this.roadHighlight = createRoadHighlight();
  this.layers.selectionAndPath.addChild(this.roadHighlight.container); // 最下：道路高亮
  this.selectionRing = createSelectionRing();
  this.selectionRing.container.visible = false;
  this.layers.selectionAndPath.addChild(this.selectionRing.container); // 中：節點選取環（壓道路高亮上）
  this.pathPreview = createPathPreview();
  this.layers.selectionAndPath.addChild(this.pathPreview.container); // 最上：march 預覽
  ```
  z-order **完全由 `addChild` 插入序決定**，與 `roadHighlight` 之相對位置無隱含耦合、亦無需 mock 擴充（審查 B1/#4）。
- **與 V6 共用 dirty**：`updateView` 內 V6 既有 `if (selKey !== this.prevSelectionKey) { ... roadHighlight.update(...) }` 區塊**擴一行** `this.updateSelectionRing(selKey)`。**不新增 dirty 欄位、不重複計算 selKey。**
- `updateSelectionRing(selKey)`：`selKey===null` 或 `staticData===null` 或 graph 無此 node → `selectionRing.container.visible = false`；否則查 `staticData.graph.nodes.get(selKey)` 取 `pos`＋`kind`，`targetHitRadius = node.kind==='castle' ? (castleTier[selKey]==='main' ? MAPVIEW.hitRadius.castleMain : hitRadius.castleBranch) : hitRadius.district`，`selectionRing.update({ pos: node.pos, targetHitRadius, primary:true })`＋`container.visible=true`。（錨點置中＝ art-bible §7；投影陰影在 castleNode 內部右下，不影響 node.pos。）
- **軍隊選取**：`view.selection.kind==='army'` 時 `selKey===null` → 清節點選取環（不畫）；軍隊選取高亮屬 M6-V8。
- **單一 selection 槽衝突（明確裁定）**：`MapViewState.selection` 單值。**landed-V6 已使 fixture 預選駿府節點** → V7 節點環於三段 baseline 顯示、直服 DoD item 2。**V8（軍隊 chip）屆時將把 fixture selection 重新指向行軍中軍隊，屆時節點環按設計消失（`kind==='army'`→`selKey=null`），軍隊環由 V8 接手。V7 不為此預留、不越界；此為 V8 之責。**
- **`selectionAndPath` 無 LOD gate** → 選取環三段 preset 皆顯。
- **不動任何 `rebuildCounts`**；day-only tick selKey 不變 → 不更新 → dirty 契約守住。graph swap 後 `prevSelectionKey` 已於 `buildStaticDataLayers` 由 V6 重設為 null → 下次 updateView 必重算（含選取環）。
  **替代**：延後至 V9——被否，DoD item 2 硬要求「3 秒內指出目前選取」，V6 道路高亮無法明確指出「哪個節點」被選；節點環直接消歧，fixture 已預選駿府，自然歸屬。
  **理由**：與 V6 協調零重複、直服 DoD、fixture 立即可驗、z-order 決定論且無 mock 相依。

### CD6 — 城名標籤：沿用既有 node label（不新增字串、不加 halo 底板）；**重疊風險在 operational 眼驗收**

**決策**：城/郡名標籤**沿用 V4 既有 `labelParts`／`BitmapText` 機制**（`labels`(z=11) 層，`fontSize:12`，y+18，LOD `nearish && (main || detail)`）——**V7 不改標籤建構/LOD**。

- **halo 技法裁定**：plan/12 §3.3.2 要求「washi100 描邊 3px（halo）」，但 Pixi `BitmapText` 無 halo 且本專案**無預烘焙 halo/底板**。**裁定：V7 不引入 halo**（既有 node label 亦無 halo，V6 道路名亦無）。**若後續眼驗收（§9.3）發現特定城名對比不足，補救槓桿：於 label 建立時顯式帶 `fill: TOKENS_NUM.ink900`**（現行 node label 未帶 fill）——view-only 單行、無新字串，列為條件式動作、回寫 12 §8。
- **LOD 事實更正（#5 修正）**：既有 label LOD `nearish && (main || detail)`——`nearish = stage !== 'far'`。**故 far（overview 0.25）時 `nearish===false` → 一切城名/郡名/國名皆隱藏（far 無任何城名）**。城名於 **mid（operational 0.5，本城顯）** 起浮現、支城名於 **near（1.25，`detail`）** 才顯。
- **1280×720 重疊風險（DoD item 3）之正確裁定**：因 far 無城名，**重疊風險落在 operational(0.5)/mid，非 far**。fixture 本城為清洲(1966,2838)／駿府(2312,2897)／岐阜(1938,2774)。清洲 vs 岐阜 Δx≈28、Δy≈64 世界單位（**非草稿誤稱之「x 間距 ≥300」**）；於 0.5 scale ≈ 螢幕 Δ(14px,32px)。`fontSize:12`＋y+18 之下，~32px 垂直分隔**大機率不重疊但屬邊際**——**列為 §9.3-2 operational 眼驗收硬項（非以錯誤的 far/間距論證帶過）**；若重疊，補救＝縮短其一 label（僅駿府相鄰含 name，清洲/岐阜為本城名）或微調 y-offset（屬 label LOD，非本階段主軸；記入眼驗收）。國名（`!nearish`＝far 才顯？——實為 province label 走另一 LOD，三國 labelPos 分離，far 可讀）。
- **無新字串**：城名/郡名/國名皆 V4 已存在且已 subset → **不需 `font:subset`**。
  **替代**：offset-copy halo / washi 底板——被否（成本＋CJK 糊化＋塊狀遮擋）。
  **理由**：最小侵入、無 font pipeline 觸動；重疊以正確 LOD（operational）眼驗收把關，不以錯誤前提自我保證。

### CD7 — 狀態：耐久環（既有門檻）／被圍（既有 SiegeMarker）／警戒（靜態烽火＋裂口＋凍結光暈）／落城動畫延後

**決策**

- **耐久環**：沿用既有 `drawDurabilityRing`＋`durabilityRingColor`（半徑 main 20/branch 15、width 3、起角 −90°、掃角 `ratio×360°`、三段變色 `>Warn(0.6)→mossBright(綠)`/`>Danger(0.3)→gold`/`else→vermilionBright(朱)`、底環 ink300 25%）——**幾何/門檻/顏色公式零變更**。移入獨立 `ringGfx` 子 Graphics（供 LOD 顯隱、且**不隨剪影 ×1.4 放大**）。**耐久環色僅由 `durability/maxDurability` ratio 決定，與圍城 warning 無關（見 §6.3、CD8）。**
- **被圍**：**保留既有 live `SiegeMarker`**（`effects` 層、`view.sieges` 驅動、reducedMotion 凍結）畫外圈三段弧；castleNode **不重畫圍城弧**，只畫城體受攻/警戒徽記。
- **警戒（threatened，= encircle）**：`warnGfx` 於城體上方 `(0, -S/2 - signalFireLift)` 畫**金色小烽火**（1 支 `ink900` 細桿 + 2 枚上尖三角焰 `accentGold`，外接盒 `signalFireSize=7`）。
- **受攻（critical，= assault）**：`warnGfx` 畫**固定裂口徽記**（跨主郭 3 段鋸齒折線 `accentVermilion` width `crackWidth=1.5`）＋**靜態朱紅光暈**（半徑 `ring + criticalHaloPad=4` 之圓、`accentVermilionBright` α`criticalHaloAlpha=0.5` w2）。**「低頻脈衝」凍結為靜態光暈**。
- **`warnGfx`/`ringGfx` LOD**：`ringGfx.visible = (stage==='near') || (warning!=='none')`；`warnGfx.visible = (warning!=='none')`（被圍/瀕危之城 far 亦顯狀態，art-bible §6.4）。以 `setLodStage(stage)` 切換（不重繪）。
- **脈衝動畫＋落城動畫（300ms 補間＋煙塵）：明確延後（非 V7 scope）**。理由：(a) DoD proving ground 為 `reducedMotion:reduce` → 脈衝/補間在三 baseline 天然凍結，靜態態即其凍結態；(b) 逐幀脈衝若經 `update` 會每幀重繪 → 破 dirty `rebuildCounts.nodeMarkers` 契約；(c) 落城補間/煙塵需 particles/tween ticker，屬 effect 里程碑。V7 交付：owner 變更之 dirty tick **即時換填色**（無補間），warning 徽記靜態。回寫 04 §8／12 §8。
  **理由**：決定論優先；靜態態即 reducedMotion baseline 正確外觀；動畫延後不損 DoD、避免破 dirty 契約。

### CD8 — fixture DoD 佐證資料編修（`debugVisual.ts`，golden 安全）——讓耐久三色與雙警戒態真正可見

**背景**：現行 fixture（`debugVisual.ts:169-192`）`maxDurability = p.durability`，故**每城 ratio 恆 1.0、耐久環恆綠**；且唯一圍城為駿府 assault→critical，**threatened（金烽火）在任何 baseline 皆不出現**。若不修，V7 兩大 close 交付（耐久三色門檻、警戒/受攻雙態）在 DoD proving ground **完全不可見**（審查 #2/#7）。**debug-visual 不在 golden 路徑（golden 僅 `'mini'`），fixture 為純資料建構（無 Math.random/Date.now），故編修 golden byte-identical 安全。**
**決策**（Slice A 擁有 `debugVisual.ts`）：

- **(a) 支援 `maxDurability ≠ durability`**：擴 fixture 城參數（`:169-192` 之 param 型別）新增可選 `maxDurability?: number`（預設 = `durability`，保持其餘城滿耐久＝綠環）。城建構改 `maxDurability: p.maxDurability ?? p.durability`。
- **(b) 三色門檻可見**：**駿府** `durability = round(BAL.durabilityMain * 0.25)`、`maxDurability = BAL.durabilityMain`（ratio 0.25 ≤ Danger → **vermilion 耐久環**，且其 assault 圍城→critical 光暈亦 vermilion，語意一致：瀕危被強攻）；**掛川** `durability = round(BAL.durabilityBranch * 0.45)`、`maxDurability = BAL.durabilityBranch`（ratio 0.45，介於 Danger/Warn → **gold 耐久環**）；**清洲/鳴海/岐阜** 維持滿耐久（**綠環**）。三段 baseline close 即同時見綠/金/朱三色門檻。
- **(c) threatened 態可見**：於 **掛川（今川支城）** 新增一場 **encircle** 圍城——因 `beginSiege` 預設 `mode:'assault'`（`siege.ts:51`），須於 `beginSiege` 後將該 siege 之 `mode` 設為 `'encircle'`（靜態 fixture 不再 tick，mode 穩定）。攻方為一支小型織田軍（troops **< 掛川 soldiers × `BAL.encircleRatio`**，使 encircle 語意與 `validateState` 一致）。掛川 `warning` 遂由 selector 推導為 `threatened` → **金色烽火**於 operational/close 顯示。回傳前 `validateState` 須通過。
- **(d) 文件/測試同步**：`debugVisual.ts` 檔頭 docstring（`:793-796` 之「9 支軍隊／1 場圍城」）更新為新軍隊數與「2 場圍城（駿府 assault、掛川 encircle）」。`tests/visual/debugVisual.spec.ts`（**Slice A 擁有其擴充**）：既有斷言（`:74-92` tier/count/anchor-siege）皆以 `VISUAL_ANCHOR_CASTLE_ID`（駿府）過濾，**不受掛川第二場圍城影響**（已驗證）；新增斷言「掛川 warning=threatened、駿府 ratio≈0.25、掛川 ratio≈0.45」。`tests/app/visualMapBoot.spec.tsx` 之 selection 斷言由 **V6 Slice F** 擁有並已更新為節點選取（V7 不動）。
  **替代**：(i) 只改數值不改 builder——被否，`maxDurability=durability` 使 ratio 恆 1，改數值仍全綠。(ii) 用單元測試覆蓋 threatened/三色，baseline 不現——**部分保留為 fallback**：`castleNode.spec`（§8.1）已完整覆蓋 `drawCastleWarning`/`durabilityRingColor` 各態；但 DoD proving ground 明文要求「三張截圖可見」，故 fixture 必須實際呈現，單測不替代 baseline 佐證。(iii) 不加第二場圍城、改把駿府圍城設 encircle——被否，駿府為 anchor，DoD close 期望其顯 critical（受攻）。
  **理由**：DoD 硬要求兩大 close 交付在三段截圖可見；fixture 為 proving ground；編修 golden 安全、決定論、影響面小且已驗測試阻抗。

### 附加決策

- **AD1 — `MapViewState.districts?` 可選擴充（golden 安全）**：`districtNode` 需 `hasSteward/subjugationProgress/ikkiActive`，而 `MapViewState` 僅有 `districtOwner`。新增 `MapDistrictViewModel = { id, hasSteward, subjugationProgress, ikkiActive }`（core `selectors.ts`，讀 `District.stewardId/subjugation?.progress/uprising`）；`MapViewState.districts?: readonly MapDistrictView[]`（**可選**，避免既有 test fixture 補欄位）。district 顏色仍取 `districtOwner`（單一 owner 真相）；`districts[]` 只補次級狀態。**fixture／s1560 開局 steward/subjugation/uprising 多為 null → baseline 無視覺差異**。golden 安全（view-model）。
- **AD2 —（修訂）`ScenePart.update` 維持回傳 `void`，不改共享契約**：草稿原擬把 `update` 改回傳 `boolean`（驅動計數）。**改為：計數以簽章 diff 成員數為準（CD1、§13-B3），故不需 boolean 回傳**。`castleNode`/`districtNode`/`selectionRing` 之 `update` **維持 `void`、維持既有 `ScenePart<P>` 契約**（消除審查 #8 之「三元件脫離 `ScenePart<P>`」churn，且既有三 spec 之 void-return 斷言不必改）。**唯一新增介面**：`CastleNodePart`/`DistrictNodePart` 為 `ScenePart<P>` 之**加法擴充**（`extends ScenePart<P>` 再加 `setLodStage(stage): void`）——僅新增方法、不改 `update` 簽章。
- **AD3 — 郡節點沿用既有幾何（不改為 art-bible「空心圓印」）**：plan/12 §3.3.3 定「填 --clan-XX 70% + ink700 描邊 + 中心點」，art-bible §6.4 稱「空心圓印」。**裁定沿用 plan/12 幾何**——已視覺上明確異於「實色填 + ink900 粗描」之城郭家族。改為全空心屬視覺 churn 且動既有測試，收益低。回寫 12 §8。

---

## 3. 精確型別與常數變更

### 3.1 `src/ui/map/sceneParts/castleNode.ts`（Slice B）

`CASTLE_NODE_GEOMETRY` 擴充（既有欄位保留，新增 V7 欄位）：

```ts
export const CASTLE_NODE_GEOMETRY = {
  mainSize: 28,
  branchSize: 20,
  strokeWidth: 2,
  ringRadiusMain: 20,
  ringRadiusBranch: 15,
  ringWidth: 3,
  ringBaseAlpha: 0.25,
  // ── M6-V7 ──
  farMainBodyScale: 1.4, // far 本城剪影放大（僅施於 bodyGfx，不放大 ring/warn；#3）
  shadowOffsetMain: 3,
  shadowOffsetBranch: 2,
  shadowAlpha: 0.28, // 右下紙雕投影
  innerKeepScale: 0.5, // 本城二階內主郭相對外接盒
  innerKeepLiftPlain: 0.1, // 平城主郭上移（×size）
  innerKeepLiftMountain: 0.26, // 山城主郭上移（垂直堆疊）
  mountainBaseAlpha: 0.9, // 山城岩基三角 reliefInk alpha
  moatArcRadius: 0.12, // 平城護城河短弧半徑（×size）
  moatArcAlpha: 0.5,
  signalFireSize: 7, // 警戒金烽火外接盒
  signalFireLift: 8, // 烽火中心較城頂上移（世界單位）
  crackWidth: 1.5, // 受攻裂口線寬
  criticalHaloPad: 4, // 受攻靜態光暈半徑 = 耐久環半徑 + pad
  criticalHaloAlpha: 0.5,
} as const;
```

`CastleNodeProps` 擴充：

```ts
export interface CastleNodeProps {
  readonly pos: { readonly x: number; readonly y: number };
  readonly tier: CastleTier; // 'main' | 'branch'（來源＝view.castles[].tier，見 §5.1 buildNodeProps／M2）
  readonly terrainKind: 'plain' | 'mountain'; // ← V7 新增（平城/山城剪影）
  readonly colorIndex: number; // Clan.colorIndex 0..39
  readonly durability: number;
  readonly maxDurability: number;
  readonly warning: 'none' | 'threatened' | 'critical'; // ← V7 新增（烽火/裂口/光暈）
}
```

節點元件介面（`ScenePart<P>` 之加法擴充；AD2）：

```ts
import type { ScenePart } from '@ui/components/types';
import type { LodStage } from '../lod';
export interface CastleNodePart extends ScenePart<CastleNodeProps> {
  // 繼承：container / update(props): void / destroy(): void
  setLodStage(stage: LodStage): void; // ← 唯一新增：依段切 ringGfx/warnGfx 顯隱＋far 本城 bodyGfx ×1.4（不重繪）
}
export function createCastleNode(): CastleNodePart;
```

`container` 內含三子 `Graphics`（`addChild` 序＝由下而上）：**`bodyGfx`（投影→岩基→外郭→內主郭→護城河）→ `ringGfx`（耐久環）→ `warnGfx`（烽火/裂口/光暈）**。故 `container.children[0] === bodyGfx`（供 §5.7 之 scale 斷言錨定）。純繪製函式（各以 `makeRec` 單測）：

```ts
export function drawCastleBody(g: Graphics, props: CastleNodeProps): void; // 剪影＋投影＋型別
export function drawDurabilityRing(g: Graphics, radius: number, ratio: number): void; // 既有，移入 ringGfx
export function drawCastleWarning(g: Graphics, props: CastleNodeProps): void; // 烽火/裂口/光暈
```

- `update(props): void`：pos 變→`container.position.set`；`samePropsExceptPos(last, props)` 相等→僅更新 `last` 後 return（冪等，不重繪，維持既有語意）；否則 `bodyGfx`/`ringGfx`/`warnGfx` 三子各 `clear()`+重繪、記 `last`、依 `lastLodStage` 重套 `setLodStage`（保持 LOD 顯隱一致）。**回傳 `void`（AD2）。**
- `setLodStage(stage): void`：記 `lastLodStage`；`ringGfx.visible = stage==='near' || (last?.warning ?? 'none')!=='none'`；`warnGfx.visible = (last?.warning ?? 'none')!=='none'`；**`bodyGfx.scale.set(stage==='far' && (last?.tier)==='main' ? farMainBodyScale : 1)`（#3：只放大剪影，ring/warn 恆自然尺寸）**。`last===null` 時視為未放大、依 stage 設 visible。

### 3.2 `src/ui/map/sceneParts/districtNode.ts`（Slice C）

`DistrictNodeProps` 之三狀態欄改可選：

```ts
export interface DistrictNodeProps {
  readonly pos: { readonly x: number; readonly y: number };
  readonly colorIndex: number | null; // null=無主
  readonly hasSteward?: boolean; // 預設 false（直轄）
  readonly subjugationProgress?: number | null; // 預設 null
  readonly ikkiActive?: boolean; // 預設 false
}
export interface DistrictNodePart extends ScenePart<DistrictNodeProps> {
  setLodStage(stage: LodStage): void; // no-op 佔位（郡無 LOD 內部切換；整合迴圈統一呼叫）
}
export function createDistrictNode(): DistrictNodePart;
```

`drawDistrictNode` 幾何**不變**（AD3），僅讀可選欄位時套預設（`props.hasSteward ?? false` 等）。`update` 維持 `void`。

### 3.3 `src/ui/map/sceneParts/selectionRing.ts`（Slice B）

`SELECTION_RING_GEOMETRY` 擴充（雙環）：

```ts
export const SELECTION_RING_GEOMETRY = {
  paddingRadius: 6, // 外環半徑 = 命中半徑 + 6（既有）
  innerGap: 4, // ← V7：內環半徑 = 命中半徑 + 6 - innerGap（= 命中半徑 + 2）
  strokeWidthNormal: 2,
  strokeWidthPrimary: 3,
} as const;
```

`drawSelectionRing`：畫**兩枚同心金環**（外 `targetHitRadius+paddingRadius`、內 `targetHitRadius+paddingRadius-innerGap`），皆 `TOKENS_NUM.accentGold`、width `primary?strokeWidthPrimary:strokeWidthNormal`。`update` 維持 `void`（AD2）。`SelectionRingProps` 不變（`pos/targetHitRadius/primary`）。

> **overview 巢狀關係（#3 驗證）**：主城 hit 20 → 外環 26／內環 22；耐久環 20；critical 光暈 24。因 ring/warn **不隨 ×1.4 放大**，overview 巢狀為（由外而內）**選取外環 26 > 光暈 24 > 選取內環 22 > 耐久環 20 > 剪影**（far 本城剪影 ×1.4 約半徑 ~19.6），SiegeMarker r24≈光暈——無草稿所述之「選取環落在放大耐久環之內」的反轉。

### 3.4 `src/ui/map/settlements/settlementsDraw.ts`（Slice C，新檔常數）

```ts
export const SETTLEMENT = {
  roofCount: 6,
  roofW: 5,
  roofH: 3,
  roofAlpha: 0.55,
  roofStrokeAlpha: 0.35,
  roofStrokeWidth: 0.75,
  furrowCount: 4,
  furrowLength: 8,
  furrowAlpha: 0.3,
  furrowWidth: 0.75,
  innerR: 22,
  outerR: 42, // 屋頂/田畦散佈環；innerR≥ringRadiusMain(20)，屋頂不侵入耐久環/城體（#6）
} as const;
```

> **顏色對映（皆既有 token，V7 不新增）**：屋頂填 `MAP_PALETTE_NUM.plainLight`、屋頂描 `TOKENS_NUM.ink700`、田畦 `MAP_PALETTE_NUM.reliefInk`。烽火 `TOKENS_NUM.accentGold`；裂口 `TOKENS_NUM.accentVermilion`；受攻光暈 `TOKENS_NUM.accentVermilionBright`；投影 `TOKENS_NUM.ink900`；山城岩基 `MAP_PALETTE_NUM.reliefInk`；護城河 `MAP_PALETTE_NUM.waterRiver`；城主色 `clanColorNum(index)`／內主郭亮 `clanColorNum(index,true)`；描邊 `TOKENS_NUM.ink900`；耐久環 `accentMossBright/accentGold/accentVermilionBright`（既有 `durabilityRingColor`）；選取金 `TOKENS_NUM.accentGold`。

### 3.5 `src/ui/map/dirty.ts`（Slice D）新增純函式

```ts
/** 節點視覺簽章 view 子集（城/郡）。 */
export interface NodeSigView {
  readonly castles: readonly {
    id: string;
    ownerClanId: string;
    durability: number;
    maxDurability: number;
    tier: string;
    warning: string;
    terrainKind: string;
  }[];
  readonly districtOwner: Readonly<Record<string, string | null>>;
  readonly districts?: readonly {
    id: string;
    hasSteward: boolean;
    subjugationProgress: number | null;
    ikkiActive: boolean;
  }[];
}
/** 每節點視覺簽章字串（castle：`c|owner|dur/max|warning|terrainKind|tier`；district：`d|owner|steward|subj|ikki`）。 */
export function buildNodeSig(view: NodeSigView): Map<string, string>;
/** prev===null 回傳全部 id（首繪保證，比照 diffOwnerByNode）；否則回傳簽章相異之 id 集。 */
export function diffNodeSig(
  prev: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string>,
): Set<string>;
```

（`buildOwnerByNode`/`diffOwnerByNode`/`armyWorldPos`/`armyStackKey` 不變。）**測試檔置於既有 `dirty` 測試同位（若 `dirty.ts` 已有 co-located spec 則擴充之；否則新增 `src/ui/map/dirty.spec.ts`，於 ui project 執行——純函式，node/ui 皆可，但避免草稿誤置於 `tests/ui/sceneParts/`，見 §13-m1）。**

### 3.6 `src/core/state/selectors.ts`（Slice A）

- 新增 `castleTerrainLookup(scenarioId: string): Readonly<Record<string, 'plain'|'mountain'>>`（模組級 `Map<string,Table>` 快取；scenario 分派見 CD3）。
- `MapDistrictViewModel`（新）：`{ id: DistrictId; hasSteward: boolean; subjugationProgress: number | null; ikkiActive: boolean }`。
- `MapViewModel` 新增 `districts: MapDistrictViewModel[]`（**core view-model 之必填欄**；AD1）。**斷言完整 `MapViewModel` 形狀的既有 `test:core`（如 `selectorsMapView.spec`）須同步補 `districts`（Slice A 擁有其擴充，見 §13-m2）。**
- `selectMapViewModel(state)`：
  - `const terrain = castleTerrainLookup(state.scenarioId);` → castle map 中 `terrainKind: terrain[id] ?? 'plain'`（取代 `:588` 佔位）。
  - 新增 `districts` 陣列（依 id 字典序）：`hasSteward: d.stewardId !== null`、`subjugationProgress: d.subjugation?.progress ?? null`、`ikkiActive: d.uprising !== null`。
- **`selectMapStaticModel` 不改**（terrainKind 屬 view-model；castleTier 已在靜態模型供 hit radius/LOD）。

### 3.7 `src/core/state/debugVisualCastleTerrain.ts`（Slice A，新檔）

```ts
// visual fixture（scenarioId='debug-visual-map-01'）之城型顯示資料。純資料葉模組（僅供 selectMapViewModel
// 之 castleTerrainLookup 分派；不 import 任何 core 系統，避免污染 production bundle）。
// castle.gifu = s1560「稻葉山城」化名（debugVisual.ts 檔頭），史實山城 → mountain，展示平/山城對比。
export const DEBUG_VISUAL_CASTLE_TERRAIN: Readonly<Record<string, 'plain' | 'mountain'>> = {
  'castle.gifu': 'mountain',
};
```

### 3.8 `src/data/schemas/castle.ts`（Slice A）

`zCastle` 增一欄（置 `facilities` 之後）：

```ts
terrainKind: z.enum(['plain', 'mountain']).default('plain'), // 城型（顯示用；builder 不搬入 GameState，golden 安全）
```

`CastleData` 隨 `z.infer` 自動含 `terrainKind`。**`builder.ts` 不搬**（見 §5.4）。

### 3.9 `src/ui/map/mapViewTypes.ts`（Slice D）

- `import type { MapDistrictViewModel } from '@core/state/selectors';`（併入既有 core view-model import 群）。
- 新增 alias：`export type MapDistrictView = MapDistrictViewModel;`
- `MapViewState` 新增（置於 `castles` 之後）：`readonly districts?: readonly MapDistrictView[];`。
- `EMPTY_VIEW`（`MapRenderer.ts`）**不需加 districts**（optional）。
- 各層註解：`MapLayers.settlements` 補「V7：本城城下屋頂群＋田畦（close only）」；`nodeMarkers` 註解由「占位 marker」更新為「CastleNode/DistrictNode 元件」；`selection` 註解補「V7 節點選取環（金色雙環，錨點置中）＋V6 相鄰道路高亮」。**型別無其他變更。**

### 3.10 `MapRebuildCounts`（`MapRenderer.ts`）

**不變**（`toEqual` 契約，5 欄位）。節點沿用 `nodeMarkers`；territory 沿用 `territory`；聚落/選取環無計數。

---

## 4. 新檔規格（完整簽章＋行為）

### 4.1 `src/ui/map/settlements/settlementsDraw.ts`（Slice C，新檔）

```ts
import { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { CastleTier } from '@core/state/enums';
import { MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';

export const SETTLEMENT = {/* 見 §3.4 */} as const;

export interface Settlements {
  readonly container: Container;
  destroy(): void;
}
/** 城 id 純字串 hash → seed（決定論，無 Math.random/Date.now）。 */
export function settlementSeed(id: string): number;
/** 建城下聚落：僅繞本城（castleTier[id]==='main'）；屋頂群＋田畦，seeded 散佈於 [innerR,outerR] 環。
 *  靜態一次建；LOD 顯隱由 MapRenderer 切 layers.settlements.visible。決定論：城依 id 字典序處理。 */
export function buildSettlements(
  graph: MapGraph,
  castleTier: Readonly<Record<string, CastleTier>>,
): Settlements;
/** 純繪製（可 makeRec 單測）：在 g 上以 seed 畫一座本城之屋頂群＋田畦（局部＝世界座標，繪於 center 周圍）。 */
export function drawSettlementCluster(
  g: Graphics,
  center: { x: number; y: number },
  seed: number,
): void;
```

**`buildSettlements` 行為**：單一 `container` 內一個 `Graphics`（`gfx`）；遍歷 `[...graph.nodes.values()].sort(byId)`，對 `node.kind==='castle' && castleTier[node.id]==='main'` 者 `drawSettlementCluster(gfx, node.pos, settlementSeed(node.id))`。`destroy()`：`container.destroy({children:true})`。
**`drawSettlementCluster` 行為**（全 seeded/整數線性）：以 LCG 自 seed 迭代產 `roofCount` 枚屋頂：極座標 `(r∈[innerR,outerR], θ∈[0,2π))` → 屋頂中心，畫 `roofW×roofH` 平行四邊形（`poly(...).fill({color:plainLight,alpha:roofAlpha}).stroke({width:roofStrokeWidth,color:ink700,alpha:roofStrokeAlpha})`）；再產 `furrowCount` 條田畦（`moveTo/lineTo` 長 `furrowLength` 短線 `stroke({width:furrowWidth,color:reliefInk,alpha:furrowAlpha})`）。**不畫於 `< innerR`**。

### 4.2 `src/core/state/debugVisualCastleTerrain.ts`（Slice A，新檔）

見 §3.7（純資料葉模組）。

---

## 5. 既有檔案修改清單

### 5.1 `src/ui/map/MapRenderer.ts`（Slice D）— 核心整合（唯一整合器，最後）

> 以下以**語意錨點**描述（V6 已改動 init/buildStaticDataLayers/applyLodAndCulling/updateView/destroy，行號已位移；實作 agent 依現行 working tree＋`design-m6v6-final.md` 定位）。

**import**：新增 `createCastleNode, type CastleNodePart` from `./sceneParts/castleNode`；`createDistrictNode, type DistrictNodePart` from `./sceneParts/districtNode`；`createSelectionRing` from `./sceneParts/selectionRing`；`buildSettlements` from `./settlements/settlementsDraw`；`buildNodeSig, diffNodeSig` from `./dirty`。**移除** `drawNodeMarker` import（保留 `drawSeaBackground, loadOutline`；`drawRoads` 已由 V6 移除）。

**欄位**：

```ts
private readonly nodeParts = new Map<string, { part: CastleNodePart | DistrictNodePart; kind: 'castle' | 'district' }>();
private prevNodeSig: Map<string, string> | null = null;
private selectionRing: ReturnType<typeof createSelectionRing> | null = null;
private settlements: ReturnType<typeof buildSettlements> | null = null;
```

（`prevOwnerByNode`、`prevSelectionKey`〔V6〕、`labelParts` 皆沿用不變。）

**`init`**：改寫 V6 之 selectionAndPath 掛載段為三次 plain `addChild` 插序（見 CD5 程式片段：roadHighlight→selectionRing→pathPreview），選取環初始 `visible=false`。**不使用 `addChildAt`/`getChildIndex`。**

**`buildStaticDataLayers`**（node 迴圈重寫；label/roads/province 段不動）：

```ts
let entry = this.nodeParts.get(node.id);
if (entry === undefined) {
  const part = node.kind === 'castle' ? createCastleNode() : createDistrictNode();
  part.container.position.set(node.pos.x, node.pos.y);
  this.layers.nodeMarkers.addChild(part.container);
  entry = { part, kind: node.kind };
  this.nodeParts.set(node.id, entry);
}
// 首繪（比照現行 drawNodeMarker 於 build 一次；供 init 無後續 updateView 時仍能繪出）；不計數。
entry.part.update(this.buildNodeProps(node.id, entry.kind) as never);
entry.part.setLodStage(this.lodStage);
this.nodeCull.upsert(node.id, node.pos.x, node.pos.y);
```

- stale 清理：`entry.part.destroy()`（取代 `part.graphics.destroy()`）。
- **移除** `drawNodeMarker` 呼叫（DoD）。node 迴圈**不動** `rebuildCounts`（首繪計數在首次 `updateView` 之簽章 diff，比照現行）。
- `data===null` 分支：`entry.part.destroy()` 全清、`nodeParts.clear()`；並清聚落（下）與 `selectionRing.container.visible=false`。
- **聚落**：於 node 迴圈後

```ts
if (this.settlements) {
  this.layers.settlements.removeChild(this.settlements.container);
  this.settlements.destroy();
  this.settlements = null;
}
if (data !== null) {
  this.settlements = buildSettlements(data.graph, data.castleTier ?? {});
  this.layers.settlements.addChild(this.settlements.container);
}
```

- **`prevNodeSig = null`**（於 `prevOwnerByNode=null` 同處重設；首繪/重建保證）。

**新私有輔助 `buildNodeProps`**（由 `this.view`＋graph 導出單節點 props；**pos 取真實 node.pos，tier 取 view，見 B2/M2**）：

```ts
private buildNodeProps(id: string, kind: 'castle' | 'district'): CastleNodeProps | DistrictNodeProps {
  const node = this.staticData?.graph.nodes.get(id as never);
  const pos = node ? { x: node.pos.x, y: node.pos.y } : { x: 0, y: 0 }; // B2：真實世界座標（非 {0,0}）
  if (kind === 'castle') {
    const c = this.view.castles.find((x) => x.id === id);
    const tier = c?.tier ?? this.staticData?.castleTier?.[id] ?? 'branch'; // M2：剪影 tier 以 view 為權威
    const colorIndex = c ? (this.staticData?.clanColorIndex[c.ownerClanId] ?? 0) : 0;
    return {
      pos, tier, colorIndex,
      terrainKind: c?.terrainKind ?? 'plain',
      durability: c?.durability ?? 0, maxDurability: c?.maxDurability ?? 1,
      warning: c?.warning ?? 'none',
    };
  }
  const owner = this.view.districtOwner[id] ?? null;
  const colorIndex = owner === null ? null : (this.staticData?.clanColorIndex[owner] ?? 0);
  const d = this.view.districts?.find((x) => x.id === id);
  return {
    pos, colorIndex,
    hasSteward: d?.hasSteward ?? false,
    subjugationProgress: d?.subjugationProgress ?? null,
    ikkiActive: d?.ikkiActive ?? false,
  };
}
```

> 效能註：`find` 於節點小規模可忽略；dirty diff 已限制只對變動節點呼叫 `buildNodeProps`（非全節點/幀）。

**`applyOwnerDirty`**（擴為兩訊號並存；計數以簽章成員數為準；即 CD1）：

```ts
private applyOwnerDirty(view: MapViewState): void {
  // (1) owner 訊號（territory；語意不變）
  const nextOwner = buildOwnerByNode(view);
  const ownerDirty = diffOwnerByNode(this.prevOwnerByNode, nextOwner);
  if (ownerDirty.size > 0) { this.rebuildCounts.territory += 1; this.territoryDirty = true; }
  this.prevOwnerByNode = nextOwner;
  // (2) 節點視覺簽章 diff（新）——每個 dirty id 一律計數（不依賴 update 回傳；B3）
  const nextSig = buildNodeSig(view);
  const sigDirty = diffNodeSig(this.prevNodeSig, nextSig);
  if (this.staticData !== null) {
    for (const id of sigDirty) {
      const entry = this.nodeParts.get(id);
      if (entry === undefined) continue;
      entry.part.update(this.buildNodeProps(id, entry.kind) as never);
      this.rebuildCounts.nodeMarkers += 1; // 計數＝簽章 diff 成員數（比照現行 owner-diff 迴圈）
    }
  }
  this.prevNodeSig = nextSig;
}
```

**`updateView`**（V6 之 selection dirty 區塊擴一行）：

```ts
const selKey = view.selection !== null && view.selection.kind === 'node' ? view.selection.id : null;
if (selKey !== this.prevSelectionKey) {
  this.prevSelectionKey = selKey;
  if (this.staticData !== null) {
    this.roadHighlight?.update({ graph: this.staticData.graph, selectedNodeId: selKey }); // V6
    this.updateSelectionRing(selKey); // ← V7 新增
  }
}
```

**新私有 `updateSelectionRing`**：

```ts
private updateSelectionRing(selKey: string | null): void {
  const ring = this.selectionRing;
  if (ring === null) return;
  if (selKey === null || this.staticData === null) { ring.container.visible = false; return; }
  const node = this.staticData.graph.nodes.get(selKey as never);
  if (node === undefined) { ring.container.visible = false; return; }
  const hr = node.kind === 'castle'
    ? (this.staticData.castleTier?.[selKey] === 'main' ? MAPVIEW.hitRadius.castleMain : MAPVIEW.hitRadius.castleBranch)
    : MAPVIEW.hitRadius.district;
  ring.update({ pos: node.pos, targetHitRadius: hr, primary: true });
  ring.container.visible = true;
}
```

**`applyLodAndCulling`**（node 迴圈與新增 settlements 顯隱；**far boost 移入 setLodStage，不設 container.scale**）：

```ts
for (const [id, entry] of this.nodeParts) {
  const isMain = entry.kind === 'castle' && this.staticData?.castleTier?.[id] === 'main';
  entry.part.container.visible = visibleNodes.has(id) && (nearish || isMain); // far 僅本城
  entry.part.setLodStage(stage); // ringGfx/warnGfx 顯隱＋far 本城 bodyGfx ×1.4（#3；不再設 container.scale）
}
// labels 迴圈：不動（V6 語意）。territory/relief/forest/water/roads 段：不動。
this.layers.settlements.visible = detail; // 城下地景 close only
```

**`setMapData`**（`data===null` 分支）：新增 `this.selectionRing.container.visible = false;`。node/label/roads/settlements 之清理已於 `buildStaticDataLayers`。

**`destroy`**（`app.destroy` 之前，V5/V6 銷毀序不動；新增）：

```ts
this.selectionRing?.destroy();
this.selectionRing = null;
if (this.settlements) {
  this.settlements.container.parent?.removeChild(this.settlements.container);
  this.settlements.destroy();
  this.settlements = null;
}
this.prevNodeSig = null;
for (const { part } of this.nodeParts.values()) part.destroy();
this.nodeParts.clear();
```

### 5.2 `src/ui/map/mapDraw.ts`（Slice D，移除占位）

移除 `drawNodeMarker`、`drawNodeMarkers`、`regularPolygon`、`ownerColor`（若僅 drawNodeMarker* 用）、`NODE_MARKER` import。保留 `loadOutline`/`drawSeaBackground`。`NODE_MARKER` 常數本身留於 `mapViewConfig.ts`（未消費，不動 config 檔以維持切片互斥）。

### 5.3 `tests/ui/mapDraw.spec.ts`（Slice D）

移除 `drawNodeMarker`/`drawNodeMarkers` 相關 describe/it；保留 `drawSeaBackground` 測試。

### 5.4 `src/core/state/builder.ts`（Slice A，**不搬 terrainKind**）

**確認** `castles.map`（:640 附近）之回傳物件**不含 `terrainKind`**（以具名欄位逐一構造，非 spread，已驗證安全）。**無程式新增**（僅驗證 golden 未變）；必要時加註解說明刻意剝除。

### 5.5 `src/ui/map/composeMapView.ts`（Slice D）

`composeMapViewState` 之回傳新增 `districts: model.districts`（AD1，pass-through）；`ComposeSelection`/selection 映射不變（V6 已定 `'castle'|'district'`→`'node'`）。

### 5.6 `src/ui/map/mapRendererDirty.spec.ts`（Slice D，擴充＋**改寫 clear-spy 測試**）

- **既有斷言值多數不改**（roads/labels/territory/day-only 零增量／owner 翻轉 territory 計數／re-setMapData `+3`〔now 由簽章 diff 保證，見 §13-B3〕）。
- **必改（#M1）**：既有「翻轉一個城 owner→恰該 node +1、其餘不重畫」測試（`:222-251`）以 `vi.spyOn(g, 'clear')` **spy `nodeMarkers.children` 之 `Graphics`**。V7 後 children 為 `castleNode`/`districtNode` **Container**（mock Container 無 `clear`）→ `vi.spyOn` 於 setup 即 throw。**改寫為：對每節點 container 之 `children[0]`（castle＝`bodyGfx`／district＝其單一 gfx）spy `clear`**，斷言翻轉節點之 body clear 恰一次、其餘為零；並以 `rebuildCounts.nodeMarkers` 交叉印證。此為 Slice D 明確 scope（草稿「既有斷言不改值」對此測試為誤）。
- 新增 §8.2 describe（見 §8.2）。dirty-spec fixture（合成 outline，V5 已備）沿用。

### 5.7 `src/ui/map/MapCanvasHost.spec.tsx`（Slice D）

- `nodeMarkers.children.length===1` 維持通過（元件 container 取代 Graphics）。it 標題可微調為「各建立一個 ScenePart container」。
- **必改（#3）**：`children[0]?.scale.x === 1.4` 現斷言 container scale。V7 far 本城放大移至 **`bodyGfx`**（container.scale 恆 1）→ 改斷言 **`nodeMarkers.children[0].children[0].scale.x === 1.4`**（該本城 container 之 `bodyGfx`；`children[0]===bodyGfx`，§3.1）。此為 Slice D scope。
- **不需擴充 pixi mock**（castleNode/districtNode/selectionRing/settlements 僅用 `Container`/`Graphics`；選取環以 plain `addChild` 掛載，**不需 `addChildAt`/`getChildIndex`**；inline mock 之 `Graphics` 已含 clear/poly/circle/arc/moveTo/lineTo/fill/stroke）。
- 既有 seaBackground/roads/labels child-count 斷言**不受影響**。可新增「settlements 於 near 顯示、選取環於 node 選取時顯示」smoke。

### 5.8 `src/data/scenarios/s1560/castles.json`（Slice A）

回填 `terrainKind`（13 座 mountain，見 §6.2）。

### 5.9 `src/core/debugVisual.ts` ＋ `tests/visual/debugVisual.spec.ts`（Slice A，CD8）

- `debugVisual.ts`：城參數加可選 `maxDurability?`（預設＝durability）；駿府 durability→`round(BAL.durabilityMain*0.25)`/max→`BAL.durabilityMain`；掛川 durability→`round(BAL.durabilityBranch*0.45)`/max→`BAL.durabilityBranch`；新增掛川 encircle 圍城（小型織田軍，troops < 掛川 soldiers × `BAL.encircleRatio`，`beginSiege` 後設 `mode='encircle'`）；`validateState` 通過；檔頭 docstring 更新（軍隊數＋「2 場圍城」）。**純資料、無 Math.random/Date.now；debug-visual 不在 golden 路徑（golden 僅 'mini'）→ golden byte-identical。**
- `debugVisual.spec.ts`：既有 tier/count/anchor-siege 斷言不受影響（anchor 過濾駿府）；新增「掛川 warning=threatened、駿府/掛川耐久 ratio」斷言。

### 5.10 sceneParts 既有單測（Slice B/C 各自擁有）

`tests/ui/sceneParts/castleNode.spec.ts`／`districtNode.spec.ts`／`selectionRing.spec.ts`：因 castleNode 幾何/三子 Graphics 重構＋`setLodStage`＋warning、selectionRing 雙環、districtNode 可選欄＋`setLodStage`，需同步（見 §8.1）。**`update` 回傳仍為 `void`（AD2）——既有 void-return 斷言不需改。**

---

## 6. 內容／資料規格

### 6.1 城池剪影幾何（世界單位；局部座標，中心＝原點，`-y` 為上；`S`＝tier 對應 size）

> 皆為設計建議比例；實作以 `boundingBoxOf` 測試斷言外接盒與型別特徵。繪製序（`bodyGfx` 由下而上）：**投影 → （山城）岩基三角 → 外郭 → （本城）二階內主郭 → （平城）護城河短弧**。

**共通**：投影＝外郭多邊形（本城另含岩基）整體位移 `(+shadowOffset, +shadowOffset)`，填 `ink900` α`shadowAlpha`（先畫、最底）。外郭/牆填 `clanColorNum(colorIndex)`＋描 `ink900` w`strokeWidth(2)`。本城內主郭填 `clanColorNum(colorIndex, true)`（亮變體）＋描 `ink900`。

| 型別      | 外郭/牆頂點（局部，×S）                                                                                                 | 內主郭                                                   | 型別特徵                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 本城·平城 | 不規則五角（低寬）：`[-.50,.30, .50,.30, .50,-.02, .12,-.20, -.50,-.02]`                                                | `mainKeepPoints(.5S)` 上移 `innerKeepLiftPlain(.10)S`    | 護城河：`(±.35S, .34S)` 兩枚 `arc` 半徑 `.12S`、`waterRiver` α`.5`、掃角 ~120° |
| 本城·山城 | 岩基三角 `[-.50,.42, .50,.42, 0,-.06]`（`reliefInk` α`.9`＋ink900 描）＋窄牆 `[-.30,.30, .30,.30, .30,-.10, -.30,-.10]` | `mainKeepPoints(.5S)` 上移 `innerKeepLiftMountain(.26)S` | 三角岩基＋窄高牆＋高主郭                                                       |
| 支城·平城 | 四角梯形（低寬）：`[-.50,.26, .50,.26, .40,-.16, -.40,-.16]`                                                            | 無                                                       | 單層四角郭                                                                     |
| 支城·山城 | 小岩基三角 `[-.46,.40, .46,.40, 0,.02]`＋窄牆 `[-.30,.30, .30,.30, .26,-.18, -.26,-.18]`                                | 無                                                       | 三角岩基＋窄牆                                                                 |

`mainKeepPoints(size)`：沿用既有雙層屋簷頂點，縮至 `.5S`。外接盒維持 ≈ `S×S`（供 ×1.4 剪影放大與命中對齊）。

**警戒/受攻徽記（`warnGfx`）**：

- threatened：城頂 `(0, -S/2 - signalFireLift)` 畫金烽火——`ink900` 細桿（w1）＋ 2 枚上尖三角焰（`accentGold`，外接盒 `signalFireSize(7)`）。
- critical：跨主郭 3 段鋸齒裂口折線（`accentVermilion` w`crackWidth(1.5)`，起於 `(-.2S,-.1S)` 折至 `(.15S,.1S)`）＋靜態光暈圓（半徑 `ringRadius + criticalHaloPad(4)`、`accentVermilionBright` α`criticalHaloAlpha(.5)` w2）。

### 6.2 s1560 全 34 城 `terrainKind` 史地指派（Slice A 回填 castles.json）

**mountain（13 座，山城）**：`稻葉山城(inabayama)`、`小谷城(odani)`、`觀音寺城(kannonji)`、`岩村城(iwamura)`、`佐和山城(sawayama)`、`霧山御所(kiriyama)`、`芥川山城(akutagawa)`、`飯盛山城(iimoriyama)`、`信貴山城(shigisan)`、`八上城(yakami)`、`八木城(yagi)`、`此隅山城(konosumiyama)`、`竹田城(takeda)`。
**plain（21 座）**：`清洲城(kiyosu)`、`那古野城(nagoya)`、`犬山城(inuyama)`、`駿府館(sunpu)`、`興國寺城(kokokuji)`、`掛川城(kakegawa)`、`曳馬城(hikuma)`、`吉田城(yoshida)`、`田原城(tahara)`、`岡崎城(okazaki)`、`大垣城(ogaki)`、`田丸城(tamaru)`、`日野城(hino)`、`二條御所(nijo)`、`勝龍寺城(shoryuji)`、`石山御坊(ishiyama)`、`高屋城(takaya)`、`岸和田城(kishiwada)`、`筒井城(tsutsui)`、`雜賀城(saika)`、`長島城(nagashima)`。

> 判準：史實明確山頂/山腰城列 mountain；平地/平山/水城/寺內町列 plain。回填：於 castles.json 各城物件加 `"terrainKind": "mountain"`（21 座 plain 依 schema `.default('plain')` 可省略以縮 diff，或全填以自我文件化——實作 agent 擇一，terrain.spec 斷言 13 山城命中即可）。

### 6.3 fixture（`debug-visual-map-01`）城型/耐久/警戒與 DoD 對映

- **城型**（`DEBUG_VISUAL_CASTLE_TERRAIN`）：岐阜（＝稻葉山城化名）→ **mountain**；清洲/鳴海/駿府/掛川 → plain。**core `debugVisual.ts` 城型不改**（走葉模組）。
- **耐久（CD8）**：清洲/鳴海/岐阜滿耐久（ratio 1.0 → **綠環**）；**駿府 ratio 0.25 → 朱環（vermilion）**；**掛川 ratio 0.45 → 金環（gold）**。三色門檻 close 皆現。
- **警戒/受攻（CD8）**：**駿府 assault → critical**（裂口＋朱紅光暈＋SiegeMarker）；**掛川 encircle → threatened**（金色烽火）。兩態皆現。**耐久環色與 warning 為兩通道**：駿府朱環（因 ratio 0.25）＋朱光暈（因 critical）語意一致；掛川金環（因 ratio 0.45）＋金烽火（因 threatened）語意一致。**（草稿誤稱「駿府 vermilion 耐久環」是把耐久 ratio 色與 critical 光暈混為一談；本版以 CD8 令 ratio 真的落在 vermilion 段，兩者才實際皆朱。）**
- **operational(0.5)**：4 座平城（清洲 main／鳴海 branch／駿府 main／掛川 branch）＋1 座**山城**（岐阜 main）→ DoD「operational 可分平城/山城」；本城名可讀、重疊眼驗收（§9.3-2）。
- **overview(0.25)**：僅本城（清洲/駿府/岐阜，剪影 ×1.4）＋歸屬填色＋ink900 輪廓；駿府被圍（critical）→ far 亦顯 SiegeMarker＋受攻光暈＋耐久環（`warning!=='none'`）；**支城/郡隱、城名全隱（far 無城名）**；**選取環繞駿府（landed-V6 預選）＋相鄰道路金色高亮** → DoD item 2。
- **close(1.25)**：耐久三色（駿府朱/掛川金/其餘綠）＋警戒（掛川金烽火）＋受攻（駿府裂口+光暈）＋城下聚落（清洲/駿府/岐阜三本城）＋城名/郡名＋選取雙環。

### 6.4 繪製幾何總表（世界單位）

| 元件               | 幾何                                        | 顏色                                         | LOD                                                 |
| ------------------ | ------------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| 本城/支城剪影      | §6.1 四型多邊形＋右下投影 2–3px             | clan 填 + ink900 描                          | 本城 far＋（剪影 ×1.4）、支城 mid＋                 |
| 二階內主郭（本城） | `mainKeepPoints(.5S)` 上移                  | clan-bright 填 + ink900 描                   | 隨城體                                              |
| 護城河短弧（平城） | 兩枚 arc r=.12S                             | waterRiver α.5                               | 隨城體                                              |
| 岩基三角（山城）   | 三角                                        | reliefInk α.9 + ink900 描                    | 隨城體                                              |
| 耐久環             | r main20/branch15、w3、掃角 ratio×360°      | moss/gold/vermilion（依 ratio）+ ink300 底環 | near，或 warning≠none 時 far/mid；**不隨剪影 ×1.4** |
| 警戒烽火           | 桿＋雙焰 7px                                | accentGold（桿 ink900）                      | warning=threatened；**不隨 ×1.4**                   |
| 受攻裂口＋光暈     | 3 段鋸齒 + 光暈圓 r=ring+4                  | accentVermilion / accentVermilionBright α.5  | warning=critical；**不隨 ×1.4**                     |
| 被圍外弧           | SiegeMarker（既有，不動）                   | vermilionBright                              | 隨 view.sieges/cull                                 |
| 郡節點             | 圓 r7 α.7 + ink700 描 + 中心點（既有，AD3） | clan/neutralClanless + 點                    | mid＋（nearish）                                    |
| 城下聚落           | 6 屋頂 5×3 + 4 田畦 8px，環 [22,42]         | plainLight α.55 / reliefInk α.3              | near                                                |
| 節點選取環         | 雙同心環 r=hit+6 / hit+2、w2/3              | accentGold                                   | 任意（selectionAndPath 無 LOD gate）                |

---

## 7. 切片分解與整合序（檔案擁有權嚴格互斥；整合序 A →（B‖C）→ D）

### Slice A — 資料／core view（城型 + 郡狀態 view-model + fixture DoD 佐證）

**擁有**：`src/data/schemas/castle.ts`（+terrainKind）、`src/data/scenarios/s1560/castles.json`（回填 13 山城）、`src/core/state/debugVisualCastleTerrain.ts`（新）、`src/core/state/selectors.ts`（`castleTerrainLookup`＋`MapDistrictViewModel`＋`selectMapViewModel` 填 terrainKind/districts）、`src/core/state/builder.ts`（確認不搬 terrainKind；註解）、`src/core/debugVisual.ts`（**CD8：maxDurability 支援＋駿府/掛川耐久＋掛川 encircle 圍城＋docstring**）、`tests/data/castleTerrain.spec.ts`（新）、`src/core/state/debugVisualCastleTerrain.spec.ts`（新）、`tests/visual/debugVisual.spec.ts`（CD8 擴充）、`tests/core/selectorsMapView.spec.ts` 之擴充（補 districts，§13-m2）。
**契約產出**：`castleTerrainLookup(scenarioId)`；`DEBUG_VISUAL_CASTLE_TERRAIN`；`MapDistrictViewModel`；`selectMapViewModel` 之 `castles[].terrainKind` 真值 + `districts[]`；fixture 之耐久/警戒 DoD 佐證。
**驗收**：`npm run validate:data`（castles.json zod＋簡體字掃描）；`npm run test:core`（**golden byte-identical、stateHash 未變**；`castleTerrainLookup` 分派、山城命中；districts 對映；debugVisual `validateState` 綠、掛川 threatened、耐久 ratio）；`npm run typecheck`。

### Slice B — 城池 + 選取環 sceneParts

**擁有**：`src/ui/map/sceneParts/castleNode.ts`（四型剪影/三子 Graphics/`setLodStage` 含剪影 ×1.4/warning props；`update` 仍 void）、`tests/ui/sceneParts/castleNode.spec.ts`、`src/ui/map/sceneParts/selectionRing.ts`（雙環）、`tests/ui/sceneParts/selectionRing.spec.ts`。
**依賴契約**：無（`CastleNodeProps` 自含字面型別；`LodStage` from `../lod`〔V5 既存〕；`ScenePart` from `@ui/components/types`）。
**驗收**：`castleNode.spec`/`selectionRing.spec` 全綠；`npm run test:ui`；`typecheck`。

### Slice C — 聚落 + 郡節點

**擁有**：`src/ui/map/settlements/settlementsDraw.ts`（新）、`src/ui/map/settlements/settlementsDraw.spec.ts`（新）、`src/ui/map/sceneParts/districtNode.ts`（可選狀態欄/`setLodStage` no-op；`update` 仍 void）、`tests/ui/sceneParts/districtNode.spec.ts`。
**依賴契約**：無（`SETTLEMENT` 常數自含；`MapGraph`/`CastleTier` 型別既有）。
**驗收**：`settlementsDraw.spec`（seeded 決定論、只繞本城、環半徑 ≥22）／`districtNode.spec` 全綠；`test:ui`；`typecheck`。

### Slice D — 整合器（**最後，唯一改 MapRenderer/mapViewTypes/dirty/composeMapView/mapDraw/整合測試**）

**擁有**：`src/ui/map/MapRenderer.ts`、`src/ui/map/mapViewTypes.ts`、`src/ui/map/dirty.ts`（`buildNodeSig`/`diffNodeSig`）、`src/ui/map/dirty.spec.ts`（新/擴充，§13-m1）、`src/ui/map/composeMapView.ts`（districts pass-through）、`src/ui/map/mapDraw.ts`（移除 drawNodeMarker*）、`tests/ui/mapDraw.spec.ts`、`src/ui/map/mapRendererDirty.spec.ts`（擴充＋改寫 clear-spy 測試）、`src/ui/map/MapCanvasHost.spec.tsx`（改 scale 斷言＋smoke）。
**依賴契約**：A（`terrainKind`/`districts`/`MapDistrictViewModel`／fixture DoD 佐證）、B（`createCastleNode`/`CastleNodePart`/`createSelectionRing`）、C（`buildSettlements`/`createDistrictNode`/`DistrictNodePart`）。**V6 契約**（`roadHighlight`/`prevSelectionKey`/init 之 selectionAndPath addChild 序）視為 landed，V7 於同檔改寫 init 掛載段（插入 selectionRing）。
**驗收**：`npm test` 全綠（含新 dirty 案例、正向存在、選取環、聚落、clear-spy 改寫、scale 斷言改）；`npm run build`；`npm run e2e`（舊 baseline 失敗＝預期）。

### 整合序

`A`（資料/core view + fixture DoD，凍結契約）→ `B`‖`C`（互斥並行）→ `D`（整合、移除 drawNodeMarker、接線、dirty 擴充、整合測試改寫、baseline）。

---

## 8. 測試計畫

### 8.1 純模組單測（Slice B/C/A/D）

| 測試檔（擁有者）                        | 覆蓋                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `castleNode.spec.ts`（B）               | `drawCastleBody`：先 clear；四型外接盒 ≈ S×S；平城 `arc`≥2、山城岩基三角 poly（含 apex）；本城二階內主郭（poly 數 > 支城）；填 `clanColorNum(idx)`＋亮變體、描 `ink900` w2；投影 poly 位移 `(+shadow,+shadow)` α`shadowAlpha`。`drawDurabilityRing`/`durabilityRingColor`：半徑/線寬/起角/**三段門檻色（ratio 1.0→綠、0.45→金、0.25→朱）**/底環（沿用既有）。`drawCastleWarning`：threatened→gold 三角焰；critical→vermilion 鋸齒 + 光暈圓 r=ring+4 α.5；none→無繪製。`update`：pos-only→僅 reposition（不重繪、回傳 void）；props 變→三子重繪。`setLodStage`：far+warning='none'→ring/warn 隱；near→ring 顯；warning≠none→ring/warn 顯（far 亦顯）；**far+main→`bodyGfx.scale.x===farMainBodyScale(1.4)`、ring/warn scale 恆 1；非 far 或非 main→bodyGfx.scale 1**。 |
| `selectionRing.spec.ts`（B）            | 雙同心環（circle 數=2，半徑 hit+6 / hit+2）皆 accentGold；primary→w3、否則 w2；update pos-only 僅 reposition。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `settlementsDraw.spec.ts`（C）          | `settlementSeed` 決定論；`drawSettlementCluster` 雙跑指令序 byte-identical；屋頂數=roofCount、田畦數=furrowCount；所有屋頂中心距 center ∈[22,42]（**≥ringRadiusMain(20)**，不侵入城體/環）；`buildSettlements` 只對本城建、支城/郡不建；城依 id 字典序。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `districtNode.spec.ts`（C）             | 既有幾何斷言不變（AD3）；可選欄未給→預設直轄實心點；`update` void（pos-only 僅 reposition）；`setLodStage` no-op 不 throw。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `castleTerrain.spec.ts`（A）            | `zCastle` terrainKind default 'plain'、enum 拒非法；`castleTerrainLookup('s1560')` 13 山城命中、其餘 plain；`castleTerrainLookup('debug-visual-map-01')['castle.gifu']==='mountain'`；快取同參考。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `debugVisualCastleTerrain.spec.ts`（A） | 每 key ∈ fixture castle id 集；值 ∈{'plain','mountain'}；gifu=mountain。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| selectors 擴充（A）                     | `selectMapViewModel(fixtureState).castles.find(gifu).terrainKind==='mountain'`、sunpu==='plain'；`districts[]` 對映；**golden replay 未變**（`test:core` golden spec 綠）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `debugVisual.spec.ts` 擴充（A，CD8）    | 掛川 warning=threatened（encircle 圍城）；駿府耐久 ratio≈0.25、掛川≈0.45、清洲/鳴海/岐阜 ratio=1.0；`validateState` 通過；既有 tier/count/anchor-siege 斷言仍綠。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `dirty.spec.ts`（D）                    | `buildNodeSig`：castle 簽章含 owner/dur/warning/terrainKind/tier、day 不入；`diffNodeSig(null,x)` 回全 id；owner 變/耐久變/warning 變/terrainKind 變→該 id dirty；day-only→空集。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### 8.2 `mapRendererDirty.spec.ts` 擴充（D）— 節點元件 dirty＋正向存在＋選取環

既有斷言值**多數不改**（re-setMapData `+3`、owner 翻轉 territory、day-only 零增量）；**clear-spy owner-flip 測試改寫（§5.6/#M1）**。新 `describe('城池/郡 元件（M6-V7）')`：

- **不再呼叫 drawNodeMarker（DoD）**：斷言 `mapDraw` 不再匯出 `drawNodeMarker`；`nodeMarkers` children 為 castle/district container（`container.label` 為 `'castleNode'`/`'districtNode'`）——堵「靜默保留占位」。
- **首繪＋正向存在**：`setMapData`＋首 `updateView`（含 gifu=mountain、sunpu warning=critical、掛川 warning=threatened）→ `nodeMarkers.children.length===節點數`；`rebuildCounts.nodeMarkers===節點數`；一 critical 節點之 `warnGfx.visible===true`、一 threatened 節點之 `warnGfx.visible===true`。
- **耐久/警戒/城型 dirty**：翻一城 `durability` → `nodeMarkers +1`；翻 `warning` → `nodeMarkers +1`；`territory` 不因 castle-only 變動增。
- **re-setMapData +3（B3 守門）**：重新 `setMapData(same)` + 同 `updateView` → `nodeMarkers === baseline + 節點數`（計數由簽章 diff 成員數保證，與元件冪等短路無關）。
- **clear-spy 改寫（#M1）**：翻一城 owner → 對每節點 container 之 `children[0]`（body gfx）spy `clear`，翻轉節點恰一次、其餘零。
- **day-only 零增量**：僅 `day` 變連跑 30 日 → `nodeMarkers`/`territory`/`labels`/`roads` 零增量。
- **owner 翻轉**：翻一郡 owner → `territory +1`、對應郡 node `nodeMarkers +1`；僅受影響節點。
- **聚落正向存在**：`setMapData` 後 `settlements.container` 非空；`applyLodAndCulling` far→`settlements.visible===false`、near→`true`。
- **選取環 dirty（與 V6 協調）**：`selection` null→node（castle）→ `selectionRing.container.visible===true` 且 update 被呼叫（spy）、V6 `roadHighlight` 亦更新；再 day-only→不重更新；`selection`→army→ 選取環隱；`rebuildCounts` 全程不動、`MapRebuildCounts` 5 欄位 `toEqual` 成立。**選取環 z-order：於 `selectionAndPath` 之 children 序為 `[roadHighlight, selectionRing, pathPreview]`（斷言 index 或以具名參考）。**
- **StrictMode/destroy**：init→setMapData→destroy→重掛，`nodeParts`/`selectionRing`/`settlements` 對稱建立/銷毀，無殘留。

### 8.3 jsdom 可測/不可測

- **可測**：繪製指令序（recordingGraphics）、層結構/child 掛載、dirty 計數、`setLodStage` 顯隱/bodyGfx scale、選取環 visible/z-order、聚落決定論、buildNodeSig/diffNodeSig、golden 未變、fixture 耐久 ratio/warning。
- **不可測（→ e2e baseline 人工核，§9.3）**：實際像素外觀、平/山城剪影美感、投影紙雕感、聚落低對比、耐久三色透出、選取環雙環於暖底可辨、operational 城名重疊。

### 8.4 e2e

- `e2e/visual.spec.ts` **不改**（三 preset 既存）；baseline 三張重生（獨立 commit，§9.2）。
- plan/17 §3.9.3 layer-presence smoke：本階段以 §8.2 mock 版「nodeMarkers/settlements 正向存在」涵蓋單元層面。

---

## 9. Gate 清單與 baseline 程序

### 9.1 orchestrator gate 指令序（plan/18 §3.13）

```
npm run typecheck
npm run lint
npm run validate:data        # castles.json terrainKind zod ＋簡體字掃描（含新檔註解；無新 BitmapText 字串）
npm test                     # 全 vitest（core golden 未變＋debugVisual validateState/threatened/耐久 ratio＋ui dirty/正向存在/選取環/聚落/clear-spy 改寫/scale 斷言＋data castleTerrain＋dirty 純函式）
npm run build
npm run e2e                  # build＋Playwright smoke（chromium）；舊 baseline 失敗＝預期
# 確認城型/耐久三色/警戒雙態/聚落/選取環顯示無誤後，再單獨更新視覺 baseline：
npm run e2e:visual:update    # darwin
```

**不觸發**：`npm run gen:assets`／`validate:assets`（無新素材）、`npm run font:subset`（無新字串）。**禁**：`npm run golden:update`（core/GameState 未變；debug-visual 不在 golden 路徑）。

### 9.2 baseline 再生（darwin＋linux）

- darwin：`npm run e2e:visual:update`。linux（CI parity）：docker `mcr.microsoft.com/playwright:v1.61.1-noble` 掛載 repo 跑同指令，再 in-container 確認重現。
- baseline 檔：`e2e/visual.spec.ts-snapshots/strategy-{overview,operational,close}-chromium-{darwin,linux}.png`。
- **獨立 commit**（plan/17 §3.9.3.1），PR 附 before/after＋對應 art-bible 條目（§6.4/§7）＋reviewer 核准。

### 9.3 眼驗收（提交 baseline 前）

1. **overview(0.25)**：僅本城（清洲/駿府/岐阜，剪影 ×1.4）＋歸屬填色＋ink900 輪廓；駿府顯 SiegeMarker＋受攻光暈＋耐久環；**支城/郡隱、城名全隱（far 無城名）**；選取環（駿府）＋相鄰道路金色高亮清晰；巢狀無反轉（選取外環 26 > 光暈 24 > 選取內環 22 > 耐久環 20 > 剪影）；3 秒內辨本城與歸屬（DoD item 2）。
2. **operational(0.5)**：5 城全顯，**岐阜山城**（三角岩基＋窄高牆）vs 其餘平城（水平寬矮＋護城河短弧）輪廓可分（DoD）；**城名重疊硬檢**（清洲/岐阜 Δ≈(14,32)px，確認不重疊；若重疊記入補救）；掛川金烽火（threatened）可辨；郡節點浮現。
3. **close(1.25)**：**耐久三色**（駿府朱/掛川金/其餘綠）＋警戒（掛川金烽火）＋受攻（駿府裂口+光暈）＋**城下聚落**（清洲/駿府/岐阜屋頂群＋田畦，低對比、不蓋城/路）＋城名/郡名＋選取雙環清晰。
4. **色弱/灰階**：本城 vs 支城（五角 vs 四角）、平 vs 山（岩基三角）、warning（烽火 vs 裂口/光暈形狀）、耐久（環缺口比例、非只靠色）、選取（雙環形狀）皆不只靠顏色。
5. **投影方向一致**：全城右下 2–3px 投影、左上受光；選取環錨點置中不隨投影偏移。
6. **城名對比條件式修正**：若任一城名於暖底/領地染色上對比不足 → node label 顯式加 `fill: TOKENS_NUM.ink900`（CD6，view-only 單行）。
7. **聚落不喧賓奪主**：城下屋頂/田畦 alpha 低於城體、位於 nodeMarkers 之下、不與道路/節點糊在一起、不侵入耐久環（innerR≥22）。
8. **StrictMode 重掛**：nodeParts/選取環/聚落建立/銷毀對稱，無 WebGL context lost、heap/texture 回穩態。

---

## 10. plan §8 回寫草稿

### 10.1 `plan/04-map-and-movement.md` §8.1 末新增（**不改 §00**）

> **2026-07-17（[M6-V7] 城池／郡／聚落）**：依 §3.10.1（`settlements`/`nodeMarkers`）與 12 §3.3 落地：
> (1) **nodeMarkers 由占位 `drawNodeMarker` 換為 `CastleNode`/`DistrictNode` 元件**（DoD）：`nodeParts` 改持元件；`drawNodeMarker`/`drawNodeMarkers` 自 `mapDraw.ts` 移除。
> (2) **dirty diff 擴充為 owner 訊號（territory 不變）＋節點視覺簽章 diff**（`dirty.buildNodeSig`/`diffNodeSig`）：castle 簽章含 owner/durability/warning/terrainKind/tier、district 含 owner/steward/subjugation/ikki；**day 不入簽章**；**節點重繪計數＝簽章 diff 成員數（比照現行 owner-diff 迴圈，不依賴元件 `update` 回傳值）**，`ScenePart.update` 維持 `void`（`MapRebuildCounts` 5 欄位不變）。
> (3) **`terrainKind` 由作者標定 scenario 顯示欄位供給、view 邊界注入、不進 GameState**（golden byte-identical）：`castles.json`＋`zCastle`（`.default('plain')`），`builder.ts` 刻意不搬；`castleTerrainLookup(scenarioId)`（fixture 走 `debugVisualCastleTerrain.ts` 葉模組）取代 `selectMapViewModel` 佔位；s1560 全 34 城指派（13 山城）見設計 §6.2。
> (4) **平城/山城 × 本城/支城四型向量剪影**（非 atlas sprite）：35° 假等角紙雕、左上受光/右下投影、郭內 clan 填＋ink900 描；平城水平寬矮＋護城河短弧、山城三角岩基＋窄高牆；本城二階內主郭、支城單層四角；**far 本城僅放大剪影 `bodyGfx`（×1.4），耐久環/警戒徽記不隨之放大**。
> (5) **狀態**：耐久環沿用既有門檻/顏色（`durabilityRingColor` 依 ratio）、被圍沿用 `SiegeMarker`、警戒＝靜態金烽火、受攻＝靜態裂口＋凍結朱紅光暈；**耐久 ratio 色與圍城 warning 為兩獨立通道**；**低頻脈衝與落城補間＋煙塵延後**（決定論優先）。
> (6) **城下聚落**（`settlements` 層）：runtime seeded `Graphics`、只繞本城、close LOD、低對比、繪於 nodeMarkers 之下、散佈環 [22,42]（≥耐久環）。
> (7) **LOD**：far 僅本城（＋被圍/瀕危狀態環，剪影 ×1.4）、mid ＋支城/山城型/本城名、near ＋耐久/警戒/聚落/支城名；**far 無任何城名**（既有 label LOD `nearish && (main||detail)`）；node 於 far 僅 main 顯（既有「castle 恆顯」收斂為「main 恆顯」，屬 baseline-expected 語意變更）。
> (8) **`MapViewState.districts?` 可選 view-model 擴充**（AD1，golden 安全）；owner 仍取 districtOwner。
> (9) **fixture DoD 佐證（`debugVisual.ts`，golden 安全）**：支援 `maxDurability≠durability`，駿府 25%（朱環+critical）、掛川 45%（金環）+ 新增掛川 encircle 圍城（threatened 金烽火），使耐久三色與雙警戒態在三段 baseline 可見（debug-visual 不在 golden 路徑）。**選取環於三段 baseline 可見係倚 landed-V6 已預選駿府節點；V7 不改 `visualMapBoot`。**
> 依據：M6-V7 技術設計（4 slice）；18-roadmap M6-V7；CLAUDE.md 鐵律①②；`test:core` golden 全綠；baseline 更新獨立 commit。

### 10.2 `plan/12-ui-components.md` §8（設計決策記錄）新增

> **[M6-V7]**：(a) §3.3.2 CastleNode 幾何以平城/山城 × 本城/支城四型剪影＋二階內主郭＋右下投影擴充（保留 28/20 尺寸、填框、耐久環契約）；`terrainKind`/`warning` 併入繪製 props；far 本城只放大剪影 `bodyGfx`。(b) §3.3.2 名標 halo：Pixi BitmapText 無 halo 且無預烘焙底板，V7 不引入 halo（對比不足時以 `fill:ink900` 修正）；**城名重疊風險在 operational（far 無城名），以眼驗收把關**。(c) §3.3.4 選取環：art-bible §6.4「金色雙環」優先於 §3.3.4「單環」，改繪雙同心金環（外 hit+6／內 hit+2）；掛於 `selectionAndPath` 之 `[roadHighlight, selectionRing, pathPreview]` z-order（plain addChild 插序）；脈動延後。(d) §3.3.3 DistrictNode 幾何沿用（filled 70%＋ink700＋中心點）不改為 art-bible「空心圓印」（AD3）；狀態欄可選。(e) `ScenePart.update` 維持 `void`（節點計數改由 dirty 簽章成員數驅動，非 update 回傳）。(f) 落城補間＋煙塵、受攻低頻脈衝延後至 effect 里程碑。

---

## 11. Commit 計畫（plan/18 §3.13；整合序 A →（B‖C）→ D）

1. `feat(data): M6-V7 城型 terrainKind 資料與 scenario 分派 view、fixture DoD 佐證 [M6-V7]`（Slice A：zCastle＋castles.json＋debugVisualCastleTerrain＋castleTerrainLookup＋selectMapViewModel terrainKind/districts＋builder 註解＋debugVisual 耐久/encircle＋tests）。
2. `feat(map): M6-V7 平城／山城城郭剪影與金色雙環選取 [M6-V7]`（Slice B）。
3. `feat(map): M6-V7 城下聚落與郡節點接線 [M6-V7]`（Slice C）。
4. `feat(map): M6-V7 nodeMarkers 元件整合、節點簽章 dirty 與選取環接線 [M6-V7]`（Slice D）。
5. `test(visual): 更新 M6-V7 三段 baseline（城型／耐久三色／警戒／聚落／選取）[M6-V7]`（**獨立** baseline commit）。
6. `docs(plan): 回寫 04 §8／12 §8 M6-V7 設計決策 [M6-V7]`（§10 草稿）。

---

## 12. 風險與回滾

| 風險                                                        | 影響                    | 緩解／回滾                                                                                              |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| terrainKind 誤搬入 GameState                                | golden 變、test:core 紅 | builder `castles.map` 明令不含 terrainKind（具名構造，已驗證）；Slice A 驗收含「golden byte-identical」 |
| debugVisual 耐久/圍城編修誤入 golden 路徑                   | golden 變               | debug-visual 不在 golden（golden 僅 'mini'，已驗）；純資料無 rng；Slice A `test:core` 綠守門            |
| 掛川 encircle 圍城破 validateState                          | test:core 紅            | 攻方 troops < 掛川 soldiers × encircleRatio、beginSiege 後設 mode='encircle'、回傳前 validateState      |
| 簽章遺漏欄位致狀態不更新                                    | 受攻/耐久不重畫         | §8.1 dirty.spec 明測各欄；§8.2 warning/durability dirty 守門                                            |
| 簽章誤含 day 致每日全節點重畫                               | 破 dirty DoD            | buildNodeSig 明確不納 day；§8.2 day-only 零增量 30 日                                                   |
| 計數依 update 回傳 boolean → re-setMapData +3 退為 +0（B3） | dirty spec 紅           | **計數＝簽章 diff 成員數**（CD1），元件冪等短路不影響計數                                               |
| 選取環用 addChildAt → mock 無此法（B1）                     | init 崩、兩 suite 紅    | plain `addChild` 三次插序（CD5/§5.1），禁 addChildAt/getChildIndex                                      |
| buildNodeProps pos {0,0} → 節點疊原點（B2）                 | fixture 全毀            | buildNodeProps 取真實 `graph.nodes.get(id).pos`                                                         |
| clear-spy owner-flip 測試對 Container spy clear（M1）       | test:ui 紅              | §5.6 改寫為 spy 各節點 container.children[0] 之 body gfx clear                                          |
| ×1.4 放大耐久環/光暈致 overview 巢狀反轉（#3）              | overview 雜亂           | far boost 只施於 bodyGfx（setLodStage），ring/warn 自然尺寸；§3.3 巢狀驗證                              |
| MapCanvasHost scale 斷言破（#3）                            | test:ui 紅              | §5.7 改斷言 children[0].children[0]（bodyGfx）scale                                                     |
| MapViewModel 必填 districts 破 selector shape 測（m2）      | test:core 紅            | Slice A 補 selectorsMapView.spec 之 districts                                                           |
| 聚落 seeded 跨平台不決定論                                  | baseline 抖動           | 純字串 hash→NR-LCG；§8.1 雙跑 byte-identical＋darwin/linux 各生                                         |
| operational 城名重疊（DoD item 3）                          | 眼驗收失敗              | §9.3-2 硬檢清洲/岐阜 Δ≈(14,32)px；補救＝縮短 label/微調 y-offset                                        |
| 山城 vs 平城於 0.5 不可分                                   | DoD 失敗                | 三角岩基＋窄高牆為強形狀差異；§6.1；必要時加大岩基比例                                                  |

**整體回滾**：全在 `src/ui`／`src/data`／`src/core/state`（view-model 純函式/純資料）／`castles.json`／`debugVisual.ts`（debug scenario，非 golden）／debug 葉模組；`GameState`／tick／s1560 golden 零觸。若城型/聚落視覺不達標，可暫緩 Slice C（聚落）而先交付 nodeMarkers 元件＋選取環＋耐久/警戒，DoD「不再呼叫占位 marker」與「本城/歸屬/選取/耐久/警戒可辨」由 Slice A/B/D 達成。

---

## 13. 對抗性審查逐條處置表

| #   | 審查來源                   | findings 摘要                                                                                                                                                                                                                                                                                                                                                                  | 處置                                                                                                                                                                                                                                                                                                                                                                                                                        | 落點                                                 |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | spec #1 (BLOCKER)          | 選取環在 fixture 不顯（visualMapBoot 選軍隊）；建議把 visualMapBoot 納 Slice D 並改選節點；V7/V8 單一 selection 衝突                                                                                                                                                                                                                                                           | **部分接受／部分拒絕**：核心前提已被 **landed-V6 Slice F** 推翻——V6 已把 `visualMapBoot` 選取改為駿府本城，`composeMapView` 映 `castle→node`，故 fixture 已預選駿府節點、選取環三段皆顯（DoD item 2 達成）。**拒絕**把 `visualMapBoot.ts`／其 spec 納入 Slice D（V6 已擁有並完成，重複擁有反破切片互斥）。**接受**明確裁定 V7-node vs V8-army 單一 selection 衝突（V7 顯節點環、V8 屆時改指軍隊且節點環消失，屬 V8 之責）。 | 前置事實第 6 點、CD5、§6.3、§10.1-(9)                |
| 2   | spec #2 (MAJOR)            | 全 fixture 城滿耐久→耐久環全綠、三色門檻不現；doc 誤稱駿府「vermilion 耐久環」混淆耐久 ratio 色與 critical 光暈                                                                                                                                                                                                                                                                | **接受**：CD8 新增——(a) 更驗實：因 `maxDurability=durability`（builder），單改數值無效，須讓 builder 支援 `maxDurability≠durability`；(b) 駿府 ratio 0.25（朱環）、掛川 0.45（金環）、其餘綠環，三色 close 可見；(c) doc 全面改為「耐久 ratio 色與 warning 為兩通道」，§6.3 明列。golden 安全（debug 非 golden）。                                                                                                          | CD8、§1.2-8、§5.9、§6.3、§8.1                        |
| 3   | spec #3 (MAJOR)            | ×1.4 container scale 連帶放大 ring/warn，overview 同心環雜亂、選取環落在放大耐久環內（巢狀反轉）                                                                                                                                                                                                                                                                               | **接受**：far boost 由 `container.scale` 移入 `setLodStage`，**只施於 `bodyGfx`（剪影）**，ring/warn 恆自然尺寸；§3.3 驗證巢狀（選取外環 26>光暈 24>選取內環 22>耐久環 20>剪影）無反轉；連帶改 MapCanvasHost.spec scale 斷言。                                                                                                                                                                                              | CD1 LOD、§3.1 setLodStage、§3.3、§5.1 applyLod、§5.7 |
| 4   | spec #4 (MAJOR)            | Slice D 硬耦 V6 內部、選取環 z-order 無 fallback                                                                                                                                                                                                                                                                                                                               | **接受**：z-order 以 plain `addChild` 三次插序在 `init` 內顯式決定 `[roadHighlight, selectionRing, pathPreview]`，**不依賴 roadHighlight 相對位置、不用 addChildAt/getChildIndex**（與 B1 同解）；§8.2 加 z-order index 斷言。                                                                                                                                                                                              | CD5、§5.1 init、§8.2                                 |
| 5   | spec #5 (MINOR)            | DoD item-3 論證前提錯（far 其實隱藏所有城名；Kiyosu/Gifu 間距非 ≥300）                                                                                                                                                                                                                                                                                                         | **接受**：CD6 更正——far `nearish===false` 故無任何城名；重疊風險落在 operational(mid)；清洲/岐阜 Δ≈(14,32)px（非 ≥300），列為 §9.3-2 operational 眼驗收硬項。                                                                                                                                                                                                                                                               | CD6、§6.3、§9.3-2、§12                               |
| 6   | spec #6 (MINOR)            | 聚落 innerR 18 < ringRadiusMain 20，屋頂侵入耐久環/城體                                                                                                                                                                                                                                                                                                                        | **接受**：`SETTLEMENT.innerR` 18→**22**（≥20）；§8.1 斷言屋頂中心 ∈[22,42]。                                                                                                                                                                                                                                                                                                                                                | CD4、§3.4、§8.1                                      |
| 7   | spec #7 (MINOR)            | threatened/警戒（金烽火）在任何 baseline 皆不現（fixture 唯一圍城為 assault）                                                                                                                                                                                                                                                                                                  | **接受**：CD8 新增掛川 encircle 圍城（`beginSiege` 預設 assault，故後設 mode='encircle'）→ 掛川 warning=threatened，金烽火於 operational/close 可見；docstring/spec 同步。（fallback：castleNode.spec 已單測 threatened 路徑。）                                                                                                                                                                                            | CD8-(c)、§5.9、§6.3、§8.1/§8.2                       |
| 8   | spec #8 (MINOR)            | AD2 使三元件脫離 `ScenePart<P>` 契約（update→boolean），churn                                                                                                                                                                                                                                                                                                                  | **接受（更佳解）**：**撤銷 AD2 之 boolean 回傳**——計數改由簽章 diff 成員數驅動（B3），`update` 維持 `void`、維持 `ScenePart<P>`；元件僅**加法擴充** `setLodStage`。三元件既有 void-return 斷言不需改。                                                                                                                                                                                                                      | AD2、CD1、§3.1/§3.2/§3.3                             |
| 9   | eng B1 (BLOCKER)           | `getChildIndex`+`addChildAt` 於 mock 不存在→ init 全 throw                                                                                                                                                                                                                                                                                                                     | **接受**：同 #4，plain `addChild` 三次插序，禁 addChildAt/getChildIndex。                                                                                                                                                                                                                                                                                                                                                   | CD5、§5.1 init、前置事實 pixi mock 點                |
| 10  | eng B2 (BLOCKER)           | buildNodeProps 回 `pos:{0,0}`→所有節點疊原點                                                                                                                                                                                                                                                                                                                                   | **接受**：buildNodeProps 取 `staticData.graph.nodes.get(id).pos` 真實世界座標。                                                                                                                                                                                                                                                                                                                                             | §5.1 buildNodeProps                                  |
| 11  | eng B3 (BLOCKER)           | 重用元件冪等使 re-setMapData `+3` 退為 `+0`；無 part 失效路徑                                                                                                                                                                                                                                                                                                                  | **接受**：計數＝簽章 diff 成員數（每 dirty id 無條件 +1，比照現行 owner-diff），與元件 `update` 冪等短路無關；`prevNodeSig=null` 於重建保證全 dirty；build 時仍 `part.update` 首繪以保實機首幀。                                                                                                                                                                                                                            | CD1、§5.1、§8.2 re-setMapData 案例                   |
| 12  | eng M1 (MAJOR)             | clear-spy owner-flip 測試對 Container spy `clear`（無此法）→ setup throw；「既有斷言不改值」不實                                                                                                                                                                                                                                                                               | **接受**：§5.6 明列改寫該測試為 spy 各節點 container.children[0]（body gfx）clear；列入 Slice D scope。                                                                                                                                                                                                                                                                                                                     | §5.6、§8.2、§12                                      |
| 13  | eng M2 (MAJOR)             | buildNodeProps tier 取自 staticData 而非 view，剪影可能與權威 view 不一致                                                                                                                                                                                                                                                                                                      | **接受**：buildNodeProps tier 以 `view.castles[].tier` 為權威（staticData.castleTier 僅供 LOD/hit-radius）。                                                                                                                                                                                                                                                                                                                | §5.1 buildNodeProps                                  |
| 14  | eng m1 (MINOR)             | dirty.spec 誤置於 `tests/ui/sceneParts/`（node project），路徑誤導                                                                                                                                                                                                                                                                                                             | **接受**：置於 `src/ui/map/dirty.spec.ts`（ui project，與 dirty.ts 同位）或既有 dirty 測試同位。                                                                                                                                                                                                                                                                                                                            | §3.5、Slice D 擁有                                   |
| 15  | eng m2 (MINOR)             | `MapViewModel` 必填 districts 破斷言完整 shape 之 test:core                                                                                                                                                                                                                                                                                                                    | **接受**：Slice A 補 `selectorsMapView.spec` 之 districts；確認並更新。                                                                                                                                                                                                                                                                                                                                                     | §3.6、Slice A、§12                                   |
| 16  | eng m3 (MINOR)             | validate:data 掃描註解；新檔/新註解須繁體                                                                                                                                                                                                                                                                                                                                      | **接受（實作提醒）**：§1.3 硬約束明列新檔為新掃描面須繁體。                                                                                                                                                                                                                                                                                                                                                                 | §1.3                                                 |
| 17  | eng m4 (MINOR)             | far「本城 only」使支城/郡於 overview 消失＝語意變更（非「既有語意保留」）                                                                                                                                                                                                                                                                                                      | **確認並保留（baseline-expected）**：無測試斷言 far 支城/郡可見；§10.1-(7) 明記為刻意 baseline-expected 語意變更（草稿 ×1.4 註誤稱「既有語意保留」已修正措辭）。                                                                                                                                                                                                                                                            | §10.1-(7)、CD1 LOD                                   |
| —   | 兩審查一致「正確、勿回歸」 | CD3 golden-safety hinge（builder 不搬、zCastle strip）、scenario dispatch（scenarioId/fixture id）、13 山城 id 皆存在、view model 既攜 terrainKind/warning/siegeMode/tier、`MAPVIEW.hitRadius` 存在、V6 契約準確、無 font:subset/gen:assets/golden:update、聚落決定論、脈衝/落城延後正確、AD1 optional districts golden 安全、AD3 郡幾何、CD2 向量非 atlas、dirty 契約保留推理 | **保留不回歸**                                                                                                                                                                                                                                                                                                                                                                                                              | 全文對應段落                                         |

**（結）** 兩審查之三個 BLOCKER（選取環可見／耐久三色可見／×1.4 巢狀）與三個 eng BLOCKER（addChildAt／pos{0,0}／計數退化）已全數折入；spec #1 之核心前提由 landed-V6 事實化解（拒絕重複擁有 visualMapBoot）；其餘 MAJOR/MINOR 逐條接受或以具體理由裁定。
