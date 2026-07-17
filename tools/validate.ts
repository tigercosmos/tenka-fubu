// 劇本資料驗證工具（規格：plan/14-scenario-data.md §5.1 驗證器 V1–V15＋`--regions` 批次模式；
// 整合方式：plan/17-testing.md §3.6.1）。M2-2（14-T2）完整版。
//
// 檔案分層（比照 tools/scan-simplified.ts、tools/check-font-coverage.ts 的「純函式庫＋CLI 包裝」慣例）：
// - `parseScenario(raw)`：對每個檔案內容跑 §4 zod schema（V1），回傳已解析的 `ScenarioWorld`＋V1 違規。
// - `checkWorld(world, options)`：純函式，對記憶體中的 world 跑 V1（officers 檔名一致）＋V2–V15；
//   不讀檔、不印東西、不呼叫 process.exit，供 Vitest 逐條檢查以違規 fixture 驗收。
// - `filterWorldByRegions(world, regions)`：`--regions` 白名單過濾（§7 批次模式）。
// - `validateScenario(scenarioId, options)`：自 `src/data/scenarios/<id>/` 讀檔 → parse → check；
//   劇本資料尚未建立（M2-8 起）時回傳「尚無劇本資料」提示、無違規（維持 `npm run validate:data` 綠）。
// - `main()`：CLI 包裝——解析 `--regions=`、印報告（`ERROR|WARN <編號> <訊息> [ids]`）、決定 exit code。
//
// 與既有工具串接：`npm run validate:data` 依序跑 validate → scan-simplified → check-font-coverage；
// 本檔 V10 另在「劇本 JSON 的 name/text/label 值」層再跑一次黑名單掃描（黑名單常數自 17 §5.4
// 實作 tools/simplified-chars.ts 匯入，與 scan-simplified 同一真相）。
//
// 【勘誤・回寫 14 §8-D17】V13「全部節點座標唯一（間距 ≥ 8 wu）」與 §3.4 錨點表自相矛盾：
// §3.4 canonical 錨點清洲（1966,2838）與那古野（1968,2843）僅相距 ~5.4 wu（史實兩城本就緊鄰），
// 若採「間距 ≥ 8」硬規則，連 §3.5 施工樣板都無法通過 V1–V14。依 00>02>15 優先序（錨點表為
// 04 §3.2 投影＋00 §8 之 canonical 座標，優先於 §5.1 之附帶字句），V13 節點檢查採「座標唯一」
// （不得有兩節點座標完全相同）為 ERROR 語意，最小間距字句失效（已回寫 14 §8-D17）。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

import { BAL } from '../src/core/balance';
import { REGION_VALUES, RANK_VALUES } from '../src/core/state/enums';
import type { Region } from '../src/core/state/enums';
import {
  ID_PATTERN,
  isClanId,
  isOfficerId,
  isCastleId,
  isDistrictId,
  isProvinceId,
  isEventId,
  isTraitId,
  isTacticId,
  isPolicyId,
  isAiPersonaId,
} from '../src/core/state/ids';
import {
  zProvincesFile,
  zCastlesFile,
  zDistrictsFile,
  zRoadsFile,
  zClansFile,
  zOfficersFile,
  zEventsFile,
  zTraitsFile,
  zTacticsFile,
  zPoliciesFile,
  zPersonasFile,
} from '../src/data/schemas';
import type {
  ProvinceData,
  CastleData,
  DistrictData,
  RoadEdgeData,
  ClanData,
  OfficerData,
  EventData,
  TraitEntryData,
  TacticEntryData,
  PolicyEntryData,
  PersonaEntryData,
  PactInitData,
  WarEntryData,
  SentimentEntryData,
} from '../src/data/schemas';
import { zJapanOutlineFile } from '../src/data/schemas/outline';
import type { JapanOutlineFile } from '../src/data/schemas/outline';
import { L1_MAP, L3_MAP, CONTEXT_L2 } from './simplified-chars';
import { ANCHOR_CASTLES } from './anchors';
import { CLAN_COLOR_INDEX, REGION_QUOTA } from './scenario-tables';

// ═══════════════════════════════════════════════════════════════════
// 型別
// ═══════════════════════════════════════════════════════════════════

export type Severity = 'ERROR' | 'WARN';

/** 單筆檢查違規（§5.1 輸出格式 `ERROR|WARN <編號> <訊息> [ids]`）。 */
export interface Violation {
  readonly severity: Severity;
  /** 檢查編號 'V1'..'V15'。 */
  readonly check: string;
  readonly message: string;
  /** 相關實體 id（供報表定位）。 */
  readonly ids: readonly string[];
}

/** 開局外交區塊（clans.json 的 diplomacy；§4.5）。 */
export interface DiplomacyData {
  readonly pacts: readonly PactInitData[];
  readonly wars: readonly WarEntryData[];
  readonly sentiments: readonly SentimentEntryData[];
}

/** 單一 officers/<region>.json 檔（保留檔名地方與 JSON 內宣告地方，供 V1 一致性檢查）。 */
export interface OfficerGroup {
  readonly fileRegion: Region; // 來自檔名 officers/<region>.json
  readonly declaredRegion: Region; // 來自 JSON 的 region 欄
  readonly officers: readonly OfficerData[];
}

/** 記憶體中的劇本世界（各子陣列已通過 §4 zod 逐筆驗證）。 */
export interface ScenarioWorld {
  readonly id: string;
  readonly provinces: readonly ProvinceData[];
  readonly castles: readonly CastleData[];
  readonly districts: readonly DistrictData[];
  readonly roads: readonly RoadEdgeData[];
  readonly clans: readonly ClanData[];
  readonly diplomacy: DiplomacyData;
  readonly officerGroups: readonly OfficerGroup[];
  readonly events: readonly EventData[];
  readonly traits: readonly TraitEntryData[];
  readonly tactics: readonly TacticEntryData[];
  readonly policies: readonly PolicyEntryData[];
  readonly personas: readonly PersonaEntryData[];
  readonly outline: JapanOutlineFile | null;
}

/** checkWorld 選項。 */
export interface CheckOptions {
  /** `--regions` 白名單（批次模式）；world 應已由 filterWorldByRegions 過濾。 */
  readonly regions?: readonly Region[];
}

/** 驗證結果（back-compat：errors 非空即代表資料不合法，CLI 以此決定 exit code）。 */
export interface ValidationResult {
  readonly violations: readonly Violation[];
  /** ERROR 級違規的格式化字串（驅動 exit code；沿用 M0-7 stub 介面）。 */
  readonly errors: readonly string[];
  /** WARN 級違規的格式化字串（不影響 exit code）。 */
  readonly warnings: readonly string[];
  /** 非違規提示（如「尚無劇本資料」）；有值時不影響 exit code。 */
  readonly notice: string | null;
}

/** 原始檔案輸入（每欄為 JSON.parse 後的 unknown，交由 parseScenario 跑 zod）。 */
export interface RawScenarioInputs {
  readonly id: string;
  readonly provinces?: unknown;
  readonly castles?: unknown;
  readonly districts?: unknown;
  readonly roads?: unknown;
  readonly clans?: unknown;
  readonly events?: unknown;
  readonly traits?: unknown;
  readonly tactics?: unknown;
  readonly policies?: unknown;
  readonly personas?: unknown;
  readonly outline?: unknown;
  /** 每個 officers/<region>.json：檔名地方＋內容。 */
  readonly officers?: readonly { readonly region: string; readonly value: unknown }[];
}

// ═══════════════════════════════════════════════════════════════════
// 共用小工具
// ═══════════════════════════════════════════════════════════════════

const err = (check: string, message: string, ids: readonly string[] = []): Violation => ({
  severity: 'ERROR',
  check,
  message,
  ids,
});
const warn = (check: string, message: string, ids: readonly string[] = []): Violation => ({
  severity: 'WARN',
  check,
  message,
  ids,
});

export function formatViolation(v: Violation): string {
  const idPart = v.ids.length > 0 ? ` [${v.ids.join(', ')}]` : '';
  return `${v.severity} ${v.check} ${v.message}${idPart}`;
}

const rankIndex = (r: string): number => RANK_VALUES.indexOf(r as (typeof RANK_VALUES)[number]);
const SAMURAI_TAISHO_INDEX = RANK_VALUES.indexOf('samurai-taisho');

/** 40 色環距（§5.1：ringDist(a,b)=min(|a−b|, 40−|a−b|)）。 */
function ringDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 40 - d);
}

/** 無向勢力對 key（字典序小者在前）。 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 全部武將（跨 officers 檔攤平）。 */
function allOfficers(world: ScenarioWorld): OfficerData[] {
  return world.officerGroups.flatMap((g) => [...g.officers]);
}

// ── 世界索引（各檢查共用；一次建立） ──
interface WorldIndex {
  readonly clanIds: ReadonlySet<string>;
  readonly clanById: ReadonlyMap<string, ClanData>;
  readonly officerById: ReadonlyMap<string, OfficerData>;
  readonly castleById: ReadonlyMap<string, CastleData>;
  readonly districtById: ReadonlyMap<string, DistrictData>;
  readonly provinceById: ReadonlyMap<string, ProvinceData>;
  readonly provinceIds: ReadonlySet<string>;
  readonly eventIds: ReadonlySet<string>;
  readonly traitIds: ReadonlySet<string>;
  readonly tacticById: ReadonlyMap<string, TacticEntryData>;
  readonly policyIds: ReadonlySet<string>;
  readonly personaIds: ReadonlySet<string>;
  readonly officers: readonly OfficerData[];
}

function buildIndex(world: ScenarioWorld): WorldIndex {
  const officers = allOfficers(world);
  return {
    clanIds: new Set(world.clans.map((c) => c.id)),
    clanById: new Map(world.clans.map((c) => [c.id, c])),
    officerById: new Map(officers.map((o) => [o.id, o])),
    castleById: new Map(world.castles.map((c) => [c.id, c])),
    districtById: new Map(world.districts.map((d) => [d.id, d])),
    provinceById: new Map(world.provinces.map((p) => [p.id, p])),
    provinceIds: new Set(world.provinces.map((p) => p.id)),
    eventIds: new Set(world.events.map((e) => e.id)),
    traitIds: new Set(world.traits.map((t) => t.id)),
    tacticById: new Map(world.tactics.map((t) => [t.id, t])),
    policyIds: new Set(world.policies.map((p) => p.id)),
    personaIds: new Set(world.personas.map((p) => p.id)),
    officers,
  };
}

/** 城/郡節點集合（MapNodeId）。 */
function nodeIdSet(world: ScenarioWorld): Set<string> {
  const s = new Set<string>();
  for (const c of world.castles) s.add(c.id);
  for (const d of world.districts) s.add(d.id);
  return s;
}

/**
 * 一個 id 字串若屬「本工具可交叉檢查的類別」且不存在於對應集合，回傳缺失類別中文名；否則 null。
 * fac.*／taimei.*／road.*／執行期流水號 id 不在此交叉檢查（型錄本體在 core，或無資料側目標集合）。
 */
function refMissing(s: string, idx: WorldIndex): string | null {
  if (isClanId(s)) return idx.clanIds.has(s) ? null : '勢力';
  if (isOfficerId(s)) return idx.officerById.has(s) ? null : '武將';
  if (isCastleId(s)) return idx.castleById.has(s) ? null : '城';
  if (isDistrictId(s)) return idx.districtById.has(s) ? null : '郡';
  if (isProvinceId(s)) return idx.provinceIds.has(s) ? null : '國';
  if (isEventId(s)) return idx.eventIds.has(s) ? null : '事件';
  if (isTraitId(s)) return idx.traitIds.has(s) ? null : '特性';
  if (isTacticId(s)) return idx.tacticById.has(s) ? null : '戰法';
  if (isPolicyId(s)) return idx.policyIds.has(s) ? null : '政策';
  if (isAiPersonaId(s)) return idx.personaIds.has(s) ? null : 'persona';
  return null;
}

/** 遞迴走訪任意 JSON 值，對每個字串葉節點呼叫 visit。 */
function walkStrings(value: unknown, visit: (s: string) => void): void {
  if (typeof value === 'string') {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkStrings(v, visit);
  }
}

/** 遞迴走訪 JSON 值，對 key 為 name/text/label 的字串值呼叫 visit。 */
function walkNameFields(value: unknown, visit: (field: string, text: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkNameFields(item, visit);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === 'name' || k === 'text' || k === 'label') && typeof v === 'string') {
        visit(k, v);
      }
      walkNameFields(v, visit);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// V2：全域 ID 唯一（跨檔）＋前綴 regex
// ═══════════════════════════════════════════════════════════════════
function checkIds(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  const defs: { id: string; re: RegExp; kind: string }[] = [];
  for (const p of world.provinces) defs.push({ id: p.id, re: ID_PATTERN.ProvinceId, kind: '國' });
  for (const c of world.castles) defs.push({ id: c.id, re: ID_PATTERN.CastleId, kind: '城' });
  for (const d of world.districts) defs.push({ id: d.id, re: ID_PATTERN.DistrictId, kind: '郡' });
  for (const r of world.roads) defs.push({ id: r.id, re: ID_PATTERN.RoadEdgeId, kind: '街道' });
  for (const c of world.clans) defs.push({ id: c.id, re: ID_PATTERN.ClanId, kind: '勢力' });
  for (const o of allOfficers(world))
    defs.push({ id: o.id, re: ID_PATTERN.OfficerId, kind: '武將' });
  for (const e of world.events) defs.push({ id: e.id, re: ID_PATTERN.EventId, kind: '事件' });
  for (const t of world.traits) defs.push({ id: t.id, re: ID_PATTERN.TraitId, kind: '特性' });
  for (const t of world.tactics) defs.push({ id: t.id, re: ID_PATTERN.TacticId, kind: '戰法' });
  for (const p of world.policies) defs.push({ id: p.id, re: ID_PATTERN.PolicyId, kind: '政策' });
  for (const p of world.personas)
    defs.push({ id: p.id, re: ID_PATTERN.AiPersonaId, kind: 'persona' });

  const seen = new Map<string, string[]>();
  for (const d of defs) {
    if (!d.re.test(d.id)) {
      v.push(err('V2', `${d.kind} ID「${d.id}」不符 00 §8 前綴 regex`, [d.id]));
    }
    const kinds = seen.get(d.id) ?? [];
    kinds.push(d.kind);
    seen.set(d.id, kinds);
  }
  for (const [id, kinds] of seen) {
    if (kinds.length > 1) {
      v.push(err('V2', `ID「${id}」跨檔重複定義（${kinds.join('／')}）`, [id]));
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V3：引用完整
// ═══════════════════════════════════════════════════════════════════
function checkRefs(world: ScenarioWorld, idx: WorldIndex): Violation[] {
  const v: Violation[] = [];
  const need = (
    present: boolean,
    kind: string,
    refId: string,
    ownerDesc: string,
    ownerId: string,
  ): void => {
    if (!present) v.push(err('V3', `${ownerDesc} 引用不存在的${kind} ${refId}`, [refId, ownerId]));
  };

  for (const c of world.castles) {
    need(idx.clanIds.has(c.ownerClanId), '勢力', c.ownerClanId, `城 ${c.id} 的 ownerClanId`, c.id);
    need(idx.provinceIds.has(c.provinceId), '國', c.provinceId, `城 ${c.id} 的 provinceId`, c.id);
    if (c.lordId !== null) {
      need(idx.officerById.has(c.lordId), '武將', c.lordId, `城 ${c.id} 的 lordId`, c.id);
    }
  }
  for (const d of world.districts) {
    need(idx.castleById.has(d.castleId), '城', d.castleId, `郡 ${d.id} 的 castleId`, d.id);
    if (d.stewardId !== null) {
      need(idx.officerById.has(d.stewardId), '武將', d.stewardId, `郡 ${d.id} 的 stewardId`, d.id);
    }
  }
  for (const c of world.clans) {
    need(idx.officerById.has(c.leaderId), '武將', c.leaderId, `勢力 ${c.id} 的 leaderId`, c.id);
    need(
      idx.castleById.has(c.homeCastleId),
      '城',
      c.homeCastleId,
      `勢力 ${c.id} 的 homeCastleId`,
      c.id,
    );
    need(
      idx.personaIds.has(c.personaId),
      'persona',
      c.personaId,
      `勢力 ${c.id} 的 personaId`,
      c.id,
    );
  }
  for (const o of idx.officers) {
    if (o.clanId !== null) {
      need(idx.clanIds.has(o.clanId), '勢力', o.clanId, `武將 ${o.id} 的 clanId`, o.id);
    }
    need(
      idx.castleById.has(o.locationCastleId),
      '城',
      o.locationCastleId,
      `武將 ${o.id} 的 locationCastleId`,
      o.id,
    );
    for (const t of o.traits) {
      need(idx.traitIds.has(t), '特性', t, `武將 ${o.id} 的 traits`, o.id);
    }
    for (const t of o.tactics) {
      need(idx.tacticById.has(t), '戰法', t, `武將 ${o.id} 的 tactics`, o.id);
    }
    if (o.debutClanId !== undefined && o.debutClanId !== null) {
      need(
        idx.clanIds.has(o.debutClanId),
        '勢力',
        o.debutClanId,
        `武將 ${o.id} 的 debutClanId`,
        o.id,
      );
    }
    if (o.debutCastleId !== undefined) {
      need(
        idx.castleById.has(o.debutCastleId),
        '城',
        o.debutCastleId,
        `武將 ${o.id} 的 debutCastleId`,
        o.id,
      );
    }
  }
  const nodes = nodeIdSet(world);
  for (const r of world.roads) {
    need(nodes.has(r.a), '節點', r.a, `街道 ${r.id} 的端點 a`, r.id);
    need(nodes.has(r.b), '節點', r.b, `街道 ${r.id} 的端點 b`, r.id);
  }
  for (const p of world.diplomacy.pacts) {
    need(idx.clanIds.has(p.a), '勢力', p.a, `外交 pact ${pairKey(p.a, p.b)} 的 a`, p.a);
    need(idx.clanIds.has(p.b), '勢力', p.b, `外交 pact ${pairKey(p.a, p.b)} 的 b`, p.b);
    if (p.vassalClanId !== null) {
      need(
        idx.clanIds.has(p.vassalClanId),
        '勢力',
        p.vassalClanId,
        `外交 pact ${pairKey(p.a, p.b)} 的 vassalClanId`,
        p.vassalClanId,
      );
    }
  }
  for (const w of world.diplomacy.wars) {
    need(idx.clanIds.has(w.a), '勢力', w.a, `外交 war 的 a`, w.a);
    need(idx.clanIds.has(w.b), '勢力', w.b, `外交 war 的 b`, w.b);
  }
  for (const s of world.diplomacy.sentiments) {
    need(idx.clanIds.has(s.a), '勢力', s.a, `外交 sentiment 的 a`, s.a);
    need(idx.clanIds.has(s.b), '勢力', s.b, `外交 sentiment 的 b`, s.b);
  }
  // 政策互斥、戰法解鎖特性之引用存在性。
  for (const p of world.policies) {
    for (const ex of p.exclusiveWith) {
      need(idx.policyIds.has(ex), '政策', ex, `政策 ${p.id} 的 exclusiveWith`, p.id);
    }
  }
  for (const t of world.tactics) {
    if (t.unlockTraitId !== null) {
      need(
        idx.traitIds.has(t.unlockTraitId),
        '特性',
        t.unlockTraitId,
        `戰法 ${t.id} 的 unlockTraitId`,
        t.id,
      );
    }
  }
  // 事件內全部 id（conditions/effects/choices）——以泛型 id 掃描（穩健涵蓋所有 kind 分支）。
  for (const e of world.events) {
    const missing = new Set<string>();
    walkStrings(e, (s) => {
      if (s === e.id) return; // 事件自身 id
      const kind = refMissing(s, idx);
      if (kind !== null && !missing.has(s)) {
        missing.add(s);
        v.push(err('V3', `事件 ${e.id} 引用不存在的${kind} ${s}`, [s, e.id]));
      }
    });
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V4：靜態不變量子集（INV-04/05/08/09/17＋蜂窩欄位範圍）
// ═══════════════════════════════════════════════════════════════════
function checkStaticInvariants(world: ScenarioWorld, idx: WorldIndex): Violation[] {
  const v: Violation[] = [];

  // INV-04：城主 serving＋同勢力＋rank ≥ samurai-taisho；同一武將至多任一城城主。
  const lordCastles = new Map<string, string[]>();
  for (const c of world.castles) {
    if (c.lordId === null) continue;
    const off = idx.officerById.get(c.lordId);
    if (off === undefined) continue; // V3 已報
    if (off.clanId === null) {
      v.push(err('V4', `INV-04 城 ${c.id} 城主 ${off.id} 為浪人（clanId=null）`, [c.id, off.id]));
    } else if (off.clanId !== c.ownerClanId) {
      v.push(
        err(
          'V4',
          `INV-04 城 ${c.id} 城主 ${off.id} 非本城勢力（${off.clanId} ≠ ${c.ownerClanId}）`,
          [c.id, off.id],
        ),
      );
    }
    if (rankIndex(off.rank) < SAMURAI_TAISHO_INDEX) {
      v.push(
        err('V4', `INV-04 城 ${c.id} 城主 ${off.id} 身分 ${off.rank} 未達 samurai-taisho`, [
          c.id,
          off.id,
        ]),
      );
    }
    const arr = lordCastles.get(c.lordId) ?? [];
    arr.push(c.id);
    lordCastles.set(c.lordId, arr);
  }
  for (const [lord, castles] of lordCastles) {
    if (castles.length > 1) {
      v.push(
        err('V4', `INV-04 武將 ${lord} 同時任多城城主：${castles.join(',')}`, [lord, ...castles]),
      );
    }
  }

  // INV-05：知行領主 serving＋同勢力；每武將受封郡數 ≤ fiefCapOf(rank)。
  const fiefCount = new Map<string, number>();
  for (const d of world.districts) {
    if (d.stewardId === null) continue;
    const off = idx.officerById.get(d.stewardId);
    if (off === undefined) continue; // V3 已報
    const castle = idx.castleById.get(d.castleId);
    const ownerClan = castle?.ownerClanId;
    if (off.clanId === null) {
      v.push(
        err('V4', `INV-05 郡 ${d.id} 知行領主 ${off.id} 為浪人（clanId=null）`, [d.id, off.id]),
      );
    } else if (ownerClan !== undefined && off.clanId !== ownerClan) {
      v.push(
        err(
          'V4',
          `INV-05 郡 ${d.id} 知行領主 ${off.id} 非所轄城勢力（${off.clanId} ≠ ${ownerClan}）`,
          [d.id, off.id],
        ),
      );
    }
    fiefCount.set(d.stewardId, (fiefCount.get(d.stewardId) ?? 0) + 1);
  }
  for (const [steward, count] of fiefCount) {
    const off = idx.officerById.get(steward);
    if (off === undefined) continue;
    const cap = BAL.fiefMaxByRank[rankIndex(off.rank)] ?? 0;
    if (count > cap) {
      v.push(
        err('V4', `INV-05 武將 ${steward}（${off.rank}）受封 ${count} 郡，超過上限 ${cap}`, [
          steward,
        ]),
      );
    }
  }

  // INV-08：alive 勢力 leaderId 屬本家。
  for (const c of world.clans) {
    const leader = idx.officerById.get(c.leaderId);
    if (leader === undefined) continue; // V3 已報
    if (leader.clanId !== c.id) {
      v.push(
        err(
          'V4',
          `INV-08 勢力 ${c.id} 當主 ${leader.id} 不屬本家（clanId=${leader.clanId ?? 'null'}）`,
          [c.id, leader.id],
        ),
      );
    }
  }

  // INV-09：本城存在、屬本家、tier='main'。
  for (const c of world.clans) {
    const castle = idx.castleById.get(c.homeCastleId);
    if (castle === undefined) continue; // V3 已報
    if (castle.ownerClanId !== c.id) {
      v.push(err('V4', `INV-09 勢力 ${c.id} 本城 ${castle.id} 不屬本家`, [c.id, castle.id]));
    }
    if (castle.tier !== 'main') {
      v.push(
        err('V4', `INV-09 勢力 ${c.id} 本城 ${castle.id} tier 非 main（${castle.tier}）`, [
          c.id,
          castle.id,
        ]),
      );
    }
  }

  // INV-17：pact 欄位規則（同對同 kind 至多一件；vassalClanId∈{a,b}；months=null 僅限 marriage/vassal）。
  const seenPactKind = new Set<string>();
  for (const p of world.diplomacy.pacts) {
    const key = `${pairKey(p.a, p.b)}#${p.kind}`;
    if (seenPactKind.has(key)) {
      v.push(
        err('V4', `INV-17 外交列 ${pairKey(p.a, p.b)} 同 kind ${p.kind} 協定重複`, [p.a, p.b]),
      );
    }
    seenPactKind.add(key);
    if (p.kind === 'vassal') {
      if (p.vassalClanId !== p.a && p.vassalClanId !== p.b) {
        v.push(
          err('V4', `INV-17 外交列 ${pairKey(p.a, p.b)} vassal 協定的 vassalClanId 非 a/b`, [
            p.a,
            p.b,
          ]),
        );
      }
    } else if (p.vassalClanId !== null) {
      v.push(
        err('V4', `INV-17 外交列 ${pairKey(p.a, p.b)} 的 ${p.kind} 協定 vassalClanId 應為 null`, [
          p.a,
          p.b,
        ]),
      );
    }
    if (p.months === null && p.kind !== 'marriage' && p.kind !== 'vassal') {
      v.push(
        err('V4', `INV-17 外交列 ${pairKey(p.a, p.b)} 的 ${p.kind} 協定 months 不應為 null`, [
          p.a,
          p.b,
        ]),
      );
    }
  }

  // 蜂窩欄位範圍（kokudaka ≤ cap 等）。
  for (const d of world.districts) {
    if (d.kokudaka > d.kokudakaCap) {
      v.push(err('V4', `郡 ${d.id} kokudaka ${d.kokudaka} > kokudakaCap ${d.kokudakaCap}`, [d.id]));
    }
    if (d.commerce > d.commerceCap) {
      v.push(err('V4', `郡 ${d.id} commerce ${d.commerce} > commerceCap ${d.commerceCap}`, [d.id]));
    }
    if (d.population > d.populationCap) {
      v.push(
        err('V4', `郡 ${d.id} population ${d.population} > populationCap ${d.populationCap}`, [
          d.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V5：街道圖（含海路）為單一連通分量＋無重複無向邊＋a≠b＋海路端點港郡＋waypoints 偶數
// ═══════════════════════════════════════════════════════════════════
function checkGraph(world: ScenarioWorld, idx: WorldIndex): Violation[] {
  const v: Violation[] = [];
  const nodes = nodeIdSet(world);
  const seenPair = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const id of nodes) adjacency.set(id, []);

  for (const r of world.roads) {
    if (r.a === r.b) {
      v.push(err('V5', `街道 ${r.id} 端點 a/b 相同（${r.a}）`, [r.id]));
    }
    const key = pairKey(r.a, r.b);
    if (seenPair.has(key)) {
      v.push(err('V5', `街道 ${r.id} 為重複無向邊（${key}）`, [r.id]));
    }
    seenPair.add(key);
    if (r.type === 'sea') {
      for (const end of [r.a, r.b]) {
        const district = idx.districtById.get(end);
        const isPort = district?.isPort === true;
        if (!isPort) {
          v.push(err('V5', `海路 ${r.id} 端點 ${end} 非港郡（isPort=true）`, [r.id, end]));
        }
      }
    }
    if (r.waypoints !== undefined && r.waypoints.length % 2 !== 0) {
      v.push(err('V5', `街道 ${r.id} waypoints 長度非偶數（${r.waypoints.length}）`, [r.id]));
    }
    if (r.bridges !== undefined && r.bridges.length % 2 !== 0) {
      v.push(err('V5', `街道 ${r.id} bridges 長度非偶數（${r.bridges.length}）`, [r.id]));
    }
    if (r.a !== r.b && nodes.has(r.a) && nodes.has(r.b)) {
      adjacency.get(r.a)?.push(r.b);
      adjacency.get(r.b)?.push(r.a);
    }
  }

  // 連通性：BFS 自字典序最小節點；未達節點全列出。
  const sorted = [...nodes].sort();
  const start = sorted[0];
  if (start !== undefined && sorted.length > 1) {
    const visited = new Set<string>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      for (const nb of adjacency.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    if (visited.size !== sorted.length) {
      const unreached = sorted.filter((id) => !visited.has(id));
      const shown = unreached.slice(0, 20);
      v.push(
        err(
          'V5',
          `街道圖非單一連通分量，未連通節點 ${unreached.length} 個：${shown.join(', ')}${unreached.length > shown.length ? ' …' : ''}`,
          unreached,
        ),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V6：每城轄郡數 ∈ [min, max]
// ═══════════════════════════════════════════════════════════════════
function checkCastleDistricts(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  const count = new Map<string, number>();
  for (const c of world.castles) count.set(c.id, 0);
  for (const d of world.districts) {
    if (count.has(d.castleId)) count.set(d.castleId, (count.get(d.castleId) ?? 0) + 1);
  }
  const { dataDistrictsPerCastleMin: min, dataDistrictsPerCastleMax: max } = BAL;
  for (const [castleId, n] of count) {
    if (n < min || n > max) {
      v.push(err('V6', `城 ${castleId} 轄郡數 ${n} 不在 [${min}, ${max}]`, [castleId]));
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V7：全國總量 ∈ 對應區間（批次模式按 §3.2 配額表比例縮放）
// ═══════════════════════════════════════════════════════════════════
function checkTotals(world: ScenarioWorld, idx: WorldIndex, options: CheckOptions): Violation[] {
  const v: Violation[] = [];
  const totalKokudaka = world.districts.reduce((s, d) => s + d.kokudaka, 0);
  const castleCount = world.castles.length;
  const districtCount = world.districts.length;
  const officerCount = idx.officers.length;
  const clanCount = world.clans.length;
  const provinceCount = world.provinces.length;

  const range = (name: string, actual: number, min: number, max: number): void => {
    if (actual < min || actual > max) {
      v.push(err('V7', `${name} ${actual} 不在區間 [${min}, ${max}]`));
    }
  };

  if (options.regions !== undefined && options.regions.length > 0) {
    // 批次模式：期望＝白名單地方配額之和，帶 ±dataQuotaDeviationMax 帶寬。
    const q = options.regions.reduce(
      (acc, r) => {
        const rq = REGION_QUOTA[r];
        acc.castles += rq.castles;
        acc.districts += rq.districts;
        acc.kokudaka += rq.kokudaka;
        acc.officers += rq.officers;
        acc.provinces += rq.provinces;
        return acc;
      },
      { castles: 0, districts: 0, kokudaka: 0, officers: 0, provinces: 0 },
    );
    const band = (target: number): [number, number] => [
      Math.floor(target * (1 - BAL.dataQuotaDeviationMax)),
      Math.ceil(target * (1 + BAL.dataQuotaDeviationMax)),
    ];
    range('批次總石高', totalKokudaka, ...band(q.kokudaka));
    range('批次城數', castleCount, ...band(q.castles));
    range('批次郡數', districtCount, ...band(q.districts));
    range('批次武將數', officerCount, ...band(q.officers));
    // 批次模式：clans 跨地方、以本城地方歸屬過濾，數量不設固定區間；國數對配額之和。
    range('批次國數', provinceCount, q.provinces, q.provinces);
  } else {
    range('全國總石高', totalKokudaka, BAL.dataTotalKokudakaMin, BAL.dataTotalKokudakaMax);
    range('城數', castleCount, BAL.dataCastleMin, BAL.dataCastleMax);
    range('郡數', districtCount, BAL.dataDistrictMin, BAL.dataDistrictMax);
    range('具名武將數', officerCount, BAL.dataOfficerMin, BAL.dataOfficerMax);
    range('勢力數', clanCount, BAL.dataClanMin, BAL.dataClanMax);
    range('國數', provinceCount, BAL.dataProvinceCount, BAL.dataProvinceCount);
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V8：生卒年
// ═══════════════════════════════════════════════════════════════════
function checkYears(world: ScenarioWorld, idx: WorldIndex): Violation[] {
  const v: Violation[] = [];
  const leaderIds = new Set(world.clans.map((c) => c.leaderId));
  for (const o of idx.officers) {
    if (o.deathYear <= o.birthYear) {
      v.push(err('V8', `武將 ${o.id} deathYear ${o.deathYear} ≤ birthYear ${o.birthYear}`, [o.id]));
    }
    if (o.birthYear > 1570) {
      v.push(err('V8', `武將 ${o.id} birthYear ${o.birthYear} > 1570（收錄上限）`, [o.id]));
    }
    if (leaderIds.has(o.id)) {
      if (o.birthYear > 1545) {
        v.push(err('V8', `當主 ${o.id} birthYear ${o.birthYear} > 1545（開局須已元服）`, [o.id]));
      }
      if (o.deathYear < 1561) {
        v.push(err('V8', `當主 ${o.id} deathYear ${o.deathYear} < 1561（開局須在世）`, [o.id]));
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V9：武將所在城規則＋同名生年後綴消歧
// ═══════════════════════════════════════════════════════════════════
function checkLocations(idx: WorldIndex): Violation[] {
  const v: Violation[] = [];
  for (const o of idx.officers) {
    if (o.clanId !== null) {
      const castle = idx.castleById.get(o.locationCastleId);
      if (castle !== undefined && castle.ownerClanId !== o.clanId) {
        v.push(
          err('V9', `仕官武將 ${o.id} 所在城 ${castle.id} 非本家（owner=${castle.ownerClanId}）`, [
            o.id,
            castle.id,
          ]),
        );
      }
    }
  }
  // 同名（name 重複）必以生年後綴消歧：id 尾綴為 `-<birthYear>`（00 §8）。
  const byName = new Map<string, OfficerData[]>();
  for (const o of idx.officers) {
    const arr = byName.get(o.name) ?? [];
    arr.push(o);
    byName.set(o.name, arr);
  }
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    for (const o of group) {
      if (!o.id.endsWith(`-${o.birthYear}`)) {
        v.push(
          err(
            'V9',
            `同名武將「${name}」的 ${o.id} 未以生年後綴消歧（應以 -${o.birthYear} 結尾，00 §8）`,
            [o.id],
          ),
        );
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V10：簡體字／日文新字體掃描（劇本 JSON 的 name/text/label 值）
// ═══════════════════════════════════════════════════════════════════
export function scanForbiddenChars(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  const reported = new Set<string>(); // 去重：同一 值#字元 只報一次
  walkNameFields(world, (_field, text) => {
    for (const ch of text) {
      let suggestion: string | undefined;
      let rule: string | undefined;
      if (L1_MAP.has(ch)) {
        suggestion = L1_MAP.get(ch);
        rule = '簡體字';
      } else if (L3_MAP.has(ch)) {
        suggestion = L3_MAP.get(ch);
        rule = '日文新字體';
      } else {
        const ctx = CONTEXT_L2.find((c) => c.char === ch);
        if (ctx !== undefined && !ctx.allow.test(text)) {
          suggestion = ctx.suggestion;
          rule = '疑似簡轉繁誤植';
        }
      }
      if (suggestion !== undefined && rule !== undefined) {
        const key = `${text}#${ch}`;
        if (reported.has(key)) continue;
        reported.add(key);
        v.push(err('V10', `${rule}「${ch}」（建議「${suggestion}」）於值「${text}」`));
      }
    }
  });
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V11：戰法解鎖特性
// ═══════════════════════════════════════════════════════════════════
function checkTacticUnlocks(idx: WorldIndex): Violation[] {
  const v: Violation[] = [];
  for (const o of idx.officers) {
    for (const tacticId of o.tactics) {
      const tac = idx.tacticById.get(tacticId);
      if (tac === undefined) continue; // V3 已報
      if (tac.unlockTraitId !== null && !o.traits.includes(tac.unlockTraitId)) {
        v.push(
          err('V11', `武將 ${o.id} 習得戰法 ${tacticId} 但缺解鎖特性 ${tac.unlockTraitId}`, [
            o.id,
            tacticId,
            tac.unlockTraitId,
          ]),
        );
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V12：勢力色（相鄰環距 ≥ dataClanColorMinRing；釘選 index 與 §3.3 表一致）
// ═══════════════════════════════════════════════════════════════════
function checkClanColors(world: ScenarioWorld, idx: WorldIndex): Violation[] {
  const v: Violation[] = [];
  // 釘選 index。
  for (const c of world.clans) {
    const pinned = CLAN_COLOR_INDEX[c.id];
    if (pinned !== undefined && c.colorIndex !== pinned) {
      v.push(
        err('V12', `勢力 ${c.id} colorIndex ${c.colorIndex} 與 §3.3 釘選值 ${pinned} 不符`, [c.id]),
      );
    }
  }
  // 相鄰環距。
  const ownerOf = (nodeId: string): string | undefined => {
    if (isCastleId(nodeId)) return idx.castleById.get(nodeId)?.ownerClanId;
    const d = idx.districtById.get(nodeId);
    return d !== undefined ? idx.castleById.get(d.castleId)?.ownerClanId : undefined;
  };
  const adjacentPairs = new Set<string>();
  for (const r of world.roads) {
    const oa = ownerOf(r.a);
    const ob = ownerOf(r.b);
    if (oa !== undefined && ob !== undefined && oa !== ob) adjacentPairs.add(pairKey(oa, ob));
  }
  for (const key of adjacentPairs) {
    const [a, b] = key.split('|');
    if (a === undefined || b === undefined) continue;
    const ca = idx.clanById.get(a)?.colorIndex;
    const cb = idx.clanById.get(b)?.colorIndex;
    if (ca === undefined || cb === undefined) continue;
    const dist = ringDist(ca, cb);
    if (dist < BAL.dataClanColorMinRing) {
      v.push(
        err(
          'V12',
          `相鄰勢力 ${a}(${ca})／${b}(${cb}) 色環距 ${dist} < ${BAL.dataClanColorMinRing}`,
          [a, b],
        ),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V13：錨點城座標偏差 ≤ tolerance；全部節點座標唯一（見檔頭 §8-D17 勘誤）
// ═══════════════════════════════════════════════════════════════════
function checkAnchors(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  const castleByName = new Map<string, CastleData>();
  for (const c of world.castles) castleByName.set(c.name, c);
  for (const anchor of ANCHOR_CASTLES) {
    const castle = castleByName.get(anchor.name);
    if (castle === undefined) continue; // 該地方尚未載入（批次／增量），略過
    const dist = Math.hypot(castle.pos.x - anchor.x, castle.pos.y - anchor.y);
    if (dist > BAL.dataAnchorTolerance) {
      v.push(
        err(
          'V13',
          `錨點城「${anchor.name}」(${castle.id}) 座標 (${castle.pos.x},${castle.pos.y}) 偏離基準 (${anchor.x},${anchor.y}) ${dist.toFixed(1)} wu > ${BAL.dataAnchorTolerance}`,
          [castle.id],
        ),
      );
    }
  }
  // 座標唯一（不得有兩節點完全相同座標）。
  const posToNodes = new Map<string, string[]>();
  const record = (id: string, x: number, y: number): void => {
    const key = `${x},${y}`;
    const arr = posToNodes.get(key) ?? [];
    arr.push(id);
    posToNodes.set(key, arr);
  };
  for (const c of world.castles) record(c.id, c.pos.x, c.pos.y);
  for (const d of world.districts) record(d.id, d.pos.x, d.pos.y);
  for (const [key, ids] of posToNodes) {
    if (ids.length > 1) {
      v.push(err('V13', `座標 (${key}) 由多個節點共用：${ids.join(', ')}`, ids));
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V14：型錄一致（本階段：城 facilities.length ≤ slot 數）
// 型錄 id 集合與 core 常數表（TRAITS/TACTICS/政策/persona）雙向相等之檢查，待 core 型錄常數
// 落地（M3-5／M8-25）後接上；此處先把關 slot 數（BAL.facilitySlotsMain/Branch）。
// ═══════════════════════════════════════════════════════════════════
function checkCatalogs(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  for (const c of world.castles) {
    const slots = c.tier === 'main' ? BAL.facilitySlotsMain : BAL.facilitySlotsBranch;
    if (c.facilities.length > slots) {
      v.push(
        err(
          'V14',
          `城 ${c.id}（${c.tier}）facilities ${c.facilities.length} 個超過 slot 數 ${slots}`,
          [c.id],
        ),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// V15（WARN）：地方配額偏差 >10%；outline 內含檢查（outline 檔存在時）
// ═══════════════════════════════════════════════════════════════════
function regionOfCastle(castle: CastleData, idx: WorldIndex): Region | undefined {
  return idx.provinceById.get(castle.provinceId)?.region;
}

function checkQuotas(world: ScenarioWorld, idx: WorldIndex, options: CheckOptions): Violation[] {
  const v: Violation[] = [];
  const target: readonly Region[] =
    options.regions !== undefined && options.regions.length > 0 ? options.regions : REGION_VALUES;

  // 逐地方實際值。
  const actual = new Map<
    Region,
    { castles: number; districts: number; kokudaka: number; officers: number }
  >();
  for (const r of REGION_VALUES)
    actual.set(r, { castles: 0, districts: 0, kokudaka: 0, officers: 0 });
  for (const c of world.castles) {
    const r = regionOfCastle(c, idx);
    if (r !== undefined) actual.get(r)!.castles += 1;
  }
  for (const d of world.districts) {
    const castle = idx.castleById.get(d.castleId);
    const r = castle !== undefined ? regionOfCastle(castle, idx) : undefined;
    if (r !== undefined) {
      const a = actual.get(r)!;
      a.districts += 1;
      a.kokudaka += d.kokudaka;
    }
  }
  for (const g of world.officerGroups) actual.get(g.fileRegion)!.officers += g.officers.length;

  const dev = (a: number, q: number): number => (q === 0 ? (a === 0 ? 0 : 1) : Math.abs(a - q) / q);
  for (const r of target) {
    const a = actual.get(r)!;
    const q = REGION_QUOTA[r];
    const checks: [string, number, number][] = [
      ['城數', a.castles, q.castles],
      ['郡數', a.districts, q.districts],
      ['石高', a.kokudaka, q.kokudaka],
      ['武將數', a.officers, q.officers],
    ];
    for (const [label, av, qv] of checks) {
      const d = dev(av, qv);
      if (d > BAL.dataQuotaDeviationMax) {
        v.push(
          warn(
            'V15',
            `地方 ${r} ${label} ${av} 對配額 ${qv} 偏差 ${(d * 100).toFixed(0)}% > ${(BAL.dataQuotaDeviationMax * 100).toFixed(0)}%`,
          ),
        );
      }
    }
  }

  // outline 內含檢查（04 §3.3.4，outline 檔存在時執行）。
  if (world.outline !== null) v.push(...checkOutline(world));
  return v;
}

/** outline 內含檢查（04 §3.3.4）：必備島嶼、總點數、全部節點落在某 polygon 內（ray casting，容忍 8 wu）。 */
function checkOutline(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  const outline = world.outline;
  if (outline === null) return v;
  const ids = new Set(outline.polygons.map((p) => p.id));
  for (const req of ['honshu', 'shikoku', 'kyushu']) {
    if (!ids.has(req)) v.push(warn('V15', `outline 缺必備島嶼 polygon「${req}」`));
  }
  const totalPoints = outline.polygons.reduce((s, p) => s + p.points.length / 2, 0);
  if (totalPoints < 300 || totalPoints > 600) {
    v.push(warn('V15', `outline 總點數 ${totalPoints} 不在 [300, 600]`));
  }
  const polys = outline.polygons.map((p) => p.points);
  const insideAny = (x: number, y: number): boolean =>
    polys.some((flat) => pointInPolygon(flat, x, y) || distToPolygon(flat, x, y) <= 8);
  const nodes: { id: string; x: number; y: number }[] = [
    ...world.castles.map((c) => ({ id: c.id, x: c.pos.x, y: c.pos.y })),
    ...world.districts.map((d) => ({ id: d.id, x: d.pos.x, y: d.pos.y })),
  ];
  const outside = nodes.filter((n) => !insideAny(n.x, n.y)).map((n) => n.id);
  if (outside.length > 0) {
    const shown = outside.slice(0, 20);
    v.push(
      warn(
        'V15',
        `${outside.length} 個節點不在任何陸地 polygon 內（容忍 8 wu）：${shown.join(', ')}${outside.length > shown.length ? ' …' : ''}`,
        outside,
      ),
    );
  }
  return v;
}

/** 射線法點在多邊形內（flat=[x0,y0,x1,y1,...]）。 */
function pointInPolygon(flat: readonly number[], x: number, y: number): boolean {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = flat[i * 2] ?? 0;
    const yi = flat[i * 2 + 1] ?? 0;
    const xj = flat[j * 2] ?? 0;
    const yj = flat[j * 2 + 1] ?? 0;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 點到多邊形邊界的最短距離（供容忍值判定）。 */
function distToPolygon(flat: readonly number[], x: number, y: number): number {
  let best = Infinity;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = flat[i * 2] ?? 0;
    const yi = flat[i * 2 + 1] ?? 0;
    const xj = flat[j * 2] ?? 0;
    const yj = flat[j * 2 + 1] ?? 0;
    best = Math.min(best, distToSegment(x, y, xi, yi, xj, yj));
  }
  return best;
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ═══════════════════════════════════════════════════════════════════
// V1（officers 檔名一致）＋ checkWorld 主入口
// ═══════════════════════════════════════════════════════════════════
function checkOfficerRegions(world: ScenarioWorld): Violation[] {
  const v: Violation[] = [];
  for (const g of world.officerGroups) {
    if (g.fileRegion !== g.declaredRegion) {
      v.push(
        err('V1', `officers/${g.fileRegion}.json 的 region 欄「${g.declaredRegion}」與檔名不一致`),
      );
    }
  }
  return v;
}

/** 對記憶體 world 跑 V1（officers 檔名）＋V2–V15。純函式，不讀檔、不印東西。 */
export function checkWorld(world: ScenarioWorld, options: CheckOptions = {}): Violation[] {
  const idx = buildIndex(world);
  return [
    ...checkOfficerRegions(world),
    ...checkIds(world),
    ...checkRefs(world, idx),
    ...checkStaticInvariants(world, idx),
    ...checkGraph(world, idx),
    ...checkCastleDistricts(world),
    ...checkTotals(world, idx, options),
    ...checkYears(world, idx),
    ...checkLocations(idx),
    ...scanForbiddenChars(world),
    ...checkTacticUnlocks(idx),
    ...checkClanColors(world, idx),
    ...checkAnchors(world),
    ...checkCatalogs(world),
    ...checkQuotas(world, idx, options),
  ];
}

// ═══════════════════════════════════════════════════════════════════
// V1：zod parse（parseScenario）
// ═══════════════════════════════════════════════════════════════════

/** 空 world（供 parseScenario 逐步填入）。 */
function emptyWorld(id: string): ScenarioWorld {
  return {
    id,
    provinces: [],
    castles: [],
    districts: [],
    roads: [],
    clans: [],
    diplomacy: { pacts: [], wars: [], sentiments: [] },
    officerGroups: [],
    events: [],
    traits: [],
    tactics: [],
    policies: [],
    personas: [],
    outline: null,
  };
}

function zodErrorSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('；');
}

/** 對原始輸入跑 §4 zod schema（V1），回傳解析後的 world＋V1 違規。 */
export function parseScenario(raw: RawScenarioInputs): {
  world: ScenarioWorld;
  violations: Violation[];
} {
  const violations: Violation[] = [];
  const w = emptyWorld(raw.id);
  const mutable = w as {
    -readonly [K in keyof ScenarioWorld]: ScenarioWorld[K];
  };

  // 缺席（增量建置）→ 略過，不視為 V1 違規；解析失敗（zod）→ V1 違規；成功 → 填入 world。
  // 對每個具體 schema 直接 safeParse（型別為具體 output，避免泛型型參的 any 抹除）。
  const v1Fail = (label: string, error: z.ZodError): void => {
    violations.push(err('V1', `${label} 未通過 zod schema：${zodErrorSummary(error)}`));
  };

  if (raw.provinces !== undefined) {
    const r = zProvincesFile.safeParse(raw.provinces);
    if (r.success) mutable.provinces = r.data.provinces;
    else v1Fail('provinces.json', r.error);
  }
  if (raw.castles !== undefined) {
    const r = zCastlesFile.safeParse(raw.castles);
    if (r.success) mutable.castles = r.data;
    else v1Fail('castles.json', r.error);
  }
  if (raw.districts !== undefined) {
    const r = zDistrictsFile.safeParse(raw.districts);
    if (r.success) mutable.districts = r.data;
    else v1Fail('districts.json', r.error);
  }
  if (raw.roads !== undefined) {
    const r = zRoadsFile.safeParse(raw.roads);
    if (r.success) mutable.roads = r.data.edges;
    else v1Fail('roads.json', r.error);
  }
  if (raw.clans !== undefined) {
    const r = zClansFile.safeParse(raw.clans);
    if (r.success) {
      mutable.clans = r.data.clans;
      mutable.diplomacy = r.data.diplomacy;
    } else v1Fail('clans.json', r.error);
  }
  if (raw.events !== undefined) {
    const r = zEventsFile.safeParse(raw.events);
    if (r.success) mutable.events = r.data.events;
    else v1Fail('events.json', r.error);
  }
  if (raw.traits !== undefined) {
    const r = zTraitsFile.safeParse(raw.traits);
    if (r.success) mutable.traits = r.data.traits;
    else v1Fail('traits.json', r.error);
  }
  if (raw.tactics !== undefined) {
    const r = zTacticsFile.safeParse(raw.tactics);
    if (r.success) mutable.tactics = r.data.tactics;
    else v1Fail('tactics.json', r.error);
  }
  if (raw.policies !== undefined) {
    const r = zPoliciesFile.safeParse(raw.policies);
    if (r.success) mutable.policies = r.data.policies;
    else v1Fail('policies.json', r.error);
  }
  if (raw.personas !== undefined) {
    const r = zPersonasFile.safeParse(raw.personas);
    if (r.success) mutable.personas = r.data.personas;
    else v1Fail('personas.json', r.error);
  }
  if (raw.outline !== undefined) {
    const r = zJapanOutlineFile.safeParse(raw.outline);
    if (r.success) mutable.outline = r.data;
    else v1Fail('japan-outline.json', r.error);
  }

  const groups: OfficerGroup[] = [];
  for (const file of raw.officers ?? []) {
    if (!(REGION_VALUES as readonly string[]).includes(file.region)) {
      violations.push(err('V1', `officers/${file.region}.json 的檔名地方不在 9 地方枚舉內`));
      continue;
    }
    const result = zOfficersFile.safeParse(file.value);
    if (result.success) {
      groups.push({
        fileRegion: file.region as Region,
        declaredRegion: result.data.region,
        officers: result.data.officers,
      });
    } else {
      violations.push(
        err(
          'V1',
          `officers/${file.region}.json 未通過 zod schema：${zodErrorSummary(result.error)}`,
        ),
      );
    }
  }
  mutable.officerGroups = groups;
  return { world: w, violations };
}

// ═══════════════════════════════════════════════════════════════════
// `--regions` 批次過濾（§7）
// ═══════════════════════════════════════════════════════════════════

/** 依白名單地方過濾 world（castles 依 province.region；clans 依所擁城；roads 依兩端皆載入）。 */
export function filterWorldByRegions(
  world: ScenarioWorld,
  regions: readonly Region[],
): ScenarioWorld {
  const wl = new Set<Region>(regions);
  const provinceById = new Map(world.provinces.map((p) => [p.id, p]));
  const provinces = world.provinces.filter((p) => wl.has(p.region));
  const castles = world.castles.filter((c) => {
    const region = provinceById.get(c.provinceId)?.region;
    return region !== undefined && wl.has(region);
  });
  const castleIds = new Set(castles.map((c) => c.id));
  const districts = world.districts.filter((d) => castleIds.has(d.castleId));
  const nodeIds = new Set<string>([...castleIds, ...districts.map((d) => d.id)]);
  // 勢力：保留擁有任一載入城者。
  const ownerClanIds = new Set(castles.map((c) => c.ownerClanId));
  const clans = world.clans.filter((c) => ownerClanIds.has(c.id));
  const clanIds = new Set(clans.map((c) => c.id));
  const officerGroups = world.officerGroups.filter((g) => wl.has(g.fileRegion));
  const roads = world.roads.filter((r) => nodeIds.has(r.a) && nodeIds.has(r.b));
  const diplomacy: DiplomacyData = {
    pacts: world.diplomacy.pacts.filter(
      (p) =>
        clanIds.has(p.a) &&
        clanIds.has(p.b) &&
        (p.vassalClanId === null || clanIds.has(p.vassalClanId)),
    ),
    wars: world.diplomacy.wars.filter((w) => clanIds.has(w.a) && clanIds.has(w.b)),
    sentiments: world.diplomacy.sentiments.filter((s) => clanIds.has(s.a) && clanIds.has(s.b)),
  };
  const officerIds = new Set(officerGroups.flatMap((g) => g.officers.map((o) => o.id)));
  const provinceIds = new Set(provinces.map((p) => p.id));
  const events = world.events.filter((e) => {
    let ok = true;
    walkStrings(e, (s) => {
      if (s === e.id) return;
      if (isClanId(s) && !clanIds.has(s)) ok = false;
      else if (isOfficerId(s) && !officerIds.has(s)) ok = false;
      else if (isCastleId(s) && !castleIds.has(s)) ok = false;
      else if (isProvinceId(s) && !provinceIds.has(s)) ok = false;
    });
    return ok;
  });
  return {
    id: world.id,
    provinces,
    castles,
    districts,
    roads,
    clans,
    diplomacy,
    officerGroups,
    events,
    traits: world.traits,
    tactics: world.tactics,
    policies: world.policies,
    personas: world.personas,
    outline: world.outline,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 讀檔 → parse → check（CLI 與測試共用）
// ═══════════════════════════════════════════════════════════════════

const SCENARIOS_ROOT = path.resolve(
  fileURLToPath(new URL('../src/data/scenarios', import.meta.url)),
);
const OUTLINE_PATH = path.resolve(
  fileURLToPath(new URL('../src/data/map/japan-outline.json', import.meta.url)),
);

/** 讀單一 JSON 檔；不存在回傳 undefined；JSON 壞掉回傳 { parseError }。 */
function readJson(file: string): { value?: unknown; parseError?: string } {
  if (!existsSync(file)) return {};
  try {
    return { value: JSON.parse(readFileSync(file, 'utf-8')) as unknown };
  } catch (e) {
    return { parseError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 自 `src/data/scenarios/<id>/` 讀取原始輸入。回傳 null（＝尚無劇本資料）當資料夾缺席，或夾內
 * 尚無任何「劇本 JSON 檔」——僅有 index.ts／README 等非資料檔時亦視為尚無資料，使
 * `npm run validate:data` 在 M2-9 起真正的 JSON 資料落地前保持綠燈（index.ts 為 M2-7 動態載入接線
 * 佔位）。全域 outline 檔（src/data/map）不計入「劇本資料是否存在」的判定。
 */
export function loadRawScenario(
  scenarioId: string,
): { raw: RawScenarioInputs; violations: Violation[] } | null {
  const dir = path.join(SCENARIOS_ROOT, scenarioId);
  if (!existsSync(dir)) return null;

  const violations: Violation[] = [];
  let hasScenarioData = false;
  const readInto = (name: string): unknown => {
    const { value, parseError } = readJson(path.join(dir, `${name}.json`));
    if (parseError !== undefined) {
      hasScenarioData = true; // 壞檔也算「有資料」——需回報 V1 而非靜默略過
      violations.push(err('V1', `${name}.json JSON 解析失敗：${parseError}`));
    } else if (value !== undefined) {
      hasScenarioData = true;
    }
    return value;
  };

  const officers: { region: string; value: unknown }[] = [];
  const officersDir = path.join(dir, 'officers');
  if (existsSync(officersDir)) {
    for (const entry of readdirSync(officersDir)) {
      if (!entry.endsWith('.json')) continue;
      const region = entry.slice(0, -'.json'.length);
      const { value, parseError } = readJson(path.join(officersDir, entry));
      if (parseError !== undefined) {
        hasScenarioData = true;
        violations.push(err('V1', `officers/${entry} JSON 解析失敗：${parseError}`));
      } else if (value !== undefined) {
        hasScenarioData = true;
        officers.push({ region, value });
      }
    }
  }

  const raw: RawScenarioInputs = {
    id: scenarioId,
    provinces: readInto('provinces'),
    castles: readInto('castles'),
    districts: readInto('districts'),
    roads: readInto('roads'),
    clans: readInto('clans'),
    events: readInto('events'),
    traits: readInto('traits'),
    tactics: readInto('tactics'),
    policies: readInto('policies'),
    personas: readInto('personas'),
    outline: readJson(OUTLINE_PATH).value,
    officers,
  };
  if (!hasScenarioData) return null; // 僅 index.ts 等非資料檔 → 尚無劇本資料
  return { raw, violations };
}

/**
 * 純函式：驗證劇本資料（17 §3.6.1 的「純函式庫」半部）。不呼叫 process.exit、不印東西。
 * 資料夾缺席或空 → notice「尚無劇本資料」、無違規（維持 `npm run validate:data` 綠）。
 */
export function validateScenario(scenarioId: string, options: CheckOptions = {}): ValidationResult {
  const loaded = loadRawScenario(scenarioId);
  if (loaded === null) {
    return { violations: [], errors: [], warnings: [], notice: '尚無劇本資料' };
  }
  const { world, violations: v1 } = parseScenario(loaded.raw);
  const filtered =
    options.regions !== undefined && options.regions.length > 0
      ? filterWorldByRegions(world, options.regions)
      : world;
  const violations = [...loaded.violations, ...v1, ...checkWorld(filtered, options)];
  return summarize(violations);
}

/**
 * CLI 未指定 `--regions` 時，偵測劇本資料「實際涵蓋的地方」（依 provinces.json 的 `region` 欄）。
 * 回傳 `null`＝尚無資料（沿用 validateScenario 的 notice 路徑）；否則回傳 `REGION_VALUES` 次序的
 * present 子集。用於讓 `npm run validate:data`（CLI／CI）在分批製作期間自動走 §7 批次模式
 * （＝「已完成清單」），全部 9 地方到位後（B9）自然退回全量。純函式、不印東西、不呼叫 process.exit。
 */
export function detectPresentRegions(scenarioId: string): Region[] | null {
  const loaded = loadRawScenario(scenarioId);
  if (loaded === null) return null;
  const { world } = parseScenario(loaded.raw);
  const present = new Set<Region>(world.provinces.map((p) => p.region));
  return REGION_VALUES.filter((r) => present.has(r));
}

/** 把違規清單整理成 ValidationResult（errors 驅動 exit code）。 */
export function summarize(violations: readonly Violation[]): ValidationResult {
  const errors = violations.filter((v) => v.severity === 'ERROR').map(formatViolation);
  const warnings = violations.filter((v) => v.severity === 'WARN').map(formatViolation);
  return { violations, errors, warnings, notice: null };
}

// ═══════════════════════════════════════════════════════════════════
// CLI 包裝
// ═══════════════════════════════════════════════════════════════════

/** 解析 `--regions=tokai,kinki` 與位置參數 scenarioId。 */
export function parseArgs(argv: readonly string[]): { scenarioId: string; regions?: Region[] } {
  let scenarioId = 's1560';
  let regions: Region[] | undefined;
  for (const arg of argv) {
    if (arg.startsWith('--regions=')) {
      const list = arg
        .slice('--regions='.length)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      regions = list.filter((s): s is Region => (REGION_VALUES as readonly string[]).includes(s));
      const unknown = list.filter((s) => !(REGION_VALUES as readonly string[]).includes(s));
      if (unknown.length > 0) {
        console.error(`警告：--regions 含未知地方，已忽略：${unknown.join(', ')}`);
      }
    } else if (!arg.startsWith('--')) {
      scenarioId = arg;
    }
  }
  return regions !== undefined ? { scenarioId, regions } : { scenarioId };
}

function main(): void {
  const { scenarioId, regions: explicitRegions } = parseArgs(process.argv.slice(2));

  // 未指定 `--regions` 時，自動以「資料實際涵蓋的地方」為批次白名單（§7：`validate --regions=<已完成
  // 清單>`；分批製作期間全國總量 V7／配額 V15 對「僅 N/9 地方到位」必然誤報，屬預期未完工狀態非缺陷）。
  // 全部 9 地方到位（B9／M8-26）時 present === REGION_VALUES → 退回全量模式（regions=undefined），
  // 跑 §7-B9 全國總量與勢力數等只在全量下有意義之檢查。此舉使 `npm run validate:data`（CLI／CI）在
  // 每個里程碑皆綠、且 && 鏈後的 scan-simplified／check-font-coverage 得以續跑（14 §8-D23）。
  let regions = explicitRegions;
  if (regions === undefined) {
    const present = detectPresentRegions(scenarioId);
    if (present !== null && present.length > 0 && present.length < REGION_VALUES.length) {
      regions = present;
    }
  }

  const options: CheckOptions = regions !== undefined ? { regions } : {};
  const result = validateScenario(scenarioId, options);

  if (result.notice !== null) {
    console.log(result.notice);
    process.exit(0);
  }

  const scope =
    explicitRegions !== undefined
      ? `（--regions=${explicitRegions.join(',')}）`
      : regions !== undefined
        ? `（自動批次=${regions.join(',')}）`
        : '（全量）';
  for (const v of result.violations) console.log(formatViolation(v));
  console.log(
    `劇本 ${scenarioId} 驗證${scope}：${result.errors.length} 個 ERROR、${result.warnings.length} 個 WARN。`,
  );
  process.exit(result.errors.length > 0 ? 1 : 0);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
