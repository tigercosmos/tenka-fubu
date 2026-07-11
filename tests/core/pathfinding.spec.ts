// computePath() 驗收測試（M2-7；04-T4／04 §4.3／§5.2）。
// 手法：10 節點固定 fixture 圖（3 勢力：alpha 我方／beta 中立（無協定，視同交戰）／gamma 停戰），
// 涵蓋 04-T4 驗收四點：①路徑與 totalDays（含制壓估算與雙態節點登船成本）bit 相同；
// ②敵城僅可為終點（不可穿越）；③停戰領不可入（含終點）；④同輸入重複呼叫結果 bit 相同。
// 另以獨立 4 節點鑽石圖驗證決定論 tie-break（cost 相同時取 nodeId 字典序較小者）。

import { describe, expect, it } from 'vitest';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import type { Castle, District, DiplomacyRow, RoadEdge } from '../../src/core/state/gameState';
import type {
  CastleId,
  ClanId,
  ClanPairKey,
  DistrictId,
  ProvinceId,
  RoadEdgeId,
} from '../../src/core/state/ids';
import { computePath, type PathfindingState } from '../../src/core/systems/pathfinding';

// ── 共用最小 fixture 建構工具 ──

function makeCastle(params: {
  id: CastleId;
  ownerClanId: ClanId;
  districtIds: DistrictId[];
  pos?: { x: number; y: number };
}): Castle {
  return {
    id: params.id,
    name: params.id,
    tier: 'main',
    provinceId: 'prov.test' as ProvinceId,
    coastal: false,
    pos: params.pos ?? { x: 0, y: 0 },
    ownerClanId: params.ownerClanId,
    lordId: null,
    directControl: true,
    corpsId: null,
    durability: 1000,
    maxDurability: 1000,
    soldiers: 1000,
    food: 1000,
    foodFrac: 0,
    riceTradedThisMonth: 0,
    morale: 80,
    conscriptPolicy: 'mid',
    facilities: [],
    buildQueue: [],
    betrayalReadyClanId: null,
    betrayalReadyUntilDay: 0,
    districtIds: params.districtIds,
  };
}

function makeDistrict(params: {
  id: DistrictId;
  castleId: CastleId;
  ownerClanId: ClanId;
  isPort?: boolean;
  kokudaka?: number;
  pos?: { x: number; y: number };
}): District {
  return {
    id: params.id,
    name: params.id,
    castleId: params.castleId,
    isPort: params.isPort ?? false,
    pos: params.pos ?? { x: 0, y: 0 },
    ownerClanId: params.ownerClanId,
    stewardId: null,
    kokudaka: params.kokudaka ?? 20_000,
    kokudakaCap: 40_000,
    commerce: 100,
    commerceCap: 500,
    population: 5000,
    populationCap: 10_000,
    publicOrder: 70,
    developFocus: 'agri',
    subjugation: null,
    uprising: null,
  };
}

function makeRoad(id: string, a: string, b: string, opts: Partial<RoadEdge> = {}): RoadEdge {
  return {
    id: id as RoadEdgeId,
    a: a as RoadEdge['a'],
    b: b as RoadEdge['b'],
    type: 'land',
    grade: 1,
    baseDays: 1,
    ...opts,
  };
}

const ALPHA = 'clan.alpha' as ClanId;
const BETA = 'clan.beta' as ClanId;
const GAMMA = 'clan.gamma' as ClanId;

const CASTLE_A1 = 'castle.a1' as CastleId;
const DIST_A1P = 'dist.a1p' as DistrictId;
const CASTLE_A2 = 'castle.a2' as CastleId;
const DIST_A2X = 'dist.a2x' as DistrictId;
const CASTLE_B1 = 'castle.b1' as CastleId;
const DIST_B1X = 'dist.b1x' as DistrictId;
const DIST_B1P = 'dist.b1p' as DistrictId;
const DIST_B1Z = 'dist.b1z' as DistrictId;
const CASTLE_G1 = 'castle.g1' as CastleId;
const DIST_G1X = 'dist.g1x' as DistrictId;

function buildFixture(): { state: PathfindingState; graph: ReturnType<typeof buildMapGraph> } {
  const castles: Record<CastleId, Castle> = {
    [CASTLE_A1]: makeCastle({ id: CASTLE_A1, ownerClanId: ALPHA, districtIds: [DIST_A1P] }),
    [CASTLE_A2]: makeCastle({ id: CASTLE_A2, ownerClanId: ALPHA, districtIds: [DIST_A2X] }),
    [CASTLE_B1]: makeCastle({
      id: CASTLE_B1,
      ownerClanId: BETA,
      districtIds: [DIST_B1X, DIST_B1P, DIST_B1Z],
    }),
    [CASTLE_G1]: makeCastle({ id: CASTLE_G1, ownerClanId: GAMMA, districtIds: [DIST_G1X] }),
  };

  const districts: Record<DistrictId, District> = {
    [DIST_A1P]: makeDistrict({
      id: DIST_A1P,
      castleId: CASTLE_A1,
      ownerClanId: ALPHA,
      isPort: true,
    }),
    [DIST_A2X]: makeDistrict({ id: DIST_A2X, castleId: CASTLE_A2, ownerClanId: ALPHA }),
    [DIST_B1X]: makeDistrict({
      id: DIST_B1X,
      castleId: CASTLE_B1,
      ownerClanId: BETA,
      kokudaka: 20_000,
    }),
    [DIST_B1P]: makeDistrict({
      id: DIST_B1P,
      castleId: CASTLE_B1,
      ownerClanId: BETA,
      isPort: true,
      kokudaka: 20_000,
    }),
    [DIST_B1Z]: makeDistrict({ id: DIST_B1Z, castleId: CASTLE_B1, ownerClanId: BETA }),
    [DIST_G1X]: makeDistrict({ id: DIST_G1X, castleId: CASTLE_G1, ownerClanId: GAMMA }),
  };

  const roads: Record<RoadEdgeId, RoadEdge> = {
    ['road.a1-a1p' as RoadEdgeId]: makeRoad('road.a1-a1p', CASTLE_A1, DIST_A1P, { baseDays: 2 }),
    ['road.a1-a2' as RoadEdgeId]: makeRoad('road.a1-a2', CASTLE_A1, CASTLE_A2, {
      grade: 3,
      baseDays: 3,
    }),
    ['road.a2-a2x' as RoadEdgeId]: makeRoad('road.a2-a2x', CASTLE_A2, DIST_A2X, { baseDays: 1 }),
    ['road.a2x-b1x' as RoadEdgeId]: makeRoad('road.a2x-b1x', DIST_A2X, DIST_B1X, { baseDays: 2 }),
    ['road.b1x-b1' as RoadEdgeId]: makeRoad('road.b1x-b1', DIST_B1X, CASTLE_B1, { baseDays: 1 }),
    ['road.b1x-b1p' as RoadEdgeId]: makeRoad('road.b1x-b1p', DIST_B1X, DIST_B1P, { baseDays: 5 }),
    ['road.a1p-b1p' as RoadEdgeId]: makeRoad('road.a1p-b1p', DIST_A1P, DIST_B1P, {
      type: 'sea',
      baseDays: 3,
    }),
    ['road.b1-b1z' as RoadEdgeId]: makeRoad('road.b1-b1z', CASTLE_B1, DIST_B1Z, { baseDays: 1 }),
    ['road.a1-g1' as RoadEdgeId]: makeRoad('road.a1-g1', CASTLE_A1, CASTLE_G1, { baseDays: 2 }),
    ['road.g1-g1x' as RoadEdgeId]: makeRoad('road.g1-g1x', CASTLE_G1, DIST_G1X, { baseDays: 1 }),
  };

  const graph = buildMapGraph(castles, districts, roads);

  const ceasefireRow: DiplomacyRow = {
    key: 'clan.alpha|clan.gamma' as ClanPairKey,
    a: ALPHA,
    b: GAMMA,
    trustAtoB: 0,
    trustBtoA: 0,
    sentimentAtoB: 0,
    sentimentBtoA: 0,
    pacts: [{ kind: 'ceasefire', startDay: 0, endDay: 360, vassalClanId: null }],
    lastHostileDay: 0,
    refusalCooldownUntilDay: {},
    lastReinforceRequestDayAtoB: null,
    lastReinforceRequestDayBtoA: null,
  };

  const state: PathfindingState = {
    castles,
    districts,
    diplomacy: {
      rows: { [ceasefireRow.key]: ceasefireRow },
      missions: [],
      plots: [],
      pendingProposals: [],
    },
    time: { day: 100, year: 1560, month: 4, dayOfMonth: 11 },
  };

  return { state, graph };
}

describe('computePath', () => {
  it('己方領土：直取最短邊，totalDays 依 edgeCostDays 四捨五入至 0.5 日', () => {
    const { state, graph } = buildFixture();
    const result = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: CASTLE_A2,
      speedFactor: 1.0,
    });

    expect(result.found).toBe(true);
    expect(result.nodes).toEqual([CASTLE_A1, CASTLE_A2]);
    expect(result.edgeIds).toEqual(['road.a1-a2']);
    expect(result.travelDays).toBeCloseTo(1.875, 10); // baseDays 3 / roadGradeSpeedMult[3]=1.6
    expect(result.subjugateDays).toBe(0);
    expect(result.totalDays).toBe(2); // round(1.875*2)/2 = 2
    expect(result.steps).toEqual([
      { nodeId: CASTLE_A1, etaDays: 0, needsSubjugate: false },
      { nodeId: CASTLE_A2, etaDays: 1.875, needsSubjugate: false },
    ]);
  });

  it('敵城僅可為終點：路徑經制壓敵郡後抵達敵城，途中制壓日數計入 subjugateDays', () => {
    const { state, graph } = buildFixture();
    const result = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: CASTLE_B1,
      speedFactor: 1.0,
    });

    expect(result.found).toBe(true);
    expect(result.nodes).toEqual([CASTLE_A1, CASTLE_A2, DIST_A2X, DIST_B1X, CASTLE_B1]);
    expect(result.edgeIds).toEqual(['road.a1-a2', 'road.a2-a2x', 'road.a2x-b1x', 'road.b1x-b1']);
    expect(result.travelDays).toBeCloseTo(5.875, 10); // 1.875 + 1 + 2 + 1
    expect(result.subjugateDays).toBe(4); // clamp(4 + floor(20000/30000), 3, 10) = 4
    expect(result.totalDays).toBe(10); // round(9.875*2)/2 = 10
    expect(result.steps.map((s) => s.needsSubjugate)).toEqual([false, false, false, true, false]);

    // 同輸入重複呼叫：bit 相同（04-T4 驗收）。
    const again = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: CASTLE_B1,
      speedFactor: 1.0,
    });
    expect(again).toEqual(result);
  });

  it('敵城不可穿越：終點在敵城之後時無解（found=false）', () => {
    const { state, graph } = buildFixture();
    // dist.b1z 唯一聯外邊經 castle.b1；b1 非本次終點，不可作為途經節點。
    const result = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: DIST_B1Z,
      speedFactor: 1.0,
    });

    expect(result.found).toBe(false);
    expect(result.nodes).toEqual([]);
    expect(result.edgeIds).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it('停戰領不可入（含終點）：即使有直接街道邊仍無解', () => {
    const { state, graph } = buildFixture();
    const toG1 = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: CASTLE_G1,
      speedFactor: 1.0,
    });
    expect(toG1.found).toBe(false);

    const toG1x = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: DIST_G1X,
      speedFactor: 1.0,
    });
    expect(toG1x.found).toBe(false);
  });

  it('雙態節點登船成本：海路較land繞路更省時，正確選中海路且僅計一次登船延遲', () => {
    const { state, graph } = buildFixture();
    const result = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: DIST_B1P,
      speedFactor: 1.0,
    });

    expect(result.found).toBe(true);
    expect(result.nodes).toEqual([CASTLE_A1, DIST_A1P, DIST_B1P]);
    expect(result.edgeIds).toEqual(['road.a1-a1p', 'road.a1p-b1p']);
    // travelDays = 2 (陸) + (3 海路基礎 + 1 登船) = 6；不吃 speedFactor（海路不修正）。
    expect(result.travelDays).toBeCloseTo(6, 10);
    expect(result.subjugateDays).toBe(4);
    expect(result.totalDays).toBe(10); // round(10*2)/2 = 10
  });

  it('speedFactor 影響陸路但不影響海路（04 §3.4.3）', () => {
    const { state, graph } = buildFixture();
    const result = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: DIST_A1P,
      speedFactor: 2.0, // 陸路加速一倍
    });
    expect(result.found).toBe(true);
    expect(result.travelDays).toBeCloseTo(1, 10); // 2 / 2.0
  });

  it('同勢力／from===to：立即抵達，travelDays=0、subjugateDays=0', () => {
    const { state, graph } = buildFixture();
    const result = computePath(state, graph, {
      clanId: ALPHA,
      from: CASTLE_A1,
      to: CASTLE_A1,
      speedFactor: 1.0,
    });
    expect(result).toEqual({
      found: true,
      nodes: [CASTLE_A1],
      edgeIds: [],
      travelDays: 0,
      subjugateDays: 0,
      totalDays: 0,
      steps: [{ nodeId: CASTLE_A1, etaDays: 0, needsSubjugate: false }],
    });
  });
});

describe('computePath 決定論 tie-break', () => {
  it('cost 相同的兩條路徑，恆取 nodeId 字典序較小的中繼節點', () => {
    const CLAN = 'clan.solo' as ClanId;
    const S = 'castle.s' as CastleId;
    const E = 'castle.e' as CastleId;
    const ALT_A = 'dist.alt-a' as DistrictId;
    const ALT_Z = 'dist.alt-z' as DistrictId;

    const castles: Record<CastleId, Castle> = {
      [S]: makeCastle({ id: S, ownerClanId: CLAN, districtIds: [] }),
      [E]: makeCastle({ id: E, ownerClanId: CLAN, districtIds: [] }),
    };
    const districts: Record<DistrictId, District> = {
      [ALT_A]: makeDistrict({ id: ALT_A, castleId: S, ownerClanId: CLAN }),
      [ALT_Z]: makeDistrict({ id: ALT_Z, castleId: S, ownerClanId: CLAN }),
    };
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.s-a' as RoadEdgeId]: makeRoad('road.s-a', S, ALT_A, { baseDays: 2 }),
      ['road.a-e' as RoadEdgeId]: makeRoad('road.a-e', ALT_A, E, { baseDays: 2 }),
      ['road.s-z' as RoadEdgeId]: makeRoad('road.s-z', S, ALT_Z, { baseDays: 2 }),
      ['road.z-e' as RoadEdgeId]: makeRoad('road.z-e', ALT_Z, E, { baseDays: 2 }),
    };
    const graph = buildMapGraph(castles, districts, roads);
    const state: PathfindingState = {
      castles,
      districts,
      diplomacy: { rows: {}, missions: [], plots: [], pendingProposals: [] },
      time: { day: 0, year: 1560, month: 1, dayOfMonth: 1 },
    };

    const result = computePath(state, graph, { clanId: CLAN, from: S, to: E, speedFactor: 1.0 });

    expect(result.found).toBe(true);
    expect(result.nodes).toEqual([S, ALT_A, E]);
    expect(result.edgeIds).toEqual(['road.s-a', 'road.a-e']);
    expect(result.totalDays).toBe(4);

    // 重複呼叫仍 bit 相同（非隨機亦非 Map 迭代順序敏感）。
    const again = computePath(state, graph, { clanId: CLAN, from: S, to: E, speedFactor: 1.0 });
    expect(again).toEqual(result);
  });
});
