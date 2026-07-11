// AI persona 五軸 zod schema。
// 規格：plan/14-scenario-data.md §4.11（personas.json）。
import { z } from 'zod';
import { RE, id, pct100 } from './common';

/**
 * AI persona：每勢力一筆 `persona.<clan slug>` ＋ `persona.default`（五軸皆 50）。
 * 五軸值 = 09 §3.2 建議值表（09 為數值真相；本檔為載體）。
 */
export const zPersonaEntry = z.object({
  id: id(RE.persona),
  aggression: pct100,
  diplomacy: pct100,
  development: pct100,
  loyalty: pct100,
  ambition: pct100,
});
export type PersonaEntryData = z.infer<typeof zPersonaEntry>;

export const zPersonasFile = z.object({
  version: z.literal(1),
  personas: z.array(zPersonaEntry).min(41),
});
export type PersonasFileData = z.infer<typeof zPersonasFile>;
