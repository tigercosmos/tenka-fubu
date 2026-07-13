import { describe, expect, it } from 'vitest';
import {
  createParticlePool,
  PARTICLE_POOL_LIMIT,
  type LineParticleRequest,
} from '@ui/map/sceneParts/particles';

function particle(overrides: Partial<LineParticleRequest> = {}): LineParticleRequest {
  return {
    pos: { x: 0, y: 0 },
    velocity: { x: 50, y: 0 },
    length: 6,
    width: 1.5,
    color: 0xb8862d,
    lifetimeMs: 400,
    ...overrides,
  };
}

describe('bounded particle pool（12 §3.3.7）', () => {
  it('容量硬上限為 128，超出的新粒子請求直接丟棄', () => {
    const pool = createParticlePool(999);
    const requests = Array.from({ length: PARTICLE_POOL_LIMIT + 12 }, () => particle());

    expect(pool.capacity).toBe(PARTICLE_POOL_LIMIT);
    expect(pool.spawn(requests, 0)).toBe(PARTICLE_POOL_LIMIT);
    expect(pool.activeCount).toBe(PARTICLE_POOL_LIMIT);
    expect(pool.spawn([particle()], 0)).toBe(0);
    pool.destroy();
  });

  it('由顯式時間決定位置與線性 alpha，400ms 到期即清理並重用槽位', () => {
    const pool = createParticlePool(1);
    expect(pool.spawn([particle({ pos: { x: 10, y: 20 } })], 0)).toBe(1);
    expect(pool.snapshot()[0]).toMatchObject({ x: 10, y: 20, alpha: 1 });

    pool.advanceTo(200);
    expect(pool.snapshot()[0]?.x).toBeCloseTo(20, 10);
    expect(pool.snapshot()[0]?.y).toBeCloseTo(20, 10);
    expect(pool.snapshot()[0]?.alpha).toBeCloseTo(0.5, 10);

    pool.advanceTo(400);
    expect(pool.activeCount).toBe(0);
    expect(pool.snapshot()).toEqual([]);
    expect(pool.spawn([particle()], 400)).toBe(1);
    expect(pool.activeCount).toBe(1);

    pool.clear();
    expect(pool.activeCount).toBe(0);
    pool.destroy();
    expect(pool.destroyed).toBe(true);
    expect(() => pool.destroy()).not.toThrow();
  });
});
