import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitmapText, Bounds, Graphics } from 'pixi.js';
import { createCastleNameplate, type CastleNameplateProps } from './castleNameplate';
const ownWidth = Object.getOwnPropertyDescriptor(BitmapText.prototype, 'width');
beforeEach(() => {
  Object.defineProperty(BitmapText.prototype, 'width', {
    configurable: true,
    get: function (this: BitmapText) {
      return this.text.includes('城') ? 90 : 30;
    },
  });
  vi.spyOn(BitmapText.prototype, 'getLocalBounds').mockImplementation(function (this: BitmapText) {
    const w = this.width,
      h = this.text.includes('城') ? 17 : 13;
    return new Bounds(
      -this.anchor.x * w,
      -this.anchor.y * h,
      (1 - this.anchor.x) * w,
      (1 - this.anchor.y) * h,
    );
  });
});
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
describe('actual original-envelope compact presentation', () => {
  it.each(['main', 'branch'] as const)(
    'retains the mandatory numeric channel and readable full bounds in compact %s labels',
    (tier) => {
      const part = createCastleNameplate();
      part.update({ ...props, tier });
      part.setLodStage('near');
      const original = part.getOriginalPresentationGeometry();
      const name = part.container.children[1] as BitmapText;
      const troops = part.container.children[2] as BitmapText;
      const fonts = [name.style.fontSize, troops.style.fontSize];
      part.setCompactPresentation(true);
      expect(troops.visible).toBe(true);
      expect([name.text, troops.text]).toEqual(['駿府城', '3,400']);
      expect([name.style.fontSize, troops.style.fontSize]).toEqual(fonts);
      const geometry = part.getContentGeometry()!;
      for (const rect of Object.values(geometry)) {
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
      expect(geometry.seal.x + geometry.seal.width).toBeLessThanOrEqual(geometry.name.x);
      expect(geometry.name.x + geometry.name.width).toBeLessThan(geometry.troops.x);
      expect(geometry.troops.x + geometry.troops.width).toBeLessThanOrEqual(original.ribbon.w / 2);
      expect(part.getPaintBounds()).toEqual(original.paint);
      part.update({ ...props, tier, soldiers: 5000 });
      expect(troops.visible).toBe(true);
      expect(troops.text).toBe('5,000');
      expect(part.getContentGeometry()!.troops.width).toBeGreaterThan(0);
      part.destroy();
    },
  );

  it('reproduces literal full content arithmetic across fractional original offsets', () => {
    const part = createCastleNameplate();
    part.update(props);
    for (let index = 1; index <= 64; index++) {
      const offset = { x: Math.sin(index) * 20, y: Math.cos(index) * 20 };
      const oldPositions = part.container.children.map((child) => ({ x: child.x, y: child.y }));
      const predictedFull = part.getOriginalPresentationGeometry(offset).content;
      const predictedActual = part.getContentGeometry(offset);
      expect(part.container.children.map((child) => ({ x: child.x, y: child.y }))).toEqual(
        oldPositions,
      );
      part.setPresentationOffset(offset, {
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        visible: false,
      });
      expect(part.getOriginalPresentationGeometry().content).toEqual(part.getContentGeometry());
      expect(predictedFull).toEqual(part.getContentGeometry());
      expect(predictedActual).toEqual(part.getContentGeometry());
    }
    part.destroy();
  });
  it('keeps numeric detail visible while warnings reject compact admission without a renderer flush', () => {
    const part = createCastleNameplate();
    part.update(props);
    part.setCompactPresentation(true);
    const troops = part.container.children[2] as BitmapText;
    expect(troops.visible).toBe(true);
    part.update({ ...props, warning: 'critical' });
    expect(troops.visible).toBe(true);
    expect(troops.text).toBe('3,400');
    expect(part.getPaintBounds()).toEqual(part.getOriginalPresentationGeometry().paint);
    const fullWidth = part.getRibbonSize().w;
    part.setCompactPresentation(true);
    expect(part.getRibbonSize().w).toBe(fullWidth);
    expect(troops.visible).toBe(true);
    part.update(props);
    expect(troops.visible).toBe(true); // no implicit readmission after warning clears
    part.setCompactPresentation(true);
    expect(troops.visible).toBe(true);
    part.destroy();
  });
  it('keeps actual original full geometry while the same original nodes retain all mandatory content in the contained compact variant', () => {
    const part = createCastleNameplate();
    part.update(props);
    const original = part.getPaintBounds(),
      children = [...part.container.children];
    // Controlled dimensions with actual Pixi Graphics; not native font/GL proof.
    const optional = part as typeof part & {
      setCompactPresentation?: (on: boolean) => void;
      getOriginalPresentationGeometry?: () => unknown;
    };
    optional.setCompactPresentation?.(true);
    const compact = part.getPaintBounds();
    expect(compact.width).toBe(original.width);
    expect(compact.x).toBeGreaterThanOrEqual(original.x);
    expect(compact.x + compact.width).toBeLessThanOrEqual(original.x + original.width);
    expect(part.container.children).toEqual(children);
    expect((children[2] as BitmapText).text).toBe('3,400');
    expect(children[2]!.visible).toBe(true);
    const clear = vi.spyOn(children[0] as Graphics, 'clear');
    optional.setCompactPresentation?.(true);
    expect(clear).not.toHaveBeenCalled();
    optional.setCompactPresentation?.(false);
    expect(part.getPaintBounds()).toEqual(original);
    expect(children[2]!.visible).toBe(true);
    part.destroy();
  });
});
