import { describe, expect, it } from 'vitest';
import { prepareMountainRiverContact } from '@ui/map/terrain/mountainRiverContact';

const river = [{ id: 'river', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, radius: 2 }];
describe('pure river-relative relief attenuation (not native valley proof)', () => {
  it('recovers with independent C2 polynomial and never strengthens coverage', () => {
    const gain = prepareMountainRiverContact(river);
    expect(gain({ x: 50, y: 2 })).toBe(0);
    expect(gain({ x: 50, y: 6 })).toBe(0.5);
    expect(gain({ x: 50, y: 10 })).toBe(1);
    let previous = 0;
    for (let y = 2; y <= 12; y += 0.125) {
      const value = gain({ x: 50, y });
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });
  it('uses closed caps and a zero-length capsule disk, independent of direction', () => {
    const gain = prepareMountainRiverContact(river);
    const reversed = prepareMountainRiverContact([
      { ...river[0]!, a: river[0]!.b, b: river[0]!.a },
    ]);
    expect(gain({ x: -6, y: 0 })).toBe(0.5);
    expect(reversed({ x: -6, y: 0 })).toBe(0.5);
    const disk = prepareMountainRiverContact([
      { id: 'disk', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, radius: 2 },
    ]);
    expect(disk({ x: 0, y: 6 })).toBe(0.5);
  });
  it('uses union bank distance rather than adding overlapping attenuation', () => {
    const gain = prepareMountainRiverContact([...river, ...river]);
    expect(gain({ x: 50, y: 6 })).toBe(0.5);
  });
  it('certifies the full bilinear basis support and leaves outside support unchanged', () => {
    const gain = prepareMountainRiverContact(river);
    const support = { width: 0.6, height: 0.8 }; // Full center-relative support radius = 1.
    expect(gain({ x: 50, y: 5.5 }, support)).toBe(0.5);
    expect(gain({ x: 50, y: 9 }, support)).toBe(1);
    expect(gain({ x: 50, y: 9.1 }, support)).toBe(1);
    for (let y = 2; y < 10; y += 0.1) {
      if (gain({ x: 50, y }, support) < 1) {
        for (const dy of [-support.height, support.height])
          expect(Math.abs(y + dy) - 2).toBeLessThan(8);
      }
    }
  });
  it('copies inputs and captures actual Tenryu/Kiso ridge contact without changing geography', () => {
    const capsules = [
      { id: 'rv.tenryu', a: { x: 2210, y: 2740 }, b: { x: 2200, y: 2850 }, radius: 1.2 },
    ];
    const before = JSON.stringify(capsules);
    const gain = prepareMountainRiverContact(capsules);
    expect(gain({ x: 2207, y: 2773 })).toBe(0);
    expect(gain({ x: 2201.25, y: 2836.25 })).toBe(0);
    expect(JSON.stringify(capsules)).toBe(before);
    capsules[0]!.radius = 0;
    expect(gain({ x: 2208, y: 2773 })).toBe(0);
  });
  it('fails to identity for invalid/oversized contacts, points, or filter support', () => {
    expect(prepareMountainRiverContact([])({ x: 0, y: 0 })).toBe(1);
    expect(
      prepareMountainRiverContact(Array.from({ length: 65 }, () => river[0]!))({ x: 0, y: 0 }),
    ).toBe(1);
    expect(prepareMountainRiverContact([{ ...river[0]!, radius: -1 }])({ x: 0, y: 0 })).toBe(1);
    expect(
      prepareMountainRiverContact([{ ...river[0]!, a: { x: Infinity, y: 0 } }])({ x: 0, y: 0 }),
    ).toBe(1);
    const gain = prepareMountainRiverContact(river);
    expect(gain({ x: NaN, y: 0 })).toBe(1);
    expect(gain({ x: 0, y: 0 }, { width: -1, height: 1 })).toBe(1);
    expect(gain({ x: 0, y: 0 }, { width: 8, height: 0 })).toBe(1);
  });
});
