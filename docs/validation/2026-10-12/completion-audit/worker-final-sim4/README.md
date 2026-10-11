# 最新 Worker 原生驗證

2026-10-12 在 sim4 單獨執行，六項測試全部通過（43.3 秒）。來源為凍結候選 `f446e85`，714 個 source／tools 檔案的精確 SHA256 已保存於 [private-program-cache](../private-program-cache/source-manifest.json)。Node 22.17.0、Chromium 149.0.7827.55，headless GPU；未開 profiler，未同時跑其他測試。

重現：先 `npm run build`，再 `VISUAL_GPU=1 npx playwright test e2e/worker-simulation.spec.ts --project=chromium --workers=1`。Linux 設定使用 `--enable-gpu --use-angle=vulkan`。GPU 型號的獨立 renderer probe 見前述資料夾；不是本次 Worker isolate 的直接 renderer 讀值。

| 情境                    | 同步最長畫面間隔 | Worker 最長畫面間隔 | 同步總耗時 | Worker 總耗時 |
| ----------------------- | ---------------: | ------------------: | ---------: | ------------: |
| 暖機後連續 60 日        |         586.6 ms |            117.0 ms |   522.9 ms |    1,335.8 ms |
| 暖機後連續 120 日       |       1,028.1 ms |            124.9 ms |   939.9 ms |    2,511.1 ms |
| 正常 x5，實際完成 29 日 |         128.4 ms |             84.7 ms | 3,544.7 ms |    3,594.9 ms |

批次先同步後 Worker，每種各一筆；冷啟動一日及所有 RAF／long-task 原始列均保留。正常 x5 先 Worker 後同步，先暖機一日；Worker 在實際自動暫停後完成 29 個量測日，同步對照以相同日數及 120 ms 節奏執行。不是完整 60 日 x5 樣本。最長 long task：120 日為同步 940 ms、Worker 60 ms；x5 為同步 69 ms、Worker 60 ms。

三組完整 GameState 與日誌都精確一致，Worker diagnostics 確認 Rust WASM 載入及路徑後端。原生指令排程、存檔／瀏覽器重載，以及取消已送出的運算後新 generation 重試亦通過。

批次 UI 阻塞明顯縮短，但 Worker 總吞吐較慢，x5 仍有 84.7 ms 停頓。單筆同主機樣本不能證明所有裝置的穩定改善，也未達到穩定 60 FPS。Rust 實作路徑核心；其餘每日系統仍為 Worker 內的 TypeScript。

[summary.json](summary.json) 保留未取整的摘要。三份原始 JSON、測試 log 與含附件的 Playwright HTML 均以 gzip 保留原始 bytes；壓縮及解壓 SHA256 在 [continuation-artifact-sha256.json](../continuation-artifact-sha256.json)。

本機／遠端檔案雜湊一致：

- `e2e/worker-simulation.spec.ts`：`ecae67cb0c449bdf695d78679c6db3ca7a986311715d44018a2d81b956772783`
- `playwright.config.ts`：`0f2062a03f1ed2174fbd4b496dff2c851a579d78952452666d5de2c6ee30b21c`
- `public/wasm/tenka_engine.wasm`：`f23ee98cd1dc438463882d97fe648c5c0e8d8907191db6e986fd90d7b370d801`
