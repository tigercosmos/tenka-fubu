# 獨立 Worker batch 成本診斷

本包保留固定 **04c7b60** 的一次 default-headless 120 warm-day CPU profile、另一頁的只讀 GL identity、Linux producer byte parity，以及兩個硬體分支失敗。沒有重跑原六項 accepted suite、修改 production source／BAL／依賴／browser flags，或宣稱效能 gate 完成。

## 實際執行範圍

| 分支                                                   | 結果                                                                                                                 | 實際 120 日 profile 次數 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -----------------------: |
| Default headless，新增外部 observer／main CDP profiler | PASS：原生新遊戲、1 warm tick、120 batch；完整第 121 天 state／RNG／log 與純同步 reference 相同                      |                        1 |
| 同 default setup，另一新頁讀 GL／CDP identity          | PASS：目前 context 是 SwiftShader；沒有 timing                                                                       |                        0 |
| Rust 1.97.1 Linux 原 `npm run wasm:build`              | PASS：63073-byte binary 與 manifest 均 Mac／Linux byte-identical；在 profile 結束後才編譯                            |                        0 |
| Hardware setup attempt 0                               | RED：尚未安裝 canonical Chromium 1228 executable；0ms、未啟動原生頁                                                  |                        0 |
| 安裝 lock 對應 Playwright 1.61.1／Chrome 149.0.7827.55 | PASS：只修 browser cache 環境，不改 flag／dependency                                                                 |                        0 |
| Canonical `VISUAL_GPU=1` actual preflight attempt 1    | RED：現有主畫布 WebGL2／WebGL 都為 null；CDP 是 Vulkan llvmpipe，非 RTX。硬體 guard 在 `Profiler.start` 前失敗後停止 |                        0 |

`scopes.json` 是上述範圍的可機讀紀錄。沒有完成的硬體 batch 可以比較；不更換 env／args、不重試 llvmpipe 分支。新硬體預檢與原缺 executable 失敗的原 logs／metadata／error context 分開保存。

Production source／public／config／Rust／tools 的 3068 個 archive 檔案，在 profile 前後、Linux build 後與硬體 preflight 前後皆逐檔 SHA 相同。Node 22.23.3、Pixi 8.19.0、23 個 patched SHA、WASM／manifest proof 全保存。外部 diagnostics 在隔離副本的額外 `diagnostics` 目錄；它們不是 production source 修改，也不是原六項測試修改。

## 唯一 default profile 的觀測

| 項目                              |                                                                             實際值 |
| --------------------------------- | ---------------------------------------------------------------------------------: |
| `stepDaysAsync(120)`              |                                                                            13296ms |
| 額外 `waitSimulationIdle`         |             0ms：兩次 `performance.now` 值相同，僅代表當時解析度內，不是零成本證明 |
| 120 個真實 reply `computeMs` 加總 |                                                                            649.2ms |
| 同步 `postMessage` 呼叫加總       |                                                                            190.6ms |
| 120 個 post → receive 區間加總    |                                                                          12389.7ms |
| 區間之外的 step 時間              |                                                                            906.3ms |
| 主執行緒 long tasks               |              93 個，與測量窗交集合計 11855ms；其中 11800ms 位於訊息 in-flight 區間 |
| RAF                               |                                                                              97 個 |
| Warm tick epoch／Worker lifetimes | tick 全為 epoch 3；startup created 3、initialize epochs 1／2／3，沒有逐 tick reset |
| 實際 WASM HTTP requests           |                                                         4 個；URL／status 原值保存 |

`computeMs` 是 Worker 內 `advanceDay` timer，不包括初始化、輸入／輸出 structured clone、事件目錄準備與傳送。Post → receive 同時包括核心運算、序列化、排程和主頁接收等待，不能把減法餘額全部叫作 GPU 或 renderer。

這次有 profiler／額外 observer 開銷。**13296ms 不能與前一個未 profile 的 17037.9ms 合併成同指標，也不能宣稱改善。** 前一個原六項結果仍在 `worker-ready-castle-sim1`，不改寫。

## CPU attribution 的界線

V8 profile 共 14410.901ms，涵蓋測量前後的 observer／RAF guards；sample weights 共 14409.536ms。聚合相同 URL／line／column 後：

- `(program)` self sample **12530.33ms**，沒有可定位 JS URL／位置。這是最大的未歸因區，不能重新命名成 GPU wait、WASM 或特定 renderer。
- Production `Ad` **381.16ms**，依 exact bundle 位置與函式結構對應 `src/app/worker/reconcile.ts` 的 `reconcileValue`。
- 外部 receive callback **249.47ms**、post wrapper **193.36ms**；包含觀測與 native 呼叫的取樣區間，不能全稱純 observer JavaScript 成本。
- `placeGeographicLabels` self **20.43ms**、inclusive **99.85ms**；`placeCastleRibbons` 等其他完整 frames 留在 `cpu-attribution.json`。這些不是每 frame 平均時間，也不能解釋沒有 stack 的 program samples。

完整原 CPU profile、production minified JS bundles、V8 URL／scriptId／0-based line／UTF-16 column、exact-location snippets 與 bundle SHA 保存，並非僅依函式名猜測。URL-less injected observer 的來源是當次 Playwright transformed-cache JS／source map；`injected-observer.reconstructed.js.gz` 依其實際函式 source 與 Playwright function wrapper 重建，**不是當時 `Debugger.getScriptSource` 擷取**。實際分析腳本原 bytes 亦保存。

Root 已指出 map selector 在 same game／same jumping object 下可以重用。此 profile 不能由 RAF 數量推論每 tick 重算整個 map VM；尚未確定主因或提出 source 優化。

## GL 與 producer proof

Default profile 的歷史 context 沒有記錄 UNMASKED_RENDERER。後續同設定新頁的 1280×720 WebGL2 context 實際回報 `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`，CDP `ANGLE_SWIFTSHADER`。它支持同 setup 軟體繪圖的假說，不能追溯確定歷史 profile 的 GPU identity，亦不能將 program 全歸因 GL。

安裝 canonical full Chromium 後的新硬體 preflight 實際回報 `ANGLE (Mesa, Vulkan 1.4.318 (llvmpipe (LLVM 20.1.2 256 bits) (0x00000000)), llvmpipe-25.2.8)`，browser log 有 WebGL blocklisted；沒有 RTX 證明。既有 `VISUAL_GPU=1` 同時切換 full Chromium／Vulkan flags，本輪沒有擅改參數修 driver。

Linux producer 使用已 pinned Rust 1.97.1 與原 locked release／remap recipe，一次 build。先備份 Mac binary／manifest，再比對 Linux 結果：binary 63073 bytes、SHA256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`；manifest SHA256 `8f41ae78dce8749c6c255b68ba4bceda709bc96af3f14271330261278fe8bd68`。兩者 byte-identical；原測量 evidence 沒有覆寫。

## 保存與核對

所有 raw gzip 記錄未壓縮／壓縮 bytes 與雙 SHA256。完整 state／log、GL／CDP info、env、actual JS bundles、原 profile 與錯誤 metadata 都保存；人讀 JSON 先保留 raw gzip 後格式化。

Hardware preflight 原完整 trace ZIP **49547340 bytes**、SHA256 `5dd4d94c19a43b09fd8ad4b4648905d2e616e8e87218717d49d79b3b7fd522c9` 仍保存在 sim1：

`/tmp/tenka-04c7b60-worker-batch-hardware-evidence/immutable-full-hardware-preflight-trace.zip`

早期 49533636 bytes 是同一個 ZIP 再 gzip 後的大小，不是原 ZIP 大小，也不是另一個 attempt。

**完整 trace 不在本 commit**。本包保留所有 `.trace`／`.network`／`.stacks` 的 exact bytes、最後必要 screenshot 與 error context；排除重複靜態資產／其他 screenshot resources。`hardware-attempt1-full-trace-boundary.json.gz` 記錄所有 included／excluded entries、original／immutable remote paths／SHA，不能冒稱完整 trace 已 durable committed。Setup attempt 0 的小型完整 trace 則原 bytes 保存。

```sh
python3 docs/validation/2026-10-12/completion-audit/worker-batch-overhead-sim1/verify-evidence.py
```

此 verifier 只核對已存原證據與深比較，不啟動 browser／timing。仍缺有效 RTX 對照、program 根因、55 FPS 與 whole-heap acceptance；完整效能工作維持未完成。
