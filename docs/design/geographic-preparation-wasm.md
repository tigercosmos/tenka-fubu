# 地理標籤數值準備的 WASM 邊界

狀態：正式接點已於 `feab20c` 接入；精確性控制與單輪原生量測完成。近景有觀測收益，三視角仍未達 60 FPS，效能驗收未完成。

原版地理標籤的 Rust 核心只處理快取未命中的評分。新版一般模式由 Rust 建立附近索引、方向及座標軸；JS 保留物件與 JSON 快取簽章。既有 profile 的 JS parent 約 14.36 ms 包含這些工作及其他成本，不能全數歸因於數值準備。

目標是把可保持相同運算順序的數值準備移入 Rust，減少重複掃描及封裝。JS 保留物件、中繼資料、排序及原快取簽章。採用前必須量測完整渲染路徑的收益。

## 現有契約與限制

正式接點為 [geographicLabelLayout.ts](../../src/ui/map/geographicLabelLayout.ts)，配置由 [wasmGeographicScorer.ts](../../src/ui/map/wasmGeographicScorer.ts) 擁有。新 [wasmGeographicPreparation.ts](../../src/ui/map/wasmGeographicPreparation.ts) 包裝 [geographic_preparation.rs](../../rust/engine/src/geographic_preparation.rs)；評分共用 [geographic.rs](../../rust/engine/src/geographic.rs) 的原算術。獨立 oracle 凍結原版 `fc464a4` 與既有 JS 參考，不從新 Rust 推導預期值。

- JS 保留原驗證順序：普通障礙、硬障礙、候選矩形及候選識別碼。
- JS 保留矩形的穩定座標排序，以及種類優先序與 UTF-16 識別碼排序。
- JS 保留原物件展開、額外 enumerable 欄位、own key 順序及 `JSON.stringify` 簽章。
- Rust 保留逐式 f64 算術、NaN、正負零、溢位、epsilon、候選重複及平手順序。
- 所有已合法的輸入數量仍合法。既有座標軸上限 16 與 capsule 超過 255 的正常拒選規則維持原樣。
- 本階段不更動模擬 Worker、遊戲狀態、RNG、既有 path ABI 或 `geo_score` ABI。

輸入矩形通過驗證後，衍生計算仍可能產生 Infinity 或 NaN。這些結果遵循原公式，不能因為非有限值而一律視為 ABI 錯誤。Rust 必須使用相容 JS 的 min/max，禁止以忽略 NaN 的 `f64::min/max`、FMA 或重新結合算式替代。

## 一個 frame，兩種資源模式

一般模式在每次 layout 開始時，只封裝一次排序後的普通與硬障礙。每個標籤追加自己的已放置矩形。Rust 從同一 frame 產生附近索引、七個動態偏移及兩組座標軸；快取未命中時直接重用這份準備結果評分。

若 bulk frame 超過宣告的傳輸預算，包裝層在配置之前選擇 **CAPACITY** 模式。此模式保留原 JS 準備流程，並呼叫真正的既有 Rust `geo_score`。它是明確的資源模式，不是 ABI、初始化、配置或執行錯誤的 fallback。

正式 provider 採用 **131,072 words（1 MiB）的 frame／prep 常駐配置預算**。九組原生場景最大需求為 4,376 words（35,008 bytes）。實際 8,192 個遠障礙需求 49,235 words，仍走一般模式；32,768 個需求 196,691 words，走 CAPACITY。兩種真實模式均通過完整準備、簽章、快取及結果比對。預算不限制合法幾何，也不含 road／舊 scorer arena、配置換代的暫存重疊、WASM page／allocator overhead 或 JS 物件。詳見[原始容量證據](../validation/2026-10-12/completion-audit/geographic-preparation-capacity-sim3/)。

兩種模式啟動時都必須驗證所有必要 feature ABI。缺少 export、版本錯誤或初始化失敗必須 fail closed；CAPACITY 模式不能掩蓋缺少新準備核心的 artifact。

## ABI 與資料所有權

新 export 採獨立版本 1，不改現有 allocator、path、geo 或 castle ABI 1。`prepareCastlePlanner()` 在 Application 建立前一併驗證準備 feature。

| Export                                                                             | 用途與回傳                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `geographic_preparation_abi_version()`                                             | 新準備 ABI 版本 1                                      |
| `geo_prepare(framePtr, frameWords, prepPtr, prepCapacity)`                         | 回傳輸出 word 數；`-2` 表示 malformed ABI              |
| `geo_score_prepared(framePtr, frameWords, prepPtr, prepWords, roadPtr, roadWords)` | 回傳勝出索引；`-1` 表示無選中，`-2` 表示 malformed ABI |

所有 word 都是 f64。計數及索引必須是有限安全整數；長度與位移使用 checked 加乘。pointer 必須對齊 8 bytes，各區域須符合線性記憶體範圍且互不重疊。Rust wrapper 不追蹤 allocator 的 live allocation；provider 必須持有真實配置，不能提交已釋放或任意指標。

| 封包                   | 欄位與順序                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Frame header，16 words | `[1, frameToken, P, H, placedCapacity, K, x, y, width, height, labelRevision, 0, 0, 0, 0, 0]`               |
| Frame rows             | `P` 個普通矩形、`H` 個硬矩形、`placedCapacity` 個已放置矩形；每列 `[x,y,width,height]`                      |
| Prep header，16 words  | `[1, frameToken, K, np, nh, nr, nx, ny, winnerIndex, winnerX, winnerY, labelRevision, x, y, width, height]` |
| Prep rows              | 普通局部索引、硬局部索引、reserved 全域索引、七個 `[x,y]` 偏移、`xs`、`ys`                                  |
| Road header，8 words   | `[1, linePresent, normalX, normalY, slack, capsuleMode, capsuleCount, 0]`                                   |
| Road rows              | capsule 原順序，每列 `[ax,ay,bx,by,radius]`                                                                 |

`P/H` 是固定障礙數；`K` 是目前已放置數。reserved 全域索引依普通、硬障礙、已放置的串接順序排列。`np/nh/nr` 是附近數量，`nx/ny` 是軸長度。capsuleMode 保留 absent、null、array 三種狀態。

JS 保留排序後的原物件陣列，以回傳索引建立原簽章。不能只從四個數值重建附近矩形，否則額外欄位及 own key 順序可能改變。快取命中與未命中都沿用原 `placed.push({...rect, x, y})` 結果，再追加其四個數值到 frame。

`frameToken`、`K`、`labelRevision` 與候選矩形的 f64 bits 綁定準備結果。每次 beginFrame 遞增 token，每次 prepare 遞增 revision；兩者使用正的 JS 安全整數，支援大於 2³² 的值，不轉成 wasm32 usize。耗盡時拒絕操作，沒有 rollover；revision 耗盡需建立新 frame。跨 frame、追加後、第二次 prepare 後及被修改的 descriptor 不得評分。初始 winner 欄位是 `[-1,+0,+0]`，只作輸出，不能用來跳過評分。

輸出容量可由 `62 + 2P + 2H + placedCapacity` words 保守界定。這只界定上述封包的儲存量，不限制合法輸入。包裝層先做安全整數與 checked 長度計算，再依常駐配置預算選模式。每個 wasm32 區域不超過 `0x0fffffff` words；超出可表示容量也選 CAPACITY，不能截斷計數或先配置。

Rust 在快取未命中時才計算 baselinePrimary 與 hardBaseline，並直接使用附近索引。評分順序維持七個動態偏移、113 個固定圓盤偏移，再接 y 外圈、x 內圈的合法軸配對。它保留重複候選，不另封裝完整偏移或附近矩形。

勝出座標由 Rust 寫入 prep 的結果欄位；JS 立即複製成自己的數值。`-1` 沿用原零偏移結果。malformed ABI 必須先完整驗證再寫入，避免部分修改 frame、prep 或快取。

渲染 provider 擁有 WASM 配置，與模擬 Worker 記憶體分離。任何配置、準備、評分或城名牌操作都可能造成 memory grow；JS 必須重新取得 typed-array view，不能讓呼叫者持有 WASM view。

## 精確性與替代方案

附近篩選與 overlap 必須保留原不等號及運算順序。方向與垂直邊緣使用全部 reserved；座標軸也不能只用附近矩形。遠處矩形仍可能在單一座標軸提供合法候選。

座標軸須重現 JS Set 的 SameValueZero、正負零處理，以及 `abs(a)-abs(b) || a-b` 排序。方向保留明確零 operand 的 min/max；JSON 仍由 JS 產生，Rust 不另實作 JSON 或字串排序。

串流兩階段是另一種可行邊界：先掃全部矩形取得方向與座標軸，再建立附近資料。它能減少 bulk frame 的常駐空間，但可能增加跨 ABI 呼叫、重掃及雙重封裝。尚未量測，暫不選用。

完全移入簽章或候選排序會擴大契約範圍，且需要重現 JS 物件及字串語意。本邊界保留這些工作於 JS，因此不能假定 14.36 ms parent 成本都會消失。

## 必要驗證與採用條件

- 使用真正編譯的 prep ABI，比對凍結 JS 參考的完整參數、索引、偏移、軸、簽章及最終結果。只提供 `score` 的 mock 不構成新邊界驗證。
- 覆蓋一般與 CAPACITY 模式、快取命中與未命中、額外 own 欄位、capsule absent/null/空陣列及穩定 UTF-16 排序。
- 覆蓋正負零、NaN、合法溢位、零尺寸、遠處軸貢獻、epsilon、候選重複及大型合法數量。有限值與正負零按 bits 比對；NaN 按原運算分類比對。
- 覆蓋 malformed 非修改、過期 token/K、初始化錯誤、dispose/reset，以及同 provider 城名牌操作引發的 memory grow。
- 保持既有 path/geo/castle ABI、artifact freshness 及 Worker 全狀態、RNG、log 相容性檢查。
- 在相同來源、依賴、artifact 與已證實 GPU 條件下，分別量測封裝、準備、JS 簽章、Rust 評分及整體 renderer。保留冷暖快取數量與所有失敗。

採用需要完整成本降低及原 renderer/native 門檻證據。kernel 單獨較快、包裝層測試通過或初始化成功，都不足以宣告效能改善。

## 已完成驗證與待量測項目

Rust 23 項測試、實際 WASM protocol、320 場景 adapter 比對及兩種資源模式各 160 場景的正式整合控制已通過。一般模式確實呼叫新 `geo_prepare`／`geo_score_prepared`，CAPACITY 確實呼叫舊 `geo_score`；快取命中不呼叫評分。33 個既有 renderer／UI fixture 共 386 項通過。固定 `feab20c` 全套為 6,392 通過、1 既有 s1560 day450 失敗、1 跳過，1,494 個測試／來源輸入前後與 Git blob 相同。

新 artifact 為 88,475 bytes，SHA256 `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`。Mac／Linux pinned recipe 產物與 manifest 逐位元相同。同 current23 依賴、實際 RTX 的九完整原生快照仍 exact；三視角各一次 30 秒 FPS 為 59.95983／49.88502／32.03923。近景相對原 29.11552 有 +10.04% 的單輪觀測收益，三項 strict60 仍失敗。唯一獨立近景 profile 有 323 完成 renders／322 intervals，地理布局 inclusive 11.6128 ms／render（原 14.3623，減少約 19.1%）；prepare inclusive 3.599、scorePrepared inclusive 7.282、signature self 0.589 ms，均屬 parent 內成本，不能重複加總。較廣觀測區間的 computed41735／reused121 不按 profile render 數正規化。不能宣稱穩定達到 60 FPS，或把模擬 Worker 描述為整套 Rust 引擎。
