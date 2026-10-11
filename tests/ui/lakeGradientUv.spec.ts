import { describe, expect, it, vi } from 'vitest';
import {
  buildLine,
  DOMAdapter,
  generateTextureMatrix,
  Graphics,
  Matrix,
  type FillInstruction,
  type StrokeInstruction,
} from 'pixi.js';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';

// Public exports share the same Pixi bundle as the actual textured Graphics fill.
// This checks real CPU UV/mesh generation, not canvas pixels or GPU rendering.
function withCanvas(run: () => void): void {
  const previous = DOMAdapter.get();
  DOMAdapter.set({
    ...previous,
    createCanvas: (width, height) =>
      ({
        width,
        height,
        getContext: () => ({
          createLinearGradient: () => ({ addColorStop: vi.fn() }),
          fillRect: vi.fn(),
          fillStyle: '',
        }),
      }) as unknown as ReturnType<typeof previous.createCanvas>,
  });
  try {
    run();
  } finally {
    DOMAdapter.set(previous);
  }
}

describe('installed Pixi lake UV and inward shore geometry', () => {
  it.each([
    { x: 10, y: 20, width: 80, height: 40 },
    { x: -40, y: 100, width: 40, height: 80 },
  ])('maps non-square local bounds $width × $height to independent two-dimensional UVs', (bounds) =>
    withCanvas(() => {
      const { x, y, width, height } = bounds;
      const lakes = [
        {
          id: 'lake',
          polygon: [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
          ],
        },
      ];
      const snapshot = JSON.stringify(lakes);
      const water = createWaterFeatures([], lakes);
      try {
        const graphics = water.container.children[0] as Graphics;
        const fill = graphics.context.instructions.find(
          (instruction): instruction is FillInstruction => instruction.action === 'fill',
        )!;
        expect(fill.data.style.textureSpace).toBe('local');
        const texture = fill.data.style.texture!;
        expect(texture.source.style.addressMode).toBe('clamp-to-edge');
        const shape = fill.data.path.shapePath.shapePrimitives[0]!.shape;
        const matrix = generateTextureMatrix(new Matrix(), fill.data.style, shape);
        for (const [nx, ny] of [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
          [0.25, 0.75],
          [0.25, 0.25],
          [0.75, 0.25],
        ]) {
          const uv = matrix.apply({ x: x + width * nx!, y: y + height * ny! });
          expect(uv.x).toBeCloseTo(nx!, 12);
          expect(uv.y).toBeCloseTo(ny!, 12);
        }
        // Local surface sampling clamps at the lake bounds instead of tiling.
        expect(texture.source.style.addressMode).toBe('clamp-to-edge');
        expect(JSON.stringify(lakes)).toBe(snapshot);
      } finally {
        water.destroy();
      }
    }),
  );

  it('keeps both actual lake inner-shore meshes inside for either winding', () =>
    withCanvas(() => {
      const lakes = buildTerrainPack().lakes;
      const snapshot = JSON.stringify(lakes);
      const water = createWaterFeatures([], lakes);
      try {
        const graphics = water.container.children[0] as Graphics;
        const strokes = graphics.context.instructions.filter(
          (instruction): instruction is StrokeInstruction => instruction.action === 'stroke',
        );
        lakes.forEach((lake, index) => {
          for (const winding of [lake.polygon, [...lake.polygon].reverse()]) {
            const flat = winding.flatMap(({ x, y }) => [x, y]);
            for (const offset of [1, 2]) {
              const style = strokes[index * 3 + offset]!.data.style;
              expect(style.alignment).toBe(1);
              expect(style.width).toBe(offset === 1 ? 0.6 : 0.35);
              const vertices: number[] = [],
                indices: number[] = [];
              buildLine(flat, style, false, true, vertices, indices);
              expect(indices.length).toBeGreaterThan(0);
              // Actual lake polygons are convex. Every mesh vertex inside each
              // half-plane implies every rendered mesh triangle stays inside.
              const area = winding.reduce((sum, a, i) => {
                const b = winding[(i + 1) % winding.length]!;
                return sum + a.x * b.y - b.x * a.y;
              }, 0);
              for (let i = 0; i < vertices.length; i += 2) {
                winding.forEach((a, j) => {
                  const b = winding[(j + 1) % winding.length]!;
                  const side =
                    (b.x - a.x) * (vertices[i + 1]! - a.y) - (b.y - a.y) * (vertices[i]! - a.x);
                  expect(side * Math.sign(area)).toBeGreaterThanOrEqual(-1e-7);
                });
              }
            }
          }
        });
        expect(JSON.stringify(lakes)).toBe(snapshot);
      } finally {
        water.destroy();
      }
    }));
});
