# 目前世代的 Worker Rust 就緒

兩個獨立 source 步驟：`c613747` 增加 Worker 初始化控制訊息與實際 ABI 驗證；`71d1eaf` 增加 bridge 的目前世代等待與初始化錯誤訂閱。原 tick request 結構、立即送出 tick、命令／狀態版本與世代安全檢查維持原契約。

## 驗證結果與界線

- Worker focused：22 PASS。原初輪 12 PASS／1 FAIL 與當時 source 保留；失敗是 FakeWorker 立即 ACK 與既有 reset 後 `backendReady=false` 斷言衝突。將第二個 mock 的 ACK 延遲，保留原斷言。
- 最終 related：4 files／65 PASS，含 Worker 22、bridge async 16、game loop async 3、既有 bridge 24。完整 typecheck、三個第二步 owned files 的 ESLint／Prettier，以及第一步四個 owned files 的 ESLint／Prettier 均 PASS。
- 反向控制：在獨立 `/tmp/tenka-readiness-bridge-negative` 副本使用 `c613747` 的舊 bridge 與新測試，7 FAIL／9 PASS／0 unhandled errors。缺少真實就緒等待、期限與初始化訂閱會被驗出。所有原始失敗保留，包括初次缺 config 的 startup failure、先前負控制的未觀察 assertion rejection、初次 ESLint require-await failure；這些不是通過的驗證。
- 實際測試載入的編譯 WASM 為 63073 bytes、SHA256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`、path ABI 1。保存實際 binary／manifest 與 source，不與先前 27147 bytes 的 fb9 原生 cohort 混稱。
- 本步沒有原生 browser／FPS／heap／啟動時間測量。先前 immutable fb9 六個原生 Worker cases 仍是 5 PASS／1 RED；新的 native cohort 須使用整合後固定來源另行驗證。本步不改任何 E2E 斷言或 timeout。

## 契約與正負控制

Worker 的 `initialize`、`ready`、`initializationError` 是獨立控制訊息；ready 的 ABI 值來自實際 engine export。單一初始化 Promise 同時服務控制請求與 tick；初始化不執行 tick，也不改核心 state／RNG。只有當前 owned Worker 的合法 ready ACK 能標示 ready；complete 無法繞過缺失 ACK。

Client 為 ready 與 tick 分別設期限，立即觀察 readiness rejection，重置／destroy 拒絕舊 waiter 並移除 owned listeners。晚到或偽造目前 epoch 的 retired Worker handler 無法復活 backend。真正失敗保存在目前 epoch，晚註冊訂閱者仍會收到。

Bridge 先撤销訂閱 guard，再取消或替換 executor；舊訂閱不能影響新 owner，測試 reset 同樣撤销。`waitSimulationIdle` 在單一 120 秒期限內 drain pending day，再等待真正目前 epoch ready；遇到 owner／epoch replacement 重新 join，期限不重設。合法就緒前不返回、目前初始化失敗 reject、缺 ACK reject、不同 ABI reject。等待本身不推進 tick／日期／命令／RNG。

## 重現

在整合來源安裝既有 lock dependencies 後：

```sh
npx vitest run tests/app/worker src/app/worker/worker.spec.ts tests/app/bridge.spec.ts
npx tsc --noEmit
npx eslint src/app/dayExecutor.ts src/app/bridge.ts tests/app/worker/bridgeAsync.spec.ts
npx prettier --check src/app/dayExecutor.ts src/app/bridge.ts tests/app/worker/bridgeAsync.spec.ts
python3 docs/validation/2026-10-12/completion-audit/worker-epoch-readiness-sim1/verify-evidence.py
```

反向控制須使用隔離副本：保留 `71d1eaf` 測試／其他來源，單獨把 `src/app/bridge.ts` 換成 `git show c613747:src/app/bridge.ts`，執行 `npx vitest run tests/app/worker/bridgeAsync.spec.ts`，预期非零退出。執行過的負控制全 source SHA manifest 與兩個差異 source 均已保存；不須修改主工作區。

`proof.json` 記錄結果、來源與 gzip 解壓後 SHA。原始 `proof.raw.json.gz` 在格式化前保存。驗證器只查 evidence 完整性與已存原始結論，不代表重新執行測試。原 native RED 證據位於 sibling `geographic-wasm-worker-sim1`。
