# Worker transport／reconcile 唯讀審查

審查固定 `e691755b1b40dd7f9e9249417c09d80f8aa67160`，**沒有 source 修改或新 timing**。11 個實際讀取來源的 byte／SHA 保存於 provenance 與 source archive；這些檔案與先前 04c7b60 全相同。一次 bounded graph 查詢未找到 `reconcileSnapshot`，改用直接來源，不把缺 graph node 當成未使用證據。

## 可重現的非 timing 計數

使用已提交 `worker-batch-overhead-sim1/default-observation.json.gz` 的真實第 1／121 天 checkpoint，以及 canonical event definitions；producer 為本機 Node **22.17.0**。原 script／輸出 bytes、input／source SHA 和壓縮前後 SHA 保存。

| JSON checkpoint／目錄             | Compact UTF-8 JSON bytes | Object occurrences | Array occurrences | Scalar occurrences |
| --------------------------------- | -----------------------: | -----------------: | ----------------: | -----------------: |
| Day 1 state                       |                   772010 |               4546 |              1199 |              38263 |
| Day 121 state                     |                  1042976 |               7357 |              2481 |              48889 |
| 21 個 canonical event definitions |                    29988 |                331 |               159 |               1046 |

Day 1 大分支：officers 447210 bytes、districts 139063、castles 77882、roads 61800。完整分支計數在 `payload-analysis.json`。

**JSON bytes 不是 Chromium structured-clone wire bytes；tree occurrences 不是保留別名的 unique graph nodes。** 已存 JSON 不保留物件別名，不能用這些數字證明實際傳送量、配置量或毫秒收益。事件目錄約占 day 1 JSON 的 3.9%，也不是已量出的傳送成本比例。

## 明確來源結論

1. Main 每 tick 發送完整 state 和 event definitions：`src/app/worker/client.ts:260-278`；bridge 取 `sessionEventEngine.getDefs()`：`src/app/bridge.ts:434`。
2. `getDefs` 每次建立新 array，且 catalog 包含原 EventDef object references：`src/core/systems/events/engine.ts:325`。Worker 的 content JSON fingerprint：`src/app/worker/simulation.worker.ts:96-101`，會察覺內容變動。**不能盲目改成 array／engine identity cache**；需要先建立 immutable catalog 或明確 revision／ack 契約。
3. Worker 先 reconcile inbound state，之後才啟動 `advanceDay` timer：`simulation.worker.ts:92-107`。現有 `computeMs` 不涵蓋 inbound reconcile、event JSON fingerprint、clone 或初始化，因此不能把 core compute 與總 wall 的差全部當成 transport。
4. `advanceDay` 回傳原 state：`src/core/systems/index.ts:283-284`；Worker reply 的 `state` 與 `result.state` 共享同一個物件：`simulation.worker.ts:123-124`。Structured clone 保留共享參照；**不是兩份獨立 full-state 複製**。用 naive JSON 算兩倍會誤判。
5. Main 在 identity／version／queue／tick guard 通過後 reconcile：`bridge.ts:445-454`。兩個 WeakMap 保留 source aliases 並避免把 distinct source 合成舊 target alias：`src/app/worker/reconcile.ts:8-50`。`worker.spec.ts:298` 與 `:311` 分別驗證 alias split／restore；identity／stale guards 位於 `:270`，Worker-owned persistent identity 位於 `:345`。
6. 每 tick 同版本不代表兩側 state 必然相同。取消／讀檔／戰術／event 等邊界需要完整同步與 ownership 防線。省略 inbound full state 需要新的受保護 dirty tracking／revision／resync protocol 與全 mutation 審查，超出窄幅微優化。

## 下一步與安全邊界

唯一窄候選是 **primitive recursion inlining**：array／object 子值為 null 或非 object 時直接取值，物件仍照原路徑經兩個 WeakMap、遞迴、原參數求值／寫入順序與 `__proto__` defineProperty。不能用 shallow equality 跳過物件，也不能移除 aliases／deletion／array trimming／stale response guards。

它只可能減少立即返回的函式呼叫；V8 可能已 inline，**目前沒有可主張的收益**。先前 default profile 對應同一 reconcile source 的 self sample 合計 381.157ms／120 replies，不是此候選的量測，也不含 Worker inbound reconcile。沒有實作此候選；優先處理較有證據的 geographic 工作。

若之後測此候選，先補有意義的 alias split／restore、共享 reference identity、key deletion／array trimming、own undefined、`__proto__`、-0／NaN 的 Object.is parity 與完整 state／RNG／log／command／cancel／version controls；再用實際 compiled Worker 和相同 native workload，比 main publication 與 inbound reconcile，保留原始正負結果。僅減少 source 呼叫數不能當成成功。

```sh
python3 docs/validation/2026-10-12/completion-audit/worker-transport-source-review-sim1/verify-evidence.py
```

Verifier 使用 Node 做獨立非 timing JSON 計數，核对 raw／source／input SHA 與全部 branch counts，不啟動遊戲、Worker 或 browser。原 producer 保留實際觀測路徑；獨立 verifier 不依賴原 `/tmp`。
