import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BitmapText,
  Container,
  Graphics,
  Texture,
  type FillInstruction,
  type StrokeInstruction,
} from 'pixi.js';
import { createArmyChip, type ArmyChipProps } from '@ui/map/sceneParts/armyChip';
import { ARMY_BODY_ART } from '@ui/map/sceneParts/armyBodyArt';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';

afterEach(() => vi.restoreAllMocks());
const props: ArmyChipProps = {
  pos: { x: 100, y: 200 },
  colorIndex: 5,
  soldiers: 2000,
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
function plate(part: ReturnType<typeof createArmyChip>) {
  const group = part.container.children.find((c) => c.label === 'armyPlate') as Container;
  return {
    group,
    g: group.children[0] as Graphics,
    label: group.children[1] as BitmapText,
    pips: group.children[2] as Graphics,
  };
}
function paint(g: Graphics) {
  return g.context.instructions
    .filter(
      (i): i is FillInstruction | StrokeInstruction => i.action === 'fill' || i.action === 'stroke',
    )
    .map((i) => ({
      action: i.action,
      color: i.data.style.color,
      alpha: i.data.style.alpha,
      width: i.action === 'stroke' ? i.data.style.width : undefined,
      primitives: i.data.path.shapePath.shapePrimitives.map(
        (p) => JSON.parse(JSON.stringify(p.shape)) as unknown,
      ),
    }));
}
describe('painted army plate priority material', () => {
  it.each(['mid', 'near'] as const)(
    'uses an opaque earth register and dark exact font for ordinary painted %s',
    (stage) => {
      const part = createArmyChip();
      part.setBodyArt(art);
      part.update({ ...props, stage });
      try {
        const { g, label } = plate(part);
        expect(paint(g)[0]).toMatchObject({ action: 'fill', color: 0xb9aa88, alpha: 1 });
        expect(label.style.fill).toBe(TOKENS_NUM.ink900);
        expect(label.style.fontSize).toBe(12);
        expect(paint(g)[1]).toMatchObject({
          action: 'stroke',
          color: TOKENS_NUM.ink700,
          alpha: 0.26,
          width: 1,
        });
        expect(label.text).toBe(stage === 'mid' ? '2k' : '2,000');
      } finally {
        part.destroy();
      }
    },
  );
  it('retains exact inverse fallback/far material and numerical typography with the relation column', () => {
    for (const stage of ['mid', 'near', 'far'] as const) {
      const part = createArmyChip();
      part.update({ ...props, stage, selected: true });
      try {
        const { g, label } = plate(part);
        const emitted = paint(g);
        expect(emitted).toHaveLength(2);
        expect(emitted[0]).toMatchObject({ action: 'fill', color: TOKENS_NUM.ink900, alpha: 1 });
        expect(emitted[1]).toMatchObject({
          action: 'stroke',
          color: TOKENS_NUM.washi100,
          alpha: 0.28,
          width: 1,
        });
        for (const instruction of emitted) {
          expect(instruction.primitives).toHaveLength(1);
          expect(instruction.primitives[0]).toMatchObject({
            x: 0,
            y: 1,
            width: stage === 'mid' ? 33 : 53, // selected MID keeps the 21-unit pip column + relation12
            height: 15,
            radius: 2,
          });
        }
        expect(label.style.fill).toBe(TOKENS_NUM.washi100);
        expect(label.style.fontFamily).toBe('Noto Serif TC');
        expect(label.style.fontSize).toBe(12);
        expect(label.position).toMatchObject({ x: 15, y: 2 });
        expect(label.text).toBe(stage === 'mid' ? '2k' : '2,000');
        expect(label.visible).toBe(true);
      } finally {
        part.destroy();
      }
    }
  });

  it('synchronizes asynchronous art admission/removal without new private styles, pips, offsets or geometry', () => {
    const part = createArmyChip();
    part.update(props);
    const { group, g, label, pips } = plate(part);
    const style = label.style,
      uid = style.uid;
    part.setPlateOffset({ x: 24, y: -8 });
    part.setPlateScale(14 / 12);
    const bounds = part.getPlateBounds(),
      leader = part.getPlateLeader(),
      hit = part.container.hitArea;
    const shapes = paint(g).map((i) => i.primitives);
    const clear = vi.spyOn(pips, 'clear');
    try {
      part.setBodyArt(art);
      expect(label.style.fill).toBe(TOKENS_NUM.ink900);
      expect(paint(g)[0]!.color).toBe(0xb9aa88);
      expect(label.style).toBe(style);
      expect(label.style.uid).toBe(uid);
      expect(part.getPlateBounds()).toEqual(bounds);
      expect(part.getPlateLeader()).toEqual(leader);
      expect(paint(g).map((i) => i.primitives)).toEqual(shapes);
      expect(group.position).toMatchObject({ x: 24, y: -8 });
      expect(clear).not.toHaveBeenCalled();
      expect(part.container.hitArea).toBe(hit);
      const plateClear = vi.spyOn(g, 'clear');
      const fill = vi.spyOn(style, 'fill', 'set');
      expect(part.update({ ...props, pos: { x: 111, y: 222 } })).toBe(false);
      part.setBodyArt({ ...art });
      expect(plateClear).not.toHaveBeenCalled();
      expect(fill).not.toHaveBeenCalled();
      part.setBodyArt({});
      expect(label.style.fill).toBe(TOKENS_NUM.washi100);
      expect(paint(g)[0]!.color).toBe(TOKENS_NUM.ink900);
      expect(label.style).toBe(style);
      expect(part.getPlateBounds()).toEqual(bounds);
      part.setBodyArt(art);
      part.update({ ...props, heading: { x: -1, y: 0 } });
      expect(label.style.fill).toBe(TOKENS_NUM.washi100); // Missing actual west art.
      part.setBodyArt({ ...art, west: { texture: Texture.EMPTY, spec: ARMY_BODY_ART.west } });
      expect(label.style.fill).toBe(TOKENS_NUM.ink900);
    } finally {
      part.destroy();
      expect(Texture.EMPTY.destroyed).toBe(false);
    }
  });

  it('promotes selection, operational urgency and supply independently, restoring ordinary material afterwards', () => {
    const part = createArmyChip();
    part.setBodyArt(art);
    try {
      for (const change of [
        { selected: true },
        { status: 'routed' as const },
        { status: 'engaged' as const },
        { status: 'sieging' as const },
        { foodDays: 6 },
        { foodDays: 3 },
        { foodDays: 0 },
        { status: 'subjugating' as const, foodDays: 0 },
      ]) {
        part.update({ ...props, ...change });
        const { g, label } = plate(part);
        expect(paint(g)[0]).toMatchObject({ color: TOKENS_NUM.ink900, alpha: 1 });
        expect(paint(g)[1]).toMatchObject({ color: TOKENS_NUM.washi100, alpha: 0.28, width: 1 });
        expect(label.style.fill).toBe(TOKENS_NUM.washi100);
        part.update(props);
        expect(paint(g)[0]!.color).toBe(0xb9aa88);
        expect(label.style.fill).toBe(TOKENS_NUM.ink900);
      }
      for (const change of [{ foodDays: 7 }, { status: 'subjugating' as const }, { corps: true }]) {
        part.update({ ...props, ...change });
        expect(plate(part).label.style.fill).toBe(TOKENS_NUM.ink900);
      }
      for (const change of [{ selected: true }, { collapsedCount: 3 }]) {
        part.update({ ...props, stage: 'far', ...change });
        expect(plate(part).g.visible).toBe(true);
        expect(plate(part).label.style.fill).toBe(TOKENS_NUM.washi100);
        expect(paint(plate(part).g)[0]!.color).toBe(TOKENS_NUM.ink900);
      }
    } finally {
      part.destroy();
    }
  });

  it('retains all forty original clan fills and opaque numerical contrast', () => {
    const lum = (c: number) => {
      const rgb = [c >>> 16, (c >>> 8) & 255, c & 255].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    };
    expect((lum(0xb9aa88) + 0.05) / (lum(TOKENS_NUM.ink900) + 0.05)).toBeGreaterThanOrEqual(4.5);
    for (let colorIndex = 0; colorIndex < 40; colorIndex++) {
      const part = createArmyChip();
      part.setBodyArt(art);
      part.update({ ...props, colorIndex });
      try {
        const body = part.container.children.find((c) => c.label === 'armyBody') as Container;
        const signals = body.children.find((c) => c.label === 'armySignals') as Container;
        expect(
          paint(signals.children[0] as Graphics).some(
            (i) => i.action === 'fill' && i.color === clanColorNum(colorIndex),
          ),
        ).toBe(true);
        expect(paint(plate(part).g)[0]).toMatchObject({ color: 0xb9aa88, alpha: 1 });
      } finally {
        part.destroy();
      }
    }
  });
});
