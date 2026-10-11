import { describe, expect, it, vi } from 'vitest';
import { DOMAdapter, Graphics, type FillInstruction } from 'pixi.js';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';

// Real Pixi objects; the recording canvas adapter proves allocation/API use,
// not Canvas raster pixels, GPU uploads, or native screenshot equivalence.
const lakes = [
  {
    id: 'north',
    polygon: [
      { x: 10, y: 20 },
      { x: 90, y: 20 },
      { x: 90, y: 60 },
      { x: 10, y: 60 },
    ],
  },
  {
    id: 'south',
    polygon: [
      { x: -40, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 180 },
      { x: -40, y: 180 },
    ],
  },
];

function withCanvas<T>(run: (allocation: ReturnType<typeof vi.fn>) => T): T {
  const previous = DOMAdapter.get();
  const allocate = vi.fn((width?: number, height?: number) => {
    const canvas = {
      width: width ?? 0,
      height: height ?? 0,
      getContext: () => ({
        createLinearGradient: () => ({ addColorStop: vi.fn() }),
        fillRect: vi.fn(),
        fillStyle: '',
      }),
    };
    return canvas as unknown as ReturnType<typeof previous.createCanvas>;
  });
  DOMAdapter.set({ ...previous, createCanvas: allocate });
  try {
    return run(allocate);
  } finally {
    DOMAdapter.set(previous);
  }
}

function lakeTextures(graphics: Graphics) {
  const fills = graphics.context.instructions.filter(
    (instruction): instruction is FillInstruction => instruction.action === 'fill',
  );
  expect(fills).toHaveLength(2);
  return fills.map((fill) => fill.data.style.texture!);
}

describe('lake material public Pixi allocation and unchanged geometry contract', () => {
  it('allocates no canvas or gradient texture for an empty lake collection', () =>
    withCanvas((allocate) => {
      const water = createWaterFeatures([], []);
      water.setStage('near');
      expect(allocate).not.toHaveBeenCalled();
      expect((water.container.children[0] as Graphics).context.instructions).toHaveLength(0);
      water.destroy();
      water.destroy();
    }));
  it('owns separate bounded local 2D surfaces across different lake bounds without stage rebuilds', () =>
    withCanvas((allocate) => {
      const water = createWaterFeatures([], lakes);
      try {
        const graphics = water.container.children[0] as Graphics;
        const [texture, other] = lakeTextures(graphics);
        expect(texture).not.toBe(other);
        expect(allocate).not.toHaveBeenCalled();
        expect(texture!.source.width).toBe(128);
        expect(texture!.source.height).toBe(64);
        expect(other!.source.width).toBe(64);
        expect(other!.source.height).toBe(128);
        const context = graphics.context;
        const instructions = context.instructions;
        for (const stage of ['near', 'mid', 'far', 'near'] as const) {
          water.setStage(stage);
          expect(graphics.visible).toBe(true);
          expect(graphics.context).toBe(context);
          expect(context.instructions).toBe(instructions);
          expect(lakeTextures(graphics)[0]).toBe(texture);
        }
        expect(allocate).not.toHaveBeenCalled();
      } finally {
        water.destroy();
      }
    }));

  it('keeps every authored polygon and original shore stroke while LOD only changes visibility', () =>
    withCanvas(() => {
      const before = JSON.stringify(lakes);
      const poly = vi.spyOn(Graphics.prototype, 'poly');
      const stroke = vi.spyOn(Graphics.prototype, 'stroke');
      const water = createWaterFeatures([], lakes);
      try {
        expect(water.container.children).toHaveLength(4);
        lakes.forEach((lake, index) => {
          const points = lake.polygon.flatMap(({ x, y }) => [x, y]);
          for (let offset = 0; offset < 4; offset++)
            expect(poly.mock.calls[index * 4 + offset]![0]).toEqual(points);
          expect(stroke.mock.calls[index * 3]![0]).toMatchObject({ width: 0.45, alpha: 0.25 });
          expect(stroke.mock.calls[index * 3 + 1]![0]).toMatchObject({
            width: 0.6,
            alpha: 0.16,
            alignment: 1,
            join: 'round',
          });
          expect(stroke.mock.calls[index * 3 + 2]![0]).toMatchObject({
            width: 0.35,
            alpha: 0.2,
            alignment: 1,
            join: 'round',
          });
        });
        water.setStage('far');
        expect(water.container.children.map((child) => child.visible)).toEqual([
          true,
          true,
          false,
          false,
        ]);
        water.setStage('mid');
        expect(water.container.children.map((child) => child.visible)).toEqual([
          true,
          true,
          true,
          false,
        ]);
        water.setStage('near');
        expect(water.container.children.every((child) => child.visible)).toBe(true);
        expect(JSON.stringify(lakes)).toBe(before);
      } finally {
        water.destroy();
        poly.mockRestore();
        stroke.mockRestore();
      }
    }));

  it('destroys its owned surface textures and sources exactly once and gives another owner independent textures', () =>
    withCanvas(() => {
      const water = createWaterFeatures([], lakes);
      const other = createWaterFeatures([], lakes);
      try {
        const [texture] = lakeTextures(water.container.children[0] as Graphics);
        const [otherTexture] = lakeTextures(other.container.children[0] as Graphics);
        expect(texture).toBeDefined();
        if (!texture) throw new Error('Missing lake texture');
        const source = texture.source;
        const destroyTexture = vi.spyOn(texture, 'destroy');
        const destroySource = vi.spyOn(source, 'destroy');
        expect(otherTexture).not.toBe(texture);
        water.destroy();
        water.destroy();
        expect(destroyTexture).toHaveBeenCalledTimes(1);
        expect(destroyTexture).toHaveBeenCalledWith(true);
        expect(destroySource).toHaveBeenCalledTimes(1);
        expect(texture.destroyed).toBe(true);
        expect(otherTexture!.destroyed).toBe(false);
      } finally {
        if (!water.container.destroyed) water.destroy();
        other.destroy();
      }
    }));
});
