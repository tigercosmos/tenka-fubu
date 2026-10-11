# 地理標籤配置成本

`d619085` 只調整 `src/ui/map/geographicLabelLayout.ts`。CPU profile 指向每個標籤的 edge-axis 暫存陣列，以及快取命中前仍建立的 disk／axis 候選。新程式逐值建立相同 Set，保留運算順序、排序、上限與全部重複候選；固定 disk 只建立一次，完整 scoring 候選延後到快取未命中才組合。未修改避讓範圍、保護通道、優先序或 tie break。

原有 25 項測試通過，包含 120 個可重現場景與 ±1e-10 邊界的 exhaustive 原版比對、冷計算／快取／失效。normal／core typecheck、scoped ESLint 與格式通過；既有 jsdom canvas 警告完整保留於 log。

## 原生前後比對

sim4 的副本與先前 714 檔 source manifest 只差此一檔案。headless GPU Chromium、相同 Node／啟動設定、單 worker 執行，關閉 profiler。最新六項 Worker 原生測試全部通過（41.8 秒），build 通過。三份資料與 [前一輪原始資料](../worker-final-sim4/) 比較：兩個後端的完整 GameState、日誌、publishedMap 與所有 geographicLabelLayout.labels 均逐值完全相同。

| 情境／Worker        | 前：最長畫面間隔 | 後：最長畫面間隔 | 前：總耗時 | 後：總耗時 |
| ------------------- | ---------------: | ---------------: | ---------: | ---------: |
| 暖機後 60 日批次    |         117.0 ms |          87.9 ms | 1,335.8 ms | 1,258.4 ms |
| 暖機後 120 日批次   |         124.9 ms |         108.1 ms | 2,511.1 ms | 2,451.2 ms |
| 正常 x5，實際 29 日 |          84.7 ms |          60.3 ms | 3,594.9 ms | 3,587.7 ms |

x5 後版在觀察區間沒有超過 50 ms 的 long task；同步對照仍為 69 ms。後版 120 日 Worker 最長 long task 51 ms，同步 927 ms；同步總耗時 927.6 ms，仍快於 Worker 批次。每種後端／情境只有一筆，執行順序沿用原測試；x5 是自動暫停前實際 29 日。畫面間隔仍超過一幀，不宣稱穩定 60 FPS 或所有裝置都有相同改善。精確未取整數據、前後一致性斷言見 [native-summary.json](native-summary.json)。

## CPU 歸因

前後另各執行一次 `VISUAL_GPU=1 SIMULATION_PROFILE=1 npx playwright test e2e/worker-simulation.spec.ts --project=chromium --workers=1 --grep 'native x5'`，均通過。這些 profile 不當作無 profiler 的計時資料。sample time delta 按最末 frame 對應原始函式；全部 geographicLabelLayout.ts frame 的 self time 加總為 Worker **256.943→83.556 ms**、同步 **330.135→85.452 ms**。摘要的 top35 不是完整加總來源，完整累計來自所有 sampled nodes。

實際前後 build 的 source map 中，該檔 sourcesContent 與保留的前後 source bytes 精確相同。原始 profile、對應 source maps 及診斷計時全部保留。`profile-summary.cjs.txt` 可複製成 `.cjs`，將 gzip 解壓至資料夾後，以 `node script.cjs <folder>` 重現；從專案根目錄執行以解析既有 trace-mapping dependency。

本機另以原生觀察的 156 個標籤、234 個 primary／243 個 hard obstacle 矩形，重建**不含 road tangent／capsule 約束**的通用診斷場景。十次暖機後，十組交替順序、各十次快取布局，均精確比對相同 offset；原始每列保存在 local-benchmark.json.gz。這是含 equality assertion 的局部 CPU 診斷，不代替 native 地圖或 FPS 證據。保留的 local-benchmark.ts.txt 是當時實際執行腳本，含原工作區／暫存絕對路徑；異地重現需更新 import 與輸入位置。

原始 bytes 以 gzip 保存，[artifact-sha256.json](artifact-sha256.json) 同時驗證壓縮與解壓內容。前後完整 HTML 報告分別在 worker-final-sim4 與 after-native；全專案及既有未通過 gate 未因此清除。
