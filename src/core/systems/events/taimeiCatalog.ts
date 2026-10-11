import { BAL } from '../../balance';
import type { TaimeiId } from '../../state/ids';

export interface TaimeiDef {
  id: TaimeiId;
  name: string;
  description: string;
  unlockPrestige: number;
  prestigeCost: number;
  goldCost: number;
  durationDays: number;
  kind: 'instant' | 'sustained';
}

function define(
  id: keyof typeof BAL.taimeiUnlockPrestige,
  name: string,
  description: string,
  prestigeCost: number,
  durationDays: number,
  goldCost = 0,
): Readonly<TaimeiDef> {
  return Object.freeze({
    id: id as TaimeiId,
    name,
    description,
    prestigeCost,
    durationDays,
    goldCost,
    unlockPrestige: BAL.taimeiUnlockPrestige[id],
    kind: durationDays === 0 ? 'instant' : 'sustained',
  });
}

export const TAIMEI_CATALOG: readonly Readonly<TaimeiDef>[] = Object.freeze([
  define(
    'taimei.gaiko-kosei',
    '外交攻勢',
    '期間我方全部外交工作的信用累積速度加倍。',
    BAL.taimeiGaikoPrestige,
    BAL.taimeiGaikoDays,
  ),
  define(
    'taimei.kenkin-meneki',
    '獻金免役',
    '另扣金錢1000貫，總兵糧5000石，依各城空位比例分配。',
    BAL.taimeiKenkinPrestige,
    0,
    BAL.taimeiKenkinGold,
  ),
  define(
    'taimei.rakuichi-shinko',
    '樂市大振興',
    '期間我方全部郡的商業每日成長量加倍。',
    BAL.taimeiRakuichiPrestige,
    BAL.taimeiRakuichiDays,
  ),
  define(
    'taimei.shippu-jinrai',
    '疾風迅雷',
    '期間我方全部部隊的陸路行軍日速增加30%。',
    BAL.taimeiShippuPrestige,
    BAL.taimeiShippuDays,
  ),
  define(
    'taimei.sodoin',
    '總動員',
    '期間徵兵單次可徵上限增加25%。現行徵兵不收金錢。',
    BAL.taimeiSodoinPrestige,
    BAL.taimeiSodoinDays,
  ),
  define(
    'taimei.sokuji-chohei',
    '即時徵兵',
    '每座我方城依所轄郡人口的2%即時獲兵，各轄郡人口依比例扣減同額。',
    BAL.taimeiSokujiPrestige,
    0,
  ),
  define(
    'taimei.tenka-bushin',
    '天下普請',
    '期間我方全部建設中施設每日工期遞減2日。',
    BAL.taimeiBushinPrestige,
    BAL.taimeiBushinDays,
  ),
  define(
    'taimei.teppeki',
    '鐵壁',
    '期間我方城受攻城耐久損失減少30%，守城方防禦戰力增加20%。',
    BAL.taimeiTeppekiPrestige,
    BAL.taimeiTeppekiDays,
  ),
]);

export function getTaimeiDef(id: TaimeiId): Readonly<TaimeiDef> | undefined {
  return TAIMEI_CATALOG.find((def) => def.id === id);
}
