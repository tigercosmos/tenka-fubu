# M6-V9 設計定稿：「像真的遊戲」——地圖可讀性 × HUD 組裝

- 日期：2026-07-22
- 狀態：**M6-V9 設計定稿**（已整合 visual-spec／engineering 兩份對抗評審；裁決見文末 §9）
- 自足性：實作者只讀本檔即可動工，所有數值已定，無需再做設計決策。

---

## 0. 硬約束（違反即 CI 紅燈）

- **不改 `src/core/**`**：golden byte-identical。一切資料接線走既有 selector 與 UI 端匯總。
- **不動 e2e 契約 testid**：`screen-strategy`／`hud-date`／`speed-pause`／`speed-1`／`speed-2`／
  `speed-5`／`rail-military`／`rail-domestic`／`rail-officers`／`rail-policy`／`minimap`／
  `minimap-base`／`minimap-frame`。
- **不引入每幀全量重算**：守 20 軍 55fps。反向縮放僅 `camera.scale` 變時更新；declutter 僅
  camera idle／scale 變／lodStage 變時觸發。
- **不破 `mapRendererDirty.spec`**：無狀態且無相機變更的 tick 零重建；owner 翻轉只重畫
  territory；移動只 reposition。反向縮放／declutter 皆走 camera-dirty 路徑，**不動
  `rebuildCounts`**。

設計主張一句話：地圖是 hero（低飽和戰國沙盤、紙上薄染），HUD 是安靜的墨帶＋和紙（金箔
≤3%），簽名集中在「左欄家紋塊＋墨帶頂條」構成的軍議桌，其餘一律克制、優先把既有好元件接上。

---

## 1. 勢力色雙軌制（Ensign track／Dye-paper track）

### 1.1 根因（定錨）

單一公式 `clanColorHsl(index, bright)`（`tokens.ts:176-183`，`hue=index*9`、normal s62/l42、
bright s58/l52）同時餵四個消費者：territory 光柵、district 節點、HUD `--clan-NN`、ArmyChip。
「油漆感」來自兩件事：

1. **染料本身飽和**：40 個等距色相統一 S/L，鋪滿全圖＝色卡感（即使 alpha 0.45 仍是彩虹補丁）。
2. **邊界烘焙是「加深飽和色」**：`borderDarken=0.55` 直接乘 RGB，把飽和料變成更濃的飽和邊＝
   霓虹描邊，違反 art-bible §3.1「邊界＝局部墨色加深」。

### 1.2 拆軌決策

| 軌                        | 函式（tokens.ts）                                                        | 消費者                                                                       | 特性                                                                  |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **旗幟軌 Ensign**（不動） | `clanColorHsl(index, bright)` → `clanColorHex/Num`、`--clan-NN(-bright)` | HUD 家紋/勢力 token、ArmyChip 軍旗、**district/castle 節點填色**、MiniMap 點 | 維持高辨識度（s62/l42、bright s58/l52）——皆為小面積 ID 錨點，要 pop。 |
| **染紙軌 Dye**（新增）    | `clanDyeHsl(index)` → `clanDyeHex(index)` / `clanDyeNum(index)`          | **只餵 `territoryGrid.recolorTerritory` 的 base 色**                         | 低彩度薄染，讓 M6-V5 紙浮雕透出。                                     |

同一勢力兩軌共用 `hue=index*9`——旗與領地同色系，語意一致。差異只在 S/L。

### 1.3 染紙軌精確公式（新增 `clanDyeHsl`）

```
clanDyeHsl(index):
  assertClanColorIndex(index)
  hue = (index * 9) % 360
  s   = 25
  l   = (index % 2 === 0) ? 67 : 53      // 奇偶亮度鋸齒，Δ14
  return { h: hue, s: 25, l }
```

- `clanDyeHex` 走既有 `hslToHex`（同一四捨五入路徑）；`clanDyeNum = hexToNum(clanDyeHex(index))`。
- **不做顯式混紙 RGB**：sprite 層 alpha 0.45 疊在 land base `#cfc6ae` 上即完成「染紙」合成，維持
  既有「recolorTerritory 寫不透明 RGB、sprite alpha 合成」架構，零新機制。

**奇偶 Δ 為何是 14（非初稿的 8）**：染紙 sprite 以 alpha 0.45 疊在 land base 上，L 落差被壓成
`0.45×ΔL`。Δ8 → 實顯 ≈Δ3.6，僅擦邊 JND（大面積相鄰約 2–3），色弱模式下更弱。改 Δ14 →
實顯 ≈Δ6.3，穩過 JND，即使色相（S25、9°）全滅仍有可靠的正交亮度軸。

代表值（以 `hslToHex` 為準）：index0 → HSL(0,25,67)；index1 → HSL(9,25,53)；index5（織田）→
HSL(45,25,67)。皆為淡陶土/淡黃褐薄暈。

**歸屬責任的正確定位（重要，取代初稿「40-way 薄染成立」的過強斷言）**：染紙軌**只回答**
「有主／無主／我方／鄰家＋家系暗示」四類；**精確「這是誰的」由節點旗（旗幟軌）＋標籤回答**，
**overview（far）縮放層的政治歸屬由 far 主城剪影（ensign 飽和填色 ×1.4，§3.3）承擔**，不倚賴
染紙。三條正交通道分工如下：

1. **地圖鄰接 ≠ 索引鄰接**：`clan.colorIndex` 由劇本刻意打散（1560：織田5/今川31/松平17/齋藤9…），
   邊界兩側色相通常相距 ≫9°。
2. **奇偶亮度鋸齒 Δ14**：與色相正交的第二軸，抵 alpha 壓縮後仍可靠；含色弱模式。
3. **恆存紙墨邊（§1.4）＋飽和節點旗＋主城剪影＋標籤**：parcel 分界與精確歸屬的最終保證。

art-bible §3.1/§6.2「大面積不可飽和勢力色、邊界局部墨色加深」由本軌滿足。

### 1.4 紙墨邊（取代 borderDarken 乘法）

`recolorTerritory` pass2b 的 `darkenPixel`（`territoryGrid.ts:344-349`）改為**朝固定墨色混合**：

```
edge.rgb = round( dye.rgb * (1 - borderInkMix) + borderInk.rgb * borderInkMix )
```

- `borderInk = 0x2e281d`（暖 sumi 墨，warm 使其不冷灰）
- `borderInkMix = 0.55`

**角落雙混 clamp（採納評審 A m4）**：pass2b 逐像素維護一個「本 pass 已上墨」旗標（可用一個與
grid 同尺寸的 `Uint8Array` 或就地判定該像素是否已被寫過墨值）；**一像素在本 pass 至多朝 ink 混合
一次**，第二次（對右、對下同時越界的角落）**跳過**。上限恆為 `borderInkMix=0.55`，杜絕近黑噪點。
保留「右鄰/下鄰各自判斷、符合則各處理一次」的巡覽結構（`territoryGrid.ts:350-368` 不變），只在
「寫墨」時加 once-guard。

**海岸／中性邊為刻意（採納評審 A m4，選「刻意 sumi-e 海岸」）**：`darkenPixel` 在所有 `clanIdx`
相異處觸發，含 (a) 陸 vs 海（海 cell a=0 不可見，陸緣上墨＝毛筆海岸線）、(b) 有主 vs 無主。改為
朝恆定暖墨混合後，這些邊一律得到一致暖墨線（毛筆界線），為刻意觀感，**不排除海岸**。sprite alpha
0.45 使墨邊半透明軟疊地形（毛筆感）。

**mapViewConfig.ts 配合**：`colors` 內**移除 `borderDarken`**，新增 `borderInk: 0x2e281d`、
`borderInkMix: 0.55`；更新檔頭第 9–10 行註解（borderDarken → borderInk/borderInkMix）。
`pathOk/pathBad/awe` 不動。

### 1.5 三檔 alpha

**維持 0.45 / 0.65（far）/ 0.85（faction）不變**（`mapViewConfig.ts:43-45`；
`MapRenderer.ts:927-934`）。art-bible §3.1 明列此三值為 canonical，染紙軌降彩度後這三檔本就是
「讓地形透出」的正確透明度。

### 1.6 dirty 相容

`recolorTerritory` 只在 owner 翻轉（territory dirty）時跑；S1 只改「寫什麼顏色」不改「何時寫」——
`mapRendererDirty.spec`「owner 翻轉只重畫 territory」契約不受影響。

---

## 2. 標籤系統

### 2.1 像素鎖定（pixel-lock）——反向縮放

每個標籤裝進一個**掛在節點世界座標的 per-label `Container`**（世界空間定位，隨 world container
平移「免費」正確），`BitmapText` 為其子；相機縮放時把該 container 的 `scale` 設為
`1 / camera.scale`，子元素偏移改用**螢幕 px**（container 已反向縮放，其局部座標＝螢幕 px）。

- 世界字級 `fontSize=F`，world 縮放 `s`，label container `scale=1/s` → 螢幕
  `F*s*(1/s)=F` CSS px 恆定（net texture scale = 1.0，不生模糊）。
- 子 `BitmapText.position=(0, +gap)`，`gap` 為螢幕 px（節點下方固定間距，見 §2.4）。
- `BitmapText.anchor=(0.5, 0)`（頂-中）使反向縮放繞節點中心對稱。

**為何 per-label container 而非整層縮放**：labels layer 內各標籤是不同世界座標，單一層縮放會錯置。
per-label container 是標準無歧義做法，成本＝可見標籤（~40）在**縮放時**設 `.scale`，可忽略。

**觸發與 dirty 相容（關鍵）**：

- 反向縮放**只在 `camera.scale` 改變時**觸發（平移時 scale 不變，container 隨 world 平移即正確）。
  渲染器保存 `lastLabelScale`；`applyLodAndCulling`（僅由 `onTick` 呼叫，line ~308）內
  `if (camera.scale !== lastLabelScale)` 才遍歷可見標籤設 scale，然後回寫 `lastLabelScale`。
- **新建 container 立即套用（採納評審 B M4）**：`buildStaticDataLayers`（setMapData：劇本載入/graph
  swap）新建 label container 的**當下**即 `container.scale.set(1 / camera.scale)`；並在
  `buildStaticDataLayers` 尾把 `lastLabelScale = NaN`（哨兵），強制下一次 `applyLodAndCulling` 全量
  重設。杜絕「新標籤停在 scale=1」的快取漏更。
- 此路徑為 **camera-dirty**：**不增 `rebuildCounts.labels`**、不建/毀 BitmapText。
  `applyLodAndCulling` 本就每幀遍歷所有 label 設 visible，加反向縮放不引入新的每幀量級。契約不破。

### 2.2 ink900 + washi halo（Pixi v8 BitmapText）

**主路徑**（已核實 v8 `BitmapText` 吃 `TextStyle` 並動態生成含 stroke 的字集，halo 成立）：

```
{ fontFamily: 'Noto Serif TC', fontSize: F,
  fill: TOKENS_NUM.ink900,                                              // #14120e 墨字
  stroke: { color: TOKENS_NUM.washi100, width: HALO, join: 'round' } } // #f5efe0 和紙描邊
```

- 高 DPR 下留意 BitmapText atlas `resolution`（否則 halo 略糊，非 blocker）。
- **Fallback（多餘保險，不穩才切）**：每標籤兩枚 BitmapText——底層 washi100 fill＋
  `stroke{washi100, HALO}`（純 halo），上層 ink900 fill 無 stroke。
- **計數規則（採納評審 B m1）**：`rebuildCounts.labels` **以 label id 為單位計**（每個 node/road/
  province 標籤 +1），與底/上兩枚 text 無關。`mapRendererDirty.spec` 的 `toBe(0)`/`toBe(4)` 不破。

現有三處 BitmapText（城/郡 `MapRenderer.ts:537-540` 無 fill；道路 `:572-575` fill ink900 無 halo；
省 `:593-595` 無 fill）**全部改套 §2.4 style 表**，修掉白字無 halo。

### 2.3 每 LOD 類別顯示表（維持現行閘控，僅修正呈現）

維持 `MapRenderer.ts:901-909` 的閘控邏輯，僅加 pixel-lock、halo、declutter。

| 類別             | far <0.5         | mid 0.5–1.0 | near ≥1.0 | 字級(CSS px) | fill   | halo(px)  | 備註                                                         |
| ---------------- | ---------------- | ----------- | --------- | ------------ | ------ | --------- | ------------------------------------------------------------ |
| 國名/省 province | 顯               | 隱          | 隱        | 20           | ink700 | washi 3   | 低對比大字、`letterSpacing 3`、alpha 0.85（不壓過主城/軍隊） |
| 主城 main        | 隱（僅剪影×1.4） | 顯          | 顯        | 15           | ink900 | washi 3   |                                                              |
| 支城 branch      | 隱               | 隱          | 顯        | 13           | ink900 | washi 3   |                                                              |
| 郡 district      | 隱               | 隱          | 顯        | 12           | ink900 | washi 3   | 最小可見字（art-bible §10）                                  |
| 道路 road        | 隱               | 隱          | 顯        | 12           | ink900 | washi 2.5 | 疊道路 casing 上，halo 稍薄                                  |

（對應現碼：province `!nearish`；road `detail`；main `nearish`；其餘 `nearish && detail`。）
pixel-lock 使字級恆為 CSS px，才守得住「最小 12 CSS px」（現況 far 時 world-12×0.25=3px 破規）。

### 2.4 字級/偏移常數（CSS px；新增 `LABEL_STYLE` 於**新檔** `src/ui/map/labelStyle.ts`）

> 擁有權見 §6：`LABEL_STYLE` 放**新檔** `labelStyle.ts`（S2 專屬），避免與 S1 的
> `mapViewConfig.ts` 同檔共寫。此檔 `import { TOKENS_NUM } from '../styles/tokens'`。

```
LABEL_STYLE = {
  province:     { size: 20, fill: ink700, halo: washi100, haloW: 3,   alpha: 0.85, letterSpacing: 3 },
  mainCastle:   { size: 15, fill: ink900, halo: washi100, haloW: 3,   gap: 20 },
  branchCastle: { size: 13, fill: ink900, halo: washi100, haloW: 3,   gap: 16 },
  district:     { size: 12, fill: ink900, halo: washi100, haloW: 3,   gap: 14 },
  road:         { size: 12, fill: ink900, halo: washi100, haloW: 2.5, offset: MAPVIEW.roadLabelOffset }
}
```

`gap`＝節點下方**螢幕 px** 偏移（取代現 `pos.y+18` 世界偏移）。road 沿法線偏移沿用
`roadLabelOffset=10`（世界；道路 near-only、scale≈1.25，偏移觀感穩定）。

### 2.5 輕量 declutter

**idle 判準（採納評審 A m3／B M3，`camera.isMoving` 不存在，改用實有 API）**：

```
idle = (renderer.dragPointerId === null)
    && !camera.isInertiaActive()
    && !camera.isAnimating()
```

（`dragPointerId` 為 `MapRenderer` 私有 ~line 250；`isInertiaActive()`/`isAnimating()` 為 `Camera`
公開法，已核實。）

**觸發時機（嚴禁每幀）**——在 `onTick` 內滿足下列任一即跑一次 declutter：

1. **idle 下降沿**：本幀 `idle===true` 且上幀 `false`（涵蓋拖曳放開、慣性停止、`focusOn` 補間結束）。
2. **`camera.scale` 改變**（滾輪 zoom 為一次性瞬時改 scale、無「進行中」幀，故不靠 idle，走此路徑）。
3. **`lodStage` 改變**。

平移/縮放進行中（idle=false 且無 scale/stage 變）**不跑**。

**演算法（O(可見標籤)，決定論）**：

```
1. 取當前 LOD 可見（LODvisible && cullvisible）標籤集合。
2. 依優先序排序：主城(0) > 國名(1) > 支城(2) > 郡(3) > 道路(4)；同級以 id 字典序 tie-break。
3. occupancy = Set<string>（64×64 CSS px 網格）。
4. 逐標籤（優先序）：
     (sx, sy) = camera.worldToScreen(labelWorldPos, { width: app.screen.width, height: app.screen.height })
     cell = `${floor(sx/64)},${floor(sy/64)}`
     若 cell ∈ occupancy → part.declutterHidden = true
     否則 → occupancy.add(cell); part.declutterHidden = false
5. 最終 visible = LODvisible && cullvisible && !declutterHidden。
```

- `worldToScreen(world, viewport)` **已存在**（採納評審 A m3／B m2），**必須傳 viewport 引數**
  `{ width: app.screen.width, height: app.screen.height }`——不要另寫無 viewport 版。
- **已知取捨（採納評審 A m6 為「已知取捨」，不實作 AABB）**：`floor(sx/64)` 分桶只保證同桶至多一枚；
  兩枚各在相鄰桶邊緣（x=63 與 x=65）仍可 2px 並排。art-bible §10「64×64 至多一枚完整標籤」字面
  滿足；跨格邊界微重疊列為已知取捨，本片不引入 AABB 佔用檢查（避免複雜度）。
- 與 pixel-lock 相容：declutter 用螢幕座標，縮放後於 idle/scale 變重算，一致。

---

## 3. 節點/環降噪

### 3.1 城耐久環（`sceneParts/castleNode.ts:130-155`）

| 項             | 現值                    | 新值                                                          | 理由         |
| -------------- | ----------------------- | ------------------------------------------------------------- | ------------ |
| 顯示 LOD       | 全段                    | **僅 near（detail, scale≥1.0）**，far/mid 由 `setLodStage` 隱 | 遠景不要環海 |
| 底環（track）  | —                       | ink700 alpha 0.35、寬 2                                       | 安靜底槽     |
| 耐久弧（fill） | mossBright #5c9450 寬 3 | `accentMoss #3f6b35`（非 bright）寬 2、alpha 0.9              | 降飽和降寬   |
| 半徑           | r20/15                  | r18/13                                                        | 縮一圈       |

耐久弧仍表 HP（角度＝durability/maxDurability × 2π），只是安靜。選取環（`selectionRing.ts`）維持
金色（簽名點睛，屬 ≤3% 金箔）。

### 3.2 郡節點（`sceneParts/districtNode.ts:27-123`）

| 項        | 現值   | 新值                                                       |
| --------- | ------ | ---------------------------------------------------------- |
| 顯示 LOD  | near   | **僅 near（detail）**；mid/far 隱（維持 `visibleNodes`）   |
| 半徑      | r7     | r6                                                         |
| fillAlpha | 0.7    | 0.6                                                        |
| 描邊      | ink700 | ink700 寬 1.0（world）                                     |
| 填色軌    | 旗幟軌 | **維持旗幟軌**（near-only 且視錐內數量有界，不造成全圖噪） |

### 3.3 城節點剪影

far 主城剪影 ×1.4（比照 `armyFarChipScale`，`MapRenderer.ts:895-899`）維持——**這是 overview 政治
歸屬的主要錨點（§1.3）**。支城/郡 far/mid 隱維持。填色維持旗幟軌（飽和 ensign）。

---

## 4. HUD 組裝

### 4.1 區域配置圖

**1920×1080**：

```
┌──────────────────────────────────────────────────────────────────────────┐
│▓墨帶 48px  1560年5月3日 ⛃12,340 ▲+820  🌾… ⚔…/…  ♛…      ⏸ ▶ ⏩ ⏭    ☰ │ ← ResourceBar + SpeedControl + ☰(disabled)
├────┬─────────────────────────────────────────────────────────┬───────────┤
│家紋│                                                          │通知堆疊320│ ← ReportStack, 右上, 可收合
│72×88                                                         │┌────────┐ │
│────│                                                         ││toast   │ │
│⚔ 軍│                    地圖 (hero, ≥1160×512 保底)            │└────────┘ │
│🏯 政│                                                         │           │
│👤 將│                                                         │           │
│📜 策│                                                         ├───────────┤
│    │                                                         │ MiniMap   │ ← 224², 右下
│    │                                                         │ 224×224   │
├────┴──────────────────────────────────────────────────────┴─────────────┤
│ 情境面板 ContextPanel（左右各留 space-4）×168（城/郡/軍三態） [城面板][出陣][輸送] │ ← 選取節點時滑入
└──────────────────────────────────────────────────────────────────────────┘
```

左欄 72px：頂為 **72×88 家紋塊（簽名元素）**，下接 56×56 IconButton 群（4 域）。頂墨帶 48px
ink900 底 washi 字。

**1280×720（等比 0.667 安全區）**：頂帶 32px、左欄 48px、底面板 **height=112**、MiniMap 176²、
通知堆疊 240px。地圖區保底 ≥1160×512。同結構等比縮。

**HUD 不遮主戰場**：左欄/頂帶/底面板皆貼邊，地圖 hero 淨空；金箔（選取環、家紋描金、當前速度鍵
toggled 態）合計 ≤3%。

### 4.2 ResourceBar 資料接線表（全 UI 端推導，**不改 core**）

`playerClanId = g.meta.playerClanId`；`clan = g.clans[playerClanId]`；
`budget = selectBudgetForecast(g, playerClanId)`（既有 core selector，UI 讀取合法。`BudgetForecast`
已含 `goldIncomeMonthly / salaryMonthly / policyUpkeepMonthly / foodUpkeepMonthly / harvestForecast /
foodStock / goldNetMonthly`）。

| ResourceBar prop      | 來源            | 計算                                                                                                |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `date`                | `g.time.day`    | 直接（`<time>` 內 `formatDate`）                                                                    |
| `gold`                | `clan.gold`     | 直接                                                                                                |
| `goldDelta.perMonth`  | budget          | `budget.goldNetMonthly`（**淨**）                                                                   |
| `goldDelta.breakdown` | budget          | `[{收入,+goldIncomeMonthly},{俸祿,-salaryMonthly},{政策,-policyUpkeepMonthly}]`                     |
| `foodTotal`           | budget          | `budget.foodStock`                                                                                  |
| `foodDelta.perMonth`  | budget          | `round(harvestForecast / 12) - foodUpkeepMonthly`（**淨**，與金錢語意一致，見下）                   |
| `foodDelta.breakdown` | budget          | `[{每月消耗,-foodUpkeepMonthly},{收成攤提,+round(harvestForecast/12)},{下次收成,+harvestForecast}]` |
| `soldiersTotal`       | UI 匯總         | `Σ castle.soldiers（ownerClanId===player）`（**僅駐城，與 cap 同域**）                              |
| `soldiersCap`         | UI 匯總         | `Σ castleMaxSoldiers(g, castle)（owner===player）`（`@core/domestic` 純函式）                       |
| `prestige`            | `clan.prestige` | 直接                                                                                                |

**food 淨語意（採納評審 A m1）**：金錢 perMonth 用淨（`goldNetMonthly`），糧食亦須用淨，否則
「金▲糧恆▼」＝假焦慮＋不一致。糧食淨＝把季節收成年化攤提（`harvestForecast/12`）減每月消耗；
真實脈衝在 breakdown 的「下次收成」交代。除數 `12` 為年攤（假設 `harvestForecast` 為單次收成量、
一年一穫）；若 core 收成節律不同，除數對應該節律，但頭條需與金錢同為淨語意。

**兵力量表同域（採納評審 A M1）**：初稿 `total=駐城+野戰、cap=駐城容量` → 出陣即
`total>cap`（假超編）。定稿：**分子與分母皆只計駐城**（`soldiersTotal=Σ 駐城兵`、
`soldiersCap=Σ castleMaxSoldiers`），保證 `total ≤ cap`、語意成立。野戰部隊為地圖上的軍旗 chip，
不入此量表；未來 ResourceBar 若增「出陣中 N」槽再補（非本片）。

**helper**：新 UI 純函式 `selectPlayerMilitary(g)`（放 `src/ui/hud/`，非 core）匯總駐城 soldiers/cap；
以 `makeCachedSelector`（tickSeq）包裝避免重建陣列觸發重渲染。breakdown `label` 走 `t()`（§4.7bis）。

**hud-date testid**：ResourceBar 的 `<time>` 加 `data-testid="hud-date"`（小改元件，契約保留）。
季節金字為選配增強（`formatDate` 目前西曆式、無季節）——**本片不做**，key 已預留（§4.7bis）。

### 4.3 SpeedControl 接線

`<SpeedControl speed={speed} onChange={(s)=>gameLoop.setSpeed(s)} />`（`speed` 來自 `useSession`；
`GameSpeed='paused'|'x1'|'x2'|'x5'` 與現行一致）。**testid 保留**：內 4 顆 IconButton 帶
`data-testid` `speed-pause`/`speed-1`/`speed-2`/`speed-5`——為 IconButton 加選配 `testId?` prop，
SpeedControl `options` 表補第四欄 testId（`speed===id` 驅動 `toggled`/`aria-pressed`）。放頂帶最右、
☰ 左側。

### 4.4 MiniMap 接線（onNavigate → renderer panToWorld）

- `viewport`：由 uiStore 存的 `mapCamera`（`handleMapEvent` 的 `cameraChanged` 已
  `setMapCamera({camera,width,height})`）經 UI helper `cameraToViewport(camera,width,height)` →
  `MiniMapViewport`（世界矩形）。helper 放 `src/ui/hud/`（純算，非 core）。
- **新增** `MapRenderer.panToWorld(x, y)`：`void this.camera.focusOn({ x, y })`（補間，非瞬移；沿用
  focusNode 路徑，無新 ticker）。**由 S2 在 MapRenderer 內一併加入**（見 §6）。
- `MapCanvasHost` 改 `forwardRef<MapHandle, Props>`＋`useImperativeHandle` 暴露
  `{ panToWorld }`（採納評審 B m3）。**注意**：`MapCanvasHost` 內部已有一個 `hostRef`（line 104，指
  canvas DOM），故 MainScreen 端的 ref 取別名 **`mapHandleRef`** 以免混淆；既有 mount-once effect
  冪等，StrictMode 雙掛載無害。
- `onNavigate={(x,y)=>mapHandleRef.current?.panToWorld(x,y)}`。
- `size`：`window.innerWidth > 1440` → `UI.minimapSizePx`(224)；`≤1440` → 176（MiniMap 已收 `size`
  prop）。testids `minimap`/`-base`/`-frame` 不動。

### 4.5 左欄 IconButton（4 域）

72×88 家紋塊（`Icon flag` 或勢力色塊＋描金邊，簽名）在頂；下方 56×56 IconButton 群，**testid
契約保留**，四域**皆已接線、全部顯示**：

| 域   | testid（保留）  | icon   | onClick（維持現行語意）                                       | 狀態   |
| ---- | --------------- | ------ | ------------------------------------------------------------- | ------ |
| 軍事 | `rail-military` | sword  | `openMarch(marchOriginId)`；`disabled={marchOriginId===null}` | 已實作 |
| 內政 | `rail-domestic` | castle | `openPanel('castle', { castleId: homeCastleId })`             | 已實作 |
| 武將 | `rail-officers` | people | `openPanel('officers')`                                       | 已實作 |
| 政策 | `rail-policy`   | scroll | `openPanel('policy')`                                         | 已實作 |

IconButton `toggled` 反映對應 panel 是否為 `topPanel`。**左欄與 ContextPanel 快覽鈕是 panelStack
（完整面板）的唯一入口**（見 §4.6）。

### 4.6 ContextPanel 三態（底部情境面板）＋ 點擊語意修正

**點擊語意修正（採納評審 A B1，blocker）**：現行 `handleMapEvent`（`MainScreen.tsx:264-272`）點城/郡
**同時** `setSelection` **和** `openPanel`，照初稿接上 ContextPanel 會雙開（底部 ContextPanel ＋
topPanel 完整面板）。定稿改寫：

```
nodeClick(castle):  store.select({kind:'castle', id});  uiActions.setSelection({kind:'castle', id});   // 只開 ContextPanel
nodeClick(district):store.select({kind:'district', id});uiActions.setSelection({kind:'district', id});  // 只開 ContextPanel
// 移除點擊時的 uiActions.openPanel(...)；完整面板改由 ContextPanel 快覽鈕與左欄開啟。
```

**版位不衝突（已核實）**：完整 `CastlePanel`/`DistrictPanel` 為**左上浮層**
（`CastlePanel.module.css`：`position:fixed; left:84px; top:60px; width:480px`），ContextPanel 為
**底部滑入**（`left/right: space-4; bottom:0`）。兩者物理不重疊。但 CastlePanel/DistrictPanel 現用
**未定義的 `var(--z-panel)`**（tokens 的 zIndex 表無 `panel` 項）→ 疊放序不定；**必須修**（§5）：
補 `zIndex.panel=200` token 使完整面板（200）疊於 ContextPanel（`--z-hud`=100）之上、map 之上、
dropdown（500）之下。

ContextPanel＝**快速選取條**（`open = selection!==null`），由 `uiStore.selection` 驅動；panelStack
續驅動完整面板。用既有 `ContextPanel`（`variant="ornate"` Panel）＋既有 `StatBar`。

| selection.kind | title        | 內容（快覽）                 | 動作鈕（actions）                                                                                                                                                                                                   |
| -------------- | ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| castle         | 城名＋國     | 兵/糧/耐久/士氣 迷你 StatBar | `[城面板]`→`openPanel('castle',{castleId})`；`[出陣]`→`onOpenMarch`（比照 `marchOriginId` 條件：玩家直轄且 `corpsId===null`，否則 disabled）；`[輸送]`→**disabled**（M8，`title=t('ui.context.transport.locked')`） |
| district       | 郡名＋所屬城 | 石高/商業/人口 迷你列        | `[郡面板]`→`openPanel('district',{districtId})`                                                                                                                                                                     |
| army           | 部隊名/主將  | 兵數/補給日/去向             | `[部隊面板]`→**disabled/匿**（後續里程碑）；以顯示資訊為主                                                                                                                                                          |

`onClose`→`uiActions.setSelection(null)`。`height=168`（≥1440）／`112`（<1440）；**寬度沿用元件既有
`left/right: space-4` 為流體**（不寫死 1536，故 1280 不溢出，採納評審 A m5——現 CSS 已流體，僅補
height 斷點）。

### 4.7 ReportStack（可收合）＋☰

- ReportStack 現已接線（`reportToasts`），移至右上 320px（1280 檔 240px）；加**收合鈕**
  （`IconButton chevronUp/Down`，本地 `useState collapsed`；收合時只留計數 pill
  `t('ui.hud.reportCount',{count})`）。testid 沿用。
- **☰ 系統選單**：頂帶最右 `IconButton gear`（`ariaLabel=t('ui.system.menu')`），**M8 前 `disabled`**
  占位，不接功能。

### 4.7bis 新 i18n key（走 `t()`，繁中台灣慣用；加入 `src/i18n/zh-TW.ts`）

```
'ui.hud.income': '收入',
'ui.hud.salary': '俸祿',
'ui.hud.policyUpkeep': '政策維持',
'ui.hud.foodConsume': '每月消耗',
'ui.hud.harvestAmortized': '收成攤提',
'ui.hud.harvestNext': '下次收成',
'ui.hud.reportCount': '通報 {count} 則',
'ui.context.transport.locked': '輸送尚未開放',
'ui.context.castle.panel': '城面板',
'ui.context.district.panel': '郡面板',
'ui.system.menu': '系統選單',
// 選配（本版不接，季節字預留）：
'ui.season.spring': '春', 'ui.season.summer': '夏', 'ui.season.autumn': '秋', 'ui.season.winter': '冬',
```

（`ui.minimap.ariaLabel`、`ui.hud.gold/food/soldiers/prestige`、`ui.speed.*`、`ui.rail.*` 已存在，沿用。）

---

## 5. CSS 修繕清單

**未定義 var 修正**（tokens 無 `--accent-red`/`--danger`；正確為 `--accent-vermilion`/`-bright`）：

| 檔案:行                                                   | 現值（壞）          | 改為                                                              |
| --------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `panels/CastlePanel.module.css` `.primary background`     | `var(--accent-red)` | `var(--accent-vermilion)`（出陣鈕實心朱底＋washi 字，修「隱形」） |
| `panels/CastlePanel.module.css` `.error color`            | `var(--danger)`     | `var(--accent-vermilion-bright)`                                  |
| `panels/DistrictPanel.module.css` `.danger accent-color`  | `var(--accent-red)` | `var(--accent-vermilion)`                                         |
| `panels/DistrictPanel.module.css` `.warning,.error color` | `var(--danger)`     | `var(--accent-vermilion-bright)`                                  |

以 `grep -rn "accent-red\|--danger" src/ui` 掃全確保無漏。art-bible §9 錯誤/危險語意用 vermilion 家族。

**z-index token 補全（採納探勘新發現）**：`CastlePanel.module.css` L3／`DistrictPanel.module.css` 用
`var(--z-panel)`，但 `tokens.ts` 的 `zIndex` 表**無 `panel`**、`injectCssVariables` 亦**未注入
`--z-panel`** → 現為未定義（疊放序不定）。**修**：`tokens.ts` `zIndex` 加 `panel: 200`，
`injectCssVariables` 加 `['--z-panel', String(z.panel)]`。使完整面板（200）疊於 ContextPanel
（`--z-hud`=100）之上、dropdown（500）之下。**此改屬 tokens.ts，歸 S1**（見 §6）。

**一致化小改**：

- `.primary` hover/active 態補 `--accent-vermilion-bright`（現無互動回饋）。
- ResourceBar `<time>` 補 `data-testid="hud-date"`。
- 頂帶/左欄/底面板/通知/MiniMap 分別 top/left/bottom-center/top-right/bottom-right 定位、彼此不重疊；
  頂帶/左欄/通知/MiniMap 用 `var(--z-hud)`，完整面板用 `var(--z-panel)`。

---

## 6. 切片計畫（定序 S1 → S2 → S3；不宣稱可平行）

**為何定序（採納評審 B M1／M2）**：三片共寫同一組 visual baseline PNG（`e2e/visual.spec.ts:87`
`toHaveScreenshot(page)` 全頁截圖，preset overview/operational/close，各 darwin+linux 兩份，共
6 檔），且初稿對 `LABEL_STYLE`（§2.4「S2 專屬」vs §6「S1 補齊」）與 `MapRenderer.ts` 擁有權自相
矛盾。定稿以**明確檔案擁有權 + 定序**消除衝突，並把 baseline 重生抽為獨立收尾步驟。

**檔案擁有權（互斥，逐片交棒）**：

| 片  | 擁有檔案                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `styles/tokens.ts`、`map/territoryGrid.ts`、`map/mapViewConfig.ts`、`tests/ui/territoryGrid.spec.ts`                                                                                                                                                                                                                                                                       |
| S2  | `map/MapRenderer.ts`、`map/lod.ts`、`map/labelStyle.ts`（新檔）、`map/sceneParts/castleNode.ts`、`map/sceneParts/districtNode.ts`、`map/camera.ts`（僅若需 `isIdle` 輔助，見下）                                                                                                                                                                                           |
| S3  | `screens/MainScreen.tsx`、`components/ResourceBar/*`、`components/SpeedControl/*`、`components/IconButton/*`、`components/ContextPanel/*`（消費）、`components/ReportStack/*`、`map/MapCanvasHost.tsx`、`screens/panels/CastlePanel.module.css`、`screens/panels/DistrictPanel.module.css`、`i18n/zh-TW.ts`、`hud/`（新 helper `selectPlayerMilitary`/`cameraToViewport`） |

- `mapViewConfig.ts` **僅 S1** 動（`borderInk`/`borderInkMix`、移除 `borderDarken`）；`LABEL_STYLE`
  不放此檔，放 S2 的新檔 `labelStyle.ts`。S2 對 mapViewConfig **只讀**。
- `MapRenderer.ts` **僅 S2** 動（label/LOD/節點/`panToWorld`/`worldToScreen` 呼叫全在此）。S3 只從
  `MapCanvasHost` 調用 `panToWorld`。
- `camera.ts`：`worldToScreen`/`isAnimating`/`isInertiaActive` 已足夠；declutter 的 idle 用
  `renderer.dragPointerId + isInertiaActive + isAnimating` 組合，**無需**改 camera（若實作者為可讀性
  想加純算 `isIdle()`，允許，屬 S2、不碰 core）。

### S1 — palette / territory（勢力色雙軌 + 紙墨邊）

- **內容**：新增 `clanDyeHsl/Hex/Num`（§1.3，s25、L 67/53）；territoryGrid base 改 `clanDyeNum`、
  `darkenPixel`→紙墨邊混合 + 角落 once-guard（§1.4）；mapViewConfig 移除 `borderDarken`、加
  `borderInk`/`borderInkMix`；tokens 加 `zIndex.panel=200`＋`--z-panel` 注入（§5）。**不動**
  `clanColorHsl`。
- **測試（採納評審 B B1，硬 DoD）**：`tests/ui/territoryGrid.spec.ts` 納入 S1。改寫
  L188 斷言為「交界 cell 朝 `borderInk` 以 `borderInkMix` 混合後的預期 RGB」（由新常數推導，不寫
  魔法數）：`expectedLeft.c = round(oda.c*(1-borderInkMix) + inkC*borderInkMix)`，`c∈{r,g,b}`，
  `a=255`；L201 改讀 `MAPVIEW.colors.borderInk/borderInkMix`；「right 側 ≠ left」「untouched 不變」
  斷言維持。territoryGrid.spec **必綠** 為 DoD。
- **驗收**：領地薄染、地形浮雕透出、邊界暖墨線非霓虹；**近景截圖**確認無角落近黑噪點、海岸為毛筆
  線（採納評審 A m4）；40 家由奇偶 Δ14＋墨邊分界，精確歸屬留給節點/剪影/標籤；旗幟/HUD/節點色不變。
- **受影響 baseline**：overview/operational/close 三段領地色會變＝預期（收尾統一重生，見下）。golden
  不受影響（core 未動）。

### S2 — labels / LOD / 節點（像素鎖定 + halo + declutter + 環降噪 + panToWorld）

- **內容**：per-label container 反向縮放（§2.1，`camera.scale` 變才更新、新建即套 `1/scale`、
  `buildStaticDataLayers` 尾設 `lastLabelScale=NaN`、不增 rebuildCounts）；label style
  ink900+washi halo（§2.2，計數以 label id 為單位）；`LABEL_STYLE` 新檔（§2.4）；LOD 表維持＋
  pixel-lock 字級（§2.3）；declutter（§2.5，idle/scale 變/lodStage 變觸發、`worldToScreen(p,
viewport)`、64×64 bucket）；環/郡節點降噪（§3）；`MapRenderer.panToWorld`（§4.4）。
- **驗收**：近景字不再爆大（恆 CSS px）、白字消失（墨字 washi halo）、密集區每 64px ≤1 標籤、耐久環
  near-only 且安靜、郡點降噪、MiniMap 可 panToWorld。
- **測試**：`mapRendererDirty.spec` **必綠**（無變更 tick 零重建、owner 翻轉只重畫 territory、移動只
  reposition——反向縮放/declutter 走 camera-dirty、不增 rebuildCounts；fallback 兩枚 text 仍以 label
  id 計數）。close/operational baseline 會變＝預期。

### S3 — HUD（組裝既有元件 + CSS 修繕）

- **內容**：ResourceBar/SpeedControl/MiniMap/左欄 IconButton/ContextPanel/ReportStack 全接線（§4）；
  `handleMapEvent` 點擊只 `setSelection`（§4.6）；CSS 修繕（§5，含 `--z-panel` 引用生效）；新 helper
  `selectPlayerMilitary`/`cameraToViewport`；`MapCanvasHost` forwardRef（§4.4）。
- **驗收**：頂墨帶＋左家紋軍議桌感、出陣鈕實心朱底可見、四域鈕與速度鍵 pop、MiniMap 導航、通知可
  收合、☰ disabled 占位、點城只開底部快覽條（不再雙開）；所有契約 testid 在。
- **測試**：`MainScreen.spec.tsx`（testid 全保留＝綠；新元件 render 斷言按需補）、MiniMap spec（不破，
  onNavigate 語意不變）。HUD baseline 會變＝預期。

### 收尾（序列化，非任一片 DoD）——採納評審 B M1

三片全 land 後**一次**重生 visual baseline：本機（darwin）`playwright ... --update-snapshots` 生
darwin 半；CI/docker（linux）生 linux 半。6 個 PNG 是三片共享可變產物，不得在單片 DoD 內宣稱綠。

---

## 7. 硬約束核對

- **core 不動**：接線走既有 selector（`selectBudgetForecast`/`selectMiniMapModel`/`castleMaxSoldiers`/
  `g.meta.playerClanId`）與 UI 端匯總；雙軌色、標籤、HUD 全在 `src/ui/**`。golden byte-identical。
- **e2e testid 不動**：全數在遷移後元件保留（§4.2–4.6）。
- **i18n**：新字串全走 `t(key)`（§4.7bis，繁中台灣慣用、無簡體/日文新字體，過 `validate:data`）。
- **效能**：反向縮放僅 scale 變時更新可見標籤；declutter 僅 idle/scale/stage 變（非每幀）；territory
  僅 owner dirty 重繪；節點/環為靜態 `setLodStage` 切換。無每幀全量重算。

---

## 8. 設計決策記錄（回寫指引）

實作落地後，依 CLAUDE.md 於對應 plan 文件 §8 回寫：勢力色雙軌與紙墨邊 → `plan/04` §8；標籤
pixel-lock/halo/declutter 與節點降噪 → `plan/04` §8（交叉引用 art-bible §10）；HUD 組裝/資料接線/
ContextPanel 點擊語意 → `plan/11` §8（交叉引用 `plan/12`）。本檔為 M6-V9 實作單一真相，plan 回寫
以交叉引用本檔為主。

---

## 9. 評審裁決

### 接受（修訂已納入）

- **A-B1（blocker）**：點城/郡雙開 ContextPanel 與完整面板。→ §4.6 改寫 `handleMapEvent` 點擊只
  `setSelection`；完整面板僅由快覽鈕/左欄開啟。並核實兩者版位不重疊、補 `--z-panel`。
- **A-M1**：`soldiersTotal/soldiersCap` 跨域（出陣即 total>cap 假超編）。→ §4.2 分子分母皆只計駐城，
  野戰另計（本片不顯槽）。
- **A-M2**：染紙軌第二通道 Δ8 於 alpha 壓縮後低於 JND、色弱不成立、40-way 過度樂觀。→ §1.3 奇偶
  Δ8→**Δ14**（L 67/53）；改寫為「overview 歸屬由 far 主城剪影 ensign 承擔，染紙只答有主/無主/家系」。
- **A-m1**：食糧顯毛消耗、金錢顯淨，紅箭恆亮不一致。→ §4.2 糧食改淨（`harvestForecast/12 - 消耗`）。
- **A-m3**：declutter 依不存在的 `camera.isMoving`、`worldToScreen` 漏 viewport 引數。→ §2.5 idle 改
  `dragPointerId + isInertiaActive + isAnimating`；`worldToScreen(p, viewport)` 補引數。
- **A-m4**：紙墨邊角落雙混近黑、海岸/中性邊未評估。→ §1.4 角落 once-guard（至多混一次）；海岸/中性
  上墨明訂為刻意 sumi-e；加近景截圖驗收。
- **A-m5**：1280 檔 ContextPanel 寬度未定（1536 溢出）。→ §4.6 沿用元件既有 `left/right:space-4`
  流體寬（實測現 CSS 已流體），僅補 height 斷點 168/112。
- **B-B1（blocker）**：移除 `borderDarken` 打爆既有 `territoryGrid.spec` 且該檔未納 S1。→ §6 納入
  S1 owned-files，改寫斷言以 `borderInk/borderInkMix` 推導，列必綠 DoD。
- **B-M1**：三片共寫 6 張 visual baseline，非可平行；雙平台維護未交代。→ §6 baseline 重生抽為序列化
  收尾步驟（darwin 本機 + linux CI 各一）。
- **B-M2**：`mapViewConfig`/`MapRenderer` 跨片共寫、`LABEL_STYLE` 擁有權矛盾。→ §6 定序
  S1→S2→S3；`LABEL_STYLE` 移入新檔 `labelStyle.ts`（S2）；`MapRenderer` 僅 S2。
- **B-M3**：declutter idle 依不存在 API、離散 zoom 無停止下降沿。→ §2.5 idle 定義同 A-m3，另加
  「scale 變/lodStage 變」觸發覆蓋滾輪 zoom。
- **B-M4**：反向縮放守衛漏更 setMapData 後新建 container。→ §2.1 新建即套 `1/scale` +
  `lastLabelScale=NaN` 哨兵強制重設。
- **B-m1**：fallback 兩枚 BitmapText 破壞 label 計數斷言。→ §2.2 `rebuildCounts.labels` 以 label id
  為單位。
- **B-m2**：`worldToScreen` 已存在且需 viewport。→ §2.5 更正呼叫簽名、刪「若無則新增」。
- **B-m3**：`MapCanvasHost` 非 forwardRef、內部已有 `hostRef`。→ §4.4 改 `forwardRef<MapHandle>`、
  MainScreen 端 ref 別名 `mapHandleRef`。

### 拒絕（附理由）

- **A-M2 之補救選項 (a)「逐節點加家紋符號/紋樣 CVD 通道」**：拒絕。超出本片「接既有元件、克制」範圍
  且需新美術資產；改採 reframe（歸屬歸 ensign 剪影/節點/標籤）＋奇偶 Δ14，已足以承擔 CVD 第二軸。
- **A-m6 之補救「改用標籤 AABB 佔用/相鄰桶邊界檢查」**：拒絕（實作）。保留 64×64 bucket；跨格邊界
  2px 微重疊列為已知取捨，art-bible §10「64×64 至多一枚完整標籤」字面已滿足，AABB 複雜度不划算。

### 查證後撤回（評審自撤，供參，無需動作）

- Pixi v8 BitmapText stroke/halo 主路徑成立（fallback 為多餘保險）；ResourceBar 資料 core 全拿得到；
  testid/speed 模型一致可守；反向縮放/declutter 與 `mapRendererDirty.spec` 零重建契約相容
  （`applyLodAndCulling` 只由 `onTick` 呼叫、不動 `rebuildCounts`）。
