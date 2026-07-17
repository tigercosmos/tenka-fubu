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
  // M6-V5（§8.2）：territory 自持 BufferImageSource/Texture 生命週期追蹤（首幀著色／owner 翻轉
  // recolor 之 source.update 次數、重掛對稱 destroy）。
  const bufferSources: { updateCalls: number; destroyed: boolean }[] = [];
  const textures: { destroyed: boolean }[] = [];
  return { apps, bufferSources, textures };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps, {
    bufferSources: hoisted.bufferSources,
    textures: hoisted.textures,
  });
});

import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { RoadEdge } from '@core/state/gameState';
import type { JapanOutlineFile } from '@data/schemas/outline';
import { MapRenderer } from './MapRenderer';
import type { MapStaticData, MapViewState } from './mapViewTypes';
import { MAPVIEW } from './mapViewConfig';
import { TOKENS_NUM } from '@ui/styles/tokens';

/**
 * 環繞 fixture 節點（100–300 世界座標）之小型合成 outline（M6-V5，Minor 6／§5.5）：使
 * `buildTerritoryLayer` 的 `buildTerritoryGrid` 掃描線只掃小陸地範圍、hermetic 且快，不啟用完整
 * 470 點 japan outline fallback。（`source:'handcrafted'` 僅為滿足型別；本檔不經 zod 驗證。）
 */
const TEST_OUTLINE: JapanOutlineFile = {
  version: 1,
  source: 'handcrafted',
  polygons: [{ id: 'box', points: [50, 50, 350, 50, 350, 350, 50, 350] }],
};

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
    outline: TEST_OUTLINE, // M6-V5：hermetic 小型 outline（territory grid 快建，Minor 6）
    ...overrides,
  };
}

/** M6-V5：帶 terrain pack（relief/forest asset id＋一河一湖）的 staticData——正向存在斷言用。 */
function staticDataWithTerrain(overrides: Partial<MapStaticData> = {}): MapStaticData {
  return staticData({
    terrain: {
      reliefAssetId: 'texture.terrain.relief@1x',
      forestAssetId: 'texture.terrain.forest@1x',
      rivers: [
        {
          id: 'rv.test',
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 150 },
          ],
          widthClass: 3,
        },
      ],
      lakes: [
        {
          id: 'lk.test',
          polygon: [
            { x: 200, y: 200 },
            { x: 250, y: 200 },
            { x: 225, y: 250 },
          ],
        },
      ],
    },
    ...overrides,
  });
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
  hoisted.bufferSources.length = 0;
  hoisted.textures.length = 0;
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
  it('翻轉一個城的 owner → 恰該 node nodeMarkers/territory +1，其餘 node 不重畫（body Graphics.clear spy，#M1）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    // M6-V7（#M1）：nodeMarkers.children 為 castleNode/districtNode Container（無 clear）；改對其
    // children[0]（castle＝bodyGfx／district＝gfx，皆 Graphics）spy clear。依 id 字典序建立：
    // castle.a(0) < castle.b(1) < dist.x(2)。
    const containers = r.getLayers()!.nodeMarkers.children as unknown as MockGfx[];
    const bodySpies = containers.map((c) => vi.spyOn(c.children[0]!, 'clear'));

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

    expect(bodySpies[0]).not.toHaveBeenCalled(); // castle.a 未變，body 不重畫
    expect(bodySpies[1]).toHaveBeenCalledTimes(1); // castle.b 變了，body 恰重畫一次
    expect(bodySpies[2]).not.toHaveBeenCalled(); // dist.x 未變，不重畫

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

// ── M6-V7：城池/郡 元件整合、節點簽章 dirty、選取環、聚落（設計 §8.2） ──────────────────

/** 帶 warning／city 狀態欄之 castles（castle.a 本城平城、castle.b 本城；可覆寫 warning/durability/terrainKind）。 */
function castlesWith(
  a: Partial<{
    warning: string;
    durability: number;
    maxDurability: number;
    terrainKind: string;
    ownerClanId: string;
  }> = {},
  b: Partial<{
    warning: string;
    durability: number;
    maxDurability: number;
    terrainKind: string;
    ownerClanId: string;
  }> = {},
): MapViewState['castles'] {
  return [
    {
      id: 'castle.a',
      ownerClanId: a.ownerClanId ?? 'clan.oda',
      durability: a.durability ?? 1000,
      maxDurability: a.maxDurability ?? 1000,
      tier: 'main',
      terrainKind: a.terrainKind ?? 'plain',
      siegeMode: 'none',
      warning: a.warning ?? 'none',
    },
    {
      id: 'castle.b',
      ownerClanId: b.ownerClanId ?? 'clan.imagawa',
      durability: b.durability ?? 1000,
      maxDurability: b.maxDurability ?? 1000,
      tier: 'main',
      terrainKind: b.terrainKind ?? 'plain',
      siegeMode: 'none',
      warning: b.warning ?? 'none',
    },
  ] as unknown as MapViewState['castles'];
}

/** 節點 Container（castle＝[bodyGfx,ringGfx,warnGfx]／district＝[gfx]）之最小形狀。 */
interface NodeContainer {
  label: string;
  visible: boolean;
  children: { visible: boolean; scale: { x: number } }[];
}

describe('城池/郡 元件（M6-V7 §8.2）：不再呼叫占位 marker、簽章 dirty、正向存在', () => {
  it('DoD：mapDraw 不再匯出 drawNodeMarker；nodeMarkers children 為 castleNode/districtNode container', async () => {
    const mod = (await import('./mapDraw')) as Record<string, unknown>;
    expect(mod.drawNodeMarker).toBeUndefined();
    expect(mod.drawNodeMarkers).toBeUndefined();

    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const containers = r.getLayers()!.nodeMarkers.children as unknown as NodeContainer[];
    const labels = containers.map((c) => c.label).sort();
    expect(labels).toEqual(['castleNode', 'castleNode', 'districtNode']); // castle.a/castle.b/dist.x
    r.destroy();
  });

  it('首繪＋正向存在：3 節點各一 container、nodeMarkers 計數===3、critical/threatened 城 warnGfx 顯示', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({ castles: castlesWith({ warning: 'critical' }, { warning: 'threatened' }) }),
    );

    expect(r.getLayers()!.nodeMarkers.children.length).toBe(3);
    expect(r.getRebuildCounts().nodeMarkers).toBe(3); // 首繪：全 3 node 簽章 dirty 各計數一次

    const containers = r.getLayers()!.nodeMarkers.children as unknown as NodeContainer[];
    // id 字典序：castle.a(0, critical)／castle.b(1, threatened)／dist.x(2)。warnGfx＝children[2]。
    expect(containers[0]!.children[2]!.visible).toBe(true); // critical → warnGfx 顯
    expect(containers[1]!.children[2]!.visible).toBe(true); // threatened → warnGfx 顯
    r.destroy();
  });

  it('耐久/警戒/城型 dirty：翻 durability→+1、翻 warning→+1、翻 terrainKind→+1；castle-only 變動不動 territory', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    let baseline = r.getRebuildCounts();

    r.updateView(baseView({ castles: castlesWith({ durability: 500 }) })); // castle.a 耐久變
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);
    expect(r.getRebuildCounts().territory).toBe(baseline.territory); // owner 未變 → territory 不動

    baseline = r.getRebuildCounts();
    r.updateView(baseView({ castles: castlesWith({ durability: 500, warning: 'critical' }) })); // warning 變
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);

    baseline = r.getRebuildCounts();
    r.updateView(
      baseView({
        castles: castlesWith({ durability: 500, warning: 'critical', terrainKind: 'mountain' }),
      }),
    ); // terrainKind 變
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);
    expect(r.getRebuildCounts().territory).toBe(baseline.territory);
    r.destroy();
  });

  it('re-setMapData +3（B3 守門）：重新 setMapData(same)＋同 updateView → nodeMarkers === baseline + 節點數', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.setMapData(staticData()); // prevNodeSig 重設為 null
    r.updateView(baseView()); // 與前一次 view 完全相同（元件 update 冪等短路，但計數由簽章 diff 保證）
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 3);
    r.destroy();
  });

  it('day-only 零增量：僅 day 變連跑 30 日 → nodeMarkers/territory/labels/roads 零增量', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));
    expect(r.getRebuildCounts()).toEqual(baseline);
    r.destroy();
  });

  it('聚落正向存在＋LOD：settlements.container 非空；far→visible false、near→true', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ castleTier: { 'castle.a': 'main', 'castle.b': 'main' } }));
    r.updateView(baseView());

    const settlements = r.getLayers()!.settlements;
    expect(settlements.children.length).toBe(1); // 單一 container（屋頂/田畦繪於其內 Graphics；繪製正確性見 settlementsDraw.spec）

    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far
    expect(settlements.visible).toBe(false);
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near
    expect(settlements.visible).toBe(true);
    r.destroy();
  });

  it('選取環 dirty（與 V6 協調）：node 選取→雙環顯＋roadHighlight 更新；day-only→不重更；army→隱；rebuildCounts 全程不動；z-order 中層', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 })); // selection null
    const baseline = r.getRebuildCounts();

    const selPath = r.getLayers()!.selectionAndPath.children as unknown as MockGfx[];
    expect(selPath.length).toBe(3); // [roadHighlight, selectionRing, pathPreview]
    const ringContainer = selPath[1] as unknown as { label: string; visible: boolean };
    expect(ringContainer.label).toBe('selectionRing'); // z-order 中層（壓道路高亮上、march 預覽下）
    const highlightGfx = selPath[0]!.children[0]!;
    const strokeSpy = vi.spyOn(highlightGfx, 'stroke');
    expect(ringContainer.visible).toBe(false); // 初始未選

    r.updateView(baseView({ day: 2, selection: { kind: 'node', id: 'castle.a' } }));
    expect(ringContainer.visible).toBe(true); // 節點選取 → 金色雙環顯
    expect(strokeSpy).toHaveBeenCalled(); // V6 相鄰道路高亮亦更新
    expect(r.getRebuildCounts()).toEqual(baseline); // 選取環/高亮不動計數

    strokeSpy.mockClear();
    r.updateView(baseView({ day: 3, selection: { kind: 'node', id: 'castle.a' } })); // day-only
    expect(strokeSpy).not.toHaveBeenCalled(); // selKey 未變 → 不重更
    expect(ringContainer.visible).toBe(true);

    r.updateView(baseView({ day: 4, selection: { kind: 'army', id: 'army.z' } })); // 選軍隊
    expect(ringContainer.visible).toBe(false); // selKey=null → 節點環隱（軍隊環屬 V8）

    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 5 欄位全程不動

    // M6-V7 review：graph swap 當下即隱選取環（鏡像 roadHighlight）——否則新選取為 null 時
    // updateView 的 selKey diff 為 null===null 不觸發 updateSelectionRing，舊環殘留於舊座標。
    r.updateView(baseView({ day: 5, selection: { kind: 'node', id: 'castle.a' } }));
    expect(ringContainer.visible).toBe(true); // 先重新選取 → 環顯
    r.setMapData(staticData()); // graph swap
    expect(ringContainer.visible).toBe(false); // swap 當下即隱，不得依賴 selKey diff
    r.updateView(baseView({ day: 6, selection: null })); // selKey=null===prevSelectionKey(null)
    expect(ringContainer.visible).toBe(false); // 仍隱（無殘留）

    // updateSelectionRing 的 node===undefined 防線：選取不存在於當前圖之 id → 環隱。
    r.updateView(baseView({ day: 7, selection: { kind: 'node', id: 'castle.absent' } }));
    expect(ringContainer.visible).toBe(false);

    r.destroy();
  });

  it('StrictMode/destroy：init→setMapData→destroy→重掛，nodeParts/選取環/聚落對稱建立/銷毀，無殘留', async () => {
    const r1 = await makeRenderer();
    r1.setMapData(staticData());
    r1.updateView(baseView());
    expect(r1.getLayers()!.nodeMarkers.children.length).toBe(3);
    expect(r1.getLayers()!.settlements.children.length).toBe(1);
    r1.destroy();
    expect(r1.getLayers()).toBeNull(); // 圖層清空、無殘留參考

    const r2 = await makeRenderer();
    r2.setMapData(staticData());
    r2.updateView(baseView());
    expect(r2.getLayers()!.nodeMarkers.children.length).toBe(3);
    expect(r2.getLayers()!.selectionAndPath.children.length).toBe(3);
    r2.destroy();
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

// ── M6-V8：軍隊棋子整合（heading／armyChipStage restage／far 放大／被選取置頂／relation） ──────
//
// 全部以相對增量（Δ）斷言，不釘死 post-init 絕對 armyChips 值（V8D11 §8.3／#9）。chip container 於
// V8D14 為 3 子節點 [graphics, plateGfx, label]；MockGfx.poly 可 vi.spyOn 觀測方向箭頭之額外 poly。

interface SpyableGfx {
  poly: (...a: unknown[]) => unknown;
}

describe('軍隊 V8（M6-V8 §8.3）：heading／stage restage／far 放大／置頂／relation', () => {
  /** V8 軍隊字面量（含必填 relation）；`over` 覆寫任意欄位。以 cast 餵入 MapViewState['armies']。 */
  function v8Army(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'army.x',
      clanId: 'clan.oda',
      soldiers: 2_000,
      status: 'holding',
      morale: 70,
      foodDays: 10,
      mission: 'march',
      fromNode: 'castle.a',
      toNode: null,
      edgeT: 0,
      corps: false,
      selected: false,
      relation: 'friendly',
      ...over,
    };
  }
  function armiesView(list: Record<string, unknown>[]): MapViewState['armies'] {
    return list as unknown as MapViewState['armies'];
  }

  it('heading 接線：marching 軍畫方向箭頭（額外 poly），holding 軍無', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([
          v8Army({
            id: 'army.1',
            fromNode: 'castle.a',
            toNode: 'dist.x',
            edgeT: 0.5,
            status: 'marching',
          }),
          v8Army({ id: 'army.2', fromNode: 'castle.b', toNode: null, status: 'holding' }),
        ]),
      }),
    );
    const children = r.getLayers()!.armies.children as unknown as MockGfx[];
    // id 序：army.1（marching）在前、army.2（holding）在後；container.children[0]＝graphics。
    const gfxMarching = children[0]!.children[0]! as unknown as SpyableGfx;
    const gfxHolding = children[1]!.children[0]! as unknown as SpyableGfx;
    const polyMarching = vi.spyOn(gfxMarching, 'poly');
    const polyHolding = vi.spyOn(gfxHolding, 'poly');
    // 改 soldiers 觸發兩軍重繪（drawEqual false）。
    r.updateView(
      baseView({
        day: 2,
        armies: armiesView([
          v8Army({
            id: 'army.1',
            fromNode: 'castle.a',
            toNode: 'dist.x',
            edgeT: 0.5,
            status: 'marching',
            soldiers: 2_500,
          }),
          v8Army({
            id: 'army.2',
            fromNode: 'castle.b',
            toNode: null,
            status: 'holding',
            soldiers: 2_500,
          }),
        ]),
      }),
    );
    // marching 多畫一個方向箭頭 poly（旗面 poly 兩軍皆有；箭頭僅 heading!==null）。
    expect(polyMarching.mock.calls.length).toBeGreaterThan(polyHolding.mock.calls.length);
    r.destroy();
  });

  it('LOD restage Δ 遞增（BLOCKER1 守門）：far→near 落差觸發 syncArmyChips 重繪', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ armies: armiesView([v8Army({ id: 'army.1' })]) }));
    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far（已為 far → armyChipStage 落差為 0，不 restage）
    const base = r.getRebuildCounts().armyChips;
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // far→near：armyChipStage 落差 → restage 重繪
    expect(r.getRebuildCounts().armyChips).toBeGreaterThan(base);
    r.destroy();
  });

  it('day-only Δ 零：固定相機（同 stage）連跑 30 日，armyChips 不增', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const mk = (day: number): MapViewState =>
      baseView({
        day,
        armies: armiesView([
          v8Army({
            id: 'army.1',
            fromNode: 'castle.a',
            toNode: 'dist.x',
            edgeT: 0.5,
            status: 'marching',
          }),
        ]),
      });
    r.updateView(mk(1));
    const base = r.getRebuildCounts().armyChips;
    for (let i = 0; i < 30; i += 1) r.updateView(mk(2 + i)); // heading 常數（同邊）＋pos 同 → drawEqual → Δ0
    expect(r.getRebuildCounts().armyChips).toBe(base);
    r.destroy();
  });

  it('far 放大為 transform（不計 armyChips）＋ far/near container scale 切換', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([v8Army({ id: 'army.1', fromNode: 'castle.a', toNode: null })]),
      }),
    );
    r.setCameraPose({ x: 100, y: 100 }, 0.25); // far
    const base = r.getRebuildCounts().armyChips;
    const container = r.getLayers()!.armies.children[0]!;
    expect(container.scale.x).toBe(MAPVIEW.armyFarChipScale); // far 反向放大
    r.updateView(
      baseView({
        day: 2,
        armies: armiesView([v8Army({ id: 'army.1', fromNode: 'castle.a', toNode: null })]),
      }),
    ); // 同 stage far、props 同
    expect(r.getRebuildCounts().armyChips).toBe(base); // 放大為 transform，不重繪、不計數
    r.setCameraPose({ x: 100, y: 100 }, 1.25); // near
    expect(container.scale.x).toBe(1); // mid/near 恢復 1
    r.destroy();
  });

  it('MapRebuildCounts 恆 5 欄位（toEqual 整物件）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ armies: armiesView([v8Army({ id: 'army.1' })]) }));
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // 觸發 restage
    const counts = r.getRebuildCounts();
    expect(Object.keys(counts).sort()).toEqual([
      'armyChips',
      'labels',
      'nodeMarkers',
      'roads',
      'territory',
    ]);
    r.destroy();
  });

  it('被選取置頂（V8D10）：selected 軍 re-append 至 armies.children 末端；換選取換置頂', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const mk = (sel: string | null): MapViewState =>
      baseView({
        armies: armiesView([
          v8Army({ id: 'army.1', fromNode: 'castle.a', toNode: null, selected: sel === 'army.1' }),
          v8Army({ id: 'army.2', fromNode: 'castle.b', toNode: null, selected: sel === 'army.2' }),
        ]),
      });
    r.updateView(mk(null));
    const children = r.getLayers()!.armies.children;
    const c1 = children[0]!; // army.1（id 序在前）
    const c2 = children[1]!; // army.2
    r.updateView(mk('army.1'));
    expect(r.getLayers()!.armies.children.at(-1)).toBe(c1); // army.1 選取 → 置頂
    r.updateView(mk('army.2'));
    expect(r.getLayers()!.armies.children.at(-1)).toBe(c2); // 換 army.2 選取 → 換置頂
    r.destroy();
  });

  it('被選取軍深埋 5+ 收合區仍破例顯示且置頂（V8D10「永遠置頂」硬約束回歸）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    // 5 支 holding 軍同駐 castle.a（同 stackKey）→ 收合：id 序 index>=4 預設隱藏。選取 id 序最末
    // （army.5，index 4）者：修正前會被加入 collapsedArmyIds → container 隱藏、且置頂迴圈以
    // !entry.visible 跳過 → 既不顯示亦不置頂，違反「被選取軍隊永遠置頂／破例顯示」硬約束。
    const ids = ['army.1', 'army.2', 'army.3', 'army.4', 'army.5'];
    r.updateView(
      baseView({
        armies: armiesView(
          ids.map((id) =>
            v8Army({ id, fromNode: 'castle.a', toNode: null, edgeT: 0, selected: id === 'army.5' }),
          ),
        ),
      }),
    );
    const children = r.getLayers()!.armies.children;
    const selected = children[4]!; // 建立序 army.1..army.5 → army.5 = index 4（收合區）
    expect(selected.visible).toBe(true); // 破例顯示（未被 collapsedArmyIds 隱藏）
    expect(r.getLayers()!.armies.children.at(-1)).toBe(selected); // re-append 至末＝置頂
    r.destroy();
  });

  it('正向存在（堵靜默）：friendly/enemy/neutral 三軍皆建立 chip、各 3 子節點 [graphics,plateGfx,label]', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([
          v8Army({ id: 'army.1', relation: 'friendly', fromNode: 'castle.a', toNode: null }),
          v8Army({ id: 'army.2', relation: 'enemy', fromNode: 'castle.b', toNode: null }),
          v8Army({ id: 'army.3', relation: 'neutral', fromNode: 'dist.x', toNode: null }),
        ]),
      }),
    );
    const children = r.getLayers()!.armies.children as unknown as MockGfx[];
    expect(children.length).toBe(3);
    for (const c of children) expect(c.children.length).toBe(3); // graphics / plateGfx / label
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

describe('territory sprite dirty（M6-V5 §8.2；VD4 首幀著色＋owner 翻轉）', () => {
  /** territory 為最後建立之 BufferImageSource（每次 buildTerritoryLayer 建新 source）。 */
  const currentSource = (): { updateCalls: number; destroyed: boolean } => {
    const src = hoisted.bufferSources.at(-1);
    if (src === undefined) throw new Error('尚無 territory BufferImageSource');
    return src;
  };

  it('setMapData＋首 updateView：territory 有 1 sprite child、首幀著色已呼叫 source.update', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));

    expect(r.getLayers()!.territory.children.length).toBe(1); // territory Sprite 掛上
    expect(currentSource().updateCalls).toBeGreaterThanOrEqual(1); // 首幀著色（build 當下）+ 首 updateView
    // 首幀著色不動 rebuildCounts（territory 計數僅由 applyOwnerDirty dirty 訊號驅動）。
    expect(r.getRebuildCounts().territory).toBe(1);

    r.destroy();
  });

  it('翻轉一郡 owner：territory 計數 +1、source.update 再 +1（recolor 每幀至多一次）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();
    const src = currentSource();
    const updatesBefore = src.updateCalls;

    r.updateView(baseView({ districtOwner: { 'dist.x': 'clan.imagawa' } }));

    expect(r.getRebuildCounts().territory).toBe(baseline.territory + 1);
    expect(src.updateCalls).toBe(updatesBefore + 1);

    r.destroy();
  });

  it('僅 day 變：territory 計數不增、source.update 不再呼叫（連續 30 日零增量）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    const src = currentSource();
    const updatesBefore = src.updateCalls;

    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));

    expect(r.getRebuildCounts().territory).toBe(baseline.territory);
    expect(src.updateCalls).toBe(updatesBefore);

    r.destroy();
  });

  it('無 terrain pack：territory 仍建（sprite 存在）、waterFeatures／terrainBase 空、不崩', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData()); // 無 terrain
    r.updateView(baseView());

    const layers = r.getLayers()!;
    expect(layers.territory.children.length).toBe(1); // territory 與 terrain pack 無關
    expect(layers.waterFeatures.children.length).toBe(0); // 無 river/lake → 無 container
    expect(layers.terrainBase.children.length).toBe(0); // 無 terrain → relief/forest 不載入

    r.destroy();
  });
});

describe('地形/水系正向存在（M6-V5 §8.2，M2 處置）——堵靜默退回平面圖漏洞', () => {
  it('帶 terrain pack：terrainBase 掛 relief＋forest 2 child、waterFeatures container 非空（4 Graphics）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticDataWithTerrain());
    r.updateView(baseView());
    // loadTerrainTextures 之 mock Assets.load 同步 resolve；等一個 macrotask 讓 async IIFE attach sprite。
    await new Promise((res) => setTimeout(res, 0));

    const layers = r.getLayers()!;
    expect(layers.terrainBase.children.length).toBe(2); // relief + forest 皆掛上
    expect(layers.waterFeatures.children.length).toBe(1); // waterFeatures container
    expect(layers.waterFeatures.children[0]!.children.length).toBe(4); // lake + river×3 class Graphics

    r.destroy();
  });

  it('app 序回歸（Blocker 1）：setMapData→updateView→await init，init 後 territory 有 sprite＋首幀著色已跑', async () => {
    const r = new MapRenderer();
    // 實機 effect 序：init(async 未 resolve)→setMapData(initialized===false)→updateView(early-return)。
    r.setMapData(staticData()); // 僅存 staticData
    r.updateView(baseView()); // 僅存 view（early-return）
    await r.init(document.createElement('div'), vi.fn()); // init 內 reconstructTerrainLayers 建 territory

    const layers = r.getLayers()!;
    expect(layers.territory.children.length).toBe(1); // Blocker 1：init 亦建 territory（非只 setMapData 分支）
    expect(hoisted.bufferSources.at(-1)!.updateCalls).toBeGreaterThanOrEqual(1); // Blocker 2：首幀著色已跑

    r.destroy();
  });
});

describe('地形載入失敗與 teardown（M6-V5 §5.1 VD6 優雅退回／§8.2 對稱 destroy）', () => {
  /** reliefAssetId 於 manifest 查無 → loader.acquire reject → loadTerrainTextures catch 退回平面。 */
  function terrainWithBadRelief(): MapStaticData {
    return staticDataWithTerrain({
      terrain: {
        reliefAssetId: 'texture.terrain.relief.__missing__', // manifest 查無 → acquire reject
        forestAssetId: 'texture.terrain.forest@1x',
        rivers: [
          {
            id: 'rv.test',
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 150 },
            ],
            widthClass: 3,
          },
        ],
        lakes: [],
      },
    });
  }

  it('relief acquire reject：優雅退回平面（terrainBase 空）、不丟例外、idle gate 於 finally 重置', async () => {
    const r = await makeRenderer();
    r.setMapData(terrainWithBadRelief());
    r.updateView(baseView());
    // 等一個 macrotask 讓 loadTerrainTextures 之 async IIFE 走完 reject→catch→finally。
    await new Promise((res) => setTimeout(res, 0));

    const layers = r.getLayers()!;
    // (b) 退回平面：relief/forest 皆未掛（seaBackground fallback 生效）；renderer 仍可用。
    expect(layers.terrainBase.children.length).toBe(0);
    expect(layers.territory.children.length).toBe(1); // territory 與 terrain 無關，照常建

    // (c) idle gate 已於 finally 重置（terrainTexturesPending=false）：註冊 waiter＋推進一幀應 resolve；
    //     若失敗路徑漏掉 finally，advanceIdleWaiters 會永久 early-return，waiter 永不 resolve（e2e 懸掛）。
    let resolved = false;
    const p = r.waitForIdleFrames(1).then(() => {
      resolved = true;
    });
    (r.getApp()!.ticker as unknown as { tick: () => void }).tick();
    await p;
    expect(resolved).toBe(true);

    r.destroy();
  });

  it('setMapData(null) teardown：territory/waterFeatures/terrainBase 清空、自持 source/texture 對稱 destroy、不丟例外', async () => {
    const r = await makeRenderer();
    r.setMapData(staticDataWithTerrain());
    r.updateView(baseView());
    await new Promise((res) => setTimeout(res, 0)); // relief/forest attach

    const layers = r.getLayers()!;
    expect(layers.terrainBase.children.length).toBe(2); // 前置：relief+forest 已掛
    expect(layers.waterFeatures.children.length).toBe(1);
    expect(layers.territory.children.length).toBe(1);

    const territorySource = hoisted.bufferSources.at(-1)!; // territory 自持 BufferImageSource（唯一）
    expect(territorySource.destroyed).toBe(false);
    const destroyedTexturesBefore = hoisted.textures.filter((t) => t.destroyed).length;

    // data===null → reconstructTerrainLayers 內部見 null 即清空並 destroy 自持資源。
    expect(() => r.setMapData(null)).not.toThrow();
    await new Promise((res) => setTimeout(res, 0));

    expect(layers.territory.children.length).toBe(0);
    expect(layers.waterFeatures.children.length).toBe(0);
    expect(layers.terrainBase.children.length).toBe(0);
    // 自持 territory BufferImageSource＋Texture 對稱 destroy（relief/forest 共享 texture 不隨之 destroy）。
    expect(territorySource.destroyed).toBe(true);
    expect(hoisted.textures.filter((t) => t.destroyed).length).toBeGreaterThan(
      destroyedTexturesBefore,
    );

    r.destroy();
  });
});

// ── M6-V6：roads／道路名／橋樑／選取高亮（設計 §8.2） ──────────────────────────
//
// mock 手法：共用 pixiMock 之 Graphics 不記錄呼叫，但可 `vi.spyOn(gfx, 'clear'|'stroke')` 觀測
// RoadsLayer per-stage 重描（clear）與選取高亮重畫（stroke）。RoadsLayer 掛為 `layers.roads` 之
// 唯一 child（container），其 5 個具名 tier 依 addChild 序 [sea,path,bridge,minor,arterial]。
// roadHighlight container 為 `layers.selectionAndPath.children[0]`（掛於 pathPreview 之前），其
// 內單一 Graphics 承接金色高亮描繪。

interface MockGfx {
  visible: boolean;
  children: MockGfx[];
  clear(): unknown;
  stroke(): unknown;
}

/** castle.a(100,100)—dist.x(200,100)—castle.b(300,100)：road.a-x 為 grade-3 主幹道（含 name／waypoints／bridge）。 */
function arterialGraph(): ReturnType<typeof buildMapGraph> {
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
  const road = (id: string, a: string, b: string, grade: 1 | 2 | 3): RoadEdge => ({
    id: id as RoadEdgeId,
    a: a as CastleId,
    b: b as CastleId,
    type: 'land',
    grade,
    baseDays: 2,
  });
  const roads = {
    'road.a-x': road('road.a-x', 'castle.a', 'dist.x', 3), // 主幹道（arterial）
    'road.x-b': road('road.x-b', 'dist.x', 'castle.b', 1), // 小路
  } as unknown as Parameters<typeof buildMapGraph>[2];
  const roadDisplay = {
    'road.a-x': { name: '東海道', waypoints: [150, 110], bridges: [150, 110] },
  };
  return buildMapGraph(castles, districts, roads, roadDisplay);
}

/** RoadsLayer container 之 5 具名 tier（addChild 序：sea/path/bridge/minor/arterial）。 */
function roadsTiers(r: MapRenderer): {
  container: MockGfx;
  sea: MockGfx;
  path: MockGfx;
  bridge: MockGfx;
  minor: MockGfx;
  arterial: MockGfx;
} {
  const container = r.getLayers()!.roads.children[0] as unknown as MockGfx;
  const c = container.children;
  return {
    container,
    sea: c[0]!,
    path: c[1]!,
    bridge: c[2]!,
    minor: c[3]!,
    arterial: c[4]!,
  };
}

describe('roads／道路名／橋樑／選取高亮（M6-V6，設計 §8.2）', () => {
  it('靜態建構＋正向存在：roads 單一 container（5 tier）、labels 含 road:<edgeId>（東海道）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));

    const layers = r.getLayers()!;
    expect(layers.roads.children.length).toBe(1); // RoadsLayer 子容器（V6D2）
    expect(roadsTiers(r).container.children.length).toBe(5); // sea/path/bridge/minor/arterial

    const labelTexts = (layers.labels.children as unknown as { text?: string }[]).map(
      (c) => c.text,
    );
    expect(labelTexts).toContain('東海道'); // 道路名標籤已建（堵靜默無名）

    r.destroy();
  });

  it('roads 靜態化＋setStage 不動計數：僅 day 變（stage 不變）連跑 30 日，roads/labels 零增量、arterial 不重描', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    expect(baseline.roads).toBe(1);
    expect(baseline.labels).toBe(1); // 唯一道路名（東海道）；本 graph 未提供 node names

    const clearSpy = vi.spyOn(roadsTiers(r).arterial, 'clear');
    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));

    expect(clearSpy).not.toHaveBeenCalled(); // stage 未變 → setStage 早退（零重描）
    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 5 欄位整物件不變

    r.destroy();
  });

  it('far 保留主幹道＋海路（tier 能見度矩陣）；near→far 之 stage 轉場觸發一次重描、不動 roads 計數', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));

    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near：全 tier 顯
    const tiers = roadsTiers(r);
    expect(tiers.path.visible).toBe(true); // 小路 near 顯
    const roadsBefore = r.getRebuildCounts().roads;

    const clearSpy = vi.spyOn(tiers.arterial, 'clear');
    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far

    expect(tiers.arterial.visible).toBe(true); // 主幹道 far 保留（DoD 核心）
    expect(tiers.sea.visible).toBe(true); // 海路 far 保留
    expect(tiers.minor.visible).toBe(false); // 次道 far 隱
    expect(tiers.path.visible).toBe(false); // 小路 far 隱
    expect(tiers.bridge.visible).toBe(false); // 橋樑 far 隱
    expect(clearSpy).toHaveBeenCalledTimes(1); // near→far：per-stage 倍率重描一次
    expect(r.getRebuildCounts().roads).toBe(roadsBefore); // 重描為 LOD 轉場，不動 rebuildCounts

    r.destroy();
  });

  it('道路名標籤：fill=ink900（V6D5／eng-F2 HARD DoD）＋near-only LOD（04 §3.10.3）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));

    const labels = r.getLayers()!.labels.children as unknown as {
      text?: string;
      visible: boolean;
      style?: { fill?: number };
    }[];
    const roadLabel = labels.find((c) => c.text === '東海道');
    expect(roadLabel).toBeDefined();
    // V6D5／eng-F2（HARD）：道路名以 ink900 填色（warm base 上白字不可讀＝DoD 失敗）。
    expect(roadLabel!.style?.fill).toBe(TOKENS_NUM.ink900);

    // near-only（04 §3.10.3）：near 顯、mid／far 隱（label 位於 (150,110) 附近，三 pose 皆在視域內，
    // 差異純由 LOD detail 閘控，非 culling）。setCameraPose 以 lodStageForScale 決定論設段。
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near（scale>=1.0）
    expect(roadLabel!.visible).toBe(true);
    r.setCameraPose({ x: 200, y: 100 }, 0.75); // mid（0.5<=scale<1.0）
    expect(roadLabel!.visible).toBe(false);
    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far（scale<0.5）
    expect(roadLabel!.visible).toBe(false);

    r.destroy();
  });

  it('選取高亮 dirty：node 選取→重畫；day-only→不重畫；graph swap 後同選取仍重算；rebuildCounts 全程不變', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 })); // selection null → 不觸發高亮
    const baseline = r.getRebuildCounts();

    // roadHighlight container = selectionAndPath.children[0]，其內單一 Graphics。
    const highlightGfx = (r.getLayers()!.selectionAndPath.children[0] as unknown as MockGfx)
      .children[0]!;
    const strokeSpy = vi.spyOn(highlightGfx, 'stroke');

    // null → 選取 castle.a（node）：相鄰道路（road.a-x）重畫；選取高亮為動態層，零計數增量。
    r.updateView(baseView({ day: 2, selection: { kind: 'node', id: 'castle.a' } }));
    expect(strokeSpy).toHaveBeenCalled();
    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 5 欄位不變（高亮不動計數）

    // day-only（選取不變）：不重畫、計數仍不變。
    strokeSpy.mockClear();
    r.updateView(baseView({ day: 3, selection: { kind: 'node', id: 'castle.a' } }));
    expect(strokeSpy).not.toHaveBeenCalled();
    expect(r.getRebuildCounts()).toEqual(baseline);

    // graph swap（非 null setMapData）→ prevSelectionKey 重設；同選取下次 updateView 仍重算。
    r.setMapData(staticData({ graph: arterialGraph() }));
    strokeSpy.mockClear();
    r.updateView(baseView({ day: 4, selection: { kind: 'node', id: 'castle.a' } }));
    expect(strokeSpy).toHaveBeenCalled(); // 陳舊高亮杜絕：prevSelectionKey 已重設 → 重算
    expect(r.getRebuildCounts().roads).toBe(baseline.roads + 1); // 靜態重建 +1（高亮本身仍不動計數）

    // graph swap 後新選取為 null：swap 當下即清舊高亮（clear），不得依賴 selKey diff
    //（null===null 不觸發 update）而殘留舊圖 gold strokes（M6-V6 review：stale-strokes gap）。
    const clearSpy = vi.spyOn(highlightGfx, 'clear');
    r.setMapData(staticData({ graph: arterialGraph() }));
    expect(clearSpy).toHaveBeenCalled(); // swap 當下鏡像 data===null 分支之 update(null)
    clearSpy.mockClear();
    strokeSpy.mockClear();
    r.updateView(baseView({ day: 5, selection: null }));
    expect(strokeSpy).not.toHaveBeenCalled(); // null 選取不重畫（且無殘留可言）

    r.destroy();
  });
});
