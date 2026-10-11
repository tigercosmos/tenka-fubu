# Rust WASM 與 Worker 驗證

本次把每日策略模擬移到專用 Web Worker，並在 Worker 中使用 Rust WASM 路徑搜尋核心。
Rust 路徑搜尋保留 TypeScript 參考實作，用於結果比較；其他每日系統目前仍以 TypeScript 結算。
Worker 與主執行緒平行工作，每日模擬依序提交，避免同時寫入同一局面。

## 建置與一致性

- Rust 1.97.1、`wasm32-unknown-unknown`，無第三方 Rust 依賴。
- `npm run wasm:build` 重新編譯；`npm run wasm:check` 驗證來源、產物 SHA256 與 ABI。
- macOS 與 sim3 Linux 實際編譯產物完全一致：`f23ee98cd1dc438463882d97fe648c5c0e8d8907191db6e986fd90d7b370d801`。
- `national-120-day-parity.json` 比較固定種子全國局面：同一物件的 TS、同一物件的 Rust，以及逐日重新複製的 Rust，各日完整 stateHash 一致。
- Worker 使用 epoch、requestId、stateVersion 與主局面身分檢查；取消、換局、存檔及新輸入都有獨立測試。
- 最終建置、型別檢查與套件容量檢查通過。sim4 應用測試為 123 個檔案、1108 項通過；核心／Worker／產物檢查／橋接的最後一輪 37 項通過，另有地圖與標籤布局的專項測試。
- `reference-perf-sim4.log` 是原本同步 TS 門檻的回歸檢查，不是 Worker 或 Rust 效能量測。第一輪平均 8.732 ms 未過 8 ms；規範允許的第二輪 6.269 ms 通過，兩輪完整樣本皆保留。

## 核心效能

`pathfinding-sim1.json` 使用 sim1 Linux x64、Node 22.23.3、465 節點、495 邊。
512 固定查詢中 478 條可達；每輪 4096 次查詢，20 輪交替先後順序。
JS 中位數 27.324 ms，Rust WASM 14.799 ms，約 1.85 倍。
這個數字只代表路徑搜尋，不能代表整體遊戲或畫面速度。

`worker-stages-after-copy-removal-sim1.json` 使用真正的 Node Worker，逐日比對完整狀態，共 60 天。
主執行緒傳送與合併成本中位數 4.95 ms、p95 5.83 ms、最大 7.65 ms；同步核心為 5.71、17.33、40.21 ms。
平均主執行緒工作下降約 33.1%，但 Worker roundtrip 中位數 18.33 ms，總結算吞吐量較慢。
這些數字不含瀏覽器 React、Pixi 更新與 GPU 繪製。

`worker-stages-before-copy-removal-sim1.json` 保留較早的版本：多餘快照複製使主執行緒工作中位數 8.86 ms。
`worker-cpu-profile-summary.json` 是另外啟用 inspector 的診斷樣本；不得當成無 profiler 的計時。
主要成本是狀態合併與序列化，路徑搜尋並非整個 tick 的唯一瓶頸。

## 瀏覽器

瀏覽器使用 sim2 的原生遊戲流程與獨立同步參考局面，驗證實際 Worker 訊息、WASM HTTP 載入、完整 RNG／局面／指令紀錄、存讀檔與取消。
`e2e/worker-simulation.spec.ts` 的 6 項測試全部通過。冷啟動 1 天加上 60／120 天快進，分別完整比對 61／121 天的局面、指令紀錄及最終地圖；正常 ×5 流程比對 29 天並驗證自動暫停。

同一台 sim2、headless Chromium、關閉 profiler，依序測量兩種後端。下表是本次樣本，並非多次測量的統計保證。

| 流程           | 後端     | 總時間 ms | 最長主執行緒工作 ms | 最長畫面間隔 ms |
| -------------- | -------- | --------: | ------------------: | --------------: |
| 正常 ×5，29 天 | 同步參考 |    3546.7 |                  68 |           129.9 |
| 正常 ×5，29 天 | Worker   |    3612.4 |                  67 |            82.6 |
| 快進 60 天     | 同步參考 |     515.7 |                 515 |           589.0 |
| 快進 60 天     | Worker   |    1302.4 |                  63 |           137.4 |
| 快進 120 天    | 同步參考 |     974.2 |                 974 |          1067.6 |
| 快進 120 天    | Worker   |    2595.7 |                  67 |           129.0 |

正常 ×5 的最長畫面間隔下降約 36%，快進也不再以單一長工作阻塞主執行緒，但 Worker 的總結算時間較長。仍有 63–67 ms 長工作，不能宣稱穩定 60 FPS。冷啟動 Worker 分別花費 82.1／34.8 ms，同步參考為 13.3／15.5 ms。

CPU 診斷另找出地名標籤碰撞布局成本，因而加入精確結果快取與候選範圍篩選。120 組隨機場景及邊界案例與原演算法逐項一致。`geographic-placement-benchmark.json` 的 90 標籤、240 障礙物合成場景，21 次量測中位數由 30.79 ms 降至 14.93 ms；這不是 FPS 量測。

`browser/summary.json` 保存最終瀏覽器摘要；接受的原始資料以 gzip 保存，`accepted-raw-sha256.json` 記錄解壓後 SHA256。較早失敗的原始資料也保留，失敗原因見 `failed-rows-annotations.json`，不混入最終量測。`normal-profile-before-layout-optimization.json` 啟用了 profiler，只用於定位成本。

Node Worker 與 120 天複製局面比較的重現指令及擷取程式見 [REPRODUCE.md](reproduce/REPRODUCE.md)。瀏覽器驗證可執行 `npx playwright test e2e/worker-simulation.spec.ts --project=chromium --workers=1`；需使用有 GPU 的 headless Chromium 環境。sim1 負責核心與 Worker 計時，sim2 負責瀏覽器，sim3 負責 Rust 重建及布局驗證，sim4 負責應用測試與既有同步效能回歸。

既有全國無繼承人領地不變量、凍結 golden／replay 與部分視覺驗收失敗仍保留；本次沒有更新基準來隱藏差異，也不代表整個專案已通過發布驗收。
