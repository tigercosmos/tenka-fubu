# 後續驗收、重放歸因與記憶體觀察

Rust WASM／Worker 架構及後續效能修正已分步提交，完整專案目標仍未完成。
最新固定來源全量測試為 6,357 通過、1 失敗、1 跳過；120 部隊近景仍未達 60 FPS。
目前繼續處理核心與原生視覺驗收；只有歷史來源與完整差異已查明時才遷移凍結基準，原生門檻維持。

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

`ce7cced` 的 M4 重放更新亦保存可重現原始 finalHash 的 harvest 歷史來源。61 個逐日完整狀態的事件及指令一致；首次實際結算差異是第十日的城防整數寫入（07 D54／02），最終六個不同欄位為既定格式／獎賞記帳遷移，以及攻城勝利 30×主將 1.5＝45 的功績與兩項經驗（06 §3.5）。新增測試從原始傷害重新推導整數寫入，並核對完整狀態其餘欄位一致；沒有任意替換記錄的狀態。最終重放 15 檔、58 項全部通過，finalHash 驗證維持原樣。原來源 archive、190 檔 SHA256 及重現指令見 [m4-siege](../golden-provenance/m4-siege/)。當時其他三項 golden、合戰 transcript、B8 及全國繼承不變量仍未清除；後續結果見下方。

## shader 快取修正與原生驗證

`efe734a` 修正私有地形 shader 名稱的永久字串快取成長。新租借配額只在自有 program 銷毀後重用名稱；同時存活者保持不同 program 物件及 key，建構失敗也歸還配額。七個新回歸在原來源全部失敗，修正後含既有控制共 20 項通過。CPU 測試檢查真實 Pixi cache lookup，但不宣稱實際 GL 編譯。

sim4 以精確核對的 714 個 source／tools 檔案跑相同十次暖機、二十次量測的 headless 掛載測試，28.6 秒通過。舊來源的實際私有 shader 字典為 34→74 個鍵，兩個 family 各 11→31 個來源鍵；新來源維持 14→14，兩個 family 各一個鍵，字典 backing 維持 416 bytes。分類程式從實際 properties backing 辨認唯一字典，不以舊 node ID 猜測。

資源與字型快取仍一致，沒有 context loss；原城名牌材質、遮擋、可讀性及河面四項 native 控制亦全部通過（27.5 秒）。另一次採相同啟動參數的原生地圖 probe 確認 Chromium 149.0.7827.55 的 WebGL2 renderer 為 NVIDIA RTX 5070 Ti／Vulkan。這個 renderer probe 是獨立 isolate，不能當作先前 heap isolate 的直接讀值。

主頁 Runtime heap 仍由 20,634,280 增至 22,255,004 bytes（+1,620,724），因此只清除指定字串字典的成長缺陷，不認定整體 heap 已穩定。snapshot self-size 包含 native backing，口徑不同；其 code 類淨增 1,008,624 bytes。保留同一 closure ID 而 code／InstructionStream ID 換新，且對應既有 app／Pixi 原始函式，支持 JIT 暖機或重新編譯的推論，快照未記錄優化 tier。Script 數量 26→26，13 個替換都為 Pixi shader／uniform 生成函式；不支持將主要成長歸因於累積 page.evaluate script。完整前後快照、字典辨認腳本、714 檔 SHA256、來源證據及歸因原始資料見 [private-program-cache](private-program-cache/)。

## 凍結來源最終測試

`f09c8d1` 道路 oracle 改查 exact GraphicsPath 指令與樣式。四組原始／現版、Mac／Linux 的 22 組指令 bytes 完全相同；舊 tessellation 的六個海浪 y 座標跨平台只差 1.421×10⁻¹⁴。未使用四捨五入、容差或 OS 排除。五個故意修改 width、alpha、FAR 幾何、海浪半徑及橋面長度的真正 producer mutation 均在精確 hash 斷言失敗。原來源、向量、SHA256 及反例見 [road-command-provenance](road-command-provenance/)。

`9464873` 的三個 golden 遷移以歷史來源及窄幅逆向控制證明：只回復既定城防整數／攻城功績、治安月結、外交功績及集結接受條件四組機制，2,880 日的完整狀態、事件與已排入／已套用指令即完全一致。唯一 schema 正規化為格式 3→4 及指定勢力確為零的獎賞欄位，沒有刪除非零支出。正式現版 summary 另先比對後才遷移，見 [goldens](../golden-provenance/goldens/)。

`6254f9d` 與 `59a8de3` 保留 B8 的十項 literal hash、非合戰 RNG 斷言及 transcript 初始／checkpoint／最終 hash 驗證。新增完整狀態與 BattleTickResult 比對：十個 B8 tick 只有既定 schema／參戰名冊五項差異；三十個 tactical tick 的完整結果都相同，終結新增勝利 40＋敬畏 20、主將乘 1.5 的 90 功績及兩項經驗。見 [b8](../golden-provenance/b8/)、[tactical](../golden-provenance/tactical/)。

凍結候選 `f446e85` 的完整測試為 672 檔、6,263 項通過、1 項失敗、1 項跳過（129.77 秒）。1,453 個來源／測試／設定檔的前後 SHA256 完全一致；typecheck、lint、production build 與 bundle budget 通過。唯一失敗仍為 s1560 第 450 日齋藤無繼承人滅亡後保留四城十六郡的 INV-02／INV-22，不修改不變量或推測領地接收規則。原始紀錄與來源 manifest 見 [final-candidate](final-candidate/)。全專案及長跑平衡驗收仍未完成。

sim4 最新六項 Worker 原生流程測試全部通過（43.3 秒），三組同步／Worker 的完整狀態與日誌一致。120 日批次最長畫面間隔為同步 1,028.1 ms、Worker 124.9 ms，總耗時為 939.9／2,511.1 ms；正常 x5 在實際自動暫停前完成 29 日，最長間隔為 128.4／84.7 ms，總耗時為 3,544.7／3,594.9 ms。互動阻塞縮短，但批次吞吐較慢，未達穩定 60 FPS。冷啟動、60 日批次及全部原始列亦保留；每種情境各一筆，見 [worker-final-sim4](worker-final-sim4/)。

`d619085` 從真實 CPU profile 定位地理標籤 edge-axis 暫存與快取命中前的候選配置；保留精確運算／候選順序後，25 項原版／邊界測試及 sim4 六項原生流程通過。三組前後完整狀態、日誌、地圖發布與每個地理標籤完全一致。正常 x5 Worker 最長間隔 84.7→60.3 ms，這筆後版樣本沒有 long task；120 日間隔 124.9→108.1 ms，仍不宣稱穩定 60 FPS。另有獨立 profiler 歸因與局部診斷，不混作無 profiler 計時；完整原始資料見 [geographic-allocation](geographic-allocation/)。

`7129f63` 修正零城勢力的普通野戰退出。正式 march／field-combat fixture 在原 source 真實失敗，修正後清除殘軍、職務及追擊引用，survivor 恢復狀態；RNG、功績及經驗不變，滅亡事件先於結局。sim1 八檔 84 項及本機 victory 十五項通過。有效戰術合戰的外部收尾尚無中止／獎賞表示，原 guard 行為保留；其真正失敗的 required-postcondition 診斷原樣保存，不轉為 it.fails 或 skip。見 [field-extinction](field-extinction/)。

包含兩項 source 修正的 `7129f63` 全量回歸：672 檔、6,264 項通過、1 項失敗、1 項跳過（128.82 秒）；唯一失敗仍為 day450 無繼承人領地不變量。型別、完整 lint、build 與 bundle 通過。1,355 個來源／測試／規格／工具／根設定檔逐一符合固定 commit 的 Git blob，測試結束後 SHA256 全部不變；manifest 採集於測試進行中，不宣稱完整涵蓋公開素材或尚未提交的 court-rank E2E。原始紀錄見 [continuation-7129](continuation-7129/)。本次不推進里程碑或清除完整驗收 gate。

## 未修改門檻的原生補驗

`fc45370` 保存凍結 `505d96a` 的 sim2 原生驗證。兩個區域九城的實際結局、繼續遊玩及存檔重載流程通過；不是全國統一結局。色覺／道路土壤復原 gate 仍失敗，完整頁面分別有 11／8 個差異像素，位置都在 HUD 圓角。合法 rAF 內擷取的地圖畫布復原完全一致，完整狀態、日誌及地形資料亦一致；不能據此修改完整頁面 oracle。

40 支實際行軍部隊的額外近景效能診斷仍失敗：30 秒窗口含月度具申自動暫停 3.5666 秒，只前進 29 日。56.40 FPS 僅為失效窗口的描述數值，不能當作效能驗收通過。完整失敗、成功控制、原始像素及 1,389 檔凍結來源 SHA256 見 [native-gates-sim2-505d96a](native-gates-sim2-505d96a/)。這組來源早於野戰退出修正，不宣稱涵蓋之後的全部提交。

`38d22b0` 補齊 M6-18 的實際具申生命週期。既有 720 日 fixture 第 30 日自然產生提案，第 31 日由 CommandQueue 正常採納，實際出陣、功績及忠誠獎賞均確認，第 60 日清理；未額外注入提案或先決條件。原有死亡、登場與每日不變量驗證保留，並確認未付俸祿事件。sim1 的 20 項測試及型別／lint 通過，從 238 檔精確來源 archive 再執行亦通過；原始 RED／GREEN 與完整事件見 [m6-lifecycle-acceptance](m6-lifecycle-acceptance/)。同目錄的逐項 M6 matrix 保留未完成驗收，未推進 checkpoint。

延長掛載診斷兩次在第 41 次總掛載失敗，第二次明確記錄地面材質不可用。原始 trace 的最後一組十二個素材請求在 response 內含 net::ERR_FAILED，雖名義 status 為 200；不是已證明的 shader 生命週期缺陷。兩次皆未完成 120 次量測，沒有 after heap，不能認定整體記憶體穩定。未修改門檻或加入重試；原始紀錄及 714 檔來源比對見 [extended-remount](extended-remount/)。

`8c0de41` 的 sim3 原生官位流程以正常朝廷工作取得恩惠：第 150 日累積 23，第 151 日排入授予指令後正常結算，金錢 1,604→1,304、威信 450→500，恩惠維持 23；UI 官位、下一級禁用條件及原生存檔重載的完整 codec 狀態一致。149 次 RAF 日結之外另有兩次合法事件選項結算，未強制注入日數、恩惠或官位。相關現版 source bytes 與凍結 `505d96a` 一致；四次觀測失敗與成功的完整原始資料見 [court-rank](court-rank/)。

具申驗證後再次全量回歸 6,264 通過／1 失敗／1 跳過（123.77 秒），唯一失敗仍為第 450 日無繼承人領地問題。型別、完整 lint、build 及 bundle 通過，1,355 個 manifest 檔案符合固定來源且結束後不變；見 [continuation-38d22b0](continuation-38d22b0/)。

## 圖片載入修正與最新整合證據

`ffcf964` 新增七項外交驗收，檢查十二個月的感情變化、敬畏的外交影響及 59.9／60 的接受邊界。四種隔離的錯誤修改都在原斷言失敗；沒有修改 BAL 或核心公式。完整原始控制與來源見 [m6-diplomacy-acceptance](m6-diplomacy-acceptance/)。

sim2 的獨立控制將延長掛載失敗定位至 Pixi 圖片 Worker 的 Blob 傳送路徑：Blob-only 在 trace／cache 四組控制都約第四十輪失敗，ArrayBuffer-only 與逐輪回收 Worker heap 的 Blob 控制則完成七十輪。原始反例、先前無效控制及完整來源均保存，不能把推論當作 Chromium 內部配額的直接測量；見 [blob-worker-transport-sim2](blob-worker-transport-sim2/)。

`2cfb2d6` 在共同素材載入入口設定 `preferWorkers: false`，保留非同步 ImageBitmap 解碼及獨立模擬 Worker。`29da33d` 的三項回歸使用實際 Pixi 8.19 parser，驗證原 Worker 路徑控制與兩種 alpha 選項；故意恢復 Worker 偏好會使兩項回歸失敗。這些是 parser 的受控解碼測試，原生瀏覽器證據另列；見 [asset-bitmap-parser](asset-bitmap-parser/)。

正式載入來源在 sim4 完成十次暖機及一百二十次量測，共一百三十次掛載；資源、字型快取及 context loss 斷言全部通過。sim2 移除逐輪人工 GC 的獨立控制也完成同樣掛載。sim4 的一百二十一個 GC 後主頁 heap 樣本由 20,890,576 增至 25,438,644 bytes，最後二十個樣本仍淨增 348,632 bytes，故不宣稱整體 heap 已穩定。完整快照與原始 bytes 見 [main-blob-final-sim4](main-blob-final-sim4/)。

最終六項原生 Worker 測試、四項原視覺控制均通過。同步／Worker 的完整狀態、日誌及前版地理標籤資料精確一致。暖機後一百二十日批次最長畫面間隔為同步 982.6 ms、Worker 101.1 ms，總耗時為 926.3／2,469.5 ms；正常 x5 的最長間隔為 106.8／61.6 ms，Worker 沒有 long task，但月底具申正常暫停，只推進二十九日。各情境各一筆，不宣稱批次吞吐改善或實際戰役穩定 60 FPS。

規格要求的二十支移動部隊、1080p、三十秒平移／縮放渲染測試原樣通過，P95 畫面間隔 16.8 ms，符合 55 FPS 門檻。這是合成 renderer 工作負載；四十支真實部隊的額外診斷不是規格指定的 M6 渲染 gate，全國約一百二十支部隊的 60 FPS 目標仍未證明。原規格對照與具申暫停原因見 [live-close-workload-audit](live-close-workload-audit/)。

凍結來源 `29da33d` 的最新完整測試為 674 檔，6,274 項通過、1 項失敗、1 項跳過（116.46 秒）。唯一失敗仍為 s1560 第 450 日無繼承人滅亡後保留四城十六郡的 INV-02／INV-22。一般／core 型別、完整 lint、build 及 bundle budget 通過；1,357 個已追蹤來源／測試／規格／工具／設定檔符合固定 Git blob，測試後 SHA256 不變。早期未完成 parser 測試的型別失敗原樣保留，沒有改寫成當時通過；見 [main-blob-final-regression](main-blob-final-regression/)。尚未推進全專案 checkpoint，領地接收及戰術外部收尾規則、整體 heap、藝術與長跑平衡驗收仍待完成。

## GPU 資源清理與全國地圖效能（最新）

`fe37e4c` 修正 Pixi 8.19 自有 GPU manager 的 unload listener 清理；其他 owner 及使用者 callback 保留。原生一百三十次掛載後，舊版累積的 14,212 個已失去 renderer 的 callback 消失，現存 manager callback 維持 430。`e25381b` 另在自有 texture batch BindGroup 銷毀時移除其全域快取項，避免取回 resources 已清空的物件。原生相同掛載控制的指定 group shape 維持 24 個（23 個存活、一個空 resources），不再由 120 增至 1,560。

兩組修正各有原來源失敗控制、實際 Pixi 單元測試、四項未修改的原生視覺控制及完整快照。最新主頁 heap 仍由 20,604,640 增至 24,374,172 bytes，末二十次淨增 155,208；不能宣稱整體記憶體穩定。不同原生輪次不是精確 heap 減量比較。證據見 [manager listener](managed-resource-listeners/)、[BindGroup cache](batch-bind-group-cache/)。

`8cdd7db` 以局部範圍減少軍隊名牌碰撞計算，`dec6b8a` 移除道路線段／矩形距離計算的暫存陣列與點物件。兩者保留原算式、候選順序、判斷門檻及輸出；凍結原版 reference、隨機／邊界案例及九份原生完整發布資料精確比對通過。道路相關 33 項測試通過。

下表為 sim3 同一隔離 GPU、相同 dependency bytes、1080p、一百二十支合法部隊、三十秒 renderer 控制的各一筆觀測。策略日結暫停；不是連續實際戰役或實體螢幕驗收。

| 視圖   | 原版 FPS／P95 ms | 軍隊名牌優化 | 道路距離優化 |
| ------ | ---------------- | ------------ | ------------ |
| 全景   | 38.73／27.1      | 59.61／17.6  | 59.87／17.6  |
| 操作景 | 25.91／42.5      | 42.98／25.3  | 42.81／25.5  |
| 近景   | 16.34／78.1      | 18.49／70.3  | 23.99／50.4  |

所有嚴格 60 FPS 控制仍失敗；道路修正沒有改善操作景。原始失敗、CPU profile、來源及 canonical/resource SHA 見 [原版 120 部隊](national120-target/)、[軍隊名牌範圍優化](national120-broadphase/)、[道路配置減量](road-capsule-allocation/)。sim3 這組比較保留原 dependency，未混入 sim4 的新 GPU cache 修正，因此不宣稱最新所有改動的組合效能。

`f1082f5` 的同環境空白 GPU canvas 三十秒控制為 60.003 FPS、P95 16.8 ms。04 的原文要求穩定 60 FPS，P95 ≤1000/60 是目前 120 部隊診斷額外採用的方法；空白控制也未通過後者。這不清除遊戲平均幀率失敗、不修改門檻，也不證明環境硬性上限。最新獨立 close profile 以 canonical/resource 前後實際 SHA 確認不變，下一個熱點是地理標籤及城名牌；見 [cadence 與 profile](national120-cadence-audit/native-README.md)。

## 自然取得的流程與介面驗收

`ccdc409` 的原生旅程從正式新局自然產生第 30 日具申，透過實際 UI 採納／拒絕，再於第 31 日正常指令日結出陣及發給既定功績、經驗與忠誠獎賞。故意把採納改為拒絕的反例失敗；完整狀態及指令見 [自然具申](earned-proposal-native/)。

`6430a8b` 與 `fa43b73` 完成三好玩家自然取得對武田信用的 CPU 第 0–300 日、公開 native save 匯入及原生第 301–332 日旅程。原生 UI 成立同盟，隨後合法請求對長尾援軍；武田按既定 AI 拒絕，未派兵。這符合 M6 指定的「武田同盟後請求援軍」互動，不能宣稱成功軍事支援或全程原生第零日重放。codec 省略的 AI 診斷 log 明示核對，其餘匯入狀態精確一致。早期錯誤 selector 及 envoy 日期斷言保留；見 [完整旅程證據](earned-takeda-native/)、[先前路徑診斷](takeda-route-feasibility/)。今川自然引拔流程已由後續 CPU240／native60 旅程補齊，見下方與 [完整證據](earned-imagawa-native/)。

`1575bc8` 修正 dialog 內裝飾 header 的 landmark 語意，保留真正標題、dialog label、modal 及焦點契約。原生 accessibility、既有四項視覺控制與 gallery 控制通過；見 [dialog](accessibility-dialog-sim2/)。空槽文字的獨立原生取樣實際對比為 7.098，完整重現序列無相同 color error；舊 axe 報告仍保留，原因未確認，不將其宣稱為已證實的誤報；見 [對比控制](accessibility-contrast-controls-sim2/)。

素材驗證為零 error／warning；首載素材預算通過。最新三個 LOD 的 drawable layer 通過，但三張 Linux protected screenshot 仍分別有 186,777／270,334／291,556 個差異像素，原六張基準及容差均未修改。實際畫面與既有藝術基準的大幅差異仍需審核，不能由 layer 通過清除。見 [素材與 M6 ledger](m6-asset-acceptance-ledger/)、[最新原生視覺](latest-native-visual-sim2/)。

## 最新固定來源全量回歸

`6430a8b` 的 1,471 個 tracked source／test／tool／spec／config 檔在測試開始前逐一符合 Git blob，結束後 SHA 不變。679 檔中 677 通過、1 失敗、1 跳過；6,293 項通過、1 失敗、1 跳過，耗時 121.28 秒。唯一失敗仍為 day450 無繼承人勢力持有四城十六郡的 INV-02／INV-22。這份 manifest 不涵蓋 public assets、dependency 或稍後新增的 native tail；後者另有自身型別、lint 及原生驗證。

[固定來源完整紀錄](continuation-6430/) 保留全部原始輸出。[較早整合](continuation-fe37/)、[事件流程逾時及原樣重跑](continuation-8cdd/)、[尚未完成日期 fixture 的混合來源失敗](continuation-dec6-mixed/) 各自保留原輪 verdict，不以後版成功改寫。領地接收、戰術外部收尾、人口校準、完整長跑平衡、整體 heap、120 部隊效能及藝術 gate 仍開啟；未推進 checkpoint 或部署。

`a381b7d` 另提交固定障礙物邊界索引，保留 exact edge arithmetic、Set 最終排序及 placement cache signature；超大有效座標仍 full scan。33 項 reference／cache／邊界測試與 scoped lint／格式通過；初輪型別通過，後輪被平行開發中未提交的 earnedImagawa fixture 型別錯誤阻擋，完整原始失敗保留。sim3 九份原生觀測精確一致，120 部隊 FPS 控制仍進行中，未宣稱新效能收益。見 [本機來源與控制](geographic-edge-index-local/)。

地理邊界索引的後續三視圖觀測為 57.59／42.91／24.14 FPS，均未達門檻，也沒有支持明確整體收益。獨立 close profile 的 edge-axis self 成本下降約 26.5%，整體 geographic layout inclusive 僅下降約 1%。因此 `8f8319b` 撤回 `a381b7d` 的 runtime 索引及實驗測試，完整來源提交及本機／原生證據保留，不以單一熱點數字宣稱遊戲改善。

`043b561` 的自然流言／引拔 CPU 旅程與 `e207b4d` 的原生 UI 尾段通過：三好從正常新局取得第 240 日 checkpoint，公開匯入後，實際調略表單支付 1,000 貫；第 241–300 日完整 persistent state 逐日精確一致。由比的真實引拔敗露仍保留，三浦正俊第 300 日正式移籍並在家臣列表／詳情可見。這補齊指定今川引拔互動，不清除完整長跑、全國結局或其他 M6 gate；完整證據另存。

## 撤回後的現行來源與下一個 Rust 邊界

`e72bde9` 撤回城名牌 zero-objective 實驗；其三視圖為 59.90／44.20／23.86 FPS，全部未達嚴格 60，close 沒有改善。單次 profile 的 normalized castle inclusive 僅下降約 3.35%，不足以支持整體收益；self attribution 變化不被當作實際回歸。完整候選來源、精確觀測及失敗見 [城名牌本機控制](castle-ribbon-zero-local/)、[原生控制](castle-ribbon-zero-objective/native-README.md)。地理索引的撤回與原始計時見 [原生地理索引](geo-edge-index/native-README.md)。

撤回後固定 `e72bde9` 的全量為 680 檔，678 通過、1 失敗、1 跳過；6,294 項通過、1 失敗、1 跳過（127.49 秒）。1,469 個 tracked inputs 在開始前符合 Git blob，測試後完全一致，也與目前 main 的對應來源一致。型別、完整 lint、production build、bundle budget 通過；唯一失敗仍為 day450 無繼承人領地 INV-02／INV-22。來源 manifest 不涵蓋 public、binary outputs 或 installed dependencies，隔離 checkout 使用現有 node_modules symlink。見 [現行固定來源](continuation-e72b/)；實驗版 6,300 通過的完整原輪亦保存於 [固定實驗版](continuation-6795/)，沒有把已移除的六項測試冒稱為現行測試。

Root 另獨立執行 [自然今川證據驗證器](earned-imagawa-native/verify-evidence.py)，CPU／public import／全部六十日 persistent state 與 RNG、真實敗露及正式仕官皆通過。這是自然取得的 CPU prefix 加 native tail，不宣稱全部三百日原生 UI 重放。

下一步只做 Rust 邊界的唯讀分析：geographic cache-miss 評分可先保持 JS 候選順序與 signature，再以 f64 arena 回傳勝出 offset index；castle 完整純規劃則可保留 UI 量測、compact admission 及 visibility 在 JS。現有 WASM 只在 simulation Worker 初始化，render 必須有獨立主執行緒 instance／生命週期，不能假設逐標籤 Worker 訊息免費。必須保留 JS min/max 的 NaN／signed-zero 行為、運算及加總順序、capsule fail-closed、work budget；計入 packing／跨 ABI／整體 render 成本後才採用。尚未實作或宣稱收益。

## 實際 Rust 地理評分與固定來源整合

`7288d16`／`e8693f4`／`fb9fd7f` 加入零第三方依賴的 Rust 地理評分核心，正式 renderer 在快取失效時使用獨立主頁 WASM 實例。JavaScript 保留驗證、排序、候選生成、快取與 UI 量測；模擬 Worker 的 pathfinding 實例與記憶體獨立。初始化失敗會進入既有錯誤邊界，卸載會取消下載並釋放實例 arena；沒有失敗後靜默改回同步核心。這是擴充純數值邊界，尚未證明大幅改善幀率。

Rust 九項、19 檔 262 項關聯測試通過。實際已編譯 WASM 與凍結 JavaScript reference 比對 320 個 seeded 場景、快取轉換、epsilon、signed zero 及十一個有效極端場景，保留完整輸出。兩輪 helper URL／跨 realm ArrayBuffer 失敗修正及初始非法 fixture／clippy 失敗均保留，見 [geographic-wasm-local](geographic-wasm-local/README.md)。該輪 AST checker 的 35→0 僅涵蓋直接建構 renderer 的 unit 接點。

第一輪固定 `fb9fd7f` 全量為 6,287 通過、34 失敗、1 跳過，另有 17 個未處理錯誤。它找出二十個間接建立 MapCanvasHost 的元件 fixture 尚未注入實際 WASM。`9e49cc9` 補齊這二十個接點，不修改原有行為斷言；175 項相關測試通過。第二版 AST checker 的間接接點由 20→0，已知混合註解的控制精確報告一個缺漏。

固定 `9e49cc9` 全量為 683 檔：681 通過、1 失敗、1 跳過；6,320 項通過、1 失敗、1 跳過，126.96 秒。全部 1,477 個 tracked inputs 在前後符合 Git blob 且 byte-identical；scope 不包含公開素材、二進位輸出或安裝依賴，checkout 共用既有 node_modules。型別、完整 lint、正式 build 與 bundle budget 均通過；完成後全部 1,477 個 inputs 仍不變。唯一失敗仍為 day450 齋藤無嗣領地 INV-02／INV-22。原始首次失敗與後輪完整紀錄見 [geographic-wasm-integration](geographic-wasm-integration/)。

[geographic-wasm-native](geographic-wasm-native/native-README.md) 保留相同 sim3 舊依賴群的九份完整發布比對，全部 exact；三個單次 120 部隊、1080p、三十秒窗口為 59.96／43.17／24.47 FPS，P95 17.4／25.3／48.8 ms，全部仍失敗。close 比上輪 23.99 FPS 的單次變化不足以證明穩定收益；獨立 profile 的地理布局 inclusive 約 14.70→14.59 ms／render。V8 export-index 比對確認實際執行 Rust，但不將實際執行視為效能驗收。

[geographic-wasm-worker-sim1](geographic-wasm-worker-sim1/README.md) 使用完整 2,814 檔固定來源、fresh npm ci 及當前 23 個 Pixi patch。Mac／Linux 二進位與 manifest byte-identical：27,147 bytes，WASM SHA256 `2f4bde5fab04903790ccc28e507ef2ccd1dd8df8bc9f8de2a4491ff71ca263df`。原六項 Worker 測試為五通過、一失敗；失敗案例的完整局面、日誌與實際 Rust 回覆先通過，之後當前 generation 的 readiness 為 false。原 trace 證明暫停取消第四個 posted tick 後建立新 Worker；新實例尚未初始化，不能以歷史 Rust 使用紀錄偽裝為當前 ready。此輪不宣稱六項全綠。

地理 Rust 邊界目前保留，後續將評估完整城名牌純布局與實際 Worker 啟動初始化。既有 60 FPS、whole-heap、protected art、長跑及核心領地 gate 均保持開啟。

## 完整城名牌 Rust 核心與當前世代 Worker 就緒

`ce827fe`／`671602a`／`04c7b60` 將完整城名牌純布局接上正式 renderer。Rust 處理候選軸、完整搜尋、碰撞／引線限制、最終診斷及既定一百萬 work budget；JavaScript 保留原驗證、UTF-16 優先排序、量測、快取與精簡字牌 admission。Castle 與 geographic arena 共用同一個主頁 WASM 實例，與模擬 Worker 分離；兩個 arena 在 memory growth 後更新 view，destroy 各釋放一次。缺少 castle ABI 會在建立 Application 前失敗，沒有靜默 JavaScript fallback。

Rust 十一項、337 組完整 f64 原版 oracle、13 項實際 WASM／協定測試（含 320 seeded scenes）、33 檔 386 項 renderer／主畫面接點測試及三項真實雙 arena 生命週期測試通過。ABI、欄位／工作數／signed zero 逐一比對。證據審核發現一處測試來源註記不精確：原 oracle 321／322 是同號零值，永久測試是混合符號；另用凍結 JavaScript 獨立產生兩筆控制，全部十六欄與 work 472 相同。`2bdb1f3` 只更正註記與產物來源 manifest，程式、輸入與預期不變，63,073-byte WASM 與 `04c7b60` byte-identical，SHA256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`。原始 CWD、clippy、型別化 instrumentation 失敗均保存於 [castle-wasm-local](castle-wasm-local/README.md)。

固定 `04c7b60` 全量為 686 檔：684 通過、1 失敗、1 跳過；6,357 項通過、1 失敗、1 跳過，133.48 秒。1,485 個 tracked inputs 在測試及所有檢查後符合固定 Git blob 且 byte-identical；型別、完整 lint、正式 build 與 bundle 通過。唯一失敗仍是 day450 無嗣領地 INV-02／INV-22。後續註記更正使目前 main 的一個 tracked Rust test 檔案不同，public manifest 位於本項 scope 外；不將此固定全量改稱為更正來源的重跑。

`c613747`／`71d1eaf` 讓每個新 Worker 立即初始化 Rust，真正 ready ACK 屬於當前實例與 epoch；tick 仍立即 posted。舊世代 ready／error、取消及卸載不能復活 backend；初始化失敗回報既有 fatal 邊界。`waitSimulationIdle` 排空 pending day 後加入當前世代的真實就緒等待，所有 reset 共用單一 deadline。65 項相關測試通過，舊 bridge 對新增控制的反向測試為七失敗／九通過，沒有未處理 rejection；原失敗與來源見 [worker-epoch-readiness-sim1](worker-epoch-readiness-sim1/README.md)。

[worker-ready-castle-sim1](worker-ready-castle-sim1/README.md) 以完整 3,068 檔固定來源、fresh npm ci／23 patch 執行原六個 native Worker 案例，一次全六通過（2.1 分鐘）。完整 persistent state、RNG、日誌、保存／重載及取消精確一致；原先失敗的 current-generation ready 斷言現在通過，沒有放寬。Normal x5 真正只前進 29 日後自然月報暫停，不能宣稱完成 60 日。這輪 120 日 Worker wall 17.038 秒，sync 0.957 秒；最長主頁 long task 207／956 ms，整體 batch 仍較慢，不能把較短單次阻塞視為結算吞吐改善。

新的 [current23 baseline](geographic-wasm-current23-baseline/README.md) 使用 fresh locked dependencies、全部 23 個 Pixi patch，與舊依賴群分離。[castle same-cohort controls](castle-wasm-current23-native/README.md) 共用這份完整 14,765 檔依賴，前後 SHA 不變；1,404 個新來源／公開素材／設定同樣固定。九份完整發布與原 reference byte-exact；三個三十秒、120 部隊、1080p 控制各執行一次，結果如下。

| Camera      | Current23 baseline FPS | Combined runtime FPS | Baseline P95 | New P95 |
| ----------- | ---------------------: | -------------------: | -----------: | ------: |
| Overview    |               59.83336 |             59.93091 |      17.7 ms | 17.5 ms |
| Operational |               42.93288 |             49.73817 |      25.5 ms | 22.0 ms |
| Close       |               24.61326 |             29.11552 |      48.7 ms | 41.5 ms |

操作景與近景的單次觀測改善 15.85%／18.29%，全部仍未達嚴格 60 FPS。來源也包含 Worker ready 與共用 WASM owner，不能當作只有 castle kernel 的因果實驗；策略日結暫停，不證明實際連續戰役。唯一獨立 close profile 有 290 次完成 render（289 intervals）、零 driver tick、實際 canonical／resource 前後 SHA 相同；castle Rust 約 3.22 ms／render，JS planner self 約 0.043 ms，後者 inclusive 包含 Rust，不能說全部是 packing。Geographic layout inclusive 仍約 14.36 ms／render；舊依賴 profile 不作公平定量對照。

本階段保留完整 castle Rust 邊界與真正 Worker ready。原 functional suite 使用 default headless flags，沒有記錄歷史 GL identity；後續同設定的新頁面確認 SwiftShader，不能把 17 秒直接當作硬體 GPU 的結果。獨立 profile 記錄 120 日核心 compute 合計 649.2 ms，但主頁 `(program)` 區段仍未歸因；硬體身分受控的對照另行診斷，原六項結果、普通 FPS 與帶 profiler 數字分開。60 FPS、whole-heap、protected art、長跑及核心領地 gate 都未清除，完整專案 goal 保持 active。

## Worker batch 診斷結果與限制

[sim1 成本診斷](worker-batch-overhead-sim1/README.md) 的唯一 default-headless profile 通過完整第 121 天 state／RNG／log 比對；核心 compute 合計 649.2 ms，但 13.296 秒 step 的主要 `(program)` 區段仍無可歸因 stack。另頁確認同設定為 SwiftShader；硬體預檢只有 llvmpipe／WebGL null，guard 在 profiler 前停止，硬體 batch captures 為零。Linux 原 pinned Rust recipe 產出的 WASM 與固定 Mac binary／manifest byte-identical。

[sim3 硬體診斷](worker-batch-hardware-sim3/README.md) 的前後實際 WebGL2 都確認 RTX 5070 Ti Vulkan。原 trace 記錄 120 日 step 已完成（3,061.800 ms）、idle 0.100 ms、120 replies 的核心 compute 合計 680.900001 ms；但外部完整交通擷取在原 60 秒 timeout 結束，最後 synchronous-reference assertions 未執行，整個診斷保留失敗。Observer 每次 structuredClone 完整 reply，另有 profiler 開銷；它和 sim1 同時存在主機、GPU、observer 差異，不能當作單一因素效能比較或一般吞吐結果。完整大型 trace／交通資料留在遠端，路徑、大小及 SHA 保存於各包，未宣稱全部已進 Git。

兩包新增證據已加入 artifact SHA 索引。原六項 Worker 功能通過、三組 FPS 未達標與最新固定全量結果保持不變；本次診斷沒有修改 production source、門檻或依賴。下一步需以輕量 metadata observer 定位硬體主頁成本，再處理 geographic preparation 熱點；全專案 goal 仍 active。

[sim3 輕量診斷](worker-batch-lightweight-sim3/README.md) 改為只讀 reply scalar metadata，不複製整個回覆；一次通過原 60 秒 timeout，warm1／final121 完整 state、RNG、日誌與同步 reference 比對先完成，再輸出觀測。前後 actual RTX Vulkan 與固定來源／依賴驗證通過。帶 profiler 的 120 日 step 為 2,525.4 ms、核心 compute 合計 649.700002 ms；主頁 reconcileValue self 350.997 ms。Post、receive 與 compute 區間重疊，不相加，也不把 callback 的 native deserialize 費用全算成新增 observer 成本。此值仍為診斷，未重跑一般 FPS 或原六項 suite，前次完整 clone 的失敗維持不變。
