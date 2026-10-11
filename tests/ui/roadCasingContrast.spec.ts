import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Graphics, StrokeInstruction } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import { buildRoadsLayer } from '@ui/map/roads/roadsDraw';

function graph(grade: 1 | 2 | 3, sea = false): MapGraph {
  return {
    nodes: new Map([
      ['a', { id: 'a', kind: 'castle', pos: { x: 0, y: 0 } }],
      ['b', { id: 'b', kind: 'castle', pos: { x: 200, y: 0 } }],
    ]),
    edges: new Map([
      ['road', { id: 'road', a: 'a', b: 'b', grade, type: sea ? 'sea' : 'land', baseDays: 1 }],
    ]),
    adjacency: new Map([['a', ['road']]]),
  } as unknown as MapGraph;
}

function strokes(g: Graphics) {
  return g.context.instructions.filter((i): i is StrokeInstruction => i.action === 'stroke');
}

function instructionHash(g: Graphics) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        strokes(g).map((i) => ({
          style: {
            color: i.data.style.color,
            alpha: i.data.style.alpha,
            width: i.data.style.width,
            cap: i.data.style.cap,
            join: i.data.style.join,
            alignment: i.data.style.alignment,
            miterLimit: i.data.style.miterLimit,
          },
          shapes: i.data.path.shapePath.shapePrimitives.map((p) => p.shape),
        })),
      ),
    )
    .digest('hex');
}

describe('actual soil-road casing and route footprint', () => {
  it.each(['mid', 'near'] as const)(
    'keeps grade 2/3 casing and soil spans inside the original route at %s',
    (stage) => {
      for (const grade of [2, 3] as const) {
        const input = graph(grade);
        const before = structuredClone(input);
        const layer = buildRoadsLayer(input);
        layer.setStage(stage);
        const g = grade === 3 ? layer.tiers.arterial : layer.tiers.minor;
        try {
          const output = strokes(g);
          // The soil-material redesign intentionally changed interior paint and grain
          // direction. Check independent route coordinates, widths and arc stations,
          // not the obsolete all-instruction paint hash from the opacity-only pilot.
          const multiplier = stage === 'mid' ? 2.5 : 1;
          expect(output).toHaveLength(4);
          const routeShape = [{ type: 'polygon', points: [0, 0, 200, 0], closePath: false }];
          for (const instruction of output.slice(0, 3))
            expect(instruction.data.path.shapePath.shapePrimitives.map((p) => p.shape)).toEqual(
              routeShape,
            );
          expect(output[0]!.data.style).toMatchObject({
            color: 0x6f604c,
            width: ((grade === 3 ? 4 : 2.5) + 2) * multiplier * 0.6,
            cap: 'round',
            join: 'round',
          });
          expect(output[1]!.data.style).toMatchObject({
            color: 0x56432f,
            width: (grade === 3 ? 2.4 : 1.5) * multiplier,
            cap: 'round',
            join: 'round',
          });
          expect(output[2]!.data.style).toMatchObject({
            color:
              stage === 'mid'
                ? grade === 3
                  ? 0xd1b17e
                  : 0xcbbb99
                : grade === 3
                  ? 0xc6a675
                  : 0xba9e72,
            width: (grade === 3 ? 1.2 : 0.8) * multiplier,
            cap: 'round',
            join: 'round',
          });
          const spans = [];
          for (let station = 7 * multiplier; station < 200; station += 11 * multiplier) {
            const half = Math.min(11 * multiplier * 0.3, station, 200 - station);
            spans.push({
              type: 'polygon',
              points: [station - half, 0, station + half, 0],
              closePath: false,
            });
          }
          expect(output[3]!.data.path.shapePath.shapePrimitives.map((p) => p.shape)).toEqual(spans);
          expect(output[3]!.data.style).toMatchObject({
            color: 0x897858,
            width: (grade === 3 ? 2 : 1.2) * multiplier * 0.3,
            cap: 'round',
            join: 'round',
          });
          expect(output[0]!.data.style.alpha).toBe(0.06);
          expect(output[2]!.data.style.alpha).toBe(0.98);
          expect(output[3]!.data.style.alpha).toBe(0.24);
          for (const instruction of output)
            expect(instruction.data.style).toMatchObject({ alignment: 0.5, miterLimit: 10 });
          expect(input).toEqual(before);
          expect(output[1]!.data.style.alpha).toBe(0.88);
          const unchanged = instructionHash(g);
          layer.setStage(stage);
          expect(instructionHash(g)).toBe(unchanged);
        } finally {
          layer.destroy();
        }
      }
    },
  );
  it('retains visible FAR, grade 1 and sea instructions', () => {
    for (const [grade, sea, stage] of [
      [3, false, 'far'],
      [1, false, 'near'],
      [3, true, 'near'],
    ] as const) {
      const layer = buildRoadsLayer(graph(grade, sea));
      layer.setStage(stage);
      try {
        const g = sea ? layer.tiers.sea : grade === 1 ? layer.tiers.path : layer.tiers.arterial;
        const baseline = sea
          ? 'fce9400b2a6105e6ff8935028b0b1ad25e5efd0cf476240a2275c6f6c6822930'
          : grade === 1
            ? '21532f19dca2b9b03d44382cba79995bc5f7c46df8762dd36534bcb2e731844d'
            : '83ff0d267e9ee85fdb2688d4419a06191c06f0a081d1fad8ea7708e24d6a62e3';
        expect(instructionHash(g)).toBe(baseline);
        expect(strokes(g).length).toBeGreaterThan(0);
      } finally {
        layer.destroy();
      }
    }
  });
});
