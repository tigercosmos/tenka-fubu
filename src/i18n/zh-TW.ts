// 全部 UI 字串（唯一語系 zh-TW）＋ t()／hasKey()／getMissingKeys()／format* 函式（唯一模組檔）。
// 規格：plan/00-foundations.md §3（canonical 目錄樹，`src/i18n/` 下僅列本檔）／§9（i18n 規範）；
//       plan/13-i18n-strings.md §3.1-§3.3（模組結構／t()／插值／缺 key 警告）／§3.4（key 命名規範）／
//       §5.2-§5.3（interpolate／format*）。
//
// 【設計決策：單檔，而非 13 §3.1／§8-D1 規劃之三檔（zh-TW.ts／index.ts／format.ts）】
// 13 §8 D1 原規劃拆三檔，理由是利於字串表人工審閱與簡體字掃描器單純化。但：
//   (a) `plan/00-foundations.md` §3 canonical 目錄樹 `src/i18n/` 下僅列 `zh-TW.ts` 一個檔案；
//   (b) `plan/01-architecture.md` §3.7.3「邊界規則 3：i18n 零依賴」已實作於 `eslint.config.js`
//       （`files: ['src/i18n/**/*.ts']` 搭配 `no-restricted-imports` 的 `group: ['*']`），
//       此規則封鎖的是「匹配任一 glob pattern 的 import source」，經實測連同目錄的相對匯入
//       （如 `./zh-TW`）亦一併封鎖——即使刻意只留給 `zh-TW.ts` 本身零依賴，只要 `index.ts`／
//       `format.ts` 一併落在 `src/i18n/**/*.ts` glob 下，兩者互相 import 仍會被同一條規則擋下。
// 兩者皆使 13 §8-D1 的三檔拆分在目前鐵律下不可行。依 00 > 13 優先序，改為單檔：
// 主字串表與 `t()`/`hasKey()`/`getMissingKeys()`/`formatNumber()`/`formatDate()`/`formatYearMonth()`
// 同檔零 import 共存。本決策已回寫 `plan/13-i18n-strings.md` §8（D17）。
//
// 【`formatDate`／`formatYearMonth` 的曆法換算獨立重寫，非誤植】13 §5.3 原文以 02 §5.6
// `dayToCalendar`（`src/core/systems/time.ts`）為權威實作，但本檔零依賴、不得 import `src/core`
// （同上，實測相對匯入亦被擋）；故本檔內自帶一份常數與演算法皆對齊 02 §5.6／00 §5.1 canonical
// 的獨立純函式（`dayToCalendarLocal`，見下）。與 `src/core/state/serialize.ts` 因「core 不得
// import tests/」而獨立重寫 `fnv1a64`／`canonicalStringify` 同一取捨；`EPOCH_YEAR`＝1560、
// `DAYS_PER_MONTH`＝30、`DAYS_PER_YEAR`＝360 三常數如再改動須與 `time.ts` 同步手動更新。
// `formatSigned`／`formatQuantity`／`sentimentTermKey` 非本階段消費者所需，暫緩留待其消費者到位時補上。
//
// 缺 key／缺插值參數之開發期警告：見 §3.3／§5.2 演算法（本檔逐字實作）。
// 全案禁止簡體字與日文新字體（`tools/scan-simplified.ts`／`npm run validate:data` 掃描）。

/**
 * 主字串表。扁平 key、點號分段；依 13 §3.4.1 的九個區段前綴分類（本檔目前含 `ui.`／`cmd.` 兩前綴，
 * 隨 M1 各任務逐步擴充其餘七段）。禁止巢狀物件、禁止執行期組表（`as const` 使全部 key 成為
 * 字面值型別，13 §3.1）。
 */
export const zhTW = {
  // ── plan/01-architecture.md §6.2：架構層字串（致命錯誤畫面；M1-18／01-A9） ──
  // 注意：13 §2 關係表列舉的字串來源草案僅含 03～10、16、11、12，未含 01——01 §7 明列
  // 「除錯工具」（含致命錯誤畫面）為其專屬擁有範圍（00 §7「一個機制只在一份文件定義」），
  // 故下列 key 直接採 01 §6.2 原文定案，不屬 13 主表的正名/收斂對象。
  'ui.error.title': '發生未預期的錯誤',
  'ui.error.body':
    '遊戲遇到無法復原的錯誤，時間已停止。你可以匯出最近的進度存檔，重新載入頁面後讀取。',
  'ui.error.detail': '錯誤詳情',
  'ui.error.export': '匯出存檔',
  'ui.error.reload': '重新載入',

  // ── 13 §6.1 通用（M1-20 起用到者先行併入） ──
  'ui.common.confirm': '確定',
  'ui.common.cancel': '取消',
  'ui.common.noData': '（無資料）',

  // ── 13 §6.1／03 §6.2／12-T7：SpeedControl 速度控制 ──
  'ui.speed.paused': '暫停',
  'ui.speed.x1': '×1',
  'ui.speed.x2': '×2',
  'ui.speed.x5': '×5',
  'ui.speed.aria.pause': '暫停',
  'ui.speed.aria.x1': '一倍速',
  'ui.speed.aria.x2': '二倍速',
  'ui.speed.aria.x5': '五倍速',

  // ── 13 §6.1／03 §6.2：通知嚴重度／自動暫停原因（M1-17 起用；先行併入供 HUD 顯示） ──
  'ui.notify.severity.info': '情報',
  'ui.notify.severity.warning': '警告',
  'ui.notify.severity.critical': '重大',
  'ui.notify.autopause': '時間已自動暫停：{reason}',
  'ui.notify.reason.siegeOnPlayer': '我方城池遭到包圍',
  'ui.notify.reason.battleAvailable': '可發動合戰',
  'ui.notify.reason.proposalArrived': '收到家臣具申',
  'ui.notify.reason.envoyArrived': '他國使者來訪',
  'ui.notify.reason.historicalEvent': '發生歷史事件',
  'ui.notify.reason.monthStart': '月初',
  'ui.hud.pausedBy.user': '已暫停',
  'ui.hud.autoPausedHidden': '視窗切換至背景，遊戲已自動暫停',
  'ui.hud.resume': '繼續',
  'ui.hud.pendingCommands': '待執行指令：{count}件',

  // ── 13 §6.2：標題、新遊戲（M1-20 最小標題畫面） ──
  'ui.title.gameTitle': '天下布武',
  'ui.title.subtitle': '〜 戰國大戰略・致敬同人作品 〜',
  'ui.title.newGame': '新遊戲',
  'ui.title.continue': '繼續',
  'ui.title.loadGame': '讀取存檔',
  'ui.title.settings': '設定',
  'ui.title.disclaimer': '本作為非商業致敬同人作品',

  // ── 13 §6.3：HUD（M1-20 最小 HUD） ──
  'ui.hud.gold': '金錢',
  'ui.hud.food': '兵糧',
  'ui.hud.soldiers': '兵力',
  'ui.hud.prestige': '威信',

  // ── 13 §3.8：數量單位（隨 formatQuantity 樣式手動組字時使用；M1-20 僅用到金錢） ──
  'term.unit.gold': '貫',

  // ── 01 §3.11.2／13 §6.10：除錯面板（M1-22；草案併入見 13 §8 D17） ──
  'ui.debug.title': '除錯面板',
  'ui.debug.section.time': '時間',
  'ui.debug.section.cheat': '資源作弊',
  'ui.debug.section.state': '狀態',
  'ui.debug.skipDays': '跳轉{days}日', // 13 §6.10 定案（非 01 草案 jumpDays，見 13 §8 D17）
  'ui.debug.skipping': '時間跳轉中……（{done}／{total}日）',
  'ui.debug.addGold': '金錢 +{amount}貫',
  'ui.debug.needCastleSelected': '請先在地圖選取一座我方城',
  'ui.debug.stateHash': '狀態雜湊：{hash}', // M1-22 新增（非 01/13 既有 key，見 13 §8 D17）
  'ui.debug.seed': '種子：{seed}',

  // ── 03 §6.2／13 §6.17：指令拒絕訊息（cmd.reject.*；M1-6 起已用其 reasonKey，先行併入文案） ──
  'cmd.reject.generic': '指令無法執行',
  'cmd.reject.notOwner': '目標不屬於我方勢力',
  'cmd.reject.invalidTarget': '目標無效或已不存在',
  'cmd.reject.insufficientGold': '金錢不足（需要{cost}貫）',
  'cmd.reject.insufficientFood': '兵糧不足（需要{cost}石）',
  'cmd.reject.insufficientTroops': '兵力不足（需要{count}人）',
  'cmd.reject.officerBusy': '{name}正在執行其他任務',
  'cmd.reject.alreadyActive': '該項目已在執行中',
  'cmd.reject.rankTooLow': '{name}的身分不足以擔任此職',
  'cmd.reject.pathBlocked': '無法規劃通往目標的路徑',
  'cmd.reject.gameOver': '大局已定，無法再下達指令',
  'cmd.reject.debugOnly': '此指令僅限除錯模式使用',
  'cmd.reject.debugBadRange': '天數超出可跳轉範圍（1～{max}日）',
  'cmd.reject.delegatedToCorps': '此城已委由軍團管理，無法直接下令', // 13 §6.17 定案措辭
  'cmd.reject.notImplemented': '此指令尚未實作',
} as const;

export type ZhTwTable = typeof zhTW;
/** 字面值聯集，供 t() 靜態檢查（13 §3.1）。 */
export type StringKey = keyof ZhTwTable;

export type TParam = string | number;
export type TParams = Readonly<Record<string, TParam>>;

/** DEV 模式蒐集到的缺字串 key（13 §3.3；`window.__i18nMissing` 指向同一個 Set）。 */
const missingKeySet = new Set<string>();
/** DEV 模式蒐集到的「key 存在但缺插值參數」警告（13 §5.2 第 3 點，各 key+參數名只警告一次）。 */
const missingParamWarnings = new Set<string>();

/**
 * 13 §5.3 formatNumber：顯示值一律整數化（`Math.trunc`）＋千分位；負號採 U+2212（減號符號，
 * 非 ASCII 連字號 `-`）。
 */
export function formatNumber(n: number): string {
  const i = Math.trunc(n);
  const digits = Math.abs(i)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (i < 0 ? '−' : '') + digits;
}

// 13 §5.3 formatDate／formatYearMonth 需要「絕對日→曆法三欄」換算（02 §5.6 canonical，權威實作
// 為 `src/core/systems/time.ts` 的 `dayToCalendar`）。本檔（`src/i18n/**`）依 eslint 邊界規則 3
// 零依賴、不得 import 該函式（已實測連相對匯入亦被擋，見 13 §8 D17），故此處自帶等價的獨立純函式；
// 常數（EPOCH_YEAR=1560／DAYS_PER_MONTH=30／DAYS_PER_YEAR=360）與 02 §5.6／00 §5.1 canonical
// 若日後改動須同步手動更新（與 `src/core/state/serialize.ts` 獨立重寫 fnv1a64 同一取捨）。
const I18N_EPOCH_YEAR = 1560;
const I18N_DAYS_PER_MONTH = 30;
const I18N_DAYS_PER_YEAR = I18N_DAYS_PER_MONTH * 12;

interface I18nCalendar {
  year: number;
  month: number; // 1..12
  dayOfMonth: number; // 1..30
}

function dayToCalendarLocal(absoluteDay: number): I18nCalendar {
  const year = I18N_EPOCH_YEAR + Math.floor(absoluteDay / I18N_DAYS_PER_YEAR);
  const dayInYear = ((absoluteDay % I18N_DAYS_PER_YEAR) + I18N_DAYS_PER_YEAR) % I18N_DAYS_PER_YEAR;
  const month = Math.floor(dayInYear / I18N_DAYS_PER_MONTH) + 1;
  const dayOfMonth = (dayInYear % I18N_DAYS_PER_MONTH) + 1;
  return { year, month, dayOfMonth };
}

/** 13 §5.3 formatDate：絕對日 → `'1560年5月3日'`（年不做千分位、年月日無前導零）。 */
export function formatDate(absoluteDay: number): string {
  const { year, month, dayOfMonth } = dayToCalendarLocal(absoluteDay);
  return `${String(year)}年${String(month)}月${String(dayOfMonth)}日`;
}

/** 13 §5.3 formatYearMonth：絕對日 → `'1560年5月'`。 */
export function formatYearMonth(absoluteDay: number): string {
  const { year, month } = dayToCalendarLocal(absoluteDay);
  return `${String(year)}年${String(month)}月`;
}

/** 13 §5.2 interpolate：`{name}` 具名參數插值；number 參數經 formatNumber，其餘字串原樣插入。 */
function interpolate(template: string, params: TParams | undefined, key: string): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (whole: string, name: string): string => {
    if (params === undefined || !(name in params)) {
      if (import.meta.env.DEV) {
        const warnOnceKey = `${key}::${name}`;
        if (!missingParamWarnings.has(warnOnceKey)) {
          missingParamWarnings.add(warnOnceKey);
          console.warn(`[i18n] key '${key}' 缺少插值參數：${name}`);
        }
      }
      return whole;
    }
    const value = params[name];
    if (value === undefined) return whole; // 理論不可達（已通過 `name in params`檢查），防禦性早退
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

/**
 * 13 §3.2／§3.3：取字串並插值。key 參數型別採 `StringKey | (string & {})`：字面值呼叫享有
 * 自動完成與存在性檢查；動態組出的 key（`report.*`、`term.rank.*` 等）仍可傳入。
 * 純函式（同輸入同輸出）；DEV 模式下缺 key 的 `console.warn` 副作用只發生一次（每 key）。
 */
export function t(key: StringKey | (string & {}), params?: TParams): string {
  const entry: string | undefined = (zhTW as Readonly<Record<string, string>>)[key];
  if (entry === undefined) {
    if (import.meta.env.DEV) {
      if (!missingKeySet.has(key)) {
        missingKeySet.add(key);
        console.warn(`[i18n] 缺少字串 key：${key}`);
      }
      return `⟦${key}⟧`; // 開發期以雙角括號「⟦key⟧」醒目標示（13 §3.3）
    }
    return key; // 產品環境：可讀降級，不擲例外（13 §3.3）
  }
  return interpolate(entry, params, key);
}

/** key 是否存在於 zhTW（動態 key 呼叫前的防禦性檢查，13 §3.2）。 */
export function hasKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(zhTW, key);
}

/** DEV 模式蒐集到的全部缺字串 key（測試與除錯用；13 §3.3）。PROD 恆回空陣列。 */
export function getMissingKeys(): readonly string[] {
  return Array.from(missingKeySet);
}

/** 測試專用：清空缺 key／缺參數的警告紀錄，避免跨測試案例互相干擾。非產品程式碼路徑。 */
export function resetMissingKeyTrackingForTests(): void {
  missingKeySet.clear();
  missingParamWarnings.clear();
}

// DEV 模式掛 `window.__i18nMissing`（指向 missingKeySet 本體）供除錯面板讀取（13 §3.3）。
// `typeof window !== 'undefined'` 防禦：本檔的 Vitest 測試跑在 'core' project（node 環境，
// 見 vitest.workspace.ts），該環境無 `window` 全域。
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __i18nMissing?: Set<string> }).__i18nMissing = missingKeySet;
}
