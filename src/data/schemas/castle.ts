// 城（Castle）zod schema。
// 規格：plan/14-scenario-data.md §4.3（castles.json）。
import { z } from 'zod';
import { CASTLE_TIER_VALUES } from '../../core/state/enums';
import { RE, id, zPos, zName, int0, pct100 } from './common';

/** 城（02 §4.5 Castle 靜態子集；builder 補齊 corpsId=null、durability=max 等）。 */
export const zCastle = z.object({
  id: id(RE.castle),
  name: zName, // '清洲城'
  tier: z.enum(CASTLE_TIER_VALUES), // 城格（00 §4）
  provinceId: id(RE.prov),
  pos: zPos,
  coastal: z.boolean(), // 臨海城（05 §3.4.2 湊/南蠻寺條件；§8-D8）
  ownerClanId: id(RE.clan),
  lordId: id(RE.off).nullable(), // 城主；null=空缺（INV-04 由 validate.ts 檢）
  directControl: z.boolean().default(true), // 開局預設直轄
  maxDurability: z.number().int().positive().nullable().default(null),
  // null=依 tier 取 BAL.durabilityMain/Branch
  soldiers: int0, // 駐兵（人）；≤ castleMaxSoldiers（validate.ts）
  food: int0, // 兵糧（石）
  morale: pct100.default(70), // 城士氣
  facilities: z.array(id(RE.fac)).default([]), // 已完工施設；長度 ≤ slot 數（6/3）
  terrainKind: z.enum(['plain', 'mountain']).default('plain'),
  // 城型（顯示用；平城／山城剪影）。[M6-V7]：builder.ts 刻意不搬入 GameState `Castle`，
  // 僅經 view 邊界 castleTerrainLookup 供給 MapViewState，故 golden/stateHash byte-identical。
});
export type CastleData = z.infer<typeof zCastle>;

export const zCastlesFile = z.array(zCastle).min(1);
export type CastlesFileData = z.infer<typeof zCastlesFile>;
