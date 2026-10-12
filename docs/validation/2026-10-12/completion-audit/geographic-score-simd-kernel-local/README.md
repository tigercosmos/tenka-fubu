# Prepared overlap SIMD 完整核心隔離原型

固定來源 `c5c7e551da0e39f4bdca55e5b92d415a57c67dc7`，runtime 為 accepted feab／scalar **642**，不含已撤回的 endpoint 候選。只修改隔離副本；沒有正式預設、browser、GPU、FPS 或效能宣稱。

Prepared scorer 使用 `#[target_feature(enable="simd128")]` 的 wasm32 helper。X／Y 保持各自 lane，依原順序 add、min/max、sub，再 extract X × extract Y。沒有 pmin、relaxed 指令、FMA 或重新結合。原 geographic／legacy scorer、準備階段 intersections 及 capsule 算術維持原樣。

| 檢查                      | 實際結果                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 原 recipe scalar baseline | 88475 bytes，SHA256 `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`，byte-identical frozen 原產物 |
| 完整 SIMD prototype       | 88469 bytes，SHA256 `4ba2591c5205e363f92ee896c6f40c441fb2a7d613e587a2fe6aa2aee0408d0a`                               |
| 實際 compiled WASM parity | 2121：1920 原 JS 衍生合法 steps、5 明示 synthetic offsets、196 通過原矩形驗證的 extreme frames                       |
| 實際 malformed 非修改控制 | 24 PASS，prepare／score 結果與 baseline 相同，輸出保持不變                                                           |
| Node module／ABI          | 兩個 module 都 validate／instantiate 成功；engine／geo／castle／preparation ABI 都為 1                               |
| Native Rust               | 23 PASS，**只驗證 scalar reference，不證明 SIMD**                                                                    |
| Clippy                    | native 與 wasm32 target 的 warnings-as-errors 都通過                                                                 |
| 實際反組譯                | f64x2 min 1／max 2／add 4／sub 3／extract 2；pmin、pmax、relaxed 指令皆 0                                            |

數值比較保留非 NaN 的 f64 bits；NaN 比分類，不宣稱 NaN payload 相同。Extreme frames 包含 MAX_SAFE token、±0、subnormal、1e200、±MAX 及 epsilon；完整 raw 保存 11412888 bytes，沒有摘要或截斷。

## 所有權、失敗與限制

隔離目錄為 `/tmp/tenka-c5c7e55-simd-prepared-sim1`。原 recipe 使用 Rust 1.97.1 locked release；依賴重用 main node_modules，沒有 fresh 安裝宣稱。`source-proof.json` 核對 shared geographic before／after SHA，並核對 score 前原 prepare prefix 完全相同。

唯一前置失敗是唯讀 provenance 查找使用 scratch 相對路徑，得到 FileNotFoundError。工具回應的抄錄及界限保留；它不是 compiler 或數值 RED。絕對路徑查找後成功。所有 build／parity 控制的原始紀錄另保存。

目前 wasm32 分支無條件使用 SIMD，native cfg 的 scalar reference 不是 browser fallback。它不能直接成為正式預設；未來需先決定 supported capability 與初始化前的真正 scalar／SIMD 雙產物選擇，並驗證完整 browser／Worker 路徑。本包沒有驗證這些設計。

Standalone arithmetic probe 見 [先前證據](../geographic-score-simd-probe/README.md)。本包的證明來自真正完整 module 的 `geo_score_prepared`，不以 standalone 或 native scalar 通過替代。

## 原命令與核對

Baseline build 先於修改；修改只在 `score_prepared` 將 overlap 呼叫接至 prepared-only helper。

```sh
npm run wasm:build > evidence/baseline-build.log 2>&1
rustfmt +1.97.1 --edition 2021 rust/engine/src/geographic_preparation.rs
npm run wasm:build > evidence/prototype-build.log 2>&1
/opt/homebrew/opt/llvm/bin/llvm-objdump -d evidence/prototype.wasm > evidence/prototype-disassembly.txt
npx tsx evidence/simd-parity.ts > evidence/simd-parity-extreme.log 2>&1
node evidence/malformed-and-abi.cjs > evidence/malformed-and-abi.log 2>&1
cargo +1.97.1 test --manifest-path rust/engine/Cargo.toml > evidence/native-scalar-reference-tests.log 2>&1
cargo +1.97.1 clippy --manifest-path rust/engine/Cargo.toml --all-targets -- -D warnings > evidence/native-clippy.log 2>&1
cargo +1.97.1 clippy --manifest-path rust/engine/Cargo.toml --target wasm32-unknown-unknown -- -D warnings > evidence/wasm-clippy.log 2>&1
```

第一次 compiled parity 先完成 1925 案例；加入必要的 196 extreme frames 後再執行完整控制，原 summary log 保留。它不是 timing retry。

```sh
python3 docs/validation/2026-10-12/completion-audit/geographic-score-simd-kernel-local/verify-evidence.py
```

Verifier 只核對 raw 雙 SHA、實際來源綁定、反組譯與完整記錄，不重跑 compiler、WASM、遊戲或 timing。
