# M6-V8 技術設計文件（最終版）：軍隊棋子（旗型、方向、士氣、補給、狀態 badge、疊放與標籤避讓）

版本：Opus REVISER 交付（已納入 spec/visual 與 engineering 兩份對抗性審查，逐條處置見 §13）。
實作 agent 僅依本文件＋四份 brief（brief-specs／brief-architecture／brief-assets／design-m6v5-final）＋ V6 設計（design-m6v6-final.md，roads 已落地）施工。
語言：繁體中文（台灣慣用語）；程式契約為 TypeScript。所有路徑語意根為 `/Users/tigercosmos/nobunaga_ambition`。

> 前置事實（皆已對現行 working tree 驗證）：
>
> - **M6-V5 已 commit 於 main**（13 層 `LAYER_ORDER`、`LodStage='far'|'mid'|'near'`＋hysteresis、`MAP_PALETTE_HEX/NUM`、`FOREST_ALPHA`、territory Sprite）。**M6-V6（道路）、M6-V7（城池）尚未 commit**，但依指示 **V6 視為將先於本階段落地**（RoadsLayer 子容器、`interaction` CSS-px 命中下限、`labels` 之 `kind:'road'`、far LOD 保留主幹道）。V7（城池 nodeMarkers）與本階段**檔案零重疊**（軍隊在 `armies`(8) 層，恆在 `nodeMarkers`(7) 之上，旗桿天然壓過城），本設計**不依賴 V7 任何內部細節**。
> - 現行 `armies`(8) 由 `MapRenderer.redrawMilitaryObjects()`（`MapRenderer.ts:756`）per-id diff＋`layoutArmyStacks`＋`createArmyChip().update()`（冪等，`src/ui/map/sceneParts/armyChip.ts`）驅動。`ArmyChip` 契約：`createArmyChip()→{container, update(props):boolean}`，`update` 冪等（只 `pos` 變→僅 reposition 回 `false`；繪製欄位變→`drawArmyChip` 回 `true`）。**現行 chip 兵數為裸 `BitmapText`（`armyChip.ts:136-140`），無 washi100 底板——本階段補上（M2 修正，見 V8D14／§4.2）。**
> - `MapArmyView = MapArmyViewModel & { selected: boolean }`（`mapViewTypes.ts`）；核心 `MapArmyViewModel` 已帶 `status: ArmyStatus`、`morale`、`foodDays`、`mission`、`fromNode`/`toNode`/`edgeT`、`corps`（`selectors.ts`）。**View 契約已足夠，本階段無需改核心 selector**。
> - `ArmyStatus`（`enums.ts`）＝`'marching'|'engaged'|'sieging'|'subjugating'|'returning'|'routed'|'holding'`——**`routed` 確存於 enum**，旗面下垂 20° 為真實可實作項。
> - 字型基準 `BASELINE_CHARS = 數字 0-9 ＋全 Latin ＋標點`（`tools/font-charset.ts:26`）恆嵌入；兵數縮寫（`2.2k`／`+3`／`,`）只用 ASCII → 不觸發 `font:subset`。軍隊 badge 皆為 `Graphics` 向量字形（非 `BitmapText`），無新字。
> - **`tools/font-charset.ts` 之 `DEFAULT_DEBUG_FIXTURE_FILES` 確含 `src/core/debugVisual.ts`（line 32），並掃描其全部字串節點**——故 fixture 若新增任何含未涵蓋 CJK 字之武將名，`validate:data`（`check-font-coverage`）**必然報缺**。本設計因此**不新增武將**，改復用既有 `OFF_IMAGAWA_UJIZANE`（今川氏真，掛川城主，目前未領野戰軍；其名之字形全已被既有 fixture 名字覆蓋）領敗走軍 → **零新字、確定不觸發 `font:subset`**（MAJOR3／#6 修正，見 §6.2／§9.4）。
> - debug fixture 之守門為 `tests/visual/debugVisual.spec.ts`，係**決定論（`stateHash(a)===stateHash(b)`）＋結構（`>=`）斷言，非釘死 golden hash**；擴充 fixture 不破 golden、不需 `golden:update`（golden 只 hash s1560 replay）。
> - `?debug=visual-map` 開機（`src/app/visualMapBoot.ts`）**已選取**一支我方行軍部隊（丹羽長秀）→ 選取指示與方向箭頭在三段 baseline 皆可見。
> - `getStance(state, mover, owner): Stance`（`src/core/systems/pathfinding.ts:99`，`Stance='own'|'friendly'|'war'|'ceasefire'|'neutral'`）為已匯出純核心函式；`MainScreen.tsx` **已 import `getStance`（line 23）**，且組件本體已讀 `const currentGame = store.getState().game;`（line 129）→ relation 接線可復用此既有 binding（MINOR6 修正，見 §5.2）。

---

## 1. 目標與範圍（Goal / Scope）

### 1.1 使命

把「單色旗＋裸兵數字」的軍隊棋子升級為 **以旗幟為主體、資訊完整的行軍棋子**（art-bible §6.5、12 §3.3.1）：

- 沿用旗桿／燕尾旗／軍團腰帶／三點士氣，**新增**：行軍方向短箭頭、士氣次級通道（低士氣破裂外框／高士氣上揚旗結）、補給 badge（米袋缺口／空袋＋驚嘆三角）、狀態 badge（右上單一最高優先）、敗走旗面下垂 20°、**washi100 兵數底板（12 §3.3.1）**。
- **敵我／色弱次級通道**：敵＝朱紅＋旗尾尖角、友＝靛藍圓角雙環、中立＝灰空心菱形——**疊在勢力色之上**，色弱模擬下不只靠紅綠（DoD 硬項）。**交叉刀專屬 `engaged` 狀態 badge，不再併入敵對關係通道**（避免雙 X，#5 修正）。
- 三級 LOD：far 顯全軍＋敵我＋方向＋旗幅級距（兵力量感）；mid 加兵數縮寫＋補給／狀態 badge；near 加士氣點＋精確兵數＋疊放展開；**被選取軍隊與危急警告在任何 zoom 皆破例顯示且置頂**。
- **far 可讀性硬保證（M1 修正／V8D13）**：far（0.25 preset）以 renderer 端 container 反向放大＋敵對旗尾 far 變體，使敵我三通道之特徵尺寸於 0.25 皆 ≥ ~8 CSS px、色弱（deuteranopia）可辨——不再交由眼驗收兜底。
- 疊放：同節點確定性扇形偏移 14px、5+ 收合 `+N`；被選取軍隊永遠置頂；**標籤避讓不改世界座標**——同節點扇形成員之兵數底板以 **stackIndex 垂直錯位**（本地位移，世界座標不變）避免疊字（V8D14）。
- 全程 **保持 `ArmyChip` 冪等契約與 `MapRebuildCounts` 5 欄位不變**；`day` tick 零重繪；LOD 段變更之重繪為合法計數；**far container 放大為 transform（非重繪），不計入 `armyChips`**。

### 1.2 交付內容

1. `ArmyChip` 升級（`armyChip.ts`）：`ArmyChipProps` 擴充（`status`/`foodDays`/`relation`/`selected`/`heading`/`stage`/`labelStagger`），`drawArmyChip` 全新幾何（含 far 變體通道）、washi100 兵數底板、`armyChipDrawEqual` 同步擴充；`layoutArmyStacks` 加 `stackIndex` 欄位（additive）。
2. 敵我關係型別與推導（`ArmyRelation`＋`composeMapView.ts` 之 `stanceToRelation`／`relationOf`；`MapArmyView` 加**必填** `relation`）。
3. `MAPVIEW` 補給／兵力級距門檻＋far 放大常數；`ARMY_CHIP_GEOMETRY` 幾何常數（含 far 變體）。
4. `MapRenderer` 整合：方向 `heading` 計算、`stage` 入 props、`syncArmyChips` 抽出、**LOD 段變更以 `armyChipStage` 落差觸發 restage（BLOCKER1 修正）**、far container 反向放大、被選取置頂 z-order。
5. `MainScreen` 接線 `relationOf`（`getStance`，復用既有 `currentGame`）。
6. debug fixture 擴充（1 支 routed 軍［復用 今川氏真］＋1 支補給危急＋設 Oda↔Imagawa 敵對外交列［合併非覆蓋］），使三段 baseline 完整呈現 DoD。
7. 三段 visual baseline 更新（獨立 commit）。

### 1.3 硬約束（違反即 CI 紅燈）

- `src/core/` 維持純 TS（無 React/Pixi/DOM、無 `Math.random`/`Date.now`）。s1560 `GameState`／golden **byte-identical**，**禁 `golden:update`**；13 步 daily tick 零變更。fixture（`debugVisual.ts`）非 golden，可擴充但須維持決定論＋純度。
- 渲染常數進 `MAPVIEW`／具名常數，不進 `BAL`。顏色一律取 `TOKENS_NUM`／`MAP_PALETTE_NUM`；**不新增顏色 token**（沿用既有 `accentVermilion`/`accentVermilionBright`/`accentIndigo`/`accentGold`/`neutralClanless`/`washi100`/`ink900`/`ink100`/`accentMossBright`——皆已存於 `TOKENS_NUM`，已驗證）。
- 全繁體中文，無簡體字／日文新字體。**本階段不新增 user-visible `BitmapText` CJK 字串**（兵數縮寫 ASCII、badge 為 Graphics）；**fixture 復用既有武將 → 零新字**（見前置事實／§9.4）。
- **無新二進位／atlas 素材**（V8D2 純 Graphics）→ **不觸發 `gen:assets`／`validate:assets`／atlas 管線**。
- M6-V4 dirty DoD（`mapRendererDirty.spec.ts`）維持全綠：無變更 tick 不重建；`day` 變更不重繪任何軍隊；`MapRebuildCounts` **5 欄位不增刪**（`toEqual` 整物件）；`ArmyChip.update` 冪等（pos-only→`false`）。**far container 放大以 `container.scale.set` 施作（transform，比照現行主城 ×1.4，`MapRenderer.ts:717`），不經 `chip.update`，不計 `armyChips`。**
- `MapRenderer` 生命週期 StrictMode 安全、`destroy` 冪等、重掛無 texture/cache 洩漏（V5 territory/relief/forest 生命週期不得回歸）。
- **絕不修改 `plan/00-foundations.md`**。規格衝突依 00>02>15>系統>UI 裁定、實作、回寫 04/07 §8，不留 TBD。
- Playwright 三段 baseline（0.25/0.5/1.25）**預期改變**，baseline 更新為獨立 commit。
- fixture 動效在 `reducedMotion:'reduce'` 下必須凍結為決定論靜態姿態——本設計 **V8 軍隊棋子不含任何 per-frame 動效**（bob/sway 明確延後，見 V8D12），靜態姿態＝旗面直立、bob 0、sway 0，天然決定論。

---

## 2. 決策紀錄（V8D1–V8D14）

### V8D1 — 保留 `ArmyChip` 冪等契約，只擴充 props 與繪製

**決策**：`createArmyChip()→{container, update(props):boolean}` 簽章與冪等語意**完全保留**。`update` 仍：`last===null`→首繪回 `true`；只 `pos` 變→`container.position.set` 回 `false`；`armyChipDrawEqual` 判定的繪製欄位變→`drawArmyChip` 回 `true`。新增視覺**全部由 `ArmyChipProps` 新欄位驅動**並納入 `armyChipDrawEqual`（`pos` 除外）。
**理由**：所有新欄位（`status`/`foodDays`/`relation`/`selected`/`heading`/`stage`/`labelStagger`）在一段行軍／一個 tick 內**穩定**（`heading` 只在換邊時變、`stage` 只在跨 LOD 界時變、`labelStagger` 只在疊放組成變時變），故不造成 per-frame 重繪；`day` tick 這些欄位不變→`drawEqual` 為真→回 `false`→`armyChips` 零增量，守 M6-V4 DoD③。
**注意**：far container 反向放大（V8D13）**不是** chip 欄位、**不經** `update`——它是 renderer 端 `container.scale` transform，與 `pos` 同性質，不觸發重繪、不計數。

### V8D2 — 純 `Graphics`，不採 atlas sprite，不新增素材

**決策**：V8 chip 維持純 `Graphics`＋`BitmapText`（兵數）。既有 `map.marker.army-banner.normal`（48×64 atlas，V3）**不採用**；旗面／badge／關係／方向／兵數底板皆 `Graphics` 向量繪製。**不新增任何 atlas frame／texture**。
**理由**：跨 0.25–4.0 zoom 銳利；勢力色須填任意 40 色輪 `clanColorNum(colorIndex)`，atlas `tint` 會連描邊一起染，`Graphics.fill({color})` 精確；20 軍每軍一 `Graphics`＋一 `BitmapText`，只在繪製欄位變時重繪（冪等），移動只 reposition（transform，零重繪），Pixi v8 `Graphics` 為 batched geometry，遠低於瓶頸。
**結論**：gate 不含 `gen:assets`／`validate:assets`／atlas；首屏預算不變。

### V8D3 — 敵我關係為 UI 邊界推導

**決策**：新增 `type ArmyRelation = 'friendly' | 'neutral' | 'enemy'`（`mapViewTypes.ts`）。`MapArmyView` 擴為 `MapArmyViewModel & { selected: boolean; relation: ArmyRelation }`（**必填**，見 §3.1／MAJOR2 處置）。

- 推導於 UI 邊界 `composeMapViewState`，新增 optional 參數 `relationOf?: (clanId: string) => ArmyRelation`。
- **預設**（無 resolver）：`playerClanId===undefined → 'neutral'`；`clanId===playerClanId → 'friendly'`；否則 `'enemy'`。
- `MainScreen` 供給 resolver：`(clanId) => stanceToRelation(getStance(currentGame, playerClanId, clanId))`。`stanceToRelation`：`own|friendly → 'friendly'`；`ceasefire|neutral → 'neutral'`；`war → 'enemy'`。
- **core 不改**：`getStance` 已匯出、`selectMapViewModel` 不動（純度／golden 不動）。`relation` 為純 view-model 欄位。
  **理由**：`getStance` 為外交立場既定純函式，UI 復用避免語意漂移。fixture 以最小外交設定即得三通道（§6）。

### V8D4 — 行軍方向由 renderer 計算並入 props

**決策**：`ArmyChipProps` 新增 `heading: { x: number; y: number } | null`（單位向量；`null`＝靜止）。`MapRenderer` 以 `computeArmyHeading(army, graph)` 計算：

```
移動 iff  army.toNode !== null && army.toNode !== army.fromNode && army.edgeT > 0
heading = 移動 ? normalize(pos(toNode) - pos(fromNode)) : null
```

chip 在 `heading!==null` 時於旗座前方沿 `heading` 畫短箭頭（§4.2），靜止隱藏。
**理由**：方向來自 `fromNode`/`toNode`/`edgeT`（§4.6 D9 渲染內插參數），非規則；`heading` 於一段行軍為常數（同邊）→ props 穩定 → 不造成 per-frame 重繪。納入 `armyChipDrawEqual`（x/y 相等比較，含 null 對稱）。

### V8D5 — 補給門檻為 view 常數

**決策**：`MAPVIEW` 新增 `armySupplyLowDays = 7`（＝ `BAL.autoReturnFoodDays` 之顯示鏡射；不 import BAL，符合「render 常數進 MAPVIEW」）、`armySupplyCriticalDays = 3`。門檻對 `MapArmyView.foodDays`（view 值）：

- `foodDays >= 7`：正常，不顯示補給 badge。
- `3 <= foodDays < 7`：低——米袋缺口 badge（`accentGold`）。
- `foodDays < 3`：危急——空袋＋驚嘆三角 badge（`accentVermilionBright`）。
  **理由**：`foodDays` 為 view 值，門檻為純呈現邏輯；7 對齊既用之補給警告門檻。危急門檻 3 為設計裁定（回寫 07 §8）。

### V8D6 — 狀態 badge 單一最高優先

**決策**：右上單槽，至多一個最高優先狀態；其餘進 tooltip／選取面板（本階段只實作 badge）。優先序（高→低）：

```
routed(敗走) > engaged(接戰) > sieging(攻城) > subjugating(制壓) > 補給危急 > 補給低 > corps(大將/軍團)
```

- **敗走**主通道為旗面下垂 20°（V8D7），狀態 badge 對 routed 仍顯一枚朱紅**向下人字（撤退）**，強化 3 秒可讀。
- `engaged`：**交叉刀 X**（此為交叉刀之唯一用途，#5）；`sieging`：城鉤（ㄇ 形）；`subjugating`：小同心環；皆 `accentVermilionBright`。
- 補給危急/低：見 V8D5。`corps`：金色小三角旗結（僅在無其他狀態時顯）。
  **理由**：art-bible「最多同時顯示一個最高優先」；routed 最急。

### V8D7 — 敗走旗面下垂 20°

**決策**：`status==='routed'` 時旗面多邊形以旗桿頂 `(0,-poleHeight)` 為樞紐**順時針旋轉 `ARMY_CHIP_GEOMETRY.droopAngleDeg = 20`**（旗尾向下垂），以旋轉後點座標繪製（單一 `Graphics`）。fixture 補一支 routed 軍使 DoD 可見。
**理由**：直接對映 art-bible「敗走：旗面下垂 20°」；測試可斷言旗尾 y 大於直立時。

### V8D8 — 士氣次級通道

**決策**：既有三點士氣 pip（`moralePips`）保留不變。**新增**：

- **低士氣**（`morale < UI.moralePipLow`＝40）：旗面加**破裂外框**——沿旗面外框以 `ink900` 畫 2–3 段錯位斷線（內縮 `crackInset`），非閉合。
- **高士氣**（`morale >= UI.moralePipHigh`＝70）：旗桿頂加**上揚旗結**——一小段向上斜線（`ink900`, width 2, 長 `knotLen`）。
  士氣 pip／破裂框／旗結屬 near-only detail（`selected` 破例）。
  **理由**：art-bible「不只換顏色」；破裂框／旗結為形狀通道，色弱可辨。

### V8D9 — 三級 LOD 對映 chip detail

**決策**：`ArmyChipProps` 新增 `stage: LodStage`（來自 renderer `this.lodStage`）。detail 矩陣：

| 元素                         | far                                       | mid           | near          | 破例（selected 或補給危急，任何 zoom） |
| ---------------------------- | ----------------------------------------- | ------------- | ------------- | -------------------------------------- |
| 旗桿＋旗面（clan 色）        | 顯                                        | 顯            | 顯            | 顯                                     |
| 旗幅級距（3 級寬，兵力量感） | 顯                                        | 顯            | 顯            | —                                      |
| 敵我關係次級通道             | 顯（**far 變體＋container 放大**，V8D13） | 顯            | 顯            | 顯                                     |
| 方向箭頭（移動時）           | 顯（**far 變體**）                        | 顯            | 顯            | 顯                                     |
| 兵數 washi100 底板＋label    | **隱**                                    | 縮寫          | 精確          | selected：精確                         |
| 補給 badge（低/危急）        | **隱**（危急破例顯）                      | 顯            | 顯            | 危急：顯                               |
| 狀態 badge                   | **隱**（selected 破例顯）                 | 顯            | 顯            | selected：顯                           |
| 士氣 pip＋破裂框/旗結        | 隱                                        | 隱            | 顯            | selected：顯                           |
| 選取金色雙環                 | selected 時顯（far 變體）                 | selected 時顯 | selected 時顯 | 顯                                     |

**ETA（brief near row 所列「+ ETA」）刻意延後**：現行 `MapArmyViewModel` 只暴露 `edgeT`（[0,1] 渲染內插參數），不含「剩餘日數／剩餘 path 長」；忠實 ETA 需新增 view 欄位（剩餘日數）＝ selector／view-contract 變更，超出本階段「僅由既有欄位推導」之約束，且 ETA 不屬任何 DoD 驗收列。故 V8 不做 ETA，回寫 07 §8 記錄延後理由（#4 處置）。
**冪等**：`stage` 入 `armyChipDrawEqual`；LOD 段變更→全軍重繪（合法遞增 `armyChips`）；`day` tick `stage` 不變→零增量。restage 機制見 V8D11。

### V8D10 — 疊放與被選取置頂

**決策**：`layoutArmyStacks`（扇形 14px、group>=5 收合 `+N`、`index<=3` 顯示）之扇形／收合／可見性契約**不變**（世界座標不變）；**唯一 additive 變更**：輸出 `ArmyStackLayout<T>` 加 `stackIndex: number`（組內 0-based 序，供標籤垂直錯位，V8D14），既有測試（檢 `pos`/`visible`/`collapsedCount`）不受影響。

- **被選取置頂**：在 `syncArmyChips` 更新完各 chip 後，若某軍 `selected` 且 container 已掛載，`layers.armies.removeChild(part.container); layers.armies.addChild(part.container);`（re-append 至末＝繪製最上）。至多一軍 selected（單選），確定性。
- **8+ 交錯**：靠 far 全軍可見＋敵我／方向／選取次級通道（V8D13 保證可辨）；同節點 5+ 靠扇形＋`+N`。
  **理由**：最小侵入；置頂以 re-append。

### V8D11 — LOD 段變更觸發軍隊 restage：以獨立 `armyChipStage` 落差判定（**BLOCKER1 修正**）

**背景（已驗證的缺陷）**：`setCameraPose`（`MapRenderer.ts:846-854`）在呼 `applyLodAndCulling` **之前**已 `this.lodStage = lodStageForScale(clampedScale)`（line 852）。`applyLodAndCulling`（line 710）再以 `lodStageWithHysteresis(camera.scale, this.lodStage)` 計 `stage`，此時 `this.lodStage` 已等於目標段，`stage===this.lodStage`，故草稿之 `stageChanged = stage !== this.lodStage` **在 preset 路徑恆為 false → `syncArmyChips` 永不觸發**。e2e DoD（`e2e/visual.spec.ts` 之 `setMapCameraPreset` 迴圈）僅呼 `setCameraPose`＋waitIdle、無後續 `updateView`，故三段截圖中軍隊會**凍結在開機 far detail**，operational/close 兩張直接失敗。草稿自帶之 §8.3 dirty 測試亦會同因失敗——草稿內部矛盾。

**決策**：**解耦「軍隊繪製段」與 `setCameraPose` 會預改的 hysteresis `lodStage`**。新增私有欄位 `private armyChipStage: LodStage = 'far';`（初值與 `lodStage` 初值一致）。

- 抽出私有 `syncArmyChips(): void`，封裝現行 `redrawMilitaryObjects` 之**軍隊段**（`viewArmies`→`layoutSource`→`layoutArmyStacks`→per-id create/destroy diff→`chip.update(props 含 stage)`→`armyCull.upsert`→`interaction.setArmies`→被選取置頂）；**末行 `this.armyChipStage = this.lodStage;`**（以剛繪製之段登記）。sieges 段留在 `redrawMilitaryObjects`。
- `redrawMilitaryObjects()` = `this.syncArmyChips();` ＋ 既有 sieges diff ＋ 末呼 `this.applyLodAndCulling();`（維持現狀）。
- `applyLodAndCulling()` **開頭**（camera 取得後、**在 army 可見性查詢／迴圈之前**——同時修正 MINOR5 順序）：

```ts
const stage = lodStageWithHysteresis(camera.scale, this.lodStage);
this.lodStage = stage;
if (this.lodStage !== this.armyChipStage) this.syncArmyChips(); // V8D11：軍隊繪製段落後才 restage
// …隨後才 query 可見性 rect、armyCull.query、逐 part 設 visible、nodeMarkers/labels/roads/terrain…
```

（`syncArmyChips` **不呼叫** `applyLodAndCulling`，無遞迴。）

**三路徑正確性（皆已對現行程式碼推演）**：

1. **`setCameraPose(1.25)` preset**：line 852 `this.lodStage='near'`；`applyLodAndCulling` 內 `stage = hysteresis(1.25,'near')='near'`，`this.lodStage='near'`；`this.lodStage('near') !== armyChipStage('far')` → **`syncArmyChips` 觸發**（以 near 重繪，`armyChipStage='near'`）。✔ operational/close 截圖正確呈現 mid/near detail。
2. **滾輪縮放 → onTick → `applyLodAndCulling`**：`stage` 依 hysteresis 計；若跨界，`this.lodStage` 變、`!= armyChipStage` → restage；下次相機不動 → `stage` 同 → `this.lodStage == armyChipStage` → 不 restage。✔
3. **`updateView` → `redrawMilitaryObjects`**：先 `syncArmyChips`（以當前 `this.lodStage` 繪、`armyChipStage=this.lodStage`）→ 末呼 `applyLodAndCulling`：相機未動 → `stage==this.lodStage`、`this.lodStage==armyChipStage` → **不重入 `syncArmyChips`**（無雙繪）。`day`-only tick 同段 props 相等 → `drawEqual` 真 → 回 `false` → **`armyChips` 零增量**（守 M6-V4 DoD③）。✔

**計數**：restage 之 `chip.update` 因 `stage` 變→重繪→`armyChips` 遞增（合法）。**far container 反向放大（V8D13）為 transform，不經 `chip.update`，不遞增。**
**init 說明（#9）**：`init()` 期間 `this.lodStage` 與 `armyChipStage` 同為初值 `'far'`，`applyLodAndCulling` 不會因段落差重繪；首個 `updateView` 之 `syncArmyChips` 為正常首繪。**dirty 測試一律用相對增量（Δ）斷言，不釘死 post-init 絕對 `armyChips` 值**（§8.3）。

### V8D12 — 動效延後，靜態決定論

**決策**：V8 **不實作** 行軍 bob（2–3px）與旗面 sway（±3°）之 per-frame 動效；接戰不做 chip 震動（以 `engaged` 狀態 badge 交叉刀表達）。理由：per-frame chip 重繪破壞冪等與 `rebuildCounts`；baseline 為 `reducedMotion:'reduce'`，動效本須凍結。靜態姿態明定：旗面直立（routed 例外下垂 20°）、bob 0、sway 0。既有 `BattleSpark`（`effects` 層）維持現狀，本階段不新接軍隊。
**回寫 07 §8**：live bob/sway 列為未來（V9+）可選，須以 `reducedMotion` 凍結為上述靜態姿態、且改走獨立 onTick transform（不經 `chip.update`），不計 `rebuildCounts`。

### V8D13 — far-LOD 敵我／方向／選取通道可讀性硬保證（**M1 修正**）

**背景（已驗證）**：軍隊 chip 位於 camera-scaled `world` 容器，far preset scale=0.25 下所有世界幾何以 ¼ 呈現：草稿幾何（`enemyTailLen 6`／`neutralDiamond 7`／`relationRingOuter 12`）於 0.25 分別僅 ~1.5px／~3.5px／~6px，敵對尾角實質不可辨，違反「色弱模擬下仍能辨敵我」DoD（fixture far 幀含 10 軍）。

**決策（兩段，皆冪等／不破契約）**：

1. **renderer far container 反向放大（transform，不重繪）**：在 `applyLodAndCulling` 之 army 可見性迴圈內，對每 army part `part.container.scale.set(stage === 'far' ? MAPVIEW.armyFarChipScale : 1)`（**比照現行主城 far ×1.4，`MapRenderer.ts:717`**）。`MAPVIEW.armyFarChipScale = 2.4`。均勻放大保持三級旗幅相對量感（troop tier 不失真），僅整體變大。此為 `container.scale` transform，**不經 `chip.update`、不計 `armyChips`、每 tick 冪等賦值**。mid/near 恢復 1。
2. **敵對旗尾 far 變體（`stage` 驅動，冪等）**：`drawArmyChip` 於 `stage==='far'` 時，敵對旗尾改用 `enemyTailLenFar = 12`／`enemyTailWidthFar = 9`（mid/near 用 base 6/5）。友軍雙環（外環直徑 24 > 旗幅）與中立菱形（對角 14 ≈ 旗幅）在均勻放大下已足夠顯著，**不需** far 變體。方向箭頭於 far 用 `arrowLengthFar = 16`（base 12）、選取雙環於 far 用 `selectRingOuterFar = 20`（base 17）。

**0.25 preset 之有效 CSS-px（世界值 × 0.25 × container 2.4）**：旗幅 mid 18 → **10.8px**；敵尾尖角 12 → **7.2px**（＋旗身 → 敵方尖角輪廓 ~16px）；友軍外環直徑 24 → **14.4px**；中立菱形對角 14 → **8.4px**；選取外環直徑 40 → **24px**；方向箭頭 16 → **9.6px**。
**色弱目標（明示）**：三敵我輪廓（**友＝同心雙環／敵＝尖角旗身／中立＝空心菱形**）於 far baseline 各具 ≥ ~8 CSS px 特徵尺寸、形狀互異，於 deuteranopia 模擬下不靠色相亦可分。眼驗收（§9.3）以 deuteranope 濾鏡核 far 幀，非唯一依據——尺寸由上式數值保證。
**理由**：`stage` 已是 prop 且 restage 已於 LOD 變更觸發（V8D11），故 far 變體與 container 放大皆騎乘既有機制；container 放大為 transform，完全不影響冪等／計數。命中測試為獨立空間查詢（`interaction`＋`MAPVIEW.hitRadius.army`＋V6 CSS-px 下限），不受 container.scale 影響。
**替代（否決）**：把 `1/camera.scale` 連續因子傳入 chip → 縮放時每幀改 prop → 破冪等，被否。

### V8D14 — washi100 兵數底板 ＋ 標籤避讓（**M2＋#3 修正**）

**背景（已驗證）**：`12 §3.3.1`（plan/12 line 756）要求「兵數字｜旗竿下方 **washi100 圓角底板（radius-sm）**＋ BitmapText 12px ink900」；現行 `createArmyChip`（`armyChip.ts:136-140`）為**裸 `BitmapText`（無底板）**，深色 `ink900` 數字疊在深勢力色旗與領地染色上對比不足，違 DoD#4 對比基準。又任務列點名「**標籤避讓**」，草稿僅有同節點扇形、無疊字避讓。

**決策**：

1. **washi100 底板**：`createArmyChip` 於 `label`（`BitmapText`）之下、`graphics` 之上新增一枚 `plateGfx: Graphics`（container 子節點，序：graphics→plate→label）。`update` 中設完 `label.text` 後，依 `label` 量測寬高畫 `plateGfx`：圓角矩形（角半徑 `plateRadius = 2`＝radius-sm）、填 `TOKENS_NUM.washi100`、外框 `1px TOKENS_NUM.ink700`，內距 `platePadX`；`plateGfx.visible = label.visible`。底板與 label 同其可見規則（far 隱、mid/near 顯、`+N`／selected 破例）。此屬 `createArmyChip` 內部（隨 `update` 依 `soldiers`/`collapsedCount`/`stage` 重畫），不新增 `ArmyChipProps` 欄位；納入既有重繪判定（`soldiers`/`collapsedCount`/`stage` 已在 `armyChipDrawEqual`）。
2. **同節點標籤垂直錯位（不改世界座標）**：`ArmyChipProps` 新增 `labelStagger: number`（＝ `layoutArmyStacks` 之 `stackIndex`）。mid/near 顯示兵數時，`plateGfx`＋`label` 之**本地 y** 下移 `labelStagger * (plateHeight + platePadY)`（旗座世界位置不變），使同節點扇形成員（14px 世界扇形 → near 僅 17.5px CSS 間距，窄於 ~40px 底板）之兵數底板不疊字。`labelStagger` 於一 tick 內穩定（疊放組成不變）→ 冪等；納入 `armyChipDrawEqual`。
3. **跨節點**：本 fixture 之聚集節點（駿府城 2312,2897／駿府東郡／駿府西郡）彼此世界距 ≥ ~60 世界單位，於 near(1.25) ≥ 75 CSS px 間距、遠大於 ~40px 底板寬 → **不同節點兵數底板不全疊**；於 §9.3 眼驗收以 1280×720 near 幀確認並列入 DoD 證據（DoD#3「無 label 全重疊」由「扇形＋垂直錯位＋已驗證跨節點間距」共同達成）。
   **理由**：底板為 12 §3.3.1 明列硬項；垂直錯位為最小侵入之標籤避讓，滿足「不得改變世界座標」。

---

## 3. 精確型別與常數變更

### 3.1 `src/ui/map/mapViewTypes.ts`（Slice B）

```ts
/** 軍隊對「檢視方（playerClanId）」的外交關係之視覺通道（art-bible §3.3）。純 view 概念，
 *  由 UI 邊界 composeMapViewState 依 getStance 推導；'friendly'＝含己方與同盟，'enemy'＝交戰中，
 *  'neutral'＝停戰/中立/未知（含 playerClanId 未定之旁觀）。 */
export type ArmyRelation = 'friendly' | 'neutral' | 'enemy';

// 既有：export type MapArmyView = MapArmyViewModel & { selected: boolean };
// 改為（relation 必填）：
export type MapArmyView = MapArmyViewModel & { selected: boolean; relation: ArmyRelation };
```

**必填之連鎖修正（MAJOR2）**：改必填後，所有 `MapArmyView` 物件字面量須帶 `relation`。經清點，僅 **`src/ui/map/MapCanvasHost.spec.tsx` 之單一 5 軍字面量（line 420-431）** 缺 `relation`（其餘 `armies: []` 空陣列與 `composeMapView.spec` 之 `makeModel()` 產出的是 `MapViewModel` 源、非 `MapArmyView`，不受影響）。**此字面量之 `relation: 'neutral' as const` 補丁與型別變更同屬 Slice B commit**（見 §7 檔案擁有權：Slice B 擁有「型別安全字面量補丁」hunk，Slice E 擁有其後新增之行為斷言 describe——同檔不同區塊，B 先 E 後）。此使 commit 1 typecheck 全綠，消除草稿「MapCanvasHost.spec 無需改」之誤判與 slice 排序衝突。

### 3.2 `src/ui/map/mapViewConfig.ts`（Slice B）

`MAPVIEW` 內新增（置 `hitRadius` 之後）：

```ts
/** 補給 badge 門檻（對 MapArmyView.foodDays；顯示鏡射 BAL.autoReturnFoodDays=7，不 import BAL，V8D5）。 */
armySupplyLowDays: 7,       // foodDays 3..<7：低（米袋缺口）
armySupplyCriticalDays: 3,  // foodDays <3：危急（空袋＋驚嘆三角）
/** 兵力量感三級旗幅門檻（人數；V8D2）。 */
armySoldierTierMid: 1000,   // <1000：small；1000..<3000：mid
armySoldierTierLarge: 3000, // >=3000：large
/** far LOD 軍隊 chip container 反向放大（V8D13；transform，非重繪；比照主城 far ×1.4）。 */
armyFarChipScale: 2.4,
```

### 3.3 `src/ui/map/sceneParts/armyChip.ts`（Slice C）

`ARMY_CHIP_GEOMETRY` 擴充（保留既有 `poleHeight/flagWidth/flagHeight/swallowTail/hitPadding/moraleRadius`；`flagWidth` 續作 mid 級預設 18）：

```ts
export const ARMY_CHIP_GEOMETRY = {
  poleHeight: 30,
  flagWidth: 18,
  flagHeight: 26,
  swallowTail: 6,
  hitPadding: 6,
  moraleRadius: 2,
  // ── V8 新增 ──
  flagWidthSmall: 14,
  flagWidthMid: 18,
  flagWidthLarge: 22,
  droopAngleDeg: 20, // routed 旗面下垂（順時針繞旗桿頂）
  arrowLength: 12,
  arrowLengthFar: 16,
  arrowHeadSize: 5,
  arrowGap: 3, // 方向箭頭（far 變體）
  selectRingOuter: 17,
  selectRingOuterFar: 20,
  selectRingInner: 13, // 選取金色雙環（far 變體）
  relationRingOuter: 12,
  relationRingInner: 9, // 友軍靛藍雙環
  neutralDiamond: 7, // 中立灰空心菱形半對角
  enemyTailLen: 6,
  enemyTailWidth: 5, // 敵對旗尾尖角（base）
  enemyTailLenFar: 12,
  enemyTailWidthFar: 9, // 敵對旗尾尖角（far 變體，V8D13）
  badgeSize: 8,
  badgeGap: 2, // 狀態/補給 badge
  knotLen: 5,
  crackInset: 2, // 士氣旗結／破裂框
  platePadX: 3,
  platePadY: 2,
  plateRadius: 2,
  plateHeight: 15, // 兵數 washi100 底板（V8D14；radius-sm）
} as const;
```

新匯入：`import type { ArmyStatus } from '@core/state/enums';`、`import type { LodStage } from '../lod';`、`import type { ArmyRelation } from '../mapViewTypes';`、`import { MAPVIEW } from '../mapViewConfig';`。

`ArmyChipProps` 擴充：

```ts
export interface ArmyChipProps {
  pos: { x: number; y: number };
  colorIndex: number;
  soldiers: number;
  morale: number;
  corps: boolean;
  collapsedCount?: number;
  // ── V8 新增（皆入 armyChipDrawEqual，pos 除外）──
  status: ArmyStatus;
  foodDays: number;
  relation: ArmyRelation;
  selected: boolean;
  heading: { x: number; y: number } | null; // 單位向量；null＝靜止
  stage: LodStage;
  labelStagger: number; // = 同節點 stackIndex（V8D14 兵數底板垂直錯位）
}
```

`ArmyStackLayout<T>` 加 additive 欄位：

```ts
export interface ArmyStackLayout<T extends StackableArmy> {
  army: T;
  pos: { x: number; y: number };
  visible: boolean;
  collapsedCount?: number;
  stackIndex: number; // V8D14：組內 0-based 序（layoutArmyStacks 之 group.forEach index）
}
```

`layoutArmyStacks` 於既有 `group.forEach((army, index) => …)` 內把 `index` 一併塞入 `stackIndex`（既有測試檢 `pos`/`visible`/`collapsedCount`，新增欄位不破）。

### 3.4 `MapRebuildCounts`（`MapRenderer.ts`）

**不變**（`toEqual` 契約）。軍隊沿用既有 `armyChips` 計數；restage（LOD 段變更）之重繪合法遞增；**far container 放大為 transform 不遞增**。

### 3.5 `src/ui/map/composeMapView.ts`（Slice B）

新增 `stanceToRelation`／`defaultRelationOf`（§4.1）；`composeMapViewState` 簽章擴 optional 第 4 參數 `relationOf`。

---

## 4. 新／改函式規格（完整簽章＋行為）

> 本階段**無全新檔案**；新增為既有檔內之匯出函式與繪製子程序。

### 4.1 `src/ui/map/composeMapView.ts` 新增（Slice B）

```ts
import type { Stance } from '@core/systems/pathfinding';
import type { ArmyRelation } from './mapViewTypes';

/** Stance → 視覺三通道（V8D3）。 */
export function stanceToRelation(stance: Stance): ArmyRelation {
  if (stance === 'own' || stance === 'friendly') return 'friendly';
  if (stance === 'war') return 'enemy';
  return 'neutral'; // ceasefire | neutral
}

/** 預設關係解析（無外交資料時）：己方→friendly；有玩家但非己方→enemy；無玩家（旁觀）→neutral。 */
function defaultRelationOf(playerClanId: string | undefined): (clanId: string) => ArmyRelation {
  return (clanId) =>
    playerClanId === undefined ? 'neutral' : clanId === playerClanId ? 'friendly' : 'enemy';
}
```

`composeMapViewState` 改：

```ts
export function composeMapViewState(
  model: MapViewModel,
  selection: ComposeSelection | null,
  playerClanId?: string,
  relationOf?: (clanId: string) => ArmyRelation, // 預設 defaultRelationOf(playerClanId)
): MapViewState {
  const resolve = relationOf ?? defaultRelationOf(playerClanId);
  const armies: MapArmyView[] = model.armies.map((army) => ({
    ...army,
    selected: selection !== null && selection.kind === 'army' && selection.id === army.id,
    relation: resolve(army.clanId),
  }));
  /* …其餘不變… */
}
```

**行為**：純函式；`Stance` 已由 pathfinding 匯出（line 77）。

### 4.2 `src/ui/map/sceneParts/armyChip.ts` 繪製與比較器（Slice C）

**`armyChipDrawEqual`** 擴充（`pos` 仍除外）：

```ts
export function armyChipDrawEqual(a: ArmyChipProps, b: ArmyChipProps): boolean {
  return (
    a.colorIndex === b.colorIndex &&
    a.soldiers === b.soldiers &&
    a.morale === b.morale &&
    a.corps === b.corps &&
    a.collapsedCount === b.collapsedCount &&
    a.status === b.status &&
    a.foodDays === b.foodDays &&
    a.relation === b.relation &&
    a.selected === b.selected &&
    a.stage === b.stage &&
    a.labelStagger === b.labelStagger &&
    headingEqual(a.heading, b.heading)
  );
}
function headingEqual(a: ArmyChipProps['heading'], b: ArmyChipProps['heading']): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
}
```

**純輔助（匯出供測試）**：

```ts
export function flagWidthForSoldiers(soldiers: number): number {
  /* <mid→14；<large→18；else 22 */
}
export function abbreviateTroops(soldiers: number): string {
  const n = Math.max(0, Math.round(soldiers));
  if (n < 1000) return String(n);
  return `${(Math.round(n / 100) / 10).toLocaleString('en-US')}k`; // 2200→"2.2k"、900→"900"、12000→"12k"
}
export type SupplyLevel = 'ok' | 'low' | 'critical';
export function supplyLevel(foodDays: number): SupplyLevel {
  if (foodDays < MAPVIEW.armySupplyCriticalDays) return 'critical';
  if (foodDays < MAPVIEW.armySupplyLowDays) return 'low';
  return 'ok';
}
export type ChipBadge =
  'routed' | 'engaged' | 'sieging' | 'subjugating' | 'critical' | 'low' | 'corps' | 'none';
export function topBadge(status: ArmyStatus, foodDays: number, corps: boolean): ChipBadge {
  if (status === 'routed') return 'routed';
  if (status === 'engaged') return 'engaged';
  if (status === 'sieging') return 'sieging';
  if (status === 'subjugating') return 'subjugating';
  const s = supplyLevel(foodDays);
  if (s === 'critical') return 'critical';
  if (s === 'low') return 'low';
  if (corps) return 'corps';
  return 'none';
}
```

**`drawArmyChip(g, props)`** 重寫（單一 `Graphics`；本地座標，原點＝旗桿落地處 `(0,0)`；`const far = props.stage === 'far'`）：

1. `g.clear()`。
2. **旗桿**：`moveTo(0,0).lineTo(0,-poleHeight).stroke({width:2,color:ink900})`。
3. **旗面**：`fw = flagWidthForSoldiers(soldiers)`；燕尾旗五點（右緣 6px 燕尾）填 `clanColorNum(colorIndex)`、框 `1.5 ink900`。**routed**：五點先以樞紐 `(0,-poleHeight)` 旋 `+droopAngleDeg`。**corps**：加 3px `ink900` 腰帶（routed 同旋轉）。
4. **高士氣旗結**（`morale>=UI.moralePipHigh` 且 near）：自旗桿頂向斜上畫 `knotLen` 短線。
5. **低士氣破裂外框**（`morale<UI.moralePipLow` 且 near）：沿旗面外框畫 2–3 段錯位斷線（內縮 `crackInset`），非閉合。
6. **敵我關係次級通道**（所有 stage 皆顯）：
   - `friendly`：繞旗面中心畫**靛藍雙環**（`circle(relationRingOuter).stroke({width:1.5,accentIndigo})`＋`circle(relationRingInner).stroke({width:1,accentIndigo})`）。
   - `enemy`：旗尾**尖角**——自燕尾右緣中點沿 +x 畫尖三角 `poly`（長 `far ? enemyTailLenFar : enemyTailLen`、半高 `far ? enemyTailWidthFar : enemyTailWidth`）填 `accentVermilion`。**（不再畫交叉刀——交叉刀專屬 engaged badge，#5。）**
   - `neutral`：旗面右上畫**灰空心菱形** `poly` 四點（半對角 `neutralDiamond`）`stroke({width:1.5,neutralClanless})`。
     （關係環/菱形中心＝旗面幾何中心；routed 時同旋轉。）
7. **方向箭頭**（`heading!==null`，所有 stage）：自旗座前方 `(heading.x*arrowGap, heading.y*arrowGap)` 沿 `heading` 畫桿長 `far ? arrowLengthFar : arrowLength` 短線＋端點三角（`arrowHeadSize`），`ink900`。
8. **狀態 badge**（右上單槽；far 隱、mid/near 顯；`selected` 或 `critical` 破例任何 stage）：依 `topBadge(...)` 於 `(fw+badgeGap, -poleHeight-badgeGap)` 畫向量字形（`badgeSize` 內）：`routed`→向下人字；`engaged`→交叉刀 X；`sieging`→城鉤 ㄇ；`subjugating`→小同心環；`critical`→空袋＋驚嘆三角；`low`→米袋缺口（`accentGold`）；`corps`→小三角旗結（`accentGold`）；其餘 `accentVermilionBright`；`none`→不畫。
9. **選取金色雙環**（`selected`，所有 stage）：繞旗面中心 `circle(far ? selectRingOuterFar : selectRingOuter).stroke({width:2,accentGold})`＋`circle(selectRingInner).stroke({width:1,accentGold})`。
10. **士氣 pip**（near 或 `selected`）：既有三點（`moralePips`），位置不變。

（**兵數 washi100 底板＋label** 不在 `drawArmyChip`，由 `createArmyChip` 之 `plateGfx`＋`label` 承載，見 §4.3。）

### 4.3 `createArmyChip().update` 調整（維持冪等結構；V8D14 底板）

```ts
const container = new Container();
const graphics = new Graphics();
const plateGfx = new Graphics();   // V8D14：兵數 washi100 底板
const label = new BitmapText({ text: '', style:{ fontFamily:'Noto Serif TC', fontSize:12, fill: TOKENS_NUM.ink900 }});
container.addChild(graphics); container.addChild(plateGfx); container.addChild(label); // 序：旗→底板→字
// hitArea：改用 flagWidthLarge（最大旗幅），與旗幅級距無關、穩定：
container.hitArea = new Rectangle(-hitPadding, -poleHeight - hitPadding,
  ARMY_CHIP_GEOMETRY.flagWidthLarge + hitPadding*2, poleHeight + hitPadding*2);
// …
update(props): boolean {
  if (last === null || !samePos(last.pos, props.pos)) container.position.set(props.pos.x, props.pos.y);
  if (last !== null && armyChipDrawEqual(last, props)) { last = props; return false; }
  drawArmyChip(graphics, props);
  // 兵數 label：far 隱藏；collapsedCount 優先（+N，任何 stage）；mid 縮寫；near 精確。
  const showLabel = props.stage !== 'far' || props.selected || (props.collapsedCount ?? 0) > 0;
  label.visible = showLabel; plateGfx.visible = showLabel;
  if (props.collapsedCount && props.collapsedCount > 0) label.text = `+${props.collapsedCount}`;
  else if (props.stage === 'mid') label.text = abbreviateTroops(props.soldiers);
  else label.text = formatArmyTroops(props.soldiers);
  if (showLabel) {
    const baseY = 1 + props.labelStagger * (ARMY_CHIP_GEOMETRY.plateHeight + ARMY_CHIP_GEOMETRY.platePadY);
    // 底板依 label 量測尺寸畫圓角矩形（washi100 + ink700 1px），label 疊其上、內距 platePadX：
    plateGfx.clear();
    plateGfx.roundRect(0, baseY, label.width + ARMY_CHIP_GEOMETRY.platePadX*2,
      ARMY_CHIP_GEOMETRY.plateHeight, ARMY_CHIP_GEOMETRY.plateRadius)
      .fill({ color: TOKENS_NUM.washi100 }).stroke({ width: 1, color: TOKENS_NUM.ink700 });
    label.position.set(ARMY_CHIP_GEOMETRY.platePadX, baseY + 1);
  }
  last = props;
  return true;
}
```

（實作 agent：`BitmapText.width` 於 `text` 設定後可讀；若 mock 未提供則以字元數估寬——見 §8.5 mock 補口。）

---

## 5. 既有檔案修改清單

### 5.1 `src/ui/map/MapRenderer.ts`（Slice E）— 整合器（唯一擁有者）

**新私有欄位**：`private armyChipStage: LodStage = 'far';`（V8D11）。
**新私有方法 `computeArmyHeading`**（純）：

```ts
private computeArmyHeading(a: MapArmyView, graph: MapGraph | undefined): { x: number; y: number } | null {
  if (graph === undefined || a.toNode === null || a.toNode === a.fromNode || a.edgeT <= 0) return null;
  const from = graph.nodes.get(a.fromNode as never)?.pos;
  const to = graph.nodes.get(a.toNode as never)?.pos;
  if (from === undefined || to === undefined) return null;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? null : { x: dx / len, y: dy / len };
}
```

**抽出 `syncArmyChips()`**：把現行 `redrawMilitaryObjects`（`MapRenderer.ts:756`）之**軍隊段**（`viewArmies`→`layoutSource`→`layoutArmyStacks`→per-id create/destroy diff→`chip.update`→`armyCull.upsert`→`interaction.setArmies`）移入本方法：

- `chip.update` props 補：`status: army.status`、`foodDays: army.foodDays`、`relation: army.relation`、`selected: army.selected`、`heading: this.computeArmyHeading(army, graph)`、`stage: this.lodStage`、`labelStagger: entry.stackIndex`。
- `if (redrew) this.rebuildCounts.armyChips += 1;` 維持。
- **被選取置頂**：迴圈後，找 `layout` 中 `army.selected && entry.visible` 者，`this.layers.armies.removeChild(part.container); this.layers.armies.addChild(part.container);`。
- **末行**：`this.armyChipStage = this.lodStage;`（V8D11 登記已繪段）。
  **`redrawMilitaryObjects()`** 改為：`this.syncArmyChips();` ＋ 既有 sieges diff ＋ 末呼 `this.applyLodAndCulling();`。
  **`applyLodAndCulling()`（`MapRenderer.ts:691`）改**：把 stage 計算與 restage 移至**開頭**（camera 取得後、`visibleArmies = this.armyCull.query(rect)` 與 army 可見性迴圈**之前**——修正 MINOR5 順序，使 restage 之 `armyCull.upsert`／`collapsedArmyIds` 先於可見性查詢）：

```ts
private applyLodAndCulling(): void {
  if (this.app === null || this.layers === null || this.camera === null) return;
  const camera = this.camera.getState();
  // V8D11：先算段；軍隊繪製段落後才 restage（不遞迴——syncArmyChips 不呼 applyLodAndCulling）。
  const stage = lodStageWithHysteresis(camera.scale, this.lodStage);
  this.lodStage = stage;
  if (this.lodStage !== this.armyChipStage) this.syncArmyChips();
  // 以下為既有 rect/query/可見性迴圈；query 在 restage 後有效，因純段變更不改軍隊世界位置/cull entry。
  const halfWidth = this.app.screen.width / (2 * camera.scale); /* … rect … */
  const visibleArmies = this.armyCull.query(rect);
  /* … */
  const nearish = stage !== 'far'; const detail = stage === 'near';
  for (const [id, part] of this.armyParts) {
    part.container.visible = visibleArmies.has(id) && !this.collapsedArmyIds.has(id);
    // V8D13：far 反向放大（transform，不重繪、不計數；比照主城 ×1.4）。
    part.container.scale.set(stage === 'far' ? MAPVIEW.armyFarChipScale : 1);
  }
  /* … sieges 可見性、nodeMarkers/labels/roads/terrain/territory 皆維持現狀 … */
}
```

（加程式碼註解：「`armyCull.query` 於 restage 後仍有效，因純 stage 變更不改軍隊世界位置與 cull entry；未來若在 `syncArmyChips` 內重定位軍隊，須把可見性查詢移至其後」——防未來回歸，MINOR5。）
**dirty 保證**：`updateView`（`:1039`）仍呼 `redrawMilitaryObjects`；`day`-only tick→相機不動→`applyLodAndCulling` stage 不變、`this.lodStage==armyChipStage`→不 restage＋`syncArmyChips` props 同→零增量。
**`setCameraPose`／`destroy`**：無變更（`setCameraPose` 之 line 852 `this.lodStage = lodStageForScale(...)` 保留；restage 現由 `armyChipStage` 落差在 `applyLodAndCulling` 內正確觸發）。

### 5.2 `src/ui/screens/MainScreen.tsx`（Slice E）

現行（line 129/133-135）：`const currentGame = store.getState().game;`（組件本體已存在）；`viewState = useMemo(() => composeMapViewState(gameView, selection, playerClanId), [gameView, selection, playerClanId])`。改為（復用既有 `currentGame`、`getStance` 已 import，MINOR6 消除 memo 內 `store.getState` 之 stale-closure）：

```ts
const viewState = useMemo(() => {
  const relationOf =
    currentGame === null
      ? undefined
      : (clanId: string) =>
          stanceToRelation(getStance(currentGame, playerClanId as never, clanId as never));
  return composeMapViewState(gameView, selection, playerClanId, relationOf);
}, [gameView, selection, playerClanId, currentGame]);
```

新增 `import { composeMapViewState, stanceToRelation } from '../map/composeMapView';`（`composeMapViewState` 已 import，補 `stanceToRelation`）。deps 顯式加 `currentGame`（與 `gameView` 每 tick 同步變，無多餘 re-render；耦合顯式化）。`playerClanId` undefined 時 resolver 走 composeMapView 預設。

### 5.3 `src/core/debugVisual.ts`（Slice A）— fixture 擴充

見 §6。摘要：**復用既有 `OFF_IMAGAWA_UJIZANE`（今川氏真）** 部署 1 支 Imagawa `routed` 軍（近駿府，低士氣）；調 `hideyoshiArmy` `foodDays 5→2`（危急）、`toshiieArmy` `foodDays 15→5`（低）；**合併（非覆蓋）** Oda↔Imagawa 外交列設 `lastHostileDay`。全程決定論、`validateState` 通過。**零新武將、零新字。**

### 5.4 測試檔（各 Slice 擁有）

`tests/ui/sceneParts/armyChip.spec.ts`（C，擴充）、`tests/ui/composeMapView.spec.ts`（B，擴充＋`delete rest.relation`）、`src/ui/map/mapRendererDirty.spec.ts`（E，擴充）、`tests/visual/debugVisual.spec.ts`（A，擴充）、`src/ui/map/MapCanvasHost.spec.tsx`（**Slice B 補 5 軍字面量 `relation`；Slice E 補行為斷言**——同檔不同區塊，B 先 E 後）。`tests/helpers/pixiMock.ts`：僅補 `BitmapText.width`／`roundRect` 缺口（見 §8.5）。

---

## 6. 內容／資料規格（fixture，Slice A）

> 目標：三段 baseline 完整呈現 V8 DoD——敵我三通道、方向箭頭、選取、8+ 交錯、敗走下垂、補給低/危急、狀態 badge。座標為世界單位，落於東海走廊既有陸地（駿府 2312,2897 為錨點）。

### 6.1 外交敵對列（使 relation 三通道確定；合併非覆蓋，#8）

`buildVisualMapState` 於 `validateState` 之前設定——**只在既有列上補 `lastHostileDay`，不重置整列**（避免蓋掉 `beginSiege` 於 katsuie→駿府 可能寫入之敵對／圍城簿記）：

```ts
import { pairKey, defaultDiplomacyRow } from './state/serialize';
const odaImagawaKey = pairKey(CLAN_ODA, CLAN_IMAGAWA);
const existing = state.diplomacy.rows[odaImagawaKey] ?? defaultDiplomacyRow(CLAN_ODA, CLAN_IMAGAWA);
state.diplomacy.rows[odaImagawaKey] = { ...existing, lastHostileDay: state.time.day };
// Oda↔Saito 維持預設稀疏列（無協定、從未交戰）→ getStance='neutral' → neutral（灰菱形）。
```

效果：Oda 軍＝friendly（靛藍雙環）、Imagawa 軍＝enemy（朱紅尖角）、Saito 軍＝neutral（灰菱形）→ 三通道齊備、色弱可辨。`debugVisual.spec` 斷言 `getStance(state,ODA,IMAGAWA)==='war'`、`getStance(state,ODA,SAITO)==='neutral'`。

### 6.2 敗走軍（復用既有武將，零新字；MAJOR3／#6）

**不新增武將**。復用 `OFF_IMAGAWA_UJIZANE`（今川氏真，掛川城主，目前未領野戰軍；其名 4 字全已被既有 fixture 名字覆蓋 → `check-font-coverage` 不報缺）。已驗證：INV-04 僅要求城主 `serving`＋同勢力＋rank≥samurai-taisho＋不同時任多城城主，**不禁城主兼領野戰軍**；INV-06 檢軍 leader `serving`＋同勢力＋不同時在兩部隊——UJIZANE 目前未在任何軍，故合法。掛川保留 `lordId=UJIZANE` 不動。

```ts
const ujizaneArmy = deployArmy(state, {
  clanId: CLAN_IMAGAWA,
  originCastleId: CASTLE_KAKEGAWA,
  leaderId: OFF_IMAGAWA_UJIZANE,
  soldiers: 500,
  foodDays: 12,
  targetNodeId: CASTLE_SUNPU,
});
collapseToHolding(state, ujizaneArmy, DIST_SUNPU_E); // 抵駿府東郡
{
  const a = state.armies[ujizaneArmy]!;
  a.status = 'routed';
  a.morale = 22;
} // 敗走＋低士氣（droop＋破裂框）
```

（`routed` 軍 `siegeId=null`/`battleId=null` 由 `applyMarch` 建立即滿足；`morale=22` 語意一致。`validateState` 守門；若某 INV 要求 routed 特定欄位，依 07 §3.4 補齊。）

> **契約備援（不作為預設路徑）**：本 fixture 確定零新字，故 `font:subset` 不觸發。**若未來任何 fixture 變更引入含未涵蓋字之新名，`npm run font:subset` 為強制（非「若」）獨立 commit**（因 `font-charset.ts` 確掃 `debugVisual.ts`）。

### 6.3 補給示例

`hideyoshiArmy`（600 兵）`foodDays 5→2`（→ view = ceil(600·0.02·2)/ceil(12) = 24/12 = **2**，危急，空袋＋驚嘆三角）；`toshiieArmy`（700 兵）`foodDays 15→5`（→ 70/14 = **5**，低，米袋缺口）。低/危急兩 badge 皆現。
（view 公式：`foodDays_view = food / max(1, ceil(soldiers·fieldFoodPerSoldierDaily))`；`fieldFoodPerSoldierDaily=0.02`。）

### 6.4 8+ 交錯與方向

- **交錯**：擴充後共 10 軍（原 9＋ujizane）。overview(0.25) 全圖 10 軍同框（≥8，三勢力色＋關係通道，V8D13 尺寸保證可辨）；operational/close 錨定駿府，駿府叢集含 katsuie（sieging AT 駿府）、sessai（駿府西郡 holding）、motoyasu（marching→駿府東郡）、ujizane（駿府東郡 routed）→ ≥4 交錯於錨點、含敵我/方向/敗走/選取多樣。
- **方向**：`nagahideArmy`（我方 marching，被 boot 選取）＋`motoyasuArmy`＋`yoshitatsuArmy` marching→有方向箭頭；ujizane 為 routed holding（無方向）。選取軍（nagahide）三段皆在畫面內 → 選取金色雙環＋方向箭頭同框。
- **標籤避讓（V8D14）**：駿府叢集之跨節點（駿府城／駿府東郡／駿府西郡）世界距 ≥ ~60wu → near(1.25) ≥75px 間距 > ~40px 底板寬 → 不全疊；同節點若後續堆疊，兵數底板以 `stackIndex` 垂直錯位。§9.3 眼驗收於 1280×720 near 幀確認無全重疊。

### 6.5 決定論與 golden

所有新增皆經 `deployArmy`（真實 `applyMarch`）＋顯式欄位覆寫，無 `Math.random`/`Date.now`；`stateHash` 對相同呼叫序穩定。fixture 非 s1560、非 golden，`debugVisual.spec` 為 `>=`／決定論斷言 → 擴充不破。s1560 golden **零觸**。

---

## 7. 切片分解與整合序（檔案擁有權嚴格互斥；整合序 B →（A ∥ C）→ E）

### Slice B — 型別／config／關係推導（最先，最小；型別安全 atomic）

**擁有**：`src/ui/map/mapViewTypes.ts`（`ArmyRelation`＋`MapArmyView.relation` 必填）、`src/ui/map/mapViewConfig.ts`（門檻＋`armyFarChipScale`）、`src/ui/map/composeMapView.ts`（`stanceToRelation`＋`relationOf`）、`tests/ui/composeMapView.spec.ts`（擴充＋passthrough test 加 `delete rest.relation`）、**`src/ui/map/MapCanvasHost.spec.tsx` 之 5 軍字面量 `relation:'neutral' as const` 補丁 hunk（型別安全，隨必填變更 atomic）**。
**契約產出**：`ArmyRelation`；`MapArmyView.relation`；`MAPVIEW.armySupplyLowDays/armySupplyCriticalDays/armySoldierTierMid/armySoldierTierLarge/armyFarChipScale`；`composeMapViewState(…, relationOf?)`；`stanceToRelation`。
**依賴**：核心 `getStance`/`Stance`（已存在）。**驗收**：`npm run typecheck` 全綠（含 MapCanvasHost.spec 因補丁而通過）；`composeMapView.spec` 驗 relation（預設＋resolver＋`stanceToRelation` 全 5 值）＋passthrough `delete rest.relation` 後 `toEqual` 綠。

### Slice A — fixture 擴充（獨立，可與 B/C 並行）

**擁有**：`src/core/debugVisual.ts`、`tests/visual/debugVisual.spec.ts`。
**契約產出**：10 軍（含 1 routed，復用 UJIZANE）、Oda↔Imagawa 敵對列（合併）、低/危急補給各一。
**依賴**：無。**驗收**：`npm run test:core`（決定論＋結構；新增 `some(status==='routed')`、`some(foodDays<3)`、`getStance` 三勢力斷言、`validateState===[]`）；`npm run validate:data`（**零新字 → check-font-coverage 綠、簡體 0 筆**）；s1560 golden 未變。

### Slice C — ArmyChip 升級

**擁有**：`src/ui/map/sceneParts/armyChip.ts`、`tests/ui/sceneParts/armyChip.spec.ts`（擴充）。
**依賴契約**：Slice B（`ArmyRelation`、`MAPVIEW` 門檻）；核心 `ArmyStatus`；`LodStage`。
**契約產出**：`ArmyChipProps`（新欄位）；`armyChipDrawEqual`（擴充）；`flagWidthForSoldiers`/`abbreviateTroops`/`supplyLevel`/`topBadge`（匯出）；`drawArmyChip`（新幾何＋far 變體）；washi100 底板；`ARMY_CHIP_GEOMETRY`（新常數）；`ArmyStackLayout.stackIndex`。`moralePips`/`formatArmyTroops` 不變。
**驗收**：`armyChip.spec` 全綠（§8.1）；`npm run test:ui`。

### Slice E — 整合器（最後）

**擁有**：`src/ui/map/MapRenderer.ts`（`armyChipStage`/`computeArmyHeading`/`syncArmyChips`/restage/far 放大/置頂/props）、`src/ui/screens/MainScreen.tsx`（`relationOf` 接線）、`src/ui/map/mapRendererDirty.spec.ts`（擴充）、`src/ui/map/MapCanvasHost.spec.tsx` **之行為斷言區塊（不含 B 已補之字面量）**、`tests/helpers/pixiMock.ts`（僅補 `BitmapText.width`／`roundRect` 缺口）。
**依賴契約**：A、B、C。
**驗收**：`npm test` 全綠（dirty spec：`heading`/`stage`/`labelStagger` 入 props、**restage Δ 遞增**、day-only Δ 零、置頂 z-order、`MapRebuildCounts` `toEqual` 5 欄位、far 放大不計數；正向存在：三軍 relation/方向）；`npm run build`；`npm run e2e`（舊 baseline 失敗＝預期）。

### 整合序

`B` → `A`（可與 B/C 並行）→ `C`（凍結 B 契約後）→ `E`。整合唯一檔 `MapRenderer.ts`／`MainScreen.tsx` 歸 E；`MapCanvasHost.spec.tsx` 型別補丁歸 B（先）、行為斷言歸 E（後）。

---

## 8. 測試計畫

### 8.1 chip 單測（真 pixi + `vi.spyOn`；Slice C）

`props()` helper 補新必填預設：`status:'holding'`, `foodDays:20`, `relation:'friendly'`, `selected:false`, `heading:null`, `stage:'near'`, `labelStagger:0`。

- **`armyChipDrawEqual`**：新欄位各異（含 `labelStagger`/`stage`/`heading`）→ `false`；僅 `pos` 異→`true`；`heading` null 對稱與 x/y 相等。
- **冪等**：`heading` 常數（同邊）＋其餘同→回 `false`（`clear` 不增）；`stage` 變→回 `true`。
- **`flagWidthForSoldiers`**：999→14、1000→18、2999→18、3000→22。
- **`abbreviateTroops`**：900→"900"、2200→"2.2k"、12000→"12k"、0→"0"。
- **`supplyLevel`／`topBadge`**：門檻邊界；優先序（routed 蓋補給；sieging 蓋 low；critical 蓋 low；corps 僅無其他時）。
- **`drawArmyChip` 幾何**（spy `poly`/`circle`/`roundRect`/`moveTo`/`stroke`/`fill`）：
  - friendly→兩 `circle` stroke（indigo）；enemy→旗尾 `poly`（vermilion）**且無交叉刀**（#5：`engaged` badge 才有交叉刀）；neutral→菱形 `poly`（灰）。
  - **far 變體**：`stage:'far'` 敵尾 `poly` 座標較 base 長（斷言尖端 x > base 版）；選取外環半徑 far > base；方向箭頭 far 桿長 > base。
  - `heading!==null`→箭頭；null→無。
  - `routed`→旗面點旋轉（旗尾點 y > 直立版）。
  - 低士氣→破裂斷線；高士氣→旗結；僅 near。
  - badge：`topBadge` 對映；far 且非 selected/critical→無 badge；`critical`/`selected` 於 far 仍畫。
  - `selected`→金色雙環。
- **washi100 底板（V8D14）**：label 可見時 `plateGfx` 有 `roundRect`＋washi100 fill＋ink700 stroke；far 且非 selected/collapsed→`plateGfx.visible===false`；`labelStagger=n`→底板/label 本地 y 下移 `n·(plateHeight+platePadY)`（斷言 y 隨 stagger 遞增）。
- **label**：far 非 selected/非 collapsed→`visible===false`；mid→`abbreviateTroops`；near→`formatArmyTroops`；`collapsedCount>0`→`+N`（任何 stage）。
- **hitArea**：以 `flagWidthLarge` 計，兵力變動不改尺寸。
- **`layoutArmyStacks`**：既有測試不改（扇形 14／`+N`／`index<=3`）；新增 `stackIndex` 等於組內序。

### 8.2 `composeMapView.spec.ts`（Slice B）

- `relation` 預設：己方→friendly、他方→enemy、undefined→neutral。
- resolver 版：自訂 `relationOf`→採用其值。
- `stanceToRelation`：5 個 `Stance` 全對映。
- **passthrough test 修正**：`armies[] 除 selected 外直通` 之測試改為 `delete rest.selected; delete rest.relation; expect(rest).toEqual(model.armies[i]);`（#7）。
- `selected` 既有語意不破。

### 8.3 `mapRendererDirty.spec.ts`（Slice E）— dirty＋正向存在

新 `describe('軍隊 V8')`：

- **props 補齊**：`updateView` 後 marching 軍 chip 收 `heading!==null`；holding 軍 `null`；`labelStagger` 對疊放組正確。
- **LOD restage Δ 遞增（BLOCKER1 回歸守門）**：`setCameraPose(overview 0.25)`→記 `armyChips`（Δ 基準）；`setCameraPose(close 1.25)`（far→near，`armyChipStage` 落差）→`applyLodAndCulling` 觸發 `syncArmyChips`→`armyChips` **Δ>0**。（此測試以本設計 `armyChipStage` 機制通過；草稿之 `stageChanged` 版會失敗。）
- **day-only Δ 零**：固定相機（同 stage），連跑 30 日 `updateView`（只 `day` 變）→`armyChips` **Δ==0**。
- **far 放大不計數**：`setCameraPose(0.25)` 後再 `updateView`（同 stage）→`armyChips` Δ==0（放大為 transform）；且 `armyParts` 某 container `scale.x===MAPVIEW.armyFarChipScale`，`setCameraPose(1.25)` 後該 scale 回 1。
- **`MapRebuildCounts` 不變**：`getRebuildCounts()` `toEqual` 5 欄位（`roads/labels/nodeMarkers/territory/armyChips`）。
- **被選取置頂**：某軍 `selected`→該 chip container 為 `layers.armies.children` 末元素；換選取→新者置頂。
- **正向存在（堵靜默）**：帶 enemy＋friendly＋neutral 三軍 view→三 chip 皆建立、關係通道有畫（friendly 有 indigo circle stroke）。
- **絕對值免釘（#9）**：全部以 Δ 斷言，不釘 post-init 絕對 `armyChips`。

### 8.4 `debugVisual.spec.ts`（Slice A）

既有 `>=` 不改值。新增：`armies.length>=10`；`some(status==='routed')`；`some(foodDays<3 語意等值)`；`getStance(ODA,IMAGAWA)==='war'`、`getStance(ODA,SAITO)==='neutral'`；決定論 `stateHash(a)===stateHash(b)`；`validateState(state)===[]`。

### 8.5 jsdom 可測／不可測 ＋ mock 補口

- **可測**：`drawArmyChip` 指令、`armyChipDrawEqual`、label/底板可見性與位移、hitArea、relation/badge/箭頭/droop/far 變體幾何、dirty Δ、restage Δ、far 放大 scale、z-order、`heading` 計算、relation 推導。
- **不可測（→ e2e baseline 人眼核）**：像素合成、色弱觀感、3 秒可讀性、8+ 交錯視覺分辨。
- **mock 補口（Slice E）**：`tests/helpers/pixiMock.ts` 若 `BitmapText` 無 `width` getter → 補（以字元數 × 估寬回傳穩定值，供底板尺寸/stagger 斷言決定論）；`Graphics` 若無 `roundRect` → 補（比照既有 `rect`/`poly` spy）。armyChip.spec 用真 pixi node，MapCanvasHost/dirty 用 mock。

---

## 9. Gate 清單與 baseline 程序

### 9.1 orchestrator gate 指令序（plan/18 §3.13）

```
npm run typecheck
npm run lint
npm run validate:data      # fixture 復用既有武將 → check-font-coverage 綠、簡體 0 筆
npm test                   # 全 vitest（armyChip、composeMapView、dirty、debugVisual、MapCanvasHost）
npm run build
npm run e2e                # build＋Playwright（chromium；舊 baseline 失敗＝預期）
# 確認軍隊視覺後，單獨更新三段 baseline：
npm run e2e:visual:update  # darwin
npm run bench              # DoD#5：1920×1080 20 動軍 30s ≥55fps（見 9.5）
```

**不觸發**：`gen:assets`／`atlas:build`／`validate:assets`（無新素材，V8D2）；**`font:subset`（零新字，§9.4）**。
**禁**：`golden:update`（s1560 golden 未變）。

### 9.2 baseline 再生（darwin＋linux）

- darwin：`npm run e2e:visual:update`。
- linux（CI parity）：docker `mcr.microsoft.com/playwright:v1.61.1-noble` 掛載 repo 跑同指令，再 in-container `npm run e2e:visual` 確認重現。
- 檔：`e2e/visual.spec.ts-snapshots/strategy-{overview,operational,close}-chromium-{darwin,linux}.png`。
- **獨立 commit**（plan/17 §3.9.3.1），PR 附 before/after＋art-bible §6.5＋reviewer 核准。

### 9.3 眼驗收（提交 baseline 前）

1. **far(0.25)**：全 10 軍可見；我方（織田，靛藍雙環）／敵（今川，朱紅尖角）／中立（齋藤，灰菱形）三通道，於 **deuteranopia 濾鏡** 下仍可辨（V8D13 尺寸：外環 ~14px／尖角輪廓 ~16px／菱形 ~8px，形狀互異）；旗幅 3 級量感可辨；marching 軍有方向箭頭（far 變體 ~9.6px）；被選取軍金色雙環（far 外環 ~24px）＋置頂；兵數字隱藏。
2. **operational(0.5)**：駿府叢集 4+ 軍交錯——katsuie 攻城 badge、ujizane 敗走旗下垂＋撤退 badge、補給 badge（危急空袋＋三角／低米袋缺口）現；兵數縮寫（`2.2k`）於 washi100 底板現；狀態 badge 右上單槽。
3. **close(1.25)**：士氣三點＋低士氣破裂框／高士氣旗結；精確兵數（`2,200`）於 washi100 底板；選取軍雙環＋置頂；棋子壓在城/道路之上。
4. **敵我三通道**：deuteranopia 模擬核 friendly/enemy/neutral 可分（雙環 vs 尖角 vs 菱形）。
5. **無 label 全重疊**（1280×720）：同節點兵數底板垂直錯位、跨節點間距 >底板寬；HUD 不遮主戰場；扇形不改世界位置（選取/命中一致）。
6. **選取 3 秒可辨**（金色雙環＋置頂＋full detail 破例）；**方向 3 秒可辨**（箭頭指前段）。
7. StrictMode 重掛後無 WebGL context lost、heap/texture 回穩態；V5/V6 地形/道路/領地未回歸。

### 9.4 字型義務（明示為事實）

- **兵數縮寫／`+N`**：純 ASCII → 恆在 `BASELINE_CHARS`，**不需 `font:subset`**。
- **badge**：`Graphics` 向量字形（非 `BitmapText`）→ 無字型義務。
- **fixture 武將名**：`tools/font-charset.ts` 之 `DEFAULT_DEBUG_FIXTURE_FILES` **確含 `src/core/debugVisual.ts` 並掃描其字串**（已驗證，line 32）。本設計**復用既有武將（今川氏真）→ 零新字 → check-font-coverage 必綠、`font:subset` 不觸發**。
- **強制備援**：日後任何 fixture 變更若引入含未涵蓋字之新名，`npm run font:subset` 為**強制獨立 commit**（非「若」）。

### 9.5 效能（DoD#5，20 動軍）

DoD#5（1920×1080、**20 moving armies**、30s ≥55fps）由 `npm run bench` 驗，非 visual fixture（fixture 為 10 軍靜態截圖）。本設計軍隊移動為 **transform-only reposition（`container.position.set`，零重繪）**＋純 Graphics batched geometry，20 軍遠低於瓶頸；far 放大亦為 transform。若既有 bench 場景未含 20 動軍，實作 agent 於 bench 補一 20-動軍場景（或確認既有 stress 場景涵蓋），使 DoD#5 有明確驗證出處，非默認。

---

## 10. plan §8 回寫草稿

於 `plan/07-military.md` §8 新增（**不改 §00**）：

> **2026-07-17（[M6-V8] 軍隊棋子）**：依 art-bible §6.5、12 §3.3.1 落地，逐項裁決：
> (1) 保留 `ArmyChip` 冪等契約；新增視覺由 `ArmyChipProps` 新欄位驅動並入 `armyChipDrawEqual`；far container 反向放大為 renderer transform（不計 `armyChips`）；`day` tick 零重繪、`MapRebuildCounts` 5 欄位不變。
> (2) 純 `Graphics`、不採 atlas、不新增素材；縮寫 ASCII、badge 向量 → 不觸發 gen:assets/validate:assets/font:subset。
> (3) 敵我三通道：`ArmyRelation` 於 UI 邊界 `composeMapViewState` 推導（`relationOf`→`getStance`→`stanceToRelation`），core selector/golden 不動；友靛藍雙環／敵朱紅尖角／中立灰空心菱形；**交叉刀專屬 engaged badge，不入關係通道**。
> (4) 方向 `heading` 由 renderer 依 `fromNode/toNode/edgeT`（§4.6 D9）計算，非規則。
> (5) 補給門檻 `MAPVIEW.armySupplyLowDays=7`（鏡射 `BAL.autoReturnFoodDays`）、`armySupplyCriticalDays=3`（裁定）；低＝米袋缺口、危急＝空袋＋驚嘆三角。
> (6) 狀態 badge 單一最高優先：routed>engaged>sieging>subjugating>危急>低>corps。
> (7) 敗走旗面繞旗桿頂順時針 20°；fixture 復用今川氏真領 routed 軍。
> (8) 士氣次級通道：三點 pip＋低士氣破裂框／高士氣旗結（near-only）。
> (9) 三級 LOD：`stage` 入 props；**LOD 段變更以獨立 `armyChipStage` 落差在 `applyLodAndCulling` 觸發 `syncArmyChips`**（修正 `setCameraPose` 預設 `lodStage` 致 preset 路徑不 restage 之缺陷），不遞迴、day-only 零增量。
> (10) **far 可讀性**：far container ×`armyFarChipScale`(2.4) 反向放大（transform）＋敵尾 far 變體，使敵我三通道於 0.25 preset 特徵尺寸 ≥ ~8 CSS px、色弱可辨。
> (11) 疊放/置頂：`layoutArmyStacks` 扇形/收合不變（加 additive `stackIndex`）；被選取 re-append 置頂；**標籤避讓＝兵數 washi100 底板依 `stackIndex` 垂直錯位（世界座標不變）**。
> (12) **washi100 兵數底板**（12 §3.3.1）補齊。
> (13) 動效延後（V9+，須 `reducedMotion` 凍結、不計 rebuildCounts）。
> (14) **ETA 延後**：`MapArmyViewModel` 僅暴露 `edgeT`（渲染內插），無剩餘日數；忠實 ETA 需新 view 欄位＝selector/view-contract 變更，超出「僅由既有欄位推導」約束，且不屬 DoD 驗收列 → 延至 V9+。
> (15) fixture：+1 routed 軍（復用今川氏真，零新字）＋補給危急/低各一＋Oda↔Imagawa 敵對外交列（**合併非覆蓋**）；非 golden、決定論、s1560 零觸。

（另於 `plan/04-map-and-movement.md` §8 補一行交叉引用：軍隊 `relation` UI 邊界推導、`heading` renderer 內插、far 可讀性用 container transform，皆不進 core selector；詳見 07 §8 [M6-V8]。）

---

## 11. Commit 計畫（整合序 B→A→C→E）

1. `feat(map): M6-V8 敵我關係型別與 chip 常數＋型別安全補丁 [M6-V8]`（Slice B：mapViewTypes `relation` 必填＋mapViewConfig 門檻/farScale＋composeMapView relation/stanceToRelation＋composeMapView.spec［含 delete rest.relation］＋MapCanvasHost.spec 5 軍字面量 relation 補丁）。
2. `feat(core): M6-V8 視覺 fixture 擴充（routed／補給／敵對外交列）[M6-V8]`（Slice A：debugVisual＋debugVisual.spec；零新武將、零新字）。
3. `feat(map): M6-V8 ArmyChip 旗型升級（方向/士氣/補給/狀態/敵我/選取/LOD/far 變體/washi100 底板）[M6-V8]`（Slice C）。
4. `feat(map): M6-V8 軍隊整合（heading/armyChipStage restage/far 放大/置頂/relation 接線）[M6-V8]`（Slice E：MapRenderer＋MainScreen＋mapRendererDirty.spec＋MapCanvasHost.spec 行為斷言＋pixiMock 補口）。
5. `test(visual): 更新 M6-V8 三段 baseline（軍隊棋子）[M6-V8]`（**獨立**，darwin＋linux）。
6. `docs(plan): 回寫 07 §8 M6-V8 設計決策 [M6-V8]`（§10）。
   （1 須早於 3；2 可與 1/3 並行；4 最後；baseline（5）與 plan 回寫（6）獨立。**§9.5 若補 bench 場景，併入 4 或獨立 `test(bench)` commit。** 無 `font(subset)` commit——零新字。）

---

## 12. 風險與回滾

| 風險                                                         | 影響                                                   | 緩解／回滾                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **`setCameraPose` 預設 `lodStage` 致 preset 路徑不 restage** | operational/close baseline 凍結 far detail（DoD 失敗） | **V8D11 `armyChipStage` 落差判定**；§8.3 restage Δ 測試守門                        |
| far 三通道太小、色弱不可辨                                   | DoD 色弱項失敗                                         | **V8D13 container ×2.4＋敵尾 far 變體**，數值保證 ≥~8px；§9.3 deuteranopia 眼驗收  |
| 缺 washi100 底板致兵數對比不足                               | DoD#4 對比失敗                                         | **V8D14 底板**；§8.1 底板斷言                                                      |
| MapCanvasHost.spec 因 `relation` 必填 typecheck 紅           | commit 1 gate 紅                                       | **Slice B atomic 補 5 軍字面量 relation**；typecheck 守門                          |
| composeMapView.spec passthrough `toEqual` 因 `relation` 紅   | test:ui 紅                                             | Slice B 加 `delete rest.relation`（#7）                                            |
| fixture 新武將觸發 check-font-coverage                       | validate:data 紅                                       | **復用今川氏真，零新字**（§6.2）；font-charset 掃 debugVisual.ts 已確認            |
| restage 遞迴                                                 | 迴圈/爆計數                                            | `syncArmyChips` 不呼 `applyLodAndCulling`；`armyChipStage` 更新後比較              |
| far 放大誤計 `armyChips`                                     | 破 DoD③                                                | 放大走 `container.scale`（transform），不經 `chip.update`；§8.3 far 放大 Δ==0 測試 |
| 雙 X（enemy＋engaged）                                       | 視覺噪音                                               | **關係通道去交叉刀，交叉刀專屬 engaged badge**（#5）                               |
| 外交列覆蓋 beginSiege 簿記                                   | INV 交叉檢查風險                                       | **合併非覆蓋**（§6.1，#8）                                                         |
| 標籤跨節點/同節點疊字                                        | DoD#3 全重疊                                           | 同節點 `stackIndex` 垂直錯位＋跨節點間距驗證（V8D14/§6.4）                         |
| 20 動軍 55fps 未覆蓋                                         | DoD#5 未驗                                             | `npm run bench`（transform-only 移動）；§9.5 補場景                                |
| relationOf 破 MainScreen memo                                | re-render                                              | 復用既有 `currentGame`＋顯式 dep（MINOR6，§5.2）                                   |

**整體回滾**：全在 `src/ui`（chip/renderer/compose/config/types/MainScreen）＋`src/core/debugVisual.ts`（fixture）＋測試，**s1560 core 與 golden 零觸、無素材、無 core selector 改動**。分項可退：關係通道／方向／badge／far 變體／washi100 底板皆獨立繪製段，可個別停用；DoD 最低標「敵我＋方向＋選取」由旗色＋關係通道＋方向箭頭＋選取雙環達成。fixture（A）可獨立 revert。

---

## 13. 對抗性審查處置表（每一 finding → 接受＋改動章節／拒絕＋理由）

### 審查 1（spec/visual）

| Finding                                                                                                                                                                                                        | 處置                                                                                                                        | 章節                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **確認正確（勿回歸）**：冪等契約＋5 欄位＋day 零繪、純 Graphics 無 atlas、UI 邊界 relation、heading 來源、routed 存於 enum、syncArmyChips 非遞迴、補給門檻在 MAPVIEW＋數學、朝比奈史實無 no-copy、無動效決定論 | **接受並保留**（未回歸）                                                                                                    | V8D1/D2/D3/D4/D5/D11/D12            |
| **M1（major）** far 三通道太小、色弱不可辨                                                                                                                                                                     | **接受**：新增 V8D13——container far 反向放大 ×2.4（transform）＋敵尾 far 變體，明列 0.25 preset CSS-px 與 deuteranopia 目標 | V8D13、§3.2、§3.3、§4.2、§5.1、§9.3 |
| **M2（major）** 缺 washi100 兵數底板（12 §3.3.1）                                                                                                                                                              | **接受**：新增 V8D14——`createArmyChip` 加 `plateGfx`（washi100 圓角＋ink700 框）；§8.1 底板斷言                             | V8D14、§3.3、§4.3、§8.1             |
| **#3（medium）** 標籤避讓僅同節點扇形、缺跨/疊字避讓                                                                                                                                                           | **接受**：V8D14 同節點 `stackIndex` 垂直錯位（不改世界座標）＋跨節點間距驗證列入 DoD 證據                                   | V8D14、§6.4、§9.3-5                 |
| **#4（minor）** near ETA 靜默略去                                                                                                                                                                              | **接受（明示延後）**：ETA 需新 view 欄位（剩餘日數），超出「僅由既有欄位推導」；不屬 DoD 列；回寫 07 §8 延後理由            | V8D9、§10-(14)                      |
| **#5（minor）** enemy＋engaged 雙交叉刀                                                                                                                                                                        | **接受**：關係通道去交叉刀，交叉刀專屬 engaged badge                                                                        | V8D6、§4.2-6                        |
| **#6（minor）** font-subset 為確定非條件                                                                                                                                                                       | **接受（消除風險）**：確認 font-charset 掃 debugVisual.ts 為事實；改復用今川氏真 → 零新字；font:subset 僅列強制備援         | §6.2、§9.4                          |
| **#7（minor）** composeMapView.spec `toEqual` 必破                                                                                                                                                             | **接受**：Slice B 加 `delete rest.relation`                                                                                 | §8.2、§7                            |
| **#8（minor）** §6.1 覆蓋整列恐蓋 beginSiege                                                                                                                                                                   | **接受**：改合併（spread existing 後設 lastHostileDay）                                                                     | §6.1                                |
| **#9（minor/verify）** init 雙繪 armyChips                                                                                                                                                                     | **接受**：`armyChipStage` 初值 'far' 與 lodStage 一致，init 不因段落差重繪；dirty 測試一律 Δ 斷言、不釘絕對值               | V8D11、§8.3                         |
| **#10（minor/coverage）** 20 動軍 55fps 未覆蓋                                                                                                                                                                 | **接受**：指向 `npm run bench`（transform-only 移動）；§9.5 補場景                                                          | §9.5、§9.1                          |

### 審查 2（engineering）

| Finding                                                                                                                                                                      | 處置                                                                                                                                                                 | 章節              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **BLOCKER1** restage 於 preset 路徑永不觸發（`setCameraPose` 預改 lodStage）；§8.3 as-written 自相矛盾                                                                       | **接受（核心修正）**：獨立 `armyChipStage` 欄位，gate `this.lodStage !== this.armyChipStage`，於 `applyLodAndCulling` 開頭 restage；三路徑正確性推演＋§8.3 改 Δ 斷言 | V8D11、§5.1、§8.3 |
| **MAJOR2** `relation` 必填破 MapCanvasHost.spec 編譯＋slice 排序衝突                                                                                                         | **接受**：型別變更與所有 consumer 字面量補丁 atomic 落 Slice B（含 MapCanvasHost.spec 5 軍字面量）；行為斷言歸 Slice E；B 先 E 後同檔不同區塊                        | §3.1、§7、§5.4    |
| **MAJOR3** font-charset 確掃 debugVisual.ts，新名為真義務                                                                                                                    | **接受**：復用今川氏真消除風險（零新字）；備援 font:subset 列強制                                                                                                    | §6.2、§9.4        |
| **MINOR4** composeMapView.spec `delete rest.relation`                                                                                                                        | **接受**                                                                                                                                                             | §8.2              |
| **MINOR5** `visibleArmies` 於 restage 前查詢                                                                                                                                 | **接受**：stage＋syncArmyChips 移至 `applyLodAndCulling` 開頭（query 之前）＋加防回歸註解                                                                            | §5.1、V8D11       |
| **MINOR6** MainScreen memo 內 `store.getState().game` stale-closure                                                                                                          | **接受**：復用組件本體既有 `currentGame`＋顯式加入 deps                                                                                                              | §5.2              |
| **確認正確（勿回歸）**：純 Graphics、UI 邊界 relation、heading 一致、冪等/day 零繪、hitArea flagWidthLarge、無動效、fixture 外交 stance、補給數學、playerClanId、置頂/非遞迴 | **接受並保留**（未回歸）                                                                                                                                             | V8D1–D12 相應段   |

**兩審查一致確認為正確且本版保留者**：純 Graphics 無 atlas、UI 邊界 relation 推導、heading 來源與冪等、`MapRebuildCounts` 5 欄位、hitArea 固定 flagWidthLarge、無 per-frame 動效之決定論、fixture 外交/補給數學、被選取置頂與 `syncArmyChips` 非遞迴。無「確認正確」項被回歸。
