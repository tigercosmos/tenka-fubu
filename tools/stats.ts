// 劇本統計報表（總石高、各勢力石高/城數/武將數、地方配額對照）。
// 規格：plan/14-scenario-data.md §5.2（四類報表：勢力概覽／地方彙總／全域計數／前 10 大勢力
// 校準核對）、§3.2（全國校準目標＋9 地方配額表）；plan/00-foundations.md §6（開局校準：織田
// 尾張半國 ~30 萬石／今川駿遠三 ~70 萬石）。CLI 用法：`npx tsx tools/stats.ts [scenarioId]`
// （14 §5.2；輸出 Markdown 至 stdout）。
//
// 比照 tools/validate.ts 的「純函式庫＋CLI 包裝」拆分（17 §3.6.1 精神）：
// - `computeScenarioStats` / `formatStatsMarkdown` 為純函式，不印東西、不呼叫 process.exit，
//   供 Vitest 直接 import（tests/data/stats.spec.ts）。
// - CLI 包裝（本檔 `main()`）負責讀取劇本資料、印報告、決定 exit code。
//
// 【輸入形狀設計】`ScenarioStatsInput` 刻意採最小結構化介面（純字面欄位，不依賴
// `src/core/state/ids.ts` 的 branded ID 型別，亦不依賴 `src/core/state/gameState.ts` 的完整
// 實體型別），使本檔同時相容兩種呼叫情境而不需個別分支：
//   (a) 已建置 `GameState`／`ScenarioInput`（M1 骨架，見 tests/fixtures/tiny.ts）之實體陣列——
//       `District.ownerClanId` 已由 builder 依 14 §5.3 規則寫入（平時＝所轄城 owner）；
//   (b) 劇本原始資料（`src/data/schemas/scenario.ts` 之 `ScenarioBundleData`，M2-9/10 批次資料
//       ready 後由 CLI 載入）——此形狀 District 無 `ownerClanId` 欄位，本檔以 `castleId` 反查
//       所轄城之 `ownerClanId` 代入（14 §5.3 builder 規則同義，見 `districtOwner()`）。
// 兩種輸入對本檔實際讀取的欄位（見下方各 interface）逐一相容。
//
// 【武將計數口徑】本檔統計輸入陣列中「傳入的」武將筆數，不自行判斷是否為 14 §3.8
// 程序生成浪人（`Officer` 型別無此欄位可供區分）；14 §3.8 明定程序浪人不計入 §3.2 配額，
// 呼叫端若持有已跑過 `generateRonin()` 的 GameState，須自行過濾後再傳入本檔以符合配額對照
// 語意（tiny/mini 等測試 fixture 皆未執行 `generateRonin()`，不受影響）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Region } from '../src/core/state/enums';

// ═══════════════════════════════════════════════════════════════════
// 輸入型別
// ═══════════════════════════════════════════════════════════════════

/** 統計輸入：勢力（14 §4.5 zClan 子集）。 */
export interface StatsClan {
  readonly id: string;
  readonly name: string;
  readonly gold: number;
  readonly colorIndex: number;
}

/** 統計輸入：武將（14 §4.6 zOfficer 子集）。`status` 缺省＝視為在籍（劇本原始資料無此欄位，
 * 全部具名武將／具名浪人皆計入；已建置 GameState 則只計 `status==='serving'`）。 */
export interface StatsOfficer {
  readonly id: string;
  readonly clanId: string | null;
  readonly locationCastleId: string | null;
  readonly status?: 'serving' | 'ronin' | 'captive' | 'dead';
  readonly ldr: number;
  readonly val: number;
  readonly int: number;
  readonly pol: number;
}

/** 統計輸入：城（14 §4.3 zCastle 子集）。 */
export interface StatsCastle {
  readonly id: string;
  readonly ownerClanId: string;
  readonly provinceId: string;
  readonly soldiers: number;
  readonly food: number;
}

/** 統計輸入：郡（14 §4.4 zDistrict 子集）。`ownerClanId` 缺省時以所轄城 owner 代入
 * （14 §5.3 builder 補值規則同義）。 */
export interface StatsDistrict {
  readonly id: string;
  readonly castleId: string;
  readonly ownerClanId?: string;
  readonly kokudaka: number;
  readonly kokudakaCap: number;
  readonly commerce: number;
  readonly commerceCap: number;
  readonly population: number;
  readonly populationCap: number;
}

/** 統計輸入：國（14 §4.2 zProvince 子集）。 */
export interface StatsProvince {
  readonly id: string;
  readonly region: string; // Region（02 §3.3 九地方分區之一）
}

/** 統計輸入：街道邊（14 §4.12 zRoadEdge 子集）。 */
export interface StatsRoad {
  readonly id: string;
  readonly type: 'land' | 'sea';
}

/** `tools/stats.ts` 唯一輸入形狀。 */
export interface ScenarioStatsInput {
  readonly clans: readonly StatsClan[];
  readonly officers: readonly StatsOfficer[];
  readonly castles: readonly StatsCastle[];
  readonly districts: readonly StatsDistrict[];
  readonly provinces: readonly StatsProvince[];
  readonly roads: readonly StatsRoad[];
  /** 事件目錄筆數（14 §4.9 events.json）。`GameState` 不持有事件目錄本體（只有執行期
   * `EventsState`），故此欄位為選填；呼叫端可傳入劇本原始資料的 `events` 陣列。缺省計 0。 */
  readonly events?: readonly { readonly id: string }[];
}

// ═══════════════════════════════════════════════════════════════════
// 9 地方配額表（14 §3.2；kokudaka 已由原表「萬石」換算為「石」）
// ═══════════════════════════════════════════════════════════════════

export interface RegionQuota {
  readonly region: Region;
  readonly label: string;
  readonly castles: number;
  readonly districts: number;
  readonly kokudaka: number; // 石（原表單位為萬石）
  readonly officers: number;
}

/** 14 §3.2 九地方配額表定案值（合計：城 121／郡 343／石高 1,800 萬石／武將 625，與全國目標一致）。 */
export const REGION_QUOTAS: readonly RegionQuota[] = [
  { region: 'tokai', label: '東海', castles: 16, districts: 44, kokudaka: 2_400_000, officers: 95 },
  { region: 'kinki', label: '近畿', castles: 18, districts: 50, kokudaka: 2_950_000, officers: 90 },
  { region: 'kanto', label: '關東', castles: 16, districts: 48, kokudaka: 2_750_000, officers: 75 },
  {
    region: 'koshinetsu',
    label: '甲信越',
    castles: 9,
    districts: 27,
    kokudaka: 1_550_000,
    officers: 70,
  },
  {
    region: 'hokuriku',
    label: '北陸',
    castles: 10,
    districts: 28,
    kokudaka: 1_350_000,
    officers: 40,
  },
  {
    region: 'chugoku',
    label: '中國',
    castles: 16,
    districts: 44,
    kokudaka: 2_150_000,
    officers: 75,
  },
  { region: 'shikoku', label: '四國', castles: 8, districts: 22, kokudaka: 950_000, officers: 40 },
  {
    region: 'kyushu',
    label: '九州',
    castles: 14,
    districts: 40,
    kokudaka: 1_800_000,
    officers: 75,
  },
  {
    region: 'tohoku',
    label: '東北',
    castles: 14,
    districts: 40,
    kokudaka: 2_100_000,
    officers: 65,
  },
];

// ═══════════════════════════════════════════════════════════════════
// 校準目標（00 §6／14 §3.5：織田 31.0 萬石／今川 67.0 萬石）
// ═══════════════════════════════════════════════════════════════════

export interface CalibrationTarget {
  readonly clanId: string;
  readonly label: string;
  readonly expectedKokudaka: number;
  /** 允許誤差比例，預設 0.1（14 V15 地方配額 ±10% 慣例）。 */
  readonly toleranceRatio?: number;
}

/** 預設校準目標：s1560 開局核對點（00 §6／14 §3.5／§7-T3 驗收：織田 310,000 石／今川 670,000 石）。 */
export const DEFAULT_CALIBRATION_TARGETS: readonly CalibrationTarget[] = [
  { clanId: 'clan.oda', label: '織田', expectedKokudaka: 310_000 },
  { clanId: 'clan.imagawa', label: '今川', expectedKokudaka: 670_000 },
];

// ═══════════════════════════════════════════════════════════════════
// 輸出型別
// ═══════════════════════════════════════════════════════════════════

/** 四維平均值（06 §4 OfficerStats：統率/武勇/知略/政務）。 */
export interface AvgStatBlock {
  readonly ldr: number;
  readonly val: number;
  readonly int: number;
  readonly pol: number;
}

/** 報表 1：勢力概覽（依石高降冪）。 */
export interface ClanStatsRow {
  readonly clanId: string;
  readonly name: string;
  readonly castles: number;
  readonly districts: number;
  readonly kokudaka: number; // Σ領郡 kokudaka
  readonly soldiers: number; // Σ城 soldiers
  readonly food: number; // Σ城 food
  readonly gold: number;
  readonly officers: number;
  readonly avgStats: AvgStatBlock;
  readonly colorIndex: number;
}

/** 報表 2：地方彙總（與 14 §3.2 配額表同欄位之實際值與偏差 %）。 */
export interface RegionStatsRow {
  readonly region: Region;
  readonly label: string;
  readonly castles: number;
  readonly castlesTarget: number;
  readonly castlesDeviationPct: number;
  readonly districts: number;
  readonly districtsTarget: number;
  readonly districtsDeviationPct: number;
  readonly kokudaka: number;
  readonly kokudakaTarget: number;
  readonly kokudakaDeviationPct: number;
  readonly officers: number;
  readonly officersTarget: number;
  readonly officersDeviationPct: number;
}

/** 報表 3：全域計數。 */
export interface GlobalStats {
  readonly castles: number;
  readonly districts: number;
  readonly officers: number;
  readonly roadsLand: number;
  readonly roadsSea: number;
  readonly events: number;
  readonly totalKokudaka: number;
  readonly totalPopulation: number;
  /** 開發餘裕＝Σcap−Σ現值，逐項列出（石高／商業／人口三者皆為可開發資源，14 §5.2 未指名
   * 單一維度，本檔三者皆報以求完整）。 */
  readonly developmentHeadroom: {
    readonly kokudaka: number;
    readonly commerce: number;
    readonly population: number;
  };
}

/** 報表 4：校準核對單筆結果。 */
export interface CalibrationResult {
  readonly clanId: string;
  readonly label: string;
  readonly actualKokudaka: number;
  readonly expectedKokudaka: number;
  readonly toleranceRatio: number;
  /** 目標 clanId 不存在於輸入資料時為 false（此時 `pass` 恆 false，不代表校準失敗，僅代表無資料）。 */
  readonly found: boolean;
  readonly pass: boolean;
}

export interface ScenarioStatsReport {
  /** 報表 1：全部勢力，依石高降冪排序。 */
  readonly clanRows: readonly ClanStatsRow[];
  /** 報表 2：9 地方彙總，順序＝14 §3.2 表列順序。 */
  readonly regionRows: readonly RegionStatsRow[];
  /** 報表 3。 */
  readonly global: GlobalStats;
  /** 報表 4：校準核對清單（預設織田／今川；可由呼叫端覆寫）。 */
  readonly calibration: readonly CalibrationResult[];
}

// ═══════════════════════════════════════════════════════════════════
// 計算（純函式）
// ═══════════════════════════════════════════════════════════════════

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function deviationPct(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 0 : Infinity;
  return ((actual - target) / target) * 100;
}

function averageStats(officers: readonly StatsOfficer[]): AvgStatBlock {
  if (officers.length === 0) return { ldr: 0, val: 0, int: 0, pol: 0 };
  const total = officers.reduce(
    (acc, o) => ({
      ldr: acc.ldr + o.ldr,
      val: acc.val + o.val,
      int: acc.int + o.int,
      pol: acc.pol + o.pol,
    }),
    { ldr: 0, val: 0, int: 0, pol: 0 },
  );
  const n = officers.length;
  return { ldr: total.ldr / n, val: total.val / n, int: total.int / n, pol: total.pol / n };
}

/** 純函式：由劇本實體算出四類統計報表（14 §5.2）。不印東西、不丟例外（資料不齊時以 0/found:false 呈現）。 */
export function computeScenarioStats(
  input: ScenarioStatsInput,
  options?: { readonly calibrationTargets?: readonly CalibrationTarget[] },
): ScenarioStatsReport {
  const calibrationTargets = options?.calibrationTargets ?? DEFAULT_CALIBRATION_TARGETS;

  const castleById = new Map(input.castles.map((c) => [c.id, c] as const));
  const provinceById = new Map(input.provinces.map((p) => [p.id, p] as const));

  const regionOfCastle = (castle: StatsCastle): string | null =>
    provinceById.get(castle.provinceId)?.region ?? null;

  const regionOfDistrict = (district: StatsDistrict): string | null => {
    const castle = castleById.get(district.castleId);
    return castle === undefined ? null : regionOfCastle(castle);
  };

  const regionOfOfficer = (officer: StatsOfficer): string | null => {
    if (officer.locationCastleId === null) return null;
    const castle = castleById.get(officer.locationCastleId);
    return castle === undefined ? null : regionOfCastle(castle);
  };

  /** 郡歸屬（14 §5.3 builder 規則：平時＝所轄城 owner；已建置 state 之 ownerClanId 為現值，優先採用）。 */
  const districtOwner = (d: StatsDistrict): string | null =>
    d.ownerClanId ?? castleById.get(d.castleId)?.ownerClanId ?? null;

  // ── 報表 1：勢力概覽 ──
  const clanRows: ClanStatsRow[] = input.clans.map((clan) => {
    const ownedCastles = input.castles.filter((c) => c.ownerClanId === clan.id);
    const ownedDistricts = input.districts.filter((d) => districtOwner(d) === clan.id);
    const clanOfficers = input.officers.filter(
      (o) => o.clanId === clan.id && (o.status === undefined || o.status === 'serving'),
    );
    return {
      clanId: clan.id,
      name: clan.name,
      castles: ownedCastles.length,
      districts: ownedDistricts.length,
      kokudaka: sum(ownedDistricts.map((d) => d.kokudaka)),
      soldiers: sum(ownedCastles.map((c) => c.soldiers)),
      food: sum(ownedCastles.map((c) => c.food)),
      gold: clan.gold,
      officers: clanOfficers.length,
      avgStats: averageStats(clanOfficers),
      colorIndex: clan.colorIndex,
    };
  });
  clanRows.sort((a, b) => b.kokudaka - a.kokudaka);

  // ── 報表 2：地方彙總 ──
  const regionRows: RegionStatsRow[] = REGION_QUOTAS.map((quota) => {
    const castlesInRegion = input.castles.filter((c) => regionOfCastle(c) === quota.region);
    const districtsInRegion = input.districts.filter((d) => regionOfDistrict(d) === quota.region);
    const officersInRegion = input.officers.filter((o) => regionOfOfficer(o) === quota.region);
    const kokudaka = sum(districtsInRegion.map((d) => d.kokudaka));
    return {
      region: quota.region,
      label: quota.label,
      castles: castlesInRegion.length,
      castlesTarget: quota.castles,
      castlesDeviationPct: deviationPct(castlesInRegion.length, quota.castles),
      districts: districtsInRegion.length,
      districtsTarget: quota.districts,
      districtsDeviationPct: deviationPct(districtsInRegion.length, quota.districts),
      kokudaka,
      kokudakaTarget: quota.kokudaka,
      kokudakaDeviationPct: deviationPct(kokudaka, quota.kokudaka),
      officers: officersInRegion.length,
      officersTarget: quota.officers,
      officersDeviationPct: deviationPct(officersInRegion.length, quota.officers),
    };
  });

  // ── 報表 3：全域計數 ──
  const global: GlobalStats = {
    castles: input.castles.length,
    districts: input.districts.length,
    officers: input.officers.length,
    roadsLand: input.roads.filter((r) => r.type === 'land').length,
    roadsSea: input.roads.filter((r) => r.type === 'sea').length,
    events: input.events?.length ?? 0,
    totalKokudaka: sum(input.districts.map((d) => d.kokudaka)),
    totalPopulation: sum(input.districts.map((d) => d.population)),
    developmentHeadroom: {
      kokudaka: sum(input.districts.map((d) => d.kokudakaCap - d.kokudaka)),
      commerce: sum(input.districts.map((d) => d.commerceCap - d.commerce)),
      population: sum(input.districts.map((d) => d.populationCap - d.population)),
    },
  };

  // ── 報表 4：校準核對（前 10 大勢力見 clanRows.slice(0, 10)；此處為指名勢力核對） ──
  const calibration: CalibrationResult[] = calibrationTargets.map((target) => {
    const toleranceRatio = target.toleranceRatio ?? 0.1;
    const row = clanRows.find((c) => c.clanId === target.clanId);
    if (row === undefined) {
      return {
        clanId: target.clanId,
        label: target.label,
        actualKokudaka: 0,
        expectedKokudaka: target.expectedKokudaka,
        toleranceRatio,
        found: false,
        pass: false,
      };
    }
    const diffRatio = Math.abs(row.kokudaka - target.expectedKokudaka) / target.expectedKokudaka;
    return {
      clanId: target.clanId,
      label: target.label,
      actualKokudaka: row.kokudaka,
      expectedKokudaka: target.expectedKokudaka,
      toleranceRatio,
      found: true,
      pass: diffRatio <= toleranceRatio,
    };
  });

  return { clanRows, regionRows, global, calibration };
}

// ═══════════════════════════════════════════════════════════════════
// 呈現（Markdown；純函式）
// ═══════════════════════════════════════════════════════════════════

function formatInt(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.round(Math.abs(n)).toString();
  return sign + abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '+∞%' : '-∞%';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function formatAvgStat(v: number): string {
  return v.toFixed(1);
}

/** 純函式：把 `computeScenarioStats` 的結果渲染為 Markdown（14 §5.2 四類報表；供人工抽查與
 * 平衡校準，plan/15-balance.md 引用）。 */
export function formatStatsMarkdown(
  report: ScenarioStatsReport,
  options?: { readonly title?: string },
): string {
  const title = options?.title ?? '劇本統計報表';
  const lines: string[] = [];

  lines.push(`# ${title}`, '');

  // 1. 勢力概覽
  lines.push('## 1. 勢力概覽（依石高降冪）', '');
  lines.push(
    '| 勢力 | 城 | 郡 | 石高 | 兵力 | 兵糧 | 金錢 | 武將 | 平均四維(統/武/知/政) | colorIndex |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of report.clanRows) {
    const avg = `${formatAvgStat(row.avgStats.ldr)}/${formatAvgStat(row.avgStats.val)}/${formatAvgStat(row.avgStats.int)}/${formatAvgStat(row.avgStats.pol)}`;
    lines.push(
      `| ${row.name} | ${row.castles} | ${row.districts} | ${formatInt(row.kokudaka)} | ` +
        `${formatInt(row.soldiers)} | ${formatInt(row.food)} | ${formatInt(row.gold)} | ` +
        `${row.officers} | ${avg} | ${row.colorIndex} |`,
    );
  }
  lines.push('');

  // 2. 地方彙總
  lines.push('## 2. 地方彙總（14 §3.2 配額對照）', '');
  lines.push(
    '| 地方 | 城 | 城配額 | 城偏差 | 郡 | 郡配額 | 郡偏差 | 石高 | 石高配額 | 石高偏差 | 武將 | 武將配額 | 武將偏差 |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of report.regionRows) {
    lines.push(
      `| ${row.label} | ${row.castles} | ${row.castlesTarget} | ${formatPct(row.castlesDeviationPct)} | ` +
        `${row.districts} | ${row.districtsTarget} | ${formatPct(row.districtsDeviationPct)} | ` +
        `${formatInt(row.kokudaka)} | ${formatInt(row.kokudakaTarget)} | ${formatPct(row.kokudakaDeviationPct)} | ` +
        `${row.officers} | ${row.officersTarget} | ${formatPct(row.officersDeviationPct)} |`,
    );
  }
  lines.push('');

  // 3. 全域計數
  const g = report.global;
  lines.push('## 3. 全域計數', '');
  lines.push(`- 城：${formatInt(g.castles)}`);
  lines.push(`- 郡：${formatInt(g.districts)}`);
  lines.push(`- 武將：${formatInt(g.officers)}`);
  lines.push(`- 街道：陸路 ${formatInt(g.roadsLand)}／海路 ${formatInt(g.roadsSea)}`);
  lines.push(`- 事件數：${formatInt(g.events)}`);
  lines.push(`- 總石高：${formatInt(g.totalKokudaka)} 石`);
  lines.push(`- 總人口：${formatInt(g.totalPopulation)} 人`);
  lines.push(
    `- 開發餘裕（Σcap−Σ現值）：石高 ${formatInt(g.developmentHeadroom.kokudaka)}／` +
      `商業 ${formatInt(g.developmentHeadroom.commerce)}／人口 ${formatInt(g.developmentHeadroom.population)}`,
  );
  lines.push('');

  // 4. 前 10 大勢力與校準核對
  lines.push('## 4. 前 10 大勢力與校準核對', '');
  lines.push('| # | 勢力 | 石高 |');
  lines.push('|---:|---|---:|');
  report.clanRows.slice(0, 10).forEach((row, i) => {
    lines.push(`| ${i + 1} | ${row.name} | ${formatInt(row.kokudaka)} |`);
  });
  lines.push('');
  lines.push('### 校準核對（00 §6／14 §3.5）', '');
  for (const c of report.calibration) {
    if (!c.found) {
      lines.push(`- ${c.label}：資料中無此勢力 → SKIP`);
      continue;
    }
    const verdict = c.pass ? 'PASS' : 'FAIL';
    lines.push(
      `- ${c.label}：實際 ${formatInt(c.actualKokudaka)} 石／目標 ${formatInt(c.expectedKokudaka)} 石` +
        `（±${(c.toleranceRatio * 100).toFixed(0)}%） → ${verdict}`,
    );
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// CLI 包裝
// ═══════════════════════════════════════════════════════════════════

const SCENARIOS_ROOT = path.resolve(
  fileURLToPath(new URL('../src/data/scenarios', import.meta.url)),
);

/** 從 `src/data/scenarios/<id>/` 直接讀取劇本原始 JSON，組成 `ScenarioStatsInput`。
 * 批次增量期（B1..B9）容忍缺檔：任一檔缺席以空陣列代入，使部分批次亦可產出報表
 * （比照 tools/validate.ts 的 loadRawScenario 寬鬆載入策略）。 */
function loadScenarioStatsInput(scenarioDir: string): ScenarioStatsInput | null {
  const readJson = (name: string): unknown => {
    const file = path.join(scenarioDir, name);
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, 'utf-8')) as unknown;
  };
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  const clans = arr<StatsClan>((readJson('clans.json') as { clans?: unknown } | undefined)?.clans);
  const castles = arr<StatsCastle>(readJson('castles.json'));
  const districts = arr<StatsDistrict>(readJson('districts.json'));
  const provinces = arr<StatsProvince>(
    (readJson('provinces.json') as { provinces?: unknown } | undefined)?.provinces,
  );
  const roads = arr<StatsRoad>((readJson('roads.json') as { edges?: unknown } | undefined)?.edges);
  const events = arr<{ id: string }>(
    (readJson('events.json') as { events?: unknown } | undefined)?.events,
  );

  const officers: StatsOfficer[] = [];
  const officersDir = path.join(scenarioDir, 'officers');
  if (existsSync(officersDir)) {
    for (const entry of readdirSync(officersDir)) {
      if (!entry.endsWith('.json')) continue;
      const file = JSON.parse(readFileSync(path.join(officersDir, entry), 'utf-8')) as {
        officers?: unknown;
      };
      officers.push(...arr<StatsOfficer>(file.officers));
    }
  }

  if (clans.length === 0 && castles.length === 0 && officers.length === 0) return null;
  return { clans, officers, castles, districts, provinces, roads, events };
}

/** CLI 入口：讀取劇本原始 JSON、印 Markdown 報表、決定 exit code（14 §5.2）。
 * 批次增量期僅部分地方就緒時，未就緒地方於報表 2 顯示為 0（偏差 -100%）——屬預期，非錯誤。 */
function main(): void {
  const scenarioId = process.argv[2] ?? 's1560';
  const scenarioDir = path.join(SCENARIOS_ROOT, scenarioId);
  const hasData = existsSync(scenarioDir) && readdirSync(scenarioDir).length > 0;
  if (!hasData) {
    console.log(`尚無劇本資料（${scenarioId}）`);
    process.exit(0);
  }
  const input = loadScenarioStatsInput(scenarioDir);
  if (input === null) {
    console.log(`尚無劇本資料（${scenarioId}）`);
    process.exit(0);
  }
  const report = computeScenarioStats(input);
  console.log(formatStatsMarkdown(report, { title: `劇本 ${scenarioId} 統計報表` }));
  process.exit(0);
}

// 僅在直接以 CLI 執行本檔時才呼叫 main()；被其他模組 import 時（如測試）不觸發 process.exit。
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
