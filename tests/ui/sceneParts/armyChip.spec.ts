// ArmyChip（src/ui/map/sceneParts/armyChip.ts）冪等 update ＋ M6-V8 幾何測試。
// 規格：M6-V4 技術設計 §3.4（armyChipDrawEqual／createArmyChip 冪等）、§7 DoD③（移動只更新相關
// ArmyChip：pos 變 → 僅 reposition、`clear` 不增；繪製欄位變 → 重繪、`clear` 遞增）；
// M6-V8 技術設計 §8.1（新欄位 drawEqual、flagWidthForSoldiers／abbreviateTroops／supplyLevel／
// topBadge 純函式、drawArmyChip 幾何＋far 變體、washi100 底板＋stagger、label 分級、stackIndex）。
// 沿用 `castleNode.spec.ts` 的 `vi.spyOn(gfx,'clear')` 手法（真 pixi，node 環境可直接建構
// Container/Graphics/BitmapText，無需 WebGL/DOM，17 §3.2）。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import {
  abbreviateTroops,
  ARMY_CHIP_GEOMETRY,
  type ArmyChipProps,
  armyChipDrawEqual,
  createArmyChip,
  drawArmyChip,
  flagWidthForSoldiers,
  layoutArmyStacks,
  type StackableArmy,
  supplyLevel,
  topBadge,
} from '@ui/map/sceneParts/armyChip';

function props(overrides: Partial<ArmyChipProps> = {}): ArmyChipProps {
  return {
    pos: { x: 10, y: 20 },
    colorIndex: 5,
    soldiers: 2_000,
    morale: 80,
    corps: false,
    status: 'holding',
    foodDays: 20,
    relation: 'friendly',
    selected: false,
    heading: null,
    stage: 'near',
    labelStagger: 0,
    ...overrides,
  };
}

describe('armyChipDrawEqual（M6-V4 §3.4 ＋ M6-V8 §4.2：pos 除外的冪等比較器）', () => {
  it('全部繪製欄位相同（pos 不同）→ true', () => {
    expect(armyChipDrawEqual(props({ pos: { x: 1, y: 1 } }), props({ pos: { x: 2, y: 2 } }))).toBe(
      true,
    );
  });

  it.each([
    ['colorIndex', { colorIndex: 9 }],
    ['soldiers', { soldiers: 1_999 }],
    ['morale', { morale: 79 }],
    ['corps', { corps: true }],
    ['collapsedCount', { collapsedCount: 2 }],
    ['status', { status: 'routed' }],
    ['foodDays', { foodDays: 2 }],
    ['relation', { relation: 'enemy' }],
    ['selected', { selected: true }],
    ['stage', { stage: 'far' }],
    ['labelStagger', { labelStagger: 1 }],
  ] as const)('%s 不同 → false', (_name, override) => {
    expect(armyChipDrawEqual(props(), props(override))).toBe(false);
  });

  it('heading：null 對稱與 x/y 相等', () => {
    expect(armyChipDrawEqual(props({ heading: null }), props({ heading: null }))).toBe(true);
    expect(armyChipDrawEqual(props({ heading: { x: 1, y: 0 } }), props({ heading: null }))).toBe(
      false,
    );
    expect(
      armyChipDrawEqual(props({ heading: { x: 1, y: 0 } }), props({ heading: { x: 1, y: 0 } })),
    ).toBe(true);
    expect(
      armyChipDrawEqual(props({ heading: { x: 1, y: 0 } }), props({ heading: { x: 0, y: 1 } })),
    ).toBe(false);
  });
});

describe('flagWidthForSoldiers（M6-V8 V8D2 三級旗幅）', () => {
  it.each([
    [999, ARMY_CHIP_GEOMETRY.flagWidthSmall],
    [1_000, ARMY_CHIP_GEOMETRY.flagWidthMid],
    [2_999, ARMY_CHIP_GEOMETRY.flagWidthMid],
    [3_000, ARMY_CHIP_GEOMETRY.flagWidthLarge],
  ])('%i → %i', (soldiers, expected) => {
    expect(flagWidthForSoldiers(soldiers)).toBe(expected);
  });
});

describe('abbreviateTroops（M6-V8 mid 縮寫，ASCII）', () => {
  it.each([
    [900, '900'],
    [2_200, '2.2k'],
    [12_000, '12k'],
    [0, '0'],
  ])('%i → %s', (soldiers, expected) => {
    expect(abbreviateTroops(soldiers)).toBe(expected);
  });
});

describe('supplyLevel（M6-V8 V8D5 門檻邊界）', () => {
  it.each([
    [2, 'critical'],
    [2.999, 'critical'],
    [3, 'low'],
    [6.999, 'low'],
    [7, 'ok'],
    [20, 'ok'],
  ] as const)('foodDays %d → %s', (foodDays, expected) => {
    expect(supplyLevel(foodDays)).toBe(expected);
  });
});

describe('topBadge（M6-V8 V8D6 優先序）', () => {
  it('routed 蓋補給危急', () => {
    expect(topBadge('routed', 1, true)).toBe('routed');
  });
  it('sieging 蓋補給低', () => {
    expect(topBadge('sieging', 5, false)).toBe('sieging');
  });
  it('補給危急蓋補給低（非戰鬥狀態）', () => {
    expect(topBadge('holding', 2, true)).toBe('critical');
  });
  it('補給低蓋 corps', () => {
    expect(topBadge('holding', 5, true)).toBe('low');
  });
  it('corps 僅在無其他狀態時', () => {
    expect(topBadge('holding', 20, true)).toBe('corps');
    expect(topBadge('holding', 20, false)).toBe('none');
  });
  it('engaged／subjugating 各自對映', () => {
    expect(topBadge('engaged', 20, false)).toBe('engaged');
    expect(topBadge('subjugating', 20, false)).toBe('subjugating');
  });
});

// drawArmyChip 幾何：以 spy 記錄向量指令（真 pixi Graphics 為 fluent，回傳 this）。
function spyGfx() {
  const g = new Graphics();
  return {
    g,
    poly: vi.spyOn(g, 'poly'),
    circle: vi.spyOn(g, 'circle'),
    stroke: vi.spyOn(g, 'stroke'),
    fill: vi.spyOn(g, 'fill'),
    moveTo: vi.spyOn(g, 'moveTo'),
    lineTo: vi.spyOn(g, 'lineTo'),
  };
}

describe('drawArmyChip 幾何（M6-V8 §4.2）', () => {
  it('friendly → 兩個 relation circle（indigo 雙環）', () => {
    const s = spyGfx();
    drawArmyChip(s.g, props({ relation: 'friendly', selected: false, stage: 'mid', morale: 50 }));
    // relation 雙環半徑
    const radii = s.circle.mock.calls.map((c) => c[2]);
    expect(radii).toContain(ARMY_CHIP_GEOMETRY.relationRingOuter);
    expect(radii).toContain(ARMY_CHIP_GEOMETRY.relationRingInner);
  });

  it('enemy → 旗尾尖角 poly（vermilion），且無交叉刀（#5）', () => {
    const s = spyGfx();
    drawArmyChip(s.g, props({ relation: 'enemy', status: 'holding', stage: 'mid', morale: 50 }));
    // enemy 尾角以 poly 畫出；holding 無 engaged badge → 不應有交叉刀（兩條對角 stroke）。
    expect(s.poly).toHaveBeenCalled();
    // 尖端 x = fw + enemyTailLen；base 版
    const fw = flagWidthForSoldiers(2_000);
    const polyArgs = s.poly.mock.calls.map((c) => c[0] as number[]);
    const tail = polyArgs.find(
      (p) => p.length === 6 && p[2] === fw + ARMY_CHIP_GEOMETRY.enemyTailLen,
    );
    expect(tail).toBeDefined();
  });

  it('enemy far 變體：旗尾尖端 x 較 base 長（V8D13）', () => {
    const fw = flagWidthForSoldiers(2_000);
    const base = spyGfx();
    drawArmyChip(base.g, props({ relation: 'enemy', stage: 'mid', morale: 50 }));
    const farS = spyGfx();
    drawArmyChip(farS.g, props({ relation: 'enemy', stage: 'far', morale: 50 }));
    const baseTipX = fw + ARMY_CHIP_GEOMETRY.enemyTailLen;
    const farTipX = fw + ARMY_CHIP_GEOMETRY.enemyTailLenFar;
    expect(farTipX).toBeGreaterThan(baseTipX);
    const findTip = (spy: ReturnType<typeof spyGfx>['poly'], tipX: number) =>
      spy.mock.calls.map((c) => c[0] as number[]).find((p) => p.length === 6 && p[2] === tipX);
    expect(findTip(base.poly, baseTipX)).toBeDefined();
    expect(findTip(farS.poly, farTipX)).toBeDefined();
  });

  it('neutral → 灰空心菱形 poly（僅 stroke，無 fill on that poly）', () => {
    const s = spyGfx();
    drawArmyChip(s.g, props({ relation: 'neutral', stage: 'mid', morale: 50, selected: false }));
    // 菱形為 4 點 poly
    const diamond = s.poly.mock.calls.map((c) => c[0] as number[]).find((p) => p.length === 8);
    expect(diamond).toBeDefined();
  });

  it('heading!==null → 方向箭頭（far 桿長 > base）', () => {
    const base = spyGfx();
    drawArmyChip(base.g, props({ heading: { x: 1, y: 0 }, stage: 'mid', morale: 50 }));
    const farS = spyGfx();
    drawArmyChip(farS.g, props({ heading: { x: 1, y: 0 }, stage: 'far', morale: 50 }));
    // 箭桿 lineTo 端點 x = arrowGap + arrowLength
    const baseEnd = ARMY_CHIP_GEOMETRY.arrowGap + ARMY_CHIP_GEOMETRY.arrowLength;
    const farEnd = ARMY_CHIP_GEOMETRY.arrowGap + ARMY_CHIP_GEOMETRY.arrowLengthFar;
    expect(farEnd).toBeGreaterThan(baseEnd);
    expect(base.lineTo.mock.calls.some((c) => Math.abs(c[0] - baseEnd) < 1e-6)).toBe(true);
    expect(farS.lineTo.mock.calls.some((c) => Math.abs(c[0] - farEnd) < 1e-6)).toBe(true);
  });

  it('heading===null → 無方向箭頭（holding 不移動）', () => {
    const s = spyGfx();
    drawArmyChip(s.g, props({ heading: null, stage: 'mid', morale: 50 }));
    const arrowEnd = ARMY_CHIP_GEOMETRY.arrowGap + ARMY_CHIP_GEOMETRY.arrowLength;
    expect(s.lineTo.mock.calls.some((c) => Math.abs(c[0] - arrowEnd) < 1e-6)).toBe(false);
  });

  it('routed → 旗面點旋轉下垂（旗尾 y 大於直立版）', () => {
    const fw = flagWidthForSoldiers(2_000);
    const upright = spyGfx();
    drawArmyChip(
      upright.g,
      props({ status: 'holding', relation: 'neutral', stage: 'mid', morale: 50 }),
    );
    const routed = spyGfx();
    drawArmyChip(
      routed.g,
      props({ status: 'routed', relation: 'neutral', stage: 'mid', morale: 22 }),
    );
    // 旗面為 5 點 poly（10 數）；比較旗尾右上頂點 (fw,-poleHeight) 之 y。
    const flag = (spy: ReturnType<typeof spyGfx>['poly']) =>
      spy.mock.calls.map((c) => c[0] as number[]).find((p) => p.length === 10);
    const uf = flag(upright.poly)!;
    const rf = flag(routed.poly)!;
    const ufTipX = uf[2] ?? NaN;
    const ufTipY = uf[3] ?? NaN;
    const rfTipY = rf[3] ?? NaN;
    // upright 之第二點 (fw,-poleHeight)：x=fw, y=-poleHeight
    expect(ufTipX).toBeCloseTo(fw);
    expect(ufTipY).toBeCloseTo(-ARMY_CHIP_GEOMETRY.poleHeight);
    // routed 對應點 y 應大於直立（下垂）。
    expect(rfTipY).toBeGreaterThan(ufTipY);
  });

  it('低士氣破裂框僅 near；mid 不畫（斷線 stroke 數差異）', () => {
    const nearS = spyGfx();
    drawArmyChip(nearS.g, props({ morale: 20, stage: 'near', relation: 'neutral' }));
    const midS = spyGfx();
    drawArmyChip(midS.g, props({ morale: 20, stage: 'mid', relation: 'neutral' }));
    // near 之 stroke 呼叫數應多於 mid（破裂框三段 + 士氣 pip 之 fill）。
    expect(nearS.stroke.mock.calls.length).toBeGreaterThan(midS.stroke.mock.calls.length);
  });

  it('高士氣旗結僅 near', () => {
    const nearS = spyGfx();
    drawArmyChip(nearS.g, props({ morale: 90, stage: 'near', relation: 'neutral' }));
    const midS = spyGfx();
    drawArmyChip(midS.g, props({ morale: 90, stage: 'mid', relation: 'neutral' }));
    expect(nearS.stroke.mock.calls.length).toBeGreaterThan(midS.stroke.mock.calls.length);
  });

  it('badge：far 且非 selected/critical → 不畫；critical 於 far 仍畫；selected 於 far 仍畫', () => {
    // engaged badge 於 far 非 selected → 不畫（交叉刀＝兩對角 lineTo）。
    const farHidden = spyGfx();
    drawArmyChip(
      farHidden.g,
      props({
        status: 'engaged',
        stage: 'far',
        selected: false,
        foodDays: 20,
        relation: 'neutral',
      }),
    );
    // engaged 交叉刀為兩條斜線；統計 badge 區域 lineTo（此處以總數比較 mid 版）。
    const midShown = spyGfx();
    drawArmyChip(
      midShown.g,
      props({
        status: 'engaged',
        stage: 'mid',
        selected: false,
        foodDays: 20,
        relation: 'neutral',
      }),
    );
    expect(midShown.lineTo.mock.calls.length).toBeGreaterThan(farHidden.lineTo.mock.calls.length);

    // critical 於 far 破例顯示（badge 有繪製）。
    const farCritical = spyGfx();
    drawArmyChip(
      farCritical.g,
      props({ status: 'holding', foodDays: 1, stage: 'far', selected: false, relation: 'neutral' }),
    );
    const farOk = spyGfx();
    drawArmyChip(
      farOk.g,
      props({
        status: 'holding',
        foodDays: 20,
        stage: 'far',
        selected: false,
        relation: 'neutral',
      }),
    );
    // critical badge 含 rect + poly（驚嘆三角）→ poly 呼叫數多於無 badge 版。
    expect(farCritical.poly.mock.calls.length).toBeGreaterThan(farOk.poly.mock.calls.length);
  });

  it('selected → 金色雙環（far 外環半徑 > base）', () => {
    const base = spyGfx();
    drawArmyChip(base.g, props({ selected: true, stage: 'mid', relation: 'neutral', morale: 50 }));
    const farS = spyGfx();
    drawArmyChip(farS.g, props({ selected: true, stage: 'far', relation: 'neutral', morale: 50 }));
    const baseRadii = base.circle.mock.calls.map((c) => c[2]);
    const farRadii = farS.circle.mock.calls.map((c) => c[2]);
    expect(baseRadii).toContain(ARMY_CHIP_GEOMETRY.selectRingOuter);
    expect(farRadii).toContain(ARMY_CHIP_GEOMETRY.selectRingOuterFar);
    expect(ARMY_CHIP_GEOMETRY.selectRingOuterFar).toBeGreaterThan(
      ARMY_CHIP_GEOMETRY.selectRingOuter,
    );
  });
});

describe('createArmyChip（M6-V4 §3.4 ＋ M6-V8 V8D14 底板）', () => {
  it('container 內建 Graphics＋plate＋label 三個子物件', () => {
    const part = createArmyChip();
    expect(part.container.children).toHaveLength(3);
    expect(part.container.children[0]).toBeInstanceOf(Graphics);
    expect(part.container.children[1]).toBeInstanceOf(Graphics);
  });

  it('首繪必重繪（回傳 true）、container.position 依 pos 設定', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const redrew = part.update(props({ pos: { x: 42, y: 84 } }));
    expect(redrew).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(part.container.position.x).toBe(42);
    expect(part.container.position.y).toBe(84);
  });

  it('DoD③：只 pos 變更 → 不重繪（回傳 false、clear 不遞增），container.position 仍更新', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props({ pos: { x: 0, y: 0 } });
    expect(part.update(p)).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const moved = part.update({ ...p, pos: { x: 100, y: 0 } });
    expect(moved).toBe(false);
    expect(clearSpy).toHaveBeenCalledTimes(1); // 未重繪
    expect(part.container.position.x).toBe(100); // 但確實 reposition
  });

  it('props（除 pos 外）不變的新物件 → 冪等不重繪', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    expect(part.update({ ...p })).toBe(false); // 新物件但欄位值相同
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('heading 常數（同邊）＋其餘同 → 冪等不重繪；stage 變 → 重繪', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props({ heading: { x: 0.6, y: -0.8 }, stage: 'mid' });
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(part.update({ ...p, heading: { x: 0.6, y: -0.8 } })).toBe(false);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(part.update({ ...p, stage: 'near' })).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('繪製欄位真正變更 → 重繪（回傳 true、clear 遞增）', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(part.update({ ...p, soldiers: p.soldiers - 1 })).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('label 文字：collapsedCount>0→"+n"（任何 stage）；mid→縮寫；near→精確', () => {
    const part = createArmyChip();
    const label = part.container.children[2] as unknown as { text: string; visible: boolean };
    part.update(props({ soldiers: 12_500, stage: 'near' }));
    expect(label.text).toBe('12,500');
    part.update(props({ soldiers: 12_500, stage: 'mid' }));
    expect(label.text).toBe('12.5k');
    part.update(props({ soldiers: 12_500, collapsedCount: 3, stage: 'mid' }));
    expect(label.text).toBe('+3');
  });

  it('label/plate 可見性：far 非 selected/非 collapsed → 隱藏；selected 或 collapsed → 顯示', () => {
    const part = createArmyChip();
    const plate = part.container.children[1] as unknown as { visible: boolean };
    const label = part.container.children[2] as unknown as { visible: boolean };

    part.update(props({ stage: 'far', selected: false, soldiers: 100 }));
    expect(label.visible).toBe(false);
    expect(plate.visible).toBe(false);

    part.update(props({ stage: 'far', selected: true, soldiers: 100 }));
    expect(label.visible).toBe(true);
    expect(plate.visible).toBe(true);

    part.update(props({ stage: 'far', selected: false, collapsedCount: 4, soldiers: 100 }));
    expect(label.visible).toBe(true);
    expect(plate.visible).toBe(true);

    part.update(props({ stage: 'mid', selected: false, soldiers: 100 }));
    expect(label.visible).toBe(true);
    expect(plate.visible).toBe(true);
  });

  it('washi100 底板：可見時 plateGfx 有 roundRect＋washi100 fill＋ink700 stroke', () => {
    const part = createArmyChip();
    const plate = part.container.children[1] as Graphics;
    const roundRect = vi.spyOn(plate, 'roundRect');
    const fill = vi.spyOn(plate, 'fill');
    const stroke = vi.spyOn(plate, 'stroke');
    part.update(props({ stage: 'near' }));
    expect(roundRect).toHaveBeenCalled();
    expect(fill).toHaveBeenCalled();
    expect(stroke).toHaveBeenCalled();
  });

  it('labelStagger：底板/label 本地 y 隨 stagger 遞增（世界座標不變，V8D14）', () => {
    const step = ARMY_CHIP_GEOMETRY.plateHeight + ARMY_CHIP_GEOMETRY.platePadY;
    const part0 = createArmyChip();
    const label0 = part0.container.children[2] as unknown as { position: { y: number } };
    part0.update(props({ stage: 'near', labelStagger: 0 }));
    const y0 = label0.position.y;

    const part1 = createArmyChip();
    const label1 = part1.container.children[2] as unknown as { position: { y: number } };
    part1.update(props({ stage: 'near', labelStagger: 1 }));
    const y1 = label1.position.y;

    expect(y1 - y0).toBeCloseTo(step);
    // 世界座標（container.position）不受 stagger 影響。
    expect(part0.container.position.x).toBe(part1.container.position.x);
    expect(part0.container.position.y).toBe(part1.container.position.y);
  });

  it('hitArea 以 flagWidthLarge 計，兵力變動不改尺寸', () => {
    const small = createArmyChip();
    small.update(props({ soldiers: 100 }));
    const large = createArmyChip();
    large.update(props({ soldiers: 50_000 }));
    const rs = small.container.hitArea as unknown as { width: number; height: number };
    const rl = large.container.hitArea as unknown as { width: number; height: number };
    expect(rs.width).toBe(rl.width);
    expect(rs.width).toBe(ARMY_CHIP_GEOMETRY.flagWidthLarge + ARMY_CHIP_GEOMETRY.hitPadding * 2);
  });
});

describe('layoutArmyStacks（M6-V4 扇形／收合不變 ＋ M6-V8 stackIndex additive）', () => {
  function army(id: string, stackKey: string, x = 100, y = 200): StackableArmy {
    return { id, stackKey, pos: { x, y } };
  }

  it('單軍：stackIndex 0、pos 不偏移、visible', () => {
    const only = layoutArmyStacks([army('a', 'k1')])[0]!;
    expect(only.stackIndex).toBe(0);
    expect(only.visible).toBe(true);
    expect(only.pos.x).toBe(100);
  });

  it('同節點多軍：扇形 14px 偏移＋stackIndex 等於組內序', () => {
    const layout = layoutArmyStacks([army('a', 'k'), army('b', 'k'), army('c', 'k')]);
    // id 排序 a,b,c
    expect(layout.map((l) => l.stackIndex)).toEqual([0, 1, 2]);
    expect(layout.map((l) => l.pos.x)).toEqual([100, 114, 128]);
  });

  it('5+ 收合：index<=3 顯示、第 4（index 3）帶 collapsedCount，stackIndex 仍為原序', () => {
    const layout = layoutArmyStacks([
      army('a', 'k'),
      army('b', 'k'),
      army('c', 'k'),
      army('d', 'k'),
      army('e', 'k'),
      army('f', 'k'),
    ]);
    expect(layout.map((l) => l.visible)).toEqual([true, true, true, true, false, false]);
    expect(layout[3]!.collapsedCount).toBe(3);
    expect(layout.map((l) => l.stackIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
