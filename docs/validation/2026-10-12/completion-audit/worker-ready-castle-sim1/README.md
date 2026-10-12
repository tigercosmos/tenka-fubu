# 固定 04c7b60 的原六個 Worker 原生案例

全新 sim1 隔離副本，以 production build 執行原本 `e2e/worker-simulation.spec.ts`，一次 **6 PASS、2.1 分鐘、exit 0**。不改 source、原斷言、timeout、retry 或 browser flags。舊 fb9 的 **5 PASS／1 RED** sibling 原封保留；這是另一個固定來源 cohort。

## 來源與環境

- 完整來源固定 `04c7b6083df32cc9c1a20d693ef45eddb806ed14`，包含實際 Worker ready 協定、bridge current-epoch join，以及正式城名牌 WASM hook。
- `git archive` 的 commit metadata 與 SHA256 `1c1cb07f5043c9826994f6f6965b3bc231dc07c38aeffa1d1fc9b300f4b8357d` 保存。3068 個 archive 檔案在安裝後／build 前及 native 結束後逐檔驗證，兩次皆無 hash mismatch。完整 manifest、相應 source snapshots 與原 E2E／config 保存。
- 全新本機 `node_modules`，`npm ci`；Node 22.23.3、npm 10.9.9、Pixi 8.19.0、Playwright 1.61.1。23 個 Pixi patched SHA 全部相符；production build PASS。
- 正式 WASM **63073 bytes**，SHA256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`。真實實例 path／geographic／castle ABI 皆為 1；production HTTP served binary 與來源 binary 完全相同，preview cwd 指向新隔離副本。
- 預設 Linux Chromium headless shell；`DEBUG=pw:browser` 保存真正 launch flags。沒有 visible window、VISUAL_GPU override、同 host 並行 timing 或重試。
- 隔離副本 `/tmp/tenka-04c7b60-worker-ready-sim1`，完整原 report／results 保存在 sim1 `/tmp/tenka-04c7b60-worker-ready-evidence`。本 sibling 保留完整 report metadata、所有六份 state/log JSON 附件、完整 browser／build／npm logs；0 個 failure traces。大型 source archive 可由 durable commit 重建。
- 後續 `2bdb1f3` 的 Rust test provenance comment／manifest source hash 修改沒有 overlay 到此副本，也沒有重跑。本包只驗證 04c7b60，不能改稱最新來源已驗證。

## 功能證據

| 原案例                           | 結果          | 實際證據                                                                                                                                         |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| seeded full-world queued command | PASS，10.558s | day 3 完整 state／log 與同步參考相同；目前 generation 3 真正 ready、Rust backend、3 completed、0 pending；HTTP 200，真實 ready／complete traffic |
| save／browser reload             | PASS，22.419s | 未消耗命令載入後實際執行；完整 state／log 與參考相同                                                                                             |
| 60 additional days               | PASS，26.068s | 第 61 天兩份完整 state／log 相同；61 個真實 Worker complete，0 inconsistent threat total                                                         |
| 120 additional days              | PASS，35.184s | 第 121 天兩份完整 state／log 相同；121 個真實 complete，0 inconsistent threat total                                                              |
| cancel posted day                | PASS，5.772s  | posted pending 1 → generation 4、pending 0、completed 0、真實 ready；取消不消耗命令，下一日完整 state／log 相同                                  |
| normal ×5／paced sync            | PASS，24.918s | 原請求 60 日，實際 29 additional 日到 day 30 自然月報暫停；兩份完整 state／log 相同                                                              |

初始化與 tick 同時存在時，原命令／RNG／persistent state 仍精確相同。現在的 true ready 是當前世代實际 ACK，並未把歷史 backend flag 改成 true。初始化不算 tick；取消案例就緒後 completed count 仍為 0。

## 時間範圍

這六項是功能與 Worker 相容性案例，**不代表 map FPS、whole-heap 或整體速度 gate 通過**。兩個 batch 的 Worker 總 wall 仍較慢；同窗口最長主執行緒 long task 較短。下表為一次原測試的測量，不是統計結論或跨 cohort 因果效益。

| 相同完成日數                   | Sync wall | Worker wall | Sync 最長 long task | Worker 最長 long task |
| ------------------------------ | --------: | ----------: | ------------------: | --------------------: |
| 60 additional                  |   517.9ms |    8238.7ms |               518ms |                 233ms |
| 120 additional                 |   956.5ms |   17037.9ms |               956ms |                 207ms |
| normal ×5／paced 29 additional |  5749.5ms |    4373.7ms |               207ms |                 177ms |

Normal ×5 是普通 clock／月報暫停窗口；不能說完成了 60 日。附件的 `cold` 表示 startup 後第一個測量日，並非整個 WASM 冷啟動延遲。完整 frame gaps、long-task rows、renderer diagnostics 與 browser console 訊息全部留在原始附件／log。

## 重現與完整性檢查

以 04c7b60 全新 archive，移除 AppleDouble，確保相同 Node 與已安裝 Playwright browser cache：

```sh
npm ci
npm run build
DEBUG=pw:browser npx playwright test e2e/worker-simulation.spec.ts --workers=1
```

本次沒有使用 `--retries`、`--timeout`、`--trace` 或 `CI` override。metadata extraction、runtime ABI／dependency proof、source proof 與獨立 native 深比較腳本的原始 bytes 均 gzip 保存；它們使用明示的 sim1 `/tmp` 觀測路徑，並非產品修改。

已提交 evidence 可獨立驗證，不依賴原 `/tmp`：

```sh
python3 docs/validation/2026-10-12/completion-audit/worker-ready-castle-sim1/verify-evidence.py
```

此驗證器核對 raw hash、完整 state/log parity、source manifest、ABI／served binary 與目前世代 ready，不重新執行 browser。`summary.json`、inventory 先保留 raw gzip，再格式化；所有附件與 logs 保持原 bytes。
