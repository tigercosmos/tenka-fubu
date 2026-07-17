// CastleNode（src/ui/map/sceneParts/castleNode.ts）繪製參數測試（M6-V7 Slice B）。
// 規格：docs/design/m6-v7-castles.md §6.1／§8.1、plan/12-ui-components.md §3.3.2／§5.6。
// 驗收精神：四型剪影外接盒與型別特徵；耐久環三段門檻；警戒／受攻徽記；三子 Graphics
// 分離＋setLodStage 顯隱／far 本城 bodyGfx ×1.4；update 冪等且回傳 void（AD2）。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { clanColorNum, MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import {
  CASTLE_NODE_GEOMETRY,
  createCastleNode,
  drawCastleBody,
  drawCastleWarning,
  drawDurabilityRing,
  durabilityRingColor,
  type CastleNodeProps,
} from '@ui/map/sceneParts/castleNode';
import { boundingBoxOf, makeRec } from './recordingGraphics';

function props(overrides: Partial<CastleNodeProps> = {}): CastleNodeProps {
  return {
    pos: { x: 100, y: 200 },
    tier: 'main',
    terrainKind: 'plain',
    colorIndex: 5,
    durability: 3000,
    maxDurability: 3000,
    warning: 'none',
    ...overrides,
  };
}

type FillArg = { color: number; alpha?: number };
type StrokeArg = { width: number; color: number; alpha?: number };

describe('drawCastleBody（M6-V7 §6.1 四型剪影）', () => {
  it('先 clear', () => {
    const { rec, g } = makeRec();
    drawCastleBody(g, props());
    expect(rec.calls[0]?.[0]).toBe('clear');
  });

  it('四型外郭外接盒寬 ≈ S（本城 28／支城 20）', () => {
    const cases: Array<[CastleNodeProps['tier'], CastleNodeProps['terrainKind'], number]> = [
      ['main', 'plain', CASTLE_NODE_GEOMETRY.mainSize],
      ['main', 'mountain', CASTLE_NODE_GEOMETRY.mainSize],
      ['branch', 'plain', CASTLE_NODE_GEOMETRY.branchSize],
      ['branch', 'mountain', CASTLE_NODE_GEOMETRY.branchSize],
    ];
    for (const [tier, terrainKind, s] of cases) {
      const { rec, g } = makeRec();
      drawCastleBody(g, props({ tier, terrainKind }));
      const polys = rec.argsOf('poly').map((a) => a[0] as number[]);
      const maxWidth = Math.max(...polys.map((p) => boundingBoxOf(p).width));
      expect(maxWidth).toBeGreaterThanOrEqual(s * 0.9);
      expect(maxWidth).toBeLessThanOrEqual(s + 0.001);
    }
  });

  it('填城主勢力色＋亮變體（本城內主郭）、描邊 2px ink900、右下投影 ink900 α shadowAlpha', () => {
    const { rec, g } = makeRec();
    drawCastleBody(g, props({ tier: 'main', terrainKind: 'plain', colorIndex: 5 }));
    const fills = rec.argsOf('fill').map((a) => a[0] as FillArg);
    expect(fills.map((f) => f.color)).toContain(clanColorNum(5));
    expect(fills.map((f) => f.color)).toContain(clanColorNum(5, true)); // 二階內主郭亮變體
    expect(
      fills.some(
        (f) => f.color === TOKENS_NUM.ink900 && f.alpha === CASTLE_NODE_GEOMETRY.shadowAlpha,
      ),
    ).toBe(true);
    const strokes = rec.argsOf('stroke').map((a) => a[0] as StrokeArg);
    const bodyStroke = strokes.find((s) => s.color === TOKENS_NUM.ink900);
    expect(bodyStroke?.width).toBe(CASTLE_NODE_GEOMETRY.strokeWidth);
  });

  it('平城·本城：兩枚護城河短弧（waterRiver α .5），且本城多邊形數 > 支城（二階內主郭）', () => {
    const { rec: recMain, g: gMain } = makeRec();
    drawCastleBody(gMain, props({ tier: 'main', terrainKind: 'plain' }));
    const arcs = recMain.argsOf('arc');
    expect(arcs).toHaveLength(2);
    const moatStroke = recMain
      .argsOf('stroke')
      .map((a) => a[0] as StrokeArg)
      .find((s) => s.color === MAP_PALETTE_NUM.waterRiver);
    expect(moatStroke?.alpha).toBe(CASTLE_NODE_GEOMETRY.moatArcAlpha);
    // 本城含 mainKeepPoints（9 頂點＝18 座標）之二階內主郭；支城無。
    const mainPolys = recMain.argsOf('poly').map((a) => a[0] as number[]);
    expect(mainPolys.some((p) => p.length === 18)).toBe(true);

    const { rec: recBranch, g: gBranch } = makeRec();
    drawCastleBody(gBranch, props({ tier: 'branch', terrainKind: 'plain' }));
    const branchPolys = recBranch.argsOf('poly').map((a) => a[0] as number[]);
    expect(branchPolys.some((p) => p.length === 18)).toBe(false);
    expect(branchPolys.length).toBeLessThan(mainPolys.length);
  });

  it('山城：三角岩基（reliefInk α .9，含上尖 apex）、無護城河弧', () => {
    const { rec, g } = makeRec();
    drawCastleBody(g, props({ tier: 'main', terrainKind: 'mountain' }));
    expect(rec.argsOf('arc')).toHaveLength(0); // 山城無護城河
    const fills = rec.argsOf('fill').map((a) => a[0] as FillArg);
    const rockFill = fills.find((f) => f.color === MAP_PALETTE_NUM.reliefInk);
    expect(rockFill?.alpha).toBe(CASTLE_NODE_GEOMETRY.mountainBaseAlpha);
    // 岩基三角：3 頂點（6 座標），apex 為最上（最小 y）之單一頂點。
    const triangles = rec.argsOf('poly').filter((a) => (a[0] as number[]).length === 6);
    expect(triangles.length).toBeGreaterThanOrEqual(1);
    const tri = triangles[0]![0] as number[];
    const ys = [tri[1]!, tri[3]!, tri[5]!];
    const apexY = Math.min(...ys);
    expect(ys.filter((y) => y === apexY)).toHaveLength(1); // 單一上尖 apex
  });
});

describe('drawDurabilityRing／durabilityRingColor（12 §5.6）', () => {
  it('先 clear；底環 ink300 α .25、比例弧起角 -90°、掃角=ratio×360°', () => {
    const { rec, g } = makeRec();
    drawDurabilityRing(g, CASTLE_NODE_GEOMETRY.ringRadiusMain, 0.5);
    expect(rec.calls[0]?.[0]).toBe('clear');
    const circle = rec.argsOf('circle')[0] as number[];
    expect(circle[2]).toBe(CASTLE_NODE_GEOMETRY.ringRadiusMain);
    const baseStroke = rec.argsOf('stroke')[0]?.[0] as StrokeArg;
    expect(baseStroke.width).toBe(CASTLE_NODE_GEOMETRY.ringWidth);
    expect(baseStroke.color).toBe(TOKENS_NUM.ink300);
    expect(baseStroke.alpha).toBe(CASTLE_NODE_GEOMETRY.ringBaseAlpha);
    const arc = rec.argsOf('arc')[0] as number[];
    expect(arc[2]).toBe(CASTLE_NODE_GEOMETRY.ringRadiusMain);
    expect(arc[3]).toBeCloseTo(-Math.PI / 2, 10);
    expect(arc[4]).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI * 0.5, 10);
  });

  it('三段門檻色：ratio 1.0→綠、0.45→金、0.25→朱；門檻邊界 0.6 落 gold、maxDur=0 視為 0', () => {
    expect(durabilityRingColor(1.0)).toBe(TOKENS_NUM.accentMossBright);
    expect(durabilityRingColor(0.45)).toBe(TOKENS_NUM.accentGold);
    expect(durabilityRingColor(0.25)).toBe(TOKENS_NUM.accentVermilionBright);
    expect(durabilityRingColor(UI.durabilityRingWarn)).toBe(TOKENS_NUM.accentGold); // 恰門檻不算「>」
    expect(durabilityRingColor(0)).toBe(TOKENS_NUM.accentVermilionBright);
    // 弧色透過 draw 反映：
    const { rec, g } = makeRec();
    drawDurabilityRing(g, CASTLE_NODE_GEOMETRY.ringRadiusMain, 0.45);
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as StrokeArg;
    expect(arcStroke.color).toBe(TOKENS_NUM.accentGold);
  });
});

describe('drawCastleWarning（M6-V7 §6.1 徽記）', () => {
  it('none：僅 clear、無其他繪製', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ warning: 'none' }));
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.[0]).toBe('clear');
  });

  it('threatened：2 枚 accentGold 三角焰＋ink900 桿', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ warning: 'threatened' }));
    const goldFills = rec
      .argsOf('fill')
      .filter((a) => (a[0] as FillArg).color === TOKENS_NUM.accentGold);
    expect(goldFills).toHaveLength(2);
    const poleStroke = rec
      .argsOf('stroke')
      .map((a) => a[0] as StrokeArg)
      .find((s) => s.color === TOKENS_NUM.ink900);
    expect(poleStroke?.width).toBe(1);
    expect(rec.countOf('moveTo')).toBeGreaterThanOrEqual(1);
  });

  it('critical：朱紅光暈圓 r=ringRadius+4 α .5＋vermilion 鋸齒裂口 w 1.5', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ tier: 'main', warning: 'critical' }));
    const circle = rec.argsOf('circle')[0] as number[];
    expect(circle[2]).toBe(
      CASTLE_NODE_GEOMETRY.ringRadiusMain + CASTLE_NODE_GEOMETRY.criticalHaloPad,
    );
    const strokes = rec.argsOf('stroke').map((a) => a[0] as StrokeArg);
    const halo = strokes.find((s) => s.color === TOKENS_NUM.accentVermilionBright);
    expect(halo?.alpha).toBe(CASTLE_NODE_GEOMETRY.criticalHaloAlpha);
    const crack = strokes.find((s) => s.color === TOKENS_NUM.accentVermilion);
    expect(crack?.width).toBe(CASTLE_NODE_GEOMETRY.crackWidth);
    expect(rec.countOf('lineTo')).toBe(3); // 3 段鋸齒
  });

  it('critical 光暈半徑隨 tier（支城 ringRadiusBranch+4）', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ tier: 'branch', warning: 'critical' }));
    const circle = rec.argsOf('circle')[0] as number[];
    expect(circle[2]).toBe(
      CASTLE_NODE_GEOMETRY.ringRadiusBranch + CASTLE_NODE_GEOMETRY.criticalHaloPad,
    );
  });
});

describe('createCastleNode（12 §4 ScenePart 加法擴充）', () => {
  it('container 內建三子 Graphics，children[0]=bodyGfx（far 放大錨定）', () => {
    const part = createCastleNode();
    expect(part.container.children).toHaveLength(3);
    for (const child of part.container.children) expect(child).toBeInstanceOf(Graphics);
  });

  it('update() 依 props.pos 設定 container.position、回傳 void', () => {
    const part = createCastleNode();
    const ret = part.update(props({ pos: { x: 42, y: 84 } }));
    expect(ret).toBeUndefined();
    expect(part.container.position.x).toBe(42);
    expect(part.container.position.y).toBe(84);
  });

  it('update() 冪等：props（除 pos 外）不變時不重繪 bodyGfx', () => {
    const part = createCastleNode();
    const bodyGfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(bodyGfx, 'clear');
    const p = props();
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...p }); // 新物件、值相同
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...p, durability: p.durability - 1 }); // 真正變更
    expect(clearSpy).toHaveBeenCalledTimes(2);
    part.update({ ...p, warning: 'critical' }); // warning 變更也重繪
    expect(clearSpy).toHaveBeenCalledTimes(3);
  });

  it('setLodStage：far+warning=none→ring/warn 隱、near→ring 顯；warning≠none→ring/warn 顯（far 亦顯）', () => {
    const part = createCastleNode();
    const [, ringGfx, warnGfx] = part.container.children as Graphics[];
    part.update(props({ tier: 'main', warning: 'none' }));
    part.setLodStage('near');
    expect(ringGfx!.visible).toBe(true);
    expect(warnGfx!.visible).toBe(false);
    part.setLodStage('far');
    expect(ringGfx!.visible).toBe(false);
    expect(warnGfx!.visible).toBe(false);

    part.update(props({ tier: 'main', warning: 'critical' }));
    part.setLodStage('far');
    expect(ringGfx!.visible).toBe(true); // warning≠none → far 亦顯狀態環
    expect(warnGfx!.visible).toBe(true);
  });

  it('setLodStage：far+本城→bodyGfx.scale=1.4、ring/warn scale 恆 1；非 far 或非本城→1', () => {
    const part = createCastleNode();
    const [bodyGfx, ringGfx, warnGfx] = part.container.children as Graphics[];
    part.update(props({ tier: 'main' }));
    part.setLodStage('far');
    expect(bodyGfx!.scale.x).toBe(CASTLE_NODE_GEOMETRY.farMainBodyScale);
    expect(ringGfx!.scale.x).toBe(1);
    expect(warnGfx!.scale.x).toBe(1);
    part.setLodStage('near');
    expect(bodyGfx!.scale.x).toBe(1);

    const branch = createCastleNode();
    const branchBody = branch.container.children[0] as Graphics;
    branch.update(props({ tier: 'branch' }));
    branch.setLodStage('far');
    expect(branchBody.scale.x).toBe(1); // 支城 far 不放大
  });

  it('update 後重套 LOD：far 本城重繪仍保持 ×1.4（不因重繪回退）', () => {
    const part = createCastleNode();
    const bodyGfx = part.container.children[0] as Graphics;
    part.update(props({ tier: 'main' }));
    part.setLodStage('far');
    expect(bodyGfx.scale.x).toBe(CASTLE_NODE_GEOMETRY.farMainBodyScale);
    part.update(props({ tier: 'main', durability: 100 })); // 重繪
    expect(bodyGfx.scale.x).toBe(CASTLE_NODE_GEOMETRY.farMainBodyScale);
  });

  it('destroy() 銷毀 container 與子 Graphics，且可重複呼叫', () => {
    const part = createCastleNode();
    const bodyGfx = part.container.children[0] as Graphics;
    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(bodyGfx.destroyed).toBe(true);
    expect(() => part.destroy()).not.toThrow();
  });
});
