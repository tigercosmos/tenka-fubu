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
import {
  armyStackKey,
  armyWorldPos,
  buildNameplateSig,
  buildNodeSig,
  buildOwnerByNode,
  diffNameplateSig,
  diffNodeSig,
  diffOwnerByNode,
  type NameplateSigView,
  type NodeSigView,
} from '@ui/map/dirty';

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

// ── M6-V7（CD1／§3.5）：節點視覺簽章 diff（buildNodeSig／diffNodeSig） ──────────────────

function sigView(overrides: Partial<NodeSigView> = {}): NodeSigView {
  return {
    castles: [
      {
        id: 'castle.aa',
        ownerClanId: 'clan.oda',
        durability: 1000,
        maxDurability: 1000,
        tier: 'main',
        warning: 'none',
        terrainKind: 'plain',
      },
    ],
    districtOwner: { 'dist.xx': 'clan.oda' },
    ...overrides,
  };
}

describe('buildNodeSig（M6-V7 §3.5）：城/郡視覺簽章', () => {
  it('城簽章含 owner/durability/maxDurability/warning/terrainKind/tier；郡簽章含 owner/steward/subj/ikki', () => {
    const sig = buildNodeSig(
      sigView({
        districts: [
          { id: 'dist.xx', hasSteward: true, subjugationProgress: 40, ikkiActive: false },
        ],
      }),
    );
    expect(sig.get('castle.aa')).toBe('c|clan.oda|1000/1000|none|plain|main');
    expect(sig.get('dist.xx')).toBe('d|clan.oda|true|40|false');
  });

  it('郡無 districts[] 對映 → 次級狀態預設（直轄/無制壓/非一揆）；無主 owner→空字串', () => {
    const sig = buildNodeSig(sigView({ districtOwner: { 'dist.xx': null } }));
    expect(sig.get('dist.xx')).toBe('d||false||false');
  });

  it('owner/durability/warning/terrainKind 任一變 → 城簽章改變（各為獨立欄位）', () => {
    const base = buildNodeSig(sigView()).get('castle.aa');
    expect(
      buildNodeSig(sigView({ castles: [{ ...sigView().castles[0]!, ownerClanId: 'clan.x' }] })).get(
        'castle.aa',
      ),
    ).not.toBe(base);
    expect(
      buildNodeSig(sigView({ castles: [{ ...sigView().castles[0]!, durability: 500 }] })).get(
        'castle.aa',
      ),
    ).not.toBe(base);
    expect(
      buildNodeSig(sigView({ castles: [{ ...sigView().castles[0]!, warning: 'critical' }] })).get(
        'castle.aa',
      ),
    ).not.toBe(base);
    expect(
      buildNodeSig(
        sigView({ castles: [{ ...sigView().castles[0]!, terrainKind: 'mountain' }] }),
      ).get('castle.aa'),
    ).not.toBe(base);
  });
});

describe('diffNodeSig（M6-V7 §3.5）：簽章 diff 成員集', () => {
  it('prev===null → 回傳全部 id（首繪保證，比照 diffOwnerByNode）', () => {
    const next = buildNodeSig(sigView());
    expect([...diffNodeSig(null, next)].sort()).toEqual(['castle.aa', 'dist.xx']);
  });

  it('day-only（簽章不含 day）：同一 view 兩次簽章 → 空集合', () => {
    const prev = buildNodeSig(sigView());
    const next = buildNodeSig(sigView()); // day 不入簽章，故完全相同
    expect(diffNodeSig(prev, next).size).toBe(0);
  });

  it('僅耐久變 → 該城 dirty、其餘不列入', () => {
    const prev = buildNodeSig(sigView());
    const next = buildNodeSig(
      sigView({ castles: [{ ...sigView().castles[0]!, durability: 300 }] }),
    );
    expect([...diffNodeSig(prev, next)]).toEqual(['castle.aa']);
  });

  it('僅 warning 變（terrainKind/owner 不變）→ 該城 dirty', () => {
    const prev = buildNodeSig(sigView());
    const next = buildNodeSig(
      sigView({ castles: [{ ...sigView().castles[0]!, warning: 'threatened' }] }),
    );
    expect([...diffNodeSig(prev, next)]).toEqual(['castle.aa']);
  });

  it('郡 owner 無主化 → 該郡 dirty', () => {
    const prev = buildNodeSig(sigView());
    const next = buildNodeSig(sigView({ districtOwner: { 'dist.xx': null } }));
    expect([...diffNodeSig(prev, next)]).toEqual(['dist.xx']);
  });
});

// ── M6-V9b（§2.9，DD-A0／評審 Blocker 1）：名牌專屬簽章（buildNameplateSig／diffNameplateSig）──
//
// 名牌簽章與 node 簽章完全分離：含 soldiers/relation/isPlayer/name（node 簽章所無），
// 「只兵數變」的 tick 只命中名牌 diff、node 簽章不變（rebuildCounts.nodeMarkers 零污染）。

function nameplateView(over: Partial<NameplateSigView['castles'][number]> = {}): NameplateSigView {
  return {
    castles: [
      {
        id: 'castle.aa',
        ownerClanId: 'clan.oda',
        tier: 'main',
        warning: 'none',
        soldiers: 2_000,
        relation: 'friendly',
        isPlayer: true,
        ...over,
      },
    ],
  };
}

const NAMES = { 'castle.aa': '甲城' } as const;

describe('buildNameplateSig（M6-V9b §2.9）：名牌視覺簽章', () => {
  it('簽章＝n|owner|tier|name|warning|relation|isPlayer|soldiers（含 soldiers——node 簽章所無）', () => {
    const sig = buildNameplateSig(nameplateView(), NAMES);
    expect(sig.get('castle.aa')).toBe('n|clan.oda|main|甲城|none|friendly|true|2000');
  });

  it('缺名以空字串入章（names 省略/查無皆同）', () => {
    expect(buildNameplateSig(nameplateView()).get('castle.aa')).toBe(
      'n|clan.oda|main||none|friendly|true|2000',
    );
  });

  it('owner/tier/warning/relation/isPlayer/soldiers 任一變 → 簽章改變（各為獨立欄位）', () => {
    const base = buildNameplateSig(nameplateView(), NAMES).get('castle.aa');
    const variants: Partial<NameplateSigView['castles'][number]>[] = [
      { ownerClanId: 'clan.x' },
      { tier: 'branch' },
      { warning: 'critical' },
      { relation: 'enemy' },
      { isPlayer: false },
      { soldiers: 1_999 },
    ];
    for (const over of variants) {
      expect(buildNameplateSig(nameplateView(over), NAMES).get('castle.aa')).not.toBe(base);
    }
  });

  it('pos 不入簽章（NameplateSigView 無 pos 欄；移動另判 reposition）——同 view 兩次簽章恆等', () => {
    const a = buildNameplateSig(nameplateView(), NAMES);
    const b = buildNameplateSig(nameplateView(), NAMES);
    expect(a).toEqual(b);
  });
});

describe('diffNameplateSig（M6-V9b §2.9）：簽章 diff 成員集', () => {
  it('prev===null → 全部 dirty（首繪保證，比照 diffNodeSig）', () => {
    const next = buildNameplateSig(nameplateView(), NAMES);
    expect([...diffNameplateSig(null, next)]).toEqual(['castle.aa']);
  });

  it('只兵數變 → 該城即命中（Blocker 1 核心：名牌不騎 node 簽章）', () => {
    const prev = buildNameplateSig(nameplateView(), NAMES);
    const next = buildNameplateSig(nameplateView({ soldiers: 1_500 }), NAMES);
    expect([...diffNameplateSig(prev, next)]).toEqual(['castle.aa']);
    // 對照：同一變更之 node 簽章不變（soldiers 不在 node 簽章內）。
    const nodePrev = buildNodeSig(sigView());
    expect(diffNodeSig(nodePrev, buildNodeSig(sigView())).size).toBe(0);
  });

  it('day-only／無變更 → 空集合（簽章不含 day）', () => {
    const prev = buildNameplateSig(nameplateView(), NAMES);
    const next = buildNameplateSig(nameplateView(), NAMES);
    expect(diffNameplateSig(prev, next).size).toBe(0);
  });
});
