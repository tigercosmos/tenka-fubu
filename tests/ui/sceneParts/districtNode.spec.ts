// DistrictNode（src/ui/map/sceneParts/districtNode.ts）繪製參數測試。
// 規格：plan/12-ui-components.md §3.3.3；18-roadmap.md M2-16（12-T10 部分）。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import {
  createDistrictNode,
  DISTRICT_NODE_GEOMETRY,
  drawDistrictNode,
  type DistrictNodeProps,
} from '@ui/map/sceneParts/districtNode';
import { makeRec } from './recordingGraphics';

function props(overrides: Partial<DistrictNodeProps> = {}): DistrictNodeProps {
  return {
    pos: { x: 10, y: 20 },
    colorIndex: 5,
    hasSteward: false,
    subjugationProgress: null,
    ikkiActive: false,
    ...overrides,
  };
}

describe('drawDistrictNode（12 §3.3.3）', () => {
  it('先 clear；本體圓形半徑 7、填色 70% 透明度、描邊 1px ink700', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ colorIndex: 5 }));
    expect(rec.calls[0]?.[0]).toBe('clear');

    const circles = rec.argsOf('circle');
    const bodyCircle = circles[0] as number[]; // circle(x,y,radius) 三個純量引數
    expect(bodyCircle).toEqual([0, 0, DISTRICT_NODE_GEOMETRY.radius]);

    const fills = rec.argsOf('fill');
    const bodyFill = fills[0]?.[0] as { color: number; alpha: number };
    expect(bodyFill.color).toBe(clanColorNum(5));
    expect(bodyFill.alpha).toBe(DISTRICT_NODE_GEOMETRY.fillAlpha);

    const strokes = rec.argsOf('stroke');
    const bodyStroke = strokes[0]?.[0] as { width: number; color: number };
    expect(bodyStroke.width).toBe(DISTRICT_NODE_GEOMETRY.strokeWidth);
    expect(bodyStroke.color).toBe(TOKENS_NUM.ink700);
  });

  it('無主郡（colorIndex=null）填 neutralClanless', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ colorIndex: null }));
    const bodyFill = rec.argsOf('fill')[0]?.[0] as { color: number };
    expect(bodyFill.color).toBe(TOKENS_NUM.neutralClanless);
  });

  it('直轄郡（hasSteward=false）：中心 ink900 實心點（fill，非 stroke）', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ hasSteward: false }));
    const fills = rec.argsOf('fill');
    // fills[0]=本體填色；fills[1]=中心實心點。
    const dotFill = fills[1]?.[0] as { color: number };
    expect(dotFill.color).toBe(TOKENS_NUM.ink900);
    // circles: [0]=本體填色前 circle、[1]=本體描邊前 circle、[2]=中心點。
    const dotCircle = rec.argsOf('circle')[2] as number[];
    expect(dotCircle[2]).toBeCloseTo(DISTRICT_NODE_GEOMETRY.centerDotDiameter / 2, 10);
  });

  it('知行郡（hasSteward=true）：中心 washi100 空心點（stroke，不 fill 該點）', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ hasSteward: true }));
    // 中心點應只有 1 個額外 stroke（本體描邊 + 中心點描邊 = 2），fill 只有本體 1 次。
    expect(rec.countOf('fill')).toBe(1);
    const strokes = rec.argsOf('stroke');
    expect(strokes).toHaveLength(2);
    const dotStroke = strokes[1]?.[0] as { color: number };
    expect(dotStroke.color).toBe(TOKENS_NUM.washi100);
  });

  it('制壓中：外圈進度弧半徑 10、線寬 2、vermilionBright、掃角=progress/100×360°', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ subjugationProgress: 40 }));
    const arcs = rec.argsOf('arc');
    expect(arcs).toHaveLength(1);
    const [cx, cy, radius, startAngle, endAngle] = arcs[0] as number[];
    expect([cx, cy, radius]).toEqual([0, 0, DISTRICT_NODE_GEOMETRY.subjugationRingRadius]);
    expect(startAngle).toBeCloseTo(-Math.PI / 2, 10);
    expect(endAngle).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI * 0.4, 10);

    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as { width: number; color: number };
    expect(arcStroke.width).toBe(DISTRICT_NODE_GEOMETRY.subjugationRingWidth);
    expect(arcStroke.color).toBe(TOKENS_NUM.accentVermilionBright);
  });

  it('非制壓中（subjugationProgress=null）不畫進度弧', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ subjugationProgress: null }));
    expect(rec.countOf('arc')).toBe(0);
  });

  it('一揆中：節點上方畫 6px 朱紅三角警示', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ ikkiActive: true }));
    const polys = rec.argsOf('poly');
    expect(polys).toHaveLength(1);
    const pts = polys[0]?.[0] as number[];
    // 三角形頂點 y 最小值（頂點）應在節點中心上方（負值），底邊在其下方。
    const ys = pts.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeLessThan(0);
    const fillColor = (rec.argsOf('fill').at(-1)?.[0] as { color: number }).color;
    expect(fillColor).toBe(TOKENS_NUM.accentVermilionBright);
  });

  it('非一揆中不畫警示三角', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ ikkiActive: false }));
    expect(rec.countOf('poly')).toBe(0);
  });
});

describe('createDistrictNode（12 §4 ScenePart 工廠）', () => {
  it('container 內建一個 Graphics 子物件；update() 設定 position', () => {
    const part = createDistrictNode();
    expect(part.container.children).toHaveLength(1);
    part.update(props({ pos: { x: 7, y: 9 } }));
    expect(part.container.position.x).toBe(7);
    expect(part.container.position.y).toBe(9);
  });

  it('update() 冪等：props 不變不重繪', () => {
    const part = createDistrictNode();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...p });
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...p, ikkiActive: true });
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('destroy() 冪等且銷毀 container', () => {
    const part = createDistrictNode();
    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(() => part.destroy()).not.toThrow();
  });
});
