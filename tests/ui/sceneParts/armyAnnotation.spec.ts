import { describe, expect, it, vi } from 'vitest';
import { BitmapText, Container, Graphics, Rectangle, Texture } from 'pixi.js';
import type { FillInstruction, StrokeInstruction } from 'pixi.js';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { createArmyChip, type ArmyChipProps } from '@ui/map/sceneParts/armyChip';
import { ARMY_BODY_ART } from '@ui/map/sceneParts/armyBodyArt';

const base: ArmyChipProps = {
  pos: { x: 100, y: 200 },
  colorIndex: 5,
  soldiers: 2200,
  morale: 50,
  corps: false,
  status: 'holding',
  foodDays: 20,
  relation: 'friendly',
  selected: false,
  heading: null,
  stage: 'mid',
  labelStagger: 0,
};
const art = { east: { texture: Texture.EMPTY, spec: ARMY_BODY_ART.east } };
function group(part: ReturnType<typeof createArmyChip>) {
  return part.container.children.find((child) => child.label === 'armyPlate') as Container;
}

describe('actual army recognition annotation', () => {
  it('emits a high-contrast noncolor relation seal inside the pixel-locked annotation group', () => {
    const part = createArmyChip();
    part.setBodyArt(art);
    part.update(base);
    try {
      const seal = group(part).children.find((child) => child.label === 'armyAnnotationRelation');
      expect(seal).toBeInstanceOf(Graphics);
      expect((seal as Graphics).context.instructions.length).toBeGreaterThan(0);
    } finally {
      part.destroy();
    }
  });
  it('shows the actual active state and critical supply independently instead of suppressing supply', () => {
    const part = createArmyChip();
    part.setBodyArt(art);
    part.update({ ...base, status: 'routed', foodDays: 0, corps: true });
    try {
      const texts = group(part)
        .children.filter((child): child is BitmapText => child instanceof BitmapText)
        .filter((child) => child.visible)
        .map((child) => child.text);
      expect(texts).toContain('退');
      expect(texts).toContain('糧!');
      expect(texts).not.toContain('軍');
    } finally {
      part.destroy();
    }
  });
  it('retains semantic annotation at far while the original unselected numeral stays hidden', () => {
    const part = createArmyChip();
    part.update({ ...base, stage: 'far', status: 'sieging', foodDays: 5 });
    try {
      expect((group(part).children[1] as BitmapText).visible).toBe(false);
      expect(group(part).visible).toBe(true);
      expect(part.getPlateBounds()).not.toBeNull();
      const texts = group(part)
        .children.filter((child): child is BitmapText => child instanceof BitmapText)
        .filter((child) => child.visible)
        .map((child) => child.text);
      expect(texts).toEqual(['圍', '糧']);
    } finally {
      part.destroy();
    }
  });
  it.each([
    ['routed', '退'],
    ['engaged', '戰'],
    ['sieging', '圍'],
    ['subjugating', '討'],
    ['holding', '軍'],
  ] as const)('keeps %s and critical supply in separate actual text cells', (status, text) => {
    const part = createArmyChip();
    part.update({ ...base, status, corps: true, foodDays: 0 });
    const frames = part.getAnnotationFrames()!;
    expect(frames.state.text).toBe(text);
    expect(frames.supply.text).toBe('糧!');
    expect(frames.state.visible && frames.supply.visible).toBe(true);
    expect(frames.state.rect!.x + frames.state.rect!.width).toBe(frames.supply.rect!.x);
    part.destroy();
  });
  it.each([
    [7, '', 'ok'],
    [3, '糧', 'low'],
    [0, '糧!', 'critical'],
  ] as const)('preserves the actual supply boundary at %s days', (foodDays, text, level) => {
    const part = createArmyChip();
    part.update({ ...base, foodDays });
    expect(part.getAnnotationFrames()!.supply).toMatchObject({ text, level, visible: text !== '' });
    part.destroy();
  });
  it('records scaled/offset reserved cells without changing anchor, hit area, text style, or drawing on zoom', () => {
    const part = createArmyChip();
    part.setBodyArt(art);
    part.update({ ...base, stage: 'near', status: 'sieging', foodDays: 0 });
    const initial = part.getAnnotationFrames()!;
    const styles = group(part)
      .children.filter((c): c is BitmapText => c instanceof BitmapText)
      .map((c) => c.style);
    const hit = part.container.hitArea;
    const seal = group(part).children[3] as Graphics;
    const clear = vi.spyOn(seal, 'clear');
    part.setPlateScale(14 / 12);
    part.setPlateOffset({ x: -8, y: 6 });
    const result = part.getAnnotationFrames()!;
    expect(result.relation.rect).toEqual({
      x: -8,
      y: 6 + (initial.relation.rect.y * 14) / 12,
      width: 14,
      height: 17.5,
    });
    expect(part.container.position).toMatchObject(base.pos);
    expect(part.container.hitArea).toBe(hit);
    expect(clear).not.toHaveBeenCalled();
    const bounds = part.getPlateBounds()!;
    for (const cell of [result.relation, result.state, result.supply, result.number]) {
      if (!cell.rect) continue;
      expect(cell.rect.x).toBeGreaterThanOrEqual(bounds.x - 8);
      expect(cell.rect.x + cell.rect.width).toBeLessThanOrEqual(bounds.x + bounds.width - 8);
      expect(cell.rect.y + cell.rect.height).toBeLessThanOrEqual(bounds.y + bounds.height + 6);
    }
    part.setBodyArt({});
    part.setBodyArt(art);
    expect(part.getAnnotationFrames()).toEqual(result);
    expect(
      group(part)
        .children.filter((c): c is BitmapText => c instanceof BitmapText)
        .map((c) => c.style),
    ).toEqual(styles);
    expect(part.update({ ...base, stage: 'near', status: 'sieging', foodDays: 0 })).toBe(false);
    part.destroy();
    part.destroy();
    expect(part.getAnnotationFrames()).toBeNull();
    expect(seal.destroyed).toBe(true);
  });
  it('retains selected and aggregate FAR numerals without adding ordinary FAR numbers', () => {
    const part = createArmyChip();
    for (const extra of [
      { selected: false },
      { selected: true },
      { selected: false, collapsedCount: 4 },
    ]) {
      part.update({ ...base, stage: 'far', ...extra });
      const frame = part.getAnnotationFrames()!;
      expect(frame.relation.visible).toBe(true);
      expect(frame.number.visible).toBe(extra.selected || 'collapsedCount' in extra);
      expect(frame.number.rect !== null).toBe(frame.number.visible);
    }
    part.destroy();
  });
  it('uses distinct opaque source-blind seal paths for all three relations and retains all forty owner colors', () => {
    const part = createArmyChip();
    const paths = new Set<string>();
    for (const relation of ['friendly', 'enemy', 'neutral'] as const) {
      part.update({ ...base, relation });
      const paints = (group(part).children[3] as Graphics).context.instructions.filter(
        (i): i is FillInstruction | StrokeInstruction =>
          i.action === 'fill' || i.action === 'stroke',
      );
      paths.add(
        JSON.stringify(
          paints.map((i) => ({
            action: i.action,
            shapes: i.data.path.shapePath.shapePrimitives.map((p) => p.shape),
          })),
        ),
      );
      expect(paints.every((i) => i.data.style.alpha === 1)).toBe(true);
      expect(new Set(paints.map((i) => i.data.style.color))).toEqual(
        new Set([TOKENS_NUM.ink900, TOKENS_NUM.washi100]),
      );
      expect(part.getAnnotationFrames()!.relation.kind).toBe(relation);
    }
    expect(paths.size).toBe(3);
    for (let colorIndex = 0; colorIndex < 40; colorIndex++) {
      part.update({ ...base, colorIndex });
      expect(part.getAnnotationFrames()!.number.text).toBe('2.2k');
      expect(part.container.hitArea).toEqual(new Rectangle(-6, -36, 34, 42));
      const body = part.container.children.find((c) => c.label === 'armyBody') as Container;
      const fills = (body.children[0] as Graphics).context.instructions.filter(
        (i): i is FillInstruction => i.action === 'fill',
      );
      expect(fills.some((i) => i.data.style.color === clanColorNum(colorIndex))).toBe(true);
    }
    part.destroy();
  });
});
