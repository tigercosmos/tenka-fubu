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

`68e96a6` 的常數 audit 精確比較 591 個值，無值差異，當時仍有兩個未解問題：反應式 AI 檢查預算與兵力校準。三項延後常數保留原始缺席列與來源決策證據；不將鐵砲加成套到現行無兵種的 Army，也不加入不可達卒年 fallback 的孤兒常數。完整報告仍為 `passed: false`，見 [balance-current.json](balance-current.json)。

## 重放版本標記

新增 `facSmithyAtkBonus` 後，BAL 雜湊由 `824f87bf28bccf9a` 變為 `a5f30428e47ab0f4`。11 個較新 M6 重放案例在原標記與新標記下，使用正式重放函式都得到完全相同的原始凍結 `finalHash`。
`49c697b` 因而只更新這 11 個案例的 `balanceHash`；指令、finalDay 與 finalHash 全部不變。證據限制為最終狀態，案例未記錄歷史每日 checkpoint，不能宣稱逐日比對。
檢查器會在寫入任何檔案前驗證所有候選，並以完整 JSON 比對確定除版本標記之外沒有欄位變化。寫入前後 SHA256 與指令 SHA256 見 [replay-balance-metadata-migration.json](replay-balance-metadata-migration.json)。
完整重放測試 56 項中 54 項通過，當時僅兩個來源未解的較舊案例仍失敗；沒有替換它們的 finalHash。

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

## 後續分步提交

`3686129` 修正河面測試的座標 oracle：平面湖泊的實際繪製點建立相機，所有湖泊點及城堡的地形位移另行驗證。舊 oracle 以未計高度的城堡座標建立倍率，與實際湖泊位置相差約 7–9 CSS px。原有 48 個取樣站、河內安全界線、道路／海岸排除、重複量測及 RGB 範圍 3–18 不變。sim2 原生測試修正前失敗，修正後通過；Kiso 範圍為 6.333／7／9，Yodo 為 7.333／6／7.667。原始前後資料見 [river-projection](river-projection/)。

`189c2c8` 的 03 §8 D23 是新的明示衝突裁決：依 02 對 09 的行為委託，保留所有受影響勢力的當日事件反應，廢止早期背景輪詢的八家預算。型別沒有 cursor 不被當作歷史廢止證據。九個不同受侵 owner 的受控 fixture 各在當日產生反應意圖，重複事件及分離快照結果一致；空事件既有 Proxy 測試證明不讀 state。測試安排抵達位置，不宣稱自然模擬產生九場同日入侵。
`e86de08` 的 audit 只承認附 03 §8 決策編號與明示不進 BAL 的廢止註記，並拒絕恢復該常數。614 列、591 個比較值、23 個原始缺名列均保留；排除列為 22，唯一未解問題為人口／石高校準，報告仍失敗。相關本機 70 項、sim3 反應式 9 項測試通過；見 [reactive-retirement](reactive-retirement/)。

`03ab4d3` 找回並保存與舊 BAL `7634217400759e66` 相符的完整歷史來源，重現政策循環原始雜湊。每十日完整狀態、事件及指令與現版比對，只有 saveVersion 3→4 與兩個勢力新增零值 rewardGoldSpentThisMonth 欄位。這些變更對應 16 D18／06 D17 的既定遷移，因此只更新該案例的 BAL 標記與最終雜湊，指令及 finalDay 不變。新測試驗證精確三欄差異，其餘完整狀態一致；全部重放 57 項有 56 項通過，M4 案例仍失敗。歷史來源 archive、逐檔 SHA256、原始狀態及重現指令見 [policy-cycle](../golden-provenance/policy-cycle/)。這不證明其他 golden 的漂移原因。

## sim4 主執行緒記憶體檢查

以凍結 `68e96a6` 在 sim4 NVIDIA RTX 5070 Ti、驅動 595.91.07、Node 22.17.0 執行 headless GPU Chromium。首次執行缺少瀏覽器而失敗，安裝後同一測試通過（29 秒）；兩份紀錄均保存。先暖機十次，再量測二十次 remount，每次 GC 後記錄 heap。資源數量、單一畫布及字型快取保持一致，沒有 WebGL context loss；字型 atlas 為 10、2D context 為 16、BitmapText 為 60。

heap 由 20,639,260 增至 22,322,888 bytes（+1,683,628）；測試沒有 heap bytes 上限斷言，此次通過不證明整體 heap 穩定。這是主頁 V8 isolate，不包含 Worker 或 GPU 記憶體。原始 21 筆數據、日誌、環境及快照 SHA256 見 [remount-sim4](remount-sim4/)。

`125f582` 另修正城下町材質取樣以實際 sceneGeometry 為準；核心平面 geometry 仍獨立用於地理安全驗證。四視圖的湖泊相機、城堡高度及逐屋剛性位移檢查通過，駿府近景的原牆面可見性斷言仍失敗。駿府數據完全未變，清洲的地形位移取樣問題不被用來隱藏此失敗；原始前後資料見 [settlement-projection](settlement-projection/)。必要軍隊名牌覆蓋駿府牆面，art-bible §10 的有界避讓允許殘餘遮擋，目前未改名牌、材質或斷言。

主執行緒快照的指定-before renderer 與 Pixi Application ID 在二十次掛載後均不存在；兩份快照各有一個 renderer、一個 app、237 個 Graphics 及 60 個 BitmapText。這只證明特定舊 ID 沒有留存，不證明沒有其他洩漏。原始快照 gzip 與 shape/root-path 分析 gzip 保存在 remount-sim4，可用 tools/perf/heap-retainers.ts --pair 重現。

`bfa37db` 修正 heap 分析器把 V8 ELEMENT／HIDDEN 的有號數值標籤誤當非負 index 的問題。V8 14.9 serializer、header 及 writer 的直接來源證據保存在 source-proof.json；字串表 index 與 target offset 仍各自嚴格檢查。兩個新回歸在舊程式失敗，修正後 12 項通過；同一對原始快照在舊分析器失敗、修正版成功。

## 本機整合檢查

工作樹完整測試為 668 檔，6,245 項通過、9 項失敗、1 項跳過，耗時 143.48 秒。這輪開始於政策重放更新後，期間另有 heap 分析器及 E2E 分步提交，不宣稱是後續所有提交的凍結候選全量驗收。七項已知核心問題以外，另有事件流程五秒逾時及道路指令雜湊差異。兩個新失敗檔案隨後原樣重跑：事件流程全部通過，道路雜湊仍失敗（合計 8 通過、1 失敗）。原始完整失敗與重跑均保存於 [local-checks](local-checks/)，不將重跑通過改寫為原輪通過。

typecheck、production build 與 bundle budget 通過。第一次 lint 只失敗於四個新增證據 JSON 的格式；原始 bytes 另存 gzip 後已格式化，最終 lint 另行驗證。這些結果不清除核心、藝術或長期平衡 gate。

`ce7cced` 的 M4 重放更新亦保存可重現原始 finalHash 的 harvest 歷史來源。61 個逐日完整狀態的事件及指令一致；首次實際結算差異是第十日的城防整數寫入（07 D54／02），最終六個不同欄位為既定格式／獎賞記帳遷移，以及攻城勝利 30×主將 1.5＝45 的功績與兩項經驗（06 §3.5）。新增測試從原始傷害重新推導整數寫入，並核對完整狀態其餘欄位一致；沒有任意替換記錄的狀態。最終重放 15 檔、58 項全部通過，finalHash 驗證維持原樣。原來源 archive、190 檔 SHA256 及重現指令見 [m4-siege](../golden-provenance/m4-siege/)。其他三項 golden、合戰 transcript、B8 及全國繼承不變量仍未清除。
