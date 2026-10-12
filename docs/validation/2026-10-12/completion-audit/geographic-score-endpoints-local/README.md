# Prepared score 候選端點隔離驗證

來源固定 `c5c7e551da0e39f4bdca55e5b92d415a57c67dc7`，runtime 仍為 feab20c。這一步只修改隔離副本，**沒有正式來源修改、GPU 或效能測量**。完整候選 diff、來源、編譯產物及原始紀錄保留於本包。

修改只在 prepared scorer 預算原矩形及每個 eligible moved 矩形的 `x+width`／`y+height`。它保留 moved `x+offset` 後才加 width、明確 `+padding`（包含 `+0`）、JS min/max、減法、乘法、fold 與平手順序。舊 `geographic.rs`／`geo_score` 完全不變。

| 檢查                              | 實際結果                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 原 recipe baseline                | 88475 bytes，SHA256 `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`，與固定產物 byte-identical |
| 候選 recipe build                 | 89761 bytes，SHA256 `69af4226d451a71211b209101cc4223045b1aeca2f1178d16e9beaa91166b736`；增加 1286 bytes           |
| 原 Rust 測試                      | pinned 1.97.1，23 PASS                                                                                            |
| 永久 actual-helper 測試           | 24 PASS；1,169,294 組 f64 網格與 40 組 touching ULP／±epsilon 案例                                                |
| Clippy／格式                      | warnings-as-errors／rustfmt 全通過                                                                                |
| 真實 baseline／candidate WASM ABI | 1925 案例，完整輸入／prep／score 輸出相同；非 NaN 比 bits，NaN 比分類                                             |
| 加入永久測試後重建                | 候選 WASM bytes／SHA 完全相同，manifest 的 test source SHA 更新                                                   |

Binary 不同，因此不能把這次改寫判定為已被 LLVM 消除。增加體積也不證明執行較快；新 helper 的 outlining、參數傳遞或指令布局可能抵銷算術減少。採用及 native 測量仍待 root 決定。

## 測試邊界與原始失敗

永久測試直接呼叫 `super::overlap_candidate`，以未修改的 `crate::geographic::overlap` 為 oracle，沒有複製新 helper。它保留 NaN 分類與其他 f64 bits，涵蓋 ±0、subnormal、溢位及非有限中間值。原 standalone 複製 helper 網格也保留，僅作補充證據。

Compiled ABI 控制包含 320 場景的 1920 個原 JS oracle 衍生合法 step，以及 **5 個明示 synthetic prepared-offset** 案例。後者測 NaN、±Infinity、-0、subnormal；它們不是自然遊戲或原 oracle 產生的旅程。

首次工具呼叫因隔離 workdir 尚不存在而在執行前被拒絕，沒有 source／build 命令執行。永久測試初次編譯遇到 `contact.to_bits` 型別歧義；保留完整 RED、當時測試來源及 clippy 診斷，僅補 `contact: f64` 後通過。

沒有新增 blocker Vec、capsule 改動、相交 shortcut、輸入數量限制、搜尋 budget 或跨呼叫快取。Shared source 的 before／after SHA 都為 `69ed145c2ee7d445691b0897362fc6de196cbe48fd4b0c1721764e67def56768`。

## 封存與重現

`raw/compiled-parity.raw.json.gz` 保留 **10986065 bytes 完整原 JSON**，沒有摘要替代或截斷。Manifest 記錄 41 份原始檔案的壓縮前後 SHA；包含兩個完整 WASM、各階段 manifest、兩個候選來源、patches、producer、永久測試及所有失敗。

原命令、順序及 scratch 路徑見 [commands.md](commands.md)。隔離副本重用 root node_modules，沒有 npm ci 或 fresh dependency 宣稱。Native standalone executable 與其他 target outputs 不列入包，完整測試來源及 compiler logs 可供重現。

```sh
python3 docs/validation/2026-10-12/completion-audit/geographic-score-endpoints-local/verify-evidence.py
```

Verifier 只核對 bytes、SHA、actual-helper 綁定、完整 raw 案例與記錄的結果，不執行 build、遊戲或 timing。
