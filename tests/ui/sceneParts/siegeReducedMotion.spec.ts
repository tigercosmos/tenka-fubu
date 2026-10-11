import { describe, expect, it } from 'vitest';
import { drawSiegeMarker, siegeRotation } from '@ui/map/sceneParts/siegeMarker';
import { makeRec } from './recordingGraphics';

describe('static siege reduced-motion fallback', () => {
  it('projects its three mode arcs onto a shallow ground ellipse', () => {
    const { rec, g } = makeRec();
    drawSiegeMarker(g, { pos: { x: 0, y: 0 }, mode: 'assault', reducedMotion: true });
    expect(rec.countOf('arc')).toBe(0);
    expect(rec.countOf('moveTo')).toBe(3);
    expect(rec.countOf('lineTo')).toBeGreaterThan(30);
    const points = [...rec.argsOf('moveTo'), ...rec.argsOf('lineTo')] as number[][];
    for (const [x, y] of points)
      expect(Math.abs((x! / 24) ** 2 + ((y! - 4) / 8.64) ** 2 - 1)).toBeLessThan(1e-10);
  });
  it.each(['assault', 'encircle'] as const)(
    'keeps %s arcs static while preserving mode geometry',
    (mode) => {
      const first = makeRec(),
        later = makeRec();
      drawSiegeMarker(first.g, {
        pos: { x: 100, y: 200 },
        mode,
        elapsedMs: 0,
        reducedMotion: true,
      });
      drawSiegeMarker(later.g, {
        pos: { x: 100, y: 200 },
        mode,
        elapsedMs: 1750,
        reducedMotion: true,
      });
      expect(later.rec.calls).toEqual(first.rec.calls);
      expect(first.rec.countOf('moveTo')).toBe(mode === 'assault' ? 3 : 6);
      expect(siegeRotation(mode, 1750, true)).toBe(0);
      expect(siegeRotation(mode, 1750, false)).not.toBe(0);
      const moving = makeRec();
      drawSiegeMarker(moving.g, {
        pos: { x: 100, y: 200 },
        mode,
        elapsedMs: 1750,
        reducedMotion: false,
      });
      expect(moving.rec.calls).not.toEqual(first.rec.calls);
    },
  );
});
