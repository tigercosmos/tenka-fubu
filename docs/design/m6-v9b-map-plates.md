# M6-V9b 設計定稿：城名牌系統 × 出陣目標選擇模式 × 頂帶勢力識別

- 日期：2026-07-22
- 狀態：**M6-V9b 設計定稿**（已整合一份對抗評審；承 M6-V9 已 landed 基線；裁決見文末 §13）
- 研究依據：orchestrator 親閱之《信長之野望・新生》官方公開畫面抽象觀察（見 §11 references.md 增修）。
  **只轉譯資訊層級／縮放策略／操作回饋**，不複製版面比例、面板位置、icon 輪廓、肖像、家紋、字型、
  城模、貼圖、配色數值、動效（art-bible §12.2 禁抄鐵律）。
- 自足性：實作者只讀本檔即可動工。所有幾何、字級、LOD 顯隱、資料接線、簽章、測試影響、baseline
  影響、i18n key 皆已定，無需再做設計決策。

---

## 0. 硬約束（違反即 CI 紅燈，不得繞過）

- **不改 `src/core/**`**：golden byte-identical。名牌所需「兵數／敵我關係／我方旗標」一律在
  **UI 邊界 `composeMapViewState` 注入**（比照 M6-V8 `MapArmyView.relation` 由 composeMapViewState
  推導、非 core 直通之先例；見 §1.3）。**不動 `src/core/state/selectors.ts` 的 `MapCastleViewModel`**
  （已核實 `selectors.ts:558-570`，僅 `id/ownerClanId/durability/maxDurability/tier/terrainKind/
siegeMode/warning`，**無 `soldiers`**）。
- **不動 e2e 契約 testid**：`screen-strategy`／`hud-date`／`speed-pause`／`speed-1`／`speed-2`／
  `speed-5`／`rail-military`／`rail-domestic`／`rail-officers`／`rail-policy`／`minimap`／
  `minimap-base`／`minimap-frame`／`march-target-strip`／`march-modal`。
- **不引入每幀全量重算**：守 20 軍 55fps。名牌反向縮放僅 `camera.scale` 變時更新（沿用 V9
  `lastLabelScale` 機制，新增平行 `lastNameplateScale`）；名牌重繪僅在該城**名牌專屬簽章**
  （`buildNameplateSig`，§2.9）變時（冪等 `update`）；declutter 僅 idle 下降沿／scale 變／lodStage
  變時觸發（沿用 V9 §2.5）。
- **不破 `mapRendererDirty.spec`**（實檔位於 `src/ui/map/mapRendererDirty.spec.ts`，1155 行，
  `new MapRenderer()`＋`getRebuildCounts()` 整合契約）：無狀態且無相機變更的 tick 零重建；owner 翻轉
  只重畫 territory＋受影響節點/名牌；移動只 reposition。名牌反向縮放／declutter 走 camera-dirty，
  **不動 `rebuildCounts`**。名牌建立/銷毀計入**新增** `rebuildCounts.nameplates`（與現有 `labels`
  計數分離，見 §2.9）。
- **art-bible 禁抄鐵律**（§12.2）：名牌是**原創和紙綬帶**，非新生名牌之描摹。**構圖刻意去同構**
  （§2.1 DD-A3：城名前置、兵數內嵌綬帶尾段而非下掛 chip、勢力印記騎於節點-綬帶接點而非綬帶左端
  平貼徽章）；敵我第二辨識通道走 art-bible §3.3 canonical（朱紅尖角／靛藍雙環／灰空心菱形），
  **不抄新生**綬帶比例/徽章位置/色值。
- **全字串 `t(key)`**（繁中台灣慣用，過 `validate:data`）。名牌 canvas 文字（城名取
  `staticData.names` 既有、兵數為數字）不進 i18n 表；新 i18n key 只在 HUD/DOM（§10）。

設計主張一句話：**名牌＝地圖上的資訊錨點**，城名恆可讀、歸屬一眼可辨；名牌用和紙綬帶把「城名＋
勢力印記＋敵我通道＋兵數」收成一個 pixel-lock 小牌，取代 V9 城名裸標籤，其餘（郡/國/道路標籤、
耐久環、選取環、pathPreview 光帶）一律沿用不動。

---

## 1. 名牌在既有架構中的落點（根因與定位）

### 1.1 現況拆解（已核實）

- **V9 城名＝裸標籤**：`buildStaticDataLayers`（`MapRenderer.ts` 靜態層）把城名以 `upsertLabel`
  建成 `labelParts` 內 per-label `Container`＋`BitmapText`。標籤是「靜態」的：只在 `setMapData`
  建一次，`updateView` 永不重建。
- **動態城態走 node 路徑**：每 tick 的 owner/durability/warning/tier 經 `buildNodeSig`
  （`dirty.ts:79`）→ `diffNodeSig` → `castleNode.update()`，只對簽章變動之城重繪。
- **關鍵落差①（兵數逐 tick 變）**：名牌要顯示的兵數會逐 tick 變（徵兵/出陣/戰損）。**若把名牌
  塞進靜態 `labelParts`，兵數變更無處更新。**
- **關鍵落差②（node 簽章不含兵數）**：`buildNodeSig` 的城簽章＝
  `c|owner|dur/max|warning|terrainKind|tier`（`dirty.ts:82-84`，已核實）——**不含 soldiers、
  relation、isPlayer、name**。故名牌**不可騎 `buildNodeSig`/`diffNodeSig`**：一個「只兵數變」的
  tick 產生相同 node 簽章，該城不進 `sigDirty`，名牌永不刷新（兵數 stale）；反之若把 soldiers
  塞進 `buildNodeSig`，會連帶每次兵數變都呼叫 `castleNode.update` 並 `rebuildCounts.nodeMarkers
+= 1`（節點根本不顯兵數），污染計數且做白工。
- **關鍵落差③**：`MapCastleViewModel` 無 `soldiers`（§0 已核實）。任務簡述「MapViewModel 已含
  soldiers」與現碼不符——soldiers 僅在 `MapArmyViewModel`（`selectors.ts:591`）。

### 1.2 定位決策（DD-A0）

**城名牌是新的動態 scene part（`castleNameplate`），走「名牌專屬簽章」的獨立 diff 路徑，而非
label 靜態路徑、亦非 node 簽章路徑。** 城名由此移出 `labelParts`（不再走
`LABEL_STYLE.mainCastle/branchCastle`）；郡/國/道路標籤**維持 V9 `labelParts` 樣式不動**。

- 名牌 part = 1 `Container`（掛世界座標、pixel-lock 反向縮放）＋ 1 `Graphics`（綬帶底＋勢力印記＋
  關係通道＋兵數內嵌區）＋ 1 `BitmapText`（城名）＋ 1 `BitmapText`（兵數）。
- 名牌 part 存於**新 Map** `this.nameplateParts: Map<CastleId, CastleNameplatePart>`，在
  `buildStaticDataLayers` 隨城節點一併建立（與城節點同迴圈），在每 tick **名牌簽章 diff**
  一併 `update`（冪等，§2.9）。
- 名牌掛在**新圖層** `layers.nameplates`，z-order 在 `labels` 之下、`nodeMarkers` 之上（§6）。

### 1.3 兵數/關係資料接線（DD-A1，core-safe，採 army-relation 先例）

**UI 邊界擴充 `MapCastleView`，不動 core；三個新欄皆為 UI 推導欄（比照 `MapArmyView.relation`）：**

```
// mapViewTypes.ts —— 由 `= MapCastleViewModel` 改為交叉補欄（UI 邊界必填欄，composeMapViewState 注入）
export type MapCastleView = MapCastleViewModel & {
  readonly soldiers: number;        // 城內駐軍（composeMapViewState 由全 game 注入）
  readonly relation: ArmyRelation;  // 對 player 的敵我（'friendly'|'neutral'|'enemy'）
  readonly isPlayer: boolean;       // ownerClanId === playerClanId（我方通道）
};
```

- `composeMapViewState`（UI，`composeMapView.ts:68` 現為 `castles: model.castles` 直通）改為
  **逐城 map 補欄**（比照同檔 army 對 `relation` 之推導）：
  `castles: model.castles.map(c => ({ ...c, soldiers: soldiersByCastle[c.id] ?? 0,
relation: relationOf(c.ownerClanId), isPlayer: c.ownerClanId === playerClanId }))`。
  `relationOf`／`playerClanId` 為 `composeMapViewState` 現有入參（army 路徑已用）。
- `composeMapViewState` 新增輸入 `soldiersByCastle: Readonly<Record<string, number>>`。
- `MainScreen`（已持 `currentGame`）以 `useMemo` 由 `currentGame.castles` 建 `soldiersByCastle`
  （`Object.fromEntries(Object.values(castles).map(c => [c.id, c.soldiers]))`），穩定參考餵入
  `composeMapViewState`；依賴陣列已含 `currentGame`。
- **golden 安全**：`composeMapViewState` 為 UI 純函式，core view-model 未動；`MapCastleViewModel`
  型別不變。
- **`composeMapView.spec.ts:98` 影響（採納評審 M3）**：現為 `expect(out.castles).toEqual(model.
castles)`（「直通不變形」）。注入三欄後必紅。**改法比照同檔 army 先例**（`composeMapView.spec.ts:
104-111`：`delete rest.relation` 後 `toEqual`）——對每城 `delete rest.soldiers/relation/isPlayer`
  後再 `toEqual(model.castles[i])`，並新增一段「三欄已注入且值正確」的正向斷言（比照 army
  `relation 推導` describe，`composeMapView.spec.ts:130`）。
- **`MapCanvasHost.spec.tsx` fixture**：其城 fixture 需帶 `soldiers/relation/isPlayer`（型別必填）；
  現 fixture 已帶 `soldiers`（`MapCanvasHost.spec.tsx:487`），補 `relation/isPlayer` 兩欄即可。

---

## 2. 城名牌系統規格（核心交付 A）

### 2.1 綬帶幾何與去同構構圖（CSS px；pixel-lock 後螢幕恆定）

名牌容器 `position = (node.x, node.y + worldGap)`（**世界座標偏移**），`container.scale =
1 / camera.scale`（內容螢幕恆定）。綬帶自容器原點向下＋左右對稱展開。新增常數表
`NAMEPLATE_GEOMETRY`（新檔 `src/ui/map/sceneParts/nameplateStyle.ts`）：

| 常數                                | 本城 main | 支城 branch | 說明                                                 |
| ----------------------------------- | --------: | ----------: | ---------------------------------------------------- |
| `worldGap`（世界單位，容器 Y 偏移） |        24 |          18 | 使綬帶頂恆在節點下方（見 §2.6 空間關係）             |
| `ribbonH` 綬帶高                    |        20 |          16 | 和紙綬帶底板高                                       |
| `ribbonPadX` 內距                   |         6 |           5 | 左右內距                                             |
| `ribbonMinW` 最小寬                 |        48 |          38 | 短名時仍成牌                                         |
| `ribbonRadius` 圓角                 |         3 |         2.5 | washi 綬帶圓角（非新生方角）                         |
| `nameSize` 城名字級                 |        15 |          13 | ink900 墨字（沿用 V9 主/支城字級）                   |
| `divGapX` 名/兵分隔內距             |         6 |           5 | 城名與兵數群之間的 ink 髮絲分隔內距                  |
| `sealR` 勢力印記半徑                |         8 |         6.5 | 旗幟軌 `clanColorNum(index)` 填＋ink900 環（騎接點） |
| `relStripeW` 關係色帶寬             |         3 |           3 | 綬帶左內緣豎帶（靛/朱/灰，§2.4）                     |
| `dyeUnderlineH` 染紙暈邊高          |         2 |           2 | 綬帶下緣 `clanDyeNum(index)` 薄暈，繫 territory      |
| `troopDotR` 兵符點半徑              |         3 |           3 | 兵數前導小記號（沿用 ArmyChip soldier glyph 語彙）   |
| `troopNumSize` 兵數字級             |        12 |          11 | tabular numerals，ink900                             |
| `inkHairline` 綬帶描邊              |         1 |           1 | ink900 髮絲外框                                      |

**DD-A3 去同構構圖（採納評審 Major 4；刻意不與新生「圓章左＋城名＋兵數 chip 下掛」同構）**：

新生名牌觀察為「勢力色綬帶＋**圓章置左**＋城名＋**兵數 chip 懸掛正下方**」。本作**三處刻意偏離**，
使元件排列不與新生對位：

1. **城名前置（左）、兵數內嵌綬帶尾段（右），非下掛 chip**：綬帶為單一橫條——左段城名（ink900，
   `anchor(0,0.5)`），右段兵數群（兵符點＋數字，右對齊），兩段間以 `inkHairline` ink900 髮絲豎線
   分隔（`divGapX` 內距）。**兵數不另起一個懸掛於綬帶下方的 chip**（消除「chip 下掛」同構）。
2. **勢力印記騎於「節點-綬帶接點」，非綬帶左端平貼徽章**：`sealR` 印記圓的**中心落在容器原點**
   （即節點正下方、綬帶頂緣中線上），上半圓外溢向節點、下半圓壓入綬帶頂緣——讀作「一枚印章鈐於
   城與名牌交界」，把歸屬繫回**節點錨點**而非綬帶內的獨立左端徽章（消除「圓章左」同構）。
3. **綬帶寬置中於節點**：`container` 內容從 `-ribbonW/2` 起繪，綬帶水平置中於節點下方（非新生
   名牌之左錨延展）。

**綬帶寬度**＝`ribbonPadX + textWidth(name) + divGapX*2 + troopDotR*2 + 2 + textWidth(troops)

- ribbonPadX`，下限 `ribbonMinW`；`BitmapText.width`量得後由`Graphics` 繪對應寬綬帶（動態寬，
  於名牌簽章變時重算）。印記圓不佔綬帶內部水平版位（騎於頂緣中線），故不推移城名左起點。

### 2.2 綬帶構成（由下而上繪製；art-bible §4.2 左上受光、右下短投影）

1. **右下微投影**（`ink900` α 0.22，位移 +2/+2 px）：名牌 < HUD < modal 投影階序（art-bible §7）。
2. **和紙綬帶底**：`washi100`（#f5efe0）填、`ribbonRadius` 圓角、`inkHairline` ink900 描邊。washi
   底即城名可讀性基底——名牌城名**不需 per-glyph halo**（綬帶提供對比），較 V9 裸標籤 halo 更乾淨。
   **所有名牌 washi 底 α 恆 1.0**（採納評審 Minor 5；不以背景透明度做敵我通道）。
3. **染紙暈邊**：綬帶下緣 `dyeUnderlineH` 高的 `clanDyeNum(index)`（染紙軌，低彩度）薄帶——把名牌
   繫回領地染紙軌。
4. **關係色帶**（§2.4）：綬帶左內緣 `relStripeW` 豎帶（靛/朱/灰）。
5. **城名 `BitmapText`**：ink900、`nameSize`、`anchor(0, 0.5)`、垂直置綬帶中線、水平接關係色帶右。
6. **名/兵分隔**：`inkHairline` ink900 髮絲豎線（`divGapX`）。
7. **兵數群**（§2.7 顯隱）：兵符點（`troopDotR`）＋`formatSoldierChip(soldiers)` tabular 數字，
   右對齊於綬帶尾段。
8. **勢力印記**（§2.3）：騎於節點-綬帶接點（DD-A3-2），`clanColorNum(index)` 填＋ink900 環＋tier
   刻痕；家紋渲染器（M8-22）前以色章＋tier 記號代替。

### 2.3 勢力印記 ＋ tier 記號（家紋佔位，DD-A2）

家紋資產於 M8-22 前不存在。印記以**色章＋tier 記號**承擔「哪一家＋城格」：

| 城格        | 印記內記號                                          | 說明                                       |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| 本城 main   | 印記內置 **2 枚短墨橫刻**（上下並列，ink900 α 0.6） | 雙刻＝本城（呼應 art-bible §6.4 二階主郭） |
| 支城 branch | 印記內置 **1 枚短墨橫刻**                           | 單刻＝支城                                 |

- 印記填色＝旗幟軌 `clanColorNum(index)`；ink900 環寬 1；tier 刻痕為原創幾何（非家紋描摹）。
- **M8-22 家紋 landed 後**：以家紋 sprite 換掉「色章＋tier 刻痕」中心圖形，印記幾何/位置不變（換圖
  不換版）——`drawSeal` 內單一 `crestGlyph` 繪製子函式預留此 swap 點。

### 2.4 敵我第二辨識通道（色弱／CVD，art-bible §3.3 canonical）

allegiance（對 player 的關係）**與 40-way 勢力色相正交**，用「色帶色＋印記環形態＋綬帶左端形態」
三重編碼，色弱下仍成立：

| relation / isPlayer   | 關係色帶色（`relStripeW`） | 印記環                            | 綬帶左端形態       | 附加記號                           |
| --------------------- | -------------------------- | --------------------------------- | ------------------ | ---------------------------------- |
| 我方（isPlayer=true） | `accentIndigo` #2e5c8a     | **ink900 雙環**（友軍語彙）       | 圓角               | 印記左上 3px 實心靛點（home tick） |
| 友軍（friendly 非我） | `accentIndigo`             | ink900 單環                       | 圓角               | 無                                 |
| 敵對（enemy）         | `accentVermilion` #b23a28  | ink900 單環＋**右上缺角**（尖角） | **尖角（右斜切）** | 印記旁小交叉墨記（2px）            |
| 中立（neutral）       | `neutralClanless` #8c8c84  | ink900 單環＋**空心**（心不填色） | 平口               | 綬帶左端小空心菱形（3px）          |

- **色弱保證**：形態（雙環/單環/缺角/空心）＋端形（圓/尖/平）＋記號（點/交叉/菱形）三通道皆非
  色相依賴；色帶色僅為增強。CVD 通道取自 art-bible §3.3 line 76 canonical，**非抄新生**。
- **我方另有識別通道**（任務要求）＝雙環＋home tick（綬帶底 α 一律 1.0，不以透明度區分——採納
  評審 Minor 5）。

### 2.5 光照與材質（art-bible §4.1/§4.2）

- 左上柔光：綬帶頂緣 1px `washi200` 提亮線；右下 `ink900` α 0.22 微投影（§2.2-1）。
- 材質：綬帶＝和紙（washi100 底，不加雜訊——名牌小面積，雜訊糊字）；印記＝旗幟軌漆色小面積。
- **金箔僅選取態/目標態**：名牌本體不使用金；選取城金雙環由既有 `selectionRing` 承擔，目標高亮
  金框由 §3.4 施加，名牌常態不含金元素（守 art-bible §4.1 ≤3% 金箔）。

### 2.6 與耐久環／選取環的空間關係

- 節點（body/ring/warn）在 `layers.nodeMarkers`，世界座標、世界縮放（耐久環 r18/13 世界，near-only）。
- 名牌容器 `position.y = node.y + worldGap`（world），故螢幕上名牌頂距節點中心 `worldGap × scale`；
  耐久環螢幕半徑 `18 × scale`。`worldGap(24) > ringR(18)` 於**耐久環顯示的 near 段**恆成立 →
  名牌頂恆在環外緣之下，不疊環。
- 選取環（`selectionRing`，金雙環，繞節點）在節點區；名牌在節點下方，兩者不重疊。
- 警戒/受攻徽記在節點上半，名牌在下半，互不干涉。
- **警戒態於名牌的呼應**：名牌**不**重複繪 warning（避免雙重朱紅）；若我方城被圍
  （`warning!=='none'`），綬帶右端（兵數群之後）加 1 枚 `accentVermilion` 小烽狼記（3px），作為
  「此城告急」的名牌側索引——與城頂徽記語意一致、位置分離。

### 2.7 各 LOD 顯隱表（沿用 §5 LOD 段：far<0.5 / mid 0.5–1.0 / near≥1.0）

| 名牌元件                                         | far                     | mid（operational） | near（close） |
| ------------------------------------------------ | ----------------------- | ------------------ | ------------- |
| 本城：綬帶＋城名＋印記＋關係通道＋兵數群＋染紙暈 | **隱**（見下 far 定義） | **顯**             | 顯            |
| 支城：綬帶＋城名＋印記＋關係通道＋兵數群         | 隱                      | 隱                 | **顯**        |

- **far「縮簡」定義（採納評審 Minor 7＋開放問題 #2，裁為選項 B）**：far 主城名牌**全隱**；overview
  的政治歸屬與識別**完全交給既有 far 主城剪影 ×1.4 ensign**（V9 §3.3，`MapRenderer` 剪影填旗幟軌
  飽和色）＋國名/勢力名 label（V9 樣式），符合 art-bible §5「overview 標籤只 國名/勢力名」。
  「far 只 main 城名牌縮簡」由此讀作「far 時主城識別塌縮為剪影 ensign，無綬帶/城名/兵數」——
  **不新增 far 專屬 roundel**（消除評審 Minor 7「roundel 偏移以 near-only 耐久環為基準、於 far 不
  成立」的矛盾，同時降 overview 噪度）。friendly/enemy CVD 通道在 far 不需要（overview 讀政治地圖
  由 clan 色＋國名/勢力名承擔；march 偵察為 operational 以上關切）。
- LOD 切換以名牌 part 的 `setLodStage(stage)` 切各子物件 `visible`（不重繪、不建毀），比照
  `castleNode.applyLod`：far→全隱；mid→本城顯、支城隱；near→全顯。
- pixel-lock：名牌容器 `scale=1/camera.scale` 於 `applyLodAndCulling` 之 `scaleChanged` 分支一併
  遍歷設定（沿用 V9 §2.1 機制，新增平行 `lastNameplateScale`，見 §2.9）。

### 2.8 與 declutter 的整合（優先序 ＋ 綬帶 AABB 佔格；採納評審 Minor 6）

名牌與剩餘標籤（郡/國/道路）**共用同一佔用網格**（V9 §2.5 的 64×64 CSS px 格），名牌以最高優先入格：

```
優先序（小＝先佔格）：
  0  本城名牌（main nameplate）
  1  國名/省 province（label）
  2  支城名牌（branch nameplate）
  3  郡 district（label）
  4  道路 road（label）
  同級以 id 字典序 tie-break
```

- **名牌以綬帶 AABB 佔格（非 point 桶）**：V9 標籤用單點 `floor(sx/64)` 桶（窄字）；名牌綬帶寬可達
  ~120 CSS px（動態），若沿用單點桶，兩座螢幕距 >64px 的相鄰主城會各佔不同桶卻綬帶實寬重疊
  （可見疊字），或 <64px 時主城錨點被整個隱掉。**故名牌佔用其綬帶螢幕 AABB 覆蓋到的所有 64px
  格**：AABB 螢幕寬＝`ribbonW`（CSS px，pixel-lock 後即 CSS px）、高＝`ribbonH`，錨點螢幕座標
  `worldToScreen(node.pos, {width,height})` 加 `(0, worldGap×scale)` 偏移為 AABB 中心-上緣；
  覆蓋格集合 = `{ floor((cx±ribbonW/2)/64) } × { floor((cy..cy+ribbonH)/64) }`。逐名牌（優先序）
  若其任一覆蓋格 ∈ occupancy → `declutterHidden=true`；否則把全部覆蓋格加入 occupancy。
- 窄標籤（province/district/road）維持 V9 單點桶佔一格。混合佔格於同一 `occupancy: Set<string>`，
  決定論一致。
- `runLabelDeclutter`（V9）擴充：候選集合納入 `nameplateParts`，與 `labelParts` 統一排序後逐一
  佔格。
- **選取城/告急城破例**：`isPlayer 選取`、`warning==='critical'`、或 §3.4 目標高亮之名牌不受
  declutter 隱藏（沿用 M6-V8「收合疊軍選取破例」精神；於 `runLabelDeclutter` 先把破例名牌強制
  `declutterHidden=false` 並先佔格）。

### 2.9 效能與冪等 update 契約 ＋ 名牌專屬簽章（≤121 城；採納評審 Blocker 1）

**Blocker 1 修法核心：名牌走獨立簽章與獨立 diff loop，與 `buildNodeSig`/`castleNode` 完全分離。**

- **新增 `buildNameplateSig(view): Map<CastleId,string>`（純函式，加於 `src/ui/map/dirty.ts`，供
  單元測試）**：
  ```
  sig(castle) = `n|${owner}|${tier}|${name}|${warning}|${relation}|${isPlayer}|${soldiers}`
  ```
  **含 soldiers/relation/isPlayer/name**（node 簽章所無），故兵數/關係/我方旗標任一變即命中 diff。
  pos 不入簽章（另判，見下）。
- **`MapRenderer` 新增 `prevNameplateSig: Map<CastleId,string> | null`**（比照 `prevNodeSig`；
  `setMapData` 後設 `null`＝全 dirty 首繪）。`updateView` 於**節點 diff 之後**跑**第二個 diff loop**：
  `diffNameplateSig(prev, next)`（同 `diffNodeSig` 結構，可共用泛型 diff）命中之城才呼叫
  `nameplateParts.get(id).update(props)`。刪除初稿「一併走 node 簽章-diff」表述（與此矛盾）。
- **pos 更新（移動 reposition）**：名牌容器 `position` 隨節點世界座標，若城 pos 變（graph swap／
  極少）於 diff 外一併 reposition（比照 army reposition），**不重繪**、不進 nameplates 計數。
- **冪等 `update(props)`**：part 內快取 `last`，`sameNameplateProps(last, props)` 未變則早退不重繪
  （比照 `castleNode.samePropsExceptPos`）。故：
  - 無城變的 tick：`diffNameplateSig` 空集 → 零 `update` 呼叫、零重繪、零重建（守
    `mapRendererDirty.spec`「無變更 tick 零重建」）。
  - owner 翻轉：node 簽章與名牌簽章同時命中該城 → 節點重繪（既有）＋該城名牌重繪（印記色/關係/dye
    變）——**不**全量。
  - 兵數逐 tick 變：**只名牌簽章命中該城** → 只 chip 文字＋綬帶寬（若跨位數）重繪該城；node 簽章
    不變 → `castleNode` 不動、`rebuildCounts.nodeMarkers` 不增。
- **反向縮放**：`applyLodAndCulling` 的 `scaleChanged` 分支遍歷 `nameplateParts` 設
  `container.scale.set(1/scale)`（~121 次，可忽略），與 `labelParts` 同一 `scaleChanged` 條件；
  新增 `this.lastNameplateScale`（與 `lastLabelScale` 同步觸發）；**新建即套**（`buildStaticDataLayers`
  建名牌當下 `container.scale.set(1/camera.scale)`，並於尾把 `lastNameplateScale=NaN` 哨兵強制下次
  重設，比照 V9 §2.1 B-M4 修法）。**camera-dirty，不增 `rebuildCounts`**。
- **`rebuildCounts.nameplates`**（新計數欄，加於 `MapRebuildCounts`）：以名牌 id 為單位，只在
  `buildStaticDataLayers` 建/毀時 +1（與 `labels` 分離；`mapRendererDirty.spec` 的
  `labels.toBe(...)` 斷言由名牌不觸動）。
- **`labels` 計數下修**：城名移出 `labelParts` 後，`labels` 計數減城名數。`mapRendererDirty.spec:
199` 現斷言 `afterSetMapData.labels).toBe(4)`（3 node label＋1 省 label）；城名移出後該 fixture
  之 node label 只剩郡（`dist.x`）→ **改為 `toBe(2)`**（1 郡 label＋1 省 label；2 城名移出），並
  新增 `nameplates).toBe(2)`（castle.a／castle.b）斷言。詳見 §9。

### 2.10 名牌 part 介面（新檔 `src/ui/map/sceneParts/castleNameplate.ts`）

```
export interface CastleNameplateProps {
  readonly pos: { readonly x: number; readonly y: number };
  readonly name: string;
  readonly tier: CastleTier;                 // 'main' | 'branch'
  readonly colorIndex: number;               // Clan.colorIndex 0..39（旗幟軌印記＋染紙軌暈）
  readonly relation: ArmyRelation;           // 'friendly'|'neutral'|'enemy'
  readonly isPlayer: boolean;                // 我方通道
  readonly warning: 'none'|'threatened'|'critical';
  readonly soldiers: number;                 // 兵數內嵌區
}
export interface CastleNameplatePart extends ScenePart<CastleNameplateProps> {
  setLodStage(stage: LodStage): void;        // far 全隱／mid 本城顯/支城隱／near 全顯
}
export function createCastleNameplate(): CastleNameplatePart;
```

- 純繪製 helper：`drawRibbon`／`drawSeal(crestGlyph)`／`drawRelationChannel`／`drawTroops`／
  `formatSoldierChip`，皆只用 `Graphics`/`BitmapText` 子集，供 node 測試環境以 mock 錄製繪製指令
  （比照 castleNode）。
- `formatSoldierChip(n)`：**單一規則跨所有 LOD**——tabular numerals＋千分位
  （`n.toLocaleString('en-US')`，如 `12,000`）；不縮寫、不混用（art-bible §10）。0 兵時顯 `0`（不隱）。

---

## 3. 出陣目標選擇回饋（交付 B）

### 3.1 現況與分工裁決（DD-B0；已核實）

- 現況：`rail-military`／ContextPanel「出陣」開 `MarchModal`（compose：選大將/副將/兵數/兵糧）→
  「在地圖選擇目標」按鈕 `update({phase:'pickTarget'})`（`MarchModal.tsx:301`）；`MainScreen`
  於 `marchDraft?.phase==='pickTarget'` 傳 `interactionMode='orderMarch'`（`MainScreen.tsx:525`）。
  `MarchModal` 於 `phase==='pickTarget'` 隱主體、只渲一條 `march-target-strip`（頂中，
  `MarchModal.tsx:171-204`，內含 mode 文字＋estDays＋errorKey＋「返回編成」鈕）。地圖上點節點 →
  `handleMapEvent` nodeClick 分支 `previewMarchTarget(event.id, true)`（`MainScreen.tsx:327`），
  `previewMarchTarget` 第二參 `finishPick=true && valid` → `phase:'compose'`
  （`MainScreen.tsx:310`）**立即回 compose**。pathPreview 光帶已由 `MapCanvasHost` 繪出。
- **裁決：Modal 收編成、地圖收目標，全程不離開地圖（非 modal 蓋版）。** compose 階段用 Modal；
  pickTarget 階段 Modal 主體隱、改為**地圖內模式層**（頂中操作說明帶＋底中確認/取消藥丸＋選中目標
  名牌高亮＋右側目標卡）。**最小改動**（重用既有 `previewMarchTarget`、`pathPreview`、
  `march-target-strip`）且**最佳手感**（點選＝先預覽不即提交，可比較敵我後再確認）。

### 3.2 pickTarget 模式層（改寫 `MarchModal.tsx` 的 `phase==='pickTarget'` 分支）

三個地圖內浮層（皆 `z-modal`，不蓋地圖中央戰場焦點區，art-bible §9.2）：

**(a) 頂中操作說明帶**（沿用 `march-target-strip` testid、`aria-live=polite`、`tabIndex=-1`，
`MarchModal.spec.tsx:127` 焦點斷言保留）：

- 左：模式標題 `t('ui.march.modeBanner')`（＝「出陣目標選擇」）。
- 中：動態提示——`draft.previewDays!==null` 顯 `t('ui.march.estDays',{days})`；否則顯
  `t('ui.march.pickTarget')`（既有 key，「請在地圖上點選目標」）；`draft.errorKey` 存在時
  `role=alert` 顯 `t(errorKey)`。
- 帶寬/頂距沿用現 `styles.targetStrip`，不蓋路徑終點（art-bible §9.2，沿用既有 focus，不新增相機
  邏輯）。

**(b) 底中確認/取消藥丸**（新增，底距 `space-4`、水平置中）：

- `[確認目標]` `t('ui.march.confirmTarget')`：**enabled 條件**＝
  `draft.targetNodeId !== null && draft.previewPath?.result.unreachable !== true`（選定且可達才亮；
  與 `previewMarchTarget` 寫入之 `previewPath`/`targetNodeId` 一致）；`onClick` →
  `update({ phase:'compose' })`（目標已存於 draft，回 Modal 完成最終「出陣」）。
- `[取消]` `t('ui.common.cancel')`：→ `update({ phase:'compose', targetNodeId:null,
previewPath:null, previewDays:null, errorKey:null })`（＝現 `march-target-strip`「返回編成」鈕之
  既有清空語意，`MarchModal.tsx:186-193`，改綁此藥丸）。Escape 鍵沿用既有（`MarchModal.tsx:71-82`
  的 pickTarget Escape → compose，不動）。
- 藥丸樣式：washi100 底＋ink900 字＋圓角；確認鍵 enabled 時金選取語彙（`accentGold` 20% 底＋
  `accentGoldText` 字，art-bible §8.3 selected），disabled 時降對比保留輪廓（§8.3）。

**(c) 右側目標卡**（新增，`draft.targetNodeId !== null` 時顯；washi 卡，右側貼邊、避開 MiniMap，
`bottom` 上移讓開 MiniMap）：

- tab 標頭：目標城名（`model.names[targetNodeId]`）。
- **敵城守備量條**：`t('ui.march.targetEnemy')` ＋ 目標城 `soldiers`（§3.3 新 selector）以 `StatBar`。
- **城耐久量條**：`t('ui.march.targetDurability')` ＋ `durability/maxDurability`。
- **我方出陣兵力**：`t('ui.march.targetOurForce')` ＋ `draft.soldiers`（編成已定之兵）。
- 三者並列給「敵我戰力比較」手感（觀察 3）；肖像禁用（無資產）；以量條＋數字承擔。
- 目標為郡（非城）時只顯路徑/日數（郡無守備/耐久）。未選目標時**不渲染**此卡（減視覺噪）。

### 3.3 資料接線（`MarchModal` 目標卡新 selector，UI 端）

`selectMarchModel`（`MarchModal.tsx:21`，`makeCachedSelector`）已含 `names`（全城/郡名）；新增
`castleStatsById: Record<CastleId, { soldiers; durability; maxDurability }>`（由 `game.castles`
讀，UI selector，非 core）。目標卡以 `draft.targetNodeId` 查此表。

### 3.4 選中目標名牌高亮（接名牌系統 §2）

- `MainScreen` 於 `interactionMode==='orderMarch'` 時把 `marchDraft.targetNodeId` 經**新 prop**
  `marchTargetId?: string` 傳 `MapCanvasHost` → `MapRenderer`。
- `MapRenderer` 對該 id 的名牌施「目標高亮」：綬帶外加 **1px `accentGold` 外框＋輕微外擴**（沿用
  選取語彙但與 `selectionRing` 區隔——目標高亮在名牌上，選取環在節點上），並**破例 declutter**
  （目標名牌恆顯，§2.8）。高亮為 part 上的一個 `setTargetHighlight(boolean)` 開關（切一個既繪
  Graphics 子物件 visible，不重繪名牌本體、不進 nameplates 計數）。
- **候選（所有可達目標）預高亮＝延後**：計算全可達敵/中立城集合每 tick 成本高；本片只高亮「當前
  選中目標」（bounded＝1 城）＋既有 pathPreview 光帶（含 hostile 標紅由 `previewMarchTarget`）。
  候選批量預高亮列為 M6-V11+ 選配（見 §13 開放問題 #3）。

### 3.5 左上書法模式橫幅（選配，本片不做）

- 選配：pickTarget 進入時左上一枚 `washi300` 底＋`ink900` serif 模式橫幅 `t('ui.march.modeBanner')`，
  墨帶語彙（非新生書法構圖）。**本片預設不做**（頂中說明帶已承擔）；key 已備。實作者若做，用本作
  `washi300`/`ink900`/serif，禁抄新生左上書法版位。

### 3.6 `MainScreen.previewMarchTarget` 的唯一改動

`handleMapEvent` 的 pickTarget `nodeClick` 分支（`MainScreen.tsx:327`）：
`previewMarchTarget(event.id, false)`（原 `true`）——**點選＝設目標＋預覽，停留 pickTarget**，
不再自動回 compose（`MainScreen.tsx:310` 的 `finishPick && valid` 於 `finishPick=false` 恆走
`'pickTarget'`）。回 compose 改由 §3.2(b)「確認目標」藥丸驅動。hover 分支（`false`）不變。
`rightClick`（清目標回 compose）不變。

---

## 4. 頂帶勢力識別（交付 C）

### 4.1 ResourceBar 左端勢力識別小塊

`ResourceBar` 在 `<time hud-date>` **之前**插入勢力識別塊（不動 48px 高、不動任何 testid）：

```
<span className={styles.clanIdentity} aria-label={t('ui.hud.clanIdentity', { clan: clanName })}>
  <span className={styles.clanChip} style={{ background: clanColorHex(clanColorIndex) }} />  {/* 旗幟軌色章 */}
  <strong className={styles.clanName}>{clanName}</strong>                                    {/* 勢力名（主名選配） */}
</span>
```

- 新 props：`clanName: string`、`clanColorIndex: number`。
- 色章：14×14 px 旗幟軌 `clanColorHex(index)` 填＋ink900 1px 環＋2px 圓角（呼應名牌印記，頂帶與
  地圖識別一致）。
- 勢力名：washi100 字（頂帶 ink900 底），`Noto Serif TC` 15px；**主名選配**——`window.innerWidth
≤1440` 以 CSS 斷點隱名（只留色章），色章恆顯。
- delta 併排：觀察 4「勢力身分與資源同座」由「識別塊在頂帶最左、資源緊隨」滿足；金/兵 delta 沿用
  V9 tooltip，**不新增併排 delta**（守 V9 §4.2）。

### 4.2 MainScreen 接線

`MainScreen` 於 ResourceBar 呼叫處補 `clanName={clan.name}`、`clanColorIndex={clanColorIndex}`
（`clan = currentGame.clans[playerClanId]`；`clanColorIndex` 既有於左欄家紋塊）。**不動 48px
`<header>` 高度、不動 SpeedControl/☰**。

---

## 5. LOD 段定義（沿用 V9，無新增段）

沿用 `lodStageWithHysteresis`（`scale<0.5` far／`0.5–1.0` mid／`≥1.0` near，10% hysteresis）。
名牌 §2.7、march 模式層不改段門檻。

---

## 6. 圖層序（新增 `nameplates` 圖層）

由下而上（art-bible §7 / 04 §3.10.1）：`...terrain / territory / roads / settlements /
nodeMarkers / **nameplates（新）** / selectionAndPath / armies / labels / effects`。

- 名牌在 `nodeMarkers` 之上（名牌是節點資訊延伸，須壓過城下聚落/節點本體）、在 `labels` 之下
  （郡/國/道路標籤——尤其 overview 國名大字——須壓過名牌，art-bible §1.1 國名為 overview 低對比
  大字）。
- 名牌在 `selectionAndPath` 之下 → 選取金環/路徑光帶壓過名牌（選取/命令為最高即時態勢）。
- 城名離開 `labels` 後，`labels` 只剩郡/國/道路（V9 樣式不動）。

---

## 7. 切片計畫（定序 S1 → S2；不宣稱可平行；共寫 baseline 抽為序列化收尾）

**檔案擁有權（互斥，逐片交棒；路徑均為 repo 實檔，已核實 colocated 於 `src/`）：**

| 片                           | 擁有檔案                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1（renderer 名牌）**      | `src/ui/map/sceneParts/castleNameplate.ts`（新）、`src/ui/map/sceneParts/nameplateStyle.ts`（新）、`src/ui/map/MapRenderer.ts`（名牌 Map/圖層/build/`buildNameplateSig` diff loop/LOD/declutter AABB/pixel-lock/`marchTargetId` 高亮/`rebuildCounts.nameplates`）、`src/ui/map/dirty.ts`（`buildNameplateSig`/`diffNameplateSig`）、`src/ui/map/mapViewTypes.ts`（`MapCastleView` 補三欄）、`src/ui/map/composeMapView.ts`（逐城注入三欄）、`src/ui/map/mapRendererDirty.spec.ts`（labels 下修＋nameplates 斷言）、`src/ui/map/mapDirty.spec.ts`（`buildNameplateSig`/`diffNameplateSig` 單元）、`src/ui/map/MapCanvasHost.spec.tsx`（fixture 補 relation/isPlayer；soldiers 已有）、`tests/ui/composeMapView.spec.ts`（castles toEqual 改法＋正向斷言） |
| **S2（HUD 目標模式＋頂帶）** | `src/ui/screens/MarchModal.tsx`（pickTarget 三浮層＋目標卡＋確認藥丸、`selectMarchModel` 補 `castleStatsById`）、`src/ui/screens/MarchModal.module.css`（底中藥丸/目標卡樣式）、`src/ui/screens/MarchModal.spec.tsx`（流程斷言更新）、`src/ui/screens/MainScreen.tsx`（`previewMarchTarget` finishPick→false、`marchTargetId` 傳遞、ResourceBar clan props、`soldiersByCastle` memo）、`src/ui/screens/MainScreen.spec.tsx`（testid 保留＋新 render 斷言）、`src/ui/components/ResourceBar/*`（clan 識別塊）、`src/ui/map/MapCanvasHost.tsx`（`marchTargetId` prop 透傳）、`src/i18n/zh-TW.ts`（§10 新 key）                                                                                                                                             |

- `MapRenderer.ts`／`dirty.ts`／`mapViewTypes.ts`／`composeMapView.ts` **僅 S1** 動；S2 只從
  `MapCanvasHost`/`MainScreen` 透傳 prop、對其只讀。
- `MapCanvasHost.tsx` 的 `marchTargetId` prop 為 S2 擁有（透傳）；其 `.spec.tsx` fixture 三欄補齊
  歸 S1（型別必填先行）。S1→S2 定序使 spec 先綠。

### S1 — renderer 名牌

- **內容**：§1.2/§1.3/§2 全部——名牌 part、`nameplates` 圖層、`buildStaticDataLayers` 建名牌
  （城名移出 `labelParts`）、`buildNameplateSig`/`diffNameplateSig`＋`prevNameplateSig`＋每 tick
  第二 diff loop 驅動 `nameplate.update`（冪等，§2.9）、`setLodStage`（far 全隱）、pixel-lock
  （`scaleChanged` 遍歷＋新建即套＋`lastNameplateScale=NaN` 哨兵）、declutter 納入名牌（AABB 佔格，
  §2.8）、`marchTargetId` 目標高亮（§3.4）、`MapCastleView` 補三欄＋`composeMapViewState` 逐城注入
  （§1.3）、`rebuildCounts.nameplates` 新欄。
- **測試（硬 DoD）**：
  - `mapRendererDirty.spec` **必綠**——(a) 無變更 tick 零重建（`diffNameplateSig` 空、
    `rebuildCounts.nameplates` 不增）；(b) owner 翻轉只重畫 territory＋該城節點/名牌，不全量；
    (c) 移動只 reposition；(d) **新增**「只兵數變」tick 斷言：node 簽章不變 → `nodeMarkers` 不增、
    名牌簽章變 → 該城名牌 `update` 一次（可用 draw spy 驗）、`rebuildCounts.nodeMarkers` 恆定；
    (e) `afterSetMapData.labels` 由 `toBe(4)` **改 `toBe(2)`**（2 城名移出）、**新增
    `nameplates).toBe(2)`**（castle.a/castle.b）。
  - `mapDirty.spec` 新增 `buildNameplateSig`/`diffNameplateSig` 純函式單元（比照既有 `buildNodeSig`/
    `diffNodeSig` 測試：簽章含 soldiers、只兵數變即命中、pos 不入簽章）。
  - `composeMapView.spec.ts:98` 改法（§1.3）：`delete rest.{soldiers,relation,isPlayer}` 後
    `toEqual`＋新增三欄正向注入斷言。
  - `MapCanvasHost.spec` 城 fixture 補 `relation/isPlayer` 後綠。
- **驗收**：mid 主城／near 全城和紙綬帶＋勢力印記（騎接點）＋城名墨字（左）＋兵數（右內嵌）＋敵我
  通道（雙環/尖角/空心可辨、色弱下成立）；far 主城**無綬帶**（剪影 ×1.4 ensign 獨撐）；名牌不疊
  耐久環/選取環；密集區 declutter 以綬帶 AABB 收斂、主城錨點不被整個隱掉；選取/告急/目標城名牌
  破例恆顯。
- **baseline 影響**：三段城名呈現全變（裸標籤→名牌；far 城名消失由剪影承擔）＝預期；golden 不受
  影響（core 未動）。

### S2 — HUD 目標模式＋頂帶

- **內容**：§3（pickTarget 頂中說明帶／底中確認取消藥丸／右側目標卡／`marchTargetId` 傳遞／
  `previewMarchTarget` finishPick→false／`selectMarchModel` 補 `castleStatsById`）＋§4（ResourceBar
  clan 識別塊接線）＋§10 i18n。
- **驗收**：出陣流程——編成（Modal）→「在地圖選擇目標」→ 地圖內模式層（頂帶說明＋底藥丸＋目標卡）→
  點選城＝預覽不即提交、名牌金框高亮、目標卡顯敵城兵數/耐久+我方兵力→「確認目標」亮起→回 Modal→
  「出陣」；「取消」/Esc 回編成清目標；頂帶最左顯勢力色章＋勢力名（≤1440 只色章）。所有契約
  testid 在。
- **測試**：
  - `MarchModal.spec.tsx`：**更新既有斷言**——原「點目標即回 compose」改為「點目標停留
    pickTarget、確認鍵後回 compose」；新增 pickTarget 三浮層 render、確認藥丸 enabled 條件、目標卡
    render；`march-target-strip` 焦點斷言（`:127`）保留。
  - `MainScreen.spec.tsx`：testid 全保留＋ResourceBar clan props render＋`marchTargetId` 傳遞。
  - `ResourceBar`（`src/ui/components/ResourceBar/`，隨元件補 spec 或於 MainScreen.spec 覆蓋）：
    clan 塊 render、`hud-date` testid 保留。
- **baseline 影響**：HUD 頂帶＋pickTarget 模式層截圖變＝預期。

### 收尾（序列化，非任一片 DoD）

S1+S2 全 land 後**一次**重生 visual baseline：本機 darwin `playwright --update-snapshots`；
CI/docker linux 生 linux 半。三段 preset × 兩平台 PNG 為共享可變產物，不在單片 DoD 內宣稱綠。
若 `visual.spec` 增 pickTarget 專屬截圖，於收尾一併生。

---

## 8. 硬約束核對

- **core 不動**：兵數/關係/我方旗標經 `composeMapViewState`（UI）逐城注入（army-relation 先例）；
  `MapCastleViewModel` 型別/`selectors.ts` 未動；golden byte-identical。
- **e2e testid 不動**：`march-target-strip`（頂帶沿用）、`march-modal`、`rail-*`、`speed-*`、
  `hud-date`、`minimap*`、`screen-strategy` 全保留。
- **i18n**：新字串全 `t(key)`（§10，繁中台灣慣用、無簡體/日文新字體，過 `validate:data`）；canvas
  名牌文字取 `staticData.names`＋數字，不進 i18n。
- **效能**：名牌反向縮放僅 scale 變；名牌重繪僅該城名牌簽章變（冪等早退）；declutter 僅
  idle/scale/stage 變；名牌 ≤121、每 part bounded。無每幀全量重算；守 20 軍 55fps。

---

## 9. 受影響測試清單（路徑均已核實）

| 測試                                      | 影響                                                | 動作                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/ui/map/mapRendererDirty.spec.ts`     | 城名移出 labels、新增 nameplates 計數、名牌獨立簽章 | `labels` 由 `toBe(4)`→`toBe(2)`；加 `nameplates).toBe(2)`；加「只兵數變」零 nodeMarkers 斷言；驗零重建/只重畫變動城名牌 |
| `src/ui/map/mapDirty.spec.ts`             | 新增 `buildNameplateSig`/`diffNameplateSig` 純函式  | 加簽章含 soldiers、只兵數變即命中、pos 不入簽章之單元                                                                   |
| `tests/ui/composeMapView.spec.ts`         | `MapCastleView` 補 soldiers/relation/isPlayer       | `:98` `toEqual` 前 `delete` 三衍生欄（比照 army `:110`）＋新增三欄正向注入斷言                                          |
| `src/ui/map/MapCanvasHost.spec.tsx`       | 城 fixture 補 relation/isPlayer（soldiers 已有）    | fixture 補兩欄；`marchTargetId` prop 透傳 render                                                                        |
| `src/ui/screens/MarchModal.spec.tsx`      | 點目標不再自動回 compose、加確認藥丸/目標卡         | 更新流程斷言、加藥丸 enabled/目標卡 render、保留 `:127` 焦點斷言                                                        |
| `src/ui/screens/MainScreen.spec.tsx`      | ResourceBar clan props、marchTargetId 傳遞          | testid 全保留＋新 render 斷言                                                                                           |
| `src/ui/components/ResourceBar/*`（spec） | clan 識別塊                                         | 加 clan 塊 render、驗 `hud-date` 保留                                                                                   |
| `e2e/visual.spec.ts`（preset × 平台 PNG） | 名牌＋HUD＋pickTarget 呈現變                        | **序列化收尾**重生 baseline（darwin＋linux）                                                                            |
| golden                                    | 無（core 未動）                                     | 不更新                                                                                                                  |

**baseline 影響總述**：overview（far 主城剪影獨撐、城名消失）／operational（主城全牌）／close（全
城牌＋兵數）＋HUD 頂帶 clan 塊＋pickTarget 模式層——全為預期視覺變更，收尾統一重生。

---

## 10. i18n 新 key 清單（`src/i18n/zh-TW.ts`，繁中台灣慣用）

```
// 出陣目標模式（§3）
'ui.march.modeBanner': '出陣目標選擇',
'ui.march.confirmTarget': '確認目標',
'ui.march.noTarget': '尚未選定目標',
'ui.march.targetEnemy': '目標守備',
'ui.march.targetDurability': '城耐久',
'ui.march.targetOurForce': '出陣兵力',
// 頂帶勢力識別（§4）
'ui.hud.clanIdentity': '{clan}家',
```

沿用既有：`ui.march.pickTarget`／`ui.march.estDays`／`ui.march.backCompose`／
`ui.march.pickTargetAction`／`ui.common.cancel`／`ui.hud.gold|food|soldiers|prestige`／
`ui.rail.*`／`ui.speed.*`／`ui.minimap.ariaLabel`／`ui.system.menu`。名牌（canvas）城名取
`staticData.names`、兵數為數字，**無新 key**。

---

## 11. `docs/visual/references.md` 應新增/更新條目

### 11.1 §2 參考圖板新增列（R11）

| 欄位                    | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                      | **R11**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 場景／主題              | 大地圖城名牌／選取資訊卡／出陣目標選擇模式／頂部勢力識別                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 來源（存取 2026-07-22） | 沿用官方入口：KOEI TECMO America — System（R01）、Online Manual Main Screen 4100（R02）、Online Manual Marching 7100（R05）。2026-07-22 二次存取（M6-V9b 名牌/目標模式/頂帶研究）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 抽象觀察                | (1) 據點在大地圖以橫向名牌為資訊錨點：勢力色底＋圓形徽章＋城名＋狀態小圖示＋下掛兵數；城名恆可讀、歸屬一眼可辨、我方/敵方以底色區分。(2) 選取據點時側邊資訊卡以 tab 標頭＋量條＋槽位方格呈現數值。(3) 選目標時全程留在地圖（非蓋版 modal）：頂部操作說明帶＋底部確認/返回＋候選目標高亮＋我方到目標路徑光帶＋目標守備/耐久與我方兵力比較。(4) 頂部把勢力身分與資源＋每月增減同座。                                                                                                                                                                                                                                                                                                                                                                                      |
| 轉譯到本作              | (1) 原創和紙綬帶名牌，且**構圖刻意去同構**：城名前置（左）、兵數內嵌綬帶尾段（右、非下掛 chip）、勢力印記騎於節點-綬帶接點（非綬帶左端平貼徽章）；家紋前以旗幟軌色章＋tier 刻痕代；染紙軌下緣暈邊繫領地；敵我第二通道走 art-bible §3.3（靛雙環/朱尖角/灰空心菱形）＋我方 home tick，色弱成立；LOD 顯隱（far 全隱、剪影 ensign 獨撐；mid 本城；near 全城）與 declutter 優先序（本城>國名>支城>郡>道路）＋綬帶 AABB 佔格；名牌與耐久環/選取環空間分離（node 下方 worldGap）。(2) 選取快覽走既有 ContextPanel＋StatBar（槽位方格留待面板刻化）。(3) pickTarget 地圖內模式層：頂中說明帶＋底中確認/取消藥丸＋選中目標名牌金框＋既有 pathPreview 光帶＋右側目標卡（敵城兵數/耐久＋我方出陣兵力）。(4) ResourceBar 左端旗幟軌色章＋勢力名（不動 48px 墨帶與 delta tooltip）。 |
| 不可直接沿用            | 名牌版面比例/綬帶位置/徽章位置/家紋/字型/城模/貼圖/配色數值/動效；資訊卡框飾與槽位排布；目標模式的橫幅構圖/藥丸造型/路徑線樣式/相機手感；頂部識別的區塊組合與色值。**放射狀指令輪（新生選節點環形選單）判定為招牌版面，禁抄——本作底部快覽條已承職。** 本作已對「圓章左＋城名＋兵數 chip 下掛」之新生名牌構圖做刻意去同構（見轉譯欄），不得回退為與其對位之排列。                                                                                                                                                                                                                                                                                                                                                                                                        |

### 11.2 §2 既有列更新（存取日補記）

R01/R02/R05 於「來源」欄補記「2026-07-22 二次存取（M6-V9b 名牌/目標模式/頂帶研究）」，觀察與轉譯
沿用並交叉引用 R11；不改原禁抄欄。

### 11.3 §4 來源管理新增「阻擋改用官方來源」紀錄

於 §4「禁用與來源管理」新增一條：

> **2026-07-22 來源可及性紀錄**：嘗試存取 `qbnews.tw/shinsei`（台灣遊戲媒體之新生介面圖文）作為
> 介面觀察補充，遭 Cloudflare 人機驗證阻擋（無法程式化存取）；依 §4.3 流程改以官方 KOEI TECMO
> America 產品頁/線上手冊（R01/R02/R05）為 canonical 觀察入口，不以來路不明鏡像站或圖片搜尋縮圖
> 替代（守 §4.3 末條）。本次研究之抽象觀察與轉譯登錄於 R11。

---

## 12. 設計決策記錄（回寫指引）

實作 land 後依 CLAUDE.md 回寫對應 plan §8（**絕不改 `plan/00`**）：

- 城名牌系統（part 落點、名牌獨立簽章 `buildNameplateSig`、去同構構圖 DD-A3、雙軌色接名牌、敵我
  CVD 通道、LOD/declutter AABB 整合、名牌與環空間關係、`MapCastleView` UI 邊界補 soldiers/relation/
  isPlayer 之 army-relation 先例）→ `plan/04` §8（交叉引用 art-bible §6.4/§10/§12、`plan/12`）。
- 出陣目標選擇模式（Modal 收編成/地圖收目標分工、pickTarget 三浮層、`previewMarchTarget`
  finishPick 語意、目標卡資料源）→ `plan/11` §8（交叉引用 `plan/12`、`plan/04` §3.10.3 路徑）。
- 頂帶勢力識別塊 → `plan/11` §8。

本檔為 M6-V9b 實作單一真相；plan 回寫以交叉引用本檔為主，不留 TBD。

---

## 13. 評審裁決

### 接受（修訂已納入）

- **Blocker 1（名牌騎 node 簽章 → 兵數永不更新）**：接受。`buildNodeSig`（`dirty.ts:82-84`）確不含
  soldiers/relation/name，初稿「一併走 node 簽章-diff」與其自列之「名牌專屬簽章」自相矛盾。→ §2.9
  定案名牌走**獨立 `buildNameplateSig`（含 soldiers）＋獨立 `prevNameplateSig` 快取＋第二 diff
  loop＋獨立 `rebuildCounts.nameplates`**，刪「一併走 node 簽章」表述；§7/§9 加「只兵數變」零
  nodeMarkers 斷言。
- **Major 3（`composeMapView.spec` toEqual 破裂 ＋ 型別擴張）之實質**：接受。`composeMapView.ts:68`
  現 `castles: model.castles` 直通、`composeMapView.spec.ts:98` `toEqual(model.castles)` 注入後必
  紅——真回歸。→ §1.3 採**既有 army-relation 先例**（`MapArmyView.relation` 由 composeMapViewState
  推導、spec `:110` `delete rest.relation` 後 toEqual）：三欄為 UI 推導必填欄，spec 改 `delete`
  三欄後 toEqual＋正向斷言；§9 補列 `composeMapView.spec`。
- **Major 4（構圖與新生名牌近同構）**：接受。→ §2.1 DD-A3 三處刻意去同構（城名前置左／兵數內嵌
  綬帶尾段而非下掛 chip／勢力印記騎節點-綬帶接點而非綬帶左端平貼徽章）；R11「不可沿用」欄留證。
- **Minor 5（敵城 washi α 0.92 削弱偵察對比）**：接受。→ §2.2/§2.4 所有名牌 washi 底 α 恆 1.0，
  敵我第二通道全交邊框/印記/關係色帶。
- **Minor 6（64px 點桶 vs 綬帶寬 → 主城疊字/被隱）**：接受。→ §2.8 名牌改以**綬帶螢幕 AABB
  佔格**（覆蓋到的所有 64px 格），窄標籤維持點桶，同一 occupancy。
- **Minor 7（far roundel 偏移以 near-only 耐久環為基準，於 far 不成立）＋開放問題 #2**：接受並
  合併定案。→ §2.7 裁為**選項 B：far 主城名牌全隱，剪影 ×1.4 ensign 獨撐 overview 歸屬**（符
  art-bible §5），既解 Minor 7（無 far roundel 即無偏移矛盾）又降 overview 噪度。

### 拒絕（附理由）

- **Blocker 2（S1 指名的 `mapRendererDirty.spec` 不存在、renderer rebuildCounts 零覆蓋）**：拒絕
  （事實前提錯誤）。評審僅搜 `tests/`，漏掉 colocated 於 `src/` 的 spec：
  `src/ui/map/mapRendererDirty.spec.ts` **存在**（1155 行、`new MapRenderer()`＋`getRebuildCounts()`
  整合契約，含 `labels).toBe(4)`＝3 node＋1 省 之斷言於 `:199`）；`MapCanvasHost.spec.tsx`／
  `MarchModal.spec.tsx`／`MainScreen.spec.tsx` 亦均 colocated 存在。安全網真實存在，「靜默上線」
  前提不成立。**保留其唯一有效殘留**（初稿 §9 本就正確指名此檔）：§9 定案 `labels` 由 `toBe(4)`
  下修 `toBe(2)`＋加 `nameplates).toBe(2)`＋「只兵數變」斷言，並更正全文測試路徑為 `src/` colocated。
- **Major 3 之「MarchModal/MainScreen/MapCanvasHost/ResourceBar spec 全不存在」子論**：拒絕（事實
  錯誤，同上）。四者除 ResourceBar 均 colocated 存在；ResourceBar 隨元件補 spec 或於 MainScreen.spec
  覆蓋。已於 §7/§9 以實檔路徑取代虛構路徑。
- **Major 3 之「relation/isPlayer 設為可選＋`??` 兜底」替代方案**：拒絕（一致性劣）。既有
  army-relation 先例為**必填推導欄**（`MapArmyView.relation` 必填、composeMapViewState 注入、spec
  delete 後比對），採必填＋逐城 map 注入與其一致，優於另立可選欄語意。

### 沿用初稿之開放問題定案

- 開放問題 #1（`soldiersByCastle` 注入點）：定於 `MainScreen`→`composeMapViewState` 新入參（§1.3）。
- 開放問題 #2（far roundel 是否過噪）：定為選項 B（far 名牌全隱、剪影獨撐），見上 Minor 7。
- 開放問題 #3（候選批量高亮）：延後至 M6-V11+（§3.4），本片只高亮當前選中目標＋既有 pathPreview。
- 開放問題 #4（左上書法橫幅）：選配不做（§3.5），key 已備。
