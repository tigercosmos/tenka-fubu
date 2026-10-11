# 零城勢力的野戰退出

`7129f63` 修正零城勢力仍在普通野戰時延後滅亡的缺陷。10 §3.8.3／§5.6 要求 Step12 清除部隊與參戰引用；07 D49 不授予外部非戰鬥收束的野戰功績。先透過既有 releaseOfficerAssignments 解除職務，再刪除殘軍，可保留副將接任時的上下文，清除對方追擊引用並恢復 surviving army 狀態。沒有變更領地接收規則、BAL、RNG 或戰鬥獎賞。

原測試用 `as never` 造不存在的 battleId，只驗證 guard。新測試透過正式 march／startFieldCombat／startKassen 建立有效參戰狀態；territory transition 前 validateState 零違規。原版普通野戰案例真實失敗（clan.alive 仍為 true），修正後解除所有參戰軍、主副將身分一致、survivor 未獲功績／經驗、RNG 不變，事件順序為 clan.destroyed 再 game.victory，最終 validateState 零違規。

sim1 八檔 84 項通過，包含真實 s1560 24 月 lifecycle、既有 B8 literal hashes、合戰／野戰／攻城功績與死亡清理。本機採用後 victory 十五項通過；normal／core 型別、scoped ESLint 與格式另驗。第一次 remote focused run 因缺少 B8 證據依賴失敗，補齊原依賴後通過；前後 log 都保留，不改測試斷言。

## 尚未解決的戰術收尾

有效戰術狀態的零城滅亡仍未完成。10 §3.8.3 將退出委託給 07，但 07 只定義主將退出／副將接任，沒有外部滅亡的中止結果。BattleResult 必須有 winnerSide 與 aweLevel；既有 resolveBattle 會授予勝利／威風獎賞並消耗死亡／捕虜 RNG，closeResolvedBattle 拒絕未結束的合戰。因此不能把領地滅亡直接當作一般戰鬥勝負。

正式測試保留有效 active battle 的既有 guard 行為，明示其不滿足滅亡 requirement；沒有用 it.fails 或 skip 把需求變成通過。`tactical-diagnostic.spec.ts.gz` 與 `extinction-tactical-open-red.log.gz` 保留實際失敗的 required-postcondition 測試。將診斷解壓到獨立 checkout 的 tests/core/tactical-diagnostic.spec.ts，可執行 `npx vitest run tests/core/tactical-diagnostic.spec.ts` 重現。診斷來自改版期間，普通野戰期望與當時 source patch 一併保存。

此缺口的合戰中止／獎賞選項已詢問使用者，尚未有選擇。無繼承人滅亡後仍持有領地的問題也不在本次零城修正內。這兩者與完整專案 gate 仍未清除。

原來源、有效 engagement 探針、source patch、RED／GREEN 與原始診斷以 gzip 保存。[summary.json](summary.json) 列出驗證範圍；[artifact-sha256.json](artifact-sha256.json) 檢查壓縮及原始 bytes。
