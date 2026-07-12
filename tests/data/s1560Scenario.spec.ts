// src/data/scenarios/s1560/index.ts 單元測試（M2-19：殼 → 實作，接上新遊戲流程）。
// 規格：plan/14-scenario-data.md §3.1／§7-T7；plan/18-roadmap.md M2-19。
import { describe, expect, it } from 'vitest';
import {
  loadS1560Scenario,
  S1560_SCENARIO_ID,
  S1560_LOADED_REGIONS,
} from '../../src/data/scenarios/s1560/index';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { REGION_VALUES } from '../../src/core/state/enums';
import type { ClanId } from '../../src/core/state/ids';

describe('loadS1560Scenario（M2-19：接上 B1 東海／B2 近畿實資料）', () => {
  it('回傳合法 ScenarioBundleData：id／9 地方 officers 陣列／已落地型錄', async () => {
    const bundle = await loadS1560Scenario();
    expect(bundle.id).toBe(S1560_SCENARIO_ID);
    expect(S1560_LOADED_REGIONS).toEqual(['tokai', 'kinki']);

    expect(bundle.officers.length).toBe(REGION_VALUES.length); // 9 地方，順序＝REGION_VALUES
    expect(bundle.officers[REGION_VALUES.indexOf('tokai')]?.length ?? 0).toBeGreaterThan(0);
    expect(bundle.officers[REGION_VALUES.indexOf('kinki')]?.length ?? 0).toBeGreaterThan(0);
    for (const region of REGION_VALUES) {
      if (region === 'tokai' || region === 'kinki') continue;
      expect(bundle.officers[REGION_VALUES.indexOf(region)] ?? []).toEqual([]); // 尚未落地批次
    }

    expect(bundle.catalogs.traits.length).toBe(37);
    expect(bundle.catalogs.tactics.length).toBe(12);
    expect(bundle.catalogs.personas.length).toBeGreaterThanOrEqual(41);
    // policies/events 尚未落地（M3-5／後續里程碑），依本檔檔頭決策固定空陣列。
    expect(bundle.catalogs.policies).toEqual([]);
    expect(bundle.events).toEqual([]);
  });

  it('每次呼叫回傳獨立物件（無跨呼叫共享可變狀態的疑慮）', async () => {
    const a = await loadS1560Scenario();
    const b = await loadS1560Scenario();
    expect(a).not.toBe(b);
    expect(a.clans).toEqual(b.clans);
  });

  it('與 buildGameStateFromScenario 整合：regions=[tokai,kinki] 建局後 validateState 零違規（M2-8 驗收精神）', async () => {
    const bundle = await loadS1560Scenario();
    const game = buildGameStateFromScenario(bundle, {
      appVersion: '0.0.0-test',
      seed: 12345,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      startDay: 0,
      regions: S1560_LOADED_REGIONS,
    });
    expect(validateState(game)).toEqual([]);
    expect(Object.keys(game.clans).length).toBe(13);
    expect(Object.keys(game.castles).length).toBe(34);
  });
});
