// tools/stats.ts 統計正確性測試（14-T3 驗收：plan/18-roadmap.md M2-3）。
// 規格：plan/14-scenario-data.md §5.2（四類報表）／§3.2（9 地方配額表、全國校準目標）；
// plan/18-roadmap.md M2-3 驗收精神（原文以東海批次資料校準織田/今川；本檔 s1560 批次資料尚未
// 產出，18-roadmap.md 該任務指示改用 tiny/mini fixture 驗證計算正確性——真實 s1560 資料就緒後
// 由 tools/stats.ts CLI 另行核對織田 310,000 石／今川 670,000 石）。
//
// tests/fixtures/mini/*（17 §3.3.1 zod 驗證版）尚未產出（M2-11），本檔以既有 tests/fixtures/tiny.ts
// 為主要 fixture，並額外構造一份最小合成資料（非 17 §3.3.1 mini fixture）覆蓋 tiny 未觸及的分支：
// 多地方分佈、district.ownerClanId 明示覆寫（制壓後現值）、劇本原始資料形態（郡無 ownerClanId
// 欄位、武將無 status 欄位）、浪人（clanId=null）。
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  computeScenarioStats,
  formatStatsMarkdown,
  REGION_QUOTAS,
  DEFAULT_CALIBRATION_TARGETS,
  type ScenarioStatsInput,
} from '../../tools/stats';
import { CLAN_ALPHA, CLAN_BETA, TINY_SCENARIO } from '../fixtures/tiny';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

describe('computeScenarioStats — tiny fixture（17 §3.3.1 精神：對稱兩勢力）', () => {
  const report = computeScenarioStats(TINY_SCENARIO);

  it('報表 1：勢力概覽依石高降冪排序，各欄位正確', () => {
    expect(report.clanRows).toHaveLength(2);
    const [first, second] = report.clanRows;
    expect(first?.clanId).toBe(CLAN_ALPHA);
    expect(second?.clanId).toBe(CLAN_BETA);

    // 甲家：2 城（castle.a1 soldiers 2000/food 5000 + castle.a2 soldiers 800/food 1500）、
    // 4 郡（每郡 kokudaka 20000）、3 名在籍武將。
    expect(first).toMatchObject({
      name: '甲家',
      castles: 2,
      districts: 4,
      kokudaka: 80_000,
      soldiers: 2800,
      food: 6500,
      gold: 1000,
      officers: 3,
      colorIndex: 0,
    });
    const expectedAlphaAvg = {
      ldr: (80 + 70 + 55) / 3,
      val: (70 + 65 + 60) / 3,
      int: (75 + 60 + 65) / 3,
      pol: (85 + 55 + 50) / 3,
    };
    expect(first?.avgStats.ldr).toBeCloseTo(expectedAlphaAvg.ldr, 10);
    expect(first?.avgStats.val).toBeCloseTo(expectedAlphaAvg.val, 10);
    expect(first?.avgStats.int).toBeCloseTo(expectedAlphaAvg.int, 10);
    expect(first?.avgStats.pol).toBeCloseTo(expectedAlphaAvg.pol, 10);

    // 乙家：1 城（castle.b1 soldiers 2000/food 5000）、2 郡、3 名在籍武將。
    expect(second).toMatchObject({
      name: '乙家',
      castles: 1,
      districts: 2,
      kokudaka: 40_000,
      soldiers: 2000,
      food: 5000,
      gold: 1000,
      officers: 3,
      colorIndex: 1,
    });
  });

  it('報表 2：地方彙總——tiny 兩國皆屬東海，其餘 8 地方實際值恆 0（偏差 -100%）', () => {
    expect(report.regionRows).toHaveLength(REGION_QUOTAS.length);
    const tokai = report.regionRows.find((r) => r.region === 'tokai');
    expect(tokai).toMatchObject({ castles: 3, districts: 6, kokudaka: 120_000, officers: 6 });
    expect(tokai?.castlesDeviationPct).toBeCloseTo(((3 - 16) / 16) * 100, 10);
    expect(tokai?.districtsDeviationPct).toBeCloseTo(((6 - 44) / 44) * 100, 10);
    expect(tokai?.kokudakaDeviationPct).toBeCloseTo(((120_000 - 2_400_000) / 2_400_000) * 100, 10);
    expect(tokai?.officersDeviationPct).toBeCloseTo(((6 - 95) / 95) * 100, 10);

    const otherRegions = report.regionRows.filter((r) => r.region !== 'tokai');
    expect(otherRegions).toHaveLength(8);
    for (const row of otherRegions) {
      expect(row.castles).toBe(0);
      expect(row.districts).toBe(0);
      expect(row.kokudaka).toBe(0);
      expect(row.officers).toBe(0);
      expect(row.castlesDeviationPct).toBe(-100);
      expect(row.districtsDeviationPct).toBe(-100);
      expect(row.kokudakaDeviationPct).toBe(-100);
      expect(row.officersDeviationPct).toBe(-100);
    }
  });

  it('報表 3：全域計數（城/郡/武將/邊/事件/總石高/總人口/開發餘裕）', () => {
    expect(report.global).toEqual({
      castles: 3,
      districts: 6,
      officers: 6,
      roadsLand: 8,
      roadsSea: 0,
      events: 0, // TINY_SCENARIO 無 events 欄位（GameState 不持有事件目錄本體）
      totalKokudaka: 120_000,
      totalPopulation: 90_000,
      developmentHeadroom: { kokudaka: 120_000, commerce: 1_800, population: 90_000 },
    });
  });

  it('報表 4：預設校準目標（織田/今川）於 tiny 資料中皆查無此勢力 → found:false', () => {
    expect(report.calibration).toHaveLength(DEFAULT_CALIBRATION_TARGETS.length);
    for (const c of report.calibration) {
      expect(c.found).toBe(false);
      expect(c.pass).toBe(false);
    }
  });

  it('報表 4：自訂校準目標——完全命中 PASS、偏差過大 FAIL、勢力不存在 found:false', () => {
    const custom = computeScenarioStats(TINY_SCENARIO, {
      calibrationTargets: [
        { clanId: CLAN_ALPHA, label: '甲家', expectedKokudaka: 80_000 },
        { clanId: CLAN_BETA, label: '乙家', expectedKokudaka: 100_000, toleranceRatio: 0.1 },
        { clanId: 'clan.nonexistent', label: '不存在', expectedKokudaka: 99_999 },
      ],
    });
    expect(custom.calibration[0]).toMatchObject({
      found: true,
      pass: true,
      actualKokudaka: 80_000,
    });
    expect(custom.calibration[1]).toMatchObject({
      found: true,
      pass: false,
      actualKokudaka: 40_000,
    });
    expect(custom.calibration[2]).toMatchObject({ found: false, pass: false, actualKokudaka: 0 });
  });

  it('formatStatsMarkdown 輸出含四節標題與關鍵數字，不拋例外', () => {
    const md = formatStatsMarkdown(report, { title: 'Tiny 測試劇本' });
    expect(md).toContain('# Tiny 測試劇本');
    expect(md).toContain('## 1. 勢力概覽');
    expect(md).toContain('## 2. 地方彙總');
    expect(md).toContain('## 3. 全域計數');
    expect(md).toContain('## 4. 前 10 大勢力與校準核對');
    expect(md).toContain('甲家');
    expect(md).toContain('80,000');
    expect(md).toContain('SKIP'); // 預設校準目標（織田/今川）於 tiny 中查無資料
  });
});

describe('computeScenarioStats — 合成多地方資料（覆蓋 tiny 未觸及的分支）', () => {
  // 刻意混用「劇本原始資料形態」（郡無 ownerClanId、武將無 status）與「已建置 state 形態」
  // （district.ownerClanId 明示覆寫，模擬制壓後現值與所轄城 owner 不同），驗證兩形態相容
  // （tools/stats.ts 檔頭說明）。
  const input: ScenarioStatsInput = {
    clans: [
      { id: 'clan.x', name: 'X家', gold: 500, colorIndex: 2 },
      { id: 'clan.y', name: 'Y家', gold: 300, colorIndex: 3 },
    ],
    castles: [
      { id: 'castle.x1', ownerClanId: 'clan.x', provinceId: 'prov.p1', soldiers: 100, food: 200 },
      { id: 'castle.y1', ownerClanId: 'clan.y', provinceId: 'prov.p2', soldiers: 50, food: 80 },
    ],
    provinces: [
      { id: 'prov.p1', region: 'kinki' },
      { id: 'prov.p2', region: 'kanto' },
    ],
    districts: [
      // 劇本原始資料形態：無 ownerClanId，應以所轄城 castle.x1 owner（clan.x）代入。
      {
        id: 'dist.d1',
        castleId: 'castle.x1',
        kokudaka: 1000,
        kokudakaCap: 2000,
        commerce: 100,
        commerceCap: 200,
        population: 500,
        populationCap: 1000,
      },
      // 明示覆寫：所轄城 castle.x1 屬 clan.x，但本郡現值已易主 clan.y（制壓後現值，02 §4.6）；
      // 地方歸屬仍應依所轄城地理位置（kinki），不隨易主變動。
      {
        id: 'dist.d2',
        castleId: 'castle.x1',
        ownerClanId: 'clan.y',
        kokudaka: 500,
        kokudakaCap: 800,
        commerce: 50,
        commerceCap: 100,
        population: 200,
        populationCap: 400,
      },
    ],
    roads: [
      { id: 'road.1', type: 'land' },
      { id: 'road.2', type: 'sea' },
    ],
    officers: [
      // 劇本原始資料形態：無 status 欄位，視為在籍。
      {
        id: 'off.x1',
        clanId: 'clan.x',
        locationCastleId: 'castle.x1',
        ldr: 50,
        val: 50,
        int: 50,
        pol: 50,
      },
      {
        id: 'off.y1',
        clanId: 'clan.y',
        locationCastleId: 'castle.y1',
        status: 'serving',
        ldr: 60,
        val: 60,
        int: 60,
        pol: 60,
      },
      // 具名浪人：clanId=null，不計入任何勢力名下，但計入全域與地方（依所在城地方）計數。
      {
        id: 'off.ronin1',
        clanId: null,
        locationCastleId: 'castle.y1',
        status: 'ronin',
        ldr: 40,
        val: 40,
        int: 40,
        pol: 40,
      },
    ],
  };
  const report = computeScenarioStats(input);

  it('district.ownerClanId 覆寫優先於所轄城 owner；缺欄位時以所轄城 owner 代入', () => {
    const x = report.clanRows.find((r) => r.clanId === 'clan.x');
    const y = report.clanRows.find((r) => r.clanId === 'clan.y');
    expect(x).toMatchObject({ castles: 1, districts: 1, kokudaka: 1000, officers: 1 });
    expect(y).toMatchObject({ castles: 1, districts: 1, kokudaka: 500, officers: 1 });
  });

  it('地方歸屬依所轄城地理位置，不受郡易主影響；浪人計入所在城地方', () => {
    const kinki = report.regionRows.find((r) => r.region === 'kinki');
    const kanto = report.regionRows.find((r) => r.region === 'kanto');
    // 兩郡皆轄於 castle.x1（kinki），即使 dist.d2 現屬 clan.y。
    expect(kinki).toMatchObject({ castles: 1, districts: 2, kokudaka: 1500, officers: 1 });
    // castle.y1 屬 kanto：off.y1 與具名浪人 off.ronin1 皆駐在該城。
    expect(kanto).toMatchObject({ castles: 1, districts: 0, kokudaka: 0, officers: 2 });
  });

  it('全域計數含浪人（不分勢力）；街道 land/sea 各 1', () => {
    expect(report.global.officers).toBe(3);
    expect(report.global.roadsLand).toBe(1);
    expect(report.global.roadsSea).toBe(1);
    expect(report.global.totalKokudaka).toBe(1500);
  });
});

describe('tools/stats.ts CLI（尚無劇本資料時的行為）', () => {
  it('對不存在的劇本 id 印出提示並以 exit code 0 結束', () => {
    const tsxBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    const result = spawnSync(tsxBin, ['tools/stats.ts', 'no-such-scenario'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('尚無劇本資料');
  });
});
