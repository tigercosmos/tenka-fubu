// composeMapViewState 純函式測試（M6-V4 技術設計 §4.5）。
// node 環境（純函式，無 pixi/DOM 相依）；不需 mock。

import { describe, expect, it } from 'vitest';
import { composeMapViewState, stanceToRelation } from '@ui/map/composeMapView';
import type { MapViewModel } from '@core/state/selectors';
import type { CastleId, ClanId, MapNodeId } from '@core/state/ids';
import type { Stance } from '@core/systems/pathfinding';
import type { ArmyRelation } from '@ui/map/mapViewTypes';

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
    districts: [], // [M6-V7] AD1：MapViewModel 新增必填 districts（pass-through；此測試不涉次級狀態）
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

  it('castles（除三衍生欄）/sieges/battles/districtOwner/day/analysisMode 直通不變形', () => {
    const model = makeModel();
    const out = composeMapViewState(model, null);
    expect(out.day).toBe(model.day);
    expect(out.districtOwner).toEqual(model.districtOwner);
    // M6-V9b §1.3：soldiers/relation/isPlayer 為 composeMapViewState 注入之 UI 推導欄，
    // 非 model 直通欄位——比照下方 armies 之 delete rest.relation 先例，剝除後逐城比對。
    out.castles.forEach((c, i) => {
      const rest: Record<string, unknown> = { ...c };
      delete rest.soldiers;
      delete rest.relation;
      delete rest.isPlayer;
      expect(rest).toEqual(model.castles[i]);
    });
    expect(out.sieges).toEqual(model.sieges);
    expect(out.battles).toEqual(model.battles);
    expect(out.analysisMode).toBe(model.analysisMode);
  });

  it('armies[]：除 selected／relation 外其餘欄位逐一直通不變形', () => {
    const model = makeModel();
    const out = composeMapViewState(model, null);
    out.armies.forEach((a, i) => {
      const rest: Record<string, unknown> = { ...a };
      delete rest.selected;
      delete rest.relation; // M6-V8 V8D3：relation 由 composeMapViewState 推導，非 model 直通欄位（#7）
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

describe('relation 推導（M6-V8 §4.1／V8D3）', () => {
  it('預設（無 resolver）：己方→friendly、他方→enemy、undefined playerClanId→neutral', () => {
    // model.armies：army.1=clan.a、army.2=clan.b
    const asPlayerA = composeMapViewState(makeModel(), null, 'clan.a');
    const relA = new Map(asPlayerA.armies.map((a) => [a.id, a.relation]));
    expect(relA.get('army.1')).toBe('friendly'); // 己方
    expect(relA.get('army.2')).toBe('enemy'); // 有玩家、非己方

    const asSpectator = composeMapViewState(makeModel(), null); // playerClanId undefined
    expect(asSpectator.armies.every((a) => a.relation === 'neutral')).toBe(true);
  });

  it('注入 relationOf resolver：採用其回傳值（覆寫預設）', () => {
    const resolver = (clanId: string): ArmyRelation => (clanId === 'clan.b' ? 'neutral' : 'enemy');
    const out = composeMapViewState(makeModel(), null, 'clan.a', resolver);
    const rel = new Map(out.armies.map((a) => [a.id, a.relation]));
    expect(rel.get('army.1')).toBe('enemy'); // resolver 覆寫（預設本會是 friendly）
    expect(rel.get('army.2')).toBe('neutral');
  });

  it('城三欄注入（M6-V9b §1.3）：soldiers 查 soldiersByCastle（缺→0）、relation 依 owner、isPlayer 依 playerClanId', () => {
    // model.castles：castle.a owner=clan.a。
    const withTable = composeMapViewState(makeModel(), null, 'clan.a', undefined, {
      'castle.a': 1_234,
    });
    const c = withTable.castles[0]!;
    expect(c.soldiers).toBe(1_234); // soldiersByCastle 注入
    expect(c.relation).toBe('friendly'); // owner===player → friendly（預設 resolver）
    expect(c.isPlayer).toBe(true); // ownerClanId === playerClanId

    const asEnemyViewer = composeMapViewState(makeModel(), null, 'clan.zzz');
    expect(asEnemyViewer.castles[0]!.soldiers).toBe(0); // 缺表 → 0 兜底
    expect(asEnemyViewer.castles[0]!.relation).toBe('enemy'); // 有玩家、非己方
    expect(asEnemyViewer.castles[0]!.isPlayer).toBe(false);

    const spectator = composeMapViewState(makeModel(), null); // playerClanId undefined
    expect(spectator.castles[0]!.relation).toBe('neutral'); // 旁觀
    expect(spectator.castles[0]!.isPlayer).toBe(false);

    // 注入 relationOf resolver：城 relation 採其回傳（與 army 同一 resolver 路徑）。
    const resolver = (): ArmyRelation => 'neutral';
    const resolved = composeMapViewState(makeModel(), null, 'clan.a', resolver);
    expect(resolved.castles[0]!.relation).toBe('neutral');
  });

  it('stanceToRelation：5 個 Stance 全對映（own/friendly→friendly、war→enemy、ceasefire/neutral→neutral）', () => {
    const cases: ReadonlyArray<[Stance, ArmyRelation]> = [
      ['own', 'friendly'],
      ['friendly', 'friendly'],
      ['war', 'enemy'],
      ['ceasefire', 'neutral'],
      ['neutral', 'neutral'],
    ];
    for (const [stance, expected] of cases) {
      expect(stanceToRelation(stance)).toBe(expected);
    }
  });
});
