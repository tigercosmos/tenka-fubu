// 簡體字／日文新字體黑名單字元集（規格：plan/17-testing.md §5.4，字元清單原樣轉錄、逐字複製，不得增刪）。
// 本檔案自身即含黑名單字元本體，因此列於 tests/config.ts 的 TESTCFG.scanExemptFiles 豁免清單內。
//
// 三層清單：
// - SIMPLIFIED_L1（167 字）：無歧義簡體字，出現即錯誤。
// - SHINJITAI_L3（40 字）：日文新字體，出現即錯誤。
// - CONTEXT_L2（3 字）：合法正體字但常見於劣質簡轉繁誤植，該行需匹配 allow 正規表達式方可放行。
// 三層之外「明確不列入」黑名單的易誤判字（只、松、面、才、系、准、志、台、著、云、周）不在本檔收錄。

/** L1：無歧義簡體字（167 字；E-73 補齊，涵蓋 19 §3.12 簡體欄）——出現即錯誤。
 *  對應正體（同序）：發東門長書學歷時義樂與協軍農達過還進選給
 *                  變現應擊勢壓產傷報繼絕紹織縣區濟漢鐵錢貫
 *                  戰國們會來對開關車馬頭買賣見頁說讀寫議讓
 *                  論轉輕邊運陣隊陽陰際陸難雙聖堅場糧幣帥師
 *                  歸當點劍動勞華單衛員圖團圍圓處備復奪寶實
 *                  宮壽將歲島廣庫張彈強條權極槍榮藥虜補裝計
 *                  認討記許諸談謀諜負貢敗貨賊賞賴銀銃鋒間聞
 *                  險順領飛騎體澤滿溫彥麼淺狹
 *                  齋瀧櫻鹽氣龍驛鄰濱驗檢燈傳眾（E-73 補齊行，對應 §3.12 簡體欄） */
export const SIMPLIFIED_L1: string =
  '发东门长书学历时义乐与协军农达过还进选给' +
  '变现应击势压产伤报继绝绍织县区济汉铁钱贯' +
  '战国们会来对开关车马头买卖见页说读写议让' +
  '论转轻边运阵队阳阴际陆难双圣坚场粮币帅师' +
  '归当点剑动劳华单卫员图团围圆处备复夺宝实' +
  '宫寿将岁岛广库张弹强条权极枪荣药虏补装计' +
  '认讨记许诸谈谋谍负贡败货贼赏赖银铳锋间闻' +
  '险顺领飞骑体泽满温彦么浅狭' +
  '斋泷樱盐气龙驿邻滨验检灯传众';

/** 與 SIMPLIFIED_L1 同序、逐字對應的正體建議字（僅供本檔內部建表用，值同上方註解）。 */
const TRADITIONAL_FOR_L1: string =
  '發東門長書學歷時義樂與協軍農達過還進選給' +
  '變現應擊勢壓產傷報繼絕紹織縣區濟漢鐵錢貫' +
  '戰國們會來對開關車馬頭買賣見頁說讀寫議讓' +
  '論轉輕邊運陣隊陽陰際陸難雙聖堅場糧幣帥師' +
  '歸當點劍動勞華單衛員圖團圍圓處備復奪寶實' +
  '宮壽將歲島廣庫張彈強條權極槍榮藥虜補裝計' +
  '認討記許諸談謀諜負貢敗貨賊賞賴銀銃鋒間聞' +
  '險順領飛騎體澤滿溫彥麼淺狹' +
  '齋瀧櫻鹽氣龍驛鄰濱驗檢燈傳眾';

/** L3：日文新字體（40 字；E-73 補齊，涵蓋 19 §3.12 新字體欄）——出現即錯誤。
 *  對應正體（同序）：拔戰國齋瀧澤邊櫻鹽發對圖氣濟繼單龍驛鄰姬廣濱關鐵驗榮賣讀檢燈來德惠狹淺彈傳眾應歸 */
export const SHINJITAI_L3: string =
  '抜戦国斎滝沢辺桜塩発対図気済継単竜駅隣姫広浜関鉄験栄売読検灯来徳恵狭浅弾伝衆応帰';

/** 與 SHINJITAI_L3 同序、逐字對應的正體建議字（僅供本檔內部建表用，值同上方註解）。 */
const TRADITIONAL_FOR_L3: string =
  '拔戰國齋瀧澤邊櫻鹽發對圖氣濟繼單龍驛鄰姬廣濱關鐵驗榮賣讀檢燈來德惠狹淺彈傳眾應歸';

/**
 * L2：語境敏感字——合法正體字，但該行未匹配 allow 正規表達式即視為簡轉繁誤植。
 * 「里」規則的 `|里見` 分支為 17 §8 決策 15 補入（M0-6 實跑全 repo 掃描時發現：
 * `09-ai.md` 大名能力表「里見」〔關東大名里見氏〕未涵蓋於原允許表達式，屬合法姓氏誤判）。
 */
export const CONTEXT_L2: ReadonlyArray<{ char: string; allow: RegExp; suggestion: string }> = [
  { char: '后', allow: /[皇太王]后|后妃|后土/u, suggestion: '後' },
  { char: '干', allow: /干支|天干|干戈|若干|干擾/u, suggestion: '幹/乾' },
  { char: '里', allow: /[公海]里|里程|鄉里|里山|里見/u, suggestion: '裡' },
];

/**
 * 以兩條等長字串（同序）zip 成「命中字元 → 建議正體字」查表。
 * 建構時 assert 長度相等（code point 數），不相等視為黑名單常數轉錄有誤，立即拋錯而非靜默錯位。
 */
function buildCharMap(source: string, traditional: string): ReadonlyMap<string, string> {
  const sourceChars = [...source];
  const traditionalChars = [...traditional];
  if (sourceChars.length !== traditionalChars.length) {
    throw new Error(
      `simplified-chars: 黑名單字元集與正體對照字串長度不一致` +
        `（${sourceChars.length} vs ${traditionalChars.length}）`,
    );
  }
  const map = new Map<string, string>();
  for (let i = 0; i < sourceChars.length; i += 1) {
    const from = sourceChars[i];
    const to = traditionalChars[i];
    if (from === undefined || to === undefined) {
      throw new Error('simplified-chars: 字元對照表建構時索引越界');
    }
    map.set(from, to);
  }
  return map;
}

/** L1 命中字元 → 建議正體字（§5.4）。 */
export const L1_MAP: ReadonlyMap<string, string> = buildCharMap(SIMPLIFIED_L1, TRADITIONAL_FOR_L1);

/** L3 命中字元 → 建議正體字（§5.4）。 */
export const L3_MAP: ReadonlyMap<string, string> = buildCharMap(SHINJITAI_L3, TRADITIONAL_FOR_L3);
