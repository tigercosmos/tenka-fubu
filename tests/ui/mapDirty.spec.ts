// dirty-update 純函式測試（src/ui/map/dirty.ts）。
// 規格：M6-V4 技術設計 §3.3.3（buildOwnerByNode/diffOwnerByNode）、§3.2／補遺 AD-V4-4
// （armyWorldPos／armyStackKey，逐字等價改前 MainScreen.tsx L139-149 內插語意）、§7（DoD② 純
// diff helper 層）。
//
// 本檔無 pixi 相依，於 core（node）project 執行（tests/**/*.spec.ts）。

import { describe, expect, it } from 'vitest';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { RoadEdge } from '@core/state/gameState';
import { armyStackKey, armyWorldPos, buildOwnerByNode, diffOwnerByNode } from '@ui/map/dirty';

function fixtureGraph(): ReturnType<typeof buildMapGraph> {
  const castles = {
    'castle.aa': { id: 'castle.aa' as CastleId, pos: { x: 100, y: 100 } },
    'castle.bb': { id: 'castle.bb' as CastleId, pos: { x: 300, y: 300 } },
  } as unknown as Parameters<typeof buildMapGraph>[0];
  const districts = {
    'dist.xx': {
      id: 'dist.xx' as DistrictId,
      pos: { x: 200, y: 100 },
      isPort: false,
      castleId: 'castle.aa' as CastleId,
    },
  } as unknown as Parameters<typeof buildMapGraph>[1];
  const road = (id: string, a: string, b: string): RoadEdge => ({
    id: id as RoadEdgeId,
    a: a as CastleId,
    b: b as CastleId,
    type: 'land',
    grade: 1,
    baseDays: 2,
  });
  const roads = {
    'road.aa-xx': road('road.aa-xx', 'castle.aa', 'dist.xx'),
    'road.xx-bb': road('road.xx-bb', 'dist.xx', 'castle.bb'),
  } as unknown as Parameters<typeof buildMapGraph>[2];
  return buildMapGraph(castles, districts, roads);
}

describe('buildOwnerByNode（M6-V4 §3.3.3）', () => {
  it('併入 castles[] 與 districtOwner 兩張表；district 缺主(undefined)視為 null', () => {
    const m = buildOwnerByNode({
      castles: [
        { id: 'castle.aa', ownerClanId: 'clan.oda' },
        { id: 'castle.bb', ownerClanId: 'clan.imagawa' },
      ],
      districtOwner: { 'dist.xx': 'clan.oda', 'dist.yy': null },
    });
    expect(m.get('castle.aa')).toBe('clan.oda');
    expect(m.get('castle.bb')).toBe('clan.imagawa');
    expect(m.get('dist.xx')).toBe('clan.oda');
    expect(m.get('dist.yy')).toBeNull();
    expect(m.size).toBe(4);
  });
});

describe('diffOwnerByNode（M6-V4 §3.3.3；DoD② 純 diff helper）', () => {
  it('prev===null 視為「全部 dirty」（初次上色）', () => {
    const next = new Map([
      ['castle.aa', 'clan.oda'],
      ['castle.bb', 'clan.imagawa'],
    ]);
    const dirty = diffOwnerByNode(null, next);
    expect([...dirty].sort()).toEqual(['castle.aa', 'castle.bb']);
  });

  it('只回傳 owner 真的變了的 nodeId；其餘不變不列入', () => {
    const prev = new Map([
      ['castle.aa', 'clan.oda'],
      ['castle.bb', 'clan.imagawa'],
    ]);
    const next = new Map([
      ['castle.aa', 'clan.oda'], // 不變
      ['castle.bb', 'clan.oda'], // 變了（今川→織田）
    ]);
    const dirty = diffOwnerByNode(prev, next);
    expect([...dirty]).toEqual(['castle.bb']);
  });

  it('無任何變更（含逐鍵 === 比較，day 類欄位本就不在此輸入內）→ 空集合', () => {
    const view = new Map([['castle.aa', 'clan.oda']]);
    expect(diffOwnerByNode(view, new Map(view)).size).toBe(0);
  });

  it('null→有主 或 有主→null（無主化）皆視為變更', () => {
    const prev = new Map([['dist.xx', null]]);
    const next = new Map([['dist.xx', 'clan.oda']]);
    expect([...diffOwnerByNode(prev, next)]).toEqual(['dist.xx']);
    expect([...diffOwnerByNode(next, prev)]).toEqual(['dist.xx']);
  });
});

describe('armyWorldPos（M6-V4 §3.2／補遺 AD-V4-4：逐字等價改前 MainScreen L139-149）', () => {
  const graph = fixtureGraph();

  it('edgeT<=0（含 edgeCostDays<=0 已於 selector 端 clamp 為 0）→ 回傳 fromNode 座標', () => {
    const pos = armyWorldPos({ fromNode: 'castle.aa', toNode: 'castle.bb', edgeT: 0 }, graph);
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it('toNode===null → 回傳 fromNode 座標（即使 edgeT>0，防禦）', () => {
    const pos = armyWorldPos({ fromNode: 'castle.bb', toNode: null, edgeT: 0.5 }, graph);
    expect(pos).toEqual({ x: 300, y: 300 });
  });

  it('0<edgeT<1：沿 from→to 線性插值', () => {
    const pos = armyWorldPos({ fromNode: 'castle.aa', toNode: 'dist.xx', edgeT: 0.5 }, graph);
    // from(100,100) → to(200,100)，edgeT=0.5 → (150,100)
    expect(pos).toEqual({ x: 150, y: 100 });
  });

  it('edgeT=1：抵達 toNode 座標', () => {
    const pos = armyWorldPos({ fromNode: 'castle.aa', toNode: 'dist.xx', edgeT: 1 }, graph);
    expect(pos).toEqual({ x: 200, y: 100 });
  });

  it('toNode 查無節點（防禦）→ 回傳 fromNode 座標，不 throw', () => {
    const pos = armyWorldPos(
      { fromNode: 'castle.aa', toNode: 'castle.missing', edgeT: 0.5 },
      graph,
    );
    expect(pos).toEqual({ x: 100, y: 100 });
  });
});

describe('armyStackKey（UI 疊放概念；補遺 AD-V4-4：逐字等價改前 stackKey 導出）', () => {
  it('edgeT===0 → 用 fromNode（同節點多支部隊疊放）', () => {
    expect(armyStackKey({ id: 'army.1', fromNode: 'castle.aa', edgeT: 0 })).toBe('castle.aa');
  });

  it('edgeT>0（行軍中）→ 用 army id（不與他人共疊）', () => {
    expect(armyStackKey({ id: 'army.1', fromNode: 'castle.aa', edgeT: 0.3 })).toBe('army.1');
  });
});
