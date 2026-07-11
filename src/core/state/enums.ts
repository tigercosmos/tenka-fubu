// 全案 enum 總表（02 §3.3 全部；一律 string literal union 以利 JSON 序列化與存檔可讀性）。
// 規格：plan/02-data-model.md §3.3；顯示字串經 i18n key `term.<enumName>.<value>`（主表見 13）。
//
// 實作說明：每個 union 以 `X_VALUES as const` 陣列為單一真相、型別 `(typeof X_VALUES)[number]` 由陣列導出，
// 使值集合與型別零漂移（02 §7 驗收：「每個 union 有同名 *_VALUES 陣列供迭代與 zod 驗證使用」）。
// 值字串與語意註解逐字轉錄自 §3.3。

/** 城格：本城/支城（02 §3.3） */
export const CASTLE_TIER_VALUES = ['main', 'branch'] as const;
export type CastleTier = (typeof CASTLE_TIER_VALUES)[number];

/** 仕官/浪人/捕虜/死亡（02 §3.3） */
export const OFFICER_STATUS_VALUES = ['serving', 'ronin', 'captive', 'dead'] as const;
export type OfficerStatus = (typeof OFFICER_STATUS_VALUES)[number];

/** 身分六階（00 §4；02 §3.3） */
export const RANK_VALUES = [
  'kumigashira', // 足輕組頭
  'ashigaru-taisho', // 足輕大將
  'samurai-taisho', // 侍大將（可任城主）
  'busho', // 部將
  'karo', // 家老（可任軍團長）
  'shukuro', // 宿老
] as const;
export type Rank = (typeof RANK_VALUES)[number];

/** 部隊狀態機（七態，勘誤 E-10 聯集定案；02 §3.3；活動層，與 ArmyMission 意圖層正交） */
export const ARMY_STATUS_VALUES = [
  'marching', // 行軍
  'engaged', // 交戰（野戰/合戰中）
  'sieging', // 攻城
  'subjugating', // 制壓（翻轉敵郡）
  'returning', // 歸還（04 的 retreating 併入）
  'routed', // 潰走（合戰/野戰敗走；行為單一擁有者見 07 §3.4）
  'holding', // 固守待命（07 的 resting 併入）
] as const;
export type ArmyStatus = (typeof ARMY_STATUS_VALUES)[number];

/** 部隊出陣任務目標（意圖層；與 ArmyStatus 正交，二輪裁決 B；語意見 07 §3.1；02 §3.3） */
export const ARMY_MISSION_VALUES = [
  'march', // 進軍：抵達非敵城目標後駐留 holding；途經敵郡依 04 制壓
  'conquer', // 攻略：目標為敵城，抵達後自動建立 Siege（07 §3.11）
  'return', // 歸還：目標＝originCastleId（已失守則最近我方城），抵達解散（07 §3.13）
] as const;
export type ArmyMission = (typeof ARMY_MISSION_VALUES)[number];

/** 【作廢，勘誤 E-18】野戰改用 FieldCombat、合戰改用 BattleState（§4.9）；保留僅供舊資料遷移（02 §3.3） */
export const BATTLE_MODE_VALUES = ['auto', 'tactical'] as const;
export type BattleMode = (typeof BATTLE_MODE_VALUES)[number];

/** 包圍 / 強攻（02 §3.3） */
export const SIEGE_MODE_VALUES = ['encircle', 'assault'] as const;
export type SiegeMode = (typeof SIEGE_MODE_VALUES)[number];

/** 威風 無/小/中/大（02 §3.3） */
export const AWE_LEVEL_VALUES = ['none', 'small', 'medium', 'large'] as const;
export type AweLevel = (typeof AWE_LEVEL_VALUES)[number];

/** 街道 / 海路（02 §3.3） */
export const ROAD_KIND_VALUES = ['land', 'sea'] as const;
export type RoadKind = (typeof ROAD_KIND_VALUES)[number];

/** 同盟/婚姻/停戰/從屬（02 §3.3） */
export const PACT_KIND_VALUES = ['alliance', 'marriage', 'ceasefire', 'vassal'] as const;
export type PactKind = (typeof PACT_KIND_VALUES)[number];

/** 引拔/流言/內應（02 §3.3） */
export const PLOT_KIND_VALUES = ['poach', 'rumor', 'betrayal'] as const;
export type PlotKind = (typeof PLOT_KIND_VALUES)[number];

/** 朝廷官位（低→高；語意見 08；02 §3.3） */
export const COURT_RANK_VALUES = [
  'none', // 無位無官
  'ju5ge', // 從五位下
  'ju5jo', // 從五位上
  'ju4ge', // 從四位下
  'ju4jo', // 從四位上
  'ju3', // 從三位
  'sho3', // 正三位
  'ju2', // 從二位
  'sho2', // 正二位（v1.0 天花板）
] as const;
export type CourtRank = (typeof COURT_RANK_VALUES)[number];

/** 幕府役職（語意見 08；02 §3.3） */
export const SHOGUNATE_TITLE_VALUES = [
  'none', // 無役職
  'hokoshu', // 奉公眾
  'otomoshu', // 御供眾
  'shobanshu', // 相伴眾
  'kanrei', // 管領
  'fukushogun', // 副將軍
  'shogun', // 征夷大將軍
] as const;
export type ShogunateTitle = (typeof SHOGUNATE_TITLE_VALUES)[number];

/** 軍團方針：攻略/固守/開發（語意見 09；02 §3.3） */
export const CORPS_DIRECTIVE_VALUES = ['advance', 'hold', 'develop'] as const;
export type CorpsDirective = (typeof CORPS_DIRECTIVE_VALUES)[number];

/** 直轄郡開發重點：農業/商業/兵舍（barracks 採 05；勘誤 E-07；語意見 05 §3.2.2；02 §3.3） */
export const DEVELOP_FOCUS_VALUES = ['agri', 'commerce', 'barracks'] as const;
export type DevelopFocus = (typeof DEVELOP_FOCUS_VALUES)[number];

/** 城徵兵方針：低/中/高（每月自動回復，勘誤 E-42；語意見 05 §3.5；02 §3.3） */
export const CONSCRIPT_POLICY_VALUES = ['low', 'mid', 'high'] as const;
export type ConscriptPolicy = (typeof CONSCRIPT_POLICY_VALUES)[number];

/** 家臣出身：一門/譜代/外樣（忠誠公式依賴，勘誤 E-34；語意見 06 §4；02 §3.3） */
export const KINSHIP_VALUES = ['kin', 'fudai', 'tozama'] as const;
export type Kinship = (typeof KINSHIP_VALUES)[number];

/** 【作廢，勘誤 E-18】合戰改用 CmdBattleMove/Attack/Tactic/Delegate（§4.18）取代單一 order 欄位（02 §3.3） */
export const BATTLE_ORDER_KIND_VALUES = ['advance', 'hold', 'charge', 'withdraw'] as const;
export type BattleOrderKind = (typeof BATTLE_ORDER_KIND_VALUES)[number];

/** 具申種類（生成邏輯見 06/09；02 §3.3） */
export const PROPOSAL_KIND_VALUES = [
  'develop', // 內政類
  'facility',
  'conscript',
  'transport',
  'march', // 軍事類
  'recall',
  'diplomacy', // 外交調略類
  'plot',
  'policy', // 勢力經營類
  'recruit',
  'reward',
] as const;
export type ProposalKind = (typeof PROPOSAL_KIND_VALUES)[number];

/** 具申狀態（02 §3.3） */
export const PROPOSAL_STATUS_VALUES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS_VALUES)[number];

/** 初級/中級/上級（00 §11；02 §3.3） */
export const DIFFICULTY_VALUES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTY_VALUES)[number];

/** 季節（02 §3.3；為衍生值，換算見 §5.6） */
export const SEASON_VALUES = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASON_VALUES)[number];

/** 9 地方批次（00 §10；02 §3.3） */
export const REGION_VALUES = [
  'tokai',
  'kinki',
  'kanto',
  'koshinetsu',
  'hokuriku',
  'chugoku',
  'shikoku',
  'kyushu',
  'tohoku',
] as const;
export type Region = (typeof REGION_VALUES)[number];

/** 捕虜處置：登用/釋放/處斬（02 §3.3） */
export const CAPTIVE_ACTION_VALUES = ['recruit', 'release', 'execute'] as const;
export type CaptiveAction = (typeof CAPTIVE_ACTION_VALUES)[number];

/** 金錢褒賞檔位：小/中/大（費用與忠誠增益由 BAL 推導、年內遞減，勘誤 E-29；語意見 06 §3.8.1；02 §3.3） */
export const REWARD_TIER_VALUES = ['small', 'medium', 'large'] as const;
export type RewardTier = (typeof REWARD_TIER_VALUES)[number];
