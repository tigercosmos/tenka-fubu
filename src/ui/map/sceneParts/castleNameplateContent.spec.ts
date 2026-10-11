import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitmapText, Bounds, Graphics, type FillInstruction } from 'pixi.js';
import { createCastleNameplate, type CastleNameplateProps } from './castleNameplate';
import { NAMEPLATE_GEOMETRY } from './nameplateStyle';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
// Controlled measured label dimensions, not native font/pixel proof.
const ownWidth = Object.getOwnPropertyDescriptor(BitmapText.prototype, 'width');
beforeEach(() =>
  Object.defineProperty(BitmapText.prototype, 'width', {
    configurable: true,
    get: function (this: BitmapText) {
      return this.text.includes('城') ? 90 : 30;
    },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  if (ownWidth) Object.defineProperty(BitmapText.prototype, 'width', ownWidth);
  else Reflect.deleteProperty(BitmapText.prototype, 'width');
});
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
describe('castle ribbon identity column', () => {
  it('keeps the complete seal to the left of the measured castle-name column', () => {
    const part = createCastleNameplate();
    part.update(props);
    try {
      const g = part.container.children[0] as Graphics,
        name = part.container.children[1] as BitmapText;
      const circle = g.context.instructions
        .filter((s): s is FillInstruction => s.action === 'fill')
        .flatMap((s) => s.data.path.shapePath.shapePrimitives)
        .find((p) => p.shape.type === 'circle' && Reflect.get(p.shape, 'radius') === 8)!.shape;
      expect(Reflect.get(circle, 'x') + Reflect.get(circle, 'radius') + 0.5).toBeLessThanOrEqual(
        name.position.x - 4,
      );
    } finally {
      part.destroy();
    }
  });
  it('reserves measured name and troop columns for both tiers and all owner colors without changing font/height/anchors', () => {
    vi.spyOn(BitmapText.prototype, 'getLocalBounds').mockImplementation(function (
      this: BitmapText,
    ) {
      const width = this.width,
        height = this.text.includes('城') ? 17 : 13;
      return new Bounds(
        -this.anchor.x * width,
        -this.anchor.y * height,
        (1 - this.anchor.x) * width,
        (1 - this.anchor.y) * height,
      );
    });
    for (const tier of ['main', 'branch'] as const)
      for (let colorIndex = 0; colorIndex < 40; colorIndex++)
        for (const relation of ['friendly', 'enemy', 'neutral'] as const) {
          const part = createCastleNameplate();
          part.update({ ...props, tier, colorIndex, relation });
          try {
            const geometry = part.getContentGeometry()!,
              geo = NAMEPLATE_GEOMETRY[tier];
            expect(geometry.seal.x + geometry.seal.width).toBeLessThanOrEqual(
              geometry.name.x - 1.5,
            );
            expect(geometry.name.x + geometry.name.width).toBeLessThan(geometry.troops.x);
            expect(part.getRibbonSize().h).toBe(tier === 'main' ? 20 : 16);
            expect((part.container.children[1] as BitmapText).style.fontSize).toBe(
              tier === 'main' ? 15 : 13,
            );
            expect((part.container.children[2] as BitmapText).style.fontSize).toBe(
              tier === 'main' ? 12 : 11,
            );
            expect(part.container.position.x).toBe(props.pos.x);
            expect(part.container.position.y).toBe(props.pos.y + geo.worldGap);
            const fills = (part.container.children[0] as Graphics).context.instructions.filter(
              (s): s is FillInstruction => s.action === 'fill',
            );
            const seal = fills.find((s) =>
              s.data.path.shapePath.shapePrimitives.some(
                (p) => p.shape.type === 'circle' && Reflect.get(p.shape, 'radius') === geo.sealR,
              ),
            )!;
            expect(seal.data.style.color).toBe(
              relation === 'neutral' ? TOKENS_NUM.washi100 : clanColorNum(colorIndex),
            );
          } finally {
            part.destroy();
          }
        }
  });
  it('preserves mandatory semantics, original LOD controls and font ownership on content redraws', () => {
    const part = createCastleNameplate();
    expect(part.getContentGeometry()).toBeNull();
    part.update(props);
    const name = part.container.children[1] as BitmapText,
      troops = part.container.children[2] as BitmapText;
    const styles = [name.style, troops.style];
    part.setLodStage('far');
    expect(name.visible).toBe(false);
    part.setLodStage('mid');
    expect(name.visible).toBe(true);
    part.setTargetHighlight(true);
    expect(part.container.children[3]!.visible).toBe(true);
    part.update({ ...props, warning: 'critical', soldiers: 0 });
    expect(troops.text).toBe('0');
    expect(name.text).toBe('駿府城');
    expect([name.style, troops.style]).toEqual(styles);
    part.update({ ...props, tier: 'branch', warning: 'threatened' });
    expect(name.visible).toBe(false);
    part.setLodStage('near');
    expect(name.visible).toBe(true);
    part.destroy();
    part.destroy();
    expect(part.container.destroyed).toBe(true);
  });
});
