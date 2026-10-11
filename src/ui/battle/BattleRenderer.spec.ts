import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleView } from './battleViewModel';

const mock = vi.hoisted(() => ({
  apps: [] as {
    canvas: HTMLCanvasElement;
    destroyed: boolean;
    renders: number;
    stage: { children: unknown[] };
    renderer: { resolution: number; resize: ReturnType<typeof vi.fn> };
    initOptions: unknown;
  }[],
  blockInit: false,
  release: null as (() => void) | null,
  graphics: [] as { calls: unknown[][]; destroyed: boolean }[],
  labels: [] as { text: string; destroyed: boolean; scale: { set: ReturnType<typeof vi.fn> } }[],
}));

vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = [];
    parent: Container | null = null;
    label = '';
    eventMode = '';
    destroyed = false;
    scale = { set: vi.fn() };
    position = { set: vi.fn() };
    addChild<T extends Container>(child: T): T {
      this.children.push(child);
      child.parent = this;
      return child;
    }
    removeChild(child: Container): void {
      this.children = this.children.filter((c) => c !== child);
      child.parent = null;
    }
    destroy(options?: { children?: boolean }): void {
      this.destroyed = true;
      if (options?.children) for (const child of this.children) child.destroy(options);
      this.children = [];
    }
  }
  class Graphics extends Container {
    calls: unknown[][] = [];
    constructor() {
      super();
      mock.graphics.push(this);
    }
    clear(): this {
      this.calls = [];
      return this;
    }
    moveTo(...a: unknown[]): this {
      this.calls.push(['moveTo', ...a]);
      return this;
    }
    lineTo(...a: unknown[]): this {
      this.calls.push(['lineTo', ...a]);
      return this;
    }
    stroke(...a: unknown[]): this {
      this.calls.push(['stroke', ...a]);
      return this;
    }
    fill(...a: unknown[]): this {
      this.calls.push(['fill', ...a]);
      return this;
    }
    circle(...a: unknown[]): this {
      this.calls.push(['circle', ...a]);
      return this;
    }
    poly(...a: unknown[]): this {
      this.calls.push(['poly', ...a]);
      return this;
    }
    rect(...a: unknown[]): this {
      this.calls.push(['rect', ...a]);
      return this;
    }
    roundRect(...a: unknown[]): this {
      this.calls.push(['roundRect', ...a]);
      return this;
    }
  }
  class BitmapText extends Container {
    text: string;
    anchor = { set: vi.fn() };
    constructor(options: { text: string }) {
      super();
      this.text = options.text;
      mock.labels.push(this);
    }
  }
  class Application {
    canvas = document.createElement('canvas');
    stage = new Container();
    screen = { width: 1, height: 1 };
    destroyed = false;
    renders = 0;
    initOptions: unknown;
    renderer = {
      resolution: 1,
      resize: vi.fn((w: number, h: number, resolution: number) => {
        this.screen = { width: w, height: h };
        this.renderer.resolution = resolution;
      }),
    };
    constructor() {
      mock.apps.push(this);
    }
    async init(options: { resolution: number }): Promise<void> {
      this.initOptions = options;
      this.renderer.resolution = options.resolution;
      if (mock.blockInit)
        await new Promise<void>((resolve) => {
          mock.release = resolve;
        });
    }
    render(): void {
      this.renders++;
    }
    destroy(): void {
      this.destroyed = true;
      this.canvas.remove();
      this.stage.destroy({ children: true });
    }
  }
  return { Application, Container, Graphics, BitmapText };
});
import { BattleRenderer } from './BattleRenderer';
import { TOKENS_NUM } from '../styles/tokens';
import { UI } from '../uiConstants';

const view = (): BattleView => ({
  width: 380,
  height: 444,
  uiScale: 1,
  glyphScale: 1,
  nodes: [
    {
      id: 'jin.a',
      x: 60,
      y: 84,
      owner: 'attacker',
      isHonjin: true,
      flagPower: 50,
      flagPowerMax: 100,
      defenseBonus: 0.2,
      glyphBox: { x: 30, y: 64, width: 60, height: 64 },
      hitBox: { x: 30, y: 64, width: 60, height: 64 },
    },
    {
      id: 'jin.b',
      x: 320,
      y: 360,
      owner: 'defender',
      isHonjin: false,
      flagPower: 100,
      flagPowerMax: 100,
      defenseBonus: 0,
      glyphBox: { x: 290, y: 340, width: 60, height: 64 },
      hitBox: { x: 290, y: 340, width: 60, height: 64 },
    },
  ],
  edges: [{ a: 'jin.a', b: 'jin.b', from: { x: 60, y: 84 }, to: { x: 320, y: 360 }, moveCost: 2 }],
  units: [
    {
      id: 'bu.a',
      x: 60,
      y: 44,
      side: 'attacker',
      troops: 3000,
      morale: 80,
      routed: false,
      selected: true,
      jinId: 'jin.a',
      moveTargetJinId: null,
      anchorX: 60,
      anchorY: 84,
      glyphBox: { x: 30, y: 24, width: 60, height: 56 },
      hitBox: { x: 30, y: 24, width: 60, height: 56 },
    },
    {
      id: 'bu.b',
      x: 320,
      y: 320,
      side: 'defender',
      troops: 4000,
      morale: 30,
      routed: true,
      selected: false,
      jinId: 'jin.b',
      moveTargetJinId: null,
      anchorX: 320,
      anchorY: 360,
      glyphBox: { x: 290, y: 300, width: 60, height: 56 },
      hitBox: { x: 290, y: 300, width: 60, height: 56 },
    },
  ],
});

beforeEach(() => {
  mock.apps.length = 0;
  mock.graphics.length = 0;
  mock.labels.length = 0;
  mock.blockInit = false;
  mock.release = null;
});
afterEach(() => vi.unstubAllGlobals());
describe('isolated tactical renderer lifecycle', () => {
  it('destroys initialized GPU allocation when post-init scene setup fails', async () => {
    const renderer = new BattleRenderer(),
      host = document.createElement('div');
    vi.spyOn(host, 'appendChild').mockImplementation(() => {
      throw new Error('Host removed');
    });
    await expect(renderer.init(host)).rejects.toThrow('Host removed');
    expect(mock.apps[0]!.destroyed).toBe(true);
    expect(host.childElementCount).toBe(0);
    expect(renderer.getDiagnostics()).toMatchObject({ ready: false, disposed: true, labels: 0 });
    renderer.destroy();
  });
  it('draws authored edges, both unit sides, HQ, routed and selected channels plus numeric labels', async () => {
    const renderer = new BattleRenderer(),
      host = document.createElement('div');
    const data = view(),
      original = JSON.stringify(data);
    renderer.update(data);
    await renderer.init(host);
    expect(renderer.getDiagnostics()).toMatchObject({
      ready: true,
      nodes: 2,
      edges: 1,
      units: 2,
      labels: 4,
      ownedTickerListeners: 0,
      tickerStarted: false,
    });
    expect(mock.apps[0]!.initOptions).toMatchObject({ autoStart: false, sharedTicker: false });
    expect(host.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
    const calls = mock.graphics[0]!.calls;
    expect(calls).toContainEqual(['lineTo', 320, 360]);
    expect(calls).toContainEqual(['stroke', { color: TOKENS_NUM.accentGold, width: 3 }]);
    expect(mock.labels.map((l) => l.text)).toEqual(['本陣 50', '100', '3,000', '4,000']);
    const retained = [...mock.labels];
    renderer.update({ ...data, units: [] });
    expect(retained.slice(2).every((part) => part.destroyed)).toBe(true);
    expect(mock.labels).toHaveLength(4); // Retained node labels are reused, not recreated.
    expect(JSON.stringify(data)).toBe(original);
    renderer.destroy();
    renderer.destroy();
    expect(mock.apps[0]!.destroyed).toBe(true);
    expect(mock.graphics[0]!.destroyed).toBe(true);
    expect(mock.labels.every((part) => part.destroyed)).toBe(true);
    expect(host.childElementCount).toBe(0);
  });
  it.each([1, 2, 4])(
    'caps device DPR%s during init/update and releases its canvas',
    async (deviceDpr) => {
      vi.stubGlobal('devicePixelRatio', deviceDpr);
      const renderer = new BattleRenderer(),
        host = document.createElement('div');
      const data = view(),
        original = JSON.stringify(data);
      await renderer.init(host);
      const resolution = Math.min(deviceDpr, UI.uiDprMax);
      expect(mock.apps[0]!.initOptions).toMatchObject({ resolution, autoDensity: true });
      renderer.update(data);
      expect(mock.apps[0]!.renderer.resize).toHaveBeenLastCalledWith(
        data.width,
        data.height,
        resolution,
      );
      expect(renderer.getDiagnostics().resolution).toBe(resolution);
      expect(JSON.stringify(data)).toBe(original);
      renderer.destroy();
      renderer.destroy();
      expect(mock.apps[0]!.destroyed).toBe(true);
      expect(mock.graphics[0]!.destroyed).toBe(true);
      expect(mock.labels.every((part) => part.destroyed)).toBe(true);
      expect(host.childElementCount).toBe(0);
    },
  );
  it('resizes only on capped size/DPR changes and renders static snapshots without time or subscriptions', async () => {
    const renderer = new BattleRenderer();
    await renderer.init(document.createElement('div'));
    renderer.update(view());
    renderer.update(view());
    expect(mock.apps[0]!.renderer.resize).toHaveBeenCalledTimes(1);
    vi.stubGlobal('devicePixelRatio', 2);
    renderer.update(view());
    expect(mock.apps[0]!.renderer.resize).toHaveBeenLastCalledWith(380, 444, 2);
    const calls = mock.apps[0]!.renderer.resize.mock.calls.length;
    vi.stubGlobal('devicePixelRatio', 4);
    renderer.update(view());
    expect(mock.apps[0]!.renderer.resize).toHaveBeenCalledTimes(calls);
    renderer.update({ ...view(), width: 600 });
    expect(mock.apps[0]!.renderer.resize).toHaveBeenLastCalledWith(600, 444, 2);
    expect(renderer.getDiagnostics().renderCount).toBe(5);
    renderer.destroy();
  });
  it('keeps text at least12 physical pixels while fitting graphical glyphs', async () => {
    const renderer = new BattleRenderer();
    await renderer.init(document.createElement('div'));
    renderer.update({ ...view(), uiScale: 1.5, glyphScale: 0.8 });
    expect(mock.labels.every((part) => part.scale.set.mock.lastCall?.[0] === 1)).toBe(true);
    expect(mock.graphics[0]!.calls).toContainEqual(['lineTo', 60, 84]);
    renderer.destroy();
  });
  it('owns pending async initialization and never attaches a canvas after disposal', async () => {
    mock.blockInit = true;
    const renderer = new BattleRenderer(),
      host = document.createElement('div');
    const first = renderer.init(host),
      second = renderer.init(host);
    expect(first).toBe(second);
    const initializedRenderer = mock.apps[0]!.renderer;
    Object.defineProperty(mock.apps[0], 'renderer', { value: undefined, configurable: true });
    expect(renderer.getDiagnostics()).toMatchObject({
      ready: false,
      resolution: 0,
      tickerStarted: false,
    });
    Object.defineProperty(mock.apps[0], 'renderer', {
      value: initializedRenderer,
      configurable: true,
    });
    renderer.update(view());
    renderer.destroy();
    mock.release!();
    await first;
    expect(mock.apps).toHaveLength(1);
    expect(mock.apps[0]!.destroyed).toBe(true);
    expect(host.childElementCount).toBe(0);
    await renderer.init(host);
    renderer.update(view());
    expect(mock.apps).toHaveLength(1);
    expect(renderer.getDiagnostics()).toMatchObject({ ready: false, disposed: true, labels: 0 });
  });
});
