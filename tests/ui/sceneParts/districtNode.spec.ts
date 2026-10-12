// DistrictNode（src/ui/map/sceneParts/districtNode.ts）繪製參數測試。
// 規格：plan/12-ui-components.md §3.3.3；18-roadmap.md M2-16（12-T10 部分）；
// M6-V7（docs/design/m6-v7-castles.md §3.2/§8.1，Slice C）：三狀態欄改可選（預設直轄點）、
// `setLodStage` no-op。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import {
  createDistrictNode,
  DISTRICT_NODE_GEOMETRY,
  DISTRICT_NODE_MATERIAL,
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
  it('keeps an interior seal within 40 RGB distance of earth on any opaque RGB substrate', () => {
    const earth = [155, 146, 125];
    const { rec, g } = makeRec();
    drawDistrictNode(g, props());
    const body = rec.argsOf('fill')[1]?.[0] as { color: number; alpha: number };
    expect(body.color).toBe(0x9b927d);
    // All eight RGB-cube extremes bound the convex alpha-composited interior,
    // not antialiased outer edges or other foreground ornaments.
    for (let mask = 0; mask < 8; mask++) {
      const delta = earth.map((channel, i) => {
        const substrate = mask & (1 << i) ? 255 : 0;
        return channel * body.alpha + substrate * (1 - body.alpha) - channel;
      });
      expect(Math.hypot(...delta)).toBeLessThanOrEqual(40);
    }
  });
  it('uses an earth ellipse and a small exact-color owner accent instead of full-clan paint', () => {
    for (const colorIndex of [...Array.from({ length: 40 }, (_, i) => i), null]) {
      const { rec, g } = makeRec();
      drawDistrictNode(g, props({ colorIndex }));
      expect(rec.argsOf('ellipse')).toContainEqual([0, 0, 6, 4]);
      const fills = rec.argsOf('fill').map((args) => args[0] as { color: number });
      expect(
        fills.some(
          (fill) =>
            fill.color ===
            (colorIndex === null ? TOKENS_NUM.neutralClanless : clanColorNum(colorIndex)),
        ),
      ).toBe(false);
      const arcs = rec.argsOf('arc');
      expect(arcs).toContainEqual([0, 0, 4, -Math.PI / 3, Math.PI / 3]);
      const owner = rec
        .argsOf('stroke')
        .map((args) => args[0] as { color: number; width: number; alpha?: number })
        .find((style) => style.width === 1.5);
      expect(owner).toEqual({
        color: colorIndex === null ? TOKENS_NUM.neutralClanless : clanColorNum(colorIndex),
        width: 1.5,
        alpha: 0.9,
      });
    }
  });
  it('先 clear；r6×4 土灰印章、低對比邊與半徑內陰影／西北亮邊', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ colorIndex: 5 }));
    expect(rec.calls[0]?.[0]).toBe('clear');

    expect(rec.argsOf('ellipse')).toEqual([
      [0, 1.5, 5.2, 2.3],
      [0, 0, 6, 4],
      [0, 0, 6, 4],
    ]);
    const shadow = DISTRICT_NODE_MATERIAL.shadow;
    for (let i = 0; i <= 64; i++) {
      const theta = (i * Math.PI) / 32;
      expect(
        Math.hypot(
          shadow.x + shadow.radiusX * Math.cos(theta),
          shadow.y + shadow.radiusY * Math.sin(theta),
        ),
      ).toBeLessThanOrEqual(6);
    }
    expect(rec.argsOf('moveTo')[0]).toEqual([-4.6, -1.6]);
    expect(rec.argsOf('lineTo').slice(0, 2)).toEqual([
      [-3, -2.7],
      [-0.8, -3.4],
    ]);

    const fills = rec.argsOf('fill');
    const bodyFill = fills[1]?.[0] as { color: number; alpha: number };
    expect(bodyFill).toEqual({ color: 0x9b927d, alpha: 0.86 });

    const strokes = rec.argsOf('stroke');
    const bodyStroke = strokes[0]?.[0] as { width: number; color: number };
    expect(bodyStroke.width).toBe(0.6);
    expect(bodyStroke.color).toBe(TOKENS_NUM.ink700);
  });

  it('無主郡（colorIndex=null）保留 neutralClanless 小弧而非滿版填色', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ colorIndex: null }));
    const ownerStroke = rec.argsOf('stroke')[2]?.[0] as { color: number };
    expect(ownerStroke.color).toBe(TOKENS_NUM.neutralClanless);
  });

  it('直轄郡（hasSteward=false）：中心 ink900 實心點（fill，非 stroke）', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ hasSteward: false }));
    const fills = rec.argsOf('fill');
    // 陰影、本體之後的中心實心點。
    const dotFill = fills.at(-1)?.[0] as { color: number };
    expect(dotFill.color).toBe(TOKENS_NUM.ink900);
    const dotCircle = rec.argsOf('circle')[0] as number[];
    expect(dotCircle[2]).toBeCloseTo(DISTRICT_NODE_GEOMETRY.centerDotDiameter / 2, 10);
  });

  it('知行郡（hasSteward=true）：中心 washi100 空心點（stroke，不 fill 該點）', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ hasSteward: true }));
    // 中心點只有額外 stroke；兩個 fill 是陰影與本體。
    expect(rec.countOf('fill')).toBe(2);
    const strokes = rec.argsOf('stroke');
    expect(strokes).toHaveLength(4);
    const dotStroke = strokes.at(-1)?.[0] as { color: number };
    expect(dotStroke.color).toBe(TOKENS_NUM.washi100);
  });

  it('制壓中：外圈進度弧半徑 10、線寬 2、vermilionBright、掃角=progress/100×360°', () => {
    const { rec, g } = makeRec();
    drawDistrictNode(g, props({ subjugationProgress: 40 }));
    const arcs = rec.argsOf('arc').filter((args) => args[2] === 10);
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
    expect(rec.argsOf('arc').filter((args) => args[2] === 10)).toHaveLength(0);
  });

  it('owner accent never changes clamped subjugation sweep, center or exact uprising triangle', () => {
    for (const progress of [-10, 0, 25, 100, 120])
      for (const hasSteward of [false, true]) {
        const { rec, g } = makeRec();
        drawDistrictNode(
          g,
          props({ colorIndex: 39, subjugationProgress: progress, hasSteward, ikkiActive: true }),
        );
        const arcs = rec.argsOf('arc').filter((args) => args[2] === 10);
        expect(arcs).toHaveLength(1);
        expect(arcs[0]).toEqual([
          0,
          0,
          10,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.max(0, Math.min(100, progress)) / 100) * 2 * Math.PI,
        ]);
        expect(rec.argsOf('circle')).toEqual([[0, 0, 1.25]]);
        expect(rec.argsOf('poly')).toEqual([[[0, -11, 3, -5, -3, -5]]]);
        expect(rec.argsOf('fill').at(-1)).toEqual([{ color: TOKENS_NUM.accentVermilionBright }]);
      }
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

describe('drawDistrictNode（M6-V7 AD1：可選狀態欄未提供時之預設）', () => {
  it('三欄皆未提供 → 視同直轄點（ink900 實心點）、無制壓弧、無一揆三角', () => {
    const { rec, g } = makeRec();
    const minimal: DistrictNodeProps = { pos: { x: 0, y: 0 }, colorIndex: 3 };
    drawDistrictNode(g, minimal);

    // 陰影／本體／中心點 fill；邊／亮邊／勢力弧 stroke（無制壓弧）。
    expect(rec.countOf('fill')).toBe(3);
    expect(rec.countOf('stroke')).toBe(3);
    expect(rec.argsOf('arc').filter((args) => args[2] === 10)).toHaveLength(0);
    expect(rec.countOf('poly')).toBe(0);
    const dotFill = rec.argsOf('fill').at(-1)?.[0] as { color: number };
    expect(dotFill.color).toBe(TOKENS_NUM.ink900);
  });

  it('未提供欄位與顯式預設值（false/null/false）產生相同繪製指令序', () => {
    const withDefaults = makeRec();
    const explicit = makeRec();
    const base = { pos: { x: 0, y: 0 }, colorIndex: 7 };
    drawDistrictNode(withDefaults.g, base);
    drawDistrictNode(
      explicit.g,
      props({ ...base, hasSteward: false, subjugationProgress: null, ikkiActive: false }),
    );
    expect(withDefaults.rec.calls).toEqual(explicit.rec.calls);
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

  it('warning phase changes only the triangle visibility, never redraws the ground seal', () => {
    const part = createDistrictNode();
    const ground = part.container.children[0] as Graphics;
    const groundClear = vi.spyOn(ground, 'clear');
    part.update(props({ ikkiActive: true }));
    const warning = part.container.children[1] as Graphics;
    expect(warning.visible).toBe(true);
    const paints = groundClear.mock.calls.length;
    part.setWarningVisible(false);
    expect(warning.visible).toBe(false);
    part.setWarningVisible(true);
    expect(warning.visible).toBe(true);
    expect(groundClear).toHaveBeenCalledTimes(paints);
    part.update(props({ ikkiActive: false }));
    expect(part.container.children).toHaveLength(1);
    expect(warning.destroyed).toBe(true);
    part.setWarningVisible(false);
    part.setWarningVisible(true);
    expect(part.container.children).toHaveLength(1);
  });

  it('destroy() 冪等且銷毀 container', () => {
    const part = createDistrictNode();
    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(() => part.destroy()).not.toThrow();
  });

  it('setLodStage() no-op：不 throw、不影響 container/繪製狀態', () => {
    const part = createDistrictNode();
    part.update(props());
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');
    expect(() => part.setLodStage('far')).not.toThrow();
    expect(() => part.setLodStage('mid')).not.toThrow();
    expect(() => part.setLodStage('near')).not.toThrow();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(part.container.visible).toBe(true);
  });
});
