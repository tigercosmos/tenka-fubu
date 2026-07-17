// visual fixture 城型顯示資料（DEBUG_VISUAL_CASTLE_TERRAIN）單元測試。
// 規格：docs/design/m6-v7-castles.md §3.7／§6.3／§8.1（Slice A 驗收）。
//
// 覆蓋：每 key ∈ fixture 城 id 集（防拼字漂移）；值域僅 plain/mountain；castle.gifu=mountain
// （＝稻葉山城化名，展示平城／山城剪影對比）。
import { describe, expect, it } from 'vitest';

import { DEBUG_VISUAL_CASTLE_TERRAIN } from './debugVisualCastleTerrain';
import { buildVisualMapState } from '../debugVisual';

// fixture state（決定論建構；提供合法城 id 集）。
const FIXTURE_CASTLE_IDS = new Set(Object.keys(buildVisualMapState().castles));

describe('DEBUG_VISUAL_CASTLE_TERRAIN', () => {
  it('每 key 皆為 fixture 中實際存在之城 id', () => {
    for (const id of Object.keys(DEBUG_VISUAL_CASTLE_TERRAIN)) {
      expect(FIXTURE_CASTLE_IDS.has(id)).toBe(true);
    }
  });

  it('每 value ∈ {plain, mountain}', () => {
    for (const id of Object.keys(DEBUG_VISUAL_CASTLE_TERRAIN)) {
      expect(['plain', 'mountain']).toContain(DEBUG_VISUAL_CASTLE_TERRAIN[id]);
    }
  });

  it('castle.gifu = mountain（稻葉山城化名，山城）', () => {
    expect(DEBUG_VISUAL_CASTLE_TERRAIN['castle.gifu']).toBe('mountain');
  });
});
