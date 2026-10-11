import { createWasmGeographicScorer } from '@ui/map/wasmGeographicScorer';
import { realRenderWasmExports } from '../helpers/realRenderWasm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BitmapText, Bounds, Container } from 'pixi.js';
import { MapRenderer } from '@ui/map/MapRenderer';
import { Camera } from '@ui/map/camera';
import { createArmyChip, type ArmyChipProps } from '@ui/map/sceneParts/armyChip';

afterEach(() => vi.restoreAllMocks());

const props: ArmyChipProps = {
  pos: { x: 600, y: 800 },
  colorIndex: 5,
  soldiers: 2000,
  morale: 80,
  corps: false,
  status: 'sieging',
  foodDays: 2,
  relation: 'friendly',
  selected: false,
  heading: null,
  stage: 'mid',
  labelStagger: 0,
};

function observe(renderer: MapRenderer) {
  const method = Reflect.get(renderer, 'observeArmyAnnotations') as (() => unknown) | undefined;
  expect(method).toBeTypeOf('function');
  if (!method) throw new Error('Missing actual annotation projection observer');
  return Reflect.apply(method, renderer, []) as Array<{
    id: string;
    visible: boolean;
    anchor: { x: number; y: number };
    relation: {
      kind: string;
      rect: { x: number; y: number; width: number; height: number };
      visible: boolean;
    };
    state: {
      text: string;
      rect: { x: number; y: number; width: number; height: number } | null;
      visible: boolean;
    };
    supply: {
      text: string;
      level: string;
      rect: { x: number; y: number; width: number; height: number } | null;
      visible: boolean;
    };
    number: { text: string; visible: boolean };
  }>;
}

describe('actual army annotation frame projection, not raster glyph recognition', () => {
  const cameras = [
    ['far', 0.25, 2.4],
    ['mid', 0.625, 1],
    ['near', 1.25, 1],
  ] as const;
  it.each(
    cameras.flatMap(([stage, scale, chipScale]) =>
      (['friendly', 'enemy', 'neutral'] as const).map((relation) => ({
        stage,
        scale,
        chipScale,
        relation,
      })),
    ),
  )(
    '$stage/$relation projects chip-local pixel lock and offsets exactly once, preserving independent supply',
    ({ stage, scale, chipScale, relation }) => {
      // Only text metrics are deterministic here; Graphics/Container and Camera are installed producers.
      vi.spyOn(BitmapText.prototype, 'getLocalBounds').mockImplementation(function (
        this: BitmapText,
      ) {
        const bounds = new Bounds();
        bounds.addFrame(0, 0, this.text.length * 12, 12);
        return bounds;
      });
      const renderer = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports())),
        camera = new Camera({ x: 600, y: 800, scale });
      const part = createArmyChip();
      part.update({ ...props, stage, relation });
      part.container.scale.set(chipScale);
      part.setPlateScale(14 / (12 * scale * chipScale));
      part.setPlateOffset({ x: 7, y: -9 });
      const layers = { armies: new Container() };
      Object.defineProperties(renderer, {
        camera: { value: camera, configurable: true },
        app: { value: { screen: { width: 1280, height: 720 } }, configurable: true },
        layers: { value: layers, configurable: true },
        armyParts: { value: new Map([['army.actual', part]]), configurable: true },
      });
      try {
        const getter = Reflect.get(part, 'getAnnotationFrames') as (() => unknown) | undefined;
        expect(getter).toBeTypeOf('function');
        if (!getter) throw new Error('Missing actual annotation frame getter');
        const before = structuredClone(props),
          hit = part.container.hitArea;
        const rows = observe(renderer),
          row = rows[0]!;
        expect(rows).toHaveLength(1);
        expect(row.anchor).toEqual({ x: 640, y: 360 });
        expect(row.relation.kind).toBe(relation);
        expect(row.relation.visible).toBe(true);
        expect(row.relation.rect.width).toBeGreaterThanOrEqual(12);
        expect(row.state).toMatchObject({ text: '圍', visible: true });
        expect(row.supply).toMatchObject({ text: '糧!', level: 'critical', visible: true });
        expect(row.number.visible).toBe(stage !== 'far');
        const local = Reflect.apply(getter, part, []) as {
          relation: { rect: { x: number; y: number; width: number; height: number } };
        };
        const factor = scale * chipScale;
        const expected = {
          x: 640 + local.relation.rect.x * factor,
          y: 360 + local.relation.rect.y * factor,
          width: local.relation.rect.width * factor,
          height: local.relation.rect.height * factor,
        };
        // Independent equivalent algebra differs only by IEEE-754 operation ordering.
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(row.relation.rect[key]).toBeCloseTo(expected[key], 12);
        expect(observe(renderer)).toEqual(rows);
        expect(part.container.hitArea).toBe(hit);
        expect(props).toEqual(before);
        layers.armies.visible = false;
        expect(observe(renderer)[0]).toMatchObject({
          visible: false,
          relation: { visible: false },
          state: { visible: false },
          supply: { visible: false },
        });
      } finally {
        part.destroy();
      }
    },
  );
});
