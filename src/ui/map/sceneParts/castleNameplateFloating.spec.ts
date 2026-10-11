import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BitmapText, Bounds, Graphics, type FillInstruction } from 'pixi.js';
import { createCastleNameplate } from './castleNameplate';
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

it.each(['main', 'branch'] as const)(
  'retains the fully opaque %s warning surface across all relation shapes',
  (tier) => {
    for (const warning of ['threatened', 'critical'] as const) {
      for (const relation of ['friendly', 'enemy', 'neutral'] as const) {
        const p = createCastleNameplate();
        p.update({
          pos: { x: 200, y: 300 },
          name: '駿府城',
          tier,
          colorIndex: 0,
          relation,
          isPlayer: true,
          warning,
          soldiers: 3400,
        });
        try {
          const g = p.container.children[0] as Graphics;
          const fills = g.context.instructions.filter(
            (s): s is FillInstruction => s.action === 'fill',
          );
          expect(fills[0]!.data.style.alpha).toBe(tier === 'main' ? 0.08 : 0.05);
          expect(fills[1]!.data.style).toMatchObject({
            color: tier === 'main' ? 0xe0cda4 : 0xcabb94,
            alpha: 1,
          });
          expect(
            fills.find((s) => s.data.style.color === (tier === 'main' ? 0xcbbd99 : 0xb5a986))!.data
              .style.alpha,
          ).toBe(1);
          expect(fills.some((s) => s.data.style.color === TOKENS_NUM.accentVermilion)).toBe(true);
          const strokes = g.context.instructions.filter((s) => s.action === 'stroke');
          expect(strokes[0]!.data.style.alpha).toBe(tier === 'main' ? 0.2 : 0.14);
          expect(strokes[1]!.data.style.alpha).toBe(tier === 'main' ? 0.45 : 0.35);
          p.setTargetHighlight(true);
          expect(p.container.children[3]!.visible).toBe(true);
        } finally {
          p.destroy();
        }
      }
    }
  },
);
function composite(fg: number, alpha: number, bg: number) {
  return [16, 8, 0].reduce(
    (rgb, shift) =>
      rgb |
      (Math.round(((fg >>> shift) & 255) * alpha + ((bg >>> shift) & 255) * (1 - alpha)) << shift),
    0,
  );
}
function luminance(rgb: number) {
  const c = [16, 8, 0].map((shift) => {
    const v = ((rgb >>> shift) & 255) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(a: number, b: number) {
  return (
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  );
}
it.each(['main', 'branch'] as const)(
  'paints a restrained translucent %s surface with composited ink contrast and unchanged geometry',
  (tier) => {
    const p = createCastleNameplate();
    p.update({
      pos: { x: 200, y: 300 },
      name: '駿府城',
      tier,
      colorIndex: 0,
      relation: 'friendly',
      isPlayer: true,
      warning: 'none',
      soldiers: 3400,
    });
    try {
      const [g, name, troops] = p.container.children as [Graphics, BitmapText, BitmapText];
      const fills = g.context.instructions.filter((s): s is FillInstruction => s.action === 'fill');
      const paper = fills[1]!.data.style;
      expect(paper.color).toBe(tier === 'main' ? 0xd0cbb8 : 0xc1c7b4);
      expect(paper.alpha).toBe(tier === 'main' ? 0.72 : 0.68);
      const register = fills.find(
        (s) => s.data.style.color === (tier === 'main' ? 0xbab8a1 : 0xb8b9a4),
      )!.data.style;
      expect(register.alpha).toBe(0.74);
      for (const ground of [0x000000, 0x173d48, 0x737c4c, 0x425737, 0xd5cfad, 0xffffff]) {
        const background = composite(paper.color, paper.alpha, ground);
        expect(contrast(TOKENS_NUM.ink900, background)).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(TOKENS_NUM.ink700, composite(register.color, register.alpha, background)),
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(name.style.fill).toBe(TOKENS_NUM.ink900);
      expect(troops.style.fill).toBe(TOKENS_NUM.ink700);
      expect([name.text, troops.text]).toEqual(['駿府城', '3,400']);
      const w = tier === 'main' ? 162 : 144,
        h = tier === 'main' ? 20 : 16;
      expect(p.getRibbonSize()).toEqual({ w, h });
      expect(p.getPaintBounds()).toEqual({
        x: -w / 2 - 0.5,
        y: -0.5,
        width: w + 2.5,
        height: h + 2.5,
      });
      expect(p.container.children).toHaveLength(5);
      const styles = [name.style, troops.style];
      p.setPresentationOffset(
        { x: 16, y: 0 },
        { start: { x: 0, y: 0 }, end: { x: 16, y: 0 }, visible: true },
      );
      p.update({
        pos: { x: 201, y: 301 },
        name: '駿府城',
        tier,
        colorIndex: 0,
        relation: 'friendly',
        isPlayer: true,
        warning: 'none',
        soldiers: 3400,
      });
      expect([name.style, troops.style]).toEqual(styles);
    } finally {
      p.destroy();
    }
  },
);
