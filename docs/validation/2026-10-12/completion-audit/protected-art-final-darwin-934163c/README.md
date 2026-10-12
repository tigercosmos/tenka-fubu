# 最終 Darwin 六圖審查的三張候選

固定 `934163c`、1280×720、原 headless Chromium／Metal 設定，執行原 `visual.spec.ts` 的五項：required layers、analysis overlays、grayscale、HUD focus／contrast 四項通過；三視角 snapshot 的同一項仍 RED。原 100 changed-pixel allowance 不變，overview／operational／close 分別為 185,869／269,381／291,228 pixels。原 expected／actual／diff 與完整失敗 log 均保存。

| 視角        | 最終 actual                             | 原門檻差異圖                          |
| ----------- | --------------------------------------- | ------------------------------------- |
| overview    | [候選](strategy-overview-actual.png)    | [差異](strategy-overview-diff.png)    |
| operational | [候選](strategy-operational-actual.png) | [差異](strategy-operational-diff.png) |
| close       | [候選](strategy-close-actual.png)       | [差異](strategy-close-diff.png)       |

相對 [上一組 Darwin 候選](../protected-art-integrated-darwin/README.md)，exact RGB changed pixels 為 17,065／19,258／21,509，全部位於右上報告提示區域（bounds 見 `previous-to-final.json`）。這個比較不是原 snapshot 門檻算法，兩組數字不能混用。三張最終 actual 已實際檢視，文字及地圖仍可辨讀；正式 protected gate 仍須人工決定。舊候選保持，沒有取代任何 reference。

程序啟動前已建立唯一 log／output／report。原生前後 1,589 個來源 hash 相同，與 [整合來源證明](../ui-integrated-934163c/README.md) 的 exact Git 輸入一致。此執行沿用工作區依賴，沒有宣稱 fresh npm ci。Launch 使用原 Darwin Metal flags；沒有在 snapshot 當頁讀取 GPU identity，不能把 flags 當成硬體身分證明。大型原始 trace 保留在 `external-traces.json` 所列的本機路徑及 hash，沒有宣稱已隨 Git 保存。

這三張與 [最終 Linux 三張](../protected-art-final-linux-934163c/README.md) 合成新的六張待審查版本，取代先前尚未回覆的審查提案；仍未收到人工核准。執行 `python3 verify.py` 可核對 hashes、原 RED／四 PASS、來源前後及原 references 的 Git bytes。
