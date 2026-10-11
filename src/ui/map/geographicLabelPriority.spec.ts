import { describe, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { Container, BitmapText } from 'pixi.js';
import { MapRenderer } from './MapRenderer';
import type { PlateRect } from './armyPlateLayout';
import { GEOGRAPHIC_PRIMARY_MARGIN, prioritizeGeographicLabels } from './geographicLabelPriority';

function consumer() {
  const renderer = new MapRenderer();
  const container = new Container();
  container.visible = true;
  const text = new BitmapText({ text: '郡名', style: { fontSize: 12 } });
  container.addChild(text);
  const rect = { x: 0, y: 0, width: 24, height: 12 };
  let obstacles: { id: string; kind: 'castleBody'; rect: PlateRect }[] = [
    { id: 'castle.a', kind: 'castleBody', rect: { x: -100, y: -100, width: 200, height: 200 } },
  ];
  const h = renderer as unknown as {
    labelParts: Map<string, unknown>;
    placeGeographicLabels(): void;
    geographicLabelInputs(): unknown;
    view: { selection: { kind: 'node'; id: string } | null; analysisMode: string };
    emit(
      event:
        | { type: 'nodeHover'; id: string; nodeKind: 'district'; screenX: number; screenY: number }
        | { type: 'hoverEnd' },
    ): void;
  };
  h.labelParts.set('dist.a', {
    container,
    text,
    kind: 'district',
    pos: { x: 0, y: 0 },
    canonicalPos: { x: 0, y: 0 },
    lodVisible: true,
    cullVisible: true,
    declutterHidden: false,
    baselineGap: 0,
  });
  h.geographicLabelInputs = () => ({
    candidates: [{ id: 'dist.a', kind: 'district', rect }],
    obstacles,
  });
  return {
    h,
    container,
    text,
    clear: () => {
      obstacles = [];
    },
  };
}

describe('actual secondary-name post-placement priority', () => {
  it('suppresses a nonessential name that cannot escape a primary model', () => {
    const c = consumer();
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(false);
    expect(c.text.style.fontSize).toBe(12);
    expect(c.container.position).toMatchObject({ x: 0, y: 0 });
  });
  it('reconsiders hidden names after the primary model leaves, without new text', () => {
    const c = consumer();
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(false);
    c.clear();
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
    expect(c.container.children[0]).toBe(c.text);
  });
  it('keeps selected and hovered names, and clears the hover lease', () => {
    const c = consumer();
    c.h.view.selection = { kind: 'node', id: 'dist.a' };
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
    c.h.view.selection = null;
    c.h.emit({ type: 'nodeHover', id: 'dist.a', nodeKind: 'district', screenX: 0, screenY: 0 });
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
    c.h.emit({ type: 'hoverEnd' });
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(false);
  });
  it('retains march-target/alert district names and focused incident-road names', () => {
    const c = consumer();
    const h = c.h as unknown as {
      marchTargetId: string | null;
      view: {
        districts?: { id: string; ikkiActive: boolean; subjugationProgress: number | null }[];
      };
      staticData: unknown;
      forceGeographicLabel(id: string): boolean;
    };
    h.marchTargetId = 'dist.a';
    h.staticData = {
      graph: {
        edges: new Map([
          ['edge.a', { a: 'dist.a', b: 'castle.a' }],
          ['edge.b', { a: 'dist.b', b: 'castle.b' }],
        ]),
      },
    };
    expect(h.forceGeographicLabel('road:edge.a')).toBe(true);
    expect(h.forceGeographicLabel('road:edge.b')).toBe(false);
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
    h.marchTargetId = null;
    h.view.districts = [{ id: 'dist.a', ikkiActive: true, subjugationProgress: null }];
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
    h.view.districts = [{ id: 'dist.a', ikkiActive: false, subjugationProgress: 1 }];
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
    h.view.districts = [{ id: 'dist.a', ikkiActive: false, subjugationProgress: null }];
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(false);
  });
  it('real input collection includes priority-hidden eligible text and reuses the cached policy', () => {
    const c = consumer();
    const renderer = c.h as unknown as {
      camera: unknown;
      armyParts: Map<string, unknown>;
      geographicLabelInputs: () => { candidates: { id: string }[] };
      geographicLabelPriority: unknown;
    };
    renderer.camera = { getState: () => ({ scale: 1 }) };
    Object.defineProperty(c.text, 'getLocalBounds', {
      value: () => ({ x: 0, y: 0, width: 24, height: 12 }),
    });
    const body = new Container();
    renderer.armyParts.set('army.a', {
      container: body,
      getBodyBounds: () => ({ x: -100, y: -100, width: 200, height: 200 }),
    });
    renderer.geographicLabelInputs = MapRenderer.prototype[
      'geographicLabelInputs' as keyof MapRenderer
    ] as unknown as typeof renderer.geographicLabelInputs;
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(false);
    expect(renderer.geographicLabelInputs().candidates.map(({ id }) => id)).toContain('dist.a');
    const cached = renderer.geographicLabelPriority;
    c.h.placeGeographicLabels();
    expect(renderer.geographicLabelPriority).toBe(cached);
    renderer.armyParts.clear();
    c.h.placeGeographicLabels();
    expect(c.container.visible).toBe(true);
  });
});

describe('bounded pure priority policy', () => {
  const rect = { x: 10, y: 10, width: 12, height: 12 };
  const candidate = { id: 'dist.a', kind: 'district' as const, rect, forced: false };
  it('uses literal four-CSS primary clearance and closed tangency remains visible', () => {
    expect(GEOGRAPHIC_PRIMARY_MARGIN).toBe(4);
    expect(
      prioritizeGeographicLabels([candidate], [{ x: 26, y: 10, width: 10, height: 10 }]).get(
        candidate.id,
      )?.visible,
    ).toBe(true);
    expect(
      prioritizeGeographicLabels([candidate], [{ x: 25.999, y: 10, width: 10, height: 10 }]).get(
        candidate.id,
      )?.reason,
    ).toBe('primary-collision');
  });
  it('retains forced names/provinces independently of input ordering and never mutates inputs', () => {
    const candidates = [
      candidate,
      { ...candidate, id: 'dist.forced', forced: true },
      { ...candidate, id: 'province.a', kind: 'province' as const },
    ];
    const primary = [rect];
    const before = structuredClone({ candidates, primary });
    const result = prioritizeGeographicLabels(candidates, primary);
    expect(result.get('dist.a')?.visible).toBe(false);
    expect(result.get('dist.forced')).toMatchObject({ visible: true, reason: 'interaction' });
    expect(result.get('province.a')?.visible).toBe(true);
    expect(prioritizeGeographicLabels([...candidates].reverse(), primary)).toEqual(result);
    expect({ candidates, primary }).toEqual(before);
  });
  it('fails open to existing names when budgets/measurement are invalid, not silent information loss', () => {
    for (const primary of [Array.from({ length: 2049 }, () => rect), [{ ...rect, x: NaN }]])
      expect(prioritizeGeographicLabels([candidate], primary).get(candidate.id)).toMatchObject({
        visible: true,
        reason: 'budget-fallback',
      });
    const candidates = Array.from({ length: 513 }, (_, i) => ({ ...candidate, id: `dist.${i}` }));
    expect(
      [...prioritizeGeographicLabels(candidates, [rect]).values()].every(
        (decision) => decision.visible && decision.reason === 'budget-fallback',
      ),
    ).toBe(true);
  });
});
