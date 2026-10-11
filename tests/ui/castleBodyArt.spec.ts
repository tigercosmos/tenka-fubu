import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  CASTLE_BODY_ART,
  BRANCH_CASTLE_BODY_ART,
  CASTLE_BODY_ART_BY_TIER,
  castleBodyArtPlacement,
} from '@ui/map/sceneParts/castleBodyArt';
import { createCastleNode, type CastleNodeProps } from '@ui/map/sceneParts/castleNode';

const props: CastleNodeProps = {
  pos: { x: 123, y: 456 },
  tier: 'main',
  terrainKind: 'plain',
  colorIndex: 2,
  durability: 100,
  maxDurability: 100,
  warning: 'critical',
};
function texture() {
  return new Texture({
    source: new BufferImageSource({
      resource: new Uint8Array(1254 * 1254 * 4),
      width: 1254,
      height: 1254,
    }),
  });
}

describe('original castle body art', () => {
  it.each(['main', 'branch'] as const)(
    'grounds painted %s with a static contact beneath the sprite, without changing presentation geometry',
    (tier) => {
      const image = texture();
      const node = createCastleNode();
      node.update({ ...props, tier });
      const fallback = node.getPresentationGeometry();
      const ellipse = vi.spyOn(Graphics.prototype, 'ellipse');
      const fill = vi.spyOn(Graphics.prototype, 'fill');
      node.setBodyArt({
        [tier]: { plain: { texture: image, spec: CASTLE_BODY_ART_BY_TIER[tier].plain } },
      });
      const group = node.depthBody;
      const contact = group.getChildByLabel('castleGroundContact') as Graphics | null;
      expect(contact).not.toBeNull();
      const sprite = group.children.find((child) => child instanceof Sprite)!;
      expect(group.getChildIndex(contact!)).toBeLessThan(group.getChildIndex(sprite));
      expect(contact!.eventMode).toBe('none');
      expect(contact!.visible).toBe(true);
      expect(fill.mock.calls.slice(0, 2)).toEqual([
        [{ color: 0x514b3d, alpha: 0.12 }],
        [{ color: 0x81745b, alpha: 0.14 }],
      ]);
      expect(ellipse.mock.calls.slice(-2)).toEqual(
        tier === 'main'
          ? [
              [1.5, 1.25, 17, 4.25],
              [0, 0.5, 14, 3],
            ]
          : [
              [1, 1, 12.5, 3.25],
              [0, 0.5, 10, 2.25],
            ],
      );
      const painted = node.getPresentationGeometry();
      const clear = vi.spyOn(contact!, 'clear');
      node.update({ ...props, tier, pos: { x: 321, y: 654 } });
      node.setLodStage('mid');
      expect(clear).not.toHaveBeenCalled();
      expect(node.getPresentationGeometry()).toEqual(painted);
      expect(group.position).toMatchObject({ x: 0, y: 0 });
      const models = new Container();
      const signals = new Container();
      node.attachDepthLayers(models, signals);
      expect(group.parent).toBe(models);
      expect(group.position).toMatchObject({ x: 321, y: 654 });
      expect(contact!.parent).toBe(group);
      expect(group.getChildIndex(contact!)).toBeLessThan(group.getChildIndex(sprite));
      node.setLodStage('far');
      expect(contact!.visible).toBe(false);
      node.setLodStage('near');
      expect(contact!.visible).toBe(true);
      node.setBodyArt({});
      expect(contact!.visible).toBe(false);
      expect(node.getPresentationGeometry()).toMatchObject({
        body: fallback!.body,
        durability: fallback!.durability,
        painted: false,
      });
      ellipse.mockRestore();
      fill.mockRestore();
      node.destroy();
      expect(contact!.destroyed).toBe(true);
      expect(image.destroyed).toBe(false);
      image.destroy(true);
      models.destroy();
      signals.destroy();
    },
  );
  it.each(['plain', 'mountain'] as const)(
    'fits branch %s at20 world units using the actual authored footprint',
    (kind) => {
      const spec = BRANCH_CASTLE_BODY_ART[kind];
      const placement = castleBodyArtPlacement(spec, 20);
      expect(spec.contentBounds.width * placement.scale).toBeCloseTo(20);
      expect(placement.x + spec.groundAnchor.x * placement.scale).toBe(0);
      expect(placement.y + spec.groundAnchor.y * placement.scale).toBe(0);
    },
  );

  it('selects all four real bodies without tinting, retaining overlays, main-only far scale and shared sources', () => {
    const art = {
      main: {
        plain: { texture: texture(), spec: CASTLE_BODY_ART.plain },
        mountain: { texture: texture(), spec: CASTLE_BODY_ART.mountain },
      },
      branch: {
        plain: { texture: texture(), spec: BRANCH_CASTLE_BODY_ART.plain },
        mountain: { texture: texture(), spec: BRANCH_CASTLE_BODY_ART.mountain },
      },
    };
    const a = createCastleNode();
    const b = createCastleNode();
    a.setBodyArt(art);
    b.setBodyArt(art);
    a.update(props);
    b.update(props);
    const group = a.container.children[0] as Container;
    const sprite = group.children[2] as Sprite;
    const vector = group.children[0] as Graphics;
    const overlays = a.container.children.slice(1);
    for (const tier of ['main', 'branch'] as const) {
      for (const terrainKind of ['plain', 'mountain'] as const) {
        a.update({ ...props, tier, terrainKind, colorIndex: 6 });
        const spec = CASTLE_BODY_ART_BY_TIER[tier][terrainKind];
        expect(group.children[2]).toBe(sprite);
        expect(sprite.texture).toBe(art[tier][terrainKind].texture);
        // Painted model widths follow art-bible 6.4.3; placement helper defaults and far vectors stay unchanged.
        expect(spec.contentBounds.width * sprite.scale.x).toBeCloseTo(tier === 'main' ? 40 : 30);
        expect(sprite.scale.x).toBe(sprite.scale.y);
        expect(sprite.scale.x).toBeGreaterThan(0);
        expect(sprite.position.x + spec.groundAnchor.x * sprite.scale.x).toBeCloseTo(0);
        expect(sprite.position.y + spec.groundAnchor.y * sprite.scale.y).toBeCloseTo(0);
        expect(sprite.rotation).toBe(0);
        expect(sprite.tint).toBe(0xffffff);
        expect(a.container.position).toMatchObject(props.pos);
        expect(a.container.children.slice(1)).toEqual(overlays);
        a.setLodStage('far');
        expect(sprite.visible).toBe(false);
        expect(vector.visible).toBe(true);
        expect(group.scale.x).toBe(tier === 'main' ? 1.4 : 1);
        a.setLodStage('near');
        expect(sprite.visible).toBe(true);
      }
    }
    a.setBodyArt({ branch: { plain: art.branch.plain } });
    expect(sprite.visible).toBe(false);
    expect(vector.visible).toBe(true);
    a.destroy();
    for (const tierArt of Object.values(art))
      for (const entry of Object.values(tierArt)) expect(entry.texture.destroyed).toBe(false);
    expect((b.container.children[0] as Container).children[2]?.destroyed).toBe(false);
    b.destroy();
    for (const tierArt of Object.values(art))
      for (const entry of Object.values(tierArt)) entry.texture.destroy(true);
  });
  it.each(['plain', 'mountain'] as const)(
    'fits %s visible width uniformly and anchors the authored ground footprint',
    (kind) => {
      const spec = CASTLE_BODY_ART[kind];
      const placement = castleBodyArtPlacement(spec);
      expect(spec.contentBounds.width * placement.scale).toBeCloseTo(28);
      expect(placement.x + spec.groundAnchor.x * placement.scale).toBe(0);
      expect(placement.y + spec.groundAnchor.y * placement.scale).toBe(0);
    },
  );

  it('replaces only mid/near main body, preserving overlays, world anchor and shared texture lifetime', () => {
    const plain = texture();
    const mountain = texture();
    const art = {
      main: {
        plain: { texture: plain, spec: CASTLE_BODY_ART.plain },
        mountain: { texture: mountain, spec: CASTLE_BODY_ART.mountain },
      },
    };
    const a = createCastleNode();
    const b = createCastleNode();
    a.update(props);
    b.update(props);
    a.setBodyArt(art);
    b.setBodyArt(art);
    const group = a.container.children[0] as Container;
    const vector = group.children[0] as Graphics;
    const sprite = group.children[2] as Sprite;
    const flag = group.children[3] as Graphics;
    const overlays = a.container.children.slice(1);
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.texture).toBe(plain);
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.rotation).toBe(0);
    expect(sprite.scale.x).toBe(sprite.scale.y);
    expect(a.container.position).toMatchObject(props.pos);
    expect(vector.visible).toBe(false);
    expect(sprite.eventMode).toBe('none');
    const clear = vi.spyOn(flag, 'clear');
    a.setLodStage('near');
    a.setLodStage('mid');
    a.update({ ...props });
    expect(clear).not.toHaveBeenCalled();
    a.setLodStage('far');
    expect(sprite.visible).toBe(false);
    expect(vector.visible).toBe(true);
    expect(group.scale.x).toBe(1.4);
    a.setLodStage('near');
    a.update({ ...props, terrainKind: 'mountain', colorIndex: 4 });
    expect(sprite.texture).toBe(mountain);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(a.container.children.slice(1)).toEqual(overlays);
    a.update({ ...props, tier: 'branch' });
    expect(sprite.visible).toBe(false);
    expect(vector.visible).toBe(true);
    a.update(props);
    a.setBodyArt({ main: { mountain: art.main.mountain } });
    expect(vector.visible).toBe(true);
    a.destroy();
    expect(plain.destroyed).toBe(false);
    expect(mountain.destroyed).toBe(false);
    expect((b.container.children[0] as Container).children[2]?.destroyed).toBe(false);
    b.destroy();
    plain.destroy(true);
    mountain.destroy(true);
  });
});
