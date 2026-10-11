# 後續驗收與人口校準觀察

候選版本 `2474139` 的 WASM／Worker 工作已提交，完整專案目標仍未完成。
目前繼續處理核心加成與原生視覺驗收；不更新凍結 golden 或放寬視覺門檻。

## 人口校準

使用目前的 `loadS1560Scenario()` 解析完整資料束，再於 sim4 的 Node 執行。
344 郡合計石高 17,994,000、人口 6,033,500，人口／石高為 0.335306。
這不支持 `plan/15-balance.md` §3.4 的「郡人口 ≈ 郡石高」推導假設。
`plan/14-scenario-data.md` §3.1 的初值公式則使用約 0.33 倍人口。

目前 `soldiersPerPop=0.025` 的人口項合計，相當於每石 0.008383 兵。
此觀察**只計人口項**，不含城格基礎兵力、設施或政策，不是總兵力上限或遊戲平衡結論。
完整逐郡資料保存於 [population-calibration.json](population-calibration.json)。
尚未更動人口、兵力公式或平衡數值；校準方向已向使用者詢問。

## 重現

在此目錄將 `population-calibration-probe.ts.txt` 複製為 `population-calibration-probe.ts`，執行：

```sh
npx esbuild population-calibration-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/tenka-population-calibration.mjs
node /tmp/tenka-population-calibration.mjs
```

擷取程式使用相對路徑，須放在本目錄才會載入正確來源。完成後移除臨時 `.ts` 檔。
