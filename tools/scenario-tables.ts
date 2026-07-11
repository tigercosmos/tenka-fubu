// 劇本驗證用資料表常數（規格：plan/14-scenario-data.md §3.2 全域校準／9 地方配額表、
// §3.3 勢力清單 41 家 colorIndex 釘選值）。原樣轉錄自 14 之表格，供 tools/validate.ts 的
// V7（總量／地方縮放）、V12（勢力色釘選）、V15（地方配額偏差）比對使用。
//
// 這些是「劇本資料製作校準目標」，非執行期遊戲平衡數值——不進 BAL.*（BAL 專責 core 模擬公式，
// 見 15 §8-1「測試門檻不是遊戲平衡值」同理）；上下限帶寬用 BAL.data* 常數（14 §5.4）。

import type { Region } from '../src/core/state/enums';

/**
 * §3.3 勢力清單 41 家的 colorIndex 釘選值（12 §3.1.3 色盤索引；北條 21→20 見 §8-D6）。
 * V12：每家 clans.json 的 colorIndex 須等於本表值。
 * 唯一重複：`clan.ashikaga` 與 `clan.satake` 共用 16（山城／常陸不相鄰，§8-D6）。
 */
export const CLAN_COLOR_INDEX: Readonly<Record<string, number>> = {
  'clan.oda': 5,
  'clan.imagawa': 31,
  'clan.matsudaira': 17,
  'clan.saito': 9,
  'clan.kitabatake': 13,
  'clan.azai': 18,
  'clan.asakura': 22,
  'clan.rokkaku': 26,
  'clan.miyoshi': 35,
  'clan.tsutsui': 1,
  'clan.hatano': 7,
  'clan.honganji': 30,
  'clan.hatakeyama': 14,
  'clan.jinbo': 37,
  'clan.takeda': 0,
  'clan.nagao': 24,
  'clan.hojo': 20,
  'clan.satomi': 8,
  'clan.satake': 16,
  'clan.utsunomiya': 4,
  'clan.yuki': 28,
  'clan.date': 38,
  'clan.ashina': 11,
  'clan.mogami': 19,
  'clan.nanbu': 25,
  'clan.ando': 33,
  'clan.mori': 15,
  'clan.amago': 23,
  'clan.yamana': 3,
  'clan.uragami': 29,
  'clan.akamatsu': 12,
  'clan.chosokabe': 6,
  'clan.kono': 21,
  'clan.saionji': 32,
  'clan.ichijo': 36,
  'clan.shimazu': 27,
  'clan.otomo': 34,
  'clan.ryuzoji': 10,
  'clan.ito': 39,
  'clan.sagara': 2,
  'clan.ashikaga': 16,
};

/** 一個地方的配額（§3.2 表；kokudaka 為石＝万石×10000）。 */
export interface RegionQuota {
  readonly castles: number;
  readonly districts: number;
  readonly kokudaka: number;
  readonly officers: number;
  readonly provinces: number;
}

/**
 * §3.2 9 地方配額表（合計：城 121／郡 343／石高 1,800 万石／武將 625／國 60）。
 * V7 批次模式：期望值＝白名單地方配額之和（帶 BAL.data* 上下限或 ±dataQuotaDeviationMax）。
 * V15：逐地方實際值與本表偏差 >dataQuotaDeviationMax（10%）即 WARN。
 */
export const REGION_QUOTA: Readonly<Record<Region, RegionQuota>> = {
  tokai: { castles: 16, districts: 44, kokudaka: 2_400_000, officers: 95, provinces: 6 },
  kinki: { castles: 18, districts: 50, kokudaka: 2_950_000, officers: 90, provinces: 9 },
  kanto: { castles: 16, districts: 48, kokudaka: 2_750_000, officers: 75, provinces: 8 },
  koshinetsu: { castles: 9, districts: 27, kokudaka: 1_550_000, officers: 70, provinces: 3 },
  hokuriku: { castles: 10, districts: 28, kokudaka: 1_350_000, officers: 40, provinces: 4 },
  chugoku: { castles: 16, districts: 44, kokudaka: 2_150_000, officers: 75, provinces: 11 },
  shikoku: { castles: 8, districts: 22, kokudaka: 950_000, officers: 40, provinces: 4 },
  kyushu: { castles: 14, districts: 40, kokudaka: 1_800_000, officers: 75, provinces: 9 },
  tohoku: { castles: 14, districts: 40, kokudaka: 2_100_000, officers: 65, provinces: 6 },
};
