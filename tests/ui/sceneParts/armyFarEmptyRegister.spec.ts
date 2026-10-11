import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics, Texture } from 'pixi.js';
import type { FillInstruction, StrokeInstruction } from 'pixi.js';
import { createArmyChip, type ArmyChipProps } from '@ui/map/sceneParts/armyChip';
import { ARMY_BODY_ART } from '@ui/map/sceneParts/armyBodyArt';
import { TOKENS_NUM } from '@ui/styles/tokens';

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
  stage: 'far',
  labelStagger: 0,
};
const art = { east: { texture: Texture.EMPTY, spec: ARMY_BODY_ART.east } };
function visuals(part: ReturnType<typeof createArmyChip>) {
  const group = part.container.children.find((c) => c.label === 'armyPlate') as Container;
  return { group, backing: group.children[0] as Graphics, seal: group.children[3] as Graphics };
}
function paints(g: Graphics) {
  return g.context.instructions.filter(
    (i): i is FillInstruction | StrokeInstruction => i.action === 'fill' || i.action === 'stroke',
  );
}
function sealSnapshot(g: Graphics) {
  return JSON.stringify(
    paints(g).map((i) => ({
      action: i.action,
      color: i.data.style.color,
      alpha: i.data.style.alpha,
      width: i.action === 'stroke' ? i.data.style.width : undefined,
      shapes: i.data.path.shapePath.shapePrimitives.map((p) => p.shape),
    })),
  );
}
describe('actual FAR empty register paint', () => {
  it.each(['friendly', 'enemy', 'neutral'] as const)(
    'clears only empty backing and retains the exact %s seal and frame',
    (relation) => {
      const part = createArmyChip();
      part.update({ ...base, relation });
      const { backing, seal, group } = visuals(part);
      const before = sealSnapshot(seal);
      const frame = part.getAnnotationFrames();
      const bounds = part.getPlateBounds();
      try {
        expect(paints(backing)).toEqual([]);
        expect(paints(seal).length).toBeGreaterThan(0);
        expect(backing.visible).toBe(true);
        expect(group.visible).toBe(true);
        expect(frame?.relation.visible).toBe(true);
        expect(frame?.number.visible).toBe(false);
        expect(frame?.state.visible).toBe(false);
        expect(frame?.supply.visible).toBe(false);
        expect(bounds).toMatchObject({ width: 13, height: 16 });
        part.update({ ...base, relation, selected: true });
        expect(sealSnapshot(seal)).toBe(before);
        part.update({ ...base, relation });
        expect(sealSnapshot(seal)).toBe(before);
        expect(part.getAnnotationFrames()).toEqual(frame);
        expect(part.getPlateBounds()).toEqual(bounds);
        expect(paints(backing)).toEqual([]);
      } finally {
        part.destroy();
      }
    },
  );
  it('retains every required inverse row and returns to empty paint without stale cache', () => {
    const part = createArmyChip();
    const controls: Partial<ArmyChipProps>[] = [
      { selected: true },
      { collapsedCount: 3 },
      { status: 'routed' },
      { status: 'engaged' },
      { status: 'sieging' },
      { status: 'subjugating' },
      { corps: true },
      { foodDays: 5 },
      { foodDays: 3 },
      { foodDays: 0 },
    ];
    try {
      for (const control of controls) {
        part.update({ ...base, ...control });
        const emitted = paints(visuals(part).backing);
        expect(emitted).toHaveLength(2);
        expect(emitted[0]?.data.style).toMatchObject({ color: TOKENS_NUM.ink900, alpha: 1 });
        expect(emitted[1]?.data.style).toMatchObject({ color: TOKENS_NUM.washi100, alpha: 0.28 });
        part.update(base);
        expect(paints(visuals(part).backing)).toEqual([]);
      }
    } finally {
      part.destroy();
    }
  });
  it('preserves offset, scale, children and styles through stage and asynchronous art changes', () => {
    const part = createArmyChip();
    part.update(base);
    const { group, backing, seal } = visuals(part);
    const children = [...group.children];
    const styles = children
      .filter((c): c is BitmapText => c instanceof BitmapText)
      .map((c) => c.style);
    const sealPaint = sealSnapshot(seal);
    part.setPlateOffset({ x: 9, y: -4 });
    part.setPlateScale(14 / 12);
    const frame = part.getAnnotationFrames();
    const bounds = part.getPlateBounds();
    try {
      for (const stage of ['mid', 'near', 'far'] as const) {
        part.update({ ...base, stage });
        expect(paints(backing)).toHaveLength(stage === 'far' ? 0 : 2);
        expect(sealSnapshot(seal)).toBe(sealPaint);
      }
      for (const value of [art, {}, art]) {
        part.setBodyArt(value);
        expect(paints(backing)).toEqual([]);
        expect(part.getAnnotationFrames()).toEqual(frame);
        expect(part.getPlateBounds()).toEqual(bounds);
        expect(group.children).toEqual(children);
        expect(
          children.filter((c): c is BitmapText => c instanceof BitmapText).map((c) => c.style),
        ).toEqual(styles);
      }
      expect(part.update(base)).toBe(false);
      expect(paints(backing)).toEqual([]);
    } finally {
      part.destroy();
    }
    expect(children.every((c) => c.destroyed)).toBe(true);
  });
});
