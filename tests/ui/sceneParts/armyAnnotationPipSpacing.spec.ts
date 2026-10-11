import { BitmapText, Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createArmyChip, type ArmyChipProps } from '@ui/map/sceneParts/armyChip';
import { ARMY_BODY_ART } from '@ui/map/sceneParts/armyBodyArt';

const props: ArmyChipProps = {
  pos: { x: 123, y: 456 },
  colorIndex: 3,
  soldiers: 1,
  morale: 80,
  corps: false,
  status: 'sieging',
  foodDays: 0,
  relation: 'friendly',
  selected: false,
  heading: null,
  stage: 'near',
  labelStagger: 0,
};
const art = { east: { texture: Texture.EMPTY, spec: ARMY_BODY_ART.east } };
function visuals(chip: ReturnType<typeof createArmyChip>) {
  const group = chip.container.children.find((c) => c.label === 'armyPlate') as Container;
  return { group, plate: group.children[0] as Graphics, pips: group.children[2] as Graphics };
}

describe('physical army annotation pip spacing', () => {
  it.each([
    ['near', false, 0],
    ['mid', true, 0],
    ['far', true, 2],
    ['near', false, 3],
  ] as const)(
    'packs the actual full-sized pips at %s/selected=%s/stagger=%s without clipping',
    (stage, selected, labelStagger) => {
      const chip = createArmyChip();
      const { plate, pips } = visuals(chip);
      const circle = vi.spyOn(pips, 'circle');
      const baseY = 1 + labelStagger * 17;
      chip.update({ ...props, stage, selected, labelStagger });
      try {
        expect(circle.mock.calls).toEqual([
          [5, baseY + 19, 2],
          [12, baseY + 19, 2],
          [19, baseY + 19, 2],
        ]);
        expect(pips.position).toMatchObject({ x: 12, y: -0.75 });
        const actual = pips.getLocalBounds();
        const backing = plate.getLocalBounds();
        expect(actual.y + pips.position.y - (backing.y + backing.height)).toBe(0.75);
        const bound = chip.getPlateBounds()!;
        expect(bound.height).toBe(20.75);
        expect(actual.x + pips.position.x).toBeGreaterThanOrEqual(bound.x);
        expect(actual.x + pips.position.x + actual.width).toBeLessThanOrEqual(
          bound.x + bound.width,
        );
        expect(actual.y + pips.position.y + actual.height).toBe(bound.y + bound.height);
        const frames = chip.getAnnotationFrames()!;
        for (const cell of [frames.relation, frames.state, frames.supply, frames.number]) {
          if (cell.rect)
            expect(cell.rect.y + cell.rect.height).toBeLessThan(actual.y + pips.position.y);
        }
      } finally {
        chip.destroy();
      }
    },
  );
  it('preserves physical spacing, styles and draw count across zoom, movement and async art admission', () => {
    const chip = createArmyChip();
    chip.update(props);
    const { group, pips, plate } = visuals(chip);
    const styles = group.children
      .filter((c): c is BitmapText => c instanceof BitmapText)
      .map((c) => c.style);
    const styleDestroy = styles.slice(1).map((style) => vi.spyOn(style, 'destroy'));
    const children = [...group.children];
    const clear = vi.spyOn(pips, 'clear');
    const plateClear = vi.spyOn(plate, 'clear');
    const hit = chip.container.hitArea;
    chip.setPlateScale(14 / 12);
    chip.setPlateOffset({ x: -8, y: 6 });
    expect(chip.getPlateBounds()!.height).toBeCloseTo((20.75 * 14) / 12);
    expect(chip.getPlateTypography()).toEqual({ fontSize: 12, scale: 14 / 12 });
    expect(chip.update({ ...props, pos: { x: 321, y: 654 } })).toBe(false);
    chip.setBodyArt(art);
    chip.setBodyArt({});
    expect(clear).not.toHaveBeenCalled();
    expect(plateClear).not.toHaveBeenCalled(); // urgent inverse material remains unchanged
    expect(group.children).toEqual(children);
    expect(group.position).toMatchObject({ x: -8, y: 6 });
    expect(pips.position).toMatchObject({ x: 12, y: -0.75 });
    expect(chip.container.hitArea).toBe(hit);
    chip.destroy();
    chip.destroy();
    for (const destroy of styleDestroy) expect(destroy).toHaveBeenCalledTimes(1);
    expect(pips.destroyed).toBe(true);
    expect(chip.getPlateBounds()).toBeNull();
    expect(Texture.EMPTY.destroyed).toBe(false);
  });
  it('does not reduce the row-only FAR bounds when morale pips are absent', () => {
    const chip = createArmyChip();
    chip.update({ ...props, stage: 'far' });
    expect(chip.getPlateBounds()!.height).toBe(16);
    expect(visuals(chip).pips.context.instructions).toHaveLength(0);
    expect(chip.getAnnotationFrames()!.number.visible).toBe(false);
    chip.destroy();
  });
});
