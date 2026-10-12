# Geographic preparation Linux 產物重現

固定來源 `feab20cc9c207f37afae7a2f372c437b93232a07`，在 sim1 新隔離目錄執行一次原 `npm run wasm:build`。Pinned Rust **1.97.1**、Linux x86_64，build exit **0**。沒有修改 producer recipe、compiler flags 或來源。

| 產物          | Linux 與 frozen Mac 原產物比較                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| WASM          | **88475 bytes**；SHA256 `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`；cmp exit 0 |
| Manifest      | SHA256 `09483b9c0d9ddcd7ec57673a6a17380dc7ca2385a095872f710b020451413ca3`；cmp exit 0                  |
| 實際新 module | engine／geo／castle／preparation ABI 都為 1；完整 exports／imports 保留                                |

隔離目錄為 `/tmp/tenka-feab20c-preparation-linux-sim1-20261012`。Git archive 只輸出本次建置需要的來源與設定，沒有 AppleDouble。**733 個 scoped source/config 檔案**在建置前後完全相同，且逐一符合固定 Git blob；此數量不是整個 repo 或 dependencies 的 inventory。

Node **22.23.3**／npm **10.9.9**。本次重用 `/tmp/tenka-04c7b60-worker-ready-sim1/node_modules`；package lock 的實際 SHA 與原 cohort 一同保留。沒有執行 npm ci，不宣稱 fresh dependencies 或重新驗證全部 Pixi patches。

`raw-evidence.tar.gz` 保存原 run script、set-x 命令／環境、build stdout/stderr、exit 值、建置前後來源 inventory、Mac 原 binary／manifest 及實際 module ABI probe。原 Linux 隔離目錄仍保留；此包不依賴該 `/tmp` 目錄來核對 raw 證據。

這是一次建置重現，不包含 browser、GPU、FPS、heap 或執行效能驗收。它只證明此固定來源與 pinned toolchain 的新產物跨平台 byte parity，不推論其他來源或工具鏈。

```sh
python3 docs/validation/2026-10-12/completion-audit/geographic-preparation-linux-sim1/verify-evidence.py --git
```

Verifier 核對壓縮前後 SHA、全部原始 member、artifact、ABI 與來源 inventory。`--git` 另核對 733 個固定 Git blobs，需要本 repository 的該 commit；它不重跑建置或 timing。
