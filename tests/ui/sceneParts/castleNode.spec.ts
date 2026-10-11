// CastleNode（src/ui/map/sceneParts/castleNode.ts）繪製參數測試（M6-V7 Slice B）。
// 規格：docs/design/m6-v7-castles.md §6.1／§8.1、plan/12-ui-components.md §3.3.2／§5.6。
// 驗收精神：四型剪影外接盒與型別特徵；耐久環三段門檻；警戒／受攻徽記；三子 Graphics
// 分離＋setLodStage 顯隱／far 本城 bodyGfx ×1.4；update 冪等且回傳 void（AD2）。

import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture } from 'pixi.js';
import { CASTLE_BODY_ART_BY_TIER } from '@ui/map/sceneParts/castleBodyArt';
import { clanColorNum, MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import {
  CASTLE_NODE_GEOMETRY,
  CASTLE_MATERIAL,
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

  it('uses ivory plaster, shaded stone and charcoal roofs; clan color is confined to one banner', () => {
    const { rec, g } = makeRec();
    drawCastleBody(g, props({ tier: 'main', terrainKind: 'plain', colorIndex: 5 }));
    const fills = rec.argsOf('fill').map((a) => a[0] as FillArg);
    expect(fills.filter((f) => f.color === clanColorNum(5))).toHaveLength(1);
    for (const color of [
      CASTLE_MATERIAL.plasterFront,
      CASTLE_MATERIAL.plasterRight,
      CASTLE_MATERIAL.stoneTop,
      CASTLE_MATERIAL.stoneFront,
      CASTLE_MATERIAL.stoneRight,
      CASTLE_MATERIAL.roofLight,
      CASTLE_MATERIAL.roofDark,
      CASTLE_MATERIAL.eaves,
    ]) {
      expect(fills.map((f) => f.color)).toContain(color);
    }
    expect(
      fills.some(
        (f) => f.color === TOKENS_NUM.ink900 && f.alpha === CASTLE_NODE_GEOMETRY.shadowAlpha,
      ),
    ).toBe(true);
    const polygons = rec.argsOf('poly').map((a) => a[0] as number[]);
    const banner = boundingBoxOf(polygons.at(-1)!);
    expect(banner.width).toBeCloseTo(CASTLE_NODE_GEOMETRY.mainSize * 0.1);
    expect(banner.height).toBeCloseTo(CASTLE_NODE_GEOMETRY.mainSize * 0.105);
  });

  it('plain castles have an isometric moat; main castles have more keep levels and corner turrets', () => {
    const { rec: recMain, g: gMain } = makeRec();
    drawCastleBody(gMain, props({ tier: 'main', terrainKind: 'plain' }));
    expect(recMain.argsOf('arc')).toHaveLength(0);
    const moatStroke = recMain
      .argsOf('stroke')
      .map((a) => a[0] as StrokeArg)
      .find((s) => s.color === MAP_PALETTE_NUM.waterRiver);
    expect(moatStroke?.alpha).toBe(CASTLE_NODE_GEOMETRY.moatArcAlpha);
    const mainPolys = recMain.argsOf('poly').map((a) => a[0] as number[]);

    const { rec: recBranch, g: gBranch } = makeRec();
    drawCastleBody(gBranch, props({ tier: 'branch', terrainKind: 'plain' }));
    const branchPolys = recBranch.argsOf('poly').map((a) => a[0] as number[]);
    expect(branchPolys.length).toBeLessThan(mainPolys.length);
    const roofCount = (fills: unknown[][]) =>
      fills.filter((a) => (a[0] as FillArg).color === CASTLE_MATERIAL.roofLight).length;
    expect(roofCount(recMain.argsOf('fill'))).toBe(6); // Three keep floors + three turrets.
    expect(roofCount(recBranch.argsOf('fill'))).toBe(3); // Two floors + one turret.
  });

  it('mountain castles have three shaded rock faces, lifted buildings and no moat', () => {
    const { rec, g } = makeRec();
    drawCastleBody(g, props({ tier: 'main', terrainKind: 'mountain' }));
    expect(rec.argsOf('arc')).toHaveLength(0); // 山城無護城河
    const fills = rec.argsOf('fill').map((a) => a[0] as FillArg);
    for (const color of [
      CASTLE_MATERIAL.rockTop,
      CASTLE_MATERIAL.rockFront,
      CASTLE_MATERIAL.rockRight,
    ])
      expect(fills.map((f) => f.color)).toContain(color);
    expect(
      rec.argsOf('stroke').some((a) => (a[0] as StrokeArg).color === MAP_PALETTE_NUM.waterRiver),
    ).toBe(false);
    const plain = makeRec();
    drawCastleBody(plain.g, props());
    const topY = (polys: unknown[][]) =>
      Math.min(...polys.flatMap((a) => (a[0] as number[]).filter((_, i) => i % 2 === 1)));
    expect(topY(rec.argsOf('poly'))).toBeLessThan(topY(plain.rec.argsOf('poly')));
  });

  it('ownership changes recolor only the banner, not the NW-lit architecture or shadow', () => {
    const a = makeRec();
    const b = makeRec();
    drawCastleBody(a.g, props({ colorIndex: 1 }));
    drawCastleBody(b.g, props({ colorIndex: 2 }));
    expect(a.rec.argsOf('poly')).toEqual(b.rec.argsOf('poly'));
    expect(a.rec.argsOf('stroke')).toEqual(b.rec.argsOf('stroke'));
    const fa = a.rec.argsOf('fill');
    const fb = b.rec.argsOf('fill');
    expect(fa.slice(0, -1)).toEqual(fb.slice(0, -1));
    expect(fa.at(-1)).not.toEqual(fb.at(-1));
    const shadow = a.rec.argsOf('poly')[0]![0] as number[];
    expect(shadow[0]).toBe(
      -CASTLE_NODE_GEOMETRY.mainSize / 2 + CASTLE_NODE_GEOMETRY.shadowOffsetMain,
    );
    expect(shadow[1]).toBe(
      CASTLE_NODE_GEOMETRY.mainSize * 0.15 + CASTLE_NODE_GEOMETRY.shadowOffsetMain,
    );
  });

  it('builds adjoining stone faces with real vertical depth and a shared top diamond', () => {
    const { rec, g } = makeRec();
    drawCastleBody(g, props());
    const polys = rec.argsOf('poly').map((a) => a[0] as number[]);
    const fills = rec.argsOf('fill').map((a) => a[0] as FillArg);
    const front = polys[fills.findIndex((f) => f.color === CASTLE_MATERIAL.stoneFront)]!;
    const right = polys[fills.findIndex((f) => f.color === CASTLE_MATERIAL.stoneRight)]!;
    const top = polys[fills.findIndex((f) => f.color === CASTLE_MATERIAL.stoneTop)]!;
    // Moat uses stroke only, so polygon/fill indices differ by one after the shadow.
    const offset = 1;
    const frontFace = polys[polys.indexOf(front) + offset]!;
    const rightFace = polys[polys.indexOf(right) + offset]!;
    const topFace = polys[polys.indexOf(top) + offset]!;
    expect(frontFace.slice(2, 6)).toEqual([rightFace[0], rightFace[1], rightFace[6], rightFace[7]]);
    expect(frontFace[7]! - frontFace[1]!).toBeCloseTo(CASTLE_NODE_GEOMETRY.mainSize * 0.12);
    expect(topFace.slice(4, 6)).toEqual(frontFace.slice(2, 4));
    expect(CASTLE_MATERIAL.plasterFront).not.toBe(CASTLE_MATERIAL.plasterRight);
    expect(CASTLE_MATERIAL.roofLight).not.toBe(CASTLE_MATERIAL.roofDark);
  });
});

describe('drawDurabilityRing／durabilityRingColor（12 §5.6）', () => {
  it.each([
    [0, 0],
    [0.25, 0.25],
    [0.6, 0.6],
    [1, 1],
    [-1, 0],
    [2, 1],
    [NaN, 0],
    [Infinity, 0],
  ])('keeps the exact clamped HP fraction %s', (ratio, expected) => {
    const { rec, g } = makeRec();
    drawDurabilityRing(g, 18, ratio);
    const start = rec.argsOf('moveTo')[1] as number[];
    const end = rec.argsOf('lineTo')[1] as number[];
    expect((end[0]! - start[0]!) / 21.6).toBeCloseTo(expected);
    expect(start[1]).toBe(end[1]);
    const fillStroke = rec.argsOf('stroke')[1]![0] as StrokeArg;
    expect(fillStroke.color).toBe(durabilityRingColor(expected));
  });
  it('keeps exact HP as a base bar and replaces the critical roof crack with a compact badge', () => {
    const { rec, g } = makeRec();
    drawDurabilityRing(g, 18, 0.5);
    expect(rec.countOf('circle')).toBe(0);
    expect(rec.countOf('arc')).toBe(0);
    expect(rec.argsOf('moveTo')).toEqual([
      [-10.799999999999999, 8],
      [-10.799999999999999, 8],
    ]);
    expect(rec.argsOf('lineTo')[1]).toEqual([0, 8]);
    drawCastleWarning(g, props({ warning: 'critical' }));
    expect(rec.argsOf('poly')).toHaveLength(1);
    expect(rec.countOf('circle')).toBe(0);
  });
  it('先 clear；底環 ink700 α ringBaseAlpha（M6-V9 §3.1）、比例弧起角 -90°、掃角=ratio×360°、弧 α ringArcAlpha', () => {
    const { rec, g } = makeRec();
    drawDurabilityRing(g, CASTLE_NODE_GEOMETRY.ringRadiusMain, 0.5);
    expect(rec.calls[0]?.[0]).toBe('clear');
    expect(rec.countOf('circle')).toBe(0);
    const baseStroke = rec.argsOf('stroke')[0]?.[0] as StrokeArg;
    expect(baseStroke.width).toBe(CASTLE_NODE_GEOMETRY.ringWidth);
    expect(baseStroke.color).toBe(TOKENS_NUM.ink700);
    expect(baseStroke.alpha).toBe(CASTLE_NODE_GEOMETRY.ringBaseAlpha);
    const start = rec.argsOf('moveTo')[1] as number[];
    const end = rec.argsOf('lineTo')[1] as number[];
    expect(start[0]).toBeCloseTo(-10.8);
    expect(start[1]).toBe(8);
    expect(end).toEqual([0, 8]);
    const arcStroke = rec.argsOf('stroke').at(-1)?.[0] as StrokeArg;
    expect(arcStroke.alpha).toBe(CASTLE_NODE_GEOMETRY.ringArcAlpha);
  });

  it('三段門檻色：ratio 1.0→moss（M6-V9 非 bright）、0.45→金、0.25→朱；門檻邊界 0.6 落 gold、maxDur=0 視為 0', () => {
    expect(durabilityRingColor(1.0)).toBe(TOKENS_NUM.accentMoss);
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

  it('threatened: contrasting upright ivory triangle and dark flame, not color-only', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ warning: 'threatened' }));
    expect(rec.argsOf('fill').map((a) => (a[0] as FillArg).color)).toEqual([
      TOKENS_NUM.washi100,
      TOKENS_NUM.ink900,
    ]);
    expect(rec.argsOf('poly')[0]?.[0]).toEqual([0, -30.5, 3.5, -23.5, -3.5, -23.5]);
    const poleStroke = rec
      .argsOf('stroke')
      .map((a) => a[0] as StrokeArg)
      .find((s) => s.color === TOKENS_NUM.ink900);
    expect(poleStroke?.width).toBe(0.6);
  });

  it('critical：compact red badge above the main roof', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ tier: 'main', warning: 'critical' }));
    expect(rec.countOf('circle')).toBe(0);
    expect(rec.argsOf('poly')[0]?.[0]).toEqual([0, -30.5, 3.5, -27, 0, -23.5, -3.5, -27]);
    const strokes = rec.argsOf('stroke').map((a) => a[0] as StrokeArg);
    expect(strokes[0]).toMatchObject({ color: TOKENS_NUM.ink900, width: 0.6 });
    expect(strokes[1]?.color).toBe(TOKENS_NUM.washi100);
    expect(rec.countOf('lineTo')).toBe(1);
  });

  it('critical badge height follows branch model height', () => {
    const { rec, g } = makeRec();
    drawCastleWarning(g, props({ tier: 'branch', warning: 'critical' }));
    expect(rec.argsOf('poly')[0]?.[0]).toEqual([0, -26.5, 3.5, -23, 0, -19.5, -3.5, -23]);
  });
});

describe('createCastleNode（12 §4 ScenePart 加法擴充）', () => {
  it('reports all four actual art frames with HP below and compact warnings above, without claiming roof pixels', () => {
    for (const tier of ['main', 'branch'] as const) {
      for (const terrainKind of ['plain', 'mountain'] as const) {
        const part = createCastleNode();
        part.setBodyArt({
          [tier]: {
            [terrainKind]: {
              texture: Texture.EMPTY,
              spec: CASTLE_BODY_ART_BY_TIER[tier][terrainKind],
            },
          },
        });
        for (const warning of ['threatened', 'critical'] as const) {
          part.update(props({ tier, terrainKind, warning }));
          const geometry = part.getPresentationGeometry();
          if (!geometry?.warning) throw new Error('Expected visible warning frame');
          expect(geometry.painted).toBe(true);
          expect(geometry.body.width).toBeCloseTo(tier === 'main' ? 40 : 30);
          expect(geometry.warning.y + geometry.warning.height).toBeLessThan(geometry.body.y);
          expect(geometry.durability.y).toBeGreaterThan(geometry.body.y + geometry.body.height);
          const body = part.container.children[0] as Container;
          const sprite = body.children[2]!;
          const flag = body.children[3] as Graphics;
          const metadata = CASTLE_BODY_ART_BY_TIER[tier][terrainKind];
          expect(sprite.position.x + metadata.groundAnchor.x * sprite.scale.x).toBeCloseTo(0);
          expect(sprite.position.y + metadata.groundAnchor.y * sprite.scale.y).toBeCloseTo(0);
          const flagFrame = flag.getLocalBounds();
          expect(flag.position.x + flagFrame.x).toBeGreaterThan(
            geometry.body.x + geometry.body.width,
          );
          expect(geometry.durability.y - (geometry.body.y + geometry.body.height)).toBeCloseTo(2);
        }
        part.setLodStage('far');
        const far = part.getPresentationGeometry();
        expect(far?.painted).toBe(false);
        expect(far?.body.width).toBeCloseTo(tier === 'main' ? 28 * 1.4 : 20);
        expect(far!.warning!.y + far!.warning!.height).toBeLessThan(far!.body.y);
        part.setLodStage('near');
        const restored = part.getPresentationGeometry();
        if (!restored?.warning) throw new Error('Expected restored painted warning');
        expect(restored.body.width).toBe(tier === 'main' ? 40 : 30);
        expect(restored.warning.y + restored.warning.height).toBeLessThan(restored.body.y);
        part.destroy();
      }
    }
    expect(Texture.EMPTY.destroyed).toBe(false);
  });
  it('container keeps a body group plus independent ring and warning Graphics', () => {
    const part = createCastleNode();
    expect(part.container.children).toHaveLength(3);
    expect(part.container.children[0]).toBeInstanceOf(Container);
    expect((part.container.children[0] as Container).children[0]).toBeInstanceOf(Graphics);
    expect(part.container.children[1]).toBeInstanceOf(Graphics);
    expect(part.container.children[2]).toBeInstanceOf(Graphics);
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
    const bodyGfx = (part.container.children[0] as Container).children[0] as Graphics;
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
