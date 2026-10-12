# WIP — 實作交接文件（更新 2026-10-12）

## 2026-10-12 後續驗收（不推進里程碑）

- sim1 找回 BAL `7634217400759e66` 的歷史來源。政策重放只有存檔格式 3→4 及兩個零值記帳欄位差異，已保存完整狀態／事件證據並提交 `03ab4d3`；當時重放 56／57 項通過；隨後 `ce7cced` 以 61 日完整證據歸因 M4 整數城防與攻城功績，重放 58 項全過。`9464873` 三個 golden、`6254f9d` B8、`59a8de3` tactical 均完成歷史來源與逐日完整狀態歸因，維持精確雜湊斷言。凍結 `f446e85` 全量測試 6,263 通過／1 失敗／1 跳過，1,453 檔 SHA256 不變，唯一失敗為第 450 日齋藤無繼承人領地不變量。
- sim2 提交 `3686129` 河面 oracle 修正，原門檻不變、原生測試通過。`125f582` 城下町 sampler 改用實際地形投影，駿府牆面仍被必要軍隊名牌遮住，原生斷言仍失敗；未修改素材、名牌或門檻。
- sim3 提交 `189c2c8` 新裁決 D23，依 02 對 09 的行為委託廢止八家背景輪詢，保留同日事件反應。九個不同受侵 owner 的受控 fixture 及空事件檢查通過。`e86de08` audit 保留 614 列、591 個比較值、23 個原始缺名列，唯一未解問題為人口／石高校準，報告仍失敗。
- sim4 的 `68e96a6` headless GPU 二十次量測 remount 通過資源／快取／context-loss 檢查；主頁 GC 後 heap 增加 1,683,628 bytes，不能認定整體記憶體穩定。`bfa37db` 修正分析器誤拒 V8 有號數值 edge label；12 項測試通過，原始快照可解析，指定舊 renderer／app ID 不再存在，但不證明無其他洩漏。`efe734a` 私有 program 名稱配額修正後，sim4 相同二十次掛載實際字典 14→14 鍵（原 34→74），四項 native 控制通過；整體 Runtime heap 仍增 1,620,724 bytes，不認定整體穩定。
- `f09c8d1` 道路精確繪圖指令 oracle 跨平台一致，五個真實 producer mutation 都被拒絕；沒有容差或 OS 排除。
- sim4 最新 Worker 六項原生測試全部通過，三組完整狀態／日誌精確一致。120 日批次最長畫面間隔 1,028.1→124.9 ms，但總耗時 939.9→2,511.1 ms；正常 x5 實際自動暫停前完成 29 日，間隔 128.4→84.7 ms。單筆樣本不宣稱穩定 60 FPS；原始資料見 completion-audit/worker-final-sim4。
- 後續 `d619085` 減少地理標籤的 edge-axis 暫存及快取命中前候選配置。25 項原版比對／邊界測試與六項 native Worker 流程通過；原生前後完整狀態、日誌、地圖發布及全部地理標籤一致。正常 x5 最長間隔 84.7→60.3 ms，後版此樣本沒有 long task；仍未達穩定 60 FPS。完整前後 profile／source map／原始數據見 completion-audit/geographic-allocation。
- `7129f63` 修正零城勢力的普通野戰退出，84 項相關測試與本機十五項 victory 通過。有效戰術收尾仍缺中止／獎賞表示，已詢問使用者；真正失敗診斷保留，未用 expected-failure 或 skip 掩蓋。全量回歸 6,264 通過／1 失敗／1 跳過（唯一 day450 無繼承人領地問題），型別／完整 lint／build／bundle 通過；1,355 個固定 commit 的來源 SHA256 不變。證據見 completion-audit/field-extinction、continuation-7129。
- `fc45370` 保存 sim2 凍結來源的原生補驗：區域九城實際結局與重載通過；色覺／道路土壤完整頁面復原仍有 HUD 圓角像素差異。40 支行軍部隊的 30 秒窗口含月度自動暫停，效能結果失效；保留原 gate 失敗，不修改門檻。詳見 completion-audit/native-gates-sim2-505d96a。
- `38d22b0`／`9a0e242` 補齊 M6-18 自然具申採納、實際出陣／獎賞、次月清理與未付俸祿驗證；20 項測試與來源 archive 重跑均通過。逐項 M6 matrix 仍保留未完成 gate。sim4 延長掛載兩次均在第 41 次失敗，地面材質請求傳輸失敗；尚未定位底層原因，原始紀錄保留於 completion-audit/extended-remount，不認定整體記憶體穩定。
- `8c0de41` 原生官位驗證通過：正常朝廷工作至第 150 日取得恩惠 23，第 151 日正常授官扣 300 金、加 50 威信，恩惠不變；原生存檔重載一致。相關現版來源與凍結來源相符，原始成功及四次觀測失敗均保存於 completion-audit/court-rank。具申驗證後全量回歸仍為 6,264 通過／1 失敗／1 跳過，型別／完整 lint／build／bundle 通過，詳見 continuation-38d22b0。
- 分步提交與原始前後資料集中於 `docs/validation/2026-10-12/completion-audit/README.md`。WASM／Worker 架構已提交；全專案、長跑校準及原生藝術驗收仍未完成。人口校準與無繼承人領地處理仍待先前詢問的規則決定，不擅自改變遊戲結果。

> 給下一個接手的 AI／未來 session：本文件描述《天下布武》**實作階段**的當前進度與剩餘工作。
> 規格階段已於 2026-07-11 收斂完成（21 份 plan 定稿、E-01…E-80 全數消化、七輪裁決記錄於 `plan/02 §8`）。
> 2026-07-14 依使用者「優先優化繪圖與圖示」指示，追加 M6-V 視覺阻斷工作串流與 M6-V1 原創視覺規範。
> 讀本文件＋`CLAUDE.md`＋`plan/18-roadmap.md` 即可無縫接續。

## 執行模式（使用者指示，多次重申）

- **2026-10-08 續作**：使用者要求平行完成專案；維持里程碑依賴與品質 gate。
  所有後續瀏覽器測試使用 headless，不開新視窗。當前以 renderer、UI、visual gate 三個 agent 平行協作。
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

| 里程碑        | 狀態                                   | 備註                                                                                             |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| M0 鷹架       | ✅ 已 checkpoint（tag m0）             | CI 五 job 綠、Pages 200（https://tigercosmos.github.io/tenka-fubu/）                             |
| M1 core＋HUD  | ✅ 已 checkpoint（tag m1）             | 431 tests；型別=02 全型別零缺失（46 Cmd/68 Event）                                               |
| M2 資料＋地圖 | ✅ 已 checkpoint（tag m2，2026-07-12） | 792 tests＋P1/P2 e2e 綠；DoD 四條全過（review 報告見 wf_dcccc2d1-835）                           |
| M3 內政       | ✅ 已 checkpoint（tag m3，2026-07-13） | 845 tests＋P1/P2/P3 e2e 綠；24 個月 DoD、全量 review 與 checkpoint 後 review 收尾（73bc28f）完成 |
| M4 軍事一     | ✅ 已完成（2026-07-13）                | 945 tests＋P1/P2/P3 e2e；19 tick 織田—齋藤 DoD、golden/replay、bench 與 review fix-forward 全綠  |
| M5 合戰       | ✅ **已完成（2026-07-14）**            | 1011 tests、P1/P2/P3/P5、golden/transcript、bench、自行 review 與 checkpoint gate 全綠           |
| M6            | 🎨 **M6-V1～M6-V11 已完成**            | 外交／朝廷幕府／調略／家臣系統完整化待續作                                                       |
| M7–M9         | ⬜                                     | 依 `plan/18-roadmap.md`                                                                          |

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

### M6-V9b 完成記錄（2026-07-22，commits 19c9516…1a6e851，直接 commit main）

使用者指示「上網查《信長之野望 新生》UI 圖並模仿」（例示 qbnews.tw/shinsei——Cloudflare 403，
改用專案登錄之 KOEI 官方 manual/press 頁截圖；orchestrator 親閱）。依 M6-V 研究規則只轉譯
資訊層級/操作回饋，禁抄具體構圖（放射狀指令輪判定為新生招牌版面、明確不做）。

- **設計**（wf_31bfd557-2a8）：Opus 設計→合併 lens 評審→修訂。評審抓到真 Blocker
  （名牌若騎 node 簽章則兵數永不更新→獨立 buildNameplateSig）與構圖近同構（DD-A3 三處
  去同構：城名左置/兵數內嵌綬帶尾段/印記騎接點）。定稿＝docs/design/m6-v9b-map-plates.md；
  references.md 新增 R11＋qbnews 阻擋記錄。
- **實作**：S1（renderer 名牌，Sonnet 完成，1493 tests 綠）→ **S2 起組織月額度中斷
  （4 agent 死亡）**，依額度協議收攏：S1 先行 commit（19c9516），S2（出陣目標三浮層/
  頂帶色章/soldiersByCastle 接線）由 orchestrator 親自完成（285b6d2）。
  途中自抓：S1 的 soldiersByCastle 可選參數在未接線前名牌全顯 •0（實機截圖發現）；
  快覽條與確認藥丸重疊（pickTarget 時 ContextPanel 讓位）。
- **gate**：typecheck/lint/validate:data（0/0、919 字元）/**1494 tests**/build/smoke 4/4/
  golden byte-identical；出陣全流程實機截圖驗收（模式帶＋目標卡敵我比較＋藥丸＋名牌
  金框高亮）。baseline darwin＋linux 重生（1a6e851）。
- **review 債**：S2 之 Opus 全量 review 因額度未跑（S1 已過設計期評審；S2 為 orchestrator
  手寫小 diff 並自審）。額度恢復後對 285b6d2 diff 補跑 review（V6/V8 先例）。
- plan 回寫：名牌/目標模式決策以設計定稿為單一真相（plan/04 §8 之 V9 條目已涵蓋標籤系統
  演進脈絡；V9b 條目待補跑 review 時一併回寫，避免額度中斷期反覆改 plan）。

### M6-V10／V11 續作記錄（2026-10-08）

- 五種互斥分析主題、透明度、同步圖例、Alt+1…5 與地圖背景 Tab 已接線，設定不進 GameState。
  資料邊界與設計見 `docs/design/m6-v10-analysis.md`；不把道級當吞吐量、不捏造全地圖戰術加成。
- 補 V8／V9b review 債：選取的收合軍隊可命中、目標名牌立即更新、缺少／過期／不可達路徑不允許確認，
  async init 後重套最新 props；Space 不再攔截原生 button／summary 操作。
- Gate 收緊：最多 100 changed pixels、缺 baseline 直接失敗、有效 drawable／LOD 名牌驗證、
  faction lazy texture remount、原始 frame／CPU 與 post-GC heap 證據。測試產物列入 ESLint ignore，
  避免與 Playwright 清理目錄產生競態。
- 實測抓到並修正兩個缺陷：font-ready 前的 BitmapText fallback cache、每次重掛三份新的勢力名 atlas。
  共享 bounded TextStyle，並在銷毀文字時解除 style listener；20 次 headless remount 的 atlas／context／BitmapText 為 7→7／13→13／38→38。
- 初次 headless shell 使用 SwiftShader，效能未達標；已保留失敗原始資料。
  最終 `VISUAL_GPU=1` 完整 Chromium new-headless 的 Metal 量測通過：30 秒／20 軍隊／1080p，frame time p95 9 ms，CPU update p95 0.2 ms。
- 最終驗證：1517 tests／typecheck／lint／validate:data（950 字元）／validate:assets（944.5 KiB）／build；
  headless E2E 10 passed＋1 optional perf skip（硬體測試另跑通過）；darwin／linux baseline update 後各自 compare 通過。
  詳細證據與 heap 差額限制見 `docs/visual/m6-v11-review.md`。V11 已完成；M6 與整個專案尚未完成。
- **下一步**：依 roadmap 開 M6-1；完整外交／調略／家臣功能仍需實作與 M6 checkpoint。
  M6 準備已找到兩項必須裁決的資料缺口：京都 metadata 與內應免疫／城主更替的持久欄位；
  歷史官位／役職保留 canonical 劇本值，`shogun` 不當成第六階可申請役職。

### V9b 當時的停止點與安全續作順序（歷史記錄）

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

## M6 玩法整合記錄（2026-10-08，驗收進行中）

- 平行接入外交工作／感情／協定、朝廷幕府、三種調略、家臣生命週期、捕虜及具申。
  UI 透過同一 Command 管線執行；內應快照與免疫隨存檔 v2 保存。
  實作裁決見 `docs/design/m6-gameplay-decisions.md`。
- 新增 1800 日外交 golden（每日不變量、900 日存讀檔）及 720 日家臣欠俸整合測試。
  BAL 常數別名遷移先用 deterministic checker 建立 61 筆基線，現已歸零。
- Browser 一律 headless。新局、暫停排隊與三條外交／調略／具申流程全數通過；
  `startM6Flow()` 的武田實體明確標為 synthetic debug fixture，不是 M8 正式資料。
- 型別、資料與素材驗證已通過；字型已更新為 1039 字元／221.3 KB。
  平行測試曾造成效能門檻與 preview server 競用；獨立重跑已通過，不放寬門檻。
  獨立 review 修復主將死亡圍城參照、捕虜釋放威信上限與幕府滅亡殘留將軍 ID。
- 最終 1610 tests／129 files 全綠。全套 headless E2E 15 pass／1 個硬體測試另跑；
  Darwin 與 Linux 三段截圖通過；headless Metal 30 秒測試 p95 frame time 9.7 ms，資源數不變。
  `advanceDay` 三筆 benchmark mean 為 0.4740／0.4801／0.4807 ms，p99 為 7.0634／7.0865／6.9382 ms。
  原始記錄保留於 `/tmp/tenka-m6-*`；目前資料仍僅東海與畿內，不作全國效能宣稱。
- M6 尚未 checkpoint；實作與驗收已保存，接續 M7 不依賴的 AI 組件。
  捕虜釋放／處決感情量與 M7 評定容量矛盾已向使用者確認；未決前不推測數值。

## M7 AI 整合記錄（2026-10-08，驗收進行中）

- 平行接入威脅快取、攻略狀態機、四階段評定、內政／外交／反應與委任 AI。
  軍團使用獨立錢包與權限；新增軍團畫面及唯讀 AI 除錯面板。
  存檔 v3 保存下一 tick 指令與撤退重試；決策紀錄不進存檔或 hash。
  實作邊界見 `docs/design/m7-ai-decisions.md`，未改動 `plan/00-foundations.md`。
- 軍團清理 sweep 先用 deterministic checker 建立五處基線，現已歸零。
  實際指令佇列的 A1 一般／上級各跑 720 日，零決策拒絕、零下一 tick 硬拒絕。
  宣戰 miniature 另跑 720 日，發出 61 筆指令，包含八次出陣及三次圍城／從屬。
- 最終單元測試 1762 tests／152 files 通過；lint、typecheck、資料與素材驗證通過。
  新 AI golden 跑 360 日，確認雙次決定論與 180 日存讀檔續跑；實際八次出陣、三次圍城。
  舊 mini／外交／B8／合戰 transcript／replay checkpoint 因 M7 狀態及 BAL 改變而更新。
  指令、fixture 與亂數隔離／篡改偵測斷言不變，各組更新後獨立比較通過。
- Browser 一律 headless，報告不自動開啟。第二輪 16 pass／1 skip，唯一失敗是舊視覺基準。
  三張 diff 均只改變左側軍團導航鈕；Darwin、Linux 更新後各自獨立比較通過。
  像素門檻維持 100、threshold 0.15。最終全套與效能／五種子十年模擬仍在執行。
- 最終 headless E2E 17 pass／1 個硬體測試另跑通過；Metal 20 軍隊／1080p／30 秒
  共 3601 幀，frame time p95 9.8 ms，CPU update p95 0.2 ms，資源數不變。
  十年模擬首次在 seed 1、第 1260 日發現重複城主，已修正自動補任的候選篩選。
  新增小型案例及實際 S1560 續跑回歸；兩項測試通過，不更改合法歸建時序。
  舊 benchmark 未消耗 AI 待執行指令，約 8 ms 結果只代表失真的累積佇列。
  已改用實際 all-AI 佇列後重新量測；原始數據不刪除。
- 真實佇列 benchmark mean 為 3.7830／3.8221／3.8658 ms，p99 為 9.4857／9.5500／9.7325 ms。
  五種子十年模擬尚未通過：修正重複城主後，seed 1 在第 1860 日碰到足利無嗣滅亡。
  義輝死後五名外樣家臣成為浪人，但二條御所及三郡仍屬已滅亡勢力，觸發 INV-02／INV-22。
  06 將自然死亡無嗣的領土處置交給 10，10 只定義無城滅亡，沒有領土受領者規則。
  捕虜當主的敵方接收規則不適用於自然死亡；不得自行推導鄰國吞併。
  B2 也缺少 10 要求的一門繼承人 `off.ashikaga-yoshiaki`；補資料不能取代一般無嗣規則。
  原始時序見 `/tmp/tenka-m7-no-heir-lifecycle-repro.log`，失敗紀錄保留於 simulate final／retry log。
- 修正後全套 1764 tests／153 files 通過，包含既有 golden／replay 與新長期回歸。
  lint、typecheck 與資料檢查重跑通過；軍團清理 checker 仍為零違規。
  本輪 M7 修改尚未 commit，`milestone.json.current` 維持 M6；等待無嗣規則裁決後續跑十年模擬。
- M6、M7 尚未正式 checkpoint：捕虜感情量與評定容量仍待裁決，30 分鐘放置驗收尚未執行。
  M8 事件／存讀檔／全國資料與 M9 校準／部署未完成，不將東海／畿內結果視為全國驗收。
  原始成功及失敗記錄保留於 `/tmp/tenka-m7-*`。

## M8 基礎模組記錄（2026-10-08，接線前驗證）

- 平行實作事件條件、設定及政策型錄；root 實作壓縮存檔儲存層。
  事件條件涵蓋 10 的 22 種純判斷，不改變 state 或 RNG，尚未接入事件執行器。
  設定以逐欄容錯 schema、獨立 localStorage 與受控面板實作，已接入 app／renderer。
- 政策數量依 05 的十二政策修正；deterministic checker 基線 13 筆，分批降至零。
  新型錄比對核心 ID、威信、首月成本與互斥；V14 新增初始兵力上限檢查。
  八城初始兵力由 52,500 修正為 50,805，僅修改超過既定上限的兵力欄位。
  既有 golden／replay 使用 miniature，不因 S1560 資料修正而更新基準。
- 新儲存層提供 14 槽、lz-string 壓縮、IndexedDB 原子批次與記憶體 adapter。
  完整信封保留待執行指令；逐槽序列化避免摘要重建競用，舊版摘要保留遷移標記。
  匯入只回傳預覽，不寫入槽位；下載失敗仍清除 anchor 與 object URL，不開視窗。
  舊 MVP 存檔入口尚未切換儲存介質；已接上待執行指令快照與載入還原。
  季首輪替、dirty 保護及存讀檔 UI 尚待接線。
- 基礎模組驗證時，全套 1934 tests／161 files 通過；lint、typecheck、資料檢查通過。
  事件條件及 schema 共 75 項、設定 11 項、待執行指令結構 62 項測試通過。
  存檔解碼新增完整摘要與 50 種 Command 結構檢查；過期但格式合法的指令仍交下一 tick 驗證。
  字型更新為 1064 字元／226.7 KB；settings 字串已收斂至單一 `zh-TW.ts`。
  第一輪 headless E2E 12 pass／5 fail／1 skip，失敗 trace 與報告另存保留。
  單 worker gameplay 重跑 10 pass／1 fail；四條管理／軍團逾時已通過，不改斷言或逾時門檻。
  三個月檢查在 120 秒截止時才顯示 4 月 1 日；改以 headless Metal 檢查相同流程，15.9 秒通過。
  設定已接上標題／系統選單、DOM 字型與間距縮放、地圖呈現及下一局速度。
  三條新增 settings E2E 以 headless Metal／單 worker 通過（5.0 秒），不開新視窗、不更新視覺基準。
  事件條件及完整 DSL schema 共 159 項測試通過，尚未接入事件執行器。
  季首存檔控制器已原子寫入 blob／摘要／輪替游標，跨 store 的同 adapter 競用已修正。
  dirty／遊玩時間 tracker 共 14 項測試通過，尚未接入 app；延遲存檔不會清除後續進度。
  整合驗證 2050 tests／165 files 通過，lint、typecheck、資料驗證與 production build 通過。
  待執行指令允許跨 tick 批次保存；每 tick 200 筆上限不再誤用為整個存檔佇列上限。
  bridge／MVP 存讀檔接線的 85 項 focused tests 通過；後續 live 指令防護與完整摘要仍在實作。
  後續整合已通過 2150 tests／170 files；lint、typecheck、資料驗證與 build 通過。
  新建摘要包含日期、種子、遊玩秒數、格式版本及槽位標籤；舊版摘要仍可讀，不升版或改寫原 blob。
  live 指令在序列化前驗證，拒絕 NaN／Infinity／偽造 authority；入列深拷貝，避免呼叫端改寫指令。
  23 種事件純數值／改名效果已實作並測試，旗標採 own-property 讀寫；尚未接入事件引擎。
  save/load 受控面板及 UI 接口已完成；Dialog 子頁重設焦點，匯入確認鎖定預覽身分。
  dirty 保護已接入 app；快存成功才標記捕捉進度，快讀接續遊玩時間，modal 期間不執行快存快讀。
  五條 settings／save-progress headless Metal 流程通過；portable headless 視覺 6 pass／1 opt-in perf skip。
  視覺檢查發現換局 reset 清掉 fixture 的選取與預覽，已修正 boot 次序並新增整合斷言。
  相同 build 對原 portable renderer 的三張既有基準全數通過，未更新基準或像素容差。
  Metal 的剩餘差異為 dock 模糊陰影與反鋸齒；非內容消失。字型為 1077 字元／229.2 KB。
  此次歷史驗證時，新控制器、IndexedDB 入口及季首 hook 尚待接線；原始證據保留於 `/tmp/tenka-m8-second-integrated-*`
  及 `/tmp/tenka-m8-final-{progress,portable}-visual`。
  原始記錄保留於 `/tmp/tenka-m8-foundations-*`；M8 與全遊戲均未完成。

### IndexedDB 與存讀檔入口接線（2026-10-08）

- App 已切換至共用 IndexedDB controller；標題可列出存檔，系統選單可存讀十個手動槽，
  三個自動槽與一個快速槽只讀。匯入先預覽，可載入或存入手動槽；匯出不依賴 IndexedDB。
  快存、季首存檔成功後，只清除已捕捉的 dirty 進度；讀檔先恢復玩家佇列，再重設遊玩時間基線。
- 季首以實際 `time.seasonStart`（三／六／九／十二月）觸發輪替，不再每月寫入舊 MVP 槽。
  失敗暫停本局自動存檔，顯示 app 層 sticky critical toast 與 HUD 警示，不寫入 core Report。
  快存失敗提供錯誤對話框及「匯出目前進度」；動作通知採既有繁中字串。
- 舊 localStorage 原檔不刪除。遷移在同 adapter／槽位鎖內原子寫入備份與 handled marker，
  不覆蓋已有 blob（含損毀檔）。寫入失敗時保留可讀 fallback；刪除保留 marker，避免重新掛載後復活。
  fallback 載入深拷貝，晚到的讀取／匯入／列表／存檔通知以世代與通知 ID 隔離。
- F9 改用取消優先的受控確認；app 層 Dialog 也阻擋時間與地圖快捷鍵。
  Ctrl+S 在 modal 輸入框中仍阻止瀏覽器另存網頁。明確讀入的 day-zero 存檔標記 command log 為 truncated。
- focused 驗證：hook 23 項、bridge 40 項、MainScreen／App 25 項、store／autosave 23 項通過。
  九條 headless Metal 存讀檔／設定流程通過（19.7 秒）；測試不開新視窗，單 worker 執行。
  第一輪 7 pass／1 fail 的匯入焦點斷言繞過了檔案選擇按鈕；改為實際 file-picker 流程，保留原斷言，
  production 焦點行為未修改。失敗 trace 保留於 `/tmp/tenka-m8-indexeddb-e2e`。
- 事件基礎新增 34 項純 trigger eligibility 測試，以及 declareWar-only helper 的 5 項測試。
  完整引擎、pending choice／hook 持久化、其他八種 lifecycle 效果與正式型錄仍未接線。
  強制解約的 breaker 身分、執行處死的事件型別及直授官位語意尚需對齊既有系統，不假造事件或效果。
- 補齊 `15 §5.2` 的 `BAL.evtDeclareWarSentiment=20`；BAL hash 為 `b987e1a6b957eada`。
  三套 golden、battle transcript 與兩套 command replay 的實際 checkpoint／final hash 全部不變；
  僅更新六個基準檔的 BAL hash 欄位，篡改指令仍被偵測。未更新視覺基準或像素容差。
  全套 2260 tests／176 files、lint、typecheck、資料驗證與 production build 通過。
  最新 build 的九條 headless Metal 流程全數通過（20.5 秒）；portable headless 視覺六條通過
  （54.2 秒），一條 opt-in 效能測試未啟用。三張原始截圖基準全數通過，未修改任何容差。
  原始記錄在 `/tmp/tenka-m8-fourth-integrated-*`、`/tmp/tenka-m8-final-save-ui-{headless,visual}*`。
  M8、全國資料、M9 與全遊戲仍未完成。

### 事件執行器與持久化接線（2026-10-08）

- 事件引擎可注入正常十三步 tick 與 Command handler。型錄先複製、排序及凍結；
  機率與 AI 選項使用 event RNG stream。共同效果只套用一次，玩家選項於下一個 Step 1 結算。
  正式 s1560 型錄仍為空陣列；預設遊戲尚未啟用引擎，不宣稱歷史事件已可玩。
- `pendingChoiceBinding` 與 `hookSignals` 納入存檔。舊檔僅對缺少欄位補 `null`／`[]`；
  已提供但格式錯誤的欄位直接拒絕。格式版本仍為 3，不猜測通用事件的舊綁定。
  正常 tick 收集 canonical 事件，下一 tick 的 Step 3 消費 hook；注入模式避免重複計算戰績。
- runtime constructor 預先檢查整份型錄，包含當下不可選的分支。
  目前支援 23 種純數值／改名效果、宣戰、年老或戰死；其餘 lifecycle／官位操作及 execution 明確拒絕。
  `randomRegionClan` 尚無完整綁定契約，建構時拒絕，不以空效果取代。
- 受控 EventModal 已有強制選擇、不可逃逸、停用原因提示與打字效果測試。
  元件尚未接入 App；家紋由既有素材入口提供，不捏造歷史圖案。
- Step 13 依注入型錄保留無 owner 的歷史事件報告，不新增玩家關聯或提升 severity。
  預設過濾、通用事件、自動暫停與修剪規則不變；四項整合測試通過。
  replay 可明確傳入相同引擎，重播綁定與選項；缺少或更改型錄會產生 hash mismatch。
  三項新 replay 測試與八項既有測試通過，未更改基準。
- bridge 可明確結算待選事件，不改變手動暫停的速度或所有權。
  玩家指令保留 FIFO、seq 與每 tick 200 筆上限；跨批次讓出主執行緒。
  換局、致命錯誤、合戰或 game-over 中止後續批次；UI 必須重讀真正的 pending 狀態。
  十一項新 session 測試與五十項既有 driver／bridge／loop 測試通過。
  lazy 初始化同步通知後再次確認 session，避免將舊抉擇排入剛替換的新局。
- 新欄位改變 full-state hash。逐份 replay 稽核只移除兩個空欄位後，舊輸出完全相同；
  84 次 hash 呼叫均確認欄位為空。七份基準僅更新 hash，BAL hash 仍為 `b987e1a6b957eada`。
  原始稽核記錄在 `/tmp/tenka-m8-empty-event-fields-audit.log` 與
  `/tmp/tenka-m8-b8-empty-event-fields-audit.log`，篡改及存讀重播檢查保留。
- 第一輪整合 2355 tests／182 files 通過，lint、typecheck、資料驗證及 build 通過。
  字型為 1080 字元／229.9 KB；最終整合另含 paused-choice bridge 與 runtime 測試。
  中途 build 的九條 headless Metal 存讀檔／設定流程通過（19.9 秒），未開新視窗。
- 最終 frozen 全套 2385 tests／186 files 通過；後續 browser gate 使用重新建置的成品。
  frozen typecheck、資料驗證及 build 通過；build 仍有既有大 chunk 警告。
  最新成品的十五條 headless Metal gameplay／軍團／存讀檔／設定流程通過（39.0 秒）。
  原始記錄在 `/tmp/tenka-m8-event-frozen-*` 與 `/tmp/tenka-m8-event-final-headless*`。
  此階段不代表 M8、全國資料或全遊戲完成。
- portable headless 視覺六條通過（39.5 秒），一條 opt-in GPU 效能測試未啟用。
  三張既有截圖基準通過；未修改基準或像素容差。原始記錄在 `/tmp/tenka-m8-event-final-visual*`。

### 歷史型錄與事件 App 路徑（2026-10-08）

- `events.json` 已轉錄 10 §3.5 的十五份歷史事件：日期窗、條件、共同效果、選項、權重與敘事。
  十九項型錄測試通過；僅移除 Markdown 段落硬換行，不新增史實或刪除未支援的操作。
  s1560 loader 仍回傳空事件陣列，完整型錄尚未啟用；六份通用事件仍未落地。
- 資料驗證器接受 canonical 與舊版事件 DSL，保留完整世界的遺失引用檢查。
  地方驗證只保留已載入引用的事件，不冒充全國完整；三項新增驗證測試通過。
  型錄仍引用尚未載入的四勢力及十二武將，須隨全國資料補齊。
- 純 view-model builder 使用待選存檔的實際綁定，提供逐條條件提示及明確插值失敗。
  不猜測 region 或 cost；固定事件的舊綁定回復沿用引擎的 owner 次序。
  App 已掛載 EventModalHost，選項經 bridge 正常結算；資料無法回復時維持必要暫停並提供匯出。
  host 六項測試通過；第一輪兩個日期斷言誤認 tiny fixture 為 day-zero，已按實際初始日修正。
  App 的 sibling key 重複警告已以獨立 event key 修正，未改變遊戲進度。
- `makeRonin` 支援非當主出奔；出陣部隊歸建最近原勢力城，清除軍事引用及原職務。
  移籍 helper 要求明確指定收件城，dispatcher 暫未啟用移籍操作。
  活著的當主出奔及無可歸建城時明確拒絕；目的地與非死亡繼承政策已詢問使用者，尚未定案。
  十四項新增 lifecycle 測試與十一項 dispatcher 測試通過，不改寫死亡事件。
- 引擎的可選 preflight 在提交前以分離副本驗證實際共同效果及 AI 選中分支。
  不驗證未選的動態分支；靜態型錄支援檢查仍涵蓋全部分支。
  正式套用重播原本的機率、共同效果及 AI RNG 次序，不複製 probe RNG 回真實狀態。
  十一項新增 preflight 測試通過；失敗不留下該事件的 fired、cooldown、效果或訊息。
  先前事件、hook 消費與到期效果不回滾；任意外部副作用不在純 adapter 契約內。
- 補齊 15 §5.2 的 `evtTransferLoyalty=60` 與 `evtHonnojiOdaCastleMin=25`。
  BAL hash 為 `c77867e48d82db83`。六項獨立稽核證明全部既有軌跡及戰鬥 hash 不變；
  僅更新六份基準的 BAL hash，未重錄玩法輸出。記錄在 `/tmp/tenka-event-balance-audit.log`。
- 字型掃描器新增歷史敘事與選項文字，不掃描 DSL ID 或效果名稱。
  再生成前如實偵測 267 個缺字；成品為 1356 字元／287.7 KB。
  既有字型健康檢查在生成前有兩項失敗，失敗記錄保留；生成後資料驗證通過。
  第一輪全套 2422 pass／10 fail，包含 schema 不相容、過期 makeRonin 測試及 BAL metadata 漂移。
  schema、測試及經稽核的 metadata 已修正；後續最終整合記錄另列，不省略失敗證據。
- 最終全套 2452 tests／193 files、typecheck、lint、資料驗證與 build 通過。
  三項實際 App 測試通過：正常 tick 恰結算一次、讀檔綁定重建文字、型錄缺席時匯出保留進度。
  App 測試最初誤呼叫不存在的 `actions.setGame`，修正為正式 `setGame` 入口，不改 production。
  原始記錄在 `/tmp/tenka-event-live-final-*` 與 `/tmp/tenka-app-event-integration-*`。
- 新 headless case 第一輪在存檔頁等待匯入，且使用錯誤按鈕標籤，未到達事件 host。
  已改為返回系統選單、進入讀檔頁，再點選實際「匯入存檔」。
  不改 production 或匯出完整狀態斷言；失敗 trace 保留於 `/tmp/tenka-event-live-headless`。
  既有十五項 headless flow 通過；新 case 修正後獨立重跑一項通過（2.6 秒）。
  重跑記錄在 `/tmp/tenka-event-host-headless-rerun.log`。
- 更新字型後的 headless visual 六項通過，一項 opt-in GPU 效能測試跳過（42.5 秒）。
  六份既有 screenshot 基準的 SHA-256 不變；未改基準或容差。
  新 browser case 加入後，typecheck 與完整 lint 再次通過。
  記錄在 `/tmp/tenka-event-live-visual.log` 與 `/tmp/tenka-event-live-final-*-2.log`。
- 後續加入 10 §5.5 秋收 consumer：只讀當年本勢力 `harvest.<year>.<clanId>`。
  豐凶倍率先與難度倍率相乘，再向下取整及限制倉容量；溢出與入倉報告維持原契約。
  四項新測試及三項既有軍團經濟測試通過；八項 golden 檢查亦通過，未更新軌跡基準。
  此項不實作動態旗標 producer，也不啟用汎用型錄。
  記錄在 `/tmp/tenka-event-harvest-*`。
- 商人政策改讀本勢力接受旗標，不再以全域 `events.fired` 推定接受。
  `pol.nanban` 與 `pol.kakishuchu` 的事件途徑免威信及設施門檻，仍檢查費用、冷卻、槽位與互斥。
  十二項新增檢查及十五項既有內政檢查通過；未添加遷移或動態旗標生成。
  記錄在 `/tmp/tenka-event-policy-*`。
- 強制締約支援新建、有限月數的同盟及停戰；沿用正常締約的感情增量與標準事件。
  不扣信任或資源；自家、未知、滅亡及未綁定引用略過。全批次先驗證，不留下前半段效果。
  婚姻、從屬、無期限、同型續約及同盟／從屬衝突仍明確拒絕，不視為完整締約 DSL。
  二十四項新增測試及六檔合計七十九項檢查通過，包含停戰解除圍城及存檔／replay。
  記錄在 `/tmp/tenka-m8-forced-event-pacts.log`；正式型錄仍未啟用。
- 凍結三份實際 codec 輸出的存檔：v1 取自 `e4b711f`，v2 取自 `661ac6e`，v3 取自目前工作樹。
  不刪現代欄位偽造舊檔；provenance 分別記錄來源、原始輸出及格式化成品 SHA-256。
  六項相容性檢查通過：遷移保留軍隊、武將、勢力、RNG、運輸及待執行指令。
  真實玩家指令只套用一次；三十日與十五日中途存讀檔續跑的狀態及 hash 一致，每日 invariant 零違反。
  成品在 `tests/fixtures/saves/`；未修改 codec 或遷移規則。
- 新 consumer 整合第一輪 2497 pass／1 fail：舊 PolicyPanel 測試仍以全域 fired 推定商人接受。
  失敗記錄在 `/tmp/tenka-event-checkpoint-unit.log`；改測 fired-only 拒絕及本勢力接受旗標生效。
  不改 production 或放寬斷言；同輪 typecheck、lint、資料驗證及 build 通過。
- 修正 UI fixture 後，全套 2498 tests／197 files 通過（19.86 秒）；typecheck 與完整 lint 通過。
  最新 build 的二十一項非 visual headless flow 全部通過（45.3 秒），包含五項 M6 真實 UI 流程。
  記錄在 `/tmp/tenka-event-checkpoint-unit-pass.log`、`/tmp/tenka-event-checkpoint-*-pass.log`
  與 `/tmp/tenka-event-checkpoint-headless.log`。
  最新 build 的 portable visual 六項通過（38.0 秒），一項 GPU workload 另行 opt-in 執行。
  六份 screenshot 基準 SHA-256 不變，記錄在 `/tmp/tenka-event-checkpoint-visual.log`。
- Apple M3 Max／Metal 的 opt-in GPU headless workload 通過：1080p、二十部隊、30.007 秒。
  共 3600 frames（平均約 119.97 FPS），P95 frame time 9.8 ms，前後 renderer 資源數一致。
  原始逐 frame 記錄保留於 `/tmp/tenka-event-checkpoint-gpu/`；不取代全國效能或三十分鐘驗收。

## 六筆汎用事件與觸發呈現（2026-10-08）

- 六筆汎用事件依 10 §3.6 收錄於 `events.json`，史實十五筆的內容 hash 不變。
  汎用日期窗為 null／null，不添加表中不存在的 1585 到期日；史實日期窗仍須兩端日期。
  schema 與參考型別同步更新；00 基礎規則及史實表未改。
- 結構旗標 key 以 prefix、目前年份及明確勢力串接；舊字串仍為字面值，不執行表達式。
  未綁定、未知及滅亡勢力的結構 key 略過；條件求值不消費 RNG。
  疫病加入人口門檻及兵力減去 floor(現兵 × pct / 100)，不誤改為剩餘兵力取整。
- 地震自完整九地方排序清單抽一，不因尚未載入資料而重抽或縮小候選。
  依國別展開該地方全部城／郡效果，每個受影響存活勢力各發一件標準 `event.fired`。
  全域冷卻先於抽選；未載入地方仍消耗冷卻，但不虛構收件勢力。
- 十三項真實 generic runtime 測試通過，含秋收掛鉤、同年互斥、商人接受／拒絕、疫病及地震。
  存檔續跑與 replay 全狀態一致；獨立稽核證明六份既有玩法軌跡均不變。
  BAL 新增十九個 canonical 常數；hash 為 `5b15e2f6f4bd3e41`，僅更新六份基準的 metadata。
  原始稽核記錄在 `/tmp/tenka-generic-runtime-balance-audit-final.log`。
- 觸發 observer 保留真正 binding，在共同效果及 AI 選項結算後產生呈現資料。
  外殼保存字串 VM，不從事件 ID 猜郡或地方，也不偽造 core pending。
  歷史事件及玩家相關汎用事件沿用 modalQueue；AI 已選事件僅提供繼續，不重做選擇。
  observer 例外隔離不保證回滾任意 callback 副作用；呼叫端必須唯讀且不消費 RNG。
- Host 新增 FIFO、既有手動暫停、系統選單交接、字串快照及真實商人成本檢查。
  初次四項失敗源於 fixture 直接從月初再推進一日；修正為前一日，不改 Tick 次序。
  修正後十一項 Host 及四項實際 App 檢查通過，包含真實 Step 3 秋收呈現。
  點繼續不增加指令或推進 core；記錄在 `/tmp/tenka-generic-real-app-tests.log`。
- 字型成品更新為 1396 字元／296.5 KB，資料驗證零錯誤、零警告且零簡體字命中。
  記錄在 `/tmp/tenka-generic-narrative-font.log` 與 `/tmp/tenka-generic-data.log`。
  整合全套及 headless 驗收結果另列；未啟用部分型錄取代完整事件系統。
  正式型錄接線、其餘史實效果、全國資料與 M9 仍未完成。
- 第一輪全套 2563 pass／1 fail：validator 舊測試仍期待十五筆，已改為精確十五史實加六汎用。
  同輪 typecheck 揭露新 App fixture 誤用 Testing Library 不支援的 `exact` option，已刪除此 option。
  原始記錄在 `/tmp/tenka-generic-final-unit.log` 與 `/tmp/tenka-generic-final-types.log`。
  修正後 2564 tests／205 files、typecheck、lint、資料驗證及 build 通過，未放寬 schema 或容差。
- 待選 pointer 若誤指無選項事件，VM 明確拒絕，不顯示無法解凍的假「繼續」按鈕。
  Host 保持 mandatory 並提供完整進度匯出；兩項新增檢查證明不修補或推進 core。
  guard 後 2566 tests／205 files、typecheck、lint、資料驗證與 build 通過。
  記錄在 `/tmp/tenka-generic-final-unit-guard-pass.log` 及同前綴各項驗證記錄。
- 該 build 的二十一項 headless flow 通過（45.2 秒），portable visual 六項通過（39.9 秒）。
  六份 screenshot 基準 SHA-256 不變；GPU workload 另行 opt-in 通過（32.2 秒）。
  flow 與 visual 記錄在 `/tmp/tenka-generic-final-headless.log`、`/tmp/tenka-generic-final-visual.log`。
- Apple M3 Max／Metal 在 1080p、二十部隊、30.006 秒產生 3600 frames，平均約 119.98 FPS。
  P95 frame time 9.9 ms，前後 renderer 資源數一致；逐 frame 記錄在 `/tmp/tenka-generic-final-gpu/`。
- 後續唯讀審查發現 Host 的 pending 優先分支違反既有 modal FIFO。
  較晚的待選事件會搶在已排入的敘述事件前，也可能與系統 Dialog 同時顯示。
  上述驗收是修正前的 build；下一步以同一 owned descriptor 佇列修正，不改 core pending 或 Tick。
- FIFO 修正讓 resolved 字串 VM 與 pending 事件識別共用既有 modal descriptor。
  待選 VM 仍依當前 core 重建；正常 tick 移除失效識別，繼續不能略過 mandatory 選擇。
  同 tick 的敘述 A 先於選擇 B，且其他 Dialog 啟用時 Host 不再疊加第二個 Dialog。
  App 讀檔先重設 UI 與暫停狀態，再還原 bridge，以免清掉已還原的待選 descriptor。
  六檔五十二項 focused tests、typecheck、scoped lint 及格式通過；全套結果另列。
  記錄在 `/tmp/tenka-event-fifo-second-tests.log`；初次 test-only lint 失敗另存同前綴 lint 記錄。
- FIFO 後全套 2570 tests／205 files 通過；獨立實際 quick-load 檢查另揭露未推進 Tick 的轉場缺陷。
  已存合戰與結局原先留在地圖，兩項失敗記錄在 `/tmp/tenka-app-session-restore-before.log`。
  App 轉場 effect 現在訂閱 gameEpoch，且結局優先於未決合戰。
  初修正使真實 EndingScreen 暴露新陣列 selector 的 render loop；改用既有版本快取 hook。
  三項還原、五項事件及一項合戰結果檢查通過，記錄在 `/tmp/tenka-app-session-restore-second.log`。
  中間 render loop 與 test-only lint 失敗分別保留在 restore-after 與 fifo-full-lint 記錄。
- 還原修正後全套 2573 tests／206 files、typecheck、完整 lint、資料驗證及 build 通過。
  最新 build 二十一項 headless flow 全部通過（45.1 秒），portable visual 六項通過（38.4 秒）。
  六份 screenshot 基準 SHA-256 不變；另行 opt-in 的 GPU workload 通過（32.2 秒）。
  記錄在 `/tmp/tenka-session-final-unit.log` 與同前綴 types、lint、data、build、headless 記錄。
- 最終 Apple M3 Max／Metal headless workload：1080p、二十部隊、30.005 秒、3600 frames。
  平均約 119.98 FPS，P95 frame time 9.9 ms，前後 renderer 資源數一致。
  原始逐 frame 記錄在 `/tmp/tenka-session-final-gpu/`，不代替全國或三十分鐘效能驗收。

## 八種大命與公式接線（2026-10-08）

- 八種大命依 10 §3.7.3 建立排序及凍結型錄，使用既有 Clan.taimei，不新增存檔欄位或版本。
  解鎖依官位、幕府役職及威信；成本、共用冷卻與八筆門檻集中於 BAL。
  玩家指令仍走正常下一 Tick Step 1，委任 authority 不得發動，可信 NPC clan 保留合法入口。
- 即時徵兵依城容量及人口比例分攤，獻金免役依空倉比例入庫，餘數按 ID 排序分配。
  十九項 core 測試涵蓋即時資源、溢位、鎖定、共用冷卻、重播及 inclusive 到期。
  有或沒有事件型錄的正常 Step 3 都執行到期；清除 activeUntilDay，但保留冷卻日。
- 七個實際公式接線涵蓋徵兵量、商業、外交信用、建設、城防、耐久減損及陸路行軍。
  既有 sea 日速不改；十項新增 consumer 檢查及九十一項既有檢查通過。
  05／15 沒有徵兵金錢成本，成本倍率 0.5 保留於 API，免費徵兵仍免費，不假造節省效果。
  09 未定大名 AI 大命發動時機，不添加自主策略；D19 記錄此邊界。
- 存檔新增 shape／型錄識別防線，未知大命、錯誤日期與額外欄位直接拒絕，不修補偽造狀態。
  十四項新存檔檢查、四項 authority 檢查及六項凍結 v1–v3 續跑檢查通過，歷史 fixture 未重製。
  初次平行驗證碰到 Step 3 尚未補上 import；完整接線後二十項 persistence／fixture 檢查通過。
  原始記錄在 `/tmp/tenka-taimei-persistence-first.log` 與 `-second.log`。
- BAL hash 改為 `05ef28c53411a587`；獨立稽核確認三套 golden、兩套 command replay 與合戰全軌跡不變。
  六份基準僅更新 BAL metadata，十九項既有 golden／replay 檢查再通過。
  暫時稽核測試已移除，原始記錄保留於 `/tmp/tenka-taimei-balance-audit-second.log`。
  第一次稽核誤寫 runner 名稱的失敗另存 `/tmp/tenka-taimei-balance-audit.log`。
- 字型掃描新增程式型錄名稱與說明；十九項字型檢查通過。
  成品為 1404 字元／297.9 KB，記錄在 `/tmp/tenka-taimei-font.log` 與 `-font-tests.log`。
  新增實際 headless Taimei 確認、正常下一 Tick、HUD 與 quick save/load 流程；整合結果另列。
  正式歷史型錄啟用、全國資料、平衡及 M9 發版仍未完成。
- 大命面板、F7、確認 FIFO、HUD 與唯讀佇列 guard 的四十六項 focused UI 檢查通過。
  初次 UI render 呼叫會初始化 bridge 的 getter；改用不初始化的佇列查詢後通過。
  原始記錄在 `/tmp/tenka-taimei-ui-first-tests.log` 與 `-second-tests.log`。
- 首次全套 2631 通過、一項失敗：舊測試仍把大命當作未註冊指令。
  測試改用不屬戰略佇列的合戰子迴圈指令，仍檢查 notImplemented；全套 2632 通過。
  原始失敗與重跑記錄在 `/tmp/tenka-taimei-final-unit.log` 與 `-unit-pass.log`。
- 實際 headless 匯入揭露 main→main 讀檔後 F7 無效，不是測試等待不足。
  uiStore reset 回到 title，但 App 的 screen 不變，原同步 effect 不再執行。
  同步加入 gameEpoch；真實 App 讀檔回歸先失敗，修正後八項 focused 檢查通過。
  原始記錄在 `/tmp/tenka-taimei-headless-first.log`、`-second.log` 與 `-reload-before.log`。
  修正後全套 2633 tests／213 files 通過，記錄在 `/tmp/tenka-taimei-reload-unit.log`。
- 新 Taimei headless 流程通過（3.3 秒），記錄在 `/tmp/tenka-taimei-headless-fourth.log`。
  第三次測試已確認 F7 修正，但 selector 把關閉圖示算為第九張卡；限縮至卡片後通過。
  取消與確認前都不改 core；正常下一 Tick 扣成本、啟用 HUD，quick load 保留效果及手動暫停。
  typecheck、完整 lint、資料驗證與 build 通過；Vite 仍提示既有大型 chunk，不隱藏警告。
  記錄在 `/tmp/tenka-taimei-reload-types.log`、`-reload-build.log` 及 `-integration-full-lint.log`。
  資料驗證為零錯誤、零警告，記錄在 `/tmp/tenka-taimei-final-data.log`。
- 最新 build 二十二項 headless gameplay flow 全部通過（54.3 秒）。
  Portable visual 五項通過、一項失敗、一項 opt-in 略過；三個 camera screenshot 超過既有 100 pixels 門檻。
  三張 diff 的紅色標記分別為 1665、1634、1653 pixels，全部位於 HUD／左側導覽列。
  地圖與其他區域沒有超過原 threshold 的標記；不宣稱 raw pixels 完全一致。
  六份 screenshot 基準 SHA-256 不變，未放寬 tolerance；已詢問是否接受新控制項的基準更新。
  原始記錄在 `/tmp/tenka-taimei-final-headless.log`、`-final-visual.log` 及 `-visual-diff-audit.log`。
- 另行 opt-in 的 headless GPU workload 通過（32.1 秒），不開瀏覽器視窗。
  Apple M3 Max／Metal 在 1080p、二十部隊、30.0065 秒產生 3600 frames，平均約 119.97 FPS。
  P95 frame time 9.7 ms，前後 renderer 資源數一致；逐 frame 記錄在 `/tmp/tenka-taimei-final-gpu/`。
  最新整合 typecheck 與 E2E lint 通過，記錄在 `-final-integration-types.log` 與 `-final-e2e-lint.log`。
- 下個可獨立實作項目為 M8-21 報告中心：分類、年月、warning 篩選、每頁五十筆及明確的地圖前往。
  月初摘要另需支出明細、摘要月份邊界及自動繼續設定；不能從目前 state 偽造歷史支出。
  全部遊戲尚未完成；本次沒有 commit、push 或發版。

## 報告中心與完整報告渲染（2026-10-08）

- 報告中心接入通知堆疊固定入口及 R 快捷鍵；既有 mandatory／系統 Dialog 保留互動所有權。
  六種分類、warning 以上、含首尾月份的日期篩選、新到舊排序及每頁五十筆皆讀取保留報告。
  UI 不標記 read、不派指令、不推進 Tick，也不改 RNG；前往只使用事件保存的有效城／郡座標。
- 純 VM 九項、面板五項、renderer 二十五項 focused 檢查通過。
  Root 入口、MainScreen 與六套既有 replay 的六十項整合檢查通過。
  UI 初次 matcher 與 private time import 失敗另存 `/tmp/tenka-reports-ui-first-tests.log` 及 `-ui-lint.log`。
  面板公開時間 API 接線及最終五項檢查記錄在 `/tmp/tenka-reports-ui-final-tests.log`。
- 報告 renderer 為目前六十九種事件明確決定文字或規格要求的抑制，不再依 default-null 漏掉 M6／M8。
  六十八種 canonical 事件及 command.rejected 都有分支；秘密調略與挖角通報仍遵守 13 的視角規則。
  年齡依事件日計算；事件標題從唯讀 session 型錄注入，未載入型錄時顯示事件識別，不假造史事。
- BAL 新增既有 15 §5.3 的 uiReportPageSize＝50，hash 改為 `7634217400759e66`。
  獨立稽核確認三套 golden 全部物件、兩套 command replay 及合戰全軌跡不變。
  六份基準只改 BAL metadata；原始記錄在 `/tmp/tenka-reports-balance-audit.log`，沒有重錄 golden。
- 初版全套 2668 tests／216 files、typecheck、完整 lint、資料驗證與 build 通過。
  字型為 1421 字元／300.7 KB；零資料錯誤、零資料警告、零簡體字命中。
  原始記錄在 `/tmp/tenka-reports-final-unit.log` 與同前綴 data、build、integration-types、integration-lint。
  Headless 實際 import／篩選／分頁／前往驗證仍在執行；整合結果另列。
  月初摘要、歷史型錄啟用、全國資料與 M9 完整驗收仍未完成。
- 首次 headless 已通過三頁與分類切換，但日期下拉的 native label 包含所有 option 文字，精確 label 查詢失敗。
  加上獨立 aria-label，年份改傳字串以免顯示千分位；日期 focused 五項及重跑 headless 通過（4.2 秒）。
  原始失敗與成功記錄在 `/tmp/tenka-reports-headless-first.log` 與 `-second.log`。
  Headless 確認完整 core 及 read flags 不變、正常暫停不變；只有明確前往按鈕觸發導航。
- 新增 MainScreen→真實 MapHandle 的導航 spy，初次使用目前 Vitest 不支援的 matcher。
  已改用原生支援的次數與參數兩項斷言；原始失敗保留在 `/tmp/tenka-reports-goto-tests.log`。
  對應 typecheck 與 lint 失敗另存 `-final-types.log` 與 `-final-lint.log`，後續整合結果另列。
- 導航 spy 改用兩項支援的斷言後，MainScreen 二十五項檢查通過，記錄在 `/tmp/tenka-reports-goto-second.log`。
  平行審查另發現 retention 移除舊月時，選中的日期 option 消失，但隱含篩選界線仍保留。
  月份選項現涵蓋保留報告與已選界線，不默默重設使用者篩選；六項面板檢查通過。
  原始記錄在 `/tmp/tenka-reports-retention-tests.log` 與同前綴 lint、types 記錄。
- retention 修正後全套 2670 tests／216 files 通過，二十三項 headless flow 通過（57.7 秒）。
  圖片檢視發現浮動通知遮住報告中心右側控制項；上述綠燈不能證明此版視覺完成。
  新增暫隱 ReportStack 的 presentation prop，保留 sticky 與原計時，不改 core/read 或全域層級。
  11 §8 D22 記錄互動邊界；遮擋原圖在 `/tmp/tenka-reports-final-headless/`，修正後結果另列。
- 暫隱修正後全套 2671 tests／216 files、typecheck、完整 lint 與 build 通過。
  Headless 單條實際流程再通過（4.0 秒）；1280×720 圖片確認關閉、前往及分頁控制項沒有浮動通知遮擋。
  記錄在 `/tmp/tenka-reports-conceal-unit.log` 與同前綴 types、lint、build、first 記錄。
  最新圖片在 `/tmp/tenka-reports-conceal-first/`；完整瀏覽器與效能結果另列。
- 最新 build 二十三項 headless gameplay flow 全部通過（48.4 秒），記錄在 `/tmp/tenka-reports-conceal-headless.log`。
  Portable visual 五項通過、一項失敗、一項 opt-in 略過（1.6 分鐘）；六份基準與 tolerance 保持不變。
  三張 camera diff 紅色標記為 8523、8492、5872 pixels，全部位於 HUD／左欄／新增報告中心入口。
  其他區域零 threshold 標記；不把此結果當作 screenshot gate 通過，也不宣稱所有 raw pixels 一致。
  原始記錄在 `/tmp/tenka-reports-final-visual.log` 與 `-visual-diff-audit.log`；基準更新仍待使用者選擇。
- Headless GPU workload 通過，正常終止碼為零；測試本體 31.2 秒，含 teardown 全程約 1.1 分鐘。
  Apple M3 Max／Metal 在 1080p、二十部隊、30.0053 秒產生 3600 frames，平均約 119.98 FPS。
  P95 frame time 9.1 ms，前後 renderer 資源數一致；逐 frame 原始記錄在 `/tmp/tenka-reports-final-gpu/`。
  結果不代替全國、三十分鐘 soak 或 M9 效能驗收。
- M8-21 的報告中心部分已接線並驗證，月初摘要仍缺歷史支出明細、月份邊界與設定契約。
  下一個獨立項目為 M8-22 十二形狀 SVG 家紋 renderer；劇本尚無形狀分配欄位，不能假造歷史家紋。
  本次沒有 commit、push、基準圖重錄或發版；整個遊戲仍未完成，goal 保持 active。

## 十二形狀家紋與開發元件展示（2026-10-08）

- 平行實作十二式 `KamonIcon`、六族完整 SVG icon 與 DEV-only `ComponentGallery`。
  renderer 的 44 項測試涵蓋十二形狀 × 三尺寸、交錯重複序列化、幾何、語意與狀態／RNG 不變。
  家紋為呈現用幾何，不是史實摹寫；未指定尺寸與表格衝突記錄於 11-D23。
- 現有 Clan／劇本沒有形狀欄位。HUD 與事件浮水印採通用 ring、實際勢力色及 `#EDE4D3`。
  明確呈現 spec 優先，缺勢力不渲染；不增加存檔欄位、不按名稱猜史實家紋。
  HUD 保留 64px 家紋與 24px 短名；足利將軍家顯示足利，長名不換行並受 72px 寬度限制。
- Gallery 位於 `#/dev/components`，只在 DEV 載入；二十個錨點包含既有十九元件與家紋。
  展示六族共 38 glyph 的 16／24／32px、十二家紋的 16／24／64px、650 列真實虛擬表格。
  對話框、選單、滑桿、通知與選取只改展示資料；app helper 建隔離 store，動作 fail-closed。
  provider 同時隔離 game selector 與 cached tick，預設仍訂閱 live store；遊戲／RNG／佇列隔離測試通過。
- 補齊十二個原創 native SVG glyph；舊 glyph 幾何不變。sm IconButton 改為 32px hit area 與 16px glyph。
  md 維持 32／24px，lg 維持 56／42px；小尺寸光學簡化也適用於實際 sm 按鈕。
- 首次完整驗證的 2767 項測試通過。axe 首輪發現三個未命名耐久 bar、勢力 span 禁用屬性與通知 article 角色問題。
  修正實際元件，不遮罩 Gallery：耐久 bar 增無可見副作用的名稱，勢力識別使用 group，通知根節點改 div。
  勢力 aria-label 去除重複的家字；可見完整名稱不變。
  其餘五處 production 與四處 Gallery 的 ProgressBar 呼叫均使用既有語意名稱。
- 修正後完整測試先出現兩個舊 `closest('article')` 測試假設失敗，改依 status／alert 角色查詢。
  最終 **2772 tests／224 files 通過**；types、完整 lint、data 與 production build 通過。
  原始結果在 `/tmp/tenka-kamon-verified-{types,lint,data,build}.log` 與 `-unit-pass.log`。
  失敗記錄仍保留於 `-unit.log`；首次架構 lint 與元件測試失敗也未刪除。
- `npm run e2e:gallery` 最終四條 headless 流程通過，6.4 秒；四個狀態的 axe 全 impact violations 均為空。
  pageerror／console.error 均為零；raw JSON 與實際圖片在 `/tmp/tenka-gallery-verified-artifacts/`。
  contrast 仍有 incomplete checks，不能宣稱完整 WCAG 認證；鍵盤流程只證明已測控制項，不代表十九元件所有狀態。
  八組 canonical 色票對比的自動算術驗證仍通過；首輪 axe 證據保留於 `/tmp/tenka-gallery-first-artifacts/`。
- Production **24 條 headless gameplay 通過**，49.7 秒；新增真實足利開局、家紋尺寸、短名與 DEV route 不可用測試。
  App 真實 pending event 測試也確認裝飾性 64px watermark 與原有單次 canonical tick。
  1280×720 HUD 與十二家紋／六族 icon 圖片經檢視；production 七個 JS／HTML 檔的 Gallery 字串掃描零命中。
  原始記錄在 `/tmp/tenka-kamon-verified-headless.log` 與 `/tmp/tenka-kamon-production-gallery-scan.log`。
- Portable visual gate 為五通過、一 screenshot 失敗、一 GPU skip，43.1 秒。
  overview／operational／close 分別差 18427／18396／14724 pixels，原本的門檻與六張基準圖均未改。
  diff 高亮只落在 HUD、家紋／sidebar、通知／報告入口與面板關閉鈕；其他區域零高亮。
  原始圖片與 trace 在 `/tmp/tenka-kamon-verified-visual/`，區域計數在 `-visual-diff-audit.log`。
- Headless GPU workload 通過且正常終止；Apple M3 Max／Metal、1080p、二十部隊、30.0059 秒。
  3600 frames 的平均約 119.98 FPS，P95 frame time 9.8 ms；前後 renderer 資源數一致。
  原始逐 frame 數據在 `/tmp/tenka-kamon-verified-gpu/`；不代替全國或三十分鐘 soak 驗收。
- 字型掃描補上 DEV fixture、Gallery 字串與 JSX 文字；子集為 1453 字元、307.9 KB，覆蓋率通過。
  新增 axe-core 4.14.0 為 dev dependency。dependency audit 有 15 項警示，其中三項 critical，axe-core 零警示。
  警示涉及現有工具鏈及 transitive packages，未執行廣泛或 major-version 自動修復；發版前仍須獨立驗證修復。
- 歷史事件完整啟用、全國 B3–B9、月初歷史收支摘要、完整 reduced-motion／keyboard 與 M9 長期驗收仍未完成。
  未 commit、push、重錄 screenshot baseline 或發版；整個遊戲仍未完成，goal 保持 active。

## 動態減量、快捷鍵與介面縮放（2026-10-08）

- 平行完成 OS 動態減量 provider、地圖鏡頭／攻城靜態化、主要快捷鍵與縮放版面。
  `matchMedia` 採初始值及變更訂閱，卸載時清理；CSS 裝飾動畫停用，ProgressBar 資訊轉場保留 300ms。
  ResourceBar、事件打字機與通知離場取消裝飾補間；通知的資訊保留時間不因偏好變動重置。
  地圖停用特效另依既有 `effectsEnabled`；OS 偏好不是存檔或模擬狀態。
- 鏡頭在動態減量下直接定位並取消慣性；攻城裝飾停止旋轉，部隊實際位置與數值照常更新。
  `AweShockwave`／`BattleSpark` helper 尚未由 live renderer 掛載；既有粒子完整清理策略仍未完成。
  本階段不宣稱完整 T12 或全部戰鬥特效驗收。
- 接線 F1～F7、Home、M、WASD／方向鍵、縮放及 R；面板開啟但背景聚焦時仍可操作地圖。
  輸入、控制項、面板焦點與 modal 保留各自語意；按住方向鍵的 RAF 在失焦或 modal 時取消。
  F5 為政策，Ctrl+S／F9 依 16-D9；戰鬥速度鍵只改本地時鐘。
  Dialog 的 Enter 只執行明確標記的主要動作，危險確認採取消；不猜測強制事件選項。
- 縮放採 16 的使用者倍率 0.8～1.5，不採 11 舊自動倍率；11-D24／D25 與正文同步裁決。
  CSS／Main literal checker 首輪 93 個，擴大 inset／grid 欄位又找到九個，全部修正至零。
  Inline checker 另找到 ProgressBar、StatBar、Tooltip 三個未縮放尺寸，修正至零。
  兩個 checker 的注入控制均回報一個違規；排除 SVG 幾何、實體座標、邊框與操作區下限，不宣稱涵蓋所有動態樣式。
- 虛擬表格將邏輯尺寸乘倍率，以 ResizeObserver 的實際可視高度計算列與 spacer。
  MiniMap 保留 canvas buffer，顯示矩形轉回邏輯指標座標；受 HUD／下方面板可用高度限制。
  面板與左欄使用 viewport 上限及捲動，操作區保留至少 32px。
- 第一輪八項 headless 新流程通過；加上已完成進場的 context／minimap 與真實武將表檢查後出現四項失敗。
  武將表在 720px 及 1080p／1.5 倍向下溢出，原因是 header／filters 加在固定表格高度之外。
  OfficerList 改為剩餘高度 flex 鏈，650 列／三倍率實際測量測試通過；後續八項 headless 通過。
  圖片檢視再發現常駐報告入口遮住登用鈕；11-D26 只暫隱入口，緊急通知的 DOM 身分及計時不變，R 仍有效。
- CSS contract 測試先遇到 raw module 與 HTTP URL 的測試讀取錯誤，修正為實際 CSS 檔案讀取。
  所有失敗記錄保留於 `/tmp/tenka-layout-settled-headless.log`、`-verified-unit.log` 與相關 traces。
  最終 **2819 tests／232 files 通過**；types、完整 lint、data 與 production build 通過。
  原始記錄在 `/tmp/tenka-layout-complete-{types,lint,unit,data,build}.log`；字型仍為 1453 字元。
- Gallery 四項 headless 通過，四個 axe 狀態 violations 為空；contrast incomplete 仍為 26／1／4／26 nodes。
  原始記錄與 JSON 在 `/tmp/tenka-layout-gallery.log` 及 `/tmp/tenka-layout-gallery/`。
  Portable visual 五通過、一 screenshot 失敗、一 GPU skip；三張差異為 19924／19880／16374 pixels。
  六張基準、tolerance 及 plan/00 均未改；diff 圖仍保留於 `/tmp/tenka-layout-visual/`。
- 最終 production **32 項 headless 流程通過**，約 1.1 分鐘；包含原有 24 項及八項新流程。
  六個 viewport／倍率組合使用真實設定、城／出陣／報告／大命／武將表，不用空 fixture 或 screenshot 遮罩。
  OS 偏好初始／即時變更、資訊轉場、實際鏡頭像素及策略狀態不變均通過。
  記錄與已完成進場的實際圖片在 `/tmp/tenka-layout-complete-headless.log` 及同名目錄。
- Headless GPU workload 通過且正常終止；測試 30.5 秒，全程 31.5 秒。
  Apple M3 Max／Metal、1080p、二十部隊、30.0049 秒及 3600 frames，平均約 119.98 FPS。
  P95 frame time 9.7ms，前後資源數相同；原始逐 frame 資料在 `/tmp/tenka-layout-complete-gpu/`。
  此結果不代替全國效能、三十分鐘 soak 或 M9 長期驗收。
- 小於 1280×720 的遮罩／暫停與 Battle Escape 共用系統選單仍待實作。
  下一階段必須保留手動暫停所有權、阻擋戰鬥本地計時，恢復尺寸不得自動繼續。
  Escape 不得推測撤退；App 共用 modal host 必須保留既有排隊及強制事件所有權。
  歷史事件啟用、全國資料、月初歷史收支與 M9 長期驗收仍未完成；未 commit、push、重錄基準或發版。

## 最小視窗、戰鬥選單與未儲存進度（2026-10-08）

- 平行完成 viewport provider、兩個時鐘的閘門及 App 共用系統選單；11-D27～D29 記錄邊界。
  寬小於 1280 或高小於 720 CSS px 時遮罩阻擋輸入；恰好 1280×720 可用。
  策略 tick、debug 跳日、事件結算及戰鬥本地計時停止；恢復尺寸不自動繼續。
  已有手動／modal 暫停原因、原恢復速度及持久化倍率不變。
- 遮罩保留已掛載畫面與 modal，令背景及 body portal inert，安全恢復原焦點。
  強制事件與巢狀確認不因 resize 被關閉或重建；遊戲快捷鍵不能穿透。
  瀏覽器縮放、導航與非遊戲快捷鍵保留，不開 GUI 測試視窗。
  Gallery 使用隔離 store，刻意不包會改 global store 的 production viewport provider。
- Battle Escape 依 modal／panel／selection 優先序，最後開共用系統選單；不撤退或結束戰鬥。
  一般系統選單不強制停止戰鬥時鐘，強制 modal 及 viewport 閘門仍停止。
  合戰快存快讀停用並攔截 Ctrl+S／Meta+S／F9 的瀏覽器預設行為。
  手動存讀與目前狀態匯出未接線；戰術命令仍為暫存佇列，不新增不完整的 SaveFile 格式。
- 第一輪四項 headless 為三通過、一失敗：實際戰鬥 tick 未改策略 stateVersion，dirty 判定漏掉未存進度。
  修正為 app 發布 tickSeq 與分離的戰術佇列簽章；beforeunload 及回標題取消確認涵蓋戰鬥進度。
  非同步存檔只清除擷取時進度；I/O 期間新增命令或 tick 仍 dirty，設定／選取／viewport 不 dirty。
  新局、讀檔與回標題清空戰術佇列，另依 GameState 身分隔離相同 battle id。
- 平行 review 又找到非同步快存失敗可在戰鬥露出「匯出目前」的旁路。
  錯誤框在戰鬥只顯示失敗及不可存讀理由，不提供會遺漏戰術命令的匯出操作。
  第一輪 traces 保留於 `/tmp/tenka-viewport-first-headless/`；修正後四項通過，10.2 秒。
  遮罩、恢復後設定與戰鬥系統選單圖片已檢視；不使用 screenshot 遮罩或重新錄製基準。
- 初次完整檢查 **2849 tests／236 files 通過**；types、完整 lint、data 與 production build 通過。
  記錄在 `/tmp/tenka-viewport-complete-{types,lint,unit,data,build}.log`；字型仍為 1453 字元。
  Production **36 項 headless 通過**，約 1.2 分鐘；記錄在 `/tmp/tenka-viewport-complete-headless.log`。
  非同步匯出旁路另有兩項真實 App／延後 quota failure 回歸測試；同一 session 的合戰仍保留戰術命令。
  測試用受控合戰轉場，不冒稱驗證策略戰鬥生成；策略錯誤框仍可匯出。
- 最終 **2851 tests／237 files 通過**；types、完整 lint、data 與 production build 通過。
  記錄在 `/tmp/tenka-viewport-final-verified-{types,lint,unit,data,build}.log`。
  最終 production **36 項 headless 通過**，約 1.2 分鐘；記錄在 `/tmp/tenka-viewport-final-headless.log`。
- Gallery 四項 headless 通過，5.7 秒；四組 axe violations 均為零。
  contrast incomplete 仍為 26／1／4／26 nodes，不代表完整可及性驗收。
  原始記錄與 JSON 在 `/tmp/tenka-viewport-gallery.log` 及 `/tmp/tenka-viewport-gallery/`。
- Portable visual 五通過、一 screenshot 失敗、一 GPU skip，42.6 秒。
  overview／operational／close 分別差 19136／19092／15374 pixels；基準與門檻均未改。
  已檢視 operational diff；圖片及 traces 保留於 `/tmp/tenka-viewport-visual/`，不以質性觀察取代 gate。
- Serial headless GPU workload 通過且正常終止，30.7 秒測試／32.0 秒全程。
  Apple M3 Max／Metal、1080p、二十部隊、30.0065 秒與 3600 frames，平均約 119.97 FPS。
  P95 frame time 9.0ms、CPU update 0.2ms，前後資源數相同。
  原始逐 frame 資料在 `/tmp/tenka-viewport-final-gpu/`；不代替全國效能或三十分鐘 soak。
- Dialog 內輸入焦點的 Escape 仍有獨立缺口：現有 handler 直接關閉，而規格要求第一次先離開輸入。
  已完成唯讀 audit，後續修正須保留 IME、原生控制項、強制 modal、巢狀所有權及 cancel-first Enter。
  歷史事件完整啟用、全國資料、月初歷史收支及 M9 長期驗收仍未完成。
  六張基準與 tolerance 未改，plan/00 未改；未 commit、push 或發版，整體 goal 保持 active。

## 對話框鍵盤所有權與 live 戰鬥特效（2026-10-08）

- 前一階段屬 verified progress；本階段平行修正 Dialog、撰寫 production headless 流程及接線 live 火花。
  Dialog 的第一次單鍵 Escape 只離開 input／textarea／select／contenteditable，聚焦 dialog 本體。
  下一次才依 dismissible 關閉；強制 modal 不略過，巢狀 modal 只有最上層處理。
  已阻止、repeat、IME 合成及修飾鍵 Escape 不 blur 或關閉，也不穿透較低層。
- Escape 後本體聚焦時，Tab／Shift+Tab 仍在第一／最後控制項循環；contenteditable 加入 focusables。
  Enter 主要動作、危險確認取消優先及原開啟者焦點還原不變。
  14 項 Dialog／ConfirmDialog focused 測試通過；原本「輸入 Escape 直接關閉」的舊測試已改正。
  合成 IME 旗標只證明 handler，不宣稱驗證各平台原生 IME；hidden ancestor 焦點掃描仍非本階段範圍。
- MapRenderer 依既有 FieldCombat／Siege view 掛載野戰及強攻火花；不新增模擬規則、資料欄位或 named RNG。
  野戰每 900ms、強攻每 1200ms，各八粒；道路接觸點採已有折線弧長中點。
  一個 renderer 擁有一個上限 128 的粒子池；換圖／銷毀解除掛載並釋放，沒有 process-wide 池沿用。
- OS 動態減量或 effectsEnabled 關閉立即清除粒子，雙刀及圍城虛實弧線資訊保留。
  恢復不補播背景歷史輪次；單一長幀也只產生目前一輪，不遍歷過去輪次。
  67 項 renderer／spark／pool focused 測試通過；含位置、節奏、容量、60 秒抑制恢復及清理所有權。
  Pixi mock 的 destroy 為 no-op，測試確認實際清理呼叫及解除掛載；瀏覽器另驗證 renderer 資源計數穩態。
  計數不是累積 GPU allocation 或 heap retainer 證明，不取代長期 soak。
- 新增三條實際 Dialog 流程：設定 range、匯入檔案後的原生 select、巢狀 import 確認與 cancel-first Enter。
  新增實際 visual-map 強攻流程，驗證 OS 初始／即時變更、設定開關、粒子清除及三次 remount。
  該 fixture 沒有野戰接觸；野戰位置與掛載目前由 renderer 整合測試覆蓋，不冒稱新增 browser 生成驗證。
- 完整 **2866 tests／237 files 通過**；types、完整 lint、data 與 production build 通過。
  原始記錄在 `/tmp/tenka-dialog-effects-first-{types,lint,unit,data,build}.log`；字型仍為 1453 字元。
  第一輪 browser runner 在測試前遭遇 Node JSON import attribute 錯誤，記錄保留於 `-first-headless.log`。
  測試改用真實 UI 匯出／download／匯入，不直接載入會依賴 JSON 的 core codec。
- 修正後四條新增 headless 流程通過，8.9 秒；另一次單獨強攻流程也通過，6.3 秒。
  原始記錄在 `/tmp/tenka-dialog-effects-fixed-headless.log` 及 `/tmp/tenka-map-effects-first-headless.log`。
  已檢視動態火花與停用特效的實際圖片；合成鍵盤旗標 JSON 明確標為 handler 診斷。
- Production **40 條 headless 流程通過**，約 1.4 分鐘；記錄在 `/tmp/tenka-dialog-effects-complete-headless.log`。
  Gallery 說明同步改為「輸入中的 Escape 先離開輸入」，鍵盤流程另檢查本體 Shift+Tab。
  字型重建仍為 1453 字元、307.9 KB；後續 types、data 及 build 通過。
  記錄在 `/tmp/tenka-dialog-effects-font.log`、`-gallery-lint.log` 及 `-final-{types,data,build}.log`。
- Gallery 四項 headless 通過，5.6 秒；四組 axe violations 均為零。
  contrast incomplete 仍為 26／1／4／26 nodes，不代表完整可及性驗收。
  原始結果在 `/tmp/tenka-dialog-effects-gallery.log` 及同名目錄。
- Portable visual 五通過、一 screenshot 失敗、一 GPU skip，40.8 秒。
  overview／operational／close 差 19136／19092／15374 pixels，與前一階段相同；基準及門檻不變。
  原始 diff、trace 及記錄保留於 `/tmp/tenka-dialog-effects-visual/` 與同名 log。
- Serial headless GPU workload 通過且正常終止，30.7 秒測試／31.9 秒全程。
  Apple M3 Max／Metal、1080p、二十部隊、30.0061 秒及 3600 frames，平均約 119.98 FPS。
  P95 frame time 9.6ms、CPU update 0.2ms，前後 renderer 資源計數相同。
  原始逐 frame 資料在 `/tmp/tenka-dialog-effects-gpu/`；本測量不取代全國、全部動態特效或長期 soak。
- 平行焦點 audit 指出 SaveLoad 巢狀確認的 opener 可能在取消或非同步刪除時已 disabled／移除。
  Dialog 目前直接 prior.focus，沒有剩餘 parent owner 的安全 fallback；後續先用真實 headless 流程重現。
  下一個修正須保留頂層所有權、Enter 取消優先及原開啟者還原，不能從本階段測試宣稱 T4／T14 全部完成。
- 威風仍未接線：12 §3.3.6 要求的中心與世界半徑不在目前 core payload，UI 不猜測半徑。
  12 的 reference 與本階段 checkpoint 使用 write skill；不修改 plan/00。
  歷史事件完整啟用、全國資料、月初歷史收支、完整戰鬥畫面與 M9 長期驗收仍未完成。
  六張 screenshot 基準與 tolerance 保持不變；未 commit、push 或發版，整體 goal 保持 active。

## 巢狀存讀檔焦點與 viewport 恢復（2026-10-08）

- 前一階段屬 verified progress；本階段平行重現 SaveLoad 焦點缺口、修正 Dialog 及檢查跨 owner 生命週期。
  Code Cortex 舊索引沒有 SaveLoadPanel，改查目前 source；不將缺少 graph node 視為沒有使用者。
  原 production build 的新增 headless 流程在第一次覆蓋取消後失敗，Save 按鈕未恢復焦點。
  Trace 的原始 JSON 明確顯示 activeTag 為 BODY、仍存在的存檔 Dialog containsFocus 為 false。
- 保留失敗 log／trace 於 `/tmp/tenka-save-focus-before.log` 及同名目錄，不減弱焦點 assertion。
  背景鎖定停用 opener 可早於 child effect 的 prior 擷取，只有有效 prior fallback 不足。
  Dialog 用 WeakMap 記錄最後實際聚焦的自有控制項；portal child 的 focus bubbling 不覆寫 parent 記錄。
  子框關閉時保留現有有效頂層焦點，或還原該 owner 的有效 opener／最後控制項。
- 非同步操作停用或移除 opener 時，改用剩餘 owner 的安全控制項／本體，不讓焦點落到 body。
  acquisition／restoration 排除斷開、:disabled（含 fieldset）、inert／aria-hidden／隱藏祖先；Tab 另排除負 tabindex。
  初始 ref 也須有效且屬於目前 owner；低層 Dialog 更新或關閉不能搶走高層焦點。
  Enter、第一次 Escape 離開輸入、取消優先與原存讀檔命令均不變。
- 39 項 focused tests 通過；首次完整 **2873 tests／237 files 通過**。
  types、完整 lint、data 與 production build 通過；記錄在 `/tmp/tenka-save-focus-verified-{types,lint,unit,data,build}.log`。
  新 build 的同一 headless 流程通過，2.0 秒測試／3.3 秒全程，記錄在 `/tmp/tenka-save-focus-after.log`。
  覆蓋取消與刪除取消精確還原原按鈕；確認刪除後保留 parent 焦點，原生 Tab／Shift+Tab 不逃逸，core 不變。
- 平行 review 發現 viewport 解除時只有 exact prior，無法處理 prior 消失或新 Dialog 在遮罩期間開啟。
  已共用同一 DOM 焦點 helper；解除先還原 inert／aria-hidden，再恢復安全的頂層 owner。
  新開確認框的初始取消偏好在遮罩期間保留；prior 被替換或 child 非同步關閉也不落到 body。
  不增加延後回呼或時鐘；43 項 focused tests 通過，包含既有 viewport 行為與四項新增恢復案例。
  最終完整 **2877 tests／237 files 通過**；types、完整 lint、data 與 build 通過。
  原始記錄在 `/tmp/tenka-save-focus-final-{types,lint,unit,data,build}.log`。
- 最終 production headless **41 flows 通過，1.4 分鐘**，包含新 SaveLoad focus 與既有 viewport／Dialog 流程。
  原始記錄在 `/tmp/tenka-save-focus-complete-headless.log`；四項新增 viewport 組合案例仍屬單元測試範圍。
  平行 read-only review 沒有發現新的 production-path 缺陷；不據此宣稱完整 accessibility 認證。
- Gallery headless **4 flows 通過，5.7 秒**，四種 axe 狀態均為零 violations。
  color-contrast incomplete nodes 仍為 26／1／4／26；原始記錄在 `/tmp/tenka-save-focus-gallery` 及同名 log。
  Portable visual 為 **5 passed／1 failed／1 skipped，40.9 秒**，失敗仍是凍結相機 screenshot 比對。
  overview／operational／close 差異仍為 19136／19092／15374 pixels，與前階段相同。
  原始記錄在 `/tmp/tenka-save-focus-visual.log` 及同名 artifact 目錄；不更新基準或降低門檻。
- 串行 headless GPU gate **1 passed，30.7 秒測試／31.9 秒全程**，記錄在 `/tmp/tenka-save-focus-gpu` 及同名 log。
  實際 Apple M3 Max／ANGLE Metal，1080p、20 moving armies，30.0049 秒／3600 frames，平均 119.98 FPS。
  frame-time P95 9.6ms、CPU update P95 0.2ms；owned textures／shared terrain sprites／listeners 前後均為 1／2／9。
  UA 的 Windows 字串是 Desktop Chrome 模擬，並非 host；這不是全國 30 分鐘 soak 或全部特效認證。
- 下一個大項是 11 §3.11 的 tactical Pixi 地圖：目前中央 DOM 圓形節點沒有 edges 或友方單位。
  已有 Jin／JinEdge／BattleUnit 欄位足以呈現兩方位置與移動進度，不需要新 mechanics 或歷史素材。
  正式撤退仍缺實作；不把它併入視覺工作或用 debug abort 冒充。
  歷史事件、全國資料、月初歷史收支、Awe 視覺決策及 M9 長期驗收仍未完成。
  基準與 tolerance 未改，plan/00 未改；未 commit、push 或發版，goal 保持 active。

## Tactical Pixi 地圖（2026-10-08）

- 前一階段已修正並驗證巢狀焦點；本階段依 11 §3.11.1 平行實作 renderer、React host 與 headless 驗收。
  目前 BattleState 的 Jin／JinEdge／BattleUnit 已有格位、通路、歸屬、兵數、士氣與移動 tick。
  不新增地理資料、模擬補間、歷史素材、core schema 或 named RNG。
- 投影以實際中央容器的 CSS 尺寸擬合 5×3 格位；Canvas 與原生操作控制項共用同一份座標。
  只畫實際 edges；移動比例採 moveProgress／matching edge.moveCost，不推測策略地圖世界座標。
  投影只改呈現；驗收須包含 production renderer，不以新增測試檔或單元替身取代實際繪圖。
- 已完成獨立 static Pixi renderer、React host 及共享 glyphBox／hitBox；保留現有戰術 command 管線。
  指向真實 anchor 的低對比連線區分棋子操作區與 authored route；glyph 擬合不改設定倍率。
  32px 原生操作區覆蓋完整棋子／陣圖形，標籤至少 12px；同點堆疊間距由 32 修正為 64 邏輯 px。
  側欄寬限制、三列 footprint 與 DPR-only 觀察一起處理 1280×720／1.5 倍下的 clipping／點錯棋子風險。
- renderer 在成功 init 後立即記錄 allocation 所有權，post-init 失敗及等待期間卸載都能銷毀。
  pending diagnostics 允許 renderer 尚未建立；ownedTickerListeners 不冒充 Pixi 內部所有 listener 的總數。
  不啟動額外動畫 ticker；字型／WebGL 建立失敗仍保留可讀的原生命令控制項。
  19 項 projection／renderer 與 20 項 Host／Screen／App focused tests 通過，scoped lint 通過。
- 首次完整 **2904 tests／240 files 通過**，types、完整 lint、data 與 production build 通過。
  原始記錄在 `/tmp/tenka-battle-map-final-{types,lint,unit,data,build}.log`。
  新字串已重建 font subset：1456 字元、308.8KB；原始記錄在 `/tmp/tenka-battle-map-font.log`。
- 首次 headless 新流程為 1 passed／1 failed，1.1 分鐘；移動與攻擊已用真實 tick 驗證。
  layout 流程誤找 Battle 沒有的系統選單按鈕，raw locator log 證明此測試編寫錯誤。
  保留 `/tmp/tenka-battle-map-first-headless.log` 與同名 trace；改用既有 Escape 開選單，不新增假的 production 按鈕。
  失敗後顯示的 source frame 讀到已更新檔案，以原始 locator call log 作為失敗操作的證據。
- 修正後同一 production headless 流程 **2 passed，7.5 秒**，記錄在 `/tmp/tenka-battle-map-fixed-headless.log`。
  六組 1280×720／1920×1080 × 0.8／1／1.5 倍控制項 bounds 與 native click 通過。
  設定、選取、resize、OS motion 翻轉沒有改完整 core／RNG；只有明確恢復時鐘後才執行移動／攻擊。
  root 已逐張檢視六張實際截圖，保存在 `/tmp/tenka-battle-map-screens.QZJnnH`，不是新 screenshot baseline。
  同點四棋子及三列 footprint 是單元測試範圍；此 fixture 只有四支部隊，不宣稱涵蓋所有密集相鄰陣。
- 最終 production headless **43 flows 通過，1.5 分鐘**，記錄在 `/tmp/tenka-battle-map-complete-headless.log`。
  包含既有戰鬥 viewport／選單／設定／快捷鍵、存讀檔、M6 與新 tactical 流程；全程未開 GUI 視窗。
- Gallery headless **4 passed，5.4 秒**；四種 axe 狀態均零 violations，contrast incomplete nodes 仍為 26／1／4／26。
  原始記錄在 `/tmp/tenka-battle-map-gallery.log` 與同名 artifact 目錄；不宣稱完整 accessibility 認證。
  Portable visual **5 passed／1 failed／1 skipped，39.9 秒**，凍結相機比對仍差 19136／19092／15374 pixels。
  記錄在 `/tmp/tenka-battle-map-visual.log` 與同名目錄；六張原始基準與 tolerance 未改。
- 平行 source audit 後 root 用目前 projection 重現密集相鄰陣的跨 group 操作區重疊。
  678×444、1.5 倍、col 1／2 各四棋子的 partial projection，`bu.a.2`／`bu.b.0` 重疊 33.8445×52.2353px。
  前者 anchor marker center 落在後者按鈕內，可使點選選錯單位；原始記錄在 `/tmp/tenka-battle-map-dense-audit.json`。
  每陣每側兩支、每側總共四支符合 BAL 的 2／6 上限，但此 partial fixture 不是完整 GameState invariant 驗證。
  下一個安全實作是保留真實 anchor 的全域操作區配置：reserve node boxes、依距離／id 放置棋子，保持 32px 下限。
  此缺口仍未修正；不能以通過的四棋子 production fixture 宣稱所有合法密集戰場可獨立點選。
- 串行 strategy GPU gate **1 passed，30.6 秒測試／31.9 秒全程**，記錄在 `/tmp/tenka-battle-map-gpu` 及同名 log。
  Apple M3 Max／ANGLE Metal，1080p／20 moving armies，30.0064 秒／3600 frames，平均 119.97 FPS。
  frame-time P95 9.7ms、CPU update P95 0.3ms；textures／terrain sprites／listeners 前後均為 1／2／9。
  此 gate 仍是策略相機 workload，不是新 tactical renderer 的 FPS 或全國 soak 證明；Windows UA 仍是裝置模擬。
  最後完整 lint 通過，記錄在 `/tmp/tenka-battle-map-complete-lint.log`；prose、format 與 diff check 通過。
  六張基準／tolerance、plan/00 均未改；未 commit、push 或發版，整體 goal 保持 active。
- 正式撤退仍未接線。07 沒有定義玩家主動撤退指令與獨立罰則，11 只要求確認框並引用 07。
  已向使用者詢問是否沿用既有敗北處理；未收到回答前不把 debug abort 改稱正式撤退。
  Awe 的中心／世界半徑仍待原先的視覺 metadata 決策；其他安全工作可繼續。

## 全域戰術操作區（2026-10-08）

- 本階段修正上一階段重現的相鄰陣跨 group 點選碰撞；renderer、Host／DEV fixture、瀏覽器驗收平行進行。
  投影保留所有陣的 hitBox，再依穩定 id 放置可見棋子；安全的偏好呈現位置不變。
  衝突位置改用距偏好位置最近的可用格位；不是距真實 anchor 最短或全域最佳配置。
  局部位置耗盡格位時，全體改用不同的 node-cleared 格位，避免最後一支棋子無處可放。
  格位容量不足的非支援 host 不保證 fit，但不隱藏棋子，也不縮小原生操作區。
- 真實移動 anchor、authored edges、字體下限及 32px 控制項不變；core／RNG／BAL／SaveFile 無改動。
  `placementGap = 4` 是 UI 呈現常數，已記錄於 12 §3.1.8；設計決策為 11 D31／12 D35。
  DEV 專用 `#/dev/battle-layout` 使用 typed presentation fixture，不是完整可玩 GameState 或規則驗證。
  Host 的可選局部倍率保留 production 預設，DEV 操作不改 live session、bridge progress 或全域設定。
- 24 項 projection／renderer 與 28 項 Host／Screen／DEV isolation focused tests 通過。
  root 獨立 deterministic sweep 的 3000 個合成布局均無碰撞、操作區越界或來源 mutation。
  sweep 含 15 個 node 格位、12 支部隊、15 段倍率及合成 fractional edges；不冒充完整 invariant 或 authored route 驗證。
  原始程式／結果為 `/tmp/tenka-battle-global-stress.ts`／`.json`；最遠呈現位移約 519.9px，不宣稱最佳距離。
- 首次並行全量檢查捕捉測試草稿問題：types 的 boundingBox.left 誤用及 fallback 格位期望錯誤。
  另一次完整 lint 捕捉未 format 的新測試；保留 `/tmp/tenka-battle-global-{types,unit,lint}.log`。
  fallback 改以確定消耗三格位的測試直接驗證重置，沒有改 production 語意來迎合錯誤期望。
  最終 **2920 tests／241 files 通過，24.86 秒**；types、完整 lint、data 與 production build 通過。
  記錄為 `/tmp/tenka-battle-global-final-{types,unit,lint}.log` 與 `/tmp/tenka-battle-global-{data,build}.log`。
  沒有新增字型字元，1456 字元／308.8KB；build 的既有 500KB chunk warning 仍在。
- Gallery headless **5 passed，11.1 秒**；原始記錄為 `/tmp/tenka-battle-global-gallery.log`。
  另跑 dense-only headless 保留九張 PNG 與 raw hit JSON，記錄為 `/tmp/tenka-battle-global-dense.log` 及同名目錄。
  九組 678×444 × 三倍率 × dense8／full12／crossing8，共 165 控制項、825 取樣點均命中自身 DOM owner。
  friendly／enemy／enabled node 的實際 callback id 全數通過；root 已逐張檢視九張圖，沒有 clipping。
  此 fixture 只驗證呈現與原生操作；真實移動／攻擊仍由 production debug fixture 的 core tick 流程另驗。
- production headless **43 flows 通過，1.5 分鐘**，記錄為 `/tmp/tenka-battle-global-headless.log`。
  真實四棋子 fixture 的六組 viewport／倍率均通過中心、anchor 與四角原生 DOM hit ownership。
  真實 core tick 的移動／攻擊流程通過，沒有用 DEV callback 取代遊戲命令驗收。
  production DEV route 額外驗收通過，記錄為 `/tmp/tenka-battle-global-production-route.log`。
  兩個 DEV hash 均回到正式標題，沒有呈現 gallery；獨立 source review 沒有找到支援範圍內的新缺陷。
- Portable visual **5 passed／1 failed／1 skipped，41.5 秒**，記錄為 `/tmp/tenka-battle-global-visual.log` 及同名目錄。
  凍結相機比對仍差 19136／19092／15374 pixels，與上一階段相同；原始 failure／trace 保留。
  六張凍結 strategy PNG 基準及 tolerance 未改，不能因密集戰術驗收通過而宣稱原先比對失敗已消失。
- 串行 strategy GPU gate **1 passed，30.7 秒測試／32.0 秒全程**，記錄為 `/tmp/tenka-battle-global-gpu.log` 及同名目錄。
  Apple M3 Max／ANGLE Metal，1080p／20 moving armies，30.0057 秒／3600 frames，平均約 119.98 FPS。
  frame-time P95 9ms、CPU update P95 0.3ms；textures／terrain sprites／listeners 前後均為 1／2／9。
  此資料不是 tactical renderer 的 FPS、全國 soak 或真實 Windows 作業系統驗證；Windows UA 只是模擬設定。
  最後 types／完整 lint 通過，記錄為 `/tmp/tenka-battle-global-complete-{types,lint}.log`；prose／scoped format／diff check 通過。
- 密集戰術碰撞已修正；下一階段繼續盤點剩餘 battle presentation 與 M8／M9 的安全工作。
  正式撤退／Awe 決策與歷史資料、全國內容、月結及 M9 仍未完成；整體 goal 保持 active。
  plan/00 未改；未 commit、push 或發版，全程沒有開 GUI 視窗。

## 合戰結果所有權（2026-10-08）

- 上一階段全域密集布局已驗證；本階段平行補結果 Dialog、App／策略時間驗收及真實 headless 合戰流程。
  原本結果使用未管理焦點的 aria-modal section；現在使用共用不可略過的命名 Dialog。
  初始焦點及唯一出口為「返回策略畫面」，Escape／backdrop 不確認、不關閉。
  已存在的 uiStore modal 先保留所有權，釋放後才開結果 Dialog，不覆寫設定或系統選單。
- resolved 合戰底層 main inert／aria-hidden，地圖、部隊、戰法、委任、撤退及速度停用。
  命令、timer 與 hotkey 路徑另檢查當前 core result；不是只靠 CSS 阻擋輸入。
  acknowledgement 沿用既有橋接，core resolve 只寫回 survivor 一次；確認只移除結果並清空該戰術佇列。
  不修改勝敗、主動撤退罰則、Awe、core schema、RNG 或 SaveFile。
- 平行 source audit 找到 rAF 在 core result 成立後解除 active-player 戰鬥閘的缺口。
  root 修正 `session.screen === 'battle'` 的額外畫面閘，保留所有 BattleScreen 階段的策略時間。
  debug 日跳轉另於入口及每批執行前檢查，防止結果畫面先多跑一天或已排程批次繼續執行。
  原始 active-player／歷史事件閘不變；每幀清空 accumulator，返回後不補跑等待期的積欠時間。
  設計決策記錄於 03 D19、11 D32、12 D36；plan/00 未改。
- 修正前策略閘三項測試失敗：結果背景 x5 推進 8 日、debug 入口推進 2 日、排程批次由 30 推進至 45 日。
  原始記錄為 `/tmp/tenka-battle-result-guard-before.log`；修正後 20 項 focused 通過於同 prefix 的 after log。
  其後含 battleBridge 的 26 項 focused 通過；Screen 12 項含既有 modal handoff、焦點與命令阻擋通過。
  App 測試的新增未包 act 警告已修正，沒有 suppress console；MiniMap 既有 jsdom getContext 限制 stderr 仍保留。
- 首次完整 **2927 tests／241 files 通過**，types／完整 lint／data／build 通過。
  原始記錄為 `/tmp/tenka-battle-result-{types,lint,unit,data,build}.log`；沒有新字型字元。
  第一次真實 headless 流程在 8.8 秒失敗：正常委任／tactical clock 已產生結果，但 backdrop 點擊後焦點離開 Dialog。
  保留 `/tmp/tenka-battle-result-first-headless.log`、raw result 與同名 trace；沒有削弱焦點 assertion。
- root 修正共用 Dialog：不可關閉的頂層 backdrop 阻止 native mouseDown 預設焦點動作。
  內容控制項不攔截，既有可關閉 backdrop 仍呼叫 onClose；新增兩項 focused 測試。
  最終 **2929 tests／241 files 通過，25.07 秒**，53 項 focused 通過，types／完整 lint 通過。
  記錄為 `/tmp/tenka-battle-result-final-{types,lint,unit}.log` 與 `/tmp/tenka-battle-result-fixed-focused.log`。
  最新 build 通過於 `/tmp/tenka-battle-result-fixed-build.log`；原有 500KB chunk warning 仍在。
- 修正後同一 headless 流程 **1 passed，8.8 秒測試／10.2 秒全程**；記錄為 `/tmp/tenka-battle-result-fixed-headless.log`。
  真實 debug-battle-01 透過委任與五倍 tactical clock 在第 44 刻產生結果；沒有注入 winner 或假 BattleState。
  原生 Tab／Shift+Tab／Escape／速度鍵／backdrop 點擊保留 owner，完整 core／RNG 在等待期不變。
  只有明確確認才返回策略畫面並移除該 Battle；沒有再次抽 RNG。
  root 已檢視 `resolved-modal.png`，內容與控制項可見；原始圖片在同名 artifact 目錄。
- 首輪完整 production headless **44 flows 通過，1.7 分鐘**；記錄為 `/tmp/tenka-battle-result-complete-headless.log`。
  Gallery headless **5 passed，12.7 秒**；記錄為 `/tmp/tenka-battle-result-gallery.log` 及同名目錄。
  最新完整 production headless **45 flows 通過，1.9 分鐘**；記錄為 `/tmp/tenka-battle-result-final-headless.log`。
  兩個真實 result 流程分別 8.6／8.7 秒；SystemMenu 在結果成立後仍是唯一 owner，關閉後才交給結果。
  最新 types／完整 lint 通過於 `/tmp/tenka-battle-result-complete-{types,lint}.log`。
- Portable visual **5 passed／1 failed／1 skipped，42.0 秒**；記錄為 `/tmp/tenka-battle-result-visual.log` 及同名目錄。
  相機比對仍差 19136／19092／15374 pixels，與前階段相同；failure／diff／trace 保留。
  六張凍結 strategy PNG 與 tolerance 不改，已知比較失敗不因結果 Dialog 修正而消失。
- 串行 strategy GPU gate **1 passed，30.5 秒測試／31.5 秒全程**；記錄為 `/tmp/tenka-battle-result-gpu.log` 及同名目錄。
  Apple M3 Max／ANGLE Metal，1080p／20 moving armies，30.0054 秒／3600 frames，平均約 119.98 FPS。
  frame-time P95 9.1ms、CPU update P95 0.3ms；textures／terrain sprites／listeners 前後均為 1／2／9。
  此 gate 不是 tactical FPS、全國 soak 或真實 Windows 平台；Windows UA 仍是模擬設定。
  最後 prose／scoped format／diff check 通過；六張基準的 SHA-256 與前階段相同。
- 下一個安全實作是補戰況記錄的實際狀態變化與近期捲動，不能只保留每刻「戰況推進」。
  正式撤退／Awe 決策、戰況內容、歷史／全國資料、月結及 M9 仍未完成；整體 goal 保持 active。
  未 commit、push 或發版，全程使用 headless，不開 GUI 視窗。

## 實際戰況記錄（2026-10-08）

- 本階段平行處理 core outcome、UI 日誌及真實 headless 驗收。
  舊畫面只逐刻插入「戰況推進」，無法證明命令是否執行，也沒有 recent-follow／history-reading 所有權。
  core 新增分離的 `BattleTickEvent`，app bridge 只轉交，UI 不從 queued intent 或單刻兵數推測成功。
- outcome 在原有 stage 執行點記錄；命令接受、戰法成功及實際變化各自有事實來源。
  `unit.changed` 只描述受影響部隊及前後兵數／士氣，不捏造攻擊者。
  旗力扣減與佔領重置分開記錄；blocked move 不發出抵達事件。
  每 tick 的 sequence 從 1 起；無 outcome 回傳空陣列，不新增假進度。
  pipeline、戰鬥規則、named RNG、GameState、SaveFile 及策略 GameEvent 未擴充。
- core 初次 29 項 focused 通過，含 10 項 outcome、14 項既有 battle／B8、5 項未改 golden transcript。
  root 另跑 core outcome／battle／app bridge 的 30 項 focused 通過，記錄於 `/tmp/tenka-battle-log-core-root.log`。
  blocked-completed-move 另以填滿目的陣的受控 stage fixture 驗證，不當作完整劇本或全國資料。
  設計變更記錄於 03 D20、11 D33、12 D37；plan/00 未改，六張 strategy 截圖基準及 tolerance 不改。
- UI 只把實際 outcome 轉成戰況列；accepted attack 表示指定目標，不宣稱已造成傷害。
  敵軍文字與地圖描述改用側別及穩定 unit id，不增加隱藏武將身分。
  每列保留 battle／tick／sequence key，空 tick 不新增文字；role=log 只宣告 additions。
  日誌最多 50 列，距底部 32 CSS px 內跟隨最新；舊列閱讀保留仍存在的 row id 與 viewport offset。
  超限移除的 anchor 不補造，保留 manual mode；「跳至最新」使用原生按鈕並把焦點交給 scrollpane。
  換局／換合戰清除日誌、選取及待選戰法，暫停本地時鐘並把 remembered speed 重設為 x1。
- 初次 UI focused **17 passed／1 failed**，原始記錄為 `/tmp/tenka-battle-log-first-tests.log`。
  同 id 換局後的 Space regression 抓到 render-time ref 寫入把重設的 x1 又覆蓋成舊 x5。
  改成 owner-guarded layout effect；原測試不變，修正後 15 項 Screen 通過於 reset-tests log。
  最終加上 pruning 幾何測試，UI **19 passed**，記錄為 `/tmp/tenka-battle-log-final-tests.log`。
  該幾何及事件 stub 只驗證 UI，不代替真實 core 或瀏覽器驗收；read-only review 未見新具體缺陷。
- 首次完整 **2943 passed／2 failed**，原始記錄為 `/tmp/tenka-battle-log-unit.log`。
  一項是上述 unchanged Space regression；另一項是 legacy contract 的精確 return shape 缺少新 `events: []`。
  root 只補空 outcome 欄位，保留原有策略凍結、原子寫回、state hash 與重放 assertion；golden 未改。
  同輪 types／build 通過；lint 原始記錄保留 pending format 與 unstable empty-array 警告，後續使用穩定空常數。
- 字型已重新產生為 **1457 字元／308.9 KB**，記錄為 `/tmp/tenka-battle-log-font.log`。
  data **0 ERROR／0 WARN**、簡體掃描 0 命中、涵蓋率通過，記錄為 `/tmp/tenka-battle-log-data.log`。
- 最終完整 **2946 tests／243 files 通過，28.37 秒**，記錄為 `/tmp/tenka-battle-log-final-unit.log`。
  types 通過於 final-types log；最後完整 lint／build 通過於 `/tmp/tenka-battle-log-complete-{lint,build}.log`。
  第一次 final lint 仍抓到 i18n formatting，root 已格式化後重跑，不壓制警告；原始記錄保留。
  core contract／outcome／bridge／log helper／Screen 共 **43 項 focused 通過**，記錄於 complete-focused log。
  build 原有 500KB chunk warning 仍在；prose／scoped format／diff check 通過。
- 第一個真實 headless 戰況流程 **1 passed，10.7 秒測試／12.1 秒全程**。
  記錄為 `/tmp/tenka-battle-log-first-headless.log` 及同名 artifact 目錄；沒有注入 winner、log 或 BattleState。
  paused 時用原生地圖設定 move 並重複點突擊，core 未變且沒有 intent 列；實際 tick 只接受一次突擊。
  後續正常委任與 tactical clock 產生 troop loss、routing、exit 及第 34 刻結果。
  原生 wheel 保留舊列閱讀；jump 最新後完整 core／RNG 不變，retention 上限 50。
  observedKinds 共 10 類；這個流程沒有觀察到 jin.captured，不能當作所有 capture／pursuit 的瀏覽器證明。

  root 已檢視 `paused-jump-to-latest-log.png`：第 5 刻顯示真實兵數／士氣及旗力，文字與 map 控制項可見。
  同目錄保存 actual-paused-battle-state.json 及 actual-bounded-log.json；幾何 stub 不代替這些真實流程。

- 完整 production headless **46 flows 通過，2.0 分鐘**，記錄為 `/tmp/tenka-battle-log-complete-headless.log`。
  新戰況流程 10.4 秒通過；既有結果、SystemMenu handoff、地圖、存讀檔及 viewport 流程仍通過。
  此 gate 排除 M6-V11 visual，不代表凍結 strategy 圖片比對已通過。
- anchor evidence 原本只有 body attachment；後續改為具 outputPath 的 JSON，不依賴會被覆寫的 HTML report。
  assertion 不變，最新 focused headless **1 passed，11.0 秒測試／13.3 秒全程**。
  記錄為 `/tmp/tenka-battle-log-final-headless.log` 及同名目錄；older-reader-anchor.json 以檔案保留於該目錄。
  實際 retained row `battle.000001:2:3` 前後 offset 均為 **-7.921875 CSS px**，沒有改 DOM 幾何來通過。
  此瀏覽器資料證明保留列的閱讀位置；cap head-pruning 的特定分支另由明確標示的 UI 幾何測試涵蓋。
- Gallery headless **5 passed，12.0 秒**，記錄為 `/tmp/tenka-battle-log-gallery.log` 及同名目錄。
  Portable visual **5 passed／1 failed／1 skipped，41.3 秒**，記錄為 `/tmp/tenka-battle-log-visual.log`。
  凍結相機比對仍差 19136／19092／15374 pixels，與上一階段相同；diff／trace 保留，沒有 show-trace GUI。
  六張 strategy PNG 的 SHA-256 未改；data 字型新增不消除這個既有比較失敗。
- 串行 strategy GPU gate **1 passed，30.7 秒測試／32.1 秒全程**，記錄為 `/tmp/tenka-battle-log-gpu.log` 及同名目錄。
  Apple M3 Max／ANGLE Metal，1080p／20 moving armies，30.0013 秒／3598 frames，平均約 119.93 FPS。
  frame-time P95 9.1ms、CPU update P95 0.3ms；textures／terrain sprites／listeners 前後均為 1／2／9。
  raw frame-measurement.json 保留於同名目錄；這不是 tactical FPS、全國 soak 或真實 Windows 平台驗證。
- 實際戰況記錄及近期捲動已完成本階段驗收；下一階段核對部隊卡的交戰、移動、潰走與離場事實。
  目前部隊卡仍把未移動者顯示為「待命」，不能把指定攻擊目標直接當成實際 damage 或新 core 狀態。
  正式撤退／Awe 決策、歷史／全國資料、月結及 M9 仍未完成；整體 goal 保持 active。
  plan/00 未改；未 commit、push 或發版，所有瀏覽器均為 headless，沒有開新視窗。

## 部隊活動事實（2026-10-08）

- 本階段平行處理 core 唯讀查詢、UI 共用狀態及真實 headless 流程。
  卡片原本把未移動者一律標為待命，並把 retained target 當作正在移動。
  新查詢依有效敵軍及實際雙向 JinEdge 判定接觸，不從 attackTarget 推論命中或傷害。
  inactive、戰法 immobile、缺通路依原 movement gate 順序判定；容量只是當下快照。
- 卡片及原生地圖描述共用 formatter；生命週期依已離場、兵力耗盡、潰走排序。
  接觸與可推進移動分別呈現；交戰附可讀說明，無事實才顯示待命。
  query 回傳新資料，支援隔離的呈現 fixture；不修改 GameState、RNG、pending orders 或 store publication。
  同物件更新測試及 detached-result 測試通過；原有結果、時間與命令守門不改。
- 完整 unit gate **2959 tests／245 files 通過，25.22 秒**，記錄於 `/tmp/tenka-battle-status-unit.log`。
  types、data、build 通過於同 prefix 的 log；data 為 0 ERROR／0 WARN、簡體掃描 0 命中。
  字型 **1459 字元／308.9 KB**；build 原有 500KB chunk warning 保留。
  第一次 lint 只抓到 i18n formatting，原始 log 保留；root 已格式化，最後完整 lint 通過於 final-lint log。
- 第一個真實 headless **1 passed，6.6 秒測試／8.2 秒全程**。
  記錄於 `/tmp/tenka-battle-status-first-headless.log` 及同名 artifact 目錄。
  暫停選取與 queued move 不改完整 core；正常 tick 抵達後，委任產生實際 contact、routed、exited 徽章。
  actual-unit-status-evidence.json 保存逐刻觀察；結果等待 400ms 的完整 core／RNG 不變。
  root 已檢視 actual-paused-unit-status.png，狀態與 map 操作區可讀，未開瀏覽器視窗。
- 真實 terrain resolver 的通路目前皆 cost1；07 D41 已採 plain／coast 保守 fallback。
  因此此瀏覽器流程不宣稱 intermediate moving 狀態；多刻移動／immobile／missingEdge 由受控 unit fixture 驗證。
  不為通過測試捏造全國地形，也不把呈現 fixture 當作完整 GameState 或劇本證明。
  設計記錄於 07 D44、11 D34、12 D38；plan/00、strategy PNG 與 tolerance 不改。
- 完整 production headless **47 passed，2.1 分鐘**，記錄於 complete-headless log 及同名 artifact 目錄。
  Gallery **5 passed，11.4 秒**；portable visual **5 passed／1 failed／1 skipped，41.1 秒**。
  記錄於同 prefix 的 gallery／visual log；既有 camera mismatch 仍為 19136／19092／15374 pixels。
  六張 baseline 的 SHA-256 與前階段相同，沒有更新或放寬比對。
- 串行 strategy GPU **1 passed，30.7 秒測試／32.1 秒全程**，記錄於 gpu log 及同名 artifact 目錄。
  Apple M3 Max／ANGLE Metal，30.005 秒／3601 frames，平均約 120.01 FPS。
  frame-time P95 9.7ms、CPU update P95 0.4ms；textures／terrain sprites／listeners 前後均為 1／2／9。
  原始 frame-measurement.json 保存量測與資源前後值；此 gate 不是 tactical FPS、全國 soak 或 Windows 驗證。
- read-only review 未見本階段具體缺陷；全部瀏覽器使用 headless，未開新視窗。
  下一個安全工作是 perfMonitor 的真實 FPS 與 entity counts 接線，目前來源仍為預設 0。
  正式撤退／Awe、歷史／全國資料、月結及 M9 仍未完成；整體 goal 保持 active。
  未 commit、push 或發版。

## 真實效能資料（2026-10-08）

- 本階段平行處理 app telemetry、唯讀 debug UI 及真實 headless 驗收。
  原 `PerfSnapshot.fps` 與 entityCounts 固定為 0；現由既有策略 rAF 及傳入 GameState 取得。
  frame ring 最多 120 個正值間隔，以總時間計算頻率；不使用模擬 dt clamp 或新增 rAF 迴圈。
  第一幀與無效／不遞增 timestamp 不產生假樣本；stop／start 不把停止間隔算作幀。
- 同局 loop restart 保留 tick／system history；GameState 身分更換清除全部資料。
  entityCounts 每次讀取目前 collections 並回傳新物件，不快取 mutable game。
  console getPerf 注入目前 game；同局重複發布不清除實際樣本。
  root 的 36 項 debug／store 測試通過，含唯讀無 publication、mutable counts、分離快照及跨局重置。
- DebugPanel 新增效能區塊，每 500ms 更新，僅開啟時掛載，關閉及卸載解除 timer。
  畫面明示「策略排程 FPS」，不宣稱 Pixi／GPU 繪製幀率；未量測不顯示假零耗時。
  實際 0ms tick 仍可辨識；tickSeq、counts 與 timings 同次取樣。
  新局立即排除舊 sample，不等下一個 timer；種子沿用既有 state 區塊。
- app focused **33 passed**，UI focused **12 passed**； scoped lint／format 及 types 通過。
  UI 第一次 final 測試有 test-only actions.setGame 呼叫錯誤，原始 log 保留於 perf-debug-final-tests log。
  改用現有 exported setGame，原 assertion 不改，第二次 final 通過於 perf-debug-final-tests-second log。
  原始 code 沒有新增 commands、core／RNG writes、SaveFile 或模擬 pipeline 變更。
- 完整 **2971 tests／246 files 通過，26.65 秒**，記錄於 `/tmp/tenka-perf-telemetry-unit.log`。
  types／lint／data／build 全通過，記錄於同 prefix 的對應 log；build 原有 500KB chunk warning 保留。
  data **0 ERROR／0 WARN**、簡體掃描 0 命中；字型 **1463 字元／309.9 KB**，font log 保留。
  設計記錄於 01 D21；plan/00 未改，strategy baseline PNG 與 tolerance 不改。
- 第一個真實 headless **1 passed，2.3 秒測試／3.7 秒全程**，記錄於 first-headless log 及同名目錄。
  原生 backquote 開面板，真實 rAF 產生正值 scheduler FPS；paused polling 不改完整 core／RNG。
  原生「跳轉1日」只前進 1 日，產生 13 項實際 system timings；關面板不再改 core。
  初始 counts 為城 34／郡 95／武將 224／軍隊 0，與當次真實 GameState 的 keys 相符。
  actual-scheduler-telemetry.json 保存量測與範圍；該數字不是全國資料完成或 GPU performance gate 證明。
- root 已檢視 actual-perf-panel.png：可讀的系統列表需原生捲動，單張 viewport 不包含全部效能欄位。
  補充 native scroll 至 FPS 與 counts 的兩張 context PNG，原 assertion 與 raw measurements 保留。
  最終 focused headless **1 passed，2.3 秒測試／3.5 秒全程**，記錄於 final-headless log 及同名目錄。
  root 已檢視兩張 context PNG：tickSeq、FPS、tick timings 與 counts 可讀；不是假 DOM 幾何。
- 完整 production headless **48 passed，2.1 分鐘**，記錄於 complete-headless log 及同名 artifact 目錄。
  Gallery **5 passed，11.1 秒**；portable visual **5 passed／1 failed／1 skipped，42.1 秒**。
  記錄於 gallery／visual log；camera mismatch 仍為 19136／19092／15374 pixels。
  六張 baseline SHA-256 與前階段相同，沒有更新、遮罩或放寬 tolerance。
  所有瀏覽器使用 headless，沒有開新視窗。
- 串行 strategy GPU **1 passed，30.8 秒測試／32.1 秒全程**，記錄於 gpu log 及同名目錄。
  Apple M3 Max／ANGLE Metal，1080p／20 moving armies，30.0013 秒／3600 frames，平均約 120.00 FPS。
  frame-time P95 9.1ms、CPU update P95 0.3ms；textures／terrain sprites／listeners 前後均為 1／2／9。
  raw frame-measurement.json 保留；不是 tactical FPS、全國 soak 或真實 Windows 平台驗證。
- read-only review 未見具體 telemetry regression；StateViewer 仍是 stub，transport shortcut 仍 disabled。
  最後完整 lint 通過於 final-lint log；prose、scoped format 及 diff check 通過。
  下一個 gameplay-facing 工作可接既有 CastlePanel transport tab，不捏造尚無 core contract 的護衛規則。
  正式撤退／Awe、歷史／全國資料、月結及 M9 未完成；整體 goal 保持 active，未 commit、push 或發版。

## 輸送入口與真實日進度（2026-10-08）

- 本階段平行處理 core／app route query、CastlePanel／地圖入口及真實 headless 驗收。
  城快覽的輸送鈕原本永久停用；現依玩家歸屬開既有 transport tab，不套用出陣的直轄／軍團限制。
  表單只列目前可達的其他我方城，顯示實際路徑與政策／海路調整後 ETA；預覽不派送命令。
  換來源／GameState 清空草稿，mutable tick 更新後重查路徑及資源；執行時再用 canonical validator 檢查。
- 稽核發現原 transportDaily 每到節點清零，違反 05 §3.6／04 §3.7 的餘量結轉。
  baseline **2 failed／2 passed** 保留於 `/tmp/tenka-transport-carry-before.log`；不為新預覽保留錯誤日數。
  daily 每日只有一份 budget，逐邊扣成本，同日可跨短邊；實際抵達節點仍檢查被劫、歸屬及結算。
  缺路不積存等待日數，已進入的成本不重算，recall 仍沿實際反向距離折返。
- query 的 ETA 使用同一輸送成本與實際 node-pair edge selector，避免 parallel land／sea 以另一條邊估時。
  compensated sum 及 machine-roundoff boundary 避免分數成本憑空多出一天，不新增 BAL tolerance。
  30 邊傳馬制 fixture 顯示 20 日並實際於第 20 日抵達；真實 20.0000001 日仍進位為 21。
  這些是明確標示的受控成本案例，不當作全國地形或劇本資料。
- core／preview／既有 ownership／golden focused **21 passed**，記錄於 `/tmp/tenka-transport-final-tests.log`。
  AI golden 因較早送達，day150 起 hash 改變；mini／diplomacy golden 未變。
  隔離 legacy loop 完整重現原 AI baseline；第一次差異在第 146 刻，只是 transport edgeCost／progress。
  day150 差異為目的城兵數、糧與 threat cache，該刻 RNG 無差；原始證據在 isolated-audit log。
  root 只依 reviewed UPDATE_GOLDEN 更新 golden-ai.json；命令／事件／intent counts 及 BAL hash 不變。
  重放、repeatability、save-load 與 daily invariants 不刪改，frozen battle transcript 未改。
- 獨立 review 另抓到 mid-edge recall 的 synthetic cursor 被當作實際占據前方節點，造成未抵達就被劫。
  baseline **1 failed／7 passed** 保留於 physical-before log；改為只在 edgeCostDays=0 時做移動前節點被劫判定。
  實際 forward／reverse arrival 的檢查仍保留；真正反向抵達一揆節點仍消滅，不關閉 recall looting。
  修正後 **22 passed** 於 physical-after log，含 9 carryover／physical、6 ownership、6 preview 與正常 AI golden。
- UI focused **38 passed**，記錄於 `/tmp/tenka-transport-ui-final-tests-third.log`；scoped lint／types 通過。
  初次測試有 disconnected fixture、錯誤 reason 欄位及 matcher 型別問題，原始 first／second logs 保留。
  改成有效實體圖與真實敵城阻路；路徑計算只在輸送頁進行，不讓無關 overview 做全目的尋路。
  15 表 D 的刻度加入 UI，輸送及 MarchModal 共用 100；不加入 core BAL 或 hash。
- 初次完整 **2988 tests／249 files 通過**，後續 physical 修正重跑為 **2991 tests／249 files，24.91 秒**。
  最終 types／lint／data／build 通過於 `/tmp/tenka-transport-final-{types,lint,data,build}.log`。
  data **0 ERROR／0 WARN**、簡體掃描 0 命中；字型 **1463 字元／309.9 KB**，font log 保留。
  build 原有 500KB chunk warning 保留；05 §8.7、11 D35、12 D39 記錄契約，plan/00 未改。
- 第一個真實 headless **1 failed，2.4 秒**，記錄於 `/tmp/tenka-transport-first-headless.log` 及同名目錄。
  顯示 ETA 與實際 arrival 已相符，但 source food 的精確 delta oracle 忽略每日駐兵耗糧，預期 6400、實際 6393。
  不扣猜出的 7 石；改以實際 applied command transcript、一次 arrival 與 troop stocks 證明 once-only。
  canonical core 的來源扣貨測試仍驗證精確貨量；browser food stocks 明示包含 concurrent daily upkeep。
- 第二次真實 headless **1 passed，3.3 秒測試／4.7 秒全程**，記錄於 second-headless log 及同名目錄。
  原生 Home／城快覽／目的選擇及 slider 提交清洲→那古野，paused preview／queue 的完整 core／RNG 不變。
  預估 1 日、day1 實際 arrival；100 石／100 人只一筆成功命令，第二次正常播放仍無重複命令或 arrival。
  那古野已有 1252 人滿額，接受兵數 0 是原生 overview 量得的 capacity clipping，不假稱送入 100 人。
  actual-transport-evidence.json 保存完整狀態、路徑、capacity、arrival 與 command log；敵城 shortcut 停用。
  root 已檢視 native-transport-preview.png，原生頁籤、cargo、route、ETA 及執行鈕可讀。
- 完整 production **49 passed，2.2 分鐘**；Gallery **5 passed，11.0 秒**。
  記錄於 `/tmp/tenka-transport-complete-headless.log`、gallery log 及同名 artifact 目錄。
- portable visual **5 passed／1 failed／1 skipped，40.2 秒**，記錄於 visual log 及同名目錄。
  三段 camera mismatch 為 19410／19366／15648 pixels，各比上一階段增加 274，不假稱數字未變。
  前後 actual PNG 的 raw RGBA 差異各 1404 pixels，均限於 x1170–1213／y616–647 的輸送鈕。
  這是 owned castle 入口啟用後的差異；既有 camera mismatch 仍在，未更新 frozen baseline。
- GPU headless **1 passed，30.5 秒測試／31.5 秒全程**，記錄於 gpu log 及同名目錄。
  M3 Max／ANGLE Metal 的 1080p／20 軍隊 workload 為 30003.3 ms、3600 frames，平均約 119.99 FPS。
  frame p95 9.7 ms，CPU update p95 0.3 ms；前後資源數 ownedTextures／sharedTerrainSprites／listeners 均為 1／2／9。
  frame-measurement.json 保留原始資料；這不是 Windows 實機、tactical FPS 或全國 30 分鐘 soak。
  全部 browser 使用 headless，不開新視窗。
- 六張 strategy PNG 與 tolerance 不改；未 commit、push 或發版，整體 goal 保持 active。
  下一個 gameplay-facing 工作是提供 active transport list 與既有 recall 指令入口，目前 UI 沒有撤回能力。
  parallel edge 身分、captured endpoint 的 mid-edge reroute、正式撤退／Awe、歷史／全國資料、月結及 M9 仍待完成。

## 在途輸送隊與原生撤回（2026-10-08）

- 本階段平行補 app 唯讀清單、CastlePanel 撤回入口及真實 headless 驗收。
  `getTransportOrders` 回傳分離快照，依玩家歸屬、原來源城及穩定 id 篩選排序。
  清單顯示現存貨量、輸送中／折返中及實際節點或所在邊，不捏造剩餘 ETA。
  mid-edge recall 的零 progress／非零 entered cost 仍是邊上位置，不誤報未抵達節點。
- 原來源失守仍可從概要進輸送頁並撤回玩家的在途隊；建立新輸送仍依來源歸屬停用。
  純清單查詢可在概要執行，昂貴的所有目的 route query 仍只在輸送頁執行。
  點擊撤回時重查同局身分、原來源、canonical validator 及既有 pending recall。
  `hasQueuedTransportRecall` 只讀同局 command snapshot，不初始化 queue、不 drain 或改 seq。
  暫停提交只入列，顯示撤回待執行並停用重複按鈕；折返、消失或失去歸屬不能再提交。
- app order／preview focused **10 passed**，queue read-only focused **2 passed**；types、scoped lint／format 通過。
  UI focused **12 passed**，記錄於 `/tmp/tenka-transport-recall-ui-final-tests.log`；types／scoped lint 通過。
  初次 UI fixture 的反向 endpoint 順序預期錯誤，保留 first-tests log；沒有改成假稱到達前方節點。
  font 子集 **1463 字元／309.9 KB**，記錄於 `/tmp/tenka-transport-recall-font.log`。
- 完整 **2999 tests／251 files 通過，26.66 秒**；types／lint／data／build 通過。
  記錄於 `/tmp/tenka-transport-recall-{unit,types,lint,data,build}.log`；data 0 ERROR／0 WARN、簡體掃描 0 命中。
  build 原有 500KB chunk warning 保留；獨立唯讀 review 未找到本階段新增的具體缺陷。
- 第一個真實 headless **1 passed，3.7 秒測試／5.1 秒全程**，記錄於 first-headless log 及同名目錄。
  原生清洲→犬山路徑預估 2 日，day1 實際位於春日井郡→犬山邊上，progress 0.615385／cost 0.769231。
  原生 list 的 100 人／100 石與位置正確；撤回待執行期間完整 core／RNG 不變，按鈕停用重複入口。
  day2 實際回清洲，只有一筆 transport、recall command 及一筆 return arrival；day3 正常播放仍無重複。
  清洲兵數 2365→2265→2365，犬山仍為 900；糧庫含每日駐兵耗糧，精確回貨量取 actual arrival 100 石。
- `actual-mid-edge-recall.json` 保留路徑、全部 states、真實 mid-edge order、command logs 與 arrival。
  root 已檢視 actual-mid-edge-transport.png，清單、貨量、位置及原生撤回按鈕可讀，沒有注入假路或進度。
- 完整 production **50 passed，2.2 分鐘**，記錄於 `/tmp/tenka-transport-recall-complete-headless.log` 及同名目錄。
- Gallery **5 passed，11.6 秒**，記錄於 `/tmp/tenka-transport-recall-gallery.log` 及同名目錄。
  portable visual **5 passed／1 failed／1 skipped，39.9 秒**，記錄於 visual log 及同名目錄。
  camera mismatch 仍為 19410／19366／15648 pixels；三張 actual PNG 與上階段 raw RGBA 差異皆為 0。
  frozen baseline 失敗仍保留，不因在途 UI 未新增 camera 差異而宣稱整個 visual gate 通過。
- GPU headless **1 passed，30.7 秒測試／32.1 秒全程**，記錄於 `/tmp/tenka-transport-recall-gpu.log` 及同名目錄。
  M3 Max／ANGLE Metal、1080p／20 軍隊的 actual workload 為 30005.8 ms／3601 frames，平均約 120.01 FPS。
  frame p95 9 ms，CPU update p95 0.3 ms；前後 ownedTextures／sharedTerrainSprites／listeners 均為 1／2／9。
  frame-measurement.json 保留原始資料；不當作 Windows 實機、tactical FPS 或全國 30 分鐘 soak。
  全部 browser 使用 headless，不開新視窗。
- 不修改 plan/00、六張 frozen strategy PNG 或 screenshot tolerance；未 commit、push 或發版。
  整體 goal 保持 active；captured endpoint 的 mid-edge reroute、parallel edge 身分及其餘 gameplay／M9 尚未完成。
- 後續唯讀稽核確認兩個既有 core 風險：目的城失守時清零 mid-edge 距離；來源失守時從 synthetic cursor 重尋路。
  四日邊已走兩日的受控條件可導致免費回城，或把未到達節點當作替代路徑起點；本階段未修正。
  下一步先補 no-teleport regressions，再重用既有 partial recall 編碼，真正抵達節點後才重尋路。
  兩端皆失守時不新增 virtual midpoint 最短路或存檔欄位；未明訂的中途路線選擇仍需獨立規則裁決。

## 輸送易主後的實體路程與讀檔邊界（2026-10-08）

- 上階段已交付原生撤回，本階段平行修 core no-teleport、獨立實體回歸及存檔驗證。
  初次 ownership fixture 準備錯誤保留於 `/tmp/tenka-transport-reroute-before-fixture-errors.log`。
  有效 connected graph 的真正 baseline **3 failed／4 passed**，保留於 reroute-before log。
  三種失敗分別為目的城失守免費回源、撤回後來源失守從 synthetic cursor 免費入城、兩端失守免費改送。
  這些是受控 graph／ownership 案例，不假稱整套 battle capture 或全國模擬通過。
- `reverseTransport` 是 types-only 的共用位置轉換，玩家與自動折返不再各寫一份距離編碼。
  正向已走路程轉為反向的實際 cost；未花出進度的入口清 cost，下一個前邊重新取真實成本。
  來源失守的反向隊與兩端失守的正向隊保留既有 entered leg／direction／frozen cost。
  真正到節點後先檢查敵軍或一揆，再尋既有友城路徑；不從 synthetic cursor 重尋路，也不求 virtual midpoint 路線。
- 舊 ownership 的實際節點 fixture 保留非零 entered cost，兩個既有 case 因模型不一致失敗。
  原始 **31 passed／2 failed** 保留於 `/tmp/tenka-transport-reroute-after.log`。
  root 只將四個明訂實際節點／等待案例的 cost 設為 0；所有原到達、入庫、消失 assertions 保留。
  無友城路徑的等待案例另增加完整 order equality，不以移動後相同貨量冒充原地等待。
  整合 shared manual recall 後，physical／carry／ownership／preview／orders／正常 AI golden **33 passed**。
  記錄於 normalized-after log；AI golden 仍正常比對，沒有 UPDATE_GOLDEN 或改 baseline。
- 另加未支出入口的邊界回歸，實際 manual recall 不得借用下一邊 cost 來縮短上一邊的折返。
  前邊四日、後邊一日的受控例，前三日不入源、第四日才抵達；不是新增的 pre-fix failure 宣稱。
  physical 8／carry 9 共 **17 passed**，記錄於 `/tmp/tenka-transport-physical-boundary-final.log`。
- codec baseline **16 failed／9 passed**，保留於 `/tmp/tenka-transport-save-physical-before-third.log`。
  INV-12 的 transport 部分現拒絕非整數 cursor、非 boolean returning、非有限 numeric cost／progress 及無下一節點的 entered leg。
  非有限 JSON 轉成 null 的路徑也回 corrupt；正常部分撤回 cost>0／progress=0 與 pending recall 都可完整往返。
  不改 army 邊規則、SaveFile version、欄位或 migration；02 §4.13／INV-12、05 §8.7、16 D16 同步記錄。
- save focused **28 passed**，記錄於 `/tmp/tenka-transport-save-continuation-first.log`；scoped lint／types 通過。
  actual applyRecallTransport 產生的部分反向邊，存讀後逐日比較完整 state、arrival 及不變量，與原局一致。
  合法的受控目的城易主 fixture 同步更新 lord／district／officer 歸屬，actual daily 折返後存讀，距離及到達日均一致。
  這個例子驗證輸送／codec 的連續性，不當作原生攻城流程；其餘 runtime／UI 字串未新增。
- 第一輪完整 **3035 tests／253 files 通過，25.04 秒**；types／lint／data／build 通過。
  記錄於 `/tmp/tenka-transport-reroute-final-{unit,types,lint,data,build}.log`；此時尚未開始 browser。
  review 又找到 path 只有一個未知節點時跳過 adjacency 的 codec 缺口，不以綠燈當作輸送存檔完整性證明。
- missing node／起訖城引用的 baseline **3 failed／29 passed**，保留於 `/tmp/tenka-transport-save-refs-before.log`。
  INV-12 現要求每個路徑節點與起訖城存在，但保留 fallback 首節點不同於原來源的合法快照。
  新 refs／physical focused **40 passed**，記錄於 save-refs-after log；正常 codec 連續性 cases 不刪改。
- 額外診斷發現已存在的單節點位置可遠端入庫；raw 失敗保留於 `/tmp/tenka-transport-singleton-policy-before.log`。
  production fallback→來源恢復歸屬→actual manual recall 也會把 fallback 首節點當原來源而遠端入庫。
  新獨立 baseline **2 failed**，保留於 `/tmp/tenka-transport-fallback-recall-before.log`，不捏造既有 fallback 的來源欄位。
  現在 friendly destination 也必須符合方向路徑終點；到真實節點後優先走向仍屬我方的實際目的城。
  finishTransport 另要求 actual cursor node 等於目的城且 cost=0，不能靠友城歸屬冒充實際抵達。
- 最終 transport／save／app／正常 AI golden focused **68 passed**，記錄於 `/tmp/tenka-transport-terminal-final.log`。
  types／scoped lint／format 通過；沒有增加存檔欄位、midpoint path、RNG 或 baseline update。
  parallel edge 身分不再當作 production backlog：02 RoadEdge／INV-11 與 runtime／data validator 都禁止重複無向端點對。
  04 原「同型邊」措辭依 canonical 02 收斂；先前平行邊預覽 case 只屬額外 synthetic robustness，不是合法地圖。
- 第二輪完整 **3041 tests／254 files 通過，25.23 秒**；types／lint／data／build 通過。
  記錄於 `/tmp/tenka-transport-reroute-second-{unit,types,lint,data,build}.log`；data 0 ERROR／0 WARN、簡體掃描 0 命中。
  字型涵蓋率 1463 字元／309.9 KB，沒有新增 UI 字串；build 仍保留原 500KB chunk warning。
- 最新原生輸送／撤回 headless **2 passed，7.9 秒**，記錄於 focused-headless log 及同名 artifact 目錄。
  清洲→那古野 actual ETA／arrival，以及清洲→犬山 real mid-edge recall 的 queue／once-only 證據均保留。
  recall day1 的實際 progress 0.615385／cost 0.769231，day2 回源 100 人／100 石，day3 無第二筆命令或 arrival。
  root 已檢視最新 actual-mid-edge-transport.png；browser 沒有注入易主，易主後實體距離由明示受控 core／codec cases 驗證。
- 完整 production headless **50 passed，2.2 分鐘**，記錄於 `/tmp/tenka-transport-reroute-complete-headless.log` 及同名目錄。
- Gallery headless **5 passed，10.9 秒**，記錄於 `/tmp/tenka-transport-reroute-gallery.log` 及同名目錄。
  portable visual **5 passed／1 failed／1 skipped，39.7 秒**，記錄於 visual log 及同名目錄。
  camera mismatch 仍為 19410／19366／15648 pixels，不宣稱整個 visual gate 通過。
  actual PNG 比上一階段的 raw RGBA 差異為 2／0／0；overview 僅底角 (16,719)／(1263,719) 各 RGB 降 1。
  未更新六張 frozen PNG 或 tolerance，不把微小 raw 差異抹成 0。
- GPU headless **1 passed，30.6 秒測試／31.7 秒全程**，記錄於 `/tmp/tenka-transport-reroute-gpu.log` 及同名目錄。
  M3 Max／ANGLE Metal 的 1080p／20 軍隊 workload 為 30008.2 ms／3601 frames，平均約 120.00 FPS。
  frame p95 9 ms、CPU update p95 0.3 ms；前後 ownedTextures／sharedTerrainSprites／listeners 均為 1／2／9。
  frame-measurement.json 保留完整資料；這不是 Windows 實機、tactical FPS 或全國 30 分鐘 soak。
- 全部瀏覽器為 headless，不開新視窗；plan/00 未改，未 commit、push 或發版。
  整體 goal 保持 active，其他 gameplay、史實／全國資料與 M9 尚未完成。
- 下一個 gameplay-facing 工作是 11 §3.12.2 的月初摘要及其 authoritative settlement prerequisite。
  既有 income event 不能回推出成功扣除的俸祿、政策費、貢納或軍團保留金，也不能從裁剪後 reports 求完整糧量變化。
  先在真正 mutation site 捕捉實際金額，再做 snapshot 契約；不先畫出來源不完整的會計數字。
  期間／兵糧範圍及 month-start modal 的續播設定仍須依 canonical 系統文件裁決，不以 UI 草圖擴張已保存規則。

## 月初實際金錢結算快照（2026-10-08）

- 平行完成 core instrumentation、monthly modal 稽核與獨立會計 review。
  HC 的 constraints／system boundaries／evidence vs inference 用於界定實際扣款、金庫與軍團的邊界。
  不從裁剪後 Report、當前官階或政策清單推測已支付費用，也不將軍團自留收入加進勢力金庫。
- 新增 `MonthOpeningSettlement` 與逐勢力的唯讀數值列，`economySystem` 可選 callback 收取脫離 state 的快照。
  `advanceDay` 在每月 1 日的 `TickResult.monthOpeningSettlement` 回傳；非月初省略，不沿用前 tick。
  範圍緊貼 Step 6 的 monthlyIncomeAndUpkeep，位於當日原有 facilities／transport 之後、徵兵與秋收之前。
  這是新月的金錢結算，不是前月帳本或 tick 結束後餘額；不含兵糧、處理具申數或跨讀檔摘要保留。
- `incomeGold` 含既有設施／政策加成，未拆分商業／其他；另列軍團自留與貢納收支。
  `salaryDue` 與實際金庫扣款 `salaryPaid` 分列，`policyPaid` 取政策自動廢止後的真正扣款。
  各列符合 opening wallet reconciliation；沒有新增 GameEvent、Report、GameState、存檔欄位或版本。
  公式、13 步順序、RNG、既有收入／欠俸／政策事件都保留；03 §4.1.1 同步契約。
- 初始 callback 尚不存在的 7 個失敗保留於 `/tmp/tenka-month-opening-before.log`。
  第一輪 after 的兩個失敗是 fixture 錯誤：不存在的 rank 造成 NaN，以及 nanban 固定收入讓政策無須廢止。
  原始 `/tmp/tenka-month-opening-after.log` 保留，不把它們宣稱為產品會計缺陷。
  fixture 改用 canonical RANK_VALUES／BAL／POLICIES；不修改 gameplay 來迎合測試。
- 新會計 10 tests 與 tick 輸出 2 tests 覆蓋正額 corps／tribute、固定收入、欠俸與政策廢止、detachment。
  observed／unobserved 完整 state、events、RNG 相同；正額 case 明確要求 transfer >0，不用零額冒充覆蓋。
  真正 encode／decode 後跨年 advanceDay 的完整 state、events、快照與原局相同；非月初不捏造摘要。
  focused 20 passed，保留於 `/tmp/tenka-month-opening-final.log`；獨立 review 無剩餘 correctness finding。
- root 完整 CPU **3053 tests／256 files passed，29.97 秒**；types／lint／data／build 通過。
  記錄於 `/tmp/tenka-month-opening-full-{unit,types,lint,data,build}.log`。
  data 驗證仍是 tokai／kinki 批次，0 ERROR／0 WARN，簡體掃描 0，字型 1463 字元／309.9 KB。
  build 保留既有 500KB chunk warning；沒有新 UI 字串或字型重建，也未更新 golden。
- CPU 全部結束後，production headless **50 passed，2.2 分鐘**。
  記錄於 `/tmp/tenka-month-opening-headless.log` 與同名 artifact 目錄，包含原生三個月推進與存讀檔。
  使用 `--grep-invert M6-V11` 明確排除 visual／GPU gate，不宣稱此輪有重測 visual、gallery 或 FPS。
  沒有新視窗或自動開啟報告；六張 frozen PNG 的 SHA256 與前階段逐張相同。
- UI 稽核確認 monthSummary 仍只有 modal id，尚無 renderer；本階段不宣稱月初摘要畫面已交付。
  下一步在 bridge 的同步 tick publication 前，將 summary 接在既有 event FIFO／proposal 後，不能替換目前 dialog owner。
  保留 mandatory event／既有 proposal 行為；不從 11 草圖新增 canonical 16 未定義的自動續播 preference。
  transient cache 必須綁 game identity，load／回標題清除；explicit continue 不能覆蓋 newer user／hidden／viewport／fatal pause。
- 另發現秋收順序衝突：03 §3.6／§5.3 是 harvest→income→upkeep→food，05 pseudocode 與現行 runtime 先每日糧耗。
  此 instrumentation 不重排；後續需用 9/1 滿倉邊界的 accepted harvest／overflow／日末 stock 實測裁決。
  滿倉先秋收會全部 overflow，再日耗；先日耗會騰出空間接受部分秋收，兩者不是只差 event 排列。
- 整體 goal 保持 active；六張 frozen visual baseline、tolerance 與 plan/00 不變，未 commit、push 或發版。

## 月初摘要 renderer 與暫停所有權（2026-10-08）

- 平行完成 detached summary view、原生 Dialog、月初 FIFO regression 與 headless E2E。
  HC 邊界檢查區分實際金錢結算、當前城內糧存與消耗預估；不捏造歷史兵糧增減或已處理具申數。
  write 檢查同步 11 的畫面／流程契約與 D37；沒有新增 canonical 16 未定義的自動續播 preference。
- bridge 在 tickSeq publication 前同步接入既有 event、必要使者／具申與摘要。
  摘要只能用明確繼續按鈕結束，ESC／backdrop 不會繞過；整個 FIFO 清空後才可恢復原速。
  newer manual／hidden／viewport／fatal／battle pause 永久取消該次恢復權，讀檔／標題／ending 清除 transient cache。
  關閉月初暫停只改為真實結算 toast，不移除必要 event 或既有具申。
- 22 個 flow regression 包含真實 advanceDay／bridge publication、重入 reset／替換局面與 drain 中新增 dialog owner。
  保留 genuine failing baselines：`/tmp/tenka-month-summary-flow-agent-before-corrected.log`、
  `/tmp/tenka-month-summary-drain-before.log`、`/tmp/tenka-month-summary-new-owner-before.log`。
  generation／held flow／兩個 notification boundary 的 fresh FIFO 檢查修正所有已發現 ownership races。
  第一輪 fixture 的 incidental proposals 與舊 event-host 設定隔離問題，不算產品缺陷。
- 本階段 CPU **3087 tests／259 files passed，34.34 秒**，types／lint／data／build 全通過。
  記錄於 `/tmp/tenka-month-summary-all-{unit,types,lint,data,build}.log`；focused 34 passed。
  字型重新產生為 1466 字元／310.4 KB，golden、六張 frozen PNG、tolerance 與 plan/00 不變。
- 原生 headless 月初摘要三例通過，19.3 秒，scale 1／1.5 與關閉摘要設定皆使用正常時間推進。
  記錄於 `/tmp/tenka-month-summary-native-final.log` 與同名 artifact 目錄。
  actual income 與 core report 核對，收支勾稽；ESC／backdrop／focus 操作期間完整 core／RNG／命令紀錄不變。
  必要具申用原生控制處理；明確繼續後真實跨到下一日，未用 debug step 或 state mutation。
  初始 runner JSON import、siege auto-pause 與 Unicode minus parser 問題保留原始失敗記錄，不當成 gameplay bug。
- 補強原生 Home／End overflow assertion 後三例仍通過，20.2 秒，保留 opening／scrolled 截圖。
  `/tmp/tenka-month-summary-native-scroll.log` 證明兩種 scale 都有真實 overflow，鍵盤能捲至首尾。
  完整 production headless **53 passed，2.6 分鐘**，含正常三個月推進。
  `/tmp/tenka-month-summary-headless.log` 明確排除 M6-V11 與尚未建置的 army auto-return case。
  不宣稱此輪已重測 gallery／frozen visual／GPU gate，也不宣稱整體遊戲完成。
- 下一個平行 slice 為戰略部隊的既有 setAutoReturn 命令 UI，驗證結果見下節。
  整體 goal 保持 active；未 commit、push、開 PR 或發版，未開啟新視窗。

## 戰略部隊自動歸還控制（2026-10-08）

- 平行完成純 selector／request seam、原生 switch／MainScreen 整合與 native E2E。
  補齊 07 §3.13 玩家可關閉預設自動歸還的既有命令入口，不改 auto-return 條件、RNG 或 save schema。
  軍團部隊沿用 canonical 所有權驗證，沒有額外限制直轄；潰走部隊依既有 validator 禁止切換。
- switch 顯示實際 `Army.autoReturn`，未執行的 `false` intent 單獨顯示，不當成空值或樂觀更新。
  同部隊已有切換待執行時禁止重複提交；回呼重新核對 game identity、所有權、潰走與真正 pending queue。
  新 `getQueuedPlayerCommands(expectedGame)` 只回傳脫離 queue 的玩家快照；不初始化 session、不 drain 或執行 tick。
- 7 個 seam tests、3 個 controlled component tests 與 Main 29 tests 通過。
  paused 切換不改完整 core／RNG，正常 next tick 才真正套用；跨 session 同 army ID 不得提交舊回呼。
  初始 6 PASS／1 FAIL 是短程 fixture 在開啟自動歸還後合法解散，不是 production bug。
  `/tmp/tenka-army-auto-return-focused.log` 保留原始失敗；較長且合法路線的七例通過於 `final.log`。
- 完整 CPU **3098 tests／261 files passed，24.20 秒**；types／lint／data／build 全通過。
  `/tmp/tenka-army-auto-return-{unit,types,lint,data,build}.log` 保留各 gate 結果。
  data 仍僅 tokai／kinki，0 ERROR／0 WARN，簡體掃描 0；字型重建仍為 1466 字元／310.4 KB。
  普通 golden 皆通過，沒有更新 golden 或 frozen PNG。
- 原生 headless 一例通過，4.6 秒：正常出陣、真實 map selection、Space 切換、重複鍵無多次入列。
  queue 期間 actual flag 保持開啟，完整 core 不變；正常 ×1 跨一日後 flag 關閉且 command transcript 只有一次。
  `/tmp/tenka-army-auto-return-native.log` 與同名 artifacts 含 screenshot、完整前後 state 與真正 command log。
  debug 只讀 evidence／等待地圖，沒有 debug step 或 live state mutation；全部 headless，沒有新視窗。
- 最新 production headless **54 passed，2.6 分鐘**，包括新 army case 與月初摘要三例。
  `/tmp/tenka-army-auto-return-headless.log` 仍明確排除 M6-V11；原生三個月 smoke 與 save/load 全通過。
  serial DEV gallery **5 passed，12.0 秒**，含 dense targets、virtual table、keyboard 與完整 raw axe 結果。
  `/tmp/tenka-army-auto-return-gallery.log` 保留 gate 結果；沒有宣稱全面 WCAG 認證。
  整體 goal 保持 active，未 commit、push、開 PR 或發版。
- portable visual **5 PASS／1 FAIL／1 SKIP，40.1 秒**；失敗仍是 overview／operational／close frozen PNG 比對。
  差異分別 19410／19366／15648 pixels，與前階段相同；100 pixels／0.15 tolerance 不變。
  `/tmp/tenka-army-auto-return-visual.log` 與同名目錄保留 raw actual／diff／trace。
  六張 frozen PNG 的 SHA256 逐張仍與前階段一致；沒有 update、mask、放寬 tolerance 或新視窗。
  GPU FPS case 因本次未啟用 VISUAL_PERF 而 skip，不宣稱此輪重新測得 FPS。

## Lazy 唯讀狀態檢視器（2026-10-08）

- 平行完成 StateViewer、DebugPanel 整合、獨立 keyboard／focus review 與 headless E2E authoring。
  補齊 01 §3.11.2 的 JSON 樹，不將小範圍進度當成全遊戲完成；整體 goal 保持 active。
  write 以 reference 更新 debug 工具契約與 12 D40，區分明確操作、實測結果與尚未驗證項目。
- 根節點預設收合，只有展開節點列舉自己的欄位；首次讀取並呈現 50 個子節點。
  `UI.stateViewerPageSize` 為純 UI 常數，明確按「顯示更多」才增加可見子節點。
  不執行 getter 或 toJSON；copy 明確選取的子樹，支援 root copy，不用隱藏整體序列化成本。
  非 JSON、循環、存取器與 clipboard 失敗顯示失敗，不捏造成功或自動 fallback。
- 原本 DebugPanel 每 render 的 stateHash 全局序列化改為明確按鈕；tick 後標示過期。
  同物件 tickSeq 更新已展開數值；替換局面清除展開與複製狀態。
  非同步 clipboard 回覆在 revision／identity／unmount 後不發布舊訊息；各 copy button 有 distinct node-path 名稱。
- tree focus 原先會讓 1–3／F1–F7／R 觸發遊戲快捷鍵，現在樹內阻止冒泡並保留原生操作。
  bare function keys 阻止 browser F5 等預設動作；Ctrl／Meta clipboard／browser chords 與 backquote 保留。
  disclosure summary 使用 32px 操作下限；刪除聚焦子節點或替換 root 時，焦點回到最近仍存在的 disclosure。
  不搶外部控制項焦點；explicit blur 至 body 也清除 ownership，避免後續 child removal 將焦點拉回。
- explicit-blur 的 **1 FAIL／16 PASS** 保留於 `/tmp/tenka-state-viewer-blur-before.log`；修正後 17 tests 通過。
  11 個 DebugPanel tests 含真實 queued debugGrant、readonly queue 保留、真正 tick 更新與 replacement 重置。
  初次 replacement integration 失敗是 fixture 忘記 reset 後重新打開 panel；原始 `panel-second.log` 保留。
  初次 typecheck 的兩個 toHaveTextContent 型別錯誤改用 repository 的 textContent assertion，不改 production。
- font 重新產生為 1469 字元／311.0 KB；`/tmp/tenka-state-viewer-font.log` 保留實際結果。
- 完整 CPU **3117 tests／262 files passed，28.92 秒**，types／lint／data／build 全通過。
  `/tmp/tenka-state-viewer-unit-final.log` 與 `types-final`／`data-final`／`build-final`／`lint-complete` 保留結果。
  最後 lint 曾指出 E2E formatting 與 test act 回呼 return 值；修正後完整 lint 通過，不算 gameplay bug。
- 原生 headless **2 passed，4.8 秒**：真正小賞具申命令待執行期間，展開／分頁／複製不改完整 core／RNG／log。
  clipboard readback 與所選 time／meta JSON 逐字相同；Space 展開、1／F5／R 不改遊戲、summary 高度至少 32px。
  正常 ×1 真實 next tick 更新同物件 time，賞賜僅一次；回標題再開局重置 tree，非 debug 遊戲不掛 viewer。
  `/tmp/tenka-state-viewer-native-corrected.log` 與同名 artifacts 保留 native screenshot 與原始 state/log evidence。
  初次 E2E 計數比 native toggle event 更早，等待真正 50 rows 後通過；原始 `native.log` 保留。
- 最新完整 production headless **56 passed，2.7 分鐘**，`/tmp/tenka-state-viewer-headless.log` 保留結果。
  包含新版 viewer 二例、月初摘要、army auto-return、原生三個月 smoke、save/load 與 tactical flows。
  本輪仍明確排除 M6-V11，不宣稱重測 frozen visual 或 GPU FPS。
  serial DEV gallery **5 passed，11.2 秒**，`/tmp/tenka-state-viewer-gallery.log` 保留完整 raw axe 等結果。
  無 gameplay／RNG／save／queue schema 更動，未更新 golden、frozen PNG 或 tolerance，未修改 plan/00。
  未 commit、push、開 PR、發版或開啟新視窗。

## 正式事件啟用前的整體完成稽核（2026-10-08）

- ordinary production event activation 優先：`s1560/index.ts` 仍回傳 `events: []`。
  `App.mountGame` 的 initializeBridgeSession 未傳 eventEngine，bridge 預設為 null；root 本輪直接讀取確認。
  已測試的引擎與 effect infrastructure 不等於正式遊戲已觸發史實／通用事件。
  下一步驗證 catalog／missing-entity preflight，fresh／load 共用真正 provider，並用原生事件→存檔→讀檔驗收。
- activation audit 的具體接口：ScenarioBundleData.events 仍為 legacy schema，需另用 zCanonicalEventsFile loader。
  實際 21 events 使用但尚未完成的 operation kinds 為 breakPact 與 grantShogunateTitle。
  event effect 不可直接重用帶背盟懲罰／金錢成本的玩家 command handler；不能刪掉這些事件來取得 green gate。
  同類 pact 已存在與 makeRonin 對 living leader 的 runtime throws，也須以 canonical contract 解決。
  engine preflight 失敗會復原 RNG 後 rethrow，不是自動將危險 event 當成不 eligible；不能依賴它避開全部 gameplay state。
- App fresh／load／import 都必須在發布局面前準備 matching catalog；engine 本身不寫入 save。
  useSaveLoad 的 synchronous onLoad 若改 async，保留 generation／busy ownership；debug replay 同樣需 engine dependency。
  真正驗收包括普通 wizard 載入全部 21 definitions、桶狹間 trigger／choice→save→App reload、保存 binding 與 next-tick resolution。
  同時覆蓋 forced pact／leader departure、缺少地方條件不觸發、generic event 真正觸發與 production replay RNG 相同。
- 全國資料仍只載入 tokai／kinki；其他七地方的 officer arrays 為空，validator 自動選 present regions。
  B3 關東／B4 甲信越需協同處理長尾領土與本城／當主／官員依存，不能用缺漏引用獨立宣稱 B3 通過。
  B5 北陸、B6 中國、B7 四國、B8 九州與 B9 東北仍待正式 roster／ownership／routes／地理史料驗證。
  partial data 的 unification 或 AI test 不能代替全國 golden、20 seeds ×25 years 與各批 quota 驗收。
- 戰略部隊目前只有 auto-return UI，11 的變更目標／撤返及玩家主動開始符合條件的合戰仍待補齊。
  既有 core command 可供正常 queue 整合，但需要 stale／pending／ownership 驗證與原生 military controls。
  不將尚未裁決的戰術 retreat／Awe 決策混入此戰略控制入口。
- 這些是已確認的未完成項，不是新的縮小版 goal；其餘原有 release／balance／visual gates 仍保留。

## 正式事件型錄與讀檔外殼（2026-10-08）

- `loadS1560EventCatalog` 解析全部十五筆史實與六筆汎用定義。
  `loadScenarioEventEngine` 每次建立獨立引擎；未知劇本拒絕，不以空型錄降級。
  tiny／固定 visual fixture 明確使用空引擎，舊資料束的 legacy events 欄不混入 canonical 格式。
- App 在新局、讀檔及匯入發布前等待引擎，保留原局、busy 與 generation 所有權。
  換畫面、換局或卸載取消舊完成結果；真正載入失敗保留預覽並顯示載入失敗訊息。
  ordinary wizard 的既有 seed URL 覆寫已接線，零也保留；debug replay 重建相同正式引擎。
- 強制解約不歸罪任一端點，新增中性報告；同類協定刷新不重複加感情。
  同盟／從屬衝突保留原協定；直授役職使用累計威信差額，不付獻金。
  當主與無可達歸建城的武將不出奔；不虛構死亡、繼承或丟失部隊。
  契約記錄於 10 D20／02 的事件解約補充，不刪型錄效果，未改 plan/00、BAL 或存檔格式。
- 四項正式驗收使用 seed42 真實 120 日 Oda 軌跡，每日檢查合法佇列與不變量。
  真正待選桶狹間經存檔 codec 與 bridge 還原，下一日只結算一次，與參照局完整狀態相同。
  原始 121 日含事件命令紀錄經 production debug API 重播，hash 相同且不改目前局面。
  另有六項 App 整合測試驗證普通 provider、取消、卸載、identity 更換與原生匯入。
- 全套 **3136 tests／265 files 通過，28.66 秒**，見 `/tmp/tenka-production-events-unit-corrected.log`。
  typecheck、完整 lint、資料驗證、production build 通過；字型 1470 字元／311.4 KB。
  初次全套七項失敗保留 `/tmp/tenka-production-events-unit-final.log`，修正舊同步與 unsupported 期待。
  region preflight rollback 改以真正無效的期限溢位驗證；未刪 rollback 檢查。
  新版字串增加前的完整 production build 保留 `/tmp/tenka-production-events-build-corrected.log`。
- 正式桶狹間 headless flow **1 passed，19.2 秒**，見 `/tmp/tenka-production-events-native-final.log`。
  真正 wizard→120 日→原生選項→下一日一次結算→手動存讀保存 events／RNG／time。
  `/tmp/tenka-production-events-native-final-artifacts` 保留實際待選 screenshot 與 state/log JSON。
  前兩次失敗分別為 x5 正常續跑後的不當立即 state 期待，以及 slot 按鈕誤用「讀檔」而非「載入」。
  原始 native／native-corrected logs 與 artifacts 保留，不用 debug step 或直接寫 live state 通過。
- 最新 headless functional **56 passed／1 failed，3.1 分鐘**，見 `/tmp/tenka-production-events-headless.log`。
  唯一失敗是舊 recovery fixture 把已有正式型錄的桶狹間當成 unavailable。
  改成真正未知的 legacy ID 後，原生匯入／不可 Escape／完整匯出 **1 passed，2.7 秒**。
  結果見 `/tmp/tenka-production-events-recovery.log`；本輪不是同一次全套 57 passed。
  未重跑 frozen visual 或 gallery，六張 baseline SHA256 相同，沒有新視窗、commit、push 或發版。
- 後續平行工作為戰略部隊變更目標／撤返與玩家合戰入口；不改未裁決的 retreat／Awe。
  七地方全國資料、全國 long-run／balance／visual／release 驗收仍未完成，不縮小整體 goal。

## 在外軍令與實體轉向（2026-10-08）

- 正式地圖新增玩家部隊的變更目標、撤返與合法合戰入口。
  所有操作沿用中央驗證及下一日 Command 佇列，不直接改寫 GameState。
  草稿、回呼與暫停恢復綁定局身分；合戰採全局待結算互斥與既有 FIFO。
- 原軍令會丟失途中進度，並把尚在路上的部隊立即收入原城。
  新核心共用 `planArmyReroute`，保留已付進度及進入邊成本。
  可選 `reversingEdgeEndNodeId` 保存尚未抵達的原端點；折返時進度遞減。
  只有實際抵達才收入部隊或補給；兩方向的節點追擊也要求實際會合。
- 預覽共用上述純查詢，顯示目前實體位置的基準路程及當前邊方向。
  速度、通行與後續局勢仍可影響實際抵達日，不把基準路程稱為保證到期日。
- 控制器與目標對話框的實體預覽測試 **19 通過**。
  見 `/tmp/tenka-army-physical-preview-decimal-final.log`；小於一日的路程不能截斷成零日。
- 實體轉向、軍事、invariants、selectors 與存檔 focused 測試 **149 通過**。
  見 `/tmp/tenka-army-physical-final-focused.log`；完整型別檢查通過。
  初始四項實體回歸全失敗，證據保留於 `/tmp/tenka-army-physical-before.log`。
- 舊追擊 fixture 在十日路段已走 1.25 日，卻斷言同節點追擊。
  新 fixture 生成實際會合，保留原傷害與資格斷言；另測兩方向未會合不追擊。
- 原正式 UI headless 驗收通過，見 `/tmp/tenka-army-orders-native-strength.log`。
  該次使用實體修正前的 build，撤返發生於已抵達節點，不能當作新核心驗收。
  重新 build 後軍令與正式事件 headless **2 通過**，見 `/tmp/tenka-army-physical-native.log`。
  新軍令流程另在真實途中開啟預覽，驗證正值小數路程、目前邊文字與取消不改局面。
  完整非視覺功能 headless 驗收 **58 通過，3.2 分鐘**。
  見 `/tmp/tenka-army-physical-functional.log`；六張凍結策略基準 hash 未變。
- 最新整合全套 **3194 tests／272 files 通過**，見 `/tmp/tenka-army-physical-integrated-unit.log`。
  完整 typecheck、lint、build 通過，見 `/tmp/tenka-army-physical-integrated-{types,lint,build}.log`。
  地方資料驗證仍只涵蓋東海與近畿，零錯誤；字型為 1472 字元、311.8 KB。
- 初次整合為 3186 通過、五項 golden／replay 失敗，原始輸出保留。
  隔離副本只恢復舊途中補給，就精確還原兩份完整舊 golden；新序列重跑與存讀檔相同。
  見 `/tmp/tenka-army-audit-current.json` 與 `/tmp/tenka-army-audit-legacy-refill.json`。
  因此只更新 `golden-mini.json`、`golden-ai.json` 的實際 checkpoint，BAL 與活動次數不變。
- M4 replay 另揭露合作制壓缺陷，不是只改 hash 就算修正。
  同家另一軍隊先收取郡時，`reconcilePeace` 原會把仍在制壓的友軍錯當停戰而撤返。
  修正後由既有行軍／任務流程接續；新完整 tick 回歸保留每日 invariants 與兩軍攻城斷言。
  原 replay 所有指令與落城驗收通過，重跑 hash 均為 `1fa6d835811be620`，才更新該一個 hash。
  見 `/tmp/tenka-cooperative-subjugation-before.log` 與 `/tmp/tenka-cooperative-m4-repeat.json`。
- 另以 invariant-valid fixture 確認無繼承人缺陷，尚未修正。
  NPC 自然死亡後留下已滅亡勢力的城郡；玩家真實死亡後留下存活勢力的死亡當主。
  見 `/tmp/tenka-no-heir-readonly-audit.json` 與 `/tmp/tenka-player-no-heir-readonly-audit.json`。
  06 委託 10 決定仍有領地時的接收政策，但 10 只定義無城滅亡；已向使用者詢問。

## 秋收與月初順序修正（2026-10-08）

- 03 §3.6／§5.3 指定秋收 → 收入 → 維持費 → 當日兵糧消耗。
  原核心依 05 的相反偽碼先扣糧、最後秋收，已確認滿倉溢出、糧盡逃兵與政策時點錯誤。
  `tests/core/harvestOrder.spec.ts` 原始四項語意失敗保留於 `/tmp/tenka-harvest-order-before.log`。
- 新順序為秋收 → 建造 → 輸送 → 月收支與快照 → 城兵日耗 → 月徵兵。
  公式、亂數、十三步管線與 Step 7 出陣軍糧不變；05 §5.2 已對齊 03 的順序權威。
  六項新回歸含真實 8/30 → 9/1、正值守軍、滿倉與每日 invariants；focused 36 通過。
  見 `/tmp/tenka-harvest-order-final-focused.log`；完整型別、lint 與 build 通過。
- 首次全套為 **3195 通過、五項失敗**，耗時異常為 1192.68 秒，原始輸出完整保留。
  見 `/tmp/tenka-harvest-order-full-unit.log`；三項為 golden 變化，仍需因果與重現稽核。
  另兩項為五秒 App 逾時與地圖查詢超過既有 250 ms 預算，不先放寬限制。
  在同機單 worker 隔離重跑這兩檔，**六項通過，2.31 秒**，見 `/tmp/tenka-harvest-order-isolated-timing.log`。
  這證明隔離重跑通過，不宣稱已查明異常慢速的原因，也不能代替最新全套驗收。
- 隔離副本只還原舊 economy 階段順序，就精確還原 mini、AI 與外交三份完整舊 golden。
  現序列逐日 invariants 通過，所有實際排入的固定與 AI 指令均接受；重跑與中點讀檔續跑一致。
  BAL、指令與事件次數不變，據此只更新這三份實際 checkpoint，不修改 replay 指令或容差。
  見 `/tmp/tenka-harvest-audit-{current-validated,legacy-order}.jsonl`。
  差異不只秋收：日耗在月收支、建造及輸送之後，當日消耗依據也因此對齊規格。
- 獨立 review 補入真實輸送跨 8/29 → 8/30 → 9/1 的合併回歸，七項全部通過。
  先以開局面容量截斷秋收，再完工米藏、接受抵達貨物與金錢、付款並扣日耗。
  快照的 `goldBefore` 記錄已抵達貨金；政策有足額維持費而不被誤廢止。
  見 `/tmp/tenka-harvest-transport-final.log`；後續型別檢查把 fixture 的錯誤 `farms` 值修成 `agri`。
  修正後七項通過，見 `/tmp/tenka-harvest-transport-typed-focus.log`。
- 最新完整整合 **3201 tests／273 files 通過，24.38 秒**，見 `/tmp/tenka-harvest-order-final-unit.log`。
  完整型別與 lint 通過；重建 2.53 秒，見 `/tmp/tenka-harvest-order-final-build.log`。
- 最新完整 headless 為 **62 通過、兩失敗、一個 opt-in perf skip**，不是整套全綠。
  見 `/tmp/tenka-harvest-order-headless.log`；一項是凍結截圖，一項是驗收腳本的 owner race。
  Trace 證明桶狹間已觸發，但 generic owner helper 搶先點選其選項，導致主驗收看不到對話框。
  首次腳本修正的重跑另在三月卡住：背景速度鍵於檢查後被新 modal 停用，native click 無限等待。
  新 helper 不代選目標事件，且只在無 owner 時恢復速度；出現新 owner 後回到正常處理迴圈。
  不放寬總逾時、不跳過未知 owner；生產事件程式碼未改。
- 修正後普通 wizard → 真實桶狹間 → 原生選擇 → 存讀檔 headless **連續三次通過**。
  見 `/tmp/tenka-production-event-owner-race-final.log`；失敗與成功的原始 trace 都保留。
- 凍結截圖的新實測差異為 overview 20200、operational 20156、close 16650 pixels；容許值仍是 100。
  六份基準 hash 未變；目前 reference 缺少 11 §3.3.2 指定家紋／名稱及 §3.3.3 固定報告入口。
  恢復舊 reference 外觀與保留這兩項必需內容互相衝突；已向使用者詢問，不遮罩或偷偷更新基準。

## 全國資料研究邊界（2026-10-08）

- B3 關東與 B4 甲信越須共同接線；長尾的本城在 B4，兩座上野領城在 B3。
  長尾武將依 14 D11 歸 `officers/koshinetsu.json`，不可為分批通過複製官員或虛設本城。
  14 表格與具名清單都是六城；跨區說明已更正為越後三、信濃一、上野二。
- 長尾景虎／春日山的開局身分有官方年表支持；年表將入廄橋定於 1560 年八月。
  因此 14 的上野領土是較晚遠征局面的遊戲抽象，不是桶狹間前同時成立的歷史快照。
  來源：[上越年表](https://joetsukankonavi.jp/kenshinkousai/chronology/)。
- 飯山市將景虎的重要築城定於 1564，市刊另列 1567 說及更早泉氏居館。
  14 的 1560 長尾飯山領城也是既定劇本抽象，不能把晚期築城描述成已查證開局史實。
  來源：[飯山市概要](https://www.city.iiyama.nagano.jp/contents/iiyama/iiyama-about/iiyama-gaiyou.htm)。
- 城址身分不等於精確遊戲座標或 1560 城主；這些欄位仍需來源與投影驗證。
  長野業盛的既定生年 1546 依現有十五歲元服規則於 1561 登場，不能擅改成開局在職。
  長野業正生年、業盛生年史據與上泉死亡年仍有未解項，不以便利日期填滿配額。
  上泉生年 1508 有市府人物介紹支持，但該介紹未確定死亡年。
  來源：[前橋人物介紹](https://www.city.maebashi.gunma.jp/soshiki/bunkasupotsukanko/bunkakokusai/gyomu/8/21198.html)。
- B3 開局當主的追加研究現已寫入正式 JSON；具名名單有七十四將。
  氏康 1515–1571、義堯 1507–1574、晴朝 1534–1614 有市府或市立博物館資料支持。
  氏康資料：[小田原人物頁](https://www.city.odawara.kanagawa.jp/encycl/neohojo5/006/)。
  義堯資料：[館山博物館](https://www.city.tateyama.chiba.jp/satomi/kanzenban/kan_2shou/k2shou_4/k2shou_4min.html)。
  晴朝資料：
  [結城市文化財](https://www.city.yuki.lg.jp/kosodate-kyouiku/shougaigakushuu/bunkazai/bunkazai/kenshitei/page003180.html)。
- 氏政 1538–1590 的大型官方 PDF 尚只有索引摘錄；義昭家譜目錄日期不能直接當作生卒。
  廣綱 1557 復歸宇都宮有教育機關資料，但精確生卒未確定；預設生年加十五是遊戲元服規則。
- 小田原詳述氏康於 1559 年十二月退位，摘要年表則寫 1560。
  保留 14 的氏康當主屬既定劇本選擇，不宣稱毫無爭議的正式家督年表。
  來源：[小田原家督說明](https://www.city.odawara.kanagawa.jp/encycl/neohojo5/009/)。

## 關東與甲信越共同資料批次

- B3／B4 地理、關東武將與甲信越武將已平行製作並接入正式劇本。
  `src/data/scenarios/s1560/batches/` 保留製作來源與共同驗證資料。
  正式 `S1560_LOADED_REGIONS` 為東海、近畿、關東、甲信越。
  四地方合計五十九城、一百七十郡、二十六國、二十家及三百二十八名武將。
- `kanto-koshinetsu-clans.json` 新增七家，保留 14 §3.3 的當主、本城、色盤與外交。
  六個測試通過，涵蓋正式資料、persona、外交引用、三組四十八月同盟及永久婚姻。
  初始金錢已依共同郡石高及 14 §3.2 校準；威信仍是明示遊戲設計值。
- 未確定生卒年的具名人物可用明示設計值，不可宣稱已查證史實。
  武將原始 JSON 的 `_provenance` 保留來源、查證欄位及估算界線；schema 不把此資訊載入遊戲。
  元服與開局隸屬仍須符合既定劇本規則，不以提前登場填補配額。
- 新增關東七十四將、甲信越七十將；個別未確定生卒年仍保留估算標示。
  字型子集已重建，共一千五百三十七字形、323.8 KB，名稱涵蓋檢查通過。
  四地方結構資料驗證零錯誤、零警告；正式建構與六十日存讀續跑測試通過。
  其餘五地方、全國長期平衡與完整驗收仍未完成，不能宣稱全國遊戲完成。
- 正式四地方整合後，全套單元測試 3221 passed；型別、lint、build 與資料驗證通過。
  Chromium 全套 headless、單 worker 實跑為 65 passed、1 failed、1 skipped，耗時 3.6 分鐘。
  北條與長尾都經原生新局、手動存檔、重新載入標題及讀檔，完整狀態與 RNG 相同。
  M6 除錯流程保留正式武田及外交，援軍改以既有長尾敵對作為鄰近目標；今川挖角不變。
  唯一失敗仍是三張 frozen 策略截圖的既有必要 UI 契約衝突；未更新圖檔或容許值。
  共同六十日存讀測試未接事件引擎；後續東部事件測試另以真實引擎驗證實際軌跡。

## 北陸共同資料批次與東部事件回歸

- B5 地理與具名武將已平行製作並接入正式五地方劇本，`batches/` 保留製作來源。
  新增地理有四國、十城、二十八郡、一百三十五萬石及四十二條街道。
  具名武將四十人：朝倉二十、畠山十一、神保八與明智光秀浪人一人。
  每人有來源與估算界線；地方小家整合不等於史實同日直接任職。
- 後瀨山的朝倉領有遵循既定劇本，並非 1560 年史實若狹武田領有的重建。
  大野採後期城址的地理抽象，不將亥山城錯名為大野城，也不宣稱後期城址已在 1560 年築成。
- 正式共同五地方結構與六十日 AI、真實事件引擎、存讀續跑測試通過。
  本願寺加賀坊官仍按 D11 留在近畿檔；七里賴周已補入，近畿坊官合計十五人。
  七里卒年目錄與後期文書矛盾，採明示設計估值；杉浦大聖寺駐在是具體位置的遊戲抽象。
  累積共六十九城、一百九十八郡、三十國、二十三家、三百六十九名武將及一千零九十九萬四千石。
  正式五地方資料驗證零錯誤、零警告；字型子集 326.1 KB，名稱涵蓋檢查通過。
  其餘四地方尚未製作，全國長期平衡、完整史實事件與發版驗收均未完成。
- 真實武田及長尾 seed42 軌跡都於 day600 到達川中島事件，並經原生 codec 保留待選身分。
  下一日執行真實選項後，全部持久狀態及 RNG 與未存讀軌跡相同；不比較暫態 `ai.intentLog`。
  該測試發現 day324 的一支潰逃部隊仍掛在持續野戰中；修正僅移除失效部隊引用。
  軍事與兩條東部事件測試 66 passed，既有 golden 8 passed，未更新快照。
  救援野戰中的攻城雙向引用已補用既有 detachment；潰逃與全滅的回歸先失敗、修正後通過。
  存活攻城部隊在實際下一次交換獲勝後續攻原城；軍事、golden 與 replay 共 82 passed。
- 朝倉景鏡、朝倉景紀、畠山義續、畠山義綱與神保長住的親族旗標有明示來源。
  同姓不自動視為親族；五地方真實全 AI 七百二十日軌跡通過每日不變量檢查。
  朝倉、畠山與神保都有實際一般命令；和平開局不要求每家立即出兵。
- 全套單元測試 3243 passed，涵蓋 281 檔；型別、lint、資料驗證與 build 通過。
  build 仍有既有大於 500 KB 的 chunk 警告，不宣稱無警告建構。
  Chromium 全套 headless、單 worker 為 68 passed、1 failed、1 skipped，耗時 3.8 分鐘。
  北條、朝倉、畠山、神保與長尾的原生新局、存檔、重新載入及讀檔均通過。
  M6 流程通過；唯一失敗仍是 frozen 策略截圖的必要 UI 契約衝突。
  六張 frozen 圖檔前後 SHA256 完全相同，未修改容許值；00 無 diff。
- B5 當時的全國驗收稽核發現 `simulateAiGame` 未接正式史實事件引擎。
  當時工具也未統計史實事件，該批長期模擬不能證明 10-T6 的二十組事件中位數門檻。
  中國、四國、九州、東北與全國 AI 合法性、平衡、效能、soak 及發版驗收仍待完成。
  中國先行來源研究已平行完成，但不是六十九將或全部城址的製作完成證明。

## 中國正式批次、模擬工具與四國製作

- B6 已接入正式六地方資料，新增十一國、十六城、四十四郡與二百一十五萬石。
  中國檔有六十九名不同人物；鳥取武田高信另依 D11 留在近畿山名檔。
  正式共八十五城、二百四十二郡、四十一國、二十七家、四百三十九名武將及一千三百一十四萬四千石。
  毛利、尼子、浦上與赤松已閉合本城和當主；山名保留原本身分，只擴入因幡領。
  全國仍缺四國、九州與東北，六地方驗證不等於全國驗收。
- 製作來源區分史料與設計值；D25 排除不適合 1560 在世名單的志道廣良，另收志道元保。
  米子採中世飯之山，龍野採雞籠山；備中松山的毛利領有明示為既定劇本提前抽象。
  未以同姓推定親族，也未用配額理由改寫人物生卒或放寬 schema。
- 六地方實際 AI、事件引擎及中途 codec 存讀重演通過，三項共同測試全部通過。
  比較 helper 改為原位置替換既有 ID；原先兩項失敗只因把同一山名資料移到陣列末尾。

  嚴格七百二十日全 AI 測試仍在 day293 失敗：松平元康戰死後無可用親族。
  普通死亡路徑標記松平滅亡，卻仍保留岡崎及三郡所有權，違反 INV-02／INV-22。
  原始診斷沒有事件重新移轉領地；不得以事件修正或幼年繼承掩蓋此問題。
  非親族繼承或殘存領地歸屬仍待使用者決定，失敗測試保留。

- `tools/simulate.ts` 已使用每次新建的正式事件引擎，完整觀測要求年數，統一後不提前結束。
  史實次數按實際觸發定義計數；每月資料含石高、城數、兵力、金錢、威信與存亡。
  二百萬石門檻同時保留曆年、絕對日與經過年數，不混用量綱。
  `--seed` 指定單種子，`--seeds` 指定數量；寬表、完整月表與 JSON 可分別指定輸出。
  八項工具測試通過；舊無事件呼叫的反向測試失敗，恢復後通過，未更新 golden。

  已存五地方 seed42 兩年原始列；它不是六地方或二十組全國長期證明。
  繼承缺陷尚未解決前，不宣稱長期平衡、史實中位數、soak 或發版門檻通過。

- 四國先行製作時，地理與四家勢力為 staged B7，尚未匯入正式 loader。
  地理有四國、八城、二十二郡、九十五萬石與三十三條路；累積三百五十七節點連通。
  地理五項及勢力三項測試通過；三好保留原本城、分檔及身分，只重算新增阿讚領的金錢。
  來島真實 pin 落在粗輪廓外約 6.55 wu，符合既有 8 wu 容差，未改輪廓或驗證器。
  audit 與測試以正式 schema 解析 raw 地理資料，修正三項型別錯誤，不用型別轉型繞過。
  該次驗證尚未完成具名武將、國親卒年契約及共同驗收；後續結果見下一節。
- D26 修正成年但延後登場者的初始可用性，保留五名北陸人物的實際登場年。
  年齡與登場年均達門檻才設 `hasComeOfAge`；未指定值及明示 null 的既有語意不變。
  十五項新回歸涵蓋五人實際年度登場一次、俸祿與繼承排除及亂數／死亡排程不變。
  相關四檔六十一項測試通過；恢復舊 age-only 初始化時，九項回歸失敗。
- D26 修正後全套單元為 3293 passed、1 failed，共 289 檔；唯一失敗仍是 day293 繼承缺陷。
  型別、lint、正式六地方資料驗證及 build 通過；build 保留既有大於 500 KB 的 chunk 警告。
  修改後另跑原生十家存讀與 smoke，headless 單 worker 的十四項全部通過，耗時 43.0 秒。
- 最近完整 headless Chromium 單 worker 為 73 passed、1 failed、1 skipped，耗時 4.1 分鐘。
  十家勢力的原生選局、手動存檔、重新載入及讀檔通過；此批在 D26 修改前執行。
  唯一失敗是三張 frozen 策略截圖；差異為 20200／20156／16650 pixels，門檻仍是 100。
  六張 frozen 圖檔 SHA256 逐一相同，未開視窗、未改基準或容許值；00 無 diff。
  繼承政策與必要 UI 的 frozen 契約仍未解決，不把失敗或 skip 算成通過。

## 四國正式載入與九州先行製作

- 正式型錄新增信忠與義昭，補齊事件人物引用；六地方具名總數由四百三十九增至四百四十一。
  信忠於 1572 年登場；義昭於 1566 年登場，開局不以浪人身分繞過延後登場限制。
  生卒與登場依據分開記錄；信忠 1572／1573 的來源差異仍保留。
- B7 已接入正式 loader 與新遊戲範圍；四國檔有三十七名不同人物。
  正式共九十三城、二百六十四郡、四十五國、三十一家及四百七十八名具名武將。
  總石高為一千四百零九萬四千；三好保留原本城與分檔，金錢重算為 8900。
  九州與東北仍未載入，七地方結果不等於全國完成。
- D27 保留國親卒年 1560，只對具名劇本及領地閉合條件給予 V8 例外。
  九項負例逐一驗證例外邊界；隔離副本恢復舊截止年後，實際共同驗證只因國親 V8 失敗。
  未改自然死亡排程、繼承政策或史實日期以湊配額。
- 共同驗證比對正式與製作資料完全一致；六十日實際 AI／事件重演及中途 codec 存讀通過。
  五十六項載入、人物、地理、勢力及事件引用測試通過，遷移 checker 由 55 項降至 0。
  checker 的故意舊值探針仍報 1 項；不以弱化 checker 或移除失敗測試取得零值。
- 島津製作名單加入後，字型重新產生為 1593 字元、333.5 KB。
  七地方資料驗證為零 ERROR／WARN，簡體掃描零命中。
  型別、lint 與 build 通過；build 的既有大 chunk 警告仍保留。
- 七地方完整單元先行結果為 3324 passed、2 failed，共 295 檔。
  新增日常合法性失敗為結城滅亡後仍保留外交工作；既有 B6 day293 無親族領地問題仍失敗。
  B6 固定地方回歸與現行完整範圍並列，不以新資料改變亂數軌跡掩蓋舊缺陷。
  外交清理修正以真實 day185 攻城及 normal／hard 三百六十日驗證。
  後續完整重跑為 3340 passed、1 failed，共 298 檔；唯一失敗仍為 B6 day293 無親族領地問題。
  現行七地方七百二十日回歸通過，不代表舊固定地方缺陷消失。
- 月初 toast 測試改為固定 seed42，並等實際 toast 與原生具申收件匣皆被觀測。
  三項流程與失敗案例三次 headless 重跑全部通過；未知 dialog 仍報錯，逾時未放寬。
  此為測試同步修正，不改執行期行為；完整 headless browser 為 78 passed、1 failed、1 skipped。
  十五家勢力原生選局與存讀通過；唯一失敗仍為三張凍結相機截圖，像素差與前次相同。
  六份基準雜湊未變，未開新視窗或放寬門檻。
- B8 地理及五家勢力仍為製作資料，不匯入正式 loader。
  D28 交換大友與結城色盤索引，保留豐後水道必備海路、四十色集合及最小環距 4。
  不改色盤內容、輪廓、凍結截圖或驗證門檻；東北新增相鄰邊仍須另驗。
  九州完整具名名單、共同執行期與全國配額、平衡、覆蓋率、效能及發版驗收仍未完成。

## 九州正式載入與東北共同驗證

- B8 已接入正式 loader 與新遊戲範圍；九州新增七十六名不同人物。
  正式八地方共一百零七城、三百零四郡、五十四國、三十六家及五百五十四名武將。
  總石高為一千五百八十九萬四千；九州五家金錢使用實際領地石高計算。
  東北尚未載入正式資料，不能把本節的製作驗證當成全國正式驗收。
- D29 排除開局前已死亡的小河信安，收錄不同人物小河信俊；未改卒年或合併別名。
  V10 只新增有來源的完整人名「江里口信常」例外，一般「里」字誤用仍遭拒絕。
  中國製作 helper 保留既有郡座標，避免後續小倉城影響原本豐浦郡位置。
  唯一小於建議 24 wu 的配對明列為豐浦郡與小倉城；V13 座標重合仍是錯誤。
- 滅亡勢力的外交工作與幕府清理使用共用 helper；四條滅亡路徑皆接入。
  幕府回歸五項、相關核心九十一項通過；不改領地歸屬、繼承資格或亂數。
  結城 day185 回歸固定原本七地方與 seed15600519，保留實際攻城及每日不變量。
  B6 seed1 day293 的松平無親族領地缺陷仍失敗，不能以新地方的亂數軌跡掩蓋。
- 東北地理、五家勢力及六十五名武將已完成製作共同驗證，未啟用正式 loader。
  實際九地方製作資料共一百二十一城、三百四十四郡、六十國、四十一家及六百一十九將。
  道路四百九十五條，總石高一千七百九十九萬四千；V1–V15 零違規。
  normal／hard 六十日全 AI 與正式事件重演通過；三十日 codec 存讀再推進結果相同。
  正式八地方所有既有資料與排列不變；無新增假人物或史料未支持的親族旗標。
- 東北其他四家四十將的十四項測試通過；其中八人延後登場，三十二人開局可用。
  死亡來源連結已換成查證的制度出版物；佐瀨父子出生間距改為明示設計估值。
  次級來源身分、未知生卒與初始任職估值仍逐欄標示，不宣稱全面史實認證。
- 八地方修正後完整單元為 3397 passed、1 failed，共 307 檔。
  唯一失敗為 B6 day293；型別、lint、資料驗證與 build 通過。
  字型重新產生為 1632 字元、341.6 KB；簡體掃描零命中，字型涵蓋率通過。
  build 保留既有大於 500 KB 的 chunk 警告。
- 完整 headless browser 先跑出 63 passed、21 failed、1 skipped，耗時 4.5 分鐘。
  二十項選局測試保留舊七地方陣列；補上九州後，全部二十項定向重跑通過，耗時 51.4 秒。
  此結果包含五家九州與原生手動存讀的完整 state／RNG 比對，不是完整八十五項重跑。
  另一項失敗仍為 frozen 相機截圖；六份基準雜湊、門檻與 00 全部未改。
  未開視窗，未提交、推送或發版；全國正式載入與後續長期、效能、覆蓋率及發版驗收仍待完成。

## 全國正式載入與驗收缺口

- B9 已接入正式 loader 與新遊戲範圍，九地方均有實際具名武將資料。
  全國共一百二十一城、三百四十四郡、六十國、四十一家及六百一十九名武將。
  道路四百九十五條，總石高一千七百九十九萬四千；正式 V1–V15 零 ERROR／WARN。
  字型涵蓋 1639 字元，342.8 KB；簡體掃描零命中，開局配額與織田、今川石高校準通過。
- 啟用遷移 checker 初始列出七十八項舊值或缺少的接線，修正後為零；舊值探針仍報一項。
  後續完整單元發現三個檔案仍預期全國配額或人物引用失敗，現已改成要求完整驗證零違規。
  該十四項定向測試通過，既有錯誤配額與引用負例保留，checker 範圍也補入三檔。
  原本固定地方回歸不隨正式範圍擴大，避免改變亂數軌跡來掩蓋歷史失敗。
- 十檔五十五項全國載入與共同驗證測試通過；型別、lint 與 build 通過。
  原生二十五家勢力的選局、手動存檔、重載頁面及讀檔全部通過，耗時 1.2 分鐘。
  各案比對實際九地方、領地、本城及完整 state／RNG；此為 headless 單 worker 執行。
  不是完整九十項 browser 重跑；六份 frozen 基準、100 pixels 門檻與 00 未修改。
- 新增全國 golden 使用 seed15600519、正式 AI 指令與事件引擎，要求五年逐年 hash。
  實際執行在 day450 失敗：齋藤已滅亡，卻仍擁有稻葉山、大垣、岩村與十三郡。
  INV-02／INV-22 共三十二項，指令拒絕及非法 AI 意圖均為零；未生成假 golden 基準。
  B6 松平 day293 的同類失敗也保留；無親族繼承與殘存領地政策仍待使用者決定。
- 新增獨立 serial perf workspace 與 `test:perf`，不與一般平行單元混量。
  正式事件、全 AI、六十日暖身及三百六十日量測的兩次平均為 20.39／16.53 ms。
  原始七百二十個 sample 保留；8 ms 門檻與單次重測規則不變。
  空缺額不搜尋運糧路線、確定論 heap 與機率未命中時的 RNG 探針修正後，平均為 13.89／11.64 ms。
  修正改善實測但仍未達門檻，不把 profiler 或部分世界的耗時當成全國合格證明。
- Heap 保留原本 cost／nodeId／mode 次序、嚴格鬆弛、海陸雙態與全部路程算式。
  舊線性掃描 oracle 與新 heap 的完整路徑結果一致；相關一百六十五項測試通過。
  事件機率未命中只複製五個 RNG 數值；命中仍完整 staged preflight，十六項回歸通過。
  兩項修正後四百二十日逐日 state hash 與指令數全部相同，最後 hash 為 `1966146830de480b`。
  此比較不等於五年 golden 通過，也不修正 day450 的領地缺陷。
- 新增 core-only V8 覆蓋率命令，實際報告包含一百一十六個 core 檔，無 UI／app 或測試檔。
  行覆蓋率 93.45%，分支 89.53%，高於 80／70 門檻；完整覆蓋率測試仍非綠燈。
  該次為 3404 passed、3 failed；兩項是無親族領地缺陷，一項是 app 測試 5 秒逾時。
  同一 app 檔的六項隔離覆蓋率重跑通過，未改逾時值；完整重跑仍待確認。
- CI 保留目前 M6 標記，不提前宣稱 M9 或 DONE。
  perf 與 core coverage 在 M9 起阻斷；十五項門檻及 workflow 接線測試通過。
  Vitest workspace 不採用原本 CLI exclude，因此改成只在基本 CI 覆蓋率步驟設環境旗標。
  實際 discovery 證實基本步驟排除獨立全國 golden；本機完整測試與獨立 CI golden 仍收錄。
  未排除無親族不變量回歸，未推送、觸發遠端 CI、部署或發版。

## 全國效能與發版門檻續驗

- AI 指令 sink 的公開預設仍完整更新各家 bookkeeping；正式 AI 只深複製目前 authority 的資料。
  三十八項定向測試通過，涵蓋資源保留、重複指令、集結計畫與外家軍團清理。
  四百二十日逐日 hash 與指令數再次全部相同，最後 hash 仍為 `1966146830de480b`。
  隔離量測平均 11.59／10.05 ms，兩次各三百六十個 sample 保留，仍未達 8 ms。
- 型別、完整 lint 與正式 build 通過；build 仍提示大型 chunk，未放寬大小警告。
  九十項 browser 已確認 discovery；單 worker 重跑八十一項通過，九項因全套 300 秒門檻未執行。
  原始逾時輸出保留，門檻不變；雙 worker 重跑為八十七項通過、兩項失敗及一項 FPS 選擇性略過。
  耗時 4.4 分鐘；其中 P3 遇到真實南蠻船事件的選擇對話框，測試尚未透過 UI 回答。
  另一項是既有 frozen 基準差異；不把平行功能 suite 當成硬體 FPS 量測。
  六份 frozen PNG 的 SHA256 全數相同，100 pixels 門檻未修改。
- 夜間十年 golden 與 serial benchmark workflow 已接線，尚未在遠端執行。
  本機啟用十年測試後仍於 day450 因齋藤殘存領地失敗；未生成五年或十年基準。
  workflow 保留原始 benchmark 與 golden 輸出，夜間觀測不替代阻斷式五年驗收。
- Pages workflow 改成僅接受同 repo、main push 的成功 CI，建置該次已驗證 SHA。
  十一項門檻測試通過；Pages 與 OIDC 寫入權限只交給依賴 build 的部署 job。
  本機接線不等於遠端成功；尚未推送、觸發 CI、部署或發版，M6 標記不變。
- Perf helper 的九項假時鐘測試通過，暖身與驗證不納入計時，外層總耗時仍決定平均。
  8／16 ms 等於門檻仍失敗；首次超標只重建完整 workload 一次，兩次的全部 sample 都保留。
  指令或不變量例外直接失敗，不改成時間超標重測；此證明門檻邏輯，不證明實測合格。
- 最新 helper 接線後的隔離實測為 11.20／8.64 ms，兩次均未達 8 ms，七百二十項原始 sample 保留。
  P3 改成 seed1，真實南蠻船事件於 day60 出現；透過原生選項回答後，定向 headless 測試通過。
  指令 log 證實選擇只執行一次，解鎖旗標為一；三個月進度與暫停日期檢查保留。
  原始隨機開局失敗保留，未改事件機率或使用 debug 寫入；完整 browser 再驗仍待執行。
- 獨立 Metal headless GPU gate 通過：1080p、二十支移動部隊、30.006 秒及 3600 個 frame sample。
  frame-time p95 為 9 ms，renderer 為 Apple M3 Max；texture、terrain sprite 與 listener 計數一致。
  這是固定地圖的自動 gate，不替代全國四十部隊效能或七步手動驗收。
  續查確認此 helper 使用合成 view 部隊與 animation-frame 間隔，而非實際 postrender 回呼。
  原始結果保留，但不能據此宣稱真實四十支行軍部隊的 render completion 達標。
- 最新完整 core-only 覆蓋率使用雙 worker，無其他重型 workload，共 3448 passed、2 failed、1 skipped。
  六項 production event-session 測試均通過，原本 app 逾時未再次出現；未改 5 秒門檻。
  行覆蓋率 93.49%，分支 89.60%；一百一十六檔全屬 core，無測試檔或 UI／app 混入。
  剩餘兩項仍是 B6 day293 與全國 day450 的無親族領地缺陷；略過者為選擇性夜間十年測試。
  未設定本機排除 golden 的 CI 旗標，完整測試仍要求全國 golden，不因高覆蓋率而判為綠燈。
- P3 修正後的九十項完整 headless 重跑耗時 2.7 分鐘：88 passed、1 failed、1 skipped。
  唯一失敗為既有三視角 frozen PNG；略過的是獨立硬體 FPS case，另以單 worker 隔離執行通過。
  原生 JSON 證實 seed1 由一月一日至四月九日，day61 只執行一次南蠻船選擇，解鎖旗標為一。
  未把略過算成通過，未覆寫基準或改 300 秒門檻；此仍不是完整遊戲與發版驗收通過。
- `RELEASE_CHECKLIST.md` 保留全部未勾項，列出完整全國、平衡、效能、手動與遠端驗收要求。
  case-sensitive 連結檢查零違規，避免 macOS 檔名大小寫容錯掩蓋 Linux 的錯誤連結。
- AI 內部決策改成首次檢查指令時才深複製世界；公開 sink 與既有 pending orders 仍立即複製。
  四十四項定向測試通過；四百二十日的逐日 hash 與套用指令數全數相同。
  最後 hash 仍為 `1966146830de480b`；這項比對不等於五年 golden 通過。
  最新隔離實測為 11.42／8.68 ms，兩次均失敗，未證實較前次有速度改善。
  七百二十項 sample 保留於 `/tmp/tenka-national-after-lazy-perf.log`，8 ms 門檻不變。
  上述完整覆蓋率與 browser 結果早於此變更，尚未重跑；不把定向測試當成全套證明。
- 第二步移除首次檢查時隨世界複製、隨即被 entry snapshot 覆寫的 AI 分支。
  四十五項定向測試通過；四百二十日逐日 hash 與套用指令數仍全部相同。
  最新隔離量測為 10.44／7.75 ms，依既定唯一一次重試規則通過本機平均門檻。
  七百二十項 sample 保留於 `/tmp/tenka-national-after-ai-discard-perf.log`，首次失敗不刪除。
  此結果不證明 midgame tick p95、五年 golden 或完整遊戲驗收通過。
  新測試的 unknown 型別已用精確 guard 修正；一般及 core 型別檢查通過，未使用 suppression。
- 正式 build 產生 Vite manifest；新增 `validate:bundle` 依實際靜態 import closure 計算 gzip。
  初始 JavaScript 為 486216 bytes，動態劇本增量為 100847 bytes，subset font 為 351028 bytes。
  三項均低於原定 800／1200／2048 KiB，二十六項定向測試通過，未調整預算。
  這是本機靜態大小證明，不等於冷快取 Fast 4G 或 Pages 三秒內可操作。
- 新增四十支真實行軍部隊的 renderer 前置 gate，使用九地方各地既有主城、武將及資源。
  四十項 march 皆經正式 validator、queue 與 applier；不授予金錢、兵力或糧食，不改道路與 ownership。
  三十三項定向測試通過；實際 Pixi postrender observer 可重複釋放，destroy 後不殘留。
  三視角隔離 Metal headless 皆通過：各三十秒，平均約 120 FPS，實際回呼間隔 p95 約 9.1 ms。
  四十支皆 mounted；overview 可見四十，operational 可見三十九至四十，close 可見二十八至三十四。
- 四十部隊 gate 的原始證據保留；未把暫停核心的 renderer 量測當成全國 live gameplay 達標。
  原始回呼陣列與圖片保留於 `/tmp/tenka-national-canonical40-frame-artifacts` 及同前綴 HTML 備份。
  量測期間核心暫停，只更新真實部隊路徑的 view fraction；核心與 RNG 完全相同。
  這是 render-only 前置證明，不替代全國 ×5 行軍生命週期、七步手動驗收或 GPU pixel presentation。
- CI 與 Pages build 後新增阻斷式 bundle gate，失敗不能繼續 browser 或上傳 Pages artifact。
  CI 直接測試已查大小的 build，避免原本 `npm run e2e` 再建置一份未查的輸出。
  三十項 workflow 定向測試通過，保留既有信任條件與權限；尚未觸發遠端 CI 或部署。
- 最新無排除完整覆蓋率重跑為 3491 passed、2 failed、1 skipped，耗時 185.80 秒。
  core 行覆蓋率 93.50%，分支 89.62%；一百一十六檔均屬 core，無 app、UI 或測試檔混入。
  兩項仍為 B6 day293 與全國 day450 的無親族 ownership 缺陷，未更換 seed 或移除測試。
  整合後型別、完整 lint、全量資料、素材與字型檢查皆通過；完整 browser 再驗另行記錄。
- 整合後九十三項完整 headless 重跑為 88 passed、1 failed、4 skipped，耗時 2.9 分鐘。
  唯一失敗仍為既有三視角 frozen PNG；四項略過為選擇性效能 case，其中四十部隊三項另行通過。
  P3 原生南蠻船選擇與三個月推進再驗通過；六份 frozen SHA256、100 pixels 與 300 秒門檻不變。
  Pages-base 的獨立本機 build 與三項 bundle 預算也通過，不等於遠端 Pages 可操作性驗證。
- 既有二十部隊 gate 再以單 worker 隔離通過，三十秒 animation-frame 間隔 p95 為 9.1 ms。
  此 helper 仍使用合成 view 部隊，不把它當成正式四十部隊的 postrender 證明。
- 實跑 reference benchmark 發現同一檔被三個 workspace project 各跑一次；三份原始 reporter 結果保留。
  `bench` 改成僅 core、單 worker；新增四項接線回歸通過，blocking gate 的 workload 與門檻不變。
  Vitest 拒絕重複 worker 參數的真實 CLI 失敗保留；夜間指令改成繼承 script 的 worker 預設。
  修正前新增回歸為一項失敗、三項通過；修正後四項通過，實際夜間同型指令只產生一份 benchmark。
  最新獨立 reference mean 為 10.90 ms，p99 為 93.78 ms，相對誤差範圍（RME）為 ±14.94%。
  共三百六十個 sample，原始 reporter 在 `/tmp/tenka-national-final-single-core-bench.json`。
- Reference reporter JSON 僅保留統計，`samples` 陣列為空；不可稱為逐 tick 原始時間。
  先前單 core mean 10.41 ms 的 reporter 亦保留，不挑選較快者取代最新觀測。
  Blocking gate 的兩次七百二十項原始時間仍完整保留，依既定 retry 通過，不等於穩定 midgame p95 達標。
  最新完整覆蓋率快照早於新增的四項 benchmark 接線測試；四項另行通過，不冒稱新的全套通過數。

- 新增 native benchmark sample reporter，保留既有統計輸出，另寫 `.samples.json`。
  十二項 reporter 與四項接線測試通過；實跑單 core 共三百六十個原生 duration，數量與統計一致。
  最新 mean 為 11.03 ms，p99 為 93.03 ms；此為觀測，不替代 blocking retry gate。
  Tinybench 原生陣列按 duration 排序，不含逐 tick 時序；版本與完整陣列均保留。
  原始檔位於 `/tmp/tenka-national-native-samples-bench.json` 及同前綴 `.samples.json`。
- 新增獨立 headless 冷載入 harness，僅單 worker，五次皆建立新 context 並關閉快取與 service worker。
  使用 Chromium Fast4G profile，記錄原生 trusted title click，並確認劇本選擇畫面接受操作。
  五次本機 preview 通過，click 分別為 1024.3、932.0、952.3、940.3、932.7 ms，零快取命中。
  三秒嚴格門檻不變；這是本機診斷，不是 GitHub Pages 發版驗收。
  原始證據位於 `/tmp/tenka-national-cold-load-artifacts`；外部 URL 路徑與三項 profile 測試通過。
- 真實 live 行軍 scratch preflight 完成一百二十日，四千八百項 retarget 皆經正式指令流程。
  零拒絕、AI invalid 與 invariant；但每日僅二十五至三十九支 marching，不把 returning 補成四十。
  day120 的桶狹間玩家選擇停止推進，未證明二百五十 tick 或 live FPS。
  `/tmp/tenka-live-march-preflight.*` 保留原始失敗；production 未新增 live hook 或事件略過。

- AI 私有 decision sink 延後複製舊 intent log，公開 sink 與 pending orders 路徑不變。
  四十三項定向測試通過；四百二十日每日 hash 與原始對照完全一致。
  本機 blocking mean 為 9.47／6.75 ms，依既定一次重試通過；七百二十項原始時間保留。
  獨立 native benchmark 為 mean 9.28 ms、p99 86.34 ms、RME ±16.73%，共三百六十項 duration。
  `/tmp/tenka-national-lazy-intent-*` 保留證據；觀測值不替代 midgame p95 或長年 golden。
- 新增獨立 midgame p95 harness，候選日期為 1565-01-01，不宣稱此日期已獲規格核定。
  原始 seed、正式 AI 與 invariant 全數保留，準備階段在 day450 的既有 ownership 缺陷停止。
  零項 tick 量測，不能報告 p95；`/tmp/tenka-national-candidate-p95.log` 保留真實失敗。
  十一項 harness 測試通過；既有 mean gate 與嚴格八毫秒門檻不變。
- 改良 live scratch 以正式 friendly retarget 維持四十支 marching，不改資源、道路或實際進度。
  明示桶狹間 choice0 後完成三百七十一日，零拒絕、AI invalid 與 invariant。
  真實 source arrival 造成 paid legs 四十／零交替；七個 army source 地方不冒稱九個。
  `/tmp/tenka-live-march-explicit-choice*` 保留補給與指令證據；此 scratch 不證明原生 UI 或 FPS。
- 新增 live workload、store 生命週期 driver 與唯讀 postrender recorder，原本暫停量測 API 保留。
  recorder 以完整 wall window 計算 FPS，記錄速度、modal、visibility 與 ownership 中斷。
  mounted 計數只含原始四十支 cohort，不讓其他 AI 部隊補足；可見計數不是 GPU pixel 證明。
  整合八十二項定向測試、型別、lint 與 build 通過；後續生命週期修正與實際 GPU 再驗另記。
- 再修正同步 subscriber 換局及舊 afterDay 拋錯的 owner 競態；八十四項整合測試與型別通過。
  最新 build 與 bundle gate 通過，實際 live GPU 三視角測試另行記錄，不先宣稱達標。
  首次 live headless 實跑在 month2 proposal footer 的錯誤 locator 停止，未進入 FPS window。
  overview 準備失敗、其餘兩視角未跑；原始 trace 保留於 `/tmp/tenka-national-live40-frame-artifacts`。
- 修正 proposal footer locator 後，實際 Metal headless 完成 overview 三十秒觀測，但 live 驗收失敗。
  原生桶狹間 choice0 後從 day121 推進至 day150，正式 proposal modal 在二十九日後暫停。
  四十支 cohort 全程 marching、mounted、可見；paid legs 零至四十，controller 無拒絕或失敗。
  完整 wall window 為 116.76 FPS、frame p95 9.9 ms，包含暫停時間，不能當成連續 live 達標。
  resources 前後均為 textures1、terrain2、listeners9；原始 frame 與中斷保留於 retry artifact。
  `/tmp/tenka-national-live40-frame-retry-artifacts` 保留真實失敗，其餘兩視角未跑，未抑制 mandatory modal。
- 三十 wall 分鐘 headless soak harness 首次實跑約八十七秒後因已知 proposal dialog 分類競態停止。
  原始 screenshot 與 log 保留於 `/tmp/tenka-national-soak-artifacts`；不宣稱三十分鐘驗收通過。
  harness 改成有界重辨識已知 dialog，未知穩定 dialog 仍失敗；未抑制正式 modal 或核心暫停。
- 修正 dialog 分類競態後，普通新局原生 ×5 soak 在第三 wall 分鐘的 invariant 檢查失敗。
  minute1 day191、minute2 day390 均無違例；minute3 day570 共三十八項 INV-02／INV-22。
  已滅亡齋藤家仍擁有四城與十五郡，原生 AI 的先前城池轉移未隱藏；不宣稱三十分鐘通過。
  `/tmp/tenka-national-soak-racefix-artifacts` 保留逐分鐘、decision、terminal 與 heap 觀測證據。
  此結果再現無親族繼承人的 territory policy 缺口，不將地分給未經核定的受領者。
  共觀察到兩次 castle owner 變更，但零 NPC battle.started 證據，不能將 ownership 變更當成戰爭證明。
- 修正 rail 家紋按鈕，依規格以原生 click、Enter、Space 聚焦真實自有本城。
  共四十一項 MainScreen 測試通過，保留既有圖像尺寸與字串，不改 frozen PNG 或容差。
  原生 headless click、Enter、Space 另實跑通過一項，完整 core、RNG 與 command log 相同。
  原始 browser 證據位於 `/tmp/tenka-crest-home-native-artifacts`，不宣稱 camera 座標或私有 queue 快照。
  三視角 frozen 差異仍包含規格要求的家紋與持續報告入口；原始失敗未隱藏。
- 完整 coverage 與普通 software headless 同時重跑，後者在既定五分鐘內未完成。
  原始 browser 結果為二十七項通過、兩項失敗、五項略過、六十九項未跑，另有兩項全局 timeout error。
  army auto-return 的 trace 顯示 pause click 約 2.75 秒，使 day1 推進至 day5，不是已證實的產品缺陷。
  SwiftShader GPU process 實際佔用數個 CPU core；原始失敗保留，再以隔離 Metal headless 確認。
  `/tmp/tenka-live-final-headless.log` 記錄不完整執行，未放寬 timeout、fixture 或指令驗收。
- 最新完整 coverage 重跑為 3558 passed、2 failed、1 skipped，共三百二十六檔，耗時 421.67 秒。
  core 行覆蓋率 93.50%、分支 89.65%；失敗仍為 B6 day293 與全國 day450 的無繼承人 ownership。
  `/tmp/tenka-live-final-coverage.log` 與同前綴 coverage 目錄保留全部結果，未排除失敗或更換 seed。
  普通 software browser 的不完整執行另存，Metal headless 全套再驗另行記錄，不混合通過數。
- 第一次隔離 Metal headless 中，army auto-return 與 army-orders 兩項均原樣通過。
  layout 六視角共用舊 hidden div selector，與正式家紋改成 native button 的語意不相容。
  保留四十一通過、兩失敗、兩中斷、五略過、五十三未跑的中斷結果，不當成全套通過。
  只將 locator 改為真實 rail-home，增加 button 與 accessible name 檢查，原尺寸與全部 invariant 不變。
  `/tmp/tenka-live-final-metal-headless.log` 保留原始失敗；修正後完整重跑另存 confirmed 前綴。
- 最新完整 Metal headless 為 89 passed、1 failed、13 skipped，共一百零三項，耗時 2.7 分鐘。
  六個原生 scale／viewport layout 與兩個正常 army queue case 均通過，唯一失敗仍為三視角 frozen PNG。
  十三項略過為五 cold-load、三 paused renderer、三 live renderer、一 soak 與一合成效能 case。
  各獨立實跑結果保留，尤其 live 與 soak 真實失敗不以普通 suite 略過掩蓋。
  `/tmp/tenka-live-final-metal-confirmed.log` 與同前綴 artifact 是新的完整 browser 快照，未混合先前中斷結果。
- 收尾一般／core 型別與完整 ESLint／Prettier 均通過，兩份 prose checker 零違例。
  六份 frozen SHA256 再驗相同，00 文件無 diff，沒有 staged 檔案或遠端發版動作。
  `/tmp/tenka-live-handoff-types.log` 與 `/tmp/tenka-live-handoff-lint.log` 保留最新靜態檢查結果。

- 新增唯讀 BAL 主表 checker，以 TypeScript AST 解析閉合常數，不執行來源或修改平衡值。
  三十項故障注入測試通過，禁止重複 key、錯誤表頭、不完整結構與非法數字分組。
  主表實有五百四十六列，標題仍寫五百四十二；BAL 共五百九十四個 key，五百一十四項共名值相符。
  原始差集為八十個 orphan 與三十二個缺席名稱，十一項有來源支持的排除，不當成缺少機制。
  四個非模擬層 key 明示禁止進 BAL；未解問題共一百零三項，CLI 正確退出一，不宣稱 M9-1 通過。
  `/tmp/tenka-parallel-balance-audit.json` 保留完整結果；未改 BAL、主表、package 或 CI。
- 新增 heap snapshot retained-object analyzer，七項測試與前述 checker 合計三十七項另行通過。
  同一 V8 isolate 的前後配對以原始 ID 查找全部 after node，不只比對仍有完整 shape 的物件。
  十月八日兩份舊配對中，原 renderer 與 Pixi Application ID 均已消失；只剩當前 debug owner。
  較早配對的 canvas 增長由 shared font cache 持有，較晚配對的 atlas／Canvas2D 候選數為七／十三且穩定。
  這些是舊來源觀測，不是當前全國 renderer 或整體 heap 穩態的驗收，fresh headless 再驗另記。
  `/tmp/tenka-heap-retainers-final-pair.json` 與 older-pair 保留最短非 weak 路徑，不冒稱 dominator 或 retained size。

- 城池軍事頁的 player army 列改為原生 button，click、Enter、Space 可選到正式部隊控制。
  被捕獲的出發城仍提供自有部隊入口，但不顯示敵方軍事 meters、出陣或軍官內容。
  即時檢查 game／army identity、所有權、出發城、modal 與 viewport，拒絕舊 callback 與同 ID 替換。
  使用共用 map projection 與 reversing physical point 聚焦鏡頭，同步 session／UI selection，core／RNG／queue 不變。
  原生 seed42 正式建立兩千人 march 後暫停，Enter／Space 選取均保留完整 core、RNG 與 command log。
  四項隔離 headless case 通過，證據位於 `/tmp/tenka-parallel-army-native-artifacts`；後續焦點修正另再驗。
- 平行 review 找出並修正兩項焦點缺口，選取後移至可用 retarget，否則移至具名 army context。
  captured source 的最後部隊消失或所有權改變時，停用中的 tab 同步切回 overview，保留 enabled tabindex。
  實際 native Dialog 即使不使用 ui.modal，仍擁有焦點；tab recovery 不搶回焦點或恢復時間。
  最新六十一項 UI 定向測試通過；較早錯用「概況」的 fixture 失敗 log 保留，正確字串為「概要」。
  `/tmp/tenka-parallel-final-ui.log` 與 army-dom-focus 前綴保留測試，E2E 另加入實際 retarget focus 斷言。
- 最新 exact-source 二十 remount headless gate 通過，原 renderer121217 與 Application121219 ID 均已消失。
  graphics94、bitmap38、renderer1、Application1 前後相同，atlas／Canvas2D／bitmap cache 為七／十三／三十八。
  二十一項 post-GC heap 從 12,289,644 增至 13,144,252 bytes，增加 854,608，不能當成整體穩態。
  `/tmp/tenka-parallel-final-heap-pair.json` 與同前綴 artifact 保留全部 ID 查找與原始 snapshots，沒有 byte 容差。
- 前次同來源 heap 的全部 node self-size 增加 832,810 bytes，new／removed／surviving ledger 完整相抵。
  主要 growth family 為 code、strings、arrays；Runtime heap 與 native self-size 不混為同一量測。
  `/tmp/tenka-heap-current-age-diff.json` 與 growth-paths 記錄 instrumentation、shared caches 與當前 renderer 路徑。
  installed Pixi 8.19.0 的文字 layout LRU 上限為一千項，style ID 使 remount 新增 key；未量測 plateau。
  shader source ID cache 沒有 eviction，graphics 與 backbuffer 每次新名字皆留下來源 key，並非只修 graphics 即可。
  尚未升級、回填或修改依賴，完整 upstream 修正的 pinned backport 已另請使用者決定；不清 shared fonts 掩蓋問題。

- 部隊焦點修正前的完整 Metal headless 為九十通過、一失敗、十三略過，耗時 2.8 分鐘，原始 log 保留。
  完成 native Dialog 焦點 guard 後，exact-source 全套再跑仍為九十通過、一失敗、十三略過，共一百零四項。
  耗時 2.9 分鐘，新增 Enter／Space 部隊選取與 retarget focus 均通過，唯一失敗仍為 frozen 三視角。
  `/tmp/tenka-parallel-final-headless.log` 與同前綴 artifact 保留全部結果，不合併前次或隔離 run 的通過數。
- 最終普通 unit 用兩個 worker 與上述功能 browser 平行，再跑為 3610 passed、2 failed、1 skipped。
  共三百二十九檔，耗時 151.77 秒；失敗仍為 B6 day293 與全國 day450 的 no-heir ownership。
  `/tmp/tenka-parallel-final-unit.log` 保留全部失敗，沒有排除 seed、修改斷言或生成替代 golden。
  此次未重新量測 coverage，上一份 core 93.50／89.65 與三百二十六檔 coverage 快照保留，不更新為新覆蓋率。
  定向三十七項 audit 與六十一項 UI 皆通過；一般／core 型別、完整 lint、build、bundle 亦通過。
  frozen 六份 hash 與 00 文件不變，沒有 staged 檔案；shader dependency backport 與領地規則決定仍未獲回覆。

- 依既有規格修正五組公式與指令條件，不更改 BAL 值：集結為兵力或戰力足夠，仍受抵達與超時控制。
  解圍採目標實際圍城軍原始兵數，相關圍城模式也只處理該目標，不計其他城的圍城軍。
  反應層發動合戰先檢查目前合法性及 pending shadow，已失效的可用訊號改記 battle.hold。
  月治安只計交戰中的實際停駐部隊，不計友軍、中立或途中部隊；幕府工作改用獨立友好度上限。
  高治安正向修正減半的奇數取整與城下集住上限公式仍未解，沒有猜測規則。
- `/tmp/tenka-formula-targeted-final.log` 最終八十一項通過；新增 fixture 均檢查指令合法性與狀態不變量。
  原本 muster 三個失敗、security 七個失敗、relief 三個失敗及合戰重複非法意圖的 raw log 均保留。
  獨立 review 確認目標圍城 binding、原始兵力門檻、合戰 shadow 與敵軍實際位置條件。
  型別、完整 lint／format、build、bundle、資料及素材驗證通過；全套 unit 與 headless 結果另記。
  沒有更新 screenshot、golden、BAL、00 文件、staged 檔案或 dependency。

- 最終普通 unit 用兩個 worker 為 3640 passed、4 failed、1 skipped，共三百三十二檔、144.46 秒。
  `/tmp/tenka-formula-full-unit.log` 保留 B6 day293、全國 day450 的 ownership 違例，另外兩項是改變的 AI 軌跡。
  AI mini golden 未更新；`/tmp/tenka-formula-ai-golden-diff.json` 的三次實跑確認 repeat 與 midpoint reload 完全相同。
  BAL hash 不變，但首個 day30 checkpoint 已改變，march 八次增至十二次，plan.advance 三次增至六次。
  固定七地方 185 日 Yuki 滅亡斷言也失敗；原生 production catalog 診斷仍有 Yuki 領地且零不變量違例。
  `/tmp/tenka-formula-yuki-185-evidence.json` 保留該終態；沒有延長窗口、換 seed、削弱斷言或更新 golden。
- 初次完整 headless 為八十九通過、二失敗、十三略過，共一百零四項、2.8 分鐘。
  `/tmp/tenka-formula-final-headless.log` 的新失敗是 helper 將檢查間剛出現的具申視為未知 dialog，另項仍為 frozen 三視角。
  修正 `production-events.spec.ts` 最後一次 owner 判定為 atomic DOM snapshot，已知 owner 仍由原生控制處理。
  真正未知 dialog 仍失敗，目標事件、seed、日期窗口、timeout 及歷史事件選擇保護均不變。
  `/tmp/tenka-production-events-owner-race.log` 三次 Metal headless 均通過，耗時 20.9／20.7／20.4 秒。
  初次全套 log 與 artifact 保留；完整套件重新驗證後另記，隔離三次不加進全套通過數。

- Owner helper 修正後，完整 Metal headless 為九十通過、一失敗、十三略過，一百零四項、2.8 分鐘。
  `/tmp/tenka-formula-handoff-headless.log` 與同前綴 artifact 保留全部結果；唯一失敗仍為 frozen 三視角。
  沒有將隔離三次 event run 合併入全套通過數，略過仍需獨立原有 gate 驗收。
  CPU／GPU 普通測試結束後，序列跑 `/tmp/tenka-formula-final-mean-gate.log` 的全國每日 tick 原始 gate。
  第一嘗試 9.738531367 ms、唯一重試 6.803853472 ms；每次六十日 warmup、三百六十日量測，原始七百二十 samples 保留。
  未改原本八毫秒限值、CI 倍率或重試數；只證明本機平均門檻，不替代 midgame p95 或二十五年驗收。
- 最終型別與完整 lint／format 通過；prose checker 零違規，BAL 與 frozen 六份 hash 皆不變。
  本次未重新量測 coverage；保留先前 93.50／89.65 快照，不以新的 unit 數字替換 coverage 結果。
  00 文件未改、沒有 staged 檔案；全部 release checklist 與 M6 marker 保持原狀，遊戲仍未完成。

- 四個非模擬設定移出 BAL：合戰間隔八百毫秒、DPR 上限二、報告每頁五十項改由 UI 持有。
  診斷預算四毫秒改由 PERFCFG 持有，但目前沒有 production consumer，不宣稱完成預算顯示。
  合戰 renderer 的 init 與 resize 現在均套用 DPR 上限；邏輯座標、命中位置與 RNG 不變。
  `/tmp/tenka-operational-bal-final.log` 的定義語法掃描由二十九降至零，包含 alias 與負向 probes。
  動態 key 與任意跨函式資料流不在 checker 範圍，型別檢查與獨立 review 另補證據。
- 商業上限統一使用 commerceMaxAbs 二千；schema、INV-16 與 save decode 拒絕越界或非整數 cap。
  Runtime commerce 仍可有小數，合法小數狀態的 native codec 與十日 continuation 完全相同。
  Commerce 整合九十六項、UI 二十六項、renderer 八項與 boundary／audit 三十二項定向測試通過。
  `/tmp/tenka-operational-balance-audit.json` 記錄五百八十一項精確值比較、零值差異及三十一項未解問題。
  M9-1 仍失敗，未盲目補登 legacy AI、施設別名或 feature flag。
- BAL hash 由 7634217400759e66 改為 968e208491dd26e6，沒有 projection、硬編碼或 compatibility shim。
  `/tmp/tenka-operational-gameplay-parity.json` 確認三百六十日 mini 軌跡與前次相同，repeat／reload 也完全相同。
  共享 gameplay 值皆不變；此證據不涵蓋所有 seed、全國長跑或二十五年驗收。
  Native SaveFile 不儲存 BAL hash，沒有修改存檔格式；舊 replay metadata 仍如實回報 balanceMismatch。
  Golden、replay fixture 與 screenshot baseline 未更新，所有新增 metadata 失敗均保留。
- `/tmp/tenka-operational-full-unit.log` 為 3660 passed、11 failed、1 skipped，三百三十五檔、140.15 秒。
  六項只涉及 BAL metadata，mini golden 另在 BAL guard 停止，不能據此判定其後續軌跡。
  其餘為 AI golden 軌跡差異、固定 Yuki 滅亡斷言與兩項 no-heir ownership，沒有排除失敗。
  `/tmp/tenka-operational-headless.log` 為九十通過、一失敗、十三略過，一百零四項、2.8 分鐘。
  唯一失敗仍為 frozen 三視角，六份圖片 hash 與容差不變；全程 headless，沒有新視窗。
- 型別、完整 lint／format、build、資料、bundle 與素材驗證通過；本次未重新量測 coverage。
  `/tmp/tenka-operational-mean-gate.log` 首次 10.079894214 ms，唯一重試 6.905810764 ms，原始七百二十 samples 保留。
  仍使用八毫秒門檻，只證明本機平均 gate；沒有替代 midgame p95、soak 或全遊戲驗收。
  00 文件、release checklist 與 M6 marker 不變，沒有 stage、commit、push、部署或依賴修改。

- 城下施設常數依 15 E-39 改為 mainCastleSlots 六與 branchCastleSlots 三，未保留 BAL 別名。
  Command、完工後 queue、城池 UI 與劇本 validator 共五檔十處 token 全數遷移，AST fault probes 仍通過。
  `/tmp/tenka-facility-name-final-check.log` 記錄十至零；core 定向五十二項與 UI 二十五項通過。
  實際第六／第三 slot、超額拒絕與完工後邊界皆有測試；移除必要政策的 queue 正常取消並退款。
  型別檢查找到測試 catalog entry 可能 undefined，補上已驗證存在 entry 的明確 assertion，未改邊界斷言。
- 補上 dev 每三十個完成 tick 的不變量 hook；依較高優先序 02 §5.2／§5.7，正式 build 不跑。
  URL debug 不啟用正式 build 的檢查，cadence 採持久 meta.stateVersion，不隨 app session 重置。
  指令與效能紀錄先保留；due tick 的 event notices 延後，健康檢查後才發布，失敗或換局即丟棄。
  違例走既有 typed fatal owner，不回滾 core；月結、tickSeq、autosave 與 observer 不發布錯誤狀態。
  `/tmp/tenka-dev-invariants-before.log` 保存真正 RED；最終三檔五十三項 PASS 包含十五項新回歸。
  外部 listener 與 driver dispose 的真實換局測試保護新 session 的 log、telemetry、notice 與 fatal owner。
- 首次廣驗證揭露共用 loop fixture 的 clan leader 不存在，dev day30 正常回報 INV-08。
  僅補上合法成年 serving leader off.test；fixture 建立不抽 RNG，不改 product 或診斷 gate。
  `/tmp/tenka-loop-fixture-focused.log` 四十九項通過，debug 與 DebugPanel 原有三百六十日斷言完全保留。
  新增兩項 fixture 檢查使用真正 validateState 與三十次 advanceDay；不 mock 或過濾違例。
  完整 unit 首跑 raw log 保留，修正後的全套結果另記，不合併定向通過數。
- `/tmp/tenka-facility-dev-audit.json` 記錄五百八十四項精確比值、零差異、八 orphan、二十八 missing 與二十六問題。
  BAL hash 為 d6498cebd1d29580，主表仍六百一十二列，M9-1 尚未通過。
  `/tmp/tenka-facility-dev-parity.json` 確認預期 BAL 精確相符、三百六十日 AI repeat／reload 與前次軌跡相同。
  七百二十日 mini repeat 完全相同，忽略單獨比較的 BAL metadata 後也與 frozen 軌跡相符。
  這些證據不取代全國長跑、heap 穩態或全部 gate；未改 golden、replay fixture、PNG 或 hash 契約。

- `/tmp/tenka-facility-dev-full-unit.log` 首次為 3675 passed、16 failed、1 skipped，三百三十八檔、162.01 秒。
  新增五個失敗均為缺少 leader 的共用 fixture，全部 raw 診斷保留，沒有關閉 dev 不變量檢查。
  Fixture 修正後全套 `/tmp/tenka-facility-dev-handoff-unit.log` 為 3682 passed、11 failed、1 skipped。
  共三百三十九檔、130.53 秒；原有兩項 ownership、AI golden 軌跡及 Yuki witness 失敗仍保留。
  七項 BAL metadata 失敗未重錄 baseline；獨立 mini 七百二十日比較已證明軌跡相符，不宣稱 suite 通過。
- `/tmp/tenka-facility-dev-headless.log` 完整 Metal browser 為九十通過、一失敗、十三略過，一百零四項、2.9 分鐘。
  唯一失敗仍為 frozen 三視角；全程 headless，全部六份圖片 hash 與 maxDiffPixels 一百不變。
  型別、完整 lint／format、build、資料、bundle、素材與兩組 prose checker 通過，本次未重測 coverage。
  CPU／GPU 測試皆結束後，`/tmp/tenka-facility-dev-mean-gate.log` 原始 gate 首次 9.868328936 ms、重試 6.914386689 ms。
  每次六十日 warmup 與三百六十 measured samples，全部七百二十值保留；限值八毫秒與唯一重試不變。
  此證據只證明本機平均門檻；全遊戲、midgame p95、二十五年與 heap 穩態尚未完成。
- 00 文件、release checklist、M6 marker、golden、replay fixture、PNG 與 dependency 保持原狀。
  沒有 staged 檔案、commit、push、PR、workflow dispatch 或部署；遊戲仍未完成，後續工作保持原範圍。

## 高治安修正與 M9 觀測判定

- 高治安只折半正向合計，負向懲罰維持原值；最後依 02 §3.4 取整再寫入。
  兵農分離先取消高徵兵懲罰；一揆凍結、恢復與 RNG 分支不變。
  `/tmp/tenka-security-damping-final.log` 三十四項通過；新增八項測試涵蓋混合懲罰、真實圍城及存讀檔。
  型別廣驗證另找到三個測試 literal 缺少 FacilityTypeId 品牌；僅補測試型別，重跑八項及完整型別通過。
- `/tmp/tenka-security-trajectory.json` 記錄 BAL hash 仍為 d6498cebd1d29580。
  三百六十日 AI repeat／native reload 完全相同；七百二十日 mini repeat 也完全相同。
  AI checkpoint 首次差異出現在 day150；指令、事件及 intent 相同，mini frozen 軌跡亦有真實差異。
  舊的「軌跡不變」scratch checker exit1 原始結果保留；未重錄 golden、replay fixture 或 screenshot baseline。
- 依既有 15 E56／16 D12，五千萬 bytes 匯入上限移至操作性表 D，不新增 gate 排除。
  主表六百一十一列、五百八十四項精確值、零差異、八 orphan、二十七 missing、二十五問題；M9-1 仍失敗。
  真實 UTF-8 File 的五千萬 bytes 可讀取並解碼；超一 byte 在讀取前拒絕。
  `/tmp/tenka-save-import-byte-boundary.log` 五項通過；此 Node 邊界證據不替代 browser heap 或 storage 驗收。
- 新增 18 §5.4 的純統計判定器；二十個不同種子、完整二十五年及既有門檻保持原值。
  從 runs 重算，不信任彙總；缺 checkpoint、短跑與不一致的存活資料不得通過。
  1570 滅亡先後無日資料，允許任一十年觀測；一般 CLI 的長於二十五年報告仍可彙總十年存活率。
  真實 seed42／0.1 年 CLI 正常輸出 `incomplete`；explicit /tmp output 保持原 simulate-report SHA256 不變。
  此結果不證明二十五年驗收、15 §5.6、指令合法性或隔離效能通過。
- Build、data、assets、bundle、完整 lint 與最終 typecheck 通過；全套 coverage 與 browser 再驗結果見下段。
  全程 headless，沒有新視窗；未改 00、release checklist、M6 marker、依賴或 frozen 基準。
  無繼承人領地歸屬仍待裁決，不自行指定接收勢力；沒有 stage、commit、push 或部署。

- `/tmp/tenka-security-save-final-focused.log` 六檔八十五項通過，包含三十項判定器測試。
  獨立 review 找到並修正「先滅亡後統一」的錯誤通過；同年先後無日資料，仍允許兩種順序。
  `/tmp/tenka-security-save-final-audit.json` 保留二十五問題，沒有把 calculator 的通過當成平衡門檻通過。
- `/tmp/tenka-security-save-headless.log` 九十通過、一失敗、十三略過，耗時 2.9 分鐘。
  三視角 frozen 差異為 20200／20156／16650 pixels；限值一百、threshold 0.15 與全部六份基準 hash 不變。
  三張 actual PNG 與上一輪 facility-dev 的 raw RGBA、encoded SHA256 皆完全相同。
  上輪原始 log 也是這三個計數；較舊摘要的 19410／19366／15648 不適用本次與上一輪比較。
- `/tmp/tenka-security-save-coverage.log` 為 3720 passed、12 failed、1 skipped，三百四十二檔、205.81 秒。
  十二項包含尚在修改中的 winner chronology RED；最終 focused 已通過，另以凍結 source 重跑完整 unit。
  Core coverage 行 93.63%、分支 89.78%、函式 96.19%；超過門檻不代表完整 suite 通過。
  原始十二項失敗與 coverage JSON 保留，不減去已修正項目後宣稱全套通過。
- 凍結 source 後 `/tmp/tenka-security-save-final-unit.log` 為 3721 passed、11 failed、1 skipped。
  三百四十二檔、131.15 秒；三十項判定器通過，原有 ownership、AI golden、滅亡 witness 與 metadata 失敗保留。
  全部 CPU／GPU 工作結束後，隔離平均 gate 首次 9.634317014 ms、唯一重試 7.269416433 ms，八毫秒門檻通過。
  `/tmp/tenka-security-save-mean-gate.log` 保留兩次各三百六十項 raw samples；不替代 midgame p95 或二十五年。
- 下一項可依既有規格修正的落差為兵力容量取整順序：02 §5.1／05 §3.5 要求先取人口項的 floor，再乘政策。
  現行 selector 先乘政策才 floor；單改 selector 會引入分數兵力寫入，尚未實作。
  後續需保留派生容量公式，依 02 §3.4 在徵兵、輸送、事件與大命等整數兵力寫入處取整。
  全域取整 selector 未獲上述規格要求，不自行改動容量驗證、超額耗糧或 UI 的派生語義。

## 城兵力容量公式與整數消費端

- 依 02 §5.1／05 §3.5，城容量改為人口換算項先 floor，再乘政策；城格與兵舍加值不乘政策。
  派生容量保留小數，不全域取整 selector；既有超額耗糧與留駐容量驗證不改。
  `/tmp/tenka-capacity-formula-red.log` 五失敗、一通過；公式修正後含既有 domestic 的二十一項通過。
  六項新測試涵蓋本支城、兵舍、占領郡、純函式不變性及分數容量的超額耗糧。
- 徵兵回報實際整數增量，輸送在入庫時對最終駐軍取整，不改原始 cargo payload 或移動規則。
  `/tmp/tenka-capacity-conscription-transport-red.log` 四失敗、二通過；最終五十五項通過，包含八項新回歸。
  實際合法 cargo、移動、native codec、RNG 與不變量涵蓋小數 .2／.5／.9 及既有超額駐軍。
- 大命扣除與增兵同量的整數人口，不在人口降低後再刪除駐軍；事件在既有 amount-round／clamp 後取整。
  AI 留駐取可合法存入的整數下界；debug 只在 detached clone 寫入整數駐軍。
  corrected RED 五失敗、三通過；含既有 compatibility 的五十五項與最後八項新回歸通過。
  初版 AI fixture 的友城自動返城與 debug builder 缺少 difficulty 並非產品回歸，原始失敗 log 保留。
  初次 typecheck 的 nonexistent facilitySlots 只在新測試中移除，不新增 state 欄位或放寬 schema。
- `/tmp/tenka-capacity-write-check.mjs` 的 AST checker 定位七處，依 batch 降至六、四、零。
  每個原始錯誤的 in-memory fault probe 均會被抓到；排除範圍與唯讀消費端明列，不以 graph 缺邊證明完整。
  `/tmp/tenka-capacity-focused.log` 十二檔、一百七十八項通過，包含三組二十二項新回歸。
  獨立 source review 未找到具體缺陷；build、data、assets、bundle 與完整 typecheck 通過。
  所有 source 凍結後才開始完整 coverage 與 headless，再驗結果另記。
- Current source 另核對兩項較舊筆記：集結已使用兵力足夠或戰力足夠，解圍退卻已使用目標圍城的原始兵數。
  `aiAttackPlan` 與 `aiSiegeRelief` 的既有 focused 回歸本輪也通過；此處只有確認，不宣稱本輪修改這兩條規則。
  BAL、主表六百一十一列、00、存檔欄位、release checklist 與 M6 marker 不變；未更換 frozen 基準。
  無繼承人領地歸屬、長跑、heap、視覺與正式發版仍未完成；沒有 stage、commit、push 或部署。
- `/tmp/tenka-capacity-trajectory.json` 的 BAL hash 仍為 d6498cebd1d29580；AI repeat／native reload 與 mini repeat 精確相同。
  三百六十日 AI 與七百二十日 mini 都與前一輪 security 實跑相同，指令、事件及 intent 計數也相同。
  此有限 workload 的同軌跡不替代全 seed 或全國長期驗收；security 與 frozen 的既有差異仍保留。
- `/tmp/tenka-capacity-headless.log` 九十通過、一失敗、十三略過，耗時 2.8 分鐘。
  三視角與 frozen 差異為 20200／20156／16650 pixels；容差與六份基準 hash 不變。
  三份 actual PNG 與前次 security 的 raw RGBA 完全相同，沒有新增 screenshot 回歸。
  全程 headless，GPU 工作結束後，效能測試另等全部 CPU 工作結束才執行。
- M9 audit 的二十五問題不變；缺席名稱不全代表缺少 runtime 機制，不建立無消費端的常數掩蓋問題。
  唯讀再核對指出 02 已明示廢除 grid 尺寸，並以 kassenMaxTicks 一百二十取代舊 rounds 六十。
  defaultDeathAge fallback 在必填 deathYear schema 下不可達；其餘舊驗收數值仍需與主規則核對。
  這些後續發現尚未改主表或新增排除，不宣稱 M9-1 通過。
- `/tmp/tenka-capacity-coverage.log` 為 3743 passed、11 failed、1 skipped，三百四十五檔、199.58 秒。
  Source 自啟動至完成都保持凍結；二十二項新測試通過，原 ownership、AI golden、滅亡 witness 與 metadata 失敗保留。
  Core 行覆蓋率 93.64%、分支 89.78%、函式 96.19%，不以 coverage 達標宣稱全遊戲完成。
  `/tmp/tenka-capacity-mean-gate.log` 首次 9.652071067 ms、唯一重試 6.834241436 ms，限值八毫秒不變。
  全部七百二十 measured samples 保留；此為隔離本機平均 gate，不替代 midgame p95、soak 或二十五年。
- 後續可退休已被正式 M7 取代的 internal `systems/ai/daimyo.ts` 與七個唯一由它消費的 legacy BAL key。
  其唯一 current caller 為 legacy 測試；Step11 走正式 runAiSystems，public core barrel 沒有匯出舊模組。
  Dirty 測試中的兩項 M7 四階段 integration 必須原樣保留；本輪尚未刪除模組、測試或常數。
  這是已驗證的後續清理範圍，不新增 BAL 排除，也不保證 repository 外的 deep import 不存在。

## 舊 MVP AI 退役與完整再驗（2026-10-09）

- 刪除內部未接線的 ai/daimyo.ts 與七項僅測舊實作的測試；tracked 原件可由 Git 取回。
  Dirty 測試中的兩項 M7 integration 與 helper 原樣移至 aiCouncilTickIntegration.spec.ts。
  正式 Step 11 仍使用 runAiSystems；scheduler 僅修正過期註解，未改評定容量或 runtime 決策。
- verified-refactor checker 初始二十七項，最終零項；保留測試與 helper 的 SHA256 完全相同。
  七個無消費端 BAL key 移除，不補主表列、別名或排除，也不保證 repository 外無 deep import。
  BAL hash 真實由 d6498cebd1d29580 改為 ffcddcf109acd701，未回寫任何 frozen 基準。
- `/tmp/tenka-legacy-ai-focused.log` 四十八項、audit 定向三十一項通過。
  完整型別、lint／format、build、資料、資產與 bundle 檢查通過。
  主表六百一十一列、實作五百八十五項、精確比較五百八十四項，值差異零。
  sole orphan 為 featureKassenEnabled；缺席二十七、明示排除十一、問題十八，稽核仍未通過。
- `/tmp/tenka-legacy-ai-coverage.log` 為 3736 passed、11 failed、1 skipped，三百四十五檔、199.16 秒。
  失敗仍為兩項 ownership、AI golden、固定滅亡斷言與七項 metadata；未新增失敗類別。
  Core 行 93.61%、分支 89.85%、函式 96.17%，不以覆蓋率宣稱完整驗收通過。
- 完整 Metal headless 為九十通過、一失敗、十三略過，2.8 分鐘；未開新視窗。
  三份 actual 與前輪容量修正逐 pixel 相同；frozen 差異仍為 20200／20156／16650。
  六份 baseline PNG manifest SHA256 維持 d6ae26b0513ed839ecdbbf44336f295f40b1eea551660d5f94bd162ab77efc6d。
- 三百六十日 AI 的 repeat／native reload、七百二十日 mini repeat 精確相同。
  兩條有限 gameplay 軌跡與前輪相同，另列真實 hash 改變；此比較不代表全部種子或二十五年驗收。
  證據為 `/tmp/tenka-legacy-ai-trajectory.json`，未投影 product hash 或改存檔相容性契約。
- 隔離 mean gate 首次 9.63485405 ms、唯一重試 6.952046875 ms，依原八毫秒門檻通過。
  `/tmp/tenka-legacy-ai-mean-gate.log` 保留兩輪全部七百二十項 measured samples。
  M6、checklist、00 文件與 staged 狀態不變；未 commit、push、部署或宣稱遊戲完成。

## 合戰就緒旗標退役與玩家提示邊界（2026-10-09）

- 退役固定為 true 的 featureKassenEnabled，不把旗標轉移至其他設定物件。
  三個舊方格與回合主表列依 02 E-18／DDR-12／E-19 補註廢除；保留歷史值與全部六百一十一列。
  稽核 parser 不變，三項實際規格 fault probe 驗證重新加入 key 必須失敗，移除廢除註記也必須失敗。
  retirement checker 初始九項，分批九至三至零；identifier／computed reference 探針仍能抓到舊旗標。
- 新邊界測試首次為 152 passed、1 failed；加入 AI-only producer 見證後為 113 passed、2 failed。
  RED 揭露既有 AI 對 AI 事件能產生玩家合戰提示與暫停，不是單純移除常數的 metadata 差異。
  依 07 §3.5，producer 限玩家為交戰一方，reports 對非玩家事件防禦性回傳無暫停理由。
  AI-only 測試使用合法三勢力、兩筆合法出陣與前後不變量；保留 battle.started、交戰狀態及實際自動傷害。
- 2999／3000 兵數邊界、玩家提示與非玩家事件測試通過；原有戰鬥驗證與 app 暫停設定不變。
  `/tmp/tenka-kassen-player-green.log` 六檔共一百五十四項通過；audit 另三十四項通過。
  完整一般與 core 型別、ESLint／Prettier 通過；source、測試及相關規格 SHA 在完整測試後仍相同。
- 實際稽核為實作與精確比較各五百八十四項、零 orphan、二十七缺席、十四排除、十四問題。
  `/tmp/tenka-kassen-retirement-audit.json` 仍 passed=false；不以 zero orphan 宣稱 M9-1 完成。
  BAL hash 真實由 ffcddcf109acd701 改為 a5d1a6bebf695963；玩家提示修正本身不再改 BAL。
- `/tmp/tenka-kassen-player-coverage.log` 為 3743 passed、11 failed、1 skipped，三百四十五檔、198.89 秒。
  失敗仍為兩項 ownership、AI golden、固定滅亡斷言與七項 metadata，未更新 fixture 或 frozen 基準。
  Core 行 93.61%、分支 89.88%、函式 96.17%；覆蓋率不代表完整 suite 通過。
- 移除旗標後的三百六十日 AI 與七百二十日 mini gameplay 與前輪相同，另列真實 BAL hash 改變。
  玩家提示修正後同樣本也相同，repeat／native reload 精確相同；不擴大為所有事件軌跡都不變。
  兩份實跑為 `/tmp/tenka-kassen-retirement-trajectory.json` 與 `/tmp/tenka-kassen-player-boundary-trajectory.json`。
- 先完成的 pre-fix browser 為九十通過、一失敗、十三略過，只驗證修正前的 dist。
  重新 build 後完整 Metal headless 為八十九通過、二失敗、十三略過，3.3 分鐘；未開新視窗。
  失敗為 frozen 三視角差異與 reduced-motion 開局逾時；完整失敗保留，不由局部重跑替代。
  trace 顯示策略 DOM 已存在、斷言開始約半秒後 pageClosed，未執行動效斷言；根因尚未證明。
- 原 reduced-motion 測試不修改，獨立單 worker Metal 重跑一次通過，2.4 秒；不覆蓋完整失敗。
  三份 actual PNG 與前輪 legacy AI 執行逐 pixel 相同，六份 baseline SHA256 不變。
  最終 build、資料、資產與 bundle 均通過；pre-fix、完整 final 與 isolated log 分別保留。
- 所有測試 CPU／GPU 結束後，原 mean gate 首次 9.778876041666667 ms、唯一重試 6.92435845 ms。
  依原八毫秒門檻通過，兩輪全部七百二十項 measured samples 保留於 `/tmp/tenka-kassen-player-mean-gate.log`。
  未增加重試、改限值或以平均門檻代替 midgame p95 與二十五年驗收。
- 下一輪可依 02／07 對齊舊 UI 副將與采配別名，需補真實上限邊界測試及記錄裁決。
  17 的五個舊驗收常數未找到整組廢除權威，可能包含缺少的玩法，不盲目補註排除。
  無繼承人領地、施設加成、撤退規則與威風座標等未決事項仍保留；M6 與 acceptance checklist 不變。
  未 commit、push、更新 baseline 或部署，整個遊戲尚未完成。

## 副將與采配 UI 別名對齊（2026-10-09）

- 依 02 §4.8／§5.7／INV-06，11 的副將槽位與草稿註解改用 maxDeputies＝2。
  依 02 §4.9、07 §3.7／§5.8 與 15 現行列，合戰采配改用 saihaiMax＝20。
  示意 HUD 改十二／二十，戰法成本採 07 現行表；不存在的罠改示牽制，不新增戰法。
  主表舊 UI 別名保留歷史二／一百值並補註廢除，全部六百一十一列與 parser 保持不變。
- verified-refactor checker 初始六項，四個 UI 殘留與兩個主表註記由平行分工修正，最終零項。
  舊 alias／computed reference／一百點 HUD 探針可偵測，canonical 名稱與二十點 HUD 不誤報。
  BAL、相關 runtime 與六份 baseline SHA 不變；bounded graph 回傳過期行號，實際函式由 current source 核對。
- 新增三項合戰邊界測試，以合法出陣與正式戰術入口建立不變量乾淨的實際 BattleState。
  兩側由十九累積至二十並連續三 tick 飽和，二十點存檔 round-trip 合法；兩側二十一點由 INV-13 與 decode 拒絕。
  首輪兩項失敗為新測試誤寫 INV-15，改為既有 INV-13 後通過；原 log 保留，不當作 product RED。
  `/tmp/tenka-ui-capacity-boundaries-focused.log` 五檔五十八項通過，scoped lint／format 通過。
- 兩項實際主表 fault probe 驗證重新加入 alias 必報 excluded-implemented，刪除註記必報 missing。
  Audit 三十六項通過；實際 CLI 仍 failed，實作與比較各五百八十四項、零 orphan、二十七缺席、十六排除、十二問題。
  完整一般與 core 型別、ESLint／Prettier 通過，記錄於 `/tmp/tenka-ui-capacity-{typecheck,lint}.log`。
- `/tmp/tenka-ui-capacity-unit.log` 完整單元為 3748 passed、11 failed、1 skipped，三百四十六檔、130.72 秒。
  十一項失敗類別不變，不更新 fixture、golden 或 replay；本輪不重跑 coverage 與 mean gate。
  最近 coverage 與完整 browser／mean 結果仍為前輪玩家提示修正的實跑，不宣稱本輪重新驗證。
- 現行 dist 的 Metal headless 原生戰術狀態與在外軍令兩項通過，10.7 秒；未開新視窗。
  `/tmp/tenka-ui-capacity-headless.log` 保留輸出，未 build 或更新任何 baseline。
  17 的五個驗收常數未獲整組退休裁決；無繼承人領地規則仍向使用者確認，不推測移轉對象。
  00、M6、驗收 checkbox 與 staged 狀態不變；未 commit、push 或部署，完整遊戲尚未完成。

## 低金錢出陣與通關入口驗證（2026-10-09）

- 三組平行分工完成副將邊界、低金錢出陣及 App 通關測試；瀏覽器維持 headless，不開新視窗。
  副將三項新測試涵蓋合法兩人出陣與 native codec、三人指令拒絕及 INV-06 存檔拒絕。
  五檔 focused 一百二十六項通過，沒有修改共用 fixture 或 runtime 副將上限。
- 真實 AI sink 在金錢 99 時仍派出集結 1400 人及既有計畫的新出陣 2800 人，形成兩項 product RED。
  依 15／17 A4 實作 aiLowGoldThreshold＝100，限制共用攻勢 march 與新計畫建立。
  金錢 100 的合法出陣保留；低金錢已出陣軍勢移動、撤回與防守輸送仍可執行。
  `/tmp/tenka-ai-low-gold-before.log` 保留兩失敗三通過；after log 為五項新測試與三十六項 audit 全通過。
  徵兵方針提高／降低對應 A4 的方式仍待使用者裁決，不宣稱全部赤字驗收完成。
- 新 App 測試從合法 queued march 經真實每日 tick、攻城、最後敵城轉移到統一結局。
  每日 invariants、native ending codec、繼續遊玩不重複結局及返回標題清理均通過。
  新兩項加既有三項 focused 全通過；僅用 synthetic tiny，不能代替全國通關或手動驗收。
  首次 title 失敗是新測試誤以為空遊戲 tick 回傳空陣列，修正為既有 DATA_INTEGRITY 契約；原 log 保留。
- 實際 balance audit 為 611 列，585 項實作／交集／數值比較，零 orphan，26 缺席、16 排除、11 問題。
  CLI 仍失敗，不更新 golden、replay 或六份截圖 baseline。
  BAL hash 由 a5d1a6bebf695963 改為 8e6e448ca577e4a1；不使用 hash 補丁。
- `/tmp/tenka-ai-low-gold-trajectory.json` 的 AI 360 日 repeat 與 day180 native reload 精確相同，每日 INV 通過。
  mini 720 日 repeat 精確相同，全部腳本指令被接受；mini runner 不逐日檢查 INV。
  跨版本 DTO 比較只省略 balanceHash，兩個有限 gameplay 觀測未變；不代表所有低金錢 encounter 不變。
- 完整 coverage 為 3758 passed、11 failed、1 skipped，349 檔、202.64 秒；既有十一失敗類別不變。
  核心行 93.56%、分支 89.91%、函式 96.17%；原始 coverage-final.json 與 HTML 保留，不宣稱完整 suite 通過。
  Metal headless 為 90 passed、1 failed、13 skipped，2.8 分鐘；唯一失敗為既有三視角差異。
  三份 actual 與前輪 RGBA 零差異、六份 baseline hash 不變；reduced-motion 在完整執行通過。
  型別、完整 ESLint／Prettier、build、資料、字形、asset 與 bundle 通過；效能計時於所有 CPU／GPU 工作結束後隔離執行。
- `/tmp/tenka-ai-low-gold-mean-gate.log` 完整保留兩次各 360 個 samples；首輪平均 10.281 ms，唯一重試 6.870 ms。
  本機八毫秒 mean gate 通過；不替代尚未量到 samples 的 midgame p95 或正式 live 手動效能驗收。
  無繼承人領地歸屬仍待裁決；00、驗收 checkbox 與 frozen baseline 不回寫，未 commit、push 或部署。

## 獨立平衡判定與同盟邊界（2026-10-09）

- 前輪為實際進展：低金錢攻勢守門、副將與 App 通關測試已落實，沒有宣稱全遊戲完成。
  本輪仍以三 agent 平行完成 evaluator、獨立 review 及同盟／長跑 witness；未開瀏覽器視窗。
  使用 constraints 與 evidence-vs-inference 區分 15 與 18 的實際門檻，不以短跑或工具綠燈替代長期驗收。
- 新 `tools/ci/balance-acceptance.ts` 只判 15 §5.6，與既有 18 §5.4 evaluator 分離。
  檢查二十個不同種子、實際 requested tick 窗口、完整月初序列、二十年 Oda checkpoint、期末存活中位數。
  收斂使用自開局的年數，中位數門檻十二至二十；未達標種子保留右設限值，不從分母剔除。
  觀測 NaN／Infinity、負值或單月大於兩倍為失敗；缺少資料、checkpoint 或 repeat 為 incomplete。
  新三十六項測試使用明示 synthetic observation reports，不是全國歷史 gameplay 驗證。
- CLI 新增 --verify-repeat=true，以相同 seed／difficulty 的獨立 state 與 event engine 重跑。
  新 summary.balanceAcceptance 與既有 acceptance 分列；repeatRuns 保留第二輪原始觀測，未要求重跑時為 null。
  第二輪不量測時間；CSV equality 只涵蓋寬表石高，不冒稱全部月資料或事件相同。
  新八項 parser／actual CLI 測試通過；短跑的兩種 acceptance 均 incomplete，預存 simulate-report.json 未被覆寫。
  `/tmp/tenka-balance-evaluator-smoke.json` 另保留 seed42／hard／0.1 年兩輪實跑，月資料完全相同；不替代二十種子分布。
- Review 修正新 evaluator 的三項界線：不新增每個種子必在二十年收斂的條件、NaN 與缺少資料分開、
  觀測窗口必須等於 requested tick 數，不接受二十五年要求配二十六年期末。
  使用 producer 的 completed ticks，避免 fractional years 再 ceil 多一日；期末 koku 對齊既有 floor。
  原二十一／三十二項測試綠燈仍保留，不能當作最終修正已測；最終 combined 五檔八十五項通過。
- 同盟三項新測試以真實中央驗證、提案與外交結算驗證信用五十九／六十。
  高 score 仍不能繞過信用門檻；信用六十不保證接受，低 score 拒絕且不扣信用。
  信用六十加完整 score 達標才簽署，成本只扣一次；RNG、不變量與驗證純度通過。
  17 DP2 補明前置與完整 score 的差別；未退休 allianceTrustMin、未新增重複 BAL key 或 parser 例外。
- `/tmp/tenka-balance-evaluator-unit.log` 完整單元 3805 passed、11 failed、1 skipped，352 檔、135.85 秒。
  十一項失敗類別不變；型別、完整 lint／format 通過。沒有更新任何 golden／replay／visual baseline。
  本輪未改 core／App／renderer runtime，未重跑 coverage、Metal browser 或效能；最近結果仍為前輪實跑。
  兩份 runtime／baseline SHA manifest 相同；實際 audit 仍 611 列、585 比值與十一問題，未新增排除規則。
- 真實二十種子、二十五年 normal＋repeat CLI 嘗試在第一個種子 day1590 失敗，退出一。
  `/tmp/tenka-balance-evaluator-national-normal.log` 保留八項 INV-02／INV-22；零項完整 seed run，未產生 JSON／CSV。
  獨立 `/tmp/tenka-saionji-day1590-witness.json` 再現 scheduledDeath＝1564／6、無 eligible kin，
  Saionji 被標記滅亡卻仍擁有 Kurose 與三郡；本輪不是 day450 witness 的同種子重播。
  06 委由 10 決定無繼承人領地，10 僅定義失去全部城的滅亡；自然死亡領地接收者仍待使用者決定。
  00、里程碑與 release checkbox 保持不變，未 commit／push／部署；全遊戲與兩個平衡長跑仍未完成。

## 失敗留存與滅亡軍勢圍城清理（2026-10-09）

- CLI 新增明定 continue-on-error 模式，保留 requestedSeeds 與 failedRuns。
  預設仍遇錯即停；診斷模式必須指定 output，任何失敗都令驗收 incomplete 並退出 1。
  CSV 僅含完整執行；零完整執行的聚合值為 null，不以成功子集宣稱通過。
- 修正前的二十種子 normal 長跑全部失敗，沒有完整執行或成功 repeat。
  Saito 十五例、Saionji 二例、Ashikaga 三例；四個種子另有圍城引用已刪軍勢的 INV13。
  原始結果保留於 `/tmp/tenka-failure-report-national-normal.json`，不是修正後快照。
- 三項回歸測試先實際失敗，再於修正後通過；另兩項 capture／disband 測試通過。
  後兩項是 GREEN coverage，不冒稱修正前 RED。
  共用 detachArmyFromSiege 移至僅依賴型別的模組，原匯出介面不變。
  三個滅亡批次刪除及初始無避難城解散，先解除圍城關聯，再刪軍勢。
  空圍城發出既有 siege.ended 事件，其他圍城保留。
- `/tmp/tenka-extinction-cleanup-check.mjs` 檢查限定四個刪除位置，結果為零違規。
  原三個位置由三降至零；補查初始 disband 位置由一降至零。
  checker 仍以正反例自測；結果不代表所有軍勢刪除位置都經此遷移。
- 真實 seed2／day870 重跑的 INV13 由一降至零。
  三十四項 ownership 違規與修正前完全相同，沒有猜定領地繼承人。
  前後證據分別為 `/tmp/tenka-saito-day870-siege-witness.json` 與 after.json。
- 型別、build、資料、字型、assets 與 bundle 檢查通過。
  BAL、simulate-report 參考檔及六張凍結 PNG 的雜湊不變。
  最新 core 已修改；前輪 coverage 與瀏覽器通過數不能視為本輪結果。
- 本輪 headless 瀏覽器在啟動前遭 sandbox 拒絕監聽 ::1:4173，沒有開視窗。
  `/tmp/tenka-extinction-headless-smoke.log` 保留 listen EPERM；不宣稱瀏覽器通過。
  無繼承人領地處置仍待裁決，全遊戲驗收未完成；沒有更新 golden、提交或發布。
- 本輪完整單元為 3827 passed、14 failed、1 skipped，356 檔、170.71 秒。
  十一項既有失敗不變；另三個資料 CLI 測試遭 tsx IPC socket 的 EPERM 阻擋。
  `/tmp/tenka-stats-tsx-launcher-red.log` 保留原始啟動錯誤；不是產品 CLI 結果失敗。
  三項測試改由 process.execPath／--import tsx 啟動相同入口，保留原斷言與產品 scripts。
  checker 三降至零，相關三十六項測試通過；不宣稱已取得新的完整 suite 通過。
- `/tmp/tenka-extinction-national-normal.json` 保留修正後全部二十個 normal 種子的失敗。
  零完整 primary／repeat，僅 INV02／22，沒有 INV13；JSON 與 stdout 完全相同。
  wide／monthly CSV 只有標頭；兩項驗收仍 incomplete，退出 1，不虛構分布數據。

## 外交信用權威與破約懲罰（2026-10-09）

- 實作 15 主表的 betrayalTrustPenaltyOthers＝20，作用方向為存續第三勢力對破約者。
  信用最低為零；既有感情 −10、直接對象、威信與 pact.broken 事件不變。
  中立劇本取消不指派破約責任；停戰仍不可主動破棄，不新增亂數消耗。
- 新測試的原始 RED 為三失敗四通過；修正後八項新測試與既有外交測試共三十項通過。
  `/tmp/tenka-betrayal-thirdparty-red-final.log` 保留原始失敗。
  `/tmp/tenka-betrayal-thirdparty-dispatch-final.log` 證明真實指令驗證與執行、事件、方向及 INV。
  BAL hash 由 8e6e448ca577e4a1 變為 b9d86bf7a402ac5d，不回寫 frozen baseline。
- 02 §8 D16 明定政務 100 的工作信用為每月 6.0，不能替換為舊 DP1 的固定 3。
  15 D33 與 17 第 27 決策退役舊名稱並更正工作方向；08 記錄第三方信用懲罰。
  實際工作測試核對政務 100 十個月增加 60、政務 73 三個月增加 14.76。
  月費、反向信用、亂數及不變量同時核對；相關五項測試通過，不改既有工作公式。
- `/tmp/tenka-betrayal-credit-balance-audit.json` 為六百一十一列、五百八十六項精確比值。
  零 orphan、二十五個缺席名稱，其中十七項明示排除；九項問題未解，退出 1。
  不新增排除模式或無效別名，不能宣稱 M9-1 通過。
- 平行 audit 確認 vassalPrestigeGap＝500 並非已實作國力比的別名，適用提案方向仍待裁決。
  鐵砲施設加成受高優先序無兵種模型限制；鍛冶加成的出陣快照／原城存續條件仍待裁決。
  正式撤退尚缺結果規則；debug abort 未寫回損失，不能充當玩家撤退。
  原全遊戲目標與驗收範圍不縮減，沒有把以上缺口標記完成。
- 最新完整 coverage 執行為 3839 passed、12 failed、1 skipped，358 檔、223.54 秒。
  行覆蓋 93.57%、分支 89.97%、函式 96.17%；門檻達標不代表 suite 通過。
  十一項既有失敗仍在；新增失敗為 audit 測試仍預期舊登錄數。
  對齊真實五百八十六比值與九問題後，audit 三十六測試通過，仍斷言主表未通過。
  `/tmp/tenka-betrayal-credit-coverage.log` 保留原十二失敗，不以 focused 結果覆寫歷史。
- 三個難易度各二十種子、二十五年診斷均實際結束，退出 1。
  六十個 primary 全部 ownership INV02／22 失敗，零完整 primary／repeat；沒有 INV13。
  `/tmp/tenka-betrayal-difficulty-accounting.json` 核對無遺漏或重複種子。
  easy 的 seed17／18 在 day233 停止，不能套用 normal 的日數；兩項驗收均 incomplete。
- easy seed17 的原始模擬與逐 tick trace 終態雜湊相同，均在 Fukashi 追擊中令 Yoshitatsu 戰死。
  這不是自然死亡、劇本死亡或被俘；幼年 Tatsuoki 不符合成年繼承條件。
  三城十二郡仍屬已滅亡 Saito，產生三十個 ownership 違規。
  既有被俘當主的吸收規則不覆蓋此路徑，不能據此猜定領地受益方。
  證據為 `/tmp/tenka-betrayal-easy17-day233-witness.json` 與 trace.json。
- 最新 build、型別、lint、資料、字型、assets 與 bundle 通過。
  IPv4 預覽伺服器也遭 listen EPERM；沒有可用的本機 headless 入口，不冒稱瀏覽器通過。
  finite AI repeat／原生 reload 與 mini repeat 精確相同；只省略 BAL metadata 的有限 DTO 比較未變。
  `/tmp/tenka-betrayal-credit-trajectory.json` 不代表全國通關或所有破約 encounter 不變。
- 原長跑診斷的 repeatCsvEqual 在零完成樣本時為 true，屬空集合的錯誤證據表達。
  新 RED 一項先失敗，再加入至少一個已驗證樣本對的條件；零樣本改為 null。
  相關六十五測試與型別／lint 通過；原 normal 二十種子 JSON 的 SHA 未改。
  重新判讀保留 incomplete，不把 metric 修正當作補完二十次 repeat。
- 完整單元再驗為 3841 passed、11 failed、1 skipped，358 檔、168.65 秒。
  資料 CLI 與 audit 計數測試已通過；十一項既有 gameplay／frozen 失敗仍在。
  此完整執行先收集三十七項 balance 測試，不冒稱包含後續六項非有限 CSV 案例。
- 非有限 kokudaka 的 JSON 序列化可把 NaN 與 Infinity 同時變為 null，誤報 CSV 相同。
  三個實際 CSV 不同的 RED 案例先失敗，再以 CSV 的字串表示比較單格。
  相同非有限單格仍可 literal-equal，但資源驗證仍 FAIL，不將異常值改成正常值。
  最終七十一項 focused、型別、lint 與獨立 review 通過；未覆寫原長跑結果檔。
- 所有功能測試與 agent CPU 作業結束後，隔離重跑本機 mean tick gate。
  `/tmp/tenka-betrayal-credit-mean-gate.log` 原樣保留兩組各三百六十個 samples。
  首次平均 9.574 ms、唯一重試 7.033 ms；依規則通過 `<8 ms`，不丟棄首輪結果。
  這不是 midgame p95、renderer FPS 或完整通關的證據。
- 最新隔離 midgame p95 gate 仍在 checkpoint 準備的 day450 ownership 違例停止。
  `/tmp/tenka-betrayal-credit-p95-gate.log` 明列 measuredTickCount＝0 與空 samples。
  沒有產生 p95 值，不宣稱效能 gate 通過；沒有增加計時重試。

## 大將離任的圍城結束事件（2026-10-09）

- 前輪已修滅亡軍勢留下的圍城引用；本輪另修普通大將死亡的靜默圍城移除。
  原測試一失敗二通過：最後大將無副將時移除軍勢與圍城，但沒有 siege.ended。
  同勢力另軍留在圍城、合格副將接任兩個控制案例原本通過；沒有改領地繼承規則。
- releaseOfficerAssignments 改回傳 GameEvent[]，刪軍前使用既有 detachArmyFromSiege。
  空圍城回傳一次 fallen=false／newOwnerClanId=null 事件，非空圍城與副將接任不結束。
  十一個 production caller 將事件轉交既有 events／deferred／emit。
  劇本轉移 callback 只略過原本不需要的 officer.recruited，不吞掉其他清理事件。
- `/tmp/tenka-release-events-check.mjs` 先記錄十二違規，平行修改後為零。
  範圍為 helper 回傳型別與十一個 caller，不是所有軍勢刪除路徑。
  正反自測仍能辨認未轉交、noop callback 與錯誤收集器；獨立語意 review 通過。
- 六項 commander 測試含實際自然死亡、劇本 killOfficer 與 makeRonin 轉交，相關二十七測試通過。
  `/tmp/tenka-commander-siege-end-event-red.log` 保留原始 RED。
  `/tmp/tenka-commander-siege-end-propagation-final.log` 保留修正後結果。
- 最新完整單元為 3853 passed、11 failed、1 skipped，359 檔、167.51 秒。
  `/tmp/tenka-release-events-full-unit.log` 包含六項 commander 與四十三項 balance 測試。
  十一項既有 ownership／frozen 失敗仍在，不合併 focused 結果宣稱全部通過。
- AI 三百六十日 repeat／day180 原生 reload 與 mini 七百二十日 repeat 精確相同。
  本次完整有限 DTO 也與前輪相同，不需排除欄位；BAL hash 仍 b9d86bf7a402ac5d。
  `/tmp/tenka-release-events-trajectory.json` 不代表所有死亡 encounter 或全國長跑未變。
- easy seed17 的正式模擬與實際逐 tick 追蹤仍在 day233 停止，終態與事件序列精確相同。
  三十項 ownership 違規不變；該路徑本來在潰走時解除圍城，不是本次新事件案例。
  本輪沒有猜定死亡無繼承人的領地受益方，沒有更新 frozen golden 或六張 PNG。
- 合戰 capture 的先刪軍分支未另加修正：合法參戰收集器排除所有 siegeId 非 null 的軍勢。
  這也排除 relief 中 status=engaged 但仍屬圍城的軍勢，符合 07 §3.5。
  不以不合法參戰狀態製造 RED；此為既有防護，不是另一個已修缺陷。
- 新增合法 relief 中斷的 GREEN guard 測試，確認 engaged 軍勢仍保留 siegeId 且不能參戰合戰。
  另一支合法援軍仍可參戰；集合函式沒有修改 state，前後 INV 通過。
  `/tmp/tenka-tactical-siege-exclusion-focused-final.log` 一項通過；不是 capture 缺陷的 RED。
- 最新完整 coverage 為 3854 passed、11 failed、1 skipped，360 檔、217.52 秒。
  行 93.57%、分支 89.97%、函式 96.17%；實際包含上述 guard 與最後六項非有限 CSV 測試。
  `/tmp/tenka-release-events-coverage.log` 保留十一失敗；沒有把覆蓋率當作遊戲完成證據。
  最新型別、lint、build、資料、assets 與 fresh bundle 檢查通過。
- headless 不使用伺服器的 Metal 模式測試也在 Chromium launch 時以 SIGABRT 結束。
  `/tmp/tenka-headless-route-probe.json` 明列未建立 context／page，沒有 HTTP request 或 listening port。
  仍未測 GL 與 local-file routing，不猜定 SIGABRT 根因或宣稱瀏覽器通過。
- 既有 default headless shell 模式也在建立 page 前停止，MachPort 註冊遭 Permission denied (1100)。
  `/tmp/tenka-headless-default-probe.json` 保留 SIGTRAP 與未執行的 routing／GL／app 檢查。
  兩種模式都沒有開新視窗；沒有追加安全旗標、切換權限或重試其他引擎。
- 所有功能測試結束後，隔離執行最新平均門檻：首次 9.659 ms，唯一重試 7.073 ms。
  `/tmp/tenka-release-events-mean-gate.log` 保留兩次共七百二十項 sample；依既有規則通過。
  獨立 p95 gate 仍在 day450 準備 checkpoint 時遇到 ownership 違例，零項 sample。
  `/tmp/tenka-release-events-p95-gate.log` 不提供 p95 達標證據。
- 唯讀 review 另確認非戰術野戰可因大將非戰鬥離任而靜默移除；fieldCombatSystem 不再看到該紀錄。
  07 §3.3 只定義全潰走／殲滅的勝利，02 的 null winner 代表平手撤退。
  非戰鬥離任的結束結果、損失與獎勵仍需裁決；本輪不虛構勝利、傷亡或威風。
- 最新 runtime 凍結後，三個 agent 平行完成 easy／normal／hard 各二十種子、二十五年診斷。
  三個實際 session 均 exit 1；六十項 primary failure 全部留存，零項完整 run／repeat。
  INV-02／INV-22 各為 easy 三百、normal 二百六十八、hard 三百四十一；沒有其他 INV。
  全部 CSV 僅有標頭，兩種 acceptance 均 incomplete，空 repeat 的比較值正確為 null。
- `/tmp/tenka-release-events-national-{easy,normal,hard}.json` 保留本輪結果，前輪 artifact 未覆寫。
  `/tmp/tenka-release-events-difficulty-accounting.json` 確認無遺漏或重複種子，CSV 與完整 run 數相同。
  六十項失敗的 day 與完整 INV message／refs 陣列都與前輪相同；不等於完整 trajectory 相同。
  此為功能診斷，不提供並行效能數字，也不是通過二十五年驗收。
- 最後型別、完整 lint／format、字型涵蓋率、簡體／新字體掃描、資料、assets 與 bundle 再驗通過。
  balance-spec-audit 仍有九項問題，exit 1；不補無效別名或擅自退役規則。
  六張 frozen PNG hash 與既有留存相同，00 與 staged diff 皆空；沒有 commit、push 或發版。

## 城頁籤捲動位置與剩餘門檻（2026-10-09）

- 三組平行唯讀 audit 找到一項既有規格明定的 UI 缺口：11 T4 要求城四頁籤保留捲動位置。
  keepMounted 只留 pane DOM，四頁共享外層 section；短頁會夾限長頁的 scrollTop。
  另兩組確認未知卒年需要 authoring 邊界裁決，Pixi cache 沒有安全的公開釋放介面；未擅自改規則或依賴。
- CastlePanel 加入 game identity／castleId 範圍的各頁 offset cache，切換前讀取實際 scrollTop。
  layout effect 在切換後還原目的頁；換遊戲或城時清空，正常同遊戲 tick 不重設。
  不改 CSS、文字、core、RNG 或指令；原 invalid-tab／modal focus 防護仍在。
- 原始測試兩項失敗，修正後新測試三項與相鄰回歸共二十八項通過。
  `/tmp/tenka-castle-scroll-retention-red.log` 與 `-green-final.log` 保留分開結果。
  jsdom 明示模擬短頁夾限，另測四頁位置、同 ID 換遊戲、換城、tick、鍵盤 focus 與零 core mutation。
- 獨立 reviewer 未見 identity 或 core mutation 缺陷；tablist 本身仍在共享 scroller 內。
  原生 pointer focus 或手動捲到頁籤可先改 scrollTop；DOM 測試不證明該瀏覽器互動。
  瀏覽器權限未改，不重試 launch；native layout 與 pointer path 留待可執行的 headless gate。
- 最新全部 UI 為七百一十七項、七十三檔通過，22.23 秒；不是整套 core／golden 通過。
  `/tmp/tenka-castle-scroll-retention-all-ui.log` 保留結果；較早 full unit／coverage 數字不合併新測試。
  型別、build 與 fresh bundle 通過；initial gzip 491546 bytes，scenario 100845，font 351028。
- Release checklist 更新舊測試與效能數字，所有候選驗收框仍未勾選；write checker 零違規。
  no-heir 領地規則仍待使用者裁決，六十失敗種子的原始 artifact 保留；遊戲未完成。

## 數值輸入正規化與抵達後自動歸還（2026-10-09）

- 平行 audit 再找到兩項既有規格明定的缺陷；沒有新增玩法或選定無親族領地政策。
  NumberSlider 的受控值若已在最大值，輸入超限值後 blur 雖回報正確 callback，文字仍可停在超限值。
  12 §3.2.10／T7 明定 blur 後 clamp 與 step；本輪在 blur 同步正規化本地 text。
  此階段保留 snap 公式、鍵盤／range／快速鈕、空值回復與 callback 次數；後續端點修正另記。
- `/tmp/tenka-number-slider-normalization-red.log` 原始四失敗四通過；修正後相關二十五項通過。
  新測試使用真正 useState wrapper，覆蓋上／下界、同值貼齊、正常改值及原生空／非數字清空。
  `/tmp/tenka-number-slider-normalization-green.log` 保留結果；型別及 scoped lint／format 通過。
- 軍勢被失效同盟阻擋時，holding 與「目的地仍屬我方」不能代表完成任務；07 §3.13(a) 要求實際抵達。
  軍事系統的 missionComplete 增加 posNodeId＝targetNodeId 與無 active physical leg 條件。
  合法出陣進入長邊、尚未抵達時，同盟到期發出 army.blocked；次日不再誤歸還或即時入庫。
  全程中央驗證指令、真正 advanceDay 與 INV；沒有注入 army status／progress 或修改 BAL。
- `/tmp/tenka-army-auto-return-completion-red-valid.log` 原始一失敗三通過；第一稿 fixture 錯誤另留存。
  最後五項新測試與六十九項 military 共七十四通過，含低糧仍歸還、關閉自動歸還及實際抵達兩種控制。
  `/tmp/tenka-army-auto-return-completion-green-final.log` 保留結果；不以 synthetic 地圖代替全國驗收。
- 新增兩個 native headless case：城頁籤以原生 wheel／可見 tab click 驗證長短頁，數值以原生 Tab blur 驗證。
  `e2e/castle-tab-scroll.spec.ts` 與 `e2e/number-slider-normalization.spec.ts` 只讀完整 game／RNG 證據。
  lint／format、型別與 Playwright collection 通過；沒有執行瀏覽器，不能計為 native PASS。
  深處 offscreen tab 的 focus 自動捲動仍不在前案 scope；未做 JavaScript click 或偽造幾何。
- runtime 凍結後三個 agent 各跑二十種子、二十五年，easy／normal／hard 全部 exit 1。
  六十 primary failure 留存，零項完整 run／repeat；INV-02／22 各三百、二百六十八、三百四十一。
  `/tmp/tenka-auto-return-completion-accounting.json` 證明種子完整、CSV 僅標頭、repeatCsvEqual=null。
  完整失敗 day／INV message／refs 與前輪相同；不等於完整 trajectory 相同，不提供並行效能數字。
- `/tmp/tenka-auto-return-completion-trajectory.json` 的有限 AI／mini DTO repeat 與原生 reload 精確相同。
  完整 DTO 也與前輪相同，沒有排除欄位；BAL hash 仍 b9d86bf7a402ac5d，不代表全國長跑通過。
- 第一個完整 coverage run 在無 worker 上限且與診斷同跑時為 3862 passed、19 failed、1 skipped。
  `/tmp/tenka-auto-return-completion-coverage.log` 保留 116.47 秒原始結果：十一既有失敗與八項 App timeout。
  全部診斷結束後，以 minWorkers＝1／maxWorkers＝2 重跑同一套件；沒有放寬 timeout 或排除測試。
- 限制 worker 的完整 coverage 為 3870 passed、11 failed、1 skipped，363 檔、217.06 秒。
  `/tmp/tenka-auto-return-completion-coverage-bounded.log` 保留結果；八項額外 timeout 未重現。
  行 93.57%、分支 89.98%、函式 96.17%；此快照早於下述 UI 端點修正，不宣稱完整套件通過。
- 全部功能工作結束後，隔離平均門檻首次 9.912 ms、唯一重試 7.178 ms，七百二十 samples 全留存。
  `/tmp/tenka-auto-return-completion-mean-gate.log` 通過平均門檻；p95 在 day450 準備失敗、零 samples。
  沒有延長重試、FPS 或應用程式整體效能宣稱。
- 最新型別、完整 lint／format、build、資料、字型、字形、assets 與 bundle 檢查通過。
  initial gzip 491568 bytes，scenario 100840，font 351028；測試／建置耗時不是 performance benchmark。
  沒有更新 golden／replay／六張 PNG、00、milestone 或 release gate；沒有 commit、push 或發版。

## NumberSlider 精確端點與最終 UI 再驗（2026-10-09）

- 實際 Oda 募兵上限為 2365、step 為 100；End 原先經 snap 回報 2300，違反 12 的 End→max 要求。
  range 的離格上限也產生 stepMismatch；原生瀏覽器規則不保證保留該 value。
  Home／End、零／全部快速鈕與 range 端點現在回報精確邊界；內部數值仍走原有 snap。
  離格上限或受控值使 range 使用 step='any'；元件維持步進，numeric input 仍 step=100。
- `/tmp/tenka-number-slider-endpoints-red-final.log` 原始三失敗九通過；最後十三項 NumberSlider 測試通過。
  相關三十項 focused 測試通過；typed blur 的 clamp／snap 公式不變，未改 core、BAL、CSS 或字串。
  原生 case 保留實際 2365 上限與 range validity 檢查；collection 通過不代表瀏覽器執行通過。
- `/tmp/tenka-number-slider-endpoints-all-ui.log` 最終全部 UI 730 passed、74 檔、21.88 秒。
  一般／core 型別、完整 lint／format 與 fresh build 通過；initial gzip 491639 bytes、scenario 100844、font 351028。
  bundle 預算通過；完整 coverage 尚為上一段快照，native headless 與完整遊戲門檻仍未通過。
- 後續可及性 audit 發現 numeric input 的 accessible name 為空；range 才收到現有 label。
  數字框新增同一 aria-label，不改數值或 callback；四處正式募兵／輸送 consumer 已提供翻譯 label。
  `/tmp/tenka-number-slider-numeric-label-red.log` 為十三通過一失敗，修正後相關三十一項通過。
  測試分別檢查 slider／spinbutton 名稱與 render 零 callback；型別與 scoped lint／format 通過。
  此新增修正尚不包含上一段全部 UI／build 快照；完整再驗另記，不宣稱 native 可及性驗收通過。

## 長生命週期失敗的實際事件追蹤（2026-10-09）

- 保留四地方 Yoshimichi 歸還與七地方 Yuki 滅亡兩項失敗 assertion；不替換種子或延長期限取得綠燈。
  兩項相同失敗已存在於前輪 release-events coverage，不是最新 auto-return completion guard 引入。
  `/tmp/tenka-current-lifecycle-witness.json` 保留原測試 world／seed 的每日 officer、army、事件及 INV。
- 四地方 Yoshimichi 從 day91 到 1261 都在 Ogaki、armyId=null，未出現在任何實際 march 指令。
  其他 Saito 大將正常出陣及歸還；此案例沒有 Yoshimichi 的 blocked／holding／低糧歸還可修。
  此追蹤尚未定位較早 planner 的第一個分歧；後續 paired ablation 的因果證據另記。
- 七地方 Hojo 在 day157 出陣、158 實際抵達 Yuki；day185 仍在合法 siege，不是停滯。
  城防從 3000 降至 2588.635、守軍從 2670 降至 1234、士氣從 100 降至 72；day180 有徵兵補充。
  每日進度與 07 的 assault 公式相符，INV 為空；沒有支持強制 day185 滅亡的修正證據。
  `/tmp/tenka-current-yuki-siege-witness.json` 保留量化證據；兩項門檻仍失敗，完整遊戲未完成。

## 私有 TextStyle 的重繪生命週期（2026-10-09）

- 城名牌原本在兵數、警示或顏色改變時重新指派 plain-object style，建立新的 Pixi TextStyle UID。
  BitmapFontManager 以文字與 styleKey 作為 layout cache key；同字級的重繪也製造多餘 cache entry。
  現在保留各 label 私有 style，只有 tier 改變才重設字級；沒有共享 mutable style 或清除私有 cache。
- `/tmp/tenka-nameplate-style-red-clean.log` 兩項真實 Pixi UID 回歸失敗；早期 fixture／teardown 錯誤另留存。
  修正後六十一項相關測試通過，含 main／branch／main、首次 branch、同字級重繪與獨立 label ownership。
  只 stub jsdom 無法量測的文字 width；檢查實際 TextStyle UID／key、文字、幾何及 child destruction。
  `/tmp/tenka-nameplate-style-green-final-branch.log`、型別及 scoped lint 均通過，不代表 GPU 截圖相同。
- 合併 numeric label 與 style 修正後，完整 lint、fresh build 與 bundle 預算通過。
  initial gzip 491652 bytes、scenario 100844、font 351028；日誌保留於 `/tmp/tenka-style-and-label-*`。
  此修正只減少 bounded layout cache churn；不解決既知 unbounded shader-source retention，whole-heap gate 仍未通過。
- 凍結後完整 coverage 使用 minWorkers＝1／maxWorkers＝2：3878 passed、11 failed、1 skipped，364 檔、212.83 秒。
  `/tmp/tenka-style-and-label-coverage.log` 包含全部 733 項 UI，75 檔均通過；沒有額外 App timeout。
  core 行 93.57%、分支 89.97%、函式 96.17%；完整 exit 1，既有十一項失敗不變，並未滿足整體 gate。
  數字框修正後獨立 App 套件也為 457 passed、51 檔、36.90 秒；合併後完整 run 再覆蓋 App。
  `/tmp/tenka-numeric-label-app.log` 保留較早獨立結果；兩個 native case 只 collection 通過，沒有瀏覽器執行。
  所有 worker 已結束；六張 PNG hash 保留、00 與 staged 檔案未動，沒有 commit／push／發版。

## 低金錢攻勢守門的因果對照（2026-10-09）

- 使用原四地方 seed1、startDay90 的完整流程；只在 scratch loader 停用兩個 fresh march／expand 低金 predicate。
  loader 明確驗證兩項替換並保存 compiled source 原文及 SHA256；repo、BAL、測試、日期與 frozen 基準不變。
  `/tmp/tenka-lowgold-ablation-loader.json` 與兩份 source 留存；沒有注入 army 或選擇性放過 INV。
- current／disabled 具有相同初始 hash，各完整跑 1171 ticks 到 day1261，零 INV 與 command.rejected。
  current 沒有 Yoshimichi 出陣／歸還；停用守門才在 day741／744 出陣、744／797 真正歸還。
  最早 pending 差異在 day299，day300 才生效：金錢為零的 Matsudaira 多派 Motoyasu 向 Takato 出陣。
  正常守門依 09 D23／15／17 A4 阻止這項攻勢；不能以恢復舊 witness 為由刪除正確規則。
- extra army 在 day319 產生不同合戰／威風，misc RNG 首次分歧於 319，event 於 330。
  AI／battle／dev RNG 全程相同；不是 shared AI RNG 的直接抽樣偏移，較早假說不成立。
  Saito 的命令至 day352 才分歧；實際 world／combat／event 時序改變，未找到歸還實作缺陷。
  `/tmp/tenka-lowgold-yoshimichi-current.json` 與 `-disabled.json` 保留每日命令、事件、RNG 及 INV。
  四地方失敗 assertion 保留；此診斷不替代 national、golden 或平衡驗收，也不是效能量測。

## 城內城主任命入口（2026-10-09）

- 依 11 §3.4.1，CastlePanel 的城主列現在開啟城內任命選單；候選人直接使用既有 validateAppointLord。
  提交仍進入正常 command queue，不直接改動 core；加入同 game／castle、ownership 與介面遮擋檢查。
  game replacement、失效候選人、取消與焦點回復均有回歸測試；沒有新增規則或字串。
- 原始七項失敗保留於 `/tmp/tenka-castle-lord-chooser-red-final.log`；修正後八項新增測試通過。
  `/tmp/tenka-castle-lord-focused-final.log` 為三十六項通過；型別及 scoped lint／format 通過。
  新增 native case 使用正式 Oda wizard、暫停時完整狀態比對與正常下一日任命，不注入 army 或步進。
  `/tmp/tenka-castle-lord-native-*` 僅證明 collection、型別及 lint；尚未執行瀏覽器，不代表原生驗收通過。

## Pixi 8.19 私有程式生命週期修補（2026-10-09）

- 真實 installed constructor 證明相同 shader 每次產生不同 source key；scratch RED 與五項 lifetime RED 留存。
  現在固定 Pixi 8.19.0，以十三個精確來源 hash 套用本地修補；postinstall／predev／prebuild 執行同一 installer。
  installer 先驗證全部 target，再逐檔原子替換；未知版本或內容先拒絕，已知混合狀態可重試。
  此保證不涵蓋多檔寫入的整體原子性；兩份離線原始來源重建測試不是實際 npm ci 的證據。
- key 保留處理後 source、precision 與 transform feedback 語義；獨立 program 的所有權不合併。
  context-local reflection 每次命中還原，避免跨 context metadata 與重複 relink 使 location 失效。
  shader resource layout 各自保存；context program 與私有 backbuffer shader 明確清理，不清除全域 cache。
  ownership review 找出上述邊界；沒有直接安裝尚未合併的 upstream PR，也沒有修改 frozen 基準。
- `/tmp/tenka-pixi-patch-green-final2.log` 七十三項通過，含十二項 installer／lifetime 及六十一項既有 renderer 測試。
  真實 ESM／CommonJS constructor 加 synthetic GL 檢查 identity、reflection 與 own-context deletion；不是 GPU 證據。
  manifest 記錄上游來源；`tools/dependencies/PixiJS-LICENSE.txt` 保留原始 MIT license。
  二十次 remount 的既有 post-GC heap 增加 854608 bytes 屬修補前快照；修補後 whole-heap／pixel gate 尚未驗證。
- 後續移除十二個修補 runtime 檔案的舊 sourceMappingURL，保留 upstream map 檔案原文。
  fresh build 的 vendor map 現在包含實際 patched JS；不再以原始 TypeScript 描述改過的程式。
  Vite optimizer 的 no-op plugin 名稱加入 manifest SHA256；同版本／lockfile 的修補變動可使 cache 失效。
  真實 Vite resolveConfig／optimizeDeps 測試證明 configHash 改變，未改 manifest 時重用相同 hash。
  修改 manifest 後須重啟 Vite；不強制每次重建或清除全域 cache。
- `/tmp/tenka-combined-final-pixi.log` 最終三檔十七項通過，涵蓋 installer、lifetime 與 optimizer。
  完整 coverage 的 collection 早於 optimizer 測試新增；本 focused run 補驗最終來源，不擴大為 full-suite 通過。
  最終 fresh build 與 bundle 預算通過，initial gzip 492360 bytes、scenario 100842、font 351028。
  資料、簡體掃描、字型與 assets 驗證通過；三個 native case collection 通過，沒有啟動瀏覽器。
- 完整 bounded coverage 結束：3899 passed、11 failed、1 skipped，367 檔、215.08 秒，exit 1。
  `/tmp/tenka-combined-coverage.log` 保留全部原始失敗；core 行 93.62%、分支 90.09%、函式 96.17%。
  全部 UI 741 項、76 檔通過，沒有額外 timeout；原十一項玩法／frozen 失敗不變。
  collection 早於 optimizer 新檔；最終十七項 focused run 另補驗 cache／map，不能視為完整 suite 通過。
  `/tmp/tenka-combined-final-types.log` 與 `-lint.log` 通過；後續數字更新另跑 docs format／prose check。
  六張 PNG hash、00 與 staged 狀態未動；沒有 commit、push、部署或發版，完整遊戲目標仍未達成。

## Pages 子路徑的本地靜態再驗（2026-10-09）

- 在前述 Pixi／城主任命來源凍結後，以 VITE_BASE=/tenka-fubu/ 建置到獨立 temp artifact。
  `/tmp/tenka-pages-build-final.log` 與 `-bundle-final.json` 通過，initial gzip 492381 bytes。
  scenario 100845、font 351028；此快照早於後續 facility confirmation、drag 與戰鬥功績修正。
- `/tmp/tenka-pages-static-assets-final.json` 檢查五個 HTML 本地引用、五項實際素材 hash 及 CSS 字型前綴。
  正確子路徑及所有檔案均存在；首次 checker import path 錯誤另留於 `-before.json`，修正後重跑。
  此結果不是 native server／browser、冷載入、remote CI 或 Pages 部署證據；沒有操作外部 workflow。

## 點擊位移門檻與指標所有權（2026-10-09）

- 04 §3.11 明訂位移大於四 px 才平移；原實作先 dragMove，三 px 點擊也移動並留下慣性。
  現在跨門檻前保持鏡頭不動；首次有效拖曳保留從按下起點的完整距離，之後才逐段累計。
  所有 pointerdown 中止舊鏡頭運動；只有左／中鍵且持有該指標的拖曳可平移或結束。
- authentic RED 四失敗四通過；追加第二指標 tap 的 RED 一失敗八通過，兩份原始日誌保留。
  次要指標不能清除主指標的 tap suppression；原生事件順序尚未經瀏覽器驗證。
  `/tmp/tenka-map-drag-green-final2.log` 包含 renderer／camera 的 focused 測試，一百零二項通過。
  scoped lint／format 通過；沒有改 core、BAL 或 frozen PNG，這不是 GPU／FPS 或 screenshot gate 證據。

## 正常落城的武將功績（2026-10-09）

- 06 §3.5 明訂參戰武將落城功績與 ldr／val 經驗；原 siege 成功收尾只有士氣加成，沒有入帳。
  現在先保存實際參戰主將／副將身分，再於落城收尾使用 gainMerit；不給敵方或遠端未參戰者。
  主將依 BAL.meritCommanderMult 先取整，再套 trait.yashin；兩階段皆沿用正式 BAL 與共用成長上限。
- controlled near-fall prerequisite 加真實 applyMarch／advanceDay，沒有注入 army 或位置來宣稱完整 campaign。
  corrected RED 兩失敗一通過；較早 test-only fixture 錯誤另留存，未改測試種子掩蓋功能失敗。
  `/tmp/tenka-siege-merit-final.log` 七十九項通過；後續 expected 值由 BAL 推導，四項獨立回歸再通過。
  普通主將／副將為 45／30，野心家為 54／36；對應經驗、無重複入帳與 native save continuation 均通過。
- 功績達門檻不自動升格；後續正式排入 promoteRank 指令才升格，保留 06 §3.4 契約。
  此 core 修正晚於完整 coverage、長跑及 performance 快照；那些結果不能視為目前 core 的再驗。
  合戰功績與野戰完整參戰歷史仍另行處理，不宣稱全部戰鬥類功績已完成。

## 合戰勝方的完整參戰功績（2026-10-09）

- 06 §3.5 要求合戰勝利功績及威風加成；原 resolveBattle 沒有入帳。
  現在從完整 battle.units／Army roster 保存勝方主將與副將，先於 strategic cleanup 執行 gainMerit。
  judgeBattleAwe 依 07 保證每次合戰勝利至少威風小，故使用正式勝利與威風兩項 BAL；不製造 none 案例。
- 正式 march／advanceDay 產生遭遇，再由驗證通過的 startKassen 指令與正常 tactical ticks 結算。
  控制前置是連通 frontier road 與足夠守軍，沒有在開戰後注入參戰身分、退出狀態或結果。
  真實勝方含兩支部隊，其中一支自然 routed／exited／depleted，仍依原參戰主將／副將獲得功績。
  loser、遠端未參戰者與額外野戰結算沒有加分；重複 tick 拒絕且不改 officer／RNG。
- genuine RED 兩失敗一通過；較早路徑／fixture diagnostics 另保留，不當作產品功能 RED。
  `/tmp/tenka-combat-merit-final.log` 五套三十九項通過，含落城、合戰與原有相關回歸。
  native save continuation 比對完整 persistent state、deferred events 與 RNG；未更改 schema 或 frozen transcript。
- 普通野戰多日結算會從 side.armyIds 移除 routed／destroyed 部隊；reinforcement 又可能晚加入。
  原始參戰主將／副將歷史未保存，不能只給 final-day survivors 或從現存武將猜測參戰者。
  完整野戰功績仍需持久參戰 ledger 與舊存檔契約設計；本合戰修補不代表全部功績來源完成。

## 素材非同步所有權與卸載（2026-10-09）

- 真實 promise 時序的四項 RED 證明 duplicate acquire、pending owner dispose、async unload 與 commit-window 問題。
  同 instance／id 的 pending 請求現在共用一份 lease；每個 shared resource 同時記錄 pending 與 committed users。
  等待中的有效 owner 可阻止另一 owner 提早卸載；最後一次 unload 完成前，新 load 不會開始。
  commit 時移除 pending ID，避免 release／reacquire 在 outer promise settle 前拿到已銷毀的 texture。
- 同頁 atlas frame 的 subtexture 只在全頁零 users 時 destroy(false)，不由 frame 釋放共享 source。
  普通 load failure 可釋放預留後重試；disposed loader 的新 acquire 拒絕，不啟動新 load。
  unload failure 保存實際 Error／null／undefined，加入 readonly unloadErrors，之後 acquire 拒絕同一錯誤。
  失敗卸載保持 fail-closed 到 module／environment reload，不宣稱不確定 driver 狀態已恢復。
- `/tmp/tenka-loader-green-final2.log` 九十項通過：二十二 loader、九 drag、五十九既有 renderer。
  `/tmp/tenka-loader-types-final3.log` 型別通過，scoped lint／format 通過；原始四份失敗日誌保留。
  synthetic Assets／Pixi surface 只證明 promise、refcount 與 ownership；未替代 native driver 或 whole-heap gate。

## 施設建造確認與 modal 歸屬（2026-10-09）

- 11 §3.4.2 的「選項→確認→Command」原先直接排入建造，與全額先扣款、取消只退半價的規則不符。
  CastlePanel 現在排入有 game／castle／token stamp 的 FIFO confirmation，顯示名稱、正式造價與基本工期。
  只有自己的 active descriptor 能確認；開啟及提交均重驗 validateBuildFacility，取消不排入指令。
- 替換 session、換城、unmount 與外部關閉只清除自己的 descriptor；舊請求不繼承新 session 的 resume claim。
  validation alert 使用獨立 rendered feedback，避免再把已翻譯中文傳入 t(key) 產生缺字串 warning。
  既有 dispatch feedback 路徑不變；沒有新增字串、CSS、core 或 BAL。
- `/tmp/tenka-facility-confirm-red.log` 一失敗六通過；最終 surrounding focused 四十六項、十項新增回歸通過。
  `/tmp/tenka-facility-confirm-focused-clean.log` 無 act warning；既有直接 store update 改用真正 act，不改 assertion。
  normal／core 型別與 scoped lint／format 通過；尚未執行 native browser，不宣稱完整介面驗收通過。

## 玩法與生命週期合併驗證（2026-10-09）

- 全部來源凍結後，以 minWorkers=1／maxWorkers=2 跑完整 coverage：3941 passed、13 failed、1 skipped。
  `/tmp/tenka-gameplay-lifetime-coverage.log` 共 372 檔、215.20 秒、exit 1；沒有額外 timeout。
  core 行 93.75%、分支 90.16%、函式 96.29%；全部 UI 774 項、78 檔通過，不宣稱整體 suite 通過。
- 較上一快照多兩項 frozen final-hash control 失敗：battle transcript／command replay 的 BAL-drift 獨立性測試。
  實際 BAL hash 仍 b9d86bf7a402ac5d；注入錯誤 balanceHash 的控制偵測 drift，但舊 finalHash 比對失敗。
  原缺失 witness、national day450 的 INV-02／22 及其他 frozen 失敗仍在；相關 frozen assertion 與基準未改。
- normal／core 型別、完整 lint／format、fresh build 與 bundle 預算通過。
  `/tmp/tenka-gameplay-lifetime-{types,lint,build}.log` 與 `-bundle.json` 保留結果。
  initial gzip 493531 bytes、scenario 100847、font 351028；建置耗時不是效能 benchmark。
- 最終來源另以 Pages base 建置到 mktemp 目錄；initial gzip 493547 bytes、scenario 100843、font 351028。
  `-pages-build.log`、`-pages-bundle.json` 與 `-pages-assets.json` 通過；五引用、五素材 hash 及字型前綴正確。
  Playwright collection 一百零七項、三十八檔通過；沒有 browser page，不代表 native／部署驗收通過。
- 所有功能 worker 及 build 結束後才跑 serial mean：首次 9.418551 ms、唯一重試 6.618709 ms。
  `/tmp/tenka-gameplay-lifetime-mean-gate.log` 保存七百二十 samples，通過正式平均門檻。
  獨立 p95 的 checkpoint preparation 仍在 day450 失敗，零 samples；`-p95-gate.log` 保留原始失敗。
  沒有額外重試、FPS、完整長跑或 whole-heap 通過宣稱；先前六十種子診斷早於本輪 core 變更。

## 外交功績、指標取消與存檔淺驗證（2026-10-09）

- 外交工作在有效武將完成付費月結、單向信用由未滿跨至上限時，才給 `meritDiplomacy` 與政務經驗。
  信用維持上限不重複給功績；支出信用後重新跨至上限，才構成新的完成事件。
  朝廷／幕府恩惠不等於信用；協定缺少執行武將歸屬，尚未補協定功績。
  RED 三項功績斷言失敗；`/tmp/tenka-diplomacy-merit-final-corrected.log` 二十三項通過。
- 地圖原生 `pointercancel` 只取消所屬指標；視窗失焦取消拖曳、慣性與置中動畫。
  取消先清速度再結束拖曳，不產生新慣性；一般放開仍保留原有慣性規則。
  原生監聽在 destroy 對稱移除；RED 四項失敗後，`/tmp/tenka-map-cancel-green.log` 一百零七項通過。
  這是 mocked Pixi／DOM handler 驗證，不是 native 瀏覽器事件投遞或 GPU 證明。
- 存檔解碼補齊 16 §3.7 的十三個頂層粗型別：十二個物件與 reports 陣列。
  新增檢查在遷移後、既有 invariant 檢查前執行；不增加巢狀全樹 schema，不修補未知戰鬥歷史。
  RED 四項失敗；`/tmp/tenka-save-top-shape-final.log` 一百三十三項通過，含 frozen 舊版存檔三十日續跑。
  既有信封拒絕仍回 invalidFile；新增頂層失敗回 corrupt；合法 payload 與 v3 版本不變。
- 野戰的 active armyIds 會刪除潰走／解散部隊，不能當完整參戰武將名冊。
  需要與 active 引用分離的持久名冊；舊版缺失歷史的功績處置，已向使用者提問，尚未裁定。
  開發為持續方針，沒有階段完成模型；不臆造每日、月結或滿級功績。
- 本輪完整 coverage 為 3966 passed、13 failed、1 skipped；三百七十四檔、218.08 秒、exit 1。
  `/tmp/tenka-merit-cancel-save-coverage.log` core 行 93.81%、分支 90.18%、函式 96.53%。
  UI 七百七十九項、七十八檔全部通過；原 witness、national day450 ownership 與 frozen 比對仍失敗。
  combined 型別、完整 lint／format、fresh build、data／font／assets 與 bundle 預算通過。
  normal initial gzip 493720 bytes、scenario 100842、font 351028；前節 gate 保留為較早快照。
- 所有功能與建置程序結束後，以單 worker 跑 serial mean：9.423359 ms、唯一重試 6.643993 ms。
  `/tmp/tenka-merit-cancel-save-mean-gate.log` 保存七百二十 samples，正式平均門檻通過。
  `-p95-gate.log` 仍在 checkpoint preparation day450 失敗，零 measured ticks／samples，沒有 p95 數值。
- Pages base 本地建置在 `/private/tmp/tenka-merit-cancel-save-pages.VGJW3u`；靜態檢查與預算通過。
  initial gzip 493741 bytes、scenario 100844、font 351028；五引用、五素材 hash 與字型前綴正確。
  `/tmp/tenka-merit-cancel-save-pages-{build,assets,bundle}.*` 留存；不代表伺服器、瀏覽器或部署通過。
  六張 frozen 策略截圖 hash 仍一致，00 未改、stage 空；沒有 commit、push、部署或 native 瀏覽器通過宣稱。

## 軍團收回、施設移除與地圖提示（2026-10-09）

- 明示收回軍團城池時，軍團金錢全額歸還勢力庫存並清零；保留城池後的新收入仍可正常結算。
  部分收回不解除軍團長；明示解散或收回最後一城，才套用解任忠誠損失。
  大名忠誠維持一百；死亡、陷落等系統解散不套用自願解任懲罰。
  四項庫存與六項解任測試含正式指令、月初結算、重複拒絕及原生存檔續跑。
  `/tmp/tenka-corps-dismissal-after.log` 五十一項通過；獨立 source review 未發現新增缺陷。
- 城面板補齊已建施設拆除與施工取消；危險確認以取消為初始焦點，確認後只派送正式指令。
  確認保留 session、城池、施工物件與 modal owner 身分；過期 callback 不作用於新工作或新 session。
  新增 reentrancy RED 證明同步訂閱可替換 modal；cleanup 發布後重新核對 owner，不關閉替代視窗。
  `/tmp/tenka-castle-confirm-reentrancy-green.log` 五十二項通過；退款斷言使用實際費用與 BAL 比例。
- 地圖城、郡與部隊的 public facts 提示補齊二百五十毫秒延遲、游標偏移、邊界定位與淡入。
  同一目標移動不重置延遲；日結刷新數值，modal、出陣、viewport、session 與指標取消清除提示。
  DOM 與地圖提示共用單一 owner；返回同一地圖目標仍重新等待完整延遲。
  部隊糧食天數使用與實際補給一致的武將特性倍率及取整；不讀取隱藏意圖或派送 core 指令。
  `/tmp/tenka-map-hover-green-final3.log` 一百八十九項通過；重分區後 food／Main／portal 十四項通過。
  `/tmp/tenka-map-hover-food-main-final.log` 保存最終布局結果；獨立 review 未發現剩餘具體缺陷。
- 字型依正式工具重建，涵蓋一千六百三十九字元；data、簡體掃描與素材驗證通過。
  Headless collection 一百零七項、三十八檔通過；沒有建立 page，不代表 native 瀏覽器驗收。
  無親族領地、野戰缺失歷史、開發完成階段與協定執行武將規則仍未裁定；不臆造結果。
- 最終布局完整 coverage 為 4007 passed、13 failed、1 skipped；三百八十二檔、217.19 秒、exit 1。
  `/tmp/tenka-hover-corps-facility-coverage-final.log` core 行 94.11%、分支 90.25%、函式 97.25%。
  UI 八百零七項、八十三檔全部通過；十三項既有 witness、ownership 與 frozen 比對失敗保留。
  較早 `-coverage.log` 在 test 移動前 collection，未包含 food 兩項；保留原始結果，不作最終布局證據。
- 最終型別、完整 lint／format、normal build、bundle 預算與 data／font／assets 全部通過。
  normal initial gzip 495951 bytes、scenario 100844、font 351028；所有 gate logs 使用本輪前綴。
  Pages base 本地成品 `/private/tmp/tenka-hover-corps-facility-pages.fu5MK7` 的靜態檢查與預算通過。
  initial gzip 495973 bytes、scenario 100846、font 351028；五引用、五素材 hash 與字型前綴正確。
  `/tmp/tenka-hover-corps-facility-pages-{build,assets,bundle}.*` 保留；不代表伺服器、瀏覽器或部署證明。
- 所有 agent、功能測試與 build 結束後，serial mean 首次 9.449690 ms、唯一重試 6.627510 ms。
  `/tmp/tenka-hover-corps-facility-mean-gate.log` 保存七百二十 samples；正式平均門檻通過。
  `-p95-gate.log` 仍在 day450 checkpoint preparation 因 ownership 失敗；零 measured ticks／samples。
  沒有 p95、native 瀏覽器、完整長跑或 whole-heap 通過宣稱；六張 frozen 策略截圖保持不變。
- 下一項明確缺口是 08 §3.4.1 的死亡 spouseId 清理：目前死亡與處決路徑未解除雙方連結。
  婚姻 Pact 必須保留；生存武將轉籍不解除婚姻。該較早快照只有 source audit；後續實作見下一節。

## 婚姻死亡清理與特性接線（2026-10-09）

- 婚姻死亡清理已補齊三個實際死亡寫入點：共享 dieOfficer、捕虜處決與元服前死亡分支。
  清除死者 spouseId；配偶仍指向死者時才解除反向連結，不覆寫配偶的其他婚姻。
  勢力間永久 marriage Pact 保留；生存武將轉籍、釋放或 assignment release 不解除婚姻。
  RED 四項失敗後，`/tmp/tenka-marriage-death-after.log` 四十五項通過，含二十四月 lifecycle suite。
  自然死亡與處決使用正式指令／日結；戰死是共享死亡入口，未另宣稱重現實際追擊戰死。
  元服前與非對稱連結案例是防禦性輸入；不宣稱未元服者可合法成婚，不增加讀檔深層修復。
- 武將詳情補齊三十七個特性說明與十個實際 trait→tactic 連結；滑鼠與鍵盤焦點共用 Tooltip。
  說明使用 TRAITS 實際掛鉤值，區分機率百分點、乘數、城主任務條件與同城他人光環。
  owner RED 兩項揭露同特性清單的武將／session 替換會保留提示；依 game 身分與 officerId 重掛。
  普通 mutable tick 不重掛提示；`/tmp/tenka-officer-trait-owner-green-final.log` 二十八項通過。
  這是說明與介面驗證，不是所有特性 runtime 掛鉤完成的證明。
- 攻城名手只加成該主將部隊的耐久傷害，不加成守軍傷亡或攻方反擊損失。
  實際城主的籠城名手削減耐久損傷與每日士氣扣減，含糧盡扣減；與既有城防、大命乘數合成。
  依 00／02，耐久與士氣每次寫入都取整；基礎與糧盡扣減分別取整，不新增 carry 或最低傷害。
  untraited 舊版小數耐久寫入也修正；07 §5.5 與 D47 記錄較高優先序依據。
  RED 三項失敗後，`/tmp/tenka-siege-traits-focused-final.log` 一百零四項通過，期望值由 BAL 推導。
- 朝廷工作月費使用具名 mission executor 的朝廷通特性；與御供眾乘數先相乘，再只取整一次。
  共用 monthlyDiplomacyWorkCost 同時供日結扣款、選人預覽與進行中任務價格；其他外交目標不受影響。
  RED 兩項失敗後，`/tmp/tenka-court-work-cost-after-corrected.log` 二十二項通過，含原生存檔續跑。
  官位申請指令未指定 executor；已向使用者提問，不自選武將或宣稱朝廷通全部效果完成。
- 新發現合戰四維、遠程攻擊與三類戰法威力掛鉤仍無 runtime 消費者；列為後續明確玩法缺口。
  來源已核對 computeBattleUnitAttackPower 與 applyBattleTactic，不只依賴掛鉤字串搜尋的缺席。
- 第一輪完整 coverage 為 4035 passed、14 failed、1 skipped；舊大命測試仍要求小數耐久損失。
  `/tmp/tenka-spouse-traits-coverage.log` 保留；非 frozen 期望依完整扣減後 clamp／round 修正。
  最終 `/tmp/tenka-spouse-traits-coverage-final.log` 為 4036 passed、13 failed、1 skipped，219.00 秒。
  core 行 94.13%、分支 90.33%、函式 97.26%；八十六檔全部八百一十九項 UI 測試通過。
  剩餘缺失 witness、national ownership 與十項 frozen 比對仍失敗，不更新基準或宣稱全套通過。
- 最終型別與受影響測試 lint／format 通過；較早完整 lint 與兩組 fresh build 通過。
  normal initial gzip 497515 bytes、scenario 100844 bytes；Pages 為 497529／100846 bytes。
  font 351860 bytes、一千六百四十三字；資料、繁體、字形、assets 與兩組 bundle 預算通過。
  Pages 靜態成品 `/private/tmp/tenka-spouse-traits-pages.w3nKWQ` 通過路徑與五組 hash 核對。
  headless 只完成三十八檔一百零七項 collection，非瀏覽器執行；沒有開新視窗或部署。
- 六份 frozen PNG hash 不變、00 文件不變、staged 空白；未 commit／push。
- 全部 CPU 作業結束後單獨計時；兩次平均 10.4496／6.8210 ms，依唯一重試通過平均門檻。
  `/tmp/tenka-spouse-traits-mean-gate.log` 保留七百二十項 samples；不丟棄首輪較慢數據。
  候選 midgame p95 仍在 day450 因 INV-02／INV-22 停止，零項 samples，不宣稱達標。
  `/tmp/tenka-spouse-traits-p95-gate.log` 保留準備階段失敗，exit 1。
- 平行合戰 audit 確認數值特性使用主將；副將仍可解鎖戰法，不疊加數值特性。
  battle、tactics 與 battleAi 的基礎加成能力值缺少 min(120, base＋growth)，待補齊較高優先序限制。
  齊射與三段擊有明確遠程傷害入口；普通鄰接攻擊沒有兵種欄位，不自訂遠程判定。
  buff 戰法威力未定義加成量、完整係數、減傷副作用、士氣與旗本傷害的縮放方式。
  軍神乘數後能力值上限也須明示對齊；不新增智略／政務攻防公式、持續時間或移動加成。

## 合戰能力與即時遠程特性（2026-10-09）

- 平行實作合戰能力、即時遠程特性與城面板鍵盤分頁；三組獨立 source review 未發現具體新缺陷。
  battleStats 先將 base＋growth 封頂，再套主將軍神乘數並再次封頂，依 00／02 的 abilityMax。
  合戰攻擊、戰法 fallback、追擊、勝敗 power 與委任判斷共用能力讀取，不寫回武將資料。
  采配只使用普通有效統率；不加軍神、副將數值、新知略／政務或防禦公式。
  06 D-12 與 07 D48 記錄上限優先序；普通有效能力與軍神 transient 值不額外取整。
- 能力 RED 有兩個實際產品差異；同份第三項失敗是 codec fixture 形狀錯誤，不算產品證據。
  `/tmp/tenka-battle-effective-stats-red-final2.log` 保留，較早 authority／遭遇 prerequisites 失敗也保留。
  `/tmp/tenka-battle-effective-stats-green-final2.log` 六十二項通過；普通與 core 型別及 scoped lint 通過。
  合法 queued marches 經實際移動遭遇後進 kassen；新增 frontier 是明示 synthetic 初始地理。
  測試涵蓋副將解鎖但不加數值、四維上限、唯讀純度、采配、AI 判斷與原生存檔續跑。
- 齊射與鐵砲三段每次傷害各套主將的遠程攻擊與遠程戰法乘數一次，合成後才取整與限制剩餘兵數。
  supplied power 不再套軍神；不把近戰乘數混入遠程，不改射擊次數、反擊、冷卻或其他 buff。
  `/tmp/tenka-ranged-tactics-red.log` 三項實際失敗；`/tmp/tenka-ranged-tactics-green.log` 四十一項通過。
  fixture 有合法出陣，但會受控安排節點與接觸；屬有效戰術 fixture，不宣稱完整行軍或全國旅程。
  含正式 battle tick 對 standalone fallback、拒絕冷卻純度與原生 codec equality。
- 城面板採 opt-in sticky TabView 與 preventScroll 鍵盤焦點；其他 TabView 原生焦點行為不變。
  深層位置恢復後分頁列仍可見；section 三 rem 留白供內容焦點，12 D41 記錄呈現決定。
  RED 一項缺少焦點參數，不宣稱已重現原生 offset 被覆寫；React batching 可能先 focus 再恢復位置。
  `/tmp/tenka-battle-traits-tab-focus-green-final.log` 二十九項通過；jsdom 不證明原生 sticky 幾何。
  scoped lint 揭露未綁定方法與多餘 assertion；改為明示 this 的型別註記，無 runtime 語意差異。
- 低金徵兵疑點未成立：目前方針切換不收費，UI 與 validator 均允許調高或調低，不新增限制。
  AI「八」是輪詢勢力數，不是每勢力指令上限；全域二百指令 cap 的剩餘工作保留於 pendingOrders。
  未發現實際 queue 丟失，不自訂 reactive cap；相關文件語意衝突仍須分別對齊。
  普通近戰掛鉤與其他 buff 戰法威力仍未完成；已提問 potency 如何縮放，沒有自造規則。
- 完整 `/tmp/tenka-battle-traits-coverage.log` 為 4052 passed、13 failed、1 skipped，220.31 秒。
  三百九十檔；core 行 94.19%、分支 90.30%、函式 97.39%；八十六檔全部八百二十二項 UI 測試通過。
  剩餘仍是缺失 witness、national ownership 與十項 frozen 差異，沒有新增非 frozen 失敗。
  計算上限與掛鉤可改變軌跡；覆蓋率通過不代表完整 suite 或全部戰法特性已完成。
  最後 test-only 型別註記與原 assertion 的 emit 語意相同；另重跑六項分頁測試與最終型別通過。
- 完整 lint／format 與普通、core 型別通過；兩組 fresh build、data、繁體、font 與 assets 驗證通過。
  normal initial gzip 497662 bytes、scenario 100846 bytes；Pages 為 497678／100847 bytes。
  font 351860 bytes、一千六百四十三字；兩組 bundle 預算通過。
  Pages 靜態成品 `/private/tmp/tenka-battle-traits-pages.And4GM` 的五個 HTML 引用與五組 hash 核對通過。
  這不是伺服器、原生瀏覽器、冷啟動或部署證明；沒有字型重生或新的 UI 字串。
- headless collection 為三十八檔一百零七項；實際 listener 再驗 IPv4／IPv6 均為 EPERM。
  `/tmp/tenka-battle-traits-listener-check.log` 保留；瀏覽器 gate 未執行，不開新視窗。
  六份 frozen PNG hash 不變、00 文件不變、staged 空白；未 commit／push／部署。
- 全部 CPU 作業終止後單獨計時；兩次平均 9.4093／6.8078 ms，依唯一重試通過平均門檻。
  `/tmp/tenka-battle-traits-mean-gate.log` 保留七百二十項 samples，沒有丟棄首輪較慢數據。
  `/tmp/tenka-battle-traits-p95-gate.log` 仍在 day450 準備階段因 INV-02／INV-22 停止，零項 samples。
  不宣稱 midgame p95 達標，不更新 frozen golden／replay 基準。

## 野戰參戰歷史與從屬接受（2026-10-09）

- 三組平行完成野戰功績、冷靜合戰閾值與從屬接受；後續再平行補普通能力上限與零兵清理。
  新遭遇保存分離的完整參戰編成；援軍與實際參戰日補記，不因潰走、部隊消失或主將更換丟失歷史。
  INV-13 驗證保留的勢力、武將與該側勢力關係；歷史部隊不必存續，武將可以死亡或轉籍。
  舊檔缺席仍為未知，不由殘存 armyIds 補造完整歷史；codec 保存欄位，格式 3 不升版。
- 普通明確勝敗且當日開始雙方皆有正兵數時，依完整歷史授獎；每名武將只用最高實際角色倍率。
  先取整主將倍率，再交 gainMerit 套野心與經驗；追擊後仍仕官且屬原參戰勢力才有資格。
  平手、外部非戰鬥關閉、空側與合戰接管不另推測野戰功績；舊檔與非戰鬥政策仍未完整驗收。
  RED 五項產品差異保留於 `/tmp/tenka-field-merit-red-final.log`；較早 fixture 錯誤不算產品證據。
  最終二十項 fieldCombatMerit 通過，含正式 advanceDay 遭遇、原生續跑與實際合戰完成後不重複授獎。
- 獨立 review 揭露零兵部隊不在 combatArmies，遭遇刪除後仍 engaged，違反 INV-13。
  使用原有全滅清理解除攻城與軍隊關係，送回存活武將；不改既有勝敗或非戰鬥功績規則。
  `/tmp/tenka-field-zero-start-red.log` 兩項失敗後，九十七項 surrounding 測試通過。
  另測正式援軍在雙方仍戰鬥時全滅：active IDs 移除、歷史保留、無結束與獎勵、原生 codec 相等。
  `/tmp/tenka-field-zero-reinforcement-focused.log` 二十項通過；不是重新定義非戰鬥閉合結果。
- 冷靜只調整實際合戰主將的潰走閾值；副將不疊加，低兵數、全滅與背水原有下限不改。
  `/tmp/tenka-battle-passive-traits-threshold-red-final.log` 一項失敗，最終七十項通過。
  每日士氣與一刻損傷懲罰、普通接觸是否等於近戰仍待決定；不自訂每刻乘數或遠近分類。
- 從屬接受落實既有主表 vassalPrestigeGap＝500，使用強勢力減弱勢力的原始威信。
  AI 評估與最終結算各自重查；玩家接受不能跳過，提案合法性仍用既有兵力比規則。
  聯盟信用六十已有 trustCostAlliance 行為，不新增同值別名；需求與 stale-gap 原生續跑均有測試。
  RED 三項失敗後，`/tmp/tenka-vassal-prestige-final.log` 三十項通過。
  BAL hash 由 b9d86bf7a402ac5d 變為 a61511070d3e21f3；新增既定常數，不回寫 frozen 基準。
- 主表六百一十一列比較五百八十七項，零值差異與主表外 key；二十四缺席含十七明示排除。
  `/tmp/tenka-field-vassal-balance-audit.json` 仍八項問題、exit 1，不宣稱 M9-1 通過。
  原測試固定五百八十六項已過期；改為實際精確計數，另注入威信差四百九十九確認可偵測值錯誤。
  `/tmp/tenka-field-vassal-balance-audit-tests.log` 三十六項通過，不把 audit 本身失敗藏起來。
- 普通野戰、追擊、攻城攻方與城主防禦使用 min(abilityMax, base＋growth)，不引入合戰軍神乘數。
  只改有效能力讀取，不改資料、RNG、普通副將特性規則或基本攻防公式；07 D51 記錄優先序。
  野戰 authentic RED 兩項差異保留，GREEN 八十四項通過；早期 codec fixture 錯誤另保留。
  城主 RED 傷亡二十九對應規格二十八；最終七項與原生續跑通過，另重跑三項與完整型別通過。
  core 型別不涵蓋測試；正常型別發現的 TraitId 註記已修正，不以 core 綠燈代替完整型別。
- 第一輪完整 `/tmp/tenka-field-vassal-coverage.log` 為 4085 passed、15 failed、1 skipped，219.98 秒。
  core 行 94.36%、分支 90.48%、函式 97.63%；兩個新失敗是過期 audit 計數與固定合戰 tick hash。
  audit 計數已依真實主表更新；固定 hash 保留，不刪參戰歷史來迎合舊快照。
  全國 day450 的亡家齋藤現仍保留四城十六郡，ownership 違例不能當作已通過或沿用較舊三城數據。
- 最終 `/tmp/tenka-field-vassal-coverage-final.log` 為 4095 passed、14 failed、1 skipped，219.12 秒。
  三百九十五檔；core 行 94.36%、分支 90.49%、函式 97.63%；全部八十六檔八百二十二項 UI 通過。
  兩個缺失 witness、全國 ownership 與十一項 frozen hash／BAL 控制仍失敗；不更新固定基準。
  完整型別與 lint／format 通過；兩組 fresh build、bundle 與 Pages 靜態引用／hash 檢查通過。
  normal initial gzip 498321 bytes、scenario 100848 bytes；Pages 為 498339／100844 bytes，font 351860 bytes。
  Pages 成品為 `/private/tmp/tenka-field-vassal-final-pages.YPkSDe`，不是遠端部署或瀏覽器證明。
- 資料零 ERROR／WARN，繁體、字型一千六百四十三字與 assets 通過，未重生字型或新增 UI 字串。
  headless collection 為三十八檔一百零七項；IPv4／IPv6 preview listener 仍為 EPERM。
  `/tmp/tenka-field-vassal-listener-check.log` 保留；沒有原生瀏覽器、GPU、冷啟動、遠端 CI 或部署通過宣稱。
  六份 frozen PNG hash 不變、00 文件不變、staged 空白；未 commit／push／部署。
- 全部 CPU 作業結束後單獨計時；兩次平均 9.5292／6.7666 ms，依唯一重試通過平均門檻。
  `/tmp/tenka-field-vassal-mean-gate.log` 保留七百二十項 measured samples；沒有捨棄較慢首輪。
  p95 在 day450 準備因 INV-02／INV-22 停止，零項 measured samples，不宣稱達標。
  `/tmp/tenka-field-vassal-p95-gate.log` 記錄四十家存活與兩千四百九十五指令，exit 1。
- 另明示 NIGHTLY_GOLDEN=1 重跑十年候選，仍在 day450 因 INV-02／INV-22 停止，exit 1。
  `/tmp/tenka-field-vassal-nightly-golden.log` 保留；沒有生成全國或 nightly 替代快照。
- 下一項確定的 M6 缺口：ProposalInbox 只顯示泛稱，採納前未提供實際命令的目標與內容。
  06 §6.1 與 11 §3.10 要求種類與內容摘要；實際產生的開發、建設、出陣、外交與調略五類皆須涵蓋。
  後續使用純 UI projection 讀 saved Command，保留舊 summaryKey、codec、採納 queue 與結算重查。
  不把預期命令描述成保證成功，也不杜撰行軍 ETA、兵種或具名執行者。
  目前只有 source audit，尚未實作或測試；Smithy／Range 掛鉤與無親族領地規則仍待明示決定。

## 具申內容與效果摘要（2026-10-09）

- 原 ProposalInbox 只顯示種類泛稱，採納前看不到實際目的地、工事與參數；違反 06 §6.1／11 §3.10。
  純 UI describeProposal 讀保存的 Command 與當前唯讀事實，分列種類徽章、意圖、角色及費用。
  開發、建設、出陣、外交與調略五類皆有正式 generate→submit→render fixture；三類調略另測完整呈現。
  不改 generator、core、BAL、原 summaryKey／summaryParams、存檔格式、採納 queue 或結算重查。
  採納只入列 resolveProposal；不是即時執行，也不保證完工、抵達、調略成功或締約。
- 建設另列實際造價與基礎工期；外交目的區分勢力信用、朝廷與幕府好感，另列目前月費。
  調略費用含一次性投入與按實際 executor 特性計算的月費；原提案的預估金額仍保留。
  角色依實際城主、領主、軍團與部隊編成，保留兼任；名稱不可取得時回退穩定 ID。
  目前十五項新測試含 mutable tick／同 ID 換局、兼任角色、特性費用、原生舊鍵與單次採納結算。
  它們是 tests/app/proposalDescription.spec.tsx；中途置於 tests/ui 的版本未收集，不算通過。
- 施設摘要覆蓋十六種型錄：七種正向文字有實際消費點，射擊場另說明政策前置，不承諾未確認的攻擊效果。
  其餘八種明示效果尚未確認；種類齊全不代表九項未完成 runtime 掛鉤已實作。
  facility16-key 測試檢查完整映射；不以規格敘述或 AI 分類當作收益證明。
  兩組平行 source review 通過；朝廷／幕府目的分支另加直接 assertion，新增套件十五項通過。
- authentic RED 一項缺少實際內容，`/tmp/tenka-proposal-description-red.log` 保留。
  focused 新十五項、既有 M6 四項及 AI administration 十四項合計三十三項通過。
  整體 lint 揭露 i18n 行寬，早期 format 警告保留，不沿用 agent 的過早通過摘要。
  Prettier 修正前後的非 trivia token SHA256 均為 498f03602af9dfb9b65c32ada96a9e1c650da41ba84ce95c23de77b5153dbb64。
  純格式更動沒有改字串或語意；正常型別與最後完整 lint 通過。
- 新字串初缺「礎」「嘗」；依正式子集腳本重生字型，最終一千六百四十九字、352744 bytes。
  `/tmp/tenka-proposal-content-font-generation.log` 與 `-font-final.log` 保留，繁體與字型檢查通過。
  normal initial gzip 499942 bytes、scenario 100844 bytes；Pages 為 499964／100843 bytes，兩組預算通過。
  Pages 成品 `/private/tmp/tenka-proposal-content-pages.Se9CFy` 的五個 HTML 引用與五組 asset hash 通過。
  它們只是靜態成品證據；不等於瀏覽器尺寸、GPU、冷啟動、遠端 CI 或部署。
- 新 source audit 補正較早「出發城未定」說法：05 §3.4.2 明定該城部隊以出發城編成。
  Smithy／Range 的時點與傷害範圍仍未定；Range 兵種分支與 02／07 的 v1 兵種退役仍須對齊。
  砦與城郭強化的耐久上限掛鉤尚未消費；custom／legacy 上限是否已含加成不能任意推測。
  砦制壓乘數另缺取整與 clamp 順序；這些是真實後續工作，不因 UI 明示未知而豁免。
- 最終 `/tmp/tenka-proposal-content-coverage.log` 為 4110 passed、14 failed、1 skipped，221.48 秒。
  三百九十六檔；core 行 94.36%、分支 90.49%、函式 97.63%；八十六檔全部八百二十二項 UI 通過。
  另有十五項新增 app 具申測試全數通過；剩餘兩個 witness、national ownership 與十一項固定比對未通過。
  本輪實際 BAL hash 仍 a61511070d3e21f3，沒有新的模擬或存檔欄位；不回寫 frozen 基準。
- 全部 CPU 作業終止後單獨計時；兩次平均 9.4678／6.8057 ms，依唯一重試通過平均門檻。
  `/tmp/tenka-proposal-content-mean-gate.log` 保留七百二十項 measured samples，包含較慢首輪。
  `/tmp/tenka-proposal-content-p95-gate.log` 在 day450 準備因 INV-02／INV-22 停止，零項 samples，exit 1。
  不宣稱 midgame p95、全國長跑或全部遊戲完成。
- headless collection 仍三十八檔一百零七項；IPv4／IPv6 listener 均為 EPERM，不是瀏覽器執行通過。
  `/tmp/tenka-proposal-content-listener-check.log` 保留；沒有開新視窗或原生 browser/GPU 證據。
  六份 frozen PNG hash、00 文件與 staged 檔案不變；未 commit／push／部署。

## 評定所外交月增益（2026-10-09）

補完 05 既定的本勢力外交工作效率 ×1.1，新增 BAL.facDiplomacyWorkGainMult。
每月依當時本勢力已落成且啟用的評定所判定；多座不疊加，不計建造佇列或敵方施設。
倍率作用於已付月費的信用、朝廷及幕府友好度增益，沿用小數累積與既有上限。
不改月費、調略、接受度或具申品質；具申效果摘要明示品質效果尚未確認。

- renderer 實作及測試、UI 獨立審查、visual gate 缺失稽核平行進行；root 整合常數及驗證。
  原始 RED 為八項失敗、六項通過；修正後六份外交測試共四十四項通過，其中新增十六項。
  logs：/tmp/tenka-hyojosho-diplomacy-red-final.log、/tmp/tenka-hyojosho-diplomacy-green-final2.log。
  第一份 RED 曾含 fixture 錯誤，原始輸出保留；有效 RED 使用 canonical 信用操作修正該 fixture。
- 測試包含合法佇列建造、每日落成、合法拆除及次月增益；所有權轉移使用明示的受控有效狀態。
  特性、官位與合法大命倍率合成；三個工作目標驗證費用、上限、欠款停止及小數延續。
  native 延續是月結子系統與曆法前進，不宣稱完整全國 campaign 已通過。
- 主表為 612 列，實作、交集及數值比較各 588 項；零主表外 key、零數值 mismatch。
  仍有二十四項缺席名稱、十七項明定排除與八項問題；完整稽核仍未通過。
  真實 BAL hash 為 f6a00abe48be8289，不回寫固定 golden／replay 或六份 PNG。
- 具申與主表測試另有五十一項通過；新增 UI 字「疊」後重生字型為 1650 字、353560 bytes。
  原始缺字及修正輸出保留於 /tmp/tenka-hyojosho-font*.log；資料、簡體字及素材驗證通過。
- 完整型別及 lint 通過；首次型別檢查碰到測試編輯中的未使用 import，原始輸出保留。
  最終輸出：/tmp/tenka-hyojosho-types-final.log、/tmp/tenka-hyojosho-lint.log。
  一般 build 通過，靜態預算為 initial gzip 500049、scenario gzip 100845、font 353560 bytes。
- headless 收集 107 條、三十八份檔案；IPv4 與 IPv6 localhost listener 皆回 EPERM。
  此收集不是瀏覽器執行、GPU、冷載入、遠端 CI 或部署證據，未開新視窗。
- 完整 coverage 為 4126 passed、14 failed、1 skipped，397 份檔案，219.71 秒。
  core 行 94.37%、分支 90.50%、函式 97.63%；全部 822 UI、十五項 app 具申及十六項評定所通過。
  仍有兩條缺失 witness、一條 national day450 ownership 及十一條固定 hash／BAL 比對失敗。
  原始完整輸出：/tmp/tenka-hyojosho-coverage.log；沒有因此宣稱全案完成。
- 正確 Pages 產物：/private/tmp/tenka-hyojosho-pages-final.7VdRd6，VITE_BASE=/tenka-fubu/。
  initial gzip 500066、scenario gzip 100845、font 353560 bytes；五項 HTML 引用與五項素材 hash 通過。
  第一份 build 誤設 BASE 而非 VITE_BASE，靜態子路徑驗證確實失敗；重建於新目錄，未隱藏原始錯誤。
- 所有 CPU 工作結束後，serial mean 為 10.129047452777778／6.742298263888888 ms。
  唯一一次重試通過，保留全部七百二十項 measured samples，不只報較快值。
  p95 在 day450 準備停止，四十家存續、2495 次套用指令、零量測樣本；INV-02／22 未解決。
  輸出：/tmp/tenka-hyojosho-mean-gate.log、/tmp/tenka-hyojosho-p95-gate.log。
- 真正啟用 NIGHTLY_GOLDEN=1 的新 run 亦在 day450 因 INV-02／22 失敗，未產生十年快照。
  輸出：/tmp/tenka-hyojosho-nightly-golden.log；固定 fixture、PNG 及 00 保持不變，未 stage／commit／push。
- campaign witness 審查未找到有規格依據的 runtime 修正；兩條缺失 witness 保留。
  最新完整 run 中，既有雙地方義道歸城與繼承案例仍通過；不刪合法低金錢保護來恢復舊軌跡。
- 下一個具體候選是馬廄的出發城部隊陸路移速加成：05 為 ×1.1，不是 ×1.2。
  不新增 v1 禁止的兵種欄位；實作時須一併核對真實移動及路徑預覽，不以文件稽核宣稱已完成。

## 忠誠有效政務與海路倍率（2026-10-09）

當主政務的忠誠貢獻原讀取基礎值，忽略 02 明定的能力成長。
改用普通有效政務並先以 abilityMax 封頂，再依既有二十點除數向下取整；最高仍為六點。
不套軍神、不改忠誠待遇、光環或月漂移，不改 BAL、存檔型別及固定基準。

- visual gate agent 實作忠誠、renderer agent 實作海路倍率、UI agent 獨立審查，root 整合驗證。
  忠誠有效政務六項新測試，原始 RED 五項失敗、一項通過；修正後三份 focused 測試共三十二項通過。
  邊界包含 59＋1、119＋1、119＋5、120＋5，驗證普通上限、純度及軍神不參與。
  真實月初 advanceDay 與 native codec 延續一致，保留狀態與亂數證據。
  logs：/tmp/tenka-loyalty-effective-stats-before.log、/tmp/tenka-loyalty-effective-stats-after.log。
- 馬廄的 +10% 與出發城歸屬明確，但規格未定出發快照或即時施設狀態，也未定出發城易主後行為。
  已向使用者提出兩種選擇；未擅加快照欄位、倍率常數、兵種或該施設效果，等待該項規則選擇。
- 海路的一般士氣與 returning／routed 加速依 04 限於陸路；此次不改海賊既有海路倍率。
  04 禁止海路特性修正，06 明定海賊加速，兩者歧異另列，未以保留既有程式宣稱規格完整。
- 海路十項新測試的有效 RED 為五項失敗、五項通過；修正後三份 military focused 共九十一項通過。
  低士氣與返回倍率相乘會抵消；另用高士氣合法 recall，獨立驗證返回的錯誤加速。
  海路編成與 recall 走合法 Command 佇列，潰走由有效受控兵損或士氣經真正 core 判定。
  驗證軍事移動子系統的前進、反向段與 native 延續，不宣稱完整每日引擎或實際觸發速度夾限。
  logs：/tmp/tenka-sea-movement-modifiers-red-final.log、/tmp/tenka-sea-movement-modifiers-green-final.log。
- 兩份 production 檔案與十六項新測試已 freeze 並通過獨立審查；normal／core 型別與 scoped lint 通過。
  BAL hash 仍為 f6a00abe48be8289；未更動固定 golden／replay、PNG、00 或存檔 schema。
- 新一般 build、資料、簡體字、字型與素材驗證通過；字型維持 1650 字、353560 bytes。
  headless 收集 107 條、三十八份檔案；新 IPv4／IPv6 localhost listener 仍皆為 EPERM。
  未開視窗，收集與本地靜態產物不代表瀏覽器執行、遠端 CI 或部署通過。
- 最新完整 coverage：4142 passed、14 failed、1 skipped，399 份檔案，222.04 秒。
  core 行 94.37%、分支 90.51%、函式 97.63%；全部 822 UI、十五項 app 具申及十六項新回歸通過。
  失敗仍為兩條缺失 witness、一條 national ownership 及十一條固定 hash／BAL 比對。
  原始輸出：/tmp/tenka-loyalty-sea-coverage.log；不因新測試通過而勾選整體 release gate。
- normal 靜態預算為 initial gzip 500053、scenario gzip 100845、font 353560 bytes。
  Pages 為 500071／100846／353560 bytes，五項 HTML 引用、五項素材 hash 及字型前綴正確。
  Pages 產物：/private/tmp/tenka-loyalty-sea-pages.A4G5Uz；產物驗證仍非瀏覽器或部署證據。
- 所有測試、build 與 agent CPU 工作結束後，serial mean 為 9.425061919444445／6.786340625 ms。
  唯一一次重試通過，原始七百二十項 measured samples 保留；未只選較快的一次。
  p95 在 day450 準備失敗，四十家存續、2494 次套用指令、零量測樣本，INV-02／22 仍未解決。
  logs：/tmp/tenka-loyalty-sea-mean-gate.log、/tmp/tenka-loyalty-sea-p95-gate.log。
- 真正啟用 NIGHTLY_GOLDEN=1 的新 run 仍在 day450 因 INV-02／22 失敗；沒有十年 snapshot。
  全國錯誤確認齋藤仍持有四城十六郡；輸出：/tmp/tenka-loyalty-sea-nightly-golden.log。
  所有程序已終止、六份 PNG hash 與 00 不變，未 stage／commit／push；目標仍為完整遊戲。
- 下一項候選是 AI 城／部隊軍力估值使用基礎統率，忽略 02 的有效能力成長。
  09 的近似公式及除數 240 必須保留，不能直接換成真實戰鬥軍力；唯讀稽核不代表已修正。

## AI 有效統率與武將成長進度（2026-10-09）

AI 的城及部隊近似軍力原讀取基礎統率，忽略 02 明定的能力成長。
改用普通有效統率並先以 abilityMax 封頂；保留近似除數 240、兵力與士氣，不套軍神。
武將詳情另補完 06 §6.1 的能力成長進度條，從既有經驗與成長欄位唯讀投影。
未滿上限顯示真正經驗；滿上限使用明示的成長完成條，不假造一百點經驗。

- renderer 實作 AI 軍力、visual gate 實作成長 UI、UI agent 獨立審查，root 整合字串與驗證。
  AI 七項新測試的有效 RED 四項失敗、三項通過；修正後五份 focused 共四十九項通過。
  邊界包括已獲成長、普通上限、軍神不參與、兵力覆寫含零、無城主與缺武將回退。
  合法佇列敵軍進入真正 computeThreatCache；native codec 與唯讀 state／RNG 結果一致。
  缺武將案例明示為不完整診斷輸入，不宣稱該輸入是合法 campaign。
  logs：/tmp/tenka-ai-effective-power-red-final.log、/tmp/tenka-ai-effective-power-green-final.log。
- 成長 UI 兩項新測試的有效 RED 兩項失敗；修正後三份相關 UI 共十七項通過。
  四維基礎、成長與經驗分離投影，保留普通有效能力尺；可讀名稱及進度值使用既有 ProgressBar。
  覆蓋零經驗、九十九點、已達上限且零經驗、真正 gainMerit 升點、同物件 tick 更新及換局。
  完整狀態、亂數與命令佇列未因呈現而更動；不是完整每日引擎或瀏覽器證據。
  logs：/tmp/tenka-officer-growth-progress-before.log、/tmp/tenka-officer-growth-progress-final.log。
- production 與測試已 freeze 並通過獨立審查；author normal／core 型別、scoped lint 與格式通過。
  root 新增四個既定介面文字鍵；原始字型缺「驗」後重生為 1651 字、353660 bytes。
  原始缺字與重生輸出保留於 /tmp/tenka-ai-growth-font*.log；資料、簡體字及素材驗證通過。
  BAL hash 維持 f6a00abe48be8289，不新增模擬常數、存檔型別、訓練指令或固定 fixture。
- headless 收集 107 條、三十八份檔案；新 IPv4／IPv6 localhost listener 仍皆為 EPERM。
  未開新視窗，收集與靜態產物不代表原生瀏覽器、GPU、遠端 CI 或部署通過。
- 完整 coverage 為 4151 passed、14 failed、1 skipped，401 份檔案，219.31 秒。
  core 行 94.37%、分支 90.54%、函式 97.63%；全部 822 項 UI 與九項新測試通過。
  兩項 trajectory witness、十一項固定 hash／BAL controls 及 day450 national ownership 仍失敗。
  齋藤已滅亡但仍持四城十六郡；原始輸出：/tmp/tenka-ai-growth-coverage.log。
- root normal／core 型別、完整 lint、normal 與 Pages build 通過。
  normal initial／scenario gzip 為 500387／100847 bytes；Pages 為 500405／100844 bytes。
  字型 353660 bytes；兩份 bundle budget 及 Pages base、五項 HTML 引用與五項素材 hash 檢查通過。
  Pages 產物：/private/tmp/tenka-ai-growth-pages.6XfYyB；靜態檢查不替代瀏覽器或部署。
- 所有測試、build 與 agent CPU 工作結束後，serial mean 為 9.482821758333333／6.619813427777777 ms。
  唯一重試通過本機平均門檻；七百二十項 measured samples 完整保留。
  原始輸出：/tmp/tenka-ai-growth-mean-gate.log。
- p95 準備在 day450 ownership 違例停止：四十勢力存活、2494 項命令已套用，零項量測。
  NIGHTLY_GOLDEN=1 的真正啟用長跑亦於 day450 重現四城十六郡的 INV-02／INV-22。
  logs：/tmp/tenka-ai-growth-p95-gate.log、/tmp/tenka-ai-growth-nightly-golden.log。
  未重生 golden、replay、六份策略圖或調整容差；整體 release gate 與 M6 marker 未推進。
- 追加唯讀主表稽核確認 612 列、588 項值比較、零孤立 key、零值差異，仍有八項問題。
  README 過期的 611／587 計數改為當前結果；不更改常數或稽核放行條件。
  原始失敗輸出：/tmp/tenka-ai-growth-balance-audit.json。

## 武將一覽忠誠文字（2026-10-09）

依 06 §6.1 補齊忠誠文字顏色：低於三十為朱紅，三十至四十九為可讀黃金色。
只套用忠誠數值，不改其他欄位；原有低忠誠整列底色及風險提示保留。
visual gate 實作、renderer 獨立審查；普通能力、核心規則與 BAL 均未更動。

- 有效 RED 四項失敗、十項通過；修正後含刷新案例共十五項通過。
  邊界二十九／三十／四十九／五十、同物件 tick 更新及同 ID 換局皆驗證。
  其他欄位無文字顏色 class；完整 GameState、亂數與命令佇列未因呈現而更動。
  stylesheet 使用既有朱紅及黃金文字 token；DOM 與 CSS 契約不等於原生 computed-color 證據。
  logs：/tmp/tenka-loyalty-text-before.log、/tmp/tenka-loyalty-text-final.log。
- 初次 typecheck 發現測試的 CSS module class 型別可為 undefined，原始失敗保留。
  修正測試型別後 normal／core typecheck、scoped lint、格式及 diff 檢查通過。
  log：/tmp/tenka-loyalty-text-types-final.log；source 與測試 freeze，作者 CPU 工作已結束。
- 本段是 AI／成長完整快照後的追加修正，不把十五項 focused 測試當作全套重新通過。
  06 明定的功績及特性欄仍待完成；下一組實作與獨立審查已平行展開。
  原有排序、篩選、虛擬捲動及點列行為不因文字顏色改變；未開新視窗。

## 武將一覽欄位、協定標示與同盟別名（2026-10-09）

兩組 author 平行補齊明定 UI，renderer 獨立審查，root 對齊文件及驗證。
武將一覽依 06 §6.1 補入真正功績與特性名稱；外交清單及詳情依 11 §3.8 補協定標示。
所有呈現使用既有唯讀投影，不增加指令、核心常數、存檔欄位或亂數消費。

- 武將欄位有效 RED 兩項失敗、十五項通過；最終含成長介面共二十項通過。
  功績九／一百排序按數值，預設身分／功績／ID 次序不變；特性按保存順序本地化並分離投影。
  空特性明示無資料、未知舊 ID 保留原值；完整名稱提示與單行省略不改四十像素列高。
  tick／同 ID 換局刷新及完整 state／RNG／queue 純度通過；不是原生 layout 或 ellipsis 證據。
  logs：/tmp/tenka-officer-list-content-before.log、/tmp/tenka-officer-list-content-final.log。
  第一版 GREEN 的 disabled header 測試誤判另行保留，不計作有效產品缺陷。
- 協定標示有效 RED 九項全失敗；最終九項新案例與六項相關測試共十五項通過。
  同盟為既有 handshake Icon；婚姻／停戰／從屬為婚／休／從 Badge，皆有完整繁中可讀名稱。
  玩家作 canonical row 的 a／b 端、無協定、四種協定、tick 移除及換局刷新皆驗證。
  原永久婚姻、從屬方向及行動仍保留，無巢狀 button；完整狀態、亂數及佇列不因呈現更動。
- 協定有效 fixture 經不變量檢查；早期非法交換 row 的失敗另保留，不當作有效 RED。
  logs：/tmp/tenka-pact-indicators-red-valid.log、/tmp/tenka-pact-indicators-green-final.log。
  此為已簽協定 fixture 的 DOM 呈現，不宣稱真正外交協商旅程或原生瀏覽器通過。
- author normal／core 型別、scoped lint 與格式通過；兩組 source freeze、CPU 工作已結束。
  使用既有介面鍵及字型字形；不重生字型、六份策略圖、golden 或 replay。
  root 依 06 高優先序回寫 11 欄位與 D41，未修改 00。
- 同盟提案及成立共用 trustCostAlliance＝60；15 的 allianceTrustMin 為重複的舊測試名。
  依 08 的信用至少達成本規則及既有裁決，保留歷史列並標廢除；17 DP2 改引用真正常數。
  audit 有效 RED 兩項失敗、四十五項通過；修正後含真正佇列五十九／六十點共四十七項通過。
  重加舊 key 必報 excluded-implemented；將 canonical 值改五十九必報 value-mismatch。
- 更新後主表仍 612 列、588 項值比較、二十四個缺席名及零值差異；十八項明示排除、七項問題未解。
  runtime 與 BAL hash 不變；整體 audit 仍 exit1，不將重複名對齊視為全部平衡過關。
  logs：/tmp/tenka-alliance-alias-before.log、/tmp/tenka-alliance-alias-after.log、/tmp/tenka-alliance-alias-audit.json。
- 整合後 root normal／core 型別、完整 lint、資料、簡體字、素材及字型檢查通過。
  normal 與 Pages build、兩份 bundle budget 及 Pages 靜態素材檢查通過。
  normal initial／scenario gzip 為 500805／100846 bytes；Pages 為 500830／100842 bytes。
  字型仍 353660 bytes；Pages 正確 base、五項 HTML 引用及五項素材 hash 均符合。
  Pages 產物：/private/tmp/tenka-officer-pacts-pages.W6ruym；不是伺服器、瀏覽器或部署證據。
- 最終完整 coverage：4170 passed、14 failed、1 skipped，402 份檔案，221.39 秒。
  core 行 94.37%、分支 90.55%、函式 97.63%；全部 831 項 UI／八十六份檔案通過。
  新武將欄位、協定標示及別名 audit 均通過；兩項 witness、national ownership 及十一項固定 controls 仍失敗。
  原始輸出：/tmp/tenka-officer-pacts-coverage.log；不弱化不變量、基準或完整驗收條件。
- 所有 build、測試與 agent CPU 工作結束後，serial mean 為 9.445204744444444／6.718599769444444 ms。
  唯一重試通過本機平均門檻；兩次各六十 warmup／三百六十 measured，七百二十原始樣本完整保留。
  原始輸出：/tmp/tenka-officer-pacts-mean-gate.log；不以單一成功樣本替代完整記錄。
- 最終 p95 準備在 day450 ownership 違例停止：四十勢力存活、2494 項命令已套用，零項量測。
  NIGHTLY_GOLDEN=1 的真正啟用長跑亦於 day450 重現四城十六郡的 INV-02／INV-22，exit1。
  logs：/tmp/tenka-officer-pacts-p95-gate.log、/tmp/tenka-officer-pacts-nightly-golden.log。
  BAL hash 實測仍 f6a00abe48be8289；不更新 fixed fixtures、00、milestone、staged files 或部署。
- 追加 headless Firefox 環境檢查：Playwright 預期的 cached executable 不存在，未嘗試啟動。
  不下載、不安裝、不提權，也未配置 browser handle 或開新視窗；不是遊戲測試通過。
  原始證據：/tmp/tenka-headless-firefox-check.log；既有 listener／Chromium sandbox 邊界仍在。
- 已再向使用者詢問無合格繼承人且非征服情境的領地受領者；此規則仍未獲指定。
  不以隨機鄰國、無主領地或保留已滅亡 owner 推定答案，未改 national invariant 或 frozen fixtures。
- 下一組唯讀稽核確認 06 §6.1 尚缺年內賞賜次數呈現；canonical rewardGiftsThisYear 已由核心追蹤。
  既有三檔褒賞與升級驗證已實作；忠誠九十九時預覽仍顯原始增益，而真正結算只能增加一點。
  年次數及實得增益可從既有事實唯讀補齊；本輪未修改 reward controls，不虛構每月已支出帳本。
  save／settings 的本輪有限稽核沒有確認新缺漏；不是整份 16 或原生瀏覽器驗收證明。

## 褒賞年次數與實得增益（2026-10-09）

OfficerActions 顯示真正 rewardGiftsThisYear，三檔預覽改為目前忠誠封頂後的實得增益。
忠誠九十九時三檔最多增加一點，滿一百時顯示零；不改原始遞減公式、費用或允許賞賜的規則。
analysis UI 實作、renderer 獨立審查、visual gate 稽核完整褒賞介面，root 整合字串、字型與驗證。

- 有效 RED 六項失敗；首版錯誤 import 另保留，不計作產品 RED。
  六項新 app 測試與十八項 OfficerList、四項 M6 panel 共二十八項通過。
  年次數零／二、遞減倍率、九十九／一百封頂、mutable tick、同 ID 換局與不同 officer prop 皆驗證。
  真正合法佇列賞賜經 runOneDay 後，次數一、忠誠一百、日曆推進且不變量通過。
  呈現及暫停佇列的完整 state／RNG 純度通過；核心每日結算不宣稱亂數恆不變。
  logs：/tmp/tenka-reward-presentation-red-valid.log、/tmp/tenka-reward-presentation-green-final.log。
- 原俘虜、浪人及非玩家分支未改；滿忠誠預覽零不新增禁止賞賜規則或靜默改費用。
  年次數與增益為分離的唯讀投影；不修改 M6 model、core、BAL、存檔型別或命令實作。
  author normal／core 型別、scoped lint、格式通過，source freeze 且 CPU 工作已結束。
- root 新增一個既有介面文字鍵；字型重生為同樣 1651 字、353660 bytes，既有字形已足夠。
  字型涵蓋、完整 lint 及 normal build 通過；全部 UI／app 為 1320 passed、141 份檔案、57.75 秒。
  原始輸出：/tmp/tenka-reward-presentation-ui-app.log；不是完整 core suite、原生瀏覽器或全遊戲通過。
  最近完整 suite 仍為前輪 4170／14／1 快照；本輪沒有修改核心規則，不回寫 fixed fixtures。
- normal 與 Pages build、兩份 bundle budget 及 Pages 靜態素材檢查通過。
  normal initial／scenario gzip 為 500882／100848 bytes；Pages 為 500900／100846 bytes。
  字型仍 353660 bytes；正確 Pages base、五項 HTML 引用及五項素材 hash 均符合。
  Pages 產物：/private/tmp/tenka-reward-presentation-pages.0xZv87；此為靜態產物，不替代伺服器或瀏覽器。
  資料、簡體字、素材驗證及 prose 檢查通過；不修改六份策略圖、00、staged files 或 milestone。
- 06 §6.1 的每月已支出總額無法由舊存檔可靠還原；年次數、當前金庫與 transient command log 均不足。
  完整介面下一步可採 required Clan.rewardGoldSpentThisMonth:number|null：新局零、舊格式遷移未知。
  成功褒賞累加真正扣款，未知仍未知；Step2 月初後全部勢力重置零，Step1 月末扣款歸舊月。
  此是尚未實作的資料模型設計，不是新遊戲規則或現成帳本；需要 format4 遷移、constructor 與嚴格檢查。
  既有忠誠排序可重用於獨立褒賞入口；月初通知導航仍需保持 FIFO 暫停所有權，不改普通家臣團預設排序。
  不改 frozen 舊存檔或隱藏 schema 對 canonical hash 的真正影響；無親族領地受領者仍待使用者指定。

## 褒賞月支出與格式四（2026-10-09）

- 三組代理平行完成指令與月首結算、存檔遷移，以及獨立唯讀審查；root 處理 state、INV 與 constructor。
  Clan.rewardGoldSpentThisMonth 必填，接受 null 或非負安全整數。新局零，舊 v1／v2／v3 遷移至 v4 為 null。
  成功賞賜累加真正扣款；未知保持未知，排隊及失敗不計入。Step 1 月底賞賜歸舊月，Step 2 月首全部歸零。
  審查補上 deferred 月首事件不得觸發當月重置的回歸；只有本次 timeSystem 發出的月首有效。
- verified-refactor checker 先建立並驗證，constructor 缺失從 11 降至 6，再至零。
  零後的記憶體注入仍抓到缺失；型別檢查另涵蓋非完整 literal 的建置路徑。
  checker：/tmp/tenka-reward-accounting-constructor-check.mjs；不修改 frozen JSON、六份策略圖或 00。
- 狀態相關 74 項、指令相關 61 項、存檔相關 126 項通過；三組有重疊，不相加稱為獨立測試總數。
  原始輸出：/tmp/tenka-monthly-reward-state-tests.log、/tmp/tenka-reward-presentation-monthly-green-frozen.log。
  存檔輸出：/tmp/tenka-reward-save-v4-final.log；原生回存及舊檔 additive null 期望均驗證。
  所有失敗嘗試保留，包括改正 TimeState.season 與 Violation.code 測試錯誤前的紀錄。
- 完整 typecheck、lint、normal build、資料與字型涵蓋通過；bundle initial／scenario gzip 為 501071／100844 bytes。
  字型為 353660 bytes；headless Chromium 再次於頁面建立前遭 MachPort Permission denied，沒有開啟視窗。
  瀏覽器原始輸出：/tmp/tenka-monthly-reward-headless-browser.log；這不是原生互動驗收通過。
- 完整褒賞介面仍未完成；下一批為獨立忠誠升冪 roster、月總額呈現、三檔賞賜、晉升與知行跳轉。
  月初通知入口須先加入既有 modal FIFO，再確認摘要；知行分頁保持相同暫停所有權。
  不改普通 OfficerList 預設排序，不過早恢復時間；無親族領地受領者仍待使用者指定。
- 最新完整 suite：4200 passed、14 failed、1 skipped，405 份檔案，172.99 秒。
  原始輸出：/tmp/tenka-monthly-reward-full-tests.log；不是 coverage 重跑，不替代前輪覆蓋率快照。
  仍是兩個軌跡 witness、day450 ownership 與十一個 frozen hash／BAL／replay 失敗，不修改 reference。
- 所有功能與 build jobs 結束後，serial mean 的兩次合法嘗試為 10.797467244444444／10.80183831111111 ms。
  兩次皆失敗於 8 ms 門檻；各保留 360 個樣本，沒有再試到通過，也沒有宣稱新欄位造成效能變化。
  原始輸出：/tmp/tenka-monthly-reward-mean-gate.log；p95 day450 準備仍失敗，零樣本。
  p95 輸出：/tmp/tenka-monthly-reward-p95-gate.log；Pages build 與 budget 通過，不是部署或瀏覽器驗收。
  Pages 產物：/private/tmp/tenka-monthly-reward-pages.2xU4gW；initial／scenario gzip 為 501093／100847 bytes。
- 真正啟用 NIGHTLY_GOLDEN=1 後仍於 day450 因 INV-02／INV-22 失敗，沒有產生十年 national snapshot。
  原始輸出：/tmp/tenka-monthly-reward-nightly.log；全遊戲與 M7–M9 完成條件仍未達成，goal 保持 active。

## 褒賞名單、知行導航與月初入口（2026-10-09）

- 三組代理平行完成 RewardRoster、RewardFiefPane 及獨立唯讀審查；root 接線 Main、modal、通知與字串。
  名單依忠誠升冪、功績降冪及 ID 升冪；頂部顯示實際月總額或舊檔未知，各列顯示年次數及三檔封頂增益。
  賞賜、推舉及知行都走既有中央驗證與指令佇列；合法推舉及賞賜均有真正 normal tick 驗證。
  普通家臣團排序與篩選不變；六百名有效武將測試只證明四十像素基準的 DOM 視窗，不證明原生尺寸。
- 加封頁另列身分、普通有效政務、忠誠及知行數／BAL 上限；郡選項顯示當前領主或已知直轄。
  更換領主先警告原領主忠誠損失；取消純讀、確認只入列一次，normal tick 套用既有 BAL 懲罰。
  同步改領主、換局、選將、返回或卸載會撤銷舊確認；真正提交再查實際原領主 ID，不沿用過期同意。
  grantFief 的 officerBusy 回應補實際 name 參數，消除提示中的未替換文字，不改資格或計算。
- 月首摘要先加入褒賞 FIFO，再確認摘要；原使者、具申及其他對話框仍保持順序。
  非暫停 toast 使用同一月流程的中斷鎖，不依賴普通 modal 的暫時速度欄位。
  使用者手動暫停、視窗尺寸、錯誤、標題及換局均不恢復舊速度，問題解除後亦不恢復。
  Main 的真正月首 → 褒賞 → 加封 → 返回 → 關閉，以及非暫停 toast 的鍵盤入口均通過。
- 作者測試含七項 roster、十項 fief 及三項提示；root 新增十六項月流程、三項 Main 與一項摘要入口測試。
  最後全部 UI／app 為 1360 passed、145 份檔案、61.00 秒：/tmp/tenka-reward-ui-app-final.log。
  初始 RED、過期同意及 toast 中斷 RED 均保留；部分測試定位錯誤與 lint 失敗也保留，不當作程式缺陷。
  原始紀錄包含 /tmp/tenka-reward-navigation-toast-interruption-red.log 與 /tmp/tenka-reward-main-monthly-integration.log。
- 完整 coverage 快照早於最後五項知行確認測試：4235 passed、14 failed、1 skipped，409 份檔案，225.24 秒。
  core 行 94.40%、分支 90.71%、函式 97.64%；/tmp/tenka-reward-ui-coverage.log 保留原始失敗與報告。
  兩個軌跡 witness、day450 ownership 及十一個 frozen hash／BAL／replay 仍失敗，不相加局部數字宣稱完整通過。
  沒有重跑硬體計時；上輪兩次 mean 失敗及 p95／nightly day450 失敗仍是未通過門檻。
- 完整 typecheck、lint、normal／Pages build、資料、簡體字、字型與素材檢查通過。
  字型重生為 1652 字、353844 bytes；normal initial／scenario gzip 為 503403／100843 bytes。
  Pages 為 503419／100844 bytes；/private/tmp/tenka-reward-ui-pages.vAcx6U 保存產物。
  五項 prefixed HTML 引用與五項複製素材 hash 通過：/tmp/tenka-reward-ui-pages-static.log。
- 新增兩項原生褒賞導航測試，全部 Playwright 收集為 109 項／38 檔；收集不是執行通過。
  真正 headless 執行在 preview startup 因 ::1:4173 listen EPERM 中止，沒有建立 page 或開啟視窗。
  原始紀錄：/tmp/tenka-reward-ui-headless.log；瀏覽器、原生幾何、GPU、完整旅程與部署仍未證明。
  六份策略圖、00、frozen 存檔／golden／replay、staged files 及 milestone 均未由本輪修改。
- 此輪補齊 06 褒賞入口的程式與功能測試，不宣告全遊戲或完整 05 國內介面完成。
  下一步審計其他知行指派入口的二次確認與內容一致性；無親族領地受領者仍待使用者決定。

## 知行確認入口與兵糧 HUD（2026-10-09）

- 三組代理平行完成武將詳情、郡面板及獨立審查；root 接線字串、既有測試與兵糧預測。
  三個知行入口均提示實際原領主的罷免懲罰；取消不改 state、RNG 或指令佇列。
  同郡待執行任命阻止再次送出，避免後續指令罷免未經確認的中間領主。
  郡候選顯示身分、一般有效政務、忠誠及知行數／BAL 上限；不符資格保留且顯示原因。
  改封、罷免及無原領主任命均走原有中央驗證與正常日結算，不樂觀更新領主。
- 新增十項武將確認及十五項郡確認測試；與十項褒賞知行、七項既有國內面板測試合跑共四十二項通過。
  原始紀錄：/tmp/tenka-standard-fief-integration.log；兩位作者的真正 RED 與後續失敗紀錄均保留。
  郡測試涵蓋換局、換郡、關閉、卸載、實際領主改變、畫面限制與回呼重入；舊同意不能再送出。
- 兵糧 HUD 直接使用既有 selectBudgetForecast.foodMonthsLeft；零至兩月顯示警告色。
  Infinity 顯示目前無消耗，其他非有限值顯示未知；既有存量與鍵盤可達明細保留。
  不新增公式、BAL 或存檔欄位；root 先取得 Main 缺少月數顯示的 RED：一項失敗、四十八項通過。
  紀錄：/tmp/tenka-food-hud-main-before.log；元件先 RED 六項失敗，再 GREEN 十項通過。
  原始紀錄：/tmp/tenka-food-coverage-red.log、/tmp/tenka-food-coverage-green.log。
- 最後全部 UI／app 為 1392 passed、147 份檔案、58.57 秒：/tmp/tenka-fief-food-all-ui-app-final.log。
  Main 為四十九項通過：/tmp/tenka-food-hud-main-green.log；原先 getByText 無法匹配含 strong 的月數。
  第一輪合跑保留一項定位失敗／1391 通過；改用實際 aria-label 後重跑完整 UI／app，未弱化內容斷言。
- 正常／core typecheck 及完整 lint 通過；初始並行讀到測試編輯中及 strict 型別錯誤的輸出仍保留。
  最後紀錄：/tmp/tenka-fief-food-typecheck-final.log、/tmp/tenka-fief-food-lint-final.log。
  normal initial／scenario gzip 為 504703／100845 bytes；1652 字元字型維持 353844 bytes。
- Pages 為 504720／100847 bytes；產物在 /private/tmp/tenka-fief-food-pages.X5sqCY。
  五項 prefixed HTML 引用及五項複製素材 hash 通過：/tmp/tenka-fief-food-pages-static.log。
  最初 budget 誤用 --dist 參數的失敗保留；改用工具定義的目錄位置參數後通過。
- 資料、簡體字、字型及素材均通過；不把前輪 coverage 當作本輪完整 suite。
  十四項完整套件失敗及硬體計時失敗仍未解除；沒有修改六份凍結策略圖、00 或 frozen JSON。
  全部 Playwright 收集為 109 項／38 檔；實際 headless 仍在 preview listen EPERM 停止，沒有建立 page。
  紀錄：/tmp/tenka-fief-food-playwright-list.log、/tmp/tenka-fief-food-headless.log；收集不代表測試通過。
  原生尺寸、瀏覽器、GPU、完整旅程及部署仍未證明；所有瀏覽器測試維持 headless，不開新視窗。
- 下一個明定介面缺口為 06 §6.1 的城內在野武將登用入口；現有全域登用與成功率／費用管線可沿用。
  無親族滅亡的領地受領者仍待使用者決定；全遊戲與 M7–M9 的完成條件仍未達成。

## 城下在野武將登用（2026-10-09）

- 三組代理平行完成城下入口、登用流程與唯讀審查；root 接線 Main、字串與整合測試。
  城面板內政分頁可開啟本城在野名單，只列成年浪人；省略城範圍仍保留全域浪人／捕虜入口。
  已知空名單、缺少城及失去所有權分開顯示；確切面板的關閉操作不因失去城而卡住。
  持有過期回呼、換局、位置／資格／執行者改變、卸載及開啟對話框均不能背景導航或提交。
- 成功率直接讀既有執行者預測；禮金為每次嘗試費，支度金只在成功時另付。
  冷卻沿用中央驗證器，不新增條件；同目標待執行時阻止重複送出，下一日才扣款及判定成敗。
  忙碌原因補實際執行者姓名；這一項 core 回應參數修正不改計算、資格、RNG 或保存欄位。
  作者保留真正 RED，另取得 FIFO／原生對話框回呼兩項 RED 後修正。
- 最後完整 UI／app 為 1431 passed、150 份檔案、61.50 秒：/tmp/tenka-castle-recruit-all-ui-app.log。
  新測試為十四項城入口、二十二項流程、一項忙碌回應及兩項 Main；四組整合共八十八項通過。
  整合紀錄：/tmp/tenka-castle-recruit-integration-final.log；Entry 的起始 fixture 另明示 validateState 零違例。
  五組 core 回歸四十七項通過，包含真正二十四月生命週期：/tmp/tenka-castle-recruit-core-regression.log。
  不把局部 core 與 UI 數字相加稱為新的完整 suite；舊十四項完整套件失敗仍未解除。
- 初始 Main 兩項失敗／四十九項通過，另抓到城入口誤讀 flags.gameOver 的真正 runtime 錯誤。
  修正為 meta.gameOver；最後 Main 五十一項通過：/tmp/tenka-castle-recruit-main-green.log。
  忙碌回應第一個準備方法使出陣者離城而收到 invalidTarget，不能作為缺少 name 的 RED 證據。
  改用實際合法流言工作並驗證 INV 後，RED 明示忙碌回應缺 name，再 GREEN 一項通過。
  紀錄：/tmp/tenka-recruit-feedback-red-valid.log、/tmp/tenka-recruit-feedback-green.log；原失敗均保留。
- 正常／core typecheck、完整 lint、production build、bundle、資料、字型與素材檢查通過。
  initial／scenario gzip 為 505778／100842 bytes；字型為 1653 字元、354108 bytes。
  初始 exactOptionalPropertyTypes、測試非空斷言及作者準備錯誤紀錄保留；最後未弱化驗證。
  新增真正 headless 原生城下名單測試；全部 Playwright 收集為 110 項／39 檔，不代表執行通過。
  實際執行仍於 preview listen EPERM 中止，沒有建立 page：/tmp/tenka-castle-recruit-headless.log。
- Pages build 與 budget 通過，initial／scenario gzip 為 505803／100845 bytes。
  產物在 /private/tmp/tenka-castle-recruit-pages.3GgwCv；五項 prefixed 引用及五項複製素材 hash 通過。
  原始紀錄：/tmp/tenka-castle-recruit-pages-static.log；這不是瀏覽器、部署或遠端 CI 證明。
- 全遊戲仍未完成；沒有更新 00、frozen JSON、六份策略圖或里程碑，也沒有發布或部署。
  下一步調查 serial mean 的 pathfinding 候選：評定輸送先跳過沒有整數餘糧、原本必定不出單的捐助城。
  必須先證明 state、事件、意圖及逐日 hash 等價，再隔離執行 profile／計時；目前沒有量測收益。
  舊 10.797／10.802 ms 與 day450 ownership 失敗仍是未通過的 release gate，領地受領者仍待使用者決定。

## 評定輸送捐助城剪枝（2026-10-09）

- 三組代理平行完成最小實作、獨立舊版參考與唯讀審查；root 保留真正改動前逐日基準。
  每個目的城尋路前，先以當下本地 food Map 排除沒有整數餘糧的捐助城。
  這些城原本必定不出輸送指令；不依 pending sink shadow 篩選仍有餘糧的城。
  每個目的城重新判定，不改路徑排序、權限、失敗意圖、RNG 或 BAL。
- 五項尋路次數測試先取得真正 RED（三項失敗、兩項通過），改動後五項通過。
  紀錄：/tmp/tenka-council-donor-pruning-red-confirmed.log、/tmp/tenka-council-donor-pruning-green.log。
  0.5 餘糧案例明示為非法算術邊界探針，不當作合法遊戲狀態。
  初始準備錯誤的原始紀錄保留；沒有調整 frozen JSON 或 gate 取得通過。
- 獨立參考保留改動前完整 council 實作；只改 import 路徑及匯出函式名稱。
  五項完整函式 parity 通過，涵蓋藩／城／軍團權限、兩階段拒絕、耗盡及 pending 貨物。
  實際委任城可使用外部直轄捐助城；改編軍團後則排除，兩者均與舊版一致。
  比較包含 canonical／shadow state、指令、檢查次序、意圖與 RNG。
  紀錄：/tmp/tenka-council-donor-parity-after.log；獨立審查通過，作者 CPU 工作均結束。
- 實際九區 all-AI／事件引擎 seed 15600519 的 420 日完整軌跡精確相同。
  每日立即複製紀錄，逐日 hash、事件、2293 個已套用指令、意圖、pending 及終態一致。
  每日 INV 零違例、零 command.rejected／error.invalidCommand；終態 hash 為 7d65df459b151e72。
  BAL hash 維持 f6a00abe48be8289；紀錄：/tmp/tenka-council-after-420.log。
  改動前證據為 /tmp/tenka-council-before-420-detached.json，不是新的凍結 repository baseline。
  原始末尾才複製的 capture 也保留；正式比較使用立即複製版本，避免後續參照變動。
- 本段只證明這個尋路剪枝及軌跡等價；全遊戲、瀏覽器、長跑與硬體 gate 仍未完成。
  計時只在全部 CPU 工作結束後執行；不能把功能測試或逐日 hash 比較當作效能量測。
- 最新完整 core project 為 2890 passed、14 failed、1 skipped；266 檔，116.26 秒。
  紀錄：/tmp/tenka-council-core-full.log；這不是包括 UI／app 的完整 npm test 或新的 coverage。
  十四項仍為既有 frozen hash／BAL／replay、必要軌跡證據與 day450 ownership 失敗。
  Typecheck、完整 lint、production build 及 bundle 通過；initial／scenario gzip 為 505781／100843 bytes。
  字型維持 354108 bytes；bundle 的 tsx CLI 因 IPC EPERM 失敗，改用 node --import tsx 通過。
- 所有功能 CPU 工作終止後，原封不動執行 npm run test:perf，按既有單次 retry 規則通過。
  第一次 9.41128483888889 ms 超過 8 ms；第二次 6.667171294444445 ms 通過。
  兩次各 360 項樣本完整保留：/tmp/tenka-council-mean-gate.log；沒有追加嘗試或 CI 倍率。
  這是目前本機 mean gate 結果，不是精確因果 speedup、p95、瀏覽器 FPS 或 release 證明。
  沒有更新 00、六份策略圖、frozen JSON、BAL、里程碑或 acceptance checkbox。
- 當前核心另隔離重跑候選 p95；checkpoint 準備仍在 day450 因 INV-02／INV-22 中止。
  當時四十勢力存活、2494 個指令已套用；零項時間樣本，沒有 p95 值或再次嘗試。
  紀錄：/tmp/tenka-council-p95-gate.log；無親族滅亡的領地受領者仍待使用者決定。
  下一個純效能候選為解圍 localMarches 與 planMarchFromCastle 的相同 boundedTravelDays 重複查詢。
  此候選只經唯讀來源審查，尚未改動、建立 RED、驗證等價或量測收益。

## 捕虜情報與同意所有權（2026-10-09）

- 三組代理平行完成捕虜情報、處置所有權及唯讀審查；root 補 Main 真正 modal host 整合與字串。
  情報列出四項普通能力、身分、原屬勢力、對舊主忠誠及特性說明，不新增遊戲規則。
  能力只讀基礎加成長後封頂；不把軍神的合戰能力加成放入普通值。
  原屬勢力可讀已滅亡勢力的保留名稱；缺少 ID 及 null 回退是診斷，不豁免核心 INV。
  特性沿用既有說明與 Tooltip，鍵盤可聚焦；按鈕以 max(32px, 2rem) 保留縮放下的最低尺寸。
- 情報作者先對真實 CaptiveModal 取得缺少原屬勢力的 RED；最後六項情報與六項特性相容測試通過。
  紀錄：/tmp/tenka-captive-summary-red.log、/tmp/tenka-captive-summary-hitbox-green.log。
  Fixture 為 INV 合法的受控捕虜及滅亡勢力狀態，不冒稱實際全國捕獲旅程。
  經審查修正 span 觸發器與 2rem 在小縮放下不足三十二像素的問題；原生尺寸仍未證明。
- 三項處置只入列，仍在下一正常日依既有 core 結算；招降支度金只在成功時扣除，沒有浪人禮金。
  回呼綁定遊戲、實際武將物件、確切 FIFO modal 及掛載所有權，防止換局／換人後處斬或關錯視窗。
  指令埠返回後重查所有權，不把 queued 標記或 close 發給接替的遊戲／對話框。
  首輪所有權 RED 為九項失敗、一項通過：/tmp/tenka-captive-consent-red.log。
- 獨立審查再取得原生堆疊四項 RED：/tmp/tenka-captive-native-owner-red.log。
  改由 CaptiveModal 持有處斬確認；招降／釋放只接受捕虜框頂層，處斬只接受自有確認頂層。
  取消撤銷同意，普通 tick 不丟失有效確認；中央 disabled 原因及自有錯誤 alert 保留可及性。
  三種指令埠測試以真正 flushSync 先掛入新原生對話框再返回，證明舊回呼不標記或關閉它。
  作者早期事件 batching 未先掛入新框的測試失敗保留；修正測試後三十一項通過。
  最後紀錄：/tmp/tenka-captive-native-owner-final.log；沒有改共用 CommandAction、Dialog 或 core。
- Main 的情報／釋放及取消／處斬兩條流程使用實際 host、佇列及下一日結算；最後 Main 五十三項通過。
  初始 openModal 方法誤用的原始失敗保留，不作為 RED；改用既有 enqueueModal 後取得真正缺情報 RED。
  紀錄：/tmp/tenka-captive-main-before.log、/tmp/tenka-captive-main-red.log、/tmp/tenka-captive-main-final.log。
- 最後完整 UI／app 為 1470 passed、152 檔、61.65 秒：/tmp/tenka-captive-all-ui-app.log。
  四組 core 回歸四十二項通過，含實際二十四月生命週期：/tmp/tenka-captive-core-regression.log。
  三組最終整合九十項通過：/tmp/tenka-captive-integration-final.log；初始 lint 兩處 act 回傳值已修正。
  不把局部 core 或 UI 數字合併稱為新的完整 suite；前輪十四項失敗仍是 release blocker。
- Typecheck、完整 lint、production build、資料、簡體字、字型及素材檢查通過；字型維持 1653 字元、354108 bytes。
  最後紀錄：/tmp/tenka-captive-typecheck-final.log、/tmp/tenka-captive-lint-verified.log。
  normal initial／scenario gzip 為 507050／100844 bytes；Pages 為 507070／100844 bytes，均在預算內。
  Pages 產物為 /private/tmp/tenka-captive-pages.bRASL5；五項 prefixed 引用及五項複製素材 SHA256 通過。
  紀錄：/tmp/tenka-captive-pages-static.log；這不是瀏覽器、部署或遠端 CI 證明。
- Playwright 收集為 110 項／39 檔；當前 headless 執行仍在 preview listen EPERM 中止，沒有建立 page。
  紀錄：/tmp/tenka-captive-headless.log；沒有開新視窗、改六份策略圖、frozen JSON、BAL、00 或里程碑。
  本輪沒有重跑硬體 mean；前輪 9.411／6.667 ms 的單次 retry 通過及 day450 p95 失敗仍分開保留。
  無親族滅亡的領地受領者仍待使用者決定，原生尺寸與完整捕獲旅程仍未驗證。
  下一個明確介面缺口為 11 §3.6 的出陣編成戰法資訊；應沿用 canonical 解鎖聯集，不複製條件。
- 唯讀 gameplay audit 另發現 05 的目安箱持續忠誠＋2 尚無 core 消費端；06 目標公式及 BAL 主表未列此項。
  目標修正或直接月增益的介面仍須先調和，不能把來源審查當作已實作；具申頻率增益也未定量。

## 出陣編成戰法資訊（2026-10-09）

- 三組代理平行完成 canonical 解鎖查詢、編成介面及唯讀審查；root 補字串、字型與整合驗證。
  大將及副將候選列顯示個別可解鎖戰法，編成列出有效已選武將的去重聯集與采配成本。
  無有效大將時明示未完成；另列采配、冷卻及目標條件，解鎖不等於可以使用。
  草稿、tick 及換局刷新沿用 cached selector；只投影當前合資格武將，不建立虛構軍隊或合戰單位。
- `getOfficerTacticIds` 抽出原有解鎖聯集，合戰查詢保留實際軍隊及主將回退解析。
  前後 tactics SHA256 分別為 3c7538cc5dd3124aed7553c58f794bc562ee1c47ff6a1768ea37726e677b7d49
  及 2214767011f1d2d37672441030f9c7232c4d2394367d1cc3f8ac0a1420469f12；沒有改規則、BAL、RNG 或快取。
  獨立舊算法 oracle 涵蓋十二戰法、預設、順序、重複特性、缺少 ID 與純度。
  新 API 缺席的十五項 RED 保留，十五項新測試及十七項既有戰法測試通過。
  紀錄：/tmp/tenka-formation-tactics-red.log、/tmp/tenka-formation-tactics-green.log。
- 真實 MarchModal 缺少編成內容的 RED 保留；最後六項新測試及十項舊測試通過。
  真正 dispatchCommand、佇列及正常 tick 產生軍隊，另一條受控合法邊境旅程到達實體遭遇。
  該旅程以 queued startKassen 產生實際 BattleUnit，核心解鎖集合與 UI 預覽一致，每日 INV 通過。
  不把受控路網 fixture 稱為完整全國出陣旅程；原生卡片尺寸及瀏覽器仍未證明。
  紀錄：/tmp/tenka-march-tactic-preview-red.log、/tmp/tenka-march-tactic-preview-green-final-corrected.log。
- 第一次完整 UI／app 在測試檔修正期間讀到錯誤 TickResult 欄位，1475 passed／1 failed，原始紀錄保留。
  初始型別檢查發現翻譯參數帶入 tactics 陣列；改回原四項 scalar 參數，不改按鈕名稱。
  紀錄：/tmp/tenka-formation-all-ui-app.log、/tmp/tenka-formation-typecheck-final.log。
  凍結修正後全部 UI／app 為 1476 passed、153 檔、61.84 秒：/tmp/tenka-formation-all-ui-app-final.log。
  不以最終通過抹去首輪失敗；單獨最終六項 UI 整合亦通過：/tmp/tenka-formation-integration-final.log。
- 目前完整 core project 為 2905 passed／14 failed／1 skipped，267 檔、117.43 秒。
  紀錄：/tmp/tenka-formation-core-full.log；這不是新的完整 UI／app suite 或 coverage。
  既有全國 day450 所有權、必要歷史 witness 及 frozen hash／BAL／replay 失敗仍阻擋 release。
- 同一種子 15600519 的前後四百二十日逐日 stateHash、事件、applied、pending 及 intent 完全相同。
  真正九區域及歷史事件引擎套用 2293 個指令，finalHash＝7d65df459b151e72，每日 INV＝0。
  紀錄：/tmp/tenka-formation-after-420.log；這是功能等價證據，不是新的硬體效能量測。
- 最後 normal／core 型別及完整 lint 通過；資料、簡體字、字型與素材檢查通過。
  紀錄：/tmp/tenka-formation-typecheck-verified.log、/tmp/tenka-formation-lint-verified.log。
  字型仍為 1653 字元、354108 bytes；normal initial／scenario gzip 為 507532／100846 bytes。
  Pages 為 507549／100845 bytes；production 與 Pages build 及預算通過。
  Pages 產物為 /private/tmp/tenka-formation-pages.q0smTi，五項 prefixed 引用及五項複製素材 SHA256 通過。
  紀錄：/tmp/tenka-formation-pages-static-final.log；不代表瀏覽器、部署或遠端 CI 通過。
- Playwright 收集仍為 110 項／39 檔；新 headless 嘗試在 preview listen EPERM 中止，沒有建立 page。
  紀錄：/tmp/tenka-formation-headless.log；沒有新視窗或 headful 替代，不修改 frozen 圖及容差。
  沒有重跑 mean；先前單次 retry 通過及 day450 p95 失敗分開保留。
  無親族滅亡的領地受領者仍待使用者決定，整體遊戲及 release 未完成。
- 下一個唯讀確認缺口為 PolicyPanel 容量未計朝廷及幕府加成，但中央 validator 已使用 extraPolicySlots。
  後續應重用該查詢並驗證階位、幕府滅亡、上限及刷新；尚未實作，不杜撰政策效果。
  來源：src/ui/screens/panels/PolicyPanel.tsx、src/core/commands/domesticCommands.ts、src/core/systems/court.ts。
  最後本輪 prose checker 為零違規：/tmp/tenka-formation-prose.log；00、staged 狀態及六份策略圖基準不變。

## 政策容量的官位與役職加成（2026-10-09）

- 三組代理平行完成 UI 容量、中央邊界回歸及唯讀審查；root 補 Main 真正入口與規格交叉參照。
  PolicyPanel 原「生效 N／上限 M」只讀威信基礎，現在加入既有公開 extraPolicySlots 的官位／役職加成。
  官位第四及第八階累計＋2，管領另＋1；幕府滅亡取消役職加成，仍受六格封頂。
  中央 validator、court 及 BAL SHA256 與本輪開始一致，不改核心效果、指令或卸除順序。
  §3.7.1 補入 08 已明定且 core 已消費的加成；原威信例子標示無官位／役職加成。
- 真實 PolicyPanel 首輪 RED 為五項失敗、兩項通過，INV 合法：/tmp/tenka-policy-capacity-red.log。
  最後八項新測試通過：/tmp/tenka-policy-capacity-integration.log；七項既有 DomesticPanels 另通過。
  測試含逐級加成、上限六格、中央採用邊界、下一日結算、幕府滅亡及同 ID 換局刷新。
  顯示及 queued 採用前的完整狀態含 RNG 不變，實際佇列精確；不宣稱政策效果全部完成。
  作者 expanded-red 紀錄是在 production 落地後的 GREEN，不冒稱第二個 RED；原始檔名保留。
- Main 真正左列入口先取得錯誤上限的 RED：/tmp/tenka-policy-capacity-main-red.log。
  原生 React host 顯示 2／3，採用只排入第三項，正常日結算後顯示 3／3；每日 INV 通過。
  全部 Main 五十四項通過：/tmp/tenka-policy-capacity-main-green.log，不冒稱原生瀏覽器或 GPU 證據。
- 全部 UI／app 為 1485 passed、154 檔、61.48 秒：/tmp/tenka-policy-capacity-all-ui-app.log。
  四組 core 回歸三十一項通過：/tmp/tenka-policy-capacity-core-regression.log；不合稱新的完整 suite。
  沒有重跑完整 core 或 coverage；上輪 2905 passed／14 failed／1 skipped 的 core 結果仍保留。
  本輪初始型別檢查發現 fixture 的 prestige 預設推導成 literal 300，不能接受其他數字。
  只補 number 註記，runtime 不變；最後八項測試與兩組型別通過：/tmp/tenka-policy-capacity-type-fix-types.log。
- Root 最後 normal／core 型別與完整 lint 亦通過：/tmp/tenka-policy-capacity-typecheck-final.log。
  完整 lint 紀錄為 /tmp/tenka-policy-capacity-lint-final.log，prose 零違規：/tmp/tenka-policy-capacity-prose.log。
- Normal 與 Pages build、預算、資料、字型、簡體字及素材檢查通過；沒有新增字串或重新建立字型。
  normal initial／scenario gzip 為 507545／100846 bytes；Pages 為 507565／100847 bytes，字型 354108 bytes。
  Pages 產物為 /private/tmp/tenka-policy-capacity-pages.BXWnfw，五項 prefixed 引用及五項複製 SHA256 通過。
  紀錄：/tmp/tenka-policy-capacity-pages-static.log；不代表部署、遠端 CI 或原生互動通過。
- Playwright 收集仍為 110 項／39 檔；當前 headless 在 preview listen EPERM 中止，沒有建立 page。
  紀錄：/tmp/tenka-policy-capacity-headless.log；沒有新視窗、headful 替代或 frozen 基準變更。
  本輪沒有硬體 mean／p95；既有 day450、歷史 witness 及 frozen 回歸失敗仍阻擋 release。
  無親族滅亡的領地受領者仍待使用者決定；整體遊戲、原生尺寸及完整政策畫面未完成。
  下一個資訊缺口為政策效果摘要、狀態徽章及詳情；未確認的效果必須明示，不捏造目安箱收益。
- 唯讀實際玩法 audit 確認傳馬制缺少部隊陸路速度＋10％；05 §3.7.2 及 04 §5.3 已明定此乘數。
  現有 movementSpeed 的陸路分支只有大將特性、低士氣、撤返／潰走與大命，沒有政策查詢。
  正向及實體反向邊都經該函式，成本端只處理道路與登船；輸送日數的 2／3 不能代用。
  應依部隊勢力的 live active 政策乘 1.1，再套原封頂；海路排除此項，無需出發城 snapshot。
  此缺口尚未實作；下一輪優先補真正行軍效果，建立合法 queued 採用／廢止的陸路及海路對照。

## 傳馬制的實際部隊行軍效果（2026-10-09）

- 三組代理平行完成每日移動消費端、真正 queued 旅程回歸及唯讀審查；root 補 BAL 與規格主表。
  05 §3.7.2 的部隊陸路＋10％現在以 polTenmaseiMarchSpeedMult＝1.1，於原速度封頂前乘入。
  依部隊勢力當前 active 政策查詢，不依端點主人、出發時快照或另一勢力的政策。
  採用／廢止與月費不足的自動廢止都在當日移動前生效；不改快取、RNG、成本或存檔欄位。
- 初始真實行為 RED 四項失敗、兩項通過：/tmp/tenka-tenmasei-speed-red.log。
  最後九項新回歸通過：/tmp/tenka-tenmasei-speed-final-clean.log，既有九十一項移動回歸另通過。
  紀錄：/tmp/tenka-tenmasei-consumer-green.log 的九十七項，是最初六項新測試加既有九十一項。
  後續擴充未合併稱為完整 suite；錯誤 retargetArmy 指令及初始多餘 cast lint 紀錄保留。
  正確測試改用原 setArmyTarget，不改中央 Command 或放寬驗證器。
- 控制 fixture 從合法 queued march 產生實際部分邊進度，不插入假軍隊或假中點。
  同日採用／廢止、敵方政策、海路起步、主將特性、低士氣、大命、實際召回與 core 潰走均有對照。
  特性、大命、撤返及政策的乘積 2.145 實際封頂至 2；反向邊原生 codec 後的正常日狀態完全一致。
  未付月費測試先走真正二十八日，再於月界採用並自動廢止，當日移動沒有加速；每日 INV 通過。
  受控零商業與士氣設定不是完整戰役或自然破產旅程，不宣稱原生瀏覽器完成。
- Root 補查海陸交界：04 §3.7／§5.4 明定一次日預算與已付餘量，原跨邊算法維持不變。
  海路起步不乘 1.1；陸路取得的剩餘 credit 仍可帶入海路，海路起步剩餘也不在陸路再乘。
  真正反向改令回到已抵達節點後，剩餘預算進入新海路尾段；不是逐邊重新換算時鐘時間。
  此修正不宣稱海路全程沒有較早陸路收益，也不解決既有海賊條文歧異。
- BAL／military 前後 SHA256 保留，軍事檔只增加 hasPolicy import 及陸路乘數；其他算術順序不變。
  BAL hash 由 f6a00abe48be8289 變為 c8f527e9560da5dc；新增常數是必要規則，不修改 frozen 基準求通過。
  主表 612→613 列，實作及數值比較 588→589 項；十八項排除、零 orphan 與七項既有問題不變。
  紀錄：/tmp/tenka-tenmasei-balance-before.json、/tmp/tenka-tenmasei-balance-after.json；平衡稽核仍未通過。
- Normal／core 型別與局部 lint 通過；資料、字型、簡體字、素材及 production／Pages build 通過。
  normal initial／scenario gzip 為 507550／100841 bytes；Pages 為 507567／100845 bytes，字型 354108 bytes。
  Pages 產物為 /private/tmp/tenka-tenmasei-pages.Z0f4bB，五項 prefixed 引用及五項複製 SHA256 通過。
  紀錄：/tmp/tenka-tenmasei-pages-static.log；這不是部署或原生互動證明。
- 最終型別紀錄：/tmp/tenka-tenmasei-typecheck-final.log；完整 ESLint 通過，最後文件格式檢查曾失敗。
  RELEASE_CHECKLIST 排版修正後，完整格式及新增段落 prose 通過，未刪除原失敗紀錄。
  紀錄：/tmp/tenka-tenmasei-lint-final-docs.log、format-final.log、prose-final.log（後兩項同前綴）。
- 第一次完整單元及 coverage 為 4398 passed／15 failed／1 skipped，422 檔、229.18 秒。
  紀錄：/tmp/tenka-tenmasei-complete-coverage.log；core 行／分支／函式為 94.50％／90.79％／97.87％。
  第十五項為主表 count fixture 還要求 612／588；改為實際 613／589，七項未解問題及所有嚴格檢查保留。
  另加 1.1 的來源與主表篡改負向檢查，該 audit 與九項行軍測試共四十六項通過。
  紀錄：/tmp/tenka-tenmasei-audit-final.log；不改 frozen hash、BAL 漂移檢查或必要歷史 witness。
- 凍結維護後的完整單元及 coverage 為 4399 passed／14 failed／1 skipped，422 檔、228.28 秒。
  紀錄：/tmp/tenka-tenmasei-complete-coverage-final.log，core 行／分支／函式仍為 94.50％／90.79％／97.87％。
  失敗分為兩項歷史 witness、一項全國 day450 的 INV-02／INV-22，以及十一項 frozen hash／BAL／replay 比對。
  全部新功能及 audit 測試通過不代表整體 gate 通過；沒有重錄基準或排除失敗。
- Playwright 收集仍為 110 項／39 檔；當前 headless 在 preview listen EPERM 中止，沒有建立 page。
  紀錄：/tmp/tenka-tenmasei-headless.log；沒有新視窗、headful 替代或 frozen 圖及容差變更。
  整體遊戲、原生尺寸、部署及長期驗收仍未完成；所有權與 frozen 阻擋紀錄保留。
- 所有 root／代理 CPU 工作終止後，單獨跑 canonical mean gate；首輪 9.575870 ms 超過八毫秒。
  唯一允許的 retry 為 6.680086 ms，通過八毫秒；兩次各三百六十項原始樣本均保留，沒有 CI 放寬或再試。
  紀錄：/tmp/tenka-tenmasei-mean-gate.log；不宣稱因果加速、p95、GPU 或完整遊戲通過。
  隨後獨立 p95 準備仍在 day450 因 INV-02／INV-22 中止，四十勢力、2494 個已套用指令、零項量測。
  紀錄：/tmp/tenka-tenmasei-p95-gate.log，沒有 p95 值或 retry，不把 mean 通過代替五年準備。
- 下一輪來源審查確認五人組尚無敵調略成功率降低消費端，但 05／08 沒有給定數值或乘算順序。
  不能自行採用 0.8 或把改基礎率、改最終成功率視為相同；此缺口需先取得明確規則。
  兵農分離的「士氣上限＋10」亦與 00／02 的固定零至一百衝突；不能改成初始士氣＋10 假造完成。
  已向使用者詢問兩項規則；既有無親族滅亡領地受領者的問題仍待答覆，不更動最高優先序文件。
- 下一個明確玩法缺口為遠交近攻的外交工作效率 ×1.25，05 已給數值、08 已定義工作包含三種目標。
  現有三種已付月費增益只有既有評定所倍率，尚無此政策消費端；不應乘費用、調略或提案接受度。
  非鄰接信用＋2 的被動／工作條件及加乘順序仍未指定，不能以已補 ×1.25 宣稱整項政策完成。
  學問所的月成長機率亦未指定，且與 06 的功績經驗模型不同；不新增任意月骰或經驗量。

## 遠交近攻的已付外交工作效率（2026-10-09）

- 三組代理平行完成外交消費端、獨立回歸及唯讀審查；root 補 BAL、主表與驗證紀錄。
  05 §3.7.2 的 1.25 現在作用於 08 §3.2 的三種工作，不只勢力信用，也含朝廷與幕府友好度。
  依工作勢力當前 active 政策查詢，只乘成功扣費後的增益，與原倍率合成一次，再套用原上限。
  不改費用、合法性、排序、功績條件、亂數、狀態或存檔欄位；非鄰接信用＋2 仍需明確規則。
- 真實行為 RED 九項失敗、一項通過：/tmp/tenka-enkokinko-work-red.log。
  三種目標真正 queued 採用與工作，在正常月界觀測到缺少 1.25；所有先決條件與每日 INV 通過。
  最後十一項新回歸通過：/tmp/tenka-enkokinko-work-green-final.log；另有既有六檔五十一項回歸通過。
  既有紀錄：/tmp/tenka-enkokinko-consumer-regressions.log；不相加稱為完整 suite。
- 完整 queued 路徑驗證三種目標、月界費用不足的政策廢止、次月效果消失及 native pending 工作延續。
  控制 subsystem 測試涵蓋評定所、特性、官位、大命的合成、小數、原費用、RNG、上限與功績一次完成。
  敵方政策不加速工作勢力；失效或未付工作無增益；控制 fixture 不是完整自然破產或全戰役證明。
  初次 GREEN 十項通過、一項失敗，原因是 native codec 不保留 transient 的 ai.intentLog。
  改比較 detached 持久狀態並單獨比對 RNG，只清除診斷 log，不改原狀態或任何玩法欄位。
  原始 oracle 失敗保留：/tmp/tenka-enkokinko-work-green.log；不假稱生產程式先失敗後修正。
- 重要時序：外交 Step 4 早於經濟 Step 6 的政策月費，後續自動廢止不回溯扣掉當日已付增益。
  queued 採用／廢止在 Step 1 先生效；政策失效後的次月工作回到原增益。
  此效果不沿用傳馬制 Step 7 的月費先廢止情況，不重排固定步驟或新增政策預付條件。
- BAL hash 由 c8f527e9560da5dc 變為 824f87bf28bccf9a；前後 SHA256 各存 /tmp/tenka-enkokinko-{before,after}.sha256。
  主表 613→614 列，實作與數值比較 589→590 項；十八項排除、二十四缺席、零 orphan、零值差異不變。
  仍有七項既有問題，稽核未通過；/tmp/tenka-enkokinko-balance-{before,after}.json 保留實際結果。
  audit 三十七項通過，新增 1.25 的來源與主表篡改負向檢查，不改排除、容差、frozen 或問題集合。
  紀錄：/tmp/tenka-enkokinko-audit.log；必要 BAL 漂移不藉重錄凍結基準掩蓋。
- 一般及 core 型別、局部 lint、資料、簡體字、字型涵蓋與素材檢查通過；producer 與測試來源已凍結。
  normal initial／scenario gzip 為 507594／100847 bytes；Pages 為 507607／100842 bytes，字型 354108 bytes。
  Pages 產物：/private/tmp/tenka-enkokinko-pages.drpOoy；五項 prefix 引用與五項複製 SHA256 通過。
  紀錄：/tmp/tenka-enkokinko-pages-static.log；靜態檢查不是部署或瀏覽器互動證明。
- Headless P2 嘗試仍在 preview listen EPERM ::1:4173 中止，零頁面、零瀏覽器通過。
  紀錄：/tmp/tenka-enkokinko-headless.log；沒有新視窗、headful 替代或 frozen 圖變更。
  全遊戲、長跑所有權、歷史 witness、frozen 比對、GPU、部署與手動驗收仍需完成。
- 完整單元與 coverage 為 4410 passed／14 failed／1 skipped，423 檔、228.84 秒。
  core 行／分支／函式覆蓋為 94.51％／90.80％／97.87％；百分比達標，但完整 gate 仍失敗。
  失敗仍為兩項歷史 witness、一項全國 day450 ownership 與十一項 frozen hash／BAL／replay 比對。
  紀錄：/tmp/tenka-enkokinko-complete-coverage.log；沒有更新 frozen、排除失敗或重試完整 suite 求綠。
- root 與代理 CPU 工作全部終止後，獨立 canonical mean 為首輪 9.439900 ms 失敗，唯一 retry 6.684501 ms 通過。
  八毫秒門檻不變；兩次各三百六十項樣本完整保留，沒有 CI 放寬或第三次嘗試。
  紀錄：/tmp/tenka-enkokinko-mean-gate.log；不是因果加速、p95、GPU 或整體遊戲完成證明。
  隨後獨立 p95 在 day450 的 INV-02／INV-22 中止，四十勢力、2496 已套用指令、零項量測。
  紀錄：/tmp/tenka-enkokinko-p95-gate.log；沒有 p95 值或 retry，不用 mean 代替五年準備。
- 最終一般／core 型別與完整 lint 通過；新增 reference 與驗證紀錄的 prose checker 零違規。
  紀錄：/tmp/tenka-enkokinko-typecheck.log、/tmp/tenka-enkokinko-lint-final.log、/tmp/tenka-enkokinko-prose-final.log。
  最後文件格式、diff 空白及六張 frozen SHA256 檢查通過，00 文件與 staged 內容未改。
- 下一輪唯讀 audit 確認 11 §3.9 的政策效果摘要、狀態徽章及右側詳細欄尚未實作。
  T8 要求 disabled 行動的原因 tooltip；現有 selector 只保存可採用集合，遺失中央驗證原因。
  可先按既有規則補資訊與原因，保留中央指令驗證；未實作或未定義的效果不可冒充已生效。
  此 UI 缺口不依賴新數值規則，仍有明確可進展工作，整體目標保持 active。

## 政策卡片詳情與行動原因（2026-10-09）

- 三組代理平行完成政策卡片與詳細欄、獨立回歸及唯讀效果審查；root 補說明、費用參數及驗證紀錄。
  十二張卡片顯示摘要、文字狀態及完整解鎖條件；右側詳細欄分列已實作效果與待完成規格。
  保留原卡片行動，另加原生選取鈕；選取不改核心狀態、RNG 或命令佇列。
  中央採用／廢止驗證決定可否下令，原因保留中央拒絕及實際鎖定、冷卻、互斥、格數、金錢事實。
- 真正缺少詳細欄與卡片資訊的 RED 兩項失敗：/tmp/tenka-policy-details-red.log。
  費用 metadata 的獨立 RED 兩項失敗，補入原 upkeepGold 後兩項通過，不改驗證順序或採用成本。
  紀錄：/tmp/tenka-policy-details-cost-{red,green}.log；直接唯讀及真正 queued 拒絕都保留實際六十貫參數。
- 首次 helper 數值回歸三十七項通過、一項失敗，證明 t 的整數數量格式把 1.5／1.1 倍率截為 1。
  改將 BAL 倍率作小數字串插值，不改全域數量格式；最後四檔三十八項通過。
  紀錄：/tmp/tenka-policy-details-root-regressions{,-final}.log；原生詳細欄的同類 literal 失敗亦保留。
  十二項效果清單檢查數目、翻譯參數、型錄不變及待完成項分離，不以非空字串冒充正確數值。
- 卡片額外標明南蠻鐵砲購入及火器集中戰鬥／購入尚未實作，不能把解鎖型錄當作玩法消費端。
  已有月治安修正仍受高治安折半與上限限制；城下集住只乘人口兵力項，不乘城格與兵舍。
  傳馬制保留海陸與已付跨邊餘量區別；遠交近攻保留已付三種工作及外交先於政策月費的時序。
  忠誠、具申頻率、士氣上限、敵調略及非鄰接信用的未定規則各自列明，不新增任意公式。
- 唯讀審查發現原行動僅查局身分；暫時移除本輪新守門，重現原消費端的卸載、關面板及背景下令。
  真實 React 回呼四項 RED 失敗：/tmp/tenka-policy-details-ownership-red-confirmed.log。
  首次 ownership 檔案收集時守門已先落地，不冒稱該輪有此 RED；該檔另保留倍率錯誤的實際失敗。
  關閉面板的舊回呼亦能移除同 ID 新面板，一項 RED：/tmp/tenka-policy-details-close-red-confirmed.log。
  初始 close fixture 誤寫 panels 而非 panelStack 的前置失敗保留，不當作生產缺陷證明。
- 守門涵蓋掛載、局及原面板身分、主畫面、fatal／viewport、FIFO 與原生對話框操作權。
  原八項容量測試中兩項因 fixture 停在 title 而失敗；只補真實 main 先決條件，原 oracle 不變後八項通過。
  紀錄：/tmp/tenka-policy-details-capacity-{compat,final}.log；過期費用仍在真正 dispatch 前由中央重查。
- 新增 UI 字串後字型重建為 1659 字元、355384 bytes，字型涵蓋、資料、簡體字及素材檢查通過。
  BAL hash 保持 824f87bf28bccf9a；核心變更僅政策金錢不足拒絕的既有費用參數，不更改效果或存檔欄位。
  00、frozen 圖及容差不改；沒有 commit、push 或部署。
- 最後十六項新 UI 回歸通過，既有政策容量八項及內政七項的合併三十一項亦通過。
  紀錄：/tmp/tenka-policy-details-final.log、/tmp/tenka-policy-details-consumer-final.log。
  一般／core 型別及局部 lint 通過；來源已凍結，完整 suite 與 coverage 的結果另列，不相加稱為完整測試。
- Headless P2 嘗試仍於 preview listen EPERM ::1:4173 中止，沒有建立 page 或通過瀏覽器測試。
  紀錄：/tmp/tenka-policy-details-headless.log；沒有新視窗、headful 替代或調整 frozen 容差。
- Normal／Pages build 及 bundle 預算通過；normal initial／scenario gzip 為 510577／100847 bytes。
  Pages 為 510592／100846 bytes，產物 /private/tmp/tenka-policy-details-pages.qjFxpV。
  五項 prefix 引用及五項複製 SHA256 通過：/tmp/tenka-policy-details-pages-static.log。
  此靜態證據不代替部署、原生互動或 GPU；字型兩種產物均為 355384 bytes。
- 完整單元及 coverage 為 4430 passed／14 failed／1 skipped，426 檔、230.71 秒。
  core 行／分支／函式為 94.51％／90.80％／97.87％；同一輪 ui 847 及 app 656 項均通過。
  此 1503 是完整 run 的分組，不是把不同批次的局部結果相加；整體 gate 仍未通過。
  紀錄：/tmp/tenka-policy-details-complete-coverage.log，仍有兩項歷史、一項 ownership 與十一項 frozen 失敗。
  沒有重錄基準或跳過失敗求綠。
- root／代理 CPU 工作全部終止後，獨立 mean 首輪 9.423572 ms 失敗，唯一 retry 6.731708 ms 通過。
  八毫秒門檻、六十 warmup 與各三百六十項樣本不變；兩次七百二十項原始樣本均保留。
  紀錄：/tmp/tenka-policy-details-mean-gate.log；沒有 CI 放寬或第三次嘗試，不宣稱因果加速。
  隨後獨立 p95 在 day450 的 INV-02／INV-22 停止，四十勢力、2496 個已套用指令、零項量測。
  紀錄：/tmp/tenka-policy-details-p95-gate.log；沒有 p95 值或 retry，不以 mean 通過代替長跑準備。
- 一般／core 型別、完整 lint 及新增 reference／驗證紀錄的 prose 檢查通過。
  紀錄：/tmp/tenka-policy-details-consumer-types-final.log、/tmp/tenka-policy-details-lint-final.log。
  Prose 紀錄：/tmp/tenka-policy-details-prose-final.log。
  最後文件格式、diff 空白、六張 frozen SHA256 及核心來源 SHA256 保護檢查通過；staged 與 00 不變。
- 下一輪唯讀 audit 確認大命卡片、效果、詳細欄與行動原因早已存在，不重做已完成資訊。
  真正缺口為確認回呼只按 owner 字串找當前 modal，沒有捕捉原局、原確認及原生操作權。
  下一步補大命同意所有權與正常 queued 旅程，不修改數值、冷卻或大命效果；整體目標保持 active。
- 桌面來源採三欄與三十 rem 詳細欄，九十 rem 容器上限；窄視窗回退單欄，操作區源碼最低三十二 px。
  11 的 1440 容器與三張 432 卡片加 480 詳細欄互相衝突，不宣稱字面尺寸已驗收。
  原生幾何、0.8 倍率溢版、完整遊戲與全部政策效果仍未完成；既有 ownership 與 frozen 阻擋保留。

## 大命同意所有權（2026-10-09）

- 平行分工：producer 只改 TaimeiPanel；test author 只新增同意所有權測試；reviewer 唯讀稽核。
  root 擴充真正 App 旅程、整合驗證及紀錄；沒有更改核心數值、frozen、容差、00 或里程碑。
- 三項最小 authentic RED 證明同 ID 換局、卸載與取消後，原生確認舊回呼仍能錯誤入列。
  紀錄：/tmp/tenka-taimei-consent-red.log；沒有用 mock 按鈕取代真正 ConfirmDialog 回呼。
- 既有 TaimeiPanel 五項、真正 App 六項及大命 core 四檔四十七項 baseline 分別通過。
  紀錄：/tmp/tenka-taimei-consent-{existing,app,core}-baseline.log；不相加稱為完整 suite。
  原獨立面板 fixture 補 main screen，保留主畫面操作閘門，沒有放寬資源或中央驗證。
- 真正 App 的新遊戲精靈、rail、大命原生確認與下一正常日旅程六項通過。
  單一 taimei.invoked、實際威信成本、active ID、空佇列、INV 零項及手動暫停均有斷言。
  紀錄：/tmp/tenka-taimei-consent-real-app.log；這是 jsdom 旅程，不是原生 GPU 證據。
- 第一版十八項所有權測試通過，含真正 dispatch 發布期間同步建立新原生對話框。
  紀錄：/tmp/tenka-taimei-consent-green-final.log；已授權指令仍入列一次，舊確認不關閉新操作權。
  後續唯讀 review 發現原確認描述移除後還原仍可能復活，另以 authentic RED 檢查，不提早凍結。
- 移除原 modal 再還原同一描述的 authentic RED 為一項失敗、十八項篩選略過。
  紀錄：/tmp/tenka-taimei-consent-revival-red.log；同步訂閱只撤銷本地同意，不修改替換 modal。
  一般 tick 保留同意，正常取消及卸載則失效；拒絕原因位於自有原生確認內。
- 最終二十五項所有權測試通過，涵蓋新局、原生／FIFO、復活、背景、參數及玩家變更。
  紀錄：/tmp/tenka-taimei-consent-expanded-green-final.log；scoped lint／格式亦通過。
  初輪擴充測試二十四項通過、一項失敗，原因為 test-only import 錯用 registry，僅修正 import。
  紀錄：/tmp/tenka-taimei-consent-expanded-green.log；保留錯誤，不將它描述為產品回歸。
- 最終一般型別、core 型別及 producer 的二十五項既有相容回歸通過。
  紀錄：/tmp/tenka-taimei-consent-types-final.log、/tmp/tenka-taimei-consumer-{types,green}-final.log。
  初次 typecheck 指出 root 新 App 測試漏了 TaimeiId brand，僅補型別，不改 production。
  失敗紀錄：/tmp/tenka-taimei-consumer-types.log；完整 lint／coverage 結果另記，不以局部測試替代。
- 全量資料、字形、字型及資產驗證通過；沒有新增字串，子集仍為 1659 字元、355384 bytes。
  紀錄：/tmp/tenka-taimei-consent-{data,simplified,font,assets}.log。
- Normal 與 Pages build／bundle 預算通過；normal initial／scenario gzip 為 511169／100847 bytes。
  Pages 為 511189／100845 bytes，產物 /private/tmp/tenka-taimei-consent-pages.egCjrI。
  五項 prefix 引用與五項複製 SHA256 通過：/tmp/tenka-taimei-consent-pages-static.log。
  字型兩種產物均為 355384 bytes；靜態產物不代替部署、瀏覽器互動或 GPU。
- 完整單元及 coverage 為 4455 passed／14 failed／1 skipped，427 檔、229.70 秒。
  core 行／分支／函式為 94.51％／90.81％／97.87％；同一輪 ui 847 及 app 681 項全部通過。
  此 1528 是同一 complete run 的分組，不是跨批次相加；整體 gate 仍失敗。
  紀錄：/tmp/tenka-taimei-consent-complete-coverage.log；仍是兩項歷史、一項 ownership 與十一項 frozen。
  全國 seed15600519 day450 的死去 Saito 留下四城十六郡，INV-02／INV-22 仍阻擋長跑。
- 完整 lint、文件格式與新增 reference／驗證紀錄 prose 檢查通過。
  紀錄：/tmp/tenka-taimei-consent-lint-full.log、/tmp/tenka-taimei-consent-prose.log。
  diff 空白、核心五項 SHA256 與 frozen 六張 SHA256 通過；00、staged 及里程碑不變。
  所有 root／代理 CPU 工作已終止，沒有 commit、push、部署、基準重錄或門檻放寬。
- 本輪是 UI 同意所有權修正，核心五項來源 SHA256 不變；沒有再量測或挑選 performance 樣本。
  前輪政策詳情的隔離 mean／p95 紀錄保留原日期與 scope，不宣稱本輪新的效能驗收。
- 最終唯讀來源 review 通過；下一個具體缺口為軍團解散確認沿用舊局同 ID editor。
  CorpsScreen 沒有局或面板身分 key，generic CommandAction 不查原同意的局或原生操作權。
  下一輪先重現真正解散確認跨局入列，再補局部操作權；不提前宣稱核心或全部軍團完成。
- 最新 headless P2 嘗試仍於 preview listen EPERM ::1:4173 停止，沒有建立 page。
  紀錄：/tmp/tenka-taimei-consent-headless.log；沒有新視窗、headful 替代或瀏覽器通過宣稱。

## 軍團指令與解散同意所有權（2026-10-09）

- 平行分工：producer 只改 CorpsScreen，test author 只新增軍團同意測試，reviewer 唯讀稽核。
  root 補真正 Main rail 旅程、拒絕 metadata 與整合驗證；沒有更改 BAL、frozen、容差或 00。
- 最小 authentic RED 證明真正 queued 建立軍團並經正常日後，換同 ID 局仍可用舊解散確認入列。
  紀錄：/tmp/tenka-corps-consent-red-confirmed.log；初次 test-only validateState import 錯誤另保留。
  初次紀錄：/tmp/tenka-corps-consent-red.log；沒有用無效 fixture 或假軍團冒充正常建立。
- 最終二十五項新所有權測試通過，含取消、卸載、改選、換局、背景與同步重新開啟同意。
  紀錄：/tmp/tenka-corps-consent-green-refreeze.log；後者在修正後加入，不宣稱有修正前 RED。
  請求與原生對話框在 dispatch 返回後必須仍相同，舊完成回呼不得關閉新同意。
- 最初擴充 run 二十二項通過、兩項失敗，分別為 test 的背景改選及月初通知前置假設。
  背景改選本來受阻；改為先正常取消再改選。錢包 warmup 改在確認前，明示 reset UI 通知狀態。
  此 reset 是獨立同意 fixture 的前置，不代表月初通知的真正使用者旅程已完成。
  保留 /tmp/tenka-corps-consent-green.log；這些前置修正不放寬不入列與退回金斷言。
- 新測試的非當主軍團長由正常日建立軍團，經三十日真正收入取得正錢包，再正常確認解散。
  正常 tick 保留同意，兩次同一確認只入列一次；下一正常日才退回金、直轄及免職忠誠減少。
  建立、warmup 及解散後檢查 INV 零項，結算保留手動暫停；沒有注入退回金或捏造軍團。
- root 的 Main rail 建立、取消與確認解散旅程通過，包含 controlled wallet 123 的退回斷言。
  此錢包是明示 UI fixture，另有上一項真正收入旅程，不將它稱為正式收入證明。
  兩項既有 Corps UI 的 fixture 補 main screen，保留主畫面閘門；正常 core 狀態只於 tick 改變。
- 真正 Main 旅程揭露 disabled 建立原因缺少姓名；core 新 metadata authentic RED 為兩項失敗。
  紀錄：/tmp/tenka-corps-consent-name-red.log；僅補 params.name，不改拒絕原因、驗證次序或規則。
  root 三檔五十九項通過：Main 五十五、Corps UI 二、拒絕 metadata 二。
  紀錄：/tmp/tenka-corps-consent-root-green.log；既有 core 六檔二十四項亦通過。
  core 紀錄：/tmp/tenka-corps-consent-core-regressions.log；不把局部分組相加稱為完整 run。
- producer 最終四十二項相容回歸與 scoped lint／格式通過；新測試有二十五項，不是新增四十二項。
  紀錄：/tmp/tenka-corps-consumer-green-refreeze.log；完整整合型別、lint 及 coverage 結果另記。
- 最終一般／core 型別及完整 lint 通過，新增 reference／驗證紀錄另跑 prose 與格式檢查。
  紀錄：/tmp/tenka-corps-consent-types-final.log、/tmp/tenka-corps-consent-lint-final.log。
- 全量資料、字形、字型與資產驗證通過，沒有新增字串；字型維持 1659 字元、355384 bytes。
  紀錄：/tmp/tenka-corps-consent-{data,simplified,font,assets}.log。
- Normal／Pages build 及 bundle 預算通過；normal initial／scenario gzip 為 512244／100846 bytes。
  Pages 為 512261／100843 bytes，產物 /private/tmp/tenka-corps-consent-pages.O998Tz。
  五項 prefix 引用與五項複製 SHA256 通過：/tmp/tenka-corps-consent-pages-static.log。
  字型兩種產物均為 355384 bytes；靜態證據不代替部署、瀏覽器或 GPU。
- 唯一核心來源變更為 createCorps 的 officerBusy 拒絕補 params.name；BAL 與 core Corps 系統不變。
  generic CommandAction 亦維持原 SHA256；前後保護紀錄 /tmp/tenka-corps-consent-protected{,-after}.sha256。
  不修改 gameplay、驗證次序或 stateHash；本輪沒有再量測 performance 或挑選新的樣本。
  前輪 policy-details mean／p95 保留原日期與 scope，不宣稱本輪新的效能驗收。
- 完整單元及 coverage 為 4483 passed／14 failed／1 skipped，429 檔、242.73 秒。
  core 行／分支／函式為 94.53％／90.86％／97.87％；同一輪 ui 848 及 app 706 項均通過。
  此 1554 是同一完整 run 的分組，不是跨批次相加；整體 gate 仍失敗。
  紀錄：/tmp/tenka-corps-consent-complete-coverage.log；仍是兩項歷史、一項 ownership 與十一項 frozen。
  全國 seed15600519 day450 的 dead Saito 留下四城十六郡，INV-02／INV-22 仍阻擋長跑。
- 文件格式與新增 reference／驗證紀錄 prose 檢查通過：/tmp/tenka-corps-consent-prose.log。
  diff 空白、保護 SHA256 及 frozen 六張 SHA256 通過；00、staged 與里程碑不變。
  所有 root／代理 CPU 工作已終止，沒有 commit、push、部署、重錄基準或門檻放寬。
- 最新 headless P2 仍在 preview listen EPERM ::1:4173 停止，沒有建立 page 或通過瀏覽器。
  紀錄：/tmp/tenka-corps-consent-headless.log；沒有新視窗、headful、基準重錄或容差放寬。
- 最終唯讀 review 確認局部所有權；另一個明確缺口是確認尚未占有 canonical modalQueue。
  真正月初或提案 arrival 可與局部確認同時顯示；送出閘門防止錯誤指令，不等於完成單一 modal。
  下一步補有所有權的 FIFO 確認，保留既有時間行為；不杜撰強制暫停或未定的核心玩法。

## 軍團確認 FIFO 與原描述移除（2026-10-09）

- 三組平行分工：軍團 producer、FIFO test author、唯讀 API 與後續缺口 reviewer。
  root 實作共享 exact dismissal API，補真正 Main 月初旅程並整合驗證；不改 generic CommandAction。
- 新 FIFO 的真正 RED 保留於 /tmp/tenka-corps-fifo-red.log；最後十項通過。
  紀錄：/tmp/tenka-corps-fifo-green.log；先前十一項是人工計數錯誤，以實際十項為準。
- 共享 API 初次十三項均因缺少 API 失敗，實作後十三項通過。
  紀錄：/tmp/tenka-corps-fifo-owned-api-{red,green}.log；保留原始失敗，不修改 oracle 求通過。
  review 再補終局與無關 pending count 發布，真正 RED 二失敗／十三通過後十五項全通過。
  紀錄：/tmp/tenka-corps-fifo-owned-api-boundary-{red,green}.log。
- 五檔整合一百零八項通過，Main 五十六、Corps UI 二、舊所有權二十五、FIFO 十、共享 API 十五。
  紀錄：/tmp/tenka-corps-fifo-integration-final.log；月初摘要由真正 bridge 正常日產生，不偽造 arrival。
  首次一百零七通過／一失敗保留 /tmp/tenka-corps-fifo-integration.log；舊 oracle 假設新項立刻取代確認。
  修正先移除原描述、啟用 systemMenu，再驗證舊確認不得入列；沒有刪除所有權或 state 斷言。
- 解散描述保持 pausesTime false；必要項依序等待，取消與正常提交只移除原描述。
  清理不恢復舊速度；原子移交後重查局、描述、佇列及暫停條件，避免同步發布覆蓋新局。
  手動暫停、fatal、viewport、終局與同步換局的回歸通過；正常取消獨立於資源合法性。
- 型別、build、資料、字元、字型與 assets 檢查通過；完整 lint 的兩項新 act 寫法錯誤已改正。
  原始 lint 紀錄：/tmp/tenka-corps-fifo-lint.log；修正使用不回傳 runOneDay 結果的 act body。
  修正後完整 lint 通過：/tmp/tenka-corps-fifo-lint-final.log；型別紀錄 /tmp/tenka-corps-fifo-types.log。
- 一般 bundle gzip 首載 512826、scenario 100845 bytes；字型 355384 bytes，均在原門檻內。
  Pages 首載 512849、scenario 100844 bytes；產物 /private/tmp/tenka-corps-fifo-pages.W91vM4。
  五項 prefix 引用與五項複製 SHA256 通過：/tmp/tenka-corps-fifo-pages-static.log。
  Pages bundle 初次 --dist 參數錯誤保留；正確位置參數通過 /tmp/tenka-corps-fifo-pages-bundle-final.log。
- BAL、core Corps command／system、generic CommandAction 與 frozen 六張 SHA256 均不變。
  保護紀錄：/tmp/tenka-corps-fifo-protected.sha256；沒有改規則、門檻、00、commit、push 或部署。
  本輪不重新量測 performance，不以先前 policy-details 樣本宣稱本輪效能驗收。
- headless 仍在 preview listen EPERM ::1:4173 停止，沒有 page 或瀏覽器通過。
  紀錄：/tmp/tenka-corps-fifo-headless.log；沒有新視窗、headful、基準重錄或容差放寬。
  初次 selector 誤用不存在的 flow 檔；改用真正 smoke.spec.ts 的 P2 後仍在 server 前置失敗。
  正確目標紀錄：/tmp/tenka-corps-fifo-headless-p2.log；不把前置失敗稱為 browser assertion 失敗。
- 下一個明確缺口為外交破約的局部同意：須綁定原局、原面板、目標及真正 pact 物件。
  Court／Plot 與父 modal 內的其他確認仍須各自補所有權，不將軍團 FIFO 宣稱為完整遊戲完成。
- 最新完整 coverage 為 4509 passed／14 failed／1 skipped，431 檔、238.13 秒。
  core 行／分支／函式為 94.57％／90.86％／97.99％；同一輪 ui 849 與 app 731 項均通過。
  此 1580 是同一完整 run 的分組，不是跨批次相加；整體 gate 仍失敗。
  紀錄：/tmp/tenka-corps-fifo-complete-coverage.log；兩項歷史、一項 ownership 與十一項 frozen 仍失敗。
  day450 dead Saito 的四城十六郡 INV-02／INV-22 未改，不杜撰無繼承人領地歸屬或重錄 hash。
- 新來源、Main 真正月初旅程及新文件經唯讀 review 通過；Main 最後五十六項亦通過。
  紀錄：/tmp/tenka-corps-fifo-main-final.log；最後型別與完整 lint 通過。
  紀錄：/tmp/tenka-corps-fifo-types-final.log、/tmp/tenka-corps-fifo-lint-docs-final.log。

## 外交破約同意與確認 FIFO（2026-10-09）

- 三組平行分工：producer 只改 DiplomacyPanel，test author 只新增 diplomacyPactConsent，reviewer 唯讀稽核。
  root 補 Main rail 正常協商至破約及真正月初 arrival 旅程，整合型別、lint、build 與完整 run。
- 真正 RED 用中央入列 proposeAlliance 與正常日建立有效 alliance，再換同 ID 局呼叫舊確認。
  舊 generic callback 錯誤入列 breakPact；紀錄 /tmp/tenka-diplomacy-consent-red-confirmed.log。
  初次 helper public import 錯誤另保留 /tmp/tenka-diplomacy-consent-red.log，不把 import 錯誤稱為產品 RED。
- 最後三十二項新回歸通過：/tmp/tenka-diplomacy-consent-green-frozen.log；作者 scoped lint／format 通過。
  包含同 ID 換局、同種類新 pact、四項欄位、尚未發布 tick 的更新、取消、卸載及原生頂層操作權。
  vassalClanId 放入 alliance 的案例明示為防禦性 malformed input，不宣稱合法狀態或真實條約旅程。
- pact 同意綁定真正 row／pact identity 及 kind、startDay、endDay、vassalClanId，不使用 detached view 作身分。
  原描述離開 current 與 queue 時同步撤銷；還原同一描述不能復活；同 action 同步取消再開的新同意保留。
  破約確認保持 pausesTime false，必要通知等待；取消與正常送出只移除原描述。
- 三勢力旅程先合法建構 scenario，再由真正 queued proposal 與正常日協商建立 alliance。
  UI 入列前後保持 persistent state／RNG；下一正常日套用有向信用、心證及威望懲罰，INV 保持合法。
  pending 破約經真正 encodeSave／decodeSave 還原後，事件、persistent tree 與 RNG 和原局一致。
  只依現有 codec 約定正規化 transient intentLog；不宣稱整個正常日沒有 RNG draw。
- producer 四檔四十七項通過：新三十二、indicator 九、work cost 二、M6 panels 四。
  紀錄：/tmp/tenka-diplomacy-consumer-green-frozen.log；producer normal／core types 與 scoped lint 通過。
  最初十四通過／一失敗的 M6 tab fixture 是 title screen，已補 main 及真正 diplomacy panel 前置。
  紀錄：/tmp/tenka-diplomacy-consumer-green.log；不放寬原前景閘門或刪除 tab 斷言。
- root 第一輪七檔八十六項通過：Main 五十八及既有 UI／app／core 二十八。
  紀錄：/tmp/tenka-diplomacy-consent-integration.log；Main 初步五十八亦通過。
  新 fixture 一次 readonly row type 錯誤改為 actual rows 取得，不以 cast 偽造可寫 row。
  UI spec 的直接 core helper import 被邊界 lint 拒絕，前置 helper 移到 tests/helpers，不改公開 API 或 lint 規則。
- 最後八檔一百一十八項通過：Main 五十八、新 consent 三十二、既有 UI／app／core 二十八。
  紀錄：/tmp/tenka-diplomacy-consent-integration-final.log；這是單次整合 run，不是完整 suite。
  原始 log 保留既有 SystemMenu act warning，不宣稱 warning-free 或原生瀏覽器通過。
- 最後 normal／core types、完整 lint 與 build 通過；資料、字元、字型及 assets 檢查均通過。
  紀錄：/tmp/tenka-diplomacy-consent-types-refreeze.log、/tmp/tenka-diplomacy-consent-lint-final.log。
  本輪不再量測 performance，保留先前 policy-details 樣本與日期，不宣稱本輪新的 timing 驗收。
- 一般 bundle gzip 首載 514080、scenario 100846 bytes；字型 355384 bytes，原門檻均通過。
  Pages 首載 514097、scenario 100844 bytes；產物 /private/tmp/tenka-diplomacy-consent-pages.KeuBNq。
  五項 prefix 引用及五項複製 SHA256 通過：/tmp/tenka-diplomacy-consent-pages-static.log。
  此為靜態產物與 budget 證據，不代替 production Pages、瀏覽器、GPU 或完整遊戲旅程。
- BAL、外交 command／system、generic CommandAction、uiStore 與 frozen 六張 SHA256 均不變。
  保護紀錄：/tmp/tenka-diplomacy-consent-protected.sha256；不改核心背信數值、婚姻期限或停戰不可破約規則。
  沒有門檻放寬、基準重錄、commit、push 或部署；00 與里程碑維持原狀。
- 最新獨立 headless launch 也失敗：Chromium MachPortRendezvous bootstrap_check_in Permission denied。
  紀錄：/tmp/tenka-diplomacy-consent-headless-launch.log；與先前 preview listen EPERM 是不同前置阻礙。
  headless true 的原始 launch 帶 --headless／--no-startup-window；沒有 page、瀏覽器通過或新視窗。
- source 與三十二項測試經唯讀 review 通過；證據主要針對 break consent，不覆蓋每個 immediate 端口的對抗情境。
  CourtPage 的獨立確認、其他父 modal 子確認及逐項 immediate 回歸仍待補；全遊戲目標保持未完成。
- 最新完整 coverage 為 4543 passed／14 failed／1 skipped，432 檔、234.08 秒。
  core 行／分支／函式為 94.57％／90.88％／97.99％；同一輪 ui 851 與 app 763 項均通過。
  此 1614 是同一完整 run 的分組，不是跨批次相加；整體 gate 仍失敗。
  紀錄：/tmp/tenka-diplomacy-consent-complete-coverage.log；兩項歷史、一項 ownership 與十一項 frozen 仍失敗。
  day450 dead Saito 的四城十六郡 INV-02／INV-22 未改，不杜撰無繼承人領地歸屬或重錄 hash。
- 下一個明確確認缺口是 CourtPage 的將軍提名，不是三十城或 favor 八十的未定門檻。
  現有規格與中央驗證要求控制真正京都、favor 至少五十、幕府存在且 patron 為 null。
  可用真正 s1560 足利 admission fixture 明示 controlled favor，再證 queued nomination 與正常日效果。
  不把 controlled admission 前置宣稱為 earned campaign 或新局精靈的完整旅程。

## 將軍提名同意與確認 FIFO（2026-10-09）

- 三組平行分工：producer 只改 CourtPage，test author 只新增 courtNominationConsent，reviewer 唯讀稽核。
  root 補真正 Main rail／shogunate tab 的 queued 提名及月初摘要等待，另建受控 admission helper。
- 真正 RED 為 s1560 足利／二條、正常日 warmup、明示 controlled favor 五十及 native save reload。
  原生舊確認錯誤入列 nominateShogun 到同 ID 還原新局；紀錄 /tmp/tenka-court-consent-red.log。
  測試一開始即證實 INV 合法，沒有 import／fixture 前置失敗，也沒有 mock 京都或假城數。
- 新二十六項回歸通過：/tmp/tenka-court-consent-green.log；作者 scoped lint／format 通過。
  包含同 ID native reload、原局／面板／頁籤、取消、卸載、FIFO、原生頂層、fatal、viewport 與終局閘門。
  favor 四十九／五十及仍合法五十一更新重查中央驗證；普通 tick 不讓未變同意失效。
  raw 京都 owner 變更明示 defensive partial input，不宣稱完整合法攻陷旅程或 INV 合法的領地轉移。
- 原確認綁定真正 actor／capital 物件與唯一描述，不凍結 favor，不自行推測新的任命規則。
  原描述離開 current／queue 時同步撤銷；還原不得復活；同 action 的同步取消再開保留新請求及原生操作權。
  確認保持 pausesTime false，必要通知等待；清理只移除原項，不恢復舊速度或關閉後來的描述。
- queued 提名在下一正常日產生單一 shogunate.nominated，更新 patron，威望增加三百但仍受原上限限制。
  其他存活勢力的 incoming 心證加十，outgoing／self 不改；favor 不因提名本身消耗，INV 與手動暫停保持。
  pending 提名經真正 codec 還原後，事件、persistent tree 及 RNG 與原局一致。
  只依既有 codec 約定正規化 transient intentLog；不宣稱正常日沒有其他 RNG 消費者。
  以上使用 controlled admission 前置，不宣稱 UI wizard 或長期朝廷工作 earned campaign。
- producer 四檔四十一項通過：新二十六、core court 九、M6 panels 四、DiploWork cost 二。
  紀錄：/tmp/tenka-court-consumer-green-frozen.log；producer normal／core types 與 scoped lint／format 通過。
- root Main 六十項通過，兩項新增旅程使用真正 s1560 資料與實際二條所有權。
  紀錄：/tmp/tenka-court-consent-main-green.log；favor 五十是 helper 的明示受控 admission，未修改任何城池。
  root 五檔一百零一項亦通過：/tmp/tenka-court-consent-integration-final.log；不稱為完整 run。
  原始 log 保留既有 SystemMenu act warning，不宣稱 warning-free 或原生瀏覽器通過。
- normal／core types、完整 lint、build、資料、字元、字型及 assets 檢查通過。
  紀錄：/tmp/tenka-court-consent-types-final.log、/tmp/tenka-court-consent-lint.log。
  本輪不再量測 performance，保留舊 policy-details 原日期與樣本，不宣稱新的 timing 驗收。
- 一般 bundle gzip 首載 514931、scenario 100843 bytes；字型 355384 bytes，原門檻均通過。
  Pages 首載 514953、scenario 100844 bytes；產物 /private/tmp/tenka-court-consent-pages.23zZWj。
  五項 prefix 引用與五項複製 SHA256 通過：/tmp/tenka-court-consent-pages-static.log。
  靜態產物不代替 production Pages、原生瀏覽器、GPU 或完整遊戲旅程。
- BAL、court command、外交 system、generic CommandAction、uiStore 與 DiplomacyPanel SHA256 不變。
  保護紀錄：/tmp/tenka-court-consent-protected.sha256；frozen 六張 SHA256 亦保持原值。
  沒有改規則、門檻、00、里程碑，沒有 commit、push、部署、headful 或基準重錄。
- 已驗證 preview listen EPERM 與 headless Chromium MachPortRendezvous Permission denied 的前置阻礙沒有改變。
  本輪不重複啟動已知失敗的 browser；保留 /tmp/tenka-diplomacy-consent-headless-launch.log。
  沒有原生 page、瀏覽器驗收或新視窗；source／jsdom／bridge／codec 證據不代替原生尺寸或 GPU。
- source 經唯讀 review 通過；Court immediate rank／title／mediation 端口僅增加局部 scope 與中央驗證。
  本批主要驗證 nomination consent；standalone DiploWork 與其他確認仍須逐項補所有權及對抗測試。
  全遊戲目標保持未完成，不以朝廷局部修正代替長跑、frozen 對齊或發版 gate。
- 最新完整 coverage 為 4571 passed／14 failed／1 skipped，433 檔、244.55 秒。
  core 行／分支／函式為 94.58％／90.88％／97.99％；同一輪 ui 853 與 app 789 項均通過。
  此 1642 是同一完整 run 的分組，不是跨批次相加；整體 gate 仍失敗。
  紀錄：/tmp/tenka-court-consent-complete-coverage.log；兩項歷史、一項 ownership 與十一項 frozen 仍失敗。
  day450 dead Saito 的四城十六郡 INV-02／INV-22 未改，不杜撰無繼承人領地歸屬或重錄 hash。
- 最後 normal／core types 與完整 lint／format 通過，prose checker 為零違規。
  紀錄：/tmp/tenka-court-consent-types-docs-final.log、/tmp/tenka-court-consent-lint-docs-final.log。
  SHA256、diff 空白、00、staged 與里程碑檢查維持原保護狀態，未宣稱 deployment 或原生瀏覽器通過。

## 計略取消同意與確認 FIFO（2026-10-09）

- 三組平行分工：producer 只改 PlotPanel，test author 只改新 plotCancellationConsent，reviewer 唯讀稽核。
  root 補真正 Main rail 的二百金計略及月初摘要等待，helper 只明示調整目標的合法 admission 前置。
- 真正 native reload RED 保留在 /tmp/tenka-plot-consent-red.log；原局確認錯誤入列至同 ID 還原新局。
  初版二十七項取消回歸通過：/tmp/tenka-plot-consent-green.log。
  初版 fixture 投資為零，不把此零金案例宣稱為正金退款證據。
- root Main 六十二項通過：/tmp/tenka-plot-consent-main-green.log。
  新旅程使用真正二百金 startPlot、正常日扣款、cancelPlot 入列及下一正常日不退款。
  真正月初更新同一 raw plot 的進度，原同意保持有效；取消後交棒真正月初摘要，原生 dialog 只有一個。
  保留既有 SystemMenu act warning 與 officerBusy 缺少 name 的插值警告，不宣稱 warning-free。
- 同意保存實際 plot 及穩定欄位，排除 progress；啟動草稿修訂不取消另一個既有計略的同意。
  唯一非暫停 FIFO 描述被移除即不可復活；清理只移除原項，不關閉後來請求或恢復舊速度。
  中央取消效果只移除計略，不退款、不新增曝光、事件或 RNG；正常日仍可有其他 RNG 消費者。
- 唯讀 review 找到空白草稿 Cancel 的 no-op setter 問題；修訂 ref 改變但未 render，後續編輯被拒絕。
  真正 RED 保留在 /tmp/tenka-plot-consent-draft-red.log，不以後來 tick 掩蓋此缺陷。
  修正讓每次接受的編輯同步更新修訂 ref 與 render state，原送出回呼仍不得清空新草稿。
  修正後 compatibility 二十七項及 normal／core types 通過，唯讀 source review 通過。
- 擴充後三十二項通過：/tmp/tenka-plot-consent-draft-green-final.log。
  新增正二百金不退款、空白 Cancel 後編輯、同步新草稿與改後還原草稿保留，以及原 handler 遞迴只入列一次。
  原二十七項零金 fixture 保留，不倒推正金證據；失敗 dispatch 後重試沒有真正可達 witness，不杜撰 mock 證明。
- 第一次完整 lint 抓到測試多餘 assertion；修正後 scoped lint 通過，原失敗 log 保留。
  root 完整 types 隨後抓到測試 HTMLElement 缺少 value；此為測試型別問題，不是 production 行為驗收通過。
  三處 query 改用 HTMLSelectElement generic，normal／core types、scoped lint 與三十二項重跑均通過。
  紀錄：/tmp/tenka-plot-consent-type-fix-types.log、/tmp/tenka-plot-consent-type-fix-green.log。
  完整 lint／format 通過：/tmp/tenka-plot-consent-lint-final.log；prose checker 零違規。
- root 三檔八十九項通過：/tmp/tenka-plot-consent-integration-final.log；此不是完整 run。
  一般 build、資料、字元、字型及 assets 檢查通過；字型保持一千六百五十九字元。
  一般 bundle 首載 516268、scenario 100844 bytes，字型 355384 bytes，原預算通過。
  Pages 首載 516288、scenario 100844 bytes；產物 /private/tmp/tenka-plot-consent-pages.jiDoPe。
  五項 prefix 引用及五項複製 SHA256 通過：/tmp/tenka-plot-consent-pages-static.log。
  靜態產物不代替原生瀏覽器、GPU、production Pages 或完整遊戲旅程。
- BAL、plot command／system、generic CommandAction、uiStore、DiplomacyPanel 與 CourtPage SHA256 不變。
  保護紀錄：/tmp/tenka-plot-consent-protected.sha256；六張 frozen 截圖 SHA256 亦不變。
  本批不再量測 performance，也不重試已證實受 sandbox 限制的 headless browser。
  原生 browser、長跑、frozen 對齊與其他確認仍未完成；全遊戲目標保持原範圍。
- 計略批完整 coverage 為 4605 passed／14 failed／1 skipped，434 檔、239.94 秒。
  core 行／分支／函式為 94.58％／90.96％／97.99％；同一輪 ui 855 與 app 821 項均通過。
  此 1676 是同一 run 的分組；紀錄 /tmp/tenka-plot-consent-complete-coverage.log，整體 gate 仍失敗。
  兩項歷史、一項 day450 ownership 與十一項 frozen 比對失敗不變，沒有重錄基準或放寬門檻。
  此快照在後續 SystemMenu 修改前收集，不宣稱驗證後來的修正。

## 原創山林素材與委任、繼承支薪旅程（2026-10-09）

- 使用 built-in imagegen 產生原創山林及純林冠透明素材，未參照或複製任何原作圖片。
  選定 PNG 已存入 public/assets/textures，完整生成 prompt、尺寸、SHA-256 與透明度紀錄在 assets/generated。
  ROOT 逐圖查看內容並解碼 alpha；山圖有 626390 個零 alpha 像素，林圖有 574731 個。
  單張素材預覽不是原生遊戲畫面，也不代表整圖構圖通過。

- 實際地形接線最多十四個山區與十個森林靜態 Sprite，等比內縮並以作者輪廓遮罩。
  成功的素材僅取代對應區塊的向量山面或樹錐；失敗區塊保留原繪圖備援。
  兩種素材共用各自 Texture，不旋轉西北光照，不改核心、地圖座標或選取。
  換圖或銷毀後的晚到結果不得附加；共同 Texture 不隨單個 renderer 銷毀。
  七檔 126 項聚焦測試通過，紀錄 /tmp/tenka-terrain-raster-green-terminal-final.log。

- ROOT 查看同視角實際 helper 整圖，避免新素材與巨大灰分面山重疊。
  圖在 /private/tmp/tenka-terrain-raster-layout-final.png；仍有重複山型，尚未達商業寫實精度。
  素材延後載入；全部紋理 6470.3 KiB，首屏合計仍為 944.5 KiB。
  ROOT 素材驗證零 ERROR、零 WARN，紀錄 /tmp/tenka-raster-final-assets-verified-root.log。
  初次 ROOT 指向不存在的 checker 路徑，該命令錯誤紀錄保留，不冒充產品失敗。

- 新 m6-castle-delegation-cycle.tfulog.json 使用未改動 mini、seed42，六十一 tick、十六筆接受指令。
  玩家兩筆指令先委任再恢復直轄，四筆真正城主權限指令及十筆自然勢力 AI 指令完整執行。
  提早合法恢復的對照不產生該月委任令；每日不變量、完整重放與原生待執行續跑通過。
  正式 runOneDay 的完整 export 等於新 JSON；讀檔後 export 誠實保留 truncated，不另造完整 oracle。
  最終 hash 為 5edcb8d9f97f95b4；此旅程不是原生瀏覽器操作驗收。

- 新 m6-earned-successor-payroll-recovery.tfulog.json 使用未改動 mini、seed42，一百二十 tick、二十四筆接受指令。
  實際繼承後的軍團建立、三筆賞賜與解散明示為 trusted Beta 輸入，不冒充自發 AI 或 Alpha 玩家介面。
  day150 仍能付薪，day180 才真正欠薪；普通 A、C 承受月變動後的兩點懲罰，當主免薪且忠誠一百。
  解散返還實際五十二貫，day210 正常付薪，沒有立即補回過去忠誠損失；當主官階仍為 samurai-taisho。
  最終 hash 為 96e23560c17f9801；合法提早解散可避免欠薪，實際重記的完整 hash 改變。

- 繼承案例原生保存真正玩家行軍及自然 AI 建設，另於賞賜後、欠薪前後保存資源狀態。
  人工 Beta 指令沒有塞入保存用 AI pending 或玩家佇列；不宣稱它們的 pending codec 證據。
  兩個新旅程共三檔七項由 ROOT 獨立重跑通過，紀錄 /tmp/tenka-raster-journeys-root.log。
  既有 golden、基準圖與 BAL 不改；完整遊戲、原生畫面與外部發布驗收仍未達成。

- 最後 ROOT 全量 UI／App 為一百九十八檔、1920 項通過，耗時 169.17 秒。
  紀錄 /tmp/tenka-raster-final-ui-app-root.log；另七檔二十五項核心專案聚焦測試通過。
  聚焦紀錄 /tmp/tenka-raster-core-focus-frozen-root.log；真實素材遮罩、重放及新旅程均保留原斷言要求。
  正常及 core 型別、完整 lint、建置與 bundle 預算通過，紀錄 /tmp/tenka-raster-final-{types,lint,build,bundle}-root.log。
  首載 gzip 為 535525 bytes；既有大 chunk 警告仍保留，未宣稱建置零警告。

- 此來源凍結後單 worker 全量 coverage 結束，共 5013 通過、九項失敗、一項略過，耗時 522.86 秒。
  紀錄 /tmp/tenka-raster-complete-coverage-root.log；核心行、分支、函式覆蓋率為 94.80％、91.17％、98.47％。
  八項既有失敗仍在；新增一項是舊素材測試強制所有原創來源為 null，與允許記錄來源的契約不符。
  測試修正保留真 PNG 與來源紀錄，三十八項聚焦檢查通過，另由獨立代理重跑二十項通過。
  紀錄 /private/tmp/tenka-imagegen-manifest-green-final.log 與 /tmp/tenka-manifest-independent-review.log。

- 聚焦通過不改寫全量九項失敗結果；先前全量十項失敗紀錄也不覆寫。
  原生 headless 權限、自然無繼承人領地去向與外部發布仍未解除，M6 不前進。

### 主山脊素材與四方向軍隊（2026-10-09）

- 三條代理工作線平行處理山脊定位、軍隊朝向及素材契約，ROOT 製作原創素材並獨立驗證。
  built-in imagegen 的兩張過寬輸出超過 2048 上限，沒有接入遊戲；原始生成檔仍保留。
  最終水平圖為 1254 方形，垂直圖為 1024 × 1536，均保留原始透明像素。
  PNG 在 public/assets/textures/terrain-mountain-horizontal-v2.png 與 terrain-mountain-vertical-v2.png。
  同名 assets/generated/*.provenance.json 記錄完整 prompt、實際 hash、尺寸與 alpha。

- 地形以最長主山脊的弧長加權中心、跨度與方向選擇原生水平或垂直素材。
  中國山地、紀伊選水平，奧羽選垂直；透明內容框補償留白，沒有旋轉、非等比拉伸或重寫 PNG。
  失敗區塊只用真正載入的備援；失敗素材的內容框不套到備援圖。
  靜態十四山區、十林區上限與非互動遮罩不變，不改座標、玩法或隨機串流。

- 四方向兵陣跟隨 heading，盔甲與頭盔保持西北光源，北向士兵顯示護頸而非臉部。
  原始世界錨點、命中區域、選取與遠景通道不變；缺省、null、零向量維持原朝向。
  方向測試真實重現一項失敗後，最終軍隊與 renderer 聚焦一百二十九項通過。
  紀錄 /tmp/tenka-army-direction-red.log 與 /tmp/tenka-army-direction-green-final.log。

- ROOT 查看實際 helper 圖 /private/tmp/tenka-ridge-variants-layout-final.png 與 tenka-directional-model-preview.png。
  圖顯示方向與跨度差異，不是原生遊戲截圖；斜向山脈仍有邊坡裁切，城堡、士兵材質仍簡化。
  原生繪圖、完整構圖、效能及商業寫實精度仍未驗收，不以新診斷圖覆寫 frozen 圖。

- 山脊與軍隊來源凍結後，ROOT 全量 UI／App 一百九十八檔、1920 項通過，耗時 166.02 秒。
  七檔一百項聚焦也通過，包含真素材來源、內容框、軍隊朝向與兩個新旅程。
  紀錄 /tmp/tenka-ridge-army-final-ui-app-root.log 與 /tmp/tenka-ridge-army-focus-final-root.log。
  正常及 core 型別、完整 lint、建置、bundle、素材、資料、字型與簡體掃描均通過。
  首載 gzip 為 536642 bytes，素材首屏 944.5 KiB；全部紋理 9292.8 KiB，既有大 chunk 警告保留。
  紀錄 /tmp/tenka-ridge-army-final-{types,lint,build,bundle,assets,data,font,script}-root.log，不包含後來地表素材修改。

### 靜態地表材質（2026-10-09）

- built-in imagegen 製作原創地表 PNG，存為 public/assets/textures/terrain-ground-grass-v1.png。
  完整 prompt、SHA-256 與 alpha 在 assets/generated/terrain-ground-grass-v1.provenance.json。
  真圖 1254 × 1254、3759553 bytes，1572516 像素全部不透明；單張尺寸符合 2048 上限。
  此田紋只是美術材質，不表示實際農田、設施或發展數值。

- 地表使用一個固定世界相位的 TilingSprite 與原陸地輪廓遮罩，透明度 0.28，每格二百五十六世界單位。
  地表位於底層、水系與道路下方；每日與相機更新不重建，不使用核心隨機串流。
  失敗保留原底色，銷毀先清 mask、移除 sprite，再由 loader 釋放共享材質。
  真 NPOT 公開 API 測試與既有共同載入防護測試通過，不等同原生 WebGL 渲染驗收。
  既有晚到測試未明示 ground 指令；ground 路徑的晚到防護另經獨立來源審核，沒有誇大測試範圍。

- 獨立像素檢查量得左右跨邊 RGB 平均差 15.8785，內部相鄰平均 10.2885。
  上下跨邊為 14.7953，內部為 10.9800；跨邊整線均值均高於內部所有相鄰整線均值。
  真紀錄 /tmp/tenka-ground-edge-inspection.log 不套任意通過門檻，也不宣稱完全無縫。
  ROOT 查看 /private/tmp/tenka-ground-material-layout-final.png 與 tenka-ground-material-3x3.png。
  低對比材質減少平原空白感，但重複花紋、接縫與斜坡裁切仍可辨；這些圖不是原生截圖。

- ROOT 八檔一百零二項聚焦通過，紀錄 /tmp/tenka-ground-focus-final-root.log。
  正常及 core 型別、完整 lint、建置、bundle 與素材檢查通過。
  首載 gzip 為 540903 bytes，素材首屏維持 944.5 KiB；全部紋理 12964.2 KiB 是統計，不是首屏超標。
  地表原始 RGBA 約六 MiB，五張生成素材合計約三十 MiB，不包含 mipmap、複本或既有材質。
  此數字不是 GPU 或 heap 驗收；建置仍保留大 chunk 警告。
  紀錄 /tmp/tenka-ground-final-{types,lint,build,bundle,assets}-root.log。

- 地表來源凍結後，ROOT 全量 UI／App 一百九十八檔、1921 項通過，耗時 166.32 秒。
  紀錄 /tmp/tenka-ground-final-ui-app-root.log；六張 frozen 地圖 PNG 的 SHA-256 仍相符。
  首次整合缺 TilingSprite mock 與錯用 mask.getBounds 的失敗紀錄保留，兩者均屬測試工具問題。
  沒有聲稱產品先失敗再修好；原生 headless 仍受權限阻擋，沒有開新視窗或更新 golden。

### 原創本城素材與樂市收入旅程（2026-10-09）

- built-in imagegen 新製平城與山城 PNG，分別存為 castle-main-plain-v1.png 與 castle-main-mountain-v1.png。
  兩張皆為 1254 × 1254，檔案分別 2162878 與 2216094 bytes；原始生成檔保留。
  public/assets/textures 保存素材，assets/generated 保存完整 prompt、雜湊、透明範圍與人工地面錨點。
  人工錨點只是美術定位，不表示歷史或遊戲座標，也不是像素自動推導結果。

- 本城中近景使用原創白牆、瓦簷、石垣、護城河或岩臺，材質保持原色，不套勢力 tint。
  勢力旗、耐久環與警戒獨立保留；遠景、支城及缺素材時使用原向量模型。
  城郭依可見寬等比縮放至二十八世界單位，地面位置與命中範圍不變。
  ROOT 查看 tenka-castle-body-art-model.png；此為 helper 放大合成圖，不是遊戲截圖。
  軍隊仍偏符號化，地表重複與裁切問題仍存在，不宣稱商業遊戲畫面水準。

- 七張生成素材的原始 RGBA 合計約四十二 MiB，不含 mipmap、複本或既有材質。
  素材統計為 17240.5 KiB，首屏仍為 944.5 KiB；兩張城郭使用獨立延後載入。
  metadata 四十一項通過，包含真正 PNG／JSON 與 runtime frame、anchor 一致性。
  紀錄 /private/tmp/tenka-castle-art-metadata-green.log；此檢查不證明 GPU 或 heap 驗收。

- 新增 m6-rakuichi-income-ownership.tfulog.json，未改動 mini 種子四十二正常執行三十一日。
  十三筆接受命令包含三筆玩家與十筆自然 AI；日九十七真正制壓郡，城池仍屬 Beta。
  日一百二十 Alpha 收入為一百八十八，舊城主政策算法為一百八十一；最終 hash 為 f448ba666e2dd981。
  真正 runOneDay 產生自然 AI 並匯出相同全紀錄；月報 observer 收到實際收入與金錢結算。
  原生存檔保留真正待執行命令，續跑結果一致；載入後匯出仍明示 truncated。
  ROOT 獨立五項通過，紀錄 /tmp/tenka-castle-rakuichi-driver-root.log，不冒充原生瀏覽器旅程。

- 合法撤銷政策的對照也移除每日商業成長，不宣稱相同資源的對照。
  案例停於日一百二十一；探索續跑在日一百二十三失去該郡，不宣稱永久占領。
  六張 frozen strategy 圖片雜湊仍相符；不改核心、BAL、舊 oracle 或里程碑。
  原生 headless 仍受沙箱權限阻擋，不開新視窗；完整遊戲與發布驗收仍未達成。

- 城郭來源凍結後，ROOT 全量 UI／App 一百九十九檔、1925 項通過，耗時 36.52 秒。
  紀錄 /tmp/tenka-castle-final-ui-app-root.log；另外八檔一百三十七項素材與繪製聚焦通過。
  城郭真正晚到 promise 測試包含換局、單張失敗、每日不重建及卸載不附加。
  兩處舊 Assets mock 不釋放載入材質，改為 alias 快取與 unload 釋放，不放寬原銷毀斷言。
  這是測試工具修正，不宣稱產品先漏記憶體再修好；原失敗紀錄保留。
  正常及 core 型別、完整 lint 與建置通過，大 chunk 警告保留。

- tsx CLI 的 IPC listen 受 EPERM 阻擋，原紀錄為 tenka-castle-final-bundle-root.log。
  改用 node --import tsx 執行相同 bundle 與素材檢查，兩者通過，不提升權限。
  最終紀錄 /tmp/tenka-castle-final-{bundle,assets}-node-root.log；靜態紀錄為同前綴 types、lint 與 build。
  全量測試耗時不是隔離效能量測；本批未重跑完整 core coverage，不改先前九項失敗紀錄。

### 四向兵群素材與橋梁材質（2026-10-09）

- built-in imagegen 製作東、西、北、南四張原創兵群 PNG，全部為 1254 × 1254。
  正式路徑 public/assets/textures/army-infantry-{east,west,north,south}-v1.png，四檔合計 5259136 bytes。
  完整 prompt、雜湊、透明範圍、人工腳底錨點與實際參考鏈保存在 assets/generated 同名 provenance。
  東向參考自家城郭，其餘三向參考東向兵群與城郭；原工具輸入路徑另保留，不抹去引用。
  素材只表現一般步兵，不新增兵種或宣稱特定歷史部隊；原工具生成檔均保留。

- 原兵群仍有色邊，另用 built-in imagegen 做四張精準清理版本，結果沒有改善。
  alpha 大於八、R 大於 G 與 B 各乘一點七的像素，東向從 8014 增為 23388。
  西向從 19335 增為 34277，北向從 4324 增為 7898，南向從 23852 增為 27385。
  紀錄 /tmp/tenka-army-fringe-inspection.log；這是顏色啟發式統計，不是邊緣隔離或視覺通過門檻。
  較差的 v2 移至 /private/tmp/tenka-army-rejected-cleanup，不作正式載入；原生成檔仍可取回。
  原 v1 作評估用接線，JSON 明示色邊仍存在，不宣稱乾淨邊緣或商業遊戲品質。

- 軍隊保留後層地面環與勢力旗、中層士兵、前層狀態及兵數，不用大旗遮掉兵群。
  東西南北各自繪製，沿用方向判定與固定左上光源；不旋轉、鏡射或勢力染色整張素材。
  可見範圍等比限制在二十六乘二十八世界單位，人工前排腳底對齊原位置十一、負一。
  世界座標、命中區、兵數底板與標籤不變；遠景與缺圖方向保留完整原向量版本。

- 空地圖不請求軍隊圖片，第一支實際軍隊出現才共用載入四張，一次請求延續到換圖。
  失敗不按日或每支軍隊重試；換圖與卸載後的晚到結果不得附加。
  軍隊移除與卸載先分離 sprite，再由 loader 釋放共享材質，不銷毀其他軍隊的來源。
  根節點使用真正 Container，避免 Pixi 對 Graphics.addChild 的棄用警告，不壓掉警告。
  ROOT 查看 tenka-army-body-art-comparison.png：盔甲材質改善，但大旗與兵數牌仍占主要輪廓。
  此圖使用真 helper、PNG 與標籤尺寸，不是原生遊戲截圖；中景細節與色邊仍待改進。

- 原始圖與來源引用驗證五十五項通過，包含四向 runtime frame、人工 anchor 與實際 PNG／JSON。
  引用鏈逐檔驗證既有原創來源，拒絕外部、越界、缺檔、雜湊漂移、非原創與循環引用。
  此檢查證明檔案與來源聲明一致，不是機器自動證明版權；沒有改寫舊七張的空引用記錄。
  全部紋理 22376.4 KiB，首屏仍為 944.5 KiB；四張兵群原始 RGBA 約二十四 MiB。
  十一張生成素材合計約六十六 MiB，不含 mipmap、複本或既有材質，不代表 heap 或 GPU 驗收。

- 橋梁加上五片低對比木板、東南暗面、西北亮緣與四條石橋頭接縫。
  原橋面、橋頭、升高高度、方位、路網與 LOD 保留，不增加隨機紋理或核心規則。
  真正缺材質的四項 RED 保留；最終原幾何、材質及 footprint 與 highlight 五十九項通過。
  ROOT 獨立五十九項通過，紀錄 /tmp/tenka-army-bridge-final-root.log。
  ROOT 查看 tenka-bridge-material-before.png 與 after.png；低對比材質變化小，不冒充整體寫實提升。

- 最終來源凍結後，ROOT 十二檔二百九十四項聚焦通過，紀錄 tenka-army-final-focused-root.log。
  全量 UI／App 一百九十九檔、1933 項通過，耗時 37.02 秒，紀錄 tenka-army-final-ui-app-root.log。
  正常及 core 型別、完整 lint、建置、bundle 與素材檢查全部通過，大 chunk 警告保留。
  首載 gzip 為 542946 bytes；紀錄 /tmp/tenka-army-final-{types,lint,build,bundle,assets}-root.log。
  相同來源的六張 frozen strategy PNG 雜湊仍相符；本批不改核心、BAL、舊 oracle 或里程碑。
  此全量 UI 耗時不是效能量測；未重跑完整 core coverage，不取代先前九項失敗紀錄。

- 整體畫面仍未達成使用者要求的品質：支城仍向量化，大旗與兵數牌偏大，地形重複與硬邊仍存在。
  原生 headless、整體 GPU 與 heap 驗收仍受限制，沒有開新視窗或重試已拒絕的權限路徑。
  全國長跑、規則裁定、完整測試與發布閘門仍未達成；本批不將完成範圍縮成素材通過。

### 原創支城素材（2026-10-09）

- built-in imagegen 製作平地與山地兩張原創支城，各為 1254 × 1254。
  路徑 public/assets/textures/castle-branch-{plain,mountain}-v1.png，合計 3856466 bytes。
  兩張各參考自家同地形本城的材質，不使用商業遊戲素材。
  完整 prompt、實際引用、PNG 雜湊、透明範圍與人工地面錨點保存在同名 provenance JSON。

- 支城採兩層天守，較本城低矮；平城帶窄護城河，山城帶岩坡與階梯式石垣。
  ROOT 檢視實際生成檔，確認透明背景與完整輪廓；少量色邊仍存在。
  這是評估用素材，不宣稱整體畫面已達成使用者要求或原生視覺驗收。

- runtime 保留本城二十八、支城二十世界單位的等比可見寬度與人工地面錨點。
  四種材質共用一次載入；失敗按種類備援，換圖與卸載後的晚到結果不得附加。
  旗幟、選取圈、警告、世界座標與共享材質所有權不變；支城仍只於近景顯示。
  ROOT 六檔 156 項聚焦通過，紀錄 /tmp/tenka-branch-final-focused-root.log。

- 第一次全量 UI 測試為 1928 通過、五項失敗，原紀錄保留。
  換圖 fixture 將兩代八次請求一起取出，違反單代四次斷言；未清理 spy 又污染四項後續測試。
  修正分代取出與 finally 清理，不改地形斷言或產品規則。
  原紀錄 /tmp/tenka-branch-final-ui-app-root.log，不用新的聚焦結果取代原失敗。

- 來源凍結後，ROOT 全量 UI／App 一百九十九檔、1933 項通過，耗時 37.13 秒。
  紀錄 /tmp/tenka-branch-final-ui-app-refrozen-root.log；此耗時不是隔離效能量測。
  正常及 core 型別、完整 lint、建置、bundle 與素材檢查通過，大 chunk 警告保留。
  紀錄 /tmp/tenka-branch-final-{types,lint,build,bundle,assets}-refrozen-root.log。
  紋理 26142.5 KiB，首屏仍為 944.5 KiB；十三張生成素材原始 RGBA 約七十八 MiB。
  此數量不是 heap 或 GPU 驗收；本批未重跑完整 core coverage，不改九項原失敗紀錄。

- ROOT 查看 /private/tmp/tenka-scene-tokai-current.png 與 regional-current.png。
  此離線場景使用真道路、水系 helper、城池與軍隊素材，不是原生遊戲截圖。
  合法行軍來自正常日結算；診斷未重現完整 waypoint，不能證明實際軍隊位置。
  圖中缺 HUD、標籤、領土、情報與完整相機裁切；fallback 比較不是歷史修改前畫面。
  山脊仍呈重複條塊，海岸折線與平面水系明顯，整體美術要求仍未達成。

### 山體淡化與水系材質（2026-10-09）

- 山體材質在原多邊形內加入靜態漸淡遮罩，原精確裁切與貼圖位置不變。
  每個成功 patch 使用 128 × 128 像素，最多十四個，像素資料合計上限 917504 bytes。
  遮罩將覆蓋度寫入 RGB、alpha 固定 255，符合實際 Pixi 紅通道乘 alpha 的語意。
  遮罩擁有自己的材質來源並於卸載釋放；原畫仍由 loader 持有，森林處理不變。

- ROOT 檢視同程序的 feather-isolated-before 與 after 診斷圖。
  兩圖只切換山體遮罩，水系、道路、城池與軍隊一致，不能用平行修改前後圖歸因。
  硬切邊緣較柔和，但重複山峰與條狀山脊仍存在，未達成連續寫實地形。
  此圖不是原生截圖；新增遮罩的濾鏡、GPU 配置與繪製成本仍未驗收。

- 水系沿原河道疊加較窄的深色通道與淡亮線，沿用原線寬、端帽、taper 與 LOD。
  湖泊保留原填色與外框，新增兩道向內的低對比岸線，不改多邊形。
  湖岸測試使用實際 Pixi CPU 線條生成函式，正反繞序皆保留原座標與範圍。
  海岸先畫原輪廓水色描邊，再畫全部不透明陸地，遮掉內側與相鄰島嶼上的部分。

- ROOT 檢視 /private/tmp/tenka-water-isolated-before.png 與 after.png。
  診斷只含相同三島、十條河流與兩湖；原演算法參考與新 helper 使用同一視窗。
  SVG 將向內描邊模擬為加倍線寬與原多邊形裁切，不冒充 Pixi 像素輸出。
  河道深淺與湖岸變化可見，海岸細線微弱；海岸仍折線化，水系仍未達寫實品質。

- 首次 ROOT 聚焦為九十九通過、一項測試載入路徑失敗，原紀錄保留。
  真正幾何斷言未刪除，改從實際檔案載入 Pixi 後，四檔一百項全部通過。
  紀錄 /tmp/tenka-water-ridge-focused-root.log 與 focused-refrozen-root.log。
  此 CPU 幾何證據不代表原生像素輸出；本批不改核心、BAL、資料或舊 oracle。

- 凍結來源後，ROOT 全量 UI／App 一百九十九檔、1936 項通過，耗時 36.72 秒。
  紀錄 /tmp/tenka-water-ridge-ui-app-root.log；並行耗時不作隔離效能量測。
  正常及 core 型別、完整 lint、建置、bundle 與素材檢查通過，大 chunk 警告保留。
  首載 gzip 為 543819 bytes；素材量與首屏素材量不變，新增遮罩不納入磁碟素材預算。
  紀錄 /tmp/tenka-water-ridge-{types,lint,build,bundle,assets}-root.log。
  原生濾鏡、GPU 與 heap 尚未驗收，未重跑完整 core coverage，不改先前九項失敗紀錄。

### 未採用的山體斜坡底座（2026-10-09）

- 平行檢查確認，成功山體材質會隱藏同山的原立體坡面與樹冠。
  試作保留低對比斜坡、再覆蓋山脊圖片，兩種方案均只作離線比較。
  不透明版本露出淺色多邊形板塊；低透明版本改善有限，且重新出現分面與光暈。
  ROOT 檢視兩張 proposal 圖後否決採用，terrainDraw 與測試均未因這個試作修改。

- 實際十四山體產生 7300 個快取面，其中原成功材質覆蓋 7168 個坡面與 124 個樹冠面。
  保留坡面會額外繪製 7168 面，沒有足夠的視覺收益支持這個成本。
  診斷 /private/tmp/tenka-scene-tokai-slope-underlay-{before,proposal,low-alpha-proposal}.png。
  統計 /tmp/tenka-slope-underlay-counts.log；這不是幀率或 GPU 效能量測。

### 兵群優先的軍旗與兵數牌（2026-10-09）

- 成功載入的中／近景兵群改用 painted 軍旗 profile，旗寬為原級距的 0.55，旗高十五。
  原旗桿三十、兵群二十六乘二十八、人工腳底錨點、世界座標與命中區不變。
  遠景與缺圖備援保留原旗形；pure helper 預設 legacy，原六十四項斷言不改。
  軍團腰帶、敗走傾斜、低士氣破裂與敵軍旗尾依新旗面定位，徽章跟隨旗寬移動。

- 地面關係圈、選取圈、方向箭頭、士氣點與兵數座標不變。
  兵數牌統一深墨底與象牙字，保留十二像素字級、尺寸、精確／縮寫、收合與交錯規則。
  牌面不依圖片載入切換，避免晚到素材只重繪兵群、卻遺留舊牌面。
  實際色彩 token 對比測試高於 4.5，不代表原生字型或視覺驗收。

- ROOT 查看 /private/tmp/tenka-army-profile-isolated-comparison.png。
  同一兵群、腳底、牌面與標籤比較兩種軍旗；窄旗讓盔甲與士兵輪廓較清楚。
  前後列皆為深墨牌面，只隔離旗形，不能當作舊白牌改色的前後截圖。
  四方向與敗走、低士氣、敵軍、軍團、缺糧仍可辨認；色邊與牌面占比仍待改善。

- 真正新契約 RED 為兩項失敗、七十八項通過，紀錄 tenka-army-compact-red-actual.log。
  擴充後的三項浮點精確比較失敗另保留，改用座標容差，不刪除幾何斷言。
  ROOT 三檔 156 項聚焦通過，紀錄 /tmp/tenka-army-profile-focused-root.log。
  04 明定軍隊固定世界半徑、城郡有 CSS 下限，本批未改點擊規則或宣稱軍隊有 32 CSS 像素下限。

- 首次綠燈後，ROOT 查出窄旗的直線裂紋會越過燕尾缺口，與內縮旗框的註解不符。
  真正三個兵力級距反例全部失敗，紀錄 /tmp/tenka-army-compact-crack-red.log。
  新旗形裂紋改沿內縮燕尾輪廓折轉，原 legacy 不變。
  新測試驗證線段端點、中點與半像素描邊空間；ROOT 最終三檔 159 項通過。
  紀錄 /tmp/tenka-army-profile-focused-refrozen-root.log；先前綠燈不代替這個修正後來源。
  最終 helper 圖另存 comparison-v2.png，保留修正前的 comparison.png；ROOT 檢視內折裂紋。

- 修正後來源凍結，ROOT 全量 UI／App 一百九十九檔、1936 項通過，耗時 38.97 秒。
  紀錄 /tmp/tenka-army-profile-ui-app-refrozen-root.log；並行耗時不作效能量測。
  正常及 core 型別、完整 lint、建置、bundle 與素材檢查通過，大 chunk 警告保留。
  首載 gzip 為 543959 bytes，素材與首屏素材量不變，六張 frozen strategy PNG 雜湊仍相符。
  紀錄 /tmp/tenka-army-profile-{types,lint,build,bundle,assets}-refrozen-root.log。
  未重跑完整 core coverage，不改九項原失敗紀錄；全國長跑、原生畫面與發布驗收仍未完成。

### 龍興繼承資格的規格衝突（2026-10-09）

- 目前 tokai.json 中龍興生年 1548，未指定 debutYear，實際預設為 1563。
  00 與 02 明定十五歲成年；14 要求義龍在 1561 年死亡、龍興繼任。
  岐阜市官方城主資料記龍興於 1561 年繼任，但未證明其實際元服年。
  來源 https://www.city.gifu.lg.jp/kankoubunka/kankou/1013051/1005097/1034742/1034737.html。

- 顯式 debutYear 在年度 hook 可提早登場，但不能據此宣稱較高優先規格已授權例外。
  月度自然死亡先於正月登場；若義龍排在正月死亡，單改登場年仍不能保證繼承。
  已詢問是否接受有來源的劇本家督資格例外，尚未改資料、核心、BAL 或死亡順序。
  實際未改全國種子在第 450 日失敗的紀錄保留，不注入繼承人來掩蓋問題。

### 山體新版與未採用的縱向候選（2026-10-09）

- built-in imagegen 產生不等高岩峰與連續林地的水平 v3，減少舊版重複梳齒輪廓。
  採用檔案為 public/assets/textures/terrain-mountain-horizontal-v3.png；完整提示記錄在對應 provenance JSON。
  實際尺寸為 1774 × 887，並非提示要求的正方形；透明內容框為 12、213、1752、480。
  水平選擇器與內容框改用新版，保留舊素材、舊框及垂直 v2，不改地圖座標或裁切規則。

- 同一程序輸出全國、區域與東海的舊版及候選 SVG，再以 rsvg 轉為 PNG。
  ROOT 檢查相同視角的東海、區域及全國合成圖；水平峰形較自然，覆蓋長度不變。
  原始對照保留於 /private/tmp/tenka-scene-tokai-mountain-v2-current.png 與 mountain-v3-proposed.png。
  這些圖使用實際繪圖 helper，但沒有 HUD、城名或勢力覆蓋層；不等同原生瀏覽器截圖。

- 縱向 v3 的內容框過寬，寬度限制令奧羽、木曾及飛驒覆蓋長度縮短約百分之三十八、三十四及二十七。
  因此不採用縱向 v3；候選 PNG 與完整提示存於 assets/generated/candidates，不加入 runtime manifest。
  覆蓋統計保留在 /tmp/tenka-mountain-v3-coverage.log；不以素材產生成功代替整圖品質判定。

- 再以 built-in imagegen 產生窄長縱向 v4，採用 public/assets/textures/terrain-mountain-vertical-v4.png。
  完整提示與實際來源記錄在對應 provenance JSON；未引用商業遊戲圖片或其他輸入素材。
  實際尺寸為 1024 × 1536，內容框為 359、48、339、1381；不假稱輸出符合正方形要求。
  同程序東海及區域圖減少梳齒感，飛驒與木曾長度不變；多數山體兩側寬度約減少百分之三十六。
  奧羽覆蓋高度由 364.51 增至 522.72 世界單位；山體仍是孤立山脊，尚未形成完整自然山面。

- 素材代理的五十七項來源與真實 PNG 檢查通過，紀錄 /private/tmp/tenka-horizontal-v3-metadata-green-final.log。
  初次兩項失敗發生在 manifest 與選擇器尚未同步時，原紀錄保留，不當成行為反例。
  ROOT 三檔四十四項聚焦檢查通過，紀錄 /tmp/tenka-mountain-horizontal-root-focus-corrected.log。
  第一次 ROOT 使用錯誤的 ui project 篩選而未收集測試；空結果不當成通過。

- 僅採用水平新版時，十四組生成素材的驗證通過，紋理總量 27515.8 KiB，首屏維持 944.5 KiB。
  新水平素材為 1406252 bytes，原始 RGBA 為 6294152 bytes；十四張原始 RGBA 合計 88070624 bytes。
  這些是檔案與像素估算，不是 GPU、heap、FPS 或原生畫質驗收。
  六張既有策略截圖的雜湊不變；全量核心失敗、長期劇本與完成度門檻仍保留。

- 水平 v3 與縱向 v4 的定稿素材共十五組，來源代理五十七項真實 PNG 與竄改檢查通過。
  紀錄 /private/tmp/tenka-vertical-v4-metadata-green.log；紋理總量 29087.9 KiB，首屏仍為 944.5 KiB。
  十五張原始 RGBA 合計 94362080 bytes，約九十 MiB；普通地圖載入只取已選方向與 fallback。
  ROOT 七檔 169 項山體、renderer 與素材聚焦檢查通過，紀錄 /tmp/tenka-mountain-root-focus-refrozen.log。
  最終已選素材合成圖存為 assets/generated/previews/map-2.5d-h3-v4-helper.png，不冒充原生畫面。

### 正常落城捕虜交接與原生待執行續跑（2026-10-09）

- 未改動 mini、種子四十二，以六筆合法玩家軍事指令與全部自然 AI 正常推進。
  第六十二個 tick、絕對日一百五十二，Beta 本城落城並真正捕獲 Beta 當主。
  Beta 有真正繼承人及存續城池；原勢力、捕獲勢力與每日不變量均檢查，不涉及無繼承人新規則。
  原本實際 FIFO 只有兩張月報，沒有捕虜處置；真實失敗保留於 /tmp/tenka-earned-captive-route-red.log。

- bridge 在正常 tick 完成後，把當日實際玩家捕獲事件交給新的 captivePresentation。
  交接保留原月報及事件擁有者，拒絕重複武將、已排決策、過期局、非主畫面及無效捕虜。
  debug 跳轉不開互動處置；讀檔不掃描或重播既存捕虜。
  同日新月報在新增捕虜後入列；這是來源分支順序，不假稱種子四十二見證同日月首捕獲。

- 真正 CaptiveModal 的釋放按鈕只排一筆 handleCaptive，當下狀態與 RNG 不變。
  初始出陣及待執行釋放皆經原生格式 encode／decode，再由正常 bridge 結算。
  釋放只發生一次，武將回原 Beta 存續城池，聲望使用既有 BAL 上限與增量。
  續跑與原路徑的完整事件、持久狀態及 RNG 相同；不注入捕虜，不改核心、資料或舊重放雜湊。
  這是 bridge 加實際處置元件旅程，不是完整 Main 指標操作或原生瀏覽器驗收。

- 獨立審查發現重設函式遍歷即時所有權 Map，可能刪掉同步新增的新局捕虜對話框。
  真正訂閱回呼反例先失敗，紀錄 /tmp/tenka-earned-captive-reset-red.log。
  重設改為先快照並清空舊所有權，再只關閉快照描述；新局與無關 FIFO 不受舊重設影響。
  ROOT 三檔十二項聚焦回歸通過，紀錄 /tmp/tenka-earned-captive-root-focus-refrozen.log。
  更早完整 UI／App 1943 項通過，但採用重設修正前來源；不把舊結果當成定稿全量證據。

- 較早 harness 失敗來自省略實際 executorId: null、誤把換局後 tickSeq 視為零，以及忽略標題頁月報清理。
  對應原始失敗紀錄保留；修正期望值，不刪掉命令、換局或 FIFO 斷言。
  原生格式只省略 ai.intentLog 診斷歷史，比對時明示排除此欄，不修改持久狀態或 RNG。
  真正元件處置與正常日結算斷言結束後卸載元件，再執行 helper 排除檢查，消除新的 act 警告。
  定稿 ROOT 三檔十三項通過，紀錄 /tmp/tenka-earned-captive-root-focus-clean-final.log；來源與八項新斷言保留。

- ROOT 正常及 core 型別、全量 lint、建置、bundle 與素材驗證通過。
  紀錄 /tmp/tenka-mountain-captive-{types,lint,build,bundle,assets}-final-root.log；首載 gzip 為 544509 bytes。
  建置仍有既有五百 KiB chunk 警告；不改警告門檻，也不當成全量核心驗收。
  初次 lint 的 prefer-const 與後續格式失敗紀錄保留，修正後重新驗證。

- 最後測試 harness 凍結後，ROOT 全量 UI／App 二百檔、1945 項通過，耗時 37.24 秒。
  紀錄 /tmp/tenka-mountain-captive-ui-app-final-root.log；六張策略截圖雜湊與 git diff 檢查仍通過。
  定稿來源仍未通過原生 headless 畫質、heap、FPS 或完整核心長期驗收；不宣稱遊戲完成。

### 海面層次、林冠候選與正常計略結算（2026-10-09）

- 三條代理工作線分別處理海面、山體材質及實際玩法測試，ROOT 獨立查看對照圖與驗證來源。
  海面一次建立三十二條低對比色帶及九十六條短浪線，不使用時鐘或隨機數。
  四層海岸方案露出明顯條帶，未採用；定稿改為十六層薄描邊，原始海岸多邊形不變。
  所有陸地最後填色，水側描邊不跨進島嶼；沒有新增動畫或逐 tick 工作。
  ROOT 檢視同程序 soft-before／after-v2 東海圖；這不是原生瀏覽器截圖或真實水深資料。
  四檔九十三項聚焦通過，紀錄 /tmp/tenka-ocean-plot-focused-root.log。

- built-in imagegen 產生原創不透明林冠材質，不參照商業遊戲圖片。
  原始 PNG 為 1254 × 1254、3910425 bytes，完整提示及 alpha、SHA-256 存入對應 provenance JSON。
  對邊像素不完全相符，不稱為已驗證 seamless；九十六世界單位的離線預覽沒有顯眼接縫。
  第一版煙霧底板及第二版重複直立樹帶未採用；第三版連續小樹冠已接入 runtime。
  林冠仍有重複感，原山區多邊形外的大面積平地仍未改善，不宣稱整張地圖完成。
  十六組真實 PNG／來源檢查二十五項通過，紀錄 /tmp/tenka-woodland-provenance-root.log。

- 林冠使用共享原圖 TilingSprite，每山區自有靜態高度與邊緣遮罩，原精確多邊形另行裁切。
  固定世界週期為九十六，實際 Pixi inverse matrix 測試涵蓋不同起點、負座標與非二次冪原圖。
  十四張 256 × 256 遮罩合計 3670016 bytes，不旋轉材質、不改山峰位置或逐 tick 重建。
  卸載只銷毀自有遮罩，共享原圖由 loader 保留；缺山峰時不以林冠假裝成功覆蓋。
  helper 與既有 raster 十七項通過，renderer 與 host 一百一十七項通過，晚到材質 Promise 有實際反例測試。
  紀錄 /tmp/tenka-woodland-helper-green-fixed.log 與 tenka-woodland-renderer-green-final.log。

- ROOT 查看 production 遮罩與世界相位的同程序前後圖，採用較連續的林地底材。
  圖另存 assets/generated/previews/map-2.5d-woodland-ocean-helper.png，沒有覆寫先前 H3/V4 圖。
  合成沒有 HUD、標籤或領地層；不能當作原生遊戲截圖、GPU 遮罩或完整構圖驗收。
  十六張原始生成素材 RGBA 合計 100652144 bytes；全部紋理 32906.7 KiB，首屏仍為 944.5 KiB。
  素材檢查零 ERROR／WARN，紀錄 /tmp/tenka-woodland-assets-root.log；這些是檔案與像素量，不是 heap 或 GPU 量測。

- 實際 PlotPanel 在未改動 mini、種子四十二提交流言計略，正常 bridge 推進九十一日。
  全部自然 AI 保留，三個月首真正支付每月三十貫；進度依正常月度 hook 累積。
  絕對日一百八十自然失敗，只產生一筆失敗報告並釋放忙碌狀態，不預設計略必定成功。
  真正待執行 START 及第 143 日兩筆自然 AI pending 皆通過原生格式續跑比較。
  完整 export 有一筆玩家及十筆自然 AI 指令，實際雜湊 cdff83df771a8ec1，不新增舊 oracle。
  元件、bridge 與報告文字 helper 通過，不冒充完整 Main 或原生指標操作。

- 先前全量 coverage 為 5111 通過、十項失敗、一項略過，512 檔、105.74 秒。
  紀錄 /tmp/tenka-h3-v4-captive-complete-coverage-root.log；核心行／分支／函式為 94.80％／91.17％／98.47％。
  八項既有失敗仍在；另有實際 App 存讀旅程超時及海面測試在平行修改中的舊來源失敗。
  海面定稿聚焦通過不扣掉原始全量失敗數；此全量不是來源凍結後的定稿驗證。

- App 存讀旅程隔離執行六項通過，但相同 V8 coverage 下仍有一項五秒超時。
  紀錄 /tmp/tenka-production-event-isolated-after-coverage.log 與 isolated-with-coverage.log。
  保留原斷言及 timeout，尚未把儀器化超時宣稱為已解決或整體驗收通過。

- 隔離 CPU profile 指向領地最近郡搜尋，而非原生格式解碼或事件目錄等待。
  搜尋保留原環、桶與 seed 次序及 Math.hypot 比較，只在嚴格幾何下界證明結果不會改變時停下。
  同距仍按原先後順序選取；世界外 seed 的邊界桶、稀疏區域與距離上限均保留原行為。
  真正工作量反例原本呼叫兩次，修正後只需一次；原失敗紀錄在 /private/tmp/tenka-territory-pruning-red-clean.log。
  全國所有 cell 與獨立舊版全環 oracle 逐位元相同，十九項通過，沒有跨遊戲快取。
  紀錄 /private/tmp/tenka-territory-pruning-green-frozen.log；原範例輸入形狀失敗另保留，不冒充產品反例。

- 修正後相同 App V8 六項全部通過，原超時案例 3519 ms，原五秒限制及斷言不變。
  紀錄 /private/tmp/tenka-territory-pruning-app-coverage.log；這不是 FPS、原生圖像或完整效能 gate。
  當前山林來源也參與執行，不能把前後耗時全歸因於單一變更。
  ROOT 正常及 core 型別、完整 lint、建置、bundle 與素材驗證通過，既有大 chunk 警告保留。
  紀錄 /tmp/tenka-woodland-ocean-{types,lint,build,bundle,assets}-final-root.log；首載 gzip 為 545844 bytes。

- ROOT 初次山林聚焦只收集五檔五十項，指定的 renderer 測試路徑不存在，因此沒有收集該檔。
  保留 /tmp/tenka-woodland-ocean-plot-focus-root.log，不把五十項當成含 renderer 的驗證。
  改用真正 src/ui/map/mapRendererDirty.spec.ts 後，另三檔九十四項通過，包含完整領地比較。
  紀錄 /tmp/tenka-woodland-territory-root-correct-path.log；原 renderer 幾何與共享生命週期斷言保留。

- 與完整 lint／build 平行的首輪 UI／App 為 1950 通過、兩項失敗，201 檔、40.65 秒。
  紀錄 /tmp/tenka-woodland-ocean-ui-app-final-root.log；兩項皆為通知關閉回呼等待失敗。
  原樣單獨重跑兩項通過，MainScreen 與 ReportStack 合計七十三項也通過，沒有改斷言或 timeout。
  紀錄 /tmp/tenka-toast-dismiss-targeted.log 與 tenka-toast-dismiss-main-report.log。
  尚無產品缺陷證據，不杜撰所有權修正；原始失敗數仍保留，完整來源凍結重跑另記。

- 來源凍結且其他 CPU 工作結束後，ROOT 以最多兩個 worker 重跑完整 UI／App。
  二百零一檔、1952 項全部通過，耗時 96.54 秒，原通知斷言與 timeout 不變。
  紀錄 /tmp/tenka-woodland-ocean-ui-app-refrozen-root.log；沒有把先前兩項失敗從原始紀錄扣除。
  這是功能回歸證據，不是隔離 FPS、GPU、heap 或原生視覺驗收。

- 山林、海面及領地搜尋來源凍結後，全量 coverage 為 5131 通過、十項失敗、一項略過，515 檔、298.80 秒。
  紀錄 /tmp/tenka-woodland-ocean-complete-coverage-refrozen-root.log；核心行／分支／函式為 94.80％／91.18％／98.47％。
  八項既有核心失敗仍在；App 目錄存讀案例通過，但 MainScreen 兩項通知等待在儀器化全量下仍失敗。
  一般 UI／App 1952 項通過不扣除這個全量十項失敗，也不把 coverage 百分比當成完整驗收。
  此 run 沒有其他 CPU 工作，不能只以並行 lint 解釋通知問題；尚待真正 timer 時序診斷。

- 後續唯讀診斷在相同 V8 下重現兩項失敗，tmp setup 記錄真正 timer 與 dismissal spy 呼叫。
  同步地形工作結束後，逾期的五十毫秒 poll 先記下零呼叫，再執行三百毫秒 timer 的真正回呼。
  一千毫秒 timeout 隨即使用上一輪錯誤拒絕，沒有再次 poll；兩項 dismissal 實際皆呼叫一次。
  紀錄 /tmp/tenka-toast-dismiss-v8-trace-final.log；沒有取消 timer、假時鐘或已證實的所有權缺陷。
  因此不改通知語意或 timeout，轉而查驗地形遮罩的同步計算成本。

- tmp 平方距離候選與既有 production 的十四張實際遮罩逐位元一致，3670016 bytes 全數相同。
  實際單批舊版 Math.hypot 呼叫為 14213560 次，候選為預先計算線段、比較平方距離及 587887 次平方根。
  這是操作次數，不是速度、FPS 或 GPU 量測；較早按上界推估的三千六百萬次不是實測。
  紀錄 /tmp/tenka-woodland-squared-mask-parity.log；沒有據此宣稱所有任意浮點輸入均等價。
  代理正在將同像素候選接入 helper 並保留舊演算法作獨立回歸，定稿驗證另記。

- 同像素優化已接入山林 helper；僅預先計算線段及改用最小平方距離，不改取樣、週期或材質所有權。
  原四項 helper 斷言保留，新增完整舊演算法逐位元比較及反向、負座標、重複邊與零範圍對照。
  真正平方根工作量反例先失敗，紀錄 /tmp/tenka-woodland-mask-optimization-red.log。
  七項定稿通過，紀錄 /tmp/tenka-woodland-mask-optimization-green.log；沒有放寬像素容差。

- 原兩項通知與完整 MainScreen 六十四項在相同 V8 下通過，原斷言與等待限制不變。
  紀錄 /tmp/tenka-woodland-mask-main-{two,full}-v8.log；較早十項完整失敗仍保留，聚焦不改寫全量結果。
  獨立唯讀審查未發現實際取樣、裁切、phase 或共享材質生命週期回歸。
  任意浮點幾何、原生 GPU 像素及 FPS 仍未驗收，不以操作次數當成效能 gate。

- 優化定稿來源凍結後，ROOT 八檔 147 項聚焦通過，涵蓋真實像素、renderer、領地與計略旅程。
  紀錄 /tmp/tenka-woodland-mask-focus-final-root.log；正常與 core 型別、完整 lint、建置與素材檢查通過。
  紀錄 /tmp/tenka-woodland-mask-{types,lint,build,bundle,assets}-final-root.log，既有大 chunk 警告不隱藏。
  首載 gzip 為 545888 bytes，scenario 為 100841 bytes，字型為 355600 bytes，原預算不變。

- 四 worker 定稿完整 coverage 為 5136 通過、八項失敗、一項略過，515 檔、169.03 秒。
  紀錄 /tmp/tenka-woodland-mask-complete-coverage-final-root.log；核心行／分支／函式仍為 94.80％／91.18％／98.47％。
  完整 run 的 UI／App 均通過，原 Main 通知兩項及 App 事件存讀六項均保留原限制。
  八項既有核心失敗仍在，沒有重錄基準；前兩個十項失敗 run 與 timer trace 各自保留。
  worker 數及來源均變動，整體耗時不當成單一優化的速度量測；原生 headless、GPU 及全遊戲品質仍未驗收。

### 貼地道路與田野材質評估（2026-10-09）

- 三路平行檢查道路、低地材質與海岸資料；圖像均為無視窗 helper 診斷，不是原生瀏覽器截圖。
  既有草地改為較大週期或提高透明度，仍缺少田野層次，兩項提案未採用。
  海岸來源已簡化；原始檔含三個收尾點共 473 點，現行 outline 為 470 點。
  重新產生相同來源不能復原細節；內側淡色岸線也凸顯折角，未接入 production。

- 中近景二、三級道路改為置中的土色路肩，移除位移陰影與亮邊，保留原路面寬度及路徑。
  每條邊最多 128 個細石紋，合併一次 stroke；同 stage 不重畫，一級路、遠景、橋梁及海路不變。
  四項真正反例先失敗，紀錄 /tmp/tenka-grounded-roads-red.log。
  代理聚焦 141 項及型別、範圍 lint、格式通過；紀錄 /tmp/tenka-grounded-roads-{green,types,lint,format-check}.log。
  實際 helper 與核准提案在診斷標題外逐位元一致，不代表 terrain-following 或原生畫面驗收。

- 內建 imagegen 產生原創田野候選，檔案為 assets/generated/candidates/lowland-field-material-v1.png。
  相鄰 provenance.json 保存完整 prompt，狀態仍為 candidate-not-adopted；未宣稱精確無縫。
  同視角 384 world／0.35 的田野有可見層次，但硬切山林造成多邊形色差，硬切版本未接入 runtime。
  柔化版本另以保守遮罩處理山林外側，不改耕作數值或地理資料。

- 定稿田野保留 384 world／0.35，512 格遮罩使用不透明紅色覆蓋、nearest 取樣與原始海岸裁切。
  半格對角線加一格為黑色保護範圍，山林外側再漸淡 32 world；遮罩 CPU 像素為 1048576 bytes。
  二十四個既有山林多邊形共 6255 次網格交會，獨立頂點、角點及邊裁切檢查均為黑色。
  實際 helper 與核准提案的遮罩逐位元一致；仍有淡色緩衝帶，不宣稱精確無縫或全圖美術完成。
  圖像為 assets/generated/previews/map-2.5d-lowland-roads-helper.png；沒有 HUD、名稱或領地圖層。

- 原創 PNG 已接入 public/assets/textures/terrain-lowland-field-material-v1.png，完整 prompt 保存在相鄰來源紀錄。
  圖像實際為 1254×1254、3975052 bytes，opaque 像素 1572516；相對邊不精確匹配。
  兩項資產來源反例先失敗，定稿二十五項通過；紀錄 /tmp/tenka-lowland-field-provenance-{red,green}.log。
  十七組 PNG／來源紀錄與預算檢查通過，textures 為 36788.6 KiB，首屏仍為 944.5 KiB。
  紀錄 /tmp/tenka-lowland-field-assets-root.log；產生素材原始 RGBA 為 106942208 bytes，不是 GPU 或 heap 用量。

- Renderer 將田野置於草地之上、烘焙地形之下；失敗時保留草地，明確 Canvas backend 略過此材質。
  真正田野 acquire 反例先失敗，後續 fixture 空向量層的三項計數失敗另外保留，不當成產品缺陷。
  換圖、銷毀、晚到 Promise、每日 identity、自有遮罩釋放及共享材質保留均通過，代理聚焦共 108 項。
  實際 Pixi helper 三項涵蓋完整交會、微小／穿越／反向／重複／負座標／空資料與來源銷毀。
  ROOT 十檔 216 項通過；紀錄 /tmp/tenka-field-roads-root-focus-final.log。

- ROOT 定稿型別、完整 lint、建置與 bundle 預算均通過；既有大 chunk 警告保留。
  紀錄 /tmp/tenka-field-roads-root-{types,lint,build,bundle}-final.log。
  首載 gzip 為 547057 bytes，scenario 為 100845 bytes，字型仍為 355600 bytes，未調整預算。
  原生 headless 仍受已知環境限制；未開新視窗、未重錄六張基準或修改容差。

- 首次田野定稿完整 coverage 為 5148 通過、十項失敗、一項略過，516 檔、170.04 秒。
  紀錄 /tmp/tenka-field-roads-complete-coverage-final-root.log；百分比仍為 94.80％／91.18％／98.47％。
  除八項既有核心失敗外，Main 的兩項通知等待再次逾時，不能沿用前輪 UI 全數通過的結論。
  聚焦及建置通過不替代這份完整失敗；沒有調整 timeout 或斷言。

- 原始 V8 的獨立 urgent timer trace 量到田野遮罩 101.581 ms，實際 dismiss callback 仍執行一次。
  第一輪 poll 為 2363.626，dismiss 為 2363.844，1000 ms 到期為 2363.871，沒有中間成功 poll。
  紀錄 /tmp/tenka-field-toast-v8-trace-root.log；實際結果為一項失敗、六十三項篩選略過。
  另一個 tmp 對照只拒絕新田野素材，原兩項通知均通過；紀錄 /tmp/tenka-field-omission-v8-trace-root.log。
  這是啟動計算阻塞的因果對照，不是採用停用田野作為修復；後續同像素優化另驗。

- tmp 候選先填白色覆蓋，再只處理各山林多邊形的外擴範圍，合成較小的紅色覆蓋值。
  實際二十四個多邊形與五組邊界資料共 6291456 bytes，全數與既有演算法一致，沒有修改輸入。
  實際候選取樣 16990 次、平方根 13037 次；不再逐格執行約 620 萬次多邊形邊界框檢查。
  紀錄 /tmp/tenka-field-roi-parity.log；這是工作量及像素對照，不是任意浮點等價、FPS 或速度 gate。
  獨立審查確認取樣範圍、最小覆蓋與黑格跳過條件；接入及完整驗證結果另記。

- 田野範圍優化已接入，真正平方根反例由 258005 次降至二萬次上限內，沒有快取或共享像素寫入。
  定稿五項保留原三項及獨立舊演算法；六組資料 6291456 bytes 全數一致，紀錄 /tmp/tenka-field-roi-{red,green}.log。
  ROI 定稿的完整 Main 六十四項通過，但孤立冷啟動仍為一項失敗、一項通過，兩份結果均保留。
  紀錄 /tmp/tenka-field-roi-main-{two,full}-v8-root.log；不能把暖機通過當成冷啟動修復。

- 山林遮罩另先判斷內部，僅在有效像素計算邊界距離；不改山脊、取樣、覆蓋或生命週期。
  十四個實際山區與七組合成資料 5505024 bytes 全數一致，少做 3296170 次邊界平方距離計算。
  無山脊與零範圍的真正反例先失敗：Math.min 為 393219 次，定稿僅三次設定計算。
  原七項測試保留，新增兩項，代理四檔 122 項通過；紀錄 /tmp/tenka-woodland-inside-first-{red,green}.log。
  獨立審查已讀取接入來源，沒有快取、world phase 或遮罩所有權變更。

- ROOT 原兩項孤立冷啟動通知在 V8 下通過，原斷言與 timeout 不變。
  紀錄 /tmp/tenka-field-woodland-main-cold-two-v8-root.log；六十二項只是篩選略過，不加算為通過。
  ROOT 十檔 220 項、型別、完整 lint、建置與素材／bundle 預算均通過。
  紀錄 /tmp/tenka-field-woodland-roads-root-{focus,types,lint,build,bundle,assets}-final.log。
  首載 gzip 為 547144 bytes，scenario 為 100846 bytes，字型 355600 bytes；完整結果另記。

- 最後來源凍結的完整 coverage 為 5154 通過、八項失敗、一項略過，516 檔、168.60 秒。
  紀錄 /tmp/tenka-field-woodland-roads-complete-coverage-final-root.log；核心行／分支／函式仍為 94.80％／91.18％／98.47％。
  所有 UI／App 通過，包含 Main 六十四項及正式事件存讀六項，測試前後十五份相關來源雜湊一致。
  首次田野的十項完整失敗、ROI 冷啟動一項失敗與控制 trace 各自保留，不從舊 run 扣除失敗。
  八項既有核心失敗仍未處理；原生 headless、整體美術及全遊戲門檻未完成，goal 保持 active。

### 海岸側面比較與內政入口（2026-10-09）

- 三路平行檢查海岸資料、森林覆蓋及正常介面入口；不開新視窗。
  圖譜工具仍受 approval-never 拒絕，因此改讀直接來源，沒有反覆索引或繞過限制。
  原始海岸檔已簡化，沒有隱藏細節；一次較完整來源下載因 DNS 失敗，沒有改換路徑重試。
  更細海灣仍需要合格來源，不能將舊輪廓插值稱為新增地理細節。

- 海岸側面試作沿原始四百七十條邊向下延伸四個 world unit，先畫側面再畫全部不透明陸地。
  比較沿用正式田野、山林、道路及城郭 helper，沒有改動地理座標或遮罩。
  ROOT 檢視東海及區域圖後未採用：土色側面更像厚紙板，強調折線而非寫實地形。
  暫存證據為 /private/tmp/tenka-coast-thickness-{tokai,regional}-{before,proposal}.png。
  紀錄 /tmp/tenka-coast-thickness-diagnostic.log；這些不是原生瀏覽器截圖。

- 正常內政按鈕原本固定開本城概要，與 F1 選取我方城的內政頁不同。
  定稿共用新鮮選城與前景保護，無合適選城時回到仍屬我方的本城。
  三項真正反例先失敗，再通過原快捷鍵與實際按鈕測試；沒有改動核心狀態、亂數或待處理指令。
  紀錄 /tmp/tenka-domestic-rail-{red,green}.log；ROOT 主畫面與快捷鍵兩檔七十二項通過。
  紀錄 /tmp/tenka-domestic-rail-root-main.log；一般與核心型別亦通過。

- 另加標題畫面、視窗阻擋、致命錯誤、模態及原生 DOM 對話框五項負向控制。
  十三項通過，原有斷言不變；紀錄 /tmp/tenka-domestic-rail-controls-green.log。

### 森林邊緣覆蓋與首載回應（2026-10-10）

- ROOT 檢視東海及區域同視角比較後，採用原樹冠下的低強度森林材質。
  沿用原創 woodland 圖片，96 world、0.35 alpha、固定相位及西北光源，不旋轉或拉伸。
  原十塊森林多邊形保持不變，128 格紅色遮罩向內漸淡，另以原多邊形精確裁切。
  新遮罩共 655360 CPU bytes，不等同 GPU 或 heap 量測，也沒有新增圖片下載。

- 正式工廠逐像素符合比較方案；遮罩與十塊實際森林及反向、重複頂點資料一致。
  缺素材及 Canvas 保留既有樹冠；換地形、銷毀與延遲載入不復活舊圖層，每日更新不重建。
  真正接線反例先失敗，初次 GREEN 的一項錯誤是不可用的 Chai matcher，修正後原斷言通過。
  紀錄 /private/tmp/tenka-forest-material-{red,green}.log，後續完整聚焦結果另記。

- 首次冷啟動 dismiss 篩選有兩項失敗；全部工作停止後，原兩項仍有一項失敗。
  紀錄 /tmp/tenka-forest-cold-{dismiss,two-serial}-root.log，沒有從舊 run 扣除失敗。
  平方距離最小值改為每個有效像素一次平方根，十塊森林及七組合成資料逐 byte 不變。
  計算反例先記錄 93408 次 hypot，定稿為零；紀錄 /private/tmp/tenka-forest-squared-{red,green}.log。
  單獨減少計算後原冷啟動仍有一項失敗；紀錄 /tmp/tenka-forest-squared-cold-two-root.log。

- 暫存對照只省略新森林材質，保留田野、山林及全部素材載入，原兩項通過。
  urgent 確認約在等待開始後 940ms 發生，約 993ms 清掉期限；這不是效能驗收或正式修正。
  紀錄 /private/tmp/tenka-forest-omission-v8-trace-corrected.log；初次零測試 harness 錯誤另保留。

- 正式接線只在有合格森林與 woodland 時，先讓出一個事件迴圈 task，再建立新裝飾遮罩。
  等待後重新檢查銷毀、圖層、地形參考及 generation，原本的 idle 保護保持有效。
  缺素材、Canvas 與空森林不等待；不改 ReportStack 確認語意、300ms 退場或測試期限。
  聚焦九十三項、型別、lint 與格式通過；紀錄 /private/tmp/tenka-forest-yield-green-empty.log。
  ROOT 原兩項 V8 冷啟動通過，六十二項只是篩選略過；紀錄 /tmp/tenka-forest-yield-cold-two-root.log。

- ROOT 完整型別、ESLint、Prettier、建置及素材預算通過，原大型 chunk 警告保留。
  首載 gzip 為 547747 bytes、scenario 100845 bytes、字型 355600 bytes，既有預算通過。
  紀錄 /tmp/tenka-forest-domestic-root-bundle.log；素材紀錄 /tmp/tenka-forest-domestic-static-assets-root.log。
  正式 helper 預覽為 assets/generated/previews/map-2.5d-forest-coverage-helper.png，不是原生截圖。
  十七組素材不變，山林、田野及新森林材質遮罩合計 5373952 CPU bytes，未宣稱 GPU 或 heap 驗收。

- 最新來源凍結的完整 coverage 為 5176 通過、八項失敗、一項略過，517 檔、169.44 秒。
  紀錄 /tmp/tenka-forest-domestic-complete-coverage-final-root.log；核心行／分支／函式為 94.80％／91.18％／98.47％。
  所有 UI／App 通過，含 Main 六十四項、快捷鍵十三項及正式事件存讀六項。
  七份本輪來源及測試在完整 run 前後雜湊一致；原八項核心失敗、海岸及原生驗收仍未完成。
  冷啟動失敗、受控省略與未採用方案保留，不以略過項或多批聚焦結果加算通過數。

### 山脊變體與地圖列表（2026-10-10）

- ROOT 檢視東海及區域同視角比較後，採用原創直向 v5 山脊。
  木曾、赤石、鈴鹿及越後使用新峰群；飛驒及奧羽保留 v4，橫向仍使用 v3。
  原地形、座標及裁切不變，依序使用指定變體、方向素材、v1 及向量備援。
  實際載入素材決定透明範圍，去重載入及既有換圖、銷毀保護保持有效。

- 橫向 v4 的視角比較通過，但完整素材驗證發現寬 2061px 超過既有 2048px 上限。
  首次結果二十四項通過、一項失敗，紀錄 /tmp/tenka-ridge-variants-manifest-final-root.log。
  內建 imagegen 尺寸修正版仍寬 2058px，且細節重新繪製，因此不採用兩份橫向候選。
  候選與完整提示保留在 assets/generated/candidates；runtime 副本移至候選目錄，可復原。
  不放寬尺寸上限、不覆寫基準圖，也不宣稱生成尺寸符合提示。

- 移除橫向 runtime 指定後，山林五份聚焦測試一百四十一項及素材二十五項通過。
  紀錄 /tmp/tenka-h4-rejection-green.log 及 /tmp/tenka-ridge-v5-manifest-final-root.log。
  十八組素材驗證零錯誤及警告，textures 為 38112.8 KiB，首屏仍為 944.5 KiB。
  紀錄 /tmp/tenka-ridge-v5-assets-final-root.log；新 PNG 增加 6289368 原始 RGBA bytes，並非 heap 量測。
  地形材質遮罩仍為 5373952 CPU bytes，六張凍結策略基準的雜湊不變。

- 最終正式 helper 圖存為 assets/generated/previews/map-2.5d-ridge-variants-helper.png。
  實際工廠確認十四塊山系的素材與位置；東海及區域像素在標題之外符合已採用方案。
  紀錄 /private/tmp/tenka-ridge-v5-final-runtime-diagnostic.log；這不是原生截圖，未含 HUD 或領地圖層。

- 地圖列表以既有公開地圖資料提供搜尋、分類、分頁與鍵盤選取，不新增敵軍操作或情報。
  出征選目標使用原 march FIFO 的子畫面，保留父層暫停；選取只更新原路徑預覽。
  Esc 只關閉列表，不取消出征，也不自動確認或送出指令。
  換遊戲、草稿、父層或原生對話框後，舊回呼不能復活；新入口仍可正常使用。

- 出征入口的真正反例一項失敗、十四項篩選略過；紀錄 /tmp/tenka-realm-march-red-confirmed.log。
  最終四十一項聚焦測試、型別、lint 及格式通過；紀錄 /tmp/tenka-realm-march-refrozen.log。
  中間一次 subscriber fixture 欄位錯誤保留在 /tmp/tenka-realm-march-final.log，沒有當作正式反例。
  獨立來源審查未發現具體所有權問題；這些 jsdom 證據不代表原生焦點或幾何驗收。

- 平行工作停止後，原兩項冷啟動 V8 測試通過，六十二項只因篩選略過。
  紀錄 /tmp/tenka-ridge-realm-cold-two-root.log；未放寬期限或改確認語意。
  最新凍結完整 coverage 為 5200 通過、八項失敗、一項略過，518 檔、170.76 秒。
  紀錄 /tmp/tenka-ridge-realm-complete-coverage-final-root.log；核心行／分支／函式為 94.80％／91.18％／98.47％。
  全部 UI／App 通過；原八項核心及重放失敗保持可見，不重錄 golden 或視覺基準。

- 完整 run 前後 1057 份 src／tests 檔案雜湊一致，最終型別、ESLint、建置及素材預算通過。
  紀錄 /tmp/tenka-ridge-realm-{source-verification,types-final,eslint-final,build-final,assets-final}-root.log。
  首載 gzip 為 550379 bytes、scenario 100844 bytes、字型 355600 bytes，既有預算通過。
  紀錄 /tmp/tenka-ridge-realm-bundle-final-root.log；大 chunk 警告保留，沒有宣稱原生效能驗收。

### 行軍顯示路線與軍隊面板（2026-10-10）

- 道路已使用中繼點，但軍隊位置、朝向及出征預覽原本仍依端點直線顯示。
  共用純幾何函式讓位置、方向、虛線、每日標記及敵境標記沿同一條顯示路線。
  反向行軍沿原道路返回，無中繼點保持直線；不改核心時間、指令、RNG 或地理資料。
  不可達的末段仍是明示直線，不假裝存在可行道路。

- 軍隊位置真正反例五項失敗、二十八項通過；修正後三十三項通過。
  紀錄 /tmp/tenka-army-road-geometry-{red,green}-root.log。
  原創軍隊朝向的實際 Sprite 反例先失敗；幾何與 renderer 聚焦一百六十項通過。
  紀錄 /tmp/tenka-authored-road-heading-red.log 及 /tmp/tenka-road-geometry-green-final.log。
  實際五條國土地圖中繼路線均測端點與反向；端點強化前也通過，不冒充失敗反例。

- 預覽真正反例先有三項失敗；補上錯配 recorded edge 的端點驗證後，聚焦十三項通過。
  紀錄 /tmp/tenka-path-waypoint-{red,fractional-before,fractional-green}.log。
  小數折線的獨立虛線區間 oracle 原本通過，因此沒有宣稱修正浮點缺陷。
  原每日時間及既有 from／to 介面保留，無額外軍隊權限或情報。

- 軍隊面板原操作區絕對定位，兩列三十二像素控制會超過四十像素標題區並壓住資訊。
  操作區改為正常流及換行，標題不縮小；下方內容限高捲動，不把按鈕縮成小目標。
  真正來源反例失敗後，新兩項及既有軍糧測試共三項通過。
  紀錄 /private/tmp/tenka-context-flow-{red-source,green-final}.log；前兩次 fixture 錯誤另保留。
  測試使用實際合法出征及一天 bridge；來源流式證據不等同原生瀏覽器幾何驗收。

- 國土資料共 495 條道路，477 條為陸路；只有五條含中繼點，另外 472 條陸路仍是直線。
  本輪沒有新增道路彎曲或地理細節，自然路形及海岸重設仍未完成。
  暫存示意圖 /private/tmp/tenka-authored-road-motion.png 使用實際五條道路與十五個人工進度點。
  新舊位置最大差約 84.71 world，反向位置一致；這不是實際模擬旅程、原生截圖或速度驗收。

- 首次來源凍結的完整 coverage 為 5219 通過、九項失敗、一項略過，521 檔、171.07 秒。
  紀錄 /tmp/tenka-route-context-complete-coverage-final-root.log；1061 份 src／tests 檔案雜湊一致。
  原八項核心失敗之外，uiScale 的既有外層垂直捲動契約失敗；不改原斷言或從結果扣除失敗。
  冷啟動兩項通過、六十二項篩選略過；紀錄 /tmp/tenka-route-context-cold-two-root.log。

- 恢復原根容器 overflowY auto，同時保留內文 flex 限高、標題不縮小及操作區正常換行。
  原 uiScale 六項、新面板兩項及既有軍糧一項共九項通過，原 uiScale 檔案與斷言不變。
  紀錄 /private/tmp/tenka-context-flow-restored-green.log；未改等待時間或縮小操作目標。

- 修正版完整型別、ESLint、格式、建置及素材預算通過，既有大 chunk 警告保留。
  紀錄 /tmp/tenka-route-context-{types,eslint,format,build,assets}-refrozen-root.log。
  首載 gzip 為 550819 bytes、scenario 100844 bytes、字型 355600 bytes；未宣稱 heap 或原生效能驗收。
  紀錄 /tmp/tenka-route-context-bundle-refrozen-root.log。

- 最終修正版完整 coverage 為 5220 通過、八項失敗、一項略過，521 檔、171.33 秒。
  紀錄 /tmp/tenka-route-context-complete-coverage-refrozen-root.log；核心行／分支／函式為 94.80％／91.17％／98.47％。
  全部 UI／App 通過，原 uiScale 契約恢復；原八項核心與重放失敗仍阻擋完整遊戲驗收。
  1061 份 src／tests 檔案在 run 前後雜湊一致，六張凍結策略基準保持不變。
  修正版原冷啟動兩項再通過、六十二項篩選略過；紀錄 /tmp/tenka-route-context-cold-two-refrozen-root.log。

### 局部自然道路曲線與一致顯示（2026-10-10）

- 第一版整段曲線在實際道路上最大偏移約 0.165 world，畫面差異太小，因此未採用。
  新版只柔化中繼點附近，長直段保持原線；駿府首角在同視角近景中明顯改善。
  五條既有中繼路線中四條曲線化，最大偏移約 1.692 world；掛川橋旁轉角保持原線。
  另外 472 條直線陸路未新增中繼點，不宣稱全路網已自然化。

- 顯示曲線保留全部原始錨點、順序、端點方向及橋梁直線保護走廊。
  獨立稽核對輸出折線作不超過一 world 間隔取樣，703 個取樣通過陸地與同一山體豁免規則。
  最初較弱的任意山體豁免稽核及橋邊界選段 tie 失敗另保留，不冒充產品修正。
  紀錄 /private/tmp/tenka-road-smoothing-local-v2-geography-same-mass.log。

- 使用 verified-refactor 技能先建立 AST 查核器，再分批更新八個顯示入口。
  查核器自測涵蓋原名、別名、複製 callback 及 namespace；批次結果為八、二、零。
  道路、選取亮線、容量覆蓋、路名、戰況粒子、軍隊位置與朝向及行軍預覽共用不可變曲線。
  反向行軍複製陣列再反轉；核心時間、RNG、原始地理資料與 raw 幾何 API 保持不變。
  紀錄 /tmp/tenka-visual-road-consumer-{renderer-batch,zero,selftest}-root.log。

- 實際駿府道路與亮線的真正偏離點反例先失敗，renderer 聚焦 165 項通過。
  軍隊位置與預覽反例先有兩項失敗、四十項通過；修正後聚焦四十八項通過。
  紀錄 /tmp/tenka-visual-road-six-focused-final.log 及 /tmp/tenka-display-curve-consumers-{red,refrozen}.log。
  新 renderer fixture 型別錯誤另保留；修正僅限 fixture，不放寬產品型別。

- 最終診斷直接使用原 production graph 與正式繪圖 helper，沒有暫時中繼點或二次曲線化。
  東海與駿府圖在 caption 外與批准候選像素一致，來源雜湊前後一致。
  紀錄 /private/tmp/tenka-road-smoothing-final-runtime-{parity,geography}.log。
  圖片仍是非原生、無 HUD 的 helper 合成，不是 headless 瀏覽器截圖或完整介面驗收。

- 平行唯讀視覺檢查仍找到切角海岸、平面河湖、林地裁切感及城郭與地形缺少遮擋關係。
  HUD 資源與操作共用水平捲動也尚未改善；目前沒有新版完整 HUD 的可信截圖。
  整體 UI 與 2.5D 重設未完成，不以局部道路改善取代使用者要求。

- 本輪完整型別、ESLint、格式、建置、素材與 bundle 預算通過，既有大 chunk 警告保留。
  紀錄 /tmp/tenka-curve-runtime-{types,eslint,format,build,assets,bundle}-root.log。
  首載 gzip 為 551929 bytes、scenario 100846 bytes、字型 355600 bytes，未宣稱 heap 或原生效能驗收。
  冷啟動兩項通過、六十二項篩選略過，單獨執行 4.33 秒；紀錄 /tmp/tenka-curve-runtime-cold-two-root.log。

- 凍結來源後完整 coverage 為 5227 通過、八項失敗、一項略過，522 檔、171.71 秒。
  紀錄 /tmp/tenka-curve-runtime-complete-coverage-root.log；核心行／分支／函式為 94.80％／91.18％／98.47％。
  全部 UI／App 通過，八項仍是原核心、golden 與重放失敗；沒有更新基準或略過失敗。
  1071 份 src／tests 檔案於完整 run 前後雜湊一致，六張凍結策略 PNG 保持不變。

### 固定 HUD 操作區與水岸候選審查（2026-10-10）

- 頂部 HUD 原本整列水平捲動，資源較多時速度與系統入口會被推離初始視野。
  資源現在獨立捲動，操作區固定；速度、系統、待執行狀態及警告均保留。
  大名命令入口也保留於固定區，沒有隱藏資源或縮小操作目標。
  HUD 高度新增四十像素下限，原地圖宿主及側欄、報告位置不變。

- 待執行文字限寬十六 rem，完整文字保留在 aria-label 與 title。
  資源區可聚焦且有標籤，左右、Home、End 捲動鍵不傳到視窗。
  實際 DOM 冒泡測試同時保留 Tab 與區域外方向鍵的正控制；不宣稱 mock canvas 證明真實鏡頭。
  1280px 與 0.8／1.5 比例使用來源尺寸預算檢查，不是原生幾何量測。

- 缺失布局反例先有三項失敗、四項通過；五檔聚焦三十九項通過。
  原 atlas 的整列捲動與固定三 rem 契約因需求改變而更新，其餘位置及操作尺寸檢查保留。
  第一次 green 有兩項 localized 數字斷言失敗，修正期望的千分位文字，未繞過產品格式。
  DOM 冒泡強化原本已通過，不宣稱另一項失敗反例。
  紀錄 /tmp/tenka-fixed-hud-{red,green,green-final,propagation-green}.log。

- 海岸 distance-band mask 候選主要去除均勻光暈，切角仍然明顯，因此未採用。
  1024 平方材質需約八 MiB CPU 暫存及四 MiB 保留像素，近景濾波未有原生證據。
  河流偏側亮暗筆畫仍像管線，第二版低飽和寬 wash 仍偏平面；兩版只保留於 TMP。
  本輪沒有把這些候選接入正式畫面，不以取樣通過代替視覺改善。

- 海岸命中測試實際只使用節點及軍隊半徑，不讀海岸輪廓。
  可建立統一的顯示近似海岸，供陸地、草地、農田、整個地形 clip 及顯示勢力網格共用。
  原地理資料不變，但需先驗證海陸關係、沿海節點、道路、河口、無自交及位移界限。
  局部 Bézier 圓角仍是待測提案，不是更精確的海岸資料，也尚未實作或批准。

- HUD 修正版完整型別、ESLint、格式、建置、素材與 bundle 預算通過，既有大 chunk 警告保留。
  紀錄 /tmp/tenka-fixed-hud-{types,eslint,format,build,assets,bundle}-root.log。
  首載 gzip 為 552074 bytes、scenario 100846 bytes、字型 355600 bytes，未宣稱原生效能驗收。
  冷啟動兩項通過、六十二項篩選略過，單獨執行 4.61 秒；紀錄 /tmp/tenka-fixed-hud-cold-two-root.log。

- 最新完整 coverage 為 5230 通過、八項失敗、一項略過，523 檔、176.96 秒。
  紀錄 /tmp/tenka-fixed-hud-complete-coverage-root.log；核心行／分支／函式為 94.80％／91.17％／98.47％。
  全部 UI／App 通過，仍是原八項核心、golden 與重放失敗；沒有更新基準或略過失敗。
  1072 份 src／tests 檔案於完整 run 前後雜湊一致，六張凍結策略 PNG 保持不變。
  真正 headless 瀏覽器仍無可用驗收證據，整個遊戲及 2.5D 重設未完成。

### 顯示海岸與地面、投影圖層分離（2026-10-10）

- 本輪平行處理顯示海岸、材質接線與獨立地理稽核，不修改原始國土資料。
  局部二次曲線只柔化未保護轉角；節點、道路、橋梁及河口保留保護區。
  這是有限的顯示近似，不是新增海岸測量資料，也不代表全路網或整個介面完成。

- 整個地形一起裁切的候選會切平沿海樹冠，因此未採用。
  新版只裁切草地、農田、烘焙地面及 woodland 地面材質，投影山脊與樹冠維持原位置。
  城郭接觸陰影及森林低帶遮擋候選沒有足夠視覺改善，也只保留於 TMP。

- 使用 verified-refactor 技能先建立消費端 AST 查核器，五處原海岸選取降至零。
  唯一轉換入口建立不可變顯示幾何；命中測試仍保留原 static data，MiniMap 仍用原海岸。
  地面遮罩及重掛材質另有實際圖層與銷毀測試，不能以 AST 零違規代替生命週期驗證。
  紀錄 /tmp/tenka-display-coast-consumers-check-final.log。

- 道路塗色與橋梁保護加強後，正式 helper 輸出 2230 點，原資料仍為 470 點。
  獨立雙向密取樣加上連續距離保守上限為 5.374 world，小於八 world 界限。
  三島無自交或相互交疊；465 節點中六個原本不在陸地，新增分類變化為零。
  河口、道路中心與抽樣道路塗色、實際橋面也沒有新增分類變化，不冒充完整 GPU 證明。
  紀錄 /private/tmp/tenka-display-coast-independent-runtime-audit.log。

- 實際 production 勢力網格比較有 51／1048576 格改變，沒有改變原陸地的最近郡。
  所有改變格中心距原海岸不超過 1.419 world，距顯示海岸不超過 3.168 world。
  紀錄 /private/tmp/tenka-display-coast-territory-runtime-audit.log；原海岸 JSON 雜湊不變。
  正式 helper 圖存為 /private/tmp/tenka-display-coast-guarded-{tokai,sunpu}-{before,proposal}.png。
  未保護外灣轉角確有柔化，保護港灣仍有切角；圖片未含 HUD、領地或原生瀏覽器畫面。

- 消費端真正反例兩項失敗，接線後七檔聚焦 142 項通過；最後圖層補強 111 項通過。
  山、林兩種真 Pixi 工廠均證明重掛材質與遮罩只銷毀一次，共用素材保留。
  純 helper 八項新增測試通過，含確實觸及輸出點數與重複保護點預算的控制。
  中間 fixture／材質期待錯誤保留，不算產品反例；安全預算測試沒有宣稱曾有產品 RED。
  紀錄 /tmp/tenka-display-coast-{consumers-green-refrozen,explicit-green,helper-final-eight}.log。

- 完整型別、ESLint、格式、建置、素材與 bundle 預算通過，既有大 chunk 警告保留。
  首載 gzip 為 554354 bytes、scenario 100843 bytes、字型 355600 bytes，未量測 GPU 或 heap。
  原冷啟動兩項通過、六十二項只因篩選略過，單獨執行 4.60 秒。
  紀錄 /tmp/tenka-display-coast-{types,eslint,format,build,assets,bundle,cold-two}-root.log。

- 最終完整 coverage 為 5242 通過、八項失敗、一項略過，524 檔、179.89 秒。
  紀錄 /tmp/tenka-display-coast-complete-coverage-root.log；核心行／分支／函式為 94.80％／91.18％／98.47％。
  全部 UI／App 通過；八項仍是原核心、golden 與重放失敗，沒有重錄基準或跳過失敗。
  1074 份 src／tests 檔案雜湊前後一致，六張凍結策略 PNG 不變。
  尚無原生 headless 驗收證據，整個遊戲與 2.5D 重設仍未完成。

### 湖面材質與細岸線（2026-10-10）

- 平行製作湖、河候選並核對實際 Pixi API；湖面低對比反射搭配較細岸線已採用。
  厚岸框明顯減弱，原多邊形仍有切角；這不是湖深、地勢或完整寫實地圖。
  河流 base-only 候選雖去除內描邊，卻變成平面色帶，因此未採用。
  額外河流 union mask 也未接入，原寬度級別、漸細比例與河口保持不變。

- 第一版示意忽略向內岸線，第二個漸層版本又使用世界尺度而非湖外框正規化。
  兩種診斷錯誤均修正前後圖，舊版本保留，不冒充產品缺陷或採用證據。
  最終示意使用 objectBoundingBox，保留 Pixi 32×1 材質濾波與 SVG 混色可能不同的限制。
  紀錄 /private/tmp/tenka-water-candidates-v5-diagnostic.ts；候選圖不是 headless 瀏覽器截圖。

- 新測試的真實缺材質反例為兩項失敗、一項通過；較細岸線需求加入後為三項失敗。
  正式接線後三檔 112 項聚焦通過，含真 Pixi 四項配置、共用、空資料與銷毀測試。
  中間 mock matcher、舊岸線期待與獨立 UV 測試型別錯誤均保留，不算額外產品反例。
  紀錄 /tmp/tenka-lake-{material-red-confirmed,quiet-shore-red,material-green-final}.log。

- 水體元件持有一張 32×1 線性材質，名義 RGBA 為 128 bytes，不是完整 CPU／GPU 成本。
  空湖資料不建立材質；兩座湖共用局部色階，LOD 只切顯示，不重建幾何或紋理。
  銷毀冪等且只釋放一次自持 texture 與 source；原四個 Graphics、河流與岸線座標保留。
  新色票與實際岸線配置另記於 docs/visual/art-bible.md §3.2.1。

- 獨立三項真 Pixi 測試通過，兩種非方形外框的 UV 符合正規化對角投影。
  clamp-to-edge 保留；兩座實際湖的 0.6／0.35 world 內岸網格在正反 winding 均不越界。
  紀錄 /private/tmp/tenka-lake-uv-green-final.log；這是 CPU 幾何與 API 證據，不是 GPU 像素驗收。

- 最終圖直接擷取正式 createWaterFeatures 的漸層、色階、外框與岸線樣式，不替換候選函式。
  琵琶湖、濱名湖與東海圖在標題之外與採用候選像素一致，水體座標雜湊不變。
  紀錄 /tmp/tenka-lake-final-parity-root.log；來源圖為 /private/tmp/tenka-water-actual-source-{biwa,hamana,tokai}-actual-source.png。
  圖片仍未含 HUD 與領地；材質配置擷取略過 lazy build，矩陣另有真 Pixi 測試。

- 完整型別、ESLint、格式、建置、素材與 bundle 預算通過，原大 chunk 警告保留。
  首載 gzip 為 554627 bytes、scenario 100845 bytes、字型 355600 bytes，沒有宣稱原生效能驗收。
  原冷啟動兩項通過、六十二項篩選略過，單獨執行 4.45 秒。
  紀錄 /tmp/tenka-lake-material-{types,eslint,format,build,assets,bundle,cold-two}-root.log。

- 最終完整 coverage 為 5249 通過、八項失敗、一項略過，526 檔、175.58 秒。
  紀錄 /tmp/tenka-lake-material-complete-coverage-root.log；核心行／分支／函式為 94.80％／91.18％／98.47％。
  全部 UI／App 通過；八項仍是原核心、golden 與重放失敗，沒有更新基準或跳過失敗。
  1076 份 src／tests 檔案雜湊前後一致，六張凍結策略 PNG 不變。
  原生 headless 證據仍缺，整個遊戲、河道與全圖視覺重設仍未完成。

- 另以原全國 seed 15600519、初始資料、AI 佇列與事件引擎重現第 450 天滅亡原因。
  模擬日期 1561／4／1 義龍自然死亡，其他一門龍興十三歲、未元服，因此沒有相續事件。
  齋藤家轉為滅亡，但四城十六郡歸屬不變，原 INV-02／22 失敗保留。
  紀錄 /private/tmp/tenka-saito-natural-extinction-cause-run.log；額外狀態觀察不修改輸入、狀態或 RNG。
  06 將無嗣領土處理交給 10，10 卻只定義無城滅亡；已請使用者裁定接收規則。
  沒有擅自改元服、繼承、領土歸屬或核心基準，也不將這次重現算成通過。

### 土路材質與資訊優先快覽（2026-10-10）

- 平行製作地形道路候選、檢查共用顯示鏈與審查幾何限制。
  避讓候選只改變一條道路，全圖收益不足，因此未接入產品。
  現有地形資料不足以重建歷史道路，不使用隨機彎曲冒充地形依據。

- 採用較細、低對比的土路材質；陸路描邊為原名義寬度的 0.6 倍。
  海路降低外暈並縮細內線；道級、節線、波節、LOD 與橋樑保留。
  名義海岸保護範圍不變，核心與地圖資料雜湊符合前一輪基準。
  實際設定記於 docs/visual/art-bible.md §6.3.1；原生像素與可讀性仍待驗收。

- 寬版快覽以資訊主欄搭配操作側欄，小螢幕使用資訊優先的正常堆疊。
  外框高度與地圖讓位不變；操作保留 32px 下限、捲動、Tab 順序及 Escape 傳遞。
  真實缺少分欄契約反例為一項失敗，正式接線後四項測試通過。
  紀錄 /tmp/tenka-context-columns-{red,green-final}.log；jsdom 不證明原生布局像素。

- 新道路材質契約先得到三項失敗，接入後道路與共用幾何測試共七十七項通過。
  獨立材質角色檢查三項通過；原有路徑、節線、橋樑、LOD 與零重描契約保留。
  正式來源東海與近景圖在標題外符合採用候選，沒有重複縮放描邊。
  紀錄 /tmp/tenka-roads-material-actual-source-pixel-parity-final.log；這是 SVG 診斷，不是原生像素證據。

- 完整型別、ESLint、格式、建置、素材與 bundle 檢查通過，原大 chunk 警告保留。
  首載 gzip 為 554964 bytes、scenario 100845 bytes、字型 355600 bytes。
  原冷啟動兩項通過、六十二項篩選略過，獨立串行執行 4.45 秒。
  紀錄 /tmp/tenka-road-context-{types,eslint,format,build,assets,bundle,cold-two-serial}-root.log。

- 最終 coverage 為 5257 通過、八項失敗、一項略過，527 檔、177.13 秒。
  核心行／分支／函式為 94.80％／91.18％／98.47％；全部 UI／App 通過。
  1078 份 src／tests 雜湊前後一致，六張凍結策略 PNG 不變；原八項失敗沒有改基準或略過。
  紀錄 /tmp/tenka-road-context-complete-coverage-root.log；完整遊戲與全圖視覺驗收仍未完成。

### 橋樑世界比例與衍生校準稽核（2026-10-10）

- 中景橋樑從道路的 2.5 倍改為近景相同的 1 倍物件尺寸，遠景仍隱藏。
  原橋位、方向、橋面構件、道路倍率與較大的名義海岸保護範圍不變。
  正式來源三視角與採用候選在標題外一致；全景中的橋體不再搶過城池。
  紀錄 /tmp/tenka-bridge-mid1-actual-source-parity.log；圖像仍是非原生 SVG 診斷。

- 新正式橋樑呼叫契約先得到中景／遠景兩項失敗、近景一項通過，接入後聚焦八十三項通過。
  獨立三項使用正規化河道、實際 Pixi 描邊及有限圓帽，檢查兩座橋的水域接觸。
  橋心落水域、局部交集位於橋面內，橋頭軸線端點離開河面；這不等於全部構件都在陸地。
  紀錄 /tmp/tenka-bridge-display-scale-focused.log、/private/tmp/tenka-bridge-contact-green-final.log。

- BAL 稽核現在把兵／石高明確列為未驗證的衍生校準，而非第二個應新增的常數。
  初始缺少分類契約得到一項失敗，獨立審查的重複與錯置證據控制再得到四項失敗。
  最終五十三項聚焦通過；CLI 仍失敗，保留五項缺失常數及一項未驗證校準。
  六百一十四筆宣告、五百九十筆比較與二十四筆原始缺少欄位均保留；沒有近似值精確解碼。

- 資料觀察得到人口 6033500、石高 17994000，比例約 0.335，符合 14 的人口約為石高 ×0.33。
  15 卻以人口約等於石高推導兵力；實際九地方開局城容量為 231805，約每萬石 129 人。
  初始駐兵為 142888，約每萬石 79 人；容量、駐兵與持續野戰兵力不是同一數值。
  觀察不推進日期且狀態不變；沒有自行改人口、BAL 或把描述性比例變成驗收容差。
  紀錄 /tmp/tenka-bridge-audit-capacity-observation-final-root.log；已請使用者裁定人口與兵力規格方向。

- 完整型別、ESLint、格式、建置、素材、資料、字形與 bundle 檢查通過，原大 chunk 警告保留。
  首載 gzip 為 554982 bytes、scenario 100843 bytes、字型 355600 bytes。
  原冷啟動兩項通過、六十二項篩選略過，獨立串行執行 4.93 秒。
  紀錄 /tmp/tenka-bridge-audit-{types,eslint,format,build,assets,bundle,cold-two}-root.log。

- 最終 coverage 為 5279 通過、八項失敗、一項略過，528 檔、180.33 秒。
  核心行／分支／函式為 94.80％／91.18％／98.47％；全部 UI／App 通過。
  1117 份 src／tests／tools 雜湊前後一致，六張凍結策略 PNG 不變；原八項失敗沒有改基準或略過。
  紀錄 /tmp/tenka-bridge-audit-complete-coverage-root.log；完整遊戲與全圖視覺驗收仍未完成。

## 軍議桌介面、2.5D 地圖與欠俸恢復重放（2026-10-09）

- 使用者要求全面重設介面，並將城郭、軍隊、道路與地形改為原創 2.5D 呈現。
  共用元件、主畫面、入口與管理頁使用深墨藍、象牙白、朱紅與黃銅線。
  保留三十二像素操作下限、鍵盤焦點、捲動、指令權限及地圖座標。
  明示舊大圓角的全域來源檢查由九處降至零；這不等同原生幾何或視覺驗收。

- 城郭使用石垣側面、白牆天守、分層瓦頂、角櫓與勢力旗幟；軍隊加入有明暗的原創步兵隊形。
  近景與中景的友軍及選取圈置於士兵後方，遠景保留既有識別通道。
  道路加入地面陰影及亮邊；橋梁加入架高橋面、側面、木板與扶手。
  獨立審查找到橋梁側面選向相反，修正後四個方位反例與道路回歸共五十三項通過。

- 地形使用邊緣漸降的連續高度網格，山脊距離決定起伏，西北光源決定面色。
  森林材質沿山面分布，樹冠取樣地面高度；移除遮住山脊的平面森林高台。
  當時實際資料產生 7284 個三角面與二十九個完整裁切樹簇；僅於靜態重建時生成。
  實際繪製函式另輸出 SVG 檢查圖，不冒充原生遊戲截圖或商業作品同等精細度。

- 地形填色改為不透明；山面使用同色細描邊遮住細三角接縫，森林材質保留原分層。
  真正 Graphics 的透明度反例與地形回歸共八十七項通過，紀錄 /tmp/tenka-map-seams-green-final.log。
  實際繪圖函式的前後檢查圖確認網線減少；地形仍為分面風格，不冒充原生抗鋸齒驗收。
  修正後完整 UI 仍為八十九檔、885 項通過，紀錄 /tmp/tenka-seams-ui-root.log。
  正常及 core 型別、建置與 bundle 預算通過；首載 gzip 為 534104 bytes。
  紀錄 /tmp/tenka-seams-{types,build,bundle}-root.log；既有大 chunk 警告仍保留。

- 再縮窄山脊並用連續高度場求光照；山腳色逐步融入平地，岩色依高度與坡度變化。
  多條山脊使用平滑權重，既有烘焙山影僅在 runtime 淡化，原 PNG 不改。
  面數上限、靜態批次、地圖座標與選取仍保留；七檔 112 項聚焦回歸通過。
  紀錄 /tmp/tenka-map-natural-green-final.log；前後實際 helper 圖保留，不冒充原生遊戲截圖。
  最終圖仍有分面及條紋，尚未達商業寫實精度；不以幾何通過代替美術驗收。
  ROOT 獨立型別、建置、預算與十檔 lint 通過，首載 gzip 為 534434 bytes。

- 最後 ROOT 全量 UI／App 為一百九十七檔、1915 項通過，耗時 164.23 秒。
  紀錄 /tmp/tenka-natural-final-ui-app-root.log；另四檔十五項核心專案聚焦測試通過。
  聚焦紀錄 /tmp/tenka-natural-final-core-focus-root.log；包含 mock、焦點、合法重放竄改及真實地形 Graphics。
  正常及 core 型別、建置、bundle 與 lint 紀錄為 /tmp/tenka-natural-final-{types,build,bundle,lint}-root.log。
  先前完整 coverage 的十項失敗結果仍保留，不將後續聚焦通過改寫為全量核心通過。

- 定稿 UI 為八十九檔、885 項通過；App 為一百零八檔、1028 項通過，兩者為分開收集。
  紀錄 /tmp/tenka-redesign-ui-frozen.log 與 /tmp/tenka-redesign-app.log；不宣稱完整核心測試全綠。
  正常及 core 型別、介面 ESLint、Prettier、建置與 bundle 預算通過。
  紀錄 /tmp/tenka-redesign-{types,build,bundle}-frozen.log；首載 gzip 為 534087 bytes。

- 未改動 mini 的新 m6-payroll-unpaid-recovery.tfulog.json 以合法支出造成真正月首欠俸。
  六十日正常執行自然 AI 指令，當主不列入三名受薪者，普通月變動後再扣兩點忠誠。
  解散軍團返還實際收入九十七貫且只返還一次；次月恢復支薪，不立即補回忠誠。
  原生待執行續跑、合法時序竄改及正式 bridge 記錄一致性通過；最終 hash 為 9f9136ebc068922a。

- 06 §3.4.3 明定當主可任軍團長；舊核心、INV-10 與介面卻仍依儲存官階排除新當主。
  未改動 mini 的真正日一百四十三繼承重現核心失敗；限定當主例外後仍保留普通武將官階限制。
  介面測試使用明示的受控官階前提，正常佇列建立軍團且不改官階，不冒充自然玩家繼承旅程。
  五檔九項目前回歸通過，紀錄 /tmp/tenka-25d-payroll-corps-current.log。

- 新 m6-successor-corps-eligibility.tfulog.json 保留五十八 tick、二十筆接受指令與完整自然 AI。
  Beta 真正繼承後先結算待執行建設，再由明示可信 Beta 指令建立當主軍團，官階不變。
  完整重放、原生待執行續算及拒絕普通同階軍團長三項通過；最終 hash 為 9a94131bc3f94822。
  紀錄 /tmp/tenka-successor-corps-replay-green-final.log；不證明自然 AI 選將、玩家介面旅程或繼承後欠俸。
  第四項僅合法改 hold 為 develop，指令全接受、每日不變量通過，實際軍團指令與 hash 不同。
  四項通過的紀錄為 /tmp/tenka-successor-corps-legal-tamper-green.log；原 JSON 與 oracle 保留。

- 新完整 coverage 為 4991 通過、十項失敗、一項略過，五百零一檔共 5002 項，耗時 514.55 秒。
  紀錄 /tmp/tenka-25d-successor-complete-coverage.log；core 行覆蓋 94.80%、分支 91.13%、函式 98.47%。
  除八項既有 golden、重放與全國日四百五十失敗，另有舊焦點色契約及 ellipse mock 缺漏。

- 原先兩項新失敗已由七十二項聚焦回歸覆蓋，不改舊 hash、基準圖或測試容差。
  紀錄 /private/tmp/tenka-m4-army-mock-green.log；原 RED 與全量失敗均保留。
  mock 補真實 fluent ellipse；兵數、士氣、識別與地面環先於步兵的契約仍保留。
  月總結實際焦點樣式原本有效，僅更新舊森林色斷言為目前主題與對比要求。
  此聚焦通過不等於修正後完整 coverage 通過。

- 全量 s1560、素材、字型涵蓋及簡體字掃描通過，素材首屏為 944.5 KiB。
  紀錄 /tmp/tenka-25d-{data,assets,font,script}-check.log；六張 strategy 基準 hash 保持不變。
  原生 headless 執行仍受沙箱權限限制，不開新視窗，也不放寬舊截圖門檻。
  完整遊戲、全國長跑、效能與發布驗收仍未達成；自然無繼承人的領地去向仍需裁定。

## 城主罷免與正式 AI 跨月褒賞重放（2026-10-09）

- 上一輪交付管理切換與金錢押運，這一輪補上 05 §3.9.1 的城主罷免入口。
  原城主編輯器拒絕空值，真正缺少按鈕的六項 RED 保留於 /tmp/tenka-castle-dismiss-missing-red.log。
  概要頁新增獨立確認流程，顯示實際城主、職務空缺與實際忠誠損失；當主固定一百的例外保留。
  取消不送令，確認只排入正式佇列，正常日結才改城主及忠誠，不增加核心任免規則。

- 未改動 mini 實際罷免一般城主後扣十點忠誠，當主解職仍保留一百。
  原生 codec 保存真正待執行罷免，重建佇列的持久結算與原旅程完全一致。
  他家城、原城主變動、換局、卸載及已移除的 FIFO 確認另有防護；八項新入口檢查通過。
  三檔十二項含正式 AI 重放與 bridge 檢查通過，紀錄 /tmp/tenka-dismiss-ai-focused-final.log。

- 獨立查核再找到兩個真實生命週期錯誤：舊視窗清理暫停新局，外來視窗離開後舊確認重新有效。
  未改動 mini 與實際 Dialog 重現兩項 RED，紀錄 /tmp/tenka-castle-dismiss-lifecycle-red.log。
  清理綁定 expectedGame，原生前景離開則不可逆撤銷確認，並在回呼前排空尚未送達的 DOM 變更。
  最終十項全部通過，紀錄 /tmp/tenka-castle-dismiss-lifecycle-frozen.log；不放寬中央驗證或通用視窗規則。

- 新增獨立 m6-reward-month-boundary-ai.tfulog.json，未改動 mini 種子四十二正常執行自然產生的 AI 命令。
  三十一日記錄十一筆：八筆 Beta 指令及三筆玩家褒賞；最終 hash 為 54aa90bddcee85aa。
  每日真正移入 AI 待執行命令，再與玩家命令一同正常結算，不注入人工 AI 指令。
  月支出五十、零、五十，全年次數三；無賞賜對照旅程證明實際共扣一百五十貫。

- 三個原生續跑檢查點保存七筆真正待執行 AI 命令，以及月首兩側各一筆玩家賞賜。
  持久狀態、事件、亂數與完整記錄均一致，僅排除 codec 不保存的暫態 AI intentLog。
  合法將第三筆賞賜提早一日，仍付相同總款且次數相同，但月支出歸零並產生不同 hash。
  三項全部通過，紀錄 /private/tmp/tenka-reward-month-ai-green-final.log；既有玩家指令案例沒有重錄或取代。

- 另以真正 runOneDay 執行同一組玩家命令，完整 exportCommandLog 與新案例逐項一致，最終 hash 相同。
  初次測試讀檔 URL 受 jsdom 路徑影響，第二次把尚在建造的設施誤當完工；兩次前提錯誤均保留紀錄。
  改用實際案例與實際建造佇列斷言，保留正式指令完整相等、逐日不變量及核心結果一致性。
  這是正式 bridge 執行證據，但沒有掛載 Main，不冒充原生畫面或完整瀏覽器玩家旅程。

- 最終完整 UI／App 為一百九十四檔、1896 項全部通過，耗時 81.77 秒。
  紀錄 /tmp/tenka-dismiss-ai-ui-app-verified.log；此收集在生命週期修正後執行，包含兩個新反例。
  正常及 core 型別、完整 ESLint、Prettier、建置與 bundle 預算均通過。
  紀錄 /tmp/tenka-dismiss-ai-{types,lint,build,bundle}-verified.log；首載 gzip 為 530773 bytes，劇本為 100844 bytes。

- 字型保持一千六百六十字元、355600 bytes，涵蓋與預算通過，紀錄 /tmp/tenka-dismiss-ai-font.log。
  六張既有 strategy 圖片的 SHA256 保持不變；00 foundations 與 M6 里程碑不變，沒有修改 core 或 BAL。
  自然無繼承人的領地去向仍無授權接收方；再次只讀查核沒有把攻城吸收規則套用到自然死亡。
  完整遊戲、全國長跑與原生畫面驗收仍未達成，本批沒有開新視窗。

- 本批完整 coverage 收集為 4947 通過、8 失敗、1 略過，491 檔共 4956 項，耗時 270.31 秒。
  core 行、分支、函式為 94.79％、91.11％、98.47％；紀錄 /tmp/tenka-dismiss-ai-complete-coverage.log。
  八項皆為原有 frozen 比對、BAL 或日四百五十的 INV-02／INV-22 問題，沒有以更新預期值消除。
  此收集開始於最後兩個生命週期修正前；最終來源由後續完整 UI／App 與型別、lint、建置補驗。
  完整收集曾與靜態及 UI 檢查重疊，總耗時不是隔離效能量測，也不宣稱 p95 或 GPU 達標。

## 城池管理切換與金錢押運入口（2026-10-09）

- 05 §3.9.2 已定義普通城的直轄與委任；原 UI 無入口，真正缺少操作的六項 RED 保留。
  概要頁新增目前管理方式及兩個切換按鈕；中央驗證保留城主、本勢力與非軍團城條件。
  操作進入正常佇列，下個日結才切換；恢復直轄不要求城池原本直轄，不增加忠誠或費用效果。
  紀錄 /tmp/tenka-castle-control-missing-red.log；新增介面仍使用和紙圖冊主題。

- 未改動 mini 經實際介面委任及恢復直轄，兩次正常日結與每日不變量通過。
  無切換的對照旅程核對全員忠誠；保存真正待執行切換，原生 codec 保留指令，重建佇列後只結算一次。
  另核對無城主、他家城、真正軍團、換局、卸載、遮罩、視窗限制、關閉面板及同步日結的舊回呼。
  徵兵使用中央驗證與一般面板所有權，不依賴出陣能力；委任時唯讀，合法空駐兵仍可設定方針。

- 第一輪掛載後九項有八項通過；唯一失敗是測試選用官階不足的軍團長，沒有繞過核心資格。
  改用劇本中合法的當主建立軍團；十一項管理切換及九項米買賣檢查全部通過。
  紀錄 /tmp/tenka-castle-control-mounted.log 與 /tmp/tenka-castle-control-final-focused.log。
  此為實際 bridge 日結與 jsdom 面板旅程，不宣稱完整 Main、原生畫面或 AI 長期委任驗收。

- 平行只讀查核找到另一個實際缺口：輸送介面固定金錢零，且文字稱金錢不需輸送。
  05 §3.6 與 D7 明確保留金錢押運；較低層級的 11 輸送線框依此修正，不另造玩法。
  真正缺少金錢欄的兩項 RED 保留於 /tmp/tenka-castle-transport-gold-red.log。
  金錢欄使用來源城實際金庫、整數貫與中央驗證；正式核心、資料格式、BAL 及圖片基準不變。

- 四項押運檢查通過，另有五檔三十項相容檢查；紀錄 /tmp/tenka-castle-transport-gold-green-refrozen.log。
  未改動 mini 正常送出金錢單獨押運及混合貨物，日結才扣款，不提前改動資源。
  原生存檔真正保留待執行混合輸送；續跑與原旅程的持久狀態完全一致，實際只扣七十七貫一次。
  資源不足與委任來源另以明示防禦性設定測試，不冒充自然形成的玩法前提。

- 第一輪完整 UI／App 為 1882 通過、1 失敗，共一百九十一檔，耗時 79.09 秒。
  舊 CastleTransport fixture 將來源設為委任，且 session 停在標題頁，卻期待玩家送出輸送。
  修正為直轄來源與主畫面，保留原路徑、貨量、一次送令及未改核心狀態的全部斷言。
  另加委任來源及非主畫面的負例；三檔二十二項通過，不放寬正式權限或刪除失敗測試。
  紀錄 /tmp/tenka-castle-admin-ui-app-final.log 與 /tmp/tenka-castle-admin-authority-verified.log。

- 完整 lint 首次指出新測試的 act 回呼返回值觸發 Promise 多載；九項報錯均保留於原紀錄。
  測試改為明確 void 回呼，不停用 lint 規則，也不改結算或斷言。
  新增十五項測試、正常及 core 型別、完整 lint 與 Prettier 通過。
  紀錄 /tmp/tenka-castle-admin-{focused,types,lint}-verified.log；fixture 最後修訂另跑整合檢查。

- 最終完整 UI／App 為一百九十一檔、1885 項全部通過，耗時 78.70 秒。
  紀錄 /tmp/tenka-castle-admin-ui-app-verified.log；最終 fixture 的正常及 core 型別、完整 lint 亦通過。
  紀錄 /tmp/tenka-castle-admin-{types,lint}-refrozen.log；本批未重跑核心全套，前一批完整 coverage 的八項失敗仍未解決。

- 建置通過，原有大 chunk 警告保留；首載 gzip 為 529478 bytes，劇本為 100848 bytes。
  字型為 355600 bytes，三項 bundle 預算均通過，紀錄 /tmp/tenka-castle-admin-{build,bundle}-final.log。
  簡體字掃描零命中；六張既有 strategy 圖片 SHA256 不變，00 foundations 及 M6 里程碑沒有改動。

- 字型仍為一千六百六十字元、347.3 KB，涵蓋率與既有預算通過。
  紀錄 /tmp/tenka-castle-admin-font.log；本批未重試既已被環境禁止的無頭瀏覽器路徑，也沒有開新視窗。
  這些入口補齊不代表完整遊戲完成；全國長跑、既有 frozen 比對與原生畫面仍有驗收缺口。

## 米買賣操作、繼承欠俸與跨月褒賞重放（2026-10-09）

- 只讀查核找到米買賣的實際操作缺口：05 §3.4.2 與 §5.5 已定義買賣，但 UI 沒有 tradeRice 入口。
  Castle 內政頁新增交易量、實際金庫與城糧、月剩餘量、購入費用及出售收入。
  超容量購入明示損失且不退款；中央權限仍阻擋委任及他家城，不繞過既有指令驗證。

- 真正缺少買賣按鈕的 RED 保留於 /tmp/tenka-rice-trade-red-confirmed.log。
  實際同局送出後同步推進一日，舊回呼錯寫待執行文字，另有 RED 保留於 /tmp/tenka-rice-trade-postport-red.log。
  修正依實際日期、操作描述及修訂判斷回呼所有權，日結後可沿用同數量再交易，不解除重複送出防護。

- 最終米買賣九項及選將六項相容檢查全部通過，紀錄 /tmp/tenka-rice-trade-frozen.log。
  真正未改動 mini 先經佇列建市，再正常建成米問屋，之後由 Castle 介面購入。
  保存真正待執行交易並重建讀檔佇列，正常一日只扣一次款，狀態與不變量通過。
  預設已建設施的其他測試明示為受控 fixture；本旅程是 jsdom Castle，不宣稱完整 Main 或原生瀏覽器驗收。

- 06 §3.4.3 要求當主忠誠固定一百；原欠俸處理未排除同日新繼任的原支薪對象。
  受控合法軍事世界正常依 Step 6 欠俸、Step 8 落城繼承、Step 9 結算，真正重現一百降至九十八。
  修正只豁免當前 Clan.leaderId，保留原支薪快照、一般家臣扣額、死亡排除及捕虜處理。
  紀錄 /tmp/tenka-successor-unpaid-red-conquest.log；初次設定未形成落城的紀錄另保留，不冒充產品 RED。

- 三項新繼承回歸及十五項既有檢查通過，另有正常待執行出陣保存續跑與亂數一致性。
  完整 lint 指出測試 arrayContaining 的不安全型別；改為取得實際事件後核對勢力與兩名支薪武將，不降低斷言。
  最終三項、實際 scoped lint、format 及 diff 檢查通過，紀錄 /tmp/tenka-successor-unpaid-{tests,lint,format}-final.log。
  此受控軍事世界不是未改動 mini，新的永久繼承案例仍未完成。

- 未改動 mini 的九十日合法探查先耗盡金庫，但月收入足以支薪；原繼承在日一百四十三，不與月結重合。
  真正將合法攻城時程延後七日後，繼承在日一百五十發生，仍沒有欠俸。
  目安箱的維持費排在俸祿後，當主受封又由 05 §3.3.1 明確禁止；未以資源或資格注入避開這些規則。
  紀錄 /tmp/tenka-successor-mini-{feasibility,shift7-policy,shift7-lord-fief}.log；每日不變量通過不等於永久重現完成。

- 新增 m6-reward-month-boundary.tfulog.json，未改動 mini 種子四十二的三筆合法賞賜跨過真正月首。
  月支出五十、零、五十；年次數維持三次，無賞賜對照旅程確認真正累計扣款一百五十貫。
  最終 hash 為 62a9eae3c8df99a2；兩側真正待執行賞賜保存續跑，以及合法改期後月支出變零均通過。
  三項檢查通過，紀錄 /private/tmp/tenka-reward-month-green.log；既有案例與原預期 hash 沒有改寫。
  此案例只將記錄的玩家指令送入核心日結；AI 產生的命令保留於待執行佇列，並未由正式 driver 執行。
  跨月結算與保存續跑證明成立，但不把此案例或同類軍團、外交案例描述為完整正式 AI 旅程。

- 第一輪完整 coverage 為 4900 通過、9 失敗、1 略過，483 檔共 4910 項，耗時 265.75 秒。
  八項既有失敗外，domestic 的搶糧測試仍以六十日容量作近上限設定，實際得到二百一十九而非一百二十。
  改為依一百八十日最大容量留一石空位，原貨量、搶糧事件及移除斷言保留；四檔二十三項通過。
  紀錄 /tmp/tenka-atlas-complete-coverage.log 與 /tmp/tenka-maximum-carry-domestic-compat.log，不改 frozen 比對。

- 最終完整 coverage 為 4917 通過、8 失敗、1 略過，486 檔共 4926 項，耗時 267.29 秒。
  UI 八百六十八項及 App 一千項全數通過；新增米買賣、繼承欠俸及跨月重放亦通過。
  core 行、分支、函式為 94.73％、91.07％、98.23％；八項既有失敗仍阻擋完整驗收。
  紀錄 /tmp/tenka-rice-successor-complete-coverage.log；前段曾與 lint 重疊，不把總耗時當作隔離效能量測。

- 最終正常及 core 型別、完整 ESLint、Prettier、建置與 bundle 預算均通過。
  首載 gzip 為 528580 bytes、劇本為 100844 bytes，字型為 355600 bytes；既有大 chunk 警告仍保留。
  紀錄 /tmp/tenka-rice-successor-{types,lint,build,bundle}-verified.log；建置通過不代替原生畫面或完整玩法驗收。

- 新字串使字型缺少「償」，依原子集管線補齊；現為一千六百六十字元、347.3 KB，字型及素材預算通過。
  全量資料零 ERROR、零 WARN；簡體字掃描零命中，紀錄 /tmp/tenka-rice-{font-final,data-final,assets-final,script-final}.log。
  所有其他工作結束後單獨跑 national mean gate，首次 9.873 ms 失敗，規定的一次重試 7.151 ms 通過。
  兩次共七百二十個真實樣本保留於 /tmp/tenka-rice-successor-serial-mean.log；此結果不證明 p95、GPU 或原生畫面通過。

- 後續只讀查核找到 setCastleControl 亦缺少玩家入口；05 §3.9.2 已定義普通城的直轄與委任切換。
  核心可合法將委任城恢復直轄，但 UI 尚無操作；軍團城仍依既有規則禁止這種切換。
  此為下一個明確玩法缺口，不把既有 core 指令的存在當成完整玩家流程已交付。

## 和紙圖冊介面、攜糧上限與郡摘要（2026-10-09）

- 使用者要求整體介面重設；三路並行修改主畫面、入口與戰鬥畫面、內政及武將面板。
  共用主題採暖白和紙、墨綠操作色與黃銅裝飾，表格、頁籤、視窗及輸入元件同步更新。
  主畫面改為浮動工具列、附文字導航及淺色選取摘要，地圖座標與指令結算不變。

- 整合查核發現事件標題仍使用反白字，與新的淺色共用視窗標頭衝突。
  真正兩項來源契約 RED 保留於 /tmp/tenka-atlas-header-contrast-red.log；修正後相關三十五項通過。
  來源契約與 jsdom 檢查不代表原生幾何或截圖驗收。

- 首次完整 UI／App 為 1855 通過、4 失敗，四項都仍期待速度切換鈕的舊金色。
  測試改為核對新的墨綠選取色、反白文字及非選取文字，保留唯一選取與樣式差異斷言。
  紀錄 /tmp/tenka-atlas-ui-app.log；不以刪除失敗測試或修改圖片基準取得通過。

- 最終完整 UI／App 為一百八十八檔共 1859 項全數通過，耗時 80.78 秒。
  五檔三十八項主題、標頭、焦點與工具列契約亦通過。
  紀錄 /tmp/tenka-atlas-ui-app-final.log 與 /tmp/tenka-atlas-final-contracts.log。
  型別、完整 lint、建置及 bundle 預算通過，紀錄 /tmp/tenka-atlas-{types,lint,build,bundle}-final.log。

- 無頭 gallery 的本機 IPv4 伺服器在啟動時回報 listen EPERM，瀏覽器尚未開頁。
  紀錄 /tmp/tenka-atlas-headless.log；本批沒有開新視窗，亦沒有宣稱新版原生畫面通過。
  六張既有 strategy 圖片的 SHA256 保持不變；美術與完整遊戲驗收仍未完成。

- 輸送搶劫的攜糧餘裕原錯用預設六十日；05 §3.6 與 07 §5.1 要求最大一百八十日。
  修正只改攜糧上限引用，不改正常補給目標、消耗倍率或 BAL。
  真正三項 RED 保留於 /tmp/tenka-transport-carry-maximum-red.log；七檔三十四項相容檢查通過。
  原整數測試的六十日預期因此失敗；貨量改為真正超量，保留一百零一兵的非整數容量與向下取整證明。

- 新增 m6-transport-loot-carry-cap.tfulog.json，以未改動 mini 種子四十二正常取得 B2，再送出合法輸送。
  敵軍實際佔節點時有二百三十七兵、三百零六糧，接收一百糧並消耗五糧後得到四百零一糧。
  此旅程保存七十 tick，最終 hash 為 3278b8d13b2795a8；既有重放案例沒有改寫。
  三項檢查包含真正待執行玩家輸送、進行中的包圍、原生續跑與合法改期對照。

- 郡摘要補上 11 §3.3.4 要求的治安、實際領主與開發方針，沿用既有字串。
  真正缺少治安的 RED 保留於 /tmp/tenka-district-context-red.log；三檔十二項及兩項 Main 相容檢查通過。
  合法方針與加封指令正常推進後更新摘要，同 ID 原生換局亦讀新狀態；單純顯示不改核心、亂數或佇列。
  所有成果仍屬 M6 的實作及驗證進展，不宣告整個遊戲或發行完成。

## 駐城選將接線與正常攻城後輸送永久重放（2026-10-09）

- 三個 agent 並行實作城池選將、查核 Main 操作旅程及建立未改動 mini 的輸送重放。
  11 §3.4.3 已要求勾選駐城武將帶入出陣槽，原頁面僅列文字，兩處入口均產生空編成。
  真正缺少勾選框的 RED 保留於 /tmp/tenka-castle-march-selection-red.log，不以測試設定錯誤冒充產品失敗。

- 駐城軍事頁依勾選順序標明大將及副將，最多一加 BAL.maxDeputies 名；取消首人後明示新的大將。
  空名單保留原空編成，出陣視窗內仍可修改；資格與忙碌判定取自既有核心。
  共用介面草稿與兵糧初始化，沿用 D20 兵數上限、取整及 BAL.defaultCarryDays，不提高副將領兵上限。
  委任城池仍列駐留人員，但出陣與勾選明示停用，可出陣數為零。

- Castle 與 Main 均檢查原局、原面板描述、掛載、前景及實際資格，再建立介面草稿。
  草稿發布可能同步觸發換局或替代視窗，因此發布後再查所有權，不關閉或覆蓋後續草稿。
  真正同 ID 換局、面板關閉、卸載、資格失效與同步訂閱者替換均有回歸；確認前核心及佇列不變。

- 實際 Main、CastlePanel、MarchModal 與 bridge 的旅程檢查編成、戰法及既有兵糧預設。
  經 Main 的地圖事件入口指定相連我方城，確認後指令才入列，正常推進一日生成正確部隊並維持不變量。
  地圖事件入口使用 jsdom／Pixi mock，不冒充原生指標、幾何、截圖或美術驗收。
  六項 Main 整合測試通過，紀錄 /private/tmp/tenka-main-castle-march-frozen.log。

- 合法建立軍團並正常日結算後，重現委任城的選將框仍啟用；RED 保留於 /tmp/tenka-castle-march-delegation-red.log。
  修正後六項新測試及二十一項相容測試通過，紀錄 /tmp/tenka-castle-march-delegation-green.log。
  根目錄五檔整合曾為八十九項通過，紀錄 /tmp/tenka-castle-prefill-green-frozen.log；後加委任對照另保留。

- 初期整合的按鈕字串、Dialog 頁尾查詢及 matcher 錯誤只算測試設定問題，原始紀錄保留。
  根目錄型別檢查指出 gameOver 所在層及未使用函式，另指出 Castle 檢查插錯區段；原作者均修正。
  草稿 helper 的核心內部 import 違反公開 API 邊界，改用既有 core/index 匯出，不取消 lint 限制。

- 新增 m6-transport-physical-occupancy.tfulog.json，真正未改動 mini 種子 42，以七十 tick 保存二十四個套用指令。
  正常出陣、交戰及包圍於遊戲日一百四十三取得 B2；不注入地圖、資源、年齡或特性。
  AI 正常產生的指令以實際勢力權限保存，不偽造為玩家命令；後續合法撤回與輸送形成道路交錯。
  最終 hash 為 22d505e71d0a7238，既有兩個 frozen 案例未重寫。

- 最初單支軍隊的正常攻城探查至遊戲日二百一十仍未取得 B2，不算成功重放或產品修正 RED。
  後續不合法兵力的試探也保留拒絕，不以設定注入避開資格或資源檢查。
  紀錄 /tmp/tenka-mini-transport-occupancy-{discovery,encircle}.log；最終雙軍包圍路線才作為永久案例。

- 遊戲日一百五十五的敵軍雖仍記 B2，但已實際離開一點二五日進度；正常輸送下一日完整抵達。
  提早一天的合法輸送在敵軍真正仍佔節點時被劫，是不同最終 hash 的正向對照，不是遭拒指令。
  原生保存真正待執行玩家輸送及敵軍正在道路中的狀態；敵軍撤回保留於正式權限紀錄，不混入玩家待執行檔。
  六項新舊輸送檢查通過，紀錄 /tmp/tenka-mini-transport-replay-green-frozen.log；不宣稱全國或瀏覽器驗收。

- 首次完整 coverage 為 4881 通過、9 失敗、1 略過，478 檔共 4891 項，耗時 268.55 秒。
  八項為既有失敗，另有一項快捷鍵設定只把 uiStore 設為 main，應用程式 session 卻仍為 title。
  真正 App 只在權威 session 為 main 時掛載 MainScreen，之後才鏡射 uiStore；只讀交叉審查確認差異。
  紀錄 /tmp/tenka-castle-transport-coverage.log；此首次失敗保留，不取消主畫面操作權檢查。

- 快捷鍵設定改為兩處均是 main，原 F1、F2、Home、箭頭、縮放與 M 斷言均保留。
  另加應用程式已在 title、battle、ending 時保留舊 Main 的負向對照，不建立草稿、視窗或指令。
  相關三檔七十五項通過，紀錄 /tmp/tenka-castle-hotkey-owner-green.log，不重寫遊戲或圖片基準。

- 最終型別、完整 lint、建置及 bundle 檢查通過；initial gzip 527140 bytes、劇本 100843 bytes、字型 355384 bytes 均符合預算。
  建置保留原本大區塊警告，紀錄 /tmp/tenka-castle-transport-{types-verified,lint-verified,build-final,bundle-final}.log。
  簡體字掃描零命中，字型涵蓋一千六百五十九字元，紀錄 /tmp/tenka-castle-prefill-{script,font}-final.log。

- 最終單獨完整 coverage 為 4885 通過、8 既有失敗、1 略過，478 檔共 4894 項，耗時 269.32 秒。
  同次 UI 八十八檔共 868 項、App 九十九檔共 987 項全部通過，五項快捷鍵檢查亦全數通過。
  核心 lines 94.59%、branches 91.07%、functions 98%；八項仍為七項 frozen 比較與全國領地不變量。
  紀錄 /tmp/tenka-castle-transport-coverage-final.log，首次九項失敗與最終八項均保留，不改既有 oracle。

- 兩個舊重放與六張 frozen 圖片按本輪雜湊核對相同，plan/00 未修改，里程碑仍是 M6。
  原生 headless 權限、無繼承人領地規則及全國長期驗收缺口未解除，不宣稱整個遊戲完成。
  驗收清單只更新證據與界線，不自動勾選發布條件；本輪為實質進展，目標維持啟用。

## 輸送節點佔用、圖層點擊尺寸與外交永久重放（2026-10-09）

- 三個 agent 並行查核既有核心、M6-V 介面及永久重放缺口，未開新里程碑功能。
  輸送隊原本會依敵軍的最近抵達節點被劫，即使該軍已進入道路。
  05 §3.6 要求敵軍實際位於輸送節點，04 §4.2 明定 posNodeId 只是最近抵達節點。

- 正常合法出陣、輸送及撤回指令重現前進與反向道路中的錯誤搶劫。
  擴充 RED 為兩失敗、一通過，紀錄 /tmp/tenka-transport-army-occupancy-red-expanded.log。
  初始道路採明示的 tiny 受控走廊，不宣稱此設定是未改動 mini 或全國旅程。
  修正只在既有搶劫篩選加入 armyPhysicalLeg 的實際節點條件，不改路徑、物資、敵對或亂數。

- 三項新回歸及相容測試共二十八項通過，紀錄 /tmp/tenka-transport-army-occupancy-green-final.log。
  前進、合法反向與原生續算均驗證事件、持久狀態、亂數及每日不變量；輸送仍正常抵達。
  零進度但有邊日數快取的敵軍仍在節點，正向對照確認仍會搶劫。
  首次 GREEN 的目的城兵糧斷言漏算每日駐兵消耗，屬測試會計錯誤，保留原紀錄。

- LayerControl 摘要及透明度滑桿原本的 2rem 最低高度，在支援的百分之八十比例下只有 25.6px。
  改為 max(32px, 2rem)，保留既有樣式及大比例尺寸；不改圖層、透明度、快捷鍵或核心狀態。
  RED 兩失敗、一通過；修正後新舊五項通過，紀錄 /tmp/tenka-layer-hit-target-{red,green}.log。
  此為 CSS 來源與選擇器規約，不宣稱原生瀏覽器幾何驗收。

- 新增 m6-diplomacy-trust-merit.tfulog.json，未改動 mini 種子 42，以合法開始及停止工作走六百九十一 tick。
  二十二個真正付費月份使信用達上限，下一個付費月份不重複給功績，另以無工作對照查每次費用。
  每日不變量、指令合法及實際套用、重跑、改動指令均通過；不注入資源、年齡、特性或協定。
  最終 hash 為 1bbc5ed55c02743f，此案例不證明協定成立的執行者功績歸屬。

- 原生續算重新建構解碼後的開始與停止待執行佇列，另保存已達滿信用的實際進行中工作。
  事件、持久狀態及亂數相同，只排除不持久的 AI 意圖紀錄。
  根目錄審查指出初稿沿用原始佇列，修正後三項通過，紀錄 /private/tmp/tenka-diplomacy-permanent-replay-native-green.log。
  尚未證明輸送節點修正能由未改動正式劇本的永久重放重現，不把其他新案例當成此項證據。

- 標準資料及素材 npm 指令遭 tsx IPC 的 listen EPERM 阻擋，原始失敗紀錄保留。
  改用 node --import tsx 執行相同驗證程式，完整全國資料及素材均為零錯誤、零警告，簡體字掃描零命中。
  字型一千六百五十九字元，347.1 KB／2048 KB 通過；紀錄 /tmp/tenka-completion-next-{data,assets,script,font}-node.log。

- 最終正常及 core 型別、完整 lint、建置與 bundle 檢查通過；建置保留原本大區塊警告。
  initial gzip 526215 bytes、劇本 100847 bytes、字型 355384 bytes 均符合預算。
  建置、lint 與 bundle 紀錄 /tmp/tenka-occupancy-layer-{build,lint,bundle}.log；各分支的最終型別紀錄另保留。

- 全部作者凍結來源、靜態檢查結束後，以兩個 worker 單獨完整重跑 coverage。
  結果為 4862 通過、8 既有失敗、1 略過，474 檔共 4871 項，耗時 261.74 秒。
  核心 lines 94.59%、branches 91.06%、functions 98%；八項仍為七項 frozen 比較及全國領地不變量。
  同次 UI 八十八檔共 865 項、App 九十七檔共 975 項全部通過，三項圖層來源規約由 core 專案執行。
  紀錄 /tmp/tenka-occupancy-layer-coverage.log；不把百分比達標當成發布通過。

- 兩個舊 replay 及六張 frozen 圖片雜湊不變，plan/00 未修改，里程碑仍為 M6。
  自然死亡無合法繼承人的領地處置仍需規則決定，headless 權限與外部發布驗收缺口仍存在。
  後續只讀審查指出城池武將勾選未接出陣編成，以及先取得 B2 後重現輸送錯劫的可能路線。
  兩者尚未實作或跑完，不宣稱整個遊戲完成，也不將永久重放缺口視為解除。

## 從屬統一、繼續存檔摘要與永久重放（2026-10-09）

- 三個 agent 並行補上結局、存讀介面及永久重放案例，再由其他分支核對來源。
  正常指令成立最後一個從屬協定後，原先支配圈已持有全部城，卻未觸發天下統一。
  有效重現為一失敗、三通過，紀錄 /tmp/tenka-vassal-victory-red-valid.log。
  最初第三勢力本城的設定錯誤屬 fixture 問題，不計為產品失敗。

- 協定結算只在玩家支配圈新增從屬者時設定既有 Step 12 髒標記，勝利判定式不變。
  五項新回歸及相容檢查共三十二項通過，含原生續算、拒絕、同盟、非玩家協定及玩家從屬對照。
  紀錄 /tmp/tenka-vassal-victory-green-frozen.log；不指派城郡、不新增獎勵或亂數。

- 標題的繼續按鈕下方顯示最新可載入存檔的家名、當主、遊戲日期及真實時刻。
  摘要與讀取共用原生解碼後的最新槽位選擇，排除損壞檔，保留 legacy 備份及同時刻順位。
  有效重現為缺少摘要的一項失敗，紀錄 /tmp/tenka-title-continue-preview-red.log。
  既有版本、局所有權及存讀保護不取消；無存檔時停用繼續並清除摘要。

- 五項新回歸及五檔相容檢查共四十三項通過，紀錄 /tmp/tenka-title-continue-preview-green-frozen.log。
  實際 App 檢查摘要後按繼續，載入所選原生存檔，日期、亂數、暫停及不變量均符合預期。
  實際儲存測試另查損壞的最新 blob、更新、刪除、legacy 備份及同時刻選擇；展示不改核心或佇列。
  初期 matcher、參數型別及方法綁定錯誤屬測試設定問題，保留紀錄，不計為產品失敗。

- 新增 tests/replay/cases/m6-corps-reclaim-wallet.tfulog.json，不重寫兩個舊 frozen 案例。
  原始 mini 種子 42 以三個合法指令建立軍團、部分收回城池及解散，正常月結提供收入。
  第三十一日全額收回錢包並歸零，第六十一日另收回新收入，沒有注入前置狀態。
  最終 hash 為 ae57531c8777bc71；軍團長是當主，因此此案例不證明非當主解任忠誠扣減。

- 永久案例有記錄重放、真正待結算指令的原生續算及改動指令三項測試。
  持久狀態及亂數續算只排除不保存的 AI 意圖紀錄，不刪除模擬欄位。
  測試最初引用不存在的忠誠常數屬設定錯誤，保留原紀錄，不計為產品失敗。
  此新增案例不代表所有歷來核心修正均有永久重放證據，也不解除既有 frozen 失敗。

- 改動指令另經獨立的六十一日正常佇列執行，逐指令檢查合法、實際套用及每日不變量。
  最終狀態 hash 與重放的 actualHash 相同，確定差異不是指令遭拒造成。
  三項測試及 lint 通過，紀錄 /private/tmp/tenka-corps-permanent-replay-tamper-{green,lint}.log。

- 根目錄型別檢查涵蓋 tests，core 純度檢查只涵蓋 src/core 與 src/data。
  根目錄檢查找出新測試的 literal 推論與 nullable 參數問題，各原作者修正後完整型別檢查通過。
  完整 lint、建置、bundle、簡體字及字型檢查通過；紀錄 /tmp/tenka-vassal-continue-{types,lint,build,bundle,script,font}.log。
  initial gzip 526180 bytes、劇本 100844 bytes、字型 355384 bytes 均符合預算；原大區塊建置警告保留。

- 首次完整 coverage 為 4850 通過、10 失敗、1 略過，紀錄 /tmp/tenka-vassal-continue-coverage.log。
  其中兩項新增 App 回歸是 F9 版本擷取意外執行最新存檔掃描，快速槽位讀取由一次變三次。
  修正後 F9 僅讀版本，不發布標題摘要；初始化、摘要更新及繼續仍選真正最新可載入檔。
  原十三項快捷讀檔斷言不變，相關六檔五十六項通過，紀錄 /tmp/tenka-continue-quickload-read-scope-green.log。

- 兩個舊 replay 案例與六張 frozen 圖片按本輪起始雜湊核對相同；不宣稱整個既有 worktree 無修改。
  plan/00 未修改，里程碑仍為 M6；瀏覽器維持 headless，不開新視窗。
  自然死亡無繼承人的領地規則、原生畫面權限與外部發布驗收仍未解除，不能宣稱整個遊戲完成。

- 最終單獨完整重跑為 4852 通過、8 既有失敗、1 略過，471 檔共 4861 項，耗時 255.21 秒。
  UI 八十八檔共 865 項、App 九十七檔共 975 項全部通過，兩項新增 F9 回歸已排除。
  核心 coverage 為 lines 94.59%、branches 91.06%、functions 98%；仍不代表整體驗收通過。
  八項失敗仍為七項 frozen 比較及全國無繼承人領地不變量，紀錄 /tmp/tenka-vassal-continue-coverage-final.log。

- 最終完整型別、lint、建置及 bundle 檢查通過，紀錄 /tmp/tenka-vassal-continue-{types,lint,build,bundle}-final.log。
  initial gzip 526206 bytes、劇本 100845 bytes、字型 355384 bytes 均符合預算；原大區塊警告保留。
  驗收清單記錄首次十項失敗及最終八項失敗，不取消斷言、不重寫基準，也不推進里程碑。

## 武將戰法資訊、每日冷靜倍率與完成度核對（2026-10-09）

- 三個 agent 並行審核核心、介面及驗收證據，再分別實作與交叉檢查。
  武將詳情補上正式戰法名稱、采配成本及解鎖限制說明，沿用指揮室樣式與既有翻譯。
  三項有效失敗均為缺少戰法區塊，修正後相關四檔二十九項通過。
  紀錄 /tmp/tenka-officer-tactic-preview-red.log 與 /tmp/tenka-officer-tactic-preview-green-final.log。

- 戰法資訊包含預設戰法及該武將的特性解鎖，不混入其他武將，不提供戰法操作按鈕。
  測試檢查正式順序、一般 tick、同 ID 原生存檔換局及狀態／亂數／佇列不變。
  此證據為實際 React 與 jsdom 測試，不代表原生瀏覽器幾何或美術驗收。

- 每日補給士氣下降套用大將的既有冷靜倍率，士氣結果取整；副將不提供倍率。
  正常排程行軍自然缺糧，先重現下降八點而非六點；修正後六項新回歸及相容檢查共八十九項通過。
  敵境每日基準為一點，乘零點七五後取整仍下降一點；另查潰走鎖定及原生存檔續算。
  紀錄 /tmp/tenka-daily-supply-reisei-red-ongoing.log 與 /tmp/tenka-daily-supply-reisei-green-final.log。

- 修改只涉及補給每日士氣，不改糧耗、逃散、事件、野戰傷害或合戰每刻效果。
  最初五十兵糧的草稿當日已歸城，另有存檔比較設定錯誤；兩者不計為有效產品失敗。
  最終合法長路線在第三十四日缺糧，原生續算比較所有持久狀態及亂數，排除不持久的 AI 意圖紀錄。

- 本輪取得正式 s1560 統計：一百二十一城、三百四十四郡、六百一十九名武將。
  九地方配額均在容許範圍；織田及今川石高校準通過，不以 CLI 返回零直接推定驗收。
  常數審核仍為七項問題，valueProof 與 passed 均為 false；不新增未定係數或名稱例外。
  紀錄 /tmp/tenka-completion-audit-stats.log 及 /tmp/tenka-completion-audit-balance.log。

- 型別、完整 lint、建置、bundle 及字型檢查通過；建置保留原本大區塊警告。
  initial gzip 為 525804 bytes，劇本為 100843 bytes，字型為 355384 bytes，均符合預算。
  紀錄 /tmp/tenka-tactic-reisei-{types,lint,build,bundle,font}.log。
  六張 frozen 圖片雜湊不變，plan/00 未修改，里程碑仍為 M6。

- 第一輪完整 coverage 為 4831 通過、15 失敗、1 略過，紀錄 /tmp/tenka-tactic-reisei-coverage.log。
  除八項既有失敗，另有七項 App 測試超過五秒，當時建置與檢查並行。
  原始失敗保留；後續以兩個 worker 單獨重跑，不改逾時、斷言或 frozen 基準。
  瀏覽器仍維持無視窗限制；原生 headless 權限阻擋及發布驗收缺口未解除。

- 單獨完整重跑為 4838 通過、8 既有失敗、1 略過，468 檔共 4847 項，耗時 260.30 秒。
  同次 UI 八十八檔共 865 項、App 九十六檔共 970 項全部通過；前次七項逾時均未再出現。
  核心 coverage 為 lines 94.59%、branches 91.05%、functions 98%；百分比達標不等於整體驗收通過。
  八項失敗仍為七項 frozen 比較及全國無繼承人領地不變量，紀錄 /tmp/tenka-tactic-reisei-coverage-isolated.log。
  RELEASE_CHECKLIST 同時記錄兩次結果與未通過的發布條件，不自動勾選或推進 M6。

## 快進、季節存檔、掠奪整數與史實驗收（2026-10-09）

- 除錯快進綁定原遊戲及自己的進度物件，每日推進前後均檢查所有權。
  stop 取消自己的延後工作，原局離開後不推進替代遊戲，也不清除新快進的進度。
  正常四十五日快進仍依原本三十日批次執行；核心日結算與亂數規則不變。

- 快進先有兩項有效失敗：第一日發布時換局仍推進新局，以及 stop 後仍執行剩餘日數。
  修正後四項回歸通過；舊排程對新快進與第一日同步 stop 的兩項為修正後補上的正向保護。
  相關三檔共三十一項通過；紀錄 /tmp/tenka-debug-jump-ownership-green-frozen.log。
  重現使用合法最小迴圈狀態與真正日結算，不宣稱證明全國模擬或原生瀏覽器表現。

- 日結算在月報、tick 計數與指令數發布後重新檢查原局及原佇列，才呼叫存檔與自動暫停端口。
  日結算開始時的 debug 狀態決定存檔抑制，不因同日 stop 清除進度而額外存檔。
  已套用的原日結算保留，不回滾已接受指令；替代遊戲的狀態、亂數、佇列與 session 不受舊發布影響。

- 季節存檔先重現換局後存入新局及完成新局進度標記，另重現 debug 停止後錯誤存檔。
  月報發布的獨立重現另證明替代局 tick 計數由 0 變 1，修正後保留原計數及 session 物件。
  五項新回歸與既有六檔檢查共七十四項通過；紀錄 /tmp/tenka-seasonal-autosave-month-green-final.log。
  有效失敗見 /tmp/tenka-seasonal-autosave-ownership-red-effects.log 及 /tmp/tenka-seasonal-autosave-month-publication-red.log。
  最初使用錯誤提交結果欄位的測試失敗屬 fixture 錯誤，不計為產品失敗。

- 輸送掠奪只將可接收兵糧容量向下取整，保留原攜糧公式、貨物處理、金錢與事件。
  真正排程的行軍及輸送先有小額貨物通過、大額貨物失敗；自然歸還的城兵糧為 118.2 而非 118。
  修正後兩項回歸及既有輸送檢查共二十五項通過；每段正常日結算均查不變量。
  紀錄 /tmp/tenka-transport-loot-integer-red-actual.log 與 /tmp/tenka-transport-loot-integer-green-final.log。
  早期路徑游標斷言失敗屬 fixture 錯誤，不計為產品失敗；此回歸不宣稱證明原生存檔旅程。

- 本輪允許修改 bridge.ts 的日結算發布邊界，因此舊保護清單的 bridge 雜湊不再相同。
  原保護清單保留；BAL、store、uiStore、共用 CommandAction、PlotPanel 與六張 frozen 圖片仍按原值核對。
  不以重寫舊雜湊或 frozen 基準掩蓋已發生的修改。

- 新增 tools/ci/historical-event-acceptance.ts，判定 10-T6 的二十種子、二十五年與史實事件中位數門檻。
  判定器檢查完整月樣本、唯一種子、史實型錄、單次計數及合計，不以完成的倖存樣本宣稱通過。
  tools/simulate.ts 新增 historicalAcceptance；原有統計欄位、預設退出行為與模擬負載不變。
  二十三項合成資料對照通過；這些對照只驗證判定器，不是二十場實際模擬的證據。

- 實際 seed1、二十五年模擬在第 1590 日因 clan.saionji 領地所有權失敗，完整樣本為零。
  新判定回傳 incomplete，保留失敗原因；紀錄 /private/tmp/tenka-historical-acceptance-one-seed.json。
  同種子的 0.1 年實際模擬完成一場、零失敗，CLI 仍退出 0；短窗判定仍為 incomplete。
  原欄位中位數為 1，新驗收中位數為 null；紀錄 /private/tmp/tenka-historical-acceptance-short-seed.json。
  初版判定器讀錯 trigger.once 的測試失敗屬程式開發錯誤，不計為產品回歸重現。

- 所有來源固定後，一般與 core 型別、完整 lint／格式、建置與 bundle 預算檢查通過。
  首屏 gzip 為 525637 bytes，劇本 gzip 為 100841 bytes；既有大型 chunk 警告仍在。
  資料與素材驗證均為零 ERROR、零 WARN，簡體字掃描零命中，字型涵蓋率通過。
  紀錄為 /tmp/tenka-session-historical-types-frozen.log 與 /tmp/tenka-session-historical-bundle-frozen.log。
  輸送測試編輯中的早期完整 format 警告已修正，最終完整 lint 紀錄保留通過結果。

- 最終完整 coverage 為四百六十六檔，四千八百二十九項通過、八項失敗、一項跳過。
  UI 八百六十五項與 App 九百六十七項全部通過；此為同一 run 的分組，不是跨 run 相加。
  core 行、分支與函式為 94.59％、91.06％與 98％；八項既有失敗不變，整體 gate 仍失敗。
  紀錄 /tmp/tenka-session-historical-full-coverage.log；全國 golden 仍因 day450 的領地所有權失敗。
  新增四檔三十四項回歸均在本次完整收集範圍內，不把合成驗收資料當作二十場實際模擬。

- 全遊戲目標保持原範圍；沒有更改無繼承人領地收受者、未定政策、BAL 或 frozen 基準。
  headless Chromium 的啟動限制不變，本批不重試相同失敗路徑，也不開可見視窗。
  二十種子史實事件、全國長跑與原生視覺驗收仍未通過，不以新判定器代替實際驗收。

## 指揮室介面重設與樣式回歸（2026-10-09）

- 依使用者要求，四路並行重設整套介面，不開可見瀏覽器視窗。
  外框採深墨色，內容採暖紙色；黃銅標示層級，朱紅標示主要操作。
  標題、劇本、大名、主地圖、戰鬥、結局及管理面板使用同一組語意色。
  此批修改三十八個 CSS 檔與語意色表，不改核心規則、指令格式或存檔。

- 重設後完整 UI／App 測試為一百八十檔、一千八百一十九項通過。
  二十九項 token 測試通過，包含兩種深色表面的文字對比。
  一般與 core 型別、樣式格式及建置通過；既有大型 chunk 警告仍在。
  紀錄為 /tmp/tenka-command-ui-tests.log 與 /tmp/tenka-command-ui-build-frozen.log。

- 後續檢查補上標題列的固有最小高度，避免放大介面時頁尾進入主列的溢出區。
  管理控制項保留實體三十二 CSS 像素下限；深色操作區使用亮色焦點框。
  速度控制直接呈現選中底色，不依賴 MainScreen 的父層覆寫。
  縮放與焦點檢查屬來源契約，不宣稱能證明原生幾何或實際繪製結果。

- 速度控制先有四項有效失敗，修正後四項通過；相關元件與展示操作共十二項通過。
  初版 raw CSS 匯入失敗只是測試程式問題，不計為產品失敗。
  有效失敗紀錄為 /tmp/tenka-speed-style-red-confirmed.log；修正紀錄為 /tmp/tenka-speed-style-green.log。
  測試對實際 React 控制項套用來源樣式，僅代入字面 token 以檢查 jsdom 支援的屬性。

- 標題來源契約先有一項失敗，管理點擊下限先有一項失敗，焦點契約先有兩項失敗。
  修正後四組新回歸與語意色檢查共十八項通過；紀錄 /tmp/tenka-command-polish-regressions-final.log。
  管理測試的 nullable 型別問題已修正，最終一般與 core 型別通過。
  完整 lint／格式及建置通過；紀錄 /tmp/tenka-command-polish-lint-final.log 與 /tmp/tenka-command-polish-build-final.log。

- 本輪完整 coverage 為四百六十一檔，四千七百九十一項通過、八項失敗、一項跳過。
  UI 八百六十五項與 App 九百五十八項全部通過；此為同一 run 的分組，不是跨 run 相加。
  core 行、分支與函式為 94.59％、91.06％與 98％；八項既有失敗不變，整體 gate 仍失敗。
  紀錄為 /tmp/tenka-command-polish-full-coverage.log；全國仍在 day450 因無繼承人領地所有權失敗。
  收集測試後才新增的四項焦點契約不在本輪完整數字內，另由最終十八項 scoped 檢查證明通過。

- headless Chromium 仍受 sandbox 啟動權限限制；本批沒有重新嘗試相同失敗路徑。
  六張 frozen 圖片保持不變，不把舊圖片當作新樣式的驗收證據。
  原生視覺、長跑、既有 frozen 比對與未定領地規則仍未通過；全遊戲目標維持原範圍。

## 使者決策的展示內容所有權（2026-10-09）

- 使者接受與拒絕綁定已展示的實際提案、完整條款、原局及唯一 FIFO 描述。
  舊遊戲、同 ID 不同條款、曾離開的原視窗與 native 前景變動均撤銷舊回呼。
  StrictMode 只建立新的操作權，不恢復舊回呼；空提案只關閉原本擁有的視窗。

- 真正排程、正常日結算及 native 存檔解碼的六項對照先有四項失敗、兩項通過。
  修正後六項對照與四項既有管理操作共十項通過；型別、格式及 scoped lint 通過。
  紀錄為 /tmp/tenka-envoy-decision-ownership-red.log 與 /tmp/tenka-envoy-owner-green-final.log。
  已接受指令保留原佇列；送出後失去所有權時，不發布標記或關閉替代視窗。
  條約費用、信任、結算與命令格式不變；此證據不代替原生瀏覽器驗收。

## 具申決策所有權與 StrictMode 正常操作（2026-10-09）

- 11 §3.10／D40 要求決策對應已展示的保存命令；收件匣舊回呼原只攜帶提案 ID。
  兩個初始合法遊戲各自真正產生及保存出陣提案，再以 native codec 載入相同 ID、不同內容的遊戲。
  舊採納、駁回及全部駁回回呼都錯誤入列新提案；原始三項失敗為 `/tmp/tenka-proposal-decision-ownership-red-confirmed.log`。
  擴充失敗另證明送出後發布污染新視窗，以及移走再恢復同一 FIFO 描述會復活舊回呼。
  五項失敗、一項對照通過紀錄為 `/tmp/tenka-proposal-decision-ownership-expanded.log`。

  收件匣現在綁定實際遊戲、唯一描述、原提案及保存命令；失去所有權便永久撤銷舊回呼。
  實際 native 前景、主畫面、致命錯誤及 viewport 邊界限制送出；送出後重新檢查再發布。
  全部駁回使用顯示時的提案快照，每個端口及發布後重新檢查，失去所有權即停止。
  已接受指令保留佇列，不回滾；處理標記限定原局，空收件匣只關閉原本擁有的視窗。
  費用、忠誠、成功率、原提案命令及正常日結算不變；不修改共用 CommandAction 或 bridge。

  八項新所有權測試與原描述、預覽及 M6 面板共二十八項通過；紀錄 `/tmp/tenka-proposal-owner-green-frozen.log`。
  StrictMode 正常採納與未發布的同 ID 提案物件替換屬新增 GREEN 證據，不宣稱修正前失敗。
  第八項紀錄名稱含 `red`，但實際結果為通過，不能把檔名當成失敗證據。
  兩個舊測試補上主畫面的初始 screen，保留原斷言；不放寬 title 畫面的生產護欄。
  原生瀏覽器、全部暫態 native 回呼序列及全國具申旅程仍未驗收。

- 入口真正使用 StrictMode；捕虜回呼於重掛載檢查的 cleanup 被撤銷，第二次 setup 沒有取得新權限。
  合法初始捕虜、真實 bridge 與 native 按鈕重現釋放及登用均無法入列，兩項失敗為 `/private/tmp/tenka-captive-strict-red-confirmed.log`。
  setup 發現已撤銷的 owner 時，增加 leaseRevision 並建立新 owner，不恢復舊 owner。
  原防重送、確認、FIFO 及正常日結算不變；登用、釋放、執行三項 StrictMode 測試通過。

  執行對照在修正後加入，確認前佇列為零；實際確認後只入列一次，正常日死亡並通過不變量。
  初稿未支援 matcher 與成功率函式少一個 clan 參數的型別失敗均保留，不算玩法失敗。
  成功率對照補正後三項及完整型別通過；紀錄 `/private/tmp/tenka-captive-strict-green-typed-final.log`。
  原捕虜防回呼復活及送出後護欄仍通過；受控初始捕虜不是全國自然俘獲或原生瀏覽器證據。

  完整 coverage：4776 通過、8 失敗、1 略過，共 457 檔；本批新增十一項全部通過。
  行覆蓋率 94.59%、分支 91.06%、函式 98%；紀錄 `/tmp/tenka-proposal-strict-final-full-coverage.log`。
  原七項凍結比對與 s1560 day450 無繼承人領地失敗仍在，沒有改寫基準。
  型別與 core 純度、完整 lint、正式建置、資料、繁體字、字型及素材檢查通過。
  初始 gzip 524844 bytes、劇本 100844 bytes、字型 355384 bytes，均在既定容量限制內。
  BAL、共用命令、store／bridge、六張凍結截圖、00 與里程碑保持不變；大 chunk 警告保留。

  同輪 UI 八十七檔八百六十一項，App 九十二檔九百五十二項全部通過。

  下一個來源缺陷是 EnvoyModal 的 respondPact 舊回呼只帶 ID，送出後無條件標記並關閉當前視窗。
  實際 proposePact 與正常日能產生可測的外交提案，尚未修改或宣稱修正。
  全國長跑、原生視覺與整個遊戲驗收仍未完成；領地受領規則仍待使用者裁決。

## AI 出陣選將的有效統率（2026-10-09）

- 既有最高統率排序只比較基礎值，與 02／06 的一般有效能力定義不符。
  同城武將 80＋0 與 79＋5 應選後者；原排序卻選前者。
  120＋0 與 119＋5 均須封頂 120，再依原武將 ID 次序決定，原排序也選錯。
  修正只讀取一般有效統率，保留所有資格、ID 平手次序、身分帶兵上限及命令規則。
  不套軍神、不改寫能力成長、不新增 AI 選將政策或亂數。

  三項新測試包含兩個真正失敗與軍神對照；原始紀錄 `/tmp/tenka-ai-march-leader-red-final.log`。
  失敗前均先產生普通指令、通過中央驗證、真正入列、正常日出兵並保留不變量。
  planner 的完整狀態及亂數純度也通過；沒有直接注入出陣後的軍隊或大將。
  與既有軍事計畫、派令、資源預留及目標評分共五十七項通過；型別與 core 純度通過。
  通過紀錄為 `/tmp/tenka-ai-march-leader-green.log` 及 `/tmp/tenka-ai-march-leader-types.log`。

  獨立審查另補強封頂反例：ID 較晚者 119＋5，ID 較早者 120＋0。
  未封頂的基礎值加成長排序會選錯；一般有效能力封頂後，維持 ID 平手次序。
  此第四項測試在修正後加入，屬 GREEN 證據，不宣稱有修正前失敗。

  建議出陣新增一項 GREEN 測試，使用真正候選產生、提案保存與 ProposalInbox 畫面。
  最佳統率武將與提案者不同時，保存命令及預覽均使用提案者，不重新推測大將。
  預覽前後完整遊戲狀態、亂數與玩家佇列不變，並保留不變量。
  紀錄為 `/tmp/tenka-proposal-march-leader-preview-green.log`；不宣稱曾有介面綁定缺陷。

  完整 coverage：4765 通過、8 失敗、1 略過，共 455 檔；UI 861 項、App 941 項全部通過。
  原七項凍結比對及 s1560 day450 的無繼承人領地失敗仍在；沒有更新基準。
  行覆蓋率 94.59%、分支 91.04%、函式 98%；紀錄 `/tmp/tenka-ai-leader-final-full-coverage.log`。
  型別與 core 純度、完整 lint、正式建置、資料、字型及素材檢查通過。
  初始 gzip 523939 bytes、劇本 100845 bytes、字型 355384 bytes；既有大 chunk 警告保留。
  BAL、共用命令及六張凍結截圖不變；沒有修改 00、里程碑或存檔格式。

  功能測試、建置及全部代理工作結束後，單工執行既有平均效能門檻。
  六十日暖機及三百六十日測量：首次平均 9.6485 ms，依原單次重試規則第二次為 7.0290 ms。
  八毫秒門檻於第二次通過；兩次原始樣本均保留在 `/tmp/tenka-ai-leader-serial-mean.log`。
  這是本機短窗觀測，不宣稱全國長期或跨硬體效能通過。

  隨後單工執行五年候選 p95 門檻，於 day450 的 INV-02／INV-22 停止，測量樣本為零。
  紀錄 `/tmp/tenka-ai-leader-serial-p95.log`；沒有跳過不變量、縮短準備期或放寬門檻。
  無合格繼承人仍持有領地的受領規則未定，已再次向使用者請求裁決。
  原生視覺、全國長跑及完整遊戲驗收仍未完成，目標保持不變。

## AI 圍城兵糧撤退與資料驗收（2026-10-09）

- 09 §3.4.3 規定無補給且攜糧十五日內耗盡時撤退；原判斷漏掉每日取整及兵站特性。
  真正 AI 計畫、中央命令佇列及正常每日流程重現兩個錯誤，沒有直接修改出陣後的軍隊或計畫。
  無特性軍隊剩糧 42 石、兵力 101，實際可支撐十四日，卻因舊值 20.79 日而沒有撤退。
  兵站軍隊剩糧 73 石、兵力 250，實際可支撐 18.25 日，卻因舊值 14.6 日而提前撤退。
  初始高耐久城是受控、通過不變量的測試條件，不是全國實戰或平衡驗收。

  判斷改用既有實際兵糧日數函式；保留十五日含等號邊界、原補給條件及指令順序。
  攜糧、補給、亂數及 BAL 不變；不加入未來傷亡或補給預測。
  原始獨立失敗紀錄為 `/tmp/tenka-ai-siege-effective-food-independent-red.log`。

  四項新測試通過，包含十五日等號邊界及下一日真正執行撤退、解除圍城的證據。
  測試獨立計算取整與特性公式，核對正常扣糧、原軍隊身分及每個正常日的不變量。
  同日再次處理剛進入的圍城，以及撤退後清理計畫軍隊清單，均按真實流程觀測。
  初稿的軍隊混入、階段觀測及型別失敗保留在 scratch 紀錄，不當作有效玩法失敗。
  與既有攻勢計畫及自動歸還測試共三十一項通過；紀錄 `/tmp/tenka-ai-siege-integrated-green-final.log`。

  完整 coverage：4760 通過、8 失敗、1 略過，共 453 檔；UI／App 的 1801 項全部通過。
  原七項凍結比對及 s1560 day450 的無繼承人領地失敗仍在，未重錄基準。
  行覆蓋率 94.59%、分支 91.04%、函式 98%；紀錄 `/tmp/tenka-ai-siege-final-full-coverage.log`。
  型別與 core 純度、完整 lint、格式、建置及容量檢查通過；既有大 chunk 警告保留。
  首載 gzip 523939 bytes、劇本 100844 bytes、字型 355384 bytes，均在原容量限制內。
  BAL、共用命令及六張凍結截圖雜湊不變；沒有修改 00、里程碑或存檔格式。

- 正式資料、繁體字掃描、字型覆蓋及素材檢查通過，均為零錯誤。
  原 npm 入口因沙箱禁止 tsx 的 IPC 而失敗；改以 `node --import tsx` 執行同一檢查程式。
  沒有跳過檢查、改寫資料或放寬規則；紀錄 `/tmp/tenka-ai-food-validate-direct.log` 及同批三份 direct 紀錄。
  新版 UI 的來源檢查未發現已確認的阻斷回歸；這不代替原生排版、GPU 或美術驗收。

  下一個來源缺陷是 AI 既有最高統率排序只看基礎值，漏掉一般有效能力的成長及封頂。
  同城 80＋0 與 79＋5 的排序能反轉；本批只核對來源，尚未實作或宣稱修正。
  全國長跑、原生視覺及整個遊戲驗收仍未完成；不縮小完成目標。

## 出陣士氣、兵糧日數與登用送出後護欄（2026-10-09）

- 02 §4.4 的一般有效能力須封頂 120；初始出陣士氣卻直接使用統率基礎值加成長。
  合法入列出陣重現 119＋5 及 120＋5 得到士氣 95，正確值為 94。
  改用既有一般有效能力函式；原取整、政策入口、難度加值及士氣 0..100 上限不變。
  五項新測試包含封頂前後對照、軍神不擴張到一般士氣、驗證純度及實際 native 續跑。
  原始失敗為 `/private/tmp/tenka-march-effective-red.log`；與既有軍事、制壓回歸共七十七項通過。

- 07 §3.13 的自動歸還依剩餘實際可支撐日數，06 的兵站上手降低大將所率部隊每日糧耗。
  原系統扣糧計入特性，歸還日數與部分資訊卻漏掉倍率。
  合法 101 人出陣攜糧 50 石，在三十日友方道路正常耗糧；第十五日尚存 20 石、可支撐十日卻提前返回。
  另一項失敗顯示 map selector 為 7.33 日，已正確的 hover 為十一日；原始紀錄 `/tmp/tenka-auto-return-effective-food-red-expanded.log`。

  新的純計算函式統一每日實際糧耗與剩餘日數，特性倍率仍在 `ceil` 之前作用。
  每日扣糧、自動歸還、map selector、MainScreen 快覽及 hover 使用同一公式。
  保留零兵顯示、缺少大將的原 fallback、攜糧上下限、城補給水位及圍城尾聲例外。
  AI 攻城中止的獨立策略與預算預估不在本批遷移範圍，不宣稱全部兵糧計算均完成。

  `verified-refactor` 檢查器定位三處舊日數除法，core 批降為一處，MainScreen 批降為零。
  語法樹檢查保留錯誤、共用函式及正確內嵌特性公式的反例測試；零次違規不代替行為驗證。
  檢查器為 `/private/tmp/tenka-army-food-days-check.mjs`；最終紀錄 `/tmp/tenka-army-food-days-final.log`。
  未寫入凍結基準或提交；攜糧、補給、預算、AI 策略、測試與產生檔明確排除。

  四項實際行軍測試通過，兵站與無特性對照分別於第十八日及第十日正確歸還。
  第八日於實際行軍途中存檔，native 續跑至第十八日的事件、持久化狀態與亂數一致。
  只排除 codec 不保存的 AI 診斷 intentLog，未剝除玩法欄位；每個正常日保留不變量。
  MainScreen 新測試以真正 bridge 十四日耗糧，確認 22 石顯示十一日；只替代 Pixi／canvas，不替代主畫面。
  該畫面測試在修正後加入，只有 GREEN 證據，不宣稱具有修正前 RED 或原生瀏覽器驗收。

- 登用端口成功排隊時，真正 pending 訂閱能以 native codec 的同 ID 武將物件替換原預覽。
  舊端口仍標記決策並關閉父視窗；新增失敗同時證明這兩個 UI 副作用，原指令只入列一次。
  送出後再查原選定武將草稿及實際物件；失去所有權便停止發布，不回滾已接受的指令。
  兩項新測試與既有捕虜回歸共四十七項通過；成功率、簽約金、命令及正常日結算不變。
  原始失敗為 `/tmp/tenka-captive-recruit-post-dispatch-red-confirmed.log`，通過為 `/tmp/tenka-captive-recruit-post-dispatch-green.log`。

- 最終完整 coverage：四千七百五十六項通過、八項失敗、一項略過；四百五十二個檔案。
  UI 八十七檔八百六十一項、App 八十九檔九百四十項全數通過。
  原八項失敗仍為凍結 hash／重播差異及 s1560 無繼承人領地不變量；沒有更新基準來消除失敗。
  紀錄為 `/tmp/tenka-morale-food-final-full-coverage.log`；行覆蓋率 94.59%、分支 91.04%、函式 98%。

  型別、完整 lint、正式 build 及 bundle gate 通過；build 仍有既有大區塊警告。
  初始 gzip 523950 bytes、劇本 gzip 100847 bytes、字型 355384 bytes，均在既定上限內。
  BAL、共用命令、store／bridge 及六張凍結截圖雜湊保持不變。
  無頭瀏覽器的原生視覺驗收仍未通過；本批不宣稱整個遊戲完成。

## 制壓有效統率與捕虜回呼撤銷（2026-10-09）

- 02 §4.4 定義能力為基礎值加成長，限制為 120；實際制壓卻以基礎統率判斷 80 點加速門檻。
  真正入列行軍重現 79＋1 仍需四日，規格公式為三日；79＋0 與 80＋0 對照原本通過。
  `military.ts` 改用既有一般有效能力函式；不套用合戰特性，也不改無大將的路徑預覽。
  新測試保留正常每日制壓、事件、不變量與 native 存檔續跑；與既有軍事測試共七十二項通過。
  原始失敗為 `/private/tmp/tenka-subjugation-effective-red.log`，通過紀錄為 `/tmp/tenka-subjugation-effective-green.log`。

- 捕虜父描述移除後恢復，或外部原生 dialog 出現後消失，原處決確認仍可入列。
  增加同步所有權撤銷與 native 變更紀錄處理；原局、父描述或前景消失後，不復活舊回呼。
  新操作權重設確認；正常 tick 不撤銷當前確認，實際指令仍由下一個正常日結算。
  原始兩項失敗為 `/tmp/tenka-captive-owner-revival-red.log`。

  成功排隊時的同步訂閱能取消處決確認，但舊送出端口仍標記決策並關閉父視窗。
  送出後再查原確認及原 native dialog；已接受的指令保留，不對別人的前景發布或清理。
  同任務內真正外部 dialog 掛上再卸下的測試，確認待送達紀錄不能繞過護欄。
  原始失敗為 `/tmp/tenka-captive-post-dispatch-red.log`；不是模擬可重新開啟的同一處決請求。

  登用另綁定選定武將草稿及實際武將物件；切換後恢復或同 ID 原生存檔物件替換，均拒絕舊按鈕。
  新按鈕仍能入列，正常日保留原成功率、實際簽約金及不變量；不凍結同物件的正常能力成長。
  原始失敗為 `/tmp/tenka-captive-executor-draft-red.log`；四檔四十五項捕虜回歸通過。
  使用受控且合法的初始捕虜，不宣稱測試完成全國俘獲旅程或原生瀏覽器驗收。

  本批完整 coverage 為 4744 通過、8 失敗、1 跳過，共 448 檔；253.49 秒不作效能比較。
  Core 行、分支及函式為 94.59%、91.04%、97.99%；紀錄 `/tmp/tenka-captive-effective-full-coverage.log`。
  同輪 UI 八十七檔、八百六十一項與 App 八十七檔、九百三十七項均通過。
  七項凍結比對及全國 day450 的無繼承人領地失敗仍在；Saito 仍持有四城十六郡。
  不縮短長跑、排除失敗或重錄基準；型別、完整 lint、格式、建置及原 bundle 預算通過。

  首載 gzip 523994 bytes、劇本 100845 bytes、字型 355384 bytes；大 chunk 警告保留。
  BAL、uiStore、shared CommandAction、PlotPanel、store、bridge 與六張凍結截圖雜湊不變。
  未改 00、里程碑或存檔格式；全國長跑、原生瀏覽器、美術及整體遊戲門檻仍未完成。
  下一個明確玩法缺陷是出陣初始士氣使用未封頂統率；本批尚未修改或宣稱修正。

## 象牙白編輯式全介面（2026-10-09）

- 依使用者的新要求，四路平行重設入口、地圖與戰鬥 HUD、資訊面板及共用元件。
  採象牙白表面、墨綠黑導覽、朱紅主要操作與克制的黃銅重點；標題新增純 CSS 山景及編號導覽。
  表格減少外框，面板改用留白與分隔線；保留 handlers、鍵盤、確認、原地圖座標及最小操作目標。
  不變更 core、地圖演算法、素材或凍結截圖；先前墨色改版紀錄保留為歷史快照。

  對比測試改為不依賴明暗方向的計算，涵蓋文字、狀態色、hover 與選取表面。
  次要文字及黃銅色經真實失敗後加深；深色 tooltip 使用獨立明亮狀態色，收益與損失不再沿用暗字。
  UI 與 App 共一百七十二檔、一千七百九十項通過；型別、樣式、格式、建置及原 bundle 預算通過。
  紀錄為 `/tmp/tenka-editorial-ui-app.log`、`/tmp/tenka-editorial-lint-format.log` 與 `/tmp/tenka-editorial-bundle.log`。

  Headless Chromium 在建立 page 前受 macOS MachPortRendezvous 權限拒絕並退出，未開新視窗。
  紀錄為 `/tmp/tenka-editorial-headless.log`；程式與 jsdom 通過不代替實際排版、GPU 或美術驗收。
  無繼承人領地、七項凍結比對、未定義秋收歸屬及整體遊戲門檻仍未解決。

## 分郡收入與重播防篡改（2026-10-09）

- 樂市樂座收入誤查郡所屬城的城主政策，與 05 §3.7.2 的全勢力收入效果不符。
  真正入列行軍與每日壓制後，郡屬 Alpha 而城仍屬 Beta；兩項原始失敗為 181 對 173、145 對 154。
  全勢力收入改傳收取收入的勢力；城的施設倍率、知行稅率、最後取整與城區同勢力限制不變。
  原始證據為 `/tmp/tenka-rakuichi-ownership-red.log`；不靠直接注入壓制後領地歸屬重現。

- 調略的 busy 執行武將拒絕資訊也缺少名稱；真正外交工作入列後的新測試重現此失敗。
  補實際武將名稱，不改資格、費用、亂數或命令格式；UI 一項與調略 core 二十三項通過。
  驗證前後狀態相等，拒絕按鈕不入列；紀錄 `/tmp/tenka-plot-busy-name-red.log` 與 `/tmp/tenka-plot-busy-green.log`。

- 戰鬥及命令重播的當前相同種子重跑、native codec 續跑一致；未重現不確定性缺陷。
  舊凍結 BAL 為 `7634217400759e66`，當前為 `824f87bf28bccf9a`；只含舊 hash 的檔案不足以重建較早每日狀態。
  不把差異全部歸因於 metadata，也不把當前重跑一致當成舊凍結軌跡驗收。
  原始紀錄為 `/tmp/tenka-battle-current-repeat.json` 與 `/tmp/tenka-replay-readonly-probe.log`。

  四項防篡改測試原先同時承擔舊基準前置條件，無法單獨測出篡改行為。
  改用正式執行與 recorder 產生當前記憶體錄製，再只修改受測的 BAL、layout 或 command 欄位。
  新增戰鬥三十刻重跑與十五刻存檔續跑測試；不是手寫預期 hash，也不寫入凍結檔案。
  原 B8、凍結 transcript、兩個命令 log、mini、AI、外交與全國比對仍保留，完整 gate 尚未通過。

  最終收入歸屬五項通過，包含敵我政策對照、無政策、知行與市的倍率、真正月結算及 native 續跑。
  受控初始政策與道路明確分列，壓制後不注入郡主；每個正常日保留不變量及事件、持久化狀態比對。
  最初擴充月結算測試誤比較 codec 不保存的 intentLog，兩項 oracle 失敗另保留；修正持久化比較而非產品規則。
  原始兩項政策歸屬 RED 不變；最終紀錄 `/tmp/tenka-rakuichi-ownership-green-final.log`。

  完整 coverage 最終為 4733 通過、8 失敗、1 跳過，共 445 檔，255.29 秒不作效能比較。
  Core 行、分支及函式為 94.58%、91.02%、97.99%；同輪 UI 861 項與 App 929 項均通過。
  四項防篡改前置條件修正不等於四項核心玩法修正；七項凍結比對與一項無繼承人領地失敗仍在。
  收入歸屬沒有新增長跑失敗；紀錄 `/tmp/tenka-income-final-full-coverage.log`。

  一般與 core 型別、完整 lint、格式、建置及 bundle 通過；大 chunk 警告保留。
  首載 gzip 523175 bytes、劇本 100844 bytes、字型 355384 bytes，原預算通過。
  BAL、shared CommandAction、uiStore、PlotPanel、store、bridge 與六張凍結截圖雜湊不變。
  未改凍結 hash、00、里程碑或存檔格式；原生瀏覽器與整體遊戲驗收仍未完成。

## 快速讀檔確認與滅城回歸（2026-10-09）

- 本批開頭完整 coverage 為 4704 通過、14 失敗、1 跳過，共 441 檔。
  Core 行、分支與函式為 94.58%、90.97%、97.99%；紀錄 `/tmp/tenka-post-ui-full-coverage.log`。
  此快照早於本批快速讀檔、外交提示與七地區測試修正，不作最終驗收或效能比較。
  其中十三項為 core 失敗，另一項為歷史 pending choice 測試的五秒逾時；原失敗保留。

- 外交工作缺少 busy 武將名稱，實際提示顯示 `{name}`；真正工作入列後的 UI 測試重現失敗。
  拒絕資訊改傳實際武將名稱；驗證仍為純函式，費用、資格及亂數規則不變。
  核心十八項與 UI 六十七項通過；第一輪 matcher 缺失不是有效產品失敗，修正後另保留真正 RED。
  紀錄 `/tmp/tenka-diplo-busy-name-red-confirmed.log` 與 `/tmp/tenka-diplo-busy-name-ui-green.log`。

- 原七地區第 185 日 Yuki 滅亡斷言不符實際軌跡；Hojo 第 157 日出陣、第 158 日開始攻城。
  第 185 日城防、士氣與守軍仍為正值；每日狀態不變量通過，來源不支持強制陷城。
  原 world、seed、185 日視窗與每日檢查保留，改明確鎖定合法攻城進度及未提早滅亡。
  另加受控 tiny 初始地形與守軍，但後續只用合法命令、每日行軍和攻城系統。

  真正外交雙端工作與另一項朝廷工作先入列，最後一城在第 96 日實際陷落。
  測試觀察攻城開始、陷城與滅亡，檢查雙端工作清除、朝廷工作物件身分與欄位皆保留。
  五項通過，原三項清理測試不變；不是全國滅亡或無繼承人領地規則的驗收。
  紀錄 `/tmp/tenka-yuki-cleanup-fixture-strengthened-green.log`；未改 core、BAL 或凍結基準。

- 快速讀檔確認原本只有 boolean；真正 App 舊確認能在 native codec 換局後覆寫新局。
  測試使用正式 App、controller、儲存佇列、codec 與事件 catalog；Main/Pixi 渲染與儲存 I/O 使用替身。
  保留 `/tmp/tenka-quickload-consent-session-red.log`，不把記憶體 adapter 視為原生 IndexedDB 或瀏覽器證據。
  暫時失去 native 前景再返回的舊回呼亦有真正 RED；後續修正與最終 gate 另記。

  快速讀檔確認改綁原局、策略畫面、一次性請求、原 FIFO 描述、native 前景與實際 quick 槽版本。
  開啟確認前先取得版本；原局消失即拒絕稍後開窗，重複 F9 不建立第二個待開請求。
  原確認消失、取消或失去 native 前景即不可復活；確認前處理尚未送達的 native 變更紀錄。
  取消只移除自己的 FIFO 描述，不恢復時間；下一個摘要依原佇列交棒。

  十三項通過，包含同摘要、同 timestamp 但內容不同的槽位替換及新確認正常讀入。
  延遲取得版本時換局不開舊確認，暫時 native 前景失去再返回也不復活舊回呼。
  正常策略畫面的 clean F9 保留直接讀取；存檔格式、核心玩法與 shared modal API 不變。
  三檔五十一項接線測試、一般與 core 型別通過。
  證據為 `/tmp/tenka-quickload-consent-expanded-green.log` 與 `/tmp/tenka-quickload-consent-compat-refrozen.log`。

  最終完整 coverage 為 4721 通過、12 失敗、1 跳過，共 442 檔，耗時 245.25 秒。
  Core 行、分支與函式為 94.58%、91.00%、97.99%；同一輪 UI 861 與 App 928 項均通過。
  使用兩個 worker，沒有修改原逾時或斷言；先前歷史 pending choice 檔在原限制內六項通過。
  不用 worker 改變或跨輪時間差宣稱效能改善；紀錄 `/tmp/tenka-quickload-final-full-coverage.log`。

  仍有 day450 無繼承人後 Saito 持有四城與十六郡的不變量失敗，以及十一項凍結比對失敗。
  這些失敗未排除、未重錄；無繼承人領地受領規則仍待裁決，整體 gate 保持 FAIL。
  完整 lint、格式、正式建置、bundle、資料、字型及素材驗證通過。
  首載 gzip 為 523169 bytes、劇本 100845 bytes、字型 355384 bytes；大 chunk 警告保留。
  BAL、uiStore、shared CommandAction、PlotPanel、store、bridge 與六張凍結截圖雜湊不變。
  未改 00、里程碑或存檔格式；未開新視窗、提交或部署，原生瀏覽器驗收仍未完成。

## 全介面重設計與存讀檔確認（2026-10-09）

- 依使用者要求，以四路平行工作重設主選單、劇本與大名選擇、地圖 HUD、面板、戰鬥與結算畫面。
  語意主題採墨色表面、米白文字、朱紅與金色重點；移除正式 UI 的紙色與紋理引用。
  表格保留四十像素虛擬列，控制保留最小三十二像素目標；地圖柔化標籤並重生兩張地形材質。
  文字對比測試、UI 859 項與 app 851 項通過；正式建置、型別、lint、字型與素材驗證通過。

  這是 UI 改版當時的快照，不是後續存讀檔批次的完整回歸數字。
  六張既有截圖雜湊不變；headless 啟動受 sandbox 權限阻擋，實際畫面與視窗尺寸尚未驗收。

- 存讀檔確認綁定原局、畫面、面板、槽位版本與匯入預覽；父 dialog 保留掛載，確認只替換同一視窗的內容。
  已重現舊面板回呼與同槽替換會刪除新存檔；同摘要、同時間但 blob 不同亦有真實 RED。
  舊錯誤回呼關閉新面板的 RED 也重現；第一個空快速槽 fixture 只產生 notice，不是有效錯誤 RED。

  修正後儲存 62 項、確認 31 項、App 與 controller 接線 44 項通過；判斷成本由十四筆摘要讀取增為二十八筆 blob 與摘要讀取。
  真正 App 標題及系統選單確認使用記憶體 adapter 的 I/O 替身，但 controller、儲存佇列與 codec 為正式來源。
  延遲測試只證明交易送入前撤銷；不宣稱已送入交易可以回滾，也不宣稱跨頁籤原子性。

  既有同局存檔失敗轉入戰鬥仍顯示錯誤，且不能匯出未儲存的戰術指令。
  繼續遊戲檢查選定實際槽位版本；測試以正式選擇端口的委派 spy 控制替換時序，不假裝自然瀏覽器競態。
  存檔格式、BAL、core、shared modal API 與里程碑狀態皆未變；完整遊戲 gate 仍未完成。

  本批次最終六檔整合 76 項通過，包含讀取失敗快照不能刪檔、重新整理後可以正常操作。
  最新全套 coverage 為 4691 PASS、15 FAIL、1 SKIP，共 440 檔；耗時 103.68 秒，不作效能改善比較。
  Core lines 94.58%、branches 90.95%、functions 97.99%；完整 gate 仍為 FAIL。
  十四個既有失敗仍在，另有 productionEventSession 歷史 pending choice 測試的五秒逾時。

  逾時檔以原五秒限制與相同 coverage 單獨重跑，六項通過；歷史 pending case 實測 4141 毫秒。
  保留原失敗，不以單檔通過宣稱整套通過；證據為 `/tmp/tenka-save-consent-full-coverage.log` 與 `/tmp/tenka-save-production-event-coverage-recheck.log`。
  其餘型別、lint、格式、正式建置與 bundle 預算通過；BAL、共用 command／modal 與六張凍結截圖雜湊不變。

  後續外交工作批次已重現工作 A 停止、工作 B 開始後，舊停止回呼錯誤停止 B 的失敗。
  停止端口改綁實際任務及四個穩定欄位；開始端口綁原執行武將、目標與任務缺席。
  CourtPage 轉交前景 scope；原前景消失會撤銷舊回呼，正常返回後產生新的操作端口。
  不新增停止確認，不改命令格式、月費或正常日入列規則。

  新增十項外交工作測試通過；Main 的真正朝廷開始、停止與替換旅程亦通過。
  Main 使用實際 s1560 資料與正式 bridge，但朝廷 favor 和日期是明示 fixture。
  舊回呼測試保存實際 React callback，不宣稱實體瀏覽器的脫離按鈕證據。
  完整 UI 860 項、App 914 項通過；紀錄 `/tmp/tenka-diplo-final-ui-green.log` 與 `/tmp/tenka-diplo-final-app.log`。

  此快照在重試修正前；另已用真正佇列重現結算拒絕後無法重試，不把它當成全部驗收完成。
  修正只在原指令離開佇列且正常日推進後建立新操作權，舊回呼仍失效。
  戰鬥 renderer 失敗提示改用淺色戰場的深色文字；主題對比與戰鬥 host 二十一項通過。
  修正後最終 UI 860 項、App 915 項通過，外交工作十一項均通過。
  最終紀錄為 `/tmp/tenka-diplo-final-ui-frozen.log` 與 `/tmp/tenka-diplo-final-app-frozen.log`。

  四地區長跑的失敗不是當主重複，而是義通返回的固定軌跡斷言不符實際模擬。
  每日唯一性與狀態不變量均通過；義通從未出陣，另有八十六次其他部隊實際返回。
  四地區測試明確鎖定零出陣、未返回及其他部隊返回，保留原死亡、領地與 AI 參與斷言。
  原兩地區第一百一十一日返回的測試不變；六項通過，不改 core 或凍結基準。
  此修正不是完整 gate 通過，原生視覺驗收與其他全遊戲失敗仍未完成。

## 系統選單所有權與回標題清理（2026-10-09）

- 三組平行分工：producer 只改 SystemMenu／Host，author 只新增 systemMenuConsent，reviewer 唯讀。
  root 改 App 過渡清理、AppSessionRestore 及 Main 旅程，不改 core 或 shared modal API。
- 真正最小 RED 兩項保留：/tmp/tenka-system-menu-consent-red.log。
  原 native title 確認在同 ID codec 還原新局後呼叫舊端口；原 Resume 關閉後來的 owner。
  同標題外部 panel 替換另有真正 RED：/tmp/tenka-system-menu-consent-same-title-red.log。
  舊 Back 錯誤呼叫舊 onBack；修正以當前實際 panel prop 所有權阻擋，不靠標題字串。
- author 二十三項通過：/tmp/tenka-system-menu-consent-same-title-green.log；scoped lint／format 通過。
  title 確認只呈現一個 native dialog，保持原 systemMenu 父 FIFO；沒有把確認排在自己後方。
  當前原生前景、原局／畫面／父描述／子畫面、不可復活與同步替換均有局部對抗證據。
  Cancel 聚焦按 shared Dialog 的真正 RAF 時序等待；未證實產品焦點缺陷，不改 shared Dialog。
  fatal、viewport、gameOver 的回標題恢復用途保留，不杜撰遊戲指令閘門或關閉規則。
- root App 真正精靈開局後的清理 RED 三項保留：/tmp/tenka-system-menu-app-red-valid.log。
  同步 pause、UI reset 或 game-null publication 掛上 native codec 替換局，舊清理錯誤丟棄新局或轉到 title。
  第一輪 parent descriptor 缺少 params 的前置錯誤另保留，不把它宣稱為乾淨 source RED。
  同局替換父選單在 pause／UI reset 到達亦真正 RED：/tmp/tenka-system-menu-app-modal-red.log。
- App 清理保存原局、原畫面、過渡 token 及父描述，使用局部訂閱不可逆撤銷消失的父項。
  釋放原父項後，新的 current／queue 描述會撤銷舊清理；每次同步 publication 後重查所有權。
  pause、UI reset、battle orders、game-null 與 persistence reset 均查過渡，不讓舊送出繼續清理替換局。
  ending 回標題保留用途；正常 dirty 取消無 core 改變，確認才丟棄原局。
- root App 十項通過，包含真正 s1560 精靈、正常日 dirty、實際 IndexedDB port／codec quick-load 與保留舊確認。
  畫面 renderer 與 storage transport 採既有測試 stub；App 路由、精靈、codec、mount 與清理是真正 production 接線。
  三項 publication 是明示同步替換的 defensive input，不宣稱一般使用者連續 UI 操作自然產生此時序。
- root Main 六十三項通過；新增真正 Esc 開選單、局部 title 同意、正常月初與實際摘要交棒。
  dirty 為 Main host 的明示 prop；正常 App dirty 的實際計算另由 App 旅程證實，不混稱同一 harness。
  兩項既有 save／settings fixture 原本把 Main 畫面配上 title session；改為實際 main 路由，保留 Resume 至 x2 的斷言。
  四檔九十九項通過：/tmp/tenka-system-menu-integration-final.log；此不是完整 run。
  保留既有 SystemMenu act 及 officerBusy name 插值警告，不宣稱 warning-free。
- 初次 types 抓到 root descriptor 缺少 pausesTime 與不存在的 gameId；scoped lint 抓到 act callback 回傳值。
  修正 fixture 型別及 callback block，不放寬 production 閘門或測試斷言；原失敗 log 保留。
- normal／core types 與完整 lint／format 通過：/tmp/tenka-system-menu-types-clean.log。
  完整 lint 紀錄 /tmp/tenka-system-menu-lint-docs-final.log，prose checker 零違規。
  一般 build、資料、字元、字型與 assets 檢查通過；字型字元數未變。
  一般 bundle 首載 517292、scenario 100842 bytes，字型 355384 bytes，原預算通過。
- Pages 首載 517311、scenario 100844 bytes；產物 /private/tmp/tenka-system-menu-pages.i5gT1M。
  五項 prefix 引用與五項複製 SHA256 通過：/tmp/tenka-system-menu-pages-static.log。
  靜態產物不代替 production Pages、native browser 或 GPU 驗收。
- BAL、uiStore、generic CommandAction、PlotPanel、store 與 bridge SHA256 不變。
  保護紀錄：/tmp/tenka-system-menu-protected.sha256；沒有改 00、里程碑或 frozen 基準。
  本批不再量測 performance，不重試既知 sandbox headless 阻礙，也沒有新視窗、commit、push 或部署。
  全遊戲目標保持原範圍；存讀內容端口、其他父 modal 子確認、native browser、長跑與 frozen gate 仍須逐項完成。
- 系統選單批完整 coverage 為 4636 passed／14 failed／1 skipped，435 檔、243.81 秒。
  core 行／分支／函式為 94.58％／90.96％／97.99％；同一輪 ui 856 與 app 851 項均通過。
  此 1707 是同一 run 的分組，不是跨批次相加；紀錄 /tmp/tenka-system-menu-complete-coverage.log。
  兩項歷史、一項 day450 ownership 與十一項 frozen 比對失敗不變；整體 gate 仍失敗。
  不重錄基準、不修改 BAL 或無繼承人領地規則，也不以 coverage 百分比代替全遊戲完成。

## 四台遠端主機驗證與逐步提交（2026-10-12）

- 使用者要求 sim1、sim2、sim3、sim4 平行工作，並提交現有程式與每個後續完成步驟。
  現有全國遊戲、畫面、素材與驗證工具已保存於 `9188831`；不宣稱里程碑或發版完成。
- sim1 負責完整 core／UI／App 與 coverage，sim2 負責無視窗原生瀏覽器，
  sim3 負責三檔全國長跑，sim4 負責資料、素材、建置、規格與串行效能。
  四台各用獨立副本；遠端 tar 解出的 AppleDouble `._*` 不是原始碼，測試探索前須移除。
- sim4 的 npm ci、型別、lint、資料、素材、build 與 bundle 通過；規格 audit 保留六個失敗。
  平均 tick 首次 8.7424 ms 失敗，唯一允許重試為 6.1601 ms 通過；未改 8 ms 門檻。
  另跑 reference benchmark，mean 8.5406 ms／P99 78.8304 ms，保留全部 360 個樣本。
  原始 log、audit 與樣本保存於 `docs/validation/2026-10-12/`，不把平均 gate 當作 P95 或 GPU 證據。
- sim3 seed1 的正常難度五年診斷在 day1590 因西園寺無嗣滅亡後仍持有黑瀨城與三郡失敗。
  無嗣領土規則已提出使用者選項，尚未收到選擇；不捏造宗族資料或把失敗分布當作平衡通過。

## 關鍵事實（給接手者）

- 2026-10-12：Rust WASM 路徑搜尋、原生模擬 Worker、交易取消與地圖布局快取已以十二個步驟提交，
  最終候選 `2474139`。sim1 核心、sim2 GPU headless、sim3 跨平台 Rust、sim4 應用檢查各自驗證。
  原生六項測試全部通過，正常 ×5 的最長畫面間隔由 129.9 降至 82.6 ms；仍有 67 ms 長工作，
  Worker 總結算時間較長，不宣稱穩定 60 FPS。原始證據與限制見 `docs/validation/2026-10-12/wasm-worker/`。
  全專案驗收仍未通過；後續重新驗證鍛冶場攻擊加成、地形投影下的視覺取樣與凍結基準失敗。
- 人口校準已從完整 schema 解析的 344 郡實測：人口 6,033,500／石高 17,994,000＝0.335306。
  這不支持 15 的人口約等於石高假設；人口項每石兵力為 0.008383，未含城格、政策及設施。
  原始逐郡資料與重現來源見 `docs/validation/2026-10-12/completion-audit/`；校準方向仍待使用者回覆。
  不更動 00、不更換凍結狀態雜湊或既有平衡值，不以已通過的局部測試宣稱完整遊戲完成。
- 後續修正 `8615dc1` 補上已落成、仍為同勢力出陣城的鍛冶場攻擊加成；六檔 123 項、sim3 戰術與 audit 77 項通過。
  `011c5b8` 修正地形投影與選中道路高亮干擾下的視覺測試；新版本十項原生 GPU headless 流程均通過。
  `49c697b` 對十一個較新 M6 重放案例先證明原始 finalHash 完全一致，再只更新新增常數造成的 BAL 版本標記；
  指令、finalDay、finalHash 均不變。重放五十四項通過，兩個舊來源未解案例保持失敗，並非重錄狀態基準。
  精簡城名牌的必讀兵數另有 source RED；恢復原字體及完整核准封套後，145 項元件／渲染與三項原生驗收通過。
  細節與原始紀錄見 `docs/validation/2026-10-12/completion-audit/`；完整專案目標仍開啟。

- 平行三組規格 audit 後補登六十六個既有公式常數：經濟二十八、外交二十四、AI 十三、資料一。
  主表實際列數由五百四十六增至六百一十二，修正過期標題與子表計數；沒有改動 BAL 值或核心公式。
  `/tmp/tenka-balance-alignment-after.json` 記錄五百八十項精確值比較、零值差異，未解問題由一百零三減至三十六。
  仍有十四個未登錄 key、三十二個缺席名稱（十一個明示排除）及 soldiersPerKoku 近似值；M9-1 保持失敗。
  新增安全分數解碼與負向測試；不使用 eval、容差或名稱模式掩蓋值問題。

- 本次 `/tmp/tenka-balance-alignment-tests.log` 三十八項通過；一般與 core 型別、完整 lint／format 均通過。
  新增段落與既有兩組 prose checker 零違規；BAL SHA256 不變，00 文件與 staged 檔案未改。
- 較早登錄的公式疑慮按 current source 再核對：AI 集結已有兵力或戰力足夠的條件，解圍已有原始兵數判定。
  城容量的取整順序、本支城基礎範圍、治安敵軍實際停駐與正向合計已修正；證據見本輪與前輪段落。
  施設別名與非模擬設定也已依既有裁決歸位，不將較舊 pending 筆記當作仍未實作的證據。
  幕府工作也已使用 BAL.shogunateFavorMax，不再共用朝廷上限；此為 current source 確認，不是本輪新改動。
  最新主表 audit 仍有十一問題；legacy AI key 與 feature flag 已退役，低金錢出陣已補實作；其餘缺席名稱不盲目補登或新增排除。
  原本全遊戲驗收條件不變，不以常數名稱對齊代替長跑與實際玩法證據。

- 規格衝突優先序：`00 > 02 > 15 > 系統文件(03~10,16) > UI 文件(11~13)`；**絕不修改 `plan/00-foundations.md`**；矛盾＝決定→實作→回寫該檔 §8（不留 TBD）。
- 報告渲染契約：core 只 emit `02 §4.19` 事件（68 種），UI 層 `renderReport(report, state, playerClanId)` 導出字串（13 §3.7 enrichment）。
- commit 格式：`<type>(<scope>): <繁中> [Mx-n]`（18 §3.13）；checkpoint 程序 18 §3.14。
- 新增 UI 字串／資料 name 後必須跑 `npm run font:subset` 再 commit（字型涵蓋率會紅燈）。
- 資料檔繁體正字（滝→瀧等；掃描器會擋）；專有名詞在 JSON `name` 欄不進 i18n。
- 驗證全套：`npm run typecheck && npm run lint && npm test && npm run validate:data && npm run build && npm run e2e`。
- 持久記憶 `tenka-fubu-project.md` 已同步至實作階段。**每個階段結束或被中斷時，更新本文件。**

## 最新 Worker／素材驗證交接（2026-10-12）

- sim1、sim2、sim3 與 sim4 的工作均分步提交；正式圖片載入修正為 `2cfb2d6`，最新原生證據為 `02c1faf`。
  Pixi 圖片 Worker 的 Blob 傳送在延長重載中失敗，改由主頁非同步 ImageBitmap 解碼；模擬 Worker 保留。
  真實 Pixi parser 三項回歸與故意恢復 Worker 的失敗控制均保存。
- sim4 一百三十次掛載完成，資源／字型快取／context loss 斷言通過；sim2 無逐輪人工 GC 的獨立控制亦通過。
  主頁 heap 仍由 20,890,576 增至 25,438,644 bytes，不能宣稱記憶體已穩定。
- 最終六項原生 Worker 及四項原視覺控制通過。暖機一百二十日批次最長畫面間隔 982.6→101.1 ms，
  總結算時間 926.3→2,469.5 ms；正常 x5 最長間隔 106.8→61.6 ms，完整狀態／日誌精確一致。
  規格原二十支移動部隊、1080p、三十秒渲染門檻通過，P95 畫面間隔 16.8 ms；不代表實際戰役穩定 60 FPS。
  四十支真實部隊測試是額外診斷，月度具申暫停使其窗口失效，不將該數值當成 FPS 通過證據。
- 最新完整測試 6,274 通過／1 失敗／1 跳過，型別、完整 lint、build 與 bundle 通過；
  唯一失敗仍是 s1560 第 450 日無繼承人領地的 INV-02／INV-22。不擅定接收勢力或戰術外部收尾獎賞。
  外交七項驗收、自然具申生命周期及實際官位授予另有獨立證據。完整索引見
  `docs/validation/2026-10-12/completion-audit/README.md`；全專案目標及未完成 gate 保持開啟。

## 最新效能修正與固定來源回歸（2026-10-12）

- 所有完成步驟分別提交；GPU manager listener 清理為 `fe37e4c`，texture batch BindGroup cache 清理為 `e25381b`。
  原生一百三十次掛載確認指定舊 callback 累積消失、指定 group shape 維持 24；最新 heap 仍增加 3,769,532 bytes，整體穩定 gate 未清除。
- 軍隊名牌局部範圍為 `8cdd7db`，道路距離暫存配置減量為 `dec6b8a`。
  原版 reference／邊界及九份完整原生觀測精確一致；一百二十部隊近景 16.34→18.49→23.99 FPS，P95 78.1→70.3→50.4 ms。
  全景 59.87、操作景 42.81，所有嚴格 60 FPS 控制仍失敗；是暫停策略日結的 renderer 診斷，未證明連續戰役。
- 自然具申原生採納／拒絕旅程已通過。`6430a8b`／`fa43b73` 武田同盟及合法援軍請求旅程通過：
  CPU-earned 第零至三百日加公開匯入後的原生三十二日；AI 實際拒絕援軍，不能宣稱派兵成功。今川離間／成為家臣仍待驗收。
- `1575bc8` 修正 dialog landmark；素材 budget 與三個 LOD drawable layer 通過。
  最新三張 Linux protected screenshot 仍有大幅像素差異，六張基準未改，藝術 gate 保留。
- 最新固定來源全量 6,293 通過／1 失敗／1 跳過（121.28 秒），1,471 個 tracked inputs 前後 SHA 一致。
  唯一失敗仍為 day450 無繼承人領地 INV-02／INV-22；早期逾時與混合 fixture 的失敗仍完整保存。
  最新 native tail 有獨立型別／lint／功能證據；不把它冒稱為前輪全量來源。
- 完整索引見 `docs/validation/2026-10-12/completion-audit/README.md`。
  全專案目標保持 active，未修改 00、BAL、無嗣領地規則、protected baseline 或里程碑；未 push／部署。
  下一輪依 close CPU profile 處理 geographic edge-axis、castle ribbon／army signal 熱點，保留精確輸出。

- 下一步 `a381b7d` 已提交固定障礙物 edge-axis 索引；超大有效矩形仍走原 full scan。
  原版 reference、160 隨機 scene／快取轉換、epsilon 邊界及 1e308 cancellation 精確比對通過；33 項關聯測試及 scoped lint／格式通過；初輪型別通過，後輪被平行開發中的 untracked earnedImagawa fixture 型別錯誤阻擋，原失敗保留。
  sim3 原生完整發布比對與相同一百二十部隊 FPS 控制仍在進行，尚未宣稱本步效能收益。

- 平行 fixture 已於 `043b561` 固定提交；其後重新完整 `npm run typecheck` 通過，先前原始型別失敗不改寫。

- 地理索引單次原生 57.59／42.91／24.14 FPS 均失敗，edge-axis self -26.5% 但整體 geo inclusive 僅約 -1%。
  `8f8319b` 撤回該索引與實驗 reference/spec，保留完整提交與原始證據；目前 runtime 延續道路距離減量版本。
- `043b561`／`e207b4d` 自然今川引拔 CPU240＋native60 旅程通過，真正表單付 1,000 貫、逐日 persistent state exact、正式仕官與家臣介面可見。
  未修改忠誠、RNG、日期、BAL 或門檻，其他目標與 gate 仍開啟。

- 城名牌 zero-objective 候選 `6795ed7` 經九份原生 exact 比對通過，但三視圖 59.90／44.20／23.86 FPS 均失敗、close 未改善。
  `e72bde9` 撤回該候選，保留全部來源與原輪 raw，未以少量 CPU profile 差異宣稱總收益。
- 最後現行固定 `e72bde9` 全量 6,294 通過／1 失敗／1 跳過（127.49 秒）；1,469 tracked inputs 前後與main來源一致。
  型別、完整 lint、build、bundle 通過；唯一已知無嗣領地失敗保留，protected baselines、全國120 FPS、整體heap及長跑gate仍未清除。
  實驗版6795原輪6,300通過證據另存，不冒稱為移除六個實驗測試後的現行全量。
- 下一輪先以Rust/WASM純數值邊界處理geo cache-miss評分或castle純規劃，JS保留signature／UTF16排序／UI measurement／visibility。
  render需獨立main-thread WASM instance，保留f64順序／NaN／signed zero／work budget，先驗證ABI打包和整體收益；目前僅唯讀可行性研究，未新增source。

## 實際地理 Rust／WASM 整合交接（2026-10-12）

- `7288d16`／`e8693f4`／`fb9fd7f` 已加入並正式接上 Rust 地理評分，不再只是唯讀可行性研究。
  主頁獨立 WASM 與模擬 Worker 分離；Rust 九項及 19 檔 262 項精確比對／生命週期測試通過。
  35 個直接 unit constructor 已接實際編譯核心；首次全量找出二十個間接 App／主畫面接點，
  `9e49cc9` 補齊後 175 項通過，第二版 AST checker 20→0；原有斷言不變。
- 固定 `9e49cc9` 全量 6,320 通過／1 失敗／1 跳過，683 檔、126.96 秒，1,477 tracked inputs 前後 Git blob／SHA 一致。
  型別、完整 lint、正式 build、bundle budget 通過；全部檢查後 1,477 inputs 仍不變。
  唯一失敗仍為 day450 無嗣領地。首次 `fb9fd7f` 6,287／34／1 及 17 未處理錯誤保留，不能當作全綠。
- sim3 九份完整發布 exact；三個 120 部隊窗口 59.96／43.17／24.47 FPS 均失敗，地理 inclusive 14.70→14.59 ms／render。
  地理 Rust 邊界保留作為架構擴充，不宣稱明確整體收益或達到 60 FPS。
- sim1 fresh npm ci／23 Pixi patch、2,814 檔全源驗證及 Mac／Linux 重建 byte-identical；27147-byte WASM SHA 2f4bde5f…263df。
  原六項 Worker 五通過／一 readiness 失敗，state／log exact 仍通過；暫停重建的新 generation 尚未載入 WASM，原 trace 已保存。
- 全部已完成 source／evidence 均分步提交，未 push／部署；全專案 goal 保持 active，未改 00、BAL、protected 基準或門檻。
  下一步：在暫存隔離範圍評估完整城名牌 Rust planner（inclusive 約 8.8 ms／render），以及 epoch-owned 真實 Worker startup ready 握手。
  此階段尚未接入城名牌新核心或改動 ready 契約；不能將後續草稿當作已通過的正式實作。

## 完整城名牌 Rust／Worker ready 整合交接（2026-10-12）

- `ce827fe`／`671602a`／`04c7b60` 已將完整城名牌純布局正式接上 Rust／WASM，保留原 sorted order／f64／work budget／admission。
  Castle 與 geographic 雙 arena 共用獨立主頁實例；實際 memory growth／雙 owner／dispose 測試通過，缺 ABI 在 Pixi Application 前失敗。
- Rust 十一項、337 組完整原版 oracle、320 seeded 真實 WASM 比對、13 protocol/parity、33 檔 386 renderer/UI 及三項 shared-memory ownership 通過。
  審核另用原版 JS 獨立確認混合 signed-zero 控制，`2bdb1f3` 只修來源註記／manifest；63,073-byte WASM 與 04 byte-identical，SHA 4baa718c…2eba。
- `c613747`／`71d1eaf` 真正 Worker startup ready／current epoch join 已正式提交；65 相關通過，舊 bridge 反向控制七失敗／九通過／零 unhandled。
  sim1 fresh04 全 3,068 檔源驗證與23 patch下，原六項 native Worker 一次全通過；原 state／RNG／log／cancel／reload 斷言不變。
- 固定 `04c7b60` 全量 6,357 通過／1 已知無嗣領地失敗／1 跳過，686 檔、133.48 秒，1,485 tracked inputs 前後與所有 checks 後一致。
  型別、完整 lint、正式 build、bundle 通過。後續 Rust test comment 與 manifest 更正不是新一輪全量，原 source pins 分開保存。
- sim3 當前23 patch 的同一完整14,765檔依賴群公平對照：操作景42.93288→49.73817、近景24.61326→29.11552 FPS（單次+15.85%／18.29%），
  全景59.83336→59.93091。三組 strict60 都失敗；9完整發布 exact，canonical/resource前後相同，combined runtime也含ready變更，不作solekernel因果或穩定性聲稱。
  唯一profile有290完成renders／289interval，Rustcastle約3.22ms/render、geo inclusive14.36ms仍重；current23沒有baseline CPUprofile，舊dep不硬比較。
- 本輪120日Worker wall17.038s vs sync0.957s，最長main long task207 vs956ms；batch吞吐仍較慢。
  只讀原rows主頁long tasks合計約93%wall、epoch3／連續tickIDs排除逐日重啟；原observer缺computeMs不能補造。
  獨立 default-headless profile 的 actualcompute 合計649.2ms、idle為0ms（解析度內），主要main `(program)`尚未歸因。
  原歷史GL identity未採集；同setup新頁確認SwiftShader。硬體RTX身分受控首次對照另行診斷，不把profiler數字混入普通timing。
- 完整索引 `docs/validation/2026-10-12/completion-audit/README.md`；source／evidence每步提交，未push／部署、未改00／BAL／門檻／protected基準。
  Goal仍active；下一步先完成Worker batch阻塞歸因，再處理主要geo preparation／實際主頁熱點，原60FPS／heap／長跑／領地gate保持。

## Worker batch 診斷封存（2026-10-12）

- `0c4ec74` sim1 唯一 default profile：完整 day121 parity 通過，compute649.2ms／step13.296s；最大 program 區段未歸因。硬體預檢 llvmpipe／WebGL null 失敗，hardware captures0；Linux／Mac binary 與固定 manifest byte-identical。
- `b7194ff` sim3 前後實際 RTX5070TiVulkan；120日 step已返回3061.800ms／idle0.100ms、compute680.900001ms。但完整交通擷取撞原60s timeout，最後reference assertions未執行，case保留RED、未retry。Observer完整reply clone與profiler有成本，不作sim1因果對照或一般效能宣稱。
- 兩包原bytes／雙SHA／來源與依賴固定證明已封存並加入索引；大型原trace及完整交通raw僅遠端保存，完整path／bytes／SHA明示。
- 本階段 production source不變，原六項功能PASS／三組strict60RED／6357通過1已知失敗1skip保持。下一步輕量metadata observer定位硬體main成本，及geo preparation熱點；goal保持active，未push／部署。

## 輕量硬體 Worker 診斷與架構文件（2026-10-12）

- `acd728d` 回寫 README／01 D22：主頁 geo／castle WASM 雙 arena、獨立 worker memory、current-epoch ready 與 deadline；00 與遊戲規則不變。
- `45a5544` sim3 ONE lightweight native warm1+120：完整 warm/final state／RNG／log reference exact assertions 在 export 前通過，原60s／0retry；前後 actual RTX5070TiVulkan、1404source／14765deps／23patch不變。
- 帶profile step2525.4ms、compute合計649.700002ms、main reconcile self350.997ms。Transport intervals重疊，native event.data反序列化不全算observer；不與不同host/GPU/profile/collector的先前值作單因果比較。原完整clone RED未改。
- Root另執行package stdlib verifier通過，54 rawgzip雙SHA及完整state/log證明加入索引。Geo fusedXY scan候選正做逐值／快取行為測試，尚未以候選宣稱實測收益；goal仍active。

## 地理 fused-axis 候選固定回歸（2026-10-12）

- `5224c06` 合併XY候選軸掃描，保留逐軸四運算、finite/±48guard、Set順序與cap16；未改signature／Rust ABI／排序政策。
- `a37ce1b` 保留原parseRED、最後26focusedPASS及固定5224全量：6362PASS／1既有noheirFAIL／1skip，687檔、131.34s。1486trackedinputs前後及所有checks後Gitblobbyteequal；types／fullLint／build4.19s／bundlePASS。共用node_modules明示，非freshdeps。
- `361bf08` 只讀statepayload/tree/source審查；JSON不當wirebytes，state/result.state共享graph不當doublecopy，未採無證據快取或省略transport。Root另核兩包verifier通過，artifactindex由819→866。
- Native九完整發布exact；三單次FPS＋獨立profile於sim3串行進行，未以候選宣稱效能收益。Runtime候選固定5224，後續提交僅docs/evidence；goal仍active。

## 撤回 fused-axis 與現行固定驗證（2026-10-12）

- `1b2b995` 封存5224 native：9完整發布exact；三單次FPS59.93826／50.20458／29.20631，vs04僅+.012%／+.938%／+.312%，strict60全RED；actualRTX guard與1405source／14765deps／23patch不變。原setupRED保留、無retry。
- 唯一profile288completed／287interval，geo JSparent14.37164vs14.36233ms/frame，axes3.87181vs3.84558；沒有明確整體收益。`3d6a953` 撤回source、保留5完整prep測試並改一般名稱，geo原碼SHAfbf127與04byteequal。
- `c194b01` 現行固定3d6全量6362PASS／1既有noheirFAIL／1skip，687檔、128.23s；1486inputs三checkpoint Gitblobbyteequal。Types/fullLint/build4.20s/bundlePASS。8emittedJS/CSS與63073WASM本機逐byteequal04；maps/otherpublic/manifest/deps不在此claim，非新nativeFPS。
- Root另核native／restored兩包verifier與所有975 artifact rows；gzip均核對壓縮／原始雙SHA。Candidate5224原full/evidence未改，現行3d6證據分開；source/evidence每步commit，未push/deploy、未改00/BAL/protected門檻。
- 下一步Rust numeric preparation設計：P/H一次pack、near indices與原rect metadata、JS原signature/cache保留，preparedscore避免再pack；容量路徑須明示且不得縮合法輸入域，ABI/init/error仍failclosed。尚未prototype／量測，goal保持active。

- `b62fe9c` 保存 [Rust preparation DRAFT](docs/design/geographic-preparation-wasm.md)：尚未實作／量測，傳輸預算與token規則未定；一般bulk與明示CAPACITY都要求實際feature ABI，維持合法輸入域、原JSON簽章與metadata。此文件記錄設計狀態，不新增使用者批准流程；既有Rust/WASM改動授權繼續有效。

## 地理數值準備 Rust／WASM 正式整合（2026-10-12）

- `0172724`／`9ed1470` 實作獨立 preparation ABI 1；`f6700ce` 包裝 frame／prep／road arena，`feab20c` 正式接入 renderer。既有 path／geo／castle ABI 與 JS 排序、metadata、原 JSON signature 不變。
- 原版 JS oracle 保存完整 255,263,393-byte raw（gzip14,937,709bytes），1,964frames／5,482steps；新 Rust 不參與產生預期值。原 producer 最後 manifest-copy ENOENT 仍是 RED；後處理只核對已完成 raw，沒有重跑或改寫。
- 正式 frame／prep 常駐預算為131,072words／1MiB，實際九場景最大35,008bytes。實際8192遠障礙走新核心，32768走明確CAPACITY的舊JS準備＋真Rustscore；兩者合法、快取與結果一致，預算不涵蓋整個heap。
- Rust23項、adapter320seed與一般／CAPACITY各160seed完整整合通過；33原renderer/UI fixture共386通過。固定feab20c全量6392PASS／1既有無嗣領地FAIL／1skip，691files、129.87s。1494trackedinputs在全部測試與checks後符合Gitblob且byteequal；types／fullLint／build／bundlePASS，node_modules共用symlink非fresh依賴。
- 新WASM88475bytes／SHA25664241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b。sim2唯讀所有權／快取／memorygrow審查無新增實質缺陷。來源與原RED／PASS見geographic-preparation-local；`321c402` 的獨立 Linux 原 recipe 重建 WASM／manifest 均與 Mac byte-identical，733 來源列符合固定 Git blobs。
- sim3同current23／14765dependencies、actualRTXVulkan的九完整原生payload仍exactaf4。單次30秒三視角59.95983／49.88502／32.03923FPS，相對04同cohort+0.048%／+0.295%／+10.04%；closeP9537.2ms（原41.5）。三項strict60仍RED，不宣稱穩定收益；`44c3b30` 唯一 close profile 為323renders／322intervals，geo parent11.6128ms/render（原14.3623，約-19.1%），prepare inclusive3.599、scorePrepared inclusive7.282、signature self0.589，皆在parent內不重複加總。ActualRTX前後、source1413／deps14765／23patch三個checkpoints通過。
- 模擬仍由獨立Worker序列執行JSadvanceDay，Rust加速path；主頁另有geo／castle／prepRust核心。不是整套Rust遊戲引擎。全專案goalactive，60FPS／wholeheap／protectedart／長跑／領地gate保持，未push／部署。

- 本階段原native／Linux包完整封存，root獨立verifier與Gitproof通過，parent索引新增而不改舊rows。下一步候選為Rust評分的原式矩形邊界重用，尚未實作或量測，不做NaN／溢位的提前零值捷徑。

## 評分 overlap 熱點與 endpoint 候選（2026-10-12）

- `8aea548` 以既有 feab profile／actualWASM反組譯分析：推定overlap的function44 own1,249,004us／1188samples，占score WASM own53.49%。Module無name／DWARF，名稱是指令與source模式推定；不能把hard單loop視作已證主因。無新GPU工作。
- `d2ce3c4` 獨立 strictSIMD overlap算術probe，884byte實際WASM與原JS／scalar871200cases一致，含248374NaN；nonNaN按bits。只證helper算術，不證gameintegration／browsercompatibility／FPS。Pinnedstable f64minimum API E0658原RED保存，正式artifact沒有SIMD。
- `aa48e56` 保存完整scratchendpoint證據，baseline88475SHA642、candidate89761SHA69af不同。永久test綁actualhelper對unchangedlegacyoverlap：1169294grid＋40ULP／touch／epsilon、24Rust與1925compiled完整packet比對通過；raw10986065bytes全保存。最初workdir工具拒絕／contact typeambiguity／clippyRED皆保留。
- `c2302c4` 正式有界候選僅改兩Rust來源與WASM／manifest；保留+padding含+0、原sum／ties／guards，不改sharedlegacygeo／caps／prep／JS／Worker。Root原recipebuild89761SHA69af、24Rust／Clippy／fmt與11files80actualWASM tests通過。這不是新全套測試，最近完整回歸仍固定feab6392／1known／1skip。
- `ad6fc41` sim3固定c230原nineaf4／source1524／deps14765+23proof通過；overview59.93850／operational50.04925／close31.74741，相對feab-0.0356%／+0.329%／-0.911%，全部strict60RED。唯一profile320renders，geo11.764675ms（+1.308%）、WASMscore7.346244ms（+1.618%），推定新overlaphelper normalizedown未下降；setup提前scpRED保留。`45a5384` 撤回四個檔案，沒有量測重試／baseline重跑。
- Root撤回後1494trackedruntime/test/config輸入與feabFULLbeforeinventory逐byte一致，publicWASM／manifest亦與feabGitblobs相同；wasm:check通過。不是新FULL／FPS重跑，最新完整6392／1known／1skip仍固定feab。
- Goal仍active，原60FPS／wholeheap／art／longrun／inheritancegate未完成；未push／deploy。平行SIMD核心prototype僅隔離scratch，未翻轉productiondefault。

## Strict SIMD 核心隔離驗證（2026-10-12）

- `fbeb80a` SIMD prepared-only完整核心prototype從acceptedc5／feab建立，未疊加失敗endpoint。實際prototype88469bytes SHA4ba2591c5205e363f92ee896c6f40c441fb2a7d613e587a2fe6aa2aee0408d0a；baseline88475SHA642，2121compiledcases（1920legal／5synthetic／196validextremes）及24malformedatomiccontrols通過。完整raw11412888bytes保存，native23只測scalarreference，不能當SIMD證明。
- Actual反組譯只有strictf64x2 min/max/add/sub/extract，无relaxed／pmin／pmax／FMA；sharedlegacygeo／prepintersections／caps未改。sim2actualsource／unsafe-target-feature審查未見數值或ABI缺陷；目前prototype對所有wasm32啟SIMD，正式接入前必須featuregate生成真正scalarvariant。
- `aa18b75` 本機完整Chromium149 headlesstinyprobe validate true、100352grid＋5explicitcontrols一致；第一default-headlessGREEN與後續fullbinaryGREEN分開保存。只有4gridrows＋5controls原結果，未保留全100352逐案例stream，未宣稱已保存。FF／WebKit未安裝，無Safari／GPU／FPS／fullgame結論。
- Root三包verifier獨立通過；下一步實作初始化前明確scalar／SIMDcapability選擇與雙recipe／artifact契約，選定後fetch／instantiate／ABI錯誤保持fatal，保留owner／Workerepochready／dispose。Production仍是撤回後acceptedscalar88475SHA642，未翻轉SIMD預設、未量測game收益。

- 後續唯讀source檢查：實際MapRenderer普通／hard傳rect而非外層id/kind，主要constructors與MainScreenHUD皆是四數值fields，caps／normal也是數值literal；genericHUD API仍能spreadextras。token／revision不在signature，物件重新配置本身不造成JSONmiss；cache移出admission後刪除也可能造成miss。沒有逐次input-equalitytrace，不能把41735／121歸因metadatachurn或宣稱numericmemo可受益，暫不採用此捷徑。

## 雙 WASM 產物與執行期選擇（2026-10-12）

- `c05c167` 提交 Rust scalar／SIMD 雙產物與獨立數值 ABI；scalar 88,536 bytes、SHA `57b04ba8b63eb8af3a7a25742e676e0c2bd53eaeece7df40c85c5bd0862b189e`，SIMD 88,392 bytes、SHA `0edab970302a9439995d634f2dd0c2b018651473a227b3ff9efc309b1974b38a`。Scalar 實際反組譯零 SIMD；SIMD 浮點向量運算限 overlap helper，另兩函式只有 bit-preserving 向量複製。
- 最終產物 2121 組完整數值比對、24 組 malformed atomicity、兩版 memory growth／free／重配置、41 focused tests、Rust default／feature 各 23 tests、clippy／fmt／types／lint／artifact 檢查通過。
- `c116452` 保存 Firefox／WebKit 對舊 scalar642／prototype4ba 的完整 2121＋24 證據；此項不冒充新產物的瀏覽器或效能驗證。
- 載入接線的 10 檔 123 tests、完整 typecheck、scoped lint、production build、bundle gate 通過。最初 lint／fake type 缺欄位與 ENOSPC 作業失敗保留；磁碟恢復後重跑受影響檢查。Root 僅清理已完成隔離副本的生成 dist，沒有清除 source、public 或 raw evidence。
- `f898ac9` 提交主頁／Worker 初始化前的能力選擇與 variant 核對；固定 `f898ac94fe98c317edb7c2cafdf1831fa4528059` 進行原生量測。上一個 accepted close 結果仍為 32.0392 FPS，不能據數值驗證宣稱新效能收益。未 push／deploy。

## 自動 SIMD 啟用撤回決定（2026-10-12）

- 固定 `f898ac9` 在原 current23 RTX5070Ti Vulkan 環境完成 original9，完整 payload SHA `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29` 一致。實際請求 SIMD URL，四筆成功 response body 及獨立 served bytes 都是新 `0edab`／88392-byte 產物；另一次 CDP body 收集錯誤保留，沒有冒充其 response bytes。
- 原三個 30 秒視角各測一次：overview 59.8634833、operational 49.9102681、close 30.8998201 FPS。相對 feab 同 cohort 分別 −0.16068%、＋0.05061%、−3.55630%；close p95 38.7 ms。三個 strict60 原 RED 保留，沒有重跑基準或 FPS。
- 原六個 Worker E2E 全通過、42.7 秒，包含 60／120 日 cold／warm 完整狀態、log 與 readiness 控制。來源 1528／依賴 14765／23 patch 的前後與最終校驗通過。
- 第一個新增 body collector 的 CDP 錯誤發生於 FPS／六 Worker 作業前；保留第一 RED，僅修正外部收集器後完成 original9。未修改固定遊戲程式或原斷言。
- `2dfc0ab` 撤回正式自動 SIMD 預設，保留雙產物、數值 ABI 驗證、明確 SIMD 模式及 Rust／背景 Worker 架構。最終 126 tests／10 files、types、lint、format、production build／bundle 通過。撤回後沒有重新量測，因此不宣稱新的 scalar FPS。無額外 CPUprofile、未 push／deploy。
