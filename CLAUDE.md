# 天下布武（tenka-fubu）— 給 coding session 的專案說明

瀏覽器單機戰國大戰略遊戲（向《信長之野望·新生》致敬的非商業同人作品）。
純前端 SPA：TypeScript strict＋React 18＋Vite＋Zustand＋PixiJS 8，搭配 Rust WASM 路徑核心與 Web Worker 模擬，部署 GitHub Pages。

## 架構鐵律（違反即 CI 紅燈，不得繞過）

1. `src/core/` 是純狀態機，禁止 import React／Pixi／DOM API；
   Rust 路徑核心位於 `rust/engine/`，經明確 WASM 介面供 core 使用，Worker 的載入與生命週期由 app 層持有。
   禁止 `Math.random`／`Date.now`（一律用 `src/core/rng.ts` 的五流 mulberry32）；每日十三步結算順序不變。
2. 一切狀態變更走 Command 管道：UI 只 dispatch Command 與訂閱 selector；
   同（劇本、種子、Command 紀錄）必須重放出 bit-exact 相同狀態（golden test 把關）。
3. 全部平衡數值命名 `BAL.camelCaseName`，唯一定義於 `src/core/balance.ts`；
   測試期望值由 BAL 推導，不寫魔法數字。
4. 全部 UI 文字經 `t(key)` 取自 `src/i18n/zh-TW.ts`，繁體中文（台灣慣用語）；
   全案禁止簡體字與日文新字體（`npm run validate:data` 內建掃描）。
5. 每日 tick 的 13 步系統順序固定（00 §5.4），不得增刪重排。

## 常用指令

| 指令                                                 | 用途                                                  |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                        | 開發伺服器（`?debug=1&seed=42` 開除錯面板與固定種子） |
| `npm run typecheck`                                  | `tsc --noEmit` ＋ core 純度檢查（tsconfig.core.json） |
| `npm run lint` / `npm run format`                    | ESLint＋Prettier                                      |
| `npm test` / `npm run test:core` / `npm run test:ui` | Vitest 全部／core／ui                                 |
| `npm run validate:data`                              | 劇本資料 zod 驗證＋簡體字掃描＋字型涵蓋率             |
| `npm run golden:update`                              | 重寫 golden 快照（僅限刻意的數值變更，PR 須說明）     |
| `npm run wasm:build`                                 | 使用鎖定 Rust 工具鏈重建 WASM 核心與來源 manifest     |
| `npm run wasm:check`                                 | 驗證來源、WASM 產物與 ABI；dev／build 前自動執行      |
| `npm run e2e`                                        | build＋Playwright smoke（chromium）                   |
| `npm run bench` / `npm run simulate`                 | 效能取樣／無頭全 AI 平衡模擬（M7 起）                 |

## plan/ 目錄用法與優先序

- 開工前先讀 `plan/00-foundations.md`（最高準則），再依 `plan/18-roadmap.md`
  找到當前里程碑（見 `milestone.json` 的 `current`），讀該里程碑「開工前必讀」清單。
- 規格衝突優先序：`00` > `02` > `15` > 系統文件（03–10、16）> UI 文件（11–13）；
  里程碑歸屬以 `18` 為準；術語以 `00 §14`／`19-glossary` 為準。
- 發現規格矛盾：依優先序決定、完成實作，回寫對應 plan 文件 §8「設計決策記錄」。
  **絕對不要修改 `plan/00-foundations.md`。** 不得留下 TBD。
- 每完成一個任務：commit 訊息帶任務 ID（如 `[M3-8]`，格式見 `plan/18-roadmap.md` §3.13）；
  每完成一個里程碑：執行 `plan/18-roadmap.md` §3.14 checkpoint 程序。
- 使用者要求的 Rust WASM／Worker 架構裁決見 `plan/01-architecture.md` §8 D22。
  正式流程不在 WASM 或 Worker 載入失敗時悄悄改用同步後端；TypeScript 路徑實作保留作一致性參考。

## 目前進度

- 當前里程碑：見 `milestone.json`；歷史進度：見 README 進度表。

- 固定 `27d9028` 的本批只增加隔離診斷與證據，沒有採用 production／E2E 修改。Ending 區域 earned route 的等量觀測 JS／WASM 單次對照為 1,620／1,604ms，完整 process 為 5.29／5.40 秒；compile／install 留在原五秒 callback 內。WASM 確實執行 4,202 queries／16 topology builds，最終完整 state、RNG、373 日 emitted history、84 筆玩家指令與 fresh save 相同；不是每日完整 state 或所有 AI 指令證明。16ms 單次差距不足以採用，原 setup RED 保留。
- 同來源加 guarded observer 的十八項／十檔原生 cohort，實際使用十六 workers，16 PASS／2 FAIL，總 31.65 秒。兩個軍勢札案例仍撞原五秒 boot poll；browser callback 已進入並排入 frame waiter，ticker 持續而 terrain／castle pending。Dense callback 自身約 4.700 秒，與 Playwright poll 約 5.008 秒分屬不同時計，不能直接相減當作 IPC 延遲。此高負載子集不是原 full955 排程重播；pending flags 只定位近端 gate，尚未分解 fetch／decode／texture／attachment 成本。
- 下一步先量測 earned Takeda 原 callback 的 core／invariants／hash／clone／serialization／write 成本，並由 asset acquire 生命週期區分軍勢札 boot 的晚完成 owner。現有 source 顯示 300 次 full-state hash／validation 及大型輸出，但尚未量到各階段占比；不得直接採用 FNV 改寫、重啟舊 image Worker、延長 idle 或移出期限。最新完整原生仍為 955 的 440 項 RED；441 只是後續 discovery。strict60、whole-heap、long-run、全 M6–M9 與待決規則／保護圖保持，未 push／deploy。

- `1a6a681` 只修 Hojo 原生測試的月結續行輸入交接：原 trace 顯示 x2 正常恢復後，Pause locator actionability 花 823ms，導致 day30→32；不是已證明的遊戲暫停 bug。候選先量測真實 Pause，Continue 後保留無 dialog 檢查才送 native pointer，精確日期與全部原旅程斷言不變。單案 54.747 秒／總 56.0 秒 PASS，保留 123 個連續日狀態、四次月結、day91 合法輸送及 day123 實際援軍移動；PASS 無 trace，不能宣稱量到新輸入延遲或已通過 16-worker 負載。
- `8ca952c` 只讓軍勢札 boot 重試完整相符的尚未掛載例外，其他錯誤立即傳出，原五秒不變。舊 catch-all 對 one-shot unknown 控制 RED，候選整檔六項 PASS。較早 955 三個 trace 各只有一個 pending Evaluate 跨越五秒，沒有完成的 false retry；尚不能區分 IPC／瀏覽器進入／renderer frame 等待，這次不是其修復。孤立原版與 observer PASS 亦不能證明歷史原因。
- 固定合併 `8ca952c` 的型別、完整 ESLint（0 errors／2 warnings）、441 項／106 檔 discovery、兩檔格式及 1,650 Git inputs／29 dependencies 前後校驗通過。原生分別是 4dd 加各單檔 overlay，不改標為完整 8ca；未重跑 core、build 或全套。最新完整原生仍為下列 955 的 440 項 RED。
- 該批後續目標是在有修正依據的負載中量測 army boot 的 browser-entry／frame 邊界，並定位 earned generator 原期限成本；不新增 ready wait 變相延長五秒、不盲改 worker cap。全 M6–M9、strict60、whole-heap、long-run、六推薦／星級、既有規則／六張人工核准仍開放；未 push／deploy。

- `ef75be6` 只為軍勢旗標重疊加安全零 X-span 快徑；每次呼叫先確認 Y 值範圍，極端合法輸入走原算式，原驗證／順序／`++work`／1,000,000 上限不變。原始函式 oracle 與新函式實際都在 1,000,001 次觸及上限且輸出相同；signed zero／subnormal／MAX 邊界、隨機及 sparse array 均有精確比較。九個完整 published payload 加所有 signals 與原版 byte-identical，SHA `aa64ea9e…`。
- 同機單次原 30 秒近景：33.2367→34.1319 FPS、p95 36→35ms、slow 27.7778→28.5714；兩版原 strict60 都 RED，mean 之後的斷言未執行，raw readback 不能代稱已執行。另以相同 producer 各跑一次 10 秒 profile，精確 state／commands／resources 不變；328／342 renders 的 signal solver sampled cost 4.144→3.541ms/render。這是增量採用依據，不是重複性或穩定 60 證明。早期合成 crowded medians 互相矛盾；觀測後另訂固定 60 warmup／40 timed pairs 得 sparse −10.9%、crowded −9.3%、dense +7.6%，所有原 rows 與較早 dense +5.9% 保留，未證明 JIT 原因。
- 固定 `ef75be6` 合併八檔 207/207、型別、完整 ESLint、build／bundle／touched format 及來源／29 Pixi targets 前後通過。原生候選證據釘選 `9550e39` 加精確單檔 overlay，不改標為較晚完整 source；完整 core 未重跑。
- 固定修正前 `9550e39` 完整 440 項在原 300 秒／預設 16 workers 下為 257 PASS、11 FAIL、3 timeout、31 其他 skipped、5 interrupted、133 未派發。Army plate 三項只確定 shared boot 的 5 秒 poll 失敗，catch 吞掉底層例外，不能歸因未掛載；Hojo 真正 day30→32 違例保留。三個 earned generator 的原 test timeout、色覺零差異及其他逾時保持，未修改期限。兩個 corps、court-rank、十五倍率精靈及 same-seed 通過；SystemMenu 未派發，gallery pulse 不在這 440 項。完整原生仍 RED，不能套用到 ef75be6。
- 本批先保存單案啟動 census 與精確 castle WASM packets；未採用 axis index。離線 kernel 時間不代表完整 castle stage，更不推出 FPS 上限。下一步優先釐清 full-suite 的 army plate 啟動例外、Hojo 原生暫停交接與 child generator 超時；不要盲目增加 wait、worker cap 或重跑未變全套。全 M6–M9、strict60、whole-heap、long-run、六推薦／星級及既有規則／六張人工核准仍開放，未 push／deploy。

- `6cb9643` 修復 DEV React StrictMode 的 SystemMenu 開啟即關閉：原實際 gear click 入列／升為 modal 後約 3.3ms 被 effect replay cleanup 關閉，game／screen／tick 不變。正常 production 四步驟開局設定流程原本成功，不能把此 bug 說成所有遊戲皆失敗。cleanup 仍立即撤銷 callback／request，僅 exact-owner release 延至 microtask 並用 generation 擋 replay；真正 unmount 關閉、不恢復時間、不動 replacement owner。`1990036` 直接呼叫 captured 真實 onConfirm 驗證舊 callback 不可重啟；六項 regression 通過，較早 detached button click 只能證明 DOM 無作用，不是 callback 證明。
- 菜單候選兩個原生控制分開通過：DEV fixture 1/1（4.9 秒）及重建 production 的原既有設定旅程 1/1（約 5.5 秒），保留原 60／300 秒。先前一揆 fixture 的選單問題已確定並修復；此候選另經真實遊戲內 Settings 即時停用效果，警示跨週期恆亮，state／commands 不變。來源為固定 5feb 加精確 overlay，不能改標為完整較晚 HEAD；原 selector 零選取／launcher 126 與初次二案例測試原 source 未封存的限制明載。
- `04b2d92` 依 12 §3.3.4／D29 補選取城池／郡的 1200ms pulse，使用指定 cubic-bezier(.65,0,.35,1)、scale 1→1.08→1、alpha envelope .9→.6→.9。只變內部 Graphics transform／容器 alpha，groundY=4 與世界 anchor 不變；減動態／停用效果恢復原 static RGBA，選取切換／換圖／destroy 清理。原既有 Graphics native 控制因維持靜態而 RED，候選 1/1 PASS（5.5 秒），減動態取樣跨 1300ms；明示 renderer selection fixture，不冒稱實際 pointer selection或完整藝術核准。來源完整比對是較晚 post-run readback，pre-run archive／overlay hashes 分開保存，AppleDouble／overlay verifier RED 未隱藏。
- 最後固定 `04b2d92` 合併 247/247（15 檔）、型別、data／assets／build／bundle、440 production／8 gallery discovery／格式及 1,648 Git inputs／29 Pixi targets 前後一致。第一次完整 ESLint 因同期封存的五個 raw TS 證據副本位於 tsconfig 外而 RED；bytes 入 archive 後移除 plain copies，原碼與 lint 規則未改，另跑完整 ESLint PASS（0 errors／2 warnings）。沒有把首次 RED 改標，也沒有重跑全量 core／原生。
- 全套五分鐘、strict60、whole-heap、long-run、六推薦／星級及其餘 M6–M9 仍開放；威風 world-radius payload 缺口與 max0 ProgressBar 語意均未擅自改寫。無嗣／戰術終局、人口校準、934163c 六圖仍無新回答；未改規則、保護基準、deadline、milestone，未 push／deploy。

- `f31284d` 新增真正靜態全國勢力預覽：共用 canonical coast／Voronoi raster 與劇本郡所有權，地圖點選與 41 勢力鍵盤名單同步，選取描邊及名稱不只依賴顏色。織田「推薦新手」直接依 16 §3.9；六個推薦位置／星級缺 authored 資料仍未完成，11 D67 保留此缺口。十五倍率地圖原生 15/15（18.9 秒）及原有精靈 16/16（84.4 秒）通過；地圖執行 overlay 八檔與最終 Git bytes 相同，精靈執行固定 f312。不是整體 M8-17／M8-23 完成。
- `28f1e90` 補一揆警示一秒閃爍，只在半週期切換 active warning 的可見性；Graphics 按需建立，移除／換圖／destroy 清理，OS 減動態或停用效果保持恆亮。舊來源實際不閃爍 RED，候選原生 DEV fixture 2/2 通過 11.2 秒，renderer／part 143 項通過。原生 OS 切換即時驗證；使用者停用效果經真正標題設定後重新掛載驗證，即時停用由 unit 覆蓋。synthetic view 不代表 core 自然發生一揆；該批 fixture 系統選單未打開原因當時未解，後續 6cb 修復見上方。lit／hidden 圖有鏡頭位移，不能聲稱 whole-image pixel 因果或幾何不變。
- 固定 `28f1e90` 整合 focused 207 PASS／2 FAIL（209 項），兩項是舊大名 metadata fixture 未提供新真實地圖所需的連通道路／座標；production validator 未放寬。`e775a2f` 只補該測試 fixture，原斷言保留，另跑兩項、型別／touched lint／格式通過。28f 的完整 ESLint、型別、data／assets／build／bundle、440 production／7 gallery discovery 與 1,646 Git inputs／29 Pixi targets 前後證明通過；沒有改標為 e775 全套重跑。
- 全部 440 項原生五分鐘、strict60、whole-heap、long-run、其餘 M6–M9 與六推薦／星級仍開放；無嗣／戰術終局、人口校準、934163c 六圖人工核准無新回答。沒有更改基準、規則、deadline、milestone 或 push／deploy。

- `ab06242` 補齊新遊戲四步驟：劇本、大名、難易度、種子；每步可返回且保留選擇／非法文字，種子預填與 uint32 驗證依 16 §3.9，正常開局暫停。11 D66 明確回寫規格優先序。61 個既有 E2E start site／57 檔經 deterministic checker、逆向 bytes 與原版負控制遷移，最後零遺漏；不是全部原生案例已執行的宣稱。
- 固定 `ab06242` 全量 6,451 PASS／3 FAIL／1 SKIP：既有 s1560 day450 無嗣領地失敗與兩個新字型缺字測試。型別、完整 ESLint、assets／build／bundle、412 項 discovery 與 touched-format 成功；data 只缺「薦」。1,640 tracked inputs 與另列 responsive overlay 前後相同。`01c7dbc` 透過既有管線補成 1,661 字元／355,728 bytes 字型，另修復大名卡片 auto grid track 壓縮截字；32 focused、型別、資料／素材、build／bundle 及 425 discovery 成功。後者不是重跑 full suite。
- `c3eab38` 的外交三頁／軍團／大命十五倍率共 45 項，固定 ab product 原生全通過 184.924 秒；先前 da 九個端點及 observer RED 另保存。`01c7dbc` 的既有 save/load 四項、smoke P1／P2 兩項亦通過；未包含 P3–P5。新精靈最初原生 15 項在錯誤 hardcoded 55 卡數失敗，實際 authored catalog 與 runtime 都是 41；`0a8e747` 只改為型錄完整有序 ID 比對，不是遊戲勢力數改變。舊 CSS 單項負控制以實際 Range 文字超出卡片 7px 明確失敗；`0a8e747` 原生為 13 PASS／3 FAIL，失敗揭露低倍率進度與卡片標籤小於 12px；`5163242` 依原規格為同畫面四種標籤加最低 12px，14 UI、型別、資料／素材、build／bundle 與 touched checks 通過，`5163242` 原生 14 PASS／2 FAIL 的剩餘兩項是錯量劇本按鈕容器字級，四個實際文字子節點均有獨立字級；後續一次 actual DOM audit 另確認 body 繼承字級確為 11.2px，不是先前誤稱 12.8px。`b6aca26` 對三個精靈 screen 加最低 12px、保留正常 14px，並量測實際子文字、返回與其他操作；14 UI 及相關 checks 成功，最終固定 `b6aca26` 的十五倍率加同輸入存檔 state 相等共十六項原生全通過；不是 425 項完整原生成功。
- 上述四步驟批次當時尚缺靜態勢力地圖；後續實作見上方 f312，六推薦／星級仍未完成，不能勾選全部 M8-17／M8-23。該批 425 項完整原生五分鐘、strict60、whole-heap、long-run、其他 M6–M9 gate，以及無嗣／戰術終局、人口校準、934163c 六圖人工核准均保持開放。沒有改規則、references、deadline 或 milestone，未 push／deploy。

- 固定 `f03f318` 的色覺觀測仍 RED：原樣式三張 overview／achromatopsia 圖還原差 508 像素，集中左上 HUD／rail 邊緣。六次觀測均無 live animation，樣式／幾何／焦點／state／commands 不變；兩個相符尺寸的 layer paintCount 在切換及還原各增加。只支持此 run 的 compositor 假說，不證明 Chromium 原因，CDP 觀測本身也可能擾動排程。原精確零差異不變，不再重複 priming／重畫／等待探測；人工色覺／灰階辨識與 protected 六圖核准仍是不同門檻。
- 前一批 event 倍率成本實驗沒有採用修改：精確原版與加觀測的原版均在 1560/3/30 月結關閉後的 x5 按鈕 500ms actionability 等待失敗。AX 無 dialog、按鈕可見啟用；各八張相鄰 screencast bytes 相同，不能歸因畫面移動，也不能從 compositor cadence 推論 DOM RAF 或 GPU 原因。兩次使用 Linux 預設 headless shell，不能冒稱既有 Vulkan 原生路徑。virtual-RAF v2 僅未執行提案，其 poll 內日期斷言可被重試吞掉，未驗證／未採用；原 45 秒 poll、60 秒 case、300 秒全套及 364 項範圍均不改，沒有再跑全套。
- 舊 national traces 已核對 17,006 entries／1,644,571,085 bytes 後搬至 sim2 的 exclusive retained 目錄；remote 全量 hash／mode、local 再核對及無開啟 handle 後才刪除本機副本，屬有證明的保留副本搬移，與前批兩個未找回 scratch 檔不同。詳見 `national-traces-relocation-f03f318`。該批只新增診斷與交接，production／E2E source 未改，未重跑 core；原生全套、strict60、whole-heap、long-run、M6–M9 及待決規則／六圖仍開放。

- `1791c9a` 完成 Hojo 正向援軍的合法原生路徑：day90 原月結暫停時，透過城池面板將躑躅崎館 1,500 兵輸往自有深志城；正常指令結算及 day120 cache 刷新後，實際威脅 1.87425968684、援軍分數 0.50658314092。四個付費月份、day121 同意與五個 AI 出陣指令、day122 新援軍及 day123 普通移動皆由原斷言通過，原 60 秒內 54.705 秒成功。day119 暫停超日及舊 label locator 兩個 RED 保留。最後格式與原生 bytes 的語意 AST 相同；固定提交的型別、完整 ESLint、364 項 discovery／格式及 1,633 Git 輸入前後證明通過。未重跑完整原生，未改規則、cache、期限或門檻。
- 色覺三個新控制沒有支持修正：CDP priming 還原差異 293 像素；強制 HUD／rail 重畫使無 CDP 對照也差 385；固定五張前／後序列的 25 個交叉比較全非零。原樣式 baseline 五張尚未穩定，不能斷言永遠無共同穩態；原測試與隔離 e4 來源已完整恢復。該批後續的 live animation／compositor 觀測見上方；不重複 settle 試跑、不放寬像素。此批誤覆寫兩個舊遠端 scratch transfer 檔，原 bytes 未找回，已明載；indexed 歷史證據未改。新 transfer producer 強制 exclusive 目錄並驗證碰撞拒絕。

- `a98046e` 修正朝廷 E2E 在正常 x5 Worker 日結算前讀取快照的競態：保留原 clock／UI，等精確下一日及零 pending ticks 後再讀完整狀態。原案例與觀測衍生版本均 RED，精確候選 PASS。`1e40539` 修正 earned-alliance 的另一種正常影格邊界：原 day299 尚未派發下一 tick，不是 generator 失敗；保留原 32／152／120ms 與 UI 控制，最多補三個受 x5／無 dialog 保護的 16ms RAF，每次等 pending tick 完成，仍要求精確一日及原完整斷言。原版／診斷 RED，最終原生 PASS 21.4 秒。最後固定 `1e40539` 的型別、完整 ESLint、格式、364 項 discovery 與 1,633 Git 輸入前後校驗通過；完整原生未重跑。
- 前批 Hojo 未完成的原始路徑：day120 信用已足夠，但實際分數 0.487169 未達 0.5；診斷延至 day150 時 null cache 的表面 0.9 不是合法安全證據，實際刷新分數為零。day121–125 的強制重算 0.5716 也只是反事實，正式十日 cache 仍沿用 day120 分數。六個省略 eventEngine 的 clone-core 診斷均拒絕，沒有宣稱覆蓋 day151–180。另有 exact label locator 與實際 combobox AX 不符；該批未把 locator 修正當成正向出兵通過。後續合法路徑的真正出兵驗證見上方 `1791c9a`，沒有改門檻或操弄 cache。
- 色覺原 achromatopsia 案例再次 RED：還原後九個差異像素位於右上 HUD 按鈕邊緣，這次沒有重現較早左側縫隙。獨立診斷的三組無 CDP 對照均零差異；還原差異由原樣式十一個、移除陰影六個、隱藏 HUD／rail 零個，僅支持 DOM／compositor 邊緣相關，未確定單一 paint owner。WebGL canvas readback 為均勻黑色，無效而排除。plan17 要求色覺／灰階人工辨識檢查，精確 full-page CDP 還原是額外 E2E oracle；本批保持原零差異斷言、期限及基準，沒有把診斷當成通過。

- `c74a46c` 將 coast 的 renderer-ready 前置抽成共用 helper，只接到 coast、army material、context focus 三個原生路徑，在第一個需要 renderer 的呼叫前等待。控制延遲字型載入時舊兩項均因尚未掛載失敗，候選延遲四項與精確原案例四項均通過；既有 coast 延遲回歸保持。固定提交的型別、完整 ESLint、四檔格式與 364 項 discovery 通過，1,633 個來源輸入前後同 Git。沒有改遊戲、期限、全域 fixture 或保護基準。
- `bf6638e` 修正軍團 E2E 在 Worker 結算完成前讀狀態的競態：保留原 `stepDays`，以原五秒 poll 等精確目標日及零 pending ticks。原兩項均失敗，觀測到 pendingTicks=1 與舊日期；候選兩項通過，原軍團／金庫／解散／手動暫停斷言保持。最後型別、完整 ESLint、五檔格式、364 項 discovery 與 1,633 來源前後校驗通過。首次來源前置因先寫入的 CLAUDE 交接段落停止，已保存唯一差異及恢復後的獨立成功執行；未改用 blocker 語意不同的 `stepDaysAsync`。
- 固定較早 `ecba08b` 的完整 364 項並行度診斷，僅改 CLI workers，均到原 300 秒上限。4 workers：162 PASS／9 FAIL／0 timeout／20 其他 skipped／2 interrupted／171 未派發；8 workers：218 PASS／9 FAIL／1 timeout／23 其他 skipped／3 interrupted／110 未派發。兩者都 RED，未採用新的 worker 上限；原 16-worker `1464146` 是不同來源／363 項，只能作歷史參考。兩個新測試修正尚未重跑完整原生。

- `5500bc0` 將三個 Ending 瀏覽器流程的合法存檔生成集中到檔案內 `beforeAll`，每個 worker 生命週期各新生成一次；保留獨立 browser context、單一 `chromium` project、原 5 秒 generator／300 秒全套上限。三項通過，生成失敗、worker 重啟、毀損存檔、無關 subset 與子程序逾時清理均有控制證據。這不是每次 invocation 絕對只生成一次，也尚未清除全套的生成逾時。
- `1464146` 修正 actor-depth 測試把 canonical Y 當成地形抬升後 scene Y 的錯誤；改用獨立節點投影觀測，保留精確城池腳點相等、軍隊 anchor 關係、排序／重疊／選取斷言。原三項 1 FAIL／2 PASS，最後三項通過。`3ec8d7` 補 coast 初次掛載的 ready 前置；控制延遲字型載入時舊版失敗，新版原案例加回歸兩項通過。三次提交都只改 E2E，沒有改遊戲或期限。
- 固定 `1464146` 原完整原生 363 項、預設 16 workers，300,015ms 到全套上限：226 PASS、15 FAIL、3 case timeout、29 其他 skipped、7 interrupted、83 未派發。Ending 單一 generator 仍花 6.719 秒而超過原 5 秒；後兩項未執行。該批次最後 `3ec8d7` 的型別、coast ESLint／Prettier、364 項 discovery 與 1,632 輸入前後校驗成功；該批次完整 ESLint 與完整原生釘選 `1464146`，沒有改標。後續完整 ESLint 見上方 `bf6638e`。
- 分類更正：重新比對原 `8ea965a` JSON 與七項 terminal interrupted 名稱，正確分類為 222 PASS、18 FAIL、3 timeout、27 其他 skipped、7 interrupted、85 未派發。先前的 34／7／78 分法把有 skipped result 的 interrupted 錯當成空結果；原 raw 與歷史套件不改，新 `native-full-suite-1464146` 保存補正。兩次全套都未通過，不能把四個額外 PASS 當因果效能提升。
- 色覺 CDP 還原仍 RED；獨立重現 416 個差異像素，無 CDP 控制也有同區域 385 個差異，paint owner 未確定，沒有放寬零差異或更換基準。下一步可做固定來源、完整案例、原期限下的 4／8 worker 診斷；未採用新的 worker 設定，亦不再重複同來源 16-worker 全套。

- `51abd75` 修復 1280×720／1.5 倍率結局徽記被上緣裁切：只把垂直對齊改為 `safe center`，保留可捲動內容及原字級。Ending、事件、具申／月結各十五倍率的分組證據已保存；具申／月結最後鍵盤版本十五項通過。只有 Event 最後新增的橫向溢出與 Enter 斷言只在精確 1.5 倍率 focused run 驗過，不能把較早事件十五項成功改標為最後測試版本。Battle 控制十五倍率加原生鍵盤共十六項通過。
- `b867014` 修正 Battle 速度按鈕的可及名稱，包含可見倍率，並為戰法容器加上 group 語意。Axe serious 三節點降為零，原 critical 零維持；41 項受影響的一般原生案例通過。`3da2334` 補齊十個 unit 精確名稱查詢，原 7 FAIL／14 PASS 轉為 21 PASS。最後固定 `3da2334` 的 138 focused tests、型別、完整 ESLint、資料／素材、build／bundle 成功，1,632 輸入前後符合 Git。national-soak 只有 selector 靜態更新，沒有長跑結論。
- 原完整原生 `51abd75` 在 Node 22 discovery 因 court-rank 間接匯入 JSON 而失敗；`8ea965a` 只修正測試的存檔預期值，保留全 state 相等。原完整 `8ea965a` 的分類補正見上方；現有個別測試的 75–270 秒 override 未改，不能宣稱每項都受 60 秒限制。該批次完整 core 仍釘選 `7d37c28`，不得把 focused 或後續語意修改當全量成功。
- 先前 Ending dependency setup 提案由 `5500bc0` 的檔案內 worker 生命週期方案取代，避免 `--project=chromium` 漏掉新 project 或無關 subset 被迫生成 fixture。其餘原生失敗、strict60、whole-heap、long-run、其他介面與全 M6–M9 gate 保持開放。無嗣／戰術終局、人口校準及 934163c 六圖人工核准均未收到決策。
- 後續隔離副本使用 `docs/validation/2026-10-12/completion-audit/scoped-source-snapshot-79682cd/tenka-scoped-source-archive.py` 的 allowlist／精確 delta 與全來源校驗，禁止再串流整個驗證文件樹。這批 Battle setup 的全 tracked archive 例外已明載；所有新的驗證 subprocess 仍須先 exclusive-create 完整 log，Playwright 使用唯一 output／report。未 push／deploy，milestone 未提升。

- `5f250eb` 修正 0.9 倍率的報告提示密度超標：上下 padding 統一減少，字級、完整換行與 32px 按鈕維持；原版十五項為 14 PASS／1 FAIL，候選十五項全通過，報告中心另驗 195 個控制。`cf9fb7e` 增加武將／設定／存讀檔三類面板十五倍率驗收，45 項通過。這些只是 M8-23 子門檻；強制 overlay、Battle 控制的後續結果見上方，其他面板、完整文字可讀性與原生全套五分鐘仍未完成。新提示間距的六張候選圖已保存，尚未收到人工核准，不得更新 references。

- `934163c` 最小視窗鍵盤六項成功；逐項穩定前後畫面驗十一個鏡頭輸入，quick-save 以完成後的實際 snapshot 日為準。固定此來源整合 227 unit＋7 source contract＋6 原生跨畫面、型別／ESLint／資料／素材／build／bundle 通過；Linux final 報告十五及非政策四十五再次成功。Linux／Darwin 原視覺各 4 PASS／1 protected 三視角 FAIL，新的六張 final actual 仍待人工核准，舊審查提案已被新六圖取代。詳見 `ui-integrated-934163c` 與兩個 `protected-art-final-*-934163c` 證據套件。

- 前批已驗證修正：`f03ba63` 修復面板焦點下的 Home／M；`f5d8969` 清除貼圖批次的稀疏索引快取；`7d37c28` 增加政策面板十五倍率驗收。固定 `7d37c28` 全量測試 6,445 通過、1 既有無嗣失敗、1 跳過；原生 60 FPS、whole-heap、protected art、long-run 與其餘 M6–M9 門檻仍未完成。六張 Linux／Darwin 基準與無嗣規則等待明確決策。完整證據見 `docs/validation/2026-10-12/completion-audit/`。

## 貼圖批次快取與政策倍率驗收（2026-10-12）

- `f5d8969` 以唯一非零負數 TextureSource UID 避免 sparse indexed backing，clear 時刪除已釋放 key。29-target 精確修補保留 CJS／ESM、排序、padding、替換與重用。27 項 Pixi 測試通過；既有 25-target 可直接升級，實測四次寫入後重跑零次。這不改變較早 23→25 必須 fresh npm ci 的限制。
- sim4 原 20 次 remount 通過；獨立 240 次診斷的 63 個穩定批次 ID map 在 120／240 次皆零 key／indexed backing。原快照的分析獨立重跑與保存 JSON 完全相同。延長診斷後半仍增加 208,584 bytes，因此 whole-heap 未達標。
- Fresh baseline／candidate 三張 actual PNG 完全相同，原保護基準仍 RED。候選獨立 GPU probe 因尚未掛載 renderer 而失敗；GPU 身分只在延長診斷的 actual page 直接核對，不將同 launch flags 當原視覺執行的 GPU 證明。
- `7d37c28` 的政策驗收涵蓋 1280×720、0.8–1.5 每 0.05 共十五倍率、十二政策與詳情、捲動及真實鍵盤路徑。25-target 與整合 29-target 各十五項通過；另 375 個互動目標符合 32×32 CSS px 下限。這只完成政策子門檻，不代表 M8-23 全畫面完成。
- 固定 `7d37c28` 全量為 6,445 通過、1 既有無嗣失敗、1 跳過，694 檔；1,557 來源前後精確符合 Git blobs。型別、完整 lint、資料／素材、建置及 bundle 通過。來源後續若改動，不得將此結果改標為新 HEAD 全量。
- 證據缺失已明載：早期 npm PATH 失敗 log 遭覆寫；整合政策第一輪十五項成功 log 保留，但幾何與圖片被後續 probe 覆寫，恢復執行另行保存，不能冒充第一輪。後續所有 Playwright 作業必須指定唯一 output、report 與 log 路徑。
- Battle 手動存讀仍缺少原子 tick 邊界及戰術 pending queue 的保存／還原契約；依 16 高優先規格保留停用，未自行擴充 SaveFile 或丟棄未執行命令。其餘全專案門檻保持，未 push／deploy。

- `f03ba63` 依 11 主頁快捷鍵範圍讓非原生控制的面板焦點可使用 Home／M；輸入、按鈕、dialog／modal、重複鍵與資源列本地 Home 仍受原 guard 保護。舊來源配新增測試為 2 FAIL／18 PASS，修正後 20 PASS；真實鍵盤在武將特性焦點下由原無效轉為隱藏小地圖與選取本據城。七項跨畫面原生控制第一輪平行有一個斷言前 JSON 解析失敗，同七項串行全部通過，第一輪 raw stdout 未保存，僅串行成功 log 封存。最新全量仍是修正前 `7d37c28`，未冒稱 `f03ba63` 全量。

- 後續驗證先以 exclusive-create 的唯一 log 檔接住完整 stdout／stderr，再啟動 subprocess；Playwright 同時使用唯一 output／report 路徑。不得只依賴工具回覆或完成後才搬走預設目錄。

- `f03ba63` 與新增證據檔完成最終完整 ESLint／Prettier，exit 0；詳細 log 封存在 hotkey-main-focus。完整 Vitest 結果仍釘選 `7d37c28`。
