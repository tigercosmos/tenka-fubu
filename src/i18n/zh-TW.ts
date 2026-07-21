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
  'ui.common.none': '無',
  'ui.common.choose': '請選擇',
  'ui.common.add': '＋',
  'ui.common.currentMax': '{current}／{max}',
  'ui.common.goldAmount': '{value}貫',
  'ui.common.dayAmount': '{value}日',

  // ── plan/12 T2–T7 通用元件（M3-17／M3-18；canonical 值見 plan/13 §6.1、§6.3、§6.5、§6.12） ──
  'ui.table.empty': '無符合條件的資料',
  'ui.table.sortAsc': '遞增排序',
  'ui.table.sortDesc': '遞減排序',
  'ui.slider.all': '全',
  'ui.slider.half': '半',
  'ui.slider.quarter': '四分之一',
  'ui.slider.none': '零',
  'ui.toast.dismiss': '關閉通知',
  'ui.hud.deltaPerMonth': '每月增減',
  'ui.castle.underSiege': '圍',
  'ui.officer.ldr': '統率',
  'ui.officer.val': '武勇',
  'ui.officer.int': '知略',
  'ui.officer.pol': '政務',
  'ui.officer.loyalty': '忠誠',
  'ui.officer.merit': '功績',
  // ── plan/11 §3.7 武將一覽／詳細卡（M3-21）──
  'ui.officers.title': '武將一覽',
  'ui.officer.name': '姓名',
  'ui.officer.rank': '身分',
  'ui.officer.location': '所在',
  'ui.officer.role': '役職',
  'ui.officer.traits': '特性',
  'ui.officer.fiefs': '知行',
  'ui.officer.age': '年齡',
  'ui.officer.history': '經歷',
  'ui.officer.search': '搜尋武將',
  'ui.officer.filter.all': '全部',
  'ui.officer.filter.castle': '所在城',
  'ui.officer.filter.rank': '身分',
  'ui.officer.filter.role': '役職',
  'ui.officer.role.none': '無役職',
  'ui.officer.location.unknown': '不明',
  'ui.officer.marchingTo': '出陣中→{target}',
  'ui.officer.count': '{clan} {count}名',
  'ui.officer.loyaltyRisk': '出奔風險',
  'ui.officer.meritReady': '可升格',
  'term.rank.ashigaruKumigashira': '足輕組頭',
  'term.rank.ashigaruTaisho': '足輕大將',
  'term.rank.samuraiTaisho': '侍大將',
  'term.rank.busho': '部將',
  'term.rank.karo': '家老',
  'term.rank.shukuro': '宿老',
  'term.title.lord': '城主',
  'term.title.steward': '領主',
  'term.title.corpsLeader': '軍團長',
  'term.unit.koku': '石',
  'term.unit.soldiers': '兵',
  'term.unit.people': '人',

  // ── plan/05 §6.2 內政（M3-15／M3-19／M3-20）──
  'ui.domestic.title': '內政',
  'ui.domestic.districts': '郡一覽',
  'ui.domestic.facilities': '城下施設',
  'ui.domestic.budget': '收支',
  'ui.castle.title': '{castle} ◆{clan}{tier}',
  'ui.castle.mainSuffix': '（本城）',
  'ui.castle.tab.overview': '概要',
  'ui.castle.tab.domestic': '內政',
  'ui.castle.tab.military': '軍事',
  'ui.castle.tab.transport': '輸送',
  'ui.castle.lord': '城主',
  'ui.castle.lordStats': '{name}（統{ldr} 武{val} 知{int} 政{pol}）',
  'ui.castle.vacant': '空缺',
  'ui.castle.durability': '耐久',
  'ui.castle.soldiers': '兵力',
  'ui.castle.food': '兵糧',
  'ui.castle.morale': '士氣',
  'ui.castle.foodDays': '守城可支{days}日',
  'ui.castle.foodDaysInfinite': '守城可支無限日',
  'ui.castle.districtCount': '所轄郡（{count}）',
  'ui.castle.districtKokudaka': '{value}石',
  'ui.castle.securityShort': '治{value}',
  'ui.castle.stewardName': '領主：{name}',
  'ui.castle.garrisonCount': '駐留武將（{count}）',
  'ui.castle.facilitySlots': '城下施設（slot {count}）',
  'ui.castle.buildMenu': '建造選單',
  'ui.castle.deploy': '出 陣',
  'ui.castle.availableOfficers': '駐留武將（可出陣 {count}）',
  'ui.castle.officerStats': '{name} 統{ldr} 武{val}',
  'ui.castle.armiesInTransit': '在途我方部隊（{count}）',
  'ui.castle.armyRow': '▸ {name}隊 {soldiers}人 → {target}',
  'ui.transport.destination': '自{from}輸送至：',
  'ui.transport.goldCentral': '金錢由勢力統一持有，不需輸送',
  'ui.transport.execute': '執行輸送',
  'ui.district.kokudaka': '石高',
  'ui.district.commerce': '商業',
  'ui.district.population': '人口',
  'ui.district.security': '治安',
  'ui.district.steward': '領主',
  'ui.district.direct': '直轄',
  'ui.district.potential': '{current}／{max}',
  'ui.district.devPolicy': '開發方針',
  'ui.district.title': '{district}（{castle}轄）◆{clan}',
  'ui.district.uprisingRisk': '一揆危險',
  'ui.district.appointSection': '領主任命',
  'ui.district.stewardCandidate': '{name}（政{pol}・忠{loyalty}）',
  'ui.district.currentSteward': '現任：{name}',
  'ui.district.focusOption': '{focus}優先',
  'ui.district.stewardAutoFocus': '受封郡由領主自動決定開發方針',
  'ui.district.info': '郡情報',
  'ui.district.specialtyRoad': '特產：－ 街道：{castle}方面',
  'term.devPolicy.agri': '農業',
  'term.devPolicy.commerce': '商業',
  'term.devPolicy.barracks': '兵舍',
  'ui.budget.incomeMonthly': '每月收入',
  'ui.budget.salary': '家臣俸祿',
  'ui.budget.policyUpkeep': '政策維持',
  'ui.budget.net': '每月淨額',
  'ui.budget.foodUpkeep': '每月兵糧消耗',
  'ui.budget.harvestForecast': '秋收預估',
  'ui.budget.foodMonthsLeft': '兵糧可支撐{months}個月',
  'cmd.fief.appoint': '任命領主',
  'cmd.fief.dismiss': '罷免領主',
  'cmd.fief.confirmDismiss': '罷免{name}將使其忠誠下降，確定執行？',
  'ui.fief.limitReached': '{name}的知行已達身分上限',
  'ui.fief.notInCastle': '武將須駐於該郡所屬城',
  'ui.facility.build': '建造',
  'ui.facility.demolish': '拆除',
  'ui.facility.queue': '建造佇列',
  'ui.facility.daysLeft': '尚需{days}日',
  'ui.facility.slotEmpty': '（空地）',
  'ui.facility.slotVacant': '空位',
  'ui.facility.requireNotMet': '未滿足建造條件：{reason}',
  'term.facility.ichi': '市',
  'term.facility.komedoiya': '米問屋',
  'term.facility.heisha': '兵舍',
  'term.facility.umaya': '馬廄',
  'term.facility.kajiba': '鍛冶場',
  'term.facility.shagekijo': '射擊場',
  'term.facility.hyojosho': '評定所',
  'term.facility.minato': '湊',
  'term.facility.jisha': '寺社',
  'term.facility.nanbanji': '南蠻寺',
  'term.facility.inkyo': '隱居所',
  'term.facility.kura': '藏',
  'term.facility.toride': '砦',
  'term.facility.gakumonjo': '學問所',
  'term.facility.ikan': '醫館',
  'term.facility.jokaku': '城郭強化',
  'ui.conscript.policy': '徵兵方針',
  'term.conscript.low': '低',
  'term.conscript.mid': '中',
  'term.conscript.high': '高',
  'ui.conscript.monthly': '每月徵兵：約{amount}兵',
  'ui.conscript.max': '最大兵力：{max}兵',
  'cmd.transport.title': '輸送',
  'cmd.transport.confirm': '自{from}輸送至{to}，預計{days}日',
  'cmd.transport.recall': '撤回輸送隊',
  'cmd.rice.buy': '購入兵糧',
  'cmd.rice.sell': '出售兵糧',
  'ui.policy.title': '政策',
  'ui.policy.active': '生效中 {n}／{max}',
  'ui.policy.adopt': '採用',
  'ui.policy.revoke': '廢止',
  'ui.policy.locked': '未解鎖：{condition}',
  'ui.policy.exclusive': '與「{name}」互斥',
  'ui.policy.cooldown': '廢止後冷卻中（{months}個月）',
  'ui.policy.upkeep': '{gold}貫／月',
  'ui.policy.prestigeRequirement': '威信 {prestige}',
  'ui.policy.requiresFacility': '且建有「{name}」',
  'ui.policy.orCourtRank': '，或官位達「{rank}」',
  'ui.policy.orEvent': '，或完成指定事件',
  'term.courtRank.ju5ge': '從五位下',
  'trait.gunshin.name': '軍神',
  'trait.ifudodo.name': '威風堂堂',
  'trait.boshin.name': '謀神',
  'trait.hitotarashi.name': '人蕩',
  'trait.onimusha.name': '鬼武者',
  'trait.chikujo.name': '築城名手',
  'trait.naisei.name': '內政名人',
  'trait.gaiko.name': '外交上手',
  'trait.teppo.name': '鐵砲名人',
  'trait.kiba.name': '騎馬達人',
  'trait.ninja.name': '忍者',
  'trait.kojo.name': '攻城名手',
  'trait.rojo.name': '籠城名手',
  'trait.chiebukuro.name': '智囊',
  'trait.chushin.name': '忠臣',
  'trait.kaizoku.name': '海賊',
  'trait.nosei.name': '農政家',
  'trait.shosai.name': '商才',
  'trait.reisei.name': '冷靜',
  'trait.goketsu.name': '豪傑',
  'trait.keigan.name': '慧眼',
  'trait.jinsei.name': '仁政',
  'trait.shinsoku.name': '神足',
  'trait.heitan.name': '兵站上手',
  'trait.boshu.name': '募兵上手',
  'trait.jinbo.name': '人望',
  'trait.yashin.name': '野心家',
  'trait.chotei.name': '朝廷通',
  'trait.hayamimi.name': '早耳',
  'trait.seiatsu.name': '攻略上手',
  'trait.benzetsu.name': '辯舌',
  'trait.gunryaku.name': '軍略',
  'trait.fudou.name': '不動',
  'trait.hizeme.name': '火攻',
  'trait.kesshi.name': '決死',
  'trait.roukou.name': '老巧',
  'trait.iryou.name': '醫療',
  'pol.rakuichi.name': '樂市樂座',
  'pol.kenchi.name': '檢地',
  'pol.tenmasei.name': '傳馬制',
  'pol.jishahogo.name': '寺社保護',
  'pol.nanban.name': '南蠻貿易',
  'pol.sekisho.name': '關所撤廢',
  'pol.jokashuju.name': '城下集住',
  'pol.meyasubako.name': '目安箱',
  'pol.heinobunri.name': '兵農分離',
  'pol.goningumi.name': '五人組',
  'pol.kakishuchu.name': '火器集中',
  'pol.enkokinko.name': '遠交近攻',
  'report.transport.arrived': '輸送隊已抵達{castle}。',
  'report.transport.looted': '輸送隊於{place}遭{clan}劫掠！',
  'report.transport.lootGain': '我軍於{place}劫獲敵方輸送隊。',
  'report.policy.autoRevoked': '金錢不足，政策「{name}」已自動廢止。',
  'report.economy.income': '{month}月收入{gold}貫。',
  'report.economy.harvest': '秋收！全領兵糧入庫{food}石。',
  'report.economy.granaryOverflow': '{castle}米藏已滿，{food}石散失。',
  'report.economy.castleStarving': '{castle}兵糧見底，士卒逃散！',
  'report.economy.salaryUnpaid': '俸祿未能全額發放，家臣忠誠動搖。',
  'report.uprising.started': '{district}爆發一揆！',
  'report.uprising.suppressed': '{district}的一揆已被鎮壓。',
  'report.uprising.subsided': '{district}的一揆自然平息。',
  'report.officer.promoted': '{name}升格為{rank}。',
  'report.officer.loyaltyLow': '{name}忠誠低落，恐有異心。',
  'report.clan.succession': '{oldLeader}逝去，{newLeader}繼任家督。',
  'report.clan.successionCaptured': '{oldLeader}遭俘，{newLeader}繼任家督。',
  'report.build.done': '{castle}的{facility}已落成。',
  'report.army.departed': '{leader}隊自{castle}出陣。',
  'report.army.arrived': '{leader}隊抵達{place}。',
  'report.army.returned': '{leader}隊歸還{castle}。',
  'report.army.subjugated': '{leader}隊制壓{district}。',
  'report.army.districtLost': '{district}遭{clan}制壓！',
  'report.army.noFood': '{army}兵糧耗盡，士氣潰散中！',
  'report.army.blocked': '{army}行軍受阻，於{place}待命。',
  'report.field.begin': '{a}與{b}於{place}交戰！',
  'report.field.resolved': '{place}的戰鬥告一段落。',
  'report.field.rout': '{army}潰走！',
  'report.battle.available': '{place}可發動合戰！',
  'report.battle.won': '{winner}於{place}擊破{loser}！',
  'report.battle.lost': '{loser}於{place}敗於{winner}。',
  'report.battle.awe.small': '威風（小）！鄰近敵郡望風歸順。',
  'report.battle.awe.medium': '威風（中）！敵方諸郡動搖歸順。',
  'report.battle.awe.large': '威風（大）！{clan}威名震動天下！',
  'report.siege.begin': '{castle}遭{clan}包圍！',
  'report.siege.relief': '援軍抵達{castle}，展開解圍戰！',
  'report.siege.fallen': '{castle}落城！',
  'report.siege.repelled': '{castle}擊退了圍城之敵。',

  // ── 10 §6.3：勝敗判定與結局畫面（MVP 先行實作，原屬 M8-9／M8-10） ──
  'report.clan.destroyed': '{clanName}滅亡了',
  'report.victory.tenkabitoProgress': '天下人之路：條件已連續達成{months}／12月',
  'ui.ending.victory.unification': '天下布武，四海歸一',
  'ui.ending.victory.tenkabito': '奉戴朝廷，號令天下',
  'ui.ending.defeat.noHeir': '{clanName}，就此斷絕',
  'ui.ending.defeat.noCastle': '{clanName}的旗幟，自天下消失了',
  'ui.ending.statYears': '歷時：{years}年{months}月',
  'ui.ending.statBattles': '合戰：{fought}戰{won}勝',
  'ui.ending.statMaxCastles': '最大版圖：{count}城',
  'ui.ending.statMaxKokudaka': '最大石高：{koku}石',
  'ui.ending.statOfficers': '麾下家臣：{count}名',
  // ── 16 §6：存讀檔（MVP 先行實作，原屬 M8-13/M8-14 子集） ──
  'ui.load.quickLoadConfirm': '尚有未存檔的進度，要讀取快速存檔嗎？',
  'ui.ending.actionContinue': '繼續治世',
  'ui.ending.actionObserve': '繼續觀戰',
  'ui.ending.actionTitle': '回到標題',

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

  // ── 13 §6.2：新遊戲精靈（劇本／大名選擇，M2-19 縮減版：無難易度/種子挑選 UI，見各畫面檔頭） ──
  'ui.newGame.back': '返回',
  'ui.newGame.start': '開始遊戲',
  'ui.scenario.title': '劇本選擇',
  'ui.scenario.choose': '選擇此劇本',
  'ui.scenario.stats': '勢力數：{clans}　城數：{castles}',
  // 13 §6.2 未列出下列二 key（載入狀態呈現，M2-19 新增，非規格草案疏漏）：
  'ui.scenario.loading': '載入劇本資料中…',
  'ui.scenario.loadError': '劇本資料載入失敗',
  'ui.daimyo.title': '大名選擇',
  'ui.daimyo.leader': '當主',
  'ui.daimyo.kokudaka': '石高',
  'ui.daimyo.castles': '城',
  'ui.daimyo.officers': '武將',

  // ── 13 §6.3：HUD（M1-20 最小 HUD） ──
  'ui.hud.gold': '金錢',
  'ui.hud.food': '兵糧',
  'ui.hud.soldiers': '兵力',
  'ui.hud.prestige': '威信',
  'ui.rail.domestic': '內政',
  'ui.rail.military': '軍事',
  'ui.rail.officers': '武將',
  'ui.rail.policy': '政策',
  'ui.map.path.unreachable': '無法抵達',

  // ── 13 §6.6：軍事（M4 出陣編成／攻城 overlay）──
  'ui.march.title': '出陣編成',
  'ui.march.origin': '出陣城：{castle}',
  'ui.march.leader': '大將',
  'ui.march.sub': '副將',
  'ui.march.selectGeneral': '選擇大將',
  'ui.march.selectDeputies': '選擇副將（至多{max}名）',
  'ui.march.officerRow': '{name}　統{ldr}　武{val}　上限{troopCap}人',
  'ui.march.soldiers': '兵數',
  'ui.march.food': '攜帶兵糧',
  'ui.march.carryDays': '攜糧日數',
  'ui.march.foodDays': '攜帶兵糧可支{days}日',
  'ui.march.foodPreview': '攜帶兵糧：{food}石（城內餘{rest}石）',
  'ui.march.troopCap': '帶兵上限：{cap}人',
  'ui.march.target': '目標',
  'ui.march.pickTarget': '請在地圖上點選目標',
  'ui.march.pickTargetAction': '在地圖選擇目標',
  'ui.march.backCompose': '返回編成',
  'ui.march.pathSummary': '{from}→{to}（經 {via}）・預估{days}日',
  'ui.march.estDays': '預估{days}日',
  'ui.march.eta': '約{days}日',
  'cmd.march.confirm': '出陣',
  'ui.army.status.marching': '行軍中',
  'ui.army.status.engaged': '交戰中',
  'ui.army.status.sieging': '攻城中',
  'ui.army.status.subjugating': '制壓中',
  'ui.army.status.returning': '歸還中',
  'ui.army.status.routed': '潰走中',
  'ui.army.status.holding': '駐留中',
  'ui.battle.prompt': '是否發動合戰？',
  'ui.battle.title': '合戰 ─ {attacker} 對 {defender} ─ 第{tick}刻',
  'ui.battle.missing': '合戰資料不存在',
  'ui.battle.saihai': '采配',
  'ui.battle.saihaiValue': '采配 {value}／{max}',
  'ui.battle.tick': '第{tick}刻／{max}刻',
  'ui.battle.log': '戰況記錄',
  'ui.battle.logLine': '[{tick}刻] {text}',
  'ui.battle.logProgressed': '戰況推進',
  'ui.battle.ourUnits': '我方部隊',
  'ui.battle.troops': '{count}人',
  'ui.battle.morale': '士氣 {value}',
  'ui.battle.unit.routed': '潰走',
  'ui.battle.unit.idle': '待命',
  'ui.battle.unit.moving': '移動',
  'ui.battle.battlefield': '戰術地圖',
  'ui.battle.honjin': '本陣',
  'ui.battle.flag': '旗 {value}',
  'ui.battle.enemyTroops': '敵軍 {count}人',
  'ui.battle.delegateOn': '開',
  'ui.battle.delegateOff': '關',
  'ui.battle.tacticButton': '{name} {cost}',
  'ui.battle.cooldown': '（冷卻 {ticks}）',
  'ui.battle.pickEnemyTarget': '請選擇敵方部隊',
  'ui.battle.retreat': '撤退',
  'ui.battle.retreatConfirm': '撤退將使士氣受挫並受追擊，確定撤退？',
  'ui.battle.honjinFallen': '本陣陷落！',
  'ui.battle.victory': '合戰勝利',
  'ui.battle.defeat': '合戰敗北',
  'ui.battle.result.lossOurs': '我方損兵 {count}人',
  'ui.battle.result.lossEnemy': '敵方損兵 {count}人',
  'ui.battle.result.merit': '獲得功績 {merit}',
  'ui.battle.result.awe': '威風：{level}',
  'ui.battle.timeFrozen': '合戰進行中，天下大勢暫停',
  'ui.battle.returnStrategy': '返回策略畫面',
  'cmd.battle.open': '發動合戰',
  'cmd.battle.move': '移動',
  'cmd.battle.attack': '攻擊',
  'cmd.battle.tactic': '戰法',
  'cmd.battle.delegate': '委任',
  'cmd.battle.delegateAll': '全軍委任',
  'term.awe.none': '無',
  'term.awe.small': '小',
  'term.awe.medium': '中',
  'term.awe.large': '大',
  'ui.siege.title': '{castle}攻圍 ─ 第{days}日',
  'ui.siege.assault': '強攻',
  'ui.siege.encircle': '包圍',
  'ui.siege.encircleNeed': '包圍需兵力達城兵{ratio}倍',
  'ui.siege.mode': '攻城方式',
  'ui.siege.castleFoodEst': '城糧　估 {days}日',
  'ui.siege.durabilityValue': '耐久　{value}／{max}',
  'ui.siege.moraleValue': '士氣　{value}',

  // ── 13 §6.13：合戰戰法名稱（M5-6） ──
  'tac.charge.name': '突擊',
  'tac.volley.name': '齊射',
  'tac.inspire.name': '鼓舞',
  'tac.taunt.name': '挑撥',
  'tac.disrupt.name': '攪亂',
  'tac.hold.name': '堅守',
  'tac.fire-arrow.name': '火矢',
  'tac.cavalry.name': '騎突',
  'tac.triple-volley.name': '鐵砲三段',
  'tac.last-stand.name': '背水',
  'tac.pin.name': '牽制',
  'tac.heal.name': '治療',

  // ── 13 §6.3／12 §7：MiniMap（M2-18） ──
  'ui.minimap.ariaLabel': '全國小地圖',

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
