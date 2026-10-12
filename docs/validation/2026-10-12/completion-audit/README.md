# 後續驗收、重放歸因與記憶體觀察

Rust WASM／Worker 架構及後續效能修正已分步提交，完整專案目標仍未完成。
最新固定來源 `7d37c28` 全量測試為 6,445 通過、1 既有失敗、1 跳過；120 部隊近景仍未達 60 FPS。
目前繼續處理核心與原生視覺驗收；只有歷史來源與完整差異已查明時才遷移凍結基準，原生門檻維持。

## 原生成本負控制、靜態繪製觀測與原始檔搬移

固定 `f03f318` 的[原生成本排查](native-critical-path-f03f318/README.md) 沒有產生可採用修正。較早固定 `ecba08b` 的 4／8-worker 完整 report 診斷顯示工作時間與尚未派發案例問題，並未採用 worker cap。針對重複事件倍率流程的精確原版及觀測原版，兩次都在 1560/3/30 月結關閉後的 x5 按鈕 500ms actionability 等待失敗。AX 顯示無 dialog、按鈕可見且啟用；每次前後八張 screencast bytes 相同。這排除不了 DOM RAF 排程，也不足以指認 GPU 原因。兩次使用 Linux 預設 headless shell、`VISUAL_GPU` 未設；不能冒稱既有 full Chromium／Vulkan 執行。virtual-RAF v2 沒有執行，且 poll 內精確日期斷言可能被 retry 吞掉，仍是未驗證提案，不可直接採用。沒有放寬 500ms guard、45 秒 poll、60 秒 case 或 300 秒全套，也沒有再跑完整原生。

[色覺 layer 觀測](color-layer-observation-f03f318/README.md) 保留原樣式及精確零差異：還原仍差 508 像素，集中左上 HUD／rail 邊緣。六個取樣均無 live animation；computed style、幾何、焦點、state／commands 相同。HUD／rail 尺寸相符的 layer paintCount 在 emulation 與還原各增加，只有幾何關聯，沒有 backend node ID 證明 owner。這是一次會受 CDP 觀測影響的 compositor 診斷，不是已確認原因。暫停重複 native 探測；plan17 的色覺／灰階人工辨識、40 勢力／道路／友敵 cue 可讀性與額外 exact restore oracle 分開追蹤，尚未接受既有美術。

[舊 national traces 搬移證明](national-traces-relocation-f03f318/README.md) 保存 17,006 entries／1,644,571,085 bytes 的逐檔 hash、mode、命令及結果。原本機 `/tmp/tenka-national-current-headless-artifacts` 已搬至 sim2 的 exclusive retained 目錄；完整遠端比對、再次本機比對及無 open handles 後才刪除本機副本，歷史 indexed 套件不變。未重複保存大型 trace；未來使用前仍須重新核對遠端。這次有證明的搬移不修復前批兩個遺失 scratch 檔。

本批只增加觀測、保留證據與交接，production／E2E source 未改，沒有 core／full-suite 重跑或新的成功宣稱。完整原生五分鐘、strict60、whole-heap、long-run、其他 UI／M6–M9 及待決無嗣／戰術終局、人口校準、934163c 六圖人工核准全部維持。下一步先解決已定位但未歸因的普通 UI resume actionability，或針對另一個有明確成本證據的測試設計等價控制；不可將未執行 virtual-RAF 提案當成已驗證加速。

## Hojo 合法出兵路徑與色覺控制結果

`1791c9a` 的[Hojo 合法兵力輸送路徑](hojo-aid-transport-1791c9a/README.md) 通過原正向援軍案例。玩家在 day90 已暫停的月結邊界，透過城池 UI 將躑躅崎館 1,500 兵輸往自有深志城，降低北條邊界上的友軍壓力。指令正常執行、威脅 cache 自然刷新；實際 day120 威脅 1.87425968684、score 0.50658314092，與較早 clone 的反事實預測 0.512038 分開。四個付費月份、day121 同意／五個 AI 出陣指令、day122 援軍建立及 day123 普通移動全由原斷言通過，54.705 秒未超過原 60 秒。這是 focused 成功，不保證全套負載下的期限。

原 day119 停止觀測超至 day120、舊 exact label 查詢逾時兩個 RED 均保存；後者改用已觀測的 combobox AX 名稱。原生採最後格式前的精確 bytes，最終提交只改格式且語意 AST 相同。[固定 1791c9a 整合](hojo-route-integrated-1791c9a/README.md) 通過型別、完整 ESLint、364 項 discovery、格式及 1,633 Git 輸入前後校驗。沒有改遊戲規則、門檻、cache 或 deadlines，也沒有重跑完整 core／原生。

[色覺正規化控制](color-normalization-e4e5521/README.md) 沒有產生可採用的修正。CDP priming 還原差異 293 像素；強制 HUD／rail 重畫在無 CDP 對照即差 385；原樣式五張 baseline／五張 restored 的 25 個交叉比較全非零，最少 246。baseline 五張未達穩定，不能宣稱共同穩態不可能。原測試及完整隔離 e4 來源恢復；後續 live animation／compositor 觀測見上節，不重複相同 settle 控制或放寬像素。

本批 transfer 曾覆寫兩個舊遠端 scratch `manifest.json`／`source.tar`，只找到原 size／mtime，原 bytes 未找回；此限制明載於色覺套件，既有 indexed 證據未改。新 producer 要求 exclusive 新目錄，碰撞時不啟動複製且原內容 hash 不變；實際先轉移後做控制的順序亦如實保留。初次打包自我 capture 尚未結束造成的 verifier RED／不完整 archive 另存，沒有改寫成第一次即成功。

色覺、完整原生五分鐘、strict60、whole-heap、long-run、其他 UI 及其餘 M6–M9 gate 仍開放。無嗣／戰術終局、人口校準、934163c 六圖人工核准均無新裁決；沒有更改 references、milestone 或 push／deploy。

## 朝廷／同盟日邊界與 Hojo 正向援軍診斷

`a98046e` 的[朝廷正常日邊界](court-work-normalday-a98046e/README.md) 保留原 x5 clock／UI，只在讀取快照前等精確下一日與零 pending ticks。原案例與觀測版本失敗，候選成功；原始來源前置加候選後置／overlay hash 的證據鏈如實標示，沒有宣稱完整候選 before fingerprint。

`1e40539` 的[同盟正常影格邊界](alliance-day-boundary-1e40539/README.md) 是不同原因：generator 已成功，但 day299 的下一 tick 尚未派發。測試保留原 32／152／120ms 與真實速度按鈕，最多補三個受 x5／無 dialog 保護的 16ms RAF，每次先等 Worker 閒置；仍要求精確一日、零 pending ticks 與原付款／協定／存讀檔斷言。原版與診斷失敗，最終精確版本通過 21.4 秒。原生 pin 是 `1649c65` 加同盟測試 overlay，沒有冒稱包含較晚 court commit。

[固定 1e40539 整合](ui-boundary-integrated-1e40539/README.md) 通過型別、完整 ESLint、兩檔格式、364 項 discovery 及 1,633 個 Git 輸入前後校驗。這些只改 E2E，完整 core／原生仍保持原 pin；沒有重跑全套或改時間上限。

[Hojo 診斷](hojo-aid-cadence-a98046e/README.md) 保留正向援軍未完成的原因。day120 信用 24.32 已達合法成本，但威脅使分數僅 0.487169。原界限內延至 day150 的診斷把 null cache 誤當零威脅而得到 0.9；真正刷新後分數為零。day121–125 的強制重算分數較高只是反事實，正式十日 TTL 仍使用 day120 cache。六次省略 eventEngine 的 clone-core 診斷均拒絕，沒有 day151–180 的結論。停止已完成外交工作不會觸發威脅 cache 失效，因此沒有加入此無效繞路。AX 中正確援軍 combobox 與 exact `getByLabel` 不符是另一個已定位的測試問題；未採用 Hojo 修改，也未把拒絕或 locator 修正當成正向出兵成功。

[色覺繪製診斷](color-paint-owner-1e40539/README.md) 的原 achromatopsia 案例仍失敗：還原後九個精確差異像素都在右上 HUD 按鈕邊緣，本次沒有重現舊左側縫隙。獨立診斷的三組無 CDP 對照均零差異；原樣式還原十一個、移除陰影六個、隱藏 HUD／rail 零個。這些結果支持 DOM／compositor 邊緣參與，不能確定單一 owner、推論所有色覺模式或宣稱 Chromium bug。均勻黑色的 canvas readback 無效，不作畫布像素相等證據。plan17 規定色覺／灰階人工辨識檢查；exact full-page CDP restore 是測試衍生 oracle，本批仍維持原零差異要求，沒有改門檻或 references。

下一步可建立真正改善 Hojo 安全條件的合法援軍路徑；色覺先驗證明確的 compositor／emulation 初始化能否讓原 exact restore 穩定，不直接放寬像素差異。完整原生、strict60、whole-heap、long-run、其餘 UI／M6–M9 與待決規則／人工六圖均未完成；沒有更改里程碑或 push／deploy。

## 地圖掛載前置與完整原生並行度診斷

`c74a46c` 把既有 coast renderer-ready 前置抽成共用 helper，只套用到 coast、army material、context focus 三個測試路徑的第一個 renderer 呼叫前。[原生證據](mapboot-readiness-c74a46c/README.md) 保存原兩項延遲控制 RED、候選延遲四項 PASS、精確採用版本四項 PASS；coast 的刻意延遲回歸沒有變成全域等待。[固定整合](mapboot-integrated-c74a46c/README.md) 的型別、完整 ESLint、四檔格式、364 項 discovery 與 1,633 個 Git 輸入前後校驗通過。這只修正驗收前置，沒有改遊戲或期限。

`bf6638e` 修正[軍團驗收讀取未完成 Worker tick](ai-corps-stepdays-bf6638e/README.md) 的競態。原兩項均失敗，觀測資料顯示 pendingTicks=1 且尚未到要求的日期；候選保留原 `stepDays`，等精確目標日與零 pending ticks 後，原兩項全部通過。原軍團、金庫、解散與暫停斷言不改，也沒有改用 blocker 語意不同的 async API。[最後整合](ai-corps-integrated-bf6638e/README.md) 的型別、完整 ESLint、五檔格式、364 項 discovery 及 1,633 來源前後證明通過；首次因交接段落造成的 CLAUDE 來源不符已明載保存。

[固定 ecba08b 並行度診斷](native-concurrency-ecba08b/README.md) 在同一來源、依賴與原 300 秒上限下串行執行全部 364 項，只有 CLI workers 不同。4 workers：162 PASS、9 FAIL、0 timeout、20 其他 skipped、2 interrupted、171 未派發；8 workers：218 PASS、9 FAIL、1 timeout、23 其他 skipped、3 interrupted、110 未派發。兩者都未通過全套門檻，沒有採用新 worker 設定。較早 16-worker `1464146` 是不同來源及 363 項，不能當成同條件對照；此處兩次完整執行也不包含後續 readiness／軍團修正。

兩次 Ending 三個瀏覽器流程均通過，generator 的 test phase 分別 2.09／3.64 秒，原五秒限制不改；4.04／6.69 秒是 Vitest 程序總時間，不能混用。九個相同失敗包括軍團兩項、色覺四項、court-work、earned-alliance、earned-hojo-aid；軍團的後續 focused 修正見上方。完整逐項轉移保留，其中 earned-rice-trade 從 4-worker PASS 變為 8-worker timeout；不只列出額外成功。

其餘原生失敗、strict60、whole-heap、long-run、介面餘項與全 M6–M9 gate 維持開放。無嗣／戰術終局、人口校準、934163c 六圖人工核准仍未收到決策；沒有更改規則、基準、milestone 或 push／deploy。

## Ending 生成、投影座標、初次掛載與完整原生分類補正

`5500bc0` 將 Ending 合法存檔生成集中到檔案內 `beforeAll`，每個 worker 生命週期各新生成一次，保留三個獨立 browser context、單一 `chromium` project 與所有原 UI 斷言。[生成控制](ending-fixture-5500bc0/README.md) 保存三項成功，以及失敗傳播、worker 重啟新生成、無關 subset、毀損檔案與逾時子程序清理。這是取代先前 dependency-project 提案的較小方案，不宣稱每次 invocation 絕對只生成一次。

`1464146` 修正測試的 canonical／scene 座標混用，[actor-depth 證據](actor-depth-projection-1464146/README.md) 保存原 1 FAIL／2 PASS 和最後 3 PASS，精確城池腳點相等與其他排序／重疊／選取斷言保留。`3ec8d7` 補初次 map-ready 前置，[coast 證據](coast-readiness-diagnosis-8ea/README.md) 保存字型載入被控制延遲時的舊版 RED，以及原幾何案例加新回歸兩項成功。這些修改都限於 E2E，沒有改遊戲、原期限或保護基準。

[固定 1464146 全套](native-full-suite-1464146/README.md) 使用預設 16 workers，在 300,015ms 到原 global deadline：363 項中 226 PASS、15 FAIL、3 case timeout、29 其他 skipped、7 interrupted、83 未派發。單一 Ending generator 仍花 6.719 秒而超過原 5 秒；後兩個流程沒有執行。原 actor-depth、army-plate 指標／far LOD、coast 案例本次通過；army-plate-material 與 context-panel-focus 則新增 renderer 尚未掛載失敗。這是單次狀態差異，不能推論四個額外 PASS 是因果效能提升。

**歷史分類補正：**重新比對 `8ea965a` 原 JSON 與七個 terminal interrupted 名稱，正確分類是 222 PASS、18 FAIL、3 timeout、27 其他 skipped、7 interrupted、85 未派發。先前 34／7／78 的分類有誤：這七個 interrupted 已有 `skipped` result，不屬於空結果。原 JSON、log、歷史套件與既有 hash 列不改；新全套套件保存兩次 raw 的補正分析。

[1464146 本機整合](e2e-integrated-1464146/README.md) 的型別、完整 ESLint、363 項 discovery／格式與 1,632 輸入前後校驗成功。[3ec8d7 最後檢查](e2e-integrated-3ec8d7/README.md) 的型別、coast ESLint／格式、364 項 discovery 與相同範圍來源校驗成功。完整原生仍釘選較早 `1464146`，沒有在 coast 修改後再跑或改標；最新完整 core 仍是 `7d37c28`。

[色覺診斷](native-colorvision-diagnosis-8ea/README.md) 獨立重現 416 個還原差異像素，無 CDP 控制也有同區域 385 個差異；DOM hit target 無法區分 HUD shadow 與 canvas 的 paint owner，原因仍未確定。零差異門檻不變。下一步見[原生排程與掛載前置](e2e-integrated-3ec8d7/next-native-design.md)：先釐清共用啟動 helper 關係，另以固定完整來源做 4／8 worker 診斷，沒有採用新 worker 設定。strict60、whole-heap、long-run、其餘介面與全 M6–M9 gate 仍未完成；無嗣／戰術終局、人口校準、934163c 六圖人工核准仍未收到決策。

## 結局溢出、Battle 語意與完整原生原始失敗

`51abd75` 以 `safe center` 修復最小視窗／1.5 倍率的結局徽記上緣裁切。原圖、原 RED、修正後十五倍率與精確最後三項 focused 驗證見[強制視窗證據](mandatory-overlays-responsive-51abd75/README.md)。具申／月結最後鍵盤版本十五項通過；Event 較早十五項成功與最後新增橫向溢出／Enter 斷言的精確 1.5 倍率成功分開標示，沒有把事件前版結果改標為最後版本。[Battle 控制](battle-controls-79682cd/README.md) 十五倍率及鍵盤共十六項成功；production 撤退／戰術滅亡仍沒有新規則。

`b867014` 修正速度按鈕可及名稱與戰法 group，原 axe serious 三個節點降為零，critical 維持零。[Battle 語意證據](battle-axe-3da2334/README.md) 保存原 native 負控制、41 項受影響的一般原生成功，以及漏改 unit 查詢造成的 7 FAIL／14 PASS 和 `3da2334` 修正後 21 PASS。第一次 checker 只有 E2E 22 處；擴充到 src／tests／e2e 後才補齊十個 unit 查詢。national-soak 只有 selector 靜態更新。

[原完整原生](native-full-suite-8ea965a/README.md) 先保存 `51abd75` Node 22 discovery RED，再保存 court-rank 測試專用修正後 `8ea965a` 的全套。362 項以預設 16 workers 在原 300 秒上限結束：222 PASS、18 FAIL、3 case timeout；skipped／interrupted／未派發的歷史分類補正見上節。原個別 timeout overrides 保留，不宣稱所有案例都使用 60 秒。完整 report 本地壓縮保存，4.9GB／22,721 個輸出檔仍在 sim4 並有逐檔 hash／size 清單；第一張 post-process 圖有兩個 PPID1 worker，第二次觀測已退出。

三個 Ending 案例在 browser 前的合法 fixture generator 各因 5 秒 Vitest 上限失敗；case 6.61／6.47／5.95 秒，idle 同命令 1.61 秒成功。這不代表 Ending 畫面失敗，也不解釋其餘十八個 unexpected。下一步是[Ending 專屬 dependency setup 設計](overlay-integrated-3da2334/next-fixture-design.md)，生成仍計入原全套 deadline，不增加 timeout、不讀舊 fixture，不使用會牽連無關 subset 的 globalSetup；尚未實作。

[固定 51abd75](overlay-integrated-51abd75/README.md) 與[最終 3da2334](overlay-integrated-3da2334/README.md) 的 local checks 各自釘選，最後 138 tests／16 files、型別、完整 ESLint、資料／素材、build／bundle 成功，1,632 個輸入前後同 Git。沒有在最後 Battle 語意修改後再跑完整原生，也沒有重標較早完整 core 結果。[限定來源快照工具](scoped-source-snapshot-79682cd/README.md) 另驗完整 base restore 加單檔 delta；這批早期 Battle 全 tracked archive 的 setup 例外保持明載。

完整原生、其餘介面、strict60、whole-heap、long-run 與全 M6–M9 仍未完成。無嗣／戰術終局、人口校準、934163c 新六圖人工審查尚未收到決策；沒有更改相關規則、基準、milestone，沒有 push／deploy。

## 報告、非政策面板與主頁鍵盤驗收

`5f250eb` 修正報告提示在 0.9 倍率的原密度門檻失敗：統一減少上下 padding，保留完整文字、字級與 32px 控制。原版 14 PASS／1 FAIL，候選十五倍率全通過，另驗證報告中心 195 個互動目標及類別／月份／前往操作。[報告證據](reports-responsive-961f0ae/README.md) 分開保存真正的密度 RED、較早的 observer 錯誤與候選結果。

`cf9fb7e` 的[非政策面板驗收](nonpolicy-responsive-961f0ae/README.md) 在武將、設定、存讀檔三類面板各十五倍率，共 45 項通過。涵蓋捲動到最後一列／最右欄、32px 目標、鍵盤詳情、最後手動欄位實際存檔；載入／匯入僅驗證可達及啟用，沒有執行匯入，也沒有量測每段文字。

`934163c` 的[最小視窗鍵盤驗收](keyboard-minimum-961f0ae/README.md) 六項通過；十一個原生鏡頭輸入逐項比較各自穩定前後畫面，沒有宣稱數值方向／幅度。保存 async tick 邊界下的 quick-save 完成後才記錄預期日，再驗髒狀態與 F9；舊 observer race 與 timeout 均保留。舊 router 負控制的 hash 為較晚 readback，沒有冒稱當時的 post-overlay 證明。

[固定 934163c 整合](ui-integrated-934163c/README.md) 通過 227 個相關 unit、7 個 CSS source contract、6 個既有原生跨畫面測試及型別／ESLint／資料／素材／build／bundle，1,589 個來源前後符合 Git。[Linux 最終套件](protected-art-final-linux-934163c/README.md) 的報告十五與非政策四十五項再次通過，1,633 個來源及 fresh 29-target 依賴前後相同。Linux／[Darwin](protected-art-final-darwin-934163c/README.md) 的原視覺五項各 4 PASS／1 protected snapshot FAIL（三視角）。新的六張 actual 等待人工核准，舊 references 未改；最新全量仍釘選 `7d37c28`。

以上前批結果不能代表 M8-23 全部完成。強制 overlay／Battle 的後續驗收與完整原生 RED 見上節；其他面板與完整文字可讀性仍需逐項驗收。原 60 FPS、whole-heap、protected art、long-run 與其餘 M6–M9 門檻保持開放。早期 archive 的 ENOSPC 只保留工具回覆抄錄；之後 validation 均先建立唯一完整 log，Playwright 另用唯一 output／report，不能宣稱所有 setup raw 都已保存。

## 最新貼圖快取與政策縮放驗證

`f5d8969` 將 TextureSource ID 保持為唯一非零數字，但使用負值避免批次快取的稀疏索引；clear 時刪除已釋放 key。
[本機控制與來源](texture-batch-key-local/README.md) 包含 27 項 Pixi 測試、CJS／ESM、排序／padding／重用／替換，以及 25→29 修補安裝控制。
[原生證據](texture-batch-key-native/README.md) 中 63 個穩定批次 ID map 在第 120／240 次都沒有 key 或 indexed backing。
原二十次資源測試通過；延長診斷後半仍增加 208,584 bytes，whole-heap 未完成。
同一主機 fresh baseline／candidate 三張 actual PNG 完全相同；原保護門檻仍 RED。
候選的獨立 GPU probe 曾因 renderer 尚未掛載而失敗，原失敗保留；只有延長診斷的 actual page GPU 可直接核對。

`7d37c28` 加入[政策響應式驗收](policy-responsive-d7c0337/README.md)：1280×720 下十五個支援倍率、十二張政策及詳情，含捲動與實際鍵盤路徑。
原固定 `d7c0337`／25-target 執行十五項全部通過，沒有重現需要修改產品 UI 的缺陷。
這是政策子門檻，不能代表 M8-23 全畫面、全快捷鍵已完成。
[整合 29-target 政策驗證](policy-responsive-integrated29/README.md) 另通過十五倍率、180 次詳情操作與 375 個目標的 32×32 CSS px 下限。
第一輪整合執行的 log／來源校驗保留，但幾何與圖片被後續 probe 的預設輸出目錄覆寫；恢復執行的資料分開標示。
更早 npm PATH 失敗的原 log 亦未保留，兩項證據缺失明載，不宣稱全部原始資料均已保存。
[整合全量驗證](integrated-7d37c28-regression/README.md) 保留 `7d37c28` 的 6,445 通過、1 既有無嗣失敗、1 跳過及 1,557 來源前後校驗；型別、完整 lint、資料／素材、建置與 bundle 全通過。

## 面板焦點的主頁快捷鍵

`f03ba63` 將 Home／M 的範圍修正為 MainScreen 的非原生控制焦點，符合 11 的快捷鍵表。
[反向控制與原生驗證](hotkey-main-focus/README.md) 中，舊來源配新斷言為兩失敗／十八通過，修正後二十項全通過。
實際武將特性焦點的 M 現在隱藏小地圖，Home 選取本據城；輸入框、按鈕及 HUD 資源列的本地 Home 保持原行為。
七個跨畫面原生控制第一輪平行有一個斷言前 JSON 解析失敗，同七個串行全通過；第一輪 raw stdout 未保存，只有結果記錄；串行成功 log 已封存。
最新完整 core／UI 回歸仍是修正前 `7d37c28`，不得把其全量結果改標為 `f03ba63`。
後續每個驗證 subprocess 必須先建立不覆寫的唯一 stdout／stderr log，再啟動程序；Playwright 另指定唯一 output／report，不能只依賴工具回覆。

## 最新聚落與記憶體驗證

[整合全量驗證](integrated-89acc88-regression/README.md) 保留兩項修正整合後的完整結果與來源前後校驗。
後續 `0b4b1c1` 只格式化 WASM 測試，轉譯後 AST 相同；全量測試結果仍明確釘選 `89acc88`。
[Darwin 最終畫面](protected-art-integrated-darwin/README.md) 另保留三張原始保護比較與 Apple M3 Max Metal 證據；三張仍 RED，沒有更換基準。

`f6691c9` 在原共用兩輪搜尋中，各保留一輪給城名與聚落避讓。輸入超過既有容量時，仍保留原兩輪城名處理。
半徑、兵數、字體、每個保護矩形的上限與一百萬次比較預算不變。原來源在新增的聚落淨空斷言失敗，
修正後三十六項單元與七項原生藝術控制通過；駿府近景原牆面失敗已清除。
[原版比較](protected-art-current-2d872d7/README.md) 與[精確候選](protected-art-candidate-one-one/README.md)
保留來源、圖像及失敗紀錄。三個保護畫面仍失敗，等待 17 明定的人工基準審核，沒有更換基準或放寬門檻。

[固定全量驗證](current-2d872d7-regression/README.md) 是修正前 `2d872d7` 的完整結果，不能冒充 `f6691c9` 全量驗證。
六千四百四十一項通過，一項既有無嗣領地失敗，一項跳過；一千五百五十五個來源輸入前後相同。
型別、資料、素材、正式建置及 bundle 通過。新增證據檔案曾造成 lint 的專案解析與格式失敗，原紀錄保留。

[新原生記憶體觀測](heap-current-2d872d7/README.md) 保留原二十次與獨立二百四十次 remount 的完整資料。
延長診斷後半一百二十次仍增加 709,796 bytes，不能宣稱整體 heap 穩定。
後續快照定位到 GPU 快取的數字索引與已清除的 null key：其 backing 增加 343,448 bytes。
舊 renderer 與 GPU 物件的釋放，不能排除這些索引的儲存成長。
[較早快照歸因](heap-retention-attribution/README.md) 另保存字型快取填滿及程式碼暖機的可重現分析。

`89acc88` 將 renderer UID 保持為唯一數字，但使用負值作為一般物件 key；GPU 資料釋放後刪除對應 key。
[來源與生命週期控制](gpu-cache-key-local/README.md) 驗證兩個模組格式、多個同時存在的 renderer、重建與安裝雜湊。
原 23-target 修補保留 130 個已釋放 key，新版 25-target 為零；兩者都沒有舊 unload listener。
[精確原生候選](gpu-cache-key-native/README.md) 的原二十次測試及獨立二百四十次診斷均通過資源斷言。
延長診斷後半仍增加 355,196 bytes，整體 heap 門檻未完成。安裝新版修補需重新 `npm ci`，不宣稱可從舊修補直接升級。

## 已完成修正

`8615dc1` 套用既定鍛冶場攻擊加成。每次計算查詢仍屬部隊勢力的出陣城，只有已落成施設生效；攻擊與戰法的套用範圍見 07 §8 D57。未新增兵種欄位或改動既有平衡值。

新增回歸測試在原版本有四項真實失敗；修正後六檔 123 項測試通過，sim3 另有戰術與 audit 合計 77 項通過。實際攻城指令案例證實敵方損失提高、城方反擊損失及 RNG 不變。09 的簡化 AI 估算公式維持既定契約。

`011c5b8` 校正兩個原生視覺測試的座標與前置狀態。相機倍率由獨立的顯示節點位置推導，並逐城驗證投影；不再以未計地形高度的核心座標推導。郡材質量測前清除原生選中狀態，避免金色道路高亮蓋住領色取樣點。原有 RGB、透明度、40／30 世界單位尺寸及命中優先序斷言保留，安全取樣郡增加至四個。四項測試在 sim2 headless GPU 通過。

新版本 `011c5b8` 已於 sim2 重新執行上述四項及六項 Worker 測試，10 項全部通過，耗時約 1.1 分鐘。原生 Worker 的完整局面、RNG、指令紀錄、存讀檔、取消及最終地圖比對仍通過。
最新無 profiler 樣本的正常 ×5 最長畫面間隔為 Worker 107.0 ms／同步參考 130.4 ms，最長工作為 85／68 ms，總時間為 3604.9／3545.0 ms。這一輪沒有重現上一輪 82.6 ms 的 Worker 最長間隔，且最長工作較差；兩輪原始資料各自保留，不擇優合併或宣稱穩定幀率。
原始紀錄、像素資料、尺寸資料及來源 SHA256 見 [browser-011c5b8](browser-011c5b8/)。所有 JSON gzip 保存原始解壓後內容；`summary.json` 及 `visual-json/manifest.json` 提供 SHA256。

`e0c5d25` 修正實際城名牌缺陷：精簡模式曾隱藏必讀兵數。保留原核准字體、間距與完整封套，讓數字、底色區、分隔線和兵數圓點持續顯示，不修改 renderer 的選取或 LOD 規則。
岐阜城近景兵數的實際尺寸由 0×0 恢復為 19.8×15.12 CSS px，與原操作景一致。新回歸測試在舊程式有兩項真實失敗；修正後 145 項元件／renderer 測試及三項未放寬的原生可讀性、遮擋、材質測試通過。證據見 [castle-count](castle-count/)。

## 完整驗收尚未完成

sim1 的原版本 `2474139` 完整測試為 667 檔、6224 項通過、8 項失敗、2 項跳過。這是原版本的結果，不能當作新增鍛冶場修正後的完整測試結果。
失敗包含 AI／外交／mini golden、合戰 transcript、兩個 frozen replay、B8 合戰雜湊，以及第 450 日齋藤無繼承人滅亡後仍持有四城十六郡的不變量。原始紀錄見 [full-suite-2474139.log](full-suite-2474139.log)。

sim3 另以逐檔 git blob 驗證的 `011c5b8` 跑完整套件：667 檔、6193 項通過、47 項失敗、2 項跳過。
隨後更新為已校驗的 `e0c5d25`，重跑全部 22 個失敗檔案及兩個受影響 UI 套件：24 檔、201 項通過、8 項失敗。
額外 39 項失敗在已證明狀態不變的版本標記更新後全部消失，剩下的八項名稱與原基準完全一致。
這是「完整測試加所有失敗檔案重跑」，不是一輪全新的 `e0c5d25` 完整測試，也不是全綠。
完整前後紀錄、失敗集合比較及 1656／1657 檔來源校驗見 [regression](regression/)，原始 bytes 以 gzip 保存；[raw-sha256.json](regression/raw-sha256.json) 記錄解壓後 SHA256。

`68e96a6` 的常數 audit 精確比較 591 個值，無值差異，當時仍有兩個未解問題：反應式 AI 檢查預算與兵力校準。三項延後常數保留原始缺席列與來源決策證據；不將鐵砲加成套到現行無兵種的 Army，也不加入不可達卒年 fallback 的孤兒常數。完整報告仍為 `passed: false`，見 [balance-current.json](balance-current.json)。

## 重放版本標記

新增 `facSmithyAtkBonus` 後，BAL 雜湊由 `824f87bf28bccf9a` 變為 `a5f30428e47ab0f4`。11 個較新 M6 重放案例在原標記與新標記下，使用正式重放函式都得到完全相同的原始凍結 `finalHash`。
`49c697b` 因而只更新這 11 個案例的 `balanceHash`；指令、finalDay 與 finalHash 全部不變。證據限制為最終狀態，案例未記錄歷史每日 checkpoint，不能宣稱逐日比對。
檢查器會在寫入任何檔案前驗證所有候選，並以完整 JSON 比對確定除版本標記之外沒有欄位變化。寫入前後 SHA256 與指令 SHA256 見 [replay-balance-metadata-migration.json](replay-balance-metadata-migration.json)。
完整重放測試 56 項中 54 項通過，當時僅兩個來源未解的較舊案例仍失敗；沒有替換它們的 finalHash。

較舊 `7634217400759e66` 標記在檢查過的 BAL 提交版本中未找到匹配。雜湊演算法及排序沒有相應變更；AI 命令／事件計數也有實際差異，不能只歸因於版本標記。來源與差異診斷見 [balance-hash-history.json](balance-hash-history.json)、[golden-drift.json](golden-drift.json)。

## 人口校準

使用目前的 `loadS1560Scenario()` 解析完整資料束，再於 sim4 的 Node 執行。
344 郡合計石高 17,994,000、人口 6,033,500，人口／石高為 0.335306。
這不支持 `plan/15-balance.md` §3.4 的「郡人口 ≈ 郡石高」推導假設。
`plan/14-scenario-data.md` §3.1 的初值公式則使用約 0.33 倍人口。

目前 `soldiersPerPop=0.025` 的人口項合計，相當於每石 0.008383 兵。
此觀察**只計人口項**，不含城格基礎兵力、設施或政策，不是總兵力上限或遊戲平衡結論。
完整逐郡資料保存於 [population-calibration.json](population-calibration.json)。
尚未更動人口、兵力公式或平衡數值；校準方向已向使用者詢問。

## 重現

在此目錄將 `population-calibration-probe.ts.txt` 複製為 `population-calibration-probe.ts`，執行：

```sh
npx esbuild population-calibration-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/tenka-population-calibration.mjs
node /tmp/tenka-population-calibration.mjs
```

擷取程式使用相對路徑，須放在本目錄才會載入正確來源。完成後移除臨時 `.ts` 檔。

純文字 log 僅移除行尾空白及結尾多餘空行；gzip 原始資料完整保留 bytes，並以解壓後 SHA256 校驗。

## 後續分步提交

`3686129` 修正河面測試的座標 oracle：平面湖泊的實際繪製點建立相機，所有湖泊點及城堡的地形位移另行驗證。舊 oracle 以未計高度的城堡座標建立倍率，與實際湖泊位置相差約 7–9 CSS px。原有 48 個取樣站、河內安全界線、道路／海岸排除、重複量測及 RGB 範圍 3–18 不變。sim2 原生測試修正前失敗，修正後通過；Kiso 範圍為 6.333／7／9，Yodo 為 7.333／6／7.667。原始前後資料見 [river-projection](river-projection/)。

`189c2c8` 的 03 §8 D23 是新的明示衝突裁決：依 02 對 09 的行為委託，保留所有受影響勢力的當日事件反應，廢止早期背景輪詢的八家預算。型別沒有 cursor 不被當作歷史廢止證據。九個不同受侵 owner 的受控 fixture 各在當日產生反應意圖，重複事件及分離快照結果一致；空事件既有 Proxy 測試證明不讀 state。測試安排抵達位置，不宣稱自然模擬產生九場同日入侵。
`e86de08` 的 audit 只承認附 03 §8 決策編號與明示不進 BAL 的廢止註記，並拒絕恢復該常數。614 列、591 個比較值、23 個原始缺名列均保留；排除列為 22，唯一未解問題為人口／石高校準，報告仍失敗。相關本機 70 項、sim3 反應式 9 項測試通過；見 [reactive-retirement](reactive-retirement/)。

`03ab4d3` 找回並保存與舊 BAL `7634217400759e66` 相符的完整歷史來源，重現政策循環原始雜湊。每十日完整狀態、事件及指令與現版比對，只有 saveVersion 3→4 與兩個勢力新增零值 rewardGoldSpentThisMonth 欄位。這些變更對應 16 D18／06 D17 的既定遷移，因此只更新該案例的 BAL 標記與最終雜湊，指令及 finalDay 不變。新測試驗證精確三欄差異，其餘完整狀態一致；全部重放 57 項有 56 項通過，M4 案例仍失敗。歷史來源 archive、逐檔 SHA256、原始狀態及重現指令見 [policy-cycle](../golden-provenance/policy-cycle/)。這不證明其他 golden 的漂移原因。

## sim4 主執行緒記憶體檢查

以凍結 `68e96a6` 在 sim4 NVIDIA RTX 5070 Ti、驅動 595.91.07、Node 22.17.0 執行 headless GPU Chromium。首次執行缺少瀏覽器而失敗，安裝後同一測試通過（29 秒）；兩份紀錄均保存。先暖機十次，再量測二十次 remount，每次 GC 後記錄 heap。資源數量、單一畫布及字型快取保持一致，沒有 WebGL context loss；字型 atlas 為 10、2D context 為 16、BitmapText 為 60。

heap 由 20,639,260 增至 22,322,888 bytes（+1,683,628）；測試沒有 heap bytes 上限斷言，此次通過不證明整體 heap 穩定。這是主頁 V8 isolate，不包含 Worker 或 GPU 記憶體。原始 21 筆數據、日誌、環境及快照 SHA256 見 [remount-sim4](remount-sim4/)。

`125f582` 另修正城下町材質取樣以實際 sceneGeometry 為準；核心平面 geometry 仍獨立用於地理安全驗證。四視圖的湖泊相機、城堡高度及逐屋剛性位移檢查通過，駿府近景的原牆面可見性斷言仍失敗。駿府數據完全未變，清洲的地形位移取樣問題不被用來隱藏此失敗；原始前後資料見 [settlement-projection](settlement-projection/)。必要軍隊名牌覆蓋駿府牆面，art-bible §10 的有界避讓允許殘餘遮擋，目前未改名牌、材質或斷言。

主執行緒快照的指定-before renderer 與 Pixi Application ID 在二十次掛載後均不存在；兩份快照各有一個 renderer、一個 app、237 個 Graphics 及 60 個 BitmapText。這只證明特定舊 ID 沒有留存，不證明沒有其他洩漏。原始快照 gzip 與 shape/root-path 分析 gzip 保存在 remount-sim4，可用 tools/perf/heap-retainers.ts --pair 重現。

`bfa37db` 修正 heap 分析器把 V8 ELEMENT／HIDDEN 的有號數值標籤誤當非負 index 的問題。V8 14.9 serializer、header 及 writer 的直接來源證據保存在 source-proof.json；字串表 index 與 target offset 仍各自嚴格檢查。兩個新回歸在舊程式失敗，修正後 12 項通過；同一對原始快照在舊分析器失敗、修正版成功。

## 本機整合檢查

工作樹完整測試為 668 檔，6,245 項通過、9 項失敗、1 項跳過，耗時 143.48 秒。這輪開始於政策重放更新後，期間另有 heap 分析器及 E2E 分步提交，不宣稱是後續所有提交的凍結候選全量驗收。七項已知核心問題以外，另有事件流程五秒逾時及道路指令雜湊差異。兩個新失敗檔案隨後原樣重跑：事件流程全部通過，道路雜湊仍失敗（合計 8 通過、1 失敗）。原始完整失敗與重跑均保存於 [local-checks](local-checks/)，不將重跑通過改寫為原輪通過。

typecheck、production build 與 bundle budget 通過。第一次 lint 只失敗於四個新增證據 JSON 的格式；原始 bytes 另存 gzip 後已格式化，最終 lint 另行驗證。這些結果不清除核心、藝術或長期平衡 gate。

`ce7cced` 的 M4 重放更新亦保存可重現原始 finalHash 的 harvest 歷史來源。61 個逐日完整狀態的事件及指令一致；首次實際結算差異是第十日的城防整數寫入（07 D54／02），最終六個不同欄位為既定格式／獎賞記帳遷移，以及攻城勝利 30×主將 1.5＝45 的功績與兩項經驗（06 §3.5）。新增測試從原始傷害重新推導整數寫入，並核對完整狀態其餘欄位一致；沒有任意替換記錄的狀態。最終重放 15 檔、58 項全部通過，finalHash 驗證維持原樣。原來源 archive、190 檔 SHA256 及重現指令見 [m4-siege](../golden-provenance/m4-siege/)。當時其他三項 golden、合戰 transcript、B8 及全國繼承不變量仍未清除；後續結果見下方。

## shader 快取修正與原生驗證

`efe734a` 修正私有地形 shader 名稱的永久字串快取成長。新租借配額只在自有 program 銷毀後重用名稱；同時存活者保持不同 program 物件及 key，建構失敗也歸還配額。七個新回歸在原來源全部失敗，修正後含既有控制共 20 項通過。CPU 測試檢查真實 Pixi cache lookup，但不宣稱實際 GL 編譯。

sim4 以精確核對的 714 個 source／tools 檔案跑相同十次暖機、二十次量測的 headless 掛載測試，28.6 秒通過。舊來源的實際私有 shader 字典為 34→74 個鍵，兩個 family 各 11→31 個來源鍵；新來源維持 14→14，兩個 family 各一個鍵，字典 backing 維持 416 bytes。分類程式從實際 properties backing 辨認唯一字典，不以舊 node ID 猜測。

資源與字型快取仍一致，沒有 context loss；原城名牌材質、遮擋、可讀性及河面四項 native 控制亦全部通過（27.5 秒）。另一次採相同啟動參數的原生地圖 probe 確認 Chromium 149.0.7827.55 的 WebGL2 renderer 為 NVIDIA RTX 5070 Ti／Vulkan。這個 renderer probe 是獨立 isolate，不能當作先前 heap isolate 的直接讀值。

主頁 Runtime heap 仍由 20,634,280 增至 22,255,004 bytes（+1,620,724），因此只清除指定字串字典的成長缺陷，不認定整體 heap 已穩定。snapshot self-size 包含 native backing，口徑不同；其 code 類淨增 1,008,624 bytes。保留同一 closure ID 而 code／InstructionStream ID 換新，且對應既有 app／Pixi 原始函式，支持 JIT 暖機或重新編譯的推論，快照未記錄優化 tier。Script 數量 26→26，13 個替換都為 Pixi shader／uniform 生成函式；不支持將主要成長歸因於累積 page.evaluate script。完整前後快照、字典辨認腳本、714 檔 SHA256、來源證據及歸因原始資料見 [private-program-cache](private-program-cache/)。

## 凍結來源最終測試

`f09c8d1` 道路 oracle 改查 exact GraphicsPath 指令與樣式。四組原始／現版、Mac／Linux 的 22 組指令 bytes 完全相同；舊 tessellation 的六個海浪 y 座標跨平台只差 1.421×10⁻¹⁴。未使用四捨五入、容差或 OS 排除。五個故意修改 width、alpha、FAR 幾何、海浪半徑及橋面長度的真正 producer mutation 均在精確 hash 斷言失敗。原來源、向量、SHA256 及反例見 [road-command-provenance](road-command-provenance/)。

`9464873` 的三個 golden 遷移以歷史來源及窄幅逆向控制證明：只回復既定城防整數／攻城功績、治安月結、外交功績及集結接受條件四組機制，2,880 日的完整狀態、事件與已排入／已套用指令即完全一致。唯一 schema 正規化為格式 3→4 及指定勢力確為零的獎賞欄位，沒有刪除非零支出。正式現版 summary 另先比對後才遷移，見 [goldens](../golden-provenance/goldens/)。

`6254f9d` 與 `59a8de3` 保留 B8 的十項 literal hash、非合戰 RNG 斷言及 transcript 初始／checkpoint／最終 hash 驗證。新增完整狀態與 BattleTickResult 比對：十個 B8 tick 只有既定 schema／參戰名冊五項差異；三十個 tactical tick 的完整結果都相同，終結新增勝利 40＋敬畏 20、主將乘 1.5 的 90 功績及兩項經驗。見 [b8](../golden-provenance/b8/)、[tactical](../golden-provenance/tactical/)。

凍結候選 `f446e85` 的完整測試為 672 檔、6,263 項通過、1 項失敗、1 項跳過（129.77 秒）。1,453 個來源／測試／設定檔的前後 SHA256 完全一致；typecheck、lint、production build 與 bundle budget 通過。唯一失敗仍為 s1560 第 450 日齋藤無繼承人滅亡後保留四城十六郡的 INV-02／INV-22，不修改不變量或推測領地接收規則。原始紀錄與來源 manifest 見 [final-candidate](final-candidate/)。全專案及長跑平衡驗收仍未完成。

sim4 最新六項 Worker 原生流程測試全部通過（43.3 秒），三組同步／Worker 的完整狀態與日誌一致。120 日批次最長畫面間隔為同步 1,028.1 ms、Worker 124.9 ms，總耗時為 939.9／2,511.1 ms；正常 x5 在實際自動暫停前完成 29 日，最長間隔為 128.4／84.7 ms，總耗時為 3,544.7／3,594.9 ms。互動阻塞縮短，但批次吞吐較慢，未達穩定 60 FPS。冷啟動、60 日批次及全部原始列亦保留；每種情境各一筆，見 [worker-final-sim4](worker-final-sim4/)。

`d619085` 從真實 CPU profile 定位地理標籤 edge-axis 暫存與快取命中前的候選配置；保留精確運算／候選順序後，25 項原版／邊界測試及 sim4 六項原生流程通過。三組前後完整狀態、日誌、地圖發布與每個地理標籤完全一致。正常 x5 Worker 最長間隔 84.7→60.3 ms，這筆後版樣本沒有 long task；120 日間隔 124.9→108.1 ms，仍不宣稱穩定 60 FPS。另有獨立 profiler 歸因與局部診斷，不混作無 profiler 計時；完整原始資料見 [geographic-allocation](geographic-allocation/)。

`7129f63` 修正零城勢力的普通野戰退出。正式 march／field-combat fixture 在原 source 真實失敗，修正後清除殘軍、職務及追擊引用，survivor 恢復狀態；RNG、功績及經驗不變，滅亡事件先於結局。sim1 八檔 84 項及本機 victory 十五項通過。有效戰術合戰的外部收尾尚無中止／獎賞表示，原 guard 行為保留；其真正失敗的 required-postcondition 診斷原樣保存，不轉為 it.fails 或 skip。見 [field-extinction](field-extinction/)。

包含兩項 source 修正的 `7129f63` 全量回歸：672 檔、6,264 項通過、1 項失敗、1 項跳過（128.82 秒）；唯一失敗仍為 day450 無繼承人領地不變量。型別、完整 lint、build 與 bundle 通過。1,355 個來源／測試／規格／工具／根設定檔逐一符合固定 commit 的 Git blob，測試結束後 SHA256 全部不變；manifest 採集於測試進行中，不宣稱完整涵蓋公開素材或尚未提交的 court-rank E2E。原始紀錄見 [continuation-7129](continuation-7129/)。本次不推進里程碑或清除完整驗收 gate。

## 未修改門檻的原生補驗

`fc45370` 保存凍結 `505d96a` 的 sim2 原生驗證。兩個區域九城的實際結局、繼續遊玩及存檔重載流程通過；不是全國統一結局。色覺／道路土壤復原 gate 仍失敗，完整頁面分別有 11／8 個差異像素，位置都在 HUD 圓角。合法 rAF 內擷取的地圖畫布復原完全一致，完整狀態、日誌及地形資料亦一致；不能據此修改完整頁面 oracle。

40 支實際行軍部隊的額外近景效能診斷仍失敗：30 秒窗口含月度具申自動暫停 3.5666 秒，只前進 29 日。56.40 FPS 僅為失效窗口的描述數值，不能當作效能驗收通過。完整失敗、成功控制、原始像素及 1,389 檔凍結來源 SHA256 見 [native-gates-sim2-505d96a](native-gates-sim2-505d96a/)。這組來源早於野戰退出修正，不宣稱涵蓋之後的全部提交。

`38d22b0` 補齊 M6-18 的實際具申生命週期。既有 720 日 fixture 第 30 日自然產生提案，第 31 日由 CommandQueue 正常採納，實際出陣、功績及忠誠獎賞均確認，第 60 日清理；未額外注入提案或先決條件。原有死亡、登場與每日不變量驗證保留，並確認未付俸祿事件。sim1 的 20 項測試及型別／lint 通過，從 238 檔精確來源 archive 再執行亦通過；原始 RED／GREEN 與完整事件見 [m6-lifecycle-acceptance](m6-lifecycle-acceptance/)。同目錄的逐項 M6 matrix 保留未完成驗收，未推進 checkpoint。

延長掛載診斷兩次在第 41 次總掛載失敗，第二次明確記錄地面材質不可用。原始 trace 的最後一組十二個素材請求在 response 內含 net::ERR_FAILED，雖名義 status 為 200；不是已證明的 shader 生命週期缺陷。兩次皆未完成 120 次量測，沒有 after heap，不能認定整體記憶體穩定。未修改門檻或加入重試；原始紀錄及 714 檔來源比對見 [extended-remount](extended-remount/)。

`8c0de41` 的 sim3 原生官位流程以正常朝廷工作取得恩惠：第 150 日累積 23，第 151 日排入授予指令後正常結算，金錢 1,604→1,304、威信 450→500，恩惠維持 23；UI 官位、下一級禁用條件及原生存檔重載的完整 codec 狀態一致。149 次 RAF 日結之外另有兩次合法事件選項結算，未強制注入日數、恩惠或官位。相關現版 source bytes 與凍結 `505d96a` 一致；四次觀測失敗與成功的完整原始資料見 [court-rank](court-rank/)。

具申驗證後再次全量回歸 6,264 通過／1 失敗／1 跳過（123.77 秒），唯一失敗仍為第 450 日無繼承人領地問題。型別、完整 lint、build 及 bundle 通過，1,355 個 manifest 檔案符合固定來源且結束後不變；見 [continuation-38d22b0](continuation-38d22b0/)。

## 圖片載入修正與最新整合證據

`ffcf964` 新增七項外交驗收，檢查十二個月的感情變化、敬畏的外交影響及 59.9／60 的接受邊界。四種隔離的錯誤修改都在原斷言失敗；沒有修改 BAL 或核心公式。完整原始控制與來源見 [m6-diplomacy-acceptance](m6-diplomacy-acceptance/)。

sim2 的獨立控制將延長掛載失敗定位至 Pixi 圖片 Worker 的 Blob 傳送路徑：Blob-only 在 trace／cache 四組控制都約第四十輪失敗，ArrayBuffer-only 與逐輪回收 Worker heap 的 Blob 控制則完成七十輪。原始反例、先前無效控制及完整來源均保存，不能把推論當作 Chromium 內部配額的直接測量；見 [blob-worker-transport-sim2](blob-worker-transport-sim2/)。

`2cfb2d6` 在共同素材載入入口設定 `preferWorkers: false`，保留非同步 ImageBitmap 解碼及獨立模擬 Worker。`29da33d` 的三項回歸使用實際 Pixi 8.19 parser，驗證原 Worker 路徑控制與兩種 alpha 選項；故意恢復 Worker 偏好會使兩項回歸失敗。這些是 parser 的受控解碼測試，原生瀏覽器證據另列；見 [asset-bitmap-parser](asset-bitmap-parser/)。

正式載入來源在 sim4 完成十次暖機及一百二十次量測，共一百三十次掛載；資源、字型快取及 context loss 斷言全部通過。sim2 移除逐輪人工 GC 的獨立控制也完成同樣掛載。sim4 的一百二十一個 GC 後主頁 heap 樣本由 20,890,576 增至 25,438,644 bytes，最後二十個樣本仍淨增 348,632 bytes，故不宣稱整體 heap 已穩定。完整快照與原始 bytes 見 [main-blob-final-sim4](main-blob-final-sim4/)。

最終六項原生 Worker 測試、四項原視覺控制均通過。同步／Worker 的完整狀態、日誌及前版地理標籤資料精確一致。暖機後一百二十日批次最長畫面間隔為同步 982.6 ms、Worker 101.1 ms，總耗時為 926.3／2,469.5 ms；正常 x5 的最長間隔為 106.8／61.6 ms，Worker 沒有 long task，但月底具申正常暫停，只推進二十九日。各情境各一筆，不宣稱批次吞吐改善或實際戰役穩定 60 FPS。

規格要求的二十支移動部隊、1080p、三十秒平移／縮放渲染測試原樣通過，P95 畫面間隔 16.8 ms，符合 55 FPS 門檻。這是合成 renderer 工作負載；四十支真實部隊的額外診斷不是規格指定的 M6 渲染 gate，全國約一百二十支部隊的 60 FPS 目標仍未證明。原規格對照與具申暫停原因見 [live-close-workload-audit](live-close-workload-audit/)。

凍結來源 `29da33d` 的最新完整測試為 674 檔，6,274 項通過、1 項失敗、1 項跳過（116.46 秒）。唯一失敗仍為 s1560 第 450 日無繼承人滅亡後保留四城十六郡的 INV-02／INV-22。一般／core 型別、完整 lint、build 及 bundle budget 通過；1,357 個已追蹤來源／測試／規格／工具／設定檔符合固定 Git blob，測試後 SHA256 不變。早期未完成 parser 測試的型別失敗原樣保留，沒有改寫成當時通過；見 [main-blob-final-regression](main-blob-final-regression/)。尚未推進全專案 checkpoint，領地接收及戰術外部收尾規則、整體 heap、藝術與長跑平衡驗收仍待完成。

## GPU 資源清理與全國地圖效能（最新）

`fe37e4c` 修正 Pixi 8.19 自有 GPU manager 的 unload listener 清理；其他 owner 及使用者 callback 保留。原生一百三十次掛載後，舊版累積的 14,212 個已失去 renderer 的 callback 消失，現存 manager callback 維持 430。`e25381b` 另在自有 texture batch BindGroup 銷毀時移除其全域快取項，避免取回 resources 已清空的物件。原生相同掛載控制的指定 group shape 維持 24 個（23 個存活、一個空 resources），不再由 120 增至 1,560。

兩組修正各有原來源失敗控制、實際 Pixi 單元測試、四項未修改的原生視覺控制及完整快照。最新主頁 heap 仍由 20,604,640 增至 24,374,172 bytes，末二十次淨增 155,208；不能宣稱整體記憶體穩定。不同原生輪次不是精確 heap 減量比較。證據見 [manager listener](managed-resource-listeners/)、[BindGroup cache](batch-bind-group-cache/)。

`8cdd7db` 以局部範圍減少軍隊名牌碰撞計算，`dec6b8a` 移除道路線段／矩形距離計算的暫存陣列與點物件。兩者保留原算式、候選順序、判斷門檻及輸出；凍結原版 reference、隨機／邊界案例及九份原生完整發布資料精確比對通過。道路相關 33 項測試通過。

下表為 sim3 同一隔離 GPU、相同 dependency bytes、1080p、一百二十支合法部隊、三十秒 renderer 控制的各一筆觀測。策略日結暫停；不是連續實際戰役或實體螢幕驗收。

| 視圖   | 原版 FPS／P95 ms | 軍隊名牌優化 | 道路距離優化 |
| ------ | ---------------- | ------------ | ------------ |
| 全景   | 38.73／27.1      | 59.61／17.6  | 59.87／17.6  |
| 操作景 | 25.91／42.5      | 42.98／25.3  | 42.81／25.5  |
| 近景   | 16.34／78.1      | 18.49／70.3  | 23.99／50.4  |

所有嚴格 60 FPS 控制仍失敗；道路修正沒有改善操作景。原始失敗、CPU profile、來源及 canonical/resource SHA 見 [原版 120 部隊](national120-target/)、[軍隊名牌範圍優化](national120-broadphase/)、[道路配置減量](road-capsule-allocation/)。sim3 這組比較保留原 dependency，未混入 sim4 的新 GPU cache 修正，因此不宣稱最新所有改動的組合效能。

`f1082f5` 的同環境空白 GPU canvas 三十秒控制為 60.003 FPS、P95 16.8 ms。04 的原文要求穩定 60 FPS，P95 ≤1000/60 是目前 120 部隊診斷額外採用的方法；空白控制也未通過後者。這不清除遊戲平均幀率失敗、不修改門檻，也不證明環境硬性上限。最新獨立 close profile 以 canonical/resource 前後實際 SHA 確認不變，下一個熱點是地理標籤及城名牌；見 [cadence 與 profile](national120-cadence-audit/native-README.md)。

## 自然取得的流程與介面驗收

`ccdc409` 的原生旅程從正式新局自然產生第 30 日具申，透過實際 UI 採納／拒絕，再於第 31 日正常指令日結出陣及發給既定功績、經驗與忠誠獎賞。故意把採納改為拒絕的反例失敗；完整狀態及指令見 [自然具申](earned-proposal-native/)。

`6430a8b` 與 `fa43b73` 完成三好玩家自然取得對武田信用的 CPU 第 0–300 日、公開 native save 匯入及原生第 301–332 日旅程。原生 UI 成立同盟，隨後合法請求對長尾援軍；武田按既定 AI 拒絕，未派兵。這符合 M6 指定的「武田同盟後請求援軍」互動，不能宣稱成功軍事支援或全程原生第零日重放。codec 省略的 AI 診斷 log 明示核對，其餘匯入狀態精確一致。早期錯誤 selector 及 envoy 日期斷言保留；見 [完整旅程證據](earned-takeda-native/)、[先前路徑診斷](takeda-route-feasibility/)。今川自然引拔流程已由後續 CPU240／native60 旅程補齊，見下方與 [完整證據](earned-imagawa-native/)。

`1575bc8` 修正 dialog 內裝飾 header 的 landmark 語意，保留真正標題、dialog label、modal 及焦點契約。原生 accessibility、既有四項視覺控制與 gallery 控制通過；見 [dialog](accessibility-dialog-sim2/)。空槽文字的獨立原生取樣實際對比為 7.098，完整重現序列無相同 color error；舊 axe 報告仍保留，原因未確認，不將其宣稱為已證實的誤報；見 [對比控制](accessibility-contrast-controls-sim2/)。

素材驗證為零 error／warning；首載素材預算通過。最新三個 LOD 的 drawable layer 通過，但三張 Linux protected screenshot 仍分別有 186,777／270,334／291,556 個差異像素，原六張基準及容差均未修改。實際畫面與既有藝術基準的大幅差異仍需審核，不能由 layer 通過清除。見 [素材與 M6 ledger](m6-asset-acceptance-ledger/)、[最新原生視覺](latest-native-visual-sim2/)。

## 最新固定來源全量回歸

`6430a8b` 的 1,471 個 tracked source／test／tool／spec／config 檔在測試開始前逐一符合 Git blob，結束後 SHA 不變。679 檔中 677 通過、1 失敗、1 跳過；6,293 項通過、1 失敗、1 跳過，耗時 121.28 秒。唯一失敗仍為 day450 無繼承人勢力持有四城十六郡的 INV-02／INV-22。這份 manifest 不涵蓋 public assets、dependency 或稍後新增的 native tail；後者另有自身型別、lint 及原生驗證。

[固定來源完整紀錄](continuation-6430/) 保留全部原始輸出。[較早整合](continuation-fe37/)、[事件流程逾時及原樣重跑](continuation-8cdd/)、[尚未完成日期 fixture 的混合來源失敗](continuation-dec6-mixed/) 各自保留原輪 verdict，不以後版成功改寫。領地接收、戰術外部收尾、人口校準、完整長跑平衡、整體 heap、120 部隊效能及藝術 gate 仍開啟；未推進 checkpoint 或部署。

`a381b7d` 另提交固定障礙物邊界索引，保留 exact edge arithmetic、Set 最終排序及 placement cache signature；超大有效座標仍 full scan。33 項 reference／cache／邊界測試與 scoped lint／格式通過；初輪型別通過，後輪被平行開發中未提交的 earnedImagawa fixture 型別錯誤阻擋，完整原始失敗保留。sim3 九份原生觀測精確一致，120 部隊 FPS 控制仍進行中，未宣稱新效能收益。見 [本機來源與控制](geographic-edge-index-local/)。

地理邊界索引的後續三視圖觀測為 57.59／42.91／24.14 FPS，均未達門檻，也沒有支持明確整體收益。獨立 close profile 的 edge-axis self 成本下降約 26.5%，整體 geographic layout inclusive 僅下降約 1%。因此 `8f8319b` 撤回 `a381b7d` 的 runtime 索引及實驗測試，完整來源提交及本機／原生證據保留，不以單一熱點數字宣稱遊戲改善。

`043b561` 的自然流言／引拔 CPU 旅程與 `e207b4d` 的原生 UI 尾段通過：三好從正常新局取得第 240 日 checkpoint，公開匯入後，實際調略表單支付 1,000 貫；第 241–300 日完整 persistent state 逐日精確一致。由比的真實引拔敗露仍保留，三浦正俊第 300 日正式移籍並在家臣列表／詳情可見。這補齊指定今川引拔互動，不清除完整長跑、全國結局或其他 M6 gate；完整證據另存。

## 撤回後的現行來源與下一個 Rust 邊界

`e72bde9` 撤回城名牌 zero-objective 實驗；其三視圖為 59.90／44.20／23.86 FPS，全部未達嚴格 60，close 沒有改善。單次 profile 的 normalized castle inclusive 僅下降約 3.35%，不足以支持整體收益；self attribution 變化不被當作實際回歸。完整候選來源、精確觀測及失敗見 [城名牌本機控制](castle-ribbon-zero-local/)、[原生控制](castle-ribbon-zero-objective/native-README.md)。地理索引的撤回與原始計時見 [原生地理索引](geo-edge-index/native-README.md)。

撤回後固定 `e72bde9` 的全量為 680 檔，678 通過、1 失敗、1 跳過；6,294 項通過、1 失敗、1 跳過（127.49 秒）。1,469 個 tracked inputs 在開始前符合 Git blob，測試後完全一致，也與目前 main 的對應來源一致。型別、完整 lint、production build、bundle budget 通過；唯一失敗仍為 day450 無繼承人領地 INV-02／INV-22。來源 manifest 不涵蓋 public、binary outputs 或 installed dependencies，隔離 checkout 使用現有 node_modules symlink。見 [現行固定來源](continuation-e72b/)；實驗版 6,300 通過的完整原輪亦保存於 [固定實驗版](continuation-6795/)，沒有把已移除的六項測試冒稱為現行測試。

Root 另獨立執行 [自然今川證據驗證器](earned-imagawa-native/verify-evidence.py)，CPU／public import／全部六十日 persistent state 與 RNG、真實敗露及正式仕官皆通過。這是自然取得的 CPU prefix 加 native tail，不宣稱全部三百日原生 UI 重放。

下一步只做 Rust 邊界的唯讀分析：geographic cache-miss 評分可先保持 JS 候選順序與 signature，再以 f64 arena 回傳勝出 offset index；castle 完整純規劃則可保留 UI 量測、compact admission 及 visibility 在 JS。現有 WASM 只在 simulation Worker 初始化，render 必須有獨立主執行緒 instance／生命週期，不能假設逐標籤 Worker 訊息免費。必須保留 JS min/max 的 NaN／signed-zero 行為、運算及加總順序、capsule fail-closed、work budget；計入 packing／跨 ABI／整體 render 成本後才採用。尚未實作或宣稱收益。

## 實際 Rust 地理評分與固定來源整合

`7288d16`／`e8693f4`／`fb9fd7f` 加入零第三方依賴的 Rust 地理評分核心，正式 renderer 在快取失效時使用獨立主頁 WASM 實例。JavaScript 保留驗證、排序、候選生成、快取與 UI 量測；模擬 Worker 的 pathfinding 實例與記憶體獨立。初始化失敗會進入既有錯誤邊界，卸載會取消下載並釋放實例 arena；沒有失敗後靜默改回同步核心。這是擴充純數值邊界，尚未證明大幅改善幀率。

Rust 九項、19 檔 262 項關聯測試通過。實際已編譯 WASM 與凍結 JavaScript reference 比對 320 個 seeded 場景、快取轉換、epsilon、signed zero 及十一個有效極端場景，保留完整輸出。兩輪 helper URL／跨 realm ArrayBuffer 失敗修正及初始非法 fixture／clippy 失敗均保留，見 [geographic-wasm-local](geographic-wasm-local/README.md)。該輪 AST checker 的 35→0 僅涵蓋直接建構 renderer 的 unit 接點。

第一輪固定 `fb9fd7f` 全量為 6,287 通過、34 失敗、1 跳過，另有 17 個未處理錯誤。它找出二十個間接建立 MapCanvasHost 的元件 fixture 尚未注入實際 WASM。`9e49cc9` 補齊這二十個接點，不修改原有行為斷言；175 項相關測試通過。第二版 AST checker 的間接接點由 20→0，已知混合註解的控制精確報告一個缺漏。

固定 `9e49cc9` 全量為 683 檔：681 通過、1 失敗、1 跳過；6,320 項通過、1 失敗、1 跳過，126.96 秒。全部 1,477 個 tracked inputs 在前後符合 Git blob 且 byte-identical；scope 不包含公開素材、二進位輸出或安裝依賴，checkout 共用既有 node_modules。型別、完整 lint、正式 build 與 bundle budget 均通過；完成後全部 1,477 個 inputs 仍不變。唯一失敗仍為 day450 齋藤無嗣領地 INV-02／INV-22。原始首次失敗與後輪完整紀錄見 [geographic-wasm-integration](geographic-wasm-integration/)。

[geographic-wasm-native](geographic-wasm-native/native-README.md) 保留相同 sim3 舊依賴群的九份完整發布比對，全部 exact；三個單次 120 部隊、1080p、三十秒窗口為 59.96／43.17／24.47 FPS，P95 17.4／25.3／48.8 ms，全部仍失敗。close 比上輪 23.99 FPS 的單次變化不足以證明穩定收益；獨立 profile 的地理布局 inclusive 約 14.70→14.59 ms／render。V8 export-index 比對確認實際執行 Rust，但不將實際執行視為效能驗收。

[geographic-wasm-worker-sim1](geographic-wasm-worker-sim1/README.md) 使用完整 2,814 檔固定來源、fresh npm ci 及當前 23 個 Pixi patch。Mac／Linux 二進位與 manifest byte-identical：27,147 bytes，WASM SHA256 `2f4bde5fab04903790ccc28e507ef2ccd1dd8df8bc9f8de2a4491ff71ca263df`。原六項 Worker 測試為五通過、一失敗；失敗案例的完整局面、日誌與實際 Rust 回覆先通過，之後當前 generation 的 readiness 為 false。原 trace 證明暫停取消第四個 posted tick 後建立新 Worker；新實例尚未初始化，不能以歷史 Rust 使用紀錄偽裝為當前 ready。此輪不宣稱六項全綠。

地理 Rust 邊界目前保留，後續將評估完整城名牌純布局與實際 Worker 啟動初始化。既有 60 FPS、whole-heap、protected art、長跑及核心領地 gate 均保持開啟。

## 完整城名牌 Rust 核心與當前世代 Worker 就緒

`ce827fe`／`671602a`／`04c7b60` 將完整城名牌純布局接上正式 renderer。Rust 處理候選軸、完整搜尋、碰撞／引線限制、最終診斷及既定一百萬 work budget；JavaScript 保留原驗證、UTF-16 優先排序、量測、快取與精簡字牌 admission。Castle 與 geographic arena 共用同一個主頁 WASM 實例，與模擬 Worker 分離；兩個 arena 在 memory growth 後更新 view，destroy 各釋放一次。缺少 castle ABI 會在建立 Application 前失敗，沒有靜默 JavaScript fallback。

Rust 十一項、337 組完整 f64 原版 oracle、13 項實際 WASM／協定測試（含 320 seeded scenes）、33 檔 386 項 renderer／主畫面接點測試及三項真實雙 arena 生命週期測試通過。ABI、欄位／工作數／signed zero 逐一比對。證據審核發現一處測試來源註記不精確：原 oracle 321／322 是同號零值，永久測試是混合符號；另用凍結 JavaScript 獨立產生兩筆控制，全部十六欄與 work 472 相同。`2bdb1f3` 只更正註記與產物來源 manifest，程式、輸入與預期不變，63,073-byte WASM 與 `04c7b60` byte-identical，SHA256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`。原始 CWD、clippy、型別化 instrumentation 失敗均保存於 [castle-wasm-local](castle-wasm-local/README.md)。

固定 `04c7b60` 全量為 686 檔：684 通過、1 失敗、1 跳過；6,357 項通過、1 失敗、1 跳過，133.48 秒。1,485 個 tracked inputs 在測試及所有檢查後符合固定 Git blob 且 byte-identical；型別、完整 lint、正式 build 與 bundle 通過。唯一失敗仍是 day450 無嗣領地 INV-02／INV-22。後續註記更正使目前 main 的一個 tracked Rust test 檔案不同，public manifest 位於本項 scope 外；不將此固定全量改稱為更正來源的重跑。

`c613747`／`71d1eaf` 讓每個新 Worker 立即初始化 Rust，真正 ready ACK 屬於當前實例與 epoch；tick 仍立即 posted。舊世代 ready／error、取消及卸載不能復活 backend；初始化失敗回報既有 fatal 邊界。`waitSimulationIdle` 排空 pending day 後加入當前世代的真實就緒等待，所有 reset 共用單一 deadline。65 項相關測試通過，舊 bridge 對新增控制的反向測試為七失敗／九通過，沒有未處理 rejection；原失敗與來源見 [worker-epoch-readiness-sim1](worker-epoch-readiness-sim1/README.md)。

[worker-ready-castle-sim1](worker-ready-castle-sim1/README.md) 以完整 3,068 檔固定來源、fresh npm ci／23 patch 執行原六個 native Worker 案例，一次全六通過（2.1 分鐘）。完整 persistent state、RNG、日誌、保存／重載及取消精確一致；原先失敗的 current-generation ready 斷言現在通過，沒有放寬。Normal x5 真正只前進 29 日後自然月報暫停，不能宣稱完成 60 日。這輪 120 日 Worker wall 17.038 秒，sync 0.957 秒；最長主頁 long task 207／956 ms，整體 batch 仍較慢，不能把較短單次阻塞視為結算吞吐改善。

新的 [current23 baseline](geographic-wasm-current23-baseline/README.md) 使用 fresh locked dependencies、全部 23 個 Pixi patch，與舊依賴群分離。[castle same-cohort controls](castle-wasm-current23-native/README.md) 共用這份完整 14,765 檔依賴，前後 SHA 不變；1,404 個新來源／公開素材／設定同樣固定。九份完整發布與原 reference byte-exact；三個三十秒、120 部隊、1080p 控制各執行一次，結果如下。

| Camera      | Current23 baseline FPS | Combined runtime FPS | Baseline P95 | New P95 |
| ----------- | ---------------------: | -------------------: | -----------: | ------: |
| Overview    |               59.83336 |             59.93091 |      17.7 ms | 17.5 ms |
| Operational |               42.93288 |             49.73817 |      25.5 ms | 22.0 ms |
| Close       |               24.61326 |             29.11552 |      48.7 ms | 41.5 ms |

操作景與近景的單次觀測改善 15.85%／18.29%，全部仍未達嚴格 60 FPS。來源也包含 Worker ready 與共用 WASM owner，不能當作只有 castle kernel 的因果實驗；策略日結暫停，不證明實際連續戰役。唯一獨立 close profile 有 290 次完成 render（289 intervals）、零 driver tick、實際 canonical／resource 前後 SHA 相同；castle Rust 約 3.22 ms／render，JS planner self 約 0.043 ms，後者 inclusive 包含 Rust，不能說全部是 packing。Geographic layout inclusive 仍約 14.36 ms／render；舊依賴 profile 不作公平定量對照。

本階段保留完整 castle Rust 邊界與真正 Worker ready。原 functional suite 使用 default headless flags，沒有記錄歷史 GL identity；後續同設定的新頁面確認 SwiftShader，不能把 17 秒直接當作硬體 GPU 的結果。獨立 profile 記錄 120 日核心 compute 合計 649.2 ms，但主頁 `(program)` 區段仍未歸因；硬體身分受控的對照另行診斷，原六項結果、普通 FPS 與帶 profiler 數字分開。60 FPS、whole-heap、protected art、長跑及核心領地 gate 都未清除，完整專案 goal 保持 active。

## Worker batch 診斷結果與限制

[sim1 成本診斷](worker-batch-overhead-sim1/README.md) 的唯一 default-headless profile 通過完整第 121 天 state／RNG／log 比對；核心 compute 合計 649.2 ms，但 13.296 秒 step 的主要 `(program)` 區段仍無可歸因 stack。另頁確認同設定為 SwiftShader；硬體預檢只有 llvmpipe／WebGL null，guard 在 profiler 前停止，硬體 batch captures 為零。Linux 原 pinned Rust recipe 產出的 WASM 與固定 Mac binary／manifest byte-identical。

[sim3 硬體診斷](worker-batch-hardware-sim3/README.md) 的前後實際 WebGL2 都確認 RTX 5070 Ti Vulkan。原 trace 記錄 120 日 step 已完成（3,061.800 ms）、idle 0.100 ms、120 replies 的核心 compute 合計 680.900001 ms；但外部完整交通擷取在原 60 秒 timeout 結束，最後 synchronous-reference assertions 未執行，整個診斷保留失敗。Observer 每次 structuredClone 完整 reply，另有 profiler 開銷；它和 sim1 同時存在主機、GPU、observer 差異，不能當作單一因素效能比較或一般吞吐結果。完整大型 trace／交通資料留在遠端，路徑、大小及 SHA 保存於各包，未宣稱全部已進 Git。

兩包新增證據已加入 artifact SHA 索引。原六項 Worker 功能通過、三組 FPS 未達標與最新固定全量結果保持不變；本次診斷沒有修改 production source、門檻或依賴。下一步需以輕量 metadata observer 定位硬體主頁成本，再處理 geographic preparation 熱點；全專案 goal 仍 active。

[sim3 輕量診斷](worker-batch-lightweight-sim3/README.md) 改為只讀 reply scalar metadata，不複製整個回覆；一次通過原 60 秒 timeout，warm1／final121 完整 state、RNG、日誌與同步 reference 比對先完成，再輸出觀測。前後 actual RTX Vulkan 與固定來源／依賴驗證通過。帶 profiler 的 120 日 step 為 2,525.4 ms、核心 compute 合計 649.700002 ms；主頁 reconcileValue self 350.997 ms。Post、receive 與 compute 區間重疊，不相加，也不把 callback 的 native deserialize 費用全算成新增 observer 成本。此值仍為診斷，未重跑一般 FPS 或原六項 suite，前次完整 clone 的失敗維持不變。

## 地理候選軸合併掃描：固定來源回歸

`5224c06` 將地理標籤 X／Y 候選軸合併為一次 reservation 掃描，保留每軸四個原運算、Set 插入、f64／signed-zero、排序及 cap16。未改 Rust ABI、工作上限或快取 signature。五個新測試使用 SHA 固定的舊演算法觀測完整 preparation，與實際 WASM 的全部輸入、輸出及快取統計比對；320 seeds／快取轉換／十一個有效極端值通過。原 parse-stage 失敗、最後三檔26項通過、型別／lint／格式及固定全量見 [local evidence](geographic-fused-axes-local/README.md)。

固定 `5224c06` 的完整回歸為687檔：685通過、1已知失敗、1跳過；6,362項通過、1無嗣領地失敗、1跳過，131.34秒。1,486 tracked inputs 在測試及全部檢查前後符合Git blob且 byte-identical，既有 node_modules 為共用 symlink，不是 fresh dependency 驗證。完整型別、lint、正式build與bundle budget通過。原生效能仍在獨立測量，本段只證明行為回歸，不能證明候選有整體收益。

[Worker transport 唯讀審查](worker-transport-source-review-sim1/README.md) 保存 day1／day121 compact JSON 與樹遍歷計數、原 producer及來源SHA。JSON約0.77／1.04MB不是實際 structured-clone wire bytes；樹計數不是唯一alias graph計數。Reply.state與result.state共享物件，不能當兩次完整複製。版本相同不能推論內容不變；未加入事件目錄 identity cache、略過物件合併或未量測的 primitive inlining。

## 合併掃描候選撤回與現行來源

[固定5224原生結果](geographic-fused-axes-native/README.md) 的九份完整發布仍byte-exact，三個原三十秒窗口各執行一次。全景59.93826、操作景50.20458、近景29.20631 FPS，相較固定04同依賴的單次差異為+0.012%／+0.938%／+0.312%；strict60全失敗。各自RTX Vulkan guard通過。獨立close profile為288完成frames／287intervals，canonical／resource前後相同；JS地理布局inclusive14.37164ms/frame（原14.36233），候選軸inclusive3.87181（原3.84558）。Sort callback是parent children，不重複加總。沒有足夠整體收益證據，`3d6a953` 撤回合併掃描，原setup失敗與全部測量仍保留，沒有重試挑數字。

[撤回後固定來源](geographic-preparation-restored-local/README.md) 保留五個新完整preparation比對測試，改為一般名稱；地理layout原碼與04 byte-identical。固定3d6全量687檔、6,362通過／1已知無嗣領地失敗／1跳過，128.23秒；1,486 tracked inputs 在測試與全部checks後符合Git blob且byte-identical。完整型別、lint、build（4.20秒）及bundle budget通過。獨立producer證實八份emitted JS／CSS與63,073-byte WASM和本機固定04建置逐byte相同；範圍不含source maps、其他public assets、manifest metadata或dependency trees，也不是新FPS驗收。

本階段新增輕量硬體Worker診斷、完整準備參數回歸與撤回證據，沒有保留無明確收益的微優化。現行Rust castle／geographic score與Worker架構維持；下一個候選是將快取判斷前的數值準備移入Rust，JS保留排序、原物件metadata、JSON signature與所有權。它尚未實作或測量，仍需完整準備參數與兩種容量路徑的精確比對，再用原生整體效能判斷。原60FPS、whole-heap、protected art、長跑及領地gate維持未完成；全專案goal保持active。

## 地理數值準備 Rust 正式接點

`0172724`／`9ed1470` 新增獨立 preparation ABI，`f6700ce` 實作實際 WASM adapter，`feab20c` 將一般 layout 正式接入；既有評分算術與 JS metadata／排序／簽章保持。CAPACITY 在配置前選定，只保留原 JS preparation＋實際原 Rust scorer，不能遮蔽 ABI 或執行錯誤。

[独立原版 JS oracle](geographic-preparation-oracle-sim3/README.md) 保存完整 255,263,393-byte raw與1,964frames，沒有使用新 Rust 推導預期值。Producer 完成 raw 後在 manifest-copy ENOENT 結束，原作業仍RED；後處理不重跑。Root獨立驗證完整raw／source／producer pins及全部counts通過。

[容量證據](geographic-preparation-capacity-sim3/README.md) 由原九完整native geography與真正8192／32768合法遠障礙得出。正式provider設定131,072words／1MiB frame＋prep常駐預算，native最大35,008bytes；8192走新核心，32768走CAPACITY，兩模式實際compiled整合均exact。預算排除road、舊scorer、換代暫存、WASMpages及JSobjects，不是wholeheap限制。

[本機固定來源證據](geographic-preparation-local/README.md) 保存Rust23項、320seedadapter、兩模式各160seed、33原renderer/UI fixture386PASS及全部原RED。固定feab20c全量691files／6392PASS／1knowns1560day450FAIL／1skip，129.87s；1494trackedinputs前後與全部checks後符合Gitblob且byteequal。完整types／lint／build／bundlePASS，共用node_modules不是freshdependency验证。WASM88475bytes SHA256 `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`。

同current23依賴與actualRTXVulkan的三個單次30秒窗口為59.95983／49.88502／32.03923FPS，相對04同cohort分別+0.048%／+0.295%／+10.04%；closeP95從41.5降至37.2ms。九完整payload仍exactaf4，strict60全部RED。[完整原生證據](geographic-preparation-native/README.md) 的唯一 close CPU profile 為323完成renders／322intervals，geo inclusive11.6128ms/render（原14.3623，約-19.1%）。prepare inclusive3.599、scorePrepared inclusive7.282、signature self0.589均在parent內，不重複加總。ActualRTX前後與1413source／14765deps／23patch三次proof通過；root獨立package verifier通過。較廣區間cache41735computed／121reused不按profileframe數正規化。不把局部kernel速度或一輪差異當成穩定達標。正式接點擴充數值核心，模擬仍是JS Worker序列日結；全專案goal維持active。

[Linux 重建證據](geographic-preparation-linux-sim1/README.md) 以原 pinned1.97.1 recipe 一次建置新WASM，binary與manifest皆與Mac逐byte相同；733source rows前後與固定Gitblobs一致、四個actualABI版本1。依賴沿用04群組，不宣稱freshnpmci。Root獨立verifier含Gitproof通過。新增本機、Linux、原生證據加入append-only索引，既有raw與全部原始RED不變。

下一個 bounded 候選是評分時的矩形邊界重用：準備及評分成本主要歸在內部WASM，而完整JSONsignature仍保留。此候選只有唯讀研究，尚未實作或量測；禁止提早將不相交overlap視作零，因溢位／NaN／signedzero可能改變結果。

## 評分熱點與下一個有界候選

[既有 profile overlap 分析](geographic-score-overlap-profile/README.md) 將 unnamed function44 推定為原 overlap：own1,249,004us／1188samples，占scoreWASM own53.49%。這是actualinstruction/source模式推定，binary沒有name／DWARF；不證hard或reserved單一loop主導。Root獨立verifier核對parentraw／sourceblobs／反組譯與每個samplecounts通過，沒有新增timing。

[Strict SIMD算術probe](geographic-score-simd-probe/README.md) 的884byte實際WASM對原JS／scalar871200cases一致，保留nonNaN bits與NaN class；helper輸入也含刻意非合法packet的值。沒有game／browser／FPS驗收，也未更動正式artifact。

[Endpoint scratch完整證據](geographic-score-endpoints-local/README.md) 保存candidate與baseline兩完整WASM、實際helper永久test及完整10,986,065-byte compiledraw。1169294算術grid＋40ULP／epsilon／touchcases、24Rust、1925compiledpackets通過；原RED與原build／commands保留。

`c2302c4` 只在prepared scorer重用candidate的原式x+width／y+height，後續+padding含+0仍執行，sharedlegacyoverlap／caps／JS／Worker不變。Root正式build與24Rust／Clippy／fmt及11files80actualWASM測試通過。Candidate89761bytes SHA69af4226d451a71211b209101cc4223045b1aeca2f1178d16e9beaa91166b736，原feab88475SHA642保留為公平對照。這些是focused驗證，不冒充新全套。

[固定c230原生證據](geographic-score-endpoints-native/README.md) 的nine完整af4仍一致；原three30秒窗口各一次，overview59.93850／operational50.04925／close31.74741，相對feab-0.0356%／+0.329%／-0.911%，strict60全RED。唯一closeprofile320renders／319intervals，geo parent11.764675ms（feab11.612774，+1.308%），WASMscore7.346244ms（feab7.229238，+1.618%）；推定新overlaphelper own3.88121ms／render未較原3.86689下降。全部RTXpre/post／source1524／deps14765+23／canonical-resourceproof通過，setup提前scpRED保留。沒有明確整體收益，`45a5384` 撤回四個source/artifact檔案，保留全部candidate來源與原raw。

Root另核對撤回後1494trackedruntime/test/config輸入逐byte等同feab全套的beforeinventory，兩個publicWASM／manifest也與feabGitblobs一致；freshwasm:check通過。這是來源／產物一致證據，沒有新FULL或FPS重跑。最新FULL6392／1known／1skip仍明確歸屬feab，沒有擇優重跑微優化。

[完整 SIMD 核心隔離證據](geographic-score-simd-kernel-local/README.md) 以原acceptedscalar為基準，實際88469-byteprototype與原88475baseline的2121compiledcases一致，另24malformedatomiccontrols通過；完整11412888-byte raw保存。Native23只證scalarreference；strict SIMD反組譯與sourcebinding另行核對，未改sharedlegacy／caps／prep。Root獨立verifier通過。

[Chromium tinyprobe證據](geographic-score-simd-browser/README.md) 實際fullChrome149 validate true，100352grid＋5explicitcontrols一致；default-headless與fullbinaryGREEN分開保留。只有4gridrows＋5controls結果留存，沒有完整逐案例stream或Safari／GPU／FPS／game結論。該次未測FF／WebKit。Root14raw pairs驗證通過。

[Firefox／WebKit 完整數值驗證](geographic-score-simd-cross-engine/README.md) 各自通過原scalar642與隔離SIMDprototype4ba的2121compiledcases及24malformedatomiccontrols，保存完整before／after bits及NaN分類。兩個引擎皆接受strict probe與完整產物。WebKit不等於Safari產品驗收；本證據不涵蓋新雙產物57b04／0edab、完整遊戲或FPS。Root獨立verifier通過，27檔加入索引。

[固定 SIMD 原生驗證](geographic-score-simd-native/README.md) 在 `f898ac9` 完成 original9 的 af4 完整 payload 比對與原六項 Worker E2E；實際請求新 SIMD88392-byte／0edab 產物。原三個30秒視角各一次為59.8635／49.9103／30.8998 FPS，strict60皆RED；close比同cohort feab下降3.56%。第一 body collector 錯誤保留，僅修正外部收集器後恢復，FPS沒有重跑。Root獨立verifier通過全部71raw pairs、source1528／deps14765／23patch及狀態／資源／RTX guards。`2dfc0ab` 因未觀察到收益而關閉自動SIMD，保留雙產物、明確SIMD與數值ABI；最終126tests／types／lint／build／bundle通過。此包不宣稱撤回後的新scalar FPS；73檔加入索引。

[布局輸入追蹤](geographic-cache-input-trace/README.md) 區分固定畫面與原效能 workload 的 view 移動。固定畫面20筆外部key相同；moving-view 的20筆key不同，2128個label visits中2108 misses／20 hits。1761 misses改變near rows，347只改方向／axes；不能把核心暫停誤認為渲染輸入靜止。原控制逐幀更新army edgeT與鏡頭，finally復原，所以前後canonical與camera相同不代表中途沒有移動。這是診斷資料，沒有新的FPS結論；Root完整verifier通過。

[有限範圍 X 軸排除原生驗證](geographic-score-early-x-native/README.md) 固定 `3633c61` 的完整nine payload仍為af4，原六項Worker通過。三視角各一次為60.00093／49.70804／32.40628 FPS；strict60皆RED，overview平均值達60但slow-frame未達標。Close比同cohort feab高1.15%，只保留為暫時候選，沒有明確收益結論。Source1528／deps14765／23patch、實際scalar90122-byte／493545、RTX／狀態／資源驗證皆通過，Root獨立verifier通過。兩包99檔加入索引。

[Root撤回一致證據](geographic-score-endpoints-restored-root/README.md) 保存正式candidate80WASM／24Rust及restore1494source rows與Gitblob核對，source/artifact等同feabFULL範圍，沒有新fullrun。下一步為feature-gated scalar／SIMD雙artifact及初始化前capability選擇；prototype目前每個wasm32都含SIMD，不能當scalarfallback。Production維持acceptedscalar，尚無SIMDgame收益量測。
