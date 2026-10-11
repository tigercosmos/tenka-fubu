import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Graphics, type FillInstruction, type StrokeInstruction } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import { buildRoadsLayer, drawBridge } from '@ui/map/roads/roadsDraw';

function graph(grade: 1 | 2 | 3, sea = false): MapGraph {
  return {
    nodes: new Map([
      ['a', { id: 'a', kind: 'castle', pos: { x: 12.25, y: 18.5 } }],
      ['b', { id: 'b', kind: 'castle', pos: { x: 182.75, y: 92.25 } }],
    ]),
    edges: new Map([
      [
        'road',
        {
          id: 'road',
          a: 'a',
          b: 'b',
          grade,
          type: sea ? 'sea' : 'land',
          baseDays: 1,
          waypoints: [74.125, 22.5, 101.25, 72.75],
          bridges: [91.5, 51.25],
        },
      ],
    ]),
    adjacency: new Map([['a', ['road']]]),
  } as unknown as MapGraph;
}
function paints(g: Graphics) {
  return g.context.instructions.filter(
    (i): i is FillInstruction | StrokeInstruction => i.action === 'fill' || i.action === 'stroke',
  );
}
function record(g: Graphics, omitSoilRgb = false) {
  return paints(g).map((i, index) => ({
    action: i.action,
    color: omitSoilRgb && (index === 1 || index === 2) ? null : i.data.style.color,
    alpha: i.data.style.alpha,
    ...(i.action === 'stroke'
      ? {
          width: i.data.style.width,
          cap: i.data.style.cap,
          join: i.data.style.join,
          alignment: i.data.style.alignment,
          miterLimit: i.data.style.miterLimit,
          pixelLine: i.data.style.pixelLine,
        }
      : {}),
    shapes: i.data.path.shapePath.shapePrimitives.map((p) => ({
      shape: p.shape,
      transform: p.transform,
    })),
  }));
}
function sha(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('actual packed-earth road hierarchy', () => {
  it.each(['mid', 'near'] as const)(
    'uses warm soil and dark earth edges at %s without widening or alpha changes',
    (stage) => {
      for (const grade of [2, 3] as const) {
        const input = graph(grade),
          before = structuredClone(input),
          layer = buildRoadsLayer(input);
        try {
          layer.setStage(stage);
          const p = paints(grade === 3 ? layer.tiers.arterial : layer.tiers.minor);
          expect(p[1]!.data.style.color).toBe(0x56432f);
          expect(p[2]!.data.style.color).toBe(
            stage === 'mid'
              ? grade === 3
                ? 0xd1b17e
                : 0xcbbb99
              : grade === 3
                ? 0xc6a675
                : 0xba9e72,
          );
          expect(p[1]!.data.style.alpha).toBe(0.88);
          expect(p[2]!.data.style.alpha).toBe(0.98);
          const mult = stage === 'mid' ? 2.5 : 1;
          expect((p[1] as StrokeInstruction).data.style.width).toBe(
            (grade === 3 ? 4 : 2.5) * 0.6 * mult,
          );
          expect((p[2] as StrokeInstruction).data.style.width).toBe(
            (grade === 3 ? 1.2 : 0.8) * mult,
          );
          const unchanged = record(grade === 3 ? layer.tiers.arterial : layer.tiers.minor);
          layer.setStage(stage);
          expect(record(grade === 3 ? layer.tiers.arterial : layer.tiers.minor)).toEqual(unchanged);
          expect(input).toEqual(before);
        } finally {
          layer.destroy();
        }
      }
    },
  );

  it('retains every non-color soil instruction and all FAR/path/sea/bridge paint', () => {
    const unchanged: unknown[] = [];
    for (const stage of ['far', 'mid', 'near'] as const) {
      for (const grade of [1, 2, 3] as const) {
        for (const sea of [false, true]) {
          const input = graph(grade, sea),
            layer = buildRoadsLayer(input);
          try {
            layer.setStage(stage);
            unchanged.push([
              stage,
              grade,
              sea,
              layer.container.children.map((c) => c.label),
              Object.entries(layer.tiers).map(([name, g]) => [
                name,
                g.visible,
                record(
                  g,
                  !sea &&
                    grade !== 1 &&
                    stage !== 'far' &&
                    name === (grade === 3 ? 'arterial' : 'minor'),
                ),
              ]),
              layer.getProjectionDiagnostics(),
            ]);
          } finally {
            layer.destroy();
          }
        }
      }
    }
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const g = new Graphics();
      try {
        drawBridge(g, 91.5, 51.25, angle, 1);
        unchanged.push(record(g));
      } finally {
        g.destroy({ context: true });
      }
    }
    console.info(JSON.stringify({ unchangedInstructionHash: sha(unchanged) }));
    // Baseline hash is recorded from the actual old producer before the material edit.
    expect(unchanged).toHaveLength(22);
    expect(sha(unchanged)).toBe('5a3408597bda08ae1b76cb77bce5589db582edeea961e0428f4182e482635285');
  });
});
