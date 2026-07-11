// Command 拒絕原因鍵（reasonKey）表。
// 規格：plan/03-game-loop.md §3.3.2（通用拒絕原因全表）＋各指令專屬原因（§3.3.2 明文「各 Command
// 可另定義專屬原因，見各系統文件」）。
//
// 值＝i18n 拒絕鍵（`cmd.reject.*`；13/00 §9 命名慣例）；core 只 emit 此鍵字串，實際繁中文案由
// UI 層 renderReport（13 §3.7）解析（core 不 import i18n，eslint 邊界規則）。硬驗證失敗時包成
// EvtCommandRejected（state/events.ts）發出（03 §5.1）。
//
// E-74：`delegatedToCorps` 由 §3.3.2 勘誤新增（軍團城玩家不可直接下內政／出陣指令）。

/** 通用＋專屬拒絕原因鍵（03 §3.3.2）。 */
export const REJECT_REASONS = {
  // ── 通用（03 §3.3.2 全表逐列）──
  notOwner: 'cmd.reject.notOwner', // 目標實體不屬於發令勢力 clanId
  invalidTarget: 'cmd.reject.invalidTarget', // 目標 ID 不存在或已消滅
  insufficientGold: 'cmd.reject.insufficientGold', // clan.gold < cost
  insufficientFood: 'cmd.reject.insufficientFood', // castle.food < cost
  insufficientTroops: 'cmd.reject.insufficientTroops', // 城內可動員兵力不足
  officerBusy: 'cmd.reject.officerBusy', // 指定武將已有進行中任務
  alreadyActive: 'cmd.reject.alreadyActive', // 重複啟動已在進行的項目
  rankTooLow: 'cmd.reject.rankTooLow', // 武將身分不符任命門檻（00 §4）
  pathBlocked: 'cmd.reject.pathBlocked', // 無法規劃合法路徑
  gameOver: 'cmd.reject.gameOver', // 勝敗已判定，僅接受 debug 指令（10 §5）
  debugOnly: 'cmd.reject.debugOnly', // 非 debug 模式下提交 debug 指令
  delegatedToCorps: 'cmd.reject.delegatedToCorps', // 目標城已編入軍團（07 §3.12，E-74）

  // ── 專屬（各指令自定；下列為本里程碑落地者）──
  debugBadRange: 'cmd.reject.debugBadRange', // debugSkipDays days 超出 1..BAL.debugSkipMaxDays（03 §3.9.2）
  // M1-6 骨架：佇列型指令之 validate/apply 尚待各系統里程碑（05/06/07/08/10）登錄；
  // 未登錄者硬驗證即拒（不改 state、不崩潰）。隨真實 handler 登錄自然消失（03 §8-D14）。
  notImplemented: 'cmd.reject.notImplemented',
} as const;

/** 拒絕原因鍵之型別（值域＝上表 i18n 鍵字串）。 */
export type RejectReasonKey = (typeof REJECT_REASONS)[keyof typeof REJECT_REASONS];
