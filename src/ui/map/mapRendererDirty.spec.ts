// MapRenderer dirty-update 整合測試（M6-V4 §7 DoD①②③；決策 D10 panTo；決策 D11 getRebuildCounts）。
//
// 路徑說明（偏離設計文件建議路徑 `tests/ui/mapRendererDirty.spec.ts` 的紀錄）：`vitest.workspace.ts`
// 將 `tests/**/*.spec.ts` 全數歸入 `core`（node 環境）project，僅 `src/ui/**/*.spec.ts(x)` 歸入
// `ui`（jsdom）project。`MapRenderer.init()` 直接讀 `window.matchMedia`/`window.devicePixelRatio`
// （非經 pixi.js），在無 `window` 全域的 node 環境下會直接 ReferenceError；本檔需要真正呼叫
// `init()`（建立 8 圖層／`camera`／`nodeParts` 等）才能驅動 `setMapData`/`updateView`/`panTo`，
// 故比照既有 `MapCanvasHost.spec.tsx`（同樣需要 jsdom＋mock pixi）改置於 `src/ui/map/` 下
// （`.spec.ts`，非 React 元件，沿用 `MapCanvasHost.spec.tsx`「MapRenderer 生命週期」區塊之直接
// `new MapRenderer()` 手法，無需 `.tsx`／RTL）。任務指示「只動 slice 擁有的檔案」與此路徑調整
// 不衝突——`src/ui/map/**` 本就是 Slice B 擁有的目錄。
//
// mock 手法：沿用共用 `tests/helpers/pixiMock.ts`（`createPixiMockClasses`，與
// `MapCanvasHost.spec.tsx`／`MainScreen.spec.tsx` 同源）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const apps: { destroyed: boolean }[] = [];
  return { apps };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import type { Graphics } from 'pixi.js';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { RoadEdge } from '@core/state/gameState';
import { MapRenderer } from './MapRenderer';
import type { MapStaticData, MapViewState } from './mapViewTypes';

/** castle.a(100,100) — dist.x(200,100) — castle.b(300,100)：單一連通鏈，供 buildMapGraph 驗證。 */
function fixtureGraph(): ReturnType<typeof buildMapGraph> {
  const castles = {
    'castle.a': { id: 'castle.a' as CastleId, pos: { x: 100, y: 100 } },
    'castle.b': { id: 'castle.b' as CastleId, pos: { x: 300, y: 100 } },
  } as unknown as Parameters<typeof buildMapGraph>[0];
  const districts = {
    'dist.x': {
      id: 'dist.x' as DistrictId,
      pos: { x: 200, y: 100 },
      isPort: false,
      castleId: 'castle.a' as CastleId,
    },
  } as unknown as Parameters<typeof buildMapGraph>[1];
  const road = (id: string, a: string, b: string): RoadEdge => ({
    id: id as RoadEdgeId,
    a: a as CastleId,
    b: b as CastleId,
    type: 'land',
    grade: 1,
    baseDays: 1,
  });
  const roads = {
    'road.a-x': road('road.a-x', 'castle.a', 'dist.x'),
    'road.x-b': road('road.x-b', 'dist.x', 'castle.b'),
  } as unknown as Parameters<typeof buildMapGraph>[2];
  return buildMapGraph(castles, districts, roads);
}

function staticData(overrides: Partial<MapStaticData> = {}): MapStaticData {
  return {
    graph: fixtureGraph(),
    clanColorIndex: { 'clan.oda': 0, 'clan.imagawa': 1 },
    ...overrides,
  };
}

function baseView(overrides: Partial<MapViewState> = {}): MapViewState {
  return {
    day: 1,
    districtOwner: { 'dist.x': 'clan.oda' },
    castles: [
      {
        id: 'castle.a',
        ownerClanId: 'clan.oda',
        durability: 1000,
        maxDurability: 1000,
        tier: 'main',
        terrainKind: 'plain',
        siegeMode: 'none',
        warning: 'none',
      },
      {
        id: 'castle.b',
        ownerClanId: 'clan.imagawa',
        durability: 1000,
        maxDurability: 1000,
        tier: 'main',
        terrainKind: 'plain',
        siegeMode: 'none',
        warning: 'none',
      },
    ],
    armies: [],
    battles: [],
    selection: null,
    analysisMode: 'none',
    ...overrides,
  } as unknown as MapViewState;
}

async function makeRenderer(): Promise<MapRenderer> {
  const r = new MapRenderer();
  await r.init(document.createElement('div'), vi.fn());
  return r;
}

beforeEach(() => {
  hoisted.apps.length = 0;
});

describe('MapRenderer dirty-update（M6-V4 §7 DoD①：無變更 tick 不重建）', () => {
  it('setMapData 後首次 updateView 全 node 首繪；僅 day 不同的後續 updateView 計數零增量', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    expect(baseline.roads).toBe(1);
    expect(baseline.nodeMarkers).toBe(3); // castle.a／castle.b／dist.x 首繪皆 dirty
    expect(baseline.territory).toBe(1);
    expect(baseline.labels).toBe(0); // 本 fixture 未提供 names

    r.updateView(baseView({ day: 2 })); // 僅 day 不同，owner/army 全同
    expect(r.getRebuildCounts()).toEqual(baseline);

    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));
    expect(r.getRebuildCounts()).toEqual(baseline); // 連續呼叫亦零增量

    r.destroy();
  });

  it('labels 計數只在 buildStaticDataLayers（setMapData）期間增加，updateView 不增（補遺 AD-V4-5）', async () => {
    const r = await makeRenderer();
    r.setMapData(
      staticData({
        names: { 'castle.a': '甲城', 'castle.b': '乙城', 'dist.x': '丙郡', 'prov.p': '丁國' },
        provinceLabelPos: { 'prov.p': { x: 250, y: 50 } },
      }),
    );
    const afterSetMapData = r.getRebuildCounts();
    expect(afterSetMapData.labels).toBe(4); // 3 個 node label + 1 個省 label
    r.updateView(baseView());
    r.updateView(baseView({ day: 2 }));
    expect(r.getRebuildCounts().labels).toBe(afterSetMapData.labels);
    r.destroy();
  });

  it('setMapData 首繪保證（§11.1）：重新 setMapData 後 prevOwnerByNode 重設，下次 updateView 全 dirty', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.setMapData(staticData()); // 模擬換局／reload：graph 換了但 owner 未變
    r.updateView(baseView()); // 與前一次 view 完全相同
    const after = r.getRebuildCounts();
    expect(after.nodeMarkers).toBe(baseline.nodeMarkers + 3); // 全 3 node 視為 dirty 重繪一次
    expect(after.territory).toBe(baseline.territory + 1);

    r.destroy();
  });
});

describe('MapRenderer dirty-update（M6-V4 §7 DoD②：owner 變更只更新受影響 node/territory）', () => {
  it('翻轉一個城的 owner → 恰該 node nodeMarkers/territory +1，其餘 node 不重畫（Graphics.clear spy）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    const nodeGfx = r.getLayers()!.nodeMarkers.children as unknown as Graphics[];
    // buildStaticDataLayers 依 id 字典序建立：castle.a(0) < castle.b(1) < dist.x(2)。
    const spies = nodeGfx.map((g) => vi.spyOn(g, 'clear'));

    const view2 = baseView({
      castles: baseView().castles.map((c) =>
        c.id === 'castle.b' ? { ...c, ownerClanId: 'clan.oda' as never } : c,
      ),
    });
    r.updateView(view2);

    const after = r.getRebuildCounts();
    expect(after.nodeMarkers).toBe(baseline.nodeMarkers + 1);
    expect(after.territory).toBe(baseline.territory + 1);
    expect(after.roads).toBe(baseline.roads);
    expect(after.labels).toBe(baseline.labels);
    expect(after.armyChips).toBe(baseline.armyChips);

    expect(spies[0]).not.toHaveBeenCalled(); // castle.a 未變，不重畫
    expect(spies[1]).toHaveBeenCalledTimes(1); // castle.b 變了，恰重畫一次
    expect(spies[2]).not.toHaveBeenCalled(); // dist.x 未變，不重畫

    r.destroy();
  });

  it('district owner 無主化（有主→null）亦視為變更；owner 不變時零增量', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.updateView(baseView({ districtOwner: { 'dist.x': null } }));
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);

    const afterFirstFlip = r.getRebuildCounts();
    r.updateView(baseView({ districtOwner: { 'dist.x': null } })); // 再次相同 → 零增量
    expect(r.getRebuildCounts()).toEqual(afterFirstFlip);

    r.destroy();
  });
});

describe('MapRenderer dirty-update（M6-V4 §7 DoD③：移動只更新相關 ArmyChip）', () => {
  function marchingArmies(edgeTA: number, soldiersB: number): MapViewState['armies'] {
    return [
      {
        id: 'army.a',
        clanId: 'clan.oda',
        soldiers: 1_000,
        status: 'marching',
        morale: 80,
        foodDays: 10,
        mission: 'march',
        fromNode: 'castle.a',
        toNode: 'dist.x',
        edgeT: edgeTA,
        corps: false,
        selected: false,
      },
      {
        id: 'army.b',
        clanId: 'clan.imagawa',
        soldiers: soldiersB,
        status: 'holding',
        morale: 70,
        foodDays: 5,
        mission: 'march',
        fromNode: 'castle.b',
        toNode: null,
        edgeT: 0,
        corps: false,
        selected: false,
      },
    ] as unknown as MapViewState['armies'];
  }

  it('A 前進（edgeT 變）只 reposition、armyChips 計數不增；B 的 soldiers 變 → +1', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ armies: marchingArmies(0.2, 2_000) }));
    const baseline = r.getRebuildCounts();
    expect(baseline.armyChips).toBe(2); // 首繪兩支

    const armyContainers = r.getLayers()!.armies.children;
    const posAAfterFirst = { x: armyContainers[0]!.position.x, y: armyContainers[0]!.position.y };
    expect(posAAfterFirst).toEqual({ x: 120, y: 100 }); // from(100,100)+((200,100)-(100,100))*0.2

    r.updateView(baseView({ armies: marchingArmies(0.6, 2_000) })); // 只 A 的 edgeT 前進
    expect(r.getRebuildCounts().armyChips).toBe(baseline.armyChips); // 不增：只 reposition
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers); // owner 未變，node 不重畫
    expect(armyContainers[0]!.position.x).toBeCloseTo(160, 5); // 100+100*0.6

    r.updateView(baseView({ armies: marchingArmies(0.6, 1_900) })); // B 的 soldiers 變
    expect(r.getRebuildCounts().armyChips).toBe(baseline.armyChips + 1);

    r.destroy();
  });
});

describe('MapRenderer.panTo（決策 D10；MiniMap onNavigate 用）', () => {
  it('瞬移中心至指定世界座標、維持現 scale；與 setCameraPose({x,y},scale) 效果一致（黑箱驗證）', async () => {
    const r1 = await makeRenderer();
    r1.setCameraPose({ x: 0, y: 0 }, 2);
    const layers1 = r1.getLayers()!;
    const scaleBefore = layers1.world.scale.x;
    expect(scaleBefore).toBe(2);

    r1.panTo(321, 654);
    expect(layers1.world.scale.x).toBe(scaleBefore); // scale 維持不變（04 §3.13.1 無動畫）

    const r2 = await makeRenderer();
    r2.setCameraPose({ x: 0, y: 0 }, 2);
    r2.setCameraPose({ x: 321, y: 654 }, scaleBefore);
    const layers2 = r2.getLayers()!;

    expect(layers1.world.position.x).toBeCloseTo(layers2.world.position.x, 6);
    expect(layers1.world.position.y).toBeCloseTo(layers2.world.position.y, 6);

    r1.destroy();
    r2.destroy();
  });
});
