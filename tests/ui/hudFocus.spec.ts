import { describe, expect, it } from 'vitest';
import {
  hudFocusTarget,
  measuredFocusViewport,
  validFocusViewport,
} from '../../src/ui/map/hudFocus';

describe('measured HUD focus framing', () => {
  it('uses actual CSS bounds at three UI scales without applying scale or DPR twice', () => {
    for (const uiScale of [0.8, 1, 1.5]) {
      const canvas = { left: 20, top: 30, width: 1280, height: 720 };
      const topHeight = 48 * uiScale;
      const leftWidth = 64 * uiScale;
      const safe = measuredFocusViewport(canvas, {
        top: { left: 20, top: 30, width: 1280, height: topHeight },
        left: { left: 20, top: 100, width: leftWidth, height: 400 },
        bottom: { left: 20, top: 630, width: 1280, height: 120 },
        right: [{ left: 1080, top: 250, width: 192, height: 192 }],
      });
      expect(safe).toEqual({
        x: leftWidth + 12,
        y: topHeight + 12,
        width: 1048 - leftWidth - 12,
        height: 588 - topHeight - 12,
      });
      if (safe === null) throw new Error('Expected usable measured bounds');
      const target = { x: 3900, y: 2100 };
      for (const finalScale of [0.75, 2.5]) {
        const center = hudFocusTarget(target, canvas, safe, finalScale);
        expect((target.x - center.x) * finalScale + 640).toBeCloseTo(safe.x + safe.width / 2);
        expect((target.y - center.y) * finalScale + 360).toBeCloseTo(safe.y + safe.height / 2);
      }
    }
  });

  it('ignores hidden and off-canvas HUD and falls back for unusable or stale bounds', () => {
    const canvas = { left: 0, top: 0, width: 800, height: 600 };
    expect(
      measuredFocusViewport(canvas, {
        right: [
          { left: 0, top: 0, width: 0, height: 0 },
          { left: 900, top: 0, width: 30, height: 30 },
        ],
      }),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(
      measuredFocusViewport(canvas, { right: [{ left: 5, top: 0, width: 30, height: 30 }] }),
    ).toBeNull();
    expect(validFocusViewport({ x: 100, y: 0, width: 700, height: 600 }, 640, 480)).toBeNull();
    expect(validFocusViewport({ x: NaN, y: 0, width: 100, height: 100 }, 800, 600)).toBeNull();
    const target = { x: 10, y: 20 };
    expect(hudFocusTarget(target, canvas, { x: -1, y: 0, width: 100, height: 100 }, 2)).toEqual(
      target,
    );
    expect(hudFocusTarget(target, canvas, null, 2)).toEqual(target);
    expect(hudFocusTarget(target, canvas, { x: 0, y: 0, width: 100, height: 100 }, 0)).toEqual(
      target,
    );
    expect(target).toEqual({ x: 10, y: 20 });
  });

  it('returns independent measured values without mutating DOM snapshots', () => {
    const canvas = Object.freeze({ left: 0, top: 0, width: 800, height: 600 });
    const right = Object.freeze({ left: 650, top: 300, width: 150, height: 150 });
    expect(measuredFocusViewport(canvas, { right: [right] })).toEqual({
      x: 0,
      y: 0,
      width: 638,
      height: 600,
    });
    expect(right.left).toBe(650);
  });
});
