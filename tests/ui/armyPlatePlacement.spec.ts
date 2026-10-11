import { Container, Graphics, Texture } from 'pixi.js';
import { expect, it, vi } from 'vitest';
import { createArmyChip, type ArmyChipProps } from '../../src/ui/map/sceneParts/armyChip';

const props: ArmyChipProps = {
  pos: { x: 123, y: 456 },
  colorIndex: 3,
  soldiers: 1,
  morale: 80,
  corps: false,
  status: 'marching',
  foodDays: 20,
  relation: 'friendly',
  selected: false,
  heading: null,
  stage: 'near',
  labelStagger: 0,
};
function part() {
  const chip = createArmyChip() as ReturnType<typeof createArmyChip> & {
    getPlateBounds(): { x: number; y: number; width: number; height: number } | null;
    setPlateOffset(offset: { x: number; y: number }): boolean;
  };
  expect(typeof chip.getPlateBounds).toBe('function');
  expect(typeof chip.setPlateOffset).toBe('function');
  return chip;
}
function group(root: Container, name: string) {
  const result = root.children.find((child) => child.label === name);
  expect(result).toBeInstanceOf(Container);
  return result as Container;
}

it('measures real body and flags independently of plate displacement and releases bounds on destroy', () => {
  const chip = part();
  expect(chip.getBodyBounds()).toBeNull();
  chip.update(props);
  const bounds = chip.getBodyBounds()!;
  const actual = group(chip.container, 'armyBody').getLocalBounds();
  expect(bounds).toEqual({ x: actual.x, y: actual.y, width: actual.width, height: actual.height });
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.y).toBeLessThan(-20);
  const hit = chip.container.hitArea;
  chip.setPlateOffset({ x: 48, y: 0 });
  expect(chip.getBodyBounds()).toEqual(bounds);
  expect(chip.container.hitArea).toBe(hit);
  chip.getBodyBounds()!.width = 999;
  expect(chip.getBodyBounds()).toEqual(bounds);
  chip.destroy();
  expect(chip.getBodyBounds()).toBeNull();
});

it('returns baseline bounds covering the actual stroke and all three pips, independent of offset', () => {
  const chip = part();
  expect(chip.getPlateBounds()).toBeNull();
  const body = group(chip.container, 'armyBody').children[0] as Graphics;
  const bodyCircles = vi.spyOn(body, 'circle');
  const pips = group(chip.container, 'armyPlate').children[2] as Graphics;
  const pipCircles = vi.spyOn(pips, 'circle');
  chip.update(props);
  expect(pipCircles.mock.calls).toEqual([
    [5, 20, 2],
    [12, 20, 2],
    [19, 20, 2],
  ]);
  expect(pips.position.x).toBe(12); // unchanged pip geometry in the number column
  expect(pips.position.y).toBe(-0.75); // physical packing retains full-sized circles
  expect(bodyCircles.mock.calls.filter((call) => call[2] === 2)).toEqual([]);
  expect(chip.getPlateBounds()).toEqual({ x: -0.5, y: 0.5, width: 34, height: 20.75 });
  const bounds = chip.getPlateBounds()!;
  for (const [x, y, radius] of pipCircles.mock.calls) {
    expect(x + pips.position.x - radius).toBeGreaterThanOrEqual(bounds.x);
    expect(x + pips.position.x + radius).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(y + pips.position.y - radius).toBeGreaterThanOrEqual(bounds.y);
    expect(y + pips.position.y + radius).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
  const before = chip.getPlateBounds();
  chip.getPlateBounds()!.width = 999;
  expect(chip.getPlateBounds()).toEqual(before);
  expect(chip.setPlateOffset({ x: 30, y: -20 })).toBe(true);
  expect(chip.getPlateBounds()).toEqual(before);
  expect(chip.container.position).toMatchObject(props.pos);
  chip.destroy();
});

it('offsets only the plate group without rebuilding body, flags, plate or text', () => {
  const chip = part();
  chip.update(props);
  const body = group(chip.container, 'armyBody');
  const plate = group(chip.container, 'armyPlate');
  const clears = body.children
    .filter((child) => child instanceof Graphics)
    .map((child) => vi.spyOn(child, 'clear'));
  const plateClear = vi.spyOn(plate.children[0] as Graphics, 'clear');
  const hit = chip.container.hitArea;
  expect(chip.setPlateOffset({ x: 24, y: 16 })).toBe(true);
  expect(plate.position).toMatchObject({ x: 24, y: 16 });
  const leader = chip.container.children.find(
    (child) => child.label === 'armyPlateLeader',
  ) as Graphics;
  expect(leader.visible).toBe(true);
  expect(chip.container.hitArea).toBe(hit);
  for (const clear of clears) expect(clear).not.toHaveBeenCalled();
  expect(plateClear).not.toHaveBeenCalled();
  expect(chip.setPlateOffset({ x: 24, y: 16 })).toBe(false);
  expect(chip.setPlateOffset({ x: NaN, y: 0 })).toBe(false);
  expect(chip.setPlateOffset({ x: 0, y: Infinity })).toBe(false);
  expect(plate.position).toMatchObject({ x: 24, y: 16 });
  chip.destroy();
});

it('keeps offsets, pips and labels across asynchronous art admission and ordinary movement', () => {
  const chip = part();
  chip.update(props);
  chip.setPlateOffset({ x: -12, y: 8 });
  const plate = group(chip.container, 'armyPlate');
  const pips = plate.children[2] as Graphics;
  const clear = vi.spyOn(pips, 'clear');
  chip.setBodyArt({
    east: {
      texture: Texture.EMPTY,
      spec: {
        assetId: 'test.army',
        contentBounds: { x: 0, y: 0, width: 10, height: 10 },
        groundAnchor: { x: 5, y: 10 },
      },
    },
  });
  expect(clear).not.toHaveBeenCalled();
  expect(plate.position).toMatchObject({ x: -12, y: 8 });
  expect(chip.update({ ...props, pos: { x: 124, y: 457 } })).toBe(false);
  expect(plate.position).toMatchObject({ x: -12, y: 8 });
  chip.destroy();
  expect(Texture.EMPTY.destroyed).toBe(false);
});

it('retains far relation bounds and leader while hiding ordinary numbers, with selected and collapsed exceptions', () => {
  const chip = part();
  chip.update({ ...props, stage: 'far' });
  chip.setPlateOffset({ x: 20, y: 20 });
  expect(chip.getPlateBounds()).toEqual({ x: -0.5, y: 0.5, width: 13, height: 16 });
  expect(group(chip.container, 'armyPlate').children[1]!.visible).toBe(false);
  const leader = chip.container.children.find((child) => child.label === 'armyPlateLeader')!;
  expect(leader.visible).toBe(true);
  chip.update({ ...props, stage: 'far', selected: true });
  expect(chip.getPlateBounds()).not.toBeNull();
  expect(leader.visible).toBe(true);
  chip.update({ ...props, stage: 'far', collapsedCount: 3 });
  expect(chip.getPlateBounds()).toEqual({ x: -0.5, y: 0.5, width: 33, height: 16 });
  chip.setPlateOffset({ x: 0, y: 0 });
  expect(leader.visible).toBe(false);
  const destroy = vi.spyOn(chip.container, 'destroy');
  chip.destroy();
  chip.destroy();
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(chip.setPlateOffset({ x: 1, y: 1 })).toBe(false);
  expect(chip.getPlateBounds()).toBeNull();
});
