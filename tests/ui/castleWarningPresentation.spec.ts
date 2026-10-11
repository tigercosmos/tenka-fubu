import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture } from 'pixi.js';
import { createCastleNode, type CastleNodeProps } from '@ui/map/sceneParts/castleNode';
import { CASTLE_BODY_ART_BY_TIER } from '@ui/map/sceneParts/castleBodyArt';

const props: CastleNodeProps = {
  pos: { x: 123, y: 456 },
  tier: 'main',
  terrainKind: 'plain',
  colorIndex: 2,
  durability: 100,
  maxDurability: 100,
  warning: 'critical',
};
describe('actual castle warning presentation, independent CSS envelope', () => {
  it.each([0.25, 0.5, 1.25])(
    'keeps warning width14CSS at camera%f and all four art frames',
    (camera) => {
      for (const tier of ['main', 'branch'] as const)
        for (const terrainKind of ['plain', 'mountain'] as const) {
          const node = createCastleNode();
          node.update({ ...props, tier, terrainKind });
          node.setBodyArt({
            [tier]: {
              [terrainKind]: {
                texture: Texture.EMPTY,
                spec: CASTLE_BODY_ART_BY_TIER[tier][terrainKind],
              },
            },
          });
          const before = node.getPresentationGeometry()!;
          node.setWarningScale(14 / (7.6 * camera));
          for (const stage of ['near', 'mid', 'far', 'near'] as const) {
            node.setLodStage(stage);
            for (const warning of ['threatened', 'critical'] as const) {
              node.update({ ...props, tier, terrainKind, warning });
              const geometry = node.getPresentationGeometry()!;
              expect(geometry.warning!.width * camera).toBeCloseTo(14, 10);
              expect(geometry.warning!.height * camera).toBeCloseTo(14, 10);
              const graphic = node.container.children[2] as Graphics;
              const raw = graphic.getLocalBounds();
              expect(raw.width * graphic.scale.x * camera).toBeCloseTo(14, 5);
              expect(raw.height * graphic.scale.y * camera).toBeCloseTo(14, 5);
              expect(0.6 * graphic.scale.x * camera).toBeGreaterThanOrEqual(1);
              expect(
                (geometry.body.y - geometry.warning!.y - geometry.warning!.height) * camera,
              ).toBeGreaterThanOrEqual(2 - 1e-10);
              expect(node.container.position).toMatchObject(props.pos);
              if (stage !== 'far') {
                expect(geometry.body).toEqual(before.body);
                expect(geometry.durability).toEqual(before.durability);
              }
            }
          }
          const models = new Container(),
            signals = new Container();
          node.attachDepthLayers(models, signals);
          expect(node.depthBody.parent).toBe(models);
          expect(node.depthBody.position).toMatchObject(props.pos);
          node.update({ ...props, tier, terrainKind, warning: 'none' });
          expect(node.getPresentationGeometry()!.warning).toBeNull();
          expect(node.warningVisible).toBe(false);
          node.setBodyArt({});
          node.destroy();
          models.destroy();
          signals.destroy();
          expect(Texture.EMPTY.destroyed).toBe(false);
        }
    },
  );
  it('ignores invalid transforms and does not redraw or allocate for repeated scale/art/position', () => {
    const node = createCastleNode();
    node.update(props);
    node.setWarningScale(14 / 7.6);
    const graphic = node.container.children[2] as Graphics;
    const clear = vi.spyOn(graphic, 'clear');
    const before = node.getPresentationGeometry();
    const children = [...node.container.children];
    for (const value of [NaN, Infinity, 0, -1, 65, 14 / 7.6]) node.setWarningScale(value);
    expect(node.getPresentationGeometry()).toEqual(before);
    expect(node.container.children).toEqual(children);
    expect(clear).not.toHaveBeenCalled();
    node.update({ ...props, pos: { x: 321, y: 654 } });
    expect(node.getPresentationGeometry()).toEqual(before);
    expect(node.container.position).toMatchObject({ x: 321, y: 654 });
    node.destroy();
    clear.mockRestore();
  });
});
