// 城型 terrainKind 資料與 view 邊界分派驗收（[M6-V7] Slice A；設計 §3.8／CD3／§8.1）。
// 規格：docs/design/m6-v7-castles.md §6.2（s1560 全 34 城 13 山城指派）／§3.6-§3.8。
import { describe, expect, it } from 'vitest';
import { zCastle } from '../../src/data/schemas/castle';
import { castleTerrainLookup } from '../../src/core/state/selectors';

/** 最小合法 castle 物件（除 terrainKind／有預設欄位外皆填），供 default／enum 驗收。 */
function baseCastleData(): Record<string, unknown> {
  return {
    id: 'castle.test',
    name: '測試城',
    tier: 'main',
    provinceId: 'prov.owari',
    pos: { x: 1000, y: 2000 },
    coastal: false,
    ownerClanId: 'clan.oda',
    lordId: null,
    soldiers: 100,
    food: 100,
    facilities: [],
  };
}

describe('zCastle.terrainKind（schema：預設與 enum）', () => {
  it('未提供 terrainKind → 預設 plain（向下相容）', () => {
    const parsed = zCastle.parse(baseCastleData());
    expect(parsed.terrainKind).toBe('plain');
  });

  it('提供 mountain → 保留 mountain', () => {
    const parsed = zCastle.parse({ ...baseCastleData(), terrainKind: 'mountain' });
    expect(parsed.terrainKind).toBe('mountain');
  });

  it('非法值 → parse 失敗', () => {
    expect(() => zCastle.parse({ ...baseCastleData(), terrainKind: 'hill' })).toThrow();
  });
});

describe('castleTerrainLookup（scenario 分派；設計 §3.6/CD3）', () => {
  // 設計 §6.2 之 13 座山城 id。
  const S1560_MOUNTAINS = [
    'castle.inabayama',
    'castle.odani',
    'castle.kannonji',
    'castle.iwamura',
    'castle.sawayama',
    'castle.kiriyama',
    'castle.akutagawa',
    'castle.iimoriyama',
    'castle.shigisan',
    'castle.yakami',
    'castle.yagi',
    'castle.konosumiyama',
    'castle.takeda',
  ] as const;

  it('s1560：13 座山城命中 mountain，其餘皆 plain', () => {
    const table = castleTerrainLookup('s1560');
    const mountains = Object.keys(table)
      .filter((id) => table[id] === 'mountain')
      .sort();
    expect(mountains).toEqual([...S1560_MOUNTAINS].sort());
    // 明列數座平城，確認 default('plain') 由 zod 補齊生效。
    expect(table['castle.kiyosu']).toBe('plain');
    expect(table['castle.sunpu']).toBe('plain');
    expect(table['castle.okazaki']).toBe('plain');
    // 全表值域僅 plain/mountain。
    for (const id of Object.keys(table)) {
      expect(['plain', 'mountain']).toContain(table[id]);
    }
  });

  it('debug-visual-map-01：走葉模組，castle.gifu=mountain', () => {
    const table = castleTerrainLookup('debug-visual-map-01');
    expect(table['castle.gifu']).toBe('mountain');
  });

  it('模組級快取：同 scenarioId 兩次呼叫回傳同一參考', () => {
    expect(castleTerrainLookup('s1560')).toBe(castleTerrainLookup('s1560'));
    expect(castleTerrainLookup('debug-visual-map-01')).toBe(
      castleTerrainLookup('debug-visual-map-01'),
    );
  });
});
