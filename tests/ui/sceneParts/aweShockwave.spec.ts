import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { TOKENS_NUM } from '@ui/styles/tokens';
import {
  AWE_SHOCKWAVE_GEOMETRY,
  AWE_SHOCKWAVE_TIMING,
  aweShockwaveFrame,
  createAweShockwave,
  drawAweShockwave,
  type AweShockwaveProps,
} from '@ui/map/sceneParts/aweShockwave';
import { makeRec } from './recordingGraphics';

function props(overrides: Partial<AweShockwaveProps> = {}): AweShockwaveProps {
  return {
    pos: { x: 100, y: 200 },
    impactRadius: 120,
    level: 'small',
    elapsedMs: 0,
    affectedNodes: [{ pos: { x: 130, y: 240 }, colorIndex: 5 }],
    reduceMotion: false,
    flashBounds: { x: -400, y: -300, width: 800, height: 600 },
    ...overrides,
  };
}

describe('AweShockwave timeline（12 §3.3.6）', () => {
  it('主環由半徑 8、線寬 4、alpha 0.9 以 easeOutQuad 擴散', () => {
    const start = aweShockwaveFrame(props());
    expect(start.rings).toHaveLength(1);
    expect(start.rings[0]).toEqual({
      radius: AWE_SHOCKWAVE_GEOMETRY.startRadius,
      width: AWE_SHOCKWAVE_GEOMETRY.mainStartWidth,
      alpha: 0.9,
    });

    const middle = aweShockwaveFrame(props({ elapsedMs: 400 }));
    expect(middle.rings[0]?.radius).toBeCloseTo(92, 10);
    expect(middle.rings[0]?.width).toBeCloseTo(2.5, 10);
    expect(middle.rings[0]?.alpha).toBeCloseTo(0.45, 10);
  });

  it('小／中威風在 150ms 加第二環；大威風在 300ms 再加第三環', () => {
    expect(aweShockwaveFrame(props({ level: 'small', elapsedMs: 149 })).rings).toHaveLength(1);
    expect(aweShockwaveFrame(props({ level: 'small', elapsedMs: 150 })).rings).toHaveLength(2);
    expect(aweShockwaveFrame(props({ level: 'medium', elapsedMs: 300 })).rings).toHaveLength(2);
    expect(aweShockwaveFrame(props({ level: 'large', elapsedMs: 299 })).rings).toHaveLength(2);
    expect(aweShockwaveFrame(props({ level: 'large', elapsedMs: 300 })).rings).toHaveLength(3);
  });

  it('受影響節點在 300–600ms 閃色，整個效果在 800ms 清理', () => {
    expect(aweShockwaveFrame(props({ elapsedMs: 299 })).affectedNodeProgress).toBeNull();
    expect(aweShockwaveFrame(props({ elapsedMs: 300 })).affectedNodeProgress).toBe(0);
    expect(aweShockwaveFrame(props({ elapsedMs: 450 })).affectedNodeProgress).toBe(0.5);
    expect(aweShockwaveFrame(props({ elapsedMs: 600 })).affectedNodeProgress).toBeNull();

    const complete = aweShockwaveFrame(props({ elapsedMs: AWE_SHOCKWAVE_TIMING.durationMs }));
    expect(complete.complete).toBe(true);
    expect(complete.rings).toEqual([]);
    expect(complete.affectedNodeProgress).toBeNull();
  });

  it('大威風前 120ms 疊 4% washi 全畫面閃光', () => {
    const { rec, g } = makeRec();
    drawAweShockwave(g, props({ level: 'large', elapsedMs: 60 }));
    expect(rec.countOf('rect')).toBe(1);
    const flashFill = rec.argsOf('fill').at(-1)?.[0] as { color: number; alpha: number };
    expect(flashFill).toEqual({ color: TOKENS_NUM.washi100, alpha: 0.04 });
    expect(aweShockwaveFrame(props({ level: 'large', elapsedMs: 120 })).screenFlashAlpha).toBe(0);
  });

  it('reduce-motion 改為 600ms 靜態金環與同步淡變色，不畫擴散環或閃光', () => {
    const middle = aweShockwaveFrame(props({ level: 'large', elapsedMs: 300, reduceMotion: true }));
    expect(middle.rings).toEqual([
      {
        radius: AWE_SHOCKWAVE_GEOMETRY.startRadius,
        width: AWE_SHOCKWAVE_GEOMETRY.mainStartWidth,
        alpha: 0.9,
      },
    ]);
    expect(middle.affectedNodeProgress).toBe(0.5);
    expect(middle.screenFlashAlpha).toBe(0);
    expect(
      aweShockwaveFrame(
        props({ elapsedMs: AWE_SHOCKWAVE_TIMING.reducedDurationMs, reduceMotion: true }),
      ).complete,
    ).toBe(true);
  });
});

describe('createAweShockwave', () => {
  it('定位、相同 props 冪等，結束幀清空並可安全銷毀', () => {
    const part = createAweShockwave();
    const graphics = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(graphics, 'clear');
    const initial = props();

    part.update(initial);
    expect(part.container.position.x).toBe(100);
    expect(part.container.position.y).toBe(200);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...initial });
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...initial, elapsedMs: AWE_SHOCKWAVE_TIMING.durationMs });
    expect(clearSpy).toHaveBeenCalledTimes(2);

    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(() => part.destroy()).not.toThrow();
  });
});
