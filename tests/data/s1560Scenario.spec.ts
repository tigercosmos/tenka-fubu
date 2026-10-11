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
import { castleMaxSoldiers } from '../../src/core/domestic';

describe('loadS1560Scenario（九地方正式資料）', () => {
  it('real s1560 initial garrisons all fit the shared canonical population/facility cap', async () => {
    const bundle = await loadS1560Scenario();
    const state = buildGameStateFromScenario(bundle, {
      appVersion: 'm8-cap-regression',
      seed: 42,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      regions: S1560_LOADED_REGIONS,
    });
    for (const castle of Object.values(state.castles))
      expect(castle.soldiers, castle.id).toBeLessThanOrEqual(castleMaxSoldiers(state, castle));
  });
  it('回傳合法 ScenarioBundleData：id／9 地方 officers 陣列／已落地型錄', async () => {
    const bundle = await loadS1560Scenario();
    expect(bundle.id).toBe(S1560_SCENARIO_ID);
    expect(S1560_LOADED_REGIONS).toEqual([
      'tokai',
      'kinki',
      'kanto',
      'koshinetsu',
      'hokuriku',
      'chugoku',
      'shikoku',
      'kyushu',
      'tohoku',
    ]);

    expect(bundle.officers.length).toBe(REGION_VALUES.length); // 9 地方，順序＝REGION_VALUES
    expect(bundle.officers[REGION_VALUES.indexOf('tokai')]?.length ?? 0).toBeGreaterThan(0);
    expect(bundle.officers[REGION_VALUES.indexOf('tokai')]).toHaveLength(91);
    expect(bundle.officers[REGION_VALUES.indexOf('kinki')]).toHaveLength(97);
    expect(bundle.officers[REGION_VALUES.indexOf('hokuriku')]).toHaveLength(40);
    expect(bundle.officers[REGION_VALUES.indexOf('chugoku')]).toHaveLength(69);
    expect(bundle.officers[REGION_VALUES.indexOf('tohoku')]).toHaveLength(65);
    expect(bundle.officers.flat()).toHaveLength(619);
    for (const region of REGION_VALUES) {
      if ((S1560_LOADED_REGIONS as readonly string[]).includes(region)) {
        expect(bundle.officers[REGION_VALUES.indexOf(region)]?.length ?? 0).toBeGreaterThan(0);
        continue;
      }
      expect(bundle.officers[REGION_VALUES.indexOf(region)] ?? []).toEqual([]); // 尚未落地批次
    }

    expect(bundle.catalogs.traits.length).toBe(37);
    expect(bundle.catalogs.tactics.length).toBe(12);
    expect(bundle.catalogs.personas.length).toBeGreaterThanOrEqual(41);
    expect(bundle.catalogs.policies).toHaveLength(12);
    // canonical 史實事件由獨立型錄載入；舊資料束不承載該格式。
    expect(bundle.events).toEqual([]);
  });

  it('每次呼叫回傳獨立物件（無跨呼叫共享可變狀態的疑慮）', async () => {
    const a = await loadS1560Scenario();
    const b = await loadS1560Scenario();
    expect(a).not.toBe(b);
    expect(a.clans).toEqual(b.clans);
  });

  it('builds the nine loaded regions with zero invariant violations', async () => {
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
    expect(Object.keys(game.clans).length).toBe(41);
    expect(Object.keys(game.castles).length).toBe(121);
    expect(Object.keys(game.provinces)).toHaveLength(60);
    expect(Object.keys(game.districts)).toHaveLength(344);
  });
});
