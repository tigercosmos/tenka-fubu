// composeMapViewState 純函式測試（M6-V4 技術設計 §4.5）。
// node 環境（純函式，無 pixi/DOM 相依）；不需 mock。

import { describe, expect, it } from 'vitest';
import { composeMapViewState } from '@ui/map/composeMapView';
import type { MapViewModel } from '@core/state/selectors';
import type { CastleId, ClanId, MapNodeId } from '@core/state/ids';

function makeModel(overrides: Partial<MapViewModel> = {}): MapViewModel {
  return {
    day: 42,
    districtOwner: { 'district.a': 'clan.a', 'district.b': null },
    castles: [
      {
        id: 'castle.a' as CastleId,
        ownerClanId: 'clan.a' as ClanId,
        durability: 100,
        maxDurability: 100,
        tier: 'main',
        terrainKind: 'plain',
        siegeMode: 'none',
        warning: 'none',
      },
    ],
    armies: [
      {
        id: 'army.1',
        clanId: 'clan.a',
        soldiers: 500,
        status: 'holding',
        morale: 80,
        foodDays: 5,
        mission: 'march',
        fromNode: 'castle.a' as MapNodeId,
        toNode: null,
        edgeT: 0,
        corps: false,
      },
      {
        id: 'army.2',
        clanId: 'clan.b',
        soldiers: 300,
        status: 'marching',
        morale: 60,
        foodDays: 3,
        mission: 'march',
        fromNode: 'castle.a' as MapNodeId,
        toNode: 'castle.b' as MapNodeId,
        edgeT: 0.5,
        corps: true,
      },
    ],
    sieges: [{ id: 'siege.1', pos: { x: 1, y: 2 }, mode: 'encircle' }],
    battles: [{ nodeOrEdgeId: 'castle.a', kind: 'siege' }],
    analysisMode: 'none',
    ...overrides,
  };
}

describe('composeMapViewState（M6-V4 §4.2）', () => {
  it('selection===null：所有 armies[].selected 為 false，MapViewState.selection 為 null', () => {
    const out = composeMapViewState(makeModel(), null);
    expect(out.selection).toBeNull();
    expect(out.armies.every((a) => a.selected === false)).toBe(true);
  });

  it("selection.kind==='army' 且 id 相符：僅該部隊 selected===true", () => {
    const out = composeMapViewState(makeModel(), { kind: 'army', id: 'army.2' });
    expect(out.selection).toEqual({ kind: 'army', id: 'army.2' });
    const byId = new Map(out.armies.map((a) => [a.id, a.selected]));
    expect(byId.get('army.1')).toBe(false);
    expect(byId.get('army.2')).toBe(true);
  });

  it("selection.kind==='army' 但 id 不符任何部隊：全部 selected===false", () => {
    const out = composeMapViewState(makeModel(), { kind: 'army', id: 'army.999' });
    expect(out.armies.every((a) => a.selected === false)).toBe(true);
    expect(out.selection).toEqual({ kind: 'army', id: 'army.999' });
  });

  it.each([['castle'], ['district']] as const)(
    "selection.kind==='%s'：對映為 MapViewState.selection.kind==='node'，armies 皆不 selected",
    (kind) => {
      const out = composeMapViewState(makeModel(), { kind, id: 'castle.a' });
      expect(out.selection).toEqual({ kind: 'node', id: 'castle.a' });
      expect(out.armies.every((a) => a.selected === false)).toBe(true);
    },
  );

  it('castles/sieges/battles/districtOwner/day/analysisMode 直通不變形', () => {
    const model = makeModel();
    const out = composeMapViewState(model, null);
    expect(out.day).toBe(model.day);
    expect(out.districtOwner).toEqual(model.districtOwner);
    expect(out.castles).toEqual(model.castles);
    expect(out.sieges).toEqual(model.sieges);
    expect(out.battles).toEqual(model.battles);
    expect(out.analysisMode).toBe(model.analysisMode);
  });

  it('armies[]：除 selected 外其餘欄位逐一直通不變形', () => {
    const model = makeModel();
    const out = composeMapViewState(model, null);
    out.armies.forEach((a, i) => {
      const rest: Record<string, unknown> = { ...a };
      delete rest.selected;
      expect(rest).toEqual(model.armies[i]);
    });
  });

  it('playerClanId 省略時輸出無此欄位；提供時原樣帶入', () => {
    const withoutIt = composeMapViewState(makeModel(), null);
    expect('playerClanId' in withoutIt).toBe(false);
    const withIt = composeMapViewState(makeModel(), null, 'clan.a');
    expect(withIt.playerClanId).toBe('clan.a');
  });

  it('決定論：同輸入呼叫兩次結構深相等', () => {
    const model = makeModel();
    const a = composeMapViewState(model, { kind: 'castle', id: 'castle.a' });
    const b = composeMapViewState(model, { kind: 'castle', id: 'castle.a' });
    expect(a).toEqual(b);
  });
});
