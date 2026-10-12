# 報告提示與報告中心十五倍率

`5f250eb` 將提示卡的上下 padding 由 0.25rem 改為 0.125rem。標題字級、行高、換行、日期間距、32px 關閉按鈕及完整內容規則保持。1280×720 的 0.8–1.5 每 0.05 共十五倍率，原版為 14 PASS／1 FAIL：0.9 的雙行標題卡高 57.65625px，超過原 56px 門檻。修正後十五項全通過（29.7 秒），沒有修改門檻或截斷內容。

每個倍率由真實設定滑桿操作，驗證提示內容、完整文字、12px 字級下限、關閉目標、報告中心往返及 core／命令紀錄不變。報告中心共 195 個控制符合 32×32px、視窗範圍與中心命中；另以 Space 切換軍事類別、月份選單、Enter 前往地點並觀察小地圖畫面變化。圖像檢視涵蓋報告中心 0.8／1.5 與 scale1 提示；成功輸出另含十五張提示及三張報告中心圖片。這是報告子門檻，不代表完整 M8-23。

來源為隔離的 `961f0ae` Git archive，加三個明列 overlay，與採用的 `5f250eb` 三檔 SHA256 相同。候選前後 1,552 個輸入完全一致；沿用工作區 node_modules，沒有宣稱 fresh install。原版執行後、CSS overlay 前沒有另做完整來源 checkpoint，不能將候選的前後證明套用到原版。29 項 ReportStack unit、型別、scoped ESLint、格式及候選 build 通過；整合 HEAD 驗證另存。

第一次 native 執行使用不存在的 camera observer，四項失敗、十一項未執行；以驗證過的 PID 中斷，exit130。此 observer error 與後來原版的真密度失敗分開保存。原始四個大型 trace 留在 `external-traces.json` 的本機路徑並記錄大小及 SHA256；其中中斷時的 trace 可能沒有完整 ZIP 中央目錄。其餘 log、JSON、error context、圖片及 producer 均封存於此。此套件的驗證器不把外部 trace 視為已隨 Git 保存，也不把出錯 observer 當作產品錯誤。

所有這些驗證 subprocess 先 exclusive-create 完整 stdout／stderr log，再啟動程序；Playwright 另用唯一 output 與 JSON report。沒有更新受保護的視覺基準。新的最終六張候選圖需另行取得人工核准。

執行 `python3 verify.py` 驗證本地封存 hashes、Git overlays、候選前後來源、原版 RED 與十五倍率量測。
