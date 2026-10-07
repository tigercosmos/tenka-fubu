# M6-V11 視覺 gate 檢查記錄

本記錄對應 Art Bible 的資訊層級、第二辨識通道、HUD safe area 與 dirty update 原則。
當前驗收包含 M6-V10 分析主題，以及 V8／V9b 留下的互動與初始化問題。

## 畫面變更與基準

舊畫面沒有分析控制列。新畫面在左上方增加可收合的控制列，主戰場與底部情境面板保持原位。
初始化完成後重新套用最新路徑與選取狀態；原本載入期間遺失的選取環與路徑現在可見。
Pixi 初始化前先載入 Noto Serif TC，避免 BitmapText 固定使用尚未完成載入的 fallback 字形。

三張基準按 darwin／linux 分開保存。Linux 使用 Playwright 1.61.1 Noble 容器；
更新後必須另跑 compare，不能把更新成功當成可重現證據。門檻為最多 100 changed pixels，
threshold 0.15；細道路與必要層另由有效 drawable 檢查保護。

灰階 operational 截圖已人工檢視：城格／旗型、選取雙環、軍隊方向與道路線寬仍可辨識。
勢力模式另用圓環、三角形與菱形區分友軍、敵軍與中立軍；不依賴顏色單一通道。

## 記憶體問題與修正

最初 remount 的 texture 與 listener 計數不變，但 post-GC heap 持續增加。
兩份 heap snapshot 顯示 20 次 remount 多出 60 個 512×512 字型 atlas canvas。
原因是 Pixi 以帶 halo 的 TextStyle **實例 identity** 作 bitmap font cache key；
每次建立三個勢力名就建立三份新 atlas。

勢力名改用「固定勢力色盤 × 三種字級」的共享樣式，限制 cache 大小。
銷毀文字前經公開 style setter 解除共享樣式的 update subscription，再銷毀暫時的自有樣式；
不能直接銷毀共享樣式，也不能移除其他文字的 listener。
驗收會比較暖身前後的 font canvas、2D context 與 BitmapText 實例數，並保存 post-GC heap 原始樣本。

## 執行方式

```bash
npm run typecheck
npm run lint
npm test
npm run validate:data
npm run validate:assets
npm run build
npx playwright test --workers=1
VISUAL_HEAP=1 npx playwright test e2e/visual.spec.ts --grep 'renderer remount' --workers=1
VISUAL_GPU=1 VISUAL_PERF=1 npx playwright test e2e/visual.spec.ts --grep '30-second' --workers=1
```

所有後續瀏覽器測試均使用 headless，不開新視窗。`VISUAL_GPU=1` 在 macOS 使用完整 Chromium
的 new-headless 與 Metal；一般截圖與 CI 保持可攜的 headless shell。
效能測試保存 GPU 名稱、每幀時間與 CPU update 時間，同時要求 frame time p95 ≤1000/55 ms。
軟體 SwiftShader 的失敗結果保留；不得以快端 FPS p95 或降低門檻掩蓋。

## 驗收狀態

M6-V10／V11 驗收通過（2026-10-08）：1517 個單元測試、typecheck、lint、資料／素材驗證與 build 通過。
可攜 headless E2E 為 10 passed；未啟用硬體測試時有 1 個明確 optional skip。
Darwin 與 Linux 三段基準皆另跑 compare 通過，並由 reviewer 檢視新增控制列、選取路徑與字形差異。

完整 Chromium **headless**、Apple M3 Max Metal 的 1080p／20 軍隊／30 秒量測：
3600 幀、30005.5 ms、frame time p95 **9 ms**（慢端約 111.1 fps）、CPU update p95 **0.2 ms**；
原始檔為 `/tmp/tenka-fubu-headless-metal-frame-measurement.json`。
texture／terrain sprite／listener 為 1／2／9，前後不變。

Faction 模式暖身 10 次、再重掛 20 次：font atlas canvas **7→7**、2D context **13→13**、
BitmapText **38→38**，自有 texture／terrain sprite／listener 為 2／2／9，前後不變，無 context loss。
Post-GC heap 為 10.862→11.590 MB；最後六筆為 11.540／11.574／11.522／11.606／11.568／11.590 MB，
在約 11.56 MB 周圍波動。不能把總 heap 差額稱為零；確認的 atlas／文字保留缺陷已由實例數穩態驗證。
原始樣本與快照保留於 `/tmp/tenka-final-visual-run`。

五模式的狀態回饋為 6.8／1.3／1.2／1.1／1.0 ms，皆低於 100 ms。
灰階檢視、鍵盤焦點、按鈕對比、控制列 32 px 命中區、原生 Space 操作與有效 LOD 繪製內容皆通過。
最後補上 faction 模式第五支以上缺糧／交戰／圍城部隊的可見與命中例外，正常模式的收合規則不變。
M6-V gate 已解除；整個 M6 里程碑與專案尚未完成。
