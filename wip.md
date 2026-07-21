# WIP — 實作交接文件（更新 2026-07-22）

> 給下一個接手的 AI／未來 session：本文件描述《天下布武》**實作階段**的當前進度與剩餘工作。
> 規格階段已於 2026-07-11 收斂完成（21 份 plan 定稿、E-01…E-80 全數消化、七輪裁決記錄於 `plan/02 §8`）。
> 2026-07-14 依使用者「優先優化繪圖與圖示」指示，追加 M6-V 視覺阻斷工作串流與 M6-V1 原創視覺規範。
> 讀本文件＋`CLAUDE.md`＋`plan/18-roadmap.md` 即可無縫接續。

## 執行模式（使用者指示，多次重申）

- **模型分工（2026-07-17 現行）：Fable orchestrate；Sonnet 實作一般任務；Opus 設計／複雜任務／code review。**
  （2026-07-14 前曾用 GPT-5.6-sol/terra 分工，已由使用者本輪指示取代。）
- 以 Workflow 多 agent 編排；每個里程碑：實作 → Opus 全量 review（fix-forward）→ orchestrator 本機驗證 DoD → 依任務 ID 分組 commit → checkpoint（README 進度表＋milestone.json＋tag）→ push（已核准，push 後驗 CI/Pages）。
- **2026-07-13 最新覆寫：後續 review 不使用 Codexmon；由 orchestrator 自行 code review 即可。**
- **一次只做一個里程碑階段，完成後停下（使用者 2026-07-12 指示：勿先開下一階段）。**
- ⚠ 使用者額度（5 小時窗口）常中斷 agent 艦隊：接手時先 `git status` 看未 commit 的部分產出——**通常品質良好，核實後續作，勿 reset**；workflow 可用 `resumeFromRunId` 續跑（已完成 agent 走快取）。
- **2026-07-17 使用者指示：session 用量達 75% 即暫停 agent 艦隊，等 5 小時窗口重置再續**。
  orchestrator 無法直接讀用量表，以代理訊號執行：任一 agent 撞 limit 錯誤＝立即停（收攏已
  commit 狀態、更新本檔）；session 已跑數小時時傾向「收尾當前階段」而非開新階段；暫停期以長
  wakeup 待機，重啟艦隊前先以單一 trivial agent 探測額度。

## MVP 交付記錄（2026-07-22；使用者指示「先完成可通關 MVP，再回頭照 plan 補完」）

使用者 2026-07-22 指示：**先把遊戲做成可通關的 MVP，之後再回到 plan 補完整版**；每步獨立
commit、每步 ≤2000 LOC（盡量 ≤1000）、每步不破壞整體。四步全數 landed（直接 commit main）：

| Commit            | 內容                                                                                                                                                                                                                           | 提前自              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `68b84c0` [MVP-1] | 勝敗判定 victorySystem（Step 12：滅亡收尾安全網／no-heir·no-castle 敗北／天下統一／天下人 12 月＋山城國空集防真空）＋acknowledgeGameOver＋EndingScreen＋App 接線；BAL victory* 2 常數                                          | M8-9/M8-10          |
| `c045dc3` [MVP-2] | 最小大名 AI：M1 排程器接上評定本體回呼；每月至多一次出陣（最強城→最弱可及敵城、persona.aggression 調門檻、守軍/糧秣保留、走玩家同一 validate/apply 管線、零亂數決定論）；BAL ai* 7 常數                                        | M7（09 §3.4 子集）  |
| `e4b711f` [MVP-3] | 存讀檔：core/save codec（SaveFile 信封＋錯誤碼＋invariants 深度防線）＋遷移框架（v1 空鏈）＋app localStorage 槽位 auto:1/quick:1＋月結自動存檔（autosaveDue hook）＋標題「繼續」＋Ctrl+S/F9＋gameEpoch 強制 MainScreen remount | M8-12/13/14/17 子集 |
| `20efe4d` [MVP-4] | 修復模擬抓到的既有 INV-18（關押城易主/捕獲方滅亡）→ releaseOrphanedCaptives 四結算點清掃                                                                                                                                       | —（缺陷修復）       |

- **golden/replay 刻意更新兩輪**（MVP-1 stats 寫入＋BAL、MVP-2 AI 活動）：golden-mini day360/720、
  m4 replay finalHash 重算；policy replay 與 battle transcript 僅 BAL hash（重放驗證 checkpoint 不變）。
- **通關性驗證**（scratchpad 模擬）：s1560 全 AI 2 年（seed 7）＝6 場野戰、20 次落城、41→12 家存活、
  validateState 0 違規；tiny 雙勢力對稱體質會僵持（AI 攻擊門檻 1.5× 對稱成長打不動）——正常，
  通關動力來自玩家主動征服；平衡（AI 併吞速度偏快）留 M9-2 simulate 調。
- **MVP 已知簡化**（回 plan 補完時的抵充清單）：battlesFought/Won 統計在 Step 12 直接消費
  battle.ended（M8-3 事件引擎落地時遷回 Step 3 hook）；存檔介質 localStorage（M8-13 換
  idb-keyval＋lz-string，鍵名契約已按 16 §3.2 固定）；槽位僅 auto:1/quick:1（無 manual、無季輪替）；
  quick load 用 window.confirm、無 toast（M8-20 SystemMenu/存讀檔 UI）；AI 無內政/外交/反應層
  （M7）；EndingScreen 無天下人進度 UI。
- **bench**：mean 0.46ms（AI 前 0.30）、p99 ~8ms（評定日尖峰＝buildMapGraph per council）；
  M9-4 若需壓 p99，先做「graph 每 tick 共用」再談其他。
- gate 全綠基準：**1472 tests**／e2e 5/5（visual baseline 未動）／typecheck/lint/validate:data/build。
- **下一步＝回到 plan 補完整版**：依 18 §3.9.1 續作 M6-V9（HUD 組裝）→ V10 → V11 gate，
  再開 M6 功能（M6-1…依賴 M6-V11 不變）；MVP 先行件於對應完整任務（M7 AI 四階段、
  M8 事件/存讀檔/畫面）落地時以完整版取代，抵充清單見上。V8 review 債與 V11 視覺 gate
  收緊（見下方 M6-V8 記錄）仍在。

## 目前進度（里程碑）

| 里程碑        | 狀態                                    | 備註                                                                                                                                |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| M0 鷹架       | ✅ 已 checkpoint（tag m0）              | CI 五 job 綠、Pages 200（https://tigercosmos.github.io/tenka-fubu/）                                                                |
| M1 core＋HUD  | ✅ 已 checkpoint（tag m1）              | 431 tests；型別=02 全型別零缺失（46 Cmd/68 Event）                                                                                  |
| M2 資料＋地圖 | ✅ 已 checkpoint（tag m2，2026-07-12）  | 792 tests＋P1/P2 e2e 綠；DoD 四條全過（review 報告見 wf_dcccc2d1-835）                                                              |
| M3 內政       | ✅ 已 checkpoint（tag m3，2026-07-13）  | 845 tests＋P1/P2/P3 e2e 綠；24 個月 DoD、全量 review 與 checkpoint 後 review 收尾（73bc28f）完成                                    |
| M4 軍事一     | ✅ 已完成（2026-07-13）                 | 945 tests＋P1/P2/P3 e2e；19 tick 織田—齋藤 DoD、golden/replay、bench 與 review fix-forward 全綠                                     |
| M5 合戰       | ✅ **已完成（2026-07-14）**             | 1011 tests、P1/P2/P3/P5、golden/transcript、bench、自行 review 與 checkpoint gate 全綠                                              |
| M6            | 🎨 M6-V 進行中，**M6-V1～M6-V8 已完成** | M6 功能尚未開工；使用者 2026-07-17 以「地圖要像真的遊戲（缺城／軍／路／城市／地形）」授權 V5–V8 整串視覺鏈，V6/V7/V8 設計已平行產出 |
| M7–M9         | ⬜                                      | 依 `plan/18-roadmap.md`                                                                                                             |

## M6-V 視覺優先工作串流（2026-07-14）

使用者要求優先改善繪圖與圖示：現況缺少正式地形、水系、道路、城池與軍隊呈現，HUD 亦仍是簡化版；並要求研究
《信長之野望・新生》的公開遊戲畫面，把美術設計與圖層系統納入既有開發計畫。研究只萃取資訊層級、縮放策略與
操作回饋，禁止複製其版面、圖示、模型、貼圖、肖像、色彩數值或其他具體資產。

### 已完成並推送

- 分支：`agent/m6-visual-roadmap`；M6-V1 之 PR #1 已於 2026-07-14 merge 進 main（merge commit d698937）。
- M6-V2 起改走 draft PR #2：<https://github.com/tigercosmos/tenka-fubu/pull/2>（同分支續推）。
- `d46fc40 docs(plan): 排入 M6-V 視覺基礎工作串流`：更新 `plan/01`、`04`、`11`、`12`、`17`、`18` 與
  `plan/README.md`，在 M6 功能前加入 M6-V1～M6-V11。地圖規劃擴為 13 個 visual domain layer、
  overview／operational／close 三段 LOD，並加入素材、授權、visual regression、55fps、記憶體與無障礙 gate。
- `06e5af7 docs(visual): 建立 M6-V1 原創視覺規範`：新增 `docs/visual/art-bible.md` 與
  `docs/visual/references.md`。Art Bible 已定義色盤、材質、光照、五類地圖物件、六族 UI icon、城池／軍隊
  視角、HUD safe area、禁抄規則與現況差距；reference board 登錄 10 筆官方公開參考入口，每筆都有來源、
  抽象觀察、原創轉譯與不可直接沿用內容，repository 未收錄任何參考截圖或外部資產。

### M6-V1 驗證與現況差距

- `git diff --check`、兩份文件 Prettier、`npm run validate:data` 全綠：劇本 0 ERROR／0 WARN、簡體字／新字體
  0 筆、字型涵蓋率通過；reference board 的 9 個唯一官方 URL 均回傳 HTTP 200。
- 現行 production 仍是 8 層 renderer、平面陸地、far LOD 隱藏道路、城／郡占位 marker、24 枚 icon 與
  inline-style 簡化 HUD；這些是 M6-V2～V9 的待實作範圍，不得把 M6-V1 文件交付誤認為畫面已完成。

### M6-V2 完成記錄（2026-07-16）

執行模式依使用者本輪指示：Fable orchestrate、Sonnet 實作、Opus 複雜任務與 code review。

- **core fixture**：`src/core/debugVisual.ts`（`debug-visual-map-01`）——自包含 ScenarioInput、固定種子；
  3 勢力（織田／今川／齋藤）、5 城（2 main＋2 branch＋齋藤本城）、10 郡、14 條街道（grade 1/2/3 齊、
  含 1 條海路）、9 支敵我軍（2 支多節點行軍中、圍城中、holding 混合）、對駿府城（`VISUAL_ANCHOR_CASTLE_ID`）
  的進行中圍城（真實 `beginSiege`）、1 支軍供糧 5 日＜`BAL.autoReturnFoodDays`(7) 觸發補給警告、1 筆
  `siege.started` Report。城／郡座標沿用 s1560 實座標（清洲/駿府/掛川/稻葉山→岐阜），全節點經
  point-in-polygon 驗證在 `japan-outline.json` 陸地上（territory 層是陸地限定 Voronoi，落海即無領色）。
- **app 接線**：`?debug=visual-map`（`DebugFlags.visualMap`，優先於 `skipTitle`，忽略 `?seed`、速度
  paused）；`bootVisualMapGame()` 一次性 stage 選取行軍軍隊＋路徑預覽；`MapRenderer.setCameraPose()`／
  `waitForIdleFrames()`（destroy 時 resolve 未決 waiter）；`debugMapBridge` 登記活 renderer；
  `TenkaDebugApi` 增 `setMapCameraPreset('overview'|'operational'|'close')`（三段都以錨點城為中心，
  scale 取 `MAPVIEW.visualOverviewScale/visualOperationalScale/visualCloseScale`＝0.25/0.5/1.25）與
  `waitMapIdle()`。
- **e2e harness**：`e2e/visual.spec.ts`（1280×720、DPR 1、`reducedMotion:'reduce'`、`document.fonts.ready`
  →`waitMapIdle`（`expect.poll` 吸收 renderer 登記競態）→三段截圖）；`toHaveScreenshot`
  `maxDiffPixelRatio 0.01`；本平台無 baseline 且未設 `UPDATE_VISUAL=1` 時明確 skip。新 scripts：
  `e2e:visual`、`e2e:visual:update`。
- **baseline 按平台分檔提交**（獨立 commit）：darwin 本機產、linux 以 `mcr.microsoft.com/playwright:v1.61.1-noble`
  Docker 產（同 CI 環境；容器內 compare 重跑 1 passed 確認可重現）。
- **字型缺口修復**：`tools/font-charset.ts` 加掃 `debugVisual.ts` 字串字面量（fixture 名稱走 BitmapText
  直接進截圖，原掃描涵蓋不到，雪/鳴/阜會靜默 tofu）；`font:subset` 重產 885→899 字元、193.1 KB。
- **Opus 全量 review** 2 findings 均收斂：e2e idle 等待競態（已改 `expect.poll`）、字型缺字（上項）。
  另修 fixture 落海問題（Sonnet 收尾 agent，見座標記錄）。plan/17 §8 新增第 22 條四項裁決
  （地形/橋樑遞延 M6-V5/V6、s1560 實座標、跨平台 baseline 策略、字型掃描範圍）。
- **gate**：lint、typecheck、validate:data（0 ERROR／0 WARN／簡體 0、字型涵蓋通過）、**1040 tests**、
  Playwright 5/5（P1–P3、P5＋visual）、production build 全綠。現況已知（非 M6-V2 回歸）：頁面底部
  露出 washi 背景條（既有版面問題，M6-V9 HUD 組裝時處理）、領地色淡、標籤重疊、far LOD 資訊稀
  ——皆為 M6-V3～V9 的待改善「before」基準。

### M6-V3 完成記錄（2026-07-17，commit c7a930f，直接 commit main——依使用者 no-PR 指示）

執行模式：Fable orchestrate、Sonnet 實作（3 平行 slice）、Opus 設計／整合／全量 review。

- **manifest**：`src/ui/assets/manifest.ts`——12 §3.7 逐字 `VisualAssetManifestEntry`＋5 筆
  project-original 素材（washi 材質 256²＋512² 母檔、程序生成方位盤 SVG、平城／山城／軍旗 atlas
  glyph）；contentHash 全為實算 sha256（texture/svg＝runtime 檔、atlas＝source frame，三方核對）。
- **工具鏈**：`tools/gen-assets.ts`（固定種子 LCG、wrap 週期雜訊、雙跑 byte-identical）；
  `tools/build-atlas.ts`（id 二進位升冪＋shelf packing＋≤2048 分頁＋頁裁最小 2 次方＋pngjs
  決定性編碼；產物 checked-in：`atlas-map-0.png` 128²＋`atlas.frames.json`）；
  `tools/validate-assets.ts`（A01–A16：授權 fail-closed、public/assets 反向掃描、hash 核對、
  記憶體重建比對（不比頁 PNG bytes，跨平台安全）、8 MiB 首屏預算=`UI.initialVisualAssetBytesMax`、
  dist 存在時掃 source 洩漏）。新 scripts：`gen:assets`／`atlas:build`／`validate:assets`（CI unit
  job 新 step）。source 工作檔隔離於 `tools/assets/visual/source/`。
- **loader**：`src/ui/assets/loader.ts`＋`src/app/visualAssetsBoot.ts`——Pixi Assets 以 id cache、
  模組級 refcount 共享 atlas 頁、歸零才 unload、sub-Texture `destroy(false)`、await 後 disposed
  檢查；App 進 main 畫面首屏預熱（StrictMode 安全 singleton）。新 devDeps：pngjs＋@types/pngjs。
- **review**：Opus 4 lens＋對抗驗證——8 findings 僅 2 確認（皆文件交叉引用錯誤，已修＋回歸測試）；
  6 rejected 各有具體上游防線（acquireMany 循序、disposeFirstScreenAssets 無呼叫者、manifest 為
  checked-in 信任源等）。
- **gate**：lint／typecheck／validate:data／validate:assets（首屏 156.8 KiB／8192 KiB）／
  **1109 tests**／build＋dist 無 source 洩漏／e2e 5/5（visual baseline 不變）全綠；DoD 現場驗證
  （塞未登錄檔→A12 ERROR exit 1）。push 後 CI／Deploy 綠、Pages 200、atlas 於 Pages 子路徑 200。
- plan/12 §8 新增 D16–D28 決策；`docs/visual/references.md` 登錄 5 筆素材（禁抄來源＝無）。

### M6-V4 完成記錄（2026-07-17，commit 949a3af）

執行模式同上（A core／B renderer 平行 → C 接線 → Opus 整合＋review）。

- **core 契約（04 §4.6 全量）**：`selectMapViewModel` 補 castles[]（durability／maxDurability／
  tier／terrainKind='plain' 佔位／siegeMode／warning 由圍城推導 assault→critical、
  encircle→threatened）、armies[]（fromNode/toNode/edgeT、morale、foodDays 沿用
  `BAL.fieldFoodPerSoldierDaily`、status/mission/corps）、battles[]／sieges[] 並存、analysisMode；
  `selectMapStaticModel` 補 names（城/郡/勢力/省）＋provinceLabelPos。
- **關鍵裁決 D1**：道路 `name/waypoints` 只進 transient `MapGraph`（`MapRoadEdge`＋`buildMapGraph`
  optional 第 4 參數），**不進 GameState**——golden hash byte-identical（嚴禁為此 golden:update）。
  waypoints V4 只攜帶，`drawRoads` 一行未改（V6 才消費）。
- **dirty update**：`redrawDataLayers` 拆為 `buildStaticDataLayers`（setMapData 一次：roads＋node
  初繪＋labels）與 `applyOwnerDirty`（owner 結構 diff 只重畫變更 node）；updateView 不再碰
  roads/labels/pathPreview；ArmyChip 冪等 update（只 pos 變→reposition 不重繪）；內插移入
  renderer（`dirty.ts` 純函式，逐字等價原 MainScreen 公式——stackKey=edgeT===0?fromNode:id）；
  `rebuildCounts`／`getRebuildCounts()` 診斷（V11 雛形）；`panTo()` camera command（MiniMap V9 接）。
  sieges 逐幀動畫刻意保留（勿套冪等 skip）。
- **UI 接線**：`composeMapViewState` 純函式橋（selection 於 UI 邊界併入；uiStore 三態
  castle/district→node 對映）；MainScreen 兩層參考穩定化（makeCachedSelector＋useMemo）——開面板／
  hover 不再觸發 updateView。
- **DoD 三句自動化證明**（`src/ui/map/mapRendererDirty.spec.ts`，置於 src/ 因需 jsdom）：僅 day 變
  30 tick 零重建；owner 翻轉恰一 node clear＋territory 訊號＋roads/labels 零增；移動只 reposition
  （armyChips 計數不增）、繪製欄位變才 +1。
- **review**：Opus 4 lens 僅 3 findings 全 rejected（各有防線論證）；orchestrator 追加修 plan/04 §8
  一處 T14/T19 模糊引用（改指 M6-V9）。
- **gate**：typecheck（含 core 純度）／lint／validate:data／validate:assets／**1169 tests**／
  golden・replay・determinism 29/29（snapshot byte-identical）／e2e 5/5（**視覺 baseline 原樣通過，
  未 update**）全綠。
- 已知留待事項：`selectMapStaticModel` 於 MainScreen 以 `useMemo([])` 快取——換劇本／重開新局需
  remount MainScreen（現行流程如此，無 bug）；linux visual baseline 由 CI 驗（本機 darwin 綠）。

### M6-V5 完成記錄（2026-07-17，commits c212051…37710b4，直接 commit main）

使用者本輪指示（2026-07-17）：貼圖抱怨「UI 醜到看不出城／軍隊／道路／城市／地形，要像
《信長之野望》一樣的真遊戲」＝授權 **V5→V6→V7→V8 整串視覺鏈**；並要求「use more agent to
parallel」＝設計階段平行化。執行模式：Fable orchestrate、設計/複雜/審查 Opus、一般實作 Sonnet。

- **設計**：Opus 設計→雙對抗評審（spec/visual＋engineering）→修訂，14 findings 全數接受，
  含兩個 Blocker（地形建構只掛 setMapData-initialized 分支在實機永不執行；territory 首幀未著色）。
  最終設計檔：session scratchpad `design-m6v5-final.md`（決策 VD1–VD10 已回寫 plan/04 §8）。
- **實作**（4 slice 依 B→A→C→D 序）：B token/LOD（MAP_PALETTE、三級 LOD＋hysteresis）；
  A terrain.json（14 山系／10 森林／10 河／2 湖，rv.tone 依史實入江戶灣）＋2048² relief/forest
  烘焙紋理（首屏 944.5 KiB／8 MiB）；C terrainDraw/terrainPack；D renderer 接線（13 層
  LAYER_ORDER、reconstructTerrainLayers 雙路徑、territory Sprite 首幀著色、destroy 共享
  texture 防護）。
- **review**：Opus 4 lens＋逐 finding 對抗驗證（13 agent），7 confirmed 全修：forest 紋理未裁陸
  （越海綠塊，重產 PNG）、琵琶湖畫成東西向（改南北長橢圓＋走向回歸測試）、committed PNG 與
  生成器逐像素一致性 gate、acquire 失敗回退測試、setMapData(null) teardown 測試、pixiMock
  parent 追蹤、landBase 斷言收緊。
- **gate**：typecheck／lint／validate:data（0/0）／validate:assets（0/0）／**1226 tests**（golden
  byte-identical）／build／e2e P1/P2/P3/P5 綠（visual 對舊基準之像素差＝預期）。
- **baseline**：三段截圖 darwin＋linux（Docker `mcr.microsoft.com/playwright:v1.61.1-noble`，
  容器內重跑 compare confirm；**注意：容器要以匿名 volume 蓋掉 `/work/node_modules`，否則
  linux npm ci 會毀掉本機 darwin 原生模組**——本輪踩過，`npm ci` 復原）。orchestrator 親眼
  驗收 §9.3 全項：紙浮雕日本、山系／森林／河湖可辨、領地染紙透出地形、無白海岸線。

### M6-V6 完成記錄（2026-07-17，commits 87e744c…42241e0，直接 commit main）

- **設計**：因 workflow args 傳遞 bug，三個平行設計 workflow 全部收斂到 V6，副作用是 V6 取得
  **六份**對抗性評審＋兩輪修訂（含 per-stage 線寬倍率修正——固定世界線寬在 overview 0.25 呈
  次像素）。最終設計已保存 `docs/design/m6-v6-roads.md`。
- **實作**（6 slice 依 B→A∥D→C→E→F 序）：B 道路常數；A roads bridges schema＋東海道
  waypoints／橋樑（避 mass、沿段密取樣 pointInPolygon 把關）＋roadDisplayLookup 分派；
  C RoadsLayer（五 tier casing／內線／海路波節落海／per-stage 重描）；D 命中 CSS-px 下限；
  E 選取高亮；F 整合（far 不再整層隱 roads、汰除 drawRoads）。
- **review 中斷**：4 lens 對抗性 review 跑到一半撞**組織月額度上限**（4/5 agent 死亡）；
  唯一完成的 lifecycle lens 找到 1 個 minor（graph swap 後 null 選取殘留舊高亮），由
  orchestrator 親自驗證屬實並修復＋回歸測試。**其餘 3 lens（visual-spec／data-geography／
  tests-quality）未跑**——額度恢復後應對 V6 diff（87e744c…6cf8dce）補跑全量 review。
- **orchestrator 追加修正**：fixture 選取由駿府改為**非圍城中的掛川城**
  （`VISUAL_SELECTED_CASTLE_ID`）——選駿府會開 SiegeOverlay 於三段截圖置中遮蔽主戰場。
- **gate**：typecheck／lint／validate:data（0/0）／**1321 tests**（golden byte-identical）／
  build／e2e P1/P2/P3/P5 綠；baseline darwin＋linux 重產並親眼驗收。
- **⚠ 視覺 gate 弱點（V11 待補）**：V6 細線變化在三 preset 皆落在 `maxDiffPixelRatio 0.01`
  容忍內——**stale baseline 也會綠燈**；linux baseline 須以 `--update-snapshots all` 強制重寫
  （預設 changed 模式不觸發）。V11 應加 layer-presence smoke 或收緊容忍度。
- 已知小噪音：StrictMode 雙 boot 使 Pixi Assets Resolver 印 "already has key … overwriting"
  warning（terrain/atlas 預熱重複 add，無害；可於 V9/V11 清理）。

### M6-V7 完成記錄（2026-07-17，commits 03bd67f…，直接 commit main）

- **實作**（與 V6 review 補跑合併之 workflow：3 個 V6 backfill lens ∥ V7 slices A/B/C →
  V6 fixer → V7 slice D → gate）：A terrainKind 顯示欄位（s1560 13 山城指派、builder 不搬、
  golden 不動）＋fixture CD8（耐久三色＋encircle threatened）；B 四型紙雕城郭＋金色雙環選取環；
  C seeded 城下聚落＋DistrictNode 狀態；D nodeMarkers 接 sceneParts＋簽章 diff（重繪計數＝
  簽章 diff 成員數）＋汰除 drawNodeMarker。
- **V6 review 補跑**：4 findings、1 confirmed（道路名 ink900 fill 與 near-only LOD 無單元斷言
  ＋pixiMock 丟棄 style），已修。
- **gate 自抓回歸**：V7 對掛川加玩家方 encircle 圍城使 V6 的「選掛川」重新開 SiegeOverlay
  遮蔽 baseline——fixture 選取改鳴海城（VISUAL_ENCIRCLE_CASTLE_ID＝掛川另立）。
- **review**：4 lens＋對抗驗證，3 confirmed 收斂為 1 個真缺陷（graph swap 後選取環殘留——
  與 V6 roadHighlight 同型），一行修＋回歸測試。
- **gate**：typecheck／lint／validate:data（0/0）／**1377 tests**（golden byte-identical）／
  build／e2e 4/5（visual 差異＝預期）；baseline darwin＋linux（--update-snapshots all）重產
  並親眼驗收（紙雕城郭四型可辨、耐久三色、警戒、選取環、聚落）。

### M6-V8 完成記錄（2026-07-17，commits 1f3f1c4…，直接 commit main）

- **實作**（B → A∥C → E → gate）：B ArmyRelation UI 邊界推導＋MAPVIEW 常數；A fixture
  敗走氏真／補給危急／敵對外交列（零新字）；C 軍旗棋子幾何全升級（關係三通道／方向箭頭／
  敗走 20° 下垂／士氣形狀通道／單一 badge／washi 兵數底板 stackIndex 錯位／far 變體，58 tests）；
  E armyChipStage restage（修 preset 不 restage 缺陷）＋heading 內插＋far ×2.4 transform＋
  選取置頂。**B／A agent 中途死於 API 529，gate agent fix-forward 補完**（B 的 spec 完成＋
  restricted-import 修正、A 的 fixture 全量實作）。
- **review 債**：4 lens review 全數死於組織月額度上限（0/4 跑完）；orchestrator 親自審
  MapRenderer restage／heading／destroy 與 armyChip 契約 hunks 後放行。**額度恢復後應對
  V8 diff（1f3f1c4…cf73a5d）補跑全量 review**（V6 補跑時 4 findings 1 confirmed 的先例）。
- **gate**：typecheck／lint／validate:data（0/0、零新字）／**1437 tests**（golden
  byte-identical）／build／e2e 5/5；bench 記錄 mean 0.30–0.33 ms。
- **baseline**：darwin＋linux（--update-snapshots all）重產並親眼驗收；V8 像素差同樣
  <1% 容忍（非 all 模式不重寫，V6 教訓再次適用）。
- **DoD#5（20 軍 55fps）尚未驗**：bench 只測 core tick；渲染 FPS 場景屬 V11。

### M6-V9 完成記錄（2026-07-22，commits 4d1a5ae…，直接 commit main）

使用者貼實機截圖抱怨「the whole UI sucks, make it more like a game」＝授權 M6-V9（HUD 組裝）
並連帶修地圖可讀性回歸。執行模式照舊：Fable orchestrate、Opus 設計/評審/review、Sonnet 實作。

- **設計**（wf_e1153b7d-9d2）：Opus 設計→visual-spec∥engineering 雙對抗評審→修訂；
  2 Blocker（點城雙開滿版面板、borderDarken spec 未納片）與切片「可平行」宣稱皆被評審打掉。
  定稿＝`docs/design/m6-v9-hud-readability.md`（單一真相，605 行全數值）。
- **實作**（wf_716462d7-8ff；S1 palette→S2 labels→S3 HUD 定序＋gate＋雙 lens review＋fixer）：
  染紙勢力色雙軌（clanDyeHsl s25/L67·53 只餵 territory；旗幟軌不動）、紙墨邊（borderInk
  0x2e281d×0.55、once-guard）、標籤 pixel-lock（per-label container 反縮放、CSS px 恆定、
  rebuildCounts 不動）＋ink900/washi halo（labelStyle.ts）＋64px declutter（idle/scale/LOD
  觸發）、耐久環/郡點降噪、HUD 全組裝（ResourceBar 淨額/駐城兵、SpeedControl、MiniMap→
  panToWorld、家紋左欄、ContextPanel 三態快覽條、ReportStack 收合、☰ 占位）、點擊語意改
  「只 setSelection」、--accent-red/--danger 壞 var 修繕（出陣鈕原全隱形）。
- **review**：Opus 雙 lens 0 Blocker/0 Major、3 Minor confirmed 全修＋回歸測試（StatBar
  max/showValue、ReportStack 空清單、resize 監聽）。orchestrator 追加：MiniMap 快覽條開啟時
  垂直讓位（1280 與 ContextPanel 相疊）。
- **gate**：typecheck/lint/validate:data（0/0、917 字元）/**1479 tests**/build/e2e 5/5；
  golden byte-identical（core 未動）。baseline darwin＋linux（docker --update-snapshots all
  ＋匿名 volume，容器內 compare 復跑綠）獨立 commit；orchestrator 親眼驗收三 preset＋s1560
  實局截圖（染紙領地透出地形、標籤不再爆大混戰、墨帶/家紋欄/快覽條成形）。
- plan/04 §8、plan/11 §8（D21）已回寫，交叉引用設計定稿。
- 已知後續：底部快覽條 1280 高度斷點 112px 為定稿裁決；1920 全尺寸驗證與 55fps/無障礙
  gate 屬 M6-V10/V11；「頁面底部 washi 條」查明為紀伊半島陸地色非 bug。

### 停止點與安全續作順序

1. 本輪已完成 **M6-V5～M6-V9**——視覺鏈（地形／道路／城池／軍隊／HUD）全數 landed。
   五份最終設計已入 repo：`docs/design/m6-v{5,6,7,8}-*.md`、`docs/design/m6-v9-hud-readability.md`。
2. 下一步（依 plan/18 M6-V 串流）：**M6-V10（分析圖層）→ M6-V11（視覺／效能／無障礙 gate）**；
   續作時先走設計→對抗評審→實作 workflow 模式。另有兩筆 review 債：V8 全量 review
   （額度中斷）；V11 應收緊視覺 gate（<1% 容忍會漏細線變化，V6/V8 兩度驗證）。
3. V7/V8 共用 MapRenderer.ts／mapRendererDirty.spec／MapCanvasHost.spec／pixiMock——
   兩 stage 之整合 slice 不得並行；V8 可在 V7 整合完成後開工（V8 設計 Slice E 為唯一
   整合 slice）。
4. 更新視覺 baseline 一律獨立 commit＋附 before/after；**linux 重產記得
   `--update-snapshots all`**＋容器匿名 volume 蓋 node_modules（見 V5/V6 記錄兩個坑）。
5. M6-V9（HUD）前已知版面既有問題：頁面底部 washi 背景條、SiegeOverlay 置中遮圖
   （V6 已以 fixture 選取繞開，正式解法屬 V9 HUD 版面）。

## M4 已收尾（2026-07-13）

M4-1～M4-18 全數完成：出陣／改令／召回、兵站與制壓、同節點／相向／追擊遭遇、野戰自動解算、
潰走與精確部隊追擊資格、威風（小）、強攻／包圍／援軍解圍／落城、一揆鎮壓，以及 ArmyChip、
PathPreview、SiegeMarker、LOD／視錐剔除、出陣 modal、攻城 overlay、事件報告 enrichment。

回歸基礎自 M4 起正式阻斷：golden-mini 固定 720 tick 且連跑兩次一致（day 360
`aa9a5928473c7590`、day 720 `3d5d321e9e6170e2`、BAL hash `815a621a02a8e48f`）；command log
可匯出／重放，checked-in 10 指令案例 match=true，竄改指令 match=false；bench 固定暖身 60 tick、取樣 360 tick。

全量 review 經多輪 fix-forward 收斂，重點包括：每日路徑合法性重驗、海路登船延遲、單勢力制壓不疊加、
潰走兵站與跳數退路、先到方／同盟援軍、精確 ArmyId 追擊資格、軍團落城清理與金庫退還、包圍城糧同一
`foodFrac` 管線、守城結果批次結算後才執行一次被俘當主的決定論繼承、無成年繼承人的原子吸收、穩定
leader 快照報告，以及 UI hit-test／堆疊／culling／a11y。

本機 checkpoint gate：lint、typecheck、validate:data（0 ERROR／0 WARN／簡體 0）、**935 tests**、
Playwright P1–P3、production build 全綠；字型 866 字元、187.1 KB。M4 手動 DoD 以決定論 debug setup
走真實 Command 與 daily tick，19 tick 完成「厚見郡制壓→春日井野戰勝→稻葉山落城」，城與四轄郡翻轉、
全程 `validateState` 零違規且七類必要事件／報告齊全。bench 三次 mean 0.2364–0.2502 ms、p99
4.6555–4.9812 ms（僅報告、不阻斷）。

**M4 checkpoint 當時下一步**：M5 合戰戰術戰場＋戰法＋威風（plan/18 §3.8）；一次只做 M5，不預先開 M6。

### M4 Opus review 收尾（2026-07-13）

使用者要求之 Claude Opus 全量 review 找出 9 組 M4 收尾項目，已全數 fix-forward：潰走改為真正無權 BFS
最少跳數路徑；威風範圍／威信／分級門檻與攻城末段撤回門檻移入 `BAL`；攻城 overlay 依存活攻方總兵力
停用包圍並提供提示；新增可重放至落城的 M4 軍事案例；中立領地不再誤扣敵境士氣；M5 合戰入口在功能
完成前同時 gate producer／auto-pause；補政策士氣與施設攻城減免擴充 hook、攻城減免 `[0,0.7]` clamp、
非圍城城池每月士氣回復；移除 v1 log 無逐日 checkpoint 卻永遠為 null 的 `divergedDay` 假契約。

修正後由 orchestrator 自行逐檔 review，未發現剩餘 actionable finding；完整 gate：lint、typecheck、
validate:data（0 ERROR／0 WARN／簡體 0）、**945 tests**、Playwright P1–P3、production build、bench 全綠。
golden-mini 因每月城士氣回復而更新為 day 360 `afe70fe49392a21f`、day 720
`6bd1e548f446d7e1`，BAL hash `e64d9cab24d18a6d`；新增 M4 replay final hash
`523b89fad68e2cb9`，既有政策 replay final hash 仍為 `98990ec2b597787f`。

**現行下一步**：使用者已核准 M5；實作 M5-1～M5-9，完成後停下，不預先開 M6。

## M5 中斷點（2026-07-13 18:49 JST）

使用者要求先停下、稍後再繼續。**M5 目前全部留在未 commit 工作樹；勿 reset／勿從頭重做。**
乾淨基線為 `ea94d50`（`fix(military): 收斂 M4 review findings [M4-review]`），該 commit 已包含上方
M4 九項 review fix、945 tests gate 與本文件的 M4 review 記錄。M5 尚無 commit。

### 已落地的 WIP

- **M5-1／M5-2 core（大致完成，待修測試與整合 review）**：`src/core/systems/battle.ts` 已由 M1 stub
  擴成 startKassen 驗證／登錄、2 跳集結、9–13 陣決定論生成、連通修補、地形、部署、移動、同步傷害、
  士氣／潰走、旗力／本陣、采配、三種結束條件、策略層原子寫回、敗方一跳撤退、威風與
  `closeResolvedBattle()`；`balance.ts`、`gameState.ts`、`invariants.ts`、registry 與既有契約測試同步修改。
- **M5-3 戰法（完成單元範圍）**：新增 `src/core/tactics.ts`＋`tests/core/tactics.spec.ts`，12 種戰法、
  型錄漂移驗證、特性解鎖、采配／冷卻／目標驗證、buff/debuff/instant 效果與查詢 helper；17/17 focused 綠。
  `battle.ts` 已接上戰法套用、攻防倍率、移動限制、挑撥、騎突、火矢、背水士氣底線與 timer。
- **M5-4 委任 AI（有實作、尚缺 focused tests／完整 review）**：新增
  `src/core/systems/battleAi.ts`，依 07 §3.9 的鼓舞→攻擊戰法→弱敵→弱陣→本陣攻防優先序產生決定論
  orders，已由 `advanceBattleTick` 呼叫。
- **M5-5 威風（核心判級已完成）**：`awe.ts` 新增 `judgeBattleAwe()`，小／中／大門檻與快攻 40 tick
  邊界有 4 tests；battle resolution 已呼叫既有 `applyAwe()` 做郡翻轉、城損害、威信與事件。
- **M5-6 UI（骨架已接線，尚未通過 compile/lint/RTL）**：新增 `src/app/battleBridge.ts`、
  `BattleScreen.tsx/.module.css`，並修改 `App.tsx`。目前有獨立 battle order queue/tick、單位選取、移動／
  攻擊／戰法目標、采配／冷卻灰化、委任、合戰速度、戰況列、結果 modal、`screen-battle` 與
  `battle-retreat`。App 會偵測 unresolved battle 轉場；仍須把結果確認接到 `closeResolvedBattle()`，並補 RTL。
- **M5-7 特效（完成單元範圍）**：新增 `particles.ts`、`aweShockwave.ts`、`battleSpark.ts` 與 3 specs；
  粒子池硬上限 128、威風 normal/large/reduce-motion 時間軸、BattleSpark 注入 RNG；13/13 focused 綠。
- **M5-8 只完成一小部分**：`src/core/debugBattle.ts` 目前只有 debug-only `abortDebugBattle()`；尚未建立
  `debug-battle-01` 佈局、`window.__tenka.debug.startBattle()` 相容 API、App 啟動接線與 Playwright P5。
- **M5-9 未做**：尚無含 battle subloop orders 的 golden／transcript 重放案例。

### 現行紅燈（中斷時的精確輸出）

- `npx tsc --noEmit`：只剩 `tests/core/battle.spec.ts:23` 未使用的 `DIST_A1X` import（TS6133）。
- focused 49 tests：**47 passed／2 failed**。兩個失敗都不是 engine assertion，而是
  `tests/core/battle.spec.ts::prepareCombat(2000)` 從只有 800 兵的 `castle.a2` 出陣，造成
  `INV-16 castle.a2 soldiers -1200`；改用兵力足夠的 alpha 城／武將，或重構 fixture 但仍維持合計
  ≥ `BAL.kassenMinTroops(3000)`。失敗案例：startKassen/invariant 與 B2 原子寫回/invariant。
- 尚未跑完整 `npm run lint && npm run typecheck && npm run validate:data && npm test && npm run e2e && npm run bench`。
  M5 新增字串目前直接寫於 `BattleScreen`，收斂時應搬入 i18n；新增繁中字後依慣例跑 `npm run font:subset`。

### 安全續作順序

1. 先 `git status --short`，保留上述所有變更。修 `battle.spec.ts` fixture＋unused import，跑
   `npx tsc --noEmit && npx tsc -p tsconfig.core.json --noEmit` 與 M5 focused tests。
2. orchestrator 自行 review `battle.ts`／`battleAi.ts`／`tactics.ts` 的 tick 順序、決定論、原子寫回與
   state invariants；補 M5-4 AI tests、1000 次戰場生成、全委任 ≤120 tick、固定 seed 逐 tick hash。
3. UI 把結果按鈕接 `closeResolvedBattle()` 後再回策略層；補 BattleScreen RTL、將字串移入 i18n，確認
   采配 canonical 上限是 20（忽略 plan/11 wireframe 的 100）。
4. 完成 M5-8：seed 42、每側 2 unit 的 `debug-battle-01`；debug API 同時保留既有
   `window.__TENKA_DEBUG__` 並提供 P5 要求的 `window.__tenka.debug`；P5 點 `battle-retreat` 回 strategy。
5. 完成 M5-9 battle transcript/golden（策略 day command log 無法表達 battle subloop orders，需專用格式或
   明確擴充）；再做手動 DoD：35 tick 內陷本陣→威風大→3 跳敵郡翻轉。
6. 自行 code review/fix-forward（**不再用 Codexmon**）→完整 gate→更新 plan 決策、README、
   `milestone.json current=M6`、wip→依 M5 任務分組 commit→tag `m5`→push→驗 CI/Pages；完成後停下，勿開 M6。

### M5 完成記錄（2026-07-14）

- **M5-1～M5-5 core**：完成 9–13 陣決定論生成（1000 layouts 皆連通合規）、地形 hook、battle tick、
  12 戰法、簡易委任 AI、三種結束條件、敗將戰死／被俘、策略層原子回寫，以及小／中／大威風。
- **M5-6～M5-8 UI／特效／debug**：BattleScreen 支援單位、移動、攻擊、戰法、委任、速度、結果 modal；
  粒子池上限 128、BattleSpark 與威風波；固定 seed 42、雙方各 2 部隊的 `debug-battle-01` 與 P5 完成。
- **M5-9 重放**：新增 versioned `.tfbattle.json` 子迴圈 transcript。案例 tick 1 使用突擊、tick 2 開啟委任，
  tick 30 結束；initial `1c31e73231f90e9e`，tick 1/10/20/30 分別為 `61a3ed6027a1efb6`／
  `fc8ac7f7c38022f5`／`ffc51b2789ee285f`／`ee228589089dca59`，final 同 tick 30。
- **自行 code review fix-forward**（依使用者最新覆寫，不使用 Codexmon）：補敗將 3% 戰死→未中再 20%
  被俘及繼承／役職／軍團清理；委任 toggle 改為同 tick 先套用再決策；2 跳集結排除已在其他 FieldCombat
  交戰部隊；結果 modal 補雙方損失；debug 撤退僅開發模式顯示且中止時清除來源 FieldCombat。另新增
  「速攻陷本陣＝威風大」及「威風大涵蓋恰 3 跳、第 4 跳不翻」邊界回歸。
- **checkpoint gate**：lint、typecheck、validate:data（0 ERROR／0 WARN／簡體 0）、**1011 tests**、
  Playwright P1/P2/P3/P5 **4/4**、production build、golden、兩份策略 replay、battle transcript 全綠；
  字型 885 字元、190.4 KB。bench（暖身 60／取樣 360）mean **0.2516 ms**、p99 **5.0861 ms**。
- golden-mini 因 M5 BAL 常數登錄只更新 BAL hash 為 `b094cd03a3031f3f`；day 360
  `afe70fe49392a21f`、day 720 `6bd1e548f446d7e1` 皆不變。兩份既有 replay 亦僅同步 BAL hash，final hash
  維持 `523b89fad68e2cb9`／`98990ec2b597787f`。
- plan/07 §8 已回寫 M5 地形 fallback、battle transcript、結果確認生命週期三項決策；README 與
  `milestone.json` checkpoint 前進至 M6。M5 完成當時 M6 尚未開始；現況以本文件上方「M6-V 視覺優先工作串流」為準。

## M3 已收尾（2026-07-13）

M3-1～M3-24 全數完成：37 項武將特性、功績／升格／俸祿／忠誠、經濟與秋收、郡開發與知行、
施設、徵兵、輸送、政策、治安一揆、收支預覽、完整 UI 導航與通用元件、城／郡／武將／政策面板、
ReportStack，以及 Playwright P3 三個月推進。

全量 review 已 fix-forward：補齊升格 Command、分級知行忠誠與加封獎勵、內政特性掛鉤、施設前置停用、
輸送劫掠攜行上限、俸祿單一結算管線、收支糧耗共用公式、無效佇列退款、面板狀態保留與 UI 驗證器接線。

### checkpoint 後 review 收尾（2026-07-13，commit 73bc28f）

tag m3 之後追加一輪 Opus code review，修正三項 checkpoint 未攔到的問題（決策記錄 plan/06 §8 2026-07-13）：

- **F1 收支預覽俸祿口徑**：`officerSalary()`（selector 預覽用）原缺 `hasComeOfAge` 過濾，仕官未成年
  武將（如織田長益，s1560 織田家）被預覽計薪但實際不計 → 違反 05-T5-10「預覽＝次月實際」。已補齊、
  兩處口徑一致（實測織田家預覽=實際=326）。
- **F2 欠俸忠誠懲罰時序**：−2 懲罰原於 economy 步驟（Step 6）施加，被同 tick officers 步驟（Step 9）
  月結漂移即時抹平（違反 06 §3.6.2）。改為：economy 只結算金錢＋發 `economy.upkeepUnpaid`；懲罰移至
  officers 步驟 `recomputeLoyalty` 漂移「之後」由 `applyUnpaidSalaryPenalty` 套用（unpaid 勢力讀自
  tick 事件流）。13 步順序不動。M4 已補 economy 當時實際 payee 清單快照，避免在軍事傷亡後誤罰。
- **F3 倍率去魔數**：development／domestic／uprising／conscription／transport 內嵌之政策/施設倍率與
  治安細目提為 `BAL.*` 具名常數（鐵律 #3），值不變、bit-exact 不變。

新增 1 條 F2 回歸測試（欠俸懲罰不被漂移抹平）。gate：lint／typecheck／validate:data（0/0）／**845 tests**／
P1–P3 e2e 全綠；字型 838 字元、181.5 KB。

此段為 M3 歷史記錄；現行下一步以本文件 M4 收尾段落為準。

## M2 已收尾（2026-07-12）——以下為歷史記錄

M2 後半全部完成並 commit（d418107…f9c04a6）：B1/B2 資料批次過三關（validate 0 ERROR／stats ±10%／抽查表）、
mini fixture、validate 自動批次模式（14 §8-D23）、新局流程（選織田→1560 年 HUD＋地圖）、P1+P2 e2e 綠。
Opus review fix-forward 兩項 checkpoint 阻斷（bare validate:data 紅燈、Prettier）。
Push 後 CI 一度紅燈（territoryGrid perf gate 在共享 runner 713~2149ms）——已修（1f4004b：CI 上改 sanity 上限，
依 17 §3.11.2 perf-gate M9 才轉阻斷；本機維持 450ms 回歸守門），**re-run 後 CI/Deploy 全綠、Pages 200**。
M2 的下一步原為 M3；已於 2026-07-13 完成，現況以上方 M3 收尾段落為準。

<details><summary>M2 後半執行過程記錄（收合）</summary>

**已完成（工作樹未 commit，品質已過 gate）**：

- Prep：F2（`BAL.loyaltyTreatmentClampAbs` 提取，15 總數 540→541）＋F5（INV-05 fixture）。
- **M2-9 B1 東海**：`src/data/scenarios/s1560/*.json`＋`officers/tokai.json`——validate --regions=tokai 0 ERROR、stats 石高 −6.3%/武將 −5.3%（≤±10%）、織田 310,000 石／今川 670,000 石校準 PASS。
- **M2-10 B2 近畿**：`officers/kinki.json` 等——東海+近畿 validate 全綠、近畿石高 −0.3%/武將 −4.2%、清洲→京都 ETA 5.5 日（∈5–9）、含足利將軍家（第 41 家）與鈴鹿/中山道接縫。

**剩餘（quota 中斷未跑，resume 後自動續）**：

1. M2-11 mini fixture（zod 版）＋M2-12 資料驗證整合進 CI（17-T4/T8）。
2. M2-19 新遊戲流程最小版（ScenarioSelect→DaimyoSelect→buildGameState(regions)→MainScreen 掛地圖）。
3. M2-20 Playwright P2（新局流程 e2e）。
4. Opus M2 全量 review（fix-forward）→ orchestrator 驗證 → commit（B1/B2 各自成 commit，帶 stats 輸出）→ M2 checkpoint（README/milestone→M3、tag m2、push、驗 CI）。

**Resume 指令**：`Workflow({scriptPath: "<session>/workflows/scripts/implement-m2b-wf_dcccc2d1-835.js", resumeFromRunId: "wf_dcccc2d1-835"})`（已完成 agent 走快取）。

</details>

## 關鍵事實（給接手者）

- 規格衝突優先序：`00 > 02 > 15 > 系統文件(03~10,16) > UI 文件(11~13)`；**絕不修改 `plan/00-foundations.md`**；矛盾＝決定→實作→回寫該檔 §8（不留 TBD）。
- 報告渲染契約：core 只 emit `02 §4.19` 事件（68 種），UI 層 `renderReport(report, state, playerClanId)` 導出字串（13 §3.7 enrichment）。
- commit 格式：`<type>(<scope>): <繁中> [Mx-n]`（18 §3.13）；checkpoint 程序 18 §3.14。
- 新增 UI 字串／資料 name 後必須跑 `npm run font:subset` 再 commit（字型涵蓋率會紅燈）。
- 資料檔繁體正字（滝→瀧等；掃描器會擋）；專有名詞在 JSON `name` 欄不進 i18n。
- 驗證全套：`npm run typecheck && npm run lint && npm test && npm run validate:data && npm run build && npm run e2e`。
- 持久記憶 `tenka-fubu-project.md` 已同步至實作階段。**每個階段結束或被中斷時，更新本文件。**
