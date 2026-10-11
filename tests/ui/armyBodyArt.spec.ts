import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  armyFacing,
  ARMY_BODY_ART,
  armyBodyArtPlacement,
  type ArmyBodyArtSpec,
} from '@ui/map/sceneParts/armyBodyArt';
import { createArmyChip, drawArmyChip, type ArmyChipProps } from '@ui/map/sceneParts/armyChip';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { makeRec } from './sceneParts/recordingGraphics';

function armyGroup(part: ReturnType<typeof createArmyChip>, name: string): Container {
  return part.container.children.find((child) => child.label === name) as Container;
}

// Synthetic frame isolates placement math; separate cases below exercise real authored metadata.
const spec: ArmyBodyArtSpec = {
  assetId: 'test.soldiers',
  contentBounds: { x: 5, y: 10, width: 90, height: 80 },
  groundAnchor: { x: 50, y: 85 },
};
const props: ArmyChipProps = {
  pos: { x: 123, y: 456 },
  colorIndex: 3,
  soldiers: 1000,
  morale: 80,
  corps: true,
  status: 'marching',
  foodDays: 20,
  relation: 'friendly',
  selected: true,
  heading: { x: 1, y: 0 },
  stage: 'near',
  labelStagger: 0,
};

describe('directional original army art', () => {
  it('uses premultiplied ONE/ONE light: actual dark asset gains ink contrast without transparent-edge light', () => {
    // Installed public standard blend + shader, not an offscreen filter or straight-alpha add.
    const blend = readFileSync(
      'node_modules/pixi.js/lib/rendering/renderers/gl/state/mapWebGLBlendModesToPixi.mjs',
      'utf8',
    );
    const shader = readFileSync(
      'node_modules/pixi.js/lib/rendering/high-shader/shader-bits/colorBit.mjs',
      'utf8',
    );
    expect(blend).toContain('blendMap.add = [gl.ONE, gl.ONE]');
    expect(shader).toContain('aColor.rgb * aColor.a');
    const png = PNG.sync.read(readFileSync('public/assets/textures/army-infantry-east-v1.png'));
    let invalid = 0,
      dark = 0,
      partial = 0,
      transparent = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const rgb = (png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3;
      const alpha = png.data[i + 3]! / 255;
      const gain = rgb * alpha * 0.28;
      if (alpha === 0) {
        if (gain !== 0) invalid++;
        transparent++;
      } else if (alpha < 1) {
        if (gain > rgb * 0.28 || (rgb > 0 && gain >= rgb * 0.28)) invalid++;
        partial++;
      }
      if (alpha >= 0.9 && rgb >= 30 && rgb <= 100) {
        if (gain < 7.56) invalid++;
        dark++;
      }
    }
    expect(dark).toBeGreaterThan(1000);
    expect(partial).toBeGreaterThan(1000);
    expect(transparent).toBeGreaterThan(1000);
    expect(invalid).toBe(0);
  });
  it.each([
    ['east', { x: 1, y: 0 }],
    ['west', { x: -1, y: 0 }],
    ['north', { x: 0, y: -1 }],
    ['south', { x: 0, y: 1 }],
  ] as const)(
    'makes the actual %s operational Sprite readable while preserving close geometry and global feet',
    (direction, heading) => {
      const texture = new Texture({
        source: new BufferImageSource({
          resource: new Uint8Array(1254 * 1254 * 4),
          width: 1254,
          height: 1254,
        }),
      });
      const spec = ARMY_BODY_ART[direction];
      const part = createArmyChip();
      const models = new Container(),
        ground = new Container();
      part.attachDepthLayers(models, ground);
      part.container.scale.set(1.5);
      part.setBodyArt({ [direction]: { texture, spec } });
      const hit = part.container.hitArea;
      let sprite: Sprite | undefined;
      let nearBefore: { x: number; y: number; scale: number } | undefined;
      for (const stage of ['near', 'mid', 'near'] as const) {
        part.update({ ...props, heading, stage });
        sprite = part.depthBody.children.find((child) => child instanceof Sprite);
        if (!sprite) throw new Error('Missing painted directional Sprite');
        const expected = Math.min(
          (stage === 'mid' ? 32 : 26) / spec.contentBounds.width,
          (stage === 'mid' ? 34 : 28) / spec.contentBounds.height,
        );
        expect(sprite.texture).toBe(texture);
        expect(sprite.scale.x).toBeCloseTo(expected, 12);
        expect(sprite.scale.y).toBe(sprite.scale.x);
        expect(sprite.rotation).toBe(0);
        if (stage === 'near' && nearBefore === undefined) {
          expect(part.depthBody.children).toHaveLength(2);
          expect(part.depthBody.children.filter((child) => child instanceof Sprite)).toHaveLength(
            1,
          );
        }
        const visibleModels = part.depthBody.children.filter(
          (child) => child instanceof Sprite && child.visible,
        );
        expect(visibleModels).toHaveLength(stage === 'mid' ? 2 : 1);
        if (stage === 'mid') {
          const light = visibleModels.find((child) => child !== sprite);
          if (!(light instanceof Sprite)) throw new Error('Missing operational light Sprite');
          expect(light.blendMode).toBe('add');
          expect(light.alpha).toBe(0.28);
          expect(light.texture).toBe(sprite.texture);
          expect(light.position).toMatchObject({ x: sprite.position.x, y: sprite.position.y });
          expect(light.scale).toMatchObject({ x: sprite.scale.x, y: sprite.scale.y });
          expect(light.rotation).toBe(0);
          expect(light.tint).toBe(0xffffff);
          expect(light.filters == null).toBe(true);
        }
        const actualFrame = {
          x: sprite.position.x + spec.contentBounds.x * sprite.scale.x,
          y: sprite.position.y + spec.contentBounds.y * sprite.scale.y,
          width: spec.contentBounds.width * sprite.scale.x,
          height: spec.contentBounds.height * sprite.scale.y,
        };
        const obstacle = part.getSoldierBounds();
        expect(obstacle).not.toBeNull();
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(obstacle![key]).toBeCloseTo(actualFrame[key], 12);
        expect(sprite.parent).toBe(part.depthBody);
        expect(part.container.hitArea).toBe(hit);
        expect(part.container.position).toMatchObject(props.pos);
        const foot = sprite.toGlobal(spec.groundAnchor);
        expect(foot.x).toBeCloseTo(props.pos.x + 11 * 1.5);
        expect(foot.y).toBeCloseTo(props.pos.y - 1 * 1.5);
        const placement = { x: sprite.position.x, y: sprite.position.y, scale: sprite.scale.x };
        if (stage === 'near') {
          if (nearBefore) expect(placement).toEqual(nearBefore);
          else nearBefore = placement;
        }
      }
      part.update({ ...props, heading, stage: 'far' });
      expect(sprite!.visible).toBe(false);
      expect(
        part.depthBody.children.filter((child) => child instanceof Sprite && child.visible),
      ).toHaveLength(0);
      expect(part.getSoldierBounds()).toBeNull();
      expect(part.getPaintedProfile().painted).toBe(false);
      part.destroy();
      part.destroy();
      expect(part.getSoldierBounds()).toBeNull();
      expect(models.children).toHaveLength(0);
      expect(ground.children).toHaveLength(0);
      expect(texture.destroyed).toBe(false);
      expect(texture.source.destroyed).toBe(false);
      models.destroy();
      ground.destroy();
      texture.destroy(true);
    },
  );
  it('reports actual painted signal Graphics independently of extracted soldiers and preserves the hit anchor', () => {
    const part = createArmyChip();
    const models = new Container(),
      ground = new Container();
    part.attachDepthLayers(models, ground);
    part.update({
      ...props,
      morale: 50,
      selected: false,
      corps: false,
      relation: 'friendly',
      heading: null,
    });
    const hit = part.container.hitArea;
    part.setBodyArt({ east: { texture: Texture.EMPTY, spec } });
    const profile = part.getPaintedProfile();
    expect(profile.painted).toBe(true);
    const signal = armyGroup(part, 'armyBody').children.find((c) => c.label === 'armySignals')!
      .children[0] as Graphics;
    const actual = signal.getLocalBounds();
    expect(profile.signalBounds).toEqual({
      x: actual.x,
      y: actual.y,
      width: actual.width,
      height: actual.height,
    });
    // Actual flag stroke includes its miter above the 24-unit pole, not a fabricated bbox.
    expect(actual.minY).toBeGreaterThan(-27);
    expect(actual.minY).toBeLessThan(-24);
    expect(part.depthBody.children.some((child) => child instanceof Sprite)).toBe(true);
    expect(part.container.hitArea).toBe(hit);
    part.update({ ...props, stage: 'far' });
    expect(part.getPaintedProfile().painted).toBe(false);
    part.update({ ...props, heading: { x: -1, y: 0 } });
    expect(part.getPaintedProfile().painted).toBe(false);
    part.destroy();
    expect(part.getPaintedProfile()).toEqual({
      painted: false,
      signalBounds: null,
      signalBaselineBounds: null,
    });
    expect(Texture.EMPTY.destroyed).toBe(false);
    models.destroy();
    ground.destroy();
  });
  it('runtime raster flag is compact while fallback and far retain the authored legacy footprint', () => {
    const texture = new Texture({
      source: new BufferImageSource({ resource: new Uint8Array(400), width: 10, height: 10 }),
    });
    const part = createArmyChip();
    const rear = armyGroup(part, 'armyBody').children[0] as Graphics;
    const polygons = vi.spyOn(rear, 'poly');
    const original = structuredClone(props);
    part.update(props);
    expect(polygons.mock.calls[0]![0]).toEqual([0, -30, 18, -30, 12, -17, 18, -4, 0, -4]);
    polygons.mockClear();
    part.setBodyArt({ east: { texture, spec } });
    const banner = armyGroup(part, 'armyBody').children.find((c) => c.label === 'armySignals')!
      .children[0] as Graphics;
    const compactPolygons = vi.spyOn(banner, 'poly');
    part.update({ ...props, morale: props.morale + 1 });
    expect(compactPolygons.mock.calls[0]![0]).toEqual([
      0, -24, 9.9, -24, 6.6, -18.5, 9.9, -13, 0, -13,
    ]);
    polygons.mockClear();
    part.update({ ...props, stage: 'far' });
    expect(polygons.mock.calls[0]![0]).toEqual([0, -30, 18, -30, 12, -17, 18, -4, 0, -4]);
    expect(props).toEqual(original);
    expect(part.container.position).toMatchObject(props.pos);
    part.destroy();
    texture.destroy(true);
  });

  it('factory troop plate retains ink and ivory contrast with relation and corps columns', () => {
    const part = createArmyChip();
    const plate = armyGroup(part, 'armyPlate').children[0] as Graphics;
    const fill = vi.spyOn(plate, 'fill');
    const rect = vi.spyOn(plate, 'roundRect');
    part.update(props);
    const label = armyGroup(part, 'armyPlate').children[1] as import('pixi.js').BitmapText;
    expect(fill).toHaveBeenCalledWith({ color: TOKENS_NUM.ink900 });
    expect(label.style.fill).toBe(TOKENS_NUM.washi100);
    expect(label.style.fontSize).toBe(12);
    expect(label.position).toMatchObject({ x: 15, y: 2 });
    expect(rect).toHaveBeenCalledWith(0, 1, 67, 15, 2); // relation12 + number41 + corps14
    const luminance = (color: number) => {
      const rgb = [color >> 16, (color >> 8) & 255, color & 255].map((channel) => {
        const s = channel / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    };
    expect(
      (luminance(TOKENS_NUM.washi100) + 0.05) / (luminance(TOKENS_NUM.ink900) + 0.05),
    ).toBeGreaterThan(4.5);
    part.destroy();
  });

  it.each([
    [999, 14],
    [1000, 18],
    [2999, 18],
    [3000, 22],
  ])(
    'painted %i troops retain width-tier ordering with compact cloth, clipped corps belt and fixed ground channels',
    (soldiers, width) => {
      const input = { ...props, soldiers };
      const before = structuredClone(input);
      const compact = makeRec();
      const legacy = makeRec();
      drawArmyChip(compact.g, input, 'rear', 'painted');
      drawArmyChip(legacy.g, input, 'rear');
      const fw = width * 0.55;
      const cloth = compact.rec.argsOf('poly')[0]![0] as number[];
      const expected = [0, -24, fw, -24, fw - 3.3, -18.5, fw, -13, 0, -13];
      expect(cloth).toHaveLength(expected.length);
      cloth.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(expected[index]!));
      const belt = compact.rec.argsOf('poly')[1]![0] as number[];
      expect(belt[2]).toBeCloseTo(fw - 3.3 * (1 - 3 / 11));
      expect(belt[4]).toBeCloseTo(fw - 3.3);
      expect(belt[5]).toBe(-18.5);
      expect(compact.rec.argsOf('ellipse')).toEqual(legacy.rec.argsOf('ellipse'));
      expect(compact.rec.argsOf('moveTo')).toEqual(legacy.rec.argsOf('moveTo')); // fixed ground/pole base
      expect(compact.rec.argsOf('lineTo')[0]).toEqual([0, -24]);
      expect(legacy.rec.argsOf('lineTo')[0]).toEqual([0, -30]);
      expect(input).toEqual(before);
    },
  );

  it('painted front keeps arrow and morale pips, but anchors enemy tail and badge to compact cloth', () => {
    const input = {
      ...props,
      relation: 'enemy' as const,
      corps: false,
      status: 'engaged' as const,
    };
    const compact = makeRec();
    const legacy = makeRec();
    drawArmyChip(compact.g, input, 'front', 'painted');
    drawArmyChip(legacy.g, input, 'front');
    expect(compact.rec.argsOf('poly')[0]![0]).toEqual([9.9, -23.5, 15.9, -18.5, 9.9, -13.5]);
    expect(compact.rec.argsOf('circle')).toEqual(legacy.rec.argsOf('circle')); // actual morale pips
    expect(compact.rec.argsOf('moveTo')[1]).toEqual(legacy.rec.argsOf('moveTo')[1]); // arrow
    const badgeMoves = compact.rec.argsOf('moveTo').slice(-2);
    expect(badgeMoves[0]![0]).toBeCloseTo(11.9); // fw + original badgeGap
    expect(badgeMoves[0]![1]).toBe(-26);
  });

  it('painted routed cloth uses the original droop pivot and low morale cracks stay inside the compact frame', () => {
    const rear = makeRec();
    drawArmyChip(rear.g, { ...props, status: 'routed' }, 'rear', 'painted');
    const cloth = rear.rec.argsOf('poly')[0]![0] as number[];
    const angle = (20 * Math.PI) / 180;
    expect(cloth.slice(0, 2)).toEqual([0, -24]);
    expect(cloth[2]).toBeCloseTo(9.9 * Math.cos(angle));
    expect(cloth[3]).toBeCloseTo(-24 + 9.9 * Math.sin(angle));
    const front = makeRec();
    drawArmyChip(
      front.g,
      { ...props, morale: 10, corps: false, heading: null },
      'front',
      'painted',
    );
    for (const point of [...front.rec.argsOf('moveTo'), ...front.rec.argsOf('lineTo')]) {
      expect(point[0]).toBeGreaterThanOrEqual(2);
      expect(point[0]).toBeLessThanOrEqual(7.9);
      expect(point[1]).toBeGreaterThanOrEqual(-22);
      expect(point[1]).toBeLessThanOrEqual(-15);
    }
  });

  it.each([
    [999, 14],
    [1000, 18],
    [3000, 22],
  ])(
    'painted low-morale strokes for %i troops stay inside the actual swallow-tail polygon at endpoints and midpoints',
    (soldiers, width) => {
      const front = makeRec();
      drawArmyChip(
        front.g,
        { ...props, soldiers, morale: 10, corps: false, heading: null },
        'front',
        'painted',
      );
      const fw = width * 0.55;
      const rightBoundary = (y: number) => fw - 3.3 * (1 - Math.abs(y + 18.5) / 5.5);
      let previous: [number, number] | null = null;
      let segments = 0;
      for (const [command, rawX, rawY] of front.rec.calls) {
        if (command !== 'moveTo' && command !== 'lineTo') continue;
        const point: [number, number] = [Number(rawX), Number(rawY)];
        if (command === 'lineTo' && previous) {
          const samples: Array<[number, number]> = [
            previous,
            point,
            [(previous[0] + point[0]) / 2, (previous[1] + point[1]) / 2],
          ];
          for (const [x, y] of samples) {
            expect(y).toBeGreaterThan(-24);
            expect(y).toBeLessThan(-13);
            expect(x).toBeGreaterThanOrEqual(0.5);
            expect(x).toBeLessThanOrEqual(rightBoundary(y) - 0.5);
          }
          segments++;
        }
        previous = point;
      }
      expect(segments).toBeGreaterThanOrEqual(3);
    },
  );
  it.each(['east', 'west', 'north', 'south'] as const)(
    '%s real frame fits the existing picking footprint with feet above the label',
    (direction) => {
      const spec = ARMY_BODY_ART[direction];
      const frame = spec.contentBounds;
      const placement = armyBodyArtPlacement(spec);
      expect(frame.width * placement.scale).toBeLessThanOrEqual(26);
      expect(frame.height * placement.scale).toBeLessThanOrEqual(28);
      expect(placement.x + frame.x * placement.scale).toBeGreaterThanOrEqual(-6);
      expect(placement.x + (frame.x + frame.width) * placement.scale).toBeLessThanOrEqual(28);
      expect(placement.y + frame.y * placement.scale).toBeGreaterThanOrEqual(-36);
      expect(placement.y + (frame.y + frame.height) * placement.scale).toBeLessThan(1);
    },
  );
  it('height-limits a narrow portrait without stretching it into a towering formation', () => {
    const narrow = { ...spec, contentBounds: { x: 0, y: 0, width: 20, height: 100 } };
    const placement = armyBodyArtPlacement(narrow);
    expect(narrow.contentBounds.height * placement.scale).toBeCloseTo(28);
    expect(narrow.contentBounds.width * placement.scale).toBeLessThan(26);
  });
  it.each([
    [null, 'east'],
    [{ x: 0, y: 0 }, 'east'],
    [{ x: 1, y: 1 }, 'east'],
    [{ x: -1, y: 1 }, 'west'],
    [{ x: 0.2, y: -1 }, 'north'],
    [{ x: -0.2, y: 1 }, 'south'],
  ] as const)('preserves dominant-axis facing %j -> %s', (heading, direction) => {
    expect(armyFacing(heading)).toBe(direction);
  });

  it('keeps flag/corps behind soldiers and remaining semantic channels in front', () => {
    const rear = makeRec();
    const front = makeRec();
    drawArmyChip(rear.g, props, 'rear');
    drawArmyChip(front.g, props, 'front');
    const rearFills = rear.rec.argsOf('fill').map((args) => args[0] as { color: number });
    const frontFills = front.rec.argsOf('fill').map((args) => args[0] as { color: number });
    expect(rearFills.some((fill) => fill.color === clanColorNum(props.colorIndex))).toBe(true);
    expect(frontFills.some((fill) => fill.color === clanColorNum(props.colorIndex))).toBe(false);
    expect(rear.rec.argsOf('ellipse').length).toBeGreaterThan(0);
    expect(front.rec.argsOf('ellipse')).toHaveLength(0);
    expect(front.rec.argsOf('circle').length).toBeGreaterThan(0); // morale pips unchanged
  });

  it('switches the real Sprite across four distinct shared textures without changing labels, picking or material tint', () => {
    const makeTexture = () =>
      new Texture({
        source: new BufferImageSource({
          resource: new Uint8Array(1254 * 1254 * 4),
          width: 1254,
          height: 1254,
        }),
      });
    const art = {
      east: { texture: makeTexture(), spec: ARMY_BODY_ART.east },
      west: { texture: makeTexture(), spec: ARMY_BODY_ART.west },
      north: { texture: makeTexture(), spec: ARMY_BODY_ART.north },
      south: { texture: makeTexture(), spec: ARMY_BODY_ART.south },
    };
    const directions = [
      ['east', { x: 1, y: 0 }],
      ['west', { x: -1, y: 0 }],
      ['north', { x: 0, y: -1 }],
      ['south', { x: 0, y: 1 }],
    ] as const;
    expect(new Set(Object.values(art).map((entry) => entry.texture)).size).toBe(4);
    const part = createArmyChip();
    part.setBodyArt(art);
    part.update(props);
    const group = armyGroup(part, 'armyBody');
    const sprite = group.children[1] as Sprite;
    const hitArea = part.container.hitArea;
    const plate = armyGroup(part, 'armyPlate').children[0];
    const label = armyGroup(part, 'armyPlate').children[1];
    for (const [direction, heading] of directions) {
      part.update({ ...props, heading, colorIndex: 6 });
      expect(group.children[1]).toBe(sprite);
      expect(sprite.texture).toBe(art[direction].texture);
      expect(sprite.visible).toBe(true);
      expect(sprite.rotation).toBe(0);
      expect(sprite.tint).toBe(0xffffff);
      expect(sprite.scale.x).toBeGreaterThan(0);
      expect(sprite.scale.x).toBe(sprite.scale.y);
      const anchor = art[direction].spec.groundAnchor;
      expect(sprite.position.x + anchor.x * sprite.scale.x).toBeCloseTo(11);
      expect(sprite.position.y + anchor.y * sprite.scale.y).toBeCloseTo(-1);
      expect(part.container.hitArea).toBe(hitArea);
      expect(armyGroup(part, 'armyPlate').children[0]).toBe(plate);
      expect(armyGroup(part, 'armyPlate').children[1]).toBe(label);
    }
    part.destroy();
    for (const entry of Object.values(art)) {
      expect(entry.texture.destroyed).toBe(false);
      entry.texture.destroy(true);
    }
  });

  it('uses a uniform unrotated body between existing rear/front, retaining root indices and safe sharing', () => {
    const source = new BufferImageSource({
      resource: new Uint8Array(100 * 100 * 4),
      width: 100,
      height: 100,
    });
    const texture = new Texture({ source });
    const art = { east: { texture, spec } };
    const a = createArmyChip();
    const b = createArmyChip();
    a.setBodyArt(art);
    b.setBodyArt(art);
    a.update(props);
    b.update(props);
    expect(a.container.children).toHaveLength(3);
    const group = armyGroup(a, 'armyBody');
    const rear = group.children[0] as Graphics;
    const sprite = group.children[1] as Sprite;
    const front = group.children[2] as Graphics;
    expect(rear).toBeInstanceOf(Graphics);
    expect(sprite).toBeInstanceOf(Sprite);
    expect(front).toBeInstanceOf(Graphics);
    expect(sprite.texture).toBe(texture);
    expect(sprite.rotation).toBe(0);
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.scale.x).toBe(sprite.scale.y);
    const placement = armyBodyArtPlacement(spec);
    expect(spec.contentBounds.width * sprite.scale.x).toBeCloseTo(26);
    expect(sprite.position.x + spec.groundAnchor.x * placement.scale).toBeCloseTo(11);
    expect(sprite.position.y + spec.groundAnchor.y * placement.scale).toBeCloseTo(-1);
    expect(a.container.position).toMatchObject(props.pos);
    const hitArea = a.container.hitArea;
    const clear = vi.spyOn(front, 'clear');
    expect(a.update({ ...props })).toBe(false);
    expect(a.update({ ...props, pos: { x: 999, y: 888 } })).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    a.update({ ...props, heading: { x: -1, y: 0 } }); // unavailable west: original full vector
    expect(sprite.visible).toBe(false);
    expect(front.visible).toBe(false);
    a.update({ ...props, stage: 'far' });
    expect(sprite.visible).toBe(false);
    expect(a.container.hitArea).toBe(hitArea);
    a.update(props);
    expect(sprite.visible).toBe(true);
    a.destroy();
    expect(texture.destroyed).toBe(false);
    expect(source.destroyed).toBe(false);
    expect(armyGroup(b, 'armyBody').children[1]?.destroyed).toBe(false);
    b.destroy();
    texture.destroy(true);
  });
});
