import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses();
});
import { MapRenderer } from './MapRenderer';

type Rect = { x: number; y: number; width: number; height: number };
type Input = { id: string; rect: Rect; tier?: 'main' | 'branch'; forced?: boolean };

/** Actual renderer method with screen-space stand-ins, not font or GPU pixel proof. */
function declutter(inputs: readonly Input[], labels: readonly { id: string; rect: Rect }[] = []) {
  const entries = new Map(
    inputs.map(({ id, rect, tier = 'main', forced = false }) => [
      id,
      {
        part: { getRibbonSize: () => ({ w: rect.width, h: rect.height }) },
        pos: { x: rect.x + rect.width / 2, y: rect.y - (tier === 'main' ? 24 : 18) },
        tier,
        warning: forced ? 'critical' : 'none',
        isPlayer: false,
        lodVisible: true,
        cullVisible: true,
        declutterHidden: false,
      },
    ]),
  );
  const renderer = {};
  Object.setPrototypeOf(renderer, MapRenderer.prototype);
  const labelParts = new Map(
    labels.map(({ id, rect }) => [
      id,
      {
        kind: 'district',
        pos: { x: rect.x + rect.width / 2, y: rect.y },
        baselineGap: 0,
        // These supplied rectangles already include the original 2px paint envelope.
        text: { width: rect.width, height: rect.height, style: { stroke: { width: 2 } } },
        lodVisible: true,
        cullVisible: true,
        declutterHidden: false,
      },
    ]),
  );
  Object.assign(renderer, {
    app: { screen: { width: 1280, height: 720 } },
    camera: {
      getState: () => ({ scale: 1 }),
      worldToScreen: (point: { x: number; y: number }) => point,
      sceneToScreen: (point: { x: number; y: number }) => point,
    },
    nameplateParts: entries,
    labelParts,
    view: { selection: null },
    marchTargetId: null,
  });
  const run: unknown = Reflect.get(renderer, 'runLabelDeclutter');
  if (typeof run !== 'function') throw new Error('Missing actual renderer declutter method');
  Reflect.apply(run, renderer, []);
  return new Map([...entries, ...labelParts].map(([id, entry]) => [id, entry.declutterHidden]));
}

const gifu = { id: 'castle.gifu', rect: { x: 392.1, y: 310.5, width: 121.8, height: 20 } };
const sunpu = {
  id: 'castle.sunpu',
  forced: true,
  rect: { x: 573.8380001831056, y: 372, width: 132.32399963378907, height: 20 },
};

describe('actual castle ribbon declutter narrowphase', () => {
  it('preserves a geographic label disjoint from a ribbon within their shared cell', () => {
    const result = declutter(
      [{ id: 'castle.a', rect: { x: 10, y: 10, width: 20, height: 20 } }],
      [{ id: 'district.a', rect: { x: 35, y: 35, width: 10, height: 10 } }],
    );
    expect(result.get('castle.a')).toBe(false);
    expect(result.get('district.a')).toBe(false);
  });
  it('hides a district label actually intersecting the higher-priority castle ribbon', () => {
    const result = declutter(
      [{ id: 'castle.a', rect: { x: 10, y: 10, width: 20, height: 20 } }],
      [{ id: 'district.a', rect: { x: 25, y: 25, width: 10, height: 10 } }],
    );
    expect(result.get('castle.a')).toBe(false);
    expect(result.get('district.a')).toBe(true);
  });
  it('retains the original geographic-text density within a shared cell', () => {
    const result = declutter(
      [],
      [
        { id: 'district.a', rect: { x: 10, y: 10, width: 10, height: 10 } },
        { id: 'district.b', rect: { x: 35, y: 35, width: 10, height: 10 } },
      ],
    );
    expect(result.get('district.a')).toBe(false);
    expect(result.get('district.b')).toBe(true);
  });
  it('keeps actual operational Gifu and forced Sunpu eligible despite shared cell 8:5 and zero rectangle overlap', () => {
    const cells = (rect: Rect) => {
      const result = [];
      for (let x = Math.floor(rect.x / 64); x <= Math.floor((rect.x + rect.width) / 64); x++)
        for (let y = Math.floor(rect.y / 64); y <= Math.floor((rect.y + rect.height) / 64); y++)
          result.push(`${x}:${y}`);
      return result;
    };
    expect(cells(gifu.rect)).toContain('8:5');
    expect(cells(sunpu.rect)).toContain('8:5');
    expect(gifu.rect.x + gifu.rect.width).toBeLessThan(sunpu.rect.x);
    expect(gifu.rect.y + gifu.rect.height).toBeLessThan(sunpu.rect.y);
    const result = declutter([gifu, sunpu]);
    expect(result.get(gifu.id)).toBe(false);
    expect(result.get(sunpu.id)).toBe(false);
  });
  it('still hides a genuinely overlapping lower-priority branch', () => {
    const result = declutter([
      { id: 'castle.z-main', rect: { x: 100, y: 100, width: 120, height: 20 } },
      { id: 'castle.a-branch', tier: 'branch', rect: { x: 200, y: 110, width: 80, height: 16 } },
    ]);
    expect(result.get('castle.z-main')).toBe(false);
    expect(result.get('castle.a-branch')).toBe(true);
  });
  it('preserves forced eligibility even for genuinely overlapping forced ribbons', () => {
    const rect = { x: 100, y: 100, width: 100, height: 20 };
    const result = declutter([
      { id: 'castle.a', rect },
      { id: 'castle.b', rect, forced: true },
      { id: 'castle.c', rect, forced: true },
    ]);
    expect(result.get('castle.a')).toBe(true);
    expect(result.get('castle.b')).toBe(false);
    expect(result.get('castle.c')).toBe(false);
  });
  it('does not hide edge-only horizontal or vertical contacts', () => {
    const result = declutter([
      { id: 'castle.a', rect: { x: 100, y: 100, width: 100, height: 20 } },
      { id: 'castle.b', rect: { x: 200, y: 100, width: 100, height: 20 } },
      { id: 'castle.c', rect: { x: 100, y: 120, width: 100, height: 20 } },
    ]);
    expect([...result.values()]).toEqual([false, false, false]);
  });
  it('retains same-priority ID ordering independent of insertion order', () => {
    const inputs = [
      { id: 'castle.b', rect: { x: 100, y: 100, width: 100, height: 20 } },
      { id: 'castle.a', rect: { x: 110, y: 100, width: 100, height: 20 } },
    ];
    const original = declutter(inputs),
      reversed = declutter([...inputs].reverse());
    expect(original.get('castle.a')).toBe(false);
    expect(original.get('castle.b')).toBe(true);
    expect([...original].sort()).toEqual([...reversed].sort());
  });
});
