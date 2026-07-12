# WIP — 實作交接文件（更新 2026-07-13）

> 給下一個接手的 AI／未來 session：本文件描述《天下布武》**實作階段**的當前進度與剩餘工作。
> 規格階段已於 2026-07-11 收斂完成（21 份 plan 定稿、E-01…E-80 全數消化、七輪裁決記錄於 `plan/02 §8`）。
> 讀本文件＋`CLAUDE.md`＋`plan/18-roadmap.md` 即可無縫接續。

## 執行模式（使用者指示，多次重申）

- **GPT-5.6-sol 當 orchestrator 並處理複雜任務；GPT-5.6-terra 處理一般任務。**
- 以 Workflow 多 agent 編排；每個里程碑：實作 → Opus 全量 review（fix-forward）→ orchestrator 本機驗證 DoD → 依任務 ID 分組 commit → checkpoint（README 進度表＋milestone.json＋tag）→ push（已核准，push 後驗 CI/Pages）。
- **一次只做一個里程碑階段，完成後停下（使用者 2026-07-12 指示：勿先開下一階段）。**
- ⚠ 使用者額度（5 小時窗口）常中斷 agent 艦隊：接手時先 `git status` 看未 commit 的部分產出——**通常品質良好，核實後續作，勿 reset**；workflow 可用 `resumeFromRunId` 續跑（已完成 agent 走快取）。

## 目前進度（里程碑）

| 里程碑        | 狀態                                   | 備註                                                                   |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| M0 鷹架       | ✅ 已 checkpoint（tag m0）             | CI 五 job 綠、Pages 200（https://tigercosmos.github.io/tenka-fubu/）   |
| M1 core＋HUD  | ✅ 已 checkpoint（tag m1）             | 431 tests；型別=02 全型別零缺失（46 Cmd/68 Event）                     |
| M2 資料＋地圖 | ✅ 已 checkpoint（tag m2，2026-07-12） | 792 tests＋P1/P2 e2e 綠；DoD 四條全過（review 報告見 wf_dcccc2d1-835） |
| M3 內政       | ✅ 已 checkpoint（tag m3，2026-07-13） | 844 tests＋P1/P2/P3 e2e 綠；24 個月 DoD 與全量 review fix-forward 完成 |
| M4 軍事一     | ⬜ **未開工——待使用者核准後才開始**    | milestone.json current=M4 僅為 checkpoint 前進，非已動工               |
| M5–M9         | ⬜                                     | 依 `plan/18-roadmap.md`                                                |

## M3 已收尾（2026-07-13）

M3-1～M3-24 全數完成：37 項武將特性、功績／升格／俸祿／忠誠、經濟與秋收、郡開發與知行、
施設、徵兵、輸送、政策、治安一揆、收支預覽、完整 UI 導航與通用元件、城／郡／武將／政策面板、
ReportStack，以及 Playwright P3 三個月推進。

全量 review 已 fix-forward：補齊升格 Command、分級知行忠誠與加封獎勵、內政特性掛鉤、施設前置停用、
輸送劫掠攜行上限、俸祿單一結算管線、收支糧耗共用公式、無效佇列退款、面板狀態保留與 UI 驗證器接線。
最終 gate：lint／typecheck／validate:data（0 ERROR／0 WARN）／844 tests／build／P1–P3 e2e 全綠；字型 838 字元、181.5 KB。

**下一步（待使用者核准）**：M4 軍事一（plan/18 §3.7）；一次只做 M4，不預先開 M5。

## M2 已收尾（2026-07-12）——以下為歷史記錄

M2 後半全部完成並 commit（d418107…f9c04a6）：B1/B2 資料批次過三關（validate 0 ERROR／stats ±10%／抽查表）、
mini fixture、validate 自動批次模式（14 §8-D23）、新局流程（選織田→1560 年 HUD＋地圖）、P1+P2 e2e 綠。
Opus review fix-forward 兩項 checkpoint 阻斷（bare validate:data 紅燈、Prettier）。
Push 後 CI 一度紅燈（territoryGrid perf gate 在共享 runner 713~2149ms）——已修（1f4004b：CI 上改 sanity 上限，
依 17 §3.11.2 perf-gate M9 才轉阻斷；本機維持 450ms 回歸守門），**re-run 後 CI/Deploy 全綠、Pages 200**。
M2 的下一步原為 M3；已於 2026-07-13 完成，現況以上方 M3 收尾段落為準。

<details><summary>M2 後半執行過程記錄（收合）</summary>

**已完成（工作樹未 commit，品質已過 gate）**：

- Prep：F2（`BAL.loyaltyTreatmentClampAbs` 提取，15 總數 540→541）＋F5（INV-05 fixture）。
- **M2-9 B1 東海**：`src/data/scenarios/s1560/*.json`＋`officers/tokai.json`——validate --regions=tokai 0 ERROR、stats 石高 −6.3%/武將 −5.3%（≤±10%）、織田 310,000 石／今川 670,000 石校準 PASS。
- **M2-10 B2 近畿**：`officers/kinki.json` 等——東海+近畿 validate 全綠、近畿石高 −0.3%/武將 −4.2%、清洲→京都 ETA 5.5 日（∈5–9）、含足利將軍家（第 41 家）與鈴鹿/中山道接縫。

**剩餘（quota 中斷未跑，resume 後自動續）**：

1. M2-11 mini fixture（zod 版）＋M2-12 資料驗證整合進 CI（17-T4/T8）。
2. M2-19 新遊戲流程最小版（ScenarioSelect→DaimyoSelect→buildGameState(regions)→MainScreen 掛地圖）。
3. M2-20 Playwright P2（新局流程 e2e）。
4. Opus M2 全量 review（fix-forward）→ orchestrator 驗證 → commit（B1/B2 各自成 commit，帶 stats 輸出）→ M2 checkpoint（README/milestone→M3、tag m2、push、驗 CI）。

**Resume 指令**：`Workflow({scriptPath: "<session>/workflows/scripts/implement-m2b-wf_dcccc2d1-835.js", resumeFromRunId: "wf_dcccc2d1-835"})`（已完成 agent 走快取）。

</details>

## 關鍵事實（給接手者）

- 規格衝突優先序：`00 > 02 > 15 > 系統文件(03~10,16) > UI 文件(11~13)`；**絕不修改 `plan/00-foundations.md`**；矛盾＝決定→實作→回寫該檔 §8（不留 TBD）。
- 報告渲染契約：core 只 emit `02 §4.19` 事件（68 種），UI 層 `renderReport(report, state, playerClanId)` 導出字串（13 §3.7 enrichment）。
- commit 格式：`<type>(<scope>): <繁中> [Mx-n]`（18 §3.13）；checkpoint 程序 18 §3.14。
- 新增 UI 字串／資料 name 後必須跑 `npm run font:subset` 再 commit（字型涵蓋率會紅燈）。
- 資料檔繁體正字（滝→瀧等；掃描器會擋）；專有名詞在 JSON `name` 欄不進 i18n。
- 驗證全套：`npm run typecheck && npm run lint && npm test && npm run validate:data && npm run build && npm run e2e`。
- 持久記憶 `tenka-fubu-project.md` 已同步至實作階段。**每個階段結束或被中斷時，更新本文件。**
