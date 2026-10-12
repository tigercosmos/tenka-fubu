# Geographic preparation 本機驗證

固定來源：`feab20cc9c207f37afae7a2f372c437b93232a07`。完整 suite 及 final checks 均已終止。此文件不宣告效能改善。

## 已完成的來源步驟

| Commit    | 範圍                                                      |
| --------- | --------------------------------------------------------- |
| `0172724` | Rust 數值準備與 prepared scoring，兩個來源／永久測試檔    |
| `9ed1470` | 共用原評分算術、checked ABI exports、producer 與實際 WASM |
| `5d80187` | 獨立凍結原 JS 準備觀測 helper                             |
| `f6700ce` | 所有權明確的準備 adapter 與實際核心 parity                |
| `feab20c` | 正式 renderer／layouter 接線及必要 feature ABI 驗證       |
| `916022d` | 正式 layouter routing／共享 WASM 所有權驗證               |

Rust 模組回傳附近索引、七個動態偏移與座標軸，評分直接重用索引。JS 保留物件、中繼資料、穩定排序及 JSON 簽章。token、K、revision 與矩形 bits 約束準備結果的使用時機；winner 欄位只作輸出。

## 原始失敗與後續結果

`raw-log-index.json` 保存每份原始紀錄及 gzip 的 bytes／SHA256。原始 RED 保留，不以後續通過覆寫。

| 紀錄                              | 原始結果及修復界限                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust first test                   | 18 PASS／1 RED；溢位案例預期 `-1`，既有評分器實際回傳 `0`。修正測試預期，另用既有評分器核對                                                        |
| Rust second test／root rust first | 測試整數與 f64 型別歧義；補明確型別                                                                                                                |
| Rust first clippy                 | range style 違規；改用 range contains                                                                                                              |
| Pinned component checks           | Rust 1.97.1 缺 rustfmt／clippy；保留環境錯誤後安裝同版本元件                                                                                       |
| Rust pinned final                 | 23 PASS，含 12 個新測試；clippy warnings-as-errors 與格式檢查通過                                                                                  |
| Artifact first check              | producer 檔經 Prettier 後來源 SHA 改變；重新生成 manifest，WASM binary SHA 維持相同                                                                |
| Root first types                  | TS2532，協定測試 indexed value 可能 undefined；補明確 non-null index                                                                               |
| Integration first                 | 7 PASS／1 RED；fixture 已追加 placed 矩形，實際偏移為 `{0,14}`，原測試錯誤預期 `{0,0}`。改為比較 grow 前後實際結果，沒有因此修改 adapter／核心算術 |
| Integration final                 | 8 PASS，含正式 routing、快取與大型合法場景                                                                                                         |
| Formal first                      | 23 PASS／1 RED；原 spy 只計舊 score 呼叫，漏算新準備核心                                                                                           |
| Hook first lint                   | fixture spy 的 Function 型別觸發兩個 unsafe 錯誤；補明確函式型別，不改實際 Function                                                                |
| Formal fixed                      | 27 PASS；維持原 `>1000` 條件，計入實際新核心呼叫                                                                                                   |

Rust 新控制包含附近索引順序、嚴格邊界、遠處座標軸、SameValueZero、subnormal、合法溢位、MAX_SAFE token、過期準備、malformed 非修改與 capsule 普通拒選。另有 320 個 deterministic prepared／既有 scorer 核對；這個核對本身不能取代獨立 JS 準備 oracle。

獨立 JS oracle 與完整 raw 由 [oracle 證據包](../geographic-preparation-oracle-sim3/README.md) 保存。傳輸模式依據另見 [capacity 證據包](../geographic-preparation-capacity-sim3/README.md)。本包保存實際 adapter 及正式 routing 的終止結果，不重算或改寫原 oracle。一般與 CAPACITY 都使用真正 Rust scorer；CAPACITY 是預先選定的資源模式，初始化／ABI 錯誤仍 fail closed。

## 重現與證據界限

Rust 本機命令使用明確的 pinned toolchain：

```sh
cargo +1.97.1 test --manifest-path rust/engine/Cargo.toml
cargo +1.97.1 clippy --manifest-path rust/engine/Cargo.toml --all-targets -- -D warnings
rustfmt +1.97.1 --check --edition 2021 rust/engine/src/geographic_preparation.rs rust/engine/src/geographic_preparation_tests.rs
```

## 固定來源全量結果

Root 在獨立固定 worktree 執行完整 suite：**6392 PASS／1 FAIL／1 skip**，691 files（689 PASS／1 FAIL／1 skip），129.87 s，exit 1。唯一失敗仍是 s1560 seed=15600519、day450 的 no-heir 領土 invariant；原 INV-02／INV-22 診斷完整保留。沒有修改其期望、接收者規則或 skip。

前後 snapshot 的 **1494 個 tracked source/config 檔案 bytes/SHA 完全相同**，且符合固定 Git blob。snapshot 原 scope 排除 public、dependencies 及 binary outputs；不能把它當成全部 repo／依賴樹證明。本包另保存實際 WASM 與 producer manifest。

Actual WASM 為 **88475 bytes**，SHA256 `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`。它加入 preparation ABI 1，保留既有 path／geo／castle ABI。Source archive 封存 33 個固定 Git blobs，包含本階段來源與直接契約；它不是完整 repository 匯出。重現完整 suite 需先 checkout 上述 commit。

本包不執行新 GPU timing，也不把測試 duration 或 log 內 Node bulk-packing diagnostic 當 native FPS 指標。早期 transient source 沒有逐次完整 snapshot，原始失敗 log 只證明當次診斷；固定 archive 對應最終候選。

固定候選的 typecheck、完整 lint、production build 與 bundle check 全部 exit 0。Build 的 chunk-size warning 保留在原 log；bundle budget 通過。Checks 後的第三份 1494 檔 snapshot 也與 before 完全相同。

早期 raw 的部分命令只保留 stdout/stderr，沒有獨立 exit metadata；本包不由空 log 推導成功。最終 exit 值依 root 的已終止執行紀錄，並保留對應原 log。

```sh
python3 docs/validation/2026-10-12/completion-audit/geographic-preparation-local/verify-evidence.py
```

Verifier 核對壓縮前後 SHA、33 個 source blobs、artifact source SHA、1494 檔 snapshot 與原 log tally。它不重新執行測試、遊戲或 timing。
