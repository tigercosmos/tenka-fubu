import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitmapText, Bounds, Graphics } from 'pixi.js';
import { createCastleNameplate, type CastleNameplateProps } from './castleNameplate';
import { NAMEPLATE_GEOMETRY, NAMEPLATE_STYLE } from './nameplateStyle';
import { TOKENS_NUM } from '@ui/styles/tokens';

// Real scene objects with controlled text measurements, not native glyph proof.
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
const offset = { x: -24, y: 18 };
const leader = { start: { x: 0, y: -24 }, end: { x: -10, y: 18 }, visible: true };

describe('castle ribbon presentation offset', () => {
  it('paints one readable ink leader without changing its width, geometry or ownership', () => {
    const part = createCastleNameplate();
    part.update(props);
    const line = part.container.children[4] as Graphics;
    const move = vi.spyOn(line, 'moveTo'),
      end = vi.spyOn(line, 'lineTo'),
      stroke = vi.spyOn(line, 'stroke');
    try {
      part.setPresentationOffset(offset, leader);
      expect(stroke).toHaveBeenCalledTimes(1);
      expect(stroke).toHaveBeenCalledWith({ width: 1, color: TOKENS_NUM.ink900, alpha: 0.95 });
      expect(move).toHaveBeenCalledWith(leader.start.x, leader.start.y);
      expect(end).toHaveBeenCalledWith(leader.end.x, leader.end.y);
      const instruction = line.context.instructions.find((item) => item.action === 'stroke');
      expect(instruction?.data.style.alpha).toBe(0.95);
      expect(instruction?.data.style.width).toBe(1);
      expect(Reflect.get(NAMEPLATE_STYLE, 'leaderAlpha')).toBe(0.95);
      expect(part.container.children).toHaveLength(5);
      part.setPresentationOffset({ ...offset }, { ...leader });
      expect(stroke).toHaveBeenCalledTimes(1);
      part.setLodStage('far');
      expect(line.visible).toBe(false);
      part.setLodStage('near');
      expect(line.visible).toBe(true);
      part.setPresentationOffset({ x: 0, y: 0 }, { ...leader, visible: false });
      expect(line.visible).toBe(false);
    } finally {
      part.destroy();
    }
    expect(line.destroyed).toBe(true);
  });
  it('rigidly shifts content while preserving baseline paint bounds and world anchor', () => {
    const part = createCastleNameplate();
    part.update(props);
    const baseline = part.getContentGeometry()!,
      paint = { ...part.getPaintBounds() };
    const children = [...part.container.children];
    try {
      part.setPresentationOffset(offset, leader);
      expect(part.container.children).toEqual(children);
      expect(children).toHaveLength(5);
      expect(children[0]).toBeInstanceOf(Graphics);
      expect(children[1]).toBeInstanceOf(BitmapText);
      expect(children[2]).toBeInstanceOf(BitmapText);
      expect(children[3]).toBeInstanceOf(Graphics);
      expect(children[4]).toBeInstanceOf(Graphics);
      expect(part.container.position.x).toBe(200);
      expect(part.container.position.y).toBe(324);
      const shifted = part.getContentGeometry()!;
      for (const key of ['seal', 'name', 'troops'] as const)
        expect(shifted[key]).toEqual({
          ...baseline[key],
          x: baseline[key].x + offset.x,
          y: baseline[key].y + offset.y,
        });
      expect(part.getPaintBounds()).toEqual(paint);
      expect(children[0]!.position.x).toBe(offset.x);
      expect(children[3]!.position.y).toBe(offset.y);
    } finally {
      part.destroy();
    }
  });

  it('retains displacement on same-props, changed text, tier and world-position updates', () => {
    const part = createCastleNameplate();
    part.update(props);
    part.setPresentationOffset(offset, leader);
    try {
      for (const next of [
        props,
        { ...props, name: '長城名城', soldiers: 123456 },
        { ...props, tier: 'branch' as const, pos: { x: 500, y: 600 } },
      ]) {
        part.update(next);
        const fresh = createCastleNameplate();
        fresh.update(next);
        try {
          const a = part.getContentGeometry()!,
            b = fresh.getContentGeometry()!;
          for (const key of ['seal', 'name', 'troops'] as const)
            expect(a[key]).toEqual({ ...b[key], x: b[key].x + offset.x, y: b[key].y + offset.y });
          expect(part.getPaintBounds()).toEqual(fresh.getPaintBounds());
          expect(part.container.position.x).toBe(next.pos.x);
          expect(part.container.position.y).toBe(
            next.pos.y + NAMEPLATE_GEOMETRY[next.tier].worldGap,
          );
        } finally {
          fresh.destroy();
        }
      }
    } finally {
      part.destroy();
    }
  });

  it('only redraws changed leader geometry and preserves target/LOD indices', () => {
    const part = createCastleNameplate();
    part.update(props);
    const body = part.container.children[0] as Graphics;
    const highlight = part.container.children[3]!;
    const line = part.container.children[4] as Graphics;
    const clear = vi.spyOn(line, 'clear'),
      bodyClear = vi.spyOn(body, 'clear');
    try {
      part.setPresentationOffset(offset, leader);
      expect(clear).toHaveBeenCalledTimes(1);
      part.setPresentationOffset({ ...offset }, { ...leader });
      part.update(props);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(bodyClear).not.toHaveBeenCalled();
      part.setTargetHighlight(true);
      expect(highlight.visible).toBe(true);
      expect(line.visible).toBe(true);
      part.setLodStage('far');
      expect(part.container.children.every((child) => !child.visible)).toBe(true);
      part.setLodStage('mid');
      expect(highlight.visible).toBe(true);
      expect(line.visible).toBe(true);
      part.update({ ...props, tier: 'branch' });
      expect(part.container.children.every((child) => !child.visible)).toBe(true);
      part.setLodStage('near');
      expect(highlight.visible).toBe(true);
      part.setPresentationOffset({ x: 0, y: 0 }, { ...leader, visible: false });
      expect(line.visible).toBe(false);
      expect(clear).toHaveBeenCalledTimes(2);
      expect(body.position.x).toBe(0);
    } finally {
      part.destroy();
    }
  });
});
