// CastleNode（src/ui/map/sceneParts/castleNode.ts）繪製參數測試。
// 規格：plan/12-ui-components.md §3.3.2、§5.6；18-roadmap.md M2-16（12-T10 部分）。
// 驗收精神：「12-T10 繪製參數逐項相符（尺寸、色…）；耐久環三段變色門檻正確」。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import {
  CASTLE_NODE_GEOMETRY,
  createCastleNode,
  drawCastleNode,
  type CastleNodeProps,
} from '@ui/map/sceneParts/castleNode';
import { boundingBoxOf, makeRec } from './recordingGraphics';

function props(overrides: Partial<CastleNodeProps> = {}): CastleNodeProps {
  return {
    pos: { x: 100, y: 200 },
    tier: 'main',
    colorIndex: 5,
    durability: 3000,
    maxDurability: 3000,
    ...overrides,
  };
}

describe('drawCastleNode（12 §3.3.2）', () => {
  it('先 clear', () => {
    const { rec, g } = makeRec();
    drawCastleNode(g, props());
    expect(rec.calls[0]?.[0]).toBe('clear');
  });

  it('本城剪影外接盒 28×28、填城主勢力色、描邊 2px ink900', () => {
    const { rec, g } = makeRec();
    drawCastleNode(g, props({ tier: 'main', colorIndex: 5 }));

    const polys = rec.argsOf('poly');
    expect(polys).toHaveLength(2); // 填色 + 描邊，同一組頂點
    const box = boundingBoxOf(polys[0]?.[0] as number[]);
    expect(box.width).toBeCloseTo(CASTLE_NODE_GEOMETRY.mainSize, 5);
    expect(box.height).toBeCloseTo(CASTLE_NODE_GEOMETRY.mainSize, 5);

    const fills = rec.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fills).toContain(clanColorNum(5));

    const strokes = rec.argsOf('stroke');
    const bodyStroke = strokes[0]?.[0] as { width: number; color: number };
    expect(bodyStroke.width).toBe(CASTLE_NODE_GEOMETRY.strokeWidth);
    expect(bodyStroke.color).toBe(TOKENS_NUM.ink900);
  });

  it('支城剪影外接盒 20×20（頂點數少於本城，單層 vs 雙層）', () => {
    const { rec, g } = makeRec();
    drawCastleNode(g, props({ tier: 'branch', colorIndex: 10 }));

    const polys = rec.argsOf('poly');
    const mainPts = polys[0]?.[0] as number[];
    const box = boundingBoxOf(mainPts);
    expect(box.width).toBeCloseTo(CASTLE_NODE_GEOMETRY.branchSize, 5);
    expect(box.height).toBeCloseTo(CASTLE_NODE_GEOMETRY.branchSize, 5);
    expect(mainPts.length / 2).toBeLessThan(9); // 支城（單層，5 頂點）< 本城（雙層，9 頂點）

    const fills = rec.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fills).toContain(clanColorNum(10));
  });

  it('耐久環：半徑本城 20／支城 15、線寬 3、起角 -90°、掃角=ratio×360°、底環 ink300 25% 透明度', () => {
    const { rec: recMain, g: gMain } = makeRec();
    drawCastleNode(gMain, props({ tier: 'main', durability: 1500, maxDurability: 3000 }));
    const circlesMain = recMain.argsOf('circle');
    // 耐久環底環為 circle+stroke（半徑=ringRadiusMain）；circle(x,y,radius) 三個純量引數。
    expect(
      circlesMain.some((a) => (a as number[])[2] === CASTLE_NODE_GEOMETRY.ringRadiusMain),
    ).toBe(true);
    const ringStrokes = recMain.argsOf('stroke').slice(1); // [0]=剪影描邊
    const baseRingStroke = ringStrokes[0]?.[0] as { width: number; color: number; alpha: number };
    expect(baseRingStroke.width).toBe(CASTLE_NODE_GEOMETRY.ringWidth);
    expect(baseRingStroke.color).toBe(TOKENS_NUM.ink300);
    expect(baseRingStroke.alpha).toBe(0.25);

    const arcsMain = recMain.argsOf('arc');
    expect(arcsMain).toHaveLength(1);
    const [cx, cy, radius, startAngle, endAngle] = arcsMain[0] as number[];
    expect([cx, cy, radius]).toEqual([0, 0, CASTLE_NODE_GEOMETRY.ringRadiusMain]);
    expect(startAngle).toBeCloseTo(-Math.PI / 2, 10);
    expect(endAngle).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI * 0.5, 10); // ratio=1500/3000=0.5

    const { rec: recBranch, g: gBranch } = makeRec();
    drawCastleNode(gBranch, props({ tier: 'branch' }));
    const circlesBranch = recBranch.argsOf('circle');
    expect(
      circlesBranch.some((a) => (a as number[])[2] === CASTLE_NODE_GEOMETRY.ringRadiusBranch),
    ).toBe(true);
  });

  it('耐久環三段變色門檻：> durabilityRingWarn(0.6) 用 mossBright', () => {
    const { rec, g } = makeRec();
    drawCastleNode(g, props({ durability: 2701, maxDurability: 3000 })); // ratio ≈ 0.9003 > 0.6
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as { color: number };
    expect(arcStroke.color).toBe(TOKENS_NUM.accentMossBright);
  });

  it('耐久環三段變色門檻：durabilityRingDanger(0.3) < ratio ≤ 0.6 用 gold', () => {
    const { rec, g } = makeRec();
    drawCastleNode(g, props({ durability: 1500, maxDurability: 3000 })); // ratio=0.5
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as { color: number };
    expect(arcStroke.color).toBe(TOKENS_NUM.accentGold);
  });

  it('耐久環三段變色門檻：ratio ≤ durabilityRingDanger(0.3) 用 vermilionBright', () => {
    const { rec, g } = makeRec();
    drawCastleNode(g, props({ durability: 600, maxDurability: 3000 })); // ratio=0.2
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as { color: number };
    expect(arcStroke.color).toBe(TOKENS_NUM.accentVermilionBright);
  });

  it('門檻邊界值：ratio 恰為 UI.durabilityRingWarn 時不算「>」，落到 gold 段', () => {
    const { rec, g } = makeRec();
    const durability = Math.round(3000 * UI.durabilityRingWarn);
    drawCastleNode(g, props({ durability, maxDurability: 3000 }));
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as { color: number };
    expect(arcStroke.color).toBe(TOKENS_NUM.accentGold);
  });

  it('maxDurability=0（防禦）不 throw、ratio 視為 0（掃角=0、色=vermilionBright）', () => {
    const { rec, g } = makeRec();
    expect(() => drawCastleNode(g, props({ durability: 0, maxDurability: 0 }))).not.toThrow();
    const [, , , startAngle, endAngle] = rec.argsOf('arc')[0] as number[];
    expect(startAngle).toBeCloseTo(-Math.PI / 2, 10);
    expect(endAngle).toBeCloseTo(-Math.PI / 2, 10); // ratio=0 → 掃角=0，終角=起角
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as { color: number };
    expect(arcStroke.color).toBe(TOKENS_NUM.accentVermilionBright);
  });
});

describe('createCastleNode（12 §4 ScenePart 工廠）', () => {
  it('container 內建一個 Graphics 子物件，初始未繪製', () => {
    const part = createCastleNode();
    expect(part.container.children).toHaveLength(1);
    expect(part.container.children[0]).toBeInstanceOf(Graphics);
  });

  it('update() 依 props.pos 設定 container.position', () => {
    const part = createCastleNode();
    part.update(props({ pos: { x: 42, y: 84 } }));
    expect(part.container.position.x).toBe(42);
    expect(part.container.position.y).toBe(84);
  });

  it('update() 冪等：props 不變時不重繪（12 §4「只在 props 變更時改繪」）', () => {
    const part = createCastleNode();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    part.update({ ...p }); // 新物件但欄位值相同
    expect(clearSpy).toHaveBeenCalledTimes(1); // 未重繪

    part.update({ ...p, durability: p.durability - 1 }); // 真正變更
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('destroy() 銷毀 container 與其子 Graphics，且可重複呼叫', () => {
    const part = createCastleNode();
    const gfx = part.container.children[0] as Graphics;
    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(gfx.destroyed).toBe(true);
    expect(() => part.destroy()).not.toThrow();
  });
});
