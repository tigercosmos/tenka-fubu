# 固定 934163c 的 UI 整合驗證

本次產品變更只有 `5f250eb` 的提示卡上下 padding；另外兩個提交加入非政策面板及最小視窗鍵盤驗收。固定 `934163c` 的 1,589 個 runtime／test／config／plan 輸入，在以下整合檢查前後完全符合 Git blobs，沒有來源漂移。

- 16 個相關 unit 檔案共 227 項通過：hotkey、MainScreen、ReportStack／ReportsPanel、共用面板、武將、設定及存讀檔。
- 另 7 項 editorial CSS source contract 通過；這些不等於實際瀏覽器幾何。
- 型別、完整 ESLint、資料、素材、production build、bundle 通過。React act 警告保留在原 log，並未隱藏。
- Darwin 的既有 hotkey／context-panel／reports／shared-panel-frame 六項原生測試通過（17.9 秒）。原視覺五項另存於 [Darwin 圖像套件](../protected-art-final-darwin-934163c/README.md)。
- Fresh Linux 29-target 依賴及固定 1,633 個來源輸入的原視覺五項、報告十五倍率、非政策面板四十五項，見 [Linux 套件](../protected-art-final-linux-934163c/README.md)。

完整 Prettier 在最終文件封存時另行執行並保留 log。此處沒有重跑整個 core suite；最近全量仍是 `7d37c28` 的 6,445 PASS／1 既有無嗣 FAIL／1 SKIP，不能改標為 `934163c`。六項新增鍵盤驗收在 `961f0ae` runtime 加 exact `934163c` 測試 overlay 通過，見 [鍵盤證據](../keyboard-minimum-961f0ae/README.md)；其後 runtime 差異只有提示 CSS，整合跨畫面測試另行通過。

原 native 全套的五分鐘 deadline 尚未由分組成功證明。強制 overlay、Battle 控制、其他面板、完整字體／文字可讀性及全部 M6–M9 剩餘門檻維持。新的六張 protected actual 仍等待明確人工核准，沒有修改基準。

`raw/` 保存各驗證在程序啟動前建立的唯一完整 log、command／result、來源 inventories 與 report。`external-traces.json` 只列外部保留的失敗 trace，沒有宣稱 trace 已納入 Git。本機依賴沿用工作區，不能當 fresh install；Linux fresh install 證據另存。初期 worker archive 的 ENOSPC 只有工具回覆抄錄，相關限制在各子套件明載。

附帶保留最初的唯讀 balance／population 查核：591 個已宣告對照沒有值不符，既有 soldiersPerKoku 校準未定，audit exit1。人口計算只是靜態 district 欄位比值，不含城基數或政策，沒有改平衡值、人口、容許範圍或使用者決策。

執行 `python3 verify.py` 核對封存 hashes、1,589 Git blobs、各成功狀態及六項既有跨畫面結果。
