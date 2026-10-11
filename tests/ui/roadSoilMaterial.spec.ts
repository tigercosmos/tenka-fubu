import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Graphics, type FillInstruction, type StrokeInstruction } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import { buildRoadsLayer, drawBridge } from '@ui/map/roads/roadsDraw';
import { createRoadHighlight } from '@ui/map/roads/roadHighlight';

function graph(grade: 1 | 2 | 3 = 3, sea = false, corner = false): MapGraph {
  return {
    nodes: new Map([
      ['a', { id: 'a', kind: 'castle', pos: { x: 0, y: 0 } }],
      ['b', { id: 'b', kind: 'castle', pos: { x: corner ? 10 : 200, y: corner ? 30 : 0 } }],
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
          ...(corner ? { waypoints: [10, 0, 10, 0] } : {}),
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
function hash(g: Graphics) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        paints(g).map((i) => ({
          action: i.action,
          color: i.data.style.color,
          alpha: i.data.style.alpha,
          width: i.action === 'stroke' ? i.data.style.width : undefined,
          cap: i.action === 'stroke' ? i.data.style.cap : undefined,
          shapes: i.data.path.shapePath.shapePrimitives.map((p) => p.shape),
        })),
      ),
    )
    .digest('hex');
}

describe('actual soil-road and wood-bridge material producer', () => {
  it.each(['mid', 'near'] as const)(
    'uses muted packed earth inside identical road widths at %s',
    (stage) => {
      for (const grade of [2, 3] as const) {
        const layer = buildRoadsLayer(graph(grade));
        layer.setStage(stage);
        try {
          const strokes = paints(grade === 3 ? layer.tiers.arterial : layer.tiers.minor);
          expect(strokes[2]!.data.style.color).toBe(
            stage === 'mid'
              ? grade === 3
                ? 0xd1b17e
                : 0xcbbb99
              : grade === 3
                ? 0xc6a675
                : 0xba9e72,
          );
          expect(strokes[2]!.data.style.alpha).toBe(0.98);
          expect((strokes[2] as StrokeInstruction).data.style.width).toBe(
            (grade === 3 ? 1.2 : 0.8) * (stage === 'mid' ? 2.5 : 1),
          );
        } finally {
          layer.destroy();
        }
      }
    },
  );

  it('replaces crossbars with segment-contained longitudinal soil spans at the original arc-length stations', () => {
    const input = graph(3, false, true);
    const before = structuredClone(input);
    const layer = buildRoadsLayer(input);
    const starts = vi.spyOn(layer.tiers.arterial, 'moveTo');
    const ends = vi.spyOn(layer.tiers.arterial, 'lineTo');
    layer.setStage('near');
    try {
      const a = starts.mock.calls.slice(3);
      const b = ends.mock.calls.slice(9);
      expect(a).toHaveLength(3);
      expect(a.map((p, i) => [(p[0] + b[i]![0]) / 2, (p[1] + b[i]![1]) / 2])).toEqual([
        [7, 0],
        [10, 8],
        [10, 19],
      ]);
      expect(a[0]![1]).toBe(b[0]![1]);
      expect(a[0]![0]).toBeLessThan(b[0]![0]);
      for (let i = 1; i < 3; i++) {
        expect(a[i]![0]).toBe(b[i]![0]);
        expect(a[i]![1]).toBeLessThan(b[i]![1]);
      }
      expect(a[0]![0]).toBeGreaterThanOrEqual(0);
      expect(b[0]![0]).toBeLessThanOrEqual(10);
      expect(b[2]![1]).toBeLessThanOrEqual(30);
      const strokes = paints(layer.tiers.arterial);
      expect(strokes).toHaveLength(4);
      expect(strokes[3]!.data.style).toMatchObject({
        color: 0x897858,
        alpha: 0.24,
        width: 0.6,
        cap: 'round',
        join: 'round',
      });
      const saved = hash(layer.tiers.arterial);
      layer.setStage('near');
      expect(hash(layer.tiers.arterial)).toBe(saved);
      expect(input).toEqual(before);
    } finally {
      starts.mockRestore();
      ends.mockRestore();
      layer.destroy();
    }
  });

  it('paints the unchanged raised bridge as matte wood, deep wood faces and stone abutments', () => {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const g = new Graphics();
      drawBridge(g, 50, 30, angle, 1);
      try {
        const fills = paints(g).filter((i): i is FillInstruction => i.action === 'fill');
        expect(fills.some((i) => i.data.style.color === 0x9b8058 && i.data.style.alpha === 1)).toBe(
          true,
        );
        expect(fills.filter((i) => i.data.style.color === 0x756f60)).toHaveLength(2);
        expect(fills.filter((i) => i.data.style.color === 0x594b38).length).toBeGreaterThanOrEqual(
          1,
        );
        expect(fills.filter((i) => i.data.style.color === 0x594b38).length).toBeLessThanOrEqual(2);
        const boards = paints(g).filter(
          (i): i is StrokeInstruction =>
            i.action === 'stroke' && i.data.style.cap === 'butt' && i.data.style.width === 16 / 5,
        );
        expect(boards).toHaveLength(5);
        expect(boards.map((i) => i.data.style.alpha)).toEqual([0.1, 0.16, 0.1, 0.16, 0.1]);
        expect(boards.every((i) => i.data.style.color === 0x594b38)).toBe(true);
        const deck = fills.find((i) => i.data.style.color === 0x9b8058)!;
        const u = { x: Math.cos(angle), y: Math.sin(angle) };
        const corners = deck.data.path.shapePath.shapePrimitives[0]!.shape;
        expect(corners).toMatchObject({
          points: [
            50 - u.x * 8 + u.y * 4.5,
            30 - u.y * 8 - u.x * 4.5 - 3,
            50 + u.x * 8 + u.y * 4.5,
            30 + u.y * 8 - u.x * 4.5 - 3,
            50 + u.x * 8 - u.y * 4.5,
            30 + u.y * 8 + u.x * 4.5 - 3,
            50 - u.x * 8 - u.y * 4.5,
            30 - u.y * 8 + u.x * 4.5 - 3,
          ],
        });
      } finally {
        g.destroy({ context: true });
      }
    }
  });

  it.each(['mid', 'near'] as const)(
    'bounds every soil capsule and retains the 128-station work cap at %s',
    (stage) => {
      for (const grade of [2, 3] as const) {
        const input = graph(grade);
        input.nodes.get('b' as never)!.pos.x = 1_000_000;
        const layer = buildRoadsLayer(input);
        const g = grade === 3 ? layer.tiers.arterial : layer.tiers.minor;
        const starts = vi.spyOn(g, 'moveTo');
        const ends = vi.spyOn(g, 'lineTo');
        layer.setStage(stage);
        try {
          expect(starts).toHaveBeenCalledTimes(131);
          expect(ends).toHaveBeenCalledTimes(131);
          const m = stage === 'mid' ? 2.5 : 1;
          const wear = paints(g)[3] as StrokeInstruction;
          const casingRadius = ((grade === 3 ? 4 : 2.5) * 0.6 * m) / 2;
          expect(wear.data.style.width / 2).toBeLessThan(casingRadius);
          for (const [index, from] of starts.mock.calls.slice(3).entries()) {
            const to = ends.mock.calls[index + 3]!;
            expect(from[1]).toBe(0);
            expect(to[1]).toBe(0);
            expect(from[0]).toBeGreaterThanOrEqual(0);
            expect(to[0]).toBeLessThanOrEqual(1_000_000);
            expect((from[0] + to[0]) / 2).toBe((7 + index * 11) * m);
          }
          const before = hash(g);
          layer.setStage(stage);
          expect(hash(g)).toBe(before);
          expect(starts).toHaveBeenCalledTimes(131);
        } finally {
          starts.mockRestore();
          ends.mockRestore();
          layer.destroy();
        }
      }
    },
  );

  it('records complete unchanged far, grade-one, sea and selected-gold controls', () => {
    const controls: string[] = [];
    for (const [grade, sea, stage] of [
      [3, false, 'far'],
      [1, false, 'near'],
      [3, true, 'near'],
    ] as const) {
      const layer = buildRoadsLayer(graph(grade, sea));
      layer.setStage(stage);
      controls.push(
        hash(sea ? layer.tiers.sea : grade === 1 ? layer.tiers.path : layer.tiers.arterial),
      );
      layer.destroy();
    }
    const highlight = createRoadHighlight();
    highlight.update({ graph: graph(), selectedNodeId: 'a' });
    controls.push(hash(highlight.container.children[0] as Graphics));
    highlight.destroy();
    expect(controls).toEqual([
      'ebdb6a6efd0ead67d0933f5f921e9cd5ded79c8b78dc190595bdf67c7fcce9bb',
      'a3b5454ec70867665556b9d7d3d154030cefb1e668121e0ab8b3d42ea11c54a2',
      'b3bcb76abe23cb1d43f2601c9c0e296adb57f7a04f0d29252c550e638e0e273b',
      '904c88a653c356215c66a232683defe26937fb4c8753c65d4ca20b4afe8aceda',
    ]);
  });
});
