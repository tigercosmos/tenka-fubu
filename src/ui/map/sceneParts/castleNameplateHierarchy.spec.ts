import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitmapText, Bounds, Graphics, type FillInstruction } from 'pixi.js';
import { createCastleNameplate, type CastleNameplateProps } from './castleNameplate';
import { NAMEPLATE_GEOMETRY, NAMEPLATE_MATERIAL, nameplateMaterial } from './nameplateStyle';
import { TOKENS_NUM } from '@ui/styles/tokens';

beforeEach(() => {
  vi.spyOn(BitmapText.prototype, 'width', 'get').mockImplementation(function (this: BitmapText) {
    return this.text.length * Number(this.style.fontSize);
  });
  vi.spyOn(BitmapText.prototype, 'getLocalBounds').mockImplementation(function (this: BitmapText) {
    const w = this.width,
      h = Number(this.style.fontSize);
    return new Bounds(
      -this.anchor.x * w,
      -this.anchor.y * h,
      (1 - this.anchor.x) * w,
      (1 - this.anchor.y) * h,
    );
  });
});
afterEach(() => vi.restoreAllMocks());
const props: CastleNameplateProps = {
  pos: { x: 200, y: 300 },
  name: '駿府城',
  tier: 'main',
  colorIndex: 0,
  relation: 'friendly',
  isPlayer: true,
  warning: 'none',
  soldiers: 3400,
};

function luminance(rgb: number) {
  const linear = [rgb >>> 16, (rgb >>> 8) & 255, rgb & 255].map((byte) => {
    const s = byte / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(a: number, b: number) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function composite(fg: number, alpha: number, bg: number) {
  return [16, 8, 0].reduce(
    (rgb, shift) =>
      rgb |
      (Math.round(((fg >>> shift) & 255) * alpha + ((bg >>> shift) & 255) * (1 - alpha)) << shift),
    0,
  );
}

describe('castle ribbon name and numeric register hierarchy', () => {
  it.each(['main', 'branch'] as const)(
    'paints distinct readable registers with unchanged %s typography and geometry',
    (tier) => {
      const part = createCastleNameplate();
      part.update({ ...props, tier });
      try {
        const geo = NAMEPLATE_GEOMETRY[tier];
        const [g, name, troops] = part.container.children as [Graphics, BitmapText, BitmapText];
        expect(name.style.fill).toBe(TOKENS_NUM.ink900);
        expect(troops.style.fill).toBe(TOKENS_NUM.ink700);
        expect(name.style.fontSize).toBe(geo.nameSize);
        expect(troops.style.fontSize).toBe(geo.troopNumSize);
        expect(troops.text).toBe('3,400');
        expect(name.text).toBe('駿府城');
        const originalWidth = tier === 'main' ? 162 : 144;
        expect(part.getRibbonSize()).toEqual({ w: originalWidth, h: geo.ribbonH });
        expect(part.getPaintBounds()).toEqual({
          x: -originalWidth / 2 - 0.5,
          y: -0.5,
          width: originalWidth + 2.5,
          height: geo.ribbonH + 2.5,
        });
        const fills = g.context.instructions.filter(
          (s): s is FillInstruction => s.action === 'fill',
        );
        const paperColor = tier === 'main' ? 0xd0cbb8 : 0xc1c7b4;
        const registerColor = tier === 'main' ? 0xbab8a1 : 0xb8b9a4;
        const paper = fills.find(
          (s) =>
            s.data.style.color === paperColor &&
            s.data.path.shapePath.shapePrimitives.some(
              (p) => Reflect.get(p.shape, 'height') === geo.ribbonH,
            ),
        );
        expect(paper).toBeDefined();
        const register = fills.find(
          (s) =>
            s.data.style.color === registerColor &&
            s.data.path.shapePath.shapePrimitives.some((p) => p.shape.type === 'rectangle'),
        );
        expect(register).toBeDefined();
        const rect = register!.data.path.shapePath.shapePrimitives[0]!.shape;
        const right = part.getRibbonSize().w / 2;
        const divX = right - geo.ribbonPadX - troops.width - 2 - 2 * geo.troopDotR - geo.divGapX;
        expect(Reflect.get(rect, 'x')).toBe(divX + 1);
        expect(Reflect.get(rect, 'width')).toBe(right - divX - 2);
        expect(Reflect.get(rect, 'y')).toBe(1);
        expect(Reflect.get(rect, 'height')).toBe(geo.ribbonH - geo.dyeUnderlineH - 2);
        expect(register!.data.style.alpha).toBe(0.74);
        expect(paper!.data.style.alpha).toBe(tier === 'main' ? 0.72 : 0.68);
        const strokes = g.context.instructions.filter((s) => s.action === 'stroke');
        expect(strokes[0]!.data.style.alpha).toBe(tier === 'main' ? 0.1 : 0.07);
        expect(strokes[0]!.data.style.width).toBe(geo.inkHairline);
        expect(strokes[1]!.data.style.alpha).toBe(tier === 'main' ? 0.18 : 0.12);
        expect(strokes[1]!.data.style.width).toBe(1);
        expect(fills[0]!.data.style.alpha).toBe(tier === 'main' ? 0.025 : 0.02);
        expect(strokes[2]!.data.style.alpha).toBe(0.32);
        // Black is the lowest possible nonnegative terrain RGB; the register overlays the paper.
        const compositedPaper = composite(paperColor, paper!.data.style.alpha, 0);
        expect(contrast(TOKENS_NUM.ink900, compositedPaper)).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(
            TOKENS_NUM.ink700,
            composite(registerColor, register!.data.style.alpha, compositedPaper),
          ),
        ).toBeGreaterThanOrEqual(4.5);
        expect(part.container.position.x).toBe(props.pos.x);
        expect(part.container.position.y).toBe(props.pos.y + geo.worldGap);
        expect(part.container.children).toHaveLength(5);
        expect(part.container.children.filter((child) => child instanceof Graphics)).toHaveLength(
          3,
        );
      } finally {
        part.destroy();
      }
    },
  );

  it('uses fixed immutable ordinary materials and retains the complete opaque warning material', () => {
    expect(NAMEPLATE_MATERIAL.main.paperColor).toBe(0xd0cbb8);
    expect(NAMEPLATE_MATERIAL.branch.paperColor).toBe(0xc1c7b4);
    expect(Object.isFrozen(NAMEPLATE_MATERIAL)).toBe(true);
    for (const tier of ['main', 'branch'] as const) {
      const normal = nameplateMaterial(tier),
        attention = nameplateMaterial(tier, true);
      expect(Object.isFrozen(normal) && Object.isFrozen(attention)).toBe(true);
      expect(attention).toEqual({
        paperColor: tier === 'main' ? 0xe0cda4 : 0xcabb94,
        paperAlpha: 1,
        troopRegisterColor: tier === 'main' ? 0xcbbd99 : 0xb5a986,
        registerAlpha: 1,
        dividerAlpha: 1,
        outlineAlpha: tier === 'main' ? 0.2 : 0.14,
        shadowAlpha: tier === 'main' ? 0.08 : 0.05,
        highlightColor: tier === 'main' ? 0xe0d4b8 : 0xcbc0a3,
        highlightAlpha: tier === 'main' ? 0.45 : 0.35,
      });
      expect(contrast(TOKENS_NUM.ink900, attention.paperColor)).toBeGreaterThanOrEqual(4.5);
      const part = createCastleNameplate();
      try {
        part.update({ ...props, tier });
        const originalSize = part.getRibbonSize();
        const children = [...part.container.children];
        part.update({ ...props, tier, warning: 'critical' });
        const g = children[0] as Graphics;
        const fills = g.context.instructions.filter(
          (s): s is FillInstruction => s.action === 'fill',
        );
        expect(
          fills.some(
            (s) => s.data.style.color === attention.paperColor && s.data.style.alpha === 1,
          ),
        ).toBe(true);
        expect(
          fills.some(
            (s) =>
              s.data.style.color === TOKENS_NUM.accentVermilion &&
              s.data.path.shapePath.shapePrimitives.some((p) => p.shape.type === 'polygon'),
          ),
        ).toBe(true);
        expect(part.getRibbonSize()).toEqual(originalSize);
        expect(part.container.children).toEqual(children);
        expect((children[1] as BitmapText).text).toBe(props.name);
        expect((children[2] as BitmapText).text).toBe('3,400');
      } finally {
        part.destroy();
      }
    }
  });

  it('retains private styles, baseline bounds, offsets and original LOD across presentation redraws', () => {
    const part = createCastleNameplate();
    part.update(props);
    try {
      const children = [...part.container.children];
      const name = children[1] as BitmapText,
        troops = children[2] as BitmapText;
      const keys = [name.style.uid, troops.style.uid];
      const baseline = part.getPaintBounds();
      const size = part.getRibbonSize();
      const offset = { x: 16, y: 0 };
      part.setPresentationOffset(offset, {
        start: { x: 0, y: -24 },
        end: { x: 16, y: 0 },
        visible: true,
      });
      part.update({ ...props, colorIndex: 2 });
      expect(part.container.children).toEqual(children);
      expect([name.style.uid, troops.style.uid]).toEqual(keys);
      expect(part.getRibbonSize()).toEqual(size);
      expect(part.getPaintBounds()).toEqual(baseline);
      expect(children[0]!.position.x).toBe(16);
      part.setLodStage('far');
      expect(children.every((child) => !child.visible)).toBe(true);
      part.setLodStage('near');
      expect(name.visible && troops.visible).toBe(true);
    } finally {
      part.destroy();
    }
    expect(part.container.children).toHaveLength(0);
  });
});
