# 後續驗收與人口校準觀察

候選版本 `2474139` 的 WASM／Worker 工作已提交，完整專案目標仍未完成。
目前繼續處理核心加成與原生視覺驗收；不更新凍結 golden 或放寬視覺門檻。

## 已完成修正

`8615dc1` 套用既定鍛冶場攻擊加成。每次計算查詢仍屬部隊勢力的出陣城，只有已落成施設生效；攻擊與戰法的套用範圍見 07 §8 D57。未新增兵種欄位或改動既有平衡值。

新增回歸測試在原版本有四項真實失敗；修正後六檔 123 項測試通過，sim3 另有戰術與 audit 合計 77 項通過。實際攻城指令案例證實敵方損失提高、城方反擊損失及 RNG 不變。09 的簡化 AI 估算公式維持既定契約。

`011c5b8` 校正兩個原生視覺測試的座標與前置狀態。相機倍率由獨立的顯示節點位置推導，並逐城驗證投影；不再以未計地形高度的核心座標推導。郡材質量測前清除原生選中狀態，避免金色道路高亮蓋住領色取樣點。原有 RGB、透明度、40／30 世界單位尺寸及命中優先序斷言保留，安全取樣郡增加至四個。四項測試在 sim2 headless GPU 通過。

新版本 `011c5b8` 已於 sim2 重新執行上述四項及六項 Worker 測試，10 項全部通過，耗時約 1.1 分鐘。原生 Worker 的完整局面、RNG、指令紀錄、存讀檔、取消及最終地圖比對仍通過。
最新無 profiler 樣本的正常 ×5 最長畫面間隔為 Worker 107.0 ms／同步參考 130.4 ms，最長工作為 85／68 ms，總時間為 3604.9／3545.0 ms。這一輪沒有重現上一輪 82.6 ms 的 Worker 最長間隔，且最長工作較差；兩輪原始資料各自保留，不擇優合併或宣稱穩定幀率。
原始紀錄、像素資料、尺寸資料及來源 SHA256 見 [browser-011c5b8](browser-011c5b8/)。所有 JSON gzip 保存原始解壓後內容；`summary.json` 及 `visual-json/manifest.json` 提供 SHA256。

`e0c5d25` 修正實際城名牌缺陷：精簡模式曾隱藏必讀兵數。保留原核准字體、間距與完整封套，讓數字、底色區、分隔線和兵數圓點持續顯示，不修改 renderer 的選取或 LOD 規則。
岐阜城近景兵數的實際尺寸由 0×0 恢復為 19.8×15.12 CSS px，與原操作景一致。新回歸測試在舊程式有兩項真實失敗；修正後 145 項元件／renderer 測試及三項未放寬的原生可讀性、遮擋、材質測試通過。證據見 [castle-count](castle-count/)。

## 完整驗收尚未完成

sim1 的原版本 `2474139` 完整測試為 667 檔、6224 項通過、8 項失敗、2 項跳過。這是原版本的結果，不能當作新增鍛冶場修正後的完整測試結果。
失敗包含 AI／外交／mini golden、合戰 transcript、兩個 frozen replay、B8 合戰雜湊，以及第 450 日齋藤無繼承人滅亡後仍持有四城十六郡的不變量。原始紀錄見 [full-suite-2474139.log](full-suite-2474139.log)。

sim3 另以逐檔 git blob 驗證的 `011c5b8` 跑完整套件：667 檔、6193 項通過、47 項失敗、2 項跳過。
隨後更新為已校驗的 `e0c5d25`，重跑全部 22 個失敗檔案及兩個受影響 UI 套件：24 檔、201 項通過、8 項失敗。
額外 39 項失敗在已證明狀態不變的版本標記更新後全部消失，剩下的八項名稱與原基準完全一致。
這是「完整測試加所有失敗檔案重跑」，不是一輪全新的 `e0c5d25` 完整測試，也不是全綠。
完整前後紀錄、失敗集合比較及 1656／1657 檔來源校驗見 [regression](regression/)，原始 bytes 以 gzip 保存；[raw-sha256.json](regression/raw-sha256.json) 記錄解壓後 SHA256。

目前常數 audit 精確比較 591 個值，無值差異，仍有兩個未解問題：反應式 AI 檢查預算與兵力校準。三項延後常數保留原始缺席列與來源決策證據；不將鐵砲加成套到現行無兵種的 Army，也不加入不可達卒年 fallback 的孤兒常數。完整報告仍為 `passed: false`，見 [balance-current.json](balance-current.json)。

## 重放版本標記

新增 `facSmithyAtkBonus` 後，BAL 雜湊由 `824f87bf28bccf9a` 變為 `a5f30428e47ab0f4`。11 個較新 M6 重放案例在原標記與新標記下，使用正式重放函式都得到完全相同的原始凍結 `finalHash`。
`49c697b` 因而只更新這 11 個案例的 `balanceHash`；指令、finalDay 與 finalHash 全部不變。證據限制為最終狀態，案例未記錄歷史每日 checkpoint，不能宣稱逐日比對。
檢查器會在寫入任何檔案前驗證所有候選，並以完整 JSON 比對確定除版本標記之外沒有欄位變化。寫入前後 SHA256 與指令 SHA256 見 [replay-balance-metadata-migration.json](replay-balance-metadata-migration.json)。
完整重放測試 56 項中 54 項通過，僅兩個來源未解的較舊案例仍失敗；沒有替換它們的 finalHash。

較舊 `7634217400759e66` 標記在檢查過的 BAL 提交版本中未找到匹配。雜湊演算法及排序沒有相應變更；AI 命令／事件計數也有實際差異，不能只歸因於版本標記。來源與差異診斷見 [balance-hash-history.json](balance-hash-history.json)、[golden-drift.json](golden-drift.json)。

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

純文字 log 僅移除行尾空白及結尾多餘空行；gzip 原始資料完整保留 bytes，並以解壓後 SHA256 校驗。
